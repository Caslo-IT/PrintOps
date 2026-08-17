"""Print queue management service for job scheduling, priority order, printer availability, and completion time calculation."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from sqlalchemy.exc import SQLAlchemyError

from .gcode_storage import DatabaseUnavailable, StorageError
from .models import GCodeFile, PrintQueueItem, db
from .protocols import start_printer_print, upload_printer_file
from .services import scan_network
from .activity_logger import log_activity, track_printer_state


def init_queue_table():
    """Ensure database tables exist via SQLAlchemy."""
    try:
        db.create_all()
    except SQLAlchemyError as exc:
        raise DatabaseUnavailable(
            "Could not connect to PostgreSQL database. Check DATABASE_URL."
        ) from exc


def get_printers_with_availability(mock_printers=None):
    """Scan network or use provided printer list and compute remaining print time & availability.

    Returns a list of printer status dicts augmented with:
      - is_available: bool
      - remaining_sec: float
      - next_available_at: datetime (UTC)
    """
    now = datetime.now(timezone.utc)
    raw_printers = mock_printers if mock_printers is not None else scan_network()
    printers = []

    for p in raw_printers:
        ip = p.get("ip")
        state = (p.get("state") or "unknown").lower()
        progress = float(p.get("progress") or 0.0)

        if ip and state:
            track_printer_state(ip, state, p.get("name"))

        # Check if printer is actively printing an assigned queue item in DB
        active_item = None
        if ip:
            try:
                active_item = (
                    PrintQueueItem.query.filter(
                        PrintQueueItem.printer_ip == ip,
                        PrintQueueItem.status.in_(["printing", "assigned"]),
                    )
                    .order_by(PrintQueueItem.updated_at.desc())
                    .first()
                )
            except Exception:
                active_item = None

        estimated_duration = (
            active_item.estimated_duration_sec
            if active_item and active_item.estimated_duration_sec > 0
            else 0.0
        )

        is_idle = state in ["idle", "completed"] or progress >= 100.0
        is_available = is_idle and state != "error"

        if is_available:
            remaining_sec = 0.0
        else:
            printer_left_time = p.get("details", {}).get("printLeftTime")
            parsed_left_time = None
            if printer_left_time is not None:
                try:
                    parsed_left_time = float(printer_left_time)
                except (ValueError, TypeError):
                    pass
            
            if parsed_left_time is not None and parsed_left_time > 0:
                remaining_sec = parsed_left_time
            elif progress > 0 and progress < 100 and estimated_duration > 0:
                remaining_sec = estimated_duration * (1.0 - (progress / 100.0))
            else:
                remaining_sec = estimated_duration or 300.0

        next_available = now + timedelta(seconds=remaining_sec)

        printers.append({
            **p,
            "is_available": is_available,
            "available": is_available,
            "remaining_sec": round(remaining_sec, 2),
            "remaining_time_seconds": round(remaining_sec, 2),
            "next_available_at": next_available,
        })

    return printers


def schedule_print_queue(job_requests, mock_printers=None):
    """Schedule selected G-code files (local or printer-stored) into the queue using priority order and printer availability.

    job_requests: list of dicts, e.g. [{"gcode_file_id": 1, "priority": 1}, ...] or [{"printer_ip": "192.168.1.100", "printer_file_path": "/usr/data/printer_data/gcodes/test.gcode", "priority": 1}]
    """
    init_queue_table()

    if not isinstance(job_requests, list) or not job_requests:
        raise StorageError("JSON payload must contain a non-empty 'jobs' list")

    # Validate and fetch G-code files
    prepared_jobs = []
    for req in job_requests:
        gcode_file_id = req.get("gcode_file_id")
        printer_file_path = req.get("printer_file_path")
        req_printer_ip = req.get("printer_ip")
        filename = req.get("filename")
        priority = int(req.get("priority", 1))

        if not gcode_file_id and not printer_file_path:
            raise StorageError(
                "Each job request must contain either 'gcode_file_id' or 'printer_file_path'"
            )

        gcode_file = None
        duration = 0.0

        if gcode_file_id:
            gcode_file = db.session.get(GCodeFile, gcode_file_id)
            if not gcode_file:
                raise StorageError(f"G-code file ID {gcode_file_id} not found")
            duration = (
                gcode_file.analysis.total_time_sec
                if gcode_file.analysis
                else 0.0
            )
            filename = gcode_file.filename
        elif printer_file_path:
            if not filename:
                filename = printer_file_path.split("/")[-1]
            duration = float(req.get("estimated_duration_sec", 1800.0))

        prepared_jobs.append({
            "gcode_file": gcode_file,
            "printer_file_path": printer_file_path,
            "filename": filename,
            "requested_printer_ip": req_printer_ip,
            "priority": priority,
            "duration": duration,
        })

    # Sort primarily by priority ascending (1 = highest priority)
    prepared_jobs.sort(key=lambda item: item["priority"])

    # Discover printer availability
    printers = get_printers_with_availability(mock_printers)
    now = datetime.now(timezone.utc)

    # Track scheduled available time per printer IP
    printer_schedules = {}
    for p in printers:
        if p.get("ip"):
            printer_schedules[p["ip"]] = p["next_available_at"]

    created_items = []
    try:
        for job in prepared_jobs:
            gcode_file = job["gcode_file"]
            printer_file_path = job["printer_file_path"]
            filename = job["filename"]
            requested_ip = job["requested_printer_ip"]
            priority = job["priority"]
            duration = job["duration"]

            assigned_ip = requested_ip
            start_time = None
            completion_time = None
            status = "queued"

            if not assigned_ip and printer_schedules:
                # Find printer with earliest next_available_at time
                assigned_ip = min(
                    printer_schedules.keys(),
                    key=lambda ip: printer_schedules[ip],
                )

            if assigned_ip in printer_schedules:
                start_time = printer_schedules[assigned_ip]
                completion_time = start_time + timedelta(seconds=duration)
                printer_schedules[assigned_ip] = completion_time
                status = "assigned"
            elif assigned_ip:
                start_time = now
                completion_time = start_time + timedelta(seconds=duration)
                status = "assigned"

            item = PrintQueueItem(
                gcode_file_id=gcode_file.id if gcode_file else None,
                printer_file_path=printer_file_path,
                filename=filename,
                printer_ip=assigned_ip,
                priority=priority,
                status=status,
                estimated_duration_sec=duration,
                estimated_start_time=start_time,
                estimated_completion_time=completion_time,
                created_at=now,
                updated_at=now,
            )
            db.session.add(item)
            created_items.append(item)

        db.session.commit()
        for item in created_items:
            log_activity(
                item.printer_ip,
                "info",
                f"Job scheduled: {item.filename}",
                {"job_id": item.id, "priority": item.priority}
            )
        return [item.to_dict() for item in created_items]
    except SQLAlchemyError as exc:
        db.session.rollback()
        raise DatabaseUnavailable(
            "Could not save print queue items to database."
        ) from exc


def get_print_queue(status=None, printer_ip=None):
    """Retrieve queue items with options to filter by status or printer IP."""
    init_queue_table()
    try:
        query = PrintQueueItem.query
        if status:
            query = query.filter_by(status=status)
        if printer_ip:
            query = query.filter_by(printer_ip=printer_ip)

        query = query.order_by(
            PrintQueueItem.priority.asc(),
            PrintQueueItem.created_at.asc(),
        )
        records = query.all()
        return [item.to_dict() for item in records]
    except SQLAlchemyError as exc:
        raise DatabaseUnavailable(
            "Could not query print queue from database."
        ) from exc


def get_printers_queue_status(mock_printers=None):
    """Get printer operational status combined with their assigned upcoming queue items."""
    init_queue_table()
    printers = get_printers_with_availability(mock_printers)

    result = []
    for p in printers:
        ip = p.get("ip")
        assigned_items = []
        if ip:
            try:
                records = (
                    PrintQueueItem.query.filter(
                        PrintQueueItem.printer_ip == ip,
                        PrintQueueItem.status.in_(["assigned", "printing", "queued"]),
                    )
                    .order_by(
                        PrintQueueItem.priority.asc(),
                        PrintQueueItem.created_at.asc(),
                    )
                    .all()
                )
                assigned_items = [r.to_dict() for r in records]
            except SQLAlchemyError:
                pass

        result.append({
            **p,
            "next_available_at": (
                p["next_available_at"].isoformat()
                if isinstance(p.get("next_available_at"), datetime)
                else p.get("next_available_at")
            ),
            "assigned_queue_items": assigned_items,
            "assigned_queue_jobs": assigned_items,
            "remaining_time_seconds": p.get("remaining_time_seconds") or p.get("remaining_sec", 0.0),
        })

    return result


def update_queue_item(item_id, priority=None, status=None, printer_ip=None):
    """Update priority, status, or printer assignment of a queue item."""
    init_queue_table()
    try:
        item = db.session.get(PrintQueueItem, item_id)
        if not item:
            return None

        if priority is not None:
            item.priority = int(priority)
        if status is not None:
            allowed_statuses = [
                "queued",
                "assigned",
                "printing",
                "completed",
                "failed",
                "cancelled",
            ]
            if status not in allowed_statuses:
                raise StorageError(
                    f"status must be one of: {', '.join(allowed_statuses)}"
                )
            item.status = status
            if status == "printing" and not item.actual_start_time:
                item.actual_start_time = datetime.now(timezone.utc)
            elif status == "completed" and not item.actual_completion_time:
                item.actual_completion_time = datetime.now(timezone.utc)

        if printer_ip is not None:
            item.printer_ip = printer_ip if printer_ip.strip() else None

        item.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        if status is not None:
            log_activity(
                item.printer_ip,
                "error" if status in ["failed", "cancelled"] else "info",
                f"Job {item.filename} status changed to {status}",
                {"job_id": item.id, "status": status}
            )
        return item.to_dict()
    except StorageError:
        raise
    except SQLAlchemyError as exc:
        db.session.rollback()
        raise DatabaseUnavailable(
            "Could not update print queue item in database."
        ) from exc


def delete_queue_item(item_id):
    """Delete a print queue item by ID."""
    init_queue_table()
    try:
        item = db.session.get(PrintQueueItem, item_id)
        if not item:
            return None

        item_dict = item.to_dict()
        db.session.delete(item)
        db.session.commit()
        log_activity(
            item_dict.get("printer_ip"),
            "warning",
            f"Job {item_dict.get('filename')} removed from queue",
            {"job_id": item_id}
        )
        return item_dict
    except SQLAlchemyError as exc:
        db.session.rollback()
        raise DatabaseUnavailable(
            "Could not delete print queue item from database."
        ) from exc


def dispatch_queue_item(item_id, mock_printers=None):
    """Upload assigned G-code file (if local) and start print on assigned printer."""
    init_queue_table()

    item = db.session.get(PrintQueueItem, item_id)
    if not item:
        raise StorageError(f"Print queue item ID {item_id} not found")

    if not item.printer_ip:
        raise StorageError("No printer assigned to this queue item")

    # If the file is already stored on the printer's local storage
    if item.printer_file_path:
        remote_path = item.printer_file_path
        started = start_printer_print(item.printer_ip, remote_path)
        if not started and mock_printers is None:
            raise StorageError(
                f"Failed to start print on printer at {item.printer_ip}"
            )
    else:
        gcode_file = item.gcode_file
        if not gcode_file:
            raise StorageError("Associated G-code file is missing")

        path = Path(gcode_file.storage_path)
        if not path.exists():
            raise StorageError("G-code file is missing from disk")

        # Read G-code file bytes
        with open(path, "rb") as file:
            file_bytes = file.read()

        filename = path.name
        upload_res = upload_printer_file(item.printer_ip, filename, file_bytes)
        if upload_res is None and mock_printers is None:
            raise StorageError(
                f"Failed to upload G-code to printer at {item.printer_ip}"
            )

        remote_path = f"/usr/data/printer_data/gcodes/{filename}"
        started = start_printer_print(item.printer_ip, remote_path)
        if not started and mock_printers is None:
            raise StorageError(
                f"Failed to start print on printer at {item.printer_ip}"
            )

    now = datetime.now(timezone.utc)
    item.status = "printing"
    item.actual_start_time = now
    item.updated_at = now
    db.session.commit()

    log_activity(
        item.printer_ip,
        "success",
        f"Print started: {item.filename}",
        {"job_id": item.id}
    )

    return item.to_dict()
