/**
 * seed-interactions.js — Importiert Antworten vom Live-System (public-secrets.onrender.com)
 * Aufruf: node seed-interactions.js
 */

require('dotenv').config();
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || 'publicsecrets.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Antworten vom Live-System (manuell extrahiert)
const interactions = [
  {
    questionText: 'Wo beginnt deine Wortlosigkeit und wie gehst du mit ihr um?',
    author: 'Daniel Häni',
    text: 'Im Schlaf. Ich schlaf sie aus.',
    createdAt: '2026-03-12T00:00:00.000Z'
  },
  {
    questionText: 'Warum gibt es Krieg?',
    author: 'Daniel Häni',
    text: 'Der Krieg beginnt dort, wo das Wort versagt.',
    createdAt: '2026-03-06T00:00:00.000Z'
  },
  {
    questionText: 'Warum gibt es Krieg?',
    author: 'Daniel Häni',
    text: 'Wegen dem Vater.',
    createdAt: '2026-03-12T00:00:00.000Z'
  },
  {
    questionText: 'Am Anfang war das Wort. Was war vor dem Wort?',
    author: 'Martje Brandsma',
    text: 'Chaos',
    createdAt: '2026-03-07T00:00:00.000Z'
  },
  {
    questionText: 'Am Anfang war das Wort. Was war vor dem Wort?',
    author: 'Daniel Häni',
    text: 'Das Interesse.',
    createdAt: '2026-03-11T00:00:00.000Z'
  },
  {
    questionText: 'Wann sind Zeichen und Siegel angemessen?',
    author: 'Daniel Häni',
    text: 'Wenn ich anwesend bin!',
    createdAt: '2026-03-06T00:00:00.000Z'
  },
  {
    questionText: 'Was ist segnen?',
    author: 'Philipp Tok',
    text: 'Dem Trost ein Bett bauen.',
    createdAt: '2026-03-06T00:00:00.000Z'
  },
  {
    questionText: 'In welchem Erlebnis ist dir deine Wirbelsäule bewusst geworden?',
    author: 'Philipp Tok',
    text: 'Im Aufrichten und Rollen.',
    createdAt: '2026-03-06T00:00:00.000Z'
  },
  {
    questionText: 'Was ist sicher?',
    author: 'Daniel Häni',
    text: 'Das es weiter geht!',
    createdAt: '2026-03-06T00:00:00.000Z'
  },
  {
    questionText: 'Worauf bereitest du dich vor?',
    author: 'F',
    text: 'Auf morgen.',
    createdAt: '2026-03-05T00:00:00.000Z'
  },
  {
    questionText: 'Wo liegt das Problem, wenn die Lösung in der Mitte liegt?',
    author: 'F',
    text: 'In der Wahrheit',
    createdAt: '2026-03-05T00:00:00.000Z'
  },
  {
    questionText: 'Wer möchte sprechen?',
    author: 'Daniel Häni',
    text: 'Das Wort.',
    createdAt: '2026-03-05T00:00:00.000Z'
  },
];

const findQ = db.prepare('SELECT id FROM questions WHERE text=?');
const findUser = db.prepare('SELECT id FROM users WHERE username=? OR slug=?');
const insert = db.prepare(
  'INSERT INTO interactions (question_id, user_id, author_name, text, created_at) VALUES (?, ?, ?, ?, ?)'
);

let imported = 0;
let skipped = 0;

db.transaction(() => {
  for (const i of interactions) {
    const q = findQ.get(i.questionText);
    if (!q) {
      console.warn(`  Frage nicht gefunden: "${i.questionText.slice(0, 50)}..."`);
      skipped++;
      continue;
    }
    const u = findUser.get(i.author, i.author);
    insert.run(q.id, u?.id || null, i.author, i.text, i.createdAt);
    imported++;
  }
})();

console.log(`✓ ${imported} Antworten importiert, ${skipped} übersprungen`);
db.close();
