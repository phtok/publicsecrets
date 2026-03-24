/**
 * seed.js — Import existing data into the new Public Secrets v2 database.
 *
 * Usage:
 *   node seed.js /path/to/export.json
 *
 * The script reads questions and people from the export JSON and inserts
 * them into the SQLite database. Password hashes are NOT imported —
 * existing authors must reset their password via "Passwort vergessen".
 *
 * Run once. Safe to re-run (uses INSERT OR IGNORE).
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const exportFile = process.argv[2];
if (!exportFile) {
  console.error('Aufruf: node seed.js <pfad-zur-export.json>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
const db = new Database(process.env.DB_PATH || 'publicsecrets.db');
db.pragma('journal_mode = WAL');

// Ensure tables exist (same as server.js)
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

// ── Import people as user accounts ─────────────────────────────────────────
const people = data?.collections?.people?.items || [];
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (email, username, slug, bio, role, photo_url, must_change_password)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`);

const userByName = new Map(); // name → id

db.transaction(() => {
  for (const p of people) {
    if (!p.email) continue;
    try {
      const result = insertUser.run(
        p.email.toLowerCase(),
        p.slug,
        p.slug,
        p.bio || '',
        p.role || '',
        p.portraitUrl || ''
      );
      const id = result.lastInsertRowid || db.prepare('SELECT id FROM users WHERE email=?').get(p.email.toLowerCase())?.id;
      if (id) userByName.set(p.name, id);
    } catch (e) {
      console.warn(`  Übersprungen (${p.name}): ${e.message}`);
    }
  }
})();

console.log(`✓ ${userByName.size} Personen importiert`);

// ── Import questions ────────────────────────────────────────────────────────
const questions = data?.collections?.questions?.items || [];
const insertQ = db.prepare(`
  INSERT OR IGNORE INTO questions (text, author_id, author_name, location, source_label, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let qCount = 0;
db.transaction(() => {
  for (const q of questions) {
    const authorName = (q.authors && q.authors.length > 0)
      ? q.authors[0]
      : (q.authorHint || 'Anonym');

    const authorId = userByName.get(authorName) || null;

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
console.log('Fertig. Autorinnen können ihr Passwort über «Passwort vergessen» setzen.');
db.close();
