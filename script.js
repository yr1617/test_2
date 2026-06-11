/**
 * script.js — 최예린 포트폴리오 (오리지널 디자인 복구 및 모델링 자세/재질 정상화 버전)
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
   POINTER STATE & MOUSE TRACKING
════════════════════════════════════════ */
const pointer = {
  x:  window.innerWidth  * 0.72,
  y:  window.innerHeight * 0.38,
  tx: window.innerWidth  * 0.72,
  ty: window.innerHeight * 0.38,
};

const tilt = {
  rx: -10, ry: 24, rz: 4,
  tx: -10, ty: 24, tz: 4,
  hovering: false,
};

const clamp01 = v => Math.max(0, Math.min(1, v));

window.addEventListener('pointermove', (e) => {
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  updateTiltTarget(e.clientX, e.clientY);

  if (follower) {
    follower.classList.toggle('is-link', Boolean(e.target.closest('a, button, [role="button"]')));
  }
});

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
    tilt.tx = -10; tilt.ty = 24; tilt.tz = 4;
    return;
  }
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  tilt.tx = -10 + ny * -24;
  tilt.ty =  24 + nx * 34;
  tilt.tz =   4 + nx * 8;
};

/* ════════════════════════════════════════
   THREE.JS — 3D GLB MODEL ENGINE
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelMesh     = null;
let modelLoaded   = false;
let modelAutoRotY = 0;

const initThree = () => {
  if (!modelCanvas) return;

  const shell = landingDisplay;
  const W = shell ? shell.offsetWidth  : 500;
  const H = shell ? shell.offsetHeight : 600;

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true, // 투명도 확보
    antialias:   true,
    powerPreference: 'high-performance',
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1.5; // 모델링이 좀 더 밝고 고급스럽게 빛나도록 노출 값 상향

  threeScene = new THREE.Scene();

  threeCamera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.5);

  /* 입체적인 조명 보강 */
  const ambient = new THREE.AmbientLight(0xffffff, 0.4); // 주변광은 살짝 줄여서 질감을 살림
  threeScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.5); // 강력한 메인 하이라이트
  keyLight.position.set(5, 7, 5);
  threeScene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0 aae961, 2.5); // 엣지 부분에 초록/보라 반사광 투여
  rimLight.position.set(-5, 4, -3);
  threeScene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x9b6ff5, 2.0);
  fillLight.position.set(0, -4, 2);
  threeScene.add(fillLight);

  /* 🌟 [수정] 흰색 밀가루 현상 제거: 맑고 영롱하게 반사되는 크리스탈/보석 글래스 질감 튜닝 */
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.1,         // 금속 광택 느낌 추가
    roughness: 0.0,         // 완벽하게 매끄러운 표면 처리 (희멀건 느낌 제거)
    transparent: true,
    opacity: 0.45,          // 투명도를 높여 텁텁함 개선
    transmission: 0.95,     // 빛이 투과되도록 투과율 대폭 상승
    ior: 2.417,             // 다이아몬드 수준의 굴절률로 보석처럼 전반사 구현
    side: THREE.DoubleSide,
    depthWrite: true,
    clearcoat: 1.0,         // 표면 코팅광 추가
    clearcoatRoughness: 0.0
  });

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://unpkg.com/three@0.165.0/examples/jsm/libs/draco/');
  loader.setDRACOLoader(draco);

  loader.load(
    'modeling.glb',
    (gltf) => {
      const model = gltf.scene;

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = crystalMaterial;
        }
      });

      /* 🌟 [수정] 누워서 돌아가던 현상 교정: 모델링 자체의 각도를 정방향으로 세우기 */
      model.rotation.x = Math.PI / 2; 

      const box = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      model.position.sub(centre);

      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetScale = 2.3 / maxDim;
      model.scale.setScalar(targetScale);

      modelMesh = new THREE.Group();
      modelMesh.add(model);
      threeScene.add(modelMesh);

      modelLoaded = true;
      if (crystalFallback) {
        crystalFallback.classList.add('is-hidden');
      }
    },
    undefined,
    (error) => {
      console.warn('GLB 로드 실패, CSS 폴백 모드 작동:', error);
    }
  );
};

/* ════════════════════════════════════════
   MAIN TICK ENGINE
════════════════════════════════════════ */
const tick = () => {
  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;
  landingCanvasCtrl?.draw();
  updateLandingVars();

  if (follower) {
    follower.style.left = `${pointer.tx}px`;
    follower.style.top = `${pointer.ty}px`;
  }

  tilt.rx += (tilt.tx - tilt.rx) * 0.08;
  tilt.ry += (tilt.ty - tilt.ry) * 0.08;
  tilt.rz += (tilt.tz - tilt.rz) * 0.08;

  if (modelLoaded && modelMesh) {
    if (!tilt.hovering) {
      modelAutoRotY += 0.006;
      /* 똑바로 선 상태에서 이쁘게 정방향으로 Y축 회전 */
      modelMesh.rotation.set(
        THREE.MathUtils.degToRad(tilt.rx),
        THREE.MathUtils.degToRad(tilt.ry) + modelAutoRotY,
        THREE.MathUtils.degToRad(tilt.rz)
      );
    } else {
      modelMesh.rotation.set(
        THREE.MathUtils.degToRad(tilt.rx),
        THREE.MathUtils.degToRad(tilt.ry),
        THREE.MathUtils.degToRad(tilt.rz)
      );
    }
  }

  if (threeRenderer && threeScene && threeCamera) {
    threeRenderer.render(threeScene, threeCamera);
  }

  requestAnimationFrame(tick);
};

/* ════════════════════════════════════════
   NAVBAR PROGRESS & TRACKING
════════════════════════════════════════ */
const updateNavProgress = () => {
  const scrollY = window.scrollY;
  const docH = document.documentElement.scrollHeight - window.innerHeight;
  const overallProgress = docH > 0 ? scrollY / docH : 0;

  let activeTarget = 'home';
  revealCards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.45) {
      const section = card.closest('section');
      if (section && section.id) {
        activeTarget = section.id;
      }
    }
  });

  navLinks.forEach((link) => {
    const target = link.getAttribute('data-target');
    const isCurrent = target === activeTarget;
    link.classList.toggle('is-active', isCurrent);
    if (isCurrent) {
      link.style.setProperty('--nav-progress', overallProgress);
    } else {
      link.style.setProperty('--nav-progress', '0');
    }
  });
};

/* ════════════════════════════════════════
   SCROLL REVEAL
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
window.addEventListener('pointerleave', () => {
  pointer.tx = window.innerWidth  * 0.72;
  pointer.ty = window.innerHeight * 0.38;
  tilt.hovering = false;
  tilt.tx = -10; tilt.ty = 24; tilt.tz = 4;
  landingDisplay?.classList.remove('is-hovering');
});

window.addEventListener('scroll', updateNavProgress, { passive: true });

window.addEventListener('resize', () => {
  landingCanvasCtrl?.resize();
  if (threeCamera && threeRenderer && landingDisplay) {
    const W = landingDisplay.offsetWidth;
    const H = landingDisplay.offsetHeight;
    threeCamera.aspect = W / H;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(W, H);
  }
});

initThree();
tick();
updateNavProgress();
