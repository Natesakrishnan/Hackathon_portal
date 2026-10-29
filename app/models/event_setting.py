from datetime import datetime
from app.extensions import db


class EventSetting(db.Model):
    __tablename__ = "event_settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(64), unique=True, nullable=False, index=True)
    value = db.Column(db.Text, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    @classmethod
    def get_val(cls, key: str, default: str = None) -> str:
        record = cls.query.filter_by(key=key).first()
        return record.value if record else default

    @classmethod
    def set_val(cls, key: str, value: str, description: str = None) -> "EventSetting":
        record = cls.query.filter_by(key=key).first()
        if not record:
            record = cls(key=key, value=str(value), description=description)
            db.session.add(record)
        else:
            record.value = str(value)
            if description:
                record.description = description
        db.session.commit()
        return record

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "value": self.value,
            "description": self.description,
            "updated_at": self.updated_at.isoformat(),
        }

    def __repr__(self):
        return f"<EventSetting {self.key}={self.value}>"
