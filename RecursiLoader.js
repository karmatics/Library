// RecursiLoader.js
class RecursiLoader {
  static loaded = new Set();
  static loadedCss = new Set();

  static getClassNameFromUrl(url) {
      const clean = String(url || '').split('?')[0].split('#')[0];
      const fileName = clean.split('/').pop() || '';
      return fileName.replace(/\.js$/i, '');
    }

  static resolveDependencyUrl(dep, ownerUrl) {
      if (!dep || typeof dep !== 'string') throw new Error('Invalid dependency entry.');
      const clean = dep.trim();
      if (clean.includes('/') || clean.endsWith('.js') || clean.endsWith('.css') || clean.startsWith('.')) {
         const ownerBase = ownerUrl.substring(0, ownerUrl.lastIndexOf('/') + 1) || '/';
         const absoluteBase = document.baseURI ? new URL(ownerBase, document.baseURI).href : ownerBase;
         return new URL(clean, absoluteBase).href;
      }
      return '/library/' + clean + '.js'; 
    }

  static async fetchText(url) {
      this.state.activeUrl = url;

      try {
        const urlObj = new URL(url, document.baseURI || location.href);
        let path = urlObj.pathname;
        if (!path.startsWith('/')) path = '/' + path;
        
        const allPatches = await this._readVibesPatches();
        const filePatch = allPatches.find(p => p.filePath === path && (!p.methodName || p.methodName === '__file__'));
        
        if (filePatch) {
          return filePatch.source;
        }
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' while fetching ' + url);
        let code = await res.text();
        
        const methodPatches = allPatches.filter(p => p.filePath === path && p.methodName && p.methodName !== '__file__');
        if (methodPatches.length > 0) {
          code = await this._applyAstPatches(code, methodPatches, path);
        }
        return code;
      } catch (e) {
        console.error('[RecursiLoader] Processing failed for', url, e);
        // Resilient fallback to standard fetch if something fails
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${url}`);
          return await res.text();
        } catch (fetchErr) {
          throw fetchErr;
        }
      }
    }

  static async loadCss(url) {
      if (this.loaded.has(url)) return;
      this.loaded.add(url);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
    }

  static async loadClassFile(url) {
      const className = this.getClassNameFromUrl(url);
      const isTargetTrace = className.toLowerCase() === 'projecteditorapp';

      if (!this.loadingPromises) {
        this.loadingPromises = new Map();
      }

      if (isTargetTrace) {
        console.group(`[RecursiLoader] [TRACE-ProjectEditorApp] loadClassFile called for URL: ${url}`);
        console.log(`[RecursiLoader] [TRACE-ProjectEditorApp] Checking 'loaded' cache state:`, this.loaded.has(className));
      }

      if (this.loaded.has(className)) {
        if (isTargetTrace) {
          console.log(`[RecursiLoader] [TRACE-ProjectEditorApp] Already present in 'loaded' cache. Returning global instance directly.`);
          console.groupEnd();
        }
        return this.findGlobalClass(className);
      }

      if (isTargetTrace) {
        console.log(`[RecursiLoader] [TRACE-ProjectEditorApp] Checking global scope (window/globalThis) for existing class:`);
      }

      const existingCtor = this.findGlobalClass(className);
      if (existingCtor) {
        if (isTargetTrace) {
          console.log(`[RecursiLoader] [TRACE-ProjectEditorApp] 🟢 Global class instance found! Skipping network pull and registering as loaded.`);
          console.groupEnd();
        }
        this.loaded.add(className);
        return existingCtor;
      }

      if (isTargetTrace) {
        console.log(`[RecursiLoader] [TRACE-ProjectEditorApp] 🔴 Class not found on global scope. Checking active loading promises...`);
      }

      if (this.loadingPromises.has(className)) {
        if (isTargetTrace) {
          console.log(`[RecursiLoader] [TRACE-ProjectEditorApp] Active load promise found. Awaiting execution...`);
          console.groupEnd();
        }
        await this.loadingPromises.get(className);
        return this.findGlobalClass(className);
      }

      if (isTargetTrace) {
        console.log(`[RecursiLoader] [TRACE-ProjectEditorApp] ⏬ No global class or active promise. Fetching/Evaluating file from server...`);
      }

      const loadPromise = (async () => {
        this.state.activeUrl = url;
        this.state.phase = `Evaluating script: ${className}`;

        const isBundle = className.endsWith('-bundle') || url.includes('-bundle') || url.includes('/dist/');
        
        if (isBundle) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.dataset.recursiSrc = url;
            script.onload = () => {
              this.state.loadedList.push({ className, url });
              resolve();
            };
            script.onerror = (err) => {
              reject(new Error(`Failed to load bundle script via src: ${url}`));
            };
            document.head.appendChild(script);
          });
          return { isBundle: true };
        }
        
        const code = await this.fetchText(url);
        
        const isIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(className);
        const exposureTrailer = isIdentifier ? `\n;if (typeof ${className} !== "undefined") { globalThis.${className} = ${className}; if (typeof window !== "undefined") { window.${className} = ${className}; } }` : '';
        
        const script = document.createElement('script');
        script.dataset.recursiSrc = url;
        script.textContent = code + exposureTrailer + '\n//# sourceURL=' + url;
        document.head.appendChild(script);

        const fakeScript = document.createElement('script');
        fakeScript.type = 'recursi/loaded';
        fakeScript.src = url;
        document.head.appendChild(fakeScript);

        const Ctor = this.findGlobalClass(className);
        
        if (!Ctor) {
          const parsedNames = this._extractClassNames(code);
          let nameMismatchHelp = '';
          if (parsedNames.length > 0) {
            nameMismatchHelp = `\n\n💡 System detected class declarations [${parsedNames.join(', ')}] inside the loaded code, but you requested "${className}". The physical class name must exactly match your filename (case-insensitive in loader, case-sensitive in engine).`;
          }
          
          let moduleHelp = '';
          if (code.includes('import ') || code.includes('export ')) {
            moduleHelp = `\n\n💡 System detected top-level "import" or "export" statements inside your class file. Standard loader environments evaluate classic scripts. Please ensure your Vibes JS files do not contain top-level ES6 import/export statements.`;
          }

          throw new Error(`Class "${className}" was not registered on the global scope after evaluating: ${url}.${nameMismatchHelp}${moduleHelp}`);
        }

        if (globalThis.__classRegistrationLogger && typeof globalThis.__classRegistrationLogger.log === 'function') {
          globalThis.__classRegistrationLogger.log(className, 'loader');
        }
        
        this.state.loadedList.push({ className, url });
        this.loaded.add(className);
        return Ctor;
      })();

      this.loadingPromises.set(className, loadPromise);
      try {
        const result = await loadPromise;
        if (isTargetTrace) {
          console.log(`[RecursiLoader] [TRACE-ProjectEditorApp] Evaluation completed. Global registration status:`, typeof globalThis[className] !== 'undefined');
          console.groupEnd();
        }
        return result;
      } finally {
        this.loadingPromises.delete(className);
      }
    }

  static async run(appUrl, basePath, filesUrl) {
      if (!document.body) {
        await new Promise(r => window.addEventListener('DOMContentLoaded', r, { once: true }));
      }

      try {
        this.state.phase = 'Loading DomBasics';
        const domBasicsUrl = (basePath || '') + 'DomBasics.js';
        try {
          const DomBasicsClass = await this.loadClassFile(domBasicsUrl);
          if (DomBasicsClass && typeof DomBasicsClass.run === 'function') {
            DomBasicsClass.run();
          }
        } catch (e) {
          console.error(`[RecursiLoader] Failed to load optional DomBasics: ${domBasicsUrl}. Skipping over it.`, e);
        }

        if (filesUrl) {
          this.state.phase = `Fetching manifest: ${filesUrl}`;
          const absoluteBase = new URL(filesUrl.substring(0, filesUrl.lastIndexOf('/') + 1), document.baseURI || location.href).href;
          const filesText = await this.fetchText(filesUrl);
          const filesData = JSON.parse(filesText);
          this.state.filesJson = filesData;
          
          const isLocalhost = window.location.href.toLowerCase().includes('localhost') || 
                              window.location.href.toLowerCase().includes('127.0.0.1') ||
                              window.location.search.includes('dev=true') || 
                              window.location.search.includes('useDB=true');

          const traceTarget = 'ProjectEditorApp';
          console.group(`[RecursiLoader] [TRACE-${traceTarget}] Run loop initialized. Is Localhost/Dev mode?`, isLocalhost);
          console.log(`[RecursiLoader] [TRACE-${traceTarget}] Current global existence state of ${traceTarget}:`, typeof globalThis[traceTarget] !== 'undefined');

          const allPatches = await this._readVibesPatches();
          const hasPatches = allPatches.length > 0;

          if (filesData.bundle && !isLocalhost && !hasPatches) {
            console.log(`[RecursiLoader] [TRACE-${traceTarget}] Deciding to load bundle: ${filesData.bundle}`);
            this.state.phase = `Loading production bundle: ${filesData.bundle}`;
            try {
              const bundleUrl = new URL(filesData.bundle, absoluteBase).href;
              await this.loadClassFile(bundleUrl);
              console.log(`[RecursiLoader] [TRACE-${traceTarget}] Production bundle load complete.`);
              console.log(`[RecursiLoader] [TRACE-${traceTarget}] Post-bundle global existence of ${traceTarget}:`, typeof globalThis[traceTarget] !== 'undefined');
            } catch (e) {
              console.error(`[RecursiLoader] Failed to load production bundle: ${filesData.bundle}. Falling back to individual files.`, e);
              await this._loadIndividualDependencies(filesData, absoluteBase);
            }
          } else {
            console.log(`[RecursiLoader] [TRACE-${traceTarget}] Loading individual files.`);
            await this._loadIndividualDependencies(filesData, absoluteBase);
          }
          console.groupEnd();

          if (filesData.main && filesData.main.length > 0) {
            appUrl = new URL(filesData.main[0], absoluteBase).href;
          }
        }

        this.state.phase = `Loading main class: ${this.getClassNameFromUrl(appUrl)}`;
        let AppClass;
        try {
          AppClass = await this.loadClassFile(appUrl);
        } catch (e) {
          console.error(`[RecursiLoader] Failed to load main class: ${appUrl}.`, e);
        }
        if (!AppClass) {
          throw new Error('No class constructor could be resolved for main appUrl ' + appUrl);
        }

        const className = AppClass.name || this.getClassNameFromUrl(appUrl);
        const rootElement = document.getElementById('app-container') || document.body;

        this.state.phase = `Initializing runtime instance: ${className}`;
        
        const instance = new AppClass();
        globalThis[className.charAt(0).toLowerCase() + className.slice(1) + 'Instance'] = instance;
        RecursiLoader.activeAppInstance = instance;

        const standaloneEnv = {
          get container() {
            const inner = document.querySelector('[data-dialog-content="true"]');
            return inner || rootElement;
          },
          createContainer: (parent = rootElement) => {
            const element = document.createElement('div');
            element.className = 'uw-container-outer';
            Object.assign(element.style, {
              position: 'absolute',
              top: '0',
              left: '0',
              width: '100%',
              height: '100%',
              margin: '0',
              padding: '0',
              overflow: 'hidden',
              boxSizing: 'border-box'
            });
            element.setAttribute('data-vibes-element', 'true');
            element.setAttribute('data-dialog-element', 'true');

            const contentElement = document.createElement('div');
            contentElement.className = 'uw-container-inner';
            Object.assign(contentElement.style, {
              position: 'absolute',
              top: '0',
              left: '0',
              width: '100%',
              height: '100%',
              overflow: 'auto',
              boxSizing: 'border-box'
            });
            contentElement.setAttribute('data-dialog-content', 'true');

            element.appendChild(contentElement);
            parent.appendChild(element);

            return { element, contentElement };
          }
        };

        if (typeof instance.start === 'function') {
          await instance.start(standaloneEnv);
        } else if (typeof instance.run === 'function') {
          await instance.run(standaloneEnv);
        } else if (typeof instance.init === 'function') {
          await instance.init(standaloneEnv);
        } else {
          throw new Error(`The class "${className}" was loaded, but has no start(), run(), or init() methods to start execution.`);
        }

        const isStandalone = !globalThis.__vibesProjectEditorApp && !globalThis.vibesApp && !globalThis.projectApp && !globalThis._dev_projectEditorInstance;
        if (isStandalone && filesUrl) {
          this._injectVibeInButton(basePath, filesUrl);
        }

      } catch (error) {
        this.renderDiagnosticScreen(error, appUrl, filesUrl);
      }
    }

  

  static _readFromIDB(dbName, storeName, key) {
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(storeName)) {
              db.close();
              return resolve(null);
            }
            const tx = db.transaction(storeName, 'readonly');
            const getReq = tx.objectStore(storeName).get(key);
            getReq.onsuccess = () => {
              db.close();
              resolve(getReq.result);
            };
            getReq.onerror = () => {
              db.close();
              resolve(null);
            };
          };
          req.onerror = () => resolve(null);
        } catch(e) {
          resolve(null);
        }
      });
    }

  

  static _readVibesPatches() {
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open('vibes-patch-store');
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('patches')) {
              db.close();
              return resolve([]);
            }
            const tx = db.transaction('patches', 'readonly');
            const getReq = tx.objectStore('patches').getAll();
            getReq.onsuccess = () => {
              db.close();
              resolve(getReq.result || []);
            };
            getReq.onerror = () => {
              console.error(`[RecursiLoader] Error reading from 'patches'.`);
              db.close();
              resolve([]);
            };
          };
          req.onerror = () => {
            console.error(`[RecursiLoader] Failed to open 'vibes-patch-store' IDB.`);
            resolve([]);
          };
        } catch(e) {
          console.error(`[RecursiLoader] Exception opening IDB:`, e);
          resolve([]);
        }
      });
    }

  static async _applyAstPatches(code, patches, path) {
      if (typeof globalThis.acorn === 'undefined') {
        await new Promise(r => { 
          const s = document.createElement('script'); 
          s.src = 'https://cdn.jsdelivr.net/npm/acorn@8.11.3/dist/acorn.min.js'; 
          s.onload = r; 
          document.head.appendChild(s); 
        });
      }

      if (typeof globalThis.AstUtils === 'undefined') {
        const res = await fetch('/vibes/src/protocol/parsers/AstUtils.js');
        const text = await res.text();
        const script = document.createElement('script');
        script.textContent = text + '\n;globalThis.AstUtils = AstUtils;';
        document.head.appendChild(script);
      }
      
      if (typeof globalThis.ClientJSClassPatcher === 'undefined') {
        const res = await fetch('/vibes/src/protocol/ClientJSClassPatcher.js');
        const text = await res.text();
        const script = document.createElement('script');
        script.textContent = text + '\n;globalThis.ClientJSClassPatcher = ClientJSClassPatcher;';
        document.head.appendChild(script);
      }
      
      let patchedCode = code;
      const Patcher = globalThis.ClientJSClassPatcher;

      for (const patch of patches) {
         let className = patch.className;
         if (!className) {
             const astClasses = Patcher._listAllClasses(patchedCode);
             if (astClasses.length > 0) className = astClasses[0];
             else className = path.split('/').pop().replace(/\.js$/i, '');
         }
         
         const classBody = Patcher._findClassBody(patchedCode, className);
         if (!classBody) {
             continue;
         }
         
         const innerContent = patchedCode.slice(classBody.bodyStart, classBody.bodyEnd);
         const existing = Patcher._findMethodInSource(innerContent, patch.methodName);
         
         if (existing) {
             const absStart = classBody.bodyStart + existing.start;
             const absEnd = classBody.bodyStart + existing.end;
             patchedCode = patchedCode.slice(0, absStart) + patch.source.trim() + patchedCode.slice(absEnd);
         } else {
             patchedCode = patchedCode.slice(0, classBody.bodyEnd) + '\n  ' + patch.source.trim() + '\n' + patchedCode.slice(classBody.bodyEnd);
         }
      }
      
      return patchedCode;
    }

  

  static findGlobalClass(name) {
      if (!name) return null;
      if (globalThis[name]) return globalThis[name];
      
      const lower = name.toLowerCase().replace(/[-_]/g, '');
      for (const key of Object.getOwnPropertyNames(globalThis)) {
        if (key.toLowerCase().replace(/[-_]/g, '') === lower) {
          const val = globalThis[key];
          if (typeof val === 'function' || (val && typeof val === 'object')) {
            return val;
          }
        }
      }
      return null;
    }

  static _extractClassNames(code) {
      const names = [];
      const regex = /(?:^|\n)\s*(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/g;
      let match;
      while ((match = regex.exec(code)) !== null) {
        if (match[1]) names.push(match[1]);
      }
      return names;
    }

  static state = {
      phase: 'Bootstrap',
      activeUrl: null,
      loadedList: [],
      filesJson: null
    };

  static renderDiagnosticScreen(error, appUrl, filesUrl) {
      console.error('[RecursiLoader] Diagnosed boot failure:', error);
      
      const container = document.createElement('div');
      container.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 1000000;
        background: #0f1015;
        color: #e2e4f0;
        font-family: 'Segoe UI', system-ui, sans-serif;
        padding: 32px;
        overflow-y: auto;
        line-height: 1.6;
      `;

      const title = document.createElement('h1');
      title.style.cssText = 'color: #ff5555; font-size: 24px; margin-top: 0; margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 12px;';
      title.textContent = '🛑 Application Loader Diagnostics';
      container.appendChild(title);

      const desc = document.createElement('p');
      desc.style.cssText = 'font-size: 15px; color: #a0a5c0; margin-bottom: 24px;';
      desc.innerHTML = `RecursiLoader encountered a critical failure. See the system telemetry and recommended solutions below.`;
      container.appendChild(desc);

      const sectionTitle = (txt) => {
        const h = document.createElement('h3');
        h.style.cssText = 'color: #55aaff; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 24px; margin-bottom: 8px;';
        h.textContent = txt;
        return h;
      };

      container.appendChild(sectionTitle('Diagnostic Message'));
      const errBox = document.createElement('div');
      errBox.style.cssText = 'background: rgba(255, 85, 85, 0.08); border-left: 4px solid #ff5555; padding: 16px; border-radius: 4px; font-family: monospace; font-size: 14px; white-space: pre-wrap; margin-bottom: 16px;';
      errBox.textContent = error.message || String(error);
      container.appendChild(errBox);

      container.appendChild(sectionTitle('Loader Telemetry'));
      const telemetryTable = document.createElement('div');
      telemetryTable.style.cssText = 'display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; font-size: 13px; background: #181920; padding: 16px; border-radius: 6px; border: 1px solid #282a36;';
      telemetryTable.innerHTML = `
        <div style="color:#888;">Active Phase:</div><div>${this.state.phase}</div>
        <div style="color:#888;">Requested URL:</div><div style="font-family:monospace; color:#ffd59b;">${this.state.activeUrl || 'None'}</div>
        <div style="color:#888;">Main Class URL:</div><div style="font-family:monospace;">${appUrl || 'Not set'}</div>
        <div style="color:#888;">Manifest URL:</div><div style="font-family:monospace;">${filesUrl || 'None'}</div>
      `;
      container.appendChild(telemetryTable);

      container.appendChild(sectionTitle('Loading Execution Timeline'));
      const timelineBox = document.createElement('div');
      timelineBox.style.cssText = 'font-size: 13px; background: #12131a; padding: 12px 16px; border-radius: 6px; border: 1px solid #222; font-family: monospace;';
      
      const timelineHtml = [];
      if (this.state.loadedList.length === 0) {
        timelineHtml.push('<span style="color:#ff5555;">... Failed before any classes were loaded.</span>');
      } else {
        this.state.loadedList.forEach(item => {
          timelineHtml.push(`<span style="color:#50fa7b;">... Loaded class:</span> <b style="color:#fff;">${item.className}</b> (${item.url})`);
        });
      }
      timelineHtml.push(`<span style="color:#ffb86c; animation: blink 1s infinite;">▶ Current Step:</span> ${this.state.phase}`);
      timelineBox.innerHTML = timelineHtml.join('<br>');
      container.appendChild(timelineBox);

      if (error.stack) {
        container.appendChild(sectionTitle('Debugger Stack Trace'));
        const stackBox = document.createElement('pre');
        stackBox.style.cssText = 'background: #090a0d; color: #8890b0; padding: 16px; border-radius: 6px; font-size: 12px; overflow: auto; border: 1px solid #1c1d24;';
        stackBox.textContent = error.stack;
        container.appendChild(stackBox);
      }

      document.body.appendChild(container);
    }

  static async _loadIndividualDependencies(filesData, absoluteBase) {
      this.state.phase = 'Loading Library Dependencies';
      for (const lib of (filesData.library || [])) {
        try {
          let libUrl = lib;
          if (!libUrl.startsWith('/')) libUrl = '/library/' + libUrl;
          if (libUrl.endsWith('.css')) {
            await this.loadCss(new URL(libUrl, absoluteBase).href);
          } else {
            if (!libUrl.endsWith('.js')) libUrl += '.js';
            await this.loadClassFile(new URL(libUrl, absoluteBase).href);
          }
        } catch (e) {
          console.error(`[RecursiLoader] Failed to load library dependency: ${lib}. Skipping over it.`, e);
        }
      }

      this.state.phase = 'Loading Third Party Assets';
      for (const tp of (filesData.thirdParty || [])) {
        try {
          const url = new URL(tp, absoluteBase).href;
          if (url.endsWith('.css')) await this.loadCss(url);
          else await this.loadClassFile(url);
        } catch (e) {
          console.error(`[RecursiLoader] Failed to load third party asset: ${tp}. Skipping over it.`, e);
        }
      }

      this.state.phase = 'Loading Local Supporting Classes';
      for (const loc of (filesData.local || [])) {
        try {
          const url = new URL(loc, absoluteBase).href;
          if (url.endsWith('.css')) await this.loadCss(url);
          else await this.loadClassFile(url);
        } catch (e) {
          console.error(`[RecursiLoader] Failed to load local supporting class: ${loc}. Skipping over it.`, e);
        }
      }
    }

  static _injectVibeInButton(basePath, filesUrl) {
          const btn = document.createElement('button');
          btn.id = 'recursi-vibe-in-button';
          btn.textContent = '🔌 Edit code with LLM'; // Updated title
          btn.title = 'Surgically bring this app into the Vibes editor workspace';
          btn.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 20px;
            z-index: 2147483647;
            padding: 10px 16px;
            border-radius: 20px;
            border: 1px solid rgba(0, 191, 165, 0.4);
            background: rgba(14, 20, 32, 0.9);
            color: #00bfa5;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 10px rgba(0, 191, 165, 0.2);
            transition: all 0.2s ease;
            outline: none;
          `;
          
          btn.onmouseover = () => {
            btn.style.background = 'rgba(0, 191, 165, 0.15)';
            btn.style.color = '#fff';
            btn.style.borderColor = 'rgba(0, 191, 165, 0.8)';
            btn.style.boxShadow = '0 4px 24px rgba(0,0,0,0.6), 0 0 16px rgba(0, 191, 165, 0.5)';
            btn.style.transform = 'translateY(-1px)';
          };
          
          btn.onmouseout = () => {
            btn.style.background = 'rgba(14, 20, 32, 0.9)';
            btn.style.color = '#00bfa5';
            btn.style.borderColor = 'rgba(0, 191, 165, 0.4)';
            btn.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5), 0 0 10px rgba(0, 191, 165, 0.2)';
            btn.style.transform = 'translateY(0)';
          };

          btn.onclick = async (e) => {
            e.stopPropagation();
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.style.cursor = 'wait';
            btn.textContent = '🔌 Loading Editor...';
            try {
              await this.vibeIn(basePath, filesUrl);
              btn.remove();
            } catch (err) {
              console.error('[RecursiLoader] Vibe In failed:', err);
              btn.textContent = '❌ Load Failed';
              btn.style.color = '#ff6b6b';
              btn.style.borderColor = 'rgba(255, 107, 107, 0.4)';
              btn.disabled = false;
              btn.style.cursor = 'pointer';
              btn.style.opacity = '1';
              setTimeout(() => {
                btn.textContent = '🔌 Edit code with LLM';
                btn.style.color = '#00bfa5';
                btn.style.borderColor = 'rgba(0, 191, 165, 0.4)';
              }, 4000);
            }
          };

          document.body.appendChild(btn);
        }

  static async vibeIn(basePath, filesUrl) {
          const parts = filesUrl.split('/').filter(Boolean);
          const projectName = parts[0] === 'vibes' ? 'vibes' : parts[0] || 'app';

          const manifestText = await this.fetchText('/vibes/files.json');
          const manifest = JSON.parse(manifestText);

          this.state.phase = 'Loading Vibes Library';
          for (const lib of (manifest.library || [])) {
            let libUrl = lib;
            if (!libUrl.startsWith('/')) libUrl = '/library/' + libUrl;
            if (libUrl.endsWith('.css')) {
              await this.loadCss(new URL(libUrl, window.location.origin).href);
            } else {
              if (!libUrl.endsWith('.js')) libUrl += '.js';
              await this.loadClassFile(new URL(libUrl, window.location.origin).href);
            }
          }

          this.state.phase = 'Loading Vibes Classes';
          for (const loc of (manifest.local || [])) {
            const url = new URL(loc, window.location.origin + '/vibes/').href;
            if (url.endsWith('.css')) await this.loadCss(url);
            else await this.loadClassFile(url);
          }

          this.state.phase = 'Loading Vibes Editor';
          const mainUrl = new URL(manifest.main[0], window.location.origin + '/vibes/').href;
          const EditorClass = await this.loadClassFile(mainUrl);

          if (!EditorClass) {
            throw new Error('ProjectEditorApp failed to load.');
          }

          let vibesContainer = document.getElementById('app-container');
          if (!vibesContainer) {
            vibesContainer = document.createElement('div');
            vibesContainer.id = 'app-container';
            document.body.appendChild(vibesContainer);
          }

          const url = new URL(window.location);
          url.searchParams.set('project', projectName);
          window.history.pushState({}, '', url.toString());

          const vibesApp = new EditorClass();
          globalThis.vibesApp = vibesApp;
          globalThis.projectApp = vibesApp;
          globalThis._dev_projectEditorInstance = vibesApp;
          
          vibesApp.projectName = projectName;
          vibesApp.isStaticMode = true;
          vibesApp._vibeInActive = true;
          vibesApp._vibeInApp = this.activeAppInstance;

          if (vibesApp.uiManager && typeof vibesApp.uiManager.setUIMode === 'function') {
            vibesApp.uiManager.setUIMode('indexeddb');
          }

          await vibesApp.projectLoader.bootForStaticEdit(projectName);
        }
}

globalThis.RecursiLoader = RecursiLoader;