import os
from flask import Blueprint, render_template, request, jsonify, current_app, send_from_directory
from app.extensions import db
from app.models.contact_message import ContactMessage
from app.models.event_setting import EventSetting
from app.services.registration_service import VALID_DOMAINS
from app.services.content_service import get_rules_content, get_schedule_content, get_contact_content
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


@public_bp.route("/manifest.json")
@public_bp.route("/manifest.webmanifest")
def serve_manifest():
    return send_from_directory(
        os.path.join(current_app.root_path, "static"),
        "manifest.json",
        mimetype="application/manifest+json"
    )


@public_bp.route("/sw.js")
def serve_sw():
    response = send_from_directory(
        os.path.join(current_app.root_path, "static"),
        "sw.js",
        mimetype="application/javascript"
    )
    response.headers["Service-Worker-Allowed"] = "/"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


@public_bp.route("/offline.html")
@public_bp.route("/offline")
def offline_page():
    return render_template("offline.html")


@public_bp.route("/icons/<path:filename>")
def serve_icons(filename):
    return send_from_directory(
        os.path.join(current_app.root_path, "static", "icons"),
        filename
    )


@public_bp.route("/")
@public_bp.route("/index.html")
@public_bp.route("/index")
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


@public_bp.route("/api/public/contact", methods=["GET"])
def api_public_contact():
    """Returns current public contact and venue details."""
    content = get_contact_content()
    return jsonify({"success": True, "data": content})


@public_bp.route("/contact")
@public_bp.route("/contact.html")
def contact():
    content = get_contact_content()
    return render_template("contact.html", contact_data=content)


@public_bp.route("/api/domains", methods=["GET"])
def get_domains():
    """Returns the list of official hackathon domains."""
    return jsonify({"domains": VALID_DOMAINS})


@public_bp.route("/api/config", methods=["GET"])
def get_public_config():
    """Returns dynamic public event configuration from persistent database settings."""
    event_name = EventSetting.get_val("EVENT_NAME", current_app.config.get("EVENT_NAME", "Hack 2026"))
    indiv_fee = int(EventSetting.get_val("EVENT_INDIVIDUAL_FEE", current_app.config.get("EVENT_INDIVIDUAL_FEE", 299)))
    team_fee = int(EventSetting.get_val("EVENT_TEAM_FEE", current_app.config.get("EVENT_TEAM_FEE", 999)))
    per_member_fee = int(EventSetting.get_val("EVENT_PER_MEMBER_FEE", current_app.config.get("EVENT_PER_MEMBER_FEE", 250)))
    meals_fee = int(EventSetting.get_val("EVENT_MEALS_FEE", current_app.config.get("EVENT_MEALS_FEE", 0)))
    min_team_members = int(EventSetting.get_val("MIN_TEAM_MEMBERS", current_app.config.get("MIN_TEAM_MEMBERS", 2)))
    max_team_members = int(EventSetting.get_val("MAX_TEAM_MEMBERS", current_app.config.get("MAX_TEAM_MEMBERS", 4)))
    deadline = EventSetting.get_val("REGISTRATION_DEADLINE", "2026-11-30T23:59:59")
    prize_pool = EventSetting.get_val("TOTAL_PRIZE_POOL", "₹2,50,000")
    reg_open = EventSetting.get_val("REGISTRATION_OPEN", "true").lower() in ("true", "1", "yes")
    
    event_short_name = event_name.split()[0] if event_name else "Hack"
    brand_initial = event_name[0].upper() if event_name else "H"
    contact_data = get_contact_content()
    
    return jsonify({
        "event_name": event_name,
        "event_short_name": event_short_name,
        "brand_initial": brand_initial,
        "individual_fee": indiv_fee,
        "team_fee": team_fee,
        "per_member_fee": per_member_fee,
        "meals_fee": meals_fee,
        "currency": current_app.config.get("EVENT_CURRENCY", "INR"),
        "registration_deadline": deadline,
        "prize_pool": prize_pool,
        "registration_open": reg_open,
        "razorpay_key_id": current_app.config.get("RAZORPAY_KEY_ID"),
        "min_team_members": min_team_members,
        "max_team_members": max_team_members,
        "venue": contact_data.get("venue_short"),
        "venue_name": contact_data.get("venue_name"),
        "venue_address": contact_data.get("venue_address"),
        "venue_city": contact_data.get("venue_city"),
        "contact": contact_data,
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
