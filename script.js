import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    DOM ELEMENT REFS (안전성 최우선 확보)
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
    INTERACTION STATE (예린님의 인터랙션 기획 반영)
════════════════════════════════════════ */
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

const rotationState = {
  currentX: 0, currentY: 0,
  targetX:  0, targetY:  0,
  isHovered: false // 🎯 모델 영역 위에 마우스가 올라갔는지 체크하는 플래그
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
    state.dpr    = Math.min(window.devicePixelRatio || 1, 1.3); // DPR 제한으로 렉 방지
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
    THREE.JS ENGINE (경량화 및 오로라 프리즘)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

const initThree = () => {
  if (!modelCanvas) return;

  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (threeRenderer) threeRenderer.dispose();

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true,
    antialias:   true, // 노이즈 억제용 안티앨리어싱
    powerPreference: 'high-performance',
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // 렉 방지를 위해 픽셀밀도 최적화
  threeRenderer.setSize(W, H);
  
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.LinearToneMapping; 
  threeRenderer.toneMappingExposure = 1.4; 

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.4); 

  // 조명 세팅
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
          dispersion:         4.0, // 자글자글한 픽셀 깨짐 현상을 없앤 임계값
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
    }, 500); 
  }
};

/* ════════════════════════════════════════
    MAIN ANIMATION LOOP (호버 회전 로직 최적화)
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  // 💡 스크롤 중일 때는 불필요한 마우스 물리 연산을 중단하여 렉을 완전히 박멸합니다.
  if (window.scrollY < window.innerHeight) {
    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;

    if (follower) {
      follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
    }

    updateLandingVars();
    if (landingCanvasCtrl) landingCanvasCtrl.draw();

    if (threeRenderer && threeScene && threeCamera && modelAnchor) {
      if (!rotationState.isHovered) {
        // 🔄 1. 평소 상태: 느릿하게 자동으로 무한 회전
        modelAutoRotY += 0.003;
        rotationState.targetX = 0;
        rotationState.targetY = modelAutoRotY;
      } else {
        // 🎯 2. 호버 상태: 자동 회전을 멈추고 마우스 방향을 끈끈하게 추적
        const rect = landingDisplay.getBoundingClientRect();
        const normX = (pointer.x - rect.left) / rect.width - 0.5;
        const normY = (pointer.y - rect.top) / rect.height - 0.5;

        rotationState.targetX = normY * 1.2; 
        rotationState.targetY = modelAutoRotY + normX * 1.5; 
      }

      rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.06;
      rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.06;

      modelAnchor.rotation.x = rotationState.currentX;
      modelAnchor.rotation.y = rotationState.currentY;
      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.005;
    }
  }

  if (threeRenderer && threeScene && threeCamera) {
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    🎯 호버 범위 제한 이벤트 (정밀 타겟팅)
════════════════════════════════════════ */
const setupHoverEvents = () => {
  if (!landingDisplay) return;

  // 마우스가 3D 디스플레이 영역 안으로 들어왔을 때만 제어 활성화
  landingDisplay.addEventListener('pointerenter', () => {
    rotationState.isHovered = true;
  });

  landingDisplay.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
  });

  // 마우스가 3D 디스플레이 영역을 벗어나면 다시 느릿하게 자동 회전 시작
  landingDisplay.addEventListener('pointerleave', () => {
    rotationState.isHovered = false;
  });
};

/* ════════════════════════════════════════
    🧭 스크롤 연동 메뉴바 활성화
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
