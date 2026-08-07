"""Printer discovery and status service."""

import asyncio
import concurrent.futures

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
