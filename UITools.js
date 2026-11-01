class UITools {
  static _getState() {
    if (!this.hasOwnProperty('_state')) {
      Object.defineProperty(this, '_state', {
        value: {
          all: [],
          z: 100000,
          svgOverlay: null,
          iframeCovers: [],
          safe: { top: 0, bottom: 0, left: 0, right: 0 },
          globalsInit: false,
          styled: false,
          activeCount: 0,
          wheelLockedWidget: null,
        },
        writable: true,
        configurable: true,
      });
    }
    return this._state;
  }

  static get allWidgets() {
    return UITools._getState().all;
  }

  static get activeCount() {
    return UITools._getState().activeCount;
  }

  static get safeArea() {
    return UITools._getState().safe;
  }

  static makeDialog(options = {}) {
    if (typeof globalThis.DialogBox === 'undefined') {
      globalThis.DialogBox = class DialogBox {
        constructor(opts) {
          return UITools.makeDialog(opts);
        }
      };
      if (typeof window !== 'undefined') window.DialogBox = globalThis.DialogBox;
    }
    return new UITools({ ...options, _uiMode: 'dialog' });
  }

  static setSafeArea(padding = {}) {
    UITools._getState().safe = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      ...padding,
    };
    UITools._getState().all.forEach((w) => {
      if (w._maximized) {
        w.maximize(true);
      } else if (w.element) {
        w._softClamp();
      }
    });
  }

  static _initGlobalListeners() {
    if (UITools._getState().globalsInit) return;
    UITools._getState().globalsInit = true;

    // Window Resize Handler: Resizes all maximized dialogs and keeps floating dialogs on-screen
    window.addEventListener('resize', () => {
      if (typeof SidePanel !== 'undefined' && typeof SidePanel.updateGlobalSafeArea === 'function') {
        SidePanel.updateGlobalSafeArea();
      }

      UITools._getState().all.forEach((w) => {
        if (w._maximized) {
          w.maximize(true);
        } else if (w.element) {
          w._softClamp();
        }
        if (w.callback) {
          w.triggerCallback();
        }
      });
    });

    window.addEventListener(
      'wheel',
      (e) => {
        const w = UITools._getState().wheelLockedWidget;
        if (!w || document.activeElement?.tagName === 'TEXTAREA') return;

        const isOverWidget = Boolean(
          (w._dockedEl && w._dockedEl.contains(e.target)) ||
          (w._floatEl && w._floatEl.contains(e.target))
        );

        if (!isOverWidget) {
          UITools._setWheelLock(null);
          return;
        }

        if (w.options.type === 'slider') {
          e.preventDefault();
          const step = w.options.step || 0.01;
          w._value = Math.max(
            w.options.min,
            Math.min(
              w.options.max,
              w._value + -Math.sign(e.deltaY) * step * 3
            )
          );
          w._syncControls();
          w.options.onChange?.(w._value, w);
          w._flashAccent();
        }
      },
      { passive: false }
    );

    window.addEventListener('mousedown', (e) => {
      if (
        UITools._getState().wheelLockedWidget &&
        !e.target.closest('.uw-wheel-locked, .uw-w-docked, .uw-float')
      ) {
        UITools._setWheelLock(null);
      }
    });
  }

  constructor(rawOpts = {}) {
    this._id = 'uw' + Math.random().toString(36).slice(2, 9);
    this._mode = rawOpts._uiMode || 'dialog';

    const defaults = {
      title: this._mode === 'widget' ? 'Widget' : 'Dialog',
      color: [100, 180, 255],
      position: null,
      stateId: null,
      parent: null,
      compact: false,
      onClose: null,
      onMove: null,
      onResize: null,
      onGeometryChange: null,
      content: null,
      contentElement: null,
      contentHTML: null,
      customHeaderControls: null,
      buttons: [],
      width: '520px',
      height: 'auto',
      minWidth: 160,
      minHeight: 80,
      allowMaximize: true,
      allowMinimize: true,
      allowTransparency: false,
      noPadding: false,
      titleBarAtBottom: false,
      transparent: false,
      size: null,
      env: null,
      appendTo: null,
    };

    this.options = { ...defaults, ...rawOpts };
    this.env = this.options.env || null;
    this.container = this.env?.container || this.options.appendTo || document.body;

    if (Array.isArray(this.options.size)) {
      const [w, h] = this.options.size;
      if (w != null) this.options.width = typeof w === 'number' ? `${w}px` : String(w);
      if (h != null) this.options.height = typeof h === 'number' ? `${h}px` : String(h);
    }

    if (this.options.contentElement) this.options.content = this.options.contentElement;
    if (this.options.contentHTML) this.options.content = UITools._el('div', { innerHTML: this.options.contentHTML });

    this.callback = this.options.onGeometryChange;
    this._maximized = false;
    this._minimized = false;
    this._floating = false;
    this._preMaxSt = null;
    this._unmaximizedBounds = null;
    this._restored = false;

    this.element = null;
    this.header = null;
    this.contentElement = null;
    this.footer = null;
    this._sizers = [];

    UITools._getState().all.push(this);
    UITools._applyStyles();
    UITools._initGlobalListeners();
    this._build();
  }

  _getEffectiveSafeArea() {
    const s = { ...UITools._getState().safe };
    let lPanel = null;
    let rPanel = null;
    if (typeof SidePanel !== 'undefined' && typeof SidePanel.getInstances === 'function') {
      const instances = SidePanel.getInstances();
      if (instances) {
        lPanel = instances.left;
        rPanel = instances.right;
      }
    }
    if (lPanel && lPanel.element && lPanel.isOpen && this.element && this.element.contains(lPanel.element)) {
      s.left = 0;
    }
    if (rPanel && rPanel.element && rPanel.isOpen && this.element && this.element.contains(rPanel.element)) {
      s.right = 0;
    }
    return s;
  }

  _build() {
    const o = this.options;
    const compact = o.compact;

    const btnNodes = [];
    if (o.allowTransparency) btnNodes.push(this._utilBtn('◑', 'Transparency', () => this.toggleTransparency()));
    if (o.allowMinimize) btnNodes.push(this._utilBtn('▁', 'Minimize', () => this.toggleMinimize()));
    if (o.allowMaximize) btnNodes.push(this._utilBtn('⊙', 'Maximize', () => this.toggleMaximize()));
    btnNodes.push(this._closeBtn());

    const ctrls = UITools._el('div', { className: 'uw-controls' }, btnNodes);
    const headerChildren = [];
    if (!compact) headerChildren.push(UITools._el('div', { className: 'uw-swipe-hint' }));
    headerChildren.push(UITools._el('span', { className: 'uw-title' }, o.title));

    if (o.customHeaderControls) headerChildren.push(o.customHeaderControls);
    headerChildren.push(ctrls);

    this.header = UITools._el('div', { className: `uw-header${compact ? ' uw-header-compact' : ''}` }, headerChildren);

    if (o.contentElement) {
      this.contentElement = o.contentElement;
      while (this.contentElement.attributes.length > 0) {
        this.contentElement.removeAttribute(this.contentElement.attributes[0].name);
      }
    } else {
      this.contentElement = document.createElement('div');
      if (o.content instanceof Node) this.contentElement.appendChild(o.content);
      else if (typeof o.content === 'string') this.contentElement.innerHTML = o.content;
    }

    this.contentElement.className = 'uw-content';
    if (o.noPadding) this.contentElement.style.padding = '0';

    this._sizers = this._makeCorners();
    this.element = document.createElement('div');
    this.element.className = 'uw-dialog';
    if (o.transparent) this.element.classList.add('uw-transparent');
    if (compact) this.element.classList.add('uw-dialog-compact');

    this.container = (o.constrainToContainer && o.appendTo) ? o.appendTo : document.body;

    this.element.appendChild(this.header);
    this.element.appendChild(this.contentElement);
    this._sizers.forEach(sizer => this.element.appendChild(sizer));

    if (o.buttons && o.buttons.length > 0) this._buildFooter();
    if (this.footer) this.element.appendChild(this.footer);

    this.element.addEventListener('mousedown', () => this.bringToFront(), { capture: true, passive: true });
    this.element.addEventListener('touchstart', () => this.bringToFront(), { capture: true, passive: true });

    this._setZ();
    this._restoreState();

    if (!this._restored) {
      this.element.style.width = o.width;
      this.element.style.height = o.height;
      if (o.position) {
        this.element.style.left = `${o.position[0]}px`;
        this.element.style.top = `${o.position[1]}px`;
      } else {
        this._smartDialogPos();
      }
    }

    this._listenDragDialog();
    this._listenResizeDialog();
    UITools._getState().activeCount++;

    this.container.appendChild(this.element);
    this.element.style.position = (o.constrainToContainer && this.container !== document.body) ? 'absolute' : 'fixed';

    this._softClamp();
    if (this.callback) this.triggerCallback();
  }

  maximize(force = false) {
    if (this._maximized && !force) return;
    if (!this._maximized) {
      this._preMaxSt = this.element.getAttribute('style');
      const r = this.element.getBoundingClientRect();
      this._unmaximizedBounds = {
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
      };
    }
    this._maximized = true;
    this.element.classList.add('uw-maximized');
    const s = this._getEffectiveSafeArea();

    const parent = this.container;
    const isBody = parent === document.body && !this.env;
    const pW = isBody ? window.innerWidth : parent.clientWidth;
    const pH = isBody ? window.innerHeight : parent.clientHeight;

    const targetW = pW - s.left - s.right;
    const targetH = pH - s.top - s.bottom;

    Object.assign(this.element.style, {
      top: `${s.top}px`,
      left: `${s.left}px`,
      transform: 'none',
      width: `${targetW}px`,
      height: `${targetH}px`,
    });
    this._saveState();

    if (typeof this.options.onResize === 'function') {
      this.options.onResize(targetW, targetH);
    }
    if (this.callback) this.triggerCallback();
  }

  restore() {
    if (this._isSnapped) {
      this._isSnapped = false;
      this.element.classList.remove('uw-snapped');
    }
    const wasMini = this._minimized;
    this._maximized = this._minimized = false;
    this.element.classList.remove('uw-maximized', 'uw-minimized');

    if (wasMini && this._preMinPos) {
      this.element.style.transition = 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      this.element.style.left = this._preMinPos.left;
      this.element.style.top = this._preMinPos.top;
      this.element.style.width = this._preMinPos.width;
      if (this._preMinH) this.element.style.height = this._preMinH;

      setTimeout(() => {
        this.element.style.transition = '';
      }, 400);
    } else {
      if (this._preMaxSt != null) {
        this.element.setAttribute('style', this._preMaxSt);
        this._preMaxSt = null;
      } else if (this._unmaximizedBounds) {
        Object.assign(this.element.style, {
          left: `${this._unmaximizedBounds.x}px`,
          top: `${this._unmaximizedBounds.y}px`,
          width: `${this._unmaximizedBounds.w}px`,
          height: `${this._unmaximizedBounds.h}px`,
          transform: 'none',
        });
      }
    }

    this.element.style.overflow = '';
    this._softClamp();
    this._saveState();

    const r = this.element.getBoundingClientRect();
    const cr = this.contentElement?.getBoundingClientRect() ?? r;
    if (typeof this.options.onResize === 'function') {
      this.options.onResize(cr.width, cr.height);
    }
    if (this.callback) this.triggerCallback();
  }

  toggleMaximize() {
    this._maximized ? this.restore() : this.maximize();
  }

  toggleMinimize() {
    if (this._minimized) {
      this.restore();
      return;
    }
    if (!this._preMaxSt) this._preMaxSt = this.element.getAttribute('style');
    this._preMinH = this.element.style.height || '';
    this._preMinPos = {
      left: this.element.style.left,
      top: this.element.style.top,
      width: this.element.style.width,
    };

    this._minimized = true;
    this.element.classList.add('uw-minimized');

    const h = this.header.getBoundingClientRect().height;
    this.element.style.overflow = 'hidden';
    this.element.style.transition = 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
    this.element.style.height = `${h}px`;
    this.element.style.width = '220px';

    const s = this._getEffectiveSafeArea();
    this.element.style.left = `${s.left + 20}px`;
    this.element.style.top = `${window.innerHeight - h - 10}px`;

    setTimeout(() => {
      this.element.style.transition = '';
    }, 400);
  }

  toggleTransparency() {
    this.element.classList.toggle('uw-transparent');
  }

  setTitle(t) {
    this.options.title = t;
    const el = this.header?.querySelector('.uw-title');
    if (el) el.textContent = t;
  }

  bringToFront() {
    this._setZ();
  }

  setZOnTop() {
    this._setZ();
  }

  close() {
    if (this.element) {
      this.element.style.transition = 'opacity .2s, transform .2s';
      this.element.style.opacity = '0';
      this.element.style.transform = 'scale(0.96)';
    }
    const done = () => {
      this.element?.remove();
      UITools._getState().all = UITools._getState().all.filter((w) => w !== this);
      UITools._getState().activeCount = Math.max(0, UITools._getState().activeCount - 1);
      this.options.onClose?.();
    };
    this.element?.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 250);
  }

  triggerCallback() {
    if (!this.callback || !this.element) return;
    const r = this.element.getBoundingClientRect();
    const cr = this.contentElement?.getBoundingClientRect() ?? r;
    this.callback(this, { outer: r, inner: cr });
  }

  _saveState() {
    if (!this.options.stateId || !this.element) return;
    const r = this.element.getBoundingClientRect();

    if (!this._maximized) {
      this._unmaximizedBounds = {
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
      };
    }

    try {
      localStorage.setItem(
        `uw_${this.options.stateId}`,
        JSON.stringify({
          x: this._unmaximizedBounds ? this._unmaximizedBounds.x : r.left,
          y: this._unmaximizedBounds ? this._unmaximizedBounds.y : r.top,
          w: this._unmaximizedBounds ? this._unmaximizedBounds.w : r.width,
          h: this._unmaximizedBounds ? this._unmaximizedBounds.h : r.height,
          max: !!this._maximized,
        })
      );
    } catch (_) {}
  }

  _restoreState() {
    if (!this.options.stateId) return;
    try {
      const raw = localStorage.getItem(`uw_${this.options.stateId}`);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.w < 50) return;

      this._unmaximizedBounds = { x: s.x, y: s.y, w: s.w, h: s.h };

      Object.assign(this.element.style, {
        left: `${s.x}px`,
        top: `${s.y}px`,
        width: `${s.w}px`,
        transform: 'none',
      });
      if (s.h > 50 && this.options.height !== 'auto') {
        this.element.style.height = `${s.h}px`;
      }

      this._restored = true;
      if (s.max) {
        setTimeout(() => this.maximize(true), 0);
      }
    } catch (_) {}
  }

  _softClamp() {
    if (this._maximized || !this.element) return;
    const r = this.element.getBoundingClientRect(), vis = 48;
    const s = this._getEffectiveSafeArea();

    const parent = this.container;
    const isBody = (parent === document.body || !parent || this.element.style.position === 'fixed');
    const pRect = isBody
      ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight }
      : parent.getBoundingClientRect();

    let x = parseFloat(this.element.style.left) || 0,
        y = parseFloat(this.element.style.top) || 0,
        changed = false;

    const minTop = (isBody ? 0 : pRect.top) + s.top + 4;
    if (r.top < minTop) {
      y = minTop;
      changed = true;
    }

    if (r.height > pRect.height) {
      this.element.style.maxHeight = `${pRect.height - s.top - s.bottom - 8}px`;
      changed = true;
    }

    if (r.right < (isBody ? 0 : pRect.left) + s.left + vis) {
      x = s.left + vis - r.width;
      changed = true;
    }
    if (r.left > (isBody ? window.innerWidth : pRect.right) - s.right - vis) {
      x = (isBody ? window.innerWidth : pRect.width) - s.right - vis;
      changed = true;
    }
    if (r.bottom < (isBody ? 0 : pRect.top) + s.top + vis) {
      y = s.top + vis - r.height;
      changed = true;
    }
    if (r.top > (isBody ? window.innerHeight : pRect.bottom) - s.bottom - vis) {
      y = (isBody ? window.innerHeight : pRect.height) - s.bottom - vis;
      changed = true;
    }
    if (changed) {
      this.element.style.left = `${x}px`;
      this.element.style.top = `${y}px`;
    }
  }

  _smartDialogPos() {
    const dialogs = UITools._getState().all.filter((w) => w._mode === 'dialog').length - 1;
    const s = this._getEffectiveSafeArea();
    const off = (dialogs % 10) * 26;
    Object.assign(this.element.style, {
      left: `${s.left + 40 + off}px`,
      top: `${s.top + 60 + off}px`,
      transform: 'none',
    });
  }

  _setZ() {
    if (this.options.stateId === 'yt_main_player_dialog') {
      if (this.element) this.element.style.zIndex = 5000;
      return;
    }
    const z = ++UITools._getState().z;
    if (this.element) this.element.style.zIndex = z;
  }

  _utilBtn(icon, title, fn) {
    const b = UITools._el('button', { className: 'uw-util-btn', title }, icon);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  }

  _closeBtn() {
    const svg = UITools._el(
      'svg:svg',
      { viewBox: '0 0 14 14', width: '12', height: '12', style: { pointerEvents: 'none' } },
      UITools._el('svg:path', { d: 'M1 1 L13 13', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' }),
      UITools._el('svg:path', { d: 'M13 1 L1 13', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' })
    );
    const b = UITools._el('button', { className: 'uw-close-btn', title: 'Close' }, svg);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    return b;
  }

  _buildFooter() {
    const buttons = this.options.buttons.map((cfg) => {
      const b = UITools._el('button', { className: `uw-btn ${cfg.className || ''}` }, cfg.label || 'OK');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cfg.onClick?.(e.currentTarget, this) !== false) this.close();
      });
      return b;
    });
    this.footer = UITools._el('div', { className: 'uw-footer' }, ...buttons);
  }

  _makeCorners() {
    const defs = [
      { cls: 'uw-c-tr', pos: { top: '-3px', right: '-3px', cursor: 'nesw-resize' }, path: 'M 3 3 Q 13 3 13 13' },
      { cls: 'uw-c-br', pos: { bottom: '-3px', right: '-3px', cursor: 'nwse-resize' }, path: 'M 13 3 Q 13 13 3 13' },
      { cls: 'uw-c-bl', pos: { bottom: '-3px', left: '-3px', cursor: 'nesw-resize' }, path: 'M 13 13 Q 3 13 3 3' },
      { cls: 'uw-c-tl', pos: { top: '-3px', left: '-3px', cursor: 'nwse-resize' }, path: 'M 3 13 Q 3 3 13 3' },
    ];
    return defs.map((def) => {
      const svg = UITools._el(
        'svg:svg',
        { viewBox: '0 0 16 16', width: '15', height: '15', style: { display: 'block', color: '#c9d1d9', pointerEvents: 'none' } },
        UITools._el('svg:path', { d: def.path, fill: 'none', stroke: '#c9d1d9', 'stroke-width': '2.8', 'stroke-linecap': 'square', 'stroke-linejoin': 'miter' })
      );
      return UITools._el('div', {
        className: `uw-corner ${def.cls}`,
        style: { position: 'absolute', width: '15px', height: '15px', zIndex: '20', opacity: '1', touchAction: 'none', ...def.pos }
      }, svg);
    });
  }

  _pt(e) {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  _listenDragDialog() {
    const onDown = (e) => {
      if (!e.target.closest('.uw-header') || e.target.closest('button, .uw-controls, input, select')) return;
      if (this._maximized || this._minimized) return;
      if (e.cancelable) e.preventDefault();

      this._setZ();
      UITools._showCovers();
      const el = this.element;
      el.style.transition = 'none';

      const dragRect = el.getBoundingClientRect();
      const pt = this._pt(e);
      this._dragSt = { px: pt.x, py: pt.y, rl: dragRect.left, rt: dragRect.top };

      const mm = (ev) => {
        if (!this._dragSt) return;
        if (ev.cancelable) ev.preventDefault();
        const p = this._pt(ev);
        el.style.left = `${this._dragSt.rl + (p.x - this._dragSt.px)}px`;
        el.style.top = `${this._dragSt.rt + (p.y - this._dragSt.py)}px`;
        this.options.onMove?.(parseFloat(el.style.left), parseFloat(el.style.top));
      };
      const mu = () => {
        this._dragSt = null;
        UITools._hideCovers();
        this._saveState();
        window.removeEventListener('mousemove', mm);
        window.removeEventListener('mouseup', mu);
        window.removeEventListener('touchmove', mm);
        window.removeEventListener('touchend', mu);
      };
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', mu);
      window.addEventListener('touchmove', mm, { passive: false });
      window.addEventListener('touchend', mu);
    };
    this.header.addEventListener('mousedown', onDown);
    this.header.addEventListener('touchstart', onDown, { passive: false });
    this.header.addEventListener('dblclick', (e) => {
      if (!e.target.closest('button')) this.toggleMaximize();
    });
  }

  _listenResizeDialog() {
    const xFs = [1, 1, -1, -1];
    const yFs = [-1, 1, 1, -1];
    this._sizers.forEach((sizer, i) => {
      const onDown = (e) => {
        if (this._maximized) return;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        UITools._showCovers();
        const el = this.element;
        el.style.transition = 'none';

        const rect = el.getBoundingClientRect();
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;

        const pt = this._pt(e);
        const st = {
          sx: pt.x, sy: pt.y, l: rect.left, t: rect.top, w: rect.width, h: rect.height,
          xF: xFs[i], yF: yFs[i]
        };

        const mm = (ev) => {
          if (ev.cancelable) ev.preventDefault();
          const p = this._pt(ev);
          const dx = p.x - st.sx;
          const dy = p.y - st.sy;
          const nW = Math.max(this.options.minWidth || 160, st.w + dx * st.xF);
          const nH = Math.max(this.options.minHeight || 100, st.h + dy * st.yF);
          Object.assign(el.style, {
            width: `${nW}px`,
            height: `${nH}px`,
            left: `${st.xF < 0 ? st.l + (st.w - nW) : st.l}px`,
            top: `${st.yF < 0 ? st.t + (st.h - nH) : st.t}px`,
          });
          if (this.callback) this.triggerCallback();
          this.options.onResize?.(nW, nH);
        };

        const mu = () => {
          UITools._hideCovers();
          this._saveState();
          window.removeEventListener('mousemove', mm);
          window.removeEventListener('mouseup', mu);
          window.removeEventListener('touchmove', mm);
          window.removeEventListener('touchend', mu);
        };

        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
        window.addEventListener('touchmove', mm, { passive: false });
        window.addEventListener('touchend', mu);
      };
      sizer.addEventListener('mousedown', onDown);
      sizer.addEventListener('touchstart', onDown, { passive: false });
    });
  }

  static _showCovers() {
    if (!UITools._getState().iframeCovers) UITools._getState().iframeCovers = [];
    document.querySelectorAll('iframe').forEach((f) => {
      const c = document.createElement('div');
      c.className = 'uw-iframe-cover';
      Object.assign(c.style, {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 999999, background: 'transparent',
      });
      if (f.parentElement) {
        f.parentElement.style.position = 'relative';
        f.parentElement.appendChild(c);
        UITools._getState().iframeCovers.push(c);
      }
    });
  }

  static _hideCovers() {
    if (UITools._getState().iframeCovers) {
      UITools._getState().iframeCovers.forEach((c) => c.remove());
      UITools._getState().iframeCovers = [];
    }
  }

  static _el(tag, attrs = {}, ...children) {
    const el = tag.startsWith('svg:')
      ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4))
      : document.createElement(tag);

    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'className' || k === 'class') el.setAttribute('class', v);
      else if (k === 'innerHTML') el.innerHTML = v;
      else if (k === 'textContent') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function')
        el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') {
        if (v) el.setAttribute(k, '');
        else el.removeAttribute(k);
      } else el.setAttribute(k, String(v));
    }
    children.flat().forEach((c) => {
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else if (c instanceof Node) el.appendChild(c);
    });
    return el;
  }

  static _applyStyles() {
    if (UITools._getState().styled) return;
    UITools._getState().styled = true;
    const css = `
      :root {
        --uw-bg: rgba(22, 24, 30, 0.98);
        --uw-border: rgba(255,255,255,0.08);
        --uw-text: #ced6e0;
        --uw-title: rgba(255,255,255,0.45);
        --uw-btn-bg: rgba(255,255,255,0.06);
        --uw-btn-hover: rgba(255,255,255,0.12);
        --uw-hdr-bg: rgba(255,255,255,0.015);
      }
      .uw-dialog {
        position: fixed; box-sizing: border-box; display: flex; flex-direction: column;
        background: var(--uw-bg); border: 1px solid var(--uw-border); border-radius: 12px;
        box-shadow: 0 14px 28px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
        min-width: 0; min-height: 0; overflow: visible;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px; color: var(--uw-text);
      }
      .uw-dialog.uw-maximized {
        border-radius: 0 !important; border: none !important; box-shadow: none !important;
        transition: left 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.25s cubic-bezier(0.16, 1, 0.3, 1), height 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .uw-dialog.uw-maximized .uw-corner,
      .uw-dialog.uw-minimized .uw-corner { display: none !important; }
      .uw-dialog.uw-minimized .uw-content { opacity: 0; pointer-events: none; }
      .uw-header {
        display: flex; align-items: center; gap: 4px; padding: 4px 8px; min-height: 28px;
        flex-shrink: 0; background: var(--uw-hdr-bg); border-bottom: 1px solid var(--uw-border);
        border-radius: 12px 12px 0 0; cursor: move; user-select: none; touch-action: none; position: relative; z-index: 40;
      }
      .uw-title {
        font-size: 11px; font-weight: 600; color: var(--uw-title); flex-grow: 1;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;
        letter-spacing: 0.02em; text-transform: uppercase;
      }
      .uw-controls { display: flex; align-items: center; gap: 2px; flex-shrink: 0; z-index: 100 !important; }
      .uw-util-btn, .uw-close-btn {
        background: none; border: none; cursor: pointer; color: var(--uw-title);
        width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
        border-radius: 4px; font-size: 11px; padding: 0; transition: all 0.12s;
      }
      .uw-util-btn:hover { background: var(--uw-btn-hover); color: var(--uw-text); }
      .uw-close-btn { color: rgba(255,255,255,0.7); }
      .uw-close-btn:hover { background: #e53935 !important; color: #ffffff !important; }
      .uw-content {
        position: relative; padding: 14px; flex-grow: 1; overflow: auto; background: transparent;
      }
      .uw-corner { position: absolute; width: 15px; height: 15px; z-index: 20; touch-action: none; user-select: none; }
      .uw-corner:hover { transform: scale(1.12); }
      .uw-c-br::after, .uw-c-bl::after, .uw-c-tl::after { content: ''; position: absolute; top: -8px; bottom: -8px; left: -8px; right: -8px; }
      .uw-c-tr::after { content: ''; position: absolute; top: -8px; right: -8px; width: 15px; height: 15px; }
    `;
    if (typeof applyCss === 'function') applyCss(css, 'UIToolsStyles');
  }
}

globalThis.UITools = UITools;
if (typeof window !== 'undefined') window.UITools = UITools;
if (typeof module !== 'undefined' && module.exports) module.exports = UITools;