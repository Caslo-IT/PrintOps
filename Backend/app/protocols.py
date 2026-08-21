"""Printer protocol clients and status normalization."""

import asyncio
import json
import posixpath
from urllib.parse import quote, urlsplit

import requests
import websockets

from .config import CREALITY_PORT, MOONRAKER_PORT


CREALITY_STATES = {
    0: ("idle", "Printer is idle and ready."),
    1: ("preparing", "Printer is preparing a print."),
    2: ("printing", "Printer is currently printing."),
    3: ("paused", "The print is paused."),
    4: ("completed", "The last print completed."),
    5: ("error", "Printer reported an error."),
}


def field(data, *names, default=0):
    """Find a value in a stock Creality status message."""
    if not isinstance(data, dict):
        return default
    for name in names:
        if name in data:
            return data[name]
    for value in data.values():
        if isinstance(value, dict):
            result = field(value, *names, default=None)
            if result is not None:
                return result
    return default


def nested_value(data, name):
    """Find a named value in a nested printer response."""
    if isinstance(data, dict):
        if name in data:
            return data[name]
        for value in data.values():
            result = nested_value(value, name)
            if result is not None:
                return result
    elif isinstance(data, list):
        for value in data:
            result = nested_value(value, name)
            if result is not None:
                return result
    return None


def describe_creality_state(code):
    try:
        code = int(code)
    except (TypeError, ValueError):
        return "unknown", "Printer returned an unrecognised state code."
    return CREALITY_STATES.get(
        code,
        ("unknown", f"Unknown Creality state code {code}; firmware may use a different mapping."),
    )


async def get_creality_status(ip):
    """Connect to the WebSocket used by stock K1/K1 Max firmware."""
    uri = f"ws://{ip}:{CREALITY_PORT}"
    status_message = {}
    try:
        async with websockets.connect(
            uri,
            open_timeout=1,
            close_timeout=0.2,
            ping_interval=None,
        ) as websocket:
            await websocket.send(json.dumps({"ModeCode": "heart_beat", "msg": 0}))
            try:
                for _ in range(3):
                    message = await asyncio.wait_for(websocket.recv(), timeout=0.8)
                    if isinstance(message, bytes):
                        message = message.decode("utf-8", errors="ignore")
                    if message.strip().lower() == "ok":
                        continue
                    parsed = json.loads(message)
                    if parsed.get("ModeCode") != "heart_beat":
                        status_message = parsed
                        break
            except (asyncio.TimeoutError, json.JSONDecodeError):
                pass

        state_code = field(status_message, "state", "machineStatus", default=None)
        state_name, state_detail = describe_creality_state(state_code)
        return {
            "ip": ip,
            "online": True,
            "protocol": "creality-websocket",
            "state": state_name,
            "state_code": state_code,
            "state_detail": state_detail,
            "progress": field(status_message, "printProgress", "progress", default=0),
            "job_filename": field(status_message, "printJobName", "printFile", "file", default=None),
            "nozzle": field(status_message, "nozzleTemp", "temperature", default=0),
            "bed": field(status_message, "bedTemp", default=0),
            "name": field(status_message, "hostname", default=None) or field(status_message, "model", default=None),
            "web_ui": f"http://{ip}:80",
            "camera": f"http://{ip}:80",
            "details": status_message,
        }
    except Exception:
        return None


async def get_creality_files(ip):
    """Get G-code files from the stock Creality WebSocket API."""
    printer_host = urlsplit(f"//{ip}").hostname
    if not printer_host:
        return None

    uri = f"ws://{printer_host}:{CREALITY_PORT}"
    try:
        async with websockets.connect(
            uri,
            open_timeout=1,
            close_timeout=0.2,
            ping_interval=None,
        ) as websocket:
            await websocket.send(json.dumps({
                "method": "get",
                "params": {"reqGcodeFile": 1},
            }))

            for _ in range(5):
                message = await asyncio.wait_for(websocket.recv(), timeout=1)
                if isinstance(message, bytes):
                    message = message.decode("utf-8", errors="ignore")
                try:
                    payload = json.loads(message)
                except (TypeError, json.JSONDecodeError):
                    continue

                file_info_list = nested_value(payload, "retGcodeFileInfo2")
                if isinstance(file_info_list, list):
                    return [
                        {
                            "path": item.get("path", "").replace("\\/", "/"),
                            "name": item.get("name", ""),
                            "size": item.get("file_size", 0),
                            "time": item.get("create_time", 0),
                            "duration": item.get("timeCost", 0),
                            "layers": item.get("floorHeight", 0),
                            "material": item.get("material", ""),
                            "thumbnail": item.get("thumbnail", "").replace("\\/", "/"),
                            "preview": item.get("preview", "").replace("\\/", "/"),
                        }
                        for item in file_info_list
                        if isinstance(item, dict)
                        and item.get("name", "").lower().endswith(
                            (".gcode", ".gco", ".g")
                        )
                    ]

                file_info = nested_value(payload, "retGcodeFileInfo")
                if isinstance(file_info, dict):
                    file_info = file_info.get("fileInfo")
                if not isinstance(file_info, str):
                    continue

                files = []
                for record in file_info.split(";"):
                    fields = record.split(":")
                    if len(fields) < 6:
                        continue
                    try:
                        files.append({
                            "path": fields[0],
                            "name": fields[1],
                            "size": int(fields[2]),
                            "layer": int(fields[3]),
                            "time": int(fields[4]),
                            "length": float(fields[5]) / 1000,
                            "thumbnail": (
                                f"http://{printer_host}:80/downloads/"
                                f"thumbnail/{fields[1]}"
                            ),
                        })
                    except (TypeError, ValueError):
                        continue
                return files
    except Exception:
        return None


def get_moonraker_status(ip):
    """Query a Moonraker endpoint exposed by a rooted printer."""
    try:
        response = requests.get(
            f"http://{ip}:{MOONRAKER_PORT}/printer/objects/query",
            params={
                "print_stats": "",
                "virtual_sdcard": "",
                "extruder": "",
                "heater_bed": "",
            },
            timeout=2,
        )
        response.raise_for_status()
        status = response.json().get("result", {}).get("status", {})
        return {
            "ip": ip,
            "online": True,
            "protocol": "moonraker",
            "state": status.get("print_stats", {}).get("state", "unknown"),
            "progress": status.get("virtual_sdcard", {}).get("progress", 0) * 100.0,
            "job_filename": status.get("print_stats", {}).get("filename", None),
            "nozzle": status.get("extruder", {}).get("temperature", 0),
            "bed": status.get("heater_bed", {}).get("temperature", 0),
            "name": response.json().get("result", {}).get("status", {}).get("mcu", {}).get("mcu_name") or None,
            "camera": f"http://{ip}:4408/webcam/?action=stream",
        }
    except (requests.RequestException, ValueError, KeyError, TypeError):
        return None


def get_moonraker_files(ip):
    """Return the G-code files stored in a Moonraker printer."""
    try:
        # The frontend may pass the web UI value (for example, 192.168.1.17:80).
        # Moonraker must still be queried on its own configured port.
        printer_host = urlsplit(f"//{ip}").hostname
        if not printer_host:
            return None
        response = requests.get(
            f"http://{printer_host}:{MOONRAKER_PORT}/server/files/list",
            params={"root": "gcodes"},
            timeout=2,
        )
        response.raise_for_status()
        payload = response.json()
        files = payload.get("result", payload)
        if not isinstance(files, list):
            return None

        return [
            item for item in files
            if isinstance(item, dict)
            and item.get("type", "file") == "file"
            and item.get("path", "").lower().endswith((".gcode", ".gco", ".g"))
        ]
    except (requests.RequestException, ValueError, AttributeError, TypeError):
        return None


def get_printer_files(ip):
    """Get files from a supported printer storage API."""
    stock_files = asyncio.run(get_creality_files(ip))
    return stock_files if stock_files is not None else get_moonraker_files(ip)


def upload_creality_file(ip, filename, content, content_type="application/octet-stream"):
    """Upload a G-code file to stock Creality printer storage."""
    printer_host = urlsplit(f"//{ip}").hostname
    if not printer_host:
        return None

    try:
        response = requests.post(
            f"http://{printer_host}:80/upload/{quote(filename)}",
            files={"file": (filename, content, content_type)},
            timeout=30,
        )
        response.raise_for_status()
        try:
            printer_response = response.json()
        except ValueError:
            printer_response = {"text": response.text}
        return {"filename": filename, "printer_response": printer_response}
    except requests.RequestException:
        return None


def upload_printer_file(ip, filename, content, content_type="application/octet-stream"):
    """Upload a G-code file using the printer's supported storage API."""
    return upload_creality_file(ip, filename, content, content_type)


async def start_creality_print(ip, file_path):
    """Start printing a G-code file already stored on a stock printer."""
    printer_host = urlsplit(f"//{ip}").hostname
    normalized_path = posixpath.normpath(file_path.replace("\\/", "/"))
    storage_root = "/usr/data/printer_data/gcodes/"
    if not printer_host or not normalized_path.startswith(storage_root):
        return False
    if not normalized_path.lower().endswith((".gcode", ".gco", ".g")):
        return False

    directory, filename = posixpath.split(normalized_path)
    try:
        async with websockets.connect(
            f"ws://{printer_host}:{CREALITY_PORT}",
            open_timeout=1,
            close_timeout=0.2,
            ping_interval=None,
        ) as websocket:
            await websocket.send(json.dumps({
                "method": "set",
                "params": {"opGcodeFile": f"printprt:{directory}/{filename}"},
            }))
        return True
    except Exception:
        return False


def start_printer_print(ip, file_path):
    """Start a stored G-code file on a supported printer."""
    return asyncio.run(start_creality_print(ip, file_path))


async def send_creality_control(ip, action):
    """Send a pause, resume, or stop command to stock Creality firmware."""
    printer_host = urlsplit(f"//{ip}").hostname
    commands = {
        "pause": {"pause": 1},
        "resume": {"pause": 0},
        "stop": {"stop": 1},
    }
    if not printer_host or action not in commands:
        return False

    try:
        async with websockets.connect(
            f"ws://{printer_host}:{CREALITY_PORT}",
            open_timeout=1,
            close_timeout=0.2,
            ping_interval=None,
        ) as websocket:
            await websocket.send(json.dumps({
                "method": "set",
                "params": commands[action],
            }))
        return True
    except Exception:
        return False


def control_moonraker(ip, action):
    """Send a print control command to Moonraker."""
    endpoints = {
        "pause": "pause",
        "resume": "resume",
        "stop": "cancel",
    }
    printer_host = urlsplit(f"//{ip}").hostname
    if not printer_host or action not in endpoints:
        return False
    try:
        response = requests.post(
            f"http://{printer_host}:{MOONRAKER_PORT}/printer/print/{endpoints[action]}",
            timeout=3,
        )
        response.raise_for_status()
        return True
    except requests.RequestException:
        return False


def control_printer(ip, action):
    """Pause, resume, or stop a supported printer."""
    if asyncio.run(send_creality_control(ip, action)):
        return True
    return control_moonraker(ip, action)
