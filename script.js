import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    ENGINE DESTROY & CLEAN 공정
════════════════════════════════════════ */
if (window.animFrameId) {
  cancelAnimationFrame(window.animFrameId);
  window.animFrameId = null;
}

if (window.threeRenderer) {
  window.threeRenderer.dispose();
  const domCanvas = document.querySelector('#model-canvas');
  if (domCanvas) {
    const gl = domCanvas.getContext('webgl2') || domCanvas.getContext('webgl');
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  window.threeRenderer = null;
}

window.threeScene = null;
window.threeCamera = null;
window.modelAnchor = null;
window.__threeInitialized = false;

/* ════════════════════════════════════════
    DOM ELEMENT REFS
════════════════════════════════════════ */
const landing = document.querySelector('.landing');
const landingCanvas = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas = document.querySelector('#model-canvas');   
const follower = document.querySelector('.cursor-follower');
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li, .project-card-item');

const eliminateFakeModels = () => {
  const fakeIds = ['#crystal-fallback', '#codex-3d', '.fallback-layer', '.crystal-backup', '#three-debug-hud'];
  fakeIds.forEach(selector => {
    const el = document.querySelector(selector);
    if (el) el.style.setProperty('display', 'none', 'important');
  });
};

// 마우스 트래킹 변수 (화면 중심 기준 -1 ~ 1 값으로 변환용)
const mouse = { x: 0, y: 0 };
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

// 💡 기본 시작 각도 셋팅 (정면에서 입체감이 딱 예쁘게 살아나는 기본 고정축)
const baseRotation = { x: 0.45, y: -0.4 };
const rotationState = { currentX: 0.45, currentY: -0.4 };

const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    LANDING CANVAS BACKGROUND
════════════════════════════════════════ */
const setupLandingCanvas = () => {
  if (!landing || !landingCanvas) return null;
  const ctx = landingCanvas.getContext('2d');
  if (!ctx) return null;
  let state = { width: 0, height: 0, dpr: 1 };

  const resize = () => {
    const rect = landing.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    
    landingCanvas.width = Math.max(1, Math.floor(rect.width * state.dpr));
    landingCanvas.height = Math.max(1, Math.floor(rect.height * state.dpr));
    
    landingCanvas.style.width = `${rect.width}px`;
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
    glow.addColorStop(0, 'rgba(255,255,255,0.09)');
    glow.addColorStop(0.3, 'rgba(160,110,255,0.04)');
    glow.addColorStop(1, 'rgba(16,16,18,0)');
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
  const x = ((pointer.x - rect.left) / Math.max(rect.width, 1)) * 100;
  const y = ((pointer.y - rect.top) / Math.max(rect.height, 1)) * 100;
  landing.style.setProperty('--pointer-x', `${clamp01(x / 100) * 100}%`);
  landing.style.setProperty('--pointer-y', `${clamp01(y / 100) * 100}%`);
};

// 💡 맑은 투명도와 대비감을 극대화하기 위한 가상 인공 스튜디오 광원 맵 생성
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = null; 

  const topLight = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.5, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  topLight.position.set(0, 8, 0);
  scene.add(topLight);

  const leftPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x00ffff })
  );
  leftPanel.position.set(-7, 3, -2);
  scene.add(leftPanel);

  const rightPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff00ff })
  );
  rightPanel.position.set(7, 2, 2);
  scene.add(rightPanel);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const renderTarget = pmremGenerator.fromScene(scene);
  pmremGenerator.dispose();
  
  renderTarget.texture.mapping = THREE.CubeReflectionMapping;
  return renderTarget.texture;
};

/* ════════════════════════════════════════
    THREE.JS MAIN RENDER PIPELINE
════════════════════════════════════════ */
const initThree = () => {
  if (!modelCanvas || window.__threeInitialized) return;
  window.__threeInitialized = true;

  window.threeScene = new THREE.Scene();

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  window.threeRenderer = new THREE.WebGLRenderer({
    canvas: modelCanvas,
    alpha: true,         // 배경 투명화 필수 (웹사이트 배경 그라데이션 투과)
    antialias: true,
    powerPreference: "high-performance"
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  window.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping; 
  window.threeRenderer.toneMappingExposure = 2.0; 

  // 강력한 직사 핀조명 세팅 (대비감 극대화)
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 7.0);
  dirLight1.position.set(5, 12, 7);
  window.threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xddf0ff, 4.0);
  dirLight2.position.set(-6, -2, 5);
  window.threeScene.add(dirLight2);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  window.threeScene.add(ambientLight);

  window.threeCamera = new THREE.PerspectiveCamera(25, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.8); 

  const envTexture = generatePureEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Math.random()}`,
    (gltf) => {
      if(!gltf || !gltf.scene) {
        hideSiteLoader();
        return;
      }
      if(window.modelAnchor) window.threeScene.remove(window.modelAnchor);

      const model = gltf.scene;

      // 💡 불투명한 회색 유기를 지우고, 안쪽 겹침이 투명하게 정돈되도록 메터리얼 전면 재설계
      const crystalMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.02,             // 극도로 투명하고 매끄러운 질감
        transparent: true,
        opacity: 0.28,               // 불투명함을 걷어내고 배경이 완전히 투과되도록 투명도 설정
        transmission: 1.0,           // 빛을 100% 통과시켜 맑은 크리스탈 구현
        ior: 2.2,                    // 굴절률을 높여 겹친 내부 메쉬가 영롱하게 굴절되도록 유도
        side: THREE.DoubleSide,      
        depthWrite: false,           // 투명 메쉬 내부 정렬 꼬임 방지
        depthTest: true,
        iridescence: 1.0,            // 프리즘 무지개 효과 활성화
        iridescenceIOR: 2.5,
        iridescenceThicknessRange: [140, 380], // 영롱한 오로라 스펙트럼 유도
        clearcoat: 1.0,              // 겉면에 유리가 코팅된 듯한 반사광 레이어 추가
        clearcoatRoughness: 0.0,
        specularIntensity: 2.5
      });

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = crystalMaterial;
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      // 스케일 오토 레이아웃
      const IDEAL_LAYOUT_BOUNDS = 2.1; 
      const box = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = IDEAL_LAYOUT_BOUNDS / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);

      window.modelAnchor = new THREE.Group();
      window.modelAnchor.add(model);
      window.threeScene.add(window.modelAnchor);

      eliminateFakeModels(); 
      hideSiteLoader();
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 실패", err);
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

const resizeThree = () => {
  if (!window.threeRenderer || !window.threeCamera) return;
  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  window.threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
  window.threeCamera.aspect = shell.offsetWidth / shell.offsetHeight;
  window.threeCamera.updateProjectionMatrix();
};

/* ════════════════════════════════════════
    MAIN ANIMATION LOOP
════════════════════════════════════════ */
const animate = () => {
  window.animFrameId = requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (window.threeRenderer && window.threeScene && window.threeCamera) {
    if (window.modelAnchor) {
      // 💡 [호버 기반 유연한 제한 관성 회전 인터랙션]
      // 마우스의 위치(mouse.x, mouse.y)에 따라 정해진 범위(최대 약 25도 내외) 안에서만 부드럽게 기울어집니다.
      const targetRotationX = baseRotation.x + (mouse.y * 0.45);
      const targetRotationY = baseRotation.y + (mouse.x * 0.55);

      rotationState.currentX += (targetRotationX - rotationState.currentX) * 0.06;
      rotationState.currentY += (targetRotationY - rotationState.currentY) * 0.06;

      window.modelAnchor.rotation.x = rotationState.currentX;
      window.modelAnchor.rotation.y = rotationState.currentY;

      // 부드러운 유영 효과 추가
      window.modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.015;
    }
    window.threeRenderer.render(window.threeScene, window.threeCamera);
  }
};

/* ════════════════════════════════════════
    MOUSE HOVER INTERACTION SETUP
════════════════════════════════════════ */
const setupHoverEvents = () => {
  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;

    // 💡 화면 중심을 기준으로 마우스의 위치를 -1 ~ 1 사이의 비율값으로 정규화
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
};

const initAll = () => {
  landingCanvasCtrl = setupLandingCanvas();
  setupHoverEvents(); // 드래그 제거 후 원본 호버 이벤트 리스너 결합
  eliminateFakeModels(); 

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
