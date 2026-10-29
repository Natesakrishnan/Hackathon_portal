from datetime import datetime
from app.extensions import db


class Team(db.Model):
    __tablename__ = "teams"

    id = db.Column(db.Integer, primary_key=True)
    team_name = db.Column(db.String(120), unique=True, nullable=False, index=True)
    leader_id = db.Column(db.Integer, db.ForeignKey("participants.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    leader = db.relationship("Participant", foreign_keys=[leader_id])
    members = db.relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    registration = db.relationship("Registration", back_populates="team", uselist=False)

    def to_dict(self, include_members: bool = True) -> dict:
        data = {
            "id": self.id,
            "team_name": self.team_name,
            "leader_id": self.leader_id,
            "leader_name": self.leader.full_name if self.leader else None,
            "leader_email": self.leader.email if self.leader else None,
            "member_count": len(self.members),
            "created_at": self.created_at.isoformat(),
        }
        if include_members:
            data["members"] = [m.to_dict() for m in self.members]
        return data

    def __repr__(self):
        return f"<Team {self.team_name} (ID {self.id})>"


class TeamMember(db.Model):
    __tablename__ = "team_members"

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    participant_id = db.Column(db.Integer, db.ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True)
    role = db.Column(db.String(32), default="member", nullable=False)  # 'leader' or 'member'
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    team = db.relationship("Team", back_populates="members")
    participant = db.relationship("Participant", back_populates="team_memberships")

    __table_args__ = (
        db.UniqueConstraint("team_id", "participant_id", name="uq_team_participant"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "team_id": self.team_id,
            "participant_id": self.participant_id,
            "role": self.role,
            "name": self.participant.full_name if self.participant else None,
            "email": self.participant.email if self.participant else None,
            "phone": self.participant.phone if self.participant else None,
            "college": self.participant.college if self.participant else None,
            "department": self.participant.department if self.participant else None,
            "year_of_study": self.participant.year_of_study if self.participant else None,
        }

    def __repr__(self):
        return f"<TeamMember Team:{self.team_id} Participant:{self.participant_id} ({self.role})>"
