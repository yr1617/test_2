import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    GLOBAL ENGINE REF (전역 변수 터짐 에러 완전 차단)
════════════════════════════════════════ */
// 브라우저 윈도우 객체에 직접 박아서 'is not defined' 레퍼런스 에러를 원천 봉쇄합니다.
window.threeScene     = window.threeScene || null;
window.threeCamera    = window.threeCamera || null;
window.threeRenderer  = window.threeRenderer || null;
window.modelAnchor    = window.modelAnchor || null;
window.animFrameId    = window.animFrameId || null;

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
    INTERACTION STATE (구석 박힘 현상 해결)
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
    THREE.JS ENGINE (완벽한 크리스탈 프리즘)
════════════════════════════════════════ */
const generateFakeEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(5, 5, 5);
  
  // 에지 라인을 따라 크리스탈처럼 날카로운 흰색 하이라이트를 만들어줄 그라데이션 박스 환경맵
  const mats = [
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0x050508, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0x0c0c10, side: THREE.BackSide })  
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

  if (window.animFrameId) {
    cancelAnimationFrame(window.animFrameId);
    window.animFrameId = null;
  }

  window.threeScene = new THREE.Scene();

  if (window.threeRenderer) {
    window.threeRenderer.dispose();
    window.threeRenderer = null;
  }

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  window.threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true, 
    antialias:   true,
    premultipliedAlpha: false
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  window.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  window.threeRenderer.toneMappingExposure = 1.1; 

  // 사방 잘림 방지 뷰 각도 셋팅
  window.threeCamera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.3); 

  const envTexture = generateFakeEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  window.threeScene.add(ambient);

  const keyLight1 = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight1.position.set(5, 8, 5);
  window.threeScene.add(keyLight1);

  // 🌟 레퍼런스 이미지의 영롱한 오로라 스펙트럼 띠를 유리에 입혀줄 네온 컬러 다이렉트 광원 배치
  const keyLight2 = new THREE.DirectionalLight(0x00faff, 3.5); 
  keyLight2.position.set(-6, 4, 3);
  window.threeScene.add(keyLight2);

  const keyLight3 = new THREE.DirectionalLight(0xff00b4, 3.5); 
  keyLight3.position.set(6, -4, 3);
  window.threeScene.add(keyLight3);

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

      // 🌟 [레퍼런스 매칭 100%] 탁한 회색 메탈 느낌을 완전히 걷어낸 투명 굴절 통유리 스펙
      const clearGlassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.0,                 // 고광택 유리 표면 질감
        transmission: 1.0,              // 100% 뒤가 맑게 투과되는 연산
        ior: 1.54,                      // 다이아몬드급 프리즘 굴절률 구현으로 내부 반사 유도
        thickness: 0.45,                // 유리 면의 단면 두께감 설정
        transparent: true,
        opacity: 1.0,
        reflectivity: 1.0,
        clearcoat: 1.0,                 
        clearcoatRoughness: 0.0,
        side: THREE.DoubleSide,         // 내부 메쉬 겹침 노이즈 방지 및 뒷면 렌더링 활성화
        depthWrite: true,
        envMap: envTexture,
        envMapIntensity: 3.2            
      });

      if (typeof THREE.MeshPhysicalMaterial.prototype.dispersion !== 'undefined') {
        clearGlassMaterial.dispersion = 12.0; // 에지에 예리한 무지개빛 오로라 굴절 효과 강화
      }

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = clearGlassMaterial;
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      window.modelAnchor = new THREE.Group();
      window.modelAnchor.add(model);
      window.threeScene.add(window.modelAnchor);

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
  if (!window.threeRenderer || !window.threeCamera) return;
  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  window.threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
  window.threeCamera.aspect = shell.offsetWidth / shell.offsetHeight;
  window.threeCamera.updateProjectionMatrix();
};

/* ════════════════════════════════════════
    MAIN ANIMATION LOOP (에러 방지 교정 완료)
════════════════════════════════════════ */
const animate = () => {
  window.animFrameId = requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (window.threeRenderer && window.threeScene && window.threeCamera) {
    if (window.modelAnchor) {
      if (!rotationState.isDragging) {
        modelAutoRotY += 0.003;
        rotationState.targetY += 0.003;
      }

      rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.09;
      rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.09;

      window.modelAnchor.rotation.x = rotationState.currentX;
      window.modelAnchor.rotation.y = rotationState.currentY;

      window.modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.006;
    }
    window.threeRenderer.render(window.threeScene, window.threeCamera);
  }
};

/* ════════════════════════════════════════
    DRAG & MOUSE EVENTS
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

    if (!rotationState.isDragging || !window.modelAnchor) return;

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
