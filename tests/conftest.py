import os
import sys
import pytest

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from app.extensions import db
from app.models.admin import Admin
from app.models.event_setting import EventSetting


@pytest.fixture
def app():
    """Create and configure a testing Flask app instance."""
    app = create_app("testing")

    with app.app_context():
        db.create_all()
        # Seed test event settings
        EventSetting.set_val("EVENT_NAME", "SYNEX 2026", "Event Name")
        EventSetting.set_val("EVENT_INDIVIDUAL_FEE", "299", "Individual Fee")
        EventSetting.set_val("EVENT_TEAM_FEE", "999", "Team Fee")
        EventSetting.set_val("REGISTRATION_DEADLINE", "2026-11-30T23:59:59", "Registration Deadline")
        EventSetting.set_val("TOTAL_PRIZE_POOL", "₹2,50,000", "Total Prize Pool")
        EventSetting.set_val("REGISTRATION_OPEN", "true", "Registration Open")

        # Create default test admin
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

        yield app

        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()


@pytest.fixture
def admin_client(app, client):
    """A test client logged in as admin."""
    client.post(
        "/api/admin/login",
        json={"username": "admin", "password": "Admin@SYNEX2026"},
    )
    return client
