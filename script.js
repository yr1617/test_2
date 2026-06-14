import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    ENGINE RE-INIT PROTECTION
════════════════════════════════════════ */
if (window.animFrameId) {
  cancelAnimationFrame(window.animFrameId);
  window.animFrameId = null;
}
if (window.threeRenderer) {
  window.threeRenderer.dispose();
  window.threeRenderer = null;
}
window.threeScene    = null;
window.threeCamera   = null;
window.modelAnchor   = null;
window.__threeInitialized = false;

/* ════════════════════════════════════════
    DOM REFS & 전역 변수
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');
const follower       = document.querySelector('.cursor-follower');
const navLinks       = document.querySelectorAll('.topnav a[data-target]');
const sections       = [];

const eliminateFakeModels = () => {
  ['#crystal-fallback','#codex-3d','.fallback-layer','.crystal-backup','#three-debug-hud'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.style.setProperty('display','none','important');
  });
};

const mouse = { x: 0, y: 0 };
const pointer = {
  x: window.innerWidth * 0.5,  y: window.innerHeight * 0.5,
  tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5
};
const clamp01 = v => Math.max(0, Math.min(1, v));

const rotState = { x: 0, y: 0 };
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
    HIGH CONTRAST METALLIC ENVIRONMENT
════════════════════════════════════════ */
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = null;

  const roomGeo = new THREE.SphereGeometry(60, 16, 16);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide });
  const room = new THREE.Mesh(roomGeo, roomMat);
  scene.add(room);

  // 빛이 사방으로 부드럽게 퍼지도록 반사판들을 더 크고 와이드하게 배치
  const topLight = new THREE.Mesh(
    new THREE.BoxGeometry(80, 10, 80),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  topLight.position.set(0, 35, 0);
  scene.add(topLight);

  const frontRight = new THREE.Mesh(
    new THREE.BoxGeometry(30, 60, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  frontRight.position.set(30, 10, 20);
  frontRight.rotation.y = -Math.PI / 4;
  scene.add(frontRight);

  const frontLeft = new THREE.Mesh(
    new THREE.BoxGeometry(30, 60, 10),
    new THREE.MeshBasicMaterial({ color: 0xdddddd, toneMapped: false })
  );
  frontLeft.position.set(-30, 10, 20);
  frontLeft.rotation.y = Math.PI / 4;
  scene.add(frontLeft);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(scene);
  pmrem.dispose();
  rt.texture.mapping = THREE.CubeReflectionMapping;
  return rt.texture;
};

/* ════════════════════════════════════════
    THREE.JS MAIN CORE (반사 왜곡 및 음영 완전 개선)
════════════════════════════════════════ */
const initThree = () => {
  if (!modelCanvas || window.__threeInitialized) return;
  window.__threeInitialized = true;

  window.threeScene = new THREE.Scene();

  const shell = landingDisplay || { offsetWidth: 650, offsetHeight: 650 };
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
  
  // 톤매핑 설정을 부드러우면서도 쨍하게 볼륨 조절
  window.threeRenderer.toneMapping = THREE.LinearToneMapping; 
  window.threeRenderer.toneMappingExposure = 1.3; 

  // 카메라 정면 및 45도 방향에서 서치라이트급 조명 배치 (어디를 봐도 어두워지지 않게 셋팅)
  const cameraLight = new THREE.DirectionalLight(0xffffff, 3.5);
  cameraLight.position.set(0, 0, 10); // 카메라가 보는 정면에서 바로 때려 흑화 방지
  window.threeScene.add(cameraLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 4.5);
  dirLight1.position.set(15, 15, 10);
  window.threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 2.5);
  dirLight2.position.set(-15, 10, 8);
  window.threeScene.add(dirLight2);

  // 블렌더 찰흙 느낌을 완전히 지우기 위해 은은한 기본 바닥광 상향
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); 
  window.threeScene.add(ambientLight);

  window.threeCamera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.0);

  const envTexture = generatePureEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Math.random()}`,
    (gltf) => {
      if (!gltf || !gltf.scene) { hideSiteLoader(); return; }
      if (window.modelAnchor) window.threeScene.remove(window.modelAnchor);

      const model = gltf.scene;

      // 🌟 [치트키] 거울 느낌 대신 거칠기를 살짝 주어 빛을 사방으로 머금게 세팅
      const hyperChromeMat = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,          // 순백색에서 살짝 아래로 내려 하이라이트와의 대비 극대화
        metalness: 0.95,          // 묵직한 메탈 질감 유지
        roughness: 0.18,          // ⭐ 중요: 0.04에서 0.18로 변경. 빛을 튕겨내지 않고 표면에 머금어 정면에서도 은빛으로 빛남!
        envMapIntensity: 4.5,     
        side: THREE.DoubleSide
      });

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = hyperChromeMat;
          child.material.needsUpdate = true;
        }
      });
