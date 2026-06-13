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
    요구사항 2: 기본 시작 각도 — 비스듬히 서 있는 형태
════════════════════════════════════════ */
// X: 위에서 내려다보는 각도, Y: 비스듬히 돌아간 각도
const baseRotation = { x: 0.28, y: 0.55 };
const rotState     = { x: 0.28, y: 0.55 };

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
    — 내부 교차선 완전 마스킹 + 오로라 극대화
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
    // 투명도 정렬을 위해 sortObjects 활성
    logarithmicDepthBuffer: false,
  });
  window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  window.threeRenderer.setSize(W, H);
  window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  window.threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping;
  window.threeRenderer.toneMappingExposure = 2.6;
  // 투명 오브젝트 렌더 순서 자동 정렬
  window.threeRenderer.sortObjects = true;

  // 조명
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 9.0);
  dirLight1.position.set(7, 16, 10);
  window.threeScene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xeef7ff, 5.0);
  dirLight2.position.set(-8, -4, 8);
  window.threeScene.add(dirLight2);

  const dirLight3 = new THREE.DirectionalLight(0xffccff, 3.5);
  dirLight3.position.set(4, -8, -4);
  window.threeScene.add(dirLight3);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
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

      /* ── 요구사항 1 핵심: 내부 교차선 완전 마스킹 + 프리즘 오로라 극대화 ──
         복잡하게 얽힌 메쉬 구조에서 내부 교차면을 완전히 차단하는 공식:
         - side: FrontSide  → 겉면만 렌더링, 내부 관통면 제거
         - depthWrite: false → 투명체 간 Z-fighting/얼룩 완전 방지
         - depthTest: true   → 다른 오브젝트와의 뎁스 관계는 유지
         - renderOrder: 1    → 투명 오브젝트 렌더 순서 명시
      */
      const crystalMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness:  0.0,
        roughness:  0.0,

        // 물리 유리 투과
        transparent: true,
        transmission: 1.0,
        opacity: 1.0,
        ior: 1.08,              // 낮은 IOR → 내부 굴절 꼬임 버그 차단
        thickness: 0.6,

        // 교차선 마스킹 핵심
        side: THREE.FrontSide,
        depthWrite: false,
        depthTest: true,

        // 오로라 프리즘광 극대화
        iridescence: 1.0,
        iridescenceIOR: 2.6,
        iridescenceThicknessRange: [120, 400],

        // 고광택 코팅
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        specularIntensity: 3.5,
        specularColor: new THREE.Color(0xffffff),
      });

      model.traverse((child) => {
        if (child.isMesh) {
          child.material    = crystalMat;
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
    요구사항 3: 스크롤 인디케이터 (정밀 계산)
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

    // 현재 뷰포트와 섹션이 얼마나 겹치는지 계산
    const visTop  = Math.max(scrollY, top);
    const visBot  = Math.min(scrollY + winH, bot);
    const overlap = Math.max(0, visBot - visTop);
    const coverage = overlap / Math.max(rect.height, 1);

    if (coverage > maxCoverage) {
      maxCoverage = coverage;
      activeIdx   = i;
    }
  });

  sections.forEach((sec, i) => {
    if (i !== activeIdx) {
      // 비활성: 진행률 0
      sec.progress.style.setProperty('--nav-p', '0');
      sec.link.classList.remove('is-active');
      return;
    }

    sec.link.classList.add('is-active');

    const rect     = sec.el.getBoundingClientRect();
    const secTop   = rect.top + scrollY - headerH;
    const secBot   = secTop + rect.height;
    const secH     = rect.height;

    // 뷰포트 내에서 섹션이 얼마나 스크롤됐는지 (0 ~ 1)
    // 섹션 상단이 화면 상단에 닿을 때 0, 섹션 하단이 화면 하단에서 벗어날 때 1
    const entered  = scrollY - secTop + winH; // 섹션이 뷰포트에 처음 진입한 시점부터의 스크롤 거리
    const total    = secH + winH;
    const raw      = clamp01(entered / total);

    // 첫 섹션(home)은 페이지 최상단일 때 0, 스크롤 시작하면 채움
    sec.progress.style.setProperty('--nav-p', raw.toFixed(4));
  });
};

/* ════════════════════════════════════════
    요구사항 2: MAIN ANIMATION LOOP
    — 자동 자전 + 마우스 반응 인터랙션
════════════════════════════════════════ */
let clock = 0;

const animate = () => {
  window.animFrameId = requestAnimationFrame(animate);
  clock = Date.now() * 0.001;

  // 커서 스무딩
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
        /* ── 마우스 호버 시: 마우스 방향 추적 (여유로운 Lerp) ── */
        // 마우스 -1~1 값을 각도 범위에 매핑 (±0.6 rad 여유)
        const targetX = baseRotation.x + (-mouse.y * 0.6);
        const targetY = autoRotY      + ( mouse.x * 0.7);

        rotState.x += (targetX - rotState.x) * 0.05;
        rotState.y += (targetY - rotState.y) * 0.05;
      } else {
        /* ── 평소: 느릿한 자동 자전 ── */
        autoRotY += 0.004; // 자전 속도 (낮을수록 느림)
        const targetX = baseRotation.x + Math.sin(clock * 0.35) * 0.08;
        const targetY = autoRotY;

        rotState.x += (targetX - rotState.x) * 0.025;
        rotState.y += (targetY - rotState.y) * 0.025;
      }

      window.modelAnchor.rotation.x = rotState.x;
      window.modelAnchor.rotation.y = rotState.y;

      // 부드러운 유영 효과
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

  // 모델 캔버스 영역 호버 감지 (요구사항 2)
  const displayShell = document.querySelector('.landing-display-shell');
  if (displayShell) {
    displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
    displayShell.addEventListener('pointerleave', () => {
      isHoveringModel = false;
      // 호버 해제 시 현재 autoRotY를 현재 rotState.y에 동기화해 튀는 현상 방지
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
  let clickTimer   = null;

  const openModal = (folderKey) => {
    const data = FOLDER_DATA[folderKey];
    if (!data) return;

    modalTitle.textContent = data.title;
    modalPath.textContent  = data.path;

    // 모달 바디 렌더링
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

  // 폴더 클릭 이벤트 (단일 / 더블)
  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.folder-item');
    if (!item) {
      // 바탕화면 빈 곳 클릭 → 선택 해제
      if (selectedItem) {
        selectedItem.classList.remove('is-selected');
        selectedItem = null;
      }
      return;
    }

    if (clickTimer) {
      // 더블클릭
      clearTimeout(clickTimer);
      clickTimer = null;
      item.classList.add('is-opening');
      setTimeout(() => item.classList.remove('is-opening'), 200);
      openModal(item.dataset.folder);
    } else {
      // 단일클릭 (150ms 후 확정)
      clickTimer = setTimeout(() => {
        clickTimer = null;
        // 선택 상태 토글
        if (selectedItem && selectedItem !== item) {
          selectedItem.classList.remove('is-selected');
        }
        if (selectedItem === item) {
          item.classList.remove('is-selected');
          selectedItem = null;
        } else {
          item.classList.add('is-selected');
          selectedItem = item;
        }
      }, 150);
    }
  });

  // 키보드 접근성 (Enter = 더블클릭, Space = 단일클릭)
  grid.addEventListener('keydown', (e) => {
    const item = e.target.closest('.folder-item');
    if (!item) return;
    if (e.key === 'Enter') openModal(item.dataset.folder);
    if (e.key === ' ')     item.classList.toggle('is-selected');
  });

  // 모달 닫기
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

  // 스크롤 이벤트: 인디케이터 + spotlight
  window.addEventListener('scroll', () => {
    updateNavProgress();

    // page-spotlight 위치 업데이트
    const spotlight = document.querySelector('.page-spotlight');
    if (spotlight) {
      const px = (pointer.x / window.innerWidth)  * 100;
      const py = (pointer.y / window.innerHeight) * 100;
      spotlight.style.setProperty('--page-pointer-x', `${px}%`);
      spotlight.style.setProperty('--page-pointer-y', `${py}%`);
    }
  }, { passive: true });

  // 초기 실행
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
