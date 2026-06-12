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

/* ════════════════════════════════════════
    인터랙션 및 마우스 드래그 상태 관리 (완전 수정)
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
    THREE.JS : 레퍼런스 비주얼 완벽 재현 엔진 💎
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let modelLoaded   = false;
let animFrameId   = null;

const initThree = () => {
  if (!modelCanvas) return;

  // 잔재 엔진 완전 폭파 청소
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
  
  // 💡 레퍼런스처럼 칼 같은 하이라이트 대비를 위해 톤매핑 조절
  threeRenderer.toneMapping      = THREE.NeutralToneMapping;
  threeRenderer.toneMappingExposure = 2.2; 

  threeScene = new THREE.Scene();

  threeCamera = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);
  // 💡 카메라 위치를 살짝 위로 올려서 누워있는 모델을 정면 구도로 포착
  threeCamera.position.set(0, 0.4, 4.6); 

  // 💡 [조명 시스템 변혁] 레퍼런스의 강렬한 무지갯빛 대비를 만들기 위한 고휘도 대비 광원
  const ambient = new THREE.AmbientLight(0xffffff, 0.4); 
  threeScene.add(ambient);

  // 뒤에서 강하게 내리쬐는 백라이트 (유리 경계면을 하얗게 빛내줌)
  const backLight = new THREE.DirectionalLight(0xffffff, 4.0);
  backLight.position.set(-2, 4, -4);
  threeScene.add(backLight);

  // 프리즘 오로라 스펙트럼 광원 1 (사이버 틱한 사이안블루)
  const laserCyan = new THREE.SpotLight(0x00f6ff, 12.0, 15, Math.PI / 4, 0.5, 1);
  laserCyan.position.set(4, 5, 3);
  threeScene.add(laserCyan);

  // 프리즘 오로라 스펙트럼 광원 2 (강렬한 마젠타 핑크)
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
      
      // 씬 내부 전면 초기화 청소
      while(threeScene.children.length > 5) { 
        threeScene.remove(threeScene.children[threeScene.children.length - 1]);
      }

      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale   = 2.2 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      
      // 💡 [핵심 보정] 완전히 누워버리던 축을 강제로 정면을 바라보게 각도 심폐소생!
      model.rotation.set(Math.PI / 2.4, 0, 0); 

      model.traverse((child) => {
        if (!child.isMesh) return;
        if (child.material.map) child.material.map = null;
        
        // 💎 레퍼런스(reference1.png)의 묵직하고 영롱하게 부서지는 최고급 크리스탈 글래스 셋업
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,   
          metalness:          0.05,        
          roughness:          0.01,        // 칼날 같은 모서리를 위한 극상의 매끄러움
          transmission:       0.95,       // 아주 미세한 굴절 두께감을 남겨두는 투과율
          ior:                2.42,       // 💡 다이아몬드 지표수 적용하여 빛 굴절 극대화
          thickness:          0.8,        // 💡 굴절면이 화려하게 꺾이도록 두께감 강화
          clearcoat:          1.0,        
          clearcoatRoughness: 0.0,
          
          // ✨ 프리즘 무지갯빛 분산 효과 최대치 적용
          dispersion:         11.0,       // 💡 모서리 경계면마다 무지갯빛 오로라가 칼같이 박히게 만듭니다.
          
          opacity:            1.0,
          transparent:        true,
          side:               THREE.FrontSide, // 탁하고 뿌연 겹침 완벽 차단
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      modelLoaded = true;
      if (crystalFallback) crystalFallback.style.display = 'none';

      // 3D 별이 완전히 준비되었을 때만 로딩 화면을 확실하게 무너트립니다.
      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) {
        setTimeout(() => {
          siteLoader.classList.add('is-loaded');
        }, 500);
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
      // 드래그 안 할 때는 은은하게 흐르듯 자동 자전
      if (!rotationState.isDragging) {
        modelAutoRotY += 0.003;
        rotationState.targetY += 0.003;
      }

      // 회전 물리 스무스하게 Lerp 보간
      rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.09;
      rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.09;

      // 계산된 각도값 대입
      modelAnchor.rotation.x = rotationState.currentX;
      modelAnchor.rotation.y = rotationState.currentY;

      // 공중 부양 이펙트
      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.01;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    DRAG EVENTS (화면 전체 영역 바인딩으로 먹통 방지)
════════════════════════════════════════ */
const setupDragEvents = () => {
  // 드래그 시작은 landingDisplay 위에서만
  if (!landingDisplay) return;

  landingDisplay.addEventListener('pointerdown', (e) => {
    rotationState.isDragging = true;
    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  });

  // 💡 움직임과 떼는 이벤트는 window 전체에 걸어 마우스가 튀어도 추적되도록 보완
  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;

    if (!rotationState.isDragging || !modelAnchor) return;

    const deltaX = e.clientX - rotationState.previousMouseX;
    const deltaY = e.clientY - rotationState.previousMouseY;

    // 드래그 방향에 맞춰 직관적으로 모델 롤링
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
