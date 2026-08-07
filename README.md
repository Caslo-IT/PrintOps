# PrintOps

## Run

```bash
cd Backend
python3 -m pip install -r requirements.txt
flask run --debug
```

Open `http://127.0.0.1:8000/printers`.

Interactive Swagger documentation is available at
`http://127.0.0.1:5000/apidocs/`.

The scanner detects the computer's local `/24` network automatically. If the
printer has a known address, scan only that address:

```bash
PRINTER_IPS=192.168.1.50 python3 -m uvicorn main:app --reload
```

Stock K1 Max firmware is detected through Creality's WebSocket service on
port `9999`. Rooted printers with Moonraker enabled are also supported on
port `7125`.

The G-code files in printer storage are available from
`GET /printer/<ip>/files`. Stock Creality printers are queried through their
WebSocket file-list request; rooted printers fall back to Moonraker's
`server/files/list` API.

Upload a local G-code file with `POST /printer/<ip>/files` using a multipart
field named `file`. The stock printer receives it through its `/upload` API.

Start a file already stored on the printer with
`POST /printer/<ip>/print` and JSON such as
`{"path": "/usr/data/printer_data/gcodes/example.gcode"}`.

Print control is available through `POST /printer/<ip>/pause`,
`POST /printer/<ip>/resume`, and `POST /printer/<ip>/stop`.

## Backend structure

```text
Backend/
├── main.py           # Flask application entry point
├── wsgi.py           # Flask CLI discovery entry point
└── app/
    ├── api.py        # FastAPI app and routes
    ├── config.py     # Environment-based configuration
    ├── network.py    # Local network and IP discovery
    ├── protocols.py  # Creality WebSocket and Moonraker clients
    └── services.py   # Printer scanning and status fallback logic
```
