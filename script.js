const landing = document.querySelector(".landing");
const landingCanvas = document.querySelector(".landing-canvas");
const landingDisplay = document.querySelector(".landing-display");
const displayObject = document.querySelector(".display-object");
const follower = document.querySelector(".cursor-follower");
const revealCards = document.querySelectorAll(".reveal-card");
const navLinks = document.querySelectorAll(".topnav a[data-target]");

const pointer = {
  x: window.innerWidth * 0.72,
  y: window.innerHeight * 0.38,
  tx: window.innerWidth * 0.72,
  ty: window.innerHeight * 0.38,
};

const tilt = {
  rx: -10,
  ry: 24,
  rz: 4,
  tx: -10,
  ty: 24,
  tz: 4,
  hovering: false,
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const setupLandingCanvas = () => {
  if (!landing || !landingCanvas) {
    return null;
  }

  const ctx = landingCanvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const state = { width: 0, height: 0, dpr: 1 };

  const resize = () => {
    const rect = landing.getBoundingClientRect();
    state.width = rect.width;
    state.height = rect.height;
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    landingCanvas.width = Math.max(1, Math.floor(rect.width * state.dpr));
    landingCanvas.height = Math.max(1, Math.floor(rect.height * state.dpr));
    landingCanvas.style.width = `${rect.width}px`;
    landingCanvas.style.height = `${rect.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  };

  const draw = () => {
    const { width, height } = state;
    if (!width || !height) {
      return;
    }

    ctx.clearRect(0, 0, width, height);
    const rect = landing.getBoundingClientRect();
    const px = pointer.x - rect.left;
    const py = pointer.y - rect.top;

    const glow = ctx.createRadialGradient(px, py, 0, px, py, Math.max(width, height) * 0.52);
    glow.addColorStop(0, "rgba(255,255,255,0.09)");
    glow.addColorStop(0.18, "rgba(219,255,134,0.08)");
    glow.addColorStop(0.44, "rgba(93,53,163,0.08)");
    glow.addColorStop(1, "rgba(16,16,18,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  };

  resize();
  return { resize, draw };
};

const landingCanvasController = setupLandingCanvas();

const updateLandingVars = () => {
  if (!landing) {
    return;
  }

  const rect = landing.getBoundingClientRect();
  const x = ((pointer.x - rect.left) / Math.max(rect.width, 1)) * 100;
  const y = ((pointer.y - rect.top) / Math.max(rect.height, 1)) * 100;

  landing.style.setProperty("--pointer-x", `${Math.max(0, Math.min(100, x))}%`);
  landing.style.setProperty("--pointer-y", `${Math.max(0, Math.min(100, y))}%`);
};

const updateCrystalTiltTarget = (clientX, clientY) => {
  if (!landingDisplay) {
    return;
  }

  const rect = landingDisplay.getBoundingClientRect();
  const inside =
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom;

  tilt.hovering = inside;
  landingDisplay.classList.toggle("is-hovering", inside);

  if (!inside) {
    tilt.tx = -10;
    tilt.ty = 24;
    tilt.tz = 4;
    return;
  }

  const nx = ((clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
  const ny = ((clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
  tilt.tx = -10 + ny * -24;
  tilt.ty = 24 + nx * 34;
  tilt.tz = 4 + nx * 8;
};

const updateNavProgress = () => {
  const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const atBottom = window.scrollY >= maxScroll - 4;

  navLinks.forEach((link) => {
    const section = document.getElementById(link.dataset.target);
    if (!section) {
      return;
    }

    if (atBottom && link.dataset.target === "contact") {
      link.style.setProperty("--nav-progress", "1");
      link.classList.add("is-active");
      return;
    }

    const rect = section.getBoundingClientRect();
    const start = window.innerHeight * 0.75;
    const end = window.innerHeight * 0.18;
    const progress = clamp01((start - rect.top) / Math.max(start - end, 1));
    link.style.setProperty("--nav-progress", progress.toFixed(3));
    link.classList.toggle("is-active", progress > 0.02 && progress < 1);
  });
};

const animate = () => {
  pointer.x += (pointer.tx - pointer.x) * 0.16;
  pointer.y += (pointer.ty - pointer.y) * 0.16;

  tilt.rx += (tilt.tx - tilt.rx) * 0.14;
  tilt.ry += (tilt.ty - tilt.ry) * 0.14;
  tilt.rz += (tilt.tz - tilt.rz) * 0.14;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
  }

  if (displayObject) {
    displayObject.style.setProperty("--object-rotate-x", `${tilt.rx}deg`);
    displayObject.style.setProperty("--object-rotate-y", `${tilt.ry}deg`);
    displayObject.style.setProperty("--object-rotate-z", `${tilt.rz}deg`);
  }

  updateLandingVars();
  if (landingCanvasController) {
    landingCanvasController.draw();
  }

  requestAnimationFrame(animate);
};

window.addEventListener("pointermove", (event) => {
  pointer.tx = event.clientX;
  pointer.ty = event.clientY;
  updateCrystalTiltTarget(event.clientX, event.clientY);

  if (follower) {
    follower.classList.toggle("is-link", Boolean(event.target.closest("a, button")));
  }
});

window.addEventListener("pointerleave", () => {
  pointer.tx = window.innerWidth * 0.72;
  pointer.ty = window.innerHeight * 0.38;
  tilt.hovering = false;
  tilt.tx = -10;
  tilt.ty = 24;
  tilt.tz = 4;
  landingDisplay?.classList.remove("is-hovering");
});

window.addEventListener("scroll", updateNavProgress, { passive: true });

window.addEventListener("resize", () => {
  if (landingCanvasController) {
    landingCanvasController.resize();
  }
  updateNavProgress();
});

if (revealCards.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -12% 0px",
    }
  );

  revealCards.forEach((card) => observer.observe(card));
}

updateNavProgress();
animate();
