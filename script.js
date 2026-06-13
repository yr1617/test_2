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
    🌈 GENERATE HIGH-CONTRAST PRISM ENVMAP
════════════════════════════════════════ */
// 무지개빛 분산과 쨍한 하이라이트를 유리에 강제로 맺히게 만드는 고대비 광학 생성기
const generatePrismEnvMap = (renderer) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // 베이스는 투명 유리를 극대화할 칠흑색
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 512, 256);

  // 레퍼런스 특유의 쨍한 백색 하이라이트선 배치
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(100, 40, 40, 180);
  ctx.fillRect(380, 40, 40, 180);

  // 모서리 굴절면에 쪼개져 들어갈 선명한 스펙트럼 네온 그라데이션 라인 주입
  const gradient = ctx.createLinearGradient(180, 0, 340, 0);
  gradient.addColorStop(0.0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.2, '#ff0055'); // 강렬한 자홍
  gradient.addColorStop(0.4, '#00ffcc'); // 서늘한 시안 민트
  gradient.addColorStop(0.6, '#ffaa00'); // 영롱한 골드 오렌지
  gradient.addColorStop(0.8, '#0066ff'); // 딥 블루
  gradient.addColorStop(1.0, 'rgba(0,0,0,0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(160, 20, 190, 216);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const renderTarget = pmremGenerator.fromEquirectangular(texture);

  pmremGenerator.dispose();
  texture.dispose();

  return renderTarget.texture;
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

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (threeScene) {
    while(threeScene.children.length > 0){ 
      const obj = threeScene.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
      threeScene.remove(obj); 
    }
  } else {
    threeScene = new THREE.Scene();
  }

  if (threeRenderer) {
    threeRenderer.dispose();
    threeRenderer = null;
  }

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true, // 웹사이트 배경 투과 활성화
    antialias:   true,
    powerPreference: 'high-performance'
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping; 
  threeRenderer.toneMappingExposure = 1.6; // 프리즘 선이 선명하게 튀어나오도록 노출 강하게 상향

  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.4); 

  // 유리에 투과 및 프리즘 반사를 맺히게 할 특수 환경 맵 주입
  const prismEnv = generatePrismEnvMap(threeRenderer);
  threeScene.environment = prismEnv;

  // 조명 스펙트럼 세팅
  const ambient = new THREE.AmbientLight(0xffffff, 0.5); 
  threeScene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffffff, 3.5); 
  sunLight.position.set(2, 5, 3);
  threeScene.add(sunLight);

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
      const scale   = 1.95 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      
      model.rotation.set(Math.PI / 2.3, 0, 0); 

      model.traverse((child) => {
        if (!child.isMesh) return;

        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }

        // 💎 [레퍼런스 완벽 매칭 정석 유리 재질]
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,          // 순수 투명 베이스
          metalness:          0.0,               
          roughness:          0.0,               // 거울면 폴리싱
          transparent:        true,              
          side:               THREE.FrontSide,   
          depthWrite:         false,

          // ✨ 회색 플라스틱 현상 완전 타파 속성
          transmission:       1.0,               // 100% 완벽한 광학 투과로 뒤쪽 요소가 그대로 뚫려 보임
          ior:                2.0,               // 높은 굴절률로 각진 테두리에 극단적인 명암 대비 확보
          thickness:          1.8,               // 굴절 두께를 주어 입체감 극대화

          // 🌈 강제로 빛을 쪼개어 서늘하고 날카로운 무지갯빛 테두리 라인을 형성
          iridescence:        1.0,               
          iridescenceIOR:     2.5,               
          iridescenceThicknessRange: [250, 450], 

          clearcoat:          1.0,               
          clearcoatRoughness: 0.0
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);

      eliminateFakeModels(); 
      hideSiteLoader();
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 실패", err);
      hideSiteLoader();
    }
  );
};

const hideSiteLoader = () => {
  const siteLoader = document.querySelector('#site-loader');
  if (siteLoader) {
    setTimeout(() => {
      siteLoader.classList.add('is-loaded');
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
        modelAutoRotY += 0.003;
        rotationState.targetY += 0.003;
      }

      rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.09;
      rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.09;

      modelAnchor.rotation.x = rotationState.currentX;
      modelAnchor.rotation.y = rotationState.currentY;

      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.005;
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

    rotationState.targetY += deltaX * 0.008;
    rotationState.targetX += deltaY * 0.008;

    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  });

  window.addEventListener('pointerup', () => {
    rotationState.isDragging = false;
  });
};

/* ════════════════════════════════════════
    INITIALIZE
════════════════════════════════════════ */
const initAll = () => {
  if (window.__threeInitialized) return; 
  window.__threeInitialized = true;

  landingCanvasCtrl = setupLandingCanvas();
  setupDragEvents(); 
  eliminateFakeModels(); 

  highlightElements.forEach((el) => {
    el.addEventListener('mouseenter', () => el.classList.add('is-hovered'));
    el.addEventListener('mouseleave', () => el.classList.remove('is-hovered'));
  });

  const revealCards = document.querySelectorAll('.reveal-card');
  if (revealCards.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );
    revealCards.forEach(card => observer.observe(card));
  }

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
