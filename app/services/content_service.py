import json
import logging
from typing import Dict, Any, List, Tuple
from app.models.event_setting import EventSetting

logger = logging.getLogger(__name__)

DEFAULT_RULES = [
    {
        "id": "eligibility",
        "num": 1,
        "title": "Eligibility & Format",
        "content": "SYNEX 2026 is open to all students actively pursuing full-time or part-time undergraduate (B.E./B.Tech, BCA, B.Sc), postgraduate (M.E./M.Tech, MCA, M.Sc, MBA), or diploma degrees from accredited educational institutions worldwide.\n\nBoth in-person attendance at our Bengaluru tech campus and virtual hybrid participation options are provided. All participants must present a valid student identity card or proof of current enrollment at check-in."
    },
    {
        "id": "teamsize",
        "num": 2,
        "title": "Individual & Team Composition",
        "content": "Participants may choose to compete individually or in teams of up to 4 members:\n• Solo Hackers: Individuals can register at the discounted individual rate.\n• Teams: Teams can comprise between 2 to 4 members with a fixed team entry fee.\n• Inter-College Teams: Cross-institutional teams and interdisciplinary pairings are highly encouraged.\n• Single Entry Restriction: An individual can belong to only one team during the event."
    },
    {
        "id": "originality",
        "num": 3,
        "title": "Project Originality & Academic Integrity",
        "content": "All core codebase, architectural designs, and functional components must be authored during the official 36-hour hacking sprint. Pre-existing applications, pre-built turnkey templates, or previously published capstone projects are strictly prohibited.\n\nUse of publicly available open-source libraries, frameworks (React, Flutter, PyTorch, Node.js), public APIs, and foundational models is permitted provided they are disclosed in your project README file."
    },
    {
        "id": "ip",
        "num": 4,
        "title": "100% Intellectual Property (IP) Retention",
        "content": "You own what you build. Neither the SYNEX organizers, sponsors, nor venue partners claim any rights, equity, or ownership over the intellectual property created during the hackathon.\n\nTeams remain free to open-source, patent, incorporate into startups, or commercialize their products after the event concludes."
    },
    {
        "id": "conduct",
        "num": 5,
        "title": "Code of Conduct",
        "content": "SYNEX is committed to providing a safe, respectful, inclusive, and harassment-free experience for everyone regardless of gender, sexual orientation, disability, physical appearance, race, ethnicity, or religion.\n\nHarassment of any kind, plagiarism, toxic competitive behavior, or violation of venue regulations will result in immediate disqualification and removal from the premises without refund."
    },
    {
        "id": "submission",
        "num": 6,
        "title": "Submission Requirements",
        "content": "To qualify for judging, all teams must finalize and submit the following assets prior to the code freeze:\n• GitHub Repository: Public link containing all source code with commit history timestamped during the sprint.\n• README Documentation: Clear setup instructions, problem statement, architecture overview, and third-party dependencies.\n• Demonstration Video: A 2-minute unedited walkthrough screen recording showcasing live functionality.\n• Pitch Deck: 5-slide PDF presentation outlining value proposition, market impact, and technical stack."
    },
    {
        "id": "judging",
        "num": 7,
        "title": "Evaluation & Judging Rubric",
        "content": "Projects will be systematically evaluated by an independent jury according to a weighted rubric: Innovation & Originality (25%), Technical Complexity (25%), Practical Viability & Impact (20%), User Experience UI/UX (15%), and Presentation & Pitch (15%)."
    },
    {
        "id": "fees",
        "num": 8,
        "title": "Entry Fee & Refund Policy",
        "content": "Registration fees contribute directly towards venue infrastructure, 1Gbps connectivity, official kits, mentor travel, and round-the-clock catering for participants.\n\nBecause logistics, meals, and swag production are locked in advance with vendors, registration fees are non-refundable. Team substitutions can be approved up to 72 hours before kickoff."
    },
    {
        "id": "deadlines",
        "num": 9,
        "title": "Key Deadlines",
        "content": "Please take note of critical registration and submission milestones:\n• Registration Closes: As configured in event settings.\n• Team Roster Freeze: 48 hours before kickoff.\n• Hackathon Kickoff: 08:30 AM IST Day 1.\n• Final Code Freeze: 05:00 PM IST Day 2."
    }
]

DEFAULT_SCHEDULE = [
    {
        "phase": "day-pre",
        "phase_title": "Phase 1: Pre-Hackathon Milestones",
        "time": "October 15, 2026",
        "title": "Participant Registration Opens",
        "desc": "Public registration portal launch for individual hackers and multidisciplinary teams.",
        "tag": "Online"
    },
    {
        "phase": "day-pre",
        "phase_title": "Phase 1: Pre-Hackathon Milestones",
        "time": "November 10, 2026 — 11:59 PM",
        "title": "Registration Deadline",
        "desc": "Portal closes once 300 team capacity is reached or deadline expires.",
        "tag": "Deadline"
    },
    {
        "phase": "day-pre",
        "phase_title": "Phase 1: Pre-Hackathon Milestones",
        "time": "November 12, 2026 — 06:00 PM",
        "title": "Virtual Team Mixer & Orientation",
        "desc": "Discord onboarding call, API credential distribution, and team-matching session for solo entrants.",
        "tag": "Virtual Call"
    },
    {
        "phase": "day-1",
        "phase_title": "Day 1 — Saturday, November 14, 2026",
        "time": "08:30 AM – 09:45 AM",
        "title": "Participant Check-In & Swag Kit Issuance",
        "desc": "Badge verification, seating allocation, Wi-Fi configuration, and welcome breakfast.",
        "tag": "Main Atrium"
    },
    {
        "phase": "day-1",
        "phase_title": "Day 1 — Saturday, November 14, 2026",
        "time": "10:00 AM – 11:15 AM",
        "title": "Opening Ceremony & Track Briefing",
        "desc": "Keynote addresses, sponsor API introductions, and official release of specialized domain problem statements.",
        "tag": "Auditorium"
    },
    {
        "phase": "day-1",
        "phase_title": "Day 1 — Saturday, November 14, 2026",
        "time": "11:30 AM Sharp",
        "title": "Hacking Begins! (36-Hour Sprint Clock Starts)",
        "desc": "Repositories initialized, architecture diagrams locked, and active development commences.",
        "tag": "Clock Active"
    },
    {
        "phase": "day-1",
        "phase_title": "Day 1 — Saturday, November 14, 2026",
        "time": "01:30 PM – 02:30 PM",
        "title": "Buffet Lunch & Networking",
        "desc": "Nutritious lunch served at the cafeteria. Dietary restrictions accommodated.",
        "tag": "Cafeteria"
    },
    {
        "phase": "day-1",
        "phase_title": "Day 1 — Saturday, November 14, 2026",
        "time": "04:30 PM – 06:00 PM",
        "title": "Mentorship Round 1: Architecture Checkpoint",
        "desc": "Industry mentors review team system designs, tech stacks, and algorithmic approaches.",
        "tag": "Mentorship"
    },
    {
        "phase": "day-1",
        "phase_title": "Day 1 — Saturday, November 14, 2026",
        "time": "08:00 PM – 09:30 PM",
        "title": "Dinner & Lightning Tech Talks",
        "desc": "Dinner buffet with 10-minute flash presentations from sponsor engineers.",
        "tag": "Cafeteria"
    },
    {
        "phase": "day-1",
        "phase_title": "Day 1 — Saturday, November 14, 2026",
        "time": "11:30 PM",
        "title": "Midnight Energy Refuel & Mini-Challenge",
        "desc": "Coffee, energy snacks, Red Bull, and an optional trivia challenge with spot prizes.",
        "tag": "Recreation"
    },
    {
        "phase": "day-2",
        "phase_title": "Day 2 — Sunday, November 15, 2026",
        "time": "08:00 AM – 09:00 AM",
        "title": "Breakfast & Power Up",
        "desc": "Fresh hot breakfast, fruits, juice, and barista coffee station.",
        "tag": "Cafeteria"
    },
    {
        "phase": "day-2",
        "phase_title": "Day 2 — Sunday, November 15, 2026",
        "time": "10:00 AM – 11:30 AM",
        "title": "Mentorship Round 2: Pitch & MVP Dry-Run",
        "desc": "Mock pitch sessions to prepare teams for final jury demonstrations.",
        "tag": "Mentorship"
    },
    {
        "phase": "day-2",
        "phase_title": "Day 2 — Sunday, November 15, 2026",
        "time": "01:00 PM – 02:00 PM",
        "title": "Working Lunch",
        "desc": "Grab-and-go lunch boxes delivered directly to team workstations.",
        "tag": "Hack Bays"
    },
    {
        "phase": "day-2",
        "phase_title": "Day 2 — Sunday, November 15, 2026",
        "time": "05:00 PM Sharp",
        "title": "Code Freeze & Submission Lock",
        "desc": "GitHub commits locked, video links submitted, and presentation decks finalized.",
        "tag": "Hard Deadline"
    },
    {
        "phase": "day-2",
        "phase_title": "Day 2 — Sunday, November 15, 2026",
        "time": "05:30 PM – 08:00 PM",
        "title": "Grand Jury Expo & Live Demonstrations",
        "desc": "Top finalists present live 3-minute demonstrations and defend technical decisions before judges.",
        "tag": "Auditorium"
    },
    {
        "phase": "day-2",
        "phase_title": "Day 2 — Sunday, November 15, 2026",
        "time": "08:30 PM – 09:30 PM",
        "title": "Valedictory Ceremony & Prize Distribution",
        "desc": "Winner announcements, trophy presentations, cash prizes, and closing remarks.",
        "tag": "Main Stage"
    }
]


def get_rules_content() -> Dict[str, Any]:
    """Retrieves current public event rules from persistent settings or returns defaults with live fees."""
    raw = EventSetting.get_val("EVENT_RULES_DATA")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and "rules" in parsed:
                parsed["is_custom"] = True
                return parsed
        except Exception as e:
            logger.warning(f"Failed to parse stored EVENT_RULES_DATA: {e}")

    try:
        from flask import current_app
        indiv_fee = int(EventSetting.get_val("EVENT_INDIVIDUAL_FEE", current_app.config.get("EVENT_INDIVIDUAL_FEE", 299)))
        team_fee = int(EventSetting.get_val("EVENT_TEAM_FEE", current_app.config.get("EVENT_TEAM_FEE", 999)))
    except Exception:
        indiv_fee = 299
        team_fee = 999

    dynamic_rules = []
    for r in DEFAULT_RULES:
        rule_copy = dict(r)
        if rule_copy.get("id") == "teamsize":
            rule_copy["content"] = (
                f"Participants may choose to compete individually or in teams of up to 4 members:\n"
                f"• Solo Hackers: Individuals can register at the discounted individual rate of ₹{indiv_fee}.\n"
                f"• Teams: Teams can comprise between 2 to 4 members with a fixed team entry fee of ₹{team_fee}.\n"
                f"• Inter-College Teams: Cross-institutional teams and interdisciplinary pairings are highly encouraged.\n"
                f"• Single Entry Restriction: An individual can belong to only one team during the event."
            )
        elif rule_copy.get("id") == "fees":
            rule_copy["content"] = (
                f"Registration fees contribute directly towards venue infrastructure, 1Gbps connectivity, official kits, mentor travel, and round-the-clock catering for participants:\n"
                f"• Individual Fee: ₹{indiv_fee}\n"
                f"• Team Fee: ₹{team_fee} (fixed fee for 2 to 4 members)\n\n"
                f"Because logistics, meals, and swag production are locked in advance with vendors, registration fees are non-refundable. Team substitutions can be approved up to 72 hours before kickoff."
            )
        dynamic_rules.append(rule_copy)

    return {
        "notice_banner": "SAMPLE CONTENT: Rules, eligibility guidelines, and refund terms are sample content for demonstration.",
        "rules": dynamic_rules,
        "is_custom": False,
    }


def save_rules_content(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Validates and persists updated public rules content in database settings."""
    if not isinstance(data, dict):
        return False, "Rules payload must be a JSON object."

    rules_list = data.get("rules")
    if not isinstance(rules_list, list) or len(rules_list) == 0:
        return False, "Rules list must contain at least one rule item."

    clean_rules = []
    for idx, item in enumerate(rules_list, start=1):
        if not isinstance(item, dict):
            return False, f"Rule item {idx} must be an object."
        title = (item.get("title") or "").strip()
        content = (item.get("content") or "").strip()
        if len(title) < 2:
            return False, f"Rule #{idx} title must be at least 2 characters."
        if len(content) < 5:
            return False, f"Rule #{idx} content must be at least 5 characters."

        clean_rules.append({
            "id": (item.get("id") or f"rule-{idx}").strip(),
            "num": item.get("num") or idx,
            "title": title,
            "content": content,
        })

    payload = {
        "notice_banner": (data.get("notice_banner") or "").strip(),
        "rules": clean_rules,
        "is_custom": True,
    }

    EventSetting.set_val("EVENT_RULES_DATA", json.dumps(payload), "Custom Public Event Rules & Guidelines")
    logger.info("Successfully updated public event rules in database settings.")
    return True, "Public event rules saved and synchronized with live site."


def reset_rules_to_default() -> Tuple[bool, str]:
    """Resets public rules back to factory defaults."""
    record = EventSetting.query.filter_by(key="EVENT_RULES_DATA").first()
    if record:
        from app.extensions import db
        db.session.delete(record)
        db.session.commit()
    return True, "Public rules restored to default."


def get_schedule_content() -> Dict[str, Any]:
    """Retrieves current public event schedule from persistent settings or returns defaults."""
    raw = EventSetting.get_val("EVENT_SCHEDULE_DATA")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and ("milestones" in parsed or "schedule" in parsed):
                items = parsed.get("milestones") or parsed.get("schedule") or []
                parsed["milestones"] = items
                parsed["schedule"] = items
                parsed["is_custom"] = True
                return parsed
        except Exception as e:
            logger.warning(f"Failed to parse stored EVENT_SCHEDULE_DATA: {e}")

    return {
        "notice_banner": "SAMPLE TIMELINE: Event dates, room allocations, and session times are sample placeholders for demonstration.",
        "milestones": DEFAULT_SCHEDULE,
        "schedule": DEFAULT_SCHEDULE,
        "is_custom": False,
    }


def save_schedule_content(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Validates and persists updated public schedule timeline in database settings."""
    if not isinstance(data, dict):
        return False, "Schedule payload must be a JSON object."

    schedule_list = data.get("milestones") or data.get("schedule")
    if not isinstance(schedule_list, list) or len(schedule_list) == 0:
        return False, "Schedule list must contain at least one timeline item."

    clean_schedule = []
    for idx, item in enumerate(schedule_list, start=1):
        if not isinstance(item, dict):
            return False, f"Schedule item {idx} must be an object."
        title = (item.get("title") or "").strip()
        time_badge = (item.get("time") or "").strip()
        desc = (item.get("desc") or "").strip()
        phase = (item.get("phase") or "day-1").strip()
        phase_title = (item.get("phase_title") or "").strip()
        tag = (item.get("tag") or "").strip()

        if len(title) < 2:
            return False, f"Milestone #{idx} title must be at least 2 characters."
        if not time_badge:
            return False, f"Milestone #{idx} time/date is required."

        clean_schedule.append({
            "phase": phase,
            "phase_title": phase_title,
            "time": time_badge,
            "title": title,
            "desc": desc,
            "tag": tag,
        })

    payload = {
        "notice_banner": (data.get("notice_banner") or "").strip(),
        "milestones": clean_schedule,
        "schedule": clean_schedule,
        "is_custom": True,
    }

    EventSetting.set_val("EVENT_SCHEDULE_DATA", json.dumps(payload), "Custom Public Event Schedule & Agenda")
    logger.info("Successfully updated public event schedule in database settings.")
    return True, "Public event schedule saved and synchronized with live site."


def reset_schedule_to_default() -> Tuple[bool, str]:
    """Resets public schedule back to factory defaults."""
    record = EventSetting.query.filter_by(key="EVENT_SCHEDULE_DATA").first()
    if record:
        from app.extensions import db
        db.session.delete(record)
        db.session.commit()
    return True, "Public schedule restored to default."
