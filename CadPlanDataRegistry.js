class CadPlanDataRegistry {
  static _cache = new Map();

  static findShallowestBlock(rootElement, targetKey, maxDepth = 6) {
    if (!rootElement || !targetKey) return null;
    const cleanKey = String(targetKey).trim().toLowerCase();

    if (this._cache.has(cleanKey)) {
      const cachedEl = this._cache.get(cleanKey);
      if (cachedEl && cachedEl.isConnected && (rootElement.contains(cachedEl) || rootElement === cachedEl)) {
        return cachedEl;
      }
      this._cache.delete(cleanKey);
    }

    const queue = [[rootElement, 0]];
    while (queue.length > 0) {
      const [current, depth] = queue.shift();
      if (current instanceof Element) {
        const blockId = (current.getAttribute('data-block') ||
                         current.getAttribute('data-block-id') ||
                         current.getAttribute('data-id') ||
                         current.id || '').toLowerCase();

        if (blockId === cleanKey) {
          this._cache.set(cleanKey, current);
          return current;
        }

        if (depth < maxDepth && current.children && current.children.length > 0) {
          for (let i = 0; i < current.children.length; i++) {
            const child = current.children[i];
            if (!child.hasAttribute('data-style-exclude') && !child.classList.contains('aardvark_highlight')) {
              queue.push([child, depth + 1]);
            }
          }
        }
      }
    }
    return null;
  }

  static getElementContext(element, rootBoundary = document.body) {
      if (!element || !(element instanceof Element)) return null;

      let curr = element;
      let blockId = null;
      let sectionId = null;
      let pageId = null;
      let visibility = null;
      let depth = 0;

      while (curr && curr !== rootBoundary && depth < 32) {
        if (!blockId) {
          blockId = curr.getAttribute('data-block') ||
                    curr.getAttribute('data-block-id') ||
                    curr.getAttribute('data-id') ||
                    (curr.id && !curr.id.startsWith('uw') && !curr.id.startsWith('comp-') ? curr.id : null);
        }
        if (!sectionId) {
          sectionId = curr.getAttribute('data-section');
        }
        if (!pageId) {
          pageId = curr.getAttribute('data-page') || curr.getAttribute('data-page-id');
        }
        if (!visibility) {
          visibility = curr.getAttribute('data-visibility');
        }
        curr = curr.parentElement;
        depth++;
      }

      const domPageId = (typeof document !== 'undefined')
        ? document.querySelector('[data-page-id], [data-page]')?.getAttribute('data-page-id') ||
          document.querySelector('[data-page-id], [data-page]')?.getAttribute('data-page')
        : null;
      const activeReaderPage = globalThis._activeDocumentReader?.currentPageId || null;
      const hashPage = (typeof window !== 'undefined' && window.location.hash)
        ? window.location.hash.replace(/^#\/?/, '').split('/')[0]
        : null;

      return {
        blockId: blockId || `auto_${element.tagName.toLowerCase()}_${Date.now() % 10000}`,
        sectionId: sectionId || 'general',
        pageId: pageId || activeReaderPage || domPageId || hashPage || 'overview',
        visibility: visibility || 'public',
        tagName: element.tagName.toLowerCase()
      };
    }
  static clearCache() {
    this._cache.clear();
  }
}

globalThis.CadPlanDataRegistry = CadPlanDataRegistry;
globalThis.DocumentDataRegistry = CadPlanDataRegistry;
if (typeof module !== 'undefined' && module.exports) module.exports = CadPlanDataRegistry;