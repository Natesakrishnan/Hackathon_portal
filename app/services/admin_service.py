import io
import csv
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from sqlalchemy import func, or_
from app.extensions import db
from app.models.registration import Registration
from app.models.participant import Participant
from app.models.team import Team, TeamMember
from app.models.payment import Payment

logger = logging.getLogger(__name__)


def sanitize_csv_cell(value: Any) -> str:
    """
    Prevents CSV / Excel Formula Injection by escaping characters like =, +, -, @.
    """
    if value is None:
        return ""
    val_str = str(value).strip()
    if val_str and val_str[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{val_str}"
    return val_str


def get_dashboard_metrics() -> Dict[str, Any]:
    """
    Computes real-time dashboard KPIs, revenue analytics, and domain distribution.
    """
    total_registrations = Registration.query.count()
    individual_count = Registration.query.filter_by(registration_type="individual").count()
    team_count = Registration.query.filter_by(registration_type="team").count()

    paid_count = Registration.query.filter_by(payment_status="paid").count()
    pending_count = Registration.query.filter(
        Registration.payment_status.in_(["unpaid", "pending"])
    ).count()
    failed_count = Registration.query.filter(
        Registration.payment_status.in_(["failed", "cancelled"])
    ).count()

    # Gross revenue from confirmed/paid registrations
    total_revenue_result = (
        db.session.query(func.sum(Registration.entry_fee))
        .filter(Registration.payment_status == "paid")
        .scalar()
    )
    gross_revenue = int(total_revenue_result) if total_revenue_result else 0

    # Total participants = individual participants + all members of teams that registered
    team_members_count = (
        db.session.query(func.count(TeamMember.id))
        .join(Team, TeamMember.team_id == Team.id)
        .join(Registration, Registration.team_id == Team.id)
        .scalar()
    ) or 0
    total_participants = individual_count + team_members_count

    # Domain breakdown
    domain_counts_query = (
        db.session.query(Registration.domain, func.count(Registration.id))
        .group_by(Registration.domain)
        .all()
    )
    domain_breakdown = {domain: count for domain, count in domain_counts_query}

    # Payment method breakdown
    payment_methods_query = (
        db.session.query(Payment.payment_method, func.count(Payment.id))
        .filter(Payment.status == "captured")
        .group_by(Payment.payment_method)
        .all()
    )
    payment_methods = {
        (method or "UPI"): count for method, count in payment_methods_query
    }
    if not payment_methods:
        payment_methods = {"UPI": paid_count}

    # Recent 10 registrations
    recent_records = (
        Registration.query.order_by(Registration.created_at.desc())
        .limit(10)
        .all()
    )
    recent_list = [r.to_dict(include_team_details=True) for r in recent_records]

    # Daily registration influx for past 7 days (including today)
    today = datetime.utcnow().date()
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]
    daily_labels = [d.strftime("%b %d") for d in days]

    daily_counts = []
    for d in days:
        start_dt = datetime.combine(d, datetime.min.time())
        end_dt = datetime.combine(d, datetime.max.time())
        cnt = Registration.query.filter(
            Registration.created_at >= start_dt,
            Registration.created_at <= end_dt
        ).count()
        daily_counts.append(cnt)

    daily_trends = {
        "labels": daily_labels,
        "counts": daily_counts,
        "total_past_7_days": sum(daily_counts),
    }

    return {
        "summary": {
            "total_registrations": total_registrations,
            "individual_registrations": individual_count,
            "team_registrations": team_count,
            "total_participants": total_participants,
            "paid_count": paid_count,
            "pending_count": pending_count,
            "failed_count": failed_count,
            "gross_revenue": gross_revenue,
            "currency": "INR",
        },
        "domain_breakdown": domain_breakdown,
        "payment_methods": payment_methods,
        "recent_registrations": recent_list,
        "daily_trends": daily_trends,
    }


def get_filtered_registrations(
    search: str = "",
    domain: str = "all",
    status: str = "all",
    reg_type: str = "all",
    page: int = 1,
    per_page: int = 25,
) -> Dict[str, Any]:
    """
    Returns filtered and paginated registrations.
    """
    query = Registration.query.join(Participant, Registration.participant_id == Participant.id)

    # Filter by domain
    if domain and domain != "all":
        query = query.filter(Registration.domain == domain)

    # Filter by payment or registration status
    if status and status != "all":
        if status in ("paid", "unpaid"):
            query = query.filter(Registration.payment_status == status)
        elif status in ("confirmed", "pending", "cancelled", "rejected"):
            query = query.filter(Registration.registration_status == status)

    # Filter by registration type
    if reg_type and reg_type != "all":
        query = query.filter(Registration.registration_type == reg_type)

    # Search query
    if search:
        search_term = f"%{search.strip()}%"
        query = query.outerjoin(Team, Registration.team_id == Team.id).filter(
            or_(
                Registration.public_id.ilike(search_term),
                Participant.full_name.ilike(search_term),
                Participant.email.ilike(search_term),
                Participant.phone.ilike(search_term),
                Participant.college.ilike(search_term),
                Team.team_name.ilike(search_term),
            )
        )

    # Order by newest
    query = query.order_by(Registration.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    items = [r.to_dict(include_team_details=True) for r in pagination.items]

    return {
        "registrations": items,
        "total": pagination.total,
        "pages": pagination.pages,
        "current_page": pagination.page,
        "per_page": pagination.per_page,
        "has_next": pagination.has_next,
        "has_prev": pagination.has_prev,
    }


def get_single_registration(ref_or_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves a single registration by public_id or integer ID."""
    if str(ref_or_id).isdigit():
        reg = Registration.query.get(int(ref_or_id))
    else:
        reg = Registration.query.filter_by(public_id=ref_or_id).first()

    return reg.to_dict(include_team_details=True) if reg else None


def update_registration_status(registration_id: int, new_status: str) -> Tuple[bool, str]:
    """Updates registration approval status."""
    valid_statuses = ["pending", "confirmed", "cancelled", "rejected"]
    if new_status not in valid_statuses:
        return False, f"Invalid status. Must be one of: {', '.join(valid_statuses)}"

    reg = Registration.query.get(registration_id)
    if not reg:
        return False, "Registration not found"

    reg.registration_status = new_status
    db.session.commit()
    logger.info(f"Admin updated registration {reg.public_id} status to {new_status}")
    return True, f"Registration status updated to {new_status}"


def export_registrations_csv() -> str:
    """
    Generates a secure CSV export with formula injection prevention.
    """
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Header
    headers = [
        "Registration ID",
        "Registration Type",
        "Team Name",
        "Participant / Leader Name",
        "Email",
        "Phone",
        "College",
        "Department",
        "Year of Study",
        "Domain",
        "Team Members Count",
        "Team Members Details",
        "Entry Fee (INR)",
        "Payment Status",
        "Registration Status",
        "Payment ID",
        "Registered At",
    ]
    writer.writerow([sanitize_csv_cell(h) for h in headers])

    registrations = Registration.query.order_by(Registration.created_at.desc()).all()

    for reg in registrations:
        p = reg.participant
        team_name = reg.team.team_name if reg.team else "N/A"
        members_count = len(reg.team.members) if reg.team else 1
        
        # Format team members details string
        if reg.team and reg.team.members:
            members_detail_str = "; ".join(
                f"{m.role.capitalize()}: {m.participant.full_name} ({m.participant.email}, {m.participant.phone})"
                for m in reg.team.members
            )
        else:
            members_detail_str = "N/A"

        latest_payment = reg.payments.order_by(Payment.id.desc()).first()
        payment_ref = latest_payment.gateway_payment_id if latest_payment else "N/A"

        row = [
            sanitize_csv_cell(reg.public_id),
            sanitize_csv_cell(reg.registration_type.capitalize()),
            sanitize_csv_cell(team_name),
            sanitize_csv_cell(p.full_name if p else "N/A"),
            sanitize_csv_cell(p.email if p else "N/A"),
            sanitize_csv_cell(p.phone if p else "N/A"),
            sanitize_csv_cell(p.college if p else "N/A"),
            sanitize_csv_cell(p.department if p else "N/A"),
            sanitize_csv_cell(p.year_of_study if p else "N/A"),
            sanitize_csv_cell(reg.domain),
            sanitize_csv_cell(members_count),
            sanitize_csv_cell(members_detail_str),
            sanitize_csv_cell(reg.entry_fee),
            sanitize_csv_cell(reg.payment_status.upper()),
            sanitize_csv_cell(reg.registration_status.upper()),
            sanitize_csv_cell(payment_ref),
            sanitize_csv_cell(reg.created_at.strftime("%Y-%m-%d %H:%M:%S")),
        ]
        writer.writerow(row)

    return output.getvalue()


def export_paid_participants_report_csv() -> str:
    """
    Generates a certified CSV report containing only participants who have completed
    entry fee payment, with transaction IDs, amounts, team roster details, and contact info.
    Protected against formula injection.
    """
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    headers = [
        "Registration ID",
        "Registration Type",
        "Domain Track",
        "Participant / Leader Name",
        "Email",
        "Phone",
        "College / Institution",
        "Department",
        "Year of Study",
        "Team Name",
        "Total Members",
        "Team Members Details",
        "Entry Fee Paid (INR)",
        "Payment Status",
        "Payment Method",
        "Gateway Payment ID",
        "Gateway Order ID",
        "Payment Captured At",
        "Registration Status",
        "Registered At",
    ]
    writer.writerow([sanitize_csv_cell(h) for h in headers])

    paid_registrations = (
        Registration.query.filter_by(payment_status="paid")
        .order_by(Registration.created_at.desc())
        .all()
    )

    for reg in paid_registrations:
        p = reg.participant
        team_name = reg.team.team_name if reg.team else "N/A"
        members_count = len(reg.team.members) if reg.team else 1

        if reg.team and reg.team.members:
            members_detail_str = "; ".join(
                f"{m.role.capitalize()}: {m.participant.full_name} ({m.participant.email}, {m.participant.phone}, {m.participant.college}, {m.participant.department})"
                for m in reg.team.members
            )
        else:
            members_detail_str = "N/A"

        successful_payment = (
            reg.payments.filter_by(status="captured")
            .order_by(Payment.id.desc())
            .first()
        )
        if not successful_payment:
            successful_payment = reg.payments.order_by(Payment.id.desc()).first()

        payment_id = successful_payment.gateway_payment_id if successful_payment else "N/A"
        order_id = successful_payment.gateway_order_id if successful_payment else "N/A"
        payment_method = (
            successful_payment.payment_method.upper()
            if (successful_payment and successful_payment.payment_method)
            else "ONLINE"
        )
        captured_at_str = (
            successful_payment.captured_at.strftime("%Y-%m-%d %H:%M:%S")
            if (successful_payment and successful_payment.captured_at)
            else "N/A"
        )

        row = [
            sanitize_csv_cell(reg.public_id),
            sanitize_csv_cell(reg.registration_type.capitalize()),
            sanitize_csv_cell(reg.domain),
            sanitize_csv_cell(p.full_name if p else "N/A"),
            sanitize_csv_cell(p.email if p else "N/A"),
            sanitize_csv_cell(p.phone if p else "N/A"),
            sanitize_csv_cell(p.college if p else "N/A"),
            sanitize_csv_cell(p.department if p else "N/A"),
            sanitize_csv_cell(p.year_of_study if p else "N/A"),
            sanitize_csv_cell(team_name),
            sanitize_csv_cell(members_count),
            sanitize_csv_cell(members_detail_str),
            sanitize_csv_cell(reg.entry_fee),
            sanitize_csv_cell("PAID"),
            sanitize_csv_cell(payment_method),
            sanitize_csv_cell(payment_id),
            sanitize_csv_cell(order_id),
            sanitize_csv_cell(captured_at_str),
            sanitize_csv_cell(reg.registration_status.upper()),
            sanitize_csv_cell(reg.created_at.strftime("%Y-%m-%d %H:%M:%S")),
        ]
        writer.writerow(row)

    return output.getvalue()


def export_summary_report_csv() -> str:
    """
    Generates an Executive Financial & Registration Summary CSV report
    computed strictly from actual database records with formula injection protection.
    """
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Overview Metadata
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    writer.writerow([sanitize_csv_cell("SYNEX 2026 Hackathon — Executive & Financial Report")])
    writer.writerow([sanitize_csv_cell("Generated At"), sanitize_csv_cell(now_str)])
    writer.writerow([sanitize_csv_cell("Data Source"), sanitize_csv_cell("Production MySQL Database (Real Records)")])
    writer.writerow([])

    # Metrics
    metrics = get_dashboard_metrics()
    s = metrics["summary"]

    total_regs = s["total_registrations"]
    paid_regs = s["paid_count"]
    gross_revenue = s["gross_revenue"]
    conversion_rate = f"{(paid_regs / total_regs * 100):.1f}%" if total_regs > 0 else "0.0%"
    avg_revenue = f"₹{(gross_revenue / paid_regs):.2f}" if paid_regs > 0 else "₹0.00"

    confirmed_count = Registration.query.filter_by(registration_status="confirmed").count()
    cancelled_count = Registration.query.filter(
        Registration.registration_status.in_(["cancelled", "rejected"])
    ).count()

    writer.writerow([
        sanitize_csv_cell("Metric / KPI"),
        sanitize_csv_cell("Value"),
        sanitize_csv_cell("Unit / Currency"),
        sanitize_csv_cell("Description / Methodology"),
    ])

    rows = [
        ("Total Registrations", total_regs, "Slots", "Total individual and team registrations"),
        ("Individual Registrations", s["individual_registrations"], "Participants", "Solo participant registrations"),
        ("Team Registrations", s["team_registrations"], "Teams", "Registered team slots"),
        ("Total Participating Hackers", s["total_participants"], "Persons", "Individual participants + verified team members"),
        ("Paid Registrations", paid_regs, "Slots", "Confirmed payments captured via gateway"),
        ("Pending / Unpaid Registrations", s["pending_count"], "Slots", "Awaiting online payment"),
        ("Failed Transactions", s["failed_count"], "Transactions", "Payment failed or timed out"),
        ("Confirmed Registrations", confirmed_count, "Registrations", "Admin approved & confirmed participant slots"),
        ("Cancelled / Rejected", cancelled_count, "Registrations", "Cancelled or rejected registrations"),
        ("Gross Verified Revenue", gross_revenue, "INR (₹)", "Actual collected entry fees from confirmed paid registrations"),
        ("Payment Conversion Rate", conversion_rate, "Percentage", "Percentage of registrations with completed payment"),
        ("Average Revenue per Paid Reg", avg_revenue, "INR (₹)", "Mean fee per successful registration"),
    ]

    for metric, val, unit, desc in rows:
        writer.writerow([
            sanitize_csv_cell(metric),
            sanitize_csv_cell(val),
            sanitize_csv_cell(unit),
            sanitize_csv_cell(desc),
        ])

    return output.getvalue()


def export_domain_report_csv() -> str:
    """
    Generates a Domain & Innovation Track Distribution CSV report
    with participant breakdown and actual collected revenue per track.
    """
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    writer.writerow([sanitize_csv_cell("SYNEX 2026 Hackathon — Innovation Domain Distribution Report")])
    writer.writerow([sanitize_csv_cell("Generated At"), sanitize_csv_cell(now_str)])
    writer.writerow([])

    headers = [
        "Innovation Domain Track",
        "Total Registrations",
        "Individual Registrations",
        "Team Registrations",
        "Paid Registrations",
        "Unpaid / Pending",
        "Verified Revenue (INR)",
    ]
    writer.writerow([sanitize_csv_cell(h) for h in headers])

    # Distinct domains
    domains_query = db.session.query(Registration.domain).distinct().all()
    domains = [d[0] for d in domains_query if d[0]]
    domains.sort()

    for domain in domains:
        total = Registration.query.filter_by(domain=domain).count()
        indiv = Registration.query.filter_by(domain=domain, registration_type="individual").count()
        team = Registration.query.filter_by(domain=domain, registration_type="team").count()
        paid = Registration.query.filter_by(domain=domain, payment_status="paid").count()
        pending = Registration.query.filter(
            Registration.domain == domain,
            Registration.payment_status.in_(["unpaid", "pending"])
        ).count()
        rev_result = (
            db.session.query(func.sum(Registration.entry_fee))
            .filter(Registration.domain == domain, Registration.payment_status == "paid")
            .scalar()
        )
        rev = int(rev_result) if rev_result else 0

        writer.writerow([
            sanitize_csv_cell(domain),
            sanitize_csv_cell(total),
            sanitize_csv_cell(indiv),
            sanitize_csv_cell(team),
            sanitize_csv_cell(paid),
            sanitize_csv_cell(pending),
            sanitize_csv_cell(rev),
        ])

    return output.getvalue()


def reset_participant_records() -> Dict[str, Any]:
    """
    Permanently deletes all participant registrations, teams, members, and payment records.
    Preserves admins, event_settings, announcements, and contact messages.
    """
    try:
        deleted_payments = Payment.query.delete()
        deleted_registrations = Registration.query.delete()
        deleted_team_members = TeamMember.query.delete()
        deleted_teams = Team.query.delete()
        deleted_participants = Participant.query.delete()
        db.session.commit()

        logger.info(
            f"Reset participants: {deleted_participants} participants, "
            f"{deleted_teams} teams, {deleted_registrations} registrations, "
            f"{deleted_payments} payments deleted."
        )

        return {
            "success": True,
            "message": "All participant and registration records have been successfully reset.",
            "deleted_counts": {
                "participants": deleted_participants,
                "teams": deleted_teams,
                "team_members": deleted_team_members,
                "registrations": deleted_registrations,
                "payments": deleted_payments,
            },
        }
    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to reset participant records: {e}")
        return {
            "success": False,
            "error": f"Failed to reset records: {str(e)}",
        }

