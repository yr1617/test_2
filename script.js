import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
   DOM REFS & STATE
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingCanvas  = document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');
const crystalFallback = document.querySelector('#crystal-fallback');
const revealCards    = document.querySelectorAll('.reveal-card');

const pointer = {
  x: window.innerWidth * 0.72,
  y: window.innerHeight * 0.38,
};

/* ════════════════════════════════════════
   🌟 마우스 시스템 복구 (빛 동적 그라디언트 추적 정상화)
════════════════════════════════════════ */
window.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;

  if (landing) {
    const rect = landing.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    const y = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
    landing.style.setProperty('--pointer-x', `${x}%`);
    landing.style.setProperty('--pointer-y', `${y}%`);
  }
});

/* ════════════════════════════════════════
   THREE.JS 3D ENGINE (보석 최적화 + 정방향 수리)
════════════════════════════════════════ */
let scene, camera, renderer, mainModel = null;

const initThree = () => {
  if (!modelCanvas || !landingDisplay) return;

  const W = landingDisplay.offsetWidth;
  const H = landingDisplay.offsetHeight;

  scene = new THREE.Scene();
  
  camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  camera.position.set(0, 0, 4.5);

  renderer = new THREE.WebGLRenderer({ canvas: modelCanvas, alpha: true, antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;

  // 조명 강화 입체 튜닝
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffeedd, 2.5);
  keyLight.position.set(4, 6, 4);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xaae961, 1.8);
  rimLight.position.set(-4, 2, -2);
  scene.add(rimLight);

  // 🌟 [보석 재질 극대화] 희멀건 현상을 방지하는 전반사 크리스탈 매터리얼 정의
  const jewelMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.02,
    transparent: true,
    transmission: 0.95, // 유리 질감 투과 극대화
    ior: 2.4,           // 다이아몬드 굴절률 구현
    thickness: 1.2,
    clearcoat: 1.0,     // 겉면 코팅 광택광
    clearcoatRoughness: 0.01,
    side: THREE.DoubleSide
  });

  // GLB 파일 안전 로드 및 누워있던 축 직립 보정
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://unpkg.com/three@0.165.0/examples/jsm/libs/draco/');
  loader.setDRACOLoader(draco);

  loader.load('modeling.glb', (gltf) => {
    mainModel = gltf.scene;

    mainModel.traverse((child) => {
      if (child.isMesh) {
        child.material = jewelMaterial;
      }
    });

    // 🌟 [회전축 교정] 누워있던 축을 똑바로 일으켜 세워 전면을 보게 고정합니다.
    mainModel.rotation.set(0, 0, 0);

    // 정중앙 피벗 정렬 정규화
    const box = new THREE.Box3().setFromObject(mainModel);
    const center = new THREE.Vector3();
    box.getCenter(center);
    mainModel.position.sub(center);

    scene.add(mainModel);
    if (crystalFallback) crystalFallback.classList.add('is-hidden');
  }, undefined, (err) => {
    console.warn("GLB 불러오기 실패, CSS 폴백을 유지합니다.", err);
  });
};

// 정방향 애니메이션 루프
const animate = () => {
  requestAnimationFrame(animate);
  if (mainModel) {
    // 똑바로 선 자세를 축으로 예쁘게 360도 자전 제어
    mainModel.rotation.y += 0.006;
  }
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
};

initThree();
animate();

/* ════════════════════════════════════════
   SCROLL REVEAL (오리지널 순차 등장 제어 복구)
════════════════════════════════════════ */
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
    }
  });
}, { threshold: 0.1 });

revealCards.forEach(card => observer.observe(card));

window.addEventListener('resize', () => {
  if (!landingDisplay || !camera || !renderer) return;
  const W = landingDisplay.offsetWidth;
  const H = landingDisplay.offsetHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H);
});
