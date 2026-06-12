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
const crystalFallback = document.querySelector('#crystal-fallback');
const follower        = document.querySelector('.cursor-follower');
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li, .project-card-item');

// 💡 [박멸 완료] 가짜 코덱스 그래픽 강제 증발용 타겟팅
const codexFakeModel = document.querySelector('.codex-3d, #codex-fallback, .display-frame > svg, .display-frame > img');

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
    THREE.JS ENGINE (영롱한 물방울 프리즘 오로라 버전)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

const initThree = () => {
  if (!modelCanvas) return;

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (threeRenderer) {
    threeRenderer.dispose();
    threeRenderer = null;
  }

  if (codexFakeModel) {
    codexFakeModel.style.display = 'none';
    codexFakeModel.style.opacity = '0';
  }

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  // 안티앨리어싱 켜고 고성능 모드로 투명하게 렌더러 생성
  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true,
    antialias:   true,
    powerPreference: 'high-performance',
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  
  // ✨ [탁한 코덱스 3D 유령 박멸] 프리즘 유리 표현에 최적화된 리얼 컬러 매핑
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.LinearToneMapping; // 인위적인 대비를 없애 투명도 확보
  threeRenderer.toneMappingExposure = 1.3; 

  threeScene = new THREE.Scene();

  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.4); 

  // 광원 시스템 (크리스탈 내부 투과용 밝은 흰색 조명과 삼색의 반사 오로라 조명 조화)
  const ambient = new THREE.AmbientLight(0xffffff, 0.8); 
  threeScene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xffffff, 3.0);
  mainLight.position.set(3, 5, 4);
  threeScene.add(mainLight);

  // 물방울 표면에서 다채로운 빛깔로 반짝이게 만들어줄 오로라 스폿 조명
  const laserCyan = new THREE.SpotLight(0x00ffff, 25.0, 20, Math.PI / 3, 0.5, 1);
  laserCyan.position.set(5, 5, 3);
  threeScene.add(laserCyan);

  const laserMagenta = new THREE.SpotLight(0xff00ff, 30.0, 20, Math.PI / 3, 0.5, 1);
  laserMagenta.position.set(-5, -3, 3);
  threeScene.add(laserMagenta);

  const laserViolet = new THREE.SpotLight(0x7700ff, 20.0, 15, Math.PI / 4, 0.5, 1);
  laserViolet.position.set(0, -5, -2);
  threeScene.add(laserViolet);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      
      while(threeScene.children.length > 6) { 
        threeScene.remove(threeScene.children[threeScene.children.length - 1]);
      }

      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box
