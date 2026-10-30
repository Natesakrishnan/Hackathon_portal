import logging
import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr
from typing import Dict, Any, List, Optional, Tuple
from flask import current_app
from app.extensions import db
from app.models.event_setting import EventSetting
from app.models.email_log import EmailLog

logger = logging.getLogger(__name__)


def get_smtp_config() -> Dict[str, Any]:
    """
    Retrieves current email delivery configuration.
    Prioritizes persistent EventSetting values from database, falling back to Flask config/env.
    Supports both standard SMTP and HTTPS REST API (Resend).
    """
    provider = EventSetting.get_val("EMAIL_PROVIDER", os.environ.get("EMAIL_PROVIDER", "smtp")).strip().lower()
    resend_key = EventSetting.get_val("RESEND_API_KEY", os.environ.get("RESEND_API_KEY", "")).strip()

    host = EventSetting.get_val("SMTP_HOST", current_app.config.get("MAIL_SERVER", "smtp.gmail.com")).strip()
    port_str = EventSetting.get_val("SMTP_PORT", str(current_app.config.get("MAIL_PORT", 587)))
    try:
        port = int(port_str)
    except (ValueError, TypeError):
        port = 587

    user = EventSetting.get_val("SMTP_USER", current_app.config.get("MAIL_USERNAME") or "").strip()
    password = EventSetting.get_val("SMTP_PASSWORD", current_app.config.get("MAIL_PASSWORD") or "").strip()
    use_tls = EventSetting.get_val("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
    use_ssl = EventSetting.get_val("SMTP_USE_SSL", "false").lower() in ("true", "1", "yes")
    default_sender = EventSetting.get_val(
        "SMTP_SENDER",
        current_app.config.get("MAIL_DEFAULT_SENDER", "SYNEX Hackathon Team <noreply@synex.org>")
    ).strip()

    if provider == "resend":
        is_configured = bool(resend_key)
        status_description = "Live Delivery Active (Resend HTTPS API)" if is_configured else "Simulation Mode (Resend API Key missing)"
    else:
        is_configured = bool(user and password)
        status_description = f"Live Delivery Active (SMTP {host}:{port})" if is_configured else "Simulation Mode (SMTP credentials missing)"

    return {
        "provider": provider,
        "resend_key": resend_key,
        "has_resend_key": bool(resend_key),
        "host": host,
        "port": port,
        "username": user,
        "password": password,
        "has_password": bool(password),
        "use_tls": use_tls,
        "use_ssl": use_ssl,
        "default_sender": default_sender,
        "is_configured": is_configured,
        "status_description": status_description,
    }


def save_smtp_config(data: Dict[str, Any]) -> Tuple[bool, str]:
    """Persists updated email delivery configuration into EventSetting."""
    provider = (data.get("provider") or "smtp").strip().lower()
    resend_key = (data.get("resend_key") or "").strip()

    host = (data.get("host") or "smtp.gmail.com").strip()
    try:
        port = int(data.get("port") or 587)
    except (ValueError, TypeError):
        port = 587
    user = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    use_tls = bool(data.get("use_tls", True))
    use_ssl = bool(data.get("use_ssl", False))
    sender = (data.get("default_sender") or f"SYNEX Team <{user or 'noreply@synex.org'}>").strip()

    EventSetting.set_val("EMAIL_PROVIDER", provider, "Email Delivery Provider (smtp or resend)")
    if resend_key and not resend_key.startswith("•") and not resend_key.startswith("re_••••"):
        EventSetting.set_val("RESEND_API_KEY", resend_key, "Resend HTTPS API Key")
    EventSetting.set_val("SMTP_HOST", host, "SMTP Server Host")
    EventSetting.set_val("SMTP_PORT", str(port), "SMTP Server Port")
    EventSetting.set_val("SMTP_USER", user, "SMTP Authentication Username / Email")
    if password and password != "••••••••":
        EventSetting.set_val("SMTP_PASSWORD", password, "SMTP Authentication Password")
    EventSetting.set_val("SMTP_USE_TLS", "true" if use_tls else "false", "SMTP TLS Encryption")
    EventSetting.set_val("SMTP_USE_SSL", "true" if use_ssl else "false", "SMTP SSL Encryption")
    EventSetting.set_val("SMTP_SENDER", sender, "Default Email Sender Header")

    return True, "Email delivery configuration updated and persisted successfully."


def send_email(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    email_type: str = "direct",
) -> Tuple[bool, str, Optional[EmailLog]]:
    """
    Sends an email to the specified recipient.
    - If Resend API key is configured: dispatches via HTTPS port 443 (bypassing ISP port blocks).
    - If live SMTP credentials are configured: delivers via smtplib.
    - If neither is configured: records message in simulated outbox and clearly reports simulation.
    """
    to_email = (to_email or "").strip().lower()
    subject = (subject or "").strip()
    body_text = (body_text or "").strip()

    if not to_email or "@" not in to_email:
        return False, "A valid recipient email address is required.", None
    if not subject:
        return False, "Email subject is required.", None
    if not body_text:
        return False, "Email message body is required.", None

    cfg = get_smtp_config()
    sender = cfg["default_sender"] or f"SYNEX Hackathon <{cfg['username'] or 'noreply@synex.org'}>"
    _, from_email = parseaddr(sender)
    envelope_from = from_email if from_email else (cfg["username"] or "noreply@synex.org")

    if not body_html:
        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 8px; background: #FFFFFF;">
          <div style="padding-bottom: 16px; margin-bottom: 20px; border-bottom: 2px solid #2563EB;">
            <h2 style="margin: 0; color: #1E293B; font-size: 20px; font-weight: 700;">SYNEX 2026 Hackathon</h2>
            <p style="margin: 4px 0 0; color: #64748B; font-size: 13px;">Official Organizing Committee Communication</p>
          </div>
          <div style="color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">{body_text}</div>
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
            <p style="margin: 0;">This email was sent by the SYNEX 2026 Admin Portal.</p>
            <p style="margin: 4px 0 0;">Campus Innovation Hub, Bengaluru &bull; <a href="https://synex2026.org" style="color: #2563EB;">synex2026.org</a></p>
          </div>
        </div>
        """
    else:
        html_content = body_html

    # PATH A: Resend HTTPS REST API (Bypasses ISP port blocks on 587/465)
    if cfg["provider"] == "resend" and cfg["resend_key"]:
        try:
            import requests
            headers = {
                "Authorization": f"Bearer {cfg['resend_key']}",
                "Content-Type": "application/json"
            }
            display_name, parsed_addr = parseaddr(sender)
            # If sender domain is synthetic/unverified placeholder, default to Resend test sandbox
            is_placeholder_domain = (
                not parsed_addr
                or parsed_addr.endswith("@synex.org")
                or parsed_addr.endswith("@synex2026.org")
                or parsed_addr.endswith("@example.com")
            )
            if is_placeholder_domain:
                resend_sender = f"{display_name or 'SYNEX Hackathon'} <onboarding@resend.dev>"
            else:
                resend_sender = sender

            payload = {
                "from": resend_sender,
                "to": [to_email],
                "subject": subject,
                "text": body_text,
                "html": html_content
            }
            resp = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=12)

            # If rejected because domain is unverified, auto-retry with onboarding@resend.dev sandbox
            if resp.status_code == 403 and "domain is not verified" in resp.text:
                fallback_from = f"{display_name or 'SYNEX Hackathon'} <onboarding@resend.dev>"
                if payload["from"] != fallback_from:
                    logger.info(f"Resend reported domain unverified for '{payload['from']}'. Auto-retrying with '{fallback_from}'...")
                    payload["from"] = fallback_from
                    resp = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=12)

            if resp.status_code in (200, 201):
                msg_id = resp.json().get("id", "")
                log = EmailLog(
                    recipient=to_email,
                    subject=subject,
                    message=body_text,
                    email_type=email_type,
                    status="sent",
                    error_message=f"Delivered via Resend HTTPS API (Message ID: {msg_id})",
                )
                db.session.add(log)
                db.session.commit()
                return True, f"Live email delivered successfully to {to_email} via Resend API.", log
            else:
                try:
                    err_json = resp.json()
                    err_msg = err_json.get("message") or resp.text
                except Exception:
                    err_msg = resp.text

                if "only send testing emails to your own email address" in err_msg.lower():
                    friendly_err = f"{err_msg} (Note: In Resend Sandbox mode with 'onboarding@resend.dev', you can only test-send to the email address you signed up with on Resend. To send to any recipient, add and verify your custom domain at https://resend.com/domains)."
                elif "domain is not verified" in err_msg.lower():
                    friendly_err = f"{err_msg} (Tip: To test without adding a custom domain, set your Sender Header to 'SYNEX Hackathon <onboarding@resend.dev>')."
                else:
                    friendly_err = err_msg

                log = EmailLog(
                    recipient=to_email,
                    subject=subject,
                    message=body_text,
                    email_type=email_type,
                    status="failed",
                    error_message=f"Resend HTTP {resp.status_code}: {err_msg}",
                )
                db.session.add(log)
                db.session.commit()
                return False, f"Resend API error: {friendly_err}", log
        except Exception as e:
            err_msg = str(e)
            log = EmailLog(
                recipient=to_email,
                subject=subject,
                message=body_text,
                email_type=email_type,
                status="failed",
                error_message=err_msg,
            )
            db.session.add(log)
            db.session.commit()
            return False, f"Email delivery failed: {err_msg}", log

    # PATH B: Standard SMTP Server (smtplib)
    elif cfg["is_configured"]:
        # Construct MIME message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = to_email
        msg.attach(MIMEText(body_text, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        try:
            if cfg["use_ssl"]:
                server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=12)
            else:
                server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=12)
                if cfg["use_tls"]:
                    server.starttls()

            server.login(cfg["username"], cfg["password"])
            server.sendmail(envelope_from, [to_email], msg.as_string())
            server.quit()

            log = EmailLog(
                recipient=to_email,
                subject=subject,
                message=body_text,
                email_type=email_type,
                status="sent",
                error_message=None,
            )
            db.session.add(log)
            db.session.commit()

            return True, f"Live email delivered successfully to {to_email}.", log
        except Exception as e:
            err_msg = str(e)
            logger.error(f"SMTP send error to {to_email}: {err_msg}")
            log = EmailLog(
                recipient=to_email,
                subject=subject,
                message=body_text,
                email_type=email_type,
                status="failed",
                error_message=err_msg,
            )
            db.session.add(log)
            db.session.commit()
            return False, f"SMTP delivery failed: {err_msg}", log

    # PATH C: Simulation Mode (No credentials configured)
    else:
        log = EmailLog(
            recipient=to_email,
            subject=subject,
            message=body_text,
            email_type=email_type,
            status="simulated",
            error_message="Simulated Outbox: No live email credentials configured in Event Settings.",
        )
        db.session.add(log)
        db.session.commit()
        logger.info(f"Email logged to outbox (simulated): To {to_email} - {subject}")
        return False, f"Saved to Outbox (SIMULATED). Real email was NOT delivered to {to_email} because outgoing mail credentials are not configured.", log


def test_smtp_connection(test_recipient: Optional[str] = None) -> Tuple[bool, str]:
    """Verifies email delivery connectivity and credentials."""
    cfg = get_smtp_config()

    if cfg["provider"] == "resend":
        if not cfg["resend_key"]:
            return False, "Resend API Key is required to test the connection."
        try:
            import requests
            headers = {"Authorization": f"Bearer {cfg['resend_key']}"}
            resp = requests.get("https://api.resend.com/api-keys", headers=headers, timeout=10)
            if resp.status_code == 200:
                if test_recipient and "@" in test_recipient:
                    success, msg, _ = send_email(
                        to_email=test_recipient,
                        subject="[SYNEX 2026] Live Email Connection Test",
                        body_text="Congratulations! Your SYNEX 2026 Hackathon email delivery is working perfectly via Resend API."
                    )
                    return success, f"Resend API authenticated! Test ping result: {msg}"
                return True, "Resend API connection established and authenticated successfully!"
            return False, f"Resend API authentication failed (HTTP {resp.status_code}): {resp.text}"
        except Exception as e:
            return False, f"Resend connection test error: {str(e)}"

    if not cfg["is_configured"]:
        return False, "SMTP Username and Password must be set to test the connection."

    try:
        if cfg["use_ssl"]:
            server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=10)
        else:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=10)
            if cfg["use_tls"]:
                server.starttls()

        server.login(cfg["username"], cfg["password"])

        if test_recipient and "@" in test_recipient:
            msg = MIMEText("This is an automated test ping from the SYNEX 2026 Hackathon Admin Portal.")
            msg["Subject"] = "[SYNEX 2026] SMTP Connection Test Ping"
            msg["From"] = cfg["default_sender"]
            msg["To"] = test_recipient
            _, from_addr = parseaddr(cfg["default_sender"])
            server.sendmail(from_addr or cfg["username"], [test_recipient], msg.as_string())

        server.quit()
        return True, "SMTP connection established and authenticated successfully!"
    except Exception as e:
        err_str = str(e)
        hint = ""
        if "timed out" in err_str.lower() or "connection refused" in err_str.lower() or "10060" in err_str or "errno" in err_str.lower():
            hint = " (Note: Outbound SMTP ports like 587/465 are frequently blocked by local network/ISPs. Switch to Resend HTTPS API in Settings to bypass port blocks)."
        return False, f"SMTP connection error: {err_str}{hint}"


def get_recent_email_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Returns outbound email logs ordered by most recent."""
    logs = EmailLog.query.order_by(EmailLog.created_at.desc()).limit(limit).all()
    return [l.to_dict() for l in logs]


def send_confirmation_email(registration, payment=None) -> bool:
    """Dispatches registration and payment confirmation email to participant."""
    if not registration or not registration.participant:
        return False

    recipient_email = registration.participant.email
    recipient_name = registration.participant.full_name
    event_name = current_app.config.get("EVENT_NAME", "SYNEX 2026")
    subject = f"[{event_name}] Registration & Payment Confirmed - {registration.public_id}"

    team_info_html = ""
    if registration.registration_type == "team" and registration.team:
        members_list = "".join([f"<li>{m.full_name} ({m.email})</li>" for m in registration.team.members])
        team_info_html = f"""
        <div style="margin-top: 20px; padding: 14px; background: #F1F5F9; border-radius: 8px;">
            <p style="margin: 0 0 6px 0; font-weight: 600; color: #1E293B;">Team: {registration.team.team_name}</p>
            <ul style="margin: 0; padding-left: 20px; color: #4B5563; font-size: 14px;">{members_list}</ul>
        </div>
        """

    body_text = f"""
Hi {recipient_name},

Thank you for registering for {event_name}!
Your registration and payment have been verified.

Registration ID: {registration.public_id}
Category: {registration.registration_type.capitalize()}
Domain: {registration.domain}
Amount Paid: ₹{payment.amount if payment else registration.entry_fee}
Payment Ref: {payment.gateway_payment_id if payment else 'N/A'}

See you at the hackathon!
    """

    body_html = f"""
    <div style="font-family: 'Inter', Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background: linear-gradient(135deg, #2563EB, #7C3AED); padding: 32px 24px; text-align: center; color: #FFFFFF;">
                <h1 style="margin: 0; font-size: 26px; font-weight: 700;">Registration Confirmed!</h1>
                <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 15px;">Welcome to {event_name} - 36-Hour National Innovation Hackathon</p>
            </div>
            
            <div style="padding: 28px 24px;">
                <p style="font-size: 16px; color: #1F2937; margin-top: 0;">Hi <strong>{recipient_name}</strong>,</p>
                <p style="color: #4B5563; line-height: 1.6;">Thank you for registering. Your payment has been successfully verified, and your entry slot is officially locked!</p>
                
                <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr>
                            <td style="padding: 6px 0; color: #64748B;">Registration ID:</td>
                            <td style="padding: 6px 0; font-weight: 700; color: #2563EB; text-align: right;">{registration.public_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748B;">Category:</td>
                            <td style="padding: 6px 0; font-weight: 600; color: #1E293B; text-align: right;">{registration.registration_type.capitalize()} Registration</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748B;">Domain:</td>
                            <td style="padding: 6px 0; font-weight: 600; color: #1E293B; text-align: right;">{registration.domain}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748B;">Amount Paid:</td>
                            <td style="padding: 6px 0; font-weight: 700; color: #059669; text-align: right;">₹{payment.amount if payment else registration.entry_fee}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748B;">Payment Reference:</td>
                            <td style="padding: 6px 0; font-family: monospace; color: #475569; text-align: right;">{payment.gateway_payment_id if payment else 'N/A'}</td>
                        </tr>
                    </table>
                </div>

                {team_info_html}

                <p style="margin-top: 28px; color: #64748B; font-size: 13px; line-height: 1.5;">
                    If you have any questions, reach out to us at <a href="mailto:support@synex.org" style="color: #2563EB;">support@synex.org</a>.
                </p>
            </div>
            <div style="background: #F1F5F9; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748B;">
                © 2026 SYNEX Hackathon Committee. All rights reserved.
            </div>
        </div>
    </div>
    """

    success, msg, log = send_email(
        to_email=recipient_email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        email_type="confirmation",
    )
    return success
