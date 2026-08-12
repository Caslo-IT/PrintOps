"""Local G-code file storage backed by SQLAlchemy ORM metadata."""

from pathlib import Path
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename
from sqlalchemy.exc import SQLAlchemyError

from .config import GCODE_STORAGE_DIR
from .gcode_analyzer import analyze_gcode
from .models import GCodeAnalysis, GCodeFile, db


SIZE_FOLDERS = [
    "1ft",
    "1.5ft",
    "2ft",
    "2.5ft",
    "3ft",
    "3.5ft",
    "4ft",
    "4.5ft",
    "5ft",
    "5.5ft",
    "6ft",
]

ALLOWED_GCODE_EXTENSIONS = (".gcode", ".gco", ".g")
STORAGE_ROOT = Path(GCODE_STORAGE_DIR).resolve()


class StorageError(Exception):
    """Base storage exception with an API friendly message."""

    status_code = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class DatabaseUnavailable(StorageError):
    status_code = 503


def init_gcode_table():
    """Ensure table exists via SQLAlchemy."""
    try:
        db.create_all()
    except SQLAlchemyError as exc:
        raise DatabaseUnavailable(
            "Could not connect to PostgreSQL database. Check DATABASE_URL."
        ) from exc


def _safe_name(value: str, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise StorageError(f"{field_name} is required")

    safe = secure_filename(value.strip())
    if not safe:
        raise StorageError(f"{field_name} contains no safe filename characters")
    return safe


def _ensure_within_storage(path: Path) -> Path:
    resolved = path.resolve()
    if STORAGE_ROOT != resolved and STORAGE_ROOT not in resolved.parents:
        raise StorageError("invalid storage path")
    return resolved


def _folder_path(folder_name: str) -> Path:
    return _ensure_within_storage(STORAGE_ROOT / _safe_name(folder_name, "folder"))


def create_gcode_folder(folder_name: str):
    folder = _folder_path(folder_name)
    folder.mkdir(parents=True, exist_ok=True)
    for size in SIZE_FOLDERS:
        (folder / size).mkdir(exist_ok=True)

    return {
        "folder": folder.name,
        "path": str(folder),
        "size_folders": SIZE_FOLDERS,
    }


def list_gcode_folders():
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    folders = []
    for folder in sorted(path for path in STORAGE_ROOT.iterdir() if path.is_dir()):
        folders.append({
            "folder": folder.name,
            "path": str(folder),
            "size_folders": [
                size for size in SIZE_FOLDERS if (folder / size).is_dir()
            ],
        })
    return folders


def _unique_file_path(directory: Path, filename: str) -> Path:
    target = directory / filename
    if not target.exists():
        return target

    stem = target.stem
    suffix = target.suffix
    counter = 1
    while True:
        candidate = directory / f"{stem}_{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def save_gcode_file(uploaded: FileStorage, folder_name: str, size_folder: str):
    if not uploaded or not uploaded.filename:
        raise StorageError("multipart field 'file' is required")

    if size_folder not in SIZE_FOLDERS:
        raise StorageError(f"size must be one of: {', '.join(SIZE_FOLDERS)}")

    filename = secure_filename(uploaded.filename)
    if not filename:
        raise StorageError("file has no safe filename")
    if not filename.lower().endswith(ALLOWED_GCODE_EXTENSIONS):
        raise StorageError("only G-code files are supported")

    folder = create_gcode_folder(folder_name)
    destination_dir = _ensure_within_storage(Path(folder["path"]) / size_folder)
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = _unique_file_path(destination_dir, filename)
    uploaded.save(destination)

    init_gcode_table()
    analysis_data = analyze_gcode(destination)

    try:
        record = GCodeFile(
            folder_name=folder["folder"],
            size_folder=size_folder,
            filename=destination.name,
            storage_path=str(destination),
        )
        analysis_record = GCodeAnalysis(
            file=record,
            total_time_sec=analysis_data["total_time_sec"],
            total_filament_mm=analysis_data["total_filament_mm"],
            total_weight_g=analysis_data["total_weight_g"],
            filament_diameter_mm=analysis_data["filament_diameter_mm"],
            filament_density_g_cm3=analysis_data["filament_density_g_cm3"],
            layer_count=analysis_data["layer_count"],
            layer_stats=analysis_data["layer_stats"],
        )
        db.session.add(record)
        db.session.add(analysis_record)
        db.session.commit()
        return record.to_dict()
    except SQLAlchemyError as exc:
        db.session.rollback()
        raise DatabaseUnavailable(
            "Could not save G-code file record to database."
        ) from exc


def list_gcode_files(folder_name: str | None = None, size_folder: str | None = None):
    init_gcode_table()

    try:
        query = GCodeFile.query
        if folder_name:
            query = query.filter_by(folder_name=_safe_name(folder_name, "folder"))
        if size_folder:
            if size_folder not in SIZE_FOLDERS:
                raise StorageError(f"size must be one of: {', '.join(SIZE_FOLDERS)}")
            query = query.filter_by(size_folder=size_folder)

        query = query.order_by(GCodeFile.created_at.desc(), GCodeFile.id.desc())
        records = query.all()
        return [record.to_dict() for record in records]
    except StorageError:
        raise
    except SQLAlchemyError as exc:
        raise DatabaseUnavailable(
            "Could not query G-code files from database."
        ) from exc


def get_gcode_file(file_id: int):
    init_gcode_table()
    try:
        record = db.session.get(GCodeFile, file_id)
        if record is None:
            return None
        return record.to_dict()
    except SQLAlchemyError as exc:
        raise DatabaseUnavailable(
            "Could not fetch G-code file from database."
        ) from exc


def delete_gcode_file(file_id: int):
    init_gcode_table()
    try:
        record = db.session.get(GCodeFile, file_id)
        if record is None:
            return None

        path = _ensure_within_storage(Path(record.storage_path))
        if path.exists():
            path.unlink()

        result_dict = record.to_dict()
        db.session.delete(record)
        db.session.commit()
        return result_dict
    except StorageError:
        raise
    except SQLAlchemyError as exc:
        db.session.rollback()
        raise DatabaseUnavailable(
            "Could not delete G-code file from database."
        ) from exc
