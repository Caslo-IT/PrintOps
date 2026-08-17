from app.api import app
from app.models import db, User
from app.auth import hash_password

def seed_admin():
    with app.app_context():
        admin = User.query.filter_by(username="admin").first()
        if not admin:
            print("Creating default admin user...")
            admin = User(
                username="admin",
                password_hash=hash_password("password"),
                role="admin"
            )
            db.session.add(admin)
            db.session.commit()
            print("Default admin created (username: admin, password: password)")
        else:
            print("Admin user already exists.")

if __name__ == "__main__":
    seed_admin()
