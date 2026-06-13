import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    ENGINE RE-INIT PROTECTION (안전한 초기화)
════════════════════════════════════════ */
if (window.animFrameId) {
  cancelAnimationFrame(window.animFrameId);
  window.animFrameId = null;
}
if (window.threeRenderer) {
  window.threeRenderer.dispose();
  window.threeRenderer = null;
}
window.threeScene    = null;
window.threeCamera   = null;
window.modelAnchor   = null;
window.__threeInitialized = false;

/* ════════════════════════════════════════
    DOM REFS
════════════════════════════════════════ */
const landing      = document.querySelector('.landing');
const landingCanvas= document.querySelector('.landing-canvas');
const landingDisplay = document.querySelector('#landing-display');
const modelCanvas  = document.querySelector('#model-canvas');
const follower     = document.querySelector('.cursor-follower');
const navLinks     = document.querySelectorAll('.topnav a[data-target]');
const sections     = [];

const eliminateFakeModels = () => {
  ['#crystal-fallback','#codex-3d','.fallback-layer','.crystal-backup','#three-debug-hud'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.style.setProperty('display','none','important');
  });
};

/* ════════════════════════════════════════
    마우스 트래킹 & 전역 상태 변수
════════════════════════════════════════ */
const mouse = { x: 0, y: 0 };
const pointer = {
  x: window.innerWidth * 0.5,  y: window.innerHeight * 0.5,
  tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5
};
const clamp01 = v => Math.max(0, Math.min(1, v));

const baseRotation = { x: 0, y: 0 }; 
const rotState     = { x: 0, y: 0 };

let isHoveringModel = false; 
let isModalOpen = false; 

/* ════════════════════════════════════════
    LANDING CANVAS BACKGROUND
════════════════════════════════════════ */
const setupLandingCanvas = () => {
  if (!landing || !landingCanvas) return null;
  const ctx = landingCanvas.getContext('2d');
  if (!ctx) return null;
  let state = { width: 0, height: 0, dpr: 1 };

  const resize = () => {
    const rect = landing.getBoundingClientRect();
    state.width  = rect.width;
    state.height = rect.height;
    state.dpr    = Math.min(window.devicePixelRatio || 1, 1.5);
    landingCanvas.width  = Math.max(1, Math.floor(rect.width  * state.dpr));
    landingCanvas.height = Math.max(1, Math.floor(rect.height * state.dpr));
    landingCanvas.style.width  = `${rect.width}px`;
    landingCanvas.style.height = `${rect.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  };

  const draw = () => {
    const { width, height } = state;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const rect = landing.getBoundingClientRect();
    const px = pointer.x - rect.left;
    const py = pointer.y - rect.top;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, Math.max(width, height) * 0.52);
    glow.addColorStop(0,   'rgba(255,255,255,0.09)');
    glow.addColorStop(0.3, 'rgba(160,110,255,0.04)');
    glow.addColorStop(1,   'rgba(16,16,18,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  };

  resize();
  return { resize, draw };
};

let landingCanvasCtrl = null;

const updateLandingVars = () => {
  if (!landing) return;
  const rect = landing.getBoundingClientRect();
  const x = ((pointer.x - rect.left) / Math.max(rect.width,  1)) * 100;
  const y = ((pointer.y - rect.top)  / Math.max(rect.height, 1)) * 100;
  landing.style.setProperty('--pointer-x', `${clamp01(x/100)*100}%`);
  landing.style.setProperty('--pointer-y', `${clamp01(y/100)*100}%`);
};

/* ════════════════════════════════════════
    🔥 상시 화사한 반사를 위한 고대비 스튜디오 생성
════════════════════════════════════════ */
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = null;

  // 완전히 어둡게 묻히지 않도록 기본 공간 톤을 미세하게 업그레이드
  const roomGeo = new THREE.SphereGeometry(60, 16, 16);
  const roomMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0f, side: THREE.BackSide });
  const room = new THREE.Mesh(roomGeo, roomMat);
  scene.add(room);

  // 1. 상단 메인 하이라이트 대형 광판 (마우스가 없어도 은빛 라인을 고정)
  const topLight = new THREE.Mesh(
    new THREE.BoxGeometry(80, 4, 80),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  topLight.position.set(0, 30, -5);
  scene.add(topLight);

  // 2. 전면 우측 고대비 반사 구체 (블렌더의 전면 하이라이트 재현)
  const frontRight = new THREE.Mesh(
    new THREE.SphereGeometry(16, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  frontRight.position.set(25, 15, 25);
  scene.add(frontRight);

  // 3. 좌측면 전반을 채워줄 와이드 세로 반사판 (어두운 면을 기본적으로 화사하게 채움)
  const leftPanel = new THREE.Mesh(
    new THREE.BoxGeometry(2, 50, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  leftPanel.position.set(-30, 8, 0);
  scene.add(leftPanel);

  // 4. 후면 백라이트 스튜디오 판 (실루엣을 맑게 띄워줌)
  const backPanel = new THREE.Mesh(
    new THREE.BoxGeometry(50, 50, 2),
    new THREE.MeshBasicMaterial({ color: 0x666677, toneMapped: false })
  );
  backPanel.position.set(0, 10, -35);
  scene.add(backPanel);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(scene);
  pmrem.dispose();
  rt.texture.mapping = THREE.CubeReflectionMapping;
  return rt.texture;
};

/* ════════════════════════════════════════
    THREE.JS ENGINE MAIN
════════════════════════════════════════ */
const initThree = () => {
  if (!modelCanvas || window.__threeInitialized) return;
  window.__threeInitialized = true;

  window.threeScene = new THREE.Scene();

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  window.threeRenderer = new THREE.WebGLRenderer({
    canvas: modelCanvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  
  // ⚡ 블렌더 실시간 리얼 뷰포트 대비감 정립
  window.threeRenderer.toneMapping      = THREE.LinearToneMapping; 
  window.threeRenderer.toneMappingExposure = 2.4; // 기본 노출을 더 환하게 업업!

  // 기본 라이팅 파워를 훨씬 강렬하게 세팅 (마우스 없을 때 어두움 방지)
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 14.0);
  dirLight1.position.set(15, 25, 20); 
  window.threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 8.0);
  dirLight2.position.set(-20, 0, 15); 
  window.threeScene.add(dirLight2);

  const ambientLight = new THREE.AmbientLight(0xffffff, 2.5); // 전체 음영 베이스를 화사하게 셋업
  window.threeScene.add(ambientLight);

  // 위아래 늘어난 캔버스 공간에 맞춰 카메라 시야 범위 최적화
  window.threeCamera = new THREE.PerspectiveCamera(23, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.0);

  const envTexture = generatePureEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  
  draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Math.random()}`,
    (gltf) => {
      if (!gltf || !gltf.scene) { hideSiteLoader(); return; }
      if (window.modelAnchor) window.threeScene.remove(window.modelAnchor);

      const model = gltf.scene;

      // ⚡ 완벽한 거울 광택 수은 크롬 재질 (주변 환경 맵 강도 극대화)
      const chromeSilverMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,          
        metalness: 1.0,           
        roughness: 0.002,         // 매끄러움을 최고치로 끌어올려 맑은 반사광 생성
        emissive: 0x050505,
        envMapIntensity: 6.5,     // 반사판을 거울처럼 쨍하게 반사시키는 강도 상향 조정
        side: THREE.DoubleSide
      });

      model.traverse((child) => {
        if (child.isMesh) {
          child.material    = chromeSilverMat;
          child.castShadow    = false;
          child.receiveShadow = false;
        }
      });

      // 자연스럽고 스타일리시하게 누워있는 정제된 각도
      model.rotation.x = 1.20;  
      model.rotation.y = 0.50;  
      model.rotation.z = -0.30; 

      // ⚡ 크기 축소 없이, 늘어난 캔버스를 꽉 채우도록 안정화 배치
      const BOUNDS = 2.7; 
      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = BOUNDS / maxDim;
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);

      window.modelAnchor = new THREE.Group();
      window.modelAnchor.add(model);
      window.threeScene.add(window.modelAnchor);

      window.modelAnchor.rotation.x = baseRotation.x;
      window.modelAnchor.rotation.y = baseRotation.y;

      eliminateFakeModels();
      hideSiteLoader();
    },
    undefined,
    (err) => {
      console.warn('GLB 로드 실패', err);
      hideSiteLoader();
    }
  );
};

const hideSiteLoader = () => {
  const siteLoader = document.querySelector('#site-loader');
  if (siteLoader) {
    setTimeout(() => siteLoader.classList.add('is-loaded'), 500);
  }
};

const resizeThree = () => {
  if (!window.threeRenderer || !window.threeCamera) return;
  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  window.threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
  window.threeCamera.aspect = shell.offsetWidth / shell.offsetHeight;
  window.threeCamera.updateProjectionMatrix();
};

/* ════════════════════════════════════════
    SCROLL INDICATOR
════════════════════════════════════════ */
const buildSectionMap = () => {
  navLinks.forEach(link => {
    const id = link.getAttribute('data-target');
    const el = document.getElementById(id);
    if (el) sections.push({ link, el, id, progress: link.querySelector('.nav-progress') });
  });
};

const updateNavProgress = () => {
  const scrollY     = window.scrollY;
  const winH        = window.innerHeight;
  const docH        = document.documentElement.scrollHeight;
  const headerH      = 92;

  let activeIdx = -1;
  let maxCoverage = -1;

  sections.forEach((sec, i) => {
    const rect  = sec.el.getBoundingClientRect();
    const top   = rect.top + scrollY - headerH;
    const bot   = top + rect.height;

    const visTop  = Math.max(scrollY, top);
    const visBot  = Math.min(scrollY + winH, bot);
    const overlap = Math.max(0, visBot - visTop);
    const coverage = overlap / Math.max(rect.height, 1);

    if (coverage > maxCoverage) {
      maxCoverage = coverage;
      activeIdx   = i;
    }
  });

  const isAtBottom = (scrollY + winH >= docH - 8);

  sections.forEach((sec, i) => {
    if (i !== activeIdx) {
      sec.progress.style.setProperty('--nav-p', '0');
      sec.link.classList.remove('is-active');
      return;
    }

    sec.link.classList.add('is-active');

    const rect     = sec.el.getBoundingClientRect();
    const secTop   = rect.top + scrollY - headerH;
    const secH     = rect.height;

    const scrolledInSection = scrollY - secTop;
    const totalScrollableRange = secH - (i === sections.length - 1 ? winH - headerH : 100);
    let raw = totalScrollableRange > 0 ? scrolledInSection / totalScrollableRange : 0;
    
    if (scrolledInSection + winH >= secH + 80) raw = 1.0;
    if (isAtBottom && i === sections.length - 1) raw = 1.0;

    sec.progress.style.setProperty('--nav-p', clamp01(raw).toFixed(4));
  });
};

/* ════════════════════════════════════════
    MAIN ANIMATION LOOP
════════════════════════════════════════ */
let clock = 0;

const animate = () => {
  window.animFrameId = requestAnimationFrame(animate);
  clock = Date.now() * 0.001;

  pointer.x += (pointer.tx - pointer.x) * 0.12;
  pointer.y += (pointer.ty - pointer.y) * 0.12;

  if (follower) {
    follower.style.left = `${pointer.x}px`;
    follower.style.top  = `${pointer.y}px`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (window.threeRenderer && window.threeScene && window.threeCamera) {
    if (window.modelAnchor && window.modelAnchor.rotation) {
      let targetX = 0;
      let targetY = 0;

      if (isHoveringModel) {
        targetX = 0 + (-mouse.y * 0.15);
        targetY = 0 + (mouse.x * 0.25);
        
        rotState.x += (targetX - rotState.x) * 0.06;
        rotState.y += (targetY - rotState.y) * 0.06;
      } else {
        rotState.x += (0 - rotState.x) * 0.03; 
        rotState.y += 0.003; 
      }

      window.modelAnchor.rotation.x = rotState.x;
      window.modelAnchor.rotation.y = rotState.y;
      window.modelAnchor.position.y = Math.sin(clock * 0.5) * 0.03; 
    }
    window.threeRenderer.render(window.threeScene, window.threeCamera);
  }
};

/* ════════════════════════════════════════
    HOVER & POINTER EVENTS
════════════════════════════════════════ */
const setupHoverEvents = () => {
  window.addEventListener('mousemove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
    
    if (isHoveringModel) {
      const winW = window.innerWidth || 1;
      const winH = window.innerHeight || 1;
      mouse.x = (e.clientX / winW) * 2 - 1;
      mouse.y = -(e.clientY / winH) * 2 + 1;
    }
  }, { passive: true });

  const displayShell = document.querySelector('.landing-display-shell');
  if (displayShell) {
    displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
    displayShell.addEventListener('pointerleave', () => { isHoveringModel = false; });
  }
};

/* ════════════════════════════════════════
    폴더 GUI 데이터 및 인터랙션
════════════════════════════════════════ */
const FOLDER_DATA = {
  academic: {
    title: '교과 프로젝트 경험',
    path:  '~/archive/academic/',
    items: [
      { text: '학생 마음 건강 콘텐츠 공모전, 포스터 부문 참여', highlight: false },
      { text: '포토샵 아트워크 & 브랜딩 굿즈 제작 프로젝트', highlight: false },
      { text: '멜론 광고 영상 제작 프로젝트 [공유하는 마음]', highlight: false },
      { text: '맛집 지도 서비스 제작 프로젝트 [MZ]', highlight: true },
      { text: '그래픽 포스터 제작 프로젝트 [모디곰 BI 포스터]', highlight: true },
      { text: '학교 아이덴티티 반영 패턴디자인 제작 프로젝트', highlight: false },
      { text: '흥부전 픽토그램 디자인 프로젝트', highlight: false },
      { text: 'GUI 스타일별 아이콘 제작 프로젝트', highlight: true },
      { text: 'OTT 서비스 디자인 시스템 컴포넌트 및 디자인 시스템 제작 프로젝트', highlight: true },
      { text: '패션 종합 어플리케이션 [MFF] 창업 계획서 작성 프로젝트', highlight: false },
    ]
  },
  club: {
    title: '교내 활동 · 동아리 활동',
    path:  '~/archive/club/',
    items: [
      { text: '급식 티켓팅 서비스 제작 프로젝트 [급식 패스]', highlight: true },
      { text: '미림 해커톤 / 컬러워크 기록 서비스 제작 프로젝트 [투데인트]', highlight: true },
      { text: 'AI ESG 교육 이수', highlight: false },
      { text: 'JS 스터디 홍보 게시물 제작', highlight: true },
    ]
  },
  personal: {
    title: '개인 프로젝트 경험',
    path:  '~/archive/personal/',
    items: [
      { text: '컵에 끼우는 화상 방지용 실리콘 차단물로 창업 아이디어 경진 대회 참여', highlight: false },
      { text: '(진행중) 하루 한번 면접 질문 서비스 제작 프로젝트 [모디곰]', highlight: true },
    ]
  },
  books: {
    title: '독서 경험',
    path:  '~/archive/books/',
    items: [
      { text: '< 라면집도 디자이너가 하면 다르다 > — 강범규', highlight: true },
      { text: '< 디자인 구구단 > — 에이핫', highlight: false },
      { text: '< (UX/UI 디자이너를 위한) 실무 피그마 > — 클레어정', highlight: true },
      { text: '< (비전공자를 위한 이해할 수 있는) IT 지식 > — 최원영', highlight: false },
      { text: '< 1일 1로그 100일 완성 IT 지식 > — 브라이언 W. 커니핸', highlight: false },
      { text: '< 폰트의 비밀 > — 고바야시 아키라', highlight: true },
      { text: '< 갱부 > — 나쓰메 소세키', highlight: false },
    ]
  },
  cert: {
    title: '자격취득내용',
    path:  '~/archive/cert/',
    items: [
      { text: 'GTQ 1급', highlight: false },
      { text: 'ITQ 한글 A급, PPT C급', highlight: false },
    ]
  },
  awards: {
    title: '수상 이력',
    path:  '~/archive/awards/',
    items: [
      { text: '신입생 대표 선서, 학교장 장학금', highlight: true },
      { text: '1학년 1학기 일본어 교과우수상 수상', highlight: false },
      { text: '피그마 재즈 대상 수상', highlight: true },
      { text: 'AI ESG 교육 이수 수료증', highlight: false },
    ]
  }
};

const setupFolderGUI = () => {
  const grid       = document.getElementById('desktop-grid');
  const modal      = document.getElementById('folder-modal');
  const modalClose = document.getElementById('modal-close');
  const modalBack  = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalPath  = document.getElementById('modal-path');
  const modalBody  = document.getElementById('modal-body');

  if (!grid || !modal) return;

  let selectedItem = null;

  const openModal = (folderKey) => {
    const data = FOLDER_DATA[folderKey];
    if (!data) return;

    modalTitle.textContent = data.title;
    modalPath.textContent  = data.path;

    const sectionLabel = document.createElement('p');
    sectionLabel.className   = 'modal-section-title';
    sectionLabel.textContent = 'FILES';

    const list = document.createElement('ul');
    list.className = 'modal-file-list';

    data.items.forEach(item => {
      const li    = document.createElement('li');
      li.className = 'modal-file-item' + (item.highlight ? ' is-highlight' : '');

      const icon  = document.createElement('span');
      icon.className   = 'file-icon';
      icon.textContent = item.highlight ? '★' : '›';

      const text  = document.createElement('span');
      text.textContent = item.text;

      li.appendChild(icon);
      li.appendChild(text);
      list.appendChild(li);
    });

    modalBody.innerHTML = '';
    modalBody.appendChild(sectionLabel);
    modalBody.appendChild(list);

    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    isModalOpen = true; 
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    isModalOpen = false; 
  };

  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.folder-item');
    if (!item) {
      if (selectedItem) {
        selectedItem.classList.remove('is-selected');
        selectedItem = null;
      }
      return;
    }

    if (selectedItem && selectedItem !== item) {
      selectedItem.classList.remove('is-selected');
    }
    
    item.classList.add('is-selected');
    selectedItem = item;
  });

  grid.addEventListener('dblclick', (e) => {
    const item = e.target.closest('.folder-item');
    if (!item) return;
    
    item.classList.add('is-opening');
    setTimeout(() => item.classList.remove('is-opening'), 200);
    openModal(item.dataset.folder);
  });

  grid.addEventListener('keydown', (e) => {
    const item = e.target.closest('.folder-item');
    if (!item) return;
    if (e.key === 'Enter') openModal(item.dataset.folder);
    if (e.key === ' ')     item.classList.toggle('is-selected');
  });

  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalBack) modalBack.addEventListener('click',  closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
};

/* ════════════════════════════════════════
    SCROLL REVEAL
════════════════════════════════════════ */
const setupReveal = () => {
  const cards = document.querySelectorAll('.reveal-card');
  if (!cards.length) return;
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
  );
  cards.forEach(c => obs.observe(c));
};

/* ════════════════════════════════════════
    INIT ALL
════════════════════════════════════════ */
const initAll = () => {
  landingCanvasCtrl = setupLandingCanvas();
  setupHoverEvents();
  eliminateFakeModels();
  buildSectionMap();
  setupReveal();
  setupFolderGUI();

  initThree();
  animate();

  window.addEventListener('scroll', () => {
    updateNavProgress();

    const spotlight = document.querySelector('.page-spotlight');
    if (spotlight) {
      const px = (pointer.x / window.innerWidth)  * 100;
      const py = (pointer.y / window.innerHeight) * 100;
      spotlight.style.setProperty('--page-pointer-x', `${px}%`);
      spotlight.style.setProperty('--page-pointer-y', `${py}%`);
    }
  }, { passive: true });

  updateNavProgress();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

window.addEventListener('resize', () => {
  if (landingCanvasCtrl) landingCanvasCtrl.resize();
  resizeThree();
  updateNavProgress();
});
