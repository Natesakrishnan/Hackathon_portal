import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
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
    send_email: bool = False,
    admin_id: Optional[int] = None,
    **kwargs,
) -> Tuple[bool, Dict[str, Any], int]:
    """
    Validates, persists, and publishes hackathon announcements to the portal and optional email.
    Reports honest status for configured and unconfigured integrations.
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
        delivery_status="Portal: Published",
    )
    db.session.add(announcement)
    db.session.commit()

    email_status = "Email: Not requested"

    # 4. Email Delivery
    if send_email:
        from app.services.email_service import get_smtp_config, send_email as dispatch_email
        smtp_cfg = get_smtp_config()
        if not smtp_cfg["is_configured"]:
            email_status = "Email: Provider not configured (configure in Admin Event Settings)"
            announcement.email_sent = False
        else:
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
                # Dispatch email via unified email service (handles Resend HTTPS and SMTP)
                delivered_count = 0
                failed_count = 0
                last_err = ""

                announcement_html = f"""
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px; background: #FFFFFF;">
                  <div style="background: linear-gradient(135deg, #2563EB, #7C3AED); padding: 24px; border-radius: 8px; color: #FFFFFF; text-align: center; margin-bottom: 20px;">
                    <span style="display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Official Broadcast Announcement</span>
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #FFFFFF;">{title}</h2>
                  </div>
                  <div style="color: #334155; font-size: 15px; line-height: 1.7; white-space: pre-wrap; padding: 0 4px;">{message}</div>
                  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8; text-align: center;">
                    <p style="margin: 0;">SYNEX 2026 Hackathon &bull; Campus Innovation Hub, Bengaluru &bull; <a href="https://synex2026.org" style="color: #2563EB;">synex2026.org</a></p>
                  </div>
                </div>
                """

                for recipient_email in unique_recipients[:50]:
                    try:
                        ok, res_msg, _ = dispatch_email(
                            to_email=recipient_email,
                            subject=f"[SYNEX 2026 Announcement] {title}",
                            body_text=message,
                            body_html=announcement_html,
                            email_type="announcement",
                        )
                        if ok:
                            delivered_count += 1
                        else:
                            failed_count += 1
                            last_err = res_msg
                    except Exception as e:
                        failed_count += 1
                        last_err = str(e)
                        logger.error(f"Email broadcast exception to {recipient_email}: {e}")

                if delivered_count > 0:
                    announcement.email_sent = True
                    email_status = f"Email: Delivered to {delivered_count} recipient(s)"
                    if failed_count > 0:
                        email_status += f" ({failed_count} failed: {last_err})"
                else:
                    announcement.email_sent = False
                    email_status = f"Email: Delivery error ({last_err or 'failed to send'})"

    # 5. Finalize delivery status
    if send_email:
        announcement.delivery_status = f"Portal: Published; {email_status}"
    else:
        announcement.delivery_status = "Portal: Published"
    db.session.commit()

    return True, {
        "success": True,
        "message": "Announcement processed successfully.",
        "announcement": announcement.to_dict(),
        "delivery": {
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


def clear_announcements() -> int:
    """Deletes all announcement records from the database and returns deleted count."""
    count = Announcement.query.delete()
    db.session.commit()
    logger.info(f"Cleared {count} announcement records.")
    return count
