import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    DOM REFS (캔버스 충돌 현상 완벽 해결)
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas'); // 배경 2D 글로우용
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');   // 💡 정상 복구: 3D 별 전용 캔버스
const crystalFallback = document.querySelector('#crystal-fallback');
const follower        = document.querySelector('.cursor-follower');
const navLinks       = document.querySelectorAll('.topnav a[data-target]');
const highlightElements = document.querySelectorAll('.point-highlight, .reveal-card li');

/* ════════════════════════════════════════
    POINTER & TILT STATE
════════════════════════════════════════ */
const pointer = {
  x:  window.innerWidth  * 0.5,
  y:  window.innerHeight * 0.5,
  tx: window.innerWidth  * 0.5,
  ty: window.innerHeight * 0.5,
};

const tilt = {
  rx: 0, ry: 0, rz: 0,
  tx: 0, ty: 0, tz: 0,
  hovering: true, // 로딩 중에도 상시 반응하도록 true 고정
};

const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    LANDING CANVAS GLOW
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
    TILT TARGET UPDATE
════════════════════════════════════════ */
const updateTiltTarget = (clientX, clientY) => {
  const rect = landingDisplay ? landingDisplay.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  
  tilt.tx = ny * 18;       
  tilt.ty = nx * 22;       
  tilt.tz = nx * -4;
};

/* ════════════════════════════════════════
    THREE.JS ENGINE (맑고 영롱한 투명 프리즘 크리스탈 세팅)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let modelLoaded   = false;
let animFrameId   = null;
let modelAutoRotY = 0;

const initThree = () => {
  if (!modelCanvas) return;

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
  threeScene.background = null;

  threeCamera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.2); 

  // 조명 환경 밸런싱
  const ambient = new THREE.AmbientLight(0xffffff, 1.0); 
  threeScene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
  sunLight.position.set(5, 10, 5);
  threeScene.add(sunLight);

  const magentaLight = new THREE.DirectionalLight(0xff33aa, 4.0); 
  magentaLight.position.set(-6, 5, 2);
  threeScene.add(magentaLight);

  const cyanLight = new THREE.DirectionalLight(0x33eeff, 4.0); 
  cyanLight.position.set(5, -5, 3);
  threeScene.add(cyanLight);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale   = 2.0 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      model.rotation.set(Math.PI / 2, Math.PI / 1.15, -Math.PI / 4);

      model.traverse((child) => {
        if (!child.isMesh) return;
        
        if (child.material.map) child.material.map = null;
        
        // 💎 속이 쨍하게 뚫리며 모서리에만 무지개가 맺히는 프리즘 질감
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,   
          metalness:          0.0,        
          roughness:          0.002,      
          transmission:       1.0,        // 100% 완전 투명 유리알
          ior:                1.50,       // 맑은 굴절률
          thickness:          0.4,        // 가볍고 맑은 껍데기 두께감
          clearcoat:          1.0,        
          clearcoatRoughness: 0.0,
          
          dispersion:         14.0,       // 모서리 무지개 엣지 효과 극대화
          iridescence:        0.5,        
          iridescenceIOR:     1.6,        
          
          opacity:            1.0,
          transparent:        true,
          side:               THREE.FrontSide, // 하얗게 성에 끼던 겹침 현상 제거
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      modelLoaded = true;
      if (crystalFallback) crystalFallback.style.display = 'none';

      // 💡 꼬임이 풀렸으니 안전하게 로딩창을 걷어냅니다.
      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) {
        setTimeout(() => {
          siteLoader.classList.add('is-loaded');
        }, 500); 
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
    MAIN ANIMATION LOOP
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.07;
  pointer.y += (pointer.ty - pointer.y) * 0.07;

  tilt.rx += (tilt.tx - tilt.rx) * 0.04;
  tilt.ry += (tilt.ty - tilt.ry) * 0.04;
  tilt.rz += (tilt.tz - tilt.rz) * 0.04;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (threeRenderer && threeScene && threeCamera) {
    if (modelAnchor) {
      modelAnchor.rotation.x = THREE.MathUtils.degToRad(tilt.rx);
      modelAnchor.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry);
      modelAnchor.rotation.z = THREE.MathUtils.degToRad(tilt.rz);
      
      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.01;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    INITIALIZE & EVENT LISTENERS
════════════════════════════════════════ */
const initAll = () => {
  landingCanvasCtrl = setupLandingCanvas();
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

window.addEventListener('pointermove', (e) => {
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  updateTiltTarget(e.clientX, e.clientY);
});

window.addEventListener('resize', () => {
  if (landingCanvasCtrl) landingCanvasCtrl.resize();
  resizeThree();
});
