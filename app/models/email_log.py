from datetime import datetime
from app.extensions import db


class EmailLog(db.Model):
    __tablename__ = "email_logs"

    id = db.Column(db.Integer, primary_key=True)
    recipient = db.Column(db.String(120), nullable=False, index=True)
    subject = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    email_type = db.Column(db.String(50), default="direct", nullable=False)  # "inquiry_reply", "announcement", "direct", "test"
    status = db.Column(db.String(50), default="sent", nullable=False)        # "sent", "simulated", "failed"
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "recipient": self.recipient,
            "subject": self.subject,
            "message": self.message,
            "email_type": self.email_type,
            "status": self.status,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<EmailLog {self.recipient} - {self.subject} ({self.status})>"
