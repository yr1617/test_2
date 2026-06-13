import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    DOM ELEMENT REFS
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');   
const follower        = document.querySelector('.cursor-follower');
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li, .project-card-item');

const eliminateFakeModels = () => {
  const fakeIds = ['#crystal-fallback', '#codex-3d', '.fallback-layer', '.crystal-backup'];
  fakeIds.forEach(selector => {
    const el = document.querySelector(selector);
    if (el) {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    }
  });
};

/* ════════════════════════════════════════
    INTERACTION STATE
════════════════════════════════════════ */
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

const rotationState = {
  currentX: 0, currentY: 0,
  targetX:  0, targetY:  0,
  isDragging: false,
  previousMouseX: 0, previousMouseY: 0
};

let modelAutoRotY = 0; 
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    LANDING CANVAS BACKGROUND
════════════════════════════════════════ */
const setupLandingCanvas = () => {
  if (!landing || !landingCanvas) return null;
  const ctx = landingCanvas.getContext('2d');
  if (!ctx) return null;
  const state = { width: 0, height: 0, dpr: 1 };

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
    glow.addColorStop(0,    'rgba(255,255,255,0.08)');
    glow.addColorStop(0.3,  'rgba(150,100,255,0.04)');
    glow.addColorStop(1,    'rgba(16,16,18,0)');
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
  landing.style.setProperty('--pointer-x', `${clamp01(x / 100) * 100}%`);
  landing.style.setProperty('--pointer-y', `${clamp01(y / 100) * 100}%`);
};

/* ════════════════════════════════════════
    THREE.JS ENGINE (DIAMOND CRYSTAL PRISM)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

// 거울 같은 반사와 무지갯빛 가상 광원을 매끄럽게 공급할 HDRI 대용 고해상도 인바이런먼트 맵
const generateFakeEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(4, 4, 4);
  
  const mats = [
    new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.BackSide }), // Hot Magenta
    new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.BackSide }), // Cyan Prism
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), // Sharp White Light
    new THREE.MeshBasicMaterial({ color: 0x0a0a0d, side: THREE.BackSide }), // Deep Black Background
    new THREE.MeshBasicMaterial({ color: 0x6600ff, side: THREE.BackSide }), // Electric Violet
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide })  // Sharp White Light
  ];
  const box = new THREE.Mesh(geo, mats);
  scene.add(box);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  
  const renderTarget = pmremGenerator.fromScene(scene);
  pmremGenerator.dispose();
  return renderTarget.texture;
};

const initThree = () => {
  if (!modelCanvas) return;

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  threeScene = new THREE.Scene();

  if (threeRenderer) {
    threeRenderer.dispose();
    threeRenderer = null;
  }

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true, 
    antialias:   true,
    premultipliedAlpha: false // 노이즈 및 알파 블렌딩 외곽선 깨짐 강제 방지
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

  threeCamera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.8); 

  const envTexture = generateFakeEnvironment(threeRenderer);
  threeScene.environment = envTexture;

  // 크리스탈 단면에 날카로운 하이라이트를 맺히게 해줄 고대비 직사광선 레이아웃
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  threeScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
  keyLight.position.set(5, 10, 5);
  threeScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x00ffff, 1.5);
  fillLight.position.set(-5, -2, 4);
  threeScene.add(fillLight);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Date.now()}`,
    (gltf) => {
      const model = gltf.scene;

      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = 2.5 / maxDim; // 큼직하고 시원한 렌더 크기 고정
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);

      // 💎 [피드백 요구사항 100% 반영: 다이아몬드 프리즘 크리스탈 질감]
      const crystalPrismMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,                 // 실버 메탈 절대 아님, 순수 유리성
        roughness: 0.005,               // 에어로젤 같은 탁함을 지워버리는 칼날 같은 매끄러움 (0.01 이하)
        transparent: true,
        opacity: 1.0,
        transmission: 1.0,             // 완벽한 백색 광학 투과율 (Requirements: transmission = 1.0)
        ior: 2.2,                       // 보석 및 프리즘 수준의 초고굴절 (Requirements: ior 1.5 ~
