import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';

document.addEventListener("DOMContentLoaded", () => {
  
  /* ════════════════════════════════════════
      1. 개별 메뉴바 독립 연동 (동시 차오름 해결)
  ════════════════════════════════════════ */
  const navLinks = document.querySelectorAll(".topnav a");
  
  // 각 메뉴 링크에 대응하는 HTML 섹션들을 매칭합니다 (#career-awards, #project-list 등)
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
      
      // 메인 랜딩(Home)이나 매칭되는 섹션이 없는 메뉴는 전체 페이지 스크롤과 연동
      if (!section) {
        link.style.setProperty("--nav-progress", totalProgress);
        return;
      }

      // 섹션별 위치를 계산하여 해당 메뉴의 바만 독립적으로 차오르게 변경
      const rect = section.getBoundingClientRect();
      const sectionTop = rect.top + scrollTop;
      const sectionHeight = rect.height;

      let sectionProgress = 0;
      if (scrollTop + viewportHeight > sectionTop) {
        sectionProgress = (scrollTop + viewportHeight - sectionTop) / (sectionHeight + viewportHeight);
      }
      
      sectionProgress = Math.min(Math.max(sectionProgress, 0), 1);
      link.style.setProperty("--nav-progress", sectionProgress);

      // 현재 보고 있는 섹션 메뉴에 active 클래스 부여
      if (rect.top <= viewportHeight * 0.5 && rect.bottom >= viewportHeight * 0.5) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  });

  /* ════════════════════════════════════════
      2. 이미지 원본 색감 & 가벼운 모델링 복구 (렉 제거)
  ════════════════════════════════════════ */
  const container = document.querySelector('.landing-display-shell');
  const canvas = document.querySelector('.model-canvas');

  if (!container || !canvas) return; 

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.z = 6;

  // 앤티앨리어싱만 켜서 계단현상을 잡고 가볍게 렌더링
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 예린님의 깔끔한 8면체 기하학 구조
  const geometry = new THREE.OctahedronGeometry(1.6, 0);
  
  // ✨ 이미지 속 은은하고 부드러운 오색 빛깔을 표현하는 기본 셰이딩 재질로 복구
  // 복잡한 연산이 없어 렉이 완전히 사라집니다.
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.1
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // 💡 이미지 속 상단 연두빛과 하단 보라/청빛 그라데이션을 만드는 은은한 조명 시스템
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // 상단에서 내리쬐는 연두색 빛
  const topLight = new THREE.DirectionalLight(0xe5ffca, 0.8);
  topLight.position.set(0, 4, 2);
  scene.add(topLight);

  // 하단에서 받쳐주는 은은한 보라/라벤더빛
  const bottomLight = new THREE.DirectionalLight(0xd1c4e9, 0.9);
  bottomLight.position.set(0, -4, 2);
  scene.add(bottomLight);

  // 마우스 인터랙션 데이터
  let isHovering = false;
  let mouseX = 0;
  let mouseY = 0;

  container.addEventListener('mouseenter', () => { isHovering = true; });
  container.addEventListener('mouseleave', () => { isHovering = false; });
  
  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / rect.width) - 0.5;
    mouseY = ((e.clientY - rect.top) / rect.height) - 0.5;
  });

  // 애니메이션 루프 (초경량 연산으로 60fps 보장)
  function animate() {
    requestAnimationFrame(animate);

    if (isHovering) {
      // 호버 시 마우스 방향을 부드럽게 바라봄
      mesh.rotation.y += (mouseX * 1.5 - mesh.rotation.y) * 0.08;
      mesh.rotation.x += (mouseY * 1.5 - mesh.rotation.x) * 0.08;
    } else {
      // 평소에는 이미지의 정갈한 각도를 유지하며 아주 미세하게 자전
      mesh.rotation.y += 0.003;
      mesh.rotation.x += 0.001;
    }

    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
});
