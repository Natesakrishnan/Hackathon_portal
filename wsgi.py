import os
from dotenv import load_dotenv

# Load production or local environment variables
load_dotenv()

from app import create_app
from app.extensions import db
from app.models.admin import Admin
from app.models.event_setting import EventSetting
from config import Config

app = create_app(os.environ.get("FLASK_ENV", "production"))

with app.app_context():
    # Ensure database schema is ready
    db.create_all()
    
    # Initialize default admin account if not present
    default_admin_user = os.environ.get("ADMIN_USERNAME", "admin")
    admin = Admin.query.filter_by(username=default_admin_user).first()
    if not admin:
        default_admin_password = os.environ.get("ADMIN_PASSWORD", "hack@07")
        admin = Admin(
            username=default_admin_user,
            email=os.environ.get("ADMIN_EMAIL", "admin@synex.org"),
            full_name="Portal Administrator",
            role="admin",
            is_active_account=True,
        )
        admin.set_password(default_admin_password)
        db.session.add(admin)
        db.session.commit()

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
        settings_admin.set_password(os.environ.get("SETTINGS_ADMIN_PASSWORD", "Admin@01"))
        db.session.add(settings_admin)
        db.session.commit()

    # Ensure default event settings exist
    settings_seed = {
        "EVENT_NAME": (Config.EVENT_NAME, "Official Hackathon Event Title"),
        "EVENT_INDIVIDUAL_FEE": (str(Config.EVENT_INDIVIDUAL_FEE), "Individual Registration Fee in INR"),
        "EVENT_TEAM_FEE": (str(Config.EVENT_TEAM_FEE), "Team Registration Fee in INR"),
        "EVENT_PER_MEMBER_FEE": (str(Config.EVENT_PER_MEMBER_FEE), "Team Dynamic Per-Member Fee in INR"),
        "EVENT_MEALS_FEE": (str(Config.EVENT_MEALS_FEE), "Swag Kit & Meals Surcharge in INR"),
        "MIN_TEAM_MEMBERS": (str(Config.MIN_TEAM_MEMBERS), "Minimum Required Team Size"),
        "MAX_TEAM_MEMBERS": (str(Config.MAX_TEAM_MEMBERS), "Maximum Allowed Team Size"),
        "REGISTRATION_DEADLINE": ("2026-11-30T23:59:59", "Countdown & Registration Closing ISO Timestamp"),
        "TOTAL_PRIZE_POOL": ("₹2,50,000", "Total Cash & Prize Pool Value"),
        "REGISTRATION_OPEN": ("true", "Registration Master Toggle (true/false)"),
    }
    for key, (default_val, desc) in settings_seed.items():
        if not EventSetting.query.filter_by(key=key).first():
            db.session.add(EventSetting(key=key, value=str(default_val), description=desc))
    db.session.commit()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
