// 1. 전역 변수로 선언되어 있는지 확인하거나, 함수 내부에서 올바르게 호출해야 합니다.
const landingCanvasCanvas = document.getElementById('landingCanvasCanvas');

// 2. 만약 HTML id가 'landingCanvas'라면 아래와 같이 매칭해줍니다.
// const landingCanvasCanvas = document.getElementById('landingCanvas');

function resize() {
    // 이제 landingCanvasCanvas를 정상적으로 참조할 수 있으므로 에러가 사라집니다.
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 카메라 에스펙트 비율 및 렌더러 크기 업데이트 코드...
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}
