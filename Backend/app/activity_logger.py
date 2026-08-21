"""Activity logger service for recording printer and job events."""

from datetime import datetime, timezone
from .models import db, ActivityLog, PrintHistory
from sqlalchemy.exc import SQLAlchemyError

def log_activity(printer_ip, event_type, message, details=None, printer_name=None):
    """
    Log an activity event to the database.
    
    Args:
        printer_ip (str): IP address of the printer (can be None).
        event_type (str): Type of event (e.g., 'info', 'success', 'warning', 'error').
        message (str): Human-readable message.
        details (dict, optional): Additional JSON payload.
        printer_name (str, optional): Name of the printer.
    """
    try:
        log_entry = ActivityLog(
            printer_ip=printer_ip,
            printer_name=printer_name,
            event_type=event_type,
            message=message,
            details=details or {},
            created_at=datetime.now(timezone.utc)
        )
        db.session.add(log_entry)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        # Optionally log to stdout if DB fails

_printer_states = {}
_printer_progress = {}
# Stores the filament spool remaining_weight_g at the moment a print starts.
# Used by /printer/<ip>/print/progress to compute accurate layer-based deduction
# without double-counting the incremental delta deductions.
_printer_filament_baseline: dict = {}


def get_filament_baseline(ip: str):
    """Return the filament remaining weight (g) recorded when this printer started printing."""
    return _printer_filament_baseline.get(ip)


def set_filament_baseline(ip: str, weight_g: float):
    """Manually set the filament baseline (used when progress route reconstructs a missing snapshot)."""
    _printer_filament_baseline[ip] = weight_g


def clear_filament_baseline(ip: str):
    """Remove the baseline entry when a print ends."""
    _printer_filament_baseline.pop(ip, None)


def track_printer_state(ip, state_name, printer_name=None, progress=0.0, job_filename=None):
    """Track printer state, log activity, and manage PrintHistory on state changes."""
    if not ip or not state_name:
        return
    
    # Real-time filament deduction
    if state_name in ["printing", "completed"]:
        last_prog = _printer_progress.get(ip, 0.0)

        # Enforce 100% on completion if firmware didn't report it
        if state_name == "completed" and progress > 0 and progress < 100.0:
            progress = 100.0

        if progress > last_prog:
            delta_prog = progress - last_prog
            _printer_progress[ip] = progress

            if job_filename and delta_prog > 0:
                try:
                    from .models import Filament, GCodeFile

                    # Try matching by printer name first, then fall back to IP.
                    # The UI may store either the firmware name or the IP as
                    # assigned_printer_name depending on what was available at
                    # assignment time.
                    filament = None
                    if printer_name:
                        filament = Filament.query.filter_by(
                            assigned_printer_name=printer_name
                        ).first()
                    if filament is None:
                        # Fallback: user stored the IP as the assigned name
                        filament = Filament.query.filter_by(
                            assigned_printer_name=ip
                        ).first()

                    if filament:
                        clean_filename = job_filename.split("/")[-1]
                        gcode = GCodeFile.query.filter_by(filename=clean_filename).first()
                        if gcode and gcode.analysis and gcode.analysis.total_weight_g > 0:
                            deduction = gcode.analysis.total_weight_g * (delta_prog / 100.0)
                            filament.remaining_weight_g = max(
                                0.0, filament.remaining_weight_g - deduction
                            )
                            db.session.commit()
                except SQLAlchemyError:
                    db.session.rollback()

        elif progress < last_prog and state_name != "completed":
            # New print started on this printer — reset progress tracking
            _printer_progress[ip] = progress
            
    prev_state = _printer_states.get(ip)
    if prev_state != state_name:
        _printer_states[ip] = state_name
        
        try:
            # Handle PrintHistory
            if state_name == "printing":
                # Ensure no other open history for this printer
                active_history = PrintHistory.query.filter_by(printer_ip=ip, end_time=None).first()
                if active_history:
                    active_history.end_time = datetime.now(timezone.utc)
                    active_history.status = "stopped"
                
                new_history = PrintHistory(
                    printer_ip=ip,
                    printer_name=printer_name,
                    filename="Unknown File",  # Could be enhanced later if filename is passed
                    start_time=datetime.now(timezone.utc),
                    status="printing"
                )
                db.session.add(new_history)

                # Snapshot the filament spool weight at print start so that
                # /printer/<ip>/print/progress can compute an accurate remaining
                # value using layer stats rather than incremental deltas.
                try:
                    from .models import Filament
                    fl = None
                    if printer_name:
                        fl = Filament.query.filter_by(
                            assigned_printer_name=printer_name
                        ).first()
                    if fl is None:
                        fl = Filament.query.filter_by(
                            assigned_printer_name=ip
                        ).first()
                    if fl:
                        _printer_filament_baseline[ip] = fl.remaining_weight_g
                except Exception:
                    pass

            elif state_name in ["completed", "error", "idle"]:
                active_history = PrintHistory.query.filter_by(printer_ip=ip, end_time=None).order_by(PrintHistory.id.desc()).first()
                if active_history:
                    active_history.end_time = datetime.now(timezone.utc)
                    
                    from .models import PrintQueueItem, Filament
                    active_queue_item = PrintQueueItem.query.filter_by(printer_ip=ip, status="printing").first()
                    
                    if state_name == "completed":
                        active_history.status = "completed"
                        if active_queue_item:
                            active_queue_item.status = "completed"
                            active_queue_item.actual_completion_time = datetime.now(timezone.utc)
                    elif state_name == "error":
                        active_history.status = "error"
                        if active_queue_item:
                            active_queue_item.status = "failed"
                    elif state_name == "idle" and prev_state != "completed":
                        active_history.status = "stopped"
                        if active_queue_item:
                            active_queue_item.status = "cancelled"
            
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()

        # Only log if it's not the first time we see this printer (prev_state is not None)
        if prev_state is not None:
            if state_name == "error":
                log_activity(ip, "error", "Printer reported an error state.", printer_name=printer_name)
            elif state_name == "printing":
                log_activity(ip, "info", "Printer started printing.", printer_name=printer_name)
            elif state_name == "completed":
                log_activity(ip, "success", "Printer completed the print job.", printer_name=printer_name)
                clear_filament_baseline(ip)
            elif state_name == "paused":
                log_activity(ip, "warning", "Printer paused.", printer_name=printer_name)
            elif state_name == "idle" and prev_state != "completed":
                log_activity(ip, "info", "Printer is now idle.", printer_name=printer_name)
                clear_filament_baseline(ip)
            elif state_name == "error":
                clear_filament_baseline(ip)
