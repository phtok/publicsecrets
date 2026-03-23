#!/usr/bin/env node
const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const DATA_DIR = resolveDataDir();
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const INITIATIVES_FILE = path.join(DATA_DIR, "initiatives.json");
const PEOPLE_FILE = path.join(DATA_DIR, "people.json");
const COMMENTS_FILE = path.join(DATA_DIR, "comments.json");
const TOKENS_FILE = path.join(DATA_DIR, "member_login_tokens.json");
const OUTBOX_FILE = path.join(DATA_DIR, "member_login_outbox.json");
const SITE_SETTINGS_FILE = path.join(DATA_DIR, "site_settings.json");
const DELETED_ITEMS_FILE = path.join(DATA_DIR, "deleted_items.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const EDITOR_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MEMBER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 400;
const MEMBER_TOKEN_TTL_MS = 1000 * 60 * 15;
const COOKIE_NAME = "ps_session";
const LOGIN_IDENTITY_ALIASES = loadLoginIdentityAliases();

const sessions = new Map();
const editors = loadEditors();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon"
};

start().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});

async function start() {
  console.log(`Using data directory: ${DATA_DIR}`);
  await ensureDataFiles();
  loadPersistedSessions();
  await migratePeopleData();
  await migrateArchivedContent();
  await ensureInitialMemberPasswords();
  cleanupExpiredSessions();

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (error) {
      if (error && error.status) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      console.error("Unhandled error:", error);
      sendJson(res, 500, { error: "Internal server error" });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`Public Secrets server running on http://${HOST}:${PORT}`);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = normalizePath(url.pathname);

  if (pathname.startsWith("/api/")) {
    return handleApi(req, res, pathname, url);
  }
  if (pathname.startsWith("/uploads/")) {
    return serveUploadedFile(res, pathname);
  }

  return serveStatic(res, pathname);
}

async function handleApi(req, res, pathname, url) {
  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    const user = editors.find((entry) => entry.username === body.username && entry.password === body.password);
    if (!user) return sendJson(res, 401, { error: "Ungueltige Anmeldedaten" });

    const sid = createSession({ role: "editor", username: user.username });
    setSessionCookie(res, sid);
    return sendJson(res, 200, { username: user.username });
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const sid = getSessionId(req);
    if (sid) {
      sessions.delete(sid);
      persistSessions();
    }
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    return sendJson(res, 200, { username: session.username });
  }

  if (req.method === "POST" && pathname === "/api/member/auth/request") {
    const body = await readJsonBody(req);
    const email = normalizeEmailAddress(body.email);
    if (!email) return sendJson(res, 400, { error: "E-Mail fehlt" });

    const people = await readData(PEOPLE_FILE);
    const person = findPersonByLoginIdentity(people, email);
    if (!person) return sendJson(res, 200, { ok: true });

    const token = crypto.randomBytes(24).toString("hex");
    const tokens = await readData(TOKENS_FILE);
    tokens.push({
      token,
      memberSlug: String(person.slug || ""),
      email,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + MEMBER_TOKEN_TTL_MS).toISOString(),
      usedAt: null
    });
    await writeData(TOKENS_FILE, tokens);

    const proto = String(req.headers["x-forwarded-proto"] || "").trim() || (req.socket && req.socket.encrypted ? "https" : "http");
    const baseUrl = `${proto}://${req.headers.host || `${HOST}:${PORT}`}`;
    const loginUrl = `${baseUrl}/login.html?token=${token}`;
    const delivery = await deliverMemberMagicLink(email, person, loginUrl);
    return sendJson(res, 200, {
      ok: true,
      delivery: delivery.mode,
      deliveryError: String(delivery.error || "")
    });
  }

  if (req.method === "GET" && pathname === "/api/member/auth/outbox") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const outbox = await readData(OUTBOX_FILE);
    const rows = outbox
      .slice()
      .sort((a, b) => Date.parse(String(b.createdAt || "")) - Date.parse(String(a.createdAt || "")))
      .slice(0, 200)
      .map((row) => ({
        email: String(row.email || "").trim().toLowerCase(),
        memberSlug: String(row.memberSlug || "").trim(),
        createdAt: normalizeCreatedAt(row.createdAt),
        loginUrl: String(row.loginUrl || "").trim(),
        deliveryError: String(row.deliveryError || "").trim()
      }));
    return sendJson(res, 200, rows);
  }

  if (req.method === "POST" && pathname === "/api/member/auth/password-login") {
    const body = await readJsonBody(req);
    const identity = normalizeEmailAddress(body.identity || body.email || "");
    const password = String(body.password || "");
    if (!identity || !password) return sendJson(res, 400, { error: "E-Mail und Passwort sind erforderlich" });

    const people = await readData(PEOPLE_FILE);
    const person = findPersonByLoginIdentity(people, identity);
    if (!person) return sendJson(res, 401, { error: "Ungültige Anmeldedaten" });
    if (!verifyPasswordHash(password, String(person.passwordHash || ""))) {
      return sendJson(res, 401, { error: "Ungültige Anmeldedaten" });
    }

    const sid = createSession({
      role: "member",
      memberSlug: String(person.slug || ""),
      memberName: String(person.name || ""),
      mustChangePassword: Boolean(person.mustChangePassword)
    });
    setSessionCookie(res, sid);
    return sendJson(res, 200, {
      ok: true,
      memberSlug: person.slug,
      memberName: person.name,
      mustChangePassword: Boolean(person.mustChangePassword)
    });
  }

  if (req.method === "POST" && pathname === "/api/member/auth/verify") {
    const body = await readJsonBody(req);
    const tokenValue = String(body.token || "").trim();
    if (!tokenValue) return sendJson(res, 400, { error: "Token fehlt" });

    const tokens = await readData(TOKENS_FILE);
    const idx = tokens.findIndex((t) => t.token === tokenValue);
    if (idx < 0) return sendJson(res, 401, { error: "Token ungültig" });
    const row = tokens[idx];
    if (row.usedAt) return sendJson(res, 401, { error: "Token bereits verwendet" });
    if (Date.parse(row.expiresAt) < Date.now()) return sendJson(res, 401, { error: "Token abgelaufen" });

    const people = await readData(PEOPLE_FILE);
    const person = people.find((p) => String(p.slug || "") === String(row.memberSlug || ""));
    if (!person) return sendJson(res, 401, { error: "Mitglied nicht gefunden" });

    tokens[idx] = { ...row, usedAt: new Date().toISOString() };
    await writeData(TOKENS_FILE, tokens);

    const sid = createSession({
      role: "member",
      memberSlug: String(person.slug || ""),
      memberName: String(person.name || ""),
      mustChangePassword: Boolean(person.mustChangePassword)
    });
    setSessionCookie(res, sid);
    return sendJson(res, 200, {
      ok: true,
      memberSlug: person.slug,
      memberName: person.name,
      mustChangePassword: Boolean(person.mustChangePassword)
    });
  }

  if (req.method === "POST" && pathname === "/api/member/auth/logout") {
    const sid = getSessionId(req);
    if (sid) {
      sessions.delete(sid);
      persistSessions();
    }
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/member/auth/me") {
    const memberContext = await requireMemberContext(req, res, { url });
    if (!memberContext) return;
    return sendJson(res, 200, {
      memberSlug: memberContext.memberSlug,
      memberName: memberContext.memberName,
      actorRole: memberContext.actorRole,
      mustChangePassword: Boolean(memberContext.mustChangePassword)
    });
  }

  if (req.method === "POST" && pathname === "/api/member/uploads") {
    const body = await readJsonBody(req);
    const memberContext = await requireMemberContext(req, res, { url, body });
    if (!memberContext) return;
    const result = await saveUploadedImage({
      filename: body.filename,
      contentType: body.contentType,
      dataBase64: body.dataBase64,
      target: body.target,
      memberSlug: memberContext.memberSlug
    });
    return sendJson(res, 201, result);
  }

  if (req.method === "POST" && pathname === "/api/uploads") {
    const session = requireSession(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const result = await saveUploadedImage({
      filename: body.filename,
      contentType: body.contentType,
      dataBase64: body.dataBase64,
      target: body.target,
      memberSlug: session.memberSlug || session.username || "editor"
    });
    return sendJson(res, 201, result);
  }

  if (req.method === "GET" && pathname === "/api/questions") {
    let questions = (await readData(QUESTIONS_FILE)).map(normalizeQuestionRow);
    questions = filterArchivedRows(questions, url, req, res);
    if (!questions) return;
    return sendJson(res, 200, questions);
  }

  if (req.method === "GET" && pathname === "/api/people") {
    let people = (await readData(PEOPLE_FILE)).map(normalizePersonRow);
    people = filterArchivedRows(people, url, req, res);
    if (!people) return;
    return sendJson(res, 200, people.map(sanitizePersonForClient));
  }

  if (req.method === "GET" && pathname === "/api/events") {
    let events = (await readData(EVENTS_FILE)).map(normalizeEventRow);
    events = filterArchivedRows(events, url, req, res);
    if (!events) return;
    return sendJson(res, 200, events);
  }

  if (req.method === "GET" && pathname === "/api/initiatives") {
    let initiatives = (await readData(INITIATIVES_FILE)).map(normalizeInitiativeRow);
    initiatives = filterArchivedRows(initiatives, url, req, res);
    if (!initiatives) return;
    return sendJson(res, 200, initiatives);
  }

  if (req.method === "GET" && pathname === "/api/site-settings") {
    const settings = normalizeSiteSettings(await readData(SITE_SETTINGS_FILE));
    return sendJson(res, 200, settings);
  }

  if (req.method === "GET" && pathname === "/api/deleted-items") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const rows = (await readData(DELETED_ITEMS_FILE))
      .map(normalizeDeletedItemRow)
      .sort((a, b) => Date.parse(String(b.deletedAt || "")) - Date.parse(String(a.deletedAt || "")))
      .map(sanitizeDeletedItemForClient);
    return sendJson(res, 200, rows);
  }

  if (req.method === "PUT" && /^\/api\/deleted-items\/[^/]+\/restore$/.test(pathname)) {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const match = pathname.match(/^\/api\/deleted-items\/([^/]+)\/restore$/);
    const deletedId = decodeURIComponent(match ? match[1] : "");
    if (!deletedId) return sendJson(res, 400, { error: "deletedItemId fehlt" });

    const deletedItems = (await readData(DELETED_ITEMS_FILE)).map(normalizeDeletedItemRow);
    const idx = deletedItems.findIndex((row) => String(row.id || "") === deletedId);
    if (idx < 0) return sendJson(res, 404, { error: "Papierkorb-Eintrag nicht gefunden" });
    if (deletedItems[idx].restoredAt) return sendJson(res, 409, { error: "Eintrag wurde bereits wiederhergestellt" });

    const restored = await restoreDeletedItem(deletedItems[idx]);
    deletedItems[idx] = normalizeDeletedItemRow({
      ...deletedItems[idx],
      restoredAt: new Date().toISOString(),
      restoredBy: buildActorPayloadFromSession(session),
      restoredEntityId: String(restored.restoredEntityId || deletedItems[idx].entityId || "")
    });
    await writeData(DELETED_ITEMS_FILE, deletedItems);
    return sendJson(res, 200, sanitizeDeletedItemForClient(deletedItems[idx]));
  }

  if (req.method === "GET" && pathname === "/api/comments") {
    const includeHidden = String(url.searchParams.get("includeHidden") || "").trim().toLowerCase() === "true";
    if (includeHidden) {
      const session = requireEditorSession(req, res);
      if (!session) return;
    }
    const comments = (await readData(COMMENTS_FILE)).map(normalizeCommentRow);
    const questionId = String(url.searchParams.get("questionId") || "").trim();
    const rows = comments
      .filter((row) => (questionId ? String(row.questionId || "") === questionId : true))
      .map((row) => {
        if (includeHidden) return row;
        if (row.visible === false) return null;
        const replies = Array.isArray(row.replies)
          ? row.replies.filter((reply) => reply && reply.visible !== false && String(reply.text || "").trim().length > 0)
          : [];
        return { ...row, replies };
      })
      .filter(Boolean)
      .filter((row) => {
        const hasComment = String(row.comment || "").trim().length > 0;
        const hasReplies = Array.isArray(row.replies) && row.replies.length > 0;
        return hasComment || hasReplies || Number(row.rating) > 0;
      })
      .sort((a, b) => Date.parse(String(b.updatedAt || "")) - Date.parse(String(a.updatedAt || "")));
    return sendJson(res, 200, rows);
  }

  if (req.method === "POST" && pathname === "/api/comments") {
    const body = await readJsonBody(req);
    const canComment = await requirePublicCommentPermission(req, res, {
      commentText: String(body.comment || "")
    });
    if (!canComment) return;
    const questionId = String(body.questionId || "").trim();
    const browserId = String(body.browserId || "").trim();
    if (!questionId) return sendJson(res, 400, { error: "questionId fehlt" });
    if (!browserId) return sendJson(res, 400, { error: "browserId fehlt" });

    const comments = await readData(COMMENTS_FILE);
    const nextRow = normalizeCommentRow({
      id: makeId("cm"),
      questionId,
      browserId,
      rating: body.rating,
      name: body.name,
      comment: body.comment,
      visible: true,
      updatedAt: new Date().toISOString()
    });
    const idx = comments.findIndex(
      (row) => String(row.questionId || "") === questionId && String(row.browserId || "") === browserId
    );
    if (idx >= 0) {
      const existing = normalizeCommentRow(comments[idx]);
      comments[idx] = normalizeCommentRow({
        ...existing,
        ...nextRow,
        id: existing.id || nextRow.id,
        replies: existing.replies || []
      });
    } else comments.push(nextRow);
    await writeData(COMMENTS_FILE, comments);
    return sendJson(res, 200, idx >= 0 ? comments[idx] : nextRow);
  }

  if (req.method === "POST" && /^\/api\/comments\/[^/]+\/replies$/.test(pathname)) {
    const body = await readJsonBody(req);
    const canComment = await requirePublicCommentPermission(req, res, {
      commentText: String(body.text || "")
    });
    if (!canComment) return;
    const match = pathname.match(/^\/api\/comments\/([^/]+)\/replies$/);
    const commentId = decodeURIComponent(match ? match[1] : "");
    if (!commentId) return sendJson(res, 400, { error: "commentId fehlt" });
    const text = String(body.text || "").trim();
    if (!text) return sendJson(res, 400, { error: "Antworttext fehlt" });

    const comments = await readData(COMMENTS_FILE);
    const idx = comments.findIndex((row) => String(row.id || "") === commentId);
    if (idx < 0) return sendJson(res, 404, { error: "Kommentar nicht gefunden" });

    const reply = normalizeReplyRow({
      id: makeId("rp"),
      browserId: String(body.browserId || "").trim(),
      name: body.name,
      text,
      visible: true,
      createdAt: new Date().toISOString()
    });

    const current = normalizeCommentRow(comments[idx]);
    const replies = Array.isArray(current.replies) ? current.replies.slice() : [];
    replies.push(reply);

    const updated = normalizeCommentRow({
      ...current,
      replies,
      updatedAt: new Date().toISOString()
    });
    comments[idx] = updated;
    await writeData(COMMENTS_FILE, comments);
    return sendJson(res, 200, updated);
  }

  if (req.method === "PUT" && /^\/api\/comments\/[^/]+$/.test(pathname)) {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const match = pathname.match(/^\/api\/comments\/([^/]+)$/);
    const commentId = decodeURIComponent(match ? match[1] : "");
    if (!commentId) return sendJson(res, 400, { error: "commentId fehlt" });
    const comments = await readData(COMMENTS_FILE);
    const idx = comments.findIndex((row) => String(row.id || "") === commentId);
    if (idx < 0) return sendJson(res, 404, { error: "Kommentar nicht gefunden" });
    const current = normalizeCommentRow(comments[idx]);
    const updated = normalizeCommentRow({
      ...current,
      name: body.name === undefined ? current.name : String(body.name || "").trim(),
      comment: body.comment === undefined ? current.comment : String(body.comment || "").trim(),
      rating: body.rating === undefined ? current.rating : normalizeRating(body.rating),
      visible: body.visible === undefined ? current.visible : Boolean(body.visible),
      updatedAt: new Date().toISOString(),
      replies: current.replies || []
    });
    comments[idx] = updated;
    await writeData(COMMENTS_FILE, comments);
    return sendJson(res, 200, updated);
  }

  if (req.method === "DELETE" && /^\/api\/comments\/[^/]+$/.test(pathname)) {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const match = pathname.match(/^\/api\/comments\/([^/]+)$/);
    const commentId = decodeURIComponent(match ? match[1] : "");
    if (!commentId) return sendJson(res, 400, { error: "commentId fehlt" });
    const comments = await readData(COMMENTS_FILE);
    const row = comments.find((entry) => String(entry.id || "") === commentId);
    if (!row) return sendJson(res, 404, { error: "Kommentar nicht gefunden" });
    const next = comments.filter((row) => String(row.id || "") !== commentId);
    await appendDeletedItem({
      entityType: "comment",
      entityId: commentId,
      actor: buildActorPayloadFromSession(session),
      snapshot: normalizeCommentRow(row),
      label: summarizeDeletedEntity("comment", row)
    });
    await writeData(COMMENTS_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "PUT" && /^\/api\/comments\/[^/]+\/replies\/[^/]+$/.test(pathname)) {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const match = pathname.match(/^\/api\/comments\/([^/]+)\/replies\/([^/]+)$/);
    const commentId = decodeURIComponent(match ? match[1] : "");
    const replyId = decodeURIComponent(match ? match[2] : "");
    if (!commentId || !replyId) return sendJson(res, 400, { error: "replyId oder commentId fehlt" });

    const comments = await readData(COMMENTS_FILE);
    const idx = comments.findIndex((row) => String(row.id || "") === commentId);
    if (idx < 0) return sendJson(res, 404, { error: "Kommentar nicht gefunden" });
    const current = normalizeCommentRow(comments[idx]);
    const replies = Array.isArray(current.replies) ? current.replies.slice() : [];
    const ridx = replies.findIndex((reply) => String(reply.id || "") === replyId);
    if (ridx < 0) return sendJson(res, 404, { error: "Antwort nicht gefunden" });
    replies[ridx] = normalizeReplyRow({
      ...replies[ridx],
      name: body.name === undefined ? replies[ridx].name : String(body.name || "").trim(),
      text: body.text === undefined ? replies[ridx].text : String(body.text || "").trim(),
      visible: body.visible === undefined ? replies[ridx].visible : Boolean(body.visible),
      createdAt: replies[ridx].createdAt
    });
    const updated = normalizeCommentRow({
      ...current,
      replies,
      updatedAt: new Date().toISOString()
    });
    comments[idx] = updated;
    await writeData(COMMENTS_FILE, comments);
    return sendJson(res, 200, updated);
  }

  if (req.method === "DELETE" && /^\/api\/comments\/[^/]+\/replies\/[^/]+$/.test(pathname)) {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const match = pathname.match(/^\/api\/comments\/([^/]+)\/replies\/([^/]+)$/);
    const commentId = decodeURIComponent(match ? match[1] : "");
    const replyId = decodeURIComponent(match ? match[2] : "");
    if (!commentId || !replyId) return sendJson(res, 400, { error: "replyId oder commentId fehlt" });

    const comments = await readData(COMMENTS_FILE);
    const idx = comments.findIndex((row) => String(row.id || "") === commentId);
    if (idx < 0) return sendJson(res, 404, { error: "Kommentar nicht gefunden" });
    const current = normalizeCommentRow(comments[idx]);
    const replies = Array.isArray(current.replies) ? current.replies.slice() : [];
    const reply = replies.find((entry) => String(entry.id || "") === replyId);
    if (!reply) return sendJson(res, 404, { error: "Antwort nicht gefunden" });
    const nextReplies = replies.filter((reply) => String(reply.id || "") !== replyId);
    await appendDeletedItem({
      entityType: "reply",
      entityId: replyId,
      actor: buildActorPayloadFromSession(session),
      snapshot: {
        ...normalizeReplyRow(reply),
        questionId: String(current.questionId || ""),
        commentId
      },
      label: summarizeDeletedEntity("reply", reply)
    });
    const updated = normalizeCommentRow({
      ...current,
      replies: nextReplies,
      updatedAt: new Date().toISOString()
    });
    comments[idx] = updated;
    await writeData(COMMENTS_FILE, comments);
    return sendJson(res, 200, updated);
  }

  if (req.method === "GET" && pathname === "/api/member/profile") {
    const memberContext = await requireMemberContext(req, res, { url });
    if (!memberContext) return;
    const people = await readData(PEOPLE_FILE);
    const person = people.find((p) => String(p.slug || "") === String(memberContext.memberSlug || ""));
    if (!person) return sendJson(res, 404, { error: "Mitglied nicht gefunden" });
    return sendJson(res, 200, sanitizePersonForClient(person));
  }

  if (req.method === "PUT" && pathname === "/api/member/profile") {
    const body = await readJsonBody(req);
    const memberContext = await requireMemberContext(req, res, { url, body });
    if (!memberContext) return;
    const people = await readData(PEOPLE_FILE);
    const idx = people.findIndex((p) => String(p.slug || "") === String(memberContext.memberSlug || ""));
    if (idx < 0) return sendJson(res, 404, { error: "Mitglied nicht gefunden" });
    const current = normalizePersonRow(people[idx]);
    people[idx] = normalizePersonRow({
      ...current,
      role: body.role === undefined ? current.role || "" : String(body.role).trim(),
      bio: body.bio === undefined ? current.bio || "" : String(body.bio).trim(),
      portraitUrl: body.portraitUrl === undefined ? current.portraitUrl || "" : String(body.portraitUrl).trim(),
      links: body.links === undefined ? normalizeLinks(current.links || []) : normalizeLinks(body.links),
      portraitFocusX: body.portraitFocusX === undefined ? normalizePortraitFocus(current.portraitFocusX) : normalizePortraitFocus(body.portraitFocusX),
      portraitFocusY: body.portraitFocusY === undefined ? normalizePortraitFocus(current.portraitFocusY) : normalizePortraitFocus(body.portraitFocusY),
      archived: body.archived === undefined ? current.archived : normalizeArchived(body.archived)
    });
    if (body.password !== undefined && String(body.password || "").trim()) {
      people[idx].passwordHash = createPasswordHash(String(body.password || ""));
      people[idx].mustChangePassword = false;
      people[idx].initialPasswordSeeded = people[idx].initialPasswordSeeded || new Date().toISOString();
      const sid = getSessionId(req);
      if (sid && sessions.has(sid)) {
        const activeSession = sessions.get(sid);
        if (activeSession && activeSession.role === "member" && String(activeSession.memberSlug || "") === String(memberContext.memberSlug || "")) {
          activeSession.mustChangePassword = false;
          sessions.set(sid, activeSession);
          persistSessions();
        }
      }
    }
    await writeData(PEOPLE_FILE, people);
    return sendJson(res, 200, sanitizePersonForClient(people[idx]));
  }

  if (req.method === "GET" && pathname === "/api/member/questions") {
    const memberContext = await requireMemberContext(req, res, { url });
    if (!memberContext) return;
    const questions = (await readData(QUESTIONS_FILE)).map(normalizeQuestionRow);
    const own = questions.filter((q) => includesMember(q.authors, memberContext.memberName));
    return sendJson(res, 200, own);
  }

  if (req.method === "POST" && pathname === "/api/member/questions") {
    const body = await readJsonBody(req);
    const memberContext = await requireMemberContext(req, res, { url, body });
    if (!memberContext) return;
    const authors = ensureMemberHost(normalizeAuthors(body.authors), memberContext.memberName);
    const newItem = {
      id: makeId("q"),
      text: String(body.text || "").trim(),
      authors,
      authorStatus: normalizeQuestionAuthorStatus(body.authorStatus),
      authorHint: String(body.authorHint || "").trim(),
      createdAt: normalizeCreatedAt(body.createdAt),
      location: String(body.location || "").trim(),
      sourceLabel: String(body.sourceLabel || "").trim(),
      archived: normalizeArchived(body.archived)
    };
    if (!newItem.text) return sendJson(res, 400, { error: "Fragetext fehlt" });
    const questions = await readData(QUESTIONS_FILE);
    questions.push(normalizeQuestionRow(newItem));
    await writeData(QUESTIONS_FILE, questions);
    return sendJson(res, 201, normalizeQuestionRow(newItem));
  }

  if (pathname.startsWith("/api/member/questions/") && req.method === "PUT") {
    const id = pathname.split("/").pop();
    const body = await readJsonBody(req);
    const memberContext = await requireMemberContext(req, res, { url, body });
    if (!memberContext) return;
    const questions = (await readData(QUESTIONS_FILE)).map(normalizeQuestionRow);
    const idx = questions.findIndex((q) => q.id === id);
    if (idx < 0) return sendJson(res, 404, { error: "Frage nicht gefunden" });
    if (!includesMember(questions[idx].authors, memberContext.memberName)) return sendJson(res, 403, { error: "Kein Zugriff" });
    const authors = ensureMemberHost(
      body.authors === undefined ? questions[idx].authors || [] : normalizeAuthors(body.authors),
      memberContext.memberName
    );
    const updated = {
      ...questions[idx],
      text: body.text === undefined ? questions[idx].text : String(body.text).trim(),
      authors,
      authorStatus: body.authorStatus === undefined ? questions[idx].authorStatus : normalizeQuestionAuthorStatus(body.authorStatus),
      authorHint: body.authorHint === undefined ? questions[idx].authorHint || "" : String(body.authorHint).trim(),
      createdAt: body.createdAt === undefined ? questions[idx].createdAt : normalizeCreatedAt(body.createdAt, questions[idx].createdAt),
      location: body.location === undefined ? questions[idx].location || "" : String(body.location).trim(),
      sourceLabel: body.sourceLabel === undefined ? questions[idx].sourceLabel || "" : String(body.sourceLabel).trim(),
      archived: body.archived === undefined ? questions[idx].archived : normalizeArchived(body.archived)
    };
    if (!updated.text) return sendJson(res, 400, { error: "Fragetext fehlt" });
    questions[idx] = normalizeQuestionRow(updated);
    await writeData(QUESTIONS_FILE, questions);
    return sendJson(res, 200, questions[idx]);
  }

  if (pathname.startsWith("/api/member/questions/") && req.method === "DELETE") {
    const memberContext = await requireMemberContext(req, res, { url });
    if (!memberContext) return;
    const id = pathname.split("/").pop();
    const questions = await readData(QUESTIONS_FILE);
    const row = questions.find((q) => q.id === id);
    if (!row) return sendJson(res, 404, { error: "Frage nicht gefunden" });
    if (!includesMember(row.authors, memberContext.memberName)) return sendJson(res, 403, { error: "Kein Zugriff" });
    const next = questions.filter((q) => q.id !== id);
    await appendDeletedItem({
      entityType: "question",
      entityId: id,
      actor: buildActorPayloadFromMemberContext(memberContext),
      snapshot: normalizeQuestionRow(row),
      label: summarizeDeletedEntity("question", row)
    });
    await writeData(QUESTIONS_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/member/events") {
    const memberContext = await requireMemberContext(req, res, { url });
    if (!memberContext) return;
    const events = (await readData(EVENTS_FILE)).map(normalizeEventRow);
    const own = events.filter((e) => includesMember(e.hosts, memberContext.memberName));
    return sendJson(res, 200, own);
  }

  if (req.method === "POST" && pathname === "/api/member/events") {
    const body = await readJsonBody(req);
    const memberContext = await requireMemberContext(req, res, { url, body });
    if (!memberContext) return;
    const hosts = ensureMemberHost(normalizeHosts(body.hosts), memberContext.memberName);
    const newItem = {
      id: makeId("ev"),
      title: String(body.title || "").trim(),
      description: String(body.description || "").trim(),
      location: String(body.location || "").trim(),
      date: String(body.date || "").trim(),
      archived: Boolean(body.archived),
      hosts,
      sourceUrl: String(body.sourceUrl || "").trim(),
      imageUrl: String(body.imageUrl || "").trim()
    };
    if (!newItem.title || !newItem.date) return sendJson(res, 400, { error: "Titel und Datum sind Pflicht" });
    const events = await readData(EVENTS_FILE);
    events.push(normalizeEventRow(newItem));
    await writeData(EVENTS_FILE, events);
    return sendJson(res, 201, normalizeEventRow(newItem));
  }

  if (pathname.startsWith("/api/member/events/") && req.method === "PUT") {
    const id = pathname.split("/").pop();
    const body = await readJsonBody(req);
    const memberContext = await requireMemberContext(req, res, { url, body });
    if (!memberContext) return;
    const events = (await readData(EVENTS_FILE)).map(normalizeEventRow);
    const idx = events.findIndex((e) => e.id === id);
    if (idx < 0) return sendJson(res, 404, { error: "Termin nicht gefunden" });
    if (!includesMember(events[idx].hosts, memberContext.memberName)) return sendJson(res, 403, { error: "Kein Zugriff" });
    const hosts = ensureMemberHost(
      body.hosts === undefined ? events[idx].hosts || [] : normalizeHosts(body.hosts),
      memberContext.memberName
    );
    const updated = {
      ...events[idx],
      title: body.title === undefined ? events[idx].title : String(body.title).trim(),
      description: body.description === undefined ? events[idx].description : String(body.description).trim(),
      location: body.location === undefined ? events[idx].location : String(body.location).trim(),
      date: body.date === undefined ? events[idx].date : String(body.date).trim(),
      archived: body.archived === undefined ? events[idx].archived : Boolean(body.archived),
      hosts,
      sourceUrl: body.sourceUrl === undefined ? events[idx].sourceUrl || "" : String(body.sourceUrl).trim(),
      imageUrl: body.imageUrl === undefined ? events[idx].imageUrl || "" : String(body.imageUrl).trim()
    };
    if (!updated.title || !updated.date) return sendJson(res, 400, { error: "Titel und Datum sind Pflicht" });
    events[idx] = normalizeEventRow(updated);
    await writeData(EVENTS_FILE, events);
    return sendJson(res, 200, events[idx]);
  }

  if (pathname.startsWith("/api/member/events/") && req.method === "DELETE") {
    const memberContext = await requireMemberContext(req, res, { url });
    if (!memberContext) return;
    const id = pathname.split("/").pop();
    const events = await readData(EVENTS_FILE);
    const row = events.find((e) => e.id === id);
    if (!row) return sendJson(res, 404, { error: "Termin nicht gefunden" });
    if (!includesMember(row.hosts, memberContext.memberName)) return sendJson(res, 403, { error: "Kein Zugriff" });
    const next = events.filter((e) => e.id !== id);
    await appendDeletedItem({
      entityType: "event",
      entityId: id,
      actor: buildActorPayloadFromMemberContext(memberContext),
      snapshot: normalizeEventRow(row),
      label: summarizeDeletedEntity("event", row)
    });
    await writeData(EVENTS_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/member/initiatives") {
    const memberContext = await requireMemberContext(req, res, { url });
    if (!memberContext) return;
    const initiatives = (await readData(INITIATIVES_FILE)).map(normalizeInitiativeRow);
    const own = initiatives.filter((i) => includesMember(i.hosts, memberContext.memberName));
    return sendJson(res, 200, own);
  }

  if (req.method === "POST" && pathname === "/api/member/initiatives") {
    const body = await readJsonBody(req);
    const memberContext = await requireMemberContext(req, res, { url, body });
    if (!memberContext) return;
    const hosts = ensureMemberHost(normalizeHosts(body.hosts), memberContext.memberName);
    const newItem = {
      id: makeId("in"),
      title: String(body.title || "").trim(),
      description: String(body.description || "").trim(),
      status: String(body.status || "aktiv").trim(),
      archived: normalizeArchived(body.archived),
      hosts,
      sourceUrl: String(body.sourceUrl || "").trim(),
      imageUrl: String(body.imageUrl || "").trim()
    };
    if (!newItem.title) return sendJson(res, 400, { error: "Titel ist Pflicht" });
    const initiatives = await readData(INITIATIVES_FILE);
    initiatives.push(normalizeInitiativeRow(newItem));
    await writeData(INITIATIVES_FILE, initiatives);
    return sendJson(res, 201, normalizeInitiativeRow(newItem));
  }

  if (pathname.startsWith("/api/member/initiatives/") && req.method === "PUT") {
    const id = pathname.split("/").pop();
    const body = await readJsonBody(req);
    const memberContext = await requireMemberContext(req, res, { url, body });
    if (!memberContext) return;
    const initiatives = (await readData(INITIATIVES_FILE)).map(normalizeInitiativeRow);
    const idx = initiatives.findIndex((i) => i.id === id);
    if (idx < 0) return sendJson(res, 404, { error: "Initiative nicht gefunden" });
    if (!includesMember(initiatives[idx].hosts, memberContext.memberName)) return sendJson(res, 403, { error: "Kein Zugriff" });
    const hosts = ensureMemberHost(
      body.hosts === undefined ? initiatives[idx].hosts || [] : normalizeHosts(body.hosts),
      memberContext.memberName
    );
    const updated = {
      ...initiatives[idx],
      title: body.title === undefined ? initiatives[idx].title : String(body.title).trim(),
      description: body.description === undefined ? initiatives[idx].description : String(body.description).trim(),
      status: body.status === undefined ? initiatives[idx].status : String(body.status).trim(),
      archived: body.archived === undefined ? initiatives[idx].archived : normalizeArchived(body.archived),
      hosts,
      sourceUrl: body.sourceUrl === undefined ? initiatives[idx].sourceUrl || "" : String(body.sourceUrl).trim(),
      imageUrl: body.imageUrl === undefined ? initiatives[idx].imageUrl || "" : String(body.imageUrl).trim()
    };
    if (!updated.title) return sendJson(res, 400, { error: "Titel ist Pflicht" });
    initiatives[idx] = normalizeInitiativeRow(updated);
    await writeData(INITIATIVES_FILE, initiatives);
    return sendJson(res, 200, initiatives[idx]);
  }

  if (pathname.startsWith("/api/member/initiatives/") && req.method === "DELETE") {
    const memberContext = await requireMemberContext(req, res, { url });
    if (!memberContext) return;
    const id = pathname.split("/").pop();
    const initiatives = await readData(INITIATIVES_FILE);
    const row = initiatives.find((i) => i.id === id);
    if (!row) return sendJson(res, 404, { error: "Initiative nicht gefunden" });
    if (!includesMember(row.hosts, memberContext.memberName)) return sendJson(res, 403, { error: "Kein Zugriff" });
    const next = initiatives.filter((i) => i.id !== id);
    await appendDeletedItem({
      entityType: "initiative",
      entityId: id,
      actor: buildActorPayloadFromMemberContext(memberContext),
      snapshot: normalizeInitiativeRow(row),
      label: summarizeDeletedEntity("initiative", row)
    });
    await writeData(INITIATIVES_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/questions" && req.method === "POST") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const newItem = {
      id: makeId("q"),
      text: String(body.text || "").trim(),
      authors: normalizeAuthors(body.authors),
      authorStatus: normalizeQuestionAuthorStatus(body.authorStatus),
      authorHint: String(body.authorHint || "").trim(),
      createdAt: normalizeCreatedAt(body.createdAt),
      location: String(body.location || "").trim(),
      sourceLabel: String(body.sourceLabel || "").trim(),
      archived: normalizeArchived(body.archived)
    };
    if (!newItem.text) return sendJson(res, 400, { error: "Fragetext fehlt" });
    if (newItem.authors.length === 0 && !questionAllowsEmptyAuthors(newItem)) newItem.authors = ["Anonym"];

    const questions = await readData(QUESTIONS_FILE);
    questions.push(normalizeQuestionRow(newItem));
    await writeData(QUESTIONS_FILE, questions);
    return sendJson(res, 201, normalizeQuestionRow(newItem));
  }

  if (pathname === "/api/people" && req.method === "POST") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const name = String(body.name || "").trim();
    const role = String(body.role || "").trim();
    const bio = String(body.bio || "").trim();
    const portraitUrl = String(body.portraitUrl || "").trim();
    const links = normalizeLinks(body.links);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const slug = String(body.slug || slugify(name)).trim();
    if (!name) return sendJson(res, 400, { error: "Name ist Pflicht" });

    const people = await readData(PEOPLE_FILE);
    const candidate = slug || makeId("member");
    const uniqueSlug = makeUniqueSlug(candidate, people.map((p) => String(p.slug || "")));
    const newItem = {
      name,
      role,
      slug: uniqueSlug,
      email,
      bio,
      portraitUrl,
      portraitFocusX: normalizePortraitFocus(body.portraitFocusX),
      portraitFocusY: normalizePortraitFocus(body.portraitFocusY),
      links,
      archived: normalizeArchived(body.archived)
    };
    const newAliases = normalizeLoginEmails(body.loginEmails).filter((entry) => entry !== normalizeEmailAddress(newItem.email));
    if (newAliases.length) newItem.loginEmails = newAliases;
    if (password) {
      newItem.passwordHash = createPasswordHash(password);
      newItem.mustChangePassword = false;
      newItem.initialPasswordSeeded = new Date().toISOString();
    } else if (email && !isPhilippMember(newItem)) {
      newItem.passwordHash = createPasswordHash(email);
      newItem.mustChangePassword = true;
      newItem.initialPasswordSeeded = new Date().toISOString();
    }
    people.push(normalizePersonRow(newItem));
    await writeData(PEOPLE_FILE, people);
    return sendJson(res, 201, sanitizePersonForClient(normalizePersonRow(newItem)));
  }

  if (pathname.startsWith("/api/questions/") && req.method === "PUT") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const id = pathname.split("/").pop();
    const body = await readJsonBody(req);
    const questions = (await readData(QUESTIONS_FILE)).map(normalizeQuestionRow);
    const idx = questions.findIndex((q) => q.id === id);
    if (idx < 0) return sendJson(res, 404, { error: "Frage nicht gefunden" });

    const updated = {
      ...questions[idx],
      text: String(body.text ?? questions[idx].text).trim(),
      authors: body.authors === undefined ? questions[idx].authors : normalizeAuthors(body.authors),
      authorStatus: body.authorStatus === undefined ? questions[idx].authorStatus : normalizeQuestionAuthorStatus(body.authorStatus),
      authorHint: body.authorHint === undefined ? questions[idx].authorHint || "" : String(body.authorHint).trim(),
      createdAt: body.createdAt === undefined ? questions[idx].createdAt : normalizeCreatedAt(body.createdAt, questions[idx].createdAt),
      location: body.location === undefined ? questions[idx].location || "" : String(body.location).trim(),
      sourceLabel: body.sourceLabel === undefined ? questions[idx].sourceLabel || "" : String(body.sourceLabel).trim(),
      archived: body.archived === undefined ? questions[idx].archived : normalizeArchived(body.archived)
    };
    if (!updated.text) return sendJson(res, 400, { error: "Fragetext fehlt" });
    if (!updated.authors.length && !questionAllowsEmptyAuthors(updated)) updated.authors = ["Anonym"];

    questions[idx] = normalizeQuestionRow(updated);
    await writeData(QUESTIONS_FILE, questions);
    return sendJson(res, 200, questions[idx]);
  }

  if (pathname.startsWith("/api/people/") && req.method === "PUT") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const id = pathname.split("/").pop();
    const body = await readJsonBody(req);
    const people = (await readData(PEOPLE_FILE)).map(normalizePersonRow);
    const idx = people.findIndex((p) => String(p.slug || "") === id);
    if (idx < 0) return sendJson(res, 404, { error: "Mitglied nicht gefunden" });

    const updated = {
      ...people[idx],
      name: body.name === undefined ? people[idx].name : String(body.name).trim(),
      role: body.role === undefined ? people[idx].role || "" : String(body.role).trim(),
      email: body.email === undefined ? people[idx].email || "" : String(body.email).trim().toLowerCase(),
      bio: body.bio === undefined ? people[idx].bio || "" : String(body.bio).trim(),
      portraitUrl: body.portraitUrl === undefined ? people[idx].portraitUrl || "" : String(body.portraitUrl).trim(),
      portraitFocusX: body.portraitFocusX === undefined ? normalizePortraitFocus(people[idx].portraitFocusX) : normalizePortraitFocus(body.portraitFocusX),
      portraitFocusY: body.portraitFocusY === undefined ? normalizePortraitFocus(people[idx].portraitFocusY) : normalizePortraitFocus(body.portraitFocusY),
      links: body.links === undefined ? normalizeLinks(people[idx].links || []) : normalizeLinks(body.links),
      archived: body.archived === undefined ? people[idx].archived : normalizeArchived(body.archived)
    };
    const nextAliases = normalizeLoginEmails(
      body.loginEmails === undefined ? updated.loginEmails : body.loginEmails
    ).filter((entry) => entry !== normalizeEmailAddress(updated.email));
    if (nextAliases.length) updated.loginEmails = nextAliases;
    else delete updated.loginEmails;
    if (!updated.name) return sendJson(res, 400, { error: "Name ist Pflicht" });

    if (body.slug !== undefined) {
      const requested = String(body.slug || "").trim() || slugify(updated.name);
      const others = people.filter((_, i) => i !== idx).map((p) => String(p.slug || ""));
      updated.slug = makeUniqueSlug(requested, others);
    }
    if (body.password !== undefined && String(body.password || "").trim()) {
      updated.passwordHash = createPasswordHash(String(body.password || ""));
      updated.mustChangePassword = false;
      updated.initialPasswordSeeded = updated.initialPasswordSeeded || new Date().toISOString();
    }

    people[idx] = normalizePersonRow(updated);
    await writeData(PEOPLE_FILE, people);
    return sendJson(res, 200, sanitizePersonForClient(people[idx]));
  }

  if (pathname.startsWith("/api/questions/") && req.method === "DELETE") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const id = pathname.split("/").pop();
    const questions = await readData(QUESTIONS_FILE);
    const row = questions.find((q) => q.id === id);
    if (!row) return sendJson(res, 404, { error: "Frage nicht gefunden" });
    const next = questions.filter((q) => q.id !== id);
    await appendDeletedItem({
      entityType: "question",
      entityId: id,
      actor: buildActorPayloadFromSession(session),
      snapshot: normalizeQuestionRow(row),
      label: summarizeDeletedEntity("question", row)
    });
    await writeData(QUESTIONS_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/public/questions" && req.method === "POST") {
    const body = await readJsonBody(req);
    const text = String(body.text || "").trim();
    if (!text) return sendJson(res, 400, { error: "Fragetext fehlt" });
    const author = String(body.author || "").trim();
    const createdAt = normalizeCreatedAt(body.createdAt);
    const location = String(body.location || "").trim();
    const newItem = {
      id: makeId("q"),
      text,
      authors: author ? [author] : ["Anonym"],
      createdAt,
      location,
      archived: false
    };
    const questions = await readData(QUESTIONS_FILE);
    questions.push(normalizeQuestionRow(newItem));
    await writeData(QUESTIONS_FILE, questions);
    return sendJson(res, 201, normalizeQuestionRow(newItem));
  }

  if (req.method === "PUT" && pathname === "/api/site-settings") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const current = normalizeSiteSettings(await readData(SITE_SETTINGS_FILE));
    const next = normalizeSiteSettings({
      ...current,
      publicCommentingEnabled:
        body.publicCommentingEnabled === undefined ? current.publicCommentingEnabled : body.publicCommentingEnabled
    });
    await writeData(SITE_SETTINGS_FILE, next);
    return sendJson(res, 200, next);
  }

  if (pathname.startsWith("/api/people/") && req.method === "DELETE") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const id = pathname.split("/").pop();
    const people = await readData(PEOPLE_FILE);
    const row = people.find((p) => String(p.slug || "") === id);
    if (!row) return sendJson(res, 404, { error: "Mitglied nicht gefunden" });
    const next = people.filter((p) => String(p.slug || "") !== id);
    await appendDeletedItem({
      entityType: "person",
      entityId: id,
      actor: buildActorPayloadFromSession(session),
      snapshot: normalizePersonRow(row),
      label: summarizeDeletedEntity("person", row)
    });
    await writeData(PEOPLE_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/events" && req.method === "POST") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const newItem = {
      id: makeId("ev"),
      title: String(body.title || "").trim(),
      description: String(body.description || "").trim(),
      location: String(body.location || "").trim(),
      date: String(body.date || "").trim(),
      archived: Boolean(body.archived),
      hosts: normalizeHosts(body.hosts),
      sourceUrl: String(body.sourceUrl || "").trim(),
      imageUrl: String(body.imageUrl || "").trim()
    };
    if (!newItem.title || !newItem.date) return sendJson(res, 400, { error: "Titel und Datum sind Pflicht" });

    const events = await readData(EVENTS_FILE);
    events.push(normalizeEventRow(newItem));
    await writeData(EVENTS_FILE, events);
    return sendJson(res, 201, normalizeEventRow(newItem));
  }

  if (pathname.startsWith("/api/events/") && req.method === "PUT") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const id = pathname.split("/").pop();
    const body = await readJsonBody(req);
    const events = (await readData(EVENTS_FILE)).map(normalizeEventRow);
    const idx = events.findIndex((e) => e.id === id);
    if (idx < 0) return sendJson(res, 404, { error: "Termin nicht gefunden" });

    const updated = {
      ...events[idx],
      title: body.title === undefined ? events[idx].title : String(body.title).trim(),
      description: body.description === undefined ? events[idx].description : String(body.description).trim(),
      location: body.location === undefined ? events[idx].location : String(body.location).trim(),
      date: body.date === undefined ? events[idx].date : String(body.date).trim(),
      archived: body.archived === undefined ? events[idx].archived : Boolean(body.archived),
      hosts: body.hosts === undefined ? events[idx].hosts || [] : normalizeHosts(body.hosts),
      sourceUrl: body.sourceUrl === undefined ? events[idx].sourceUrl || "" : String(body.sourceUrl).trim(),
      imageUrl: body.imageUrl === undefined ? events[idx].imageUrl || "" : String(body.imageUrl).trim()
    };
    if (!updated.title || !updated.date) return sendJson(res, 400, { error: "Titel und Datum sind Pflicht" });

    events[idx] = normalizeEventRow(updated);
    await writeData(EVENTS_FILE, events);
    return sendJson(res, 200, events[idx]);
  }

  if (pathname.startsWith("/api/events/") && req.method === "DELETE") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const id = pathname.split("/").pop();
    const events = await readData(EVENTS_FILE);
    const row = events.find((e) => e.id === id);
    if (!row) return sendJson(res, 404, { error: "Termin nicht gefunden" });
    const next = events.filter((e) => e.id !== id);
    await appendDeletedItem({
      entityType: "event",
      entityId: id,
      actor: buildActorPayloadFromSession(session),
      snapshot: normalizeEventRow(row),
      label: summarizeDeletedEntity("event", row)
    });
    await writeData(EVENTS_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/initiatives" && req.method === "POST") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const body = await readJsonBody(req);
    const newItem = {
      id: makeId("in"),
      title: String(body.title || "").trim(),
      description: String(body.description || "").trim(),
      status: String(body.status || "aktiv").trim(),
      archived: normalizeArchived(body.archived),
      hosts: normalizeHosts(body.hosts),
      sourceUrl: String(body.sourceUrl || "").trim(),
      imageUrl: String(body.imageUrl || "").trim()
    };
    if (!newItem.title) return sendJson(res, 400, { error: "Titel ist Pflicht" });

    const initiatives = await readData(INITIATIVES_FILE);
    initiatives.push(normalizeInitiativeRow(newItem));
    await writeData(INITIATIVES_FILE, initiatives);
    return sendJson(res, 201, normalizeInitiativeRow(newItem));
  }

  if (pathname.startsWith("/api/initiatives/") && req.method === "PUT") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const id = pathname.split("/").pop();
    const body = await readJsonBody(req);
    const initiatives = (await readData(INITIATIVES_FILE)).map(normalizeInitiativeRow);
    const idx = initiatives.findIndex((i) => i.id === id);
    if (idx < 0) return sendJson(res, 404, { error: "Initiative nicht gefunden" });

    const updated = {
      ...initiatives[idx],
      title: body.title === undefined ? initiatives[idx].title : String(body.title).trim(),
      description: body.description === undefined ? initiatives[idx].description : String(body.description).trim(),
      status: body.status === undefined ? initiatives[idx].status : String(body.status).trim(),
      archived: body.archived === undefined ? initiatives[idx].archived : normalizeArchived(body.archived),
      hosts: body.hosts === undefined ? initiatives[idx].hosts || [] : normalizeHosts(body.hosts),
      sourceUrl: body.sourceUrl === undefined ? initiatives[idx].sourceUrl || "" : String(body.sourceUrl).trim(),
      imageUrl: body.imageUrl === undefined ? initiatives[idx].imageUrl || "" : String(body.imageUrl).trim()
    };
    if (!updated.title) return sendJson(res, 400, { error: "Titel ist Pflicht" });

    initiatives[idx] = normalizeInitiativeRow(updated);
    await writeData(INITIATIVES_FILE, initiatives);
    return sendJson(res, 200, initiatives[idx]);
  }

  if (pathname.startsWith("/api/initiatives/") && req.method === "DELETE") {
    const session = requireEditorSession(req, res);
    if (!session) return;
    const id = pathname.split("/").pop();
    const initiatives = await readData(INITIATIVES_FILE);
    const row = initiatives.find((i) => i.id === id);
    if (!row) return sendJson(res, 404, { error: "Initiative nicht gefunden" });
    const next = initiatives.filter((i) => i.id !== id);
    await appendDeletedItem({
      entityType: "initiative",
      entityId: id,
      actor: buildActorPayloadFromSession(session),
      snapshot: normalizeInitiativeRow(row),
      label: summarizeDeletedEntity("initiative", row)
    });
    await writeData(INITIATIVES_FILE, next);
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: "Not found" });
}

function requireSession(req, res) {
  const session = getCurrentSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Nicht eingeloggt" });
    return null;
  }
  const sid = getSessionId(req);
  if (session.role === "member") {
    const ttlMs = Number(session.ttlMs) || MEMBER_SESSION_TTL_MS;
    session.ttlMs = ttlMs;
    session.expiresAt = Date.now() + ttlMs;
    sessions.set(sid, session);
    persistSessions();
    setSessionCookie(res, sid);
  }
  return session;
}

function getCurrentSession(req) {
  cleanupExpiredSessions();
  const sid = getSessionId(req);
  if (!sid) return null;
  return sessions.get(sid) || null;
}

function requireEditorSession(req, res) {
  const session = requireSession(req, res);
  if (!session) return null;
  if (session.role !== "editor") {
    sendJson(res, 403, { error: "Nur Redaktion erlaubt" });
    return null;
  }
  return session;
}

async function requireMemberContext(req, res, options = {}) {
  const { url = null, body = null } = options;
  const session = requireSession(req, res);
  if (!session) return null;

  if (session.role === "member") {
  return {
    actorRole: "member",
    actorIdentity: String(session.memberName || ""),
      memberSlug: String(session.memberSlug || ""),
      memberName: String(session.memberName || ""),
      mustChangePassword: Boolean(session.mustChangePassword)
    };
  }

  if (session.role !== "editor") {
    sendJson(res, 403, { error: "Nur Mitglied oder Redaktion erlaubt" });
    return null;
  }

  const fromQuery = url ? String(url.searchParams.get("asMember") || "").trim() : "";
  const fromBody = body && body.asMember !== undefined ? String(body.asMember || "").trim() : "";
  const asMember = fromBody || fromQuery;
  if (!asMember) {
    sendJson(res, 400, { error: "Bitte Mitgliedsauswahl setzen (asMember)." });
    return null;
  }

  const people = await readData(PEOPLE_FILE);
  const member = people.find((person) => String(person.slug || "") === asMember);
  if (!member) {
    sendJson(res, 404, { error: "Mitglied nicht gefunden" });
    return null;
  }

  return {
    actorRole: "editor",
    actorIdentity: String(session.username || ""),
    memberSlug: String(member.slug || ""),
    memberName: String(member.name || ""),
    mustChangePassword: Boolean(member.mustChangePassword)
  };
}

function createSession(payload) {
  const id = crypto.randomBytes(24).toString("hex");
  const ttlMs = getSessionTtlMs(payload && payload.role);
  sessions.set(id, {
    ...payload,
    ttlMs,
    expiresAt: Date.now() + ttlMs
  });
  persistSessions();
  return id;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  let changed = false;
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
      changed = true;
    }
  }
  if (changed) persistSessions();
}

function setSessionCookie(res, sid) {
  const session = sid ? sessions.get(sid) : null;
  const ttlMs = session ? Number(session.ttlMs) || getSessionTtlMs(session.role) : EDITOR_SESSION_TTL_MS;
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(ttlMs / 1000)}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function getSessionId(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  const parts = cookie.split(";").map((part) => part.trim());
  const entry = parts.find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return null;
  return entry.slice(COOKIE_NAME.length + 1);
}

async function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) return sendText(res, 403, "Forbidden");

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return sendText(res, 403, "Forbidden");
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    if (ext === ".html") {
      const raw = await fs.readFile(filePath, "utf-8");
      const data = Buffer.from(injectThemeAssets(raw), "utf-8");
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
      });
      res.end(data);
      return;
    }
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function serveUploadedFile(res, pathname) {
  const rel = pathname.slice("/uploads/".length).trim();
  if (!rel) return sendText(res, 404, "Not found");
  const filePath = path.resolve(UPLOADS_DIR, rel);
  if (!filePath.startsWith(`${UPLOADS_DIR}${path.sep}`) && filePath !== UPLOADS_DIR) {
    return sendText(res, 403, "Forbidden");
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return sendText(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function injectThemeAssets(html) {
  let out = String(html || "");
  const prelude = '<script>try{const p=localStorage.getItem("ps_theme_preference_v2");const l=localStorage.getItem("ps_theme_invert_v1");const pref=(p==="light"||p==="dark"||p==="auto")?p:(l==="1"?"dark":(l==="0"?"light":"auto"));const dark=pref==="dark"||(pref==="auto"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)document.documentElement.classList.add("theme-invert");const qs=new URLSearchParams(window.location.search);const qf=String(qs.get("font")||"").toLowerCase();const sf=String(localStorage.getItem("ps_font_mode_v1")||"").toLowerCase();const f=(qf==="proxima"||qf==="inclusive")?qf:((sf==="proxima"||sf==="inclusive")?sf:"inclusive");document.documentElement.classList.toggle("font-inclusive",f==="inclusive");document.documentElement.classList.toggle("font-proxima",f==="proxima");if(qf==="proxima"||qf==="inclusive")localStorage.setItem("ps_font_mode_v1",f);}catch{}</script>';
  const loader = '<script src="/theme-toggle.js"></script>';

  if (!out.includes("ps_theme_preference_v2")) {
    if (out.includes("</head>")) out = out.replace("</head>", `    ${prelude}\n  </head>`);
    else out = `${prelude}\n${out}`;
  }

  if (!out.includes("theme-toggle.js")) {
    if (out.includes("</body>")) out = out.replace("</body>", `    ${loader}\n  </body>`);
    else out = `${out}\n${loader}`;
  }

  return out;
}

function resolveDataDir() {
  const fromEnv = String(process.env.PUBLIC_SECRETE_DATA_DIR || "").trim();
  if (fromEnv) return path.resolve(fromEnv);

  if (process.env.RENDER) {
    const candidates = [
      "/opt/render/project/src/public-secrets/data",
      "/app/data"
    ];
    for (const candidate of candidates) {
      try {
        if (fsSync.existsSync(candidate)) return candidate;
      } catch {
        // ignore path access errors and continue with next candidate
      }
    }
    return "/app/data";
  }

  return path.join(ROOT, "data");
}

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await ensureJsonFile(QUESTIONS_FILE, []);
  await ensureJsonFile(EVENTS_FILE, [
    {
      id: "ev-001",
      title: "Wahrnehmungsorgan - Offenes Gespraech",
      description: "Gesprächsabend mit Fragen aus dem Ensemble.",
      location: "Basel",
      date: "2026-03-10",
      archived: false
    }
  ]);
  await ensureJsonFile(INITIATIVES_FILE, []);
  await ensureJsonFile(PEOPLE_FILE, []);
  await ensureJsonFile(COMMENTS_FILE, []);
  await ensureJsonFile(TOKENS_FILE, []);
  await ensureJsonFile(OUTBOX_FILE, []);
  await ensureJsonFile(SITE_SETTINGS_FILE, normalizeSiteSettings({}));
  await ensureJsonFile(DELETED_ITEMS_FILE, []);
  await ensureJsonFile(SESSIONS_FILE, []);
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch {
    await writeData(filePath, fallback);
  }
}

async function migratePeopleData() {
  const people = await readData(PEOPLE_FILE);
  if (!Array.isArray(people) || people.length === 0) return;
  const portraitMap = await buildLocalPortraitMap();
  let changed = false;
  const next = people.map((row) => {
    const item = { ...(row || {}) };
    const loginEmails = normalizeLoginEmails(item.loginEmails);
    const primaryEmail = normalizeEmailAddress(item.email);
    const filteredAliases = loginEmails.filter((email) => email !== primaryEmail);
    if (JSON.stringify(loginEmails) !== JSON.stringify(filteredAliases)) changed = true;
    if (filteredAliases.length) item.loginEmails = filteredAliases;
    else if (Object.prototype.hasOwnProperty.call(item, "loginEmails")) {
      delete item.loginEmails;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(item, "bioShort")) {
      delete item.bioShort;
      changed = true;
    }
    const slug = String(item.slug || "").trim();
    const localPortrait = portraitMap.get(slug);
    if (localPortrait && String(item.portraitUrl || "").trim() !== localPortrait) {
      item.portraitUrl = localPortrait;
      changed = true;
    }
    const fx = normalizePortraitFocus(item.portraitFocusX);
    const fy = normalizePortraitFocus(item.portraitFocusY);
    if (Number(item.portraitFocusX) !== fx) {
      item.portraitFocusX = fx;
      changed = true;
    }
    if (Number(item.portraitFocusY) !== fy) {
      item.portraitFocusY = fy;
      changed = true;
    }
    return item;
  });
  if (changed) await writeData(PEOPLE_FILE, next);
}

async function migrateArchivedContent() {
  let changedQuestions = false;
  const questions = (await readData(QUESTIONS_FILE)).map((row) => {
    const next = normalizeQuestionRow(row);
    if (row && row.archived !== next.archived) changedQuestions = true;
    return next;
  });
  if (changedQuestions) await writeData(QUESTIONS_FILE, questions);

  let changedEvents = false;
  const events = (await readData(EVENTS_FILE)).map((row) => {
    const next = normalizeEventRow(row);
    if (row && row.archived !== next.archived) changedEvents = true;
    return next;
  });
  if (changedEvents) await writeData(EVENTS_FILE, events);

  let changedInitiatives = false;
  const initiatives = (await readData(INITIATIVES_FILE)).map((row) => {
    const next = normalizeInitiativeRow(row);
    if (row && row.archived !== next.archived) changedInitiatives = true;
    return next;
  });
  if (changedInitiatives) await writeData(INITIATIVES_FILE, initiatives);

  let changedPeople = false;
  const people = (await readData(PEOPLE_FILE)).map((row) => {
    const next = normalizePersonRow(row);
    if (row && row.archived !== next.archived) changedPeople = true;
    return next;
  });
  if (changedPeople) await writeData(PEOPLE_FILE, people);
}

async function ensureInitialMemberPasswords() {
  const people = await readData(PEOPLE_FILE);
  if (!Array.isArray(people) || people.length === 0) return;
  const nowIso = new Date().toISOString();
  let changed = false;
  const next = people.map((row) => {
    const item = { ...(row || {}) };
    const email = getPrimaryLoginEmail(item);
    if (isPhilippMember(item)) {
      if (item.mustChangePassword === true) {
        item.mustChangePassword = false;
        changed = true;
      }
      return item;
    }
    if (!email) return item;
    if (!item.initialPasswordSeeded) {
      item.passwordHash = createPasswordHash(email);
      item.mustChangePassword = true;
      item.initialPasswordSeeded = nowIso;
      changed = true;
      return item;
    }
    if (item.mustChangePassword === undefined || item.mustChangePassword === null) {
      item.mustChangePassword = false;
      changed = true;
    }
    return item;
  });
  if (changed) await writeData(PEOPLE_FILE, next);
}

async function buildLocalPortraitMap() {
  const map = new Map();
  const dir = path.join(ROOT, "assets", "portraits");
  let files = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return map;
  }
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!ext || ![".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"].includes(ext)) continue;
    const slug = path.basename(file, ext).toLowerCase();
    if (!slug) continue;
    map.set(slug, `/assets/portraits/${file}`);
  }
  return map;
}

async function readData(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function writeData(filePath, value) {
  const body = JSON.stringify(value, null, 2) + "\n";
  await fs.writeFile(filePath, body, "utf-8");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw createHttpError(400, "Ungueltiges JSON");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function normalizeAuthors(input) {
  if (Array.isArray(input)) {
    return input.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeHosts(input) {
  return normalizeAuthors(input);
}

function normalizeArchived(value) {
  return value === true;
}

function normalizeQuestionRow(input) {
  return {
    ...(input || {}),
    id: String((input && input.id) || makeId("q")),
    text: String((input && input.text) || "").trim(),
    authors: normalizeAuthors(input && input.authors),
    authorStatus: normalizeQuestionAuthorStatus(input && input.authorStatus),
    authorHint: String((input && input.authorHint) || "").trim(),
    createdAt: normalizeCreatedAt(input && input.createdAt),
    location: String((input && input.location) || "").trim(),
    sourceLabel: String((input && input.sourceLabel) || "").trim(),
    archived: normalizeArchived(input && input.archived)
  };
}

function normalizeQuestionAuthorStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "external") return "external";
  if (normalized === "unresolved") return "unresolved";
  return "resolved";
}

function questionAllowsEmptyAuthors(input) {
  return normalizeQuestionAuthorStatus(input && input.authorStatus) === "unresolved";
}

function normalizeEventRow(input) {
  return {
    ...(input || {}),
    id: String((input && input.id) || makeId("ev")),
    title: String((input && input.title) || "").trim(),
    description: String((input && input.description) || "").trim(),
    location: String((input && input.location) || "").trim(),
    date: String((input && input.date) || "").trim(),
    archived: normalizeArchived(input && input.archived),
    hosts: normalizeHosts(input && input.hosts),
    sourceUrl: String((input && input.sourceUrl) || "").trim(),
    imageUrl: String((input && input.imageUrl) || "").trim()
  };
}

function normalizeInitiativeRow(input) {
  return {
    ...(input || {}),
    id: String((input && input.id) || makeId("in")),
    title: String((input && input.title) || "").trim(),
    description: String((input && input.description) || "").trim(),
    status: String((input && input.status) || "aktiv").trim(),
    archived: normalizeArchived(input && input.archived),
    hosts: normalizeHosts(input && input.hosts),
    sourceUrl: String((input && input.sourceUrl) || "").trim(),
    imageUrl: String((input && input.imageUrl) || "").trim(),
    category: String((input && input.category) || "").trim()
  };
}

function normalizePersonRow(input) {
  return {
    ...(input || {}),
    name: String((input && input.name) || "").trim(),
    slug: String((input && input.slug) || "").trim(),
    email: normalizeEmailAddress(input && input.email),
    role: String((input && input.role) || "").trim(),
    bio: String((input && input.bio) || "").trim(),
    portraitUrl: String((input && input.portraitUrl) || "").trim(),
    portraitFocusX: normalizePortraitFocus(input && input.portraitFocusX),
    portraitFocusY: normalizePortraitFocus(input && input.portraitFocusY),
    links: normalizeLinks(input && input.links),
    archived: normalizeArchived(input && input.archived)
  };
}

function normalizeLinks(input) {
  if (Array.isArray(input)) {
    return input.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/\r?\n|,/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizePortraitFocus(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function sanitizePersonForClient(person) {
  const row = normalizePersonRow(person);
  delete row.passwordHash;
  delete row.loginEmails;
  delete row.mustChangePassword;
  delete row.initialPasswordSeeded;
  row.hasPassword = Boolean(person && person.passwordHash);
  row.portraitFocusX = normalizePortraitFocus(row.portraitFocusX);
  row.portraitFocusY = normalizePortraitFocus(row.portraitFocusY);
  return row;
}

function normalizeCreatedAt(input, fallback) {
  if (input === undefined || input === null || String(input).trim() === "") {
    return fallback || new Date().toISOString();
  }
  const date = new Date(String(input));
  if (Number.isNaN(date.getTime())) {
    return fallback || new Date().toISOString();
  }
  return date.toISOString();
}

function normalizeCommentRow(input) {
  const replies = Array.isArray(input.replies) ? input.replies.map(normalizeReplyRow) : [];
  replies.sort((a, b) => Date.parse(String(a.createdAt || "")) - Date.parse(String(b.createdAt || "")));
  return {
    id: String(input.id || makeId("cm")),
    questionId: String(input.questionId || "").trim(),
    browserId: String(input.browserId || "").trim(),
    rating: normalizeRating(input.rating),
    name: String(input.name || "").trim(),
    comment: String(input.comment || "").trim(),
    updatedAt: normalizeCreatedAt(input.updatedAt),
    visible: input.visible === false ? false : true,
    replies
  };
}

function normalizeRating(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.max(1, Math.min(5, Math.round(num)));
}

function normalizeSiteSettings(input) {
  return {
    publicCommentingEnabled: input && input.publicCommentingEnabled === false ? false : true
  };
}

function normalizeReplyRow(input) {
  return {
    id: String(input.id || makeId("rp")),
    browserId: String(input.browserId || "").trim(),
    name: String(input.name || "").trim(),
    text: String(input.text || "").trim(),
    createdAt: normalizeCreatedAt(input.createdAt),
    visible: input.visible === false ? false : true
  };
}

function normalizeDeletedItemRow(input) {
  return {
    id: String((input && input.id) || makeId("del")),
    entityType: String((input && input.entityType) || "").trim(),
    entityId: String((input && input.entityId) || "").trim(),
    label: String((input && input.label) || "").trim(),
    deletedAt: normalizeCreatedAt(input && input.deletedAt),
    actor: normalizeDeletedActor(input && input.actor),
    snapshot: input && input.snapshot ? input.snapshot : null,
    restoredAt: input && input.restoredAt ? normalizeCreatedAt(input.restoredAt) : "",
    restoredBy: normalizeDeletedActor(input && input.restoredBy),
    restoredEntityId: String((input && input.restoredEntityId) || "").trim()
  };
}

function normalizeDeletedActor(input) {
  return {
    role: String((input && input.role) || "").trim(),
    identity: String((input && input.identity) || "").trim(),
    memberSlug: String((input && input.memberSlug) || "").trim(),
    memberName: String((input && input.memberName) || "").trim()
  };
}

function sanitizeDeletedItemForClient(row) {
  const item = normalizeDeletedItemRow(row);
  if (item.entityType === "person" && item.snapshot) {
    item.snapshot = sanitizePersonForClient(item.snapshot);
  }
  return item;
}

async function requirePublicCommentPermission(req, res, options = {}) {
  const settings = normalizeSiteSettings(await readData(SITE_SETTINGS_FILE));
  if (settings.publicCommentingEnabled) return true;
  const session = getCurrentSession(req);
  if (session && (session.role === "member" || session.role === "editor")) return true;
  if (!String(options.commentText || "").trim()) return true;
  sendJson(res, 403, { error: "Kommentieren ist derzeit nur fuer Mitglieder freigeschaltet" });
  return false;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeEmailAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLoginEmails(input) {
  if (!Array.isArray(input)) return [];
  const unique = [];
  for (const entry of input) {
    const email = normalizeEmailAddress(entry);
    if (!email) continue;
    if (!unique.includes(email)) unique.push(email);
  }
  return unique;
}

function filterArchivedRows(rows, url, req, res) {
  const mode = String((url && url.searchParams.get("archived")) || "").trim().toLowerCase();
  const includeArchived = String((url && url.searchParams.get("includeArchived")) || "").trim().toLowerCase() === "true";
  const wantsAdminArchiveView = includeArchived || mode === "true" || mode === "all";
  if (wantsAdminArchiveView) {
    const session = requireEditorSession(req, res);
    if (!session) return null;
  }
  if (includeArchived || mode === "all") return rows;
  if (mode === "true") return rows.filter((row) => normalizeArchived(row && row.archived));
  return rows.filter((row) => !normalizeArchived(row && row.archived));
}

async function appendDeletedItem({ entityType, entityId, actor, snapshot, label }) {
  const rows = await readData(DELETED_ITEMS_FILE);
  rows.push(
    normalizeDeletedItemRow({
      id: makeId("del"),
      entityType,
      entityId,
      label,
      deletedAt: new Date().toISOString(),
      actor,
      snapshot
    })
  );
  await writeData(DELETED_ITEMS_FILE, rows.slice(-1000));
}

function buildActorPayloadFromSession(session) {
  return normalizeDeletedActor({
    role: String((session && session.role) || "").trim(),
    identity: String((session && (session.username || session.memberName)) || "").trim(),
    memberSlug: String((session && session.memberSlug) || "").trim(),
    memberName: String((session && session.memberName) || "").trim()
  });
}

function buildActorPayloadFromMemberContext(memberContext) {
  return normalizeDeletedActor({
    role: String((memberContext && memberContext.actorRole) || "").trim(),
    identity: String((memberContext && memberContext.actorIdentity) || "").trim(),
    memberSlug: String((memberContext && memberContext.memberSlug) || "").trim(),
    memberName: String((memberContext && memberContext.memberName) || "").trim()
  });
}

function summarizeDeletedEntity(type, row) {
  if (!row || typeof row !== "object") return String(type || "").trim();
  if (type === "question") return String(row.text || "").trim().slice(0, 160);
  if (type === "event") return String(row.title || "").trim().slice(0, 160);
  if (type === "initiative") return String(row.title || "").trim().slice(0, 160);
  if (type === "person") return String(row.name || "").trim().slice(0, 160);
  if (type === "comment") return String(row.comment || row.name || "Kommentar").trim().slice(0, 160);
  if (type === "reply") return String(row.text || row.name || "Antwort").trim().slice(0, 160);
  return String(row.title || row.name || row.text || row.id || type || "").trim().slice(0, 160);
}

async function restoreDeletedItem(item) {
  const type = String(item.entityType || "").trim();
  if (type === "question") return restoreQuestionSnapshot(item);
  if (type === "event") return restoreEventSnapshot(item);
  if (type === "initiative") return restoreInitiativeSnapshot(item);
  if (type === "person") return restorePersonSnapshot(item);
  throw createHttpError(400, "Dieser Eintragstyp kann noch nicht wiederhergestellt werden");
}

async function restoreQuestionSnapshot(item) {
  const snapshot = normalizeQuestionRow(item.snapshot || {});
  if (!snapshot.id) throw createHttpError(400, "Frage-Snapshot ist ungueltig");
  const questions = (await readData(QUESTIONS_FILE)).map(normalizeQuestionRow);
  if (questions.some((row) => String(row.id || "") === String(snapshot.id || ""))) {
    throw createHttpError(409, "Frage-ID existiert bereits");
  }
  questions.push(snapshot);
  await writeData(QUESTIONS_FILE, questions);
  return { restoredEntityId: snapshot.id };
}

async function restoreEventSnapshot(item) {
  const snapshot = normalizeEventRow(item.snapshot || {});
  if (!snapshot.id) throw createHttpError(400, "Termin-Snapshot ist ungueltig");
  const events = (await readData(EVENTS_FILE)).map(normalizeEventRow);
  if (events.some((row) => String(row.id || "") === String(snapshot.id || ""))) {
    throw createHttpError(409, "Termin-ID existiert bereits");
  }
  events.push(snapshot);
  await writeData(EVENTS_FILE, events);
  return { restoredEntityId: snapshot.id };
}

async function restoreInitiativeSnapshot(item) {
  const snapshot = normalizeInitiativeRow(item.snapshot || {});
  if (!snapshot.id) throw createHttpError(400, "Initiativen-Snapshot ist ungueltig");
  const initiatives = (await readData(INITIATIVES_FILE)).map(normalizeInitiativeRow);
  if (initiatives.some((row) => String(row.id || "") === String(snapshot.id || ""))) {
    throw createHttpError(409, "Initiativen-ID existiert bereits");
  }
  initiatives.push(snapshot);
  await writeData(INITIATIVES_FILE, initiatives);
  return { restoredEntityId: snapshot.id };
}

async function restorePersonSnapshot(item) {
  const snapshot = normalizePersonRow(item.snapshot || {});
  if (!snapshot.name) throw createHttpError(400, "Mitglieds-Snapshot ist ungueltig");
  const people = (await readData(PEOPLE_FILE)).map(normalizePersonRow);
  if (snapshot.slug && people.some((row) => String(row.slug || "") === String(snapshot.slug || ""))) {
    throw createHttpError(409, "Mitglieds-Slug existiert bereits");
  }
  if (snapshot.email && people.some((row) => normalizeEmailAddress(row.email) === normalizeEmailAddress(snapshot.email))) {
    throw createHttpError(409, "Mitglieds-E-Mail existiert bereits");
  }
  people.push(snapshot);
  await writeData(PEOPLE_FILE, people);
  return { restoredEntityId: snapshot.slug || snapshot.email || snapshot.name };
}

function collectLoginEmails(person) {
  const base = normalizeEmailAddress(person && person.email);
  const aliases = normalizeLoginEmails(person && person.loginEmails);
  const all = [];
  if (base) all.push(base);
  for (const alias of aliases) {
    if (!all.includes(alias)) all.push(alias);
  }
  return all;
}

function getPrimaryLoginEmail(person) {
  const emails = collectLoginEmails(person);
  return emails.length ? emails[0] : "";
}

function findPersonByLoginIdentity(people, identity) {
  const key = normalizeEmailAddress(identity);
  if (!key) return null;
  const direct = people.find((person) => collectLoginEmails(person).includes(key));
  if (direct) return direct;
  const aliasSlug = String(LOGIN_IDENTITY_ALIASES[key] || "").trim();
  if (!aliasSlug) return null;
  return people.find((person) => String(person.slug || "") === aliasSlug) || null;
}

function isPhilippMember(person) {
  const email = String((person && person.email) || "").trim().toLowerCase();
  const slug = String((person && person.slug) || "").trim().toLowerCase();
  const name = normalizeName((person && person.name) || "");
  return email === "philipp@saetzerei.com" || slug === "philipp-tok" || name === "philipp tok";
}

function getSessionTtlMs(role) {
  return role === "member" ? MEMBER_SESSION_TTL_MS : EDITOR_SESSION_TTL_MS;
}

function loadPersistedSessions() {
  let rows = [];
  try {
    const raw = fsSync.readFileSync(SESSIONS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    rows = [];
  }
  sessions.clear();
  const now = Date.now();
  for (const row of rows) {
    const id = String((row && row.id) || "").trim();
    if (!id) continue;
    const role = String((row && row.role) || "").trim();
    const ttlMs = Number((row && row.ttlMs) || getSessionTtlMs(role));
    const expiresAt = Number((row && row.expiresAt) || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) continue;
    sessions.set(id, {
      role,
      username: String((row && row.username) || "").trim(),
      memberSlug: String((row && row.memberSlug) || "").trim(),
      memberName: String((row && row.memberName) || "").trim(),
      mustChangePassword: Boolean(row && row.mustChangePassword),
      ttlMs,
      expiresAt
    });
  }
}

function persistSessions() {
  const rows = [];
  for (const [id, session] of sessions.entries()) {
    rows.push({
      id,
      role: String(session.role || "").trim(),
      username: String(session.username || "").trim(),
      memberSlug: String(session.memberSlug || "").trim(),
      memberName: String(session.memberName || "").trim(),
      mustChangePassword: Boolean(session.mustChangePassword),
      ttlMs: Number(session.ttlMs) || getSessionTtlMs(session.role),
      expiresAt: Number(session.expiresAt) || 0
    });
  }
  try {
    fsSync.writeFileSync(SESSIONS_FILE, JSON.stringify(rows, null, 2) + "\n", "utf-8");
  } catch (error) {
    console.warn("Could not persist sessions:", error && error.message ? error.message : error);
  }
}

function includesMember(hosts, memberName) {
  const target = normalizeName(memberName);
  if (!target) return false;
  const list = Array.isArray(hosts) ? hosts : [];
  return list.some((h) => normalizeName(h) === target);
}

function ensureMemberHost(hosts, memberName) {
  const list = Array.isArray(hosts) ? hosts.map((h) => String(h).trim()).filter(Boolean) : [];
  if (!includesMember(list, memberName)) list.unshift(String(memberName || "").trim());
  return list.filter(Boolean);
}

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

function makeId(prefix) {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString("hex");
  return `${prefix}-${suffix}`;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeUniqueSlug(baseSlug, existingSlugs) {
  const cleaned = slugify(baseSlug) || "mitglied";
  const used = new Set(existingSlugs.map((s) => String(s || "")));
  if (!used.has(cleaned)) return cleaned;
  let n = 2;
  while (used.has(`${cleaned}-${n}`)) n += 1;
  return `${cleaned}-${n}`;
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `v1$${salt}$${hash}`;
}

function verifyPasswordHash(password, packed) {
  const raw = String(packed || "").trim();
  if (!raw) return false;
  const parts = raw.split("$");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const salt = parts[1];
  const expected = parts[2];
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function deliverMemberMagicLink(email, person, loginUrl) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const fromEmail = process.env.PUBLIC_SECRETE_FROM_EMAIL || "";
  const name = String(person.name || "Mitglied");
  let deliveryError = "";

  if (apiKey && fromEmail) {
    try {
      const payload = {
        from: fromEmail,
        to: [email],
        subject: "Dein Public Secrets Einmalzugang",
        html: `<p>Hallo ${escapeHtmlForEmail(name)},</p><p>hier ist dein Einmalzugang für Public Secrets:</p><p><a href=\"${loginUrl}\">${loginUrl}</a></p><p>Der Link ist 15 Minuten gültig und nur einmal nutzbar.</p>`,
        text: `Hallo ${name},\n\nhier ist dein Einmalzugang für Public Secrets:\n${loginUrl}\n\nDer Link ist 15 Minuten gültig und nur einmal nutzbar.`
      };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) return { mode: "email" };
      const raw = await res.text().catch(() => "");
      deliveryError = `resend_${res.status}${raw ? `: ${String(raw).slice(0, 300)}` : ""}`;
      console.warn("Resend delivery failed:", deliveryError);
    } catch (error) {
      deliveryError = String(error && error.message ? error.message : "unknown_send_error");
      console.warn("Resend delivery exception:", deliveryError);
    }
  } else {
    deliveryError = "resend_credentials_missing";
  }

  const outbox = await readData(OUTBOX_FILE);
  outbox.push({
    email,
    memberSlug: String(person.slug || ""),
    createdAt: new Date().toISOString(),
    loginUrl,
    deliveryError
  });
  await writeData(OUTBOX_FILE, outbox.slice(-200));
  return { mode: "outbox", error: deliveryError };
}

function escapeHtmlForEmail(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadEditors() {
  const fromEnv = process.env.PUBLIC_SECRETE_EDITORS;
  if (fromEnv) {
    try {
      const parsed = JSON.parse(fromEnv);
      if (Array.isArray(parsed) && parsed.every((u) => u && u.username && u.password)) {
        return parsed.map((u) => ({ username: String(u.username), password: String(u.password) }));
      }
    } catch {
      console.warn("PUBLIC_SECRETE_EDITORS could not be parsed. Falling back to default editor.");
    }
  }
  return [{ username: "philipp@saetzerei.com", password: "public-secrets-123" }];
}

function loadLoginIdentityAliases() {
  const defaults = {
    "philipp@anderzeit.com": "philipp-tok"
  };
  const out = { ...defaults };
  const fromEnv = String(process.env.PUBLIC_SECRETE_LOGIN_ALIASES || "").trim();
  if (!fromEnv) return out;
  try {
    const parsed = JSON.parse(fromEnv);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
    for (const [rawEmail, rawSlug] of Object.entries(parsed)) {
      const email = normalizeEmailAddress(rawEmail);
      const slug = String(rawSlug || "").trim();
      if (!email || !slug) continue;
      out[email] = slug;
    }
    return out;
  } catch {
    console.warn("PUBLIC_SECRETE_LOGIN_ALIASES could not be parsed. Using defaults.");
    return out;
  }
}

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function saveUploadedImage({ filename, contentType, dataBase64, target, memberSlug }) {
  const resolvedType = normalizeImageMimeType(contentType);
  if (!resolvedType) throw createHttpError(400, "Nur Bilddateien sind erlaubt");

  const base64Raw = String(dataBase64 || "").trim();
  const encoded = base64Raw.includes(",") ? base64Raw.split(",").pop() : base64Raw;
  if (!encoded) throw createHttpError(400, "Dateiinhalt fehlt");

  let data;
  try {
    data = Buffer.from(encoded, "base64");
  } catch {
    throw createHttpError(400, "Dateiinhalt ist ungültig");
  }
  if (!data.length) throw createHttpError(400, "Leere Datei");
  if (data.length > 8 * 1024 * 1024) throw createHttpError(413, "Datei ist zu groß (max. 8MB)");

  const ext = mimeToExt(resolvedType) || safeExtFromFilename(filename) || "jpg";
  const targetDir = normalizeUploadTarget(target);
  const baseName = slugify(path.parse(String(filename || "")).name) || slugify(memberSlug) || "upload";
  const uniqueName = `${baseName}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const writeDir = path.join(UPLOADS_DIR, targetDir);
  const writePath = path.join(writeDir, uniqueName);

  await fs.mkdir(writeDir, { recursive: true });
  await fs.writeFile(writePath, data);

  return { url: `/uploads/${targetDir}/${uniqueName}` };
}

function normalizeUploadTarget(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "profile" || clean === "initiative" || clean === "event") return clean;
  return "misc";
}

function normalizeImageMimeType(value) {
  const mime = String(value || "").trim().toLowerCase();
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp" || mime === "image/avif" || mime === "image/gif") {
    return mime;
  }
  return "";
}

function mimeToExt(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/avif") return "avif";
  if (mime === "image/gif") return "gif";
  return "";
}

function safeExtFromFilename(value) {
  const ext = path.extname(String(value || "")).toLowerCase().replace(/^\./, "");
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp" || ext === "avif" || ext === "gif") {
    return ext === "jpeg" ? "jpg" : ext;
  }
  return "";
}

process.on("uncaughtException", (err) => {
  if (err && err.status) {
    console.error(`HTTP ${err.status}: ${err.message}`);
    return;
  }
  console.error(err);
});
