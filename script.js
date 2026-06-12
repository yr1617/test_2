document.addEventListener("DOMContentLoaded", () => {
  
  /* ════════════════════════════════════════
      1. 로고가 회전하는 전역 로딩 화면 (로딩 마스크)
  ════════════════════════════════════════ */
  let loadingScreen = document.getElementById("loading-screen");
  if (!loadingScreen) {
    loadingScreen = document.createElement("div");
    loadingScreen.id = "loading-screen";
    
    // 로딩 화면 스타일 (화면 전체 덮기)
    Object.assign(loadingScreen.style, {
      position: "fixed",
      inset: "0",
      backgroundColor: "#101013",
      zIndex: "999999",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      transition: "opacity 0.6s ease, visibility 0.6s ease"
    });

    // 회전할 상표 로고 추출 및 생성
    const brandImg = document.querySelector(".brand-logo img");
    const loaderLogo = document.createElement("img");
    loaderLogo.src = brandImg ? brandImg.src : "logo.png"; 
    
    Object.assign(loaderLogo.style, {
      width: "80px",
      height: "80px",
      objectFit: "contain",
      animation: "logo-spin 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite"
    });

    // 3D 회전용 Y축 회전 키프레임 주입
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
      @keyframes logo-spin {
        0% { transform: rotateY(0deg); }
        100% { transform: rotateY(360deg); }
      }
    `;
    document.head.appendChild(styleSheet);
    
    loadingScreen.appendChild(loaderLogo);
    document.body.appendChild(loadingScreen);
  }

  // 브라우저가 모든 리소스를 읽으면 로딩 스크린 해제 및 본문 완전 강제 해제
  window.addEventListener("load", () => {
    setTimeout(() => {
      loadingScreen.style.opacity = "0";
      loadingScreen.style.visibility = "hidden";
      
      // 🔓 콘텐츠 유실 방지: 잘려있거나 숨겨진 본문 영역을 무조건 깨웁니다.
      const contentShell = document.querySelector(".content-shell");
      if (contentShell) {
        contentShell.style.opacity = "1";
        contentShell.style.visibility = "visible";
        contentShell.style.display = "block";
      }
      
      // ❌ 예린님 3D를 겹쳐서 가리던 쓰레기 Three.js 캔버스는 흔적도 없이 삭제
      const badCanvas = document.querySelector(".model-canvas");
      if (badCanvas) badCanvas.remove();
    }, 700); 
  });


  /* ════════════════════════════════════════
      2. 예린님의 영롱한 오색빛깔 원래 CSS 3D 모델링 원상복구
  ════════════════════════════════════════ */
  const fallbackModel = document.querySelector(".crystal-fallback");
  const displayContainer = document.querySelector(".landing-display-shell");

  if (fallbackModel) {
    // 겹침에 가려져 있던 오색 재질 모델링을 메인으로 강제 지정
    fallbackModel.classList.remove("is-hidden");
    fallbackModel.style.opacity = "1";
    fallbackModel.style.display = "block";
  }


  /* ════════════════════════════════════════
      3. 마우스 호버 인터랙션 (CSS 변수 제어 연동)
  ════════════════════════════════════════ */
  if (displayContainer && fallbackModel) {
    displayContainer.addEventListener("mousemove", (e) => {
      const rect = displayContainer.getBoundingClientRect();
      
      // 예린님의 CSS rotateX, rotateY 변수에 마우스 좌표 각도 연동 (-25deg ~ 25deg)
      const rotateX = -((e.clientY - rect.top) / rect.height - 0.5) * 50;
      const rotateY = ((e.clientX - rect.left) / rect.width - 0.5) * 50;

      fallbackModel.style.setProperty("--object-rotate-x", `${rotateX - 10}deg`);
      fallbackModel.style.setProperty("--object-rotate-y", `${rotateY + 24}deg`);
    });

    // 마우스가 떠나면 원래 예린님이 설정해 두신 고유의 각도로 복귀
    displayContainer.addEventListener("mouseleave", () => {
      fallbackModel.style.setProperty("--object-rotate-x", "-10deg");
      fallbackModel.style.setProperty("--object-rotate-y", "24deg");
    });
  }


  /* ════════════════════════════════════════
      4. 메뉴바 독립 격리 연동 (동시 차오름 버그 완전 박멸)
  ════════════════════════════════════════ */
  const navLinks = document.querySelectorAll(".topnav a");
  const sections = Array.from(navLinks).map(link => {
    const targetId = link.getAttribute("href");
    return targetId && targetId.startsWith("#") ? document.querySelector(targetId) : null;
  });

  function updateScrollNavigation() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const viewportHeight = window.innerHeight;

    navLinks.forEach((link, index) => {
      const section = sections[index];
      
      // 최상단 (Home) 메뉴 예외 처리
      if (!section) {
        if (scrollTop < viewportHeight * 0.4) {
          link.classList.add("active");
          link.style.setProperty("--nav-progress", "1");
        } else {
          link.classList.remove("active");
          link.style.setProperty("--nav-progress", "0");
        }
        return;
      }

      const rect = section.getBoundingClientRect();
      const sectionTopOnPage = rect.top + scrollTop;
      const sectionHeight = rect.height;

      // 🎯 해당 섹션 영역이 실제 스크롤 뷰포트 내에 진입했을 때만 바를 독립 계산
      if (scrollTop + viewportHeight > sectionTopOnPage && scrollTop < sectionTopOnPage + sectionHeight) {
        const currentProgress = (scrollTop + viewportHeight - sectionTopOnPage) / (sectionHeight + viewportHeight);
        link.style.setProperty("--nav-progress", Math.min(Math.max(currentProgress, 0), 1));
      } else {
        // 화면 밖에 있는 다른 메뉴바들은 철저하게 0%로 잠가버림
        link.style.setProperty("--nav-progress", "0");
      }

      // 화면 중간 스크롤 감지 시 해당 메뉴 텍스트 active 불빛 켜기
      if (rect.top <= viewportHeight * 0.5 && rect.bottom >= viewportHeight * 0.5) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }

  window.addEventListener("scroll", updateScrollNavigation);
  updateScrollNavigation(); // 첫 로드 시 체크
});
