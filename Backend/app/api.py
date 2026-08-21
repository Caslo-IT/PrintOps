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
from .models import db, User
from .auth import token_required, admin_required, check_password, generate_token, hash_password
from .protocols import control_printer, start_printer_print, upload_printer_file
from .queue_manager import (
    delete_queue_item,
    dispatch_queue_item,
    get_print_queue,
    get_printers_queue_status,
    schedule_print_queue,
    update_queue_item,
)
from .activity_logger import log_activity, track_printer_state, get_filament_baseline, set_filament_baseline
from .models import ActivityLog, GCodeFile, PrintHistory, Filament
from .services import get_printer_files, get_printer_status, scan_network


app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
migrate = Migrate(app, db)




@app.post("/auth/login")
def login():
    """Authenticate user and get a JWT token.
    ---
    tags:
      - Authentication
    consumes:
      - application/json
    parameters:
      - in: body
        name: credentials
        required: true
        schema:
          type: object
          required:
            - username
            - password
          properties:
            username:
              type: string
            password:
              type: string
    responses:
      200:
        description: Successful authentication
      400:
        description: Missing credentials
      401:
        description: Invalid credentials
    """
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
        
    user = User.query.filter_by(username=username).first()
    if not user or not check_password(password, user.password_hash):
        return jsonify({"error": "Invalid credentials"}), 401
        
    token = generate_token(user.id, user.username, user.role)
    return jsonify({
        "token": token,
        "user": user.to_dict()
    })

@app.get("/users")
@admin_required
def list_users():
    """List all users (Admin only).
    ---
    tags:
      - Users
    responses:
      200:
        description: List of all users
    """
    users = User.query.all()
    return jsonify({"users": [u.to_dict() for u in users]})

@app.post("/users")
@admin_required
def create_user():
    """Create a new user (Admin only).
    ---
    tags:
      - Users
    consumes:
      - application/json
    parameters:
      - in: body
        name: user
        required: true
        schema:
          type: object
          required:
            - username
            - password
          properties:
            username:
              type: string
            password:
              type: string
            role:
              type: string
              enum: [user, admin]
    responses:
      201:
        description: User created successfully
      400:
        description: Invalid input or username exists
    """
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")
    role = data.get("role", "user")
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
        
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 400
        
    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role
    )
    db.session.add(user)
    db.session.commit()
    
    return jsonify({"message": "User created", "user": user.to_dict()}), 201

@app.delete("/users/<int:user_id>")
@admin_required
def delete_user(user_id):
    """Delete a user (Admin only).
    ---
    tags:
      - Users
    parameters:
      - name: user_id
        in: path
        required: true
        type: integer
    responses:
      200:
        description: User deleted successfully
      403:
        description: Cannot delete primary admin
      404:
        description: User not found
    """
    user = User.query.get_or_404(user_id)
    if user.username == "admin":
        return jsonify({"error": "Cannot delete primary admin"}), 403
        
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "User deleted"}), 200

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
    "securityDefinitions": {
        "Bearer": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": 'JWT Authorization header using the Bearer scheme. Example: "Bearer {token}"'
        }
    },
    "security": [
        {
            "Bearer": []
        }
    ]
})


@app.get("/")
@token_required
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
@token_required
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
    for p in printers:
        if p.get("ip") and p.get("state"):
            track_printer_state(p["ip"], p["state"], p.get("name"))
            
    return jsonify({
        "count": len(printers),
        "printers": printers,
        "hint": (
            "Set PRINTER_IPS to the printer IP if discovery returns no results."
            if not printers else None
        ),
    })


@app.get("/printer/<ip>")
@token_required
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
    if data and data.get("state"):
        track_printer_state(ip, data["state"], data.get("name"))
    return jsonify(data or {"error": "Printer not found"})


@app.get("/printer/<ip>/print/progress")
@token_required
def printer_print_progress(ip: str):
    """Get live filament usage and layer breakdown for the active print job on a printer.
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
        description: >-
          Live progress with per-layer filament stats and cumulative usage
          for the current print job.
        schema:
          type: object
          properties:
            ip:
              type: string
            state:
              type: string
            progress:
              type: number
            job_filename:
              type: string
            filament:
              type: object
            layers:
              type: object
      404:
        description: Printer is not reachable or is not currently printing
    """
    # 1. Fetch live printer status
    printer_data = get_printer_status(ip)
    if not printer_data:
        return jsonify({"error": "Printer not reachable"}), 404

    state = (printer_data.get("state") or "unknown").lower()
    progress = float(printer_data.get("progress") or 0.0)
    job_filename_raw = printer_data.get("job_filename") or ""
    job_filename = job_filename_raw.split("/")[-1]  # strip any path prefix

    # Trigger state tracking so the activity logger / filament deduction runs
    track_printer_state(ip, state, printer_data.get("name"), progress=progress,
                        job_filename=job_filename_raw)

    # 2. Look up the G-code analysis for the current job
    gcode = GCodeFile.query.filter_by(filename=job_filename).first() if job_filename else None
    analysis = gcode.analysis if gcode else None

    # ── Filament block ────────────────────────────────────────────────────────
    # Works in ALL cases:
    #   - GCodeFile found with layer stats  → most accurate (layer-by-layer sum)
    #   - GCodeFile found, no layer stats   → linear interpolation
    #   - No GCodeFile found                → no weight computation (noted)
    #
    # Baseline = spool remaining_weight_g at the moment this print started.
    # If the baseline is missing (server restarted mid-print) we reconstruct it
    # so deduction is not blocked.

    # -- Find assigned filament spool (name match first, IP fallback) ----------
    printer_name = printer_data.get("name")
    filament_spool = None
    if printer_name:
        filament_spool = Filament.query.filter_by(
            assigned_printer_name=printer_name
        ).first()
    if filament_spool is None:
        filament_spool = Filament.query.filter_by(
            assigned_printer_name=ip
        ).first()

    # -- Compute used_weight_g -------------------------------------------------
    total_job_weight_g = 0.0
    total_job_filament_mm = 0.0
    used_weight_g = 0.0
    used_filament_mm = 0.0
    remaining_job_weight_g = 0.0
    completed_layers_count = 0
    layer_stats_for_block: list = []
    gcode_found = analysis is not None

    if analysis and analysis.total_weight_g > 0:
        total_job_weight_g = analysis.total_weight_g
        total_job_filament_mm = analysis.total_filament_mm
        layer_stats_for_block = analysis.layer_stats or []
        total_layers = len(layer_stats_for_block)

        if total_layers > 0 and progress > 0:
            completed_layers_count = max(
                0, min(total_layers - 1, round(total_layers * progress / 100.0))
            )
            for stat in layer_stats_for_block[:completed_layers_count]:
                used_weight_g += stat.get("weight_g", 0.0)
                used_filament_mm += stat.get("filament_mm", 0.0)
        else:
            # Linear interpolation fallback
            used_weight_g = total_job_weight_g * (progress / 100.0)
            used_filament_mm = total_job_filament_mm * (progress / 100.0)

        remaining_job_weight_g = max(0.0, total_job_weight_g - used_weight_g)

    # -- Resolve / reconstruct baseline and write accurate remaining to DB -----
    baseline = get_filament_baseline(ip)
    spool_remaining_g = None
    deduction_method = "none"

    if filament_spool and state in ("printing", "completed") and progress > 0:
        if baseline is None:
            # Baseline missing: reconstruct from current DB value + used_weight_g.
            # If incremental deductions already ran, current remaining is lower
            # than it was at print start; adding back used_weight_g approximates
            # the original value.
            if gcode_found and used_weight_g > 0:
                reconstructed = filament_spool.remaining_weight_g + used_weight_g
            else:
                # No GCode analysis: assume nothing has been deducted yet
                reconstructed = filament_spool.remaining_weight_g
            # Cap at total spool weight
            baseline = min(reconstructed, filament_spool.total_weight_g)
            set_filament_baseline(ip, baseline)
            deduction_method = "reconstructed-baseline"
        else:
            deduction_method = "snapshot-baseline"

        if gcode_found and total_job_weight_g > 0:
            # Accurate: use layer-based (or linear-fallback) used_weight_g
            accurate_remaining = max(0.0, baseline - used_weight_g)
        else:
            # No GCode analysis: fall back to simple linear deduction from baseline
            accurate_remaining = max(
                0.0, baseline * (1.0 - progress / 100.0)
            )
            deduction_method += "+linear-no-gcode"

        filament_spool.remaining_weight_g = accurate_remaining
        try:
            db.session.commit()
            spool_remaining_g = round(accurate_remaining, 2)
        except Exception:
            db.session.rollback()
            spool_remaining_g = round(filament_spool.remaining_weight_g, 2)
    elif filament_spool:
        spool_remaining_g = round(filament_spool.remaining_weight_g, 2)
        deduction_method = "idle-no-deduction"

    filament_block: dict = {
        "assigned_filament_name": filament_spool.name if filament_spool else None,
        "assigned_filament_id": filament_spool.id if filament_spool else None,
        "spool_remaining_g": spool_remaining_g,
        "total_job_weight_g": round(total_job_weight_g, 2),
        "total_job_filament_mm": round(total_job_filament_mm, 2),
        "used_weight_g": round(used_weight_g, 2),
        "used_filament_mm": round(used_filament_mm, 2),
        "remaining_job_weight_g": round(remaining_job_weight_g, 2),
        "gcode_analysis_found": gcode_found,
        "deduction_method": deduction_method,
    }

    # 4. Build layers block
    layer_stats_full = analysis.layer_stats if analysis else []
    total_layers = len(layer_stats_full)
    completed_layers = 0
    if total_layers > 0 and progress > 0:
        completed_layers = max(0, min(total_layers - 1,
                                      round(total_layers * progress / 100.0)))

    # Annotate each layer with a running cumulative weight
    annotated_layers = []
    cumulative_weight_g = 0.0
    cumulative_filament_mm = 0.0
    for i, stat in enumerate(layer_stats_full):
        cumulative_weight_g += stat.get("weight_g", 0.0)
        cumulative_filament_mm += stat.get("filament_mm", 0.0)
        annotated_layers.append({
            **stat,
            "cumulative_weight_g": round(cumulative_weight_g, 4),
            "cumulative_filament_mm": round(cumulative_filament_mm, 2),
            "completed": i < completed_layers,
        })

    layers_block = {
        "total": total_layers,
        "completed_estimate": completed_layers,
        "layer_stats": annotated_layers,
    }

    return jsonify({
        "ip": ip,
        "state": state,
        "progress": round(progress, 2),
        "job_filename": job_filename or None,
        "nozzle_temp": printer_data.get("nozzle"),
        "bed_temp": printer_data.get("bed"),
        "filament": filament_block,
        "layers": layers_block,
    })


@app.get("/printer/<ip>/files")
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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
@token_required
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


@app.get("/history")
@token_required
def get_history_route():
    """Get the print history.
    ---
    tags:
      - Print History
    parameters:
      - name: limit
        in: query
        required: false
        type: integer
        default: 100
    responses:
      200:
        description: List of print history records
    """
    limit = request.args.get("limit", 100, type=int)
    history_records = PrintHistory.query.order_by(PrintHistory.id.desc()).limit(limit).all()
    return jsonify({"history": [record.to_dict() for record in history_records]})


@app.get("/filaments")
@token_required
def get_filaments_route():
    """Get all filament spools.
    ---
    tags:
      - Filaments
    responses:
      200:
        description: List of filaments
    """
    filaments = Filament.query.all()
    return jsonify({"filaments": [f.to_dict() for f in filaments]})


@app.post("/filaments")
@token_required
def create_filament_route():
    """Create a new filament spool.
    ---
    tags:
      - Filaments
    responses:
      201:
        description: Created filament
    """
    payload = request.get_json(silent=True) or {}
    if not payload.get("name"):
        return jsonify({"error": "name is required"}), 400

    assigned_printer_name = payload.get("assigned_printer_name")
    
    # Check if any other filaments are already assigned to this printer, unassign them if so
    if assigned_printer_name:
        existing_filaments = Filament.query.filter_by(assigned_printer_name=assigned_printer_name).all()
        for existing in existing_filaments:
            existing.assigned_printer_name = None

    f = Filament(
        name=payload.get("name"),
        material=payload.get("material", "PLA"),
        color=payload.get("color", "Black"),
        total_weight_g=float(payload.get("total_weight_g", 1000.0)),
        remaining_weight_g=float(payload.get("remaining_weight_g", 1000.0)),
        assigned_printer_name=assigned_printer_name,
    )
    db.session.add(f)
    db.session.commit()
    return jsonify({"filament": f.to_dict()}), 201


@app.put("/filaments/<int:filament_id>")
@token_required
def update_filament_route(filament_id: int):
    """Update a filament spool (e.g. assign to printer, update weight).
    ---
    tags:
      - Filaments
    responses:
      200:
        description: Updated filament
    """
    payload = request.get_json(silent=True) or {}
    f = db.session.get(Filament, filament_id)
    if not f:
        return jsonify({"error": "Filament not found"}), 404

    if "name" in payload:
        f.name = payload["name"]
    if "material" in payload:
        f.material = payload["material"]
    if "color" in payload:
        f.color = payload["color"]
    if "total_weight_g" in payload:
        f.total_weight_g = float(payload["total_weight_g"])
    if "remaining_weight_g" in payload:
        f.remaining_weight_g = float(payload["remaining_weight_g"])
    
    # Check if assigned_printer_name is being updated
    if "assigned_printer_name" in payload:
        name = payload["assigned_printer_name"]
        if name:
            # Check if any other filaments are already assigned to this printer, unassign them if so
            existing_filaments = Filament.query.filter_by(assigned_printer_name=name).all()
            for existing in existing_filaments:
                if existing.id != f.id:
                    existing.assigned_printer_name = None
        f.assigned_printer_name = name

    db.session.commit()
    return jsonify({"filament": f.to_dict()})


@app.delete("/filaments/<int:filament_id>")
@token_required
def delete_filament_route(filament_id: int):
    """Delete a filament spool.
    ---
    tags:
      - Filaments
    responses:
      200:
        description: Deleted
    """
    f = db.session.get(Filament, filament_id)
    if not f:
        return jsonify({"error": "Filament not found"}), 404
        
    db.session.delete(f)
    db.session.commit()
    return jsonify({"message": "Filament deleted"})


@app.get("/filaments/live")
@token_required
def get_live_filaments_route():
    """Get all filament spools with real-time projected remaining weight.
    ---
    tags:
      - Filaments
    produces:
      - application/json
    responses:
      200:
        description: >
          List of filaments augmented with live printer state and projected
          remaining weight. No database writes are performed.
        schema:
          type: object
          properties:
            filaments:
              type: array
              items:
                type: object
    """
    filaments = Filament.query.all()

    # Build a set of unique printer identifiers (name or IP) that have an
    # assigned filament so we only poll those printers.
    assigned_ids = set()
    for f in filaments:
        if f.assigned_printer_name:
            assigned_ids.add(f.assigned_printer_name)

    # Fetch live status for all printers and index by both name and IP so we
    # can match whichever identifier the filament was saved with.
    printer_status_by_id: dict = {}
    if assigned_ids:
        try:
            live_printers = scan_network()
            for p in live_printers:
                p_ip = p.get("ip")
                p_name = p.get("name")
                if p_ip:
                    printer_status_by_id[p_ip] = p
                if p_name:
                    printer_status_by_id[p_name] = p
        except Exception:
            pass  # Degrade gracefully — return static DB values

    result = []
    for f in filaments:
        filament_dict = f.to_dict()

        if f.assigned_printer_name:
            printer = printer_status_by_id.get(f.assigned_printer_name)
            if printer:
                state = (printer.get("state") or "unknown").lower()
                progress = float(printer.get("progress") or 0.0)
                job_filename = printer.get("job_filename")

                filament_dict["printer_state"] = state
                filament_dict["printer_progress"] = round(progress, 2)
                filament_dict["printer_ip"] = printer.get("ip")
                filament_dict["printer_job_filename"] = job_filename

                # Project live remaining weight using layer-based computation
                # (same logic as /printer/<ip>/print/progress).
                # This is more accurate than a linear progress interpolation
                # because each layer has a precisely measured filament weight.
                if state == "printing" and progress > 0:
                    try:
                        clean_fn = (job_filename or "").split("/")[-1]
                        gcode = (
                            GCodeFile.query.filter_by(filename=clean_fn).first()
                            if clean_fn
                            else None
                        )
                        if gcode and gcode.analysis and gcode.analysis.total_weight_g > 0:
                            layer_stats = gcode.analysis.layer_stats or []
                            total_layers = len(layer_stats)
                            p_ip = printer.get("ip")
                            if total_layers > 0:
                                # Layer-based: sum weights of completed layers
                                completed_layers = max(
                                    0,
                                    min(
                                        total_layers - 1,
                                        round(total_layers * progress / 100.0),
                                    ),
                                )
                                used_g = sum(
                                    s.get("weight_g", 0.0)
                                    for s in layer_stats[:completed_layers]
                                )
                            else:
                                # Linear fallback when no layer data
                                used_g = gcode.analysis.total_weight_g * (progress / 100.0)

                            # Use baseline (spool weight at print start) so we
                            # don't double-count the incremental deductions.
                            baseline = get_filament_baseline(p_ip) if p_ip else None
                            start_weight = (
                                baseline
                                if baseline is not None
                                else f.remaining_weight_g
                            )
                            projected = max(0.0, start_weight - used_g)
                            filament_dict["live_remaining_weight_g"] = round(projected, 2)
                            filament_dict["current_job_weight_g"] = round(
                                gcode.analysis.total_weight_g, 2
                            )
                        else:
                            filament_dict["live_remaining_weight_g"] = f.remaining_weight_g
                    except Exception:
                        filament_dict["live_remaining_weight_g"] = f.remaining_weight_g
                else:
                    filament_dict["live_remaining_weight_g"] = f.remaining_weight_g
            else:
                # Printer not reachable / not found — return static DB values
                filament_dict["printer_state"] = "offline"
                filament_dict["printer_progress"] = 0.0
                filament_dict["live_remaining_weight_g"] = f.remaining_weight_g
        else:
            filament_dict["printer_state"] = None
            filament_dict["printer_progress"] = 0.0
            filament_dict["live_remaining_weight_g"] = f.remaining_weight_g

        result.append(filament_dict)


    return jsonify({"filaments": result})


@app.post("/queue/items/<int:item_id>/dispatch")
@token_required
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
@token_required
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
@token_required
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


@app.get("/debug/printer/<ip>/filament")
@token_required
def debug_printer_filament(ip: str):
    """Diagnostic: show in-memory tracking state and DB filament assignment for a printer.
    ---
    tags:
      - System
    parameters:
      - name: ip
        in: path
        required: true
        type: string
        description: Printer IP address
    responses:
      200:
        description: Debug state for the given printer IP
    """
    from .activity_logger import (
        _printer_states, _printer_progress, _printer_filament_baseline
    )

    # Find assigned filament (name match first, then IP match)
    printer_data = get_printer_status(ip)
    printer_name = (printer_data or {}).get("name")
    filament = None
    match_method = None
    if printer_name:
        filament = Filament.query.filter_by(assigned_printer_name=printer_name).first()
        if filament:
            match_method = "printer_name"
    if filament is None:
        filament = Filament.query.filter_by(assigned_printer_name=ip).first()
        if filament:
            match_method = "printer_ip"

    # Find GCodeFile for the active job
    job_filename_raw = (printer_data or {}).get("job_filename") or ""
    job_filename = job_filename_raw.split("/")[-1]
    gcode = GCodeFile.query.filter_by(filename=job_filename).first() if job_filename else None

    return jsonify({
        "ip": ip,
        "printer_name_from_firmware": printer_name,
        "printer_state_live": (printer_data or {}).get("state"),
        "printer_progress_live": (printer_data or {}).get("progress"),
        "job_filename_raw": job_filename_raw,
        "job_filename_cleaned": job_filename,
        "tracking": {
            "state_in_memory": _printer_states.get(ip),
            "progress_in_memory": _printer_progress.get(ip),
            "filament_baseline_g": _printer_filament_baseline.get(ip),
        },
        "filament_assignment": {
            "found": filament is not None,
            "match_method": match_method,
            "filament_id": filament.id if filament else None,
            "filament_name": filament.name if filament else None,
            "assigned_printer_name_in_db": filament.assigned_printer_name if filament else None,
            "remaining_weight_g": filament.remaining_weight_g if filament else None,
            "total_weight_g": filament.total_weight_g if filament else None,
        },
        "gcode_analysis": {
            "found": gcode is not None,
            "has_analysis": gcode is not None and gcode.analysis is not None,
            "total_weight_g": gcode.analysis.total_weight_g if gcode and gcode.analysis else None,
            "layer_count": gcode.analysis.layer_count if gcode and gcode.analysis else None,
        },
    })

