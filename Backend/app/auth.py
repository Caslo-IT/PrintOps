import os
from datetime import datetime, timedelta, timezone
from functools import wraps
import jwt
import bcrypt
from flask import request, jsonify
from .models import User

# Load the secret key, fallback to a random string for development if not set
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev_secret_key_change_in_production")
JWT_EXPIRATION_HOURS = 24

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def check_password(password: str, hashed_password: str) -> bool:
    """Check a password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))

def generate_token(user_id: int, username: str, role: str) -> str:
    """Generate a JWT token for a user."""
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")

def get_current_user():
    """Extract user information from the current request's JWT."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None

    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
    else:
        token = auth_header
    try:
        data = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
        return User.query.get(data["user_id"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    """Decorator to require a valid JWT token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user = get_current_user()
        if not current_user:
            return jsonify({"error": "Authentication required"}), 401
        
        # Pass the current_user to the route function
        # Using flask.g would be better, but passing it as an argument is also okay
        # For this app, let's just make it accessible via get_current_user() inside the route
        # if they need it, or we can use flask.g
        from flask import g
        g.current_user = current_user
        
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    """Decorator to require a valid JWT token with admin role."""
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user = get_current_user()
        if not current_user:
            return jsonify({"error": "Authentication required"}), 401
        
        if current_user.role != "admin":
            return jsonify({"error": "Admin privileges required"}), 403
            
        from flask import g
        g.current_user = current_user
        
        return f(*args, **kwargs)
    return decorated
