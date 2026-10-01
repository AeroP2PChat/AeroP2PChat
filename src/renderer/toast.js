import { blobatarUri } from "blobatar/uri";

const container = document.getElementById("toast-container");

function createToastAvatar(label, id) {
  const avatar = document.createElement("div");
  avatar.className = "toast-avatar";
  avatar.setAttribute("role", "img");
  avatar.setAttribute("aria-label", `${label || "Contact"} avatar`);
  avatar.style.backgroundImage = `url("${blobatarUri(String(id || "unknown"))}")`;
  return avatar;
}

// Map of active toasts to their timeout IDs
const activeToasts = new Map();

function getToastTypeIcon(kind, variant) {
  if (kind === "call" || variant === "call") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.64a2 2 0 0 1-.45 2.11L8 9.75a16 16 0 0 0 6 6l1.28-1.28a2 2 0 0 1 2.11-.45c.86.29 1.74.5 2.64.62A2 2 0 0 1 22 16.92Z" /></svg>`;
  }
  if (variant === "voice") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" /></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 9.5 9.5 0 0 1-4.78-1.33L3 20l1.34-4.02A8.5 8.5 0 1 1 21 11.5Z" /></svg>`;
}

window.aeroChatNotification.onShowToast((details) => {
  showToast(details);
});

window.aeroChatNotification.onCloseToast((id) => {
  closeToast(id);
});

function closeToast(id) {
  const toastEl = document.getElementById(`toast-${id}`);
  if (toastEl) {
    toastEl.classList.add("fade-out");
    setTimeout(() => {
      toastEl.remove();
      activeToasts.delete(id);

      // Update height after removal
      setTimeout(() => {
        const remaining = document.querySelectorAll(".toast").length;
        if (remaining === 0) {
          window.aeroChatNotification.updateToastHeight(0);
        } else {
          window.aeroChatNotification.updateToastHeight(
            document.body.scrollHeight + 30,
          );
        }
      }, 50);
    }, 300);
  }
}

function showToast(details) {
  const {
    id,
    title,
    body,
    kind,
    variant,
    peerId,
    callId,
    theme,
    accent,
  } = details;

  // Apply theme
  document.body.className = theme === "light" ? "light-theme" : theme === "ultra-dark" ? "ultra-dark-theme" : "";

  // Enforce max 1 toast at a time: close all currently active toasts instantly without animation
  // This prevents the window from temporarily expanding to fit 2 toasts, which causes a visual jump.
  for (const [activeId, timeoutId] of activeToasts.entries()) {
    clearTimeout(timeoutId);
    const oldToast = document.getElementById(`toast-${activeId}`);
    if (oldToast) oldToast.remove();
    activeToasts.delete(activeId);
  }

  // Clear existing if any (fallback, should be handled by loop above)
  if (activeToasts.has(id)) {
    clearTimeout(activeToasts.get(id));
  } else {
    // Create new toast element
    const toastEl = document.createElement("div");
    toastEl.className = `toast toast-${variant || kind}`;
    toastEl.id = `toast-${id}`;
    if (/^#[0-9a-f]{6}$/i.test(String(accent || ""))) {
      toastEl.style.setProperty("--accent", accent);
    }

    let html = `<div class="toast-header">
      <div class="toast-content">
        <div class="toast-title-row">
          <span class="toast-type-icon" aria-hidden="true">${getToastTypeIcon(kind, variant)}</span>
          <h4 class="toast-title">${escapeHtml(title)}</h4>
        </div>
        <p class="toast-body">${escapeHtml(body)}</p>
      </div>
      <button class="toast-close-btn" id="btn-close-${id}" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>`;

    // Actions for calls
    if (kind === "call") {
      html += `<div class="toast-actions">
        <button class="toast-button primary" id="btn-accept-${id}"><svg class="toast-button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.64a2 2 0 0 1-.45 2.11L8 9.75a16 16 0 0 0 6 6l1.28-1.28a2 2 0 0 1 2.11-.45c.86.29 1.74.5 2.64.62A2 2 0 0 1 22 16.92Z" /></svg>Accept</button>
        <button class="toast-button" id="btn-decline-${id}"><svg class="toast-button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M8.6 3.1A2 2 0 0 1 9.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.64a2 2 0 0 1-.45 2.11l-1.1 1.1M14 15.75l1.28-1.28a2 2 0 0 1 2.11-.45c.86.29 1.74.5 2.64.62A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.7 19.7 0 0 1-2.27-5.95 2 2 0 0 1 .66-1.98l1.15-1.15" /></svg>Decline</button>
      </div>`;
    }

    toastEl.innerHTML = html;
    toastEl.querySelector(".toast-header")?.prepend(createToastAvatar(title, peerId));

    // Close button logic
    const closeBtn = toastEl.querySelector(`#btn-close-${id}`);
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.aeroChatNotification.close(id);
      });
    }

    // Click events
    toastEl.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON" || e.target.closest("button")) return; // Let button handlers fire

      window.aeroChatNotification.action({
        type: "open",
        openWindow: true,
        id,
        kind,
        peerId,
        callId,
      });
      window.aeroChatNotification.close(id);
    });

    container.appendChild(toastEl);

    // Button event listeners
    if (kind === "call") {
      toastEl
        .querySelector(`#btn-accept-${id}`)
        .addEventListener("click", (e) => {
          e.stopPropagation();
          window.aeroChatNotification.action({
            type: "accept-call",
            openWindow: true,
            id,
            kind,
            peerId,
            callId,
          });
          window.aeroChatNotification.close(id);
        });

      toastEl
        .querySelector(`#btn-decline-${id}`)
        .addEventListener("click", (e) => {
          e.stopPropagation();
          window.aeroChatNotification.action({
            type: "decline-call",
            id,
            kind,
            peerId,
            callId,
          });
          window.aeroChatNotification.close(id);
        });
    }
  }

  // Auto-close after 5s (if not a call)
  if (kind !== "call") {
    const timeout = setTimeout(() => {
      window.aeroChatNotification.close(id);
    }, 5000);
    activeToasts.set(id, timeout);
  }

  // Update window height
  setTimeout(() => {
    window.aeroChatNotification.updateToastHeight(
      document.body.scrollHeight + 30,
    );
  }, 50);
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
