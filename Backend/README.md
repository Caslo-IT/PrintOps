# PrintOps Backend Service

Flask-based REST API for discovering and monitoring Creality K1 Max / Moonraker 3D printers, managing local G-code storage, and storing parsed G-code analysis metrics in PostgreSQL.

---

## 1. Environment Setup

### Prerequisites
- Python 3.10+
- PostgreSQL database instance (e.g. database named `printops`)

### Installation

1. Navigate to the `Backend` directory:
   ```bash
   cd Backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

---

## 2. Environment Configuration

Create or update the `.env` file inside the `Backend` directory:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/printops
MOONRAKER_PORT=7125
CREALITY_PORT=9999
```

> **Note**: Replace `postgres:postgres@localhost:5432/printops` with your local PostgreSQL database credentials and host details.

---

## 3. Database Migrations

This backend uses **Flask-Migrate** (powered by Alembic) to manage database schema updates.

### Apply Migrations
Run all pending migrations to set up the database tables (`gcode_files`, `gcode_analyses`):

```bash
flask db upgrade
```

### Other Useful Migration Commands

- **Check Current Migration Status**:
  ```bash
  flask db current
  ```

- **Generate a New Migration** (after modifying ORM models in `app/models.py`):
  ```bash
  flask db migrate -m "Description of model changes"
  ```

- **Rollback Last Migration**:
  ```bash
  flask db downgrade
  ```

---

## 4. Running the Application

### Development Server
Start the Flask API server with hot-reload enabled:

```bash
flask run --debug
```

Or run via the main entry point:

```bash
python main.py
```

- **API Base URL**: `http://127.0.0.1:5000/`
- **Swagger Documentation**: Interactive API docs are available at `http://127.0.0.1:5000/apidocs/`

---

## 5. Backend Directory Structure

```text
Backend/
├── main.py              # Application entry point
├── wsgi.py              # WSGI server compatibility entry point
├── requirements.txt     # Python dependencies
├── .env                 # Environment variables
├── migrations/          # Flask-Migrate / Alembic migration scripts
└── app/
    ├── api.py           # Flask HTTP routes and API setup
    ├── config.py        # Environment-based configuration loader
    ├── gcode_analyzer.py # Parses G-code files for print metrics & layer stats
    ├── gcode_storage.py  # G-code file storage management backed by ORM
    ├── models.py        # SQLAlchemy ORM database models
    ├── network.py       # Local network printer scanner
    ├── protocols.py     # Creality WebSocket & Moonraker protocol clients
    └── services.py      # Printer status aggregation & fallback logic
```
