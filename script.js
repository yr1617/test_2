import * as THREE from 'https://unpkg.com/three@0.126.0/build/three.module.js';

document.addEventListener("DOMContentLoaded", () => {
    // ════════════════════════════════════════
    // [공통 세팅] 네비게이션 섹션 수집 및 초기화
    // ════════════════════════════════════════
    const navLinks = document.querySelectorAll(".topnav a");
    const sections = Array.from(navLinks).map(link => {
        const targetId = link.getAttribute("href");
        return targetId && targetId.startsWith("#") ? document.querySelector(targetId) : null;
    });

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
        renderer.toneMappingExposure = 1.4; // 선명한 대비를 위해 노출 최적화
        container.appendChild(renderer.domElement);

        // 정교한 정팔면체 (Octahedron) 지오메트리 생성
        const geometry = new THREE.OctahedronGeometry(1.8, 0);

        // 💎 물방울 같은 완전 투명 유리 및 찬란한 오색빛깔 물리 기반 마테리얼 (8번 요구사항)
        const crystalMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.03,        // 극도로 매끄러운 유리 질감
            transparent: true,
            opacity: 0.25,          // 투명도 확보 (물방울 느낌)
            transmission: 0.98,     // 완전 투명한 빛 통과 유리 효과
            ior: 2.417,             // 다이아몬드급 굴절률로 영롱한 왜곡 생성
            side: THREE.DoubleSide,
            clearcoat: 1.0,         // 겉면 하이라이트 코팅
            clearcoatRoughness: 0.01,
            sheen: 1.0,
            sheenColor: new THREE.Color(0xd1c4e9),
            // 찬란한 오색빛깔과 높은 대비를 위한 박막 간섭(Iridescence) 설정
            iridescence: 1.0,
            iridescenceIOR: 1.9,
            iridescenceThicknessRange: [100, 800]
        });

        const mesh = new THREE.Mesh(geometry, crystalMaterial);
        scene.add(mesh);

        // 💡 대비와 찬란함을 극대화하기 위한 고광도 다각도 조명 배치
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

        // 자동 회전 값 기준
        let autoAngle = 0;

        // 호버 시 마우스 각도 추적 및 회전 제한 (잘림 오류 방지 - 1번 요구사항)
        container.addEventListener('mousemove', (e) => {
            isHovered = true;
            const rect = container.getBoundingClientRect();
            const mouseX = ((e.clientX - rect.left) / container.clientWidth) - 0.5;
            const mouseY = ((e.clientY - rect.top) / container.clientHeight) - 0.5;

            // 잘리지 않도록 타이트하고 여유로운 각도 제한 한계 설정 (±35도)
            targetRotateY = mouseX * Math.PI * 0.4; 
            targetRotateX = mouseY * Math.PI * 0.4;
        });

        container.addEventListener('mouseleave', () => {
            isHovered = false;
        });

        // 애니메이션 루프 구동
        function animate() {
            requestAnimationFrame(animate);

            if (!isHovered) {
                // 평소에는 천천히 기본 자동 회전
                autoAngle += 0.006;
                mesh.rotation.y = autoAngle;
                mesh.rotation.x = Math.sin(autoAngle * 0.5) * 0.2;
            } else {
                // 호버 시 마우스 방향에 맞춰 부드럽게 감속 추적
                mesh.rotation.y += (targetRotateY - mesh.rotation.y) * 0.08;
                mesh.rotation.x += (targetRotateX - mesh.rotation.x) * 0.08;
            }

            renderer.render(scene, camera);
        }
        animate();

        // 리사이즈 매칭
        window.addEventListener('resize', () => {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        });
    }

    // ════════════════════════════════════════
    // [기능 2] 완벽한 독립 스크롤 프로그레스 바 제어 (3번 요구사항)
    // ════════════════════════════════════════
    function handleScrollProgress() {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const viewportHeight = window.innerHeight;
        const totalDocHeight = document.documentElement.scrollHeight;

        // 최하단 도달 여부 확인
        const isAtBottom = (scrollTop + viewportHeight) >= (totalDocHeight - 15);

        navLinks.forEach((link, index) => {
            const section = sections[index];

            // 1. 페이지가 완전히 끝까지 내려갔을 경우 모든 게이지 바를 100%로 가득 채움
            if (isAtBottom) {
                link.style.setProperty("--nav-progress", "1");
                if (index === navLinks.length - 1) link.classList.add("active");
                else link.classList.remove("active");
                return;
            }

            // 2. 홈(Home) 영역 상단 예외 처리
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

            // 3. 일반 개별 섹션 진입 연산
            const rect = section.getBoundingClientRect();
            const sectionAbsoluteTop = rect.top + scrollTop;
            const sectionHeight = rect.height;

            // 순차적 단일 채우기: 현재 뷰포트에 걸쳐있는 정확한 해당 섹션 영역만 연산
            if (scrollTop + viewportHeight > sectionAbsoluteTop && scrollTop < sectionAbsoluteTop + sectionHeight) {
                const sectionScrollCurrent = (scrollTop + viewportHeight) - sectionAbsoluteTop;
                const sectionScrollTotal = sectionHeight + viewportHeight;
                const progress = Math.min(Math.max(sectionScrollCurrent / sectionScrollTotal, 0), 1);
                
                link.style.setProperty("--nav-progress", progress);
            } else if (scrollTop >= sectionAbsoluteTop + sectionHeight) {
                // 이미 지나간 섹션은 100% 유지
                link.style.setProperty("--nav-progress", "1");
            } else {
                // 아직 도달하지 않은 다음 섹션들은 철저히 0% 고정
                link.style.setProperty("--nav-progress", "0");
            }

            // 텍스트 활성화 라이트 켜기 (화면 중간 지점 기준 감지)
            if (rect.top <= viewportHeight * 0.5 && rect.bottom >= viewportHeight * 0.5) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    }

    window.addEventListener("scroll", handleScrollProgress);
    handleScrollProgress(); // 최초 진입 시점 강제 실행
});
