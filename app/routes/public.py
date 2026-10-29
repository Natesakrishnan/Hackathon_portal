import os
from flask import Blueprint, render_template, request, jsonify, current_app, send_from_directory
from app.extensions import db
from app.models.contact_message import ContactMessage
from app.models.event_setting import EventSetting
from app.services.registration_service import VALID_DOMAINS
from app.services.content_service import get_rules_content, get_schedule_content
from config import Config

public_bp = Blueprint("public", __name__)


@public_bp.route("/css/<path:filename>")
def serve_css(filename):
    return send_from_directory(os.path.join(current_app.root_path, "static", "css"), filename)


@public_bp.route("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(os.path.join(current_app.root_path, "static", "js"), filename)


@public_bp.route("/assets/<path:filename>")
def serve_assets(filename):
    return send_from_directory(os.path.join(current_app.root_path, "static", "assets"), filename)


@public_bp.route("/")
def index():
    return render_template("index.html")


@public_bp.route("/rules")
@public_bp.route("/rules.html")
def rules():
    content = get_rules_content()
    return render_template("rules.html", rules_data=content)


@public_bp.route("/schedule")
@public_bp.route("/schedule.html")
def schedule():
    content = get_schedule_content()
    return render_template("schedule.html", schedule_data=content)


@public_bp.route("/api/public/rules", methods=["GET"])
def api_public_rules():
    """Returns the current rules and guidelines for public portal."""
    content = get_rules_content()
    return jsonify({"success": True, "data": content})


@public_bp.route("/api/public/schedule", methods=["GET"])
def api_public_schedule():
    """Returns the current schedule agenda for public portal."""
    content = get_schedule_content()
    return jsonify({"success": True, "data": content})


@public_bp.route("/contact")
@public_bp.route("/contact.html")
def contact():
    return render_template("contact.html")


@public_bp.route("/api/domains", methods=["GET"])
def get_domains():
    """Returns the list of official hackathon domains."""
    return jsonify({"domains": VALID_DOMAINS})


@public_bp.route("/api/config", methods=["GET"])
def get_public_config():
    """Returns dynamic public event configuration from persistent database settings."""
    event_name = EventSetting.get_val("EVENT_NAME", current_app.config.get("EVENT_NAME", "SYNEX 2026"))
    indiv_fee = int(EventSetting.get_val("EVENT_INDIVIDUAL_FEE", current_app.config.get("EVENT_INDIVIDUAL_FEE", 299)))
    team_fee = int(EventSetting.get_val("EVENT_TEAM_FEE", current_app.config.get("EVENT_TEAM_FEE", 999)))
    deadline = EventSetting.get_val("REGISTRATION_DEADLINE", "2026-11-30T23:59:59")
    prize_pool = EventSetting.get_val("TOTAL_PRIZE_POOL", "₹2,50,000")
    reg_open = EventSetting.get_val("REGISTRATION_OPEN", "true").lower() in ("true", "1", "yes")
    
    return jsonify({
        "event_name": event_name,
        "individual_fee": indiv_fee,
        "team_fee": team_fee,
        "currency": current_app.config.get("EVENT_CURRENCY", "INR"),
        "registration_deadline": deadline,
        "prize_pool": prize_pool,
        "registration_open": reg_open,
        "razorpay_key_id": current_app.config.get("RAZORPAY_KEY_ID"),
        "min_team_members": 2,
        "max_team_members": 4,
    })


@public_bp.route("/api/contact", methods=["POST"])
def submit_contact_form():
    """Handles contact message submissions."""
    data = request.get_json(silent=True) or request.form.to_dict()
    
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    subject = (data.get("subject") or "General Inquiry").strip()
    message = (data.get("message") or "").strip()

    if len(name) < 2:
        return jsonify({"success": False, "error": "Name must be at least 2 characters long."}), 400
    if "@" not in email or "." not in email:
        return jsonify({"success": False, "error": "Please provide a valid email address."}), 400
    if len(message) < 5:
        return jsonify({"success": False, "error": "Message must be at least 5 characters long."}), 400

    try:
        msg = ContactMessage(name=name, email=email, subject=subject, message=message)
        db.session.add(msg)
        db.session.commit()
        return jsonify({"success": True, "message": "Thank you! Your message has been sent to the organizing team."}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": "Failed to send message. Please try again."}), 500
