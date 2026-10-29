"""
Flask extensions initialization module.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
csrf = CSRFProtect()

login_manager.login_view = "admin.login"
login_manager.login_message = "Please sign in to access the admin dashboard."
login_manager.login_message_category = "warning"


@login_manager.unauthorized_handler
def handle_unauthorized():
    from flask import request, jsonify, redirect, url_for
    if request.path.startswith("/api/") or request.is_json:
        return jsonify({"success": False, "error": "Authentication required. Please log in."}), 401
    return redirect(url_for("admin.login"))

