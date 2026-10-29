import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
import requests
from flask import current_app
from app.extensions import db
from app.models.announcement import Announcement
from app.models.participant import Participant
from app.models.registration import Registration

logger = logging.getLogger(__name__)


def create_and_dispatch_announcement(
    title: str,
    message: str,
    target_audience: str = "all",
    send_discord: bool = True,
    send_email: bool = False,
    admin_id: Optional[int] = None,
) -> Tuple[bool, Dict[str, Any], int]:
    """
    Validates, persists, and dispatches hackathon announcements to configured channels.
    Reports honest status for both configured and unconfigured integrations.
    Avoids duplicate deliveries if retried within 60 seconds.
    """
    title = (title or "").strip()
    message = (message or "").strip()
    target_audience = (target_audience or "all").strip().lower()

    # 1. Validation
    if not title:
        return False, {"success": False, "error": "Announcement title is required."}, 400
    if len(title) < 3 or len(title) > 150:
        return False, {"success": False, "error": "Title must be between 3 and 150 characters."}, 400

    if not message:
        return False, {"success": False, "error": "Announcement message is required."}, 400
    if len(message) < 5 or len(message) > 5000:
        return False, {"success": False, "error": "Message must be between 5 and 5000 characters."}, 400

    valid_audiences = ["all", "paid", "teams", "announcements"]
    if target_audience not in valid_audiences:
        target_audience = "all"

    # 2. Duplicate Delivery Prevention (Idempotency check within last 60 seconds)
    recent_cutoff = datetime.utcnow() - timedelta(seconds=60)
    existing_duplicate = Announcement.query.filter(
        Announcement.title == title,
        Announcement.message == message,
        Announcement.created_at >= recent_cutoff,
    ).first()

    if existing_duplicate:
        logger.warning(f"Duplicate announcement blocked: '{title}' submitted recently.")
        return False, {
            "success": False,
            "error": "A duplicate announcement with identical title and message was submitted recently. Please wait before retrying.",
            "duplicate": True,
            "announcement": existing_duplicate.to_dict(),
        }, 409

    # 3. Store record in database
    announcement = Announcement(
        title=title,
        message=message,
        target_audience=target_audience,
        created_by_id=admin_id,
        discord_sent=False,
        email_sent=False,
        delivery_status="Processing",
    )
    db.session.add(announcement)
    db.session.commit()

    discord_status = "Discord: Not requested"
    email_status = "Email: Not requested"

    # 4. Discord Webhook Delivery
    if send_discord:
        webhook_url = current_app.config.get("DISCORD_WEBHOOK_URL")
        if not webhook_url or not webhook_url.strip():
            discord_status = "Discord: Webhook not configured (DISCORD_WEBHOOK_URL is not set)"
            announcement.discord_sent = False
        else:
            try:
                payload = {
                    "content": f"📢 **[SYNEX 2026 Announcement]** {title}",
                    "embeds": [
                        {
                            "title": title,
                            "description": message,
                            "color": 0x2563EB,  # SYNEX Primary Blue
                            "fields": [
                                {"name": "Target Audience", "value": target_audience.capitalize(), "inline": True},
                                {"name": "Sender", "value": "SYNEX Admin Console", "inline": True},
                            ],
                            "footer": {"text": "SYNEX 2026 Hackathon Announcement Engine"},
                            "timestamp": datetime.utcnow().isoformat(),
                        }
                    ],
                }
                resp = requests.post(
                    webhook_url.strip(),
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=5,
                )
                if resp.status_code in (200, 204):
                    announcement.discord_sent = True
                    discord_status = "Discord: Delivered successfully"
                    logger.info(f"Announcement {announcement.id} sent to Discord webhook.")
                else:
                    announcement.discord_sent = False
                    discord_status = f"Discord: Delivery failed (HTTP {resp.status_code})"
                    logger.error(f"Discord webhook failed with status {resp.status_code}: {resp.text}")
            except Exception as e:
                announcement.discord_sent = False
                discord_status = f"Discord: Delivery error ({str(e)})"
                logger.error(f"Discord webhook exception: {e}")

    # 5. Email Delivery
    if send_email:
        mail_user = current_app.config.get("MAIL_USERNAME")
        mail_pass = current_app.config.get("MAIL_PASSWORD")
        if not mail_user or not mail_pass:
            email_status = "Email: SMTP provider not configured (MAIL_USERNAME / MAIL_PASSWORD not set)"
            announcement.email_sent = False
        else:
            # SMTP configured: send email announcement
            try:
                import smtplib
                from email.mime.text import MIMEText
                from email.mime.multipart import MIMEMultipart

                mail_server = current_app.config.get("MAIL_SERVER", "smtp.gmail.com")
                mail_port = int(current_app.config.get("MAIL_PORT", 587))
                use_tls = current_app.config.get("MAIL_USE_TLS", True)
                sender = current_app.config.get("MAIL_DEFAULT_SENDER", mail_user)

                # Gather recipient emails based on audience
                if target_audience == "paid":
                    recipients = [
                        p.email
                        for p in Participant.query.join(Registration).filter(
                            Registration.payment_status == "paid"
                        ).all()
                        if p.email
                    ]
                else:
                    recipients = [p.email for p in Participant.query.all() if p.email]

                # Deduplicate recipient list
                unique_recipients = list(set(recipients))

                if not unique_recipients:
                    email_status = "Email: No eligible participant email addresses found."
                    announcement.email_sent = False
                else:
                    # Send email
                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = f"[SYNEX 2026] {title}"
                    msg["From"] = sender
                    msg["Bcc"] = ", ".join(unique_recipients[:50])  # Batch limit
                    msg.attach(MIMEText(message, "plain"))

                    with smtplib.SMTP(mail_server, mail_port, timeout=10) as server:
                        if use_tls:
                            server.starttls()
                        server.login(mail_user, mail_pass)
                        server.sendmail(sender, unique_recipients[:50], msg.as_string())

                    announcement.email_sent = True
                    email_status = f"Email: Delivered to {len(unique_recipients[:50])} recipients"
            except Exception as e:
                announcement.email_sent = False
                email_status = f"Email: Delivery error ({str(e)})"
                logger.error(f"Email dispatch error: {e}")

    # 6. Finalize delivery status
    announcement.delivery_status = f"{discord_status}; {email_status}"
    db.session.commit()

    return True, {
        "success": True,
        "message": "Announcement processed successfully.",
        "announcement": announcement.to_dict(),
        "delivery": {
            "discord": {
                "selected": send_discord,
                "sent": announcement.discord_sent,
                "status": discord_status,
            },
            "email": {
                "selected": send_email,
                "sent": announcement.email_sent,
                "status": email_status,
            },
        },
    }, 201


def get_recent_announcements(limit: int = 15) -> List[Dict[str, Any]]:
    """Returns the most recent announcement records ordered by creation date."""
    records = Announcement.query.order_by(Announcement.created_at.desc()).limit(limit).all()
    return [a.to_dict() for a in records]
