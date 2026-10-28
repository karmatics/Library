class CadPlanItemNotes {
  /**
   * Persistent IndexedDB & LocalStorage Item-Notes Engine for HomeSetup.
   * Manages the Living Specification lifecycle: attaching thoughts to specific blocks,
   * touring notes sequentially, and compiling them into AI patch prompts.
   */
  static DB_NAME = 'CadPlan_ItemNotes_DB';
  static DB_VERSION = 1;
  static STORE_NAME = 'item_notes';
  static LOCAL_STORAGE_KEY = 'cadplan_item_notes_v1';
  static _subscribers = new Set();
  static _dbPromise = null;

  static async getDB() {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('blockKey', 'blockKey', { unique: false });
          store.createIndex('pageId', 'pageId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[CadPlanItemNotes] IndexedDB open error, falling back to localStorage');
        resolve(null);
      };
    });
    return this._dbPromise;
  }

  static getLocalMap() {
    try {
      const raw = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  static saveLocalMap(map) {
    try {
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  static async getAllNotes(dossierFilter = null) {
      if (typeof CommentsItemNotes !== 'undefined' && typeof CommentsItemNotes.getAllNotes === 'function') {
        try {
          const ext = await CommentsItemNotes.getAllNotes(dossierFilter);
          if (Array.isArray(ext) && ext.length > 0) return ext;
        } catch (e) {}
      }

      // Direct autonomous fallback to local storage & IndexedDB
      const map = this.getLocalMap();
      const localNotes = [];
      Object.keys(map).forEach(k => {
        if (Array.isArray(map[k])) {
          map[k].forEach(n => {
            if (!dossierFilter || n.dossierId === dossierFilter || (n.key && n.key.startsWith(dossierFilter + ':'))) {
              localNotes.push(n);
            }
          });
        }
      });

      const db = await this.getDB();
      if (db) {
        return new Promise((resolve) => {
          try {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
              const dbNotes = req.result || [];
              const merged = new Map();
              localNotes.forEach(n => merged.set(n.id, n));
              dbNotes.forEach(n => {
                if (!dossierFilter || n.dossierId === dossierFilter || (n.key && n.key.startsWith(dossierFilter + ':'))) {
                  merged.set(n.id, n);
                }
              });
              resolve(Array.from(merged.values()));
            };
            req.onerror = () => resolve(localNotes);
          } catch (err) {
            resolve(localNotes);
          }
        });
      }

      return localNotes;
    }
  static async getNotesForBlock(pageId, blockId, dossierId = 'HomeSetup') {
      const key = `${dossierId}:${pageId}:${blockId}`;
      const all = await this.getAllNotes(dossierId);
      return all.filter(n => n.key === key || (n.pageId === pageId && n.blockId === blockId));
    }
  static async getAnnotatedBlocks() {
    const all = await this.getAllNotes();
    const active = all.filter(n => n.status !== 'resolved');
    const seen = new Map();
    active.forEach(n => {
      if (!seen.has(n.blockKey)) {
        seen.set(n.blockKey, {
          blockKey: n.blockKey,
          pageId: n.pageId,
          blockId: n.blockId,
          notes: []
        });
      }
      seen.get(n.blockKey).notes.push(n);
    });
    return Array.from(seen.values());
  }

  static async addNote(pageId, blockId, text, options = {}) {
      if (!text || !text.trim()) return null;
      const dossierId = options.dossierId || 'HomeSetup';
      const key = `${dossierId}:${pageId}:${blockId}`;
      const id = 'note_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

      const entry = {
        id,
        key,
        blockKey: `${pageId}:${blockId}`,
        pageId,
        blockId,
        dossierId,
        text: text.trim(),
        timestamp: Date.now(),
        status: options.status || 'active',
        author: options.author || (options.isLLM ? 'LLM' : 'Author'),
        isLLM: Boolean(options.isLLM || options.author === 'LLM'),
        type: options.type || (options.isLLM ? 'proposal' : 'note'),
        proposedPatch: options.proposedPatch || null,
        proposedText: options.proposedText || null,
        videoLink: options.videoLink || null,
        blockPreview: options.blockPreview || '',
        xpath: options.xpath || null,
        cssPath: options.cssPath || null,
        tagName: options.tagName || null,
        isUniversalElement: Boolean(options.xpath || options.isUniversalElement)
      };

      const map = this.getLocalMap();
      map[key] = map[key] || [];
      map[key].push(entry);
      this.saveLocalMap(map);

      const db = await this.getDB();
      if (db) {
        try {
          const tx = db.transaction(this.STORE_NAME, 'readwrite');
          tx.objectStore(this.STORE_NAME).put(entry);
        } catch (err) {}
      }

      this._notify();
      return entry;
    }

  static async updateNote(noteId, updates) {
      const all = await this.getAllNotes();
      const note = all.find(n => n.id === noteId);
      if (!note) return null;

      Object.assign(note, updates, { updatedTimestamp: Date.now() });

      const map = this.getLocalMap();
      const storageKey = note.key || `${note.dossierId || 'HomeSetup'}:${note.pageId}:${note.blockId}`;
      if (map[storageKey]) {
        const idx = map[storageKey].findIndex(n => n.id === noteId);
        if (idx !== -1) map[storageKey][idx] = note;
        this.saveLocalMap(map);
      }

      const db = await this.getDB();
      if (db) {
        try {
          const tx = db.transaction(this.STORE_NAME, 'readwrite');
          tx.objectStore(this.STORE_NAME).put(note);
        } catch (err) {}
      }

      this._notify();
      return note;
    }

  static async deleteNote(noteId) {
      const all = await this.getAllNotes();
      const note = all.find(n => n.id === noteId);
      if (!note) return false;

      const map = this.getLocalMap();
      const storageKey = note.key || `${note.dossierId || 'HomeSetup'}:${note.pageId}:${note.blockId}`;
      if (map[storageKey]) {
        map[storageKey] = map[storageKey].filter(n => n.id !== noteId);
        if (map[storageKey].length === 0) delete map[storageKey];
        this.saveLocalMap(map);
      }

      const db = await this.getDB();
      if (db) {
        try {
          const tx = db.transaction(this.STORE_NAME, 'readwrite');
          tx.objectStore(this.STORE_NAME).delete(noteId);
        } catch (err) {}
      }

      this._notify();
      return true;
    }
  static subscribe(fn) {
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  static _notify() {
    this._subscribers.forEach(fn => {
      try { fn(); } catch (e) {}
    });
  }

  static async buildNotesDirectivePrompt(docReader = null) {
        const dossierId = docReader?.options?.dossierId || docReader?.brandTitle || 'HomeSetup';
        const all = await this.getAllNotes(dossierId);
        const active = all.filter(n => n.status !== 'resolved');
        if (active.length === 0) {
          return `# NO ACTIVE LIVING SPEC DIRECTIVES\nThere are currently no active author notes or revision directives attached in the living dossier [${dossierId}].`;
        }

        let out = `# 🎯 LIVING SPECIFICATION EVOLUTION: AUTHOR DIRECTIVES & UNIVERSAL ANNOTATIONS\n`;
        out += `**Dossier:** ${dossierId} • **Generated:** ${new Date().toISOString()} • **Author/Inventor:** Rob Brown\n`;
        out += `**Active Directives:** ${active.length} notes across ${new Set(active.map(n => n.blockKey)).size} locations\n`;
        out += '**Execution Directive:** Incorporate the following author directives directly into the specified source files and class methods. Keep all existing verified mathematics, direction cosines, and repository connections fully intact.\n\n';
        out += '---\n\n';

        const grouped = {};
        active.forEach(n => {
          grouped[n.blockKey] = grouped[n.blockKey] || [];
          grouped[n.blockKey].push(n);
        });

        const componentClassMap = {
          comp_tentative_snapping_lab: { cls: 'TentativeSnappingLab', file: 'HomeSetup/js/TentativeSnappingLab.js', desc: 'Interactive Snapping Lab (50ms chorded clicks & thick picking)' },
          comp_nearest_intersection_lab: { cls: 'CadNearestIntersectionLab', file: 'HomeSetup/js/CadNearestIntersectionLab.js', desc: 'Nearest Snap ("N") Ray-Arc Quadratic Intersection Lab' },
          comp_surface_normal_lab: { cls: 'CadSurfaceNormalLab', file: 'HomeSetup/js/CadSurfaceNormalLab.js', desc: 'Surface Normal Alignment ("Q") & Reset Reversion Lab' },
          comp_smart_keyin_lab: { cls: 'CadSmartKeyinLab', file: 'HomeSetup/js/CadSmartKeyinLab.js', desc: 'SmartKeyin Sign Inference & Smart Backspace Sandbox' },
          comp_tangent_arc_swing_lab: { cls: 'CadTangentArcSwingLab', file: 'HomeSetup/js/CadTangentArcSwingLab.js', desc: 'Closest-Point Sweep Principle & Tangent Arc Swing Studio' },
          comp_transform_gym: { cls: 'CadTransformGymLab', file: 'HomeSetup/js/CadTransformGymLab.js', desc: '3-Point Transform Lab (Move, Rotate, Scale, and live ghosting)' },
          comp_zplane_gym: { cls: 'CadZPlaneElevationLab', file: 'HomeSetup/js/CadZPlaneElevationLab.js', desc: 'Z-Elevation & Construction Slicing Plane Lab' },
          comp_3d_smartline_lab: { cls: 'Cad3DSmartLineLab', file: 'HomeSetup/js/Cad3DSmartLineLab.js', desc: '3D SmartLine & iTwin ThreeAxes Studio' },
          comp_model_studio: { cls: 'CadModelStudioComponent', file: 'HomeSetup/js/CadModelStudioComponent.js', desc: '3D Model Studio (PBR materials, GLB loading & face snapping [Q])' },
          comp_cad_studio_demo: { cls: 'CadStudioDemoComponent', file: 'HomeSetup/js/CadStudioDemoComponent.js', desc: 'Production Studio (Live accuCad iframe & 3D parallax curves)' },
          comp_code_viewer: { cls: 'CadCodeViewerComponent', file: 'HomeSetup/js/CadCodeViewerComponent.js', desc: 'Code Viewer & Rust Crate Hooks' },
          comp_svg_smartline_lab: { cls: 'SvgSmartLineLab', file: 'HomeSetup/js/SvgSmartLineLab.js', desc: 'Pure SVG SmartLine Lab (Continuous chaining, tangent arcs & DXF bulges)' },
          comp_animated_svg_compass: { cls: 'CadAnimatedSvgCompassLab', file: 'HomeSetup/js/CadAnimatedSvgCompassLab.js', desc: 'Animated SVG Compass Lab (Superellipse morphing & Mini-Jack)' },
          comp_isolated_compass_3d: { cls: 'CadIsolatedCompass3DComponent', file: 'HomeSetup/js/CadIsolatedCompass3DComponent.js', desc: 'Isolated 3D Compass Viewport (High-contrast direction cosines)' },
          comp_agent_telemetry_lab: { cls: 'CadAgentTelemetryLab', file: 'HomeSetup/js/CadAgentTelemetryLab.js', desc: 'Autonomous AI Drafting Lab (MCP stream & relative vectors)' },
          comp_roundtrip_superpower: { cls: 'Cad2Dto3DRoundTripGraphic', file: 'HomeSetup/js/Cad2Dto3DRoundTripGraphic.js', desc: '2D OCS to 3D WCS Round-Trip Engine (AutoCAD compatibility)' },
          comp_kch_interactive_lab: { cls: 'KeyCommandInteractiveLab', file: 'HomeSetup/js/KeyCommandInteractiveLab.js', desc: 'Single-Stroke Key Command Engine Sandbox' },
          comp_curve_drawer_lab: { cls: 'CurveDrawerLabComponent', file: 'HomeSetup/js/CurveDrawerLabComponent.js', desc: 'On-Curve Spline Relaxation & Kinetic Tether Lab' },
          comp_number_stream_lab: { cls: 'AccuDrawNumberStreamLab', file: 'HomeSetup/js/AccuDrawNumberStreamLab.js', desc: 'Numerical Command Stream & Decimal Parser' },
          comp_compass_anatomy: { cls: 'CompassAnatomyComponent', file: 'HomeSetup/js/CompassAnatomyComponent.js', desc: 'The Squircle Compass Anatomical Deconstruction' },
          comp_master_showcase: { cls: 'CadMasterShowcaseComponent', file: 'HomeSetup/js/CadMasterShowcaseComponent.js', desc: 'HomeSetup Master Showcase & Dual-Audience Engine' },
          comp_touch_graphic: { cls: 'CadTouchP2PGraphicComponent', file: 'HomeSetup/js/CadTouchP2PGraphicComponent.js', desc: 'Two-Handed CAD Architecture & TouchController Graphic' },
          comp_vision_hero: { cls: 'CadVisionHeroGraphic', file: 'HomeSetup/js/CadVisionHeroGraphic.js', desc: 'The Expandable Dual-Mode CAD Engine Graphic' },
          comp_audience_migration: { cls: 'CadAudienceMigrationGraphic', file: 'HomeSetup/js/CadAudienceMigrationGraphic.js', desc: 'Audience Capture & Vibe-Coding Flywheel Graphic' },
          comp_plugin_hooks: { cls: 'CadPluginHookSpecGraphic', file: 'HomeSetup/js/CadPluginHookSpecGraphic.js', desc: 'The 3 Clean Upstream Hooks Plugin Spec Graphic' },
          comp_freedom_graphic: { cls: 'CadErgonomicFreedomGraphic', file: 'HomeSetup/js/CadErgonomicFreedomGraphic.js', desc: 'Ergonomic Freedom & Composable Instruments Graphic' },
          comp_coordinate_converter: { cls: 'CadCoordinateConverterLab', file: 'HomeSetup/js/CadCoordinateConverterLab.js', desc: 'Universal Arc & Coordinate Transformation Engine' },
          comp_runtime_matrix: { cls: 'CadRuntimeMatrixGraphic', file: 'HomeSetup/js/CadRuntimeMatrixGraphic.js', desc: 'Execution Environment Matrix & Pipeline Decoupling' },
          comp_ecosystem_graphic: { cls: 'CadEcosystemGraphicComponent', file: 'HomeSetup/js/CadEcosystemGraphicComponent.js', desc: 'Federated Multi-App Topology Map' },
          comp_architecture_graphic: { cls: 'CadArchitectureGraphicComponent', file: 'HomeSetup/js/CadArchitectureGraphicComponent.js', desc: '4-Layer Headless Geometric Kernel Stack' },
          comp_origins_graphic: { cls: 'CadOriginsGraphicComponent', file: 'HomeSetup/js/CadOriginsGraphicComponent.js', desc: '1995 Milestone & 3D Design Cube Graphic' }
        };

        const pageClassMap = {
          meta: { cls: 'CadPlanMetaContent', file: 'HomeSetup/js/CadPlanMetaContent.js' },
          origins: { cls: 'CadOriginsContent', file: 'HomeSetup/js/CadOriginsContent.js' },
          philosophy: { cls: 'AccuDrawPhilosophyContent', file: 'HomeSetup/js/AccuDrawPhilosophyContent.js' },
          accucad: { cls: 'AccuCadAuditContent', file: 'HomeSetup/js/AccuCadAuditContent.js' },
          shortcuts: { cls: 'KeyCommandEngineContent', file: 'HomeSetup/js/KeyCommandEngineContent.js' },
          curvedrawer: { cls: 'CadCurveDrawerContent', file: 'HomeSetup/js/CadCurveDrawerContent.js' },
          touchp2p: { cls: 'CadTouchP2PContent', file: 'HomeSetup/js/CadTouchP2PContent.js' },
          demos: { cls: 'CadInteractiveDemoContent', file: 'HomeSetup/js/CadInteractiveDemoContent.js' },
          ecosystem: { cls: 'CadLunoEcosystemContent', file: 'HomeSetup/js/CadLunoEcosystemContent.js' },
          architecture: { cls: 'CadArchitectureDecisionsContent', file: 'HomeSetup/js/CadArchitectureDecisionsContent.js' },
          cadcraft: { cls: 'CadCraftIntegrationContent', file: 'HomeSetup/js/CadCraftIntegrationContent.js' },
          itwin: { cls: 'CadITwinParityContent', file: 'HomeSetup/js/CadITwinParityContent.js' },
          interview: { cls: 'CadVisionInterviewContent', file: 'HomeSetup/js/CadVisionInterviewContent.js' }
        };

        let itemNumber = 1;

        for (const [key, notes] of Object.entries(grouped)) {
          const [pageId, blockId] = key.split(':');
          const isComponent = Boolean(componentClassMap[blockId] || blockId.startsWith('comp_'));
          const isUniversal = Boolean(notes[0]?.isUniversalElement || notes[0]?.xpath);

          let targetCls = '';
          let targetFile = '';
          let targetDesc = '';
          let previewText = '';

          if (isComponent && componentClassMap[blockId]) {
            targetCls = componentClassMap[blockId].cls;
            targetFile = componentClassMap[blockId].file;
            targetDesc = componentClassMap[blockId].desc;
          } else {
            const mapping = pageClassMap[pageId] || {
              cls: pageId.charAt(0).toUpperCase() + pageId.slice(1) + 'Content',
              file: `${dossierId}/js/${pageId.charAt(0).toUpperCase() + pageId.slice(1)}Content.js`
            };
            targetCls = mapping.cls;
            targetFile = mapping.file;

            const docCls = globalThis[targetCls];
            if (docCls && typeof docCls[blockId] === 'function') {
              const val = docCls[blockId]();
              previewText = Array.isArray(val) ? val.join('\n\n') : String(val);
            }
          }

          if (!previewText && notes[0]?.blockPreview) {
            previewText = notes[0].blockPreview;
          }

          out += `## ${itemNumber++}. Target: \`${targetCls}${isComponent ? '' : '.' + blockId}\`\n`;
          out += `**Target File:** \`${targetFile}\`\n`;
          if (targetDesc) out += `**Component Role:** *${targetDesc}*\n`;

          if (isUniversal && notes[0]?.xpath) {
            out += `**DOM XPath Locator:** \`${notes[0].xpath}\`\n`;
            if (notes[0].cssPath) out += `**CSS Selector:** \`${notes[0].cssPath}\`\n`;
          }
          out += '\n';

          if (previewText) {
            out += '### Context / Code Excerpt:\n';
            out += '> ' + previewText.replace(/\n+/g, '\n> ') + '\n\n';
          }

          out += '### Author Directives & Living Annotations:\n';
          notes.sort((a, b) => a.timestamp - b.timestamp).forEach((note, idx) => {
            const timeStr = new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const cleanTag = note.status === 'pending_cleanup' ? ' `[🧹 MARKED FOR ARCHIVE]`' : '';
            out += `${idx + 1}. **(${timeStr})${cleanTag}:** ${note.text}\n`;
            if (note.videoLink) {
              out += `   - 📹 *Video Anchor:* \`${note.videoLink.videoId}\` @ **${note.videoLink.time}s** (${note.videoLink.label || 'Timestamp'})\n`;
            }
          });
          out += '\n';

          out += '### Expected Implementation Output Container:\n';
          out += '<' + `script data-file="${targetFile}" data-method="${targetCls}.${isComponent ? 'render' : blockId}" data-action="patch">\n`;
          out += `// Updated implementation incorporating author directives...\n`;
          out += '<' + '/script>\n\n';
          out += '---\n\n';
        }

        return out.trim();
      }
  static async openPromptBuilderDialog(docReader = null) {
      const hostContainer = document.body;
      const promptText = await this.buildNotesDirectivePrompt(docReader);
      const dossierId = docReader?.options?.dossierId || docReader?.brandTitle || 'HomeSetup';
      const allNotes = await this.getAllNotes(dossierId);
      const activeNotes = allNotes.filter(n => n.status !== 'resolved');

      const wrap = makeElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          height: '100%',
          color: '#e2e8f0',
          fontFamily: 'var(--dr-font-sans, system-ui, sans-serif)'
        }
      });

      const topBar = makeElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 4px',
          borderBottom: '1px solid #232d3f',
          fontSize: '11.5px',
          fontFamily: 'monospace'
        }
      }, [
        makeElement('span', { style: { color: '#00f2fe', fontWeight: 'bold' } }, `⚡ Active Living Directives [${dossierId}]: ${activeNotes.length}`),
        makeElement('span', { style: { color: '#10b981' } }, 'Connected to Luno Outbox')
      ]);
      wrap.appendChild(topBar);

      const desc = makeElement('div', {
        style: {
          fontSize: '11px',
          color: '#94a3b8',
          lineHeight: '1.4',
          background: 'rgba(0, 242, 254, 0.05)',
          padding: '8px 12px',
          borderRadius: '6px',
          border: '1px solid rgba(0, 242, 254, 0.2)'
        }
      }, 'Packages all notes, universal element XPath locators, and code contexts into a compilable payload. Dispatches directly to Luno Outbox, saves to disk via Node.js server save, or copies to clipboard.');
      wrap.appendChild(desc);

      const codeArea = makeElement('textarea', {
        style: {
          flex: 1,
          minHeight: '320px',
          background: '#090d16',
          color: '#7ee787',
          border: '1.5px solid #232d3f',
          borderRadius: '8px',
          padding: '12px',
          fontFamily: 'var(--dr-font-mono, monospace)',
          fontSize: '12px',
          lineHeight: '1.5',
          resize: 'vertical',
          outline: 'none',
          whiteSpace: 'pre'
        },
        readonly: true,
        spellcheck: false
      });
      codeArea.value = promptText;
      wrap.appendChild(codeArea);

      const footer = makeElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '8px',
          borderTop: '1px solid #232d3f',
          gap: '8px',
          flexWrap: 'wrap'
        }
      });

      const leftButtons = makeElement('div', { style: { display: 'flex', gap: '8px' } }, [
        makeElement('button', {
          className: 'dr-nav-btn',
          style: { color: '#f59e0b', borderColor: '#f59e0b66', fontSize: '11px' },
          onclick: async () => {
            if (confirm(`Archive/mark all ${activeNotes.length} active notes in [${dossierId}] as incorporated?`)) {
              for (const n of activeNotes) {
                await CadPlanItemNotes.updateNote(n.id, { status: 'resolved' });
              }
              alert(`✓ Directives for [${dossierId}] archived.`);
              dlg.close();
              if (docReader && typeof docReader._updateBlockNoteBadges === 'function') {
                docReader._updateBlockNoteBadges();
              }
            }
          }
        }, '🧹 Mark Incorporated')
      ]);

      const rightButtons = makeElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
        // 1. Push to Real Luno Outbox
        makeElement('button', {
          className: 'dr-nav-btn',
          style: { background: '#271052', color: '#d2a8ff', borderColor: '#8257e5', fontSize: '11px', fontWeight: 'bold' },
          onclick: () => {
            const res = CadPlanItemNotes.dispatchToOutbox(`${dossierId} Living Spec Directives`, promptText);
            if (res.channel === 'clipboard-fallback') {
              alert('✓ Copied evolution prompt to clipboard (OutboxQueue not mounted in parent).');
            } else {
              alert(`✓ Dispatched evolution prompt directly to Luno Outbox via [${res.channel}]!`);
            }
            dlg.close();
          }
        }, '📤 Push to Outbox'),

        // 2. Direct In-Page / Server Save
        makeElement('button', {
          className: 'dr-nav-btn',
          style: { background: '#0a233a', color: '#38bdf8', borderColor: '#0284c7', fontSize: '11px' },
          onclick: async () => {
            const dumpPath = `PromptDumps/${dossierId}_EvolutionDirectives.md`;
            let savedSuccessfully = false;

            try {
              const res = await fetch(`/api/save?project=${encodeURIComponent(dossierId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  files: [{ path: dumpPath, content: promptText }]
                })
              });
              const data = await res.json();
              if (data && data.success) savedSuccessfully = true;
            } catch (e) {}

            if (savedSuccessfully) {
              alert(`✓ Written directly to local disk at ${dumpPath}!`);
              dlg.close();
            } else {
              const blob = new Blob([promptText], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = makeElement('a', { href: url, download: `${dossierId}_Directives_${Date.now()}.md` });
              a.click();
              URL.revokeObjectURL(url);
              dlg.close();
            }
          }
        }, '⚡ Save to Disk'),

        // 3. Copy to Clipboard
        makeElement('button', {
          className: 'dr-nav-btn primary',
          style: { fontWeight: 'bold' },
          onclick: (e) => {
            const btn = e.currentTarget;
            navigator.clipboard.writeText(promptText).then(() => {
              btn.textContent = '✓ Copied!';
              setTimeout(() => { btn.textContent = '📋 Copy Evolution Prompt'; }, 1800);
            });
          }
        }, '📋 Copy Prompt')
      ]);

      footer.appendChild(leftButtons);
      footer.appendChild(rightButtons);
      wrap.appendChild(footer);

      const dlg = UITools.makeDialog({
        title: `⚡ Living Specification Evolution Deck [${dossierId}]`,
        size: [660, 580],
        position: [Math.max(20, (window.innerWidth - 660) / 2), 50],
        contentElement: wrap,
        appendTo: hostContainer
      });

      return dlg;
    }

  static async openBlockNotesDialog(pageId, blockId, currentDoc, onUpdated, hostReader = null, extraOptions = {}) {
        if (typeof CommentsItemNotes !== 'undefined' && typeof CommentsItemNotes.openBlockNotesDialog === 'function') {
          return CommentsItemNotes.openBlockNotesDialog(pageId, blockId, currentDoc, onUpdated, hostReader, extraOptions);
        }

        this._injectNoteStudioStyles();

        const dossierId = extraOptions.dossierId || hostReader?.options?.dossierId || 'HomeSetup';
        const notes = await this.getNotesForBlock(pageId, blockId, dossierId);
        const activeNotes = notes.filter(n => n.status !== 'resolved');
        const testReadyNote = notes.find(n => n.status === 'test_ready');
        const hostContainer = document.body;

        // Master Studio Container
        const wrap = makeElement('div', {
          className: 'dr-note-studio-wrap',
          style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            boxSizing: 'border-box',
            gap: '10px',
            fontFamily: 'var(--dr-font-sans, system-ui, sans-serif)',
            color: '#f8fafc',
            overflow: 'hidden'
          }
        });

        // 1. Sleek Header Ribbon with Target Locator
        const targetLabel = extraOptions.locator?.tagName 
          ? `<${extraOptions.locator.tagName}#${blockId}>` 
          : `${pageId} / ${blockId}`;

        const headerRibbon = makeElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '8px',
            borderBottom: '1px solid rgba(0, 242, 254, 0.2)',
            fontSize: '11px',
            fontFamily: 'var(--dr-font-mono, monospace)',
            flexShrink: 0
          }
        }, [
          makeElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
            makeElement('span', { style: { color: '#00f2fe', fontWeight: 'bold' } }, `🎯 PIN: ${targetLabel}`),
            activeNotes.length > 0 
              ? makeElement('span', { className: 'dr-note-count-pill' }, `${activeNotes.length} active`) 
              : makeElement('span', { style: { color: '#64748b' } }, '● Fresh Directive')
          ]),
          makeElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
            makeElement('span', { style: { color: '#94a3b8', fontSize: '10px' } }, 'Voice-First Studio')
          ])
        ]);
        wrap.appendChild(headerRibbon);

        // 2. Interactive Test Directive Banner (If LLM handed off a test task)
        if (testReadyNote) {
          const testCard = makeElement('div', {
            className: 'dr-test-directive-banner',
            style: {
              background: 'rgba(192, 132, 252, 0.12)',
              border: '1.5px solid #c084fc',
              boxShadow: '0 0 20px rgba(192, 132, 252, 0.25)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexShrink: 0
            }
          }, [
            makeElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 } }, [
              makeElement('strong', { style: { color: '#d2a8ff', fontSize: '11px', fontFamily: 'monospace' } }, '🧪 LLM TEST DIRECTIVE READY:'),
              makeElement('div', { style: { color: '#f1f5f9', fontSize: '12px', lineHeight: '1.4' } }, testReadyNote.testInstructions || testReadyNote.text)
            ]),
            makeElement('button', {
              className: 'dr-nav-btn primary',
              style: {
                background: '#238636', borderColor: '#2ea043', color: '#fff',
                padding: '6px 14px', fontSize: '11.5px', fontWeight: 'bold', flexShrink: 0
              },
              onclick: async () => {
                CadPlanItemNotes.playHapticChime('verify');
                await CadPlanItemNotes.updateNote(testReadyNote.id, {
                  status: 'resolved',
                  verifiedTimestamp: Date.now()
                });
                if (typeof OutboxQueue !== 'undefined' && OutboxQueue.addItem) {
                  OutboxQueue.addItem(`Verified: ${blockId}`, `✓ Verified fix for [${targetLabel}]: ${testReadyNote.testInstructions || testReadyNote.text}`);
                }
                dlg.close();
                if (onUpdated) onUpdated();
              }
            }, '✓ Verified — Got It!')
          ]);
          wrap.appendChild(testCard);
        }

        // 3. Compact Previous Directives Drawer (Non-intrusive, expandable)
        if (activeNotes.length > 0) {
          const historyDetails = makeElement('details', {
            style: {
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              color: '#cbd5e1',
              flexShrink: 0
            }
          });
          const summary = makeElement('summary', {
            style: { cursor: 'pointer', outline: 'none', color: '#38bdf8', fontWeight: 'bold' }
          }, `📜 View ${activeNotes.length} Existing Note${activeNotes.length === 1 ? '' : 's'} on this Block`);

          const historyList = makeElement('div', {
            style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px', maxHeight: '110px', overflowY: 'auto' }
          });

          activeNotes.forEach(n => {
            const item = makeElement('div', {
              style: {
                padding: '4px 8px', background: 'rgba(0,0,0,0.3)', borderLeft: '3px solid #00f2fe',
                borderRadius: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }
            }, [
              makeElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, n.text),
              makeElement('button', {
                style: { background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '10px' },
                onclick: async () => {
                  await CadPlanItemNotes.updateNote(n.id, { status: 'resolved' });
                  CadPlanItemNotes.playHapticChime('commit');
                  dlg.close();
                  CadPlanItemNotes.openBlockNotesDialog(pageId, blockId, currentDoc, onUpdated, hostReader, extraOptions);
                  if (onUpdated) onUpdated();
                }
              }, '✓ Resolve')
            ]);
            historyList.appendChild(item);
          });

          historyDetails.appendChild(summary);
          historyDetails.appendChild(historyList);
          wrap.appendChild(historyDetails);
        }

        // 4. THE DOMINANT DICTATION CANVAS (Takes 70%+ of vertical real estate)
        const studioCanvas = makeElement('div', {
          className: 'dr-dictation-studio-canvas',
          style: {
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(4, 7, 14, 0.95)',
            border: '1.5px solid rgba(0, 242, 254, 0.3)',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.8), 0 0 15px rgba(0, 242, 254, 0.08)'
          }
        });

        // Waveform Status Ribbon
        const waveRibbon = makeElement('div', {
          className: 'dr-waveform-ribbon',
          style: {
            padding: '6px 14px',
            background: 'rgba(15, 23, 42, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }
        }, [
          waveStatusText = makeElement('span', {
            style: { fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', fontFamily: 'monospace' }
          }, '🎙️ Click "Start Listening" to dictate or type below...'),
          waveBars = makeElement('div', { className: 'dr-audio-wave-bars' }, [
            makeElement('span', { className: 'dr-wave-bar' }),
            makeElement('span', { className: 'dr-wave-bar' }),
            makeElement('span', { className: 'dr-wave-bar' }),
            makeElement('span', { className: 'dr-wave-bar' })
          ])
        ]);
        studioCanvas.appendChild(waveRibbon);

        let waveStatusText, waveBars;

        // Embedded Super-Dictation Engine
        let dictation = null;
        let textInputArea = null;

        if (typeof DictationWidget !== 'undefined') {
          dictation = new DictationWidget({
            compact: true,
            placeholder: 'Speak freely or type your specification directive here...'
          });

          // Tweak internal layout to maximize viewport
          const dEl = dictation.getElement();
          dEl.style.flex = '1';
          dEl.style.display = 'flex';
          dEl.style.flexDirection = 'column';
          dEl.style.border = 'none';
          dEl.style.borderRadius = '0';
          dEl.style.background = 'transparent';

          const dEditor = dEl.querySelector('.dictation-editor-content');
          if (dEditor) {
            dEditor.style.fontSize = '15px';
            dEditor.style.lineHeight = '1.7';
            dEditor.style.padding = '18px';
            dEditor.style.color = '#f8fafc';
            dEditor.style.minHeight = '220px';
          }

          // Hook Waveform visualizer to dictation listening state
          const origToggle = dictation.toggleListening.bind(dictation);
          dictation.toggleListening = () => {
            origToggle();
            const active = dictation.isListening;
            waveBars.classList.toggle('active', active);
            waveStatusText.textContent = active ? '🔴 Listening actively... (speak now)' : '🔇 Mic idle. Click to dictate.';
            waveStatusText.style.color = active ? '#00f2fe' : '#94a3b8';
            CadPlanItemNotes.playHapticChime(active ? 'mic-on' : 'mic-off');
          };

          studioCanvas.appendChild(dEl);
        } else {
          textInputArea = makeElement('textarea', {
            placeholder: 'Type your directive or spec refinement here...',
            style: {
              flex: '1', width: '100%', minHeight: '220px', background: 'transparent',
              color: '#f8fafc', border: 'none', padding: '18px', fontSize: '15px',
              lineHeight: '1.7', fontFamily: 'var(--dr-font-sans, sans-serif)', outline: 'none', resize: 'none'
            }
          });
          studioCanvas.appendChild(textInputArea);
        }

        wrap.appendChild(studioCanvas);

        // 5. High-Impact Action Bar
        const actionFooter = makeElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '6px',
            borderTop: '1px solid rgba(0, 242, 254, 0.15)',
            flexShrink: 0,
            gap: '10px'
          }
        }, [
          makeElement('button', {
            className: 'dr-nav-btn',
            style: { padding: '8px 14px', fontSize: '11px', color: '#94a3b8' },
            onclick: () => {
              if (dictation) dictation.clearContent();
              if (textInputArea) textInputArea.value = '';
            }
          }, 'Clear'),

          makeElement('button', {
            className: 'dr-nav-btn primary dr-commit-directive-btn',
            style: {
              padding: '9px 24px',
              fontSize: '12px',
              fontWeight: '800',
              letterSpacing: '0.04em',
              background: 'linear-gradient(135deg, #0284c7 0%, #00f2fe 100%)',
              color: '#070a13',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(0, 242, 254, 0.4)'
            },
            onclick: async (e) => {
              const btn = e.currentTarget;
              const val = dictation ? dictation.getText() : textInputArea?.value?.trim();
              if (!val) return;

              // 1. Play futuristic glass chime & fire button animation
              CadPlanItemNotes.playHapticChime('commit');
              btn.classList.add('dr-btn-commit-flash');
              btn.textContent = '✓ Pinned & Staged!';

              // 2. Commit to persistent ledger
              await CadPlanItemNotes.addNote(pageId, blockId, val, {
                dossierId,
                author: 'Rob Brown',
                xpath: extraOptions.locator?.xpath || null,
                cssPath: extraOptions.locator?.cssPath || null,
                tagName: extraOptions.locator?.tagName || null
              });

              // 3. Trigger physical ripple effect on target DOM element on page
              if (extraOptions.targetElement) {
                extraOptions.targetElement.classList.remove('dr-pulse-highlight');
                void extraOptions.targetElement.offsetWidth;
                extraOptions.targetElement.classList.add('dr-pulse-highlight');
              }

              // 4. Smooth fade out and notify
              setTimeout(() => {
                if (dictation) dictation.clearContent();
                dlg.close();
                if (onUpdated) onUpdated();
              }, 350);
            }
          }, '⚡ Commit & Pin Directive')
        ]);
        wrap.appendChild(actionFooter);

        // Open High-Contrast Dialog with Layered Pop-Out Depth
        const dlg = UITools.makeDialog({
          title: `🏛️ Directives Studio • ${blockId}`,
          size: [640, 580],
          position: [Math.max(20, (window.innerWidth - 640) / 2), 50],
          contentElement: wrap,
          appendTo: hostContainer,
          onClose: () => {
            if (dictation) dictation.stopListening();
          }
        });

        // Apply Layered Contrast Styling on outer dialog shell
        if (dlg && dlg.element) {
          dlg.element.style.background = '#080d1a';
          dlg.element.style.border = '1.5px solid #00f2fe';
          dlg.element.style.borderRadius = '14px';
          dlg.element.style.boxShadow = '0 28px 75px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(0, 242, 254, 0.35), 0 0 40px rgba(0, 242, 254, 0.2)';
          dlg.element.style.backdropFilter = 'blur(20px)';
        }

        return dlg;
    }
  static async addAIProposal(pageId, blockId, proposalText, options = {}) {
    return await this.addNote(pageId, blockId, proposalText, {
      ...options,
      author: 'LLM',
      isLLM: true,
      type: options.type || 'proposal',
      status: 'active'
    });
  }

  static async compactDossier(dossierId, options = {}) {
    const all = await this.getAllNotes(dossierId);
    const active = all.filter(n => n.status !== 'resolved');
    if (active.length === 0) {
      return { success: true, count: 0, message: 'No active notes or proposals to compact.' };
    }

    // 1. Generate consolidated surgical method patch bundle
    const patchBundle = await this.buildNotesDirectivePrompt({ options: { dossierId } });

    // 2. If direct server write is requested/available, write to local file
    let wroteToDisk = false;
    if (!options.dryRun) {
      try {
        const dumpPath = `PromptDumps/${dossierId}_CompactedBundle.md`;
        const res = await fetch(`/api/save?project=${encodeURIComponent(dossierId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: [{ path: dumpPath, content: patchBundle }]
          })
        });
        const data = await res.json();
        if (data && data.success) {
          wroteToDisk = true;
        }
      } catch (e) {}

      // 3. Mark compacted notes as resolved in IndexedDB
      for (const note of active) {
        await this.updateNote(note.id, { 
          status: 'resolved', 
          compactedTimestamp: Date.now() 
        });
      }
    }

    this._notify();
    return {
      success: true,
      compactedCount: active.length,
      wroteToDisk,
      patchBundle
    };
  }

  static createNoteTrigger(pageId, blockId, componentName = '', label = '📝 Note') {
      const btn = document.createElement('button');
      btn.className = 'dr-nav-btn';
      btn.style.cssText = 'padding: 3px 8px; font-size: 10px; font-weight: bold; font-family: monospace; color: #38bdf8; border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.08); border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;';
      btn.title = `Add a note to ${componentName || blockId}`;
      btn.innerHTML = `<span>${label}</span>`;

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const docCls = globalThis[componentName] || { name: componentName || blockId };
        CadPlanItemNotes.openBlockNotesDialog(pageId, blockId, docCls, () => {
          CadPlanItemNotes._notify();
        });
      };

      return btn;
    }

  static _drawTetherToBlock(dialogElement, targetElement) {
      if (globalThis._cadPlanInstance?.aardvark) {
        return globalThis._cadPlanInstance.aardvark._drawOuterCornerConnectors(targetElement, dialogElement);
      }
      return () => {};
    }

  static playHapticSound(type = 'click') {
    // Obnoxious navigation clicks permanently silenced per user directive
    return;
  }
  static generateElementLocator(element) {
      if (!element || !(element instanceof Element)) {
        return { key: 'unknown', xpath: '', cssPath: '', textSnippet: '', isOfficial: false };
      }

      // 1. Check for official data-block or ID
      const explicitId = element.getAttribute('data-block') ||
                         element.getAttribute('data-block-id') ||
                         element.getAttribute('data-id') ||
                         (element.id && !element.id.startsWith('uw') && !element.id.startsWith('comp-') ? element.id : null);

      // 2. Compute full XPath from body
      const getXPath = (el) => {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
        if (el === document.body) return '/html/body';
        let index = 1;
        let sibling = el.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === el.tagName) index++;
          sibling = sibling.previousElementSibling;
        }
        return `${getXPath(el.parentElement)}/${el.tagName.toLowerCase()}[${index}]`;
      };

      // 3. Compute CSS selector path
      const getCssPath = (el) => {
        if (!el || el === document.body) return 'body';
        const tag = el.tagName.toLowerCase();
        let selector = tag;
        if (el.id && !el.id.startsWith('uw')) {
          selector += `#${el.id}`;
          return selector;
        }
        if (el.className && typeof el.className === 'string') {
          const firstClass = el.className.trim().split(/\s+/).filter(c => !c.startsWith('block-') && !c.startsWith('has-'))[0];
          if (firstClass) selector += `.${firstClass}`;
        }
        return `${getCssPath(el.parentElement)} > ${selector}`;
      };

      const xpath = getXPath(element);
      const cssPath = getCssPath(element);
      const textSnippet = (element.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 100);

      // Compute simple 32-bit hash of XPath for compact addressing
      let hash = 0;
      for (let i = 0; i < xpath.length; i++) {
        hash = ((hash << 5) - hash) + xpath.charCodeAt(i);
        hash |= 0;
      }
      const cleanHash = Math.abs(hash).toString(36);

      const key = explicitId ? explicitId : `elem_${element.tagName.toLowerCase()}_${cleanHash}`;

      return {
        key,
        isOfficial: Boolean(explicitId),
        xpath,
        cssPath,
        tagName: element.tagName.toLowerCase(),
        textSnippet,
        nearestContainer: explicitId || element.closest('[data-block], [data-block-id], section, article')?.tagName?.toLowerCase() || 'body'
      };
    }

  static dispatchToOutbox(title, payloadText, options = {}) {
      const text = payloadText || '';
      const bundleTitle = title || 'HomeSetup Living Directives';

      // 1. Direct In-Memory Luno OutboxQueue
      if (typeof globalThis.OutboxQueue !== 'undefined' && typeof globalThis.OutboxQueue.addBundle === 'function') {
        globalThis.OutboxQueue.addBundle(bundleTitle, text, { priority: 'high', ...options });
        return { success: true, channel: 'in-memory-outbox' };
      }

      // 2. Parent Window Outbox (when embedded in Luno preview iframe)
      try {
        if (window.parent && window.parent !== window && window.parent.OutboxQueue && typeof window.parent.OutboxQueue.addBundle === 'function') {
          window.parent.OutboxQueue.addBundle(bundleTitle, text, { priority: 'high', ...options });
          return { success: true, channel: 'parent-outbox' };
        }
      } catch (e) {}

      // 3. Opener Window Outbox (when popped out in standalone window)
      try {
        if (window.opener && window.opener.OutboxQueue && typeof window.opener.OutboxQueue.addBundle === 'function') {
          window.opener.OutboxQueue.addBundle(bundleTitle, text, { priority: 'high', ...options });
          return { success: true, channel: 'opener-outbox' };
        }
      } catch (e) {}

      // 4. Cross-Domain postMessage to Luno Host
      try {
        const msg = {
          type: 'LUNO_ADD_OUTBOX_BUNDLE',
          title: bundleTitle,
          payload: text,
          priority: 'high'
        };
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, '*');
        }
        if (window.opener) {
          window.opener.postMessage(msg, '*');
        }
      } catch (e) {}

      // 5. Fallback to System Clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return { success: true, channel: 'clipboard-fallback' };
      }

      return { success: false, channel: 'none' };
    }

  static async getNotesForElement(element, pageId = 'meta', dossierId = 'HomeSetup') {
      if (!element) return [];
      const loc = this.generateElementLocator(element);
      const all = await this.getAllNotes(dossierId);

      return all.filter(n => {
        if (n.dossierId && n.dossierId !== dossierId) return false;
        // Match by explicit key
        if (n.blockKey === `${pageId}:${loc.key}`) return true;
        // Match by exact XPath if present
        if (loc.xpath && n.xpath && n.xpath === loc.xpath) return true;
        // Match by CSS path
        if (loc.cssPath && n.cssPath && n.cssPath === loc.cssPath) return true;
        return false;
      });
    }

  static async resolveNotesFromLlmPayload(rawPayloadText) {
        if (!rawPayloadText || typeof rawPayloadText !== 'string') return [];

        const resolvedIds = new Set();
        const testUpdates = [];

        // 1. Full Resolution Tags: <script data-action="resolve-notes" data-notes="note_1,note_2">
        const resolveRegex = /<(?:script|template)[^>]*?data-action=["'](?:resolve|resolve-notes)["'][^>]*?data-notes=["']([^"']+)["'][^>]*>/gi;
        let match;
        while ((match = resolveRegex.exec(rawPayloadText)) !== null) {
          match[1].split(/[\s,]+/).forEach(id => {
            if (id.trim()) resolvedIds.add(id.trim());
          });
        }

        // 2. Full Resolution HTML Comments: <!-- RESOLVE_NOTE: note_1 --> or <!-- RESOLVED_NOTES: note_1, note_2 -->
        const commentRegex = /<!--\s*RESOLVE(?:D)?_NOTES?:\s*([^->]+)-->/gi;
        while ((match = commentRegex.exec(rawPayloadText)) !== null) {
          match[1].split(/[\s,]+/).forEach(id => {
            if (id.trim()) resolvedIds.add(id.trim());
          });
        }

        // 3. Interactive Test Directive: <script data-action="test-note" data-id="note_123">Instructions...</script>
        const testNoteRegex = /<script[^>]*?data-action=["']test-note["'][^>]*?data-id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/script>/gi;
        while ((match = testNoteRegex.exec(rawPayloadText)) !== null) {
          testUpdates.push({
            id: match[1].trim(),
            instructions: match[2].trim()
          });
        }

        // Process Full Resolutions
        for (const id of resolvedIds) {
          await CadPlanItemNotes.updateNote(id, {
            status: 'resolved',
            resolvedTimestamp: Date.now(),
            resolutionSource: 'llm-patch-applied'
          });
        }

        // Process Test Directives
        for (const item of testUpdates) {
          await CadPlanItemNotes.updateNote(item.id, {
            status: 'test_ready',
            testInstructions: item.instructions,
            updatedTimestamp: Date.now()
          });
        }

        if (resolvedIds.size > 0 || testUpdates.length > 0) {
          // Trigger live document UI refresh
          if (globalThis._cadPlanInstance?.reader) {
            globalThis._cadPlanInstance.reader._updateBlockNoteBadges();
            globalThis._cadPlanInstance.reader._populateSidePanelNotes();
          }
          if (globalThis._cadPlanInstance?.aardvark) {
            globalThis._cadPlanInstance.aardvark._highlightAnnotatedElements();
          }
        }

        return {
          resolved: Array.from(resolvedIds),
          testReady: testUpdates.map(t => t.id)
        };
      }
  static generateSingleNotePrompt(note) {
      if (!note) return '';

      const [pageId, blockId] = (note.blockKey || `${note.pageId}:${note.blockId}`).split(':');
      const dossierId = note.dossierId || 'HomeSetup';

      let targetCls = `${pageId.charAt(0).toUpperCase() + pageId.slice(1)}Content`;
      let targetFile = `${dossierId}/js/${targetCls}.js`;

      if (globalThis[targetCls] && typeof globalThis[targetCls][blockId] === 'function') {
        // Confirmed method on content class
      } else if (blockId.startsWith('comp_')) {
        targetFile = `HomeSetup/content/${pageId}.html`;
      }

      let p = `# 🎯 LIVING SPEC DIRECTIVE: SURGICAL CODE MUTATION\n`;
      p += `**Dossier:** ${dossierId} • **Target Method/Block:** \`${targetCls}.${blockId}\`\n`;
      p += `**Target File:** \`${targetFile}\`\n`;
      if (note.xpath) p += `**DOM XPath:** \`${note.xpath}\`\n`;
      p += `\n---\n\n`;

      if (note.blockPreview) {
        p += `### Context Excerpt:\n> ${note.blockPreview.replace(/\n+/g, '\n> ')}\n\n`;
      }

      p += `### Author / Inventor Directive:\n"${note.text}"\n\n`;
      p += `### Execution Mandate:\n`;
      p += `Return the surgical method patch wrapped in a single markdown code fence so Luno can compile it instantly:\n\n`;
      p += `<` + `script data-file="${targetFile}" data-method="${targetCls}.${blockId}" data-action="patch">\n`;
      p += `// Complete updated implementation reflecting author directive...\n`;
      p += `<` + `/script>\n`;

      return p;
    }

  static async syncWithFleetLedger() {
      try {
        // 1. Fetch remote ledger from Port 8080 server
        const res = await fetch('/api/notes/sync', { method: 'GET' });
        if (!res.ok) return;
        const remoteNotes = await res.json();
        if (!Array.isArray(remoteNotes)) return;

        // 2. Merge with local storage
        const map = this.getLocalMap();
        let changed = false;

        remoteNotes.forEach(rn => {
          const key = rn.key || `${rn.dossierId}:${rn.pageId}:${rn.blockId}`;
          map[key] = map[key] || [];
          const existingIdx = map[key].findIndex(n => n.id === rn.id);
          if (existingIdx === -1) {
            map[key].push(rn);
            changed = true;
          } else if ((rn.updatedTimestamp || 0) > (map[key][existingIdx].updatedTimestamp || 0)) {
            map[key][existingIdx] = rn;
            changed = true;
          }
        });

        if (changed) {
          this.saveLocalMap(map);
          this._notify();
        }
      } catch (e) {
        // Running offline or outside local node server; keep local copy
      }
    }

    static async pushFleetLedgerUpdate(entry) {
      try {
        await fetch('/api/notes/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
      } catch (e) {}
    }
    static async pushFleetLedgerUpdate(entry) {
      try {
        await fetch('/api/notes/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
      } catch (e) {}
    }

  static renderNoteCard(note, onRefresh, dialogInstance) {
      const isTestReady = note.status === 'test_ready';
      const isResolved = note.status === 'resolved';

      const card = makeElement('div', {
        style: {
          background: isTestReady 
            ? 'rgba(192, 132, 252, 0.08)' 
            : (isResolved ? 'rgba(255,255,255,0.02)' : 'rgba(0, 242, 254, 0.05)'),
          borderLeft: `4px solid ${isTestReady ? '#c084fc' : (isResolved ? '#64748b' : '#00f2fe')}`,
          border: isTestReady ? '1.5px solid rgba(192, 132, 252, 0.4)' : '1px solid #1e293b',
          borderRadius: '6px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }
      });

      // Top status line
      const header = makeElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px' }
      }, [
        makeElement('span', {
          style: {
            color: isTestReady ? '#c084fc' : '#38bdf8',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }
        }, isTestReady ? '🧪 LLM: Ready for Testing' : (note.author || 'Author')),
        makeElement('span', { style: { color: '#64748b' } }, new Date(note.timestamp).toLocaleTimeString())
      ]);
      card.appendChild(header);

      // Note body / Author original thought
      const textBody = makeElement('div', {
        style: {
          color: isResolved ? '#64748b' : '#f8fafc',
          textDecoration: isResolved ? 'line-through' : 'none',
          lineHeight: '1.45',
          fontSize: '11.5px'
        }
      }, note.text);
      card.appendChild(textBody);

      // If in Test-Ready state, display the LLM's test guidance and the verification button
      if (isTestReady && note.testInstructions) {
        const testBox = makeElement('div', {
          style: {
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px dashed #c084fc',
            borderRadius: '6px',
            padding: '8px 10px',
            marginTop: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }
        }, [
          makeElement('strong', { style: { color: '#d2a8ff', fontSize: '10.5px' } }, '📋 How to test this fix:'),
          makeElement('div', { style: { color: '#cbd5e1', fontSize: '11px', lineHeight: '1.4' } }, note.testInstructions)
        ]);
        card.appendChild(testBox);
      }

      // Action buttons footer
      const actions = makeElement('div', {
        style: { display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }
      });

      if (isTestReady) {
        // THE "VERIFIED / GOT IT" BUTTON
        const verifyBtn = makeElement('button', {
          className: 'dr-nav-btn primary',
          style: {
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 'bold',
            background: '#238636',
            borderColor: '#2ea043',
            color: '#fff'
          },
          onclick: async () => {
            // 1. Mark resolved
            await CadPlanItemNotes.updateNote(note.id, {
              status: 'resolved',
              verifiedTimestamp: Date.now()
            });

            // 2. Queue acknowledgment to Outbox
            const outboxFeedback = `✓ Verified fix for [${note.pageId}/${note.blockId}]: ${note.testInstructions || note.text}`;
            if (typeof OutboxQueue !== 'undefined' && OutboxQueue.addItem) {
              OutboxQueue.addItem(`Verification: ${note.blockId}`, outboxFeedback, { priority: 'low' });
            }

            if (dialogInstance) dialogInstance.close();
            if (onRefresh) onRefresh();
          }
        }, '✓ Verified — Got It!');
        actions.appendChild(verifyBtn);
      } else {
        const resolveBtn = makeElement('button', {
          className: 'dr-nav-btn',
          style: { padding: '2px 8px', fontSize: '10px', color: isResolved ? '#10b981' : '#f59e0b' },
          onclick: async () => {
            await CadPlanItemNotes.updateNote(note.id, { status: isResolved ? 'active' : 'resolved' });
            if (dialogInstance) dialogInstance.close();
            if (onRefresh) onRefresh();
          }
        }, isResolved ? '↺ Reopen' : '✓ Resolve');
        actions.appendChild(resolveBtn);
      }

      const deleteBtn = makeElement('button', {
        className: 'dr-nav-btn',
        style: { padding: '2px 8px', fontSize: '10px', color: '#ef4444' },
        onclick: async () => {
          if (confirm('Delete this directive?')) {
            await CadPlanItemNotes.deleteNote(note.id);
            if (dialogInstance) dialogInstance.close();
            if (onRefresh) onRefresh();
          }
        }
      }, '✕');
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      return card;
    }

  static _injectNoteStudioStyles() {
      if (document.getElementById('cadplan-studio-styles')) return;

      const css = `
        /* Studio Canvas Styles */
        .dr-note-studio-wrap {
          animation: dr-studio-scale-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes dr-studio-scale-in {
          0% { transform: scale(0.97); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        /* Audio Waveform Equalizer Bars */
        .dr-audio-wave-bars {
          display: flex;
          align-items: center;
          gap: 3px;
          height: 14px;
        }
        .dr-wave-bar {
          width: 3px;
          height: 4px;
          background: #334155;
          border-radius: 2px;
          transition: height 0.15s ease, background 0.15s ease;
        }
        .dr-audio-wave-bars.active .dr-wave-bar {
          background: #00f2fe;
          animation: dr-wave-bounce 0.6s ease-in-out infinite alternate;
        }
        .dr-audio-wave-bars.active .dr-wave-bar:nth-child(2) { animation-delay: 0.15s; }
        .dr-audio-wave-bars.active .dr-wave-bar:nth-child(3) { animation-delay: 0.3s; }
        .dr-audio-wave-bars.active .dr-wave-bar:nth-child(4) { animation-delay: 0.45s; }

        @keyframes dr-wave-bounce {
          0% { height: 4px; }
          100% { height: 14px; }
        }

        /* Button Commit Flash */
        .dr-btn-commit-flash {
          animation: dr-commit-glow 0.35s ease-out forwards;
        }
        @keyframes dr-commit-glow {
          0% { box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.8); transform: scale(0.98); }
          50% { box-shadow: 0 0 25px 6px rgba(0, 242, 254, 0.6); transform: scale(1.02); }
          100% { box-shadow: 0 0 10px 2px rgba(0, 242, 254, 0.3); transform: scale(1); }
        }

        .dr-note-count-pill {
          background: rgba(0, 242, 254, 0.15);
          border: 1px solid #00f2fe;
          color: #00f2fe;
          font-family: monospace;
          font-size: 10px;
          font-weight: bold;
          padding: 1px 7px;
          border-radius: 10px;
        }
      `;

      if (typeof applyCss === 'function') {
        applyCss(css, 'cadplan-studio-styles');
      } else {
        const s = document.createElement('style');
        s.id = 'cadplan-studio-styles';
        s.textContent = css;
        document.head.appendChild(s);
      }
    }

    static playHapticChime(type = 'commit') {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === 'commit') {
          // High-end dual glass ping (E5 -> G#5)
          osc.type = 'sine';
          osc.frequency.setValueAtTime(659.25, now);
          osc.frequency.exponentialRampToValueAtTime(830.61, now + 0.08);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.start(now);
          osc.stop(now + 0.36);
        } else if (type === 'mic-on') {
          // Ascending alert
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          osc.start(now);
          osc.stop(now + 0.19);
        } else if (type === 'mic-off') {
          // Soft descending tone
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(660, now);
          osc.frequency.exponentialRampToValueAtTime(330, now + 0.06);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc.start(now);
          osc.stop(now + 0.17);
        } else if (type === 'verify') {
          // Triumph major chord (C5 -> E5 -> G5)
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc.start(now);
          osc.stop(now + 0.46);
        }
      } catch (e) {
        // AudioContext unavailable or blocked by browser gesture policy
      }
    }
}

globalThis.CadPlanItemNotes = CadPlanItemNotes;
if (typeof module !== 'undefined' && module.exports) module.exports = CadPlanItemNotes;