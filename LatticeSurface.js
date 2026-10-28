/**
 * LatticeSurface: the view. The lattice is the source of truth; this never reads a caret from the DOM.
 * Two independent cursors:
 *   - WRITE HEAD (cyan bar): where new speech lands. Moved only by Alt+click on a span or clicking blank space.
 *   - EDIT SELECTION (word + joint): what the mouse/keyboard are manipulating. Never moves the write head.
 * Text size never changes. Age is shown only by colour.
 */
class LatticeSurface {
  static h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'className') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    kids.flat().forEach(c => { if (c == null || c === false) return; el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return el;
  }

  constructor(container, lattice, policy, opts = {}) {
    this.container = container;
    this.lattice = lattice;
    this.policy = policy;
    this.openChoice = null;
    this.openRule = null;
    this.ruleRect = null;
    this.edit = null;          // { wk, spanId, idx, jointKey }
    this.typing = null;        // string being typed over the selected word, or null
    this._shiftTap = false;
    this._popSig = '';
    this._sig = '';
    this._raf = 0;
    policy.jointLookup = (s, i) => lattice.jointFor(s, i);
    this._injectStyles();
    this._build();
    this._unsubL = lattice.on(() => this.requestRender());
    this._unsubP = policy.on(() => this.requestRender());
    this._timer = setInterval(() => {
      const ch = this.lattice.compact();
      const sig = this.lattice.order.map(id => { const s = this.lattice.spans.get(id); return s ? this.lattice.tierOf(s)[0] + (s.final ? 'f' : 'l') : ''; }).join('');
      if (ch || sig !== this._sig) { this._sig = sig; this.render(); }
    }, 1000);
    this.render();
  }

  _injectStyles() {
    const css = `
      .ls-root{height:100%;overflow:auto;padding:18px 22px 80px;box-sizing:border-box;background:#090d16;color:#f1f5f9;outline:none;
        font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;font-size:16px;line-height:1.9;cursor:text}
      .ls-empty-hint{color:#64748b;font-style:italic}
      .ls-span{border-radius:6px}
      .ls-hot{color:#f8fafc}.ls-warm{color:#e2e8f0}.ls-cold{color:#cbd5e1}
      .ls-live{background:rgba(0,255,102,.07);box-shadow:0 0 0 1px rgba(0,255,102,.35);padding:1px 4px}
      .ls-hot .ls-choice,.ls-warm .ls-choice{border-bottom:2px dotted #00f2fe;cursor:pointer}
      .ls-choice.ls-pinned{border-bottom:2px solid #c084fc!important}
      .ls-w{border-radius:4px;cursor:pointer}
      .ls-w:hover{background:rgba(0,242,254,.10)}
      .ls-joint{white-space:pre;border-radius:3px;cursor:pointer}
      .ls-sel{background:rgba(0,242,254,.22)!important;box-shadow:0 0 0 1px rgba(0,242,254,.5)}
      .ls-joint-sel{background:rgba(0,255,102,.38)!important;box-shadow:0 0 0 1px rgba(0,255,102,.6)}
      .ls-typing{color:#fbbf24;border-bottom:2px solid #fbbf24}
      .ls-rule{border-bottom:1px dashed #f59e0b}
      .ls-cmd{color:#7dd3fc;border-bottom:1px dashed #38bdf8}
      .ls-literal{color:#fbbf24;border-bottom:1px dashed #fbbf24}
      .ls-brk{opacity:.5}
      .ls-head{display:inline-block;width:3px;height:1.2em;background:#00f2fe;vertical-align:text-bottom;margin:0 3px;border-radius:2px;box-shadow:0 0 8px #00f2fe}
      .ls-pop{position:fixed;z-index:2147483647;display:none;min-width:240px;max-width:360px;background:#0f1624;
        border:1.5px solid #00f2fe;border-radius:10px;padding:10px;box-shadow:0 14px 40px rgba(0,0,0,.85),0 0 18px rgba(0,242,254,.25);
        font-family:system-ui,sans-serif;font-size:12.5px;color:#e2e8f0}
      .ls-pop-title{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#00f2fe;margin-bottom:8px}
      .ls-chips{display:flex;flex-direction:column;gap:5px}
      .ls-chip{display:flex;align-items:center;gap:8px;justify-content:space-between;text-align:left;cursor:pointer;
        background:rgba(255,255,255,.04);border:1px solid #1e293b;border-radius:7px;padding:6px 9px;color:#e2e8f0;font:inherit}
      .ls-chip:hover{border-color:#00f2fe}
      .ls-chip.sel{background:rgba(0,242,254,.14);border-color:#00f2fe}
      .ls-chip-t{font-weight:700}
      .ls-chip-m{color:#64748b;font-size:10.5px;margin-left:auto}
      .ls-chip-ok{color:#00f2fe;font-weight:800}
      .ls-row{display:flex;gap:6px;margin-top:8px}
      .ls-in{flex:1;background:#070a13;border:1px solid #30363d;border-radius:6px;color:#00f2fe;padding:5px 8px;font:inherit;outline:none}
      .ls-btn{background:rgba(255,255,255,.05);border:1px solid #334155;border-radius:6px;color:#e2e8f0;padding:5px 10px;cursor:pointer;font:inherit;font-weight:700}
      .ls-btn:hover{border-color:#00f2fe}
      .ls-btn.pri{background:linear-gradient(135deg,#0284c7,#00f2fe);color:#070a13;border:none}
      .ls-leader{position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646;display:none;overflow:visible}
      .ls-leader path{fill:none;stroke:#00f2fe;stroke-width:2;filter:drop-shadow(0 0 4px #00f2fe)}
    `;
    if (typeof applyCss === 'function') applyCss(css, 'LatticeSurfaceStyles');
    else {
      let s = document.getElementById('LatticeSurfaceStyles');
      if (!s) { s = document.createElement('style'); s.id = 'LatticeSurfaceStyles'; document.head.appendChild(s); }
      s.textContent = css;
    }
  }

  _build() {
    const h = LatticeSurface.h;
    this.doc = h('div', { className: 'ls-doc' });
    this.root = h('div', { className: 'ls-root', tabindex: '0', role: 'document', 'aria-label': 'Dictation document' }, this.doc);
    this.pop = h('div', { className: 'ls-pop' });
    const NS = 'http://www.w3.org/2000/svg';
    this.leader = document.createElementNS(NS, 'svg');
    this.leader.setAttribute('class', 'ls-leader');
    this.leaderPath = document.createElementNS(NS, 'path');
    this.leader.appendChild(this.leaderPath);
    this.container.appendChild(this.root);
    document.body.appendChild(this.pop);
    document.body.appendChild(this.leader);

    this.root.addEventListener('click', e => this._onClick(e));
    this.root.addEventListener('keydown', this._onRootKey = e => this._handleKey(e));
    this.root.addEventListener('keyup', this._onRootKeyUp = e => {
      if (e.key === 'Shift' && this._shiftTap && this.typing === null) this._toggleCap();
      if (e.key === 'Shift') this._shiftTap = false;
    });
    this.root.addEventListener('blur', () => this._commitTyping());
    this.root.addEventListener('pointermove', e => {
      const sp = e.target.closest && e.target.closest('.ls-span');
      if (sp) this.lattice.touch(sp.dataset.span);
    });
    this.root.addEventListener('scroll', () => this._syncPopover(), { passive: true });
    window.addEventListener('resize', this._onResize = () => this._syncPopover());
    document.addEventListener('pointerdown', this._onDown = e => {
      if (!this.openChoice && !this.openRule) return;
      if (this.pop.contains(e.target) || (e.target.closest && e.target.closest('.ls-w'))) return;
      this._closePopover();
    }, true);
    document.addEventListener('keydown', this._onDocKey = e => { if (e.key === 'Escape') this._closePopover(); });
  }

  requestRender() { if (!this._raf) this._raf = requestAnimationFrame(() => this.render()); }

  _head() { return LatticeSurface.h('span', { className: 'ls-head', title: 'Write head: new speech goes here' }); }

  render() {
    this._raf = 0;
    const h = LatticeSurface.h, L = this.lattice, doc = this.doc;
    const nearBottom = this.root.scrollHeight - this.root.scrollTop - this.root.clientHeight < 90;
    const items = this.policy.apply(L.allItems());
    const bySpan = new Map();
    for (const it of items) { if (!bySpan.has(it.spanId)) bySpan.set(it.spanId, []); bySpan.get(it.spanId).push(it); }

    doc.replaceChildren();
    if (!L.order.length) doc.appendChild(h('span', { className: 'ls-empty-hint' }, 'Nothing dictated yet. Start listening or run a demo. Open 📖 Docs for how this works.'));
    if (L.writeAfter === null) doc.appendChild(this._head());

    let prev = null;
    for (const id of L.order) {
      const span = L.spans.get(id), group = bySpan.get(id);
      if (span && group) {
        const tier = L.tierOf(span);
        const el = h('span', { className: `ls-span ls-${tier}${span.final ? '' : ' ls-live'}`, 'data-span': id });
        for (const it of group) {
          const common = { 'data-span': it.spanId, 'data-idx': it.idx, 'data-wk': `${it.spanId}:${it.idx}`, 'data-jk': it.jointKey };
          if (it.empty) {
            el.appendChild(h('span', { className: 'ls-w ls-choice', 'data-choice': it.choiceId, title: 'Deleted by choice', ...common }, '⌀'));
            prev = it; continue;
          }
          if (DictationPolicy.needsSpace(prev, it)) el.appendChild(h('span', { className: 'ls-joint', 'data-joint': prev.jointKey }, ' '));
          const cls = ['ls-w'];
          if (it.choiceId && it.alts > 1) cls.push('ls-choice');
          if (it.pinned) cls.push('ls-pinned');
          if (it.jointPunct) { /* plain: user-set punctuation */ }
          else if (it.kind === 'rule') cls.push('ls-rule');
          else if (it.kind === 'literal') cls.push('ls-literal');
          else if (it.kind === 'punct' || it.kind === 'break') cls.push('ls-cmd');
          let text = it.text;
          if (this.typing !== null && this.edit && it.wk === undefined && !it.kind && it.spanId === this.edit.spanId && it.idx === this.edit.idx) {
            text = this.typing || '…'; cls.push('ls-typing');
          }
          const attrs = {
            className: cls.join(' '), ...common,
            'data-choice': it.choiceId && it.alts > 1 ? it.choiceId : null,
            'data-phrase': it.phrase || null, 'data-raw': it.raw || null, 'data-kind': it.kind || null,
            'data-jp': it.jointPunct ? '1' : null,
            'data-joint': it.kind === 'punct' ? it.jointKey : null
          };
          if (it.kind === 'break') {
            el.appendChild(h('span', { ...attrs, className: attrs.className + ' ls-brk' }, '¶'));
            el.appendChild(h('br')); el.appendChild(h('br'));
          } else el.appendChild(h('span', attrs, text));
          prev = it;
        }
        doc.appendChild(el);
      }
      if (id === L.writeAfter) doc.appendChild(this._head());
    }
    if (nearBottom && !this.edit) this.root.scrollTop = this.root.scrollHeight;
    this._applySel();
    this._syncPopover();
  }

  // ---------- edit selection (word + joint) ----------
  _parseKey(key) { const c = key.lastIndexOf(':'); return [key.slice(0, c), +key.slice(c + 1)]; }

  _applySel() {
    this.doc.querySelectorAll('.ls-sel,.ls-joint-sel').forEach(n => n.classList.remove('ls-sel', 'ls-joint-sel'));
    if (!this.edit) return;
    this.doc.querySelectorAll(`[data-wk="${this.edit.wk}"]`).forEach(n => { if (!n.dataset.jp) n.classList.add('ls-sel'); });
    if (this.edit.jointKey) this.doc.querySelectorAll(`[data-joint="${this.edit.jointKey}"]`).forEach(n => n.classList.add('ls-joint-sel'));
  }

  /** Select a word and the nearest joint. Click in the left half of a word -> joint before it; right half -> joint after. */
  _pick(el, e) {
    this._commitTyping();
    let jk = el.dataset.jk || null;
    if (e) {
      const r = el.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 2) {
        const pv = el.previousElementSibling;
        if (pv && pv.classList.contains('ls-joint') && pv.dataset.joint) jk = pv.dataset.joint;
      }
    }
    this.edit = { wk: el.dataset.wk, spanId: el.dataset.span, idx: +el.dataset.idx, jointKey: jk };
    this.typing = null;
    this._applySel();
  }

  _pickJoint(j) {
    const pv = j.previousElementSibling;
    if (!pv || !pv.dataset.wk) return;
    this._commitTyping();
    this.edit = { wk: pv.dataset.wk, spanId: pv.dataset.span, idx: +pv.dataset.idx, jointKey: j.dataset.joint };
    this._applySel();
  }

  _commitTyping() {
    if (this.typing === null) return;
    const t = this.typing; this.typing = null;
    if (t.length && this.edit) this.lattice.editWord(this.edit.spanId, this.edit.idx, t);
    else this.requestRender();
  }

  _move(dir) {
    if (!this.edit) return;
    this._commitTyping();
    const els = [...this.doc.querySelectorAll('.ls-w[data-wk]')].filter(n => !n.dataset.jp);
    const i = els.findIndex(n => n.dataset.wk === this.edit.wk);
    const t = els[i + dir];
    if (t) { this._pick(t, null); t.scrollIntoView({ block: 'nearest' }); }
  }

  _toggleCap() {
    const key = this.edit && this.edit.jointKey;
    if (!key) return;
    const sp = this.doc.querySelector(`.ls-joint[data-joint="${key}"]`);
    let n = sp && sp.nextElementSibling;
    while (n && !(n.dataset && n.dataset.wk && !n.dataset.jp)) n = n.nextElementSibling;
    if (!n) return;
    const t = n.textContent, isUp = t.charAt(0) !== t.charAt(0).toLowerCase();
    const [s, i] = this._parseKey(key);
    this.lattice.setJoint(s, i, { cap: !isUp });
  }

  _handleKey(e) {
    if (!this.edit || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, L = this.lattice;
    if (k === 'Shift') { if (!e.repeat) this._shiftTap = true; return; }
    this._shiftTap = false;

    if (k === 'Escape') { e.preventDefault(); if (this.typing !== null) { this.typing = null; this.requestRender(); } else { this.edit = null; this._applySel(); } return; }
    if (k === 'ArrowRight') { e.preventDefault(); this._move(1); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); this._move(-1); return; }
    if (k === 'Enter') { e.preventDefault(); this._commitTyping(); return; }

    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      if (this.typing !== null) { this.typing = this.typing.slice(0, -1); this.requestRender(); }
      else L.editWord(this.edit.spanId, this.edit.idx, '');
      return;
    }

    const jointKeyed = key => { if (!key) return null; return this._parseKey(key); };
    if (k.length === 1 && '.,;:?!'.includes(k)) {
      e.preventDefault(); this._commitTyping();
      const jk = jointKeyed(this.edit.jointKey);
      if (jk) L.setJoint(jk[0], jk[1], { punct: k });
      return;
    }
    if (k === ' ') {
      e.preventDefault(); this._commitTyping();
      const jk = jointKeyed(this.edit.jointKey);
      if (jk) L.setJoint(jk[0], jk[1], { punct: null });
      return;
    }
    if (k.length === 1) {
      e.preventDefault();
      this.typing = (this.typing || '') + k;
      this.requestRender();
    }
  }

  // ---------- clicks ----------
  _onClick(e) {
    const L = this.lattice;
    const w = e.target.closest('.ls-w'), sp = e.target.closest('.ls-span'), j = e.target.closest('.ls-joint');
    this.root.focus({ preventScroll: true });
    if (e.altKey && sp) { L.setWriteHead(sp.dataset.span); return; }
    if (w && w.dataset.wk) {
      this._pick(w, e);
      if (w.dataset.choice) {
        if (sp) L.touch(sp.dataset.span);
        this.openRule = null; this.openChoice = w.dataset.choice; this._popSig = ''; this._syncPopover();
      } else if (w.dataset.kind && !w.dataset.jp) this._openRulePopover(w);
      else this._closePopover();
      return;
    }
    if (j) { this._pickJoint(j); this._closePopover(); return; }
    if (!sp && L.order.length) {
      this._commitTyping(); this.edit = null; this._applySel();
      L.setWriteHead(L.order[L.order.length - 1]); this._closePopover(); return;
    }
    this._closePopover();
  }

  _closePopover() { this.openChoice = null; this.openRule = null; this._popSig = ''; this._syncPopover(); }

  _ago(t) { const s = Math.max(0, Math.round((this.lattice.now() - t) / 1000)); return s < 2 ? 'now' : s + 's ago'; }

  _syncPopover() {
    if (!this.openChoice && !this.openRule) { this.pop.style.display = 'none'; this.leader.style.display = 'none'; return; }
    if (this.openChoice) {
      const f = this.lattice.findChoice(this.openChoice);
      if (!f) { this.openChoice = null; return this._syncPopover(); }
      const sig = JSON.stringify([f.choice.alts.map(a => a.id), f.choice.selected, f.choice.engineAlt, f.choice.pinned]);
      if (sig !== this._popSig) { this._popSig = sig; this._buildChoicePopover(f); }
      const anchor = this.doc.querySelector(`[data-choice="${this.openChoice}"]`);
      this._place(anchor ? anchor.getBoundingClientRect() : null);
    } else this._place(this.ruleRect);
  }

  _buildChoicePopover({ choice }) {
    const h = LatticeSurface.h, L = this.lattice;
    const keepVal = this.pop.querySelector('.ls-in')?.value || '';
    const eng = choice.alts.find(a => a.id === choice.engineAlt);
    const sel = choice.alts.find(a => a.id === choice.selected);
    const alts = choice.alts.slice().sort((a, b) => ((b.id === choice.selected) - (a.id === choice.selected)) || (b.last - a.last));

    const list = h('div', { className: 'ls-chips' });
    alts.forEach(a => {
      const isSel = a.id === choice.selected;
      const meta = [a.source === 'engine' ? '' : a.source, a.count > 1 ? '×' + a.count : '', this._ago(a.last)].filter(Boolean).join(' · ');
      list.appendChild(h('button', { className: 'ls-chip' + (isSel ? ' sel' : ''), onclick: () => L.select(choice.id, a.id) },
        h('span', { className: 'ls-chip-t' }, a.tokens.join(' ') || '∅ (nothing)'),
        h('span', { className: 'ls-chip-m' }, meta),
        isSel ? h('span', { className: 'ls-chip-ok' }, '✓') : null));
    });

    const input = h('input', { className: 'ls-in', placeholder: 'Type your own…', value: keepVal });
    const useIt = () => { if (input.value.trim() || confirm('Delete these words?')) L.addAlternative(choice.id, input.value); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); useIt(); } });

    this.pop.replaceChildren(
      h('div', { className: 'ls-pop-title' }, 'Heard as…' + (choice.pinned ? '   📌 pinned' : '')),
      list,
      h('div', { className: 'ls-row' }, input, h('button', { className: 'ls-btn pri', onclick: useIt }, 'Use')),
      (choice.selected !== choice.engineAlt || choice.pinned) ? h('div', { className: 'ls-row' },
        choice.selected !== choice.engineAlt ? h('button', { className: 'ls-btn', title: 'Learn a replacement rule',
          onclick: () => { this.policy.addRule(eng.tokens.join(' '), sel.tokens.join(' ')); } }, `Always: “${eng.tokens.join(' ')}” → “${sel.tokens.join(' ')}”`) : null,
        choice.pinned ? h('button', { className: 'ls-btn', onclick: () => L.unpin(choice.id) }, 'Unpin') : null) : null
    );
  }

  _openRulePopover(w) {
    const h = LatticeSurface.h;
    const phrase = w.dataset.phrase, raw = w.dataset.raw, kind = w.dataset.kind;
    this.openChoice = null; this.openRule = { phrase, raw, kind };
    this.ruleRect = w.getBoundingClientRect();
    const rows = [h('div', { className: 'ls-pop-title' }, kind === 'rule' ? 'Replacement rule' : kind === 'literal' ? 'Literal' : 'Voice command'),
      h('div', {}, `You said “${raw || phrase}”`)];
    if (phrase) rows.push(h('div', { className: 'ls-row' },
      h('button', { className: 'ls-btn', onclick: () => { this.policy.setDisabled(phrase, true); this._closePopover(); } }, 'Treat as plain words'),
      kind === 'rule' ? h('button', { className: 'ls-btn', onclick: () => { this.policy.removeRule(phrase); this._closePopover(); } }, 'Delete rule') : null));
    else rows.push(h('div', { style: { color: '#94a3b8', marginTop: '6px' } }, 'Forced literal with the word “literal”.'));
    this.pop.replaceChildren(...rows);
    this._place(this.ruleRect);
  }

  _place(rect) {
    const pop = this.pop;
    pop.style.display = 'block';
    if (!rect) { this.leader.style.display = 'none'; return; }
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - pw - 8, rect.left + rect.width / 2 - pw / 2));
    let top = rect.bottom + 34;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 34);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';

    const dir = top > rect.bottom ? 1 : -1;
    const sx = rect.left + rect.width / 2, sy = dir > 0 ? rect.bottom : rect.top;
    const ex = left + pw / 2, ey = dir > 0 ? top : top + ph;
    this.leaderPath.setAttribute('d', `M ${sx},${sy} C ${sx},${sy + 30 * dir} ${ex},${ey - 30 * dir} ${ex},${ey}`);
    this.leader.style.display = 'block';
  }

  getText() { return this.policy.toText(this.policy.apply(this.lattice.allItems())); }

  destroy() {
    clearInterval(this._timer);
    cancelAnimationFrame(this._raf);
    this._unsubL && this._unsubL(); this._unsubP && this._unsubP();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('pointerdown', this._onDown, true);
    document.removeEventListener('keydown', this._onDocKey);
    this.pop.remove(); this.leader.remove(); this.root.remove();
  }
}

globalThis.LatticeSurface = LatticeSurface;
if (typeof module !== 'undefined' && module.exports) module.exports = LatticeSurface;