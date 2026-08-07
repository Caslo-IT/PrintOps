"""Application configuration loaded from environment variables."""

import os


MOONRAKER_PORT = int(os.getenv("MOONRAKER_PORT", "7125"))
CREALITY_PORT = int(os.getenv("CREALITY_PORT", "9999"))

