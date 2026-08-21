from app import create_app, db
from app.models import Filament

# app = create_app() does not work because create_app is not in app/__init__.py
