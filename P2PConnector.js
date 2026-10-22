class P2PConnector {
  /**
   * Universal WebRTC Host Connector powered by PeerJS.
   * Manages room pairing, capability negotiation, and telemetry routing
   * to BaseController and ViewControls.
   */
  constructor(baseController) {
    this.baseController = baseController;
    this.roomCode = localStorage.getItem('p2p-host-room') || Math.floor(1000 + Math.random() * 9000).toString();
    localStorage.setItem('p2p-host-room', this.roomCode);

    this.peer = null;
    this.activeConnection = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'ready' | 'connected'
    this.statusListeners = new Set();
    this.container = null;

    P2PConnector.instance = this;
    this._initPeer();
  }

  static async ensurePeerJS() {
    if (typeof globalThis.Peer !== 'undefined') return globalThis.Peer;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      s.onload = () => resolve(globalThis.Peer);
      s.onerror = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
        s2.onload = () => resolve(globalThis.Peer);
        s2.onerror = reject;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
  }

  async _initPeer() {
    this._setStatus('connecting');
    try {
      await P2PConnector.ensurePeerJS();

      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
      }

      const peerId = `cad_${this.roomCode}`;
      this.peer = new globalThis.Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log(`[P2PConnector] Host ready on peer ID: ${id}`);
        this._setStatus('ready');
      });

      this.peer.on('connection', (conn) => {
        console.log('[P2PConnector] Incoming connection from client:', conn.peer);
        this._setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.warn('[P2PConnector] Peer error:', err.type, err.message);
        if (err.type === 'unavailable-id') {
          // If ID collision, roll a new room code
          this.roomCode = Math.floor(1000 + Math.random() * 9000).toString();
          localStorage.setItem('p2p-host-room', this.roomCode);
          this._initPeer();
        } else {
          this._setStatus('disconnected');
        }
      });

      this.peer.on('disconnected', () => {
        this._setStatus('disconnected');
        if (this.peer && !this.peer.destroyed) {
          try { this.peer.reconnect(); } catch (e) {}
        }
      });

    } catch (err) {
      console.error('[P2PConnector] Failed to load PeerJS:', err);
      this._setStatus('disconnected');
    }
  }

  _setupConnection(conn) {
    if (this.activeConnection) {
      try { this.activeConnection.close(); } catch (e) {}
    }
    this.activeConnection = conn;

    conn.on('open', () => {
      console.log('[P2PConnector] DataChannel established with mobile controller.');
      this._setStatus('connected');

      // Send verification and capability schema
      conn.send({ type: 'h-verified' });
      const caps = (this.baseController && typeof this.baseController.getP2PCapabilities === 'function')
        ? this.baseController.getP2PCapabilities()
        : {
            leftTrackpad: { title: "Navigation", modes: { rotate: { label: "Rotate View" }, pan: { label: "Pan View" } } },
            rightTrackpad: { title: "Controls", modes: { sliders: { label: "Compass Sliders" }, tool: { label: "Tool Settings" } } }
          };

      conn.send({ type: 'configure', config: caps });
    });

    conn.on('data', (data) => {
      this._handleRemoteMessage(data);
    });

    conn.on('close', () => {
      console.log('[P2PConnector] Mobile controller disconnected.');
      this.activeConnection = null;
      this._setStatus('ready');
    });

    conn.on('error', (err) => {
      console.warn('[P2PConnector] Connection error:', err);
      this.activeConnection = null;
      this._setStatus('ready');
    });
  }

  _handleRemoteMessage(payload) {
    if (!payload) return;
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const type = data.type;
    const bc = this.baseController;
    const vc = (typeof ViewControlsManager !== 'undefined' && ViewControlsManager.instance)
      ? ViewControlsManager.instance
      : null;

    if (type === 'drag' && bc) {
      bc.handleRemoteDrag(data.dx, data.dy, data.mode);
    } else if (type === 'zoom' && bc) {
      bc.handleRemoteZoom(data.ratio);
    } else if (type === 'perspective' && bc) {
      bc.handleRemotePerspective(data.dy);
    } else if (type === 'accudrawZ' && vc) {
      vc.handleRemoteAccudrawZ(data.dy);
    } else if (type === 'sliderDragStart' && vc) {
      vc.handleSliderDragStart(data.mode);
    } else if (type === 'sliderDragMove' && vc) {
      vc.handleSliderDragMove(data.dy, data.phoneHeight);
    } else if (type === 'sliderDragEnd' && vc) {
      vc.handleSliderDragEnd();
    } else if (type === 'sliderAdjustStart' && vc) {
      vc.startSliderAdjustment();
    } else if (type === 'sliderAdjust' && vc) {
      vc.adjustSelectedSlider(data.ratio);
    } else if (type === 'sliderTap' && vc) {
      vc.handleSliderTap();
    } else if (type === 'modeChange' && vc) {
      vc.highlightActiveControlBox(data.mode);
    } else if (type === 'h-pong' || type === 'pong') {
      // Heartbeat ack
    }
  }

  _setStatus(s) {
    this.status = s;
    this.statusListeners.forEach((fn) => {
      try { fn(s); } catch (e) {}
    });
    this._updateUIBadge();
  }

  onStatusChange(fn) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  getMobileUrl() {
    const isHosted = window.location.hostname.endsWith('.github.io');
    const user = isHosted ? window.location.hostname.split('.')[0] : 'karmatics';
    const baseUrl = isHosted 
      ? `https://${user}.github.io/TouchController/`
      : `${window.location.origin}/TouchController/`;

    return `${baseUrl}?room=${this.roomCode}`;
  }

  renderControls(container) {
    this.container = container;
    container.innerHTML = '';

    const wrap = makeElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px', fontFamily: 'monospace', fontSize: '11px' }
    });

    const statusRow = makeElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
    }, [
      makeElement('span', { style: { color: '#94a3b8' } }, 'Wireless Link:'),
      makeElement('span', { id: 'p2p-status-pill', style: { fontWeight: 'bold' } }, this.status)
    ]);
    wrap.appendChild(statusRow);

    const qrContainer = makeElement('div', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: '#fff', padding: '10px', borderRadius: '8px', margin: '4px 0' }
    });

    const qrImg = makeElement('img', {
      src: `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(this.getMobileUrl())}`,
      style: { width: '130px', height: '130px', display: 'block' }
    });
    qrContainer.appendChild(qrImg);

    const roomBadge = makeElement('div', {
      style: { color: '#090d16', fontWeight: 'bold', fontSize: '13px', letterSpacing: '2px' }
    }, `ROOM: ${this.roomCode}`);
    qrContainer.appendChild(roomBadge);
    wrap.appendChild(qrContainer);

    const actionRow = makeElement('div', { style: { display: 'flex', gap: '6px' } }, [
      makeElement('button', {
        className: 'dr-nav-btn',
        style: { flex: 1, padding: '4px', fontSize: '10px', color: '#00f2fe' },
        onclick: () => {
          navigator.clipboard.writeText(this.getMobileUrl());
          alert('Copied TouchController pairing link to clipboard!');
        }
      }, '📋 Copy URL'),
      makeElement('button', {
        className: 'dr-nav-btn',
        style: { flex: 1, padding: '4px', fontSize: '10px' },
        onclick: () => {
          this.roomCode = Math.floor(1000 + Math.random() * 9000).toString();
          localStorage.setItem('p2p-host-room', this.roomCode);
          this._initPeer();
          this.renderControls(container);
        }
      }, '↻ New Code')
    ]);
    wrap.appendChild(actionRow);

    container.appendChild(wrap);
    this._updateUIBadge();
  }

  _updateUIBadge() {
    const pill = document.getElementById('p2p-status-pill');
    if (!pill) return;
    if (this.status === 'connected') {
      pill.textContent = '● CONNECTED';
      pill.style.color = '#10b981';
    } else if (this.status === 'ready') {
      pill.textContent = '○ Awaiting Phone';
      pill.style.color = '#38bdf8';
    } else if (this.status === 'connecting') {
      pill.textContent = '◌ Connecting...';
      pill.style.color = '#f59e0b';
    } else {
      pill.textContent = '✕ Offline';
      pill.style.color = '#ef4444';
    }
  }

  destroy() {
    if (this.activeConnection) {
      try { this.activeConnection.close(); } catch (e) {}
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
    }
    this.statusListeners.clear();
    P2PConnector.instance = null;
  }
}

globalThis.P2PConnector = P2PConnector;
if (typeof module !== 'undefined' && module.exports) module.exports = P2PConnector;