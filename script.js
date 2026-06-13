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

window.threeScene    = null;
window.threeCamera   = null;
window.modelAnchor   = null;
window.__threeInitialized = false;

/* ════════════════════════════════════════
    DOM ELEMENT REFS
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');   
const follower        = document.querySelector('.cursor-follower');
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li, .project-card-item');

const eliminateFakeModels = () => {
  const fakeIds = ['#crystal-fallback', '#codex-3d', '.fallback-layer', '.crystal-backup'];
  fakeIds.forEach(selector => {
    const el = document.querySelector(selector);
    if (el) el.style.setProperty('display', 'none', 'important');
  });
};

const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };
const rotationState = { currentX: 0, currentY: 0, targetX: 0, targetY: 0, isDragging: false, previousMouseX: 0, previousMouseY: 0 };
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
    HIGH-END ENVIRONMENT MAP (오로라 프리즘 광원)
════════════════════════════════════════ */
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(12, 12, 12);
  const mats = [
    new THREE.MeshBasicMaterial({ color: 0x00f3ff, side: THREE.BackSide }), // Cyan Edge
    new THREE.MeshBasicMaterial({ color: 0x04040c, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0xff00ca, side: THREE.BackSide }), // Magenta Edge
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), // White Highlight
    new THREE.MeshBasicMaterial({ color: 0x060612, side: THREE.BackSide })  
  ];
  const box = new THREE.Mesh(geo, mats);
  scene.add(box);

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
    alpha: true, 
    antialias: true
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

  // 🌟 상하단이 잘리는 현상을 막기 위해 카메라 화각(FOV)을 조금 넓히고 안정적인 시야 거리를 확보합니다.
  window.threeCamera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.8); 

  const envTexture = generatePureEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const ambient = new THREE.AmbientLight(0xffffff, 1.0);
  window.threeScene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
  dirLight.position.set(5, 8, 5);
  window.threeScene.add(dirLight);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Date.now()}`,
    (gltf) => {
      if(window.modelAnchor) window.threeScene.remove(window.modelAnchor);

      const model = gltf.scene;
      window.modelAnchor = new THREE.Group();

      // 💥 [자글거림 영구 제거 기법] 안쪽 면(Back)과 바깥면(Front)의 렌더링 순서를 완전히 분리합니다.
      model.traverse((child) => {
        if (child.isMesh) {
          // 1. 공통 굴절 프리즘 재질 속성 정의
          const baseSpecs = {
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.01,
            transparent: true,
            transmission: 0.96,       // 투명한 크리스탈 유리 바디 구현
            ior: 1.52,                // 실제 리얼한 컴포넌트 굴절률 설정
            thickness: 1.0,           // 유리 내부 빛 굴절 두께감
            envMap: envTexture,
            envMapIntensity: 4.5,     // 에지에 마젠타/사이안 오로라를 강하게 맺히게 함
            depthWrite: true,
            depthTest: true
          };

          // 2. 뒷면 전용 메쉬 생성 및 재질 적용 (안쪽 투과면 선행 렌더링)
          const backMat = new THREE.MeshPhysicalMaterial({ ...baseSpecs, side: THREE.BackSide });
          const backMesh = child.clone();
          backMesh.material = backMat;
          window.modelAnchor.add(backMesh);

          // 3. 앞면 전용 재질 적용 (바깥 외곽선 최종 안착 - 면 찢어짐과 자글거림 소멸)
          const frontMat = new THREE.MeshPhysicalMaterial({ ...baseSpecs, side: THREE.FrontSide });
          child.material = frontMat;
          window.modelAnchor.add(child);
        }
      });

      // 💥 [골든 크기 & 상하 잘림 방지 밸런스 조정] 글자 레이아웃 옆에 딱 맞으면서 테두리가 끊기지 않는 크기 계산
      const TARGET_BOUNDS = 2.4; 
      
      const box    = new THREE.Box3().setFromObject(window.modelAnchor);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = TARGET_BOUNDS / maxDim; 
      
      // 피벗 정렬 및 최적 각도 배치
      window.modelAnchor.children.forEach(c => {
        c.position.sub(centre);
      });
      window.modelAnchor.scale.setScalar(scale);
      window.modelAnchor.rotation.set(Math.PI / 2.3, 0, 0); 

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
      if (!rotationState.isDragging) {
        modelAutoRotY += 0.003;
        rotationState.targetY += 0.003;
      }

      rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.09;
      rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.09;

      window.modelAnchor.rotation.x = rotationState.currentX;
      window.modelAnchor.rotation.y = rotationState.currentY;

      window.modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.006;
    }
    window.threeRenderer.render(window.threeScene, window.threeCamera);
  }
};

/* ════════════════════════════════════════
    DRAG & MOUSE EVENTS
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

    if (!rotationState.isDragging || !window.modelAnchor) return;

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

const initAll = () => {
  landingCanvasCtrl = setupLandingCanvas();
  setupDragEvents(); 
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
