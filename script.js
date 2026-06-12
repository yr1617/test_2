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
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li');

// 💡 [추가] 가짜 코덱스 3D 유령 박멸용 타겟팅 (HTML에 존재하는 기존 컴포넌트 ID나 클래스에 맞게 체크)
const codexFakeModel = document.querySelector('.codex-3d, #codex-fallback, .display-frame > svg, .display-frame > img');

/* ════════════════════════════════════════
    INTERACTION STATE
════════════════════════════════════════ */
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

const rotationState = {
  currentX: 0, currentY: 0,
  targetX:  0, targetY:  0,
  isDragging: false,
  previousMouseX: 0, previousMouseY: 0
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
    glow.addColorStop(0,    'rgba(255,255,255,0.08)');
    glow.addColorStop(0.3,  'rgba(150,100,255,0.04)');
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
    THREE.JS ENGINE (지직거림 완벽 소독 버전)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

const initThree = () => {
  if (!modelCanvas) return;

  // 💡 [중요] 지직거림(Z-Fighting) 원천 차단: 기존에 돌던 프레임과 렌더러 메모리를 완전히 폭파 청소
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (threeRenderer) {
    threeRenderer.dispose();
    threeRenderer = null;
  }

  // 자바스크립트가 켜지자마자 기존 가짜 코덱스 그래픽이 있다면 강제로 증발시킵니다.
  if (codexFakeModel) {
    codexFakeModel.style.display = 'none';
    codexFakeModel.style.opacity = '0';
  }

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true,
    antialias:   true,
    powerPreference: 'high-performance',
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.NeutralToneMapping;
  threeRenderer.toneMappingExposure = 2.0; 

  threeScene = new THREE.Scene();

  // 💡 아래로 처박히는 현상 해결: 카메라의 Y축을 0으로 완전히 맞추고 정중앙을 쳐다보게 세팅
  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.4); 

  // 광원 시스템
  const ambient = new THREE.AmbientLight(0xffffff, 0.4); 
  threeScene.add(ambient);

  const backLight = new THREE.DirectionalLight(0xffffff, 4.0);
  backLight.position.set(-2, 4, -4);
  threeScene.add(backLight);

  const laserCyan = new THREE.SpotLight(0x00f6ff, 12.0, 15, Math.PI / 4, 0.5, 1);
  laserCyan.position.set(4, 5, 3);
  threeScene.add(laserCyan);

  const laserMagenta = new THREE.SpotLight(0xff00bb, 15.0, 15, Math.PI / 4, 0.5, 1);
  laserMagenta.position.set(-5, -2, 2);
  threeScene.add(laserMagenta);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      
      // 혹시 남아있을지 모를 무대 위 찌꺼기 메쉬 완전 삭제
      while(threeScene.children.length > 5) { 
        threeScene.remove(threeScene.children[threeScene.children.length - 1]);
      }

      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      // 박스 크기에 너무 꽉 차서 잘리지 않도록 스케일 살짝 축소 보정 (2.2 -> 1.95)
      const scale   = 1.95 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      
      // 💡 누워있던 기본 모델링 축 보정 각도 셋업
      model.rotation.set(Math.PI / 2.3, 0, 0); 

      model.traverse((child) => {
        if (!child.isMesh) return;
        if (child.material.map) child.material.map = null;
        
        // 프리즘 최고급 크리스탈 글래스 재질 
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,   
          metalness:          0.05,        
          roughness:          0.01,        
          transmission:       0.95,       
          ior:                2.42,       
          thickness:          0.8,        
          clearcoat:          1.0,        
          clearcoatRoughness: 0.0,
          dispersion:         11.0,       // 레퍼런스 특유의 무지갯빛 프리즘 분산 강렬하게 유지
          opacity:            1.0,
          transparent:        true,
          side:               THREE.FrontSide, 
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      if (crystalFallback) crystalFallback.style.display = 'none';

      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) {
        setTimeout(() => {
          siteLoader.classList.add('is-loaded');
        }, 300);
      }
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 에러", err);
      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) siteLoader.classList.add('is-loaded');
    }
  );
};

const resizeThree = () => {
  if (!threeRenderer || !threeCamera) return;
  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
  threeCamera.aspect = shell.offsetWidth / shell.offsetHeight;
  threeCamera.updateProjectionMatrix();
};

/* ════════════════════════════════════════
    MAIN ANIMATION LOOP
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (threeRenderer && threeScene && threeCamera) {
    if (modelAnchor) {
      if (!rotationState.isDragging) {
        modelAutoRotY += 0.003;
        rotationState.targetY += 0.003;
      }

      rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.09;
      rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.09;

      modelAnchor.rotation.x = rotationState.currentX;
      modelAnchor.rotation.y = rotationState.currentY;

      // 💡 아래로 처박혀 잘리는 위험을 방지하기 위해 상하 바운싱 폭을 최소화
      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.005;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    DRAG EVENTS
════════════════════════════════════════ */
const setupDragEvents = () => {
  if (!landingDisplay) return;

  landingDisplay.addEventListener('pointerdown', (e) => {
    rotationState.isDragging = true;
    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  });

  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;

    if (!rotationState.isDragging || !modelAnchor) return;

    const deltaX = e.clientX - rotationState.previousMouseX;
    const deltaY = e.clientY - rotationState.previousMouseY;

    rotationState.targetY += deltaX * 0.008;
    rotationState.targetX += deltaY * 0.008;

    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  });

  window.addEventListener('pointerup', () => {
    rotationState.isDragging = false;
  });
};

/* ════════════════════════════════════════
    INITIALIZE
════════════════════════════════════════ */
const initAll = () => {
  if (window.__threeInitialized) return; 
  window.__threeInitialized = true;

  landingCanvasCtrl = setupLandingCanvas();
  setupDragEvents(); 

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
  animate();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

window.addEventListener('resize', () => {
  if (landingCanvasCtrl) landingCanvasCtrl.resize();
  resizeThree();
});
