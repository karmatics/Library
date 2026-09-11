// --- START OF FILE GlowPiano.js ---
class GlowPiano {
  constructor(graphicPiano, options = {}) {
    this.basePiano = graphicPiano;
    this.svg = graphicPiano.getSvgElement();
    this.keysData = graphicPiano.getKeysData();

    this.saturatedColors = [
      [255, 0, 0], null, [255, 128, 0], null, [255, 255, 0],
      [0, 255, 0], null, [0, 90, 255], null, [128, 0, 255], null, [255, 0, 255]
    ];

    this.settings = {
      monochrome: false,
      pastelFactor: 0.7,
      borderPastelFactor: 0.3,
      borderThickness: 4,
      blackBorderThickness: 2,
      darkGray: [51, 51, 51],
      glowThickness: 10,
      blurRadius: 4,
      gradientTransition: 2,
      activePastelFactor: 0.15,
      whiteGlowThickness: 10,
      blackGlowThickness: 10,
      whiteBlurRadius: 4,
      blackBlurRadius: 4,
      blackPastelFactor: 0.3,
      minPlayTime: 1000,
      inactiveWhiteFillColor: [180, 180, 180],
      inactiveBlackFillColor: [180, 180, 180],
      inactiveBorderColor: [80, 80, 80],
      semiActivePastelFactor: 0.4,
      semiActiveBlackPastelFactor: 0.5,
      semiActiveWhiteGlowThickness: 6,
      semiActiveBlackGlowThickness: 6,
      semiActiveWhiteBlurRadius: 2,
      semiActiveBlackBlurRadius: 2,
      blackKeyHitboxWidthFactor: 1.5,
      blackKeyHitboxHeightFactor: 1.05,
      blackKeyHitboxVerticalOffset: 0
    };

    Object.assign(this.settings, options);
    this.noteCallback = null;
    this.activeNotes = new Map();
    this.touchStates = new Map();
  }

  setNoteCallback(callback) {
    this.noteCallback = callback;
  }

  setMonochrome(isMonochrome) {
    this.settings.monochrome = Boolean(isMonochrome);
    if (!this.keysData || this.keysData.length === 0) {
      this.keysData = this.basePiano.getKeysData();
    }
    if (!this.keysData) return;

    this.createBlackKeyGradients();
    this.keysData.forEach((key) => {
      this.assignKeyColor(key);
      this.styleStaticKey(key);
      this.createGlowElements(key);
      this.updateKeyAppearance(key);
    });
  }

  updateSize(svgWidth, svgHeight) {
    this.destroy();
    this.initialize();
  }

  removeInteractionElements(key) {
    const elementsToRemove = [
      key.glowElement, key.leftGlow, key.rightGlow,
      key.semiGlowElement, key.semiLeftGlow, key.semiRightGlow,
      key.hitboxElement
    ];
    elementsToRemove.forEach(el => {
      if (el && el.parentNode) {
        try {
          el.parentNode.removeChild(el);
        } catch (e) {}
      }
    });
    delete key.glowElement; delete key.leftGlow; delete key.rightGlow;
    delete key.semiGlowElement; delete key.semiLeftGlow; delete key.semiRightGlow;
    delete key.hitboxElement;
  }

  createHitboxElement(key) {
    if (!key.isBlack || !key.element || !key.bbox || !key.bbox.position || !key.bbox.size) {
      return;
    }

    const visualX = key.bbox.position[0];
    const visualY = key.bbox.position[1];
    const visualWidth = key.bbox.size[0];
    const visualHeight = key.bbox.size[1];

    if (isNaN(visualX) || isNaN(visualY) || isNaN(visualWidth) || isNaN(visualHeight) || visualWidth <= 0 || visualHeight <= 0) {
      return;
    }

    const hitboxWidth = visualWidth * this.settings.blackKeyHitboxWidthFactor;
    const hitboxHeight = visualHeight * this.settings.blackKeyHitboxHeightFactor;
    const hitboxX = visualX - (hitboxWidth - visualWidth) / 2;
    const hitboxY = visualY + this.settings.blackKeyHitboxVerticalOffset;

    const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hitbox.setAttribute('x', String(hitboxX));
    hitbox.setAttribute('y', String(hitboxY));
    hitbox.setAttribute('width', String(hitboxWidth));
    hitbox.setAttribute('height', String(hitboxHeight));
    hitbox.setAttribute('fill', 'transparent');
    hitbox.setAttribute('stroke', 'none');
    hitbox.setAttribute('pointer-events', 'all');
    hitbox.dataset.midi = key.midiCode;

    key.hitboxElement = hitbox;
  }

  initialize() {
    this.keysData = this.basePiano.getKeysData();
    if (!this.keysData || this.keysData.length === 0) {
      return;
    }

    this.destroy();

    this.keysData.forEach(key => {
      this.removeInteractionElements(key);
      key.isInactive = key.isInactive || false;
      key.isSemiActive = key.isSemiActive || false;
      key.isActive = false;
    });

    this.setupSvgDefs();

    const hitboxesToAppend = [];

    this.keysData.forEach(key => {
      this.assignKeyColor(key);
      this.styleStaticKey(key);
      this.createGlowElements(key);

      if (key.isBlack) {
        this.createHitboxElement(key);
        if (key.hitboxElement) {
          hitboxesToAppend.push(key.hitboxElement);
        }
      }

      this.updateKeyAppearance(key);
      this.setupKeyEvents(key);
    });

    hitboxesToAppend.forEach(hitbox => {
      if (hitbox.parentNode !== this.svg) {
        this.svg.appendChild(hitbox);
      }
    });

    this.setupGlobalListeners();
  }

  removeGlowElements(key) {
    const elementsToRemove = [
      key.glowElement, key.leftGlow, key.rightGlow,
      key.semiGlowElement, key.semiLeftGlow, key.semiRightGlow
    ];
    elementsToRemove.forEach(el => {
      if (el && el.parentNode) {
        try {
          el.parentNode.removeChild(el);
        } catch (e) {}
      }
    });
    delete key.glowElement; delete key.leftGlow; delete key.rightGlow;
    delete key.semiGlowElement; delete key.semiLeftGlow; delete key.semiRightGlow;
  }

  setupSvgDefs() {
    let defs = this.svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      if (this.svg.firstChild) {
        this.svg.insertBefore(defs, this.svg.firstChild);
      } else {
        this.svg.appendChild(defs);
      }
    }
    this.gradientDefs = defs;
    this.createBlackKeyGradients();
  }

  setKeyActive(midi, isActive) {
    const key = this.basePiano.getKeyByMidi(midi);
    if (!key) return;
    if (key.isInactive && isActive) return;

    key.isActive = isActive;
    this.updateKeyAppearance(key);
  }

  setKeyInactive(midi, isInactive) {
    const key = this.basePiano.getKeyByMidi(midi);
    if (!key) return;

    const previousInactiveState = key.isInactive;
    key.isInactive = isInactive;

    if (isInactive) {
      if (this.activeNotes.has(midi)) {
        this.deactivateNote(midi, true);
      }
      key.isSemiActive = false;
    }

    if (key.isInactive !== previousInactiveState) {
      this.updateKeyAppearance(key);
    }
  }

  setKeySemiActive(midi, isSemiActive) {
    const key = this.basePiano.getKeyByMidi(midi);
    if (!key) return;

    const previousSemiActiveState = key.isSemiActive;
    if (isSemiActive && key.isInactive) return;

    key.isSemiActive = isSemiActive;

    if (key.isSemiActive !== previousSemiActiveState && !key.isActive) {
      this.updateKeyAppearance(key);
    }
  }

  activateNote(midi, options = {}) {
    const {
      duration = this.settings.minPlayTime,
      isProgrammatic = false,
      suppressDisplay = false,
      customData = null,
      triggeredByTouchId = null
    } = options;

    const key = this.basePiano.getKeyByMidi(midi);
    if (!key || key.isInactive) return;
    if (isProgrammatic && this.activeNotes.has(midi) && this.activeNotes.get(midi).isHeld) {
      return;
    }

    const existingNote = this.activeNotes.get(midi);
    if (!isProgrammatic && existingNote && existingNote.isProgrammatic && existingNote.triggeredByTouchId !== triggeredByTouchId) {
      this.deactivateNote(midi, true);
    }

    const now = Date.now();
    let isRetrigger = false;

    if (existingNote) {
      const isSameTouch = triggeredByTouchId !== null && existingNote.triggeredByTouchId === triggeredByTouchId;
      const isSameMouse = triggeredByTouchId === null && existingNote.triggeredByTouchId === null && !existingNote.isProgrammatic;
      const isSameProgrammatic = isProgrammatic && existingNote.isProgrammatic;

      if (isSameTouch || isSameMouse || isSameProgrammatic) {
        isRetrigger = true;
        clearTimeout(existingNote.timeoutId);
        existingNote.startTime = now;
        existingNote.isHeld = !isProgrammatic;
        existingNote.suppressDisplay = suppressDisplay;
        existingNote.customData = customData;

        if (this.noteCallback) this.noteCallback(midi, 'start', customData);
      } else {
        this.deactivateNote(midi, true);
      }
    }

    if (!isRetrigger) {
      if (!suppressDisplay) this.setKeyActive(midi, true);
      if (this.noteCallback) this.noteCallback(midi, 'start', customData);

      const newNoteData = {
        startTime: now,
        isHeld: !isProgrammatic,
        timeoutId: null,
        isProgrammatic,
        suppressDisplay,
        customData,
        triggeredByTouchId
      };
      this.activeNotes.set(midi, newNoteData);
    }

    const scheduleDelay = isProgrammatic ? duration : this.settings.minPlayTime;
    this.scheduleNoteEnd(midi, scheduleDelay);
  }

  deactivateNote(midi, forceImmediate = false) {
    const note = this.activeNotes.get(midi);
    if (!note) return;

    if (forceImmediate || !note.isHeld) {
      clearTimeout(note.timeoutId);
      if (!note.suppressDisplay) this.setKeyActive(midi, false);
      if (this.noteCallback) this.noteCallback(midi, 'stop', note.customData);
      this.activeNotes.delete(midi);
    }
  }

  scheduleNoteEnd(midi, duration) {
    const note = this.activeNotes.get(midi);
    if (!note) return;

    clearTimeout(note.timeoutId);
    note.timeoutId = setTimeout(() => {
      this.deactivateNote(midi);
    }, duration);
  }

  playNote(midi, duration, suppressDisplay = false, customData = null) {
    this.activateNote(midi, {
      duration,
      isProgrammatic: true,
      suppressDisplay,
      customData
    });
  }

  setupKeyEvents(key) {
    const targetElement = key.isBlack && key.hitboxElement ? key.hitboxElement : key.element;
    if (!targetElement) return;

    if (!key.isBlack && key.element) {
      key.element.dataset.midi = key.midiCode;
    } else if (key.isBlack && key.hitboxElement) {
      if (!key.hitboxElement.dataset.midi) {
        key.hitboxElement.dataset.midi = key.midiCode;
      }
    } else if (key.isBlack && key.element && !key.hitboxElement) {
      key.element.dataset.midi = key.midiCode;
    }

    const elementsToCheck = [key.element, key.hitboxElement].filter(el => el);
    elementsToCheck.forEach(el => {
      if (el._mousedownHandler) {
        el.removeEventListener('mousedown', el._mousedownHandler);
        delete el._mousedownHandler;
      }
      if (el._touchstartHandler) {
        el.removeEventListener('touchstart', el._touchstartHandler, { passive: false });
        delete el._touchstartHandler;
      }
    });
    delete key.mousedownHandler;
    delete key.touchstartHandler;

    key.mousedownHandler = (e) => {
      if (e.button !== 0 || this.touchStates.size > 0) return;
      e.preventDefault();
      const eventMidi = parseInt(e.currentTarget.dataset.midi, 10);
      if (!isNaN(eventMidi)) {
        const eventKeyData = this.basePiano.getKeyByMidi(eventMidi);
        if (eventKeyData && !eventKeyData.isInactive) {
          this.activateNote(eventMidi, { triggeredByTouchId: null });
        }
      }
    };
    targetElement.addEventListener('mousedown', key.mousedownHandler);
    targetElement._mousedownHandler = key.mousedownHandler;

    key.touchstartHandler = (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        const eventMidi = parseInt(e.currentTarget.dataset.midi, 10);
        if (isNaN(eventMidi)) continue;

        const eventKeyData = this.basePiano.getKeyByMidi(eventMidi);
        if (eventKeyData && eventKeyData.isInactive) {
          if (!this.touchStates.has(touch.identifier)) {
            this.touchStates.set(touch.identifier, { currentMidi: null });
          }
          continue;
        }

        if (eventKeyData) {
          this.touchStates.set(touch.identifier, { currentMidi: eventMidi });
          this.activateNote(eventMidi, { triggeredByTouchId: touch.identifier });
        }
      }
    };
    targetElement.addEventListener('touchstart', key.touchstartHandler, { passive: false });
    targetElement._touchstartHandler = key.touchstartHandler;
  }

  setupGlobalListeners() {
    if (!this.globalTouchMoveHandler) {
      this.globalTouchMoveHandler = this.handleGlobalTouchMove.bind(this);
      this.svg.addEventListener('touchmove', this.globalTouchMoveHandler, { passive: false });
    }

    if (!this.globalTouchEndHandler) {
      this.globalTouchEndHandler = this.handleGlobalTouchEnd.bind(this);
      window.addEventListener('touchend', this.globalTouchEndHandler, { passive: false });
      window.addEventListener('touchcancel', this.globalTouchEndHandler, { passive: false });
    }

    if (!this.globalMouseUpHandler) {
      this.globalMouseUpHandler = this.handleGlobalMouseUp.bind(this);
      window.addEventListener('mouseup', this.globalMouseUpHandler);
    }
  }

  handleGlobalTouchMove(e) {
    e.preventDefault();

    for (const touch of e.changedTouches) {
      const touchId = touch.identifier;
      const touchState = this.touchStates.get(touchId);
      if (!touchState) continue;

      let targetMidi = null;
      const elementsUnderTouch = document.elementsFromPoint(touch.clientX, touch.clientY);

      for (const element of elementsUnderTouch) {
        const keyData = this.getKeyDataFromElement(element);
        if (keyData && !keyData.isInactive) {
          targetMidi = keyData.midiCode;
          break;
        }
      }

      if (targetMidi !== null && targetMidi !== touchState.currentMidi) {
        this.activateNote(targetMidi, { triggeredByTouchId: touchId });
        touchState.currentMidi = targetMidi;
      } else if (targetMidi !== touchState.currentMidi) {
        touchState.currentMidi = targetMidi;
      }
    }
  }

  handleGlobalTouchEnd(e) {
    for (const touch of e.changedTouches) {
      const touchId = touch.identifier;
      const touchState = this.touchStates.get(touchId);

      if (touchState) {
        this.activeNotes.forEach((note, midi) => {
          if (note.triggeredByTouchId === touchId) {
            note.isHeld = false;
            note.triggeredByTouchId = null;
            const elapsed = Date.now() - note.startTime;
            const remainingTime = Math.max(0, this.settings.minPlayTime - elapsed);
            this.scheduleNoteEnd(midi, remainingTime);
          }
        });
        this.touchStates.delete(touchId);
      }
    }
  }

  handleGlobalMouseUp(e) {
    this.activeNotes.forEach((note, midi) => {
      if (note.isHeld && note.triggeredByTouchId === null && !note.isProgrammatic) {
        note.isHeld = false;
        const elapsed = Date.now() - note.startTime;
        const remainingTime = Math.max(0, this.settings.minPlayTime - elapsed);
        this.scheduleNoteEnd(midi, remainingTime);
      }
    });
  }

  createBlackKeyGradients() {
    if (!this.gradientDefs) return;
    this.gradientDefs.innerHTML = '';

    const createStop = (offset, color) => {
      const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop.setAttribute('offset', `${offset}%`);
      stop.setAttribute('stop-color', `rgb(${color.join(',')})`);
      return stop;
    };

    const createGradient = (id, leftRgb, rightRgb, pastelFactor, transitionPercent) => {
      const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      gradient.setAttribute('id', id);
      gradient.setAttribute('x1', '0%'); gradient.setAttribute('y1', '0%');
      gradient.setAttribute('x2', '100%'); gradient.setAttribute('y2', '0%');

      const mixedLeft = this.mixWithWhite(leftRgb, pastelFactor);
      const mixedRight = this.mixWithWhite(rightRgb, pastelFactor);

      const centerPercent = 50;
      const halfTransition = Math.min(24.9, transitionPercent / 2);
      const startTransition = Math.max(0.1, centerPercent - halfTransition);
      const endTransition = Math.min(99.9, centerPercent + halfTransition);

      gradient.appendChild(createStop(0, mixedLeft));
      if (startTransition > 0) gradient.appendChild(createStop(startTransition, mixedLeft));
      if (endTransition < 100) gradient.appendChild(createStop(endTransition, mixedRight));
      gradient.appendChild(createStop(100, mixedRight));

      return gradient;
    };

    this.keysData.forEach((key) => {
      if (!key.isBlack || !key.element || !key.bbox) return;

      const leftIdx = (key.keyIndex - 1 + 12) % 12;
      const rightIdx = (key.keyIndex + 1) % 12;
      let leftColor = this.saturatedColors[leftIdx];
      let rightColor = this.saturatedColors[rightIdx];

      if (!leftColor || !rightColor) {
        leftColor = leftColor || [128, 128, 128];
        rightColor = rightColor || [128, 128, 128];
      }

      const keyPixelWidth = key.bbox.size[0];
      let transitionPercent = 5;
      if (keyPixelWidth > 0 && this.settings.gradientTransition > 0) {
        transitionPercent = Math.min(50, (this.settings.gradientTransition / keyPixelWidth) * 100);
      }

      key.gradientId = `glowpiano-gradient-active-${key.midiCode}`;
      const activeGradient = createGradient(
        key.gradientId,
        leftColor,
        rightColor,
        this.settings.blackPastelFactor,
        transitionPercent
      );
      this.gradientDefs.appendChild(activeGradient);

      key.semiGradientId = `glowpiano-gradient-semi-${key.midiCode}`;
      const semiGradient = createGradient(
        key.semiGradientId,
        leftColor,
        rightColor,
        this.settings.semiActiveBlackPastelFactor,
        transitionPercent
      );
      this.gradientDefs.appendChild(semiGradient);
    });
  }

  assignKeyColor(key) {
    const colorIdx = key.keyIndex % 12;
    key.saturatedColor = this.saturatedColors[colorIdx];

    if (this.settings.monochrome) {
      if (!key.isBlack) {
        key.fillColor = [255, 255, 255];
        key.borderColor = [160, 160, 170];
      } else {
        key.fillColor = [30, 30, 36];
        key.borderColor = [10, 10, 15];
      }
      return;
    }

    if (!key.isBlack) {
      if (!key.saturatedColor) {
        key.saturatedColor = [128, 128, 128];
      }
      key.fillColor = this.mixWithWhite(key.saturatedColor, this.settings.pastelFactor);
      key.borderColor = this.mixWithWhite(key.saturatedColor, this.settings.borderPastelFactor);
    } else {
      key.fillColor = this.settings.darkGray;
      key.borderColor = [0, 0, 0];
    }
  }

  styleStaticKey(key) {
    if (!key.element) return;
    if (this.settings.monochrome) {
      if (!key.isBlack) {
        key.element.setAttribute('fill', '#ffffff');
        key.element.setAttribute('stroke', '#a0a0a8');
        key.element.setAttribute('stroke-width', String(this.settings.borderThickness));
      } else {
        key.element.setAttribute('fill', '#202026');
        key.element.setAttribute('stroke', '#0a0a0e');
        key.element.setAttribute('stroke-width', String(this.settings.blackBorderThickness));
      }
      return;
    }

    if (!key.isBlack) {
      key.element.setAttribute('fill', `rgb(${key.fillColor.join(',')})`);
      key.element.setAttribute('stroke', `rgb(${key.borderColor.join(',')})`);
      key.element.setAttribute('stroke-width', String(this.settings.borderThickness));
    } else {
      key.element.setAttribute('fill', `rgb(${key.fillColor.join(',')})`);
      key.element.setAttribute('stroke', `rgb(${key.borderColor.join(',')})`);
      key.element.setAttribute('stroke-width', String(this.settings.blackBorderThickness));
    }
  }

  createGlowElements(key) {
    const factory = (name, attrs = {}) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', name);
      for (const attrKey in attrs) {
        el.setAttribute(attrKey, attrs[attrKey]);
      }
      if (attrs.style) el.style.cssText = attrs.style;
      return el;
    };

    this.removeGlowElements(key);

    const isMono = this.settings.monochrome;
    const monoHighlightColor = 'rgb(56, 189, 248)';

    if (!key.isBlack) {
      if (!key.element || (!isMono && !key.saturatedColor)) return;
      const d = key.element.getAttribute('d');
      if (!d) return;

      const strokeColor = isMono ? monoHighlightColor : `rgb(${key.saturatedColor.join(',')})`;

      key.glowElement = factory('path', {
        d: d, fill: 'none', stroke: strokeColor,
        'stroke-width': this.settings.whiteGlowThickness,
        'stroke-linejoin': 'round',
        style: `filter: blur(${this.settings.whiteBlurRadius}px); pointer-events: none; opacity: 0;`
      });

      key.semiGlowElement = factory('path', {
        d: d, fill: 'none', stroke: strokeColor,
        'stroke-width': this.settings.semiActiveWhiteGlowThickness,
        'stroke-linejoin': 'round',
        style: `filter: blur(${this.settings.semiActiveWhiteBlurRadius}px); pointer-events: none; opacity: 0;`
      });
    } else {
      if (!key.bbox || !key.bbox.position || !key.bbox.size) return;
      const x = key.bbox.position[0]; const y = key.bbox.position[1];
      const width = key.bbox.size[0]; const height = key.bbox.size[1];
      if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height) || width <= 0 || height <= 0) return;

      const midX = x + width / 2;
      const maxGlowThickness = Math.max(this.settings.blackGlowThickness, this.settings.semiActiveBlackGlowThickness);
      const extendPx = maxGlowThickness / 2;
      const topY = y;
      const bottomY = y + height + extendPx;

      const leftPath = `M ${midX},${topY} L ${x},${topY} L ${x},${bottomY} L ${midX},${bottomY}`;
      const rightPath = `M ${midX},${topY} L ${x + width},${topY} L ${x + width},${bottomY} L ${midX},${bottomY}`;

      const leftIdx = (key.keyIndex - 1 + 12) % 12;
      const rightIdx = (key.keyIndex + 1) % 12;
      const leftColor = this.saturatedColors[leftIdx] || [128, 128, 128];
      const rightColor = this.saturatedColors[rightIdx] || [128, 128, 128];
      const leftColorStr = isMono ? monoHighlightColor : `rgb(${leftColor.join(',')})`;
      const rightColorStr = isMono ? monoHighlightColor : `rgb(${rightColor.join(',')})`;

      key.leftGlow = factory('path', {
        d: leftPath, fill: 'none', stroke: leftColorStr,
        'stroke-width': this.settings.blackGlowThickness, 'stroke-linejoin': 'round',
        style: `filter: blur(${this.settings.blackBlurRadius}px); pointer-events: none; opacity: 0;`
      });
      key.rightGlow = factory('path', {
        d: rightPath, fill: 'none', stroke: rightColorStr,
        'stroke-width': this.settings.blackGlowThickness, 'stroke-linejoin': 'round',
        style: `filter: blur(${this.settings.blackBlurRadius}px); pointer-events: none; opacity: 0;`
      });

      key.semiLeftGlow = factory('path', {
        d: leftPath, fill: 'none', stroke: leftColorStr,
        'stroke-width': this.settings.semiActiveBlackGlowThickness, 'stroke-linejoin': 'round',
        style: `filter: blur(${this.settings.semiActiveBlackBlurRadius}px); pointer-events: none; opacity: 0;`
      });
      key.semiRightGlow = factory('path', {
        d: rightPath, fill: 'none', stroke: rightColorStr,
        'stroke-width': this.settings.semiActiveBlackGlowThickness, 'stroke-linejoin': 'round',
        style: `filter: blur(${this.settings.semiActiveBlackBlurRadius}px); pointer-events: none; opacity: 0;`
      });
    }
  }

  updateKeyAppearance(key) {
    if (!key.element) return;

    const isMono = this.settings.monochrome;

    const manageGlow = (key, type, show) => {
      const elements = type === 'active'
        ? (key.isBlack ? [key.leftGlow, key.rightGlow] : [key.glowElement])
        : (key.isBlack ? [key.semiLeftGlow, key.semiRightGlow] : [key.semiGlowElement]);

      elements.forEach(el => {
        if (!el) return;
        if (show) {
          if (!el.parentNode) this.svg.appendChild(el);
          el.style.opacity = '1';
        } else {
          el.style.opacity = '0';
        }
      });
    };

    let fill = '';
    let stroke = '';
    let strokeWidth = '';
    let showActiveGlow = false;
    let showSemiGlow = false;

    if (!key.isBlack) {
      strokeWidth = String(this.settings.borderThickness);
      if (!key.saturatedColor) key.saturatedColor = [128, 128, 128];

      if (key.isActive) {
        if (isMono) {
          fill = 'rgb(186, 230, 253)';
          stroke = 'rgb(56, 189, 248)';
        } else {
          const activeFillColor = this.mixWithWhite(key.saturatedColor, this.settings.activePastelFactor);
          fill = `rgb(${activeFillColor.join(',')})`;
          stroke = fill;
        }
        showActiveGlow = true;
      } else if (key.isSemiActive) {
        if (isMono) {
          fill = 'rgb(224, 242, 254)';
          stroke = 'rgb(125, 211, 252)';
        } else {
          const semiFillColor = this.mixWithWhite(key.saturatedColor, this.settings.semiActivePastelFactor);
          fill = `rgb(${semiFillColor.join(',')})`;
          stroke = fill;
        }
        showSemiGlow = true;
      } else if (key.isInactive) {
        fill = `rgb(${this.settings.inactiveWhiteFillColor.join(',')})`;
        stroke = `rgb(${this.settings.inactiveBorderColor.join(',')})`;
      } else {
        if (isMono) {
          fill = '#ffffff';
          stroke = '#a0a0a8';
        } else {
          fill = `rgb(${key.fillColor.join(',')})`;
          stroke = `rgb(${key.borderColor.join(',')})`;
        }
      }
    } else {
      strokeWidth = String(this.settings.blackBorderThickness);

      const calculateMixedStroke = (pastelFactor) => {
        const leftIdx = (key.keyIndex - 1 + 12) % 12;
        const rightIdx = (key.keyIndex + 1) % 12;
        const leftColor = this.saturatedColors[leftIdx] || [128, 128, 128];
        const rightColor = this.saturatedColors[rightIdx] || [128, 128, 128];
        const mixedLeft = this.mixWithWhite(leftColor, pastelFactor);
        const mixedRight = this.mixWithWhite(rightColor, pastelFactor);
        return mixedLeft.map((c, i) => Math.round((c + mixedRight[i]) / 2));
      };

      if (key.isActive) {
        if (isMono) {
          fill = 'rgb(51, 65, 85)';
          stroke = 'rgb(56, 189, 248)';
        } else {
          fill = key.gradientId ? `url(#${key.gradientId})` : `rgb(${this.settings.darkGray.join(',')})`;
          const strokeColorRgb = calculateMixedStroke(this.settings.blackPastelFactor);
          stroke = `rgb(${strokeColorRgb.join(',')})`;
        }
        showActiveGlow = true;
      } else if (key.isSemiActive) {
        if (isMono) {
          fill = 'rgb(30, 41, 59)';
          stroke = 'rgb(125, 211, 252)';
        } else {
          fill = key.semiGradientId ? `url(#${key.semiGradientId})` : `rgb(${this.settings.darkGray.join(',')})`;
          const strokeColorRgb = calculateMixedStroke(this.settings.semiActiveBlackPastelFactor);
          stroke = `rgb(${strokeColorRgb.join(',')})`;
        }
        showSemiGlow = true;
      } else if (key.isInactive) {
        fill = `rgb(${this.settings.inactiveBlackFillColor.join(',')})`;
        stroke = `rgb(${this.settings.inactiveBorderColor.join(',')})`;
      } else {
        if (isMono) {
          fill = '#202026';
          stroke = '#0a0a0e';
        } else {
          fill = `rgb(${key.fillColor.join(',')})`;
          stroke = `rgb(${key.borderColor.join(',')})`;
        }
      }
    }

    key.element.setAttribute('fill', fill);
    key.element.setAttribute('stroke', stroke);
    key.element.setAttribute('stroke-width', strokeWidth);

    manageGlow(key, 'active', showActiveGlow);
    manageGlow(key, 'semi', showSemiGlow);
  }

  mixWithWhite(color, factor) {
    if (!Array.isArray(color) || color.length < 3) return [255, 255, 255];
    const clampedFactor = Math.max(0, Math.min(1, factor));
    return color.map(c => Math.round(c + (255 - c) * clampedFactor));
  }

  getKeysData() {
    return this.keysData;
  }

  getKeyDataFromElement(element) {
    if (!element) return null;
    const keyElement = element.closest('[data-midi]');
    if (!keyElement || !keyElement.dataset || !keyElement.dataset.midi) return null;
    const midi = parseInt(keyElement.dataset.midi, 10);
    if (isNaN(midi)) return null;
    return this.basePiano.getKeyByMidi(midi);
  }

  destroy() {
    if (this.globalTouchMoveHandler) {
      this.svg.removeEventListener('touchmove', this.globalTouchMoveHandler);
      this.globalTouchMoveHandler = null;
    }
    if (this.globalTouchEndHandler) {
      window.removeEventListener('touchend', this.globalTouchEndHandler);
      window.removeEventListener('touchcancel', this.globalTouchEndHandler);
      this.globalTouchEndHandler = null;
    }
    if (this.globalMouseUpHandler) {
      window.removeEventListener('mouseup', this.globalMouseUpHandler);
      this.globalMouseUpHandler = null;
    }

    this.keysData.forEach(key => {
      const targetElement = key.isBlack && key.hitboxElement ? key.hitboxElement : key.element;
      if (targetElement) {
        if (key.mousedownHandler) targetElement.removeEventListener('mousedown', key.mousedownHandler);
        if (key.touchstartHandler) targetElement.removeEventListener('touchstart', key.touchstartHandler, { passive: false });
      } else if (key.element) {
        if (key.mousedownHandler) key.element.removeEventListener('mousedown', key.mousedownHandler);
        if (key.touchstartHandler) key.element.removeEventListener('touchstart', key.touchstartHandler, { passive: false });
      }

      delete key.mousedownHandler;
      delete key.touchstartHandler;
      this.removeInteractionElements(key);
    });

    this.activeNotes.forEach(note => clearTimeout(note.timeoutId));
    this.activeNotes.clear();
    this.touchStates.clear();
  }
}

globalThis.GlowPiano = GlowPiano;
if (typeof module !== 'undefined' && module.exports) module.exports = GlowPiano;
// --- END OF FILE GlowPiano.js ---