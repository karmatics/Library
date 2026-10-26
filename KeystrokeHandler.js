class KeystrokeHandler {
  /**
   * Keystroke Dispatcher with on-screen visual feedback for Aardvark & CAD tools.
   */
  static handlers = new Map();
  static isInitialized = false;

  static init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    window.addEventListener('keydown', (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

      const key = e.key;
      const lower = key.toLowerCase();

      let match = this.handlers.get(key) || this.handlers.get(lower);
      if (!match) {
        for (const [k, v] of this.handlers.entries()) {
          if (k.toLowerCase() === lower) { match = v; break; }
        }
      }

      if (match) {
        e.preventDefault();
        e.stopPropagation();

        const name = typeof match.cmd === 'object' ? match.cmd.name : match.cmd;
        const suppress = typeof match.cmd === 'object' ? match.cmd.suppressPopup : false;

        if (!suppress) {
          this.showPopup(`${key.toUpperCase()} ${name || ''}`);
        }

        try {
          match.handler(e);
        } catch (err) {
          console.error('[KeystrokeHandler] execution error for', key, err);
        }
      }
    }, true);
  }

  static addHandler(command, handler) {
    this.init();
    const key = typeof command === 'string' ? command : command.key;
    if (key) {
      this.handlers.set(key, { cmd: command, handler });
    }
  }

  static removeHandler(command) {
    const key = typeof command === 'string' ? command : command.key;
    if (key) {
      this.handlers.delete(key);
    }
  }

  static showPopup(text) {
    if (typeof KeyCommandHandler !== 'undefined' && typeof KeyCommandHandler.showFollowupBox === 'function') {
      KeyCommandHandler.showFollowupBox(text, window.innerWidth / 2, 140);
    } else if (typeof PopupBox !== 'undefined' && typeof PopupBox.makeBox === 'function') {
      const box = PopupBox.makeBox([255, 235, 0]);
      box.textContent = text;
      PopupBox.showBox(box, true, window.innerWidth / 2 - 80, 140);
      setTimeout(() => box.remove(), 1200);
    }
  }

  static activate() { this.init(); }
  static deactivate() {}
}

globalThis.KeystrokeHandler = KeystrokeHandler;
if (typeof module !== 'undefined' && module.exports) module.exports = KeystrokeHandler;