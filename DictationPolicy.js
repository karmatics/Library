/**
 * DictationPolicy: presentation-layer interpretation of the resolved token stream.
 * Spoken punctuation, "new paragraph", "literal <word>", learned replacement rules, user joint edits
 * (punctuation / capitalisation after a word), and automatic capitalisation.
 * Raw engine tokens are never modified; this runs at render/export time.
 * Set policy.jointLookup = (spanId, idx) => ({punct?, cap?}) | null to enable joint edits.
 */
class DictationPolicy {
  constructor(opts = {}) {
    this.enabled = true;
    this.capitalize = opts.capitalize !== false;
    this.literalWord = 'literal';
    this.disabled = new Set();
    this.rules = new Map();
    this.listeners = new Set();
    this.jointLookup = opts.jointLookup || null;
    this.commands = {
      'new paragraph': { out: '\n\n', kind: 'break' },
      'new line': { out: '\n\n', kind: 'break' },
      'newline': { out: '\n\n', kind: 'break' },
      'period': { out: '.', kind: 'punct' },
      'comma': { out: ',', kind: 'punct' },
      'question mark': { out: '?', kind: 'punct' },
      'exclamation point': { out: '!', kind: 'punct' },
      'exclamation mark': { out: '!', kind: 'punct' },
      'colon': { out: ':', kind: 'punct' },
      'semicolon': { out: ';', kind: 'punct' }
    };
    Object.entries(opts.rules || {}).forEach(([h, w]) => this.rules.set(h.toLowerCase().trim(), w));
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { this.listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  addRule(heard, write) { this.rules.set(String(heard).toLowerCase().trim(), write); this._emit(); }
  removeRule(heard) { this.rules.delete(String(heard).toLowerCase().trim()); this._emit(); }
  setDisabled(phrase, v = true) { if (v) this.disabled.add(phrase); else this.disabled.delete(phrase); this._emit(); }

  static needsSpace(prev, it) {
    return !!prev && prev.kind !== 'break' && it.kind !== 'punct' && it.kind !== 'break';
  }

  /** Output items carry: idx/endIdx/endSpan (their resolved position) and jointKey = "endSpan:endIdx" (the joint after them). */
  apply(items) {
    if (!this.enabled) return items;
    const out = [];
    const MAX = 4;
    for (let i = 0; i < items.length;) {
      const it = items[i];
      if (it.empty) { out.push({ ...it, endIdx: it.idx, endSpan: it.spanId }); i++; continue; }

      if (it.text.toLowerCase() === this.literalWord && i + 1 < items.length && !items[i + 1].empty) {
        const nx = items[i + 1];
        out.push({ ...nx, kind: 'literal', raw: `${it.text} ${nx.text}`, phrase: null, idx: it.idx, spanId: it.spanId, endIdx: nx.idx, endSpan: nx.spanId });
        i += 2; continue;
      }

      let hit = null;
      for (let n = Math.min(MAX, items.length - i); n >= 1 && !hit; n--) {
        const slice = items.slice(i, i + n);
        if (slice.some(s => s.empty)) continue;
        const phrase = slice.map(s => s.text.toLowerCase()).join(' ');
        if (this.disabled.has(phrase)) continue;
        if (this.rules.has(phrase)) hit = { n, phrase, text: this.rules.get(phrase), kind: 'rule', slice };
        else if (this.commands[phrase]) hit = { n, phrase, text: this.commands[phrase].out, kind: this.commands[phrase].kind, slice };
      }
      if (hit) {
        const last = hit.slice[hit.n - 1];
        out.push({ text: hit.text, spanId: it.spanId, choiceId: it.choiceId, alts: it.alts, pinned: it.pinned,
                   kind: hit.kind, phrase: hit.phrase, raw: hit.slice.map(s => s.text).join(' '),
                   idx: it.idx, endIdx: last.idx, endSpan: last.spanId });
        i += hit.n;
      } else { out.push({ ...it, endIdx: it.idx, endSpan: it.spanId }); i++; }
    }

    // user joint edits: insert chosen punctuation after a word and remember any forced capitalisation
    const res = [];
    for (const it of out) {
      res.push(it);
      if (it.empty || !this.jointLookup) continue;
      const j = this.jointLookup(it.endSpan, it.endIdx);
      if (!j) continue;
      let carrier = it;
      if (j.punct) {
        carrier = { text: j.punct, kind: 'punct', jointPunct: true, spanId: it.endSpan, endSpan: it.endSpan, idx: it.endIdx, endIdx: it.endIdx, phrase: null };
        res.push(carrier);
      }
      carrier._j = j;
    }
    for (const it of res) it.jointKey = it.endSpan + ':' + it.endIdx;

    if (this.capitalize) {
      let cap = true, force = null;
      for (const it of res) {
        if (it.empty) continue;
        if (it.kind === 'break') cap = true;
        else if (it.kind === 'punct') { if (/[.?!]/.test(it.text)) cap = true; }
        else {
          if (it.text === 'i') it.text = 'I';
          if (it.text && it.kind !== 'literal') {
            if (force === true || (force === null && cap)) it.text = it.text.charAt(0).toUpperCase() + it.text.slice(1);
            else if (force === false && it.text !== 'I') it.text = it.text.charAt(0).toLowerCase() + it.text.slice(1);
          }
          cap = false; force = null;
        }
        if (it._j && it._j.cap !== undefined) force = it._j.cap;
      }
    }
    return res;
  }

  toText(items) {
    let s = '', prev = null;
    for (const it of items) {
      if (it.empty) continue;
      if (it.kind === 'break') { s = s.replace(/ +$/, '') + it.text; prev = it; continue; }
      s += (DictationPolicy.needsSpace(prev, it) ? ' ' : '') + it.text;
      prev = it;
    }
    return s;
  }
}

globalThis.DictationPolicy = DictationPolicy;
if (typeof module !== 'undefined' && module.exports) module.exports = DictationPolicy;