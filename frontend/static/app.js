/* Ceol – Trad Music Web App · frontend JS */

const PAGE_SIZE = 48;

const state = {
  view: "library",
  page: 1,
  q: "",
  type: "",
  key: "",
  mode: "",
  sets: [],
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const searchEl      = document.getElementById("search");
const filterType    = document.getElementById("filter-type");
const filterKey     = document.getElementById("filter-key");
const filterMode    = document.getElementById("filter-mode");
const clearBtn      = document.getElementById("clear-btn");
const tuneList      = document.getElementById("tune-list");
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
const viewNotes     = document.getElementById("view-notes");
const navNotes      = document.getElementById("nav-notes");
const notesDocList  = document.getElementById("notes-doc-list");
const notesEditor   = document.getElementById("notes-editor");
const newDocBtn     = document.getElementById("new-doc-btn");

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
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
}

async function fetchFilters() {
  return apiFetch("/api/filters");
}

async function fetchTunes() {
  const params = new URLSearchParams({ page: state.page, page_size: PAGE_SIZE });
  if (state.q)    params.set("q",    state.q);
  if (state.type) params.set("type", state.type);
  if (state.key)  params.set("key",  state.key);
  if (state.mode) params.set("mode", state.mode);
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
  viewLibrary.classList.add("hidden");
  viewSets.classList.add("hidden");
  viewNotes.classList.add("hidden");
  navLibrary.classList.remove("active");
  navSets.classList.remove("active");
  navNotes.classList.remove("active");

  if (view === "library") {
    viewLibrary.classList.remove("hidden");
    navLibrary.classList.add("active");
  } else if (view === "sets") {
    viewSets.classList.remove("hidden");
    navSets.classList.add("active");
    loadSets();
  } else if (view === "notes") {
    viewNotes.classList.remove("hidden");
    navNotes.classList.add("active");
    loadNoteDocuments();
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderTunes(data) {
  const { tunes, total, page, pages } = data;

  resultCount.textContent = total
    ? `${total.toLocaleString()} tune${total !== 1 ? "s" : ""} found`
    : "";

  if (!tunes.length) {
    tuneList.innerHTML = '<p class="empty">No tunes match your search.</p>';
    pagination.innerHTML = "";
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
    return `
      <article class="tune-card" data-id="${t.id}" tabindex="0" role="button"
               aria-label="${escHtml(t.title)}">
        <div class="card-title">${escHtml(t.title)}</div>
        <div class="card-meta">${typeLabel}${keyLabel}</div>
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

// Render a notes string: URLs become audio players or clickable links
function renderNotesHtml(text) {
  if (!text) return "";
  const urlRe = /https?:\/\/[^\s<>"]+/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) parts.push(`<span>${escHtml(text.slice(last, m.index))}</span>`);
    const url = m[0];
    const urlEsc = escHtml(url);
    if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(url)) {
      parts.push(`<div class="notes-audio"><audio controls preload="none" src="${urlEsc}"></audio><a href="${urlEsc}" target="_blank" rel="noopener" class="notes-audio-link">🎵 ${urlEsc}</a></div>`);
    } else if (/\.pdf(\?|$)/i.test(url)) {
      parts.push(`<a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">📄 ${urlEsc}</a>`);
    } else {
      parts.push(`<a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">🔗 ${urlEsc}</a>`);
    }
    last = m.index + url.length;
  }
  if (last < text.length) parts.push(`<span>${escHtml(text.slice(last))}</span>`);
  return parts.join("").replace(/\n/g, "<br>");
}

function renderModal(tune) {
  const typeClass = typeBadgeClass(tune.type);
  const typeBadge = tune.type
    ? `<span class="badge ${typeClass}">${escHtml(tune.type)}</span>`
    : "";
  const keyBadge = tune.key
    ? `<span class="badge badge-key">${escHtml(tune.key)}</span>`
    : "";
  const aliasLine = tune.aliases && tune.aliases.length
    ? `<p class="modal-aliases">Also known as: ${tune.aliases.map(escHtml).join(", ")}</p>`
    : "";
  const importedLine = tune.imported_at
    ? `<p class="modal-imported">Imported: ${new Date(tune.imported_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>`
    : "";
  const tagLine = tune.tags && tune.tags.length
    ? `<div class="modal-meta">${tune.tags.map(g => `<span class="badge badge-other">${escHtml(g)}</span>`).join("")}</div>`
    : "";

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
    <h2 class="modal-title">${escHtml(tune.title)}</h2>
    <div class="modal-meta">${typeBadge}${keyBadge}</div>
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
      </div>
      <div id="audio-player-container" class="audio-player-wrap"></div>
      <div id="bar-selection-info" class="bar-selection-info hidden"></div>
      <p id="audio-unavailable" class="audio-unavailable hidden">
        Audio playback is not supported in this browser.
      </p>
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
        <button id="delete-tune-modal-btn" class="btn-danger" data-tune-id="${tune.id}">Delete from Library</button>
      </div>
    </div>
  `;

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

  // Render sheet music after paint
  requestAnimationFrame(() => renderSheetMusic(tune.abc));
}

// ── Bar-range selection (practice loop) ──────────────────────────────────────
let _visualObj = null;
let _synthController = null;
let _msPerMeasure = null;
let _barSel = { start: null, end: null };
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
  if (!_synthController || !_msPerMeasure) return;
  const dur = _synthController.midiBuffer && _synthController.midiBuffer.duration;
  if (!dur) return;
  const frac = Math.max(0, Math.min(1, (barIndex * _msPerMeasure / 1000) / dur));
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
        if (!_barSeekPending || _barSel.start === null || !_msPerMeasure) return;
        const dur = _synthController.midiBuffer && _synthController.midiBuffer.duration;
        if (!dur) return;
        _barSeekPending = false;
        const frac = Math.max(0, Math.min(1, (_barSel.start * _msPerMeasure / 1000) / dur));
        _synthController.seek(frac);           // positions audio + timer
        _synthController.setProgress(frac, dur * 1000); // updates e.percent
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

clearBtn.addEventListener("click", () => {
  searchEl.value = "";
  filterType.value = filterKey.value = filterMode.value = "";
  Object.assign(state, { page: 1, q: "", type: "", key: "", mode: "" });
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
  const card = e.target.closest(".tune-card");
  if (!card) return;
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
navLibrary.addEventListener("click", () => switchView("library"));
navSets.addEventListener("click",    () => switchView("sets"));
navNotes.addEventListener("click",   () => switchView("notes"));

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
  });
});

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
        <button class="btn-primary session-import-btn" data-session-id="${t.id}" data-name="${escHtml(t.name)}">
          + Import
        </button>
      </div>
    `).join("");

    sessionResults.querySelectorAll(".session-import-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Importing…";
        try {
          const res = await fetch("/api/thesession/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tune_id: Number(btn.dataset.sessionId) }),
          });
          const data = await res.json();
          if (res.ok) {
            if (data.status === "exists") {
              btn.textContent = "Already in library";
              btn.style.opacity = ".5";
            } else {
              btn.textContent = "Imported ✓";
              btn.style.background = "var(--jig)";
              await Promise.all([loadStats(), loadFilters()]);
              if (state.view === "library") loadTunes();
            }
          } else {
            btn.textContent = "Failed";
            btn.style.borderColor = "var(--danger)";
            btn.style.color = "var(--danger)";
            btn.disabled = false;
          }
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

// ── FlutefFling.scot — direct ABC URL import ──────────────────────────────────

const ffUrlInput  = document.getElementById("ff-url-input");
const ffUrlBtn    = document.getElementById("ff-url-btn");
const ffUrlStatus = document.getElementById("ff-url-status");
const ffUrlList   = document.getElementById("ff-url-list");

async function runFfUrlFetch() {
  const url = ffUrlInput.value.trim();
  if (!url) { ffUrlInput.focus(); return; }
  ffUrlBtn.disabled = true;
  ffUrlStatus.textContent = "Fetching…";
  ffUrlList.innerHTML = "";
  try {
    const data = await apiFetch(`/api/flutefling/fetch-abc?url=${encodeURIComponent(url)}`);
    if (!data.tunes || !data.tunes.length) {
      ffUrlStatus.textContent = "No tunes found in that file.";
      return;
    }
    ffUrlStatus.textContent = `${data.tunes.length} tune${data.tunes.length !== 1 ? "s" : ""} found:`;
    ffUrlList.innerHTML = data.tunes.map((t, i) => `
      <div class="ff-cat-tune-row">
        <div class="ff-cat-tune-info">
          <span class="ff-cat-tune-title">${escHtml(t.title)}</span>
          <span class="ff-cat-tune-meta">
            ${t.type ? `<span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type)}</span>` : ""}
            ${t.key  ? `<span class="ff-cat-tune-key">${escHtml(t.key)}${t.mode && t.mode !== "major" ? " " + escHtml(t.mode) : ""}</span>` : ""}
          </span>
        </div>
        <button class="btn-primary btn-sm ff-url-import-btn" data-idx="${i}">+ Import</button>
      </div>`).join("");

    ffUrlList.querySelectorAll(".ff-url-import-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const tune = data.tunes[parseInt(btn.dataset.idx)];
        btn.disabled = true;
        btn.textContent = "Importing…";
        try {
          await apiFetch("/api/tunes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: tune.title, type: tune.type || "", key: tune.key || "",
              mode: tune.mode || "", abc: tune.abc,
              notes: `Imported from: ${url}`,
            }),
          });
          btn.textContent = "Imported ✓";
          loadTunes();
        } catch {
          btn.textContent = "Failed";
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    ffUrlStatus.textContent = `Error: ${err.message}`;
  } finally {
    ffUrlBtn.disabled = false;
  }
}

ffUrlBtn.addEventListener("click", runFfUrlFetch);
ffUrlInput.addEventListener("keydown", e => { if (e.key === "Enter") runFfUrlFetch(); });

// ── FlutefFling.scot — catalogue browser (flat tune list) ────────────────────

const ffCatLoadBtn = document.getElementById("ff-cat-load-btn");
const ffCatSearch  = document.getElementById("ff-cat-search");
const ffCatStatus  = document.getElementById("ff-cat-status");
const ffCatList    = document.getElementById("ff-cat-list");

let _ffAllTunes = []; // full flat list of every tune from FlutefFling

ffCatLoadBtn.addEventListener("click", async () => {
  ffCatLoadBtn.disabled = true;
  ffCatStatus.textContent = "Loading — fetching archive pages and ABC files…";
  ffCatSearch.classList.add("hidden");
  ffCatSearch.value = "";
  ffCatList.innerHTML = "";
  try {
    const res = await fetch("/api/flutefling/all-tunes");
    const data = await res.json();
    if (!res.ok) {
      ffCatStatus.textContent = `Error: ${data.detail || "Could not reach flutefling.scot"}`;
      return;
    }
    _ffAllTunes = data.tunes || [];
    if (!_ffAllTunes.length) {
      ffCatStatus.textContent = "No tunes found — the archive may have changed.";
      return;
    }
    ffCatStatus.textContent = `${_ffAllTunes.length} tune${_ffAllTunes.length !== 1 ? "s" : ""} available`;
    ffCatSearch.classList.remove("hidden");
    ffCatSearch.focus();
    renderFfTuneList(_ffAllTunes);
    ffCatLoadBtn.textContent = "Refresh";
  } catch (err) {
    ffCatStatus.textContent = `Could not load tunes: ${err.message}`;
  } finally {
    ffCatLoadBtn.disabled = false;
  }
});

ffCatSearch.addEventListener("input", () => {
  const q = ffCatSearch.value.trim().toLowerCase();
  const filtered = q
    ? _ffAllTunes.filter(t => t.title.toLowerCase().includes(q) || (t.set_label || "").toLowerCase().includes(q))
    : _ffAllTunes;
  renderFfTuneList(filtered);
});

function renderFfTuneList(tunes) {
  if (!tunes.length) {
    ffCatList.innerHTML = `<p class="ff-cat-empty">No matching tunes.</p>`;
    return;
  }
  ffCatList.innerHTML = tunes.map((t, i) => `
    <div class="ff-cat-tune-row">
      <div class="ff-cat-tune-info">
        <span class="ff-cat-tune-title">${escHtml(t.title)}</span>
        <span class="ff-cat-tune-meta">
          ${t.type ? `<span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type)}</span>` : ""}
          ${t.key  ? `<span class="ff-cat-tune-key">${escHtml(t.key)}${t.mode && t.mode !== "major" ? " " + escHtml(t.mode) : ""}</span>` : ""}
          ${t.set_label ? `<span class="ff-cat-tune-source">${escHtml(t.set_label)}</span>` : ""}
        </span>
      </div>
      <button class="btn-primary btn-sm ff-cat-import-btn" data-idx="${i}">+ Import</button>
    </div>`).join("");

  ffCatList.querySelectorAll(".ff-cat-import-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tune = tunes[parseInt(btn.dataset.idx)];
      btn.disabled = true;
      btn.textContent = "Importing…";
      try {
        await apiFetch("/api/tunes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: tune.title, type: tune.type || "", key: tune.key || "",
            mode: tune.mode || "", abc: tune.abc,
            notes: `Imported from FlutefFling.scot${tune.set_label ? " — " + tune.set_label : ""}`,
          }),
        });
        btn.textContent = "Imported ✓";
        loadTunes();
      } catch {
        btn.textContent = "Failed";
        btn.disabled = false;
      }
    });
  });
}

// ── FlutefFling.scot — section B: search TheSession.org by tune name ──────────
const ffTsInput   = document.getElementById("ff-ts-input");
const ffTsBtn     = document.getElementById("ff-ts-btn");
const ffTsResults = document.getElementById("ff-ts-results");

async function runFfTsSearch() {
  const q = ffTsInput.value.trim();
  if (!q) return;
  ffTsResults.innerHTML = '<p class="loading" style="padding:1rem 0">Searching TheSession.org…</p>';
  ffTsBtn.disabled = true;
  try {
    const data = await apiFetch(`/api/thesession/search?${new URLSearchParams({ q })}`);
    if (!data.tunes || !data.tunes.length) {
      ffTsResults.innerHTML = '<p class="empty" style="padding:1rem 0">No results found.</p>';
      return;
    }
    ffTsResults.innerHTML = data.tunes.map(t => `
      <div class="session-result-row" data-session-id="${t.id}">
        <div class="session-result-info">
          <span class="session-result-name">${escHtml(t.name)}</span>
          <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
        </div>
        <button class="btn-primary ff-ts-import-btn" data-session-id="${t.id}">+ Import</button>
      </div>
    `).join("");
    ffTsResults.querySelectorAll(".ff-ts-import-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Importing…";
        try {
          const res = await fetch("/api/thesession/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tune_id: Number(btn.dataset.sessionId) }),
          });
          const data = await res.json();
          if (res.ok) {
            btn.textContent = data.status === "exists" ? "Already in library" : "Imported ✓";
            btn.style.background = "var(--jig)";
            await Promise.all([loadStats(), loadFilters()]);
            if (state.view === "library") loadTunes();
          } else {
            btn.textContent = "Failed";
            btn.disabled = false;
          }
        } catch { btn.textContent = "Error"; btn.disabled = false; }
      });
    });
  } catch (err) {
    ffTsResults.innerHTML = '<p class="empty" style="padding:1rem 0">Could not reach TheSession.org.</p>';
  } finally {
    ffTsBtn.disabled = false;
  }
}
ffTsBtn.addEventListener("click", runFfTsSearch);
ffTsInput.addEventListener("keydown", e => { if (e.key === "Enter") runFfTsSearch(); });

// ── FlutefFling.scot — section B: save as audio/PDF reference ─────────────────
const ffRefTitle  = document.getElementById("ff-ref-title");
const ffRefUrl    = document.getElementById("ff-ref-url");
const ffRefBtn    = document.getElementById("ff-ref-btn");
const ffRefResult = document.getElementById("ff-ref-result");

ffRefBtn.addEventListener("click", async () => {
  const title = ffRefTitle.value.trim();
  const url   = ffRefUrl.value.trim();
  if (!title) { ffRefTitle.focus(); return; }
  ffRefBtn.disabled = true;
  ffRefResult.classList.add("hidden");
  try {
    const importDate = new Date().toISOString().slice(0, 10);
    const notes = url
      ? `Audio/sheet music: ${url}\n\nImported from FlutefFling.scot: ${importDate}`
      : `Imported from FlutefFling.scot: ${importDate}`;
    await apiFetch("/api/tunes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, notes }),
    });
    ffRefResult.textContent = `"${title}" added to library.`;
    ffRefResult.className = "import-result import-success";
    ffRefResult.classList.remove("hidden");
    ffRefTitle.value = "";
    ffRefUrl.value = "";
    await Promise.all([loadStats(), loadFilters()]);
    if (state.view === "library") loadTunes();
  } catch (err) {
    ffRefResult.textContent = `Error: ${err.message}`;
    ffRefResult.className = "import-result import-error";
    ffRefResult.classList.remove("hidden");
  } finally {
    ffRefBtn.disabled = false;
  }
});
ffRefTitle.addEventListener("keydown", e => { if (e.key === "Enter") ffRefBtn.click(); });

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  await Promise.allSettled([loadFilters(), loadStats(), fetchSets()]);
  await loadTunes();
})();
