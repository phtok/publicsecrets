const emailForLinkInput = document.getElementById("emailForLink");
const identityInput = document.getElementById("identity");
const passwordInput = document.getElementById("password");
const requestBtn = document.getElementById("requestBtn");
const loginBtn = document.getElementById("loginBtn");
const loginMsg = document.getElementById("loginMsg");

init();

requestBtn.addEventListener("click", async () => {
  loginMsg.textContent = "";
  const email = String(emailForLinkInput.value || "").trim();
  if (!email || !email.includes("@")) {
    loginMsg.textContent = "Bitte E-Mail eingeben.";
    return;
  }

  const res = await fetch("/api/member/auth/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!res.ok) {
    loginMsg.textContent = "Link konnte nicht gesendet werden.";
    return;
  }
  const payload = await res.json().catch(() => ({}));
  if (String(payload.delivery || "") === "email") {
    loginMsg.textContent = "Wenn die Adresse hinterlegt ist, wurde ein Login-Link versendet (bitte auch Spam prüfen).";
    return;
  }
  loginMsg.textContent = "Mailversand derzeit gestört. Die Redaktion kann im Backend einen Fallback-Link bereitstellen.";
});

loginBtn.addEventListener("click", async () => {
  await loginWithPassword();
});

passwordInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await loginWithPassword();
});

async function init() {
  const urlToken = String(new URLSearchParams(window.location.search).get("token") || "").trim();
  const already = await redirectIfAlreadyLoggedIn();
  if (already) return;
  if (!urlToken) return;

  loginMsg.textContent = "Einmal-Link wird geprüft …";
  const memberOk = await tryMemberToken(urlToken);
  if (memberOk) {
    window.location.href = "/member-area.html";
    return;
  }
  loginMsg.textContent = "Der Einmal-Link ist ungültig oder abgelaufen.";
}

async function redirectIfAlreadyLoggedIn() {
  const memberRes = await fetch("/api/member/auth/me");
  if (memberRes.ok) {
    window.location.href = "/member-area.html";
    return true;
  }
  const editorRes = await fetch("/api/auth/me");
  if (editorRes.ok) {
    window.location.href = "/admin.html";
    return true;
  }
  return false;
}

async function loginWithPassword() {
  const identity = String(identityInput.value || "").trim();
  const password = String(passwordInput.value || "").trim();
  if (!identity || !password) {
    loginMsg.textContent = "Bitte E-Mail/Benutzername und Passwort eingeben.";
    return;
  }

  loginMsg.textContent = "";
  const memberOk = await tryMemberPassword(identity, password);
  if (memberOk) {
    window.location.href = "/member-area.html";
    return;
  }

  const editorOk = await tryEditorLogin(identity, password);
  if (editorOk) {
    window.location.href = "/admin.html";
    return;
  }

  loginMsg.textContent = "Anmeldung fehlgeschlagen. Bitte Daten prüfen.";
}

async function tryMemberToken(token) {
  const res = await fetch("/api/member/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  return res.ok;
}

async function tryMemberPassword(identity, password) {
  const res = await fetch("/api/member/auth/password-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity, password })
  });
  return res.ok;
}

async function tryEditorLogin(username, password) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return res.ok;
}
