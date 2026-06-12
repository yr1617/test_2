import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    DOM ELEMENTS (예린님 원본 마크업 철저 보존)
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');   
const crystalFallback = document.querySelector('#crystal-fallback');
const follower        = document.querySelector('.cursor-follower');

// 🎯 화면 전체 전역 마우스 좌표 (마우스 가두기 버그 원천 차단)
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

const rotationState = {
  currentX: 0, currentY: 0,
  targetX:  0, targetY:  0,
  isHovered: false 
};

let modelAutoRotY = 0; 
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    LANDING BACKGROUND GLOW
════════════════════════════════════════ */
const setupLandingCanvas = () => {
  if (!landing || !landingCanvas) return null;
  const ctx = landingCanvas.getContext('2d');
  if (!ctx) return null;
  const state = { width: 0, height: 0 };

  const resize = () => {
    const rect = landing.getBoundingClientRect();
    state.width  = rect.width;
    state.height = rect.height;
    landingCanvas.width  = rect.width;
    landingCanvas.height = rect.height;
    landingCanvas.style.width  = `${rect.width}px`;
    landingCanvas.style.height = `${rect.height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  const draw = () => {
    if (!state.width || !state.height) return;
    ctx.clearRect(0, 0, state.width, state.height);
    const rect = landing.getBoundingClientRect();
    const px = pointer.x - rect.left;
    const py = pointer.y - rect.top;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, Math.max(state.width, state.height) * 0.52);
    glow.addColorStop(0,    'rgba(255,255,255,0.05)');
    glow.addColorStop(0.3,  'rgba(150,100,255,0.02)');
    glow.addColorStop(1,    'rgba(16,16,18,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, state.width, state.height);
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
    THREE.JS ENGINE (초경량 세팅으로 스크롤 렉 차단)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

const initThree = () => {
  if (!modelCanvas) return;

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  
  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true,
    antialias:   false, // ⚡ 그래픽 연산 최소화로 렉 발생 방지
    powerPreference: 'high-performance',
  });
  threeRenderer.setPixelRatio(1); // ⚡ 픽셀 밀도 고정으로 스크롤 버벅임 완전 차단
  threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
  
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.LinearToneMapping; 
  threeRenderer.toneMappingExposure = 1.4; 

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(28, shell.offsetWidth / shell.offsetHeight, 0.1, 100);
  threeCamera.position.set(0, 0, 4.4); 

  // 조명 구성
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
          roughness:          0.1,        
          transmission:       0.95,       
          ior:                1.46,       
          thickness:          1.0,        
          clearcoat:          0.5,        
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
    MAIN ANIMATION LOOP
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  // 🎯 마우스는 브라우저 화면 전체 창을 자유롭게 따라다닙니다.
  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (modelAnchor) {
    if (!rotationState.isHovered) {
      // 🔄 평소 상태: 느릿하게 자동으로 계속 무한 회전
      modelAutoRotY += 0.002;
      rotationState.targetX = 0;
      rotationState.targetY = modelAutoRotY;
    } else {
      // 🎯 마우스 호버 상태: 자동 회전을 일시 정지하고 오직 마우스 방향에 따라 정밀 회전
      if (landingDisplay) {
        const rect = landingDisplay.getBoundingClientRect();
        const normX = (pointer.x - rect.left) / rect.width - 0.5;
        const normY = (pointer.y - rect.top) / rect.height - 0.5;
        rotationState.targetX = normY * 0.8; 
        rotationState.targetY = modelAutoRotY + normX * 1.0; 
      }
    }

    rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.05;
    rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.05;

    modelAnchor.rotation.x = rotationState.currentX;
    modelAnchor.rotation.y = rotationState.currentY;
  }

  // 브라우저 돔을 건드리지 않고 순수 쓰리제스 영역만 렌더링 유지 (렉 해제)
  if (threeRenderer && threeScene && threeCamera) {
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    EVENT LISTENERS
════════════════════════════════════════ */
const setupEvents = () => {
  // 브라우저 화면 전체에서 마우스 좌표 전역 추적
  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
  });

  if (!landingDisplay) return;

  // 오직 물체 주변(#landing-display) 영역에 들어왔을 때만 호버 제어 모드 활성화
  landingDisplay.addEventListener('pointerenter', () => {
    rotationState.isHovered = true;
  });

  // 영역을 벗어나면 다시 자동 회전
  landingDisplay.addEventListener('pointerleave', () => {
    rotationState.isHovered = false;
  });
};

/* ════════════════════════════════════════
    INITIALIZE
════════════════════════════════════════ */
const initAll = () => {
  if (window.__threeInitialized) return; 
  window.__threeInitialized = true;

  landingCanvasCtrl = setupLandingCanvas();
  setupEvents(); 

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
/* ════════════════════════════════════════
    상단 메뉴바 스크롤 진행도(Active) 연동 로직
════════════════════════════════════════ */
window.addEventListener("scroll", () => {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  
  // 전체 스크롤 진행 비율 계산 (0 ~ 1)
  const scrollPercentage = docHeight > 0 ? scrollTop / docHeight : 0;

  // 상단 메뉴바의 모든 링크를 찾아 하단 게이지와 active 상태 업데이트
  document.querySelectorAll(".topnav a").forEach((link) => {
    // 1단계에서 CSS에 추가한 --nav-progress 변수에 수치를 실시간으로 주입
    link.style.setProperty("--nav-progress", scrollPercentage);
    
    // 스크롤이 조금이라도 내려가면 active 클래스를 켜서 텍스트 불빛 활성화
    if (scrollPercentage > 0.01) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
});
