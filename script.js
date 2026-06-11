import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ════════════════════════════════════════
   1. DOM REFS & STATE
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const container      = document.querySelector('#landing-display') || document.querySelector('.landing-display');
const canvas         = document.querySelector('#model-canvas');
const follower       = document.querySelector('.cursor-follower');
const revealCards    = document.querySelectorAll('.reveal-card');
const navLinks       = document.querySelectorAll('.topnav a[data-target]');

const pointer = {
  x:  window.innerWidth  * 0.72,
  y:  window.innerHeight * 0.50,
  tx: window.innerWidth  * 0.72,
  ty: window.innerHeight * 0.50,
};

const tilt = {
  rx: 0, ry: 0, rz: 0,
  tx: 0, ty: 0, tz: 0,
  hovering: false,
};

const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
   2. LANDING CANVAS GLOW
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
    glow.addColorStop(0,    'rgba(255,255,255,0.12)'); 
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
   3. THREE.JS — 3D CRYSTAL MODEL (정치수 보정 완료)
════════════════════════════════════════ */
let renderer, scene, camera, modelMesh;
let modelAutoRotY = 0;

if (container && canvas) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.set(0, 0, 4.2);

  renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
  mainLight.position.set(4, 6, 5);
  scene.add(mainLight);

  const rimLight = new THREE.DirectionalLight(0xdcff87, 1.8);
  rimLight.position.set(-5, 3, 2);
  scene.add(rimLight);

  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.02,
    transparent: true,
    transmission: 0.96,
    ior: 1.65,
    thickness: 1.2,         
    clearcoat: 1.0,         
    clearcoatRoughness: 0.0,
    side: THREE.DoubleSide
  });

  const loader = new GLTFLoader();
  loader.load('modeling.glb', (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.isMesh) {
        child.material = crystalMaterial;
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.sub(center);
    
    model.rotation.set(0, 0, 0);

    scene.add(model);
    modelMesh = model;
    
    document.getElementById('crystal-fallback')?.classList.add('is-hidden');
  }, undefined, (error) => {
    console.error('모델 로드 실패:', error);
    document.getElementById('crystal-fallback')?.classList.remove('is-hidden');
  });
}

/* ════════════════════════════════════════
   4. TILT INTERACTION
════════════════════════════════════════ */
const updateTiltTarget = (clientX, clientY) => {
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const inside =
    clientX >= rect.left && clientX <= rect.right &&
    clientY >= rect.top  && clientY <= rect.bottom;

  tilt.hovering = inside;

  if (!inside) {
    tilt.tx = 0; tilt.ty = 0; tilt.tz = 0;
    return;
  }
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  
  tilt.tx = ny * -15;
  tilt.ty = nx * 20;
  tilt.tz = nx * 4;
};

/* ════════════════════════════════════════
   5. MAIN ANIMATION LOOP
════════════════════════════════════════ */
const animate = () => {
  requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.12;
  pointer.y += (pointer.ty - pointer.y) * 0.12;

  tilt.rx += (tilt.tx - tilt.rx) * 0.12;
  tilt.ry += (tilt.ty - tilt.ry) * 0.12;
  tilt.rz += (tilt.tz - tilt.rz) * 0.12;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (renderer && scene && camera) {
    if (modelMesh) {
      if (!tilt.hovering) {
        modelAutoRotY += 0.005;
      }
      modelMesh.rotation.x = THREE.MathUtils.degToRad(tilt.rx);
      modelMesh.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry);
      modelMesh.rotation.z = THREE.MathUtils.degToRad(tilt.rz);
      modelMesh.position.y = Math.sin(Date.now() * 0.001) * 0.05;
    }
    renderer.render(scene, camera);
  }
};

/* ════════════════════════════════════════
   6. NAV PROGRESS
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
   7. SCROLL REVEAL
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
   8. EVENT LISTENERS
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
  pointer.ty = window.innerHeight * 0.50;
  
  if (tilt.hovering) {
    modelAutoRotY += THREE.MathUtils.degToRad(tilt.ry);
  }
  
  tilt.hovering = false;
  tilt.tx = 0; tilt.ty = 0; tilt.tz = 0;
});

window.addEventListener('scroll', updateNavProgress, { passive: true });

window.addEventListener('resize', () => {
  if (landingCanvasCtrl) landingCanvasCtrl.resize();
  if (renderer && camera && container) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  updateNavProgress();
});

/* ════════════════════════════════════════
   9. START
════════════════════════════════════════ */
updateNavProgress();
animate();
