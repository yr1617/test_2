/**
 * script.js — 최예린 포트폴리오 (최종 버그 수정본)
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
   POINTER STATE & MOUSE FIX
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

/* 커스텀 마우스 좌표 추적 엔진 버그 수정 완료 */
let currentX = window.innerWidth / 2;
let currentY = window.innerHeight / 2;

window.addEventListener('mousemove', (e) => {
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
   THREE.JS — GLB MODEL 로딩 및 완벽 정렬 수리
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
  const W = shell ? shell.offsetWidth  : 500;
  const H = shell ? shell.offsetHeight : 600;

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
  threeRenderer.toneMappingExposure = 1.2;

  threeScene = new THREE.Scene();
  threeScene.background = null;

  threeCamera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.5);

  /* 조명 시스템 */
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  threeScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffeedd, 2.5);
  keyLight.position.set(4, 6, 4);
  threeScene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xaae961, 1.8);
  rimLight.position.set(-4, 3, -2);
  threeScene.add(rimLight);

  const backLight = new THREE.DirectionalLight(0x9b6ff5, 1.5);
  backLight.position.set(0, -3, -4);
  threeScene.add(backLight);

  /* 영롱한 크리스탈 마스터 재질 세팅 */
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.65,
    transmission: 0.9,
    ior: 1.5,
    side: THREE.DoubleSide,
    depthWrite: true
  });

  /* 오리지널 modeling.glb 정밀 호출 */
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://unpkg.com/three@0.165.0/examples/jsm/libs/draco/');
  loader.setDRACOLoader(draco);

  loader.load(
    'modeling.glb',
    (gltf) => {
      const model = gltf.scene;

      // 크리스탈 재질 모든 하위 메시에 강제 적용
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = crystalMaterial;
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      // 정중앙 바운딩 박스 크기 및 비율 재교정
      const box = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      model.position.sub(centre);

      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetScale = 2.4 / maxDim; // 3D 피사체 크기 키움
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
      console.warn('GLB 로딩에 실패하여 CSS 다이아몬드 대체 모드를 활성화합니다:', error);
    }
  );
};

/* ════════════════════════════════════════
   MAIN ENGINE LOOP
════════════════════════════════════════ */
const tick = () => {
  // 부드러운 마우스 커서 추적 보간 연산 (Lerp)
  currentX += (pointer.tx - currentX) * 0.15;
  currentY += (pointer.ty - currentY) * 0.15;
  if (follower) {
    follower.style.left = `${currentX}px`;
    follower.style.top = `${currentY}px`;
  }

  // 랜딩 발광체 마우스 팔로잉 연산
  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;
  landingCanvasCtrl?.draw();
  updateLandingVars();

  // 3D 회전 및 마우스 틸트 반응식
  tilt.rx += (tilt.tx - tilt.rx) * 0.08;
  tilt.ry += (tilt.ty - tilt.ry) * 0.08;
  tilt.rz += (tilt.tz - tilt.rz) * 0.08;

  if (modelLoaded && modelMesh) {
    if (!tilt.hovering) {
      modelAutoRotY += 0.006;
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

  animFrameId = requestAnimationFrame(tick);
};

/* ════════════════════════════════════════
   NAVBAR PROGRESS & SECTIONS TRACKING
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
   INITIALIZATION & RESIZE WINDOW
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

// 부트업 실행
initThree();
tick();
updateNavProgress();
