class SidePanel {
    constructor(side, width = 360, env = null) {
      this.side = side;

      // Handle both new SidePanel('left', 360, env) and new SidePanel('left', { parent, width })
      if (typeof width === 'object' && width !== null) {
        this.env = width.env || (width.container ? width : null);
        this.width = typeof width.width === 'number' ? width.width : 360;
        this.container = width.container || width.parent || document.body;
      } else {
        this.width = typeof width === 'number' ? width : 360;
        this.env = env;
        this.container = (env && env.container) ? env.container : document.body;
      }

      this.isOpen = false;
      this.sections = {};
  
      this.element = document.createElement('div');
      this.element.className = `yt-side-panel ${side}`;
      
      const isAbsolute = this.container !== document.body;
      
      Object.assign(this.element.style, {
        position: isAbsolute ? 'absolute' : 'fixed',
        top: '0',
        [side]: '0',
        width: `${this.width}px`,
        height: '100%',
        background: 'rgba(18, 18, 18, 0.95)',
        borderLeft: side === 'right' ? '1px solid #333' : 'none',
        borderRight: side === 'left' ? '1px solid #333' : 'none',
        transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: side === 'left' ? 'translateX(-100%)' : 'translateX(100%)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 150000
      });
  
      this.header = document.createElement('div');
      Object.assign(this.header.style, {
        display: 'flex',
        justifyContent: side === 'left' ? 'flex-end' : 'flex-start',
        padding: '8px 10px',
        borderBottom: '1px solid #333',
        background: 'rgba(0,0,0,0.2)'
      });
  
      const closeBtn = document.createElement('button');
      Object.assign(closeBtn.style, {
        background: 'transparent',
        border: 'none',
        color: '#888',
        fontSize: '18px',
        cursor: 'pointer',
        padding: '0 5px',
        lineHeight: '1',
        borderRadius: '4px'
      });
      closeBtn.textContent = '✖';
      closeBtn.onmouseenter = (e) => (e.target.style.color = '#fff');
      closeBtn.onmouseleave = (e) => (e.target.style.color = '#888');
      closeBtn.onclick = () => {
        this.close();
        window.dispatchEvent(new CustomEvent('panel-toggle-complete'));
      };
  
      this.header.appendChild(closeBtn);
  
      this.contentContainer = document.createElement('div');
      this.contentContainer.style.cssText = 'flex:1; overflow-y:auto; overflow-x:hidden; padding:10px;';
  
      this.element.appendChild(this.header);
      this.element.appendChild(this.contentContainer);
      this.container.appendChild(this.element);
  
      SidePanel.getInstances()[side] = this;
      
      // Auto-destroy lifecycle
      if (this.env && this.env.container) {
        this._lifecycleObserver = new MutationObserver(() => {
          if (!document.body.contains(this.env.container)) {
            this.destroy();
          }
        });
        this._lifecycleObserver.observe(document.body, { childList: true, subtree: true });
      }

      this._injectStyles();
    }

    addSection(id, title, defaultOpen) {
      const content = document.createElement('div');
      content.style.padding = '10px';
  
      const summary = document.createElement('summary');
      Object.assign(summary.style, {
        padding: '10px',
        cursor: 'pointer',
        fontWeight: '700',
        color: '#bbb',
        fontSize: '11px',
        textTransform: 'uppercase'
      });
      summary.textContent = title;
  
      const lsKey = `yt_panel_sec_${id}`;
      const stored = localStorage.getItem(lsKey);
      const isOpen = stored !== null ? stored === 'true' : defaultOpen;
  
      const det = document.createElement('details');
      det.open = isOpen;
      Object.assign(det.style, {
        marginBottom: '8px',
        border: '1px solid #333',
        background: '#222',
        borderRadius: '4px'
      });
      det.appendChild(summary);
      det.appendChild(content);
  
      det.addEventListener('toggle', () => {
        localStorage.setItem(lsKey, det.open);
        window.dispatchEvent(new CustomEvent('panel-toggle-complete'));
      });
  
      this.contentContainer.appendChild(det);
      this.sections[id] = { element: det, content: content };
      return content;
    }

    _animateLayoutUpdate() {
      const start = performance.now();
      const animate = (time) => {
        SidePanel.updateGlobalSafeArea();
        if (time - start < 280) {
          requestAnimationFrame(animate);
        } else {
          SidePanel.updateGlobalSafeArea();
          window.dispatchEvent(new CustomEvent('panel-toggle-complete'));
        }
      };
      requestAnimationFrame(animate);
    }

    open(sectionId) {
      this.isOpen = true;
      this.element.classList.add('open');
      this.element.style.transform = 'translateX(0)';

      if (sectionId && this.sections[sectionId]) {
        this.sections[sectionId].element.open = true;
      }

      this._animateLayoutUpdate();

      if (this.side === 'left' && window.player && window.player.floatingMenuBtn) {
        window.player.floatingMenuBtn.style.display = 'none';
      }
    }

    close() {
      this.isOpen = false;
      this.element.classList.remove('open');
      this.element.style.transform =
        this.side === 'left' ? 'translateX(-100%)' : 'translateX(100%)';

      this._animateLayoutUpdate();

      if (this.side === 'left' && window.player && window.player.floatingMenuBtn) {
        window.player.floatingMenuBtn.style.display = 'block';
      }
    }

    toggle(open) {
      this.isOpen = open;
      if (open) this.open();
      else this.close();
    }

    destroy() {
      this._lifecycleObserver?.disconnect();
      if (this.element && this.element.parentElement) {
        this.element.remove();
      }
      SidePanel.getInstances()[this.side] = null;
    }

    static updateGlobalSafeArea() {
      let l = 0;
      let r = 0;

      if (!document.fullscreenElement) {
        const instances = SidePanel.getInstances();
        const leftPanel = instances?.left;
        const rightPanel = instances?.right;

        if (leftPanel && leftPanel.element && leftPanel.isOpen) {
          l = leftPanel.element.offsetWidth || leftPanel.width || 360;
        }

        if (rightPanel && rightPanel.element && rightPanel.isOpen) {
          r = rightPanel.element.offsetWidth || rightPanel.width || 360;
        }
      }

      if (typeof UITools !== 'undefined' && typeof UITools.setSafeArea === 'function') {
        UITools.setSafeArea({ left: l, right: r, top: 0, bottom: 0 });
      }

      const evt = new CustomEvent('layout-safe-area-change', {
        detail: { left: l, right: r },
      });
      window.dispatchEvent(evt);
    }

    static getInstances() {
      if (!this._instances) {
        this._instances = { left: null, right: null };
      }
      return this._instances;
    }
  
    _injectStyles() {
      const css = `
        .yt-side-panel div::-webkit-scrollbar { width: 5px; height: 5px; }
        .yt-side-panel div::-webkit-scrollbar-track { background: rgba(0,0,0,0.15); }
        .yt-side-panel div::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        .yt-side-panel div::-webkit-scrollbar-thumb:hover { background: #00e676; }
      `;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }
}