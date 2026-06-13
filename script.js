import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    DOM ELEMENT REFS
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');   
const follower        = document.querySelector('.cursor-follower');
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li, .project-card-item');

// 가짜 백업 레이어 관련 스크립트 에러 유발 요소 완전 삭제

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
    THREE.JS ENGINE
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

// 유리가 투과할 초고대비 네온 프리즘 텍스처를 씬 배경과 환경에 동시에 주입
const createAdvancedEnvMap = (renderer) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  
  // 전체 배경을 웹사이트 기본 어두운 톤으로 채움
  ctx.fillStyle = '#101012';
  ctx.fillRect(0, 0, 1024, 1024);
  
  // 레퍼런스의 칼날 같은 무지개 하이라이트를 유도할 고대비 네온 라인 배치
  const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
  grad.addColorStop(0.0, '#101012');
  grad.addColorStop(0.3, '#ff0055'); // 마젠타 핑크 하이라이트 원천
  grad.addColorStop(0.5, '#101012');
  grad.addColorStop(0.7, '#00ffcc'); // 시안 민트 하이라이트 원천
  grad.addColorStop(0.9, '#ffffff'); // 쨍한 백색 하이라이트
  grad.addColorStop(1.0, '#101012');
  
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const envCube = pmremGenerator.fromEquirectangular(texture);
  
  pmremGenerator.dispose();
  texture.dispose();
  
  return envCube.texture;
};

const initThree = () => {
  if (!modelCanvas) return;

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (threeRenderer) {
    threeRenderer.dispose();
    threeRenderer = null;
  }

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       false, // ⚠️ 배경을 투명하게 빼면 투과가 먹통이 되므로 false 고정
    antialias:   true,
    powerPreference: 'high-performance'
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping; 
  threeRenderer.toneMappingExposure = 1.5; 

  threeScene = new THREE.Scene();

  // 🌌 씬 배경과 환경 맵을 일치시켜 유리가 배경을 완벽히 인식하고 투과하도록 처리
  const envTexture = createAdvancedEnvMap(threeRenderer);
  threeScene.background = new THREE.Color('#101012'); // 기본 우주 배경 톤
  threeScene.environment = envTexture; // 유리에 맺힐 프리즘 환경

  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.4); 

  // 조명 세팅 - 겉면을 태우지 않고 각진 경계선에만 하이라이트를 응축
  const ambient = new THREE.AmbientLight(0xffffff, 0.1);
  threeScene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffffff, 3.5);
  sunLight.position.set(1, 4, 3);
  threeScene.add(sunLight);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      
      if (modelAnchor) {
        threeScene.remove(modelAnchor);
      }

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

        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }

        // 💎 [레퍼런스 완벽 구현] 100% 배경 투과 및 광학 무지개 분산 크리스탈 재질
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,         
          metalness:          0.0,               
          roughness:          0.0,               // 거울처럼 매끄러운 텍스처
          transparent:        true,
          side:               THREE.FrontSide,   // 내부 겹침 지직거림 노이즈 완전 제거
          depthWrite:         false,

          // ✨ 에어로젤 탈출 공정: 100% 완전 투명 투과 및 초고굴절
          transmission:       1.0,               // 유리를 통과해 뒷배경이 100% 다 보임
          ior:                2.42,              // 다이아몬드급 초고굴절로 명암비 극대화
          thickness:          2.5,               // 유리 두께를 늘려 왜곡과 반사 하이라이트 증폭

          // 🌈 가짜 색칠 대신 실제 빛이 쪼개지는 광학 프리즘 스펙트럼 적용
          iridescence:        1.0,               
          iridescenceIOR:     2.0,               
          iridescenceThicknessRange: [250, 450], // 각면 모서리마다 청록과 핑크선이 날카롭게 맺히는 영역

          clearcoat:          1.0,               // 고광택 하이글로시 유리막 코팅
          clearcoatRoughness: 0.0
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);

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

  // HTML 변수 업데이트는 유지하되, 캔버스 중복 드로잉 제거하여 렌더링 부하 방지
  if (landing) {
    const rect = landing.getBoundingClientRect();
    const x = ((pointer.x - rect.left) / Math.max(rect.width,  1)) * 100;
    const y = ((pointer.y - rect.top)  / Math.max(rect.height, 1)) * 100;
    landing.style.setProperty('--pointer-x', `${clamp01(x / 100) * 100}%`);
    landing.style.setProperty('--pointer-y', `${clamp01(y / 100) * 100}%`);
  }

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
  resizeThree();
});
