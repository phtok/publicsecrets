const headline = document.getElementById("memberHeadline");
const logoutBtn = document.getElementById("logoutBtn");
const memberModeHint = document.getElementById("memberModeHint");
const memberSwitchLabel = document.getElementById("memberSwitchLabel");
const memberSwitch = document.getElementById("memberSwitch");
const adminViewLink = document.getElementById("adminViewLink");

const roleInput = document.getElementById("role");
const passwordChangeNotice = document.getElementById("passwordChangeNotice");
const portraitUrlInput = document.getElementById("portraitUrl");
const portraitFileInput = document.getElementById("portraitFile");
const uploadPortraitBtn = document.getElementById("uploadPortraitBtn");
const portraitUploadStatus = document.getElementById("portraitUploadStatus");
const portraitFocusXInput = document.getElementById("portraitFocusX");
const portraitFocusYInput = document.getElementById("portraitFocusY");
const portraitFocusPreview = document.getElementById("portraitFocusPreview");
const profilePasswordInput = document.getElementById("profilePassword");
const linksInput = document.getElementById("links");
const bioInput = document.getElementById("bio");
const saveProfileBtn = document.getElementById("saveProfileBtn");

const qId = document.getElementById("qId");
const qText = document.getElementById("qText");
const qDate = document.getElementById("qDate");
const qLocation = document.getElementById("qLocation");
const saveQuestionBtn = document.getElementById("saveQuestionBtn");
const resetQuestionBtn = document.getElementById("resetQuestionBtn");
const questionList = document.getElementById("questionList");

const iId = document.getElementById("iId");
const iTitle = document.getElementById("iTitle");
const iStatus = document.getElementById("iStatus");
const iDescription = document.getElementById("iDescription");
const iImageUrl = document.getElementById("iImageUrl");
const iImageFile = document.getElementById("iImageFile");
const uploadInitiativeImageBtn = document.getElementById("uploadInitiativeImageBtn");
const initiativeUploadStatus = document.getElementById("initiativeUploadStatus");
const iSourceUrl = document.getElementById("iSourceUrl");
const saveInitiativeBtn = document.getElementById("saveInitiativeBtn");
const resetInitiativeBtn = document.getElementById("resetInitiativeBtn");
const initiativeList = document.getElementById("initiativeList");

const eId = document.getElementById("eId");
const eTitle = document.getElementById("eTitle");
const eDate = document.getElementById("eDate");
const eLocation = document.getElementById("eLocation");
const eDescription = document.getElementById("eDescription");
const eImageUrl = document.getElementById("eImageUrl");
const eImageFile = document.getElementById("eImageFile");
const uploadEventImageBtn = document.getElementById("uploadEventImageBtn");
const eventUploadStatus = document.getElementById("eventUploadStatus");
const eSourceUrl = document.getElementById("eSourceUrl");
const eArchived = document.getElementById("eArchived");
const saveEventBtn = document.getElementById("saveEventBtn");
const resetEventBtn = document.getElementById("resetEventBtn");
const eventList = document.getElementById("eventList");

let me = null;
let cache = { questions: [], initiatives: [], events: [] };
let isEditorMode = false;
let activeMemberSlug = String(new URLSearchParams(window.location.search).get("asMember") || "").trim();
let memberOptions = [];

init();

async function init() {
  const memberAuth = await fetch(memberApiPath("/api/member/auth/me"));
  if (memberAuth.ok) {
    me = await memberAuth.json();
    isEditorMode = String(me.actorRole || "") === "editor";
    if (isEditorMode) {
      await setupEditorMode();
    } else {
      setMemberUiMode();
      updateHeadline();
      updatePasswordChangeNotice();
    }
    await Promise.all([loadProfile(), refreshQuestions(), refreshInitiatives(), refreshEvents()]);
    return;
  }

  const editorAuth = await fetch("/api/auth/me");
  if (!editorAuth.ok) {
    window.location.href = "/login.html";
    return;
  }

  isEditorMode = true;
  await setupEditorMode();
  await Promise.all([loadProfile(), refreshQuestions(), refreshInitiatives(), refreshEvents()]);
}

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/member/auth/logout", { method: "POST" });
  window.location.href = "/login.html";
});

if (memberSwitch) {
  memberSwitch.addEventListener("change", async () => {
    if (!isEditorMode) return;
    const nextSlug = String(memberSwitch.value || "").trim();
    if (!nextSlug || nextSlug === activeMemberSlug) return;
    await switchMemberContext(nextSlug);
  });
}

async function setupEditorMode() {
  setMemberUiMode();
  const peopleRes = await fetch("/api/people");
  if (!peopleRes.ok) {
    alert("Mitgliederliste konnte nicht geladen werden.");
    window.location.href = "/admin.html";
    return;
  }

  const people = await peopleRes.json();
  memberOptions = Array.isArray(people)
    ? people
        .filter((person) => String(person.slug || "").trim() && String(person.name || "").trim())
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"))
    : [];
  if (!memberOptions.length) {
    alert("Keine Mitglieder gefunden.");
    window.location.href = "/admin.html";
    return;
  }

  if (!activeMemberSlug || !memberOptions.some((person) => String(person.slug || "") === activeMemberSlug)) {
    activeMemberSlug = String(memberOptions[0].slug || "");
  }
  renderMemberSwitch();
  await switchMemberContext(activeMemberSlug, { skipRender: true });
}

function setMemberUiMode() {
  if (!isEditorMode) {
    if (memberModeHint) memberModeHint.classList.add("hidden");
    if (memberSwitchLabel) memberSwitchLabel.classList.add("hidden");
    if (memberSwitch) memberSwitch.classList.add("hidden");
    if (adminViewLink) adminViewLink.classList.add("hidden");
    return;
  }
  if (memberModeHint) {
    memberModeHint.textContent = "Redaktion · Mitgliedsansicht";
    memberModeHint.classList.remove("hidden");
  }
  if (memberSwitchLabel) memberSwitchLabel.classList.remove("hidden");
  if (memberSwitch) memberSwitch.classList.remove("hidden");
  if (adminViewLink) adminViewLink.classList.remove("hidden");
}

function renderMemberSwitch() {
  if (!memberSwitch) return;
  memberSwitch.innerHTML = memberOptions
    .map((person) => {
      const slug = String(person.slug || "");
      const name = escapeHtml(String(person.name || ""));
      const selected = slug === activeMemberSlug ? " selected" : "";
      return `<option value="${escapeHtml(slug)}"${selected}>${name}</option>`;
    })
    .join("");
}

async function switchMemberContext(slug, options = {}) {
  activeMemberSlug = String(slug || "").trim();
  if (!activeMemberSlug) return;

  const auth = await fetch(memberApiPath("/api/member/auth/me"));
  if (!auth.ok) {
    alert("Mitgliedskontext konnte nicht geladen werden.");
    return;
  }
  me = await auth.json();
  updateHeadline();
  updatePasswordChangeNotice();
  syncMemberQueryParam();
  if (memberSwitch) memberSwitch.value = activeMemberSlug;
  if (options.skipRender) return;
  resetAllForms();
  await Promise.all([loadProfile(), refreshQuestions(), refreshInitiatives(), refreshEvents()]);
}

function updateHeadline() {
  const name = String((me && me.memberName) || "").trim();
  headline.textContent = name ? `Public Secrets - ${name}` : "Public Secrets - Mein Bereich";
}

function updatePasswordChangeNotice() {
  if (!passwordChangeNotice) return;
  if (isEditorMode) {
    passwordChangeNotice.classList.add("hidden");
    return;
  }
  if (me && me.mustChangePassword) {
    passwordChangeNotice.classList.remove("hidden");
    return;
  }
  passwordChangeNotice.classList.add("hidden");
}

function ensureMemberPasswordUpdated() {
  if (isEditorMode) return true;
  if (!me || !me.mustChangePassword) return true;
  alert("Bitte zuerst im Profil ein eigenes Passwort setzen.");
  if (profilePasswordInput) profilePasswordInput.focus();
  return false;
}

function resetAllForms() {
  resetQuestionForm();
  resetInitiativeForm();
  resetEventForm();
  if (profilePasswordInput) profilePasswordInput.value = "";
}

function memberApiPath(pathname) {
  if (!isEditorMode) return pathname;
  const slug = String(activeMemberSlug || "").trim();
  if (!slug) return pathname;
  const sep = pathname.includes("?") ? "&" : "?";
  return `${pathname}${sep}asMember=${encodeURIComponent(slug)}`;
}

function syncMemberQueryParam() {
  if (!isEditorMode) return;
  const url = new URL(window.location.href);
  url.searchParams.set("asMember", String(activeMemberSlug || ""));
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

saveProfileBtn.addEventListener("click", async () => {
  await saveProfile();
});

async function saveProfile() {
  if (!isEditorMode && me && me.mustChangePassword && !(profilePasswordInput && profilePasswordInput.value.trim())) {
    alert("Bitte zuerst ein eigenes Passwort setzen und Profil speichern.");
    if (profilePasswordInput) profilePasswordInput.focus();
    return false;
  }

  const body = {
    role: roleInput.value.trim(),
    portraitUrl: portraitUrlInput.value.trim(),
    portraitFocusX: normalizeFocus(portraitFocusXInput ? portraitFocusXInput.value : 50),
    portraitFocusY: normalizeFocus(portraitFocusYInput ? portraitFocusYInput.value : 50),
    links: parseLines(linksInput.value),
    bio: bioInput.value.trim()
  };
  if (profilePasswordInput && profilePasswordInput.value.trim()) {
    body.password = profilePasswordInput.value;
  }
  const res = await fetch(memberApiPath("/api/member/profile"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    alert("Profil konnte nicht gespeichert werden");
    return false;
  }
  if (!isEditorMode && body.password) {
    me.mustChangePassword = false;
    updatePasswordChangeNotice();
  }
  if (profilePasswordInput) profilePasswordInput.value = "";
  await loadProfile();
  return true;
}

uploadPortraitBtn.addEventListener("click", async () => {
  const ok = await handleImageUpload({
    fileInput: portraitFileInput,
    targetInput: portraitUrlInput,
    statusEl: portraitUploadStatus,
    target: "profile"
  });
  if (ok) await saveProfile();
});

if (portraitFocusXInput) portraitFocusXInput.addEventListener("input", updatePortraitFocusPreview);
if (portraitFocusYInput) portraitFocusYInput.addEventListener("input", updatePortraitFocusPreview);

saveQuestionBtn.addEventListener("click", async () => {
  if (!ensureMemberPasswordUpdated()) return;
  const body = {
    text: qText.value.trim(),
    createdAt: qDate.value ? `${qDate.value}T12:00:00.000Z` : "",
    location: qLocation.value.trim()
  };
  const id = qId.value.trim();
  const url = id ? `/api/member/questions/${id}` : "/api/member/questions";
  const method = id ? "PUT" : "POST";
  const res = await fetch(memberApiPath(url), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) return alert("Frage konnte nicht gespeichert werden");
  resetQuestionForm();
  await refreshQuestions();
});

resetQuestionBtn.addEventListener("click", resetQuestionForm);

saveInitiativeBtn.addEventListener("click", async () => {
  if (!ensureMemberPasswordUpdated()) return;
  const body = {
    title: iTitle.value.trim(),
    status: iStatus.value.trim() || "aktiv",
    description: iDescription.value.trim(),
    imageUrl: iImageUrl.value.trim(),
    sourceUrl: iSourceUrl.value.trim()
  };
  const id = iId.value.trim();
  const url = id ? `/api/member/initiatives/${id}` : "/api/member/initiatives";
  const method = id ? "PUT" : "POST";
  const res = await fetch(memberApiPath(url), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) return alert("Initiative konnte nicht gespeichert werden");
  resetInitiativeForm();
  await refreshInitiatives();
});

resetInitiativeBtn.addEventListener("click", resetInitiativeForm);

uploadInitiativeImageBtn.addEventListener("click", () =>
  handleImageUpload({
    fileInput: iImageFile,
    targetInput: iImageUrl,
    statusEl: initiativeUploadStatus,
    target: "initiative"
  })
);

saveEventBtn.addEventListener("click", async () => {
  if (!ensureMemberPasswordUpdated()) return;
  const body = {
    title: eTitle.value.trim(),
    date: eDate.value,
    location: eLocation.value.trim(),
    description: eDescription.value.trim(),
    imageUrl: eImageUrl.value.trim(),
    sourceUrl: eSourceUrl.value.trim(),
    archived: eArchived.checked
  };
  const id = eId.value.trim();
  const url = id ? `/api/member/events/${id}` : "/api/member/events";
  const method = id ? "PUT" : "POST";
  const res = await fetch(memberApiPath(url), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) return alert("Termin konnte nicht gespeichert werden");
  resetEventForm();
  await refreshEvents();
});

resetEventBtn.addEventListener("click", resetEventForm);

uploadEventImageBtn.addEventListener("click", () =>
  handleImageUpload({
    fileInput: eImageFile,
    targetInput: eImageUrl,
    statusEl: eventUploadStatus,
    target: "event"
  })
);

questionList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "edit-q") {
    const row = cache.questions.find((q) => q.id === id);
    if (!row) return;
    qId.value = row.id;
    qText.value = row.text || "";
    qDate.value = row.createdAt ? String(row.createdAt).slice(0, 10) : "";
    qLocation.value = row.location || "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (btn.dataset.action === "del-q") {
    if (!confirm("Frage löschen?")) return;
    await fetch(memberApiPath(`/api/member/questions/${id}`), { method: "DELETE" });
    await refreshQuestions();
  }
});

initiativeList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "edit-i") {
    const row = cache.initiatives.find((i) => i.id === id);
    if (!row) return;
    iId.value = row.id;
    iTitle.value = row.title || "";
    iStatus.value = row.status || "";
    iDescription.value = row.description || "";
    iImageUrl.value = row.imageUrl || "";
    iSourceUrl.value = row.sourceUrl || "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (btn.dataset.action === "del-i") {
    if (!confirm("Initiative löschen?")) return;
    await fetch(memberApiPath(`/api/member/initiatives/${id}`), { method: "DELETE" });
    await refreshInitiatives();
  }
});

eventList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === "edit-e") {
    const row = cache.events.find((e) => e.id === id);
    if (!row) return;
    eId.value = row.id;
    eTitle.value = row.title || "";
    eDate.value = row.date || "";
    eLocation.value = row.location || "";
    eDescription.value = row.description || "";
    eImageUrl.value = row.imageUrl || "";
    eSourceUrl.value = row.sourceUrl || "";
    eArchived.checked = Boolean(row.archived);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (btn.dataset.action === "del-e") {
    if (!confirm("Termin löschen?")) return;
    await fetch(memberApiPath(`/api/member/events/${id}`), { method: "DELETE" });
    await refreshEvents();
  }
});

async function loadProfile() {
  const res = await fetch(memberApiPath("/api/member/profile"));
  if (!res.ok) return;
  const profile = await res.json();
  roleInput.value = profile.role || "";
  portraitUrlInput.value = profile.portraitUrl || "";
  if (portraitFocusXInput) portraitFocusXInput.value = String(normalizeFocus(profile.portraitFocusX));
  if (portraitFocusYInput) portraitFocusYInput.value = String(normalizeFocus(profile.portraitFocusY));
  updatePortraitFocusPreview();
  linksInput.value = Array.isArray(profile.links) ? profile.links.join("\n") : "";
  bioInput.value = profile.bio || "";
}

async function refreshQuestions() {
  const res = await fetch(memberApiPath("/api/member/questions"));
  if (!res.ok) return;
  cache.questions = await res.json();
  questionList.innerHTML = cache.questions
    .map((q) => {
      const d = q.createdAt ? String(q.createdAt).slice(0, 10) : "";
      const where = q.location ? ` · ${escapeHtml(q.location)}` : "";
      return `<article class="card"><h3>${escapeHtml(q.text || "")}</h3><p class="muted">${escapeHtml(d)}${where}</p><div class="actions"><button class="secondary" data-action="edit-q" data-id="${q.id}">Bearbeiten</button><button class="secondary" data-action="del-q" data-id="${q.id}">Löschen</button></div></article>`;
    })
    .join("");
}

async function refreshInitiatives() {
  const res = await fetch(memberApiPath("/api/member/initiatives"));
  if (!res.ok) return;
  cache.initiatives = await res.json();
  initiativeList.innerHTML = cache.initiatives
    .map((i) => {
      const image = i.imageUrl
        ? `<p><a class="member-link" target="_blank" rel="noopener noreferrer" href="${escapeHtml(i.imageUrl)}">Bild</a></p>`
        : "";
      return `<article class="card"><h3>${escapeHtml(i.title || "")}</h3><p class="muted">${escapeHtml(i.status || "")}</p><p>${escapeHtml(i.description || "")}</p>${image}<div class="actions"><button class="secondary" data-action="edit-i" data-id="${i.id}">Bearbeiten</button><button class="secondary" data-action="del-i" data-id="${i.id}">Löschen</button></div></article>`;
    })
    .join("");
}

async function refreshEvents() {
  const res = await fetch(memberApiPath("/api/member/events"));
  if (!res.ok) return;
  cache.events = await res.json();
  eventList.innerHTML = cache.events
    .map((e) => {
      const image = e.imageUrl
        ? `<p><a class="member-link" target="_blank" rel="noopener noreferrer" href="${escapeHtml(e.imageUrl)}">Bild</a></p>`
        : "";
      return `<article class="card"><h3>${escapeHtml(e.title || "")}</h3><p class="muted">${escapeHtml(e.date || "")} - ${escapeHtml(e.location || "")}</p><p>${escapeHtml(e.description || "")}</p>${image}<div class="actions"><button class="secondary" data-action="edit-e" data-id="${e.id}">Bearbeiten</button><button class="secondary" data-action="del-e" data-id="${e.id}">Löschen</button></div></article>`;
    })
    .join("");
}

function resetQuestionForm() {
  qId.value = "";
  qText.value = "";
  qDate.value = "";
  qLocation.value = "";
}

function resetInitiativeForm() {
  iId.value = "";
  iTitle.value = "";
  iStatus.value = "aktiv";
  iDescription.value = "";
  iImageUrl.value = "";
  iSourceUrl.value = "";
  if (iImageFile) iImageFile.value = "";
  setUploadStatus(initiativeUploadStatus, "");
}

function resetEventForm() {
  eId.value = "";
  eTitle.value = "";
  eDate.value = "";
  eLocation.value = "";
  eDescription.value = "";
  eImageUrl.value = "";
  eSourceUrl.value = "";
  eArchived.checked = false;
  if (eImageFile) eImageFile.value = "";
  setUploadStatus(eventUploadStatus, "");
}

async function handleImageUpload({ fileInput, targetInput, statusEl, target }) {
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  if (!file) {
    setUploadStatus(statusEl, "Bitte zuerst eine Bilddatei wählen.", true);
    return false;
  }
  if (!file.type || !file.type.startsWith("image/")) {
    setUploadStatus(statusEl, "Nur Bilddateien sind erlaubt.", true);
    return false;
  }

  try {
    setUploadStatus(statusEl, "Upload läuft …");
    const dataBase64 = await fileToBase64(file);
    const res = await fetch(memberApiPath("/api/member/uploads"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        dataBase64,
        target
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(String(err.error || "Upload fehlgeschlagen"));
    }
    const payload = await res.json();
    targetInput.value = String(payload.url || "").trim();
    setUploadStatus(statusEl, "Bild hochgeladen.");
    fileInput.value = "";
    return true;
  } catch (error) {
    setUploadStatus(statusEl, String(error.message || "Upload fehlgeschlagen"), true);
    return false;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const encoded = result.includes(",") ? result.split(",").pop() : result;
      resolve(encoded || "");
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsDataURL(file);
  });
}

function setUploadStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = String(message || "");
  el.style.color = isError ? "#b42318" : "";
}

function updatePortraitFocusPreview() {
  if (!portraitFocusPreview) return;
  const x = normalizeFocus(portraitFocusXInput ? portraitFocusXInput.value : 50);
  const y = normalizeFocus(portraitFocusYInput ? portraitFocusYInput.value : 50);
  portraitFocusPreview.textContent = `Ausrichtung: ${x}% · ${y}%`;
}

function normalizeFocus(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function escapeHtml(str) {
  return toGuillemets(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toGuillemets(value) {
  let text = String(value || "");
  text = text.replace(/[„“«]/g, "‹").replace(/[”»]/g, "›");
  text = text.replace(/"([^"\n]+)"/g, "‹$1›");
  text = text.replace(/‚/g, "‹").replace(/[‘’]/g, "›");
  return text;
}

function parseLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
