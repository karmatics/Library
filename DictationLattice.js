/**
 * DictationLattice: the pure model behind the dictation experiment. See Library/DictationDocs.js for the full design.
 *
 * span.segments = [ {type:'text', tokens:[...]} | {type:'choice', id, alts:[...], selected, engineAlt, pinned} ]
 *   engineAlt = what the speech engine currently believes (raw truth). selected = what is displayed.
 * span.joints   = { [resolvedTokenIndex]: {punct?:string, cap?:boolean} }  user edits to the joint AFTER that word.
 * No DOM access anywhere in this file. Engine events in -> state out. Replayable via static replay(log).
 */
class DictationLattice {
  constructor(opts = {}) {
    this.hotMs = opts.hotMs ?? 30000;
    this.warmMs = opts.warmMs ?? 180000;
    this.keepAlts = opts.keepAlts ?? 2;
    this.now = opts.now || (() => Date.now());
    this.recordLog = opts.recordLog !== false;
    this.spans = new Map();
    this.order = [];                 // document order of span ids
    this.keyToSpan = new Map();      // engine result key -> span id
    this.writeAfter = null;          // new spans are inserted after this span id (null = start)
    this.corrections = new Map();    // "heard|chose" -> count (rule learning)
    this.listeners = new Set();
    this.log = [];
    this._n = 0;
  }

  static tokenize(text) { return String(text || '').trim().split(/\s+/).filter(Boolean); }
  static norm(t) { return t.toLowerCase(); }

  /** LCS token diff. Returns hunks {oa,ob,nb,ne}: old [oa,ob) replaced by new [nb,ne). */
  static diff(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const hunks = [];
    let i = 0, j = 0, cur = null;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        if (cur) { hunks.push(cur); cur = null; }
        i++; j++;
      } else {
        if (!cur) cur = { oa: i, ob: i, nb: j, ne: j };
        if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) { i++; cur.ob = i; }
        else { j++; cur.ne = j; }
      }
    }
    if (cur) hunks.push(cur);
    return hunks;
  }

  _id(p) { return p + (++this._n); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(type, spanId) { this.listeners.forEach(fn => { try { fn({ type, spanId }); } catch (e) { console.error(e); } }); }

  // ---------- ingest ----------
  ingest(key, text, opts = {}) {
    const words = DictationLattice.tokenize(text);
    if (!words.length) return null;
    const now = this.now();
    if (this.recordLog) this.log.push({ t: now, op: 'ingest', key, text, final: !!opts.final, asAlt: !!opts.asAlt, confidence: opts.confidence });

    let span = this.spans.get(this.keyToSpan.get(key));
    if (!span) {
      if (opts.asAlt) return null;
      span = {
        id: this._id('s'), key, createdAt: now, lastT: now, lastInteract: 0, revCount: 1,
        final: !!opts.final, collapsed: false, confidence: opts.confidence ?? null,
        segments: [{ type: 'text', tokens: words }], joints: {}
      };
      this.spans.set(span.id, span);
      this.keyToSpan.set(key, span.id);
      let idx = this.writeAfter === null ? 0 : this.order.indexOf(this.writeAfter) + 1;
      if (this.writeAfter !== null && idx === 0) idx = this.order.length;
      this.order.splice(idx, 0, span.id);
      this.writeAfter = span.id;       // write head follows the newest span
    } else {
      this._revise(span, words, opts);
      if (!opts.asAlt) { span.lastT = now; span.revCount++; }
      if (opts.final) span.final = true;
    }
    this._emit('ingest', span.id);
    return span;
  }

  _revise(span, words, opts) {
    const now = this.now(), asAlt = !!opts.asAlt, segs = span.segments;
    const cells = [], oldFlat = [], segEnd = [];
    segs.forEach((s, si) => {
      const toks = s.type === 'text' ? s.tokens : s.alts.find(a => a.id === s.engineAlt).tokens;
      toks.forEach((t, k) => { cells.push({ seg: si, off: k }); oldFlat.push(t); });
      segEnd[si] = cells.length;
    });
    const n = oldFlat.length, m = words.length;
    const isChoice = si => segs[si].type === 'choice';
    const norm = DictationLattice.norm;

    // 1. diff and normalise hunks so they never split a choice point and are never empty on the old side
    const hunks = [];
    for (const raw of DictationLattice.diff(oldFlat.map(norm), words.map(norm))) {
      let { oa, ob, nb, ne } = raw, kind = 'reg';
      if (!asAlt) {
        // growth/shrink at the ends is plain text, not a competing interpretation
        if (oa === ob && (oa === n || oa === 0)) kind = 'ins';
        else if (nb === ne && ob === n && oa < ob && !(isChoice(cells[oa].seg) && cells[oa].off > 0)) kind = 'del';
        else if (nb === ne && oa === 0 && ob > 0 && !(ob < n && cells[ob].seg === cells[ob - 1].seg && isChoice(cells[ob].seg))) kind = 'del';
      }
      if (kind === 'reg') {
        if (oa === ob) { if (oa < n) { ob++; ne++; } else { oa--; nb--; } }
        else if (nb === ne) { if (ob < n) { ob++; ne++; } else if (oa > 0) { oa--; nb--; } }
        if (oa < n && isChoice(cells[oa].seg) && cells[oa].off > 0) { const d = cells[oa].off; oa -= d; nb -= d; }
        if (ob < n && ob > 0 && cells[ob].seg === cells[ob - 1].seg && isChoice(cells[ob].seg)) {
          const e = segEnd[cells[ob].seg]; ne += e - ob; ob = e;
        }
      }
      const last = hunks[hunks.length - 1];
      if (last && oa <= last.ob) { last.kind = 'reg'; last.ob = Math.max(last.ob, ob); last.ne = Math.max(last.ne, ne); }
      else hunks.push({ oa, ob, nb, ne, kind });
    }

    // 2. rebuild segments
    const out = [];
    const pushText = toks => {
      if (!toks.length) return;
      const l = out[out.length - 1];
      if (l && l.type === 'text') l.tokens = l.tokens.concat(toks);
      else out.push({ type: 'text', tokens: toks.slice() });
    };
    const unchanged = (x, y, ns) => {
      let p = x;
      while (p < y) {
        const c = cells[p], seg = segs[c.seg];
        if (seg.type === 'choice') {
          const e = seg.alts.find(a => a.id === seg.engineAlt);
          if (!asAlt) { e.last = now; e.count++; }
          out.push(seg);
          p += Math.max(1, e.tokens.length);
        } else {
          let q = p;
          while (q < y && cells[q].seg === c.seg) q++;
          pushText(asAlt ? oldFlat.slice(p, q) : words.slice(ns + (p - x), ns + (q - x)));
          p = q;
        }
      }
    };
    let pos = 0;
    for (const h of hunks) {
      unchanged(pos, h.oa, h.nb - (h.oa - pos));
      if (h.kind === 'ins') pushText(words.slice(h.nb, h.ne));
      else if (h.kind === 'reg') out.push(this._region(span, h, cells, segs, oldFlat, words, asAlt, now));
      pos = h.ob;
    }
    unchanged(pos, n, m - (n - pos));
    span.segments = out;
  }

  _region(span, h, cells, segs, oldFlat, words, asAlt, now) {
    const oldTok = oldFlat.slice(h.oa, h.ob), newTok = words.slice(h.nb, h.ne);
    const key = t => t.join(' ');
    const mk = (tokens, source, first, last, count) => ({ id: this._id('a'), tokens, source, first, last, count });
    const newSource = asAlt ? 'nbest' : 'engine';
    const pieces = [];
    let p = h.oa;
    while (p < h.ob) {
      const c = cells[p], seg = segs[c.seg];
      if (seg.type === 'choice') {
        pieces.push({ choice: seg });
        p += Math.max(1, seg.alts.find(a => a.id === seg.engineAlt).tokens.length);
      } else {
        let q = p;
        while (q < h.ob && cells[q].seg === c.seg) q++;
        pieces.push({ tokens: oldFlat.slice(p, q) });
        p = q;
      }
    }

    // a) revision lands exactly on an existing choice point
    if (pieces.length === 1 && pieces[0].choice) {
      const ch = pieces[0].choice;
      let alt = ch.alts.find(a => key(a.tokens) === key(newTok));
      if (alt) { if (!asAlt) { alt.last = now; alt.count++; } }
      else { alt = mk(newTok, newSource, now, now, 1); ch.alts.push(alt); }
      if (!asAlt) { ch.engineAlt = alt.id; if (!ch.pinned) ch.selected = alt.id; }
      return ch;
    }

    // b) plain text region becomes a new choice point
    if (pieces.every(pc => !pc.choice)) {
      const oldAlt = mk(oldTok, 'engine', span.createdAt, span.lastT, Math.max(1, span.revCount));
      const newAlt = mk(newTok, newSource, now, now, 1);
      const eng = asAlt ? oldAlt : newAlt;
      return { type: 'choice', id: this._id('c'), alts: [oldAlt, newAlt], selected: eng.id, engineAlt: eng.id, pinned: false };
    }

    // c) hunk bridges several choice points / text: merge, re-padding every alternative to the full range
    const engTok = pieces.map(pc => pc.choice ? pc.choice.alts.find(a => a.id === pc.choice.engineAlt).tokens : pc.tokens);
    const alts = new Map();
    const add = (tokens, source, first, last, count) => {
      const k = key(tokens); let a = alts.get(k);
      if (a) { a.count += count; a.last = Math.max(a.last, last); } else { a = mk(tokens, source, first, last, count); alts.set(k, a); }
      return a;
    };
    const eo = add(engTok.flat(), 'engine', span.createdAt, span.lastT, Math.max(1, span.revCount));
    let pinnedAlt = null;
    pieces.forEach((pc, i) => {
      if (!pc.choice) return;
      const c = pc.choice;
      c.alts.forEach(a => {
        if (a.id === c.engineAlt) return;
        const padded = add(engTok.map((t, j) => j === i ? a.tokens : t).flat(), a.source, a.first, a.last, a.count);
        if (c.pinned && a.id === c.selected && !pinnedAlt) pinnedAlt = padded;
      });
      if (c.pinned && c.selected === c.engineAlt && !pinnedAlt) pinnedAlt = eo;
    });
    const na = add(newTok, newSource, now, now, 1);
    const eng = asAlt ? eo : na;
    const sel = pinnedAlt || eng;
    return { type: 'choice', id: this._id('c'), alts: [...alts.values()], selected: sel.id, engineAlt: eng.id, pinned: !!pinnedAlt };
  }

  // ---------- user actions ----------
  findChoice(id) {
    for (const span of this.spans.values()) for (const choice of span.segments) {
      if (choice.type === 'choice' && choice.id === id) return { span, choice };
    }
    return null;
  }

  select(choiceId, altId, opts = {}) {
    const f = this.findChoice(choiceId); if (!f) return false;
    const alt = f.choice.alts.find(a => a.id === altId); if (!alt) return false;
    if (this.recordLog) this.log.push({ t: this.now(), op: 'select', choiceId, altId });
    f.choice.selected = altId;
    f.choice.pinned = opts.pin !== false;
    f.span.lastInteract = this.now();
    if (f.choice.pinned) this._learn(f.choice, alt);
    this._emit('select', f.span.id);
    return true;
  }

  addAlternative(choiceId, text) {
    if (this.recordLog) this.log.push({ t: this.now(), op: 'addAlt', choiceId, text });
    return this._addAlt(choiceId, text);
  }

  _addAlt(choiceId, text) {
    const f = this.findChoice(choiceId); if (!f) return false;
    const tokens = DictationLattice.tokenize(text);
    let alt = f.choice.alts.find(a => a.tokens.join(' ') === tokens.join(' '));
    if (!alt) {
      const now = this.now();
      alt = { id: this._id('a'), tokens, source: 'user', first: now, last: now, count: 1 };
      f.choice.alts.push(alt);
    }
    f.choice.selected = alt.id; f.choice.pinned = true;
    f.span.lastInteract = this.now();
    this._learn(f.choice, alt);
    this._emit('select', f.span.id);
    return true;
  }

  /**
   * Replace (or delete, with text '') the word at resolved index idx inside a span.
   * Plain text words are converted into a pinned choice point so the engine's version stays available.
   */
  editWord(spanId, idx, text) {
    const span = this.spans.get(spanId); if (!span) return false;
    if (this.recordLog) this.log.push({ t: this.now(), op: 'editWord', spanId, idx, text });
    let p = 0;
    for (let si = 0; si < span.segments.length; si++) {
      const seg = span.segments[si];
      const toks = seg.type === 'text' ? seg.tokens : seg.alts.find(a => a.id === seg.selected).tokens;
      const n = seg.type === 'text' ? toks.length : Math.max(1, toks.length);
      if (idx < p + n) {
        if (seg.type === 'choice') return this._addAlt(seg.id, text);
        const k = idx - p, now = this.now();
        const eng = { id: this._id('a'), tokens: [toks[k]], source: 'engine', first: span.createdAt, last: span.lastT, count: Math.max(1, span.revCount) };
        const usr = { id: this._id('a'), tokens: DictationLattice.tokenize(text), source: 'user', first: now, last: now, count: 1 };
        const choice = { type: 'choice', id: this._id('c'), alts: [eng, usr], selected: usr.id, engineAlt: eng.id, pinned: true };
        const before = toks.slice(0, k), after = toks.slice(k + 1), repl = [];
        if (before.length) repl.push({ type: 'text', tokens: before });
        repl.push(choice);
        if (after.length) repl.push({ type: 'text', tokens: after });
        span.segments.splice(si, 1, ...repl);
        span.lastInteract = now;
        this._learn(choice, usr);
        this._emit('select', spanId);
        return true;
      }
      p += n;
    }
    return false;
  }

  /** Set or clear attributes of the joint after word idx. patch: {punct:'.'|null, cap:true|false|null}. null clears. */
  setJoint(spanId, idx, patch) {
    const span = this.spans.get(spanId); if (!span) return false;
    if (this.recordLog) this.log.push({ t: this.now(), op: 'joint', spanId, idx, patch });
    span.joints = span.joints || {};
    const j = { ...(span.joints[idx] || {}) };
    for (const k of Object.keys(patch)) { if (patch[k] === null || patch[k] === undefined) delete j[k]; else j[k] = patch[k]; }
    if (Object.keys(j).length) span.joints[idx] = j; else delete span.joints[idx];
    span.lastInteract = this.now();
    this._emit('joint', spanId);
    return true;
  }

  jointFor(spanId, idx) { const s = this.spans.get(spanId); return (s && s.joints && s.joints[idx]) || null; }

  unpin(choiceId) {
    const f = this.findChoice(choiceId); if (!f) return false;
    if (this.recordLog) this.log.push({ t: this.now(), op: 'unpin', choiceId });
    f.choice.pinned = false; f.choice.selected = f.choice.engineAlt;
    this._emit('select', f.span.id);
    return true;
  }

  setWriteHead(spanId) {
    if (spanId !== null && !this.spans.has(spanId)) return;
    if (this.recordLog) this.log.push({ t: this.now(), op: 'head', spanId });
    this.writeAfter = spanId;
    this._emit('head', spanId);
  }

  touch(spanId) { const s = this.spans.get(spanId); if (s) s.lastInteract = this.now(); }

  _learn(choice, alt) {
    const eng = choice.alts.find(a => a.id === choice.engineAlt);
    const heard = eng.tokens.join(' '), chose = alt.tokens.join(' ');
    if (heard === chose) return;
    const k = heard + '|' + chose;
    this.corrections.set(k, (this.corrections.get(k) || 0) + 1);
  }

  suggestedRules(min = 2) {
    return [...this.corrections.entries()].filter(([, c]) => c >= min).map(([k, c]) => {
      const [heard, chose] = k.split('|'); return { heard, chose, count: c };
    });
  }

  finalizeAll() { this.spans.forEach(s => { s.final = true; }); this._emit('finalize'); }

  // ---------- reading ----------
  /** Resolved tokens of a span. idx = position in the resolved stream (an empty/deleted choice still occupies one slot). */
  items(span) {
    const out = [];
    let idx = 0;
    for (const seg of span.segments) {
      if (seg.type === 'text') seg.tokens.forEach(t => out.push({ text: t, spanId: span.id, choiceId: null, idx: idx++ }));
      else {
        const a = seg.alts.find(x => x.id === seg.selected);
        if (!a.tokens.length) out.push({ text: '', empty: true, spanId: span.id, choiceId: seg.id, alts: seg.alts.length, pinned: seg.pinned, idx: idx++ });
        else a.tokens.forEach(t => out.push({ text: t, spanId: span.id, choiceId: seg.id, alts: seg.alts.length, pinned: seg.pinned, idx: idx++ }));
      }
    }
    return out;
  }

  allItems() {
    const out = [];
    for (const id of this.order) { const s = this.spans.get(id); if (s) this.items(s).forEach(i => out.push(i)); }
    return out;
  }

  // ---------- time / aging ----------
  _age(span) { return this.now() - Math.max(span.lastT, span.lastInteract || 0); }

  tierOf(span) {
    const age = this._age(span);
    if (!span.final && age < 15000) return 'hot';
    return age < this.hotMs ? 'hot' : age < this.warmMs ? 'warm' : 'cold';
  }

  _normalize(span) {
    const out = [];
    for (const s of span.segments) {
      let seg = s;
      if (seg.type === 'choice' && seg.alts.length === 1) seg = { type: 'text', tokens: seg.alts[0].tokens.slice() };
      if (seg.type === 'text') {
        if (!seg.tokens.length) continue;
        const l = out[out.length - 1];
        if (l && l.type === 'text') l.tokens = l.tokens.concat(seg.tokens);
        else out.push({ type: 'text', tokens: seg.tokens.slice() });
      } else out.push(seg);
    }
    span.segments = out;
  }

  /** hot: full detail. warm: selected + engine + top few alts. cold: plain resolved text only. */
  compact() {
    let changed = false;
    for (const span of this.spans.values()) {
      if (span.collapsed) continue;
      const tier = this.tierOf(span);
      if (tier === 'hot') continue;
      if (tier === 'warm') {
        for (const s of span.segments) {
          if (s.type !== 'choice' || s.alts.length <= this.keepAlts + 2) continue;
          const keep = new Set([s.selected, s.engineAlt]);
          s.alts.slice().sort((a, b) => b.last - a.last).forEach(a => { if (keep.size < 2 + this.keepAlts) keep.add(a.id); });
          s.alts = s.alts.filter(a => keep.has(a.id));
          changed = true;
        }
        this._normalize(span);
      } else {
        const toks = this.items(span).filter(i => !i.empty).map(i => i.text);
        span.segments = toks.length ? [{ type: 'text', tokens: toks }] : [];
        span.collapsed = true;
        changed = true;
      }
    }
    return changed;
  }

  stats() {
    const st = { spans: this.spans.size, hot: 0, warm: 0, cold: 0, choices: 0, alts: 0, corrections: this.corrections.size };
    for (const s of this.spans.values()) {
      st[this.tierOf(s)]++;
      s.segments.forEach(g => { if (g.type === 'choice') { st.choices++; st.alts += g.alts.length; } });
    }
    return st;
  }

  reset() {
    this.spans.clear(); this.order = []; this.keyToSpan.clear(); this.writeAfter = null; this.log = [];
    this._emit('reset');
  }

  static replay(log, opts = {}) {
    let t = 0;
    const L = new DictationLattice({ ...opts, now: () => t, recordLog: false });
    for (const e of log) {
      t = e.t;
      if (e.op === 'ingest') L.ingest(e.key, e.text, { final: e.final, asAlt: e.asAlt, confidence: e.confidence });
      else if (e.op === 'select') L.select(e.choiceId, e.altId);
      else if (e.op === 'addAlt') L.addAlternative(e.choiceId, e.text);
      else if (e.op === 'editWord') L.editWord(e.spanId, e.idx, e.text);
      else if (e.op === 'joint') L.setJoint(e.spanId, e.idx, e.patch);
      else if (e.op === 'unpin') L.unpin(e.choiceId);
      else if (e.op === 'head') L.setWriteHead(e.spanId);
    }
    return L;
  }
}

globalThis.DictationLattice = DictationLattice;
if (typeof module !== 'undefined' && module.exports) module.exports = DictationLattice;