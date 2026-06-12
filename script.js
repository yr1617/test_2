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
    INTERACTION STATE
════════════════════════════════════════ */
const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };

const rotationState = {
  currentX: 0, currentY: 0,
  targetX:  0.3, targetY:  0.5, 
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
    THREE.JS ENGINE
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let animFrameId   = null;

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
    alpha:       true, // 배경 투명화 필수
    antialias:   true,
    powerPreference: 'high-performance',
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  
  threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1.3; 

  threeScene = new THREE.Scene();

  threeCamera = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.6); 

  // 오로라 광택용 3점 조명 세팅
  const ambient = new THREE.AmbientLight(0xffffff, 1.2); 
  threeScene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xffffff, 3.0);
  mainLight.position.set(5, 5, 4);
  threeScene.add(mainLight);

  const laserMagenta = new THREE.DirectionalLight(0xff00cc, 2.0); 
  laserMagenta.position.set(-4, 3, 3);
  threeScene.add(laserMagenta);

  const laserCyan = new THREE.DirectionalLight(0x00ffff, 2.0); 
  laserCyan.position.set(3, -4, 3);
  threeScene.add(laserCyan);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      
      // 바운딩 박스 계산 전에 화면을 가리는 거대 배경판 메쉬들을 완전히 걸러내기
      const meshesToLayer = [];
      model.traverse((child) => {
        if (child.isMesh) {
          // 💡 핵심: 이름에 'plane', 'bg', 'ground', 'floor' 등이 들어가거나 
          // 가로세로가 비정상적으로 거대해서 화면을 가리는 판때기 메쉬는 무대에서 제거합니다.
          const name = child.name.toLowerCase();
          if (name.includes('plane') || name.includes('bg') || name.includes('ground') || name.includes('canvas')) {
            child.visible = false; 
            return;
          }
          meshesToLayer.push(child);
        }
      });

      // 진짜 '별' 오브젝트들만 모아서 크기 및 중앙 정렬 계산
      if (meshesToLayer.length === 0) meshesToLayer.push(model);
      
      const tempGroup = new THREE.Group();
      meshesToLayer.forEach(m => {
        if(m.parent && m.parent !== model && m.parent !== tempGroup) {
          // 원래 계층 유지 구조가 필요 없다면 안전하게 가시성만 확보
        }
      });

      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale   = 1.9 / (maxDim || 1); 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      
      // 누워있던 원본 파일 기본 정면 정렬 각도
      model.rotation.set(Math.PI / 2.3, 0, 0); 

      // 진짜 알맹이 별 메쉬에만 극강의 투명 프리즘 재질 주입
      model.traverse((child) => {
        if (!child.isMesh || child.visible === false) return;
        
        if (child.material.map) child.material.map = null;
        
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,   
          metalness:          0.0,        
          roughness:          0.01,        // 지직거림의 원인인 표면 거칠기 면도하듯 깎아내기
          transparent:        true,
          transmission:       0.98,        // 완벽하게 뒤쪽 글씨들이 투과되어 보이도록 투과율 98% 세팅
          ior:                2.417,       // 다이아몬드급 프리즘 굴절
          thickness:          0.3,         
          specularIntensity:  2.0,         
          opacity:            1.0,
          side:               THREE.DoubleSide, 
          depthWrite:         true         // 투명 정렬 꼬임 방지
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
          siteLoader.style.opacity = '0';
          setTimeout(() => siteLoader.style.display = 'none', 600);
        }, 300);
      }
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 에러", err);
      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) siteLoader.style.display = 'none';
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
        modelAutoRotY
