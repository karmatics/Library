// DomBasics.js - Foundational DOM & SVG Element Builder
(function(global) {
  function makeElement(type, ...args) {
    if (typeof document === 'undefined') return null;

    var tag = type || 'div';
    var isSvg = tag.indexOf('svg:') === 0 || [
      'svg', 'path', 'circle', 'rect', 'polygon', 'polyline', 'line', 'g',
      'image', 'ellipse', 'defs', 'filter', 'feGaussianBlur', 'text', 'tspan',
      'mask', 'pattern', 'clipPath', 'use', 'symbol', 'linearGradient', 'radialGradient', 'stop'
    ].includes(tag.toLowerCase());
    var cleanTag = tag.replace(/^svg:/i, '');

    var el = isSvg
      ? document.createElementNS('http://www.w3.org/2000/svg', cleanTag)
      : document.createElement(cleanTag);

    function processChild(child) {
      if (child === null || child === undefined) return;

      if (Array.isArray(child)) {
        // If array represents an element specification: ['svg:rect', attrs, ...children]
        if (child.length > 0 && typeof child[0] === 'string') {
          var subEl = makeElement.apply(null, child);
          if (subEl) el.appendChild(subEl);
        } else {
          // List of children
          for (var j = 0; j < child.length; j++) {
            processChild(child[j]);
          }
        }
      } else if (child instanceof Node) {
        el.appendChild(child);
      } else if (typeof child === 'string' || typeof child === 'number') {
        el.appendChild(document.createTextNode(String(child)));
      }
    }

    for (var i = 0; i < args.length; i++) {
      var arg = args[i];
      if (arg === null || arg === undefined) continue;

      if (arg instanceof Node || typeof arg === 'string' || typeof arg === 'number') {
        processChild(arg);
      } else if (Array.isArray(arg)) {
        processChild(arg);
      } else if (typeof arg === 'object') {
        for (var key in arg) {
          if (!Object.prototype.hasOwnProperty.call(arg, key)) continue;
          var val = arg[key];
          if (val === null || val === undefined) continue;

          if (key.indexOf('on') === 0 && typeof val === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), val);
          } else if (key === 'style') {
            if (typeof val === 'object') {
              Object.assign(el.style, val);
            } else {
              el.style.cssText = String(val);
            }
          } else if (key === 'className' || key === 'class') {
            if (isSvg) el.setAttribute('class', String(val));
            else el.className = String(val);
          } else if (key === 'textContent' || key === 'innerText') {
            el.textContent = String(val);
          } else if (key === 'innerHTML') {
            el.innerHTML = String(val);
          } else if (key === 'href' || key === 'xlink:href') {
            el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', String(val));
            el.setAttribute('href', String(val));
          } else if (key in el && !isSvg) {
            try { el[key] = val; } catch (e) { el.setAttribute(key, val); }
          } else {
            el.setAttribute(key, String(val));
          }
        }
      }
    }

    return el;
  }

  function applyCss(cssString, id, doc) {
    var targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc) return null;
    var styleId = id || 'dom-basics-dynamic-style';
    var existing = targetDoc.getElementById(styleId);
    if (existing) {
      existing.textContent = cssString;
      return existing;
    }
    var style = targetDoc.createElement('style');
    style.id = styleId;
    style.textContent = cssString;
    (targetDoc.head || targetDoc.documentElement).appendChild(style);
    return style;
  }

  global.makeElement = makeElement;
  global.applyCss = applyCss;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeElement, applyCss };
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
