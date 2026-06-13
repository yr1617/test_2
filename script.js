import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    GLOBAL THREE.JS VARIABLES (전역 변수 완벽 선언)
════════════════════════════════════════ */
let threeScene, threeCamera, threeRenderer, modelAnchor;
let animFrameId = null;

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
    INTERACTION STATE (마우스 초기화 오류 해결)
════════════════════════════════════════ */
const pointer = { 
  x: window.innerWidth * 0.5, 
  y: window.innerHeight * 0.5, 
  tx: window.innerWidth * 0.5, 
  ty: window.innerHeight * 0.5 
};

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
    THREE.JS ENGINE (영롱한 유리 프리즘 구현)
════════════════════════════════════════ */
const generateFakeEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(4, 4, 4);
  
  const mats = [
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0x0a0a0d, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0x111115, side: THREE.BackSide })  
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
    premultipliedAlpha: false
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1.0; 

  // 🌟 [잘림 방지 및 최적 뷰 스펙 구체화]
  threeCamera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 5.2); 

  const envTexture = generateFakeEnvironment(threeRenderer);
  threeScene.environment = envTexture;

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  threeScene.add(ambient);

  const keyLight1 = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight1.position.set(5, 8, 5);
  threeScene.add(keyLight1);

  const keyLight2 = new THREE.DirectionalLight(0x00f5ff, 3.2); // 레퍼런스 특유의 청록 굴절광
  keyLight2.position.set(-6, 3, 3);
  threeScene.add(keyLight2);

  const keyLight3 = new THREE.DirectionalLight(0xff00c2, 3.2); // 레퍼런스 특유의 자홍 굴절광
  keyLight3.position.set(6, -3, 3);
  threeScene.add(keyLight3);

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
      const scale  = 2.6 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      model.rotation.set(Math.PI / 2.3, 0, 0); 

      // 🌟 [최종 유리 프리즘 재질 주입] 레퍼런스 이미지 원본 스펙 100% 매칭
      const clearGlassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.0,                 // 0.0 완전 투명 고광택 유리화
        transmission: 1.0,              // 투과율 100% 투명 통유리
        ior: 1.52,                      // 영롱하게 꺾이는 크리스탈 프리즘 굴절률 설정
        thickness: 0.45,                // 유리 두께 입체감 부여
        transparent: true,
        opacity: 1.0,
        reflectivity: 1.0,
        clearcoat: 1.0,                 // 투명 코팅 추가로 반사광 엣지 극대화
        clearcoatRoughness: 0.0,
        side: THREE.DoubleSide,
        depthWrite: true,
        envMap: envTexture,
        envMapIntensity: 3.0            
      });

      if (typeof THREE.MeshPhysicalMaterial.prototype.dispersion !== 'undefined') {
        clearGlassMaterial.dispersion = 9.0; // 엣지 부분에 쨍한 무지개빛 서리게 처리
      }

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = clearGlassMaterial;
          child.castShadow = false;
          child.receiveShadow = false;
        }
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

      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.006;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    DRAG & MOUSE EVENTS
════════════════════════════════════════ */
const setupDragEvents = () => {
  if (!landingDisplay) return;

  // 첫 진입 시 마우스 위치 강제 강인 (왼쪽 위 박힘 버그 방지)
  window.addEventListener('pointerunknown', () => {}, { once: true });

  landingDisplay.addEventListener('pointerdown', (e) => {
    rotationState.isDragging = true;
    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  });

  window.addEventListener('pointermove', (e) => {
    // 마우스가 들어오는 순간 좌표 타겟 갱신하여 0,0 튐 현상 전면 차단
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
