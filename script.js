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
 * 8. Dynamically integrated highlighter effect (형광펜 애니메이션 자동 바인딩)
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

/* ── [수정 사항] 모델이 눕거나(평면형) 정직한 정면/탑뷰가 되지 않도록 입체적인 황금 각도 디폴트값 지정 ── */
const tilt = {
  rx: -15, ry: 45, rz: 6,  // 비스듬하면서도 형태가 완전히 살아있는 각도
  tx: -15, ty: 45, tz: 6,
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
    tilt.tx = -15; tilt.ty = 45; tilt.tz = 6; /* 복귀 시에도 정해진 황금 각도로 부드럽게 복원 */
    return;
  }
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  tilt.tx = -15 + ny * -24;
  tilt.ty =  45 + nx * 34;
  tilt.tz =   6 + nx * 8;
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
  threeRenderer.toneMappingExposure = 1.35; // 영롱하게 뿜어져 나오는 빛 강도를 미세하게 상향 조정

  /* ── Scene ── */
  threeScene = new THREE.Scene();
  threeScene.background = null;

  /* ── Camera ── */
  threeCamera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  threeCamera.position.set(0, 0.4, 4.2);

  /* ── Lights (투명하고 알록달록하게 빛 반사를 유도하는 다각도 무지갯빛 조명 배치) ── */
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  threeScene.add(ambient);

  // 메인 광원 - 화이트 오팔 투명 광택 유도
  const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.5);
  keyLight.position.set(4, 6, 4);
  threeScene.add(keyLight);

  // 라임/그린 형광 영롱 림라이트
  const rimLight = new THREE.DirectionalLight(0xaae961, 2.0);
  rimLight.position.set(-4, 3, -1);
  threeScene.add(rimLight);

  // 반대편을 채워주는 프리즘 바이올렛 림라이트
  const backLight = new THREE.DirectionalLight(0xbe9eff, 1.8);
  backLight.position.set(-2, -3, -4);
  threeScene.add(backLight);

  // 프리즘 알록달록 시머 이펙트를 가속하는 다색 포인트 조명군
  const ptGreen = new THREE.PointLight(0xdbff86, 3.5, 7);
  ptGreen.position.set(2, 2, 2);
  threeScene.add(ptGreen);

  const ptPurple = new THREE.PointLight(0x8b5cf6, 3.0, 7);
  ptPurple.position.set(-2, -2, 2);
  threeScene.add(ptPurple);

  const ptCyan = new THREE.PointLight(0x67e8f9, 2.5, 6); // 청록빛 추가로 영롱함 극대화
  ptCyan.position.set(0, 3, -1);
  threeScene.add(ptCyan);

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

      /* ── [수정 사항] 투명하고 알록달록 영롱하게 반짝이되 깨짐(파편화) 현상을 차단한 정교한 재질 정의 ── */
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow    = false;
        child.receiveShadow = false;

        const crystal = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          metalness:          0.02,       // 불필요한 메탈 반사를 줄이고 순수 유리 질감 보존
          roughness:          0.03,       // 표면 매끄러움을 극대화하여 맑고 영롱한 투명도 유지
          transmission:       0.95,       // 완벽에 가까운 맑은 시스루 투명 글래스
          thickness:          1.2,        
          ior:                1.58,       // 굴절률을 살짝 높여 굴절 반사량 증폭 (보석 같은 느낌)
          envMapIntensity:    3.2,        // 주변 환경 광택 투영 가중치 강화
          clearcoat:          1.0,
          clearcoatRoughness: 0.02,
          iridescence:        1.0,        // 무지갯빛 프리즘 광택 최대치 구현 (알록달록함의 핵심)
          iridescenceIOR:     1.45,
          iridescenceThicknessRange: [150, 450],
          opacity:            0.92,
          transparent:        true,
          side:               THREE.DoubleSide,
          attenuationColor:   new THREE.Color(0xe6fffa), // 미세한 아쿠아 오팔 틴트 인입
          attenuationDistance: 1.5,
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

  pointer.x += (pointer.tx - pointer.x) * 0.16;
  pointer.y += (pointer.ty - pointer.y) * 0.16;

  tilt.rx += (tilt.tx - tilt.rx) * 0.14;
  tilt.ry += (tilt.ty - tilt.ry) * 0.14;
  tilt.rz += (tilt.tz - tilt.rz) * 0.14;

  /* ── [수정 사항] 마우스 포인터가 완벽하게 보이므로, 보조 팔로워는 마우스 뒤를 몽환적으로 흐르듯 따라오게만 보정 ── */
  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (threeRenderer && threeScene && threeCamera) {
    if (modelMesh) {
      if (!tilt.hovering) {
        modelAutoRotY += 0.005; /* 오리지널 회전 애니메이션 유지 */
      }
      /* 누운 각도나 직탑뷰가 아닌 입체적이고 아름다운 축 회전 렌더링 */
      modelMesh.rotation.x = THREE.MathUtils.degToRad(tilt.rx);
      modelMesh.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry);
      modelMesh.rotation.z = THREE.MathUtils.degToRad(tilt.rz * 0.5);

      /* 수면 위를 둥둥 떠다니는 듯한 부드러운 유기적 플로팅 루프 유지 */
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
  pointer.tx = window.innerWidth  * 0.72;
  pointer.ty = window.innerHeight * 0.38;
  tilt.hovering = false;
  tilt.tx = -15; tilt.ty = 45; tilt.tz = 6; /* 리브 시 마우스 기본 포지션 및 정해진 입체적 황금각도로 복귀 */
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
