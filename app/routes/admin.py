from datetime import datetime
from functools import wraps
from flask import (
    Blueprint,
    render_template,
    request,
    jsonify,
    redirect,
    url_for,
    Response,
    current_app,
    session,
)
from flask_login import login_user, logout_user, login_required, current_user
from app.extensions import db
from app.models.admin import Admin
from app.models.event_setting import EventSetting
from app.services.admin_service import (
    get_dashboard_metrics,
    get_filtered_registrations,
    get_single_registration,
    update_registration_status,
    export_registrations_csv,
    export_paid_participants_report_csv,
    export_summary_report_csv,
    export_domain_report_csv,
    reset_participant_records,
)
from app.services.announcement_service import (
    create_and_dispatch_announcement,
    get_recent_announcements,
    clear_announcements,
)
from app.models.contact_message import ContactMessage
from app.models.email_log import EmailLog
from app.services.email_service import (
    get_smtp_config,
    save_smtp_config,
    send_email,
    test_smtp_connection,
    get_recent_email_logs,
)
from app.services.content_service import (
    get_rules_content,
    save_rules_content,
    reset_rules_to_default,
    get_schedule_content,
    save_schedule_content,
    reset_schedule_to_default,
)

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/admin")
def admin_root():
    if current_user.is_authenticated:
        return redirect(url_for("admin.dashboard"))
    return redirect(url_for("admin.login"))


@admin_bp.route("/admin/login")
@admin_bp.route("/admin-login.html")
def login():
    if current_user.is_authenticated:
        return redirect(url_for("admin.dashboard"))
    return render_template("admin-login.html")


@admin_bp.route("/admin/dashboard")
@admin_bp.route("/admin-dashboard.html")
@login_required
def dashboard():
    return render_template("admin-dashboard.html")


@admin_bp.route("/admin/logout", methods=["GET", "POST"])
@admin_bp.route("/api/admin/logout", methods=["GET", "POST"])
def logout():
    session.pop("event_settings_unlocked", None)
    session.pop("event_settings_locked", None)
    logout_user()
    if request.is_json or request.path.startswith("/api/"):
        return jsonify({"success": True, "redirect_url": "/admin/login"})
    return redirect(url_for("admin.login"))


@admin_bp.route("/api/admin/login", methods=["POST"])
def api_admin_login():
    """
    Authenticates admin credentials and creates session.
    """
    data = request.get_json(silent=True) or request.form.to_dict()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"success": False, "error": "Username and password are required."}), 400

    admin = Admin.query.filter(
        (Admin.username == username) | (Admin.email == username)
    ).first()

    if not admin or not admin.check_password(password):
        return jsonify({"success": False, "error": "Invalid username or password."}), 401

    if not admin.is_active:
        return jsonify({"success": False, "error": "This administrator account is disabled."}), 403

    admin.last_login_at = datetime.utcnow()
    db.session.commit()
    login_user(admin, remember=True)

    # Manage confidential event settings unlock state upon login
    session.pop("event_settings_locked", None)
    if admin.username == "krish@01" or getattr(admin, "role", "") == "settings_admin":
        session["event_settings_unlocked"] = True
    else:
        session.pop("event_settings_unlocked", None)

    return jsonify({
        "success": True,
        "message": "Login successful",
        "redirect_url": "/admin/dashboard",
        "admin": admin.to_dict(),
        "event_settings_unlocked": session.get("event_settings_unlocked", False),
    }), 200


def is_settings_unlocked():
    """Checks whether the event settings vault is currently unlocked for this session."""
    if not current_user.is_authenticated:
        return False
    if session.get("event_settings_locked") is True:
        return False
    if session.get("event_settings_unlocked") is True:
        return True
    if current_user.username == "krish@01" or getattr(current_user, "role", "") == "settings_admin":
        return True
    return False


def settings_auth_required(f):
    """Decorator guarding confidential event settings routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"success": False, "error": "Authentication required."}), 401
        if not is_settings_unlocked():
            return jsonify({
                "success": False,
                "error": "Event settings are confidential. Please authenticate with the event settings administrator credentials to unlock.",
                "settings_locked": True,
            }), 403
        return f(*args, **kwargs)
    return decorated_function


@admin_bp.route("/api/admin/settings/status", methods=["GET"])
@login_required
def api_settings_status():
    """Returns current unlock status of confidential event settings."""
    unlocked = is_settings_unlocked()
    return jsonify({
        "success": True,
        "is_unlocked": unlocked,
        "settings_admin_user": "krish@01",
        "current_user": current_user.username,
    }), 200


@admin_bp.route("/api/admin/settings/unlock", methods=["POST"])
@login_required
def api_settings_unlock():
    """
    Verifies confidential event settings credentials (krish@01 / @asdfg123)
    and unlocks settings access for the active session.
    """
    data = request.get_json(silent=True) or request.form.to_dict()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"success": False, "error": "Confidential username and password are required."}), 400

    admin = Admin.query.filter(
        (Admin.username == username) | (Admin.email == username)
    ).first()

    if not admin or not admin.check_password(password):
        return jsonify({"success": False, "error": "Invalid confidential credentials for event settings."}), 401

    if admin.username != "krish@01" and getattr(admin, "role", "") != "settings_admin":
        return jsonify({"success": False, "error": "This account does not have confidential event settings privileges."}), 403

    session.pop("event_settings_locked", None)
    session["event_settings_unlocked"] = True

    return jsonify({
        "success": True,
        "message": "Event settings vault successfully unlocked.",
        "is_unlocked": True,
    }), 200


@admin_bp.route("/api/admin/settings/lock", methods=["POST"])
@login_required
def api_settings_lock():
    """Locks confidential event settings for the active session."""
    session.pop("event_settings_unlocked", None)
    session["event_settings_locked"] = True

    return jsonify({
        "success": True,
        "message": "Event settings locked. Confidential access protected.",
        "is_unlocked": False,
    }), 200


@admin_bp.route("/api/admin/me", methods=["GET"])
def api_admin_me():
    """Returns currently logged in administrator details."""
    if not current_user.is_authenticated:
        return jsonify({"authenticated": False}), 401
    return jsonify({
        "authenticated": True,
        "admin": current_user.to_dict(),
    }), 200


@admin_bp.route("/api/admin/dashboard", methods=["GET"])
@login_required
def api_dashboard_data():
    """Returns aggregated metrics, charts data, and recent registrations."""
    metrics = get_dashboard_metrics()
    return jsonify({"success": True, "data": metrics}), 200


@admin_bp.route("/api/admin/registrations", methods=["GET"])
@login_required
def api_list_registrations():
    """
    Returns filtered, searched, and paginated registrations.
    Query parameters: search, domain, status, reg_type, page, per_page.
    """
    search = request.args.get("search", "").strip()
    domain = request.args.get("domain", "all").strip()
    status = request.args.get("status", "all").strip()
    reg_type = request.args.get("reg_type", "all").strip()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 25, type=int)

    data = get_filtered_registrations(
        search=search,
        domain=domain,
        status=status,
        reg_type=reg_type,
        page=page,
        per_page=per_page,
    )
    return jsonify({"success": True, "data": data}), 200


@admin_bp.route("/api/admin/registrations/<ref_or_id>", methods=["GET"])
@login_required
def api_registration_detail(ref_or_id):
    """Returns full details of a single registration including team members."""
    details = get_single_registration(ref_or_id)
    if not details:
        return jsonify({"success": False, "error": "Registration not found"}), 404
    return jsonify({"success": True, "registration": details}), 200


@admin_bp.route("/api/admin/registrations/<int:id>/status", methods=["PATCH", "POST"])
@login_required
def api_update_status(id):
    """Updates the registration status."""
    data = request.get_json(silent=True) or {}
    new_status = data.get("status", "").strip().lower()

    success, message = update_registration_status(id, new_status)
    status_code = 200 if success else 400
    return jsonify({"success": success, "message": message}), status_code


@admin_bp.route("/api/admin/reports/registrations.csv", methods=["GET"])
@login_required
def api_download_csv_report():
    """Streams CSV file with all registration and team data safely sanitized."""
    csv_content = export_registrations_csv()
    filename = f"synex_registrations_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return Response(
        csv_content,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache",
        },
    )


@admin_bp.route("/api/admin/reports/summary.csv", methods=["GET"])
@login_required
def api_download_summary_report():
    """Generates and streams Executive Summary & Financial Audit CSV report."""
    csv_content = export_summary_report_csv()
    filename = f"synex_executive_summary_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        csv_content,
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache",
        },
    )


@admin_bp.route("/api/admin/reports/domains.csv", methods=["GET"])
@login_required
def api_download_domain_report():
    """Generates and streams Domain & Innovation Track Distribution CSV report."""
    csv_content = export_domain_report_csv()
    filename = f"synex_domain_breakdown_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        csv_content,
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache",
        },
    )


@admin_bp.route("/api/admin/reports/paid-participants.csv", methods=["GET"])
@login_required
def api_download_paid_participants_report():
    """Generates and streams Paid Participants & Fee Audit CSV report."""
    csv_content = export_paid_participants_report_csv()
    filename = f"synex_paid_participants_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        csv_content,
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache",
        },
    )


# ==============================================================================
# FEATURE 1: ANNOUNCEMENT ENGINE ENDPOINTS
# ==============================================================================

@admin_bp.route("/api/admin/announcements", methods=["GET"])
@login_required
def api_list_announcements():
    """Returns recent announcements with their delivery statuses."""
    announcements = get_recent_announcements()
    return jsonify({"success": True, "announcements": announcements}), 200


@admin_bp.route("/api/admin/announcements", methods=["POST"])
@login_required
def api_create_announcement():
    """
    Validates, saves, and dispatches a new announcement to the portal and optional Email.
    Reports honest status for unconfigured integrations and prevents duplicates.
    """
    data = request.get_json(silent=True) or request.form.to_dict()
    title = (data.get("title") or "").strip()
    message = (data.get("message") or "").strip()
    target_audience = (data.get("target_audience") or "all").strip().lower()

    send_email = data.get("send_email", False)
    if isinstance(send_email, str):
        send_email = send_email.lower() in ("true", "1", "yes")

    success, result_data, status_code = create_and_dispatch_announcement(
        title=title,
        message=message,
        target_audience=target_audience,
        send_email=send_email,
        admin_id=current_user.id if hasattr(current_user, "id") else None,
    )

    return jsonify(result_data), status_code


@admin_bp.route("/api/admin/announcements", methods=["DELETE"])
@login_required
def api_clear_announcements():
    """Deletes all announcement records from the history log."""
    deleted_count = clear_announcements()
    return jsonify({
        "success": True,
        "message": f"Successfully cleared {deleted_count} announcement message(s).",
        "cleared_count": deleted_count,
    }), 200


# ==============================================================================
# FEATURE 3: EVENT CONFIGURATION ENDPOINTS
# ==============================================================================

@admin_bp.route("/api/admin/settings", methods=["GET"])
@login_required
@settings_auth_required
def api_get_settings():
    """Returns current persistent event configuration from database."""
    return jsonify({
        "success": True,
        "settings": {
            "event_name": EventSetting.get_val("EVENT_NAME", current_app.config.get("EVENT_NAME", "SYNEX 2026")),
            "individual_fee": int(EventSetting.get_val("EVENT_INDIVIDUAL_FEE", current_app.config.get("EVENT_INDIVIDUAL_FEE", 299))),
            "team_fee": int(EventSetting.get_val("EVENT_TEAM_FEE", current_app.config.get("EVENT_TEAM_FEE", 999))),
            "registration_deadline": EventSetting.get_val("REGISTRATION_DEADLINE", "2026-11-30T23:59"),
            "prize_pool": EventSetting.get_val("TOTAL_PRIZE_POOL", "₹2,50,000"),
            "registration_open": EventSetting.get_val("REGISTRATION_OPEN", "true").lower() in ("true", "1", "yes"),
        }
    }), 200


@admin_bp.route("/api/admin/settings", methods=["PUT", "PATCH"])
@login_required
@settings_auth_required
def api_update_settings():
    """
    Validates and persists updated event configuration.
    Invalid inputs are rejected and cannot overwrite existing settings.
    """
    data = request.get_json(silent=True) or request.form.to_dict()
    if not data:
        return jsonify({"success": False, "error": "No configuration data provided."}), 400

    # 1. Validate Event Name
    event_name = data.get("event_name")
    if event_name is not None:
        event_name = str(event_name).strip()
        if len(event_name) < 2 or len(event_name) > 100:
            return jsonify({"success": False, "error": "Event name must be between 2 and 100 characters."}), 400

    # 2. Validate Individual Fee
    indiv_fee = data.get("individual_fee")
    if indiv_fee is not None:
        try:
            indiv_fee = int(indiv_fee)
            if indiv_fee < 0 or indiv_fee > 500000:
                return jsonify({"success": False, "error": "Individual fee must be between 0 and 500,000 INR."}), 400
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "Individual fee must be a valid integer."}), 400

    # 3. Validate Team Fee
    team_fee = data.get("team_fee")
    if team_fee is not None:
        try:
            team_fee = int(team_fee)
            if team_fee < 0 or team_fee > 500000:
                return jsonify({"success": False, "error": "Team fee must be between 0 and 500,000 INR."}), 400
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "Team fee must be a valid integer."}), 400

    # 4. Validate Registration Deadline
    deadline = data.get("registration_deadline")
    if deadline is not None:
        deadline_str = str(deadline).strip()
        if not deadline_str:
            return jsonify({"success": False, "error": "Registration deadline cannot be empty."}), 400
        clean_deadline = deadline_str.replace("Z", "")
        valid_date = False
        for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                datetime.strptime(clean_deadline, fmt)
                valid_date = True
                break
            except ValueError:
                continue
        if not valid_date:
            return jsonify({"success": False, "error": "Registration deadline must be a valid date/time format (e.g. YYYY-MM-DDTHH:MM)."}), 400

    # 5. Validate Prize Pool
    prize_pool = data.get("prize_pool")
    if prize_pool is not None:
        prize_pool = str(prize_pool).strip()
        if not prize_pool or len(prize_pool) > 50:
            return jsonify({"success": False, "error": "Prize pool must be between 1 and 50 characters (e.g. ₹2,50,000)."}), 400

    # 6. Validate Registration Open status
    reg_open = data.get("registration_open")
    if reg_open is not None:
        if isinstance(reg_open, bool):
            reg_open_str = "true" if reg_open else "false"
        else:
            reg_open_str = "true" if str(reg_open).strip().lower() in ("true", "1", "yes") else "false"

    # All validations passed: Commit persistent settings
    if event_name is not None:
        EventSetting.set_val("EVENT_NAME", event_name, "Official Hackathon Event Name")
    if indiv_fee is not None:
        EventSetting.set_val("EVENT_INDIVIDUAL_FEE", str(indiv_fee), "Individual Entry Fee in INR")
    if team_fee is not None:
        EventSetting.set_val("EVENT_TEAM_FEE", str(team_fee), "Team Entry Fee in INR")
    if deadline is not None:
        EventSetting.set_val("REGISTRATION_DEADLINE", str(deadline).strip(), "Registration Deadline ISO timestamp")
    if prize_pool is not None:
        EventSetting.set_val("TOTAL_PRIZE_POOL", prize_pool, "Total Prize Pool amount")
    if reg_open is not None:
        EventSetting.set_val("REGISTRATION_OPEN", reg_open_str, "Registration Open Status")

    return jsonify({
        "success": True,
        "message": "Event settings updated and saved successfully.",
        "settings": {
            "event_name": EventSetting.get_val("EVENT_NAME", current_app.config.get("EVENT_NAME", "SYNEX 2026")),
            "individual_fee": int(EventSetting.get_val("EVENT_INDIVIDUAL_FEE", current_app.config.get("EVENT_INDIVIDUAL_FEE", 299))),
            "team_fee": int(EventSetting.get_val("EVENT_TEAM_FEE", current_app.config.get("EVENT_TEAM_FEE", 999))),
            "registration_deadline": EventSetting.get_val("REGISTRATION_DEADLINE", "2026-11-30T23:59"),
            "prize_pool": EventSetting.get_val("TOTAL_PRIZE_POOL", "₹2,50,000"),
            "registration_open": EventSetting.get_val("REGISTRATION_OPEN", "true").lower() in ("true", "1", "yes"),
        }
    }), 200


@admin_bp.route("/api/admin/reset-participants", methods=["POST"])
@login_required
@settings_auth_required
def api_reset_participants():
    """
    Permanently deletes all participant registrations, teams, members, and payment records.
    Requires administrator authentication.
    """
    result = reset_participant_records()
    status_code = 200 if result.get("success") else 500
    return jsonify(result), status_code


# ==============================================================================
# FEATURE 4: PUBLIC SITE CONTENT (RULES & SCHEDULE) EDITING
# ==============================================================================

@admin_bp.route("/api/admin/content/rules", methods=["GET"])
@login_required
@settings_auth_required
def api_get_admin_rules():
    """Fetches current public event rules for the admin editor."""
    content = get_rules_content()
    return jsonify({"success": True, "data": content}), 200


@admin_bp.route("/api/admin/content/rules", methods=["PUT"])
@login_required
@settings_auth_required
def api_update_admin_rules():
    """Updates and publishes public event rules."""
    data = request.get_json() or {}
    success, message = save_rules_content(data)
    status_code = 200 if success else 400
    return jsonify({"success": success, "message": message}), status_code


@admin_bp.route("/api/admin/content/rules/reset", methods=["POST"])
@login_required
@settings_auth_required
def api_reset_admin_rules():
    """Resets public event rules back to default."""
    success, message = reset_rules_to_default()
    return jsonify({"success": success, "message": message, "data": get_rules_content()}), 200


@admin_bp.route("/api/admin/content/schedule", methods=["GET"])
@login_required
@settings_auth_required
def api_get_admin_schedule():
    """Fetches current public event schedule for the admin editor."""
    content = get_schedule_content()
    return jsonify({"success": True, "data": content}), 200


@admin_bp.route("/api/admin/content/schedule", methods=["PUT"])
@login_required
@settings_auth_required
def api_update_admin_schedule():
    """Updates and publishes public event schedule."""
    data = request.get_json() or {}
    success, message = save_schedule_content(data)
    status_code = 200 if success else 400
    return jsonify({"success": success, "message": message}), status_code


@admin_bp.route("/api/admin/content/schedule/reset", methods=["POST"])
@login_required
@settings_auth_required
def api_reset_admin_schedule():
    """Resets public event schedule back to default."""
    success, message = reset_schedule_to_default()
    return jsonify({"success": success, "message": message, "data": get_schedule_content()}), 200


# ==============================================================================
# FEATURE 5: INQUIRIES & EMAIL COMMUNICATION
# ==============================================================================

@admin_bp.route("/api/admin/inquiries", methods=["GET"])
@login_required
def api_list_inquiries():
    """
    Returns filtered, searched, and paginated contact/inquiry messages.
    Query params: search, status (all, unread, read, replied), page, per_page.
    """
    search = request.args.get("search", "").strip()
    status = request.args.get("status", "all").strip().lower()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)

    query = ContactMessage.query

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (ContactMessage.name.ilike(search_term))
            | (ContactMessage.email.ilike(search_term))
            | (ContactMessage.subject.ilike(search_term))
            | (ContactMessage.message.ilike(search_term))
        )

    if status == "unread":
        query = query.filter(ContactMessage.is_read.is_(False))
    elif status == "read":
        query = query.filter(ContactMessage.is_read.is_(True), ContactMessage.replied_at.is_(None))
    elif status == "replied":
        query = query.filter(ContactMessage.replied_at.isnot(None))

    total = query.count()
    unread_count = ContactMessage.query.filter(ContactMessage.is_read.is_(False)).count()
    replied_count = ContactMessage.query.filter(ContactMessage.replied_at.isnot(None)).count()
    total_count = ContactMessage.query.count()

    items = query.order_by(ContactMessage.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    ).items

    return jsonify({
        "success": True,
        "inquiries": [item.to_dict() for item in items],
        "total": total,
        "unread_count": unread_count,
        "replied_count": replied_count,
        "total_count": total_count,
        "page": page,
        "per_page": per_page,
    }), 200


@admin_bp.route("/api/admin/inquiries/<int:id>", methods=["GET"])
@login_required
def api_get_inquiry(id):
    """Returns single inquiry message and automatically marks it as read."""
    inquiry = ContactMessage.query.get(id)
    if not inquiry:
        return jsonify({"success": False, "error": "Inquiry message not found."}), 404

    if not inquiry.is_read:
        inquiry.is_read = True
        db.session.commit()

    unread_count = ContactMessage.query.filter(ContactMessage.is_read.is_(False)).count()

    return jsonify({
        "success": True,
        "inquiry": inquiry.to_dict(),
        "unread_count": unread_count,
    }), 200


@admin_bp.route("/api/admin/inquiries/<int:id>/status", methods=["PATCH", "POST"])
@login_required
def api_toggle_inquiry_status(id):
    """Toggles or sets the is_read status of an inquiry."""
    inquiry = ContactMessage.query.get(id)
    if not inquiry:
        return jsonify({"success": False, "error": "Inquiry message not found."}), 404

    data = request.get_json(silent=True) or {}
    if "is_read" in data:
        inquiry.is_read = bool(data["is_read"])
    else:
        inquiry.is_read = not inquiry.is_read

    db.session.commit()
    unread_count = ContactMessage.query.filter(ContactMessage.is_read.is_(False)).count()

    return jsonify({
        "success": True,
        "message": f"Inquiry marked as {'read' if inquiry.is_read else 'unread'}.",
        "inquiry": inquiry.to_dict(),
        "unread_count": unread_count,
    }), 200


@admin_bp.route("/api/admin/inquiries/<int:id>", methods=["DELETE"])
@login_required
def api_delete_inquiry(id):
    """Deletes an inquiry message."""
    inquiry = ContactMessage.query.get(id)
    if not inquiry:
        return jsonify({"success": False, "error": "Inquiry message not found."}), 404

    db.session.delete(inquiry)
    db.session.commit()
    unread_count = ContactMessage.query.filter(ContactMessage.is_read.is_(False)).count()

    return jsonify({
        "success": True,
        "message": "Inquiry deleted successfully.",
        "unread_count": unread_count,
    }), 200


@admin_bp.route("/api/admin/inquiries/<int:id>/reply", methods=["POST"])
@login_required
def api_reply_inquiry(id):
    """Sends an email reply to an inquiry and updates inquiry status."""
    inquiry = ContactMessage.query.get(id)
    if not inquiry:
        return jsonify({"success": False, "error": "Inquiry message not found."}), 404

    data = request.get_json(silent=True) or request.form.to_dict()
    reply_message = (data.get("message") or data.get("reply_message") or "").strip()
    subject = (data.get("subject") or f"Re: {inquiry.subject}").strip()

    if not reply_message:
        return jsonify({"success": False, "error": "Reply message body cannot be empty."}), 400

    # Build rich email body
    event_name = current_app.config.get("EVENT_NAME", "SYNEX 2026")
    body_text = f"""Hi {inquiry.name},

{reply_message}

--------------------------------------------------
Original Inquiry:
From: {inquiry.name} <{inquiry.email}>
Subject: {inquiry.subject}
Date: {inquiry.created_at.strftime('%Y-%m-%d %H:%M UTC') if inquiry.created_at else ''}

{inquiry.message}
--------------------------------------------------

Warm regards,
{event_name} Organizing Committee
"""

    success, msg_info, email_log = send_email(
        to_email=inquiry.email,
        subject=subject,
        body_text=body_text,
        email_type="inquiry_reply",
    )

    # Update inquiry record
    inquiry.reply_message = reply_message
    inquiry.replied_at = datetime.utcnow()
    inquiry.is_read = True
    db.session.commit()

    unread_count = ContactMessage.query.filter(ContactMessage.is_read.is_(False)).count()
    is_simulated = (email_log.status == "simulated") if email_log else True
    is_live_delivered = (email_log.status == "sent") if email_log else False

    return jsonify({
        "success": True,
        "is_simulated": is_simulated,
        "is_live_delivered": is_live_delivered,
        "delivery_status": email_log.status if email_log else "unknown",
        "message": msg_info,
        "inquiry": inquiry.to_dict(),
        "unread_count": unread_count,
        "email_log": email_log.to_dict() if email_log else None,
    }), 200


@admin_bp.route("/api/admin/send-email", methods=["POST"])
@login_required
def api_admin_send_email():
    """Composes and dispatches a direct email to any recipient from the admin console."""
    data = request.get_json(silent=True) or request.form.to_dict()
    to_email = (data.get("to_email") or data.get("recipient") or "").strip()
    subject = (data.get("subject") or "").strip()
    message = (data.get("message") or "").strip()

    if not to_email or "@" not in to_email:
        return jsonify({"success": False, "error": "A valid recipient email address is required."}), 400
    if not subject:
        return jsonify({"success": False, "error": "Subject cannot be empty."}), 400
    if not message:
        return jsonify({"success": False, "error": "Email message cannot be empty."}), 400

    success, msg_info, email_log = send_email(
        to_email=to_email,
        subject=subject,
        body_text=message,
        email_type="direct",
    )

    is_simulated = (email_log.status == "simulated") if email_log else True
    is_live_delivered = (email_log.status == "sent") if email_log else False

    status_code = 200 if (success or is_simulated) else 400
    return jsonify({
        "success": success or is_simulated,
        "is_simulated": is_simulated,
        "is_live_delivered": is_live_delivered,
        "delivery_status": email_log.status if email_log else "unknown",
        "message": msg_info,
        "email_log": email_log.to_dict() if email_log else None,
    }), status_code


@admin_bp.route("/api/admin/email/settings", methods=["GET"])
@login_required
@settings_auth_required
def api_get_smtp_settings():
    """Returns current email delivery configuration with sensitive credentials masked."""
    cfg = get_smtp_config()
    safe_cfg = {
        "provider": cfg.get("provider", "smtp"),
        "has_resend_key": cfg.get("has_resend_key", False),
        "resend_key_masked": ("re_" + "•" * 12) if cfg.get("resend_key") else "",
        "host": cfg["host"],
        "port": cfg["port"],
        "username": cfg["username"],
        "password_masked": "••••••••" if cfg["password"] else "",
        "has_password": cfg.get("has_password", bool(cfg["password"])),
        "use_tls": cfg["use_tls"],
        "use_ssl": cfg["use_ssl"],
        "default_sender": cfg["default_sender"],
        "is_configured": cfg["is_configured"],
        "status_description": cfg.get("status_description", "Simulation Outbox Mode"),
    }
    return jsonify({"success": True, "settings": safe_cfg}), 200


@admin_bp.route("/api/admin/email/settings", methods=["PUT", "POST"])
@login_required
@settings_auth_required
def api_update_smtp_settings():
    """Updates and saves SMTP email settings into EventSetting."""
    data = request.get_json(silent=True) or request.form.to_dict()
    success, message = save_smtp_config(data)
    return jsonify({"success": success, "message": message}), 200


@admin_bp.route("/api/admin/email/test", methods=["POST"])
@login_required
@settings_auth_required
def api_test_smtp_settings():
    """Tests SMTP connection and authentication."""
    data = request.get_json(silent=True) or {}
    test_recipient = data.get("test_recipient") or current_user.email
    success, message = test_smtp_connection(test_recipient)
    status_code = 200 if success else 400
    return jsonify({"success": success, "message": message}), status_code


@admin_bp.route("/api/admin/email/logs", methods=["GET"])
@login_required
def api_get_email_logs():
    """Returns recent outbound email logs (outbox activity)."""
    limit = request.args.get("limit", 50, type=int)
    logs = get_recent_email_logs(limit=limit)
    return jsonify({"success": True, "logs": logs}), 200



