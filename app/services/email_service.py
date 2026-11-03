import logging
import os
import smtplib
import base64
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
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
    provider = EventSetting.get_val("EMAIL_PROVIDER", os.environ.get("EMAIL_PROVIDER", "brevo")).strip().lower()
    if provider not in ("brevo", "resend"):
        provider = "brevo"
    
    raw_brevo_key = EventSetting.get_val("BREVO_API_KEY", os.environ.get("BREVO_API_KEY", "")).strip()
    if raw_brevo_key and not raw_brevo_key.startswith("•"):
        brevo_key = raw_brevo_key
    else:
        brevo_key = ""
    brevo_sender_email = EventSetting.get_val("BREVO_SENDER_EMAIL", os.environ.get("BREVO_SENDER_EMAIL", "")).strip()

    raw_resend_key = EventSetting.get_val("RESEND_API_KEY", os.environ.get("RESEND_API_KEY", "")).strip()
    if raw_resend_key and raw_resend_key.startswith("re_") and "@" not in raw_resend_key:
        resend_key = raw_resend_key
    else:
        resend_key = ""

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
        current_app.config.get("MAIL_DEFAULT_SENDER", f"{EventSetting.get_val('EVENT_NAME', 'SYNEX 2026')} Team <noreply@synex.org>")
    ).strip()

    if provider == "brevo":
        is_configured = bool(brevo_key)
        status_description = "Live Delivery Active (Brevo HTTPS API)" if is_configured else "Simulation Mode (Brevo API Key missing)"
    elif provider == "resend":
        is_configured = bool(resend_key)
        status_description = "Live Delivery Active (Resend HTTPS API)" if is_configured else "Simulation Mode (Resend API Key missing)"
    else:
        is_configured = bool(user and password)
        status_description = f"Live Delivery Active (SMTP {host}:{port})" if is_configured else "Simulation Mode (SMTP credentials missing)"

    return {
        "provider": provider,
        "brevo_key": brevo_key,
        "has_brevo_key": bool(brevo_key),
        "brevo_sender_email": brevo_sender_email,
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
    provider = (data.get("provider") or "brevo").strip().lower()
    if provider not in ("brevo", "resend"):
        provider = "brevo"
    brevo_key = (data.get("brevo_key") or "").strip()
    brevo_sender_email = (data.get("brevo_sender_email") or data.get("brevo_sender") or "").strip()
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

    EventSetting.set_val("EMAIL_PROVIDER", provider, "Email Delivery Provider (brevo, resend, or smtp)")
    if brevo_key:
        if not brevo_key.startswith("•") and not brevo_key.startswith("xkeysib-••••"):
            EventSetting.set_val("BREVO_API_KEY", brevo_key, "Brevo HTTPS API Key")
    if brevo_sender_email:
        EventSetting.set_val("BREVO_SENDER_EMAIL", brevo_sender_email, "Brevo Verified Sender Email")

    if resend_key:
        if resend_key.startswith("•") or resend_key.startswith("re_••••"):
            pass
        elif not resend_key.startswith("re_") or len(resend_key) < 15 or "@" in resend_key:
            logger.warning(f"Ignored invalid resend_key value: '{resend_key}' (must start with 're_' and not be a password)")
        else:
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
    attachments: Optional[List[Dict[str, Any]]] = None,
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
    curr_event_name = EventSetting.get_val("EVENT_NAME", current_app.config.get("EVENT_NAME", "SYNEX 2026"))
    sender = cfg["default_sender"] or f"{curr_event_name} Hackathon <{cfg['username'] or 'noreply@synex.org'}>"
    _, from_email = parseaddr(sender)
    envelope_from = from_email if from_email else (cfg["username"] or "noreply@synex.org")

    if not body_html:
        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 8px; background: #FFFFFF;">
          <div style="padding-bottom: 16px; margin-bottom: 20px; border-bottom: 2px solid #2563EB;">
            <h2 style="margin: 0; color: #1E293B; font-size: 20px; font-weight: 700;">{curr_event_name} Hackathon</h2>
            <p style="margin: 4px 0 0; color: #64748B; font-size: 13px;">Official Organizing Committee Communication</p>
          </div>
          <div style="color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">{body_text}</div>
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #94A3B8;">
            <p style="margin: 0;">This email was sent by the {curr_event_name} Admin Portal.</p>
            <p style="margin: 4px 0 0;">Campus Innovation Hub, Bengaluru &bull; <a href="https://synex2026.org" style="color: #2563EB;">synex2026.org</a></p>
          </div>
        </div>
        """
    else:
        html_content = body_html

    # PATH A: Brevo HTTPS REST API (Port 443 - Sends to ANY recipient email without custom domain)
    if cfg["provider"] == "brevo" and cfg["brevo_key"]:
        try:
            import requests
            headers = {
                "api-key": cfg["brevo_key"],
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            display_name, parsed_addr = parseaddr(sender)
            sender_email = (cfg.get("brevo_sender_email") or parsed_addr or cfg.get("username") or "natesakrishna0@gmail.com").strip()
            sender_name = display_name or f"{curr_event_name} Hackathon"

            payload = {
                "sender": {"name": sender_name, "email": sender_email},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html_content,
                "textContent": body_text,
            }
            if attachments:
                brevo_attachments = []
                for att in attachments:
                    content_bytes = att.get("content_bytes") or b""
                    brevo_attachments.append({
                        "name": att.get("filename", "attachment.bin"),
                        "content": base64.b64encode(content_bytes).decode("utf-8")
                    })
                payload["attachment"] = brevo_attachments

            resp = requests.post("https://api.brevo.com/v3/smtp/email", json=payload, headers=headers, timeout=12)
            if resp.status_code in (200, 201):
                res_data = resp.json()
                msg_id = res_data.get("messageId", "")
                log = EmailLog(
                    recipient=to_email,
                    subject=subject,
                    message=body_text,
                    email_type=email_type,
                    status="sent",
                    error_message=f"Delivered via Brevo HTTPS API (Message ID: {msg_id})",
                )
                db.session.add(log)
                db.session.commit()
                return True, f"Live email delivered successfully to {to_email} via Brevo API.", log
            else:
                try:
                    err_json = resp.json()
                    err_msg = err_json.get("message") or resp.text
                except Exception:
                    err_msg = resp.text

                logger.error(f"Brevo API error (HTTP {resp.status_code}): {err_msg}")
                friendly_err = err_msg
                if "sender" in err_msg.lower() or "unregistered" in err_msg.lower():
                    friendly_err = f"{err_msg} (Tip: Ensure '{sender_email}' is the email address of your Brevo account under Senders)."

                log = EmailLog(
                    recipient=to_email,
                    subject=subject,
                    message=body_text,
                    email_type=email_type,
                    status="failed",
                    error_message=f"Brevo HTTP {resp.status_code}: {err_msg}",
                )
                db.session.add(log)
                db.session.commit()
                return False, f"Brevo API error: {friendly_err}", log
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

    # PATH B: Resend HTTPS REST API (Bypasses ISP port blocks on 587/465)
    elif cfg["provider"] == "resend" and cfg["resend_key"]:
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
                resend_sender = f"{display_name or (curr_event_name + ' Hackathon')} <onboarding@resend.dev>"
            else:
                resend_sender = sender

            payload = {
                "from": resend_sender,
                "to": [to_email],
                "subject": subject,
                "text": body_text,
                "html": html_content
            }
            if attachments:
                resend_attachments = []
                for att in attachments:
                    content_bytes = att.get("content_bytes") or b""
                    resend_attachments.append({
                        "filename": att.get("filename", "attachment.bin"),
                        "content": base64.b64encode(content_bytes).decode("utf-8")
                    })
                payload["attachments"] = resend_attachments

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
                    import re
                    m = re.search(r'own email address \(([^)]+)\)', err_msg)
                    owner_email = m.group(1).strip() if m else "natesakrishna0@gmail.com"
                    if owner_email and owner_email.lower() != to_email.lower():
                        logger.info(f"Forwarding confirmation pass to verified owner {owner_email} for team leader {to_email}...")
                        forward_payload = dict(payload)
                        forward_payload["to"] = [owner_email]
                        forward_payload["subject"] = f"[Sandbox Pass for {to_email}] {subject}"
                        sandbox_banner = f"""
                        <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: #92400E; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                          <strong>⚠️ Resend Sandbox Mode Delivery:</strong><br>
                          This official confirmation pass is for Team Leader: <strong>{to_email}</strong>.<br>
                          Because Resend is currently using the free test domain (<code>onboarding@resend.dev</code>), Resend restricts external student recipient domains and routed this pass to your verified account (<code>{owner_email}</code>).<br>
                          <em>To deliver directly to all student email inboxes, verify a custom domain at <a href="https://resend.com/domains" style="color: #2563EB;">resend.com/domains</a> or configure Standard Gmail SMTP in the Admin Portal.</em>
                        </div>
                        """
                        forward_payload["html"] = sandbox_banner + html_content
                        forward_payload["text"] = f"[RESEND SANDBOX NOTICE: Intended for team leader {to_email}. Forwarded to {owner_email} due to sandbox testing restrictions.]\n\n" + body_text
                        try:
                            f_resp = requests.post("https://api.resend.com/emails", json=forward_payload, headers=headers, timeout=12)
                            if f_resp.status_code in (200, 201):
                                f_msg_id = f_resp.json().get("id", "")
                                log = EmailLog(
                                    recipient=to_email,
                                    subject=subject,
                                    message=body_text,
                                    email_type=email_type,
                                    status="sent",
                                    error_message=f"Delivered to organizer {owner_email} via Resend Sandbox (Forwarded pass for team leader {to_email} - Resend Message ID: {f_msg_id})",
                                )
                                db.session.add(log)
                                db.session.commit()
                                return True, f"Live email delivered via Resend Sandbox (forwarded to {owner_email} for team leader {to_email}).", log
                        except Exception as fe:
                            logger.warning(f"Failed to forward via Resend sandbox: {fe}")
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
        if attachments:
            msg = MIMEMultipart("mixed")
            msg["Subject"] = subject
            msg["From"] = sender
            msg["To"] = to_email
            alt = MIMEMultipart("alternative")
            alt.attach(MIMEText(body_text, "plain", "utf-8"))
            alt.attach(MIMEText(html_content, "html", "utf-8"))
            msg.attach(alt)
            for att in attachments:
                subtype = att.get("subtype", "pdf")
                fname = att.get("filename", f"attachment.{subtype}")
                part = MIMEApplication(att.get("content_bytes") or b"", _subtype=subtype)
                part.add_header('Content-Disposition', 'attachment', filename=fname)
                msg.attach(part)
        else:
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
        att_note = f" (With {len(attachments)} PDF attachment(s))" if attachments else ""
        log = EmailLog(
            recipient=to_email,
            subject=subject,
            message=body_text + att_note,
            email_type=email_type,
            status="simulated",
            error_message="Simulated Outbox: No live email credentials configured in Event Settings." + att_note,
        )
        db.session.add(log)
        db.session.commit()
        logger.info(f"Email logged to outbox (simulated): To {to_email} - {subject}")
        return False, f"Saved to Outbox (SIMULATED). Real email was NOT delivered to {to_email} because outgoing mail credentials are not configured.", log


def test_smtp_connection(test_recipient: Optional[str] = None) -> Tuple[bool, str]:
    """Verifies email delivery connectivity and credentials."""
    cfg = get_smtp_config()

    if cfg["provider"] == "brevo":
        if not cfg["brevo_key"]:
            return False, "Brevo API Key is required to test the connection."
        try:
            import requests
            headers = {"api-key": cfg["brevo_key"], "Accept": "application/json"}
            resp = requests.get("https://api.brevo.com/v3/account", headers=headers, timeout=10)
            if resp.status_code == 200:
                acc_info = resp.json()
                acc_email = acc_info.get("email", "")
                if test_recipient and "@" in test_recipient:
                    success, msg, _ = send_email(
                        to_email=test_recipient,
                        subject="[SYNEX 2026] Brevo Live Email Test",
                        body_text="Congratulations! Your SYNEX 2026 Hackathon email delivery is working perfectly via Brevo API on Port 443."
                    )
                    return success, f"Brevo API authenticated ({acc_email})! Test ping result: {msg}"
                return True, f"Brevo API connection established and authenticated successfully for account {acc_email}!"
            return False, f"Brevo API authentication failed (HTTP {resp.status_code}): {resp.text}"
        except Exception as e:
            return False, f"Brevo connection test error: {str(e)}"

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
            test_evt = EventSetting.get_val("EVENT_NAME", current_app.config.get("EVENT_NAME", "SYNEX 2026"))
            msg = MIMEText(f"This is an automated test ping from the {test_evt} Hackathon Admin Portal.")
            msg["Subject"] = f"[{test_evt}] SMTP Connection Test Ping"
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
    """
    Dispatches the official registration and check-in confirmation email to the team leader's registered email.
    Includes the unique single-use check-in QR code, check-in token, complete team members attendance roster,
    and link to the digital confirmation pass.
    """
    if not registration or not registration.participant:
        logger.warning("Cannot send confirmation email: Missing registration or primary participant.")
        return False

    import io
    import json
    import base64
    import urllib.parse
    from app.services.checkin_service import get_qr_code_payload, generate_qr_code_png_bytes
    from app.services.registration_service import generate_checkin_token

    # 1. Ensure checkin_token exists on the registration
    if not registration.checkin_token:
        registration.checkin_token = generate_checkin_token()
        try:
            db.session.commit()
        except Exception as e:
            logger.warning(f"Error persisting generated checkin_token for {registration.public_id}: {e}")

    # 2. Identify Team Leader and Recipient
    is_team = registration.registration_type == "team"
    if is_team and registration.team and registration.team.leader:
        recipient_email = registration.team.leader.email
        recipient_name = registration.team.leader.full_name
        team_name = registration.team.team_name
    elif registration.participant:
        recipient_email = registration.participant.email
        recipient_name = registration.participant.full_name
        team_name = registration.team.team_name if (is_team and registration.team) else recipient_name
    else:
        return False

    event_name = EventSetting.get_val("EVENT_NAME", current_app.config.get("EVENT_NAME", "SYNEX 2026"))
    subject = f"[{event_name}] Registration & Check-In Pass Confirmed - {team_name} ({registration.public_id})"

    # 3. Generate Unique Check-In QR Code
    qr_payload_str = get_qr_code_payload(registration)
    try:
        qr_png_bytes = generate_qr_code_png_bytes(qr_payload_str)
    except Exception as e:
        logger.error(f"Failed to generate QR code PNG: {e}")
        qr_png_bytes = b""

    # High-availability HTTPS QR code URL (100% compatible with Gmail, Outlook, Apple Mail image proxies)
    encoded_qr_data = urllib.parse.quote(qr_payload_str)
    qr_image_url = f"https://api.qrserver.com/v1/create-qr-code/?size=250x250&data={encoded_qr_data}&margin=2"

    # Base URL for confirmation pass link
    base_url = current_app.config.get("BASE_URL", "http://localhost:5000").rstrip("/")
    confirmation_pass_url = f"{base_url}/confirmation?ref={registration.public_id}"

    # 4. Format Team Members Roster
    team_members_html = ""
    team_members_text = ""
    members_count = 1

    if is_team and registration.team and registration.team.members:
        members_count = len(registration.team.members)
        rows_html = []
        text_lines = []

        for idx, m in enumerate(registration.team.members, 1):
            is_lead = (m.role or "").lower() == "leader" or (registration.team.leader_id and m.participant_id == registration.team.leader_id)
            role_label = "👑 LEADER" if is_lead else "MEMBER"
            p = m.participant
            name = p.full_name if p else "N/A"
            email = p.email if p else "N/A"
            phone = p.phone if p else "N/A"
            college = p.college if p else ""
            dept = p.department if p else ""
            year = p.year_of_study if p else ""
            academic = f"{dept} ({year})" if dept and year else (dept or college or "-")

            badge_style = "background: #FEF3C7; color: #B45309; border: 1px solid #FCD34D;" if is_lead else "background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0;"

            rows_html.append(f"""
            <tr style="border-bottom: 1px solid #E2E8F0; { 'background: #FFFDF5;' if is_lead else '' }">
              <td style="padding: 10px 8px; text-align: center;">
                <span style="display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 700; border-radius: 999px; {badge_style}">
                  {role_label}
                </span>
              </td>
              <td style="padding: 10px 8px; font-weight: 700; color: #0F172A; font-size: 13px;">{name}</td>
              <td style="padding: 10px 8px; font-family: monospace; font-size: 12px; color: #2563EB;">{email}</td>
              <td style="padding: 10px 8px; font-family: monospace; font-size: 12px; color: #475569;">{phone}</td>
              <td style="padding: 10px 8px; font-size: 12px; color: #64748B;">{academic}</td>
            </tr>
            """)

            text_lines.append(f"  {idx}. [{role_label}] {name} | {email} | {phone} | {academic}")

        team_members_html = f"""
        <div style="margin: 24px 0;">
          <div style="margin-bottom: 8px;">
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0F172A;">
              👥 Team Members Attendance Roster ({members_count} Members)
            </h3>
            <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748B;">All listed members are covered by this official check-in pass.</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background: #F8FAFC; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 11px; text-transform: uppercase; text-align: left;">
                <th style="padding: 8px; text-align: center;">Role</th>
                <th style="padding: 8px;">Name</th>
                <th style="padding: 8px;">Email</th>
                <th style="padding: 8px;">Phone</th>
                <th style="padding: 8px;">Academic Info</th>
              </tr>
            </thead>
            <tbody>
              {''.join(rows_html)}
            </tbody>
          </table>
        </div>
        """
        team_members_text = "\nTeam Members:\n" + "\n".join(text_lines)

    # 5. Build Plain Text Version
    body_text = f"""
Hi {recipient_name} (Team Leader),

Congratulations! Your team registration for {event_name} is CONFIRMED and paid.
Your official single-use check-in QR code is ready.

==================================================
REGISTRATION INFORMATION
==================================================
Team Name:         {team_name}
Registration ID:   {registration.public_id}
Check-In Token:    {registration.checkin_token}
Category:          {registration.registration_type.capitalize()} Registration ({members_count} Members)
Domain Track:      {registration.domain}
Fee Paid:          ₹{payment.amount if payment else registration.entry_fee} (Verified)
Payment Ref:       {payment.gateway_payment_id if payment else 'COMPLETED'}
Event Date:        Nov 14, 2026 - 08:30 AM IST
Venue:             Campus Innovation Hub, Main Auditorium, Bengaluru
{team_members_text}

IMPORTANT CHECK-IN INSTRUCTIONS:
1. Present the check-in QR code at the registration desk on Nov 14, 2026.
2. The check-in QR code is valid ONCE only. Scanning checks in your entire team roster.
3. All team members must carry their original college photo ID cards.

==================================================
OFFICIAL CHECK-IN PASS & QR CODE
==================================================
Check-In Token:    {registration.checkin_token}
QR Image URL:      {qr_image_url}

View or Print Official Pass Online:
{confirmation_pass_url}

Need help? Contact support@synex.org.
- {event_name} Organizing Committee
    """.strip()

    # 6. Build High-Fidelity Branded HTML Email
    fee_val = payment.amount if payment else registration.entry_fee
    payment_ref = payment.gateway_payment_id if payment else 'VERIFIED'

    body_html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Registration &amp; Check-In Pass Confirmed - {event_name}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; margin: 0; padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; background: #FFFFFF; border-radius: 14px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
        
        <!-- 1. Header Banner -->
        <div style="background: linear-gradient(135deg, #1E40AF 0%, #2563EB 50%, #7C3AED 100%); padding: 32px 24px; text-align: center; color: #FFFFFF;">
          <div style="display: inline-block; background: rgba(255,255,255,0.18); padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px;">
            Official Registration Confirmation
          </div>
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Registration Confirmed!</h1>
          <p style="margin: 6px 0 0 0; opacity: 0.92; font-size: 14px;">{event_name} &bull; 36-Hour National Innovation Hackathon</p>
        </div>

        <div style="padding: 28px 24px;">
          <!-- 2. Salutation -->
          <p style="font-size: 16px; color: #0F172A; margin: 0 0 8px 0;">
            Hi <strong>{recipient_name}</strong> (Team Leader),
          </p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            Congratulations! Your payment has been verified, and your team entry for <strong>{team_name}</strong> is officially locked in. Below are your full registration details, team members attendance roster, and official <strong>Check-In Pass with QR code</strong>.
          </p>

          <!-- 3. TOP SECTION: Registration & Payment Information Card -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 18px 20px; margin-bottom: 24px;">
            <div style="border-bottom: 1px solid #E2E8F0; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 13px; font-weight: 700; color: #1E293B; text-transform: uppercase; letter-spacing: 0.5px;">📋 Registration Information</span>
              <span style="font-family: monospace; font-size: 13px; font-weight: 700; color: #2563EB; background: #EFF6FF; border: 1px solid #BFDBFE; padding: 2px 8px; border-radius: 4px;">{registration.public_id}</span>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 6px 0; color: #64748B; width: 35%;">Team Name:</td>
                <td style="padding: 6px 0; font-weight: 700; color: #0F172A;">{team_name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;">Category:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #0F172A;">Team Registration ({members_count} Members)</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;">Track / Domain:</td>
                <td style="padding: 6px 0; font-weight: 700; color: #2563EB;">{registration.domain}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;">Payment Status:</td>
                <td style="padding: 6px 0; font-weight: 800; color: #16A34A;">₹{fee_val} (Paid &amp; Verified)</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;">Txn Reference:</td>
                <td style="padding: 6px 0; font-family: monospace; font-size: 12px; color: #475569;">{payment_ref}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;">Kickoff Date:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #0F172A;">Nov 14, 2026 &bull; 08:30 AM IST</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748B;">Venue:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #0F172A;">Campus Innovation Hub, Main Auditorium, Bengaluru</td>
              </tr>
            </table>
          </div>

          <!-- 4. MIDDLE SECTION: Team Members Attendance Roster -->
          {team_members_html}

          <!-- 5. Important Event Check-In Guidelines -->
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin: 20px 0 28px 0; font-size: 12px; color: #475569; line-height: 1.6;">
            <strong style="color: #0F172A; font-size: 13px;">Important Event Check-In Guidelines:</strong>
            <ul style="margin: 6px 0 0 0; padding-left: 18px;">
              <li>Please have the check-in QR code below ready on your mobile device or printed copy at the entrance desk.</li>
              <li>Every team member must present their valid college/university photo identity card.</li>
              <li>The QR code PNG is also attached to this email as <code>synex_checkin_qr_{registration.public_id}.png</code> for offline access.</li>
              <li>Registration desk opens at 08:30 AM IST. Keynote and hackathon kickoff begins at 10:00 AM IST.</li>
            </ul>
          </div>

          <!-- 6. BOTTOM SECTION (DOWN TO THE INFORMATION): Dedicated Check-In Pass with Prominent QR Code -->
          <div style="border: 2px solid #2563EB; border-radius: 14px; background: #FFFFFF; overflow: hidden; margin-top: 10px; margin-bottom: 24px; box-shadow: 0 6px 20px rgba(37,99,235,0.12);">
            
            <!-- Pass Card Header -->
            <div style="background: linear-gradient(135deg, #1E40AF, #2563EB); color: #FFFFFF; padding: 14px 20px; text-align: center;">
              <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; opacity: 0.9;">Official Venue Check-In Pass</span>
              <div style="font-size: 18px; font-weight: 800; margin-top: 2px;">{team_name}</div>
              <div style="font-family: monospace; font-size: 12px; opacity: 0.85; margin-top: 2px;">Reference: {registration.public_id}</div>
            </div>

            <!-- Pass Card Body: Centered QR Code Image & Verification -->
            <div style="padding: 24px 20px; text-align: center; background: #F8FAFC;">
              
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #475569; font-weight: 500;">
                Scan this QR code at the reception desk to check in all <strong>{members_count} team members</strong>:
              </p>

              <!-- Prominent QR Code Image Container -->
              <div style="display: inline-block; background: #FFFFFF; border: 2px solid #CBD5E1; border-radius: 12px; padding: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
                <a href="{confirmation_pass_url}" target="_blank" style="text-decoration: none; display: block;" title="Click to view digital pass">
                  <img src="{qr_image_url}" alt="Check-In QR Code for {team_name}" width="220" height="220" style="display: block; margin: 0 auto; width: 220px; height: 220px; max-width: 100%; border: 0; outline: none; text-decoration: none;" />
                </a>
              </div>

              <!-- Valid For Check-In Status Badge -->
              <div style="margin-top: 14px;">
                <span style="display: inline-block; background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 14px; border-radius: 999px; letter-spacing: 0.5px;">
                  &#10003; Valid For Check-In &bull; Single-Use Only
                </span>
              </div>

              <!-- Single-Use Token Code -->
              <div style="margin-top: 10px; font-size: 12px; color: #64748B;">
                Single-Use Token:<br>
                <code style="font-family: monospace; font-size: 14px; font-weight: 800; color: #0F172A; background: #FFFFFF; border: 1px solid #CBD5E1; padding: 4px 12px; border-radius: 6px; display: inline-block; margin-top: 4px; letter-spacing: 0.5px;">{registration.checkin_token}</code>
              </div>

              <!-- Single-Use Warning Notice -->
              <div style="margin-top: 16px; padding: 10px 14px; background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 8px; font-size: 12px; color: #92400E; text-align: left; line-height: 1.5;">
                ⚠️ <strong>SINGLE-USE PASS:</strong> This QR code is strictly valid once. When scanned by an event coordinator at check-in, attendance will be recorded for your entire team ({members_count} members). Duplicate scan attempts will be rejected.
              </div>

              <!-- Online Digital Pass Link Button -->
              <div style="margin-top: 20px;">
                <a href="{confirmation_pass_url}" target="_blank" style="display: inline-block; background: #2563EB; color: #FFFFFF; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 8px rgba(37,99,235,0.25);">
                  View &amp; Print Digital Pass Online &rarr;
                </a>
              </div>

              <div style="font-size: 11px; color: #94A3B8; margin-top: 10px;">
                Pass Link: <a href="{confirmation_pass_url}" style="color: #2563EB;">{confirmation_pass_url}</a><br>
                <em>(The high-resolution QR image is also attached to this email as synex_checkin_qr_{registration.public_id}.png)</em>
              </div>

            </div>
          </div>

          <p style="margin-top: 24px; color: #64748B; font-size: 12px; line-height: 1.5; text-align: center;">
            Questions or support? Reply to this email or contact us at <a href="mailto:support@synex.org" style="color: #2563EB;">support@synex.org</a>.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #F8FAFC; padding: 16px 24px; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0;">
          &copy; 2026 {event_name} Organizing Committee &bull; Campus Innovation Hub, Bengaluru
        </div>
      </div>
    </body>
    </html>
    """

    # 7. Attach QR Code PNG for offline access
    attachments = []
    if qr_png_bytes:
        attachments.append({
            "filename": f"synex_checkin_qr_{registration.public_id}.png",
            "content_bytes": qr_png_bytes,
            "subtype": "png"
        })

    success, msg, log = send_email(
        to_email=recipient_email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
        email_type="confirmation",
        attachments=attachments,
    )

    if success:
        logger.info(f"Confirmation pass email with check-in QR successfully dispatched to team leader {recipient_email} ({registration.public_id})")
    else:
        logger.info(f"Confirmation pass email recorded/simulated for team leader {recipient_email} ({registration.public_id}): {msg}")

    return success
