#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "https://public-secrets.onrender.com";
const USERNAME = process.env.EDITOR_USERNAME || "philipp@saetzerei.com";
const PASSWORD = process.env.EDITOR_PASSWORD || "public-secrets-123";
const DATA_DIR = process.env.LOCAL_DATA_DIR || path.join(process.cwd(), "data");

function readJson(name) {
  const full = path.join(DATA_DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function qKey(q) {
  return [String(q.text || "").trim(), String(q.createdAt || "").trim(), String(q.location || "").trim()].join("||");
}

function eKey(e) {
  return [String(e.title || "").trim(), String(e.date || "").trim(), String(e.location || "").trim()].join("||");
}

function iKey(i) {
  return [String(i.title || "").trim(), String(i.status || "").trim()].join("||");
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { res, text, json };
}

async function main() {
  const localQuestions = readJson("questions");
  const localPeople = readJson("people");
  const localEvents = readJson("events");
  const localInitiatives = readJson("initiatives");
  const localComments = readJson("comments");

  const login = await jsonFetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD })
  });
  if (!login.res.ok) {
    throw new Error(`Login fehlgeschlagen (${login.res.status}): ${login.text.slice(0, 200)}`);
  }
  const cookie = login.res.headers.get("set-cookie");
  if (!cookie) throw new Error("Kein Session-Cookie erhalten.");

  const authed = async (method, route, body) => {
    const out = await jsonFetch(`${BASE_URL}${route}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!out.res.ok) {
      throw new Error(`${method} ${route} fehlgeschlagen (${out.res.status}): ${out.text.slice(0, 300)}`);
    }
    return out.json;
  };

  const get = async (route) => {
    const out = await jsonFetch(`${BASE_URL}${route}`);
    if (!out.res.ok) throw new Error(`GET ${route} fehlgeschlagen (${out.res.status})`);
    return Array.isArray(out.json) ? out.json : [];
  };

  const liveQuestions = await get("/api/questions");
  const qByKey = new Map(liveQuestions.map((q) => [qKey(q), q]));
  const localToLiveQuestionId = new Map();
  for (const q of localQuestions) {
    const payload = {
      text: String(q.text || "").trim(),
      authors: Array.isArray(q.authors) ? q.authors : [],
      createdAt: String(q.createdAt || "").trim(),
      location: String(q.location || "").trim()
    };
    const found = qByKey.get(qKey(q));
    const saved = found
      ? await authed("PUT", `/api/questions/${encodeURIComponent(found.id)}`, payload)
      : await authed("POST", "/api/questions", payload);
    localToLiveQuestionId.set(String(q.id || ""), String(saved.id || ""));
    qByKey.set(qKey(saved), saved);
  }

  const livePeople = await get("/api/people");
  const pBySlug = new Map(livePeople.map((p) => [String(p.slug || ""), p]));
  for (const p of localPeople) {
    const slug = String(p.slug || "").trim();
    const payload = {
      name: String(p.name || "").trim(),
      role: String(p.role || "").trim(),
      slug,
      email: String(p.email || "").trim(),
      bio: String(p.bio || "").trim(),
      portraitUrl: String(p.portraitUrl || "").trim(),
      links: Array.isArray(p.links) ? p.links : []
    };
    if (!payload.name) continue;
    if (slug && pBySlug.has(slug)) await authed("PUT", `/api/people/${encodeURIComponent(slug)}`, payload);
    else {
      const saved = await authed("POST", "/api/people", payload);
      pBySlug.set(String(saved.slug || ""), saved);
    }
  }

  const liveEvents = await get("/api/events");
  const evByKey = new Map(liveEvents.map((e) => [eKey(e), e]));
  for (const e of localEvents) {
    const payload = {
      title: String(e.title || "").trim(),
      description: String(e.description || "").trim(),
      location: String(e.location || "").trim(),
      date: String(e.date || "").trim(),
      archived: Boolean(e.archived),
      hosts: Array.isArray(e.hosts) ? e.hosts : [],
      sourceUrl: String(e.sourceUrl || "").trim()
    };
    if (!payload.title || !payload.date) continue;
    const found = evByKey.get(eKey(e));
    const saved = found
      ? await authed("PUT", `/api/events/${encodeURIComponent(found.id)}`, payload)
      : await authed("POST", "/api/events", payload);
    evByKey.set(eKey(saved), saved);
  }

  const liveInitiatives = await get("/api/initiatives");
  const inByKey = new Map(liveInitiatives.map((i) => [iKey(i), i]));
  for (const i of localInitiatives) {
    const payload = {
      title: String(i.title || "").trim(),
      description: String(i.description || "").trim(),
      status: String(i.status || "aktiv").trim(),
      hosts: Array.isArray(i.hosts) ? i.hosts : [],
      sourceUrl: String(i.sourceUrl || "").trim()
    };
    if (!payload.title) continue;
    const found = inByKey.get(iKey(i));
    const saved = found
      ? await authed("PUT", `/api/initiatives/${encodeURIComponent(found.id)}`, payload)
      : await authed("POST", "/api/initiatives", payload);
    inByKey.set(iKey(saved), saved);
  }

  for (let idx = 0; idx < localComments.length; idx += 1) {
    const c = localComments[idx] || {};
    const mappedQuestionId = localToLiveQuestionId.get(String(c.questionId || ""));
    if (!mappedQuestionId) continue;
    const browserId = String(c.browserId || `restored-browser-${idx}`);
    const payload = {
      questionId: mappedQuestionId,
      browserId,
      rating: Number(c.rating) > 0 ? 1 : 0,
      name: String(c.name || "").trim(),
      comment: String(c.comment || "").trim()
    };
    const hasMain = payload.rating > 0 || payload.comment || payload.name;
    const replies = Array.isArray(c.replies) ? c.replies : [];
    if (!hasMain && replies.length === 0) continue;
    const saved = await jsonFetch(`${BASE_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!saved.res.ok || !saved.json || !saved.json.id) continue;
    for (let r = 0; r < replies.length; r += 1) {
      const reply = replies[r] || {};
      const text = String(reply.text || "").trim();
      if (!text) continue;
      await jsonFetch(`${BASE_URL}/api/comments/${encodeURIComponent(saved.json.id)}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          name: String(reply.name || "").trim(),
          browserId: String(reply.browserId || `restored-reply-${idx}-${r}`)
        })
      });
    }
  }

  const [qCount, pCount, eCount, iCount, cCount] = await Promise.all([
    get("/api/questions").then((a) => a.length),
    get("/api/people").then((a) => a.length),
    get("/api/events").then((a) => a.length),
    get("/api/initiatives").then((a) => a.length),
    get("/api/comments").then((a) => a.length)
  ]);

  console.log(`Restore abgeschlossen.`);
  console.log(`questions=${qCount} people=${pCount} events=${eCount} initiatives=${iCount} comments=${cCount}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
