class ColorPicker {

  constructor() {
    this.hueRing = null;
    this.trianglePickers = [];
  }

  init(targetElement) {
    this._applyPageStyles();

    const lightZone = makeElement(
      'div',
      { className: 'lab-zone lab-zone-light' },
      makeElement('div', { className: 'lab-label' }, 'Light Context')
    );
    const darkZone = makeElement(
      'div',
      { className: 'lab-zone lab-zone-dark' },
      makeElement('div', { className: 'lab-label' }, 'Dark Context')
    );

    targetElement.appendChild(lightZone);
    targetElement.appendChild(darkZone);

    this.addSwatches(lightZone, [
      { color: 'rgb(255, 60, 60)', top: 50, left: 50, width: 60, height: 60 },
      {
        color: 'rgb(60, 180, 255)',
        top: 150,
        left: 100,
        width: 80,
        height: 50,
      },
      { color: 'rgb(255, 180, 40)', top: 280, left: 60, width: 50, height: 50 },
    ]);

    this.addSwatches(darkZone, [
      { color: 'rgb(100, 255, 100)', top: 60, left: 60, width: 70, height: 70 },
      {
        color: 'rgb(200, 100, 255)',
        top: 180,
        left: 120,
        width: 90,
        height: 60,
      },
      {
        color: 'rgb(220, 220, 220)',
        top: 320,
        left: 80,
        width: 60,
        height: 60,
      },
    ]);
  }

  addSwatches(container, swatches) {
    swatches.forEach((config) => {
      const el = this.createSwatchElement(config);
      container.appendChild(el);

      const clickable = el.querySelector('.color-swatch-main');
      clickable.onclick = (e) => {
        e.stopPropagation();
        this.openSmartPicker(clickable, config.color, (newColor) => {
          clickable.style.backgroundColor = newColor;
          const label = el.querySelector('.swatch-label');
          if (label) label.textContent = newColor;
          config.color = newColor;
        });
      };
    });
  }

  createSwatchElement({ color, top, left, width, height }) {
    return makeElement(
      'div',
      {
        className: 'swatch-container',
        style: {
          position: 'absolute',
          top: `${top}px`,
          left: `${left}px`,
          width: `${width}px`,
        },
      },
      makeElement('div', {
        className: 'color-swatch-main',
        style: {
          height: `${height}px`,
          backgroundColor: color,
          borderRadius: '8px',
          cursor: 'pointer',
          border: '2px solid rgba(128,128,128,0.2)',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        },
      }),
      makeElement(
        'div',
        {
          className: 'swatch-label',
          style: {
            fontSize: '10px',
            textAlign: 'center',
            marginTop: '4px',
            fontFamily: 'monospace',
          },
        },
        color
      )
    );
  }

  createHueRingDialog() {
    const hueRing = new HueRingCP(300);

    const styles = this._makePickerBarStyles();
    const transparencyCheck =
      typeof makeElement !== 'undefined'
        ? makeElement('input', { type: 'checkbox' })
        : document.createElement('input');
    const rotationRange =
      typeof makeElement !== 'undefined'
        ? makeElement('input', {
            type: 'range',
            min: 0,
            max: 360,
            value: 0,
            style: { width: '100px' },
          })
        : document.createElement('input');

    const controls =
      typeof makeElement !== 'undefined'
        ? makeElement(
            'div',
            { style: styles.bar },
            makeElement(
              'label',
              { style: styles.checkboxRow },
              transparencyCheck,
              'Transparent'
            ),
            makeElement(
              'label',
              { style: styles.labelRow },
              'Rotate:',
              rotationRange
            )
          )
        : document.createElement('div');

    const hueDisplay =
      typeof makeElement !== 'undefined'
        ? makeElement('span', { style: { opacity: '0.95' } }, 'Hue: 0°')
        : document.createElement('span');
    const rgbDisplay =
      typeof makeElement !== 'undefined'
        ? makeElement('span', { style: { opacity: '0.8' } }, 'rgb(255, 0, 0)')
        : document.createElement('span');
    const footer =
      typeof makeElement !== 'undefined'
        ? makeElement('div', { style: styles.footer }, hueDisplay, rgbDisplay)
        : document.createElement('div');

    const wrapper =
      typeof makeElement !== 'undefined'
        ? makeElement(
            'div',
            {
              style: {
                flex: 1,
                position: 'relative',
                overflow: 'hidden',
                padding: '20px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              },
            },
            hueRing.getElement()
          )
        : document.createElement('div');

    const content =
      typeof makeElement !== 'undefined'
        ? makeElement(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                boxSizing: 'border-box',
              },
            },
            controls,
            wrapper,
            footer
          )
        : document.createElement('div');

    let lastW = 0,
      lastH = 0;

    const dialog = UITools.makeDialog({
      title: 'Hue Ring',
      content: content,
      size: [360, 460],
      position: [window.innerWidth / 2 - 180, 80],
      noPadding: true,
      onGeometryChange: (box, geo) => {
        if (box._dragSt) return;
        const w = Math.round(geo.inner.width);
        const h = Math.round(geo.inner.height);

        if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
        lastW = w;
        lastH = h;

        const controlsH = controls.getBoundingClientRect().height || 40;
        const footerH = footer.getBoundingClientRect().height || 28;
        const availableH = h - controlsH - footerH;

        hueRing.resize(w - 40, availableH - 40);
      },
    });

    hueRing.onHueChange = (h) => {
      hueDisplay.textContent = `Hue: ${Math.round(h)}°`;
    };
    hueRing.onColorChange = (c) => {
      rgbDisplay.textContent = c;
    };

    rotationRange.oninput = (e) => {
      hueRing.setRotation(parseInt(e.target.value, 10));
    };

    transparencyCheck.onchange = (e) => {
      this._setDialogTransparency(dialog, controls, footer, !!e.target.checked);
    };

    dialog.triggerCallback();
    hueRing.setHue(0);
  }

  getRGBFromCustomWheel(angleDeg) {
    return [0, 0, 0];
  }

  _makePickerBarStyles() {
    return {
      bar: {
        padding: '8px',
        background: '#333',
        borderBottom: '1px solid #555',
        display: 'flex',
        gap: '15px',
        fontSize: '11px',
        alignItems: 'center',
        flexShrink: '0',
        boxSizing: 'border-box',
        width: '100%',
      },
      footer: {
        padding: '6px 8px',
        background: '#333',
        borderTop: '1px solid #555',
        display: 'flex',
        gap: '10px',
        fontSize: '11px',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: '0',
        boxSizing: 'border-box',
        width: '100%',
        color: '#cfcfcf',
        fontFamily: 'monospace',
      },
      labelRow: { display: 'flex', gap: '5px', alignItems: 'center' },
      checkboxRow: { display: 'flex', gap: '5px', alignItems: 'center' },
    };
  }

  _setDialogTransparency(dialog, controlsEl, footerEl, isTransparent) {
    if (!dialog || !dialog.element || !dialog.contentElement) return;

    if (isTransparent) {
      dialog.element.style.setProperty(
        'background-color',
        'transparent',
        'important'
      );
      dialog.contentElement.style.setProperty(
        'background-color',
        'transparent',
        'important'
      );
      dialog.element.style.boxShadow = 'none';
      if (controlsEl) controlsEl.style.backgroundColor = 'rgba(0,0,0,0.6)';
      if (footerEl) footerEl.style.backgroundColor = 'rgba(0,0,0,0.6)';
    } else {
      dialog.element.style.removeProperty('background-color');
      dialog.contentElement.style.removeProperty('background-color');
      dialog.element.style.boxShadow = '';
      if (controlsEl) controlsEl.style.backgroundColor = '#333';
      if (footerEl) footerEl.style.backgroundColor = '#333';
    }
  }

  _applyPageStyles() {
    const css = `
      .lab-zone {
        position: relative;
        width: 100%;
        height: 400px;
        margin-bottom: 20px;
        border-radius: 8px;
        box-shadow: inset 0 0 20px rgba(0,0,0,0.1);
        overflow: hidden;
      }
      .lab-zone-light {
        background-color: #f0f0f0;
        border: 1px solid #ddd;
        color: #333;
      }
      .lab-zone-dark {
        background-color: #1e1e1e;
        border: 1px solid #333;
        color: #ccc;
      }
      .lab-label {
        position: absolute;
        top: 10px;
        left: 10px;
        font-weight: bold;
        text-transform: uppercase;
        font-size: 12px;
        opacity: 0.5;
        pointer-events: none;
      }
      .swatch-container {
        transition: transform 0.1s;
      }
      .swatch-container:hover {
        transform: scale(1.05);
        z-index: 10;
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  _rybToRgb(rybHue) {
    const normalized = rybHue % 360;
    if (normalized < 120) {
      return normalized * 0.5;
    } else if (normalized < 240) {
      return 60 + (normalized - 120) * 1.5;
    } else {
      return 240 + (normalized - 240) * 1.0;
    }
  }

  _rgbToRyb(rgbHue) {
    const normalized = rgbHue % 360;
    if (normalized < 60) {
      return normalized * 2.0;
    } else if (normalized < 240) {
      return 120 + (normalized - 60) / 1.5;
    } else {
      return 240 + (normalized - 240) * 1.0;
    }
  }

  openSmartPicker(targetElement, initialColor, onColorUpdate) {
    if (this._activePicker) {
      this._activePicker.remove();
      this._activePicker = null;
    }

    ColorPicker.activeInstance = this;

    this.currentHueRing = null;
    this.currentTriangle = null;
    this.currentTriEl = null;
    this.currentTargetSwatch = null;
    this._updateActiveColor = null;

    const TOTAL_SIZE = 150;
    const TRIANGLE_SIZE = 100;
    const GAP = 10;

    const container = typeof makeElement !== 'undefined'
        ? makeElement('div', {
            className: 'smart-picker-surface',
            style: {
              position: 'absolute', width: `${TOTAL_SIZE}px`, height: `${TOTAL_SIZE}px`,
              background: 'transparent', zIndex: '2147483647', userSelect: 'none', cursor: 'default',
              opacity: '0', transform: 'scale(0.5)', overflow: 'visible',
              transition: 'opacity 0.2s ease-out, transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
              filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))'
            }
          })
        : document.createElement('div');
    document.body.appendChild(container);
    this._activePicker = container;

    const rgbDisplay = typeof makeElement !== 'undefined'
        ? makeElement('div', {
              style: {
                position: 'absolute', padding: '3px 8px', borderRadius: '6px', fontWeight: '600',
                fontSize: '11px', fontFamily: 'monospace', textAlign: 'center', whiteSpace: 'nowrap',
                backgroundColor: 'rgba(255, 255, 255, 0.7)', color: '#000', backdropFilter: 'blur(3px)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)', transition: 'background-color 0.35s ease, color 0.1s', pointerEvents: 'none'
              }
          }, '0,0,0')
        : document.createElement('div');
    container.appendChild(rgbDisplay);

    const rect = targetElement.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const pickerHalf = TOTAL_SIZE / 2;
    
    let left = rect.right + GAP;
    let top = rect.top + rect.height / 2 - pickerHalf;
    let originX = '0%';
    let originY = '50%';
    
    if (left + TOTAL_SIZE > winW - 10) {
      left = rect.left - TOTAL_SIZE - GAP;
      originX = '100%';
      if (left < 10) {
        left = Math.max(10, rect.left + rect.width / 2 - pickerHalf);
        top = rect.bottom + GAP;
        originX = '50%';
        originY = '0%';
        if (top + TOTAL_SIZE > winH - 10) {
          top = Math.max(10, rect.top - TOTAL_SIZE - GAP);
          originY = '100%';
        }
      }
    }
    if (top < 10) top = 10;
    if (top + TOTAL_SIZE > winH - 10) top = winH - TOTAL_SIZE - 10;
    
    container.style.left = `${left + scrollX}px`;
    container.style.top = `${top + scrollY}px`;
    container.style.transformOrigin = `${originX} ${originY}`;

    const updateRgbPosition = () => {
      const r = container.getBoundingClientRect();
      if (r.bottom + 40 > window.innerHeight) {
        rgbDisplay.style.bottom = 'auto';
        rgbDisplay.style.top = '-30px';
      } else {
        rgbDisplay.style.top = 'auto';
        rgbDisplay.style.bottom = '-30px';
      }
      if (r.left < 20) {
        rgbDisplay.style.left = '0px';
        rgbDisplay.style.right = 'auto';
        rgbDisplay.style.transform = 'none';
      } else if (r.right > window.innerWidth - 20) {
        rgbDisplay.style.left = 'auto';
        rgbDisplay.style.right = '0px';
        rgbDisplay.style.transform = 'none';
      } else {
        rgbDisplay.style.left = '50%';
        rgbDisplay.style.right = 'auto';
        rgbDisplay.style.transform = 'translateX(-50%)';
      }
    };

    requestAnimationFrame(() => {
      container.style.opacity = '1';
      container.style.transform = 'scale(1)';
      updateRgbPosition();
    });

    const hueRing = new HueRingCP(TOTAL_SIZE);
    const triangle = new TriangleCP(TRIANGLE_SIZE);
    
    const parseColorToRgb = (colorStr) => {
      if (!colorStr) return [0, 136, 255];
      colorStr = colorStr.trim();
      if (colorStr.startsWith('#')) {
        let hex = colorStr.slice(1);
        if (hex.length === 3) {
          hex = hex.split('').map(c => c + c).join('');
        }
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          return [r, g, b];
        }
      }
      const rgbMatch = colorStr.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
      if (rgbMatch) {
        return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
      }
      if (typeof AppColorUtils !== 'undefined' && AppColorUtils.rgbStringToRgbArray) {
        const arr = AppColorUtils.rgbStringToRgbArray(colorStr);
        if (arr) return arr;
      }
      return [0, 136, 255];
    };

    const rgbArray = parseColorToRgb(initialColor);
    let hsv = AppColorUtils.rgbToHsv(rgbArray[0], rgbArray[1], rgbArray[2]);

    const initialRyb = this._rgbToRyb(hsv.h);
    hueRing.setHue(initialRyb);
    triangle.setColor(initialColor);
    triangle.rotation = initialRyb;

    this.currentHueRing = hueRing;
    this.currentTriangle = triangle;
    this.currentTargetSwatch = targetElement;

    const ringEl = hueRing.getElement();
    const triEl = triangle.getElement();
    this.currentTriEl = triEl;

    Object.assign(ringEl.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
    const triOffset = (TOTAL_SIZE - TRIANGLE_SIZE) / 2;
    const geoCenterOffset = (TRIANGLE_SIZE - triangle.height) / 2;
    Object.assign(triEl.style, {
      position: 'absolute', left: `${triOffset}px`, top: `${triOffset + geoCenterOffset}px`,
      pointerEvents: 'none', transformOrigin: '50% 50%', zIndex: '10'
    });
    triEl.style.transform = `rotate(${initialRyb}deg)`;
    
    container.appendChild(ringEl);
    container.appendChild(triEl);

    const updateRGBLabel = (r, g, b, colorString) => {
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      const isBright = brightness > 140;
      rgbDisplay.textContent = `${r},${g},${b}`;
      rgbDisplay.style.color = colorString;
      rgbDisplay.style.backgroundColor = isBright ? 'rgba(10, 10, 10, 0.7)' : 'rgba(245, 245, 245, 0.7)';
    };
    updateRGBLabel(rgbArray[0], rgbArray[1], rgbArray[2], initialColor);

    const updateFinal = (newRgbHue) => {
      const { wA, wB, wC } = triangle.getWeights();
      const pureHue = AppColorUtils.hsvToRgbArray(newRgbHue / 360, 1, 1);
      const r = Math.round(wA * pureHue[0] + wC * 255);
      const g = Math.round(wA * pureHue[1] + wC * 255);
      const b = Math.round(wA * pureHue[2] + wC * 255);
      const finalColor = `rgb(${r}, ${g}, ${b})`;
      hueRing.setThumbColor(finalColor);
      hueRing.externalColorOverride = true;
      updateRGBLabel(r, g, b, finalColor);
      if (onColorUpdate) onColorUpdate(finalColor);
    };

    this._updateActiveColor = updateFinal;

    hueRing.onHueChange = (rybHue) => {
      const rgbHue = this._rybToRgb(rybHue);
      triangle.rotation = rybHue;
      triEl.style.transform = `rotate(${rybHue}deg)`;
      triangle.setHue(rgbHue);
      updateFinal(rgbHue);
      updateRgbPosition();
    };

    triangle.onColorUpdate = (c) => {
      const rgb = parseColorToRgb(c);
      updateRGBLabel(rgb[0], rgb[1], rgb[2], c);
      hueRing.setThumbColor(c);
      hueRing.externalColorOverride = true;
      if (onColorUpdate) onColorUpdate(c);
      updateRgbPosition();
    };

    const isInsideTriangle = (x, y) => {
      if (!triangle.triGeometry) return false;
      const dx = x - TOTAL_SIZE / 2;
      const dy = y - TOTAL_SIZE / 2;
      return Math.sqrt(dx * dx + dy * dy) < TOTAL_SIZE * 0.3;
    };

    const processEvent = (e) => {
      const r = container.getBoundingClientRect();
      const cx = TOTAL_SIZE / 2;
      const cy = TOTAL_SIZE / 2;
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      let target = this._dragTarget;
      if (!target) target = isInsideTriangle(x, y) ? 'triangle' : 'ring';
      if (target === 'triangle') {
        const dx = x - cx;
        const dy = y - cy;
        const rad = (-triangle.rotation * Math.PI) / 180;
        const tx = dx * Math.cos(rad) - dy * Math.sin(rad) + TRIANGLE_SIZE / 2;
        const ty = dx * Math.sin(rad) + dy * Math.cos(rad) + triangle.height / 2;
        triangle.processInput(tx, ty);
        this._dragTarget = 'triangle';
      } else {
        hueRing.processInput(x - cx, y - cy);
        this._dragTarget = 'ring';
      }
    };

    container.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._dragTarget = null;
      processEvent(e);
      const move = (ev) => processEvent(ev);
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        this._dragTarget = null;
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });

    let leaveTimer;
    container.addEventListener('mouseleave', () => {
      if (this._dragTarget) return;
      leaveTimer = setTimeout(cleanup, 400);
    });
    container.addEventListener('mouseenter', () => clearTimeout(leaveTimer));

    const closeListener = (e) => {
      if (!container.contains(e.target) && e.target !== targetElement && !targetElement.contains(e.target)) cleanup();
    };

    const cleanup = () => {
      if (leaveTimer) clearTimeout(leaveTimer);
      window.removeEventListener('mousedown', closeListener);
      if (this._activePicker === container) {
        container.style.opacity = '0';
        container.style.transform = 'scale(0.8)';
        setTimeout(() => container.remove(), 200);
        this._activePicker = null;
        this.currentHueRing = null;
        this.currentTriangle = null;
        this.currentTargetSwatch = null;
        this.currentTriEl = null;
        this._updateActiveColor = null;
        ColorPicker.activeInstance = null;
      }
    };

    setTimeout(() => window.addEventListener('mousedown', closeListener), 50);
  }
}

globalThis.ColorPicker = ColorPicker;
if (typeof module !== 'undefined' && module.exports) module.exports = ColorPicker;