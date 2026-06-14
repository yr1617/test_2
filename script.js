import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// 애니메이션 프레임 전역 관리
if (window.animFrameId) {
    cancelAnimationFrame(window.animFrameId);
    window.animFrameId = null;
}

let scene, camera, renderer, modelAnchor;
let mouseX = 0, mouseY = 0;
let isHoveringModel = false;
let clock = 0;
const rotState = { x: 0, y: 0 };

const displayShell = document.querySelector('.landing-display-shell') || document.querySelector('#landing-display');

/* ════════════════════════════════════════
    ✨ 메탈 텍스처를 살려주는 초간결 조명/환경 시스템
════════════════════════════════════════ */
const setupEnvironment = (targetScene) => {
    // 사방에서 들어오는 은은한 기본 빛 (진흙처럼 어두워지는 현상 방지)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    targetScene.add(ambientLight);

    // 정면과 측면에서 메탈 질감을 하얗게 반사시킬 강력한 직사광선 배치
    const keyLight = new THREE.DirectionalLight(0xffffff, 4.0);
    keyLight.position.set(5, 8, 10);
    targetScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 2.0);
    fillLight.position.set(-8, 5, 5);
    targetScene.add(fillLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 2.5);
    topLight.position.set(0, 15, 2);
    targetScene.add(topLight);
};

/* ════════════════════════════════════════
    📦 THREE.JS 완전 초기화 (물리적 캔버스 리셋 방식)
════════════════════════════════════════ */
const initThree = () => {
    if (!displayShell) return;

    // 1. 유령 모델 원천 차단: 기존에 있던 캔버스를 완전히 파괴하고 새로 만듭니다.
    const oldCanvas = document.querySelector('#model-canvas');
    if (oldCanvas) oldCanvas.remove();

    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'model-canvas';
    // CSS 레이아웃에 맞춰 꽉 차게 설정
    newCanvas.style.width = '100%';
    newCanvas.style.height = '100%';
    displayShell.appendChild(newCanvas);

    // 2. CSS 배치와 폰트가 다 완료된 시점의 크기를 정확하게 측정
    const width = displayShell.clientWidth || 650;
    const height = displayShell.clientHeight || 650;

    // 3. Three 세팅 빌드
    scene = new THREE.Scene();
    
    renderer = new THREE.WebGLRenderer({
        canvas: newCanvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4; // 칙칙함을 날려버릴 밝기 보정

    // 4. 왜곡 방지 카메라 스케일 고정
    camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    setupEnvironment(scene);

    // 5. GLTF 로드
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
    loader.setDRACOLoader(draco);

    loader.load(
        './modeling.glb',
        (gltf) => {
            if (!gltf || !gltf.scene) return;
            const model = gltf.scene;

            // 눈이 부시도록 반짝이는 은빛 하이퍼 크롬 재질 강제 주입
            const chromeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                metalness: 0.98,          // 메탈 100%에 가깝게
                roughness: 0.08,          // 매끄러운 표면
                envMapIntensity: 2.0,
                side: THREE.DoubleSide
            });

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = chromeMaterial;
                }
            });

            // 바운딩 박스로 중심점 및 크기 정상화 (누워버리거나 묻히는 버그 방지)
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);

            const maxDim = Math.max(size.x, size.y, size.z);
            const targetBounds = 3.3; 
            const scale = targetBounds / maxDim;
            
            model.scale.setScalar(scale);
            // 원본 모델의 꼬인 좌표축을 정중앙(0,0,0)으로 강제 일치시킵니다.
            model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
            
            // 처음 기획했던 얼짱 각도로 정면 고정
            model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

            modelAnchor = new THREE.Group();
            modelAnchor.add(model);
            scene.add(modelAnchor);

            // 로더 제거
            const siteLoader = document.querySelector('#site-loader');
            if (siteLoader) siteLoader.classList.add('is-loaded');
        },
        undefined,
        (err) => { console.warn('모델 로드 실패:', err); }
    );
};

/* ════════════════════════════════════════
    🔄 루프 애니메이션 및 반응형 이벤트
════════════════════════════════════════ */
const animate = () => {
    window.animFrameId = requestAnimationFrame(animate);
    clock += 0.01;

    if (renderer && scene && camera) {
        if (modelAnchor) {
            if (isHoveringModel) {
                // 마우스 트래킹 반응
                const targetX = -mouseY * 0.35;
                const targetY = mouseX * 0.45;
                rotState.x += (targetX - rotState.x) * 0.08;
                rotState.y += (targetY - rotState.y) * 0.08;
            } else {
                // 평상시 은은한 자동 회전
                rotState.x += (0 - rotState.x) * 0.05;
                rotState.y += 0.004;
            }
            modelAnchor.rotation.x = rotState.x;
            modelAnchor.rotation.y = rotState.y;
            // 상하 부드러운 둥둥 가속도 효과
            modelAnchor.position.y = Math.sin(clock * 0.8) * 0.04;
        }
        renderer.render(scene, camera);
    }
};

const handleResize = () => {
    if (!renderer || !camera || !displayShell) return;
    const width = displayShell.clientWidth;
    const height = displayShell.clientHeight;

    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
};

// 마우스 위치 갱신 및 마우스 팔로워 연동
window.addEventListener('mousemove', (e) => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    mouseX = (e.clientX / width) * 2 - 1;
    mouseY = -(e.clientY / height) * 2 + 1;

    const follower = document.querySelector('.cursor-follower');
    if (follower) {
        follower.style.left = `${e.clientX}px`;
        follower.style.top = `${e.clientY}px`;
    }
}, { passive: true });

if (displayShell) {
    displayShell.addEventListener('pointerenter', () => { isHoveringModel = true; });
    displayShell.addEventListener('pointerleave', () => { isHoveringModel = false; });
}

window.addEventListener('resize', handleResize);

// 🔥 핵심 변경점: HTML 레이아웃과 CSS가 완전히 로드되어 배치된 후 비로소 단 '한 번만' 렌더링 엔진을 가동합니다.
window.onload = () => {
    initThree();
    animate();
};
