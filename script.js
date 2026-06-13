import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    ENGINE DESTROY & CLEAN
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
    DOM REFS
════════════════════════════════════════ */
const landing      = document.querySelector('.landing');
const landingCanvas= document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas  = document.querySelector('#model-canvas');
const follower     = document.querySelector('.cursor-follower');
const navLinks     = document.querySelectorAll('.topnav a[data-target]');
const sections     = [];

const eliminateFakeModels = () => {
  const fakeIds = ['#crystal-fallback', '.fallback-layer', '.crystal-backup'];
  fakeIds.forEach(id => {
    const el = document.querySelector(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  });
};

const mouse = { x: 0, y: 0 };
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

// 2. 모델링이 눕지 않고 멋지게 비스듬히 정면을 유지하게끔 베이스 각도 정밀 수정
const baseRotation  = { x: 0.25, y: -0.5 };
const rotationState = { currentX: 0.25, currentY: -0.5 };

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
    glow.addColorStop(0, 'rgba(255,255,255,0.06)');
    glow.addColorStop(0.4, 'rgba(93,53,163,0.03)');
    glow.addColorStop(1, 'rgba(21,21,23,0)');
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

/* ════════════════════════════════════════
    NAVIGATION NAV-PROGRESS CONTROLLER
════════════════════════════════════════ */
const buildSectionMap = () => {
  sections.length = 0;
  navLinks.forEach(link => {
    const id = link.getAttribute('data-target');
    const targetEl = document.getElementById(id);
    if (targetEl) {
      sections.push({ link, id, el: targetEl });
    }
  });
};

const updateNavProgress = () => {
  const scrollY = window.scrollY;
  const vpHeight = window.innerHeight;
  const docHeight = document.documentElement.scrollHeight;
  const maxScroll = docHeight - vpHeight;

  sections.forEach((sec, idx) => {
    const rect = sec.el.getBoundingClientRect();
    const topInDoc = rect.top + scrollY;
    const height = rect.height;

    const bar = sec.link.querySelector('.nav-progress');
    if (!bar) return;

    let progress = 0;

    // 3. 프로그레스 바가 마디마디 끊기지 않고 100% 꽉 차도록 계산식 수정 전개
    if (scrollY + vpHeight >= docHeight - 10) {
      progress = (idx === sections.length - 1) ? 1 : 0;
    } else {
      const startTrigger = topInDoc - vpHeight * 0.5;
      const endTrigger = topInDoc + height - vpHeight * 0.5;

      if (scrollY >= startTrigger && scrollY <= endTrigger) {
        const totalTriggerDist = endTrigger - startTrigger;
        if (totalTriggerDist > 0) {
          progress = (scrollY - startTrigger) / totalTriggerDist;
        } else {
          progress = 1;
        }
      } else if (scrollY > endTrigger) {
        progress = 1;
      } else {
        progress = 0;
      }
    }

    const nextSec = sections[idx + 1];
    if (nextSec) {
      const nextRect = nextSec.el.getBoundingClientRect();
      const nextTopInDoc = nextRect.top + scrollY;
      if (scrollY >= nextTopInDoc - vpHeight * 0.5) {
        progress = 1;
      }
    }

    let isCurrentActive = false;
    const triggerOffset = vpHeight * 0.5;
    if (scrollY + triggerOffset >= topInDoc && scrollY + triggerOffset < topInDoc + height) {
      isCurrentActive = true;
    }
    if (scrollY + vpHeight >= docHeight - 10 && idx === sections.length - 1) {
      isCurrentActive = true;
    }

    if (!isCurrentActive && progress < 1) {
      progress = 0;
    }

    bar.style.transform = `scaleX(${clamp01(progress)})`;
  });
};

/* ════════════════════════════════════════
    FOLDER GUI ENVIRONMENT
════════════════════════════════════════ */
const setupFolderGUI = () => {
  const folders = document.querySelectorAll('.folder-item');
  const modal = document.getElementById('folder-modal');
  const mTitle = document.getElementById('modal-title');
  const mBody = document.getElementById('modal-body');
  const mClose = document.getElementById('modal-close');
  const mBackdrop = document.getElementById('modal-backdrop');

  if (!modal) return;

  // 4. 세네번 눌러야 열리던 오작동 해결: 클릭(선택 강조) 및 더블 클릭(즉시 상세 오픈) 구현
  folders.forEach(folder => {
    // 1번 클릭 시 바탕화면 아이콘 선택 상태 강조
    folder.addEventListener('click', (e) => {
      e.stopPropagation();
      folders.forEach(f => f.classList.remove('is-selected'));
      folder.classList.add('is-selected');
    });

    // 더블 클릭 시 즉각 폴더 팝업창 활성화
    folder.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      folders.forEach(f => f.classList.remove('is-selected'));
      folder.classList.add('is-selected');

      const title = folder.getAttribute('data-title') || 'Project Details';
      const detailHTML = folder.querySelector('.folder-detail-src')?.innerHTML || '내용이 없습니다.';

      if (mTitle) mTitle.textContent = title;
      if (mBody) mBody.innerHTML = detailHTML;

      modal.classList.add('is-active');
      document.body.style.overflow = 'hidden';
    });
  });

  document.addEventListener('click', () => {
    folders.forEach(f => f.classList.remove('is-selected'));
  });

  const closeModal = () => {
    modal.classList.remove('is-active');
    document.body.style.overflow = '';
  };

  if (mClose) mClose.addEventListener('click', closeModal);
  if (mBackdrop) mBackdrop.addEventListener('click', closeModal);
};

const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = null;

  const topLight = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  topLight.position.set(0, 6, 0);
  scene.add(topLight);

  const frontPanel = new THREE.Mesh(
    new THREE.BoxGeometry(6, 6, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  frontPanel.position.set(0, 1.5, 5);
  scene.add(frontPanel);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const renderTarget = pmremGenerator.fromScene(scene);
  pmremGenerator.dispose();
  
  renderTarget.texture.mapping = THREE.CubeReflectionMapping;
  return renderTarget.texture;
};

/* ════════════════════════════════════════
    THREE.JS MAIN ENGINE
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
  window.threeRenderer.toneMappingExposure = 1.2;

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 3.5);
  dirLight1.position.set(5, 8, 5);
  window.threeScene.add(dirLight1);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  window.threeScene.add(ambientLight);

  window.threeCamera = new THREE.PerspectiveCamera(24, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.5);

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

      // 1. [실버 메탈릭 고밀도 재질 구현] 내부 거미줄선 교차가 전혀 드러나지 않는 하이글로시 크롬 실버 메탈릭 매티리얼
      const silverMetallicMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,            // 매끄러운 반사를 품은 크롬 실버 베이스
        metalness: 0.98,            // 98% 메탈 설정으로 완벽한 금속 거울면 질감 연출
        roughness: 0.1,             // 엣지 단차의 가상 스튜디오 반사광 극대화
        side: THREE.DoubleSide
      });

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = silverMetallicMaterial;
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      const IDEAL_LAYOUT_BOUNDS = 1.9;
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
    }, 400);
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
      // 2. 부드럽고 쫀득한 반응을 주되, 제한을 여유롭게 주어 어설프게 뻑뻑해지는 현상 완벽 방지
      const targetRotationX = baseRotation.x + (mouse.y * 0.35);
      const targetRotationY = baseRotation.y + (mouse.x * 0.45);

      rotationState.currentX += (targetRotationX - rotationState.currentX) * 0.05;
      rotationState.currentY += (targetRotationY - rotationState.currentY) * 0.05;

      window.modelAnchor.rotation.x = rotationState.currentX;
      window.modelAnchor.rotation.y = rotationState.currentY;

      window.modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.012;
    }
    window.threeRenderer.render(window.threeScene, window.threeCamera);
  }
};

const setupHoverEvents = () => {
  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
};

const setupReveal = () => {
  const cards = document.querySelectorAll('.reveal-card');
  if (!cards.length) return;
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
  );
  cards.forEach(c => obs.observe(c));
};

/* ════════════════════════════════════════
    INIT ALL
════════════════════════════════════════ */
const initAll = () => {
  landingCanvasCtrl = setupLandingCanvas();
  setupHoverEvents();
  eliminateFakeModels();
  buildSectionMap();
  setupReveal();
  setupFolderGUI();

  initThree();
  animate();

  window.addEventListener('scroll', () => {
    updateNavProgress();

    const spotlight = document.querySelector('.page-spotlight');
    if (spotlight) {
      const px = (pointer.x / window.innerWidth)  * 100;
      const py = (pointer.y / window.innerHeight) * 100;
      spotlight.style.setProperty('--page-pointer-x', `${px}%`);
      spotlight.style.setProperty('--page-pointer-y', `${py}%`);
    }
  }, { passive: true });

  updateNavProgress();
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
