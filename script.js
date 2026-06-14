import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ════════════════════════════════════════
    🧹 유령 모델링 원천 차단 (CLEANUP CORE)
════════════════════════════════════════ */
if (window.animFrameId) {
    cancelAnimationFrame(window.animFrameId);
    window.animFrameId = null;
}

// 기존에 남아있던 전역 변수나 씬 구조가 있다면 완전히 도려냅니다.
if (window.threeRenderer) {
    window.threeRenderer.dispose();
    window.threeRenderer = null;
}
if (window.threeScene) {
    while(window.threeScene.children.length > 0){ 
        const obj = window.threeScene.children[0];
        window.threeScene.remove(obj); 
    }
    window.threeScene = null;
}

// 완전히 깨끗한 상태에서 새 장면 정의
window.threeScene = new THREE.Scene();
const modelCanvas = document.querySelector('#model-canvas');
const displayShell = document.querySelector('.landing-display-shell') || document.querySelector('#landing-display');

let mouseX = 0, mouseY = 0;
let isHoveringModel = false;
let clock = 0;
const rotState = { x: 0, y: 0 };

const hideSiteLoader = () => {
    const siteLoader = document.querySelector('#site-loader');
    if (siteLoader) {
        setTimeout(() => siteLoader.classList.add('is-loaded'), 400);
    }
};

/* ════════════════════════════════════════
    ✨ 크롬 하이라이트용 환경 맵 세팅
════════════════════════════════════════ */
const setupEnvironment = (scene, renderer) => {
    const envGroup = new THREE.Group();

    // 반사판 1 (좌측 상단)
    const lightPlate1 = new THREE.Mesh(
        new THREE.PlaneGeometry(35, 35),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    lightPlate1.position.set(-15, 20, 15);
    lightPlate1.lookAt(0, 0, 0);
    envGroup.add(lightPlate1);

    // 반사판 2 (우측 정면 강한 하이라이트)
    const lightPlate2 = new THREE.Mesh(
        new THREE.PlaneGeometry(45, 45),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    lightPlate2.position.set(20, 8, 25);
    lightPlate2.lookAt(0, 0, 0);
    envGroup.add(lightPlate2);

    // 반사판 3 (천장 베이스광)
    const lightPlate3 = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide })
    );
    lightPlate3.position.set(0, 35, 0);
    lightPlate3.rotation.x = Math.PI / 2;
    envGroup.add(lightPlate3);

    scene.add(envGroup);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envMapTexture = pmremGenerator.fromScene(envGroup).texture;
    
    scene.environment = envMapTexture;
    envGroup.visible = false; 
    
    // 메모리 누수 방지 리소스 해제
    envGroup.traverse((child) => {
        if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
        }
    });
    pmremGenerator.dispose();
};

/* ════════════════════════════════════════
    📦 THREE.JS 코어 초기화 (1 프레임 단 한 번만 실행)
════════════════════════════════════════ */
const initThree = () => {
    if (!modelCanvas || !displayShell) { hideSiteLoader(); return; }

    const width = displayShell.clientWidth || 650;
    const height = displayShell.clientHeight || 650;

    window.threeRenderer = new THREE.WebGLRenderer({
        canvas: modelCanvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
    });
    window.threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    window.threeRenderer.setSize(width, height);
    window.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    window.threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    window.threeRenderer.toneMappingExposure = 1.25;

    window.threeCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    window.threeCamera.position.set(0, 0, 5.3);

    setupEnvironment(window.threeScene, window.threeRenderer);

    // 흑화 현상 방지용 기본 조명 보강
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    window.threeScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(5, 12, 8);
    window.threeScene.add(dirLight);

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/libs/draco/');
    loader.setDRACOLoader(draco);

    // 중복 호출로 씬에 누적되는 현상 방지를 위해 기존 modelAnchor 완전 삭제
    if (window.modelAnchor) {
        window.threeScene.remove(window.modelAnchor);
        window.modelAnchor = null;
    }

    loader.load(
        './modeling.glb',
        (gltf) => {
            if (!gltf || !gltf.scene) { hideSiteLoader(); return; }
            const model = gltf.scene;

            // 크롬 실버 메탈 질감 강제 주입
            const chromeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,         
                metalness: 1.0,          
                roughness: 0.08,         
                envMapIntensity: 4.0,    
                side: THREE.DoubleSide
            });

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = chromeMaterial;
                }
            });

            // 바운딩 박스를 기준으로 화면 정중앙 배치 정렬
            const box = new THREE.Box3().setFromObject(model);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);

            const maxDim = Math.max(size.x, size.y, size.z);
            const targetBounds = 3.2; 
            const scale = targetBounds / maxDim;
            
            model.scale.setScalar(scale);
            model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
            model.rotation.set(Math.PI * 0.38, Math.PI * 0.05, Math.PI * 0.12);

            window.modelAnchor = new THREE.Group();
            window.modelAnchor.add(model);
            window.threeScene.add(window.modelAnchor);

            hideSiteLoader();
        },
        undefined,
        (err) => {
            console.warn('모델 로드 실패:', err);
            hideSiteLoader();
        }
    );
};

/* ════════════════════════════════════════
    🔄 루프 애니메이션 및 이벤트 바인딩
════════════════════════════════════════ */
const animate = () => {
    window.animFrameId = requestAnimationFrame(animate);
    clock += 0.01;

    if (window.threeRenderer && window.threeScene && window.threeCamera) {
        if (window.modelAnchor) {
            if (isHoveringModel) {
                const targetX = -mouseY * 0.35;
                const targetY = mouseX * 0.45;
                rotState.x += (targetX - rotState.x) * 0.08;
                rotState.y += (targetY - rotState.y) * 0.08;
            } else {
                rotState.x += (0 - rotState.x) * 0.05;
                rotState.y += 0.004; // 부드러운 기본 자동 회전
            }
            window.modelAnchor.rotation.x = rotState.x;
            window.modelAnchor.rotation.y = rotState.y;
            window.modelAnchor.position.y = Math.sin(clock * 0.8) * 0.05; 
        }
        window.threeRenderer.render(window.threeScene, window.threeCamera);
    }
};

const handleResize = () => {
    if (!window.threeRenderer || !window.threeCamera || !displayShell) return;
    const width = displayShell.clientWidth;
    const height = displayShell.clientHeight;

    window.threeRenderer.setSize(width, height);
    window.threeCamera.aspect = width / height;
    window.threeCamera.updateProjectionMatrix();
};

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

// 메인 초기화 실행
document.addEventListener('DOMContentLoaded', () => {
    initThree();
    animate();
});
if (document.readyState !== 'loading') {
    initThree();
    animate();
}
