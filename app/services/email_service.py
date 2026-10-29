import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import current_app

logger = logging.getLogger(__name__)


def send_confirmation_email(registration, payment) -> bool:
    """
    Sends a registration and payment receipt confirmation email.
    Safely falls back to logger output if SMTP credentials are not configured.
    """
    recipient_email = registration.participant.email if registration.participant else None
    recipient_name = registration.participant.full_name if registration.participant else "Participant"

    if not recipient_email:
        logger.warning(f"No recipient email found for registration {registration.public_id}")
        return False

    event_name = current_app.config.get("EVENT_NAME", "SYNEX 2026")
    subject = f"Registration Confirmed: {registration.public_id} - {event_name}"

    team_info_html = ""
    if registration.registration_type == "team" and registration.team:
        members_html = "".join(
            f"<li><strong>{m.role.capitalize()}:</strong> {m.participant.full_name} ({m.participant.email})</li>"
            for m in registration.team.members
        )
        team_info_html = f"""
        <div style="margin-top: 15px; padding: 12px; background: #F0F7FF; border-radius: 8px;">
            <p style="margin: 0 0 8px 0; font-weight: 600; color: #1E40AF;">Team: {registration.team.team_name}</p>
            <ul style="margin: 0; padding-left: 20px; color: #374151;">
                {members_html}
            </ul>
        </div>
        """

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Inter', Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 24px;">
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

                <div style="margin-top: 24px; border-top: 1px solid #E2E8F0; padding-top: 20px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #1E293B;">Key Hackathon Details:</h3>
                    <ul style="color: #4B5563; line-height: 1.8; margin: 0; padding-left: 20px; font-size: 14px;">
                        <li><strong>Dates:</strong> March 15–16, 2026 (Reporting by 08:30 AM IST)</li>
                        <li><strong>Venue:</strong> Tech Park Convention Center, Campus Auditorium, Bangalore</li>
                        <li><strong>Things to Bring:</strong> College ID card, Laptop & charger, Extension board</li>
                    </ul>
                </div>

                <p style="margin-top: 28px; color: #64748B; font-size: 13px; line-height: 1.5;">
                    If you have any questions, reach out to us at <a href="mailto:support@synex.org" style="color: #2563EB;">support@synex.org</a>.
                </p>
            </div>

            <div style="background: #F1F5F9; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748B;">
                © 2026 SYNEX Hackathon Committee. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    """

    # Check if SMTP credentials are provided
    mail_user = current_app.config.get("MAIL_USERNAME")
    mail_pass = current_app.config.get("MAIL_PASSWORD")
    mail_server = current_app.config.get("MAIL_SERVER")
    mail_port = current_app.config.get("MAIL_PORT", 587)

    if not mail_user or not mail_pass:
        # Development / Testing: Log email body
        logger.info(
            f"\n--- [MOCK EMAIL DISPATCH] ---\n"
            f"To: {recipient_email}\n"
            f"Subject: {subject}\n"
            f"Registration Ref: {registration.public_id}\n"
            f"Payment ID: {payment.gateway_payment_id if payment else 'N/A'}\n"
            f"-----------------------------\n"
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = current_app.config.get("MAIL_DEFAULT_SENDER", mail_user)
        msg["To"] = recipient_email
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(mail_server, mail_port) as server:
            if current_app.config.get("MAIL_USE_TLS"):
                server.starttls()
            server.login(mail_user, mail_pass)
            server.sendmail(msg["From"], [recipient_email], msg.as_string())

        logger.info(f"Confirmation email sent to {recipient_email} for registration {registration.public_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email via SMTP to {recipient_email}: {e}")
        return False
