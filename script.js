/**
 * script.js — 최예린 포트폴리오 (최종 수정본)
 * ─────────────────────────────────────
 * 1. Landing canvas pointer glow
 * 2. Three.js GLB 3D model (modeling.glb) — 투명하고 알록달록 영롱한 크리스탈 재질 및 얼짱 각도 최적화
 * 3. CSS fallback crystal (GLB 실패 시 노출)
 * 4. Tilt interaction on hover
 * 5. Nav progress bar
 * 6. Scroll reveal (Intersection Observer)
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
const follower        = document.querySelector('.cursor-follower');
const revealCards    = document.querySelectorAll('.reveal-card');
const navLinks       = document.querySelectorAll('.topnav a[data-target]');

/* ════════════════════════════════════════
   POINTER STATE
════════════════════════════════════════ */
const pointer = {
  x:  window.innerWidth  * 0.72,
  y:  window.innerHeight * 0.38,
  tx: window.innerWidth  * 0.72,
  ty: window.innerHeight * 0.38,
};

/* ── [수정 사항] 모델링이 누워있거나 정직하게 수직으로 깎여 보이지 않도록, 입체감이 가장 살아나는 황금 사선 각도로 베이스 고정 ── */
const tilt = {
  rx: 26, ry: 32, rz: -8,
  tx: 26, ty: 32, tz: -8,
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
    /* 마우스 아웃 시 다시 원래의 입체감 있는 황금 사선 기본 각도로 회귀 */
    tilt.tx = 26; tilt.ty = 32; tilt.tz = -8;
    return;
  }
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  
  /* 호버 시에도 납작해지지 않고 사선 밸런스를 유지하면서 유연하게 틸트되도록 바인딩 */
  tilt.tx = 26 + ny * -20;
  tilt.ty = 32 + nx * 26;
  tilt.tz = -8 + nx * 6;
};

/* ════════════════════════════════════════
   THREE.JS — 투명하고 영롱하게 반짝이는 크리스탈 글래스 렌더링
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelMesh       = null;
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
  threeRenderer.toneMappingExposure = 1.35; // 반짝임을 극대화하기 위해 노출값 미세 상향

  /* ── Scene ── */
  threeScene = new THREE.Scene();
  threeScene.background = null;

  /* ── Camera ── */
  threeCamera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  threeCamera.position.set(0, 0.3, 4.2);

  /* ── Lights (알록달록하고 영롱한 난반사를 만들어낼 멀티플 조명 레이어) ── */
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  threeScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff3e0, 2.8);
  keyLight.position.set(4, 6, 4);
  threeScene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xaae961, 2.0); // 형광 그린 하이라이트광
  rimLight.position.set(-5, 3, -2);
  threeScene.add(rimLight);

  const backLight = new THREE.DirectionalLight(0xb388ff, 1.8); // 영롱한 보라 배후광
  backLight.position.set(0, -3, -4);
  threeScene.add(backLight);

  // 표면에 알록달록 무지갯빛 반사광을 한 층 더 더해줄 포인트 조명
  const ptRainbowA = new THREE.PointLight(0xdbff86, 3.5, 7);
  ptRainbowA.position.set(2, 2, 2);
  threeScene.add(ptRainbowA);

  const ptRainbowB = new THREE.PointLight(0x00f5ff, 2.5, 7); // 청량감을 줄 사이언 블루 틴트광
  ptRainbowB.position.set(-2, -1.5, 2);
  threeScene.add(ptRainbowB);

  /* ── Environment map ── */
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

      /* ── 깨지지 않으면서 완벽하게 투명하고 알록달록 영롱한 최고급 유리/크리스탈 텍스처 매핑 ── */
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow    = false;
        child.receiveShadow = false;

        const crystal = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          metalness:          0.02,
          roughness:          0.03,                // 표면을 더 매끄럽고 쨍하게 마감 처리
          transmission:       0.95,                // 맑고 깨끗하게 투과되는 유리 질감 (깨짐 방지)
          thickness:          1.6,                 // 영롱함을 배가시키는 굴절 깊이감
          ior:                1.58,                // 크리스탈에 가까운 고굴절 지수 설정
          envMapIntensity:    3.5,                 // 환경광 반사율 대폭 상향
          clearcoat:          1.0,                 // 겉면에 얹어진 완벽한 코팅막 레이어
          clearcoatRoughness: 0.02,
          iridescence:        1.0,                 // [핵심] 알록달록한 오로라빛 반사광을 위한 박막 간섭 최대화
          iridescenceIOR:     1.45,
          iridescenceThicknessRange: [120, 450],   // 영롱한 무지갯빛 스펙트럼 범위 확장
          opacity:            0.92,
          transparent:        true,
          side:               THREE.DoubleSide,
          attenuationColor:   new THREE.Color(0xe6ffcc), // 고급스러운 네온 라임빛 감쇠색
          attenuationDistance: 1.8,
          reflectivity:       0.98,
        });

        child.material = crystal;
      });

      threeScene.add(model);
      modelMesh   = model;
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
  pointer.x += (pointer.tx - pointer.x) * 0.16;
  pointer.y += (pointer.ty - pointer.y) * 0.16;

  /* Smooth tilt lag */
  tilt.rx += (tilt.tx - tilt.rx) * 0.14;
  tilt.ry += (tilt.ty - tilt.ry) * 0.14;
  tilt.rz += (tilt.tz - tilt.rz) * 0.14;

  /* Landing canvas glow */
  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  /* Three.js render */
  if (threeRenderer && threeScene && threeCamera) {
    if (modelMesh) {
      if (!tilt.hovering) {
        /* 마우스가 없을 때도 심심하지 않게 사선축을 기준으로 고급스럽고 부드럽게 자동 자전 */
        modelAutoRotY += 0.005;
      }
      /* 황금 비율 각도가 보정된 상태 위에서 틸트 애니메이션 구동 */
      modelMesh.rotation.x = THREE.MathUtils.degToRad(tilt.rx);
      modelMesh.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry);
      modelMesh.rotation.z = THREE.MathUtils.degToRad(tilt.rz);

      /* 공중에 영롱하게 떠 있는 듯한 플로팅 인터랙션 유지 */
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
});

window.addEventListener('pointerleave', () => {
  pointer.tx = window.innerWidth  * 0.72;
  pointer.ty = window.innerHeight * 0.38;
  tilt.hovering = false;
  tilt.tx = 26; tilt.ty = 32; tilt.tz = -8;
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
