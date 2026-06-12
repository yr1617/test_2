import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    DOM ELEMENT REFS & FORCE REVEAL
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');   
const crystalFallback = document.querySelector('#crystal-fallback');
const follower        = document.querySelector('.cursor-follower');
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li');

// 💡 [콘텐츠 강제 심폐소생] 3D와 상관없이 본문이 즉시 보이도록 레이어 투명도 및 클릭 잠금 해제
if (modelCanvas) {
  modelCanvas.style.backgroundColor = 'transparent';
  modelCanvas.style.pointerEvents = 'auto'; // 마우스 드래그 먹통 해결
}
if (landingDisplay) {
  landingDisplay.style.background = 'transparent';
  landingDisplay.style.overflow = 'visible';
  landingDisplay.style.pointerEvents = 'none'; // 하단 콘텐츠 클릭 방해 금지
}

// 혹시 모를 다른 이름의 로딩 레이어들까지 전부 강제 종료하는 킬러 함수
const killAllLoaders = () => {
  const loaders = document.querySelectorAll('#site-loader, .site-loader, [class*="loader"], [id*="loader"]');
  loaders.forEach(loader => {
    loader.style.opacity = '0';
    loader.style.pointerEvents = 'none';
    setTimeout(() => { loader.style.display = 'none'; }, 400);
  });
  // 숨겨진 본문 wrapper가 있다면 강제로 오픈
  const mainContent = document.querySelector('.main-content, #app, #wrapper');
  if (mainContent) {
    mainContent.style.opacity = '1';
    mainContent.style.visibility = 'visible';
  }
};

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

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true, 
    antialias:   true
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

  threeScene = new THREE.Scene();

  threeCamera = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.6); 

  // 조명 강화 (유리 광택 극대화)
  const ambient = new THREE.AmbientLight(0xffffff, 1.5); 
  threeScene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xffffff, 3.5);
  mainLight.position.set(5, 5, 4);
  threeScene.add(mainLight);

  const neonMagenta = new THREE.DirectionalLight(0xff00bb, 2.0); 
  neonMagenta.position.set(-5, 4, 3);
  threeScene.add(neonMagenta);

  const neonCyan = new THREE.DirectionalLight(0x00f6ff, 2.0); 
  neonCyan.position.set(4, -5, 3);
  threeScene.add(neonCyan);

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
      const scale   = 1.9 / (maxDim || 1); 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      model.rotation.set(Math.PI / 2.3, 0, 0); 

      // 💡 [지직거리는 파스텔톤 제거 + 유리 튜닝]
      model.traverse((child) => {
        if (!child.isMesh) return;
        
        // 원본의 텁텁한 파스텔 색상 텍스처 맵을 완전히 삭제하여 투명도 확보
        if (child.material.map) child.material.map = null;
        
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,   
          metalness:          0.0,        
          roughness:          0.0,        // 노이즈 완벽 면도
          transparent:        true,
          transmission:       0.95,       // 투명도 95% 강제 주입
          ior:                2.2,        // 크리스탈 굴절률
          thickness:          0.4,        // 두께감 부여
          opacity:            1.0,
          side:               THREE.DoubleSide, 
          depthWrite:         true         
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      if (crystalFallback) crystalFallback.style.display = 'none';
      killAllLoaders();
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 실패", err);
      killAllLoaders();
    }
  );
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
      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.005; // 부드러운 위아래 둥둥 효과
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    DRAG EVENTS (클릭 타겟 수정)
════════════════════════════════════════ */
const setupDragEvents = () => {
  // 드래그 이벤트를 캔버스 자체에 직접 걸어 어떤 레이어 방해도 안 받게 만듭/니다.
  const targetElement = modelCanvas || landingDisplay || window;

  targetElement.addEventListener('pointerdown', (e) => {
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

  // 💡 [핵심 안전장치] 3D 로딩 속도와 무관하게 0.1초 뒤 무조건 로딩 레이어를 부수고 본문을 강제 개방
  setTimeout(killAllLoaders, 100);
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
