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

  static async getNotesForBlock(pageId, blockId, dossierId = null) {
        const resolvedDossier = this._resolveDossierId(dossierId);
        const key = `${resolvedDossier}:${pageId}:${blockId}`;
        const all = await this.getAllNotes(resolvedDossier);
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
          const dossierId = this._resolveDossierId(options.dossierId);
          const key = `${dossierId}:${pageId}:${blockId}`;
          const id = 'note_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

          const entry = {
            id,
            key,
            blockKey: `${pageId}:${blockId}`,
            pageId,
            blockId,
            enclosingBlockId: options.enclosingBlockId || null,
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
          const reader = docReader || globalThis._activeDocumentReader || null;
          const dossierId = this._resolveDossierId(reader?.options?.dossierId, reader);
          const all = await this.getAllNotes(dossierId);
          const active = all.filter(n => n.status !== 'resolved');

          const DocEditor = globalThis.CadPlanDocumentEditor || globalThis.DocumentEditor;
          const overrides = [];
          if (DocEditor && typeof DocEditor.getOverridesMap === 'function') {
            const oMap = DocEditor.getOverridesMap();
            Object.values(oMap).forEach(ov => {
              if ((ov?.dossierId || 'CadPlan') === dossierId) overrides.push(ov);
            });
          }

          if (active.length === 0 && overrides.length === 0) {
            return `# NO ACTIVE LIVING SPEC DIRECTIVES\nThere are currently no active author notes, element annotations, or in-situ edits attached in the living dossier [${dossierId}].`;
          }

          let out = `# 🎯 LIVING SPECIFICATION EVOLUTION: AUTHOR DIRECTIVES & UNIVERSAL ANNOTATIONS\n`;
          out += `**Dossier:** ${dossierId} • **Generated:** ${new Date().toISOString()} • **Author/Inventor:** Rob Brown\n`;
          out += `**Active Directives:** ${active.length} notes across ${new Set(active.map(n => n.blockKey)).size} locations • **In-Situ Text Revisions:** ${overrides.length}\n`;
          out += '**Execution Directive:** Incorporate the following author directives and text revisions directly into the specified source files and class methods. Keep all existing verified mathematics, direction cosines, and repository connections fully intact.\n\n';
          out += '---\n\n';

          const grouped = {};
          active.forEach(n => {
            grouped[n.blockKey] = grouped[n.blockKey] || [];
            grouped[n.blockKey].push(n);
          });

          const componentClassMap = {
            comp_fleet_map: { cls: 'HomeFleetVisualizer', file: 'HomeSetup/js/HomeFleetVisualizer.js', desc: 'Interactive Fleet Topology Map' },
            comp_handoff_deck: { cls: 'HomeHandoffComponent', file: 'HomeSetup/js/HomeHandoffComponent.js', desc: 'Master Opus Router & Fleet Git Synchronizer' },
            comp_dictation_studio: { cls: 'HomeDictationStudioComponent', file: 'HomeSetup/js/HomeDictationStudioComponent.js', desc: 'Universal Speech & Dictation Studio' },
            comp_tentative_snapping_lab: { cls: 'TentativeSnappingLab', file: 'CadPlan/js/TentativeSnappingLab.js', desc: 'Interactive Snapping Lab' },
            comp_nearest_intersection_lab: { cls: 'CadNearestIntersectionLab', file: 'CadPlan/js/CadNearestIntersectionLab.js', desc: 'Nearest Snap Lab' },
            comp_surface_normal_lab: { cls: 'CadSurfaceNormalLab', file: 'CadPlan/js/CadSurfaceNormalLab.js', desc: 'Surface Normal Lab' },
            comp_smart_keyin_lab: { cls: 'CadSmartKeyinLab', file: 'CadPlan/js/CadSmartKeyinLab.js', desc: 'SmartKeyin Lab' },
            comp_tangent_arc_swing_lab: { cls: 'CadTangentArcSwingLab', file: 'CadPlan/js/CadTangentArcSwingLab.js', desc: 'Tangent Arc Swing Studio' },
            comp_transform_gym: { cls: 'CadTransformGymLab', file: 'CadPlan/js/CadTransformGymLab.js', desc: '3-Point Transform Lab' },
            comp_zplane_gym: { cls: 'CadZPlaneElevationLab', file: 'CadPlan/js/CadZPlaneElevationLab.js', desc: 'Z-Elevation Lab' },
            comp_3d_smartline_lab: { cls: 'Cad3DSmartLineLab', file: 'CadPlan/js/Cad3DSmartLineLab.js', desc: '3D SmartLine Studio' },
            comp_model_studio: { cls: 'CadModelStudioComponent', file: 'CadPlan/js/CadModelStudioComponent.js', desc: '3D Model Studio' },
            comp_cad_studio_demo: { cls: 'CadStudioDemoComponent', file: 'CadPlan/js/CadStudioDemoComponent.js', desc: 'Production Studio' },
            comp_studio: { cls: 'QuoraStudioComponent', file: 'QuoraToys/js/QuoraStudioComponent.js', desc: 'Spot-The-Difference Comparator' },
            comp_annotation: { cls: 'QuoraAnnotationComponent', file: 'QuoraToys/js/QuoraAnnotationComponent.js', desc: 'Universal Annotation & Vector Studio' },
            comp_bookmarklet: { cls: 'QuoraBookmarkletComponent', file: 'QuoraToys/js/QuoraBookmarkletComponent.js', desc: 'In-Situ Bookmarklet Hub' },
            comp_extension: { cls: 'QuoraExtensionComponent', file: 'QuoraToys/js/QuoraExtensionComponent.js', desc: 'Chrome Extension Cockpit' },
            comp_archiver: { cls: 'QuoraArchiverComponent', file: 'QuoraToys/js/QuoraArchiverComponent.js', desc: 'Quora Answer Archiver' },
            comp_opus_router: { cls: 'OpusRouterComponent', file: 'Opus/js/OpusRouterComponent.js', desc: 'Master Opus Knowledge Router' },
            block_economic_impact: { cls: 'OpusEconomicImpactComponent', file: 'Opus/js/OpusEconomicImpactComponent.js', desc: 'Google Search Economic Impact Exhibit' },
            comp_convergence_stepper: { cls: 'OpusConvergenceStepperLab', file: 'Opus/js/OpusConvergenceStepperLab.js', desc: '4-Turn Sifting Stepper' }
          };

          const dossierPageMaps = {
            HomeSetup: {
              topology: { cls: 'HomeTopologyContent', file: 'HomeSetup/js/HomeTopologyContent.js' },
              network: { cls: 'HomeNetworkContent', file: 'HomeSetup/js/HomeNetworkContent.js' },
              storage: { cls: 'HomeStorageContent', file: 'HomeSetup/js/HomeStorageContent.js' },
              nodes: { cls: 'HomeNodesContent', file: 'HomeSetup/js/HomeNodesContent.js' },
              orchestration: { cls: 'HomeOrchestrationContent', file: 'HomeSetup/js/HomeOrchestrationContent.js' },
              secrets: { cls: 'HomeSecretsContent', file: 'HomeSetup/js/HomeSecretsContent.js' },
              handoff: { cls: 'HomeHandoffContent', file: 'HomeSetup/js/HomeHandoffContent.js' },
              dictation: { cls: 'HomeDictationContent', file: 'HomeSetup/js/HomeDictationContent.js' }
            },
            QuoraToys: {
              studio: { cls: 'QuoraStudioContent', file: 'QuoraToys/js/QuoraToysContent.js' },
              bookmarklet: { cls: 'QuoraBookmarkletContent', file: 'QuoraToys/js/QuoraToysContent.js' },
              extension: { cls: 'QuoraExtensionContent', file: 'QuoraToys/js/QuoraToysContent.js' },
              archiver: { cls: 'QuoraArchiverContent', file: 'QuoraToys/js/QuoraToysContent.js' },
              vision: { cls: 'QuoraVisionContent', file: 'QuoraToys/js/QuoraToysContent.js' },
              architecture: { cls: 'QuoraArchitectureContent', file: 'QuoraToys/js/QuoraToysContent.js' },
              annotation: { cls: 'QuoraAnnotationContent', file: 'QuoraToys/js/QuoraToysContent.js' }
            },
            CadPlan: {
              meta: { cls: 'CadPlanMetaContent', file: 'CadPlan/js/CadPlanMetaContent.js' },
              origins: { cls: 'CadOriginsContent', file: 'CadPlan/js/CadOriginsContent.js' },
              philosophy: { cls: 'AccuDrawPhilosophyContent', file: 'CadPlan/js/AccuDrawPhilosophyContent.js' },
              accucad: { cls: 'AccuCadAuditContent', file: 'CadPlan/js/AccuCadAuditContent.js' },
              shortcuts: { cls: 'KeyCommandEngineContent', file: 'CadPlan/js/KeyCommandEngineContent.js' },
              curvedrawer: { cls: 'CadCurveDrawerContent', file: 'CadPlan/js/CadCurveDrawerContent.js' },
              touchp2p: { cls: 'CadTouchP2PContent', file: 'CadPlan/js/CadTouchP2PContent.js' },
              demos: { cls: 'CadInteractiveDemoContent', file: 'CadPlan/js/CadInteractiveDemoContent.js' },
              ecosystem: { cls: 'CadLunoEcosystemContent', file: 'CadPlan/js/CadLunoEcosystemContent.js' },
              architecture: { cls: 'CadArchitectureDecisionsContent', file: 'CadPlan/js/CadArchitectureDecisionsContent.js' },
              cadcraft: { cls: 'CadCraftIntegrationContent', file: 'CadPlan/js/CadCraftIntegrationContent.js' },
              itwin: { cls: 'CadITwinParityContent', file: 'CadPlan/js/CadITwinParityContent.js' },
              interview: { cls: 'CadVisionInterviewContent', file: 'CadPlan/js/CadVisionInterviewContent.js' }
            },
            situation: {
              overview: { cls: 'OverviewPage', file: 'situation/js/OverviewPage.js' },
              'elder-advocacy': { cls: 'ElderAdvocacyPage', file: 'situation/js/ElderAdvocacyPage.js' },
              'caretaker-bias': { cls: 'CaretakerBiasPage', file: 'situation/js/CaretakerBiasPage.js' },
              'ai-perspective': { cls: 'AiPerspectivePage', file: 'situation/js/AiPerspectivePage.js' },
              'current-work': { cls: 'CurrentWorkPage', file: 'situation/js/CurrentWorkPage.js' },
              valuation: { cls: 'ValuationPage', file: 'situation/js/ValuationPage.js' },
              'court-filing': { cls: 'CourtFilingPage', file: 'situation/js/CourtFilingPage.js' }
            },
            EconomicsOfAutomation: {
              dividend: { cls: 'ArticleContent', file: 'EconomicsOfAutomation/js/ArticleContent.js' },
              colony: { cls: 'ColonyContent', file: 'EconomicsOfAutomation/js/ColonyContent.js' },
              earth: { cls: 'EarthContent', file: 'EconomicsOfAutomation/js/EarthContent.js' },
              statusquo: { cls: 'KineticContent', file: 'EconomicsOfAutomation/js/KineticContent.js' },
              doomer: { cls: 'DoomerContent', file: 'EconomicsOfAutomation/js/DoomerContent.js' },
              paradigms: { cls: 'ParadigmsContent', file: 'EconomicsOfAutomation/js/ParadigmsContent.js' },
              objections: { cls: 'ObjectionsContent', file: 'EconomicsOfAutomation/js/ObjectionsContent.js' },
              gametheory: { cls: 'GameTheoryContent', file: 'EconomicsOfAutomation/js/GameTheoryContent.js' },
              rules: { cls: 'RulesContent', file: 'EconomicsOfAutomation/js/RulesContent.js' },
              'ai-rules': { cls: 'AiRulesContent', file: 'EconomicsOfAutomation/js/AiRulesContent.js' }
            },
            Opus: {
              overview: { cls: 'OpusOverviewContent', file: 'Opus/js/OpusOverviewContent.js' },
              verification: { cls: 'OpusVerificationContent', file: 'Opus/js/OpusVerificationContent.js' },
              q1_cad: { cls: 'OpusQ1CadContent', file: 'Opus/js/OpusQ1CadContent.js' },
              q2_narrative: { cls: 'OpusQ2NarrativeContent', file: 'Opus/js/OpusQ2NarrativeContent.js' },
              q3_economics: { cls: 'OpusQ3EconomicsContent', file: 'Opus/js/OpusQ3EconomicsContent.js' },
              q4_cockpit: { cls: 'OpusQ4CockpitContent', file: 'Opus/js/OpusQ4CockpitContent.js' },
              strategy: { cls: 'OpusGrandStrategyContent', file: 'Opus/js/OpusGrandStrategyContent.js' }
            },
            accudraw: {
              overview: { cls: 'AccuDrawArchiveApp', file: 'accudraw/js/AccuDrawArchiveApp.js' },
              inventions: { cls: 'AccuDrawArchiveApp', file: 'accudraw/js/AccuDrawArchiveApp.js' },
              articles: { cls: 'AccuDrawArchiveApp', file: 'accudraw/js/AccuDrawArchiveApp.js' },
              lore: { cls: 'AccuDrawArchiveApp', file: 'accudraw/js/AccuDrawArchiveApp.js' },
              valuation: { cls: 'AccuDrawArchiveApp', file: 'accudraw/js/AccuDrawArchiveApp.js' },
              verify: { cls: 'AccuDrawArchiveApp', file: 'accudraw/js/AccuDrawArchiveApp.js' }
            },
            ValuationOfAccudraw: {
              overview: { cls: 'ValuationOfAccudraw', file: 'ValuationOfAccudraw/js/ValuationOfAccudraw.js' }
            },
            JobsAndAI: {
              overview: { cls: 'JobsAndAI', file: 'JobsAndAI/js/JobsAndAI.js' },
              thesis: { cls: 'ThesisPage', file: 'JobsAndAI/js/ThesisPage.js' },
              'ai-perspective': { cls: 'AiPerspectivePage', file: 'JobsAndAI/js/AiPerspectivePage.js' }
            }
          };

          let itemNumber = 1;
          const allNoteIds = [];

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
              const readerPage = reader?.pages?.find(p => p.id === pageId);
              const readerDocCls = readerPage?.docClass ? readerPage.docClass() : null;
              const mapped = dossierPageMaps[dossierId]?.[pageId];
              targetCls = mapped?.cls || readerDocCls?.name || (pageId.charAt(0).toUpperCase() + pageId.slice(1) + 'Content');
              targetFile = mapped?.file || `${dossierId}/js/${targetCls}.js`;

              const docCls = readerDocCls || globalThis[targetCls];
              if (docCls && typeof docCls[blockId] === 'function') {
                const val = docCls[blockId]();
                previewText = Array.isArray(val) ? val.join('\n\n') : String(val);
              }
            }

            if (!previewText) {
              const domEl = document.querySelector(`[data-block-id="${blockId}"], [data-block="${blockId}"]`);
              if (domEl) {
                previewText = (domEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 320);
              }
            }
            if (!previewText && notes[0]?.blockPreview) {
              previewText = notes[0].blockPreview;
            }

            const hasStaticMethod = Boolean(globalThis[targetCls] && typeof globalThis[targetCls][blockId] === 'function');
            const targetMethod = isComponent ? 'render' : (hasStaticMethod ? blockId : 'render');

            out += `## ${itemNumber++}. Target: \`${targetCls}.${isComponent ? 'render' : blockId}\`\n`;
            out += `**Page / Section:** \`${pageId}\` • **Block / Element ID:** \`${blockId}\`\n`;
            if (notes[0]?.enclosingBlockId && notes[0].enclosingBlockId !== blockId) {
              out += `**Enclosing Block:** \`${notes[0].enclosingBlockId}\`\n`;
            }
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
              allNoteIds.push(note.id);
              const timeStr = new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const cleanTag = note.status === 'pending_cleanup' ? ' `[🧹 MARKED FOR ARCHIVE]`' : '';
              out += `${idx + 1}. **(${timeStr} • ID: \`${note.id}\`)${cleanTag}:** ${note.text}\n`;
              if (note.videoLink) {
                out += `   - 📹 *Video Anchor:* \`${note.videoLink.videoId}\` @ **${note.videoLink.time}s** (${note.videoLink.label || 'Timestamp'})\n`;
              }
            });
            out += '\n';

            out += '### Expected Implementation Output Container:\n';
            out += '<' + `script data-file="${targetFile}" data-method="${targetCls}.${targetMethod}" data-action="patch">\n`;
            out += `// Updated implementation incorporating author directives for [${blockId}]...\n`;
            out += '<' + '/script>\n\n';
            out += '---\n\n';
          }

          if (overrides.length > 0 && DocEditor && typeof DocEditor.generateSurgicalPatches === 'function') {
            const revPatches = DocEditor.generateSurgicalPatches(dossierId);
            if (revPatches) {
              out += `## ✏️ In-Situ Text Revisions (${overrides.length})\n\n`;
              overrides.forEach((ov, idx) => {
                out += `${idx + 1}. **\`${ov.pageId}/${ov.blockId}\`**: ${ov.text}\n`;
              });
              out += `\n\`\`\`html\n${revPatches}\n\`\`\`\n\n`;
            }
          }

          if (allNoteIds.length > 0) {
            out += `### Auto-Resolution Footer (Include inside your html patch block when finished):\n`;
            out += `\`<!-- RESOLVED_NOTES: ${allNoteIds.join(', ')} -->\`\n`;
          }

          return out.trim();
        }

  static async openPromptBuilderDialog(docReader = null) {
        const hostContainer = document.body;
        const reader = docReader || globalThis._activeDocumentReader || null;
        const promptText = await this.buildNotesDirectivePrompt(reader);
        const dossierId = this._resolveDossierId(reader?.options?.dossierId, reader);
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
            minHeight: '240px',
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
                if (reader && typeof reader._updateBlockNoteBadges === 'function') {
                  reader._updateBlockNoteBadges();
                }
              }
            }
          }, '🧹 Mark Incorporated')
        ]);

        const rightButtons = makeElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
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

          makeElement('button', {
            className: 'dr-nav-btn primary',
            style: { fontWeight: 'bold' },
            onclick: (e) => {
              const btn = e.currentTarget;
              navigator.clipboard.writeText(promptText).then(() => {
                btn.textContent = '✓ Copied!';
                setTimeout(() => { btn.textContent = '📋 Copy Prompt'; }, 1800);
              });
            }
          }, '📋 Copy Prompt')
        ]);

        footer.appendChild(leftButtons);
        footer.appendChild(rightButtons);
        wrap.appendChild(footer);

        const dlgW = Math.min(660, window.innerWidth - 20);
        const dlgH = Math.min(580, window.innerHeight - 40);

        const dlg = UITools.makeDialog({
          title: `⚡ Living Specification Evolution Deck [${dossierId}]`,
          size: [dlgW, dlgH],
          position: [Math.max(10, Math.floor((window.innerWidth - dlgW) / 2)), Math.max(16, Math.floor((window.innerHeight - dlgH) / 2))],
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

          const activeReader = hostReader || globalThis._activeDocumentReader || null;
          const dossierId = this._resolveDossierId(extraOptions.dossierId, activeReader);
          const notes = await this.getNotesForBlock(pageId, blockId, dossierId);
          const activeNotes = notes.filter(n => n.status !== 'resolved');
          const testReadyNote = notes.find(n => n.status === 'test_ready');
          const hostContainer = document.body;

          const wrap = makeElement('div', {
            className: 'dr-note-studio-wrap',
            style: {
              display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
              boxSizing: 'border-box', gap: '10px',
              fontFamily: 'var(--dr-font-sans, system-ui, sans-serif)',
              color: '#f8fafc', overflow: 'hidden'
            }
          });

          const targetLabel = extraOptions.locator?.tagName
            ? `<${extraOptions.locator.tagName}#${blockId}>`
            : `${pageId} / ${blockId}`;

          let currentTab = extraOptions.defaultTab === 'thread' ? 'thread' : 'note';
          const btnTabNote = makeElement('button', {
            className: `dr-tab-btn ${currentTab === 'note' ? 'active' : ''}`,
            style: { padding: '3px 10px', fontSize: '10.5px' },
            onclick: () => switchStudioTab('note')
          }, `📝 Directives (${activeNotes.length})`);

          const btnTabThread = makeElement('button', {
            className: `dr-tab-btn ${currentTab === 'thread' ? 'active' : ''}`,
            style: { padding: '3px 10px', fontSize: '10.5px' },
            onclick: () => switchStudioTab('thread')
          }, '💬 Discussion');

          const headerRibbon = makeElement('div', {
            style: {
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingBottom: '8px', borderBottom: '1px solid rgba(0, 242, 254, 0.2)',
              fontSize: '11px', fontFamily: 'var(--dr-font-mono, monospace)', flexShrink: 0,
              flexWrap: 'wrap', gap: '6px'
            }
          }, [
            makeElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 } }, [
              makeElement('span', { style: { color: '#00f2fe', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `🎯 [${dossierId}] ${targetLabel}`)
            ]),
            makeElement('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, [
              btnTabNote,
              btnTabThread
            ])
          ]);
          wrap.appendChild(headerRibbon);

          const noteTabBody = makeElement('div', {
            style: {
              display: currentTab === 'note' ? 'flex' : 'none',
              flexDirection: 'column', gap: '10px', flex: '1 1 auto', minHeight: 0
            }
          });

          const threadTabBody = makeElement('div', {
            style: {
              display: currentTab === 'thread' ? 'flex' : 'none',
              flexDirection: 'column', gap: '10px', flex: '1 1 auto', minHeight: 0, overflowY: 'auto'
            }
          });

          function switchStudioTab(tab) {
            currentTab = tab;
            btnTabNote.classList.toggle('active', tab === 'note');
            btnTabThread.classList.toggle('active', tab === 'thread');
            noteTabBody.style.display = tab === 'note' ? 'flex' : 'none';
            threadTabBody.style.display = tab === 'thread' ? 'flex' : 'none';
            if (tab === 'thread') renderDiscussionTab();
          }

          if (testReadyNote) {
            const testCard = makeElement('div', {
              className: 'dr-test-directive-banner',
              style: {
                background: 'rgba(192, 132, 252, 0.12)', border: '1.5px solid #c084fc',
                boxShadow: '0 0 20px rgba(192, 132, 252, 0.25)', borderRadius: '8px',
                padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: '12px', flexShrink: 0
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
                  if (typeof OutboxQueue !== 'undefined' && OutboxQueue.addBundle) {
                    OutboxQueue.addBundle(`Verified: ${blockId}`, `✓ Verified fix for [${targetLabel}]: ${testReadyNote.testInstructions || testReadyNote.text}`);
                  }
                  dlg.close();
                  if (onUpdated) onUpdated();
                }
              }, '✓ Verified — Got It!')
            ]);
            noteTabBody.appendChild(testCard);
          }

          if (activeNotes.length > 0) {
            const historyDetails = makeElement('details', {
              open: true,
              style: {
                background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #1e293b',
                borderRadius: '6px', padding: '6px 10px', fontSize: '11px',
                color: '#cbd5e1', flexShrink: 0
              }
            });
            const summary = makeElement('summary', {
              style: { cursor: 'pointer', outline: 'none', color: '#38bdf8', fontWeight: 'bold' }
            }, `📜 ${activeNotes.length} Existing Note${activeNotes.length === 1 ? '' : 's'} on this Block`);

            const historyList = makeElement('div', {
              style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px', maxHeight: '110px', overflowY: 'auto' }
            });

            activeNotes.forEach(n => {
              const item = makeElement('div', {
                style: {
                  padding: '4px 8px', background: 'rgba(0,0,0,0.3)', borderLeft: '3px solid #00f2fe',
                  borderRadius: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px'
                }
              }, [
                makeElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, title: n.text }, n.text),
                makeElement('button', {
                  style: { background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' },
                  onclick: async () => {
                    await CadPlanItemNotes.updateNote(n.id, { status: 'resolved' });
                    CadPlanItemNotes.playHapticChime('commit');
                    dlg.close();
                    CadPlanItemNotes.openBlockNotesDialog(pageId, blockId, currentDoc, onUpdated, activeReader, { ...extraOptions, dossierId });
                    if (onUpdated) onUpdated();
                  }
                }, '✓ Resolve'),
                makeElement('button', {
                  style: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px' },
                  title: 'Delete note',
                  onclick: async () => {
                    await CadPlanItemNotes.deleteNote(n.id);
                    dlg.close();
                    CadPlanItemNotes.openBlockNotesDialog(pageId, blockId, currentDoc, onUpdated, activeReader, { ...extraOptions, dossierId });
                    if (onUpdated) onUpdated();
                  }
                }, '✕')
              ]);
              historyList.appendChild(item);
            });

            historyDetails.appendChild(summary);
            historyDetails.appendChild(historyList);
            noteTabBody.appendChild(historyDetails);
          }

          const studioCanvas = makeElement('div', {
            className: 'dr-dictation-studio-canvas',
            style: {
              flex: '1 1 auto', display: 'flex', flexDirection: 'column',
              background: 'rgba(4, 7, 14, 0.95)', border: '1.5px solid rgba(0, 242, 254, 0.3)',
              borderRadius: '10px', overflow: 'hidden',
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.8), 0 0 15px rgba(0, 242, 254, 0.08)'
            }
          });

          const waveStatusText = makeElement('span', {
            style: { fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', fontFamily: 'monospace' }
          }, '🎙️ Click "Start Listening" to dictate or type below...');

          const waveBars = makeElement('div', { className: 'dr-audio-wave-bars' }, [
            makeElement('span', { className: 'dr-wave-bar' }),
            makeElement('span', { className: 'dr-wave-bar' }),
            makeElement('span', { className: 'dr-wave-bar' }),
            makeElement('span', { className: 'dr-wave-bar' })
          ]);

          const waveRibbon = makeElement('div', {
            className: 'dr-waveform-ribbon',
            style: {
              padding: '6px 14px', background: 'rgba(15, 23, 42, 0.95)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
            }
          }, [waveStatusText, waveBars]);
          studioCanvas.appendChild(waveRibbon);

          let dictation = null;
          let textInputArea = null;

          if (typeof DictationWidget !== 'undefined') {
            dictation = new DictationWidget({
              compact: true,
              placeholder: 'Speak freely or type your specification directive here...'
            });

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
              dEditor.style.padding = '16px';
              dEditor.style.color = '#f8fafc';
              dEditor.style.minHeight = '150px';
            }

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
                flex: '1', width: '100%', minHeight: '150px', background: 'transparent',
                color: '#f8fafc', border: 'none', padding: '16px', fontSize: '15px',
                lineHeight: '1.7', fontFamily: 'var(--dr-font-sans, sans-serif)', outline: 'none', resize: 'none'
              }
            });
            studioCanvas.appendChild(textInputArea);
          }

          noteTabBody.appendChild(studioCanvas);

          const getCurrentText = () => {
            if (dictation) {
              const raw = dictation.editorContent ? (dictation.editorContent.innerText || dictation.getText()) : dictation.getText();
              return (raw || '').replace(/[\u200B\u00A0]/g, ' ').trim();
            }
            return textInputArea?.value?.trim() || '';
          };

          const commitCurrentNote = async () => {
            const val = getCurrentText();
            if (!val) return null;
            const preview = extraOptions.locator?.textSnippet ||
              (extraOptions.targetElement ? (extraOptions.targetElement.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140) : '');
            const created = await CadPlanItemNotes.addNote(pageId, blockId, val, {
              dossierId,
              enclosingBlockId: extraOptions.enclosingBlockId || null,
              author: 'Rob Brown',
              blockPreview: preview,
              xpath: extraOptions.locator?.xpath || null,
              cssPath: extraOptions.locator?.cssPath || null,
              tagName: extraOptions.locator?.tagName || null
            });
            if (extraOptions.targetElement) {
              extraOptions.targetElement.classList.remove('dr-pulse-highlight');
              void extraOptions.targetElement.offsetWidth;
              extraOptions.targetElement.classList.add('dr-pulse-highlight');
            }
            if (dictation) dictation.clearContent();
            if (textInputArea) textInputArea.value = '';
            return created;
          };

          const actionFooter = makeElement('div', {
            style: {
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingTop: '6px', borderTop: '1px solid rgba(0, 242, 254, 0.15)', flexShrink: 0, gap: '8px', flexWrap: 'wrap'
            }
          }, [
            makeElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
              makeElement('button', {
                className: 'dr-nav-btn',
                style: { padding: '7px 10px', fontSize: '11px', color: '#94a3b8' },
                onclick: () => {
                  if (dictation) dictation.clearContent();
                  if (textInputArea) textInputArea.value = '';
                }
              }, 'Clear'),
              makeElement('button', {
                className: 'dr-nav-btn',
                style: { padding: '7px 11px', fontSize: '11px', color: '#d2a8ff', borderColor: '#8257e566' },
                title: 'Save any draft note, compile all directives in this dossier, and open Outbox / LLM compiler',
                onclick: async () => {
                  await commitCurrentNote();
                  if (onUpdated) onUpdated();
                  dlg.close();
                  CadPlanItemNotes.openPromptBuilderDialog(activeReader || { options: { dossierId } });
                }
              }, '⚡ Compile All')
            ]),

            makeElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
              makeElement('button', {
                className: 'dr-nav-btn',
                style: {
                  padding: '8px 14px', fontSize: '11.5px', fontWeight: '800',
                  color: '#10b981', borderColor: '#10b98188', background: 'rgba(16, 185, 129, 0.12)',
                  borderRadius: '20px', cursor: 'pointer'
                },
                title: 'Save this note and immediately copy the full LLM edit prompt to clipboard',
                onclick: async (e) => {
                  const btn = e.currentTarget;
                  const created = await commitCurrentNote();
                  if (!created && activeNotes.length === 0) return;

                  CadPlanItemNotes.playHapticChime('commit');
                  const prompt = await CadPlanItemNotes.buildNotesDirectivePrompt(activeReader || { options: { dossierId } });
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(prompt);
                  }
                  btn.textContent = '✓ Copied for LLM!';
                  setTimeout(() => {
                    dlg.close();
                    if (onUpdated) onUpdated();
                  }, 350);
                }
              }, '📋 Save & Copy for LLM'),

              makeElement('button', {
                className: 'dr-nav-btn primary dr-commit-directive-btn',
                style: {
                  padding: '9px 18px', fontSize: '12px', fontWeight: '800', letterSpacing: '0.04em',
                  background: 'linear-gradient(135deg, #0284c7 0%, #00f2fe 100%)',
                  color: '#070a13', border: 'none', borderRadius: '20px', cursor: 'pointer',
                  boxShadow: '0 4px 18px rgba(0, 242, 254, 0.4)'
                },
                onclick: async (e) => {
                  const btn = e.currentTarget;
                  const created = await commitCurrentNote();
                  if (!created) return;

                  CadPlanItemNotes.playHapticChime('commit');
                  btn.classList.add('dr-btn-commit-flash');
                  btn.textContent = '✓ Pinned!';

                  setTimeout(() => {
                    dlg.close();
                    if (onUpdated) onUpdated();
                  }, 260);
                }
              }, '⚡ Commit & Pin')
            ])
          ]);
          noteTabBody.appendChild(actionFooter);

          let threadRendered = false;
          async function renderDiscussionTab() {
            if (threadRendered) return;
            threadRendered = true;
            threadTabBody.innerHTML = '';

            const threadId = `thread_${dossierId}_${pageId}_${blockId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

            if (typeof Comments !== 'undefined') {
              const mount = makeElement('div', { style: { flex: 1, minHeight: '260px' } });
              threadTabBody.appendChild(mount);
              const app = new Comments();
              app.init(mount, {
                threadId,
                showTitle: false,
                elementAnchor: `${dossierId}:${pageId}:${blockId}`
              });
              return;
            }

            const adapter = (typeof SupabaseCommentsAdapter !== 'undefined') ? new SupabaseCommentsAdapter() : null;
            const statusLine = makeElement('div', {
              style: { fontSize: '10.5px', color: '#94a3b8', fontFamily: 'monospace' }
            }, adapter && !adapter.isLocalFallback ? '☁️ Synced via Supabase' : '💾 Stored locally in browser');

            const commentsList = makeElement('div', {
              style: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }
            });

            const loadPosts = async () => {
              commentsList.innerHTML = '';
              let posts = [];
              if (adapter) {
                posts = await adapter.fetchComments(threadId);
              } else {
                try {
                  posts = JSON.parse(localStorage.getItem(`local_thread_${threadId}`) || '[]');
                } catch (e) { posts = []; }
              }
              if (posts.length === 0) {
                commentsList.appendChild(makeElement('div', {
                  style: { padding: '24px', textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '12px' }
                }, 'No discussion comments on this block yet. Start the conversation below.'));
                return;
              }
              posts.forEach(p => {
                commentsList.appendChild(makeElement('div', {
                  style: {
                    background: 'rgba(255,255,255,0.03)', border: '1px solid #1e293b',
                    borderLeft: '3px solid #38bdf8', borderRadius: '6px', padding: '8px 10px'
                  }
                }, [
                  makeElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginBottom: '4px' } }, [
                    makeElement('strong', { style: { color: '#38bdf8' } }, p.author_name || 'Guest Reader'),
                    makeElement('span', {}, p.created_at ? new Date(p.created_at).toLocaleString() : '')
                  ]),
                  makeElement('div', { style: { fontSize: '12px', color: '#f1f5f9', lineHeight: '1.5' } }, p.text)
                ]));
              });
            };

            const authorInput = makeElement('input', {
              type: 'text',
              placeholder: 'Your name (default: Rob Brown)',
              value: localStorage.getItem('dr_comment_author') || 'Rob Brown',
              style: {
                background: '#050811', color: '#f8fafc', border: '1px solid #1e293b',
                borderRadius: '6px', padding: '6px 10px', fontSize: '11.5px', outline: 'none'
              }
            });

            const commentBox = makeElement('textarea', {
              placeholder: 'Write a discussion comment on this block...',
              style: {
                minHeight: '76px', background: '#050811', color: '#f8fafc',
                border: '1px solid #1e293b', borderRadius: '6px', padding: '8px 10px',
                fontSize: '12.5px', lineHeight: '1.5', resize: 'vertical', outline: 'none'
              }
            });

            const postBtn = makeElement('button', {
              className: 'dr-nav-btn primary',
              style: { alignSelf: 'flex-end', padding: '6px 14px', fontSize: '11.5px', fontWeight: 'bold' },
              onclick: async () => {
                const txt = commentBox.value.trim();
                if (!txt) return;
                const authorName = authorInput.value.trim() || 'Guest Reader';
                localStorage.setItem('dr_comment_author', authorName);
                if (adapter) {
                  await adapter.postComment({
                    threadId,
                    authorName,
                    text: txt,
                    xpath: extraOptions.locator?.xpath || null
                  });
                } else {
                  const key = `local_thread_${threadId}`;
                  const arr = JSON.parse(localStorage.getItem(key) || '[]');
                  arr.push({ id: 'c_' + Date.now(), author_name: authorName, text: txt, created_at: new Date().toISOString() });
                  localStorage.setItem(key, JSON.stringify(arr));
                }
                commentBox.value = '';
                await loadPosts();
              }
            }, '💬 Post Comment');

            threadTabBody.append(statusLine, commentsList, authorInput, commentBox, postBtn);
            await loadPosts();
          }

          wrap.append(noteTabBody, threadTabBody);
          if (currentTab === 'thread') renderDiscussionTab();

          const dlgW = Math.min(660, window.innerWidth - 20);
          const dlgH = Math.min(580, window.innerHeight - 40);

          const dlg = UITools.makeDialog({
            title: `🏛️ Directives & Discussion • ${blockId}`,
            size: [dlgW, dlgH],
            position: [Math.max(10, Math.floor((window.innerWidth - dlgW) / 2)), Math.max(16, Math.floor((window.innerHeight - dlgH) / 2))],
            contentElement: wrap,
            appendTo: hostContainer,
            onClose: () => {
              if (dictation) dictation.stopListening();
            }
          });

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

  static async getNotesForElement(element, pageId = 'overview', dossierId = null) {
        if (!element) return [];
        const resolvedDossier = this._resolveDossierId(dossierId);
        const loc = this.generateElementLocator(element);
        const all = await this.getAllNotes(resolvedDossier);

        return all.filter(n => {
          if (n.dossierId && n.dossierId !== resolvedDossier) return false;
          if (n.blockKey === `${pageId}:${loc.key}`) return true;
          if (loc.xpath && n.xpath && n.xpath === loc.xpath) return true;
          if (loc.cssPath && n.cssPath && n.cssPath === loc.cssPath) return true;
          return false;
        });
      }
  static async resolveNotesFromLlmPayload(rawPayloadText) {
      if (!rawPayloadText || typeof rawPayloadText !== 'string') return [];

      const resolvedIds = new Set();
      const testUpdates = [];

      const resolveRegex = /<(?:script|template)[^>]*?data-action=["'](?:resolve|resolve-notes)["'][^>]*?data-notes=["']([^"']+)["'][^>]*>/gi;
      let match;
      while ((match = resolveRegex.exec(rawPayloadText)) !== null) {
        match[1].split(/[\s,]+/).forEach(id => {
          if (id.trim()) resolvedIds.add(id.trim());
        });
      }

      const commentRegex = /<!--\s*RESOLVE(?:D)?_NOTES?:\s*([^->]+)-->/gi;
      while ((match = commentRegex.exec(rawPayloadText)) !== null) {
        match[1].split(/[\s,]+/).forEach(id => {
          if (id.trim()) resolvedIds.add(id.trim());
        });
      }

      const testNoteRegex = /<script[^>]*?data-action=["']test-note["'][^>]*?data-id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/script>/gi;
      while ((match = testNoteRegex.exec(rawPayloadText)) !== null) {
        testUpdates.push({
          id: match[1].trim(),
          instructions: match[2].trim()
        });
      }

      for (const id of resolvedIds) {
        await CadPlanItemNotes.updateNote(id, {
          status: 'resolved',
          resolvedTimestamp: Date.now(),
          resolutionSource: 'llm-patch-applied'
        });
      }

      for (const item of testUpdates) {
        await CadPlanItemNotes.updateNote(item.id, {
          status: 'test_ready',
          testInstructions: item.instructions,
          updatedTimestamp: Date.now()
        });
      }

      if (resolvedIds.size > 0 || testUpdates.length > 0) {
        const readers = [
          globalThis._activeDocumentReader,
          globalThis._cadPlanInstance?.reader,
          globalThis._quoraToysAppInstance?.reader,
          globalThis._economicsInstance?.reader,
          globalThis._opusInstance?.reader,
          globalThis._homeSetupInstance?.reader
        ].filter(Boolean);

        readers.forEach(r => {
          try { r._updateBlockNoteBadges?.(); } catch (e) {}
          try { r._populateSidePanelNotes?.(); } catch (e) {}
        });

        [
          globalThis._cadPlanInstance?.aardvark,
          globalThis._quoraToysAppInstance?.aardvark,
          globalThis._economicsInstance?.aardvark,
          globalThis._opusInstance?.aardvark,
          globalThis._homeSetupInstance?.aardvark
        ].filter(Boolean).forEach(a => {
          try { a._highlightAnnotatedElements?.(); } catch (e) {}
        });
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

  static _resolveDossierId(explicit = null, hostReader = null) {
      if (explicit) return explicit;
      if (hostReader?.options?.dossierId) return hostReader.options.dossierId;
      if (globalThis._activeDocumentReader?.options?.dossierId) {
        return globalThis._activeDocumentReader.options.dossierId;
      }
      if (hostReader?.brandTitle) return hostReader.brandTitle;
      if (globalThis._activeDocumentReader?.brandTitle) {
        return globalThis._activeDocumentReader.brandTitle;
      }
      if (typeof window !== 'undefined' && window.location?.pathname) {
        const segs = window.location.pathname.split('/').filter(Boolean);
        if (segs.length > 0 && !segs[0].endsWith('.html')) return segs[0];
      }
      return 'Document';
    }
}

globalThis.CadPlanItemNotes = CadPlanItemNotes;
if (typeof module !== 'undefined' && module.exports) module.exports = CadPlanItemNotes;