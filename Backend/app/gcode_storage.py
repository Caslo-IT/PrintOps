"""Local G-code file storage backed by SQLAlchemy ORM metadata."""

import shutil
import platform
import subprocess
from pathlib import Path
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename
from sqlalchemy.exc import SQLAlchemyError

from .config import GCODE_STORAGE_DIR
from .gcode_analyzer import analyze_gcode
from .models import AppSetting, GCodeAnalysis, GCodeFile, db


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
STORAGE_LOCATION_SETTING = "gcode_storage_location"


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


def get_storage_root() -> Path:
    """Return the persisted storage root, or the configured default."""
    setting = db.session.get(AppSetting, STORAGE_LOCATION_SETTING)
    location = setting.value if setting else GCODE_STORAGE_DIR
    return Path(location).expanduser().resolve()


def _ensure_within_storage(path: Path, storage_root: Path | None = None) -> Path:
    root = storage_root or get_storage_root()
    resolved = path.resolve()
    if root != resolved and root not in resolved.parents:
        raise StorageError("invalid storage path")
    return resolved


def _folder_path(folder_name: str) -> Path:
    root = get_storage_root()
    return _ensure_within_storage(root / _safe_name(folder_name, "folder"), root)


def create_gcode_folder(folder_name: str):
    init_gcode_table()
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
    init_gcode_table()
    storage_root = get_storage_root()
    storage_root.mkdir(parents=True, exist_ok=True)
    folders = []
    for folder in sorted(path for path in storage_root.iterdir() if path.is_dir()):
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

    init_gcode_table()
    folder = create_gcode_folder(folder_name)
    storage_root = get_storage_root()
    destination_dir = _ensure_within_storage(Path(folder["path"]) / size_folder, storage_root)
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = _unique_file_path(destination_dir, filename)
    uploaded.save(destination)

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

        path = _ensure_within_storage(Path(record.storage_path), get_storage_root())
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


def get_gcode_storage_settings():
    """Return the active server-side location for the local G-code library."""
    init_gcode_table()
    root = get_storage_root()
    return {"location": str(root), "file_count": GCodeFile.query.count()}


def choose_gcode_storage_location():
    """Open the host operating system's folder chooser for an administrator.

    This runs on the machine hosting PrintOps. It is intentionally separate
    from the browser because browsers do not expose absolute local paths.
    """
    system = platform.system()
    try:
        if system == "Darwin":
            result = subprocess.run(
                ["osascript", "-e", 'POSIX path of (choose folder with prompt "Choose Local G-Code Library folder")'],
                capture_output=True,
                text=True,
                timeout=120,
            )
        elif system == "Windows":
            script = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
                "$dialog.Description = 'Choose Local G-Code Library folder'; "
                "if ($dialog.ShowDialog() -eq 'OK') { [Console]::Write($dialog.SelectedPath) }"
            )
            result = subprocess.run(
                ["powershell", "-NoProfile", "-STA", "-Command", script],
                capture_output=True,
                text=True,
                timeout=120,
            )
        else:
            raise StorageError("native folder selection is supported on macOS and Windows only")
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise StorageError(f"could not open the native folder picker: {exc}") from exc

    location = result.stdout.strip()
    if result.returncode != 0:
        raise StorageError("native folder picker could not be opened")
    if not location:
        return None  # The user cancelled the native dialog.
    return str(Path(location).expanduser().resolve())


def update_gcode_storage_location(location: str):
    """Move the managed library and persist a new absolute storage location."""
    if not isinstance(location, str) or not location.strip():
        raise StorageError("storage location is required")

    requested_root = Path(location.strip()).expanduser()
    if not requested_root.is_absolute():
        raise StorageError("storage location must be an absolute server path")

    init_gcode_table()
    old_root = get_storage_root()
    new_root = requested_root.resolve()
    if new_root == old_root:
        return {**get_gcode_storage_settings(), "migrated_files": 0}

    try:
        new_root.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise StorageError(f"could not create storage location: {exc}") from exc
    if not new_root.is_dir():
        raise StorageError("storage location must be a directory")

    records = GCodeFile.query.order_by(GCodeFile.id).all()
    planned_moves = []
    for record in records:
        source = _ensure_within_storage(Path(record.storage_path), old_root)
        if not source.is_file():
            raise StorageError(f"cannot move missing library file: {record.filename}")
        destination = _ensure_within_storage(new_root / source.relative_to(old_root), new_root)
        if destination.exists():
            raise StorageError(f"destination already contains: {destination.name}")
        planned_moves.append((record, source, destination))

    copied_destinations = []
    try:
        for _, source, destination in planned_moves:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
            copied_destinations.append(destination)

        setting = db.session.get(AppSetting, STORAGE_LOCATION_SETTING)
        if setting is None:
            setting = AppSetting(key=STORAGE_LOCATION_SETTING, value=str(new_root))
            db.session.add(setting)
        else:
            setting.value = str(new_root)
        for record, _, destination in planned_moves:
            record.storage_path = str(destination)
        db.session.commit()
    except (OSError, SQLAlchemyError) as exc:
        db.session.rollback()
        for destination in copied_destinations:
            destination.unlink(missing_ok=True)
        raise StorageError(f"could not move G-code library: {exc}") from exc

    # The database now points to the copied files. Cleanup cannot compromise
    # the new library if an old file is temporarily locked by the OS.
    for _, source, _ in planned_moves:
        try:
            source.unlink()
        except OSError:
            pass

    return {**get_gcode_storage_settings(), "migrated_files": len(planned_moves)}
