from flask import Blueprint, render_template, request, jsonify
from app.extensions import csrf
from app.services.payment_service import (
    create_payment_order,
    verify_payment_signature,
    process_webhook,
)
from app.services.admin_service import get_single_registration

payment_bp = Blueprint("payment", __name__)


@payment_bp.route("/payment")
@payment_bp.route("/payment.html")
def payment():
    return render_template("payment.html")


@payment_bp.route("/confirmation")
@payment_bp.route("/confirmation.html")
def confirmation():
    return render_template("confirmation.html")


@payment_bp.route("/api/payments/create-order", methods=["POST"])
def api_create_order():
    """
    Creates Razorpay payment order for the given registration reference.
    """
    data = request.get_json(silent=True) or {}
    public_id = data.get("registration_id") or data.get("registration_ref")

    if not public_id:
        return jsonify({"success": False, "error": "Missing registration_id in request body."}), 400

    success, result, status_code = create_payment_order(public_id)
    return jsonify(result), status_code


@payment_bp.route("/api/payments/verify", methods=["POST"])
def api_verify_payment():
    """
    Verifies Razorpay payment signature after frontend checkout completion.
    """
    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"success": False, "error": "Invalid request body."}), 400

    success, result, status_code = verify_payment_signature(data)
    return jsonify(result), status_code


@payment_bp.route("/api/payments/webhook", methods=["POST"])
@csrf.exempt
def api_razorpay_webhook():
    """
    Razorpay Webhook endpoint for server-to-server notifications.
    CSRF is exempt because webhook is called by Razorpay servers.
    """
    signature = request.headers.get("X-Razorpay-Signature", "")
    raw_body = request.get_data()

    success, message, status_code = process_webhook(raw_body, signature)
    return jsonify({"success": success, "message": message}), status_code


@payment_bp.route("/api/payments/status/<ref>", methods=["GET"])
def api_payment_status(ref):
    """
    Retrieves the current status of payment and registration.
    """
    reg = get_single_registration(ref)
    if not reg:
        return jsonify({"success": False, "error": f"Registration '{ref}' not found."}), 404

    return jsonify({
        "success": True,
        "registration_id": reg["public_id"],
        "payment_status": reg["payment_status"],
        "registration_status": reg["registration_status"],
        "latest_payment": reg.get("latest_payment"),
    }), 200
