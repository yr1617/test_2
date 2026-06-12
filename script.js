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
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li');

// 💡 [초긴급 조치] 아래 콘텐츠가 절대 가려지지 않도록 Canvas와 주변 레이어 CSS 강제 투명화
if (modelCanvas) {
  modelCanvas.style.backgroundColor = 'transparent';
  modelCanvas.style.mixBlendMode = 'screen'; // 검은 배경판을 강제로 날려버리는 블렌딩 모드
}
if (landingDisplay) {
  landingDisplay.style.background = 'transparent';
  landingDisplay.style.overflow = 'visible';
}

/* ════════════════════════════════════════
    INTERACTION STATE
════════════════════════════════════════ */
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

const rotationState = {
  currentX: 0, currentY: 0,
  targetX:  0.3, targetY:  0.5, 
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
    THREE.JS ENGINE
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

const initThree = () => {
  if (!modelCanvas) return;

  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (threeRenderer) threeRenderer.dispose();

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  // 렌더러 설정 리셋 (alpha 필수)
  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true, 
    antialias:   true
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

  threeScene = new THREE.Scene();

  // 구도 리셋
  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.5); 

  // 조명 기본 배치
  const ambient = new THREE.AmbientLight(0xffffff, 1.0); 
  threeScene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
  mainLight.position.set(5, 5, 4);
  threeScene.add(mainLight);

  const sideLight1 = new THREE.DirectionalLight(0xff00bb, 1.5); 
  sideLight1.position.set(-5, 3, 2);
  threeScene.add(sideLight1);

  const sideLight2 = new THREE.DirectionalLight(0x00f6ff, 1.5); 
  sideLight2.position.set(3, -5, 2);
  threeScene.add(sideLight2);

  // 로더 가동
  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;

      // 크기 조절 및 센터링
      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale   = 1.8 / (maxDim || 1); 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      model.rotation.set(Math.PI / 2.3, 0, 0); 

      // 💡 [재질 초안 복구] 꼬이지 않는 확실한 반투명 유리 재질로 안전 세팅
      model.traverse((child) => {
        if (!child.isMesh) return;
        
        if (child.material.map) child.material.map = null;
        
        // 오류 위험이 있는 복잡한 물리 계산을 빼고 반투명도를 칼같이 강제 적용
        child.material = new THREE.MeshStandardMaterial({
          color:        0xffffff,
          roughness:    0.05,
          metalness:    0.1,
          transparent:  true,
          opacity:      0.45,             // 맑게 뚫려 보이도록 투명도 확실히 부여
          side:         THREE.DoubleSide,
          blending:     THREE.NormalBlending
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      if (crystalFallback) crystalFallback.style.display = 'none';

      // 💡 [중요] 어떤 에러가 나더라도 무조건 로딩창을 파괴하고 본문을 보여주는 안전장치
      forceRemoveLoader();
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 실패", err);
      forceRemoveLoader();
    }
  );
};

// 로딩창 강제 제거 함수 (본문 실종 방지)
const forceRemoveLoader = () => {
  const siteLoader = document.querySelector('#site-loader');
  if (siteLoader) {
    siteLoader.style.opacity = '0';
    siteLoader.style.pointerEvents = 'none';
    setTimeout(() => {
      siteLoader.style.display = 'none';
    }, 500);
  }
};

const resizeThree = () => {
  if (!threeRenderer || !threeCamera) return;
  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
  threeCamera.aspect = shell.offsetWidth / shell.offsetHeight;
  threeCamera.updateProjectionMatrix();
};

/* ════════════════════════════════════════
    MAIN ANIMATION LOOP
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (threeRenderer && threeScene && threeCamera) {
    if (modelAnchor) {
      if (!rotationState.isDragging) {
        modelAutoRotY += 0.002;
        rotationState.targetY += 0.002;
      }
      rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.08;
      rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.08;

      modelAnchor.rotation.x = rotationState.currentX;
      modelAnchor.rotation.y = rotationState.currentY;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    DRAG EVENTS
════════════════════════════════════════ */
const setupDragEvents = () => {
  if (!landingDisplay) return;

  landingDisplay.addEventListener('pointerdown', (e) => {
    rotationState.isDragging = true;
    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  });

  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
    if (!rotationState.isDragging || !modelAnchor) return;

    const deltaX = e.clientX - rotationState.previousMouseX;
    const deltaY = e.clientY - rotationState.previousMouseY;

    rotationState.targetY += deltaX * 0.006;
    rotationState.targetX += deltaY * 0.006;

    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  });

  window.addEventListener('pointerup', () => { rotationState.isDragging = false; });
};

/* ════════════════════════════════════════
    INITIALIZE
════════════════════════════════════════ */
const initAll = () => {
  if (window.__threeInitialized) return; 
  window.__threeInitialized = true;

  landingCanvasCtrl = setupLandingCanvas();
  setupDragEvents(); 

  highlightElements.forEach((el) => {
    el.addEventListener('mouseenter', () => el.classList.add('is-hovered'));
    el.addEventListener('mouseleave', () => el.classList.remove('is-hovered'));
  });

  initThree();
  animate();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

window.addEventListener('resize', () => {
  if (landingCanvasCtrl) landingCanvasCtrl.resize();
  resizeThree();
});
