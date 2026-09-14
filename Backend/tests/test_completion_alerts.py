"""A stock printer reaching 100% must emit one completion event for audio."""

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from flask import Flask

from app.activity_logger import _printer_states, track_printer_state
from app.models import ActivityLog, PrintHistory, db
from app.protocols import get_creality_status


def snapshot(progress, state=1, filename="part.gcode"):
    websocket = AsyncMock()
    websocket.recv.return_value = json.dumps({
        "state": state,
        "printProgress": progress,
        "printFileName": filename,
        "feedState": 3,
        "layer": 200,
    })
    connection = AsyncMock()
    connection.__aenter__.return_value = websocket
    with patch("app.protocols.websockets.connect", return_value=connection):
        return asyncio.run(get_creality_status("192.0.2.25"))


class TestCompletionAlerts(unittest.TestCase):
    def test_100_percent_overrides_retained_active_state(self):
        for code in [0, 1, 2, 999]:
            with self.subTest(code=code):
                self.assertEqual(snapshot("100", code)["state"], "completed")

    def test_does_not_complete_early_or_hide_errors_and_pauses(self):
        self.assertEqual(snapshot(99.9)["state"], "printing")
        self.assertEqual(snapshot(100, 3)["state"], "paused")
        self.assertEqual(snapshot(100, 5)["state"], "error")
        self.assertEqual(snapshot(100, 0, filename=None)["state"], "idle")

    def test_completion_event_emitted_once_and_next_job_can_complete(self):
        app = Flask(__name__)
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        db.init_app(app)
        ip = "192.0.2.25"
        with app.app_context():
            db.create_all()
            previous = _printer_states.pop(ip, None)
            try:
                for progress in [80, 100, 100, 100]:
                    printer = snapshot(progress)
                    track_printer_state(ip, printer["state"], "Test printer")
                completions = ActivityLog.query.filter_by(
                    message="Printer completed the print job."
                )
                self.assertEqual(completions.count(), 1)
                self.assertEqual(completions.first().event_type, "success")
                self.assertEqual(PrintHistory.query.one().status, "completed")
                for progress in [0, 50, 100]:
                    printer = snapshot(progress)
                    track_printer_state(ip, printer["state"], "Test printer")
                self.assertEqual(completions.count(), 2)
            finally:
                _printer_states.pop(ip, None)
                if previous is not None:
                    _printer_states[ip] = previous
                db.session.remove()
                db.drop_all()


if __name__ == "__main__":
    unittest.main()
