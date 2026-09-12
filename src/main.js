import * as THREE from 'three';
import './style.css';

const container = document.querySelector('#game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b18);
scene.fog = new THREE.Fog(0x070b18, 14, 30);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 10, 15);
camera.lookAt(0, 0, -2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
container.append(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x7dd3fc, 0x111827, 2.5));
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(-4, 10, 8);
light.castShadow = true;
scene.add(light);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 22),
  new THREE.MeshStandardMaterial({ color: 0x101936, roughness: 0.55, metalness: 0.2 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const colors = [0xfb7185, 0xfbbf24, 0x34d399, 0x38bdf8];
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 7; column += 1) {
    const brick = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.55, 0.7),
      new THREE.MeshStandardMaterial({ color: colors[row], roughness: 0.25, metalness: 0.15 }),
    );
    brick.position.set((column - 3) * 1.9, 0.45, -6.7 + row * 0.9);
    brick.castShadow = true;
    scene.add(brick);
  }
}

const paddle = new THREE.Mesh(
  new THREE.BoxGeometry(3.2, 0.5, 0.85),
  new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0x2e1065 }),
);
paddle.position.set(0, 0.45, 7.2);
paddle.castShadow = true;
scene.add(paddle);

const ball = new THREE.Mesh(
  new THREE.SphereGeometry(0.38, 32, 16),
  new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x38bdf8, emissiveIntensity: 0.8 }),
);
ball.position.set(-1.2, 0.55, 3.8);
ball.castShadow = true;
scene.add(ball);

function resize() {
  const { clientWidth, clientHeight } = container;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
window.addEventListener('pointermove', ({ clientX }) => {
  paddle.position.x = THREE.MathUtils.clamp((clientX / window.innerWidth - 0.5) * 14, -6, 6);
});
window.addEventListener('keydown', ({ key }) => {
  if (key === 'ArrowLeft') paddle.position.x = Math.max(-6, paddle.position.x - 0.6);
  if (key === 'ArrowRight') paddle.position.x = Math.min(6, paddle.position.x + 0.6);
});

const clock = new THREE.Clock();
function animate() {
  const time = clock.getElapsedTime();
  ball.position.y = 0.65 + Math.abs(Math.sin(time * 2.2)) * 0.8;
  ball.rotation.x = time * 2;
  renderer.render(scene, camera);
}

resize();
renderer.setAnimationLoop(animate);
