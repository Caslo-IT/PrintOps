"""Activity logger service for recording printer and job events."""

from datetime import datetime, timezone
from .models import db, ActivityLog
from sqlalchemy.exc import SQLAlchemyError

def log_activity(printer_ip, event_type, message, details=None):
    """
    Log an activity event to the database.
    
    Args:
        printer_ip (str): IP address of the printer (can be None).
        event_type (str): Type of event (e.g., 'info', 'success', 'warning', 'error').
        message (str): Human-readable message.
        details (dict, optional): Additional JSON payload.
    """
    try:
        log_entry = ActivityLog(
            printer_ip=printer_ip,
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
        print(f"[ActivityLog Error] Failed to log: {event_type} - {message}")
