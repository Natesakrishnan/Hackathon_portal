import json
from app.models.registration import Registration
from app.models.participant import Participant
from app.models.team import Team


def test_individual_registration_success(client):
    """Test successful individual registration."""
    payload = {
        "registration_type": "individual",
        "domain": "AI & Machine Learning",
        "full_name": "Dev Sharma",
        "email": "dev.sharma@college.edu",
        "phone": "9876543210",
        "college": "Indian Institute of Technology",
        "department": "Computer Science & Engineering",
        "year_of_study": "3rd Year",
    }
    response = client.post("/api/registrations", json=payload)
    assert response.status_code == 201

    data = response.get_json()
    assert data["success"] is True
    assert data["registration_id"].startswith("SYNEX-")
    assert data["entry_fee"] == 299
    assert data["registration_type"] == "individual"

    # Verify DB record
    reg = Registration.query.filter_by(public_id=data["registration_id"]).first()
    assert reg is not None
    assert reg.entry_fee == 299
    assert reg.participant.email == "dev.sharma@college.edu"


def test_individual_registration_invalid_domain(client):
    """Test registration failure on invalid domain track."""
    payload = {
        "registration_type": "individual",
        "domain": "Non Existent Track",
        "full_name": "Dev Sharma",
        "email": "dev.sharma@college.edu",
        "phone": "9876543210",
        "college": "IIT",
        "department": "CSE",
        "year_of_study": "3rd Year",
    }
    response = client.post("/api/registrations", json=payload)
    assert response.status_code == 400
    assert "Invalid domain" in response.get_json()["error"]


def test_individual_registration_invalid_email(client):
    """Test registration failure on invalid email format."""
    payload = {
        "registration_type": "individual",
        "domain": "Web3 & Blockchain",
        "full_name": "Dev Sharma",
        "email": "invalid-email-address",
        "phone": "9876543210",
        "college": "IIT",
        "department": "CSE",
        "year_of_study": "3rd Year",
    }
    response = client.post("/api/registrations", json=payload)
    assert response.status_code == 400
    assert "invalid" in response.get_json()["error"]


def test_team_registration_success(client):
    """Test successful team registration with leader + 2 members."""
    payload = {
        "registration_type": "team",
        "team_name": "Quantum Innovators",
        "domain": "IoT & Embedded Systems",
        "leader": {
            "name": "Kavya Patel",
            "email": "kavya.p@college.edu",
            "phone": "9876543210",
            "college": "National Institute of Technology",
            "department": "ECE",
            "year_of_study": "4th Year",
        },
        "members": [
            {
                "name": "Sanjay Kumar",
                "email": "sanjay.k@college.edu",
                "phone": "9876543211",
                "college": "National Institute of Technology",
                "department": "ECE",
                "year_of_study": "4th Year",
            },
            {
                "name": "Divya Rao",
                "email": "divya.r@college.edu",
                "phone": "9876543212",
                "college": "National Institute of Technology",
                "department": "CSE",
                "year_of_study": "4th Year",
            },
        ],
    }
    response = client.post("/api/registrations", json=payload)
    assert response.status_code == 201

    data = response.get_json()
    assert data["success"] is True
    assert data["registration_type"] == "team"
    assert data["team_name"] == "Quantum Innovators"
    assert data["entry_fee"] == 999
    assert data["members_count"] == 3

    # Check database records
    team = Team.query.filter_by(team_name="Quantum Innovators").first()
    assert team is not None
    assert len(team.members) == 3


def test_team_registration_duplicate_name(client):
    """Test team registration failure if team name is already taken."""
    payload = {
        "registration_type": "team",
        "team_name": "Alpha Squad",
        "domain": "Cloud & Cybersecurity",
        "leader": {
            "name": "Leader One",
            "email": "lead1@college.edu",
            "phone": "9876543210",
            "college": "College A",
            "department": "IT",
            "year_of_study": "2nd Year",
        },
        "members": [
            {
                "name": "Member One",
                "email": "mem1@college.edu",
                "phone": "9876543211",
                "college": "College A",
                "department": "IT",
                "year_of_study": "2nd Year",
            }
        ],
    }
    # First registration
    res1 = client.post("/api/registrations", json=payload)
    assert res1.status_code == 201

    # Second registration with same team name
    payload["leader"]["email"] = "lead2@college.edu"
    payload["members"][0]["email"] = "mem2@college.edu"
    res2 = client.post("/api/registrations", json=payload)
    assert res2.status_code == 400
    assert "already taken" in res2.get_json()["error"]


def test_team_registration_duplicate_emails_in_team(client):
    """Test team registration failure when same email is used for leader and member."""
    payload = {
        "registration_type": "team",
        "team_name": "Beta Squad",
        "domain": "Healthcare & MedTech",
        "leader": {
            "name": "Leader Person",
            "email": "same.email@college.edu",
            "phone": "9876543210",
            "college": "College B",
            "department": "Biotech",
            "year_of_study": "3rd Year",
        },
        "members": [
            {
                "name": "Member Duplicate",
                "email": "same.email@college.edu",
                "phone": "9876543211",
                "college": "College B",
                "department": "Biotech",
                "year_of_study": "3rd Year",
            }
        ],
    }
    response = client.post("/api/registrations", json=payload)
    assert response.status_code == 400
    assert "Duplicate email" in response.get_json()["error"]


def test_get_registration_by_ref(client):
    """Test querying registration details by public reference ID."""
    # First create
    reg_res = client.post(
        "/api/registrations",
        json={
            "registration_type": "individual",
            "domain": "Open Innovation & FinTech",
            "full_name": "Alok Nath",
            "email": "alok.nath@college.edu",
            "phone": "9876543210",
            "college": "Delhi University",
            "department": "Economics & Tech",
            "year_of_study": "3rd Year",
        },
    )
    ref_id = reg_res.get_json()["registration_id"]

    # Query details
    get_res = client.get(f"/api/registrations/{ref_id}")
    assert get_res.status_code == 200
    data = get_res.get_json()["registration"]
    assert data["public_id"] == ref_id
    assert data["domain"] == "Open Innovation & FinTech"
    assert data["participant"]["full_name"] == "Alok Nath"


def test_individual_registration_missing_required_fields(client):
    """Test registration failure on missing required fields."""
    base_payload = {
        "registration_type": "individual",
        "domain": "AI & Machine Learning",
        "full_name": "Test User",
        "email": "test.user@college.edu",
        "phone": "9876543210",
        "college": "Test College",
        "department": "CSE",
        "year_of_study": "2nd Year",
    }

    # Missing name
    p1 = dict(base_payload, full_name="")
    r1 = client.post("/api/registrations", json=p1)
    assert r1.status_code == 400
    assert "name must be at least 2 characters" in r1.get_json()["error"]

    # Missing college
    p2 = dict(base_payload, college="")
    r2 = client.post("/api/registrations", json=p2)
    assert r2.status_code == 400
    assert "college name is required" in r2.get_json()["error"]

    # Missing department
    p3 = dict(base_payload, department="")
    r3 = client.post("/api/registrations", json=p3)
    assert r3.status_code == 400
    assert "department is required" in r3.get_json()["error"]

    # Missing year of study
    p4 = dict(base_payload, year_of_study="")
    r4 = client.post("/api/registrations", json=p4)
    assert r4.status_code == 400
    assert "year of study is required" in r4.get_json()["error"]


def test_registration_fee_calculated_server_side_ignores_client_fee(client):
    """Test that server-calculated fee overrides any client-submitted entry_fee."""
    # Attempt to tamper fee in payload to 0 or 1 INR
    payload = {
        "registration_type": "individual",
        "domain": "Web3 & Blockchain",
        "full_name": "Tamper Test",
        "email": "tamper.test@college.edu",
        "phone": "9876543210",
        "college": "Test University",
        "department": "Information Technology",
        "year_of_study": "4th Year",
        "entry_fee": 0,
    }
    response = client.post("/api/registrations", json=payload)
    assert response.status_code == 201
    data = response.get_json()
    assert data["success"] is True
    # Server must calculate 299 from configuration, ignoring 0
    assert data["entry_fee"] == 299


def test_registration_flow_response_structure_for_step2(client):
    """Test API response properties required by Step 2 review and Step 3 payment."""
    payload = {
        "registration_type": "team",
        "team_name": "QuantumLeap",
        "domain": "IoT & Embedded Systems",
        "leader": {
            "name": "Priya Sharma",
            "email": "priya.sharma@nit.edu",
            "phone": "9876543210",
            "college": "National Institute of Technology",
            "department": "Electronics",
            "year_of_study": "3rd Year",
        },
        "members": [
            {
                "name": "Kiran Kumar",
                "email": "kiran.k@nit.edu",
                "phone": "9876543211",
                "college": "National Institute of Technology",
                "department": "Electronics",
                "year_of_study": "3rd Year",
            }
        ],
    }
    response = client.post("/api/registrations", json=payload)
    assert response.status_code == 201
    data = response.get_json()

    assert data["success"] is True
    assert "registration_id" in data
    assert data["registration_id"].startswith("SYNEX-")
    assert data["entry_fee"] == 999
    assert data["registration_type"] == "team"
    assert data["domain"] == "IoT & Embedded Systems"
    assert data["redirect_url"] == f"/payment?ref={data['registration_id']}"

