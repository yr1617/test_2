import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    DOM ELEMENT REFS (절대 구조 변경 없음)
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
    INTERACTION STATE (절대 구조 변경 없음)
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
    LANDING CANVAS BACKGROUND (절대 구조 변경 없음)
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
    THREE.JS ENGINE (정밀 튜닝 세팅)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

// 🌟 [수정] 인공적 얼룩 제거, 매끄럽고 선명한 고광택 거울 하이라이트용 그라데이션 환경맵
const generateFakeEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(4, 4, 4);
  
  // 무채색 중심의 뚜렷한 대비를 주어 크리스탈 에지에 칼날 같은 하이라이트 형성
  const mats = [
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), // Right
    new THREE.MeshBasicMaterial({ color: 0x111113, side: THREE.BackSide }), // Left
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), // Top
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }), // Bottom
    new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.BackSide }), // Front
    new THREE.MeshBasicMaterial({ color: 0x1a1a1e, side: THREE.BackSide })  // Back
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
    antialias:   true
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

  // 🌟 [수정] ACES Filmic 고대비 톤맵 바인딩
  threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1.2; 

  threeCamera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.8); 

  const envTexture = generateFakeEnvironment(threeRenderer);
  threeScene.environment = envTexture;

  // 🌟 [수정] 투명 유리에 영롱한 색상을 통과시켜 줄 오로라 프리즘 광원 튜닝
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  threeScene.add(ambient);

  const keyLight1 = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight1.position.set(5, 10, 5);
  threeScene.add(keyLight1);

  // 청록색과 자홍색 광원의 세기를 조절하여 유리 단면에 무지개빛이 맺히도록 투사
  const keyLight2 = new THREE.DirectionalLight(0x00f0ff, 2.5);
  keyLight2.position.set(-6, 3, 4);
  threeScene.add(keyLight2);

  const keyLight3 = new THREE.DirectionalLight(0xff00b4, 2.5);
  keyLight3.position.set(6, -3, 4);
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
      
      // 🌟 [수정] 답답하게 작았던 크기 문제를 시원하게 해결 (기존 2.4 -> 3.6으로 정밀 상향)
      const scale  = 3.6 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);

      model.rotation.set(Math.PI / 2.3, 0, 0); 

      // 🌟 [수정] 고광택 크리스탈 프리즘 물리 재질 정의 (요구사항 수치 정밀 반영)
      const crystalPrismMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0,                   // 크롬 느낌 완전 배제
        roughness: 0,                   // 불투명 솜사탕/에어로젤 현상 원천 차단 (매끄러운 표면)
        transmission: 1,                // 100% 완전 광학 투과율
        transparent: true,
        opacity: 1,
        ior: 1.45,                      // 굴절률 스펙 충족 (1.15 ~ 1.5)
        thickness: 0.4,                 // 두께 스펙 충족 (0.3 ~ 0.5) -> 앞뒷면 겹침 깨짐 버그 해결
        reflectivity: 1,                // 거울 같은 투명 고반사
        side: THREE.DoubleSide,         // 🔥 [핵심] 앞뒷면 동시 렌더링으로 겹침 노이즈 완벽 제거!
        envMap: envTexture,
        envMapIntensity: 2.5
      });

      // 🌟 [수정] 하위 버전 안전성 검증을 거친 광학 색분산(Dispersion) RGB 연산 활성화
      if (typeof THREE.MeshPhysicalMaterial.prototype.dispersion !== 'undefined') {
        crystalPrismMaterial.dispersion = 7.0; // 자연스럽고 쨍한 무지개빛 분리 효과 추가
      }

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = crystalPrismMaterial;
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
    MAIN ANIMATION LOOP (절대 구조 변경 없음)
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
    DRAG EVENTS & INTERACTION (절대 구조 변경 없음)
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
    const deltaY = e.clientY - pointer.y; // 원래 인터랙션 연산 유지

    rotationState.targetY += deltaX * 0.008;
    rotationState.targetX += (e.clientY - rotationState.previousMouseY) * 0.008;

    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  });

  window.addEventListener('pointerup', () => {
    rotationState.isDragging = false;
  });
};

/* ════════════════════════════════════════
    INITIALIZE (절대 구조 변경 없음)
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
