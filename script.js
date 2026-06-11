import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// DOM 요소 지정
const container = document.querySelector('#landing-display');
const canvas = document.querySelector('#model-canvas');
const follower = document.querySelector('.cursor-follower');
const revealCards = document.querySelectorAll('.reveal-card');

// 1. 마우스 팔로워 서브 이펙트 움직임 구현
window.addEventListener('pointermove', (e) => {
  if (follower) {
    follower.style.left = `${e.clientX}px`;
    follower.style.top = `${e.clientY}px`;
  }
});

// 2. Three.js 기본 설정 및 하이라이트 라이팅 추가
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6; // 밝기 화사하게 상향

// 입체적인 반사를 위한 다각도 조명 배치
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const topLight = new THREE.DirectionalLight(0xffffff, 3.0);
topLight.position.set(5, 8, 5);
scene.add(topLight);

const blueRimLight = new THREE.DirectionalLight(0x9b6ff5, 2.5); // 보랏빛 은은한 외곽선광
blueRimLight.position.set(-5, 2, -3);
scene.add(blueRimLight);

// 3. 🌟 희멀건 재질 원천 차단: 영롱한 다이아몬드/크리스탈 전반사 재질 세팅
const crystalMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0.1,
  roughness: 0.0,       // 표면을 매끄럽게 깎아 흐리멍덩한 백색 현상 제거
  transparent: true,
  opacity: 0.5,         // 투명도 확보
  transmission: 0.9,    // 빛 투과율 극대화
  ior: 2.417,           // 보석 특유의 내부 굴절률 부여
  clearcoat: 1.0,       // 겉면에 유리 코팅 한 겹 추가
  clearcoatRoughness: 0.0,
  side: THREE.DoubleSide
});

let mainModel = null;

// 4. 모델 로드 및 자세 똑바로 세우기 예외처리
const loader = new GLTFLoader();
// 최예린님이 소지하신 원본 모델링 파일명('modeling.glb')을 안전하게 호출합니다.
loader.load('modeling.glb', (gltf) => {
  mainModel = gltf.scene;

  mainModel.traverse((child) => {
    if (child.isMesh) {
      child.material = crystalMaterial;
    }
  });

  // 🌟 [수정] 누워있던 모델링을 똑바로 일으켜 세우는 절대각도 세팅
  mainModel.rotation.x = Math.PI / 2;

  // 정중앙 정렬 정규화
  const box = new THREE.Box3().setFromObject(mainModel);
  const center = new THREE.Vector3();
  box.getCenter(center);
  mainModel.position.sub(center);

  scene.add(mainModel);
}, undefined, (err) => {
  console.log("모델링을 찾을 수 없거나 로드 오류가 발생했습니다. 파일명을 확인해 주세요.", err);
});

// 5. 정방향 루프 애니메이션
function animate() {
  requestAnimationFrame(animate);
  
  if (mainModel) {
    // 똑바로 선 정방향 상태를 유지하면서 이쁘게 Y축으로만 자전하게 만듭니다.
    mainModel.rotation.y += 0.005;
  }
  
  renderer.render(scene, camera);
}
animate();

// 6. 스크롤 시 순차 등장 클래스 제어
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
    }
  });
}, { threshold: 0.1 });

revealCards.forEach(card => observer.observe(card));

// 리사이즈 매칭
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});
