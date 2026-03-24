require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const crypto = require('crypto');
const path = require('path');

const app = express();
const db = new Database(process.env.DB_PATH || 'publicsecrets.db');
const resend = new Resend(process.env.RESEND_API_KEY);
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const FROM = process.env.FROM_EMAIL || 'hallo@publicsecrets.app';
const BASE = process.env.BASE_URL || 'http://localhost:3000';

db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    slug TEXT UNIQUE,
    password_hash TEXT,
    must_change_password INTEGER DEFAULT 0,
    bio TEXT DEFAULT '',
    role TEXT DEFAULT '',
    photo_url TEXT DEFAULT '',
    initiatives TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id),
    author_name TEXT DEFAULT 'Anonym',
    location TEXT DEFAULT '',
    source_label TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    user_id INTEGER REFERENCES users(id),
    author_name TEXT DEFAULT 'Anonym',
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS forwards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    from_name TEXT DEFAULT 'jemand',
    to_email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Serve existing portraits from parent assets folder
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

const auth = (req, res, next) => {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) {
    try { req.user = jwt.verify(h.slice(7), SECRET); } catch {}
  }
  next();
};
app.use(auth);
const must = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Anmeldung erforderlich' });

// ── Feed ───────────────────────────────────────────────────────────────────

app.get('/api/feed', (req, res) => {
  const rows = db.prepare(`
    SELECT q.id, q.text, q.location, q.created_at,
      COALESCE(u.username, q.author_name) as author,
      COALESCE(u.slug, '') as author_slug,
      COUNT(i.id) as interactions
    FROM questions q
    LEFT JOIN users u ON q.author_id = u.id
    LEFT JOIN interactions i ON q.id = i.question_id
    GROUP BY q.id
  `).all();

  const now = Date.now();
  const scored = rows.map(r => {
    const ageDays = (now - new Date(r.created_at).getTime()) / 86400000;
    r._score = Math.random() * (1 + r.interactions * 2) / (1 + ageDays * 0.05);
    return r;
  }).sort((a, b) => b._score - a._score);

  res.json(scored);
});

// ── Questions ──────────────────────────────────────────────────────────────

app.get('/api/questions', (req, res) => {
  const { sort = 'date' } = req.query;
  const order = { date: 'q.created_at DESC', interactions: 'interactions DESC', author: 'author ASC' }[sort] || 'q.created_at DESC';
  res.json(db.prepare(`
    SELECT q.id, q.text, q.location, q.created_at,
      COALESCE(u.username, q.author_name) as author,
      COALESCE(u.slug, '') as author_slug,
      COUNT(i.id) as interactions
    FROM questions q
    LEFT JOIN users u ON q.author_id = u.id
    LEFT JOIN interactions i ON q.id = i.question_id
    GROUP BY q.id ORDER BY ${order}
  `).all());
});

app.get('/api/questions/:id', (req, res) => {
  const q = db.prepare(`
    SELECT q.id, q.text, q.location, q.source_label, q.created_at,
      COALESCE(u.username, q.author_name) as author,
      COALESCE(u.slug, '') as author_slug,
      COUNT(i.id) as interactions
    FROM questions q
    LEFT JOIN users u ON q.author_id = u.id
    LEFT JOIN interactions i ON q.id = i.question_id
    WHERE q.id = ? GROUP BY q.id
  `).get(req.params.id);

  if (!q) return res.status(404).json({ error: 'Nicht gefunden' });

  if (req.user) {
    q.comments = db.prepare(`
      SELECT i.id, i.text, i.created_at,
        COALESCE(u.username, i.author_name) as author,
        COALESCE(u.slug, '') as author_slug
      FROM interactions i
      LEFT JOIN users u ON i.user_id = u.id
      WHERE i.question_id = ? ORDER BY i.created_at ASC
    `).all(req.params.id);
  }
  res.json(q);
});

app.post('/api/questions', auth, (req, res) => {
  const { text, author_name, location, to_email } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text fehlt' });

  const r = db.prepare(
    'INSERT INTO questions (text, author_id, author_name, location) VALUES (?, ?, ?, ?)'
  ).run(text.trim(), req.user?.id || null, author_name?.trim() || 'Anonym', location?.trim() || '');

  res.json({ id: r.lastInsertRowid });
});

app.post('/api/questions/:id/interact', auth, (req, res) => {
  const { text, author_name } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text fehlt' });
  if (!db.prepare('SELECT id FROM questions WHERE id=?').get(req.params.id))
    return res.status(404).json({ error: 'Frage nicht gefunden' });

  db.prepare('INSERT INTO interactions (question_id, user_id, author_name, text) VALUES (?, ?, ?, ?)')
    .run(req.params.id, req.user?.id || null, author_name?.trim() || 'Anonym', text.trim());
  res.json({ ok: true });
});

app.post('/api/questions/:id/forward', auth, async (req, res) => {
  const { to_email, from_name } = req.body;
  if (!to_email) return res.status(400).json({ error: 'E-Mail fehlt' });

  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Frage nicht gefunden' });

  db.prepare('INSERT INTO forwards (question_id, from_name, to_email) VALUES (?, ?, ?)')
    .run(req.params.id, from_name || req.user?.username || 'jemand', to_email);

  try {
    await resend.emails.send({
      from: FROM,
      to: to_email,
      subject: 'Eine Frage für dich — Public Secrets',
      html: `<div style="font-family:Georgia,serif;max-width:520px;margin:3em auto;line-height:1.7;color:#111">
        <p style="font-size:.85em;color:#777;font-family:sans-serif;letter-spacing:.05em">PUBLIC SECRETS</p>
        <p><em>${from_name || 'Jemand'}</em> stellt dir eine Frage:</p>
        <p style="font-size:1.4em;margin:1.5em 0;border-left:2px solid #111;padding-left:1em">${q.text}</p>
        <p><a href="${BASE}/#/q/${q.id}" style="color:#111">Zur Frage →</a></p>
      </div>`
    });
  } catch (e) { console.error('Mail-Fehler:', e.message); }

  res.json({ ok: true });
});

// ── Auth ───────────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  if (password.length < 8) return res.status(400).json({ error: 'Passwort mindestens 8 Zeichen' });

  try {
    const r = db.prepare(
      'INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)'
    ).run(email.trim().toLowerCase(), await bcrypt.hash(password, 10), username?.trim() || null);
    const user = { id: r.lastInsertRowid, email: email.toLowerCase(), username: username?.trim() || null };
    res.json({ token: jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '30d' }), user });
  } catch {
    res.status(409).json({ error: 'E-Mail oder Nutzername bereits vergeben' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email?.trim().toLowerCase());
  if (!u || !u.password_hash || !await bcrypt.compare(password, u.password_hash))
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });

  const user = { id: u.id, email: u.email, username: u.username, slug: u.slug };
  res.json({
    token: jwt.sign({ id: u.id, email: u.email }, SECRET, { expiresIn: '30d' }),
    user,
    must_change_password: !!u.must_change_password
  });
});

app.get('/api/auth/me', must, (req, res) => {
  const u = db.prepare('SELECT id, email, username, slug, bio, role, photo_url, initiatives FROM users WHERE id=?').get(req.user.id);
  res.json(u);
});

app.post('/api/auth/forgot', async (req, res) => {
  const { email } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email?.trim().toLowerCase());
  // Always return ok to prevent email enumeration
  if (!u) return res.json({ ok: true });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
  db.prepare('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(u.id, token, expires);

  try {
    await resend.emails.send({
      from: FROM,
      to: u.email,
      subject: 'Passwort zurücksetzen — Public Secrets',
      html: `<div style="font-family:Georgia,serif;max-width:520px;margin:3em auto;line-height:1.7;color:#111">
        <p style="font-size:.85em;color:#777;font-family:sans-serif;letter-spacing:.05em">PUBLIC SECRETS</p>
        <p>Klicke auf diesen Link um dein Passwort zurückzusetzen (gültig 1 Stunde):</p>
        <p><a href="${BASE}/#/reset?token=${token}" style="color:#111">${BASE}/#/reset?token=${token}</a></p>
      </div>`
    });
  } catch (e) { console.error('Mail-Fehler:', e.message); }

  res.json({ ok: true });
});

app.post('/api/auth/change-password', must, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Passwort mindestens 8 Zeichen' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?').run(hash, req.user.id);
  const u = db.prepare('SELECT id, email, username, slug FROM users WHERE id=?').get(req.user.id);
  res.json({ token: jwt.sign({ id: u.id, email: u.email }, SECRET, { expiresIn: '30d' }), user: u });
});

app.post('/api/auth/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8)
    return res.status(400).json({ error: 'Token und Passwort (min. 8 Zeichen) erforderlich' });

  const rt = db.prepare(
    "SELECT * FROM reset_tokens WHERE token=? AND used_at IS NULL AND expires_at > datetime('now')"
  ).get(token);
  if (!rt) return res.status(400).json({ error: 'Link ungültig oder abgelaufen' });

  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?').run(hash, rt.user_id);
  db.prepare("UPDATE reset_tokens SET used_at=datetime('now') WHERE id=?").run(rt.id);

  const u = db.prepare('SELECT id, email, username, slug FROM users WHERE id=?').get(rt.user_id);
  res.json({ token: jwt.sign({ id: u.id, email: u.email }, SECRET, { expiresIn: '30d' }), user: u });
});

// ── Users ──────────────────────────────────────────────────────────────────

app.get('/api/users/:id', auth, (req, res) => {
  const u = db.prepare(
    'SELECT id, username, slug, bio, role, photo_url, initiatives, created_at FROM users WHERE slug=? OR username=? OR id=?'
  ).get(req.params.id, req.params.id, parseInt(req.params.id) || -1);

  if (!u) return res.status(404).json({ error: 'Nicht gefunden' });

  u.questions = db.prepare(
    'SELECT id, text, location, created_at FROM questions WHERE author_id=? ORDER BY created_at DESC'
  ).all(u.id);

  if (req.user) {
    u.interactions = db.prepare(`
      SELECT i.id, i.text, i.created_at, q.id as qid, q.text as question
      FROM interactions i JOIN questions q ON i.question_id=q.id
      WHERE i.user_id=? ORDER BY i.created_at DESC
    `).all(u.id);
  }
  res.json(u);
});

app.put('/api/users/me', must, (req, res) => {
  const { username, bio, photo_url, initiatives } = req.body;
  try {
    db.prepare('UPDATE users SET username=?, bio=?, photo_url=?, initiatives=? WHERE id=?')
      .run(username?.trim() || null, bio || '', photo_url || '', initiatives || '', req.user.id);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Nutzername bereits vergeben' });
  }
});

app.put('/api/questions/:id', must, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text fehlt' });
  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Nicht gefunden' });
  if (q.author_id !== req.user.id) return res.status(403).json({ error: 'Keine Berechtigung' });
  db.prepare('UPDATE questions SET text=? WHERE id=?').run(text.trim(), req.params.id);
  res.json({ ok: true });
});

app.put('/api/interactions/:id', must, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Text fehlt' });
  const i = db.prepare('SELECT * FROM interactions WHERE id=?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'Nicht gefunden' });
  if (i.user_id !== req.user.id) return res.status(403).json({ error: 'Keine Berechtigung' });
  db.prepare('UPDATE interactions SET text=? WHERE id=?').run(text.trim(), req.params.id);
  res.json({ ok: true });
});

// ── Fallback ───────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`▶ Public Secrets auf http://localhost:${PORT}`));
