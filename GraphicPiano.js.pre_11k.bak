class GraphicPiano {
  constructor(svgElement, options = {}) {
    this.svg = svgElement;
    this.settings = {
      keySpacing: 5,
      cornerRadius: 5,
      padding: [10, 10],
      blackKeyHeightRatio: 0.55,
    };
    this.keysData = [];
    this.blackKeyWidth = 0;
    this.startMidi = 0;
    Object.assign(this.settings, options);
  }

  updateSize(svgWidth, svgHeight) {
    this.settings.svgSize = [svgWidth, svgHeight];
    this.updateSettings(this.settings);
    this.initialize();
  }

  updateSettings(options) {
    Object.assign(this.settings, options);
    if (this.settings.svgSize) {
      this.svgSize = this.settings.svgSize;
      this.padding = this.settings.padding || [10, 10];
      this.whiteKeyHeight = this.svgSize[1] - 2 * this.padding[1];
      this.blackKeyHeight =
        this.whiteKeyHeight * (this.settings.blackKeyHeightRatio || 0.55);
      this.svg.setAttribute('width', `${this.svgSize[0]}px`);
      this.svg.setAttribute('height', `${this.svgSize[1]}px`);
      this.svg.setAttribute(
        'viewBox',
        `0 0 ${this.svgSize[0]} ${this.svgSize[1]}`
      );
      this.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      this.startMidi = this.settings.startMidi || 60;
    }
  }

  initializeData() {
    if (!this.svgSize) {
      return;
    }
    this.svg.innerHTML = '';
    this.keysData = [];
    this.generateKeyData();
    this.finalizePianoData();
  }

  draw() {
    if (!this.svgSize) {
      return;
    }
    this.svg.innerHTML = '';
    this.keysData.forEach((key) => {
      if (!key.isBlack) this.renderWhiteKey(key);
    });
    this.keysData.forEach((key) => {
      if (key.isBlack) this.renderBlackKey(key);
    });
  }

  initialize() {
    this.initializeData();
    this.draw();
  }

  generateKeyData() {
    this.keysData = [];
    const { startMidi, endMidi } = this.settings;
    const numKeysPerOctave = 12;
    const whiteKeyWidth = 1 / 7;
    const blackKeyWidth = 1 / 13;
    const keyCenters = [
      { center: 1 / 14, isBlack: false },
      { center: (3 / 10) * (3 / 7), isBlack: true },
      { center: 3 / 14, isBlack: false },
      { center: (7 / 10) * (3 / 7), isBlack: true },
      { center: 5 / 14, isBlack: false },
      { center: 7 / 14, isBlack: false },
      { center: 3 / 7 + (3 / 14) * (4 / 7), isBlack: true },
      { center: 9 / 14, isBlack: false },
      { center: 3 / 7 + (7 / 14) * (4 / 7), isBlack: true },
      { center: 11 / 14, isBlack: false },
      { center: 3 / 7 + (11 / 14) * (4 / 7), isBlack: true },
      { center: 13 / 14, isBlack: false },
    ];

    for (let midi = startMidi; midi <= endMidi; midi++) {
      const octaveOffset = Math.floor((midi - 60) / numKeysPerOctave);
      const baseIndex = (midi - 60) % numKeysPerOctave;
      const keyIndex =
        baseIndex >= 0 ? baseIndex : baseIndex + numKeysPerOctave;
      const key = keyCenters[keyIndex];
      const center = octaveOffset + key.center;

      if (!key.isBlack) {
        const baseLeft = center - whiteKeyWidth / 2;
        const baseRight = center + whiteKeyWidth / 2;
        let narrowLeft = baseLeft;
        let narrowRight = baseRight;
        if (midi > startMidi) {
          const prevIndex = (keyIndex - 1 + numKeysPerOctave) % 12;
          if (keyCenters[prevIndex].isBlack) {
            narrowLeft =
              keyCenters[prevIndex].center + blackKeyWidth / 2 + octaveOffset;
          }
        }
        if (midi < endMidi) {
          const nextIndex = (keyIndex + 1) % 12; 
          if (keyCenters[nextIndex].isBlack) {
            narrowRight =
              keyCenters[nextIndex].center - blackKeyWidth / 2 + octaveOffset;
          }
        }
        this.keysData.push({
          midiCode: midi,
          isBlack: false,
          baseLeft,
          baseRight,
          narrowLeft,
          narrowRight,
          keyIndex,
        });
      } else {
        const baseLeft = center - blackKeyWidth / 2;
        const baseRight = center + blackKeyWidth / 2;
        this.keysData.push({
          midiCode: midi,
          isBlack: true,
          baseLeft,
          baseRight,
          keyIndex,
        });
      }
    }
  }

  getWhiteKeyPathData({
    left,
    right,
    narrowLeft,
    narrowRight,
    top,
    bottom,
    bottomBlackKey,
    radius,
  }) {
    const r = Math.max(0, radius !== undefined ? radius : 5);
    const points = [
      [left, bottom - r],
      ...(narrowLeft === left
        ? [[left, top]]
        : [
            [left, bottomBlackKey],
            [narrowLeft, bottomBlackKey],
            [narrowLeft, top],
          ]),
      [narrowRight, top],
      ...(narrowRight === right
        ? [[right, bottom - r]]
        : [
            [narrowRight, bottomBlackKey],
            [right, bottomBlackKey],
            [right, bottom - r],
          ]),
    ];
    let d = `M ${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++)
      d += ` L ${points[i][0]},${points[i][1]}`;
    if (r > 0) {
      d += ` A ${r},${r} 0 0 1 ${right - r},${bottom}`;
      d += ` L ${left + r},${bottom}`;
      d += ` A ${r},${r} 0 0 1 ${left},${bottom - r}`;
    } else {
      d += ` L ${right},${bottom} L ${left},${bottom}`;
    }
    d += ` Z`;
    return d;
  }

  renderWhiteKey(key) {
    const spacing = this.settings.keySpacing !== undefined ? this.settings.keySpacing : 5;
    const halfSpacing = spacing / 2;
    const left = this.padding[0] + key.left + halfSpacing;
    const right = this.padding[0] + key.right - halfSpacing;
    const narrowLeft = this.padding[0] + key.narrowLeft + halfSpacing;
    const narrowRight = this.padding[0] + key.narrowRight - halfSpacing;
    const bottomBlackKey =
      this.padding[1] + this.blackKeyHeight + spacing;
    const top = this.padding[1];
    const bottom = this.padding[1] + this.whiteKeyHeight;

    const radius = this.settings.cornerRadius !== undefined ? this.settings.cornerRadius : 5;

    const pathData = this.getWhiteKeyPathData({
      left,
      right,
      narrowLeft,
      narrowRight,
      top,
      bottom,
      bottomBlackKey,
      radius: radius,
    });

    const path = makeElement('svg:path', {
      d: pathData,
      fill: '#ffffff',
      stroke: '#000000',
      'stroke-width': '1',
    });

    key.element = path;
    key.position = [left + (right - left) / 2, top + (bottom - top) * 0.75];
    key.size = [right - left, bottom - top];
    key.bbox = { position: [left, top], size: [right - left, bottom - top] };

    this.svg.appendChild(path);
  }

  renderBlackKey(key) {
    const spacing = this.settings.keySpacing !== undefined ? this.settings.keySpacing : 5;
    const halfSpacing = spacing / 2;
    const left = this.padding[0] + key.left + halfSpacing;
    const width = key.right - key.left - spacing;
    const top = this.padding[1];
    const height = this.blackKeyHeight;
    const radius = Math.min(3, this.settings.cornerRadius !== undefined ? this.settings.cornerRadius : 5);

    const rect = makeElement('svg:rect', {
      x: left,
      y: top,
      width: width,
      height: height,
      rx: radius,
      ry: radius,
      fill: '#1c1c20',
      stroke: '#000000',
      'stroke-width': '1',
    });

    key.element = rect;
    key.position = [left + width / 2, top + height * 0.75];
    key.size = [width, height];
    key.bbox = { position: [left, top], size: [width, height] };

    this.svg.appendChild(rect);
  }

  finalizePianoData() {
    const originBaseLeft = this.keysData[0].baseLeft;
    const spacing = this.settings.keySpacing !== undefined ? this.settings.keySpacing : 5;

    const totalWidth =
      this.keysData[this.keysData.length - 1].baseRight - originBaseLeft;
    const drawableWidth = this.svgSize[0] - 2 * this.padding[0];
    const totalSpacing = spacing * (this.keysData.length - 1);
    const scaleFactor = (drawableWidth - totalSpacing) / totalWidth;

    this.keysData.forEach((key) => {
      key.left = (key.baseLeft - originBaseLeft) * scaleFactor;
      key.right = (key.baseRight - originBaseLeft) * scaleFactor;
      if (!key.isBlack) {
        key.narrowLeft = (key.narrowLeft - originBaseLeft) * scaleFactor;
        key.narrowRight = (key.narrowRight - originBaseLeft) * scaleFactor;
      }
    });

    const lastKey = this.keysData[this.keysData.length - 1];
    const currentLastRight = lastKey.right - spacing / 2;
    const targetLastRight = drawableWidth - spacing / 2;
    const adjustmentFactor = targetLastRight / currentLastRight;

    this.keysData.forEach((key) => {
      key.left *= adjustmentFactor;
      key.right *= adjustmentFactor;
      if (!key.isBlack) {
        key.narrowLeft *= adjustmentFactor;
        key.narrowRight *= adjustmentFactor;
      }
    });

    const sampleBlackKey = this.keysData.find((key) => key.isBlack);
    if (sampleBlackKey) {
      this.blackKeyWidth =
        sampleBlackKey.right - sampleBlackKey.left - spacing;
    }

    this._xOrigin = originBaseLeft;
    this._xScale = scaleFactor * adjustmentFactor;
  }

  getSvgElement() {
    return this.svg;
  }

  getKeysData() {
    return this.keysData;
  }

  getKeyByMidi(midiCode) {
    const index = midiCode - this.startMidi;
    if (index < 0 || index >= this.keysData.length) {
      return null;
    }
    return this.keysData[index];
  }

  getBlackKeyWidth() {
    return this.blackKeyWidth;
  }

  getWhiteKeyDimensions(midiCode) {
    const key = this.getKeyByMidi(midiCode);
    if (!key || key.isBlack) {
      return null;
    }

    return {
      baseWidth: key.right - key.left,
      narrowWidth: key.narrowRight - key.narrowLeft,
      height: this.whiteKeyHeight,
      blackKeyHeight: this.blackKeyHeight,
    };
  }

  getKeyBoundingBox(midiCode) {
    const key = this.getKeyByMidi(midiCode);
    if (!key) {
      return null;
    }
    return key.bbox;
  }

  getKeyCoordinates(midiCode) {
    const key = this.getKeyByMidi(midiCode);
    if (!key) return [0, 0];
    return key.position;
  }
}

globalThis.GraphicPiano = GraphicPiano;
if (typeof module !== 'undefined' && module.exports) module.exports = GraphicPiano;