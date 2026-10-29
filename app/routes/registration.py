from flask import Blueprint, render_template, request, jsonify
from app.services.registration_service import register_participant
from app.services.admin_service import get_single_registration

registration_bp = Blueprint("registration", __name__)


@registration_bp.route("/register")
@registration_bp.route("/register.html")
def register():
    return render_template("register.html")


@registration_bp.route("/api/registrations", methods=["POST"])
def create_registration():
    """
    Creates a new registration (individual or team).
    Accepts application/json payload.
    """
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "error": "Invalid or missing JSON payload in request."}), 400

    success, response_data, status_code = register_participant(payload)
    return jsonify(response_data), status_code


@registration_bp.route("/api/registrations/<ref>", methods=["GET"])
def get_registration_by_ref(ref):
    """
    Returns registration details for payment checkout or confirmation display.
    """
    reg = get_single_registration(ref)
    if not reg:
        return jsonify({"success": False, "error": f"Registration '{ref}' not found."}), 404

    return jsonify({"success": True, "registration": reg}), 200
