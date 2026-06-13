import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    ENGINE DESTROY & CLEAN
════════════════════════════════════════ */
if (window.animFrameId) {
  cancelAnimationFrame(window.animFrameId);
  window.animFrameId = null;
}
if (window.threeRenderer) {
  window.threeRenderer.dispose();
  const domCanvas = document.querySelector('#model-canvas');
  if (domCanvas) {
    const gl = domCanvas.getContext('webgl2') || domCanvas.getContext('webgl');
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
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

// 숨겨야 할 가짜 레이어 제거
const eliminateFakeModels = () => {
  ['#crystal-fallback','#codex-3d','.fallback-layer','.crystal-backup','#three-debug-hud'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.style.setProperty('display','none','important');
  });
};

/* ════════════════════════════════════════
    마우스 트래킹
════════════════════════════════════════ */
const mouse = { x: 0, y: 0 };
const pointer = {
  x: window.innerWidth * 0.5,  y: window.innerHeight * 0.5,
  tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5
};
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ════════════════════════════════════════
    수정사항 2: 기본 시작 각도 — 서 있는 정면 기반 비스듬한 형태
════════════════════════════════════════ */
// X 각도를 0.28에서 0.05로 수정하여 모델링이 앞으로 누워있지 않고 똑바로 서 있도록 만듭니다.
const baseRotation = { x: 0.05, y: 0.55 };
const rotState     = { x: 0.05, y: 0.55 };

// 자동 자전을 위한 독립 각도 누적
let autoRotY = 0.55;
// 마우스가 캔버스 영역에 있는지 여부
let isHoveringModel = false;

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
    요구사항 1: HDRI 스튜디오 환경 — 프리즘 오로라광 극대화
════════════════════════════════════════ */
const generatePureEnvironment = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = null;

  // 상단 강력 백색광 패널
  const topLight = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.5, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  topLight.position.set(0, 12, 0);
  scene.add(topLight);

  // 시안 패널 (왼쪽)
  const cyanPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0x00ffff })
  );
  cyanPanel.position.set(-10, 5, -2);
  scene.add(cyanPanel);

  // 마젠타 패널 (오른쪽)
  const magentaPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0xff00ff })
  );
  magentaPanel.position.set(10, 4, 2);
  scene.add(magentaPanel);

  // 황금/앰버 패널 (하단 반사)
  const amberPanel = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.1, 14),
    new THREE.MeshBasicMaterial({ color: 0xffcc44 })
  );
  amberPanel.position.set(0, -8, 0);
  scene.add(amberPanel);

  // 네온 블루 패널 (뒤)
  const bluePanel = new THREE.Mesh(
    new THREE.BoxGeometry(14, 14, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x4488ff })
  );
  bluePanel.position.set(0, 2, -12);
  scene.add(bluePanel);

  // 라벤더 패널 (앞)
  const lavPanel = new THREE.Mesh(
    new THREE.BoxGeometry(12, 12, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xcc88ff })
  );
  lavPanel.position.set(0, 3, 12);
  scene.add(lavPanel);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(scene);
  pmrem.dispose();
  rt.texture.mapping = THREE.CubeReflectionMapping;
  return rt.texture;
};

/* ════════════════════════════════════════
    요구사항 1: THREE.JS RENDER PIPELINE
    — 수정사항 1: 투명 크리스탈에서 실버 메탈릭 재질로 변경
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
    logarithmicDepthBuffer: false,
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  window.threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping;
  window.threeRenderer.toneMappingExposure = 2.4;
  window.threeRenderer.sortObjects = true;

  // 메탈 반사 극대화를 위한 광량 보정 조명 설정
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 9.0);
  dirLight1.position.set(7, 16, 10);
  window.threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xeef7ff, 5.0);
  dirLight2.position.set(-8, -4, 8);
  window.threeScene.add(dirLight2);

  const dirLight3 = new THREE.DirectionalLight(0xffccff, 3.5);
  dirLight3.position.set(4, -8, -4);
  window.threeScene.add(dirLight3);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  window.threeScene.add(ambientLight);

  window.threeCamera = new THREE.PerspectiveCamera(24, W / H, 0.1, 100);
  window.threeCamera.position.set(0, 0, 5.8);

  const envTexture = generatePureEnvironment(window.threeRenderer);
  window.threeScene.environment = envTexture;

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    `./modeling.glb?v=${Math.random()}`,
    (gltf) => {
      if (!gltf || !gltf.scene) { hideSiteLoader(); return; }
      if (window.modelAnchor) window.threeScene.remove(window.modelAnchor);

      const model = gltf.scene;

      /* ── 수정사항 1 핵심: 실버 메탈릭 재질 공식 ── */
      const silverMetallicMat = new THREE.MeshPhysicalMaterial({
        color: 0xdddddd,            // 정갈하고 정제된 실버 베이스 톤
        metalness: 0.95,            // 실버 금속 표면 구현
        roughness: 0.12,            // 세련된 반사광 왜곡을 위한 약간의 표면 거칠기
        
        transparent: false,         // 불투명 메탈릭 처리
        opacity: 1.0,
        
        side: THREE.DoubleSide,     // 내외부 면이 모두 매끄럽게 처리되도록 양면 세팅
        depthWrite: true,
        depthTest: true,

        // 환경광을 다채로운 은빛으로 분산시키기 위한 오로라 펄 레이어 유지
        iridescence: 0.35,
        iridescenceIOR: 1.9,
        iridescenceThicknessRange: [100, 300],

        // 실버 바디 위를 감싸는 고광택 유리 코팅막
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        specularIntensity: 2.5,
        specularColor: new THREE.Color(0xffffff),
      });

      model.traverse((child) => {
        if (child.isMesh) {
          child.material    = silverMetallicMat;
          child.renderOrder = 1;
          child.castShadow    = false;
          child.receiveShadow = false;
        }
      });

      // 스케일 오토 레이아웃
      const BOUNDS = 2.1;
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

      // 초기 각도 세팅 (비스듬히 서 있는 형태)
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
    수정사항 3: 스크롤 인디케이터 (정밀 끝까지 차도록 계산 보정)
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
  const headerH     = 92;

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

  // 문서 전체 스크롤의 마지막 끝 지점에 다다랐을 때 예외 안전 보정
  const isAtBottom = (scrollY + winH >= docH - 5);

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

    // 프로그레스 바가 각 단락 끝 및 페이지 마지막에서 완벽히 1에 수렴하도록 매핑 기준 거리 수정
    const entered  = scrollY - secTop;
    const total    = secH - (i === sections.length - 1 ? winH - headerH : 0);
    
    let raw = total > 0 ? clamp01(entered / total) : 0;
    if (isAtBottom && i === sections.length - 1) raw = 1.0;

    sec.progress.style.setProperty('--nav-p', raw.toFixed(4));
  });
};

/* ════════════════════════════════════════
    요구사항 2: MAIN ANIMATION LOOP
════════════════════════════════════════ */
let clock = 0;

const animate = () => {
  window.animFrameId = requestAnimationFrame(animate);
  clock = Date.now() * 0.001;

  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;

  if (follower) {
    follower.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
  }

  updateLandingVars();
  if (landingCanvasCtrl) landingCanvasCtrl.draw();

  if (window.threeRenderer && window.threeScene && window.threeCamera) {
    if (window.modelAnchor) {

      if (isHoveringModel) {
        const targetX = baseRotation.x + (-mouse.y * 0.6);
        const targetY = autoRotY      + ( mouse.x * 0.7);

        rotState.x += (targetX - rotState.x) * 0.05;
        rotState.y += (targetY - rotState.y) * 0.05;
      } else {
        autoRotY += 0.004;
        const targetX = baseRotation.x + Math.sin(clock * 0.35) * 0.08;
        const targetY = autoRotY;

        rotState.x += (targetX - rotState.x) * 0.025;
        rotState.y += (targetY - rotState.y) * 0.025;
      }

      window.modelAnchor.rotation.x = rotState.x;
      window.modelAnchor.rotation.y = rotState.y;
      window.modelAnchor.position.y = Math.sin(clock * 0.9) * 0.022;
    }
    window.threeRenderer.render(window.threeScene, window.threeCamera);
  }
};

/* ════════════════════════════════════════
    HOVER & POINTER EVENTS
════════════════════════════════════════ */
const setupHoverEvents = () => {
  window.addEventListener('pointermove', (e) => {
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
    mouse.x = (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  const displayShell = document.querySelector('.landing-display-shell');
  if (displayShell) {
    displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
    displayShell.addEventListener('pointerleave', () => {
      isHoveringModel = false;
      autoRotY = rotState.y;
    });
  }
};

/* ════════════════════════════════════════
    요구사항 9: 폴더 GUI 인터랙션
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
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  /* ── 수정사항 4 핵심: 레이싱 컨디션 원인인 타이머를 지우고 단일클릭(선택)/더블클릭(오픈) 분리 ── */
  // 1. 단일 클릭 이벤트: 즉각적인 아이콘 하이라이트 선택 및 해제 전담
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

  // 2. 더블 클릭 이벤트: 브라우저 고유 네이티브 'dblclick'을 이용해 즉시 정확하게 폴더 열기 실행
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

  modalClose.addEventListener('click', closeModal);
  modalBack.addEventListener('click',  closeModal);
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
