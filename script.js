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
    POINTER & INTERACTION STATE (기획 복원)
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
  hovering: false, // 💡 기본 상태는 false! 마우스가 별 영역에 들어왔을 때만 true로 변합니다.
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
  if (!tilt.hovering) return; // 💡 호버 상태가 아닐 때는 마우스 계산을 생략합니다.
  
  const rect = landingDisplay ? landingDisplay.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const nx = ((clientX - rect.left) / Math.max(rect.width,  1) - 0.5) * 2;
  const ny = ((clientY - rect.top)  / Math.max(rect.height, 1) - 0.5) * 2;
  
  tilt.tx = ny * 18;       
  tilt.ty = nx * 22;       
  tilt.tz = nx * -4;
};

/* ════════════════════════════════════════
    THREE.JS ENGINE (노이즈 소멸 + 분산 프리즘 복원)
════════════════════════════════════════ */
let threeRenderer = null;
let threeScene    = null;
let threeCamera   = null;
let modelAnchor   = null; 
let modelLoaded   = false;
let animFrameId   = null;
let modelAutoRotY = 0; // 자동 회전용 변수

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

  threeCamera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.2); 

  // 조명 구성
  const ambient = new THREE.AmbientLight(0xffffff, 1.0); 
  threeScene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
  sunLight.position.set(5, 10, 5);
  threeScene.add(sunLight);

  // 🌈 분산 렌더링을 극대화해 줄 다채로운 스펙트럼 광원
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
      
      // 모델 초기 경사 세팅
      model.rotation.set(Math.PI / 6, 0, -Math.PI / 12);

      model.traverse((child) => {
        if (!child.isMesh) return;
        
        if (child.material.map) child.material.map = null;
        
        // 💎 [구조 지직거림 소멸 + 프리즘 광채 복원 튜닝]
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,   
          metalness:          0.0,        
          roughness:          0.0,        // 거칠기를 완전히 빼서 다시 거울처럼 맑게 세팅
          transmission:       0.95,       // 속이 시원하게 들여다보이는 투명도
          ior:                2.4,        // 💡 다이아몬드급 높은 굴절률로 프리즘 분산 효과 유도
          thickness:          0.8,        // 💡 얇은 면 구조가 충돌하지 않도록 두께 렌더링 값 최적화
          clearcoat:          1.0,        
          clearcoatRoughness: 0.0,
          
          // ✨ 프리즘 분산 효과 복원
          dispersion:         5.0,        // 💡 지직거리는 그래픽 깨짐 없이 외곽선에 영롱하게 색이 쪼개지는 연산 부여
          
          opacity:            1.0,
          transparent:        true,
          side:               THREE.DoubleSide, // 구조가 깨져 보이지 않도록 다시 양면 렌더링으로 안정화
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      modelLoaded = true;
      if (crystalFallback) crystalFallback.style.display = 'none';

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
    MAIN ANIMATION LOOP (회전 및 호버 분리)
════════════════════════════════════════ */
const animate = () => {
  animFrameId = requestAnimationFrame(animate);

  pointer.x += (pointer.tx - pointer.x) * 0.07;
  pointer.y += (pointer.ty - pointer.y) * 0.07;

  // 💡 마우스 호버 상태가 아닐 때는 목표 틸트 각도를 부드럽게 0(제자리)으로 되돌립니다.
  if (!tilt.hovering) {
    tilt.tx = 0;
    tilt.ty = 0;
    tilt.tz = 0;
    // 혼자 자연스럽게 도는 자동 회전 값 증가
    modelAutoRotY += 0.005; 
  } else {
    // 💡 마우스가 올라왔을 때는 혼자 도는 회전을 멈추고 마우스 반응에 집중하도록 보정 가능 (선택)
    modelAutoRotY += 0.001; // 호버 시에는 아주 미세하게만 회전
  }

  tilt.rx += (tilt.tx - tilt.rx) * 0.05;
  tilt.ry += (tilt.ty - tilt.ry) * 0.05;
  tilt.rz += (tilt.tz - tilt.rz) * 0.05;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (threeRenderer && threeScene && threeCamera) {
    if (modelAnchor) {
      // 자동 회전과 마우스 틸트 각도를 우아하게 결합
      modelAnchor.rotation.x = THREE.MathUtils.degToRad(tilt.rx);
      modelAnchor.rotation.y = modelAutoRotY + THREE.MathUtils.degToRad(tilt.ry);
      modelAnchor.rotation.z = THREE.MathUtils.degToRad(tilt.rz);
      
      // 공중 부양 효과
      modelAnchor.position.y = Math.sin(Date.now() * 0.001) * 0.02;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
};

/* ════════════════════════════════════════
    INITIALIZE & INTERACTION LISTENERS
════════════════════════════════════════ */
const initAll = () => {
  landingCanvasCtrl = setupLandingCanvas();
  
  // 💡 [핵심] 마우스가 메인 영역(#landing-display)에 들어왔을 때만 호버 반응 켜기
  if (landingDisplay) {
    landingDisplay.addEventListener('mouseenter', () => {
      tilt.hovering = true;
    });
    landingDisplay.addEventListener('mouseleave', () => {
      tilt.hovering = false;
    });
  }

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
