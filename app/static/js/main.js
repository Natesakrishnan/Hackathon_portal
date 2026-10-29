/**
 * SYNEX HACKATHON — MAIN JAVASCRIPT
 * Handles mobile navigation, countdown timer, FAQ accordion, smooth scrolling,
 * and shared event configuration.
 */

// Global Configurable Event Settings (Easily modified by organizers)
window.SYNEX_CONFIG = {
  eventName: "SYNEX",
  fullName: "SYNEX National Innovation Hackathon 2026",
  tagline: "BUILD THE FUTURE. ONE IDEA AT A TIME.",
  // Configure event kickoff date here (Format: YYYY-MM-DDTHH:mm:ss)
  // Default set to 30 days ahead from today for realistic countdown demonstration
  eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  venue: "Dr. APJ Abdul Kalam Tech Auditorium, Tech Campus, Bengaluru",
  format: "36-Hour In-Person & Hybrid Hackathon",
  expectedParticipants: "1,200+",
  totalTeams: "300+",
  duration: "36 Hours",
  prizePool: "₹2,50,000",
  fees: {
    individual: 299,
    team: 999,
    currency: "₹"
  }
};

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initCountdown();
  initFaqAccordion();
  initSmoothScroll();
  highlightActiveNav();
  syncConfigFromServer();
});

/**
 * Mobile Navigation Drawer Toggle
 */
function initMobileNav() {
  const toggleBtn = document.getElementById("navToggle");
  const mobileNav = document.getElementById("mobileNav");

  if (!toggleBtn || !mobileNav) return;

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isExpanded = toggleBtn.getAttribute("aria-expanded") === "true";
    toggleBtn.setAttribute("aria-expanded", !isExpanded);
    mobileNav.classList.toggle("active");

    const icon = toggleBtn.querySelector("i");
    if (icon) {
      icon.className = mobileNav.classList.contains("active") ? "fa-solid fa-xmark" : "fa-solid fa-bars";
    }
  });

  // Close mobile nav when clicking on a link
  const navLinks = mobileNav.querySelectorAll(".nav-link, .btn");
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      mobileNav.classList.remove("active");
      toggleBtn.setAttribute("aria-expanded", "false");
      const icon = toggleBtn.querySelector("i");
      if (icon) icon.className = "fa-solid fa-bars";
    });
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (mobileNav.classList.contains("active") && !mobileNav.contains(e.target) && e.target !== toggleBtn) {
      mobileNav.classList.remove("active");
      toggleBtn.setAttribute("aria-expanded", "false");
      const icon = toggleBtn.querySelector("i");
      if (icon) icon.className = "fa-solid fa-bars";
    }
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileNav.classList.contains("active")) {
      mobileNav.classList.remove("active");
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.focus();
    }
  });
}

/**
 * Configurable Countdown Timer
 */
function initCountdown() {
  const daysEl = document.getElementById("countdownDays");
  const hoursEl = document.getElementById("countdownHours");
  const minutesEl = document.getElementById("countdownMinutes");
  const secondsEl = document.getElementById("countdownSeconds");
  const gridEl = document.getElementById("countdownGrid");
  const expiredMsgEl = document.getElementById("countdownExpired");

  if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

  let targetDate = new Date(window.SYNEX_CONFIG.eventDate).getTime();

  window.updateCountdownTarget = function(newDateStr) {
    if (!newDateStr) return;
    targetDate = new Date(newDateStr).getTime();
    if (gridEl) gridEl.style.display = '';
    if (expiredMsgEl) expiredMsgEl.style.display = 'none';
    update();
  };

  function update() {
    const now = new Date().getTime();
    const distance = targetDate - now;

    if (distance < 0) {
      // Event has started or ended
      if (gridEl) gridEl.style.display = "none";
      if (expiredMsgEl) {
        expiredMsgEl.style.display = "block";
        expiredMsgEl.textContent = "SYNEX Hackathon is currently live or registration has concluded!";
      }
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    daysEl.textContent = String(days).padStart(2, "0");
    hoursEl.textContent = String(hours).padStart(2, "0");
    minutesEl.textContent = String(minutes).padStart(2, "0");
    secondsEl.textContent = String(seconds).padStart(2, "0");
  }

  update();
  setInterval(update, 1000);
}

/**
 * Interactive FAQ Accordion
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll(".faq-item");
  if (!faqItems.length) return;

  faqItems.forEach((item) => {
    const questionBtn = item.querySelector(".faq-question");
    if (!questionBtn) return;

    questionBtn.addEventListener("click", () => {
      const isActive = item.classList.contains("active");

      // Optional: close other open items for cleaner single-accordion UX
      faqItems.forEach((other) => {
        if (other !== item) {
          other.classList.remove("active");
          const otherBtn = other.querySelector(".faq-question");
          if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
        }
      });

      if (isActive) {
        item.classList.remove("active");
        questionBtn.setAttribute("aria-expanded", "false");
      } else {
        item.classList.add("active");
        questionBtn.setAttribute("aria-expanded", "true");
      }
    });
  });
}

/**
 * Smooth scrolling with sticky header offset
 */
function initSmoothScroll() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]:not([href="#"])');
  anchorLinks.forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const targetId = this.getAttribute("href");
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const headerOffset = 84;
        const elementPosition = targetEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      }
    });
  });
}

/**
 * Highlight active navbar link depending on current page URL
 */
function highlightActiveNav() {
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  const navLinks = document.querySelectorAll(".navbar .nav-link");

  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (href === currentPath || (currentPath === "" && href === "index.html")) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

/**
 * Synchronizes client settings with authoritative server-side EventSettings
 */
async function syncConfigFromServer() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (!cfg) return;

    if (cfg.event_name) {
      window.SYNEX_CONFIG.eventName = cfg.event_name;
    }
    if (cfg.registration_deadline) {
      window.SYNEX_CONFIG.eventDate = cfg.registration_deadline;
      if (typeof window.updateCountdownTarget === 'function') {
        window.updateCountdownTarget(cfg.registration_deadline);
      }
    }
    if (cfg.prize_pool) {
      window.SYNEX_CONFIG.prizePool = cfg.prize_pool;
      document.querySelectorAll('.prize-pool-text, #heroPrizePool, [data-synex-prize]').forEach(el => {
        el.textContent = cfg.prize_pool;
      });
    }
    if (cfg.individual_fee !== undefined) {
      window.SYNEX_CONFIG.fees.individual = cfg.individual_fee;
    }
    if (cfg.team_fee !== undefined) {
      window.SYNEX_CONFIG.fees.team = cfg.team_fee;
    }
    const curr = cfg.currency === "INR" ? "₹" : (cfg.currency || "₹");
    window.SYNEX_CONFIG.fees.currency = curr;
    updatePublicFeeDisplays(cfg.individual_fee, cfg.team_fee, curr);
  } catch (err) {
    // Non-blocking fallback
  }
}

/**
 * Updates all public fee displays across any page on the portal
 */
function updatePublicFeeDisplays(indivFee, teamFee, currency = "₹") {
  const indiv = indivFee !== undefined ? indivFee : (window.SYNEX_CONFIG?.fees?.individual ?? 299);
  const team = teamFee !== undefined ? teamFee : (window.SYNEX_CONFIG?.fees?.team ?? 999);
  const curr = currency || "₹";

  // 1. Hero Entry Fee Badge (Home page)
  document.querySelectorAll('#heroEntryFeeDisplay, [data-synex-fees="combined"]').forEach(el => {
    el.textContent = `${curr}${indiv} Individual / ${curr}${team} Team`;
  });

  // 2. FAQ section (Home page)
  document.querySelectorAll('#faqIndividualFee, .faq-indiv-fee-text').forEach(el => {
    el.textContent = `Individual (${curr}${indiv})`;
  });
  document.querySelectorAll('#faqTeamFee, .faq-team-fee-text').forEach(el => {
    el.textContent = `Team of 2 to 4 members (${curr}${team} total)`;
  });

  // 3. Rules page (Rule 2 and Rule 8)
  document.querySelectorAll('.rule-indiv-fee-val, [data-fee-rule="individual"]').forEach(el => {
    el.textContent = `${curr}${indiv}`;
  });
  document.querySelectorAll('.rule-team-fee-val, [data-fee-rule="team"]').forEach(el => {
    el.textContent = `${curr}${team}`;
  });

  // 4. Registration page Type Pills
  document.querySelectorAll('#pillIndividualFee, [data-fee-pill="individual"]').forEach(el => {
    el.textContent = `${curr}${indiv}`;
  });
  document.querySelectorAll('#pillTeamFee, [data-fee-pill="team"]').forEach(el => {
    el.textContent = `${curr}${team}`;
  });

  // 5. Registration Form dynamic configs & summary/review cards if on register page
  if (typeof REG_CONFIG !== "undefined") {
    REG_CONFIG.individualFee = indiv;
    REG_CONFIG.teamFee = team;
    REG_CONFIG.currency = curr;
    const isTeam = document.querySelector('input[name="regType"]:checked')?.value === "team";
    const currentFee = isTeam ? team : indiv;
    const summaryFeeEl = document.getElementById("summaryBaseFee");
    const summaryTotalEl = document.getElementById("summaryTotalPrice");
    const reviewFeeEl = document.getElementById("reviewBaseFee");
    const reviewTotalEl = document.getElementById("reviewTotalAmount");
    if (summaryFeeEl) summaryFeeEl.textContent = `${curr}${currentFee}`;
    if (summaryTotalEl) summaryTotalEl.textContent = `${curr}${currentFee}`;
    if (reviewFeeEl) reviewFeeEl.textContent = `${curr}${currentFee}`;
    if (reviewTotalEl) reviewTotalEl.textContent = `${curr}${currentFee}`;
  }
}
window.updatePublicFeeDisplays = updatePublicFeeDisplays;
