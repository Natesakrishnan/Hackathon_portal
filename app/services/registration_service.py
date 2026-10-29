import re
import secrets
import string
import logging
from typing import Dict, Any, Tuple
from app.extensions import db
from app.models.participant import Participant
from app.models.team import Team, TeamMember
from app.models.registration import Registration
from app.models.event_setting import EventSetting
from config import Config

logger = logging.getLogger(__name__)

VALID_DOMAINS = [
    "AI & Machine Learning",
    "Web3 & Blockchain",
    "IoT & Embedded Systems",
    "Cloud & Cybersecurity",
    "Healthcare & MedTech",
    "Open Innovation & FinTech",
]

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_REGEX = re.compile(r"^[0-9]{10}$")


def generate_public_id() -> str:
    """Generates a unique reference ID like SYNEX-A8F29C."""
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(10):
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        candidate = f"SYNEX-{code}"
        if not Registration.query.filter_by(public_id=candidate).first():
            return candidate
    # Fallback with timestamp component
    import time
    return f"SYNEX-{int(time.time()) % 1000000:06d}"


def validate_participant_data(data: Dict[str, Any], label: str = "Participant") -> Tuple[bool, str]:
    """Validates participant fields."""
    name = (data.get("full_name") or data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = re.sub(r"\D", "", str(data.get("phone") or ""))
    college = (data.get("college") or "").strip()
    department = (data.get("department") or "").strip()
    year = (data.get("year_of_study") or data.get("year") or "").strip()

    if len(name) < 2:
        return False, f"{label} name must be at least 2 characters long."
    if not EMAIL_REGEX.match(email):
        return False, f"{label} email '{email}' is invalid."
    if len(phone) < 10 or len(phone) > 13:
        return False, f"{label} phone number must be a valid 10-digit number."
    if len(college) < 2:
        return False, f"{label} college name is required."
    if len(department) < 2:
        return False, f"{label} department is required."
    if not year:
        return False, f"{label} year of study is required."

    return True, ""


def get_or_create_participant(data: Dict[str, Any]) -> Participant:
    """Finds existing participant by email or creates a new one."""
    email = (data.get("email") or "").strip().lower()
    participant = Participant.query.filter_by(email=email).first()
    clean_phone = re.sub(r"\D", "", str(data.get("phone") or ""))

    if participant:
        participant.full_name = (data.get("full_name") or data.get("name") or "").strip()
        participant.phone = clean_phone
        participant.college = (data.get("college") or "").strip()
        participant.department = (data.get("department") or "").strip()
        participant.year_of_study = (data.get("year_of_study") or data.get("year") or "").strip()
    else:
        participant = Participant(
            full_name=(data.get("full_name") or data.get("name") or "").strip(),
            email=email,
            phone=clean_phone,
            college=(data.get("college") or "").strip(),
            department=(data.get("department") or "").strip(),
            year_of_study=(data.get("year_of_study") or data.get("year") or "").strip(),
        )
        db.session.add(participant)
        db.session.flush()

    return participant


def register_participant(payload: Dict[str, Any]) -> Tuple[bool, Dict[str, Any], int]:
    """
    Main registration service function.
    Handles both individual and team registrations with database atomicity.
    """
    reg_type = payload.get("registration_type", "individual").strip().lower()
    domain = (payload.get("domain") or "").strip()

    # Validate domain
    if domain not in VALID_DOMAINS:
        return False, {"error": f"Invalid domain selected. Must be one of: {', '.join(VALID_DOMAINS)}"}, 400

    # Determine Fee
    indiv_fee = int(EventSetting.get_val("EVENT_INDIVIDUAL_FEE", Config.EVENT_INDIVIDUAL_FEE))
    team_fee = int(EventSetting.get_val("EVENT_TEAM_FEE", Config.EVENT_TEAM_FEE))

    try:
        if reg_type == "individual":
            # Validate individual fields
            valid, err = validate_participant_data(payload, "Participant")
            if not valid:
                return False, {"error": err}, 400

            participant = get_or_create_participant(payload)

            public_id = generate_public_id()
            registration = Registration(
                public_id=public_id,
                registration_type="individual",
                participant_id=participant.id,
                team_id=None,
                domain=domain,
                entry_fee=indiv_fee,
                currency="INR",
                registration_status="pending",
                payment_status="unpaid",
            )
            db.session.add(registration)
            db.session.commit()

            logger.info(f"Individual registration created: {public_id} for {participant.email}")
            return True, {
                "success": True,
                "message": "Registration created successfully. Proceed to payment.",
                "registration_id": public_id,
                "registration_type": "individual",
                "entry_fee": indiv_fee,
                "domain": domain,
                "participant": participant.to_dict(),
                "redirect_url": f"/payment?ref={public_id}",
            }, 201

        elif reg_type == "team":
            team_name = (payload.get("team_name") or "").strip()
            if len(team_name) < 2:
                return False, {"error": "Team name must be at least 2 characters long."}, 400

            # Check if team name already exists
            existing_team = Team.query.filter_by(team_name=team_name).first()
            if existing_team:
                return False, {"error": f"Team name '{team_name}' is already taken. Please choose another name."}, 400

            # Leader validation
            leader_data = payload.get("leader") or {
                "full_name": payload.get("leader_name"),
                "email": payload.get("leader_email"),
                "phone": payload.get("leader_phone"),
                "college": payload.get("leader_college"),
                "department": payload.get("leader_department"),
                "year_of_study": payload.get("leader_year"),
            }
            valid, err = validate_participant_data(leader_data, "Team Leader")
            if not valid:
                return False, {"error": err}, 400

            # Members validation
            members_list = payload.get("members", [])
            if not isinstance(members_list, list) or len(members_list) < 1:
                return False, {"error": "Team must include at least 1 additional team member (minimum 2 members total)."}, 400
            if len(members_list) > 3:
                return False, {"error": "Team cannot exceed 4 members total (1 leader + max 3 members)."}, 400

            # Check unique emails within team
            all_emails = [leader_data.get("email", "").strip().lower()]
            for idx, m_data in enumerate(members_list, start=2):
                valid, err = validate_participant_data(m_data, f"Member {idx}")
                if not valid:
                    return False, {"error": err}, 400
                m_email = m_data.get("email", "").strip().lower()
                if m_email in all_emails:
                    return False, {"error": f"Duplicate email '{m_email}' found in team. All members must have unique emails."}, 400
                all_emails.append(m_email)

            # Persist leader
            leader = get_or_create_participant(leader_data)

            # Create Team
            team = Team(team_name=team_name, leader_id=leader.id)
            db.session.add(team)
            db.session.flush()

            # Add leader as team member
            leader_member = TeamMember(team_id=team.id, participant_id=leader.id, role="leader")
            db.session.add(leader_member)

            # Add other members
            for m_data in members_list:
                member_participant = get_or_create_participant(m_data)
                member_rel = TeamMember(team_id=team.id, participant_id=member_participant.id, role="member")
                db.session.add(member_rel)

            # Create Registration record
            public_id = generate_public_id()
            registration = Registration(
                public_id=public_id,
                registration_type="team",
                participant_id=leader.id,
                team_id=team.id,
                domain=domain,
                entry_fee=team_fee,
                currency="INR",
                registration_status="pending",
                payment_status="unpaid",
            )
            db.session.add(registration)
            db.session.commit()

            logger.info(f"Team registration created: {public_id} for team '{team_name}' (Leader: {leader.email})")
            return True, {
                "success": True,
                "message": "Team registration created successfully. Proceed to payment.",
                "registration_id": public_id,
                "registration_type": "team",
                "team_name": team_name,
                "entry_fee": team_fee,
                "domain": domain,
                "members_count": len(all_emails),
                "redirect_url": f"/payment?ref={public_id}",
            }, 201

        else:
            return False, {"error": f"Unsupported registration type '{reg_type}'. Must be 'individual' or 'team'."}, 400

    except Exception as e:
        db.session.rollback()
        logger.exception(f"Error during registration: {e}")
        return False, {"error": "An error occurred while creating registration. Please try again."}, 500
