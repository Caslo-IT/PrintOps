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
                    if fl and ip not in _printer_filament_baseline:
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
