/**
 * SYNEX HACKATHON — PAYMENT CHECKOUT LOGIC (payment.js)
 * Manages order creation, Razorpay checkout integration,
 * HMAC signature verification, and instant test simulation.
 */

document.addEventListener("DOMContentLoaded", () => {
  initPaymentCheckout();
});

async function initPaymentCheckout() {
  const missingStateCard = document.getElementById("missingStateCard");
  const checkoutCard = document.getElementById("checkoutCard");
  const failureCard = document.getElementById("failureStateCard");
  const modalBackdrop = document.getElementById("demoPaymentModal");

  // Determine registration reference
  const urlParams = new URLSearchParams(window.location.search);
  let refId = urlParams.get("ref");
  
  if (!refId) {
    try {
      refId = sessionStorage.getItem("synex_registration_ref");
      if (!refId) {
        const rawDraft = sessionStorage.getItem("synex_registration_draft");
        if (rawDraft) {
          const draft = JSON.parse(rawDraft);
          refId = draft.referenceId;
        }
      }
    } catch (e) {
      console.warn("Storage check failed:", e);
    }
  }

  if (!refId) {
    if (missingStateCard) missingStateCard.style.display = "block";
    if (checkoutCard) checkoutCard.style.display = "none";
    return;
  }

  // Fetch live registration details from backend
  let regData = null;
  try {
    const res = await fetch(`/api/registrations/${refId}`);
    if (res.ok) {
      const json = await res.json();
      regData = json.registration;
    }
  } catch (err) {
    console.warn("Could not fetch registration from API, checking local session:", err);
  }

  // Fallback to local draft if API returned 404
  if (!regData) {
    try {
      const raw = sessionStorage.getItem("synex_registration_draft");
      if (raw) regData = JSON.parse(raw);
    } catch (e) {}
  }

  if (!regData) {
    if (missingStateCard) missingStateCard.style.display = "block";
    if (checkoutCard) checkoutCard.style.display = "none";
    return;
  }

  // Check if registration is already paid
  if (regData.payment_status === "paid") {
    window.location.href = `/confirmation?ref=${regData.public_id || refId}`;
    return;
  }

  // Populate UI
  populateOrderDetails(regData);

  // Setup Payment Method Selection
  const methodBoxes = document.querySelectorAll(".method-box");
  let selectedMethod = "UPI";
  methodBoxes.forEach((box) => {
    box.addEventListener("click", () => {
      methodBoxes.forEach((b) => b.classList.remove("selected"));
      box.classList.add("selected");
      const methodName = box.querySelector(".method-name")?.textContent || "UPI";
      selectedMethod = methodName.includes("Card") ? "Card" : methodName.includes("Net") ? "NetBanking" : "UPI";
    });
  });

  // Proceed to Payment Button
  const btnProceed = document.getElementById("btnProceedPayment");
  if (btnProceed) {
    btnProceed.addEventListener("click", async () => {
      await launchPaymentFlow(refId, regData, selectedMethod, modalBackdrop, checkoutCard, failureCard);
    });
  }

  // Preview Payment Failure Button
  const btnFail = document.getElementById("btnSimulateFailure");
  if (btnFail) {
    btnFail.addEventListener("click", () => {
      showFailureState(checkoutCard, failureCard, "Simulated card authorization decline / network timeout.");
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
function populateOrderDetails(data) {
  const refBadge = document.getElementById("checkoutRefId");
  const nameEl = document.getElementById("orderName");
  const typeEl = document.getElementById("orderType");
  const collegeEl = document.getElementById("orderCollege");
  const domainEl = document.getElementById("orderDomain");
  const baseFeeEl = document.getElementById("orderBaseFee");
  const totalAmountEl = document.getElementById("orderTotalAmount");

  const publicId = data.public_id || data.referenceId || "SYNEX-000000";
  if (refBadge) refBadge.textContent = publicId;

  const isTeam = (data.registration_type || data.type || "").toLowerCase() === "team";
  const pName = data.participant ? data.participant.full_name : (data.participantName || "Participant");
  const college = data.participant ? data.participant.college : (data.college || "N/A");
  const teamName = data.team ? data.team.team_name : data.teamName;
  const membersCount = data.team && data.team.members ? data.team.members.length : (data.teamSize || 3);
  const indivFallback = window.SYNEX_CONFIG?.fees?.individual ?? 299;
  const teamFallback = window.SYNEX_CONFIG?.fees?.team ?? 999;
  const fee = data.entry_fee || data.baseFee || (isTeam ? teamFallback : indivFallback);

  if (nameEl) {
    if (isTeam && teamName) {
      nameEl.textContent = `${teamName} (Lead: ${pName})`;
    } else {
      nameEl.textContent = pName;
    }
  }

  if (typeEl) {
    typeEl.textContent = isTeam ? `Team Registration (${membersCount} Members)` : "Individual Registration";
  }

  if (collegeEl) collegeEl.textContent = college;
  if (domainEl) domainEl.textContent = data.domain || "AI & Machine Learning";
  if (baseFeeEl) baseFeeEl.textContent = `₹${fee}`;
  if (totalAmountEl) totalAmountEl.textContent = `₹${fee}`;
}

/**
 * Initiates Razorpay Order Creation & Checkout Flow
 */
async function launchPaymentFlow(publicId, regData, paymentMethod, modalBackdrop, checkoutCard, failureCard) {
  const btnProceed = document.getElementById("btnProceedPayment");
  const originalBtnHtml = btnProceed ? btnProceed.innerHTML : "";

  if (btnProceed) {
    btnProceed.disabled = true;
    btnProceed.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Initializing Gateway...</span>`;
  }

  try {
    // 1. Create order on backend
    const orderRes = await fetch("/api/payments/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ registration_id: publicId }),
    });

    const orderData = await orderRes.json();

    if (!orderRes.ok || !orderData.success) {
      if (btnProceed) {
        btnProceed.disabled = false;
        btnProceed.innerHTML = originalBtnHtml;
      }
      alert(orderData.error || "Failed to initialize payment order.");
      return;
    }

    const orderId = orderData.order_id;
    const keyId = orderData.key_id;
    const amountPaise = orderData.amount_paise;

    // Check if Razorpay SDK is loaded and we have valid key
    const hasLiveRazorpay = typeof window.Razorpay === "function" && keyId && !keyId.includes("DEMO");

    if (hasLiveRazorpay) {
      // Launch Official Razorpay Modal
      const options = {
        key: keyId,
        amount: amountPaise,
        currency: orderData.currency || "INR",
        name: "SYNEX Hackathon 2026",
        description: `${orderData.registration_type} Registration - ${orderData.domain}`,
        order_id: orderId,
        prefill: {
          name: orderData.participant_name,
          email: orderData.participant_email,
          contact: orderData.participant_phone,
        },
        theme: {
          color: "#2563EB",
        },
        handler: async function (response) {
          // Verification
          await verifyPaymentOnServer({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            registration_id: publicId,
            payment_method: paymentMethod,
          }, checkoutCard, failureCard);
        },
        modal: {
          ondismiss: function () {
            if (btnProceed) {
              btnProceed.disabled = false;
              btnProceed.innerHTML = originalBtnHtml;
            }
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (resp) {
        showFailureState(checkoutCard, failureCard, resp.error?.description || "Payment was declined by bank.");
      });
      rzp.open();
    } else {
      // Development / Test Simulation Modal
      openTestGatewayModal(modalBackdrop, orderData, publicId, paymentMethod, checkoutCard, failureCard);
    }
  } catch (err) {
    console.error("Order creation error:", err);
    if (btnProceed) {
      btnProceed.disabled = false;
      btnProceed.innerHTML = originalBtnHtml;
    }
    alert("Connection error while connecting to payment service. Please try again.");
  }
}

/**
 * Open Test / Mock Simulation Gateway Modal
 */
function openTestGatewayModal(modal, orderData, publicId, paymentMethod, checkoutCard, failureCard) {
  if (!modal) return;
  modal.classList.add("active");

  const modalTitle = document.getElementById("modalTitle");
  const modalDesc = document.getElementById("modalDesc");
  const modalSpinner = document.getElementById("modalSpinner");
  const modalActions = document.getElementById("modalActions");
  const btnSuccess = document.getElementById("btnCompleteDemoSuccess");
  const btnCancel = document.getElementById("btnCancelDemoModal");

  if (modalTitle) modalTitle.textContent = "Test Payment Gateway";
  if (modalDesc) modalDesc.textContent = `Pay ₹${orderData.amount} for ${orderData.registration_type} Registration (${orderData.registration_id})`;

  if (modalSpinner) modalSpinner.style.display = "none";
  if (modalActions) modalActions.style.display = "flex";

  // Re-bind success button
  const newSuccessBtn = btnSuccess.cloneNode(true);
  btnSuccess.parentNode.replaceChild(newSuccessBtn, btnSuccess);

  newSuccessBtn.addEventListener("click", async () => {
    newSuccessBtn.disabled = true;
    newSuccessBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Verifying Payment...</span>`;

    const randomPayId = `pay_test_${Math.random().toString(36).substring(2, 12)}`;
    await verifyPaymentOnServer({
      razorpay_order_id: orderData.order_id,
      razorpay_payment_id: randomPayId,
      razorpay_signature: "test_signature",
      registration_id: publicId,
      payment_method: paymentMethod,
    }, checkoutCard, failureCard);

    modal.classList.remove("active");
  });

  // Re-bind cancel button
  const newCancelBtn = btnCancel.cloneNode(true);
  btnCancel.parentNode.replaceChild(newCancelBtn, btnCancel);
  newCancelBtn.addEventListener("click", () => {
    modal.classList.remove("active");
    const btnProceed = document.getElementById("btnProceedPayment");
    if (btnProceed) {
      btnProceed.disabled = false;
      btnProceed.innerHTML = `<i class="fa-solid fa-shield"></i> <span>Proceed to Secure Payment</span>`;
    }
  });
}

/**
 * Verifies transaction signature on Flask Backend
 */
async function verifyPaymentOnServer(payload, checkoutCard, failureCard) {
  try {
    const res = await fetch("/api/payments/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      // Clear draft session
      try {
        sessionStorage.removeItem("synex_registration_draft");
      } catch (e) {}
      // Redirect to confirmation
      window.location.href = data.redirect_url || `/confirmation?ref=${payload.registration_id}`;
    } else {
      showFailureState(checkoutCard, failureCard, data.error || "Payment signature verification failed.");
    }
  } catch (err) {
    console.error("Verification error:", err);
    showFailureState(checkoutCard, failureCard, "Network error during payment verification.");
  }
}

/**
 * Displays Failure State Card
 */
function showFailureState(checkoutCard, failureCard, reason) {
  if (checkoutCard) checkoutCard.style.display = "none";
  if (failureCard) {
    failureCard.style.display = "block";
    const desc = failureCard.querySelector(".failure-desc");
    if (desc && reason) {
      desc.innerHTML = `Transaction could not be completed: <strong>${reason}</strong>.<br>No money was deducted. You can retry safely.`;
    }
    failureCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
