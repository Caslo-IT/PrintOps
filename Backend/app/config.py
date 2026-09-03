"""Application configuration loaded from environment variables."""

import os


MOONRAKER_PORT = int(os.getenv("MOONRAKER_PORT", "7125"))
CREALITY_PORT = int(os.getenv("CREALITY_PORT", "9999"))
# Large G-code files can take considerably longer than the status-request
# timeout to transfer over a printer's Wi-Fi connection.
CREALITY_UPLOAD_TIMEOUT = int(os.getenv("CREALITY_UPLOAD_TIMEOUT", "180"))
# Live printer discovery touches the network and is comparatively expensive.
# Keep a short snapshot for views that only need recent availability data.
PRINTER_STATUS_CACHE_SECONDS = int(os.getenv("PRINTER_STATUS_CACHE_SECONDS", "15"))

GCODE_STORAGE_DIR = os.getenv(
    "GCODE_STORAGE_DIR",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "data storage"),
)
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "dbname=printops user=postgres host=localhost")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    os.getenv("SQLALCHEMY_DATABASE_URI", "postgresql://postgres:postgres@localhost:5432/printops"),
)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
