import * as THREE from 'three';

// 1. 전역 상태 및 변수 정의
let scene, camera, renderer, crystalStar;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let targetRotation = { x: 0.3, y: 0.5 }; // 초기 기본 각도 예쁘게 세팅

const container = document.getElementById('landing-display');
const canvas = document.getElementById('model-canvas');
const fallback = document.getElementById('crystal-fallback');

// 2. 초기화 함수
function init() {
  if (!container || !canvas) return;

  // 가짜 껍데기 레이어 완벽히 제거
  if (fallback) fallback.style.display = 'none';

  // [씬 세팅] 배경은 투명하게 하여 HTML 그래디언트와 결합
  scene = new THREE.Scene();

  // [카메라 세팅]
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.z = 7;

  // [렌더러 세팅] 이미지처럼 깨끗한 경계선을 위해 안티앨리어싱 및 고해상도 대응
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  
  // 프리즘 광택을 위한 물리적 톤매핑 적용
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // 3D 별 지오메트리 생성 (중앙이 뚫린 구조 형상화)
  createStarGeometry();

  // 조명 세팅 (유리의 꺾인 면들을 칼같이 살려줄 다방면 조명)
  setupLights();

  // 마우스 인터랙션 이벤트 바인딩
  setupEvents();

  // 애니메이션 루프 시작
  animate();

  // 사이트 로딩창 걷어내기 트리거
  const loader = document.getElementById('site-loader');
  if (loader) {
    setTimeout(() => {
      loader.style.opacity = '0';
      loader.style.transform = 'scale(1.02)';
      setTimeout(() => {
        loader.style.display = 'none';
      }, 500);
    }, 400);
  }
}

// 3. 지오메트리 및 '프리즘 유리' 재질 생성
function createStarGeometry() {
  // 압출 베벨 설정을 통해 보석 같은 각진 모서리 구현
  const starShape = new THREE.Shape();
  const points = 6; // 6각 별 형태
  const outerRadius = 1.8;
  const innerRadius = 0.9;

  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();

  const extrudeSettings = {
    steps: 1,
    depth: 0.4,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.1,
    bevelSegments: 3
  };

  const geometry = new THREE.ExtrudeGeometry(starShape, extrudeSettings);
  geometry.center(); // 회전축을 별의 정중앙으로 일치

  // ✨ 핵심: 뿌연 노이즈를 없애고 맑고 영롱한 두 번째 이미지 재질을 구현하는 물리 재治
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.03,            // 표면 지직거림을 잡기 위해 극도로 매끄럽게 설정 (0에 수렴)
    transparent: true,
    opacity: 0.4,               // 맑게 투과되는 기본 불투명도
    transmission: 0.95,         // 빛이 내부를 완전히 통과하는 투과율 극대화
    ior: 2.417,                 // 다이아몬드 급 굴절률로 가장자리 무지갯빛 왜곡 유도
    thickness: 0.5,             // 유리의 두께감 지정
    specularIntensity: 2.0,     // 하이라이트 광택 강화
    specularColor: new THREE.Color(0xffffff),
    sheen: 1.0,
    sheenColor: new THREE.Color(0xddf0ff), // 미세한 푸른빛 프리즘 기운 가미
    side: THREE.DoubleSide
  });

  crystalStar = new THREE.Mesh(geometry, glassMaterial);
  scene.add(crystalStar);
}

// 4. 프리즘 면을 살려줄 광원 배치
function setupLights() {
  const ambientLight = new THREE.AmbientLight(0x222233, 1.5);
  scene.add(ambientLight);

  // 정면 메인 하이라이트 빛
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
  dirLight1.position.set(5, 5, 5);
  scene.add(dirLight1);

  // 무지갯빛 반사 느낌을 시뮬레이션하기 위한 측면 유색 보조광들
  const dirLight2 = new THREE.DirectionalLight(0xff00aa, 1.5); // 핑크 스펙트럼
  dirLight2.position.set(-5, 3, 2);
  scene.add(dirLight2);

  const dirLight3 = new THREE.DirectionalLight(0x00f0ff, 2.0); // 사이안 스펙트럼
  dirLight3.position.set(0, -5, 3);
  scene.add(dirLight3);

  const pointLight = new THREE.PointLight(0xffffff, 2.0, 10);
  pointLight.position.set(2, 2, 4);
  scene.add(pointLight);
}

// 5. 드래그 인터랙션 마우스 이벤트
function setupEvents() {
  // 마우스 누름
  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  // 마우스 움직임 (회전 값 누적)
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaMove = {
      x: e.clientX - previousMousePosition.x,
      y: e.clientY - previousMousePosition.y
    };

    targetRotation.y += deltaMove.x * 0.007;
    targetRotation.x += deltaMove.y * 0.007;

    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  // 마우스 뗌
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // 터치 스크린 대응 (모바일)
  container.addEventListener('touchstart', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaMove = {
      x: e.touches[0].clientX - previousMousePosition.x,
      y: e.touches[0].clientY - previousMousePosition.y
    };
    targetRotation.y += deltaMove.x * 0.007;
    targetRotation.x += deltaMove.y * 0.007;
    previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });

  window.addEventListener('touchend', () => { isDragging = false; });

  // 윈도우 리사이즈 대응
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

// 6. 프레임 렌더링 루프
function animate() {
  requestAnimationFrame(animate);

  if (crystalStar) {
    // 드래그 마우스 조작감을 쫀득하고 부드럽게 만들어주는 댐핑(Lerp) 적용
    crystalStar.rotation.x += (targetRotation.x - crystalStar.rotation.x) * 0.08;
    crystalStar.rotation.y += (targetRotation.y - crystalStar.rotation.y) * 0.08;

    // 마우스를 안 대고 가만히 있어도 스스로 영롱하게 미세 자전하는 효과 추가
    if (!isDragging) {
      targetRotation.y += 0.002;
    }
  }

  renderer.render(scene, camera);
}

// 엔진 가동
window.addEventListener('DOMContentLoaded', init);
