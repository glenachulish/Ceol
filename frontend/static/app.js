/* Ceol – Trad Music Web App · frontend JS */

const PAGE_SIZE = 48;

const state = {
  page: 1,
  q: "",
  type: "",
  key: "",
  mode: "",
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
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── API calls ────────────────────────────────────────────────────────────────
async function fetchFilters() {
  const res = await fetch("/api/filters");
  return res.json();
}

async function fetchTunes() {
  const params = new URLSearchParams({ page: state.page, page_size: PAGE_SIZE });
  if (state.q)    params.set("q",    state.q);
  if (state.type) params.set("type", state.type);
  if (state.key)  params.set("key",  state.key);
  if (state.mode) params.set("mode", state.mode);
  const res = await fetch(`/api/tunes?${params}`);
  return res.json();
}

async function fetchTune(id) {
  const res = await fetch(`/api/tunes/${id}`);
  return res.json();
}

async function fetchStats() {
  const res = await fetch("/api/stats");
  return res.json();
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
      </article>`;
  }).join("");

  renderPagination(page, pages);
}

function renderPagination(current, total) {
  if (total <= 1) { pagination.innerHTML = ""; return; }

  const pages = [];

  // Always show first, last, current ±2
  const visible = new Set();
  visible.add(1);
  visible.add(total);
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
  const tagLine = tune.tags && tune.tags.length
    ? `<div class="modal-meta">${tune.tags.map(g => `<span class="badge badge-other">${escHtml(g)}</span>`).join("")}</div>`
    : "";

  modalContent.innerHTML = `
    <h2 class="modal-title">${escHtml(tune.title)}</h2>
    <div class="modal-meta">${typeBadge}${keyBadge}</div>
    ${aliasLine}
    ${tagLine}
    <p class="modal-abc-label">ABC Notation</p>
    <pre class="modal-abc">${escHtml(tune.abc)}</pre>
  `;
}

// ── Loaders ───────────────────────────────────────────────────────────────────
async function loadFilters() {
  const { types, keys, modes } = await fetchFilters();

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
  } catch (_) { /* stats are non-critical */ }
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
  const card = e.target.closest(".tune-card");
  if (!card) return;
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
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

function closeModal() {
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  await Promise.all([loadFilters(), loadStats()]);
  await loadTunes();
})();
