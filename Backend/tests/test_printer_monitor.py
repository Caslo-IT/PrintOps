"""Background discovery must keep running without blocking API readers."""

import unittest
from threading import Event
from unittest.mock import patch

from app.services import PrinterMonitor


class TestPrinterMonitor(unittest.TestCase):
    def test_repeats_without_requests_and_starts_only_once(self):
        repeated = Event()
        calls = []

        def scan():
            calls.append(1)
            if len(calls) >= 2:
                repeated.set()
            return [{"ip": "192.0.2.1"}]

        monitor = PrinterMonitor(interval=0.1)
        with patch("app.services.scan_network", side_effect=scan):
            try:
                monitor.start()
                worker = monitor._thread
                monitor.start()
                self.assertIs(monitor._thread, worker)
                self.assertTrue(repeated.wait(2))
            finally:
                monitor.stop(2)
        self.assertFalse(worker.is_alive())

    def test_reads_previous_snapshot_while_next_scan_is_blocked(self):
        blocked = Event()
        release = Event()
        first_update = Event()
        calls = []

        def scan():
            calls.append(1)
            if len(calls) > 1:
                blocked.set()
                release.wait(2)
            return [{"ip": "192.0.2.1", "nested": {"state": "idle"}}]

        monitor = PrinterMonitor(interval=0.1)
        with patch("app.services.scan_network", side_effect=scan):
            try:
                monitor.start(lambda printers: first_update.set())
                self.assertTrue(first_update.wait(2))
                self.assertTrue(blocked.wait(2))
                snapshot = monitor.snapshot()
                snapshot[0]["nested"]["state"] = "changed"
                self.assertEqual(monitor.snapshot()[0]["nested"]["state"], "idle")
            finally:
                release.set()
                monitor.stop(2)

    def test_recovers_from_failure_and_publishes_empty_scan(self):
        updated = Event()
        snapshots = []
        monitor = PrinterMonitor(interval=0.1)

        def record(printers):
            snapshots.append(printers)
            if len(snapshots) == 2:
                updated.set()

        with patch("app.services.scan_network", side_effect=[
            [{"ip": "192.0.2.1"}], RuntimeError("network failure"), [],
        ]), patch("app.services.logging.getLogger") as logger:
            try:
                monitor.start(record)
                self.assertTrue(updated.wait(2))
                self.assertEqual(monitor.snapshot(), [])
                logger.return_value.exception.assert_called_once()
            finally:
                monitor.stop(2)


if __name__ == "__main__":
    unittest.main()
