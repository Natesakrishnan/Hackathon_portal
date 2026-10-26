/**
 * SYNEX HACKATHON — PAYMENT CHECKOUT PREVIEW (payment.js)
 * Manages draft retrieval, fee breakdown, demo payment simulation,
 * and demo failure state previews without real money processing.
 */

document.addEventListener("DOMContentLoaded", () => {
  initPaymentCheckout();
});

function initPaymentCheckout() {
  const missingStateCard = document.getElementById("missingStateCard");
  const checkoutCard = document.getElementById("checkoutCard");
  const failureCard = document.getElementById("failureStateCard");
  const modalBackdrop = document.getElementById("demoPaymentModal");

  // Retrieve draft registration from sessionStorage
  let draftData = null;
  try {
    const raw = sessionStorage.getItem("synex_registration_draft");
    if (raw) {
      draftData = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to parse registration draft:", err);
  }

  // Handle missing draft data gracefully
  if (!draftData || !draftData.participantName) {
    if (missingStateCard) missingStateCard.style.display = "block";
    if (checkoutCard) checkoutCard.style.display = "none";
    return;
  }

  // Populate Order Details safely
  populateOrderDetails(draftData);

  // Setup Payment Method Tabs (Demo selection)
  const methodBoxes = document.querySelectorAll(".method-box");
  methodBoxes.forEach((box) => {
    box.addEventListener("click", () => {
      methodBoxes.forEach((b) => b.classList.remove("selected"));
      box.classList.add("selected");
    });
  });

  // Proceed to Demo Payment Button
  const btnProceed = document.getElementById("btnProceedPayment");
  if (btnProceed && modalBackdrop) {
    btnProceed.addEventListener("click", () => {
      openDemoModal(modalBackdrop, draftData);
    });
  }

  // Preview Payment Failure Button
  const btnFail = document.getElementById("btnSimulateFailure");
  if (btnFail) {
    btnFail.addEventListener("click", () => {
      showFailureState(checkoutCard, failureCard);
    });
  }

  // Retry Button from Failure State
  const btnRetry = document.getElementById("btnRetryDemo");
  if (btnRetry) {
    btnRetry.addEventListener("click", () => {
      if (failureCard) failureCard.style.display = "none";
      if (checkoutCard) checkoutCard.style.display = "block";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

/**
 * Populate order details safely
 */
function populateOrderDetails(draft) {
  const refBadge = document.getElementById("checkoutRefId");
  const nameEl = document.getElementById("orderName");
  const typeEl = document.getElementById("orderType");
  const collegeEl = document.getElementById("orderCollege");
  const domainEl = document.getElementById("orderDomain");
  const baseFeeEl = document.getElementById("orderBaseFee");
  const totalAmountEl = document.getElementById("orderTotalAmount");

  if (refBadge) refBadge.textContent = draft.referenceId || "SYN-DEMO-00000";

  if (nameEl) {
    if (draft.type === "Team" && draft.teamName) {
      nameEl.textContent = `${draft.teamName} (Lead: ${draft.participantName})`;
    } else {
      nameEl.textContent = draft.participantName;
    }
  }

  if (typeEl) {
    typeEl.textContent = draft.type === "Team"
      ? `Team Registration (${draft.teamSize || 3} Members)`
      : "Individual Registration";
  }

  if (collegeEl) collegeEl.textContent = draft.college || "N/A";
  if (domainEl) domainEl.textContent = draft.domain || "General Innovation";

  const currency = draft.currency || "₹";
  const fee = draft.totalAmount || (draft.type === "Team" ? 999 : 299);

  if (baseFeeEl) baseFeeEl.textContent = `${currency}${fee}`;
  if (totalAmountEl) totalAmountEl.textContent = `${currency}${fee}`;
}

/**
 * Demo Payment Gateway Modal Workflow
 */
function openDemoModal(modalBackdrop, draftData) {
  modalBackdrop.classList.add("active");

  const modalTitle = document.getElementById("modalTitle");
  const modalDesc = document.getElementById("modalDesc");
  const modalSpinner = document.getElementById("modalSpinner");
  const modalActions = document.getElementById("modalActions");

  modalTitle.textContent = "Simulating Gateway Handshake";
  modalDesc.textContent = "Connecting to simulated demo payment gateway... Please wait a moment.";
  modalSpinner.style.display = "block";
  modalActions.style.display = "none";

  // Simulate 1.5 seconds network / processor handshake
  setTimeout(() => {
    modalSpinner.style.display = "none";
    modalTitle.textContent = "Gateway Ready (Demo Mode)";
    modalDesc.innerHTML = `
      This is a safe demonstration checkout for <strong>${draftData.currency}${draftData.totalAmount}</strong>.<br>
      No real money will be deducted from your account.
    `;
    modalActions.style.display = "flex";
  }, 1400);

  // Setup Modal Actions
  const btnSuccess = document.getElementById("btnCompleteDemoSuccess");
  const btnCancel = document.getElementById("btnCancelDemoModal");

  if (btnSuccess) {
    btnSuccess.onclick = () => {
      // Mark demo payment as successful
      sessionStorage.setItem("synex_payment_status", "demo_success");
      sessionStorage.setItem("synex_payment_timestamp", new Date().toISOString());

      // Redirect to confirmation page
      window.location.href = "confirmation.html";
    };
  }

  if (btnCancel) {
    btnCancel.onclick = () => {
      modalBackdrop.classList.remove("active");
    };
  }
}

/**
 * Display Payment Failure Simulation
 */
function showFailureState(checkoutCard, failureCard) {
  if (checkoutCard) checkoutCard.style.display = "none";
  if (failureCard) failureCard.style.display = "block";
  sessionStorage.setItem("synex_payment_status", "demo_failed");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
