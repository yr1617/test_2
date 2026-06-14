<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MODIGOM_PORTFOLIO :: QUIET BUT SOLID</title>
    
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.161.0/three.module.min.js",
            "three/addons/loaders/GLTFLoader.js": "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.161.0/addons/loaders/GLTFLoader.js",
            "three/addons/loaders/DRACOLoader.js": "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.161.0/addons/loaders/DRACOLoader.js"
        }
    }
    </script>
    
    <link rel="stylesheet" href="./style.css">
</head>
<body>

    <div id="site-loader" class="flex-center">
        <div class="loader-spinner"></div>
    </div>

    <div class="cursor-follower"></div>

    <header class="topnav">
        <div class="inner flex-s-b">
            <a href="#" class="top-logo">★</a>
            <nav class="top-nav flex-c">
                <a href="#landing" data-target="landing" class="nav-link is-active">Home<span class="nav-progress"></span></a>
                <a href="#academic" data-target="academic" class="nav-link">Academic<span class="nav-progress"></span></a>
                <a href="#project-archive" data-target="project-archive" class="nav-link">Archive<span class="nav-progress"></span></a>
                <a href="#awards-cert" data-target="awards-cert" class="nav-link">Awards & Cert<span class="nav-progress"></span></a>
                <a href="#contact" data-target="contact" class="nav-link">Contact<span class="nav-progress"></span></a>
            </nav>
        </div>
    </header>

    <main>
        <section id="landing" class="landing vh-100 rel overflow-h">
            <div class="inner flex-s-b full-h rel z-2">
                <div class="landing-title-area">
                    <h1 class="landing-title text-uppercase">Quiet<br>but<br>Solid</h1>
                    <p class="landing-subtitle">차분함 속에서 피어나는 견고한 디자인, 모디곰입니다.</p>
                    <a href="#academic" class="btn-primary flex-c">View Profile<span class="btn-icon">↓</span></a>
                </div>
                
                <div class="landing-display-shell rel">
                    <div id="landing-display">
                        <canvas id="model-canvas"></canvas>
                        <div class="model-shade"></div>
                    </div>
                </div>
            </div>
            
            <div class="page-spotlight"></div>
            <div class="bottom-shade"></div>
        </section>

        <section id="academic" class="profile-section rel z-1">
            <div class="inner">
                <div class="reveal-card card-academic-main p-4">
                    <h2 class="section-title text-uppercase mb-4">Academic</h2>
                    <p class="card-p mb-4">패션 디자인 브랜딩, 광고 영상 제작 등 다양한 학업 프로젝트를 진행했습니다.</p>
                    <div class="academic-covers-grid grid-covers">
                        <img src="./project_cover_pattern.png" alt="패턴디자인 커버" class="img-fluid reveal-card">
                        <img src="./project_cover_pictogram.png" alt="흥부전 픽토그램 커버" class="img-fluid reveal-card">
                        <img src="./project_cover_mff.png" alt="MFF 창업 계획서 커버" class="img-fluid reveal-card">
                        <img src="./project_cover_ott.png" alt="OTT 디자인 시스템 커버" class="img-fluid reveal-card">
                    </div>
                </div>
            </div>
        </section>

        <section id="project-archive" class="archive-section vh-100 flex-center rel z-1">
            <div class="inner full-h">
                <div class="reveal-card card-archive-main full-h">
                    <div id="desktop-grid" class="p-3">
                        <div class="folder-item flex-c-v reveal-card" data-folder="academic" tabindex="0">
                            <img src="./icon_folder_mac.png" alt="폴더 아이콘" class="folder-icon">
                            <p class="folder-name">Academic</p>
                        </div>
                        <div class="folder-item flex-c-v reveal-card" data-folder="club" tabindex="0">
                            <img src="./icon_folder_mac.png" alt="폴더 아이콘" class="folder-icon">
                            <p class="folder-name">Club</p>
                        </div>
                        <div class="folder-item flex-c-v reveal-card" data-folder="personal" tabindex="0">
                            <img src="./icon_folder_mac.png" alt="폴더 아이콘" class="folder-icon">
                            <p class="folder-name">Personal</p>
                        </div>
                        <div class="folder-item flex-c-v reveal-card" data-folder="books" tabindex="0">
                            <img src="./icon_folder_mac.png" alt="폴더 아이콘" class="folder-icon">
                            <p class="folder-name">Books</p>
                        </div>
                        <div class="folder-item flex-c-v reveal-card" data-folder="awards" tabindex="0">
                            <img src="./icon_folder_mac.png" alt="폴더 아이콘" class="folder-icon">
                            <p class="folder-name">Awards</p>
                        </div>
                        <div class="folder-item flex-c-v reveal-card" data-folder="cert" tabindex="0">
                            <img src="./icon_folder_mac.png" alt="폴더 아이콘" class="folder-icon">
                            <p class="folder-name">Cert</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

    </main>

    <div id="folder-modal" class="modal-backdrop flex-center">
        <div class="modal-content reveal-card p-0 overflow-h">
            <div class="modal-header p-3 flex-s-b">
                <div class="modal-header-left flex-c">
                    <img src="./icon_folder_mac_open.png" alt="폴더 아이콘" class="folder-icon-sm mr-2">
                    <h3 id="modal-title" class="folder-title">폴더 이름</h3>
                </div>
                <div class="modal-header-right flex-c">
                    <span id="modal-path" class="folder-path mr-3">~/archive/folder_name</span>
                    <button id="modal-close" class="modal-close-btn text-uppercase">Close</button>
                </div>
            </div>
            <div id="modal-body" class="modal-body p-4">
            </div>
        </div>
    </div>

    <script type="module">
        import * as THREE from 'three';
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
        import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

        /* ════════════════════════════════════════
            에러 해결 완료: 괄호 문제 해결
        ════════════════════════════════════════ */

        // 랜딩 섹션 DOM 참조
        const landing = document.querySelector('.landing');
        const modelCanvas = document.querySelector('#model-canvas');

        // 전역 상태 변수
        let mouseX = 0, mouseY = 0;
        let isHoveringModel = false;
        let clock = 0;
        const rotState = { x: 0, y: 0 };

        const hideSiteLoader = () => {
            const siteLoader = document.querySelector('#site-loader');
            if (siteLoader) {
                setTimeout(() => siteLoader.classList.add('is-loaded'), 500);
            }
        };

        // 가상 환경 맵 생성 (크롬 실버 재질의 반사를 돕는 풍경)
        const generatePureEnvironment = (renderer) => {
            const scene = new THREE.Scene();
            scene.background = null;

            const roomGeo = new THREE.SphereGeometry(60, 16, 16);
            const roomMat = new THREE.MeshBasicMaterial({ color: 0x050508, side: THREE.BackSide });
            const room = new THREE.Mesh(roomGeo, roomMat);
            scene.add(room);

            const topLight = new THREE.Mesh(
                new THREE.BoxGeometry(60, 2, 60),
                new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
            );
            topLight.position.set(0, 30, 0);
            scene.add(topLight);

            const frontCenter = new THREE.Mesh(
                new THREE.SphereGeometry(15, 16, 16),
                new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
            );
            frontCenter.position.set(0, 10, 40);
            scene.add(frontCenter);

            const leftPanel = new THREE.Mesh(
                new THREE.BoxGeometry(1, 50, 30),
                new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
            );
            leftPanel.position.set(-30, 0, 10);
            scene.add(leftPanel);

            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader();
            const rt = pmrem.fromScene(scene);
            pmrem.dispose();
            rt.texture.mapping = THREE.CubeReflectionMapping;
            return rt.texture;
        };

        const initThree = () => {
            const shell = document.querySelector('.landing-display-shell') || { offsetWidth: 650, offsetHeight: 650 };
            const W = shell.offsetWidth;
            const H = shell.offsetHeight;

            window.threeScene = new THREE.Scene();

            window.threeRenderer = new THREE.WebGLRenderer({
                canvas: modelCanvas,
                alpha: true,
                antialias: true,
                powerPreference: 'high-performance'
            });
            window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            window.threeRenderer.setSize(W, H);
            window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
            window.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping; 
            window.threeRenderer.toneMappingExposure = 1.5; 

            const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
            dirLight.position.set(5, 10, 15);
            window.threeScene.add(dirLight);

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); 
            window.threeScene.add(ambientLight);

            window.threeCamera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
            window.threeCamera.position.set(0, 0, 4.2);

            const envTexture = generatePureEnvironment(window.threeRenderer);
            window.threeScene.environment = envTexture;

            const loader = new GLTFLoader();
            const draco  = new DRACOLoader();
            draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
            loader.setDRACOLoader(draco);

            loader.load(
                './modeling.glb',
                (gltf) => {
                    if (!gltf || !gltf.scene) { hideSiteLoader(); return; }
                    const model = gltf.scene;

                    // ⚡ 번쩍이는 리얼 크롬 실버 질감
                    const chromeSilverMat = new THREE.MeshStandardMaterial({
                        color: 0xdddddd,          
                        metalness: 1.0,           
                        roughness: 0.015,         
                        envMapIntensity: 12.0,    
                        side: THREE.DoubleSide
                    });

                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.material = chromeSilverMat;
                        }
                    });

                    const box = new THREE.Box3().setFromObject(model);
                    const centre = new THREE.Vector3();
                    box.getCenter(centre);
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const BOUNDS = 2.8; 
                    const scale = BOUNDS / maxDim;
                    model.scale.setScalar(scale);
                    model.position.set(-centre.x * scale, -centre.y * scale, -centre.z * scale);
                    model.rotation.set(0, 0, 0); 

                    window.modelAnchor = new THREE.Group();
                    window.modelAnchor.add(model);
                    window.modelAnchor.position.set(0, 0, 0); 
                    window.threeScene.add(window.modelAnchor);

                    hideSiteLoader();
                },
                undefined,
                (err) => {
                    console.warn('GLB 로드 실패', err);
                    hideSiteLoader();
                }
            );
        };

        const animate = () => {
            window.animFrameId = requestAnimationFrame(animate);
            clock += 0.01;

            if (window.threeRenderer && window.threeScene && window.threeCamera) {
                if (window.modelAnchor && window.modelAnchor.rotation) {
                    if (isHoveringModel) {
                        const targetX = -mouseY * 0.35;
                        const targetY = mouseX * 0.45;
                        rotState.x += (targetX - rotState.x) * 0.1;
                        rotState.y += (targetY - rotState.y) * 0.1;
                    } else {
                        rotState.x += (0 - rotState.x) * 0.05;
                        rotState.y += 0.004;
                    }
                    window.modelAnchor.rotation.x = rotState.x;
                    window.modelAnchor.rotation.y = rotState.y;
                    window.modelAnchor.position.y = Math.sin(clock * 0.6) * 0.04; 
                }
                window.threeRenderer.render(window.threeScene, window.threeCamera);
            }
        };

        const initScrollReveal = () => {
            const cards = document.querySelectorAll('.reveal-card');
            if (!cards.length) return;

            const revealObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('is-visible');
                            revealObserver.unobserve(entry.target);
                        }
                    });
                },
                { threshold: 0.1, rootMargin: '0px 0px -10% 0px' }
            );

            cards.forEach(card => revealObserver.observe(card));
        };

        // 초기화 함수
        const initAll = () => {
            initThree();
            animate();
            initScrollReveal();

            window.addEventListener('mousemove', (e) => {
                const winW = window.innerWidth || 1;
                const winH = window.innerHeight || 1;
                mouseX = (e.clientX / winW) * 2 - 1;
                mouseY = -(e.clientY / winH) * 2 + 1;
            }, { passive: true });

            const displayShell = document.querySelector('.landing-display-shell');
            if (displayShell) {
                displayShell.addEventListener('pointerenter', () => isHoveringModel = true);
                displayShell.addEventListener('pointerleave', () => isHoveringModel = false);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initAll);
        } else {
            initAll();
        }
    </script>
</body>
</html>
