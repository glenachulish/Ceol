/* Ceol – Trad Music Web App · frontend JS */

const PAGE_SIZE = 48;

const state = {
  view: "library",
  page: 1,
  q: "",
  type: "",
  key: "",
  mode: "",
  composer: "",
  hitlist: false,
  favourite: false,
  min_rating: 0,
  sets: [],
  collections: [],
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const searchEl         = document.getElementById("search");
const filterType       = document.getElementById("filter-type");
const filterKey        = document.getElementById("filter-key");
const filterMode       = document.getElementById("filter-mode");
const filterComposer   = document.getElementById("filter-composer");
const filterRating     = document.getElementById("filter-rating");
const filterHitlistBtn   = document.getElementById("filter-hitlist-btn");
const filterFavouriteBtn = document.getElementById("filter-favourite-btn");
const clearBtn           = document.getElementById("clear-btn");
const selectModeBtn    = document.getElementById("select-mode-btn");
const bulkBar          = document.getElementById("bulk-bar");
const bulkCount        = document.getElementById("bulk-count");
const bulkSelectAllBtn = document.getElementById("bulk-select-all-btn");
const bulkMergeBtn          = document.getElementById("bulk-merge-btn");
const bulkAddSetBtn         = document.getElementById("bulk-add-set-btn");
const bulkAddCollectionBtn  = document.getElementById("bulk-add-collection-btn");
const bulkDeleteBtn         = document.getElementById("bulk-delete-btn");
const bulkCancelBtn         = document.getElementById("bulk-cancel-btn");
const tuneList         = document.getElementById("tune-list");
const pagination    = document.getElementById("pagination");
const resultCount   = document.getElementById("result-count");
const statsBar      = document.getElementById("stats-bar");
const statsText     = document.getElementById("stats-text");
const modalOverlay  = document.getElementById("modal-overlay");
const modalContent  = document.getElementById("modal-content");
const modalClose    = document.getElementById("modal-close");
const viewLibrary   = document.getElementById("view-library");
const viewSets           = document.getElementById("view-sets");
const viewCollections    = document.getElementById("view-collections");
const navLibrary    = document.getElementById("nav-library");
const navSets       = document.getElementById("nav-sets");
const navCollections= document.getElementById("nav-collections");
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
const cancelSetBtn       = document.getElementById("cancel-set-btn");
const setsList           = document.getElementById("sets-list");
const newCollectionBtn   = document.getElementById("new-collection-btn");
const newCollectionForm  = document.getElementById("new-collection-form");
const newCollectionName  = document.getElementById("new-collection-name");
const newCollectionDesc  = document.getElementById("new-collection-desc");
const createCollectionBtn= document.getElementById("create-collection-btn");
const cancelCollectionBtn= document.getElementById("cancel-collection-btn");
const collectionsList    = document.getElementById("collections-list");
const viewNotes         = document.getElementById("view-notes");
const navNotes          = document.getElementById("nav-notes");
const viewAchievements  = document.getElementById("view-achievements");
const navAchievements   = document.getElementById("nav-achievements");
const navMoreBtn        = document.getElementById("nav-more-btn");
const navMoreMenu       = document.getElementById("nav-more-menu");
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
  bulkAddSetBtn.disabled = n === 0;
  bulkAddCollectionBtn.disabled = n === 0;
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

// ── Bulk add to set ───────────────────────────────────────────────────────────

bulkAddSetBtn.addEventListener("click", async () => {
  const ids = [..._selectedIds].map(Number);
  if (!ids.length) return;

  const sets = await apiFetch("/api/sets");

  const existingOptions = sets.map(s =>
    `<label class="bulk-col-option">
       <input type="radio" name="bulk-set" value="${s.id}" />
       ${escHtml(s.name)}
     </label>`
  ).join("");

  modalContent.innerHTML = `
    <h2 class="modal-title">Add ${ids.length} tune${ids.length !== 1 ? "s" : ""} to Set</h2>
    <div class="bulk-col-list">
      ${existingOptions}
      <label class="bulk-col-option">
        <input type="radio" name="bulk-set" value="__new__" />
        <em>Create new set…</em>
      </label>
    </div>
    <div id="bulk-set-new-form" class="hidden" style="margin-top:.75rem">
      <input id="bulk-set-new-name" type="text" class="ff-url-input" placeholder="Set name" />
    </div>
    <div class="notes-actions" style="margin-top:1.25rem">
      <button id="bulk-set-confirm" class="btn-primary" disabled>Add to Set</button>
      <button id="bulk-set-cancel" class="btn-secondary">Cancel</button>
      <span id="bulk-set-status" class="notes-status"></span>
    </div>`;
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const confirmBtn = document.getElementById("bulk-set-confirm");
  const newForm = document.getElementById("bulk-set-new-form");
  const newNameInput = document.getElementById("bulk-set-new-name");

  modalContent.querySelectorAll("input[name=bulk-set]").forEach(radio => {
    radio.addEventListener("change", () => {
      confirmBtn.disabled = false;
      newForm.classList.toggle("hidden", radio.value !== "__new__");
      if (radio.value === "__new__") newNameInput.focus();
    });
  });
  document.getElementById("bulk-set-cancel").addEventListener("click", closeModal);

  confirmBtn.addEventListener("click", async () => {
    const selected = modalContent.querySelector("input[name=bulk-set]:checked");
    if (!selected) return;
    const status = document.getElementById("bulk-set-status");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Adding…";
    try {
      let setId;
      if (selected.value === "__new__") {
        const name = newNameInput.value.trim();
        if (!name) { newNameInput.focus(); confirmBtn.disabled = false; confirmBtn.textContent = "Add to Set"; return; }
        const created = await apiCreateSet(name, "");
        setId = created.id;
        state.sets.push({ ...created, tune_count: 0 });
      } else {
        setId = Number(selected.value);
      }
      await Promise.all(ids.map(id =>
        apiFetch(`/api/sets/${setId}/tunes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tune_id: id }),
        })
      ));
      status.textContent = `Added ${ids.length} tune${ids.length !== 1 ? "s" : ""}.`;
      setTimeout(() => { closeModal(); _exitSelectMode(); }, 800);
    } catch {
      status.textContent = "Failed — please try again.";
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Add to Set";
    }
  });
});

// ── Bulk add to collection ────────────────────────────────────────────────────

bulkAddCollectionBtn.addEventListener("click", async () => {
  const ids = [..._selectedIds].map(Number);
  if (!ids.length) return;

  const cols = await apiFetch("/api/collections");

  const existingOptions = cols.map(c =>
    `<label class="bulk-col-option">
       <input type="radio" name="bulk-col" value="${c.id}" />
       ${escHtml(c.name)}
     </label>`
  ).join("");

  modalContent.innerHTML = `
    <h2 class="modal-title">Add ${ids.length} tune${ids.length !== 1 ? "s" : ""} to Collection</h2>
    <div class="bulk-col-list">
      ${existingOptions}
      <label class="bulk-col-option">
        <input type="radio" name="bulk-col" value="__new__" />
        <em>Create new collection…</em>
      </label>
    </div>
    <div id="bulk-col-new-form" class="hidden" style="margin-top:.75rem">
      <input id="bulk-col-new-name" type="text" class="ff-url-input" placeholder="Collection name" />
    </div>
    <div class="notes-actions" style="margin-top:1.25rem">
      <button id="bulk-col-confirm" class="btn-primary" disabled>Add to Collection</button>
      <button id="bulk-col-cancel" class="btn-secondary">Cancel</button>
      <span id="bulk-col-status" class="notes-status"></span>
    </div>`;
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const confirmBtn = document.getElementById("bulk-col-confirm");
  const newForm = document.getElementById("bulk-col-new-form");
  const newNameInput = document.getElementById("bulk-col-new-name");

  modalContent.querySelectorAll("input[name=bulk-col]").forEach(radio => {
    radio.addEventListener("change", () => {
      confirmBtn.disabled = false;
      newForm.classList.toggle("hidden", radio.value !== "__new__");
      if (radio.value === "__new__") newNameInput.focus();
    });
  });
  document.getElementById("bulk-col-cancel").addEventListener("click", closeModal);

  confirmBtn.addEventListener("click", async () => {
    const selected = modalContent.querySelector("input[name=bulk-col]:checked");
    if (!selected) return;
    const status = document.getElementById("bulk-col-status");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Adding…";
    try {
      let colId;
      if (selected.value === "__new__") {
        const name = newNameInput.value.trim();
        if (!name) { newNameInput.focus(); confirmBtn.disabled = false; confirmBtn.textContent = "Add to Collection"; return; }
        const created = await apiCreateCollection(name, "");
        colId = created.id;
        state.collections.push({ ...created, tune_count: 0 });
      } else {
        colId = Number(selected.value);
      }
      await Promise.all(ids.map(id =>
        apiFetch(`/api/collections/${colId}/tunes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tune_id: id }),
        })
      ));
      status.textContent = `Added ${ids.length} tune${ids.length !== 1 ? "s" : ""}.`;
      setTimeout(() => { closeModal(); _exitSelectMode(); }, 800);
    } catch {
      status.textContent = "Failed — please try again.";
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Add to Collection";
    }
  });
});

// ── Group tunes as versions ───────────────────────────────────────────────────

function _showGroupDialog(tunes) {
  // Split: is one of these tunes already a parent group?
  const existingParent = tunes.find(t => t.version_count > 0);
  const tunesToAdd = existingParent ? tunes.filter(t => t.id !== existingParent.id) : tunes;
  const isAddingToExisting = !!existingParent;

  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const labelInputs = tunesToAdd.map((t, i) =>
    `<label class="ff-url-label">Version label for <strong>${escHtml(t.title)}</strong>${t.key ? ` (${escHtml(t.key)})` : ""}</label>
     <input id="group-label-${i}" type="text" class="ff-url-input"
            value="${escHtml(t.key ? `Version in ${t.key}` : `Version ${i + 1}`)}"
            placeholder="e.g. Version in D" />`
  ).join("");

  const titleDefault = existingParent ? existingParent.title : tunes[0].title;
  const heading = isAddingToExisting
    ? `Add to existing group "<strong>${escHtml(existingParent.title)}</strong>"`
    : "Group as Versions";
  const hint = isAddingToExisting
    ? `The selected tune${tunesToAdd.length > 1 ? "s" : ""} will be added as ${tunesToAdd.length > 1 ? "versions" : "a version"} in the existing group.`
    : "These tunes will be grouped under a single entry. Each version remains its own tune with its own sheet music — they are just listed together when you click the group name.";

  modalContent.innerHTML = `
    <h2 class="modal-title">${heading}</h2>
    <p class="modal-abc-label">${hint}</p>

    <div class="merge-form">
      <label class="ff-url-label">Group title (shown in the library)</label>
      <input id="group-title" type="text" class="ff-url-input" value="${escHtml(titleDefault)}" />
      ${labelInputs}
    </div>

    <div class="notes-actions" style="margin-top:1.25rem">
      <button id="group-confirm-btn" class="btn-primary">${isAddingToExisting ? "Add to group" : "Create group"}</button>
      <button id="group-cancel-btn" class="btn-secondary">Cancel</button>
      <span id="group-status" class="notes-status"></span>
    </div>
  `;

  document.getElementById("group-cancel-btn").addEventListener("click", closeModal);

  document.getElementById("group-confirm-btn").addEventListener("click", async () => {
    const groupTitle = document.getElementById("group-title").value.trim();
    const labels = tunesToAdd.map((_, i) =>
      document.getElementById(`group-label-${i}`).value.trim()
    );
    const status = document.getElementById("group-status");
    if (!groupTitle) { status.textContent = "Group title is required."; return; }

    const confirmBtn = document.getElementById("group-confirm-btn");
    confirmBtn.disabled = true;
    confirmBtn.textContent = isAddingToExisting ? "Adding…" : "Grouping…";
    status.textContent = "";

    try {
      await apiFetch("/api/tunes/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: groupTitle,
          tune_ids: tunesToAdd.map(t => Number(t.id)),
          labels,
          existing_parent_id: existingParent ? Number(existingParent.id) : null,
        }),
      });
      closeModal();
      _exitSelectMode();
      await Promise.all([loadStats(), loadFilters(), loadTunes()]);
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
      confirmBtn.disabled = false;
      confirmBtn.textContent = isAddingToExisting ? "Add to group" : "Create group";
    }
  });
}

bulkMergeBtn.addEventListener("click", async () => {
  if (_selectedIds.size < 2) return;
  const ids = [..._selectedIds];
  // Reject only if multiple selected cards are parents (ambiguous merge)
  const parentIds = ids.filter(id => {
    const card = tuneList.querySelector(`.tune-card[data-id="${id}"]`);
    return card && Number(card.dataset.versions || 0) > 0;
  });
  if (parentIds.length > 1) {
    alert("Multiple groups selected. Please select at most one existing group plus any standalone tunes to add to it.");
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

// ── Membership transfer (delete → import replacement) ─────────────────────────

const _TRANSFER_KEY = "ceol_pending_transfer";
const _pendingTransferBanner = document.getElementById("pending-transfer-banner");
const _pendingTransferMsg    = document.getElementById("pending-transfer-msg");

function _savePendingTransfer(data) { localStorage.setItem(_TRANSFER_KEY, JSON.stringify(data)); }
function _getPendingTransfer() { try { return JSON.parse(localStorage.getItem(_TRANSFER_KEY)); } catch { return null; } }
function _clearPendingTransfer() { localStorage.removeItem(_TRANSFER_KEY); }

function _showPendingTransferBanner() {
  const pt = _getPendingTransfer();
  if (!pt) { _pendingTransferBanner.classList.add("hidden"); return; }
  const parts = [];
  if (pt.sets.length) parts.push(`${pt.sets.length} set${pt.sets.length !== 1 ? "s" : ""}`);
  if (pt.collections.length) parts.push(`${pt.collections.length} collection${pt.collections.length !== 1 ? "s" : ""}`);
  _pendingTransferMsg.textContent =
    `📋 Memberships saved from "${pt.tuneName}" (${parts.join(" & ")}) — import or open a replacement tune to apply them.`;
  _pendingTransferBanner.classList.remove("hidden");
}

document.getElementById("pending-transfer-dismiss").addEventListener("click", () => {
  _clearPendingTransfer();
  _showPendingTransferBanner();
});

async function _fetchTuneMemberships(tuneId) {
  const [collections, sets] = await Promise.all([
    apiFetch(`/api/tunes/${tuneId}/collections`),
    apiFetch(`/api/tunes/${tuneId}/sets`),
  ]);
  return { collections, sets };
}

async function _applyTransfer(toTuneId) {
  const pt = _getPendingTransfer();
  if (!pt) return;
  await Promise.all([
    ...pt.sets.map(s => apiFetch(`/api/sets/${s.id}/tunes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tune_id: toTuneId }),
    })),
    ...pt.collections.map(c => apiFetch(`/api/collections/${c.id}/tunes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tune_id: toTuneId }),
    })),
  ]);
  _clearPendingTransfer();
  _showPendingTransferBanner();
}

async function _offerTransfer(newTuneId, newTuneName) {
  const pt = _getPendingTransfer();
  if (!pt) return;
  const parts = [];
  if (pt.sets.length) parts.push(`${pt.sets.length} set${pt.sets.length !== 1 ? "s" : ""}`);
  if (pt.collections.length) parts.push(`${pt.collections.length} collection${pt.collections.length !== 1 ? "s" : ""}`);
  modalContent.innerHTML = `
    <h2 class="modal-title">Transfer Memberships?</h2>
    <p>Apply the saved memberships from <strong>${escHtml(pt.tuneName)}</strong>
       (${parts.join(" &amp; ")}) to <strong>${escHtml(newTuneName)}</strong>?</p>
    <div class="notes-actions" style="margin-top:1.25rem">
      <button id="transfer-yes-btn" class="btn-primary">Apply memberships</button>
      <button id="transfer-no-btn" class="btn-secondary">No thanks</button>
      <span id="transfer-status" class="notes-status"></span>
    </div>`;
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  document.getElementById("transfer-no-btn").addEventListener("click", () => {
    _clearPendingTransfer();
    _showPendingTransferBanner();
    closeModal();
  });
  document.getElementById("transfer-yes-btn").addEventListener("click", async () => {
    const yesBtn = document.getElementById("transfer-yes-btn");
    const status = document.getElementById("transfer-status");
    yesBtn.disabled = true;
    yesBtn.textContent = "Applying…";
    try {
      await _applyTransfer(newTuneId);
      status.textContent = `✓ Applied ${parts.join(" & ")} from "${pt.tuneName}".`;
      status.className = "notes-status notes-saved";
      setTimeout(closeModal, 900);
    } catch {
      status.textContent = "Failed — please try again.";
      yesBtn.disabled = false;
      yesBtn.textContent = "Apply memberships";
    }
  });
}

// Show delete confirmation modal with optional membership-save checkbox.
// onConfirmed(didSave) is called after the user confirms deletion.
async function _confirmDeleteWithTransfer(tuneId, tuneName, onConfirmed) {
  let memberships = { collections: [], sets: [] };
  try { memberships = await _fetchTuneMemberships(tuneId); } catch { /* proceed without */ }
  const hasMembers = memberships.collections.length > 0 || memberships.sets.length > 0;

  const setList = memberships.sets.map(s => escHtml(s.name)).join(", ");
  const colList = memberships.collections.map(c => escHtml(c.name)).join(", ");
  const memberBlock = hasMembers ? `
    <p class="modal-abc-label" style="margin-top:.5rem">This tune is in:<br>
      ${memberships.sets.length ? `<strong>Sets:</strong> ${setList}<br>` : ""}
      ${memberships.collections.length ? `<strong>Collections:</strong> ${colList}` : ""}
    </p>
    <label style="display:flex;align-items:center;gap:.5rem;margin-top:.75rem;cursor:pointer">
      <input type="checkbox" id="del-save-members" checked />
      Save memberships for a replacement tune
    </label>` : "";

  modalContent.innerHTML = `
    <h2 class="modal-title">Delete tune?</h2>
    <p>Delete <strong>${escHtml(tuneName)}</strong> from your library? This cannot be undone.</p>
    ${memberBlock}
    <div class="notes-actions" style="margin-top:1.25rem">
      <button id="del-confirm-btn" class="btn-danger">Delete</button>
      <button id="del-cancel-btn" class="btn-secondary">Cancel</button>
    </div>`;
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  document.getElementById("del-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("del-confirm-btn").addEventListener("click", async () => {
    const saveChecked = hasMembers && document.getElementById("del-save-members").checked;
    document.getElementById("del-confirm-btn").disabled = true;
    if (saveChecked) {
      _savePendingTransfer({ tuneName, ...memberships });
    }
    closeModal();
    await onConfirmed(saveChecked);
    if (saveChecked) _showPendingTransferBanner();
  });
}

// ── Utilities ────────────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function typeBadgeClass(type) {
  const map = {
    "reel":        "badge-reel",
    "jig":         "badge-jig",
    "hornpipe":    "badge-hornpipe",
    "slip jig":    "badge-slip-jig",
    "polka":       "badge-polka",
    "march":       "badge-march",
    "waltz":       "badge-waltz",
    "strathspey":  "badge-strathspey",
    "slide":       "badge-slide",
    "hop jig":     "badge-hop-jig",
    "air":         "badge-air",
    "slow air":    "badge-slow-air",
    "mazurka":     "badge-mazurka",
    "barndance":   "badge-barndance",
    "schottische": "badge-schottische",
    "highland":    "badge-highland",
    "set dance":   "badge-set-dance",
  };
  return map[type] || "badge-other";
}

function keyBadgeClass(key) {
  if (!key) return "badge-key";
  // Match root note including accidentals: HP, or A-G optionally followed by # or b
  const m = key.trim().match(/^(HP|[A-G][#b]?)/i);
  if (!m) return "badge-key";
  const note = m[1];
  // Normalise to badge class key
  const upper = note.toUpperCase();
  if (upper === "HP") return "badge-key-HP";
  if (upper === "F#" || upper === "GB") return "badge-key-Fs";
  if (upper === "BB" || upper === "A#") return "badge-key-Bb";
  if (upper === "EB" || upper === "D#") return "badge-key-Eb";
  if (upper === "AB" || upper === "G#") return "badge-key-A";  // Ab → A family
  if (upper === "DB" || upper === "C#") return "badge-key-C";  // Db/C# → C family
  const map = { C:"badge-key-C", D:"badge-key-D", E:"badge-key-E", F:"badge-key-F",
                G:"badge-key-G", A:"badge-key-A", B:"badge-key-B" };
  return map[upper[0]] || "badge-key";
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
  if (state.composer)   params.set("composer",    state.composer);
  if (state.hitlist)    params.set("hitlist",     "1");
  if (state.favourite)  params.set("favourite",   "1");
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

async function apiReorderSetTunes(setId, orderedTuneIds) {
  return apiFetch(`/api/sets/${setId}/tunes/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: orderedTuneIds }),
  });
}

async function fetchCollections() {
  const collections = await apiFetch("/api/collections");
  state.collections = collections;
  return collections;
}

async function apiCreateCollection(name, description) {
  return apiFetch("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
}

async function apiDeleteCollection(id) {
  return apiFetch(`/api/collections/${id}`, { method: "DELETE" });
}

async function apiGetCollection(id) {
  return apiFetch(`/api/collections/${id}`);
}

async function apiAddTuneToCollection(colId, tuneId) {
  return apiFetch(`/api/collections/${colId}/tunes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tune_id: tuneId }),
  });
}

async function apiRemoveTuneFromCollection(colId, tuneId) {
  return apiFetch(`/api/collections/${colId}/tunes/${tuneId}`, { method: "DELETE" });
}

async function apiGetTuneCollections(tuneId) {
  return apiFetch(`/api/tunes/${tuneId}/collections`);
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
// Nav colour map — inline styles beat all CSS specificity issues
const _NAV_COLOURS = {
  library:     { el: () => navLibrary,     bg: "#7c6af7" },
  sets:        { el: () => navSets,        bg: "#0d9488" },
  collections: { el: () => navCollections, bg: "#f59e0b" },
};
function _applyNavColour(view) {
  Object.values(_NAV_COLOURS).forEach(({ el }) => {
    const n = el();
    n.style.removeProperty("background-color");
    n.style.removeProperty("border-color");
    n.style.removeProperty("color");
  });
  const c = _NAV_COLOURS[view];
  if (c) {
    const n = c.el();
    n.style.setProperty("background-color", c.bg, "important");
    n.style.setProperty("border-color", c.bg, "important");
    n.style.setProperty("color", "#fff", "important");
  }
}

function switchView(view) {
  state.view = view;
  document.body.dataset.view = view;
  _applyNavColour(view);
  if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} _setMusicSynth = null; }
  [viewLibrary, viewSets, viewCollections, viewNotes, viewAchievements].forEach(v => v.classList.add("hidden"));
  [navLibrary, navSets, navCollections].forEach(n => n.classList.remove("active"));
  if (navMoreMenu) navMoreMenu.classList.add("hidden");

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
  } else if (view === "collections") {
    viewCollections.classList.remove("hidden");
    navCollections.classList.add("active");
    loadCollections();
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
    const noFilters = !state.q && !state.type && !state.key && !state.mode && !state.composer && !state.hitlist && !state.favourite && !state.min_rating;
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
      ? `<span class="badge ${typeClass}" data-badge="type">${escHtml(t.type)}</span>`
      : "";
    const keyLabel = t.key
      ? `<span class="badge ${keyBadgeClass(t.key)}" data-badge="key">${escHtml(t.key)}</span>`
      : "";
    const vCount = t.version_count || 0;
    const versionBadge = vCount > 0
      ? `<span class="badge badge-versions">${vCount} version${vCount !== 1 ? "s" : ""}</span>`
      : "";
    const rating = t.rating || 0;
    const stars = [1,2,3,4,5].map(n =>
      `<button class="star-btn${rating >= n ? " filled" : ""}" data-n="${n}" tabindex="-1">★</button>`
    ).join("");
    const isFav = t.is_favourite || 0;
    return `
      <article class="tune-card${t.on_hitlist ? " on-hitlist" : ""}" data-id="${t.id}" data-versions="${vCount}"
               data-rating="${rating}" data-hitlist="${t.on_hitlist || 0}" data-favourite="${isFav}"
               tabindex="0" role="button" aria-label="${escHtml(t.title)}">
        <button class="hitlist-btn${t.on_hitlist ? " active" : ""}"
                title="${t.on_hitlist ? "Remove from hitlist" : "Add to hitlist"}">📌</button>
        <button class="fav-btn${isFav ? " active" : ""}"
                title="${isFav ? "Remove from favourites" : "Add to favourites"}">👍</button>
        <div class="card-title${t.on_hitlist ? " hitlist-title" : ""}">${escHtml(t.title)}</div>
        <div class="card-meta">${typeLabel}${keyLabel}${versionBadge}</div>
        <div class="card-stars">${stars}</div>
        <button class="tune-delete-btn" data-id="${t.id}" title="Delete tune" aria-label="Delete ${escHtml(t.title)}">🗑</button>
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

function renderModal(tune, onBack = null, siblings = null) {
  const typeClass = typeBadgeClass(tune.type);
  const typeBadge = tune.type
    ? `<span class="badge ${typeClass} badge-editable" data-field="type">${escHtml(tune.type)}</span>`
    : `<button class="badge-add-field" data-field="type">+ type</button>`;
  const keyBadge = tune.key
    ? `<span class="badge ${keyBadgeClass(tune.key)} badge-editable" data-field="key">${escHtml(tune.key)}</span>`
    : `<button class="badge-add-field" data-field="key">+ key</button>`;
  const backBtn = onBack
    ? `<button id="modal-back-btn" class="modal-back-btn btn-secondary btn-sm">← Back</button>`
    : "";
  const versionLine = tune.version_label
    ? `<p class="modal-version-label">${escHtml(tune.version_label)}</p>`
    : "";

  const siblingsStrip = siblings && siblings.length > 1
    ? `<div class="modal-versions-strip" id="modal-versions-strip">
        ${siblings.map((v, i) => {
          const label = v.version_label || `Version ${i + 1}`;
          const meta = [v.key, v.type].filter(Boolean).join(" · ");
          const isActive = v.id === tune.id;
          let tip = meta ? meta + "\n" : "";
          if (v.is_default) {
            tip += "★ Default — opens first when you click the card";
          } else {
            tip += "Click to view this version\nTo make it the default, click ← Back then \"Set default\"";
          }
          return `<span class="modal-ver-item">
            <button class="modal-ver-btn${isActive ? " active" : ""}${v.is_default ? " is-default" : ""}"
                    data-ver-id="${v.id}" title="${escHtml(tip)}">${escHtml(label)}</button><button class="modal-ver-del" data-ver-id="${v.id}" title="Delete this version">🗑</button></span>`;
        }).join("")}
      </div>`
    : "";

  const ratingLabels = ["Unrated","Just starting","Getting there","Almost there","Know it well","Nailed it!"];
  const modalRating = tune.rating || 0;
  const modalStars = [1,2,3,4,5].map(n =>
    `<button class="modal-star-btn${modalRating >= n ? " filled" : ""}" data-n="${n}" title="Mastery: ${ratingLabels[n]}">★</button>`
  ).join("");
  const ratingRow = `
    <div class="modal-rating-row">
      <span class="modal-rating-section-label">Mastery</span>
      <div class="modal-stars" id="modal-stars">${modalStars}</div>
      <span class="modal-rating-label" id="modal-rating-label">${ratingLabels[modalRating]}</span>
    </div>`;
  const aliasLine = tune.aliases && tune.aliases.length
    ? `<p class="modal-aliases">Also known as: ${tune.aliases.map(escHtml).join(", ")}</p>`
    : "";
  const _sessionUrlMatch = tune.source_url && tune.source_url.match(/thesession\.org\/tunes\/(\d+)/);
  const _sessionId = tune.session_id || (_sessionUrlMatch && _sessionUrlMatch[1]);
  const sessionLink = _sessionId
    ? `<a class="modal-session-link" href="https://thesession.org/tunes/${_sessionId}" target="_blank" rel="noopener">View on TheSession.org ↗</a>`
    : "";
  const importedLine = tune.imported_at
    ? `<p class="modal-imported">Imported: ${new Date(tune.imported_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}${sessionLink ? ` · ${sessionLink}` : ""}</p>`
    : sessionLink ? `<p class="modal-imported">${sessionLink}</p>` : "";
  const tagLine = tune.tags && tune.tags.length
    ? `<div class="modal-meta">${tune.tags.map(g => `<span class="badge badge-other">${escHtml(g)}</span>`).join("")}</div>`
    : "";

  // Extract PDF, image, and MP3 URLs from notes (FlutefFling, Dropbox, or any source)
  const pdfUrl = (() => {
    if (!tune.notes) return null;
    const m = tune.notes.match(/sheet music \(PDF\):\s*(\S+)/);
    return m ? m[1] : null;
  })();
  const imageUrl = (() => {
    if (!tune.notes) return null;
    const m = tune.notes.match(/sheet music \(image\):\s*(\S+)/);
    return m ? m[1] : null;
  })();
  const notesAudioUrls = (() => {
    if (!tune.notes) return [];
    const urlRe = /https?:\/\/[^\s<>"]+/g;
    const urls = [];
    let m;
    while ((m = urlRe.exec(tune.notes)) !== null) {
      const url = m[0];
      if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(url) || /\/api\/(uploads|dropbox\/file)\b/.test(url)) {
        urls.push(url);
      }
    }
    return urls;
  })();
  const setsFooter = `<div class="modal-sets-row">
      <button id="add-to-set-btn" class="btn-set btn-sm">+ Add to a set…</button>
      <button id="create-set-from-tune-btn" class="btn-set btn-sm">+ Create new set</button>
      <button id="build-set-from-tune-btn" class="btn-set btn-sm">🎵 Build a Set from here</button>
    </div>`;

  const collectionsOptions = state.collections
    .map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`)
    .join("");
  const collectionsFooter = `<div class="modal-col-section">
    <div class="modal-sets-row">
      <select id="col-select" class="set-select set-select-collection">
        <option value="">Add to a collection…</option>
        ${collectionsOptions}
        <option value="__new__">＋ New collection…</option>
      </select>
      <span id="col-status" class="set-status"></span>
    </div>
    <div id="new-col-form" class="modal-new-col-form hidden">
      <input id="new-col-name" type="text" placeholder="New collection name…" maxlength="120" class="ff-url-input" />
      <button id="new-col-confirm" class="btn-collection btn-sm">Create &amp; Add</button>
      <button id="new-col-cancel" class="btn-secondary btn-sm">Cancel</button>
      <span id="new-col-status" class="set-status"></span>
    </div>
  </div>`;

  const composerLine = (tune.composer || tune.transcribed_by) ? `
    <div class="tune-composer-line">
      ${tune.composer ? `<span class="tune-composer">♪ ${escHtml(tune.composer)}</span>` : ""}
      ${tune.transcribed_by ? `<span class="tune-transcriber">ABC: ${escHtml(tune.transcribed_by)}</span>` : ""}
    </div>` : "";

  modalContent.innerHTML = `
    ${backBtn}
    <h2 class="modal-title"><span id="modal-title-text">${escHtml(tune.title)}</span><button class="title-edit-btn" id="title-edit-btn" title="Edit title">✎</button></h2>
    ${versionLine}
    ${siblingsStrip}
    <div class="modal-meta" id="modal-typkey-meta">${typeBadge}${keyBadge}</div>
    ${composerLine}
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
        ${tune.abc ? `<button id="abc-fs-btn" class="abc-fs-btn" title="Full screen sheet music">⛶ Full screen</button>` : ""}
        <div id="sheet-music-render"></div>
        ${imageUrl ? `<img id="image-embed" class="sheet-music-image" src="${escHtml(imageUrl)}" alt="Sheet music photo" />` : ""}
        ${imageUrl ? `<p class="pdf-link-hint"><a href="${escHtml(imageUrl)}" target="_blank" rel="noopener">Open image in new tab ↗</a></p>` : ""}
        ${imageUrl ? `<div class="transcribe-row">
          <button id="transcribe-abc-btn" class="btn-secondary">✨ Transcribe to ABC</button>
          <span id="transcribe-status" class="transcribe-status"></span>
        </div>` : ""}
        ${pdfUrl ? `<iframe id="pdf-embed" class="pdf-embed" src="${escHtml(pdfUrl)}" title="Sheet music PDF"></iframe>` : ""}
        ${pdfUrl ? `<p class="pdf-link-hint"><a href="${escHtml(pdfUrl)}" target="_blank" rel="noopener">Open PDF in new tab ↗</a></p>` : ""}
      </div>
      <div id="fetch-abc-section"${tune.abc ? ' class="fetch-abc-collapsed"' : ""}>
        <div class="fetch-abc-row">
          ${tune.abc ? `<button id="fetch-abc-toggle" class="btn-secondary btn-sm">🔍 Find on TheSession.org…</button>` : ""}
          <button id="fetch-session-abc" class="btn-import${tune.abc ? " hidden" : ""}">🔍 Find ABC on TheSession.org</button>
          <span id="fetch-abc-status" class="notes-status"></span>
          ${tune.abc ? `<button id="strip-chords-btn" class="btn-secondary btn-sm" title="Remove guitar chord symbols from ABC">✂ Strip chords</button>` : ""}
        </div>
        <div id="session-abc-results" class="session-abc-results hidden"></div>
      </div>
      ${sessionLink ? `<p class="session-link-below">${sessionLink}</p>` : ""}
      ${pdfUrl ? `<div class="ff-download-row">
        <a class="btn-secondary ff-dl-btn" href="/api/proxy-download?url=${encodeURIComponent(pdfUrl)}" download>⬇ Download PDF</a>
      </div>` : ""}
      ${notesAudioUrls.map((u, i) => {
        const label = notesAudioUrls.length > 1 ? `▶ Play MP3 ${i + 1}` : "▶ Play MP3";
        return `<div class="ff-download-row">
          <button class="btn-secondary media-play-btn" data-url="${escHtml(u)}" data-media-type="audio">${label}</button>
        </div>`;
      }).join("")}
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
      ${collectionsFooter}
      <div class="modal-danger-row">
        <button id="modal-hitlist-btn" class="btn-secondary${tune.on_hitlist ? " hitlist-active" : ""}">
          📌 ${tune.on_hitlist ? "On Hitlist" : "Add to Hitlist"}
        </button>
        <button id="modal-fav-btn" class="btn-secondary${tune.is_favourite ? " fav-active" : ""}">
          👍 ${tune.is_favourite ? "Favourite" : "Add to Favourites"}
        </button>
        <a id="export-tune-btn" class="btn-secondary" href="/api/export/tune/${tune.id}" download title="Download as .ceol.json for sharing">⬇ Export</a>
        <button id="delete-tune-modal-btn" class="btn-danger" data-tune-id="${tune.id}">
          ${tune.parent_id ? "Delete this version" : "Delete from Library"}
        </button>
      </div>
    </div>
  `;

  // Editable type/key badges
  initMetaEdit(tune);

  // Editable title
  initTitleEdit(tune);

  // Back button (from versions panel)
  if (onBack) {
    document.getElementById("modal-back-btn").addEventListener("click", onBack);
  }

  // Version switcher strip
  if (siblings && siblings.length > 1) {
    modalContent.querySelectorAll(".modal-ver-btn").forEach(btn => {
      if (Number(btn.dataset.verId) === tune.id) return; // already showing
      btn.addEventListener("click", async () => {
        const t = await fetchTune(btn.dataset.verId);
        renderModal(t, onBack, siblings);
        requestAnimationFrame(() => {
          if (t.abc) renderSheetMusic(t.abc);
        });
      });
    });

    modalContent.querySelectorAll(".modal-ver-del").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const verId = Number(btn.dataset.verId);
        const label = siblings.find(s => s.id === verId)?.version_label || "this version";
        if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
        btn.disabled = true;
        try {
          await apiDeleteTune(verId);
          const parentId = tune.parent_id;
          // Fetch updated sibling list (parent may have been auto-ungrouped)
          let updatedSiblings = [];
          try {
            const res = await apiFetch(`/api/tunes/${parentId}/versions`);
            updatedSiblings = res.versions;
          } catch { /* parent was deleted = auto-ungrouped */ }

          if (verId === tune.id) {
            // Deleted the currently-viewed version
            if (updatedSiblings.length === 0) {
              closeModal(); loadTunes();
            } else if (updatedSiblings.length === 1) {
              // Auto-ungrouped: the one remaining tune is now standalone
              const t = await fetchTune(updatedSiblings[0].id);
              renderModal(t, onBack, null);
              requestAnimationFrame(() => { if (t.abc) renderSheetMusic(t.abc); });
            } else {
              const t = await fetchTune(updatedSiblings[0].id);
              renderModal(t, onBack, updatedSiblings);
              requestAnimationFrame(() => { if (t.abc) renderSheetMusic(t.abc); });
            }
          } else {
            // Deleted a different version — stay on current tune, update strip
            if (updatedSiblings.length <= 1) {
              const t = await fetchTune(tune.id);
              renderModal(t, onBack, updatedSiblings.length === 1 ? null : null);
              requestAnimationFrame(() => { if (t.abc) renderSheetMusic(t.abc); });
            } else {
              renderModal(tune, onBack, updatedSiblings);
              requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); });
            }
          }
          loadTunes();
        } catch (err) {
          alert("Failed to delete version. Please try again.");
          btn.disabled = false;
        }
      });
    });
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
        // Also update the card in the background (fall back to parent card for versioned tunes)
        const card = tuneList.querySelector(`.tune-card[data-id="${tune.id}"]`)
          || (tune.parent_id ? tuneList.querySelector(`.tune-card[data-id="${tune.parent_id}"]`) : null);
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

  // Modal favourite toggle
  const modalFavBtn = document.getElementById("modal-fav-btn");
  let _modalFav = tune.is_favourite || 0;
  modalFavBtn.addEventListener("click", async () => {
    const is_favourite = _modalFav ? 0 : 1;
    try {
      await apiFetch(`/api/tunes/${tune.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favourite }),
      });
      _modalFav = is_favourite;
      modalFavBtn.textContent = `👍 ${is_favourite ? "Favourite" : "Add to Favourites"}`;
      modalFavBtn.classList.toggle("fav-active", Boolean(is_favourite));
      const card = tuneList.querySelector(`.tune-card[data-id="${tune.id}"]`);
      if (card) {
        card.dataset.favourite = is_favourite;
        const fBtn = card.querySelector(".fav-btn");
        if (fBtn) {
          fBtn.classList.toggle("active", Boolean(is_favourite));
          fBtn.title = is_favourite ? "Remove from favourites" : "Add to favourites";
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

  // Transcribe image to ABC via Claude vision
  const transcribeBtn = document.getElementById("transcribe-abc-btn");
  if (transcribeBtn) {
    transcribeBtn.addEventListener("click", async () => {
      const status  = document.getElementById("transcribe-status");
      const textarea = document.getElementById("abc-edit-textarea");
      transcribeBtn.disabled = true;
      transcribeBtn.textContent = "Transcribing…";
      status.textContent = "";
      status.className = "transcribe-status";
      try {
        const data = await apiFetch(`/api/tunes/${tune.id}/transcribe-image`, { method: "POST" });
        textarea.value = data.abc;
        // Switch to ABC tab so the user can review and save
        modalContent.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        modalContent.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
        modalContent.querySelector('[data-tab="abc"]').classList.add("active");
        document.getElementById("tab-abc").classList.remove("hidden");
        status.textContent = "Done — check accuracy then hit Save & Re-render";
        status.className = "transcribe-status transcribe-ok";
      } catch (e) {
        status.textContent = `Error: ${e.message}`;
        status.className = "transcribe-status transcribe-err";
      } finally {
        transcribeBtn.disabled = false;
        transcribeBtn.textContent = "✨ Transcribe to ABC";
      }
    });
  }

  // Add to set — opens set picker panel
  document.getElementById("add-to-set-btn")
    .addEventListener("click", () => showSetPickerPanel(tune, onBack, siblings));

  // Create new set from this tune
  document.getElementById("create-set-from-tune-btn")
    .addEventListener("click", () => showCreateSetPanel(tune, onBack, siblings));

  // Build a set starting from this tune
  document.getElementById("build-set-from-tune-btn")
    .addEventListener("click", () => {
      const backToTune = () => {
        renderModal(tune, onBack, siblings);
        requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); });
      };
      _bldrStepMode([tune], { type: tune.type || "", minRating: "", collectionId: "", collectionName: "" }, backToTune);
    });

  // Collection select: auto-add on pick, or show create form for __new__
  const colSelect   = document.getElementById("col-select");
  const newColForm  = document.getElementById("new-col-form");
  const newColName  = document.getElementById("new-col-name");
  const newColConfirm = document.getElementById("new-col-confirm");
  const newColCancel  = document.getElementById("new-col-cancel");
  const newColStatus  = document.getElementById("new-col-status");
  const colStatus     = document.getElementById("col-status");

  colSelect.addEventListener("change", async () => {
    const colId = colSelect.value;
    if (!colId) return;
    if (colId === "__new__") {
      colSelect.value = "";
      newColForm.classList.remove("hidden");
      newColName.focus();
      return;
    }
    try {
      const result = await apiAddTuneToCollection(colId, tune.id);
      colStatus.textContent = result.added ? "Added!" : "Already in collection.";
      colStatus.className = "set-status set-saved";
      setTimeout(() => { colStatus.textContent = ""; colSelect.value = ""; }, 2000);
      await fetchCollections();
    } catch {
      colStatus.textContent = "Failed.";
      colStatus.className = "set-status set-error";
    }
  });

  newColCancel.addEventListener("click", () => {
    newColForm.classList.add("hidden");
    newColName.value = "";
    newColStatus.textContent = "";
  });
  newColName.addEventListener("keydown", e => { if (e.key === "Enter") newColConfirm.click(); });
  newColConfirm.addEventListener("click", async () => {
    const name = newColName.value.trim();
    if (!name) { newColName.focus(); return; }
    newColConfirm.disabled = true;
    try {
      const col = await apiCreateCollection(name, "");
      await apiAddTuneToCollection(col.id, tune.id);
      newColStatus.textContent = `Added to "${escHtml(name)}"!`;
      newColStatus.className = "set-status set-saved";
      newColForm.classList.add("hidden");
      newColName.value = "";
      state.collections = await fetchCollections();
      // Insert new option before the __new__ sentinel
      const newOpt = document.createElement("option");
      newOpt.value = col.id; newOpt.textContent = col.name;
      const sentinel = colSelect.querySelector("option[value='__new__']");
      colSelect.insertBefore(newOpt, sentinel);
      setTimeout(() => { newColStatus.textContent = ""; }, 2500);
    } catch {
      newColStatus.textContent = "Failed.";
      newColStatus.className = "set-status set-error";
    } finally {
      newColConfirm.disabled = false;
    }
  });

  // ── Fetch ABC from TheSession ──────────────────────────────
  const fetchAbcBtn = document.getElementById("fetch-session-abc");
  if (fetchAbcBtn) {
    const abcStatus = document.getElementById("fetch-abc-status");
    const abcResults = document.getElementById("session-abc-results");

    fetchAbcBtn.addEventListener("click", async () => {
      fetchAbcBtn.disabled = true;
      abcStatus.textContent = "Searching…";
      abcResults.classList.add("hidden");
      try {
        const q = encodeURIComponent(tune.title);
        const res = await fetch(`/api/thesession/search?q=${q}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Search failed");
        if (!data.tunes || !data.tunes.length) {
          abcStatus.textContent = "No matches found on TheSession.org.";
          fetchAbcBtn.disabled = false;
          return;
        }
        abcStatus.textContent = `${data.tunes.length} match${data.tunes.length === 1 ? "" : "es"} found — pick one:`;
        abcResults.innerHTML = data.tunes.slice(0, 8).map(t => `
          <div class="session-abc-match">
            <button class="session-abc-pick" data-session-id="${t.id}">
              <strong>${escHtml(t.name)}</strong>
              <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type)}</span>
              <span class="session-abc-meta">${t.tunebooks} setting${t.tunebooks === 1 ? "" : "s"}</span>
            </button>
          </div>`).join("");
        abcResults.classList.remove("hidden");

        // Wire up pick buttons
        abcResults.querySelectorAll(".session-abc-pick").forEach(btn => {
          btn.addEventListener("click", async () => {
            const sessionId = btn.dataset.sessionId;
            abcResults.innerHTML = '<p class="loading" style="padding:.3rem 0">Fetching ABC…</p>';
            try {
              const fRes = await fetch(`/api/thesession/fetch/${sessionId}`);
              const fData = await fRes.json();
              if (!fRes.ok) throw new Error(fData.detail || "Fetch failed");

              const settings = fData.settings || [];
              if (settings.length === 1) {
                // Single setting — apply directly
                await _applySessionAbc(tune.id, settings[0], fData);
              } else {
                // Multiple settings — show picker
                abcResults.innerHTML = `<p class="fetch-abc-hint">Multiple settings found — choose one:</p>` +
                  settings.map(s => `
                    <div class="session-abc-match">
                      <button class="session-setting-pick" data-idx="${s.index}">
                        Setting ${s.index}: <strong>${escHtml(s.key)}${s.mode ? " " + escHtml(s.mode) : ""}</strong>
                        ${s.member ? `<span class="session-abc-meta">by ${escHtml(s.member)}</span>` : ""}
                      </button>
                    </div>`).join("");
                abcResults.querySelectorAll(".session-setting-pick").forEach(sBtn => {
                  sBtn.addEventListener("click", async () => {
                    const idx = Number(sBtn.dataset.idx);
                    const setting = settings.find(s => s.index === idx) || settings[0];
                    abcResults.innerHTML = '<p class="loading" style="padding:.3rem 0">Applying…</p>';
                    await _applySessionAbc(tune.id, setting, fData);
                  });
                });
              }
            } catch (err) {
              abcResults.innerHTML = `<p class="import-error" style="padding:.4rem .6rem">${escHtml(err.message)}</p>`;
            }
          });
        });
      } catch (err) {
        abcStatus.textContent = `Error: ${err.message}`;
        fetchAbcBtn.disabled = false;
      }
    });

    async function _applySessionAbc(tuneId, setting, sessionData) {
      try {
        await fetch(`/api/tunes/${tuneId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            abc: setting.abc,
            key: setting.key || undefined,
            mode: setting.mode || undefined,
          }),
        });
        // Update local tune object and re-render sheet music
        tune.abc = setting.abc;
        tune.key = setting.key || tune.key;
        tune.mode = setting.mode || tune.mode;
        tune.session_id = sessionData.session_id;

        // Hide the fetch section, show the rendered ABC
        const fetchSection = document.getElementById("fetch-abc-section");
        if (fetchSection) fetchSection.remove();
        renderSheetMusic(setting.abc);

        // Refresh card in background
        if (state.view === "library") loadTunes();
      } catch (err) {
        abcResults.innerHTML = `<p class="import-error" style="padding:.4rem .6rem">Failed to save: ${escHtml(err.message)}</p>`;
      }
    }
  }

  // Toggle "Find on TheSession" when tune already has ABC
  const fetchAbcToggle = document.getElementById("fetch-abc-toggle");
  if (fetchAbcToggle) {
    fetchAbcToggle.addEventListener("click", () => {
      const realBtn = document.getElementById("fetch-session-abc");
      if (realBtn) {
        realBtn.classList.toggle("hidden");
        fetchAbcToggle.textContent = realBtn.classList.contains("hidden")
          ? "🔍 Find on TheSession.org…"
          : "▲ Hide search";
      }
    });
  }

  // Strip chords button (when tune has ABC)
  const stripChordsBtn = document.getElementById("strip-chords-btn");
  if (stripChordsBtn) {
    stripChordsBtn.addEventListener("click", async () => {
      stripChordsBtn.disabled = true;
      stripChordsBtn.textContent = "Stripping…";
      try {
        const res = await apiFetch(`/api/tunes/${tune.id}/strip-chords`, { method: "POST" });
        tune.abc = res.abc;
        document.getElementById("abc-edit-textarea") && (document.getElementById("abc-edit-textarea").value = res.abc);
        renderSheetMusic(res.abc);
        stripChordsBtn.textContent = `✓ Stripped ${res.removed} chord${res.removed === 1 ? "" : "s"}`;
        setTimeout(() => { stripChordsBtn.textContent = "✂ Strip chords"; stripChordsBtn.disabled = false; }, 3000);
      } catch (err) {
        stripChordsBtn.textContent = "✂ Strip chords";
        stripChordsBtn.disabled = false;
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
  document.getElementById("delete-tune-modal-btn").addEventListener("click", async () => {
    const isVersion = !!tune.parent_id;
    if (isVersion) {
      // Version delete — simple confirm, no membership transfer needed
      const msg = `Delete this version ("${tune.version_label || tune.title}") from your library? The other versions will not be affected. This cannot be undone.`;
      if (!confirm(msg)) return;
      try {
        await apiDeleteTune(tune.id);
        await Promise.all([loadTunes(), loadStats()]);
        if (onBack) onBack();
        else renderVersionsPanel(tune.parent_id);
      } catch {
        alert("Failed to delete. Please try again.");
      }
      return;
    }
    // Standalone tune — offer to save memberships for a replacement
    await _confirmDeleteWithTransfer(tune.id, tune.title, async () => {
      try {
        await apiDeleteTune(tune.id);
        await Promise.all([loadTunes(), loadStats()]);
        closeModal();
      } catch {
        alert("Failed to delete. Please try again.");
      }
    });
  });

  // Render sheet music after paint (skip if no ABC — PDF or empty)
  requestAnimationFrame(() => {
    if (tune.abc) {
      renderSheetMusic(tune.abc);
    }
  });

  // Full-screen button
  const abcFsBtn = document.getElementById("abc-fs-btn");
  if (abcFsBtn) {
    abcFsBtn.addEventListener("click", () => openAbcFullscreen(tune.abc, tune.title));
  }
}

// ── Inline type/key editing in modal ─────────────────────────────────────────
const TUNE_TYPES = [
  // Most common
  "reel","jig","hornpipe","slip jig","polka","waltz","march","strathspey",
  // Compound / regional
  "slide","hop jig","air","slow air",
  // Less common
  "mazurka","barndance","schottische","highland","set dance",
];
const KEY_SUGGESTIONS = [
  // D group — very common
  "D major","D mixolydian","D dorian","D minor",
  // G group
  "G major","G mixolydian","G dorian",
  // A group
  "A major","A mixolydian","A dorian","A minor",
  // E group
  "E minor","E dorian",
  // B group
  "B minor","B dorian",
  // C group
  "C major",
  // F group
  "F major","F# minor",
  // Flat keys
  "Bb major","Eb major",
];

function updateCardMeta(tuneId, field, value) {
  const card = tuneList.querySelector(`.tune-card[data-id="${tuneId}"]`);
  if (!card) return;
  const meta = card.querySelector(".card-meta");
  if (!meta) return;
  const existing = meta.querySelector(`[data-badge="${field}"]`);
  if (!value) { if (existing) existing.remove(); return; }
  const cls = field === "type" ? typeBadgeClass(value) : keyBadgeClass(value);
  const span = document.createElement("span");
  span.className = `badge ${cls}`;
  span.dataset.badge = field;
  span.textContent = value;
  if (existing) {
    meta.replaceChild(span, existing);
  } else {
    const vBadge = meta.querySelector(".badge-versions");
    if (field === "type") meta.prepend(span);
    else if (vBadge) meta.insertBefore(span, vBadge);
    else meta.appendChild(span);
  }
}

function initTitleEdit(tune) {
  const btn = document.getElementById("title-edit-btn");
  const titleText = document.getElementById("modal-title-text");
  if (!btn || !titleText) return;

  btn.addEventListener("click", () => {
    const currentTitle = titleText.textContent.trim();
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentTitle;
    input.className = "title-inline-edit";
    titleText.replaceWith(input);
    btn.style.display = "none";
    input.focus();
    input.select();

    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      const newTitle = input.value.trim();
      if (!newTitle || newTitle === currentTitle) {
        input.replaceWith(titleText);
        btn.style.display = "";
        return;
      }
      try {
        await apiFetch(`/api/tunes/${tune.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
        tune.title = newTitle;
        titleText.textContent = newTitle;
        input.replaceWith(titleText);
        btn.style.display = "";
        const card = tuneList.querySelector(`.tune-card[data-id="${tune.id}"]`);
        if (card) {
          const cardTitle = card.querySelector(".card-title");
          if (cardTitle) cardTitle.textContent = newTitle;
          card.setAttribute("aria-label", newTitle);
        }
      } catch {
        input.replaceWith(titleText);
        btn.style.display = "";
      }
    };

    input.addEventListener("blur", save);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.preventDefault(); input.blur(); }
      if (e.key === "Escape") { saved = true; input.replaceWith(titleText); btn.style.display = ""; }
    });
  });
}

function initMetaEdit(tune) {
  const metaRow = document.getElementById("modal-typkey-meta");
  if (!metaRow) return;

  function badgeHtml(field, value) {
    if (!value) return `<button class="badge-add-field" data-field="${field}">+ ${field}</button>`;
    const cls = field === "type" ? typeBadgeClass(value) : keyBadgeClass(value);
    return `<span class="badge ${cls} badge-editable" data-field="${field}">${escHtml(value)}</span>`;
  }

  function rebuild(newType, newKey) {
    if (newType !== undefined) tune.type = newType;
    if (newKey  !== undefined) tune.key  = newKey;
    metaRow.innerHTML = badgeHtml("type", tune.type) + badgeHtml("key", tune.key);
    attach();
  }

  function startEdit(el, field) {
    const currentVal = el.tagName === "SPAN" ? el.textContent.trim() : "";
    let editor;
    if (field === "type") {
      editor = document.createElement("select");
      editor.className = "badge-inline-edit";
      const blank = new Option("— choose type —", "");
      if (!currentVal) blank.selected = true;
      editor.add(blank);
      TUNE_TYPES.forEach(t => {
        const opt = new Option(t, t);
        if (t === currentVal) opt.selected = true;
        editor.add(opt);
      });
    } else {
      editor = document.createElement("input");
      editor.type = "text";
      editor.value = currentVal;
      editor.placeholder = "e.g. D major";
      editor.className = "badge-inline-edit";
      editor.style.width = "9rem";
      const dl = document.createElement("datalist");
      dl.id = "_key-dl";
      KEY_SUGGESTIONS.forEach(k => dl.add(new Option(k)));
      editor.setAttribute("list", "_key-dl");
      el.insertAdjacentElement("beforebegin", dl);
    }
    el.replaceWith(editor);
    editor.focus();

    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      const val = editor.value.trim();
      if (!val) { rebuild(); return; }           // cancelled — restore
      if (val === currentVal) { rebuild(); return; }
      const patch = { [field]: val };
      if (field === "key") {
        const mode = val.split(/\s+/).slice(1).join(" ").toLowerCase();
        if (mode) patch.mode = mode;
      }
      try {
        await apiFetch(`/api/tunes/${tune.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (field === "type") rebuild(val, undefined);
        else                  rebuild(undefined, val);
        updateCardMeta(tune.id, field, val);
      } catch { rebuild(); }
    };

    editor.addEventListener("blur", save);
    editor.addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.preventDefault(); editor.blur(); }
      if (e.key === "Escape") { saved = true; rebuild(); }
    });
  }

  function attach() {
    metaRow.querySelectorAll("[data-field]").forEach(el => {
      el.addEventListener("click", () => startEdit(el, el.dataset.field));
    });
  }

  attach();
}

// ── Bar-range selection (practice loop) ──────────────────────────────────────
let _visualObj = null;
let _synthController = null;
let _msPerMeasure = null;
let _barSel = { start: null, end: null };
let _loopSeeking = false;   // guard against rapid re-fires of the loop seek

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
// Maps visual bar index → first MIDI millisecond for that bar.
// Built from _synthController.timer.noteTimings on first Play; accounts for
// AABB-style repeats where MIDI length > visual bar count × msPerMeasure.
let _barFirstMs = {};

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
    // Only count measures that contain actual notes/rests — this excludes
    // barline elements (including : repeat signs) and phantom wrappers
    // created by %%text annotations or inline key/metre changes.
    for (const el of wrapper.querySelectorAll(".abcjs-note, .abcjs-rest")) {
      let target = el;
      while (target && target !== wrapper) {
        for (const cls of target.classList) {
          const m = cls.match(/^abcjs-m(\d+)$/);
          if (m) { seenMeasures.add(parseInt(m[1], 10)); break; }
        }
        target = target.parentElement;
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

  // Walk up to find abcjs-mN, ignoring barline elements (: repeat signs etc.)
  let measure = null;
  let el = e.target;
  while (el && el !== container) {
    // Barline elements (abcjs-bar, abcjs-bar-repeat, abcjs-bar-dbl …) are not
    // selectable bars — clicking them should be silently ignored.
    if (/\babcjs-bar/.test(el.getAttribute("class") || "")) return;
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
    // First click: set start, wait for end click (end=null means pending)
    _barSel = { start: m, end: null };
  } else if (end === null) {
    // Second click: confirm selection — same bar is valid (single-bar loop)
    _barSel = { start: Math.min(start, m), end: Math.max(start, m) };
  } else {
    // Range already confirmed → start fresh
    _barSel = { start: m, end: null };
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

  const isPending = _barSel.end === null;
  const cls = isPending ? "bar-sel-start" : "bar-selected";
  const lo = _barSel.start;
  const hi = isPending ? _barSel.start : _barSel.end;
  for (let i = lo; i <= hi; i++) {
    if (i >= _barMap.length) break;
    const { wrapper, measure } = _barMap[i];
    wrapper.querySelectorAll(`.abcjs-m${measure}`)
      .forEach(el => el.classList.add(cls));
  }
}

function _updateSelectionInfo() {
  const el = document.getElementById("bar-selection-info");
  if (!el) return;
  if (_barSel.start === null) { el.classList.add("hidden"); return; }

  const isPending = _barSel.end === null;
  const lo = _barSel.start + 1;
  const hi = (isPending ? _barSel.start : _barSel.end) + 1;

  el.classList.remove("hidden");
  if (isPending) {
    el.innerHTML = `<span>Bar ${lo} selected — click another bar to extend, or click again to loop just this bar</span>`
      + `<button class="btn-secondary bar-sel-clear">Clear</button>`;
  } else {
    const label = lo === hi ? `Bar ${lo}` : `Bars ${lo}–${hi}`;
    el.innerHTML = `<span>${label} selected — press Play, then enable the Loop button to repeat</span>`
      + `<button class="btn-secondary bar-sel-clear">Clear</button>`;
  }
  el.querySelector(".bar-sel-clear").addEventListener("click", _clearBarSel);
}

// Build the bar → MIDI-time map from ABCJS's pre-computed noteTimings.
// TimingCallbacks stores all events (including repeats) in .noteTimings before
// playback starts; iterating it gives the FIRST MIDI millisecond for each
// visual bar without having to play through the audio.
//
// Critical: abcjs-mN is per-staff-wrapper (each visual line resets to m0),
// so we use the same (wrapper, measure) key as _barMap to resolve the correct
// global bar index.  Without this, Part B bars are misidentified as Part A.
function _buildBarTimingMap() {
  _barFirstMs = {};
  if (!_synthController || !_synthController.timer) return;
  const events = _synthController.timer.noteTimings;
  if (!events || !events.length) return;

  // Ensure the bar map is built before we need it.
  if (_barMap.length === 0) _barMap = _buildBarMap();
  if (!_barMap.length) return;

  // Build (wrapper element, measure index) → global bar index lookup.
  const wrapperMeasureToIdx = new Map();
  _barMap.forEach(({ wrapper, measure }, globalIdx) => {
    let inner = wrapperMeasureToIdx.get(wrapper);
    if (!inner) { inner = new Map(); wrapperMeasureToIdx.set(wrapper, inner); }
    inner.set(measure, globalIdx);
  });

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev || !ev.elements) continue;
    ev.elements.forEach(grp => {
      if (!grp) return;
      grp.forEach(el => {
        if (!el || !el.classList) return;
        // Walk up ancestors to find abcjs-mN (ABCJS may put it on a parent group,
        // not directly on the highlighted element).
        const wrapper = el.closest && el.closest('.abcjs-staff-wrapper');
        if (!wrapper) return;
        let measure = null;
        let target = el;
        while (target && target !== wrapper) {
          for (const cls of target.classList) {
            const hit = cls.match(/^abcjs-m(\d+)$/);
            if (hit) { measure = parseInt(hit[1], 10); break; }
          }
          if (measure !== null) break;
          target = target.parentElement;
        }
        if (measure === null) return;
        const inner = wrapperMeasureToIdx.get(wrapper);
        if (!inner) return;
        const globalIdx = inner.get(measure);
        if (globalIdx === undefined) return;
        if (!Object.prototype.hasOwnProperty.call(_barFirstMs, globalIdx)) {
          _barFirstMs[globalIdx] = ev.milliseconds;
        }
      });
    });
  }
}

// Return the MIDI start time (ms) for visual bar barIndex, using the
// pre-built timing map when available, or a linear estimate as fallback.
function _barMs(barIndex) {
  if (Object.prototype.hasOwnProperty.call(_barFirstMs, barIndex)) {
    return _barFirstMs[barIndex];
  }
  return barIndex * (_msPerMeasure || 0);
}

function _seekToBar(barIndex) {
  if (!_synthController) return;
  const buf = _synthController.midiBuffer;
  if (!buf || !buf.duration) return;
  const frac = Math.max(0, Math.min(1, _barMs(barIndex) / (buf.duration * 1000)));
  _synthController.seek(frac);
}

function _clearBarSel() {
  _barSel = { start: null, end: null };
  _barSeekPending = false;
  _loopSeeking = false;
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
  // Stop any currently playing audio before re-rendering
  if (_synthController) { try { _synthController.pause(); } catch {} }
  _synthController = null;
  _msPerMeasure = null;
  _loopSeeking = false;
  _barFirstMs = {};
  const infoEl = document.getElementById("bar-selection-info");
  if (infoEl) infoEl.classList.add("hidden");

  // Attach bar-selection click listener in capture phase so it fires even if
  // ABCJS stops propagation on its own SVG click handlers.
  container.addEventListener("click", _sheetMusicClickHandler, true);

  try {
    const _processedAbc = expandAbcRepeats(abc);
    // Use explicit staffwidth — responsive:"resize" produces 0 lines in abcjs 6.4.4
    // when called from inside a modal (ResizeObserver quirk).
    // NOTE: abcjs ignores staffwidth when `wrap` is also set, so do NOT pass wrap here.
    // Fallback to 600 so narrow/unmeasured containers still render full staves.
    const visualObjs = ABCJS.renderAbc("sheet-music-render", _processedAbc, {
      responsive: "resize",
      wrap: { preferredMeasuresPerLine: 4 },
      add_classes: true,
      paddingbottom: 10,
      paddingleft: 15,
      paddingright: 15,
      paddingtop: 10,
      selectTypes: false,
      foregroundColor: "#000000",
    });
    _patchSvgViewBox("sheet-music-render");

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
      // _barSeekPending is set when the user clicks a bar selection.
      // We consume it on the FIRST onEvent (midiBuffer is fully started and
      // midiBuffer.duration is available for an accurate seek fraction).
      // Using onEvent rather than onStart avoids the ambiguous timing window
      // around when midiBuffer.start() is called.
      onStart() {
        // Build the accurate bar→MIDI-time map from ABCJS's pre-computed
        // noteTimings.  Called synchronously before the first onEvent so the
        // map is ready when the pending seek fires.
        _buildBarTimingMap();
      },
      onEvent(ev) {
        // One-shot seek: consume pending seek on first event after selection.
        // Queue via setTimeout so it fires OUTSIDE this ABCJS timer callback.
        if (_barSeekPending && _barSel.start !== null) {
          _barSeekPending = false;
          const barIdx = _barSel.start;
          setTimeout(() => { if (_synthController) _seekToBar(barIdx); }, 0);
          return;
        }

        document.querySelectorAll("#sheet-music-render .abcjs-highlight")
          .forEach(el => el.classList.remove("abcjs-highlight"));
        if (ev && ev.elements) {
          ev.elements.forEach(grp => {
            if (grp) grp.forEach(el => el.classList.add("abcjs-highlight"));
          });
        }
        // Bar-range loop: jump back once playback passes the end of the selection.
        // Requires a confirmed selection (end !== null); single-bar loops work too.
        // endTimeMs uses the accurate MIDI map so it works in Part B of AABB tunes.
        if (!_loopSeeking
            && _barSel.start !== null && _barSel.end !== null
            && ev && _synthController.isLooping) {
          // End time = start of the bar AFTER the selection (or last bar + 1 measure)
          const endTimeMs = Object.prototype.hasOwnProperty.call(_barFirstMs, _barSel.end + 1)
            ? _barFirstMs[_barSel.end + 1]
            : _barMs(_barSel.end) + (_msPerMeasure || 0);
          if (ev.milliseconds >= endTimeMs) {
            _loopSeeking = true;
            _seekToBar(_barSel.start);
            setTimeout(() => { _loopSeeking = false; }, 300);
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

    _synthController.setTune(_visualObj, false, { program: 73 }).catch(err => {
      console.warn("Audio init failed:", err);
    });
  } catch (err) {
    console.warn("Sheet music render failed:", err);
    if (container) container.textContent = "(Could not render sheet music)";
  }
}

// ── ABC full-screen overlay ───────────────────────────────────────────────────
const _abcFsOverlay = document.getElementById("abc-fullscreen-overlay");
const _abcFsTitleEl = document.getElementById("abc-fullscreen-title");
const _abcFsCloseBtn = document.getElementById("abc-fullscreen-close");
let _abcFsSynthCtrl = null;
let _abcFsVisualObj = null;

// Fullscreen-specific bar-selection state (mirrors the main-modal state)
let _fsBarSel       = { start: null, end: null };
let _fsBarMap       = [];
let _fsBarFirstMs   = {};
let _fsMsPerMeasure = null;
let _fsLoopSeeking  = false;
let _fsBarSeekPending = false;
let _fsLastHighlighted = []; // per-tune colour highlights (set fullscreen mode)

function _fsBuildBarMap() {
  const render = document.getElementById("abc-fullscreen-render");
  if (!render) return [];
  const result = [];
  for (const wrapper of render.querySelectorAll(".abcjs-staff-wrapper")) {
    const seen = new Set();
    // Only count measures with actual notes/rests — excludes barline elements
    // (: repeat signs, bar-dbl, etc.) and phantom wrappers from %%text
    // annotations or inline [K:] changes between tunes in a set.
    for (const el of wrapper.querySelectorAll(".abcjs-note, .abcjs-rest")) {
      let target = el;
      while (target && target !== wrapper) {
        for (const cls of target.classList) {
          const m = cls.match(/^abcjs-m(\d+)$/);
          if (m) { seen.add(parseInt(m[1], 10)); break; }
        }
        target = target.parentElement;
      }
    }
    for (const measure of [...seen].sort((a, b) => a - b)) {
      result.push({ wrapper, measure });
    }
  }
  return result;
}

function _fsBuildTimingMap() {
  _fsBarFirstMs = {};
  if (!_abcFsSynthCtrl || !_abcFsSynthCtrl.timer) return;
  const events = _abcFsSynthCtrl.timer.noteTimings;
  if (!events || !events.length) return;
  if (_fsBarMap.length === 0) _fsBarMap = _fsBuildBarMap();
  if (!_fsBarMap.length) return;

  const wmToIdx = new Map();
  _fsBarMap.forEach(({ wrapper, measure }, gi) => {
    let inner = wmToIdx.get(wrapper);
    if (!inner) { inner = new Map(); wmToIdx.set(wrapper, inner); }
    inner.set(measure, gi);
  });
  for (const ev of events) {
    if (!ev || !ev.elements) continue;
    ev.elements.forEach(grp => {
      if (!grp) return;
      grp.forEach(el => {
        if (!el || !el.classList) return;
        // Walk up ancestors to find abcjs-mN (ABCJS may put it on a parent group,
        // not directly on the highlighted element).
        const wrapper = el.closest && el.closest(".abcjs-staff-wrapper");
        if (!wrapper) return;
        let measure = null;
        let target = el;
        while (target && target !== wrapper) {
          for (const cls of target.classList) {
            const hit = cls.match(/^abcjs-m(\d+)$/);
            if (hit) { measure = parseInt(hit[1], 10); break; }
          }
          if (measure !== null) break;
          target = target.parentElement;
        }
        if (measure === null) return;
        const inner = wmToIdx.get(wrapper);
        if (!inner) return;
        const gi = inner.get(measure);
        if (gi === undefined) return;
        if (!Object.prototype.hasOwnProperty.call(_fsBarFirstMs, gi)) {
          _fsBarFirstMs[gi] = ev.milliseconds;
        }
      });
    });
  }
}

function _fsBarMs(idx) {
  return Object.prototype.hasOwnProperty.call(_fsBarFirstMs, idx)
    ? _fsBarFirstMs[idx]
    : idx * (_fsMsPerMeasure || 0);
}

function _fsSeekToBar(idx) {
  if (!_abcFsSynthCtrl) return;
  const buf = _abcFsSynthCtrl.midiBuffer;
  if (!buf || !buf.duration) return;
  const frac = Math.max(0, Math.min(1, _fsBarMs(idx) / (buf.duration * 1000)));
  _abcFsSynthCtrl.seek(frac);
}

function _updateFsBarHighlight() {
  const render = document.getElementById("abc-fullscreen-render");
  if (!render) return;
  render.querySelectorAll(".bar-selected, .bar-sel-start")
    .forEach(el => el.classList.remove("bar-selected", "bar-sel-start"));
  if (_fsBarSel.start === null) return;

  const pending = _fsBarSel.end === null;
  const cls = pending ? "bar-sel-start" : "bar-selected";
  const lo = _fsBarSel.start;
  const hi = pending ? lo : _fsBarSel.end;
  for (let i = lo; i <= hi; i++) {
    if (i >= _fsBarMap.length) break;
    const { wrapper, measure } = _fsBarMap[i];
    wrapper.querySelectorAll(`.abcjs-m${measure}`).forEach(el => el.classList.add(cls));
  }
}

function _updateFsSelectionInfo() {
  const el = document.getElementById("abc-fs-bar-info");
  if (!el) return;
  if (_fsBarSel.start === null) { el.classList.add("hidden"); return; }
  const pending = _fsBarSel.end === null;
  const lo = _fsBarSel.start + 1;
  const hi = (pending ? _fsBarSel.start : _fsBarSel.end) + 1;
  el.classList.remove("hidden");
  const label = lo === hi ? `Bar ${lo}` : `Bars ${lo}–${hi}`;
  el.innerHTML = pending
    ? `<span>Bar ${lo} — tap another to extend, or tap again to loop this bar</span><button class="btn-secondary bar-sel-clear">✕</button>`
    : `<span>${label} — press Play, enable Loop to repeat</span><button class="btn-secondary bar-sel-clear">✕</button>`;
  el.querySelector(".bar-sel-clear").addEventListener("click", _clearFsBarSel);
}

function _clearFsBarSel() {
  _fsBarSel = { start: null, end: null };
  _fsBarSeekPending = false;
  _fsLoopSeeking = false;
  _updateFsBarHighlight();
  _updateFsSelectionInfo();
}

function _fsMeasureClickHandler(e) {
  const container = document.getElementById("abc-fullscreen-render");
  let measure = null;
  let el = e.target;
  while (el && el !== container) {
    // Ignore clicks on barline elements (: repeat signs, bar-dbl, etc.)
    if (/\babcjs-bar/.test(el.getAttribute("class") || "")) return;
    for (const cls of (el.classList || [])) {
      const m = cls.match(/^abcjs-m(\d+)$/);
      if (m) { measure = parseInt(m[1], 10); break; }
    }
    if (measure !== null) break;
    el = el.parentElement;
  }
  if (measure === null) return;

  let wrapperEl = null;
  let anc = el.parentElement;
  while (anc && anc !== container) {
    if (anc.classList && anc.classList.contains("abcjs-staff-wrapper")) { wrapperEl = anc; break; }
    anc = anc.parentElement;
  }
  if (!wrapperEl) return;

  if (_fsBarMap.length === 0) _fsBarMap = _fsBuildBarMap();
  const idx = _fsBarMap.findIndex(b => b.wrapper === wrapperEl && b.measure === measure);
  if (idx === -1) return;

  const { start, end } = _fsBarSel;
  if (start === null) {
    _fsBarSel = { start: idx, end: null };
  } else if (end === null) {
    _fsBarSel = { start: Math.min(start, idx), end: Math.max(start, idx) };
  } else {
    _fsBarSel = { start: idx, end: null };
  }
  _fsBarSeekPending = true;
  _updateFsBarHighlight();
  _updateFsSelectionInfo();
  if (_fsBarSel.start !== null) _fsSeekToBar(_fsBarSel.start);
}

function openAbcFullscreen(abc, title, opts = {}) {
  const { tuneRanges = null, tuneColors = null } = opts;
  _abcFsTitleEl.textContent = title || "";
  _abcFsOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // Reset fullscreen bar-selection state
  _fsBarSel = { start: null, end: null };
  _fsBarMap = [];
  _fsBarFirstMs = {};
  _fsMsPerMeasure = null;
  _fsLoopSeeking = false;
  _fsBarSeekPending = false;
  _fsLastHighlighted.forEach(el => { el.style.fill = ''; });
  _fsLastHighlighted = [];
  const fsBarInfo = document.getElementById("abc-fs-bar-info");
  if (fsBarInfo) fsBarInfo.classList.add("hidden");

  // Request landscape on mobile (Screen Orientation API)
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  } catch {}

  requestAnimationFrame(() => {
    if (typeof ABCJS === "undefined") return;

    // Determine optimal measures per line based on screen width
    const w = window.innerWidth;
    const measuresPerLine = w > 1200 ? 6 : w > 800 ? 5 : w > 500 ? 4 : 3;
    const staffWidth = Math.max(300, w - 20);

    const visualObjs = ABCJS.renderAbc("abc-fullscreen-render", expandAbcRepeats(abc), {
      responsive: "resize",
      wrap: { preferredMeasuresPerLine: measuresPerLine },
      add_classes: true,
      paddingbottom: 10,
      paddingleft: 10,
      paddingright: 10,
      paddingtop: 10,
      staffwidth: staffWidth,
      selectTypes: false,
      foregroundColor: "#000000",
    });

    _abcFsVisualObj = visualObjs && visualObjs[0] ? visualObjs[0] : null;
    _fsMsPerMeasure = _abcFsVisualObj && typeof _abcFsVisualObj.millisecondsPerMeasure === "function"
      ? _abcFsVisualObj.millisecondsPerMeasure()
      : null;

    // Wire bar-selection click handler
    const renderEl = document.getElementById("abc-fullscreen-render");
    if (renderEl) {
      renderEl.removeEventListener("click", _fsMeasureClickHandler, true);
      renderEl.addEventListener("click", _fsMeasureClickHandler, true);
    }

    // Set up synth playback with full cursor + loop logic
    const audioContainer = document.getElementById("abc-fs-audio");
    if (audioContainer && _abcFsVisualObj) {
      audioContainer.innerHTML = "";

      const cursorControl = {
        onStart() {
          _fsBuildTimingMap();
        },
        onEvent(ev) {
          // One-shot seek when bar selection is pending
          if (_fsBarSeekPending && _fsBarSel.start !== null) {
            _fsBarSeekPending = false;
            const barIdx = _fsBarSel.start;
            setTimeout(() => { if (_abcFsSynthCtrl) _fsSeekToBar(barIdx); }, 0);
            return;
          }

          // Highlight current note
          if (tuneRanges && tuneColors) {
            // Per-tune colour mode (set fullscreen): use inline fill, not class
            _fsLastHighlighted.forEach(el => { el.style.fill = ''; });
            _fsLastHighlighted = [];
            if (ev?.elements) {
              const sc = ev.startChar ?? -1;
              let tuneIdx = tuneRanges.length - 1;
              for (let i = 0; i < tuneRanges.length; i++) {
                if (sc >= tuneRanges[i].start && sc <= tuneRanges[i].end) { tuneIdx = i; break; }
              }
              const color = tuneColors[tuneIdx % tuneColors.length];
              ev.elements.forEach(grp => {
                if (!grp) return;
                grp.forEach(el => { el.style.fill = color; _fsLastHighlighted.push(el); });
              });
            }
          } else {
            document.querySelectorAll("#abc-fullscreen-render .abcjs-highlight")
              .forEach(el => el.classList.remove("abcjs-highlight"));
            if (ev && ev.elements) {
              ev.elements.forEach(grp => {
                if (grp) grp.forEach(el => { if (el.classList) el.classList.add("abcjs-highlight"); });
              });
            }
          }

          // Bar-range loop: jump back when playback passes the end of the selection
          if (!_fsLoopSeeking
              && _fsBarSel.start !== null && _fsBarSel.end !== null
              && ev && _abcFsSynthCtrl && _abcFsSynthCtrl.isLooping) {
            const endMs = Object.prototype.hasOwnProperty.call(_fsBarFirstMs, _fsBarSel.end + 1)
              ? _fsBarFirstMs[_fsBarSel.end + 1]
              : _fsBarMs(_fsBarSel.end) + (_fsMsPerMeasure || 0);
            if (ev.milliseconds >= endMs) {
              _fsLoopSeeking = true;
              _fsSeekToBar(_fsBarSel.start);
              setTimeout(() => { _fsLoopSeeking = false; }, 300);
            }
          }
        },
        onFinished() {
          if (tuneRanges && tuneColors) {
            _fsLastHighlighted.forEach(el => { el.style.fill = ''; });
            _fsLastHighlighted = [];
          } else {
            document.querySelectorAll("#abc-fullscreen-render .abcjs-highlight")
              .forEach(el => el.classList.remove("abcjs-highlight"));
          }
        },
      };

      _abcFsSynthCtrl = new ABCJS.synth.SynthController();
      _abcFsSynthCtrl.load("#abc-fs-audio", cursorControl, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true,
      });
      _abcFsSynthCtrl.setTune(_abcFsVisualObj, false, { program: 73 }).catch(err => {
        console.warn("Fullscreen audio init failed:", err);
      });
    }
  });
}

function closeAbcFullscreen() {
  if (_abcFsSynthCtrl) {
    try { _abcFsSynthCtrl.pause(); } catch {}
    _abcFsSynthCtrl = null;
  }
  _abcFsVisualObj = null;
  _fsLastHighlighted.forEach(el => { el.style.fill = ''; });
  _fsLastHighlighted = [];
  // Remove click handler to avoid stacking listeners on re-open
  const renderEl = document.getElementById("abc-fullscreen-render");
  if (renderEl) renderEl.removeEventListener("click", _fsMeasureClickHandler, true);

  _abcFsOverlay.classList.add("hidden");
  document.body.style.overflow = "";

  // Release orientation lock
  try {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  } catch {}
}

_abcFsCloseBtn.addEventListener("click", closeAbcFullscreen);
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !_abcFsOverlay.classList.contains("hidden")) {
    closeAbcFullscreen();
  }
});

// Prepare ABC for rendering.
// TheSession tunes use bare ! as linebreak markers; convert to \n.
// Standard ABC also uses !decoration! pairs (e.g. !roll!, !trill!, !cut!).
// We must preserve those and only replace standalone bare ! markers.
function expandAbcRepeats(abc) {
  // abcjs requires X: as the first field to recognise a valid tune.
  // Auto-inject it if missing so tunes without X: still render.
  if (!/^X:/m.test(abc)) abc = "X:1\n" + abc;

  const kIdx = abc.search(/^K:/m);
  if (kIdx < 0) return abc;
  const kEnd = abc.indexOf('\n', kIdx);
  if (kEnd < 0) return abc;
  // abcjs silently produces 0 rendered lines when ANY %%MIDI directive appears
  // anywhere in the ABC, or when I:linebreak overrides prevent normal wrapping.
  // Strip all such directives so abcjs sees clean ABC.
  const stripMidi = s => s
    .replace(/^%%MIDI\s+.*$/gim, '')
    .replace(/^%abcjs_soundfont\s+\S+\s*$/gim, '')
    // I:linebreak overrides (e.g. "I:linebreak $") tell abcjs to only break
    // staves at that character. If the body has none of them, abcjs renders
    // everything on one infinite line and produces 0 staff lines. Strip the
    // directive so abcjs falls back to its default newline-based line breaking.
    .replace(/^I:linebreak\s+.*$/gim, '')
    // Stripping directives leaves blank lines behind; a blank line in ABC
    // separates tunes, so abcjs would see the notes as a headerless second
    // tune and render nothing. Collapse multiple newlines to one.
    .replace(/\n{2,}/g, '\n');
  const header = stripMidi(abc.slice(0, kEnd + 1));
  // trim() before stripMidi removes surrounding whitespace; trimStart() after
  // removes any leading newline left by stripped directives — if left in place
  // it combines with the header's trailing \n to form a blank line (\n\n),
  // which ABC treats as a tune separator causing abcjs to render nothing.
  let body = stripMidi(abc.slice(kEnd + 1).trim()).trimStart();

  if (body.includes('!')) {
    // Protect !decoration! pairs with a placeholder, replace bare !, then restore.
    body = body
      .replace(/![a-zA-Z][a-zA-Z0-9_-]*!/g, m => `\x00${m.slice(1, -1)}\x00`)
      .replace(/\s*!\s*/g, '\n')
      .replace(/\x00([^\x00]*)\x00/g, '!$1!');
  }

  // header already ends with '\n' (includes the K: line + its newline).
  // Do NOT add an extra '\n' — a blank line in ABC separates tunes, which
  // causes abcjs to treat the note body as a second tune with no header
  // and render 0 staff lines for the first tune.
  return header + body;
}

// After abcjs renders, add viewBox to the SVG so CSS max-width scales
// the content proportionally instead of clipping it.
function _patchSvgViewBox(containerId) {
  document.querySelectorAll(`#${containerId} svg`).forEach(svg => {
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    if (w && h) {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('width', '100%');
      svg.removeAttribute('height');
    }
  });
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

  try {
    const visualObjs = ABCJS.renderAbc("preview-sheet-render", expandAbcRepeats(abc), {
      responsive: "resize",
      wrap: { preferredMeasuresPerLine: 4 },
      add_classes: true,
      paddingbottom: 10,
      paddingleft: 15,
      paddingright: 15,
      paddingtop: 10,
      selectTypes: false,
      foregroundColor: "#000000",
    });
    _patchSvgViewBox("preview-sheet-render");
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
    _previewSynthCtrl.setTune(_previewVisualObj, false, { program: 73 }).catch(err => {
      console.warn("Preview audio init failed:", err);
    });
  } catch (err) {
    console.warn("Preview render failed:", err);
    if (container) container.textContent = "(Could not render sheet music)";
  }
}

// ── TheSession settings state ─────────────────────────────────────────────────
let _previewSettings    = [];       // all settings returned from API
let _activeSettingId    = null;     // setting currently previewed
let _checkedSettingIds  = new Set();// settings checked for import

function _updatePreviewSubmitter(sid) {
  const el = document.getElementById("session-preview-submitter");
  if (!el) return;
  const setting = _previewSettings.find(s => s.id === sid);
  if (!setting) { el.textContent = ""; return; }
  const parts = [setting.member, setting.date ? setting.date.slice(0, 10) : null].filter(Boolean);
  el.textContent = parts.length ? `Submitted by ${parts.join(", ")}` : "";
}

function _renderSettingsStrip(settings, activeId) {
  return `
    <div class="settings-strip-header">${settings.length} settings available on TheSession.org</div>
    <div class="settings-list">
      ${settings.map((s, i) => {
        const parts = [s.member, s.date ? s.date.slice(0, 10) : null].filter(Boolean);
        const byLine = parts.length ? `<span class="setting-submitter">${escHtml(parts.join(", "))}</span>` : "";
        return `
        <div class="setting-row${s.id === activeId ? " active" : ""}" data-setting-id="${s.id}">
          <input type="checkbox" class="setting-check" data-setting-id="${s.id}"
                 ${s.id === activeId ? "checked" : ""}>
          <span class="setting-label">Setting ${i + 1}</span>
          <span class="badge badge-key">${escHtml(s.key)}</span>
          <span class="setting-votes">${s.votes} vote${s.votes !== 1 ? "s" : ""}</span>
          ${byLine}
          ${s.id === activeId ? '<span class="setting-previewing">Previewing ▶</span>' : ""}
        </div>`;
      }).join("")}
    </div>`;
}

function _selectSetting(sid) {
  _activeSettingId = sid;
  const setting = _previewSettings.find(s => s.id === sid);
  if (!setting) return;

  // Update strip highlight + previewing label
  const strip = document.getElementById("session-settings-strip");
  strip.querySelectorAll(".setting-row").forEach(row => {
    const rowSid = Number(row.dataset.settingId);
    const isActive = rowSid === sid;
    row.classList.toggle("active", isActive);
    const existing = row.querySelector(".setting-previewing");
    if (existing) existing.remove();
    if (isActive) {
      row.insertAdjacentHTML("beforeend", '<span class="setting-previewing">Previewing ▶</span>');
    }
  });

  // Update key badge in header
  const typeClass = typeBadgeClass(_previewTuneData.type);
  document.getElementById("session-preview-badges").innerHTML =
    (_previewTuneData.type ? `<span class="badge ${typeClass}">${escHtml(_previewTuneData.type)}</span>` : "") +
    (setting.key ? `<span class="badge badge-key">${escHtml(setting.key)}</span>` : "");

  // Update ABC tab
  document.getElementById("preview-abc-text").textContent = setting.abc;

  // Update submitter info in header
  _updatePreviewSubmitter(sid);

  // Re-render sheet music
  renderPreviewMusic(setting.abc);
}

function _updateSessionSaveBtn() {
  const n = _checkedSettingIds.size;
  const btn = document.getElementById("session-save-btn");
  btn.textContent = n > 1 ? `Save ${n} settings` : "Save to Library";
  btn.disabled = n === 0;
}

function showSessionPreview(tuneData) {
  _previewTuneData = tuneData;
  _previewSettings = tuneData.settings || [];
  _checkedSettingIds = new Set();

  // Default: check and preview the first setting (X:1)
  _activeSettingId = _previewSettings.length > 0 ? _previewSettings[0].id : null;
  if (_activeSettingId !== null) _checkedSettingIds.add(_activeSettingId);

  document.getElementById("session-search-pane").classList.add("hidden");
  const preview = document.getElementById("session-preview");
  preview.classList.remove("hidden");

  document.getElementById("session-preview-title").textContent = tuneData.title;
  const visitBtn = document.getElementById("session-visit-btn");
  if (visitBtn) visitBtn.href = `https://thesession.org/tunes/${tuneData.session_id}`;
  const typeClass = typeBadgeClass(tuneData.type);
  document.getElementById("session-preview-badges").innerHTML =
    (tuneData.type ? `<span class="badge ${typeClass}">${escHtml(tuneData.type)}</span>` : "") +
    (tuneData.key  ? `<span class="badge badge-key">${escHtml(tuneData.key)}</span>` : "");

  document.getElementById("preview-abc-text").textContent = tuneData.abc;

  // Submitter info for the active (first) setting
  _updatePreviewSubmitter(_activeSettingId);

  // Settings strip
  const strip = document.getElementById("session-settings-strip");
  if (_previewSettings.length > 1) {
    strip.innerHTML = _renderSettingsStrip(_previewSettings, _activeSettingId);
    strip.classList.remove("hidden");
    strip.querySelectorAll(".setting-row").forEach(row => {
      row.addEventListener("click", e => {
        if (e.target.classList.contains("setting-check")) return;
        _selectSetting(Number(row.dataset.settingId));
      });
      const cb = row.querySelector(".setting-check");
      cb.addEventListener("change", () => {
        const sid = Number(cb.dataset.settingId);
        if (cb.checked) _checkedSettingIds.add(sid);
        else _checkedSettingIds.delete(sid);
        _updateSessionSaveBtn();
      });
    });
  } else {
    strip.classList.add("hidden");
  }

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

// ── ABC utilities for sets ────────────────────────────────────────────────────

function extractBars(abc) {
  if (!abc) return [];
  const kMatch = abc.match(/^K:[^\n]*/m);
  if (!kMatch) return [];
  let music = abc.slice(abc.indexOf(kMatch[0]) + kMatch[0].length);
  music = music.replace(/^[A-Za-z]:[^\n]*/gm, "").replace(/%[^\n]*/g, "").replace(/\s+/g, " ").trim();
  return music.split("|")
    .map(b => b.replace(/^[:\[\]]+/, "").replace(/[:\[\]]+$/, "").trim())
    .filter(b => b.length > 0);
}

function buildTransitionAbc(tuneA, tuneB) {
  const barsA = extractBars(tuneA.abc);
  const barsB = extractBars(tuneB.abc);
  if (!barsA.length || !barsB.length) return null;
  const lastTwo = barsA.slice(Math.max(0, barsA.length - 3));
  const firstTwo = barsB.slice(0, Math.min(3, barsB.length));
  const key   = ((tuneA.abc || "").match(/^K:\s*(.+)$/m) || [])[1]?.trim() || "C";
  const meter = ((tuneA.abc || "").match(/^M:\s*(.+)$/m) || [])[1]?.trim() || "4/4";
  const len   = ((tuneA.abc || "").match(/^L:\s*(.+)$/m) || [])[1]?.trim() || "1/8";
  // Explicit newline between the two groups forces ABCJS to put each on its own staff line
  return `X:1\nT:${tuneA.title} TRANSITION ${tuneB.title}\nM:${meter}\nL:${len}\nK:${key}\n|${lastTwo.join("|")}|\n|${firstTwo.join("|")}|`;
}

function _countAbcBars(abc) {
  const kIdx = abc.search(/^K:/m);
  if (kIdx < 0) return 1;
  const body = abc.slice(abc.indexOf('\n', kIdx) + 1);
  let count = 0, inChord = false;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '[') inChord = true;
    else if (body[i] === ']') inChord = false;
    else if (body[i] === '|' && !inChord) count++;
  }
  return Math.max(count, 1);
}

function buildFullSetAbc(tunes) {
  return tunes.filter(t => t.abc).map((t, i) =>
    expandAbcRepeats(t.abc.replace(/^X:\s*\d+/m, `X:${i + 1}`))
  ).join("\n\n");
}

/** Build a single-tune ABC for playback: merge all tunes into one X:1 block
 *  with inline key/meter/length changes between sections. */
function buildCombinedPlaybackAbc(tunes) {
  return buildCombinedPlaybackAbcWithRanges(tunes)?.abc ?? null;
}

/** Like buildCombinedPlaybackAbc but also returns per-tune character ranges. */
function buildCombinedPlaybackAbcWithRanges(tunes) {
  const withAbc = tunes.filter(t => t.abc);
  if (!withAbc.length) return null;

  function extractField(abc, field) {
    const m = abc.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  }
  function extractBody(abc) {
    const kMatch = abc.match(/^K:[^\n]*/m);
    if (!kMatch) return '';
    let body = abc.slice(abc.indexOf(kMatch[0]) + kMatch[0].length);
    body = body.replace(/^[A-Za-z]:[^\n]*/gm, '').replace(/%%[^\n]*/g, '').trim();
    return body;
  }

  const first = withAbc[0].abc;
  const meter = extractField(first, 'M') || '4/4';
  const len   = extractField(first, 'L') || '1/8';
  const key   = extractField(first, 'K') || 'C';

  const header = `X:1\nT:${withAbc[0].title || 'Set'}\nM:${meter}\nL:${len}\nK:${key}\n`;
  let combined = '';
  const tuneRanges = [];

  for (let i = 0; i < withAbc.length; i++) {
    const t = withAbc[i];
    const abc = expandAbcRepeats(t.abc);
    let prefix = '';
    if (i > 0) {
      const m = extractField(t.abc, 'M');
      const l = extractField(t.abc, 'L');
      const k = extractField(t.abc, 'K');
      if (m && m !== meter) prefix += `[M:${m}]`;
      if (l && l !== len)   prefix += `[L:${l}]`;
      if (k)                prefix += `[K:${k}]`;
      prefix += '\n';
    }
    // Title label above each tune's section in the score
    const titleLine = `%%text ${t.title || ''}\n`;
    const body = extractBody(abc);
    const start = header.length + combined.length + prefix.length + titleLine.length;
    tuneRanges.push({ start, end: start + body.length });
    combined += prefix + titleLine + body + '\n';
  }

  return { abc: header + combined, tuneRanges };
}

let _setMusicSynth = null;

function openSetMusicModal(title, abc, opts = {}) {
  // Backwards-compat: openSetMusicModal(title, abc, true) → {isTransition:true}
  if (opts === true) opts = { isTransition: true };
  const { isTransition = false, onBack = null } = opts;

  if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} _setMusicSynth = null; }

  modalContent.innerHTML = `
    ${onBack ? '<button class="modal-back-btn" id="set-music-back-btn">← Back</button>' : ""}
    <h2 class="modal-title">${escHtml(title)}</h2>
    <div id="set-music-render" style="margin-top:.75rem"></div>
    <div id="set-music-audio" style="margin-top:.75rem"></div>`;
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  if (onBack) {
    document.getElementById("set-music-back-btn").addEventListener("click", () => {
      if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} _setMusicSynth = null; }
      onBack();
    });
  }

  requestAnimationFrame(() => {
    if (typeof ABCJS === "undefined") return;
    try {
      const visualObjs = ABCJS.renderAbc("set-music-render", expandAbcRepeats(abc), {
        responsive: "resize",
        add_classes: true,
        paddingbottom: 20,
        paddingleft: 20,
        paddingright: 20,
        paddingtop: 20,
        foregroundColor: "#000000",
        scale: 1.4,
      });
      _patchSvgViewBox("set-music-render");

      if (isTransition) {
        const wrappers = document.querySelectorAll("#set-music-render .abcjs-staff-wrapper");
        if (wrappers.length >= 1) wrappers[0].classList.add("transition-part-a");
        if (wrappers.length >= 2) wrappers[1].classList.add("transition-part-b");
      }

      if (!ABCJS.synth || !ABCJS.synth.supportsAudio()) return;

      const cursorControl = {
        onEvent(ev) {
          document.querySelectorAll("#set-music-render .abcjs-highlight")
            .forEach(el => el.classList.remove("abcjs-highlight"));
          if (ev && ev.elements) {
            ev.elements.forEach(grp => {
              if (grp) grp.forEach(el => el.classList.add("abcjs-highlight"));
            });
          }
        },
        onFinished() {
          document.querySelectorAll("#set-music-render .abcjs-highlight")
            .forEach(el => el.classList.remove("abcjs-highlight"));
        },
      };

      _setMusicSynth = new ABCJS.synth.SynthController();
      _setMusicSynth.load("#set-music-audio", cursorControl, {
        displayLoop: false,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true,
      });
      _setMusicSynth.setTune(visualObjs[0], false, { program: 73 })
        .then(() => _setMusicSynth.setWarp(100))
        .catch(err => { console.warn("Set music audio init failed:", err); });
    } catch (err) {
      console.warn("Set music render failed:", err);
    }
  });
}

function openFullSetModal(setData) {
  const tunes = setData.tunes || [];
  if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} _setMusicSynth = null; }

  const trackRows = tunes.map((t, i) => `
    <div class="set-track-item" draggable="true" data-tune-id="${t.id}">
      <span class="set-track-drag" title="Drag to reorder">⠿</span>
      <span class="set-track-num">${i + 1}</span>
      <span class="set-track-title">${escHtml(t.title)}</span>
      <span class="set-track-meta">${[t.type, t.key].filter(Boolean).map(escHtml).join(" · ") || ""}</span>
    </div>`).join("");

  const tunesWithAbc = tunes.filter(t => t.abc);
  const transRows = [];
  for (let i = 0; i < tunes.length - 1; i++) {
    const a = tunes[i], b = tunes[i + 1];
    if (!a.abc || !b.abc) continue;
    transRows.push(`
      <div class="set-music-trans-row" data-idx-a="${i}" data-idx-b="${i + 1}">
        <span class="set-music-trans-label">${escHtml(a.title)} → ${escHtml(b.title)}</span>
        <button class="btn-secondary btn-sm set-trans-play-btn" data-idx-a="${i}" data-idx-b="${i + 1}">▶ Play</button>
        <button class="btn-secondary btn-sm set-trans-music-btn" data-idx-a="${i}" data-idx-b="${i + 1}">Music</button>
      </div>`);
  }

  const hasAbc = tunesWithAbc.length > 0;

  const tuneSheetDivs = tunesWithAbc.map((t, i) => `
    <div class="set-tune-sheet" id="set-tune-sheet-${i}">
      <h4 class="set-tune-sheet-title">${i + 1}. ${escHtml(t.title)}</h4>
      <div id="set-tune-render-${i}"></div>
    </div>`).join("");

  // Timeline bar: proportional segments showing each tune's share of the set
  let timelineHtml = '';
  let barCounts = [];
  if (tunesWithAbc.length > 1) {
    barCounts = tunesWithAbc.map(t => _countAbcBars(expandAbcRepeats(t.abc)));
    const total = barCounts.reduce((a, b) => a + b, 0);
    timelineHtml = `<div class="set-tune-timeline" aria-label="Set tune proportions">${
      tunesWithAbc.map((t, i) => {
        const pct = (barCounts[i] / total * 100).toFixed(1);
        return `<div class="set-timeline-seg set-timeline-seg-${(i % 4) + 1}" style="width:${pct}%" title="${escHtml(t.title)}">
          <span class="set-timeline-label">${escHtml(t.title)}</span>
        </div>`;
      }).join('')
    }</div>`;
  }

  modalContent.innerHTML = `
    <h2 class="modal-title">${escHtml(setData.name)}
      <a class="btn-secondary btn-sm modal-export-btn" href="/api/export/set/${setData.id}" download title="Download as .ceol.json">⬇ Export</a>
    </h2>
    <div class="set-track-list">${trackRows || '<p class="modal-hint">No tunes in this set.</p>'}</div>
    ${hasAbc ? `
      <h3 class="set-music-section-hd">Sheet music <span class="set-music-count">(${tunesWithAbc.length} of ${tunes.length} tunes)</span></h3>
      <div id="set-music-sheets">${tuneSheetDivs}</div>
    ` : '<p class="modal-hint" style="margin-top:.75rem">No ABC notation available for tunes in this set.</p>'}
    ${transRows.length ? `
      <h3 class="set-music-section-hd">Transitions</h3>
      <div class="set-music-trans-section">${transRows.join("")}</div>
    ` : ""}
    ${hasAbc ? `
      <div class="set-full-hd-row" style="margin-top:1.5rem">
        <h3 class="set-music-section-hd">${tunesWithAbc.length > 1 ? "Full set" : "Playback"}</h3>
        <button class="btn-secondary btn-sm abc-fs-btn" id="set-full-fs-btn" title="Full screen sheet music">⛶ Full screen</button>
        <button class="btn-secondary btn-sm" id="set-full-print-btn" title="Print full set sheet music">⎙ Print</button>
      </div>
      ${timelineHtml}
      <div id="set-full-render" style="margin-top:.5rem"></div>
      <div id="set-full-audio" style="margin-top:.75rem"></div>
    ` : ""}`;

  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // ── Drag-and-drop reordering for track list ──────────────────────────────
  {
    const trackList = modalContent.querySelector(".set-track-list");
    function _reorderSetSheetMusic(orderedTunes) {
      // Rebuild individual sheet music section (preserves existing rendered SVGs where possible)
      const sheetsEl = document.getElementById("set-music-sheets");
      if (!sheetsEl) return;
      const tunesWithAbc = orderedTunes.filter(t => t.abc);
      const TUNE_COLORS = ['#7c6af7', '#0d9488', '#f472b6', '#fb923c'];
      sheetsEl.innerHTML = tunesWithAbc.map((t, i) => `
        <div class="set-tune-sheet" id="set-tune-sheet-${i}">
          <h4 class="set-tune-sheet-title">${i + 1}. ${escHtml(t.title)}</h4>
          <div id="set-tune-render-${i}"></div>
        </div>`).join('');
      requestAnimationFrame(() => {
        tunesWithAbc.forEach((t, i) => {
          const id = `set-tune-render-${i}`;
          try {
            ABCJS.renderAbc(id, expandAbcRepeats(t.abc), {
              responsive: "resize", add_classes: true,
              paddingbottom: 10, paddingleft: 10, paddingright: 10, paddingtop: 10,
              foregroundColor: TUNE_COLORS[i % TUNE_COLORS.length], scale: 1.1,
            });
            _patchSvgViewBox(id);
          } catch {}
        });
        // Rebuild combined playback ABC
        if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} _setMusicSynth = null; }
        const combined = buildCombinedPlaybackAbcWithRanges(tunesWithAbc);
        const renderEl = document.getElementById("set-full-render");
        const audioEl = document.getElementById("set-full-audio");
        if (!combined || !renderEl) return;
        try {
          const fullVisual = ABCJS.renderAbc("set-full-render", combined.abc, {
            responsive: "resize", add_classes: true,
            paddingbottom: 10, paddingleft: 10, paddingright: 10, paddingtop: 10,
            foregroundColor: "#000000", scale: 1.0,
          });
          _patchSvgViewBox("set-full-render");
          if (!fullVisual.length || !ABCJS.synth || !ABCJS.synth.supportsAudio()) return;
          let _lastHighlighted = [];
          const cursorControl = {
            onEvent(ev) {
              _lastHighlighted.forEach(el => { el.style.fill = ''; });
              _lastHighlighted = [];
              if (!ev?.elements) return;
              const sc = ev.startChar ?? -1;
              let tuneIdx = combined.tuneRanges.length - 1;
              for (let i = 0; i < combined.tuneRanges.length; i++) {
                if (sc >= combined.tuneRanges[i].start && sc <= combined.tuneRanges[i].end) { tuneIdx = i; break; }
              }
              const color = TUNE_COLORS[tuneIdx % TUNE_COLORS.length];
              ev.elements.forEach(grp => { if (grp) grp.forEach(el => { el.style.fill = color; _lastHighlighted.push(el); }); });
            },
            onFinished() { _lastHighlighted.forEach(el => { el.style.fill = ''; }); _lastHighlighted = []; },
          };
          if (audioEl) audioEl.innerHTML = '';
          _setMusicSynth = new ABCJS.synth.SynthController();
          _setMusicSynth.load("#set-full-audio", cursorControl, {
            displayLoop: false, displayRestart: true, displayPlay: true,
            displayProgress: true, displayWarp: true,
          });
          _setMusicSynth.setTune(fullVisual[0], false, { program: 73 })
            .then(() => _setMusicSynth.setWarp(100))
            .catch(() => {});
        } catch {}
        // Rewire fullscreen button for new combined ABC
        const fsBtn = document.getElementById("set-full-fs-btn");
        if (fsBtn && combined) {
          fsBtn.onclick = () => {
            if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} }
            openAbcFullscreen(combined.abc, setData.name, {
              tuneRanges: combined.tuneRanges,
              tuneColors: TUNE_COLORS,
            });
          };
        }
      });
    }

    if (trackList && tunes.length > 1) {
      let dragSrcTuneId = null;
      trackList.querySelectorAll(".set-track-item").forEach(item => {
        item.addEventListener("dragstart", e => {
          dragSrcTuneId = parseInt(item.dataset.tuneId, 10);
          item.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("dragging");
          trackList.querySelectorAll(".set-track-item").forEach(el => el.classList.remove("drag-over"));
        });
        item.addEventListener("dragover", e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        });
        item.addEventListener("dragenter", e => { e.preventDefault(); item.classList.add("drag-over"); });
        item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
        item.addEventListener("drop", async e => {
          e.preventDefault();
          item.classList.remove("drag-over");
          const destTuneId = parseInt(item.dataset.tuneId, 10);
          if (!dragSrcTuneId || dragSrcTuneId === destTuneId) return;
          // Reorder tunes array: move src to dest position
          const srcIdx = tunes.findIndex(t => t.id === dragSrcTuneId);
          const dstIdx = tunes.findIndex(t => t.id === destTuneId);
          if (srcIdx === -1 || dstIdx === -1) return;
          const [moved] = tunes.splice(srcIdx, 1);
          tunes.splice(dstIdx, 0, moved);
          // Reorder DOM items to match new tunes array order
          tunes.forEach(t => {
            const el = trackList.querySelector(`[data-tune-id="${t.id}"]`);
            if (el) trackList.appendChild(el);
          });
          // Update track numbers
          trackList.querySelectorAll(".set-track-item").forEach((el, i) => {
            const numEl = el.querySelector(".set-track-num");
            if (numEl) numEl.textContent = i + 1;
          });
          // Persist to backend
          try {
            await apiFetch(`/api/sets/${setData.id}/tunes/reorder`, {
              method: "PUT",
              body: JSON.stringify({ order: tunes.map(t => t.id) }),
            });
          } catch (err) { console.warn("Set reorder failed:", err); }
          // Rebuild sheet music for new order
          _reorderSetSheetMusic(tunes);
        });
      });
    }
  }

  modalContent.querySelectorAll(".set-trans-play-btn, .set-trans-music-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const a = tunes[Number(btn.dataset.idxA)];
      const b = tunes[Number(btn.dataset.idxB)];
      const transAbc = buildTransitionAbc(a, b);
      if (!transAbc) return;
      openSetMusicModal(`${a.title} → ${b.title}`, transAbc, {
        isTransition: true,
        onBack: () => openFullSetModal(setData),
      });
    });
  });

  const printBtn = document.getElementById("set-full-print-btn");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      const render = document.getElementById("set-full-render");
      if (!render) return;
      const win = window.open('', '_blank');
      win.document.write(`<!DOCTYPE html><html><head>
        <title>${setData.name.replace(/</g, '&lt;')}</title>
        <style>
          body { font-family: sans-serif; margin: 1.5cm; color: #000; background: #fff; }
          h1 { font-size: 16pt; margin: 0 0 .5em; }
          svg { max-width: 100%; display: block; }
          @page { margin: 1.5cm; }
        </style>
      </head><body>
        <h1>${setData.name.replace(/</g, '&lt;')}</h1>
        ${render.innerHTML}
      </body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 400);
    });
  }

  if (!hasAbc) return;

  const TUNE_COLORS = ['#7c6af7', '#0d9488', '#f472b6', '#fb923c'];
  const _setCombined = buildCombinedPlaybackAbcWithRanges(tunesWithAbc);

  // Wire fullscreen button (uses combined ABC with per-tune colour highlights)
  const setFsBtn = document.getElementById("set-full-fs-btn");
  if (setFsBtn && _setCombined) {
    setFsBtn.addEventListener("click", () => {
      if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} }
      openAbcFullscreen(_setCombined.abc, setData.name, {
        tuneRanges: _setCombined.tuneRanges,
        tuneColors: TUNE_COLORS,
      });
    });
  }

  requestAnimationFrame(() => {
    if (typeof ABCJS === "undefined") return;

    // Render individual reference sheets with each tune's colour
    tunesWithAbc.forEach((t, i) => {
      const id = `set-tune-render-${i}`;
      try {
        ABCJS.renderAbc(id, expandAbcRepeats(t.abc), {
          responsive: "resize", add_classes: true,
          paddingbottom: 10, paddingleft: 10, paddingright: 10, paddingtop: 10,
          foregroundColor: TUNE_COLORS[i % TUNE_COLORS.length], scale: 1.1,
        });
        _patchSvgViewBox(id);
      } catch (err) {
        console.warn(`Set tune ${i} render failed:`, err);
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<p style="color:var(--text-muted);font-size:.8rem">Could not render sheet music.</p>`;
      }
    });

    // Render combined ABC into the visible Full Set section
    const combined = _setCombined;
    if (!combined) return;
    const { abc: playbackAbc, tuneRanges } = combined;

    try {
      const fullVisual = ABCJS.renderAbc("set-full-render", playbackAbc, {
        responsive: "resize", add_classes: true,
        paddingbottom: 10, paddingleft: 10, paddingright: 10, paddingtop: 10,
        foregroundColor: "#000000", scale: 1.0,
      });
      _patchSvgViewBox("set-full-render");
      if (!fullVisual.length || !ABCJS.synth || !ABCJS.synth.supportsAudio()) return;

      // Highlight notes in their tune's colour as they play
      let _lastHighlighted = [];
      const cursorControl = {
        onEvent(ev) {
          _lastHighlighted.forEach(el => { el.style.fill = ''; });
          _lastHighlighted = [];
          if (!ev?.elements) return;
          const sc = ev.startChar ?? -1;
          let tuneIdx = tuneRanges.length - 1;
          for (let i = 0; i < tuneRanges.length; i++) {
            if (sc >= tuneRanges[i].start && sc <= tuneRanges[i].end) { tuneIdx = i; break; }
          }
          const color = TUNE_COLORS[tuneIdx % TUNE_COLORS.length];
          ev.elements.forEach(grp => {
            if (!grp) return;
            grp.forEach(el => { el.style.fill = color; _lastHighlighted.push(el); });
          });
        },
        onFinished() {
          _lastHighlighted.forEach(el => { el.style.fill = ''; });
          _lastHighlighted = [];
        },
      };

      _setMusicSynth = new ABCJS.synth.SynthController();
      _setMusicSynth.load("#set-full-audio", cursorControl, {
        displayLoop: false, displayRestart: true, displayPlay: true,
        displayProgress: true, displayWarp: true,
      });
      _setMusicSynth.setTune(fullVisual[0], false, { program: 73 })
        .then(() => _setMusicSynth.setWarp(100))
        .catch(err => console.warn("Full set audio init failed:", err));
    } catch (err) {
      console.warn("Full set combined render failed:", err);
    }
  });
}

// ── Add-to-set flow panels ────────────────────────────────────────────────────

// Panel 1: list of existing sets to choose from
function showSetPickerPanel(tune, onBack, siblings) {
  const backToTune = () => { renderModal(tune, onBack, siblings); requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); }); };
  const rows = state.sets.map(s => `
    <button class="set-picker-row" data-set-id="${s.id}">
      <span class="set-picker-name">${escHtml(s.name)}</span>
      <span class="set-picker-count">${s.tune_count || 0} tune${s.tune_count !== 1 ? "s" : ""}</span>
      <span class="set-picker-arrow">›</span>
    </button>`).join("");

  modalContent.innerHTML = `
    <button class="modal-back-btn" id="modal-back-btn">← Back</button>
    <h2 class="modal-title">Add to a set</h2>
    <p class="modal-hint">Choose a set to preview where <strong>${escHtml(tune.title)}</strong> will sit.</p>
    <div class="set-picker-list">${rows || '<p class="modal-hint">No sets yet — use "Create new set" instead.</p>'}</div>
    <div style="margin-top:1rem">
      <button id="picker-create-btn" class="btn-secondary btn-sm">+ Create new set instead</button>
    </div>`;

  document.getElementById("modal-back-btn").addEventListener("click", backToTune);
  document.getElementById("picker-create-btn").addEventListener("click", () => showCreateSetPanel(tune, onBack, siblings));
  modalContent.querySelectorAll(".set-picker-row").forEach(btn => {
    btn.addEventListener("click", async () => {
      const setId = Number(btn.dataset.setId);
      const setData = await apiGetSet(setId);
      showSetPreviewPanel(tune, setData, onBack, siblings);
    });
  });
}

// Panel 2: preview the set with the new tune appended, allow reorder + playback
function showSetPreviewPanel(tune, setData, onBack, siblings) {
  const backToPicker = () => showSetPickerPanel(tune, onBack, siblings);
  const backToTune   = () => { renderModal(tune, onBack, siblings); requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); }); };

  // Working copy of the order; new tune is appended at the end
  let previewOrder = [...(setData.tunes || []), { ...tune, _isNew: true }];

  function renderPreview() {
    const rows = previewOrder.map((t, i) => `
      <div class="set-preview-row${t._isNew ? " set-preview-new" : ""}" data-idx="${i}">
        <span class="set-preview-pos">${i + 1}</span>
        <span class="set-preview-title">${escHtml(t.title)}${t._isNew ? ' <span class="set-preview-new-badge">new</span>' : ""}</span>
        <span class="set-preview-meta">${escHtml([t.type, t.key].filter(Boolean).join(" · "))}</span>
        <div class="set-preview-btns">
          <button class="set-prev-up btn-sm" data-idx="${i}" ${i === 0 ? "disabled" : ""} title="Move up">↑</button>
          <button class="set-prev-dn btn-sm" data-idx="${i}" ${i === previewOrder.length - 1 ? "disabled" : ""} title="Move down">↓</button>
        </div>
      </div>`).join("");

    modalContent.innerHTML = `
      <button class="modal-back-btn" id="modal-back-btn">← Back</button>
      <h2 class="modal-title">Add to "${escHtml(setData.name)}"</h2>
      <p class="modal-hint">Drag <strong>${escHtml(tune.title)}</strong> into position, preview the set, then confirm.</p>
      <div class="set-preview-list" id="set-preview-list">${rows}</div>
      <div class="set-preview-actions">
        <button id="set-preview-play-btn" class="btn-secondary"${previewOrder.some(t => t.abc) ? "" : " disabled"}>▶ Preview playback</button>
        <button id="set-preview-confirm-btn" class="btn-primary">Add to set</button>
        <button id="set-preview-cancel-btn" class="btn-secondary">Cancel</button>
        <span id="set-preview-status" class="set-status"></span>
      </div>`;

    document.getElementById("modal-back-btn").addEventListener("click", backToPicker);
    document.getElementById("set-preview-cancel-btn").addEventListener("click", backToTune);

    // Move up/down
    modalContent.querySelectorAll(".set-prev-up").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.idx);
        [previewOrder[i - 1], previewOrder[i]] = [previewOrder[i], previewOrder[i - 1]];
        renderPreview();
      });
    });
    modalContent.querySelectorAll(".set-prev-dn").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.idx);
        [previewOrder[i], previewOrder[i + 1]] = [previewOrder[i + 1], previewOrder[i]];
        renderPreview();
      });
    });

    // Preview playback — build combined ABC and open music modal with back callback
    document.getElementById("set-preview-play-btn").addEventListener("click", () => {
      const abc = buildCombinedPlaybackAbc(previewOrder);
      if (!abc) return;
      openSetMusicModal(`Preview: ${setData.name}`, abc, { onBack: renderPreview });
    });

    // Confirm — add tune at the correct position then reorder
    document.getElementById("set-preview-confirm-btn").addEventListener("click", async () => {
      const status = document.getElementById("set-preview-status");
      const btn = document.getElementById("set-preview-confirm-btn");
      btn.disabled = true;
      status.textContent = "Adding…";
      try {
        await apiAddTuneToSet(setData.id, tune.id);
        // Reorder to match preview (new tune may have been moved)
        const newOrder = previewOrder.map(t => t.id);
        await apiReorderSetTunes(setData.id, newOrder);
        await fetchSets();
        status.textContent = "Added!";
        status.className = "set-status set-saved";
        setTimeout(backToTune, 900);
      } catch (e) {
        status.textContent = e.message || "Failed.";
        status.className = "set-status set-error";
        btn.disabled = false;
      }
    });
  }

  renderPreview();
}

// Panel 3: create a new set with this tune as the first entry
function showCreateSetPanel(tune, onBack, siblings) {
  const backToTune = () => { renderModal(tune, onBack, siblings); requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); }); };
  const defaultName = `${tune.title} Set`;

  modalContent.innerHTML = `
    <button class="modal-back-btn" id="modal-back-btn">← Back</button>
    <h2 class="modal-title">Create new set</h2>
    <p class="modal-hint"><strong>${escHtml(tune.title)}</strong> will be added as the first tune.</p>
    <div class="create-set-form">
      <label class="create-set-label">Set name</label>
      <input id="create-set-name-input" class="create-set-input" type="text" value="${escHtml(defaultName)}" maxlength="120">
      <div class="create-set-actions">
        <button id="create-set-confirm-btn" class="btn-primary">Create set</button>
        <button id="create-set-cancel-btn" class="btn-secondary">Cancel</button>
        <span id="create-set-status" class="set-status"></span>
      </div>
    </div>`;

  const nameInput = document.getElementById("create-set-name-input");
  nameInput.focus();
  nameInput.select();

  document.getElementById("modal-back-btn").addEventListener("click", backToTune);
  document.getElementById("create-set-cancel-btn").addEventListener("click", backToTune);

  document.getElementById("create-set-confirm-btn").addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const status = document.getElementById("create-set-status");
    const btn = document.getElementById("create-set-confirm-btn");
    if (!name) { nameInput.focus(); return; }
    btn.disabled = true;
    status.textContent = "Creating…";
    try {
      const newSet = await apiCreateSet(name, "");
      await apiAddTuneToSet(newSet.id, tune.id);
      state.sets.push({ ...newSet, tune_count: 1 });
      await fetchSets();
      status.textContent = "Set created!";
      status.className = "set-status set-saved";
      setTimeout(backToTune, 900);
    } catch (e) {
      status.textContent = e.message || "Failed.";
      status.className = "set-status set-error";
      btn.disabled = false;
    }
  });

  nameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("create-set-confirm-btn").click();
  });
}

function renderSets(sets) {
  if (!sets.length) {
    setsList.innerHTML = '<p class="empty">No sets yet. Create one to organise tunes into a session!</p>';
    return;
  }

  const _masteryLabels = ["Unrated","Just starting","Getting there","Almost there","Know it well","Nailed it!"];

  setsList.innerHTML = sets.map(s => {
    const rating = s.rating || 0;
    const stars = [1,2,3,4,5].map(n =>
      `<button class="set-star-btn${rating >= n ? " filled" : ""}" data-n="${n}" data-set-id="${s.id}" title="${_masteryLabels[n]}">★</button>`
    ).join("");
    return `
    <div class="set-card" data-set-id="${s.id}" data-favourite="${s.is_favourite || 0}" data-rating="${rating}">
      <div class="set-card-header">
        <div class="set-card-info">
          <span class="set-name">${escHtml(s.name)}</span>
          <span class="set-count">${s.tune_count} tune${s.tune_count !== 1 ? "s" : ""}</span>
          <button class="set-rename-btn" data-set-id="${s.id}" title="Rename set">✏</button>
        </div>
        <div class="set-card-actions">
          <button class="set-fav-btn${s.is_favourite ? " active" : ""}" data-set-id="${s.id}"
                  title="${s.is_favourite ? "Remove from favourites" : "Add to favourites"}">👍</button>
          <button class="set-add-col-btn btn-collection btn-sm" data-set-id="${s.id}" title="Add to collection">+ Collection</button>
          <button class="btn-secondary set-expand-btn" data-set-id="${s.id}">View</button>
          <button class="btn-secondary set-music-btn" data-set-id="${s.id}" title="View full set sheet music">Sheet music</button>
          <button class="btn-danger set-delete-btn" data-set-id="${s.id}" title="Delete set">🗑</button>
        </div>
      </div>
      <div class="set-stars">${stars}<span class="set-mastery-label">${rating ? _masteryLabels[rating] : ""}</span></div>
      ${s.notes ? `<p class="set-notes">${escHtml(s.notes)}</p>` : ""}
      <div class="set-tunes-list hidden" id="set-tunes-${s.id}"></div>
    </div>`;
  }).join("");

  function _renderSetTunes(tunesDiv, id, tunes) {
    // Build a lookup map so transitions can be rebuilt after reordering
    const tuneMap = new Map(tunes.map(t => [String(t.id), t]));

    function _rebuildTransitions() {
      tunesDiv.querySelectorAll(".set-transition-row").forEach(r => r.remove());
      const rows = [...tunesDiv.querySelectorAll(".set-tune-row")];
      const footer = tunesDiv.querySelector(".set-add-tune-row");
      for (let i = 0; i < rows.length - 1; i++) {
        const a = tuneMap.get(rows[i].dataset.tuneId);
        const b = tuneMap.get(rows[i + 1].dataset.tuneId);
        if (!a?.abc || !b?.abc) continue;
        const transAbc = buildTransitionAbc(a, b);
        if (!transAbc) continue;
        const tr = document.createElement("div");
        tr.className = "set-transition-row";
        tr.innerHTML = `
          <span class="set-transition-label">${escHtml(a.title)} <em>TRANSITION</em> ${escHtml(b.title)}</span>
          <button class="btn-secondary btn-sm set-transition-play-btn">Play</button>
          <button class="btn-secondary btn-sm set-transition-music-btn">Music</button>`;
        if (footer) footer.before(tr); else tunesDiv.appendChild(tr);
        const open = () => openSetMusicModal(`${a.title} → ${b.title}`, transAbc, { isTransition: true });
        tr.querySelector(".set-transition-play-btn").addEventListener("click", open);
        tr.querySelector(".set-transition-music-btn").addEventListener("click", open);
      }
    }

    // Tune rows
    tunesDiv.innerHTML = tunes.map((t, i) => `
      <div class="set-tune-row" data-tune-id="${t.id}">
        <button class="set-move-up btn-icon" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="set-move-down btn-icon" title="Move down" ${i === tunes.length - 1 ? "disabled" : ""}>↓</button>
        <span class="set-tune-pos">${i + 1}.</span>
        <button class="set-tune-title tune-open-btn" data-tune-id="${t.id}">${escHtml(t.title)}</button>
        <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
        <span class="badge badge-key">${escHtml(t.key || "")}</span>
        <button class="btn-icon remove-from-set"
          data-set-id="${id}" data-tune-id="${t.id}" title="Remove from set">🗑</button>
      </div>
    `).join("");

    _rebuildTransitions();

    // Clickable tune titles
    tunesDiv.querySelectorAll(".tune-open-btn").forEach(tb => {
      tb.addEventListener("click", async () => {
        await Promise.all([fetchSets(), fetchCollections()]);
        const tune = await fetchTune(tb.dataset.tuneId);
        renderModal(tune);
        modalOverlay.classList.remove("hidden");
        document.body.style.overflow = "hidden";
      });
    });

    // Remove buttons
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

    // Up/down reordering
    function _reorderRows() {
      const rows = [...tunesDiv.querySelectorAll(".set-tune-row")];
      rows.forEach((r, i) => {
        r.querySelector(".set-tune-pos").textContent = `${i + 1}.`;
        r.querySelector(".set-move-up").disabled = i === 0;
        r.querySelector(".set-move-down").disabled = i === rows.length - 1;
      });
      _rebuildTransitions();
      const newOrder = rows.map(r => Number(r.dataset.tuneId));
      apiReorderSetTunes(id, newOrder).catch(() => {});
    }

    tunesDiv.querySelectorAll(".set-move-up").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".set-tune-row");
        const prev = row.previousElementSibling;
        if (prev && prev.classList.contains("set-tune-row")) {
          prev.before(row);
          _reorderRows();
        }
      });
    });
    tunesDiv.querySelectorAll(".set-move-down").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".set-tune-row");
        const next = row.nextElementSibling;
        if (next && next.classList.contains("set-tune-row")) {
          next.after(row);
          _reorderRows();
        }
      });
    });
  }

  function _appendAddTuneFooter(tunesDiv, id) {
    const footer = document.createElement("div");
    footer.className = "set-add-tune-row";
    footer.innerHTML = `
      <input type="text" class="set-add-tune-input ff-url-input" placeholder="Search tunes to add…" />
      <div class="set-add-tune-results"></div>`;
    tunesDiv.appendChild(footer);

    const input = footer.querySelector(".set-add-tune-input");
    const results = footer.querySelector(".set-add-tune-results");
    let _debounce = null;

    input.addEventListener("input", () => {
      clearTimeout(_debounce);
      const q = input.value.trim();
      if (!q) { results.innerHTML = ""; return; }
      _debounce = setTimeout(async () => {
        const tunes = await apiFetch(`/api/tunes?search=${encodeURIComponent(q)}&page_size=8`);
        const list = tunes.tunes || tunes;
        if (!list.length) { results.innerHTML = '<p class="set-add-tune-none">No tunes found</p>'; return; }
        results.innerHTML = list.map(t =>
          `<button class="set-add-tune-result" data-tune-id="${t.id}" data-version-count="${t.version_count || 0}">
             ${escHtml(t.title)}
             <span class="badge ${typeBadgeClass(t.type)}" style="margin-left:.4rem">${escHtml(t.type || "")}</span>
             <span class="badge badge-key">${escHtml(t.key || "")}</span>
             ${(t.version_count || 0) > 0 ? `<span class="badge badge-versions" style="margin-left:.2rem">${t.version_count} versions</span>` : ""}
           </button>`
        ).join("");

        // Helper: add a specific tune ID to the set and refresh the list
        const _doAdd = async (tuneId) => {
          await apiFetch(`/api/sets/${id}/tunes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tune_id: Number(tuneId) }),
          });
          input.value = "";
          results.innerHTML = "";
          const setData = await apiGetSet(id);
          const emptyMsg = tunesDiv.querySelector(".set-empty");
          if (emptyMsg) emptyMsg.remove();
          tunesDiv.querySelectorAll(".set-tune-row, .set-transition-row").forEach(r => r.remove());
          footer.before(document.createTextNode(""));
          _renderSetTunes(tunesDiv, id, setData.tunes);
          tunesDiv.appendChild(footer);
          const set = state.sets.find(s => String(s.id) === String(id));
          if (set) {
            set.tune_count = setData.tunes.length;
            const countEl = document.querySelector(`[data-set-id="${id}"] .set-count`);
            if (countEl) countEl.textContent = `${set.tune_count} tune${set.tune_count !== 1 ? "s" : ""}`;
          }
        };

        results.querySelectorAll(".set-add-tune-result").forEach(btn => {
          btn.addEventListener("click", async () => {
            const vCount = Number(btn.dataset.versionCount || 0);
            if (vCount > 0) {
              // Show inline version picker
              btn.disabled = true;
              const { versions } = await apiFetch(`/api/tunes/${btn.dataset.tuneId}/versions`);
              results.innerHTML = `
                <p class="set-add-tune-ver-label">Choose a version to add:</p>
                ${versions.map((v, i) => {
                  const meta = [v.key, v.type].filter(Boolean).map(escHtml).join(" · ");
                  const label = v.version_label || `Version ${i + 1}`;
                  const isDefault = i === 0;
                  return `<button class="set-add-tune-result set-add-ver-btn" data-ver-id="${v.id}">
                    ${escHtml(label)}
                    <span style="color:var(--text-muted);font-size:.8rem;margin-left:.4rem">${escHtml(meta)}</span>
                    ${isDefault ? '<span class="badge" style="margin-left:.4rem;background:var(--surface2)">default</span>' : ""}
                  </button>`;
                }).join("")}
                <button class="set-add-tune-cancel" style="margin-top:.3rem;font-size:.8rem;color:var(--text-muted);background:none;border:none;cursor:pointer">Cancel</button>`;
              results.querySelector(".set-add-tune-cancel").addEventListener("click", () => {
                results.innerHTML = "";
                input.value = "";
              });
              results.querySelectorAll(".set-add-ver-btn").forEach(vBtn => {
                vBtn.addEventListener("click", async () => {
                  vBtn.disabled = true;
                  try { await _doAdd(vBtn.dataset.verId); }
                  catch { vBtn.disabled = false; alert("Could not add tune — it may already be in the set."); }
                });
              });
            } else {
              btn.disabled = true;
              try { await _doAdd(btn.dataset.tuneId); }
              catch { btn.disabled = false; alert("Could not add tune — it may already be in the set."); }
            }
          });
        });
      }, 250);
    });
  }

  setsList.querySelectorAll(".set-expand-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.setId;
      const tunesDiv = document.getElementById(`set-tunes-${id}`);
      if (tunesDiv.classList.contains("hidden")) {
        tunesDiv.innerHTML = '<p class="loading" style="padding:.5rem">Loading…</p>';
        tunesDiv.classList.remove("hidden");
        btn.textContent = "Hide";
        const setData = await apiGetSet(id);
        tunesDiv.innerHTML = "";
        if (setData.tunes && setData.tunes.length) {
          _renderSetTunes(tunesDiv, id, setData.tunes);
        }
        _appendAddTuneFooter(tunesDiv, id);
      } else {
        tunesDiv.classList.add("hidden");
        btn.textContent = "View";
      }
    });
  });

  // Full set sheet music
  setsList.querySelectorAll(".set-music-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.setId;
      const setData = await apiGetSet(id);
      openFullSetModal(setData);
    });
  });

  setsList.querySelectorAll(".set-fav-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".set-card");
      const setId = btn.dataset.setId;
      const is_favourite = btn.classList.contains("active") ? 0 : 1;
      try {
        await apiFetch(`/api/sets/${setId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favourite }),
        });
        btn.classList.toggle("active", Boolean(is_favourite));
        btn.title = is_favourite ? "Remove from favourites" : "Add to favourites";
        card.dataset.favourite = is_favourite;
      } catch { /* ignore */ }
    });
  });

  // Mastery star rating for sets
  setsList.querySelectorAll(".set-star-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".set-card");
      const setId = btn.dataset.setId;
      const n = Number(btn.dataset.n);
      const current = Number(card.dataset.rating || 0);
      const rating = n === current ? 0 : n;
      try {
        await apiFetch(`/api/sets/${setId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating }),
        });
        card.dataset.rating = rating;
        card.querySelectorAll(".set-star-btn").forEach((s, i) =>
          s.classList.toggle("filled", i < rating)
        );
        const label = card.querySelector(".set-mastery-label");
        if (label) label.textContent = rating ? _masteryLabels[rating] : "";
      } catch { /* ignore */ }
    });
  });

  // Add set to collection
  setsList.querySelectorAll(".set-add-col-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const setId = btn.dataset.setId;
      const cols = await apiFetch("/api/collections");
      if (!cols.length) { alert("No collections yet — create one first in the Collections tab."); return; }
      const existingOptions = cols.map(c =>
        `<label class="bulk-col-option">
           <input type="radio" name="set-col-pick" value="${c.id}" />
           ${escHtml(c.name)}
         </label>`
      ).join("");
      modalContent.innerHTML = `
        <h2 class="modal-title">Add Set to Collection</h2>
        <div class="bulk-col-list">${existingOptions}</div>
        <div class="notes-actions" style="margin-top:1.25rem">
          <button id="set-col-confirm" class="btn-collection" disabled>Add to Collection</button>
          <button id="set-col-cancel" class="btn-secondary">Cancel</button>
          <span id="set-col-status" class="notes-status"></span>
        </div>`;
      modalOverlay.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      const confirmBtn = document.getElementById("set-col-confirm");
      modalContent.querySelectorAll("input[name=set-col-pick]").forEach(r => {
        r.addEventListener("change", () => { confirmBtn.disabled = false; });
      });
      document.getElementById("set-col-cancel").addEventListener("click", closeModal);
      confirmBtn.addEventListener("click", async () => {
        const sel = modalContent.querySelector("input[name=set-col-pick]:checked");
        if (!sel) return;
        const status = document.getElementById("set-col-status");
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Adding…";
        try {
          const res = await apiFetch(`/api/collections/${sel.value}/sets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ set_id: Number(setId) }),
          });
          status.textContent = res.added ? "Added ✓" : "Already in that collection.";
          status.className = "notes-status notes-saved";
          setTimeout(closeModal, 700);
        } catch {
          status.textContent = "Failed — please try again.";
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Add to Collection";
        }
      });
    });
  });

  setsList.querySelectorAll(".set-rename-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const card = btn.closest(".set-card");
      const setId = btn.dataset.setId;
      const nameSpan = card.querySelector(".set-name");
      const original = nameSpan.textContent;

      const input = document.createElement("input");
      input.type = "text";
      input.value = original;
      input.className = "set-name-input";
      input.maxLength = 120;
      nameSpan.replaceWith(input);
      btn.style.visibility = "hidden";
      input.focus();
      input.select();

      async function commit() {
        const newName = input.value.trim();
        if (newName && newName !== original) {
          try {
            await apiFetch(`/api/sets/${setId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: newName }),
            });
            nameSpan.textContent = newName;
            const s = state.sets.find(s => String(s.id) === String(setId));
            if (s) s.name = newName;
          } catch { nameSpan.textContent = original; }
        } else {
          nameSpan.textContent = original;
        }
        input.replaceWith(nameSpan);
        btn.style.visibility = "";
      }

      function cancel() {
        input.removeEventListener("blur", commit);
        nameSpan.textContent = original;
        input.replaceWith(nameSpan);
        btn.style.visibility = "";
      }

      input.addEventListener("blur", commit);
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        if (e.key === "Escape") { cancel(); }
      });
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

function renderCollections(collections) {
  if (!collections.length) {
    collectionsList.innerHTML = '<p class="empty">No collections yet. Create one to group tunes by theme!</p>';
    return;
  }

  collectionsList.innerHTML = collections.map(c => {
    const parts = [];
    if (c.tune_count) parts.push(`${c.tune_count} tune${c.tune_count !== 1 ? "s" : ""}`);
    if (c.set_count)  parts.push(`${c.set_count} set${c.set_count !== 1 ? "s" : ""}`);
    const countLabel = parts.join(", ") || "empty";
    return `
    <div class="set-card" data-col-id="${c.id}">
      <div class="set-card-header">
        <div class="set-card-info">
          <span class="set-name">${escHtml(c.name)}</span>
          <span class="set-count">${countLabel}</span>
        </div>
        <div class="set-card-actions">
          <button class="btn-secondary btn-sm col-strip-btn" data-col-id="${c.id}">Strip chords</button>
          <a class="btn-secondary btn-sm" href="/api/export/collection/${c.id}" download title="Export as .ceol.json">⬇ Export</a>
          <button class="btn-secondary col-expand-btn" data-col-id="${c.id}">View</button>
          <button class="btn-danger col-delete-btn" data-col-id="${c.id}" title="Delete collection">🗑</button>
        </div>
      </div>
      ${c.description ? `<p class="set-notes">${escHtml(c.description)}</p>` : ""}
      <div class="set-tunes-list hidden" id="col-tunes-${c.id}"></div>
    </div>`;
  }).join("");

  collectionsList.querySelectorAll(".col-expand-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.colId;
      const tunesDiv = document.getElementById(`col-tunes-${id}`);
      if (tunesDiv.classList.contains("hidden")) {
        tunesDiv.innerHTML = '<p class="loading" style="padding:.5rem">Loading…</p>';
        tunesDiv.classList.remove("hidden");
        btn.textContent = "Hide";
        const colData = await apiGetCollection(id);
        let html = "";

        // Tunes section
        if (colData.tunes && colData.tunes.length) {
          html += `<p class="col-section-label">Tunes</p>`;
          html += colData.tunes.map(t => `
            <div class="set-tune-row">
              <button class="set-tune-title tune-open-btn" data-tune-id="${t.id}">${escHtml(t.title)}</button>
              <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
              <span class="badge badge-key">${escHtml(t.key || "")}</span>
              <button class="btn-icon remove-from-col"
                data-col-id="${id}" data-tune-id="${t.id}" title="Remove from collection">🗑</button>
            </div>`).join("");
        }

        // Sets section
        if (colData.sets && colData.sets.length) {
          html += `<p class="col-section-label" style="margin-top:.6rem">Sets</p>`;
          html += colData.sets.map(s => `
            <div class="set-tune-row col-set-row" data-set-id="${s.id}">
              <span class="set-tune-title">${escHtml(s.name)}</span>
              <span class="set-count">${s.tune_count} tune${s.tune_count !== 1 ? "s" : ""}</span>
              <button class="btn-icon remove-from-col-set"
                data-col-id="${id}" data-set-id="${s.id}" title="Remove set from collection">🗑</button>
            </div>`).join("");
        }

        // Footer: add-a-set and strip-chords actions always visible
        html += `<div class="col-add-set-row">
          <button class="btn-set btn-sm col-add-set-btn" data-col-id="${id}">+ Add a set…</button>
          <button class="btn-secondary btn-sm col-strip-btn" data-col-id="${id}" title="Remove guitar chord symbols (e.g. &quot;Am&quot;) from ABC notation of all tunes in this collection">Strip chord symbols</button>
        </div>`;

        tunesDiv.innerHTML = html || '<p class="set-empty">Empty — add tunes or sets to this collection.</p>';

        // Add-a-set picker
        tunesDiv.querySelector(".col-add-set-btn").addEventListener("click", async () => {
          const allSets = await apiFetch("/api/sets");
          if (!allSets.length) { alert("No sets yet — create one in the Sets tab first."); return; }
          const opts = allSets.map(s =>
            `<label class="bulk-col-option">
               <input type="radio" name="col-set-pick" value="${s.id}" />
               ${escHtml(s.name)} <span class="set-count">${s.tune_count} tune${s.tune_count !== 1 ? "s" : ""}</span>
             </label>`
          ).join("");
          modalContent.innerHTML = `
            <h2 class="modal-title">Add Set to Collection</h2>
            <div class="bulk-col-list">${opts}</div>
            <div class="notes-actions" style="margin-top:1.25rem">
              <button id="col-set-confirm" class="btn-set" disabled>Add Set</button>
              <button id="col-set-cancel" class="btn-secondary">Cancel</button>
              <span id="col-set-status" class="notes-status"></span>
            </div>`;
          modalOverlay.classList.remove("hidden");
          document.body.style.overflow = "hidden";
          const confirmBtn = document.getElementById("col-set-confirm");
          modalContent.querySelectorAll("input[name=col-set-pick]").forEach(r =>
            r.addEventListener("change", () => { confirmBtn.disabled = false; })
          );
          document.getElementById("col-set-cancel").addEventListener("click", closeModal);
          confirmBtn.addEventListener("click", async () => {
            const sel = modalContent.querySelector("input[name=col-set-pick]:checked");
            if (!sel) return;
            const status = document.getElementById("col-set-status");
            confirmBtn.disabled = true;
            confirmBtn.textContent = "Adding…";
            try {
              const res = await apiFetch(`/api/collections/${id}/sets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ set_id: Number(sel.value) }),
              });
              if (!res.added) { status.textContent = "Already in this collection."; status.className = "notes-status"; setTimeout(closeModal, 900); return; }
              // Refresh the expanded view
              closeModal();
              tunesDiv.classList.add("hidden");
              btn.textContent = "View";
              btn.click(); // re-expand to show updated content
            } catch {
              status.textContent = "Failed — please try again.";
              confirmBtn.disabled = false;
              confirmBtn.textContent = "Add Set";
            }
          });
        });

        tunesDiv.querySelectorAll(".tune-open-btn").forEach(tb => {
            tb.addEventListener("click", async () => {
              await Promise.all([fetchSets(), fetchCollections()]);
              const tune = await fetchTune(tb.dataset.tuneId);
              renderModal(tune);
              modalOverlay.classList.remove("hidden");
              document.body.style.overflow = "hidden";
            });
          });

          tunesDiv.querySelectorAll(".remove-from-col").forEach(rb => {
            rb.addEventListener("click", async () => {
              rb.disabled = true;
              try {
                await apiRemoveTuneFromCollection(rb.dataset.colId, rb.dataset.tuneId);
                rb.closest(".set-tune-row").remove();
              } catch {
                alert("Failed to remove tune. Please try again.");
                rb.disabled = false;
              }
            });
          });

          tunesDiv.querySelectorAll(".remove-from-col-set").forEach(rb => {
            rb.addEventListener("click", async () => {
              rb.disabled = true;
              try {
                await apiFetch(`/api/collections/${rb.dataset.colId}/sets/${rb.dataset.setId}`, { method: "DELETE" });
                rb.closest(".set-tune-row").remove();
              } catch {
                alert("Failed to remove set. Please try again.");
                rb.disabled = false;
              }
            });
          });

          // Strip chord symbols
          const stripBtn = tunesDiv.querySelector(".col-strip-btn");
          if (stripBtn) {
            stripBtn.addEventListener("click", async () => {
              const name = stripBtn.closest(".set-card").querySelector(".set-name").textContent;
              if (!confirm(`Strip guitar chord symbols from all ABC tunes in "${name}"?\nThis edits the ABC directly and cannot be undone.`)) return;
              stripBtn.disabled = true;
              stripBtn.textContent = "Stripping…";
              try {
                const res = await apiFetch(`/api/collections/${id}/strip-chords`, { method: "POST" });
                stripBtn.textContent = `Done — ${res.stripped} tune${res.stripped !== 1 ? "s" : ""} updated`;
                setTimeout(() => { stripBtn.textContent = "Strip chord symbols"; stripBtn.disabled = false; }, 3000);
              } catch {
                alert("Failed. Please try again.");
                stripBtn.textContent = "Strip chord symbols";
                stripBtn.disabled = false;
              }
            });
          }
      } else {
        tunesDiv.classList.add("hidden");
        btn.textContent = "View";
      }
    });
  });


  collectionsList.querySelectorAll(".col-strip-btn").forEach(stripBtn => {
    stripBtn.addEventListener("click", async () => {
      const colId = stripBtn.dataset.colId;
      const name = stripBtn.closest(".set-card").querySelector(".set-name").textContent;
      if (!confirm(`Strip guitar chord symbols from all ABC tunes in "${name}"?\nThis edits the ABC directly and cannot be undone.`)) return;
      stripBtn.disabled = true;
      stripBtn.textContent = "Stripping…";
      try {
        const res = await apiFetch(`/api/collections/${colId}/strip-chords`, { method: "POST" });
        stripBtn.textContent = `Done — ${res.stripped} tune${res.stripped !== 1 ? "s" : ""} updated`;
        setTimeout(() => { stripBtn.textContent = "Strip chord symbols"; stripBtn.disabled = false; }, 3000);
      } catch {
        alert("Failed. Please try again.");
        stripBtn.textContent = "Strip chord symbols";
        stripBtn.disabled = false;
      }
    });
  });

  collectionsList.querySelectorAll(".col-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const name = btn.closest(".set-card").querySelector(".set-name").textContent;
      if (!confirm(`Delete collection "${name}"?`)) return;
      btn.disabled = true;
      try {
        await apiDeleteCollection(btn.dataset.colId);
        btn.closest(".set-card").remove();
        state.collections = state.collections.filter(c => String(c.id) !== String(btn.dataset.colId));
        if (!collectionsList.querySelector(".set-card")) {
          collectionsList.innerHTML = '<p class="empty">No collections yet. Create one to group tunes by theme!</p>';
        }
      } catch {
        alert("Failed to delete collection. Please try again.");
        btn.disabled = false;
      }
    });
  });
}

// ── Recently Imported smart collection ───────────────────────────────────────
(function () {
  let _recentDays = 7;

  const rangeButtons  = document.querySelectorAll(".smart-range-btn");
  const daysInput     = document.getElementById("recent-days-input");
  const countEl       = document.getElementById("recent-imports-count");
  const listEl        = document.getElementById("recent-imports-list");

  function relativeDate(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr.replace(" ", "T") + "Z");
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    return `${diffDays} days ago`;
  }

  async function loadRecent(days) {
    _recentDays = days;
    countEl.textContent = "";
    listEl.innerHTML = '<p class="loading" style="padding:.5rem 0">Loading…</p>';
    listEl.classList.remove("hidden");
    try {
      const res = await fetch(`/api/tunes/recent?days=${days}`);
      const tunes = await res.json();
      countEl.textContent = `${tunes.length} tune${tunes.length === 1 ? "" : "s"}`;
      if (!tunes.length) {
        listEl.innerHTML = `<p class="empty" style="padding:.5rem 0">No tunes imported in this period.</p>`;
        return;
      }
      listEl.innerHTML = tunes.map(t => `
        <div class="set-tune-row">
          <button class="set-tune-title tune-open-btn" data-tune-id="${t.id}">${escHtml(t.title)}</button>
          <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
          <span class="badge badge-key">${escHtml(t.key || "")}</span>
          <span class="recent-import-date">${relativeDate(t.imported_at)}</span>
        </div>`).join("");
      // wire up tune-open buttons
      listEl.querySelectorAll(".tune-open-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const tune = await fetchTune(btn.dataset.tuneId);
          await Promise.all([fetchSets(), fetchCollections()]);
          // If this tune is a version (has a parent), open the parent's versions panel
          // so the user sees the full tune page with all versions, not a blank entry.
          if (tune.parent_id) {
            const { versions } = await apiFetch(`/api/tunes/${tune.parent_id}/versions`);
            if (versions && versions.length > 0) {
              const defaultVer = versions.find(v => v.is_default) || versions[0];
              const parentTune = await fetchTune(defaultVer.id);
              renderModal(parentTune, () => renderVersionsPanel(tune.parent_id), versions);
            } else {
              renderModal(tune);
            }
          } else {
            renderModal(tune);
          }
          modalOverlay.classList.remove("hidden");
          document.body.style.overflow = "hidden";
        });
      });
    } catch {
      listEl.innerHTML = '<p class="empty" style="padding:.5rem 0">Failed to load.</p>';
    }
  }

  // Range preset buttons
  rangeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      rangeButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const days = Number(btn.dataset.days);
      daysInput.value = days;
      loadRecent(days);
    });
  });

  // Custom days input
  let _debounce;
  daysInput.addEventListener("input", () => {
    const days = Math.max(1, Math.min(365, Number(daysInput.value) || 1));
    rangeButtons.forEach(b => b.classList.remove("active"));
    clearTimeout(_debounce);
    _debounce = setTimeout(() => loadRecent(days), 400);
  });

  // Hide / Show button
  const hideBtn = document.getElementById("recent-imports-hide-btn");
  if (hideBtn) {
    hideBtn.addEventListener("click", () => {
      const hidden = listEl.classList.toggle("hidden");
      hideBtn.textContent = hidden ? "Show" : "Hide";
    });
  }

  // Expose so loadCollections can trigger a refresh
  window._loadRecentImports = () => loadRecent(_recentDays);
})();

async function loadCollections() {
  collectionsList.innerHTML = '<p class="loading">Loading collections…</p>';
  try {
    const collections = await fetchCollections();
    renderCollections(collections);
  } catch {
    collectionsList.innerHTML = '<p class="empty">Failed to load collections.</p>';
  }
  if (window._loadRecentImports) window._loadRecentImports();
}

// ── Loaders ───────────────────────────────────────────────────────────────────
async function loadFilters() {
  let types, keys, modes;
  try {
    ({ types, keys, modes, composers } = await fetchFilters());
  } catch { return; }
  if (!types) return;

  // Clear existing options (except placeholder) to allow safe re-calling
  filterType.innerHTML = '<option value="">All types</option>';
  filterKey.innerHTML  = '<option value="">All keys</option>';
  filterMode.innerHTML = '<option value="">All modes</option>';
  if (filterComposer) filterComposer.innerHTML = '<option value="">All composers</option>';

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
  (composers || []).forEach(c => {
    if (!filterComposer) return;
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    filterComposer.appendChild(o);
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
  _showPendingTransferBanner();
  try {
    const data = await fetchTunes();
    renderTunes(data);
  } catch (err) {
    tuneList.innerHTML = '<p class="empty">Failed to load tunes. Is the server running?</p>';
    console.error(err);
  }
  // Check for version suggestions once per page-1 load (no filters active)
  if (state.page === 1 && !state.q && !state.type && !state.key) {
    _checkVersionSuggestions();
  }
}

// ── Version similarity suggestions ────────────────────────────────────────────
const _vsbEl = document.getElementById("version-suggestion-banner");
let _vsbQueue = null;  // cached list; null = not yet fetched

async function _checkVersionSuggestions() {
  if (_vsbEl.classList.contains("hidden") === false) return; // already showing one
  try {
    if (_vsbQueue === null) {
      const list = await apiFetch("/api/tunes/version-suggestions");
      _vsbQueue = list;
    }
    _showNextVersionSuggestion();
  } catch { /* silently ignore */ }
}

function _showNextVersionSuggestion() {
  if (!_vsbQueue || !_vsbQueue.length) { _vsbEl.classList.add("hidden"); return; }
  const { tune_a, tune_b } = _vsbQueue[0];
  _vsbEl.innerHTML = `
    <span class="vsb-text">
      💡 <strong>${escHtml(tune_a.title)}</strong> and <strong>${escHtml(tune_b.title)}</strong>
      look like the same tune — group as versions?
    </span>
    <span class="vsb-actions">
      <button class="btn-primary btn-sm" id="vsb-group-btn">Group as versions</button>
      <button class="btn-secondary btn-sm" id="vsb-dismiss-btn">Not the same</button>
    </span>`;
  _vsbEl.classList.remove("hidden");

  document.getElementById("vsb-group-btn").addEventListener("click", async () => {
    _vsbEl.classList.add("hidden");
    const tunes = await Promise.all([fetchTune(tune_a.id), fetchTune(tune_b.id)]);
    await Promise.all([fetchSets(), fetchCollections()]);
    _showGroupDialog(tunes);
    // Remove from queue (user will decide in the dialog; if they cancel we don't re-show)
    _vsbQueue.shift();
  });

  document.getElementById("vsb-dismiss-btn").addEventListener("click", async () => {
    _vsbEl.classList.add("hidden");
    _vsbQueue.shift();
    try {
      await apiFetch("/api/tunes/version-suggestions/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tune_id_a: tune_a.id, tune_id_b: tune_b.id }),
      });
    } catch { /* persist best-effort */ }
    // Show next suggestion if any (after a short pause so it doesn't feel jarring)
    setTimeout(_showNextVersionSuggestion, 400);
  });
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
        <button class="btn-icon note-att-del" data-att-id="${a.id}" title="Remove attachment">🗑</button>
      </div>`;
    } else {
      return `<div class="note-att-row" data-att-id="${a.id}">
        <a href="${escHtml(a.url)}" target="_blank" class="note-att-link">🔗 ${escHtml(a.title || a.url)}</a>
        <button class="btn-icon note-att-del" data-att-id="${a.id}" title="Remove attachment">🗑</button>
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
if (filterComposer) filterComposer.addEventListener("change", () => { state.composer = filterComposer.value; state.page = 1; loadTunes(); });

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

filterFavouriteBtn.addEventListener("click", () => {
  state.favourite = !state.favourite;
  filterFavouriteBtn.classList.toggle("active", state.favourite);
  state.page = 1;
  loadTunes();
});

// ── Print list ────────────────────────────────────────────────────────────────
document.getElementById("print-btn").addEventListener("click", async () => {
  // Open the window synchronously (must happen before any await to avoid popup blockers)
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow popups for this page to use Print."); return; }
  win.document.write("<p>Loading…</p>");

  const params = new URLSearchParams({ page: 1, page_size: 9999 });
  if (state.q)          params.set("q",          state.q);
  if (state.type)       params.set("type",        state.type);
  if (state.key)        params.set("key",         state.key);
  if (state.mode)       params.set("mode",        state.mode);
  if (state.hitlist)    params.set("hitlist",     "1");
  if (state.min_rating) params.set("min_rating",  state.min_rating);

  const { tunes } = await apiFetch(`/api/tunes?${params}`);

  // Build a human-readable description of the active filters
  const parts = [];
  if (state.q)          parts.push(`"${state.q}"`);
  if (state.type)       parts.push(state.type.charAt(0).toUpperCase() + state.type.slice(1) + "s");
  if (state.key)        parts.push(state.key);
  if (state.mode)       parts.push(state.mode);
  if (state.hitlist)    parts.push("Hitlist");
  if (state.min_rating) parts.push(`${state.min_rating}★+`);
  const filterDesc = parts.length ? parts.join(" · ") : "Full library";
  const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const rows = tunes.map((t, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="title">${escHtml(t.title)}</td>
      <td>${escHtml(t.type || "")}</td>
      <td>${escHtml(t.key  || "")}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ceòl —${escHtml(filterDesc)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, "Segoe UI", sans-serif; font-size: 11pt;
           color: #111; background: #fff; padding: 1.8cm 2cm; }
    h1   { font-size: 18pt; font-weight: 700; margin-bottom: .25rem; }
    .meta { font-size: 9.5pt; color: #555; margin-bottom: 1.4rem; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; font-size: 8.5pt; text-transform: uppercase;
               letter-spacing: .07em; color: #555; padding: 0 .6rem .4rem 0;
               border-bottom: 2px solid #111; }
    tbody tr:nth-child(even) { background: #f7f7f7; }
    td   { padding: .32rem .6rem .32rem 0; vertical-align: top;
           border-bottom: 1px solid #e5e5e5; }
    tr:last-child td { border-bottom: none; }
    td.num   { color: #aaa; font-size: 8.5pt; width: 2rem; padding-left: .1rem; }
    td.title { font-weight: 600; }
    @media print {
      body { padding: 1cm 1.2cm; }
      tbody tr:nth-child(even) { background: #f5f5f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <h1>Ceòl —Tune List</h1>
  <p class="meta">${escHtml(filterDesc)} &nbsp;·&nbsp; ${tunes.length} tune${tunes.length !== 1 ? "s" : ""} &nbsp;·&nbsp; ${escHtml(dateStr)}</p>
  <table>
    <thead><tr><th>#</th><th>Title</th><th>Type</th><th>Key</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
});

clearBtn.addEventListener("click", () => {
  searchEl.value = "";
  filterType.value = filterKey.value = filterMode.value = filterRating.value = "";
  if (filterComposer) filterComposer.value = "";
  filterHitlistBtn.classList.remove("active");
  filterFavouriteBtn.classList.remove("active");
  Object.assign(state, { page: 1, q: "", type: "", key: "", mode: "", composer: "", hitlist: false, favourite: false, min_rating: 0 });
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

  // Favourite toggle on card
  const favBtn = e.target.closest(".fav-btn");
  if (favBtn && !_selectMode) {
    e.stopPropagation();
    const card = favBtn.closest(".tune-card");
    const tuneId = card.dataset.id;
    const is_favourite = favBtn.classList.contains("active") ? 0 : 1;
    try {
      await apiFetch(`/api/tunes/${tuneId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favourite }),
      });
      card.dataset.favourite = is_favourite;
      favBtn.classList.toggle("active", Boolean(is_favourite));
      favBtn.title = is_favourite ? "Remove from favourites" : "Add to favourites";
    } catch { /* silently ignore */ }
    return;
  }

  const delBtn = e.target.closest(".tune-delete-btn");
  if (delBtn) {
    e.stopPropagation();
    const id = delBtn.dataset.id;
    const title = delBtn.closest(".tune-card")?.querySelector(".card-title")?.textContent || "this tune";
    delBtn.disabled = true;
    await _confirmDeleteWithTransfer(id, title, async () => {
      try {
        await apiDeleteTune(id);
        loadTunes();
      } catch {
        alert("Failed to delete tune. Please try again.");
        delBtn.disabled = false;
      }
    });
    delBtn.disabled = false;
    return;
  }

  if (!card) return;
  if (Number(card.dataset.versions || 0) > 0) {
    // Auto-open the first version with a switcher strip for the others
    const { versions } = await apiFetch(`/api/tunes/${card.dataset.id}/versions`);
    if (versions.length > 0) {
      await Promise.all([fetchSets(), fetchCollections()]);
      const defaultVer = versions.find(v => v.is_default) || versions[0];
      const firstTune = await fetchTune(defaultVer.id);
      const parentId = Number(card.dataset.id);
      renderModal(firstTune, () => renderVersionsPanel(parentId), versions);
      modalOverlay.classList.remove("hidden");
      document.body.style.overflow = "hidden";
    }
    return;
  }
  await Promise.all([fetchSets(), fetchCollections()]); // ensure fresh data for modal dropdowns
  const tune = await fetchTune(card.dataset.id);
  renderModal(tune);
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});

tuneList.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") e.target.click();
});

modalClose.addEventListener("click", () => {
  const bldrBack = document.getElementById("bldr-back");
  if (bldrBack) bldrBack.click(); else closeModal();
});
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    const bldrBack = document.getElementById("bldr-back");
    if (bldrBack) bldrBack.click(); else { closeModal(); closeImport(); }
  }
});

function closeModal() {
  if (_synthController) { try { _synthController.pause(); } catch {} }
  if (_previewSynthCtrl) { try { _previewSynthCtrl.stop(); } catch {} _previewSynthCtrl = null; }
  if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} _setMusicSynth = null; }
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

// Note: bar-selection click listener is attached inside renderSheetMusic (capture phase).

// ── Nav ───────────────────────────────────────────────────────────────────────
navLibrary.addEventListener("click",      () => switchView("library"));
navSets.addEventListener("click",         () => switchView("sets"));
navCollections.addEventListener("click",  () => switchView("collections"));
navNotes.addEventListener("click",        () => switchView("notes"));
navAchievements.addEventListener("click", () => switchView("achievements"));

// More ▾ dropdown (desktop nav)
if (navMoreBtn && navMoreMenu) {
  navMoreBtn.addEventListener("click", e => {
    e.stopPropagation();
    navMoreMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", () => navMoreMenu.classList.add("hidden"));
}

// ── New note document ─────────────────────────────────────────────────────────
newDocBtn.addEventListener("click", async () => {
  const doc = await apiCreateNoteDocument("Untitled");
  _currentDocId = doc.id;
  await loadNoteDocuments();
});

// ── Circle of Fifths Set Builder ──────────────────────────────────────────────

function _bldrFilterSummary(filters) {
  const parts = [];
  if (filters.type) parts.push(`Type: <strong>${escHtml(filters.type)}</strong>`);
  if (filters.minRating) parts.push(`Min rating: <strong>${"★".repeat(Number(filters.minRating))}</strong>`);
  if (filters.collectionName) parts.push(`Collection: <strong>${escHtml(filters.collectionName)}</strong>`);
  return parts.length ? `<p class="modal-hint bldr-active-filters">${parts.join(" · ")}</p>` : "";
}

const _BLDR_TYPES = [
  "reel","jig","hornpipe","slip jig","polka","march",
  "waltz","strathspey","slide","barndance","air","slow air",
];

function showSetBuilder() {
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  _bldrHome();
}

async function _bldrHome() {
  const typeOpts = _BLDR_TYPES.map(t =>
    `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
  ).join("");

  modalContent.innerHTML = `
    <button class="modal-back-btn" id="bldr-back">← Close</button>
    <h2 class="modal-title">Build a Set</h2>
    <p class="modal-hint">Start from a template or pick tunes step by step using the Circle of Fifths.</p>

    <div class="bldr-filter-bar">
      <div class="bldr-type-row">
        <label class="bldr-label">Type</label>
        <select id="bldr-type" class="bldr-type-select">
          <option value="">All types</option>
          ${typeOpts}
        </select>
      </div>
      <div class="bldr-type-row">
        <label class="bldr-label">Min rating</label>
        <select id="bldr-rating" class="bldr-type-select">
          <option value="">Any rating</option>
          <option value="1">1+ ★</option>
          <option value="2">2+ ★★</option>
          <option value="3">3+ ★★★</option>
          <option value="4">4+ ★★★★</option>
          <option value="5">5 ★★★★★</option>
        </select>
      </div>
      <div class="bldr-type-row">
        <label class="bldr-label">Collection</label>
        <select id="bldr-collection" class="bldr-type-select">
          <option value="">All collections</option>
        </select>
      </div>
    </div>

    <h3 class="bldr-section-title">Templates</h3>
    <div class="bldr-templates" id="bldr-templates"><p class="modal-hint" style="font-style:italic">Loading…</p></div>

    <h3 class="bldr-section-title">Step by step</h3>
    <p class="modal-hint">Pick your first tune — Ceòl suggests compatible keys for every tune after that.</p>
    <button class="btn-primary" id="bldr-step-btn">Choose first tune →</button>`;

  document.getElementById("bldr-back").addEventListener("click", closeModal);

  // Populate collections dropdown
  const collectionEl = document.getElementById("bldr-collection");
  try {
    const cols = await apiFetch("/api/collections");
    cols.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      collectionEl.appendChild(opt);
    });
  } catch (_) { /* ignore */ }

  function getFilters() {
    const collEl = document.getElementById("bldr-collection");
    return {
      type: document.getElementById("bldr-type").value,
      minRating: document.getElementById("bldr-rating").value,
      collectionId: collEl.value,
      collectionName: collEl.value ? collEl.options[collEl.selectedIndex].text : "",
    };
  }

  async function loadTemplates() {
    const f = getFilters();
    const p = new URLSearchParams();
    if (f.type) p.set("type", f.type);
    if (f.minRating) p.set("min_rating", f.minRating);
    if (f.collectionId) p.set("collection_id", f.collectionId);
    const qs = p.toString() ? `?${p}` : "";
    const templates = await apiFetch(`/api/circle-of-fifths/templates${qs}`);
    _bldrRenderTemplates(templates, getFilters());
  }

  document.getElementById("bldr-type").addEventListener("change", loadTemplates);
  document.getElementById("bldr-rating").addEventListener("change", loadTemplates);
  collectionEl.addEventListener("change", loadTemplates);
  loadTemplates();

  document.getElementById("bldr-step-btn").addEventListener("click", () => {
    _bldrPickFirst(getFilters());
  });
}

function _bldrRenderTemplates(templates, filters) {
  const el = document.getElementById("bldr-templates");
  if (!el) return;
  el.innerHTML = templates.map(t => {
    const slotHtml = t.slots.map((key, i) => {
      const count = t.slot_counts[i] ?? 0;
      return `<span class="bldr-tmpl-slot">
        <span class="badge ${keyBadgeClass(key)}">${escHtml(key)}</span>
        <span class="bldr-tmpl-count">${count}</span>
      </span>`;
    }).join('<span class="bldr-tmpl-arrow">→</span>');
    return `<div class="bldr-tmpl-card" data-tmpl-id="${t.id}">
      <div class="bldr-tmpl-name">${escHtml(t.name)}</div>
      <div class="bldr-tmpl-desc">${escHtml(t.description)}</div>
      <div class="bldr-tmpl-slots">${slotHtml}</div>
    </div>`;
  }).join("");

  el.querySelectorAll(".bldr-tmpl-card").forEach(card => {
    card.addEventListener("click", () => {
      const tmpl = templates.find(t => t.id === Number(card.dataset.tmplId));
      _bldrTemplateMode(tmpl, filters);
    });
  });
}

async function _bldrTemplateMode(template, filters) {
  const type = filters.type || "";
  const slotTunes = await Promise.all(template.slots.map(key => {
    const p = new URLSearchParams({ key, page_size: 500 });
    if (type) p.set("type", type);
    if (filters.minRating) p.set("min_rating", filters.minRating);
    if (filters.collectionId) p.set("collection_id", filters.collectionId);
    return apiFetch(`/api/tunes?${p}`).then(r => r.tunes || []);
  }));

  const selections = template.slots.map(() => null);

  function render() {
    const slotsHtml = template.slots.map((key, i) => {
      const tunes = slotTunes[i];
      const sel = selections[i];
      const tuneRows = tunes.map(t => `
        <button class="bldr-slot-tune${sel?.id === t.id ? " selected" : ""}"
                data-slot="${i}" data-tune-id="${t.id}">
          <span class="bldr-slot-tune-title">${escHtml(t.title)}</span>
          <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
        </button>`).join("");

      return `<div class="bldr-slot">
        <div class="bldr-slot-header">
          <span class="bldr-slot-num">Tune ${i + 1}</span>
          <span class="badge ${keyBadgeClass(key)}">${escHtml(key)}</span>
          ${sel
            ? `<span class="bldr-slot-selected">✓ ${escHtml(sel.title)}</span>`
            : `<span class="bldr-slot-none">none selected</span>`}
        </div>
        <div class="bldr-slot-list">${tunes.length ? tuneRows : '<p class="bldr-empty">No tunes in this key.</p>'}</div>
      </div>`;
    }).join("");

    const chosen = selections.filter(Boolean);
    modalContent.innerHTML = `
      <button class="modal-back-btn" id="bldr-back">← Back</button>
      <h2 class="modal-title">${escHtml(template.name)}</h2>
      <p class="modal-hint">${escHtml(template.description)}</p>
      ${_bldrFilterSummary(filters)}
      <div class="bldr-slots">${slotsHtml}</div>
      <div class="bldr-actions">
        <button id="bldr-preview-btn" class="btn-secondary" ${chosen.length ? "" : "disabled"}>▶ Preview</button>
        <button id="bldr-save-btn" class="btn-primary" ${chosen.length ? "" : "disabled"}>Save set</button>
      </div>`;

    document.getElementById("bldr-back").addEventListener("click", _bldrHome);

    modalContent.querySelectorAll(".bldr-slot-tune").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.slot);
        const stub = slotTunes[idx].find(t => t.id === Number(btn.dataset.tuneId));
        if (!stub) return;
        selections[idx] = await apiFetch(`/api/tunes/${stub.id}`);
        render();
      });
    });

    if (chosen.length) {
      document.getElementById("bldr-preview-btn").addEventListener("click", () => {
        const abc = buildCombinedPlaybackAbc(chosen);
        if (abc) openSetMusicModal(`Preview: ${template.name}`, abc, { onBack: render });
        else { const b = document.getElementById("bldr-preview-btn"); b.textContent = "No ABC available"; b.disabled = true; }
      });
      document.getElementById("bldr-save-btn").addEventListener("click", () => {
        _bldrSave(chosen, template.name, render);
      });
    }
  }

  render();
}

async function _bldrPickFirst(filters) {
  const apiFilters = await apiFetch("/api/filters");
  const keys = apiFilters.keys || [];
  let keyFilter = "";
  let tunes = [];

  async function loadTunes() {
    const p = new URLSearchParams({ page_size: 500 });
    if (filters.type) p.set("type", filters.type);
    if (filters.minRating) p.set("min_rating", filters.minRating);
    if (filters.collectionId) p.set("collection_id", filters.collectionId);
    if (keyFilter) p.set("key", keyFilter);
    const data = await apiFetch(`/api/tunes?${p}`);
    tunes = data.tunes || [];
    renderList();
  }

  function renderList() {
    const listEl = document.getElementById("bldr-tune-list");
    if (!listEl) return;
    if (!tunes.length) { listEl.innerHTML = '<p class="bldr-empty">No tunes found.</p>'; return; }
    listEl.innerHTML = tunes.map(t => `
      <button class="bldr-slot-tune" data-tune-id="${t.id}">
        <span class="bldr-slot-tune-title">${escHtml(t.title)}</span>
        <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
        <span class="badge ${keyBadgeClass(t.key)}">${escHtml(t.key || "")}</span>
      </button>`).join("");
    listEl.querySelectorAll(".bldr-slot-tune").forEach(btn => {
      btn.addEventListener("click", async () => {
        const stub = tunes.find(t => String(t.id) === btn.dataset.tuneId);
        if (!stub) return;
        const fullTune = await apiFetch(`/api/tunes/${stub.id}`);
        const finalFilters = { ...filters, type: filters.type || fullTune.type || "" };
        _bldrStepMode([fullTune], finalFilters);
      });
    });
  }

  const keyOpts = keys.map(k => `<option value="${k}">${escHtml(k)}</option>`).join("");
  modalContent.innerHTML = `
    <button class="modal-back-btn" id="bldr-back">← Back</button>
    <h2 class="modal-title">Choose your first tune</h2>
    ${_bldrFilterSummary(filters)}
    <div class="bldr-filter-row">
      <select id="bldr-key-filter" class="bldr-type-select">
        <option value="">All keys</option>
        ${keyOpts}
      </select>
    </div>
    <div class="bldr-slot-list" id="bldr-tune-list"><p class="modal-hint" style="font-style:italic">Loading…</p></div>`;

  document.getElementById("bldr-back").addEventListener("click", _bldrHome);
  document.getElementById("bldr-key-filter").addEventListener("change", e => {
    keyFilter = e.target.value;
    loadTunes();
  });
  loadTunes();
}

async function _bldrStepMode(selectedTunes, filters, onFirstBack = null) {
  const type = filters.type || "";
  const lastTune = selectedTunes[selectedTunes.length - 1];
  const p = new URLSearchParams({ key: lastTune.key || "" });
  if (type) p.set("type", type);
  if (filters.minRating) p.set("min_rating", filters.minRating);
  if (filters.collectionId) p.set("collection_id", filters.collectionId);
  const compatData = await apiFetch(`/api/circle-of-fifths/compatible?${p}`);
  const groups = compatData.groups || [];

  function render() {
    const currentHtml = selectedTunes.map((t, i) => `
      <div class="bldr-current-tune">
        <span class="bldr-current-pos">${i + 1}.</span>
        <span class="bldr-current-title">${escHtml(t.title)}</span>
        <span class="badge ${keyBadgeClass(t.key)}">${escHtml(t.key || "")}</span>
        <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
      </div>`).join("");

    const groupsHtml = groups.map((g, gi) => {
      const keyBadges = g.keys.map(k => `<span class="badge ${keyBadgeClass(k)}">${escHtml(k)}</span>`).join(" ");
      const tuneRows = g.tunes.map(t => `
        <button class="bldr-slot-tune" data-group="${gi}" data-tune-id="${t.id}">
          <span class="bldr-slot-tune-title">${escHtml(t.title)}</span>
          <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
          <span class="badge ${keyBadgeClass(t.key)}">${escHtml(t.key || "")}</span>
        </button>`).join("");
      return `<div class="bldr-compat-group">
        <div class="bldr-compat-group-header">
          <span class="bldr-compat-rel">${escHtml(g.relationship)}</span>
          <span class="bldr-compat-keys">${keyBadges}</span>
        </div>
        <div class="bldr-slot-list">${tuneRows}</div>
      </div>`;
    }).join("");

    modalContent.innerHTML = `
      <button class="modal-back-btn" id="bldr-back">← Back</button>
      <h2 class="modal-title">What comes next?</h2>
      <p class="modal-hint">Last tune: <span class="badge ${keyBadgeClass(lastTune.key)}">${escHtml(lastTune.key || "?")}</span> <strong>${escHtml(lastTune.title)}</strong></p>
      ${_bldrFilterSummary(filters)}
      <div class="bldr-current-set">${currentHtml}</div>
      <div class="bldr-actions-row">
        <button id="bldr-preview-btn" class="btn-secondary">▶ Preview</button>
        <button id="bldr-save-btn" class="btn-secondary">Save set</button>
      </div>
      <h3 class="bldr-section-title">Compatible next tunes</h3>
      ${groups.length
        ? groupsHtml
        : `<p class="bldr-empty">No compatible tunes found in your library for <strong>${escHtml(lastTune.key || "this key")}</strong>.</p>`}`;

    document.getElementById("bldr-back").addEventListener("click", () => {
      if (selectedTunes.length > 1) _bldrStepMode(selectedTunes.slice(0, -1), filters, onFirstBack);
      else if (onFirstBack) onFirstBack();
      else _bldrPickFirst(filters);
    });

    document.getElementById("bldr-preview-btn").addEventListener("click", () => {
      const abc = buildCombinedPlaybackAbc(selectedTunes);
      if (abc) openSetMusicModal("Preview", abc, { onBack: render });
      else { const b = document.getElementById("bldr-preview-btn"); b.textContent = "No ABC available"; b.disabled = true; }
    });

    document.getElementById("bldr-save-btn").addEventListener("click", () => {
      const defaultName = selectedTunes.map(t => t.key || t.title).join(" · ");
      _bldrSave(selectedTunes, defaultName, render);
    });

    modalContent.querySelectorAll(".bldr-slot-tune").forEach(btn => {
      btn.addEventListener("click", () => {
        const gi = Number(btn.dataset.group);
        const tune = groups[gi].tunes.find(t => t.id === Number(btn.dataset.tuneId));
        if (tune) _bldrStepMode([...selectedTunes, tune], filters, onFirstBack);
      });
    });
  }

  render();
}

function _bldrSave(tunes, defaultName, onBack) {
  modalContent.innerHTML = `
    <button class="modal-back-btn" id="bldr-back">← Back</button>
    <h2 class="modal-title">Save set</h2>
    <div class="bldr-save-preview">
      ${tunes.map((t, i) => `
        <div class="bldr-current-tune">
          <span class="bldr-current-pos">${i + 1}.</span>
          <span class="bldr-current-title">${escHtml(t.title)}</span>
          <span class="badge ${keyBadgeClass(t.key)}">${escHtml(t.key || "")}</span>
          <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
        </div>`).join("")}
    </div>
    <div class="create-set-form">
      <label class="create-set-label">Set name</label>
      <input id="bldr-set-name" class="create-set-input" type="text" value="${escHtml(defaultName)}" maxlength="120">
      <div class="create-set-actions">
        <button id="bldr-confirm-save" class="btn-primary">Save set</button>
        <button id="bldr-cancel-save" class="btn-secondary">Cancel</button>
        <span id="bldr-save-status" class="set-status"></span>
      </div>
    </div>`;

  const nameInput = document.getElementById("bldr-set-name");
  nameInput.focus();
  nameInput.select();

  document.getElementById("bldr-back").addEventListener("click", onBack);
  document.getElementById("bldr-cancel-save").addEventListener("click", onBack);

  document.getElementById("bldr-confirm-save").addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const status = document.getElementById("bldr-save-status");
    const btn = document.getElementById("bldr-confirm-save");
    btn.disabled = true;
    status.textContent = "Saving…";
    try {
      const newSet = await apiCreateSet(name, "");
      for (const tune of tunes) await apiAddTuneToSet(newSet.id, tune.id);
      await fetchSets();
      status.textContent = "Set saved!";
      status.className = "set-status set-saved";
      setTimeout(closeModal, 900);
    } catch (e) {
      status.textContent = e.message || "Failed.";
      status.className = "set-status set-error";
      btn.disabled = false;
    }
  });

  nameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("bldr-confirm-save").click();
  });
}

document.getElementById("build-set-btn").addEventListener("click", showSetBuilder);

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

// ── Collections form ──────────────────────────────────────────────────────────
newCollectionBtn.addEventListener("click", () => {
  newCollectionForm.classList.remove("hidden");
  newCollectionName.focus();
});

cancelCollectionBtn.addEventListener("click", () => {
  newCollectionForm.classList.add("hidden");
  newCollectionName.value = "";
  newCollectionDesc.value = "";
});

createCollectionBtn.addEventListener("click", async () => {
  const name = newCollectionName.value.trim();
  if (!name) { newCollectionName.focus(); return; }
  createCollectionBtn.disabled = true;
  try {
    const col = await apiCreateCollection(name, newCollectionDesc.value.trim());
    state.collections.push({ ...col, tune_count: 0 });
    newCollectionForm.classList.add("hidden");
    newCollectionName.value = "";
    newCollectionDesc.value = "";
    loadCollections();
  } finally {
    createCollectionBtn.disabled = false;
  }
});

newCollectionName.addEventListener("keydown", e => { if (e.key === "Enter") createCollectionBtn.click(); });

// ── Discography scanner ───────────────────────────────────────────────────────
{
  const discogBtn     = document.getElementById("discography-btn");
  const discogPanel   = document.getElementById("discography-panel");
  const discogArtist  = document.getElementById("discog-artist-input");
  const discogColName = document.getElementById("discog-col-name-input");
  const discogScanBtn = document.getElementById("discog-scan-btn");
  const discogCancel  = document.getElementById("discog-cancel-btn");
  const discogStatus  = document.getElementById("discog-status");

  if (discogBtn) {
    discogBtn.addEventListener("click", () => {
      discogPanel.classList.toggle("hidden");
      if (!discogPanel.classList.contains("hidden")) discogArtist.focus();
    });
  }
  if (discogCancel) {
    discogCancel.addEventListener("click", () => {
      discogPanel.classList.add("hidden");
      discogArtist.value = "";
      discogColName.value = "";
      discogStatus.classList.add("hidden");
    });
  }

  // Quick-pick artist buttons
  document.querySelectorAll(".discog-artist-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      discogArtist.value = btn.dataset.artist;
      discogColName.value = `${btn.dataset.artist} Repertoire`;
    });
  });

  if (discogScanBtn) {
    discogScanBtn.addEventListener("click", async () => {
      const artist = discogArtist.value.trim();
      if (!artist) { discogArtist.focus(); return; }
      discogScanBtn.disabled = true;
      discogStatus.textContent = `Searching TheSession.org for "${artist}" recordings…`;
      discogStatus.className = "discog-status";
      try {
        const result = await apiFetch("/api/discography/scan", {
          method: "POST",
          body: JSON.stringify({
            artist,
            collection_name: discogColName.value.trim() || undefined,
          }),
        });
        discogStatus.textContent =
          `Done! Found ${result.session_tunes_found} tunes on TheSession, `
          + `matched ${result.matched_in_library} in your library. `
          + `Collection "${result.collection_name}" ${result.matched_in_library > 0 ? "created/updated." : "is empty."}`;
        discogStatus.classList.add("discog-ok");
        loadCollections();
      } catch (err) {
        discogStatus.textContent = `Error: ${err.message || "scan failed"}`;
        discogStatus.classList.add("discog-err");
      } finally {
        discogScanBtn.disabled = false;
      }
    });
  }
}

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
    try { _previewSynthCtrl.pause(); } catch {}
    _previewSynthCtrl = null;
  }
  _previewTuneData = null;
  _previewSettings = [];
  _activeSettingId = null;
  _checkedSettingIds = new Set();
  document.getElementById("session-preview").classList.add("hidden");
  document.getElementById("session-search-pane").classList.remove("hidden");
}

// Launch the set builder from a tune that was just imported.
// Closes the import overlay then opens the builder modal.
async function _launchBuilderFromTuneId(tuneId) {
  closeImport();
  await fetchSets();
  const tune = await apiFetch(`/api/tunes/${tuneId}`);
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  _bldrStepMode([tune], { type: tune.type || "", minRating: "", collectionId: "", collectionName: "" });
}

// Insert a "Build a Set from this tune" button immediately after `anchor` element.
// Removes any previously inserted button first (idempotent).
function _insertBuildSetBtn(anchor, tuneId) {
  anchor.parentElement?.querySelectorAll(".post-import-build-btn").forEach(el => el.remove());
  const b = document.createElement("button");
  b.textContent = "🎵 Build a Set from this tune";
  b.className = "btn-secondary btn-sm post-import-build-btn";
  b.addEventListener("click", () => _launchBuilderFromTuneId(tuneId));
  anchor.after(b);
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

// ── PDF Bulk Import ────────────────────────────────────────────────────────────
{
  const fileInput   = document.getElementById("pdf-file-input");
  const dropZone    = document.getElementById("pdf-drop-zone");
  const fileCount   = document.getElementById("pdf-file-count");
  const previewArea = document.getElementById("pdf-preview-area");
  const previewBody = document.getElementById("pdf-preview-body");
  const importBtn   = document.getElementById("pdf-import-btn");
  const resultDiv   = document.getElementById("pdf-result");

  let _selectedFiles = [];
  let _previewData   = [];  // [{filename, title, action, existing_id, existing_title}]

  function titleFromFilename(name) {
    let stem = name.replace(/\.pdf$/i, "");
    stem = stem.replace(/[_\-]+/g, " ");
    stem = stem.replace(/^\d+[\s.\-_]+/, "");
    return stem.trim().replace(/\b\w/g, c => c.toUpperCase());
  }

  async function loadPreview(files) {
    _selectedFiles = Array.from(files);
    fileCount.textContent = `${_selectedFiles.length} file${_selectedFiles.length !== 1 ? "s" : ""} selected`;
    previewArea.classList.add("hidden");
    resultDiv.classList.add("hidden");
    if (!_selectedFiles.length) return;

    // Ask backend to match against library
    const fd = new FormData();
    _selectedFiles.forEach(f => fd.append("files", f));
    let data;
    try {
      data = await apiFetch("/api/import/pdfs/preview", { method: "POST", body: fd });
    } catch (e) {
      resultDiv.textContent = `Error: ${e.message}`;
      resultDiv.className = "import-result import-error";
      resultDiv.classList.remove("hidden");
      return;
    }

    _previewData = data.files;
    previewBody.innerHTML = _previewData.map((row, i) => `
      <tr>
        <td class="pdf-col-file" title="${escHtml(row.filename)}">${escHtml(row.filename)}</td>
        <td class="pdf-col-title">
          <input class="pdf-title-input" data-idx="${i}" value="${escHtml(row.title)}" />
        </td>
        <td class="pdf-col-action">
          <select class="pdf-action-select" data-idx="${i}">
            <option value="attach" ${row.action === "attach" ? "selected" : ""}>
              Attach to: ${escHtml(row.existing_title || row.title)}
            </option>
            <option value="create" ${row.action === "create" ? "selected" : ""}>Create new tune</option>
          </select>
        </td>
      </tr>
    `).join("");
    previewArea.classList.remove("hidden");
  }

  fileInput.addEventListener("change", () => loadPreview(fileInput.files));

  // Drag and drop
  dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("import-drop-active"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("import-drop-active"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("import-drop-active");
    const pdfs = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith(".pdf"));
    loadPreview(pdfs);
  });

  importBtn.addEventListener("click", async () => {
    importBtn.disabled = true;
    importBtn.textContent = "Importing…";

    // Collect current titles and actions from the table
    const titles = _previewData.map((_, i) => {
      const el = previewBody.querySelector(`.pdf-title-input[data-idx="${i}"]`);
      return el ? el.value.trim() : _previewData[i].title;
    });
    const actions = _previewData.map((_, i) => {
      const el = previewBody.querySelector(`.pdf-action-select[data-idx="${i}"]`);
      return el ? el.value : _previewData[i].action;
    });
    const existingIds = _previewData.map(r => r.existing_id ?? null);

    const fd = new FormData();
    _selectedFiles.forEach(f => fd.append("files", f));

    const params = new URLSearchParams({
      titles: JSON.stringify(titles),
      actions: JSON.stringify(actions),
      existing_ids: JSON.stringify(existingIds),
    });

    let data;
    try {
      data = await apiFetch(`/api/import/pdfs/confirm?${params}`, { method: "POST", body: fd });
    } catch (e) {
      resultDiv.textContent = `Error: ${e.message}`;
      resultDiv.className = "import-result import-error";
      resultDiv.classList.remove("hidden");
      importBtn.disabled = false;
      importBtn.textContent = "Import";
      return;
    }

    const created  = data.results.filter(r => r.action === "created").length;
    const attached = data.results.filter(r => r.action === "attached").length;
    const parts = [];
    if (created)  parts.push(`${created} new tune${created  !== 1 ? "s" : ""} created`);
    if (attached) parts.push(`${attached} tune${attached !== 1 ? "s" : ""} updated with PDF`);
    resultDiv.textContent = parts.join(", ") + ".";
    resultDiv.className = "import-result import-success";
    resultDiv.classList.remove("hidden");
    previewArea.classList.add("hidden");
    fileCount.textContent = "";
    _selectedFiles = [];
    _previewData = [];
    fileInput.value = "";
    importBtn.disabled = false;
    importBtn.textContent = "Import";
    fetchTunes(); // refresh library
  });
}

// ── PDF Book Import ────────────────────────────────────────────────────────────
{
  const bookFileInput    = document.getElementById("book-file-input");
  const bookDropZone     = document.getElementById("book-drop-zone");
  const bookFilename     = document.getElementById("book-filename");
  const bookCollName     = document.getElementById("book-collection-name");
  const bookScanBtn      = document.getElementById("book-scan-btn");
  const bookNextBtn      = document.getElementById("book-next-btn");
  const bookStep1        = document.getElementById("book-step1");
  const bookStep2        = document.getElementById("book-step2");
  const bookStep3        = document.getElementById("book-step3");
  const bookTocHeading   = document.getElementById("book-toc-heading");
  const bookScanMsg      = document.getElementById("book-scan-msg");
  const bookTocBody      = document.getElementById("book-toc-body");
  const bookAddRowBtn    = document.getElementById("book-add-row-btn");
  const bookPasteBtn     = document.getElementById("book-paste-btn");
  const bookBackBtn      = document.getElementById("book-back-btn");
  const bookImportBtn    = document.getElementById("book-import-btn");
  const bookAbcHeading   = document.getElementById("book-abc-heading");
  const bookAbcCount     = document.getElementById("book-abc-count");
  const bookAbcBody      = document.getElementById("book-abc-body");
  const bookAbcSelectAll = document.getElementById("book-abc-select-all");
  const bookAbcBackBtn   = document.getElementById("book-abc-back-btn");
  const bookAbcImportBtn = document.getElementById("book-abc-import-btn");
  const bookResult       = document.getElementById("book-result");

  let _bookFile      = null;
  let _bookPageCount = 9999;
  let _bookRowCount  = 0;
  let _bookAbcTunes  = [];   // [{title, type, key, abc}]

  function _cleanFileStem(name) {
    return name.replace(/\.pdf$/i, "")
               .replace(/[_\-]+/g, " ")
               .replace(/^\d+[\s.\-_]+/, "")
               .trim();
  }

  function checkBookReady() {
    const ready = !!(_bookFile && bookCollName.value.trim());
    bookScanBtn.disabled = !ready;
    bookNextBtn.disabled = !ready;
  }

  function goBackToStep1() {
    bookStep2.classList.add("hidden");
    bookStep3.classList.add("hidden");
    bookStep1.classList.remove("hidden");
  }

  // ── TOC table helpers ──

  function addTocRow(title = "", start = "", end = "") {
    _bookRowCount++;
    const n = _bookRowCount;
    const tr = document.createElement("tr");
    tr.dataset.row = n;
    tr.innerHTML = `
      <td class="pdf-col-file" style="color:var(--text-muted);width:2rem">${n}</td>
      <td class="pdf-col-title"><input class="pdf-title-input book-toc-title" data-row="${n}" value="${escHtml(title)}" placeholder="Tune title" /></td>
      <td style="width:90px"><input class="book-page-input" data-row="${n}" data-field="start" type="number" min="1" value="${escHtml(String(start))}" placeholder="1" /></td>
      <td style="width:90px"><input class="book-page-input" data-row="${n}" data-field="end"   type="number" min="1" value="${escHtml(String(end))}"   placeholder="2" /></td>
      <td style="width:2rem"><button class="book-del-row" data-row="${n}" title="Remove">✕</button></td>
    `;
    bookTocBody.appendChild(tr);
    tr.querySelector('[data-field="start"]').addEventListener("change", e => {
      const endEl = tr.querySelector('[data-field="end"]');
      if (!endEl.value) endEl.value = e.target.value;
    });
    tr.querySelector(".book-del-row").addEventListener("click", () => tr.remove());
  }

  function getTocEntries() {
    return Array.from(bookTocBody.querySelectorAll("tr")).map(tr => {
      const row = tr.dataset.row;
      return {
        title:      tr.querySelector(`.book-toc-title[data-row="${row}"]`)?.value.trim() || "",
        start_page: Number(tr.querySelector(`[data-field="start"][data-row="${row}"]`)?.value) || 1,
        end_page:   Number(tr.querySelector(`[data-field="end"][data-row="${row}"]`)?.value)   || 1,
      };
    }).filter(e => e.title);
  }

  // ── File selection ──

  bookFileInput.addEventListener("change", () => {
    _bookFile = bookFileInput.files[0] || null;
    bookFilename.textContent = _bookFile ? _bookFile.name : "";
    if (_bookFile && !bookCollName.value.trim()) {
      bookCollName.value = _cleanFileStem(_bookFile.name).replace(/\b\w/g, c => c.toUpperCase());
    }
    checkBookReady();
  });

  bookDropZone.addEventListener("dragover", e => { e.preventDefault(); bookDropZone.classList.add("drop-hover"); });
  bookDropZone.addEventListener("dragleave", () => bookDropZone.classList.remove("drop-hover"));
  bookDropZone.addEventListener("drop", e => {
    e.preventDefault();
    bookDropZone.classList.remove("drop-hover");
    const f = Array.from(e.dataTransfer.files).find(f => f.name.toLowerCase().endsWith(".pdf"));
    if (f) {
      _bookFile = f;
      bookFilename.textContent = f.name;
      if (!bookCollName.value.trim()) {
        bookCollName.value = _cleanFileStem(f.name).replace(/\b\w/g, c => c.toUpperCase());
      }
      checkBookReady();
    }
  });

  bookCollName.addEventListener("input", checkBookReady);

  // ── Scan PDF ──

  bookScanBtn.addEventListener("click", async () => {
    if (!_bookFile) return;
    bookScanBtn.disabled = true;
    bookScanBtn.textContent = "Scanning…";
    bookResult.classList.add("hidden");

    const fd = new FormData();
    fd.append("file", _bookFile);

    let data;
    try {
      data = await apiFetch("/api/import/book/scan", { method: "POST", body: fd });
    } catch (e) {
      alert(`Scan failed: ${e.message}`);
      bookScanBtn.disabled = false;
      bookScanBtn.textContent = "Scan PDF →";
      return;
    }

    _bookPageCount = data.page_count || 9999;
    // Use backend-derived collection name only if the user hasn't typed one
    if (!bookCollName.value.trim() && data.collection_name) {
      bookCollName.value = data.collection_name;
    }

    bookScanBtn.disabled = false;
    bookScanBtn.textContent = "Scan PDF →";

    if (data.abc_tunes && data.abc_tunes.length > 0) {
      // Show ABC import preview (Step 3)
      _bookAbcTunes = data.abc_tunes;
      bookAbcHeading.textContent = `Tunes detected — ${bookCollName.value.trim()}`;
      bookAbcCount.textContent = `${data.abc_tunes.length} tune${data.abc_tunes.length !== 1 ? "s" : ""} found`;
      bookAbcBody.innerHTML = data.abc_tunes.map((t, i) => `
        <tr>
          <td><input type="checkbox" class="book-abc-check" data-idx="${i}" checked /></td>
          <td class="pdf-col-title"><input class="pdf-title-input book-abc-title" data-idx="${i}" value="${escHtml(t.title)}" /></td>
          <td style="color:var(--text-muted)">${escHtml(t.type || "—")}</td>
          <td style="color:var(--text-muted)">${escHtml(t.key  || "—")}</td>
        </tr>
      `).join("");
      bookAbcSelectAll.checked = true;
      bookStep1.classList.add("hidden");
      bookStep3.classList.remove("hidden");

    } else if (data.toc && data.toc.length > 0) {
      // Pre-fill TOC table (Step 2)
      bookTocHeading.textContent = `Table of contents — ${bookCollName.value.trim()}`;
      bookTocBody.innerHTML = "";
      _bookRowCount = 0;
      data.toc.forEach(e => addTocRow(e.title, e.start_page, e.end_page));
      bookScanMsg.textContent = `${data.toc.length} tune${data.toc.length !== 1 ? "s" : ""} detected from PDF bookmarks — review and edit below.`;
      bookScanMsg.style.display = "";
      bookStep1.classList.add("hidden");
      bookStep2.classList.remove("hidden");

    } else {
      // Nothing detected — open empty manual TOC
      bookTocHeading.textContent = `Table of contents — ${bookCollName.value.trim()}`;
      bookTocBody.innerHTML = "";
      _bookRowCount = 0;
      addTocRow();
      bookScanMsg.textContent = `No tunes detected automatically (${_bookPageCount}-page PDF). Enter the table of contents below.`;
      bookScanMsg.style.display = "";
      bookStep1.classList.add("hidden");
      bookStep2.classList.remove("hidden");
    }
  });

  // ── Manual entry ──

  bookNextBtn.addEventListener("click", () => {
    bookTocHeading.textContent = `Table of contents — ${bookCollName.value.trim()}`;
    bookScanMsg.style.display = "none";
    bookStep1.classList.add("hidden");
    bookStep2.classList.remove("hidden");
    if (bookTocBody.children.length === 0) addTocRow();
  });

  bookBackBtn.addEventListener("click", goBackToStep1);
  bookAbcBackBtn.addEventListener("click", goBackToStep1);
  bookAddRowBtn.addEventListener("click", () => addTocRow());

  // ── ABC select-all ──

  bookAbcSelectAll.addEventListener("change", () => {
    bookAbcBody.querySelectorAll(".book-abc-check").forEach(cb => {
      cb.checked = bookAbcSelectAll.checked;
    });
  });

  // ── Paste from clipboard ──

  bookPasteBtn.addEventListener("click", async () => {
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch (_) {
      text = prompt("Paste table of contents here:") || "";
    }
    if (!text.trim()) return;
    const maxPage = _bookPageCount;
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const parsed = [];
    lines.forEach(line => {
      let m = line.match(/^(.+?)[\t,]\s*(\d+)[\t,\s\-–]+(\d+)\s*$/);
      if (m) { parsed.push({ title: m[1].trim(), start: Number(m[2]), end: Number(m[3]) }); return; }
      m = line.match(/^(.+?)[\t,]\s*(\d+)\s*$/);
      if (m) { parsed.push({ title: m[1].trim(), start: Number(m[2]), end: Number(m[2]) }); return; }
      m = line.match(/^(.+?)\s+(\d+)\s*[-–]\s*(\d+)\s*$/);
      if (m) { parsed.push({ title: m[1].trim(), start: Number(m[2]), end: Number(m[3]) }); return; }
      m = line.match(/^(.+?)\s+(\d+)\s*$/);
      if (m) { parsed.push({ title: m[1].trim(), start: Number(m[2]), end: Number(m[2]) }); return; }
    });

    for (let i = 0; i < parsed.length - 1; i++) {
      if (parsed[i].start === parsed[i].end && parsed[i + 1].start > parsed[i].start) {
        parsed[i].end = parsed[i + 1].start - 1;
      }
    }
    if (parsed.length) parsed[parsed.length - 1].end = Math.max(parsed[parsed.length - 1].end, parsed[parsed.length - 1].start);
    parsed.forEach(p => addTocRow(p.title, p.start, Math.min(p.end, maxPage)));
  });

  // ── Import PDF-slice book ──

  bookImportBtn.addEventListener("click", async () => {
    const entries = getTocEntries();
    if (!entries.length) { alert("Add at least one tune to the table of contents."); return; }
    if (!_bookFile)      { alert("No PDF file selected."); return; }

    bookImportBtn.disabled = true;
    bookImportBtn.textContent = "Importing…";
    bookResult.classList.add("hidden");

    const fd = new FormData();
    fd.append("file", _bookFile);
    const params = new URLSearchParams({
      collection_name: bookCollName.value.trim(),
      toc: JSON.stringify(entries),
    });

    let data;
    try {
      data = await apiFetch(`/api/import/book?${params}`, { method: "POST", body: fd });
    } catch (e) {
      bookResult.textContent = `Error: ${e.message}`;
      bookResult.className = "import-result import-error";
      bookResult.classList.remove("hidden");
      bookImportBtn.disabled = false;
      bookImportBtn.textContent = "Import book";
      return;
    }

    const created  = data.results.filter(r => r.action === "created").length;
    const attached = data.results.filter(r => r.action === "attached").length;
    const parts = [];
    if (created)  parts.push(`${created} new tune${created  !== 1 ? "s" : ""} created`);
    if (attached) parts.push(`${attached} updated with PDF`);
    bookResult.textContent = `Done — ${parts.join(", ")}. Added to collection "${data.collection_name}".`;
    bookResult.className = "import-result import-success";
    bookResult.classList.remove("hidden");

    _resetBookImport();
    fetchTunes();
  });

  // ── Import ABC tunes directly ──

  bookAbcImportBtn.addEventListener("click", async () => {
    const tunes = Array.from(bookAbcBody.querySelectorAll("tr")).filter(tr => {
      return tr.querySelector(".book-abc-check")?.checked;
    }).map(tr => {
      const idx = tr.querySelector(".book-abc-check").dataset.idx;
      const raw = _bookAbcTunes[Number(idx)];
      const editedTitle = tr.querySelector(".book-abc-title")?.value.trim() || raw.title;
      return { title: editedTitle, abc: raw.abc, type: raw.type || "", key: raw.key || "" };
    });

    if (!tunes.length) { alert("Select at least one tune to import."); return; }

    bookAbcImportBtn.disabled = true;
    bookAbcImportBtn.textContent = "Importing…";
    bookResult.classList.add("hidden");

    let data;
    try {
      data = await apiFetch("/api/import/abc-tunes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection_name: bookCollName.value.trim(), tunes }),
      });
    } catch (e) {
      bookResult.textContent = `Error: ${e.message}`;
      bookResult.className = "import-result import-error";
      bookResult.classList.remove("hidden");
      bookAbcImportBtn.disabled = false;
      bookAbcImportBtn.textContent = "Import tunes";
      return;
    }

    const parts = [];
    if (data.created) parts.push(`${data.created} new tune${data.created !== 1 ? "s" : ""} added`);
    if (data.exists)  parts.push(`${data.exists} already in library`);
    bookResult.textContent = `Done — ${parts.join(", ")}. Added to collection "${data.collection_name}".`;
    bookResult.className = "import-result import-success";
    bookResult.classList.remove("hidden");

    _resetBookImport();
    fetchTunes();
  });

  function _resetBookImport() {
    bookStep2.classList.add("hidden");
    bookStep3.classList.add("hidden");
    bookStep1.classList.remove("hidden");
    bookTocBody.innerHTML = "";
    _bookRowCount = 0;
    _bookAbcTunes = [];
    _bookFile = null;
    bookFileInput.value = "";
    bookFilename.textContent = "";
    bookCollName.value = "";
    bookScanBtn.disabled = true;
    bookNextBtn.disabled = true;
    bookImportBtn.disabled = false;
    bookImportBtn.textContent = "Import book";
    bookAbcImportBtn.disabled = false;
    bookAbcImportBtn.textContent = "Import tunes";
  }
}

// ── Photos Import ──────────────────────────────────────────────────────────────
{
  const fileInput   = document.getElementById("photos-file-input");
  const dropZone    = document.getElementById("photos-drop-zone");
  const fileCount   = document.getElementById("photos-file-count");
  const previewArea = document.getElementById("photos-preview-area");
  const collName    = document.getElementById("photos-collection-name");
  const previewBody = document.getElementById("photos-preview-body");
  const importBtn   = document.getElementById("photos-import-btn");
  const resultDiv   = document.getElementById("photos-result");

  let _photoFiles = [];

  function _photoStem(name) {
    return name.replace(/\.(jpe?g|png|heic|webp)$/i, "")
               .replace(/[_\-]+/g, " ")
               .replace(/^\d+[\s.\-_]+/, "")
               .trim()
               .replace(/\b\w/g, c => c.toUpperCase());
  }

  function loadPhotoPreview(files) {
    _photoFiles = files;
    if (!files.length) return;
    fileCount.textContent = `${files.length} image${files.length !== 1 ? "s" : ""} selected`;
    if (!collName.value.trim()) {
      collName.value = _photoStem(files[0].name);
    }
    // Revoke any previous object URLs
    previewBody.querySelectorAll("img").forEach(img => URL.revokeObjectURL(img.src));
    previewBody.innerHTML = files.map((f, i) => {
      const objUrl = URL.createObjectURL(f);
      return `<tr>
        <td><img src="${objUrl}" class="photo-thumb" alt="" /></td>
        <td><input class="pdf-title-input photos-title-input" data-idx="${i}" value="${escHtml(_photoStem(f.name))}" /></td>
      </tr>`;
    }).join("");
    previewArea.classList.remove("hidden");
  }

  fileInput.addEventListener("change", () => loadPhotoPreview(Array.from(fileInput.files)));

  dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drop-hover"); });
  dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("drop-hover"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("drop-hover");
    const imgs = Array.from(e.dataTransfer.files).filter(f => /\.(jpe?g|png)$/i.test(f.name));
    if (imgs.length) loadPhotoPreview(imgs);
  });

  importBtn.addEventListener("click", async () => {
    if (!_photoFiles.length) return;
    const col = collName.value.trim();
    if (!col) { alert("Enter a collection name."); return; }
    const titles = Array.from(previewBody.querySelectorAll(".photos-title-input"))
                        .map(el => el.value.trim());

    importBtn.disabled = true;
    importBtn.textContent = "Enhancing & importing…";
    resultDiv.classList.add("hidden");

    const fd = new FormData();
    _photoFiles.forEach(f => fd.append("files", f));
    const params = new URLSearchParams({
      titles: JSON.stringify(titles),
      collection_name: col,
    });

    let data;
    try {
      data = await apiFetch(`/api/import/images?${params}`, { method: "POST", body: fd });
    } catch (e) {
      resultDiv.textContent = `Error: ${e.message}`;
      resultDiv.className = "import-result import-error";
      resultDiv.classList.remove("hidden");
      importBtn.disabled = false;
      importBtn.textContent = "Import & enhance";
      return;
    }

    const parts = [];
    if (data.created)  parts.push(`${data.created} new tune${data.created  !== 1 ? "s" : ""} created`);
    if (data.attached) parts.push(`${data.attached} updated with image`);
    resultDiv.textContent = `Done — ${parts.join(", ")}. Added to collection "${data.collection_name}".`;
    resultDiv.className = "import-result import-success";
    resultDiv.classList.remove("hidden");

    // Revoke object URLs and reset
    previewBody.querySelectorAll("img").forEach(img => URL.revokeObjectURL(img.src));
    _photoFiles = [];
    fileInput.value = "";
    fileCount.textContent = "";
    collName.value = "";
    previewBody.innerHTML = "";
    previewArea.classList.add("hidden");
    importBtn.disabled = false;
    importBtn.textContent = "Import & enhance";
    fetchTunes();
  });
}

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
        const created = await apiFetch("/api/tunes", {
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
        _insertBuildSetBtn(btn, created.id);
        _offerTransfer(created.id, t.title);
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

// ── TheCraic import ───────────────────────────────────────────────────────────
const theCraicFile   = document.getElementById("thecraic-import-file");
const theCraicName   = document.getElementById("thecraic-import-filename");
const theCraicSubmit = document.getElementById("thecraic-import-submit");
const theCraicResult = document.getElementById("thecraic-import-result");

theCraicFile.addEventListener("change", () => {
  const f = theCraicFile.files[0];
  theCraicName.textContent = f ? f.name : "";
  theCraicSubmit.disabled = !f;
});

theCraicSubmit.addEventListener("click", async () => {
  const f = theCraicFile.files[0];
  if (!f) return;
  theCraicSubmit.disabled = true;
  theCraicSubmit.textContent = "Importing…";
  theCraicResult.classList.add("hidden");
  try {
    const form = new FormData();
    form.append("file", f);
    const res = await fetch("/api/import/thecraic", { method: "POST", body: form });
    const data = await res.json();
    if (res.ok) {
      const parts = [];
      if (data.imported) parts.push(`${data.imported} new tune${data.imported !== 1 ? "s" : ""} added`);
      if (data.updated)  parts.push(`${data.updated} updated (favourite status synced)`);
      if (data.skipped)  parts.push(`${data.skipped} skipped`);
      theCraicResult.textContent = parts.length ? parts.join(", ") + "." : "Nothing to import.";
      theCraicResult.className = "import-result import-success";
      theCraicResult.classList.remove("hidden");
      await Promise.all([loadStats(), loadFilters()]);
      if (state.view === "library") loadTunes();
    } else {
      theCraicResult.textContent = `Error: ${data.detail || "Import failed."}`;
      theCraicResult.className = "import-result import-error";
      theCraicResult.classList.remove("hidden");
    }
  } catch (err) {
    theCraicResult.textContent = "Network error. Is the server running?";
    theCraicResult.className = "import-result import-error";
    theCraicResult.classList.remove("hidden");
  } finally {
    theCraicSubmit.disabled = false;
    theCraicSubmit.textContent = "Import from TheCraic";
  }
});

// ── Folder import (smart multi-format) ────────────────────────────────────────
(function () {
  const ABC_RE   = /\.(abc|txt)$/i;
  const AUDIO_RE = /\.(mp3|m4a|ogg|wav)$/i;
  const PDF_RE   = /\.pdf$/i;
  const IMAGE_RE = /\.(jpg|jpeg|png)$/i;
  const ALL_RE   = /\.(abc|txt|mp3|m4a|ogg|wav|pdf|jpg|jpeg|png)$/i;

  const folderInput     = document.getElementById("folder-input");
  const folderSummary   = document.getElementById("folder-summary");
  const folderPreview   = document.getElementById("folder-preview");
  const folderImportBtn = document.getElementById("folder-import-btn");
  const folderResult    = document.getElementById("folder-result");

  function categorise(files) {
    const abc = [], audio = [], pdf = [], image = [], skipped = [];
    for (const f of files) {
      if (ABC_RE.test(f.name))        abc.push(f);
      else if (AUDIO_RE.test(f.name)) audio.push(f);
      else if (PDF_RE.test(f.name))   pdf.push(f);
      else if (IMAGE_RE.test(f.name)) image.push(f);
      else                            skipped.push(f);
    }
    return { abc, audio, pdf, image, skipped };
  }

  function renderPreview(cats) {
    const rows = [];
    if (cats.abc.length)   rows.push(`<li>🎵 <strong>${cats.abc.length}</strong> ABC tune file${cats.abc.length === 1 ? "" : "s"}</li>`);
    if (cats.audio.length) rows.push(`<li>🎶 <strong>${cats.audio.length}</strong> audio file${cats.audio.length === 1 ? "" : "s"} (MP3/M4A/WAV)</li>`);
    if (cats.pdf.length)   rows.push(`<li>📄 <strong>${cats.pdf.length}</strong> PDF file${cats.pdf.length === 1 ? "" : "s"}</li>`);
    if (cats.image.length) rows.push(`<li>📷 <strong>${cats.image.length}</strong> photo${cats.image.length === 1 ? "" : "s"} (JPG/PNG)</li>`);
    if (cats.skipped.length) rows.push(`<li style="color:var(--text-muted)">⏭ ${cats.skipped.length} unsupported file${cats.skipped.length === 1 ? "" : "s"} (ignored)</li>`);

    let html = `<ul class="folder-category-list">${rows.join("")}</ul>`;
    html += `<p class="folder-match-hint">ABC files create new tunes. Audio, PDF and photo files are matched to tunes by filename — unmatched files create a new tune entry.</p>`;
    return html;
  }

  folderInput.addEventListener("change", () => {
    const allFiles = Array.from(folderInput.files);
    const known = allFiles.filter(f => ALL_RE.test(f.name));
    const cats = categorise(allFiles);
    folderResult.classList.add("hidden");

    if (!known.length) {
      folderSummary.textContent = "No supported files found in that folder";
      folderPreview.classList.add("hidden");
      folderImportBtn.disabled = true;
      return;
    }
    folderSummary.textContent = `${known.length} file${known.length === 1 ? "" : "s"} found`;
    folderPreview.innerHTML = renderPreview(cats);
    folderPreview.classList.remove("hidden");
    folderImportBtn.disabled = false;
  });

  folderImportBtn.addEventListener("click", async () => {
    const allFiles = Array.from(folderInput.files).filter(f => ALL_RE.test(f.name));
    if (!allFiles.length) return;
    folderImportBtn.disabled = true;
    folderImportBtn.textContent = "Importing…";
    folderResult.classList.remove("hidden");
    folderResult.className = "import-result";
    folderResult.textContent = `Processing ${allFiles.length} file${allFiles.length === 1 ? "" : "s"}…`;

    try {
      const fd = new FormData();
      allFiles.forEach(f => fd.append("files", f));
      const res = await fetch("/api/import/folder", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Import failed");

      const lines = [];
      if (data.abc_imported)    lines.push(`🎵 ${data.abc_imported} tune${data.abc_imported === 1 ? "" : "s"} imported from ABC`);
      if (data.abc_skipped)     lines.push(`⏭ ${data.abc_skipped} ABC tune${data.abc_skipped === 1 ? "" : "s"} skipped (no title)`);
      if (data.audio_attached)  lines.push(`🎶 ${data.audio_attached} audio file${data.audio_attached === 1 ? "" : "s"} attached`);
      if (data.pdf_attached)    lines.push(`📄 ${data.pdf_attached} PDF${data.pdf_attached === 1 ? "" : "s"} attached`);
      if (data.image_attached)  lines.push(`📷 ${data.image_attached} photo${data.image_attached === 1 ? "" : "s"} attached`);
      if (data.new_from_media)  lines.push(`➕ ${data.new_from_media} new tune${data.new_from_media === 1 ? "" : "s"} created from unmatched media`);

      folderResult.className = "import-result import-success";
      folderResult.innerHTML = lines.length ? lines.join("<br>") : "No files to import.";
      await Promise.all([loadStats(), loadFilters()]);
      if (state.view === "library") loadTunes();
    } catch (err) {
      folderResult.className = "import-result import-error";
      folderResult.textContent = `Error: ${err.message}`;
    } finally {
      folderImportBtn.textContent = "Import All";
      folderImportBtn.disabled = false;
    }
  });
})();

// ── TheCraic export ───────────────────────────────────────────────────────────
document.getElementById("thecraic-export-btn").addEventListener("click", () => {
  const today = new Date().toISOString().slice(0, 10);
  const url = `/api/export/thecraic?filename=${encodeURIComponent(`ceol-export-${today}.abc`)}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `ceol-export-${today}.abc`;
  a.click();
  // Close the menu
  document.getElementById("library-menu").classList.add("hidden");
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

document.getElementById("session-backfill-btn").addEventListener("click", async () => {
  const btn = document.getElementById("session-backfill-btn");
  const status = document.getElementById("session-backfill-status");
  btn.disabled = true;
  status.textContent = "Updating…";
  try {
    const res = await apiFetch("/api/thesession/backfill-member-data", { method: "POST" });
    status.textContent = res.updated > 0 ? `Updated ${res.updated} tune${res.updated !== 1 ? "s" : ""}.` : "All tunes already up to date.";
  } catch (err) {
    status.textContent = "Error: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

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
    try { _previewSynthCtrl.pause(); } catch {}
    _previewSynthCtrl = null;
  }
  _previewTuneData = null;
  _previewSettings = [];
  _activeSettingId = null;
  _checkedSettingIds = new Set();
  document.getElementById("session-preview").classList.add("hidden");
  document.getElementById("session-search-pane").classList.remove("hidden");
});

// Save button: import checked settings (or the previewed one if strip hidden)
document.getElementById("session-save-btn").addEventListener("click", async () => {
  if (!_previewTuneData) return;
  const btn = document.getElementById("session-save-btn");
  const status = document.getElementById("session-save-status");
  btn.disabled = true;
  btn.textContent = "Saving…";

  // Use checked settings if the strip is visible, otherwise let backend default to X:1
  const settingIds = _previewSettings.length > 1 ? [..._checkedSettingIds] : null;

  try {
    const res = await fetch("/api/thesession/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tune_id: _previewTuneData.session_id,
        ...(settingIds ? { setting_ids: settingIds } : {}),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      if (data.status === "multi") {
        const allExist = data.saved === 0;
        btn.textContent = allExist ? "Already in library" : `Saved ${data.saved} ✓`;
        btn.style.background = allExist ? "" : "var(--jig)";
        btn.style.opacity = allExist ? ".5" : "";
        status.textContent = allExist
          ? "All selected settings are already in your library."
          : data.exists > 0
            ? `${data.saved} saved, ${data.exists} already in library.`
            : `${data.saved} setting${data.saved !== 1 ? "s" : ""} of "${data.title}" saved!`;
        status.className = "notes-status notes-saved";
        if (data.saved > 0) {
          await Promise.all([loadStats(), loadFilters()]);
          if (state.view === "library") loadTunes();
        }
      } else if (data.status === "exists") {
        btn.textContent = "Already in library";
        btn.style.opacity = ".5";
        status.textContent = "Already in your library.";
        status.className = "notes-status notes-saved";
        _insertBuildSetBtn(status, data.tune_id);
      } else {
        btn.textContent = "Saved ✓";
        btn.style.background = "var(--jig)";
        status.textContent = `"${data.title}" saved to your library!`;
        status.className = "notes-status notes-saved";
        await Promise.all([loadStats(), loadFilters()]);
        if (state.view === "library") loadTunes();
        _insertBuildSetBtn(status, data.tune_id);
        _offerTransfer(data.tune_id, data.title);
      }
    } else {
      btn.textContent = _checkedSettingIds.size > 1 ? `Save ${_checkedSettingIds.size} settings` : "Save to Library";
      btn.disabled = false;
      status.textContent = "Failed to save.";
      status.className = "notes-status notes-error";
    }
  } catch {
    btn.textContent = _checkedSettingIds.size > 1 ? `Save ${_checkedSettingIds.size} settings` : "Save to Library";
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

    const ffCreated = await apiFetch("/api/tunes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, type: "", key: "", mode: "", abc: "", notes: noteParts.join("\n") }),
    });

    ffStatus.textContent = `✓ "${title}" added to your library.`;
    ffAddBtn.textContent  = "Added ✓";
    ffAddBtn.style.background = "var(--jig)";
    await Promise.all([loadStats(), loadFilters()]);
    if (state.view === "library") loadTunes();
    _offerTransfer(ffCreated.id, title);
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
        ${versions.map(v => {
          const meta = [v.key, v.type].filter(Boolean).map(escHtml).join(" · ");
          const sessionParts = [];
          if (v.session_member) sessionParts.push(escHtml(v.session_member));
          if (v.session_date) sessionParts.push(escHtml(v.session_date.slice(0, 10)));
          const sessionInfo = sessionParts.length ? sessionParts.join(", ") : "";
          return `
          <div class="version-item" data-id="${v.id}" role="button" tabindex="0">
            <div class="version-info">
              <span class="version-name">${v.is_default ? '<span class="version-default-star" title="Default version">⭐</span> ' : ''}${escHtml(v.version_label || v.title)}</span>
              <span class="version-meta">${meta}${sessionInfo ? ` · <span class="version-session">TheSession: ${sessionInfo}</span>` : ""}</span>
              ${v.is_default ? '' : '<span class="version-hint">Click "Set default" to open this version first</span>'}
            </div>
            ${v.is_default
              ? '<span class="version-default-badge">default</span>'
              : `<button class="version-set-default btn-sm btn-secondary" data-id="${v.id}" title="Open this version by default">Set default</button>`}
            <button class="version-del-btn btn-sm" data-id="${v.id}" title="Delete this version">🗑</button>
            <span class="version-arrow">→</span>
          </div>
        `;}).join("")}
      </div>
      <div class="modal-footer" style="margin-top:1.25rem">
        <button id="ungroup-btn" class="btn-danger btn-sm">Ungroup</button>
        <span class="modal-hint" style="margin-left:.5rem">Ungroup removes the container but keeps all versions as individual tunes.</span>
      </div>
    `;

    // Set-default buttons (stop propagation so they don't also open the tune)
    modalContent.querySelectorAll(".version-set-default").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        await apiFetch(`/api/tunes/${btn.dataset.id}/set-default`, { method: "PATCH" });
        renderVersionsPanel(parentId); // re-render with updated star
      });
    });

    // Delete buttons in versions panel
    modalContent.querySelectorAll(".version-del-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const verId = Number(btn.dataset.id);
        const label = versions.find(v => v.id === verId)?.version_label || "this version";
        if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
        btn.disabled = true;
        try {
          await apiDeleteTune(verId);
          // Check if parent still exists (auto-ungrouped if only 1 left)
          try {
            await apiFetch(`/api/tunes/${parentId}/versions`);
            renderVersionsPanel(parentId); // still a group — re-render
          } catch {
            closeModal(); // parent gone — ungrouped
          }
          loadTunes();
        } catch {
          alert("Failed to delete version. Please try again.");
          btn.disabled = false;
        }
      });
    });

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
const autoGroupBtn      = document.getElementById("auto-group-btn");

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

autoGroupBtn.addEventListener("click", async () => {
  libraryMenu.classList.add("hidden");
  const { grouped } = await apiFetch("/api/tunes/auto-group", { method: "POST" });
  if (grouped === 0) {
    alert("No duplicate tune names found — nothing to group.");
  } else {
    alert(`Grouped ${grouped} set${grouped !== 1 ? "s" : ""} of duplicate tunes.`);
    await Promise.all([loadStats(), loadFilters(), loadTunes()]);
  }
});

document.getElementById("dedup-versions-btn").addEventListener("click", async () => {
  libraryMenu.classList.add("hidden");
  const { removed } = await apiFetch("/api/tunes/dedup-versions", { method: "POST" });
  if (removed === 0) {
    alert("No empty or duplicate versions found — nothing to remove.");
  } else {
    alert(`Removed ${removed} duplicate or empty version${removed !== 1 ? "s" : ""}.`);
    await Promise.all([loadStats(), loadFilters(), loadTunes()]);
  }
});

const _rationaliseBtn = document.getElementById("rationalise-btn");
if (_rationaliseBtn) {
  _rationaliseBtn.addEventListener("click", async () => {
    libraryMenu.classList.add("hidden");
    if (!confirm("Scan the whole library for tunes with identical notes and merge duplicates?\n\nRatings, hitlist flags, sets, and collections will be preserved on the surviving tune.")) return;
    const { removed, groups } = await apiFetch("/api/tunes/rationalise", { method: "POST" });
    if (removed === 0) {
      alert("No identical tunes found — library is already clean.");
    } else {
      alert(`Merged ${groups} group${groups !== 1 ? "s" : ""} of identical tunes, removing ${removed} duplicate${removed !== 1 ? "s" : ""}.\n\nRatings, hitlist, sets and collections were carried over to the kept tune.`);
      await Promise.all([loadStats(), loadFilters(), loadTunes()]);
    }
  });
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

backupSaveBtn.addEventListener("click", async () => {
  const name = backupFilename.value.trim() || `ceol-backup-${_todayISO()}.zip`;
  const safe = name.endsWith(".zip") ? name : name + ".zip";
  const url = `/api/library/export?filename=${encodeURIComponent(safe)}`;
  _closeBackup();

  // Use the native Save As picker where available (Chrome/Edge/Firefox).
  // Safari falls back to a standard browser download.
  if (window.showSaveFilePicker) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: safe,
        types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
      });
      const blob = await fetch(url).then(r => r.blob());
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // user cancelled picker
      // Fall through to standard download on any other error
    }
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
    const res = await apiFetch("/api/library/import", { method: "POST", body: form });
    const tuneCount = res.counts?.tunes ?? "?";
    const errs = res.errors?.length ? `\nFirst errors: ${res.errors.join("; ")}` : "";
    libImportResult.textContent = `✓ Imported ${tuneCount} tunes. Reloading…${errs}`;
    libImportResult.className = "import-result";
    libImportResult.classList.remove("hidden");
    setTimeout(() => location.reload(), 3000);
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

// ── Theme toggle ─────────────────────────────────────────────────────────────
(function () {
  const THEMES = ['dark', 'light', 'auto'];
  const ICONS  = { dark: '🌙', light: '☀️', auto: '🔁' };
  const LABELS = { dark: 'Dark theme', light: 'Light theme', auto: 'Auto (follows OS)' };

  function getTheme() {
    return localStorage.getItem('ceol-theme') || 'auto';
  }
  function applyTheme(theme) {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.querySelectorAll('#theme-toggle-btn').forEach(btn => {
      btn.textContent = ICONS[theme];
      btn.setAttribute('data-tooltip', LABELS[theme]);
      btn.setAttribute('aria-label', LABELS[theme]);
    });
  }
  function cycleTheme() {
    const current = getTheme();
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    localStorage.setItem('ceol-theme', next);
    applyTheme(next);
  }

  // Apply saved theme immediately on load
  applyTheme(getTheme());

  document.querySelectorAll('#theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', cycleTheme);
  });
})();

// ── Help modal ────────────────────────────────────────────────────────────────
// ── Info modal ───────────────────────────────────────────────────────────────
const infoBtn = document.getElementById("info-btn");
infoBtn.addEventListener("click", async () => {
  const info = await fetch("/api/info").then(r => r.json());
  const bak1 = info.backup1 ? `<code>${info.backup1}</code>` : "<em>none yet</em>";
  const bak2 = info.backup2 ? `<code>${info.backup2}</code>` : "<em>none yet</em>";
  modalContent.innerHTML = `
    <h2 class="modal-title">App Info</h2>
    <table class="info-table">
      <tr><th>App directory</th><td><code>${info.app_dir}</code></td></tr>
      <tr><th>Database</th><td><code>${info.database}</code></td></tr>
      <tr><th>Backup 1 (most recent)</th><td>${bak1}</td></tr>
      <tr><th>Backup 2 (older)</th><td>${bak2}</td></tr>
      <tr><th>Uploads</th><td><code>${info.uploads}</code></td></tr>
      <tr><th>Info file</th><td><code>${info.info_file}</code></td></tr>
    </table>
    <p class="modal-hint">Backups are created automatically each time the server starts.</p>
    <hr class="modal-divider">
    <h3 class="modal-section-title">Library tools</h3>
    <p class="modal-hint">Auto-classify reads each tune's ABC notation (R:, M:, K: fields) and title
      to set the tune type and key. Run this after importing new tunes, or force
      a full re-scan to correct any wrong labels.</p>
    <div class="info-tools-row">
      <button id="classify-new-btn" class="btn-secondary">Classify untyped tunes</button>
      <button id="classify-all-btn" class="btn-secondary">Re-classify all tunes</button>
      <span id="classify-status" class="set-status"></span>
    </div>
  `;
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  async function runClassify(force) {
    const status = document.getElementById("classify-status");
    const btn = document.getElementById(force ? "classify-all-btn" : "classify-new-btn");
    btn.disabled = true;
    status.textContent = "Working…";
    try {
      const res = await apiFetch(`/api/classify-types${force ? "?force=true" : ""}`, { method: "POST" });
      const changed = res.types_set + res.keys_set;
      const parts = [];
      if (res.types_set) parts.push(`${res.types_set} type${res.types_set !== 1 ? "s" : ""}`);
      if (res.keys_set)  parts.push(`${res.keys_set} key${res.keys_set !== 1 ? "s" : ""}`);
      status.textContent = changed
        ? `Done — set ${parts.join(" and ")} across ${res.total} checked.`
        : `Nothing to update (${res.total} checked).`;
      if (changed > 0) { await loadTunes(); await loadFilters(); }
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  }
  document.getElementById("classify-new-btn").addEventListener("click", () => runClassify(false));
  document.getElementById("classify-all-btn").addEventListener("click", () => runClassify(true));
});

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
_applyNavColour("library");  // set Library button solid on first paint
(async () => {
  await Promise.allSettled([loadFilters(), loadStats(), fetchSets(), fetchCollections()]);
  await loadTunes();
})();
