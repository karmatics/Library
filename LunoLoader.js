class LunoLoader {
  constructor() {}

  static loadedScripts = new Set();
  static loadedStyles = new Set();

  static isStaticHosting() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        var host = window.location.hostname || '';
        return host.endsWith('github.io') || host.endsWith('pages.dev') || window.location.protocol === 'file:';
      }
    } catch (e) {}
    return false;
  }

  static getLibraryRoot() {
    if (LunoLoader.isStaticHosting()) {
      return './Library/';
    }
    return '/Library/';
  }

  static loadStyle(cssPath) {
    return new Promise(function(resolve, reject) {
      var isStatic = LunoLoader.isStaticHosting();
      var fullUrl = cssPath;
      if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        fullUrl = isStatic ? (cssPath.startsWith('/') ? ('.' + cssPath) : cssPath) : (cssPath.startsWith('/') ? cssPath : ('/' + cssPath));
      }
      if (LunoLoader.loadedStyles.has(fullUrl)) return resolve({ url: fullUrl, cached: true });

      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fullUrl + (fullUrl.indexOf('?') === -1 ? '?v=' : '&v=') + Date.now();
      link.onload = function() { LunoLoader.loadedStyles.add(fullUrl); resolve({ url: fullUrl, cached: false }); };
      link.onerror = function() { reject(new Error('Failed to load stylesheet: ' + cssPath)); };
      document.head.appendChild(link);
    });
  }

  static loadScript(jsPath) {
    return new Promise(function(resolve, reject) {
      var isStatic = LunoLoader.isStaticHosting();
      var fullUrl = jsPath;
      if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        fullUrl = isStatic ? (jsPath.startsWith('/') ? ('.' + jsPath) : jsPath) : (jsPath.startsWith('/') ? jsPath : ('/' + jsPath));
      }
      if (LunoLoader.loadedScripts.has(fullUrl)) return resolve({ url: fullUrl, cached: true });

      var script = document.createElement('script');
      script.src = fullUrl + (fullUrl.indexOf('?') === -1 ? '?v=' : '&v=') + Date.now();
      script.async = false;
      script.onload = function() { LunoLoader.loadedScripts.add(fullUrl); resolve({ url: fullUrl, cached: false }); };
      script.onerror = function() { reject(new Error('Failed to load script: ' + jsPath)); };
      document.head.appendChild(script);
    });
  }

  /**
   * ⚙️ METHOD: applyPatchLog(projectName)
   * Plays back LunoPatchLog.html on refresh with visible telemetry reporting.
   */
  static async applyPatchLog(projectName) {
    try {
      var targetProj = projectName || 'Luno';
      var res = await fetch('/api/fs/read?path=LunoPatchLog.html&project=' + encodeURIComponent(targetProj) + '&v=' + Date.now());
      var data = await res.json();
      if (!res.ok || !data || !data.content || !data.content.trim()) return;

      var parser = globalThis.LunoPayloadParser || globalThis.LunoContainerParser;
      if (!parser || typeof parser.parsePatchLog !== 'function') return;

      var parsed = parser.parsePatchLog(data.content);
      var files = parsed.files || [];

      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f || !f.filePath) continue;

        var norm = f.filePath.replace(/\\/g, '/').replace(/^\/+/, '');
        var isForTarget = (targetProj === 'Luno') 
          ? (norm.startsWith('Luno/') || !norm.includes('/') || norm.startsWith('app/') || norm.startsWith('browser/') || norm.startsWith('core/') || norm.startsWith('docs/') || norm.startsWith('test/'))
          : (norm.startsWith(targetProj + '/') || norm.startsWith('Library/'));

        if (!isForTarget) continue;

        // 1. Class Method Patch Playback
        if (f.methodSpec && f.content) {
          var spec = f.methodSpec.replace(/^(?:globalThis|window)\./, '').trim();
          var isProto = spec.includes('.prototype.');
          var className = '';
          var memberName = '';

          if (isProto) {
            var pParts = spec.split('.prototype.');
            className = pParts[0].trim();
            memberName = pParts[1].trim();
          } else if (spec.includes('.')) {
            var dParts = spec.split('.');
            memberName = dParts.pop().trim();
            className = dParts.join('.').trim();
          } else {
            memberName = spec;
          }

          var fnCode = f.content.trim();
          if (fnCode.endsWith(';')) fnCode = fnCode.slice(0, -1).trim();

          var braceIdx = fnCode.indexOf('{');
          var headerSig = braceIdx !== -1 ? fnCode.slice(0, braceIdx) : fnCode;
          var isAsync = /\basync\b/.test(headerSig) || fnCode.includes('await ');

          var cleanBody = fnCode.replace(/^(?:static\s+)?(?:async\s+)?/, '');
          var parenIdx = cleanBody.indexOf('(');
          var paramsAndBody = (parenIdx !== -1) ? cleanBody.slice(parenIdx) : ('() ' + cleanBody);

          var fnExpr = (isAsync ? 'async function' : 'function') + paramsAndBody;

          var targetObj = isProto ? (globalThis[className] && globalThis[className].prototype) : globalThis[className];
          if (targetObj) {
            try {
              var evalFn = new Function('return (' + fnExpr + ');')();
              targetObj[memberName] = evalFn;
            } catch(evalErr) {
              if (typeof LunoPlaybackLogger !== 'undefined') {
                LunoPlaybackLogger.error('Patch Playback Error', spec + ': ' + evalErr.message);
              }
            }
          }
        } 
        // 2. Full Script Patch Playback
        else if (f.tagName === 'script' && f.content) {
          try {
            var s = document.createElement('script');
            s.textContent = f.content;
            document.head.appendChild(s);
          } catch(e) {}
        }
        // 3. Style Patch Playback
        else if (f.tagName === 'style' && f.content) {
          try {
            var st = document.createElement('style');
            st.textContent = f.content;
            document.head.appendChild(st);
          } catch(e) {}
        }
      }
    } catch(err) {
      if (typeof LunoPlaybackLogger !== 'undefined') {
        LunoPlaybackLogger.error('Patch Log Ingestion Error', err.message);
      }
    }
  }

  static async loadApp(containerId) {
    var targetContainer = typeof containerId === 'string'
      ? document.getElementById(containerId)
      : (containerId || document.getElementById('app-root') || document.body);

    var lunoMeta = {};
    try {
      var res = await fetch('luno.json?v=' + Date.now());
      if (res.ok) lunoMeta = await res.json();
    } catch(e){}

    var libRoot = LunoLoader.getLibraryRoot();
    var libs = Array.isArray(lunoMeta.library) ? lunoMeta.library : [];
    var main = Array.isArray(lunoMeta.main) ? lunoMeta.main : [];
    var styles = Array.isArray(lunoMeta.styles) ? lunoMeta.styles : [];

    for (var s = 0; s < styles.length; s++) {
      try { await LunoLoader.loadStyle(styles[s]); } catch(e){}
    }
    for (var l = 0; l < libs.length; l++) {
      try { await LunoLoader.loadScript(libRoot + libs[l].replace(/^Library\//i, '').replace(/^\/+/, '')); } catch(e){}
    }
    for (var m = 0; m < main.length; m++) {
      try { await LunoLoader.loadScript(main[m]); } catch(e){}
    }

    // Play back all patches from LunoPatchLog.html before running the entrypoint!
    try {
      await LunoLoader.applyPatchLog(lunoMeta.name || 'Luno');
    } catch(e){}

    var entryClass = (lunoMeta.entrypoint && lunoMeta.entrypoint.class) || lunoMeta.mainClass;
    var entryMethod = (lunoMeta.entrypoint && lunoMeta.entrypoint.method) || 'run';

    if (entryClass && typeof window[entryClass] === 'function') {
      var AppCls = window[entryClass];
      var envCtx = { container: targetContainer, config: lunoMeta, isStatic: LunoLoader.isStaticHosting() };
      if (typeof AppCls[entryMethod] === 'function') {
        await AppCls[entryMethod](envCtx);
      } else {
        var inst = new AppCls();
        if (typeof inst[entryMethod] === 'function') await inst[entryMethod](envCtx);
        else if (typeof inst.run === 'function') await inst.run(envCtx);
      }
    }
  }
}

globalThis.LunoLoader = LunoLoader;
if (typeof module !== 'undefined' && module.exports) module.exports = LunoLoader;