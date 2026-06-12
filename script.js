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
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li');

/* ════════════════════════════════════════
    INTERACTION STATE (마우스 직접 드래그 회전 구현)
════════════════════════════════════════ */
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

// 사용자가 마우스로 직접 굴리는 각도 상태
const rotationState = {
  currentX: 0, currentY: 0,
  targetX:  0, targetY:  0,
  isDragging: false,
  previousMouseX: 0, previousMouseY: 0
};

let modelAutoRotY = 0; // 자전 속도 변수
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    LANDING CANVAS GLOW (2D 배경)
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
    glow.addColorStop(0,    'rgba(255,255,255,0.11)');
    glow.addColorStop(0.2,  'rgba(219,255,134,0.09)');
    glow.addColorStop(0.5,  'rgba(93,53,163,0.07)');
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
    THREE.JS ENGINE (정면 정렬 + 투명도 극대화 극락 셋업)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let modelLoaded   = false;
let animFrameId   = null;

const initThree = () => {
  if (!modelCanvas) return;

  if (threeRenderer) {
    cancelAnimationFrame(animFrameId);
    threeRenderer.dispose();
    threeRenderer = null;
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
  threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1.6; 

  threeScene = new THREE.Scene();

  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.5); 

  // 유리를 맑게 뚫고 지나갈 광원 시스템
  const ambient = new THREE.AmbientLight(0xffffff, 0.8); 
  threeScene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffffff, 3.5);
  sunLight.position.set(5, 8, 4);
  threeScene.add(sunLight);

  const magentaLight = new THREE.DirectionalLight(0xff44aa, 7.0); 
  magentaLight.position.set(-5, 3, 3);
  threeScene.add(magentaLight);

  const cyanLight = new THREE.DirectionalLight(0x00f0ff, 7.0); 
  cyanLight.position.set(5, -3, 3);
  threeScene.add(cyanLight);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      
      while(threeScene.children.length > 4) { 
        threeScene.remove(threeScene.children[threeScene.children.length - 1]);
      }

      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale   = 2.1 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      
      // 💡 [수정] 과도하게 눕지 않도록 정면을 바라보는 우아한 각도로 디폴트 리셋
      model.rotation.set(0, 0, 0);

      model.traverse((child) => {
        if (!child.isMesh) return;
        if (child.material.map) child.material.map = null;
        
        // 💎 [수정] 뿌연 현상을 완전히 지워버리는 100% 생유리 렌더링 세팅
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,   
          metalness:          0.0,        
          roughness:          0.0,        
          transmission:       1.0,        // 완벽 투과
          ior:                1.5,        // 맑은 순수 크리스탈 유리의 실제 굴절률 적용 (뿌연 연산 제거)
          thickness:          0.2,        // 얇고 명쾌하게 떨어지는 두께감
          clearcoat:          1.0,        
          clearcoatRoughness: 0.0,
          
          // 찬란함을 더해줄 분산 효과 추가
          dispersion:         5.0,        
          
          opacity:            1.0,
          transparent:        true,
          side:               THREE.FrontSide, // 💡 [핵심] 뒷면/내부면 연산을 생략하여 하얗게 뭉치던 뿌연 현상을 한 번에 박멸합니다!
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      modelLoaded = true;
      if (crystalFallback) crystalFallback.style.display = 'none';

      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) {
        setTimeout(() => { siteLoader.classList.add('is-loaded'); }, 400); 
      }
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 오류", err);
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
    MAIN ANIMATION LOOP (직관적 드래그 인터랙션)
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
      // 💡 사용자가 마우스를 떼고 드래그하지 않을 때만 스스로 부드럽게 자전합니다.
      if (!rotationState.isDragging) {
        modelAutoRotY += 0.004;
        // 드래그 후 손을 뗐을 때 자연스럽게 감속하며 자전과 합쳐짐
        rotationState.targetY += 0.004;
      }

      // 목표 각도를 향해 부드럽게 감속하며 회전 (Lerp)
      rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.08;
      rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.08;

      // 계산된 마우스 회전값을 모델에 직관적으로 매핑
      modelAnchor.rotation.x = rotationState.currentX;
      modelAnchor.rotation.y = rotationState.currentY;

      // 미세한 상하 공중 부양 이펙트
      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.015;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    DRAG EVENT LISTENERS (원하는 대로 돌려보기)
════════════════════════════════════════ */
const setupDragEvents = () => {
  if (!landingDisplay) return;

  const onPointerDown = (e) => {
    rotationState.isDragging = true;
    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  };

  const onPointerMove = (e) => {
    // 배경 빛 위치 업기
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;

    if (!rotationState.isDragging || !modelAnchor) return;

    // 마우스가 움직인 변화량 계산
    const deltaX = e.clientX - rotationState.previousMouseX;
    const deltaY = e.clientY - rotationState.previousMouseY;

    // 💡 마우스 움직임 방향 그대로 별이 굴러가도록 매핑값 조정
    rotationState.targetY += deltaX * 0.007;
    rotationState.targetX += deltaY * 0.007;

    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  };

  const onPointerUp = () => {
    rotationState.isDragging = false;
  };

  landingDisplay.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
};

/* ════════════════════════════════════════
    INITIALIZE
════════════════════════════════════════ */
const initAll = () => {
  if (window.__threeInitialized) return; 
  window.__threeInitialized = true;

  landingCanvasCtrl = setupLandingCanvas();
  setupDragEvents(); // 드래그 인터랙션 연결

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
