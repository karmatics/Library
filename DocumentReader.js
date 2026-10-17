class DocumentReader {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.brandTitle = options.brandTitle || 'Document Reader';
    this.brandIcon = options.brandIcon || '📖';
    this.pages = options.pages || [];
    this.activeVariants = {};
    this.selectedBlockId = null;
    this.assistantDialog = null;

    // Resolve initial page from options, URL hash, or first item
    const parsed = this._parseUrlRoute();
    const validInitial = (parsed.pageId && this.pages.some((p) => p.id === parsed.pageId)) ? parsed.pageId : (this.pages[0]?.id || 'overview');
    this.currentPageId = validInitial;

    this._setupStyles();
  }

  _setupStyles() {
    if (typeof applyCss !== 'function') return;

    const css = `
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

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
        --dr-font-body: 'Newsreader', 'Lora', Georgia, serif;
        --dr-font-sans: 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif;
        --dr-font-mono: 'JetBrains Mono', monospace;
      }

      body.theme-dark, .theme-dark {
        --dr-bg: #0f141c;
        --dr-surface: #171f2c;
        --dr-text: #e2e8f0;
        --dr-text-subtle: #94a3b8;
        --dr-muted: #64748b;
        --dr-accent: #38bdf8;
        --dr-accent-soft: rgba(56, 189, 248, 0.1);
        --dr-border: #232d3f;
        --dr-card-bg: #161e2b;
        --dr-quote-bg: #161e2b;
        --dr-quote-border: #38bdf8;
        --dr-toolbar-bg: rgba(15, 20, 28, 0.94);
        --dr-toolbar-border: rgba(255, 255, 255, 0.08);
      }

      .dr-shell {
        width: 100%;
        min-height: 100vh;
        background-color: var(--dr-bg);
        color: var(--dr-text);
        font-family: var(--dr-font-body);
        padding: 80px 20px 140px;
        box-sizing: border-box;
        display: flex;
        justify-content: center;
        transition: background-color 0.2s ease, color 0.2s ease;
      }

      .dr-article-container {
        max-width: 760px;
        width: 100%;
        position: relative;
      }

      .dr-nav-bar {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 56px;
        background: var(--dr-toolbar-bg);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border-bottom: 1px solid var(--dr-toolbar-border);
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 16px; box-sizing: border-box; z-index: 1000; gap: 10px;
      }

      .dr-brand {
        font-family: var(--dr-font-sans);
        font-size: 0.88rem; font-weight: 800;
        letter-spacing: 0.04em; text-transform: uppercase;
        color: var(--dr-accent);
        display: flex; align-items: center; gap: 8px;
        flex-shrink: 0; user-select: none; cursor: pointer;
      }

      .dr-nav-carousel {
        display: flex; align-items: center; gap: 4px;
        flex: 1; max-width: calc(100% - 240px); min-width: 0;
      }

      .dr-nav-pages {
        display: flex; align-items: center; gap: 4px;
        background: var(--dr-card-bg);
        padding: 3px 6px; border-radius: 20px;
        border: 1px solid var(--dr-border);
        overflow-x: auto; scrollbar-width: none;
      }
      .dr-nav-pages::-webkit-scrollbar { display: none; }

      .dr-tab-btn {
        background: transparent; border: none;
        color: var(--dr-text-subtle);
        font-family: var(--dr-font-sans);
        font-size: 0.78rem; font-weight: 600;
        padding: 5px 12px; border-radius: 16px;
        cursor: pointer; white-space: nowrap; transition: all 0.15s ease;
      }
      .dr-tab-btn:hover { color: var(--dr-text); background: var(--dr-surface); }
      .dr-tab-btn.active {
        background: var(--dr-accent); color: #fff;
        box-shadow: 0 1px 6px rgba(2, 132, 199, 0.4);
      }

      .dr-nav-btn {
        background: var(--dr-surface); color: var(--dr-text);
        border: 1px solid var(--dr-border);
        padding: 6px 12px; border-radius: 16px;
        font-family: var(--dr-font-sans); font-size: 0.8rem; font-weight: 700;
        cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
      }
      .dr-nav-btn.primary { background: var(--dr-accent); color: #fff; border-color: var(--dr-accent); }

      .dr-progress-track {
        position: fixed; top: 56px; left: 0; width: 100%; height: 3px;
        background: transparent; z-index: 9999;
      }
      .dr-progress-bar {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, #38bdf8, #0284c7);
        transition: width 0.08s ease-out;
      }

      .dr-article-header {
        margin-bottom: 48px; padding-bottom: 28px;
        border-bottom: 2px solid var(--dr-border);
      }
      .dr-kicker {
        font-family: 'Cinzel', serif;
        font-size: 0.8rem; font-weight: 700;
        letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--dr-accent); margin-bottom: 12px;
      }
      .dr-title {
        font-family: var(--dr-font-sans);
        font-size: 2.6rem; font-weight: 800; line-height: 1.18;
        letter-spacing: -0.03em; margin: 0 0 14px 0; color: var(--dr-text);
      }
      .dr-subtitle {
        font-size: 1.25rem; font-style: italic; color: var(--dr-text-subtle);
        line-height: 1.5; margin: 0;
      }

      .dr-section-divider {
        margin: 54px 0 24px 0; padding-top: 28px;
        border-top: 1px solid var(--dr-border);
      }
      .dr-section-part {
        font-family: var(--dr-font-sans); font-size: 0.75rem; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.12em;
        color: var(--dr-accent); margin-bottom: 6px;
      }
      .dr-section-title {
        font-family: var(--dr-font-sans); font-size: 1.65rem; font-weight: 800;
        letter-spacing: -0.02em; color: var(--dr-text); margin: 0 0 20px 0;
      }

      .dr-block-wrapper {
        position: relative; margin: 20px 0; padding: 4px 10px;
        margin-left: -10px; margin-right: -10px; border-radius: 8px;
        transition: background-color 0.15s ease; cursor: pointer;
      }
      .dr-block-wrapper:hover { background: var(--dr-accent-soft); }
      .dr-block-wrapper.block-selected {
        background: var(--dr-accent-soft);
        box-shadow: inset 3px 0 0 var(--dr-accent);
      }

      .dr-block-p {
        font-size: 1.22rem; line-height: 1.85; margin: 0; color: var(--dr-text);
      }

      .dr-block-quote {
        margin: 28px 0; padding: 18px 24px;
        border-left: 3px solid var(--dr-quote-border);
        font-style: italic; font-size: 1.35rem; line-height: 1.55;
        color: var(--dr-text); background: var(--dr-quote-bg);
        border-radius: 0 8px 8px 0;
      }

      .dr-block-sidebar {
        margin: 28px 0; padding: 18px 22px;
        background: var(--dr-card-bg);
        border-left: 4px solid var(--dr-accent);
        border-top: 1px solid var(--dr-border);
        border-right: 1px solid var(--dr-border);
        border-bottom: 1px solid var(--dr-border);
        border-radius: 0 10px 10px 0;
      }
      .dr-sidebar-kicker {
        font-family: var(--dr-font-sans); font-size: 0.74rem; font-weight: 800;
        letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--dr-accent); margin-bottom: 6px;
      }
      .dr-sidebar-title {
        font-family: var(--dr-font-sans); font-size: 1.15rem; font-weight: 700;
        color: var(--dr-text); margin-bottom: 8px;
      }
      .dr-sidebar-body {
        font-size: 1.1rem; line-height: 1.7; color: var(--dr-text-subtle);
      }

      .dr-gutter-controls {
        position: absolute; top: 4px; right: -46px;
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        opacity: 0.25; transition: opacity 0.15s ease; user-select: none;
      }
      .dr-block-wrapper:hover .dr-gutter-controls,
      .dr-block-wrapper.block-selected .dr-gutter-controls {
        opacity: 1;
      }

      .dr-gutter-btn {
        width: 22px; height: 22px; padding: 0;
        display: flex; align-items: center; justify-content: center;
        border-radius: 5px; background: var(--dr-surface);
        border: 1px solid var(--dr-border); color: var(--dr-muted);
        font-size: 0.7rem; cursor: pointer; transition: all 0.12s ease;
      }
      .dr-gutter-btn:hover {
        background: var(--dr-accent); border-color: var(--dr-accent); color: #fff;
        transform: scale(1.12);
      }

      .dr-gutter-badge {
        width: 20px; height: 20px; border-radius: 50%;
        background: var(--dr-card-bg); color: var(--dr-muted);
        font-family: var(--dr-font-sans); font-size: 0.65rem; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        border: 1px solid transparent; cursor: pointer;
      }
      .dr-gutter-badge.active { background: var(--dr-accent); color: #fff; }

      .dr-pulse-highlight {
        animation: dr-target-pulse 2.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards !important;
      }
      @keyframes dr-target-pulse {
        0% { box-shadow: 0 0 0 3px #f59e0b, 0 0 20px rgba(245, 158, 11, 0.6); }
        50% { box-shadow: 0 0 0 2px #38bdf8, 0 0 12px rgba(56, 189, 248, 0.4); }
        100% { box-shadow: none; }
      }
    `;

    applyCss(css, 'DocumentReaderStyles');
  }

  async init() {
      this.container.innerHTML = '';

      // Guarantee document scrolling is never blocked by parent container styles
      document.documentElement.style.overflowY = 'auto';
      document.body.style.overflowY = 'auto';
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';

      if (this.container && this.container.style) {
        this.container.style.overflowY = 'auto';
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

      const parsed = this._parseUrlRoute();
      if (parsed.anchorId) {
        setTimeout(() => this.highlightTarget(parsed.anchorId), 300);
      }
    }
  _renderChrome() {
    // 1. Navigation Toolbar
    this.navPageButtons = {};
    const tabButtons = this.pages.map((p) => {
      const btn = makeElement('button', {
        className: `dr-tab-btn ${this.currentPageId === p.id ? 'active' : ''}`,
        onclick: () => this.switchPage(p.id)
      }, p.title);
      this.navPageButtons[p.id] = btn;
      return btn;
    });

    const pageTabsWrap = makeElement('div', { className: 'dr-nav-pages' }, tabButtons);
    const navCarousel = makeElement('div', { className: 'dr-nav-carousel' }, [pageTabsWrap]);

    this.navBar = makeElement('nav', { className: 'dr-nav-bar' }, [
      makeElement('div', {
        className: 'dr-brand',
        onclick: () => this.switchPage(this.pages[0]?.id)
      }, [
        makeElement('span', {}, this.brandIcon),
        makeElement('span', {}, this.brandTitle)
      ]),
      navCarousel,
      makeElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
        makeElement('button', {
          className: 'dr-nav-btn',
          title: 'Toggle Light/Dark Theme',
          onclick: () => this.toggleTheme()
        }, '🌓'),
        makeElement('button', {
          className: 'dr-nav-btn primary',
          title: 'Export Document (Markdown & Formatted Text)',
          onclick: () => this.showExportDialog()
        }, '📤 Export')
      ])
    ]);
    document.body.appendChild(this.navBar);

    // 2. Reading Progress Track
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

    // 3. Document Shell
    this.shell = makeElement('div', { className: 'dr-shell' });
    this.articleContainer = makeElement('div', { className: 'dr-article-container' });
    this.shell.appendChild(this.articleContainer);
    this.container.appendChild(this.shell);
  }

  getCurrentDoc() {
    const pageCfg = this.pages.find((p) => p.id === this.currentPageId) || this.pages[0];
    return pageCfg?.docClass ? pageCfg.docClass() : null;
  }

  renderCurrentDocument() {
    this.articleContainer.innerHTML = '';
    const doc = this.getCurrentDoc();
    if (!doc) {
      this.articleContainer.innerHTML = '<div style="padding:2rem;text-align:center;">No document content found.</div>';
      return;
    }

    const meta = doc.getMeta ? doc.getMeta() : { kicker: 'Dossier', title: 'Document', subtitle: '' };
    const manifest = doc.manifest ? doc.manifest() : [];

    // Header
    const header = makeElement('header', { className: 'dr-article-header' }, [
      meta.kicker ? makeElement('div', { className: 'dr-kicker' }, meta.kicker) : null,
      makeElement('h1', { className: 'dr-title' }, meta.title),
      meta.subtitle ? makeElement('p', { className: 'dr-subtitle' }, meta.subtitle) : null
    ]);
    this.articleContainer.appendChild(header);

    // Sections
    manifest.forEach((sec) => {
      const secWrap = makeElement('section', { className: 'dr-section-divider' });
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
  }

  _renderBlock(blockDef, doc) {
      const blockId = blockDef.id;

      // 1. Interactive Custom Component Block (e.g. AccuDraw 3D demo, Curve demo)
      if (blockDef.type === 'component') {
        const mountId = `comp-mount-${blockId}`;
        const wrapper = makeElement('div', {
          className: 'dr-component-mount-wrap',
          id: mountId,
          style: { margin: '28px 0', width: '100%' }
        });

        const compClass = globalThis[blockDef.component];
        if (compClass && typeof compClass.render === 'function') {
          setTimeout(() => {
            const el = document.getElementById(mountId);
            if (el) compClass.render(el);
          }, 0);
        }
        return wrapper;
      }

      // 2. Video Player & Media Container Block
      if (blockDef.type === 'video') {
        const vidWrap = makeElement('div', {
          className: 'dr-video-block-wrap',
          id: `block-${blockId}`,
          style: {
            margin: '28px 0',
            background: 'var(--dr-card-bg)',
            border: '1px solid var(--dr-border)',
            borderRadius: '12px',
            overflow: 'hidden',
            padding: '12px'
          }
        });

        if (blockDef.title) {
          vidWrap.appendChild(makeElement('div', {
            style: {
              fontFamily: 'var(--dr-font-sans)',
              fontSize: '0.88rem',
              fontWeight: '700',
              color: 'var(--dr-accent)',
              marginBottom: '8px'
            }
          }, blockDef.title));
        }

        if (blockDef.url) {
          if (blockDef.url.endsWith('.mp4') || blockDef.url.endsWith('.webm')) {
            const vid = makeElement('video', {
              src: blockDef.url,
              controls: true,
              style: { width: '100%', borderRadius: '8px', display: 'block' }
            });
            vidWrap.appendChild(vid);
          } else {
            const iframe = makeElement('iframe', {
              src: blockDef.url,
              style: { width: '100%', height: '380px', border: 'none', borderRadius: '8px' },
              allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
            });
            vidWrap.appendChild(iframe);
          }
        } else {
          vidWrap.appendChild(makeElement('div', {
            style: {
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--dr-muted)',
              fontStyle: 'italic',
              fontSize: '0.82rem',
              background: 'var(--dr-surface)',
              borderRadius: '8px'
            }
          }, `📹 Video Demo Placeholder: ${blockDef.caption || blockId}`));
        }

        if (blockDef.caption) {
          vidWrap.appendChild(makeElement('p', {
            style: { fontSize: '0.78rem', color: 'var(--dr-text-subtle)', margin: '8px 0 0 0', fontStyle: 'italic' }
          }, blockDef.caption));
        }

        return vidWrap;
      }

      // 3. Copyable Markdown Prompt Payload Box
      if (blockDef.type === 'markdown-box') {
        const rawMarkdown = typeof doc.getMasterMarkdown === 'function' ? doc.getMasterMarkdown() : '';
        const boxWrapper = makeElement('div', {
          className: 'dr-markdown-prompt-container',
          id: `block-${blockId}`,
          style: {
            background: 'var(--dr-card-bg)',
            border: '1.5px solid var(--dr-border)',
            borderRadius: '12px',
            padding: '16px',
            margin: '24px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }
        });

        const topBar = makeElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }
        }, [
          makeElement('strong', {
            style: { fontSize: '0.85rem', color: 'var(--dr-accent)', fontFamily: 'var(--dr-font-sans)', textTransform: 'uppercase' }
          }, blockDef.title || 'Master Prompt Payload'),
          makeElement('button', {
            className: 'dr-nav-btn primary',
            style: { padding: '6px 14px', fontSize: '0.78rem' },
            onclick: (e) => {
              const btn = e.currentTarget;
              navigator.clipboard.writeText(rawMarkdown).then(() => {
                btn.textContent = '✓ Copied Payload!';
                setTimeout(() => { btn.textContent = '📋 Copy Master Prompt'; }, 2200);
              });
            }
          }, '📋 Copy Master Prompt')
        ]);

        const codeArea = makeElement('textarea', {
          style: {
            width: '100%', minHeight: '260px', background: 'var(--dr-surface)',
            color: 'var(--dr-text)', border: '1px solid var(--dr-border)',
            borderRadius: '8px', padding: '12px', fontFamily: 'var(--dr-font-mono)',
            fontSize: '12px', lineHeight: '1.5', resize: 'vertical', outline: 'none'
          },
          readonly: true,
          spellcheck: false
        });
        codeArea.value = rawMarkdown;

        boxWrapper.appendChild(topBar);
        boxWrapper.appendChild(codeArea);
        return boxWrapper;
      }

      // 4. Sidebar Callouts
      if (blockDef.type === 'sidebar') {
        const variants = (typeof doc[blockId] === 'function') ? doc[blockId]() : ['[Content missing]'];
        const vKey = `${this.currentPageId}:${blockId}`;
        const curIdx = this.activeVariants[vKey] || 0;
        const text = variants[curIdx] || variants[0];

        return makeElement('aside', {
          className: 'dr-block-sidebar',
          id: `block-${blockId}`,
          'data-block-id': blockId
        }, [
          blockDef.kicker ? makeElement('div', { className: 'dr-sidebar-kicker' }, blockDef.kicker) : null,
          blockDef.title ? makeElement('div', { className: 'dr-sidebar-title' }, blockDef.title) : null,
          makeElement('div', { className: 'dr-sidebar-body' }, this._formatText(text))
        ]);
      }

      // 5. Blockquotes
      if (blockDef.type === 'quote') {
        const variants = (typeof doc[blockId] === 'function') ? doc[blockId]() : ['[Content missing]'];
        const text = variants[0] || '';
        return makeElement('blockquote', {
          className: 'dr-block-quote',
          id: `block-${blockId}`,
          'data-block-id': blockId
        }, this._formatText(text));
      }

      // 6. Default: Paragraph block
      const variants = (typeof doc[blockId] === 'function') ? doc[blockId]() : ['[Content missing]'];
      const vKey = `${this.currentPageId}:${blockId}`;
      const curIdx = this.activeVariants[vKey] || 0;
      const text = variants[curIdx] || variants[0];

      const wrapper = makeElement('div', {
        className: `dr-block-wrapper ${this.selectedBlockId === blockId ? 'block-selected' : ''}`,
        id: `block-${blockId}`,
        'data-block-id': blockId,
        onclick: () => this.selectBlock(blockId, true)
      });

      const pEl = makeElement('p', { className: 'dr-block-p' }, this._formatText(text));
      wrapper.appendChild(pEl);

      // Gutter Controls
      const gutter = makeElement('div', { className: 'dr-gutter-controls' });

      if (variants.length > 1) {
        variants.forEach((_, i) => {
          gutter.appendChild(makeElement('button', {
            className: `dr-gutter-badge ${i === curIdx ? 'active' : ''}`,
            title: `Switch to variant ${i + 1}`,
            onclick: (e) => {
              e.stopPropagation();
              this.activeVariants[vKey] = i;
              this.renderCurrentDocument();
            }
          }, String(i + 1)));
        });
      }

      gutter.appendChild(makeElement('button', {
        className: 'dr-gutter-btn',
        title: 'Copy direct anchor link',
        onclick: (e) => {
          e.stopPropagation();
          this.copyAnchorLink(this.currentPageId, blockId, e.currentTarget);
        }
      }, '🔗'));

      gutter.appendChild(makeElement('button', {
        className: 'dr-gutter-btn',
        title: 'Open AI Assistant / Method Editor',
        onclick: (e) => {
          e.stopPropagation();
          this.selectBlock(blockId, true);
        }
      }, '✎'));

      wrapper.appendChild(gutter);
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
    if (this.currentPageId === pageId) return;
    this.currentPageId = pageId;

    if (updateUrl && window.history && window.history.pushState) {
      window.history.pushState(null, '', `#${pageId}`);
    }

    if (this.navPageButtons) {
      Object.entries(this.navPageButtons).forEach(([id, btn]) => {
        btn.classList.toggle('active', id === pageId);
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.renderCurrentDocument();
  }

  toggleTheme() {
    const isDark = document.body.classList.toggle('theme-dark');
    localStorage.setItem('dr_theme', isDark ? 'dark' : 'light');
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

  highlightTarget(targetId) {
    const clean = targetId.replace(/^#/, '');
    const el = document.getElementById(`block-${clean}`) || document.getElementById(clean);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('dr-pulse-highlight');
      void el.offsetWidth;
      el.classList.add('dr-pulse-highlight');
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
    navigator.clipboard.writeText(fullMd);
    alert('Exported full document dossier across all chapters to clipboard as Markdown!');
  }

  destroy() {
    if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler);
    if (this._routeHandler) {
      window.removeEventListener('hashchange', this._routeHandler);
      window.removeEventListener('popstate', this._routeHandler);
    }
    if (this.navBar) this.navBar.remove();
    if (this.progressTrack) this.progressTrack.remove();
    if (this.assistantDialog && typeof this.assistantDialog.close === 'function') {
      this.assistantDialog.close();
    }
  }
}

globalThis.DocumentReader = DocumentReader;
if (typeof module !== 'undefined' && module.exports) module.exports = DocumentReader;