const initThree = () => {
  if (!modelCanvas) return;

  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (threeRenderer) {
    threeRenderer.dispose();
    threeRenderer = null;
  }

  if (codexFakeModel) {
    codexFakeModel.style.display = 'none';
    codexFakeModel.style.opacity = '0';
  }

  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  const W = shell.offsetWidth;
  const H = shell.offsetHeight;

  threeRenderer = new THREE.WebGLRenderer({
    canvas:      modelCanvas,
    alpha:       true,
    antialias:   true, // 매끄러운 외곽선 유지
    powerPreference: 'high-performance',
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(W, H);
  
  // ✨ [노이즈 전면 차단] 색상 뭉개짐과 빛 반사 노이즈(화이트 스팟)를 물리적으로 제어
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  threeRenderer.toneMapping      = THREE.ACESFilmicToneMapping; // 대비와 프리즘 색 표현력 극대화
  threeRenderer.toneMappingExposure = 1.6; 

  threeScene = new THREE.Scene();

  threeCamera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
  threeCamera.position.set(0, 0, 4.4); 

  /* ════════════════════════════════════════
      ✨ 영롱한 다채색 반사를 위한 광원 셋업
     ════════════════════════════════════════ */
  const ambient = new THREE.AmbientLight(0xffffff, 0.6); // 전체적인 투명도 확보용 기본광
  threeScene.add(ambient);

  // 물방울 같은 깨끗한 하이라이트를 만들어줄 주 광원
  const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
  mainLight.position.set(2, 4, 4);
  threeScene.add(mainLight);

  // 여러 빛깔로 반짝이도록 유색 스폿 조명 배치 (사이언, 마젠타, 골드)
  const laserCyan = new THREE.SpotLight(0x00f6ff, 18.0, 20, Math.PI / 3, 0.6, 1);
  laserCyan.position.set(5, 6, 2);
  threeScene.add(laserCyan);

  const laserMagenta = new THREE.SpotLight(0xff00bb, 22.0, 20, Math.PI / 3, 0.6, 1);
  laserMagenta.position.set(-6, -3, 3);
  threeScene.add(laserMagenta);

  const laserGold = new THREE.SpotLight(0xffaa00, 15.0, 15, Math.PI / 4, 0.5, 1);
  laserGold.position.set(0, 5, -3);
  threeScene.add(laserGold);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    './modeling.glb',
    (gltf) => {
      const model = gltf.scene;
      
      while(threeScene.children.length > 6) { 
        threeScene.remove(threeScene.children[threeScene.children.length - 1]);
      }

      const box    = new THREE.Box3().setFromObject(model);
      const centre = new THREE.Vector3();
      box.getCenter(centre);
      const size   = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale   = 1.95 / maxDim; 
      
      model.position.sub(centre.multiplyScalar(scale));
      model.scale.setScalar(scale);
      
      model.rotation.set(Math.PI / 2.3, 0, 0); 

      model.traverse((child) => {
        if (!child.isMesh) return;
        if (child.material.map) child.material.map = null;
        
        /* ════════════════════════════════════════
            ✨ 물방울 투명 프리즘 글래스 재질 세팅
           ════════════════════════════════════════ */
        child.material = new THREE.MeshPhysicalMaterial({
          color:              0xffffff,   // 맑고 깨끗한 백색 베이스
          metalness:          0.0,        // 금속 느낌 전면 제거 (순수 유리/물방울 질감)
          roughness:          0.0,        // 표면 거칠기 0 (완벽하게 매끄러운 투명도)
          
          transmission:       0.98,       // 98% 빛 투과 (물방울처럼 맑게 내부가 비침)
          ior:                1.482,      // 순수 유리 및 물방울의 리얼한 굴절률 (기존 2.42의 과한 굴절 수정)
          thickness:          1.2,        // 내부 굴절 깊이감 부여
          
          clearcoat:          1.0,        // 표면 코팅막 100% (겉면에 전등 불빛이 아주 쨍하게 맺힘)
          clearcoatRoughness: 0.0,        // 코팅막 거칠기 0
          
          // 여러 빛깔 프리즘 광학 분산 (너무 높으면 자글자글해지므로 영롱하게 분산되는 최적값 세팅)
          dispersion:         5.5,        
          
          opacity:            1.0,
          transparent:        true,
          side:               THREE.DoubleSide, // 매쉬 내부 뒷면까지 굴절광이 맺히도록 투명 렌더링
        });
      });

      modelAnchor = new THREE.Group();
      modelAnchor.add(model);
      threeScene.add(modelAnchor);
      
      if (crystalFallback) crystalFallback.style.display = 'none';

      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) {
        setTimeout(() => {
          siteLoader.classList.add('is-loaded');
        }, 300);
      }
    },
    undefined,
    (err) => {
      console.warn("GLB 로드 에러", err);
      const siteLoader = document.querySelector('#site-loader');
      if (siteLoader) siteLoader.classList.add('is-loaded');
    }
  );
};
