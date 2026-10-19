import "@fontsource-variable/inter";

const parameters = new URLSearchParams(location.search);
const requestedTheme = parameters.get("theme");
document.documentElement.dataset.theme = ["dark", "ultra-dark"].includes(
  requestedTheme,
)
  ? requestedTheme
  : "light";
const title = document.querySelector("#title");
const description = document.querySelector("#description");
const form = document.querySelector("#form");
const credential = document.querySelector("#credential");
const status = document.querySelector("#status");
const submit = document.querySelector("#submit");
const cancel = document.querySelector("#cancel");
const reveal = document.querySelector("#reveal");

title.textContent = parameters.get("title") || "Unlock Aero";
description.textContent =
  parameters.get("description") ||
  "Enter your PIN or a one-time recovery code.";
cancel.hidden = parameters.get("cancel") !== "1";

function formatWait(milliseconds) {
  const seconds = Math.max(1, Math.ceil(Number(milliseconds || 0) / 1000));
  return seconds < 60
    ? `${seconds} seconds`
    : `${Math.ceil(seconds / 60)} minutes`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!credential.value.trim()) return;
  submit.disabled = true;
  status.textContent = "Checking…";
  const result = await window.aeroSecurity.submit(credential.value);
  credential.value = "";
  submit.disabled = false;
  if (result?.ok) return;
  status.textContent = result?.blocked
    ? `Too many attempts. Try again in ${formatWait(result.retryAfterMs)}.`
    : result?.error || "The PIN or recovery code is incorrect.";
  credential.focus();
});

reveal.addEventListener("click", () => {
  const showing = credential.type === "text";
  credential.type = showing ? "password" : "text";
  reveal.textContent = showing ? "Show" : "Hide";
  reveal.setAttribute("aria-label", showing ? "Show entry" : "Hide entry");
  credential.focus();
});

cancel.addEventListener("click", () => window.aeroSecurity.cancel());
document
  .querySelector("#close")
  .addEventListener("click", () => window.aeroSecurity.cancel());
document
  .querySelector("#minimize")
  .addEventListener("click", () =>
    window.aeroSecurity.windowControl("minimize"),
  );
