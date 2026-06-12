import * as THREE from 'three';

document.addEventListener("DOMContentLoaded", () => {
  // ════════════════════════════════════════
  // [공통 수집] 네비게이션바 진행 상태 연동용
  // ════════════════════════════════════════
  const navLinks = document.querySelectorAll(".topnav a");
  const sections = Array.from(navLinks).map(link => {
    const targetId = link.getAttribute("href");
    return targetId && targetId.startsWith("#") ? document.querySelector(targetId) : null;
  });

  // ════════════════════════════════════════
  // [1번 / 8번] THREE.JS 완전 투명 오로라 유리 크리스탈 제어
  // ════════════════════════════════════════
  const modelCanvas = document.querySelector('#model-canvas');
  const shell = document.querySelector('.landing-display-shell');

  if (modelCanvas && shell) {
    const renderer = new THREE.WebGLRenderer({
      canvas: modelCanvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(shell.offsetWidth, shell.offsetHeight);
    
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    renderer.toneMappingExposure = 1.6; // 선명한 대비와 광택을 위한 하이라이트 노출 상승

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, shell.offsetWidth / shell.offsetHeight, 0.1, 100);
    camera.position.set(0, 0, 4.4);

    // 내부 반사와 굴절의 영롱함·선명한 대비를 끌어올리기 위한 조명 시스템 강화
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0xffffff, 4.0);
    mainLight.position.set(3, 5, 4);
    scene.add(mainLight);

    const laserCyan = new THREE.SpotLight(0x00ffff, 45.0, 25, Math.PI / 3, 0.5, 1);
    laserCyan.position.set(5, 5, 4);
    scene.add(laserCyan);

    const laserMagenta = new THREE.SpotLight(0xff00ff, 50.0, 25, Math.PI / 3, 0.5, 1);
    laserMagenta.position.set(-5, -3, 4);
    scene.add(laserMagenta);

    const laserGold = new THREE.SpotLight(0xffaa00, 30.0, 20, Math.PI / 4, 0.5, 1);
    laserGold.position.set(0, 6, -2);
    scene.add(laserGold);

    // 투명 물방울 느낌의 완전 유리 마테리얼 물리 기반 세팅 (8번 반영)
    const crystalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.02,              // 극도로 매끄러운 유리 표면 질감
      transparent: true,
      opacity: 0.20,                // 물방울같이 맑고 훤히 비치는 극대화된 투명도
      transmission: 0.99,           // 완전 투명에 가까운 투과율 확보
      ior: 2.2,                     // 고굴절률 설정을 통해 하이라이트와 내부 왜곡의 대비 선명화
      side: THREE.DoubleSide,
      clearcoat: 1.0,               // 겉면에 찬란하게 빛나는 광택 코팅 가동
      clearcoatRoughness: 0.01,
      // 박막 간섭 현상을 추가하여 선명하게 반짝이는 오색빛깔 구현
      iridescence: 1.0,
      iridescenceIOR: 1.9,
      iridescenceThicknessRange: [200, 700]
    });

    // 지오메트리 생성 및 메시 바인딩
    const geometry = new THREE.OctahedronGeometry(0.9, 0);
    const mesh = new THREE.Mesh(geometry, crystalMaterial);
    scene.add(mesh);

    // 인터랙션 제어 데이터 변수
    let currentX = 0, currentY = 0;
    let targetX = 0, targetY = 0;
    let isHovered = false;
    let autoAngle = 0;

    // 1번 요구사항: 드래그 완전 소멸 및 잘림 방지용 각도 한계 제한 호버 추적
    shell.addEventListener('mousemove', (e) => {
      isHovered = true;
      const rect = shell.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / shell.offsetWidth) - 0.5;
      const mouseY = ((e.clientY - rect.top) / shell.offsetHeight) - 0.5;

      // 상하좌우 화면 잘림 현상을 완벽 차단하는 안전각 클램프 및 제동율 적용
      targetY = mouseX * Math.PI * 0.25; 
      targetX = mouseY * Math.PI * 0.25;
    });

    shell.addEventListener('mouseleave', () => {
      isHovered = false;
    });

    // 렌더 애니메이션 루프 구동
    function animate() {
      requestAnimationFrame(animate);

      if (!isHovered) {
        // 평소 마우스가 없을 때는 여유롭고 천천히 자동 회전
        autoAngle += 0.004;
        mesh.rotation.y = autoAngle;
        mesh.rotation.x = Math.sin(autoAngle * 0.5) * 0.15;
        // 호버 복귀 타겟 보정
        targetY = autoAngle;
        currentY = autoAngle;
      } else {
        // 호버 시 마우스 방향 궤적을 부드러운 감속 효과로 추적
        currentX += (targetX - currentX) * 0.08;
        currentY += (targetY - currentY) * 0.08;
        mesh.rotation.x = currentX;
        mesh.rotation.y = currentY;
      }

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      renderer.setSize(shell.offsetWidth, shell.offsetHeight);
      camera.aspect = shell.offsetWidth / shell.offsetHeight;
      camera.updateProjectionMatrix();
    });

    // 대체 요소 히든 처리
    const fallback = document.querySelector('#crystal-fallback');
    if (fallback) fallback.style.display = 'none';
  }

  // ════════════════════════════════════════
  // [3번 요구사항] 독립 스크롤 프로그레스 게이지 연동 연산
  // ════════════════════════════════════════
  function handleScrollProgress() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const viewportHeight = window.innerHeight;
    const totalDocHeight = document.documentElement.scrollHeight;

    // 맨 밑 바닥 감지 임계점
    const isAtBottom = (scrollTop + viewportHeight) >= (totalDocHeight - 15);

    navLinks.forEach((link, index) => {
      const section = sections[index];

      // 1. 페이지 스크롤이 끝까지 내려간 경우 무조건 모든 게이지 바를 100% 완벽히 채움
      if (isAtBottom) {
        link.style.setProperty("--nav-progress", "1");
        if (index === navLinks.length - 1) link.classList.add("active");
        else link.classList.remove("active");
        return;
      }

      // 2. 홈 상단 스크롤 구간 예외 규칙
      if (!section) {
        if (scrollTop < viewportHeight * 0.4) {
          link.classList.add("active");
          const homeProgress = Math.min(scrollTop / (viewportHeight * 0.4), 1);
          link.style.setProperty("--nav-progress", homeProgress);
        } else {
          link.classList.remove("active");
          link.style.setProperty("--nav-progress", "1");
        }
        return;
      }

      // 3. 개별 단일 섹션 순차 누적 연산
      const rect = section.getBoundingClientRect();
      const sectionAbsoluteTop = rect.top + scrollTop;
      const sectionHeight = rect.height;

      if (scrollTop + viewportHeight > sectionAbsoluteTop && scrollTop < sectionAbsoluteTop + sectionHeight) {
        const currentProgress = (scrollTop + viewportHeight) - sectionAbsoluteTop;
        const totalProgressZone = sectionHeight + viewportHeight;
        const progress = Math.min(Math.max(currentProgress / totalProgressZone, 0), 1);
        
        link.style.setProperty("--nav-progress", progress);
      } else if (scrollTop >= sectionAbsoluteTop + sectionHeight) {
        // 스크롤이 완전히 통과한 이전 영역들은 100% 박제
        link.style.setProperty("--nav-progress", "1");
      } else {
        // 아직 내려오지 않은 다음 대기 구역들은 정확히 0% 초기화
        link.style.setProperty("--nav-progress", "0");
      }

      // 네비게이션 텍스트 라이팅 On/Off 활성화 상태 토글 (뷰포트 50% 기준)
      if (rect.top <= viewportHeight * 0.5 && rect.bottom >= viewportHeight * 0.5) {
        navLinks.forEach(l => l.classList.remove("active"));
        link.classList.add("active");
      }
    });
  }

  window.addEventListener("scroll", handleScrollProgress);
  handleScrollProgress();

  // ════════════════════════════════════════
  // 마우스 커서 팔로워 인터랙션
  // ════════════════════════════════════════
  const follower = document.querySelector('.cursor-follower');
  if (follower) {
    window.addEventListener('pointermove', (e) => {
      follower.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
    });
  }

  // Reveal 카드 스크롤 노출 감지기
  const revealCards = document.querySelectorAll('.reveal-card');
  if (revealCards.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
    revealCards.forEach(card => observer.observe(card));
  }
});
