/**
 * Hack HACKATHON — MAIN JAVASCRIPT
 * Handles mobile navigation, countdown timer, FAQ accordion, smooth scrolling,
 * and shared event configuration.
 */

// Global Configurable Event Settings (Easily modified by organizers)
window.Hack_CONFIG = {
  eventName: "Hack",
  fullName: "Hack National Innovation Hackathon 2026",
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

  let targetDate = new Date(window.Hack_CONFIG.eventDate).getTime();

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
        expiredMsgEl.textContent = "Hack is currently live or registration has concluded!";
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
      window.Hack_CONFIG.eventName = cfg.event_name;
      updateEventNameDisplays(cfg.event_name);
    }
    if (cfg.registration_deadline) {
      window.Hack_CONFIG.eventDate = cfg.registration_deadline;
      if (typeof window.updateCountdownTarget === 'function') {
        window.updateCountdownTarget(cfg.registration_deadline);
      }
    }
    if (cfg.prize_pool) {
      window.Hack_CONFIG.prizePool = cfg.prize_pool;
      document.querySelectorAll('.prize-pool-text, #heroPrizePool, [data-hack-prize]').forEach(el => {
        el.textContent = cfg.prize_pool;
      });
    }
    if (cfg.individual_fee !== undefined) {
      window.Hack_CONFIG.fees.individual = cfg.individual_fee;
    }
    if (cfg.team_fee !== undefined) {
      window.Hack_CONFIG.fees.team = cfg.team_fee;
    }
    if (cfg.per_member_fee !== undefined) {
      window.Hack_CONFIG.fees.per_member = cfg.per_member_fee;
    }
    if (cfg.meals_fee !== undefined) {
      window.Hack_CONFIG.fees.meals_fee = cfg.meals_fee;
    }
    const curr = cfg.currency === "INR" ? "₹" : (cfg.currency || "₹");
    window.Hack_CONFIG.fees.currency = curr;
    updatePublicFeeDisplays(cfg.individual_fee, cfg.team_fee, curr, cfg.per_member_fee, cfg.meals_fee);

    if (cfg.contact) {
      const c = cfg.contact;
      if (c.venue_city) {
        document.querySelectorAll('#heroVenueBadge, [data-hack-venue-city]').forEach(el => {
          el.textContent = c.venue_city;
        });
      }
      if (c.venue_address || c.venue_short) {
        document.querySelectorAll('#footerVenueAddress, [data-hack-venue-address]').forEach(el => {
          el.textContent = c.venue_address || c.venue_short;
        });
      }
      if (c.email) {
        document.querySelectorAll('#footerContactEmail, [data-hack-contact-email]').forEach(el => {
          el.textContent = c.email;
        });
      }
      if (c.phone) {
        document.querySelectorAll('#footerContactPhone, [data-hack-contact-phone]').forEach(el => {
          el.textContent = c.phone;
        });
      }
    }
  } catch (err) {
    // Non-blocking fallback
  }
}

/**
 * Updates all public fee displays across any page on the portal
 */
function updatePublicFeeDisplays(indivFee, teamFee, currency = "₹", perMemberFee, mealsFee) {
  const indiv = indivFee !== undefined ? indivFee : (window.Hack_CONFIG?.fees?.individual ?? 299);
  const team = teamFee !== undefined ? teamFee : (window.Hack_CONFIG?.fees?.team ?? 999);
  const memberFee = perMemberFee !== undefined
    ? perMemberFee
    : (window.Hack_CONFIG?.fees?.per_member ?? (indivFee !== undefined ? indivFee : 250));
  const meals = mealsFee !== undefined
    ? mealsFee
    : (window.Hack_CONFIG?.fees?.meals_fee ?? 0);
  const curr = currency || "₹";

  // 1. Hero Entry Fee Badge (Home page)
  document.querySelectorAll('#heroEntryFeeDisplay, [data-hack-fees="combined"]').forEach(el => {
    el.textContent = `${curr}${memberFee} / Member`;
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
    REG_CONFIG.perMemberFee = memberFee;
    REG_CONFIG.mealsFee = meals;
    REG_CONFIG.currency = curr;
    if (typeof updateDynamicPricing === "function") {
      updateDynamicPricing();
    }
  }
}
window.updatePublicFeeDisplays = updatePublicFeeDisplays;

/**
 * Dynamically updates all branding, titles, and mentions of the event name across the page
 */
function updateEventNameDisplays(eventName) {
  if (!eventName || typeof eventName !== 'string') return;
  const name = eventName.trim();
  if (!name) return;

  const shortName = name.split(' ')[0] || name;
  const initial = name.charAt(0).toUpperCase();

  // 1. Update logo initial and brand texts
  document.querySelectorAll('.brand-logo-icon').forEach(el => {
    el.textContent = initial;
  });
  document.querySelectorAll('.brand-name').forEach(el => {
    el.textContent = shortName;
  });
  document.querySelectorAll('.brand-sub').forEach(el => {
    el.textContent = `${name} Hackathon`;
  });

  // 2. Update document title
  if (document.title && (document.title.includes('Hack') || document.title.includes('Hackathon'))) {
    document.title = document.title.replace(/Hack\s*\d*/gi, name);
  }

  // 3. Update dedicated data attributes and classes
  document.querySelectorAll('[data-event-name], .event-name-display').forEach(el => {
    el.textContent = name;
  });
  document.querySelectorAll('[data-event-short-name]').forEach(el => {
    el.textContent = shortName;
  });

  // 4. Update banner and section texts that contain Hack
  const replaceBrandInElement = (el) => {
    if (!el || !el.childNodes) return;
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.includes('Hack')) {
        node.nodeValue = node.nodeValue.replace(/Hack\s*2026/g, name).replace(/Hack/g, shortName);
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('no-brand-replace')) {
        replaceBrandInElement(node);
      }
    });
  };

  document.querySelectorAll('.announcement-banner, .hero-title, .hero-badge, .about-highlight-title, .section-title, .section-desc, .footer-desc, .footer-bottom, .confirmation-event-title, .card-title, .rule-card p').forEach(el => {
    replaceBrandInElement(el);
  });
}
window.updateEventNameDisplays = updateEventNameDisplays;

