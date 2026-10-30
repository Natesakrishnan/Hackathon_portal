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
