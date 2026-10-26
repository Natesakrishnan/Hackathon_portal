/**
 * SYNEX HACKATHON — REGISTRATION LOGIC (register.js)
 * Manages participant/team registration, dynamic member fields,
 * real-time fee calculation, validation, and temporary sessionStorage draft.
 */

const REG_CONFIG = {
  individualFee: 299,
  teamFee: 999,
  currency: "₹",
  minTeamSize: 2,
  maxTeamSize: 4,
  currentTeamSize: 3 // Default starting size: Leader + 2 members
};

document.addEventListener("DOMContentLoaded", () => {
  initRegistrationForm();
});

function initRegistrationForm() {
  const form = document.getElementById("registrationForm");
  const typeRadios = document.querySelectorAll('input[name="regType"]');
  const teamSection = document.getElementById("teamSection");
  const membersContainer = document.getElementById("dynamicMembersContainer");
  const btnAddMember = document.getElementById("btnAddMember");

  // Fee Display Elements
  const summaryTypeEl = document.getElementById("summaryRegType");
  const summaryFeeEl = document.getElementById("summaryBaseFee");
  const summaryTotalEl = document.getElementById("summaryTotalPrice");
  const summaryMembersRow = document.getElementById("summaryMembersRow");
  const summaryMembersCount = document.getElementById("summaryMembersCount");

  if (!form) return;

  // Restore draft if user navigated back from payment
  restoreDraftIfPresent();

  // Handle Individual vs Team Radio Switch
  typeRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const isTeam = e.target.value === "team";
      updateFormType(isTeam);
    });
  });

  function updateFormType(isTeam) {
    if (isTeam) {
      teamSection.classList.add("active");
      summaryTypeEl.textContent = "Team Registration";
      summaryFeeEl.textContent = `${REG_CONFIG.currency}${REG_CONFIG.teamFee}`;
      summaryTotalEl.textContent = `${REG_CONFIG.currency}${REG_CONFIG.teamFee}`;
      if (summaryMembersRow) summaryMembersRow.style.display = "flex";
      renderTeamMembers();
    } else {
      teamSection.classList.remove("active");
      summaryTypeEl.textContent = "Individual Registration";
      summaryFeeEl.textContent = `${REG_CONFIG.currency}${REG_CONFIG.individualFee}`;
      summaryTotalEl.textContent = `${REG_CONFIG.currency}${REG_CONFIG.individualFee}`;
      if (summaryMembersRow) summaryMembersRow.style.display = "none";
    }
  }

  // Render dynamic team member cards
  function renderTeamMembers() {
    if (!membersContainer) return;
    membersContainer.innerHTML = "";

    // Leader is member 1 (filled in the primary fields)
    // Additional members start from index 2 up to currentTeamSize
    const additionalCount = REG_CONFIG.currentTeamSize - 1;

    for (let i = 2; i <= REG_CONFIG.currentTeamSize; i++) {
      const memberCard = document.createElement("div");
      memberCard.className = "member-card";
      memberCard.id = `memberCard_${i}`;
      memberCard.innerHTML = `
        <div class="member-card-header">
          <div class="member-card-title">
            <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
            <span>Team Member ${i}</span>
          </div>
          ${
            REG_CONFIG.currentTeamSize > REG_CONFIG.minTeamSize && i === REG_CONFIG.currentTeamSize
              ? `<button type="button" class="btn-remove-member" data-index="${i}">
                   <i class="fa-solid fa-trash" aria-hidden="true"></i>
                   <span>Remove</span>
                 </button>`
              : ""
          }
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="member_${i}_name">
              <span>Full Name</span>
              <span class="required">*</span>
            </label>
            <div class="input-wrapper">
              <input type="text" id="member_${i}_name" class="form-input member-name" placeholder="Member full name" required>
              <i class="fa-solid fa-user input-icon" aria-hidden="true"></i>
            </div>
            <span class="field-error">Please enter member's full name.</span>
          </div>
          <div class="form-group">
            <label class="form-label" for="member_${i}_email">
              <span>Email Address</span>
              <span class="required">*</span>
            </label>
            <div class="input-wrapper">
              <input type="email" id="member_${i}_email" class="form-input member-email" placeholder="member@college.edu" required>
              <i class="fa-solid fa-envelope input-icon" aria-hidden="true"></i>
            </div>
            <span class="field-error">Please provide a valid college email.</span>
          </div>
        </div>
      `;
      membersContainer.appendChild(memberCard);
    }

    // Attach remove event listeners
    const removeButtons = membersContainer.querySelectorAll(".btn-remove-member");
    removeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (REG_CONFIG.currentTeamSize > REG_CONFIG.minTeamSize) {
          REG_CONFIG.currentTeamSize--;
          renderTeamMembers();
          updateSummaryCount();
        }
      });
    });

    // Toggle add member button visibility based on max limit
    if (btnAddMember) {
      if (REG_CONFIG.currentTeamSize >= REG_CONFIG.maxTeamSize) {
        btnAddMember.style.display = "none";
      } else {
        btnAddMember.style.display = "inline-flex";
      }
    }

    updateSummaryCount();
  }

  // Add Member Button
  if (btnAddMember) {
    btnAddMember.addEventListener("click", () => {
      if (REG_CONFIG.currentTeamSize < REG_CONFIG.maxTeamSize) {
        REG_CONFIG.currentTeamSize++;
        renderTeamMembers();
        updateSummaryCount();
      }
    });
  }

  function updateSummaryCount() {
    if (summaryMembersCount) {
      summaryMembersCount.textContent = `${REG_CONFIG.currentTeamSize} Members`;
    }
    const teamSizeBadge = document.getElementById("teamSizeBadge");
    if (teamSizeBadge) {
      teamSizeBadge.textContent = `${REG_CONFIG.currentTeamSize} of ${REG_CONFIG.maxTeamSize} max`;
    }
  }

  // Clear errors on input
  form.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", () => {
      const group = input.closest(".form-group");
      if (group) group.classList.remove("has-error");
    });
  });

  // Handle Form Submission with Validation
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    let isValid = true;
    let firstInvalidField = null;

    function markError(element, message) {
      const group = element.closest(".form-group");
      if (group) {
        group.classList.add("has-error");
        const errSpan = group.querySelector(".field-error");
        if (errSpan && message) {
          errSpan.textContent = message;
        }
      }
      if (!firstInvalidField) {
        firstInvalidField = element;
      }
      isValid = false;
    }

    // Validate Primary Details
    const fullName = document.getElementById("fullName");
    const email = document.getElementById("email");
    const mobile = document.getElementById("mobile");
    const college = document.getElementById("college");
    const department = document.getElementById("department");
    const yearOfStudy = document.getElementById("yearOfStudy");
    const domain = document.getElementById("domain");
    const termsCheck = document.getElementById("termsCheck");

    // Full Name
    if (!fullName.value.trim() || fullName.value.trim().length < 2) {
      markError(fullName, "Please enter your full legal name.");
    }

    // Email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.value.trim() || !emailRegex.test(email.value.trim())) {
      markError(email, "Please enter a valid email address.");
    }

    // Indian Phone format (10 digits starting with 6-9)
    const cleanedMobile = mobile.value.trim().replace(/^(\+91|0)/, "").replace(/[\s-]/g, "");
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(cleanedMobile)) {
      markError(mobile, "Please enter a valid 10-digit Indian mobile number.");
    }

    // College
    if (!college.value.trim()) {
      markError(college, "Please enter your institution or university.");
    }

    // Department
    if (!department.value.trim()) {
      markError(department, "Please specify your branch or department.");
    }

    // Year of Study
    if (!yearOfStudy.value) {
      markError(yearOfStudy, "Please select your current year of study.");
    }

    // Preferred Domain
    if (!domain.value) {
      markError(domain, "Please choose your preferred innovation domain.");
    }

    // Team Specific Validation
    const selectedType = document.querySelector('input[name="regType"]:checked').value;
    const isTeam = selectedType === "team";
    let teamNameVal = "";
    const membersData = [];

    if (isTeam) {
      const teamName = document.getElementById("teamName");
      if (!teamName.value.trim() || teamName.value.trim().length < 2) {
        markError(teamName, "Please provide a recognizable team name.");
      } else {
        teamNameVal = teamName.value.trim();
      }

      // Validate dynamic team members
      for (let i = 2; i <= REG_CONFIG.currentTeamSize; i++) {
        const mName = document.getElementById(`member_${i}_name`);
        const mEmail = document.getElementById(`member_${i}_email`);

        if (mName && (!mName.value.trim() || mName.value.trim().length < 2)) {
          markError(mName, `Please enter full name for Member ${i}.`);
        }
        if (mEmail && (!mEmail.value.trim() || !emailRegex.test(mEmail.value.trim()))) {
          markError(mEmail, `Please enter a valid email for Member ${i}.`);
        }

        if (mName && mEmail) {
          membersData.push({
            role: `Member ${i}`,
            name: mName.value.trim(),
            email: mEmail.value.trim()
          });
        }
      }
    }

    // Terms Acceptance
    if (!termsCheck.checked) {
      const termsGroup = termsCheck.closest(".terms-group");
      if (termsGroup) {
        termsGroup.style.borderColor = "var(--color-error)";
        termsGroup.style.backgroundColor = "var(--color-error-bg)";
      }
      if (!firstInvalidField) firstInvalidField = termsCheck;
      isValid = false;
    } else {
      const termsGroup = termsCheck.closest(".terms-group");
      if (termsGroup) {
        termsGroup.style.borderColor = "var(--color-border)";
        termsGroup.style.backgroundColor = "var(--color-bg-alt)";
      }
    }

    // If validation fails
    if (!isValid) {
      if (firstInvalidField) {
        firstInvalidField.focus();
        firstInvalidField.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    // Collect Registration Data & Generate DEMO Reference
    const randomRef = Math.floor(10000 + Math.random() * 90000);
    const demoRef = `SYN-DEMO-${randomRef}`;
    const feeAmount = isTeam ? REG_CONFIG.teamFee : REG_CONFIG.individualFee;

    const draftData = {
      referenceId: demoRef,
      type: isTeam ? "Team" : "Individual",
      participantName: fullName.value.trim(),
      email: email.value.trim(),
      mobile: cleanedMobile,
      college: college.value.trim(),
      department: department.value.trim(),
      yearOfStudy: yearOfStudy.value,
      domain: domain.value,
      teamName: isTeam ? teamNameVal : null,
      teamSize: isTeam ? REG_CONFIG.currentTeamSize : 1,
      members: membersData,
      baseFee: feeAmount,
      totalAmount: feeAmount,
      currency: REG_CONFIG.currency,
      registeredAt: new Date().toISOString(),
      isDemo: true
    };

    // Store temporarily in sessionStorage
    try {
      sessionStorage.setItem("synex_registration_draft", JSON.stringify(draftData));
      // Reset any previous payment simulation state
      sessionStorage.removeItem("synex_payment_status");
    } catch (err) {
      console.warn("sessionStorage warning:", err);
    }

    // Forward to payment checkout preview
    window.location.href = "payment.html";
  });
}

/**
 * Check if a draft exists in sessionStorage and restore fields
 */
function restoreDraftIfPresent() {
  try {
    const rawDraft = sessionStorage.getItem("synex_registration_draft");
    if (!rawDraft) return;

    const draft = JSON.parse(rawDraft);
    if (!draft || !draft.participantName) return;

    const fullName = document.getElementById("fullName");
    const email = document.getElementById("email");
    const mobile = document.getElementById("mobile");
    const college = document.getElementById("college");
    const department = document.getElementById("department");
    const yearOfStudy = document.getElementById("yearOfStudy");
    const domain = document.getElementById("domain");

    if (fullName) fullName.value = draft.participantName || "";
    if (email) email.value = draft.email || "";
    if (mobile) mobile.value = draft.mobile || "";
    if (college) college.value = draft.college || "";
    if (department) department.value = draft.department || "";
    if (yearOfStudy) yearOfStudy.value = draft.yearOfStudy || "";
    if (domain) domain.value = draft.domain || "";

    if (draft.type === "Team") {
      const teamRadio = document.getElementById("typeTeam");
      if (teamRadio) {
        teamRadio.checked = true;
        teamRadio.dispatchEvent(new Event("change"));
      }
      const teamName = document.getElementById("teamName");
      if (teamName) teamName.value = draft.teamName || "";
    }
  } catch (err) {
    console.error("Error restoring draft:", err);
  }
}
