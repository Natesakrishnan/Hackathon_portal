import json
import hmac
import hashlib
from app.models.registration import Registration
from app.models.payment import Payment


def create_sample_registration(client, reg_type="individual", domain="AI & Machine Learning"):
    res = client.post(
        "/api/registrations",
        json={
            "registration_type": reg_type,
            "domain": domain,
            "full_name": "Test Payer",
            "email": "test.payer@example.com",
            "phone": "9876543210",
            "college": "Test College",
            "department": "Tech",
            "year_of_study": "3rd Year",
        },
    )
    return res.get_json()["registration_id"]


def test_create_payment_order_success(client):
    """Test creating a Razorpay payment order for an existing registration."""
    ref_id = create_sample_registration(client)

    res = client.post("/api/payments/create-order", json={"registration_id": ref_id})
    assert res.status_code == 200

    data = res.get_json()
    assert data["success"] is True
    assert data["order_id"].startswith("order_")
    assert data["amount"] == 299
    assert data["amount_paise"] == 29900
    assert data["registration_id"] == ref_id

    # Verify Payment record in database
    payment = Payment.query.filter_by(gateway_order_id=data["order_id"]).first()
    assert payment is not None
    assert payment.status == "created"


def test_create_payment_order_invalid_ref(client):
    """Test order creation fails with 404 for non-existent registration."""
    res = client.post("/api/payments/create-order", json={"registration_id": "SYNEX-NOTFOUND"})
    assert res.status_code == 404
    assert "not found" in res.get_json()["error"]


def test_verify_payment_signature_success(client):
    """Test payment verification updates registration to paid & confirmed."""
    ref_id = create_sample_registration(client)

    # 1. Create order
    order_res = client.post("/api/payments/create-order", json={"registration_id": ref_id})
    order_id = order_res.get_json()["order_id"]

    # 2. Verify payment
    verify_res = client.post(
        "/api/payments/verify",
        json={
            "razorpay_order_id": order_id,
            "razorpay_payment_id": "pay_test_998877",
            "razorpay_signature": "test_signature",
            "registration_id": ref_id,
            "payment_method": "UPI",
        },
    )
    assert verify_res.status_code == 200

    data = verify_res.get_json()
    assert data["success"] is True
    assert "confirmed" in data["message"].lower()

    # Verify registration status in database
    reg = Registration.query.filter_by(public_id=ref_id).first()
    assert reg.payment_status == "paid"
    assert reg.registration_status == "confirmed"

    # Verify payment record
    pay = Payment.query.filter_by(gateway_order_id=order_id).first()
    assert pay.status == "captured"
    assert pay.gateway_payment_id == "pay_test_998877"


def test_verify_payment_idempotency(client):
    """Test that repeating payment verification is idempotent and does not error."""
    ref_id = create_sample_registration(client)

    order_res = client.post("/api/payments/create-order", json={"registration_id": ref_id})
    order_id = order_res.get_json()["order_id"]

    payload = {
        "razorpay_order_id": order_id,
        "razorpay_payment_id": "pay_test_idempotent",
        "razorpay_signature": "test_signature",
        "registration_id": ref_id,
    }

    # First verification
    res1 = client.post("/api/payments/verify", json=payload)
    assert res1.status_code == 200

    # Second identical verification
    res2 = client.post("/api/payments/verify", json=payload)
    assert res2.status_code == 200
    assert res2.get_json()["success"] is True


def test_cannot_create_order_for_already_paid_registration(client):
    """Test that an already paid registration cannot have new orders created."""
    ref_id = create_sample_registration(client)

    # Pay the registration
    order_res = client.post("/api/payments/create-order", json={"registration_id": ref_id})
    order_id = order_res.get_json()["order_id"]
    client.post(
        "/api/payments/verify",
        json={
            "razorpay_order_id": order_id,
            "razorpay_payment_id": "pay_test_already_paid",
            "razorpay_signature": "test_signature",
            "registration_id": ref_id,
        },
    )

    # Try creating order again
    repeat_order_res = client.post("/api/payments/create-order", json={"registration_id": ref_id})
    assert repeat_order_res.status_code == 400
    assert "already been paid" in repeat_order_res.get_json()["error"]
