import os
import logging
from datetime import datetime
from flask import Flask, render_template, jsonify
from config import config_by_name, Config
from app.extensions import db, migrate, login_manager, csrf
from app.routes.public import public_bp
from app.routes.registration import registration_bp
from app.routes.payment import payment_bp
from app.routes.admin import admin_bp

logger = logging.getLogger(__name__)


def create_app(config_name: str = None) -> Flask:
    """Application factory for SYNEX Hackathon Portal."""
    if not config_name:
        config_name = os.environ.get("FLASK_ENV", "development")

    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
    )

    app_config = config_by_name.get(config_name, config_by_name["default"])
    app.config.from_object(app_config)

    # Dynamically resolve database URI if not preset (e.g., TestingConfig pre-sets sqlite:///:memory:)
    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        app.config["SQLALCHEMY_DATABASE_URI"] = app_config.get_database_uri()

    # SQLite does not support pool_size or max_overflow (QueuePool options)
    if app.config.get("SQLALCHEMY_DATABASE_URI", "").startswith("sqlite"):
        opts = dict(app.config.get("SQLALCHEMY_ENGINE_OPTIONS") or {})
        opts.pop("pool_size", None)
        opts.pop("max_overflow", None)
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = opts

    # Logging setup
    logging.basicConfig(
        level=logging.DEBUG if app.config.get("DEBUG") else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)

    # Exempt REST API routes from CSRF to allow seamless vanilla JS fetch() calls and webhook payloads
    csrf.exempt(public_bp)
    csrf.exempt(registration_bp)
    csrf.exempt(payment_bp)
    csrf.exempt(admin_bp)

    # Register blueprints
    app.register_blueprint(public_bp)
    app.register_blueprint(registration_bp)
    app.register_blueprint(payment_bp)
    app.register_blueprint(admin_bp)

    # Global context processors
    @app.context_processor
    def inject_global_vars():
        try:
            from app.models.event_setting import EventSetting
            event_name = EventSetting.get_val("EVENT_NAME", app.config.get("EVENT_NAME", "SYNEX 2026"))
            indiv_fee = int(EventSetting.get_val("EVENT_INDIVIDUAL_FEE", app.config.get("EVENT_INDIVIDUAL_FEE", 299)))
            team_fee = int(EventSetting.get_val("EVENT_TEAM_FEE", app.config.get("EVENT_TEAM_FEE", 999)))
            prize_pool = EventSetting.get_val("TOTAL_PRIZE_POOL", app.config.get("TOTAL_PRIZE_POOL", "₹2,50,000"))
        except Exception:
            event_name = app.config.get("EVENT_NAME", "SYNEX 2026")
            indiv_fee = app.config.get("EVENT_INDIVIDUAL_FEE", 299)
            team_fee = app.config.get("EVENT_TEAM_FEE", 999)
            prize_pool = app.config.get("TOTAL_PRIZE_POOL", "₹2,50,000")

        return {
            "current_year": datetime.utcnow().year,
            "event_name": event_name,
            "individual_fee": indiv_fee,
            "team_fee": team_fee,
            "prize_pool": prize_pool,
            "currency": app.config.get("EVENT_CURRENCY", "INR"),
            "razorpay_key_id": app.config.get("RAZORPAY_KEY_ID", ""),
        }

    # Error handlers
    @app.errorhandler(404)
    def not_found_error(error):
        if request_wants_json():
            return jsonify({"success": False, "error": "Requested resource not found"}), 404
        return render_template("index.html"), 404

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        logger.error(f"Internal Server Error: {error}")
        if request_wants_json():
            return jsonify({"success": False, "error": "Internal server error occurred"}), 500
        return render_template("index.html"), 500

    def request_wants_json():
        from flask import request
        return (
            request.accept_mimetypes["application/json"]
            >= request.accept_mimetypes["text/html"]
            or request.path.startswith("/api/")
        )

    # Register CLI commands
    register_cli_commands(app)

    return app


def register_cli_commands(app: Flask):
    """Registers custom flask CLI commands."""
    import click
    from app.models.admin import Admin
    from app.models.event_setting import EventSetting

    @app.cli.command("init-db")
    def init_db():
        """Creates all database tables and default configuration."""
        db.create_all()
        # Seed default event settings
        EventSetting.set_val("EVENT_INDIVIDUAL_FEE", "299", "Individual Registration Fee in INR")
        EventSetting.set_val("EVENT_TEAM_FEE", "999", "Team Registration Fee in INR")
        EventSetting.set_val("REGISTRATION_OPEN", "true", "Whether registrations are open")
        click.echo("[OK] Database tables initialized and default settings applied.")

    @app.cli.command("check-db")
    def check_db():
        """Verifies database health, connection dialect, database name, and table schema."""
        from sqlalchemy import text, inspect

        click.echo("==================================================")
        click.echo(" SYNEX Hackathon Portal - Database Health Check")
        click.echo("==================================================")

        # 1. Config loading check
        host = app.config.get("DB_HOST", "Unknown")
        port = app.config.get("DB_PORT", "Unknown")
        dbname = app.config.get("DB_NAME", "Unknown")
        user = app.config.get("DB_USER", "Unknown")
        fallback_allowed = app.config.get("USE_SQLITE_FALLBACK", False)

        click.echo("[1/6] Database Configuration Loaded:")
        click.echo(f"      - Target Host:     {host}:{port}")
        click.echo(f"      - Database Name:   {dbname}")
        click.echo(f"      - DB User:         {user}")
        click.echo(f"      - Password:        [MASKED/CONFIGURED]")
        click.echo(f"      - SQLite Fallback: {'Enabled' if fallback_allowed else 'Disabled (Strict MySQL)'}")

        # 2. SQLAlchemy connection check
        click.echo("[2/6] Establishing SQLAlchemy Connection...")
        try:
            with db.engine.connect() as conn:
                click.echo("      [OK] Connection established successfully.")

                # 3. Dialect check
                dialect_name = db.engine.dialect.name
                click.echo(f"[3/6] Database Engine Dialect: {dialect_name}")
                if dialect_name == "mysql":
                    click.echo("      [OK] Active database engine is MySQL 8.")
                else:
                    click.echo(f"      [WARN] Active dialect is '{dialect_name}' (expected 'mysql').")

                # 4. Database Name check
                if dialect_name == "mysql":
                    res = conn.execute(text("SELECT DATABASE()")).scalar()
                    click.echo(f"[4/6] Selected Database: {res}")
                    if res == dbname:
                        click.echo(f"      [OK] Connected to target database '{dbname}'.")
                    else:
                        click.echo(f"      [WARN] Expected database '{dbname}', but got '{res}'.")
                else:
                    click.echo("[4/6] Selected Database: SQLite Local Database")

                # 5. Required tables check
                expected_tables = [
                    "admins",
                    "participants",
                    "teams",
                    "team_members",
                    "registrations",
                    "payments",
                    "event_settings",
                    "contact_messages",
                ]
                inspector = inspect(db.engine)
                existing_tables = inspector.get_table_names()
                missing_tables = [t for t in expected_tables if t not in existing_tables]

                click.echo(f"[5/6] Inspecting Database Tables:")
                click.echo(f"      - Found tables ({len(existing_tables)}): {', '.join(sorted(existing_tables)) if existing_tables else 'None'}")
                if not missing_tables:
                    click.echo("      [OK] All 8 required application tables exist.")
                else:
                    click.echo(f"      [WARN] Missing tables: {', '.join(missing_tables)}")
                    click.echo("      Run 'flask init-db' or 'flask db upgrade' to initialize missing tables.")

                # 6. Simple query execution
                val = conn.execute(text("SELECT 1")).scalar()
                click.echo(f"[6/6] Executing Diagnostic Query 'SELECT 1'...")
                if val == 1:
                    click.echo("      [OK] Query 'SELECT 1' executed successfully.")
                else:
                    click.echo("      [FAIL] Query 'SELECT 1' returned unexpected result.")

        except Exception as e:
            click.echo(f"\n[FAIL] Database Connection Failed: {e}")
            click.echo("\nTroubleshooting Guidance:")
            click.echo("1. Ensure MySQL service is running: Open PowerShell as Admin and run 'Start-Service MySQL80'")
            click.echo("2. Verify credentials in .env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)")
            click.echo("3. Ensure database exists: CREATE DATABASE IF NOT EXISTS synex_hackathon;")
            click.echo("4. Ensure user exists and has privileges on synex_hackathon.*")
            return

        click.echo("==================================================")
        click.echo(" Database Health Status: HEALTHY (MySQL Connected)")
        click.echo("==================================================")

    @app.cli.command("create-admin")
    @click.option("--username", default="admin", help="Admin username")
    @click.option("--email", default="admin@synex.org", help="Admin email")
    @click.option("--password", default="Admin@SYNEX2026", help="Admin password")
    @click.option("--name", default="Portal Administrator", help="Full name")
    def create_admin(username, email, password, name):
        """Creates an administrator account with hashed password."""
        admin = Admin.query.filter(
            (Admin.username == username) | (Admin.email == email)
        ).first()
        if admin:
            admin.set_password(password)
            admin.full_name = name
            admin.is_active_account = True
            db.session.commit()
            click.echo(f"[OK] Admin account '{username}' updated successfully.")
        else:
            admin = Admin(
                username=username,
                email=email,
                full_name=name,
                role="admin",
                is_active_account=True,
            )
            admin.set_password(password)
            db.session.add(admin)
            db.session.commit()
            click.echo(f"[OK] Admin account '{username}' ({email}) created successfully.")

    @app.cli.command("seed-demo")
    def seed_demo():
        """Populates database with realistic sample registrations for dashboard testing."""
        from app.services.registration_service import register_participant
        from app.services.payment_service import verify_payment_signature
        from app.models.registration import Registration

        # Create admin first
        admin = Admin.query.filter_by(username="admin").first()
        if not admin:
            admin = Admin(
                username="admin",
                email="admin@synex.org",
                full_name="Portal Administrator",
                role="admin",
            )
            admin.set_password("Admin@SYNEX2026")
            db.session.add(admin)
            db.session.commit()

        # Seed sample registrations if none exist
        if Registration.query.count() == 0:
            demo_registrations = [
                {
                    "registration_type": "team",
                    "team_name": "Neural Pioneers",
                    "domain": "AI & Machine Learning",
                    "leader": {
                        "name": "Aarav Sharma",
                        "email": "aarav.sharma@example.com",
                        "phone": "9876543210",
                        "college": "National Institute of Technology",
                        "department": "Computer Science & Engineering",
                        "year": "3rd Year",
                    },
                    "members": [
                        {
                            "name": "Ananya Iyer",
                            "email": "ananya.iyer@example.com",
                            "phone": "9876543211",
                            "college": "National Institute of Technology",
                            "department": "Computer Science & Engineering",
                            "year": "3rd Year",
                        },
                        {
                            "name": "Rohan Deshmukh",
                            "email": "rohan.d@example.com",
                            "phone": "9876543212",
                            "college": "National Institute of Technology",
                            "department": "Information Technology",
                            "year": "3rd Year",
                        },
                    ],
                },
                {
                    "registration_type": "individual",
                    "domain": "Web3 & Blockchain",
                    "full_name": "Priya Nair",
                    "email": "priya.nair@example.com",
                    "phone": "9812345678",
                    "college": "Indian Institute of Science",
                    "department": "Data Science & AI",
                    "year_of_study": "4th Year",
                },
                {
                    "registration_type": "team",
                    "team_name": "CyberSentinels",
                    "domain": "Cloud & Cybersecurity",
                    "leader": {
                        "name": "Vikram Rathore",
                        "email": "vikram.r@example.com",
                        "phone": "9988776655",
                        "college": "Birla Institute of Technology",
                        "department": "Information Security",
                        "year": "4th Year",
                    },
                    "members": [
                        {
                            "name": "Neha Gupta",
                            "email": "neha.gupta@example.com",
                            "phone": "9988776656",
                            "college": "Birla Institute of Technology",
                            "department": "Computer Science",
                            "year": "4th Year",
                        }
                    ],
                },
                {
                    "registration_type": "individual",
                    "domain": "IoT & Embedded Systems",
                    "full_name": "Aditya Varma",
                    "email": "aditya.v@example.com",
                    "phone": "9765432109",
                    "college": "Delhi Technological University",
                    "department": "Electronics & Communication",
                    "year_of_study": "2nd Year",
                },
                {
                    "registration_type": "team",
                    "team_name": "PulseHealth AI",
                    "domain": "Healthcare & MedTech",
                    "leader": {
                        "name": "Sneha Roy",
                        "email": "sneha.roy@example.com",
                        "phone": "9654321098",
                        "college": "Vellore Institute of Technology",
                        "department": "Biomedical Engineering",
                        "year": "3rd Year",
                    },
                    "members": [
                        {
                            "name": "Karthik Menon",
                            "email": "karthik.m@example.com",
                            "phone": "9654321099",
                            "college": "Vellore Institute of Technology",
                            "department": "Computer Science",
                            "year": "3rd Year",
                        }
                    ],
                },
                {
                    "registration_type": "individual",
                    "domain": "Open Innovation & FinTech",
                    "full_name": "Tanvi Joshi",
                    "email": "tanvi.j@example.com",
                    "phone": "9543210987",
                    "college": "PSG College of Technology",
                    "department": "Software Systems",
                    "year_of_study": "3rd Year",
                },
            ]

            for item in demo_registrations:
                ok, res, _ = register_participant(item)
                if ok:
                    reg_id = res["registration_id"]
                    # Mark most of them paid for rich dashboard stats
                    verify_payment_signature({
                        "registration_id": reg_id,
                        "razorpay_order_id": f"order_demo_{reg_id}",
                        "razorpay_payment_id": f"pay_demo_{reg_id}",
                        "razorpay_signature": "test_signature",
                        "payment_method": "UPI",
                    })

            click.echo("[OK] Demo registrations seeded and marked paid.")
        else:
            click.echo("[OK] Database already contains registrations, skipping seed.")
