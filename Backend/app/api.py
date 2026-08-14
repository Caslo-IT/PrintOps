"""Flask application and HTTP routes."""

from pathlib import Path

from flask import Flask, jsonify, request, send_file
from flasgger import Swagger
from werkzeug.utils import secure_filename

from flask_migrate import Migrate

from .config import DATABASE_URL
from .gcode_storage import (
    StorageError,
    create_gcode_folder,
    delete_gcode_file,
    get_gcode_file,
    list_gcode_files,
    list_gcode_folders,
    save_gcode_file,
)
from .models import db
from .protocols import control_printer, start_printer_print, upload_printer_file
from .queue_manager import (
    delete_queue_item,
    dispatch_queue_item,
    get_print_queue,
    get_printers_queue_status,
    schedule_print_queue,
    update_queue_item,
)
from .activity_logger import log_activity
from .models import ActivityLog
from .services import get_printer_files, get_printer_status, scan_network


app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
migrate = Migrate(app, db)



@app.after_request
def add_cors_headers(response):
    """Allow the local Vite frontend to call the development API."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


swagger = Swagger(app, template={
    "info": {
        "title": "Creality K1 Max Monitor API",
        "description": "Discover and monitor Creality printers.",
        "version": "1.0.0",
    },
    "basePath": "/",
})


@app.get("/")
def home():
    """Service health check.
    ---
    tags:
      - System
    responses:
      200:
        description: Service status
        schema:
          type: object
          properties:
            service:
              type: string
            status:
              type: string
    """
    return jsonify({"service": "Creality K1 Max Monitor", "status": "running"})


@app.get("/printers")
def find_printers():
    """Scan the network for reachable printers.
    ---
    tags:
      - Printers
    responses:
      200:
        description: Discovered printers
        schema:
          type: object
          properties:
            count:
              type: integer
            printers:
              type: array
              items:
                type: object
            hint:
              type: string
              nullable: true
    """
    printers = scan_network()
    return jsonify({
        "count": len(printers),
        "printers": printers,
        "hint": (
            "Set PRINTER_IPS to the printer IP if discovery returns no results."
            if not printers else None
        ),
    })


@app.get("/printer/<ip>")
def single_printer(ip: str):
    """Get the current status of one printer.
    ---
    tags:
      - Printers
    parameters:
      - name: ip
        in: path
        required: true
        type: string
        description: Printer IPv4 address or hostname
    responses:
      200:
        description: Printer status, or an error when it cannot be reached
        schema:
          type: object
    """
    data = get_printer_status(ip)
    return jsonify(data or {"error": "Printer not found"})


@app.get("/printer/<ip>/files")
def printer_files(ip: str):
    """Get G-code files currently stored on one printer.
    ---
    tags:
      - Printers
    parameters:
      - name: ip
        in: path
        required: true
        type: string
        description: Printer IPv4 address or hostname
    responses:
      200:
        description: G-code files stored on the printer
        schema:
          type: object
          properties:
            ip:
              type: string
            files:
              type: array
              items:
                type: object
      404:
        description: Printer storage could not be reached or is unsupported
    """
    files = get_printer_files(ip)
    if files is None:
        return jsonify({
            "ip": ip,
            "files": [],
            "supported": False,
            "error": "Printer storage is unavailable or unsupported",
        }), 404

    return jsonify({"ip": ip, "files": files, "supported": True})


def _storage_error_response(error: StorageError):
    return jsonify({"error": error.message}), error.status_code


@app.post("/gcode/folders")
def create_gcode_folder_route():
    """Create a local G-code folder with size subfolders.
    ---
    tags:
      - Local G-code Storage
    consumes:
      - application/json
    parameters:
      - in: body
        name: folder
        required: true
        schema:
          type: object
          required:
            - name
          properties:
            name:
              type: string
              example: customer-job-001
    responses:
      201:
        description: Folder created with 1ft through 6ft subfolders
      400:
        description: Invalid folder name
    """
    payload = request.get_json(silent=True) or {}
    try:
        folder = create_gcode_folder(payload.get("name"))
    except StorageError as error:
        return _storage_error_response(error)

    return jsonify(folder), 201


@app.get("/gcode/folders")
def list_gcode_folders_route():
    """List local G-code folders.
    ---
    tags:
      - Local G-code Storage
    responses:
      200:
        description: Local storage folders
    """
    return jsonify({"folders": list_gcode_folders()})


@app.post("/gcode/files")
def upload_local_gcode_file_route():
    """Store a G-code file in local storage and save its path in PostgreSQL.
    ---
    tags:
      - Local G-code Storage
    consumes:
      - multipart/form-data
    parameters:
      - name: folder
        in: formData
        required: true
        type: string
      - name: size
        in: formData
        required: true
        type: string
        enum: [1ft, 1.5ft, 2ft, 2.5ft, 3ft, 3.5ft, 4ft, 4.5ft, 5ft, 5.5ft, 6ft]
      - name: file
        in: formData
        required: true
        type: file
    responses:
      201:
        description: G-code file saved locally
      400:
        description: Missing or invalid input
      503:
        description: PostgreSQL is unavailable
    """
    try:
        file_record = save_gcode_file(
            request.files.get("file"),
            request.form.get("folder"),
            request.form.get("size"),
        )
    except StorageError as error:
        return _storage_error_response(error)

    return jsonify(file_record), 201


@app.get("/gcode/files")
def list_local_gcode_files_route():
    """List local G-code files stored in PostgreSQL.
    ---
    tags:
      - Local G-code Storage
    parameters:
      - name: folder
        in: query
        required: false
        type: string
      - name: size
        in: query
        required: false
        type: string
    responses:
      200:
        description: Stored G-code files
      503:
        description: PostgreSQL is unavailable
    """
    try:
        files = list_gcode_files(
            request.args.get("folder"),
            request.args.get("size"),
        )
    except StorageError as error:
        return _storage_error_response(error)

    return jsonify({"files": files})


@app.get("/gcode/files/<int:file_id>")
def view_local_gcode_file_route(file_id: int):
    """Download or view a local G-code file by database id.
    ---
    tags:
      - Local G-code Storage
    parameters:
      - name: file_id
        in: path
        required: true
        type: integer
    responses:
      200:
        description: G-code file content
      404:
        description: File record or stored file not found
      503:
        description: PostgreSQL is unavailable
    """
    try:
        file_record = get_gcode_file(file_id)
    except StorageError as error:
        return _storage_error_response(error)

    if file_record is None:
        return jsonify({"error": "G-code file not found"}), 404

    path = Path(file_record["path"])
    if not path.exists():
        return jsonify({"error": "G-code file is missing from local storage"}), 404

    return send_file(path, mimetype="text/plain", as_attachment=False)


@app.delete("/gcode/files/<int:file_id>")
def delete_local_gcode_file_route(file_id: int):
    """Delete a local G-code file and its PostgreSQL record.
    ---
    tags:
      - Local G-code Storage
    parameters:
      - name: file_id
        in: path
        required: true
        type: integer
    responses:
      200:
        description: File deleted
      404:
        description: File record not found
      503:
        description: PostgreSQL is unavailable
    """
    try:
        deleted = delete_gcode_file(file_id)
    except StorageError as error:
        return _storage_error_response(error)

    if deleted is None:
        return jsonify({"error": "G-code file not found"}), 404

    return jsonify({"deleted": deleted})


@app.post("/printer/<ip>/files")
def upload_printer_file_route(ip: str):
    """Upload a G-code file to the printer storage.
    ---
    tags:
      - Printers
    consumes:
      - multipart/form-data
    parameters:
      - name: ip
        in: path
        required: true
        type: string
      - name: file
        in: formData
        required: true
        type: file
        description: G-code file to upload
    responses:
      201:
        description: File uploaded to printer storage
      400:
        description: Missing, invalid, or unsupported file
      502:
        description: Printer upload failed
    """
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "multipart field 'file' is required"}), 400

    filename = secure_filename(uploaded.filename)
    if not filename.lower().endswith((".gcode", ".gco", ".g")):
        return jsonify({"error": "only G-code files are supported"}), 400

    result = upload_printer_file(
        ip,
        filename,
        uploaded.read(),
        uploaded.mimetype or "application/octet-stream",
    )
    if result is None:
        return jsonify({
            "ip": ip,
            "filename": filename,
            "error": "Printer rejected the upload or is unreachable",
        }), 502

    return jsonify({"ip": ip, **result}), 201


@app.post("/printer/<ip>/print")
def start_printer_print_route(ip: str):
    """Start a G-code file already stored on the printer.
    ---
    tags:
      - Printers
    consumes:
      - application/json
    parameters:
      - name: ip
        in: path
        required: true
        type: string
      - in: body
        name: file
        required: true
        schema:
          type: object
          required:
            - path
          properties:
            path:
              type: string
              description: Full path returned by GET /printer/{ip}/files
              example: /usr/data/printer_data/gcodes/example.gcode
    responses:
      202:
        description: Print command sent to the printer
      400:
        description: Invalid or unsafe file path
      502:
        description: Printer rejected the command or is unreachable
    """
    payload = request.get_json(silent=True) or {}
    file_path = payload.get("path")
    if not isinstance(file_path, str) or not file_path:
        return jsonify({"error": "JSON field 'path' is required"}), 400

    if not start_printer_print(ip, file_path):
        log_activity(ip, "error", f"Failed to start print manually: {file_path}")
        return jsonify({
            "ip": ip,
            "path": file_path,
            "error": "Invalid stored G-code path or printer is unreachable",
        }), 502

    log_activity(ip, "success", f"Started print manually: {file_path}")
    return jsonify({"ip": ip, "path": file_path, "status": "print_started"}), 202


def _control_printer(ip: str, action: str):
    if not control_printer(ip, action):
        log_activity(ip, "error", f"Failed to send '{action}' command to printer")
        return jsonify({
            "ip": ip,
            "action": action,
            "error": "Printer is unreachable or does not support this action",
        }), 502
    
    log_activity(
        ip,
        "warning" if action in ["pause", "stop"] else "info",
        f"Sent '{action}' command to printer"
    )
    return jsonify({"ip": ip, "action": action, "status": f"{action}_sent"}), 202


@app.post("/printer/<ip>/pause")
def pause_printer(ip: str):
    """Pause the active print.
    ---
    tags:
      - Printers
    parameters:
      - name: ip
        in: path
        required: true
        type: string
    responses:
      202:
        description: Pause command sent
      502:
        description: Printer is unreachable or unsupported
    """
    return _control_printer(ip, "pause")


@app.post("/printer/<ip>/resume")
def resume_printer(ip: str):
    """Resume the paused print.
    ---
    tags:
      - Printers
    parameters:
      - name: ip
        in: path
        required: true
        type: string
    responses:
      202:
        description: Resume command sent
      502:
        description: Printer is unreachable or unsupported
    """
    return _control_printer(ip, "resume")


@app.post("/printer/<ip>/stop")
def stop_printer(ip: str):
    """Cancel the active print.
    ---
    tags:
      - Printers
    parameters:
      - name: ip
        in: path
        required: true
        type: string
    responses:
      202:
        description: Stop command sent
      502:
        description: Printer is unreachable or unsupported
    """
    return _control_printer(ip, "stop")


@app.post("/queue/schedule")
def schedule_queue_route():
    """Schedule selected G-code files into the print queue with priority and auto-assign printers.
    ---
    tags:
      - Print Queue
    consumes:
      - application/json
    parameters:
      - in: body
        name: payload
        required: true
        schema:
          type: object
          required:
            - jobs
          properties:
            jobs:
              type: array
              items:
                type: object
                required:
                  - gcode_file_id
                  - priority
                properties:
                  gcode_file_id:
                    type: integer
                    example: 1
                  priority:
                    type: integer
                    example: 1
    responses:
      201:
        description: Queue items created and assigned
      400:
        description: Invalid job request payload
      503:
        description: PostgreSQL is unavailable
    """
    payload = request.get_json(silent=True) or {}
    jobs = payload.get("jobs")
    try:
        items = schedule_print_queue(jobs)
    except StorageError as error:
        return _storage_error_response(error)

    return jsonify({"scheduled": items}), 201


@app.get("/queue")
def get_queue_route():
    """Get the active print queue.
    ---
    tags:
      - Print Queue
    parameters:
      - name: status
        in: query
        required: false
        type: string
      - name: printer_ip
        in: query
        required: false
        type: string
    responses:
      200:
        description: Active print queue items sorted by priority
      503:
        description: PostgreSQL is unavailable
    """
    try:
        queue = get_print_queue(
            status=request.args.get("status"),
            printer_ip=request.args.get("printer_ip"),
        )
    except StorageError as error:
        return _storage_error_response(error)

    return jsonify({"queue": queue})


@app.get("/queue/printers")
def get_printers_queue_status_route():
    """Get printers with their availability, remaining print time, and assigned upcoming jobs.
    ---
    tags:
      - Print Queue
    responses:
      200:
        description: List of printers with availability and assigned queue jobs
    """
    try:
        printers = get_printers_queue_status()
    except StorageError as error:
        return _storage_error_response(error)

    return jsonify({"printers": printers})


@app.put("/queue/items/<int:item_id>")
def update_queue_item_route(item_id: int):
    """Update priority, status, or printer assignment of a queue item.
    ---
    tags:
      - Print Queue
    parameters:
      - name: item_id
        in: path
        required: true
        type: integer
      - in: body
        name: payload
        required: true
        schema:
          type: object
          properties:
            priority:
              type: integer
            status:
              type: string
              enum: [queued, assigned, printing, completed, failed, cancelled]
            printer_ip:
              type: string
    responses:
      200:
        description: Queue item updated
      404:
        description: Queue item not found
      400:
        description: Invalid parameter or state transition
    """
    payload = request.get_json(silent=True) or {}
    try:
        updated = update_queue_item(
            item_id,
            priority=payload.get("priority"),
            status=payload.get("status"),
            printer_ip=payload.get("printer_ip"),
        )
    except StorageError as error:
        return _storage_error_response(error)

    if updated is None:
        return jsonify({"error": "Print queue item not found"}), 404

    return jsonify({"queue_item": updated})


@app.post("/queue/items/<int:item_id>/dispatch")
def dispatch_queue_item_route(item_id: int):
    """Dispatch an assigned queue item (uploads G-code to printer and starts print).
    ---
    tags:
      - Print Queue
    parameters:
      - name: item_id
        in: path
        required: true
        type: integer
    responses:
      200:
        description: Job dispatched to printer and marked as printing
      400:
        description: Unassigned printer or printer unreachable
      404:
        description: Queue item not found
    """
    try:
        dispatched = dispatch_queue_item(item_id)
    except StorageError as error:
        return _storage_error_response(error)

    return jsonify({"dispatched": dispatched}), 200


@app.delete("/queue/items/<int:item_id>")
def delete_queue_item_route(item_id: int):
    """Remove an item from the print queue.
    ---
    tags:
      - Print Queue
    parameters:
      - name: item_id
        in: path
        required: true
        type: integer
    responses:
      200:
        description: Item deleted from queue
      404:
        description: Item not found
    """
    try:
        deleted = delete_queue_item(item_id)
    except StorageError as error:
        return _storage_error_response(error)

    if deleted is None:
        return jsonify({"error": "Print queue item not found"}), 404

    return jsonify({"deleted": deleted})


@app.get("/activity")
def get_activity_route():
    """Get the latest activity logs.
    ---
    tags:
      - Activity Logs
    parameters:
      - name: limit
        in: query
        required: false
        type: integer
      - name: printer_ip
        in: query
        required: false
        type: string
    responses:
      200:
        description: A list of activity logs
    """
    limit = request.args.get("limit", 50, type=int)
    printer_ip = request.args.get("printer_ip", type=str)

    query = ActivityLog.query
    if printer_ip:
        query = query.filter_by(printer_ip=printer_ip)
    
    logs = query.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return jsonify([log.to_dict() for log in logs])

