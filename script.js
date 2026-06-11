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
   POINTER STATE
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
   THREE.JS — GLB MODEL WITH CRYSTAL MATERIAL
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelMesh     = null;   // root group of loaded model
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
  threeRenderer.toneMappingExposure = 1.2;
  threeRenderer.shadowMap.enabled   = false; // perf

  /* ── Scene ── */
  threeScene = new THREE.Scene();
  threeScene.background = null; // transparent

  /* ── Camera ── */
  threeCamera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  threeCamera.position.set(0, 0.4, 4.2);

  /* ── Lights ── */
  // Ambient — base fill
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  threeScene.add(ambient);

  // Key light — warm from top-right
  const keyLight = new THREE.DirectionalLight(0xffeedd, 2.4);
  keyLight.position.set(3, 5, 4);
  threeScene.add(keyLight);

  // Rim light — cool from left
  const rimLight = new THREE.DirectionalLight(0xaae961, 1.6);
  rimLight.position.set(-4, 2, -2);
  threeScene.add(rimLight);

  // Back light — purple from behind-bottom
  const backLight = new THREE.DirectionalLight(0x9b6ff5, 1.2);
  backLight.position.set(0, -3, -4);
  threeScene.add(backLight);

  // Point light — green shimmer
  const ptGreen = new THREE.PointLight(0xdbff86, 3.0, 6);
  ptGreen.position.set(1.5, 1.5, 2);
  threeScene.add(ptGreen);

  // Point light — purple shimmer
  const ptPurple = new THREE.PointLight(0x7b56c3, 2.4, 6);
  ptPurple.position.set(-1.5, -1, 1.5);
  threeScene.add(ptPurple);

  /* ── Environment map (simple gradient cube for reflections) ── */
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

        /* ── Crystal material ──
            MeshPhysicalMaterial gives us:
            - transmission   → real-time glass/transparency
            - roughness      → frosted vs clear
            - metalness      → reflectivity base
            - clearcoat      → glossy top layer
            - envMapIntensity → how strongly env reflects
            - iridescence    → rainbow sheen
        ── */
        const crystal = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          metalness:          0.08,
          roughness:          0.06,
          transmission:       0.82,        // glass see-through
          thickness:          1.4,         // refraction depth
          ior:                1.52,        // glass IOR
          envMapIntensity:    2.8,
          clearcoat:          1.0,
          clearcoatRoughness: 0.04,
          iridescence:        0.7,
          iridescenceIOR:     1.38,
          iridescenceThicknessRange: [100, 400],
          opacity:            0.88,
          transparent:        true,
          side:               THREE.DoubleSide,
          // Subtle tint: warm green-white with lavender
          attenuationColor:   new THREE.Color(0xd8ffaa),
          attenuationDistance: 2.0,
          reflectivity:       0.92,
        });

        child.material = crystal;
      });

      threeScene.add(model);
      modelMesh   = model;
      modelLoaded = true;

      /* Hide CSS fallback once GLB is visible */
      if (crystalFallback) crystalFallback.classList.add('is-hidden');
    },
    undefined,
    (err) => {
      /* GLB failed — keep CSS crystal fallback visible */
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
  pointer.x += (pointer.tx - pointer.x) * 0.16;
  pointer.y += (pointer.ty - pointer.y) * 0.16;

  /* Smooth tilt lag */
  tilt.rx += (tilt.tx - tilt.rx) * 0.14;
  tilt.ry += (tilt.ty - tilt.ry) * 0.14;
  tilt.rz += (tilt.tz - tilt.rz) * 0.14;

  /* Cursor follower */
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
        /* Auto-rotate when not hovering */
        modelAutoRotY += 0.006;
      }
      /* Apply tilt from pointer */
      modelMesh.rotation.x = THREE.MathUtils.degToRad(tilt.rx * 0.5);
      modelMesh.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry * 0.4);
      modelMesh.rotation.z = THREE.MathUtils.degToRad(tilt.rz * 0.3);

      /* Subtle float */
      modelMesh.position.y = Math.sin(Date.now() * 0.0009) * 0.08;
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

/* FIX: 마우스가 윈도우를 벗어날 때 3D 오브젝트 회전 기준점을 매끄럽게 연결하고 롤백 보정 */
window.addEventListener('pointerleave', () => {
  pointer.tx = window.innerWidth  * 0.72;
  pointer.ty = window.innerHeight * 0.38;
  
  if (tilt.hovering) {
    // 틸트가 멈추며 복귀하는 각도 오차만큼을 자동 회전 기준축(modelAutoRotY)에 미리 가산하여 역점프 방지
    modelAutoRotY += THREE.MathUtils.degToRad((tilt.ry - 24) * 0.4);
  }
  
  tilt.hovering = false;
  tilt.tx = -10; tilt.ty = 24; tilt.tz = 4;
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
