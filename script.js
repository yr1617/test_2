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
const navLinks       = document.querySelectorAll('.topnav a[data-target]');
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li');

/* ════════════════════════════════════════
    POINTER & TILT STATE
════════════════════════════════════════ */
const pointer = {
  x:  window.innerWidth  * 0.5,
  y:  window.innerHeight * 0.5,
  tx: window.innerWidth  * 0.5,
  ty: window.innerHeight * 0.5,
};

const tilt = {
  rx: 0,   
  ry: 0,   
  rz: 0,
  tx: 0, ty: 0, tz: 0,
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
    TILT TARGET UPDATE (감도 조절: 덜 휙휙 돌고 부드럽게)
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
    tilt.tx = 0; tilt.ty = 0; tilt.tz = 0;
    return;
  }
  
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  
  // 💡 너무 가볍게 휙휙 돌지 않도록 회전 반경을 20~25도 내외로 묵직하게 제한했습니다.
  tilt.tx = ny * 22;       
  tilt.ty = nx * 25;       
  tilt.tz = nx * -5;
};

/* ════════════════════════════════════════
    THREE.JS ENGINE (분산 프리즘 유리 재질 적용)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let modelLoaded   = false;
let animFrameId   = null;
let modelAutoRotY = 0;

const initThree = () => {
  if (!modelCanvas) return;

  const shell = landingDisplay;
  const W = shell ? shell.offsetWidth  : 600;
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
  threeRenderer.toneMappingExposure = 1.8; // 유리 투명도를 살리기 위해 밝기 최적화

  threeScene = new THREE.Scene();
  threeScene.background = null;

  threeCamera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.2); 

  // 에러를 유발하던 RoomEnvironment를 지우고 고성능 다방향 입체 조명으로 대체
  const ambient = new THREE.AmbientLight(0xffffff, 1.0);
  threeScene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffffff, 3.5);
  sunLight.position.set(5, 8, 5);
  threeScene.add(sunLight);

  // 무지개 분광을 더 돋보이게 만들어 줄 유색 조명 배치
  const magentaLight = new THREE.DirectionalLight(0xff45ff, 3.0); 
  magentaLight.position.set(-6, 3, 2);
  threeScene.add(magentaLight);

  const cyanLight = new THREE.DirectionalLight(0x00ffff, 3.0); 
  cyanLight.position.set(3, -4, 3);
  threeScene.add(cyanLight);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale   = 2.0 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);

      // 모델 수동 축 보정
      model.rotation.set(Math.PI / 2, Math.PI / 1.15, -Math.PI / 4);

      model.traverse((child) => {
        if (!child.isMesh) return;
        
        // 💎 [예린님 전용: 프리즘 분산 글래스 재질]
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          metalness:          0.0,        
          roughness:          0.01,       // 극도로 매끄러운 유리 표면
          transmission:       1.0,        // 100% 완전 투명 유리 (하얀 탁함 제거)
          ior:                2.4,        // 다이아몬드급 높은 굴절률로 프리즘 유도
          thickness:          1.8,        
          clearcoat:          1.0,        
          clearcoatRoughness: 0.0,
          
          // ✨ [핵심] 빛을 무지갯빛으로 쪼개주는 프리즘 분산 속성 가동!
          dispersion:         7.0,        // 이 수치가 높을수록 알록달록한 분광이 화려해집니다!
          
          // 오로라 광택 레이어 백업
          iridescence:        0.8,        
          iridescenceIOR:     1.7,        
          
          opacity:            1.0,
          transparent:        true,
          side:               THREE.DoubleSide,
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      modelLoaded = true;
      
      if (crystalFallback) crystalFallback.style.display = 'none';

      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) {
        setTimeout(() => {
          siteLoader.classList.add('is-loaded');
        }, 200);
      }
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 실패", err);
      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) siteLoader.classList.add('is-loaded');
      if (crystalFallback) crystalFallback.style.display = 'block';
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
    MAIN ANIMATION LOOP (회전 감도 묵직하게 보정)
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.1;
  pointer.y += (pointer.ty - pointer.y) * 0.1;

  // 💡 보간 계수를 0.08에서 0.04로 낮춰서 스프링처럼 튕기지 않고 슬로우 모션처럼 부드럽고 묵직하게 움직이게 바꿨습니다.
  tilt.rx += (tilt.tx - tilt.rx) * 0.04;
  tilt.ry += (tilt.ty - tilt.ry) * 0.04;
  tilt.rz += (tilt.tz - tilt.rz) * 0.04;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (threeRenderer && threeScene && threeCamera) {
    if (modelAnchor) {
      if (!tilt.hovering) {
        modelAutoRotY += 0.002; // 기본 자동 회전 속도도 반으로 줄여 은은하게 조절
      } else {
        modelAutoRotY += (0 - modelAutoRotY) * 0.04;
      }
      
      modelAnchor.rotation.x = THREE.MathUtils.degToRad(tilt.rx);
      modelAnchor.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry);
      modelAnchor.rotation.z = THREE.MathUtils.degToRad(tilt.rz);
      
      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.02;
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
    INITIALIZE ENTRY
════════════════════════════════════════ */
const initAll = () => {
  landingCanvasCtrl = setupLandingCanvas();

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
  updateNavProgress();
  animate();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

/* ════════════════════════════════════════
    EVENT LISTENERS
════════════════════════════════════════ */
window.addEventListener('pointermove', (e) => {
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  updateTiltTarget(e.clientX, e.clientY);

  if (follower) {
    const target = e.target;
    const isInteractive = target.closest('a, button, .project-card, .main-project-card, .scroll-link, li, .point-highlight');
    follower.classList.toggle('is-link', !!isInteractive);
  }
});

window.addEventListener('pointerleave', () => {
  pointer.tx = window.innerWidth  * 0.5;
  pointer.ty = window.innerHeight * 0.5;
  tilt.hovering = false;
  tilt.tx = 0; tilt.ty = 0; tilt.tz = 0;
  landingDisplay?.classList.remove('is-hovering');
  if (follower) follower.classList.remove('is-link');
});

window.addEventListener('scroll', updateNavProgress, { passive: true });
window.addEventListener('resize', () => {
  if (landingCanvasCtrl) landingCanvasCtrl.resize();
  resizeThree();
  updateNavProgress();
});
