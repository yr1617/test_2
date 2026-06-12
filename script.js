import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    DOM ELEMENT REFS
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');   
const crystalFallback = document.querySelector('#crystal-fallback');
const follower        = document.querySelector('.cursor-follower');
const navLinks       = document.querySelectorAll('.nav-menu a');
const sections       = document.querySelectorAll('section, main');

/* ════════════════════════════════════════
    INTERACTION STATE
════════════════════════════════════════ */
// 마우스 커서는 화면 전체 좌표를 기본으로 추적합니다.
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

const rotationState = {
  currentX: 0, currentY: 0,
  targetX:  0, targetY:  0,
  isHovered: false 
};

let modelAutoRotY = 0; 
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    LANDING CANVAS BACKGROUND
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
    glow.addColorStop(0,    'rgba(255,255,255,0.06)');
    glow.addColorStop(0.3,  'rgba(150,100,255,0.03)');
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
    THREE.JS ENGINE (오로라 크리스탈)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

const initThree = () => {
  if (!modelCanvas) return;

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true,
    antialias:   true,
    powerPreference: 'high-performance',
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  threeRenderer.setSize(W, H);
  
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.LinearToneMapping; 
  threeRenderer.toneMappingExposure = 1.4; 

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.4); 

  const ambient = new THREE.AmbientLight(0xffffff, 0.9); 
  threeScene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xffffff, 3.5);
  mainLight.position.set(3, 5, 4);
  threeScene.add(mainLight);

  const laserCyan = new THREE.SpotLight(0x00ffff, 30.0, 25, Math.PI / 3, 0.5, 1);
  laserCyan.position.set(5, 5, 4);
  threeScene.add(laserCyan);

  const laserMagenta = new THREE.SpotLight(0xff00ff, 35.0, 25, Math.PI / 3, 0.5, 1);
  laserMagenta.position.set(-5, -3, 4);
  threeScene.add(laserMagenta);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      
      if (modelAnchor) threeScene.remove(modelAnchor);

      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale   = 1.95 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      model.rotation.set(Math.PI / 2.3, 0, 0); 

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,
          metalness:          0.0,
          roughness:          0.0,        
          transmission:       0.99,       
          ior:                1.46,       
          thickness:          1.5,        
          clearcoat:          1.0,        
          clearcoatRoughness: 0.0,
          dispersion:         4.0,        
          opacity:            1.0,
          transparent:        true,
          side:               THREE.DoubleSide
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      if (crystalFallback) crystalFallback.style.display = 'none';
      hideSiteLoader();
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 에러", err);
      hideSiteLoader();
    }
  );
};

const hideSiteLoader = () => {
  const siteLoader = document.querySelector('#site-loader');
  if (siteLoader) {
    setTimeout(() => {
      siteLoader.classList.add('is-loaded');
    }, 400); 
  }
};

/* ════════════════════════════════════════
    MAIN ANIMATION LOOP (마우스 감옥 탈출 및 렉 전면 소독)
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  // 🎯 마우스 포인터 좌표 추적은 스크롤과 상관없이 무조건 독립적으로 돕니다 (마우스 가두기 버그 완벽 탈출)
  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;

  if (follower) {
    // 마우스가 브라우저 전체 화면을 자유롭게 날아다니도록 고정
    follower.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  // 3D 회전 제어
  if (modelAnchor) {
    if (!rotationState.isHovered) {
      // 평소: 느리게 자동 회전
      modelAutoRotY += 0.002;
      rotationState.targetX = 0;
      rotationState.targetY = modelAutoRotY;
    } else {
      // 별 위에 호버 시: 마우스 방향 정밀 매핑
      if (landingDisplay) {
        const rect = landingDisplay.getBoundingClientRect();
        const normX = (pointer.x - rect.left) / rect.width - 0.5;
        const normY = (pointer.y - rect.top) / rect.height - 0.5;
        rotationState.targetX = normY * 1.0; 
        rotationState.targetY = modelAutoRotY + normX * 1.2; 
      }
    }

    rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.05;
    rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.05;

    modelAnchor.rotation.x = rotationState.currentX;
    modelAnchor.rotation.y = rotationState.currentY;
    modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.004;
  }

  // ⚠️ [렉 박멸] 스크롤 조건문을 걷어내고 항상 심플하게 렌더링을 유지시켜 찢어짐과 튕김을 막습니다.
  if (threeRenderer && threeScene && threeCamera) {
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    호버 범위 제한 (오직 별 영역 안에서만 반응)
════════════════════════════════════════ */
const setupHoverEvents = () => {
  // 화면 전체 마우스는 언제나 감지
  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
  });

  if (!landingDisplay) return;

  // 정확히 별 컨테이너에 들어왔을 때만 제어권 획득
  landingDisplay.addEventListener('pointerenter', () => {
    rotationState.isHovered = true;
  });

  // 나가는 순간 락 해제 후 자동 회전
  landingDisplay.addEventListener('pointerleave', () => {
    rotationState.isHovered = false;
  });
};

/* ════════════════════════════════════════
    🧭 스크롤 메뉴바 액티브 라인 연동
════════════════════════════════════════ */
const handleScrollMenu = () => {
  let currentSectionId = "home";
  
  sections.forEach((section) => {
    const sectionTop = section.offsetTop;
    if (window.scrollY >= sectionTop - window.innerHeight * 0.3) {
      currentSectionId = section.getAttribute("id");
    }
  });

  navLinks.forEach((link) => {
    link.classList.remove("active");
    if (link.getAttribute("href") === `#${currentSectionId}`) {
      link.classList.add("active");
    }
  });
};

/* ════════════════════════════════════════
    INITIALIZE
════════════════════════════════════════ */
const initAll = () => {
  if (window.__threeInitialized) return; 
  window.__threeInitialized = true;

  landingCanvasCtrl = setupLandingCanvas();
  setupHoverEvents(); 

  window.addEventListener('scroll', handleScrollMenu, { passive: true });

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
  if (threeRenderer && threeCamera) {
    const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
    threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
    threeCamera.aspect = shell.offsetWidth / shell.offsetHeight;
    threeCamera.updateProjectionMatrix();
  }
});
