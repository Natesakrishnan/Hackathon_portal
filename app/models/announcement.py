from datetime import datetime
from app.extensions import db


class Announcement(db.Model):
    __tablename__ = "announcements"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    message = db.Column(db.Text, nullable=False)
    target_audience = db.Column(db.String(50), nullable=False, default="all")
    discord_sent = db.Column(db.Boolean, default=False, nullable=False)
    email_sent = db.Column(db.Boolean, default=False, nullable=False)
    delivery_status = db.Column(db.String(255), nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("admins.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    creator = db.relationship("Admin", backref=db.backref("announcements", lazy=True))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "target_audience": self.target_audience,
            "discord_sent": self.discord_sent,
            "email_sent": self.email_sent,
            "delivery_status": self.delivery_status or "Created",
            "created_by": self.creator.username if self.creator else "Admin",
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }

    def __repr__(self):
        return f"<Announcement {self.id}: {self.title}>"
