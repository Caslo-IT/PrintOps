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

def track_printer_state(ip, state_name, printer_name=None):
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
            
            elif state_name in ["completed", "error", "idle"]:
                active_history = PrintHistory.query.filter_by(printer_ip=ip, end_time=None).order_by(PrintHistory.id.desc()).first()
                if active_history:
                    active_history.end_time = datetime.now(timezone.utc)
                    if state_name == "completed":
                        active_history.status = "completed"
                    elif state_name == "error":
                        active_history.status = "error"
                    elif state_name == "idle" and prev_state != "completed":
                        active_history.status = "stopped"
            
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
            elif state_name == "paused":
                log_activity(ip, "warning", "Printer paused.", printer_name=printer_name)
            elif state_name == "idle" and prev_state != "completed":
                log_activity(ip, "info", "Printer is now idle.", printer_name=printer_name)
