import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const landingDisplay = document.querySelector('#landing-display');
const modelCanvas    = document.querySelector('#model-canvas');   
const crystalFallback = document.querySelector('#crystal-fallback');

const pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, tx: window.innerWidth * 0.5, ty: window.innerHeight * 0.5 };
const rotationState = { currentX: 0, currentY: 0, targetX: 0.3, targetY: 0.5, isDragging: false, previousMouseX: 0, previousMouseY: 0 };
let modelAutoRotY = 0; 

let threeRenderer = null, threeScene = null, threeCamera = null, modelAnchor = null, animFrameId = null;

const initThree = () => {
  if (!modelCanvas) return;
  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  
  threeRenderer = new THREE.WebGLRenderer({ canvas: modelCanvas, alpha: true, antialias: true });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
  threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(26, shell.offsetWidth / shell.offsetHeight, 0.1, 100);
  threeCamera.position.set(0, 0, 4.6); 

  // 광택용 라이팅 조절
  threeScene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const mainLight = new THREE.DirectionalLight(0xffffff, 3.5);
  mainLight.position.set(5, 5, 4);
  threeScene.add(mainLight);

  const loader = new GLTFLoader();
  const draco  = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load('./modeling.glb', (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const centre = new THREE.Vector3(), size = new THREE.Vector3();
    box.getCenter(centre); box.getSize(size);
    
    const scale = 1.9 / (Math.max(size.x, size.y, size.z) || 1); 
    model.position.sub(centre.multiplyScalar(scale));
    model.scale.setScalar(scale);
    model.rotation.set(Math.PI / 2.3, 0, 0); 

    model.traverse((child) => {
      if (!child.isMesh) return;
      if (child.material.map) child.material.map = null; // 지직거리는 불투명 파스텔 맵 삭제
      
      // 영롱하게 빛나는 크리스탈 투명 질감 주입
      child.material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0.0, roughness: 0.0,
        transparent: true, transmission: 0.95, ior: 2.2, thickness: 0.4,
        opacity: 1.0, side: THREE.DoubleSide, depthWrite: true         
      });
    });

    modelAnchor = new THREE.Group();
    modelAnchor.add(model);
    threeScene.add(modelAnchor);
    if (crystalFallback) crystalFallback.style.display = 'none';
  });
};

const animate = () => {
  animFrameId = requestAnimationFrame(animate);
  if (modelAnchor) {
    if (!rotationState.isDragging) {
      modelAutoRotY += 0.002;
      rotationState.targetY += 0.002;
    }
    rotationState.currentX += (rotationState.targetX - rotationState.currentX) * 0.08;
    rotationState.currentY += (rotationState.targetY - rotationState.currentY) * 0.08;
    modelAnchor.rotation.x = rotationState.currentX;
    modelAnchor.rotation.y = rotationState.currentY;
  }
  if (threeRenderer && threeScene && threeCamera) threeRenderer.render(threeScene, threeCamera);
};

// 💡 마우스 호버 및 드래그 멈춤 현상 완벽 방지 (Window 단위 트래킹)
window.addEventListener('pointerdown', (e) => {
  const rect = modelCanvas.getBoundingClientRect();
  if(e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
    rotationState.isDragging = true;
    rotationState.previousMouseX = e.clientX;
    rotationState.previousMouseY = e.clientY;
  }
});
window.addEventListener('pointermove', (e) => {
  if (!rotationState.isDragging || !modelAnchor) return;
  rotationState.targetY += (e.clientX - rotationState.previousMouseX) * 0.006;
  rotationState.targetX += (e.clientY - rotationState.previousMouseY) * 0.006;
  rotationState.previousMouseX = e.clientX; rotationState.previousMouseY = e.clientY;
});
window.addEventListener('pointerup', () => { rotationState.isDragging = false; });

document.addEventListener('DOMContentLoaded', () => { initThree(); animate(); });
window.addEventListener('resize', () => {
  if (!threeRenderer || !threeCamera) return;
  const shell = landingDisplay || { offsetWidth: window.innerWidth, offsetHeight: window.innerHeight };
  threeRenderer.setSize(shell.offsetWidth, shell.offsetHeight);
  threeCamera.aspect = shell.offsetWidth / shell.offsetHeight; threeCamera.updateProjectionMatrix();
});
