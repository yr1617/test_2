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
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li');

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
    alpha:       true, // 배경 투명화 필수
    antialias:   true
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1.3;

  threeScene = new THREE.Scene();

  // 구도 리셋
  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.5); 

  // 조명 기본 배치 (유리 질감을 쨍하게 살려줄 광원들)
  const ambient = new THREE.AmbientLight(0xffffff, 1.2); 
  threeScene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xffffff, 3.0);
  mainLight.position.set(5, 5, 4);
  threeScene.add(mainLight);

  const sideLight1 = new THREE.DirectionalLight(0xff00bb, 1.8); 
  sideLight1.position.set(-5, 3, 2);
  threeScene.add(sideLight1);

  const sideLight2 = new THREE.DirectionalLight(0x00f6ff, 1.8); 
  sideLight2.position.set(3, -5, 2);
  threeScene.add(sideLight2);

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
      const scale   = 1.8 / (maxDim || 1); 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      model.rotation.set(Math.PI / 2.3, 0, 0); 

      // 💡 [지직거리는 파스텔톤 제거 + 유리 튜닝]
      model.traverse((child) => {
        if (!child.isMesh) return;
        
        if (child.material.map) child.material.map = null;
        
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,   
          metalness:          0.0,        
          roughness:          0.01,        // 지직거림 완전 면도
          transparent:        true,
          transmission:       0.96,       // 통유리 투과율
          ior:                2.42,       // 크리스탈 굴절률
          thickness:          0.4,         
          opacity:            1.0,
          side:               THREE.DoubleSide, 
          depthWrite:         true         
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      if (crystalFallback) crystalFallback.style.display = 'none';
      revealHiddenContent();
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 실패", err);
      revealHiddenContent();
    }
  );
};

// 💡 [핵심 안전장치] 본문 실종 박멸 함수
const revealHiddenContent = () => {
  const loaders = document.querySelectorAll('#site-loader, .site-loader, [id*="loader"], [class*="loader"]');
  loaders.forEach(l => l.remove()); // 로딩막 물리적 파괴
  // CSS가 노출을 보장하지만, 자바스크립트로 한 번 더 강제 봉인 해제
  const elementsToReveal = document.querySelectorAll('.hero-copy, .reveal-card, .panel, .accent-panel, .main-project-grid, .project-grid');
  elementsToReveal.forEach(el => {
    el.style.opacity = '1';
    el.style.visibility = 'visible';
    el.style.display = 'block';
  });
};

const resizeThree = () => {
  if (!threeRenderer || !threeCamera) return;
  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
  threeCamera.aspect = shell.offsetWidth / shell.offsetHeight;
  threeCamera.updateProjectionMatrix();
};

const animate = () => {
  animFrameId = requestAnimationFrame(animate);
  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;
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

const setupDragEvents = () => {
  // 이벤트 타겟을 가장 확실한 '창(window)'으로 변경하여 어떤 레이어 꼬임도 무시
  window.addEventListener('pointerdown', (e) => {
    // 💡 캔버스 영역 위에서만 드래그 시작하게 보완
    const rect = modelCanvas.getBoundingClientRect();
    if(e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        rotationState.isDragging = true;
        rotationState.previousMouseX = e.clientX;
        rotationState.previousMouseY = e.clientY;
    }
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

const initAll = () => {
  if (window.__threeInitialized) return; 
  window.__threeInitialized = true;
  landingCanvasCtrl = setupLandingCanvas();
  setupDragEvents(); 
  highlightElements.forEach(el => {
    el.addEventListener('mouseenter', () => el.classList.add('is-hovered'));
    el.addEventListener('mouseleave', () => el.classList.remove('is-hovered'));
  });
  initThree();
  animate();
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
else initAll();

window.addEventListener('resize', () => {
  if (landingCanvasCtrl) landingCanvasCtrl.resize();
  resizeThree();
});
