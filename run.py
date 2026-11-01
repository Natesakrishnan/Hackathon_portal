import os
from config import Config
from app import create_app
from app.extensions import db
from app.models.admin import Admin
from app.models.event_setting import EventSetting

app = create_app(os.environ.get("FLASK_ENV", "development"))

def auto_setup():
    """Ensures database tables and a default administrator exist on startup."""
    with app.app_context():
        try:
            db.create_all()
            # Ensure default event settings
            if not EventSetting.query.filter_by(key="EVENT_NAME").first():
                EventSetting.set_val("EVENT_NAME", "SYNEX 2026", "Official Hackathon Name")
            if not EventSetting.query.filter_by(key="EVENT_INDIVIDUAL_FEE").first():
                EventSetting.set_val("EVENT_INDIVIDUAL_FEE", "299", "Individual Registration Fee in INR")
            if not EventSetting.query.filter_by(key="EVENT_TEAM_FEE").first():
                EventSetting.set_val("EVENT_TEAM_FEE", "999", "Team Registration Fee in INR")
            if not EventSetting.query.filter_by(key="EVENT_PER_MEMBER_FEE").first():
                EventSetting.set_val("EVENT_PER_MEMBER_FEE", "250", "Registration Fee Per Team Member in INR")
            if not EventSetting.query.filter_by(key="MIN_TEAM_MEMBERS").first():
                EventSetting.set_val("MIN_TEAM_MEMBERS", "2", "Minimum Team Members Required")
            if not EventSetting.query.filter_by(key="MAX_TEAM_MEMBERS").first():
                EventSetting.set_val("MAX_TEAM_MEMBERS", "4", "Maximum Team Members Allowed")
            if not EventSetting.query.filter_by(key="REGISTRATION_DEADLINE").first():
                EventSetting.set_val("REGISTRATION_DEADLINE", "2026-11-30T23:59:59", "Registration Deadline ISO timestamp")
            if not EventSetting.query.filter_by(key="TOTAL_PRIZE_POOL").first():
                EventSetting.set_val("TOTAL_PRIZE_POOL", "₹2,50,000", "Total Hackathon Prize Pool")
            if not EventSetting.query.filter_by(key="REGISTRATION_OPEN").first():
                EventSetting.set_val("REGISTRATION_OPEN", "true", "Registration Open Status")

            # Ensure default admin account exists
            default_admin = Admin.query.filter_by(username="admin").first()
            if not default_admin:
                admin = Admin(
                    username="admin",
                    email="admin@synex.org",
                    full_name="Portal Administrator",
                    role="admin",
                    is_active_account=True,
                )
                admin.set_password("Admin@SYNEX2026")
                db.session.add(admin)
                db.session.commit()
                print("[OK] Default administrator ready: username='admin'")

            # Ensure confidential event settings admin account exists
            settings_admin = Admin.query.filter_by(username="krish@01").first()
            if not settings_admin:
                settings_admin = Admin(
                    username="krish@01",
                    email="krish01@synex.org",
                    full_name="Event Settings Administrator",
                    role="settings_admin",
                    is_active_account=True,
                )
                settings_admin.set_password("@asdfg123")
                db.session.add(settings_admin)
                db.session.commit()
                print("[OK] Confidential Settings Administrator ready: username='krish@01'")

            # Check-in columns schema migration & token backfill
            from sqlalchemy import inspect
            from app.models.registration import Registration
            import secrets, string
            insp = inspect(db.engine)
            if "registrations" in insp.get_table_names():
                existing_cols = {c["name"] for c in insp.get_columns("registrations")}
                with db.engine.connect() as conn:
                    if "checkin_token" not in existing_cols:
                        conn.execute(db.text("ALTER TABLE registrations ADD COLUMN checkin_token VARCHAR(64) UNIQUE NULL"))
                    if "is_checked_in" not in existing_cols:
                        conn.execute(db.text("ALTER TABLE registrations ADD COLUMN is_checked_in BOOLEAN DEFAULT FALSE NOT NULL"))
                    if "checked_in_at" not in existing_cols:
                        conn.execute(db.text("ALTER TABLE registrations ADD COLUMN checked_in_at DATETIME NULL"))
                    if "checked_in_by" not in existing_cols:
                        conn.execute(db.text("ALTER TABLE registrations ADD COLUMN checked_in_by VARCHAR(120) NULL"))
                    if "checkin_notes" not in existing_cols:
                        conn.execute(db.text("ALTER TABLE registrations ADD COLUMN checkin_notes VARCHAR(255) NULL"))
                    conn.commit()

            # Backfill any existing registrations that lack a check-in token
            untokened_regs = Registration.query.filter(Registration.checkin_token.is_(None)).all()
            if untokened_regs:
                for r in untokened_regs:
                    r.checkin_token = f"CHK-{''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(12))}"
                db.session.commit()
                print(f"[OK] Backfilled check-in tokens for {len(untokened_regs)} existing registration(s).")
        except Exception as e:
            print(f"Notice during auto-setup: {e}")

# Run automatic setup on startup
auto_setup()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    backend_info = Config.get_safe_db_info(app.config.get("SQLALCHEMY_DATABASE_URI"))
    print(f"Database backend: {backend_info}")
    print(f"[SERVER] SYNEX Hackathon Portal Backend is starting on http://localhost:{port}")
    print(f"   - Public Portal:     http://localhost:{port}")
    print(f"   - Registration:      http://localhost:{port}/register")
    print(f"   - Admin Dashboard:   http://localhost:{port}/admin/dashboard")
    print(f"   - Admin Login:       http://localhost:{port}/admin/login (admin / Admin@SYNEX2026)")
    print(f"=======================================================\n")
    app.run(host="0.0.0.0", port=port, debug=True)
