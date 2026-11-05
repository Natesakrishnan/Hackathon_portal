/**
 * SYNEX 2026 — PWA & Standalone App Manager
 * Enables one-click installation on Desktop (Windows/Mac/Linux) and Mobile (Android/iOS),
 * manages offline connectivity banners, and registers the root Service Worker.
 */

(function () {
  'use strict';

  let deferredPrompt = null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://') ||
    new URLSearchParams(window.location.search).get('source') === 'pwa';

  // Mark DOM if running inside standalone installed window
  if (isStandalone) {
    document.documentElement.classList.add('is-pwa-standalone');
    console.log('[PWA] Running in Standalone Application mode');
  }

  // 1. Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered successfully with scope:', reg.scope);

          // Handle update discovery
          reg.addEventListener('updatefound', () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  showToast('App update available. Reloading for latest features...', 'info');
                  setTimeout(() => window.location.reload(), 2000);
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // 2. Listen for BeforeInstallPrompt (Desktop & Android)
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default browser prompt from interrupting users
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] App is installable in standalone mode');
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Application was successfully installed!');
    deferredPrompt = null;
  });

  // 3. UI Update Helpers (Keeps public portal clean without automatic install prompts)
  function updateInstallUi(show = false) {
    const installBtns = document.querySelectorAll('.pwa-install-btn, #btnPwaInstall, #btnPwaInstallMobile');
    installBtns.forEach((btn) => {
      if (show) {
        btn.classList.remove('pwa-hidden');
        btn.style.display = 'inline-flex';
      } else {
        btn.classList.add('pwa-hidden');
        btn.style.display = 'none';
      }
    });
  }

  // 4. Handle Install Click Trigger
  async function triggerInstallFlow() {
    if (isStandalone) {
      showToast('SYNEX is already running as an installed standalone app.', 'info');
      return;
    }

    if (deferredPrompt) {
      // Desktop / Android native prompt
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      console.log('[PWA] User response to install prompt:', choiceResult.outcome);
      if (choiceResult.outcome === 'accepted') {
        updateInstallUi(false);
        const banner = document.getElementById('pwaFloatingBanner');
        if (banner) banner.remove();
      }
      deferredPrompt = null;
    } else if (isIOS) {
      // iOS Safari Add to Home Screen Instructions Modal
      showIosInstallModal();
    } else {
      // Generic desktop fallback instructions
      showDesktopInstructionsModal();
    }
  }

  // 5. Floating Install Banner
  function createFloatingPrompt() {
    if (isStandalone || document.getElementById('pwaFloatingBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwaFloatingBanner';
    banner.className = 'pwa-floating-banner';
    banner.innerHTML = `
      <div class="pwa-banner-content">
        <div class="pwa-banner-icon">
          <img src="/icons/icon-192.png" alt="App Icon" width="40" height="40">
        </div>
        <div class="pwa-banner-text">
          <strong>Install SYNEX App</strong>
          <span>Access passes, schedule & offline guidelines seamlessly</span>
        </div>
      </div>
      <div class="pwa-banner-actions">
        <button id="pwaBannerInstallBtn" class="pwa-banner-btn-install">
          <i class="fa-solid fa-download"></i> Install
        </button>
        <button id="pwaBannerDismissBtn" class="pwa-banner-btn-dismiss" title="Dismiss">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('pwaBannerInstallBtn').addEventListener('click', () => {
      triggerInstallFlow();
    });

    document.getElementById('pwaBannerDismissBtn').addEventListener('click', () => {
      banner.remove();
      sessionStorage.setItem('pwa_prompt_dismissed', 'true');
    });
  }

  // 6. iOS Instructions Modal
  function showIosInstallModal() {
    const existing = document.getElementById('pwaIosModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pwaIosModal';
    modal.className = 'pwa-modal-overlay';
    modal.innerHTML = `
      <div class="pwa-modal-card">
        <div class="pwa-modal-header">
          <div class="pwa-modal-icon"><i class="fa-brands fa-apple"></i></div>
          <h3>Install on iPhone & iPad</h3>
          <button class="pwa-modal-close" onclick="document.getElementById('pwaIosModal').remove()">&times;</button>
        </div>
        <div class="pwa-modal-body">
          <p>Install SYNEX 2026 on your iOS device for instant access to your pass, offline rules, and live alerts:</p>
          <ol class="pwa-steps-list">
            <li>
              <span class="step-num">1</span>
              <span>Tap the <strong>Share</strong> button <i class="fa-solid fa-arrow-up-from-bracket" style="color:#38bdf8"></i> at the bottom of Safari.</span>
            </li>
            <li>
              <span class="step-num">2</span>
              <span>Scroll down and select <strong>Add to Home Screen</strong> <i class="fa-regular fa-square-plus" style="color:#38bdf8"></i>.</span>
            </li>
            <li>
              <span class="step-num">3</span>
              <span>Tap <strong>Add</strong> in the top-right corner.</span>
            </li>
          </ol>
        </div>
        <div class="pwa-modal-footer">
          <button class="btn btn-primary" onclick="document.getElementById('pwaIosModal').remove()">Got it</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // 7. Desktop Manual Instructions Modal
  function showDesktopInstructionsModal() {
    const existing = document.getElementById('pwaDesktopModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pwaDesktopModal';
    modal.className = 'pwa-modal-overlay';
    modal.innerHTML = `
      <div class="pwa-modal-card">
        <div class="pwa-modal-header">
          <div class="pwa-modal-icon"><i class="fa-solid fa-desktop"></i></div>
          <h3>Install Desktop Application</h3>
          <button class="pwa-modal-close" onclick="document.getElementById('pwaDesktopModal').remove()">&times;</button>
        </div>
        <div class="pwa-modal-body">
          <p>You can run SYNEX 2026 as a standalone desktop app on Windows, macOS, or Linux:</p>
          <ol class="pwa-steps-list">
            <li>
              <span class="step-num">1</span>
              <span>Look at your browser's address bar (Chrome, Edge, or Brave).</span>
            </li>
            <li>
              <span class="step-num">2</span>
              <span>Click the <strong>Install App icon</strong> <i class="fa-solid fa-desktop" style="color:#38bdf8"></i> or <strong>Settings (&#8942;) &rarr; Cast, Save, and Share &rarr; Install SYNEX Hackathon</strong>.</span>
            </li>
            <li>
              <span class="step-num">3</span>
              <span>The portal opens in a standalone, borderless desktop window with a desktop shortcut!</span>
            </li>
          </ol>
        </div>
        <div class="pwa-modal-footer">
          <button class="btn btn-primary" onclick="document.getElementById('pwaDesktopModal').remove()">Understood</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  // 8. Offline & Online Toast Notifications
  window.addEventListener('online', () => {
    showToast('Connection restored. You are back online!', 'success');
  });

  window.addEventListener('offline', () => {
    showToast('You are offline. Cached portal pages & saved passes remain accessible.', 'warning');
  });

  function showToast(message, type = 'info') {
    let container = document.getElementById('pwaToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pwaToastContainer';
      container.className = 'pwa-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `pwa-toast pwa-toast-${type}`;
    const iconMap = {
      success: 'fa-circle-check',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };
    toast.innerHTML = `
      <i class="fa-solid ${iconMap[type] || 'fa-circle-info'}"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // 9. Document Ready Setup & Binding
  function initPwaBindings() {
    // Bind all buttons with .pwa-install-btn or #btnPwaInstall
    document.querySelectorAll('.pwa-install-btn, #btnPwaInstall, #btnPwaInstallMobile').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerInstallFlow();
      });
    });

    // Event listeners attached if any install buttons exist
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPwaBindings);
  } else {
    initPwaBindings();
  }

  // Expose global helper
  window.PWA = {
    install: triggerInstallFlow,
    isStandalone: () => isStandalone,
    showIosGuide: showIosInstallModal
  };
})();
