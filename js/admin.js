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
window.latestRegistrationsCache = [];

/**
 * Admin Multi-Page / Tabbed View System
 */
const ADMIN_PAGE_CONFIG = {
  "dashboard": {
    title: "Hackathon Overview & Analytics",
    viewId: "view-dashboard",
    hash: "#dashboard",
    path: "/admin/dashboard",
  },
  "registrations": {
    title: "Registration Entries",
    viewId: "view-registrations",
    hash: "#registrations",
    path: "/admin/registrations",
  },
  "participants": {
    title: "Participants Directory",
    viewId: "view-participants",
    hash: "#participants",
    path: "/admin/participants",
  },
  "teams": {
    title: "Teams & Squads",
    viewId: "view-teams",
    hash: "#teams",
    path: "/admin/teams",
  },
  "payments": {
    title: "Financial Ledger & Payments",
    viewId: "view-payments",
    hash: "#payments",
    path: "/admin/payments",
  },
  "reports": {
    title: "Certified Reports & Exports",
    viewId: "view-reports",
    hash: "#reports",
    path: "/admin/reports",
  },
  "inquiries": {
    title: "Inquiries & Contact Inbox",
    viewId: "view-inquiries",
    hash: "#inquiries",
    path: "/admin/inquiries",
  },
  "announcements": {
    title: "Broadcast Announcements",
    viewId: "view-announcements",
    hash: "#announcements",
    path: "/admin/announcements",
  },
  "certificates": {
    title: "E-Certificate Distribution",
    viewId: "view-certificates",
    hash: "#certificates",
    path: "/admin/certificates",
  },
  "settings": {
    title: "Event Configuration & Parameters",
    viewId: "view-settings",
    hash: "#settings",
    path: "/admin/settings",
  },
};

let currentAdminPage = "dashboard";

/**
 * Switches the active admin view, updates sidebar active state,
 * synchronizes URL hash/history, updates header title, and renders active data.
 */
function switchAdminPage(pageKey, updateHistory = true) {
  if (!pageKey || !ADMIN_PAGE_CONFIG[pageKey]) {
    pageKey = "dashboard";
  }

  currentAdminPage = pageKey;
  const config = ADMIN_PAGE_CONFIG[pageKey];

  // 1. Hide all page views and show ONLY the active view
  document.querySelectorAll(".admin-page-view").forEach((view) => {
    if (view.id === config.viewId) {
      view.style.display = "block";
      view.classList.add("active-page");
    } else {
      view.style.display = "none";
      view.classList.remove("active-page");
    }
  });

  // 2. Update sidebar navigation pills
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    const itemPage = item.getAttribute("data-page");
    if (itemPage === pageKey) {
      item.classList.add("active");
    } else if (itemPage) {
      item.classList.remove("active");
    }
  });

  // 3. Update topbar title
  const titleEl = document.getElementById("adminPageTitle");
  if (titleEl) {
    titleEl.textContent = config.title;
  }

  // 4. Update browser URL hash without full reload
  if (updateHistory) {
    if (window.location.hash !== config.hash) {
      window.location.hash = pageKey;
    }
  }

  // 5. Trigger live metrics reload and canvas resize when dashboard becomes visible
  if (pageKey === "dashboard") {
    checkAuthAndLoadMetrics();
    setTimeout(() => {
      if (trendsChartInstance && typeof trendsChartInstance.resize === "function") {
        trendsChartInstance.resize();
      }
      if (paymentChartInstance && typeof paymentChartInstance.resize === "function") {
        paymentChartInstance.resize();
      }
      if (domainChartInstance && typeof domainChartInstance.resize === "function") {
        domainChartInstance.resize();
      }
    }, 50);
  }

  // 6. Ensure directory tables are rendered
  if (pageKey === "participants") {
    renderParticipantsDirectory();
  } else if (pageKey === "teams") {
    renderTeamsDirectory();
  } else if (pageKey === "payments") {
    renderPaymentsDirectory();
  } else if (pageKey === "certificates") {
    loadCertificateSection();
  }

  // 7. Scroll smoothly to top
  const mainEl = document.querySelector(".admin-main");
  if (mainEl) mainEl.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.switchAdminPage = switchAdminPage;

let liveDashboardTimer = null;

/**
 * Periodically polls the server for live metrics and chart updates
 */
function startLiveDashboardPolling() {
  if (liveDashboardTimer) clearInterval(liveDashboardTimer);
  liveDashboardTimer = setInterval(async () => {
    if (currentAdminPage === "dashboard" && !document.hidden) {
      await checkAuthAndLoadMetrics();
    }
  }, 10000);
}

document.addEventListener("DOMContentLoaded", () => {
  initAdminDashboard();
});

async function initAdminDashboard() {
  // Determine initial page
  let initialPage = "dashboard";
  const hash = (window.location.hash || "").replace("#", "").trim();
  if (hash && ADMIN_PAGE_CONFIG[hash]) {
    initialPage = hash;
  } else if (window.INITIAL_ADMIN_PAGE && ADMIN_PAGE_CONFIG[window.INITIAL_ADMIN_PAGE]) {
    initialPage = window.INITIAL_ADMIN_PAGE;
  } else {
    const path = window.location.pathname.replace(/\/$/, "");
    for (const [key, cfg] of Object.entries(ADMIN_PAGE_CONFIG)) {
      if (path === cfg.path) {
        initialPage = key;
        break;
      }
    }
  }

  // Switch to initial page immediately
  switchAdminPage(initialPage, false);

  // Listen to hash changes for browser forward/back buttons
  window.addEventListener("hashchange", () => {
    const newHash = (window.location.hash || "").replace("#", "").trim();
    if (newHash && ADMIN_PAGE_CONFIG[newHash] && newHash !== currentAdminPage) {
      switchAdminPage(newHash, false);
    }
  });

  // Check auth and fetch dashboard metrics
  const isAuthenticated = await checkAuthAndLoadMetrics();
  if (!isAuthenticated) return;

  // Setup DOM Event Listeners
  setupEventListeners();

  // Load initial registration table data
  await loadRegistrationsTable();

  // Load announcements history and inquiries
  await loadRecentAnnouncements();
  await loadInquiries();

  // Check confidential Event Settings lock status
  await checkSettingsAuthStatus();

  // Start live polling heartbeat
  startLiveDashboardPolling();
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

    if (trendsChartInstance) {
      trendsChartInstance.data.labels = labels;
      trendsChartInstance.data.datasets[0].data = counts;
      trendsChartInstance.update();
    } else {
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
  }

  // 2. Payment Status Distribution (Doughnut)
  const paymentCanvas = document.getElementById("paymentStatusChart") || document.getElementById("paymentChart");
  if (paymentCanvas) {
    const paid = summary ? (summary.paid_count || 0) : 0;
    const pending = summary ? (summary.pending_count || 0) : 0;
    const failed = summary ? (summary.failed_count || 0) : 0;

    const paymentLabels = [`Paid (${paid})`, `Pending (${pending})`, `Failed (${failed})`];
    const paymentData = [paid, pending, failed];

    if (paymentChartInstance) {
      paymentChartInstance.data.labels = paymentLabels;
      paymentChartInstance.data.datasets[0].data = paymentData;
      paymentChartInstance.update();
    } else {
      paymentChartInstance = new Chart(paymentCanvas, {
        type: "doughnut",
        data: {
          labels: paymentLabels,
          datasets: [{
            data: paymentData,
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
  }

  // 3. Registrations Across 8 Innovation Domains (Bar)
  const domainCanvas = document.getElementById("domainChart");
  if (domainCanvas) {
    const allDomains = [
      "AI & Machine Learning",
      "Web3 & Web Development",
      "Cybersecurity & Cloud",
      "Internet of Things (IoT)",
      "Healthcare & MedTech",
      "FinTech & Open Innovation",
      "Smart Cities & Sustainability",
      "Open Innovation Track"
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

    // Harmonious distinct colors per track
    const barColors = [
      "#6366F1", // Indigo
      "#3B82F6", // Blue
      "#EC4899", // Pink
      "#F59E0B", // Amber
      "#10B981", // Emerald
      "#8B5CF6", // Purple
      "#06B6D4", // Cyan
      "#F97316", // Orange
    ];

    // Accurate word boundary regex to prevent false matches (e.g. 'ai' in 'blockchain' or 'sustainability')
    const trackPatterns = [
      /\b(ai|ml|machine\s*learning|artificial\s*intelligence|deep\s*learning)\b/i,
      /\b(web3|blockchain|crypto|smart\s*contracts|web\s*development|web\s*dev|web)\b/i,
      /\b(cybersecurity|cyber|cloud|infosec|security)\b/i,
      /\b(iot|embedded|internet\s*of\s*things|sensors|hardware)\b/i,
      /\b(health|healthcare|medtech|biotech|medical)\b/i,
      /\b(fintech|financial|finance)\b/i,
      /\b(smart\s*cities|sustainability|clean\s*energy|urban)\b/i,
      /\b(open\s*innovation|open\s*track|general|creative|other)\b/i
    ];

    const counts = [0, 0, 0, 0, 0, 0, 0, 0];
    let totalTrackRegistrations = 0;

    if (domainBreakdown && typeof domainBreakdown === "object") {
      for (const [rawDomain, countVal] of Object.entries(domainBreakdown)) {
        const num = Number(countVal) || 0;
        if (num <= 0) continue;
        totalTrackRegistrations += num;

        let matched = false;
        // Exact case-insensitive match
        for (let i = 0; i < allDomains.length; i++) {
          if (rawDomain.trim().toLowerCase() === allDomains[i].toLowerCase()) {
            counts[i] += num;
            matched = true;
            break;
          }
        }
        // Word boundary pattern match
        if (!matched) {
          for (let i = 0; i < trackPatterns.length; i++) {
            if (trackPatterns[i].test(rawDomain)) {
              counts[i] += num;
              matched = true;
              break;
            }
          }
        }
        // Fallback to Open Track
        if (!matched) {
          counts[7] += num;
        }
      }
    }

    // Update track breakdown badge in header
    const trackBadge = document.getElementById("badgeTrackBreakdown");
    if (trackBadge) {
      trackBadge.innerHTML = `<i class="fa-solid fa-circle" style="color: #10B981; font-size: 0.5rem; margin-right: 4px;"></i>${totalTrackRegistrations} Live ${totalTrackRegistrations === 1 ? 'Entry' : 'Entries'}`;
    }

    if (domainChartInstance) {
      domainChartInstance.data.labels = shortLabels;
      domainChartInstance.data.datasets[0].data = counts;
      domainChartInstance.data.datasets[0].backgroundColor = barColors;
      domainChartInstance.update();
    } else {
      domainChartInstance = new Chart(domainCanvas, {
        type: "bar",
        data: {
          labels: shortLabels,
          datasets: [{
            label: "Teams & Hackers",
            data: counts,
            backgroundColor: barColors,
            borderRadius: 6,
            borderSkipped: false
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

    window.latestRegistrationsCache = json.data.registrations || [];
    renderTableRows(json.data.registrations, json.data);
    renderParticipantsDirectory();
    renderTeamsDirectory();
    renderPaymentsDirectory();
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
  setupInquiriesHandlers();
  setupSmtpHandlers();
  setupDirectoryFilterHandlers();
  setupCertificateHandlers();
}

/**
 * Setup search and filter input handlers for Participants, Teams, and Payments directories
 */
function setupDirectoryFilterHandlers() {
  const partSearch = document.getElementById("participantsSearchInput");
  if (partSearch) {
    let timeout = null;
    partSearch.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(renderParticipantsDirectory, 150);
    });
  }
  const partType = document.getElementById("participantsTypeFilter");
  if (partType) partType.addEventListener("change", renderParticipantsDirectory);
  const partDomain = document.getElementById("participantsDomainFilter");
  if (partDomain) partDomain.addEventListener("change", renderParticipantsDirectory);

  const teamsSearch = document.getElementById("teamsSearchInput");
  if (teamsSearch) {
    let timeout = null;
    teamsSearch.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(renderTeamsDirectory, 150);
    });
  }
  const teamsDomain = document.getElementById("teamsDomainFilter");
  if (teamsDomain) teamsDomain.addEventListener("change", renderTeamsDirectory);

  const paySearch = document.getElementById("paymentsSearchInput");
  if (paySearch) {
    let timeout = null;
    paySearch.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(renderPaymentsDirectory, 150);
    });
  }
  const payStatus = document.getElementById("paymentsStatusFilter");
  if (payStatus) payStatus.addEventListener("change", renderPaymentsDirectory);
}

/**
 * Renders the Participants Directory table view
 */
function renderParticipantsDirectory() {
  const tbody = document.getElementById("participantsTableBody");
  const countEl = document.getElementById("participantsShowingCount");
  const badgeCountEl = document.getElementById("badgeParticipantsCount");
  if (!tbody) return;

  const records = window.latestRegistrationsCache || [];
  const search = (document.getElementById("participantsSearchInput")?.value || "").toLowerCase().trim();
  const typeFilter = document.getElementById("participantsTypeFilter")?.value || "all";
  const domainFilter = document.getElementById("participantsDomainFilter")?.value || "all";

  let participantsList = [];
  records.forEach((reg) => {
    const isTeam = reg.registration_type === "team";
    const lead = reg.participant || {};

    participantsList.push({
      regId: reg.public_id,
      name: lead.full_name || "N/A",
      role: isTeam ? "Team Leader" : "Solo Hacker",
      email: lead.email || "N/A",
      phone: lead.phone || "N/A",
      college: lead.college || "N/A",
      domain: reg.domain || "N/A",
      status: reg.payment_status || "pending",
      isTeam: isTeam,
      teamName: isTeam ? (reg.team?.team_name || reg.team_name || "Team Squad") : null,
    });

    if (isTeam && reg.team && Array.isArray(reg.team.members)) {
      reg.team.members.forEach((m, idx) => {
        if (m.role === "leader" || m.email === lead.email) return;
        participantsList.push({
          regId: reg.public_id,
          name: m.name || `Member ${idx + 2}`,
          role: "Team Member",
          email: m.email || "N/A",
          phone: m.phone || "N/A",
          college: m.college || lead.college || "N/A",
          domain: reg.domain || "N/A",
          status: reg.payment_status || "pending",
          isTeam: true,
          teamName: reg.team.team_name || reg.team_name || "Team Squad",
        });
      });
    }
  });

  if (badgeCountEl) {
    badgeCountEl.textContent = `${participantsList.length} Hackers`;
  }

  const filtered = participantsList.filter((p) => {
    if (domainFilter !== "all") {
      const pDom = (p.domain || "").toLowerCase();
      const fDom = domainFilter.toLowerCase();
      if (pDom !== fDom && !pDom.includes(fDom) && !fDom.includes(pDom)) return false;
    }
    if (typeFilter === "Solo Hacker" && p.role !== "Solo Hacker") return false;
    if (typeFilter === "Team Member" && p.role === "Solo Hacker") return false;
    if (search) {
      const targetStr = `${p.name} ${p.email} ${p.college} ${p.domain} ${p.role} ${p.teamName || ""}`.toLowerCase();
      if (!targetStr.includes(search)) return false;
    }
    return true;
  });

  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${participantsList.length} participants`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2.5rem 1rem; color: var(--color-text-muted);">
          <div style="font-size: 1.75rem; margin-bottom: 0.5rem; opacity: 0.4;"><i class="fa-solid fa-user-slash"></i></div>
          <div style="font-weight: 600; color: var(--color-text-main);">No matching participants found</div>
          <div style="font-size: 0.85rem; margin-top: 0.25rem;">Adjust search query or filter options.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((p) => {
    let statusBadge = "";
    if (p.status === "paid") {
      statusBadge = `<span class="badge badge-success" style="background: #ECFDF5; color: #047857; font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-circle-check"></i> Paid</span>`;
    } else if (p.status === "failed") {
      statusBadge = `<span class="badge badge-danger" style="background: #FEF2F2; color: #B91C1C; font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-circle-xmark"></i> Failed</span>`;
    } else {
      statusBadge = `<span class="badge badge-warning" style="background: #FFFBEB; color: #B45309; font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-clock"></i> Pending</span>`;
    }

    let roleBadge = "";
    if (p.role === "Solo Hacker") {
      roleBadge = `<span class="badge badge-secondary" style="font-size: 0.72rem; padding: 2px 7px;">Solo Hacker</span>`;
    } else if (p.role === "Team Leader") {
      roleBadge = `<span class="badge badge-primary" style="font-size: 0.72rem; padding: 2px 7px; background: #EFF6FF; color: #1D4ED8;"><i class="fa-solid fa-crown" style="font-size: 0.65rem;"></i> Lead (${escapeHtml(p.teamName || "Team")})</span>`;
    } else {
      roleBadge = `<span class="badge badge-secondary" style="font-size: 0.72rem; padding: 2px 7px; background: #F1F5F9; color: #475569;"><i class="fa-solid fa-user-group" style="font-size: 0.65rem;"></i> Member (${escapeHtml(p.teamName || "Team")})</span>`;
    }

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--color-text-main); font-size: 0.88rem;">${escapeHtml(p.name)}</div>
          <span style="font-family: monospace; font-size: 0.75rem; color: #64748B;">${escapeHtml(p.regId)}</span>
        </td>
        <td>${roleBadge}</td>
        <td><a href="mailto:${escapeHtml(p.email)}" style="color: #2563EB; font-size: 0.82rem; text-decoration: none;"><i class="fa-solid fa-envelope" style="margin-right: 4px; color: #64748B;"></i>${escapeHtml(p.email)}</a></td>
        <td style="font-size: 0.82rem; color: #334155;">${escapeHtml(p.phone)}</td>
        <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.82rem; color: #475569;" title="${escapeHtml(p.college)}">${escapeHtml(p.college)}</td>
        <td><span class="domain-tag" style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; background: #F1F5F9; color: #334155; font-weight: 500;">${escapeHtml(p.domain)}</span></td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join("");
}

/**
 * Renders the Teams Directory table view
 */
function renderTeamsDirectory() {
  const tbody = document.getElementById("teamsTableBody");
  const countEl = document.getElementById("teamsShowingCount");
  const badgeCountEl = document.getElementById("badgeTeamsCount");
  if (!tbody) return;

  const records = (window.latestRegistrationsCache || []).filter(r => r.registration_type === "team");
  const search = (document.getElementById("teamsSearchInput")?.value || "").toLowerCase().trim();
  const domainFilter = document.getElementById("teamsDomainFilter")?.value || "all";

  if (badgeCountEl) {
    badgeCountEl.textContent = `${records.length} Teams`;
  }

  const filtered = records.filter((r) => {
    if (domainFilter !== "all") {
      const rDom = (r.domain || "").toLowerCase();
      const fDom = domainFilter.toLowerCase();
      if (rDom !== fDom && !rDom.includes(fDom) && !fDom.includes(rDom)) return false;
    }
    if (search) {
      const teamName = r.team ? r.team.team_name : (r.team_name || "");
      const leaderName = r.participant ? r.participant.full_name : "";
      const college = r.participant ? r.participant.college : "";
      const targetStr = `${teamName} ${leaderName} ${college} ${r.domain} ${r.public_id}`.toLowerCase();
      if (!targetStr.includes(search)) return false;
    }
    return true;
  });

  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${records.length} teams`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2.5rem 1rem; color: var(--color-text-muted);">
          <div style="font-size: 1.75rem; margin-bottom: 0.5rem; opacity: 0.4;"><i class="fa-solid fa-people-line"></i></div>
          <div style="font-weight: 600; color: var(--color-text-main);">No matching team squads found</div>
          <div style="font-size: 0.85rem; margin-top: 0.25rem;">Adjust search query or domain filter.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((r) => {
    const teamName = r.team ? r.team.team_name : (r.team_name || "Team Squad");
    const leader = r.participant || {};
    const membersCount = r.team && r.team.members ? r.team.members.length : 2;
    const college = leader.college || "N/A";

    let statusBadge = "";
    if (r.payment_status === "paid") {
      statusBadge = `<span class="badge badge-success" style="background: #ECFDF5; color: #047857; font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-circle-check"></i> Paid</span>`;
    } else if (r.payment_status === "failed") {
      statusBadge = `<span class="badge badge-danger" style="background: #FEF2F2; color: #B91C1C; font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-circle-xmark"></i> Failed</span>`;
    } else {
      statusBadge = `<span class="badge badge-warning" style="background: #FFFBEB; color: #B45309; font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-clock"></i> Pending</span>`;
    }

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: #1E293B; font-size: 0.92rem;">
            <i class="fa-solid fa-people-group" style="color: #2563EB; margin-right: 6px;"></i>${escapeHtml(teamName)}
          </div>
          <span style="font-family: monospace; font-size: 0.75rem; color: #64748B;">${escapeHtml(r.public_id)}</span>
        </td>
        <td>
          <div style="font-weight: 600; color: #334155; font-size: 0.85rem;">${escapeHtml(leader.full_name || "N/A")}</div>
          <div style="font-size: 0.75rem; color: #64748B;">${escapeHtml(leader.email || "")}</div>
        </td>
        <td>
          <span class="badge badge-primary" style="background: #EFF6FF; color: #1D4ED8; font-weight: 700; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem;">
            ${membersCount} Members
          </span>
        </td>
        <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.82rem; color: #475569;" title="${escapeHtml(college)}">${escapeHtml(college)}</td>
        <td><span class="domain-tag" style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; background: #F1F5F9; color: #334155; font-weight: 500;">${escapeHtml(r.domain)}</span></td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-outline btn-sm btn-team-link" data-ref="${escapeHtml(r.public_id)}" style="padding: 3px 9px; font-size: 0.78rem;">
            <i class="fa-solid fa-eye"></i> <span>View Roster</span>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Bind View Roster buttons
  tbody.querySelectorAll(".btn-team-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ref = btn.getAttribute("data-ref");
      openTeamDetailsModal(ref);
    });
  });
}

/**
 * Renders the Financial Audit & Payments ledger table view
 */
function renderPaymentsDirectory() {
  const tbody = document.getElementById("paymentsTableBody");
  const countEl = document.getElementById("paymentsShowingCount");
  if (!tbody) return;

  const records = window.latestRegistrationsCache || [];
  const search = (document.getElementById("paymentsSearchInput")?.value || "").toLowerCase().trim();
  const statusFilter = document.getElementById("paymentsStatusFilter")?.value || "all";

  const filtered = records.filter((r) => {
    if (statusFilter !== "all" && r.payment_status !== statusFilter) return false;
    if (search) {
      const pName = r.participant ? r.participant.full_name : "";
      const teamName = r.team ? r.team.team_name : (r.team_name || "");
      const txn = r.payment_id || r.transaction_id || "";
      const targetStr = `${r.public_id} ${pName} ${teamName} ${txn} ${r.domain}`.toLowerCase();
      if (!targetStr.includes(search)) return false;
    }
    return true;
  });

  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${records.length} transactions`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2.5rem 1rem; color: var(--color-text-muted);">
          <div style="font-size: 1.75rem; margin-bottom: 0.5rem; opacity: 0.4;"><i class="fa-solid fa-receipt"></i></div>
          <div style="font-weight: 600; color: var(--color-text-main);">No payment transactions found</div>
          <div style="font-size: 0.85rem; margin-top: 0.25rem;">Adjust search query or payment status filter.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((r) => {
    const isTeam = r.registration_type === "team";
    const entityName = isTeam ? (r.team?.team_name || r.team_name || "Team Squad") : (r.participant?.full_name || "Solo Hacker");
    const txnId = r.payment_id || r.transaction_id || (r.payment_status === "paid" ? `TXN_${r.public_id.replace('-', '_')}` : "Pending (Offline/Gateway)");

    let statusBadge = "";
    if (r.payment_status === "paid") {
      statusBadge = `<span class="badge badge-success" style="background: #ECFDF5; color: #047857; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> Verified Paid</span>`;
    } else if (r.payment_status === "failed") {
      statusBadge = `<span class="badge badge-danger" style="background: #FEF2F2; color: #B91C1C; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: 600;"><i class="fa-solid fa-circle-xmark"></i> Failed</span>`;
    } else {
      statusBadge = `<span class="badge badge-warning" style="background: #FFFBEB; color: #B45309; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: 600;"><i class="fa-solid fa-clock"></i> Unpaid / Pending</span>`;
    }

    const formattedDate = r.created_at ? r.created_at.replace("T", " ").substring(0, 16) : "N/A";

    return `
      <tr>
        <td>
          <span style="font-family: monospace; font-weight: 700; color: #1E40AF; background: #EFF6FF; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">
            ${escapeHtml(r.public_id)}
          </span>
        </td>
        <td>
          <div style="font-weight: 700; color: #1E293B; font-size: 0.88rem;">${escapeHtml(entityName)}</div>
          <span style="font-size: 0.75rem; color: #64748B;">${escapeHtml(r.participant?.email || "")}</span>
        </td>
        <td>
          <span class="badge ${isTeam ? 'badge-primary' : 'badge-secondary'}" style="font-size: 0.75rem; padding: 2px 7px;">
            ${isTeam ? 'Team Entry' : 'Individual Entry'}
          </span>
        </td>
        <td>
          <span style="font-weight: 800; font-size: 0.95rem; color: ${r.payment_status === 'paid' ? '#059669' : '#1E293B'};">
            ₹${r.entry_fee}
          </span>
        </td>
        <td>${statusBadge}</td>
        <td>
          <code style="font-size: 0.75rem; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 2px 6px; border-radius: 4px; color: #475569;">
            ${escapeHtml(txnId)}
          </code>
        </td>
        <td style="font-size: 0.78rem; color: #64748B;">${formattedDate}</td>
      </tr>
    `;
  }).join("");
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
      let statusHtml = `<span class="badge badge-primary" style="font-size: 0.72rem; margin-right: 4px;"><i class="fa-solid fa-bullhorn"></i> Portal</span>`;
      if (a.email_sent) {
        statusHtml += `<span class="badge badge-success" style="font-size: 0.72rem; margin-right: 4px;"><i class="fa-solid fa-envelope"></i> Email</span>`;
      }
      if (a.delivery_status) {
        statusHtml += `<div style="font-size: 0.72rem; color: var(--color-text-muted); margin-top: 3px;">${escapeHtml(a.delivery_status)}</div>`;
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
      const sendEmailInput = document.getElementById("announcementSendEmail");
      const sendEmail = sendEmailInput ? sendEmailInput.checked : false;
      const submitBtn = document.getElementById("btnSendAnnouncement");

      if (title.length < 3) {
        showBanner(banner, "Announcement title must be at least 3 characters.", "error");
        return;
      }
      if (message.length < 5) {
        showBanner(banner, "Announcement message must be at least 5 characters.", "error");
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
            send_email: sendEmail,
          }),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          const emailStatus = json.delivery?.email?.status || "";
          showBanner(
            banner,
            `<strong>Announcement Published to Portal!</strong>${emailStatus ? ' ' + escapeHtml(emailStatus) : ''}`,
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

  const clearBtn = document.getElementById("btnClearAnnouncements");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to clear all announcement dispatch history messages?")) {
        return;
      }
      clearBtn.disabled = true;
      const origHtml = clearBtn.innerHTML;
      clearBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Clearing...`;
      try {
        const res = await fetch("/api/admin/announcements", {
          method: "DELETE",
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showBanner(banner, data.message || "Announcement history cleared.", "success");
          await loadRecentAnnouncements();
        } else {
          showBanner(banner, data.error || "Failed to clear announcements.", "error");
        }
      } catch (err) {
        console.error("Clear announcements error:", err);
        showBanner(banner, "Network error while clearing announcements.", "error");
      } finally {
        clearBtn.disabled = false;
        clearBtn.innerHTML = origHtml;
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
 * FEATURE 3: Event Settings Handlers & Confidential Access Vault
 */
async function checkSettingsAuthStatus() {
  try {
    const res = await fetch("/api/admin/settings/status");
    if (!res.ok) {
      setSettingsLockedState(true);
      return false;
    }
    const json = await res.json();
    const isUnlocked = json.success && json.is_unlocked === true;
    setSettingsLockedState(!isUnlocked);
    if (isUnlocked) {
      await loadEventSettings();
      await loadSmtpSettings();
    }
    return isUnlocked;
  } catch (err) {
    console.error("Error checking settings auth status:", err);
    setSettingsLockedState(true);
    return false;
  }
}

function setSettingsLockedState(isLocked) {
  const gateEl = document.getElementById("settingsLockedGate");
  const contentEl = document.getElementById("settingsUnlockedContent");
  const lockBtn = document.getElementById("btnLockSettings");
  const reloadBtn = document.getElementById("btnReloadSettings");
  const pwdInput = document.getElementById("settingsUnlockPassword");
  const alertEl = document.getElementById("settingsUnlockAlert");

  if (isLocked) {
    if (gateEl) gateEl.style.display = "block";
    if (contentEl) contentEl.style.display = "none";
    if (lockBtn) lockBtn.style.display = "none";
    if (reloadBtn) reloadBtn.style.display = "none";
    if (pwdInput) pwdInput.value = "";
  } else {
    if (gateEl) gateEl.style.display = "none";
    if (contentEl) contentEl.style.display = "block";
    if (lockBtn) lockBtn.style.display = "inline-flex";
    if (reloadBtn) reloadBtn.style.display = "inline-flex";
    if (alertEl) alertEl.style.display = "none";
  }
}

async function loadEventSettings() {
  const banner = document.getElementById("settingsAlertBanner");
  try {
    const res = await fetch("/api/admin/settings");
    if (res.status === 403) {
      setSettingsLockedState(true);
      return;
    }
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
  const lockBtn = document.getElementById("btnLockSettings");
  const unlockForm = document.getElementById("settingsUnlockForm");
  const unlockAlert = document.getElementById("settingsUnlockAlert");
  const btnUnlock = document.getElementById("btnUnlockSettings");
  const banner = document.getElementById("settingsAlertBanner");

  // Confidential Unlock Form Listener
  if (unlockForm) {
    unlockForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById("settingsUnlockUsername");
      const passwordInput = document.getElementById("settingsUnlockPassword");
      const username = usernameInput ? usernameInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value.trim() : "";

      if (!username || !password) {
        showBanner(unlockAlert, "Please enter both confidential username and password.", "error");
        return;
      }

      if (btnUnlock) {
        btnUnlock.disabled = true;
        var origHtml = btnUnlock.innerHTML;
        btnUnlock.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Verifying Vault Access...</span>`;
      }
      hideBanner(unlockAlert);

      try {
        const res = await fetch("/api/admin/settings/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setSettingsLockedState(false);
          await loadEventSettings();
          await loadSmtpSettings();
          const settingsBanner = document.getElementById("settingsAlertBanner");
          if (settingsBanner) {
            showBanner(settingsBanner, "Confidential event settings vault unlocked successfully.", "success");
          }
        } else {
          showBanner(unlockAlert, json.error || "Access Denied: Invalid confidential settings credentials.", "error");
        }
      } catch (err) {
        console.error("Unlock error:", err);
        showBanner(unlockAlert, "Network error while authenticating settings vault.", "error");
      } finally {
        if (btnUnlock) {
          btnUnlock.disabled = false;
          btnUnlock.innerHTML = origHtml;
        }
      }
    });
  }

  // Lock Settings Button Listener
  if (lockBtn) {
    lockBtn.addEventListener("click", async () => {
      lockBtn.disabled = true;
      try {
        await fetch("/api/admin/settings/lock", { method: "POST" });
      } catch (err) {
        console.error("Lock error:", err);
      } finally {
        lockBtn.disabled = false;
        setSettingsLockedState(true);
      }
    });
  }

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
  let icon = "fa-circle-check";
  if (type === "error") icon = "fa-triangle-exclamation";
  else if (type === "warning") icon = "fa-triangle-exclamation";
  else if (type === "info") icon = "fa-circle-info";
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


/**
 * ==============================================================================
 * FEATURE 5: INQUIRIES & EMAIL COMMUNICATION LOGIC
 * ==============================================================================
 */

let currentInquiriesSearch = "";
let currentInquiriesStatus = "all";
let activeInquiry = null;

async function loadInquiries() {
  const tbody = document.getElementById("inquiriesTableBody");
  if (!tbody) return;

  const statTotal = document.getElementById("statTotalInquiries");
  const statUnread = document.getElementById("statUnreadInquiries");
  const statReplied = document.getElementById("statRepliedInquiries");
  const unreadBadge = document.getElementById("inquiriesUnreadBadge");

  try {
    const params = new URLSearchParams();
    if (currentInquiriesSearch) params.set("search", currentInquiriesSearch);
    if (currentInquiriesStatus && currentInquiriesStatus !== "all") params.set("status", currentInquiriesStatus);

    const res = await fetch(`/api/admin/inquiries?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to load inquiries");
    const json = await res.json();

    if (!json.success) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-error); padding: 1.5rem;">Error loading inquiries.</td></tr>`;
      return;
    }

    // Update stats & badges
    if (statTotal) statTotal.textContent = json.total_count ?? 0;
    if (statUnread) statUnread.textContent = json.unread_count ?? 0;
    if (statReplied) statReplied.textContent = json.replied_count ?? 0;

    if (unreadBadge) {
      const count = json.unread_count || 0;
      if (count > 0) {
        unreadBadge.textContent = count;
        unreadBadge.style.display = "inline-block";
      } else {
        unreadBadge.style.display = "none";
      }
    }

    const inquiries = json.inquiries || [];
    if (inquiries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No inquiries matching current filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = inquiries.map((inq) => {
      // Status badge
      let statusHtml = "";
      if (inq.is_replied) {
        statusHtml = `<span class="badge" style="background: #DCFCE7; color: #166534; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: 600;"><i class="fa-solid fa-reply"></i> Replied</span>`;
      } else if (!inq.is_read) {
        statusHtml = `<span class="badge" style="background: #FEE2E2; color: #991B1B; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: 600;"><i class="fa-solid fa-envelope"></i> Unread</span>`;
      } else {
        statusHtml = `<span class="badge" style="background: #F1F5F9; color: #475569; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: 500;"><i class="fa-regular fa-envelope-open"></i> Read</span>`;
      }

      // Date formatting
      let formattedDate = "N/A";
      if (inq.created_at) {
        const d = new Date(inq.created_at);
        formattedDate = d.toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      }

      const snippet = escapeHtml(inq.message || "").substring(0, 75) + ((inq.message || "").length > 75 ? "..." : "");

      return `
        <tr style="${!inq.is_read ? 'background: #FEF2F2 !important; font-weight: 500;' : ''}">
          <td>
            <div style="font-weight: 700; color: var(--color-text-main); font-size: 0.88rem;">${escapeHtml(inq.name)}</div>
            <div style="font-size: 0.78rem; color: var(--color-text-secondary); margin-top: 2px;">
              <a href="mailto:${escapeHtml(inq.email)}" style="color: var(--color-primary);">${escapeHtml(inq.email)}</a>
            </div>
          </td>
          <td>
            <div style="font-weight: 600; color: var(--color-text-main); font-size: 0.85rem;">${escapeHtml(inq.subject)}</div>
          </td>
          <td style="color: var(--color-text-secondary); font-size: 0.82rem; line-height: 1.4;">${snippet}</td>
          <td style="font-size: 0.78rem; color: var(--color-text-muted); white-space: nowrap;">${formattedDate}</td>
          <td>${statusHtml}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button type="button" class="btn btn-outline btn-sm btn-view-inquiry" data-id="${inq.id}" style="padding: 3px 8px; font-size: 0.75rem; font-weight: 600; margin-right: 4px;" title="View & Reply">
              <i class="fa-solid fa-eye"></i> View &amp; Reply
            </button>
            <button type="button" class="btn btn-outline btn-sm btn-toggle-inquiry" data-id="${inq.id}" data-read="${inq.is_read}" style="padding: 3px 6px; font-size: 0.75rem;" title="${inq.is_read ? 'Mark Unread' : 'Mark Read'}">
              <i class="fa-solid ${inq.is_read ? 'fa-envelope' : 'fa-envelope-open'}"></i>
            </button>
            <button type="button" class="btn btn-outline btn-sm btn-delete-inquiry" data-id="${inq.id}" style="padding: 3px 6px; font-size: 0.75rem; color: var(--color-error); border-color: #FECACA;" title="Delete Message">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");

    // Attach row button events
    tbody.querySelectorAll(".btn-view-inquiry").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        openInquiryModal(id);
      });
    });

    tbody.querySelectorAll(".btn-toggle-inquiry").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const currentRead = btn.getAttribute("data-read") === "true";
        await toggleInquiryReadStatus(id, !currentRead);
      });
    });

    tbody.querySelectorAll(".btn-delete-inquiry").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        if (confirm("Are you sure you want to delete this inquiry message?")) {
          await deleteInquiryMessage(id);
        }
      });
    });

  } catch (err) {
    console.error("Error loading inquiries:", err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-error); padding: 1.5rem;">Network error loading inquiries.</td></tr>`;
  }
}

async function openInquiryModal(id) {
  const modal = document.getElementById("inquiryModal");
  if (!modal) return;

  const alertBanner = document.getElementById("inquiryModalAlertBanner");
  if (alertBanner) alertBanner.style.display = "none";

  const senderNameEl = document.getElementById("inquirySenderName");
  const senderEmailEl = document.getElementById("inquirySenderEmail");
  const subjectEl = document.getElementById("inquirySubject");
  const bodyEl = document.getElementById("inquiryMessageBody");
  const refEl = document.getElementById("inquiryModalRef");
  const badgeContainer = document.getElementById("inquiryStatusBadgeContainer");
  const replyBox = document.getElementById("inquiryPreviousReplyBox");
  const prevReplyText = document.getElementById("inquiryPreviousReplyText");
  const repliedAtEl = document.getElementById("inquiryRepliedAtTime");

  const replyIdInput = document.getElementById("inquiryReplyId");
  const replySubjectInput = document.getElementById("inquiryReplySubject");
  const replyMessageInput = document.getElementById("inquiryReplyMessage");

  // Show modal in loading state
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
  if (bodyEl) bodyEl.textContent = "Loading inquiry details...";

  if (currentEmailSettings) {
    updateModalDeliveryBanners(currentEmailSettings);
  } else {
    loadSmtpSettings();
  }

  try {
    const res = await fetch(`/api/admin/inquiries/${id}`);
    const json = await res.json();

    if (!res.ok || !json.success) {
      if (bodyEl) bodyEl.textContent = "Failed to load inquiry details.";
      return;
    }

    const inq = json.inquiry;
    activeInquiry = inq;

    if (senderNameEl) senderNameEl.textContent = inq.name || "Inquirer";
    if (senderEmailEl) {
      senderEmailEl.textContent = inq.email;
      senderEmailEl.href = `mailto:${inq.email}`;
    }
    if (subjectEl) subjectEl.textContent = inq.subject || "(No Subject)";
    if (bodyEl) bodyEl.textContent = inq.message || "";

    if (refEl && inq.created_at) {
      const d = new Date(inq.created_at);
      refEl.textContent = `Received: ${d.toLocaleString()}`;
    }

    if (badgeContainer) {
      if (inq.is_replied) {
        badgeContainer.innerHTML = `<span class="badge" style="background: #DCFCE7; color: #166534; font-size: 0.75rem; padding: 4px 10px; border-radius: 4px; font-weight: 700;"><i class="fa-solid fa-reply"></i> Replied</span>`;
      } else {
        badgeContainer.innerHTML = `<span class="badge" style="background: #EFF6FF; color: #1E40AF; font-size: 0.75rem; padding: 4px 10px; border-radius: 4px; font-weight: 700;"><i class="fa-solid fa-envelope-open"></i> Read</span>`;
      }
    }

    if (inq.is_replied && replyBox && prevReplyText) {
      replyBox.style.display = "block";
      prevReplyText.textContent = inq.reply_message || "";
      if (repliedAtEl && inq.replied_at) {
        const rd = new Date(inq.replied_at);
        repliedAtEl.textContent = `Replied: ${rd.toLocaleString()}`;
      }
    } else if (replyBox) {
      replyBox.style.display = "none";
    }

    if (replyIdInput) replyIdInput.value = inq.id;
    if (replySubjectInput) replySubjectInput.value = `Re: ${inq.subject || "SYNEX 2026 Inquiry"}`;
    if (replyMessageInput) replyMessageInput.value = "";

    // Refresh list in background to update unread badge
    loadInquiries();

  } catch (err) {
    console.error("Failed to load inquiry details:", err);
  }
}

async function toggleInquiryReadStatus(id, newReadStatus) {
  try {
    const res = await fetch(`/api/admin/inquiries/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_read: newReadStatus })
    });
    if (res.ok) {
      await loadInquiries();
    }
  } catch (err) {
    console.error("Failed to toggle inquiry status:", err);
  }
}

async function deleteInquiryMessage(id) {
  try {
    const res = await fetch(`/api/admin/inquiries/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (res.ok && json.success) {
      const banner = document.getElementById("inquiryAlertBanner");
      if (banner) showBanner(banner, "Inquiry deleted successfully.", "success");
      await loadInquiries();
    }
  } catch (err) {
    console.error("Failed to delete inquiry:", err);
  }
}

function setupInquiriesHandlers() {
  const searchInput = document.getElementById("inquiriesSearchInput");
  let searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        currentInquiriesSearch = e.target.value.trim();
        loadInquiries();
      }, 300);
    });
  }

  const statusFilter = document.getElementById("inquiriesStatusFilter");
  if (statusFilter) {
    statusFilter.addEventListener("change", (e) => {
      currentInquiriesStatus = e.target.value;
      loadInquiries();
    });
  }

  const btnReload = document.getElementById("btnReloadInquiries");
  if (btnReload) {
    btnReload.addEventListener("click", () => {
      loadInquiries();
      loadEmailLogs();
    });
  }

  // Inquiry Reply Form
  const replyForm = document.getElementById("inquiryReplyForm");
  const btnSendReply = document.getElementById("btnSendInquiryReply");
  const modalAlert = document.getElementById("inquiryModalAlertBanner");

  if (replyForm) {
    replyForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("inquiryReplyId").value;
      const subject = document.getElementById("inquiryReplySubject").value.trim();
      const message = document.getElementById("inquiryReplyMessage").value.trim();

      if (!message) {
        if (modalAlert) showBanner(modalAlert, "Please enter a reply message.", "error");
        return;
      }

      btnSendReply.disabled = true;
      const origHtml = btnSendReply.innerHTML;
      btnSendReply.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Sending Email...</span>`;

      try {
        const res = await fetch(`/api/admin/inquiries/${id}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: subject, message: message })
        });

        const json = await res.json();

        if (res.ok && json.success) {
          if (json.is_simulated) {
            if (modalAlert) {
              showBanner(
                modalAlert,
                `⚠️ Reply saved to Admin Outbox (SIMULATION MODE). A real email was NOT delivered to ${activeInquiry ? activeInquiry.email : 'inquirer'} because outgoing mail credentials are not configured in Event Settings.`,
                "warning"
              );
            }
          } else {
            if (modalAlert) showBanner(modalAlert, json.message || "Reply email dispatched successfully to inquirer's inbox!", "success");
          }

          document.getElementById("inquiryReplyMessage").value = "";

          // Update previous reply view inside modal
          const replyBox = document.getElementById("inquiryPreviousReplyBox");
          const prevReplyText = document.getElementById("inquiryPreviousReplyText");
          const repliedAtEl = document.getElementById("inquiryRepliedAtTime");
          if (replyBox && prevReplyText) {
            replyBox.style.display = "block";
            prevReplyText.textContent = message;
            if (repliedAtEl) repliedAtEl.textContent = `Replied: Just now`;
          }

          const inquiryBanner = document.getElementById("inquiryAlertBanner");
          if (inquiryBanner) {
            const statusMsg = json.is_simulated
              ? `Reply recorded in Outbox for ${activeInquiry ? activeInquiry.email : 'inquirer'} (Simulation Mode).`
              : `Live email reply sent to ${activeInquiry ? activeInquiry.email : 'inquirer'}!`;
            showBanner(inquiryBanner, statusMsg, json.is_simulated ? "warning" : "success");
          }

          await loadInquiries();
          await loadEmailLogs();

          if (json.is_live_delivered) {
            setTimeout(() => {
              const modal = document.getElementById("inquiryModal");
              if (modal) {
                modal.classList.remove("active");
                document.body.style.overflow = "";
              }
            }, 1800);
          }
        } else {
          if (modalAlert) showBanner(modalAlert, json.error || "Failed to send email reply.", "error");
        }
      } catch (err) {
        console.error("Reply send error:", err);
        if (modalAlert) showBanner(modalAlert, "Network error while sending email reply.", "error");
      } finally {
        btnSendReply.disabled = false;
        btnSendReply.innerHTML = origHtml;
      }
    });
  }

  // Inquiry Modal close
  const inquiryModal = document.getElementById("inquiryModal");
  const btnCloseInquiryModal = document.getElementById("btnCloseInquiryModal");
  const btnInquiryCloseFooter = document.getElementById("btnInquiryCloseFooter");
  const btnToggleInquiryStatusModal = document.getElementById("btnToggleInquiryStatusModal");

  if (btnToggleInquiryStatusModal) {
    btnToggleInquiryStatusModal.addEventListener("click", async () => {
      if (activeInquiry) {
        await toggleInquiryReadStatus(activeInquiry.id, !activeInquiry.is_read);
        activeInquiry.is_read = !activeInquiry.is_read;
        const badgeContainer = document.getElementById("inquiryStatusBadgeContainer");
        if (badgeContainer) {
          badgeContainer.innerHTML = activeInquiry.is_read
            ? `<span class="badge" style="background: #EFF6FF; color: #1E40AF; font-size: 0.75rem; padding: 4px 10px; border-radius: 4px; font-weight: 700;"><i class="fa-solid fa-envelope-open"></i> Read</span>`
            : `<span class="badge" style="background: #FEE2E2; color: #991B1B; font-size: 0.75rem; padding: 4px 10px; border-radius: 4px; font-weight: 700;"><i class="fa-solid fa-envelope"></i> Unread</span>`;
        }
      }
    });
  }

  [btnCloseInquiryModal, btnInquiryCloseFooter].forEach(btn => {
    if (btn) {
      btn.addEventListener("click", () => {
        if (inquiryModal) {
          inquiryModal.classList.remove("active");
          document.body.style.overflow = "";
        }
      });
    }
  });

  if (inquiryModal) {
    inquiryModal.addEventListener("click", (e) => {
      if (e.target === inquiryModal) {
        inquiryModal.classList.remove("active");
        document.body.style.overflow = "";
      }
    });
  }

  // Compose Email Modal
  const btnOpenCompose = document.getElementById("btnOpenComposeEmail");
  const composeModal = document.getElementById("composeEmailModal");
  const btnCloseCompose = document.getElementById("btnCloseComposeEmailModal");
  const btnCancelCompose = document.getElementById("btnCancelComposeEmail");
  const composeForm = document.getElementById("composeEmailForm");
  const btnSubmitCompose = document.getElementById("btnSubmitComposeEmail");
  const composeAlert = document.getElementById("composeEmailAlertBanner");

  if (btnOpenCompose && composeModal) {
    btnOpenCompose.addEventListener("click", () => {
      if (composeAlert) composeAlert.style.display = "none";
      if (currentEmailSettings) {
        updateModalDeliveryBanners(currentEmailSettings);
      } else {
        loadSmtpSettings();
      }
      composeModal.classList.add("active");
      document.body.style.overflow = "hidden";
    });
  }

  [btnCloseCompose, btnCancelCompose].forEach(btn => {
    if (btn && composeModal) {
      btn.addEventListener("click", () => {
        composeModal.classList.remove("active");
        document.body.style.overflow = "";
      });
    }
  });

  if (composeModal) {
    composeModal.addEventListener("click", (e) => {
      if (e.target === composeModal) {
        composeModal.classList.remove("active");
        document.body.style.overflow = "";
      }
    });
  }

  if (composeForm) {
    composeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const toEmail = document.getElementById("composeToEmail").value.trim();
      const subject = document.getElementById("composeSubject").value.trim();
      const message = document.getElementById("composeMessage").value.trim();

      if (!toEmail || !subject || !message) {
        if (composeAlert) showBanner(composeAlert, "Please fill in recipient, subject, and message.", "error");
        return;
      }

      btnSubmitCompose.disabled = true;
      const origHtml = btnSubmitCompose.innerHTML;
      btnSubmitCompose.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Sending...</span>`;

      try {
        const res = await fetch("/api/admin/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to_email: toEmail, subject: subject, message: message })
        });
        const json = await res.json();

        if (res.ok && json.success) {
          if (json.is_simulated) {
            if (composeAlert) {
              showBanner(
                composeAlert,
                `⚠️ Email recorded in Outbox (SIMULATION MODE). No live email was dispatched to ${toEmail} because outgoing credentials are not configured in Event Settings.`,
                "warning"
              );
            }
          } else {
            if (composeAlert) showBanner(composeAlert, json.message || "Email delivered successfully!", "success");
          }

          composeForm.reset();
          await loadEmailLogs();

          const inquiryBanner = document.getElementById("inquiryAlertBanner");
          if (inquiryBanner) {
            const statusMsg = json.is_simulated
              ? `Outbound email recorded in Outbox for ${toEmail} (Simulation Mode).`
              : `Outbound email delivered to ${toEmail}!`;
            showBanner(inquiryBanner, statusMsg, json.is_simulated ? "warning" : "success");
          }

          if (json.is_live_delivered) {
            setTimeout(() => {
              composeModal.classList.remove("active");
              document.body.style.overflow = "";
            }, 1800);
          }
        } else {
          if (composeAlert) showBanner(composeAlert, json.error || "Failed to deliver email.", "error");
        }
      } catch (err) {
        console.error("Compose email error:", err);
        if (composeAlert) showBanner(composeAlert, "Network error while sending email.", "error");
      } finally {
        btnSubmitCompose.disabled = false;
        btnSubmitCompose.innerHTML = origHtml;
      }
    });
  }

  // Outbox toggle
  const btnToggleOutbox = document.getElementById("btnToggleOutboxLog");
  const outboxContainer = document.getElementById("outboxLogContainer");
  const outboxToggleText = document.getElementById("outboxToggleText");

  if (btnToggleOutbox && outboxContainer) {
    btnToggleOutbox.addEventListener("click", () => {
      const isHidden = outboxContainer.style.display === "none";
      outboxContainer.style.display = isHidden ? "block" : "none";
      if (outboxToggleText) outboxToggleText.textContent = isHidden ? "Hide Outbox Log" : "Show Outbox Log";
      if (isHidden) loadEmailLogs();
    });
  }
}

async function loadEmailLogs() {
  const tbody = document.getElementById("outboxLogTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/api/admin/email/logs?limit=25");
    const json = await res.json();

    if (!res.ok || !json.success || !json.logs || json.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 1rem;">No recent outbound email activity.</td></tr>`;
      return;
    }

    tbody.innerHTML = json.logs.map(log => {
      let statusBadge = "";
      if (log.status === "sent") {
        statusBadge = `<span class="badge" style="background: #DCFCE7; color: #166534;"><i class="fa-solid fa-check"></i> Sent</span>`;
      } else if (log.status === "failed") {
        statusBadge = `<span class="badge" style="background: #FEE2E2; color: #991B1B;"><i class="fa-solid fa-xmark"></i> Failed</span>`;
      } else {
        statusBadge = `<span class="badge" style="background: #FEF3C7; color: #92400E;"><i class="fa-solid fa-box-archive"></i> Simulated</span>`;
      }

      const d = log.created_at ? new Date(log.created_at).toLocaleString() : "N/A";

      return `
        <tr>
          <td><strong style="color: var(--color-text-main);">${escapeHtml(log.recipient)}</strong></td>
          <td>${escapeHtml(log.subject)}</td>
          <td><span style="text-transform: capitalize; font-size: 0.75rem; background: #F1F5F9; padding: 2px 6px; border-radius: 4px;">${escapeHtml(log.email_type || 'direct')}</span></td>
          <td>${statusBadge}</td>
          <td style="color: var(--color-text-muted); font-size: 0.75rem;">${d}</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Error loading email logs:", err);
  }
}

let currentEmailSettings = null;

function updateModalDeliveryBanners(s) {
  const configs = [
    {
      banner: document.getElementById("inquiryDeliveryStatusBanner"),
      text: document.getElementById("inquiryDeliveryStatusText"),
      link: document.getElementById("inquiryDeliveryConfigLink"),
    },
    {
      banner: document.getElementById("composeDeliveryStatusBanner"),
      text: document.getElementById("composeDeliveryStatusText"),
      link: document.getElementById("composeDeliveryConfigLink"),
    }
  ];

  configs.forEach(({ banner, text, link }) => {
    if (!banner || !text) return;
    if (s && s.is_configured) {
      banner.style.background = "#F0FDF4";
      banner.style.borderColor = "#BBF7D0";
      banner.style.color = "#166534";
      const icon = banner.querySelector("i");
      if (icon) {
        icon.className = "fa-solid fa-circle-check";
        icon.style.color = "#16A34A";
      }
      text.innerHTML = `<strong>Live Delivery Active:</strong> Outgoing replies will be delivered directly to recipient inbox via <strong>${escapeHtml(s.provider === 'resend' ? 'Resend HTTPS API (Port 443)' : 'SMTP Server')}</strong>.`;
      if (link) {
        link.textContent = "Change Settings";
        link.style.color = "#15803D";
        link.onclick = (e) => {
          e.preventDefault();
          scrollToEmailSettings();
        };
      }
    } else {
      banner.style.background = "#FEF3C7";
      banner.style.borderColor = "#FCD34D";
      banner.style.color = "#92400E";
      const icon = banner.querySelector("i");
      if (icon) {
        icon.className = "fa-solid fa-triangle-exclamation";
        icon.style.color = "#D97706";
      }
      text.innerHTML = `<strong>Simulation Mode Active:</strong> No outgoing email credentials configured. Replies will be saved in your Admin Outbox, but <u>NO real email</u> will reach the recipient.`;
      if (link) {
        link.textContent = "Configure Live Delivery";
        link.style.color = "#B45309";
        link.onclick = (e) => {
          e.preventDefault();
          scrollToEmailSettings();
        };
      }
    }
  });
}

function scrollToEmailSettings() {
  const openModal = document.querySelector(".team-modal-backdrop.active");
  if (openModal) {
    openModal.classList.remove("active");
    document.body.style.overflow = "";
  }
  const target = document.getElementById("smtpSettingsForm") || document.getElementById("settingsSection");
  if (target) {
    target.scrollIntoView({ behavior: "smooth" });
  }
}

async function loadSmtpSettings() {
  const radioResend = document.getElementById("providerRadioResend");
  const radioSmtp = document.getElementById("providerRadioSmtp");
  const resendGroup = document.getElementById("resendFieldsGroup");
  const smtpGroup = document.getElementById("smtpFieldsGroup");
  const resendApiKeyEl = document.getElementById("resendApiKey");
  const resendSenderEl = document.getElementById("resendSender");

  const hostEl = document.getElementById("smtpHost");
  const portEl = document.getElementById("smtpPort");
  const userEl = document.getElementById("smtpUsername");
  const pwdEl = document.getElementById("smtpPassword");
  const senderEl = document.getElementById("smtpSender");
  const tlsEl = document.getElementById("smtpUseTls");
  const sslEl = document.getElementById("smtpUseSsl");
  const statusBadge = document.getElementById("smtpStatusBadge");

  try {
    const res = await fetch("/api/admin/email/settings");
    const json = await res.json();

    if (res.ok && json.success && json.settings) {
      const s = json.settings;
      currentEmailSettings = s;

      const isResend = (s.provider === "resend");
      if (radioResend) radioResend.checked = isResend;
      if (radioSmtp) radioSmtp.checked = !isResend;

      if (resendGroup) resendGroup.style.display = isResend ? "block" : "none";
      if (smtpGroup) smtpGroup.style.display = isResend ? "none" : "block";

      if (resendApiKeyEl) {
        resendApiKeyEl.value = "";
        resendApiKeyEl.placeholder = s.has_resend_key ? "•••••••••••• (API Key Configured - leave blank to keep)" : "re_123456789_abcdef...";
      }
      if (resendSenderEl) {
        if (!s.default_sender || s.default_sender.includes("synex2026.org") || s.default_sender.includes("synex.org") || s.default_sender.includes("noreply")) {
          resendSenderEl.value = "SYNEX Hackathon <onboarding@resend.dev>";
        } else {
          resendSenderEl.value = s.default_sender;
        }
      }

      if (hostEl) hostEl.value = s.host || "smtp.gmail.com";
      if (portEl) portEl.value = s.port || 587;
      if (userEl) userEl.value = s.username || "";
      if (pwdEl) {
        pwdEl.value = "";
        pwdEl.placeholder = s.has_password ? "•••••••••••• (Password Configured - leave blank to keep)" : "••••••••••••";
      }
      if (senderEl) senderEl.value = s.default_sender || "";
      if (tlsEl) tlsEl.checked = !!s.use_tls;
      if (sslEl) sslEl.checked = !!s.use_ssl;

      if (statusBadge) {
        if (s.is_configured) {
          const providerLabel = isResend ? "Resend HTTPS Active (Port 443)" : "SMTP Live Active";
          statusBadge.innerHTML = `<span class="badge" style="background: #DCFCE7; color: #166534; padding: 4px 10px; border-radius: 4px; font-size: 0.78rem; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(providerLabel)}</span>`;
        } else {
          statusBadge.innerHTML = `<span class="badge" style="background: #FEF3C7; color: #92400E; padding: 4px 10px; border-radius: 4px; font-size: 0.78rem; font-weight: 600;"><i class="fa-solid fa-triangle-exclamation"></i> Simulation Mode (Credentials Missing)</span>`;
        }
      }

      updateModalDeliveryBanners(s);
    }
  } catch (err) {
    console.error("Error loading email settings:", err);
  }
}

function setupSmtpHandlers() {
  const form = document.getElementById("smtpSettingsForm");
  const btnSave = document.getElementById("btnSaveSmtp");
  const btnTest = document.getElementById("btnTestSmtp");
  const banner = document.getElementById("smtpAlertBanner");

  const radioResend = document.getElementById("providerRadioResend");
  const radioSmtp = document.getElementById("providerRadioSmtp");
  const resendGroup = document.getElementById("resendFieldsGroup");
  const smtpGroup = document.getElementById("smtpFieldsGroup");

  if (radioResend && radioSmtp) {
    radioResend.addEventListener("change", () => {
      if (resendGroup) resendGroup.style.display = "block";
      if (smtpGroup) smtpGroup.style.display = "none";
    });
    radioSmtp.addEventListener("change", () => {
      if (resendGroup) resendGroup.style.display = "none";
      if (smtpGroup) smtpGroup.style.display = "block";
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const isResend = radioResend ? radioResend.checked : true;
      const provider = isResend ? "resend" : "smtp";

      const resendApiKey = document.getElementById("resendApiKey") ? document.getElementById("resendApiKey").value.trim() : "";
      const resendSender = document.getElementById("resendSender") ? document.getElementById("resendSender").value.trim() : "";

      const host = document.getElementById("smtpHost") ? document.getElementById("smtpHost").value.trim() : "";
      const port = document.getElementById("smtpPort") ? document.getElementById("smtpPort").value.trim() : "587";
      const username = document.getElementById("smtpUsername") ? document.getElementById("smtpUsername").value.trim() : "";
      const password = document.getElementById("smtpPassword") ? document.getElementById("smtpPassword").value.trim() : "";
      const defaultSender = document.getElementById("smtpSender") ? document.getElementById("smtpSender").value.trim() : "";
      const useTls = document.getElementById("smtpUseTls") ? document.getElementById("smtpUseTls").checked : true;
      const useSsl = document.getElementById("smtpUseSsl") ? document.getElementById("smtpUseSsl").checked : false;

      btnSave.disabled = true;
      const origHtml = btnSave.innerHTML;
      btnSave.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving...</span>`;

      try {
        const payload = {
          provider: provider,
          default_sender: isResend ? (resendSender || defaultSender) : defaultSender,
        };

        if (isResend) {
          if (resendApiKey) payload.resend_key = resendApiKey;
        } else {
          payload.host = host;
          payload.port = port;
          payload.username = username;
          if (password) payload.password = password;
          payload.use_tls = useTls;
          payload.use_ssl = useSsl;
        }

        const res = await fetch("/api/admin/email/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = await res.json();

        if (res.ok && json.success) {
          if (banner) showBanner(banner, json.message || "Email server settings updated successfully!", "success");
          await loadSmtpSettings();
        } else {
          if (banner) showBanner(banner, json.error || "Failed to update email settings.", "error");
        }
      } catch (err) {
        console.error("Email settings save error:", err);
        if (banner) showBanner(banner, "Network error saving email settings.", "error");
      } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = origHtml;
      }
    });
  }

  if (btnTest) {
    btnTest.addEventListener("click", async () => {
      const recipient = prompt("Enter a recipient email address to send a live test message (e.g. your Gmail address):");
      if (recipient === null) return; // user cancelled prompt

      btnTest.disabled = true;
      const origHtml = btnTest.innerHTML;
      btnTest.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Sending Test...</span>`;

      try {
        const res = await fetch("/api/admin/email/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test_recipient: recipient.trim() })
        });
        const json = await res.json();

        if (res.ok && json.success) {
          if (banner) showBanner(banner, json.message || "Email connection test succeeded!", "success");
        } else {
          if (banner) showBanner(banner, json.message || json.error || "Email connection test failed.", "error");
        }
      } catch (err) {
        console.error("Email test error:", err);
        if (banner) showBanner(banner, "Network error testing email connection.", "error");
      } finally {
        btnTest.disabled = false;
        btnTest.innerHTML = origHtml;
      }
    });
  }
}

/**
 * ========================================================
 * E-CERTIFICATE STUDIO & DISTRIBUTION SYSTEM
 * ========================================================
 */
let certificateParticipantsCache = [];
let certificateTemplateInfoCache = null;

function setupCertificateHandlers() {
  const modal = document.getElementById("certPreviewModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeCertificatePreviewModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("active")) {
      closeCertificatePreviewModal();
    }
  });
}

async function loadCertificateSection() {
  await Promise.all([
    loadCertificateTemplateInfo(),
    loadCertificateParticipants(),
    loadCertificateHistory()
  ]);
}
window.loadCertificateSection = loadCertificateSection;

/**
 * Fetches and displays active PPTX template status and placeholders
 */
async function loadCertificateTemplateInfo() {
  const badgeEl = document.getElementById("badgeCertTemplateType");
  const filenameEl = document.getElementById("certActiveFilename");
  const sizeEl = document.getElementById("certActiveFileSize");
  const dateEl = document.getElementById("certActiveFileDate");
  const tagsCloud = document.getElementById("certPlaceholderTagsCloud");

  try {
    const res = await fetch("/api/admin/certificates/template");
    const json = await res.json();
    if (res.ok && json.success && json.data) {
      certificateTemplateInfoCache = json.data;
      if (badgeEl) {
        badgeEl.textContent = json.data.is_custom ? "Custom Template" : "Official Default";
        badgeEl.className = json.data.is_custom ? "badge badge-primary" : "badge badge-success";
      }
      if (filenameEl) filenameEl.textContent = json.data.filename || "synex_certificate_template.pptx";
      if (sizeEl) sizeEl.textContent = `${json.data.size_kb} KB`;
      if (dateEl) dateEl.textContent = json.data.updated_at || "Built-in";

      if (tagsCloud && Array.isArray(json.data.placeholders)) {
        tagsCloud.innerHTML = json.data.placeholders.map(p => `
          <span class="cert-placeholder-pill" title="Click to copy ${p.placeholder} to clipboard" onclick="copyCertPlaceholder('${p.placeholder}', this)">
            <code>${p.placeholder}</code>
            <i class="fa-regular fa-copy" style="font-size: 0.7rem; opacity: 0.7;"></i>
          </span>
        `).join("");
      }
    }
  } catch (err) {
    console.error("Error loading certificate template info:", err);
  }
}
window.loadCertificateTemplateInfo = loadCertificateTemplateInfo;

/**
 * Copies placeholder text to clipboard and flashes visual feedback
 */
function copyCertPlaceholder(text, el) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      if (el) {
        el.classList.add("copied");
        const origHtml = el.innerHTML;
        el.innerHTML = `<code>Copied!</code> <i class="fa-solid fa-check"></i>`;
        setTimeout(() => {
          el.classList.remove("copied");
          el.innerHTML = origHtml;
        }, 1200);
      }
    }).catch(() => {});
  }
}
window.copyCertPlaceholder = copyCertPlaceholder;

/**
 * Triggers direct browser download of the active PPTX presentation template
 */
function downloadActiveCertificateTemplate() {
  window.location.href = "/api/admin/certificates/template/download";
}
window.downloadActiveCertificateTemplate = downloadActiveCertificateTemplate;

/**
 * Triggers direct browser download of the sample certificate PDF
 */
function downloadSampleCertificatePdf() {
  window.location.href = "/api/admin/certificates/preview?sample=true&download=true";
}
window.downloadSampleCertificatePdf = downloadSampleCertificatePdf;

/**
 * Handles uploading a custom .pptx presentation template
 */
async function handleCertificateTemplateUpload() {
  const fileInput = document.getElementById("certUploadInput");
  const banner = document.getElementById("certAlertBanner");
  const uploadBtn = document.getElementById("btnUploadCertTemplate");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    if (banner) showBanner(banner, "Please select a .pptx PowerPoint file to upload.", "error");
    return;
  }

  const file = fileInput.files[0];
  if (!file.name.toLowerCase().endsWith(".pptx")) {
    if (banner) showBanner(banner, "Only PowerPoint presentation files (.pptx) are allowed.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("template_file", file);

  const origHtml = uploadBtn ? uploadBtn.innerHTML : "";
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Uploading...`;
  }

  try {
    const res = await fetch("/api/admin/certificates/template/upload", {
      method: "POST",
      body: formData
    });
    const json = await res.json();
    if (res.ok && json.success) {
      if (banner) showBanner(banner, json.message || "Template uploaded successfully!", "success");
      fileInput.value = "";
      await loadCertificateTemplateInfo();
    } else {
      if (banner) showBanner(banner, json.error || "Failed to upload template.", "error");
    }
  } catch (err) {
    console.error("Template upload error:", err);
    if (banner) showBanner(banner, "Network error uploading certificate template.", "error");
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = origHtml;
    }
  }
}
window.handleCertificateTemplateUpload = handleCertificateTemplateUpload;

/**
 * Resets the active template back to the built-in official SYNEX template
 */
async function handleResetCertificateTemplate() {
  if (!confirm("Are you sure you want to revert to the official default PowerPoint certificate template?")) {
    return;
  }

  const banner = document.getElementById("certAlertBanner");
  try {
    const res = await fetch("/api/admin/certificates/template/reset", {
      method: "POST"
    });
    const json = await res.json();
    if (res.ok && json.success) {
      if (banner) showBanner(banner, json.message || "Reset to official default template.", "success");
      await loadCertificateTemplateInfo();
    } else {
      if (banner) showBanner(banner, json.error || "Failed to reset template.", "error");
    }
  } catch (err) {
    console.error("Template reset error:", err);
    if (banner) showBanner(banner, "Network error resetting template.", "error");
  }
}
window.handleResetCertificateTemplate = handleResetCertificateTemplate;

/**
 * Loads all participants for certificates registry
 */
async function loadCertificateParticipants() {
  const tbody = document.getElementById("certParticipantsTableBody");
  const countEl = document.getElementById("certRegistryCountText");
  const domainFilter = document.getElementById("certFilterDomain") ? document.getElementById("certFilterDomain").value : "all";
  const paymentFilter = document.getElementById("certFilterPayment") ? document.getElementById("certFilterPayment").value : "paid";

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="9" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">
        <i class="fa-solid fa-circle-notch fa-spin"></i> Loading participant directory...
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams({
      domain: domainFilter,
      payment: paymentFilter
    });
    const res = await fetch(`/api/admin/certificates/participants?${params.toString()}`);
    const json = await res.json();

    if (res.ok && json.success && Array.isArray(json.data)) {
      certificateParticipantsCache = json.data;
      renderCertificateParticipantsTable();
      populateSingleSelectDropdown();
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 2rem; color: #DC2626;">
            Failed to load participant data: ${escapeHtml(json.error || "Unknown server error")}
          </td>
        </tr>
      `;
    }
  } catch (err) {
    console.error("Error loading certificate participants:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: #DC2626;">
          Network error loading participant directory.
        </td>
      </tr>
    `;
  }
}
window.loadCertificateParticipants = loadCertificateParticipants;

/**
 * Populates single dispatch participant selector dropdown
 */
function populateSingleSelectDropdown() {
  const selectDropdown = document.getElementById("certSingleSelectParticipant");
  if (!selectDropdown) return;

  const currentVal = selectDropdown.value;
  selectDropdown.innerHTML = `<option value="">-- Choose from registered participants or type below --</option>` +
    certificateParticipantsCache.map(p => `
      <option value="${p.id}" ${p.id === currentVal ? "selected" : ""}>
        ${escapeHtml(p.name)} (${escapeHtml(p.role)} • ${escapeHtml(p.team_name || "Solo")} • ${escapeHtml(p.email)})
      </option>
    `).join("");
}

/**
 * Handles dropdown selection change in single dispatch form
 */
function handleSelectCertParticipantChange() {
  const selectEl = document.getElementById("certSingleSelectParticipant");
  if (!selectEl) return;
  const pId = selectEl.value;
  if (!pId) return;

  const participant = certificateParticipantsCache.find(p => p.id === pId);
  if (participant) {
    const nameInput = document.getElementById("certSingleName");
    const emailInput = document.getElementById("certSingleEmail");
    const domainInput = document.getElementById("certSingleDomain");
    const roleInput = document.getElementById("certSingleRole");
    const subjInput = document.getElementById("certSingleCustomSubject");

    if (nameInput) nameInput.value = participant.name || "";
    if (emailInput) emailInput.value = participant.email || "";
    if (domainInput) domainInput.value = participant.domain || "";
    if (roleInput) roleInput.value = participant.role || "";
    if (subjInput) subjInput.value = `Your SYNEX 2026 Certificate of Participation — ${participant.name}`;
  }
}
window.handleSelectCertParticipantChange = handleSelectCertParticipantChange;

/**
 * Searches and renders filtered participants in the table
 */
function renderCertificateParticipantsTable() {
  const tbody = document.getElementById("certParticipantsTableBody");
  const countEl = document.getElementById("certRegistryCountText");
  const searchInput = document.getElementById("certSearchInput");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  let list = certificateParticipantsCache;
  if (query) {
    list = list.filter(p =>
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.email && p.email.toLowerCase().includes(query)) ||
      (p.team_name && p.team_name.toLowerCase().includes(query)) ||
      (p.college && p.college.toLowerCase().includes(query)) ||
      (p.ref && p.ref.toLowerCase().includes(query))
    );
  }

  if (countEl) {
    countEl.textContent = `Showing ${list.length} eligible participants (${certificateParticipantsCache.length} total)`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">
          No eligible participants found matching criteria.
        </td>
      </tr>
    `;
    updateBatchActionBar();
    return;
  }

  tbody.innerHTML = list.map(p => {
    const isPaid = (p.payment_status || "").toUpperCase() === "PAID";
    const statusBadge = isPaid
      ? `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Paid</span>`
      : `<span class="badge badge-warning">${escapeHtml(p.payment_status || "PENDING")}</span>`;

    const roleBadge = p.role === "Solo Hacker"
      ? `<span class="badge" style="background:#E0E7FF; color:#3730A3;">Solo</span>`
      : p.role === "Team Leader"
        ? `<span class="badge" style="background:#FEF3C7; color:#92400E;"><i class="fa-solid fa-crown" style="font-size:0.65rem;"></i> Leader</span>`
        : `<span class="badge" style="background:#F1F5F9; color:#475569;">Member</span>`;

    return `
      <tr>
        <td style="text-align: center;">
          <input type="checkbox" class="cert-row-checkbox" value="${p.id}" onchange="updateBatchActionBar();">
        </td>
        <td>
          <div style="font-weight: 600; color: #1E293B;">${escapeHtml(p.name)}</div>
          <div style="font-size: 0.78rem; color: var(--color-text-muted);">${escapeHtml(p.email)}</div>
        </td>
        <td>${roleBadge}</td>
        <td>
          <span style="font-size: 0.82rem; color: #334155;">${escapeHtml(p.domain || "General")}</span>
        </td>
        <td>
          <div style="font-weight: 500; font-size: 0.82rem; color: #1E293B;">${escapeHtml(p.team_name || "—")}</div>
          <div style="font-size: 0.72rem; color: var(--color-text-muted);">${escapeHtml(p.registration_type || "")}</div>
        </td>
        <td style="font-size: 0.82rem; color: #475569; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(p.college || "")}">
          ${escapeHtml(p.college || "—")}
        </td>
        <td>${statusBadge}</td>
        <td>
          <code style="font-size: 0.76rem; background: #F1F5F9; padding: 2px 6px; border-radius: 4px; color: #0F172A;">${escapeHtml(p.certificate_id)}</code>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="display: inline-flex; gap: 0.35rem;">
            <button type="button" class="cert-table-action-btn preview" title="Preview Vector Certificate PDF" onclick="openCertificatePreviewModal('${p.id}');">
              <i class="fa-solid fa-eye"></i>
            </button>
            <a href="/api/admin/certificates/preview?participant_id=${encodeURIComponent(p.id)}&download=true" target="_blank" class="cert-table-action-btn download" title="Download Certificate PDF">
              <i class="fa-solid fa-download"></i>
            </a>
            <button type="button" class="cert-table-action-btn send" title="Dispatch E-Certificate via Email" onclick="handleSendSingleCertFromTable('${p.id}');">
              <i class="fa-solid fa-paper-plane"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  updateBatchActionBar();
}

function handleCertSearchInput() {
  renderCertificateParticipantsTable();
}
window.handleCertSearchInput = handleCertSearchInput;

function toggleSelectAllCertificates(selectAllCheckbox) {
  const checkboxes = document.querySelectorAll(".cert-row-checkbox");
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
  updateBatchActionBar();
}
window.toggleSelectAllCertificates = toggleSelectAllCertificates;

function updateBatchActionBar() {
  const checkboxes = document.querySelectorAll(".cert-row-checkbox:checked");
  const bar = document.getElementById("certBatchActionBar");
  const countText = document.getElementById("certSelectedCountText");
  const selectAll = document.getElementById("certSelectAllCheckbox");

  const totalCheckboxes = document.querySelectorAll(".cert-row-checkbox");
  if (selectAll && totalCheckboxes.length > 0) {
    selectAll.checked = (checkboxes.length === totalCheckboxes.length);
  }

  if (bar && countText) {
    if (checkboxes.length > 0) {
      bar.style.display = "flex";
      countText.textContent = `${checkboxes.length} participant${checkboxes.length > 1 ? "s" : ""} selected`;
    } else {
      bar.style.display = "none";
    }
  }
}
window.updateBatchActionBar = updateBatchActionBar;

/**
 * Opens PDF preview modal for a participant or sample details
 */
function openCertificatePreviewModal(participantId) {
  const modal = document.getElementById("certPreviewModal");
  const iframe = document.getElementById("certPreviewIframe");
  const spinner = document.getElementById("certPreviewLoadingSpinner");
  const downloadLink = document.getElementById("btnDownloadPreviewPdf");
  const titleSub = document.getElementById("certPreviewModalSub");

  if (!modal || !iframe) return;

  if (spinner) spinner.style.display = "flex";

  let previewUrl = "/api/admin/certificates/preview";
  if (participantId) {
    previewUrl += `?participant_id=${encodeURIComponent(participantId)}`;
    const participant = certificateParticipantsCache.find(p => p.id === participantId);
    if (participant && titleSub) {
      titleSub.textContent = `Generated for: ${participant.name} (${participant.certificate_id})`;
    }
  } else {
    previewUrl += "?sample=true";
    if (titleSub) titleSub.textContent = `High-fidelity vector PDF generated from template`;
  }

  iframe.onload = () => {
    if (spinner) spinner.style.display = "none";
  };

  iframe.src = previewUrl;
  if (downloadLink) {
    downloadLink.href = previewUrl + (previewUrl.includes("?") ? "&download=true" : "?download=true");
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}
window.openCertificatePreviewModal = openCertificatePreviewModal;

function closeCertificatePreviewModal() {
  const modal = document.getElementById("certPreviewModal");
  const iframe = document.getElementById("certPreviewIframe");
  if (modal) modal.classList.remove("active");
  if (iframe) iframe.src = "about:blank";
  document.body.style.overflow = "";
}
window.closeCertificatePreviewModal = closeCertificatePreviewModal;

function handlePreviewCertFromForm() {
  const name = document.getElementById("certSingleName") ? document.getElementById("certSingleName").value.trim() : "";
  const email = document.getElementById("certSingleEmail") ? document.getElementById("certSingleEmail").value.trim() : "";
  const domain = document.getElementById("certSingleDomain") ? document.getElementById("certSingleDomain").value.trim() : "";
  const role = document.getElementById("certSingleRole") ? document.getElementById("certSingleRole").value.trim() : "";
  const selectElem = document.getElementById("certSingleSelectParticipant");

  const modal = document.getElementById("certPreviewModal");
  const iframe = document.getElementById("certPreviewIframe");
  const spinner = document.getElementById("certPreviewLoadingSpinner");
  const downloadLink = document.getElementById("btnDownloadPreviewPdf");
  const titleSub = document.getElementById("certPreviewModalSub");

  if (!modal || !iframe) return;
  if (spinner) spinner.style.display = "flex";

  const params = new URLSearchParams();
  if (selectElem && selectElem.value) {
    params.append("participant_id", selectElem.value);
  } else {
    if (name) params.append("name", name);
    if (email) params.append("email", email);
    if (domain) params.append("domain", domain);
    if (role) params.append("role", role);
  }

  const previewUrl = `/api/admin/certificates/preview?${params.toString()}`;

  iframe.onload = () => {
    if (spinner) spinner.style.display = "none";
  };
  iframe.src = previewUrl;
  if (downloadLink) {
    downloadLink.href = previewUrl + (previewUrl.includes("?") ? "&download=true" : "?download=true");
  }
  if (titleSub) titleSub.textContent = `Preview for ${name || "Custom Details"}`;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}
window.handlePreviewCertFromForm = handlePreviewCertFromForm;

function handleDownloadCertFromForm() {
  const name = document.getElementById("certSingleName") ? document.getElementById("certSingleName").value.trim() : "";
  const email = document.getElementById("certSingleEmail") ? document.getElementById("certSingleEmail").value.trim() : "";
  const domain = document.getElementById("certSingleDomain") ? document.getElementById("certSingleDomain").value.trim() : "";
  const role = document.getElementById("certSingleRole") ? document.getElementById("certSingleRole").value.trim() : "";
  const selectElem = document.getElementById("certSingleSelectParticipant");

  const params = new URLSearchParams({ download: "true" });
  if (selectElem && selectElem.value) {
    params.append("participant_id", selectElem.value);
  } else {
    if (name) params.append("name", name);
    if (email) params.append("email", email);
    if (domain) params.append("domain", domain);
    if (role) params.append("role", role);
  }
  window.location.href = `/api/admin/certificates/preview?${params.toString()}`;
}
window.handleDownloadCertFromForm = handleDownloadCertFromForm;

/**
 * Handles sending a single certificate from the single dispatch card form
 */
async function handleSendSingleCertificate() {
  const name = document.getElementById("certSingleName") ? document.getElementById("certSingleName").value.trim() : "";
  const email = document.getElementById("certSingleEmail") ? document.getElementById("certSingleEmail").value.trim() : "";
  const domain = document.getElementById("certSingleDomain") ? document.getElementById("certSingleDomain").value.trim() : "";
  const role = document.getElementById("certSingleRole") ? document.getElementById("certSingleRole").value.trim() : "";
  const subject = document.getElementById("certSingleCustomSubject") ? document.getElementById("certSingleCustomSubject").value.trim() : "";
  const pId = document.getElementById("certSingleSelectParticipant") ? document.getElementById("certSingleSelectParticipant").value : "";

  const banner = document.getElementById("certAlertBanner");
  const submitBtn = document.getElementById("btnSendSingleCertSubmit");

  if (!name || !email) {
    if (banner) showBanner(banner, "Participant name and valid email are required.", "error");
    return;
  }

  const origHtml = submitBtn ? submitBtn.innerHTML : "";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Generating PDF & Sending...`;
  }

  try {
    const payload = {
      participant_id: pId || undefined,
      name,
      email,
      domain,
      role,
      custom_subject: subject || undefined
    };

    const res = await fetch("/api/admin/certificates/send-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    if (res.ok && json.success) {
      if (banner) showBanner(banner, json.message || `Certificate PDF sent successfully to ${email}!`, "success");
      await loadCertificateHistory();
    } else {
      if (banner) showBanner(banner, json.error || "Failed to send certificate.", "error");
    }
  } catch (err) {
    console.error("Single certificate dispatch error:", err);
    if (banner) showBanner(banner, "Network error sending certificate.", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origHtml;
    }
  }
}
window.handleSendSingleCertificate = handleSendSingleCertificate;

/**
 * Sends single certificate directly from table action button
 */
async function handleSendSingleCertFromTable(participantId) {
  const participant = certificateParticipantsCache.find(p => p.id === participantId);
  if (!participant) return;

  if (!confirm(`Generate PDF certificate and email it directly to ${participant.name} (${participant.email})?`)) {
    return;
  }

  const banner = document.getElementById("certAlertBanner");
  if (banner) showBanner(banner, `Generating PDF and emailing ${participant.name}...`, "info");

  try {
    const res = await fetch("/api/admin/certificates/send-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId })
    });
    const json = await res.json();

    if (res.ok && json.success) {
      if (banner) showBanner(banner, json.message || `Certificate dispatched to ${participant.name}!`, "success");
      await loadCertificateHistory();
    } else {
      if (banner) showBanner(banner, json.error || "Failed to dispatch certificate.", "error");
    }
  } catch (err) {
    console.error("Error sending single certificate from table:", err);
    if (banner) showBanner(banner, "Network error dispatching certificate.", "error");
  }
}
window.handleSendSingleCertFromTable = handleSendSingleCertFromTable;

/**
 * Dispatches certificates to selected checked participants
 */
async function dispatchSelectedCertificates() {
  const checkboxes = document.querySelectorAll(".cert-row-checkbox:checked");
  if (checkboxes.length === 0) return;

  const ids = Array.from(checkboxes).map(cb => cb.value);
  if (!confirm(`Are you sure you want to generate PDF certificates and dispatch emails to all ${ids.length} selected participant(s)?`)) {
    return;
  }

  const banner = document.getElementById("certAlertBanner");
  if (banner) showBanner(banner, `Preparing and dispatching ${ids.length} certificate emails in background...`, "info");

  try {
    const res = await fetch("/api/admin/certificates/send-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_ids: ids })
    });
    const json = await res.json();

    if (res.ok && json.success) {
      const msg = json.message || `Dispatched certificates to ${json.data.sent_count} of ${json.data.total} participants.`;
      if (banner) showBanner(banner, msg, "success");
      // Uncheck all
      checkboxes.forEach(cb => cb.checked = false);
      updateBatchActionBar();
      await loadCertificateHistory();
    } else {
      if (banner) showBanner(banner, json.error || "Failed to dispatch certificates.", "error");
    }
  } catch (err) {
    console.error("Selected certificates dispatch error:", err);
    if (banner) showBanner(banner, "Network error dispatching selected certificates.", "error");
  }
}
window.dispatchSelectedCertificates = dispatchSelectedCertificates;

/**
 * Dispatches bulk certificates according to current filter
 */
async function dispatchBulkCertificates() {
  const domainFilter = document.getElementById("certFilterDomain") ? document.getElementById("certFilterDomain").value : "all";
  const paymentFilter = document.getElementById("certFilterPayment") ? document.getElementById("certFilterPayment").value : "paid";

  const domainText = domainFilter === "all" ? "all domains" : `domain '${domainFilter}'`;
  const paymentText = paymentFilter === "paid" ? "Paid participants only" : "All registrations";

  if (!confirm(`Dispatch verified PDF e-certificates to ALL eligible participants matching current filter (${domainText}, ${paymentText})?`)) {
    return;
  }

  const banner = document.getElementById("certAlertBanner");
  if (banner) showBanner(banner, "Generating certificates and queueing email distribution...", "info");

  try {
    const res = await fetch("/api/admin/certificates/send-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filter_domain: domainFilter,
        filter_payment: paymentFilter
      })
    });
    const json = await res.json();

    if (res.ok && json.success) {
      const msg = json.message || `Dispatched certificates to ${json.data.sent_count} participants!`;
      if (banner) showBanner(banner, msg, "success");
      await loadCertificateHistory();
    } else {
      if (banner) showBanner(banner, json.error || "Failed bulk dispatch.", "error");
    }
  } catch (err) {
    console.error("Bulk certificate dispatch error:", err);
    if (banner) showBanner(banner, "Network error executing bulk certificate dispatch.", "error");
  }
}
window.dispatchBulkCertificates = dispatchBulkCertificates;

/**
 * Loads recent certificate email dispatch logs
 */
async function loadCertificateHistory() {
  const tbody = document.getElementById("certHistoryTableBody");
  if (!tbody) return;

  try {
    const res = await fetch("/api/admin/certificates/history");
    const json = await res.json();

    if (res.ok && json.success && Array.isArray(json.data)) {
      if (json.data.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 1.5rem; color: var(--color-text-muted);">
              No certificate emails dispatched yet.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = json.data.map(log => {
        const isDelivered = (log.delivery_status || "").toLowerCase() === "delivered" || (log.delivery_status || "").toLowerCase() === "sent";
        const statusBadge = isDelivered
          ? `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(log.delivery_status)}</span>`
          : `<span class="badge badge-primary"><i class="fa-solid fa-paper-plane"></i> ${escapeHtml(log.delivery_status || "Dispatched")}</span>`;

        return `
          <tr>
            <td>
              <div style="font-weight: 600; color: #1E293B;">${escapeHtml(log.recipient_email)}</div>
              <div style="font-size: 0.76rem; color: var(--color-text-muted);">Mode: ${escapeHtml(log.delivery_mode || "email")}</div>
            </td>
            <td style="font-size: 0.82rem; color: #334155;">${escapeHtml(log.subject)}</td>
            <td>${statusBadge}</td>
            <td style="font-size: 0.8rem; color: #475569; white-space: nowrap;">${escapeHtml(log.created_at)}</td>
            <td style="font-size: 0.78rem; color: #64748B;">
              ${escapeHtml(log.notes || "PDF Attached")}
            </td>
          </tr>
        `;
      }).join("");
    }
  } catch (err) {
    console.error("Error loading certificate history:", err);
  }
}
window.loadCertificateHistory = loadCertificateHistory;




