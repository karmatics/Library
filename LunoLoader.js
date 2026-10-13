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

  static async loadApp(containerId) {
    try {
      var cId = containerId || 'app-container';
      var meta = null;

      // Determine current app base path
      var base = window.location.origin + window.location.pathname;
      if (!base.endsWith('/')) {
        base = base.substring(0, base.lastIndexOf('/') + 1);
      }

      try {
        var res = await fetch(base + 'luno.json?v=' + Date.now());
        if (res.ok) meta = await res.json();
      } catch (e) {}

      if (!meta) {
        try {
          var resFallback = await fetch('./luno.json?v=' + Date.now());
          if (resFallback.ok) meta = await resFallback.json();
        } catch (e2) {}
      }

      if (!meta) {
        throw new Error('Could not load luno.json for application.');
      }

      // 1. Load shared library dependencies
      var libs = Array.isArray(meta.library) ? meta.library : [];
      for (var i = 0; i < libs.length; i++) {
        var libUrl = LunoLoader.resolveScriptUrl('Library/' + libs[i]);
        await LunoLoader.loadScript(libUrl);
      }

      // 2. Load styles
      var styles = Array.isArray(meta.styles) ? meta.styles : [];
      for (var s = 0; s < styles.length; s++) {
        var styleUrl = LunoLoader.resolveScriptUrl(styles[s]);
        LunoLoader.loadStylesheet(styleUrl);
      }

      // 3. Load main scripts relative to app directory
      var scripts = Array.isArray(meta.main) ? meta.main : [];
      for (var j = 0; j < scripts.length; j++) {
        var scriptUrl = LunoLoader.resolveScriptUrl(scripts[j]);
        await LunoLoader.loadScript(scriptUrl);
      }

      // 4. Apply patch log if present
      try {
        await LunoLoader.applyPatchLog(meta.name);
      } catch (plErr) {}

      // 5. Mount entrypoint
      var entry = meta.entrypoint || {};
      var clsName = entry.class || meta.mainClass || 'Main';
      var mthName = entry.method || 'run';

      var EntryClass = globalThis[clsName] || window[clsName];
      if (!EntryClass) {
        throw new Error('Entrypoint class [' + clsName + '] not found in loaded scope.');
      }

      var container = document.getElementById(cId) || document.body;
      var inst = new EntryClass();

      if (typeof inst[mthName] === 'function') {
        await inst[mthName]({ container: container, meta: meta });
      } else if (typeof EntryClass[mthName] === 'function') {
        await EntryClass[mthName]({ container: container, meta: meta });
      }

    } catch (err) {
      console.error('[LunoLoader Exception]', err);
      var box = document.getElementById(containerId || 'app-container') || document.body;
      box.innerHTML = '<div style="padding:1.5rem; background:#2c080a; color:#ff7b72; border:2px solid #f85149; border-radius:8px; font-family:monospace; margin:1rem;"><h3>⚠️ Application Load Error</h3><pre>' + err.message + '\n' + (err.stack || '') + '</pre></div>';
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

  static resolveScriptUrl(scriptPath) {
    if (!scriptPath || typeof scriptPath !== 'string') return '';
    var clean = scriptPath.replace(/\\/g, '/').trim();

    // If already absolute HTTP(S), leave as is
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }

    // Shared library files always point to /Library/
    if (clean.startsWith('Library/') || clean.startsWith('/Library/') || clean.startsWith('library/') || clean.startsWith('/library/')) {
      var libPath = clean.replace(/^\/?(?:Library|library)\//, '');
      var account = (window.location.hostname.endsWith('.github.io'))
        ? window.location.hostname.split('.')[0]
        : 'karmatics';

      return window.location.hostname.endsWith('.github.io')
        ? 'https://' + account + '.github.io/Library/' + libPath
        : '/Library/' + libPath;
    }

    // App-specific scripts resolve strictly relative to the current page/repository path
    // (e.g. /accuCad/js/AccuDraw.js instead of /js/AccuDraw.js)
    clean = clean.replace(/^\/+/, '');

    var base = window.location.origin + window.location.pathname;
    if (!base.endsWith('/')) {
      base = base.substring(0, base.lastIndexOf('/') + 1);
    }
    return base + clean;
  }

  static loadScript(url) {
    return new Promise((resolve, reject) => {
      // Check if script already loaded
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        resolve();
        return;
      }

      var script = document.createElement('script');
      script.src = url;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => {
        // Retry once without query params if failed
        var cleanUrl = url.split('?')[0];
        if (cleanUrl !== url) {
          script.src = cleanUrl;
        } else {
          reject(new Error('Failed to load script: ' + url));
        }
      };
      document.head.appendChild(script);
    });
  }
}

globalThis.LunoLoader = LunoLoader;
if (typeof module !== 'undefined' && module.exports) module.exports = LunoLoader;