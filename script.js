import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';

document.addEventListener("DOMContentLoaded", () => {
  
  /* ════════════════════════════════════════
      1. 개별 메뉴바 스크롤 연동 (동시 차오름 해결)
  ════════════════════════════════════════ */
  const navLinks = document.querySelectorAll(".topnav a");
  const sections = Array.from(navLinks).map(link => {
    const targetId = link.getAttribute("href");
    return targetId && targetId.startsWith("#") ? document.querySelector(targetId) : null;
  });

  window.addEventListener("scroll", () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const viewportHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight - viewportHeight;
    const totalProgress = docHeight > 0 ? scrollTop / docHeight : 0;

    navLinks.forEach((link, index) => {
      const section = sections[index];
      if (!section) {
        // 링크에 매칭되는 섹션이 없으면 전체 페이지 진행도 연동 (예: Home)
        link.style.setProperty("--nav-progress", totalProgress);
        return;
      }

      const rect = section.getBoundingClientRect();
      const sectionTop = rect.top + scrollTop;
      const sectionHeight = rect.height;

      // 현재 뷰포트 기준으로 해당 섹션의 통과 진행도 계산
      let sectionProgress = 0;
      if (scrollTop + viewportHeight > sectionTop) {
        sectionProgress = (scrollTop + viewportHeight - sectionTop) / (sectionHeight + viewportHeight);
      }
      
      // 범위 제한 (0 ~ 1) 및 해당 메뉴바만 독립적으로 채우기
      sectionProgress = Math.min(Math.max(sectionProgress, 0), 1);
      link.style.setProperty("--nav-progress", sectionProgress);

      // 현재 보고 있는 섹션 활성화 활성화
      if (rect.top <= viewportHeight * 0.5 && rect.bottom >= viewportHeight * 0.5) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  });

  /* ════════════════════════════════════════
      2. THREE.JS 모델링 최적화 & 영롱한 오색 재질 복구
  ════════════════════════════════════════ */
  const container = document.querySelector('.landing-display-shell');
  const canvas = document.querySelector('.model-canvas');
  const fallback = document.querySelector('.crystal-fallback');

  // 에러 방지용 가드 클로저
  if (!container || !canvas) {
    if (fallback) fallback.classList.remove('is-hidden');
    return; 
  }

  // 씬, 카메라, 렌더러 설정 (하드웨어 가속 포함)
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.z = 6;

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 크리스탈 형상 생성 (예린님의 원래 기하학 구조 부활)
  const geometry = new THREE.OctahedronGeometry(1.6, 0);
  
  // ✨ 예린님이 원하셨던 영롱한 오색빛깔 광택 물리 재질(Physical Material) 복구
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.9,     // 반투명 유리 재질
    ior: 2.42,             // 다이아몬드 굴절률 (오색 반사 극대화)
    thickness: 1.2,
    specularIntensity: 1.0,
    clearcoat: 1.0,        // 겉면 코팅으로 눈부신 광택 추가
    clearcoatRoughness: 0.05
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // 💡 빛나는 효과용 조명 시스템 세팅
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const pointLight1 = new THREE.PointLight(0xaae961, 1.5, 10); // 연두빛 핀조명
  pointLight1.position.set(2, 3, 2);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0x5d35a3, 2.0, 10); // 보라빛 강한 조명
  pointLight2.position.set(-2, -3, 2);
  scene.add(pointLight2);

  // 호버 인터랙션 변수
  let isHovering = false;
  let targetRotationX = 0;
  let targetRotationY = 0;

  container.addEventListener('mouseenter', () => { isHovering = true; });
  container.addEventListener('mouseleave', () => { isHovering = false; });
  
  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    
    // 마우스 움직임에 따라 회전 타겟값 설정
    targetRotationY = x * 2;
    targetRotationX = y * 2;
  });

  // 애니메이션 루프 (렉 없이 60fps 보장)
  function animate() {
    requestAnimationFrame(animate);

    if (isHovering) {
      // 마우스 호버 시 끈적하고 부드럽게 마우스를 따라옴 (Lerp)
      mesh.rotation.y += (targetRotationY - mesh.rotation.y) * 0.1;
      mesh.rotation.x += (targetRotationX - mesh.rotation.x) * 0.1;
    } else {
      // 기본 상태일 때는 오색빛깔을 흘리며 자전 자동 회전
      mesh.rotation.y += 0.008;
      mesh.rotation.x += 0.003;
    }

    renderer.render(scene, camera);
  }

  // 실행 및 폴백 히든 처리
  if (fallback) fallback.classList.add('is-hidden');
  animate();

  // 리사이즈 대응
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
});
