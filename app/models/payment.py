from datetime import datetime
from app.extensions import db


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    registration_id = db.Column(db.Integer, db.ForeignKey("registrations.id", ondelete="CASCADE"), nullable=False, index=True)
    gateway = db.Column(db.String(50), default="razorpay", nullable=False)
    
    gateway_order_id = db.Column(db.String(100), nullable=True, index=True)
    gateway_payment_id = db.Column(db.String(100), nullable=True, index=True)
    gateway_signature = db.Column(db.String(255), nullable=True)

    amount = db.Column(db.Integer, nullable=False)  # in INR: 299 or 999
    amount_paise = db.Column(db.Integer, nullable=False)  # in Paise: 29900 or 99900
    currency = db.Column(db.String(10), default="INR", nullable=False)

    status = db.Column(db.String(30), default="created", nullable=False)  # created, authorized, captured, failed, refunded
    payment_method = db.Column(db.String(50), nullable=True)  # upi, card, netbanking, wallet

    error_code = db.Column(db.String(100), nullable=True)
    error_description = db.Column(db.Text, nullable=True)
    raw_response = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    captured_at = db.Column(db.DateTime, nullable=True)

    # Relationship
    registration = db.relationship("Registration", back_populates="payments")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "registration_id": self.registration_id,
            "gateway": self.gateway,
            "gateway_order_id": self.gateway_order_id,
            "gateway_payment_id": self.gateway_payment_id,
            "amount": self.amount,
            "amount_paise": self.amount_paise,
            "currency": self.currency,
            "status": self.status,
            "payment_method": self.payment_method,
            "error_code": self.error_code,
            "error_description": self.error_description,
            "created_at": self.created_at.isoformat(),
            "captured_at": self.captured_at.isoformat() if self.captured_at else None,
        }

    def __repr__(self):
        return f"<Payment {self.gateway_order_id} [{self.status}] ₹{self.amount}>"
