import json
import logging
from datetime import datetime
from typing import Dict, Any, Tuple, Optional
from app.extensions import db
from app.models.registration import Registration
from app.models.team import Team, TeamMember

logger = logging.getLogger(__name__)


def resolve_checkin_code(raw_code: str) -> Optional[Registration]:
    """
    Parses and resolves a check-in code into a Registration object.
    Supports:
      1. JSON string: {"type":"synex_checkin","ref":"SYNEX-XXXXXX","token":"CHK-XXXXXX"}
      2. Checkin token: CHK-XXXXXXXXXXXX
      3. Registration public_id: SYNEX-XXXXXX
      4. Integer DB ID
    """
    if not raw_code:
        return None

    cleaned = str(raw_code).strip()

    # Case 1: Try JSON parse
    if cleaned.startswith("{") and cleaned.endswith("}"):
        try:
            data = json.loads(cleaned)
            token = (data.get("token") or "").strip()
            ref = (data.get("ref") or data.get("registration_id") or "").strip()
            if token:
                reg = Registration.query.filter_by(checkin_token=token).first()
                if reg:
                    return reg
            if ref:
                reg = Registration.query.filter_by(public_id=ref).first()
                if reg:
                    return reg
        except Exception as e:
            logger.debug(f"Could not parse code as JSON: {e}")

    # Case 2: Checkin token match (exact or case-insensitive)
    reg_by_token = Registration.query.filter_by(checkin_token=cleaned).first()
    if not reg_by_token:
        reg_by_token = Registration.query.filter(db.func.lower(Registration.checkin_token) == cleaned.lower()).first()
    if reg_by_token:
        return reg_by_token

    # Case 3: Public registration ID match (exact or case-insensitive)
    reg_by_ref = Registration.query.filter_by(public_id=cleaned).first()
    if not reg_by_ref:
        reg_by_ref = Registration.query.filter(db.func.lower(Registration.public_id) == cleaned.lower()).first()
    if reg_by_ref:
        return reg_by_ref

    # Case 4: Numeric primary key
    if cleaned.isdigit():
        return Registration.query.get(int(cleaned))

    return None


def verify_and_checkin(code: str, coordinator_name: str = "Coordinator", notes: str = None) -> Tuple[bool, Dict[str, Any], int]:
    """
    Validates a team QR check-in code and marks the team as checked in.
    Enforces SINGLE-USE CHECK-IN (valid once only).
    Returns team & member details on success or failure.
    """
    if not code or not str(code).strip():
        return False, {"success": False, "error": "No check-in code provided. Please scan a QR code or enter a code."}, 400

    reg = resolve_checkin_code(code)
    if not reg:
        return False, {
            "success": False,
            "error": f"Invalid check-in code '{code}'. No matching team registration was found in the portal.",
        }, 404

    team_name = reg.team.team_name if reg.team else (reg.participant.full_name if reg.participant else reg.public_id)

    # Enforce SINGLE-USE rule: If already checked in, reject reuse attempt
    if reg.is_checked_in:
        time_str = reg.checked_in_at.strftime("%b %d, %Y at %I:%M %p") if reg.checked_in_at else "Earlier"
        coordinator = reg.checked_in_by or "Coordinator"
        logger.warning(f"Duplicate check-in attempt for {reg.public_id} (Team: {team_name}). Already checked in by {coordinator} at {time_str}")
        return False, {
            "success": False,
            "already_checked_in": True,
            "error": f"ALREADY CHECKED IN: Team '{team_name}' ({reg.public_id}) was already checked in on {time_str} by {coordinator}. Each QR code is valid once only!",
            "registration": reg.to_dict(include_team_details=True),
        }, 409

    # Valid check-in: mark as checked in
    try:
        reg.is_checked_in = True
        reg.checked_in_at = datetime.utcnow()
        reg.checked_in_by = coordinator_name or "Coordinator"
        if notes:
            reg.checkin_notes = notes.strip()
        
        # Confirm registration if pending
        if reg.registration_status == "pending":
            reg.registration_status = "confirmed"

        db.session.commit()
        logger.info(f"Team '{team_name}' ({reg.public_id}) successfully checked in by {coordinator_name}")

        return True, {
            "success": True,
            "already_checked_in": False,
            "message": f"Check-In Successful! Team '{team_name}' is verified and checked in.",
            "registration": reg.to_dict(include_team_details=True),
        }, 200

    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error checking in registration {reg.public_id}: {e}")
        return False, {"success": False, "error": f"Database error during check-in: {str(e)}"}, 500


def undo_checkin(ref_or_id: Any) -> Tuple[bool, str, int]:
    """
    Allows a coordinator to undo an accidental check-in.
    Accepts numeric DB ID, public_id (SYNEX-...), or checkin_token (CHK-...).
    """
    reg = resolve_checkin_code(ref_or_id)
    if not reg:
        return False, "Registration not found.", 404

    team_name = reg.team.team_name if reg.team else (reg.participant.full_name if reg.participant else reg.public_id)
    reg.is_checked_in = False
    reg.checked_in_at = None
    reg.checked_in_by = None
    reg.checkin_notes = None
    db.session.commit()

    logger.info(f"Check-in undone for registration {reg.public_id} (Team: {team_name}) by coordinator.")
    return True, f"Check-in status reset for {reg.public_id} (Team: {team_name}).", 200


def get_checkin_summary_and_roster() -> Dict[str, Any]:
    """
    Returns aggregated metrics and live roster of all teams with their check-in status.
    """
    all_regs = Registration.query.order_by(
        Registration.is_checked_in.desc(),
        Registration.checked_in_at.desc(),
        Registration.created_at.desc()
    ).all()

    total_teams = len(all_regs)
    checked_in_teams = sum(1 for r in all_regs if r.is_checked_in)
    pending_teams = total_teams - checked_in_teams

    total_checked_in_participants = 0
    roster = []

    for r in all_regs:
        r_dict = r.to_dict(include_team_details=True)
        # Calculate participant count for this team
        if r.registration_type == "team" and r.team and r.team.members:
            m_count = len(r.team.members)
        else:
            m_count = 1
        
        r_dict["member_count"] = m_count
        if r.is_checked_in:
            total_checked_in_participants += m_count

        roster.append(r_dict)

    return {
        "metrics": {
            "total_teams": total_teams,
            "checked_in_teams": checked_in_teams,
            "pending_teams": pending_teams,
            "total_checked_in_participants": total_checked_in_participants,
            "checkin_percentage": round((checked_in_teams / total_teams * 100), 1) if total_teams > 0 else 0,
        },
        "roster": roster,
    }


def get_qr_code_payload(reg: Registration) -> str:
    """
    Returns the standardized JSON payload for a registration check-in QR code.
    Matches the schema generated on the confirmation pass and expected by coordinator scanner.
    """
    team_name = reg.team.team_name if reg.team else (reg.participant.full_name if reg.participant else reg.public_id)
    return json.dumps({
        "type": "synex_checkin",
        "ref": reg.public_id,
        "token": reg.checkin_token or "",
        "team": team_name,
        "action": "checkin",
    }, separators=(',', ':'))


def generate_qr_code_png_bytes(data_str: str) -> bytes:
    """
    Generates high-resolution PNG bytes of a QR code encoding data_str.
    Uses Python qrcode module with error correction level M.
    """
    import io
    import qrcode

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(data_str)
    qr.make(fit=True)

    img = qr.make_image(fill_color="#0F172A", back_color="#FFFFFF")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
