class CadPlanAardvark {
  /**
   * Unified Aardvark In-Situ Inspector for DocumentReader dossiers.
   * Supports desktop mouse hover + keyboard (W wider, N narrower, C/M/A note, E edit, T copy, Space lock)
   * and mobile touch-hover offset reticle.
   */
  constructor(options = {}) {
    this.options = options || {};
    this.isActive = false;
    this.currentElement = null;
    this.widerStack = [];
    this.overlayElement = null;
    this.hudElement = null;
    this.radialMenuElement = null;
    this._touchInspecting = false;

    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onContextMenu = this._handleContextMenu.bind(this);
    this._onClickOutside = this._handleClickOutside.bind(this);
  }

  init() {
    this._injectStyles();
    this._createDomElements();
  }

  _getDossierId() {
    return this.options.dossierId ||
      this.options.documentReader?.options?.dossierId ||
      globalThis._activeDocumentReader?.options?.dossierId ||
      'Document';
  }

  activate() {
    if (this.isActive) return;
    this.isActive = true;
    this.widerStack = [];
    this.isElementLocked = false;
    this.lockedElement = null;
    this._touchInspecting = false;

    if (typeof KeyCommandHandler !== 'undefined' && typeof KeyCommandHandler.setPaused === 'function') {
      KeyCommandHandler.setPaused(true);
      this._restoredKeyCommand = true;
    }

    this._onClick = this._handleClick.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);

    document.addEventListener('mousemove', this._onMouseMove, true);
    document.addEventListener('keydown', this._onKeyDown, true);
    document.addEventListener('contextmenu', this._onContextMenu, true);
    document.addEventListener('click', this._onClick, true);

    document.addEventListener('touchstart', this._onTouchStart, { passive: false, capture: true });
    document.addEventListener('touchmove', this._onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', this._onTouchEnd, { passive: false, capture: true });

    this._highlightAnnotatedElements();
    this._showHudMessage("🔍 Aardvark Active: Click or drag thumb to attach note | 'W' wider | 'N' narrower | 'Esc' exit");
  }

  deactivate() {
    if (!this.isActive) return;
    this.isActive = false;
    this.isElementLocked = false;
    this.lockedElement = null;
    this._touchInspecting = false;

    if (this._restoredKeyCommand && typeof KeyCommandHandler !== 'undefined' && typeof KeyCommandHandler.setPaused === 'function') {
      KeyCommandHandler.setPaused(false);
      this._restoredKeyCommand = false;
    }

    document.removeEventListener('mousemove', this._onMouseMove, true);
    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('contextmenu', this._onContextMenu, true);
    if (this._onClick) document.removeEventListener('click', this._onClick, true);

    if (this._onTouchStart) document.removeEventListener('touchstart', this._onTouchStart, true);
    if (this._onTouchMove) document.removeEventListener('touchmove', this._onTouchMove, true);
    if (this._onTouchEnd) document.removeEventListener('touchend', this._onTouchEnd, true);

    this._hideOverlay();
    this._hideHud();
    this._closeRadialMenu();
  }

  toggle() {
    if (this.isActive) this.deactivate();
    else this.activate();
  }

  _handleTouchStart(e) {
    if (!this.isActive || this.isElementLocked || e.touches.length > 1) {
      this._touchInspecting = false;
      return;
    }
    const touch = e.touches[0];
    if (this._isIgnoredTarget(e.target)) {
      this._touchInspecting = false;
      return;
    }
    this._touchInspecting = true;
    if (e.cancelable) e.preventDefault();
    this._resolveTouchTarget(touch.clientX, touch.clientY);
  }

  _handleTouchMove(e) {
    if (!this.isActive || !this._touchInspecting || e.touches.length > 1 || this.isElementLocked) return;
    const touch = e.touches[0];
    if (e.cancelable) e.preventDefault();
    this._resolveTouchTarget(touch.clientX, touch.clientY);
  }

  _handleTouchEnd(e) {
    if (!this.isActive || !this._touchInspecting || this.isElementLocked) {
      this._touchInspecting = false;
      return;
    }
    this._touchInspecting = false;
    if (this.currentElement && !this._isIgnoredTarget(this.currentElement)) {
      if (e.cancelable) e.preventDefault();
      this._openNoteOnSelected();
    }
  }

  _resolveTouchTarget(clientX, clientY) {
    const targetY = Math.max(64, clientY - 38);
    const targetEl = document.elementFromPoint(clientX, targetY);
    if (targetEl && !this._isIgnoredTarget(targetEl)) {
      this.currentElement = targetEl;
      this._highlightElement(targetEl);
    }
  }

  _injectStyles() {
    const css = `
      @keyframes cp-crawling-ants {
        0% { background-position: 0 0, 100% 0, 100% 100%, 0 100%; }
        100% { background-position: 40px 0, 100% 40px, -40px 100%, 0 -40px; }
      }
      .cadplan-aardvark-overlay {
        position: fixed;
        pointer-events: none;
        z-index: 999980;
        border: 2px solid #ef4444;
        background: rgba(239, 68, 68, 0.08);
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.35);
        border-radius: 3px;
        transition: top 0.04s ease-out, left 0.04s ease-out, width 0.04s ease-out, height 0.04s ease-out;
        display: none;
        box-sizing: border-box;
      }
      .cadplan-aardvark-tag {
        position: absolute;
        top: -18px;
        left: -2px;
        background: #ffd700;
        color: #000000;
        font-family: monospace;
        font-size: 10.5px;
        font-weight: bold;
        padding: 1px 6px;
        border-radius: 3px 3px 0 0;
        white-space: nowrap;
        pointer-events: none;
      }
      .cadplan-aardvark-overlay.locked {
        border: 2.5px solid #00f2fe !important;
        background: rgba(0, 242, 254, 0.12) !important;
        box-shadow: 0 0 18px rgba(0, 242, 254, 0.5) !important;
      }
      .cadplan-aardvark-overlay.locked .cadplan-aardvark-tag {
        background: #00f2fe !important;
        color: #070a13 !important;
      }
      .cadplan-has-note-marker {
        position: relative !important;
        background-image:
          linear-gradient(90deg, #00f2fe 50%, transparent 50%),
          linear-gradient(180deg, #00f2fe 50%, transparent 50%),
          linear-gradient(270deg, #00f2fe 50%, transparent 50%),
          linear-gradient(0deg, #00f2fe 50%, transparent 50%) !important;
        background-repeat: repeat-x, repeat-y, repeat-x, repeat-y !important;
        background-size: 16px 2px, 2px 16px, 16px 2px, 2px 16px !important;
        background-position: 0 0, 100% 0, 100% 100%, 0 100% !important;
        animation: cp-crawling-ants 1.4s linear infinite !important;
        border-radius: 6px !important;
        box-shadow: 0 0 18px rgba(0, 242, 254, 0.25) !important;
      }
      .cadplan-has-note-marker.proposal-mode {
        background-image:
          linear-gradient(90deg, #c084fc 50%, transparent 50%),
          linear-gradient(180deg, #c084fc 50%, transparent 50%),
          linear-gradient(270deg, #c084fc 50%, transparent 50%),
          linear-gradient(0deg, #c084fc 50%, transparent 50%) !important;
        box-shadow: 0 0 18px rgba(192, 132, 252, 0.35) !important;
      }
      .cadplan-aardvark-hud {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999995;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid #334155;
        color: #f8fafc;
        border-radius: 20px;
        padding: 6px 18px;
        font-family: monospace;
        font-size: 11px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
        pointer-events: none;
        display: none;
        white-space: nowrap;
        max-width: calc(100vw - 24px);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cadplan-aardvark-radial {
        position: fixed;
        z-index: 999998;
        display: none;
        flex-direction: column;
        gap: 4px;
        min-width: 230px;
        padding: 8px;
        background: rgba(9, 13, 22, 0.98);
        border: 1.5px solid #00f2fe;
        border-radius: 10px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), 0 0 20px rgba(0, 242, 254, 0.25);
        font-family: monospace;
        backdrop-filter: blur(12px);
      }
      .cadplan-aardvark-radial button {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 11px;
        font-family: monospace;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        text-align: left;
      }
      .cadplan-aardvark-radial button:hover,
      .cadplan-aardvark-radial button.has-notes {
        background: rgba(0, 242, 254, 0.12);
        border-color: rgba(0, 242, 254, 0.45);
        color: #ffffff;
      }
    `;
    if (typeof applyCss === 'function') {
      applyCss(css, 'CadPlanAardvarkStyles');
    }
  }

  _createDomElements() {
    if (!this.overlayElement) {
      this.overlayElement = document.createElement('div');
      this.overlayElement.className = 'cadplan-aardvark-overlay';
      this.overlayElement.setAttribute('data-style-exclude', '');

      this.tagElement = document.createElement('div');
      this.tagElement.className = 'cadplan-aardvark-tag';
      this.overlayElement.appendChild(this.tagElement);

      document.body.appendChild(this.overlayElement);
    }
    if (!this.hudElement) {
      this.hudElement = document.createElement('div');
      this.hudElement.className = 'cadplan-aardvark-hud';
      this.hudElement.setAttribute('data-style-exclude', '');
      document.body.appendChild(this.hudElement);
    }
    if (!this.radialMenuElement) {
      this.radialMenuElement = document.createElement('div');
      this.radialMenuElement.className = 'cadplan-aardvark-radial';
      this.radialMenuElement.setAttribute('data-style-exclude', '');
      document.body.appendChild(this.radialMenuElement);
    }
  }

  _handleMouseMove(e) {
    if (!this.isActive) return;
    if (this.isElementLocked || this.lockedElement) return;
    if (this.radialMenuElement && this.radialMenuElement.style.display === 'flex') return;

    const target = e.target;
    if (this._isIgnoredTarget(target)) {
      return;
    }
    this.currentElement = target;
    this.widerStack = [];
    this._highlightElement(target);
  }

  _highlightElement(el) {
    if (!el || !this.overlayElement) return;

    document.querySelectorAll('.comments-active-note-target').forEach(node => {
      node.classList.remove('comments-active-note-target');
    });

    const rect = el.getBoundingClientRect();

    this.overlayElement.style.display = 'block';
    this.overlayElement.style.top = `${rect.top}px`;
    this.overlayElement.style.left = `${rect.left}px`;
    this.overlayElement.style.width = `${rect.width}px`;
    this.overlayElement.style.height = `${rect.height}px`;

    const blockId = el.getAttribute('data-block') || el.getAttribute('data-block-id') || (el.id && !el.id.startsWith('uw') ? el.id : '');
    const tagName = el.tagName.toLowerCase();
    const tagDisplay = blockId ? `${tagName}#${blockId}` : tagName;

    if (this.tagElement) {
      this.tagElement.textContent = `<${tagDisplay}>`;
    }

    if (this.isElementLocked) {
      this.overlayElement.classList.add('locked');
      el.classList.add('comments-active-note-target');
      this._showHudMessage(`[LOCKED] <${tagDisplay}> — Focused • Press Esc to unlock`);
    } else {
      this.overlayElement.classList.remove('locked');
      this._showHudMessage(`<${tagDisplay}> — Click or press 'C' to note | 'W' wider | 'N' narrower`);
    }
  }

  _selectParent() {
    if (this.currentElement && this.currentElement.parentElement && this.currentElement.tagName !== 'BODY') {
      this.widerStack.push(this.currentElement);
      this.currentElement = this.currentElement.parentElement;
      this._highlightElement(this.currentElement);
    }
  }

  _selectChild() {
    if (this.widerStack.length > 0) {
      this.currentElement = this.widerStack.pop();
      this._highlightElement(this.currentElement);
    }
  }

  _handleKeyDown(e) {
    if (!this.isActive) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

    const key = e.key.toLowerCase();

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (this.isElementLocked) {
        this.isElementLocked = false;
        this.lockedElement = null;
        if (this.currentElement) this._highlightElement(this.currentElement);
        return;
      }
      if (this.radialMenuElement && this.radialMenuElement.style.display === 'flex') {
        this._closeRadialMenu();
      } else {
        this.deactivate();
      }
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      this.isElementLocked = !this.isElementLocked;
      this.lockedElement = this.isElementLocked ? this.currentElement : null;
      if (this.currentElement) this._highlightElement(this.currentElement);
      return;
    }

    if (key === 'c' || key === 'm' || key === 'a') {
      e.preventDefault();
      e.stopPropagation();
      this._openNoteOnSelected();
      return;
    }

    if (key === 'w') {
      e.preventDefault();
      e.stopPropagation();
      this._selectParent();
      return;
    }

    if (key === 'n') {
      e.preventDefault();
      e.stopPropagation();
      this._selectChild();
      return;
    }

    if (key === 'e') {
      e.preventDefault();
      e.stopPropagation();
      this._openEditOnSelected();
      return;
    }

    if (key === 't') {
      e.preventDefault();
      e.stopPropagation();
      this._copyPatchSnippetOnSelected();
      return;
    }
  }

  _handleContextMenu(e) {
    if (!this.isActive || !this.currentElement) return;
    if (this._isIgnoredTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    this._openRadialMenu(e.clientX, e.clientY);
  }

  _openRadialMenu(x, y) {
    if (!this.radialMenuElement || !this.currentElement) return;
    const el = this.currentElement;

    const loc = CadPlanItemNotes.generateElementLocator(el);
    const reader = this.options.documentReader || globalThis._activeDocumentReader || null;
    const ctx = (typeof CadPlanDataRegistry !== 'undefined')
      ? CadPlanDataRegistry.getElementContext(el)
      : { blockId: loc.key, pageId: reader?.currentPageId || 'overview' };

    const dossierId = this._getDossierId();
    const localMap = CadPlanItemNotes.getLocalMap();
    const notes = localMap[`${dossierId}:${ctx.pageId}:${loc.key}`] || [];
    const notesCount = notes.filter(n => n.status !== 'resolved').length;

    this.radialMenuElement.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'color:#00f2fe; font-weight:800; border-bottom:1px solid #232d3f; padding-bottom:5px; margin-bottom:4px; font-size:10.5px; display:flex; justify-content:space-between; align-items:center;';
    header.innerHTML = `<span>🧭 Target: <strong>${loc.key}</strong></span> ${notesCount > 0 ? `<span style="color:#00f2fe; background:rgba(0,242,254,0.18); padding:1px 6px; border-radius:10px;">${notesCount} 📝</span>` : ''}`;
    this.radialMenuElement.appendChild(header);

    const makeBtn = (label, icon, shortcut, isElectric, onClick) => {
      const b = document.createElement('button');
      if (isElectric) b.classList.add('has-notes');
      b.innerHTML = `<span>${icon} ${label}</span> <span style="color:${isElectric ? '#00f2fe' : '#64748b'}; font-size:9.5px;">[${shortcut}]</span>`;
      b.onclick = (e) => {
        e.stopPropagation();
        this._closeRadialMenu();
        onClick();
      };
      return b;
    };

    const noteLabel = notesCount > 0 ? `Author Directives (${notesCount})` : 'Attach Note / Directive';
    this.radialMenuElement.appendChild(makeBtn(noteLabel, '📝', 'C', notesCount > 0, () => this._openNoteOnSelected()));
    this.radialMenuElement.appendChild(makeBtn('Open Discussion', '💬', 'D', false, () => this._openThreadOnSelected()));
    this.radialMenuElement.appendChild(makeBtn('Wider (Parent Node)', '⬆️', 'W', false, () => this._selectParent()));
    if (this.widerStack.length > 0) {
      this.radialMenuElement.appendChild(makeBtn('Narrower (Child Node)', '⬇️', 'N', false, () => this._selectChild()));
    }
    this.radialMenuElement.appendChild(makeBtn('Edit in-situ', '✏️', 'E', false, () => this._openEditOnSelected()));
    this.radialMenuElement.appendChild(makeBtn('Copy Selector', '📋', 'T', false, () => this._copyPatchSnippetOnSelected()));

    const pad = 12;
    const left = Math.min(x, window.innerWidth - 250 - pad);
    const top = Math.min(y, window.innerHeight - 260 - pad);

    this.radialMenuElement.style.left = `${Math.max(pad, left)}px`;
    this.radialMenuElement.style.top = `${Math.max(pad, top)}px`;
    this.radialMenuElement.style.display = 'flex';
  }

  _closeRadialMenu() {
    if (this.radialMenuElement) {
      this.radialMenuElement.style.display = 'none';
    }
  }

  _handleClickOutside(e) {
    if (this.radialMenuElement && this.radialMenuElement.style.display === 'flex') {
      if (!this.radialMenuElement.contains(e.target)) {
        this._closeRadialMenu();
      }
    }
  }

  _openNoteOnSelected(defaultTab = 'note') {
    if (!this.currentElement) return;
    const el = this.currentElement;

    this.isElementLocked = true;
    this.lockedElement = el;
    this._highlightElement(el);
    this._closeRadialMenu();

    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
    }

    const reader = this.options.documentReader || globalThis._activeDocumentReader || null;
    const dossierId = this._getDossierId();

    const loc = (typeof CadPlanItemNotes !== 'undefined' && typeof CadPlanItemNotes.generateElementLocator === 'function')
      ? CadPlanItemNotes.generateElementLocator(el)
      : { key: el.id || 'target_block', isOfficial: false, xpath: '' };

    const ctx = (typeof CadPlanDataRegistry !== 'undefined')
      ? CadPlanDataRegistry.getElementContext(el)
      : { blockId: loc.key, pageId: reader?.currentPageId || 'overview' };

    const activeDoc = reader?.getCurrentDoc?.() || { name: dossierId };

    if (typeof CadPlanItemNotes !== 'undefined' && typeof CadPlanItemNotes.openBlockNotesDialog === 'function') {
      const dlg = CadPlanItemNotes.openBlockNotesDialog(
        ctx.pageId,
        loc.key,
        activeDoc,
        () => {
          this._highlightAnnotatedElements();
          if (reader) {
            if (typeof reader._updateBlockNoteBadges === 'function') reader._updateBlockNoteBadges();
            if (typeof reader._populateSidePanelNotes === 'function') reader._populateSidePanelNotes();
          }
        },
        reader,
        { targetElement: el, locator: loc, dossierId, enclosingBlockId: ctx.blockId, defaultTab }
      );

      if (dlg && dlg.element) {
        const clearConnectors = this._drawOuterCornerConnectors(el, dlg.element);
        const origClose = dlg.options.onClose;
        dlg.options.onClose = () => {
          if (clearConnectors) clearConnectors();
          this.isElementLocked = false;
          this.lockedElement = null;
          el.classList.remove('comments-active-note-target');
          this._highlightAnnotatedElements();
          if (this.isActive && this.currentElement) {
            this._highlightElement(this.currentElement);
          }
          if (typeof origClose === 'function') origClose();
        };
      }
    }
  }

  _showHudMessage(text) {
    if (this.hudElement) {
      this.hudElement.textContent = text;
      this.hudElement.style.display = 'block';
    }
  }

  _hideHud() {
    if (this.hudElement) this.hudElement.style.display = 'none';
  }

  _hideOverlay() {
    if (this.overlayElement) this.overlayElement.style.display = 'none';
  }

  destroy() {
    this.deactivate();
    if (this.overlayElement) this.overlayElement.remove();
    if (this.hudElement) this.hudElement.remove();
    if (this.radialMenuElement) this.radialMenuElement.remove();
    this.overlayElement = null;
    this.hudElement = null;
    this.radialMenuElement = null;
  }

  _copyPatchSnippetOnSelected() {
    if (!this.currentElement) return;
    const el = this.currentElement;
    const reader = this.options.documentReader || globalThis._activeDocumentReader || null;
    const dossierId = this._getDossierId();
    const ctx = (typeof CadPlanDataRegistry !== 'undefined')
      ? CadPlanDataRegistry.getElementContext(el)
      : { blockId: el.getAttribute('data-block-id') || el.id || 'block', pageId: reader?.currentPageId || 'overview' };
    const docCls = reader?.getCurrentDoc?.()?.name || `${ctx.pageId.charAt(0).toUpperCase() + ctx.pageId.slice(1)}Content`;
    const patchSnippet = `<script data-file="${dossierId}/js/${docCls}.js" data-method="${docCls}.${ctx.blockId}" data-action="patch">\nstatic ${ctx.blockId}() {\n  return [\n    "Updated content..."\n  ];\n}\n<\/script>`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(patchSnippet);
      this._showHudMessage(`📋 Copied LLM Patch Template for [${docCls}.${ctx.blockId}]!`);
    }
  }
  _openEditOnSelected() {
    if (!this.currentElement) return;
    const el = this.currentElement;

    this.isElementLocked = true;
    this.lockedElement = el;
    this._highlightElement(el);
    this._closeRadialMenu();

    const reader = this.options.documentReader || globalThis._activeDocumentReader || null;
    const dossierId = this._getDossierId();
    const ctx = (typeof CadPlanDataRegistry !== 'undefined')
      ? CadPlanDataRegistry.getElementContext(el)
      : { blockId: el.getAttribute('data-block-id') || el.id || 'block', pageId: reader?.currentPageId || 'overview' };

    const Editor = globalThis.CadPlanDocumentEditor || globalThis.DocumentEditor;
    if (!Editor || typeof Editor.openBlockEditor !== 'function') {
      this._showHudMessage('⚠️ DocumentEditor not loaded');
      return;
    }

    const activeDoc = reader?.getCurrentDoc?.() || { name: dossierId };
    const dlg = Editor.openBlockEditor(ctx.pageId, ctx.blockId, activeDoc, () => {
      if (reader && typeof reader.renderCurrentDocument === 'function') {
        reader.renderCurrentDocument();
      }
      if (this.isActive && this.currentElement) {
        this._highlightElement(this.currentElement);
      }
    }, reader || { options: { dossierId } });

    if (dlg && dlg.element) {
      const clearConnectors = this._drawOuterCornerConnectors(el, dlg.element);
      const origClose = dlg.options.onClose;
      dlg.options.onClose = () => {
        if (clearConnectors) clearConnectors();
        this.isElementLocked = false;
        this.lockedElement = null;
        if (this.isActive) this._highlightElement(el);
        if (typeof origClose === 'function') origClose();
      };
    }
  }

  _highlightAnnotatedElements() {
    if (typeof CadPlanItemNotes === 'undefined') return;
    const localMap = CadPlanItemNotes.getLocalMap();
    const dossierId = this._getDossierId();
    const currentPageId = this.options.documentReader?.currentPageId || globalThis._activeDocumentReader?.currentPageId || null;

    const activeKeys = new Set();
    Object.keys(localMap).forEach(key => {
      const notes = localMap[key] || [];
      const activeNotes = notes.filter(n => {
        if (n.status === 'resolved') return false;
        if (dossierId && n.dossierId && n.dossierId !== dossierId) return false;
        if (currentPageId && n.pageId && n.pageId !== currentPageId) return false;
        return true;
      });
      if (activeNotes.length > 0) {
        activeKeys.add(key);
      }
    });

    document.querySelectorAll('.cadplan-has-note-marker').forEach(el => {
      const blockId = el.getAttribute('data-block-id') || el.getAttribute('data-block') || el.id;
      let hasActive = false;
      for (const k of activeKeys) {
        if (k.endsWith(`:${blockId}`)) {
          hasActive = true;
          break;
        }
      }
      if (!hasActive) {
        el.classList.remove('cadplan-has-note-marker', 'proposal-mode');
      }
    });

    activeKeys.forEach(k => {
      const notes = (localMap[k] || []).filter(n => n.status !== 'resolved');
      const firstNote = notes[0];
      if (!firstNote) return;

      let targetEl = null;
      if (firstNote.blockId) {
        targetEl = document.querySelector(`[data-block-id="${firstNote.blockId}"]`) ||
                   document.querySelector(`[data-block="${firstNote.blockId}"]`) ||
                   document.getElementById(`block-${firstNote.blockId}`) ||
                   document.getElementById(firstNote.blockId);
      }

      if (!targetEl && firstNote.xpath) {
        try {
          const res = document.evaluate(firstNote.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          if (res.singleNodeValue instanceof Element) targetEl = res.singleNodeValue;
        } catch (e) {}
      }

      if (targetEl instanceof Element) {
        targetEl.classList.add('cadplan-has-note-marker');
        if (notes.some(n => n.isLLM)) {
          targetEl.classList.add('proposal-mode');
        }
      }
    });
  }

  _drawOuterCornerConnectors(element, dialogElement) {
    let svg = document.getElementById('cadplan-outer-corners-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'cadplan-outer-corners-svg';
      svg.className = 'comments-corner-rays-canvas';
      svg.setAttribute('style', 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;overflow:visible;');

      for (let i = 0; i < 4; i++) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.id = `cadplan-corner-line-${i}`;
        line.setAttribute('stroke', '#00f2fe');
        line.setAttribute('stroke-width', '1.4');
        line.setAttribute('stroke-dasharray', '4,3');
        line.setAttribute('opacity', '0.75');
        svg.appendChild(line);
      }

      document.body.appendChild(svg);
    }

    const dlgZ = parseInt(window.getComputedStyle(dialogElement).zIndex) || 100000;
    svg.style.zIndex = String(Math.max(1, dlgZ - 1));

    let rafId = null;

    const updateFrame = () => {
      if (!element || !element.isConnected || !dialogElement || !dialogElement.isConnected) {
        if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
        return;
      }

      const curDlgZ = parseInt(window.getComputedStyle(dialogElement).zIndex) || 100000;
      if (svg.style.zIndex !== String(curDlgZ - 1)) {
        svg.style.zIndex = String(Math.max(1, curDlgZ - 1));
      }

      const eRect = element.getBoundingClientRect();
      const dRect = dialogElement.getBoundingClientRect();

      const eCorners = [
        { x: eRect.left,  y: eRect.top },
        { x: eRect.right, y: eRect.top },
        { x: eRect.right, y: eRect.bottom },
        { x: eRect.left,  y: eRect.bottom }
      ];

      const dCorners = [
        { x: dRect.left,  y: dRect.top },
        { x: dRect.right, y: dRect.top },
        { x: dRect.right, y: dRect.bottom },
        { x: dRect.left,  y: dRect.bottom }
      ];

      for (let i = 0; i < 4; i++) {
        const l = document.getElementById(`cadplan-corner-line-${i}`);
        if (l) {
          l.setAttribute('x1', eCorners[i].x);
          l.setAttribute('y1', eCorners[i].y);
          l.setAttribute('x2', dCorners[i].x);
          l.setAttribute('y2', dCorners[i].y);
          l.style.display = 'block';
        }
      }

      rafId = requestAnimationFrame(updateFrame);
    };

    rafId = requestAnimationFrame(updateFrame);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      const s = document.getElementById('cadplan-outer-corners-svg');
      if (s && s.parentNode) s.parentNode.removeChild(s);
    };
  }

  _handleClick(e) {
    if (!this.isActive) return;

    if (this._isIgnoredTarget(e.target)) {
      if (this.radialMenuElement && this.radialMenuElement.style.display === 'flex') {
        if (!this.radialMenuElement.contains(e.target)) {
          this._closeRadialMenu();
        }
      }
      return;
    }

    if (this.isElementLocked) return;

    e.preventDefault();
    e.stopPropagation();
    this.currentElement = e.target;
    this._openNoteOnSelected();
  }

  _openThreadOnSelected() {
    this._openNoteOnSelected('thread');
  }

  _isIgnoredTarget(el) {
    if (!el || !(el instanceof Element)) return true;
    return Boolean(
      el.hasAttribute('data-style-exclude') ||
      el.hasAttribute('data-aardvark-ignore') ||
      el.closest('[data-style-exclude], [data-aardvark-ignore], .uw-dialog, .cadplan-aardvark-radial, #dr-header-overflow-menu, .dr-nav-bar, #dr-notes-nav-dock, .dr-notes-navigator-dock, #dr-btn-aardvark-toggle, .dr-hover-action-pill, .dr-attached-notes-banner, .dr-universal-gutter, .dr-xpath-note-pill, .yt-side-panel, #luno-spa-dock, .luno-dock')
    );
  }
}

globalThis.CadPlanAardvark = CadPlanAardvark;
if (typeof module !== 'undefined' && module.exports) module.exports = CadPlanAardvark;