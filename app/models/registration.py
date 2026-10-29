from datetime import datetime
from app.extensions import db


class Registration(db.Model):
    __tablename__ = "registrations"

    id = db.Column(db.Integer, primary_key=True)
    public_id = db.Column(db.String(32), unique=True, nullable=False, index=True)
    registration_type = db.Column(db.String(20), nullable=False)  # 'individual' or 'team'
    
    # Primary participant (for individual, or team leader)
    participant_id = db.Column(db.Integer, db.ForeignKey("participants.id"), nullable=False)
    
    # Optional team reference for team registrations
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=True)

    domain = db.Column(db.String(100), nullable=False)
    entry_fee = db.Column(db.Integer, nullable=False)  # in INR: 299 or 999
    currency = db.Column(db.String(10), default="INR", nullable=False)

    registration_status = db.Column(db.String(30), default="pending", nullable=False)  # pending, confirmed, cancelled, rejected
    payment_status = db.Column(db.String(30), default="unpaid", nullable=False)  # unpaid, paid, refunded, failed

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    participant = db.relationship("Participant", back_populates="registrations")
    team = db.relationship("Team", back_populates="registration")
    payments = db.relationship("Payment", back_populates="registration", cascade="all, delete-orphan", lazy="dynamic")

    def to_dict(self, include_team_details: bool = True) -> dict:
        data = {
            "id": self.id,
            "public_id": self.public_id,
            "registration_type": self.registration_type,
            "domain": self.domain,
            "entry_fee": self.entry_fee,
            "currency": self.currency,
            "registration_status": self.registration_status,
            "payment_status": self.payment_status,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "participant": self.participant.to_dict() if self.participant else None,
            "team_id": self.team_id,
            "team_name": self.team.team_name if self.team else None,
        }

        if self.registration_type == "team" and self.team and include_team_details:
            data["team"] = self.team.to_dict(include_members=True)
        else:
            data["team"] = None

        # Include latest payment if available
        latest_payment = self.payments.order_by(db.desc(db.text("id"))).first()
        if latest_payment:
            data["latest_payment"] = {
                "id": latest_payment.id,
                "order_id": latest_payment.gateway_order_id,
                "payment_id": latest_payment.gateway_payment_id,
                "status": latest_payment.status,
                "amount": latest_payment.amount,
                "captured_at": latest_payment.captured_at.isoformat() if latest_payment.captured_at else None,
            }
        else:
            data["latest_payment"] = None

        return data

    def __repr__(self):
        return f"<Registration {self.public_id} [{self.registration_type} | {self.payment_status}]>"
