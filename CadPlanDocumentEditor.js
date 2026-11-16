class CadPlanDocumentEditor {
  static DB_NAME = 'CadPlan_DocumentEdits_DB';
  static STORE_NAME = 'block_edits';
  static LOCAL_STORAGE_KEY = 'cadplan_document_block_overrides';

  static _resolveDossierId(explicitDossier = null) {
    return explicitDossier ||
      globalThis._activeDocumentReader?.options?.dossierId ||
      globalThis._activeDocumentReader?.brandTitle ||
      'CadPlan';
  }

  static getOverridesMap() {
    try {
      const raw = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  static getOverride(pageId, blockId, dossierId = null) {
    const dId = this._resolveDossierId(dossierId);
    const map = this.getOverridesMap();
    return map[`${dId}:${pageId}:${blockId}`] || null;
  }

  static saveOverride(pageId, blockId, text, docClassName = null, dossierId = null) {
    const dId = this._resolveDossierId(dossierId);
    const map = this.getOverridesMap();
    map[`${dId}:${pageId}:${blockId}`] = {
      dossierId: dId,
      pageId,
      blockId,
      docClassName,
      text,
      timestamp: Date.now()
    };
    localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(map));
  }

  static removeOverride(pageId, blockId, dossierId = null) {
    const dId = this._resolveDossierId(dossierId);
    const map = this.getOverridesMap();
    delete map[`${dId}:${pageId}:${blockId}`];
    localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(map));
  }

  static clearAllOverrides() {
    localStorage.removeItem(this.LOCAL_STORAGE_KEY);
  }

  static _resolveTargetMeta(dossier, pageId, fallbackClsName) {
      const reader = globalThis._activeDocumentReader;
      let cls = fallbackClsName;
      if (!cls && reader && Array.isArray(reader.pages)) {
        const pageObj = reader.pages.find(p => p.id === pageId);
        const doc = pageObj?.docClass ? pageObj.docClass() : null;
        if (doc && doc.name) cls = doc.name;
      }

      const pageClassMaps = {
        Opus: {
          overview: 'OpusOverviewContent', verification: 'OpusVerificationContent',
          q1_cad: 'OpusQ1CadContent', q2_narrative: 'OpusQ2NarrativeContent',
          q3_economics: 'OpusQ3EconomicsContent', q4_cockpit: 'OpusQ4CockpitContent',
          strategy: 'OpusGrandStrategyContent'
        },
        HomeSetup: {
          topology: 'HomeTopologyContent', network: 'HomeNetworkContent',
          storage: 'HomeStorageContent', nodes: 'HomeNodesContent',
          orchestration: 'HomeOrchestrationContent', secrets: 'HomeSecretsContent',
          handoff: 'HomeHandoffContent', dictation: 'HomeDictationContent'
        },
        CadPlan: {
          meta: 'CadPlanMetaContent', origins: 'CadOriginsContent', philosophy: 'AccuDrawPhilosophyContent',
          accucad: 'AccuCadAuditContent', shortcuts: 'KeyCommandEngineContent', curvedrawer: 'CadCurveDrawerContent',
          touchp2p: 'CadTouchP2PContent', demos: 'CadInteractiveDemoContent', ecosystem: 'CadLunoEcosystemContent',
          architecture: 'CadArchitectureDecisionsContent', cadcraft: 'CadCraftIntegrationContent',
          itwin: 'CadITwinParityContent', interview: 'CadVisionInterviewContent'
        },
        QuoraToys: {
          studio: 'QuoraStudioContent', bookmarklet: 'QuoraBookmarkletContent', extension: 'QuoraExtensionContent',
          archiver: 'QuoraArchiverContent', vision: 'QuoraVisionContent', architecture: 'QuoraArchitectureContent',
          annotation: 'QuoraAnnotationContent'
        },
        EconomicsOfAutomation: {
          dividend: 'ArticleContent', colony: 'ColonyContent', earth: 'EarthContent',
          statusquo: 'KineticContent', doomer: 'DoomerContent', paradigms: 'ParadigmsContent',
          objections: 'ObjectionsContent', gametheory: 'GameTheoryContent', rules: 'RulesContent',
          'ai-rules': 'AiRulesContent'
        },
        situation: {
          overview: 'OverviewPage', 'elder-advocacy': 'ElderAdvocacyPage', 'caretaker-bias': 'CaretakerBiasPage',
          'ai-perspective': 'AiPerspectivePage', 'current-work': 'CurrentWorkPage', valuation: 'ValuationPage',
          'court-filing': 'CourtFilingPage'
        },
        ValuationOfAccudraw: {
          overview: 'ValuationOfAccudraw'
        },
        JobsAndAI: {
          overview: 'JobsAndAI', thesis: 'ThesisPage', 'ai-perspective': 'AiPerspectivePage'
        }
      };

      const resolvedCls = cls || pageClassMaps[dossier]?.[pageId] || `${pageId.charAt(0).toUpperCase() + pageId.slice(1)}Content`;
      let file = `${dossier}/js/${resolvedCls}.js`;
      if (dossier === 'QuoraToys' && resolvedCls.startsWith('Quora') && resolvedCls.endsWith('Content')) {
        file = 'QuoraToys/js/QuoraToysContent.js';
      }
      return { cls: resolvedCls, file };
    }
  static generateSurgicalPatches(dossierFilter = null) {
    const map = this.getOverridesMap();
    const keys = Object.keys(map);
    if (keys.length === 0) return '';

    let patchBundle = '';
    const classMethodMap = {};

    keys.forEach(key => {
      const item = map[key];
      const dossier = item.dossierId || 'CadPlan';
      if (dossierFilter && dossier !== dossierFilter) return;

      const meta = this._resolveTargetMeta(dossier, item.pageId, item.docClassName);
      const targetKey = `${meta.file}::${meta.cls}`;
      classMethodMap[targetKey] = classMethodMap[targetKey] || { file: meta.file, cls: meta.cls, items: [] };
      classMethodMap[targetKey].items.push(item);
    });

    for (const entry of Object.values(classMethodMap)) {
      entry.items.forEach(item => {
        const methodSignature = `${entry.cls}.${item.blockId}`;
        const escapedText = JSON.stringify(item.text);

        patchBundle += `<script data-file="${entry.file}" data-method="${methodSignature}" data-action="patch">\n`;
        patchBundle += `static ${item.blockId}() {\n`;
        patchBundle += `  return [\n`;
        patchBundle += `    ${escapedText}\n`;
        patchBundle += `  ];\n`;
        patchBundle += `}\n`;
        patchBundle += `</` + `script>\n\n`;
      });
    }

    return patchBundle.trim();
  }

  static openBlockEditor(pageId, blockId, currentDoc, onSaved, hostReader = null) {
      const hostContainer = document.body;
      const dossierId = hostReader?.options?.dossierId || hostReader?.dossierId || hostReader?.brandTitle || this._resolveDossierId(null);
      const docName = currentDoc?.name || (typeof currentDoc === 'function' ? currentDoc.name : 'DocumentContent');
      const existingOverride = this.getOverride(pageId, blockId, dossierId);

      let originalText = '';
      if (currentDoc && typeof currentDoc[blockId] === 'function') {
        const variants = currentDoc[blockId]();
        originalText = Array.isArray(variants) ? variants.join('\n\n') : String(variants);
      } else {
        const domEl = document.querySelector(`[data-block-id="${blockId}"], [data-block="${blockId}"]`);
        if (domEl) originalText = domEl.textContent.trim();
      }

      const initialVal = existingOverride ? existingOverride.text : originalText;

      const wrap = makeElement('div', {
        style: {
          display: 'flex', flexDirection: 'column', gap: '10px',
          height: '100%', color: '#e2e8f0', fontFamily: 'var(--dr-font-sans, system-ui, sans-serif)'
        }
      });

      const header = makeElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '6px 4px', borderBottom: '1px solid #232d3f', fontSize: '11px', color: '#94a3b8'
        }
      }, [
        makeElement('div', {}, [
          makeElement('span', { style: { color: '#38bdf8', fontWeight: 'bold' } }, `[${dossierId}] ${docName}.${blockId}()`),
          existingOverride ? makeElement('span', { style: { color: '#f59e0b', marginLeft: '6px', fontWeight: 'bold' } }, '[Custom Revision Active]') : null
        ]),
        makeElement('span', { id: 'block-editor-char-count' }, `${initialVal.length} chars`)
      ]);
      wrap.appendChild(header);

      const textarea = makeElement('textarea', {
        style: {
          flex: 1, minHeight: '220px', background: '#090d16', color: '#f8fafc',
          border: '1.5px solid #232d3f', borderRadius: '8px', padding: '12px',
          fontFamily: 'var(--dr-font-body, Georgia, serif)', fontSize: '14px',
          lineHeight: '1.6', resize: 'none', outline: 'none'
        }
      });
      textarea.value = initialVal;
      textarea.oninput = (e) => {
        const countEl = document.getElementById('block-editor-char-count');
        if (countEl) countEl.textContent = `${e.target.value.length} chars`;
      };
      wrap.appendChild(textarea);

      let dictationAttachment = null;
      if (typeof DictationWidget !== 'undefined' && typeof DictationWidget.attach === 'function') {
        setTimeout(() => {
          dictationAttachment = DictationWidget.attach(textarea);
        }, 40);
      }

      const footer = makeElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: '6px', borderTop: '1px solid #232d3f', gap: '8px', flexWrap: 'wrap'
        }
      });

      const leftGroup = makeElement('div', { style: { display: 'flex', gap: '6px' } });
      if (existingOverride) {
        const btnRevert = makeElement('button', {
          className: 'dr-nav-btn',
          style: { color: '#ef4444', borderColor: '#ef444466', fontSize: '11px' },
          onclick: () => {
            if (confirm('Revert this paragraph back to original source code?')) {
              this.removeOverride(pageId, blockId, dossierId);
              if (onSaved) onSaved();
              dlg.close();
            }
          }
        }, '↺ Revert to Source');
        leftGroup.appendChild(btnRevert);
      }
      footer.appendChild(leftGroup);

      const rightGroup = makeElement('div', { style: { display: 'flex', gap: '8px' } }, [
        makeElement('button', {
          className: 'dr-nav-btn',
          onclick: () => dlg.close()
        }, 'Cancel'),
        makeElement('button', {
          className: 'dr-nav-btn primary',
          onclick: () => {
            const newText = textarea.value.trim();
            this.saveOverride(pageId, blockId, newText, docName, dossierId);
            if (onSaved) onSaved();
            dlg.close();
          }
        }, '✓ Save Revision')
      ]);
      footer.appendChild(rightGroup);
      wrap.appendChild(footer);

      const dlgW = Math.min(560, window.innerWidth - 20);
      const dlgH = Math.min(450, window.innerHeight - 40);

      const dlg = UITools.makeDialog({
        title: `✏️ In-Situ Editor [${dossierId}]`,
        size: [dlgW, dlgH],
        position: [Math.max(10, Math.floor((window.innerWidth - dlgW) / 2)), Math.max(16, Math.floor((window.innerHeight - dlgH) / 2))],
        contentElement: wrap,
        appendTo: hostContainer,
        onClose: () => {
          if (dictationAttachment && typeof dictationAttachment.destroy === 'function') {
            dictationAttachment.destroy();
          }
        }
      });

      return dlg;
    }

  static openRevisionManager(onUpdated, dossierFilter = null) {
      const hostContainer = document.body;
      const map = this.getOverridesMap();
      const activeDossier = dossierFilter || this._resolveDossierId(null);
      const keys = Object.keys(map).filter(k => !dossierFilter || (map[k]?.dossierId || 'CadPlan') === dossierFilter);

      const wrap = makeElement('div', {
        style: {
          display: 'flex', flexDirection: 'column', gap: '12px',
          height: '100%', color: '#e2e8f0', fontFamily: 'var(--dr-font-sans, system-ui, sans-serif)'
        }
      });

      const header = makeElement('div', {
        style: {
          padding: '6px 4px', borderBottom: '1px solid #232d3f', fontSize: '12px',
          color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }
      }, [
        makeElement('span', {}, `Revisions [${activeDossier}]: ${keys.length}`),
        makeElement('span', { style: { color: '#10b981', fontWeight: 'bold' } }, 'Ready to Compile')
      ]);
      wrap.appendChild(header);

      const listContainer = makeElement('div', {
        style: {
          flex: 1, minHeight: '220px', maxHeight: '380px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '8px'
        }
      });

      if (keys.length === 0) {
        listContainer.appendChild(makeElement('div', {
          style: { padding: '24px', textAlign: 'center', color: '#64748b', fontStyle: 'italic', fontSize: '12px' }
        }, 'No custom revisions active. Click ✎ Edit or double-click any paragraph to edit in-situ.'));
      } else {
        keys.forEach(k => {
          const item = map[k];
          const card = makeElement('div', {
            style: {
              background: 'rgba(255, 255, 255, 0.03)', border: '1px solid #1e293b',
              borderRadius: '6px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px'
            }
          }, [
            makeElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              makeElement('strong', { style: { fontSize: '12px', color: '#38bdf8', fontFamily: 'monospace' } }, `${item.pageId} / ${item.blockId}`),
              makeElement('button', {
                className: 'dr-nav-btn',
                style: { padding: '2px 6px', fontSize: '10px', color: '#ef4444' },
                onclick: () => {
                  this.removeOverride(item.pageId, item.blockId, item.dossierId || activeDossier);
                  if (onUpdated) onUpdated();
                  dlg.close();
                  CadPlanDocumentEditor.openRevisionManager(onUpdated, dossierFilter);
                }
              }, 'Remove')
            ]),
            makeElement('div', {
              style: { fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
            }, item.text)
          ]);
          listContainer.appendChild(card);
        });
      }
      wrap.appendChild(listContainer);

      const footer = makeElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: '8px', borderTop: '1px solid #232d3f', gap: '8px', flexWrap: 'wrap'
        }
      }, [
        makeElement('button', {
          className: 'dr-nav-btn',
          style: { color: '#f59e0b', fontSize: '11px' },
          onclick: (e) => {
            const btn = e.currentTarget;
            const patches = this.generateSurgicalPatches(dossierFilter);
            if (!patches) {
              alert('No active revisions to compile.');
              return;
            }
            navigator.clipboard.writeText(patches).then(() => {
              const orig = btn.textContent;
              btn.textContent = '✓ Copied Patches!';
              setTimeout(() => { btn.textContent = orig; }, 1800);
            });
          }
        }, '📋 Copy Patches'),
        makeElement('div', { style: { display: 'flex', gap: '8px' } }, [
          makeElement('button', {
            className: 'dr-nav-btn primary',
            style: { fontWeight: 'bold' },
            onclick: async () => {
              const patches = this.generateSurgicalPatches(dossierFilter);
              if (!patches) {
                alert('No active revisions to compile.');
                return;
              }
              const ItemNotes = globalThis.CadPlanItemNotes || globalThis.DocumentItemNotes;
              if (ItemNotes && typeof ItemNotes.dispatchToOutbox === 'function') {
                const res = ItemNotes.dispatchToOutbox(`${activeDossier} In-Situ Revisions`, patches);
                if (res.channel === 'clipboard-fallback') {
                  alert('✓ Copied surgical revisions to clipboard!');
                } else {
                  alert(`✓ Dispatched surgical revisions directly to Luno Outbox via [${res.channel}]!`);
                }
              } else {
                navigator.clipboard.writeText(patches);
                alert('✓ Compiled revisions generated as surgical patches and copied to clipboard!');
              }
              dlg.close();
            }
          }, '📤 Compile to Outbox')
        ])
      ]);
      wrap.appendChild(footer);

      const dlgW = Math.min(580, window.innerWidth - 20);
      const dlgH = Math.min(500, window.innerHeight - 40);

      const dlg = UITools.makeDialog({
        title: `📑 Document Revision Manager [${activeDossier}]`,
        size: [dlgW, dlgH],
        position: [Math.max(10, Math.floor((window.innerWidth - dlgW) / 2)), Math.max(16, Math.floor((window.innerHeight - dlgH) / 2))],
        contentElement: wrap,
        appendTo: hostContainer
      });

      return dlg;
    }
  static applyInMemoryPatch(pageId, blockId, newText, dossierId = null) {
    const dId = this._resolveDossierId(dossierId);
    this.saveOverride(pageId, blockId, newText, null, dId);
    const targetEl = document.querySelector(`[data-block-id="${blockId}"], [data-block="${blockId}"]`);
    if (targetEl) {
      const textNode = targetEl.querySelector('p, .text-sm, .card-text') || targetEl;
      if (textNode) {
        textNode.textContent = newText;
        targetEl.style.boxShadow = '0 0 12px rgba(56, 189, 248, 0.4)';
      }
    }
    return true;
  }
}

globalThis.CadPlanDocumentEditor = CadPlanDocumentEditor;
globalThis.DocumentEditor = CadPlanDocumentEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = CadPlanDocumentEditor;