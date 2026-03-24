/**
 * seed.js — Importiert Daten aus /data/ in die Public Secrets v2 Datenbank.
 *
 * Liest:
 *   ../data/people.json   → users
 *   ../data/questions.json → questions
 *
 * Für philipp@saetzerei.com wird ein temporäres Passwort gesetzt und ausgegeben.
 * Alle anderen Personen müssen ihr Passwort über «Passwort vergessen» setzen.
 *
 * Aufruf: node seed.js
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || 'publicsecrets.db';
const DATA_DIR = path.join(__dirname, '..', 'data');

const people = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'people.json'), 'utf8'));
const questions = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'questions.json'), 'utf8'));

const db = new Database(DB_PATH);
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

// ── Temporäres Passwort für Admin ──────────────────────────────────────────
const ADMIN_EMAIL = 'philipp@saetzerei.com';
const tempPassword = crypto.randomBytes(5).toString('hex'); // z.B. "a3f9c2b1e0"
const tempHash = bcrypt.hashSync(tempPassword, 10);

// ── Personen importieren ────────────────────────────────────────────────────
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (email, username, slug, bio, role, photo_url, password_hash, must_change_password)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const nameToId = new Map(); // "Philipp Tok" → db-id

db.transaction(() => {
  for (const p of people) {
    if (!p.email || p.archived) continue;
    const email = p.email.toLowerCase();
    const isAdmin = email === ADMIN_EMAIL;
    try {
      insertUser.run(
        email,
        p.slug,
        p.slug,
        p.bio || '',
        p.role || '',
        p.portraitUrl || '',
        isAdmin ? tempHash : null,
        isAdmin ? 1 : 1
      );
      const row = db.prepare('SELECT id FROM users WHERE email=?').get(email);
      if (row) nameToId.set(p.name, row.id);
    } catch (e) {
      console.warn(`  Übersprungen (${p.name}): ${e.message}`);
    }
  }
})();

console.log(`✓ ${nameToId.size} Personen importiert`);

// ── Fragen importieren ──────────────────────────────────────────────────────
const insertQ = db.prepare(`
  INSERT OR IGNORE INTO questions (text, author_id, author_name, location, source_label, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let qCount = 0;
db.transaction(() => {
  for (const q of questions) {
    const authorName = q.authors?.[0] || q.authorHint || 'Anonym';
    const authorId = nameToId.get(authorName) || null;
    insertQ.run(
      q.text,
      authorId,
      authorName,
      q.location || '',
      q.sourceLabel || '',
      q.createdAt || new Date().toISOString()
    );
    qCount++;
  }
})();

console.log(`✓ ${qCount} Fragen importiert`);
console.log('');
console.log('──────────────────────────────────────────');
console.log(`Admin-Login:`);
console.log(`  E-Mail:   ${ADMIN_EMAIL}`);
console.log(`  Passwort: ${tempPassword}  ← bitte nach Login ändern`);
console.log('──────────────────────────────────────────');

db.close();
