import * as THREE from 'three';
import { APP_CONFIG } from '../core/config';
import type { SpatialPresentationState } from '../gameplay/SpatialRuntime';
import type { BlockState, BreakoutState } from '../gameplay/contracts';
import { FACE_GRAPH, FACE_IDS, localToBody, type FaceBasis, type FaceEdge, type FaceId, type Vec3Like } from '../world/FaceGraph';

const FACE_SIZE = 14;
const Y_SCALE = FACE_SIZE / APP_CONFIG.gameplay.fieldHeight;

export class GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  readonly paddle: THREE.Mesh;
  readonly ball: THREE.Mesh;
  private readonly bodyRoot = new THREE.Group();
  private readonly blockMeshes = new Map<string, THREE.Mesh>();
  private readonly debugGroup = new THREE.Group();
  private readonly edgeGeometry = new THREE.BufferGeometry();
  private readonly edgeMaterial = new THREE.LineBasicMaterial({ color: 0x42d7ff, transparent: true, opacity: 0 });
  private readonly edgeLine = new THREE.Line(this.edgeGeometry, this.edgeMaterial);
  private activeFace: FaceId = 'front';
  private inspectYaw = 0;
  private inspectPitch = 0;

  constructor(private readonly container: HTMLElement, state: BreakoutState) {
    this.scene.background = new THREE.Color(APP_CONFIG.background);
    this.scene.fog = new THREE.Fog(0xeafcff, 27, 52);
    this.camera.position.set(0, 0.7, 26);
    this.camera.lookAt(0, 0, 0);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, APP_CONFIG.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.append(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa8c7d9, 3));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(-8, 12, 18);
    key.castShadow = true;
    this.scene.add(key);

    this.scene.add(this.bodyRoot);
    this.buildCubeShell();

    this.paddle = new THREE.Mesh(
      new THREE.BoxGeometry(state.paddle.width, 0.48, state.paddle.height * Y_SCALE),
      new THREE.MeshPhysicalMaterial({ color: 0x8d7cff, emissive: 0x4b35d5, emissiveIntensity: 0.4, roughness: 0.1, clearcoat: 1 }),
    );
    this.paddle.castShadow = true;
    this.bodyRoot.add(this.paddle);

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(state.ball.radius, 32, 18),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0x45caff, emissiveIntensity: 1, roughness: 0.06, clearcoat: 1 }),
    );
    this.ball.castShadow = true;
    this.bodyRoot.add(this.ball);

    for (const faceId of FACE_IDS) {
      for (const block of state.faces[faceId].blocks) this.createBlockMesh(block);
    }

    this.bodyRoot.add(this.edgeLine);
    this.bodyRoot.add(this.debugGroup);
    this.setBodyFaceOrientation(state.activeFace);
    this.resize();
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.container;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  sync(state: BreakoutState, alpha: number, spatial: SpatialPresentationState): void {
    this.activeFace = spatial.activeFace;
    const activeBasis = FACE_GRAPH[spatial.activeFace];
    const ballX = lerp(state.ball.previousPosition.x, state.ball.position.x, alpha);
    const ballY = lerp(state.ball.previousPosition.y, state.ball.position.y, alpha);
    const paddleX = lerp(state.paddle.previousX, state.paddle.x, alpha);

    if (spatial.phase !== 'EDGE_RIDE') setBodyPosition(this.ball, localToBody(spatial.activeFace, ballX, centeredY(ballY), 0.42));
    setBodyPosition(this.paddle, localToBody(spatial.activeFace, paddleX, centeredY(state.paddle.y), 0.24));
    this.paddle.quaternion.copy(meshQuaternionForFace(activeBasis));
    this.paddle.rotateZ(THREE.MathUtils.clamp(-state.paddle.velocityX * 0.012, -0.11, 0.11));

    for (const faceId of FACE_IDS) {
      for (const block of state.faces[faceId].blocks) {
        const mesh = this.blockMeshes.get(block.id);
        if (!mesh) continue;
        mesh.visible = !block.destroyed;
        setBodyPosition(mesh, localToBody(faceId, block.position.x, centeredY(block.position.y), 0.23));
        mesh.quaternion.copy(meshQuaternionForFace(FACE_GRAPH[faceId]));
        updateBlockMaterial(mesh, block, faceId === spatial.activeFace);
      }
    }

    if (spatial.phase === 'EDGE_RIDE' && spatial.ride) {
      const progress = smoothstep(spatial.ride.progress);
      setBodyPosition(this.ball, bezierRide(spatial.ride.sourceBodyPoint, spatial.ride.destinationBodyPoint, progress));
      this.bodyRoot.quaternion.copy(faceQuaternion(spatial.ride.sourceFace)).slerp(faceQuaternion(spatial.ride.destinationFace), progress);
    } else if (spatial.phase === 'INSPECT') {
      const target = faceQuaternion(spatial.activeFace);
      const inspect = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.inspectPitch, this.inspectYaw, 0, 'YXZ'));
      this.bodyRoot.quaternion.copy(inspect.multiply(target));
    } else {
      this.setBodyFaceOrientation(spatial.activeFace);
    }

    this.updateEdgeWindow(spatial.edgeWindow, spatial.edgeWindowProgress);
  }

  applyInspectDrag(deltaX: number, deltaY: number): void {
    this.inspectYaw += deltaX * 0.006;
    this.inspectPitch = THREE.MathUtils.clamp(this.inspectPitch + deltaY * 0.006, -1.1, 1.1);
  }

  resetInspect(): void {
    this.inspectYaw = 0;
    this.inspectPitch = 0;
  }

  setDebugCollisionVisible(visible: boolean, state: BreakoutState): void {
    this.debugGroup.clear();
    if (!visible) return;
    const material = new THREE.LineBasicMaterial({ color: 0x164e63 });
    const basis = FACE_GRAPH[this.activeFace];
    const addRect = (x: number, y: number, width: number, height: number): void => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-width / 2, 0, -height * Y_SCALE / 2),
        new THREE.Vector3(width / 2, 0, -height * Y_SCALE / 2),
        new THREE.Vector3(width / 2, 0, height * Y_SCALE / 2),
        new THREE.Vector3(-width / 2, 0, height * Y_SCALE / 2),
      ]);
      const line = new THREE.LineLoop(geometry, material);
      setBodyPosition(line, localToBody(this.activeFace, x, centeredY(y), 0.5));
      line.quaternion.copy(meshQuaternionForFace(basis));
      this.debugGroup.add(line);
    };
    addRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height);
    for (const block of state.blocks) if (!block.destroyed) addRect(block.position.x, block.position.y, block.width, block.height);
  }

  render(): void { this.renderer.render(this.scene, this.camera); }

  private createBlockMesh(block: BlockState): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(block.width, blockThickness(block), block.height * Y_SCALE),
      new THREE.MeshPhysicalMaterial({ color: blockColor(block), roughness: 0.14, clearcoat: 0.85, transparent: true, opacity: 1 }),
    );
    mesh.castShadow = true;
    this.bodyRoot.add(mesh);
    this.blockMeshes.set(block.id, mesh);
  }

  private buildCubeShell(): void {
    for (const faceId of FACE_IDS) {
      const basis = FACE_GRAPH[faceId];
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE),
        new THREE.MeshPhysicalMaterial({ color: faceId === 'front' ? 0xd9f6ff : 0xe8f9ff, transparent: true, opacity: 0.34, roughness: 0.24, clearcoat: 0.8, side: THREE.DoubleSide }),
      );
      setBodyPosition(panel, basis.origin);
      panel.quaternion.copy(panelQuaternionForFace(basis));
      this.bodyRoot.add(panel);
    }
    this.bodyRoot.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(FACE_SIZE, FACE_SIZE, FACE_SIZE)),
      new THREE.LineBasicMaterial({ color: 0x9fcfe0, transparent: true, opacity: 0.55 }),
    ));
  }

  private setBodyFaceOrientation(faceId: FaceId): void { this.bodyRoot.quaternion.copy(faceQuaternion(faceId)); }

  private updateEdgeWindow(edge: FaceEdge | null, progress: number): void {
    if (!edge) { this.edgeMaterial.opacity = 0; return; }
    const half = FACE_SIZE / 2;
    this.edgeGeometry.setFromPoints(edgePoints(edge, half).map(([u, v]) => vec3(localToBody(this.activeFace, u, v, 0.52))));
    this.edgeMaterial.opacity = 0.48 + Math.sin(progress * Math.PI * 5) * 0.32;
  }
}

function updateBlockMaterial(mesh: THREE.Mesh, block: BlockState, active: boolean): void {
  const material = mesh.material as THREE.MeshPhysicalMaterial;
  material.color.setHex(blockColor(block));
  material.opacity = active ? 1 : 0.28;
  material.emissive.setHex(blockEmissive(block));
  material.emissiveIntensity = active ? blockEmissiveIntensity(block) : blockEmissiveIntensity(block) * 0.35;
}

function blockColor(block: BlockState): number {
  if (block.type === 'armor') return block.armorMode === 'weakened' ? 0xffb45f : 0x8f83d8;
  if (block.type === 'anchor') return 0x55dbef;
  if (block.type === 'generator') return 0xff78cf;
  if (block.type === 'chain') return 0xffda6a;
  if (block.type === 'core') return block.exposed ? 0xfff1a8 : 0xa9b6c5;
  return 0x78d9c4;
}
function blockEmissive(block: BlockState): number {
  if (block.type === 'generator') return 0xff2ea5;
  if (block.type === 'anchor') return 0x20b8de;
  if (block.type === 'chain') return 0xf4a900;
  if (block.type === 'core') return block.exposed ? 0xffc928 : 0x334155;
  if (block.type === 'armor' && block.armorMode === 'weakened') return 0xff7b32;
  return 0x000000;
}
function blockEmissiveIntensity(block: BlockState): number {
  return block.type === 'normal' || block.type === 'armor' && block.armorMode === 'protected' ? 0 : 0.55;
}
function blockThickness(block: BlockState): number { return block.type === 'core' ? 0.9 : block.type === 'generator' ? 0.7 : 0.46; }
function centeredY(gameplayY: number): number { return (gameplayY - APP_CONFIG.gameplay.fieldHeight / 2) * Y_SCALE; }
function setBodyPosition(object: THREE.Object3D, value: Vec3Like): void { object.position.set(value.x, value.y, value.z); }
function vec3(value: Vec3Like): THREE.Vector3 { return new THREE.Vector3(value.x, value.y, value.z); }
function panelQuaternionForFace(basis: FaceBasis): THREE.Quaternion { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec3(basis.u), vec3(basis.v), vec3(basis.normal))); }
function meshQuaternionForFace(basis: FaceBasis): THREE.Quaternion {
  const negativeV = new THREE.Vector3(-basis.v.x, -basis.v.y, -basis.v.z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec3(basis.u), vec3(basis.normal), negativeV));
}
function faceQuaternion(faceId: FaceId): THREE.Quaternion {
  const basis = FACE_GRAPH[faceId];
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec3(basis.u), vec3(basis.v), vec3(basis.normal))).invert();
}
function edgePoints(edge: FaceEdge, half: number): [[number, number], [number, number]] {
  if (edge === 'left') return [[-half, -half], [-half, half]];
  if (edge === 'right') return [[half, -half], [half, half]];
  if (edge === 'top') return [[-half, half], [half, half]];
  return [[-half, -half], [half, -half]];
}
function bezierRide(start: Vec3Like, end: Vec3Like, t: number): Vec3Like {
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 };
  const radial = new THREE.Vector3(mid.x, mid.y, mid.z).normalize().multiplyScalar(1.7);
  const control = { x: mid.x + radial.x, y: mid.y + radial.y, z: mid.z + radial.z };
  const inv = 1 - t;
  return { x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x, y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y, z: inv * inv * start.z + 2 * inv * t * control.z + t * t * end.z };
}
function lerp(a: number, b: number, alpha: number): number { return a + (b - a) * alpha; }
function smoothstep(value: number): number { return value * value * (3 - 2 * value); }
