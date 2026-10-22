class DocumentReader {

  constructor(options = {}) {
    this.options = options || {};
    this.container = options.container || document.body;
    this.brandTitle = options.brandTitle || 'Document Reader';
    this.brandIcon = options.brandIcon || '📖';
    this.pages = options.pages || [];
    this.activeVariants = {};
    this.selectedBlockId = null;
    this.assistantDialog = null;

    const parsed = this._parseUrlRoute();
    const validInitial = (parsed.pageId && this.pages.some((p) => p.id === parsed.pageId)) ? parsed.pageId : (this.pages[0]?.id || 'overview');
    this.currentPageId = validInitial;

    this._setupStyles();
  }

  _setupStyles() {
      if (typeof applyCss !== 'function') return;

      const css = `
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        :root {
          --dr-bg: #faf7f2;
          --dr-surface: #ffffff;
          --dr-text: #1f242e;
          --dr-text-subtle: #475569;
          --dr-muted: #64748b;
          --dr-accent: #0284c7;
          --dr-accent-soft: rgba(2, 132, 199, 0.08);
          --dr-border: #e6dfd5;
          --dr-card-bg: #f3efe7;
          --dr-quote-bg: #f3efe7;
          --dr-quote-border: #0284c7;
          --dr-toolbar-bg: rgba(250, 247, 242, 0.94);
          --dr-toolbar-border: rgba(0, 0, 0, 0.08);

          --cad-cyan: #00f2fe;
          --cad-cyan-soft: rgba(0, 242, 254, 0.08);
          --cad-cyan-glow: rgba(0, 242, 254, 0.35);

          --dr-font-body: 'Newsreader', 'Lora', Georgia, serif;
          --dr-font-sans: 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif;
          --dr-font-mono: 'JetBrains Mono', monospace;
        }

        body.theme-dark, .theme-dark {
          --dr-bg: #090d16;
          --dr-surface: #0f1624;
          --dr-text: #f1f5f9;
          --dr-text-subtle: #94a3b8;
          --dr-muted: #64748b;
          --dr-accent: #38bdf8;
          --dr-accent-soft: rgba(56, 189, 248, 0.1);
          --dr-border: #1e293b;
          --dr-card-bg: #111827;
          --dr-quote-bg: #111827;
          --dr-quote-border: #38bdf8;
          --dr-toolbar-bg: rgba(9, 13, 22, 0.95);
          --dr-toolbar-border: rgba(255, 255, 255, 0.08);
        }

        .dr-shell {
          width: 100%;
          min-height: 100vh;
          background-color: var(--dr-bg);
          color: var(--dr-text);
          font-family: var(--dr-font-body);
          padding: 84px 24px 160px;
          box-sizing: border-box;
          display: flex;
          justifyContent: center;
          transition: background-color 0.2s ease, color 0.2s ease;
        }

        .dr-article-container {
          max-width: 820px;
          width: 100%;
          position: relative;
        }

        .dr-nav-bar {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 58px;
          background: var(--dr-toolbar-bg);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--dr-toolbar-border);
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 18px; box-sizing: border-box; z-index: 1000; gap: 12px;
        }

        .dr-brand {
          font-family: var(--dr-font-sans);
          font-size: 0.88rem; font-weight: 800;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--cad-cyan);
          display: flex; align-items: center; gap: 8px;
          flex-shrink: 0; user-select: none; cursor: pointer;
          text-shadow: 0 0 12px rgba(0, 242, 254, 0.4);
        }

        .dr-tab-btn {
          background: transparent; border: none;
          color: var(--dr-text-subtle);
          font-family: var(--dr-font-sans);
          font-size: 0.78rem; font-weight: 600;
          padding: 5px 12px; border-radius: 16px;
          cursor: pointer; white-space: nowrap; transition: all 0.15s ease;
        }
        .dr-tab-btn:hover { color: var(--dr-text); background: rgba(255, 255, 255, 0.06); }
        .dr-tab-btn.active {
          background: linear-gradient(135deg, #0284c7 0%, #00f2fe 100%);
          color: #070a13; font-weight: 800;
          box-shadow: 0 2px 10px rgba(0, 242, 254, 0.4);
        }

        .dr-nav-btn {
          background: rgba(255, 255, 255, 0.04); color: var(--dr-text);
          border: 1px solid var(--dr-border);
          padding: 5px 12px; border-radius: 16px;
          font-family: var(--dr-font-sans); font-size: 0.78rem; font-weight: 700;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          transition: all 0.15s ease;
        }
        .dr-nav-btn:hover {
          border-color: var(--cad-cyan); color: #fff;
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.25);
        }
        .dr-nav-btn.primary {
          background: linear-gradient(135deg, #0284c7 0%, #00f2fe 100%);
          color: #070a13; border: none; font-weight: 800;
        }

        .dr-progress-track {
          position: fixed; top: 58px; left: 0; width: 100%; height: 3px;
          background: transparent; z-index: 9999;
        }
        .dr-progress-bar {
          height: 100%; width: 0%;
          background: linear-gradient(90deg, #38bdf8, #00f2fe, #c084fc);
          box-shadow: 0 0 10px rgba(0, 242, 254, 0.6);
          transition: width 0.08s ease-out;
        }

        .dr-article-header {
          margin-bottom: 48px; padding-bottom: 28px;
          border-bottom: 1.5px solid var(--dr-border);
        }
        .dr-kicker {
          font-family: 'Cinzel', serif;
          font-size: 0.82rem; font-weight: 900;
          letter-spacing: 0.16em; text-transform: uppercase;
          color: var(--cad-cyan); margin-bottom: 14px;
          text-shadow: 0 0 10px rgba(0, 242, 254, 0.3);
        }
        .dr-title {
          font-family: var(--dr-font-sans);
          font-size: 2.6rem; font-weight: 800; line-height: 1.18;
          letter-spacing: -0.03em; margin: 0 0 16px 0; color: var(--dr-text);
        }
        .dr-subtitle {
          font-size: 1.25rem; font-style: italic; color: var(--dr-text-subtle);
          line-height: 1.55; margin: 0; font-family: var(--dr-font-body);
        }

        .dr-section-divider {
          margin: 52px 0 28px 0; padding-top: 32px;
          border-top: 1px solid var(--dr-border);
        }
        .dr-section-part {
          font-family: var(--dr-font-sans); font-size: 0.74rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.14em;
          color: var(--cad-cyan); margin-bottom: 8px;
        }
        .dr-section-title {
          font-family: var(--dr-font-sans); font-size: 1.65rem; font-weight: 800;
          letter-spacing: -0.025em; color: var(--dr-text); margin: 0 0 22px 0;
        }

        .dr-block-wrapper {
          position: relative; margin: 20px 0; padding: 10px 16px;
          border-radius: 8px; transition: all 0.18s ease; cursor: pointer;
        }
        .dr-block-wrapper:hover {
          background: var(--cad-cyan-soft);
        }
        .dr-block-wrapper.block-selected {
          background: var(--cad-cyan-soft);
          box-shadow: inset 3.5px 0 0 var(--cad-cyan), 0 0 20px rgba(0, 242, 254, 0.15);
        }

        .dr-block-p-wrap {
          margin: 14px 0;
        }
        .dr-block-p-wrap:first-child {
          margin-top: 0;
        }
        .dr-block-p-wrap:last-child {
          margin-bottom: 0;
        }

        .dr-block-p {
          font-size: 1.22rem; line-height: 1.82; margin: 0 0 14px 0; color: var(--dr-text);
        }
        .dr-block-p:last-child {
          margin-bottom: 0;
        }

        /* Semantic Formatted Lists */
        .dr-content-list {
          margin: 12px 0 16px 24px;
          padding: 0;
        }
        .dr-content-list-item {
          font-size: 1.15rem;
          line-height: 1.7;
          margin: 6px 0;
          color: var(--dr-text);
        }
        .dr-sidebar-body .dr-content-list-item {
          font-size: 1.05rem;
          line-height: 1.6;
          color: var(--dr-text-subtle);
        }

        .dr-inline-code {
          background: rgba(0, 242, 254, 0.12);
          color: var(--cad-cyan);
          border: 1px solid rgba(0, 242, 254, 0.25);
          border-radius: 4px;
          padding: 1px 6px;
          font-family: var(--dr-font-mono);
          font-size: 0.9em;
        }
        .dr-inline-strong {
          font-weight: 700;
          color: var(--dr-text);
        }
        .dr-inline-em {
          font-style: italic;
        }

        .dr-block-quote {
          margin: 28px 0; padding: 18px 24px;
          border-left: 3.5px solid var(--dr-quote-border);
          font-style: italic; font-size: 1.32rem; line-height: 1.55;
          color: var(--dr-text); background: var(--dr-quote-bg);
          border-radius: 0 10px 10px 0;
        }

        .dr-block-sidebar {
          margin: 28px 0; padding: 20px 24px;
          background: var(--dr-card-bg);
          border-left: 4px solid var(--cad-cyan);
          border-top: 1px solid var(--dr-border);
          border-right: 1px solid var(--dr-border);
          border-bottom: 1px solid var(--dr-border);
          border-radius: 0 12px 12px 0;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        }
        .dr-sidebar-kicker {
          font-family: var(--dr-font-sans); font-size: 0.75rem; font-weight: 800;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--cad-cyan); margin-bottom: 6px;
        }
        .dr-sidebar-title {
          font-family: var(--dr-font-sans); font-size: 1.18rem; font-weight: 700;
          color: var(--dr-text); margin-bottom: 10px;
        }
        .dr-sidebar-body {
          font-size: 1.08rem; line-height: 1.68; color: var(--dr-text-subtle);
        }

        .dr-hover-action-pill {
          position: absolute;
          top: -12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(0, 242, 254, 0.35);
          border-radius: 20px;
          padding: 2px 8px;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 242, 254, 0.2);
          opacity: 0;
          pointer-events: none;
          transform: translateY(4px);
          transition: opacity 0.15s ease, transform 0.15s ease;
          z-index: 50;
        }
        .dr-block-wrapper:hover .dr-hover-action-pill,
        .dr-block-wrapper.block-selected .dr-hover-action-pill {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }
        .dr-pill-btn {
          background: transparent; border: none;
          color: var(--dr-text-subtle); cursor: pointer;
          font-family: var(--dr-font-sans); font-size: 0.7rem; font-weight: 700;
          padding: 3px 6px; border-radius: 12px; display: inline-flex;
          align-items: center; gap: 4px; transition: all 0.12s ease;
        }
        .dr-pill-btn:hover {
          color: #fff; background: rgba(0, 242, 254, 0.2);
        }
      `;

      applyCss(css, 'DocumentReaderStyles');
    }

  async init() {
      this.container.innerHTML = '';

      document.documentElement.style.overflowY = 'auto';
      document.body.style.overflowY = 'auto';
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';

      if (this.container && this.container.style) {
        this.container.style.overflow = 'visible';
        this.container.style.height = 'auto';
        this.container.style.minHeight = '100vh';
      }

      const savedTheme = localStorage.getItem('dr_theme') || 'dark';
      if (savedTheme === 'dark') {
        document.body.classList.add('theme-dark');
      } else {
        document.body.classList.remove('theme-dark');
      }

      this._renderChrome();
      this.renderCurrentDocument();

      this._routeHandler = () => this._handleUrlRouting();
      window.addEventListener('hashchange', this._routeHandler, { passive: true });
      window.addEventListener('popstate', this._routeHandler, { passive: true });

      this._keyboardTourHandler = (e) => {
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

        if (e.key === '[' || e.key === '{') {
          const prevBtn = document.querySelector('#dr-notes-nav-dock button:first-child');
          if (prevBtn) {
            e.preventDefault();
            prevBtn.click();
          }
        } else if (e.key === ']' || e.key === '}') {
          const nextBtn = document.querySelectorAll('#dr-notes-nav-dock button')[1];
          if (nextBtn) {
            e.preventDefault();
            nextBtn.click();
          }
        } else if ((e.altKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
          const curBlock = document.querySelector('.dr-block-wrapper.block-selected') ||
                           document.querySelector('.dr-block-wrapper:hover');
          if (curBlock) {
            e.preventDefault();
            const noteBtn = curBlock.querySelector('.dr-gutter-note-btn');
            if (noteBtn) noteBtn.click();
          }
        } else if (e.key === 'Escape') {
          const menu = document.getElementById('dr-header-overflow-menu');
          if (menu) menu.remove();
        }
      };
      window.addEventListener('keydown', this._keyboardTourHandler);

      const parsed = this._parseUrlRoute();
      if (parsed.anchorId) {
        setTimeout(() => this.highlightTarget(parsed.anchorId), 300);
      }
    }

  _renderChrome() {
      this.navPageButtons = {};

      const sidePanelBtn = makeElement('button', {
        className: 'dr-nav-btn',
        id: 'dr-btn-sidepanel-toggle',
        title: 'Toggle Navigation & Master Outline Sidebar',
        style: {
          padding: '6px 12px',
          fontSize: '0.8rem',
          fontWeight: '800',
          color: '#00f2fe',
          borderColor: 'rgba(0, 242, 254, 0.45)',
          background: 'rgba(0, 242, 254, 0.08)',
          borderRadius: '20px'
        },
        onclick: () => {
          if (globalThis.CadPlanItemNotes) globalThis.CadPlanItemNotes.playHapticSound('click');
          if (globalThis._cadPlanInstance?.sidePanel) {
            globalThis._cadPlanInstance.sidePanel.toggle(!globalThis._cadPlanInstance.sidePanel.isOpen);
          } else {
            this.toggleNavigationSidePanel();
          }
        }
      }, '☰ Chapters');

      this.activeChapterBreadcrumb = makeElement('div', {
        id: 'dr-active-chapter-breadcrumb',
        style: {
          fontFamily: 'var(--dr-font-sans)',
          fontSize: '0.82rem',
          fontWeight: '700',
          color: 'var(--dr-text-subtle)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          padding: '0 8px',
          userSelect: 'none'
        }
      }, this.pages.find(p => p.id === this.currentPageId)?.title || 'CadPlan');

      const aardvarkBtn = makeElement('button', {
        className: 'dr-nav-btn',
        id: 'btn-toggle-aardvark-inspector',
        title: 'Toggle Aardvark Universal Note Picker [Hotkey: C on elements]',
        style: {
          padding: '5px 12px',
          fontSize: '0.78rem',
          fontWeight: '800',
          color: '#00f2fe',
          borderColor: 'rgba(0, 242, 254, 0.45)',
          background: 'rgba(0, 242, 254, 0.08)',
          borderRadius: '16px'
        },
        onclick: () => {
          if (globalThis.CadPlanItemNotes) globalThis.CadPlanItemNotes.playHapticSound('click');
          if (globalThis._cadPlanInstance?.aardvark) {
            globalThis._cadPlanInstance.aardvark.toggle();
            const active = globalThis._cadPlanInstance.aardvark.isActive;
            aardvarkBtn.style.background = active ? 'rgba(0, 242, 254, 0.25)' : 'rgba(0, 242, 254, 0.08)';
            aardvarkBtn.style.boxShadow = active ? '0 0 12px rgba(0, 242, 254, 0.5)' : 'none';
            aardvarkBtn.textContent = active ? '🔍 Aardvark [ON]' : '🔍 Aardvark';
          }
        }
      }, '🔍 Aardvark');

      const livingSpecPromptBtn = makeElement('button', {
        className: 'dr-nav-btn',
        id: 'dr-btn-notes-prompt',
        title: 'Open Living Specification Directive Deck & AI Patch Compiler',
        style: {
          padding: '5px 12px',
          fontSize: '0.78rem',
          fontWeight: '800',
          color: '#00f2fe',
          borderColor: 'rgba(0, 242, 254, 0.35)',
          background: 'rgba(0, 242, 254, 0.08)',
          borderRadius: '16px'
        },
        onclick: () => {
          if (this.itemNotes) {
            this.itemNotes.openPromptBuilderDialog(this);
          }
        }
      }, '⚡ Living Spec');

      const lunoDrawerBtn = makeElement('button', {
        className: 'dr-nav-btn',
        id: 'btn-toggle-luno-cockpit',
        title: 'Open In-Process Luno Workspace Control Drawer',
        style: {
          padding: '5px 12px',
          fontSize: '0.78rem',
          fontWeight: '800',
          color: '#d2a8ff',
          borderColor: '#8257e5',
          background: 'rgba(130, 87, 229, 0.15)',
          borderRadius: '16px'
        },
        onclick: () => this._toggleLunoCockpitDrawer()
      }, '🌙 Luno');

      const themeBtn = makeElement('button', {
        className: 'dr-nav-btn',
        title: 'Toggle Dark/Light Theme',
        style: { padding: '5px 10px', fontSize: '0.8rem', borderRadius: '16px' },
        onclick: () => this.toggleTheme()
      }, '🌓');

      this.navBar = makeElement('nav', { className: 'dr-nav-bar' }, [
        makeElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
          sidePanelBtn,
          makeElement('div', {
            className: 'dr-brand',
            onclick: () => this.switchPage(this.pages[0]?.id)
          }, [
            makeElement('span', { style: { fontSize: '1.1rem' } }, this.brandIcon),
            makeElement('span', { style: { letterSpacing: '0.04em' } }, this.brandTitle)
          ])
        ]),
        this.activeChapterBreadcrumb,
        makeElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
          aardvarkBtn,
          livingSpecPromptBtn,
          lunoDrawerBtn,
          themeBtn
        ])
      ]);
      document.body.appendChild(this.navBar);

      this.progressTrack = makeElement('div', { className: 'dr-progress-track' });
      this.progressBar = makeElement('div', { className: 'dr-progress-bar' });
      this.progressTrack.appendChild(this.progressBar);
      document.body.appendChild(this.progressTrack);

      this._scrollHandler = () => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll > 0) {
          const pct = Math.min(100, Math.max(0, (window.scrollY / maxScroll) * 100));
          this.progressBar.style.width = `${pct}%`;
        }
      };
      window.addEventListener('scroll', this._scrollHandler, { passive: true });

      // Fluid reading shell: adapts smoothly around the sidebar, eliminating huge empty gutters
      this.shell = makeElement('div', {
        className: 'dr-shell',
        style: {
          width: '100%',
          minHeight: '100vh',
          boxSizing: 'border-box',
          display: 'flex',
          justifyContent: 'center',
          padding: '84px 28px 160px',
          transition: 'margin-left 0.25s cubic-bezier(0.2, 0.0, 0.2, 1), width 0.25s cubic-bezier(0.2, 0.0, 0.2, 1)'
        }
      });

      this.articleContainer = makeElement('div', {
        className: 'dr-article-container',
        style: {
          width: '100%',
          maxWidth: '1080px', // Fluid wide reading column that avoids awkward whitespace on 1080p+ screens
          position: 'relative'
        }
      });

      this.shell.appendChild(this.articleContainer);
      this.container.appendChild(this.shell);

      // Sync layout safe area with SidePanel changes
      this._safeAreaSync = (e) => {
        const left = e.detail?.left || 0;
        if (this.navBar) {
          this.navBar.style.left = `${left}px`;
          this.navBar.style.width = left > 0 ? `calc(100% - ${left}px)` : '100%';
        }
        if (this.progressTrack) {
          this.progressTrack.style.left = `${left}px`;
          this.progressTrack.style.width = left > 0 ? `calc(100% - ${left}px)` : '100%';
        }
        if (this.shell) {
          this.shell.style.marginLeft = `${left}px`;
          this.shell.style.width = left > 0 ? `calc(100% - ${left}px)` : '100%';
        }
      };
      window.addEventListener('layout-safe-area-change', this._safeAreaSync);

      const initialLeft = (typeof SidePanel !== 'undefined' && SidePanel.getInstances()?.left?.isOpen)
        ? (SidePanel.getInstances().left.width || 320)
        : 0;
      if (initialLeft > 0) {
        this._safeAreaSync({ detail: { left: initialLeft } });
      }
    }
  getCurrentDoc() {
    const pageCfg = this.pages.find((p) => p.id === this.currentPageId) || this.pages[0];
    return pageCfg?.docClass ? pageCfg.docClass() : null;
  }

  renderCurrentDocument() {
      // 1. Cleanly unregister all active WebGL instances and release contexts before clearing DOM
      if (typeof CadStudioDemoComponent !== 'undefined' && CadStudioDemoComponent._instances) {
        this.articleContainer.querySelectorAll('[id^="accucad-mount-"], [id^="comp-mount-"]').forEach(el => {
          if (el._accuCadId) {
            CadStudioDemoComponent.unregisterInstance(el._accuCadId);
          }
        });
      }

      this.articleContainer.innerHTML = '';
      const doc = this.getCurrentDoc();
      if (!doc) {
        this.articleContainer.innerHTML = '<div style="padding:2rem;text-align:center;">No document content found.</div>';
        return;
      }

      const meta = doc.getMeta ? doc.getMeta() : { kicker: 'Dossier', title: 'Document', subtitle: '' };
      const manifest = doc.manifest ? doc.manifest() : [];

      const header = makeElement('header', { className: 'dr-article-header' }, [
        meta.kicker ? makeElement('div', { className: 'dr-kicker' }, meta.kicker) : null,
        makeElement('h1', { className: 'dr-title' }, meta.title),
        meta.subtitle ? makeElement('p', { className: 'dr-subtitle' }, meta.subtitle) : null
      ]);
      this.articleContainer.appendChild(header);

      manifest.forEach((sec) => {
        const secWrap = makeElement('section', {
          className: 'dr-section-divider',
          id: sec.section ? `sec-${sec.section}` : null,
          'data-section': sec.section || null
        });
        if (sec.partLabel) {
          secWrap.appendChild(makeElement('div', { className: 'dr-section-part' }, sec.partLabel));
        }
        if (sec.title) {
          secWrap.appendChild(makeElement('h2', { className: 'dr-section-title' }, sec.title));
        }

        (sec.blocks || []).forEach((b) => {
          secWrap.appendChild(this._renderBlock(b, doc));
        });

        this.articleContainer.appendChild(secWrap);
      });

      this._updateBlockNoteBadges();
      this._setupScrollSpy();
    }

  _renderBlock(blockDef, doc) {
        const blockId = blockDef.id;
        const dossierId = this.options.dossierId || this.brandTitle;

        // 1. Resolve localized in-situ edits
        let overrideText = null;
        const DocEditor = this.documentEditor;
        if (DocEditor) {
          const ov = DocEditor.getOverride(this.currentPageId, blockId, dossierId);
          if (ov) overrideText = ov.text;
        }

        // 2. Component Mounts
        if (blockDef.type === 'component') {
          const mountId = `comp-mount-${blockId}-${Math.random().toString(36).substr(2, 6)}`;
          const wrapper = makeElement('div', {
            className: 'dr-component-mount-wrap',
            id: mountId,
            'data-block-id': blockId,
            'data-block': blockId,
            'data-component': blockDef.component,
            style: { margin: '28px 0', width: '100%', position: 'relative' }
          });

          const compClass = globalThis[blockDef.component];
          if (compClass) {
            setTimeout(() => {
              const el = document.getElementById(mountId);
              if (el) {
                if (typeof compClass.render === 'function') {
                  compClass.render(el, blockDef.options || {});
                } else if (typeof compClass.renderInteractiveWidget === 'function') {
                  compClass.renderInteractiveWidget(el);
                }
              }
            }, 0);
          }
          return wrapper;
        }

        // 3. Resolve block content
        let rawItems = [];
        if (overrideText) {
          rawItems = Array.isArray(overrideText) ? overrideText : [overrideText];
        } else {
          const htmlContent = this.resolveHtmlBlockContent(this.currentPageId, blockId);
          if (htmlContent) {
            rawItems = [htmlContent];
          } else if (typeof doc[blockId] === 'function') {
            const val = doc[blockId]();
            rawItems = Array.isArray(val) ? val : [val];
          } else {
            rawItems = ['[Content missing]'];
          }
        }

        const wrapper = makeElement('div', {
          className: `dr-block-wrapper ${this.selectedBlockId === blockId ? 'block-selected' : ''}`,
          id: `block-${blockId}`,
          'data-block-id': blockId,
          'data-block': blockId,
          onclick: () => this.selectBlock(blockId, false),
          ondblclick: (e) => {
            e.stopPropagation();
            if (DocEditor) {
              DocEditor.openBlockEditor(this.currentPageId, blockId, doc, () => {
                this.renderCurrentDocument();
              }, this);
            }
          }
        });

        // Active Revision Badge Pill
        if (overrideText) {
          const revBadge = makeElement('div', {
            style: {
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '12px', padding: '2px 8px', marginBottom: '8px', cursor: 'pointer'
            },
            onclick: (e) => {
              e.stopPropagation();
              if (DocEditor) {
                DocEditor.openBlockEditor(this.currentPageId, blockId, doc, () => {
                  this.renderCurrentDocument();
                }, this);
              }
            }
          }, [
            makeElement('span', { style: { fontSize: '10px', color: '#f59e0b', fontWeight: 'bold', fontFamily: 'var(--cp-font-mono)' } }, '⚡ Active In-Situ Revision'),
            makeElement('span', { style: { fontSize: '9.5px', color: '#cbd5e1' } }, '• Double-click to edit or copy patch')
          ]);
          wrapper.appendChild(revBadge);
        }

        if (blockDef.type === 'sidebar') {
          const aside = makeElement('aside', { className: 'dr-block-sidebar' });
          if (blockDef.kicker) {
            aside.appendChild(makeElement('div', { className: 'dr-sidebar-kicker' }, blockDef.kicker));
          }
          if (blockDef.title) {
            aside.appendChild(makeElement('div', { className: 'dr-sidebar-title' }, blockDef.title));
          }
          const body = makeElement('div', { className: 'dr-sidebar-body' });
          rawItems.forEach(item => {
            body.appendChild(this._renderFormattedBlockText(item));
          });
          aside.appendChild(body);
          wrapper.appendChild(aside);
        } else if (blockDef.type === 'quote') {
          const bq = makeElement('blockquote', { className: 'dr-block-quote' });
          rawItems.forEach(item => {
            bq.appendChild(this._renderFormattedBlockText(item));
          });
          wrapper.appendChild(bq);
        } else {
          rawItems.forEach(item => {
            const pEl = makeElement('div', { className: 'dr-block-p-wrap' });
            pEl.appendChild(this._renderFormattedBlockText(item, true));
            wrapper.appendChild(pEl);
          });
        }

        // Action Hover Gutter Pill
        const hoverPill = makeElement('div', { className: 'dr-hover-action-pill' });
        if (overrideText) {
          hoverPill.appendChild(makeElement('span', {
            style: { fontSize: '9px', color: '#f59e0b', fontWeight: 'bold', marginRight: '4px' }
          }, 'Edited'));
        }

        const ItemNotes = this.itemNotes;
        const noteBtn = makeElement('button', {
          className: 'dr-pill-btn dr-gutter-note-btn',
          id: `btn-note-${blockId}`,
          title: 'Attach Author Note / Living Directive [Hotkey: C / M in Aardvark]',
          onclick: (e) => {
            e.stopPropagation();
            if (ItemNotes) {
              ItemNotes.openBlockNotesDialog(this.currentPageId, blockId, doc, () => {
                this._updateBlockNoteBadges();
                this._populateSidePanelNotes();
              }, this);
            }
          }
        }, '📝 Note');
        hoverPill.appendChild(noteBtn);

        hoverPill.appendChild(makeElement('button', {
          className: 'dr-pill-btn',
          title: 'Edit Paragraph In-Situ [Hotkey: E or Double-Click]',
          onclick: (e) => {
            e.stopPropagation();
            if (DocEditor) {
              DocEditor.openBlockEditor(this.currentPageId, blockId, doc, () => {
                this.renderCurrentDocument();
              }, this);
            }
          }
        }, '✎ Edit'));

        hoverPill.appendChild(makeElement('button', {
          className: 'dr-pill-btn',
          title: 'Copy direct anchor link',
          onclick: (e) => {
            e.stopPropagation();
            this.copyAnchorLink(this.currentPageId, blockId, e.currentTarget);
          }
        }, '🔗'));

        wrapper.appendChild(hoverPill);
        return wrapper;
      }
  _formatText(text) {
    if (!text) return document.createTextNode('');
    const str = String(text);
    if (!str.includes('*') && !str.includes('_')) return document.createTextNode(str);

    const frag = document.createDocumentFragment();
    const parts = str.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        const strong = document.createElement('strong');
        strong.textContent = part.slice(2, -2);
        frag.appendChild(strong);
      } else if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        const em = document.createElement('em');
        em.textContent = part.slice(1, -1);
        frag.appendChild(em);
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    }
    return frag;
  }

  selectBlock(blockId, openDialog = false) {
    this.selectedBlockId = blockId;
    document.querySelectorAll('.dr-block-wrapper').forEach((el) => el.classList.remove('block-selected'));
    const el = document.getElementById(`block-${blockId}`);
    if (el) el.classList.add('block-selected');

    if (openDialog) {
      this.setupAssistantDialog(blockId);
    }
  }

  setupAssistantDialog(blockId) {
    if (this.assistantDialog && this.assistantDialog.element?.isConnected) {
      this.assistantDialog.bringToFront();
      this.updateAssistant(blockId);
      return;
    }

    this.assistantContent = makeElement('div', { style: { padding: '4px' } });

    if (typeof UITools !== 'undefined' && typeof UITools.makeDialog === 'function') {
      this.assistantDialog = UITools.makeDialog({
        appendTo: document.body,
        title: 'Method Editor & AI Patch Generator',
        size: [420, 520],
        position: [Math.max(20, window.innerWidth - 460), 68],
        contentElement: this.assistantContent,
        onClose: () => {
          this.assistantDialog = null;
        }
      });
    }

    this.updateAssistant(blockId);
  }

  updateAssistant(blockId) {
    if (!this.assistantContent) return;
    this.assistantContent.innerHTML = '';
    const doc = this.getCurrentDoc();
    if (!doc) return;

    const docName = doc.name || 'ContentDoc';
    const variants = (typeof doc[blockId] === 'function') ? doc[blockId]() : [];
    const vKey = `${this.currentPageId}:${blockId}`;
    const activeIdx = this.activeVariants[vKey] || 0;

    const header = makeElement('div', {
      style: { marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }
    }, [
      makeElement('div', { style: { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' } }, 'Active Method Hook'),
      makeElement('div', { style: { fontSize: '15px', fontWeight: '700', color: '#38bdf8', marginTop: '2px' } }, `${docName}.${blockId}()`),
      makeElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '3px' } }, `Available versions: ${variants.length}`)
    ]);
    this.assistantContent.appendChild(header);

    const variantsBox = makeElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' } });
    variants.forEach((v, i) => {
      const isCur = (i === activeIdx);
      variantsBox.appendChild(makeElement('div', {
        style: {
          background: isCur ? 'rgba(2, 132, 199, 0.2)' : 'rgba(255,255,255,0.03)',
          border: isCur ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: '6px', padding: '10px', cursor: 'pointer'
        },
        onclick: () => {
          this.activeVariants[vKey] = i;
          this.renderCurrentDocument();
          this.updateAssistant(blockId);
        }
      }, [
        makeElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } }, [
          makeElement('strong', { style: { fontSize: '11px', color: isCur ? '#38bdf8' : '#94a3b8' } }, `Version ${i + 1}${isCur ? ' (Active)' : ''}`),
          makeElement('span', { style: { fontSize: '10px', color: '#64748b' } }, `${v.length} chars`)
        ]),
        makeElement('div', { style: { fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4' } }, v)
      ]));
    });
    this.assistantContent.appendChild(variantsBox);

    const copyPatchPromptBtn = makeElement('button', {
      style: {
        width: '100%', padding: '10px', background: '#0284c7', color: '#fff',
        border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px',
        cursor: 'pointer', marginBottom: '10px'
      },
      onclick: () => {
        const patchCode =
`<` + `script data-file="CadPlan/js/${docName}.js" data-method="${docName}.${blockId}" data-action="patch">
static ${blockId}() {
  return [
    ${JSON.stringify(variants[activeIdx] || '')},
    "New refined paragraph or alternative version..."
  ];
}
<` + `/script>`;
        navigator.clipboard.writeText(patchCode);
        alert(`Copied surgical patch container for ${docName}.${blockId}() to clipboard!\n\nYou can ask the LLM to rewrite this method, and it will stream back a direct patch container.`);
      }
    }, '📋 Copy Surgical Patch Container Prompt');
    this.assistantContent.appendChild(copyPatchPromptBtn);
  }

  switchPage(pageId, updateUrl = true) {
      if (this.currentPageId === pageId) {
        return;
      }

      if (typeof CameraOrbitAnimator !== 'undefined' && typeof CameraOrbitAnimator.stop === 'function') {
        CameraOrbitAnimator.stop();
      }

      this.currentPageId = pageId;

      if (updateUrl && window.history && window.history.pushState) {
        window.history.pushState(null, '', `#${pageId}`);
      }

      // Update Top Breadcrumb
      const pageObj = this.pages.find(p => p.id === pageId);
      if (this.activeChapterBreadcrumb && pageObj) {
        const parts = pageObj.title.split('.');
        const chNum = parts[0].trim();
        const chTitle = parts.slice(1).join('.').trim() || pageObj.title;
        this.activeChapterBreadcrumb.innerHTML = `<span style="color:var(--cad-cyan);font-weight:800;">${chNum}.</span> ${chTitle}`;
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.renderCurrentDocument();

      if (typeof KeyCommandHandler !== 'undefined') {
        KeyCommandHandler.setPaused(false);
      }
  }
  toggleTheme(targetTheme = null) {
    const themes = ['dark', 'blueprint', 'phosphor'];
    let cur = localStorage.getItem('dr_theme') || 'dark';
    let next = targetTheme || themes[(themes.indexOf(cur) + 1) % themes.length];

    localStorage.setItem('dr_theme', next);

    document.body.classList.remove('theme-dark', 'theme-blueprint', 'theme-phosphor');
    if (next === 'dark') {
      document.body.classList.add('theme-dark');
    } else if (next === 'blueprint') {
      document.body.classList.add('theme-blueprint');
    } else if (next === 'phosphor') {
      document.body.classList.add('theme-phosphor');
    }

    // Update theme button icon
    const btn = document.querySelector('.dr-nav-btn[title*="Theme"]');
    if (btn) {
      if (next === 'dark') btn.textContent = '🌒 Cyber';
      else if (next === 'blueprint') btn.textContent = '📐 Blueprint';
      else btn.textContent = '📟 Phosphor';
    }

    // Synchronize clear color across active Three.js viewports
    if (typeof CadStudioDemoComponent !== 'undefined' && CadStudioDemoComponent._instances) {
      const bgHex = next === 'blueprint' ? 0x0f1c2e : (next === 'phosphor' ? 0x020a04 : 0x070a13);
      CadStudioDemoComponent._instances.forEach(inst => {
        if (inst.app?.threeDView?.scene) {
          inst.app.threeDView.scene.background = new THREE.Color(bgHex);
        }
        if (inst.app?.baseController?.accuDraw?.updateContrast) {
          inst.app.baseController.accuDraw.updateContrast();
        }
      });
    }
  }
  copyAnchorLink(pageId, blockId, btn = null) {
    const url = `${window.location.origin}${window.location.pathname}#${pageId}/${blockId}`;
    navigator.clipboard.writeText(url).then(() => {
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      }
    }).catch(() => {
      prompt('Direct anchor URL:', url);
    });
  }

  highlightTarget(targetId, targetXPath = null, retryCount = 0) {
      if (!targetId && !targetXPath) return;

      let el = null;
      if (targetId) {
        const clean = targetId.replace(/^#/, '');
        el = document.querySelector(`[data-block="${clean}"], [data-block-id="${clean}"], #block-${clean}, #${clean}, [id*="${clean}"]`);
      }

      if (!el && targetXPath) {
        try {
          const res = document.evaluate(targetXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          if (res.singleNodeValue instanceof Element) {
            el = res.singleNodeValue;
          }
        } catch (e) {}
      }

      if (el) {
        const topBarOffset = 70;
        const elementPosition = el.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - topBarOffset;

        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });

        el.classList.remove('dr-pulse-highlight');
        void el.offsetWidth;
        el.classList.add('dr-pulse-highlight');
      } else if (retryCount < 5) {
        setTimeout(() => this.highlightTarget(targetId, targetXPath, retryCount + 1), 160);
      }
  }
  _parseUrlRoute() {
    let pageId = null;
    let anchorId = null;
    if (window.location.hash) {
      const hashStr = window.location.hash.replace(/^#\/?/, '');
      if (hashStr.includes('/')) {
        const parts = hashStr.split('/');
        pageId = parts[0];
        anchorId = parts[1];
      } else {
        const matched = this.pages.find((p) => p.id === hashStr);
        if (matched) pageId = matched.id;
        else anchorId = hashStr;
      }
    }
    return { pageId, anchorId };
  }

  _handleUrlRouting() {
    const { pageId, anchorId } = this._parseUrlRoute();
    if (pageId && pageId !== this.currentPageId) {
      this.switchPage(pageId, false);
    }
    if (anchorId) {
      setTimeout(() => this.highlightTarget(anchorId), 250);
    }
  }

  showExportDialog() {
      const mdLines = [];
      const dossierId = this.options?.dossierId || this.brandTitle || 'CadPlan';

      this.pages.forEach((pageDef, idx) => {
        const doc = pageDef.docClass ? pageDef.docClass() : null;
        if (!doc) return;
        const meta = doc.getMeta ? doc.getMeta() : { title: pageDef.title };
        const manifest = doc.manifest ? doc.manifest() : [];

        mdLines.push(`# Part ${idx + 1}: ${meta.title}`);
        if (meta.subtitle) mdLines.push(`> *${meta.subtitle}*`);
        mdLines.push('');

        manifest.forEach((sec) => {
          mdLines.push(`## ${sec.title}`);
          mdLines.push('');
          (sec.blocks || []).forEach((b) => {
            const variants = (typeof doc[b.id] === 'function') ? doc[b.id]() : [];
            const vKey = `${pageDef.id}:${b.id}`;
            const curIdx = this.activeVariants[vKey] || 0;
            const txt = variants[curIdx] || variants[0] || '';
            if (b.type === 'quote') mdLines.push(`> "${txt}"\n`);
            else if (b.type === 'sidebar') mdLines.push(`> **${b.title || 'Note'}:** ${txt}\n`);
            else mdLines.push(`${txt}\n`);
          });
        });
        mdLines.push('---\n');
      });

      const fullMd = mdLines.join('\n');
      const ItemNotes = globalThis.CadPlanItemNotes || globalThis.DocumentItemNotes;

      if (ItemNotes && typeof ItemNotes.dispatchToOutbox === 'function') {
        const res = ItemNotes.dispatchToOutbox(`${dossierId} Full Dossier Export`, fullMd);
        if (res.channel === 'clipboard-fallback') {
          alert('Exported full document dossier across all chapters to clipboard as Markdown!');
        } else {
          alert(`✓ Dispatched complete multi-chapter dossier to Luno Outbox via [${res.channel}]!`);
        }
      } else {
        navigator.clipboard.writeText(fullMd);
        alert('Exported full document dossier across all chapters to clipboard as Markdown!');
      }
    }
  destroy() {
    if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler);
    if (this._routeHandler) {
      window.removeEventListener('hashchange', this._routeHandler);
      window.removeEventListener('popstate', this._routeHandler);
    }
    if (this.navBar) this.navBar.remove();
    if (this.progressTrack) this.progressTrack.remove();
    if (this.navSidePanel && typeof this.navSidePanel.destroy === 'function') {
      this.navSidePanel.destroy();
    }
    if (this.assistantDialog && typeof this.assistantDialog.close === 'function') {
      this.assistantDialog.close();
    }
  }

  _initNavigationSidePanel() {
      // When CadPlan provides the master left sidebar, do not instantiate a competing right sidepanel
      return null;
  }
  toggleNavigationSidePanel() {
    if (!this.navSidePanel) {
      this._initNavigationSidePanel();
    }
    if (this.navSidePanel) {
      this.navSidePanel.toggle(!this.navSidePanel.isOpen);
      if (this.navSidePanel.isOpen) {
        this._populateSidePanelToc();
        this._populateSidePanelNotes();
      }
    }
  }

  _populateSidePanelToc() {
    if (!this.spTocSection) return;
    this.spTocSection.innerHTML = '';

    const list = makeElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontFamily: 'var(--dr-font-sans)' }
    });

    this.pages.forEach((p, idx) => {
      const doc = p.docClass ? p.docClass() : null;
      const manifest = doc?.manifest ? doc.manifest() : [];
      const isCurrent = p.id === this.currentPageId;

      const chapterCard = makeElement('div', {
        style: {
          background: isCurrent ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.02)',
          border: isCurrent ? '1.5px solid #38bdf8' : '1px solid #21262d',
          borderRadius: '6px', padding: '8px 10px', cursor: 'pointer',
          transition: 'all 0.15s ease'
        },
        onclick: () => {
          this.switchPage(p.id);
        }
      }, [
        makeElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
          makeElement('strong', { style: { color: isCurrent ? '#38bdf8' : '#f8fafc', fontSize: '11.5px' } }, `${idx}. ${p.title.split('.')[1] || p.title}`),
          isCurrent ? makeElement('span', { style: { fontSize: '9px', background: '#38bdf8', color: '#000', padding: '1px 5px', borderRadius: '10px', fontWeight: 'bold' } }, 'Active') : null
        ])
      ]);

      if (isCurrent && manifest.length > 0) {
        const secList = makeElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', paddingLeft: '8px', borderLeft: '2px solid rgba(56, 189, 248, 0.3)' }
        });

        manifest.forEach(sec => {
          const firstBlock = sec.blocks?.[0]?.id;
          secList.appendChild(makeElement('div', {
            style: { color: '#94a3b8', fontSize: '10.5px', cursor: 'pointer', padding: '2px 0' },
            onclick: (e) => {
              e.stopPropagation();
              if (firstBlock) this.highlightTarget(firstBlock);
            }
          }, `• ${sec.title}`));
        });

        chapterCard.appendChild(secList);
      }

      list.appendChild(chapterCard);
    });

    this.spTocSection.appendChild(list);
  }

  async _populateSidePanelNotes() {
      if (!this.spNotesSection) return;
      const ItemNotes = this.itemNotes;
      if (!ItemNotes) return;

      this.spNotesSection.innerHTML = '';
      const dossierId = this.options.dossierId || this.brandTitle;
      const allNotes = await ItemNotes.getAllNotes(dossierId);
      const activeNotes = allNotes.filter(n => n.status !== 'resolved');

      const topHeader = makeElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: '6px', marginBottom: '8px', borderBottom: '1px solid #232d3f',
          fontSize: '11px', fontFamily: 'monospace'
        }
      }, [
        makeElement('span', { style: { color: '#00f2fe', fontWeight: 'bold' } }, `Living Directives: ${activeNotes.length}`),
        makeElement('div', { style: { display: 'flex', gap: '4px' } }, [
          makeElement('button', {
            className: 'dr-nav-btn',
            style: { padding: '2px 6px', fontSize: '10px', color: '#00f2fe', borderColor: '#00f2fe66' },
            onclick: () => ItemNotes.openPromptBuilderDialog(this)
          }, '⚡ Outbox / Compile'),
          makeElement('button', {
            className: 'dr-nav-btn',
            style: { padding: '2px 6px', fontSize: '10px' },
            onclick: () => this._populateSidePanelNotes()
          }, '↻')
        ])
      ]);
      this.spNotesSection.appendChild(topHeader);

      if (activeNotes.length === 0) {
        this.spNotesSection.appendChild(makeElement('div', {
          style: { padding: '16px 8px', textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '11.5px' }
        }, 'No active directives on any block. Hover any element with Aardvark [C/M] or click 📝 to attach thoughts.'));
        return;
      }

      const list = makeElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '480px', overflowY: 'auto' }
      });

      activeNotes.forEach((n) => {
        const isCleanup = n.status === 'pending_cleanup';
        const isUniversal = Boolean(n.isUniversalElement || n.xpath);
        const timeStr = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const card = makeElement('div', {
          style: {
            background: isCleanup ? 'rgba(245, 158, 11, 0.08)' : 'rgba(0, 242, 254, 0.03)',
            border: isCleanup ? '1px dashed #f59e0b' : '1px solid #1e293b',
            borderLeft: '3.5px solid #00f2fe',
            borderRadius: '6px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px',
            cursor: 'pointer', transition: 'all 0.15s ease'
          },
          onclick: () => {
            if (n.pageId && this.currentPageId !== n.pageId) {
              this.switchPage(n.pageId);
            }
            setTimeout(() => this.highlightTarget(n.blockId, n.xpath), 250);
          }
        }, [
          makeElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            makeElement('strong', { style: { fontSize: '10.5px', color: '#00f2fe', fontFamily: 'monospace' } },
              isUniversal ? `${n.pageId} / <${n.tagName || 'element'}>` : `${n.pageId} / ${n.blockId}`
            ),
            makeElement('span', { style: { fontSize: '9px', color: '#64748b' } }, timeStr)
          ]),
          makeElement('div', {
            style: { fontSize: '11px', color: '#e2e8f0', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }
          }, n.text)
        ]);

        if (n.xpath && isUniversal) {
          card.appendChild(makeElement('div', {
            style: { fontSize: '9px', color: '#64748b', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          }, n.xpath));
        }

        if (n.videoLink) {
          card.appendChild(makeElement('div', {
            style: { fontSize: '10px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }
          }, `📹 Video: ${n.videoLink.label || n.videoLink.videoId} @ ${n.videoLink.time}s`));
        }

        list.appendChild(card);
      });

      this.spNotesSection.appendChild(list);
    }

  async _updateBlockNoteBadges() {
      const ItemNotes = this.itemNotes;
      if (!ItemNotes) return;

      const dossierId = this.options.dossierId || this.brandTitle;
      const all = await ItemNotes.getAllNotes(dossierId);
      const map = {};
      const notesByBlock = {};

      all.forEach(n => {
        if (n.status !== 'resolved') {
          const key = `${n.pageId}:${n.blockId}`;
          map[key] = (map[key] || 0) + 1;
          notesByBlock[key] = notesByBlock[key] || [];
          notesByBlock[key].push(n);
        }
      });

      const doc = this.getCurrentDoc();

      document.querySelectorAll('.dr-block-wrapper').forEach(wrapper => {
        const blockId = wrapper.getAttribute('data-block-id');
        if (!blockId) return;

        const key = `${this.currentPageId}:${blockId}`;
        const count = map[key] || 0;
        const notesList = notesByBlock[key] || [];

        const gutterBtn = wrapper.querySelector('.dr-gutter-note-btn');
        let existingBanner = wrapper.querySelector('.dr-attached-notes-banner');

        if (count > 0) {
          wrapper.classList.add('has-attached-notes');
          if (gutterBtn) {
            gutterBtn.textContent = `📝${count}`;
            gutterBtn.classList.add('has-notes');
          }

          const latestNote = notesList[notesList.length - 1];
          const previewText = latestNote.text.length > 70 ? latestNote.text.substring(0, 70) + '...' : latestNote.text;

          const onBannerClick = (e) => {
            e.stopPropagation();
            ItemNotes.openBlockNotesDialog(this.currentPageId, blockId, doc, () => {
              this._updateBlockNoteBadges();
              this._populateSidePanelNotes();
            }, this);
          };

          if (!existingBanner) {
            const banner = makeElement('div', {
              className: 'dr-attached-notes-banner',
              title: 'Click to view, dictate, or edit attached thoughts',
              onclick: onBannerClick
            }, [
              makeElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' } }, [
                makeElement('span', { style: { fontSize: '13px', flexShrink: 0 } }, '📝'),
                makeElement('strong', { style: { color: '#00f2fe', flexShrink: 0 } }, `${count} Directive${count === 1 ? '' : 's'}:`),
                makeElement('span', { style: { color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `"${previewText}"`)
              ]),
              makeElement('span', { style: { color: '#00f2fe', fontWeight: 'bold', fontSize: '11px', flexShrink: 0 } }, 'View & Dictate ➔')
            ]);
            wrapper.appendChild(banner);
          } else {
            existingBanner.innerHTML = '';
            existingBanner.append(
              makeElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' } }, [
                makeElement('span', { style: { fontSize: '13px', flexShrink: 0 } }, '📝'),
                makeElement('strong', { style: { color: '#00f2fe', flexShrink: 0 } }, `${count} Directive${count === 1 ? '' : 's'}:`),
                makeElement('span', { style: { color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `"${previewText}"`)
              ]),
              makeElement('span', { style: { color: '#00f2fe', fontWeight: 'bold', fontSize: '11px', flexShrink: 0 } }, 'View & Dictate ➔')
            );
          }
        } else {
          wrapper.classList.remove('has-attached-notes');
          if (gutterBtn) {
            gutterBtn.textContent = '📝';
            gutterBtn.classList.remove('has-notes');
          }
          if (existingBanner) {
            existingBanner.remove();
          }
        }
      });

      const totalActiveNotes = Object.values(map).reduce((sum, c) => sum + c, 0);
      const navNotesBtn = document.getElementById('dr-btn-notes-prompt');
      if (navNotesBtn) {
        navNotesBtn.textContent = totalActiveNotes > 0 ? `⚡ Living Spec (${totalActiveNotes})` : '⚡ Living Spec';
        navNotesBtn.style.color = totalActiveNotes > 0 ? '#00f2fe' : 'var(--cad-cyan)';
      }

      this._renderNotesNavigatorDock(all.filter(n => n.status !== 'resolved'));
    }
  _renderNotesNavigatorDock(activeNotes) {
      let dock = document.getElementById('dr-notes-nav-dock');

      if (!activeNotes || activeNotes.length === 0) {
        if (dock) dock.remove();
        return;
      }

      if (!dock) {
        dock = makeElement('div', {
          className: 'dr-notes-navigator-dock',
          id: 'dr-notes-nav-dock'
        });
        document.body.appendChild(dock);
      }

      dock.innerHTML = '';

      const annotatedTargets = [];
      const seen = new Set();
      activeNotes.forEach(n => {
        const uniqueKey = n.blockKey || n.xpath || n.id;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          annotatedTargets.push(n);
        }
      });

      if (!this._currentDockBlockIdx || this._currentDockBlockIdx >= annotatedTargets.length) {
        this._currentDockBlockIdx = 0;
      }

      const currentItem = annotatedTargets[this._currentDockBlockIdx];
      const [pageId, rawBlockId] = (currentItem.blockKey || 'meta:unknown').split(':');
      const isUniversal = Boolean(currentItem.isUniversalElement || currentItem.xpath);
      const displayLabel = isUniversal ? `<${currentItem.tagName || 'element'}>` : (rawBlockId || currentItem.blockId);

      const jumpToCurrent = () => {
        if (pageId && this.currentPageId !== pageId) {
          this.switchPage(pageId);
        }
        setTimeout(() => {
          this.highlightTarget(rawBlockId, currentItem.xpath);
        }, 250);
      };

      // 1. Prev Button
      const prevBtn = makeElement('button', {
        className: 'dr-nav-btn',
        style: { padding: '4px 10px', fontSize: '11px', borderRadius: '16px' },
        title: 'Jump to previous note [Hotkey: []',
        onclick: () => {
          this._currentDockBlockIdx = (this._currentDockBlockIdx - 1 + annotatedTargets.length) % annotatedTargets.length;
          this._renderNotesNavigatorDock(activeNotes);
          const target = annotatedTargets[this._currentDockBlockIdx];
          const [p, b] = (target.blockKey || 'meta:unknown').split(':');
          if (p && this.currentPageId !== p) this.switchPage(p);
          setTimeout(() => this.highlightTarget(b, target.xpath), 250);
        }
      }, '◀');

      // 2. Hardware Status Label (Center Display)
      const labelSpan = makeElement('div', {
        style: {
          color: '#f8fafc', fontWeight: 'bold', fontSize: '11.5px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '320px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        },
        onclick: jumpToCurrent
      }, [
        makeElement('span', {
          style: {
            color: currentItem.isLLM ? '#c084fc' : '#00f2fe',
            background: currentItem.isLLM ? 'rgba(192, 132, 252, 0.18)' : 'rgba(0, 242, 254, 0.18)',
            border: `1px solid ${currentItem.isLLM ? '#c084fc66' : '#00f2fe66'}`,
            padding: '2px 8px', borderRadius: '12px', fontSize: '10.5px', fontFamily: 'var(--dr-font-mono)'
          }
        }, `${this._currentDockBlockIdx + 1}/${annotatedTargets.length}${currentItem.isLLM ? ' 🤖' : ''}`),
        makeElement('span', {
          style: { overflow: 'hidden', textOverflow: 'ellipsis' },
          title: currentItem.xpath || currentItem.text
        }, `${pageId} • ${displayLabel}`)
      ]);

      // 3. Next Button
      const nextBtn = makeElement('button', {
        className: 'dr-nav-btn',
        style: { padding: '4px 10px', fontSize: '11px', borderRadius: '16px' },
        title: 'Jump to next note [Hotkey: ]]',
        onclick: () => {
          this._currentDockBlockIdx = (this._currentDockBlockIdx + 1) % annotatedTargets.length;
          this._renderNotesNavigatorDock(activeNotes);
          const target = annotatedTargets[this._currentDockBlockIdx];
          const [p, b] = (target.blockKey || 'meta:unknown').split(':');
          if (p && this.currentPageId !== p) this.switchPage(p);
          setTimeout(() => this.highlightTarget(b, target.xpath), 250);
        }
      }, '▶');

      // 4. Quick Dictate Button
      const dictateBtn = makeElement('button', {
        className: 'dr-nav-btn',
        style: { padding: '4px 10px', fontSize: '11px', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' },
        onclick: () => {
          const ItemNotes = this.options?.itemNotesClass || globalThis.DocumentItemNotes || globalThis.CadPlanItemNotes;
          if (ItemNotes) {
            let targetEl = null;
            if (currentItem.xpath) {
              try {
                const res = document.evaluate(currentItem.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                if (res.singleNodeValue) targetEl = res.singleNodeValue;
              } catch(e) {}
            }
            ItemNotes.openBlockNotesDialog(pageId, rawBlockId, this.getCurrentDoc(), () => {
              this._updateBlockNoteBadges();
              this._populateSidePanelNotes();
            }, this, { targetElement: targetEl, locator: { key: rawBlockId, xpath: currentItem.xpath } });
          }
        }
      }, '🎙️ Dictate');

      // 5. Compile Spec Button
      const compileBtn = makeElement('button', {
        className: 'dr-nav-btn primary',
        style: { padding: '4px 12px', fontSize: '11px', fontWeight: '800' },
        onclick: () => {
          const ItemNotes = this.options?.itemNotesClass || globalThis.DocumentItemNotes || globalThis.CadPlanItemNotes;
          if (ItemNotes) {
            ItemNotes.openPromptBuilderDialog(this);
          }
        }
      }, '⚡ Compile Spec');

      dock.append(prevBtn, labelSpan, nextBtn, dictateBtn, compileBtn);
    }
  static decorateContainer(container, options = {}) {
    if (!container) return;
    const dossierId = options.dossierId || 'Dossier';
    const pageId = options.pageId || 'main';

    const ItemNotes = options.itemNotesClass || globalThis.DocumentItemNotes || globalThis.CadPlanItemNotes;
    const DocEditor = options.editorClass || globalThis.DocumentEditor || globalThis.CadPlanDocumentEditor;

    const blockEls = container.querySelectorAll('[data-block-id]');
    if (blockEls.length === 0) return;

    const refreshDecorations = async () => {
      let allNotes = [];
      if (ItemNotes && typeof ItemNotes.getAllNotes === 'function') {
        allNotes = await ItemNotes.getAllNotes(dossierId);
      }

      const noteCounts = {};
      const notesByBlock = {};
      allNotes.forEach(n => {
        if (n.status !== 'resolved') {
          noteCounts[n.blockKey] = (noteCounts[n.blockKey] || 0) + 1;
          notesByBlock[n.blockKey] = notesByBlock[n.blockKey] || [];
          notesByBlock[n.blockKey].push(n);
        }
      });

      blockEls.forEach(blockEl => {
        const blockId = blockEl.getAttribute('data-block-id');
        if (!blockId) return;
        const key = `${pageId}:${blockId}`;
        const count = noteCounts[key] || 0;
        const notesList = notesByBlock[key] || [];

        // 1. Apply in-situ text override if active
        if (DocEditor && typeof DocEditor.getOverride === 'function') {
          const override = DocEditor.getOverride(pageId, blockId, dossierId);
          if (override) {
            const textEl = blockEl.querySelector('p, .text-sm, .card-text') || blockEl;
            if (textEl && !textEl.hasAttribute('data-original-text')) {
              textEl.setAttribute('data-original-text', textEl.textContent);
              textEl.textContent = override.text;
            }
          }
        }

        // 2. Ensure Action Gutter Exists
        let gutter = blockEl.querySelector('.dr-universal-gutter');
        if (!gutter) {
          gutter = makeElement('div', {
            className: 'dr-universal-gutter',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '8px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '11px',
              fontFamily: 'monospace'
            }
          });

          // Add Note / Directive Button
          const noteBtn = makeElement('button', {
            className: 'dr-nav-btn',
            style: { padding: '2px 8px', fontSize: '10px', color: '#00f2fe', borderColor: '#00f2fe66' },
            title: 'Attach or dictate directive for this block',
            onclick: (e) => {
              e.stopPropagation();
              if (ItemNotes && typeof ItemNotes.openBlockNotesDialog === 'function') {
                const excerpt = blockEl.textContent.trim().substring(0, 120);
                ItemNotes.openBlockNotesDialog(pageId, blockId, { [blockId]: () => excerpt, name: dossierId }, () => {
                  refreshDecorations();
                }, { options: { dossierId } });
              }
            }
          }, count > 0 ? `📝 ${count}` : '📝 Note');

          // Edit In-Situ Button
          const editBtn = makeElement('button', {
            className: 'dr-nav-btn',
            style: { padding: '2px 8px', fontSize: '10px', color: '#f59e0b', borderColor: '#f59e0b66' },
            title: 'Edit block text in-situ',
            onclick: (e) => {
              e.stopPropagation();
              if (DocEditor && typeof DocEditor.openBlockEditor === 'function') {
                const excerpt = blockEl.textContent.trim();
                DocEditor.openBlockEditor(pageId, blockId, { [blockId]: () => excerpt, name: dossierId }, () => {
                  refreshDecorations();
                });
              }
            }
          }, '✎ Edit');

          // Copy Direct Link
          const linkBtn = makeElement('button', {
            className: 'dr-nav-btn',
            style: { padding: '2px 6px', fontSize: '10px', color: '#94a3b8' },
            title: 'Copy direct anchor link',
            onclick: (e) => {
              e.stopPropagation();
              const url = `${window.location.origin}${window.location.pathname}#/${pageId}/${blockId}`;
              navigator.clipboard.writeText(url).then(() => {
                linkBtn.textContent = '✓';
                setTimeout(() => { linkBtn.textContent = '🔗'; }, 1800);
              });
            }
          }, '🔗');

          gutter.appendChild(noteBtn);
          gutter.appendChild(editBtn);
          gutter.appendChild(linkBtn);
          blockEl.appendChild(gutter);
        } else {
          const noteBtn = gutter.querySelector('button');
          if (noteBtn) {
            noteBtn.textContent = count > 0 ? `📝 ${count}` : '📝 Note';
          }
        }

        // 3. Cyber-cyan left border and banner
        let banner = blockEl.querySelector('.dr-attached-notes-banner');
        if (count > 0) {
          blockEl.style.borderLeft = '3.5px solid #00f2fe';
          blockEl.style.paddingLeft = '14px';

          const latest = notesList[notesList.length - 1];
          const preview = latest.text.length > 60 ? latest.text.substring(0, 60) + '...' : latest.text;

          if (!banner) {
            banner = makeElement('div', {
              className: 'dr-attached-notes-banner',
              style: {
                background: 'rgba(0, 242, 254, 0.08)',
                border: '1px solid rgba(0, 242, 254, 0.25)',
                borderRadius: '6px',
                padding: '6px 12px',
                marginTop: '8px',
                color: '#38bdf8',
                fontSize: '11px',
                fontFamily: 'system-ui, sans-serif',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              },
              onclick: (e) => {
                e.stopPropagation();
                if (ItemNotes && typeof ItemNotes.openBlockNotesDialog === 'function') {
                  const excerpt = blockEl.textContent.trim().substring(0, 120);
                  ItemNotes.openBlockNotesDialog(pageId, blockId, { [blockId]: () => excerpt, name: dossierId }, () => {
                    refreshDecorations();
                  }, { options: { dossierId } });
                }
              }
            }, [
              makeElement('span', {}, `📝 ${count} Directive${count === 1 ? '' : 's'}: "${preview}"`),
              makeElement('span', { style: { fontWeight: 'bold', color: '#00f2fe' } }, 'View & Dictate ➔')
            ]);
            blockEl.insertBefore(banner, gutter);
          } else {
            banner.firstChild.textContent = `📝 ${count} Directive${count === 1 ? '' : 's'}: "${preview}"`;
          }
        } else {
          blockEl.style.borderLeft = '';
          blockEl.style.paddingLeft = '';
          if (banner) banner.remove();
        }
      });

      // 4. Update or render bottom floating navigator dock
      const activeNotes = allNotes.filter(n => n.status !== 'resolved');
      DocumentReader._renderNotesNavigatorDockStatic(activeNotes, dossierId, pageId);
    };

    refreshDecorations();
  }

  static _renderNotesNavigatorDockStatic(activeNotes, dossierId, currentPageId) {
      let dock = document.getElementById('dr-notes-nav-dock');

      if (!activeNotes || activeNotes.length === 0) {
        if (dock) dock.remove();
        return;
      }

      if (!dock) {
        dock = makeElement('div', {
          className: 'dr-notes-navigator-dock',
          id: 'dr-notes-nav-dock',
          style: {
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '10000',
            background: 'rgba(9, 13, 22, 0.96)',
            backdropFilter: 'blur(16px)',
            webkitBackdropFilter: 'blur(16px)',
            border: '1.5px solid #00f2fe',
            borderRadius: '30px',
            padding: '6px 16px',
            boxShadow: '0 14px 45px rgba(0, 0, 0, 0.9), 0 0 24px rgba(0, 242, 254, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '11.5px',
            color: '#f8fafc'
          }
        });
        document.body.appendChild(dock);
      }

      dock.innerHTML = '';

      const annotatedTargets = [];
      const seen = new Set();
      activeNotes.forEach(n => {
        const uniqueKey = n.blockKey || n.xpath || n.id;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          annotatedTargets.push(n);
        }
      });

      if (!this._currentStaticDockIdx || this._currentStaticDockIdx >= annotatedTargets.length) {
        this._currentStaticDockIdx = 0;
      }

      const currentItem = annotatedTargets[this._currentStaticDockIdx];
      const [pageId, rawBlockId] = (currentItem.blockKey || `${currentPageId}:unknown`).split(':');
      const isUniversal = Boolean(currentItem.isUniversalElement || currentItem.xpath);
      const displayLabel = isUniversal ? `<${currentItem.tagName || 'element'}>` : (rawBlockId || currentItem.blockId);

      const jumpToTarget = (bId, pId, xpath) => {
        if (pId && window.location.hash.indexOf(pId) === -1) {
          window.location.hash = `#/${pId}`;
        }
        setTimeout(() => {
          let el = document.querySelector(`[data-block-id="${bId}"]`) ||
                   document.querySelector(`[data-block="${bId}"]`) ||
                   document.getElementById(`block-${bId}`) ||
                   document.getElementById(bId);

          if (!el && xpath) {
            try {
              const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              if (res.singleNodeValue) el = res.singleNodeValue;
            } catch(e) {}
          }

          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.remove('dr-pulse-highlight');
            void el.offsetWidth;
            el.classList.add('dr-pulse-highlight');
          }
        }, 220);
      };

      // 1. Prev Button
      const prevBtn = makeElement('button', {
        className: 'dr-nav-btn',
        style: { padding: '3px 8px', fontSize: '11px' },
        title: 'Jump to previous note',
        onclick: () => {
          this._currentStaticDockIdx = (this._currentStaticDockIdx - 1 + annotatedTargets.length) % annotatedTargets.length;
          const target = annotatedTargets[this._currentStaticDockIdx];
          const [p, b] = (target.blockKey || `${currentPageId}:unknown`).split(':');
          jumpToTarget(b, p, target.xpath);
          DocumentReader._renderNotesNavigatorDockStatic(activeNotes, dossierId, currentPageId);
        }
      }, '◀ Prev');

      // 2. Indicator Label
      const labelSpan = makeElement('div', {
        style: {
          color: '#f8fafc', fontWeight: 'bold', fontSize: '11.5px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '300px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        },
        onclick: () => {
          jumpToTarget(rawBlockId, pageId, currentItem.xpath);
        }
      }, [
        makeElement('span', { style: { color: currentItem.isLLM ? '#c084fc' : '#00f2fe' } },
          `[${this._currentStaticDockIdx + 1}/${annotatedTargets.length}${currentItem.isLLM ? ' 🤖' : ''}]`
        ),
        makeElement('span', { title: currentItem.xpath || currentItem.text }, `${pageId} / ${displayLabel}`)
      ]);

      // 3. Next Button
      const nextBtn = makeElement('button', {
        className: 'dr-nav-btn',
        style: { padding: '3px 8px', fontSize: '11px' },
        title: 'Jump to next note',
        onclick: () => {
          this._currentStaticDockIdx = (this._currentStaticDockIdx + 1) % annotatedTargets.length;
          const target = annotatedTargets[this._currentStaticDockIdx];
          const [p, b] = (target.blockKey || `${currentPageId}:unknown`).split(':');
          jumpToTarget(b, p, target.xpath);
          DocumentReader._renderNotesNavigatorDockStatic(activeNotes, dossierId, currentPageId);
        }
      }, 'Next ▶');

      // 4. Compact Staged Button
      const compactBtn = makeElement('button', {
        className: 'dr-nav-btn',
        style: { padding: '3px 8px', fontSize: '10.5px', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)', fontWeight: 'bold' },
        title: 'Compact all staged notes & proposals into code/text',
        onclick: async () => {
          const ItemNotes = globalThis.DocumentItemNotes || globalThis.CadPlanItemNotes;
          if (ItemNotes && typeof ItemNotes.compactDossier === 'function') {
            const res = await ItemNotes.compactDossier(dossierId);
            alert(`✓ Compacted ${res.compactedCount || 0} staged directives in [${dossierId}].`);
            dock.remove();
          }
        }
      }, '🚀 Compact Staged');

      // 5. Open Directives Deck
      const compileBtn = makeElement('button', {
        className: 'dr-nav-btn primary',
        style: { padding: '3px 10px', fontSize: '11px', fontWeight: 'bold' },
        onclick: () => {
          const ItemNotes = globalThis.DocumentItemNotes || globalThis.CadPlanItemNotes;
          if (ItemNotes && typeof ItemNotes.openPromptBuilderDialog === 'function') {
            ItemNotes.openPromptBuilderDialog({ options: { dossierId } });
          }
        }
      }, `⚡ Compile (${activeNotes.length})`);

      dock.append(prevBtn, labelSpan, nextBtn, compactBtn, compileBtn);
    }

  resolveHtmlBlockContent(pageId, blockId) {
      if (!pageId || !blockId) return null;

      const tpl = document.querySelector(`template[data-file$="${pageId}.html"], template[data-page="${pageId}"]`);
      if (tpl && tpl.content) {
        const match = tpl.content.querySelector(`[data-block="${blockId}"], [data-block-id="${blockId}"]`);
        if (match) {
          return match.innerHTML.trim() || match.textContent.trim();
        }
      }

      if (globalThis._DocumentReaderHtmlCache) {
        return globalThis._DocumentReaderHtmlCache[`${pageId}:${blockId}`] || null;
      }

      return null;
    }
  _openHeaderMoreMenu(triggerBtn) {
      const existing = document.getElementById('dr-header-overflow-menu');
      if (existing) {
        existing.remove();
        return;
      }

      const rect = triggerBtn.getBoundingClientRect();
      const menu = makeElement('div', {
        id: 'dr-header-overflow-menu',
        style: {
          position: 'fixed',
          top: `${rect.bottom + 8}px`,
          right: '16px',
          background: 'rgba(15, 23, 42, 0.98)',
          backdropFilter: 'blur(16px)',
          border: '1.5px solid rgba(0, 242, 254, 0.35)',
          borderRadius: '12px',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          minWidth: '210px',
          zIndex: '10000',
          boxShadow: '0 16px 40px rgba(0,0,0,0.85), 0 0 20px rgba(0,242,254,0.25)',
          fontFamily: 'var(--dr-font-sans)',
          fontSize: '11.5px'
        }
      });

      const makeItem = (label, icon, onClick) => {
        const b = makeElement('button', {
          style: {
            background: 'transparent',
            border: 'none',
            color: '#f8fafc',
            padding: '8px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            textAlign: 'left',
            transition: 'background 0.15s ease'
          },
          onmouseenter: (e) => e.currentTarget.style.background = 'rgba(0, 242, 254, 0.15)',
          onmouseleave: (e) => e.currentTarget.style.background = 'transparent',
          onclick: () => {
            menu.remove();
            onClick();
          }
        }, [
          makeElement('span', { style: { fontSize: '14px' } }, icon),
          makeElement('span', {}, label)
        ]);
        return b;
      };

      menu.appendChild(makeItem('Document Revision Manager', '✏️', () => {
        if (typeof CadPlanDocumentEditor !== 'undefined') {
          CadPlanDocumentEditor.openRevisionManager(() => this.renderCurrentDocument());
        }
      }));

      menu.appendChild(makeItem('Configure & Export Dossier', '📤', () => {
        if (typeof CadPromptBundlerDialog !== 'undefined') {
          CadPromptBundlerDialog.open();
        } else {
          this.showExportDialog();
        }
      }));

      menu.appendChild(makeItem('Toggle Dark/Light Theme', '🌓', () => {
        this.toggleTheme();
      }));

      menu.appendChild(makeItem('Aardvark Note Picker [Ctrl+Shift+A]', '🔍', () => {
        const aardBtn = document.getElementById('btn-toggle-aardvark-inspector');
        if (aardBtn) aardBtn.click();
      }));

      document.body.appendChild(menu);

      const closeListener = (e) => {
        if (!menu.contains(e.target) && e.target !== triggerBtn) {
          menu.remove();
          document.removeEventListener('pointerdown', closeListener);
        }
      };
      setTimeout(() => document.addEventListener('pointerdown', closeListener), 50);
  }

  _renderFormattedBlockText(rawText, isLeadCandidate = false) {
      if (!rawText) return document.createTextNode('');
      const str = String(rawText).trim();

      // Check if the input is already rich HTML markup (from an HTML template)
      if (/<[a-z][\s\S]*>/i.test(str)) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = str;
        const frag = document.createDocumentFragment();
        while (tempDiv.firstChild) {
          frag.appendChild(tempDiv.firstChild);
        }
        return frag;
      }

      // Standard markdown line-by-line fallback for JavaScript string arrays
      const container = document.createDocumentFragment();
      const lines = str.split('\n');

      let currentList = null;
      let listType = null; // 'ul' or 'ol'

      const flushList = () => {
        if (currentList) {
          container.appendChild(currentList);
          currentList = null;
          listType = null;
        }
      };

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          flushList();
          return;
        }

        const bulletMatch = trimmed.match(/^([•\-\*])\s+(.+)$/);
        const numberMatch = trimmed.match(/^(\d+)[\.\)]\s+(.+)$/);

        if (bulletMatch) {
          if (listType !== 'ul') {
            flushList();
            currentList = makeElement('ul', { className: 'dr-content-list dr-list-unordered' });
            listType = 'ul';
          }
          const li = makeElement('li', { className: 'dr-content-list-item' });
          li.appendChild(this._formatInlineTokens(bulletMatch[2]));
          currentList.appendChild(li);
        } else if (numberMatch) {
          if (listType !== 'ol') {
            flushList();
            currentList = makeElement('ol', { className: 'dr-content-list dr-list-ordered' });
            listType = 'ol';
          }
          const li = makeElement('li', { className: 'dr-content-list-item' });
          li.appendChild(this._formatInlineTokens(numberMatch[2]));
          currentList.appendChild(li);
        } else {
          flushList();
          const p = makeElement('p', { className: 'dr-block-p' });
          p.appendChild(this._formatInlineTokens(trimmed));
          container.appendChild(p);
        }
      });

      flushList();
      return container;
  }
  _formatInlineTokens(text) {
      if (!text) return document.createTextNode('');
      const str = String(text);
      const frag = document.createDocumentFragment();

      // Tokenize for code (`...`), bold (**...**), and italic (*...*)
      const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
      const parts = str.split(tokenRegex);

      for (const part of parts) {
        if (!part) continue;

        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          const code = makeElement('code', { className: 'dr-inline-code' }, part.slice(1, -1));
          frag.appendChild(code);
        } else if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          const strong = makeElement('strong', { className: 'dr-inline-strong' }, part.slice(2, -2));
          frag.appendChild(strong);
        } else if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
          const em = makeElement('em', { className: 'dr-inline-em' }, part.slice(1, -1));
          frag.appendChild(em);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      }

      return frag;
    }

  openElementDiscussion(pageId, blockId, targetEl) {
    const dossierId = this.options?.dossierId || this.brandTitle || 'Dossier';
    const anchorThreadId = `thread_${dossierId}_${pageId}_${blockId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    const content = makeElement('div', {
      style: {
        padding: '8px',
        minHeight: '340px',
        maxHeight: '520px',
        overflowY: 'auto',
        background: '#070a13',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }
    });

    let clearTether = null;

    const dlg = UITools.makeDialog({
      title: `💬 In-Situ Discussion [${blockId}]`,
      size: [600, 520],
      position: [Math.max(20, (window.innerWidth - 600) / 2), 60],
      contentElement: content,
      appendTo: document.body,
      onClose: () => {
        if (clearTether) clearTether();
      }
    });

    if (targetEl && globalThis._cadPlanInstance?.aardvark?._drawOuterCornerConnectors) {
      clearTether = globalThis._cadPlanInstance.aardvark._drawOuterCornerConnectors(targetEl, dlg.element);
    }

    if (typeof Comments !== 'undefined') {
      const app = new Comments();
      app.init(content, {
        threadId: anchorThreadId,
        showTitle: false,
        elementAnchor: `${dossierId}:${pageId}:${blockId}`
      });
    } else {
      content.innerHTML = '<div style="padding:20px;text-align:center;color:#00f2fe;font-family:monospace;">⚡ Initializing comments engine...</div>';
      setTimeout(() => {
        if (typeof Comments !== 'undefined') {
          content.innerHTML = '';
          const app = new Comments();
          app.init(content, {
            threadId: anchorThreadId,
            showTitle: false,
            elementAnchor: `${dossierId}:${pageId}:${blockId}`
          });
        } else {
          content.innerHTML = '<div style="padding:20px;color:#ff7b72;font-family:monospace;">Comments engine module not loaded in scope.</div>';
        }
      }, 120);
    }
  }

  _toggleLunoCockpitDrawer() {
        let drawer = document.getElementById('dr-luno-cockpit-drawer');
        const btn = document.getElementById('btn-toggle-luno-cockpit');

        if (drawer) {
          const isOpen = drawer.style.transform === 'translateX(0%)';
          drawer.style.transform = isOpen ? 'translateX(100%)' : 'translateX(0%)';
          if (btn) btn.style.background = isOpen ? 'rgba(130, 87, 229, 0.15)' : '#8257e5';
          return;
        }

        const drawerWidth = 380;
        drawer = makeElement('div', {
          id: 'dr-luno-cockpit-drawer',
          style: {
            position: 'fixed',
            top: '58px',
            right: '0',
            width: `${drawerWidth}px`,
            maxWidth: '90vw',
            height: 'calc(100vh - 58px)',
            background: 'rgba(15, 23, 42, 0.98)',
            borderLeft: '2px solid #00f2fe',
            boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 242, 254, 0.25)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'monospace',
            color: '#f8fafc',
            boxSizing: 'border-box',
            transform: 'translateX(0%)',
            transition: 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
            backdropFilter: 'blur(16px)',
            overflowY: 'auto',
            padding: '14px'
          }
        });

        // Drawer Header
        const dHeader = makeElement('div', {
          style: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingBottom: '10px', borderBottom: '1px solid #232d3f', marginBottom: '12px'
          }
        }, [
          makeElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
            makeElement('span', { style: { fontSize: '16px' } }, '🌙'),
            makeElement('strong', { style: { color: '#00f2fe', fontSize: '13px' } }, 'Luno In-Process Cockpit'),
            makeElement('span', { style: { color: '#10b981', fontSize: '10px', fontWeight: 'bold' } }, '● Zero-Iframe')
          ]),
          makeElement('button', {
            className: 'dr-nav-btn',
            style: { padding: '2px 6px', fontSize: '11px', color: '#ff7b72' },
            onclick: () => this._toggleLunoCockpitDrawer()
          }, '✕')
        ]);
        drawer.appendChild(dHeader);

        // Outbox Deck
        const outboxCard = makeElement('div', {
          style: {
            background: '#070a13', border: '1.5px solid #8257e5', borderRadius: '8px',
            padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px'
          }
        }, [
          makeElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            makeElement('strong', { style: { color: '#d2a8ff', fontSize: '12px' } }, '📦 OUTBOX QUEUE'),
            makeElement('span', { id: 'drawer-outbox-count', style: { color: '#10b981', fontSize: '10px', fontWeight: 'bold' } },
              typeof OutboxQueue !== 'undefined' ? `${OutboxQueue.queue?.length || 0} queued` : 'Ready'
            )
          ]),
          makeElement('div', { style: { display: 'flex', gap: '6px' } }, [
            makeElement('button', {
              className: 'dr-nav-btn primary',
              style: { flex: 1, padding: '6px', fontSize: '11px', fontWeight: 'bold' },
              onclick: () => {
                if (typeof OutboxQueue !== 'undefined' && OutboxQueue.copyPackageToClipboard) {
                  OutboxQueue.copyPackageToClipboard();
                }
              }
            }, '📋 Copy Outbox'),
            makeElement('button', {
              className: 'dr-nav-btn',
              style: { flex: 1, padding: '6px', fontSize: '11px', color: '#d2a8ff', borderColor: '#8257e5' },
              onclick: () => {
                if (typeof OutboxPromptBox !== 'undefined' && OutboxPromptBox.promptWriteNoteModal) {
                  OutboxPromptBox.promptWriteNoteModal('', '');
                }
              }
            }, '✍️ Write Prompt')
          ])
        ]);
        drawer.appendChild(outboxCard);

        // Git Checkpoint & Multi-Project Deployment Deck
        let selectedDeployTarget = this.options?.dossierId || 'CadPlan';

        const checkpointCard = makeElement('div', {
          style: {
            background: '#070a13', border: '1px solid #1e293b', borderRadius: '8px',
            padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px'
          }
        }, [
          makeElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            makeElement('strong', { style: { color: '#10b981', fontSize: '12px' } }, '🚀 1-TAP DEPLOY TO PAGES'),
            deployTargetSelect = makeElement('select', {
              style: {
                background: '#0d1117', color: '#00f2fe', border: '1px solid #30363d',
                borderRadius: '4px', padding: '2px 6px', fontSize: '10.5px', fontFamily: 'monospace', outline: 'none'
              },
              onchange: (e) => {
                selectedDeployTarget = e.target.value;
              }
            }, [
              makeElement('option', { value: 'CadPlan', selected: selectedDeployTarget === 'CadPlan' }, 'CadPlan'),
              makeElement('option', { value: 'Library', selected: selectedDeployTarget === 'Library' }, 'Library (Shared)'),
              makeElement('option', { value: 'accuCad' }, 'accuCad'),
              makeElement('option', { value: 'TouchController' }, 'TouchController')
            ])
          ]),
          noteInput = makeElement('input', {
            type: 'text', placeholder: 'Commit message...',
            style: {
              width: '100%', padding: '6px 8px', background: '#0d1117', color: '#00f2fe',
              border: '1px solid #30363d', borderRadius: '6px', fontSize: '11px', outline: 'none'
            }
          }),
          makeElement('div', { style: { display: 'flex', gap: '6px' } }, [
            makeElement('button', {
              className: 'dr-nav-btn',
              style: { flex: 1, padding: '6px', fontSize: '11px', background: '#238636', color: '#fff', border: 'none', fontWeight: 'bold' },
              onclick: async () => {
                const msg = noteInput.value.trim() || `[${selectedDeployTarget}] Checkpoint & Pages deploy ${new Date().toLocaleTimeString()}`;
                if (typeof LunoDeployEngine !== 'undefined') {
                  const res = await LunoDeployEngine.checkpointTargetProject(selectedDeployTarget, msg, { deployToPages: true });
                  alert(res && res.success ? `✓ Deployed ${selectedDeployTarget} to GitHub Pages!` : `Notice: ${res?.error || 'Recorded'}`);
                  noteInput.value = '';
                } else {
                  alert(`LunoDeployEngine not mounted in scope.`);
                }
              }
            }, '🚀 Deploy Selected'),
            makeElement('button', {
              className: 'dr-nav-btn',
              style: { padding: '6px 10px', fontSize: '11px', color: '#38bdf8', borderColor: '#38bdf866', fontWeight: 'bold' },
              title: 'Deploy Library specifically so GitHub Pages has all shared modules',
              onclick: async () => {
                const msg = `[Library] Deploy shared modules & CommunityOracle ${new Date().toLocaleTimeString()}`;
                if (typeof LunoDeployEngine !== 'undefined') {
                  const res = await LunoDeployEngine.checkpointTargetProject('Library', msg, { deployToPages: true });
                  alert(res && res.success ? '✓ Deployed Library to GitHub Pages!' : `Notice: ${res?.error || 'Recorded'}`);
                }
              }
            }, '📚 Deploy Library')
          ])
        ]);
        let deployTargetSelect, noteInput;
        drawer.appendChild(checkpointCard);

        // Standalone Tabs Links
        const linksRow = makeElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', paddingTop: '8px', borderTop: '1px solid #232d3f' }
        }, [
          makeElement('a', { href: '../Luno/index.html', target: '_blank', style: { color: '#00f2fe', textDecoration: 'none', fontWeight: 'bold' } }, '↗ Open Luno Workspace'),
          makeElement('a', { href: '../accuCad/index.html', target: '_blank', style: { color: '#38bdf8', textDecoration: 'none' } }, '↗ Full accuCad')
        ]);
        drawer.appendChild(linksRow);

        document.body.appendChild(drawer);
        if (btn) btn.style.background = '#8257e5';
    }
  get itemNotes() {
      return this.options.itemNotesClass || globalThis.CadPlanItemNotes || globalThis.DocumentItemNotes || null;
    }

  get documentEditor() {
      return this.options.editorClass || globalThis.CadPlanDocumentEditor || globalThis.DocumentEditor || null;
    }

  _setupScrollSpy() {
    if (this._sectionObserver) {
      this._sectionObserver.disconnect();
      this._sectionObserver = null;
    }

    this._sectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const secTitle = entry.target.querySelector('.dr-section-title')?.textContent || '';
          const secSectionId = entry.target.getAttribute('data-section') || '';

          if (secTitle && this.activeChapterBreadcrumb) {
            const pageObj = this.pages.find(p => p.id === this.currentPageId);
            const chNum = pageObj ? pageObj.title.split('.')[0] : '';
            this.activeChapterBreadcrumb.innerHTML = `<span style="color:var(--cad-cyan);font-weight:800;">${chNum}.</span> ${secTitle}`;
          }

          window.dispatchEvent(new CustomEvent('cadplan-section-visible', {
            detail: {
              pageId: this.currentPageId,
              sectionTitle: secTitle,
              sectionId: secSectionId
            }
          }));
        }
      }
    }, { threshold: 0.15, rootMargin: '-70px 0px -40% 0px' });

    document.querySelectorAll('.dr-section-divider').forEach((el) => {
      this._sectionObserver.observe(el);
    });
  }
}

globalThis.DocumentReader = DocumentReader;
if (typeof module !== 'undefined' && module.exports) module.exports = DocumentReader;