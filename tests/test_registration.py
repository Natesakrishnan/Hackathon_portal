import json
from app.models.registration import Registration
from app.models.participant import Participant
from app.models.team import Team
from app.models.event_setting import EventSetting



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


def test_team_registration_dynamic_per_member_fee(client):
    """Test that team fee dynamically scales based on per-member fee * total members."""
    # Configure per-member fee to 350 INR
    EventSetting.set_val("EVENT_PER_MEMBER_FEE", "350")
    EventSetting.set_val("MIN_TEAM_MEMBERS", "2")
    EventSetting.set_val("MAX_TEAM_MEMBERS", "4")

    # Team of 2 (Leader + 1 Member) -> 2 * 350 = 700 INR
    payload_2 = {
        "registration_type": "team",
        "team_name": "Dynamic Duo",
        "domain": "AI & Machine Learning",
        "leader": {
            "name": "Alpha Leader",
            "email": "alpha.leader@college.edu",
            "phone": "9876543210",
            "college": "Tech College",
            "department": "CSE",
            "year_of_study": "3rd Year",
        },
        "members": [
            {
                "name": "Beta Member",
                "email": "beta.member@college.edu",
                "phone": "9876543211",
                "college": "Tech College",
                "department": "CSE",
                "year_of_study": "3rd Year",
            }
        ],
    }
    res2 = client.post("/api/registrations", json=payload_2)
    assert res2.status_code == 201
    data2 = res2.get_json()
    assert data2["success"] is True
    assert data2["entry_fee"] == 700  # 2 * 350

    # Team of 3 (Leader + 2 Members) -> 3 * 350 = 1050 INR
    payload_3 = {
        "registration_type": "team",
        "team_name": "Trio Force",
        "domain": "Cloud & Cybersecurity",
        "leader": {
            "name": "Gamma Leader",
            "email": "gamma.leader@college.edu",
            "phone": "9876543220",
            "college": "Tech College",
            "department": "IT",
            "year_of_study": "4th Year",
        },
        "members": [
            {
                "name": "Delta Member",
                "email": "delta.member@college.edu",
                "phone": "9876543221",
                "college": "Tech College",
                "department": "IT",
                "year_of_study": "4th Year",
            },
            {
                "name": "Epsilon Member",
                "email": "epsilon.member@college.edu",
                "phone": "9876543222",
                "college": "Tech College",
                "department": "IT",
                "year_of_study": "4th Year",
            },
        ],
    }
    res3 = client.post("/api/registrations", json=payload_3)
    assert res3.status_code == 201
    data3 = res3.get_json()
    assert data3["success"] is True
    assert data3["entry_fee"] == 1050  # 3 * 350


def test_team_registration_min_team_members_validation(client):
    """Test enforcement of configurable minimum team size."""
    # Set minimum team size to 3 members
    EventSetting.set_val("MIN_TEAM_MEMBERS", "3")
    EventSetting.set_val("MAX_TEAM_MEMBERS", "5")
    EventSetting.set_val("EVENT_PER_MEMBER_FEE", "250")

    # Try registering with only 2 members (Leader + 1 member) -> Must fail with 400
    under_sized_payload = {
        "registration_type": "team",
        "team_name": "Under Min Team",
        "domain": "Open Innovation & FinTech",
        "leader": {
            "name": "Solo Leader",
            "email": "solo.leader@college.edu",
            "phone": "9876543230",
            "college": "Tech College",
            "department": "CSE",
            "year_of_study": "2nd Year",
        },
        "members": [
            {
                "name": "Single Member",
                "email": "single.member@college.edu",
                "phone": "9876543231",
                "college": "Tech College",
                "department": "CSE",
                "year_of_study": "2nd Year",
            }
        ],
    }
    res_fail = client.post("/api/registrations", json=under_sized_payload)
    assert res_fail.status_code == 400
    assert "at least 3 members total" in res_fail.get_json()["error"]

    # Now add another member to reach 3 total -> Must succeed
    under_sized_payload["team_name"] = "Valid Sized Team"
    under_sized_payload["members"].append({
        "name": "Second Member",
        "email": "second.member@college.edu",
        "phone": "9876543232",
        "college": "Tech College",
        "department": "CSE",
        "year_of_study": "2nd Year",
    })
    res_ok = client.post("/api/registrations", json=under_sized_payload)
    assert res_ok.status_code == 201
    assert res_ok.get_json()["entry_fee"] == 750  # 3 * 250


def test_team_registration_max_team_members_validation(client):
    """Test enforcement of configurable maximum team size."""
    # Set maximum team size to 2 members
    EventSetting.set_val("MIN_TEAM_MEMBERS", "2")
    EventSetting.set_val("MAX_TEAM_MEMBERS", "2")
    EventSetting.set_val("EVENT_PER_MEMBER_FEE", "200")

    # Try registering with 3 members (Leader + 2 members) -> Must fail with 400
    over_sized_payload = {
        "registration_type": "team",
        "team_name": "Over Max Team",
        "domain": "Web3 & Blockchain",
        "leader": {
            "name": "Leader Max",
            "email": "leader.max@college.edu",
            "phone": "9876543240",
            "college": "Tech College",
            "department": "ECE",
            "year_of_study": "4th Year",
        },
        "members": [
            {
                "name": "Member A",
                "email": "member.a@college.edu",
                "phone": "9876543241",
                "college": "Tech College",
                "department": "ECE",
                "year_of_study": "4th Year",
            },
            {
                "name": "Member B",
                "email": "member.b@college.edu",
                "phone": "9876543242",
                "college": "Tech College",
                "department": "ECE",
                "year_of_study": "4th Year",
            },
        ],
    }
    res_fail = client.post("/api/registrations", json=over_sized_payload)
    assert res_fail.status_code == 400
    assert "cannot exceed 2 members total" in res_fail.get_json()["error"]


def test_registration_fee_with_meals_surcharge(client):
    """Test that setting meals surcharge in EventSettings accurately reflects in entry_fee and breakdown."""
    EventSetting.set_val("EVENT_PER_MEMBER_FEE", "200")
    EventSetting.set_val("EVENT_MEALS_FEE", "75")

    # 1. Individual registration: base 200 + meals 75 = 275
    indiv_payload = {
        "registration_type": "individual",
        "domain": "AI & Machine Learning",
        "name": "Single Hacker",
        "email": "single.meals@college.edu",
        "phone": "9876543999",
        "college": "Meals Institute",
        "department": "IT",
        "year_of_study": "3rd Year",
    }
    res_indiv = client.post("/api/registrations", json=indiv_payload)
    assert res_indiv.status_code == 201
    indiv_data = res_indiv.get_json()
    assert indiv_data["entry_fee"] == 275
    assert indiv_data["base_fee"] == 200
    assert indiv_data["meals_fee"] == 75

    # 2. Team registration (2 members): base 2 * 200 = 400 + meals 75 = 475
    team_payload = {
        "registration_type": "team",
        "team_name": "Meals Team",
        "domain": "Cloud & Cybersecurity",
        "leader": {
            "name": "Team Leader Meals",
            "email": "lead.meals@college.edu",
            "phone": "9876543888",
            "college": "Meals Institute",
            "department": "CSE",
            "year_of_study": "2nd Year",
        },
        "members": [
            {
                "name": "Member Two Meals",
                "email": "mem2.meals@college.edu",
                "phone": "9876543777",
                "college": "Meals Institute",
                "department": "CSE",
                "year_of_study": "2nd Year",
            }
        ],
    }
    res_team = client.post("/api/registrations", json=team_payload)
    assert res_team.status_code == 201
    team_data = res_team.get_json()
    assert team_data["entry_fee"] == 475
    assert team_data["base_fee"] == 400
    assert team_data["meals_fee"] == 75

    # 3. Verify single registration GET endpoint returns base_fee and meals_fee
    get_res = client.get(f"/api/registrations/{team_data['registration_id']}")
    assert get_res.status_code == 200
    reg_obj = get_res.get_json()["registration"]
    assert reg_obj["entry_fee"] == 475
    assert reg_obj["base_fee"] == 400
    assert reg_obj["meals_fee"] == 75


def test_registration_id_format_matches_event_name(client):
    """Test that registration IDs are dynamically generated in the format {event_name}-{unique id}."""
    # 1. Test with 'Hackathon'
    EventSetting.set_val("EVENT_NAME", "Hackathon")
    payload1 = {
        "registration_type": "individual",
        "domain": "AI & Machine Learning",
        "full_name": "Event Hacker One",
        "email": "hacker1@event.edu",
        "phone": "9876543111",
        "college": "Event Institute",
        "department": "IT",
        "year_of_study": "3rd Year",
    }
    res1 = client.post("/api/registrations", json=payload1)
    assert res1.status_code == 201
    data1 = res1.get_json()
    reg_id_1 = data1["registration_id"]
    assert reg_id_1.startswith("HACKATHON-")
    # Verify unique ID part (after prefix) is 6 alphanumeric characters
    unique_part_1 = reg_id_1.replace("HACKATHON-", "")
    assert len(unique_part_1) == 6
    assert unique_part_1.isalnum()

    # 2. Test case-insensitive lookup
    lookup_res = client.get(f"/api/registrations/{reg_id_1.lower()}")
    assert lookup_res.status_code == 200
    assert lookup_res.get_json()["registration"]["public_id"] == reg_id_1

    # 3. Test with a multi-word event name 'TechFest 2026'
    EventSetting.set_val("EVENT_NAME", "TechFest 2026")
    payload2 = {
        "registration_type": "individual",
        "domain": "IoT & Embedded Systems",
        "full_name": "Event Hacker Two",
        "email": "hacker2@event.edu",
        "phone": "9876543222",
        "college": "TechFest College",
        "department": "ECE",
        "year_of_study": "4th Year",
    }
    res2 = client.post("/api/registrations", json=payload2)
    assert res2.status_code == 201
    data2 = res2.get_json()
    reg_id_2 = data2["registration_id"]
    assert reg_id_2.startswith("TECHFEST-2026-")
    unique_part_2 = reg_id_2.replace("TECHFEST-2026-", "")
    assert len(unique_part_2) == 6
    assert unique_part_2.isalnum()



