from app.models.contact_message import ContactMessage


def test_public_pages_return_200(client):
    """Test all public frontend routes return HTTP 200."""
    routes = [
        "/",
        "/rules",
        "/schedule",
        "/contact",
        "/register",
        "/payment",
        "/confirmation",
        "/admin/login",
    ]
    for route in routes:
        response = client.get(route)
        assert response.status_code == 200, f"Route {route} failed with {response.status_code}"


def test_api_config(client):
    """Test public config endpoint returns event details and pricing."""
    response = client.get("/api/config")
    assert response.status_code == 200

    data = response.get_json()
    assert data["event_name"] == "SYNEX 2026"
    assert data["individual_fee"] == 299
    assert data["team_fee"] == 999
    assert data["currency"] == "INR"


def test_api_domains(client):
    """Test public domains endpoint returns the 6 official hackathon tracks."""
    response = client.get("/api/domains")
    assert response.status_code == 200

    data = response.get_json()
    assert len(data["domains"]) == 6
    assert "AI & Machine Learning" in data["domains"]
    assert "Web3 & Blockchain" in data["domains"]


def test_contact_form_submission_success(client):
    """Test successful inquiry submission through contact form API."""
    payload = {
        "name": "Jane Doe",
        "email": "jane.doe@university.edu",
        "subject": "Hardware Lab Inquiry",
        "message": "Will there be soldering stations provided at the venue?",
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 201

    data = response.get_json()
    assert data["success"] is True

    # Verify message in database
    msg = ContactMessage.query.filter_by(email="jane.doe@university.edu").first()
    assert msg is not None
    assert msg.subject == "Hardware Lab Inquiry"


def test_contact_form_invalid_email(client):
    """Test contact form validation with invalid email."""
    payload = {
        "name": "Jane Doe",
        "email": "not-an-email",
        "subject": "General",
        "message": "Hello organizing team",
    }
    response = client.post("/api/contact", json=payload)
    assert response.status_code == 400
    assert "email" in response.get_json()["error"]


def test_dynamic_fee_reflected_across_public_site(client):
    """Test that updating fees in EventSetting reflects in /api/config and all public site templates."""
    from app.models.event_setting import EventSetting
    EventSetting.set_val("EVENT_INDIVIDUAL_FEE", "499", "Individual Fee")
    EventSetting.set_val("EVENT_TEAM_FEE", "1499", "Team Fee")

    # 1. /api/config
    cfg_res = client.get("/api/config")
    assert cfg_res.status_code == 200
    cfg = cfg_res.get_json()
    assert cfg["individual_fee"] == 499
    assert cfg["team_fee"] == 1499

    # 2. Homepage (hero badge & FAQ)
    home_res = client.get("/")
    assert home_res.status_code == 200
    home_html = home_res.get_data(as_text=True)
    assert "₹499 Individual / ₹1499 Team" in home_html
    assert "Individual (₹499)" in home_html
    assert "Team of 2 to 4 members (₹1499 total)" in home_html

    # 3. Registration page (Type pills, review fees, summary fees)
    reg_res = client.get("/register")
    assert reg_res.status_code == 200
    reg_html = reg_res.get_data(as_text=True)
    assert 'id="pillIndividualFee" data-fee-pill="individual">₹499' in reg_html
    assert 'id="pillTeamFee" data-fee-pill="team">₹1499' in reg_html
    assert 'id="reviewBaseFee" style="color: var(--color-text-main);">₹499' in reg_html
    assert 'id="reviewTotalAmount" style="color: var(--color-primary); font-size: 1.4rem;">₹499' in reg_html
    assert 'id="summaryBaseFee">₹499' in reg_html
    assert 'id="summaryTotalPrice">₹499' in reg_html

    # 4. Rules page
    rules_res = client.get("/rules")
    assert rules_res.status_code == 200
    rules_html = rules_res.get_data(as_text=True)
    assert "₹499" in rules_html
    assert "₹1499" in rules_html

    # 5. Payment page
    pay_res = client.get("/payment")
    assert pay_res.status_code == 200
    pay_html = pay_res.get_data(as_text=True)
    assert 'id="orderBaseFee">₹499' in pay_html
    assert 'id="orderTotalAmount">₹499' in pay_html

    # 6. Confirmation page
    conf_res = client.get("/confirmation")
    assert conf_res.status_code == 200
    conf_html = conf_res.get_data(as_text=True)
    assert "₹499 (Simulated)" in conf_html

    # Reset back to defaults
    EventSetting.set_val("EVENT_INDIVIDUAL_FEE", "299", "Individual Fee")
    EventSetting.set_val("EVENT_TEAM_FEE", "999", "Team Fee")

