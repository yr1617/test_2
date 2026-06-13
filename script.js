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

// 마우스 트래킹 변수
const mouse = { x: 0, y: 0 };
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

// 기본 시작 각도 셋팅
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

// 🔥 레퍼런스의 영롱한 무지개(오로라) 반사광을 표면에 강제로 주입할 하이엔드 광원 맵 세팅
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = null; 

  const topLight = new THREE.Mesh(
    new THREE.BoxGeometry(15, 0.5, 15),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  topLight.position.set(0, 10, 0);
  scene.add(topLight);

  // 무지개 프리즘 굴절광을 가상으로 만들어줄 초고휘도 네온 패널 배치
  const cyanPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x00ffff })
  );
  cyanPanel.position.set(-8, 4, -2);
  scene.add(cyanPanel);

  const magentaPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff00ff })
  );
  magentaPanel.position.set(8, 3, 2);
  scene.add(magentaPanel);

  const yellowPanel = new THREE.Mesh(
    new THREE.BoxGeometry(10, 10, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xffff00 })
  );
  yellowPanel.position.set(0, -4, -6);
  scene.add(yellowPanel);

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
    antialias: true,
    powerPreference: "high-performance"
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  window.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping; 
  window.threeRenderer.toneMappingExposure = 2.6; // 크리스탈 하이라이트를 극대화하기 위해 업그레이드

  // 계단식 칼각 엣지를 선명하게 각인시킬 강력한 스포트라이트 조합
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 9.0);
  dirLight1.position.set(6, 15, 8);
  window.threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xecf5ff, 5.0);
  dirLight2.position.set(-8, -4, 6);
  window.threeScene.add(dirLight2);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
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

      // 🔥 [진짜 최종 정답] 내부 꼬인 거미줄 선은 100% 무조건 삭제하고, 레퍼런스의 영롱한 프리즘 유리만 남기는 기법
      const crystalMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.0,               // 유리 표면을 맑고 쨍하게 윤이 나도록 세팅
        transparent: true,
        
        // 🔮 [치명적 버그 수정] transmission을 0.0으로 빼서 내부 메쉬 정렬 에러(시꺼멓게 타는 버그)를 원천 차단합니다.
        transmission: 0.0,            
        opacity: 0.45,                // 대신 투명도를 직접 제어하여 내부 선 비침 없이 맑은 투명 필름 효과 유도
        
        // 🛠️ 내부 관통선 차단을 위한 완벽한 드로잉 차폐막 설정
        side: THREE.FrontSide,        // 6단 별의 '겉피부면'만 그리고 내부로 파고든 쓰레기 거미줄 면은 렌더링에서 강제 제외!
        depthWrite: false,            // 면이 다중으로 겹칠 때 생기는 투명도 정렬 오류 및 시꺼먼 얼룩 원천 차단
        depthTest: true,

        // ✨ [레퍼런스 저격] 프리즘 유리 특유의 영롱한 무지개 오로라 광채 주입
        iridescence: 1.0,             // 무지개 스펙트럼 강도를 100% 최대로 끌어올림
        iridescenceIOR: 2.4,          // 무지개 반사광 굴절률을 높여 엣지마다 보석처럼 반짝이게 묘사
        iridescenceThicknessRange: [150, 380], // 레퍼런스와 정확히 똑같은 핑크, 네온 블루, 그린 오로라 그라데이션 형성
        
        clearcoat: 1.0,               // 표면에 고광택 투명 코팅막을 한 겹 레이어링하여 칼각 단차 강조
        clearcoatRoughness: 0.0,
        specularIntensity: 3.0,       // 빛을 받았을 때 각진 모서리가 눈부시게 빛나도록 하이라이트 추가
        specularColor: new THREE.Color(0xffffff)
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
      const targetRotationX = baseRotation.x + (mouse.y * 0.45);
      const targetRotationY = baseRotation.y + (mouse.x * 0.55);

      rotationState.currentX += (targetRotationX - rotationState.currentX) * 0.06;
      rotationState.currentY += (targetRotationY - rotationState.currentY) * 0.06;

      window.modelAnchor.rotation.x = rotationState.currentX;
      window.modelAnchor.rotation.y = rotationState.currentY;

      // 부드러운 유영 효과
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

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
};

const initAll = () => {
  landingCanvasCtrl = setupLandingCanvas();
  setupHoverEvents(); 
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
