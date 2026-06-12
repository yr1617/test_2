import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';

document.addEventListener("DOMContentLoaded", () => {
    // ════════════════════════════════════════
    // [기능 1] Three.js 유리 크리스탈 모델링 제어 (1번, 8번 연동)
    // ════════════════════════════════════════
    const container = document.querySelector('.landing-display-shell');
    if (container) {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.z = 6.5;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.4; 
        container.appendChild(renderer.domElement);

        const geometry = new THREE.OctahedronGeometry(1.8, 0);

        // 💎 8번 요구사항: 물방울 같은 완전 투명 유리 및 높은 대비의 오색빛깔 설정
        const crystalMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.03,        
            transparent: true,
            opacity: 0.25,          
            transmission: 0.98,     
            ior: 2.417,             
            side: THREE.DoubleSide,
            clearcoat: 1.0,         
            clearcoatRoughness: 0.01,
            sheen: 1.0,
            sheenColor: new THREE.Color(0xd1c4e9),
            iridescence: 1.0,
            iridescenceIOR: 1.9,
            iridescenceThicknessRange: [100, 800]
        });

        const mesh = new THREE.Mesh(geometry, crystalMaterial);
        scene.add(mesh);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const topLight = new THREE.DirectionalLight(0xffffff, 2.5);
        topLight.position.set(0, 5, 2);
        scene.add(topLight);

        const neonCyan = new THREE.PointLight(0x00f0ff, 3.5, 12);
        neonCyan.position.set(-4, -2, 3);
        scene.add(neonCyan);

        const neonMagenta = new THREE.PointLight(0xff00bc, 3.5, 12);
        neonMagenta.position.set(4, 2, -3);
        scene.add(neonMagenta);

        // 인터랙션 제어 변수
        let targetRotateX = 0;
        let targetRotateY = 0;
        let isHovered = false;
        let autoAngle = 0;

        // 1번 요구사항: 드래그 완전 제거 및 위아래 잘림 방지 한계치 제한(clamp) 마우스 호버 제어
        container.addEventListener('mousemove', (e) => {
            isHovered = true;
            const rect = container.getBoundingClientRect();
            // 마우스 위치 원점 기준 계산
            const mouseX = ((e.clientX - rect.left) / container.clientWidth) - 0.5;
            const mouseY = ((e.clientY - rect.top) / container.clientHeight) - 0.5;

            // 모델링 각도가 화면 밖으로 넘어가 잘리지 않도록 안전 회전 반경 한계 설정 (±35도 이내)
            targetRotateY = mouseX * Math.PI * 0.4; 
            targetRotateX = mouseY * Math.PI * 0.4;
        });

        container.addEventListener('mouseleave', () => {
            isHovered = false;
        });

        function animate() {
            requestAnimationFrame(animate);

            if (!isHovered) {
                // 마우스가 없을 때는 기본 자동 회전 구동
                autoAngle += 0.006;
                mesh.rotation.y = autoAngle;
                mesh.rotation.x = Math.sin(autoAngle * 0.5) * 0.2;
            } else {
                // 마우스 호버 시 타겟 회전 각도를 부드럽게 추적
                mesh.rotation.y += (targetRotateY - mesh.rotation.y) * 0.08;
                mesh.rotation.x += (targetRotateX - mesh.rotation.x) * 0.08;
            }

            renderer.render(scene, camera);
        }
        animate();

        window.addEventListener('resize', () => {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        });
    }

    // ════════════════════════════════════════
    // [기능 2] 3번 요구사항: 독립 스크롤 프로그레스 바 연산 최적화
    // ════════════════════════════════════════
    const navLinks = document.querySelectorAll(".topnav a");
    const sections = Array.from(navLinks).map(link => {
        const targetId = link.getAttribute("href");
        return targetId && targetId.startsWith("#") ? document.querySelector(targetId) : null;
    });

    function handleScrollProgress() {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const viewportHeight = window.innerHeight;
        const totalDocHeight = document.documentElement.scrollHeight;

        // 최하단 도달 검증 임계점
        const isAtBottom = (scrollTop + viewportHeight) >= (totalDocHeight - 15);

        navLinks.forEach((link, index) => {
            const section = sections[index];

            // 페이지가 최하단에 도달하면 모든 진행 바를 100% 채움
            if (isAtBottom) {
                link.style.setProperty("--nav-progress", "1");
                if (index === navLinks.length - 1) link.classList.add("active");
                else link.classList.remove("active");
                return;
            }

            // 홈(Home) 영역 처리
            if (!section) {
                if (scrollTop < viewportHeight * 0.5) {
                    link.classList.add("active");
                    const homeProgress = Math.min(scrollTop / (viewportHeight * 0.5), 1);
                    link.style.setProperty("--nav-progress", homeProgress);
                } else {
                    link.classList.remove("active");
                    link.style.setProperty("--nav-progress", "1");
                }
                return;
            }

            const rect = section.getBoundingClientRect();
            const sectionAbsoluteTop = rect.top + scrollTop;
            const sectionHeight = rect.height;

            // 순차적 단일 채우기: 현재 스크롤이 지나가고 있는 해당 섹션 영역만 독립적으로 연산
            if (scrollTop + viewportHeight > sectionAbsoluteTop && scrollTop < sectionAbsoluteTop + sectionHeight) {
                const sectionScrollCurrent = (scrollTop + viewportHeight) - sectionAbsoluteTop;
                const sectionScrollTotal = sectionHeight + viewportHeight;
                const progress = Math.min(Math.max(sectionScrollCurrent / sectionScrollTotal, 0), 1);
                
                link.style.setProperty("--nav-progress", progress);
            } else if (scrollTop >= sectionAbsoluteTop + sectionHeight) {
                link.style.setProperty("--nav-progress", "1");
            } else {
                link.style.setProperty("--nav-progress", "0");
            }

            // 텍스트 On/Off 활성화 상태 토글
            if (rect.top <= viewportHeight * 0.5 && rect.bottom >= viewportHeight * 0.5) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    }

    window.addEventListener("scroll", handleScrollProgress);
    handleScrollProgress(); 
});
