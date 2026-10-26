class PopupBox {
  /**
   * Authentic On-Screen Feedback Popup for KeyCommandHandler.
   */
  static activeBoxes = [];

  static makeBox(rgb = [255, 235, 0], isTopLevel = false) {
    const box = document.createElement('div');
    box.className = 'keyShortcutBox' + (isTopLevel ? ' keyShortcutTopLevel' : '');
    box.setAttribute('data-style-exclude', '');

    const [r, g, b] = rgb;
    Object.assign(box.style, {
      position: 'fixed',
      zIndex: '1000000',
      padding: '8px 14px',
      borderRadius: '6px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: '13px',
      fontWeight: 'bold',
      lineHeight: '1.4',
      background: `rgba(${r}, ${g}, ${b}, 0.95)`,
      color: (r > 150 && g > 150) ? '#000000' : '#ffffff',
      border: `1.5px solid rgba(0, 0, 0, 0.3)`,
      boxShadow: '0 6px 22px rgba(0,0,0,0.6), 0 0 12px rgba(255,255,255,0.2)',
      pointerEvents: 'none',
      userSelect: 'none',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      opacity: '0',
      transform: 'scale3d(0.9, 0.9, 1)'
    });

    PopupBox.activeBoxes.push(box);
    return box;
  }

  static showBox(elem, animate = false, x = 20, y = 140) {
    if (!elem) return;
    elem.style.left = `${x}px`;
    elem.style.top = `${y}px`;
    document.body.appendChild(elem);

    requestAnimationFrame(() => {
      elem.style.opacity = '1';
      elem.style.transform = 'scale3d(1, 1, 1)';
    });
  }

  static ok() { return false; }

  static cancel() {
    if (PopupBox.activeBoxes.length > 0) {
      PopupBox.activeBoxes.forEach(b => {
        try { b.remove(); } catch(e) {}
      });
      PopupBox.activeBoxes = [];
      return true;
    }
    return false;
  }
}

globalThis.PopupBox = PopupBox;
if (typeof module !== 'undefined' && module.exports) module.exports = PopupBox;