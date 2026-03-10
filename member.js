const app = document.getElementById("memberApp");
const params = new URLSearchParams(window.location.search);
const pageSlug = document.body.dataset.memberSlug || params.get("slug") || "";
const initialSection = String(params.get("section") || "").trim().toLowerCase();

const MEMBER_INTERACTION_KEY = "public-secrets-member-interactions-v1";

let state = {
  member: null,
  people: [],
  questions: [],
  events: [],
  initiatives: [],
  comments: [],
  sessionName: "",
  interactions: loadInteractionState(),
  openQuestionDetails: {},
  openQuestionAnswers: {},
  openQuestionCompose: {},
  showAllInitiatives: initialSection === "initiatives",
  showAllEvents: initialSection === "events",
  showAllAnswers: initialSection === "answers"
};

init();

async function init() {
  const [people, questions, events, initiatives, comments, sessionName] = await Promise.all([
    fetchPeople(),
    fetchQuestions(),
    fetchEvents(),
    fetchInitiatives(),
    fetchComments(),
    fetchSessionName()
  ]);

  state.people = people;
  state.questions = questions;
  state.events = events;
  state.initiatives = initiatives;
  state.comments = comments;
  state.sessionName = sessionName;

  if (!people.length) {
    app.innerHTML = `<section class="card"><h2>Keine Mitgliedsdaten</h2></section>`;
    return;
  }

  state.member = people.find((p) => (p.slug || slugify(p.name || "")) === pageSlug) || people[0];
  render();
}

app.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-action]");
  if (!btn || !state.member) return;

  const action = String(btn.dataset.action || "");
  const qid = String(btn.dataset.id || "");

  if (action === "toggle-question" && qid) {
    state.openQuestionDetails[qid] = !state.openQuestionDetails[qid];
    if (!state.openQuestionDetails[qid]) {
      state.openQuestionAnswers[qid] = false;
      state.openQuestionCompose[qid] = false;
    }
    render();
    return;
  }

  if (action === "toggle-answers" && qid) {
    state.openQuestionAnswers[qid] = !state.openQuestionAnswers[qid];
    render();
    return;
  }

  if (action === "toggle-compose" && qid) {
    state.openQuestionCompose[qid] = !state.openQuestionCompose[qid];
    render();
    return;
  }

  if (action === "save-answer" && qid) {
    saveAnswer(qid);
    return;
  }

  if (action === "show-all-initiatives") {
    state.showAllInitiatives = true;
    render();
    return;
  }

  if (action === "show-all-events") {
    state.showAllEvents = true;
    render();
    return;
  }

  if (action === "show-all-answers") {
    state.showAllAnswers = true;
    render();
  }
});

function render() {
  const member = state.member;
  const memberName = String(member.name || "");
  const relatedQuestions = state.questions
    .filter((q) => (q.authors || []).some((author) => normalize(author) === normalize(memberName)))
    .sort((a, b) => Date.parse(String(b.createdAt || "")) - Date.parse(String(a.createdAt || "")));

  const relatedEvents = state.events
    .filter((event) => (event.hosts || []).some((host) => normalize(host) === normalize(memberName)))
    .sort((a, b) => Date.parse(String(b.date || "")) - Date.parse(String(a.date || "")));

  const relatedInitiatives = state.initiatives.filter((initiative) =>
    (initiative.hosts || []).some((host) => normalize(host) === normalize(memberName))
  );

  const authoredAnswers = collectMemberAnswers(memberName, state.comments, state.questions);
  const links = normalizeLinks(member.links);

  const portrait = member.portraitUrl
    ? `<img class="member-avatar-large" src="${escapeHtml(member.portraitUrl)}" alt="${escapeHtml(memberName)}" ${portraitStyle(member)} />`
    : `<div class="member-avatar-large member-avatar-fallback">${escapeHtml(initials(memberName))}</div>`;
  const linksBlock = links.length
    ? `<p class="muted">${links
        .map((link) => {
          const href = toProfileHref(link);
          return `<a class="member-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a>`;
        })
        .join(" · ")}</p>`
    : "";

  const questionLimit = 3;
  const visibleQuestions = relatedQuestions.slice(0, questionLimit);
  const questionCards = visibleQuestions.map((q) => renderQuestionCard(q, true)).join("");
  const questionMore = relatedQuestions.length > questionLimit
    ? `<p><a class="member-link" href="/index.html?view=questions&author=${encodeURIComponent(memberName)}">Alle Fragen von ${escapeHtml(memberName)}</a></p>`
    : "";

  const initiativeLimit = 3;
  const shownInitiatives = state.showAllInitiatives ? relatedInitiatives : relatedInitiatives.slice(0, initiativeLimit);
  const initiativesMore = !state.showAllInitiatives && relatedInitiatives.length > initiativeLimit
    ? `<p><a class="member-link" href="/members/${escapeHtml(member.slug || slugify(memberName))}.html?section=initiatives">Alle Initiativen von ${escapeHtml(memberName)}</a></p>`
    : "";

  const eventLimit = 3;
  const shownEvents = state.showAllEvents ? relatedEvents : relatedEvents.slice(0, eventLimit);
  const eventsMore = !state.showAllEvents && relatedEvents.length > eventLimit
    ? `<p><a class="member-link" href="/members/${escapeHtml(member.slug || slugify(memberName))}.html?section=events">Alle Momente von ${escapeHtml(memberName)}</a></p>`
    : "";

  const answerLimit = 3;
  const shownAnswers = state.showAllAnswers ? authoredAnswers : authoredAnswers.slice(0, answerLimit);
  const answersMore = !state.showAllAnswers && authoredAnswers.length > answerLimit
    ? `<p><a class="member-link" href="/members/${escapeHtml(member.slug || slugify(memberName))}.html?section=answers">Alle Antworten von ${escapeHtml(memberName)}</a></p>`
    : "";

  app.innerHTML = `
    <section class="card">
      <div class="member-header">
        ${portrait}
        <div>
          <h2>${escapeHtml(memberName)}</h2>
          <p class="muted">${escapeHtml(member.role || "")}</p>
          ${linksBlock}
        </div>
      </div>
      <p>${escapeHtml(member.bio || "")}</p>
    </section>

    ${relatedQuestions.length
      ? `<section class="card"><h2>Fragen von ${escapeHtml(memberName)}</h2><div class="list">${questionCards}</div>${questionMore}</section>`
      : ""}

    ${authoredAnswers.length
      ? `<section class="card"><h2>Antworten von ${escapeHtml(memberName)}</h2><div class="list">${shownAnswers
          .map(renderAnswerCard)
          .join("")}</div>${answersMore}</section>`
      : ""}

    ${relatedInitiatives.length
      ? `<section class="card"><h2>Initiativen mit ${escapeHtml(memberName)}</h2><div class="list">${shownInitiatives
          .map(renderInitiative)
          .join("")}</div>${initiativesMore}</section>`
      : ""}

    ${relatedEvents.length
      ? `<section class="card"><h2>Momente mit ${escapeHtml(memberName)}</h2><div class="list">${shownEvents
          .map(renderEvent)
          .join("")}</div>${eventsMore}</section>`
      : ""}
  `;
}

function renderQuestionCard(question, inMemberPage) {
  const qid = String(question.id || "");
  const open = Boolean(state.openQuestionDetails[qid]);
  const openAnswers = Boolean(state.openQuestionAnswers[qid]);
  const openCompose = Boolean(state.openQuestionCompose[qid]);
  const commentsByQuestion = getCommentsByQuestionMap(state.comments);
  const rows = commentsByQuestion.get(qid) || [];
  const answerCount = countCommentEntries(rows);
  const where = String(question.location || "").trim() || "Ohne Ort";
  const when = formatShortDate(question.createdAt) || "Ohne Datum";
  const authors = (question.authors || []).join(", ") || "Anonym";
  const draft = getInteraction(qid);
  const draftName = String(draft.name || state.sessionName || "");

  const details = open
    ? `<div class="question-detail-line"><span>${escapeHtml(where)}</span><span class="question-meta-sep">·</span><span>${escapeHtml(when)}</span><span class="question-meta-sep">·</span><span>${escapeHtml(authors)}</span><span class="question-meta-sep">·</span><button class="author-link" type="button" data-action="toggle-answers" data-id="${escapeHtml(qid)}">${answerCount} Antworten</button><span class="question-meta-sep">·</span><button class="author-link" type="button" data-action="toggle-compose" data-id="${escapeHtml(qid)}">Beantworten</button></div>`
    : "";

  const answers = open && openAnswers
    ? (answerCount > 0
      ? `<div class="list answers-list">${rows.map(renderCommentThread).join("")}</div>`
      : `<p class="muted">Noch keine Antworten.</p>`)
    : "";

  const compose = open && openCompose
    ? `<div class="list-comment-form answer-compose">
         <textarea class="answer-input" rows="3" data-answer-text="${escapeHtml(qid)}" placeholder="Deine Antwort">${escapeHtml(draft.comment || "")}</textarea>
         <input class="answer-name-input" type="text" data-answer-name="${escapeHtml(qid)}" placeholder="Dein Name" value="${escapeHtml(draftName)}" />
         <div class="actions quiet-actions">
           <button class="quiet-btn quiet-btn-primary" type="button" data-action="save-answer" data-id="${escapeHtml(qid)}">Speichern</button>
         </div>
       </div>`
    : "";

  return `<article class="card question-list-item">
    <h3><button class="question-open-btn" type="button" data-action="toggle-question" data-id="${escapeHtml(qid)}">${escapeHtml(question.text || "")}</button></h3>
    ${details}
    ${answers}
    ${compose}
    ${inMemberPage ? "" : ""}
  </article>`;
}

function renderCommentThread(entry) {
  const by = entry.name ? entry.name : "Anonym";
  const when = entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString("de-DE") : "";
  const main = String(entry.comment || "").trim()
    ? `<p class="answer-text">${escapeHtml(entry.comment || "")}</p><p class="muted answer-by">${escapeHtml(by)}${when ? ` · ${escapeHtml(when)}` : ""}</p>`
    : "";
  const replies = Array.isArray(entry.replies) ? entry.replies : [];
  const replyBlock = replies.length
    ? `<div class="list answers-list">${replies
        .map((reply) => {
          const rb = reply.name ? reply.name : "Anonym";
          const rw = reply.createdAt ? new Date(reply.createdAt).toLocaleDateString("de-DE") : "";
          return `<article class="card"><p class="answer-text">${escapeHtml(reply.text || "")}</p><p class="muted answer-by">${escapeHtml(rb)}${rw ? ` · ${escapeHtml(rw)}` : ""}</p></article>`;
        })
        .join("")}</div>`
    : "";
  return `<article class="card">${main}${replyBlock}</article>`;
}

function renderAnswerCard(item) {
  const questionLink = `/index.html?view=questions&author=${encodeURIComponent(item.author || "")}`;
  return `<article class="card">
    <p class="answer-text">${escapeHtml(item.text || "")}</p>
    <p class="muted answer-by">${escapeHtml(item.date || "")}</p>
    <p><a class="member-link" href="${questionLink}">${escapeHtml(item.questionText || "Zur Frage")}</a></p>
  </article>`;
}

function renderInitiative(initiative) {
  const detailHref = initiative.id ? `/initiatives.html?id=${encodeURIComponent(initiative.id)}` : "/initiatives.html";
  const link = initiative.sourceUrl
    ? `<p><a class="member-link" href="${escapeHtml(initiative.sourceUrl)}" target="_blank" rel="noopener noreferrer">Quelle</a></p>`
    : "";
  const image = initiative.imageUrl
    ? `<img class="initiative-thumb" src="${escapeHtml(initiative.imageUrl)}" alt="${escapeHtml(initiative.title || "")}" loading="lazy" />`
    : "";
  return `<article class="card">${image}<h3><a class="member-link" href="${detailHref}">${escapeHtml(initiative.title || "")}</a></h3><p class="muted">${escapeHtml(initiative.description || "")}</p><p><a class="member-link" href="${detailHref}">Mehr</a></p>${link}</article>`;
}

function renderEvent(event) {
  const date = event.date ? new Date(event.date).toLocaleDateString("de-DE") : "";
  const location = event.location ? ` - ${escapeHtml(event.location)}` : "";
  const image = event.imageUrl
    ? `<img class="calendar-image" src="${escapeHtml(event.imageUrl)}" alt="${escapeHtml(event.title || "")}" loading="lazy" />`
    : "";
  return `<article class="card"><h3>${escapeHtml(event.title || "")}</h3><p class="muted">${escapeHtml(date)}${location}</p>${image}<p>${escapeHtml(event.description || "")}</p></article>`;
}

async function saveAnswer(questionId) {
  const textInput = app.querySelector(`textarea[data-answer-text="${escapeAttr(questionId)}"]`);
  const nameInput = app.querySelector(`input[data-answer-name="${escapeAttr(questionId)}"]`);
  const text = textInput ? textInput.value.trim() : "";
  const name = nameInput ? nameInput.value.trim() : "";
  if (!text) return;

  saveInteraction(questionId, text, name);
  await persistComment({
    questionId: String(questionId || ""),
    browserId: state.interactions.browserId,
    rating: 0,
    name,
    comment: text
  });
  if (textInput) textInput.value = "";
  state.openQuestionCompose[String(questionId || "")] = false;
  state.openQuestionAnswers[String(questionId || "")] = true;
  render();
}

function collectMemberAnswers(memberName, comments, questions) {
  const target = normalize(memberName);
  const byQuestion = new Map((questions || []).map((q) => [String(q.id || ""), q]));
  const out = [];
  const rows = Array.isArray(comments) ? comments : [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.visible === false) continue;
    if (normalize(row.name || "") === target && String(row.comment || "").trim()) {
      const q = byQuestion.get(String(row.questionId || ""));
      out.push({
        text: String(row.comment || ""),
        date: row.updatedAt ? new Date(row.updatedAt).toLocaleDateString("de-DE") : "",
        ts: Date.parse(String(row.updatedAt || "")) || 0,
        questionText: q ? String(q.text || "") : "Frage"
      });
    }
    const replies = Array.isArray(row.replies) ? row.replies : [];
    for (let j = 0; j < replies.length; j += 1) {
      const reply = replies[j];
      if (!reply || reply.visible === false) continue;
      if (normalize(reply.name || "") !== target) continue;
      if (!String(reply.text || "").trim()) continue;
      const q = byQuestion.get(String(row.questionId || ""));
      out.push({
        text: String(reply.text || ""),
        date: reply.createdAt ? new Date(reply.createdAt).toLocaleDateString("de-DE") : "",
        ts: Date.parse(String(reply.createdAt || "")) || 0,
        questionText: q ? String(q.text || "") : "Frage"
      });
    }
  }
  return out.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
}

function getCommentsByQuestionMap(comments) {
  const byQuestion = new Map();
  const rows = Array.isArray(comments) ? comments : [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.visible === false) continue;
    const qid = String(row.questionId || "");
    if (!qid) continue;
    const hasComment = Boolean(String(row.comment || "").trim());
    const visibleReplies = Array.isArray(row.replies)
      ? row.replies.filter((reply) => reply && reply.visible !== false && String(reply.text || "").trim().length > 0)
      : [];
    if (!hasComment && visibleReplies.length === 0) continue;
    if (!byQuestion.has(qid)) byQuestion.set(qid, []);
    byQuestion.get(qid).push({ ...row, replies: visibleReplies });
  }
  return byQuestion;
}

function countCommentEntries(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  let total = 0;
  for (let i = 0; i < safeRows.length; i += 1) {
    const row = safeRows[i];
    if (!row || row.visible === false) continue;
    if (String(row.comment || "").trim()) total += 1;
    const replies = Array.isArray(row.replies) ? row.replies : [];
    total += replies.filter((reply) => reply && reply.visible !== false && String(reply.text || "").trim().length > 0).length;
  }
  return total;
}

function loadInteractionState() {
  try {
    const raw = localStorage.getItem(MEMBER_INTERACTION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          browserId: String(parsed.browserId || makeBrowserId()),
          responses: parsed.responses && typeof parsed.responses === "object" ? parsed.responses : {}
        };
      }
    }
  } catch {}
  const fresh = { browserId: makeBrowserId(), responses: {} };
  try {
    localStorage.setItem(MEMBER_INTERACTION_KEY, JSON.stringify(fresh));
  } catch {}
  return fresh;
}

function saveInteraction(questionId, comment, name) {
  state.interactions.responses[String(questionId || "")] = {
    questionId: String(questionId || ""),
    rating: 0,
    name: String(name || ""),
    comment: String(comment || ""),
    updatedAt: new Date().toISOString(),
    browserId: state.interactions.browserId
  };
  try {
    localStorage.setItem(MEMBER_INTERACTION_KEY, JSON.stringify(state.interactions));
  } catch {}
}

function getInteraction(questionId) {
  return state.interactions.responses[String(questionId || "")] || { comment: "", name: "" };
}

async function persistComment(entry) {
  const payload = {
    questionId: String(entry.questionId || ""),
    browserId: String(entry.browserId || state.interactions.browserId || ""),
    rating: 0,
    name: String(entry.name || ""),
    comment: String(entry.comment || "")
  };
  try {
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return;
    state.comments = await fetchComments();
  } catch {}
}

async function fetchSessionName() {
  try {
    const res = await fetch("/api/member/auth/me");
    if (!res.ok) return "";
    const row = await res.json();
    return String(row.memberName || "").trim();
  } catch {
    return "";
  }
}

async function fetchPeople() {
  try {
    const res = await fetch("/api/people");
    if (!res.ok) throw new Error("people api");
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    try {
      const fallback = await fetch("/data/people.json");
      if (!fallback.ok) throw new Error("people file");
      const rows = await fallback.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
}

async function fetchQuestions() {
  try {
    const res = await fetch("/api/questions");
    if (!res.ok) throw new Error("questions api");
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    try {
      const fallback = await fetch("/data/questions.json");
      if (!fallback.ok) throw new Error("questions file");
      const rows = await fallback.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
}

async function fetchEvents() {
  try {
    const res = await fetch("/api/events");
    if (!res.ok) throw new Error("events api");
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    try {
      const fallback = await fetch("/data/events.json");
      if (!fallback.ok) throw new Error("events file");
      const rows = await fallback.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
}

async function fetchInitiatives() {
  try {
    const res = await fetch("/api/initiatives");
    if (!res.ok) throw new Error("initiatives api");
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    try {
      const fallback = await fetch("/data/initiatives.json");
      if (!fallback.ok) throw new Error("initiatives file");
      const rows = await fallback.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
}

async function fetchComments() {
  try {
    const res = await fetch("/api/comments");
    if (!res.ok) throw new Error("comments api");
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    try {
      const fallback = await fetch("/data/comments.json");
      if (!fallback.ok) throw new Error("comments file");
      const rows = await fallback.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeLinks(input) {
  if (Array.isArray(input)) return input.map((v) => String(v).trim()).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(/\r?\n|,/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function toProfileHref(value) {
  const raw = String(value || "").trim();
  if (!raw) return "#";
  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
  return `https://${raw}`;
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function makeBrowserId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "browser-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function initials(name) {
  return String(name)
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE");
}

function normalizeFocus(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function portraitStyle(member) {
  const fx = normalizeFocus(member && member.portraitFocusX);
  const fy = normalizeFocus(member && member.portraitFocusY);
  return `style="object-position:${fx}% ${fy}%;"`;
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
