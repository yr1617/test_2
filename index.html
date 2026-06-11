/**
 * script.js — 최예린 포트폴리오
 * ─────────────────────────────────────
 * 1. Landing canvas pointer glow
 * 2. Three.js GLB 3D model (modeling.glb) — crystal/glass material
 * 3. CSS fallback crystal (shown if GLB fails)
 * 4. Tilt interaction on hover
 * 5. Cursor follower
 * 6. Nav progress bar
 * 7. Scroll reveal (Intersection Observer)
 */

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
const follower       = document.querySelector('.cursor-follower');
const revealCards    = document.querySelectorAll('.reveal-card');
const navLinks       = document.querySelectorAll('.topnav a[data-target]');

/* ════════════════════════════════════════
   POINTER STATE (초기 화면 진입 시 우측 중앙에 마우스가 있는 것처럼 배치)
════════════════════════════════════════ */
const pointer = {
  x:  window.innerWidth  * 0.72,
  y:  window.innerHeight * 0.50, // FIX: 타이틀 위 치우침 방지 및 수직 중앙 밸런스 조정
  tx: window.innerWidth  * 0.72,
  ty: window.innerHeight * 0.50,
};

const tilt = {
  rx: 0,  // FIX: 초기 모델링이 누워있지 않고 정면을 정갈하게 바라보도록 0으로 수정
  ry: 0,
  rz: 0,
  tx: 0,
  ty: 0,
  tz: 0,
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
    glow.addColorStop(0,    'rgba(255,255,255,0.12)'); // 빛 퍼짐 강도 소폭 상향
    glow.addColorStop(0.18, 'rgba(219,255,134,0.09)');
    glow.addColorStop(0.44, 'rgba(93,53,163,0.09)');
    glow.addColorStop(1,    'rgba(16,16,18,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  };

  resize();
  return { resize, draw };
};

const landingCanvasCtrl = setupLandingCanvas();

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
    tilt.tx = 0; tilt.ty = 0; tilt.tz = 0; // 복귀 각도 정면으로 초기화
    return;
  }
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  tilt.tx = ny * -18;
  tilt.ty = nx * 22;
  tilt.tz = nx * 4;
};

/* ════════════════════════════════════════
   THREE.JS — GLB MODEL WITH CRYSTAL MATERIAL
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelMesh     = null;   
let modelLoaded   = false;
let animFrameId   = null;
let modelAutoRotY = 0;

const initThree = () => {
  if (!modelCanvas) return;

  const shell = landingDisplay;
  const W = shell ? shell.offsetWidth  : 560;
  const H = shell ? shell.offsetHeight : 600;

  /* ── Renderer ── */
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
  threeRenderer.toneMappingExposure = 1.6; // FIX: 화면 밝기 증가시켜 크리스탈 투명 재질 극대화
  threeRenderer.shadowMap.enabled   = false;

  /* ── Scene ── */
  threeScene = new THREE.Scene();
  threeScene.background = null;

  /* ── Camera ── */
  threeCamera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.2); // FIX: 카메라 Y축 높이를 정중앙(0)으로 내려 비틀어짐 해결

  /* ── Lights (반짝임과 하이라이트를 극대화하기 위해 조명 값 전면 수정) ── */
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  threeScene.add(ambient);

  // 전면에서 때려주는 강력한 화이트 메인광 (반짝임 형성)
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
  keyLight.position.set(4, 6, 5);
  threeScene.add(keyLight);

  // 크리스탈 외곽 엣지를 살려주는 강한 테두리 하이라이트 광원원
  const rimLight = new THREE.DirectionalLight(0xdcff87, 2.5);
  rimLight.position.set(-5, 3, 2);
  threeScene.add(rimLight);

  const backLight = new THREE.DirectionalLight(0xa582ff, 2.0);
  backLight.position.set(0, -4, -3);
  threeScene.add(backLight);

  // 디테일한 굴절 반사를 만들어내는 포인트 쉬머 광원들들
  const ptGreen = new THREE.PointLight(0xdbff86, 4.0, 8);
  ptGreen.position.set(2, 2, 2);
  threeScene.add(ptGreen);

  const ptPurple = new THREE.PointLight(0x875cee, 3.5, 8);
  ptPurple.position.set(-2, -2, 2);
  threeScene.add(ptPurple);

  /* ── Environment map (반사/반짝임의 핵심 요소) ── */
  const pmremGen = new THREE.PMREMGenerator(threeRenderer);
  pmremGen.compileEquirectangularShader();
  const envScene = new THREE.RoomEnvironment();
  const envTexture = pmremGen.fromScene(envScene).texture;
  threeScene.environment = envTexture;
  pmremGen.dispose();

  /* ── Load GLB ── */
  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://unpkg.com/three@0.165.0/examples/jsm/libs/draco/');
  loader.setDRACOLoader(draco);

  loader.load(
    'modeling.glb',
    (gltf) => {
      const model = gltf.scene;

      /* Centre & scale model */
      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = 2.2 / maxDim;
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);

      /* Apply crystal / glass material to every mesh */
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow    = false;
        child.receiveShadow = false;

        /* ── FIX: 불투명함 해결 및 극도로 투명하고 영롱하게 반짝이는 크리스탈 프리셋 설정 ── */
        const crystal = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          metalness:          0.0,          // 유리 재질은 메탈네스를 0으로 주어야 투명도가 깨끗하게 살아납니다.
          roughness:          0.01,         // 0에 가깝게 내려 완벽하게 매끄럽고 정교하게 반짝이도록 설정
          transmission:       0.98,         // 98% 빛 투과로 불투명함 완벽 제거 (유리처럼 투명하게 투과)
          thickness:          1.8,          // 두께감을 주어 내부 굴절률 왜곡 극대화
          ior:                1.55,         // 다이아몬드/크리스탈에 가까운 높은 굴절률
          envMapIntensity:    3.5,          // 주변 환경 반사 세기를 키워 엄청나게 반짝이게 유도
          clearcoat:          1.0,          // 겉면에 유광 코팅막 레이어 탑재
          clearcoatRoughness: 0.01,
          iridescence:        0.9,          // 오로라빛 무지개 반사광 코팅 투입
          iridescenceIOR:     1.45,
          iridescenceThicknessRange: [150, 450],
          opacity:            1.0,          // transmission과 결합하여 물리 기반 완벽한 투명 묘사
          transparent:        true,
          side:               THREE.DoubleSide,
          attenuationColor:   new THREE.Color(0xffffff), // 탁한 색조 필터를 지워 투명함 강화
          attenuationDistance: 5.0,
          reflectivity:       1.0,          // 반사율 최대화
        });

        child.material = crystal;
      });

      threeScene.add(model);
      modelMesh   = model;
      
      // FIX: 모델 자체가 누워서 로딩되어 있다면 강제로 정면을 보도록 베이스 회전 피치 리셋 세팅팅
      modelMesh.rotation.set(0, 0, 0); 
      
      modelLoaded = true;

      if (crystalFallback) crystalFallback.classList.add('is-hidden');
    },
    undefined,
    (err) => {
      console.warn('GLB load failed, showing CSS fallback:', err);
      if (crystalFallback) crystalFallback.classList.remove('is-hidden');
      if (threeRenderer) {
        threeRenderer.dispose();
        threeRenderer = null;
      }
    }
  );
};

/* ── Resize Three renderer when shell resizes ── */
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

  /* Smooth pointer lag */
  pointer.x += (pointer.tx - pointer.x) * 0.12;
  pointer.y += (pointer.ty - pointer.y) * 0.12;

  /* Smooth tilt lag */
  tilt.rx += (tilt.tx - tilt.rx) * 0.12;
  tilt.ry += (tilt.ty - tilt.ry) * 0.12;
  tilt.rz += (tilt.tz - tilt.rz) * 0.12;

  /* FIX: 마우스 따라다니는 커서 follower가 정상 표시되도록 보장 */
  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  /* Landing canvas glow */
  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  /* Three.js render */
  if (threeRenderer && threeScene && threeCamera) {
    if (modelMesh) {
      if (!tilt.hovering) {
        /* 마우스 호버가 아닐 땐 스스로 은은하게 회전 */
        modelAutoRotY += 0.005;
      }
      /* 누워있지 않게 정방향 각도 축 매핑 조율 */
      modelMesh.rotation.x = THREE.MathUtils.degToRad(tilt.rx);
      modelMesh.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry);
      modelMesh.rotation.z = THREE.MathUtils.degToRad(tilt.rz);

      /* 공중 부유 효과 */
      modelMesh.position.y = Math.sin(Date.now() * 0.001) * 0.06;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
   NAV PROGRESS
════════════════════════════════════════ */
const updateNavProgress = () => {
  const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const atBottom  = window.scrollY >= maxScroll - 4;

  navLinks.forEach((link) => {
    const section = document.getElementById(link.dataset.target);
    if (!section) return;

    if (atBottom && link.dataset.target === 'contact') {
      link.style.setProperty('--nav-progress', '1');
      link.classList.add('is-active');
      return;
    }
    const rect     = section.getBoundingClientRect();
    const start    = window.innerHeight * 0.75;
    const end      = window.innerHeight * 0.18;
    const progress = clamp01((start - rect.top) / Math.max(start - end, 1));
    link.style.setProperty('--nav-progress', progress.toFixed(3));
    link.classList.toggle('is-active', progress > 0.02 && progress < 1);
  });
};

/* ════════════════════════════════════════
   SCROLL REVEAL (Intersection Observer)
════════════════════════════════════════ */
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

/* ════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════ */
window.addEventListener('pointermove', (e) => {
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  updateTiltTarget(e.clientX, e.clientY);

  if (follower) {
    follower.classList.toggle('is-link', Boolean(e.target.closest('a,button')));
  }
});

window.addEventListener('pointerleave', () => {
  // 마우스 아웃 시 정중앙 정방향 밸런스로 자연스럽게 랜딩 백 처리리
  pointer.tx = window.innerWidth  * 0.72;
  pointer.ty = window.innerHeight * 0.50;
  
  if (tilt.hovering) {
    modelAutoRotY += THREE.MathUtils.degToRad(tilt.ry);
  }
  
  tilt.hovering = false;
  tilt.tx = 0; tilt.ty = 0; tilt.tz = 0;
  landingDisplay?.classList.remove('is-hovering');
});

window.addEventListener('scroll', updateNavProgress, { passive: true });

window.addEventListener('resize', () => {
  if (landingCanvasCtrl) landingCanvasCtrl.resize();
  resizeThree();
  updateNavProgress();
});

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
initThree();
updateNavProgress();
animate();
