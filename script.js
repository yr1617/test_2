import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    ENGINE DESTROY & CLEAN
════════════════════════════════════════ */
if (window.animFrameId) {
  cancelAnimationFrame(window.animFrameId);
  window.animFrameId = null;
}
if (window.threeRenderer) {
  window.threeRenderer.dispose();
  const domCanvas = document.querySelector('#model-canvas');
  if (domCanvas) {
    const gl = domCanvas.getContext('webgl2') || domCanvas.getContext('webgl');
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  window.threeRenderer = null;
}
window.threeScene    = null;
window.threeCamera   = null;
window.modelAnchor   = null;
window.__threeInitialized = false;

/* ════════════════════════════════════════
    DOM REFS
════════════════════════════════════════ */
const landing      = document.querySelector('.landing');
const landingCanvas= document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas  = document.querySelector('#model-canvas');
const follower     = document.querySelector('.cursor-follower');
const navLinks     = document.querySelectorAll('.topnav a[data-target]');
const sections     = [];

const eliminateFakeModels = () => {
  ['#crystal-fallback','#codex-3d','.fallback-layer','.crystal-backup','#three-debug-hud'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.style.setProperty('display','none','important');
  });
};

/* ════════════════════════════════════════
    마우스 트래킹
════════════════════════════════════════ */
const mouse = { x: 0, y: 0 };
const pointer = {
  x: window.innerWidth * 0.5,  y: window.innerHeight * 0.5,
  tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5
};
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    수정사항: 누워있지 않고 똑바로 정면을 보도록 각도축 강제 교정
════════════════════════════════════════ */
const baseRotation = { x: 0.0, y: 0.55 };
const rotState     = { x: 0.0, y: 0.55 };

let autoRotY = 0.55;
let isHoveringModel = false;

/* ════════════════════════════════════════
    LANDING CANVAS BACKGROUND
════════════════════════════════════════ */
const setupLandingCanvas = () => {
  if (!landing || !landingCanvas) return null;
  const ctx = landingCanvas.getContext('2d');
  if (!ctx) return null;
  let state = { width: 0, height: 0, dpr: 1 };

  const resize = () => {
    const rect = landing.getBoundingClientRect();
    state.width  = rect.width;
    state.height = rect.height;
    state.dpr    = Math.min(window.devicePixelRatio || 1, 1.5);
    landingCanvas.width  = Math.max(1, Math.floor(rect.width  * state.dpr));
    landingCanvas.height = Math.max(1, Math.floor(rect.height * state.dpr));
    landingCanvas.style.width  = `${rect.width}px`;
    landingCanvas.style.height = `${rect.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  };

  const draw = () => {
    const { width, height } = state;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const rect = landing.getBoundingClientRect();
    const px = pointer.x - rect.left;
    const py = pointer.y - rect.top;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, Math.max(width, height) * 0.52);
    glow.addColorStop(0,   'rgba(255,255,255,0.09)');
    glow.addColorStop(0.3, 'rgba(160,110,255,0.04)');
    glow.addColorStop(1,   'rgba(16,16,18,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  };

  resize();
  return { resize, draw };
};

let landingCanvasCtrl = null;

const updateLandingVars = () => {
  if (!landing) return;
  const rect = landing.getBoundingClientRect();
  const x = ((pointer.x - rect.left) / Math.max(rect.width,  1)) * 100;
  const y = ((pointer.y - rect.top)  / Math.max(rect.height, 1)) * 100;
  landing.style.setProperty('--pointer-x', `${clamp01(x/100)*100}%`);
  landing.style.setProperty('--pointer-y', `${clamp01(y/100)*100}%`);
};

/* ════════════════════════════════════════
    수정사항: 실버 메탈릭 질감을 살리기 위한 주변 고대비 스튜디오 반사광 형성
════════════════════════════════════════ */
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = null;

  const topLight = new THREE.Mesh(
    new THREE.BoxGeometry(25, 0.5, 25),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  topLight.position.set(0, 10, 0);
  scene.add(topLight);

  const leftPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 15, 15),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  leftPanel.position.set(-8, 2, 0);
  scene.add(leftPanel);

  const rightPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 15, 15),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  rightPanel.position.set(8, 2, 0);
  scene.add(rightPanel);

  const frontPanel = new THREE.Mesh(
    new THREE.BoxGeometry(15, 15, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  frontPanel.position.set(0, 2, 8);
  scene.add(frontPanel);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(scene);
  pmrem.dispose();
  rt.texture.mapping = THREE.CubeReflectionMapping;
  return rt.texture;
};

/* ════════════════════════════════════════
    THREE.JS ENGINE LINE & MATERIAL TUNING
════════════════════════════════════════ */
const initThree = () => {
  if (!modelCanvas || window.__threeInitialized) return;
  window.__threeInitialized = true;

  window.threeScene = new THREE.Scene();

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  window.threeRenderer = new THREE.WebGLRenderer({
    canvas: modelCanvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  window.threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping;
  window.threeRenderer.toneMappingExposure = 1.3; // 잿빛으로 타버리는 현상을 방지하기 위해 노출값 최적화

  // 금속 표면의 엣지를 선명하게 때려줄 다이렉트 화이트 광원 배치
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 4.5);
  dirLight1.position.set(5, 8, 6);
  window.threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 2.5);
  dirLight2.position.set(-5, -2, 4);
  window.threeScene.add(dirLight2);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  window.threeScene.add(ambientLight);

  window.threeCamera = new THREE.PerspectiveCamera(24, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.8);

  const envTexture = generatePureEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Math.random()}`,
    (gltf) => {
      if (!gltf || !gltf.scene) { hideSiteLoader(); return; }
      if (window.modelAnchor) window.threeScene.remove(window.modelAnchor);

      const model = gltf.scene;

      /* ── [교정] 찰흙 같은 잿빛을 지우고 진짜 반짝이는 실버 크롬 메탈릭 텍스처 매핑 ── */
      const realSilverMetallicMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,        // 기본 베이스를 순백색으로 선언하여 칙칙한 회색 원천 제거
        metalness: 1.0,         // 100% 완전한 거울형 메탈 속성 부여
        roughness: 0.08,        // 거칠기를 극단적으로 낮춰 광택 하이라이트 라인 형성
        side: THREE.DoubleSide
      });

      model.traverse((child) => {
        if (child.isMesh) {
          child.material    = realSilverMetallicMat;
          child.castShadow    = false;
          child.receiveShadow = false;
        }
      });

      const BOUNDS = 2.1;
      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = BOUNDS / maxDim;
      
      // 누워버리는 현상을 방지하기
