class DictationWidget {
  constructor(options = {}) {
    this.options = options || {};
    this.placeholder = this.options.placeholder || 'Click "Start Listening" to dictate notes or type here...';
    this.compact = !!this.options.compact;
    this.init();
  }

  editorBox = null;
  editorContent = null;
  controlBox = null;
  statusDiv = null;
  recognition = null;
  isListening = false;
  modifierHeld = false;
  lastRange = null;
  lastCaretRect = null;
  popupElement = null;
  popupTextElement = null;
  popupSvgPath = null;
  popupSvgConnector = null;
  isPopupVisible = false;
  tokenSerialCounter = 1;
  lastTokens = [];
  pendingPunct = [];
  subscribers = new Set();

  // Persistent Custom Replacement Dictionary
  customReplacements = {};

  punctMap = {
    period: '.',
    comma: ',',
    'question mark': '?',
    'exclamation point': '!',
    'exclamation mark': '!',
    exclamation: '!',
    'new line': '\n\n',
    newline: '\n\n',
    'new paragraph': '\n\n',
    colon: ':',
    semicolon: ';',
    dash: ' — ',
    hyphen: '-'
  };

  init() {
    this.isEditing = false;
    this.toggleListenBtn = null;
    this.toggleEditBtn = null;
    this.clearBtn = null;
    this.currentlyHighlighted = [];
    this.boundHandleEditorMouseMove = this.handleEditorMouseMove.bind(this);
    this.boundClearAllHighlights = this.clearAllHighlights.bind(this);
    this.spaceWidth = null;
    this.openQuoteSpans = [];
    this.subscribers = new Set();
    this.staleTimestamp = 0;
    this.loadReplacements();
    this.applyStyles();
    this.setupUI();
    this.setupRecognition();
    this.setupEventListeners();
  }

  loadReplacements() {
    try {
      const raw = localStorage.getItem('dictation_custom_replacements');
      this.customReplacements = raw ? JSON.parse(raw) : {};
    } catch (e) {
      this.customReplacements = {};
    }
  }

  saveReplacements() {
    try {
      localStorage.setItem('dictation_custom_replacements', JSON.stringify(this.customReplacements));
    } catch (e) {}
  }

  addReplacementRule(spokenWord, replacementWord) {
    if (!spokenWord || !replacementWord) return;
    const cleanFrom = spokenWord.trim().toLowerCase();
    const cleanTo = replacementWord.trim();
    this.customReplacements[cleanFrom] = cleanTo;
    this.saveReplacements();
    this.updateStatus(`✓ Learned: "${cleanFrom}" ➔ "${cleanTo}"`);
  }

  removeReplacementRule(spokenWord) {
    const cleanFrom = (spokenWord || '').trim().toLowerCase();
    delete this.customReplacements[cleanFrom];
    this.saveReplacements();
    this.updateStatus(`Removed replacement for "${cleanFrom}"`);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    const content = this.editorContent ? this.editorContent.textContent : '';
    try {
      callback(content);
    } catch (e) {
      console.error('Error in initial DictationWidget subscription notification:', e);
    }
  }

  unsubscribe(callback) {
    this.subscribers.delete(callback);
  }

  _notifySubscribers() {
    const content = this.editorContent ? this.editorContent.textContent : '';
    for (const callback of this.subscribers) {
      try {
        callback(content);
      } catch (e) {
        console.error('Error in DictationWidget subscriber:', e);
      }
    }
  }

  setupUI() {
    const controlsContainer = makeElement('div', {
      className: 'dictation-controls-bar',
      style: {
        padding: this.compact ? '6px 10px' : '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: '#161e2b',
        borderBottom: '1px solid #232d3f',
        flexWrap: 'wrap'
      },
    });

    this.toggleListenBtn = makeElement(
      'button',
      {
        className: 'dictation-btn-listen',
        onclick: () => this.toggleListening(),
        style: {
          padding: this.compact ? '5px 12px' : '6px 14px',
          fontWeight: '700',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          backgroundColor: '#1b3320',
          border: '1px solid #2e4a32',
          color: '#8abf8e',
          fontSize: this.compact ? '11px' : '12px',
          fontFamily: 'monospace',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px'
        }
      },
      'Start Listening'
    );

    this.clearBtn = makeElement(
      'button',
      {
        onclick: () => this.clearContent(),
        style: {
          display: 'none',
          backgroundColor: '#3a1c1c',
          color: '#bd8a8a',
          border: '1px solid #5e2a2a',
          borderRadius: '6px',
          padding: this.compact ? '4px 8px' : '5px 10px',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: this.compact ? '11px' : '12px',
          fontFamily: 'monospace'
        }
      },
      'Clear'
    );

    this.statusDiv = makeElement('div', {
      className: 'dictation-status-div',
      style: {
        fontStyle: 'italic',
        color: '#94a3b8',
        margin: '0 4px',
        flex: '1',
        fontSize: this.compact ? '11px' : '12px',
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      },
    });

    this.replaceBtn = makeElement(
      'button',
      {
        className: 'dr-nav-btn',
        title: 'Manage Custom Spoken Word Replacements',
        style: { padding: this.compact ? '4px 8px' : '5px 10px', fontSize: this.compact ? '11px' : '12px', color: '#c084fc', borderColor: 'rgba(192, 132, 252, 0.4)' },
        onclick: () => this.openReplacementsDialog()
      },
      'Vocabulary'
    );

    this.copyButton = makeElement(
      'button',
      {
        className: 'dr-nav-btn',
        style: { padding: this.compact ? '4px 8px' : '5px 10px', fontSize: this.compact ? '11px' : '12px' },
        onclick: (e) => this.copyContent(e),
      },
      'Copy'
    );

    this.toggleEditBtn = makeElement(
      'button',
      {
        className: 'dr-nav-btn',
        style: { padding: this.compact ? '4px 8px' : '5px 10px', fontSize: this.compact ? '11px' : '12px' },
        onclick: () => this.toggleEditMode()
      },
      'Quick Edit'
    );

    controlsContainer.append(
      this.clearBtn,
      this.toggleListenBtn,
      this.statusDiv,
      this.replaceBtn,
      this.copyButton,
      this.toggleEditBtn
    );

    this.editorContent = makeElement('div', {
      contentEditable: true,
      className: 'dictation-editor-content',
      'data-placeholder': this.placeholder,
      style: {
        height: '100%',
        minHeight: this.compact ? '100px' : '140px',
        outline: 'none',
        whiteSpace: 'pre-wrap',
        fontSize: this.compact ? '13px' : '14px',
        lineHeight: '1.6',
        color: '#f8fafc',
        padding: '12px',
        boxSizing: 'border-box',
        flex: '1',
        overflowY: 'auto',
        background: '#090d16',
        fontFamily: 'var(--dr-font-sans, -apple-system, sans-serif)'
      },
    });

    this.editorContent.addEventListener('input', () => {
      this.staleTimestamp = 0;
      this.updateButtonStates();
      this._notifySubscribers();
    });

    this.element = makeElement(
      'div',
      {
        className: 'superdictate-widget-container',
        style: {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          backgroundColor: '#090d16',
          border: '1.5px solid #232d3f',
          borderRadius: '8px',
          overflow: 'hidden'
        },
      },
      [controlsContainer, this.editorContent]
    );

    this.setupPopupUI();
    this.updateButtonStates();
  }

  setupPopupUI() {
    this.popupTextElement = makeElement('span');
    this.popupElement = makeElement(
      'div',
      { className: 'tentative-popup' },
      this.popupTextElement
    );

    this.popupSvgPath = makeElement('svg:path', {
      fill: 'none',
      stroke: '#00ff66',
      'stroke-width': '2.5'
    });

    this.popupSvgConnector = makeElement(
      'svg:svg',
      {
        className: 'tentative-popup-connector',
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100vw',
          height: '100vh',
          display: 'none',
          pointerEvents: 'none',
          zIndex: '2147483646'
        },
      },
      this.popupSvgPath
    );

    document.body.appendChild(this.popupElement);
    document.body.appendChild(this.popupSvgConnector);

    this.isPopupVisible = false;
  }

  updatePopup(text) {
    if (text) {
      this.popupTextElement.textContent = text;
      this.showPopup();
    } else {
      this.hidePopup();
    }
  }

  showPopup() {
    if (this.isPopupVisible) return;
    this.isPopupVisible = true;
  }

  hidePopup() {
    if (!this.isPopupVisible) return;
    this.isPopupVisible = false;
    if (this.popupElement) this.popupElement.style.display = 'none';
    if (this.popupSvgConnector) this.popupSvgConnector.style.display = 'none';
  }

  positionPopup(caretRect, editorRect) {
    if (!this.isPopupVisible || !caretRect || !editorRect) return;

    if (this.popupElement.parentElement !== document.body) {
      document.body.appendChild(this.popupElement);
      document.body.appendChild(this.popupSvgConnector);
    }

    this.popupElement.style.display = 'block';
    this.popupSvgConnector.style.display = 'block';
    const popupEl = this.popupElement;

    void popupEl.offsetHeight;
    const pWidth = popupEl.offsetWidth;

    const gap = 10;
    const desiredTop = caretRect.bottom + gap;
    let desiredLeft = caretRect.left + caretRect.width / 2 - pWidth / 2;

    const pad = 10;
    if (desiredLeft < pad) desiredLeft = pad;
    if (desiredLeft + pWidth > window.innerWidth - pad) {
      desiredLeft = Math.max(pad, window.innerWidth - pad - pWidth);
    }

    popupEl.style.transform = `translate3d(${Math.round(desiredLeft)}px, ${Math.round(desiredTop)}px, 0)`;

    requestAnimationFrame(() => {
      const finalPopupRect = popupEl.getBoundingClientRect();
      this.drawPopupConnector(caretRect, finalPopupRect, 'top');
    });
  }

  drawPopupConnector(caretRect, popupRect, anchorSide) {
    if (!this.popupSvgPath) return;

    const startX = caretRect.left + caretRect.width / 2;
    const startY = caretRect.bottom;

    let endX, endY;
    switch (anchorSide) {
      case 'top':
        endX = popupRect.left + popupRect.width / 2;
        endY = popupRect.top;
        break;
      default:
        endX = popupRect.left + popupRect.width / 2;
        endY = popupRect.top;
    }

    const tension = 30;
    const cp1x = startX;
    const cp1y = startY + tension;
    const cp2x = endX;
    const cp2y = endY - tension;

    this.popupSvgPath.setAttribute(
      'd',
      `M ${startX},${startY} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${endX},${endY}`
    );
  }

  showPopupCentered(editorRect) {
    if (!this.isPopupVisible || !editorRect) return;
    this.popupSvgConnector.style.display = 'none';
    this.popupElement.style.display = 'block';

    const popupEl = this.popupElement;
    void popupEl.offsetHeight;
    const popupRect = popupEl.getBoundingClientRect();

    const targetTop = editorRect.top + editorRect.height / 2 - popupRect.height / 2;
    const targetLeft = editorRect.left + editorRect.width / 2 - popupRect.width / 2;

    const finalLeft = targetLeft + window.scrollX;
    const finalTop = targetTop + window.scrollY;

    popupEl.style.transform = `translate(${finalLeft}px, ${finalTop}px)`;
  }

  setupRecognition() {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) {
      this.updateStatus('❌ Speech API not supported in this browser.');
      return;
    }
    this.recognition = new SpeechAPI();
    this.recognition.lang = 'en-US';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    this.recognition.onresult = (event) => this.handleRecognitionResult(event);

    this.recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      console.warn('[DictationWidget] Speech notice:', event.error);
      if (event.error === 'not-allowed') {
        this.updateStatus('❌ Microphone access denied.');
        this.stopListening();
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          setTimeout(() => {
            if (this.isListening) {
              try { this.recognition.start(); } catch (err) {}
            }
          }, 200);
        }
      }
    };

    this.recognition.onspeechstart = () => {
      if (this.isListening) {
        this.statusDiv.textContent = '🎙️ Transcribing voice...';
      }
    };
    this.recognition.onspeechend = () => {
      if (this.isListening) {
        this.statusDiv.textContent = '🔴 Listening... (speak now)';
      }
    };
  }

  updateStatus(txt) {
    if (this.statusDiv) this.statusDiv.textContent = txt;
  }

  stopListening() {
    if (!this.isListening) return;
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    this.updatePopup('');
    this.updateButtonStates();
  }

  startListening() {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) {
      alert('Speech Recognition API is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }
    if (this.isListening) return;

    const sel = window.getSelection();
    let savedRange = null;
    if (sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (this.editorContent.contains(r.commonAncestorContainer)) {
        savedRange = r.cloneRange();
      }
    }

    this.editorContent.focus();

    if (savedRange) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
      this.lastRange = savedRange;
    } else {
      sel.selectAllChildren(this.editorContent);
      sel.collapseToEnd();
    }

    this.handleCaretActivity();

    this.isListening = true;
    try {
      this.recognition.start();
    } catch (e) {}
    this.updateButtonStates();
  }

  handleRecognitionResult(event) {
    let interimTranscript = '';
    let finalTranscript = '';
    let anyFinal = false;

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
        anyFinal = true;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (interimTranscript) {
      const tokens = this.tokeniseWithSerials(interimTranscript);
      this.lastTokens = tokens;
      const display = this.renderTokens(tokens);
      this.updatePopup(display);
      this.handleCaretActivity();
    }

    if (!anyFinal) return;

    const cmdResult = this.parseCommandFromTranscript(finalTranscript);
    const textToProcess = cmdResult.text || '';

    if (textToProcess.trim()) {
      const finalTokens = this.tokeniseWithSerials(textToProcess);
      const finalDisplay = this.renderTokens(finalTokens);

      const finalSerials = new Set(finalTokens.map((t) => t.serial));
      this.pendingPunct = this.pendingPunct.filter((p) => !finalSerials.has(p.serial));

      const rawNow = !!this.modifierHeld;
      this.insertTextAtCursor(finalDisplay, rawNow);
    } else {
      this.pendingPunct = [];
    }

    if (cmdResult.action) {
      requestAnimationFrame(() => {
        cmdResult.action();
      });
    }

    this.updatePopup('');
    this.lastTokens = [];
  }

  /**
   * Processes transcript incorporating:
   * 1. Literal escape protocol ("literal comma" -> "comma")
   * 2. Punctuation mapping
   * 3. Learned custom replacement dictionary
   */
  processTranscript(rawText) {
    const tokens = rawText.trim().split(/\s+/);
    if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === '')) return '';

    let out = '';
    let shouldCapitalizeNextWord = false;

    for (let i = 0; i < tokens.length; i++) {
      const rawCurrent = tokens[i];
      const lower = rawCurrent.toLowerCase();
      const nextLower = (tokens[i + 1] || '').toLowerCase();

      // --- PROTOCOL 1: "LITERAL" ESCAPE PROTOCOL ---
      // If the user says "literal comma", output "comma" as a literal word!
      if (lower === 'literal' && i + 1 < tokens.length) {
        const escapedWord = tokens[i + 1];
        out += escapedWord + ' ';
        i++; // skip escaped word
        continue;
      }

      // --- PROTOCOL 2: CUSTOM REPLACEMENT DICTIONARY ---
      // Check multi-word replacement first
      const twoWordKey = `${lower} ${nextLower}`;
      if (this.customReplacements[twoWordKey]) {
        out += this.customReplacements[twoWordKey] + ' ';
        i++;
        continue;
      } else if (this.customReplacements[lower]) {
        out += this.customReplacements[lower] + ' ';
        continue;
      }

      // --- PROTOCOL 3: PUNCTUATION PARSER ---
      let punct = undefined;
      let consumed = 0;

      if (Object.prototype.hasOwnProperty.call(this.punctMap, twoWordKey)) {
        punct = this.punctMap[twoWordKey];
        consumed = 2;
      } else if (Object.prototype.hasOwnProperty.call(this.punctMap, lower)) {
        punct = this.punctMap[lower];
        consumed = 1;
      }

      if (punct) {
        if (out.endsWith(' ')) out = out.slice(0, -1);
        out += punct;

        if (/[.!?]|\n\n/.test(punct)) shouldCapitalizeNextWord = true;
        if (/[.,!?;:]/.test(punct)) out += ' ';

        i += consumed - 1;
      } else {
        let word = rawCurrent;
        if (word.toLowerCase() === 'i') word = 'I';

        if (shouldCapitalizeNextWord) {
          word = word.charAt(0).toUpperCase() + word.slice(1);
          shouldCapitalizeNextWord = false;
        }
        out += word + ' ';
      }
    }

    return out.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
  }

  insertTextAtCursor(text, isRaw = false) {
    if (!this.editorContent) return;

    let frag = isRaw ? text : this.processTranscript(text);
    if (!frag && frag !== '\n' && frag !== '\n\n') return;

    const content = this.editorContent.textContent || '';
    let start = 0;
    if (this.lastRange) {
      const whole = document.createRange();
      whole.selectNodeContents(this.editorContent);
      const beforeR = document.createRange();
      beforeR.setStart(whole.startContainer, whole.startOffset);
      beforeR.setEnd(this.lastRange.startContainer, this.lastRange.startOffset);
      start = beforeR.toString().length;
    } else {
      start = content.length;
    }

    if (/[a-zA-Z0-9]/.test(frag)) {
      if (start === 0 || /[.!?\n]\s*$/.test(content.slice(0, start))) {
        frag = frag.charAt(0).toUpperCase() + frag.slice(1);
      }
    }

    const charBefore = content.charAt(start - 1);
    if (!/^[.,;:!?\n]/.test(frag) && charBefore && !/\s/.test(charBefore)) {
      frag = ' ' + frag;
    }

    this.editorContent.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();

    let range;
    if (this.lastRange) {
      range = this.lastRange.cloneRange();
    } else {
      range = document.createRange();
      range.selectNodeContents(this.editorContent);
      range.collapse(false);
    }

    range.deleteContents();

    const fragment = document.createDocumentFragment();
    const parts = frag.split('\n');
    let lastInsertedNode = null;

    parts.forEach((part, index) => {
      if (part.length > 0) {
        const textNode = document.createTextNode(part);
        fragment.appendChild(textNode);
        lastInsertedNode = textNode;
      }
      if (index < parts.length - 1) {
        const br = document.createElement('br');
        fragment.appendChild(br);
        lastInsertedNode = br;
      }
    });

    if (fragment.hasChildNodes()) {
      range.insertNode(fragment);
      if (lastInsertedNode) {
        range.setStartAfter(lastInsertedNode);
        range.collapse(true);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    }

    this.handleCaretActivity();
    this._notifySubscribers();

    requestAnimationFrame(() => {
      this.editorContent.scrollTop = this.editorContent.scrollHeight;
    });
  }

  handleCaretActivity() {
    const sel = window.getSelection();
    let finalCaretRect = null;
    const editorRect = this.editorContent.getBoundingClientRect();

    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (this.editorContent.contains(range.commonAncestorContainer)) {
        this.lastRange = range.cloneRange();
        const posRange = range.cloneRange();
        posRange.collapse(true);

        const rects = posRange.getClientRects();
        if (rects && rects.length > 0) {
          const rawRect = rects[0];
          finalCaretRect = {
            left: rawRect.left,
            top: rawRect.top,
            width: rawRect.width || 8,
            height: rawRect.height || 18,
            right: rawRect.right || rawRect.left + (rawRect.width || 8),
            bottom: rawRect.bottom || rawRect.top + (rawRect.height || 18),
          };
        }
      }
    }

    if (!finalCaretRect && editorRect) {
      finalCaretRect = {
        left: editorRect.left + 16,
        top: editorRect.top + 16,
        width: 8,
        height: 18,
        right: editorRect.left + 24,
        bottom: editorRect.top + 34
      };
    }

    this.lastCaretRect = finalCaretRect;

    if (this.lastCaretRect) {
      this.positionPopup(this.lastCaretRect, editorRect);
    } else {
      this.showPopupCentered(editorRect);
    }
  }

  tokeniseWithSerials(asrString) {
    const words = asrString.trim().split(/\s+/).filter(Boolean);
    const prev = this.lastTokens;
    const used = new Set();
    const tokens = [];

    words.forEach((w) => {
      let reusedSerial = null;
      for (let i = 0; i < prev.length; i++) {
        if (!used.has(i) && prev[i].word === w) {
          reusedSerial = prev[i].serial;
          used.add(i);
          break;
        }
      }
      if (reusedSerial === null) reusedSerial = this.tokenSerialCounter++;
      tokens.push({ word: w, serial: reusedSerial });
    });

    return tokens;
  }

  renderTokens(tokens) {
    const punctMap = {};
    this.pendingPunct.forEach((p) => {
      punctMap[p.serial] ||= [];
      punctMap[p.serial].push(p.char);
    });

    const parts = [];
    tokens.forEach((t, idx) => {
      parts.push(t.word);
      if (punctMap[t.serial]) {
        punctMap[t.serial].forEach((ch) => parts.push(ch));
      }
      if (idx < tokens.length - 1) parts.push(' ');
    });
    return parts.join('');
  }

  applyStyles() {
    const css = `
        .superdictate-widget-container { box-sizing: border-box; }
        .dictation-editor-content:empty:before {
          content: attr(data-placeholder);
          color: #64748b;
          font-style: italic;
          pointer-events: none;
        }
        .tentative-popup {
          position: fixed; top: 0; left: 0;
          background-color: #000000 !important;
          color: #ffffff !important;
          border: 3px solid #00ff66 !important; 
          border-radius: 6px;
          box-shadow: 0 4px 20px rgba(0, 255, 102, 0.45), 0 6px 24px rgba(0,0,0,0.9);
          padding: 10px 14px;
          font-family: sans-serif;
          font-size: 1.1rem; 
          font-weight: 500;
          z-index: 2147483647; 
          pointer-events: none; 
          display: none; 
          will-change: transform;
          max-width: 450px; 
          white-space: pre-wrap; 
          word-break: break-word;
        }
        .tentative-popup-connector {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          pointer-events: none; overflow: visible; z-index: 2147483646;
        }
        .tentative-popup-connector path {
          fill: none !important; 
          stroke: #00ff66 !important; 
          stroke-width: 2.5px !important;
          filter: drop-shadow(0 0 4px #00ff66);
        }
        .quick-edit-span-word, .quick-edit-span-space { cursor: pointer; border-radius: 3px; }
        .quick-edit-span-space { display: inline-block; vertical-align: bottom; }
        .quick-edit-span-word.highlight-main { background-color: rgba(0, 122, 204, 0.85); }
        .quick-edit-span-word.highlight-context { background-color: rgba(0, 122, 204, 0.35); }
        .quick-edit-span-space.highlight-space { animation: flash-green 0.8s infinite; }
        @keyframes flash-green { 0%, 100% { background-color: transparent; } 50% { background-color: #4dff4d; } }
    `;
    applyCss(css, 'DictationWidgetStyles');
  }

  toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  toggleEditMode() {
    if (this.isListening) this.stopListening();

    this.isEditing = !this.isEditing;
    if (this.isEditing) {
      this.spanifyContent();
      this.editorContent.addEventListener('mousemove', this.boundHandleEditorMouseMove);
      this.editorContent.addEventListener('mouseleave', this.boundClearAllHighlights);
    } else {
      this.clearAllHighlights();
      this.deSpanifyContent();
      this.editorContent.removeEventListener('mousemove', this.boundHandleEditorMouseMove);
      this.editorContent.removeEventListener('mouseleave', this.boundClearAllHighlights);
    }
    this.updateButtonStates();
  }

  spanifyContent() {
    if (!this.spaceWidth) this.getSpaceWidth();

    const text = this.editorContent.textContent;
    this.editorContent.contentEditable = false;
    while (this.editorContent.firstChild) {
      this.editorContent.removeChild(this.editorContent.firstChild);
    }

    const fragment = document.createDocumentFragment();
    const lines = text.split('\n');

    lines.forEach((line, index) => {
      const tokens = line.match(/\S+|\s+/g) || [];
      tokens.forEach((token) => {
        if (/\S/.test(token)) {
          const span = makeElement('span', { className: 'quick-edit-span-word' }, token);
          fragment.appendChild(span);
        } else {
          for (let i = 0; i < token.length; i++) {
            const spaceSpan = makeElement('span', {
              className: 'quick-edit-span-space',
              style: { width: `${this.spaceWidth}px` },
            }, '\u200B');
            fragment.appendChild(spaceSpan);
          }
        }
      });

      if (index < lines.length - 1) {
        fragment.appendChild(makeElement('br'));
      }
    });

    this.editorContent.appendChild(fragment);
  }

  deSpanifyContent() {
    let reconstructedText = '';
    this.editorContent.childNodes.forEach((node) => {
      if (node.nodeName === 'BR') {
        reconstructedText += '\n';
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.classList.contains('quick-edit-span-space')
      ) {
        reconstructedText += ' ';
      } else {
        reconstructedText += node.textContent;
      }
    });

    this.editorContent.contentEditable = true;
    this.editorContent.textContent = reconstructedText;
    this.editorContent.focus();

    const sel = window.getSelection();
    if (sel) {
      sel.selectAllChildren(this.editorContent);
      sel.collapseToEnd();
    }

    this._notifySubscribers();
  }

  updateButtonStates() {
    if (!this.statusDiv) return;

    const hasText = this.hasContent();

    if (this.clearBtn) {
      this.clearBtn.style.display = hasText ? 'inline-block' : 'none';
    }

    if (this.isListening) {
      this.toggleListenBtn.textContent = 'Stop Listening';
      this.toggleListenBtn.style.backgroundColor = '#331b1b';
      this.toggleListenBtn.style.borderColor = '#4a2e2e';
      this.toggleListenBtn.style.color = '#bf8a8a';
    } else {
      this.toggleListenBtn.textContent = 'Start Listening';
      this.toggleListenBtn.style.backgroundColor = '#1b3320';
      this.toggleListenBtn.style.borderColor = '#2e4a32';
      this.toggleListenBtn.style.color = '#8abf8e';
    }

    this.toggleListenBtn.disabled = this.isEditing;
    this.toggleEditBtn.textContent = this.isEditing ? 'Finish Editing' : 'Quick Edit';

    let status = '🔇 Idle';
    if (this.isEditing) status = '✏️ Editing';
    else if (this.isListening) status = '🔴 Listening... (speak freely)';
    const modText = this.modifierHeld ? ' (Raw Mode)' : '';
    this.statusDiv.textContent = `${status}${modText}`;
  }

  handleEditorMouseMove(e) {
    const target = e.target;
    if (
      !target ||
      (!target.classList.contains('quick-edit-span-word') &&
        !target.classList.contains('quick-edit-span-space'))
    ) {
      this.clearAllHighlights();
      return;
    }

    this.clearAllHighlights();

    const highlight = (el, type) => {
      if (
        el &&
        (el.classList.contains('quick-edit-span-word') ||
          el.classList.contains('quick-edit-span-space'))
      ) {
        el.classList.add(type);
        this.currentlyHighlighted.push(el);
      }
    };

    const targetSpace = this.findTargetSpace(target, e.clientX);

    if (targetSpace) {
      const prevWord = targetSpace.previousElementSibling;
      const nextWord = targetSpace.nextElementSibling;
      highlight(targetSpace, 'highlight-space');
      highlight(prevWord, 'highlight-context');
      highlight(nextWord, 'highlight-context');
    } else if (target.classList.contains('quick-edit-span-word')) {
      highlight(target, 'highlight-main');
    }
  }

  clearAllHighlights() {
    for (const el of this.currentlyHighlighted) {
      el.classList.remove('highlight-main', 'highlight-context', 'highlight-space');
    }
    this.currentlyHighlighted = [];
  }

  getSpaceWidth() {
    const measurer = makeElement('span', {
      style: {
        position: 'absolute',
        visibility: 'hidden',
        font: window.getComputedStyle(this.editorContent).font,
        'white-space': 'pre',
      },
    }, ' ');

    document.body.appendChild(measurer);
    this.spaceWidth = measurer.getBoundingClientRect().width;
    document.body.removeChild(measurer);
  }

  clearContent() {
    while (this.editorContent.firstChild) {
      this.editorContent.removeChild(this.editorContent.firstChild);
    }
    this.staleTimestamp = 0;
    this.editorContent.focus();
    this.updateButtonStates();
    this._notifySubscribers();
  }

  copyContent(e) {
    if (this.isEditing) this.toggleEditMode();
    const text = this.editorContent.textContent;
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      let button = e ? e.currentTarget : this.copyButton;
      this._showButtonFeedback(button, '✓ Copied!');
    });
  }

  findTargetSpace(target, clientX) {
    if (target.classList.contains('quick-edit-span-space')) {
      return target;
    }
    if (target.classList.contains('quick-edit-span-word')) {
      const rect = target.getBoundingClientRect();
      const relX = (clientX - rect.left) / rect.width;
      if (relX < 0.5) {
        const prev = target.previousElementSibling;
        return (prev && prev.classList.contains('quick-edit-span-space')) ? prev : target.nextElementSibling;
      } else {
        const next = target.nextElementSibling;
        return (next && next.classList.contains('quick-edit-span-space')) ? next : target.previousElementSibling;
      }
    }
    return null;
  }

  getElement() {
    return this.element;
  }

  destroy() {
    this.stopListening();
    if (this.popupElement) this.popupElement.remove();
    if (this.popupSvgConnector) this.popupSvgConnector.remove();
    this.subscribers.clear();
    if (this.element) this.element.remove();
  }

  _showButtonFeedback(button, tempText) {
    if (!button) return;
    const originalText = button.textContent;
    button.textContent = tempText;
    button.disabled = true;
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1500);
  }

  hasContent() {
    if (!this.editorContent) return false;
    const cleanText = this.editorContent.textContent.replace(/[\u200B\u00A0]/g, '').trim();
    return cleanText.length > 0;
  }

  getText() {
    if (!this.editorContent) return '';
    return this.editorContent.textContent.replace(/[\u200B\u00A0]/g, ' ').trim();
  }

  setText(text) {
    if (!this.editorContent) return;
    this.editorContent.textContent = text || '';
    this.staleTimestamp = 0;
    this.updateButtonStates();
    this._notifySubscribers();
  }

  focus() {
    if (this.editorContent) this.editorContent.focus();
  }

  setupEventListeners() {
    this.editorContent.addEventListener('keyup', () => this.handleCaretActivity());
    this.editorContent.addEventListener('mouseup', () => this.handleCaretActivity());
    this.editorContent.addEventListener('input', () => {
      this.handleCaretActivity();
      this._notifySubscribers();
    });
    this.editorContent.addEventListener('blur', () => this.hidePopup());

    document.addEventListener('selectionchange', () => {
      if (document.activeElement === this.editorContent)
        this.handleCaretActivity();
    });

    this.editorContent.addEventListener('paste', (e) => {
      e.preventDefault();
      const plain = e.clipboardData.getData('text/plain');
      if (!plain) return;

      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(plain);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);

      this.handleCaretActivity();
      this._notifySubscribers();
      this.updateButtonStates();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        this.modifierHeld = true;
        this.updateButtonStates();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        this.modifierHeld = false;
        this.updateButtonStates();
      }
    });
  }

  parseCommandFromTranscript(transcript) {
    const clean = transcript.trim();
    if (/^(.*)(?:^|\s)copy to clipboard[\W]*$/i.test(clean)) {
      const match = clean.match(/^(.*)(?:^|\s)copy to clipboard[\W]*$/i);
      return { text: match[1], action: () => this.copyContent() };
    }
    if (/^(.*)(?:^|\s)clear notes?[\W]*$/i.test(clean)) {
      return { text: '', action: () => this.clearContent() };
    }
    if (/^(.*)(?:^|\s)quick edit[\W]*$/i.test(clean)) {
      const match = clean.match(/^(.*)(?:^|\s)quick edit[\W]*$/i);
      return { text: match[1], action: () => this.toggleEditMode() };
    }
    return { text: clean, action: null };
  }

  openReplacementsDialog() {
    const wrap = makeElement('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: '12px',
        color: '#f8fafc', fontFamily: 'monospace', fontSize: '11.5px'
      }
    });

    const desc = makeElement('div', {
      style: { color: '#94a3b8', lineHeight: '1.45' }
    }, 'Add custom phonetic replacements for words or names speech recognition gets wrong. You can always revert any replacement in-situ.');
    wrap.appendChild(desc);

    const inputRow = makeElement('div', {
      style: { display: 'flex', gap: '6px', alignItems: 'center' }
    });

    const fromInput = makeElement('input', {
      type: 'text', placeholder: 'Spoken / Misheard...',
      style: { flex: 1, padding: '6px 8px', background: '#070a13', color: '#f8fafc', border: '1px solid #232d3f', borderRadius: '4px' }
    });
    const toInput = makeElement('input', {
      type: 'text', placeholder: 'Replace with...',
      style: { flex: 1, padding: '6px 8px', background: '#070a13', color: '#00f2fe', border: '1px solid #232d3f', borderRadius: '4px' }
    });
    const addBtn = makeElement('button', {
      className: 'dr-nav-btn primary',
      style: { padding: '6px 10px', fontSize: '11px', fontWeight: 'bold' },
      onclick: () => {
        const from = fromInput.value.trim();
        const to = toInput.value.trim();
        if (from && to) {
          this.addReplacementRule(from, to);
          fromInput.value = '';
          toInput.value = '';
          renderList();
        }
      }
    }, '+ Add');

    inputRow.append(fromInput, toInput, addBtn);
    wrap.appendChild(inputRow);

    const listContainer = makeElement('div', {
      style: {
        maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: '6px', borderTop: '1px solid #1e293b', paddingTop: '8px'
      }
    });
    wrap.appendChild(listContainer);

    const renderList = () => {
      listContainer.innerHTML = '';
      const keys = Object.keys(this.customReplacements);
      if (keys.length === 0) {
        listContainer.appendChild(makeElement('div', {
          style: { padding: '12px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }
        }, 'No custom replacements yet.'));
        return;
      }
      keys.forEach(k => {
        const row = makeElement('div', {
          style: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'rgba(255,255,255,0.03)', padding: '5px 8px', borderRadius: '4px', border: '1px solid #1e293b'
          }
        }, [
          makeElement('div', {}, [
            makeElement('span', { style: { color: '#ef4444' } }, `"${k}"`),
            makeElement('span', { style: { color: '#64748b', margin: '0 6px' } }, '➔'),
            makeElement('strong', { style: { color: '#00f2fe' } }, `"${this.customReplacements[k]}"`)
          ]),
          makeElement('button', {
            style: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' },
            onclick: () => {
              this.removeReplacementRule(k);
              renderList();
            }
          }, '✕')
        ]);
        listContainer.appendChild(row);
      });
    };
    renderList();

    if (typeof UITools !== 'undefined' && typeof UITools.makeDialog === 'function') {
      UITools.makeDialog({
        title: '🎙️ Custom Spoken Vocabulary & Replacements',
        size: [480, 420],
        position: [Math.max(20, (window.innerWidth - 480) / 2), 80],
        contentElement: wrap,
        appendTo: document.body
      });
    }
  }
}

globalThis.DictationWidget = DictationWidget;
if (typeof module !== 'undefined' && module.exports) module.exports = DictationWidget;