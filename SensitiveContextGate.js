class SensitiveContextGate {
  static STORAGE_KEY = 'dr_sensitive_unlocked';
  static CODE_KEY = 'dr_sensitive_code';
  static DEFAULT_CODES = ['family', 'poa', 'rob'];

  static isUnlocked() {
    try {
      return localStorage.getItem(this.STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  static unlockWithCode(input) {
    const clean = String(input || '').trim().toLowerCase();
    if (!clean) return false;
    const custom = (localStorage.getItem(this.CODE_KEY) || '').trim().toLowerCase();
    const valid = (custom && clean === custom) || this.DEFAULT_CODES.includes(clean);
    if (valid) {
      try { localStorage.setItem(this.STORAGE_KEY, 'true'); } catch (e) {}
      return true;
    }
    return false;
  }

  static lock() {
    try { localStorage.setItem(this.STORAGE_KEY, 'false'); } catch (e) {}
  }

  static renderLockedBlock(blockDef, onUnlock) {
        const label = blockDef.sensitiveLabel || 'Additional Personal & Family Context';
        const summary = blockDef.sensitiveSummary || 'This section is hidden in default view so primary engineering, economic, and current stability topics remain clear. Enter the optional access code to view.';
        const card = makeElement('div', {
          className: 'dr-block-wrapper dr-sensitive-locked-card',
          id: `block-${blockDef.id}`,
          'data-block-id': blockDef.id,
          'data-block': blockDef.id,
          style: {
            margin: '18px 0', padding: '14px 18px', borderRadius: '8px',
            background: 'rgba(15, 23, 42, 0.72)', border: '1px dashed rgba(148, 163, 184, 0.45)',
            borderLeft: '4px solid #64748b', fontFamily: 'var(--dr-font-sans, system-ui)'
          }
        });

        const input = makeElement('input', {
          type: 'password',
          placeholder: 'Enter access code...',
          style: {
            background: '#070a13', color: '#f8fafc', border: '1px solid #334155',
            borderRadius: '6px', padding: '5px 10px', fontSize: '12px', width: '170px', outline: 'none'
          }
        });

        const errMsg = makeElement('span', { style: { fontSize: '11px', color: '#f87171', display: 'none' } }, 'Incorrect code.');

        const attempt = () => {
          if (this.unlockWithCode(input.value)) {
            if (typeof onUnlock === 'function') onUnlock();
          } else {
            errMsg.style.display = 'inline';
            input.focus();
          }
        };

        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });

        const btn = makeElement('button', {
          className: 'dr-nav-btn',
          style: { padding: '5px 12px', fontSize: '11.5px', fontWeight: '700', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.45)' },
          onclick: (e) => { e.stopPropagation(); attempt(); }
        }, '🔓 Unlock');

        card.append(
          makeElement('div', { style: { fontSize: '12px', fontWeight: '800', color: '#cbd5e1', marginBottom: '4px' } }, `🔒 ${label} (Hidden by Default)`),
          makeElement('p', { style: { margin: '0 0 10px 0', fontSize: '12px', color: '#94a3b8', lineHeight: '1.5' } }, summary),
          makeElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [input, btn, errMsg])
        );
        return card;
      }
  static syncToolbarButton(reader) {
      if (!reader || !reader.navBar) return;
      const rightGroup = reader.navBar.lastElementChild;
      if (!rightGroup) return;

      let btn = document.getElementById('dr-btn-sensitive-lock');
      if (!btn) {
        btn = makeElement('button', {
          className: 'dr-nav-btn',
          id: 'dr-btn-sensitive-lock',
          style: { padding: '5px 10px', fontSize: '0.76rem', fontWeight: '700', borderRadius: '16px' },
          onclick: () => {
            if (this.isUnlocked()) {
              this.lock();
              reader.renderCurrentDocument();
            } else {
              const code = prompt('Enter access code to view sensitive family context:');
              if (code && this.unlockWithCode(code)) {
                reader.renderCurrentDocument();
              } else if (code !== null) {
                alert('Access code not recognized.');
              }
            }
          }
        });
        rightGroup.insertBefore(btn, rightGroup.lastElementChild);
      }

      const unlocked = this.isUnlocked();
      btn.textContent = unlocked ? '🔓 Lock Sensitive' : '🔒 Locked';
      btn.title = unlocked
        ? 'Click to immediately re-lock sensitive family context before sharing'
        : 'Sensitive family context is hidden. Click to unlock.';
      btn.style.color = unlocked ? '#f59e0b' : '#94a3b8';
      btn.style.borderColor = unlocked ? 'rgba(245, 158, 11, 0.5)' : 'var(--dr-border)';
    }
}

globalThis.SensitiveContextGate = SensitiveContextGate;
if (typeof module !== 'undefined' && module.exports) module.exports = SensitiveContextGate;