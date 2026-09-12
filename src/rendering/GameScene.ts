import * as THREE from 'three';
import { APP_CONFIG } from '../core/config';

export class GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  readonly paddle: THREE.Mesh;
  readonly ball: THREE.Mesh;
  readonly bricks: THREE.Mesh[] = [];

  constructor(private readonly container: HTMLElement) {
    this.scene.background = new THREE.Color(APP_CONFIG.background);
    this.scene.fog = new THREE.Fog(0xeafcff, 18, 36);

    this.camera.position.set(0, 11, 16);
    this.camera.lookAt(0, 0, -2);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, APP_CONFIG.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.append(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9db9cf, 2.7));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-4, 10, 8);
    key.castShadow = true;
    this.scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 22),
      new THREE.MeshPhysicalMaterial({ color: 0xd9f3fb, roughness: 0.28, metalness: 0.02, clearcoat: 0.7 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const colors = [0xff7f9a, 0xffc65c, 0x6eddb9, 0x6cc8ff];
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const brick = new THREE.Mesh(
          new THREE.BoxGeometry(1.65, 0.55, 0.7),
          new THREE.MeshPhysicalMaterial({
            color: colors[row],
            roughness: 0.18,
            metalness: 0.04,
            clearcoat: 0.75,
            clearcoatRoughness: 0.16,
          }),
        );
        brick.position.set((column - 3) * 1.9, 0.45, -6.7 + row * 0.9);
        brick.castShadow = true;
        this.scene.add(brick);
        this.bricks.push(brick);
      }
    }

    this.paddle = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.5, 0.85),
      new THREE.MeshPhysicalMaterial({
        color: 0x8d7cff,
        emissive: 0x4b35d5,
        emissiveIntensity: 0.32,
        roughness: 0.12,
        clearcoat: 1,
      }),
    );
    this.paddle.position.set(0, 0.45, 7.2);
    this.paddle.castShadow = true;
    this.scene.add(this.paddle);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 32, 18),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0x45caff,
        emissiveIntensity: 0.9,
        roughness: 0.08,
        metalness: 0.02,
        clearcoat: 1,
      }),
    );
    this.ball.position.set(-1.2, 0.55, 3.8);
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    this.resize();
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.container;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
