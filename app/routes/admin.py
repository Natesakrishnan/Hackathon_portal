from datetime import datetime
from flask import (
    Blueprint,
    render_template,
    request,
    jsonify,
    redirect,
    url_for,
    Response,
    current_app,
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

    return jsonify({
        "success": True,
        "message": "Login successful",
        "redirect_url": "/admin/dashboard",
        "admin": admin.to_dict(),
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
    Validates, saves, and dispatches a new announcement to Discord and/or Email.
    Reports honest status for unconfigured integrations and prevents duplicates.
    """
    data = request.get_json(silent=True) or request.form.to_dict()
    title = (data.get("title") or "").strip()
    message = (data.get("message") or "").strip()
    target_audience = (data.get("target_audience") or "all").strip().lower()
    send_discord = data.get("send_discord", True)
    if isinstance(send_discord, str):
        send_discord = send_discord.lower() in ("true", "1", "yes")

    send_email = data.get("send_email", False)
    if isinstance(send_email, str):
        send_email = send_email.lower() in ("true", "1", "yes")

    success, result_data, status_code = create_and_dispatch_announcement(
        title=title,
        message=message,
        target_audience=target_audience,
        send_discord=send_discord,
        send_email=send_email,
        admin_id=current_user.id if hasattr(current_user, "id") else None,
    )

    return jsonify(result_data), status_code


# ==============================================================================
# FEATURE 3: EVENT CONFIGURATION ENDPOINTS
# ==============================================================================

@admin_bp.route("/api/admin/settings", methods=["GET"])
@login_required
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
def api_get_admin_rules():
    """Fetches current public event rules for the admin editor."""
    content = get_rules_content()
    return jsonify({"success": True, "data": content}), 200


@admin_bp.route("/api/admin/content/rules", methods=["PUT"])
@login_required
def api_update_admin_rules():
    """Updates and publishes public event rules."""
    data = request.get_json() or {}
    success, message = save_rules_content(data)
    status_code = 200 if success else 400
    return jsonify({"success": success, "message": message}), status_code


@admin_bp.route("/api/admin/content/rules/reset", methods=["POST"])
@login_required
def api_reset_admin_rules():
    """Resets public event rules back to default."""
    success, message = reset_rules_to_default()
    return jsonify({"success": success, "message": message, "data": get_rules_content()}), 200


@admin_bp.route("/api/admin/content/schedule", methods=["GET"])
@login_required
def api_get_admin_schedule():
    """Fetches current public event schedule for the admin editor."""
    content = get_schedule_content()
    return jsonify({"success": True, "data": content}), 200


@admin_bp.route("/api/admin/content/schedule", methods=["PUT"])
@login_required
def api_update_admin_schedule():
    """Updates and publishes public event schedule."""
    data = request.get_json() or {}
    success, message = save_schedule_content(data)
    status_code = 200 if success else 400
    return jsonify({"success": success, "message": message}), status_code


@admin_bp.route("/api/admin/content/schedule/reset", methods=["POST"])
@login_required
def api_reset_admin_schedule():
    """Resets public event schedule back to default."""
    success, message = reset_schedule_to_default()
    return jsonify({"success": success, "message": message, "data": get_schedule_content()}), 200


