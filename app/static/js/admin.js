/**
 * SYNEX HACKATHON — ADMIN DASHBOARD JAVASCRIPT (admin.js)
 * Live backend integration for metrics, registration table,
 * domain filtering, search, status management, team details modal,
 * Chart.js analytics, and formula-safe CSV export.
 */

let currentDomainFilter = "all";
let currentStatusFilter = "all";
let currentSearchQuery = "";
let currentPage = 1;
let trendsChartInstance = null;
let paymentChartInstance = null;
let domainChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  initAdminDashboard();
});

async function initAdminDashboard() {
  // Check auth and fetch dashboard metrics
  const isAuthenticated = await checkAuthAndLoadMetrics();
  if (!isAuthenticated) return;

  // Setup DOM Event Listeners
  setupEventListeners();

  // Load initial registration table data
  await loadRegistrationsTable();

  // Load announcements history and event settings
  await loadRecentAnnouncements();
  await loadEventSettings();
}

/**
 * Checks session auth and loads top-level metrics
 */
async function checkAuthAndLoadMetrics() {
  try {
    const res = await fetch("/api/admin/dashboard", {
      headers: { "Accept": "application/json" }
    });

    if (res.status === 401) {
      window.location.href = "/admin/login";
      return false;
    }

    if (!res.ok) {
      console.error("Dashboard metrics request returned status:", res.status);
      return false;
    }

    const json = await res.json();
    if (json.success && json.data) {
      updateDashboardKPIs(json.data.summary);
      initCharts(
        json.data.domain_breakdown,
        json.data.summary,
        json.data.payment_methods,
        json.data.daily_trends
      );
      return true;
    }
  } catch (err) {
    console.error("Failed to load admin dashboard metrics:", err);
  }
  return true;
}

/**
 * Updates KPI Summary Cards and chart header badges
 */
function updateDashboardKPIs(summary) {
  if (!summary) return;

  // 6 Metric Cards
  const totalRegEl = document.getElementById("metricTotalRegs") || document.getElementById("statTotalRegistrations");
  const paidEl = document.getElementById("metricPaidRegs") || document.getElementById("statPaidCount");
  const pendingEl = document.getElementById("metricPendingRegs") || document.getElementById("statPendingCount");
  const failedEl = document.getElementById("metricFailedRegs") || document.getElementById("statFailedCount");
  const revenueEl = document.getElementById("metricGrossRevenue") || document.getElementById("statTotalRevenue");
  const teamsEl = document.getElementById("metricTotalTeams") || document.getElementById("statTotalParticipants");

  if (totalRegEl) totalRegEl.textContent = summary.total_registrations ?? 0;
  if (paidEl) paidEl.textContent = summary.paid_count ?? 0;
  if (pendingEl) pendingEl.textContent = summary.pending_count ?? 0;
  if (failedEl) failedEl.textContent = summary.failed_count ?? 0;
  if (revenueEl) revenueEl.textContent = `₹${(summary.gross_revenue || 0).toLocaleString("en-IN")}`;
  if (teamsEl) teamsEl.textContent = summary.team_registrations ?? 0;

  // Badges
  const badgePaid = document.getElementById("badgePaymentPaid");
  if (badgePaid) badgePaid.textContent = `${summary.paid_count || 0} Paid`;

  const badgeTrend = document.getElementById("badgeDailyTrend");
  if (badgeTrend) badgeTrend.textContent = `${summary.total_registrations || 0} Total`;
}

/**
 * Initializes or updates Chart.js charts: Influx Line, Payment Donut, Domain Bar
 */
function initCharts(domainBreakdown, summary, paymentMethods, dailyTrends) {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js library not detected on window.");
    return;
  }

  // 1. Daily Registration Influx (Past 7 Days)
  const trendsCanvas = document.getElementById("trendsChart");
  if (trendsCanvas) {
    const defaultLabels = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Today"];
    const labels = (dailyTrends && Array.isArray(dailyTrends.labels) && dailyTrends.labels.length)
      ? dailyTrends.labels
      : defaultLabels;
    const counts = (dailyTrends && Array.isArray(dailyTrends.counts) && dailyTrends.counts.length)
      ? dailyTrends.counts
      : [0, 0, 0, 0, 0, 0, summary ? summary.total_registrations || 0 : 0];

    if (trendsChartInstance) trendsChartInstance.destroy();

    trendsChartInstance = new Chart(trendsCanvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Daily Registrations",
          data: counts,
          borderColor: "#2563EB",
          backgroundColor: "rgba(37, 99, 235, 0.08)",
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: "#2563EB",
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `Registrations: ${context.parsed.y}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0, stepSize: 1 },
            grid: { color: "#F1F5F9" }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  // 2. Payment Status Distribution (Doughnut)
  const paymentCanvas = document.getElementById("paymentStatusChart") || document.getElementById("paymentChart");
  if (paymentCanvas) {
    const paid = summary ? (summary.paid_count || 0) : 0;
    const pending = summary ? (summary.pending_count || 0) : 0;
    const failed = summary ? (summary.failed_count || 0) : 0;

    if (paymentChartInstance) paymentChartInstance.destroy();

    paymentChartInstance = new Chart(paymentCanvas, {
      type: "doughnut",
      data: {
        labels: [`Paid (${paid})`, `Pending (${pending})`, `Failed (${failed})`],
        datasets: [{
          data: [paid, pending, failed],
          backgroundColor: ["#16A34A", "#F59E0B", "#DC2626"],
          borderWidth: 2,
          borderColor: "#FFFFFF"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, font: { size: 11 } }
          }
        },
        cutout: "70%"
      }
    });
  }

  // 3. Registrations Across 8 Innovation Domains (Bar)
  const domainCanvas = document.getElementById("domainChart");
  if (domainCanvas) {
    const allDomains = [
      "Artificial Intelligence & Machine Learning",
      "Web Development",
      "Cybersecurity",
      "Internet of Things (IoT)",
      "Healthcare Technology",
      "Financial Technology (FinTech)",
      "Smart Cities & Sustainability",
      "Open Innovation"
    ];

    const shortLabels = [
      "AI / ML",
      "Web Dev",
      "Cyber",
      "IoT",
      "Health",
      "FinTech",
      "Smart Cities",
      "Open Innov"
    ];

    const counts = allDomains.map((domainName) => {
      if (domainBreakdown && domainBreakdown[domainName] !== undefined) {
        return domainBreakdown[domainName];
      }
      for (const [k, v] of Object.entries(domainBreakdown || {})) {
        if (k.toLowerCase().includes(domainName.toLowerCase()) || domainName.toLowerCase().includes(k.toLowerCase())) {
          return v;
        }
      }
      return 0;
    });

    if (domainChartInstance) domainChartInstance.destroy();

    domainChartInstance = new Chart(domainCanvas, {
      type: "bar",
      data: {
        labels: shortLabels,
        datasets: [{
          label: "Teams & Hackers",
          data: counts,
          backgroundColor: "#7C3AED",
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => allDomains[items[0].dataIndex] || "",
              label: (context) => `Registrations: ${context.parsed.y}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0, stepSize: 1 },
            grid: { color: "#F1F5F9" }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }
}

/**
 * Loads registrations from backend API with filtering & pagination
 */
async function loadRegistrationsTable() {
  const tbody = document.getElementById("registrationsTableBody") || document.getElementById("registrationTableBody");
  if (!tbody) {
    console.warn("Registrations table body element not found.");
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="9" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem; color: #2563EB;"></i>
        <div>Loading registration records from database...</div>
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams({
      page: currentPage,
      per_page: 25,
      domain: currentDomainFilter,
      status: currentStatusFilter,
      search: currentSearchQuery,
    });

    const res = await fetch(`/api/admin/registrations?${params.toString()}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }

    const json = await res.json();
    if (!res.ok || !json.success) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 2rem; color: #DC2626;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
            <div>Failed to load registrations: ${escapeHtml(json.error || "Unknown server error")}</div>
          </td>
        </tr>
      `;
      return;
    }

    renderTableRows(json.data.registrations, json.data);
  } catch (err) {
    console.error("Error loading registrations table:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: #DC2626;">
          <i class="fa-solid fa-wifi" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
          <div>Connection error. Please verify the Flask server is running.</div>
        </td>
      </tr>
    `;
  }
}

/**
 * Renders registration table rows
 */
function renderTableRows(records, meta) {
  const tbody = document.getElementById("registrationsTableBody") || document.getElementById("registrationTableBody");
  const countEl = document.getElementById("tableShowingCount") || document.getElementById("resultsCountBadge");

  if (countEl && meta) {
    const count = records ? records.length : 0;
    const total = meta.total || count;
    countEl.textContent = count === 0
      ? "No records found"
      : `Showing ${count} of ${total} records (Page ${meta.page || 1} of ${meta.pages || 1})`;
  }

  // Update pagination button states
  const prevBtn = document.getElementById("btnPrevPage");
  const nextBtn = document.getElementById("btnNextPage");
  if (prevBtn) {
    const canPrev = (currentPage > 1);
    prevBtn.disabled = !canPrev;
    prevBtn.style.opacity = canPrev ? "1" : "0.5";
  }
  if (nextBtn && meta) {
    const canNext = (currentPage < (meta.pages || 1));
    nextBtn.disabled = !canNext;
    nextBtn.style.opacity = canNext ? "1" : "0.5";
  }

  if (!records || records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 3rem 1rem; color: var(--color-text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.4;"><i class="fa-regular fa-folder-open"></i></div>
          <div style="font-weight: 600; color: var(--color-text-main);">No matching registrations found</div>
          <div style="font-size: 0.85rem; margin-top: 0.25rem;">Try adjusting your search query or domain filters.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";

  records.forEach((reg) => {
    const tr = document.createElement("tr");

    const isTeam = reg.registration_type === "team";
    const pName = reg.participant ? reg.participant.full_name : "N/A";
    const pEmail = reg.participant ? reg.participant.email : "";
    const college = reg.participant ? reg.participant.college : "N/A";
    const teamName = reg.team ? reg.team.team_name : (reg.team_name || "Team");
    const membersCount = reg.team && reg.team.members ? reg.team.members.length : (isTeam ? 2 : 1);

    // Participant / Team Column
    let nameHtml = "";
    if (isTeam) {
      nameHtml = `
        <div style="display: flex; flex-direction: column;">
          <button type="button" class="btn-team-link" data-ref="${escapeHtml(reg.public_id)}" style="background: none; border: none; padding: 0; color: #2563EB; font-weight: 700; text-align: left; cursor: pointer; text-decoration: underline; font-size: 0.9rem;">
            <i class="fa-solid fa-users" style="font-size: 0.8rem; margin-right: 4px;"></i>${escapeHtml(teamName)}
          </button>
          <span style="font-size: 0.75rem; color: var(--color-text-secondary); margin-top: 2px;">
            Lead: ${escapeHtml(pName)} • ${membersCount} Members
          </span>
        </div>
      `;
    } else {
      nameHtml = `
        <div style="display: flex; flex-direction: column;">
          <button type="button" class="btn-team-link" data-ref="${escapeHtml(reg.public_id)}" style="background: none; border: none; padding: 0; text-align: left; cursor: pointer;">
            <strong style="color: var(--color-text-main); font-size: 0.9rem;">${escapeHtml(pName)}</strong>
          </button>
          <span style="font-size: 0.75rem; color: var(--color-text-secondary);">${escapeHtml(pEmail)}</span>
        </div>
      `;
    }

    // Payment Status Badge
    let paymentBadge = "";
    if (reg.payment_status === "paid") {
      paymentBadge = `<span class="badge badge-success" style="background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; font-weight: 600; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem;"><i class="fa-solid fa-circle-check" style="margin-right: 4px;"></i>Paid</span>`;
    } else if (reg.payment_status === "failed") {
      paymentBadge = `<span class="badge badge-danger" style="background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; font-weight: 600; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem;"><i class="fa-solid fa-circle-xmark" style="margin-right: 4px;"></i>Failed</span>`;
    } else {
      paymentBadge = `<span class="badge badge-warning" style="background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; font-weight: 600; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem;"><i class="fa-solid fa-clock" style="margin-right: 4px;"></i>Pending</span>`;
    }

    // Registration Status Dropdown / Action
    const regStatus = reg.registration_status || "pending";
    const statusSelect = `
      <select class="reg-status-select" data-id="${reg.id}" style="padding: 4px 8px; font-size: 0.78rem; border-radius: 4px; border: 1px solid #CBD5E1; background: #FFFFFF; font-weight: 500;">
        <option value="pending" ${regStatus === "pending" ? "selected" : ""}>Pending</option>
        <option value="confirmed" ${regStatus === "confirmed" ? "selected" : ""}>Confirmed</option>
        <option value="rejected" ${regStatus === "rejected" ? "selected" : ""}>Rejected</option>
        <option value="cancelled" ${regStatus === "cancelled" ? "selected" : ""}>Cancelled</option>
      </select>
    `;

    const formattedDate = reg.created_at ? reg.created_at.replace("T", " ").substring(0, 16) : "N/A";

    tr.innerHTML = `
      <td><span class="ref-badge" style="font-family: monospace; font-weight: 700; color: #1E40AF; background: #EFF6FF; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${escapeHtml(reg.public_id)}</span></td>
      <td>${nameHtml}</td>
      <td><span class="badge ${isTeam ? 'badge-primary' : 'badge-secondary'}" style="font-size: 0.75rem; padding: 2px 8px; border-radius: 4px;">${isTeam ? "Team" : "Solo"}</span></td>
      <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.82rem; color: #475569;" title="${escapeHtml(college)}">${escapeHtml(college)}</td>
      <td><span class="domain-tag" style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; background: #F1F5F9; color: #334155; font-weight: 500;">${escapeHtml(reg.domain)}</span></td>
      <td style="font-weight: 700; font-size: 0.85rem; color: #1E293B;">₹${reg.entry_fee}</td>
      <td>${paymentBadge}</td>
      <td>${statusSelect}</td>
      <td style="font-size: 0.75rem; color: #64748B;">${formattedDate}</td>
    `;

    tbody.appendChild(tr);
  });

  // Bind clickable team detail links
  tbody.querySelectorAll(".btn-team-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ref = btn.getAttribute("data-ref");
      openTeamDetailsModal(ref);
    });
  });

  // Bind status change selects
  tbody.querySelectorAll(".reg-status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const regId = select.getAttribute("data-id");
      const newStatus = select.value;
      await updateRegistrationStatusOnServer(regId, newStatus, select);
    });
  });
}

/**
 * Updates status via PATCH /api/admin/registrations/<id>/status
 */
async function updateRegistrationStatusOnServer(id, status, selectEl) {
  try {
    const res = await fetch(`/api/admin/registrations/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      alert(data.error || "Failed to update registration status.");
    }
  } catch (err) {
    console.error("Status update error:", err);
    alert("Connection error while updating status.");
  }
}

/**
 * Opens Team & Participant Details Modal with full roster
 */
async function openTeamDetailsModal(ref) {
  const modal = document.getElementById("teamDetailsModal");
  if (!modal) return;

  const modalTeamName = document.getElementById("modalTeamName");
  const modalTeamRef = document.getElementById("modalTeamRef");
  const modalTeamDomain = document.getElementById("modalTeamDomain");
  const modalTeamCollege = document.getElementById("modalTeamCollege");
  const modalTeamType = document.getElementById("modalTeamType");
  const modalTeamFee = document.getElementById("modalTeamFee");
  const modalLeaderName = document.getElementById("modalLeaderName");
  const modalLeaderEmail = document.getElementById("modalLeaderEmail");
  const modalLeaderMobile = document.getElementById("modalLeaderMobile");
  const modalLeaderDept = document.getElementById("modalLeaderDept");
  const modalMembersList = document.getElementById("modalMembersList");
  const modalMembersCountTitle = document.getElementById("modalMembersCountTitle");

  if (modalTeamName) modalTeamName.textContent = "Loading Details...";
  if (modalTeamRef) modalTeamRef.textContent = `ID: ${ref}`;
  if (modalMembersList) modalMembersList.innerHTML = `<div style="padding: 1rem; text-align: center; color: #64748B;">Fetching verified participant records...</div>`;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  try {
    const res = await fetch(`/api/admin/registrations/${ref}`);
    const json = await res.json();

    if (!res.ok || !json.success) {
      if (modalTeamName) modalTeamName.textContent = "Error loading details";
      return;
    }

    const reg = json.registration;
    const isTeam = reg.registration_type === "team";
    const team = reg.team || {};
    const leader = reg.participant || {};
    const members = team.members ? team.members.filter(m => m.role !== "leader") : [];

    if (modalTeamName) modalTeamName.textContent = isTeam ? (team.team_name || "Team Squad") : leader.full_name;
    if (modalTeamRef) modalTeamRef.textContent = `ID: ${reg.public_id}`;
    if (modalTeamDomain) modalTeamDomain.textContent = reg.domain || "AI & Machine Learning";
    if (modalTeamCollege) modalTeamCollege.textContent = leader.college || "N/A";
    if (modalTeamType) modalTeamType.textContent = isTeam ? `Team (${(members.length + 1)} Members)` : "Individual (Solo Hacker)";
    if (modalTeamFee) modalTeamFee.textContent = `₹${reg.entry_fee} (${(reg.payment_status || "UNPAID").toUpperCase()})`;

    if (modalLeaderName) modalLeaderName.textContent = leader.full_name || "Leader Name";
    if (modalLeaderEmail) modalLeaderEmail.textContent = leader.email || "N/A";
    if (modalLeaderMobile) modalLeaderMobile.textContent = leader.phone || "N/A";
    if (modalLeaderDept) modalLeaderDept.textContent = `${leader.department || "Department"} • ${leader.year_of_study || ""}`;

    if (modalMembersCountTitle) {
      modalMembersCountTitle.textContent = isTeam ? `Team Members (${members.length})` : "Team Members (0)";
    }

    if (modalMembersList) {
      if (!isTeam) {
        modalMembersList.innerHTML = `
          <div style="background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 1.25rem; text-align: center; color: #64748B; font-size: 0.85rem;">
            <i class="fa-solid fa-user" style="color: #2563EB; font-size: 1.25rem; margin-bottom: 0.35rem; display: block;"></i>
            <strong>Solo Hacker Registration</strong><br>
            This participant registered individually and has no secondary team members.
          </div>
        `;
      } else if (members.length === 0) {
        modalMembersList.innerHTML = `<div style="color: #64748B; font-size: 0.85rem; font-style: italic; padding: 0.5rem 0;">No secondary team members added.</div>`;
      } else {
        modalMembersList.innerHTML = members.map((m, idx) => `
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="color: #1E293B; font-size: 0.92rem;">${escapeHtml(m.name || "Member")}</strong>
              <span style="background: #EFF6FF; color: #1E40AF; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;">MEMBER ${idx + 2}</span>
            </div>
            <div style="font-size: 0.82rem; color: #475569; line-height: 1.5;">
              <div><i class="fa-solid fa-envelope" style="width: 16px; color: #64748B;"></i> ${escapeHtml(m.email)}</div>
              ${m.phone ? `<div><i class="fa-solid fa-phone" style="width: 16px; color: #64748B;"></i> ${escapeHtml(m.phone)}</div>` : ''}
              ${m.department ? `<div><i class="fa-solid fa-graduation-cap" style="width: 16px; color: #64748B;"></i> ${escapeHtml(m.department)} ${m.year_of_study ? '• ' + escapeHtml(m.year_of_study) : ''}</div>` : ''}
            </div>
          </div>
        `).join("");
      }
    }
  } catch (err) {
    console.error("Modal load error:", err);
  }
}

/**
 * Setup Event Listeners for search, filters, pagination, and modals
 */
function setupEventListeners() {
  // Search Input with Debounce
  const searchInput = document.getElementById("tableSearchInput") || document.getElementById("adminSearchInput");
  let searchTimeout = null;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearchQuery = e.target.value.trim();
        currentPage = 1;
        loadRegistrationsTable();
      }, 250);
    });
  }

  // Domain Filter Dropdown
  const domainFilter = document.getElementById("tableDomainFilter") || document.getElementById("domainFilterSelect");
  if (domainFilter) {
    domainFilter.addEventListener("change", (e) => {
      currentDomainFilter = e.target.value;
      currentPage = 1;
      loadRegistrationsTable();
    });
  }

  // Payment / Registration Status Filter Dropdown
  const statusFilter = document.getElementById("tableStatusFilter");
  if (statusFilter) {
    statusFilter.addEventListener("change", (e) => {
      currentStatusFilter = e.target.value;
      currentPage = 1;
      loadRegistrationsTable();
    });
  }

  // Status Filter Buttons (if present)
  const statusButtons = document.querySelectorAll(".status-filter-btn");
  statusButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      statusButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentStatusFilter = btn.getAttribute("data-status") || "all";
      currentPage = 1;
      loadRegistrationsTable();
    });
  });

  // Pagination buttons
  const prevBtn = document.getElementById("btnPrevPage");
  const nextBtn = document.getElementById("btnNextPage");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        loadRegistrationsTable();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      currentPage++;
      loadRegistrationsTable();
    });
  }

  // Modal Close handler
  function closeModal() {
    const modal = document.getElementById("teamDetailsModal");
    if (modal) {
      modal.classList.remove("active");
      document.body.style.overflow = "";
    }
  }

  const modalCloseBtn = document.getElementById("btnCloseTeamModal") || document.getElementById("btnModalClose");
  const modalFooterCloseBtn = document.getElementById("btnModalFooterClose");
  const modal = document.getElementById("teamDetailsModal");

  [modalCloseBtn, modalFooterCloseBtn].forEach((btn) => {
    if (btn) btn.addEventListener("click", closeModal);
  });

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("active")) {
      closeModal();
    }
  });

  // CSV Export Button
  const btnExportCsv = document.getElementById("btnExportCsv");
  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", () => {
      window.location.href = "/api/admin/reports/registrations.csv";
    });
  }

  // Logout Buttons
  const logoutBtns = document.querySelectorAll(".btn-admin-logout, #btnLogoutAdmin");
  logoutBtns.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch("/api/admin/logout", { method: "POST" });
      } catch (e) {}
      sessionStorage.removeItem("synex_admin_logged_in");
      window.location.href = "/admin/login";
    });
  });

  // Wire Announcements, Reports, Settings, Reset, and Public Content handlers
  setupAnnouncementHandlers();
  setupReportDownloadHandlers();
  setupSettingsHandlers();
  setupResetParticipantsHandlers();
  setupPublicContentEditorHandlers();
}

function escapeHtml(text) {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * FEATURE 1: Announcement Management Handlers
 */
async function loadRecentAnnouncements() {
  const tbody = document.getElementById("announcementsHistoryBody");
  if (!tbody) return;

  try {
    const res = await fetch("/api/admin/announcements");
    if (!res.ok) throw new Error("Failed to load announcements");
    const json = await res.json();
    if (!json.success || !json.announcements || json.announcements.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 1.5rem;">No announcements broadcast yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = json.announcements.map((a) => {
      let statusHtml = "";
      if (a.discord_sent) {
        statusHtml += `<span class="badge badge-success" style="font-size: 0.72rem; margin-right: 4px;"><i class="fa-brands fa-discord"></i> Discord</span>`;
      }
      if (a.email_sent) {
        statusHtml += `<span class="badge badge-success" style="font-size: 0.72rem; margin-right: 4px;"><i class="fa-solid fa-envelope"></i> Email</span>`;
      }
      if (!a.discord_sent && !a.email_sent) {
        statusHtml = `<span class="badge badge-warning" style="font-size: 0.72rem;"><i class="fa-solid fa-circle-info"></i> ${escapeHtml(a.delivery_status || "Logged (Unconfigured)")}</span>`;
      } else {
        statusHtml += `<div style="font-size: 0.72rem; color: var(--color-text-muted); margin-top: 3px;">${escapeHtml(a.delivery_status || "")}</div>`;
      }

      return `
        <tr>
          <td><strong style="color: var(--color-text-main);">${escapeHtml(a.title)}</strong></td>
          <td><span style="color: var(--color-text-secondary); font-size: 0.82rem;">${escapeHtml(a.message.length > 90 ? a.message.substring(0, 90) + '...' : a.message)}</span></td>
          <td><span class="badge badge-secondary" style="font-size: 0.72rem; text-transform: capitalize;">${escapeHtml(a.target_audience)}</span></td>
          <td>${statusHtml}</td>
          <td style="color: var(--color-text-muted); font-size: 0.78rem;">${escapeHtml(a.created_at || 'Just now')}</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Error loading announcements:", err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-error); padding: 1.5rem;">Failed to load announcements log.</td></tr>`;
  }
}

function setupAnnouncementHandlers() {
  const form = document.getElementById("announcementForm");
  const msgInput = document.getElementById("announcementMessage");
  const charCounter = document.getElementById("announcementCharCount");
  const banner = document.getElementById("announcementAlertBanner");

  if (msgInput && charCounter) {
    msgInput.addEventListener("input", () => {
      charCounter.textContent = `${msgInput.value.length} / 5000`;
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("announcementTitle").value.trim();
      const message = document.getElementById("announcementMessage").value.trim();
      const targetAudience = document.getElementById("announcementAudience").value;
      const sendDiscord = document.getElementById("announcementSendDiscord").checked;
      const sendEmail = document.getElementById("announcementSendEmail").checked;
      const submitBtn = document.getElementById("btnSendAnnouncement");

      if (title.length < 3) {
        showBanner(banner, "Announcement title must be at least 3 characters.", "error");
        return;
      }
      if (message.length < 5) {
        showBanner(banner, "Announcement message must be at least 5 characters.", "error");
        return;
      }
      if (!sendDiscord && !sendEmail) {
        showBanner(banner, "Please select at least one dispatch channel (Discord or Email).", "error");
        return;
      }

      // Loading state
      submitBtn.disabled = true;
      const origHtml = submitBtn.innerHTML;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Broadcasting...</span>`;
      hideBanner(banner);

      try {
        const res = await fetch("/api/admin/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            message,
            target_audience: targetAudience,
            send_discord: sendDiscord,
            send_email: sendEmail,
          }),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          const discordStatus = json.delivery?.discord?.status || "";
          const emailStatus = json.delivery?.email?.status || "";
          showBanner(
            banner,
            `<strong>Announcement Processed!</strong> ${escapeHtml(discordStatus)}${emailStatus ? ' | ' + escapeHtml(emailStatus) : ''}`,
            "success"
          );
          form.reset();
          if (charCounter) charCounter.textContent = "0 / 5000";
          await loadRecentAnnouncements();
        } else {
          showBanner(banner, json.error || "Failed to broadcast announcement.", "error");
        }
      } catch (err) {
        console.error("Announcement submit error:", err);
        showBanner(banner, "Network connection error while submitting announcement.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
      }
    });
  }
}

/**
 * FEATURE 2: Real Report Download Handlers
 */
function setupReportDownloadHandlers() {
  const downloadBtns = document.querySelectorAll(".btn-download-report");
  const banner = document.getElementById("reportsAlertBanner");

  downloadBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.getAttribute("data-url");
      if (!url) return;

      const origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Exporting...</span>`;
      hideBanner(banner);

      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) {
          throw new Error(`Server returned error status ${res.status}`);
        }

        const blob = await res.blob();
        let filename = "synex_report.csv";
        const disposition = res.headers.get("Content-Disposition");
        if (disposition && disposition.indexOf("filename=") !== -1) {
          const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
          if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, "");
          }
        }

        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);

        showBanner(banner, `Report <strong>${escapeHtml(filename)}</strong> downloaded successfully.`, "success");
      } catch (err) {
        console.error("Report download error:", err);
        showBanner(banner, `Failed to download report: ${err.message}. Please check your connection.`, "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    });
  });
}

/**
 * FEATURE 3: Event Settings Handlers
 */
async function loadEventSettings() {
  const banner = document.getElementById("settingsAlertBanner");
  try {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) throw new Error("Failed to load settings");
    const json = await res.json();
    if (json.success && json.settings) {
      const s = json.settings;
      const nameInput = document.getElementById("settingEventName");
      const indivInput = document.getElementById("settingIndividualFee");
      const teamInput = document.getElementById("settingTeamFee");
      const deadlineInput = document.getElementById("settingDeadline");
      const prizeInput = document.getElementById("settingPrizePool");
      const openSelect = document.getElementById("settingRegistrationOpen");

      if (nameInput) nameInput.value = s.event_name || "";
      if (indivInput) indivInput.value = s.individual_fee ?? 299;
      if (teamInput) teamInput.value = s.team_fee ?? 999;
      if (prizeInput) prizeInput.value = s.prize_pool || "₹2,50,000";
      if (openSelect) openSelect.value = String(s.registration_open);

      if (deadlineInput && s.registration_deadline) {
        let dl = s.registration_deadline.replace("Z", "");
        if (dl.length >= 16) {
          deadlineInput.value = dl.substring(0, 16);
        } else {
          deadlineInput.value = dl;
        }
      }
    }
  } catch (err) {
    console.error("Error loading event settings:", err);
    if (banner) showBanner(banner, "Failed to load current settings from server.", "error");
  }
}

function setupSettingsHandlers() {
  const form = document.getElementById("eventSettingsForm");
  const reloadBtn = document.getElementById("btnReloadSettings");
  const banner = document.getElementById("settingsAlertBanner");

  if (reloadBtn) {
    reloadBtn.addEventListener("click", async () => {
      const origHtml = reloadBtn.innerHTML;
      reloadBtn.disabled = true;
      reloadBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Loading...</span>`;
      await loadEventSettings();
      reloadBtn.disabled = false;
      reloadBtn.innerHTML = origHtml;
      showBanner(banner, "Event settings reloaded from server.", "success");
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const eventName = document.getElementById("settingEventName").value.trim();
      const indivFee = parseInt(document.getElementById("settingIndividualFee").value, 10);
      const teamFee = parseInt(document.getElementById("settingTeamFee").value, 10);
      const deadline = document.getElementById("settingDeadline").value.trim();
      const prizePool = document.getElementById("settingPrizePool").value.trim();
      const regOpen = document.getElementById("settingRegistrationOpen").value === "true";
      const submitBtn = document.getElementById("btnSaveSettings");

      if (eventName.length < 2) {
        showBanner(banner, "Event name must be at least 2 characters.", "error");
        return;
      }
      if (isNaN(indivFee) || indivFee < 0) {
        showBanner(banner, "Individual fee must be a non-negative number.", "error");
        return;
      }
      if (isNaN(teamFee) || teamFee < 0) {
        showBanner(banner, "Team fee must be a non-negative number.", "error");
        return;
      }
      if (!deadline) {
        showBanner(banner, "Registration deadline is required.", "error");
        return;
      }
      if (!prizePool) {
        showBanner(banner, "Prize pool description is required.", "error");
        return;
      }

      submitBtn.disabled = true;
      const origHtml = submitBtn.innerHTML;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving...</span>`;
      hideBanner(banner);

      try {
        const res = await fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_name: eventName,
            individual_fee: indivFee,
            team_fee: teamFee,
            registration_deadline: deadline,
            prize_pool: prizePool,
            registration_open: regOpen,
          }),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          showBanner(banner, "Event configuration saved and synchronized with public portal!", "success");
          if (window.SYNEX_CONFIG) {
            window.SYNEX_CONFIG.eventName = eventName;
            window.SYNEX_CONFIG.eventDate = deadline;
            window.SYNEX_CONFIG.prizePool = prizePool;
            window.SYNEX_CONFIG.fees = {
              individual: indivFee,
              team: teamFee,
              currency: "₹",
            };
          }
          if (typeof window.updatePublicFeeDisplays === "function") {
            window.updatePublicFeeDisplays(indivFee, teamFee, "₹");
          }
        } else {
          showBanner(banner, json.error || "Failed to update settings.", "error");
        }
      } catch (err) {
        console.error("Settings save error:", err);
        showBanner(banner, "Network connection error while saving event settings.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
      }
    });
  }
}

function showBanner(bannerEl, msg, type = "success") {
  if (!bannerEl) return;
  bannerEl.className = `admin-alert-banner admin-alert-${type}`;
  bannerEl.style.display = "flex";
  const icon = type === "success" ? "fa-circle-check" : "fa-triangle-exclamation";
  bannerEl.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
  bannerEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideBanner(bannerEl) {
  if (!bannerEl) return;
  bannerEl.style.display = "none";
}

/**
 * Danger Zone: Reset Participants Records Handler
 */
function setupResetParticipantsHandlers() {
  const btnReset = document.getElementById("btnResetParticipants");
  const modal = document.getElementById("resetConfirmModal");
  const btnClose = document.getElementById("btnCloseResetModal");
  const btnCancel = document.getElementById("btnCancelResetModal");
  const btnConfirm = document.getElementById("btnConfirmReset");
  const banner = document.getElementById("settingsAlertBanner");

  function openResetModal() {
    if (modal) {
      modal.classList.add("active");
      document.body.style.overflow = "hidden";
    }
  }

  function closeResetModal() {
    if (modal) {
      modal.classList.remove("active");
      document.body.style.overflow = "";
    }
  }

  if (btnReset) {
    btnReset.addEventListener("click", openResetModal);
  }

  [btnClose, btnCancel].forEach((btn) => {
    if (btn) btn.addEventListener("click", closeResetModal);
  });

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeResetModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("active")) {
      closeResetModal();
    }
  });

  if (btnConfirm) {
    btnConfirm.addEventListener("click", async () => {
      btnConfirm.disabled = true;
      if (btnCancel) btnCancel.disabled = true;
      const origHtml = btnConfirm.innerHTML;
      btnConfirm.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Resetting Records...</span>`;

      try {
        const res = await fetch("/api/admin/reset-participants", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const json = await res.json();

        if (res.ok && json.success) {
          closeResetModal();
          const counts = json.deleted_counts || {};
          const msg = `<strong>Participant Records Reset!</strong> Successfully deleted ${counts.participants ?? 0} participants, ${counts.registrations ?? 0} registrations, ${counts.teams ?? 0} teams, and ${counts.payments ?? 0} payment records.`;
          showBanner(banner, msg, "success");

          // Refresh Dashboard metrics and table immediately
          await checkAuthAndLoadMetrics();
          currentPage = 1;
          await loadRegistrationsTable();
        } else {
          closeResetModal();
          showBanner(banner, json.error || "Failed to reset participant records.", "error");
        }
      } catch (err) {
        console.error("Reset participants error:", err);
        closeResetModal();
        showBanner(banner, "Network connection error while resetting participant records.", "error");
      } finally {
        btnConfirm.disabled = false;
        if (btnCancel) btnCancel.disabled = false;
        btnConfirm.innerHTML = origHtml;
      }
    });
  }
}

/**
 * Public Portal Content Editor Handlers: Rules & Schedule
 */
function setupPublicContentEditorHandlers() {
  // Elements for Rules Modal
  const btnEditRules = document.getElementById("btnEditRulesModal");
  const rulesModal = document.getElementById("editRulesModal");
  const btnCloseRules = document.getElementById("btnCloseRulesModal");
  const btnCancelRules = document.getElementById("btnCancelRulesModal");
  const btnSaveRules = document.getElementById("btnSaveRules");
  const btnAddRuleBlock = document.getElementById("btnAddRuleBlock");
  const btnResetRulesDefault = document.getElementById("btnResetRulesDefault");
  const rulesNoticeInput = document.getElementById("rulesNoticeBannerInput");
  const rulesBlocksList = document.getElementById("rulesBlocksList");
  const rulesAlertBanner = document.getElementById("rulesModalAlertBanner");

  // Elements for Schedule Modal
  const btnEditSchedule = document.getElementById("btnEditScheduleModal");
  const scheduleModal = document.getElementById("editScheduleModal");
  const btnCloseSchedule = document.getElementById("btnCloseScheduleModal");
  const btnCancelSchedule = document.getElementById("btnCancelScheduleModal");
  const btnSaveSchedule = document.getElementById("btnSaveSchedule");
  const btnAddMilestone = document.getElementById("btnAddScheduleMilestone");
  const btnResetScheduleDefault = document.getElementById("btnResetScheduleDefault");
  const scheduleNoticeInput = document.getElementById("scheduleNoticeBannerInput");
  const scheduleMilestonesList = document.getElementById("scheduleMilestonesList");
  const scheduleAlertBanner = document.getElementById("scheduleModalAlertBanner");

  function openModal(modalEl) {
    if (modalEl) {
      modalEl.classList.add("active");
      document.body.style.overflow = "hidden";
    }
  }

  function closeModal(modalEl) {
    if (modalEl) {
      modalEl.classList.remove("active");
      document.body.style.overflow = "";
    }
  }

  // --- RULES MODAL LOGIC ---
  function createRuleBlockRow(rule = {}, index = 0) {
    const card = document.createElement("div");
    card.className = "rule-editor-card";
    card.style.cssText = "border: 1px solid var(--color-border); border-radius: 8px; padding: 1rem; background: #FFFFFF; position: relative;";
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="rule-index-badge" style="background: var(--color-primary-light); color: var(--color-primary); width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">${index + 1}</span>
          <strong style="color: var(--color-text-main); font-size: 0.9rem;">Rule Section</strong>
        </div>
        <button type="button" class="btn-delete-rule" style="background: none; border: none; color: #DC2626; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 0.82rem;" title="Remove this rule">
          <i class="fa-solid fa-trash-can"></i> Delete
        </button>
      </div>
      <div style="margin-bottom: 0.5rem;">
        <label style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 0.2rem;">Rule Title <span style="color: var(--color-error);">*</span></label>
        <input type="text" class="admin-form-control rule-title-input" value="${escapeHtml(rule.title || '')}" placeholder="e.g. Eligibility & Format" required>
      </div>
      <div>
        <label style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 0.2rem;">Rule Content &amp; Guidelines <span style="color: var(--color-error);">*</span></label>
        <textarea class="admin-form-control rule-content-input" rows="3" placeholder="Full rule description, eligibility criteria, guidelines..." required>${escapeHtml(rule.content || '')}</textarea>
      </div>
    `;

    card.querySelector(".btn-delete-rule").addEventListener("click", () => {
      card.remove();
      updateRuleBadges();
    });

    return card;
  }

  function updateRuleBadges() {
    if (!rulesBlocksList) return;
    const cards = rulesBlocksList.querySelectorAll(".rule-editor-card");
    cards.forEach((card, idx) => {
      const badge = card.querySelector(".rule-index-badge");
      if (badge) badge.textContent = idx + 1;
    });
  }

  async function loadRulesEditorData() {
    if (rulesAlertBanner) hideBanner(rulesAlertBanner);
    if (!rulesBlocksList) return;
    rulesBlocksList.innerHTML = `<div style="text-align: center; color: var(--color-text-muted); padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading current rules...</div>`;

    try {
      const res = await fetch("/api/admin/content/rules");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load rules.");
      }

      const data = json.data || {};
      if (rulesNoticeInput) {
        rulesNoticeInput.value = data.notice_banner || "";
      }

      rulesBlocksList.innerHTML = "";
      const rules = data.rules || [];
      if (rules.length === 0) {
        rulesBlocksList.innerHTML = `<div style="text-align: center; color: var(--color-text-muted); padding: 1rem;">No rule sections configured. Click "Add New Rule" above.</div>`;
      } else {
        rules.forEach((rule, idx) => {
          rulesBlocksList.appendChild(createRuleBlockRow(rule, idx));
        });
      }
    } catch (err) {
      console.error("Error loading rules:", err);
      if (rulesAlertBanner) showBanner(rulesAlertBanner, "Failed to load rules from server.", "error");
    }
  }

  if (btnEditRules) {
    btnEditRules.addEventListener("click", () => {
      openModal(rulesModal);
      loadRulesEditorData();
    });
  }

  [btnCloseRules, btnCancelRules].forEach(btn => {
    if (btn) btn.addEventListener("click", () => closeModal(rulesModal));
  });

  if (btnAddRuleBlock) {
    btnAddRuleBlock.addEventListener("click", () => {
      if (!rulesBlocksList) return;
      if (rulesBlocksList.querySelector(".rule-editor-card") === null && rulesBlocksList.children.length === 1) {
        rulesBlocksList.innerHTML = "";
      }
      const count = rulesBlocksList.querySelectorAll(".rule-editor-card").length;
      const newCard = createRuleBlockRow({ title: "", content: "" }, count);
      rulesBlocksList.appendChild(newCard);
      const titleInput = newCard.querySelector(".rule-title-input");
      if (titleInput) titleInput.focus();
    });
  }

  if (btnSaveRules) {
    btnSaveRules.addEventListener("click", async () => {
      if (rulesAlertBanner) hideBanner(rulesAlertBanner);
      const noticeBanner = rulesNoticeInput ? rulesNoticeInput.value.trim() : "";
      const cards = rulesBlocksList ? rulesBlocksList.querySelectorAll(".rule-editor-card") : [];

      if (cards.length === 0) {
        showBanner(rulesAlertBanner, "Please add at least one rule section before saving.", "error");
        return;
      }

      const rulesList = [];
      let hasValidationError = false;

      cards.forEach((card, idx) => {
        const title = card.querySelector(".rule-title-input").value.trim();
        const content = card.querySelector(".rule-content-input").value.trim();

        if (!title || !content) {
          hasValidationError = true;
          return;
        }

        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `rule-${idx + 1}`;
        rulesList.push({
          id: slug,
          num: idx + 1,
          title: title,
          content: content
        });
      });

      if (hasValidationError) {
        showBanner(rulesAlertBanner, "Every rule section must have a title and content.", "error");
        return;
      }

      btnSaveRules.disabled = true;
      const origHtml = btnSaveRules.innerHTML;
      btnSaveRules.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving...</span>`;

      try {
        const res = await fetch("/api/admin/content/rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notice_banner: noticeBanner,
            rules: rulesList
          })
        });

        const json = await res.json();
        if (res.ok && json.success) {
          showBanner(rulesAlertBanner, "Public rules updated successfully and published live!", "success");
          const settingsBanner = document.getElementById("settingsAlertBanner");
          if (settingsBanner) {
            showBanner(settingsBanner, "Public rules and guidelines synchronized with /rules.html!", "success");
          }
          setTimeout(() => closeModal(rulesModal), 1200);
        } else {
          showBanner(rulesAlertBanner, json.error || "Failed to update rules.", "error");
        }
      } catch (err) {
        console.error("Rules save error:", err);
        showBanner(rulesAlertBanner, "Network connection error while saving rules.", "error");
      } finally {
        btnSaveRules.disabled = false;
        btnSaveRules.innerHTML = origHtml;
      }
    });
  }

  if (btnResetRulesDefault) {
    btnResetRulesDefault.addEventListener("click", async () => {
      if (!confirm("Reset all public rules back to the official default guidelines? Any custom edits will be replaced.")) {
        return;
      }

      btnResetRulesDefault.disabled = true;
      try {
        const res = await fetch("/api/admin/content/rules/reset", { method: "POST" });
        const json = await res.json();
        if (res.ok && json.success) {
          showBanner(rulesAlertBanner, "Rules have been reset to official defaults.", "success");
          await loadRulesEditorData();
        } else {
          showBanner(rulesAlertBanner, json.error || "Failed to reset rules.", "error");
        }
      } catch (err) {
        console.error("Reset rules error:", err);
        showBanner(rulesAlertBanner, "Network error resetting rules.", "error");
      } finally {
        btnResetRulesDefault.disabled = false;
      }
    });
  }


  // --- SCHEDULE MODAL LOGIC ---
  function createMilestoneRow(m = {}) {
    const card = document.createElement("div");
    card.className = "milestone-editor-card";
    card.style.cssText = "border: 1px solid var(--color-border); border-radius: 8px; padding: 1rem; background: #FFFFFF; position: relative;";
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="milestone-icon-badge" style="background: #ECFDF5; color: #059669; width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;"><i class="fa-solid fa-clock"></i></span>
          <strong style="color: var(--color-text-main); font-size: 0.9rem;">Timeline Milestone</strong>
        </div>
        <button type="button" class="btn-delete-milestone" style="background: none; border: none; color: #DC2626; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 0.82rem;" title="Remove this milestone">
          <i class="fa-solid fa-trash-can"></i> Delete
        </button>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; margin-bottom: 0.5rem;">
        <div>
          <label style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 0.2rem;">Phase / Day</label>
          <select class="admin-form-control milestone-phase-select">
            <option value="day-pre" ${m.phase === 'day-pre' ? 'selected' : ''}>Pre-Hackathon (Phase 1)</option>
            <option value="day-1" ${m.phase === 'day-1' ? 'selected' : ''}>Day 1 — Nov 14 (Sprint)</option>
            <option value="day-2" ${m.phase === 'day-2' ? 'selected' : ''}>Day 2 — Nov 15 (Finale)</option>
          </select>
        </div>
        <div>
          <label style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 0.2rem;">Time Badge / Schedule <span style="color: var(--color-error);">*</span></label>
          <input type="text" class="admin-form-control milestone-time-input" value="${escapeHtml(m.time || '')}" placeholder="e.g. 08:30 AM – 09:45 AM" required>
        </div>
        <div>
          <label style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 0.2rem;">Location / Category Tag</label>
          <input type="text" class="admin-form-control milestone-tag-input" value="${escapeHtml(m.tag || '')}" placeholder="e.g. Auditorium / Main Stage" required>
        </div>
      </div>
      <div style="margin-bottom: 0.5rem;">
        <label style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 0.2rem;">Milestone Title <span style="color: var(--color-error);">*</span></label>
        <input type="text" class="admin-form-control milestone-title-input" value="${escapeHtml(m.title || '')}" placeholder="e.g. Participant Check-In &amp; Swag Kits" required>
      </div>
      <div>
        <label style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); display: block; margin-bottom: 0.2rem;">Description &amp; Agenda Notes</label>
        <textarea class="admin-form-control milestone-desc-input" rows="2" placeholder="Brief summary of what happens during this milestone...">${escapeHtml(m.desc || '')}</textarea>
      </div>
    `;

    card.querySelector(".btn-delete-milestone").addEventListener("click", () => {
      card.remove();
    });

    return card;
  }

  async function loadScheduleEditorData() {
    if (scheduleAlertBanner) hideBanner(scheduleAlertBanner);
    if (!scheduleMilestonesList) return;
    scheduleMilestonesList.innerHTML = `<div style="text-align: center; color: var(--color-text-muted); padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading current schedule...</div>`;

    try {
      const res = await fetch("/api/admin/content/schedule");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load schedule.");
      }

      const data = json.data || {};
      if (scheduleNoticeInput) {
        scheduleNoticeInput.value = data.notice_banner || "";
      }

      scheduleMilestonesList.innerHTML = "";
      const milestones = data.milestones || [];
      if (milestones.length === 0) {
        scheduleMilestonesList.innerHTML = `<div style="text-align: center; color: var(--color-text-muted); padding: 1rem;">No schedule milestones configured. Click "Add Milestone" above.</div>`;
      } else {
        milestones.forEach(m => {
          scheduleMilestonesList.appendChild(createMilestoneRow(m));
        });
      }
    } catch (err) {
      console.error("Error loading schedule:", err);
      if (scheduleAlertBanner) showBanner(scheduleAlertBanner, "Failed to load schedule from server.", "error");
    }
  }

  if (btnEditSchedule) {
    btnEditSchedule.addEventListener("click", () => {
      openModal(scheduleModal);
      loadScheduleEditorData();
    });
  }

  [btnCloseSchedule, btnCancelSchedule].forEach(btn => {
    if (btn) btn.addEventListener("click", () => closeModal(scheduleModal));
  });

  if (btnAddMilestone) {
    btnAddMilestone.addEventListener("click", () => {
      if (!scheduleMilestonesList) return;
      if (scheduleMilestonesList.querySelector(".milestone-editor-card") === null && scheduleMilestonesList.children.length === 1) {
        scheduleMilestonesList.innerHTML = "";
      }
      const newCard = createMilestoneRow({
        phase: "day-1",
        time: "",
        title: "",
        desc: "",
        tag: "Milestone"
      });
      scheduleMilestonesList.appendChild(newCard);
      const titleInput = newCard.querySelector(".milestone-title-input");
      if (titleInput) titleInput.focus();
    });
  }

  if (btnSaveSchedule) {
    btnSaveSchedule.addEventListener("click", async () => {
      if (scheduleAlertBanner) hideBanner(scheduleAlertBanner);
      const noticeBanner = scheduleNoticeInput ? scheduleNoticeInput.value.trim() : "";
      const cards = scheduleMilestonesList ? scheduleMilestonesList.querySelectorAll(".milestone-editor-card") : [];

      if (cards.length === 0) {
        showBanner(scheduleAlertBanner, "Please add at least one milestone before saving.", "error");
        return;
      }

      const milestonesList = [];
      let hasValidationError = false;

      cards.forEach(card => {
        const phase = card.querySelector(".milestone-phase-select").value;
        const time = card.querySelector(".milestone-time-input").value.trim();
        const tag = card.querySelector(".milestone-tag-input").value.trim() || "Milestone";
        const title = card.querySelector(".milestone-title-input").value.trim();
        const desc = card.querySelector(".milestone-desc-input").value.trim();

        if (!time || !title) {
          hasValidationError = true;
          return;
        }

        let phaseTitle = "Phase 1: Pre-Hackathon Milestones";
        if (phase === "day-1") phaseTitle = "Day 1 — Saturday, November 14, 2026";
        else if (phase === "day-2") phaseTitle = "Day 2 — Sunday, November 15, 2026";

        milestonesList.push({
          phase: phase,
          phase_title: phaseTitle,
          time: time,
          tag: tag,
          title: title,
          desc: desc
        });
      });

      if (hasValidationError) {
        showBanner(scheduleAlertBanner, "Every milestone must have a time and title.", "error");
        return;
      }

      btnSaveSchedule.disabled = true;
      const origHtml = btnSaveSchedule.innerHTML;
      btnSaveSchedule.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving...</span>`;

      try {
        const res = await fetch("/api/admin/content/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notice_banner: noticeBanner,
            milestones: milestonesList
          })
        });

        const json = await res.json();
        if (res.ok && json.success) {
          showBanner(scheduleAlertBanner, "Public schedule updated successfully and published live!", "success");
          const settingsBanner = document.getElementById("settingsAlertBanner");
          if (settingsBanner) {
            showBanner(settingsBanner, "Public event schedule synchronized with /schedule.html!", "success");
          }
          setTimeout(() => closeModal(scheduleModal), 1200);
        } else {
          showBanner(scheduleAlertBanner, json.error || "Failed to update schedule.", "error");
        }
      } catch (err) {
        console.error("Schedule save error:", err);
        showBanner(scheduleAlertBanner, "Network connection error while saving schedule.", "error");
      } finally {
        btnSaveSchedule.disabled = false;
        btnSaveSchedule.innerHTML = origHtml;
      }
    });
  }

  if (btnResetScheduleDefault) {
    btnResetScheduleDefault.addEventListener("click", async () => {
      if (!confirm("Reset all public schedule milestones back to the official 36-hour schedule? Any custom edits will be replaced.")) {
        return;
      }

      btnResetScheduleDefault.disabled = true;
      try {
        const res = await fetch("/api/admin/content/schedule/reset", { method: "POST" });
        const json = await res.json();
        if (res.ok && json.success) {
          showBanner(scheduleAlertBanner, "Schedule has been reset to official defaults.", "success");
          await loadScheduleEditorData();
        } else {
          showBanner(scheduleAlertBanner, json.error || "Failed to reset schedule.", "error");
        }
      } catch (err) {
        console.error("Reset schedule error:", err);
        showBanner(scheduleAlertBanner, "Network error resetting schedule.", "error");
      } finally {
        btnResetScheduleDefault.disabled = false;
      }
    });
  }

  // Close modals on Escape key or backdrop click
  [rulesModal, scheduleModal].forEach(modalEl => {
    if (modalEl) {
      modalEl.addEventListener("click", (e) => {
        if (e.target === modalEl) closeModal(modalEl);
      });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (rulesModal && rulesModal.classList.contains("active")) closeModal(rulesModal);
      if (scheduleModal && scheduleModal.classList.contains("active")) closeModal(scheduleModal);
    }
  });
}


