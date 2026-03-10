const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const logoutBtn = document.getElementById("logoutBtn");

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");

const qId = document.getElementById("qId");
const qText = document.getElementById("qText");
const qDate = document.getElementById("qDate");
const qLocation = document.getElementById("qLocation");
const qAuthors = document.getElementById("qAuthors");
const saveQuestionBtn = document.getElementById("saveQuestionBtn");
const resetQuestionBtn = document.getElementById("resetQuestionBtn");
const questionList = document.getElementById("questionList");

const eId = document.getElementById("eId");
const eTitle = document.getElementById("eTitle");
const eDate = document.getElementById("eDate");
const eLocation = document.getElementById("eLocation");
const eHosts = document.getElementById("eHosts");
const eDescription = document.getElementById("eDescription");
const eSourceUrl = document.getElementById("eSourceUrl");
const eArchived = document.getElementById("eArchived");
const saveEventBtn = document.getElementById("saveEventBtn");
const resetEventBtn = document.getElementById("resetEventBtn");
const eventList = document.getElementById("eventList");

const iId = document.getElementById("iId");
const iTitle = document.getElementById("iTitle");
const iStatus = document.getElementById("iStatus");
const iDescription = document.getElementById("iDescription");
const iHosts = document.getElementById("iHosts");
const iSourceUrl = document.getElementById("iSourceUrl");
const saveInitiativeBtn = document.getElementById("saveInitiativeBtn");
const resetInitiativeBtn = document.getElementById("resetInitiativeBtn");
const initiativeList = document.getElementById("initiativeList");
const personList = document.getElementById("personList");

const qCount = document.getElementById("qCount");
const eCount = document.getElementById("eCount");
const iCount = document.getElementById("iCount");
const pCount = document.getElementById("pCount");
const cCount = document.getElementById("cCount");
const commentList = document.getElementById("commentList");
const loginOutboxList = document.getElementById("loginOutboxList");
const refreshOutboxBtn = document.getElementById("refreshOutboxBtn");

const pId = document.getElementById("pId");
const pName = document.getElementById("pName");
const pSlug = document.getElementById("pSlug");
const pEmail = document.getElementById("pEmail");
const pRole = document.getElementById("pRole");
const pPortraitUrl = document.getElementById("pPortraitUrl");
const pPortraitFocusX = document.getElementById("pPortraitFocusX");
const pPortraitFocusY = document.getElementById("pPortraitFocusY");
const pPassword = document.getElementById("pPassword");
const pPortraitFile = document.getElementById("pPortraitFile");
const uploadPersonPortraitBtn = document.getElementById("uploadPersonPortraitBtn");
const personPortraitUploadStatus = document.getElementById("personPortraitUploadStatus");
const pLinks = document.getElementById("pLinks");
const pBio = document.getElementById("pBio");
const savePersonBtn = document.getElementById("savePersonBtn");
const resetPersonBtn = document.getElementById("resetPersonBtn");

let cache = {
  questions: [],
  events: [],
  initiatives: [],
  people: [],
  comments: [],
  loginOutbox: []
};

init();

async function init() {
  const ok = await checkSession();
  if (ok) {
    showAdmin();
    await refreshAll();
    return;
  }
  window.location.href = "/login.html";
}

loginBtn.addEventListener("click", async () => {
  const body = {
    username: usernameInput.value.trim(),
    password: passwordInput.value
  };
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) return alert("Login fehlgeschlagen");

  showAdmin();
  await refreshAll();
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login.html";
});

saveQuestionBtn.addEventListener("click", async () => {
  const body = {
    text: qText.value.trim(),
    createdAt: qDate.value ? `${qDate.value}T12:00:00.000Z` : "",
    location: qLocation.value.trim(),
    authors: parseCsv(qAuthors.value)
  };
  const id = qId.value.trim();
  const url = id ? `/api/questions/${id}` : "/api/questions";
  const method = id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) return alert("Frage konnte nicht gespeichert werden");

  resetQuestionForm();
  await refreshQuestions();
});

resetQuestionBtn.addEventListener("click", resetQuestionForm);

saveEventBtn.addEventListener("click", async () => {
  const body = {
    title: eTitle.value.trim(),
    date: eDate.value,
    location: eLocation.value.trim(),
    hosts: parseCsv(eHosts.value),
    description: eDescription.value.trim(),
    sourceUrl: eSourceUrl.value.trim(),
    archived: eArchived.checked
  };
  const id = eId.value.trim();
  const url = id ? `/api/events/${id}` : "/api/events";
  const method = id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) return alert("Termin konnte nicht gespeichert werden");

  resetEventForm();
  await refreshEvents();
});

resetEventBtn.addEventListener("click", resetEventForm);

saveInitiativeBtn.addEventListener("click", async () => {
  const body = {
    title: iTitle.value.trim(),
    status: iStatus.value.trim() || "aktiv",
    description: iDescription.value.trim(),
    hosts: parseCsv(iHosts.value),
    sourceUrl: iSourceUrl.value.trim()
  };
  const id = iId.value.trim();
  const url = id ? `/api/initiatives/${id}` : "/api/initiatives";
  const method = id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) return alert("Initiative konnte nicht gespeichert werden");

  resetInitiativeForm();
  await refreshInitiatives();
});

resetInitiativeBtn.addEventListener("click", resetInitiativeForm);

savePersonBtn.addEventListener("click", async () => {
  const body = {
    name: pName.value.trim(),
    slug: pSlug.value.trim(),
    email: pEmail.value.trim(),
    role: pRole.value.trim(),
    portraitUrl: pPortraitUrl.value.trim(),
    portraitFocusX: normalizeFocus(pPortraitFocusX ? pPortraitFocusX.value : 50),
    portraitFocusY: normalizeFocus(pPortraitFocusY ? pPortraitFocusY.value : 50),
    links: parseLines(pLinks.value),
    bio: pBio.value.trim()
  };
  if (pPassword && pPassword.value.trim()) body.password = pPassword.value;
  const id = pId.value.trim();
  const url = id ? `/api/people/${id}` : "/api/people";
  const method = id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) return alert("Mitglied konnte nicht gespeichert werden");

  resetPersonForm();
  await refreshPeople();
});

resetPersonBtn.addEventListener("click", resetPersonForm);

if (uploadPersonPortraitBtn) {
  uploadPersonPortraitBtn.addEventListener("click", () =>
    handleImageUpload({
      fileInput: pPortraitFile,
      targetInput: pPortraitUrl,
      statusEl: personPortraitUploadStatus,
      target: "profile"
    })
  );
}

questionList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "edit-question") {
    const row = cache.questions.find((q) => q.id === id);
    if (!row) return;
    qId.value = row.id;
    qText.value = row.text || "";
    qDate.value = row.createdAt ? String(row.createdAt).slice(0, 10) : "";
    qLocation.value = row.location || "";
    qAuthors.value = (row.authors || []).join(", ");
    focusWithoutScroll(qText);
    return;
  }

  if (action === "delete-question") {
    if (!confirm("Frage wirklich löschen?")) return;
    const res = await fetch(`/api/questions/${id}`, { method: "DELETE" });
    if (!res.ok) return alert("Löschen fehlgeschlagen");
    await refreshQuestions();
  }
});

eventList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "edit-event") {
    const row = cache.events.find((e) => e.id === id);
    if (!row) return;
    eId.value = row.id;
    eTitle.value = row.title || "";
    eDate.value = row.date || "";
    eLocation.value = row.location || "";
    eHosts.value = (row.hosts || []).join(", ");
    eDescription.value = row.description || "";
    eSourceUrl.value = row.sourceUrl || "";
    eArchived.checked = Boolean(row.archived);
    focusWithoutScroll(eTitle);
    return;
  }

  if (action === "delete-event") {
    if (!confirm("Termin wirklich löschen?")) return;
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (!res.ok) return alert("Löschen fehlgeschlagen");
    await refreshEvents();
  }
});

initiativeList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "edit-initiative") {
    const row = cache.initiatives.find((i) => i.id === id);
    if (!row) return;
    iId.value = row.id;
    iTitle.value = row.title || "";
    iStatus.value = row.status || "";
    iDescription.value = row.description || "";
    iHosts.value = (row.hosts || []).join(", ");
    iSourceUrl.value = row.sourceUrl || "";
    focusWithoutScroll(iTitle);
    return;
  }

  if (action === "delete-initiative") {
    if (!confirm("Initiative wirklich löschen?")) return;
    const res = await fetch(`/api/initiatives/${id}`, { method: "DELETE" });
    if (!res.ok) return alert("Löschen fehlgeschlagen");
    await refreshInitiatives();
  }
});

personList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "edit-person") {
    const row = cache.people.find((p) => String(p.slug || "") === id);
    if (!row) return;
    pId.value = row.slug || "";
    pName.value = row.name || "";
    pSlug.value = row.slug || "";
    pEmail.value = row.email || "";
    pRole.value = row.role || "";
    pPortraitUrl.value = row.portraitUrl || "";
    if (pPortraitFocusX) pPortraitFocusX.value = String(normalizeFocus(row.portraitFocusX));
    if (pPortraitFocusY) pPortraitFocusY.value = String(normalizeFocus(row.portraitFocusY));
    if (pPassword) pPassword.value = "";
    pLinks.value = Array.isArray(row.links) ? row.links.join("\n") : "";
    pBio.value = row.bio || "";
    focusWithoutScroll(pName);
    return;
  }

  if (action === "delete-person") {
    if (!confirm("Mitglied wirklich löschen?")) return;
    const res = await fetch(`/api/people/${id}`, { method: "DELETE" });
    if (!res.ok) return alert("Löschen fehlgeschlagen");
    await refreshPeople();
  }
});

commentList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const action = String(btn.dataset.action || "");
  const commentId = String(btn.dataset.commentId || "");
  const replyId = String(btn.dataset.replyId || "");
  if (!commentId) return;

  if (action === "delete-comment") {
    if (!confirm("Kommentar wirklich löschen?")) return;
    const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
    if (!res.ok) return alert("Löschen fehlgeschlagen");
    await refreshComments();
    return;
  }

  if (action === "toggle-comment-visible") {
    const isVisible = String(btn.dataset.visible || "true") !== "false";
    const body = { visible: !isVisible };
    const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) return alert("Sichtbarkeit konnte nicht geändert werden");
    await refreshComments();
    return;
  }

  if (action === "save-comment") {
    const nameInput = commentList.querySelector(`input[data-comment-name="${escapeAttr(commentId)}"]`);
    const textInput = commentList.querySelector(`textarea[data-comment-text="${escapeAttr(commentId)}"]`);
    const ratingInput = commentList.querySelector(`input[data-comment-rating="${escapeAttr(commentId)}"]`);
    const visibleInput = commentList.querySelector(`input[data-comment-visible="${escapeAttr(commentId)}"]`);
    const body = {
      name: nameInput ? nameInput.value : "",
      comment: textInput ? textInput.value : "",
      rating: ratingInput && ratingInput.checked ? 1 : 0,
      visible: visibleInput ? visibleInput.checked : true
    };
    const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) return alert("Kommentar konnte nicht gespeichert werden");
    await refreshComments();
    return;
  }

  if (!replyId) return;

  if (action === "delete-reply") {
    if (!confirm("Antwort wirklich löschen?")) return;
    const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}/replies/${encodeURIComponent(replyId)}`, {
      method: "DELETE"
    });
    if (!res.ok) return alert("Löschen fehlgeschlagen");
    await refreshComments();
    return;
  }

  if (action === "toggle-reply-visible") {
    const isVisible = String(btn.dataset.visible || "true") !== "false";
    const body = { visible: !isVisible };
    const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}/replies/${encodeURIComponent(replyId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) return alert("Sichtbarkeit konnte nicht geändert werden");
    await refreshComments();
    return;
  }

  if (action === "save-reply") {
    const nameInput = commentList.querySelector(
      `input[data-reply-name="${escapeAttr(replyId)}"][data-reply-comment="${escapeAttr(commentId)}"]`
    );
    const textInput = commentList.querySelector(
      `textarea[data-reply-text="${escapeAttr(replyId)}"][data-reply-comment="${escapeAttr(commentId)}"]`
    );
    const visibleInput = commentList.querySelector(
      `input[data-reply-visible="${escapeAttr(replyId)}"][data-reply-comment="${escapeAttr(commentId)}"]`
    );
    const body = {
      name: nameInput ? nameInput.value : "",
      text: textInput ? textInput.value : "",
      visible: visibleInput ? visibleInput.checked : true
    };
    const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}/replies/${encodeURIComponent(replyId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) return alert("Antwort konnte nicht gespeichert werden");
    await refreshComments();
  }
});

if (refreshOutboxBtn) {
  refreshOutboxBtn.addEventListener("click", async () => {
    await refreshOutbox();
  });
}

if (loginOutboxList) {
  loginOutboxList.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action !== "copy-login-url") return;
    const url = String(btn.dataset.url || "");
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = "Kopiert";
      setTimeout(() => {
        btn.textContent = "Link kopieren";
      }, 1200);
    } catch {
      prompt("Link kopieren:", url);
    }
  });
}

async function refreshAll() {
  await Promise.all([refreshQuestions(), refreshEvents(), refreshInitiatives(), refreshPeople(), refreshComments(), refreshOutbox()]);
  renderComments();
  refreshCounts();
}

async function refreshQuestions() {
  cache.questions = await apiGet("/api/questions");
  questionList.innerHTML = cache.questions
    .map((q) => {
      const d = q.createdAt ? String(q.createdAt).slice(0, 10) : "";
      const where = q.location ? ` · ${escapeHtml(q.location)}` : "";
      return `<article class="card"><h3>${escapeHtml(q.text || "")}</h3><p class="muted">${escapeHtml(d)}${where} - ${escapeHtml((q.authors || []).join(", "))}</p><div class="actions"><button class="secondary" data-action="edit-question" data-id="${q.id}">Bearbeiten</button><button class="secondary" data-action="delete-question" data-id="${q.id}">Löschen</button></div></article>`;
    })
    .join("");
  renderComments();
  refreshCounts();
}

async function refreshEvents() {
  cache.events = await apiGet("/api/events");
  cache.events.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  eventList.innerHTML = cache.events
    .map((e) => {
      const hosts = (e.hosts || []).length ? `<p class="muted">Hosts: ${escapeHtml((e.hosts || []).join(", "))}</p>` : "";
      const source = e.sourceUrl ? `<p><a class="member-link" target="_blank" rel="noopener noreferrer" href="${escapeHtml(e.sourceUrl)}">Quelle</a></p>` : "";
      return `<article class="card"><h3>${escapeHtml(e.title || "")}</h3><p class="muted">${escapeHtml(e.date || "")} - ${escapeHtml(e.location || "")}</p>${hosts}<p>${escapeHtml(e.description || "")}</p>${source}<p class="muted">${e.archived ? "Archiv" : "Aktiv"}</p><div class="actions"><button class="secondary" data-action="edit-event" data-id="${e.id}">Bearbeiten</button><button class="secondary" data-action="delete-event" data-id="${e.id}">Löschen</button></div></article>`;
    })
    .join("");
  refreshCounts();
}

async function refreshInitiatives() {
  cache.initiatives = await apiGet("/api/initiatives");
  initiativeList.innerHTML = cache.initiatives
    .map((item) => {
      const hosts = (item.hosts || []).length ? `<p class="muted">Hosts: ${escapeHtml((item.hosts || []).join(", "))}</p>` : "";
      const source = item.sourceUrl ? `<p><a class="member-link" target="_blank" rel="noopener noreferrer" href="${escapeHtml(item.sourceUrl)}">Quelle</a></p>` : "";
      return `<article class="card"><h3>${escapeHtml(item.title || "")}</h3><p class="muted">Status: ${escapeHtml(item.status || "")}</p>${hosts}<p>${escapeHtml(item.description || "")}</p>${source}<div class="actions"><button class="secondary" data-action="edit-initiative" data-id="${item.id}">Bearbeiten</button><button class="secondary" data-action="delete-initiative" data-id="${item.id}">Löschen</button></div></article>`;
    })
    .join("");
  refreshCounts();
}

async function refreshPeople() {
  cache.people = await apiGet("/api/people");
  cache.people.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"));
  personList.innerHTML = cache.people
    .map((person) => {
      const links = Array.isArray(person.links) && person.links.length
        ? `<p class="muted">${person.links.map((link) => escapeHtml(link)).join(" · ")}</p>`
        : "";
      const portrait = person.portraitUrl
        ? `<p><a class="member-link" target="_blank" rel="noopener noreferrer" href="${escapeHtml(person.portraitUrl)}">Portrait öffnen</a></p>`
        : "";
      return `<article class="card"><h3>${escapeHtml(person.name || "")}</h3><p class="muted">${escapeHtml(person.role || "")}</p><p class="muted">Slug: ${escapeHtml(person.slug || "")}</p><p class="muted">E-Mail: ${escapeHtml(person.email || "")}</p><p class="muted">Passwort: ${person.hasPassword ? "gesetzt" : "nicht gesetzt"}</p>${links}${portrait}<div class="actions"><button class="secondary" data-action="edit-person" data-id="${escapeHtml(person.slug || "")}">Bearbeiten</button><button class="secondary" data-action="delete-person" data-id="${escapeHtml(person.slug || "")}">Löschen</button></div></article>`;
    })
    .join("");
  refreshCounts();
}

async function refreshComments() {
  if (!commentList) return;
  cache.comments = await apiGet("/api/comments?includeHidden=true");
  cache.comments.sort((a, b) => Date.parse(String(b.updatedAt || "")) - Date.parse(String(a.updatedAt || "")));
  renderComments();
  refreshCounts();
}

async function refreshOutbox() {
  if (!loginOutboxList) return;
  cache.loginOutbox = await apiGet("/api/member/auth/outbox");
  const rows = Array.isArray(cache.loginOutbox) ? cache.loginOutbox : [];
  loginOutboxList.innerHTML = rows
    .map((row) => {
      const when = row.createdAt ? new Date(row.createdAt).toLocaleString("de-DE") : "";
      const error = row.deliveryError ? `<p class="muted">Fehler: ${escapeHtml(row.deliveryError)}</p>` : "";
      const slug = row.memberSlug ? `<p class="muted">Slug: ${escapeHtml(row.memberSlug)}</p>` : "";
      const email = row.email ? `<p class="muted">E-Mail: ${escapeHtml(row.email)}</p>` : "";
      const link = row.loginUrl ? escapeAttr(row.loginUrl) : "";
      const actions = row.loginUrl
        ? `<div class="actions"><a class="secondary-link" href="${escapeAttr(row.loginUrl)}" target="_blank" rel="noopener noreferrer">Link öffnen</a><button class="secondary" data-action="copy-login-url" data-url="${link}" type="button">Link kopieren</button></div>`
        : "";
      return `<article class="card"><h3>Login-Link</h3><p class="muted">${escapeHtml(when)}</p>${email}${slug}${error}${actions}</article>`;
    })
    .join("");
  if (!rows.length) loginOutboxList.innerHTML = `<p class="muted">Keine Fallback-Links vorhanden.</p>`;
}

function renderComments() {
  if (!commentList) return;
  const questionById = new Map(cache.questions.map((q) => [String(q.id || ""), q]));
  commentList.innerHTML = cache.comments
    .map((comment) => {
      const by = comment.name ? escapeHtml(comment.name) : "Anonym";
      const when = comment.updatedAt ? new Date(comment.updatedAt).toLocaleString("de-DE") : "";
      const q = questionById.get(String(comment.questionId || ""));
      const qText = q ? q.text || "" : "(Frage nicht gefunden)";
      const visible = comment.visible === false ? false : true;
      const replies = Array.isArray(comment.replies) ? comment.replies : [];
      const repliesBlock = replies.length
        ? `<div class="list">${replies
            .map((reply) => {
              const rb = reply.name ? escapeHtml(reply.name) : "Anonym";
              const rw = reply.createdAt ? new Date(reply.createdAt).toLocaleString("de-DE") : "";
              const rVisible = reply.visible === false ? false : true;
              return `<article class="card">
                <p class="muted">${rb}${rw ? ` · ${escapeHtml(rw)}` : ""}${rVisible ? "" : " · Ausgeblendet"}</p>
                <label>Name</label>
                <input type="text" data-reply-name="${escapeAttr(reply.id || "")}" data-reply-comment="${escapeAttr(comment.id || "")}" value="${escapeAttr(reply.name || "")}" />
                <label>Antwort</label>
                <textarea rows="2" data-reply-text="${escapeAttr(reply.id || "")}" data-reply-comment="${escapeAttr(comment.id || "")}">${escapeHtml(reply.text || "")}</textarea>
                <div class="checkbox-inline"><input type="checkbox" data-reply-visible="${escapeAttr(reply.id || "")}" data-reply-comment="${escapeAttr(comment.id || "")}" ${rVisible ? "checked" : ""} /><label>Sichtbar</label></div>
                <div class="actions">
                  <button class="secondary" data-action="save-reply" data-comment-id="${escapeAttr(comment.id || "")}" data-reply-id="${escapeAttr(reply.id || "")}">Speichern</button>
                  <button class="secondary" data-action="toggle-reply-visible" data-comment-id="${escapeAttr(comment.id || "")}" data-reply-id="${escapeAttr(reply.id || "")}" data-visible="${rVisible ? "true" : "false"}">${rVisible ? "Ausblenden" : "Einblenden"}</button>
                  <button class="secondary" data-action="delete-reply" data-comment-id="${escapeAttr(comment.id || "")}" data-reply-id="${escapeAttr(reply.id || "")}">Löschen</button>
                </div>
              </article>`;
            })
            .join("")}</div>`
        : "";
      return `<article class="card">
        <h3>${escapeHtml(qText)}</h3>
        <p class="muted">${by}${when ? ` · ${escapeHtml(when)}` : ""}${visible ? "" : " · Ausgeblendet"}</p>
        <label>Name</label>
        <input type="text" data-comment-name="${escapeAttr(comment.id || "")}" value="${escapeAttr(comment.name || "")}" />
        <label>Kommentar</label>
        <textarea rows="3" data-comment-text="${escapeAttr(comment.id || "")}">${escapeHtml(comment.comment || "")}</textarea>
        <div class="checkbox-inline"><input type="checkbox" data-comment-rating="${escapeAttr(comment.id || "")}" ${Number(comment.rating) > 0 ? "checked" : ""} /><label>Resonanz</label></div>
        <div class="checkbox-inline"><input type="checkbox" data-comment-visible="${escapeAttr(comment.id || "")}" ${visible ? "checked" : ""} /><label>Sichtbar</label></div>
        <div class="actions">
          <button class="secondary" data-action="save-comment" data-comment-id="${escapeAttr(comment.id || "")}">Speichern</button>
          <button class="secondary" data-action="toggle-comment-visible" data-comment-id="${escapeAttr(comment.id || "")}" data-visible="${visible ? "true" : "false"}">${visible ? "Ausblenden" : "Einblenden"}</button>
          <button class="secondary" data-action="delete-comment" data-comment-id="${escapeAttr(comment.id || "")}">Löschen</button>
        </div>
        ${repliesBlock}
      </article>`;
    })
    .join("");
  if (!cache.comments.length) commentList.innerHTML = `<p class="muted">Noch keine Kommentare vorhanden.</p>`;
}

function refreshCounts() {
  qCount.textContent = String(cache.questions.length);
  eCount.textContent = String(cache.events.length);
  iCount.textContent = String(cache.initiatives.length);
  pCount.textContent = String(cache.people.length);
  if (cCount) cCount.textContent = String(cache.comments.length);
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function resetQuestionForm() {
  qId.value = "";
  qText.value = "";
  qDate.value = "";
  qLocation.value = "";
  qAuthors.value = "";
}

function resetEventForm() {
  eId.value = "";
  eTitle.value = "";
  eDate.value = "";
  eLocation.value = "";
  eHosts.value = "";
  eDescription.value = "";
  eSourceUrl.value = "";
  eArchived.checked = false;
}

function resetInitiativeForm() {
  iId.value = "";
  iTitle.value = "";
  iStatus.value = "";
  iDescription.value = "";
  iHosts.value = "";
  iSourceUrl.value = "";
}

function resetPersonForm() {
  pId.value = "";
  pName.value = "";
  pSlug.value = "";
  pEmail.value = "";
  pRole.value = "";
  pPortraitUrl.value = "";
  if (pPortraitFocusX) pPortraitFocusX.value = "50";
  if (pPortraitFocusY) pPortraitFocusY.value = "50";
  if (pPassword) pPassword.value = "";
  pLinks.value = "";
  pBio.value = "";
  if (pPortraitFile) pPortraitFile.value = "";
  setUploadStatus(personPortraitUploadStatus, "");
}

function parseLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}

async function handleImageUpload({ fileInput, targetInput, statusEl, target }) {
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  if (!file) {
    setUploadStatus(statusEl, "Bitte zuerst eine Bilddatei wählen.", true);
    return;
  }
  if (!file.type || !file.type.startsWith("image/")) {
    setUploadStatus(statusEl, "Nur Bilddateien sind erlaubt.", true);
    return;
  }

  try {
    setUploadStatus(statusEl, "Upload läuft …");
    const dataBase64 = await fileToBase64(file);
    const res = await fetch("/api/uploads", {
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
  } catch (error) {
    setUploadStatus(statusEl, String(error.message || "Upload fehlgeschlagen"), true);
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

function normalizeFocus(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
}

async function checkSession() {
  const res = await fetch("/api/auth/me");
  return res.ok;
}

function showAdmin() {
  loginSection.classList.add("hidden");
  adminSection.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
}

function hideAdmin() {
  adminSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
  logoutBtn.classList.add("hidden");
}

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function focusWithoutScroll(el) {
  if (!el || typeof el.focus !== "function") return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}
