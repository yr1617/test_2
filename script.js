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
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    landingCanvas.width = Math.max(1, Math.floor(rect.width * state.dpr));
    landingCanvas.height = Math.max(1, Math.floor(rect.height * state.dpr)); // 💥 오타 완벽 수정 완료!
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
    glow.addColorStop(0, 'rgba(255,255,255,0.08)');
    glow.addColorStop(0.3, 'rgba(150,100,255,0.04)');
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

/* ════════════════════════════════════════
    HIGH-FREQUENCY 환경광 맵 (오로라 소스원)
════════════════════════════════════════ */
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(16, 16, 16);
  const mats = [
    new THREE.MeshBasicMaterial({ color: 0x00faff, side: THREE.BackSide }), // Cyan
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), // White High
    new THREE.MeshBasicMaterial({ color: 0xff00d4, side: THREE.BackSide }), // Magenta
    new THREE.MeshBasicMaterial({ color: 0x101015, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), 
    new THREE.MeshBasicMaterial({ color: 0x020205, side: THREE.BackSide })  
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
    🌈 면 겹침 차단 + 고해상도 오로라 프리즘 셰이더
════════════════════════════════════════ */
const createAntiOverlapPrismMaterial = (envTexture) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      envMap: { value: envTexture },
      iorR: { value: 1.07 },
      iorG: { value: 1.13 },
      iorB: { value: 1.20 },
      rainbowIntensity: { value: 3.8 },
      brightness: { value: 1.5 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vViewDir = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform samplerCube envMap;
      uniform float iorR;
      uniform float iorG;
      uniform float iorB;
      uniform float rainbowIntensity;
      uniform float brightness;

      varying vec3 vNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDir = vViewDir;

        // 굴절각 분할 계산으로 내부 깨짐 최소화
        vec3 reR = refract(viewDir, normal, 1.0 / iorR);
        vec3 reG = refract(viewDir, normal, 1.0 / iorG);
        vec3 reB = refract(viewDir, normal, 1.0 / iorB);

        float r = textureCube(envMap, reR).r;
        float g = textureCube(envMap, reG).g;
        float b = textureCube(envMap, reB).b;
        vec3 rainbow = vec3(r, g, b) * rainbowIntensity;

        // 반사광 하이라이트 추가
        vec3 refDir = reflect(viewDir, normal);
        vec3 reflection = textureCube(envMap, refDir).rgb * 2.0;

        // 프레넬 림라이트
        float fresnel = pow(1.0 + dot(viewDir, normal), 2.2);
        fresnel = clamp(fresnel, 0.0, 1.0);

        // 시커멓게 죽는 내부를 맑게 밀어내기 위한 크리스탈 베이스광
        vec3 baseGlass = vec3(0.96, 0.97, 0.99) * brightness;
        
        // 외곽선에 투명한 오로라 스펙트럼 합성
        vec3 finalColor = mix(baseGlass + rainbow * 0.25, rainbow + reflection, fresnel);
        float alpha = mix(0.18, 0.90, fresnel);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    depthWrite: false, // 💥 면 겹침으로 어두워지는 현상 완벽 방어
    depthTest: true
  });
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

  window.threeCamera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.5); 

  const envTexture = generatePureEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Date.now()}`,
    (gltf) => {
      if(!gltf || !gltf.scene) {
        console.warn("GLB 데이터 구조 오류");
        hideSiteLoader();
        return;
      }
      if(window.modelAnchor) window.threeScene.remove(window.modelAnchor);

      const model = gltf.scene;
      const antiOverlapMaterial = createAntiOverlapPrismMaterial(envTexture);

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = antiOverlapMaterial;
          child.castShadow = false;   
          child.receiveShadow = false;
        }
      });

      // 💥 우측 그리드를 묵직하게 채우는 안정적인 최적 크기 밸런싱 고정
      const IDEAL_LAYOUT_BOUNDS = 2.6; 
      
      const box = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = IDEAL_LAYOUT_BOUNDS / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      model.rotation.set(Math.PI / 2.3, 0, 0); 

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
