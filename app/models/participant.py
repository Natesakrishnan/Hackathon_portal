from datetime import datetime
from app.extensions import db


class Participant(db.Model):
    __tablename__ = "participants"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(20), nullable=False)
    college = db.Column(db.String(200), nullable=False)
    department = db.Column(db.String(120), nullable=False)
    year_of_study = db.Column(db.String(30), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    registrations = db.relationship("Registration", back_populates="participant", lazy="dynamic")
    team_memberships = db.relationship("TeamMember", back_populates="participant", cascade="all, delete-orphan", lazy="dynamic")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "full_name": self.full_name,
            "email": self.email,
            "phone": self.phone,
            "college": self.college,
            "department": self.department,
            "year_of_study": self.year_of_study,
            "created_at": self.created_at.isoformat(),
        }

    def __repr__(self):
        return f"<Participant {self.full_name} ({self.email})>"
