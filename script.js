import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    ENGINE RE-INIT PROTECTION (안전한 초기화)
════════════════════════════════════════ */
if (window.animFrameId) {
  cancelAnimationFrame(window.animFrameId);
  window.animFrameId = null;
}
if (window.threeRenderer) {
  window.threeRenderer.dispose();
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
  ['#crystal-fallback','#codex-3d','.fallback-layer','.crystal-backup','#three-debug-hud'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.style.setProperty('display','none','important');
  });
};

/* ════════════════════════════════════════
    마우스 트래킹 & 전역 상태 변수
════════════════════════════════════════ */
const mouse = { x: 0, y: 0 };
const pointer = {
  x: window.innerWidth * 0.5,  y: window.innerHeight * 0.5,
  tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5
};
const clamp01 = v => Math.max(0, Math.min(1, v));

// 내부 모션용 회전 상태 변수
const baseRotation = { x: 0, y: 0 }; 
const rotState     = { x: 0, y: 0 };

let isHoveringModel = false; 
let isModalOpen = false; 

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
    glow.addColorStop(0,   'rgba(255,255,255,0.09)');
    glow.addColorStop(0.3, 'rgba(160,110,255,0.04)');
    glow.addColorStop(1,   'rgba(16,16,18,0)');
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
  landing.style.setProperty('--pointer-x', `${clamp01(x/100)*100}%`);
  landing.style.setProperty('--pointer-y', `${clamp01(y/100)*100}%`);
};

/* ════════════════════════════════════════
    크롬 은빛 반사용 가상 돔 스튜디오 생성
════════════════════════════════════════ */
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = null;

  // 크롬 금속 굴곡면에 강한 흰색 하이라이트 선을 맺히게 해줄 고휘도 조명판 커스텀 배치
  const topLight = new THREE.Mesh(
    new THREE.BoxGeometry(100, 10, 100),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  topLight.position.set(0, 35, 0);
  scene.add(topLight);

  const leftPanel = new THREE.Mesh(
    new THREE.BoxGeometry(6, 60, 60),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  leftPanel.position.set(-30, 10, -10);
  scene.add(leftPanel);

  const rightPanel = new THREE.Mesh(
    new THREE.BoxGeometry(6, 60, 60),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  rightPanel.position.set(30, 10, -10);
  scene.add(rightPanel);

  const frontPanel = new THREE.Mesh(
    new THREE.BoxGeometry(60, 60, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  frontPanel.position.set(0, 10, 35);
  scene.add(frontPanel);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(scene);
  pmrem.dispose();
  rt.texture.mapping = THREE.CubeReflectionMapping;
  return rt.texture;
};

/* ════════════════════════════════════════
    THREE.JS ENGINE MAIN
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
    powerPreference: 'high-performance',
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  window.threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping;
  window.threeRenderer.toneMappingExposure = 2.5; // 밝기를 끌어올려 메탈감을 화사하게 부스팅

  // 일어선 정면을 강하게 때려줄 스튜디오 광원 추가 배치
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 9.0);
  dirLight1.position.set(0, 15, 20); // 정면 상단 집중 조명
  window.threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 6.0);
  dirLight2.position.set(-15, 5, 10); // 좌측 보조광
  window.threeScene.add(dirLight2);

  const dirLight3 = new THREE.DirectionalLight(0xffffff, 6.0);
  dirLight3.position.set(15, 5, 10); // 우측 보조광
  window.threeScene.add(dirLight3);

  const ambientLight = new THREE.AmbientLight(0xffffff, 2.0); 
  window.threeScene.add(ambientLight);

  window.threeCamera = new THREE.PerspectiveCamera(23, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.5);

  const envTexture = generatePureEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Math.random()}`,
    (gltf) => {
      if (!gltf || !gltf.scene) { hideSiteLoader(); return; }
      if (window.modelAnchor) window.threeScene.remove(window.modelAnchor);

      const model = gltf.scene;

      // ⚡ [메탈 질감 대폭 강화] 액체 크롬처럼 맑고 쨍하게 반사하는 진짜 은빛 금속 재질 강제 조율
      const chromeSilverMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,          // 탁한 회색을 걷어낸 완전한 은빛 순백색 베이스
        metalness: 1.0,           // 100% 하드 메탈릭 성질 지정
        roughness: 0.05,          // 거칠기를 완전 낮춰 주변 조명을 거울처럼 쨍하게 반사하게 만듦
        emissive: 0x222222,       // 어두운 뒷배경 공간에서도 은은하게 속광이 돌도록 안전장치 부여
        side: THREE.DoubleSide
      });

      model.traverse((child) => {
        if (child.isMesh) {
          child.material    = chromeSilverMat;
          child.castShadow    = false;
          child.receiveShadow = false;
        }
      });

      // ⚡ [핵심 교정] 원본 파일 자체의 누워있는 근본 축(Z축 방향)을 X축 기준 90도 회전시켜 똑바로 세웁니다.
      model.rotation.x = Math.PI / 2; 

      const BOUNDS = 2.0;
      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = BOUNDS / maxDim;
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);

      // 마우스 반응 및 회전 링커 역할을 해줄 바깥 앵커 그룹 생성
      window.modelAnchor = new THREE.Group();
      window.modelAnchor.add(model);
      window.threeScene.add(window.modelAnchor);

      window.modelAnchor.rotation.x = baseRotation.x;
      window.modelAnchor.rotation.y = baseRotation.y;

      eliminateFakeModels();
      hideSiteLoader();
    },
    undefined,
    (err) => {
      console.warn('GLB 로드 실패', err);
      hideSiteLoader();
    }
