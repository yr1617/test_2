document.addEventListener("DOMContentLoaded", () => {
  
  /* ════════════════════════════════════════
      [기능 1] 로고 회전 로딩 스크린 제어
  ════════════════════════════════════════ */
  window.addEventListener("load", () => {
    const loader = document.getElementById("loading-screen");
    if (loader) {
      setTimeout(() => {
        loader.style.opacity = "0";
        loader.style.visibility = "hidden";
        
        // 로딩 완료 후 숨겨져 있던 예린님의 본문 영역 안전하게 잠금 해제
        const contentShell = document.querySelector(".content-shell");
        if (contentShell) {
          contentShell.style.setProperty("display", "block", "important");
          contentShell.style.setProperty("visibility", "visible", "important");
          contentShell.style.setProperty("opacity", "1", "important");
        }
      }, 500);
    }
  });

  /* ════════════════════════════════════════
      [기능 2] 마우스 호버 인터랙션 (CSS 변수 매핑)
  ════════════════════════════════════════ */
  const shell = document.querySelector(".landing-display-shell");
  const crystal = document.querySelector(".crystal-fallback");

  if (shell && crystal) {
    shell.addEventListener("mousemove", (e) => {
      const rect = shell.getBoundingClientRect();
      const rotateX = -((e.clientY - rect.top) / rect.height - 0.5) * 40;
      const rotateY = ((e.clientX - rect.left) / rect.width - 0.5) * 40;

      crystal.style.setProperty("--object-rotate-x", `${rotateX - 10}deg`);
      crystal.style.setProperty("--object-rotate-y", `${rotateY + 24}deg`);
    });

    shell.addEventListener("mouseleave", () => {
      crystal.style.setProperty("--object-rotate-x", "-10deg");
      crystal.style.setProperty("--object-rotate-y", "24deg");
    });
  }

  /* ════════════════════════════════════════
      [기능 3] 메뉴바 동시 차오름 해결 (개별 스크롤 격리)
  ════════════════════════════════════════ */
  const navLinks = document.querySelectorAll(".topnav a");
  const sections = Array.from(navLinks).map(link => {
    const id = link.getAttribute("href");
    return id && id.startsWith("#") ? document.querySelector(id) : null;
  });

  function scrollTracker() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const viewportHeight = window.innerHeight;

    navLinks.forEach((link, index) => {
      const section = sections[index];
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const sectionTopOnPage = rect.top + scrollTop;
      const sectionHeight = rect.height;

      // 오직 현재 뷰포트에 걸린 섹션만 게이지를 독립적으로 계산
      if (scrollTop + viewportHeight > sectionTopOnPage && scrollTop < sectionTopOnPage + sectionHeight) {
        const progress = (scrollTop + viewportHeight - sectionTopOnPage) / (sectionHeight + viewportHeight);
        link.style.setProperty("--nav-progress", Math.min(Math.max(progress, 0), 1));
      } else {
        link.style.setProperty("--nav-progress", "0");
      }

      // 액티브 메뉴 활성화
      if (rect.top <= viewportHeight * 0.5 && rect.bottom >= viewportHeight * 0.5) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }

  window.addEventListener("scroll", scrollTracker);
  scrollTracker();
});
