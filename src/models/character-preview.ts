import * as THREE from 'three';
import { CHARACTER_MODEL_PREVIEW } from '../config';
import { buildModelGrid, VOXEL_MODELS } from './registry';
import { buildRuntimeModelDetails, disposeRuntimeModel } from './runtime-details';
import { buildGridGeometry } from './voxel-builder';
import { PreviewLoadState } from './preview-load-state';

type LoadedModel = { geometry: THREE.BufferGeometry };

/** One lightweight renderer serves both mutually-exclusive character screens.
 * Geometry loads are cached; only the currently displayed model owns runtime
 * detail meshes/materials, which are disposed when it is replaced. */
export class CharacterModelPreview {
  private readonly canvas = document.createElement('canvas');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(
    CHARACTER_MODEL_PREVIEW.fieldOfViewDeg,
    1,
    CHARACTER_MODEL_PREVIEW.nearPlane,
    CHARACTER_MODEL_PREVIEW.farPlane,
  );
  private readonly modelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly modelCache = new Map<string, Promise<LoadedModel>>();
  private readonly loadState = new PreviewLoadState<LoadedModel>();
  private currentRoot: THREE.Group | null = null;
  private currentRuntimeDetails: THREE.Group | null = null;
  private currentHost: HTMLElement | null = null;
  private frameHandle: number | null = null;
  private previousFrameMs = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;

  constructor() {
    this.canvas.className = 'character-model-canvas';
    this.canvas.dataset.rendering = 'false';
    this.canvas.setAttribute('role', 'img');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.scene.background = new THREE.Color(CHARACTER_MODEL_PREVIEW.backgroundColor);
    this.scene.add(new THREE.HemisphereLight(
      CHARACTER_MODEL_PREVIEW.hemisphereSkyColor,
      CHARACTER_MODEL_PREVIEW.hemisphereGroundColor,
      CHARACTER_MODEL_PREVIEW.hemisphereIntensity,
    ));
    const key = new THREE.DirectionalLight(
      CHARACTER_MODEL_PREVIEW.keyLightColor,
      CHARACTER_MODEL_PREVIEW.keyLightIntensity,
    );
    key.position.set(...CHARACTER_MODEL_PREVIEW.keyLightPosition);
    this.scene.add(key);
    this.resizeObserver = new ResizeObserver(() => this.resizeAndRender());
    this.intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.target === this.canvas && entry.isIntersecting)) this.start();
      else this.suspend();
    });
    this.resizeObserver.observe(this.canvas);
    this.intersectionObserver.observe(this.canvas);
  }

  attach(host: HTMLElement, modelKey: string, characterName: string): void {
    if (this.currentHost && this.currentHost !== host) {
      this.currentHost.removeAttribute('data-preview-state');
      this.currentHost.removeAttribute('aria-busy');
    }
    this.currentHost = host;
    host.replaceChildren(this.canvas);
    this.canvas.setAttribute('aria-label', `${characterName} 3D model preview`);
    this.canvas.dataset.modelKey = modelKey;
    this.loadState.begin(() => this.loadModel(modelKey), {
      loading: () => {
        this.suspend();
        this.releaseCurrentModel();
        host.dataset.previewState = 'loading';
        host.setAttribute('aria-busy', 'true');
      },
      ready: (loaded) => {
        if (this.canvas.dataset.modelKey !== modelKey || !this.replaceModel(modelKey, loaded)) {
          this.suspend();
          this.releaseCurrentModel();
          host.dataset.previewState = 'unavailable';
          host.setAttribute('aria-busy', 'false');
          this.canvas.setAttribute('aria-label', `${characterName} 3D model preview unavailable`);
          return;
        }
        host.dataset.previewState = 'ready';
        host.setAttribute('aria-busy', 'false');
        this.resizeAndRender();
        this.start();
      },
      failed: () => {
        this.suspend();
        this.releaseCurrentModel();
        host.dataset.previewState = 'unavailable';
        host.setAttribute('aria-busy', 'false');
        this.canvas.setAttribute('aria-label', `${characterName} 3D model preview unavailable`);
      },
    });
  }

  private loadModel(modelKey: string): Promise<LoadedModel> {
    const cached = this.modelCache.get(modelKey);
    if (cached) return cached;
    const pending = (async () => {
      const def = VOXEL_MODELS[modelKey];
      if (!def) throw new Error(`Unknown character model '${modelKey}'`);
      return { geometry: buildGridGeometry(await buildModelGrid(modelKey), def.voxelSize) };
    })();
    this.modelCache.set(modelKey, pending);
    void pending.then(undefined, () => this.modelCache.delete(modelKey));
    return pending;
  }

  private replaceModel(modelKey: string, loaded: LoadedModel): boolean {
    this.releaseCurrentModel();
    const def = VOXEL_MODELS[modelKey];
    if (!def) return false;
    const root = new THREE.Group();
    root.rotation.y = CHARACTER_MODEL_PREVIEW.startingRotationRad;
    root.add(new THREE.Mesh(loaded.geometry, this.modelMaterial));
    const runtimeDetails = buildRuntimeModelDetails(
      def,
      (color) => new THREE.MeshLambertMaterial({ color }),
    );
    if (runtimeDetails) root.add(runtimeDetails);
    this.currentRoot = root;
    this.currentRuntimeDetails = runtimeDetails;
    this.scene.add(root);
    this.frameCamera(root);
    return true;
  }

  private frameCamera(root: THREE.Object3D): void {
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const distance = Math.max(
      CHARACTER_MODEL_PREVIEW.minimumCameraDistance,
      Math.max(size.x, size.y, size.z) * CHARACTER_MODEL_PREVIEW.cameraDistanceScale,
    );
    this.camera.position.set(
      center.x,
      center.y + size.y * CHARACTER_MODEL_PREVIEW.cameraHeightRatio,
      center.z + distance,
    );
    this.camera.lookAt(center.x, center.y + size.y * CHARACTER_MODEL_PREVIEW.targetHeightRatio, center.z);
  }

  private resizeAndRender(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CHARACTER_MODEL_PREVIEW.maxDevicePixelRatio));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  private start(): void {
    if (this.frameHandle !== null || !this.currentRoot || this.canvas.getClientRects().length === 0) return;
    this.previousFrameMs = performance.now();
    const frame = (now: number): void => {
      this.frameHandle = null;
      if (!this.currentRoot || this.canvas.getClientRects().length === 0) return;
      const deltaS = Math.min((now - this.previousFrameMs) / 1000, 0.1);
      this.previousFrameMs = now;
      this.currentRoot.rotation.y += CHARACTER_MODEL_PREVIEW.spinRadiansPerSecond * deltaS;
      this.renderer.render(this.scene, this.camera);
      this.frameHandle = requestAnimationFrame(frame);
    };
    this.canvas.dataset.rendering = 'true';
    this.frameHandle = requestAnimationFrame(frame);
  }

  private suspend(): void {
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.canvas.dataset.rendering = 'false';
  }

  private releaseCurrentModel(): void {
    if (this.currentRoot) this.scene.remove(this.currentRoot);
    if (this.currentRuntimeDetails) disposeRuntimeModel(this.currentRuntimeDetails);
    this.currentRoot = null;
    this.currentRuntimeDetails = null;
  }

  dispose(): void {
    this.loadState.dispose();
    this.suspend();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.releaseCurrentModel();
    for (const loaded of this.modelCache.values()) {
      void loaded.then(({ geometry }) => geometry.dispose(), () => undefined);
    }
    this.modelCache.clear();
    this.modelMaterial.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.currentHost?.removeAttribute('data-preview-state');
    this.currentHost?.removeAttribute('aria-busy');
    this.currentHost = null;
  }
}
