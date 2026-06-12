import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    DOM REFS
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');
const crystalFallback = document.querySelector('#crystal-fallback');
const follower        = document.querySelector('.cursor-follower');
const navLinks       = document.querySelectorAll('.topnav a[data-target]');
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li');

/* ════════════════════════════════════════
    POINTER & TILT STATE
════════════════════════════════════════ */
const pointer = {
  x:  window.innerWidth  * 0.5,
  y:  window.innerHeight * 0.5,
  tx: window.innerWidth  * 0.5,
  ty: window.innerHeight * 0.5,
};

const tilt = {
  rx: -5,   
  ry: 0,   
  rz: 0,
  tx: -5, ty: 0, tz: 0,
  hovering: false,
};

const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    LANDING CANVAS GLOW
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
    glow.addColorStop(0,    'rgba(255,255,255,0.09)');
    glow.addColorStop(0.18, 'rgba(219,255,134,0.08)');
    glow.addColorStop(0.44, 'rgba(93,53,163,0.08)');
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
    TILT TARGET UPDATE (마우스 방향 및 감도 대폭 상향)
════════════════════════════════════════ */
const updateTiltTarget = (clientX, clientY) => {
  if (!landingDisplay) return;
  const rect = landingDisplay.getBoundingClientRect();
  const inside =
    clientX >= rect.left && clientX <= rect.right &&
    clientY >= rect.top  && clientY <= rect.bottom;

  tilt.hovering = inside;
  landingDisplay.classList.toggle('is-hovering', inside);

  if (!inside) {
    tilt.tx = -5; tilt.ty = 0; tilt.tz = 0;
    return;
  }
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  
  // 💡 부호를 (+)로 반전시켜 마우스를 완벽하게 따라오게 하고, 회전 한계치를 늘렸습니다.
  tilt.tx = -5 + ny * 28;  // 상하 움직임 감도 버프
  tilt.ty = nx * 35;       // 좌우 움직임 시선 정방향 매칭 및 감도 버프
  tilt.tz = nx * 8;
};

/* ════════════════════════════════════════
    THREE.JS ENGINE (오로라 무지개 유리 재질 가동)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let modelLoaded   = false;
let animFrameId   = null;
let modelAutoRotY = 0;

const initThree = () => {
  if (!modelCanvas) return;

  const shell = landingDisplay;
  const W = shell ? shell.offsetWidth  : 600;
  const H = shell ? shell.offsetHeight : 600;

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true,
    antialias:   true,
    powerPreference: 'high-performance',
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1.6; // 빛을 더 받아 화사하게 조절

  threeScene = new THREE.Scene();
  threeScene.background = null;

  threeCamera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
  threeCamera.position.set(0, 0.0, 3.8); 

  // 조명을 더 다채로운 색감으로 추가하여 알록달록함을 극대화합니다.
  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  threeScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff5ea, 3.5); // 따뜻한 탑 조명
  keyLight.position.set(6, 6, 4);
  threeScene.add(keyLight);

  const neonPurple = new THREE.DirectionalLight(0xd98bff, 4.0); // 네온 보라색 사이드 광원
  neonPurple.position.set(-6, 2, 3);
  threeScene.add(neonPurple);

  const neonGreen = new THREE.DirectionalLight(0x76ffbc, 3.5); // 형광 그린/민트 백 광원
  neonGreen.position.set(2, -5, -2);
  threeScene.add(neonGreen);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale   = 2.0 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);

      model.rotation.set(Math.PI / 2.2, 0, Math.PI / 4);

      model.traverse((child) => {
        if (!child.isMesh) return;
        
        // 💎 [영롱한 오로라 크리스탈 글래스 재질 세팅]
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          metalness:          0.0,        // 유리는 메탈 속성을 빼야 투명해집니다
          roughness:          0.02,       // 표면을 완전 매끄러운 슈퍼 하이글로시로 변경
          transmission:       0.95,       // 투명도를 대폭 올려 하얀 느낌을 투명하게 깎아냄
          thickness:          1.5,        // 유리 두께감을 주어 굴절률 강화
          ior:                1.65,       // 보석급 프리즘 굴절률 부여
          clearcoat:          1.0,        // 겉면에 유리막 코팅 한 겹 레이어 추가
          clearcoatRoughness: 0.01,
          
          // ✨ 알록달록 반짝임의 핵심 (이리데슨스 레벨 업)
          iridescence:        1.0,        // 무지갯빛 오로라 효과 100% 풀 가동
          iridescenceIOR:     1.
