/**
 * SYNEX HACKATHON — ADMIN DASHBOARD JAVASCRIPT (admin.js)
 * Manages demo dashboard initialization, sample participant records with
 * full team details, domain filtering, search, status filtering,
 * team details modal, Chart.js integrations, and demo CSV export.
 */

// Comprehensive Sample Participant Records with Team Leader & Member Details
const SAMPLE_REGISTRATIONS = [
  {
    id: "SYN-2026-84910",
    name: "Aditi Sharma",
    type: "Individual",
    college: "National Institute of Technology, Karnataka",
    domain: "Artificial Intelligence & Machine Learning",
    amount: "₹299",
    status: "paid",
    date: "2026-10-24 14:32",
    leader: {
      name: "Aditi Sharma",
      email: "aditi.sharma@nitk.edu.in",
      mobile: "+91 98765 43210",
      department: "Computer Science & Engineering",
      year: "3rd Year"
    },
    members: []
  },
  {
    id: "SYN-2026-84911",
    name: "Team CyberSentinels",
    type: "Team (4 Members)",
    college: "Indian Institute of Science, Bengaluru",
    domain: "Cybersecurity",
    amount: "₹999",
    status: "paid",
    date: "2026-10-24 15:10",
    leader: {
      name: "Vikram Singhania",
      email: "vikram.s@iisc.ac.in",
      mobile: "+91 98450 12345",
      department: "Cyber Security & Forensics",
      year: "Postgraduate"
    },
    members: [
      { name: "Ananya Iyer", email: "ananya.i@iisc.ac.in", department: "Information Security", role: "Cryptographic Engineer" },
      { name: "Rahul Deshmukh", email: "rahul.d@iisc.ac.in", department: "Computer Science", role: "Penetration Tester" },
      { name: "Preeti Shenoy", email: "preeti.s@iisc.ac.in", department: "Electronics Engg", role: "SecOps Specialist" }
    ]
  },
  {
    id: "SYN-2026-84912",
    name: "Rohan Varma",
    type: "Individual",
    college: "RV College of Engineering, Bengaluru",
    domain: "Web Development",
    amount: "₹299",
    status: "pending",
    date: "2026-10-24 17:45",
    leader: {
      name: "Rohan Varma",
      email: "rohan.v@rvce.edu.in",
      mobile: "+91 91234 56789",
      department: "Information Science",
      year: "2nd Year"
    },
    members: []
  },
  {
    id: "SYN-2026-84913",
    name: "Team IoTMatrix",
    type: "Team (3 Members)",
    college: "Vellore Institute of Technology, Vellore",
    domain: "Internet of Things (IoT)",
    amount: "₹999",
    status: "paid",
    date: "2026-10-25 09:20",
    leader: {
      name: "Siddharth Menon",
      email: "siddharth.m@vit.ac.in",
      mobile: "+91 94441 22334",
      department: "Electronics & Communication",
      year: "4th Year"
    },
    members: [
      { name: "Meera Krishnan", email: "meera.k@vit.ac.in", department: "Embedded Systems", role: "Firmware Engineer" },
      { name: "Tanmay Joshi", email: "tanmay.j@vit.ac.in", department: "Computer Science", role: "Edge Cloud Architect" }
    ]
  },
  {
    id: "SYN-2026-84914",
    name: "Pooja Hegde",
    type: "Individual",
    college: "BMS College of Engineering, Bengaluru",
    domain: "Healthcare Technology",
    amount: "₹299",
    status: "failed",
    date: "2026-10-25 10:15",
    leader: {
      name: "Pooja Hegde",
      email: "pooja.h@bmsce.ac.in",
      mobile: "+91 97412 34567",
      department: "Biomedical Engineering",
      year: "3rd Year"
    },
    members: []
  },
  {
    id: "SYN-2026-84915",
    name: "Team FinAlpha",
    type: "Team (4 Members)",
    college: "PSG College of Technology, Coimbatore",
    domain: "Financial Technology (FinTech)",
    amount: "₹999",
    status: "paid",
    date: "2026-10-25 11:40",
    leader: {
      name: "Gautam Rangarajan",
      email: "gautam.r@psgtech.ac.in",
      mobile: "+91 98401 98765",
      department: "Applied Mathematics & Computing",
      year: "4th Year"
    },
    members: [
      { name: "Divya Nambiar", email: "divya.n@psgtech.ac.in", department: "Computer Science", role: "Smart Contracts Dev" },
      { name: "Harish Kumar", email: "harish.k@psgtech.ac.in", department: "Finance & Analytics", role: "Risk Modeler" },
      { name: "Swathi Pillai", email: "swathi.p@psgtech.ac.in", department: "Information Tech", role: "Frontend & Web3 Lead" }
    ]
  },
  {
    id: "SYN-2026-84916",
    name: "Arjun Nair",
    type: "Individual",
    college: "PES University, Bengaluru",
    domain: "Smart Cities & Sustainability",
    amount: "₹299",
    status: "paid",
    date: "2026-10-25 13:05",
    leader: {
      name: "Arjun Nair",
      email: "arjun.n@pes.edu",
      mobile: "+91 99001 12233",
      department: "Civil & Environmental Tech",
      year: "4th Year"
    },
    members: []
  },
  {
    id: "SYN-2026-84917",
    name: "Team QuantumCoders",
    type: "Team (3 Members)",
    college: "Manipal Institute of Technology, Manipal",
    domain: "Open Innovation",
    amount: "₹999",
    status: "pending",
    date: "2026-10-25 15:50",
    leader: {
      name: "Kavya Sundaram",
      email: "kavya.s@manipal.edu",
      mobile: "+91 98200 44556",
      department: "Computer & Communication",
      year: "3rd Year"
    },
    members: [
      { name: "Neil D'Souza", email: "neil.d@manipal.edu", department: "Data Science", role: "Full-Stack Engineer" },
      { name: "Shruti Bansal", email: "shruti.b@manipal.edu", department: "Design & UX", role: "UI/UX Researcher" }
    ]
  },
  {
    id: "SYN-2026-84918",
    name: "Sneha Mukherjee",
    type: "Individual",
    college: "Jadavpur University, Kolkata",
    domain: "Artificial Intelligence & Machine Learning",
    amount: "₹299",
    status: "paid",
    date: "2026-10-25 18:22",
    leader: {
      name: "Sneha Mukherjee",
      email: "sneha.m@jadavpuruniversity.in",
      mobile: "+91 98310 67890",
      department: "Computer Science & Tech",
      year: "Postgraduate"
    },
    members: []
  },
  {
    id: "SYN-2026-84919",
    name: "Team GreenPulse",
    type: "Team (4 Members)",
    college: "College of Engineering, Guindy, Chennai",
    domain: "Smart Cities & Sustainability",
    amount: "₹999",
    status: "paid",
    date: "2026-10-26 08:45",
    leader: {
      name: "Karthik Subramanian",
      email: "karthik.s@ceg.annauniv.edu",
      mobile: "+91 94440 99887",
      department: "Electrical & Electronics",
      year: "4th Year"
    },
    members: [
      { name: "Deepa Raman", email: "deepa.r@ceg.annauniv.edu", department: "Information Technology", role: "IoT Telemetry Lead" },
      { name: "Vignesh Balaji", email: "vignesh.b@ceg.annauniv.edu", department: "Mechanical Systems", role: "Hardware Modeler" },
      { name: "Shalini Chandran", email: "shalini.c@ceg.annauniv.edu", department: "Computer Science", role: "Backend Developer" }
    ]
  },
  {
    id: "SYN-2026-84920",
    name: "Karan Patel",
    type: "Individual",
    college: "IIT Bombay, Mumbai",
    domain: "Web Development",
    amount: "₹299",
    status: "failed",
    date: "2026-10-26 10:30",
    leader: {
      name: "Karan Patel",
      email: "karan.p@iitb.ac.in",
      mobile: "+91 98205 11223",
      department: "Computer Science",
      year: "2nd Year"
    },
    members: []
  },
  {
    id: "SYN-2026-84921",
    name: "Team NeuroSync",
    type: "Team (2 Members)",
    college: "BITS Pilani, Hyderabad Campus",
    domain: "Healthcare Technology",
    amount: "₹999",
    status: "paid",
    date: "2026-10-26 11:15",
    leader: {
      name: "Pranav Aggarwal",
      email: "pranav.a@hyderabad.bits-pilani.ac.in",
      mobile: "+91 99887 66554",
      department: "Biological Sciences & CS",
      year: "3rd Year"
    },
    members: [
      { name: "Rhea Sen", email: "rhea.s@hyderabad.bits-pilani.ac.in", department: "Computer Science", role: "Bioinformatics ML Engineer" }
    ]
  }
];

let activeFilterStatus = "all";
let activeFilterDomain = "all";
let activeSearchQuery = "";

document.addEventListener("DOMContentLoaded", () => {
  initAdminDashboard();
});

function initAdminDashboard() {
  initSidebarToggle();
  renderRegistrationsTable();
  initTableFilters();
  initCsvExport();
  initChartJs();
  displayAdminUser();
  initTeamModalEvents();
}

/**
 * Responsive Sidebar Toggle for Tablets & Mobile
 */
function initSidebarToggle() {
  const toggleBtn = document.getElementById("adminSidebarToggle");
  const sidebar = document.getElementById("adminSidebar");

  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== toggleBtn) {
      sidebar.classList.remove("open");
    }
  });
}

/**
 * Display logged in admin name
 */
function displayAdminUser() {
  const nameEl = document.getElementById("adminUserName");
  if (!nameEl) return;
  const storedUser = sessionStorage.getItem("synex_admin_user");
  if (storedUser) {
    nameEl.textContent = storedUser.split("@")[0] || "Organizer";
  }
}

/**
 * Filter and Render Registration Table Records
 */
function renderRegistrationsTable() {
  const tbody = document.getElementById("registrationsTableBody");
  const showingCount = document.getElementById("tableShowingCount");
  if (!tbody) return;

  // Filter records based on search, status, and domain
  const filtered = SAMPLE_REGISTRATIONS.filter((item) => {
    // Status Filter
    const matchesStatus =
      activeFilterStatus === "all" || item.status.toLowerCase() === activeFilterStatus.toLowerCase();

    // Domain Filter
    const matchesDomain =
      activeFilterDomain === "all" || item.domain.toLowerCase() === activeFilterDomain.toLowerCase();

    // Text Search (ID, name, college, domain)
    const q = activeSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.id.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.college.toLowerCase().includes(q) ||
      item.domain.toLowerCase().includes(q);

    return matchesStatus && matchesDomain && matchesSearch;
  });

  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--color-text-muted);">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
          No matching demo records found for selected filters. Try broadening your criteria.
        </td>
      </tr>
    `;
    if (showingCount) showingCount.textContent = "Showing 0 records";
    return;
  }

  filtered.forEach((rec) => {
    const tr = document.createElement("tr");

    let statusClass = "status-paid";
    let statusIcon = "fa-circle-check";
    if (rec.status === "pending") {
      statusClass = "status-pending";
      statusIcon = "fa-clock";
    } else if (rec.status === "failed") {
      statusClass = "status-failed";
      statusIcon = "fa-circle-xmark";
    }

    const isTeam = rec.type.startsWith("Team");

    tr.innerHTML = `
      <td><span class="table-reg-id">${rec.id}</span></td>
      <td>
        <button type="button" class="btn-team-link" data-id="${rec.id}" aria-label="View details for ${rec.name}">
          <i class="fa-solid ${isTeam ? "fa-people-group" : "fa-user"}"></i>
          <span>${rec.name}</span>
          <span class="team-click-hint">${isTeam ? "View Team" : "Details"}</span>
        </button>
      </td>
      <td><span class="badge ${isTeam ? "badge-secondary" : "badge-primary"}">${rec.type}</span></td>
      <td style="font-size: 0.82rem; color: var(--color-text-secondary); max-width: 220px;">${rec.college}</td>
      <td style="font-size: 0.82rem; font-weight: 600;">${rec.domain}</td>
      <td><strong>${rec.amount}</strong></td>
      <td>
        <span class="status-badge ${statusClass}">
          <i class="fa-solid ${statusIcon}"></i>
          <span>${rec.status}</span>
        </span>
      </td>
      <td style="font-size: 0.78rem; color: var(--color-text-muted);">${rec.date}</td>
    `;
    tbody.appendChild(tr);
  });

  // Attach click listeners to team name buttons
  tbody.querySelectorAll(".btn-team-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const regId = btn.getAttribute("data-id");
      openTeamDetailsModal(regId);
    });
  });

  if (showingCount) {
    showingCount.textContent = `Showing ${filtered.length} of ${SAMPLE_REGISTRATIONS.length} demo records (Total database: 428)`;
  }
}

/**
 * Open & Populate Team & Participant Details Modal
 */
function openTeamDetailsModal(regId) {
  const modal = document.getElementById("teamDetailsModal");
  if (!modal) return;

  const rec = SAMPLE_REGISTRATIONS.find((r) => r.id === regId);
  if (!rec) return;

  // Header
  document.getElementById("modalTeamName").textContent = rec.name;
  document.getElementById("modalTeamRef").textContent = `ID: ${rec.id}`;

  // Overview Info
  document.getElementById("modalTeamDomain").textContent = rec.domain;
  document.getElementById("modalTeamCollege").textContent = rec.college;
  document.getElementById("modalTeamType").textContent = rec.type;
  document.getElementById("modalTeamFee").textContent = `${rec.amount} (${rec.status.toUpperCase()})`;

  // Team Leader
  const leader = rec.leader || {
    name: rec.name,
    email: "contact@participant.edu",
    mobile: "N/A",
    department: "Computer Science",
    year: "3rd Year"
  };

  document.getElementById("modalLeaderName").textContent = leader.name;
  document.getElementById("modalLeaderEmail").textContent = leader.email;
  document.getElementById("modalLeaderMobile").textContent = leader.mobile;
  document.getElementById("modalLeaderDept").textContent = `${leader.department} • ${leader.year}`;

  // Team Members
  const membersContainer = document.getElementById("modalMembersList");
  const membersTitle = document.getElementById("modalMembersCountTitle");

  if (membersContainer) {
    membersContainer.innerHTML = "";

    if (rec.members && rec.members.length > 0) {
      if (membersTitle) membersTitle.textContent = `Team Members (${rec.members.length})`;

      rec.members.forEach((m, idx) => {
        const initials = m.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();

        const card = document.createElement("div");
        card.className = "member-item-card";
        card.innerHTML = `
          <div class="member-info-left">
            <div class="member-avatar">${initials}</div>
            <div>
              <div class="member-name-text">${m.name}</div>
              <div class="member-email-text">${m.email} • ${m.department}</div>
            </div>
          </div>
          <span class="member-role-badge">${m.role || `Member ${idx + 2}`}</span>
        `;
        membersContainer.appendChild(card);
      });
    } else {
      if (membersTitle) membersTitle.textContent = "Team Members (0)";
      membersContainer.innerHTML = `
        <div style="background: var(--color-bg-surface); border: 1px dashed var(--color-border); border-radius: var(--radius-md); padding: 1.25rem; text-align: center; color: var(--color-text-secondary); font-size: 0.85rem;">
          <i class="fa-solid fa-user" style="color: var(--color-primary); font-size: 1.25rem; margin-bottom: 0.35rem; display: block;"></i>
          <strong>Individual Solo Hacker Registration</strong><br>
          This participant is registered individually and has no secondary team members.
        </div>
      `;
    }
  }

  // Display modal
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

/**
 * Setup Modal Event Listeners
 */
function initTeamModalEvents() {
  const modal = document.getElementById("teamDetailsModal");
  const btnClose = document.getElementById("btnCloseTeamModal");
  const btnFooterClose = document.getElementById("btnModalFooterClose");

  function closeModal() {
    if (modal) {
      modal.classList.remove("active");
      document.body.style.overflow = "";
    }
  }

  if (btnClose) btnClose.addEventListener("click", closeModal);
  if (btnFooterClose) btnFooterClose.addEventListener("click", closeModal);

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
}

/**
 * Search, Status, and Domain Filters
 */
function initTableFilters() {
  const searchInput = document.getElementById("tableSearchInput");
  const statusSelect = document.getElementById("tableStatusFilter");
  const domainSelect = document.getElementById("tableDomainFilter");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      activeSearchQuery = e.target.value;
      renderRegistrationsTable();
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener("change", (e) => {
      activeFilterStatus = e.target.value;
      renderRegistrationsTable();
    });
  }

  if (domainSelect) {
    domainSelect.addEventListener("change", (e) => {
      activeFilterDomain = e.target.value;
      renderRegistrationsTable();
    });
  }
}

/**
 * Demo CSV Export for Filtered or Full Sample Registrations
 */
function initCsvExport() {
  const btnExport = document.getElementById("btnExportCsv");
  if (!btnExport) return;

  btnExport.addEventListener("click", () => {
    const headers = [
      "Registration ID",
      "Participant / Team",
      "Type",
      "College",
      "Domain",
      "Amount",
      "Payment Status",
      "Leader Name",
      "Leader Email",
      "Date"
    ];

    const rows = SAMPLE_REGISTRATIONS.map((r) => [
      `"${r.id}"`,
      `"${r.name}"`,
      `"${r.type}"`,
      `"${r.college.replace(/"/g, '""')}"`,
      `"${r.domain}"`,
      `"${r.amount}"`,
      `"${r.status}"`,
      `"${(r.leader ? r.leader.name : r.name).replace(/"/g, '""')}"`,
      `"${r.leader ? r.leader.email : ''}"`,
      `"${r.date}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `synex_demo_registrations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

/**
 * Chart.js Visualizations Setup
 */
function initChartJs() {
  const trendsCanvas = document.getElementById("trendsChart");
  const statusCanvas = document.getElementById("paymentStatusChart");
  const domainCanvas = document.getElementById("domainChart");

  if (typeof Chart === "undefined") {
    console.warn("Chart.js not loaded. Displaying fallback message.");
    [trendsCanvas, statusCanvas, domainCanvas].forEach((canvas) => {
      if (canvas && canvas.parentElement) {
        canvas.parentElement.innerHTML = `
          <div class="chart-fallback-msg">
            <i class="fa-solid fa-chart-line" style="font-size: 2rem; color: #94A3B8; margin-bottom: 0.5rem; display: block;"></i>
            <strong>Chart library preview offline</strong><br>
            Connect to the internet to load Chart.js visual analytics.
          </div>
        `;
      }
    });
    return;
  }

  // 1. Registration Trends (Last 7 Days)
  if (trendsCanvas) {
    new Chart(trendsCanvas, {
      type: "line",
      data: {
        labels: ["Oct 20", "Oct 21", "Oct 22", "Oct 23", "Oct 24", "Oct 25", "Oct 26"],
        datasets: [
          {
            label: "Registrations",
            data: [28, 42, 55, 68, 85, 110, 140],
            borderColor: "#2563EB",
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: "#2563EB",
            pointRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
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
  if (statusCanvas) {
    new Chart(statusCanvas, {
      type: "doughnut",
      data: {
        labels: ["Paid (386)", "Pending (27)", "Failed (15)"],
        datasets: [
          {
            data: [386, 27, 15],
            backgroundColor: ["#16A34A", "#F59E0B", "#DC2626"],
            borderWidth: 2,
            borderColor: "#FFFFFF"
          }
        ]
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

  // 3. Domain Distribution (Bar Chart)
  if (domainCanvas) {
    new Chart(domainCanvas, {
      type: "bar",
      data: {
        labels: ["AI/ML", "Web Dev", "Cyber", "IoT", "Health", "FinTech", "Cities", "Open"],
        datasets: [
          {
            label: "Teams & Hackers",
            data: [124, 98, 46, 52, 38, 44, 28, 32],
            backgroundColor: "#7C3AED",
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
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
