const emailInput = document.getElementById("email");
const tokenInput = document.getElementById("token");
const requestBtn = document.getElementById("requestBtn");
const verifyBtn = document.getElementById("verifyBtn");
const requestMsg = document.getElementById("requestMsg");
const verifyMsg = document.getElementById("verifyMsg");

const urlToken = new URLSearchParams(window.location.search).get("token");
if (urlToken) {
  tokenInput.value = urlToken;
  verifyTokenAndLogin(urlToken, true);
}

requestBtn.addEventListener("click", async () => {
  requestMsg.textContent = "";
  const email = emailInput.value.trim();
  const res = await fetch("/api/member/auth/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!res.ok) {
    requestMsg.textContent = "Anfrage fehlgeschlagen.";
    return;
  }
  requestMsg.textContent = "Wenn die E-Mail hinterlegt ist, wurde ein Einmalzugang versendet.";
});

verifyBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  await verifyTokenAndLogin(token, false);
});

async function verifyTokenAndLogin(token, silent) {
  if (!token) return;
  verifyMsg.textContent = silent ? "Anmeldung läuft..." : "";
  const res = await fetch("/api/member/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  if (!res.ok) {
    if (!silent) verifyMsg.textContent = "Token ungültig oder abgelaufen.";
    return;
  }
  window.location.href = "/member-area.html";
}
