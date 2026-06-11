import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
   DOM REFS & STATE
════════════════════════════════════════ */
const landing        = document.querySelector('.landing');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');
const crystalFallback = document.querySelector('#crystal-fallback');
const revealCards    = document.querySelectorAll('.reveal-card');

const pointer = {
  x: window.innerWidth * 0.72,
  y: window.innerHeight * 0.38,
};

/* ════════════════════════════════════════
   🌟 마우스 트래킹 시스템 복구 (정상 OS 마우스 연동)
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
   THREE.JS 3D ENGINE (정면 정방향 카메라 + 크리스탈 렌더링)
════════════════════════════════════════ */
let scene, camera, renderer, mainModel = null;

const initThree = () => {
  if (!modelCanvas || !landingDisplay) return;

  const W = landingDisplay.offsetWidth;
  const H = landingDisplay.offsetHeight;

  scene = new THREE.Scene();
  
  // 🌟 [카메라 각도 전면 수리] 탑뷰 현상을 해결하기 위해 카메라를 정면 입체 뷰 각도로 배치합니다.
  camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  camera.position.set(0, 0.4, 4.4); 
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas: modelCanvas, alpha: true, antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  // 조명 강화 입체 분산 튜닝 (플라스틱 현상 제어)
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(4, 6, 4);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xdbff86, 1.8);
  rimLight.position.set(-4, 2, -2);
  scene.add(rimLight);

  // 🌟 [보석 재질 극대화] 불투명하게 타버리는 질감을 투명하게 빛나는 물리 유리 재질로 치환
  const jewelMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.04,
    transparent: true,
    transmission: 0.96, // 빛의 관통 투과율 극대화
    ior: 2.2,           // 내부 굴절 보정
    thickness: 1.0,     // 굴절 두께감
    clearcoat: 1.0,     // 표면 코팅 광택광 추가
    clearcoatRoughness: 0.01,
    side: THREE.DoubleSide
  });

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

    // 🌟 [회전축 오정렬 교정] 누워있던 기본 3D 축을 수직 정방향으로 바르게 정렬
    mainModel.rotation.set(0, 0, 0);

    // 정중앙 피벗 정렬 정규화
    const box = new THREE.Box3().setFromObject(mainModel);
    const center = new THREE.Vector3();
    box.getCenter(center);
    mainModel.position.sub(center);

    scene.add(mainModel);
    if (crystalFallback) crystalFallback.classList.add('is-hidden');
  }, undefined, (err) => {
    console.warn("GLB를 찾을 수 없어 원본 CSS 폴백을 노출합니다.", err);
  });
};

// 인터랙션 연동을 위한 마우스 회전 목표치 산출
const targetRotation = { x: 0, y: 0 };
window.addEventListener('mousemove', (e) => {
  const mx = (e.clientX / window.innerWidth) * 2 - 1;
  const my = -(e.clientY / window.innerHeight) * 2 + 1;
  targetRotation.x = my * 0.35;
  targetRotation.y = mx * 0.45;
});

const clock = new THREE.Clock();

// 정방향 애니메이션 루프
const animate = () => {
  requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();

  if (mainModel) {
    // 🌟 맷돌처럼 위에서 회전하는 현상을 막고 정면을 기준으로 회전축 고정
    mainModel.rotation.y = elapsedTime * 0.35;

    // 마우스의 흐름을 부드럽게 추종하는 입체 갸웃거림 효과 구현 (Lerp)
    mainModel.rotation.x += (targetRotation.x - mainModel.rotation.x) * 0.06;
    mainModel.rotation.z += (-targetRotation.y - mainModel.rotation.z) * 0.06;
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
