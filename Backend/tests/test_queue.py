"""Unit tests for Backend print queue management system."""

import os
import unittest
from datetime import datetime, timezone

# Set test environment database to SQLite in-memory before importing app
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.api import app, db
from app.models import GCodeAnalysis, GCodeFile, PrintQueueItem, User
from app.auth import generate_token
from app.queue_manager import (
    delete_queue_item,
    dispatch_queue_item,
    get_print_queue,
    get_printers_queue_status,
    get_printers_with_availability,
    schedule_print_queue,
    update_queue_item,
)


class TestPrintQueueManager(unittest.TestCase):

    def setUp(self):
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        self.app_context = app.app_context()
        self.app_context.push()
        db.create_all()

        # Create a test admin user and token
        self.admin = User(username="admin_test", password_hash="hash", role="admin")
        db.session.add(self.admin)
        db.session.commit()
        self.token = generate_token(self.admin.id, self.admin.username, self.admin.role)
        self.headers = {"Authorization": f"Bearer {self.token}"}

        # Seed sample G-code files with analysis
        self.file1 = GCodeFile(
            folder_name="customer-job",
            size_folder="1ft",
            filename="model_a.gcode",
            storage_path="/tmp/model_a.gcode",
        )
        self.analysis1 = GCodeAnalysis(
            file=self.file1,
            total_time_sec=1800.0,  # 30 mins
            total_filament_mm=5000.0,
            total_weight_g=15.0,
        )

        self.file2 = GCodeFile(
            folder_name="customer-job",
            size_folder="2ft",
            filename="model_b.gcode",
            storage_path="/tmp/model_b.gcode",
        )
        self.analysis2 = GCodeAnalysis(
            file=self.file2,
            total_time_sec=3600.0,  # 60 mins
            total_filament_mm=10000.0,
            total_weight_g=30.0,
        )

        db.session.add_all([self.file1, self.analysis1, self.file2, self.analysis2])
        db.session.commit()

        self.mock_printers = [
            {
                "ip": "192.168.1.10",
                "online": True,
                "state": "idle",
                "progress": 0,
            },
            {
                "ip": "192.168.1.11",
                "online": True,
                "state": "printing",
                "progress": 50,  # 50% through a job
            },
        ]

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_printer_availability_calculation(self):
        printers = get_printers_with_availability(mock_printers=self.mock_printers)
        self.assertEqual(len(printers), 2)

        idle_p = next(p for p in printers if p["ip"] == "192.168.1.10")
        self.assertTrue(idle_p["is_available"])
        self.assertEqual(idle_p["remaining_sec"], 0.0)

        busy_p = next(p for p in printers if p["ip"] == "192.168.1.11")
        self.assertFalse(busy_p["is_available"])

    def test_queue_scheduling_priority_order(self):
        # Give file2 (60 min job) priority 1, and file1 (30 min job) priority 2
        jobs = [
            {"gcode_file_id": self.file1.id, "priority": 2},
            {"gcode_file_id": self.file2.id, "priority": 1},
        ]

        scheduled = schedule_print_queue(jobs, mock_printers=self.mock_printers)
        self.assertEqual(len(scheduled), 2)

        # Higher priority item (priority=1, file2) should be scheduled first to idle printer
        item1 = scheduled[0]
        self.assertEqual(item1["gcode_file_id"], self.file2.id)
        self.assertEqual(item1["priority"], 1)
        self.assertEqual(item1["printer_ip"], "192.168.1.10")
        self.assertEqual(item1["estimated_duration_sec"], 3600.0)

        # Lower priority item (priority=2, file1) should be scheduled next
        item2 = scheduled[1]
        self.assertEqual(item2["gcode_file_id"], self.file1.id)
        self.assertEqual(item2["priority"], 2)

    def test_get_and_update_queue_items(self):
        jobs = [{"gcode_file_id": self.file1.id, "priority": 1}]
        schedule_print_queue(jobs, mock_printers=self.mock_printers)

        queue = get_print_queue()
        self.assertEqual(len(queue), 1)
        item_id = queue[0]["id"]

        updated = update_queue_item(item_id, priority=5, status="printing")
        self.assertIsNotNone(updated)
        self.assertEqual(updated["priority"], 5)
        self.assertEqual(updated["status"], "printing")

        deleted = delete_queue_item(item_id)
        self.assertIsNotNone(deleted)
        self.assertEqual(len(get_print_queue()), 0)

    def test_queue_api_endpoints(self):
        client = app.test_client()

        # POST /queue/schedule
        resp = client.post(
            "/queue/schedule",
            headers=self.headers,
            json={
                "jobs": [
                    {"gcode_file_id": self.file1.id, "priority": 1},
                    {"gcode_file_id": self.file2.id, "priority": 2},
                ]
            },
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertIn("scheduled", data)
        self.assertEqual(len(data["scheduled"]), 2)

        # GET /queue
        resp = client.get("/queue", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.get_json()["queue"]), 2)

        # PUT /queue/items/1
        item_id = data["scheduled"][0]["id"]
        resp = client.put(
            f"/queue/items/{item_id}",
            headers=self.headers,
            json={"priority": 10, "status": "completed"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["queue_item"]["status"], "completed")

        # DELETE /queue/items/1
        resp = client.delete(f"/queue/items/{item_id}", headers=self.headers)
        self.assertEqual(resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()
