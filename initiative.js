const app = document.getElementById("initiativeApp");
const pageId = document.body.dataset.initiativeId || new URLSearchParams(window.location.search).get("id") || "";

init();

async function init() {
  const [initiatives, people] = await Promise.all([fetchInitiatives(), fetchPeople()]);
  if (!initiatives.length) {
    app.innerHTML = `<section class="card"><h2>Keine Initiative gefunden</h2></section>`;
    return;
  }

  const initiative = initiatives.find((i) => String(i.id || "") === pageId) || initiatives[0];
  const category = initiative.category || "Initiativen";
  const text = String(initiative.content || initiative.description || "").trim();
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p>${escapeHtml(chunk).replace(/\n/g, "<br />")}</p>`)
    .join("");

  const image = initiative.imageUrl
    ? `<img class="initiative-hero" src="${escapeHtml(initiative.imageUrl)}" alt="${escapeHtml(initiative.title || "")}" loading="lazy" />`
    : "";

  const hosts = (initiative.hosts || [])
    .map((host) => {
      const member = people.find((p) => normalize(p.name) === normalize(host));
      if (member && member.slug) return `<a class="member-link" href="/members/${escapeHtml(member.slug)}.html">${escapeHtml(host)}</a>`;
      return escapeHtml(host);
    })
    .join(" · ");

  const source = initiative.sourceUrl
    ? `<p><a class="member-link" target="_blank" rel="noopener noreferrer" href="${escapeHtml(initiative.sourceUrl)}">Externer Link</a></p>`
    : "";

  app.innerHTML = `
    <section class="card">
      <p class="muted">${escapeHtml(category)}</p>
      <h2>${escapeHtml(initiative.title || "")}</h2>
      ${image}
      ${initiative.description ? `<p class="muted">${escapeHtml(initiative.description)}</p>` : ""}
      ${hosts ? `<p class="muted">Mitwirkende: ${hosts}</p>` : ""}
      ${paragraphs}
      ${source}
      <p><a class="member-link" href="/index.html?view=initiatives">Zurück zu Initiativen</a></p>
    </section>
  `;
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

async function fetchPeople() {
  try {
    const res = await fetch("/data/people.json");
    if (!res.ok) throw new Error("people file");
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(str) {
  return toGuillemets(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toGuillemets(value) {
  let text = String(value || "");
  text = text.replace(/[„“«]/g, "‹").replace(/[”»]/g, "›");
  text = text.replace(/"([^"\n]+)"/g, "‹$1›");
  text = text.replace(/‚/g, "‹").replace(/[‘’]/g, "›");
  return text;
}
