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
    TILT TARGET UPDATE (감도 5배 대폭 상향 조정 및 완전 정방향)
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
  
  // 마우스의 위치 레이시오 (-1 ~ 1 변환)
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  
  // 💡 마우스가 우측/상단으로 갈 때 각도가 시원하게 커지도록 한계치를 수십도 단위로 뻥튀기했습니다.
  tilt.tx = ny * 45;       // 위아래로 최대 45도까지 경사
  tilt.ty = nx * 55;       // 마우스 따라 좌우로 최대 55도까지 정방향 회전
  tilt.tz = nx * -15;
};

/* ════════════════════════════════════════
    THREE.JS ENGINE (수동 축 뒤틀기 보정 + 오로라 프리즘)
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
  threeRenderer.toneMappingExposure = 2.2; // 탁한 느낌을 지우기 위해 노출을 대폭 올림

  threeScene = new THREE.Scene();
  threeScene.background = null;

  threeCamera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.2); 

  // 조명이 사방에서 강렬하게 비추도록 다이내믹 컬러 라이팅 추가
  const ambient = new THREE.AmbientLight(0xffffff, 1.5);
  threeScene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffffff, 4.0);
  sunLight.position.set(5, 8, 5);
  threeScene.add(sunLight);

  const magentaLight = new THREE.DirectionalLight(0xff00ff, 4.5); // 알록달록함을 강제로 입힐 핑크/마젠타 조명
  magentaLight.position.set(-6, 3, 2);
  threeScene.add(magentaLight);

  const cyanLight = new THREE.DirectionalLight(0x00ffff, 4.5); // 크리스탈 특유의 청량함을 더해줄 사이안 조명
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

      // 💡 [초강력 축 반전 처방] 모델이 왼쪽을 보고 누워있으므로, Y축과 Z축을 강제로 반대 각도로 세게 뒤틀어 정면을 보게 만듭니다.
      model.rotation.set(Math.PI / 2, Math.PI / 1.15, -Math.PI / 4);

      model.traverse((child) => {
        if (!child.isMesh) return;
        
        // 💎 하얗고 둔탁한 느낌을 지우고 맑게 투과되는 홀로그램 유리 질감 커스텀
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          metalness:          0.0,        
          roughness:          0.001,       // 완전 매끄러운 크리스탈 유리 거울면
          transmission:       1.0,         // 100% 투명하게 통과시킴으로써 하얗고 탁한 면 소멸
          thickness:          2.0,        
          ior:                2.4,         // 다이아몬드급 굴절률 적용하여 내부 반사 극대화
          clearcoat:          1.0,        
          clearcoatRoughness: 0.0,
          
          // ✨ 빛반사 없이도 알록달록하게 광채가 나도록 자체 간섭 무늬 풀 가동
          iridescence:        1.0,        
          iridescenceIOR:     2.5,        
          iridescenceThicknessRange: [200, 700], 
          
          opacity:            1.0,
          transparent:        true,
          side:               THREE.DoubleSide,
          depthWrite:         true,
          depthTest:          true
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
    MAIN ANIMATION LOOP
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.1;
  pointer.y += (pointer.ty - pointer.y) * 0.1;

  tilt.rx += (tilt.tx - tilt.rx) * 0.08;
  tilt.ry += (tilt.ty - tilt.ry) * 0.08;
  tilt.rz += (tilt.tz - tilt.rz) * 0.08;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (threeRenderer && threeScene && threeCamera) {
    if (modelAnchor) {
      if (!tilt.hovering) {
        modelAutoRotY += 0.005; // 평소에는 좀 더 역동적으로 자동 회전
      } else {
        // 마우스를 올리면 겉 부모 앵커가 마우스 각도를 쫀득하게 직관적으로 쫓아갑니다
        modelAutoRotY += (0 - modelAutoRotY) * 0.1;
      }
      
      modelAnchor.rotation.x = THREE.MathUtils.degToRad(tilt.rx);
      modelAnchor.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry);
      modelAnchor.rotation.z = THREE.MathUtils.degToRad(tilt.rz);
      
      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.04;
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
