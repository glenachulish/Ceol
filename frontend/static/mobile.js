/* Ceòl Mobile – thin adapter loaded after app.js
   Provides mobile-specific UI: bottom nav, filter drawer, hamburger menu.
   All data logic is handled by app.js; this file only manages the mobile chrome. */

(function () {
  "use strict";

  // ── Theme (light / dark / auto) ──────────────────────────────────────────
  const THEME_KEY = "ceol-theme";

  function applyTheme(pref) {
    const root = document.documentElement;
    if (pref === "light" || pref === "dark") {
      root.setAttribute("data-theme", pref);
    } else {
      root.removeAttribute("data-theme"); // auto = let media query decide
    }
    document.querySelectorAll(".m-theme-btn").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.theme === pref));
    });
  }

  // Apply saved preference immediately (before paint)
  applyTheme(localStorage.getItem(THEME_KEY) || "auto");

  document.querySelectorAll(".m-theme-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pref = btn.dataset.theme;
      localStorage.setItem(THEME_KEY, pref);
      applyTheme(pref);
    });
  });

  // ── Bottom navigation ────────────────────────────────────────────────────────
  // app.js's switchView() already hides/shows the correct view panels.
  // We just need to keep the bottom nav's .active state in sync.

  const mNavBtns = document.querySelectorAll(".m-nav-btn");

  // Views in the "More" drawer don't have a direct nav button, so highlight
  // the More button itself when one of those views is active.
  const moreViews = new Set(["notes", "achievements"]);

  function syncBottomNav(view) {
    mNavBtns.forEach(btn => {
      if (btn.id === "m-more-btn") {
        btn.classList.toggle("active", moreViews.has(view));
      } else {
        const setDetail = document.getElementById('set-detail-view');
        if (setDetail && !setDetail.classList.contains('hidden')) {
          setDetail.classList.add('hidden');
          document.getElementById('sets-list')?.classList.remove('hidden');
        }

        btn.classList.toggle("active", btn.dataset.view === view);
      }
    });
  }

  // Patch app.js's switchView to also sync the bottom nav.
  // app.js declares switchView as a plain function so we can wrap it here.
  const _appSwitchView = window.switchView;
  window.switchView = function (view) {
    _appSwitchView(view);
    syncBottomNav(view);
  };

  mNavBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      // Collapse detail sub-views when switching main sections
      const colDetail = document.getElementById("col-detail-view");
      if (colDetail && !colDetail.classList.contains("hidden")) {
        colDetail.classList.add("hidden");
        document.getElementById("collections-list")?.classList.remove("hidden");
        document.getElementById("recent-imports-card")?.classList.remove("hidden");
        document.getElementById("view-collections")?.querySelector(".view-header")?.classList.remove("hidden");
      }
      switchView(btn.dataset.view);
    });
  });

  // Sync on page load (library is active by default)
  syncBottomNav("library");

  // ── Filter toggle ────────────────────────────────────────────────────────────
  const mFilterToggle = document.getElementById("m-filter-toggle");
  const mFilterDrawer = document.getElementById("m-filter-drawer");

  // Drawer is visible by default on wider screens; hidden on narrow phones.
  // We toggle it with the gear button.
  let _filterOpen = window.innerWidth >= 520; // open by default on tablets
  if (!_filterOpen) mFilterDrawer.classList.add("hidden");

  mFilterToggle.addEventListener("click", () => {
    _filterOpen = !_filterOpen;
    mFilterDrawer.classList.toggle("hidden", !_filterOpen);
    mFilterToggle.classList.toggle("active", _filterOpen);
  });

  // Also show a dot on the filter button when any filter is active
  function _updateFilterIndicator() {
    const hasFilter =
      document.getElementById("filter-type").value ||
      document.getElementById("filter-key").value ||
      document.getElementById("filter-mode").value ||
      document.getElementById("filter-rating").value ||
      document.getElementById("filter-hitlist-btn").classList.contains("active");
    mFilterToggle.style.borderColor = hasFilter ? "var(--accent)" : "";
    mFilterToggle.style.color      = hasFilter ? "var(--accent)" : "";
  }

  ["filter-type", "filter-key", "filter-mode", "filter-rating"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", _updateFilterIndicator);
  });
  document.getElementById("filter-hitlist-btn")?.addEventListener("click", () => {
    // slight delay so app.js's handler runs first
    setTimeout(_updateFilterIndicator, 50);
  });
  document.getElementById("clear-btn")?.addEventListener("click", () => {
    setTimeout(_updateFilterIndicator, 50);
  });

  // ── Type filter pills ───────────────────────────────────────────────────────
  (function _buildTypePills() {
    const filterType = document.getElementById("filter-type");
    if (!filterType) return;
    function _render() {
      const opts = [...filterType.options].filter(o => o.value !== "");
      if (!opts.length) { setTimeout(_render, 200); return; }
      const existing = document.getElementById("m-type-pills");
      if (existing) existing.remove();
      const row = document.createElement("div");
      row.id = "m-type-pills"; row.className = "m-type-pills";
      const allPill = document.createElement("button");
      allPill.className = "m-type-pill active"; allPill.dataset.value = ""; allPill.textContent = "All";
      row.appendChild(allPill);
      opts.forEach(o => {
        const pill = document.createElement("button");
        pill.className = "m-type-pill"; pill.dataset.value = o.value; pill.textContent = o.text;
        row.appendChild(pill);
      });
      filterType.parentElement.insertBefore(row, filterType);
      row.addEventListener("click", e => {
        const pill = e.target.closest(".m-type-pill"); if (!pill) return;
        row.querySelectorAll(".m-type-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        filterType.value = pill.dataset.value;
        filterType.dispatchEvent(new Event("change"));
      });
    }
    _render();
  })();

  // ── Key filter pills ────────────────────────────────────────────────────────
  (function _buildKeyPills() {
    const filterKey = document.getElementById("filter-key");
    if (!filterKey) return;
    const QUICK_KEYS = ["D major","G major","E minor","A minor","B minor","A major"];
    const QUICK_LABELS = ["D","G","Em","Am","Bm","A"];

    function _render() {
      const allOpts = [...filterKey.options].filter(o => o.value !== "");
      if (!allOpts.length) { setTimeout(_render, 200); return; }
      const existing = document.getElementById("m-key-pills");
      if (existing) existing.remove();
      filterKey.classList.remove("m-key-other-active");

      const row = document.createElement("div");
      row.id = "m-key-pills"; row.className = "m-type-pills";

      // All pill
      const allPill = document.createElement("button");
      allPill.className = "m-type-pill active"; allPill.dataset.value = ""; allPill.textContent = "All";
      row.appendChild(allPill);

      // Quick-pick key pills
      QUICK_KEYS.forEach((key, i) => {
        if (!allOpts.some(o => o.value === key)) return;
        const pill = document.createElement("button");
        pill.className = "m-type-pill"; pill.dataset.value = key;
        pill.textContent = QUICK_LABELS[i];
        row.appendChild(pill);
      });

      // Other pill — reveals the full <select>
      const otherPill = document.createElement("button");
      otherPill.className = "m-type-pill m-key-other-pill"; otherPill.dataset.value = "__other_key__";
      otherPill.textContent = "Other ▾";
      row.appendChild(otherPill);

      filterKey.parentElement.insertBefore(row, filterKey);

      row.addEventListener("click", e => {
        const pill = e.target.closest(".m-type-pill"); if (!pill) return;
        if (pill.dataset.value === "__other_key__") {
          // Toggle the full select visible
          row.querySelectorAll(".m-type-pill").forEach(p => p.classList.remove("active"));
          pill.classList.add("active");
          filterKey.classList.add("m-key-other-active");
          filterKey.value = "";
          filterKey.dispatchEvent(new Event("change"));
          filterKey.focus();
          return;
        }
        row.querySelectorAll(".m-type-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        filterKey.classList.remove("m-key-other-active");
        filterKey.value = pill.dataset.value;
        filterKey.dispatchEvent(new Event("change"));
      });

      // When user picks from the full select, mark Other pill active
      filterKey.addEventListener("change", () => {
        const val = filterKey.value;
        if (!val) return;
        const matchesPill = QUICK_KEYS.includes(val);
        if (!matchesPill) {
          row.querySelectorAll(".m-type-pill").forEach(p => p.classList.remove("active"));
          otherPill.classList.add("active");
        }
      });
    }
    _render();
  })();

  // ── Hamburger menu ───────────────────────────────────────────────────────────
  const mMenuBtn     = document.getElementById("m-menu-btn");
  const mMenuOverlay = document.getElementById("m-menu-overlay");
  const mMenuClose   = document.getElementById("m-menu-close");

  function openMobileMenu() {
    mMenuOverlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeMobileMenu() {
    mMenuOverlay.classList.add("hidden");
    document.body.style.overflow = "";
  }

  mMenuBtn.addEventListener("click", openMobileMenu);
  document.getElementById("m-more-btn")?.addEventListener("click", openMobileMenu);
  mMenuClose.addEventListener("click", closeMobileMenu);

  // Close when tapping the dark overlay (outside the drawer)
  mMenuOverlay.addEventListener("click", e => {
    if (e.target === mMenuOverlay) closeMobileMenu();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !mMenuOverlay.classList.contains("hidden")) {
      closeMobileMenu();
    }
  });

  // ── Menu item → delegate to hidden desktop buttons ───────────────────────────
  // app.js attached its listeners to #info-btn, #help-btn, #library-backup-btn,
  // etc. (which live in #m-compat). We just .click() those hidden buttons.

  function _menuDelegate(mobileId, desktopId) {
    const mobileBtn  = document.getElementById(mobileId);
    const desktopBtn = document.getElementById(desktopId);
    if (mobileBtn && desktopBtn) {
      mobileBtn.addEventListener("click", () => {
        closeMobileMenu();
        desktopBtn.click();
      });
    }
  }

  // View-switch items in the drawer (Notes, Achievements)
  document.querySelectorAll(".m-menu-view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      closeMobileMenu();
      switchView(btn.dataset.view);
    });
  });

  _menuDelegate("m-info-btn",       "info-btn");
  _menuDelegate("m-help-btn",       "help-btn");
  _menuDelegate("m-backup-btn",     "library-backup-btn");
  
  // Import nav button → open the tune import overlay directly
  const _importNavBtn = document.getElementById("import-nav-btn");
  if (_importNavBtn) {
    _importNavBtn.addEventListener('click', () => {
      const overlay = document.getElementById('import-overlay');
      if (overlay && !overlay.classList.contains('hidden')) {
        // Already open — close and go to library
        overlay.classList.add('hidden');
        if (typeof switchView === 'function') switchView('library');
        return;
      }
      if (typeof openImport === 'function') {
        openImport();
      } else if (overlay) {
        overlay.classList.remove('hidden');
      }
    });
  }

  _menuDelegate("m-lib-import-btn", "library-import-btn");
  _menuDelegate("m-lib-delete-btn", "library-delete-btn");

  
  // Notes × back button
  document.getElementById("notes-back-btn")?.addEventListener("click", () => switchView("library"));

  // Achievements × back button
  document.getElementById("achievements-back-btn")?.addEventListener("click", () => switchView("library"));

// TheCraic export is already handled by app.js via #thecraic-export-btn
  // (which exists in the mobile.html hamburger menu directly).

  // ── Scroll to top on view change ─────────────────────────────────────────────
  // Smooth UX: scroll back to top of page whenever the user taps a nav button.
  mNavBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // ── Touch-friendly: close modal on back-swipe (Android) ──────────────────────
  // Android's back button fires a popstate event when the history stack is used.
  // Push a state when a modal opens; pop it (close modal) on back.
  const _modalOverlay = document.getElementById("modal-overlay");
  const _importOverlay = document.getElementById("import-overlay");

  function _pushModalState() {
    history.pushState({ ceolModal: true }, "");
  }

  // Observe modal visibility changes
  const _modalObserver = new MutationObserver(() => {
    const modalOpen = !_modalOverlay.classList.contains("hidden") ||
                      !_importOverlay.classList.contains("hidden");
    if (modalOpen) _pushModalState();
  });
  _modalObserver.observe(_modalOverlay,  { attributes: true, attributeFilter: ["class"] });
  _modalObserver.observe(_importOverlay, { attributes: true, attributeFilter: ["class"] });

  window.addEventListener("popstate", e => {
    if (!_importOverlay.classList.contains("hidden")) {
      _importOverlay.classList.add("hidden");
      document.body.style.overflow = "";
    } else if (!_modalOverlay.classList.contains("hidden")) {
      // app.js's closeModal()
      if (typeof closeModal === "function") closeModal();
    }
  });

  // ── Instant tune card tap (PWA mode) ────────────────────────────────────────
  // touchend fires immediately when finger lifts; click has up to 300ms delay.
  // Scroll guard: if finger moved >8px vertically, treat as scroll not tap.
  (function _fastTap() {
    const _list = document.getElementById("tune-list");
    if (!_list) return;
    let _startY = 0, _moved = false;
    _list.addEventListener("touchstart", e => {
      _startY = e.touches[0].clientY;
      _moved  = false;
    }, { passive: true });
    _list.addEventListener("touchmove", e => {
      if (Math.abs(e.touches[0].clientY - _startY) > 8) _moved = true;
    }, { passive: true });
    _list.addEventListener("touchend", e => {
      if (_moved) return;
      const card = e.target.closest(".tune-card");
      if (!card) return;
      if (e.target.closest("button")) return;  // let button handlers fire normally
      e.preventDefault();
      card.click();
    }, { passive: false });
  })();



  // ── Modal overlay: instant button taps ──────────────────────────────────────
  // All buttons inside modals get touchend→click forwarding so PWA tap delay
  // doesn't affect set More, export buttons, etc.
  (function _modalFastTap() {
    const _ovl = document.getElementById("modal-overlay");
    if (!_ovl) return;
    let _my = 0, _mm = false;
    _ovl.addEventListener("touchstart", e => {
      _my = e.touches[0].clientY; _mm = false;
    }, { passive: true });
    _ovl.addEventListener("touchmove", e => {
      if (Math.abs(e.touches[0].clientY - _my) > 8) _mm = true;
    }, { passive: true });
    _ovl.addEventListener("touchend", e => {
      if (_mm) return;
      const btn = e.target.closest("button:not([disabled])");
      if (!btn) return;
      e.preventDefault();
      btn.click();
    }, { passive: false });
  })();

  // ── Fullscreen More button: pointerdown + CSS class toggle ────────────────
  // pointerdown fires on first finger contact — no double-tap suppression,
  // no 300ms delay. CSS class toggle is more reliable than inline cssText on iOS.
  (function _fsFastTap() {
    const _fsOld = document.getElementById("abc-fs-more-btn");
    if (!_fsOld) return;

    // Clone strips all existing event listeners from app.js
    const _fsNew = _fsOld.cloneNode(true);
    _fsOld.parentNode.replaceChild(_fsNew, _fsOld);
    _fsNew.dataset.wired = "1";  // prevent app.js re-wiring

    function _toggleFsControls() {
      const overlay = document.getElementById("abc-fullscreen-overlay");
      if (!overlay) return;
      overlay.classList.toggle("fs-ctrl-hidden");
    }

    // pointerdown: fires immediately on contact, no iOS double-tap issues
    _fsNew.addEventListener("pointerdown", e => {
      e.preventDefault();
      _toggleFsControls();
    });

    // touchend + click as fallbacks
    let _pdFired = false;
    _fsNew.addEventListener("touchend", e => {
      if (_pdFired) { _pdFired = false; return; }
      e.preventDefault();
      _toggleFsControls();
    }, { passive: false });
    _fsNew.addEventListener("click", () => {
      if (!_pdFired) _toggleFsControls();
      _pdFired = false;
    });
    _fsNew.addEventListener("pointerup", () => { _pdFired = true; setTimeout(() => { _pdFired = false; }, 300); });

    // Fast-tap for other fullscreen buttons (Exit, bar controls)
    const _fs = document.getElementById("abc-fullscreen-overlay");
    if (!_fs) return;
    let _fy = 0, _fm = false;
    _fs.addEventListener("touchstart", e => {
      _fy = e.touches[0].clientY; _fm = false;
    }, { passive: true });
    _fs.addEventListener("touchmove", e => {
      if (Math.abs(e.touches[0].clientY - _fy) > 8) _fm = true;
    }, { passive: true });
    _fs.addEventListener("touchend", e => {
      if (_fm) return;
      const btn = e.target.closest("button:not([disabled])");
      if (!btn || btn.id === "abc-fs-more-btn") return;
      e.preventDefault();
      btn.click();
    }, { passive: false });
  })();

})();