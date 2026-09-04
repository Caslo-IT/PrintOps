"""SQLAlchemy models and database instance for PrintOps."""

from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    """ORM model representing a user for authentication."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="user") # 'admin' or 'user'
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self):
        """Convert ORM model instance to dictionary representation."""
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AppSetting(db.Model):
    """Persistent application settings stored independently of environment defaults."""

    __tablename__ = "app_settings"

    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text, nullable=False)


class GCodeFile(db.Model):
    """ORM model representing stored G-code files."""

    __tablename__ = "gcode_files"

    id = db.Column(db.Integer, primary_key=True)
    folder_name = db.Column(db.Text, nullable=False)
    size_folder = db.Column(db.Text, nullable=False)
    filename = db.Column(db.Text, nullable=False)
    storage_path = db.Column(db.Text, nullable=False, unique=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    analysis = db.relationship(
        "GCodeAnalysis",
        backref="file",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        """Convert ORM model instance to dictionary representation."""
        return {
            "id": self.id,
            "folder": self.folder_name,
            "size": self.size_folder,
            "filename": self.filename,
            "path": self.storage_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "analysis": self.analysis.to_dict() if self.analysis else None,
        }


class GCodeAnalysis(db.Model):
    """ORM model representing extracted metrics and layer statistics of a G-code file."""

    __tablename__ = "gcode_analyses"

    id = db.Column(db.Integer, primary_key=True)
    gcode_file_id = db.Column(
        db.Integer,
        db.ForeignKey("gcode_files.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    total_time_sec = db.Column(db.Float, nullable=False, default=0.0)
    total_filament_mm = db.Column(db.Float, nullable=False, default=0.0)
    total_weight_g = db.Column(db.Float, nullable=False, default=0.0)
    filament_diameter_mm = db.Column(db.Float, nullable=False, default=1.75)
    filament_density_g_cm3 = db.Column(db.Float, nullable=False, default=1.10)
    layer_count = db.Column(db.Integer, nullable=False, default=0)
    layer_stats = db.Column(db.JSON, nullable=False, default=list)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self):
        """Convert ORM model instance to dictionary representation."""
        return {
            "id": self.id,
            "gcode_file_id": self.gcode_file_id,
            "total_time_sec": round(self.total_time_sec, 2),
            "total_time_mins": round(self.total_time_sec / 60.0, 2),
            "total_filament_mm": round(self.total_filament_mm, 2),
            "total_filament_m": round(self.total_filament_mm / 1000.0, 2),
            "total_weight_g": round(self.total_weight_g, 2),
            "filament_diameter_mm": self.filament_diameter_mm,
            "filament_density_g_cm3": self.filament_density_g_cm3,
            "layer_count": self.layer_count,
            "layer_stats": self.layer_stats,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PrintQueueItem(db.Model):
    """ORM model representing a scheduled or active item in the print queue."""

    __tablename__ = "print_queue_items"

    id = db.Column(db.Integer, primary_key=True)
    gcode_file_id = db.Column(
        db.Integer,
        db.ForeignKey("gcode_files.id", ondelete="CASCADE"),
        nullable=True,
    )
    printer_file_path = db.Column(db.Text, nullable=True)
    filename = db.Column(db.Text, nullable=True)
    printer_ip = db.Column(db.Text, nullable=True)
    printer_name = db.Column(db.Text, nullable=True)
    priority = db.Column(db.Integer, nullable=False, default=1)
    status = db.Column(db.String(50), nullable=False, default="queued")
    estimated_duration_sec = db.Column(db.Float, nullable=False, default=0.0)
    estimated_start_time = db.Column(db.DateTime(timezone=True), nullable=True)
    estimated_completion_time = db.Column(db.DateTime(timezone=True), nullable=True)
    actual_start_time = db.Column(db.DateTime(timezone=True), nullable=True)
    actual_completion_time = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    gcode_file = db.relationship(
        "GCodeFile",
        backref=db.backref("queue_items", cascade="all, delete-orphan"),
    )

    def to_dict(self):
        """Convert ORM model instance to dictionary representation."""
        file_info = None
        if self.gcode_file:
            file_info = self.gcode_file.to_dict()
        elif self.printer_file_path or self.filename:
            file_info = {
                "filename": self.filename or (self.printer_file_path.split("/")[-1] if self.printer_file_path else "Printer File"),
                "path": self.printer_file_path,
                "folder": "Printer Storage",
                "size": "—",
            }

        return {
            "id": self.id,
            "gcode_file_id": self.gcode_file_id,
            "printer_file_path": self.printer_file_path,
            "filename": self.filename,
            "printer_ip": self.printer_ip,
            "printer_name": self.printer_name,
            "priority": self.priority,
            "status": self.status,
            "estimated_duration_sec": round(self.estimated_duration_sec, 2),
            "estimated_duration_mins": round(self.estimated_duration_sec / 60.0, 2),
            "estimated_start_time": (
                self.estimated_start_time.isoformat()
                if self.estimated_start_time
                else None
            ),
            "estimated_completion_time": (
                self.estimated_completion_time.isoformat()
                if self.estimated_completion_time
                else None
            ),
            "actual_start_time": (
                self.actual_start_time.isoformat()
                if self.actual_start_time
                else None
            ),
            "actual_completion_time": (
                self.actual_completion_time.isoformat()
                if self.actual_completion_time
                else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "gcode_file": file_info,
        }


class ActivityLog(db.Model):
    """ORM model representing an activity log entry for printers and printing."""

    __tablename__ = "activity_logs"

    id = db.Column(db.Integer, primary_key=True)
    printer_ip = db.Column(db.Text, nullable=True)
    printer_name = db.Column(db.Text, nullable=True)
    event_type = db.Column(db.String(50), nullable=False, default="info")
    message = db.Column(db.Text, nullable=False)
    details = db.Column(db.JSON, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self):
        """Convert ORM model instance to dictionary representation."""
        return {
            "id": self.id,
            "printer_ip": self.printer_ip,
            "printer_name": self.printer_name,
            "event_type": self.event_type,
            "message": self.message,
            "details": self.details,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PrintHistory(db.Model):
    """ORM model representing the history of a print job."""

    __tablename__ = "print_history"

    id = db.Column(db.Integer, primary_key=True)
    printer_ip = db.Column(db.Text, nullable=True)
    printer_name = db.Column(db.Text, nullable=True)
    filename = db.Column(db.Text, nullable=True)
    start_time = db.Column(db.DateTime(timezone=True), nullable=True)
    end_time = db.Column(db.DateTime(timezone=True), nullable=True)
    status = db.Column(db.String(50), nullable=False, default="printing")
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self):
        """Convert ORM model instance to dictionary representation."""
        return {
            "id": self.id,
            "printer_ip": self.printer_ip,
            "printer_name": self.printer_name,
            "filename": self.filename,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Filament(db.Model):
    """ORM model representing a spool of filament."""

    __tablename__ = "filaments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    material = db.Column(db.String(50), nullable=False, default="PLA")
    color = db.Column(db.String(50), nullable=False, default="Black")
    total_weight_g = db.Column(db.Float, nullable=False, default=1000.0)
    remaining_weight_g = db.Column(db.Float, nullable=False, default=1000.0)
    assigned_printer_name = db.Column(db.Text, nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self):
        """Convert ORM model instance to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "material": self.material,
            "color": self.color,
            "total_weight_g": self.total_weight_g,
            "remaining_weight_g": self.remaining_weight_g,
            "assigned_printer_name": self.assigned_printer_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
