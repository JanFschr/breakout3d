import * as THREE from 'three';
import { APP_CONFIG } from '../core/config';
import type { BreakoutState } from '../gameplay/contracts';

const BLOCK_COLORS = [0xff7f9a, 0xffc65c, 0x6eddb9, 0x6cc8ff];

export class GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  readonly paddle: THREE.Mesh;
  readonly ball: THREE.Mesh;
  private readonly brickMeshes = new Map<string, THREE.Mesh>();
  private readonly debugGroup = new THREE.Group();

  constructor(private readonly container: HTMLElement, state: BreakoutState) {
    this.scene.background = new THREE.Color(APP_CONFIG.background);
    this.scene.fog = new THREE.Fog(0xeafcff, 20, 38);

    const { fieldHeight, fieldWidth } = APP_CONFIG.gameplay;
    this.camera.position.set(0, 15.8, 20.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, APP_CONFIG.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.append(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa8c7d9, 2.7));
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(-4, 13, 9);
    key.castShadow = true;
    this.scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(fieldWidth + 1.2, fieldHeight + 1.2),
      new THREE.MeshPhysicalMaterial({ color: 0xd9f3fb, roughness: 0.28, metalness: 0.02, clearcoat: 0.7 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -fieldHeight / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.paddle = new THREE.Mesh(
      new THREE.BoxGeometry(state.paddle.width, 0.48, state.paddle.height),
      new THREE.MeshPhysicalMaterial({
        color: 0x8d7cff,
        emissive: 0x4b35d5,
        emissiveIntensity: 0.34,
        roughness: 0.12,
        clearcoat: 1,
      }),
    );
    this.paddle.castShadow = true;
    this.scene.add(this.paddle);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(state.ball.radius, 32, 18),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0x45caff,
        emissiveIntensity: 0.95,
        roughness: 0.08,
        clearcoat: 1,
      }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    state.blocks.forEach((block, index) => {
      const brick = new THREE.Mesh(
        new THREE.BoxGeometry(block.width, 0.5, block.height),
        new THREE.MeshPhysicalMaterial({
          color: BLOCK_COLORS[Math.floor(index / 7) % BLOCK_COLORS.length],
          roughness: 0.18,
          metalness: 0.04,
          clearcoat: 0.75,
          clearcoatRoughness: 0.16,
        }),
      );
      brick.castShadow = true;
      this.scene.add(brick);
      this.brickMeshes.set(block.id, brick);
    });

    this.scene.add(this.debugGroup);
    this.resize();
    this.sync(state, 0);
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.container;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  sync(state: BreakoutState, alpha: number): void {
    const fieldHeight = APP_CONFIG.gameplay.fieldHeight;
    const ballX = lerp(state.ball.previousPosition.x, state.ball.position.x, alpha);
    const ballY = lerp(state.ball.previousPosition.y, state.ball.position.y, alpha);
    const paddleX = lerp(state.paddle.previousX, state.paddle.x, alpha);

    this.ball.position.set(ballX, 0.62, gameplayYToZ(ballY, fieldHeight));
    this.paddle.position.set(paddleX, 0.42, gameplayYToZ(state.paddle.y, fieldHeight));
    this.paddle.rotation.z = THREE.MathUtils.clamp(-state.paddle.velocityX * 0.012, -0.12, 0.12);

    for (const block of state.blocks) {
      const mesh = this.brickMeshes.get(block.id);
      if (!mesh) continue;
      mesh.visible = !block.destroyed;
      mesh.position.set(block.position.x, 0.4, gameplayYToZ(block.position.y, fieldHeight));
    }
  }

  setDebugCollisionVisible(visible: boolean, state: BreakoutState): void {
    this.debugGroup.clear();
    if (!visible) return;

    const material = new THREE.LineBasicMaterial({ color: 0x164e63 });
    const addRect = (x: number, y: number, width: number, height: number): void => {
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, -height / 2);
      shape.lineTo(width / 2, -height / 2);
      shape.lineTo(width / 2, height / 2);
      shape.lineTo(-width / 2, height / 2);
      shape.closePath();
      const points = shape.getPoints();
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x, 0, point.y)));
      const line = new THREE.LineLoop(geometry, material);
      line.position.set(x, 0.68, gameplayYToZ(y, APP_CONFIG.gameplay.fieldHeight));
      this.debugGroup.add(line);
    };

    addRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height);
    for (const block of state.blocks) if (!block.destroyed) addRect(block.position.x, block.position.y, block.width, block.height);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

function gameplayYToZ(y: number, fieldHeight: number): number {
  return fieldHeight / 2 - y;
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}
