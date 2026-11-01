"""
Tests for QR code check-in feature:
1. Generation of unique checkin_token upon registration
2. Inclusion of checkin_token in confirmation lookup
3. Admin QR scanner check-in endpoint:
   - Requires admin authentication (401 for unauthorized)
   - Accepts raw CHK- token, public reference, or JSON QR code payload
   - Returns full team roster and members attendance list
   - Sets is_checked_in=True, checked_in_at, checked_in_by
4. Single-use check-in enforcement:
   - Second scan/attempt returns 409 Conflict with already_checked_in: True
5. Undo check-in functionality
6. Check-in KPIs and live roster stats endpoint
"""

import json
import pytest
from app.extensions import db
from app.models.registration import Registration


def _register_sample_team(client, team_name="Cyber Sentinels", member_count=3):
    """Helper to create a sample team registration via API."""
    leader = {
        "name": f"{team_name} Leader",
        "email": f"leader.{team_name.lower().replace(' ', '')}@test.com",
        "phone": "9876543210",
        "college": "MIT College of Engineering",
        "department": "Computer Science",
        "year_of_study": "3rd Year",
    }
    members = []
    for i in range(2, member_count + 1):
        members.append({
            "name": f"{team_name} Member {i}",
            "email": f"member{i}.{team_name.lower().replace(' ', '')}@test.com",
            "phone": f"987654321{i}",
            "college": "MIT College of Engineering",
            "department": "Information Technology",
            "year_of_study": "3rd Year",
        })

    payload = {
        "registration_type": "team",
        "team_name": team_name,
        "domain": "Web3 & Blockchain",
        "leader": leader,
        "members": members,
    }
    resp = client.post("/api/registrations", json=payload)
    assert resp.status_code == 201, f"Registration failed: {resp.get_data(as_text=True)}"
    data = resp.get_json()
    if "public_id" not in data and "registration_id" in data:
        data["public_id"] = data["registration_id"]
    return data


def test_registration_generates_unique_checkin_token(client):
    """Verify that registering a team automatically assigns a valid, unique check-in token."""
    res1 = _register_sample_team(client, "Alpha Squad", 3)
    res2 = _register_sample_team(client, "Beta Squad", 2)

    assert "checkin_token" in res1
    assert "checkin_token" in res2
    assert res1["checkin_token"].startswith("CHK-")
    assert res2["checkin_token"].startswith("CHK-")
    assert res1["checkin_token"] != res2["checkin_token"]


def test_confirmation_endpoint_returns_checkin_token(client):
    """Public lookup /api/registrations/<ref> must return checkin_token and initial is_checked_in=False."""
    res = _register_sample_team(client, "Gamma Squad", 3)
    ref = res["public_id"]

    resp = client.get(f"/api/registrations/{ref}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    reg = data["registration"]
    assert reg["checkin_token"] == res["checkin_token"]
    assert reg["is_checked_in"] is False
    assert reg["checked_in_at"] is None


def test_checkin_requires_authentication(client):
    """Coordinator check-in API must reject unauthenticated requests with 401."""
    res = _register_sample_team(client, "Delta Squad", 2)
    resp = client.post("/api/admin/checkin", json={"code": res["checkin_token"]})
    assert resp.status_code == 401


def test_checkin_with_valid_token_returns_full_team_roster(admin_client):
    """
    Valid coordinator check-in marks team checked in, sets coordinator metadata,
    and returns complete team members attendance details.
    """
    res = _register_sample_team(admin_client, "Epsilon Ninjas", 4)
    token = res["checkin_token"]

    checkin_resp = admin_client.post(
        "/api/admin/checkin",
        json={"code": token, "notes": "Gate 1 - Welcome desk"}
    )
    assert checkin_resp.status_code == 200
    data = checkin_resp.get_json()

    assert data["success"] is True
    assert data["already_checked_in"] is False
    assert "registration" in data
    reg = data["registration"]
    assert reg["team_name"] == "Epsilon Ninjas"
    assert reg["is_checked_in"] is True
    assert reg["checked_in_by"] == "Portal Administrator" or reg["checked_in_by"] == "admin"
    assert reg["checked_in_at"] is not None
    assert reg["checkin_notes"] == "Gate 1 - Welcome desk"

    # Verify team members attendance roster
    team = reg["team"]
    assert team is not None
    members = team["members"]
    assert len(members) == 4
    # Leader is in the members list with role leader
    leader_m = [m for m in members if m["role"] == "leader"][0]
    assert "Leader" in leader_m["name"]
    assert leader_m["college"] == "MIT College of Engineering"
    # Other members have role "member"
    normal_members = [m for m in members if m["role"] == "member"]
    assert len(normal_members) == 3
    for m in normal_members:
        assert m["email"].endswith("@test.com")


def test_single_use_enforcement_returns_409_conflict(admin_client):
    """
    Check-in QR code is valid ONCE only.
    Any second scan attempt must be rejected with 409 Conflict.
    """
    res = _register_sample_team(admin_client, "Zeta Coders", 3)
    token = res["checkin_token"]

    # First scan succeeds
    resp1 = admin_client.post("/api/admin/checkin", json={"code": token})
    assert resp1.status_code == 200

    # Second scan MUST fail with 409 Conflict
    resp2 = admin_client.post("/api/admin/checkin", json={"code": token})
    assert resp2.status_code == 409
    err_data = resp2.get_json()
    assert err_data["success"] is False
    assert err_data["already_checked_in"] is True
    assert "ALREADY CHECKED IN" in err_data["error"]
    assert "valid once only" in err_data["error"]
    assert "registration" in err_data
    assert err_data["registration"]["is_checked_in"] is True


def test_checkin_with_json_qr_code_payload(admin_client):
    """Verify scanner handling of full JSON QR code payload generated on confirmation page."""
    res = _register_sample_team(admin_client, "Omega Force", 2)
    qr_payload = json.dumps({
        "type": "synex_checkin",
        "ref": res["public_id"],
        "token": res["checkin_token"],
        "team": "Omega Force",
        "action": "checkin"
    })

    resp = admin_client.post("/api/admin/checkin", json={"code": qr_payload})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert data["registration"]["team_name"] == "Omega Force"
    assert data["registration"]["is_checked_in"] is True


def test_checkin_invalid_or_missing_code_returns_error(admin_client):
    """Invalid or empty QR code returns 400 or 404."""
    # Empty
    resp_empty = admin_client.post("/api/admin/checkin", json={"code": ""})
    assert resp_empty.status_code == 400

    # Non-existent
    resp_invalid = admin_client.post("/api/admin/checkin", json={"code": "CHK-NONEXISTENTTOKEN999"})
    assert resp_invalid.status_code == 404


def test_undo_checkin_and_recheckin(admin_client):
    """Coordinator can undo check-in if scanned by mistake, resetting state for subsequent check-in."""
    res = _register_sample_team(admin_client, "Theta Hackers", 3)
    token = res["checkin_token"]
    ref = res["public_id"]

    # Check in
    resp1 = admin_client.post("/api/admin/checkin", json={"code": token})
    assert resp1.status_code == 200
    assert resp1.get_json()["registration"]["is_checked_in"] is True

    # Undo using ref
    undo_resp = admin_client.post("/api/admin/checkin/undo", json={"ref": ref})
    assert undo_resp.status_code == 200
    undo_data = undo_resp.get_json()
    assert undo_data["success"] is True
    assert "reset" in undo_data["message"]

    # Verify via public endpoint that team is no longer checked in
    check_status = admin_client.get(f"/api/registrations/{ref}").get_json()
    assert check_status["registration"]["is_checked_in"] is False
    assert check_status["registration"]["checked_in_at"] is None

    # Now check-in can be scanned again cleanly
    resp2 = admin_client.post("/api/admin/checkin", json={"code": token})
    assert resp2.status_code == 200
    assert resp2.get_json()["registration"]["is_checked_in"] is True


def test_checkin_stats_and_roster_endpoint(admin_client):
    """Verify /api/admin/checkin/stats aggregates KPIs and live roster."""
    # Create 2 teams
    res_a = _register_sample_team(admin_client, "Team Roster A", 3)
    res_b = _register_sample_team(admin_client, "Team Roster B", 2)

    # Check in Team A only
    admin_client.post("/api/admin/checkin", json={"code": res_a["checkin_token"]})

    stats_resp = admin_client.get("/api/admin/checkin/stats")
    assert stats_resp.status_code == 200
    data = stats_resp.get_json()

    assert data["success"] is True
    metrics = data["metrics"]
    assert metrics["total_teams"] >= 2
    assert metrics["checked_in_teams"] >= 1
    assert metrics["pending_teams"] >= 1
    assert metrics["total_checked_in_participants"] >= 3

    # Check roster items
    roster = data["roster"]
    assert isinstance(roster, list)
    roster_teams = {r["team_name"]: r for r in roster}
    assert "Team Roster A" in roster_teams
    assert roster_teams["Team Roster A"]["is_checked_in"] is True
    assert "Team Roster B" in roster_teams
    assert roster_teams["Team Roster B"]["is_checked_in"] is False


def test_confirmation_email_sent_to_team_leader_with_qr_code(app, client):
    """
    Verify that when registration confirmation email is sent:
    1. It is addressed to the team leader's registered email
    2. It contains the team name and checkin token
    3. It contains the team members attendance list
    4. It attaches the QR code PNG image
    """
    from app.services.email_service import send_confirmation_email
    from app.models.email_log import EmailLog

    with app.app_context():
        res = _register_sample_team(client, "Quantum Pioneers", 3)
        reg = Registration.query.filter_by(public_id=res["public_id"]).first()
        assert reg is not None

        leader_email = reg.team.leader.email
        assert "leader.quantumpioneers@test.com" == leader_email

        # Dispatch confirmation email
        send_confirmation_email(reg)

        # Inspect EmailLog
        latest_email = EmailLog.query.filter_by(recipient=leader_email).order_by(EmailLog.id.desc()).first()
        assert latest_email is not None
        assert latest_email.recipient == leader_email
        assert "Quantum Pioneers" in latest_email.subject
        assert "Registration & Check-In Pass Confirmed" in latest_email.subject
        assert reg.checkin_token in latest_email.message
        assert reg.public_id in latest_email.message
        assert "Team Members:" in latest_email.message
        assert "Quantum Pioneers Member 2" in latest_email.message
        assert "attachment" in latest_email.message.lower()


def test_payment_verification_triggers_confirmation_email_to_team_leader(app, client):
    """
    Verify that confirming payment via /api/payments/verify automatically sends
    the confirmation pass and QR code to the team leader's email.
    """
    import hmac
    import hashlib
    from app.models.email_log import EmailLog

    with app.app_context():
        res = _register_sample_team(client, "Vortex Squad", 3)
        ref = res["public_id"]
        reg = Registration.query.filter_by(public_id=ref).first()
        leader_email = reg.team.leader.email

        # 1. Create order
        order_res = client.post("/api/payments/create-order", json={"registration_id": ref})
        assert order_res.status_code == 200
        order_id = order_res.get_json()["order_id"]

        # 2. Generate valid HMAC signature
        secret = app.config.get("RAZORPAY_KEY_SECRET", "synex_razorpay_secret_test_2026")
        payment_id = "pay_test_vortex123"
        msg = f"{order_id}|{payment_id}".encode("utf-8")
        signature = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()

        # 3. Verify payment
        verify_res = client.post("/api/payments/verify", json={
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
            "registration_id": ref,
        })
        assert verify_res.status_code == 200
        assert verify_res.get_json()["success"] is True

        # 4. Check EmailLog: Confirmation email with QR pass was logged to leader
        email_log = EmailLog.query.filter_by(recipient=leader_email, email_type="confirmation").order_by(EmailLog.id.desc()).first()
        assert email_log is not None
        assert email_log.recipient == leader_email
        assert reg.checkin_token in email_log.message
        assert "Vortex Squad" in email_log.subject


def test_admin_send_pass_endpoint_dispatches_email(admin_client):
    """
    Verify coordinator/admin can trigger /api/admin/checkin/send-pass
    to mail confirmation pass with QR code to the team leader.
    """
    from app.models.email_log import EmailLog

    res = _register_sample_team(admin_client, "Cyber Phantoms", 2)
    ref = res["public_id"]

    resp = admin_client.post("/api/admin/checkin/send-pass", json={"ref": ref})
    assert resp.status_code == 200
    data = resp.get_json()

    assert data["success"] is True
    assert "leader.cyberphantoms@test.com" in data["recipient_email"]
    assert data["team_name"] == "Cyber Phantoms"
    assert data["public_id"] == ref
    assert data["checkin_token"].startswith("CHK-")
