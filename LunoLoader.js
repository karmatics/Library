/**
 * 📚 LunoLoader.js - Universal Multi-Repo / GitHub Pages Dependency Loader
 * Resolves shared dependencies across local dev and GitHub Pages deployments with fork fallback:
 * 1. Local server: /Library/...
 * 2. User fork: https://<user>.github.io/Library/...
 * 3. Karmatics root: https://karmatics.github.io/Library/...
 */
class LunoLoader {
  static defaultAccount = 'karmatics';
  static _libraryBaseUrl = null;

  static isStaticHosting() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        var proto = window.location.protocol || '';
        if (proto === 'file:') return true;
        var host = (window.location.hostname || '').toLowerCase();
        if (host.endsWith('github.io') || host.endsWith('pages.dev') || host.endsWith('vercel.app')) return true;
        if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.')) return false;
        return true;
      }
    } catch(e) {}
    return false;
  }

  static getLibraryBaseUrl() {
      if (LunoLoader._libraryBaseUrl) return LunoLoader._libraryBaseUrl;

      // 1. Check document.currentScript (valid during sync execution)
      try {
        var cs = document.currentScript;
        if (cs && cs.src && cs.src.includes('LunoLoader.js')) {
          var idx = cs.src.lastIndexOf('/');
          if (idx !== -1) {
            LunoLoader._libraryBaseUrl = cs.src.slice(0, idx + 1);
            return LunoLoader._libraryBaseUrl;
          }
        }
      } catch (e) {}

      // 2. Scan DOM for script tag containing LunoLoader.js (valid during DOMContentLoaded)
      try {
        var sTag = document.querySelector('script[src*="LunoLoader.js"]');
        if (sTag && sTag.src) {
          var sIdx = sTag.src.lastIndexOf('/');
          if (sIdx !== -1) {
            LunoLoader._libraryBaseUrl = sTag.src.slice(0, sIdx + 1);
            return LunoLoader._libraryBaseUrl;
          }
        }
      } catch (e) {}

      // 3. Local network hosting
      if (!LunoLoader.isStaticHosting()) {
        LunoLoader._libraryBaseUrl = '/Library/';
        return '/Library/';
      }

      // 4. GitHub Pages hosting
      var host = (window.location.hostname || '').toLowerCase();
      var user = host.endsWith('.github.io') ? host.split('.')[0] : LunoLoader.defaultAccount;
      LunoLoader._libraryBaseUrl = 'https://' + user + '.github.io/Library/';
      return LunoLoader._libraryBaseUrl;
    }
  static resolveLibraryAsset(assetPath) {
    var clean = (assetPath || '').replace(/^(?:Library|library)\//, '').trim();
    var primaryBase = LunoLoader.getLibraryBaseUrl();
    var fallbackBase = 'https://' + LunoLoader.defaultAccount + '.github.io/Library/';

    return {
      cleanName: clean,
      primaryUrl: primaryBase + clean,
      fallbackUrl: fallbackBase + clean
    };
  }

  static loadScript(url, fallbackUrl) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = false;
      s.onload = function() { resolve({ success: true, url: url }); };
      s.onerror = function() {
        if (fallbackUrl && fallbackUrl !== url) {
          console.warn('[LunoLoader] Primary load failed for ' + url + ', trying fallback ' + fallbackUrl);
          var fb = document.createElement('script');
          fb.src = fallbackUrl;
          fb.async = false;
          fb.onload = function() { resolve({ success: true, url: fallbackUrl, fallbackUsed: true }); };
          fb.onerror = function(err) { reject(new Error('Failed to load script from ' + url + ' and fallback ' + fallbackUrl)); };
          document.head.appendChild(fb);
        } else {
          reject(new Error('Failed to load script from ' + url));
        }
      };
      document.head.appendChild(s);
    });
  }

  static loadStyle(url, fallbackUrl) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    if (fallbackUrl && fallbackUrl !== url) {
      link.onerror = function() {
        link.onerror = null;
        link.href = fallbackUrl;
      };
    }
    document.head.appendChild(link);
  }

  static async loadApp(containerTarget) {
      var targetEl = typeof containerTarget === 'string'
        ? document.getElementById(containerTarget)
        : (containerTarget || document.getElementById('app-container') || document.body);

      try {
        // 1. Fetch luno.json manifest
        var res = await fetch('./luno.json?v=' + Date.now());
        if (!res.ok) {
          throw new Error('Could not load luno.json manifest (HTTP ' + res.status + ')');
        }
        var meta = await res.json();
        var projName = (meta.name || '').trim();

        // 2. Load styles
        var styles = [].concat(meta.styles || []);
        for (var s = 0; s < styles.length; s++) {
          var stylePath = styles[s];
          if (stylePath.startsWith('Library/') || stylePath.startsWith('library/')) {
            var asset = LunoLoader.resolveLibraryAsset(stylePath);
            LunoLoader.loadStyle(asset.primaryUrl, asset.fallbackUrl);
          } else {
            var cleanStyle = stylePath.replace(/^\/+/, '');
            if (projName && cleanStyle.startsWith(projName + '/')) {
              cleanStyle = cleanStyle.slice(projName.length + 1);
            }
            LunoLoader.loadStyle('./' + cleanStyle);
          }
        }

        // 3. Load library dependencies with fork-to-karmatics fallback
        var libs = [].concat(meta.library || []);
        for (var l = 0; l < libs.length; l++) {
          var libPath = libs[l];
          var asset = LunoLoader.resolveLibraryAsset(libPath);
          await LunoLoader.loadScript(asset.primaryUrl, asset.fallbackUrl);
        }

        // 4. Load main project scripts (with folder-fallback resilience)
        var mainScripts = [].concat(meta.main || []);
        for (var m = 0; m < mainScripts.length; m++) {
          var scriptPath = mainScripts[m].replace(/^\/+/, '');
          if (projName && scriptPath.startsWith(projName + '/')) {
            scriptPath = scriptPath.slice(projName.length + 1);
          }
          try {
            await LunoLoader.loadScript('./' + scriptPath);
          } catch (scriptErr) {
            // If script failed and was in app/ or docs/, test alternative directory before failing
            var parts = scriptPath.split('/');
            var fileName = parts.pop();
            var altFolders = ['app', 'docs', 'core', 'browser'];
            var recovered = false;
            for (var af = 0; af < altFolders.length; af++) {
              var altPath = './' + altFolders[af] + '/' + fileName;
              if (altPath !== ('./' + scriptPath)) {
                try {
                  await LunoLoader.loadScript(altPath);
                  console.warn('[LunoLoader] Recovered misplaced script "' + scriptPath + '" from "' + altPath + '"');
                  recovered = true;
                  break;
                } catch(e) {}
              }
            }
            if (!recovered) {
              console.error('[LunoLoader] Failed loading non-recoverable script:', scriptPath);
              throw scriptErr;
            }
          }
        }

        // 5. Apply any pending patches from LunoPatchLog.html if present
        await LunoLoader.applyPatchLog();

        // 6. Mount application entrypoint
        var entrypoint = meta.entrypoint || {};
        var entryClass = entrypoint.class || meta.mainClass || 'App';
        var entryMethod = entrypoint.method || 'run';

        var TargetClass = globalThis[entryClass];
        if (!TargetClass) {
          throw new Error('Entrypoint class [' + entryClass + '] was not found in global scope.');
        }

        var appInstance = new TargetClass();
        if (typeof appInstance[entryMethod] === 'function') {
          await appInstance[entryMethod]({ container: targetEl, meta: meta });
        } else if (typeof TargetClass[entryMethod] === 'function') {
          await TargetClass[entryMethod]({ container: targetEl, meta: meta });
        } else {
          console.log('[LunoLoader] Instantiated ' + entryClass + ', no run() method to invoke.');
        }

        console.log('[LunoLoader] Successfully launched [' + (meta.name || entryClass) + '].');
      } catch(err) {
        console.error('[LunoLoader Exception]', err);
        if (targetEl) {
          targetEl.innerHTML = [
            '<div style="padding:1.5rem; background:#2c080a; color:#ff7b72; border:2px solid #f85149; border-radius:10px; font-family:monospace; margin:1rem auto; max-width:680px; box-shadow:0 8px 32px rgba(0,0,0,0.8);">',
            '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">',
            '    <h3 style="margin:0; color:#ff7b72;">❌ Failed to Launch Application</h3>',
            '    <span style="font-size:0.72rem; background:#161b22; padding:0.2rem 0.5rem; border-radius:4px; border:1px solid #da3633;">Luno Emergency Cockpit</span>',
            '  </div>',
            '  <p style="font-size:0.85rem; margin:0 0 0.75rem 0; color:#c9d1d9;">' + err.message + '</p>',
            '  <div style="background:#0d1117; border:1px solid #da3633; border-radius:8px; padding:0.75rem; display:flex; flex-direction:column; gap:0.5rem;">',
            '    <strong style="color:#00f2fe; font-size:0.78rem;">⚡ Emergency Recovery: Paste LLM Payload Fix Below</strong>',
            '    <textarea id="emergency-recovery-input" placeholder="Paste HTML Container Payload here to apply directly to storage..." style="width:100%; height:110px; background:#070a13; color:#7ee787; border:1px solid #30363d; border-radius:6px; padding:0.5rem; font-family:monospace; font-size:0.75rem; outline:none; box-sizing:border-box; resize:vertical;"></textarea>',
            '    <div style="display:flex; gap:0.4rem; justify-content:flex-end;">',
            '      <button id="btn-emergency-paste" style="padding:0.45rem 0.85rem; background:#238636; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.78rem; font-family:monospace;">📥 Paste from Clipboard & Apply</button>',
            '      <button id="btn-emergency-apply" style="padding:0.45rem 0.85rem; background:#8257e5; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:0.78rem; font-family:monospace;">⚡ Apply Payload Text</button>',
            '    </div>',
            '  </div>',
            '</div>'
          ].join('\n');

          var execEmergency = async function(text) {
            if (!text || !text.trim()) return;
            try {
              var res = await fetch('/api/save?project=' + encodeURIComponent((meta && meta.name) || 'Luno'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rawText: text })
              });
              var data = await res.json();
              if (data && data.success) {
                location.reload();
              } else {
                alert('Save failed: ' + ((data && data.error) || 'Storage error'));
              }
            } catch(e) {
              alert('Save error: ' + e.message);
            }
          };

          var btnP = document.getElementById('btn-emergency-paste');
          if (btnP) {
            btnP.onclick = async function() {
              try {
                var t = await navigator.clipboard.readText();
                if (t) execEmergency(t);
              } catch(e) {
                var inp = document.getElementById('emergency-recovery-input');
                if (inp && inp.value) execEmergency(inp.value);
                else alert('Paste code into textarea first.');
              }
            };
          }

          var btnA = document.getElementById('btn-emergency-apply');
          if (btnA) {
            btnA.onclick = function() {
              var inp = document.getElementById('emergency-recovery-input');
              if (inp && inp.value) execEmergency(inp.value);
              else alert('Textarea is empty.');
            };
          }
        }
      }
    }
  static async applyPatchLog() {
    try {
      var res = await fetch('./LunoPatchLog.html?v=' + Date.now());
      if (res.ok) {
        var html = await res.text();
        if (html && html.trim()) {
          var div = document.createElement('div');
          div.innerHTML = html;
          var scripts = div.querySelectorAll('script');
          for (var i = 0; i < scripts.length; i++) {
            var sc = scripts[i];
            var code = sc.textContent;
            if (code && code.trim()) {
              var execScript = document.createElement('script');
              execScript.textContent = code;
              document.head.appendChild(execScript);
            }
          }
        }
      }
    } catch(e) {}
  }
}

globalThis.LunoLoader = LunoLoader;
if (typeof module !== 'undefined' && module.exports) module.exports = LunoLoader;