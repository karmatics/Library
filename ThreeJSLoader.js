class ThreeJSLoader {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = Object.assign(
      {
        cameraPos: null,
        enableControls: false,
        useThickLines: false,
        useRaycaster: false,
        commonLoaders: false,
        hdrPath: '/assets/venice_sunset_1k.hdr',
        environment: true,  // Beautiful HDR reflections ON by default
        lighting: true,     // Balanced studio lighting ON by default
        fov: 50
      },
      options
    );

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = null;
    this.modules = {};
    this.loaders = {};
    this.studioLights = [];
    this.onUpdateCallback = null;
    this._onResizeBound = this._onResize.bind(this);
    this._envTexture = null;
  }

  add(obj) {
    if (this.scene && obj) this.scene.add(obj);
    return this;
  }

  remove(obj) {
    if (this.scene && obj) this.scene.remove(obj);
    return this;
  }

  static isReady() {
    return typeof window !== 'undefined' && Boolean(window.THREE);
  }

  async init(containerElement) {
    const CDN_BASE = 'https://cdn.jsdelivr.net/npm/three@0.153.0';
    const FALLBACK_CDN = 'https://unpkg.com/three@0.153.0';

    const THREE_URL = CDN_BASE + '/build/three.module.js';
    const ADDONS = CDN_BASE + '/examples/jsm';

    try {
      if (window.THREE && window.THREE.WebGLRenderer) {
        this.THREE = window.THREE;
      } else {
        try {
          this.THREE = await import(THREE_URL);
        } catch(cdnErr) {
          this.THREE = await import(FALLBACK_CDN + '/build/three.module.js');
        }
        window.THREE = this.THREE;
        globalThis.THREE = this.THREE;
      }
    } catch (e) {
      console.error('[ThreeJSLoader] THREE import/reuse FAILED:', e);
      throw e;
    }

    const THREE = this.THREE;

    const loadAddon = async (subPath) => {
      const blobUrl = await this._fetchAndRewrite(ADDONS + subPath, THREE_URL, 1);
      return await import(blobUrl);
    };

    const jobs = [];

    // 1. Controls
    if (this.options.enableControls) {
      jobs.push(
        loadAddon('/controls/OrbitControls.js').then((m) => {
          this.modules.OrbitControls = m.OrbitControls;
          window.OrbitControls = m.OrbitControls;
          globalThis.OrbitControls = m.OrbitControls;
        })
      );
    }

    // 2. Thick Lines (LineGeometry, LineMaterial, Line2 for accuCad, TriBlob)
    if (this.options.useThickLines) {
      jobs.push(
        loadAddon('/lines/LineSegmentsGeometry.js').then((m) => {
          this.modules.LineSegmentsGeometry = m.LineSegmentsGeometry;
          window.LineSegmentsGeometry = m.LineSegmentsGeometry;
          globalThis.LineSegmentsGeometry = m.LineSegmentsGeometry;
        })
      );
      jobs.push(
        loadAddon('/lines/LineGeometry.js').then((m) => {
          this.modules.LineGeometry = m.LineGeometry;
          window.LineGeometry = m.LineGeometry;
          globalThis.LineGeometry = m.LineGeometry;
        })
      );
      jobs.push(
        loadAddon('/lines/LineMaterial.js').then((m) => {
          this.modules.LineMaterial = m.LineMaterial;
          window.LineMaterial = m.LineMaterial;
          globalThis.LineMaterial = m.LineMaterial;
        })
      );
      jobs.push(
        loadAddon('/lines/Line2.js').then((m) => {
          this.modules.Line2 = m.Line2;
          window.Line2 = m.Line2;
          globalThis.Line2 = m.Line2;
        })
      );
    }

    // 3. Always include RGBELoader & GLTFLoader so environment maps are effortless
    jobs.push(
      loadAddon('/loaders/GLTFLoader.js').then((m) => {
        this.modules.GLTFLoader = m.GLTFLoader;
        window.GLTFLoader = m.GLTFLoader;
        globalThis.GLTFLoader = m.GLTFLoader;
      })
    );
    jobs.push(
      loadAddon('/loaders/RGBELoader.js').then((m) => {
        this.modules.RGBELoader = m.RGBELoader;
        window.RGBELoader = m.RGBELoader;
        globalThis.RGBELoader = m.RGBELoader;
      })
    );

    await Promise.all(jobs);

    const container =
      containerElement ||
      document.getElementById(this.containerId) ||
      document.body;

    this.scene = new THREE.Scene();

    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width || container.clientWidth || 640);
    const height = Math.max(1, rect.height || container.clientHeight || 360);

    const fov = this.options.fov || 50;
    this.camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 2000);

    if (this.options.cameraPos) {
      this.camera.position.set(
        this.options.cameraPos.x,
        this.options.cameraPos.y,
        this.options.cameraPos.z
      );
    } else {
      this.camera.position.z = 5;
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // ACESFilmic tone mapping with neutral exposure
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.renderer.setSize(width, height, false);
    container.appendChild(this.renderer.domElement);

    if (this.options.enableControls && this.modules.OrbitControls) {
      this.controls = new this.modules.OrbitControls(
        this.camera,
        this.renderer.domElement
      );
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
    }

    if (this.options.useRaycaster) this.raycaster = new THREE.Raycaster();
    if (this.modules.GLTFLoader) this.loaders.gltf = new this.modules.GLTFLoader();

    // 4. Balanced Default Studio Lighting (Never overexposed, easily toggled off)
    if (this.options.lighting !== false) {
      this.setupStudioLighting();
    }

    // 5. Automatic Environment Map (Default ON for beautiful reflections)
    if (this.options.environment !== false) {
      const targetHdr = this.options.hdrPath || '/assets/venice_sunset_1k.hdr';
      this.loadEnvironment(targetHdr).catch(err => {
        console.warn('[ThreeJSLoader] Auto environment map load note:', err.message);
      });
    }

    window.addEventListener('resize', this._onResizeBound, false);

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this._onResize();
      });
      this._resizeObserver.observe(container);
    }

    this.renderer.setAnimationLoop(() => {
      if (this.controls) this.controls.update();
      if (this.onUpdateCallback) {
        try { this.onUpdateCallback(); } catch(e) {}
      }
      this.renderer.render(this.scene, this.camera);
    });

    return this;
  }

  setupStudioLighting() {
    if (!this.scene || !this.THREE) return;
    const THREE = this.THREE;

    this.clearStudioLighting();

    // Soft, natural fill that leaves colors saturated without washed-out pastels
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.45);
    hemi.position.set(0, 20, 0);
    this.scene.add(hemi);
    this.studioLights.push(hemi);

    const key = new THREE.DirectionalLight(0xfffaed, 0.55);
    key.position.set(5, 10, 7);
    this.scene.add(key);
    this.studioLights.push(key);

    const fill = new THREE.DirectionalLight(0x58a6ff, 0.25);
    fill.position.set(-6, 5, -4);
    this.scene.add(fill);
    this.studioLights.push(fill);

    return this.studioLights;
  }

  clearStudioLighting() {
    if (this.scene && this.studioLights.length > 0) {
      this.studioLights.forEach(l => this.scene.remove(l));
      this.studioLights = [];
    }
  }

  setLighting(enable = true) {
    if (enable) {
      this.setupStudioLighting();
    } else {
      this.clearStudioLighting();
    }
  }

  async loadEnvironment(url) {
    if (!this.scene || !this.renderer) return;

    // Auto-remap dead recursi URLs or generic paths to verified local HDR
    let targetUrl = url || '/assets/venice_sunset_1k.hdr';
    if (targetUrl.includes('recursi.dev') || targetUrl.includes('venice_sunset_1k.hdr')) {
      targetUrl = '/assets/venice_sunset_1k.hdr';
    }

    if (this.modules.RGBELoader) {
      const pmremGenerator = new this.THREE.PMREMGenerator(this.renderer);
      pmremGenerator.compileEquirectangularShader();

      return new Promise((resolve, reject) => {
        new this.modules.RGBELoader().load(
          targetUrl,
          (texture) => {
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            this.scene.environment = envMap;
            this._envTexture = envMap;
            texture.dispose();
            pmremGenerator.dispose();
            resolve(envMap);
          },
          undefined,
          reject
        );
      });
    }
  }

  clearEnvironment() {
    if (this.scene) {
      this.scene.environment = null;
      this._envTexture = null;
    }
  }

  setEnvironment(enable = true) {
    if (enable) {
      this.loadEnvironment('/assets/venice_sunset_1k.hdr');
    } else {
      this.clearEnvironment();
    }
  }

  async _fetchAndRewrite(url, threeUrl, depth = 0) {
    this._rewriteCache = this._rewriteCache || new Map();
    if (this._rewriteCache.has(url)) {
      return await this._rewriteCache.get(url);
    }

    let resolver, rejecter;
    const promise = new Promise((res, rej) => {
      resolver = res;
      rejecter = rej;
    });
    this._rewriteCache.set(url, promise);

    try {
      let cleanFetchUrl = url.replace(/https?:\/\/recursi\.dev\/thirdparty\/three-js-r153\/examples\/jsm/g, 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm');
      cleanFetchUrl = cleanFetchUrl.replace(/https?:\/\/recursi\.dev\/thirdparty\/three-js-r153\/build/g, 'https://cdn.jsdelivr.net/npm/three@0.153.0/build');

      const res = await fetch(cleanFetchUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + cleanFetchUrl);
      let code = await res.text();

      code = code.replace(/from ['"]three['"]/g, `from '${threeUrl}'`);

      const relRegex = /from ['"](\.\.?\/[^'"]+)['"]/g;
      const relatives = [];
      let m;
      while ((m = relRegex.exec(code)) !== null) {
        if (!relatives.includes(m[1])) relatives.push(m[1]);
      }

      for (const rel of relatives) {
        const absUrl = new URL(rel, cleanFetchUrl).href;
        const childBlobUrl = await this._fetchAndRewrite(
          absUrl,
          threeUrl,
          depth + 1
        );
        const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        code = code.replace(
          new RegExp(`from '${escaped}'`, 'g'),
          `from '${childBlobUrl}'`
        );
        code = code.replace(
          new RegExp(`from "${escaped}"`, 'g'),
          `from '${childBlobUrl}'`
        );
      }

      const blob = new Blob([code], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      resolver(blobUrl);
      return blobUrl;
    } catch (err) {
      rejecter(err);
      throw err;
    }
  }

  _onResize() {
    if (!this.renderer || !this.camera) return;
    const container = this.renderer.domElement.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const w = rect.width || container.clientWidth;
    const h = rect.height || container.clientHeight;
    if (!w || !h) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  resize(width, height) {
    this._onResize();
    return true;
  }

  enableOrbit(enabled = true) {
    if (this.controls) this.controls.enabled = !!enabled;
    return true;
  }

  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      if (this.renderer.domElement && this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(
          this.renderer.domElement
        );
      }
      this.renderer.dispose();
    }
    window.removeEventListener('resize', this._onResizeBound);
  }
}

globalThis.ThreeJSLoader = ThreeJSLoader;
window.ThreeJSLoader = ThreeJSLoader;
if (typeof module !== "undefined" && module.exports) module.exports = ThreeJSLoader;
