"""Printer discovery and status service."""

import asyncio
import concurrent.futures
import logging
from copy import deepcopy
from threading import Event, Lock, Thread
from time import monotonic

from .config import PRINTER_POLL_INTERVAL_SECONDS
from .network import get_scan_addresses
from .protocols import (
    get_creality_status,
    get_moonraker_status,
    get_printer_files,
)


def get_printer_status(ip):
    """Try stock Creality firmware first, then Moonraker."""
    stock_status = asyncio.run(get_creality_status(ip))
    return stock_status or get_moonraker_status(ip)


def scan_network():
    """Scan configured addresses concurrently and return reachable printers."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        results = executor.map(get_printer_status, get_scan_addresses())
        return [item for item in results if item]


class PrinterMonitor:
    """One non-overlapping polling worker with a snapshot safe for request threads."""

    def __init__(self, interval=PRINTER_POLL_INTERVAL_SECONDS):
        self.interval = max(interval, 0.1)
        self._lock = Lock()
        self._stop = Event()
        self._thread = None
        self._printers = []

    def start(self, on_update=None):
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop.clear()
            self._thread = Thread(
                target=self._run, args=(on_update,),
                name="printer-monitor", daemon=True,
            )
            self._thread.start()

    def stop(self, timeout=None):
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout)

    def snapshot(self):
        with self._lock:
            return deepcopy(self._printers)

    def _run(self, on_update):
        while not self._stop.is_set():
            started = monotonic()
            try:
                printers = scan_network()
                with self._lock:
                    self._printers = deepcopy(printers)
                if on_update is not None:
                    on_update(printers)
            except Exception:
                logging.getLogger(__name__).exception("Background printer check failed")
            # Slow scans never overlap. Short scans run on a ten-second cadence.
            if self._stop.wait(max(0.1, self.interval - (monotonic() - started))):
                break


_printer_monitor = PrinterMonitor()


def start_printer_monitor(on_update=None):
    """Start once per serving process; subsequent calls are harmless."""
    _printer_monitor.start(on_update)


def get_printer_snapshot():
    """Return the latest completed scan without blocking on network access."""
    return _printer_monitor.snapshot()
