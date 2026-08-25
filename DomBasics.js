/**
 * 📚 LUNO SHARED LIBRARY: DomBasics.js
 * Foundational DOM & SVG creation primitives with recursive array support.
 */

function makeElement(type, ...args) {
  let element;

  if (typeof type === 'string' && type.startsWith('svg:')) {
    element = document.createElementNS('http://www.w3.org/2000/svg', type.substring(4));
  } else if (type === 'svg') {
    element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  } else {
    element = document.createElement(type || 'div');
  }

  const attributeMappings = { className: 'class', htmlFor: 'for' };
  const isSvg = typeof type === 'string' && (type.startsWith('svg:') || type === 'svg');

  for (const arg of args) {
    if (arg === null || arg === undefined) continue;

    if (typeof arg === 'string' || typeof arg === 'number') {
      element.appendChild(document.createTextNode(String(arg)));
    } else if (arg instanceof Node) {
      element.appendChild(arg);
    } else if (Array.isArray(arg)) {
      arg.forEach((child) => {
        if (Array.isArray(child)) {
          if (child.length > 0) element.appendChild(makeElement(...child));
        } else if (child instanceof Node) {
          element.appendChild(child);
        } else if (typeof child === 'string' || typeof child === 'number') {
          element.appendChild(document.createTextNode(String(child)));
        }
      });
    } else if (typeof arg === 'object') {
      Object.entries(arg).forEach(([key, value]) => {
        if (value === null || value === undefined) return;

        if (key === 'style' && typeof value === 'object') {
          Object.assign(element.style, value);
        } else if (key === 'style' && typeof value === 'string') {
          element.style.cssText = value;
        } else if (key === 'textContent' || (key === 'innerHTML' && !isSvg)) {
          element[key] = value;
        } else if (key.startsWith('on') && typeof value === 'function') {
          element.addEventListener(key.substring(2).toLowerCase(), value);
        } else if (typeof value === 'boolean') {
          const attrName = attributeMappings[key] || key;
          if (value) element.setAttribute(attrName, '');
          else element.removeAttribute(attrName);
        } else {
          element.setAttribute(attributeMappings[key] || key, String(value));
        }
      });
    }
  }

  return element;
}

function applyCss(cssString, id, doc) {
  const styleId = 'cssId_' + (id || 'default_' + Date.now());
  const targetDocument = doc || (typeof document !== 'undefined' ? document : null);
  if (!targetDocument || !targetDocument.head) return null;

  let styleElement = targetDocument.getElementById(styleId);

  if (!styleElement) {
    styleElement = targetDocument.createElement('style');
    styleElement.id = styleId;
    (targetDocument.head || targetDocument.getElementsByTagName('head')[0]).appendChild(styleElement);
  }

  if (styleElement.textContent !== cssString) {
    styleElement.textContent = cssString || '';
  }
  return styleElement;
}

globalThis.makeElement = makeElement;
globalThis.applyCss = applyCss;

if (typeof window !== 'undefined') {
  window.makeElement = makeElement;
  window.applyCss = applyCss;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { makeElement, applyCss };
}
