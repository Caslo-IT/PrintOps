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

Local G-code library storage uses `Backend/data storage` by default and stores
file locations in the local PostgreSQL database named `printops` via SQLAlchemy ORM.
Configure the database connection in `Backend/.env`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/printops
```

Apply database migrations:

```bash
cd Backend
flask db upgrade
```

Create a local storage folder with `POST /gcode/folders` and JSON such as
`{"name": "customer-job-001"}`. The backend creates these subfolders inside it:
`1ft`, `1.5ft`, `2ft`, `2.5ft`, `3ft`, `3.5ft`, `4ft`, `4.5ft`, `5ft`,
`5.5ft`, and `6ft`.

Store a G-code file with `POST /gcode/files` using multipart fields named
`folder`, `size`, and `file`. View stored file metadata with `GET /gcode/files`,
download/view a file with `GET /gcode/files/<id>`, and delete a stored file with
`DELETE /gcode/files/<id>`.

## Backend structure

```text
Backend/
├── main.py           # Flask application entry point
├── wsgi.py           # Flask CLI discovery entry point
├── migrations/       # Flask-Migrate / Alembic migration scripts
└── app/
    ├── api.py        # Flask app and routes
    ├── config.py     # Environment-based configuration
    ├── gcode_storage.py # Storage management backed by SQLAlchemy ORM
    ├── models.py     # SQLAlchemy ORM database models
    ├── network.py    # Local network and IP discovery
    ├── protocols.py  # Creality WebSocket and Moonraker clients
    └── services.py   # Printer scanning and status fallback logic
```

