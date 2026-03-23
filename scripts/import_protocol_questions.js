#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = resolveDataDir();
const PEOPLE_FILE = path.join(DATA_DIR, "people.json");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");

const MONTHS = new Map([
  ["januar", 1],
  ["februar", 2],
  ["maerz", 3],
  ["marz", 3],
  ["april", 4],
  ["mai", 5],
  ["juni", 6],
  ["juli", 7],
  ["august", 8],
  ["september", 9],
  ["oktober", 10],
  ["november", 11],
  ["dezember", 12]
]);

const LOCATION_ALIASES = new Map([
  ["salon der guten gespraeche", "Salon der guten Gespraeche"],
  ["salon der guten gesprache", "Salon der guten Gespraeche"],
  ["slon der guten gespraeche", "Salon der guten Gespraeche"],
  ["slon der guten gesprache", "Salon der guten Gespraeche"],
  ["basel", "Basel"],
  ["in basel", "Basel"],
  ["chandolin", "Chandolin"],
  ["in chandolin", "Chandolin"],
  ["chadolin", "Chandolin"],
  ["in chadolin", "Chandolin"],
  ["witten", "Witten"],
  ["in witten", "Witten"]
]);

const PERSON_ALIASES = new Map([
  ["juli", { name: "Juliane von Crailsheim", authorStatus: "resolved" }],
  ["philip", { name: "Philipp Tok", authorStatus: "resolved" }],
  ["philipp", { name: "Philipp Tok", authorStatus: "resolved" }],
  ["gilda", { name: "Gilda Bartel", authorStatus: "resolved" }],
  ["daniel", { name: "Daniel Häni", authorStatus: "resolved" }],
  ["alex", { name: "Alex Silber", authorStatus: "external" }],
  ["veronika", { name: "Veronika Sellier", authorStatus: "external" }],
  ["charlotte", { name: "Charlotte Böttger", authorStatus: "external" }],
  ["aurelie", { name: "Aurelie", authorStatus: "external" }],
  ["mimi", { name: "Mimi", authorStatus: "external" }],
  ["simone", { name: "Simone", authorStatus: "external" }],
  ["monika", { name: "Monika", authorStatus: "external" }],
  ["jeanine", { name: "Jeanine", authorStatus: "external" }],
  ["marc", { name: "Marc", authorStatus: "external" }]
]);

const UNRESOLVED_AUTHOR_RE = /^ungekl[aä]rt(?:\s*\((.+)\))?$/i;
const INLINE_AUTHOR_SEPARATORS = [" – ", " –", "– ", "–", " - ", " -", "- ", "-"];

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputPath) {
    printUsage();
    process.exit(1);
  }

  const [rawText, people, questions] = await Promise.all([
    fs.readFile(args.inputPath, "utf-8"),
    readJson(PEOPLE_FILE),
    readJson(QUESTIONS_FILE)
  ]);

  const resolver = buildAuthorResolver(people);
  const parsed = parseProtocols(rawText, resolver);
  const { added, skipped, nextQuestions } = buildImportPlan(questions, parsed.records);

  printSummary({
    inputPath: args.inputPath,
    sections: parsed.sections,
    records: parsed.records,
    issues: parsed.issues,
    added,
    skipped
  });

  if (parsed.issues.length > 0) {
    console.error("\nImport blocked: unresolved ambiguities found.");
    process.exit(1);
  }

  if (!args.apply) {
    console.log("\nDry run only. Re-run with --apply to write data/questions.json.");
    return;
  }

  await writeJson(QUESTIONS_FILE, nextQuestions);
  console.log(`\nWrote ${added.length} new question(s) to ${QUESTIONS_FILE}.`);
}

function parseArgs(argv) {
  const args = {
    apply: false,
    inputPath: ""
  };
  for (const token of argv) {
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (!args.inputPath) {
      args.inputPath = path.resolve(process.cwd(), token);
      continue;
    }
    throw new Error(`Unexpected argument: ${token}`);
  }
  return args;
}

function printUsage() {
  console.log("Usage:");
  console.log("  ./bin/node scripts/import_protocol_questions.js <input-file>");
  console.log("  ./bin/node scripts/import_protocol_questions.js --apply <input-file>");
}

function parseProtocols(rawText, resolver) {
  const lines = String(rawText || "").split(/\r?\n/);
  const sections = [];
  const issues = [];
  let current = null;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx];
    const header = parseHeader(rawLine);
    if (header) {
      if (current) sections.push(current);
      current = {
        ...header,
        headerLine: idx + 1,
        bodyLines: []
      };
      continue;
    }

    if (!current) {
      if (String(rawLine || "").trim()) {
        issues.push({
          code: "orphan_text",
          message: `Text outside a detected protocol header on line ${idx + 1}: ${String(rawLine || "").trim()}`
        });
      }
      continue;
    }

    current.bodyLines.push({ lineNumber: idx + 1, text: rawLine });
  }
  if (current) sections.push(current);

  const records = [];
  for (const section of sections) {
    parseSection(section, resolver, records, issues);
  }

  return { sections, records, issues };
}

function parseHeader(rawLine) {
  const line = String(rawLine || "").trim().replace(/:+$/, "").trim();
  if (!line) return null;

  const dateMatch = line.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4})/);
  if (!dateMatch) return null;

  const day = Number(dateMatch[1]);
  const monthName = normalizeLoose(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const month = MONTHS.get(monthName);
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null;

  const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const suffix = line
    .slice((dateMatch.index || 0) + dateMatch[0].length)
    .replace(/^[,\-–—:]\s*/, "")
    .trim();

  return {
    sourceLabel: line,
    dateText: dateMatch[0],
    isoDate,
    location: normalizeLocation(suffix),
    rawLocation: suffix
  };
}

function parseSection(section, resolver, records, issues) {
  const blocks = splitBlocks(section.bodyLines);
  if (!section.location) {
    issues.push({
      code: "missing_location",
      message: `Missing location for protocol "${section.sourceLabel}" (line ${section.headerLine}).`
    });
  }

  if (Date.parse(`${section.isoDate}T12:00:00.000Z`) > Date.now()) {
    issues.push({
      code: "future_date",
      message: `Protocol date is in the future for "${section.sourceLabel}" (${section.isoDate}).`
    });
  }

  let questionOffset = 0;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const lines = block.map((entry) => String(entry.text || "").trim()).filter(Boolean);
    if (!lines.length) continue;

    const rosterImport = parseQuestionListWithRoster(lines, blocks[blockIndex + 1], resolver, section, block[0].lineNumber);
    if (rosterImport) {
      for (const issue of rosterImport.issues) issues.push(issue);
      for (const row of rosterImport.records) {
        records.push({
          ...row,
          id: makeId("q"),
          createdAt: buildCreatedAt(section.isoDate, questionOffset),
          location: section.location,
          sourceLabel: section.sourceLabel
        });
        questionOffset += 1;
      }
      blockIndex += 1;
      continue;
    }

    const inlineRows = parseInlineQuestionRows(lines, resolver, section, block[0].lineNumber);
    if (inlineRows) {
      for (const issue of inlineRows.issues) issues.push(issue);
      for (const row of inlineRows.records) {
        records.push({
          ...row,
          id: makeId("q"),
          createdAt: buildCreatedAt(section.isoDate, questionOffset),
          location: section.location,
          sourceLabel: section.sourceLabel
        });
        questionOffset += 1;
      }
      continue;
    }

    const firstLine = lines[0];
    const authorMatch = resolver.resolve(firstLine);
    if (!authorMatch.ok) {
      issues.push({
        code: authorMatch.code,
        message: `${authorMatch.message} (section "${section.sourceLabel}", line ${block[0].lineNumber}).`
      });
      continue;
    }

    const extraction = extractQuestions(lines.slice(1));
    for (const note of extraction.notes) {
      issues.push({
        code: note.code,
        message: `${note.message} (author "${authorMatch.name}", section "${section.sourceLabel}", line ${block[0].lineNumber}).`
      });
    }

    if (!extraction.questions.length) {
      issues.push({
        code: "missing_question",
        message: `No question text found for author "${authorMatch.name}" in "${section.sourceLabel}" (line ${block[0].lineNumber}).`
      });
      continue;
    }

    for (const questionText of extraction.questions) {
      records.push({
        id: makeId("q"),
        text: questionText,
        authors: authorMatch.authors,
        authorStatus: authorMatch.authorStatus,
        authorHint: authorMatch.authorHint,
        createdAt: buildCreatedAt(section.isoDate, questionOffset),
        location: section.location,
        sourceLabel: section.sourceLabel
      });
      questionOffset += 1;
    }
  }
}

function parseQuestionListWithRoster(lines, nextBlock, resolver, section, startLineNumber) {
  const questionLines = lines
    .map((line) => normalizeListPrefix(line))
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  if (!questionLines.length || !questionLines.every((line) => line.includes("?"))) return null;
  if (!nextBlock || !nextBlock.length) return null;

  const rosterLines = nextBlock.map((entry) => String(entry.text || "").trim()).filter(Boolean);
  if (rosterLines.length !== 1 || !rosterLines[0].includes(",") || rosterLines[0].includes("?")) return null;
  const authorTokens = rosterLines[0].split(",").map((part) => String(part || "").trim()).filter(Boolean);
  if (authorTokens.length !== questionLines.length) {
    return {
      records: [],
      issues: [{
        code: "roster_count_mismatch",
        message: `Question count (${questionLines.length}) does not match author roster count (${authorTokens.length}) in "${section.sourceLabel}" (line ${startLineNumber}).`
      }]
    };
  }

  const records = [];
  const issues = [];
  for (let idx = 0; idx < questionLines.length; idx += 1) {
    const authorMatch = resolver.resolve(authorTokens[idx] || "");
    if (!authorMatch.ok) {
      issues.push({
        code: authorMatch.code,
        message: `${authorMatch.message} (section "${section.sourceLabel}", line ${startLineNumber + idx}).`
      });
      continue;
    }
    records.push({
      text: questionLines[idx],
      authors: authorMatch.authors,
      authorStatus: authorMatch.authorStatus,
      authorHint: authorMatch.authorHint
    });
  }
  return { records, issues };
}

function parseInlineQuestionRows(lines, resolver, section, startLineNumber) {
  const candidateLines = lines
    .map((line) => normalizeListPrefix(line))
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  if (!candidateLines.length) return null;
  if (candidateLines.length > 1 && !looksLikeInlineQuestionRow(candidateLines[0])) return null;
  if (!candidateLines.some(looksLikeInlineQuestionRow)) return null;

  const records = [];
  const issues = [];
  for (let idx = 0; idx < candidateLines.length; idx += 1) {
    const line = candidateLines[idx];
    if (!looksLikeInlineQuestionRow(line)) {
      issues.push({
        code: "unparsed_inline_row",
        message: `Could not interpret line "${line}" in section "${section.sourceLabel}" (line ${startLineNumber + idx}).`
      });
      continue;
    }
    const parsed = splitInlineQuestionAndAuthor(line);
    if (!parsed) {
      issues.push({
        code: "missing_author",
        message: `Could not split inline question row "${line}" (section "${section.sourceLabel}", line ${startLineNumber + idx}).`
      });
      continue;
    }

    const authorMatch = resolver.resolve(parsed.authorRaw || "Ungeklärt");
    if (!authorMatch.ok) {
      issues.push({
        code: authorMatch.code,
        message: `${authorMatch.message} (section "${section.sourceLabel}", line ${startLineNumber + idx}).`
      });
      continue;
    }

    if (!parsed.questionText) {
      issues.push({
        code: "missing_question",
        message: `No question text found in inline row "${line}" (section "${section.sourceLabel}", line ${startLineNumber + idx}).`
      });
      continue;
    }

    records.push({
      text: parsed.questionText,
      authors: authorMatch.authors,
      authorStatus: authorMatch.authorStatus,
      authorHint: authorMatch.authorHint
    });
  }

  return { records, issues };
}

function splitBlocks(bodyLines) {
  const blocks = [];
  let current = [];
  for (const entry of bodyLines) {
    const line = String(entry && entry.text ? entry.text : "");
    const trimmed = line.trim();
    if (!line.trim()) {
      if (current.length) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    if (shouldIgnoreStandaloneLine(trimmed)) {
      if (current.length) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(entry);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function extractQuestions(lines) {
  const questions = [];
  const notes = [];
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;

    if (line.includes("?")) {
      const parts = line
        .split(/(?<=\?)/)
        .map((part) => part.trim())
        .filter(Boolean);
      for (const part of parts) {
        if (part.includes("?")) questions.push(part);
        else if (looksLikeQuestion(part)) questions.push(part);
      }
      continue;
    }

    if (looksLikeQuestion(line)) {
      questions.push(line);
      notes.push({
        code: "missing_question_mark",
        message: `Question was imported without trailing question mark: "${line}"`
      });
      continue;
    }

    notes.push({
      code: "trailing_note",
      message: `Non-question text found after author heading: "${line}"`
    });
  }
  return { questions, notes };
}

function buildImportPlan(existingQuestions, nextRecords) {
  const signatures = new Set(existingQuestions.map(makeQuestionSignature));
  const nextQuestions = existingQuestions.slice();
  const added = [];
  const skipped = [];

  for (const record of nextRecords) {
    const signature = makeQuestionSignature(record);
    if (signatures.has(signature)) {
      skipped.push(record);
      continue;
    }
    signatures.add(signature);
    nextQuestions.push(record);
    added.push(record);
  }

  return { added, skipped, nextQuestions };
}

function makeQuestionSignature(input) {
  const authors = Array.isArray(input && input.authors) ? input.authors.slice() : [];
  authors.sort((a, b) => String(a || "").localeCompare(String(b || "")));
  return [
    normalizeLoose(input && input.text),
    authors.map(normalizeLoose).join("|"),
    String(input && input.authorStatus ? input.authorStatus : ""),
    normalizeLoose(input && input.authorHint),
    String(input && input.createdAt ? input.createdAt : "").slice(0, 10),
    normalizeLoose(input && input.location),
    normalizeLoose(input && input.sourceLabel)
  ].join("::");
}

function buildAuthorResolver(people) {
  const exact = new Map();
  const firstNameOwners = new Map();

  for (const person of people) {
    const name = String(person && person.name ? person.name : "").trim();
    if (!name) continue;
    exact.set(normalizeLoose(name), name);

    const firstName = normalizeLoose(name.split(/\s+/)[0]);
    if (!firstName) continue;
    if (!firstNameOwners.has(firstName)) firstNameOwners.set(firstName, new Set());
    firstNameOwners.get(firstName).add(name);
  }

  for (const [alias, spec] of PERSON_ALIASES.entries()) {
    exact.set(normalizeLoose(alias), spec);
  }

  return {
    resolve(input) {
      const raw = String(input || "").trim();
      if (!raw) {
        return {
          ok: false,
          code: "missing_author",
          message: "Missing author heading"
        };
      }

      const normalized = normalizeLoose(raw);
      if (exact.has(normalized)) {
        const match = exact.get(normalized);
        const name = typeof match === "string" ? match : String(match.name || "").trim();
        const authorStatus = typeof match === "string" ? "resolved" : String(match.authorStatus || "resolved").trim() || "resolved";
        return {
          ok: true,
          name,
          authors: name ? [name] : [],
          authorStatus,
          authorHint: ""
        };
      }

      const unresolvedMatch = raw.match(UNRESOLVED_AUTHOR_RE);
      if (unresolvedMatch) {
        const hint = String(unresolvedMatch[1] || "").trim();
        return {
          ok: true,
          name: hint ? `Ungeklärt (${hint})` : "Ungeklärt",
          authors: [],
          authorStatus: "unresolved",
          authorHint: hint
        };
      }

      const firstNameMatches = firstNameOwners.get(normalized);
      if (firstNameMatches && firstNameMatches.size === 1) {
        const match = Array.from(firstNameMatches)[0];
        return {
          ok: true,
          name: match,
          authors: [match],
          authorStatus: "resolved",
          authorHint: ""
        };
      }

      if (looksLikeExplicitExternalAuthor(raw)) {
        return {
          ok: true,
          name: raw,
          authors: [raw],
          authorStatus: "external",
          authorHint: ""
        };
      }

      if (raw.includes("?")) {
        return {
          ok: false,
          code: "missing_author",
          message: `Missing author before question block "${raw}"`
        };
      }

      return {
        ok: false,
        code: "unknown_author",
        message: `Unknown or unresolved author "${raw}"`
      };
    }
  };
}

function normalizeLocation(value) {
  const raw = String(value || "").trim().replace(/:+$/, "").trim();
  if (!raw) return "";
  const alias = LOCATION_ALIASES.get(normalizeLoose(raw));
  return alias || raw;
}

function looksLikeQuestion(value) {
  const line = String(value || "").trim().replace(/^[«»"'“”„‚‘’()\[\]\s]+/, "");
  if (!line) return false;
  return /^(wer|wie|was|wo|wann|warum|wodurch|womit|welche|welcher|welches|inwiefern|ist|sind|muss|um|wovon|welchen|wieso|kann)\b/i.test(line);
}

function looksLikeInlineQuestionRow(value) {
  const line = normalizeListPrefix(value);
  if (!line.includes("?")) return false;
  return looksLikeQuestion(line) || /[A-Za-zÄÖÜäöüß]/.test(line);
}

function splitInlineQuestionAndAuthor(value) {
  const line = normalizeListPrefix(value);
  const qIndex = line.lastIndexOf("?");
  if (qIndex < 0) return null;

  let questionText = line.slice(0, qIndex + 1).trim();
  let rest = line.slice(qIndex + 1).trim();

  const noteAndAuthor = rest.match(/^(.*?)(?:\s*[–-]\s*)([^–-]+)$/);
  if (noteAndAuthor) {
    const note = String(noteAndAuthor[1] || "").trim();
    const author = String(noteAndAuthor[2] || "").trim();
    if (note) questionText = `${questionText} ${note}`.trim();
    rest = author;
  }

  rest = rest.replace(/^\([^)]*\)\s*/, "").trim();
  rest = rest.replace(/^[–-]\s*/, "").trim();

  if (!rest) {
    return {
      questionText,
      authorRaw: "Ungeklärt"
    };
  }

  return {
    questionText,
    authorRaw: rest
  };
}

function normalizeListPrefix(value) {
  return String(value || "")
    .replace(/^\s*\d+(?:[.+]\d+)*(?:[.)+]|[+])?\s*/, "")
    .trim();
}

function shouldIgnoreStandaloneLine(value) {
  const line = String(value || "").trim();
  if (!line) return true;
  if (/^_+$/.test(line)) return true;
  if (/^public secrets$/i.test(line)) return true;
  if (/^wahrnehmungsorgan\s*-\s*\d+$/i.test(line)) return true;
  if (/^teilnehmerinnen:/i.test(line)) return true;
  if (/^wiederum eine attraktive runde/i.test(line)) return true;
  if (/^\d+\s+fragen wurden gestellt:?$/i.test(line)) return true;
  if (/^folgende fragen wurden formuliert und angewendet:?$/i.test(line)) return true;
  return false;
}

function looksLikeExplicitExternalAuthor(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("?")) return false;
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part) => /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+$/.test(part));
}

function buildCreatedAt(isoDate, offset) {
  const base = new Date(`${isoDate}T12:00:00.000Z`);
  base.setUTCMinutes(base.getUTCMinutes() + offset);
  return base.toISOString();
}

function makeId(prefix) {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString("hex");
  return `${prefix}-${suffix}`;
}

function normalizeLoose(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function printSummary(summary) {
  console.log(`Input: ${summary.inputPath}`);
  console.log(`Sections: ${summary.sections.length}`);
  console.log(`Parsed questions: ${summary.records.length}`);
  console.log(`New questions: ${summary.added.length}`);
  console.log(`Skipped duplicates: ${summary.skipped.length}`);
  console.log(`Issues: ${summary.issues.length}`);

  if (summary.added.length) {
    console.log("\nPlanned imports:");
    for (const row of summary.added) {
      console.log(`- ${row.createdAt.slice(0, 10)} | ${row.location} | ${row.authors.join(", ")} | ${row.text}`);
    }
  }

  if (summary.skipped.length) {
    console.log("\nDuplicate skips:");
    for (const row of summary.skipped) {
      console.log(`- ${row.createdAt.slice(0, 10)} | ${row.authors.join(", ")} | ${row.text}`);
    }
  }

  if (summary.issues.length) {
    console.log("\nIssues:");
    for (const issue of summary.issues) {
      console.log(`- [${issue.code}] ${issue.message}`);
    }
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  const body = JSON.stringify(value, null, 2) + "\n";
  await fs.writeFile(filePath, body, "utf-8");
}

function resolveDataDir() {
  const envDir = String(process.env.PUBLIC_SECRETE_DATA_DIR || "").trim();
  if (envDir) return path.resolve(envDir);
  return path.join(ROOT, "data");
}
