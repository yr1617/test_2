import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// 전역 상태 및 마우스 변수
let mouseX = 0, mouseY = 0;
let isHoveringModel = false;
let clock = 0;
const rotState = { x: 0, y: 0 };

const modelCanvas = document.querySelector('#model-canvas');

const hideSiteLoader = () => {
    const siteLoader = document.querySelector('#site-loader');
    if (siteLoader) {
        setTimeout(() => siteLoader.classList.add('is-loaded'), 500);
    }
};

// 🌟 크롬 메탈의 반사각을 완벽하게 살려주는 고대비 백그라운드 환경 맵 생성
const generatePureEnvironment = (renderer) => {
    const scene = new THREE.Scene();
    scene.background = null;

    const roomGeo = new THREE.SphereGeometry(60, 16, 16);
    const roomMat = new THREE.MeshBasicMaterial({ color: 0x050508, side: THREE.BackSide });
    const room = new THREE.Mesh(roomGeo, roomMat);
    scene.add(room);

    // 상단 면광 효과 추가
    const topLight = new THREE.Mesh(
        new THREE.BoxGeometry(60, 2, 60),
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    );
    topLight.position.set(0, 30, 0);
    scene.add(topLight);

    // 정면 반사판 추가 (은빛 하이라이트 생성용)
    const frontCenter = new THREE.Mesh(
        new THREE.SphereGeometry(15, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    );
    frontCenter.position.set(0, 10, 40);
    scene.add(frontCenter);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromScene(scene);
    pmrem.dispose();
    rt.texture.mapping = THREE.CubeReflectionMapping;
    return rt.texture;
};

const initThree = () => {
    if (!modelCanvas) return;

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
    window.threeRenderer.toneMappingExposure = 1.4; 

    // 💡 [핵심 패치] 블렌더처럼 어두워지는 현상 완벽 방지 조명 세팅
    // 1. 카메라 시선 방향과 완전히 일치하는 직사광선 배치 (정면 암전 원천 차단)
    const cameraLight = new THREE.DirectionalLight(0xffffff, 3.5);
    cameraLight.position.set(0, 0, 10);
    window.threeScene.add(cameraLight);

    // 2. 대각선 우측 상단 메인 라이트
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 4.0);
    dirLight1.position.set(15, 15, 10);
    window.threeScene.add(dirLight1);

    // 3. 대각선 좌측 보조 라이트
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight2.position.set(-15, 10, 8);
    window.threeScene.add(dirLight2);

    // 4. 전체적인 음영을 은빛으로 채워줄 환경 기본광 상향
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
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

            // ✨ 빛을 머금으면서도 정면에서 메탈릭하게 쨍한 신소재 질감 구현
            const hyperChromeMat = new THREE.MeshStandardMaterial({
                color: 0xeeeeee,          
                metalness: 0.95,           
                roughness: 0.16,         // 0.04에서 0.16으로 올려 정면이 흑화하는 물리적 버그 해결!
                envMapIntensity: 5.0,    
                side: THREE.DoubleSide
            });

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = hyperChromeMat;
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
            
            // 최초에 가장 예쁘게 배치되는 기본 각도 설정
            model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12); 

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
                rotState.y += 0.003; // 마우스 안 댔을 때 은은하게 자전하는 속도
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

// 모든 이벤트 및 초기화 핸들러 통합
const initAll = () => {
    initThree();
    animate();
    initScrollReveal();

    window.addEventListener('mousemove', (e) => {
        const winW = window.innerWidth || 1;
        const winH = window.innerHeight || 1;
        mouseX = (e.clientX / winW) * 2 - 1;
        mouseY = -(e.clientY / winH) * 2 + 1;
        
        // 커서 팔로워 갱신 코드 추가
        const follower = document.querySelector('.cursor-follower');
        if (follower) {
            follower.style.left = `${e.clientX}px`;
            follower.style.top = `${e.clientY}px`;
        }
    }, { passive: true });

    const displayShell = document.querySelector('.landing-display-shell');
    if (displayShell) {
        displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
        displayShell.addEventListener('pointerleave', () => { isHoveringModel = false; });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}

window.addEventListener('resize', () => {
    if (!window.threeRenderer || !window.threeCamera) return;
    const shell = document.querySelector('.landing-display-shell') || { offsetWidth: 650, offsetHeight: 650 };
    window.threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
    window.threeCamera.aspect = shell.offsetWidth / shell.offsetHeight;
    window.threeCamera.updateProjectionMatrix();
});
