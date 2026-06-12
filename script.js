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

// 예린님이 원하신 '마우스 호버 시 형광펜 효과'를 줄 대상들 (.reveal-card 내부의 li나 강조 단어)
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li');

/* ════════════════════════════════════════
    POINTER & TILT STATE (원본 앵글 유지)
════════════════════════════════════════ */
const pointer = {
  x:  window.innerWidth  * 0.5,
  y:  window.innerHeight * 0.5,
  tx: window.innerWidth  * 0.5,
  ty: window.innerHeight * 0.5,
};

const tilt = {
  rx: -8,   
  ry: 35,   
  rz: 0,
  tx: -8, ty: 35, tz: 0,
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
    TILT TARGET UPDATE
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
    tilt.tx = -8; tilt.ty = 35; tilt.tz = 0;
    return;
  }
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  tilt.tx = -8 + ny * -15;
  tilt.ty = 35 + nx * 20;
  tilt.tz = nx * 5;
};

/* ════════════════════════════════════════
    THREE.JS ENGINE (안전 피드백 로딩)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelMesh    = null;
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
  threeRenderer.toneMappingExposure = 1.4; 

  threeScene = new THREE.Scene();
  threeScene.background = null;

  threeCamera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
  threeCamera.position.set(0, 0.0, 3.8); 

  // 조명 강도를 확보하여 유리/크리스탈 질감 극대화
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  threeScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff8f0, 3.0);
  keyLight.position.set(5, 5, 4);
  threeScene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xaae961, 2.5); 
  rimLight.position.set(-5, 3, -2);
  threeScene.add(rimLight);

  const backLight = new THREE.DirectionalLight(0xb18bff, 2.0); 
  backLight.position.set(-2, -3, -3);
  threeScene.add(backLight);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  // 무조건 현재 폴더 기준 최상위 경로의 modeling.glb 로드
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

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          metalness:          0.1,
          roughness:          0.05,       
          transmission:       0.92,       
          thickness:          1.2,        
          ior:                1.52,       
          clearcoat:          1.0,
          clearcoatRoughness: 0.02,
          iridescence:        0.85,       
          iridescenceIOR:     1.4,
          opacity:            0.95,
          transparent:        true,
          side:               THREE.DoubleSide,
        });
      });

      threeScene.add(model);
      modelMesh   = model;
      modelLoaded = true;
      if (crystalFallback) crystalFallback.classList.add('is-hidden');
    },
    undefined,
    (err) => {
      console.warn("GLB 파일 로드 실패 - 대체 박스를 활성화합니다.", err);
      if (crystalFallback) crystalFallback.classList.remove('is-hidden');
    }
  );
};

const resizeThree = () => {
  if (!threeRenderer || !threeCamera || !landingDisplay) return;
  const W = landingDisplay.offsetWidth;
  const H = landingDisplay.offsetHeight;
  threeRenderer.setSize(W, H);
  threeCamera.aspect = W / H;
  threeCamera.updateProjectionMatrix();
};

/* ════════════════════════════════════════
    MAIN ANIMATION LOOP
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.12;
  pointer.y += (pointer.ty - pointer.y) * 0.12;

  tilt.rx += (tilt.tx - tilt.rx) * 0.1;
  tilt.ry += (tilt.ty - tilt.ry) * 0.1;
  tilt.rz += (tilt.tz - tilt.rz) * 0.1;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (threeRenderer && threeScene && threeCamera) {
    if (modelMesh) {
      if (!tilt.hovering) {
        modelAutoRotY += 0.004; 
      }
      modelMesh.rotation.x = THREE.MathUtils.degToRad(tilt.rx);
      modelMesh.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry);
      modelMesh.rotation.z = THREE.MathUtils.degToRad(tilt.rz);
      modelMesh.position.y = Math.sin(Date.now() * 0.001) * 0.04;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    NAV PROGRESS
════════════════════════════════════════ */
const updateNavProgress = () => {
  const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const at
