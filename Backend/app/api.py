"""Flask application and HTTP routes."""

from flask import Flask, jsonify, request
from flasgger import Swagger
from werkzeug.utils import secure_filename

from .protocols import control_printer, start_printer_print, upload_printer_file
from .services import get_printer_files, get_printer_status, scan_network


app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    """Allow the local Vite frontend to call the development API."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
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
        return jsonify({
            "ip": ip,
            "path": file_path,
            "error": "Invalid stored G-code path or printer is unreachable",
        }), 502

    return jsonify({"ip": ip, "path": file_path, "status": "print_started"}), 202


def _control_printer(ip: str, action: str):
    if not control_printer(ip, action):
        return jsonify({
            "ip": ip,
            "action": action,
            "error": "Printer is unreachable or does not support this action",
        }), 502
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
