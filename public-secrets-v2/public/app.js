/* Public Secrets v2 — SPA */

const $ = id => document.getElementById(id);
const app = $('app');
const modalRoot = $('modal-root');

// ── State ──────────────────────────────────────────────────────────────────
let token = localStorage.getItem('ps_token');
let me = JSON.parse(localStorage.getItem('ps_me') || 'null');

function saveAuth(t, u) {
  token = t; me = u;
  localStorage.setItem('ps_token', t);
  localStorage.setItem('ps_me', JSON.stringify(u));
}
function clearAuth() {
  token = null; me = null;
  localStorage.removeItem('ps_token');
  localStorage.removeItem('ps_me');
}

// ── API ────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  const r = await fetch(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || r.statusText);
  return json;
}

// ── Utils ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Nav ────────────────────────────────────────────────────────────────────
function renderNav() {
  const nav = $('nav-links');
  if (me) {
    nav.innerHTML = `
      <a href="#/list">Alle Fragen</a>
      <a href="#/u/${esc(me.slug || me.username || me.id)}">Profil</a>
      <a href="#/" id="logout-link">Abmelden</a>`;
    nav.querySelector('#logout-link').addEventListener('click', e => {
      e.preventDefault(); clearAuth(); renderNav(); route();
    });
  } else {
    nav.innerHTML = `<a href="#/list">Alle Fragen</a><a href="#/login">Anmelden</a>`;
  }
}

// ── Router ─────────────────────────────────────────────────────────────────
function route() {
  const hash = location.hash.slice(1) || '/';
  document.body.classList.remove('feed-mode');
  renderNav();

  if (hash === '/') return pageFeed();
  if (hash === '/list' || hash.startsWith('/list?')) return pageList(new URLSearchParams(hash.split('?')[1] || '').get('sort') || 'date');
  if (hash.startsWith('/q/')) return pageQuestion(hash.slice(3));
  if (hash.startsWith('/u/')) return pageProfile(hash.slice(3));
  if (hash === '/login') return pageAuth();
  if (hash === '/me') return pageProfileEdit();
  if (hash.startsWith('/reset')) return pageReset(new URLSearchParams(hash.split('?')[1] || '').get('token'));
  app.innerHTML = '<div class="page"><p>Seite nicht gefunden.</p></div>';
}
window.addEventListener('hashchange', route);

// ── Feed ───────────────────────────────────────────────────────────────────
async function pageFeed() {
  document.body.classList.add('feed-mode');

  const questions = await api('GET', '/api/feed').catch(() => []);

  const slides = questions.map(q => `
    <div class="slide" id="slide-q-${q.id}">
      <div class="inner">
        <p class="q-text">${esc(q.text)}</p>
        <p class="q-meta">
          ${q.author_slug
            ? `<a href="#/u/${esc(q.author_slug)}">${esc(q.author)}</a>`
            : esc(q.author)}
          ${q.location ? ' · ' + esc(q.location) : ''}
        </p>
        <div class="q-actions">
          <a class="btn" href="#/q/${q.id}">Antworten</a>
          <button class="ghost js-fwd" data-id="${q.id}" data-text="${esc(q.text)}">Weiterleiten</button>
        </div>
        <p class="q-count">${q.interactions} Interaktion${q.interactions !== 1 ? 'en' : ''}</p>
      </div>
    </div>`).join('');

  app.innerHTML = `
    <div id="feed">
      <div class="slide slide-ask" id="slide-ask">
        <div class="inner">
          <p class="hint">Stell eine Frage</p>
          <textarea id="ask-text" placeholder="Was beschäftigt dich?" rows="3"></textarea>
          <div class="ask-row">
            <input id="ask-name" type="text" placeholder="Dein Name (optional)">
            <input id="ask-loc" type="text" placeholder="Ort (optional)">
            <button class="primary" id="ask-submit">Frage stellen</button>
          </div>
          <p class="err" id="ask-err"></p>
        </div>
      </div>
      ${slides}
    </div>`;

  // Scroll to first question (skip the ask slide)
  const feed = $('feed');
  if (questions.length > 0) {
    const firstSlide = document.getElementById('slide-q-' + questions[0].id);
    if (firstSlide) requestAnimationFrame(() => feed.scrollTop = firstSlide.offsetTop - feed.getBoundingClientRect().top + feed.scrollTop);
  }

  $('ask-submit').addEventListener('click', async () => {
    const text = $('ask-text').value.trim();
    const err = $('ask-err');
    err.style.display = 'none';
    if (!text) { err.textContent = 'Bitte eine Frage eingeben.'; err.style.display = 'block'; return; }
    try {
      const r = await api('POST', '/api/questions', {
        text,
        author_name: $('ask-name').value.trim() || (me?.username) || 'Anonym',
        location: $('ask-loc').value.trim()
      });
      location.hash = '#/q/' + r.id;
    } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
  });

  app.querySelectorAll('.js-fwd').forEach(btn => {
    btn.addEventListener('click', () => showForwardModal({ id: btn.dataset.id, text: btn.dataset.text }));
  });
}

// ── List ───────────────────────────────────────────────────────────────────
async function pageList(sort) {
  const questions = await api('GET', '/api/questions?sort=' + sort).catch(() => []);
  app.innerHTML = `
    <div class="page">
      <div class="sort-bar">
        <a href="#/list?sort=date" class="${sort==='date'?'on':''}">Datum</a>
        <a href="#/list?sort=interactions" class="${sort==='interactions'?'on':''}">Interaktionen</a>
        <a href="#/list?sort=author" class="${sort==='author'?'on':''}">Autorin</a>
      </div>
      ${questions.map(q => `
        <div class="q-item" onclick="location.hash='#/q/${q.id}'">
          <div class="q-item-text">${esc(q.text)}</div>
          <div class="q-item-meta">
            ${q.author_slug
              ? `<a href="#/u/${esc(q.author_slug)}" onclick="event.stopPropagation()">${esc(q.author)}</a>`
              : esc(q.author)}
            ${q.location ? ' · ' + esc(q.location) : ''}
            · ${fmt(q.created_at)}
            · ${q.interactions} Interaktion${q.interactions !== 1 ? 'en' : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

// ── Question detail ────────────────────────────────────────────────────────
async function pageQuestion(id) {
  const q = await api('GET', '/api/questions/' + id).catch(() => null);
  if (!q) { app.innerHTML = '<div class="page"><p>Frage nicht gefunden.</p></div>'; return; }

  const commentsHtml = me && q.comments
    ? `<div class="section-head">Interaktionen</div>
       ${q.comments.length === 0 ? '<p style="color:var(--gray);font-family:var(--sans);font-size:.85rem">Noch keine Interaktionen.</p>' : ''}
       ${q.comments.map(c => `
         <div class="interaction">
           <div class="text">${esc(c.text)}</div>
           <div class="meta">${c.author_slug
             ? `<a href="#/u/${esc(c.author_slug)}">${esc(c.author)}</a>`
             : esc(c.author)} · ${fmt(c.created_at)}</div>
         </div>`).join('')}
       <div class="section-head">Deine Interaktion</div>
       <div class="form-group">
         <textarea id="int-text" placeholder="Deine Antwort, Reaktion oder Frage…"></textarea>
       </div>
       ${!me ? '' : ''}
       <button class="primary" id="int-submit">Senden</button>
       <p class="err" id="int-err"></p>
       <p class="ok" id="int-ok">Gespeichert.</p>`
    : `<div class="section-head">Interaktionen</div>
       <p style="font-family:var(--sans);font-size:.85rem;color:var(--gray)">${q.interactions} Interaktion${q.interactions !== 1 ? 'en' : ''}</p>
       <div class="login-hint"><a href="#/login">Anmelden</a> um Interaktionen zu lesen und zu antworten.</div>`;

  app.innerHTML = `
    <div class="page">
      <a class="back" href="#/">← Zurück</a>
      <div class="detail-q">${esc(q.text)}</div>
      <div class="detail-meta">
        ${q.author_slug
          ? `<a href="#/u/${esc(q.author_slug)}">${esc(q.author)}</a>`
          : esc(q.author)}
        ${q.location ? ' · ' + esc(q.location) : ''}
        ${q.source_label ? ' · ' + esc(q.source_label) : ''}
        · ${fmt(q.created_at)}
      </div>
      <div class="detail-actions">
        <button class="ghost js-fwd" data-id="${q.id}" data-text="${esc(q.text)}">Weiterleiten</button>
        <a class="btn" href="#/">Feed</a>
      </div>
      ${commentsHtml}
    </div>`;

  app.querySelector('.js-fwd')?.addEventListener('click', () => showForwardModal(q));

  const submitBtn = $('int-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const text = $('int-text').value.trim();
      const err = $('int-err'), ok = $('int-ok');
      err.style.display = 'none'; ok.style.display = 'none';
      if (!text) { err.textContent = 'Bitte etwas eingeben.'; err.style.display = 'block'; return; }
      try {
        await api('POST', '/api/questions/' + id + '/interact', {
          text,
          author_name: me?.username || 'Anonym'
        });
        ok.style.display = 'block';
        $('int-text').value = '';
        setTimeout(() => pageQuestion(id), 800);
      } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
    });
  }
}

// ── Profile ────────────────────────────────────────────────────────────────
async function pageProfile(slug) {
  const u = await api('GET', '/api/users/' + slug).catch(() => null);
  if (!u) { app.innerHTML = '<div class="page"><p>Profil nicht gefunden.</p></div>'; return; }

  const isMe = me && me.id === u.id;

  app.innerHTML = `
    <div class="page">
      <a class="back" href="#/">← Zurück</a>
      <div class="profile-head">
        ${u.photo_url ? `<img class="profile-img" src="${esc(u.photo_url)}" alt="">` : ''}
        <div>
          <div class="profile-name">${esc(u.username || u.slug)}</div>
          ${u.role ? `<div class="profile-role">${esc(u.role)}</div>` : ''}
          ${u.bio ? `<div class="profile-bio">${esc(u.bio)}</div>` : ''}
        </div>
      </div>
      ${u.initiatives ? `<div class="section-head">Initiativen & Projekte</div><p style="font-size:.95rem;line-height:1.65">${esc(u.initiatives)}</p>` : ''}
      ${isMe ? '<div class="detail-actions"><a class="btn" href="#/me">Profil bearbeiten</a></div>' : ''}
      <div class="section-head">Fragen (${u.questions?.length || 0})</div>
      ${(u.questions || []).map(q => `
        <div class="q-item" onclick="location.hash='#/q/${q.id}'">
          <div class="q-item-text">${esc(q.text)}</div>
          <div class="q-item-meta">${fmt(q.created_at)}${q.location ? ' · ' + esc(q.location) : ''}</div>
        </div>`).join('') || '<p style="color:var(--gray);font-family:var(--sans);font-size:.85rem">Noch keine Fragen.</p>'}
      ${me && u.interactions?.length > 0 ? `
        <div class="section-head">Interaktionen</div>
        ${u.interactions.map(i => `
          <div class="interaction">
            <div class="text">${esc(i.text)}</div>
            <div class="meta">zu: <a href="#/q/${i.qid}">${esc(i.question)}</a> · ${fmt(i.created_at)}</div>
          </div>`).join('')}` : ''}
    </div>`;
}

// ── Auth ───────────────────────────────────────────────────────────────────
function pageAuth(tab) {
  tab = tab || 'login';
  app.innerHTML = `
    <div class="page" style="max-width:420px">
      <div class="tabs">
        <div class="tab ${tab==='login'?'on':''}" id="tab-login">Anmelden</div>
        <div class="tab ${tab==='register'?'on':''}" id="tab-register">Registrieren</div>
      </div>
      <div id="tab-content"></div>
    </div>`;

  $('tab-login').addEventListener('click', () => pageAuth('login'));
  $('tab-register').addEventListener('click', () => pageAuth('register'));

  const content = $('tab-content');
  if (tab === 'login') {
    content.innerHTML = `
      <div class="form-group"><label>E-Mail</label><input id="l-email" type="email" autocomplete="email"></div>
      <div class="form-group"><label>Passwort</label><input id="l-pass" type="password" autocomplete="current-password"></div>
      <button class="primary" id="l-submit">Anmelden</button>
      <p class="err" id="l-err"></p>
      <p style="margin-top:1rem;font-family:var(--sans);font-size:.8rem"><a href="#/forgot" id="forgot-link">Passwort vergessen?</a></p>`;

    $('l-submit').addEventListener('click', async () => {
      const err = $('l-err'); err.style.display = 'none';
      try {
        const r = await api('POST', '/api/auth/login', { email: $('l-email').value, password: $('l-pass').value });
        saveAuth(r.token, r.user);
        if (r.must_change_password) { location.hash = '#/reset?must=1'; return; }
        renderNav(); location.hash = '#/';
      } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
    });

    document.getElementById('forgot-link').addEventListener('click', e => {
      e.preventDefault(); showForgotModal();
    });
  } else {
    content.innerHTML = `
      <div class="form-group"><label>E-Mail</label><input id="r-email" type="email" autocomplete="email"></div>
      <div class="form-group"><label>Passwort</label><input id="r-pass" type="password" autocomplete="new-password"></div>
      <div class="form-group"><label>Nutzername (optional)</label><input id="r-user" type="text"></div>
      <button class="primary" id="r-submit">Registrieren</button>
      <p class="err" id="r-err"></p>`;

    $('r-submit').addEventListener('click', async () => {
      const err = $('r-err'); err.style.display = 'none';
      try {
        const r = await api('POST', '/api/auth/register', {
          email: $('r-email').value,
          password: $('r-pass').value,
          username: $('r-user').value.trim() || undefined
        });
        saveAuth(r.token, r.user);
        renderNav(); location.hash = '#/';
      } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
    });
  }
}

// ── Profile edit ───────────────────────────────────────────────────────────
async function pageProfileEdit() {
  if (!me) { location.hash = '#/login'; return; }
  const u = await api('GET', '/api/auth/me').catch(() => null);
  if (!u) { location.hash = '#/login'; return; }

  app.innerHTML = `
    <div class="page" style="max-width:420px">
      <a class="back" href="#/u/${esc(u.slug || u.username || u.id)}">← Zurück</a>
      <div class="form-group"><label>Nutzername</label><input id="e-user" value="${esc(u.username || '')}"></div>
      <div class="form-group"><label>Bio</label><textarea id="e-bio">${esc(u.bio || '')}</textarea></div>
      <div class="form-group"><label>Foto-URL</label><input id="e-photo" value="${esc(u.photo_url || '')}"></div>
      <div class="form-group"><label>Initiativen / Projekte / Events</label><textarea id="e-init">${esc(u.initiatives || '')}</textarea></div>
      <button class="primary" id="e-submit">Speichern</button>
      <p class="err" id="e-err"></p>
      <p class="ok" id="e-ok">Gespeichert.</p>
    </div>`;

  $('e-submit').addEventListener('click', async () => {
    const err = $('e-err'), ok = $('e-ok');
    err.style.display = 'none'; ok.style.display = 'none';
    try {
      await api('PUT', '/api/users/me', {
        username: $('e-user').value.trim(),
        bio: $('e-bio').value,
        photo_url: $('e-photo').value.trim(),
        initiatives: $('e-init').value
      });
      // Refresh me
      const updated = await api('GET', '/api/auth/me');
      saveAuth(token, updated);
      renderNav();
      ok.style.display = 'block';
    } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
  });
}

// ── Password reset ─────────────────────────────────────────────────────────
function pageReset(resetToken) {
  const must = new URLSearchParams(location.hash.split('?')[1] || '').get('must');

  app.innerHTML = `
    <div class="page" style="max-width:420px">
      <h2 style="font-family:var(--sans);font-size:1rem;margin-bottom:1.5rem">${must ? 'Bitte setze dein Passwort' : 'Neues Passwort'}</h2>
      <div class="form-group"><label>Neues Passwort</label><input id="rp-pass" type="password" autocomplete="new-password"></div>
      <div class="form-group"><label>Passwort wiederholen</label><input id="rp-pass2" type="password" autocomplete="new-password"></div>
      <button class="primary" id="rp-submit">Passwort setzen</button>
      <p class="err" id="rp-err"></p>
    </div>`;

  $('rp-submit').addEventListener('click', async () => {
    const err = $('rp-err'); err.style.display = 'none';
    const pass = $('rp-pass').value, pass2 = $('rp-pass2').value;
    if (pass !== pass2) { err.textContent = 'Passwörter stimmen nicht überein.'; err.style.display = 'block'; return; }
    if (!resetToken && !must) { err.textContent = 'Kein gültiger Reset-Link.'; err.style.display = 'block'; return; }
    try {
      const r = await api('POST', '/api/auth/reset', { token: resetToken, password: pass });
      saveAuth(r.token, r.user);
      renderNav(); location.hash = '#/';
    } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
  });
}

// ── Forward modal ──────────────────────────────────────────────────────────
function showForwardModal(q) {
  modalRoot.innerHTML = `
    <div class="overlay" id="modal-overlay">
      <div class="modal">
        <button class="modal-close" id="modal-close">×</button>
        <h2>Frage weiterleiten</h2>
        <p style="font-family:var(--serif);margin-bottom:1.5rem;font-size:.95rem;line-height:1.6">${esc(q.text)}</p>
        <div class="form-group"><label>E-Mail-Adresse</label><input id="fwd-email" type="email" placeholder="empfaenger@example.com"></div>
        <div class="form-group"><label>Dein Name (optional)</label><input id="fwd-name" value="${esc(me?.username || '')}"></div>
        <button class="primary" id="fwd-submit">Senden</button>
        <p class="err" id="fwd-err"></p>
        <p class="ok" id="fwd-ok">Gesendet!</p>
      </div>
    </div>`;

  const close = () => { modalRoot.innerHTML = ''; };
  $('modal-close').addEventListener('click', close);
  $('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) close(); });

  $('fwd-submit').addEventListener('click', async () => {
    const err = $('fwd-err'), ok = $('fwd-ok');
    err.style.display = 'none'; ok.style.display = 'none';
    const to_email = $('fwd-email').value.trim();
    if (!to_email) { err.textContent = 'Bitte eine E-Mail-Adresse eingeben.'; err.style.display = 'block'; return; }
    try {
      await api('POST', '/api/questions/' + q.id + '/forward', {
        to_email,
        from_name: $('fwd-name').value.trim() || (me?.username) || 'jemand'
      });
      ok.style.display = 'block';
      setTimeout(close, 1500);
    } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
  });
}

// ── Forgot password modal ──────────────────────────────────────────────────
function showForgotModal() {
  modalRoot.innerHTML = `
    <div class="overlay" id="modal-overlay">
      <div class="modal">
        <button class="modal-close" id="modal-close">×</button>
        <h2>Passwort zurücksetzen</h2>
        <div class="form-group"><label>E-Mail-Adresse</label><input id="fg-email" type="email"></div>
        <button class="primary" id="fg-submit">Link senden</button>
        <p class="err" id="fg-err"></p>
        <p class="ok" id="fg-ok">Falls die Adresse bekannt ist, wurde ein Link gesendet.</p>
      </div>
    </div>`;

  const close = () => { modalRoot.innerHTML = ''; };
  $('modal-close').addEventListener('click', close);
  $('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) close(); });

  $('fg-submit').addEventListener('click', async () => {
    const err = $('fg-err'), ok = $('fg-ok');
    err.style.display = 'none'; ok.style.display = 'none';
    try {
      await api('POST', '/api/auth/forgot', { email: $('fg-email').value.trim() });
      ok.style.display = 'block';
      $('fg-submit').disabled = true;
    } catch(e) { err.textContent = e.message; err.style.display = 'block'; }
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
renderNav();
route();
