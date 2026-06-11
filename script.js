import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const container = document.querySelector('#landing-display');
const canvas = document.querySelector('#model-canvas');
const revealCards = document.querySelectorAll('.reveal-card');

if (container && canvas) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  // 1. 씬 생성
  const scene = new THREE.Scene();

  // 2. 🌟 [카메라 각도 수리] 탑뷰(위에서 본 각도)를 버리고, 입체감이 돋보이는 정면 각도로 전면 교정!
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 0.2, 4.2); // 정면에서 아주 살짝만 위쪽 배치
  camera.lookAt(0, 0, 0);

  // 3. 렌더러 설정
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  /* ════════════════════════════════════════
     🌟 [조명 세팅 수리] 플라스틱 뭉개짐 방지
     빛을 입체적으로 쪼개어 보석의 각진 엣지가 투명하게 반사되도록 합니다.
  ════════════════════════════════════════ */
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
  mainLight.position.set(5, 8, 6);
  scene.add(mainLight);

  const subLight = new THREE.DirectionalLight(0xdbff86, 1.5); // 예린님 고유 서브컬러 반사광
  subLight.position.set(-5, -3, 3);
  scene.add(subLight);

  /* ════════════════════════════════════════
     🌟 [재질 수리] 흰 플라스틱 재질을 영롱한 크리스탈 유리로 변경
     transmission(투과율)과 ior(굴절률)을 심어 투명하고 맑게 만듭니다.
  ════════════════════════════════════════ */
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.03,        // 표면을 매끄럽게 닦아서 흐릿한 플라스틱 느낌 제거
    transparent: true,
    transmission: 0.95,     // 속이 투명하게 비치는 효과 극대화
    ior: 2.2,               // 보석 고유의 내부 굴절 표현
    thickness: 1.0,         // 두께 굴절감 부여
    clearcoat: 1.0,         // 코팅 광택 코팅막 레이어 추가
    clearcoatRoughness: 0.0,
    side: THREE.DoubleSide
  });

  let model = null;

  // 4. 모델 로드 및 회전축 교정
  const loader = new GLTFLoader();
  loader.load('modeling.glb', (gltf) => {
    model = gltf.scene;

    model.traverse((child) => {
      if (child.isMesh) {
        child.material = crystalMaterial;
      }
    });

    // 🌟 [중요] 피벗 포인트(중심점)를 정중앙으로 잡고 눕혀져 있던 각도를 똑바로 세웁니다.
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.sub(center);
    
    model.rotation.set(0, 0, 0); // 뷰 왜곡 초기화

    scene.add(model);
  }, undefined, (error) => {
    console.error('모델 로드 실패:', error);
  });

  /* ════════════════════════════════════════
     🌟 [인터랙션 수리] 마우스 무브 반응형 인터랙션 구현
  ════════════════════════════════════════ */
  const mouse = { x: 0, y: 0 };
  const targetRotation = { x: 0, y: 0 };

  window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // 마우스가 움직일 때 모델이 부드럽게 각도를 비틀도록 설정
    targetRotation.x = mouse.y * 0.4;
    targetRotation.y = mouse.x * 0.5;
  });

  // 5. 애니메이션 루프
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    if (model) {
      // 시계처럼 도는 게 아니라, 정면에서 예쁘게 자전하도록 회전축 고정
      model.rotation.y = elapsedTime * 0.4;

      // 마우스 움직임에 반응하여 부드럽게 기울어지는 애니메이션 연동 (Lerp)
      model.rotation.x += (targetRotation.x - model.rotation.x) * 0.05;
      model.rotation.z += (-targetRotation.y - model.rotation.z) * 0.05;
    }

    renderer.render(scene, camera);
  }
  animate();

  // 리사이즈 매칭
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

// 클로드 오리지널 스크롤 Reveal 감지 스크립트 복구
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
    }
  });
}, { threshold: 0.1 });

revealCards.forEach(card => observer.observe(card));
