"""Printer discovery and status service."""

import asyncio
import concurrent.futures
from threading import Lock
from time import monotonic

from .config import PRINTER_STATUS_CACHE_SECONDS
from .network import get_scan_addresses
from .protocols import (
    get_creality_status,
    get_moonraker_status,
    get_printer_files,
)


# Discovery probes every address on the local subnet when PRINTER_IPS is not
# configured. Keep one shared snapshot so concurrent views do not each start
# their own expensive scan.
_printer_snapshot = {"expires_at": 0.0, "printers": None}
_printer_snapshot_lock = Lock()


def get_printer_status(ip):
    """Try stock Creality firmware first, then Moonraker."""
    stock_status = asyncio.run(get_creality_status(ip))
    return stock_status or get_moonraker_status(ip)


def scan_network():
    """Scan configured addresses concurrently and return reachable printers."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        results = executor.map(get_printer_status, get_scan_addresses())
        return [item for item in results if item]


def get_printer_snapshot():
    """Return a short-lived shared result of printer discovery.

    Holding the lock while a scan runs deliberately coalesces simultaneous
    requests: callers arriving during a scan receive that same new snapshot
    instead of starting a second subnet-wide probe.
    """
    now = monotonic()
    with _printer_snapshot_lock:
        if _printer_snapshot["printers"] is not None and now < _printer_snapshot["expires_at"]:
            return _printer_snapshot["printers"]

        printers = scan_network()
        _printer_snapshot["printers"] = printers
        # Measure the TTL after discovery completes. A slow scan must not make
        # a freshly gathered snapshot immediately expire.
        _printer_snapshot["expires_at"] = monotonic() + max(PRINTER_STATUS_CACHE_SECONDS, 0)
        return printers
