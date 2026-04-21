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
  has_content: "",
  starts_with: "",
  sets: [],
  collections: [],
  capabilities: { has_anthropic_key: true },
};

async function loadCapabilities() {
  try {
    const c = await apiFetch("/api/capabilities");
    Object.assign(state.capabilities, c);
    const el = document.getElementById("help-data-dir");
    if (el && c.data_dir) el.textContent = c.data_dir;
  } catch { /* non-fatal — fall back to defaults */ }
}

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
const navTodo       = document.getElementById("nav-todo");
const todoBadge     = document.getElementById("todo-badge");
const viewTodo      = document.getElementById("view-todo");
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
const viewPractice      = document.getElementById("view-practice");
const navPractice       = document.getElementById("nav-practice");
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
    window._loadRecentImports?.();
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

  const colButtons = cols.map(c =>
    `<button class="col-pick-btn" data-col-id="${c.id}">${escHtml(c.name)}</button>`
  ).join("");

  modalContent.innerHTML = `
    <h2 class="modal-title">Add ${ids.length} tune${ids.length !== 1 ? "s" : ""} to Collection</h2>
    <p class="col-pick-hint">Click a collection to add immediately:</p>
    <div class="col-pick-list" id="col-pick-list">
      ${colButtons || '<p class="set-add-tune-none">No collections yet — create one below.</p>'}
    </div>
    <div style="margin-top:.75rem">
      <button id="col-pick-create-btn" class="btn-secondary btn-sm">+ New collection…</button>
      <div id="col-pick-create-form" class="hidden" style="margin-top:.5rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <input id="col-pick-create-name" type="text" class="ff-url-input" placeholder="Collection name" style="flex:1;min-width:8rem">
        <button id="col-pick-create-save" class="btn-collection">Create &amp; Add</button>
      </div>
    </div>
    <div style="margin-top:1rem">
      <button id="bulk-col-cancel" class="btn-secondary">Cancel</button>
      <span id="bulk-col-status" class="notes-status"></span>
    </div>`;
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const status = document.getElementById("bulk-col-status");

  const _doAdd = async (colId) => {
    status.textContent = "Adding…";
    modalContent.querySelectorAll(".col-pick-btn, #col-pick-create-save").forEach(b => { b.disabled = true; });
    try {
      await Promise.all(ids.map(id =>
        apiFetch(`/api/collections/${colId}/tunes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tune_id: id }),
        })
      ));
      status.textContent = `Added ${ids.length} tune${ids.length !== 1 ? "s" : ""} ✓`;
      setTimeout(() => { closeModal(); _exitSelectMode(); }, 700);
    } catch {
      status.textContent = "Failed — please try again.";
      modalContent.querySelectorAll(".col-pick-btn, #col-pick-create-save").forEach(b => { b.disabled = false; });
    }
  };

  modalContent.querySelectorAll(".col-pick-btn").forEach(btn => {
    btn.addEventListener("click", () => _doAdd(Number(btn.dataset.colId)));
  });

  document.getElementById("bulk-col-cancel").addEventListener("click", closeModal);
  document.getElementById("col-pick-create-btn").addEventListener("click", () => {
    document.getElementById("col-pick-create-form").classList.remove("hidden");
    document.getElementById("col-pick-create-name").focus();
  });
  document.getElementById("col-pick-create-save").addEventListener("click", async () => {
    const name = document.getElementById("col-pick-create-name").value.trim();
    if (!name) { document.getElementById("col-pick-create-name").focus(); return; }
    const created = await apiCreateCollection(name, "");
    state.collections.push({ ...created, tune_count: 0 });
    await _doAdd(created.id);
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
      _todoSuggestions = null;  // invalidate cache so badge re-fetches fresh data
      await Promise.all([loadStats(), loadFilters(), loadTunes()]);
      _refreshTodoBadge();
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
  if (!_pendingTransferBanner) return;
  const pt = _getPendingTransfer();
  if (!pt) { _pendingTransferBanner.classList.add("hidden"); return; }
  const parts = [];
  if (pt.sets.length) parts.push(`${pt.sets.length} set${pt.sets.length !== 1 ? "s" : ""}`);
  if (pt.collections.length) parts.push(`${pt.collections.length} collection${pt.collections.length !== 1 ? "s" : ""}`);
  _pendingTransferMsg.textContent =
    `📋 Memberships saved from "${pt.tuneName}" (${parts.join(" & ")}) — import or open a replacement tune to apply them.`;
  _pendingTransferBanner.classList.remove("hidden");
}

document.getElementById("pending-transfer-dismiss")?.addEventListener("click", () => {
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
  if (state.min_rating)   params.set("min_rating",  state.min_rating);
  if (state.has_content)  params.set("has_content", state.has_content);
  if (state.starts_with)  params.set("starts_with", state.starts_with);
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
  todo:        { el: () => navTodo,        bg: "#ef4444" },
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
  [viewLibrary, viewSets, viewCollections, viewNotes, viewAchievements, viewPractice, viewTodo].forEach(v => v.classList.add("hidden"));
  [navLibrary, navSets, navCollections, navTodo].forEach(n => n.classList.remove("active"));
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
  } else if (view === "practice") {
    viewPractice.classList.remove("hidden");
    if (navPractice) navPractice.classList.add("active");
  } else if (view === "todo") {
    viewTodo.classList.remove("hidden");
    navTodo.classList.add("active");
    loadTodoView();
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
      const _sq = encodeURIComponent(state.q || "");
      tuneList.innerHTML = `<div class="empty-library">
        <p>No tunes in your library match <strong>${escHtml(state.q || "")}</strong>.</p>
        <p style="margin-top:.5rem">
          <a class="btn-secondary btn-sm" href="https://thesession.org/tunes?q=${_sq}" target="_blank" rel="noopener">
            🔍 Search TheSession.org for this tune ↗
          </a>
        </p>
      </div>`;
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
    const _cardMasteryLabels = ["","Just starting","Getting there","Almost there","Know it well","Nailed it!"];
    const masteryText = rating ? `${"★".repeat(rating)} <span class="card-mastery-label">${_cardMasteryLabels[rating]}</span>` : "";
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
        <div class="card-mastery">${masteryText}</div>
        <div class="card-stars">${stars}</div>

      </article>`;
  }).join("");

  renderPagination(page, pages);
}

function renderPagination(current, total) {
  const paginationTop = document.getElementById("pagination-top");
  if (total <= 1) {
    pagination.innerHTML = "";
    if (paginationTop) paginationTop.innerHTML = "";
    return;
  }

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
  if (paginationTop) paginationTop.innerHTML = html;
}

/// Render a notes string: URLs become playable embeds or clickable links
function renderNotesHtml(text) {
  if (!text) return "";
  const urlRe = /(?:https?:\/\/|\/api\/uploads\/)[^\s<>"]+/g;
  const parts = [];
  let last = 0;
  let m;

  function shortUrl(u) {
    if (u.startsWith("/api/uploads/")) return u.split("/").pop();
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
    if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(url)) {
      parts.push(`<div class="notes-media-link">
        <button class="btn-secondary btn-sm media-play-btn" data-url="${urlEsc}" data-media-type="audio">▶ Play audio</button>
        <a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">${escHtml(shortUrl(url))}</a>
      </div>`);
    } else if (/\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url)) {
      parts.push(`<div class="notes-media-link">
        <video controls src="${urlEsc}" style="max-width:100%;border-radius:6px;margin:4px 0;display:block"></video>
        <a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">📹 ${escHtml(shortUrl(url))}</a>
      </div>`);
    } else if (/(?:youtube\.com\/watch\?.*v=|youtu\.be\/)/.test(url)) {
      parts.push(`<div class="notes-media-link">
        <button class="btn-secondary btn-sm media-play-btn" data-url="${urlEsc}" data-media-type="video">▶ Watch video</button>
        <a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">${escHtml(shortUrl(url))}</a>
      </div>`);
    } else if (/\.pdf(\?|$)/i.test(url)) {
      parts.push(`<a href="${urlEsc}" target="_blank" rel="noopener" class="notes-link">📄 ${escHtml(shortUrl(url))}</a>`);
    } else if (/\.bandcamp\.com/i.test(url)) {
      // Extract a readable label: album/track name from path or hostname
      let bandcampLabel = shortUrl(url);
      try {
        const u = new URL(url);
        const parts2 = u.pathname.replace(/^\//, "").split("/");
        // pathname like /album/my-album-name or /track/my-track
        if (parts2.length >= 2 && (parts2[0] === "album" || parts2[0] === "track")) {
          bandcampLabel = parts2[1].replace(/-/g, " ");
        } else {
          bandcampLabel = u.hostname.replace(".bandcamp.com", "");
        }
      } catch { /* keep default */ }
      parts.push(`<a href="${urlEsc}" target="_blank" rel="noopener" class="bandcamp-link">
        <span class="bandcamp-link-icon">🎵</span>
        <span class="bandcamp-link-text">Listen on Bandcamp — ${escHtml(bandcampLabel)}</span>
      </a>`);
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
  const importedLine = tune.imported_at
    ? `<p class="modal-imported">Imported: ${new Date(tune.imported_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>`
    : "";
  // TheSession.org button — direct link if we have a session ID, search otherwise
  const sessionHref = _sessionId
    ? `https://thesession.org/tunes/${_sessionId}`
    : null;
  const sessionBtnLabel = _sessionId
    ? "🌐 Open on TheSession.org ↗"
    : `🔍 Search TheSession.org for "${tune.title}" ↗`;
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
    const src = tune.all_notes || tune.notes || "";
    if (!src) return [];
    const urlRe = /(?:https?:\/\/|\/api\/uploads\/)[^\s<>"]+/g;
    const seen = new Set(), urls = [];
    let m;
    while ((m = urlRe.exec(src)) !== null) {
      const url = m[0];
      if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(url) && !seen.has(url)) {
        seen.add(url); urls.push(url);
      }
    }
    return urls;
  })();
  const notesVideoUrls = (() => {
    const src = tune.all_notes || tune.notes || "";
    if (!src) return [];
    const urlRe = /(?:https?:\/\/|\/api\/uploads\/)[^\s<>"]+/g;
    const seen = new Set(), urls = [];
    let m;
    while ((m = urlRe.exec(src)) !== null) {
      const url = m[0];
      if ((/(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/.test(url) ||
          /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url)) && !seen.has(url)) {
        seen.add(url); urls.push(url);
      }
    }
    return urls;
  })();
  const setsFooter = `<div class="modal-sets-row">
      <button id="add-to-set-btn" class="btn-set btn-sm">+ Add to a set…</button>
      <button id="create-set-from-tune-btn" class="btn-set btn-sm">+ Create new set</button>
      <button id="build-set-from-tune-btn" class="btn-set btn-sm">🎵 Build a Set from here</button>
    </div>`;

  const collectionsFooter = `<div class="modal-col-section">
    <div class="modal-sets-row">
      <button id="col-add-btn" class="btn-collection btn-sm">+ Add to collection…</button>
      <span id="col-status" class="set-status"></span>
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
    <div id="modal-membership" class="modal-membership"></div>

    <div class="modal-tabs">
      <button class="tab-btn active" data-tab="music">Sheet Music</button>
      <button class="tab-btn" data-tab="abc">ABC Text</button>
      <button class="tab-btn" data-tab="notes">Notes</button>
      ${tune.abc ? `<button class="tab-btn" data-tab="practice">Practice</button>` : ""}
    </div>

          <div id="tab-music" class="tab-panel">
        ${tune.abc ? `<div style="display:flex;justify-content:flex-end;margin-bottom:.3rem"><button id="abc-fs-btn" class="btn-secondary btn-sm" title="Full screen sheet music">⛶ Full screen</button></div>` : ""}
        <div class="sheet-music-wrap">
        <div id="sheet-music-render"></div>
        <div id="sheet-music-render-hidden" style="display:none;height:0;overflow:hidden"></div>
        ${imageUrl ? `<img id="image-embed" class="sheet-music-image" src="${escHtml(imageUrl)}" alt="Sheet music photo" />` : ""}
        ${imageUrl ? `<p class="pdf-link-hint"><a href="${escHtml(imageUrl)}" target="_blank" rel="noopener">Open image in new tab ↗</a></p>` : ""}
        ${pdfUrl ? `<iframe id="pdf-embed" class="pdf-embed" src="${escHtml(pdfUrl)}" title="Sheet music PDF"></iframe>` : ""}
        ${pdfUrl ? `<p class="pdf-link-hint"><a href="${escHtml(pdfUrl)}" target="_blank" rel="noopener">Open PDF in new tab ↗</a></p>` : ""}
        ${(tune.abc && (imageUrl || pdfUrl)) ? `<p class="pdf-link-hint" style="margin-top:.5rem">
          📎 This tune has both ABC and ${imageUrl ? "a photo" : "a PDF"} of sheet music on the same page.
          <button class="btn-secondary btn-sm" id="split-abc-btn" style="margin-left:.4rem">Separate into versions</button>
        </p>` : ""}
      </div>
      <div id="fetch-abc-section">
        <div class="fetch-abc-row">
          ${sessionHref
            ? `<a id="open-session-btn" href="${sessionHref}" target="_blank" rel="noopener" class="btn-secondary btn-sm">${sessionBtnLabel}</a>`
            : `<button id="open-session-btn" class="btn-secondary btn-sm" data-search-title="${escHtml(tune.title)}">${sessionBtnLabel}</button>`}
          <span id="fetch-abc-status" class="notes-status"></span>
        </div>
        <div id="session-abc-results" class="session-abc-results hidden"></div>
      </div>
      ${pdfUrl ? `<div class="ff-download-row">
        <a class="btn-secondary ff-dl-btn" href="/api/proxy-download?url=${encodeURIComponent(pdfUrl)}" download>⬇ Download PDF</a>
      </div>` : ""}
      ${notesAudioUrls.map((u, i) => {
        const label = notesAudioUrls.length > 1 ? `▶ Play MP3 ${i + 1}` : "▶ Play MP3";
        return `<div class="ff-download-row media-attachment-row" data-url="${escHtml(u)}" data-media-type="audio">
          <button class="btn-secondary media-play-btn" data-url="${escHtml(u)}" data-media-type="audio">${label}</button>
          <button class="btn-icon media-remove-btn" data-url="${escHtml(u)}" title="Remove this audio attachment">🗑</button>
        </div>`;
      }).join("")}
      ${notesVideoUrls.map((u, i) => {
        const isYt = /(?:youtube\.com|youtu\.be)/.test(u);
        const label = notesVideoUrls.length > 1 ? `▶ Play video ${i + 1}` : "▶ Play video";
        return `<div class="ff-download-row media-attachment-row" data-url="${escHtml(u)}" data-media-type="video">
          <button class="btn-secondary media-embed-btn" data-url="${escHtml(u)}">${label}</button>
          <a class="btn-secondary btn-sm" href="${escHtml(u)}" target="_blank" rel="noopener" title="Open in new tab">↗</a>
          <button class="btn-icon media-remove-btn" data-url="${escHtml(u)}" title="Remove this video attachment">🗑</button>
        </div>
        <div class="media-inline-embed hidden" id="embed-${escHtml(u).replace(/[^a-z0-9]/gi,'_').slice(0,30)}"></div>`;
      }).join("")}
      <div id="audio-player-container" class="audio-player-wrap"></div>
      <audio id="inline-mp3-player" class="inline-mp3-player hidden" controls></audio>
      <div id="metronome-row" class="metronome-row">
        <button id="metro-toggle" class="btn-secondary btn-sm">♩ Metronome</button>
        <span id="metro-controls" class="metro-controls hidden">
          <button id="metro-dec" class="btn-icon metro-adj">−</button>
          <input id="metro-bpm" type="number" min="20" max="400" value="120" class="metro-bpm-input" title="Beats per minute">
          <button id="metro-inc" class="btn-icon metro-adj">+</button>
          <span class="metro-label">BPM</span>
          <button id="metro-tap" class="btn-secondary btn-sm">Tap</button>
          <span class="metro-label">Vol</span>
          <input id="metro-vol" type="range" min="0" max="100" value="70" class="metro-vol-slider" title="Metronome volume">
          <span id="metro-sync-badge" class="metro-sync-badge metro-sync">Synced</span>
        </span>
      </div>
      <div id="sheet-music-options-panel" class="sheet-music-options-panel hidden">
        <div class="sheet-music-options-header">
          <span class="sheet-music-options-title">Sheet Music Options</span>
          <button id="sheet-music-options-close" class="btn-icon">✕</button>
        </div>
        <div class="transpose-row" style="display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;border-bottom:1px solid var(--border)">
          <span style="font-size:.8rem;color:var(--text-muted);flex:1">Transpose</span>
          <button id="transpose-down-btn" class="btn-secondary btn-sm" title="Down 1 semitone">♭ −</button>
          <span id="transpose-label" style="min-width:2.5rem;text-align:center;font-size:.85rem;font-weight:600">0</span>
          <button id="transpose-up-btn" class="btn-secondary btn-sm" title="Up 1 semitone">♯ +</button>
          <button id="transpose-reset-btn" class="btn-secondary btn-sm" title="Reset">Reset</button>
        </div>
      ${tune.abc ? `<div class="instrument-controls-row">
        <div id="melody-controls" class="chord-controls">
          <label class="chord-ctrl-label">Melody:</label>
          <select id="melody-program-select" class="chord-program-select" title="Melody instrument">
            <option value="73">Flute</option>
            <option value="74">Recorder</option>
            <option value="110">Fiddle</option>
            <option value="40">Violin</option>
            <option value="109">Uilleann Pipes</option>
            <option value="71">Clarinet</option>
            <option value="68">Oboe</option>
            <option value="72">Piccolo</option>
            <option value="105">Banjo</option>
            <option value="22">Harmonica</option>
            <option value="0">Piano</option>
          </select>
        </div>
        ${/\"[A-G]/.test(tune.abc) ? `<div id="chord-controls" class="chord-controls">
          <label class="chord-ctrl-label">Chords:</label>
          <select id="chord-program-select" class="chord-program-select" title="Chord accompaniment instrument">
            <option value="-1">Off</option>
            <option value="0">Piano</option>
            <option value="24">Guitar (nylon)</option>
            <option value="25">Guitar (steel)</option>
            <option value="40">Violin/Strings</option>
            <option value="46">Harp</option>
            <option value="11">Vibraphone</option>
            <option value="19">Organ</option>
            <option value="48">String Ensemble</option>
            <option value="52">Choir/Aah</option>
          </select>
        </div>` : ""}
      </div>` : ""}
      ${tune.abc ? `<div class="tempo-control-row" id="tempo-control-row">
        <label class="chord-ctrl-label">Tempo:</label>
        <button class="btn-icon tempo-adj" id="tempo-dec">−</button>
        <input id="tempo-bpm-input" type="number" min="20" max="400"
               value="${_extractAbcBpm(tune.abc) || 120}"
               class="metro-bpm-input" title="Beats per minute" style="width:4rem">
        <button class="btn-icon tempo-adj" id="tempo-inc">+</button>
        <span class="metro-label">BPM</span>
        <button id="tempo-set-btn" class="btn-secondary btn-sm" title="Write this tempo into the ABC and save">Set tempo</button>
        <span id="tempo-status" class="notes-status"></span>
      </div>` : ""}
      <div class="highlight-toolbar" id="highlight-toolbar" style="display:flex;gap:6px;align-items:center;margin:4px 0 2px;">
        <button id="highlight-mode-btn" class="btn-secondary highlight-mode-btn" title="Toggle highlight mode — click bars to mark difficult sections">🖊 Highlight</button>
        <button id="highlight-clear-btn" class="btn-secondary highlight-clear-btn hidden" title="Remove all highlights">✕ Clear</button>
      </div>
      <p id="audio-unavailable" class="audio-unavailable hidden">
        Audio playback is not supported in this browser.
      </p>
      <div class="attach-audio-row" style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="attach-audio-btn" class="btn-secondary">🎧 Add audio link</button>
        <button id="attach-video-btn" class="btn-secondary">📹 Add video</button>
      </div>
        <div style="padding:.5rem .75rem .75rem;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:.3rem;margin-top:.25rem">
          <a class="library-menu-item" href="/api/export/tune/${tune.id}" download style="display:block;text-decoration:none;color:var(--text);padding:.4rem .5rem;border-radius:6px">&#128196; Export Ceòl JSON</a>
          ${tune.abc ? `<button class="library-menu-item" id="tune-export-abc-btn" style="text-align:left;background:none;border:none;width:100%;padding:.4rem .5rem;cursor:pointer;color:var(--text);border-radius:6px">&#127925; Export TheCraic ABC</button>` : ""}
          ${tune.abc ? `<button class="library-menu-item" id="print-tune-pdf-btn" style="text-align:left;background:none;border:none;width:100%;padding:.4rem .5rem;cursor:pointer;color:var(--text);border-radius:6px">&#9113; Print / PDF</button>` : ""}
          <hr style="margin:.2rem 0;border:none;border-top:1px solid var(--border)">
          <button class="library-menu-item library-menu-danger" id="delete-tune-modal-btn" data-tune-id="${tune.id}" style="text-align:left;background:none;border:none;width:100%;padding:.4rem .5rem;cursor:pointer;border-radius:6px">&#128465; ${tune.parent_id ? "Delete this version" : "Delete from Library"}</button>
        </div>
      </div><!-- end sheet-music-options-panel -->
      <div id="bar-selection-info" class="bar-selection-info hidden"></div>
      <div id="attach-video-panel" class="attach-audio-panel hidden">
        <div class="attach-audio-tabs">
          <button class="attach-vtab-btn active" data-tab="upload">Upload file</button>
          <button class="attach-vtab-btn" data-tab="url">Paste URL</button>
        </div>
        <div id="attach-vtab-upload" class="attach-tab-panel">
          <label class="attach-file-label">
            <input id="attach-video-file" type="file" accept="video/*" class="attach-file-input">
            <span class="attach-file-hint">Choose a video file from your computer</span>
          </label>
          <p id="attach-video-upload-status" class="ff-cat-hint"></p>
        </div>
        <div id="attach-vtab-url" class="attach-tab-panel hidden">
          <div class="attach-audio-browse-row">
            <input id="attach-video-url-input" class="attach-audio-path" type="url" placeholder="https://…">
            <button id="attach-video-url-btn" class="btn-secondary">Use URL</button>
          </div>
          <p id="attach-video-url-status" class="ff-cat-hint"></p>
        </div>
      </div>
      <div id="attach-audio-panel" class="attach-audio-panel hidden">
        <div class="attach-audio-tabs">
          <button class="attach-tab-btn active" data-tab="upload">Upload file</button>
          <button class="attach-tab-btn" data-tab="url">Paste URL</button>
          <button class="attach-tab-btn" data-tab="dropbox">Dropbox</button>
        </div>
        <div id="attach-tab-upload" class="attach-tab-panel">
          <input id="attach-audio-file" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac" class="attach-file-input" style="display:none">
          <button id="attach-audio-choose-btn" class="btn-secondary">📂 Choose audio file…</button>
          <span id="attach-audio-chosen" class="attach-file-hint" style="margin-left:.5rem"></span>
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
      <div class="attach-audio-row" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button id="notes-attach-audio-btn" class="btn-secondary">🎧 Attach audio</button>
        <button id="notes-attach-video-btn" class="btn-secondary">📹 Attach video</button>
      </div>
      <div id="notes-attach-panel" class="attach-audio-panel hidden">
        <div class="attach-audio-tabs">
          <button class="notes-media-tab active" data-panel="audio">Upload audio</button>
          <button class="notes-media-tab" data-panel="video">Upload video</button>
          <button class="notes-media-tab" data-panel="url">Paste URL</button>
        </div>
        <div id="notes-panel-audio" class="attach-tab-panel">
          <label class="attach-file-label">
            <input id="notes-audio-file" type="file" accept="audio/*" class="attach-file-input">
            <span class="attach-file-hint">Choose an audio file from your computer</span>
          </label>
          <p id="notes-audio-status" class="ff-cat-hint"></p>
        </div>
        <div id="notes-panel-video" class="attach-tab-panel hidden">
          <label class="attach-file-label">
            <input id="notes-video-file" type="file" accept="video/*" class="attach-file-input">
            <span class="attach-file-hint">Choose a video file from your computer</span>
          </label>
          <p id="notes-video-status" class="ff-cat-hint"></p>
        </div>
        <div id="notes-panel-url" class="attach-tab-panel hidden">
          <div class="attach-audio-browse-row">
            <input id="notes-media-url-input" class="attach-audio-path" type="url" placeholder="https://…">
            <button id="notes-media-url-btn" class="btn-secondary">Use URL</button>
          </div>
          <p id="notes-media-url-status" class="ff-cat-hint"></p>
        </div>
      </div>
    </div>

    ${tune.abc ? `
    <div id="tab-practice" class="tab-panel hidden">
      <div class="practice-section">
        <h4 class="practice-heading">Phrase Builder</h4>
        <div class="practice-row">
          <label class="practice-label">From bar</label>
          <input id="prac-from-bar" type="number" min="1" value="1" class="practice-num-input">
          <label class="practice-label" style="min-width:4rem">To bar</label>
          <input id="prac-to-bar" type="number" min="1" placeholder="all" class="practice-num-input">
          <span class="prac-bar-count-hint practice-bpm-hint"></span>
        </div>
        <div class="practice-row">
          <label class="practice-label">Phrase length (bars)</label>
          <input id="prac-phrase-len" type="number" min="1" max="16" value="2" class="practice-num-input">
        </div>
        <div class="practice-row">
          <label class="practice-label">Rest bars after phrase</label>
          <input id="prac-rest-bars" type="number" min="0" max="16" value="2" class="practice-num-input">
        </div>
      </div>
      <div class="practice-section">
        <h4 class="practice-heading">Tempo Progression</h4>
        <div class="practice-row">
          <label class="practice-label">Starting tempo %</label>
          <input id="prac-tempo-start" type="number" min="10" max="200" value="60" class="practice-num-input">
          <span id="prac-bpm-start" class="practice-bpm-hint"></span>
        </div>
        <div class="practice-row">
          <label class="practice-label">Final tempo %</label>
          <input id="prac-tempo-final" type="number" min="10" max="200" value="100" class="practice-num-input">
          <span id="prac-bpm-final" class="practice-bpm-hint"></span>
        </div>
        <div class="practice-row">
          <label class="practice-label">Increment (%)</label>
          <input id="prac-tempo-inc" type="number" min="1" max="50" value="5" class="practice-num-input">
        </div>
        <div class="practice-row">
          <label class="practice-label">Increment after (loops)</label>
          <input id="prac-tempo-loops" type="number" min="1" max="20" value="2" class="practice-num-input">
        </div>
      </div>
      <div class="practice-actions">
        <button id="prac-build-btn" class="btn-primary">▶ Build &amp; Practice</button>
        <button id="prac-fs-btn" class="btn-secondary practice-fs-btn hidden" title="Full screen sheet music">⛶ Full screen</button>
        <span id="prac-status" class="notes-status"></span>
      </div>
      <div id="prac-tempo-display" class="practice-tempo-display hidden"></div>
      <div id="prac-phrase-indicator" class="practice-phrase-indicator hidden"></div>
      <div id="prac-sheet-render" class="practice-sheet-render"></div>
      <div id="prac-player-container" class="audio-player-wrap"></div>
    </div>
    ` : ""}

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
        <div class="tune-more-wrap" style="position:relative;display:inline-block">
          <button id="tune-more-btn" class="btn-secondary">⋯ More</button>
          <div id="tune-more-menu" class="library-menu hidden" style="position:absolute;bottom:2.6rem;right:0;z-index:300;min-width:210px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.18);overflow:hidden">
            ${tune.abc ? `<button class="library-menu-item" id="strip-chords-btn">✂ Strip chords</button>` : ""}
            <hr class="library-menu-divider" style="margin:.25rem 0"/>
            <a class="library-menu-item" href="/api/export/tune/${tune.id}" download style="display:block;text-decoration:none;color:var(--text);padding:.5rem .9rem">📄 Export Ceòl JSON</a>
            ${tune.abc ? `<button class="library-menu-item" id="tune-export-abc-btn">🎵 Export TheCraic ABC</button>` : ""}
            ${tune.abc ? `<button class="library-menu-item" id="print-tune-pdf-btn">⎙ Print / PDF</button>` : ""}
            <hr class="library-menu-divider" style="margin:.25rem 0"/>
            <button class="library-menu-item library-menu-danger" id="delete-tune-modal-btn" data-tune-id="${tune.id}">
              🗑 ${tune.parent_id ? "Delete this version" : "Delete from Library"}
            </button>
          </div>
        </div>
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
          else if (t.sibling_abc) renderSheetMusicAudioOnly(t.sibling_abc);
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

  // Media play buttons — audio in music tab plays inline, others use overlay
  modalContent.addEventListener("click", e => {
    const btn = e.target.closest(".media-play-btn");
    if (!btn) return;
    const inMusicTab = !!btn.closest("#tab-music");
    if (inMusicTab && btn.dataset.mediaType === "audio") {
      _playInlineMp3(btn.dataset.url);
    } else {
      openMediaOverlay(btn.dataset.url, btn.dataset.mediaType);
    }
  });

  // Video embed buttons — inline embed toggle
  modalContent.addEventListener("click", e => {
    const btn = e.target.closest(".media-embed-btn");
    if (!btn) return;
    const url = btn.dataset.url;
    const safeId = "embed-" + url.replace(/[^a-z0-9]/gi, "_").slice(0, 30);
    const embedDiv = document.getElementById(safeId);
    if (!embedDiv) { window.open(url, "_blank"); return; }
    if (!embedDiv.classList.contains("hidden")) {
      embedDiv.classList.add("hidden");
      embedDiv.innerHTML = "";
      btn.textContent = btn.dataset.origLabel || "▶ Play video";
      return;
    }
    const vidId = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?#/]+)/)?.[1];
    if (vidId) {
      embedDiv.innerHTML = `
        <div class="media-embed-wrap">
          <iframe class="media-video-inline" src="https://www.youtube-nocookie.com/embed/${escHtml(vidId)}?autoplay=1"
                  allow="autoplay; fullscreen" allowfullscreen></iframe>
          <button class="media-embed-close btn-icon" title="Close video">✕</button>
        </div>`;
      embedDiv.querySelector(".media-embed-close").addEventListener("click", () => {
        embedDiv.classList.add("hidden");
        embedDiv.innerHTML = "";
        btn.textContent = btn.dataset.origLabel || "▶ Play video";
      });
    } else {
      embedDiv.innerHTML = `
        <div class="media-embed-wrap">
          <video controls autoplay class="media-video-inline" src="${escHtml(url)}" style="max-width:100%"></video>
          <button class="media-embed-close btn-icon" title="Close video">✕</button>
        </div>`;
      embedDiv.querySelector(".media-embed-close").addEventListener("click", () => {
        const v = embedDiv.querySelector("video");
        if (v) v.pause();
        embedDiv.classList.add("hidden");
        embedDiv.innerHTML = "";
        btn.textContent = btn.dataset.origLabel || "▶ Play video";
      });
    }
    if (!btn.dataset.origLabel) btn.dataset.origLabel = btn.textContent;
    btn.textContent = "▼ Hide video";
    embedDiv.classList.remove("hidden");
  });

  // Remove audio/video attachment — attach directly to each button to avoid
  // stale-closure bugs from multiple renderModal calls accumulating on modalContent.
  modalContent.querySelectorAll(".media-remove-btn").forEach(removeBtn => {
    removeBtn.addEventListener("click", async () => {
      const urlToRemove = removeBtn.dataset.url;
      if (!confirm("Remove this media attachment from the tune's notes?")) return;
      removeBtn.disabled = true;
      try {
        // Remove the URL line (with any audio:/video: prefix) then collapse blank lines
        const escaped = urlToRemove.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(?:audio:|video:|\\n?)\\s*${escaped}\\s*\\n?`, "g");
        let newNotes = (tune.notes || "").replace(re, "");
        newNotes = newNotes.replace(urlToRemove, "").replace(/\n{3,}/g, "\n\n").trim();
        await apiFetch(`/api/tunes/${tune.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: newNotes }),
        });
        tune.notes = newNotes;
        removeBtn.closest(".media-attachment-row")?.remove();
        const embedEl = document.getElementById("embed-" + urlToRemove.replace(/[^a-z0-9]/gi, "_").slice(0, 30));
        if (embedEl) embedEl.remove();
      } catch {
        removeBtn.disabled = false;
        alert("Failed to remove attachment.");
      }
    });
  });

  // Tab switching
  modalContent.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const leaving = modalContent.querySelector(".tab-btn.active")?.dataset.tab;
      if (leaving === "practice") _stopPracticeAudio();
      modalContent.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      modalContent.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
    });
  });

  _initPracticeTab(tune);

  // ── Persistent highlights ────────────────────────────────────────────────
  _highlightMode = false;
  _highlightTuneId = tune.id;
  try { _tuneHighlights = new Set(JSON.parse(tune.highlights || "[]")); }
  catch { _tuneHighlights = new Set(); }

  const hlModeBtn = document.getElementById("highlight-mode-btn");
  const hlClearBtn = document.getElementById("highlight-clear-btn");

  if (hlModeBtn) {
    hlModeBtn.classList.remove("active");
    hlModeBtn.addEventListener("click", () => {
      _highlightMode = !_highlightMode;
      hlModeBtn.classList.toggle("active", _highlightMode);
    });
  }
  if (hlClearBtn) {
    if (_tuneHighlights.size > 0) hlClearBtn.classList.remove("hidden");
    hlClearBtn.addEventListener("click", () => {
      _tuneHighlights.clear();
      _applyHighlights();
      _saveHighlights();
    });
  }

  // Apply highlights once sheet music has rendered
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (_barMap.length === 0) _barMap = _buildBarMap();
    _applyHighlights();
  }));

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

  // Notes tab — media attachment panel
  (function () {
    const notesAttachPanel = document.getElementById("notes-attach-panel");

    function _showNotesPanel(tab) {
      notesAttachPanel.classList.remove("hidden");
      notesAttachPanel.querySelectorAll(".notes-media-tab").forEach(b => b.classList.remove("active"));
      notesAttachPanel.querySelectorAll(".attach-tab-panel").forEach(p => p.classList.add("hidden"));
      notesAttachPanel.querySelector(`[data-panel="${tab}"]`).classList.add("active");
      document.getElementById(`notes-panel-${tab}`).classList.remove("hidden");
    }

    document.getElementById("notes-attach-audio-btn").addEventListener("click", () => _showNotesPanel("audio"));
    document.getElementById("notes-attach-video-btn").addEventListener("click", () => _showNotesPanel("video"));

    notesAttachPanel.querySelectorAll(".notes-media-tab").forEach(btn => {
      btn.addEventListener("click", () => _showNotesPanel(btn.dataset.panel));
    });

    async function _uploadAndAttach(inputId, statusId, endpoint) {
      const file = document.getElementById(inputId).files[0];
      if (!file) return;
      const statusEl = document.getElementById(statusId);
      statusEl.textContent = "Uploading…";
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(endpoint, { method: "POST", body: formData });
        if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
        const { url } = await res.json();
        await _appendUrlToNotes(`${window.location.origin}${url}`, statusEl);
        notesAttachPanel.classList.add("hidden");
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
      }
    }

    document.getElementById("notes-audio-file").addEventListener("change", () =>
      _uploadAndAttach("notes-audio-file", "notes-audio-status", `/api/tunes/${tune.id}/upload-audio`));
    document.getElementById("notes-video-file").addEventListener("change", () =>
      _uploadAndAttach("notes-video-file", "notes-video-status", `/api/tunes/${tune.id}/upload-video`));

    document.getElementById("notes-media-url-btn").addEventListener("click", async () => {
      const urlInput = document.getElementById("notes-media-url-input");
      const statusEl = document.getElementById("notes-media-url-status");
      const url = urlInput.value.trim();
      if (!url) { statusEl.textContent = "Please enter a URL."; return; }
      urlInput.value = "";
      await _appendUrlToNotes(url, statusEl);
      notesAttachPanel.classList.add("hidden");
    });
  })();

  // ABC edit + save
  document.getElementById("save-abc-btn").addEventListener("click", async () => {
    const btn    = document.getElementById("save-abc-btn");
    const status = document.getElementById("abc-status");
    const abc    = document.getElementById("abc-edit-textarea").value;
    btn.disabled = true;
    try {
      // If the tune has a PDF/photo but no ABC yet, save as a separate version
      const hasPdfOrPhoto = /\/api\/uploads\/[^\s]+(\.pdf|\.jpe?g|\.png)/i.test(tune.notes || "");
      if (hasPdfOrPhoto && !tune.abc) {
        const created = await apiFetch("/api/tunes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: tune.title, abc,
            key: tune.key || "", mode: tune.mode || "", type: tune.type || "",
            version_label: "ABC",
          }),
        });
        await apiFetch("/api/tunes/group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: tune.title,
            tune_ids: [tune.id, created.id],
            labels: ["Sheet Music", "ABC"],
          }),
        });
        status.textContent = "Saved as new version ✓";
        status.className = "notes-status notes-saved";
        await Promise.all([loadStats(), loadFilters(), loadTunes()]);
        const fresh = await fetchTune(tune.id);
        renderModal(fresh, onBack, null);
        return;
      }
      const res = await fetch(`/api/tunes/${tune.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abc }),
      });
      if (res.ok) {
        status.textContent = "Saved!";
        status.className = "notes-status notes-saved";
        renderSheetMusic(abc);
        setTimeout(() => { status.textContent = ""; }, 2000);
      } else {
        status.textContent = "Failed to save.";
        status.className = "notes-status notes-error";
      }
    } catch (err) {
      status.textContent = `Failed: ${err.message}`;
      status.className = "notes-status notes-error";
    } finally {
      btn.disabled = false;
    }
  });

  // Shared helper: receive ABC from transcription, switch to ABC tab
  function _handleTranscribeResult(abc, status) {
    const textarea = document.getElementById("abc-edit-textarea");
    if (textarea) textarea.value = abc;
    modalContent.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    modalContent.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    modalContent.querySelector('[data-tab="abc"]')?.classList.add("active");
    document.getElementById("tab-abc")?.classList.remove("hidden");
    status.textContent = "Done — check accuracy then hit Save & Re-render";
    status.className = "transcribe-status transcribe-ok";
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

  // "Add to collection" button — opens multi-select modal
  const colAddBtn  = document.getElementById("col-add-btn");
  const colStatus  = document.getElementById("col-status");

  colAddBtn.addEventListener("click", async () => {
    const [cols, memberships] = await Promise.all([
      fetchCollections(),
      _fetchTuneMemberships(tune.id).then(m => m.collections).catch(() => []),
    ]);
    const memberColIds = new Set(memberships.map(c => String(c.id)));
    const existingOptions = cols.map(c => {
      const isMember = memberColIds.has(String(c.id));
      return `<label class="bulk-col-option${isMember ? " picker-row-member" : ""}">
         <input type="checkbox" name="tune-col-pick" value="${c.id}"${isMember ? " checked" : ""} />
         ${escHtml(c.name)}${isMember ? ' <span class="picker-member-tick">✓ already in</span>' : ""}
       </label>`;
    }).join("");
    modalContent.innerHTML = `
      <button class="modal-back-btn" id="tune-col-modal-back">← Back</button>
      <h2 class="modal-title">Add to Collections</h2>
      <div class="bulk-col-list">${existingOptions || '<p class="set-add-tune-none">No collections yet.</p>'}</div>
      <div class="multi-col-new-row">
        <label class="bulk-col-option multi-col-new-label">
          <input type="checkbox" id="tune-col-new-chk" />
          <em>Create new collection…</em>
        </label>
        <input id="tune-col-new-name" type="text" class="ff-url-input" placeholder="New collection name" maxlength="120" style="display:none;margin-top:.3rem" />
      </div>
      <div class="notes-actions" style="margin-top:1.25rem">
        <button id="tune-col-confirm" class="btn-collection" disabled>Add to Collections</button>
        <button id="tune-col-cancel" class="btn-secondary">Cancel</button>
        <span id="tune-col-status" class="notes-status"></span>
      </div>`;
    const confirmBtn  = document.getElementById("tune-col-confirm");
    const newChk      = document.getElementById("tune-col-new-chk");
    const newNameIn   = document.getElementById("tune-col-new-name");
    const tcStatus    = document.getElementById("tune-col-status");

    const _updateConfirm = () => {
      const anyChecked = [...modalContent.querySelectorAll("input[name=tune-col-pick]:checked")].length > 0;
      const newValid = newChk.checked && newNameIn.value.trim().length > 0;
      confirmBtn.disabled = !(anyChecked || newValid);
    };
    modalContent.querySelectorAll("input[name=tune-col-pick]").forEach(r =>
      r.addEventListener("change", _updateConfirm)
    );
    newChk.addEventListener("change", () => {
      newNameIn.style.display = newChk.checked ? "block" : "none";
      if (newChk.checked) newNameIn.focus();
      _updateConfirm();
    });
    newNameIn.addEventListener("input", _updateConfirm);
    newNameIn.addEventListener("keydown", e => { if (e.key === "Enter") confirmBtn.click(); });

    const _goBack = () => {
      renderModal(tune, onBack, siblings);
      requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); });
    };
    document.getElementById("tune-col-modal-back").addEventListener("click", _goBack);
    document.getElementById("tune-col-cancel").addEventListener("click", _goBack);

    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Adding…";
      try {
        const selected = [...modalContent.querySelectorAll("input[name=tune-col-pick]:checked")].map(c => c.value);
        if (newChk.checked && newNameIn.value.trim()) {
          const newCol = await apiCreateCollection(newNameIn.value.trim(), "");
          selected.push(String(newCol.id));
        }
        await Promise.all(selected.map(colId => apiAddTuneToCollection(colId, tune.id)));
        await fetchCollections();
        tcStatus.textContent = `Added to ${selected.length} collection${selected.length !== 1 ? "s" : ""} ✓`;
        tcStatus.className = "notes-status notes-saved";
        setTimeout(_goBack, 900);
      } catch {
        tcStatus.textContent = "Failed — please try again.";
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Add to Collections";
      }
    });
  });

  // ── Open-session button: direct link if session_id known, else trigger inline search ──
  const openSessionBtn = document.getElementById("open-session-btn");
  if (openSessionBtn && openSessionBtn.tagName === "BUTTON") {
    openSessionBtn.addEventListener("click", async () => {
      const title = openSessionBtn.dataset.searchTitle || tune.title;
      const abcStatus = document.getElementById("fetch-abc-status");
      const abcResults = document.getElementById("session-abc-results");
      if (!abcStatus || !abcResults) return;
      openSessionBtn.disabled = true;
      openSessionBtn.textContent = "Searching…";
      abcStatus.textContent = "";
      abcResults.classList.add("hidden");
      try {
        const res = await fetch(`/api/thesession/search?q=${encodeURIComponent(title)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Search failed");
        if (!data.tunes || !data.tunes.length) {
          openSessionBtn.textContent = sessionBtnLabel;
          openSessionBtn.disabled = false;
          abcStatus.textContent = `No matches found on TheSession.org for "${escHtml(title)}".`;
          return;
        }
        openSessionBtn.textContent = sessionBtnLabel;
        openSessionBtn.disabled = false;
        abcStatus.textContent = `${data.tunes.length} match${data.tunes.length === 1 ? "" : "es"} — pick one to import ABC:`;
        abcResults.innerHTML = data.tunes.slice(0, 8).map(t => `
          <div class="session-abc-match">
            <button class="session-abc-pick" data-session-id="${t.id}">
              <strong>${escHtml(t.name)}</strong>
              <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type)}</span>
              <span class="session-abc-meta">${t.tunebooks} setting${t.tunebooks === 1 ? "" : "s"}</span>
            </button>
            <a class="btn-secondary btn-sm session-abc-view" href="https://thesession.org/tunes/${t.id}" target="_blank" rel="noopener" title="View this tune on TheSession.org before selecting">↗ View</a>
          </div>`).join("");
        abcResults.classList.remove("hidden");
        // Wire pick buttons — reuse same logic as fetchAbcBtn
        abcResults.querySelectorAll(".session-abc-pick").forEach(btn => {
          btn.addEventListener("click", async () => {
            const sessionId = btn.dataset.sessionId;
            abcResults.innerHTML = '<p class="loading" style="padding:.3rem 0">Fetching ABC…</p>';
            try {
              const fRes = await fetch(`/api/thesession/fetch/${sessionId}`);
              const sessionData = await fRes.json();
              if (!fRes.ok) throw new Error(sessionData.detail || "Fetch failed");
              const settings = sessionData.settings || [];
              if (!settings.length) { abcResults.innerHTML = "<p>No settings found.</p>"; return; }
              abcResults.innerHTML = settings.slice(0, 6).map((s, idx) => `
                <div class="session-abc-match">
                  <button class="session-abc-import" data-idx="${idx}">
                    Setting ${s.id} · ${escHtml(s.key || "")}
                  </button>
                  <a class="btn-secondary btn-sm session-abc-view"
                     href="https://thesession.org/tunes/${sessionData.session_id}#setting${s.id}"
                     target="_blank" rel="noopener" title="View this setting on TheSession.org">↗ View</a>
                </div>`).join("");
              abcResults.querySelectorAll(".session-abc-import").forEach(impBtn => {
                impBtn.addEventListener("click", async () => {
                  const s = settings[Number(impBtn.dataset.idx)];
                  impBtn.disabled = true; impBtn.textContent = "Saving…";
                  try {
                    const split = await _splitAbcAsVersionIfNeeded(
                      s.abc, "ABC (TheSession.org)", sessionData.session_id, abcStatus
                    );
                    if (split) return;
                    await apiFetch(`/api/tunes/${tune.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ abc: s.abc, session_id: String(sessionData.session_id) }),
                    });
                    tune.abc = s.abc;
                    tune.session_id = sessionData.session_id;
                    abcResults.classList.add("hidden");
                    abcStatus.textContent = "ABC saved ✓";
                    renderSheetMusic(s.abc);
                  } catch (err) {
                    abcResults.innerHTML = `<p class="import-error">Failed: ${escHtml(err.message)}</p>`;
                  }
                });
              });
            } catch (err) {
              abcResults.innerHTML = `<p class="import-error">Error: ${escHtml(err.message)}</p>`;
            }
          });
        });
      } catch (err) {
        openSessionBtn.textContent = sessionBtnLabel;
        openSessionBtn.disabled = false;
        abcStatus.textContent = `Error: ${escHtml(err.message)}`;
      }
    });
  }

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
            <a class="btn-secondary btn-sm session-abc-view" href="https://thesession.org/tunes/${t.id}" target="_blank" rel="noopener" title="View this tune on TheSession.org before selecting">↗ View</a>
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
                      <a class="btn-secondary btn-sm session-abc-view"
                         href="https://thesession.org/tunes/${fData.session_id}#setting${s.index}"
                         target="_blank" rel="noopener" title="View this setting on TheSession.org">↗ View</a>
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

    // ── Shared helper: split ABC off as its own version if tune has PDF/photo ──
    // Returns true if the ABC was split into a new version (caller should reload modal).
    // Returns false if ABC was patched directly onto the tune (caller should re-render).
    async function _splitAbcAsVersionIfNeeded(abcText, versionLabel, sessionId, statusEl) {
      const hasPdfOrPhoto = /\/api\/uploads\/[^\s]+(\.pdf|\.jpe?g|\.png)/i.test(tune.notes || "");
      if (!hasPdfOrPhoto || tune.abc) return false; // no split needed

      const created = await apiFetch("/api/tunes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: tune.title,
          abc: abcText,
          key: tune.key || "",
          mode: tune.mode || "",
          type: tune.type || "",
          version_label: versionLabel,
        }),
      });
      await apiFetch("/api/tunes/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: tune.title,
          tune_ids: [tune.id, created.id],
          labels: ["Sheet Music", versionLabel],
        }),
      });
      if (sessionId) {
        await apiFetch(`/api/tunes/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: String(sessionId) }),
        });
      }
      if (statusEl) statusEl.innerHTML = `<p style="color:var(--success);padding:.4rem .6rem">✓ ABC saved as a new version alongside the sheet music. Use the version switcher at the top to move between them.</p>`;
      await Promise.all([loadStats(), loadFilters(), loadTunes()]);
      // Reload the modal to show the version strip
      const fresh = await fetchTune(tune.id);
      renderModal(fresh, onBack, null);
      return true;
    }

    async function _applySessionAbc(tuneId, setting, sessionData) {
      try {
        const split = await _splitAbcAsVersionIfNeeded(
          setting.abc,
          "ABC (TheSession.org)",
          sessionData?.session_id || null,
          document.getElementById("fetch-abc-status") || document.getElementById("fetch-abc-status")
        );
        if (split) return;

        // Normal case: patch the ABC onto the existing tune
        await fetch(`/api/tunes/${tuneId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            abc: setting.abc,
            key: setting.key || undefined,
            mode: setting.mode || undefined,
            ...(sessionData?.session_id ? { session_id: String(sessionData.session_id) } : {}),
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



  // ── Tempo control ──────────────────────────────────────────────────────────
  const tempoDecBtn   = document.getElementById("tempo-dec");
  const tempoIncBtn   = document.getElementById("tempo-inc");
  const tempoBpmInput = document.getElementById("tempo-bpm-input");
  const tempoSetBtn   = document.getElementById("tempo-set-btn");
  const tempoStatus   = document.getElementById("tempo-status");

  if (tempoDecBtn && tempoIncBtn && tempoBpmInput && tempoSetBtn) {
    const _clampBpm = v => Math.min(400, Math.max(20, v));

    tempoDecBtn.addEventListener("click", () => {
      tempoBpmInput.value = _clampBpm((parseInt(tempoBpmInput.value) || 120) - 5);
    });
    tempoIncBtn.addEventListener("click", () => {
      tempoBpmInput.value = _clampBpm((parseInt(tempoBpmInput.value) || 120) + 5);
    });

    tempoSetBtn.addEventListener("click", async () => {
      const bpm = _clampBpm(parseInt(tempoBpmInput.value) || 120);
      tempoBpmInput.value = bpm;
      tempoSetBtn.disabled = true;
      tempoSetBtn.textContent = "Saving…";
      if (tempoStatus) tempoStatus.textContent = "";

      // Inject or replace Q: line in ABC header (before the first K: line)
      let abc = tune.abc || "";
      const qLine = "Q:1/4=" + bpm;
      const hasQ = abc.split("\n").some(l => l.startsWith("Q:"));
      if (hasQ) {
        abc = abc.split("\n").map(l => l.startsWith("Q:") ? qLine : l).join("\n");
      } else {
        // Insert before K: line
        abc = abc.split("\n").map(l => l.startsWith("K:") ? qLine + "\n" + l : l).join("\n");
      }

      try {
        await apiFetch(`/api/tunes/${tune.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ abc }),
        });
        tune.abc = abc;
        if (document.getElementById("abc-edit-textarea")) {
          document.getElementById("abc-edit-textarea").value = abc;
        }
        renderSheetMusic(abc);
        tempoSetBtn.textContent = "Set tempo";
        tempoSetBtn.disabled = false;
        if (tempoStatus) { tempoStatus.textContent = `✓ Saved — ${bpm} BPM`; setTimeout(() => { tempoStatus.textContent = ""; }, 2500); }
      } catch (err) {
        tempoSetBtn.textContent = "Set tempo";
        tempoSetBtn.disabled = false;
        if (tempoStatus) tempoStatus.textContent = `Error: ${err.message}`;
      }
    });
  }

  // Split ABC + PDF/photo into separate versions
  const splitAbcBtn = document.getElementById("split-abc-btn");
  if (splitAbcBtn) {
    splitAbcBtn.addEventListener("click", async () => {
      splitAbcBtn.disabled = true;
      splitAbcBtn.textContent = "Separating…";
      try {
        // Strip photo/PDF lines from notes — they stay on the Sheet Music version only
        function _stripMediaFromNotes(notes) {
          return (notes || "").split("\n")
            .filter(l => !/^sheet music \((PDF|image)\):/i.test(l.trim()))
            .join("\n").trim();
        }
        const abcOnlyNotes = _stripMediaFromNotes(tune.notes);

        // Create a new tune entry for the ABC (no photo/PDF in its notes)
        const abcTune = await apiFetch("/api/tunes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: tune.title,
            abc: tune.abc,
            notes: abcOnlyNotes,
            key: tune.key || "",
            mode: tune.mode || "",
            type: tune.type || "",
            version_label: "ABC",
            ...(tune.session_id ? { session_id: String(tune.session_id) } : {}),
          }),
        });
        // Remove ABC from the original tune, keep only the PDF/photo
        await apiFetch(`/api/tunes/${tune.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ abc: "" }),
        });
        // Group as versions — use existing parent if already versioned, else create new group
        const existingParentId = tune.parent_id || null;
        await apiFetch("/api/tunes/group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: tune.title,
            tune_ids: [tune.id, abcTune.id],
            labels: ["Sheet Music", "ABC"],
            ...(existingParentId ? { existing_parent_id: existingParentId } : {}),
          }),
        });
        await Promise.all([loadStats(), loadFilters(), loadTunes()]);
        const fresh = await fetchTune(tune.id);
        renderModal(fresh, onBack, null);
      } catch (err) {
        splitAbcBtn.disabled = false;
        splitAbcBtn.textContent = "Separate into versions";
        alert("Failed to separate: " + err.message);
      }
    });
  }


  // ⋯ More button — toggles sheet-music-options-panel (speed, chords, instrument, export, delete)
  const tuneMoreBtn = document.getElementById("tune-more-btn");
  const tuneOptionsPanel = document.getElementById("sheet-music-options-panel");
  if (tuneMoreBtn && tuneOptionsPanel) {
    tuneMoreBtn.addEventListener("click", () => {
      const opening = tuneOptionsPanel.classList.contains("hidden");
      tuneOptionsPanel.classList.toggle("hidden");

    });
  }

  // Options panel ✕ close button
  const optionsCloseBtn = document.getElementById("sheet-music-options-close");
  if (optionsCloseBtn) {
    optionsCloseBtn.addEventListener("click", () => {
      tuneOptionsPanel?.classList.add("hidden");

    });
  }

  // TheCraic ABC export from More menu
  const tuneExportAbcBtn = document.getElementById("tune-export-abc-btn");
  if (tuneExportAbcBtn) {
    tuneExportAbcBtn.addEventListener("click", async () => {
      tuneMoreMenu?.classList.add("hidden");
      if (!tune.abc) { alert("No ABC notation for this tune."); return; }
      const safeName = (tune.title || "tune").replace(/[^a-z0-9]/gi, "_");
      const blob = new Blob([tune.abc.trim()], { type: "application/octet-stream" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${safeName}.abc`;
      link.click();
      URL.revokeObjectURL(link.href);
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

  // Clear ABC button
  const clearAbcBtn = document.getElementById("clear-abc-btn");
  if (clearAbcBtn) {
    clearAbcBtn.addEventListener("click", async () => {
      if (!confirm("Remove the ABC notation for this tune? The sheet music will be cleared. This cannot be undone easily.")) return;
      clearAbcBtn.disabled = true;
      clearAbcBtn.textContent = "Clearing…";
      try {
        await apiFetch(`/api/tunes/${tune.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ abc: "" }),
        });
        // Reload library cards then re-render the modal
        await loadTunes();
        const fresh = await fetchTune(tune.id);
        renderModal(fresh, onBack, siblings);
        requestAnimationFrame(() => { /* no ABC to render */ });
      } catch (err) {
        clearAbcBtn.textContent = "🗑 Clear ABC";
        clearAbcBtn.disabled = false;
      }
    });
  }

  // Attach video panel
  const attachVideoBtn   = document.getElementById("attach-video-btn");
  const attachVideoPanel = document.getElementById("attach-video-panel");

  attachVideoBtn.addEventListener("click", () => {
    attachVideoPanel.classList.toggle("hidden");
    attachAudioPanel.classList.add("hidden");
  });

  attachVideoPanel.querySelectorAll(".attach-vtab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      attachVideoPanel.querySelectorAll(".attach-vtab-btn").forEach(b => b.classList.remove("active"));
      attachVideoPanel.querySelectorAll(".attach-tab-panel").forEach(p => p.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(`attach-vtab-${btn.dataset.tab}`).classList.remove("hidden");
    });
  });

  document.getElementById("attach-video-file").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById("attach-video-upload-status");
    statusEl.textContent = "Uploading…";
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/tunes/${tune.id}/upload-video`, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
      const { url } = await res.json();
      await _appendUrlToNotes(`${window.location.origin}${url}`, statusEl);
      attachVideoPanel.classList.add("hidden");
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  });

  document.getElementById("attach-video-url-btn").addEventListener("click", async () => {
    const urlInput = document.getElementById("attach-video-url-input");
    const statusEl = document.getElementById("attach-video-url-status");
    const url = urlInput.value.trim();
    if (!url) { statusEl.textContent = "Please enter a URL."; return; }
    urlInput.value = "";
    await _appendUrlToNotes(url, statusEl);
    attachVideoPanel.classList.add("hidden");
  });

  // Attach audio panel
  const attachAudioBtn    = document.getElementById("attach-audio-btn");
  const attachAudioPanel  = document.getElementById("attach-audio-panel");

  attachAudioBtn.addEventListener("click", () => {
    attachAudioPanel.classList.toggle("hidden");
    attachVideoPanel.classList.add("hidden");
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

  // Re-renders just the media play buttons in the Sheet Music tab from the
  // current tune.notes, without touching the ABC render or other controls.
  function _refreshSheetMusicMediaButtons(t) {
    const container = document.getElementById("tab-music");
    if (!container) return;
    container.querySelectorAll(".media-attachment-row, .media-inline-embed").forEach(el => el.remove());
    const urlRe = /(?:https?:\/\/|\/api\/uploads\/)[^\s<>"]+/g;
    const audioUrls = [], videoUrls = [];
    let mx;
    while ((mx = urlRe.exec(t.all_notes || t.notes || "")) !== null) {
      const u = mx[0];
      if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(u)) audioUrls.push(u);
      else if (/(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/.test(u) ||
               /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(u)) videoUrls.push(u);
    }
    const anchor = container.querySelector("#audio-player-container");
    if (!anchor) return;
    const frag = document.createDocumentFragment();
    audioUrls.forEach((u, i) => {
      const label = audioUrls.length > 1 ? ("\u25b6 Play MP3 " + (i + 1)) : "\u25b6 Play MP3";
      const row = document.createElement("div");
      row.className = "ff-download-row media-attachment-row";
      row.dataset.url = u;
      row.dataset.mediaType = "audio";
      row.innerHTML = "<button class=\"btn-secondary media-play-btn\" data-url=\"" + escHtml(u) + "\" data-media-type=\"audio\">" + label + "</button>"
        + "<button class=\"btn-icon media-remove-btn\" data-url=\"" + escHtml(u) + "\" title=\"Remove this audio attachment\">\u1f5d1</button>";
      frag.appendChild(row);
    });
    videoUrls.forEach((u, i) => {
      const label = videoUrls.length > 1 ? ("\u25b6 Play video " + (i + 1)) : "\u25b6 Play video";
      const safeId = "embed-" + u.replace(/[^a-z0-9]/gi, "_").slice(0, 30);
      const row = document.createElement("div");
      row.className = "ff-download-row media-attachment-row";
      row.dataset.url = u;
      row.dataset.mediaType = "video";
      row.innerHTML = "<button class=\"btn-secondary media-embed-btn\" data-url=\"" + escHtml(u) + "\">" + label + "</button>"
        + "<a class=\"btn-secondary btn-sm\" href=\"" + escHtml(u) + "\" target=\"_blank\" rel=\"noopener\">\u2197</a>"
        + "<button class=\"btn-icon media-remove-btn\" data-url=\"" + escHtml(u) + "\" title=\"Remove this video attachment\">\u1f5d1</button>";
      const embedDiv = document.createElement("div");
      embedDiv.className = "media-inline-embed hidden";
      embedDiv.id = safeId;
      frag.appendChild(row);
      frag.appendChild(embedDiv);
    });
    anchor.before(frag);
  }

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
      // Refresh media buttons in Sheet Music tab too
      _refreshSheetMusicMediaButtons(tune);
      if (statusEl) statusEl.textContent = "";
      attachAudioPanel.classList.add("hidden");
      attachVideoPanel.classList.add("hidden");
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error: ${err.message}`;
    }
  }

  // Upload tab
  document.getElementById("attach-audio-file").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const chosenEl = document.getElementById("attach-audio-chosen");
    if (chosenEl) chosenEl.textContent = file.name;
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

  // Explicit file picker button (more reliable than label in Safari)
  const attachAudioChooseBtn = document.getElementById("attach-audio-choose-btn");
  const attachAudioChosen    = document.getElementById("attach-audio-chosen");
  if (attachAudioChooseBtn) {
    attachAudioChooseBtn.addEventListener("click", () => {
      document.getElementById("attach-audio-file").click();
    });
  }

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
        window._loadRecentImports?.();
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
        window._loadRecentImports?.();
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

  // ── Transpose controls ────────────────────────────────────────────────
  let _transposeSteps = 0;
  const _transposeLabel = document.getElementById("transpose-label");
  const _transposeUp    = document.getElementById("transpose-up-btn");
  const _transposeDown  = document.getElementById("transpose-down-btn");
  const _transposeReset = document.getElementById("transpose-reset-btn");
  function _applyTranspose() {
    if (_transposeLabel) _transposeLabel.textContent = _transposeSteps > 0 ? "+" + _transposeSteps : String(_transposeSteps);
    if (tune.abc) renderSheetMusic(tune.abc, { visualTranspose: _transposeSteps });
  }
  _transposeUp?.addEventListener("click",    () => { _transposeSteps++; _applyTranspose(); });
  _transposeDown?.addEventListener("click",  () => { _transposeSteps--; _applyTranspose(); });
  _transposeReset?.addEventListener("click", () => { _transposeSteps = 0; _applyTranspose(); });

    }
  });

  // Populate membership line asynchronously
  _fetchTuneMemberships(tune.id).then(({ collections, sets }) => {
    const el = document.getElementById("modal-membership");
    if (!el) return;
          const rows = [];
      if (sets.length) rows.push(
        `<div class="modal-membership-row">` +
        `<span class="modal-membership-label">☰ Sets</span>` +
        sets.map(s => `<a class="modal-membership-link" data-set-id="${s.id}">${escHtml(s.name)}</a>`).join(", ") +
        `</div>`
      );
      if (collections.length) rows.push(
        `<div class="modal-membership-row">` +
        `<span class="modal-membership-label">📁 Collections</span>` +
        collections.map(c => `<a class="modal-membership-link" data-col-id="${c.id}">${escHtml(c.name)}</a>`).join(", ") +
        `</div>`
      );
      if (rows.length) el.innerHTML = rows.join("");
  }).catch(() => {});

    // Print / PDF — tune sheet music
    const _printTunePdfBtn = document.getElementById('print-tune-pdf-btn');
    if (_printTunePdfBtn) {
      _printTunePdfBtn.addEventListener('click', () => {
        const render = document.getElementById('sheet-music-render');
        if (!render || !render.querySelector('svg')) { alert('No sheet music rendered yet.'); return; }
        const win = window.open('', '_blank');
        if (!win) { alert('Please allow popups for this page to use Print.'); return; }
        win.document.write('<!DOCTYPE html><html><head><title>' + escHtml(tune.title) + '</title>'
          + '<style>body{margin:1.5cm;font-family:sans-serif}h2{font-size:14pt}'
          + 'svg{max-width:100%;display:block}@media print{button{display:none}}</style></head><body>'
          + '<h2>' + escHtml(tune.title) + '</h2>'
          + render.innerHTML
          + '<scr' + 'ipt>window.onload=()=>window.print();</scr' + 'ipt></body></html>');
        win.document.close();
      });
    }

  // Full-screen button
  const abcFsBtn = document.getElementById("abc-fs-btn");
  if (abcFsBtn) {
    abcFsBtn.addEventListener("click", () => {
      if (_synthController) { try { _synthController.pause(); } catch {} }
      openAbcFullscreen(tune.abc, tune.title);
    });
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
let _barLooping = false;    // user's loop toggle (independent of ABCJS loop button)
let _loopSeeking = false;   // guard against rapid re-fires of the loop seek

// ── Persistent bar highlights ────────────────────────────────────────────────
let _highlightMode = false;       // true = clicks toggle highlights, not playback selection
let _tuneHighlights = new Set();  // set of bar indices (into _barMap) that are highlighted
let _highlightTuneId = null;      // which tune the highlights belong to

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
  if (_highlightMode) {
    _tuneHighlights.has(idx) ? _tuneHighlights.delete(idx) : _tuneHighlights.add(idx);
    _applyHighlights();
    _saveHighlights();
  } else {
    _onMeasureClicked(idx);
  }
}

function _onMeasureClicked(m) {
  const { start, end } = _barSel;

  if (start === null) {
    // First click: set start, wait for end click (end=null means pending)
    _barSel = { start: m, end: null };
  } else if (end === null) {
    // Second click: confirm selection — same bar is valid (single-bar loop)
    _barSel = { start: Math.min(start, m), end: Math.max(start, m) };
    _barLooping = true;   // auto-enable loop when range confirmed
  } else {
    // Range already confirmed → start fresh
    _barSel = { start: m, end: null };
    _barLooping = false;
  }

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

function _applyHighlights() {
  document.querySelectorAll("#sheet-music-render .bar-pinned")
    .forEach(el => el.classList.remove("bar-pinned"));
  if (_tuneHighlights.size === 0) return;
  if (_barMap.length === 0) _barMap = _buildBarMap();
  _tuneHighlights.forEach(idx => {
    if (idx >= _barMap.length) return;
    const { wrapper, measure } = _barMap[idx];
    wrapper.querySelectorAll(`.abcjs-m${measure}`)
      .forEach(el => el.classList.add("bar-pinned"));
  });
  const clearBtn = document.getElementById("highlight-clear-btn");
  if (clearBtn) clearBtn.classList.remove("hidden");
}

async function _saveHighlights() {
  if (!_highlightTuneId) return;
  const clearBtn = document.getElementById("highlight-clear-btn");
  if (clearBtn) {
    _tuneHighlights.size > 0 ? clearBtn.classList.remove("hidden") : clearBtn.classList.add("hidden");
  }
  await fetch(`/api/tunes/${_highlightTuneId}/highlights`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ highlights: [..._tuneHighlights] }),
  }).catch(() => {});
}

function _updateSelectionInfo() {
  const el = document.getElementById("bar-selection-info");
  if (!el) return;
  if (_barSel.start === null) { el.classList.add("hidden"); return; }

  const isPending = _barSel.end === null;
  const lo = _barSel.start + 1;
  const hi = (isPending ? _barSel.start : _barSel.end) + 1;
  const label = lo === hi ? `Bar ${lo}` : `Bars ${lo}–${hi}`;

  el.classList.remove("hidden");
  if (isPending) {
    el.innerHTML = `<span>${label} — click another bar to extend, or same bar again to loop</span>`
      + `<button class="btn-secondary bar-sel-clear">Clear</button>`;
  } else {
    const loopActive = _barLooping;
    el.innerHTML = `<span>${label}</span>`
      + `<button class="btn-secondary bar-loop-toggle${loopActive ? " loop-active" : ""}" title="Toggle looping">`
      + `${loopActive ? "⟳ Looping" : "⟳ Loop off"}</button>`
      + `<button class="btn-secondary bar-sel-clear">Clear</button>`;
    el.querySelector(".bar-loop-toggle").addEventListener("click", () => {
      _barLooping = !_barLooping;
      _updateSelectionInfo();
    });
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
  // If we have some timing data, interpolate from the last known bar
  const keys = Object.keys(_barFirstMs).map(Number).sort((a,b) => a-b);
  if (keys.length > 1 && _msPerMeasure) {
    const lastKey = keys[keys.length - 1];
    return _barFirstMs[lastKey] + (barIndex - lastKey) * _msPerMeasure;
  }
  if (!_msPerMeasure) return 0;
  return barIndex * _msPerMeasure;
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
  _barLooping = false;
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

// ── Inline MP3 player (music tab) ─────────────────────────────────────────────
function _playInlineMp3(url) {
  const player = document.getElementById("inline-mp3-player");
  if (!player) { openMediaOverlay(url, "audio"); return; }
  if (player.src && new URL(player.src).href === new URL(url, location.href).href && !player.paused) {
    player.pause();
    return;
  }
  player.src = url;
  player.classList.remove("hidden");
  player.play().catch(() => {});
}

// ── Metronome (Web Audio API) ─────────────────────────────────────────────────
let _metCtx      = null;
let _metPlaying  = false;
let _metBpm      = 120;
let _metNextBeat = 0;
let _metTimer    = null;
let _metTapTimes = [];
let _metEnabled  = false;   // user has toggled the metronome on
let _metSyncToAbc = true;   // auto start/stop with ABC playback
let _metVolume   = 0.7;     // 0.0–1.0

function _metSchedule() {
  if (!_metPlaying || !_metCtx) return;
  const interval = 60 / _metBpm;
  while (_metNextBeat < _metCtx.currentTime + 0.1) {
    const osc  = _metCtx.createOscillator();
    const gain = _metCtx.createGain();
    osc.connect(gain);
    gain.connect(_metCtx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(_metVolume, _metNextBeat);
    gain.gain.exponentialRampToValueAtTime(0.001, _metNextBeat + 0.04);
    osc.start(_metNextBeat);
    osc.stop(_metNextBeat + 0.05);
    _metNextBeat += interval;
  }
  _metTimer = setTimeout(_metSchedule, 25);
}

function _updateMetronomeBtn() {
  const toggleBtn = document.getElementById("metro-toggle");
  const controls  = document.getElementById("metro-controls");
  const syncBadge = document.getElementById("metro-sync-badge");
  if (!toggleBtn) return;
  if (_metEnabled) {
    toggleBtn.textContent = "♩ Metro ON";
    toggleBtn.classList.add("active");
    if (controls) controls.classList.remove("hidden");
    if (syncBadge) {
      syncBadge.textContent = _metSyncToAbc ? "Synced" : "Free";
      syncBadge.className = "metro-sync-badge " + (_metSyncToAbc ? "metro-sync" : "metro-free");
    }
  } else {
    toggleBtn.textContent = "♩ Metronome";
    toggleBtn.classList.remove("active");
    if (controls) controls.classList.add("hidden");
  }
}

function _startMetronome(bpm) {
  if (bpm) _metBpm = bpm;
  // Recreate context if it was closed or is in an unrecoverable state
  if (!_metCtx || _metCtx.state === "closed") {
    _metCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_metCtx.state === "suspended" || _metCtx.state === "interrupted") {
    _metCtx.resume().catch(() => {});
  }
  _metPlaying = true;
  _metNextBeat = _metCtx.currentTime + 0.05;
  if (_metTimer) clearTimeout(_metTimer);
  _metSchedule();
}

function _stopMetronome() {
  _metPlaying = false;
  if (_metTimer) { clearTimeout(_metTimer); _metTimer = null; }
}

function _extractAbcBpm(abc) {
  const m = abc && abc.match(/Q:[^=\n]*=\s*(\d+)|Q:\s*(\d+)/);
  return m ? parseInt(m[1] || m[2]) : null;
}

function _initMetronomeUI(defaultBpm) {
  const toggleBtn = document.getElementById("metro-toggle");
  const bpmInput  = document.getElementById("metro-bpm");
  const decBtn    = document.getElementById("metro-dec");
  const incBtn    = document.getElementById("metro-inc");
  const tapBtn    = document.getElementById("metro-tap");
  const volSlider = document.getElementById("metro-vol");
  if (!toggleBtn) return;

  if (defaultBpm && defaultBpm > 0) {
    _metBpm = defaultBpm;
    if (bpmInput) bpmInput.value = defaultBpm;
  }

  // Sync volume slider to current _metVolume
  if (volSlider) volSlider.value = Math.round(_metVolume * 100);

  // Sync toggle state (modal may have been re-rendered while metronome was running)
  _updateMetronomeBtn();

  // ── Toggle button: on→off resets to sync mode; off→on starts immediately ──
  toggleBtn.addEventListener("click", () => {
    if (_metEnabled) {
      // Turn off
      _metEnabled = false;
      _metSyncToAbc = true;   // reset to sync for next enable
      _stopMetronome();
    } else {
      // Turn on — start immediately so user can hear it; music will re-sync on play
      _metEnabled = true;
      _metSyncToAbc = true;
      _startMetronome(parseInt(bpmInput?.value) || _metBpm || 120);
    }
    _updateMetronomeBtn();
  });

  if (bpmInput) {
    bpmInput.addEventListener("input", () => {
      const v = parseInt(bpmInput.value);
      if (v >= 20 && v <= 400) {
        _metBpm = v;
        if (_metPlaying) { _stopMetronome(); _startMetronome(v); }
      }
    });
  }

  decBtn?.addEventListener("click", () => {
    const v = Math.max(20, _metBpm - 5);
    if (bpmInput) bpmInput.value = v;
    _metBpm = v;
    if (_metPlaying) { _stopMetronome(); _startMetronome(v); }
  });

  incBtn?.addEventListener("click", () => {
    const v = Math.min(400, _metBpm + 5);
    if (bpmInput) bpmInput.value = v;
    _metBpm = v;
    if (_metPlaying) { _stopMetronome(); _startMetronome(v); }
  });

  // ── Tap: calculates BPM, switches to free (non-sync) mode ──
  tapBtn?.addEventListener("click", () => {
    const now = Date.now();
    _metTapTimes = _metTapTimes.filter(t => now - t < 3000);
    _metTapTimes.push(now);
    if (_metTapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < _metTapTimes.length; i++) intervals.push(_metTapTimes[i] - _metTapTimes[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.min(400, Math.max(20, Math.round(60000 / avg)));
      if (bpmInput) bpmInput.value = bpm;
      _metBpm = bpm;
      // Tap = override sync, start immediately in free mode
      _metEnabled = true;
      _metSyncToAbc = false;
      _stopMetronome();
      _startMetronome(bpm);
      _updateMetronomeBtn();
    }
  });

  // ── Volume slider ──
  volSlider?.addEventListener("input", () => {
    _metVolume = volSlider.valueAsNumber / 100;
  });
}

// ── Instrument / accompaniment controls ───────────────────────────────────────
let _melodyProgram = 73;  // default: flute
let _chordProgram  = 24;  // default: nylon guitar
let _chordsOff     = false;
let _currentTuneAbc = null;  // raw ABC for the active tune (used when re-rendering on chord change)

/** Inject %%chordprog N into the ABC header (before K:) so ABCJS reads it
 *  from the tune's formatting object.  %%chordprog is a formatting directive —
 *  it must be in the header for ABCJS to pick it up via n.formatting.chordprog.
 *
 *  Melody instrument is set via the `program:` option on SynthController.setTune,
 *  which overrides the default (0 = piano) for the entire playback sequence.
 *
 *  Note: %%MIDI directives are stripped by expandAbcRepeats(), so we use the
 *  bare %% form (%%chordprog, not %%MIDI chordprog).
 */
function _injectChordProg(abc) {
  if (!abc) return abc;
  // Strip any existing %%chordprog directives to avoid duplicates
  let out = abc.replace(/^%%chordprog[^\n]*\n?/gm, '');
  if (_chordsOff) return out;
  // Inject BEFORE the K: line — header position so ABCJS formatting reads it
  out = out.replace(/^(K:[^\n]*)$/m, `%%chordprog ${_chordProgram}\n$1`);
  return out;
}

function _initMelodyControls() {
  const sel = document.getElementById("melody-program-select");
  if (!sel || sel.dataset.initialized) return;
  sel.dataset.initialized = "1";
  sel.value = String(_melodyProgram);
  sel.addEventListener("change", () => {
    _melodyProgram = parseInt(sel.value) || 73;
    // Re-render so %%instrument N is baked into the visual object's note data
    if (_currentTuneAbc) renderSheetMusic(_currentTuneAbc);
  });
}

function _initChordControls() {
  const sel = document.getElementById("chord-program-select");
  if (!sel || sel.dataset.initialized) return;
  sel.dataset.initialized = "1";
  // Restore previous selection
  sel.value = _chordsOff ? "-1" : String(_chordProgram);
  if (!_chordsOff && sel.value !== String(_chordProgram)) sel.value = "-1";
  sel.addEventListener("change", () => {
    const prog = parseInt(sel.value);
    _chordsOff    = prog === -1;
    _chordProgram = _chordsOff ? _chordProgram : prog;
    // Chord program is baked into the ABC via %%chordprog — must re-render to apply
    if (_currentTuneAbc) renderSheetMusic(_currentTuneAbc);
  });
}

// Render ABC into a hidden div — provides audio player without showing notation.
// Used when the current version has no ABC but a sibling does.
function renderSheetMusicAudioOnly(abc) {
  const hiddenContainer = document.getElementById("sheet-music-render-hidden");
  if (!hiddenContainer || typeof ABCJS === "undefined") return;

  _currentTuneAbc = abc;
  if (_synthController) { try { _synthController.pause(); } catch {} }
  _synthController = null;

  try {
    const _processedAbc = expandAbcRepeats(_injectChordProg(abc));
    const visualObjs = ABCJS.renderAbc("sheet-music-render-hidden", _processedAbc, {
      add_classes: true, staffwidth: 800,
    });
    if (!visualObjs?.length) return;
    _visualObj = visualObjs[0];

    if (!ABCJS.synth || !ABCJS.synth.supportsAudio()) return;

    const cursorControl = {
      onEvent() {},
      onFinished() {},
    };
    _synthController = new ABCJS.synth.SynthController();
    _synthController.load("#audio-player-container", cursorControl, {
      displayLoop: false, displayRestart: true, displayPlay: true,
      displayProgress: true, displayWarp: true,
    });
    _synthController.setTune(_visualObj, false, { program: _melodyProgram, chordsOff: _chordsOff })
      .catch(() => {});
    _initMetronomeUI(_extractAbcBpm(abc));
    _initMelodyControls();
  } catch (err) {
    console.warn("Audio-only render failed:", err);
  }
}

function renderSheetMusic(abc, opts = {}) {
  const container = document.getElementById("sheet-music-render");
  if (!container || typeof ABCJS === "undefined") return;

  // Store raw ABC so instrument-change handlers can call renderSheetMusic again
  _currentTuneAbc = abc;

  // Reset bar selection state for new tune
  _barSel = { start: null, end: null };
  _barMap = [];
  _visualObj = null;
  // Stop any currently playing audio before re-rendering
  if (_synthController) { try { _synthController.pause(); } catch {} }
  _synthController = null;
  _msPerMeasure = null;
  _loopSeeking = false;
  _stopMetronome();
  _barFirstMs = {};
  const infoEl = document.getElementById("bar-selection-info");
  if (infoEl) infoEl.classList.add("hidden");

  // Attach bar-selection click listener in capture phase so it fires even if
  // ABCJS stops propagation on its own SVG click handlers.
  container.addEventListener("click", _sheetMusicClickHandler, true);

  try {
    // Inject %%chordprog (header) for chord instrument; melody program is passed
    // via setTune program: option so no ABC injection is needed for melody.
    const _processedAbc = expandAbcRepeats(_injectChordProg(abc));
    // Use explicit staffwidth — responsive:"resize" produces 0 lines in abcjs 6.4.4
    // when called from inside a modal (ResizeObserver quirk).
    // NOTE: abcjs ignores staffwidth when `wrap` is also set, so do NOT pass wrap here.
    // Fallback to 600 so narrow/unmeasured containers still render full staves.
    const visualObjs = ABCJS.renderAbc("sheet-music-render", _processedAbc, {
      responsive: "resize",
        visualTranspose: opts.visualTranspose || 0,
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
    // Re-apply persistent highlights after render
    requestAnimationFrame(() => {
      _barMap = _buildBarMap();
      _applyHighlights();
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
      onStart() {
        // Build the accurate bar→MIDI-time map from ABCJS's pre-computed noteTimings.
        _buildBarTimingMap();
        // Seek to selected bar synchronously on (re)start — avoids briefly playing
        // from bar 0 before the seek fires.  Handles warp changes and loop restarts.
        if (_barSel.start !== null && _synthController) {
          _seekToBar(_barSel.start);
          _barSeekPending = false;
        }
        // Auto-start metronome in sync mode
        if (_metEnabled && _metSyncToAbc) {
          _startMetronome();
        }
      },
      onEvent(ev) {        document.querySelectorAll("#sheet-music-render .abcjs-highlight")
          .forEach(el => el.classList.remove("abcjs-highlight"));
        if (ev && ev.elements) {
          ev.elements.forEach(grp => {
            if (grp) grp.forEach(el => el.classList.add("abcjs-highlight"));
          });
        }
        // Bar-range loop: controlled by our own _barLooping toggle (not the
        // ABCJS loop button) so it survives warp/speed changes.
        if (!_loopSeeking && _barLooping
            && _barSel.start !== null && _barSel.end !== null && ev) {
          const endTimeMs = Object.prototype.hasOwnProperty.call(_barFirstMs, _barSel.end + 1)
            ? _barFirstMs[_barSel.end + 1]
            : _barMs(_barSel.end) + (_msPerMeasure || 0);
          if (ev.milliseconds >= endTimeMs) {
            _loopSeeking = true;
            // Delay seek slightly so _barFirstMs is fully populated before seeking
            const _loopStart = _barSel.start;
            setTimeout(() => {
              if (_barLooping && _barSel.start !== null) {
                _seekToBar(_loopStart);
              }
              setTimeout(() => { _loopSeeking = false; }, 250);
            }, 30);
          }
        }
      },
      onFinished() {
        document.querySelectorAll("#sheet-music-render .abcjs-highlight")
          .forEach(el => el.classList.remove("abcjs-highlight"));
        // If looping, restart — but skip if a seek is already in flight (race
        // condition: loop endpoint detected in onEvent, tune still finished before
        // seek took effect).  onStart will immediately seek to selection start.
        if (_barLooping && _barSel.start !== null && _synthController && !_loopSeeking) {
          // Pre-seek to loop start BEFORE calling play(), so ABCJS doesn't
          // briefly play from bar 0 while waiting for onStart to fire.
          _seekToBar(_barSel.start);
          _barSeekPending = true;
          try { _synthController.play(); } catch {}
        } else if (_metSyncToAbc) {
          // Auto-stop metronome when music finishes (sync mode only)
          _stopMetronome();
          _updateMetronomeBtn();
        }
      },
    };

    _synthController = new ABCJS.synth.SynthController();
    _synthController.load("#audio-player-container", cursorControl, {
      displayLoop: false,
      displayRestart: true,
      displayPlay: true,
      displayProgress: true,
      displayWarp: true,
    });

    // Melody: program: option.  Chord instrument: baked into ABC via %%chordprog.
    // chordsOff: passed as option (ABCJS honours it even when %%chordprog is present).
    const _setTuneOpts = { program: _melodyProgram, chordsOff: _chordsOff };
    _synthController.setTune(_visualObj, false, _setTuneOpts).catch(err => {
      console.warn("Audio init failed:", err);
    });

    // Init metronome UI with BPM from ABC
    _initMetronomeUI(_extractAbcBpm(abc));

    // Init instrument selectors (dataset.initialized prevents double-binding on re-render)
    _initMelodyControls();
    _initChordControls();

    // Resume AudioContext on click (browsers suspend it until a user gesture).
    // Use capture phase so we fire before ABCJS's own click handler.
    const _playerContainer = document.getElementById("audio-player-container");
    if (_playerContainer) {
      _playerContainer.addEventListener("click", () => {
        try {
          const ctx = ABCJS.synth.activeAudioContext?.();
          if (ctx && ctx.state === "suspended") ctx.resume();
        } catch {}
      }, { capture: true, once: false });
    }
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
let _fsLooping      = false;   // user's loop toggle for fullscreen
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
  const label = lo === hi ? `Bar ${lo}` : `Bars ${lo}–${hi}`;
  el.classList.remove("hidden");
  if (pending) {
    el.innerHTML = `<span>${label} — tap another to extend, or same bar to loop just this one</span>`
      + `<button class="btn-secondary bar-sel-clear">✕</button>`;
  } else {
    el.innerHTML = `<span>${label}</span>`
      + `<button class="btn-secondary bar-loop-toggle${_fsLooping ? " loop-active" : ""}">`
      + `${_fsLooping ? "⟳ Looping" : "⟳ Loop off"}</button>`
      + `<button class="btn-secondary bar-sel-clear">✕</button>`;
    el.querySelector(".bar-loop-toggle").addEventListener("click", () => {
      _fsLooping = !_fsLooping;
      _updateFsSelectionInfo();
    });
  }
  el.querySelector(".bar-sel-clear").addEventListener("click", _clearFsBarSel);
}

function _clearFsBarSel() {
  _fsBarSel = { start: null, end: null };
  _fsLooping = false;
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
    _fsLooping = true;   // auto-enable loop when range confirmed
  } else {
    _fsBarSel = { start: idx, end: null };
    _fsLooping = false;
  }
  _fsBarSeekPending = true;
  _updateFsBarHighlight();
  _updateFsSelectionInfo();
  if (_fsBarSel.start !== null) _fsSeekToBar(_fsBarSel.start);
}

let _fsCurrentOpts = null;
let _fsResizeHandler = null;


// Global fullscreen More button toggle — called from HTML onclick + ontouchstart
window._ceolMoreToggle = function(e) {
  if (e) { e.stopPropagation(); }
  const overlay = document.getElementById("abc-fullscreen-overlay");
  if (overlay) overlay.classList.toggle("fs-ctrl-hidden");
};
function openAbcFullscreen(abc, title, opts = {}) {
  _fsCurrentOpts = arguments[0];  // store for resize re-render
  const { tuneRanges = null, tuneColors = null, tuneNames = null, tuneAbcs = null, initialWarp = null, pracSettings = null } = opts;
  _abcFsTitleEl.textContent = title || "";
  // Show coloured tune name pills for sets
  const existingPills = document.getElementById("abc-fs-tune-pills");
  if (existingPills) existingPills.remove();
  if (tuneNames && tuneColors && tuneNames.length > 1) {
    const pillsRow = document.createElement("div");
    pillsRow.id = "abc-fs-tune-pills";
    pillsRow.style.cssText = "display:flex;flex-wrap:wrap;gap:.35rem;padding:.3rem .75rem .2rem;background:#f8fafc;border-bottom:1px solid #e2e8f0;";
    tuneNames.forEach((name, i) => {
      const pill = document.createElement("span");
      pill.textContent = name;
      pill.style.cssText = `background:${tuneColors[i % tuneColors.length]};color:#fff;padding:.15rem .55rem;border-radius:20px;font-size:.75rem;font-weight:600;`;
      pillsRow.appendChild(pill);
    });
    _abcFsTitleEl.closest(".abc-fullscreen-header").after(pillsRow);
  }
  window._fsDebugLogged = false;
  _abcFsOverlay.classList.remove("hidden");

  // Re-render on rotate / resize so portrait↔landscape always fits
  if (_fsResizeHandler) window.removeEventListener('resize', _fsResizeHandler);
  _fsResizeHandler = () => { if (_fsCurrentOpts) openAbcFullscreen(_fsCurrentOpts); };
  window.addEventListener('resize', _fsResizeHandler);
  document.body.style.overflow = "hidden";
  // Landscape More toggle: inject a ⋯ button into the FS header if not already there
    // Wire the static ⋯ More button in FS header
    // Wire static ⋯ More button in FS header
    // Wire static ⋯ More button — toggle playback controls
    const _fsMB = document.getElementById("abc-fs-more-btn");
    if (_fsMB && !_fsMB.dataset.wired) {
      _fsMB.dataset.wired = "1";
      _fsMB.addEventListener("click", () => {
        // CSS class toggle — also handled by inline onclick for iOS reliability
        _abcFsOverlay.classList.toggle("fs-ctrl-hidden");
      });
    }

  // Reset fullscreen bar-selection state
  _fsBarSel = { start: null, end: null };
  _fsLooping = false;
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
    // On mobile: fewer measures = bigger notes. 2 measures per line on small screens.
    const measuresPerLine = w > 800 ? 4 : w > 500 ? 3 : 2; // max 4 bars per row on mobile
    const staffWidth = Math.max(300, w - 32);

    const renderEl = document.getElementById("abc-fullscreen-render");

    // SET FULLSCREEN: render each tune as a separate coloured section
    if (tuneAbcs && tuneNames && tuneColors && tuneAbcs.length > 1) {
      renderEl.innerHTML = "";
      tuneAbcs.forEach((tuneAbc, i) => {
        const color = tuneColors[i % tuneColors.length];
        const section = document.createElement("div");
        section.className = "fs-set-tune-section";
        section.style.cssText = `border-left: 4px solid ${color}; margin-bottom: 1.5rem; padding-left: .5rem;`;
        const titleEl = document.createElement("div");
        titleEl.className = "fs-set-tune-title";
        titleEl.textContent = `${i + 1}. ${tuneNames[i] || ""}`;
        titleEl.style.cssText = `color: ${color}; font-weight: 700; font-size: 1rem; margin-bottom: .25rem;`;
        section.appendChild(titleEl);
        const renderDiv = document.createElement("div");
        renderDiv.id = `fs-tune-render-${i}`;
        section.appendChild(renderDiv);
        renderEl.appendChild(section);
        try {
          ABCJS.renderAbc(`fs-tune-render-${i}`, expandAbcRepeats(tuneAbc), {
            responsive: "resize",
            wrap: { preferredMeasuresPerLine: measuresPerLine },
            add_classes: true,
            paddingbottom: 10, paddingleft: 10, paddingright: 10, paddingtop: 10,
            staffwidth: staffWidth,
            foregroundColor: color,
            selectTypes: false,
          });
        } catch(e) {}
      });
      // Hidden combined render for synth cursor tracking
      const abcToRender = tuneRanges ? abc : expandAbcRepeats(abc);
      let hiddenDiv = document.getElementById("abc-fs-hidden-render");
      if (!hiddenDiv) {
        hiddenDiv = document.createElement("div");
        hiddenDiv.id = "abc-fs-hidden-render";
        hiddenDiv.style.cssText = "position:absolute;left:-9999px;width:600px;height:1px;overflow:hidden;pointer-events:none;";
        document.body.appendChild(hiddenDiv);
      }
      const hiddenVisuals = ABCJS.renderAbc("abc-fs-hidden-render", abcToRender, { add_classes: true, staffwidth: 600 });
      _abcFsVisualObj = hiddenVisuals && hiddenVisuals[0] ? hiddenVisuals[0] : null;
      // Build hidden→visible note map (by index) for cursor highlighting
      const hiddenNotes = [...document.querySelectorAll("#abc-fs-hidden-render .abcjs-note")];
      const visibleNotes = [];
      tuneAbcs.forEach((_, i) => {
        document.querySelectorAll(`#fs-tune-render-${i} .abcjs-note`).forEach(el => visibleNotes.push(el));
      });
      // Tune-segmented map: slice hidden notes by per-tune visible counts
      // so inline key/meter changes in the combined ABC don't shift alignment
      window._fsHiddenToVis = new Map();
      let _hiddenCursor = 0;
      tuneAbcs.forEach((_, _ti) => {
        const _tuneVis = [...document.querySelectorAll(`#fs-tune-render-${_ti} .abcjs-note`)];
        for (let _j = 0; _j < _tuneVis.length && (_hiddenCursor + _j) < hiddenNotes.length; _j++) {
          window._fsHiddenToVis.set(hiddenNotes[_hiddenCursor + _j], _tuneVis[_j]);
        }
        _hiddenCursor += _tuneVis.length;
      });
    } else {
      window._fsHiddenToVis = null;
      // SINGLE TUNE FULLSCREEN: render normally
      const visualObjs = ABCJS.renderAbc("abc-fullscreen-render", expandAbcRepeats(abc), {
        responsive: "resize",
        wrap: { preferredMeasuresPerLine: measuresPerLine },
        add_classes: true,
        paddingbottom: 10, paddingleft: 10, paddingright: 10, paddingtop: 10,
        staffwidth: staffWidth,
        selectTypes: false,
        foregroundColor: "#000000",
      });
      _abcFsVisualObj = visualObjs && visualObjs[0] ? visualObjs[0] : null;
    }

    _fsMsPerMeasure = _abcFsVisualObj && typeof _abcFsVisualObj.millisecondsPerMeasure === "function"
      ? _abcFsVisualObj.millisecondsPerMeasure()
      : null;

    // Wire bar-selection click handler
    const renderElClick = document.getElementById("abc-fullscreen-render");
    if (renderElClick) {
      renderElClick.removeEventListener("click", _fsMeasureClickHandler, true);
      renderElClick.addEventListener("click", _fsMeasureClickHandler, true);
    }

    // Set up synth playback with full cursor + loop logic
    const audioContainer = document.getElementById("abc-fs-audio");
    if (audioContainer && _abcFsVisualObj) {
      audioContainer.innerHTML = "";

      const cursorControl = {
        onStart() {
          _fsBuildTimingMap();
          // Seek to selected bar immediately on (re)start — same fix as modal.
          if (_fsBarSel.start !== null) {
            setTimeout(() => { if (_abcFsSynthCtrl) _fsSeekToBar(_fsBarSel.start); }, 0);
          }
        },
        onEvent(ev) {          // Highlight current note
          if (tuneRanges && tuneColors) {
            // Restore pre-colored fills instead of clearing to black
            _fsLastHighlighted.forEach(el => {
              if (el._fsPreColor) el.style.fill = el._fsPreColor;
            });
            _fsLastHighlighted = [];
            if (ev?.elements) {
              const sc = ev.startChar ?? -1;
              let tuneIdx = tuneRanges.length - 1;
              for (let i = 0; i < tuneRanges.length; i++) {
                if (sc >= tuneRanges[i].start && sc <= tuneRanges[i].end) { tuneIdx = i; break; }
              }
              const color = tuneColors[tuneIdx % tuneColors.length];
              const brightColor = "#ff6b35"; // distinct highlight colour
              if (window._fsHiddenToVis) {
                // Set mode: highlight in visible renders via the map
                ev.elements.forEach(grp => {
                  if (!grp) return;
                  grp.forEach(hiddenEl => {
                    const visEl = window._fsHiddenToVis.get(hiddenEl);
                    if (visEl) {
                      if (!visEl._fsPreColor) visEl._fsPreColor = color;
                      visEl.style.fill = brightColor;
                      _fsLastHighlighted.push(visEl);
                    }
                  });
                });
              } else {
                // Single tune mode: highlight directly
                ev.elements.forEach(grp => {
                  if (!grp) return;
                  grp.forEach(el => {
                    if (!el._fsPreColor) el._fsPreColor = "#000000";
                    el.style.fill = brightColor;
                    _fsLastHighlighted.push(el);
                  });
                });
              }
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

          // Bar-range loop: controlled by _fsLooping (not ABCJS loop button)
          if (!_fsLoopSeeking && _fsLooping
              && _fsBarSel.start !== null && _fsBarSel.end !== null && ev) {
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
          // If looping, restart from selection start
          if (_fsLooping && _fsBarSel.start !== null && _abcFsSynthCtrl) {
            _fsBarSeekPending = true;
            try { _abcFsSynthCtrl.play(); } catch {}
          }
        },
      };

      _abcFsSynthCtrl = new ABCJS.synth.SynthController();
      _abcFsSynthCtrl.load("#abc-fs-audio", cursorControl, {
        displayLoop: false,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true,
      });
      _abcFsSynthCtrl.setTune(_abcFsVisualObj, false, { program: _melodyProgram, chordsOff: _chordsOff })
        .then(() => {
          // Apply practice tempo progression if opened from Practice tab
          if (initialWarp !== null) {
            _abcFsSynthCtrl.setWarp(initialWarp);
          }
          if (pracSettings) {
            const { start: tempoStart = 60, final: tempoFinal = 100, inc: tempoInc = 5, loopsPerStep: tempoLoops = 2 } = pracSettings;
            let curWarp = initialWarp || tempoStart;
            let loopCount = 0;
            const _origOnFinished = cursorControl.onFinished;
            cursorControl.onFinished = function() {
              _origOnFinished && _origOnFinished();
              loopCount++;
              if (loopCount >= tempoLoops && curWarp < tempoFinal) {
                curWarp = Math.min(tempoFinal, curWarp + tempoInc);
                _abcFsSynthCtrl.setWarp(curWarp);
                // Update warp display in the fullscreen player
                const warpEl = document.querySelector("#abc-fs-audio .abcjs-midi-warp input");
                if (warpEl) { warpEl.value = curWarp; warpEl.dispatchEvent(new Event("input")); }
                loopCount = 0;
              }
              try { _abcFsSynthCtrl.play(); } catch {}
            };
          }
        })
        .catch(err => {
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
  // Also stop the modal synth so it doesn't resume after FS closes
  if (_synthController) {
    try { _synthController.pause(); } catch {}
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

  // Clean up resize listener
  if (_fsResizeHandler) {
    window.removeEventListener('resize', _fsResizeHandler);
    _fsResizeHandler = null;
  }
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
    body = body.replace(/^[A-Za-z]:[^\n]*/gm, '').replace(/%%[^\n]*/g, '');
    // Collapse blank lines — a blank line in ABC means "end of tune" and breaks parsing
    body = body.replace(/\n{2,}/g, '\n').trim();
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
      // Only add newline if there are inline changes; an unconditional '\n' would
      // create a blank line (blank line = tune separator in ABC → ABCJS stops rendering)
      if (prefix) prefix += '\n';
    }
    // Use a plain ABC comment for the title — %% directives (e.g. %%text) inside a
    // single-tune body cause ABCJS's visual renderer to stop at that point even though
    // the audio parser ignores them.  A % comment is invisible to both parsers but
    // still contributes to character positions, keeping tuneRanges accurate.
    const titleLine = `% ${t.title || ''}\n`;
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
  const { isTransition = false, onBack = null, autoPlay = false } = opts;

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
        .then(() => { if (autoPlay && _setMusicSynth) _setMusicSynth.play(); })
        .catch(err => { console.warn("Set music audio init failed:", err); });
    } catch (err) {
      console.warn("Set music render failed:", err);
    }
  });
}

function openFullSetModal(setData, opts = {}) {
  const { onBack: _fullSetOnBack = null } = opts;
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
  const TUNE_COLORS = ['#7c6af7', '#0d9488', '#f472b6', '#fb923c'];

  // Per-tune section divs (each gets its own ABCJS render with foregroundColor)
  const tunesSectionDivs = tunesWithAbc.map((t, i) => {
    const color = TUNE_COLORS[i % TUNE_COLORS.length];
    return `
    <div class="set-tune-section" id="set-tune-section-${i}">
      <div class="set-tune-section-hd" style="color:${color}">${i + 1}. ${escHtml(t.title)}</div>
      <div class="set-tune-vis-render" id="set-tune-vis-${i}"></div>
    </div>`;
  }).join("");

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
    <button class="modal-back-btn" id="full-set-back-btn">✕ Close</button>
    <h2 class="modal-title">${escHtml(setData.name)}
    </h2>
    <div class="set-track-list">${trackRows || '<p class="modal-hint">No tunes in this set.</p>'}</div>
    ${transRows.length ? `
      <h3 class="set-music-section-hd">Transitions</h3>
      <div class="set-music-trans-section">${transRows.join("")}</div>
    ` : ""}
    ${hasAbc ? `
      <div class="set-full-hd-row" style="margin-top:1rem">
        <h3 class="set-music-section-hd">Sheet music &amp; playback</h3>
        <button class="btn-secondary btn-sm" id="set-full-fs-btn" title="Full screen sheet music">⛶ Full screen</button>
      </div>
      ${timelineHtml}
        <div style="display:flex;justify-content:flex-end;margin-bottom:.35rem"><button class="btn-secondary btn-sm set-more-btn">⋯ More</button></div>
      <div id="set-full-audio" style="margin-top:.5rem"></div>
      <div id="metronome-row" class="metronome-row" style="margin:.3rem 0">
        <button id="metro-toggle" class="btn-secondary btn-sm">♩ Metronome</button>
        <span id="metro-controls" class="metro-controls hidden">
          <button id="metro-dec" class="btn-icon metro-adj">−</button>
          <input id="metro-bpm" type="number" min="20" max="400" value="120" class="metro-bpm-input" title="Beats per minute">
          <button id="metro-inc" class="btn-icon metro-adj">+</button>
          <span class="metro-label">BPM</span>
          <button id="metro-tap" class="btn-secondary btn-sm">Tap</button>
          <span class="metro-label">Vol</span>
          <input id="metro-vol" type="range" min="0" max="100" value="70" class="metro-vol-slider" title="Metronome volume">
          <span id="metro-sync-badge" class="metro-sync-badge metro-sync">Synced</span>
        </span>
      </div>
      <div id="set-full-tunes-wrap" style="margin-top:.5rem">${tunesSectionDivs}</div>
      <div id="set-full-audio-render" style="display:none"></div>
      <div class="set-bot-controls">
        <button class="btn-secondary btn-sm" id="set-bot-play-btn">▶ Play</button>
        <button class="btn-secondary btn-sm" id="set-bot-restart-btn">⟳ Restart</button>
      </div>
      ` : '<p class="modal-hint" style="margin-top:.75rem">No ABC notation available for tunes in this set.</p>'}
        <div class="set-modal-footer-row" style="margin-top:1.5rem;padding:.75rem 0 .25rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:.5rem"><button class="btn-secondary set-more-btn">&#8943; More</button>${setData.id ? `<div style="position:relative;display:inline-block"><button class="btn-secondary set-export-menu-btn">&#11015; Export &#9660;</button><div class="set-export-menu hidden" style="position:absolute;bottom:2.6rem;right:0;z-index:200;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);min-width:200px;overflow:hidden"><a class="library-menu-item" href="/api/export/set/${setData.id}" download style="display:block;padding:.55rem .9rem;text-decoration:none;color:var(--text)">&#128196; Ceòl JSON (.ceol.json)</a><button class="library-menu-item set-export-abc-btn" style="width:100%;text-align:left;background:none;border:none;padding:.55rem .9rem;cursor:pointer;color:var(--text)">&#127925; ABC for TheCraic (.abc)</button><button class="library-menu-item set-export-pdf-btn" style="width:100%;text-align:left;background:none;border:none;padding:.55rem .9rem;cursor:pointer;color:var(--text)">&#9113; Print / PDF</button></div></div>` : ""}</div>
  `;

  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // ── Drag-and-drop reordering for track list ──────────────────────────────
  {
    const trackList = modalContent.querySelector(".set-track-list");
    function _reorderSetSheetMusic(orderedTunes) {
      const twAbc = orderedTunes.filter(t => t.abc);
      if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} _setMusicSynth = null; }

      // Rebuild the per-tune section divs
      const wrap = document.getElementById("set-full-tunes-wrap");
      if (wrap) {
        wrap.innerHTML = twAbc.map((t, i) => {
          const color = TUNE_COLORS[i % TUNE_COLORS.length];
          return `<div class="set-tune-section" id="set-tune-section-${i}">
            <div class="set-tune-section-hd" style="color:${color}">${i + 1}. ${escHtml(t.title)}</div>
            <div class="set-tune-vis-render" id="set-tune-vis-${i}"></div>
          </div>`;
        }).join('');
      }

      const combined = buildCombinedPlaybackAbcWithRanges(twAbc);
      const audioEl = document.getElementById("set-full-audio");
      if (!combined) return;

      requestAnimationFrame(() => {
        try {
          // Re-render each tune in its own section (T: stripped to avoid double title)
          twAbc.forEach((tune, i) => {
            try {
              const visAbc = expandAbcRepeats(tune.abc.replace(/^T:[^\n]*\n?/gm, ''));
              ABCJS.renderAbc(`set-tune-vis-${i}`, visAbc, {
                responsive: "resize", add_classes: true,
                paddingbottom: 10, paddingleft: 15, paddingright: 15, paddingtop: 10,
                foregroundColor: TUNE_COLORS[i % TUNE_COLORS.length], scale: 1.1,
              });
              _patchSvgViewBox(`set-tune-vis-${i}`);
            } catch {}
          });

          // Hidden combined render for synth
          const fullVisual = ABCJS.renderAbc("set-full-audio-render", combined.abc, {
            add_classes: true, scale: 1.0, staffwidth: 800,
          });
          if (!fullVisual.length || !ABCJS.synth || !ABCJS.synth.supportsAudio()) return;

          // Map hidden render note elements → visible render note elements by index
          const hiddenNotes2 = [...document.querySelectorAll('#set-full-audio-render .abcjs-note')];
          const visNotes2 = [];
          twAbc.forEach((_, i) => {
            document.querySelectorAll(`#set-tune-vis-${i} .abcjs-note`).forEach(el => visNotes2.push(el));
          });
          const hiddenToVis2 = new Map();
          const mapLen2 = Math.min(hiddenNotes2.length, visNotes2.length);
          for (let i = 0; i < mapLen2; i++) hiddenToVis2.set(hiddenNotes2[i], visNotes2[i]);

          const _getActiveTuneIdx = (sc) => {
            for (let i = 0; i < combined.tuneRanges.length; i++) {
              if (sc >= combined.tuneRanges[i].start && sc <= combined.tuneRanges[i].end) return i;
            }
            return combined.tuneRanges.length - 1;
          };
          let _activeTuneIdx = -1;
          const cursorControl = {
            onEvent(ev) {
              const sc = ev?.startChar ?? -1;
              const ti = _getActiveTuneIdx(sc);
              if (ti !== _activeTuneIdx) {
                if (_activeTuneIdx >= 0) document.getElementById(`set-tune-section-${_activeTuneIdx}`)?.classList.remove("set-tune-active");
                document.getElementById(`set-tune-section-${ti}`)?.classList.add("set-tune-active");
                _activeTuneIdx = ti;
              }
              document.querySelectorAll('.set-tune-vis-render .abcjs-highlight')
                .forEach(el => el.classList.remove('abcjs-highlight'));
              if (ev?.elements) {
                ev.elements.forEach(grp => {
                  if (!grp) return;
                  grp.forEach(hiddenEl => {
                    const visEl = hiddenToVis2.get(hiddenEl);
                    if (visEl) visEl.classList.add('abcjs-highlight');
                  });
                });
              }
            },
            onFinished() {
              document.querySelectorAll(".set-tune-section.set-tune-active").forEach(el => el.classList.remove("set-tune-active"));
              document.querySelectorAll('.set-tune-vis-render .abcjs-highlight').forEach(el => el.classList.remove('abcjs-highlight'));
              _activeTuneIdx = -1;
            },
          };
          if (audioEl) audioEl.innerHTML = '';
          _setMusicSynth = new ABCJS.synth.SynthController();
          _setMusicSynth.load("#set-full-audio", cursorControl, {
            displayLoop: false, displayRestart: true, displayPlay: true,
            displayProgress: true, displayWarp: true,
          });
          _setMusicSynth.setTune(fullVisual[0], false, { program: _melodyProgram, chordsOff: _chordsOff })
            .then(() => _setMusicSynth.setWarp(100))
            .catch(() => {});
        } catch {}
        // Fullscreen button is wired below via addEventListener — no duplicate onclick needed
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

  const _setBackBtn = document.getElementById("full-set-back-btn");
  if (_setBackBtn) _setBackBtn.addEventListener("click", () => {
    if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} _setMusicSynth = null; }
    if (_fullSetOnBack) _fullSetOnBack(); else closeModal();
  });

  modalContent.querySelectorAll(".set-trans-play-btn, .set-trans-music-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const a = tunes[Number(btn.dataset.idxA)];
      const b = tunes[Number(btn.dataset.idxB)];
      const transAbc = buildTransitionAbc(a, b);
      if (!transAbc) return;
      const isPlayBtn = btn.classList.contains("set-trans-play-btn");
      openSetMusicModal(`${a.title} → ${b.title}`, transAbc, {
        isTransition: true,
        autoPlay: isPlayBtn,
        onBack: () => openFullSetModal(setData),
      });
    });
  });

  // (print button is wired below, after hasAbc guard, so it has access to tunesWithAbc)

  if (!hasAbc) return;

  const _setCombined = buildCombinedPlaybackAbcWithRanges(tunesWithAbc);

  // Wire fullscreen button (uses combined ABC with per-tune colour highlights)
    // ⋯ More button — toggles playback controls in set detail
    const _setMoreBtn = modalContent.querySelector('.set-more-btn');
    if (_setMoreBtn) {
      _setMoreBtn.dataset.open = '1'; // controls start visible
      _setMoreBtn.addEventListener('click', () => {
        const open = _setMoreBtn.dataset.open !== '1';
        const targets = [
          document.getElementById('set-full-audio'),
          document.getElementById('metronome-row'),
          document.querySelector('.set-bot-controls'),
        ].filter(Boolean);
        targets.forEach(el => { el.style.display = open ? '' : 'none'; });

        _setMoreBtn.dataset.open = open ? '1' : '0';
      });
    }

  const _setExportMenuBtn = modalContent.querySelector(".set-export-menu-btn");
  if (_setExportMenuBtn) {
    const _setExportMenu = _setExportMenuBtn.nextElementSibling;
    _setExportMenuBtn.addEventListener("click", e => { e.stopPropagation(); _setExportMenu.classList.toggle("hidden"); });
    document.addEventListener("click", () => _setExportMenu?.classList.add("hidden"), { once: true });
  }
  const _setExportAbcBtn = modalContent.querySelector(".set-export-abc-btn");
  if (_setExportAbcBtn) {
    _setExportAbcBtn.addEventListener("click", async () => {
      _setExportAbcBtn.textContent = "Building…";
      try {
        const tunesForAbc = tunes.filter(t => t.abc);
        if (!tunesForAbc.length) { alert("No ABC notation in this set."); _setExportAbcBtn.textContent = "🎵 ABC for TheCraic (.abc)"; return; }
        const abcText = tunesForAbc.map(t => t.abc.trim()).join("\n\n");
        const blob = new Blob([abcText], { type: "application/octet-stream" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = (setData.name || "set").replace(/[^\w\s\-]/g, "").trim() + ".abc";
        link.click();
        URL.revokeObjectURL(link.href);
      } catch { alert("Export failed."); }
      _setExportAbcBtn.textContent = "🎵 ABC for TheCraic (.abc)";
      _setExportMenuBtn?.nextElementSibling?.classList.add("hidden");
    });
  }
    // Print / PDF — set sheet music
    const _setExportPdfBtn = modalContent.querySelector('.set-export-pdf-btn');
    if (_setExportPdfBtn) {
      _setExportPdfBtn.addEventListener('click', () => {
        const sections = document.querySelectorAll('.set-tune-vis-render');
        if (!sections.length) { alert('No sheet music rendered yet.'); return; }
        const win = window.open('', '_blank');
        if (!win) { alert('Please allow popups for this page to use Print.'); return; }
        const parts = Array.from(sections).map((el, i) => {
          const color = TUNE_COLORS[i % TUNE_COLORS.length];
          const title = tunesWithAbc[i] ? tunesWithAbc[i].title : '';
          const clone = el.cloneNode(true);
            clone.querySelectorAll('svg').forEach(s => { s.style.position='relative'; s.style.display='block'; s.style.maxWidth='100%'; });
            const isLast = i === sections.length - 1;
            return '<div style="' + (isLast ? '' : 'page-break-after:always;') + 'margin-bottom:2em;position:relative">'
              + '<h2 style="font-size:12pt;margin:.5em 0 .3em;color:' + color + '">' + title.replace(/</g,'&lt;') + '</h2>'
              + clone.innerHTML + '</div>';
        }).join('');
        win.document.write('<!DOCTYPE html><html><head><title>' + escHtml(setData.name) + '</title>'
          + '<style>body{margin:1.5cm;font-family:sans-serif}svg{max-width:100%;display:block}'
          + '@media print{button{display:none}}</style></head><body>' + parts
          + '<scr' + 'ipt>window.onload=()=>window.print();</scr' + 'ipt></body></html>');
        win.document.close();
      });
    }

  const setFsBtn = document.getElementById("set-full-fs-btn");
  if (setFsBtn && _setCombined) {
    setFsBtn.addEventListener("click", () => {
      if (_setMusicSynth) { try { _setMusicSynth.pause(); } catch {} }
      openAbcFullscreen(_setCombined.abc, setData.name, {
        tuneRanges: _setCombined.tuneRanges,
        tuneColors: TUNE_COLORS,
        tuneNames: tunesWithAbc.map(t => t.title),
        tuneAbcs: tunesWithAbc.map(t => t.abc),
      });
    });
  }

  // Print: collect each per-tune render section
  const printBtn2 = document.getElementById("set-full-print-btn");
  if (printBtn2) {
    printBtn2.addEventListener("click", () => {
      const sections = document.querySelectorAll(".set-tune-vis-render");
      const win = window.open('', '_blank');
      const parts = Array.from(sections).map((el, i) => {
        const color = TUNE_COLORS[i % TUNE_COLORS.length];
        const title = tunesWithAbc[i]?.title || '';
        return `<h2 style="font-size:13pt;margin:1.5em 0 .3em;color:${color}">${title.replace(/</g,'&lt;')}</h2>${el.innerHTML}`;
      }).join('');
      win.document.write(`<!DOCTYPE html><html><head>
        <title>${setData.name.replace(/</g,'&lt;')}</title>
        <style>
          body{font-family:sans-serif;margin:1.5cm;color:#000;background:#fff}
          h1{font-size:16pt;margin:0 0 .5em}
          div[style*="position"]{position:static!important;top:auto!important;left:auto!important}
          svg{position:static!important;max-width:100%;display:block;height:auto!important}
          .abcjs-container{position:static!important;overflow:visible!important}
          @page{margin:1.5cm}
        </style>
      </head><body>
        <h1>${setData.name.replace(/</g,'&lt;')}</h1>${parts}
      </body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 400);
    });
  }

  requestAnimationFrame(() => {
    if (typeof ABCJS === "undefined") return;

    // ── Render each tune in its own section with its own foregroundColor ──────
    // This ensures ALL SVG elements (stave lines, barlines, clef, note heads)
    // are coloured consistently for each tune.
    tunesWithAbc.forEach((tune, i) => {
      try {
        const renderId = `set-tune-vis-${i}`;
        // Strip T: lines — the section heading already shows the title;
        // keeping T: would cause ABCJS to render a second title inside the SVG.
        const visAbc = expandAbcRepeats(tune.abc.replace(/^T:[^\n]*\n?/gm, ''));
        ABCJS.renderAbc(renderId, visAbc, {
          responsive: "resize",
          add_classes: true,
          paddingbottom: 10, paddingleft: 15, paddingright: 15, paddingtop: 10,
          foregroundColor: TUNE_COLORS[i % TUNE_COLORS.length],
          scale: 1.1,
        });
        _patchSvgViewBox(renderId);
      } catch (err) { console.warn(`Set tune render ${i} failed:`, err); }
    });

    // ── Hidden combined render for audio synth cursor tracking ───────────────
    const combined = _setCombined;
    if (!combined) return;
    const { abc: playbackAbc, tuneRanges } = combined;

    try {
      const fullVisual = ABCJS.renderAbc("set-full-audio-render", playbackAbc, {
        add_classes: true, scale: 1.0, staffwidth: 800,
      });
      if (!fullVisual.length || !ABCJS.synth || !ABCJS.synth.supportsAudio()) return;

      // Build a mapping from each note element in the hidden combined render to
      // the corresponding note element in the visible individual renders.
      // Both renders use add_classes:true so elements share the same DOM order as
      // the ABC note sequence — we can map by position index.
      const hiddenNotes = [...document.querySelectorAll('#set-full-audio-render .abcjs-note')];
      const visNotes = [];
      tunesWithAbc.forEach((_, i) => {
        document.querySelectorAll(`#set-tune-vis-${i} .abcjs-note`).forEach(el => visNotes.push(el));
      });
      const hiddenToVis = new Map();
      const mapLen = Math.min(hiddenNotes.length, visNotes.length);
      for (let i = 0; i < mapLen; i++) hiddenToVis.set(hiddenNotes[i], visNotes[i]);

      const _setBotPlayLabel = (playing) => {
        const btn = document.getElementById("set-bot-play-btn");
        if (btn) btn.textContent = playing ? "⏸ Pause" : "▶ Play";
      };

      // Determine which tune section is active from startChar + tuneRanges
      const _getActiveTuneIdx = (sc) => {
        for (let i = 0; i < tuneRanges.length; i++) {
          if (sc >= tuneRanges[i].start && sc <= tuneRanges[i].end) return i;
        }
        return tuneRanges.length - 1;
      };

      let _activeTuneIdx = -1;
      const cursorControl = {
        onStart() {
          _setBotPlayLabel(true);
          if (_metEnabled && _metSyncToAbc) _startMetronome();
        },
        onEvent(ev) {
          const sc = ev?.startChar ?? -1;
          const ti = _getActiveTuneIdx(sc);
          // Section-level highlight
          if (ti !== _activeTuneIdx) {
            if (_activeTuneIdx >= 0) {
              document.getElementById(`set-tune-section-${_activeTuneIdx}`)?.classList.remove("set-tune-active");
            }
            document.getElementById(`set-tune-section-${ti}`)?.classList.add("set-tune-active");
            _activeTuneIdx = ti;
          }
          // Note-level highlight: map hidden render elements → visible render elements
          document.querySelectorAll('.set-tune-vis-render .abcjs-highlight')
            .forEach(el => el.classList.remove('abcjs-highlight'));
          if (ev?.elements) {
            ev.elements.forEach(grp => {
              if (!grp) return;
              grp.forEach(hiddenEl => {
                const visEl = hiddenToVis.get(hiddenEl);
                if (visEl) visEl.classList.add('abcjs-highlight');
              });
            });
          }
        },
        onFinished() {
          document.querySelectorAll(".set-tune-section.set-tune-active")
            .forEach(el => el.classList.remove("set-tune-active"));
          document.querySelectorAll('.set-tune-vis-render .abcjs-highlight')
            .forEach(el => el.classList.remove('abcjs-highlight'));
          _activeTuneIdx = -1;
          _setBotPlayLabel(false);
          if (_metSyncToAbc) { _stopMetronome(); _updateMetronomeBtn(); }
        },
      };

      _setMusicSynth = new ABCJS.synth.SynthController();
      _setMusicSynth.load("#set-full-audio", cursorControl, {
        displayLoop: false, displayRestart: true, displayPlay: true,
        displayProgress: true, displayWarp: true,
      });
      _setMusicSynth.setTune(fullVisual[0], false, { program: _melodyProgram, chordsOff: _chordsOff })
        .then(() => {
          _initMetronomeUI(_extractAbcBpm(tunesWithAbc[0]?.abc));
          const botPlayBtn    = document.getElementById("set-bot-play-btn");
          const botRestartBtn = document.getElementById("set-bot-restart-btn");
          botPlayBtn?.addEventListener("click", () => {
            const topStart = document.querySelector("#set-full-audio .abcjs-midi-start");
            const isPlaying = topStart?.classList.contains("abcjs-pushed");
            if (isPlaying) {
              try { _setMusicSynth.pause(); } catch {}
              _setBotPlayLabel(false);
            } else {
              try { _setMusicSynth.play(); } catch {}
            }
          });
          botRestartBtn?.addEventListener("click", () => {
            document.querySelector("#set-full-audio .abcjs-midi-reset")?.click();
            _setBotPlayLabel(false);
          });
          return _setMusicSynth.setWarp(100);
        })
        .catch(err => console.warn("Full set audio init failed:", err));
    } catch (err) {
      console.warn("Full set combined render failed:", err);
    }
  });
}

// ── Add-to-set flow panels ────────────────────────────────────────────────────

// Panel 1: list of existing sets to choose from
async function showSetPickerPanel(tune, onBack, siblings) {
  const backToTune = () => { renderModal(tune, onBack, siblings); requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); else if (tune.sibling_abc) renderSheetMusicAudioOnly(tune.sibling_abc); }); };

  // Fetch which sets this tune already belongs to
  let memberSetIds = new Set();
  try {
    const { sets } = await _fetchTuneMemberships(tune.id);
    sets.forEach(s => memberSetIds.add(String(s.id)));
  } catch {}

  const rows = state.sets.map(s => {
    const already = memberSetIds.has(String(s.id));
    return `
    <button class="set-picker-row${already ? " picker-row-member" : ""}" data-set-id="${s.id}">
      <span class="set-picker-name">${escHtml(s.name)}</span>
      <span class="set-picker-count">${s.tune_count || 0} tune${s.tune_count !== 1 ? "s" : ""}</span>
      ${already ? '<span class="picker-member-tick" title="Tune already in this set">✓</span>' : '<span class="set-picker-arrow">›</span>'}
    </button>`;
  }).join("");

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
  const backToTune   = () => { renderModal(tune, onBack, siblings); requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); else if (tune.sibling_abc) renderSheetMusicAudioOnly(tune.sibling_abc); }); };

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
        <button id="set-preview-confirm-btn" class="btn-primary">Confirm Save</button>
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

    // Preview playback — open the coloured per-tune sheet music view
    document.getElementById("set-preview-play-btn").addEventListener("click", () => {
      const tunesForPreview = previewOrder.filter(t => t.abc);
      if (!tunesForPreview.length) return;
      const fakeSet = { ...setData, tunes: previewOrder, name: `Preview: ${setData.name}` };
      openFullSetModal(fakeSet, { onBack: renderPreview });
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
  const backToTune = () => { renderModal(tune, onBack, siblings); requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); else if (tune.sibling_abc) renderSheetMusicAudioOnly(tune.sibling_abc); }); };
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
  const _setsSearchInput = document.getElementById("sets-search");
  const _masteryLabels = ["Unrated","Just starting","Getting there","Almost there","Know it well","Nailed it!"];

  function _doRenderSets(items) {
    if (!items.length) {
      const q = _setsSearchInput ? _setsSearchInput.value.trim() : "";
      setsList.innerHTML = q
        ? `<p class="empty">No sets match “${escHtml(q)}”.</p>`
        : '<p class="empty">No sets yet. Create one to organise tunes into a session!</p>';
      return;
    }
    setsList.innerHTML = items.map(s => {
    const rating = s.rating || 0;
    const stars = [1,2,3,4,5].map(n =>
      `<button class="set-star-btn${rating >= n ? " filled" : ""}" data-n="${n}" data-set-id="${s.id}" title="${_masteryLabels[n]}">★</button>`
    ).join("");
    const isMobile = document.body.classList.contains("mobile-body");
    if (isMobile) {
      return `
      <div class="m-set-row" data-set-id="${s.id}">
        <div class="m-set-row-info">
          <span class="m-set-row-name">${escHtml(s.name)}</span>
          <span class="m-set-row-meta">${s.tune_count} tune${s.tune_count !== 1 ? "s" : ""}${rating ? " · " + "★".repeat(rating) : ""}</span>
        </div>
        <span class="m-set-row-arrow">›</span>
      </div>`;
    }
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
          <button class="btn-secondary btn-sm set-transition-play-btn">Transition</button>
          <button class="btn-secondary btn-sm set-transition-music-btn">Full set music</button>`;
        if (footer) footer.before(tr); else tunesDiv.appendChild(tr);
        const open = () => openSetMusicModal(`${a.title} → ${b.title}`, transAbc, { isTransition: true });
        tr.querySelector(".set-transition-play-btn").addEventListener("click", open);
        tr.querySelector(".set-transition-music-btn")?.addEventListener("click", async () => {
          const fullSetData = await apiGetSet(id);
          openFullSetModal(fullSetData);
        });
      }
    }

    // Tune rows
    const _masteryTip = ["","Just starting","Getting there","Almost there","Know it well","Nailed it!"];
    tunesDiv.innerHTML = tunes.map((t, i) => {
      const r = t.rating || 0;
      const stars = [1,2,3,4,5].map(n =>
        `<button class="tune-star-btn${r >= n ? " filled" : ""}" data-n="${n}" data-tune-id="${t.id}" title="${_masteryTip[n]}">★</button>`
      ).join("");
      return `
      <div class="set-tune-row" data-tune-id="${t.id}">
        <button class="set-move-up btn-icon" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="set-move-down btn-icon" title="Move down" ${i === tunes.length - 1 ? "disabled" : ""}>↓</button>
        <span class="set-tune-pos">${i + 1}.</span>
        <button class="set-tune-title tune-open-btn" data-tune-id="${t.id}">${escHtml(t.title)}</button>
        <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
        <span class="badge badge-key">${escHtml(t.key || "")}</span>
        <span class="tune-stars-inline" data-tune-id="${t.id}" title="Your mastery of this tune">${stars}</span>
        <button class="btn-icon remove-from-set"
          data-set-id="${id}" data-tune-id="${t.id}" title="Remove from set">🗑</button>
      </div>`;
    }).join("");

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

    // Per-tune mastery stars
    tunesDiv.querySelectorAll(".tune-star-btn").forEach(sb => {
      sb.addEventListener("click", async () => {
        const tuneId = sb.dataset.tuneId;
        const n = Number(sb.dataset.n);
        const strip = sb.closest(".tune-stars-inline");
        const current = [...strip.querySelectorAll(".tune-star-btn.filled")].length;
        const newRating = (n === current) ? 0 : n; // toggle off if clicking same star
        try {
          await apiFetch(`/api/tunes/${tuneId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rating: newRating }),
          });
          strip.querySelectorAll(".tune-star-btn").forEach((s, i) =>
            s.classList.toggle("filled", i < newRating)
          );
          // Update in-memory tunes
          const t = state.tunes?.find(t => String(t.id) === String(tuneId));
          if (t) t.rating = newRating;
        } catch { /* ignore */ }
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

    // Mini inline TheSession import — shown when local search finds nothing
    async function _showSessionImport(q) {
      results.innerHTML = `
        <div class="set-add-session-panel">
          <p class="set-add-tune-none" style="margin-bottom:.4rem">Not in library.</p>
          <div class="set-add-session-search">
            <input class="set-add-session-input ff-url-input" type="text" value="${escHtml(q)}" placeholder="Search TheSession.org…" />
            <button class="btn-secondary btn-sm set-add-session-btn">Search</button>
            <button class="set-add-tune-cancel btn-secondary btn-sm">Cancel</button>
          </div>
          <div class="set-add-session-results"></div>
        </div>`;

      const sInput = results.querySelector(".set-add-session-input");
      const sBtn   = results.querySelector(".set-add-session-btn");
      const sRes   = results.querySelector(".set-add-session-results");

      results.querySelector(".set-add-tune-cancel").addEventListener("click", () => {
        results.innerHTML = "";
        input.value = "";
      });

      const _doSessionSearch = async () => {
        const sq = sInput.value.trim();
        if (!sq) return;
        sBtn.disabled = true;
        sRes.innerHTML = '<p class="loading" style="padding:.4rem 0">Searching…</p>';
        try {
          const data = await apiFetch(`/api/thesession/search?q=${encodeURIComponent(sq)}`);
          const list = data.tunes || [];
          if (!list.length) { sRes.innerHTML = '<p class="set-add-tune-none">No results on TheSession.org.</p>'; return; }
          sRes.innerHTML = list.slice(0, 8).map(t => `
            <div class="set-add-session-row">
              <span class="set-add-session-name">${escHtml(t.name)}</span>
              <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
              <button class="btn-primary btn-sm set-add-session-import-btn" data-session-id="${t.id}" data-name="${escHtml(t.name)}">Import &amp; Add</button>
            </div>`).join("");
          sRes.querySelectorAll(".set-add-session-import-btn").forEach(ib => {
            ib.addEventListener("click", async () => {
              ib.disabled = true;
              ib.textContent = "Importing…";
              try {
                const imported = await apiFetch("/api/thesession/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tune_id: Number(ib.dataset.sessionId) }),
                });
                // imported.tunes[0] is the new tune
                const newTune = imported.tunes ? imported.tunes[0] : imported;
                if (newTune && newTune.id) {
                  ib.textContent = "Adding…";
                  await _doAdd(newTune.id);
                } else {
                  ib.textContent = "Imported — search library";
                  input.value = ib.dataset.name;
                  results.innerHTML = "";
                  _runSearch(ib.dataset.name);
                }
              } catch (err) {
                ib.disabled = false;
                ib.textContent = "Import & Add";
                sRes.insertAdjacentHTML("beforeend", `<p class="set-add-tune-none" style="color:var(--danger)">Import failed — please try again.</p>`);
              }
            });
          });
        } finally {
          sBtn.disabled = false;
        }
      };

      sBtn.addEventListener("click", _doSessionSearch);
      sInput.addEventListener("keydown", e => { if (e.key === "Enter") _doSessionSearch(); });
      // Auto-search with the current query
      _doSessionSearch();
    }

    async function _runSearch(q) {
      const tunes = await apiFetch(`/api/tunes?q=${encodeURIComponent(q)}&page_size=10`);
      const list = tunes.tunes || tunes;
      if (!list.length) {
        _showSessionImport(q);
        return;
      }
      results.innerHTML = list.map(t =>
        `<button class="set-add-tune-result" data-tune-id="${t.id}" data-version-count="${t.version_count || 0}">
           ${escHtml(t.title)}
           <span class="badge ${typeBadgeClass(t.type)}" style="margin-left:.4rem">${escHtml(t.type || "")}</span>
           <span class="badge badge-key">${escHtml(t.key || "")}</span>
           ${(t.version_count || 0) > 0 ? `<span class="badge badge-versions" style="margin-left:.2rem">${t.version_count} versions</span>` : ""}
         </button>`
      ).join("");

      results.querySelectorAll(".set-add-tune-result").forEach(btn => {
        btn.addEventListener("click", async () => {
          const vCount = Number(btn.dataset.versionCount || 0);
          if (vCount > 0) {
            // Auto-add the first (default) version
            btn.disabled = true;
            btn.textContent = "Adding…";
            try {
              const { versions } = await apiFetch(`/api/tunes/${btn.dataset.tuneId}/versions`);
              await _doAdd(versions[0].id);
            } catch {
              btn.disabled = false;
              btn.textContent = btn.dataset.origText || "Retry";
              alert("Could not add tune — it may already be in the set.");
            }
          } else {
            btn.disabled = true;
            try { await _doAdd(btn.dataset.tuneId); }
            catch { btn.disabled = false; alert("Could not add tune — it may already be in the set."); }
          }
        });
      });
    }

    input.addEventListener("input", () => {
      clearTimeout(_debounce);
      const q = input.value.trim();
      if (!q) { results.innerHTML = ""; return; }
      _debounce = setTimeout(() => _runSearch(q), 250);
    });
  }

  // Shared helper — also called from createSetBtn after creating a new set
  async function _openSetDetail(id) {
    const setHeader = document.getElementById("view-sets").querySelector(".view-header");
    const detailView = document.getElementById("set-detail-view");
    const detailContent = document.getElementById("set-detail-content");
    setsList.classList.add("hidden");
    if (setHeader) setHeader.classList.add("hidden");
    document.getElementById("new-set-form")?.classList.add("hidden");
    detailContent.innerHTML = '<p class="loading">Loading…</p>';
    detailView.classList.remove("hidden");
    const setData = await apiGetSet(id);
    let allTunes = setData.tunes || [];

    function _renderFiltered(q) {
      const tunesWrap = document.getElementById("set-detail-tunes");
      if (!tunesWrap) return;
      tunesWrap.innerHTML = "";
      const filtered = q ? allTunes.filter(t => t.title.toLowerCase().includes(q.toLowerCase())) : allTunes;
      if (filtered.length) {
        _renderSetTunes(tunesWrap, id, filtered);
      } else {
        tunesWrap.innerHTML = `<p class="set-empty">${allTunes.length ? "No matching tunes." : "No tunes in this set yet."}</p>`;
      }
    }

    detailContent.innerHTML = `
      <h2 class="section-title" style="margin-bottom:.5rem">${escHtml(setData.name)}</h2>
      <div class="detail-search-row">
        <input id="set-detail-search" type="search" class="detail-search-input"
               placeholder="Search within this set…" autocomplete="off">
      </div>
      <div id="set-detail-tunes"></div>`;

    _renderFiltered("");
    _appendAddTuneFooter(detailContent, id);

    document.getElementById("set-detail-search").addEventListener("input", e => {
      _renderFiltered(e.target.value.trim());
    });
  }

  // Mobile: tapping a set row opens the sheet music directly
  setsList.querySelectorAll(".m-set-row").forEach(row => {
    row.addEventListener("click", async () => {
      const setData = await apiGetSet(row.dataset.setId);
      openFullSetModal(setData);
      modalOverlay.classList.remove("hidden");
      document.body.style.overflow = "hidden";
    });
  });

  setsList.querySelectorAll(".set-expand-btn").forEach(btn => {
    btn.addEventListener("click", () => _openSetDetail(btn.dataset.setId));
  });

  // Expose so createSetBtn can call it after creating a new set
  window._openSetDetail = _openSetDetail;

  const _setDetailBack = document.getElementById("set-detail-back");
  if (_setDetailBack && !_setDetailBack._bound) {
    _setDetailBack._bound = true;
    _setDetailBack.addEventListener("click", () => {
      document.getElementById("set-detail-view").classList.add("hidden");
      document.getElementById("set-detail-content").innerHTML = "";
      setsList.classList.remove("hidden");
      const setHeader = document.getElementById("view-sets").querySelector(".view-header");
      if (setHeader) setHeader.classList.remove("hidden");
    });
  }

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

  // Add set to collection (multi-select + create new)
  setsList.querySelectorAll(".set-add-col-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const setId = btn.dataset.setId;
      const cols = await apiFetch("/api/collections");
      const existingOptions = cols.map(c =>
        `<label class="bulk-col-option">
           <input type="checkbox" name="set-col-pick" value="${c.id}" />
           ${escHtml(c.name)}
         </label>`
      ).join("");
      modalContent.innerHTML = `
        <h2 class="modal-title">Add Set to Collections</h2>
        <div class="bulk-col-list">${existingOptions || '<p class="set-add-tune-none">No collections yet.</p>'}</div>
        <div class="multi-col-new-row">
          <label class="bulk-col-option multi-col-new-label">
            <input type="checkbox" id="set-col-new-chk" />
            <em>Create new collection…</em>
          </label>
          <input id="set-col-new-name" type="text" class="ff-url-input" placeholder="New collection name" maxlength="120" style="display:none;margin-top:.3rem" />
        </div>
        <div class="notes-actions" style="margin-top:1.25rem">
          <button id="set-col-confirm" class="btn-collection" disabled>Add to Collections</button>
          <button id="set-col-cancel" class="btn-secondary">Cancel</button>
          <span id="set-col-status" class="notes-status"></span>
        </div>`;
      modalOverlay.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      const confirmBtn = document.getElementById("set-col-confirm");
      const newChk     = document.getElementById("set-col-new-chk");
      const newNameIn  = document.getElementById("set-col-new-name");

      const _updateConfirm = () => {
        const anyChecked = [...modalContent.querySelectorAll("input[name=set-col-pick]:checked")].length > 0;
        const newValid = newChk.checked && newNameIn.value.trim().length > 0;
        confirmBtn.disabled = !(anyChecked || newValid);
      };

      modalContent.querySelectorAll("input[name=set-col-pick]").forEach(r =>
        r.addEventListener("change", _updateConfirm)
      );
      newChk.addEventListener("change", () => {
        newNameIn.style.display = newChk.checked ? "block" : "none";
        if (newChk.checked) newNameIn.focus();
        _updateConfirm();
      });
      newNameIn.addEventListener("input", _updateConfirm);
      newNameIn.addEventListener("keydown", e => { if (e.key === "Enter") confirmBtn.click(); });

      document.getElementById("set-col-cancel").addEventListener("click", closeModal);
      confirmBtn.addEventListener("click", async () => {
        const status = document.getElementById("set-col-status");
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Adding…";
        try {
          const selected = [...modalContent.querySelectorAll("input[name=set-col-pick]:checked")].map(c => c.value);
          // Create new collection if requested
          if (newChk.checked && newNameIn.value.trim()) {
            const newCol = await apiCreateCollection(newNameIn.value.trim(), "");
            selected.push(String(newCol.id));
            await fetchCollections();
          }
          await Promise.all(selected.map(colId =>
            apiFetch(`/api/collections/${colId}/sets`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ set_id: Number(setId) }),
            })
          ));
          status.textContent = `Added to ${selected.length} collection${selected.length !== 1 ? "s" : ""} ✓`;
          status.className = "notes-status notes-saved";
          setTimeout(closeModal, 900);
        } catch {
          status.textContent = "Failed — please try again.";
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Add to Collections";
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
  } // end _doRenderSets

  if (_setsSearchInput) {
    _setsSearchInput.oninput = () => {
      const q = _setsSearchInput.value.trim().toLowerCase();
      _doRenderSets(q ? sets.filter(s => s.name.toLowerCase().includes(q)) : sets);
    };
  }
  _doRenderSets(
    (_setsSearchInput && _setsSearchInput.value.trim())
      ? sets.filter(s => s.name.toLowerCase().includes(_setsSearchInput.value.trim().toLowerCase()))
      : sets
  );
}

function renderCollections(collections) {
  const _colsSearchInput = document.getElementById("collections-search");

  function _doRenderCollections(items) {
    if (!items.length) {
      const q = _colsSearchInput ? _colsSearchInput.value.trim() : "";
      collectionsList.innerHTML = q
        ? `<p class="empty">No collections match “${escHtml(q)}”.</p>`
        : '<p class="empty">No collections yet. Create one to group tunes by theme!</p>';
      return;
    }
    collectionsList.innerHTML = items.map(c => {
    const parts = [];
    if (c.tune_count) parts.push(`${c.tune_count} tune${c.tune_count !== 1 ? "s" : ""}`);
    if (c.set_count)  parts.push(`${c.set_count} set${c.set_count !== 1 ? "s" : ""}`);
    const countLabel = parts.join(", ") || "empty";
    return `
    <div class="set-card" data-col-id="${c.id}">
      <div class="set-card-header">
        <div class="set-card-info">
          <span class="set-name col-name-link" data-col-id="${c.id}" style="cursor:pointer;text-decoration:underline dotted">${escHtml(c.name)}</span>
            <button class="col-expand-btn" data-col-id="${c.id}" style="display:none" aria-hidden="true"></button>
          <span class="set-count">${countLabel}</span>
        </div>
        <div class="set-card-actions">

          <div class="library-menu-wrap">
            <button class="btn-icon col-menu-btn" data-col-id="${c.id}" title="Options">⋯</button>
            <div class="library-menu hidden col-options-menu" id="col-menu-${c.id}">
              <button class="library-menu-item col-export-btn" data-col-id="${c.id}" data-col-name="${escHtml(c.name)}">⬇ Export</button>
              <button class="library-menu-item col-rename-btn col-rename-inline" data-col-id="${c.id}">✏ Rename</button>
              <hr class="library-menu-divider"/>
              <button class="library-menu-item library-menu-danger col-delete-btn" data-col-id="${c.id}">🗑 Delete</button>
            </div>
          </div>
        </div>
      </div>
      ${c.description ? `<p class="set-notes">${escHtml(c.description)}</p>` : ""}
      <div class="set-tunes-list hidden" id="col-tunes-${c.id}"></div>
    </div>`;
  }).join("");
  
  // Wire collection name click → view
  collectionsList.querySelectorAll(".col-name-link").forEach(link => {
    link.addEventListener("click", () => {
      const btn = link.parentElement?.querySelector(".col-expand-btn");
      if (btn) btn.click();
    });
  });
  
  // Wire ⋯ menu buttons
  collectionsList.querySelectorAll(".col-menu-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = document.getElementById(`col-menu-${btn.dataset.colId}`);
      if (menu) { menu.classList.toggle("hidden"); }
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".col-options-menu").forEach(m => m.classList.add("hidden"));
  }, { once: false, capture: false });

  collectionsList.querySelectorAll(".col-expand-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.colId;
      const colName = btn.closest(".set-card").querySelector(".set-name").textContent;
      const colDetailView = document.getElementById("col-detail-view");
      const colDetailContent = document.getElementById("col-detail-content");
      const colViewHeader = document.getElementById("view-collections").querySelector(".view-header");
      const newColForm = document.getElementById("new-collection-form");

      // Switch to focused view
      collectionsList.classList.add("hidden");
        document.getElementById('recent-imports-card')?.classList.add('hidden');
      if (colViewHeader) colViewHeader.classList.add("hidden");
      if (newColForm) newColForm.classList.add("hidden");
      if (colDetailContent) colDetailContent.innerHTML = '<p class="loading">Loading…</p>';
      if (colDetailView) colDetailView.classList.remove("hidden");

      const colData = await apiGetCollection(id);
      const allColTunes = colData.tunes || [];
      const allColSets  = colData.sets  || [];

      let _colTypeFilter = "";
      function _renderColItems(q) {
        const itemsEl = document.getElementById("col-detail-items");
        if (!itemsEl) return;
        const ql = q.toLowerCase();
        let filtTunes = ql ? allColTunes.filter(t => t.title.toLowerCase().includes(ql)) : [...allColTunes];
        if (_colTypeFilter) filtTunes = filtTunes.filter(t => (t.type || "").toLowerCase() === _colTypeFilter);
        const filtSets  = ql ? allColSets.filter(s => s.name.toLowerCase().includes(ql))   : allColSets;
        let html = "";
        if (filtTunes.length) {
          html += `<p class="col-section-label">Tunes</p>`;
          html += filtTunes.map(t => `
            <div class="set-tune-row">
              <button class="set-tune-title tune-open-btn" data-tune-id="${t.id}">${escHtml(t.title)}</button>
              <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
              <span class="badge badge-key">${escHtml(t.key || "")}</span>
              <button class="btn-icon remove-from-col"
                data-col-id="${id}" data-tune-id="${t.id}" title="Remove from collection">🗑</button>
            </div>`).join("");
        }
        if (filtSets.length) {
          html += `<p class="col-section-label" style="margin-top:.6rem">Sets</p>`;
          html += filtSets.map(s => `
            <div class="set-tune-row col-set-row" data-set-id="${s.id}">
              <span class="col-set-icon" title="Set">♫</span>
              <button class="set-tune-title col-set-link" data-set-id="${s.id}" title="Open this set">${escHtml(s.name)}</button>
              <span class="set-count">${s.tune_count} tune${s.tune_count !== 1 ? "s" : ""}</span>
              <button class="btn-icon remove-from-col-set"
                data-col-id="${id}" data-set-id="${s.id}" title="Remove set from collection">🗑</button>
            </div>`).join("");
        }
        if (!html) {
          html = `<p class="set-empty">${(allColTunes.length || allColSets.length) ? "No matching items." : "Empty — add tunes or sets to this collection."}</p>`;
        }
        itemsEl.innerHTML = html;
        // Re-wire tune-open and remove buttons inside the re-rendered block
        itemsEl.querySelectorAll(".tune-open-btn").forEach(tb => {
          tb.addEventListener("click", async () => {
            await Promise.all([fetchSets(), fetchCollections()]);
            const tune = await fetchTune(tb.dataset.tuneId);
            renderModal(tune);
            modalOverlay.classList.remove("hidden");
            document.body.style.overflow = "hidden";
          });
        });
        itemsEl.querySelectorAll(".remove-from-col").forEach(rb => {
          rb.addEventListener("click", async () => {
            if (!confirm("Remove this tune from the collection?")) return;
            rb.disabled = true;
            try {
              await apiRemoveTuneFromCollection(rb.dataset.colId, rb.dataset.tuneId);
              const idx = allColTunes.findIndex(t => String(t.id) === rb.dataset.tuneId);
              if (idx !== -1) allColTunes.splice(idx, 1);
              _renderColItems(document.getElementById("col-detail-search")?.value || "");
            } catch { rb.disabled = false; }
          });
        });
        itemsEl.querySelectorAll(".remove-from-col-set").forEach(rb => {
          rb.addEventListener("click", async () => {
            if (!confirm("Remove this set from the collection?")) return;
            rb.disabled = true;
            try {
              await apiFetch(`/api/collections/${rb.dataset.colId}/sets/${rb.dataset.setId}`, { method: "DELETE" });
              const idx = allColSets.findIndex(s => String(s.id) === rb.dataset.setId);
              if (idx !== -1) allColSets.splice(idx, 1);
              _renderColItems(document.getElementById("col-detail-search")?.value || "");
            } catch { rb.disabled = false; }
          });
        });
        // Set name links — open full set modal inline (no navigation away)
        itemsEl.querySelectorAll(".col-set-link").forEach(btn => {
          btn.addEventListener("click", async () => {
            const sid = btn.dataset.setId;
            try {
              const setData = await apiGetSet(sid);
              openFullSetModal(setData);
            } catch (e) {
              // Fallback: navigate to Sets tab if modal fails
              switchView("sets");
              setTimeout(() => { if (window._openSetDetail) window._openSetDetail(sid); }, 250);
            }
          });
        });
      }

      colDetailContent.innerHTML = `
        <h2 class="section-title" style="margin-bottom:.5rem">${escHtml(colName)}</h2>
        <div class="detail-search-row">
          <input id="col-detail-search" type="search" class="detail-search-input"
                 placeholder="Search within this collection…" autocomplete="off">
        </div>
        <div id="col-type-filter" class="col-type-filter"></div>
        <div id="col-detail-items"></div>
        <div class="col-add-set-row">
          <button class="btn-set btn-sm col-add-set-btn" data-col-id="${id}">+ Add a set…</button>
          <button class="btn-secondary btn-sm col-strip-btn" data-col-id="${id}" title="Remove guitar chord symbols (e.g. &quot;Am&quot;) from ABC notation of all tunes in this collection">Strip chord symbols</button>
        </div>`;

      _colTypeFilter = "";
      _renderColItems("");
      const _typeFilterEl = document.getElementById("col-type-filter");
      if (_typeFilterEl) {
        const _tuneTypes = [...new Set(allColTunes.map(t => (t.type || "").toLowerCase()).filter(Boolean))].sort();
        if (_tuneTypes.length > 1) {
          _typeFilterEl.innerHTML = ["", ..._tuneTypes].map(ty =>
            `<button class="col-type-chip${ty === "" ? " active" : ""}" data-type="${ty}">${ty === "" ? "All" : ty.charAt(0).toUpperCase() + ty.slice(1) + "s"}</button>`
          ).join("");
          _typeFilterEl.querySelectorAll(".col-type-chip").forEach(chip => {
            chip.addEventListener("click", () => {
              _colTypeFilter = chip.dataset.type;
              _typeFilterEl.querySelectorAll(".col-type-chip").forEach(c => c.classList.toggle("active", c === chip));
              _renderColItems(document.getElementById("col-detail-search")?.value || "");
            });
          });
        }
      }
      document.getElementById("col-detail-search").addEventListener("input", e => {
        _renderColItems(e.target.value.trim());
      });

      // Add-a-set picker
      colDetailContent.querySelector(".col-add-set-btn").addEventListener("click", async () => {
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
            closeModal();
            // Re-open this collection detail
            btn.click();
          } catch {
            status.textContent = "Failed — please try again.";
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Add Set";
          }
        });
      });

      // Strip chord symbols
      const stripBtnDetail = colDetailContent.querySelector(".col-strip-btn");
      if (stripBtnDetail) {
        stripBtnDetail.addEventListener("click", async () => {
          if (!confirm(`Strip guitar chord symbols from all ABC tunes in "${colName}"?\nThis edits the ABC directly and cannot be undone.`)) return;
          stripBtnDetail.disabled = true;
          stripBtnDetail.textContent = "Stripping…";
          try {
            const res = await apiFetch(`/api/collections/${id}/strip-chords`, { method: "POST" });
            stripBtnDetail.textContent = `Done — ${res.stripped} tune${res.stripped !== 1 ? "s" : ""} updated`;
            setTimeout(() => { stripBtnDetail.textContent = "Strip chord symbols"; stripBtnDetail.disabled = false; }, 3000);
          } catch {
            alert("Failed. Please try again.");
            stripBtnDetail.textContent = "Strip chord symbols";
            stripBtnDetail.disabled = false;
          }
        });
      }
    });
  });

  const _colDetailBack = document.getElementById("col-detail-back");
  if (_colDetailBack && !_colDetailBack._bound) {
    _colDetailBack._bound = true;
    _colDetailBack.addEventListener("click", () => {
      document.getElementById("col-detail-view").classList.add("hidden");
      document.getElementById("col-detail-content").innerHTML = "";
      collectionsList.classList.remove("hidden");
      document.getElementById('recent-imports-card')?.classList.remove('hidden');
      const colViewHeader = document.getElementById("view-collections").querySelector(".view-header");
      if (colViewHeader) colViewHeader.classList.remove("hidden");
      const newColForm = document.getElementById("new-collection-form");
      if (newColForm && newColForm.dataset.wasVisible !== "true") newColForm.classList.add("hidden");
    });
  }


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

  collectionsList.querySelectorAll(".col-rename-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".set-card");
      const nameSpan = card.querySelector(".set-name");
      const colId = btn.dataset.colId;
      const oldName = nameSpan.textContent;
      const input = document.createElement("input");
      input.className = "set-rename-input";
      input.value = oldName;
      nameSpan.replaceWith(input);
      input.focus();
      input.select();
      const revert = () => { input.replaceWith(nameSpan); };
      const save = async () => {
        const newName = input.value.trim();
        if (!newName || newName === oldName) { revert(); return; }
        try {
          await apiFetch(`/api/collections/${colId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName }),
          });
          nameSpan.textContent = newName;
          input.replaceWith(nameSpan);
          const col = state.collections.find(c => String(c.id) === String(colId));
          if (col) col.name = newName;
        } catch { revert(); }
      };
      input.addEventListener("keydown", e => { if (e.key === "Enter") save(); else if (e.key === "Escape") revert(); });
      input.addEventListener("blur", save);
    });
  });

  collectionsList.querySelectorAll(".col-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const name = btn.closest(".set-card").querySelector(".set-name").textContent;
      const withTunes = confirm(
        `Delete collection "${name}"?\n\nOK = delete collection AND all its tunes\nCancel = keep tunes, just remove the collection`
      );
      // Second confirm only if deleting tunes
      if (withTunes && !confirm(`This will permanently delete ALL tunes in "${name}". Are you sure?`)) return;
      btn.disabled = true;
      try {
        const url = `/api/collections/${btn.dataset.colId}${withTunes ? "?delete_tunes=true" : ""}`;
        await apiFetch(url, { method: "DELETE" });
        btn.closest(".set-card").remove();
        state.collections = state.collections.filter(c => String(c.id) !== String(btn.dataset.colId));
        if (withTunes) { await loadTunes(); await loadStats(); window._loadRecentImports?.(); }
        if (!collectionsList.querySelector(".set-card")) {
          collectionsList.innerHTML = '<p class="empty">No collections yet. Create one to group tunes by theme!</p>';
        }
      } catch {
        alert("Failed to delete collection. Please try again.");
        btn.disabled = false;
      }
    });
  });

  collectionsList.querySelectorAll(".col-export-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      openCollectionExportModal(btn.dataset.colId, btn.dataset.colName);
    });
  });
  } // end _doRenderCollections

  if (_colsSearchInput) {
    _colsSearchInput.oninput = () => {
      const q = _colsSearchInput.value.trim().toLowerCase();
      _doRenderCollections(q ? collections.filter(c => c.name.toLowerCase().includes(q)) : collections);
    };
  }
  _doRenderCollections(
    (_colsSearchInput && _colsSearchInput.value.trim())
      ? collections.filter(c => c.name.toLowerCase().includes(_colsSearchInput.value.trim().toLowerCase()))
      : collections
  );
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

  const toolbar          = document.getElementById("recent-imports-toolbar");
  const selectAllCb      = document.getElementById("recent-select-all");
  const deleteSelBtn     = document.getElementById("recent-delete-selected");
  const addToColBtn      = document.getElementById("recent-add-to-collection-btn");
  const newColBtn        = document.getElementById("recent-new-collection-btn");

  // Not present on mobile — skip entire block
  if (!selectAllCb) return;

  function _updateRecentToolbar() {
    const cbs    = listEl.querySelectorAll(".recent-row-cb");
    const checked = listEl.querySelectorAll(".recent-row-cb:checked");
    const allChecked = cbs.length > 0 && checked.length === cbs.length;
    // Only show select-all as checked when it was explicitly used to select all.
    // Individual row selections show indeterminate, never auto-check select-all.
    selectAllCb.indeterminate = checked.length > 0 && !allChecked;
    if (!checked.length) selectAllCb.checked = false;
    const hasChecked = checked.length > 0;
    deleteSelBtn.disabled  = !hasChecked;
    addToColBtn.disabled   = !hasChecked;
    newColBtn.disabled     = !hasChecked;
    deleteSelBtn.textContent = hasChecked
      ? `🗑 Delete ${checked.length} tune${checked.length === 1 ? "" : "s"}`
      : "🗑 Delete selected";
  }

  selectAllCb?.addEventListener("change", () => {
    listEl.querySelectorAll(".recent-row-cb").forEach(cb => { cb.checked = selectAllCb.checked; });
    // Keep select-all checked/unchecked state as the user left it; clear indeterminate
    selectAllCb.indeterminate = false;
    _updateRecentToolbar();
  });

  deleteSelBtn.addEventListener("click", async () => {
    const ids = [...listEl.querySelectorAll(".recent-row-cb:checked")].map(cb => Number(cb.dataset.tuneId));
    if (!ids.length) return;
    if (!confirm(`Permanently delete ${ids.length} tune${ids.length === 1 ? "" : "s"}?`)) return;
    deleteSelBtn.disabled = true;
    deleteSelBtn.textContent = "Deleting…";
    try {
      await apiFetch("/api/tunes/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      await loadRecent(_recentDays);
      await Promise.all([loadTunes(), loadStats()]);
    } catch {
      alert("Delete failed. Please try again.");
      deleteSelBtn.disabled = false;
    }
  });

  addToColBtn.addEventListener("click", async () => {
    const ids = [...listEl.querySelectorAll(".recent-row-cb:checked")].map(cb => Number(cb.dataset.tuneId));
    if (!ids.length) return;
    const cols = await apiFetch("/api/collections");
    if (!cols.length) { alert("No collections yet. Use 'New collection' to create one first."); return; }
    const opts = cols.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
    const choice = prompt(`Add ${ids.length} tune${ids.length === 1 ? "" : "s"} to which collection?\n\n${opts}\n\nEnter number:`);
    if (!choice) return;
    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= cols.length) { alert("Invalid choice."); return; }
    const col = cols[idx];
    addToColBtn.disabled = true;
    try {
      for (const id of ids) {
        await apiFetch(`/api/collections/${col.id}/tunes`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tune_id: id }),
        }).catch(() => {}); // ignore duplicates
      }
      alert(`Added to "${col.name}".`);
      window._loadRecentImports?.();
    } catch {
      alert("Failed to add to collection. Please try again.");
    } finally {
      addToColBtn.disabled = false;
    }
  });

  newColBtn.addEventListener("click", async () => {
    const ids = [...listEl.querySelectorAll(".recent-row-cb:checked")].map(cb => Number(cb.dataset.tuneId));
    if (!ids.length) return;
    const name = prompt(`Name for new collection (will contain ${ids.length} tune${ids.length === 1 ? "" : "s"}):`);
    if (!name || !name.trim()) return;
    newColBtn.disabled = true;
    try {
      const col = await apiCreateCollection(name.trim(), "");
      for (const id of ids) {
        await apiFetch(`/api/collections/${col.id}/tunes`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tune_id: id }),
        });
      }
      alert(`Created collection "${col.name}" with ${ids.length} tune${ids.length === 1 ? "" : "s"}.`);
      if (state.view === "collections") loadCollections();
    } catch (err) {
      alert(`Failed: ${err.message}`);
    } finally {
      newColBtn.disabled = false;
    }
  });

  async function loadRecent(days) {
    _recentDays = days;
    countEl.textContent = "";
    listEl.innerHTML = '<p class="loading" style="padding:.5rem 0">Loading…</p>';
    try {
      const res = await fetch(`/api/tunes/recent?days=${days}`);
      const tunes = await res.json();
      countEl.textContent = `${tunes.length} tune${tunes.length === 1 ? "" : "s"}`;
      if (!tunes.length) {
        listEl.innerHTML = `<p class="empty" style="padding:.5rem 0">No tunes imported in this period.</p>`;
        toolbar.classList.add("hidden");
        return;
      }
      toolbar.classList.remove("hidden");
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
      deleteSelBtn.disabled = true;
      addToColBtn.disabled  = true;
      newColBtn.disabled    = true;
      deleteSelBtn.textContent = "🗑 Delete selected";
      listEl.innerHTML = tunes.map(t => `
        <div class="set-tune-row">
          <input type="checkbox" class="recent-row-cb" data-tune-id="${t.id}" style="flex-shrink:0;cursor:pointer">
          <button class="set-tune-title tune-open-btn" data-tune-id="${t.id}">${escHtml(t.title)}</button>
          <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
          <span class="badge badge-key">${escHtml(t.key || "")}</span>
          <span class="recent-import-date">${relativeDate(t.imported_at)}</span>
        </div>`).join("");
      listEl.querySelectorAll(".recent-row-cb").forEach(cb => {
        cb.addEventListener("change", _updateRecentToolbar);
      });
      // wire up tune-open buttons
      listEl.querySelectorAll(".tune-open-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const tune = await fetchTune(btn.dataset.tuneId);
          await Promise.all([fetchSets(), fetchCollections()]);
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
      toolbar.classList.add("hidden");
    }
  }

  // Range preset buttons
  rangeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      rangeButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const days = Number(btn.dataset.days);
      if (daysInput) daysInput.value = days;
      loadRecent(days);
    });
  });

  // Custom days input
  let _debounce;
  daysInput?.addEventListener("input", () => {
    const days = Math.max(1, Math.min(365, Number(daysInput.value) || 1));
    rangeButtons.forEach(b => b.classList.remove("active"));
    clearTimeout(_debounce);
    _debounce = setTimeout(() => loadRecent(days), 400);
  });

  // Show / Hide button — lazy-loads on first Show click
  let _loaded = false;
  const hideBtn = document.getElementById("recent-imports-hide-btn");
  if (hideBtn) {
    hideBtn.addEventListener("click", () => {
      if (listEl.classList.contains("hidden")) {
        // Expanding
        listEl.classList.remove("hidden");
        hideBtn.textContent = "Hide";
        if (!_loaded) { _loaded = true; loadRecent(_recentDays); }
      } else {
        listEl.classList.add("hidden");
        hideBtn.textContent = "Show";
      }
    });
  }

  // Expose so other code can trigger a refresh (only if already expanded)
  window._loadRecentImports = () => { if (_loaded) loadRecent(_recentDays); };
})();

async function loadCollections() {
  collectionsList.innerHTML = '<p class="loading">Loading collections…</p>';
  try {
    const collections = await fetchCollections();
    renderCollections(collections);
  } catch {
    collectionsList.innerHTML = '<p class="empty">Failed to load collections.</p>';
  }
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
  if (filterMode) filterMode.innerHTML = '<option value="">All modes</option>';
  if (filterComposer) filterComposer.innerHTML = '<option value="">All composers</option>';

  // Grouped type options — each group value matches multiple DB types
  const TYPE_GROUPS = [
    { label: "Reel",       value: "reel",       match: /reel/i },
    { label: "Jig",        value: "jig",        match: /jig|slide/i },
    { label: "Hornpipe",   value: "hornpipe",   match: /hornpipe/i },
    { label: "Strathspey", value: "strathspey", match: /strathspey|highland/i },
    { label: "Waltz",      value: "waltz",      match: /waltz/i },
    { label: "March",      value: "march",      match: /march/i },
    { label: "Air",        value: "air",        match: /air/i },
    { label: "Polka",      value: "polka",      match: /polka/i },
    { label: "Other",      value: "__other__",  match: null },
  ];
  // Build a set of types from DB to know which groups have data
  const typeSet = new Set((types||[]).map(t => t.toLowerCase()));
  const usedGroups = new Set();
  TYPE_GROUPS.forEach(g => {
    if (g.match) {
      const hasMatch = [...typeSet].some(t => g.match.test(t));
      if (hasMatch) {
        usedGroups.add(g.value);
        const o = document.createElement("option");
        o.value = g.value; o.textContent = g.label;
        filterType.appendChild(o);
      }
    } else {
      // "Other" — show if any types don't match any group
      const unmatched = [...typeSet].filter(t =>
        !TYPE_GROUPS.slice(0,-1).some(g2 => g2.match && g2.match.test(t))
      );
      if (unmatched.length) {
        const o = document.createElement("option");
        o.value = "__other__"; o.textContent = "Other";
        filterType.appendChild(o);
      }
    }
  });
  // Store grouping map on the element for use in loadTunes
  filterType._typeGroups = TYPE_GROUPS;
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
  // Update To Do badge after loading (no filters = full library)
  if (state.page === 1 && !state.q && !state.type && !state.key) {
    _refreshTodoBadge();
  }
}

// ── To Do system ──────────────────────────────────────────────────────────────
// _todoSuggestions: null = not yet fetched, [] = fetched but empty, [...] = items
// _todoSkipped: set of "a-b" keys skipped this session (not persisted)
let _todoSuggestions = null;
const _todoSkipped = new Set();

async function _refreshTodoBadge() {
  try {
    const list = await apiFetch("/api/tunes/version-suggestions");
    // Filter out session-skipped items
    _todoSuggestions = list.filter(({ tune_a, tune_b }) =>
      !_todoSkipped.has(`${Math.min(tune_a.id, tune_b.id)}-${Math.max(tune_a.id, tune_b.id)}`)
    );
    const count = _todoSuggestions.length;
    if (count > 0) {
      todoBadge.textContent = count;
      todoBadge.classList.remove("hidden");
    } else {
      todoBadge.classList.add("hidden");
    }
    // If To Do view is currently open, refresh it
    if (state.view === "todo") loadTodoView();
  } catch { /* silently ignore */ }
}

async function loadTodoView() {
  const matchingSection = document.getElementById("todo-section-matching");
  const matchingList    = document.getElementById("todo-matching-list");
  const emptyEl         = document.getElementById("todo-empty");

  // Fetch fresh if needed
  if (_todoSuggestions === null) {
    matchingList.innerHTML = '<p class="loading">Loading…</p>';
    await _refreshTodoBadge();
  }

  const items = (_todoSuggestions || []);

  if (!items.length) {
    matchingSection.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  matchingSection.classList.remove("hidden");

  matchingList.innerHTML = items.map((item, i) => `
    <div class="todo-card" data-idx="${i}">
      <div class="todo-card-body">
        <span class="todo-card-title">${escHtml(item.tune_a.title)}</span>
        <span class="todo-card-sep">and</span>
        <span class="todo-card-title">${escHtml(item.tune_b.title)}</span>
        <span class="todo-card-hint">look like the same tune</span>
      </div>
      <div class="todo-card-actions">
        <button class="btn-primary btn-sm todo-group-btn" data-idx="${i}">Group as versions</button>
        <button class="btn-secondary btn-sm todo-skip-btn" data-idx="${i}">Skip for now</button>
        <button class="btn-danger btn-sm todo-dismiss-btn" data-idx="${i}">Not the same</button>
      </div>
    </div>
  `).join("");

  // Group
  matchingList.querySelectorAll(".todo-group-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const { tune_a, tune_b } = items[+btn.dataset.idx];
      const tunes = await Promise.all([fetchTune(tune_a.id), fetchTune(tune_b.id)]);
      await Promise.all([fetchSets(), fetchCollections()]);
      _todoSuggestions = null; // force re-fetch after dialog
      _showGroupDialog(tunes);
    });
  });

  // Skip for now (session-only, no DB write)
  matchingList.querySelectorAll(".todo-skip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const { tune_a, tune_b } = items[+btn.dataset.idx];
      _todoSkipped.add(`${Math.min(tune_a.id, tune_b.id)}-${Math.max(tune_a.id, tune_b.id)}`);
      _todoSuggestions = null; // re-filter on next load
      _refreshTodoBadge();
    });
  });

  // Not the same — permanently dismissed
  matchingList.querySelectorAll(".todo-dismiss-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const { tune_a, tune_b } = items[+btn.dataset.idx];
      try {
        await apiFetch("/api/tunes/version-suggestions/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tune_id_a: tune_a.id, tune_id_b: tune_b.id }),
        });
      } catch { /* best-effort */ }
      _todoSuggestions = null; // force fresh fetch from DB
      _refreshTodoBadge();
    });
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

searchEl?.addEventListener("input", () => {
  // Stop any playing audio when user starts typing in library search
  if (_synthController) { try { _synthController.pause(); } catch {} }
  const inlineMp3 = document.getElementById("inline-mp3-player");
  if (inlineMp3) { inlineMp3.pause(); inlineMp3.src = ""; }
  state.q = searchEl.value.trim(); debouncedLoad();
});
filterType?.addEventListener("change", () => { state.type = filterType.value; state.page = 1; loadTunes(); });
filterKey?.addEventListener("change",  () => { state.key  = filterKey.value;  state.page = 1; loadTunes(); });
filterMode?.addEventListener("change", () => { state.mode = filterMode.value; state.page = 1; loadTunes(); });
if (filterComposer) filterComposer.addEventListener("change", () => { state.composer = filterComposer.value; state.page = 1; loadTunes(); });

filterRating?.addEventListener("change", () => {
  state.min_rating = Number(filterRating.value) || 0;
  state.page = 1;
  loadTunes();
});

filterHitlistBtn?.addEventListener("click", () => {
  state.hitlist = !state.hitlist;
  filterHitlistBtn.classList.toggle("active", state.hitlist);
  state.page = 1;
  loadTunes();
});

filterFavouriteBtn?.addEventListener("click", () => {
  state.favourite = !state.favourite;
  filterFavouriteBtn.classList.toggle("active", state.favourite);
  state.page = 1;
  loadTunes();
});

// ── Print list ────────────────────────────────────────────────────────────────
document.getElementById("print-btn")?.addEventListener("click", async () => {
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
  filterFavouriteBtn?.classList.remove("active");
  document.querySelectorAll(".content-filter-btn").forEach(b => b.classList.remove("active"));
  window._alphaReset?.();
  Object.assign(state, { page: 1, q: "", type: "", key: "", mode: "", composer: "", hitlist: false, favourite: false, min_rating: 0, has_content: "", starts_with: "" });
  loadTunes();
});

// ── Alphabet slider navigation ────────────────────────────────────────────────
(function _initAlphaNav() {
  const slider   = document.getElementById("alpha-slider");
  const allBtn   = document.getElementById("alpha-all-btn");
  const currentEl = document.getElementById("alpha-current");
  if (!slider) return;

  function _alphaApply(letter) {
    state.starts_with = letter;
    state.page = 1;
    currentEl.textContent = letter ? letter : "";
    allBtn.classList.toggle("active", !letter);
    loadTunes();
  }

  // Expose reset so clearBtn (and bottom nav sync) can call it
  window._alphaReset = () => {
    slider.value = "0";
    currentEl.textContent = "";
    allBtn.classList.add("active");
    const sliderBot = document.getElementById("alpha-slider-bot");
    const currentElBot = document.getElementById("alpha-current-bot");
    const allBtnBot = document.getElementById("alpha-all-btn-bot");
    if (sliderBot) sliderBot.value = "0";
    if (currentElBot) currentElBot.textContent = "";
    if (allBtnBot) allBtnBot.classList.add("active");
  };

  slider.addEventListener("input", () => {
    const letter = String.fromCharCode(65 + parseInt(slider.value));
    currentEl.textContent = letter;
    allBtn.classList.remove("active");
  });

  slider.addEventListener("change", () => {
    const letter = String.fromCharCode(65 + parseInt(slider.value));
    _alphaApply(letter);
  });

  allBtn.addEventListener("click", () => {
    slider.value = "0";
    _alphaApply("");
  });
})();

// ── Bottom alphabet slider (mirrors the top one) ──────────────────────────────
(function _initAlphaNavBottom() {
  const sliderBot    = document.getElementById("alpha-slider-bot");
  const allBtnBot    = document.getElementById("alpha-all-btn-bot");
  const currentElBot = document.getElementById("alpha-current-bot");
  if (!sliderBot) return;

  const topSlider    = document.getElementById("alpha-slider");
  const topCurrent   = document.getElementById("alpha-current");
  const topAllBtn    = document.getElementById("alpha-all-btn");

  function _syncTop(letter) {
    if (topSlider) topSlider.value = sliderBot.value;
    if (topCurrent) topCurrent.textContent = letter;
    if (topAllBtn)  topAllBtn.classList.toggle("active", !letter);
  }

  sliderBot.addEventListener("input", () => {
    const letter = String.fromCharCode(65 + parseInt(sliderBot.value));
    currentElBot.textContent = letter;
    allBtnBot.classList.remove("active");
    _syncTop(letter);
  });

  sliderBot.addEventListener("change", () => {
    const letter = String.fromCharCode(65 + parseInt(sliderBot.value));
    state.starts_with = letter;
    state.page = 1;
    loadTunes();
  });

  allBtnBot.addEventListener("click", () => {
    sliderBot.value = "0";
    currentElBot.textContent = "";
    allBtnBot.classList.add("active");
    _syncTop("");
    state.starts_with = "";
    state.page = 1;
    loadTunes();
  });
})();

// Content-type filter buttons (toggle, mutually exclusive)
document.querySelectorAll(".content-filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const val = btn.dataset.content;
    if (state.has_content === val) {
      // clicking active button clears it
      state.has_content = "";
      btn.classList.remove("active");
    } else {
      document.querySelectorAll(".content-filter-btn").forEach(b => b.classList.remove("active"));
      state.has_content = val;
      btn.classList.add("active");
    }
    state.page = 1;
    loadTunes();
  });
});

pagination.addEventListener("click", e => {
  const btn = e.target.closest("button[data-page]");
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.page);
  loadTunes();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.getElementById("pagination-top")?.addEventListener("click", e => {
  const btn = e.target.closest("button[data-page]");
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.page);
  loadTunes();
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
      fetchSets(); fetchCollections(); // background refresh
      const defaultVer = versions.find(v => v.is_default) || versions[0];
      const firstTune = await fetchTune(defaultVer.id);
      const parentId = Number(card.dataset.id);
      renderModal(firstTune, () => renderVersionsPanel(parentId), versions);
      modalOverlay.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      if (!firstTune.abc && firstTune.sibling_abc) {
        requestAnimationFrame(() => renderSheetMusicAudioOnly(firstTune.sibling_abc));
      }
    }
    return;
  }
  // Refresh sets/collections in background — don't block modal open
  fetchSets(); fetchCollections();
  const tune = await fetchTune(card.dataset.id);
  renderModal(tune);
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  if (!tune.abc && tune.sibling_abc) {
    requestAnimationFrame(() => renderSheetMusicAudioOnly(tune.sibling_abc));
  }
});

tuneList.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") e.target.click();
});

modalClose.addEventListener("click", () => {
  const bldrBack = document.getElementById("bldr-back");
  if (bldrBack) bldrBack.click(); else closeModal();
});

// ── Global fullscreen toggle ──────────────────────────────────────────────────
const _modalFsBtn = document.getElementById("modal-fullscreen");
function _isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function _toggleFullscreen() {
  if (_isFullscreen()) {
    (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
  } else {
    const el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
  }
}
_modalFsBtn?.addEventListener("click", _toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  if (_modalFsBtn) { _modalFsBtn.title = _isFullscreen() ? "Exit full screen" : "Full screen"; _modalFsBtn.textContent = _isFullscreen() ? "⛶✕" : "⛶"; }
});
document.addEventListener("webkitfullscreenchange", () => {
  if (_modalFsBtn) { _modalFsBtn.title = _isFullscreen() ? "Exit full screen" : "Full screen"; _modalFsBtn.textContent = _isFullscreen() ? "⛶✕" : "⛶"; }
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
  _stopPracticeAudio();
  _stopMetronome();
  const inlineMp3 = document.getElementById("inline-mp3-player");
  if (inlineMp3) { inlineMp3.pause(); inlineMp3.src = ""; }
  // Stop any inline video embeds inside the modal (YouTube iframes + <video> elements)
  modalContent.querySelectorAll(".media-inline-embed iframe").forEach(el => { el.src = ""; });
  modalContent.querySelectorAll(".media-inline-embed video, .media-inline-embed audio").forEach(el => { el.pause(); el.src = ""; });
  closeMediaOverlay();
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

// ── Membership link navigation (sets/collections shown in modal header) ──────
modalOverlay.addEventListener("click", e => {
  const link = e.target.closest(".modal-membership-link");
  if (!link) return;
  e.preventDefault();
  const setId = link.dataset.setId;
  const colId = link.dataset.colId;
  closeModal();
  if (setId) {
    // Open set detail directly
    apiGetSet(Number(setId)).then(setData => {
      if (setData) openFullSetModal(setData, { onBack: null });
    }).catch(() => {});
  }
  if (colId) {
    // Navigate to collection detail
    switchView('collections');
    setTimeout(() => {
      const btn = document.querySelector(`.col-expand-btn[data-col-id="${colId}"]`);
      if (btn) btn.click();
    }, 300);
  }
});

// Note: bar-selection click listener is attached inside renderSheetMusic (capture phase).

// ── Nav ───────────────────────────────────────────────────────────────────────
navLibrary.addEventListener("click",      () => switchView("library"));
navSets.addEventListener("click",         () => switchView("sets"));
navCollections.addEventListener("click",  () => switchView("collections"));
navNotes.addEventListener("click",        () => switchView("notes"));
navAchievements.addEventListener("click", () => switchView("achievements"));
if (navPractice) navPractice.addEventListener("click", () => switchView("practice"));
navTodo.addEventListener("click",         () => switchView("todo"));
document.getElementById("todo-back-btn")?.addEventListener("click", () => switchView("library"));

// Links ▾ dropdown
const navLinksBtn  = document.getElementById("nav-links-btn");
const navLinksMenu = document.getElementById("nav-links-menu");
if (navLinksBtn && navLinksMenu) {
  navLinksBtn.addEventListener("click", e => {
    e.stopPropagation();
    navLinksMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", () => navLinksMenu.classList.add("hidden"));
  navLinksMenu.addEventListener("click", e => e.stopPropagation());
}

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
        const tunesForPreview = chosen.filter(t => t.abc);
        if (!tunesForPreview.length) { const b = document.getElementById("bldr-preview-btn"); b.textContent = "No ABC available"; b.disabled = true; return; }
        openFullSetModal({ id: 0, name: `Preview: ${template.name}`, tunes: chosen }, { onBack: render });
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

  let searchQ = "";

  function renderList() {
    const listEl = document.getElementById("bldr-tune-list");
    if (!listEl) return;
    const q = searchQ.toLowerCase();
    const filtered = q ? tunes.filter(t => t.title.toLowerCase().includes(q)) : tunes;
    if (!filtered.length) {
      listEl.innerHTML = `<p class="bldr-empty">${tunes.length ? "No matching tunes." : "No tunes found."}</p>`;
      return;
    }
    listEl.innerHTML = filtered.map(t => `
      <button class="bldr-slot-tune" data-tune-id="${t.id}">
        <span class="bldr-slot-tune-title">${escHtml(t.title)}</span>
        <span class="badge ${typeBadgeClass(t.type)}">${escHtml(t.type || "")}</span>
        <span class="badge ${keyBadgeClass(t.key)}">${escHtml(t.key || "")}</span>
      </button>`).join("");
    listEl.querySelectorAll(".bldr-slot-tune").forEach(btn => {
      btn.addEventListener("click", async () => {
        const stub = filtered.find(t => String(t.id) === btn.dataset.tuneId);
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
      <input id="bldr-first-search" type="search" class="bldr-search-input"
             placeholder="Search tunes…" autocomplete="off" spellcheck="false" value="${escHtml(searchQ)}">
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
  const _firstSearch = document.getElementById("bldr-first-search");
  _firstSearch.addEventListener("input", () => { searchQ = _firstSearch.value.trim(); renderList(); });
  _firstSearch.focus();
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
        <button class="bldr-remove-tune btn-icon" data-idx="${i}" title="Remove from set">✕</button>
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
      <div class="bldr-filter-bar bldr-filter-bar--compact">
        <div class="bldr-type-row">
          <label class="bldr-label">Collection</label>
          <select id="bldr-step-collection" class="bldr-type-select">
            <option value="">All collections</option>
          </select>
        </div>
      </div>
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

    // Populate + wire collection dropdown in step mode
    const stepColEl = document.getElementById("bldr-step-collection");
    if (stepColEl) {
      apiFetch("/api/collections").then(cols => {
        cols.forEach(c => {
          const o = document.createElement("option");
          o.value = c.id; o.textContent = c.name;
          if (String(c.id) === String(filters.collectionId)) o.selected = true;
          stepColEl.appendChild(o);
        });
      }).catch(() => {});
      stepColEl.addEventListener("change", () => {
        const sel = stepColEl.options[stepColEl.selectedIndex];
        const newFilters = { ...filters, collectionId: stepColEl.value, collectionName: stepColEl.value ? sel.text : "" };
        _bldrStepMode(selectedTunes, newFilters, onFirstBack);
      });
    }

    document.getElementById("bldr-back").addEventListener("click", () => {
      if (selectedTunes.length > 1) _bldrStepMode(selectedTunes.slice(0, -1), filters, onFirstBack);
      else if (onFirstBack) onFirstBack();
      else _bldrPickFirst(filters);
    });

    document.getElementById("bldr-preview-btn").addEventListener("click", () => {
      const tunesForPreview = selectedTunes.filter(t => t.abc);
      if (!tunesForPreview.length) { const b = document.getElementById("bldr-preview-btn"); b.textContent = "No ABC available"; b.disabled = true; return; }
      openFullSetModal({ id: 0, name: "Preview", tunes: selectedTunes }, { onBack: render });
    });

    document.getElementById("bldr-save-btn").addEventListener("click", () => {
      const defaultName = selectedTunes[0] ? `${selectedTunes[0].title} – Set` : "New Set";
      _bldrSave(selectedTunes, defaultName, render);
    });

    modalContent.querySelectorAll(".bldr-slot-tune").forEach(btn => {
      btn.addEventListener("click", () => {
        const gi = Number(btn.dataset.group);
        const tune = groups[gi].tunes.find(t => t.id === Number(btn.dataset.tuneId));
        if (tune) _bldrStepMode([...selectedTunes, tune], filters, onFirstBack);
      });
    });

    modalContent.querySelectorAll(".bldr-remove-tune").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const newTunes = selectedTunes.filter((_, j) => j !== idx);
        if (!newTunes.length) {
          if (onFirstBack) onFirstBack();
          else _bldrPickFirst(filters);
        } else {
          _bldrStepMode(newTunes, filters, onFirstBack);
        }
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
        <button id="bldr-confirm-save" class="btn-primary">Confirm Save</button>
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

document.getElementById("build-set-btn")?.addEventListener("click", showSetBuilder);

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
    // Hide list immediately so user never sees the full list before the detail opens
    setsList.classList.add("hidden");
    await loadSets();
    // Jump straight into the new set's detail view so tunes can be added immediately
    if (window._openSetDetail) window._openSetDetail(set.id);
  } finally {
    createSetBtn.disabled = false;
  }
});

newSetName.addEventListener("keydown", e => { if (e.key === "Enter") createSetBtn.click(); });

// ── Collections form ──────────────────────────────────────────────────────────
newCollectionBtn?.addEventListener("click", () => {
  newCollectionForm?.classList.remove("hidden");
  newCollectionName?.focus();
});

cancelCollectionBtn?.addEventListener("click", () => {
  newCollectionForm?.classList.add("hidden");
  if (newCollectionName) newCollectionName.value = "";
  newCollectionDesc.value = "";
});

createCollectionBtn?.addEventListener("click", async () => {
  const name = newCollectionName.value.trim();
  if (!name) { newCollectionName?.focus(); return; }
  if (createCollectionBtn) createCollectionBtn.disabled = true;
  try {
    const col = await apiCreateCollection(name, newCollectionDesc.value.trim());
    state.collections.push({ ...col, tune_count: 0 });
    newCollectionForm?.classList.add("hidden");
    if (newCollectionName) newCollectionName.value = "";
    newCollectionDesc.value = "";
    loadCollections();
  } finally {
    if (createCollectionBtn) createCollectionBtn.disabled = false;
  }
});

newCollectionName?.addEventListener("keydown", e => { if (e.key === "Enter") createCollectionBtn?.click(); });

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
    discogBtn?.addEventListener("click", () => {
      discogPanel?.classList.toggle("hidden");
      if (!discogPanel?.classList.contains("hidden")) discogArtist?.focus();
    });
  }
  if (discogCancel) {
    discogCancel?.addEventListener("click", () => {
      discogPanel?.classList.add("hidden");
      if (discogArtist) discogArtist.value = "";
      if (discogColName) discogColName.value = "";
      discogStatus?.classList.add("hidden");
    });
  }

  // Quick-pick artist buttons
  document.querySelectorAll(".discog-artist-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (discogArtist) discogArtist.value = btn.dataset.artist;
      if (discogColName) discogColName.value = `${btn.dataset.artist} Repertoire`;
    });
  });

  if (discogScanBtn) {
    discogScanBtn?.addEventListener("click", async () => {
      const artist = discogArtist.value.trim();
      if (!artist) { discogArtist?.focus(); return; }
      discogScanBtn.disabled = true;
      if (discogStatus) discogStatus.textContent = `Searching TheSession.org for "${artist}" recordings…`;
      if (discogStatus) discogStatus.className = "discog-status";
      try {
        const result = await apiFetch("/api/discography/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artist,
            collection_name: discogColName.value.trim() || null,
          }),
        });
        if (discogStatus) discogStatus.textContent =
          `Done! Found ${result.session_tunes_found} tunes on TheSession, `
          + `matched ${result.matched_in_library} in your library. `
          + `Collection "${result.collection_name}" ${result.matched_in_library > 0 ? "created/updated." : "is empty."}`;
        discogStatus?.classList.add("discog-ok");
        loadCollections();
      } catch (err) {
        if (discogStatus) discogStatus.textContent = `Error: ${err.message || "scan failed"}`;
        discogStatus?.classList.add("discog-err");
      } finally {
        discogScanBtn.disabled = false;
      }
    });
  }
}

// ── Import ────────────────────────────────────────────────────────────────────
importBtn?.addEventListener("click", () => {
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
  _resetImportTabs();
}

function _resetImportTabs() {
  // Clear file count labels, hide preview areas, clear result messages
  // so re-opening the import modal shows a clean state.
  const clearIds = [
    "audio-file-count", "pdf-file-count", "photo-file-count", "folder-summary",
  ];
  clearIds.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ""; });

  const hideIds = [
    "audio-preview-area", "audio-result",
    "pdf-preview-area", "pdf-result",
    "photo-preview-area", "photo-result",
    "folder-preview", "folder-result",
    "session-abc-results",
  ];
  hideIds.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add("hidden"); });

  // Reset file inputs so the same file can be re-selected
  ["audio-file-input", "audio-folder-input", "pdf-file-input"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
}

// Called after any successful import: reload data, close the import modal,
// and navigate the user to the library so they can see the new tunes.
// Pass tuneId to open that tune's modal immediately after navigating.
async function _afterImportSuccess(tuneId = null) {
  await Promise.all([loadStats(), loadFilters(), loadTunes()]);
  window._loadRecentImports?.();
  setTimeout(async () => {
    closeImport();
    switchView("library");
    if (tuneId) {
      // Brief pause for the library to paint, then open the tune modal
      await new Promise(r => setTimeout(r, 350));
      try {
        const t = await apiFetch(`/api/tunes/${tuneId}`);
        openModal(t);
      } catch {}
    }
  }, 600);
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

// ── Audio Files Import ────────────────────────────────────────────────────────
// Prevent the browser from opening dropped files as a new tab anywhere on the page.
// Capture phase fires before element handlers so the browser default is cancelled
// first; we do NOT stopPropagation so the event still reaches the drop zone.
["dragenter", "dragover", "drop"].forEach(ev => {
  window.addEventListener(ev, e => e.preventDefault(), true);
});

(function(){
  const fileInput   = document.getElementById("audio-file-input");
  if (!fileInput) return; // not present on mobile
  const folderInput = document.getElementById("audio-folder-input");
  const dropZone    = document.getElementById("audio-drop-zone");
  const fileCount   = document.getElementById("audio-file-count");
  const previewArea = document.getElementById("audio-preview-area");
  const previewBody = document.getElementById("audio-preview-body");
  const importBtn   = document.getElementById("audio-import-btn");
  const resultDiv   = document.getElementById("audio-result");

  const AUDIO_RE = /\.(mp3|m4a|wav|ogg|aac|flac)$/i;

  let _audioFiles = [];
  let _audioPreview = [];  // [{filename, title, action, existing_id, existing_title}]

  // Labels wrap the inputs natively — just listen for change
  fileInput.addEventListener("change",   () => loadAudioPreview(Array.from(fileInput.files).filter(f => AUDIO_RE.test(f.name))));
  folderInput.addEventListener("change", () => loadAudioPreview(Array.from(folderInput.files).filter(f => AUDIO_RE.test(f.name))));

  async function loadAudioPreview(files) {
    _audioFiles = files;
    if (!files.length) return;
    fileCount.textContent = `${files.length} file${files.length !== 1 ? "s" : ""} selected`;
    previewBody.innerHTML = `<tr><td colspan="3" style="color:var(--text-muted);padding:.4rem 0">Matching against library…</td></tr>`;
    previewArea.classList.remove("hidden");

    const fd = new FormData();
    files.forEach(f => fd.append("files", f));
    let data;
    try {
      data = await apiFetch("/api/import/audio/preview", { method: "POST", body: fd });
    } catch (e) {
      previewBody.innerHTML = `<tr><td colspan="3" style="color:var(--danger)">Error: ${escHtml(e.message)}</td></tr>`;
      return;
    }
    _audioPreview = data.files;

    previewBody.innerHTML = data.files.map((item, i) => {
      const actionSel = item.action === "attach"
        ? `<select class="audio-action-sel" data-idx="${i}">
             <option value="attach" selected>📎 Attach to "${escHtml(item.existing_title)}"</option>
             <option value="create">➕ Create new tune</option>
           </select>`
        : `<select class="audio-action-sel" data-idx="${i}">
             <option value="create" selected>➕ Create new tune</option>
             <option value="attach" disabled>(no match found)</option>
           </select>`;
      return `<tr>
        <td class="pdf-col-file" title="${escHtml(item.filename)}">${escHtml(item.filename)}</td>
        <td class="pdf-col-title"><input class="pdf-title-input audio-title-input" data-idx="${i}" value="${escHtml(item.title)}" /></td>
        <td class="pdf-col-action">${actionSel}</td>
      </tr>`;
    }).join("");
  }

  dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drop-hover"); });
  dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("drop-hover"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("drop-hover");
    const audio = Array.from(e.dataTransfer.files).filter(f => AUDIO_RE.test(f.name));
    if (audio.length) loadAudioPreview(audio);
    else fileCount.textContent = `No audio files found in drop — use "Choose folder…" instead`;
  });

  importBtn?.addEventListener("click", async () => {
    if (!_audioFiles.length) return;
    const titles     = Array.from(previewBody.querySelectorAll(".audio-title-input")).map(el => el.value.trim());
    const actions    = Array.from(previewBody.querySelectorAll(".audio-action-sel")).map(el => el.value);
    const existingIds = _audioPreview.map((item, i) => actions[i] === "attach" ? item.existing_id : null);

    importBtn.disabled = true;
    importBtn.textContent = "Importing…";
    resultDiv.classList.add("hidden");

    const fd = new FormData();
    _audioFiles.forEach(f => fd.append("files", f));
    const params = new URLSearchParams({
      titles: JSON.stringify(titles),
      actions: JSON.stringify(actions),
      existing_ids: JSON.stringify(existingIds),
    });

    let data;
    try {
      data = await apiFetch(`/api/import/audio/confirm?${params}`, { method: "POST", body: fd });
    } catch (e) {
      resultDiv.textContent = `Error: ${e.message}`;
      resultDiv.className = "import-result import-error";
      resultDiv.classList.remove("hidden");
      importBtn.disabled = false;
      importBtn.textContent = "Import audio files";
      return;
    }

    const parts = [];
    if (data.attached) parts.push(`${data.attached} attached to existing tune${data.attached !== 1 ? "s" : ""}`);
    if (data.created)  parts.push(`${data.created} new tune${data.created !== 1 ? "s" : ""} created`);
    resultDiv.textContent = `Done — ${parts.join(", ")}.`;
    resultDiv.className = "import-result import-success";
    resultDiv.classList.remove("hidden");
    _audioFiles = [];
    fileInput.value = "";
    fileCount.textContent = "";
    previewArea.classList.add("hidden");
    importBtn.disabled = false;
    importBtn.textContent = "Import audio files";
    _afterImportSuccess(data.tune_id || null);
  });
})();

// ── PDF Bulk Import ────────────────────────────────────────────────────────────
(function(){
  const fileInput         = document.getElementById("pdf-file-input");
  if (!fileInput) return;
  const dropZone          = document.getElementById("pdf-drop-zone");
  const fileCount         = document.getElementById("pdf-file-count");
  const previewArea       = document.getElementById("pdf-preview-area");
  const previewBody       = document.getElementById("pdf-preview-body");
  const importBtn         = document.getElementById("pdf-import-btn");
  const resultDiv         = document.getElementById("pdf-result");
  const pdfCollectionName = document.getElementById("pdf-collection-name");

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

  importBtn?.addEventListener("click", async () => {
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

    const colName = pdfCollectionName ? pdfCollectionName.value.trim() : "";
    const paramsObj = {
      titles: JSON.stringify(titles),
      actions: JSON.stringify(actions),
      existing_ids: JSON.stringify(existingIds),
    };
    if (colName) paramsObj.collection_name = colName;
    const params = new URLSearchParams(paramsObj);

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
    if (data.collection_id && colName) parts.push(`📁 Added to collection "${escHtml(colName)}"`);
    resultDiv.innerHTML = parts.join(", ") + ".";
    resultDiv.className = "import-result import-success";
    resultDiv.classList.remove("hidden");
    previewArea.classList.add("hidden");
    fileCount.textContent = "";
    _selectedFiles = [];
    _previewData = [];
    fileInput.value = "";
    const _firstCreatedId = data.results?.find(r => r.action === "created")?.tune_id || null;
    _afterImportSuccess(_firstCreatedId);
    importBtn.disabled = false;
    importBtn.textContent = "Import";
  });
})();

// ── PDF Book Import ────────────────────────────────────────────────────────────
(function(){
  const bookFileInput    = document.getElementById("book-file-input");
  if (!bookFileInput) return;
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

  // ── Scan (bookmarks/text first, OCR fallback for scanned books) ──

  bookScanBtn.addEventListener("click", async () => {
    if (!_bookFile) return;
    bookScanBtn.disabled = true;
    bookNextBtn.disabled = true;
    bookScanBtn.textContent = "Scanning…";
    bookResult.classList.add("hidden");

    const fd = () => { const f = new FormData(); f.append("file", _bookFile); return f; };

    const _reset = () => {
      bookScanBtn.disabled = false;
      bookNextBtn.disabled = false;
      bookScanBtn.textContent = "Scan →";
    };

    // Step 1: try bookmarks / embedded ABC text
    let data;
    try {
      data = await apiFetch("/api/import/book/scan", { method: "POST", body: fd() });
    } catch (e) {
      _reset();
      alert(`Scan failed: ${e.message}`);
      return;
    }

    _bookPageCount = data.page_count || 9999;
    if (!bookCollName.value.trim() && data.collection_name) {
      bookCollName.value = data.collection_name;
    }

    if (data.abc_tunes && data.abc_tunes.length > 0) {
      // Embedded ABC found — show ABC preview (Step 3)
      _reset();
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
      return;
    }

    if (data.toc && data.toc.length > 0) {
      // Bookmarks found — show TOC table (Step 2)
      _reset();
      bookTocHeading.textContent = `Table of contents — ${bookCollName.value.trim()}`;
      bookTocBody.innerHTML = "";
      _bookRowCount = 0;
      data.toc.forEach(e => addTocRow(e.title, e.start_page, e.end_page));
      bookScanMsg.textContent = `${data.toc.length} tune${data.toc.length !== 1 ? "s" : ""} detected from PDF bookmarks — review and edit below.`;
      bookScanMsg.style.display = "";
      bookStep1.classList.add("hidden");
      bookStep2.classList.remove("hidden");
      return;
    }

    // Nothing in bookmarks/text — try OCR (for scanned books)
    bookScanBtn.textContent = "Running OCR…";
    let ocrData;
    try {
      ocrData = await apiFetch("/api/import/book/scan-ocr", { method: "POST", body: fd() });
    } catch (e) {
      _reset();
      // OCR unavailable — fall through to manual entry
      bookTocHeading.textContent = `Table of contents — ${bookCollName.value.trim()}`;
      bookTocBody.innerHTML = "";
      _bookRowCount = 0;
      addTocRow();
      bookScanMsg.textContent = `No tunes detected automatically (${_bookPageCount} pages). Enter the table of contents below.`;
      bookScanMsg.style.display = "";
      bookStep1.classList.add("hidden");
      bookStep2.classList.remove("hidden");
      return;
    }

    _reset();
    if (ocrData.toc && ocrData.toc.length > 0) {
      bookTocHeading.textContent = `Tunes detected — ${bookCollName.value.trim()}`;
      bookTocBody.innerHTML = "";
      _bookRowCount = 0;
      ocrData.toc.forEach(e => addTocRow(e.title, e.start_page, e.end_page));
      bookScanMsg.textContent = `${ocrData.toc.length} tune${ocrData.toc.length !== 1 ? "s" : ""} detected — review titles and click Import.`;
      bookScanMsg.style.display = "";
      bookImportBtn.dataset.ocrMode = "true";
      bookStep1.classList.add("hidden");
      bookStep2.classList.remove("hidden");
    } else {
      // OCR also found nothing — manual entry
      bookTocHeading.textContent = `Table of contents — ${bookCollName.value.trim()}`;
      bookTocBody.innerHTML = "";
      _bookRowCount = 0;
      addTocRow();
      bookScanMsg.textContent = `No tunes detected automatically (${_bookPageCount} pages). Enter the table of contents below.`;
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
    if (!_bookFile) { alert("No PDF file selected."); return; }

    bookImportBtn.disabled = true;
    bookImportBtn.textContent = "Importing…";
    bookResult.classList.add("hidden");

    const isOcrMode = bookImportBtn.dataset.ocrMode === "true";
    const fd = new FormData();
    fd.append("file", _bookFile);

    let data;
    try {
      if (isOcrMode) {
        // Send user-edited titles from the TOC table so edits aren't lost
        const entries = getTocEntries();
        const editedTitles = entries.map(e => e.title);
        const params = new URLSearchParams({
          collection_name: bookCollName.value.trim(),
          titles: JSON.stringify(editedTitles),
        });
        data = await apiFetch(`/api/import/book/import-ocr?${params}`, { method: "POST", body: fd });
      } else {
        const entries = getTocEntries();
        if (!entries.length) {
          alert("Add at least one tune to the table of contents.");
          bookImportBtn.disabled = false;
          bookImportBtn.textContent = "Import book";
          return;
        }
        const params = new URLSearchParams({
          collection_name: bookCollName.value.trim(),
          toc: JSON.stringify(entries),
        });
        data = await apiFetch(`/api/import/book?${params}`, { method: "POST", body: fd });
      }
    } catch (e) {
      bookResult.textContent = `Error: ${e.message}`;
      bookResult.className = "import-result import-error";
      bookResult.classList.remove("hidden");
      bookImportBtn.disabled = false;
      bookImportBtn.textContent = "Import book";
      return;
    }

    const created  = (data.results || []).filter(r => r.action === "created").length;
    const attached = (data.results || []).filter(r => r.action === "attached").length;
    const parts = [];
    if (created)  parts.push(`${created} new tune${created  !== 1 ? "s" : ""} created`);
    if (attached) parts.push(`${attached} updated with image`);
    bookResult.textContent = `Done — ${parts.join(", ")}. Added to collection "${data.collection_name}".`;
    bookResult.className = "import-result import-success";
    bookResult.classList.remove("hidden");

    bookImportBtn.dataset.ocrMode = "";
    _resetBookImport();
    _afterImportSuccess();
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
    _afterImportSuccess();
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
    bookImportBtn.dataset.ocrMode = "";
    bookAbcImportBtn.disabled = false;
    bookAbcImportBtn.textContent = "Import tunes";
  }
})();

// ── Photos Import ──────────────────────────────────────────────────────────────
(function(){
  const fileInput   = document.getElementById("photos-file-input");
  if (!fileInput) return;
  const dropZone    = document.getElementById("photos-drop-zone");
  const fileCount   = document.getElementById("photos-file-count");
  const previewArea = document.getElementById("photos-preview-area");
  const collName    = document.getElementById("photos-collection-name");
  const previewBody = document.getElementById("photos-preview-body");
  const importBtn   = document.getElementById("photos-import-btn");
  const ocrBtn      = document.getElementById("photos-ocr-btn");
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

  ocrBtn.addEventListener("click", async () => {
    if (!_photoFiles.length) { alert("Select photos first."); return; }
    ocrBtn.disabled = true;
    ocrBtn.textContent = "Detecting…";
    try {
      const fd = new FormData();
      _photoFiles.forEach(f => fd.append("files", f));
      const data = await apiFetch("/api/import/images/ocr-titles", { method: "POST", body: fd });
      const inputs = previewBody.querySelectorAll(".photos-title-input");
      data.titles.forEach((item, i) => {
        if (item.title && inputs[i]) inputs[i].value = item.title;
      });
      const found = data.titles.filter(t => t.title).length;
      ocrBtn.textContent = found ? `🔍 ${found} title${found === 1 ? "" : "s"} detected` : "🔍 No titles found";
    } catch (e) {
      ocrBtn.textContent = "🔍 OCR failed";
    } finally {
      setTimeout(() => {
        ocrBtn.disabled = false;
        ocrBtn.textContent = "🔍 Detect titles";
      }, 3000);
    }
  });

  importBtn?.addEventListener("click", async () => {
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
    _afterImportSuccess();
  });
})();

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
      _afterImportSuccess();
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
      _afterImportSuccess();
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
      _afterImportSuccess();
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
  const MSCA_RE  = /\.msca$/i;
  if (!document.getElementById("folder-input")) return; // desktop-only
  const ALL_RE   = /\.(abc|txt|mp3|m4a|ogg|wav|pdf|jpg|jpeg|png|msca)$/i;

  const folderInput           = document.getElementById("folder-input");
  const folderSummary         = document.getElementById("folder-summary");
  const folderPreview         = document.getElementById("folder-preview");
  const folderImportBtn       = document.getElementById("folder-import-btn");
  const folderResult          = document.getElementById("folder-result");
  const folderCollectionRow   = document.getElementById("folder-collection-row");
  const folderCollectionName  = document.getElementById("folder-collection-name");

  function categorise(files) {
    const abc = [], audio = [], pdf = [], image = [], msca = [], skipped = [];
    for (const f of files) {
      if (ABC_RE.test(f.name))        abc.push(f);
      else if (AUDIO_RE.test(f.name)) audio.push(f);
      else if (PDF_RE.test(f.name))   pdf.push(f);
      else if (IMAGE_RE.test(f.name)) image.push(f);
      else if (MSCA_RE.test(f.name))  msca.push(f);
      else                            skipped.push(f);
    }
    return { abc, audio, pdf, image, msca, skipped };
  }

  function renderPreview(cats) {
    const rows = [];
    if (cats.abc.length)   rows.push(`<li>🎵 <strong>${cats.abc.length}</strong> ABC tune file${cats.abc.length === 1 ? "" : "s"}</li>`);
    if (cats.audio.length) rows.push(`<li>🎶 <strong>${cats.audio.length}</strong> audio file${cats.audio.length === 1 ? "" : "s"} (MP3/M4A/WAV)</li>`);
    if (cats.pdf.length)   rows.push(`<li>📄 <strong>${cats.pdf.length}</strong> PDF file${cats.pdf.length === 1 ? "" : "s"}</li>`);
    if (cats.image.length) rows.push(`<li>📷 <strong>${cats.image.length}</strong> photo${cats.image.length === 1 ? "" : "s"} (JPG/PNG)</li>`);
    if (cats.msca.length)  rows.push(`<li>📋 <strong>${cats.msca.length}</strong> Music Scanner file${cats.msca.length === 1 ? "" : "s"} (.msca)</li>`);
    if (cats.skipped.length) rows.push(`<li style="color:var(--text-muted)">⏭ ${cats.skipped.length} unsupported file${cats.skipped.length === 1 ? "" : "s"} (ignored)</li>`);

    let html = `<ul class="folder-category-list">${rows.join("")}</ul>`;
    html += `<p class="folder-match-hint">ABC and .msca files create new tunes. Audio, PDF and photo files are matched to tunes by filename — unmatched files create a new tune entry.</p>`;
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
    folderCollectionRow.classList.remove("hidden");
    folderImportBtn.disabled = false;
  });

  folderImportBtn.addEventListener("click", async () => {
    const allFiles = Array.from(folderInput.files).filter(f => ALL_RE.test(f.name));
    if (!allFiles.length) return;

    const mscaFiles  = allFiles.filter(f => MSCA_RE.test(f.name));
    const otherFiles = allFiles.filter(f => !MSCA_RE.test(f.name));

    folderImportBtn.disabled = true;
    folderImportBtn.textContent = "Importing…";
    folderResult.classList.add("hidden");

    const progressWrap  = document.getElementById("folder-progress-wrap");
    const progressBar   = document.getElementById("folder-progress-bar");
    const progressLabel = document.getElementById("folder-progress-label");
    progressWrap.classList.remove("hidden");
    progressBar.style.width = "0%";

    const colName = folderCollectionName ? folderCollectionName.value.trim() : "";
    const lines = [];
    let hasError = false;

    // ── Step 1: non-msca files in one batch ──────────────────────────────────
    if (otherFiles.length) {
      progressLabel.textContent = `Uploading ${otherFiles.length} file${otherFiles.length === 1 ? "" : "s"}…`;
      progressBar.style.width = "10%";
      try {
        const url = colName
          ? `/api/import/folder?collection_name=${encodeURIComponent(colName)}`
          : "/api/import/folder";
        const fd = new FormData();
        otherFiles.forEach(f => fd.append("files", f));
        const res = await fetch(url, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Import failed");
        if (data.abc_imported)   lines.push(`🎵 ${data.abc_imported} tune${data.abc_imported === 1 ? "" : "s"} imported from ABC`);
        if (data.abc_skipped)    lines.push(`⏭ ${data.abc_skipped} ABC tune${data.abc_skipped === 1 ? "" : "s"} skipped (no title)`);
        if (data.audio_attached) lines.push(`🎶 ${data.audio_attached} audio file${data.audio_attached === 1 ? "" : "s"} attached`);
        if (data.pdf_attached)   lines.push(`📄 ${data.pdf_attached} PDF${data.pdf_attached === 1 ? "" : "s"} attached`);
        if (data.image_attached) lines.push(`📷 ${data.image_attached} photo${data.image_attached === 1 ? "" : "s"} attached`);
        if (data.new_from_media) lines.push(`➕ ${data.new_from_media} new tune${data.new_from_media === 1 ? "" : "s"} created from unmatched media`);
        if (data.collection_id)  lines.push(`📁 Added to collection "${escHtml(colName)}"`);
      } catch (err) {
        lines.push(`⚠ Folder batch failed: ${err.message}`);
        hasError = true;
      }
    }

    // ── Step 2: .msca files one at a time ────────────────────────────────────
    if (mscaFiles.length) {
      let mscaImported = 0, mscaSkipped = 0;
      const mscaErrors = [];
      const baseProgress = otherFiles.length ? 20 : 10;

      for (let i = 0; i < mscaFiles.length; i++) {
        const f = mscaFiles[i];
        const pct = baseProgress + Math.round(((i + 1) / mscaFiles.length) * (90 - baseProgress));
        progressBar.style.width = `${pct}%`;
        progressLabel.textContent = `Music Scanner file ${i + 1} of ${mscaFiles.length}: ${f.name}`;
        const fd = new FormData();
        fd.append("file", f);
        try {
          const res = await fetch("/api/import/msca?as_collection=true", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) {
            mscaErrors.push(`${f.name}: ${data.detail || res.statusText}`);
          } else {
            mscaImported += data.imported || 0;
            mscaSkipped  += data.skipped  || 0;
          }
        } catch (err) {
          mscaErrors.push(`${f.name}: ${err.message}`);
        }
      }
      if (mscaImported) lines.push(`📋 ${mscaImported} tune${mscaImported === 1 ? "" : "s"} from Music Scanner`);
      if (mscaSkipped)  lines.push(`⏭ ${mscaSkipped} Music Scanner tune${mscaSkipped === 1 ? "" : "s"} already in library`);
      if (mscaErrors.length) {
        lines.push(`⚠ ${mscaErrors.length} .msca file${mscaErrors.length === 1 ? "" : "s"} failed`);
        hasError = true;
      }
    }

    progressBar.style.width = "100%";
    progressLabel.textContent = "Done ✓";
    setTimeout(() => progressWrap.classList.add("hidden"), 2000);

    folderResult.className = `import-result ${hasError ? "import-error" : "import-success"}`;
    folderResult.innerHTML = lines.length ? lines.join("<br>") : "Nothing new to import.";
    folderResult.classList.remove("hidden");

    folderImportBtn.textContent = "Import All";
    folderImportBtn.disabled = false;
    if (!hasError) { _afterImportSuccess(); } else { await Promise.all([loadStats(), loadFilters()]); loadTunes(); }
  });
})();

// ── YouTube import ────────────────────────────────────────────────────────────
(function(){
  if (!document.getElementById("yt-url-input")) return;
  const ytUrlInput      = document.getElementById("yt-url-input");
  const ytTitleInput    = document.getElementById("yt-title-input");
  const ytParentInput   = document.getElementById("yt-parent-input");
  const ytVersionLabel  = document.getElementById("yt-version-label-input");
  const ytImportBtn     = document.getElementById("yt-import-btn");
  const ytResult        = document.getElementById("yt-import-result");

  ytImportBtn.addEventListener("click", async () => {
    const url = ytUrlInput.value.trim();
    if (!url) { ytResult.textContent = "Please enter a YouTube URL."; ytResult.className = "import-result import-error"; ytResult.classList.remove("hidden"); return; }

    ytImportBtn.disabled = true;
    ytImportBtn.textContent = "Importing…";
    ytResult.classList.add("hidden");

    try {
      const body = { url };
      const title = ytTitleInput.value.trim();
      if (title) body.title = title;
      const parentId = ytParentInput ? parseInt(ytParentInput.value, 10) : NaN;
      if (!isNaN(parentId) && parentId > 0) {
        body.parent_id = parentId;
        const vl = ytVersionLabel ? ytVersionLabel.value.trim() : "";
        if (vl) body.version_label = vl;
      }

      const data = await apiFetch("/api/import/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      ytResult.innerHTML = `✅ Created tune <strong>${escHtml(data.title)}</strong> (ID ${data.tune_id})`;
      ytResult.className = "import-result import-success";
      ytResult.classList.remove("hidden");
      ytUrlInput.value = "";
      ytTitleInput.value = "";
      if (ytParentInput) ytParentInput.value = "";
      if (ytVersionLabel) ytVersionLabel.value = "";
      _afterImportSuccess();
    } catch (err) {
      ytResult.textContent = `Error: ${err.message}`;
      ytResult.className = "import-result import-error";
      ytResult.classList.remove("hidden");
    } finally {
      ytImportBtn.disabled = false;
      ytImportBtn.textContent = "Import YouTube video";
    }
  });
})();

// ── Ceol file (merge) import ───────────────────────────────────────────────
(function(){
  if (!document.getElementById("ceol-file-input")) return;
  const ceolFileInput  = document.getElementById("ceol-file-input");
  const ceolDropZone   = document.getElementById("ceol-drop-zone");
  const ceolImportBtn  = document.getElementById("ceol-import-btn");
  const ceolResult     = document.getElementById("ceol-import-result");
  let ceolPendingFile  = null;

  function _setCeolFile(file) {
    ceolPendingFile = file;
    ceolImportBtn.disabled = !file;
    ceolDropZone.querySelector(".import-drop-label").textContent =
      file ? `Ready: ${file.name}` : "Drop a .ceol.json file here, or click to choose";
    ceolResult.classList.add("hidden");
  }

  ceolDropZone.addEventListener("click", () => ceolFileInput.click());
  ceolFileInput.addEventListener("change", () => _setCeolFile(ceolFileInput.files[0] || null));
  ceolDropZone.addEventListener("dragover", e => { e.preventDefault(); ceolDropZone.classList.add("drag-over"); });
  ceolDropZone.addEventListener("dragleave", () => ceolDropZone.classList.remove("drag-over"));
  ceolDropZone.addEventListener("drop", e => {
    e.preventDefault();
    ceolDropZone.classList.remove("drag-over");
    _setCeolFile(e.dataTransfer.files[0] || null);
  });

  ceolImportBtn.addEventListener("click", async () => {
    if (!ceolPendingFile) return;
    ceolImportBtn.disabled = true;
    ceolImportBtn.textContent = "Merging…";
    ceolResult.classList.add("hidden");
    const formData = new FormData();
    formData.append("file", ceolPendingFile);
    try {
      const res = await fetch("/api/import/ceol", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || res.statusText);
      const parts = [];
      if (data.imported)  parts.push(`${data.imported} tune${data.imported !== 1 ? "s" : ""} added`);
      if (data.skipped)   parts.push(`${data.skipped} already in library`);
      if (data.sets_created) parts.push(`${data.sets_created} set${data.sets_created !== 1 ? "s" : ""} created`);
      if (data.collection_name) parts.push(`collection "${data.collection_name}" ready`);
      ceolResult.textContent = parts.join(" · ") || "Nothing new to import.";
      ceolResult.className = "import-result import-success";
      ceolResult.classList.remove("hidden");
      _setCeolFile(null);
      ceolFileInput.value = "";
      _afterImportSuccess();
    } catch (err) {
      ceolResult.textContent = `Error: ${err.message}`;
      ceolResult.className = "import-result import-error";
      ceolResult.classList.remove("hidden");
    } finally {
      ceolImportBtn.disabled = false;
      ceolImportBtn.textContent = "Merge into library";
    }
  });
})();

// ── Music Scanner (.msca) import ──────────────────────────────────────────────
(function(){
  if (!document.getElementById("msca-file-input")) return;
  const mscaFileInput    = document.getElementById("msca-file-input");
  const mscaBrowseBtn    = document.getElementById("msca-browse-btn");
  const mscaFileLabel    = document.getElementById("msca-file-label");
  const mscaDropZone     = document.getElementById("msca-drop-zone");
  const mscaImportBtn       = document.getElementById("msca-import-btn");
  const mscaDiagnoseBtn     = document.getElementById("msca-diagnose-btn");
  const mscaDiagnoseOcrBtn  = document.getElementById("msca-diagnose-ocr-btn");
  const mscaDiagnoseOut  = document.getElementById("msca-diagnose-result");
  const mscaResult       = document.getElementById("msca-import-result");
  const mscaProgressWrap = document.getElementById("msca-progress-wrap");
  const mscaProgressBar  = document.getElementById("msca-progress-bar");
  const mscaProgressLabel = document.getElementById("msca-progress-label");
  let mscaPendingFiles  = [];

  function _setMscaFiles(files, { clearResult = true } = {}) {
    mscaPendingFiles = Array.from(files || []);
    const n = mscaPendingFiles.length;
    mscaImportBtn.disabled       = n === 0;
    mscaDiagnoseBtn.disabled     = n === 0;
    mscaDiagnoseOcrBtn.disabled  = n === 0;
    mscaDiagnoseOut.style.display = "none";
    mscaFileLabel.textContent = n === 0 ? "No files selected"
      : n === 1 ? mscaPendingFiles[0].name
      : `${n} files selected`;
    if (clearResult) {
      mscaResult.classList.add("hidden");
      mscaProgressWrap.classList.add("hidden");
    }
  }

  // "Choose files…" button opens the hidden file input
  mscaBrowseBtn.addEventListener("click", () => mscaFileInput.click());
  mscaFileInput.addEventListener("change", () => _setMscaFiles(mscaFileInput.files));

  // Drag and drop on the dashed box
  mscaDropZone.addEventListener("dragenter", e => { e.preventDefault(); e.stopPropagation(); mscaDropZone.style.borderColor = "var(--accent)"; mscaDropZone.style.background = "color-mix(in srgb, var(--accent) 8%, var(--surface))"; });
  mscaDropZone.addEventListener("dragover",  e => { e.preventDefault(); e.stopPropagation(); });
  mscaDropZone.addEventListener("dragleave", e => { mscaDropZone.style.borderColor = ""; mscaDropZone.style.background = ""; });
  mscaDropZone.addEventListener("drop", e => {
    e.preventDefault();
    e.stopPropagation();
    mscaDropZone.style.borderColor = "";
    mscaDropZone.style.background = "";
    _setMscaFiles(e.dataTransfer.files);
  });

  mscaDiagnoseBtn.addEventListener("click", async () => {
    if (!mscaPendingFiles.length) return;
    mscaDiagnoseBtn.disabled = true;
    mscaDiagnoseBtn.textContent = "Diagnosing…";
    mscaDiagnoseOut.style.display = "none";
    const file = mscaPendingFiles[0];
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/import/msca/diagnose", { method: "POST", body: fd });
      const data = await res.json();
      let out = `File: ${data.filename}  (${data.size_bytes} bytes)\n`;
      out += `Format: `;
      const d = data.detected;
      if (d.is_sqlite) out += "SQLite database";
      else if (d.is_zip) out += "ZIP archive";
      else if (d.is_xml) out += "XML";
      else if (d.is_json) out += "JSON";
      else if (d.is_plist) out += "Apple plist";
      else out += "unknown binary";
      out += `\nFirst bytes (hex): ${data.start_hex}`;
      if (data.sqlite_tables && data.sqlite_tables.length) {
        out += `\nSQLite tables: ${data.sqlite_tables.join(", ")}`;
        for (const [t, info] of Object.entries(data.sqlite_sample || {})) {
          if (info.cols) out += `\n  ${t}: cols = [${info.cols.join(", ")}]`;
          if (info.rows && info.rows[0]) out += `\n    row[0] = ${JSON.stringify(info.rows[0])}`;
        }
      }
      if (data.zip_contents && data.zip_contents.length) {
        out += `\nZIP contains ${data.zip_contents.length} files:`;
        data.zip_contents.forEach(f => out += `\n  ${f.name}  (${f.size} bytes)`);
        if (data.zip_text_samples && Object.keys(data.zip_text_samples).length) {
          out += `\nNon-image file contents:`;
          for (const [name, text] of Object.entries(data.zip_text_samples)) {
            out += `\n--- ${name} ---\n${text}`;
          }
        }
      }
      mscaDiagnoseOut.textContent = out;
      mscaDiagnoseOut.style.display = "block";
    } catch (err) {
      mscaDiagnoseOut.textContent = `Diagnose error: ${err.message}`;
      mscaDiagnoseOut.style.display = "block";
    } finally {
      mscaDiagnoseBtn.disabled = false;
      mscaDiagnoseBtn.textContent = "Diagnose format";
    }
  });

  mscaDiagnoseOcrBtn.addEventListener("click", async () => {
    if (!mscaPendingFiles.length) return;
    mscaDiagnoseOcrBtn.disabled = true;
    mscaDiagnoseOcrBtn.textContent = "Running OCR…";
    mscaDiagnoseOut.style.display = "none";
    const file = mscaPendingFiles[0];
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/import/msca/diagnose-ocr", { method: "POST", body: fd });
      const data = await res.json();
      let out = `OCR results for: ${file.name} (inspecting first ${data.pages_inspected} pages)\n\n`;
      for (const pg of data.pages) {
        out += `── ${pg.page} (${pg.size || "?"})──\n`;
        if (pg.error) { out += `  ERROR: ${pg.error}\n`; continue; }
        if (!pg.titles.length) {
          out += `  No titles detected\n`;
        } else {
          out += `  Titles found:\n`;
          pg.titles.forEach(t => out += `    y=${t.y}: "${t.text}"\n`);
        }
        out += `  Sections: ${pg.sections.length}\n`;
        pg.sections.forEach(s => out += `    [${s.title || "(continuation)"}]\n`);
        out += "\n";
      }
      mscaDiagnoseOut.textContent = out;
      mscaDiagnoseOut.style.display = "block";
    } catch (err) {
      mscaDiagnoseOut.textContent = `OCR diagnose error: ${err.message}`;
      mscaDiagnoseOut.style.display = "block";
    } finally {
      mscaDiagnoseOcrBtn.disabled = false;
      mscaDiagnoseOcrBtn.textContent = "Diagnose OCR";
    }
  });

  mscaImportBtn.addEventListener("click", async () => {
    if (!mscaPendingFiles.length) return;
    mscaImportBtn.disabled = true;
    mscaResult.classList.add("hidden");
    mscaProgressWrap.classList.remove("hidden");

    const asCol = document.getElementById("msca-as-collection").checked;
    const total = mscaPendingFiles.length;
    let totalImported = 0, totalSkipped = 0;
    const errors = [];
    const collections = [];

    for (let i = 0; i < total; i++) {
      const file = mscaPendingFiles[i];
      const pct = Math.round((i / total) * 100);
      mscaProgressBar.style.width = `${pct}%`;
      mscaProgressLabel.textContent = `Processing ${i + 1} of ${total}: ${file.name}`;

      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(`/api/import/msca?as_collection=${asCol}`, { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          errors.push(`${file.name}: ${data.detail || res.statusText}`);
        } else {
          totalImported += data.imported || 0;
          totalSkipped  += data.skipped  || 0;
          if (data.collection_name) collections.push(data.collection_name);
        }
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    mscaProgressBar.style.width = "100%";
    mscaProgressLabel.textContent = "Done";

    // Build result message
    const parts = [];
    if (totalImported) parts.push(`✅ ${totalImported} tune${totalImported !== 1 ? "s" : ""} added`);
    if (totalSkipped)  parts.push(`⏭ ${totalSkipped} already in library`);
    if (collections.length) parts.push(`📁 ${collections.length} collection${collections.length !== 1 ? "s" : ""} created`);

    let html = parts.length ? parts.join("  ·  ") : "Nothing new to import.";
    if (errors.length) {
      html += `<br><span style="color:var(--danger)">⚠ ${errors.length} file${errors.length !== 1 ? "s" : ""} failed:</span><ul style="margin:.3rem 0 0 1rem;font-size:.8rem">` +
        errors.map(e => `<li>${escHtml(e)}</li>`).join("") + "</ul>";
    }

    mscaResult.className = errors.length && !totalImported ? "import-result import-error" : "import-result import-success";
    mscaResult.innerHTML = html;
    mscaResult.classList.remove("hidden");

    setTimeout(() => mscaProgressWrap.classList.add("hidden"), 2000);

    // Reset file selection without hiding the result box
    _setMscaFiles([], { clearResult: false });
    mscaFileInput.value = "";
    mscaImportBtn.disabled = false;
    mscaImportBtn.textContent = "Import tunes";
    if (totalImported > 0) { _afterImportSuccess(); } else { await Promise.all([loadTunes(), loadStats()]); }
  });
})();

// ── User-managed links ─────────────────────────────────────────────────────────
(function(){
  if (!document.getElementById("user-links-section")) return;
  const userLinksSection = document.getElementById("user-links-section");
  const addLinkBtn       = document.getElementById("add-link-btn");
  const addLinkOverlay   = document.getElementById("add-link-overlay");
  const addLinkClose     = document.getElementById("add-link-close");
  const addLinkCancel    = document.getElementById("add-link-cancel");
  const addLinkSave      = document.getElementById("add-link-save");
  const addLinkLabel     = document.getElementById("add-link-label");
  const addLinkUrl       = document.getElementById("add-link-url");
  const addLinkEmoji     = document.getElementById("add-link-emoji");

  async function _loadUserLinks() {
    const links = await apiFetch("/api/links");
    if (!links || !links.length) {
      userLinksSection.innerHTML = "";
      return;
    }
    userLinksSection.innerHTML = "<hr class=\"library-menu-divider\">" +
      links.map(l =>
        `<span class="library-menu-item user-link-row" style="display:flex;align-items:center;gap:.3rem">` +
        `<a href="${escHtml(l.url)}" target="_blank" rel="noopener" class="library-menu-link" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(l.emoji)} ${escHtml(l.label)}</a>` +
        `<button class="user-link-delete" data-id="${l.id}" title="Remove link" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:0 .2rem;font-size:.9rem">✕</button>` +
        `</span>`
      ).join("");

    userLinksSection.querySelectorAll(".user-link-delete").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        e.preventDefault();
        if (!confirm("Remove this link?")) return;
        await apiFetch(`/api/links/${btn.dataset.id}`, { method: "DELETE" });
        await _loadUserLinks();
      });
    });
  }

  function _openAddLink() {
    addLinkLabel.value = "";
    addLinkUrl.value = "";
    addLinkEmoji.value = "🔗";
    addLinkOverlay.classList.remove("hidden");
    addLinkLabel.focus();
    document.getElementById("nav-links-menu").classList.add("hidden");
  }
  function _closeAddLink() { addLinkOverlay.classList.add("hidden"); }

  addLinkBtn.addEventListener("click", _openAddLink);
  addLinkClose.addEventListener("click", _closeAddLink);
  addLinkCancel.addEventListener("click", _closeAddLink);
  addLinkOverlay.addEventListener("click", e => { if (e.target === addLinkOverlay) _closeAddLink(); });

  addLinkSave.addEventListener("click", async () => {
    const label = addLinkLabel.value.trim();
    const url   = addLinkUrl.value.trim();
    const emoji = addLinkEmoji.value.trim() || "🔗";
    if (!label || !url) { alert("Please fill in both a label and a URL."); return; }
    addLinkSave.disabled = true;
    try {
      await apiFetch("/api/links", { method: "POST", body: JSON.stringify({ label, url, emoji }), headers: { "Content-Type": "application/json" } });
      _closeAddLink();
      await _loadUserLinks();
    } catch (err) {
      alert(`Error saving link: ${err.message}`);
    } finally {
      addLinkSave.disabled = false;
    }
  });

  // Load on startup
  _loadUserLinks();
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
        _insertBuildSetBtn(status, data.tune_id);
        _offerTransfer(data.tune_id, data.title);
        _afterImportSuccess(data.tune_id);
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
        if (!tune.abc && tune.sibling_abc) {
          requestAnimationFrame(() => renderSheetMusicAudioOnly(tune.sibling_abc));
        }
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
    const vidId = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?#/]+)/)?.[1];
    if (!vidId) { window.open(url, "_blank"); return; }
    mediaOverlayContent.innerHTML =
      `<div style="display:flex;flex-direction:column;gap:.5rem;align-items:stretch">
        <iframe class="media-video" src="https://www.youtube-nocookie.com/embed/${escHtml(vidId)}?autoplay=1"
                allow="autoplay; fullscreen" allowfullscreen></iframe>
        <div class="media-speed-row">
          <label class="media-speed-label">Speed</label>
          <input type="range" class="media-speed-slider" id="media-yt-speed"
                 min="25" max="200" step="5" value="100" />
          <span class="media-speed-val" id="media-yt-speed-val">1×</span>
          <a href="${escHtml(url)}" target="_blank" rel="noopener" class="btn-secondary btn-sm" style="margin-left:auto">↗ Open tab</a>
        </div>
        <p class="media-speed-note">Speed slider controls YouTube playback rate via postMessage.</p>
      </div>`;
    // YouTube iframe speed via postMessage (works when iframe is same origin — may be blocked)
    const iframe = mediaOverlayContent.querySelector("iframe");
    const slider = mediaOverlayContent.querySelector("#media-yt-speed");
    const valEl  = mediaOverlayContent.querySelector("#media-yt-speed-val");
    slider.addEventListener("input", () => {
      const rate = Number(slider.value) / 100;
      valEl.textContent = `${rate.toFixed(2).replace(/\.?0+$/, "")}×`;
      try {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: "command", func: "setPlaybackRate", args: [rate] }), "*"
        );
      } catch {}
    });
  } else {
    mediaOverlayContent.innerHTML = `
      <div class="media-audio-wrap">
        <audio controls autoplay class="media-audio" id="media-audio-el" src="${escHtml(url)}"></audio>
        <div class="media-speed-row">
          <label class="media-speed-label">Speed</label>
          <input type="range" class="media-speed-slider" id="media-speed-slider"
                 min="25" max="200" step="5" value="100" />
          <span class="media-speed-val" id="media-speed-val">1×</span>
        </div>
        <div class="media-loop-row">
          <label class="media-speed-label">Loop section</label>
          <input type="number" id="media-loop-start" class="media-loop-input" min="0" step="1" placeholder="start s" />
          <span class="media-speed-label">→</span>
          <input type="number" id="media-loop-end" class="media-loop-input" min="0" step="1" placeholder="end s" />
          <button id="media-loop-btn" class="btn-secondary btn-sm">Loop off</button>
          <button id="media-cue-btn" class="btn-secondary btn-sm">Set from position</button>
        </div>
      </div>`;
    const audio   = document.getElementById("media-audio-el");
    const slider  = document.getElementById("media-speed-slider");
    const valEl   = document.getElementById("media-speed-val");
    const loopBtn = document.getElementById("media-loop-btn");
    const cueBtn  = document.getElementById("media-cue-btn");
    const startIn = document.getElementById("media-loop-start");
    const endIn   = document.getElementById("media-loop-end");
    let loopActive = false;
    let loopTimer  = null;

    // Speed control with pitch preservation
    slider.addEventListener("input", () => {
      const rate = Number(slider.value) / 100;
      valEl.textContent = `${rate.toFixed(2).replace(/\.?0+$/, "")}×`;
      audio.playbackRate = rate;
      if ("preservesPitch" in audio) audio.preservesPitch = true;
      else if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = true;
      else if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
    });

    // Section loop
    function _startLoop() {
      loopActive = true;
      loopBtn.textContent = "Loop on";
      loopBtn.classList.add("active");
      function _check() {
        if (!loopActive) return;
        const end = parseFloat(endIn.value);
        if (!isNaN(end) && audio.currentTime >= end) {
          const start = parseFloat(startIn.value) || 0;
          audio.currentTime = start;
        }
        loopTimer = requestAnimationFrame(_check);
      }
      const start = parseFloat(startIn.value) || 0;
      audio.currentTime = start;
      if (audio.paused) audio.play().catch(() => {});
      _check();
    }

    function _stopLoop() {
      loopActive = false;
      loopBtn.textContent = "Loop off";
      loopBtn.classList.remove("active");
      if (loopTimer) { cancelAnimationFrame(loopTimer); loopTimer = null; }
    }

    loopBtn.addEventListener("click", () => {
      if (loopActive) _stopLoop();
      else if (!isNaN(parseFloat(startIn.value)) && !isNaN(parseFloat(endIn.value))) _startLoop();
      else loopBtn.textContent = "Set start/end first";
    });

    cueBtn.addEventListener("click", () => {
      const t = Math.floor(audio.currentTime);
      if (!startIn.value || parseFloat(startIn.value) >= t) {
        startIn.value = t;
      } else {
        endIn.value = t;
      }
    });

    [startIn, endIn].forEach(inp => inp.addEventListener("change", () => {
      if (loopActive) _startLoop(); // restart loop with new bounds
    }));
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

// ── Practice Targets ─────────────────────────────────────────────────────────
const STAR_LABELS = ["Unrated", "Just starting", "Getting there", "Almost there", "Know it well", "Nailed it!"];

function _starsHtml(n, max = 5) {
  return Array.from({ length: max }, (_, i) => `<span class="pt-star${i < n ? " pt-star-filled" : ""}">${i < n ? "★" : "☆"}</span>`).join("");
}

async function runPracticeTargets() {
  const resultsEl = document.getElementById("practice-results");
  const setStars  = parseInt(document.getElementById("practice-set-stars")?.value)  || 3;
  const tuneStars = parseInt(document.getElementById("practice-tune-stars")?.value) || 3;
  resultsEl.innerHTML = '<p class="loading">Analysing…</p>';

  let data;
  try {
    data = await apiFetch(`/api/analysis/practice-targets?set_stars=${setStars}&tune_stars=${tuneStars}`);
  } catch (e) {
    resultsEl.innerHTML = '<p class="error-hint">Analysis failed. Please try again.</p>';
    return;
  }

  const { priority_tunes, target_sets } = data;

  if (!priority_tunes.length && !target_sets.length) {
    resultsEl.innerHTML = `<p class="practice-hint">
      No target sets found. Either all your rated sets already meet the ${setStars}-star threshold,
      or you haven't rated any sets yet. Try lowering the set star target, or rate your sets first.
    </p>`;
    return;
  }

  // ── Priority tunes section ──────────────────────────────────────────────────
  let html = `<h3 class="practice-section-title">Priority tunes <span class="practice-count">${priority_tunes.length}</span></h3>
  <p class="practice-hint">These tunes have the biggest impact on unlocking ${setStars}-star sets. Sole-bottleneck tunes (orange border) will unlock a complete set on their own.</p>
  <div class="pt-tune-list">`;

  for (const tune of priority_tunes) {
    const isSoleBn = tune.sole_bottleneck_sets > 0;
    const setNames = tune.target_sets.map(s =>
      `<span class="pt-set-tag${s.bottleneck_count === 1 ? " pt-set-sole" : ""}" title="${escHtml(s.name)} (set rating: ${s.set_rating}★)">${escHtml(s.name)}</span>`
    ).join(" ");

    html += `
    <div class="pt-tune-row${isSoleBn ? " pt-sole-bottleneck" : ""}" data-tune-id="${tune.id}">
      <div class="pt-tune-main">
        <button class="pt-tune-title-btn btn-link" data-tune-id="${tune.id}">${escHtml(tune.title)}</button>
        <span class="pt-tune-rating">${_starsHtml(tune.rating)}</span>
        <span class="pt-score-badge" title="Priority score: higher = more impactful">Score: ${tune.score}</span>
        ${isSoleBn ? `<span class="pt-unlock-badge" title="Improving this tune alone will unlock ${tune.sole_bottleneck_sets} set(s)">🔓 Unlocks ${tune.sole_bottleneck_sets} set${tune.sole_bottleneck_sets > 1 ? "s" : ""}</span>` : ""}
      </div>
      <div class="pt-tune-sets">in: ${setNames}</div>
    </div>`;
  }
  html += `</div>`;

  // ── Target sets section ─────────────────────────────────────────────────────
  html += `<details class="pt-details" style="margin-top:1.25rem">
  <summary class="pt-details-summary">Target sets <span class="practice-count">${target_sets.length}</span></summary>
  <div class="pt-set-list">`;

  for (const s of target_sets) {
    const bottlenecks = s.tunes.filter(t => t.rating < tuneStars);
    const others      = s.tunes.filter(t => t.rating >= tuneStars);
    html += `
    <div class="pt-set-row">
      <div class="pt-set-header">
        <span class="pt-set-name">${escHtml(s.name)}</span>
        <span class="pt-tune-rating">${_starsHtml(s.rating)}</span>
        <span class="pt-bottleneck-count">${s.bottleneck_count} tune${s.bottleneck_count !== 1 ? "s" : ""} to improve</span>
      </div>
      <div class="pt-set-tunes">
        ${bottlenecks.map(t => `<span class="pt-set-tune pt-set-tune-gap" data-tune-id="${t.id}">${escHtml(t.title)} ${_starsHtml(t.rating)}</span>`).join("")}
        ${others.map(t => `<span class="pt-set-tune pt-set-tune-ok" data-tune-id="${t.id}">${escHtml(t.title)} ${_starsHtml(t.rating)}</span>`).join("")}
      </div>
    </div>`;
  }
  html += `</div></details>`;

  resultsEl.innerHTML = html;

  // Wire up tune title clicks → open tune modal
  resultsEl.querySelectorAll("[data-tune-id]").forEach(el => {
    el.addEventListener("click", async () => {
      const id = el.dataset.tuneId;
      try {
        const tune = await fetchTune(id);
        renderModal(tune);
        requestAnimationFrame(() => { if (tune.abc) renderSheetMusic(tune.abc); });
      } catch {}
    });
  });
}

// Wire up analyse button (run once on first view)
document.addEventListener("DOMContentLoaded", () => {
  const runBtn = document.getElementById("practice-run-btn");
  if (runBtn) runBtn.addEventListener("click", runPracticeTargets);
});

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

autoGroupBtn?.addEventListener("click", async () => {
  libraryMenu.classList.add("hidden");
  const { grouped } = await apiFetch("/api/tunes/auto-group", { method: "POST" });
  if (grouped === 0) {
    alert("No duplicate tune names found — nothing to group.");
  } else {
    alert(`Grouped ${grouped} set${grouped !== 1 ? "s" : ""} of duplicate tunes.`);
    await Promise.all([loadStats(), loadFilters(), loadTunes()]);
  }
});

document.getElementById("dedup-versions-btn")?.addEventListener("click", async () => {
  libraryMenu.classList.add("hidden");
  const { removed } = await apiFetch("/api/tunes/dedup-versions", { method: "POST" });
  if (removed === 0) {
    alert("No empty or duplicate versions found — nothing to remove.");
  } else {
    alert(`Removed ${removed} duplicate or empty version${removed !== 1 ? "s" : ""}.`);
    await Promise.all([loadStats(), loadFilters(), loadTunes()]);
  }
});

document.getElementById("strip-track-numbers-btn")?.addEventListener("click", async () => {
  libraryMenu.classList.add("hidden");
  const { updated } = await apiFetch("/api/tunes/strip-track-numbers", { method: "POST" });
  if (updated === 0) {
    alert("No track numbers found — all titles are already clean.");
  } else {
    alert(`Stripped track numbers from ${updated} tune title${updated !== 1 ? "s" : ""}.`);
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

backupSaveBtn.addEventListener("click", () => {
  const name = backupFilename.value.trim() || `ceol-backup-${_todayISO()}.zip`;
  const safe = name.endsWith(".zip") ? name : name + ".zip";
  const url = `/api/library/export?filename=${encodeURIComponent(safe)}`;
  _closeBackup();
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

// ── Merge Library dialog ──────────────────────────────────────────────────────
const libMergeOverlay  = document.getElementById("lib-merge-overlay");
const libMergeClose    = document.getElementById("lib-merge-close");
const libMergeFile     = document.getElementById("lib-merge-file");
const libMergeFilename = document.getElementById("lib-merge-filename");
const libMergeSubmit   = document.getElementById("lib-merge-submit");
const libMergeCancel   = document.getElementById("lib-merge-cancel");
const libMergeResult   = document.getElementById("lib-merge-result");
const libraryMergeBtn  = document.getElementById("library-merge-btn");

function _closeLibMerge() {
  libMergeOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}
libraryMergeBtn?.addEventListener("click", () => {
  libraryMenu.classList.add("hidden");
  libMergeFile.value = "";
  libMergeFilename.textContent = "";
  libMergeSubmit.disabled = true;
  libMergeResult.classList.add("hidden");
  libMergeOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});
libMergeClose?.addEventListener("click", _closeLibMerge);
libMergeCancel?.addEventListener("click", _closeLibMerge);

libMergeFile?.addEventListener("change", () => {
  const f = libMergeFile.files[0];
  libMergeFilename.textContent = f ? f.name : "";
  libMergeSubmit.disabled = !f;
});

libMergeSubmit?.addEventListener("click", async () => {
  const f = libMergeFile.files[0];
  if (!f) return;
  libMergeSubmit.disabled = true;
  libMergeSubmit.textContent = "Merging…";
  libMergeResult.classList.add("hidden");
  const form = new FormData();
  form.append("file", f);
  try {
    const res = await fetch("/api/library/merge", { method: "POST", body: form });
    if (!res.ok) { let d="Merge failed"; try { const e=await res.json(); d=e.detail||d; } catch { d=await res.text()||d; } throw new Error(d); }
    const data = await res.json();
    const s = data.stats;
    libMergeResult.innerHTML =
      `✓ Merge complete — ` +
      `${s.tunes_added} tune${s.tunes_added !== 1 ? "s" : ""} added, ` +
      `${s.tunes_versioned} versioned, ` +
      `${s.tunes_merged} merged (same ABC), ` +
      `${s.sets_added} set${s.sets_added !== 1 ? "s" : ""} added, ` +
      `${s.sets_skipped} identical set${s.sets_skipped !== 1 ? "s" : ""} skipped, ` +
      `${s.collections_added} collection${s.collections_added !== 1 ? "s" : ""} created, ` +
      `${s.collections_merged} merged. Reloading…`;
    libMergeResult.className = "import-result import-ok";
    libMergeResult.classList.remove("hidden");
    setTimeout(() => { _closeLibMerge(); location.reload(); }, 3500);
  } catch (err) {
    libMergeResult.textContent = `Error: ${err.message}`;
    libMergeResult.className = "import-result import-error";
    libMergeResult.classList.remove("hidden");
    libMergeSubmit.disabled = false;
    libMergeSubmit.textContent = "Merge";
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

// ? button in header also opens help
document.getElementById("info-btn").addEventListener("click", _openHelp);

// "Open App Info" button inside the help modal opens the info modal
helpOverlay.addEventListener("click", e => {
  if (e.target.id === "help-open-info-btn") {
    _closeHelp();
    _openInfoModal();
  }
});

// ── Info modal ───────────────────────────────────────────────────────────────
async function _openInfoModal() {
  const info = await fetch("/api/info").then(r => r.json());
  const bak1 = info.backup1 ? `<code>${info.backup1}</code>` : "<em>none yet</em>";
  const bak2 = info.backup2 ? `<code>${info.backup2}</code>` : "<em>none yet</em>";
  const mobileRow = info.mobile_url ? `
    <tr>
      <th>Open on phone / tablet</th>
      <td>
        <a href="${escHtml(info.mobile_url)}" target="_blank" rel="noopener" class="info-mobile-link">📱 ${escHtml(info.mobile_url)}</a>
        <br><span class="modal-hint" style="font-size:.8rem">Type this URL into your phone's browser while on the same Wi-Fi network</span>
      </td>
    </tr>
    <tr>
      <th>Desktop URL (on network)</th>
      <td><a href="${escHtml(info.desktop_url)}" target="_blank" rel="noopener" class="info-mobile-link">${escHtml(info.desktop_url)}</a></td>
    </tr>` : "";
  const cap = state.capabilities;
  const aiStatus = cap.has_anthropic_key ? "✅ Active" : "⚠️ No API key — set ANTHROPIC_API_KEY";

  modalContent.innerHTML = `
    <h2 class="modal-title">App Info</h2>
    <table class="info-table">
      ${mobileRow}
      <tr><th>App directory</th><td><code>${info.app_dir}</code></td></tr>
      <tr><th>Database</th><td><code>${info.database}</code></td></tr>
      <tr><th>Backup 1 (most recent)</th><td>${bak1}</td></tr>
      <tr><th>Backup 2 (older)</th><td>${bak2}</td></tr>
      <tr><th>Uploads</th><td><code>${info.uploads}</code></td></tr>
      <tr><th>Info file</th><td><code>${info.info_file}</code></td></tr>
    </table>
    <hr class="modal-divider">
    <h3 class="modal-section-title">iCloud / Dropbox sync</h3>
    <p class="modal-hint">To store your library in iCloud Drive or Dropbox, add <code>CEOL_DATA_DIR</code> to <code>.env</code> in the Ceol folder and restart:</p>
    <table class="info-table">
      <tr><th>iCloud Drive</th><td><code>~/Library/Mobile Documents/com~apple~CloudDocs/Ceol</code></td></tr>
      <tr><th>Dropbox</th><td><code>~/Dropbox/Ceol</code></td></tr>
    </table>
    <p class="modal-hint">To move an existing library: copy <code>data/ceol.db</code> and <code>data/uploads/</code> into the new folder first, then set <code>CEOL_DATA_DIR</code>. Don't run two Ceol instances on the same folder at the same time.</p>
    <hr class="modal-divider">
    <h3 class="modal-section-title">Transcription capabilities</h3>
    <table class="info-table">
      <tr><th>AI (Claude Opus)</th><td>${aiStatus}</td></tr>
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
}

// ── Practice tab (Phrase Builder + Tempo Progression) ────────────────────────
let _pracSynthCtrl   = null;
let _pracVisualObj   = null;
let _pracLoopCount   = 0;
let _pracCurWarp     = 60;
let _pracSettings    = {};
let _pracCurrentAbc  = null;   // last-built practice ABC (for fullscreen)

function _stopPracticeAudio() {
  if (_pracSynthCtrl) { try { _pracSynthCtrl.stop(); } catch {} _pracSynthCtrl = null; }
  // Close and null the shared ABCJS AudioContext so all scheduled nodes are destroyed.
  // ABCJS will create a fresh context next time audio is needed.
  try {
    if (window.abcjsAudioContext) {
      window.abcjsAudioContext.close();
      window.abcjsAudioContext = null;
    }
  } catch {}
}

function _extractBpm(abc) {
  if (!abc) return null;
  // Handles: Q:120  |  Q:1/4=120  |  Q:"Slowly" 1/4=60
  const m = abc.match(/^Q:\s*(?:[^=\n]+=\s*)?(\d+)/m);
  return m ? parseInt(m[1]) : null;
}

function _computeBarRestAbc(meterStr, lenStr) {
  const mp = (meterStr || "4/4").split("/");
  const lp = (lenStr   || "1/8").split("/");
  const mNum = parseInt(mp[0]) || 4,  mDen = parseInt(mp[1]) || 4;
  const lNum = parseInt(lp[0]) || 1,  lDen = parseInt(lp[1]) || 8;
  const units = Math.round((mNum * lDen) / (mDen * lNum));
  return units === 1 ? "z" : `z${units}`;
}

function _buildPracticeAbc(abc, phraseLen, restBars, fromBar, toBar) {
  if (!abc) return null;
  if (/^V:/m.test(abc)) return null;   // multi-voice tunes not supported

  const getField = f => {
    const m = abc.match(new RegExp(`^${f}:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : null;
  };

  const rawBars = extractBars(abc);
  if (!rawBars.length) return null;

  // Strip quoted chord annotations ("Am", "D7", etc.)
  let cleanBars = rawBars
    .map(b => b.replace(/"[^"]*"/g, "").trim())
    .filter(b => b.length > 0);

  // Apply bar-range selection (1-based, inclusive)
  const lo = Math.max(1, fromBar || 1) - 1;
  const hi = toBar ? Math.min(cleanBars.length, toBar) : cleanBars.length;
  cleanBars = cleanBars.slice(lo, hi);
  if (!cleanBars.length) return null;

  const T = getField("T") || "Practice";
  const M = getField("M") || "4/4";
  const L = getField("L") || "1/8";
  const Q = getField("Q");
  const K = getField("K") || "C";
  const restToken = _computeBarRestAbc(M, L);

  const bodyLines = [];
  for (let i = 0; i < cleanBars.length; i += phraseLen) {
    const phrase = cleanBars.slice(i, i + phraseLen);
    let line = "|" + phrase.join("|") + "|";
    if (restBars > 0) line += Array(restBars).fill(restToken).join("|") + "|";
    bodyLines.push(line);
  }

  const rangeLabel = (fromBar || toBar)
    ? ` (bars ${lo + 1}–${lo + cleanBars.length})`
    : "";
  let out = `X:1\nT:${T} – Practice${rangeLabel}\nM:${M}\nL:${L}\n`;
  if (Q) out += `Q:${Q}\n`;
  out += `K:${K}\n` + bodyLines.join("\n");
  return out;
}

// Colors for successive phrases; rest bars get a muted grey
const _PRAC_PHRASE_COLORS = ["#2563eb", "#059669", "#9333ea", "#b45309", "#0891b2"];
const _PRAC_REST_COLOR    = "#94a3b8";

function _pracColorPhraseBars(phraseLen, restBars) {
  const container = document.getElementById("prac-sheet-render");
  if (!container) return;
  const cycleLen = phraseLen + (restBars || 0);
  container.querySelectorAll(".abcjs-note, .abcjs-rest").forEach(noteEl => {
    let measureIdx = null;
    let el = noteEl;
    while (el && el !== container) {
      for (const cls of el.classList) {
        const hit = cls.match(/^abcjs-m(\d+)$/);
        if (hit) { measureIdx = parseInt(hit[1]); break; }
      }
      if (measureIdx !== null) break;
      el = el.parentElement;
    }
    if (measureIdx === null) return;
    const cyclePos  = measureIdx % cycleLen;
    const phraseIdx = Math.floor(measureIdx / cycleLen);
    const isRest    = cyclePos >= phraseLen;
    const color     = isRest
      ? _PRAC_REST_COLOR
      : _PRAC_PHRASE_COLORS[phraseIdx % _PRAC_PHRASE_COLORS.length];
    noteEl.querySelectorAll("path, polygon, ellipse, rect").forEach(svg => {
      svg.style.fill   = color;
      svg.style.stroke = color;
    });
  });
}

function _pracUpdatePhraseIndicator(measureIdx) {
  const el = document.getElementById("prac-phrase-indicator");
  if (!el || measureIdx === null) return;
  const { phraseLen = 2, restBars = 2 } = _pracSettings;
  const cycleLen  = phraseLen + restBars;
  const cyclePos  = measureIdx % cycleLen;
  const phraseIdx = Math.floor(measureIdx / cycleLen);
  const isRest    = cyclePos >= phraseLen;
  const color     = isRest
    ? _PRAC_REST_COLOR
    : _PRAC_PHRASE_COLORS[phraseIdx % _PRAC_PHRASE_COLORS.length];
  el.classList.remove("hidden");
  el.style.borderColor = color;
  el.style.color       = color;
  el.textContent = isRest
    ? `Phrase ${phraseIdx + 1} — rest (play it back!)`
    : `Phrase ${phraseIdx + 1}`;
}

function _pracMeasureFromEvent(ev) {
  if (!ev?.elements) return null;
  for (const grp of ev.elements) {
    if (!grp) continue;
    for (const el of grp) {
      let target = el;
      while (target) {
        for (const cls of target.classList ?? []) {
          const hit = cls.match(/^abcjs-m(\d+)$/);
          if (hit) return parseInt(hit[1]);
        }
        target = target.parentElement;
      }
    }
  }
  return null;
}

function _updatePracTempoDisplay() {
  const el = document.getElementById("prac-tempo-display");
  if (!el) return;
  el.classList.remove("hidden");
  const bpm = _pracSettings.baseBpm
    ? Math.round(_pracSettings.baseBpm * _pracCurWarp / 100)
    : null;
  const atFinal = _pracCurWarp >= _pracSettings.final;
  const loopStr = `Loop ${_pracLoopCount + 1}`;
  el.textContent = bpm
    ? `${loopStr} — ${_pracCurWarp}% = ${bpm} BPM${atFinal ? " ✓ full speed" : ""}`
    : `${loopStr} — ${_pracCurWarp}%${atFinal ? " ✓ full speed" : ""}`;
}

function _renderPracticeMusic(pracAbc) {
  const container = document.getElementById("prac-sheet-render");
  if (!container || typeof ABCJS === "undefined") return;

  _pracCurrentAbc = pracAbc;
  _stopPracticeAudio();
  _pracLoopCount = 0;
  const phraseIndicator = document.getElementById("prac-phrase-indicator");
  if (phraseIndicator) phraseIndicator.classList.add("hidden");

  // Show fullscreen button now that we have built ABC
  const fsBtnEl = document.getElementById("prac-fs-btn");
  if (fsBtnEl) fsBtnEl.classList.remove("hidden");

  try {
    const processed = expandAbcRepeats(pracAbc);
    const visualObjs = ABCJS.renderAbc("prac-sheet-render", processed, {
      responsive: "resize",
      wrap: { preferredMeasuresPerLine: 4 },
      add_classes: true,
      paddingbottom: 10, paddingleft: 15, paddingright: 15, paddingtop: 10,
      foregroundColor: "#000000",
    });
    _patchSvgViewBox("prac-sheet-render");
    _pracVisualObj = visualObjs[0];

    // Color notes by phrase group after render
    const { phraseLen = 2, restBars = 2 } = _pracSettings;
    requestAnimationFrame(() => _pracColorPhraseBars(phraseLen, restBars));

    if (!ABCJS.synth || !ABCJS.synth.supportsAudio()) return;

    const cursorControl = {
      onStart() {},
      onEvent(ev) {
        document.querySelectorAll("#prac-sheet-render .abcjs-highlight")
          .forEach(el => el.classList.remove("abcjs-highlight"));
        if (ev?.elements) ev.elements.forEach(g => g?.forEach(el => el.classList.add("abcjs-highlight")));
        _pracUpdatePhraseIndicator(_pracMeasureFromEvent(ev));
      },
      onFinished() {
        document.querySelectorAll("#prac-sheet-render .abcjs-highlight")
          .forEach(el => el.classList.remove("abcjs-highlight"));
        _pracLoopCount++;
        // Tempo step: increment warp after N loops, up to final %
        const { final: finalWarp, inc, loopsPerStep } = _pracSettings;
        if (_pracCurWarp < finalWarp && _pracLoopCount % loopsPerStep === 0) {
          _pracCurWarp = Math.min(finalWarp, _pracCurWarp + inc);
          if (_pracSynthCtrl) _pracSynthCtrl.setWarp(_pracCurWarp);
        }
        _updatePracTempoDisplay();
        // Loop: restart from top
        if (_pracSynthCtrl) { try { _pracSynthCtrl.play(); } catch {} }
      },
    };

    _pracSynthCtrl = new ABCJS.synth.SynthController();
    _pracSynthCtrl.load("#prac-player-container", cursorControl, {
      displayLoop: false,
      displayRestart: true,
      displayPlay: true,
      displayProgress: true,
      displayWarp: true,
    });
    _pracSynthCtrl.setTune(_pracVisualObj, false, { program: _melodyProgram, chordsOff: _chordsOff })
      .then(() => {
        _pracSynthCtrl.setWarp(_pracCurWarp);
        try { _pracSynthCtrl.pause(); } catch {}  // prevent auto-start
      })
      .catch(err => { console.warn("Practice audio init failed:", err); });
  } catch (err) {
    console.warn("Practice render failed:", err);
  }
}

function _initPracticeTab(tune) {
  if (!tune.abc) return;

  const baseBpm = _extractBpm(tune.abc);

  const updateBpmHints = () => {
    const startPct = parseInt(document.getElementById("prac-tempo-start")?.value) || 60;
    const finalPct = parseInt(document.getElementById("prac-tempo-final")?.value) || 100;
    const elS = document.getElementById("prac-bpm-start");
    const elF = document.getElementById("prac-bpm-final");
    if (elS) elS.textContent = baseBpm ? `= ${Math.round(baseBpm * startPct / 100)} BPM` : "";
    if (elF) elF.textContent = baseBpm ? `= ${Math.round(baseBpm * finalPct / 100)} BPM` : "";
  };
  document.getElementById("prac-tempo-start")?.addEventListener("input", updateBpmHints);
  document.getElementById("prac-tempo-final")?.addEventListener("input", updateBpmHints);
  updateBpmHints();

  // Show total bar count as a hint on the To-bar input
  const totalBars = extractBars(tune.abc).filter(b => b.replace(/"[^"]*"/g, "").trim()).length;
  const toBarEl = document.getElementById("prac-to-bar");
  if (toBarEl) toBarEl.max = totalBars;
  const fromBarEl = document.getElementById("prac-from-bar");
  if (fromBarEl) fromBarEl.max = totalBars;
  const toBarHint = document.querySelector(".prac-bar-count-hint");
  if (toBarHint) toBarHint.textContent = `(tune has ${totalBars} bars)`;

  document.getElementById("prac-build-btn")?.addEventListener("click", () => {
    const fromBar      = parseInt(document.getElementById("prac-from-bar")?.value)         || 1;
    const toBarVal     = document.getElementById("prac-to-bar")?.value;
    const toBar        = toBarVal ? parseInt(toBarVal) : null;
    const phraseLen    = Math.max(1, parseInt(document.getElementById("prac-phrase-len")?.value)   || 2);
    const restBars     = Math.max(0, parseInt(document.getElementById("prac-rest-bars")?.value)    || 2);
    const startPct     = Math.max(10, parseInt(document.getElementById("prac-tempo-start")?.value) || 60);
    const finalPct     = Math.max(10, parseInt(document.getElementById("prac-tempo-final")?.value) || 100);
    const incPct       = Math.max(1, parseInt(document.getElementById("prac-tempo-inc")?.value)    || 5);
    const loopsPerStep = Math.max(1, parseInt(document.getElementById("prac-tempo-loops")?.value)  || 2);
    const status       = document.getElementById("prac-status");

    const pracAbc = _buildPracticeAbc(tune.abc, phraseLen, restBars, fromBar, toBar);
    if (!pracAbc) {
      if (status) { status.textContent = "Cannot build — multi-voice tunes are not supported."; status.className = "notes-status notes-error"; }
      return;
    }
    if (status) status.textContent = "";

    _pracCurWarp   = startPct;
    _pracLoopCount = 0;
    _pracSettings  = { start: startPct, final: finalPct, inc: incPct, loopsPerStep, baseBpm, phraseLen, restBars };

    _renderPracticeMusic(pracAbc);
    _updatePracTempoDisplay();
  });

  // Fullscreen button (hidden until ABC is built)
  document.getElementById("prac-fs-btn")?.addEventListener("click", () => {
    if (!_pracCurrentAbc) return;
    if (_pracSynthCtrl) { try { _pracSynthCtrl.pause(); } catch {} }
    openAbcFullscreen(_pracCurrentAbc, (tune.title || "Practice") + " – Practice", {
      initialWarp: _pracCurWarp || 60,
      pracSettings: _pracSettings,
    });
  });
}

// ── Stop all audio when tab/window closes ─────────────────────────────────────
function _stopAllAudio() {
  if (_synthController) { try { _synthController.pause();  } catch {} }
  if (_setMusicSynth)   { try { _setMusicSynth.pause();    } catch {} }
  if (_abcFsSynthCtrl)  { try { _abcFsSynthCtrl.pause();   } catch {} }
  if (_pracSynthCtrl)   { try { _pracSynthCtrl.pause();    } catch {} }
  _stopMetronome();
  document.querySelectorAll("audio, video").forEach(el => { try { el.pause(); } catch {} });
  try { closeMediaOverlay(); } catch {}
}
// Only stop on actual page unload — not on every tab switch.
// visibilitychange was too aggressive: it fired during file-picker / import dialogs
// and killed the AudioContext, making audio silent until browser restart.
window.addEventListener("beforeunload", _stopAllAudio);

// ── Audio context recovery (Safari) ───────────────────────────────────────────
// Safari suspends / "interrupts" AudioContext after async operations (import,
// file pickers, etc.).  A suspended context may return state "suspended" or
// "interrupted" and resume() sometimes silently fails.  We recreate the context
// if resume() doesn't restore it to "running" within 300 ms.
function _tryResumeAudioContext(ctx) {
  if (!ctx || ctx.state === "running") return;
  if (ctx.state === "closed") return; // can't resume a closed context
  ctx.resume().then(() => {}).catch(() => {});
}

function _recoverAudioContexts() {
  // ABCJS context
  try {
    const ctx = ABCJS.synth.activeAudioContext?.();
    if (ctx) _tryResumeAudioContext(ctx);
  } catch {}

  // Metronome context — if interrupted and can't be resumed, recreate it
  if (_metCtx && _metCtx.state !== "running" && _metCtx.state !== "closed") {
    _metCtx.resume().catch(() => {});
    // If still not running after a short delay, recreate
    setTimeout(() => {
      if (_metCtx && _metCtx.state !== "running") {
        const wasPlaying = _metPlaying;
        _stopMetronome();
        try { _metCtx.close(); } catch {}
        _metCtx = null;
        if (wasPlaying) _startMetronome();
      }
    }, 300);
  }
}

// Fire recovery on every user interaction so audio resumes as soon as the user
// next touches the page after an interruption.
document.addEventListener("click",      _recoverAudioContexts, { passive: true, capture: true });
document.addEventListener("touchstart", _recoverAudioContexts, { passive: true, capture: true });

// ── Init ──────────────────────────────────────────────────────────────────────
_applyNavColour("library");  // set Library button solid on first paint
(async () => {
  await Promise.allSettled([loadFilters(), loadStats(), fetchSets(), fetchCollections(), loadCapabilities()]);
  switchView("library");
  loadTunes();
  _refreshTodoBadge();  // populate badge without waiting for first library load
})();

// ── Collection Export ─────────────────────────────────────────────────────────

let _exportCollectionId = null;

function openCollectionExportModal(id, name) {
  _exportCollectionId = id;
  const safeName = escHtml(name || "");
  modalContent.innerHTML =
    "<h2 style='margin:0 0 0.5rem'>Export Collection</h2>" +
    "<p style='font-weight:600;margin:0 0 1rem;color:var(--accent)'>" + safeName + "</p>" +
    "<p style='margin:0 0 1.25rem;color:var(--text-secondary);font-size:0.9rem'>Personal data (ratings, hitlist, notes) is not included.</p>" +
    "<div style='display:flex;flex-direction:column;gap:0.75rem'>" +
    "<button id='_exp-ceol-btn' class='btn-primary'>&#11015; Ceòl JSON (.ceol.json)</button>" +
    "<button id='_exp-thecraic-btn' class='btn-secondary'>&#11015; TheCraic ABC (.abc)</button>" +
    "<button id='_exp-pdf-btn' class='btn-secondary'>&#9113; Print / PDF (ABC text)</button>" +
    "</div>";
  document.getElementById("_exp-ceol-btn").addEventListener("click", function() { doExportCollection("ceol"); });
  document.getElementById("_exp-thecraic-btn").addEventListener("click", function() { doExportCollection("thecraic"); });
  document.getElementById("_exp-pdf-btn").addEventListener("click", function() {
    // Print the ABC text as a formatted page (sheet music not available at collection level)
    const colId = _exportCollectionId;
    if (!colId) return;
    apiFetch("/api/export/collection/" + colId + "?fmt=thecraic")
      .then(function(data) {
        // data is likely JSON with tunes; build a simple ABC printout
        return apiFetch("/api/collections/" + colId + "/tunes");
      })
      .catch(function() { return null; })
      .then(function(resp) {
        // Fallback: open the TheCraic ABC export URL in a printable window
        const win = window.open("/api/export/collection/" + colId + "?fmt=thecraic_abc", "_blank");
        if (!win) {
          // Direct link fallback
          const a = document.createElement("a");
          a.href = "/api/export/collection/" + colId;
          a.download = (safeName || "collection") + ".abc";
          a.click();
        }
      });
  });
  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeCollectionExportModal() {
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
  _exportCollectionId = null;
}

function doExportCollection(format) {
  if (!_exportCollectionId) return;
  const url = `/api/collections/${_exportCollectionId}/export/${format}`;
  // Trigger browser download
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  closeCollectionExportModal();
}

// Close export modal on backdrop click
document.addEventListener("click", function(e) {
  const modal = document.getElementById("collectionExportModal");
  if (modal && e.target === modal) closeCollectionExportModal();
});