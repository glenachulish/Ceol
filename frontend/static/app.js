/* Ceol – Trad Music Web App · frontend JS */

const PAGE_SIZE = 48;

const state = {
  view: "library",
  page: 1,
  q: "",
  type: "",
  key: "",
  mode: "",
  hitlist: false,
  min_rating: 0,
  sets: [],
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const searchEl         = document.getElementById("search");
const filterType       = document.getElementById("filter-type");
const filterKey        = document.getElementById("filter-key");
const filterMode       = document.getElementById("filter-mode");
const filterRating     = document.getElementById("filter-rating");
const filterHitlistBtn = document.getElementById("filter-hitlist-btn");
const clearBtn         = document.getElementById("clear-btn");
const selectModeBtn    = document.getElementById("select-mode-btn");
const bulkBar          = document.getElementById("bulk-bar");
const bulkCount        = document.getElementById("bulk-count");
const bulkSelectAllBtn = document.getElementById("bulk-select-all-btn");
const bulkMergeBtn     = document.getElementById("bulk-merge-btn");
const bulkDeleteBtn    = document.getElementById("bulk-delete-btn");
const bulkCancelBtn    = document.getElementById("bulk-cancel-btn");
const tuneList         = document.getElementById("tune-list");
const pagination    = document.getElementById("pagination");
const resultCount   = document.getElementById("result-count");
const statsBar      = document.getElementById("stats-bar");
const statsText     = document.getElementById("stats-text");
const modalOverlay  = document.getElementById("modal-overlay");
const modalContent  = document.getElementById("modal-content");
const modalClose    = document.getElementById("modal-close");
const viewLibrary   = document.getElementById("view-library");
const viewSets      = document.getElementById("view-sets");
const navLibrary    = document.getElementById("nav-library");
const navSets       = document.getElementById("nav-sets");
const importBtn     = document.getElementById("import-btn");
const importOverlay = document.getElementById("import-overlay");
const importClose   = document.getElementById("import-close");
const importFile    = document.getElementById("import-file");
const importFilename= document.getElementById("import-filename");
const importSubmit  = document.getElementById("import-submit");
const importResult  = document.getElementById("import-result");
const newSetBtn     = document.getElementById("new-set-btn");
const newSetForm    = document.getElementById("new-set-form");
const newSetName    = document.getElementById("new-set-name");
const newSetNotes   = document.getElementById("new-set-notes");
const createSetBtn  = document.getElementById("create-set-btn");
const cancelSetBtn  = document.getElementById("cancel-set-btn");
const setsList      = document.getElementById("sets-list");
const viewNotes         = document.getElementById("view-notes");
const navNotes          = document.getElementById("nav-notes");
const viewAchievements  = document.getElementById("view-achievements");
const navAchievements   = document.getElementById("nav-achievements");
const notesDocList  = document.getElementById("notes-doc-list");
const notesEditor   = document.getElementById("notes-editor");
const newDocBtn     = document.getElementById("new-doc-btn");

// ── Select mode ───────────────────────────────────────────────────────────────
let _selectMode = false;
const _selectedIds = new Set();

function _enterSelectMode() {
  _selectMode = true;
  _selectedIds.clear();
  selectModeBtn.textContent = "Done";
  selectModeBtn.classList.add("active");
  bulkBar.classList.remove("hidden");
  tuneList.classList.add("select-mode");
  _updateBulkBar();
}

function _exitSelectMode() {
  _selectMode = false;
  _selectedIds.clear();
  selectModeBtn.textContent = "Select";
  selectModeBtn.classList.remove("active");
  bulkBar.classList.add("hidden");
  tuneList.classList.remove("select-mode");
  tuneList.querySelectorAll(".tune-card.selected").forEach(c => c.classList.remove("selected"));
}

function _updateBulkBar() {
  const n = _selectedIds.size;
  bulkCount.textContent = `${n} selected`;
  bulkDeleteBtn.disabled = n === 0;
  bulkMergeBtn.disabled = n < 2;
  const total = tuneList.querySelectorAll(".tune-card").length;
  bulkSelectAllBtn.textContent = (n > 0 && n === total) ? "Deselect all" : "Select all";
}

function _toggleCard(card) {
  const id = card.dataset.id;
  if (_selectedIds.has(id)) {
    _selectedIds.delete(id);
    card.classList.remove("selected");
  } else {
    _selectedIds.add(id);
    card.classList.add("selected");
  }
  _updateBulkBar();
}

selectModeBtn.addEventListener("click", () => {
  if (_selectMode) _exitSelectMode(); else _enterSelectMode();
});

bulkCancelBtn.addEventListener("click", _exitSelectMode);

bulkSelectAllBtn.addEventListener("click", () => {
  const cards = tuneList.querySelectorAll(".tune-card");
  const total = cards.length;
  if (_selectedIds.size === total) {
    // deselect all
    cards.forEach(c => { _selectedIds.delete(c.dataset.id); c.classList.remove("selected"); });
  } else {
    // select all
    cards.forEach(c => { _selectedIds.add(c.dataset.id); c.classList.add("selected"); });
  }
  _updateBulkBar();
});

bulkDeleteBtn.addEventListener("click", async () => {
  const ids = [..._selectedIds];
  if (!ids.length) return;
  const n = ids.length;
  if (!confirm(`Delete ${n} tune${n !== 1 ? "s" : ""}? This cannot be undone.`)) return;
  bulkDeleteBtn.disabled = true;
  bulkDeleteBtn.textContent = "Deleting…";
  try {
    await apiFetch("/api/tunes/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.map(Number) }),
    });
    _exitSelectMode();
    await Promise.all([loadStats(), loadFilters(), loadTunes()]);
  } catch {
    alert("Failed to delete tunes. Please try again.");
    bulkDeleteBtn.disabled = false;
    bulkDeleteBtn.textContent = "Delete selected";
  }
});

// ── Group tunes as versions ───────────────────────────────────────────────────

function _showGroupDialog(tunes) {
  // tunes: array of {id, title, key}
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const labelInputs = tunes.map((t, i) =>
    `<label class="ff-url-label">Version label for <strong>${escHtml(t.title)}</strong>${t.key ? ` (${escHtml(t.key)})` : ""}</label>
     <input id="group-label-${i}" type="text" class="ff-url-input"
            value="${escHtml(t.key ? `Version in ${t.key}` : `Version ${i + 1}`)}"
            placeholder="e.g. Version in D" />`
  ).join("");

  modalContent.innerHTML = `
    <h2 class="modal-title">Group as Versions</h2>
    <p class="modal-abc-label">These tunes will be grouped under a single entry. Each version remains its own tune with its own sheet music — they are just listed together when you click the group name.</p>

    <div class="merge-form">
      <label class="ff-url-label">Group title (shown in the library)</label>
      <input id="group-title" type="text" class="ff-url-input" value="${escHtml(tunes[0].title)}" />
      ${labelInputs}
    </div>

    <div class="notes-actions" style="margin-top:1.25rem">
      <button id="group-confirm-btn" class="btn-primary">Create group</button>
      <button id="group-cancel-btn" class="btn-secondary">Cancel</button>
      <span id="group-status" class="notes-status"></span>
    </div>
  `;

  document.getElementById("group-cancel-btn").addEventListener("click", closeModal);

  document.getElementById("group-confirm-btn").addEventListener("click", async () => {
    const groupTitle = document.getElementById("group-title").value.trim();
    const labels = tunes.map((_, i) =>
      document.getElementById(`group-label-${i}`).value.trim()
    );
    const status = document.getElementById("group-status");
    if (!groupTitle) { status.textContent = "Group title is required."; return; }

    const confirmBtn = document.getElementById("group-confirm-btn");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Grouping…";
    status.textContent = "";

    try {
      await apiFetch("/api/tunes/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: groupTitle,
          tune_ids: tunes.map(t => Number(t.id)),
          labels,
        }),
      });
      closeModal();
      _exitSelectMode();
      await Promise.all([loadStats(), loadFilters(), loadTunes()]);
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Create group";
    }
  });
}

bulkMergeBtn.addEventListener("click", async () => {
  if (_selectedIds.size < 2) return;
  const ids = [..._selectedIds];
  // Reject if any selected card is itself a parent (already has versions)
  const parentCards = ids.filter(id => {
    const card = tuneList.querySelector(`.tune-card[data-id="${id}"]`);
    return card && Number(card.dataset.versions || 0) > 0;
  });
  if (parentCards.length > 0) {
    alert("One or more selected tunes already have versions. Ungroup them first before re-grouping.");
    return;
  }
  bulkMergeBtn.disabled = true;
  bulkMergeBtn.textContent = "Loading…";
  try {
    const tunes = await Promise.all(ids.map(id => fetchTune(id)));
    _showGroupDialog(tunes);
  } catch {
    alert("Could not load tune data. Please try again.");
  } finally {
    bulkMergeBtn.disabled = (_selectedIds.size < 2);
    bulkMergeBtn.textContent = "Group as versions";
  }
});

// ── Utilities ────────────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function typeBadgeClass(type) {
  const map = {
    reel: "badge-reel",
    jig: "badge-jig",
    hornpipe: "badge-hornpipe",
    "slip jig": "badge-slip-jig",
    polka: "badge-polka",
  };
  return map[type] || "badge-other";
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── API ───────────────────────────────────────────────────────────────────────
async function apiFetch(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let detail = "";
    try { detail = (await r.json()).detail || ""; } catch (_) {}
    throw new Error(detail || `Request failed (${r.status})`);
  }
  return r.json();
}

async function fetchFilters() {
  return apiFetch("/api/filters");
}

async function fetchTunes() {
  const params = new URLSearchParams({ page: state.page, page_size: PAGE_SIZE });
  if (state.q)          params.set("q",          state.q);
  if (state.type)       params.set("type",        state.type);
  if (state.key)        params.set("key",         state.key);
  if (state.mode)       params.set("mode",        state.mode);
  if (state.hitlist)    params.set("hitlist",     "1");
  if (state.min_rating) params.set("min_rating",  state.min_rating);
  return apiFetch(`/api/tunes?${params}`);
}

async function fetchTune(id) {
  return apiFetch(`/api/tunes/${id}`);
}

async function fetchStats() {
  return apiFetch("/api/stats");
}

async function fetchSets() {
  const sets = await apiFetch("/api/sets");
  state.sets = sets;
  return sets;
}

async function apiCreateSet(name, notes) {
  return apiFetch("/api/sets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, notes }),
  });
}

async function apiDeleteSet(id) {
  return apiFetch(`/api/sets/${id}`, { method: "DELETE" });
}

async function apiGetSet(id) {
  return apiFetch(`/api/sets/${id}`);
}

async function apiAddTuneToSet(setId, tuneId) {
  return apiFetch(`/api/sets/${setId}/tunes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tune_id: tuneId }),
  });
}

async function apiRemoveTuneFromSet(setId, tuneId) {
  return apiFetch(`/api/sets/${setId}/tunes/${tuneId}`, { method: "DELETE" });
}

async function apiSaveNotes(tuneId, notes) {
  return apiFetch(`/api/tunes/${tuneId}/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
}

// ── Note documents API ────────────────────────────────────────────────────────
async function fetchNoteDocuments() {
  return apiFetch("/api/note-documents");
}

async function apiCreateNoteDocument(title = "Untitled") {
  return apiFetch("/api/note-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

async function fetchNoteDocument(id) {
  return apiFetch(`/api/note-documents/${id}`);
}

async function apiUpdateNoteDocument(id, fields) {
  return apiFetch(`/api/note-documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
}

async function apiDeleteNoteDocument(id) {
  return apiFetch(`/api/note-documents/${id}`, { method: "DELETE" });
}

async function apiAddLinkAttachment(docId, url, title) {
  return apiFetch(`/api/note-documents/${docId}/attachments/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, title }),
  });
}

async function apiDeleteAttachment(attId) {
  return apiFetch(`/api/note-attachments/${attId}`, { method: "DELETE" });
}

async function apiDeleteTune(id) {
  return apiFetch(`/api/tunes/${id}`, { method: "DELETE" });
}


// ── View switching ────────────────────────────────────────────────────────────
function switchView(view) {
  state.view = view;
  [viewLibrary, viewSets, viewNotes, viewAchievements].forEach(v => v.classList.add("hidden"));
  [navLibrary, navSets, navNotes, navAchievements].forEach(n => n.classList.remove("active"));

  if (view === "library") {
    viewLibrary.classList.remove("hidden");
    navLibrary.classList.add("active");
  } else {
    if (_selectMode) _exitSelectMode();
  }
  if (view === "sets") {
    viewSets.classList.remove("hidden");
    navSets.classList.add("active");
    loadSets();
  } else if (view === "notes") {
    viewNotes.classList.remove("hidden");
    navNotes.classList.add("active");
    loadNoteDocuments();
  } else if (view === "achievements") {
    viewAchievements.classList.remove("hidden");
    navAchievements.classList.add("active");
    loadAchievements();
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderTunes(data) {
  const { tunes, total, page, pages } = data;

  resultCount.textContent = total
    ? `${total.toLocaleString()} tune${total !== 1 ? "s" : ""} found`
    : "";

  if (!tunes.length) {
    pagination.innerHTML = "";
    const noFilters = !state.q && !state.type && !state.key && !state.mode && !state.hitlist && !state.min_rating;
    if (noFilters) {
      tuneList.innerHTML = `
        <div class="empty-library">
          <div class="empty-library-icon">🎵</div>
          <h2>Your library is empty</h2>
          <p>Import your first tune to get started. You can add tunes from TheSession.org, a FlutefFling catalogue, an ABC file, or paste ABC notation directly.</p>
          <div class="empty-library-actions">
            <button class="btn-primary" id="empty-import-btn">Import Tunes</button>
            <button class="btn-secondary" id="empty-help-btn">How does this work?</button>
          </div>
        </div>`;
      document.getElementById("empty-import-btn").addEventListener("click", () => {
        importOverlay.classList.remove("hidden");
        document.body.style.overflow = "hidden";
      });
      document.getElementById("empty-help-btn").addEventListener("click", _openHelp);
    } else {
      tuneList.innerHTML = '<p class="empty">No tunes match your search.</p>';
    }
    return;
  }

  tuneList.innerHTML = tunes.map(t => {
    const typeClass = typeBadgeClass(t.type);
    const typeLabel = t.type
      ? `<span class="badge ${typeClass}">${escHtml(t.type)}</span>`
      : "";
    const keyLabel = t.key
      ? `<span class="badge badge-key">${escHtml(t.key)}</span>`
      : "";
    const vCount = t.version_count || 0;
    const versionBadge = vCount > 0
      ? `<span class="badge badge-versions">${vCount} version${vCount !== 1 ? "s" : ""}</span>`
      : "";
    const rating = t.rating || 0;
    const stars = [1,2,3,4,5].map(n =>
      `<button class="star-btn${rating >= n ? " filled" : ""}" data-n="${n}" tabindex="-1">★</button>`
    ).join("");
    return `
      <article class="tune-card${t.on_hitlist ? " on-hitlist" : ""}" data-id="${t.id}" data-versions="${vCount}"
               data-rating="${rating}" data-hitlist="${t.on_hitlist || 0}"
               tabindex="0" role="button" aria-label="${escHtml(t.title)}">
        <button class="hitlist-btn${t.on_hitlist ? " active" : ""}"
                title="${t.on_hitlist ? "Remove from hitlist" : "Add to hitlist"}">📌</button>
        <div class="card-title${t.on_hitlist ? " hitlist-title" : ""}">${escHtml(t.title)}</div>
        <div class="card-meta">${typeLabel}${keyLabel}${versionBadge}</div>
        <div class="card-stars">${stars}</div>
        <button class="tune-delete-btn" data-id="${t.id}" title="Delete tune" aria-label="Delete ${escHtml(t.title)}">✕</button>
      </article>`;
  }).join("");

  renderPagination(page, pages);
}

function renderPagination(current, total) {
  if (total <= 1) { pagination.innerHTML = ""; return; }

  const visible = new Set([1, total]);
  for (let p = Math.max(1, current - 2); p <= Math.min(total, current + 2); p++) {
    visible.add(p);
  }
  const sorted = [...visible].sort((a, b) => a - b);

  let html = `<button ${current === 1 ? "disabled" : ""} data-page="${current - 1}">‹</button>`;
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) html += `<button disabled>…</button>`;
    html += `<button class="${p === current ? "active" : ""}" data-page="${p}">${p}</button>`;
    prev = p;
  }
  html += `<button ${current === total ? "disabled" : ""} data-page="${current + 1}">›</button>`;

  pagination.innerHTML = html;
}

// Render a notes string: URLs become playable embeds or clickable links
function renderNotesHtml(text) {
  if (!text) return "";
  const urlRe = /https?:\/\/[^\s<>"]+/g;
  const parts = [];
  let last = 0;
  let m;

  function shortUrl(u) {
    try {
      const { hostname, pathname } = new URL(u);
      const path = pathname.length > 40 ? pathname.slice(0, 38) + "…" : pathname;
      return hostname + path;
    } catch { return u.length > 60 ? u.slice(0, 58) + "…" : u; }
  }

  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) parts.push(`<span>${escHtml(text.slice(last, m.index))}</span>`);
    const url = m[0];
    const urlEsc = escHtml(url);
    if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(url) || /\/api\/(uploads|dropbox\/file)\b/.test(url)) {
      parts.push(`<div class="notes-media-link">
        <button class="btn-secondary btn-sm media-play-btn" data-url="${urlEsc}" data-media-type="audio">▶ Play audio</button>
        <a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">${escHtml(shortUrl(url))}</a>
      </div>`);
    } else if (/(?:youtube\.com\/watch\?.*v=|youtu\.be\/)/.test(url)) {
      parts.push(`<div class="notes-media-link">
        <button class="btn-secondary btn-sm media-play-btn" data-url="${urlEsc}" data-media-type="video">▶ Watch video</button>
        <a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">${escHtml(shortUrl(url))}</a>
      </div>`);
    } else if (/\.pdf(\?|$)/i.test(url)) {
      parts.push(`<a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">📄 ${escHtml(shortUrl(url))}</a>`);
    } else {
      parts.push(`<a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">${escHtml(shortUrl(url))}</a>`);
    }
    last = m.index + url.length;
  }
  if (last < text.length) parts.push(`<span>${escHtml(text.slice(last))}</span>`);
  return parts.join("").replace(/\n/g, "<br>");
}

function renderModal(tune, onBack = null) {
  const typeClass = typeBadgeClass(tune.type);
  const typeBadge = tune.type
    ? `<span class="badge ${typeClass}">${escHtml(tune.type)}</span>`
    : "";
  const keyBadge = tune.key
    ? `<span class="badge badge-key">${escHtml(tune.key)}</span>`
    : "";
  const backBtn = onBack
    ? `<button id="modal-back-btn" class="modal-back-btn btn-secondary btn-sm">← Back</button>`
    : "";
  const versionLine = tune.version_label
    ? `<p class="modal-version-label">${escHtml(tune.version_label)}</p>`
    : "";

  const ratingLabels = ["Not yet rated","Just starting","Getting there","Almost there","Know it well","Nailed it!"];
  const modalRating = tune.rating || 0;
  const modalStars = [1,2,3,4,5].map(n =>
    `<button class="modal-star-btn${modalRating >= n ? " filled" : ""}" data-n="${n}">★</button>`
  ).join("");
  const ratingRow = `
    <div class="modal-rating-row">
      <div class="modal-stars" id="modal-stars">${modalStars}</div>
      <span class="modal-rating-label" id="modal-rating-label">${ratingLabels[modalRating]}</span>
    </div>`;
  const aliasLine = tune.aliases && tune.aliases.length
    ? `<p class="modal-aliases">Also known as: ${tune.aliases.map(escHtml).join(", ")}</p>`
    : "";
  const importedLine = tune.imported_at
    ? `<p class="modal-imported">Imported: ${new Date(tune.imported_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>`
    : "";
  const tagLine = tune.tags && tune.tags.length
    ? `<div class="modal-meta">${tune.tags.map(g => `<span class="badge badge-other">${escHtml(g)}</span>`).join("")}</div>`
    : "";

  // Extract PDF and MP3 URLs from notes (FlutefFling, Dropbox, or any source)
  const pdfUrl = (() => {
    if (!tune.notes) return null;
    const m = tune.notes.match(/sheet music \(PDF\):\s*(https?:\/\/\S+)/);
    return m ? m[1] : null;
  })();
  const setsOptions = state.sets
    .map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`)
    .join("");
  const setsFooter = state.sets.length
    ? `<div class="modal-sets-row">
        <select id="set-select" class="set-select">
          <option value="">Add to a set…</option>
          ${setsOptions}
        </select>
        <button id="add-to-set-btn" class="btn-secondary">+ Add</button>
        <span id="set-status" class="set-status"></span>
      </div>`
    : `<p class="modal-hint">Go to Sets to create a set, then add this tune to it.</p>`;

  modalContent.innerHTML = `
    ${backBtn}
    <h2 class="modal-title">${escHtml(tune.title)}</h2>
    ${versionLine}
    <div class="modal-meta">${typeBadge}${keyBadge}</div>
    ${ratingRow}
    ${aliasLine}
    ${importedLine}
    ${tagLine}

    <div class="modal-tabs">
      <button class="tab-btn active" data-tab="music">Sheet Music</button>
      <button class="tab-btn" data-tab="abc">ABC Text</button>
      <button class="tab-btn" data-tab="notes">Notes</button>
    </div>

    <div id="tab-music" class="tab-panel">
      <div class="sheet-music-wrap">
        <div id="sheet-music-render"></div>
        ${pdfUrl ? `<iframe id="pdf-embed" class="pdf-embed" src="${escHtml(pdfUrl)}" title="Sheet music PDF"></iframe>` : ""}
        ${pdfUrl ? `<p class="pdf-link-hint"><a href="${escHtml(pdfUrl)}" target="_blank" rel="noopener">Open PDF in new tab ↗</a></p>` : ""}
      </div>
      ${pdfUrl ? `<div class="ff-download-row">
        <a class="btn-secondary ff-dl-btn" href="/api/proxy-download?url=${encodeURIComponent(pdfUrl)}" download>⬇ Download PDF</a>
      </div>` : ""}
      <div id="audio-player-container" class="audio-player-wrap"></div>
      <div id="bar-selection-info" class="bar-selection-info hidden"></div>
      <p id="audio-unavailable" class="audio-unavailable hidden">
        Audio playback is not supported in this browser.
      </p>
      <div class="attach-audio-row">
        <button id="attach-audio-btn" class="btn-secondary">🎧 Add audio link</button>
      </div>
      <div id="attach-audio-panel" class="attach-audio-panel hidden">
        <div class="attach-audio-tabs">
          <button class="attach-tab-btn active" data-tab="upload">Upload file</button>
          <button class="attach-tab-btn" data-tab="url">Paste URL</button>
          <button class="attach-tab-btn" data-tab="dropbox">Dropbox</button>
        </div>
        <div id="attach-tab-upload" class="attach-tab-panel">
          <label class="attach-file-label">
            <input id="attach-audio-file" type="file" accept="audio/*" class="attach-file-input">
            <span class="attach-file-hint">Choose an audio file from your computer</span>
          </label>
          <p id="attach-upload-status" class="ff-cat-hint"></p>
        </div>
        <div id="attach-tab-url" class="attach-tab-panel hidden">
          <div class="attach-audio-browse-row">
            <input id="attach-url-input" class="attach-audio-path" type="url" placeholder="https://…">
            <button id="attach-url-btn" class="btn-secondary">Use URL</button>
          </div>
          <p id="attach-url-status" class="ff-cat-hint"></p>
        </div>
        <div id="attach-tab-dropbox" class="attach-tab-panel hidden">
          <div class="attach-audio-browse-row">
            <input id="attach-audio-path" class="attach-audio-path" type="text" placeholder="/your/dropbox/folder">
            <button id="attach-audio-browse" class="btn-secondary">Browse</button>
          </div>
          <p id="attach-audio-status" class="ff-cat-hint"></p>
          <div id="attach-audio-list" class="attach-audio-list"></div>
        </div>
      </div>
    </div>

    <div id="tab-abc" class="tab-panel hidden">
      <p class="modal-abc-label">ABC Notation — edit below and save to update the sheet music.</p>
      <textarea id="abc-edit-textarea" class="modal-abc-edit" spellcheck="false" rows="16">${escHtml(tune.abc)}</textarea>
      <div class="notes-actions">
        <button id="save-abc-btn" class="btn-primary">Save &amp; Re-render</button>
        <span id="abc-status" class="notes-status"></span>
      </div>
    </div>

    <div id="tab-notes" class="tab-panel hidden">
      ${tune.notes ? `<div class="notes-rendered">${renderNotesHtml(tune.notes)}</div><hr class="notes-divider">` : ""}
      <p class="modal-abc-label">Edit Notes</p>
      <textarea id="notes-textarea" class="notes-textarea"
        placeholder="Add your own notes about this tune…">${escHtml(tune.notes || "")}</textarea>
      <div class="notes-actions">
        <button id="save-notes-btn" class="btn-primary">Save Notes</button>
        <span id="notes-status" class="notes-status"></span>
      </div>
    </div>

    <div class="modal-footer">
      ${setsFooter}
      <div class="modal-danger-row">
        <button id="modal-hitlist-btn" class="btn-secondary${tune.on_hitlist ? " hitlist-active" : ""}">
          📌 ${tune.on_hitlist ? "On Hitlist" : "Add to Hitlist"}
        </button>
        <button id="delete-tune-modal-btn" class="btn-danger" data-tune-id="${tune.id}">Delete from Library</button>
      </div>
    </div>
  `;

  // Back button (from versions panel)
  if (onBack) {
    document.getElementById("modal-back-btn").addEventListener("click", onBack);
  }

  // Modal star rating
  let _modalRating = tune.rating || 0;
  modalContent.querySelectorAll(".modal-star-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const n = Number(btn.dataset.n);
      const newRating = n === _modalRating ? 0 : n;
      try {
        await apiFetch(`/api/tunes/${tune.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: newRating }),
        });
        _modalRating = newRating;
        modalContent.querySelectorAll(".modal-star-btn").forEach((s, i) =>
          s.classList.toggle("filled", i + 1 <= newRating)
        );
        document.getElementById("modal-rating-label").textContent = ratingLabels[newRating];
        // Also update the card in the background
        const card = tuneList.querySelector(`.tune-card[data-id="${tune.id}"]`);
        if (card) {
          card.dataset.rating = newRating;
          card.querySelectorAll(".star-btn").forEach((s, i) =>
            s.classList.toggle("filled", i + 1 <= newRating)
          );
        }
      } catch { /* ignore */ }
    });
  });

  // Modal hitlist toggle
  const modalHitlistBtn = document.getElementById("modal-hitlist-btn");
  let _modalHitlist = tune.on_hitlist || 0;
  modalHitlistBtn.addEventListener("click", async () => {
    const on_hitlist = _modalHitlist ? 0 : 1;
    try {
      await apiFetch(`/api/tunes/${tune.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on_hitlist }),
      });
      _modalHitlist = on_hitlist;
      modalHitlistBtn.textContent = `📌 ${on_hitlist ? "On Hitlist" : "Add to Hitlist"}`;
      modalHitlistBtn.classList.toggle("hitlist-active", Boolean(on_hitlist));
      const card = tuneList.querySelector(`.tune-card[data-id="${tune.id}"]`);
      if (card) {
        card.dataset.hitlist = on_hitlist;
        card.classList.toggle("on-hitlist", Boolean(on_hitlist));
        card.querySelector(".card-title")?.classList.toggle("hitlist-title", Boolean(on_hitlist));
        const hBtn = card.querySelector(".hitlist-btn");
        if (hBtn) {
          hBtn.classList.toggle("active", Boolean(on_hitlist));
          hBtn.title = on_hitlist ? "Remove from hitlist" : "Add to hitlist";
        }
      }
    } catch { /* ignore */ }
  });

  // Media play buttons in notes
  modalContent.addEventListener("click", e => {
    const btn = e.target.closest(".media-play-btn");
    if (btn) openMediaOverlay(btn.dataset.url, btn.dataset.mediaType);
  });

  // Tab switching
  modalContent.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      modalContent.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      modalContent.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
    });
  });

  // Notes save
  document.getElementById("save-notes-btn").addEventListener("click", async () => {
    const btn = document.getElementById("save-notes-btn");
    const status = document.getElementById("notes-status");
    const notes = document.getElementById("notes-textarea").value;
    btn.disabled = true;
    try {
      await apiSaveNotes(tune.id, notes);
      status.textContent = "Saved!";
      status.className = "notes-status notes-saved";
      setTimeout(() => { status.textContent = ""; }, 2000);
    } catch {
      status.textContent = "Failed to save.";
      status.className = "notes-status notes-error";
    } finally {
      btn.disabled = false;
    }
  });

  // ABC edit + save
  document.getElementById("save-abc-btn").addEventListener("click", async () => {
    const btn    = document.getElementById("save-abc-btn");
    const status = document.getElementById("abc-status");
    const abc    = document.getElementById("abc-edit-textarea").value;
    btn.disabled = true;
    try {
      const res = await fetch(`/api/tunes/${tune.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abc }),
      });
      if (res.ok) {
        status.textContent = "Saved!";
        status.className = "notes-status notes-saved";
        // Re-render the sheet music with the updated ABC
        renderSheetMusic(abc);
        setTimeout(() => { status.textContent = ""; }, 2000);
      } else {
        status.textContent = "Failed to save.";
        status.className = "notes-status notes-error";
      }
    } catch {
      status.textContent = "Failed to save.";
      status.className = "notes-status notes-error";
    } finally {
      btn.disabled = false;
    }
  });

  // Add to set
  const addToSetBtn = document.getElementById("add-to-set-btn");
  if (addToSetBtn) {
    addToSetBtn.addEventListener("click", async () => {
      const setId = document.getElementById("set-select").value;
      const setStatus = document.getElementById("set-status");
      if (!setId) return;
      try {
        const result = await apiAddTuneToSet(setId, tune.id);
        setStatus.textContent = result.added ? "Added!" : "Already in set.";
        setStatus.className = "set-status set-saved";
        setTimeout(() => { setStatus.textContent = ""; }, 2000);
        await fetchSets();
      } catch {
        setStatus.textContent = "Failed.";
        setStatus.className = "set-status set-error";
      }
    });
  }

  // Attach audio panel
  const attachAudioBtn    = document.getElementById("attach-audio-btn");
  const attachAudioPanel  = document.getElementById("attach-audio-panel");

  attachAudioBtn.addEventListener("click", () => {
    attachAudioPanel.classList.toggle("hidden");
  });

  // Tab switching
  attachAudioPanel.querySelectorAll(".attach-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      attachAudioPanel.querySelectorAll(".attach-tab-btn").forEach(b => b.classList.remove("active"));
      attachAudioPanel.querySelectorAll(".attach-tab-panel").forEach(p => p.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(`attach-tab-${btn.dataset.tab}`).classList.remove("hidden");
    });
  });

  // Append a URL to notes and refresh the rendered notes section
  async function _appendUrlToNotes(url, statusEl) {
    const current = tune.notes || "";
    const newNotes = current.trimEnd() ? `${current.trimEnd()}\n${url}` : url;
    try {
      await apiFetch(`/api/tunes/${tune.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: newNotes }),
      });
      tune.notes = newNotes;
      // Refresh rendered notes in Notes tab
      const rendered = document.querySelector("#tab-notes .notes-rendered");
      if (rendered) {
        rendered.innerHTML = renderNotesHtml(newNotes);
      } else {
        const tab = document.getElementById("tab-notes");
        if (tab) tab.insertAdjacentHTML("afterbegin", `<div class="notes-rendered">${renderNotesHtml(newNotes)}</div><hr class="notes-divider">`);
      }
      if (statusEl) statusEl.textContent = "";
      attachAudioPanel.classList.add("hidden");
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error: ${err.message}`;
    }
  }

  // Upload tab
  document.getElementById("attach-audio-file").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById("attach-upload-status");
    statusEl.textContent = "Uploading…";
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/tunes/${tune.id}/upload-audio`, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
      const { url } = await res.json();
      await _appendUrlToNotes(`${window.location.origin}${url}`, statusEl);
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  });

  // URL tab
  document.getElementById("attach-url-btn").addEventListener("click", async () => {
    const urlInput = document.getElementById("attach-url-input");
    const statusEl = document.getElementById("attach-url-status");
    const url = urlInput.value.trim();
    if (!url) { statusEl.textContent = "Please enter a URL."; return; }
    urlInput.value = "";
    await _appendUrlToNotes(url, statusEl);
  });

  // Dropbox tab
  const attachAudioPathInput = document.getElementById("attach-audio-path");
  const attachAudioStatus    = document.getElementById("attach-audio-status");
  const attachAudioList      = document.getElementById("attach-audio-list");

  async function _browseForAudio(path) {
    attachAudioStatus.textContent = "Loading…";
    attachAudioList.innerHTML = "";
    try {
      const data = await apiFetch("/api/dropbox/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path || "/" }),
      });
      attachAudioStatus.textContent = "";
      const items = data.files.filter(f => f.type === "folder" || ["mp3", "m4a", "ogg"].includes(f.type));
      if (!items.length) {
        attachAudioList.innerHTML = '<p class="ff-cat-empty">No audio files found in this folder.</p>';
        return;
      }
      attachAudioList.innerHTML = items.map(f => {
        const icon = f.type === "folder" ? "📁" : "🎧";
        const label = f.type === "folder" ? "Open" : "Add to notes";
        return `<div class="ff-cat-entry">
          <div class="ff-cat-info"><span class="ff-cat-name">${icon} ${escHtml(f.name)}</span></div>
          <button class="ff-cat-add btn-secondary" data-path="${escHtml(f.path)}" data-type="${escHtml(f.type)}">${label}</button>
        </div>`;
      }).join("");
      attachAudioList.querySelectorAll(".ff-cat-add").forEach(btn => {
        btn.addEventListener("click", async () => {
          const fPath = btn.dataset.path;
          if (btn.dataset.type === "folder") {
            attachAudioPathInput.value = fPath;
            _browseForAudio(fPath);
            return;
          }
          btn.disabled = true;
          btn.textContent = "Adding…";
          const proxyUrl = `${window.location.origin}/api/dropbox/file?path=${encodeURIComponent(fPath)}`;
          await _appendUrlToNotes(proxyUrl, attachAudioStatus);
          btn.disabled = false;
          btn.textContent = "Add to notes";
        });
      });
    } catch (err) {
      attachAudioStatus.textContent = `Dropbox error: ${err.message}`;
    }
  }

  document.getElementById("attach-audio-browse").addEventListener("click", () => {
    _browseForAudio(attachAudioPathInput.value.trim() || "/");
  });

  // Delete tune from modal
  document.getElementById("delete-tune-modal-btn").addEventListener("click", async (ev) => {
    if (!confirm(`Delete "${tune.title}" from your library? This cannot be undone.`)) return;
    ev.currentTarget.disabled = true;
    try {
      await apiDeleteTune(tune.id);
      closeModal();
      loadTunes();
    } catch {
      alert("Failed to delete tune. Please try again.");
      ev.currentTarget.disabled = false;
    }
  });

  // Render sheet music after paint (skip if no ABC — PDF or empty)
  requestAnimationFrame(() => {
    if (tune.abc) {
      renderSheetMusic(tune.abc);
    }
  });
}

// ── Bar-range selection (practice loop) ──────────────────────────────────────
let _visualObj = null;
let _synthController = null;
let _msPerMeasure = null;
let _barSel = { start: null, end: null };

// ── TheSession preview state ──────────────────────────────────────────────────
let _previewVisualObj = null;
let _previewSynthCtrl = null;
let _previewTuneData = null;
// When true, the next Play press will seek to the selected start bar.
// Cleared after the seek fires so that pause/resume doesn't re-seek.
let _barSeekPending = false;
// Ordered map of every bar: [{line, measure}, …] sorted by line then measure.
// ABCJS resets abcjs-mN per staff line, so we need (line, measure) as a pair.
let _barMap = [];

// Build the bar map.  Each entry stores a direct reference to the wrapper
// DOM element so that highlight queries are scoped to that exact element —
// avoiding the abcjs-lN ambiguity (all monophonic wrappers share abcjs-l0
// because lN encodes voice number, not visual line number).
function _buildBarMap() {
  const render = document.getElementById("sheet-music-render");
  if (!render) return [];

  const result = [];
  const wrappers = Array.from(render.querySelectorAll(".abcjs-staff-wrapper"));

  for (const wrapper of wrappers) {
    const seenMeasures = new Set();
    for (const el of wrapper.querySelectorAll("[class]")) {
      for (const cls of el.classList) {
        const m = cls.match(/^abcjs-m(\d+)$/);
        if (m) { seenMeasures.add(parseInt(m[1], 10)); break; }
      }
    }
    for (const measure of [...seenMeasures].sort((a, b) => a - b)) {
      result.push({ wrapper, measure });
    }
  }

  return result;
}

// Direct DOM click handler: identify the bar by finding the abcjs-mN class
// and the specific abcjs-staff-wrapper DOM element, then look both up in the
// bar map by object identity (not class name).
function _sheetMusicClickHandler(e) {
  const container = document.getElementById("sheet-music-render");

  // Walk up to find abcjs-mN.
  let measure = null;
  let el = e.target;
  while (el && el !== container) {
    for (const cls of (el.classList || [])) {
      const m = cls.match(/^abcjs-m(\d+)$/);
      if (m) { measure = parseInt(m[1], 10); break; }
    }
    if (measure !== null) break;
    el = el.parentElement;
  }
  if (measure === null) return;

  // Walk up to find the abcjs-staff-wrapper ancestor element.
  let wrapperEl = null;
  let ancestor = el.parentElement;
  while (ancestor && ancestor !== container) {
    if (ancestor.classList && ancestor.classList.contains("abcjs-staff-wrapper")) {
      wrapperEl = ancestor;
      break;
    }
    ancestor = ancestor.parentElement;
  }
  if (!wrapperEl) return;

  if (_barMap.length === 0) _barMap = _buildBarMap();
  // Match by DOM element identity — not class name — so duplicate abcjs-l0 wrappers
  // are distinguished correctly.
  const idx = _barMap.findIndex(b => b.wrapper === wrapperEl && b.measure === measure);
  if (idx === -1) return;
  _onMeasureClicked(idx);
}

function _onMeasureClicked(m) {
  const { start, end } = _barSel;

  if (start === null) {
    // Nothing selected → set start point
    _barSel = { start: m, end: m };
  } else if (start === end) {
    // Waiting for end click
    if (m === start) {
      _clearBarSel(); return; // same bar → cancel
    }
    _barSel = { start: Math.min(start, m), end: Math.max(start, m) };
  } else {
    // Range already set → start fresh
    _barSel = { start: m, end: m };
  }

  _barSeekPending = true;   // arm the seek for the next Play press
  _updateBarHighlight();
  _updateSelectionInfo();
  _applySelectionToPlayer();
}

function _updateBarHighlight() {
  document.querySelectorAll("#sheet-music-render .bar-selected, #sheet-music-render .bar-sel-start")
    .forEach(el => el.classList.remove("bar-selected", "bar-sel-start"));
  if (_barSel.start === null) return;

  const isPending = _barSel.start === _barSel.end;
  const cls = isPending ? "bar-sel-start" : "bar-selected";
  for (let i = _barSel.start; i <= _barSel.end; i++) {
    if (i >= _barMap.length) break;
    const { wrapper, measure } = _barMap[i];
    // Query inside the specific wrapper element — unambiguous even when multiple
    // wrappers share the same abcjs-lN class (voice-number, not visual-line).
    wrapper.querySelectorAll(`.abcjs-m${measure}`)
      .forEach(el => el.classList.add(cls));
  }
}

function _updateSelectionInfo() {
  const el = document.getElementById("bar-selection-info");
  if (!el) return;
  if (_barSel.start === null) { el.classList.add("hidden"); return; }

  const isPending = _barSel.start === _barSel.end;
  const lo = _barSel.start + 1;
  const hi = _barSel.end + 1;

  el.classList.remove("hidden");
  if (isPending) {
    el.innerHTML = `<span>Bar ${lo} — now click another bar to set the end point</span>`
      + `<button class="btn-secondary bar-sel-clear">Clear</button>`;
  } else {
    el.innerHTML = `<span>Bars ${lo}–${hi} selected — enable Loop &#8635; to repeat</span>`
      + `<button class="btn-secondary bar-sel-clear">Clear</button>`;
  }
  el.querySelector(".bar-sel-clear").addEventListener("click", _clearBarSel);
}

function _seekToBar(barIndex) {
  if (!_synthController || !_barMap.length) return;
  // frac = barIndex / totalBars is equivalent to (barIndex * msPerBar) / totalDuration
  // and works even when _msPerMeasure is unavailable.
  const frac = Math.max(0, Math.min(1, barIndex / _barMap.length));
  _synthController.seek(frac);
}

function _clearBarSel() {
  _barSel = { start: null, end: null };
  _barSeekPending = false;
  _updateBarHighlight();
  _updateSelectionInfo();
}

function _applySelectionToPlayer() {
  if (_barSel.start === null) return;
  _seekToBar(_barSel.start);
}
// ─────────────────────────────────────────────────────────────────────────────

function renderSheetMusic(abc) {
  const container = document.getElementById("sheet-music-render");
  if (!container || typeof ABCJS === "undefined") return;

  // Reset bar selection state for new tune
  _barSel = { start: null, end: null };
  _barMap = [];
  _visualObj = null;
  _synthController = null;
  _msPerMeasure = null;
  const infoEl = document.getElementById("bar-selection-info");
  if (infoEl) infoEl.classList.add("hidden");

  // Attach bar-selection click listener in capture phase so it fires even if
  // ABCJS stops propagation on its own SVG click handlers.
  container.addEventListener("click", _sheetMusicClickHandler, true);

  // Inject flute MIDI instrument into ABC before rendering
  const abcWithFlute = abc.replace(/(K:[^\n]*)(\n|$)/, "$1\n%%MIDI program 73\n");

  try {
    const visualObjs = ABCJS.renderAbc("sheet-music-render", abcWithFlute, {
      responsive: "resize",
      add_classes: true,
      paddingbottom: 10,
      paddingleft: 15,
      paddingright: 15,
      paddingtop: 10,
      selectTypes: false,
      foregroundColor: "#000000",
    });

    _visualObj = visualObjs[0];
    _msPerMeasure = typeof _visualObj.millisecondsPerMeasure === "function"
      ? _visualObj.millisecondsPerMeasure()
      : null;
    // _barMap is built lazily on first click, after any responsive re-render.

    if (!ABCJS.synth || !ABCJS.synth.supportsAudio()) {
      const el = document.getElementById("audio-unavailable");
      if (el) el.classList.remove("hidden");
      return;
    }

    // Cursor control: highlights the current note during playback
    const cursorControl = {
      // Seek to selected start bar the moment Play is first pressed.
      // seek() positions the audio buffer AND the timer; setProgress() updates
      // e.percent so that timer.start(e.percent) restarts from the right place.
      // _barSeekPending is a one-shot flag so that pause→resume does not re-seek.
      onStart() {
        if (!_barSeekPending || _barSel.start === null || !_barMap.length) return;
        _barSeekPending = false;
        const frac = Math.max(0, Math.min(1, _barSel.start / _barMap.length));
        // setProgress sets e.percent = frac so that the ABCJS-internal
        // timer.start(e.percent) fires the setProgress branch (which correctly
        // sets startTime) rather than reset() (which snaps the cursor to bar 0).
        const durMs = _msPerMeasure ? _barMap.length * _msPerMeasure : 30000;
        _synthController.setProgress(frac, durMs);
        // Seek the audio buffer *after* midiBuffer.start() has been called.
        // During active playback seek() reliably stops the current buffer and
        // restarts it from the target offset; calling it before start() can be
        // silently ignored in some browsers.
        const targetFrac = frac;
        setTimeout(() => { if (_synthController) _synthController.seek(targetFrac); }, 0);
      },
      onEvent(ev) {
        document.querySelectorAll("#sheet-music-render .abcjs-highlight")
          .forEach(el => el.classList.remove("abcjs-highlight"));
        if (ev && ev.elements) {
          ev.elements.forEach(grp => {
            if (grp) grp.forEach(el => el.classList.add("abcjs-highlight"));
          });
        }
        // Bar-range loop: when Loop is enabled and a range is selected, jump back
        // to the start bar once playback passes the end of the selected range.
        if (_barSel.start !== null && _barSel.start !== _barSel.end
            && ev && ev.measureStart && _msPerMeasure
            && _synthController.isLooping) {
          const endTimeMs = (_barSel.end + 1) * _msPerMeasure;
          if (ev.milliseconds >= endTimeMs) {
            _seekToBar(_barSel.start);
          }
        }
      },
      onFinished() {
        document.querySelectorAll("#sheet-music-render .abcjs-highlight")
          .forEach(el => el.classList.remove("abcjs-highlight"));
      },
    };

    _synthController = new ABCJS.synth.SynthController();
    _synthController.load("#audio-player-container", cursorControl, {
      displayLoop: true,
      displayRestart: true,
      displayPlay: true,
      displayProgress: true,
      displayWarp: true,
    });

    _synthController.setTune(_visualObj, false).catch(err => {
      console.warn("Audio init failed:", err);
    });
  } catch (err) {
    console.warn("Sheet music render failed:", err);
    if (container) container.textContent = "(Could not render sheet music)";
  }
}

function renderPreviewMusic(abc) {
  const container = document.getElementById("preview-sheet-render");
  if (!container || typeof ABCJS === "undefined") return;

  if (_previewSynthCtrl) {
    try { _previewSynthCtrl.stop(); } catch {}
    _previewSynthCtrl = null;
  }
  container.innerHTML = "";
  document.getElementById("preview-audio-container").innerHTML = "";

  const abcWithFlute = abc.replace(/(K:[^\n]*)(\n|$)/, "$1\n%%MIDI program 73\n");
  try {
    const visualObjs = ABCJS.renderAbc("preview-sheet-render", abcWithFlute, {
      responsive: "resize",
      add_classes: true,
      paddingbottom: 10,
      paddingleft: 15,
      paddingright: 15,
      paddingtop: 10,
      selectTypes: false,
      foregroundColor: "#000000",
    });
    _previewVisualObj = visualObjs[0];

    if (!ABCJS.synth || !ABCJS.synth.supportsAudio()) return;

    _previewSynthCtrl = new ABCJS.synth.SynthController();
    _previewSynthCtrl.load("#preview-audio-container", null, {
      displayLoop: true,
      displayRestart: true,
      displayPlay: true,
      displayProgress: true,
      displayWarp: true,
    });
    _previewSynthCtrl.setTune(_previewVisualObj, false).catch(err => {
      console.warn("Preview audio init failed:", err);
    });
  } catch (err) {
    console.warn("Preview render failed:", err);
    if (container) container.textContent = "(Could not render sheet music)";
  }
}

function showSessionPreview(tuneData) {
  _previewTuneData = tuneData;

  document.getElementById("session-search-pane").classList.add("hidden");
  const preview = document.getElementById("session-preview");
  preview.classList.remove("hidden");

  document.getElementById("session-preview-title").textContent = tuneData.title;
  const typeClass = typeBadgeClass(tuneData.type);
  document.getElementById("session-preview-badges").innerHTML =
    (tuneData.type ? `<span class="badge ${typeClass}">${escHtml(tuneData.type)}</span>` : "") +
    (tuneData.key  ? `<span class="badge badge-key">${escHtml(tuneData.key)}</span>` : "");

  document.getElementById("preview-abc-text").textContent = tuneData.abc;

  // Reset tabs to Sheet Music
  preview.querySelectorAll("[data-preview-tab]").forEach(b => b.classList.remove("active"));
  preview.querySelector('[data-preview-tab="sheet"]').classList.add("active");
  document.getElementById("preview-panel-sheet").classList.remove("hidden");
  document.getElementById("preview-panel-abc").classList.add("hidden");

  // Reset save button
  const saveBtn = document.getElementById("session-save-btn");
  saveBtn.textContent = "Save to Library";
  saveBtn.disabled = false;
  saveBtn.style.background = "";
  saveBtn.style.opacity = "";
  document.getElementById("session-save-status").textContent = "";

  requestAnimationFrame(() => renderPreviewMusic(tuneData.abc));
}

function renderSets(sets) {
  if (!sets.length) {
    setsList.innerHTML = '<p class="empty">No sets yet. Create one to organise tunes into a session!</p>';
    return;
  }

  setsList.innerHTML = sets.map(s => `
    <div class="set-card" data-set-id="${s.id}">
      <div class="set-card-header">
        <div class="set-card-info">
          <span class="set-name">${escHtml(s.name)}</span>
          <span class="set-count">${s.tune_count} tune${s.tune_count !== 1 ? "s" : ""}</span>
        </div>
        <div class="set-card-actions">
          <button class="btn-secondary set-expand-btn" data-set-id="${s.id}">View</button>
          <button class="btn-danger set-delete-btn" data-set-id="${s.id}" title="Delete set">✕</button>
        </div>
      </div>
      ${s.notes ? `<p class="set-notes">${escHtml(s.notes)}</p>` : ""}
      <div class="set-tunes-list hidden" id="set-tunes-${s.id}"></div>
    </div>
  `).join("");

  setsList.querySelectorAll(".set-expand-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.setId;
      const tunesDiv = document.getElementById(`set-tunes-${id}`);
      if (tunesDiv.classList.contains("hidden")) {
        tunesDiv.innerHTML = '<p class="loading" style="padding:.5rem">Loading…</p>';
        tunesDiv.classList.remove("hidden");
        btn.textContent = "Hide";
        const setData = await apiGetSet(id);
        if (!setData.tunes || !setData.tunes.length) {
          tunesDiv.innerHTML = '<p class="set-empty">No tunes yet – open a tune and use "Add to set".</p>';
        } else {
          tunesDiv.innerHTML = setData.tunes.map((t, i) => `
            <div class="set-tune-row">
              <span class="set-tune-pos">${i + 1}.</span>
              <span class="set-tune-title">${escHtml(t.title)}</span>
              <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
              <span class="badge badge-key">${escHtml(t.key || "")}</span>
              <button class="btn-icon remove-from-set"
                data-set-id="${id}" data-tune-id="${t.id}" title="Remove">✕</button>
            </div>
          `).join("");

          tunesDiv.querySelectorAll(".remove-from-set").forEach(rb => {
            rb.addEventListener("click", async () => {
              rb.disabled = true;
              try {
                await apiRemoveTuneFromSet(rb.dataset.setId, rb.dataset.tuneId);
                rb.closest(".set-tune-row").remove();
                const set = state.sets.find(s => String(s.id) === String(id));
                if (set) {
                  set.tune_count = Math.max(0, (set.tune_count || 1) - 1);
                  const countEl = document.querySelector(`[data-set-id="${id}"] .set-count`);
                  if (countEl) countEl.textContent = `${set.tune_count} tune${set.tune_count !== 1 ? "s" : ""}`;
                }
              } catch {
                alert("Failed to remove tune. Please try again.");
                rb.disabled = false;
              }
            });
          });
        }
      } else {
        tunesDiv.classList.add("hidden");
        btn.textContent = "View";
      }
    });
  });

  setsList.querySelectorAll(".set-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const name = btn.closest(".set-card").querySelector(".set-name").textContent;
      if (!confirm(`Delete set "${name}"?`)) return;
      btn.disabled = true;
      try {
        await apiDeleteSet(btn.dataset.setId);
        btn.closest(".set-card").remove();
        state.sets = state.sets.filter(s => String(s.id) !== String(btn.dataset.setId));
        if (!setsList.querySelector(".set-card")) {
          setsList.innerHTML = '<p class="empty">No sets yet. Create one to organise tunes into a session!</p>';
        }
      } catch {
        alert("Failed to delete set. Please try again.");
        btn.disabled = false;
      }
    });
  });
}

// ── Loaders ───────────────────────────────────────────────────────────────────
async function loadFilters() {
  let types, keys, modes;
  try {
    ({ types, keys, modes } = await fetchFilters());
  } catch { return; }
  if (!types) return;

  // Clear existing options (except placeholder) to allow safe re-calling
  filterType.innerHTML = '<option value="">All types</option>';
  filterKey.innerHTML  = '<option value="">All keys</option>';
  filterMode.innerHTML = '<option value="">All modes</option>';

  types.forEach(t => {
    const o = document.createElement("option");
    o.value = t; o.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    filterType.appendChild(o);
  });
  keys.forEach(k => {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    filterKey.appendChild(o);
  });
  modes.forEach(m => {
    const o = document.createElement("option");
    o.value = m; o.textContent = m.charAt(0).toUpperCase() + m.slice(1);
    filterMode.appendChild(o);
  });
}

async function loadStats() {
  try {
    const stats = await fetchStats();
    if (stats.total_tunes) {
      const byType = stats.by_type
        .slice(0, 4)
        .map(b => `${b.type}: ${b.count.toLocaleString()}`)
        .join("  ·  ");
      statsText.textContent = `${stats.total_tunes.toLocaleString()} tunes  ·  ${byType}`;
      statsBar.classList.remove("hidden");
    }
  } catch (_) { /* non-critical */ }
}

async function loadTunes() {
  tuneList.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const data = await fetchTunes();
    renderTunes(data);
  } catch (err) {
    tuneList.innerHTML = '<p class="empty">Failed to load tunes. Is the server running?</p>';
    console.error(err);
  }
}

async function loadSets() {
  setsList.innerHTML = '<p class="loading">Loading sets…</p>';
  try {
    const sets = await fetchSets();
    renderSets(sets);
  } catch (err) {
    setsList.innerHTML = '<p class="empty">Failed to load sets.</p>';
    console.error(err);
  }
}

// ── Note documents view ───────────────────────────────────────────────────────

let _currentDocId = null;
let _saveTimer = null;

async function loadNoteDocuments() {
  notesDocList.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const docs = await fetchNoteDocuments();
    renderNoteDocList(docs);
    if (docs.length && !_currentDocId) openNoteDocument(docs[0].id);
    if (!docs.length) {
      notesEditor.innerHTML = '<div class="notes-empty-state"><p>Create a document to get started.</p></div>';
    }
  } catch (err) {
    notesDocList.innerHTML = '<p class="empty">Failed to load notes.</p>';
    console.error(err);
  }
}

function renderNoteDocList(docs) {
  if (!docs.length) {
    notesDocList.innerHTML = '<p class="notes-doc-empty">No documents yet.</p>';
    return;
  }
  notesDocList.innerHTML = docs.map(d => `
    <div class="notes-doc-item ${d.id === _currentDocId ? "active" : ""}" data-doc-id="${d.id}">
      <span class="notes-doc-title">${escHtml(d.title || "Untitled")}</span>
      <span class="notes-doc-date">${new Date(d.updated_at).toLocaleDateString()}</span>
    </div>
  `).join("");
  notesDocList.querySelectorAll(".notes-doc-item").forEach(el => {
    el.addEventListener("click", () => openNoteDocument(Number(el.dataset.docId)));
  });
}

async function openNoteDocument(id) {
  _currentDocId = id;
  notesEditor.innerHTML = '<p class="loading" style="padding:2rem">Loading…</p>';

  // Highlight active item in list
  notesDocList.querySelectorAll(".notes-doc-item").forEach(el => {
    el.classList.toggle("active", Number(el.dataset.docId) === id);
  });

  try {
    const doc = await fetchNoteDocument(id);
    renderNoteEditor(doc);
  } catch (err) {
    notesEditor.innerHTML = '<p class="empty">Failed to load document.</p>';
  }
}

function renderNoteEditor(doc) {
  const attHtml = doc.attachments.map(a => {
    if (a.type === "file") {
      const icon = (a.mime_type || "").startsWith("image/") ? "🖼" : "📄";
      const kb = a.size ? ` (${Math.round(a.size / 1024)} KB)` : "";
      return `<div class="note-att-row" data-att-id="${a.id}">
        <a href="${escHtml(a.url)}" target="_blank" class="note-att-link">${icon} ${escHtml(a.original_name || a.filename)}${kb}</a>
        <button class="btn-icon note-att-del" data-att-id="${a.id}" title="Remove">✕</button>
      </div>`;
    } else {
      return `<div class="note-att-row" data-att-id="${a.id}">
        <a href="${escHtml(a.url)}" target="_blank" class="note-att-link">🔗 ${escHtml(a.title || a.url)}</a>
        <button class="btn-icon note-att-del" data-att-id="${a.id}" title="Remove">✕</button>
      </div>`;
    }
  }).join("");

  notesEditor.innerHTML = `
    <div class="notes-editor-inner">
      <div class="notes-editor-header">
        <input id="doc-title-input" class="doc-title-input" value="${escHtml(doc.title)}" placeholder="Document title…" />
        <div class="notes-editor-actions">
          <span id="doc-save-status" class="notes-status"></span>
          <button id="delete-doc-btn" class="btn-danger">Delete</button>
        </div>
      </div>
      <textarea id="doc-content" class="notes-textarea doc-content-area"
        placeholder="Write your notes here…">${escHtml(doc.content || "")}</textarea>

      <div class="note-attachments">
        <div class="note-att-header">
          <span class="modal-abc-label">Attachments</span>
          <div class="note-att-btns">
            <label class="btn-secondary note-file-label">
              📎 Add file
              <input type="file" id="note-file-input" multiple style="display:none" />
            </label>
            <button id="note-add-link-btn" class="btn-secondary">🔗 Add link</button>
          </div>
        </div>
        <div id="note-att-list" class="note-att-list">${attHtml || '<p class="note-att-empty">No attachments yet.</p>'}</div>
      </div>
    </div>
  `;

  const docId = doc.id;
  const titleInput = document.getElementById("doc-title-input");
  const contentArea = document.getElementById("doc-content");
  const saveStatus = document.getElementById("doc-save-status");

  function scheduleSave() {
    clearTimeout(_saveTimer);
    saveStatus.textContent = "Saving…";
    saveStatus.className = "notes-status";
    _saveTimer = setTimeout(async () => {
      try {
        await apiUpdateNoteDocument(docId, {
          title: titleInput.value,
          content: contentArea.value,
        });
        saveStatus.textContent = "Saved";
        saveStatus.className = "notes-status notes-saved";
        // Refresh sidebar title
        const items = notesDocList.querySelectorAll(".notes-doc-item");
        items.forEach(el => {
          if (Number(el.dataset.docId) === docId) {
            el.querySelector(".notes-doc-title").textContent = titleInput.value || "Untitled";
          }
        });
        setTimeout(() => { saveStatus.textContent = ""; }, 2000);
      } catch {
        saveStatus.textContent = "Save failed";
        saveStatus.className = "notes-status notes-error";
      }
    }, 900);
  }

  titleInput.addEventListener("input", scheduleSave);
  contentArea.addEventListener("input", scheduleSave);

  document.getElementById("delete-doc-btn").addEventListener("click", async (ev) => {
    if (!confirm(`Delete "${titleInput.value || "Untitled"}"?`)) return;
    ev.currentTarget.disabled = true;
    try {
      await apiDeleteNoteDocument(docId);
      _currentDocId = null;
      await loadNoteDocuments();
    } catch {
      alert("Failed to delete document. Please try again.");
      ev.currentTarget.disabled = false;
    }
  });

  // File upload
  document.getElementById("note-file-input").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const r = await fetch(`/api/note-documents/${docId}/attachments/file`, {
          method: "POST", body: fd,
        });
        if (!r.ok) throw new Error(`Upload failed (${r.status})`);
        const att = await r.json();
        doc.attachments.push(att);
      } catch {
        alert(`Failed to upload "${file.name}". Please try again.`);
      }
    }
    e.target.value = "";
    renderNoteEditor(doc);
    openNoteDocument(docId);
  });

  // Add link
  document.getElementById("note-add-link-btn").addEventListener("click", async () => {
    const url = prompt("Enter URL:");
    if (!url) return;
    const title = prompt("Link title (optional):", "");
    const att = await apiAddLinkAttachment(docId, url, title || "");
    doc.attachments.push(att);
    openNoteDocument(docId);
  });

  // Delete attachments
  notesEditor.querySelectorAll(".note-att-del").forEach(btn => {
    btn.addEventListener("click", async () => {
      const attId = Number(btn.dataset.attId);
      await apiDeleteAttachment(attId);
      doc.attachments = doc.attachments.filter(a => a.id !== attId);
      openNoteDocument(docId);
    });
  });
}

// ── Event handlers ────────────────────────────────────────────────────────────
const debouncedLoad = debounce(() => { state.page = 1; loadTunes(); }, 280);

searchEl.addEventListener("input", () => { state.q = searchEl.value.trim(); debouncedLoad(); });
filterType.addEventListener("change", () => { state.type = filterType.value; state.page = 1; loadTunes(); });
filterKey.addEventListener("change",  () => { state.key  = filterKey.value;  state.page = 1; loadTunes(); });
filterMode.addEventListener("change", () => { state.mode = filterMode.value; state.page = 1; loadTunes(); });

filterRating.addEventListener("change", () => {
  state.min_rating = Number(filterRating.value) || 0;
  state.page = 1;
  loadTunes();
});

filterHitlistBtn.addEventListener("click", () => {
  state.hitlist = !state.hitlist;
  filterHitlistBtn.classList.toggle("active", state.hitlist);
  state.page = 1;
  loadTunes();
});

clearBtn.addEventListener("click", () => {
  searchEl.value = "";
  filterType.value = filterKey.value = filterMode.value = filterRating.value = "";
  filterHitlistBtn.classList.remove("active");
  Object.assign(state, { page: 1, q: "", type: "", key: "", mode: "", hitlist: false, min_rating: 0 });
  loadTunes();
});

pagination.addEventListener("click", e => {
  const btn = e.target.closest("button[data-page]");
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.page);
  loadTunes();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

tuneList.addEventListener("click", async e => {
  const card = e.target.closest(".tune-card");

  // In select mode: clicking anywhere on the card toggles selection
  if (_selectMode) {
    if (card) _toggleCard(card);
    return;
  }

  // Star rating click on card
  const starBtn = e.target.closest(".star-btn");
  if (starBtn && !_selectMode) {
    e.stopPropagation();
    const card = starBtn.closest(".tune-card");
    const tuneId = card.dataset.id;
    const n = Number(starBtn.dataset.n);
    const current = Number(card.dataset.rating || 0);
    const rating = n === current ? 0 : n;  // click same star = reset
    try {
      await apiFetch(`/api/tunes/${tuneId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      card.dataset.rating = rating;
      card.querySelectorAll(".star-btn").forEach((s, i) =>
        s.classList.toggle("filled", i + 1 <= rating)
      );
    } catch { /* silently ignore */ }
    return;
  }

  // Hitlist toggle on card
  const hitlistBtn = e.target.closest(".hitlist-btn");
  if (hitlistBtn && !_selectMode) {
    e.stopPropagation();
    const card = hitlistBtn.closest(".tune-card");
    const tuneId = card.dataset.id;
    const on_hitlist = hitlistBtn.classList.contains("active") ? 0 : 1;
    try {
      await apiFetch(`/api/tunes/${tuneId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on_hitlist }),
      });
      card.dataset.hitlist = on_hitlist;
      card.classList.toggle("on-hitlist", Boolean(on_hitlist));
      card.querySelector(".card-title")?.classList.toggle("hitlist-title", Boolean(on_hitlist));
      hitlistBtn.classList.toggle("active", Boolean(on_hitlist));
      hitlistBtn.title = on_hitlist ? "Remove from hitlist" : "Add to hitlist";
    } catch { /* silently ignore */ }
    return;
  }

  const delBtn = e.target.closest(".tune-delete-btn");
  if (delBtn) {
    e.stopPropagation();
    const id = delBtn.dataset.id;
    const title = delBtn.closest(".tune-card")?.querySelector(".card-title")?.textContent || "this tune";
    if (!confirm(`Delete "${title}" from your library? This cannot be undone.`)) return;
    delBtn.disabled = true;
    try {
      await apiDeleteTune(id);
      loadTunes();
    } catch {
      alert("Failed to delete tune. Please try again.");
      delBtn.disabled = false;
    }
    return;
  }

  if (!card) return;
  if (Number(card.dataset.versions || 0) > 0) {
    renderVersionsPanel(card.dataset.id);
    return;
  }
  await fetchSets(); // ensure fresh sets for "add to set" dropdown
  const tune = await fetchTune(card.dataset.id);
  renderModal(tune);
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});

tuneList.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") e.target.click();
});

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModal(); closeImport(); }
});

function closeModal() {
  if (_synthController) _synthController.pause();
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

// Note: bar-selection click listener is attached inside renderSheetMusic (capture phase).

// ── Nav ───────────────────────────────────────────────────────────────────────
navLibrary.addEventListener("click",      () => switchView("library"));
navSets.addEventListener("click",         () => switchView("sets"));
navNotes.addEventListener("click",        () => switchView("notes"));
navAchievements.addEventListener("click", () => switchView("achievements"));

// ── New note document ─────────────────────────────────────────────────────────
newDocBtn.addEventListener("click", async () => {
  const doc = await apiCreateNoteDocument("Untitled");
  _currentDocId = doc.id;
  await loadNoteDocuments();
});

// ── Sets form ─────────────────────────────────────────────────────────────────
newSetBtn.addEventListener("click", () => {
  newSetForm.classList.remove("hidden");
  newSetName.focus();
});

cancelSetBtn.addEventListener("click", () => {
  newSetForm.classList.add("hidden");
  newSetName.value = "";
  newSetNotes.value = "";
});

createSetBtn.addEventListener("click", async () => {
  const name = newSetName.value.trim();
  if (!name) { newSetName.focus(); return; }
  createSetBtn.disabled = true;
  try {
    const set = await apiCreateSet(name, newSetNotes.value.trim());
    state.sets.push({ ...set, tune_count: 0 });
    newSetForm.classList.add("hidden");
    newSetName.value = "";
    newSetNotes.value = "";
    loadSets();
  } finally {
    createSetBtn.disabled = false;
  }
});

newSetName.addEventListener("keydown", e => { if (e.key === "Enter") createSetBtn.click(); });

// ── Import ────────────────────────────────────────────────────────────────────
importBtn.addEventListener("click", () => {
  importResult.classList.add("hidden");
  importFilename.textContent = "";
  importSubmit.disabled = true;
  importFile.value = "";
  importOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});

function closeImport() {
  importOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  _ffReset();
  if (_previewSynthCtrl) {
    try { _previewSynthCtrl.stop(); } catch {}
    _previewSynthCtrl = null;
  }
  _previewTuneData = null;
  document.getElementById("session-preview").classList.add("hidden");
  document.getElementById("session-search-pane").classList.remove("hidden");
}

importClose.addEventListener("click", closeImport);
importOverlay.addEventListener("click", e => { if (e.target === importOverlay) closeImport(); });

importFile.addEventListener("change", () => {
  const f = importFile.files[0];
  if (f) {
    importFilename.textContent = f.name;
    importSubmit.disabled = false;
  } else {
    importFilename.textContent = "";
    importSubmit.disabled = true;
  }
});

// ── Import tab switching ──────────────────────────────────────────────────────
document.querySelectorAll("[data-import-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-import-tab]").forEach(b => b.classList.remove("active"));
    document.querySelectorAll("#import-overlay .tab-panel").forEach(p => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(`import-tab-${btn.dataset.importTab}`).classList.remove("hidden");
    if (btn.dataset.importTab === "flutefling") _ffCatMaybeLoad();
    if (btn.dataset.importTab === "dropbox") _dropboxMaybeLoad();
  });
});

// ── FlutefFling Catalogue Browser ─────────────────────────────────────────────
const ffCatSearchInput = document.getElementById("ff-cat-search");
const ffCatList        = document.getElementById("ff-cat-list");
const ffCatStatus      = document.getElementById("ff-cat-status");
const ffCatCount       = document.getElementById("ff-cat-count");
const ffCatRefreshBtn  = document.getElementById("ff-cat-refresh");

let _ffCatItems = [];     // full catalogue
let _ffCatLoaded = false; // have we fetched at least once this session
const _ffCatMap  = {};    // index → tune object (avoids data-attr encoding issues)

function _ffCatRender(items) {
  if (!items.length) {
    ffCatList.innerHTML = '<p class="ff-cat-empty">No tunes match your search.</p>';
    return;
  }
  // Show max 80 results to keep DOM snappy
  const shown = items.slice(0, 80);
  ffCatList.innerHTML = shown.map((t, i) => {
    _ffCatMap[i] = t;
    const meta = [t.type, t.key && t.mode ? `${t.key} ${t.mode}` : t.key].filter(Boolean).join(" · ");
    return `<div class="ff-cat-entry">
      <div class="ff-cat-info">
        <span class="ff-cat-name">${escHtml(t.title)}</span>
        ${meta ? `<span class="ff-cat-meta">${escHtml(meta)}</span>` : ""}
        ${t.set_label ? `<span class="ff-cat-set">${escHtml(t.set_label)}</span>` : ""}
      </div>
      <button class="ff-cat-add btn-primary" data-idx="${i}">Add</button>
    </div>`;
  }).join("");
  if (items.length > 80) {
    ffCatList.insertAdjacentHTML("beforeend",
      `<p class="ff-cat-more">Showing 80 of ${items.length} — refine your search to narrow results.</p>`);
  }

  ffCatList.querySelectorAll(".ff-cat-add").forEach(btn => {
    btn.addEventListener("click", async () => {
      const t = _ffCatMap[btn.dataset.idx];
      btn.disabled = true;
      btn.textContent = "Adding…";
      try {
        const noteParts = [];
        if (t.pdf_url) noteParts.push(`FlutefFling sheet music (PDF): ${t.pdf_url}`);
        if (t.mp3_url) noteParts.push(`FlutefFling MP3: ${t.mp3_url}`);
        await apiFetch("/api/tunes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: t.title,
            type:  t.type  || "",
            key:   "",
            mode:  "",
            abc:   "",
            notes: noteParts.join("\n"),
          }),
        });
        btn.textContent = "Added ✓";
        btn.style.background = "var(--jig)";
        await Promise.all([loadStats(), loadFilters()]);
        if (state.view === "library") loadTunes();
      } catch (err) {
        btn.textContent = "Error";
        btn.disabled = false;
        ffCatStatus.textContent = `Error: ${err.message}`;
      }
    });
  });
}

function _ffCatFilter() {
  const q = ffCatSearchInput.value.trim().toLowerCase();
  const filtered = q
    ? _ffCatItems.filter(t => (t.title || "").toLowerCase().includes(q))
    : _ffCatItems;
  ffCatCount.textContent = filtered.length
    ? `${filtered.length} tune${filtered.length !== 1 ? "s" : ""}`
    : "";
  _ffCatRender(filtered);
}

async function _ffCatLoad(refresh = false) {
  ffCatList.innerHTML = '<p class="ff-cat-hint">Loading catalogue from FlutefFling.scot…</p>';
  ffCatStatus.textContent = "";
  ffCatRefreshBtn.disabled = true;
  try {
    const data = await apiFetch(`/api/flutefling/all-tunes${refresh ? "?refresh=true" : ""}`);
    _ffCatItems = data.tunes || [];
    _ffCatLoaded = true;
    ffCatCount.textContent = `${_ffCatItems.length} tune${_ffCatItems.length !== 1 ? "s" : ""}`;
    ffCatSearchInput.value = "";
    _ffCatRender(_ffCatItems);
  } catch (err) {
    ffCatList.innerHTML = `<p class="ff-cat-empty">Could not load catalogue: ${escHtml(err.message)}</p>`;
    ffCatStatus.textContent = "";
  } finally {
    ffCatRefreshBtn.disabled = false;
  }
}

function _ffCatMaybeLoad() {
  if (!_ffCatLoaded) _ffCatLoad(false);
}

ffCatSearchInput.addEventListener("input", _ffCatFilter);
ffCatRefreshBtn.addEventListener("click", () => _ffCatLoad(true));

importSubmit.addEventListener("click", async () => {
  const f = importFile.files[0];
  if (!f) return;
  importSubmit.disabled = true;
  importSubmit.textContent = "Importing…";
  importResult.classList.add("hidden");
  try {
    const form = new FormData();
    form.append("file", f);
    const res = await fetch("/api/import", { method: "POST", body: form });
    const data = await res.json();
    if (res.ok) {
      importResult.textContent =
        `Imported ${data.imported} tune${data.imported !== 1 ? "s" : ""}` +
        (data.skipped ? ` (${data.skipped} skipped due to missing title)` : "") + ".";
      importResult.className = "import-result import-success";
      importResult.classList.remove("hidden");
      await Promise.all([loadStats(), loadFilters()]);
      if (state.view === "library") loadTunes();
    } else {
      importResult.textContent = `Error: ${data.detail || "Import failed."}`;
      importResult.className = "import-result import-error";
      importResult.classList.remove("hidden");
    }
  } catch (err) {
    importResult.textContent = "Network error. Is the server running?";
    importResult.className = "import-result import-error";
    importResult.classList.remove("hidden");
  } finally {
    importSubmit.disabled = false;
    importSubmit.textContent = "Import";
  }
});

// ── Paste ABC import ─────────────────────────────────────────────────────────
const pasteAbcInput  = document.getElementById("paste-abc-input");
const pasteAbcSubmit = document.getElementById("paste-abc-submit");
const pasteAbcResult = document.getElementById("paste-abc-result");

pasteAbcSubmit.addEventListener("click", async () => {
  const abc = pasteAbcInput.value.trim();
  if (!abc) { pasteAbcInput.focus(); return; }
  pasteAbcSubmit.disabled = true;
  pasteAbcSubmit.textContent = "Importing…";
  pasteAbcResult.classList.add("hidden");
  try {
    const res = await fetch("/api/import-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ abc }),
    });
    const data = await res.json();
    if (res.ok) {
      pasteAbcResult.textContent =
        `Imported ${data.imported} tune${data.imported !== 1 ? "s" : ""}` +
        (data.skipped ? ` (${data.skipped} skipped due to missing title)` : "") + ".";
      pasteAbcResult.className = "import-result import-success";
      pasteAbcResult.classList.remove("hidden");
      pasteAbcInput.value = "";
      await Promise.all([loadStats(), loadFilters()]);
      if (state.view === "library") loadTunes();
    } else {
      pasteAbcResult.textContent = `Error: ${data.detail || "Import failed."}`;
      pasteAbcResult.className = "import-result import-error";
      pasteAbcResult.classList.remove("hidden");
    }
  } catch (err) {
    pasteAbcResult.textContent = `Error: ${err.message}`;
    pasteAbcResult.className = "import-result import-error";
    pasteAbcResult.classList.remove("hidden");
  } finally {
    pasteAbcSubmit.disabled = false;
    pasteAbcSubmit.textContent = "Import";
  }
});

// ── TheSession.org search + import ───────────────────────────────────────────
const sessionSearchInput = document.getElementById("session-search-input");
const sessionSearchBtn   = document.getElementById("session-search-btn");
const sessionResults     = document.getElementById("session-results");

async function runSessionSearch() {
  const q = sessionSearchInput.value.trim();
  if (!q) return;
  sessionResults.innerHTML = '<p class="loading" style="padding:1rem 0">Searching TheSession.org…</p>';
  sessionSearchBtn.disabled = true;
  try {
    const params = new URLSearchParams({ q });
    const data = await apiFetch(`/api/thesession/search?${params}`);
    if (!data.tunes || !data.tunes.length) {
      sessionResults.innerHTML = '<p class="empty" style="padding:1rem 0">No results found.</p>';
      return;
    }
    sessionResults.innerHTML = data.tunes.map(t => `
      <div class="session-result-row" data-session-id="${t.id}">
        <div class="session-result-info">
          <span class="session-result-name">${escHtml(t.name)}</span>
          <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
          <span class="session-result-meta">${t.tunebooks} tunebook${t.tunebooks !== 1 ? "s" : ""}</span>
        </div>
        <button class="btn-primary session-preview-btn" data-session-id="${t.id}">
          Preview
        </button>
      </div>
    `).join("");

    sessionResults.querySelectorAll(".session-preview-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Loading…";
        try {
          const tuneData = await apiFetch(`/api/thesession/fetch/${btn.dataset.sessionId}`);
          showSessionPreview(tuneData);
        } catch {
          btn.textContent = "Error";
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    sessionResults.innerHTML = '<p class="empty" style="padding:1rem 0">Could not reach TheSession.org. Check your connection.</p>';
    console.error(err);
  } finally {
    sessionSearchBtn.disabled = false;
  }
}

sessionSearchBtn.addEventListener("click", runSessionSearch);
sessionSearchInput.addEventListener("keydown", e => { if (e.key === "Enter") runSessionSearch(); });

// Preview tab switching
document.querySelectorAll("[data-preview-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-preview-tab]").forEach(b => b.classList.remove("active"));
    document.querySelectorAll("#session-preview .preview-panel").forEach(p => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(`preview-panel-${btn.dataset.previewTab}`).classList.remove("hidden");
  });
});

// Back button: return to search results
document.getElementById("session-preview-back").addEventListener("click", () => {
  if (_previewSynthCtrl) {
    try { _previewSynthCtrl.stop(); } catch {}
    _previewSynthCtrl = null;
  }
  _previewTuneData = null;
  document.getElementById("session-preview").classList.add("hidden");
  document.getElementById("session-search-pane").classList.remove("hidden");
});

// Save button: import the previewed tune into the library
document.getElementById("session-save-btn").addEventListener("click", async () => {
  if (!_previewTuneData) return;
  const btn = document.getElementById("session-save-btn");
  const status = document.getElementById("session-save-status");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await fetch("/api/thesession/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tune_id: _previewTuneData.session_id }),
    });
    const data = await res.json();
    if (res.ok) {
      if (data.status === "exists") {
        btn.textContent = "Already in library";
        btn.style.opacity = ".5";
        status.textContent = "Already in your library.";
        status.className = "notes-status notes-saved";
      } else {
        btn.textContent = "Saved ✓";
        btn.style.background = "var(--jig)";
        status.textContent = `"${data.title}" saved to your library!`;
        status.className = "notes-status notes-saved";
        await Promise.all([loadStats(), loadFilters()]);
        if (state.view === "library") loadTunes();
      }
    } else {
      btn.textContent = "Save to Library";
      btn.disabled = false;
      status.textContent = "Failed to save.";
      status.className = "notes-status notes-error";
    }
  } catch {
    btn.textContent = "Save to Library";
    btn.disabled = false;
    status.textContent = "Error saving.";
    status.className = "notes-status notes-error";
  }
});

// ── FlutefFling.scot ──────────────────────────────────────────────────────────

const ffAbcUrlInput  = document.getElementById("ff-abc-url");
const ffMp3UrlInput  = document.getElementById("ff-mp3-url");
const ffTitleInput   = document.getElementById("ff-title-input");
const ffAddBtn       = document.getElementById("ff-add-btn");
const ffStatus       = document.getElementById("ff-status");

function _ffReset() {
  ffAbcUrlInput.value  = "";
  ffMp3UrlInput.value  = "";
  ffTitleInput.value   = "";
  ffStatus.textContent = "";
  ffAddBtn.disabled    = false;
  ffAddBtn.textContent = "Add to Library";
}

ffAddBtn.addEventListener("click", async () => {
  const pdfUrl = ffAbcUrlInput.value.trim();
  const mp3Url = ffMp3UrlInput.value.trim();
  const title  = ffTitleInput.value.trim();

  if (!title) {
    ffStatus.textContent = "A tune title is required.";
    ffTitleInput.focus();
    return;
  }
  if (!pdfUrl && !mp3Url) {
    ffStatus.textContent = "Please paste at least one URL (sheet music PDF or MP3).";
    return;
  }

  ffAddBtn.disabled = true;
  ffAddBtn.textContent = "Adding…";
  ffStatus.textContent = "Saving…";

  try {
    const noteParts = [];
    if (pdfUrl) noteParts.push(`FlutefFling sheet music (PDF): ${pdfUrl}`);
    if (mp3Url) noteParts.push(`FlutefFling MP3: ${mp3Url}`);

    await apiFetch("/api/tunes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, type: "", key: "", mode: "", abc: "", notes: noteParts.join("\n") }),
    });

    ffStatus.textContent = `✓ "${title}" added to your library.`;
    ffAddBtn.textContent  = "Added ✓";
    ffAddBtn.style.background = "var(--jig)";
    await Promise.all([loadStats(), loadFilters()]);
    if (state.view === "library") loadTunes();
  } catch (err) {
    ffStatus.textContent = `Error: ${err.message}`;
    ffAddBtn.disabled    = false;
    ffAddBtn.textContent = "Add to Library";
  }
});

// ── Versions panel ────────────────────────────────────────────────────────────

async function renderVersionsPanel(parentId) {
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  modalContent.innerHTML = '<p class="loading">Loading versions…</p>';

  try {
    const { parent, versions } = await apiFetch(`/api/tunes/${parentId}/versions`);

    modalContent.innerHTML = `
      <h2 class="modal-title">${escHtml(parent.title)}</h2>
      <p class="versions-count">${versions.length} version${versions.length !== 1 ? "s" : ""}</p>
      <div class="versions-list">
        ${versions.map(v => `
          <div class="version-item" data-id="${v.id}" role="button" tabindex="0">
            <div class="version-info">
              <span class="version-name">${escHtml(v.version_label || v.title)}</span>
              <span class="version-meta">${[v.key, v.type].filter(Boolean).map(escHtml).join(" · ")}</span>
            </div>
            <span class="version-arrow">→</span>
          </div>
        `).join("")}
      </div>
      <div class="modal-footer" style="margin-top:1.25rem">
        <button id="ungroup-btn" class="btn-danger btn-sm">Ungroup</button>
        <span class="modal-hint" style="margin-left:.5rem">Ungroup removes the container but keeps all versions as individual tunes.</span>
      </div>
    `;

    // Each version opens the full tune modal with a ← Back button
    modalContent.querySelectorAll(".version-item").forEach(item => {
      const open = async () => {
        await fetchSets();
        const tune = await fetchTune(item.dataset.id);
        renderModal(tune, () => renderVersionsPanel(parentId));
      };
      item.addEventListener("click", open);
      item.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") open(); });
    });

    document.getElementById("ungroup-btn").addEventListener("click", async () => {
      if (!confirm(`Ungroup "${parent.title}"? The versions will become individual tunes again.`)) return;
      try {
        await apiFetch(`/api/tunes/${parentId}`, { method: "DELETE" });
        closeModal();
        await Promise.all([loadStats(), loadFilters(), loadTunes()]);
      } catch {
        alert("Failed to ungroup. Please try again.");
      }
    });

  } catch (err) {
    modalContent.innerHTML = `<p class="empty">Error loading versions: ${escHtml(err.message)}</p>`;
  }
}

// ── Media overlay (MP3 / YouTube) ─────────────────────────────────────────────

const mediaOverlay = document.getElementById("media-overlay");
const mediaOverlayContent = document.getElementById("media-overlay-content");

function openMediaOverlay(url, type) {
  if (type === "video") {
    const vidId = url.match(/(?:v=|youtu\.be\/)([^&?#]+)/)?.[1];
    if (!vidId) { window.open(url, "_blank"); return; }
    mediaOverlayContent.innerHTML =
      `<iframe class="media-video" src="https://www.youtube-nocookie.com/embed/${escHtml(vidId)}?autoplay=1"
               allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  } else {
    mediaOverlayContent.innerHTML =
      `<audio controls autoplay class="media-audio" src="${escHtml(url)}"></audio>`;
  }
  mediaOverlay.classList.remove("hidden");
}

function closeMediaOverlay() {
  // Stop audio/video before removing
  mediaOverlayContent.querySelectorAll("iframe").forEach(el => { el.src = ""; });
  mediaOverlayContent.querySelectorAll("audio, video").forEach(el => el.pause());
  mediaOverlayContent.innerHTML = "";
  mediaOverlay.classList.add("hidden");
}

document.getElementById("media-overlay-close").addEventListener("click", closeMediaOverlay);
mediaOverlay.addEventListener("click", e => { if (e.target === mediaOverlay) closeMediaOverlay(); });

// ── Achievements ─────────────────────────────────────────────────────────────
const achTextarea = document.getElementById("ach-textarea");
const achAddBtn   = document.getElementById("ach-add-btn");
const achStatus   = document.getElementById("ach-status");
const achList     = document.getElementById("achievements-list");

const ACH_ICONS = {
  rating_up:      "⭐",
  hitlist_add:    "📌",
  hitlist_remove: "📌",
  manual:         "✏️",
};

function renderAchievements(items) {
  if (!items.length) {
    achList.innerHTML = '<p class="loading">No achievements yet. Play some tunes and level up!</p>';
    return;
  }
  achList.innerHTML = items.map(a => {
    const icon = ACH_ICONS[a.type] || "✏️";
    const d = new Date(a.created_at);
    const dateStr = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    return `<div class="ach-entry" data-id="${a.id}">
      <span class="ach-icon">${icon}</span>
      <div class="ach-body">
        <span class="ach-note">${escHtml(a.note)}</span>
        <span class="ach-date">${dateStr}</span>
      </div>
      <button class="ach-delete" title="Delete" data-id="${a.id}">✕</button>
    </div>`;
  }).join("");

  achList.querySelectorAll(".ach-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      await apiFetch(`/api/achievements/${btn.dataset.id}`, { method: "DELETE" });
      loadAchievements();
    });
  });
}

async function loadAchievements() {
  achList.innerHTML = '<p class="loading">Loading…</p>';
  const items = await apiFetch("/api/achievements");
  renderAchievements(items);
}

achAddBtn.addEventListener("click", async () => {
  const note = achTextarea.value.trim();
  if (!note) return;
  achAddBtn.disabled = true;
  await apiFetch("/api/achievements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  achTextarea.value = "";
  achStatus.textContent = "Added!";
  setTimeout(() => { achStatus.textContent = ""; }, 2000);
  achAddBtn.disabled = false;
  loadAchievements();
});

// ── Dropbox Browser ───────────────────────────────────────────────────────────

const dropboxSetup        = document.getElementById("dropbox-setup");
const dropboxBrowser      = document.getElementById("dropbox-browser");
const dropboxTokenInput   = document.getElementById("dropbox-token-input");
const dropboxTokenSave    = document.getElementById("dropbox-token-save");
const dropboxSetupStatus  = document.getElementById("dropbox-setup-status");
const dropboxPathInput    = document.getElementById("dropbox-path-input");
const dropboxBrowseBtn    = document.getElementById("dropbox-browse-btn");
const dropboxStatus       = document.getElementById("dropbox-status");
const dropboxFileList     = document.getElementById("dropbox-file-list");
const dropboxTokenChangeBtn = document.getElementById("dropbox-token-change-btn");

const _dropboxFileMap = {};  // index → file object

function _dropboxShowSetup() {
  dropboxSetup.classList.remove("hidden");
  dropboxBrowser.classList.add("hidden");
}

function _dropboxShowBrowser() {
  dropboxSetup.classList.add("hidden");
  dropboxBrowser.classList.remove("hidden");
}

async function _dropboxMaybeLoad() {
  try {
    const data = await apiFetch("/api/dropbox/settings");
    if (data.token_set) {
      _dropboxShowBrowser();
    } else {
      _dropboxShowSetup();
    }
  } catch {
    _dropboxShowSetup();
  }
}

dropboxTokenSave.addEventListener("click", async () => {
  const token = dropboxTokenInput.value.trim();
  if (!token) { dropboxSetupStatus.textContent = "Please paste your access token."; return; }
  dropboxTokenSave.disabled = true;
  dropboxTokenSave.textContent = "Saving…";
  try {
    await apiFetch("/api/dropbox/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    dropboxTokenInput.value = "";
    dropboxSetupStatus.textContent = "";
    _dropboxShowBrowser();
  } catch (err) {
    dropboxSetupStatus.textContent = `Error: ${err.message}`;
  } finally {
    dropboxTokenSave.disabled = false;
    dropboxTokenSave.textContent = "Save token";
  }
});

dropboxTokenChangeBtn.addEventListener("click", async () => {
  await apiFetch("/api/dropbox/settings", { method: "DELETE" });
  dropboxFileList.innerHTML = '<p class="ff-cat-hint">Enter a folder path above and click Browse</p>';
  dropboxStatus.textContent = "";
  _dropboxShowSetup();
});

function _dropboxFileIcon(type) {
  switch (type) {
    case "folder": return "📁";
    case "abc":
    case "txt":    return "🎵";
    case "pdf":    return "📄";
    case "mp3":
    case "m4a":
    case "ogg":    return "🎧";
    default:       return "📎";
  }
}

function _dropboxRenderFiles(files) {
  if (!files.length) {
    dropboxFileList.innerHTML = '<p class="ff-cat-empty">No supported files found in this folder.</p>';
    return;
  }
  dropboxFileList.innerHTML = files.map((f, i) => {
    _dropboxFileMap[i] = f;
    const icon = _dropboxFileIcon(f.type);
    const sizeStr = f.type !== "folder" && f.size
      ? `<span class="ff-cat-meta">${(f.size / 1024).toFixed(0)} KB</span>`
      : "";
    const isFolder = f.type === "folder";
    const btn = isFolder
      ? `<button class="ff-cat-add btn-secondary" data-idx="${i}">Open</button>`
      : (f.type === "abc" || f.type === "txt")
        ? `<button class="ff-cat-add btn-primary" data-idx="${i}">Import</button>`
        : `<button class="ff-cat-add btn-secondary" data-idx="${i}">Add entry</button>`;
    return `<div class="ff-cat-entry">
      <div class="ff-cat-info">
        <span class="ff-cat-name">${icon} ${escHtml(f.name)}</span>
        ${sizeStr}
      </div>
      ${btn}
    </div>`;
  }).join("");

  dropboxFileList.querySelectorAll(".ff-cat-add").forEach(btn => {
    btn.addEventListener("click", async () => {
      const f = _dropboxFileMap[btn.dataset.idx];

      // Navigate into subfolder
      if (f.type === "folder") {
        dropboxPathInput.value = f.path;
        _dropboxBrowse(f.path);
        return;
      }

      btn.disabled = true;

      // Import ABC/TXT files as tunes
      if (f.type === "abc" || f.type === "txt") {
        btn.textContent = "Importing…";
        try {
          const data = await apiFetch("/api/dropbox/import-abc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: f.path }),
          });
          btn.textContent = `Imported ${data.imported}`;
          btn.style.background = "var(--jig)";
          await Promise.all([loadStats(), loadFilters()]);
          if (state.view === "library") loadTunes();
        } catch (err) {
          dropboxStatus.textContent = `Error: ${err.message}`;
          btn.textContent = "Error";
          btn.disabled = false;
        }
        return;
      }

      // PDF / audio: create a tune entry with a proxy link in notes
      btn.textContent = "Adding…";
      const title = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      const proxyUrl = `${window.location.origin}/api/dropbox/file?path=${encodeURIComponent(f.path)}`;
      let notes = "";
      if (f.type === "pdf") {
        notes = `Dropbox sheet music (PDF): ${proxyUrl}`;
      } else {
        notes = `Dropbox audio: ${proxyUrl}`;
      }
      try {
        await apiFetch("/api/tunes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, notes }),
        });
        btn.textContent = "Added ✓";
        btn.style.background = "var(--jig)";
        await Promise.all([loadStats(), loadFilters()]);
        if (state.view === "library") loadTunes();
      } catch (err) {
        dropboxStatus.textContent = `Error: ${err.message}`;
        btn.textContent = "Error";
        btn.disabled = false;
      }
    });
  });
}

async function _dropboxBrowse(path) {
  dropboxStatus.textContent = "";
  dropboxFileList.innerHTML = '<p class="ff-cat-hint">Loading…</p>';
  dropboxBrowseBtn.disabled = true;
  try {
    const data = await apiFetch("/api/dropbox/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    _dropboxRenderFiles(data.files || []);
    if (data.has_more) {
      dropboxStatus.textContent = "Showing first batch of results — navigate into subfolders to see more.";
    }
  } catch (err) {
    dropboxFileList.innerHTML = `<p class="ff-cat-empty">Could not load folder: ${escHtml(err.message)}</p>`;
  } finally {
    dropboxBrowseBtn.disabled = false;
  }
}

dropboxBrowseBtn.addEventListener("click", () => {
  const path = dropboxPathInput.value.trim() || "/";
  _dropboxBrowse(path);
});

dropboxPathInput.addEventListener("keydown", e => {
  if (e.key === "Enter") dropboxBrowseBtn.click();
});

// ── Library management ────────────────────────────────────────────────────────

const libraryMenuBtn    = document.getElementById("library-menu-btn");
const libraryMenu       = document.getElementById("library-menu");
const libraryBackupBtn  = document.getElementById("library-backup-btn");
const libraryImportBtn  = document.getElementById("library-import-btn");
const libraryDeleteBtn  = document.getElementById("library-delete-btn");

// Dropdown toggle
libraryMenuBtn.addEventListener("click", e => {
  e.stopPropagation();
  libraryMenu.classList.toggle("hidden");
});
document.addEventListener("click", () => libraryMenu.classList.add("hidden"));
libraryMenu.addEventListener("click", e => e.stopPropagation());

// ── Backup dialog ─────────────────────────────────────────────────────────────
const backupOverlay    = document.getElementById("backup-overlay");
const backupClose      = document.getElementById("backup-close");
const backupFilename   = document.getElementById("backup-filename");
const backupSaveBtn    = document.getElementById("backup-save-btn");
const backupCancelBtn  = document.getElementById("backup-cancel-btn");

function _todayISO() {
  return new Date().toISOString().slice(0, 10);
}

libraryBackupBtn.addEventListener("click", () => {
  libraryMenu.classList.add("hidden");
  backupFilename.value = `ceol-backup-${_todayISO()}.zip`;
  backupOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  backupFilename.focus();
  backupFilename.select();
});

function _closeBackup() {
  backupOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}
backupClose.addEventListener("click", _closeBackup);
backupCancelBtn.addEventListener("click", _closeBackup);

backupSaveBtn.addEventListener("click", () => {
  const name = backupFilename.value.trim() || `ceol-backup-${_todayISO()}.zip`;
  const safe = name.endsWith(".zip") ? name : name + ".zip";
  // Trigger the browser download — Save As dialog appears
  const a = document.createElement("a");
  a.href = `/api/library/export?filename=${encodeURIComponent(safe)}`;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  _closeBackup();
});

backupFilename.addEventListener("keydown", e => {
  if (e.key === "Enter") backupSaveBtn.click();
});

// ── Import Library dialog ─────────────────────────────────────────────────────
const libImportOverlay  = document.getElementById("lib-import-overlay");
const libImportClose    = document.getElementById("lib-import-close");
const libImportFile     = document.getElementById("lib-import-file");
const libImportFilename = document.getElementById("lib-import-filename");
const libImportSubmit   = document.getElementById("lib-import-submit");
const libImportCancel   = document.getElementById("lib-import-cancel");
const libImportResult   = document.getElementById("lib-import-result");

libraryImportBtn.addEventListener("click", () => {
  libraryMenu.classList.add("hidden");
  libImportFile.value = "";
  libImportFilename.textContent = "";
  libImportSubmit.disabled = true;
  libImportResult.classList.add("hidden");
  libImportOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});

function _closeLibImport() {
  libImportOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}
libImportClose.addEventListener("click", _closeLibImport);
libImportCancel.addEventListener("click", _closeLibImport);

libImportFile.addEventListener("change", () => {
  const f = libImportFile.files[0];
  libImportFilename.textContent = f ? f.name : "";
  libImportSubmit.disabled = !f;
});

libImportSubmit.addEventListener("click", async () => {
  const f = libImportFile.files[0];
  if (!f) return;

  libImportSubmit.disabled = true;
  libImportSubmit.textContent = "Importing…";
  libImportResult.classList.add("hidden");

  const form = new FormData();
  form.append("file", f);

  try {
    await apiFetch("/api/library/import", { method: "POST", body: form });
    libImportResult.textContent = "✓ Library imported successfully. Reloading…";
    libImportResult.className = "import-result";
    libImportResult.classList.remove("hidden");
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    libImportResult.textContent = `Error: ${err.message}`;
    libImportResult.className = "import-result import-error";
    libImportResult.classList.remove("hidden");
    libImportSubmit.disabled = false;
    libImportSubmit.textContent = "Import & Replace";
  }
});

// ── Delete Library dialog ─────────────────────────────────────────────────────
const libDeleteOverlay  = document.getElementById("lib-delete-overlay");
const libDeleteClose    = document.getElementById("lib-delete-close");
const libDeleteConfirm  = document.getElementById("lib-delete-confirm");
const libDeleteCancel   = document.getElementById("lib-delete-cancel");

libraryDeleteBtn.addEventListener("click", () => {
  libraryMenu.classList.add("hidden");
  libDeleteOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});

function _closeLibDelete() {
  libDeleteOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}
libDeleteClose.addEventListener("click", _closeLibDelete);
libDeleteCancel.addEventListener("click", _closeLibDelete);

libDeleteConfirm.addEventListener("click", async () => {
  libDeleteConfirm.disabled = true;
  libDeleteConfirm.textContent = "Deleting…";
  try {
    await apiFetch("/api/library", { method: "DELETE" });
    location.reload();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
    libDeleteConfirm.disabled = false;
    libDeleteConfirm.textContent = "Yes, delete everything";
  }
});

// ── Help modal ────────────────────────────────────────────────────────────────
const helpBtn     = document.getElementById("help-btn");
const helpOverlay = document.getElementById("help-overlay");
const helpClose   = document.getElementById("help-close");

function _openHelp() {
  helpOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function _closeHelp() {
  helpOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}
helpBtn.addEventListener("click", _openHelp);
helpClose.addEventListener("click", _closeHelp);
helpOverlay.addEventListener("click", e => { if (e.target === helpOverlay) _closeHelp(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !helpOverlay.classList.contains("hidden")) _closeHelp(); });

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  await Promise.allSettled([loadFilters(), loadStats(), fetchSets()]);
  await loadTunes();
})();
