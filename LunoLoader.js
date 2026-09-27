class LunoLoader {
  static loadedUrls = new Set();

  static RESERVED_WORDS = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
    'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
    'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
    'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
    'let', 'static', 'enum', 'await', 'null', 'true', 'false', 'undefined'
  ]);

  static isStaticHosting() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const proto = window.location.protocol || '';
        if (proto === 'file:') return true;
        const host = (window.location.hostname || '').toLowerCase();
        if (host.endsWith('github.io') || host.endsWith('pages.dev') || host.endsWith('vercel.app')) return true;
      }
    } catch(e) {}
    return false;
  }

  static getLibraryBaseUrl() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.hostname) {
        const host = window.location.hostname.toLowerCase();
        if (host.endsWith('.github.io')) {
          const user = host.split('.')[0];
          return `https://${user}.github.io/Library/`;
        }
      }
    } catch(e) {}
    return '/Library/';
  }

  static async fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return await res.text();
  }

  static extractClassNames(codeText) {
    if (!codeText || typeof codeText !== 'string') return [];
    const classNames = [];
    const matches = codeText.matchAll(/(?:^|\n|\r)\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)/g);
    for (const m of matches) {
      const name = m[1];
      if (name && !LunoLoader.RESERVED_WORDS.has(name)) {
        classNames.push(name);
      }
    }
    return classNames;
  }

  static loadScriptTag(url, classNames = []) {
    const cleanUrl = url.split('?')[0];
    if (LunoLoader.loadedUrls.has(cleanUrl)) {
      return Promise.resolve({ success: true, url, cached: true });
    }
    LunoLoader.loadedUrls.add(cleanUrl);

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = false;

      script.onload = () => {
        for (const cls of classNames) {
          if (!LunoLoader.RESERVED_WORDS.has(cls)) {
            try {
              const val = eval(cls);
              if (typeof val !== 'undefined') {
                globalThis[cls] = val;
                window[cls] = val;
              }
            } catch (e) {}
          }
        }
        resolve({ success: true, url });
      };

      script.onerror = () => {
        console.warn(`[LunoLoader] Error loading script: ${url}`);
        resolve({ success: false, url });
      };

      document.head.appendChild(script);
    });
  }

  static async loadApp(containerId = 'app-container', manifestPath = 'luno.json') {
      console.log(`[LunoLoader] Booting application via ${manifestPath}...`);

      let meta = {};
      try {
        const manifestText = await LunoLoader.fetchText(manifestPath);
        meta = JSON.parse(manifestText);
      } catch (e) {
        try {
          const altText = await LunoLoader.fetchText('/vibes/luno.json');
          meta = JSON.parse(altText);
        } catch (e2) {
          console.error('[LunoLoader] Failed to fetch manifest:', e2);
          return;
        }
      }

      const libBase = LunoLoader.getLibraryBaseUrl();

      // 1. Mandatory Preload: Ensure DomBasics.js is loaded and initialized BEFORE anything else
      if (typeof makeElement === 'undefined' || typeof applyCss === 'undefined') {
        try {
          await LunoLoader.loadScriptTag(libBase + 'DomBasics.js', ['DomBasics']);
        } catch (e) {}
      }
      if (typeof DomBasics !== 'undefined' && typeof DomBasics.run === 'function') {
        DomBasics.run();
      }

      // 2. Load Library dependencies in order
      const libFiles = [].concat(meta.library || []);
      for (const lib of libFiles) {
        const cleanLib = lib.replace(/^(?:Library|library)\//i, '');
        if (cleanLib === 'DomBasics.js') continue;
        const libUrl = libBase + cleanLib;
        let classNames = [];
        try {
          const code = await LunoLoader.fetchText(libUrl);
          classNames = LunoLoader.extractClassNames(code);
        } catch (e) {}
        await LunoLoader.loadScriptTag(libUrl, classNames);
      }

      // 3. Load Local supporting files using root-anchored paths
      const localFiles = [].concat(meta.local || meta.files || []);
      for (const relFile of localFiles) {
        if (relFile.endsWith('.css')) {
          try {
            const cssUrl = LunoLoader.resolveScriptUrl(relFile);
            const cssText = await LunoLoader.fetchText(cssUrl);
            if (typeof applyCss === 'function') applyCss(cssText);
          } catch(e) {}
          continue;
        }

        if (relFile.endsWith('.js') || relFile.endsWith('.mjs')) {
          const scriptUrl = LunoLoader.resolveScriptUrl(relFile);
          let classNames = [];
          try {
            const code = await LunoLoader.fetchText(scriptUrl);
            classNames = LunoLoader.extractClassNames(code);
          } catch (e) {}
          await LunoLoader.loadScriptTag(scriptUrl, classNames);
        }
      }

      // 4. Load Main files using root-anchored paths
      const mainFiles = [].concat(meta.main || []);
      for (const mainFile of mainFiles) {
        if (mainFile.endsWith('.js') || mainFile.endsWith('.mjs')) {
          const scriptUrl = LunoLoader.resolveScriptUrl(mainFile);
          let classNames = [];
          try {
            const code = await LunoLoader.fetchText(scriptUrl);
            classNames = LunoLoader.extractClassNames(code);
          } catch (e) {}
          await LunoLoader.loadScriptTag(scriptUrl, classNames);
        }
      }

      // 5. Instantiate Entrypoint class
      const entrypoint = meta.entrypoint || {};
      const entryClass = entrypoint.class || meta.mainClass || (mainFiles[0] ? mainFiles[0].split('/').pop().replace(/\.js$/, '') : 'App');
      const entryMethod = entrypoint.method || 'run';

      let TargetClass = globalThis[entryClass] || window[entryClass];
      if (!TargetClass) {
        try {
          TargetClass = eval(entryClass);
          if (TargetClass) globalThis[entryClass] = TargetClass;
        } catch (e) {}
      }

      if (!TargetClass) {
        LunoLoader.renderEmergencyCockpit(containerId, entryClass, meta);
        return;
      }

      const container = document.getElementById(containerId) || document.body;
      try {
        const appInstance = new TargetClass();
        if (typeof appInstance[entryMethod] === 'function') {
          await appInstance[entryMethod]({ container, meta });
        } else if (typeof TargetClass[entryMethod] === 'function') {
          await TargetClass[entryMethod]({ container, meta });
        }
        console.log(`[LunoLoader] ✅ Successfully launched [${entryClass}.${entryMethod}()]!`);
      } catch (runErr) {
        console.error(`[LunoLoader] Launch error in ${entryClass}:`, runErr);
        LunoLoader.renderDiagnosticScreen(containerId, runErr);
      }
    }
  static renderEmergencyCockpit(containerId, missingClass, meta) {
    const container = document.getElementById(containerId) || document.body;
    container.innerHTML = `
      <div style="padding: 1.5rem; background: #161b22; border: 2px solid #da3633; border-radius: 10px; max-width: 680px; margin: 2rem auto; font-family: monospace; color: #c9d1d9; box-shadow: 0 8px 32px rgba(0,0,0,0.8);">
        <h3 style="color: #ff7b72; margin-top: 0;">❌ Failed to Launch Application</h3>
        <p style="font-size: 13px;">Entrypoint class <strong style="color: #00f2fe;">[${missingClass}]</strong> was not found in global scope.</p>
        <p style="font-size: 12px; color: #8b949e;">Loaded ${meta.local ? meta.local.length : 0} local file(s) and ${meta.library ? meta.library.length : 0} library module(s).</p>
      </div>
    `;
  }

  static renderDiagnosticScreen(containerId, err) {
    const container = document.getElementById(containerId) || document.body;
    container.innerHTML = `
      <div style="padding: 1.5rem; background: #2c080a; border: 2px solid #f85149; border-radius: 10px; max-width: 680px; margin: 2rem auto; font-family: monospace; color: #ff7b72;">
        <h3 style="margin-top: 0;">⚠️ Application Initialization Error</h3>
        <pre style="background: #0d1117; padding: 1rem; border-radius: 6px; overflow-x: auto; color: #ff7b72; font-size: 12px;">${err.stack || err.message}</pre>
      </div>
    `;
  }

  static resolveScriptUrl(rawPath) {
      if (!rawPath || typeof rawPath !== 'string') return '';
      if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) return rawPath;

      let clean = rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();

      // Prevent duplicate prefix nesting (e.g. /Luno/Luno/ or /vibes/vibes/)
      if (typeof window !== 'undefined' && window.location) {
        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        const currentDir = pathSegments[0] || '';
        if (currentDir && clean.startsWith(currentDir + '/' + currentDir + '/')) {
          clean = clean.slice(currentDir.length + 1);
        }
      }

      // Anchor to domain root to avoid relative directory accumulation
      return '/' + clean;
    }
}

globalThis.LunoLoader = LunoLoader;
if (typeof module !== 'undefined' && module.exports) module.exports = LunoLoader;