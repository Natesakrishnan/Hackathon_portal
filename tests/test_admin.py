import json
from app.models.registration import Registration
from app.models.admin import Admin
from app.services.admin_service import sanitize_csv_cell


def test_admin_access_unauthorized(client):
    """Test unauthenticated access to admin endpoints is rejected with 401."""
    res = client.get("/api/admin/dashboard")
    assert res.status_code == 401

    res = client.get("/api/admin/registrations")
    assert res.status_code == 401


def test_admin_login_success(client):
    """Test successful admin login returns session and admin data."""
    res = client.post(
        "/api/admin/login",
        json={"username": "admin", "password": "Admin@SYNEX2026"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["redirect_url"] == "/admin/dashboard"
    assert data["admin"]["username"] == "admin"


def test_admin_login_failure(client):
    """Test admin login with wrong password returns 401."""
    res = client.post(
        "/api/admin/login",
        json={"username": "admin", "password": "WrongPassword123"},
    )
    assert res.status_code == 401
    assert "Invalid username or password" in res.get_json()["error"]


def test_admin_dashboard_metrics(admin_client):
    """Test authenticated admin can fetch real aggregated dashboard metrics."""
    # Create two registrations (1 individual paid, 1 team unpaid)
    admin_client.post(
        "/api/registrations",
        json={
            "registration_type": "individual",
            "domain": "AI & Machine Learning",
            "full_name": "Metrics Tester",
            "email": "metrics@test.com",
            "phone": "9876543210",
            "college": "Test College",
            "department": "CSE",
            "year_of_study": "3rd Year",
        },
    )

    res = admin_client.get("/api/admin/dashboard")
    assert res.status_code == 200

    data = res.get_json()
    assert data["success"] is True
    summary = data["data"]["summary"]
    assert "total_registrations" in summary
    assert "gross_revenue" in summary
    assert "domain_breakdown" in data["data"]


def test_admin_registrations_filter_and_search(admin_client):
    """Test registrations listing, search, and domain filtering."""
    # Seed individual registration
    admin_client.post(
        "/api/registrations",
        json={
            "registration_type": "individual",
            "domain": "IoT & Embedded Systems",
            "full_name": "Searchable Name",
            "email": "searchable@test.com",
            "phone": "9876543210",
            "college": "Searchable University",
            "department": "ECE",
            "year_of_study": "2nd Year",
        },
    )

    # 1. Search by name
    res = admin_client.get("/api/admin/registrations?search=Searchable")
    assert res.status_code == 200
    items = res.get_json()["data"]["registrations"]
    assert len(items) >= 1
    assert items[0]["participant"]["full_name"] == "Searchable Name"

    # 2. Filter by domain
    res_domain = admin_client.get("/api/admin/registrations?domain=IoT %26 Embedded Systems")
    assert res_domain.status_code == 200
    items_domain = res_domain.get_json()["data"]["registrations"]
    assert all(item["domain"] == "IoT & Embedded Systems" for item in items_domain)


def test_admin_update_registration_status(admin_client):
    """Test updating registration status (confirmed, rejected, etc.)."""
    create_res = admin_client.post(
        "/api/registrations",
        json={
            "registration_type": "individual",
            "domain": "Web3 & Blockchain",
            "full_name": "Status Tester",
            "email": "status@test.com",
            "phone": "9876543210",
            "college": "Test College",
            "department": "CSE",
            "year_of_study": "1st Year",
        },
    )
    reg_id = create_res.get_json()["registration_id"]
    reg = Registration.query.filter_by(public_id=reg_id).first()

    # Update to rejected
    patch_res = admin_client.patch(
        f"/api/admin/registrations/{reg.id}/status",
        json={"status": "rejected"},
    )
    assert patch_res.status_code == 200

    updated_reg = Registration.query.get(reg.id)
    assert updated_reg.registration_status == "rejected"


def test_admin_csv_report_export(admin_client):
    """Test CSV report generation, content type, and headers."""
    res = admin_client.get("/api/admin/reports/registrations.csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("Content-Type", "")
    assert "attachment;" in res.headers.get("Content-Disposition", "")

    csv_text = res.get_data(as_text=True)
    assert "Registration ID" in csv_text
    assert "Domain" in csv_text
    assert "Entry Fee" in csv_text


def test_csv_formula_injection_sanitization():
    """Verify formula injection mitigation in CSV export."""
    assert sanitize_csv_cell("=cmd|'/C calc'!A0") == "'=cmd|'/C calc'!A0"
    assert sanitize_csv_cell("+1234567890") == "'+1234567890"
    assert sanitize_csv_cell("-10+20") == "'-10+20"
    assert sanitize_csv_cell("@SUM(1,2)") == "'@SUM(1,2)"
    assert sanitize_csv_cell("Normal Name") == "Normal Name"


# ==============================================================================
# TESTS FOR FEATURE 1: ANNOUNCEMENT MANAGEMENT
# ==============================================================================

def test_announcements_unauthorized(client):
    """Test unauthorized access to announcement endpoints is rejected with 401."""
    res_get = client.get("/api/admin/announcements")
    assert res_get.status_code == 401

    res_post = client.post(
        "/api/admin/announcements",
        json={"title": "Test Title", "message": "Test Message Body"},
    )
    assert res_post.status_code == 401


def test_announcements_validation(admin_client):
    """Test announcement input validation for title, message, and audience."""
    # 1. Missing title
    res = admin_client.post(
        "/api/admin/announcements",
        json={"title": "", "message": "Valid message body here."},
    )
    assert res.status_code == 400
    assert "title is required" in res.get_json()["error"].lower()

    # 2. Too short title
    res = admin_client.post(
        "/api/admin/announcements",
        json={"title": "Hi", "message": "Valid message body here."},
    )
    assert res.status_code == 400
    assert "between 3 and 150 characters" in res.get_json()["error"]

    # 3. Missing message
    res = admin_client.post(
        "/api/admin/announcements",
        json={"title": "Valid Title Here", "message": ""},
    )
    assert res.status_code == 400
    assert "message is required" in res.get_json()["error"].lower()


def test_announcements_unconfigured_honest_status(admin_client, app):
    """
    Test announcement persistence and honest reporting when integrations are unconfigured.
    Email should honestly report not configured without claiming delivery.
    """
    with app.app_context():
        app.config["MAIL_USERNAME"] = None
        app.config["MAIL_PASSWORD"] = None

    res = admin_client.post(
        "/api/admin/announcements",
        json={
            "title": "Unconfigured Integration Broadcast",
            "message": "Testing honest reporting of unconfigured external channels.",
            "target_audience": "all",
            "send_email": True,
        },
    )
    assert res.status_code == 201
    data = res.get_json()
    assert data["success"] is True

    # Assert honest reporting
    delivery = data["delivery"]
    assert "discord" not in delivery
    assert delivery["email"]["sent"] is False
    assert "not configured" in delivery["email"]["status"].lower()

    # Verify announcement is persisted in database
    from app.models.announcement import Announcement
    announcement = Announcement.query.filter_by(title="Unconfigured Integration Broadcast").first()
    assert announcement is not None
    assert announcement.email_sent is False


def test_announcements_portal_publishing_success(admin_client, app):
    """Test successful announcement publishing to the portal without email delivery."""
    res = admin_client.post(
        "/api/admin/announcements",
        json={
            "title": "Portal Broadcast Test",
            "message": "Congratulations to all finalists of Round 1!",
            "target_audience": "all",
            "send_email": False,
        },
    )
    assert res.status_code == 201
    data = res.get_json()
    assert data["success"] is True
    assert "delivery" in data
    assert data["delivery"]["email"]["sent"] is False
    assert "Portal: Published" in data["announcement"]["delivery_status"]


def test_announcements_duplicate_prevention(admin_client):
    """Test duplicate announcement submission within 60 seconds returns 409."""
    announcement_payload = {
        "title": "Unique Announcement Headline",
        "message": "Important message regarding hackathon venue check-in.",
        "target_audience": "all",
        "send_email": False,
    }

    # First submission -> 201
    res1 = admin_client.post("/api/admin/announcements", json=announcement_payload)
    assert res1.status_code == 201

    # Immediate second submission with identical title & message -> 409 Conflict
    res2 = admin_client.post("/api/admin/announcements", json=announcement_payload)
    assert res2.status_code == 409
    assert res2.get_json()["duplicate"] is True
    assert "duplicate" in res2.get_json()["error"].lower()


def test_announcements_list_history(admin_client):
    """Test GET /api/admin/announcements returns history."""
    # Seed an announcement first
    admin_client.post(
        "/api/admin/announcements",
        json={
            "title": "History Check Broadcast",
            "message": "Testing retrieval of historical announcements.",
            "target_audience": "all",
            "send_email": False,
        },
    )

    res = admin_client.get("/api/admin/announcements")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert isinstance(data["announcements"], list)
    assert len(data["announcements"]) >= 1
    assert data["announcements"][0]["title"] == "History Check Broadcast"


def test_announcements_clear(admin_client):
    """Test DELETE /api/admin/announcements clears all announcement history."""
    # Seed an announcement
    admin_client.post(
        "/api/admin/announcements",
        json={
            "title": "Clearable Broadcast",
            "message": "Testing clearing of announcement messages.",
            "target_audience": "all",
            "send_email": False,
        },
    )

    del_res = admin_client.delete("/api/admin/announcements")
    assert del_res.status_code == 200
    del_data = del_res.get_json()
    assert del_data["success"] is True
    assert del_data["cleared_count"] >= 1

    # Verify history is now empty
    get_res = admin_client.get("/api/admin/announcements")
    assert get_res.status_code == 200
    assert len(get_res.get_json()["announcements"]) == 0


# ==============================================================================
# TESTS FOR FEATURE 2: REAL REPORT GENERATION
# ==============================================================================

def test_reports_unauthorized(client):
    """Test unauthorized access to report endpoints is rejected with 401."""
    res_summary = client.get("/api/admin/reports/summary.csv")
    assert res_summary.status_code == 401

    res_domains = client.get("/api/admin/reports/domains.csv")
    assert res_domains.status_code == 401

    res_paid = client.get("/api/admin/reports/paid-participants.csv")
    assert res_paid.status_code == 401


def test_reports_executive_summary_csv(admin_client):
    """Test executive summary CSV report generation with real metrics."""
    res = admin_client.get("/api/admin/reports/summary.csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("Content-Type", "")
    assert "attachment; filename=synex_executive_summary_" in res.headers.get("Content-Disposition", "")

    csv_text = res.get_data(as_text=True)
    assert "SYNEX 2026 Hackathon" in csv_text
    assert "Total Registrations" in csv_text
    assert "Gross Verified Revenue" in csv_text
    assert "Payment Conversion Rate" in csv_text
    assert "Confirmed Registrations" in csv_text


def test_reports_domain_breakdown_csv(admin_client):
    """Test domain & track distribution CSV report generation."""
    res = admin_client.get("/api/admin/reports/domains.csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("Content-Type", "")
    assert "attachment; filename=synex_domain_breakdown_" in res.headers.get("Content-Disposition", "")

    csv_text = res.get_data(as_text=True)
    assert "Innovation Domain Track" in csv_text
    assert "Verified Revenue (INR)" in csv_text


def test_reports_paid_participants_csv(app, admin_client):
    """Test paid participants CSV report contains only paid participants and necessary details."""
    from app.extensions import db
    from app.models.registration import Registration
    from app.models.payment import Payment

    # 1. Seed paid participant
    paid_create = admin_client.post(
        "/api/registrations",
        json={
            "registration_type": "individual",
            "domain": "AI & Machine Learning",
            "full_name": "Paid Participant",
            "email": "paid.hacker@example.com",
            "phone": "9876543210",
            "college": "Tech Institute",
            "department": "Computer Science",
            "year_of_study": "4th Year",
        },
    )
    assert paid_create.status_code == 201
    paid_reg_id = paid_create.get_json()["registration_id"]

    # 2. Seed unpaid participant
    unpaid_create = admin_client.post(
        "/api/registrations",
        json={
            "registration_type": "individual",
            "domain": "Web3 & Blockchain",
            "full_name": "Unpaid Participant",
            "email": "unpaid.hacker@example.com",
            "phone": "9876543211",
            "college": "Another College",
            "department": "IT",
            "year_of_study": "2nd Year",
        },
    )
    assert unpaid_create.status_code == 201

    # Mark first registration as paid and attach a captured Payment record
    with app.app_context():
        reg = Registration.query.filter_by(public_id=paid_reg_id).first()
        reg.payment_status = "paid"
        payment = Payment(
            registration_id=reg.id,
            gateway="razorpay",
            gateway_order_id="order_PAID123",
            gateway_payment_id="pay_PAID456",
            amount=reg.entry_fee,
            amount_paise=reg.entry_fee * 100,
            currency="INR",
            status="captured",
            payment_method="upi",
        )
        db.session.add(payment)
        db.session.commit()

    # 3. Request Paid Participants CSV report
    res = admin_client.get("/api/admin/reports/paid-participants.csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("Content-Type", "")
    assert "attachment; filename=synex_paid_participants_" in res.headers.get("Content-Disposition", "")

    csv_text = res.get_data(as_text=True)

    # Verify column headers
    assert "Registration ID" in csv_text
    assert "Domain Track" in csv_text
    assert "Participant / Leader Name" in csv_text
    assert "Email" in csv_text
    assert "Entry Fee Paid (INR)" in csv_text
    assert "Gateway Payment ID" in csv_text
    assert "Payment Method" in csv_text

    # Verify paid participant details are present
    assert paid_reg_id in csv_text
    assert "Paid Participant" in csv_text
    assert "paid.hacker@example.com" in csv_text
    assert "pay_PAID456" in csv_text
    assert "order_PAID123" in csv_text
    assert "UPI" in csv_text

    # Verify unpaid participant is NOT in the paid report
    assert "unpaid.hacker@example.com" not in csv_text
    assert "Unpaid Participant" not in csv_text



# ==============================================================================
# TESTS FOR FEATURE 3: EVENT CONFIGURATION
# ==============================================================================

def test_settings_unauthorized(client):
    """Test unauthorized access to settings endpoints is rejected with 401."""
    res_get = client.get("/api/admin/settings")
    assert res_get.status_code == 401

    res_put = client.put("/api/admin/settings", json={"event_name": "Hack 2026"})
    assert res_put.status_code == 401


def test_settings_get_and_put(admin_client):
    """Test reading and updating persistent event settings."""
    # 1. Read initial settings
    res = admin_client.get("/api/admin/settings")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "event_name" in data["settings"]
    assert "individual_fee" in data["settings"]
    assert "team_fee" in data["settings"]
    assert "registration_deadline" in data["settings"]
    assert "prize_pool" in data["settings"]

    # 2. Update settings with new valid values
    update_payload = {
        "event_name": "SYNEX Grand Hackathon 2026",
        "individual_fee": 349,
        "team_fee": 1199,
        "registration_deadline": "2026-12-15T23:59",
        "prize_pool": "₹3,00,000",
        "registration_open": True,
    }
    res_put = admin_client.put("/api/admin/settings", json=update_payload)
    assert res_put.status_code == 200
    updated_data = res_put.get_json()
    assert updated_data["success"] is True
    assert updated_data["settings"]["event_name"] == "SYNEX Grand Hackathon 2026"
    assert updated_data["settings"]["individual_fee"] == 349
    assert updated_data["settings"]["team_fee"] == 1199
    assert updated_data["settings"]["prize_pool"] == "₹3,00,000"

    # 3. Verify persistence with a fresh GET
    res_get2 = admin_client.get("/api/admin/settings")
    assert res_get2.get_json()["settings"]["individual_fee"] == 349
    assert res_get2.get_json()["settings"]["team_fee"] == 1199


def test_settings_invalid_inputs_rejected(admin_client):
    """Test invalid input validation prevents saving bad values."""
    # Negative fee
    res_neg = admin_client.put("/api/admin/settings", json={"individual_fee": -50})
    assert res_neg.status_code == 400
    assert "between 0 and 500,000" in res_neg.get_json()["error"]

    # Invalid deadline format
    res_bad_date = admin_client.put("/api/admin/settings", json={"registration_deadline": "not-a-date"})
    assert res_bad_date.status_code == 400
    assert "valid date/time format" in res_bad_date.get_json()["error"]

    # Short event name
    res_short = admin_client.put("/api/admin/settings", json={"event_name": "A"})
    assert res_short.status_code == 400
    assert "between 2 and 100 characters" in res_short.get_json()["error"]


def test_public_config_sync_with_settings(client, admin_client):
    """Test public /api/config endpoint displays updated settings immediately."""
    # Update settings
    admin_client.put(
        "/api/admin/settings",
        json={
            "event_name": "SYNEX 2026 Mega Hack",
            "individual_fee": 399,
            "team_fee": 1299,
            "registration_deadline": "2026-12-31T23:59:59",
            "prize_pool": "₹5,00,000",
            "registration_open": False,
        },
    )

    # Check unauthenticated public endpoint
    pub_res = client.get("/api/config")
    assert pub_res.status_code == 200
    cfg = pub_res.get_json()
    assert cfg["event_name"] == "SYNEX 2026 Mega Hack"
    assert cfg["individual_fee"] == 399
    assert cfg["team_fee"] == 1299
    assert cfg["prize_pool"] == "₹5,00,000"
    assert cfg["registration_open"] is False
    assert cfg["registration_deadline"] == "2026-12-31T23:59:59"


# ==============================================================================
# TESTS FOR RESET PARTICIPANT RECORDS
# ==============================================================================

def test_reset_participants_unauthorized(client):
    """Verify unauthorized call to reset participants endpoint is rejected."""
    res = client.post("/api/admin/reset-participants")
    assert res.status_code == 401


def test_reset_participants_success(app, admin_client):
    """Verify reset deletes all participant records while preserving admins and event settings."""
    from app.models.participant import Participant
    from app.models.team import Team, TeamMember
    from app.models.registration import Registration
    from app.models.payment import Payment
    from app.models.admin import Admin
    from app.models.event_setting import EventSetting

    # Seed 1 individual registration and 1 team registration
    admin_client.post(
        "/api/registrations",
        json={
            "registration_type": "individual",
            "domain": "AI & Machine Learning",
            "full_name": "Solo Hacker",
            "email": "solo@resettest.com",
            "phone": "9876543210",
            "college": "Test University",
            "department": "CSE",
            "year_of_study": "3rd Year",
        },
    )

    team_res = admin_client.post(
        "/api/registrations",
        json={
            "registration_type": "team",
            "domain": "Cloud & Cybersecurity",
            "team_name": "Reset Squad",
            "leader": {
                "name": "Team Leader",
                "email": "leader@resettest.com",
                "phone": "9876543211",
                "college": "Test University",
                "department": "CSE",
                "year_of_study": "3rd Year",
            },
            "members": [
                {
                    "name": "Member Two",
                    "email": "m2@resettest.com",
                    "phone": "9876543212",
                    "college": "Test University",
                    "department": "CSE",
                    "year_of_study": "3rd Year",
                }
            ],
        },
    )
    assert team_res.status_code == 201

    with app.app_context():
        assert Participant.query.count() >= 2
        assert Registration.query.count() >= 2
        assert Team.query.count() >= 1
        assert TeamMember.query.count() >= 2

    # Execute reset
    res = admin_client.post("/api/admin/reset-participants")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "deleted_counts" in data
    assert data["deleted_counts"]["participants"] >= 2
    assert data["deleted_counts"]["registrations"] >= 2
    assert data["deleted_counts"]["teams"] >= 1

    # Verify database state
    with app.app_context():
        assert Participant.query.count() == 0
        assert Registration.query.count() == 0
        assert Team.query.count() == 0
        assert TeamMember.query.count() == 0
        assert Payment.query.count() == 0

        # Verify admin and settings were preserved
        assert Admin.query.count() >= 1
        assert EventSetting.query.count() >= 1

    # Verify metrics return 0s after reset
    metrics_res = admin_client.get("/api/admin/dashboard")
    assert metrics_res.status_code == 200
    summary = metrics_res.get_json()["data"]["summary"]
    assert summary["total_registrations"] == 0
    assert summary["total_participants"] == 0
    assert summary["gross_revenue"] == 0


# ==============================================================================
# TESTS FOR PUBLIC CONTENT EDITING (RULES & SCHEDULE)
# ==============================================================================

def test_public_content_unauthorized(client):
    """Test unauthorized access to content editing endpoints is rejected with 401."""
    assert client.get("/api/admin/content/rules").status_code == 401
    assert client.put("/api/admin/content/rules", json={"rules": []}).status_code == 401
    assert client.post("/api/admin/content/rules/reset").status_code == 401

    assert client.get("/api/admin/content/schedule").status_code == 401
    assert client.put("/api/admin/content/schedule", json={"milestones": []}).status_code == 401
    assert client.post("/api/admin/content/schedule/reset").status_code == 401


def test_admin_rules_content_crud(admin_client, client):
    """Test admin can view, customize, and reset public event rules."""
    # 1. Fetch current default rules
    res = admin_client.get("/api/admin/content/rules")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert len(data["data"]["rules"]) >= 5

    # 2. Update rules with customized guidelines
    custom_rules = [
        {
            "id": "custom-eligibility",
            "num": 1,
            "title": "Custom Eligibility Rule",
            "content": "All undergraduate and postgraduate researchers are welcome."
        },
        {
            "id": "custom-integrity",
            "num": 2,
            "title": "Strict Code Integrity",
            "content": "All solutions must be built completely on-site during the sprint."
        }
    ]
    update_res = admin_client.put(
        "/api/admin/content/rules",
        json={
            "notice_banner": "UPDATED NOTICE: Official rules edited by administrator.",
            "rules": custom_rules
        }
    )
    assert update_res.status_code == 200
    assert update_res.get_json()["success"] is True

    # 3. Check public API and page
    pub_res = client.get("/api/public/rules")
    assert pub_res.status_code == 200
    pub_data = pub_res.get_json()["data"]
    assert pub_data["notice_banner"] == "UPDATED NOTICE: Official rules edited by administrator."
    assert len(pub_data["rules"]) == 2
    assert pub_data["rules"][0]["title"] == "Custom Eligibility Rule"

    # HTML page render check
    html_res = client.get("/rules")
    assert html_res.status_code == 200
    assert "Custom Eligibility Rule" in html_res.get_data(as_text=True)

    # 4. Reset to default
    reset_res = admin_client.post("/api/admin/content/rules/reset")
    assert reset_res.status_code == 200
    assert reset_res.get_json()["success"] is True

    # Verify reset back to default rules
    verify_res = admin_client.get("/api/admin/content/rules")
    assert len(verify_res.get_json()["data"]["rules"]) >= 5


def test_admin_schedule_content_crud(admin_client, client):
    """Test admin can view, customize, and reset public event schedule milestones."""
    # 1. Fetch current default schedule
    res = admin_client.get("/api/admin/content/schedule")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert len(data["data"]["milestones"]) >= 5

    # 2. Update schedule with customized milestones
    custom_milestones = [
        {
            "phase": "day-1",
            "phase_title": "Day 1 — Saturday, November 14, 2026",
            "time": "09:00 AM",
            "title": "Custom Check-In Ceremony",
            "desc": "Badge issuance and custom mentor orientation.",
            "tag": "Main Stage"
        },
        {
            "phase": "day-2",
            "phase_title": "Day 2 — Sunday, November 15, 2026",
            "time": "04:00 PM",
            "title": "Custom Grand Pitch Finale",
            "desc": "Top 10 teams pitch to angel investors.",
            "tag": "Auditorium"
        }
    ]
    update_res = admin_client.put(
        "/api/admin/content/schedule",
        json={
            "notice_banner": "UPDATED SCHEDULE: Schedule adjusted by organizers.",
            "milestones": custom_milestones
        }
    )
    assert update_res.status_code == 200
    assert update_res.get_json()["success"] is True

    # 3. Check public API and page
    pub_res = client.get("/api/public/schedule")
    assert pub_res.status_code == 200
    pub_data = pub_res.get_json()["data"]
    assert pub_data["notice_banner"] == "UPDATED SCHEDULE: Schedule adjusted by organizers."
    assert len(pub_data["milestones"]) == 2
    assert pub_data["milestones"][0]["title"] == "Custom Check-In Ceremony"

    # HTML page render check
    html_res = client.get("/schedule")
    assert html_res.status_code == 200
    assert "Custom Check-In Ceremony" in html_res.get_data(as_text=True)

    # 4. Reset to default
    reset_res = admin_client.post("/api/admin/content/schedule/reset")
    assert reset_res.status_code == 200
    assert reset_res.get_json()["success"] is True

    # Verify reset back to default milestones
    verify_res = admin_client.get("/api/admin/content/schedule")
    assert len(verify_res.get_json()["data"]["milestones"]) >= 5


def test_inquiries_list_and_filter(admin_client):
    """Test listing, searching, and filtering inquiry messages in the admin portal."""
    from app.extensions import db
    from app.models.contact_message import ContactMessage

    # Seed test inquiries
    msg1 = ContactMessage(
        name="Alice Hacker",
        email="alice@test.com",
        subject="Eligibility Question",
        message="Can high school students participate?",
        is_read=False,
    )
    msg2 = ContactMessage(
        name="Bob Builder",
        email="bob@test.com",
        subject="Team Size Limit",
        message="Can a team have 5 members?",
        is_read=True,
    )
    db.session.add_all([msg1, msg2])
    db.session.commit()

    # 1. Fetch all
    res = admin_client.get("/api/admin/inquiries")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["total"] >= 2
    assert data["unread_count"] >= 1

    # 2. Filter unread
    res_unread = admin_client.get("/api/admin/inquiries?status=unread")
    assert res_unread.status_code == 200
    unread_items = res_unread.get_json()["inquiries"]
    assert any(m["email"] == "alice@test.com" for m in unread_items)

    # 3. Search query
    res_search = admin_client.get("/api/admin/inquiries?search=Eligibility")
    assert res_search.status_code == 200
    search_items = res_search.get_json()["inquiries"]
    assert any(m["email"] == "alice@test.com" for m in search_items)


def test_inquiry_detail_and_auto_read(admin_client):
    """Test viewing inquiry detail auto-marks as read and toggle status works."""
    from app.extensions import db
    from app.models.contact_message import ContactMessage

    msg = ContactMessage(
        name="Charlie Dev",
        email="charlie@test.com",
        subject="Venue Question",
        message="Is accommodation provided during the 36 hours?",
        is_read=False,
    )
    db.session.add(msg)
    db.session.commit()

    # View inquiry
    res = admin_client.get(f"/api/admin/inquiries/{msg.id}")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["inquiry"]["is_read"] is True

    # Verify persisted in database
    db_msg = ContactMessage.query.get(msg.id)
    assert db_msg.is_read is True

    # Toggle status to unread
    toggle_res = admin_client.patch(f"/api/admin/inquiries/{msg.id}/status", json={"is_read": False})
    assert toggle_res.status_code == 200
    assert toggle_res.get_json()["inquiry"]["is_read"] is False


def test_inquiry_reply_email(admin_client):
    """Test replying to an inquiry via email and updating inquiry record."""
    from app.extensions import db
    from app.models.contact_message import ContactMessage

    msg = ContactMessage(
        name="Diana Prince",
        email="diana@themyscira.com",
        subject="Project Submission Deadline",
        message="What is the exact minute cutoff for submission?",
        is_read=False,
    )
    db.session.add(msg)
    db.session.commit()

    reply_res = admin_client.post(
        f"/api/admin/inquiries/{msg.id}/reply",
        json={
            "subject": "Re: Project Submission Deadline",
            "message": "Hi Diana, submissions close sharply at 12:00 PM on Sunday."
        }
    )
    assert reply_res.status_code == 200
    data = reply_res.get_json()
    assert data["success"] is True
    assert data["inquiry"]["is_replied"] is True
    assert "Hi Diana" in data["inquiry"]["reply_message"]

    # Verify DB state
    updated_msg = ContactMessage.query.get(msg.id)
    assert updated_msg.reply_message is not None
    assert updated_msg.replied_at is not None
    assert updated_msg.is_read is True


def test_admin_direct_send_email_and_logs(admin_client):
    """Test composing and dispatching direct email and verifying outbox logs."""
    res = admin_client.post(
        "/api/admin/send-email",
        json={
            "to_email": "direct-recipient@example.com",
            "subject": "[SYNEX 2026] Important Mentor Assignment",
            "message": "You have been assigned Dr. Alan Turing as your domain mentor."
        }
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["email_log"] is not None
    assert data["email_log"]["recipient"] == "direct-recipient@example.com"

    # Verify in logs endpoint
    logs_res = admin_client.get("/api/admin/email/logs")
    assert logs_res.status_code == 200
    logs = logs_res.get_json()["logs"]
    assert any(l["recipient"] == "direct-recipient@example.com" for l in logs)


def test_admin_smtp_settings_crud(admin_client):
    """Test fetching and updating SMTP email configuration."""
    # 1. Fetch current settings
    get_res = admin_client.get("/api/admin/email/settings")
    assert get_res.status_code == 200
    settings = get_res.get_json()["settings"]
    assert "host" in settings
    assert "port" in settings

    # 2. Update settings
    put_res = admin_client.put(
        "/api/admin/email/settings",
        json={
            "host": "mail.synex.org",
            "port": 465,
            "username": "admin@synex.org",
            "default_sender": "SYNEX Team <admin@synex.org>",
            "use_tls": False,
            "use_ssl": True
        }
    )
    assert put_res.status_code == 200
    assert put_res.get_json()["success"] is True

    # 3. Verify updated values
    verify_res = admin_client.get("/api/admin/email/settings")
    updated = verify_res.get_json()["settings"]
    assert updated["host"] == "mail.synex.org"
    assert updated["port"] == 465
    assert updated["username"] == "admin@synex.org"
    assert updated["use_ssl"] is True




