/**
 * DictationEngineAdapter: wraps Web Speech and feeds normalised events into a DictationLattice.
 * - Recognizer is created lazily on start() and fully released on stop()/destroy()/pagehide.
 * - Only one adapter at a time may hold the microphone (globalThis.__dictationActive).
 * - Auto-restart has a back-off and a give-up limit, so a recognizer that keeps ending cannot flap on/off forever.
 * - Every (re)start opens a new key namespace so result indexes never collide.
 */
class DictationEngineAdapter {
  constructor(lattice, opts = {}) {
    this.lattice = lattice;
    this.lang = opts.lang || 'en-US';
    this.maxAlternatives = opts.maxAlternatives || 3;
    this.onStatus = opts.onStatus || (() => {});
    this.onStateChange = opts.onStateChange || (() => {});
    this.session = 0;
    this.isListening = false;
    this.rec = null;
    this._restarts = [];
    this._onPageHide = () => this._release();
    window.addEventListener('pagehide', this._onPageHide);
  }

  static get supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

  _create() {
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) { this.onStatus('❌ Speech API not supported in this browser.'); return null; }
    const rec = new API();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = this.maxAlternatives;

    rec.onstart = () => { this.session++; };
    rec.onresult = e => { if (rec === this.rec) this._onResult(e); };
    rec.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.onStatus('❌ Microphone access denied.'); this.stop(); }
    };
    rec.onend = () => {
      if (!this.isListening || rec !== this.rec) return;
      const now = Date.now();
      this._restarts = this._restarts.filter(t => now - t < 10000);
      this._restarts.push(now);
      if (this._restarts.length > 8) {
        this.onStatus('⚠️ Recognizer keeps ending, stopped. Press Start to retry.');
        this.stop();
        return;
      }
      const delay = this._restarts.length > 3 ? 800 : 120;
      setTimeout(() => {
        if (this.isListening && rec === this.rec) { try { rec.start(); } catch (e) {} }
      }, delay);
    };
    rec.onspeechstart = () => this.isListening && this.onStatus('🎙️ Hearing speech…');
    rec.onspeechend = () => this.isListening && this.onStatus('🔴 Listening…');
    return rec;
  }

  _onResult(event) {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      const key = `${this.session}:${i}`;
      this.lattice.ingest(key, r[0].transcript, { final: r.isFinal, confidence: r[0].confidence });
      if (r.isFinal) {
        for (let j = 1; j < r.length; j++) {
          this.lattice.ingest(key, r[j].transcript, { asAlt: true, confidence: r[j].confidence });
        }
      }
    }
  }

  start() {
    if (this.isListening) return true;
    const prev = globalThis.__dictationActive;
    if (prev && prev !== this) { try { prev.stop(); } catch (e) {} }
    this._restarts = [];
    this.rec = this._create();
    if (!this.rec) return false;
    this.isListening = true;
    globalThis.__dictationActive = this;
    try { this.rec.start(); } catch (e) { this._release(); return false; }
    this.onStatus('🔴 Listening…');
    this.onStateChange(true);
    return true;
  }

  _release() {
    const rec = this.rec;
    const was = this.isListening;
    this.rec = null;
    this.isListening = false;
    if (globalThis.__dictationActive === this) globalThis.__dictationActive = null;
    if (rec) {
      rec.onresult = rec.onend = rec.onerror = rec.onstart = rec.onspeechstart = rec.onspeechend = null;
      try { rec.abort(); } catch (e) {}
    }
    if (was) this.onStateChange(false);
  }

  stop() {
    if (!this.isListening && !this.rec) return;
    this._release();
    this.lattice.finalizeAll();
    this.onStatus('🔇 Idle');
  }

  destroy() {
    window.removeEventListener('pagehide', this._onPageHide);
    this._release();
  }
}

globalThis.DictationEngineAdapter = DictationEngineAdapter;
if (typeof module !== 'undefined' && module.exports) module.exports = DictationEngineAdapter;