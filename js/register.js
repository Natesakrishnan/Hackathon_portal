/**
 * SYNEX HACKATHON — REGISTRATION LOGIC (register.js)
 * Manages participant/team registration, dynamic member fields,
 * real-time fee calculation, validation, API submission, and
 * seamless progression to Step 2 (Review Entry Fee).
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
  fetchEventFees();
});

/**
 * Fetch dynamic fees and domain tracks from backend
 */
async function fetchEventFees() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      if (data.individual_fee !== undefined) REG_CONFIG.individualFee = data.individual_fee;
      if (data.team_fee !== undefined) REG_CONFIG.teamFee = data.team_fee;
      if (data.currency) REG_CONFIG.currency = data.currency === "INR" ? "₹" : data.currency;

      // Update Type Selection Pills
      const pillIndiv = document.getElementById("pillIndividualFee");
      const pillTeam = document.getElementById("pillTeamFee");
      if (pillIndiv) pillIndiv.textContent = `${REG_CONFIG.currency}${REG_CONFIG.individualFee}`;
      if (pillTeam) pillTeam.textContent = `${REG_CONFIG.currency}${REG_CONFIG.teamFee}`;
      document.querySelectorAll('[data-fee-pill="individual"]').forEach(el => el.textContent = `${REG_CONFIG.currency}${REG_CONFIG.individualFee}`);
      document.querySelectorAll('[data-fee-pill="team"]').forEach(el => el.textContent = `${REG_CONFIG.currency}${REG_CONFIG.teamFee}`);

      // Update fee tags on screen if present
      const summaryFeeEl = document.getElementById("summaryBaseFee");
      const summaryTotalEl = document.getElementById("summaryTotalPrice");
      const reviewFeeEl = document.getElementById("reviewBaseFee");
      const reviewTotalEl = document.getElementById("reviewTotalAmount");
      const isTeam = document.querySelector('input[name="regType"]:checked')?.value === "team";
      const currentFee = isTeam ? REG_CONFIG.teamFee : REG_CONFIG.individualFee;

      if (summaryFeeEl) summaryFeeEl.textContent = `${REG_CONFIG.currency}${currentFee}`;
      if (summaryTotalEl) summaryTotalEl.textContent = `${REG_CONFIG.currency}${currentFee}`;
      if (reviewFeeEl) reviewFeeEl.textContent = `${REG_CONFIG.currency}${currentFee}`;
      if (reviewTotalEl) reviewTotalEl.textContent = `${REG_CONFIG.currency}${currentFee}`;
    }
  } catch (err) {
    // Graceful fallback to default config
  }

  // Also verify domain options from /api/domains
  try {
    const domainRes = await fetch("/api/domains");
    if (domainRes.ok) {
      const domainData = await domainRes.json();
      const domainSelect = document.getElementById("domain");
      if (domainSelect && Array.isArray(domainData.domains) && domainData.domains.length > 0) {
        const currentVal = domainSelect.value;
        domainSelect.innerHTML = `<option value="" disabled ${!currentVal ? "selected" : ""}>Select your domain</option>` +
          domainData.domains.map(d => `<option value="${escapeHtml(d)}" ${currentVal === d ? "selected" : ""}>${escapeHtml(d)}</option>`).join("");
      }
    }
  } catch (err) {
    // Retain hardcoded fallback options
  }
}

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
    const currentFee = isTeam ? REG_CONFIG.teamFee : REG_CONFIG.individualFee;
    const reviewFeeEl = document.getElementById("reviewBaseFee");
    const reviewTotalEl = document.getElementById("reviewTotalAmount");
    if (reviewFeeEl) reviewFeeEl.textContent = `${REG_CONFIG.currency}${currentFee}`;
    if (reviewTotalEl) reviewTotalEl.textContent = `${REG_CONFIG.currency}${currentFee}`;

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
            <span class="field-error">Please enter the member's full name.</span>
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
            <span class="field-error">Please enter a valid email address.</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="member_${i}_phone">
              <span>Phone Number</span>
              <span class="required">*</span>
            </label>
            <div class="input-wrapper">
              <input type="tel" id="member_${i}_phone" class="form-input member-phone" placeholder="10-digit mobile number" required maxlength="10">
              <i class="fa-solid fa-phone input-icon" aria-hidden="true"></i>
            </div>
            <span class="field-error">Please enter a valid 10-digit phone number.</span>
          </div>
        </div>
      `;
      membersContainer.appendChild(memberCard);
    }

    if (summaryMembersCount) {
      summaryMembersCount.textContent = `${REG_CONFIG.currentTeamSize} Members (1 Lead + ${REG_CONFIG.currentTeamSize - 1} Members)`;
    }

    // Bind remove buttons
    const removeBtns = membersContainer.querySelectorAll(".btn-remove-member");
    removeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (REG_CONFIG.currentTeamSize > REG_CONFIG.minTeamSize) {
          REG_CONFIG.currentTeamSize--;
          renderTeamMembers();
          updateAddButtonState();
        }
      });
    });

    updateAddButtonState();
  }

  function updateAddButtonState() {
    if (!btnAddMember) return;
    if (REG_CONFIG.currentTeamSize >= REG_CONFIG.maxTeamSize) {
      btnAddMember.disabled = true;
      btnAddMember.innerHTML = `<i class="fa-solid fa-ban" aria-hidden="true"></i> <span>Maximum Team Size Reached (4 Members)</span>`;
    } else {
      btnAddMember.disabled = false;
      btnAddMember.innerHTML = `<i class="fa-solid fa-plus" aria-hidden="true"></i> <span>Add Member ${REG_CONFIG.currentTeamSize + 1}</span>`;
    }
  }

  // Add Member Click
  if (btnAddMember) {
    btnAddMember.addEventListener("click", () => {
      if (REG_CONFIG.currentTeamSize < REG_CONFIG.maxTeamSize) {
        REG_CONFIG.currentTeamSize++;
        renderTeamMembers();
      }
    });
  }

  // Real-time error clearance on input
  form.addEventListener("input", (e) => {
    const input = e.target;
    if (input.classList.contains("is-invalid")) {
      input.classList.remove("is-invalid");
      const group = input.closest(".form-group");
      if (group) group.classList.remove("has-error");
    }
  });

  // Real-time error clearance on terms checkbox
  const termsCheckbox = document.getElementById("termsCheck") || document.getElementById("termsAccepted");
  if (termsCheckbox) {
    termsCheckbox.addEventListener("change", () => {
      if (termsCheckbox.checked) {
        const termsGroup = termsCheckbox.closest(".terms-group");
        if (termsGroup) {
          termsGroup.style.borderColor = "";
          termsGroup.style.backgroundColor = "";
        }
      }
    });
  }

  // Handle Form Submission via Backend API
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const isTeam = document.querySelector('input[name="regType"]:checked')?.value === "team";
    let isValid = true;
    let firstInvalidField = null;

    function markError(element, message) {
      element.classList.add("is-invalid");
      const group = element.closest(".form-group");
      if (group) {
        group.classList.add("has-error");
        const errEl = group.querySelector(".field-error");
        if (errEl && message) errEl.textContent = message;
      }
      if (!firstInvalidField) firstInvalidField = element;
      isValid = false;
    }

    // Clear previous errors
    document.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    document.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));

    // Remove any existing top error banner
    const oldBanner = document.getElementById("formSubmitErrorBanner");
    if (oldBanner) oldBanner.remove();

    // Primary Participant / Team Leader Fields
    const fullName = document.getElementById("fullName");
    const email = document.getElementById("email");
    const mobile = document.getElementById("mobile");
    const college = document.getElementById("college");
    const department = document.getElementById("department");
    const yearOfStudy = document.getElementById("yearOfStudy");
    const domain = document.getElementById("domain");
    const termsCheck = document.getElementById("termsCheck") || document.getElementById("termsAccepted");

    // Full Name Validation
    if (!fullName.value.trim() || fullName.value.trim().length < 2) {
      markError(fullName, "Please enter your full legal name (at least 2 letters).");
    }

    // Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.value.trim() || !emailRegex.test(email.value.trim())) {
      markError(email, "Please provide a valid email address.");
    }

    // Mobile Validation
    const cleanedMobile = mobile.value.replace(/\D/g, "");
    if (cleanedMobile.length !== 10) {
      markError(mobile, "Please enter a valid 10-digit mobile number.");
    }

    // College & Dept
    if (!college.value.trim() || college.value.trim().length < 2) {
      markError(college, "Please enter your institution or college name.");
    }
    if (!department.value.trim() || department.value.trim().length < 2) {
      markError(department, "Please specify your academic branch or department.");
    }
    if (!yearOfStudy.value) {
      markError(yearOfStudy, "Please select your current year of study.");
    }

    // Domain Track
    if (!domain.value) {
      markError(domain, "Please choose one hackathon domain track.");
    }

    // Team specific validation
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
        const mPhone = document.getElementById(`member_${i}_phone`);

        if (mName && (!mName.value.trim() || mName.value.trim().length < 2)) {
          markError(mName, `Please enter full name for Member ${i}.`);
        }
        if (mEmail && (!mEmail.value.trim() || !emailRegex.test(mEmail.value.trim()))) {
          markError(mEmail, `Please enter a valid email for Member ${i}.`);
        }
        const mPhoneCleaned = mPhone ? mPhone.value.replace(/\D/g, "") : "";
        if (mPhone && mPhoneCleaned.length !== 10) {
          markError(mPhone, `Please enter a valid 10-digit phone for Member ${i}.`);
        }

        if (mName && mEmail) {
          membersData.push({
            role: "member",
            full_name: mName.value.trim(),
            name: mName.value.trim(),
            email: mEmail.value.trim(),
            phone: mPhoneCleaned || "9876543210",
            college: college.value.trim(),
            department: department.value.trim(),
            year_of_study: yearOfStudy.value,
          });
        }
      }
    }

    // Terms Acceptance
    if (!termsCheck || !termsCheck.checked) {
      const termsGroup = termsCheck ? termsCheck.closest(".terms-group") : null;
      if (termsGroup) {
        termsGroup.style.borderColor = "var(--color-error)";
        termsGroup.style.backgroundColor = "var(--color-error-bg)";
      }
      if (!firstInvalidField && termsCheck) firstInvalidField = termsCheck;
      isValid = false;
    } else {
      const termsGroup = termsCheck.closest(".terms-group");
      if (termsGroup) {
        termsGroup.style.borderColor = "";
        termsGroup.style.backgroundColor = "";
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

    // Build Payload for Backend API
    let payload = {};
    if (isTeam) {
      payload = {
        registration_type: "team",
        team_name: teamNameVal,
        domain: domain.value,
        leader: {
          full_name: fullName.value.trim(),
          name: fullName.value.trim(),
          email: email.value.trim(),
          phone: cleanedMobile,
          college: college.value.trim(),
          department: department.value.trim(),
          year_of_study: yearOfStudy.value,
        },
        members: membersData,
      };
    } else {
      payload = {
        registration_type: "individual",
        domain: domain.value,
        full_name: fullName.value.trim(),
        name: fullName.value.trim(),
        email: email.value.trim(),
        phone: cleanedMobile,
        college: college.value.trim(),
        department: department.value.trim(),
        year_of_study: yearOfStudy.value,
      };
    }

    // Submit button loading state & duplicate submission prevention
    const submitBtn = document.getElementById("btnContinuePayment") || document.getElementById("btnSubmitRegistration");
    const originalBtnContent = submitBtn ? submitBtn.innerHTML : "<span>Review &amp; Proceed to Payment</span>";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Creating Registration...</span>`;
    }

    try {
      const response = await fetch("/api/registrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Save draft in sessionStorage for payment / offline fallback
        try {
          sessionStorage.setItem("synex_registration_ref", result.registration_id);
          sessionStorage.setItem("synex_registration_draft", JSON.stringify({
            referenceId: result.registration_id,
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
            baseFee: result.entry_fee,
            totalAmount: result.entry_fee,
            currency: REG_CONFIG.currency,
          }));
        } catch (e) {
          console.warn("Storage warning:", e);
        }

        // Restore button state for future edits
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnContent;
        }

        // Advance to Step 2 (Review Entry Fee & Details)
        advanceToStep2(result, payload, isTeam);

      } else {
        // Error returned from API
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnContent;
        }

        const banner = document.createElement("div");
        banner.id = "formSubmitErrorBanner";
        banner.className = "alert alert-danger";
        banner.style.cssText = "margin-bottom: 24px; padding: 14px 18px; border-radius: 8px; background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; display: flex; align-items: center; gap: 12px; font-weight: 500;";
        banner.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="font-size: 1.25rem;"></i> <span>${escapeHtml(result.error || "Failed to create registration. Please check the entered data.")}</span>`;
        
        form.insertBefore(banner, form.firstChild);
        banner.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (err) {
      console.error("Submission error:", err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
      }
      const banner = document.createElement("div");
      banner.id = "formSubmitErrorBanner";
      banner.className = "alert alert-danger";
      banner.style.cssText = "margin-bottom: 24px; padding: 14px 18px; border-radius: 8px; background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; display: flex; align-items: center; gap: 12px; font-weight: 500;";
      banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size: 1.25rem;"></i> <span>Connection error. Please check your internet connection and try again.</span>`;
      form.insertBefore(banner, form.firstChild);
      banner.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

/**
 * Advances the UI to Step 2: Review Entry Fee
 */
function advanceToStep2(result, payload, isTeam) {
  // 1. Update Stepper Progress Indicators
  const step1 = document.getElementById("stepIndicator1");
  const step2 = document.getElementById("stepIndicator2");

  if (step1) {
    step1.classList.remove("active");
    step1.classList.add("completed");
    const circle = step1.querySelector(".step-circle");
    if (circle) circle.innerHTML = `<i class="fa-solid fa-check"></i>`;
  }
  if (step2) {
    step2.classList.add("active");
    step2.classList.remove("completed");
    const circle = step2.querySelector(".step-circle");
    if (circle) circle.innerHTML = `<span aria-current="step">2</span>`;
  }

  // 2. Hide Step 1 Card & Show Step 2 Review Card
  const step1Card = document.getElementById("step1Card");
  const step2Card = document.getElementById("step2Card");

  if (step1Card) step1Card.style.display = "none";
  if (step2Card) {
    step2Card.style.display = "block";
    step2Card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 3. Populate Review Card Fields
  const reviewRefCode = document.getElementById("reviewRefCode");
  const reviewRegType = document.getElementById("reviewRegType");
  const reviewDomain = document.getElementById("reviewDomain");
  const reviewCollege = document.getElementById("reviewCollege");
  const reviewDeptYear = document.getElementById("reviewDeptYear");
  const reviewTeamNameRow = document.getElementById("reviewTeamNameRow");
  const reviewTeamName = document.getElementById("reviewTeamName");
  const reviewParticipantsTitle = document.getElementById("reviewParticipantsTitle");
  const reviewMembersList = document.getElementById("reviewMembersList");
  const reviewBaseFee = document.getElementById("reviewBaseFee");
  const reviewTotalAmount = document.getElementById("reviewTotalAmount");

  if (reviewRefCode) reviewRefCode.textContent = result.registration_id;
  if (reviewRegType) reviewRegType.textContent = isTeam ? "Team Entry" : "Individual Registration";
  if (reviewDomain) reviewDomain.textContent = payload.domain;

  const leadCollege = isTeam ? payload.leader.college : payload.college;
  const leadDept = isTeam ? payload.leader.department : payload.department;
  const leadYear = isTeam ? payload.leader.year_of_study : payload.year_of_study;

  if (reviewCollege) reviewCollege.textContent = leadCollege;
  if (reviewDeptYear) reviewDeptYear.textContent = `${leadDept} (${leadYear})`;

  // Render Member/Participant Cards
  if (reviewMembersList) {
    reviewMembersList.innerHTML = "";

    if (isTeam) {
      if (reviewTeamNameRow) reviewTeamNameRow.style.display = "block";
      if (reviewTeamName) reviewTeamName.textContent = payload.team_name;
      const totalCount = (payload.members ? payload.members.length : 0) + 1;
      if (reviewParticipantsTitle) reviewParticipantsTitle.textContent = `Team Composition (${totalCount} Members)`;

      // Team Leader Card
      const leaderCard = document.createElement("div");
      leaderCard.className = "review-member-card";
      const leadInitial = (payload.leader.full_name || "L").charAt(0).toUpperCase();
      leaderCard.innerHTML = `
        <div class="review-member-info">
          <div class="review-member-avatar">${escapeHtml(leadInitial)}</div>
          <div>
            <div class="review-member-name">${escapeHtml(payload.leader.full_name)}</div>
            <div class="review-member-contact">${escapeHtml(payload.leader.email)} &bull; ${escapeHtml(payload.leader.phone)}</div>
          </div>
        </div>
        <span class="review-member-role"><i class="fa-solid fa-crown" style="margin-right: 4px;"></i>Team Leader</span>
      `;
      reviewMembersList.appendChild(leaderCard);

      // Additional Members
      if (payload.members && payload.members.length > 0) {
        payload.members.forEach((m, idx) => {
          const memCard = document.createElement("div");
          memCard.className = "review-member-card";
          const mInitial = (m.full_name || `M${idx + 2}`).charAt(0).toUpperCase();
          memCard.innerHTML = `
            <div class="review-member-info">
              <div class="review-member-avatar">${escapeHtml(mInitial)}</div>
              <div>
                <div class="review-member-name">${escapeHtml(m.full_name)}</div>
                <div class="review-member-contact">${escapeHtml(m.email)} &bull; ${escapeHtml(m.phone)}</div>
              </div>
            </div>
            <span class="review-member-role" style="background: #F1F5F9; color: #475569; border-color: #CBD5E1;">Member ${idx + 2}</span>
          `;
          reviewMembersList.appendChild(memCard);
        });
      }
    } else {
      if (reviewTeamNameRow) reviewTeamNameRow.style.display = "none";
      if (reviewParticipantsTitle) reviewParticipantsTitle.textContent = "Participant Credentials";

      const partCard = document.createElement("div");
      partCard.className = "review-member-card";
      const pInitial = (payload.full_name || "P").charAt(0).toUpperCase();
      partCard.innerHTML = `
        <div class="review-member-info">
          <div class="review-member-avatar">${escapeHtml(pInitial)}</div>
          <div>
            <div class="review-member-name">${escapeHtml(payload.full_name)}</div>
            <div class="review-member-contact">${escapeHtml(payload.email)} &bull; ${escapeHtml(payload.phone)}</div>
          </div>
        </div>
        <span class="review-member-role">Individual Hacker</span>
      `;
      reviewMembersList.appendChild(partCard);
    }
  }

  // Server-calculated Entry Fee
  const calculatedFee = result.entry_fee || (isTeam ? REG_CONFIG.teamFee : REG_CONFIG.individualFee);
  if (reviewBaseFee) reviewBaseFee.textContent = `${REG_CONFIG.currency}${calculatedFee}`;
  if (reviewTotalAmount) reviewTotalAmount.textContent = `${REG_CONFIG.currency}${calculatedFee}`;

  // Update Summary Sidebar if present
  const summaryFeeEl = document.getElementById("summaryBaseFee");
  const summaryTotalEl = document.getElementById("summaryTotalPrice");
  if (summaryFeeEl) summaryFeeEl.textContent = `${REG_CONFIG.currency}${calculatedFee}`;
  if (summaryTotalEl) summaryTotalEl.textContent = `${REG_CONFIG.currency}${calculatedFee}`;

  // 4. Wire Action Buttons
  const btnProceed = document.getElementById("btnProceedToPayment");
  if (btnProceed) {
    btnProceed.onclick = () => {
      window.location.href = result.redirect_url || `/payment?ref=${result.registration_id}`;
    };
  }

  const btnEdit = document.getElementById("btnEditRegistration");
  if (btnEdit) {
    btnEdit.onclick = () => {
      returnToStep1();
    };
  }
}

/**
 * Reverts view back to Step 1 so participant can edit credentials
 */
function returnToStep1() {
  const step1 = document.getElementById("stepIndicator1");
  const step2 = document.getElementById("stepIndicator2");

  if (step1) {
    step1.classList.add("active");
    step1.classList.remove("completed");
    const circle = step1.querySelector(".step-circle");
    if (circle) circle.innerHTML = `<span aria-current="step">1</span>`;
  }
  if (step2) {
    step2.classList.remove("active");
    step2.classList.remove("completed");
    const circle = step2.querySelector(".step-circle");
    if (circle) circle.textContent = "2";
  }

  const step1Card = document.getElementById("step1Card");
  const step2Card = document.getElementById("step2Card");

  if (step2Card) step2Card.style.display = "none";
  if (step1Card) {
    step1Card.style.display = "block";
    step1Card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const submitBtn = document.getElementById("btnContinuePayment") || document.getElementById("btnSubmitRegistration");
  if (submitBtn) {
    submitBtn.disabled = false;
  }
}

/**
 * Helper to escape HTML characters
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
