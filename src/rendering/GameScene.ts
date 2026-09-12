import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { APP_CONFIG } from '../core/config';
import type { SpatialPresentationState } from '../gameplay/SpatialRuntime';
import type { BlockState, BreakoutState } from '../gameplay/contracts';
import { FACE_GRAPH, FACE_IDS, localToBody, type FaceBasis, type FaceEdge, type FaceId, type Vec3Like } from '../world/FaceGraph';
import { BallTrail } from '../vfx/BallTrail';
import { createHeroBallMaterial, type HeroBallUniforms } from '../vfx/HeroBallMaterial';
import type { JuiceSnapshot } from '../vfx/JuiceDirector';

const FACE_SIZE = 14;
const Y_SCALE = FACE_SIZE / APP_CONFIG.gameplay.fieldHeight;
const BASE_BACKGROUND = new THREE.Color(0xeafcff);
const PEAK_BACKGROUND = new THREE.Color(0xffeefb);

export class GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  readonly paddle: THREE.Mesh;
  readonly ball: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly bodyRoot = new THREE.Group();
  private readonly blockMeshes = new Map<string, THREE.Mesh<THREE.BoxGeometry, THREE.MeshPhysicalMaterial>>();
  private readonly debugGroup = new THREE.Group();
  private readonly edgeGeometry = new THREE.BufferGeometry();
  private readonly edgeMaterial = new THREE.LineBasicMaterial({ color: 0x42d7ff, transparent: true, opacity: 0 });
  private readonly edgeLine = new THREE.Line(this.edgeGeometry, this.edgeMaterial);
  private readonly ballUniforms: HeroBallUniforms;
  private readonly ballTrail = new BallTrail();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly backgroundColor = new THREE.Color();
  private activeFace: FaceId = 'front';
  private inspectYaw = 0;
  private inspectPitch = 0;
  private visualTime = 0;

  constructor(private readonly container: HTMLElement, state: BreakoutState) {
    this.scene.background = this.backgroundColor.copy(BASE_BACKGROUND);
    this.scene.fog = new THREE.Fog(0xeafcff, 27, 52);
    this.camera.position.set(0, 0.7, 26);
    this.camera.lookAt(0, 0, 0);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, APP_CONFIG.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.append(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.46, 0.8);
    this.composer.addPass(this.bloomPass);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa8c7d9, 3));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(-8, 12, 18);
    key.castShadow = true;
    this.scene.add(key);

    this.scene.add(this.bodyRoot);
    this.buildCubeShell();

    this.paddle = new THREE.Mesh(
      new THREE.BoxGeometry(state.paddle.width, 0.48, state.paddle.height * Y_SCALE),
      new THREE.MeshPhysicalMaterial({
        color: 0x9d92ff,
        emissive: 0x5945f1,
        emissiveIntensity: 0.46,
        roughness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        transmission: 0.08,
        thickness: 0.35,
      }),
    );
    this.paddle.castShadow = true;
    this.bodyRoot.add(this.paddle);

    const heroBall = createHeroBallMaterial();
    this.ballUniforms = heroBall.uniforms;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(state.ball.radius, 48, 32), heroBall.material);
    this.ball.castShadow = false;
    this.ball.renderOrder = 5;
    this.bodyRoot.add(this.ballTrail.object);
    this.bodyRoot.add(this.ball);

    for (const faceId of FACE_IDS) {
      for (const block of state.faces[faceId].blocks) this.createBlockMesh(block);
    }

    this.bodyRoot.add(this.edgeLine);
    this.bodyRoot.add(this.debugGroup);
    this.setBodyFaceOrientation(state.activeFace);
    this.resize();
  }

  getBodyRoot(): THREE.Group { return this.bodyRoot; }

  getBlockBodyPosition(blockId: string): THREE.Vector3 | null {
    const mesh = this.blockMeshes.get(blockId);
    return mesh ? mesh.position.clone() : null;
  }

  resize(): void {
    const { clientWidth, clientHeight } = this.container;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.composer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  sync(
    state: BreakoutState,
    alpha: number,
    spatial: SpatialPresentationState,
    juice: JuiceSnapshot,
    frameDeltaSeconds: number,
  ): void {
    this.visualTime += Math.min(frameDeltaSeconds, 0.05);
    this.activeFace = spatial.activeFace;
    const activeBasis = FACE_GRAPH[spatial.activeFace];
    const ballX = lerp(state.ball.previousPosition.x, state.ball.position.x, alpha);
    const ballY = lerp(state.ball.previousPosition.y, state.ball.position.y, alpha);
    const paddleX = lerp(state.paddle.previousX, state.paddle.x, alpha);

    this.backgroundColor.lerpColors(BASE_BACKGROUND, PEAK_BACKGROUND, juice.intensity * 0.42 + juice.eventPulse * 0.18);
    this.bloomPass.strength = THREE.MathUtils.lerp(0.2, 1.05, juice.glow);
    this.bloomPass.radius = THREE.MathUtils.lerp(0.28, 0.58, juice.intensity);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.02, 1.16, juice.intensity);

    this.ballUniforms.time.value = this.visualTime;
    this.ballUniforms.energy.value = juice.intensity;
    this.ballUniforms.impact.value = juice.eventPulse;
    this.ballUniforms.direction.value.set(state.ball.velocity.x, 0, -state.ball.velocity.y * Y_SCALE).normalize();

    if (spatial.phase !== 'EDGE_RIDE') setBodyPosition(this.ball, localToBody(spatial.activeFace, ballX, centeredY(ballY), 0.42));
    setBodyPosition(this.paddle, localToBody(spatial.activeFace, paddleX, centeredY(state.paddle.y), 0.24));
    this.paddle.quaternion.copy(meshQuaternionForFace(activeBasis));
    this.paddle.rotateZ(THREE.MathUtils.clamp(-state.paddle.velocityX * 0.012, -0.11, 0.11));
    (this.paddle.material as THREE.MeshPhysicalMaterial).emissiveIntensity = THREE.MathUtils.lerp(0.35, 1.1, juice.glow);

    for (const faceId of FACE_IDS) {
      for (const block of state.faces[faceId].blocks) {
        const mesh = this.blockMeshes.get(block.id);
        if (!mesh) continue;
        mesh.scale.setScalar(1);
        mesh.visible = !block.destroyed && spatial.phase !== 'RESULTS';
        setBodyPosition(mesh, localToBody(faceId, block.position.x, centeredY(block.position.y), 0.23));
        mesh.quaternion.copy(meshQuaternionForFace(FACE_GRAPH[faceId]));
        updateBlockMaterial(mesh, block, faceId === spatial.activeFace, juice);
      }
    }

    this.ball.visible = spatial.phase !== 'RESULTS' && (spatial.phase !== 'CORE_KILL' || spatial.coreKillProgress < 0.34);
    this.paddle.visible = spatial.phase !== 'CORE_KILL' && spatial.phase !== 'RESULTS';

    if (spatial.phase === 'EDGE_RIDE' && spatial.ride) {
      const progress = smoothstep(spatial.ride.progress);
      setBodyPosition(this.ball, bezierRide(spatial.ride.sourceBodyPoint, spatial.ride.destinationBodyPoint, progress));
      this.bodyRoot.quaternion.copy(faceQuaternion(spatial.ride.sourceFace)).slerp(faceQuaternion(spatial.ride.destinationFace), progress);
    } else if (spatial.phase === 'INSPECT') {
      const target = faceQuaternion(spatial.activeFace);
      const inspect = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.inspectPitch, this.inspectYaw, 0, 'YXZ'));
      this.bodyRoot.quaternion.copy(inspect.multiply(target));
    } else if (spatial.phase === 'CORE_KILL') {
      this.applyCoreKill(spatial.coreKillProgress, state);
    } else if (spatial.phase === 'RESULTS') {
      this.applyResultsPose();
    } else {
      this.setBodyFaceOrientation(spatial.activeFace);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, 26, 0.16);
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, 0, 0.16);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 0.7, 0.16);
      this.camera.lookAt(0, 0, 0);
    }

    if (this.ball.visible) this.ballTrail.push(this.ball.position, juice.trail);
    this.updateEdgeWindow(spatial.edgeWindow, spatial.edgeWindowProgress, juice);
  }

  applyInspectDrag(deltaX: number, deltaY: number): void {
    this.inspectYaw += deltaX * 0.006;
    this.inspectPitch = THREE.MathUtils.clamp(this.inspectPitch + deltaY * 0.006, -1.1, 1.1);
  }

  resetInspect(): void {
    this.inspectYaw = 0;
    this.inspectPitch = 0;
  }

  resetPresentation(): void {
    this.ballTrail.clear();
    this.camera.position.set(0, 0.7, 26);
    this.camera.lookAt(0, 0, 0);
    this.bodyRoot.scale.setScalar(1);
    this.ball.visible = true;
    this.paddle.visible = true;
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

  render(): void { this.composer.render(); }

  private createBlockMesh(block: BlockState): void {
    const hero = block.type === 'core' || block.type === 'generator';
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(block.width, blockThickness(block), block.height * Y_SCALE, 2, 2, 2),
      new THREE.MeshPhysicalMaterial({
        color: blockColor(block),
        roughness: hero ? 0.08 : 0.16,
        metalness: 0.02,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        transparent: true,
        opacity: 1,
        transmission: hero ? 0.24 : 0,
        thickness: hero ? 0.55 : 0.18,
        ior: 1.35,
      }),
    );
    mesh.castShadow = true;
    this.bodyRoot.add(mesh);
    this.blockMeshes.set(block.id, mesh);
  }

  private buildCubeShell(): void {
    for (const faceId of FACE_IDS) {
      const basis = FACE_GRAPH[faceId];
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE, 20, 20),
        new THREE.MeshPhysicalMaterial({
          color: faceId === 'front' ? 0xd9f6ff : 0xe8f9ff,
          transparent: true,
          opacity: 0.3,
          roughness: 0.2,
          metalness: 0.01,
          clearcoat: 0.85,
          clearcoatRoughness: 0.1,
          side: THREE.DoubleSide,
        }),
      );
      setBodyPosition(panel, basis.origin);
      panel.quaternion.copy(panelQuaternionForFace(basis));
      this.bodyRoot.add(panel);
    }
    this.bodyRoot.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(FACE_SIZE, FACE_SIZE, FACE_SIZE)),
      new THREE.LineBasicMaterial({ color: 0x8ed9ed, transparent: true, opacity: 0.7 }),
    ));
  }

  private setBodyFaceOrientation(faceId: FaceId): void { this.bodyRoot.quaternion.copy(faceQuaternion(faceId)); }

  private updateEdgeWindow(edge: FaceEdge | null, progress: number, juice: JuiceSnapshot): void {
    if (!edge) { this.edgeMaterial.opacity = 0; return; }
    const half = FACE_SIZE / 2;
    this.edgeGeometry.setFromPoints(edgePoints(edge, half).map(([u, v]) => vec3(localToBody(this.activeFace, u, v, 0.52))));
    this.edgeMaterial.opacity = 0.48 + Math.sin(progress * Math.PI * 5) * 0.28 + juice.glow * 0.18;
    this.edgeMaterial.color.setHSL(THREE.MathUtils.lerp(0.53, 0.82, juice.intensity), 0.92, 0.68);
  }

  private applyCoreKill(progress: number, state: BreakoutState): void {
    const p = smoothstep(progress);
    if (this.reducedMotion) {
      this.bodyRoot.quaternion.setFromEuler(new THREE.Euler(0.2, p * Math.PI * 0.8, 0.08));
      this.camera.position.z = 29;
    } else {
      this.bodyRoot.quaternion.setFromEuler(new THREE.Euler(p * Math.PI * 1.5, p * Math.PI * 4.4, Math.sin(p * Math.PI) * 0.35));
      this.camera.position.z = 26 + Math.sin(p * Math.PI) * 6;
      this.camera.position.y = 0.7 + Math.sin(p * Math.PI * 2) * 0.7;
    }
    this.camera.lookAt(0, 0, 0);

    FACE_IDS.forEach((faceId, faceIndex) => {
      for (const block of state.faces[faceId].blocks) {
        if (block.destroyed) continue;
        const mesh = this.blockMeshes.get(block.id);
        if (!mesh) continue;
        const start = 0.22 + faceIndex * 0.07;
        const collapse = clamp01((p - start) / 0.16);
        const scale = 1 - smoothstep(collapse);
        mesh.scale.setScalar(scale);
        if (scale < 0.02) mesh.visible = false;
      }
    });
  }

  private applyResultsPose(): void {
    this.bodyRoot.quaternion.setFromEuler(new THREE.Euler(0.34, 0.68, 0.08));
    this.camera.position.set(0, 0.9, 31);
    this.camera.lookAt(0, 0, 0);
  }
}

function updateBlockMaterial(mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshPhysicalMaterial>, block: BlockState, active: boolean, juice: JuiceSnapshot): void {
  const material = mesh.material;
  material.color.setHex(blockColor(block));
  material.opacity = active ? 0.98 : 0.25;
  material.emissive.setHex(blockEmissive(block));
  material.emissiveIntensity = active ? blockEmissiveIntensity(block) * (0.8 + juice.glow * 0.8) : blockEmissiveIntensity(block) * 0.28;
  if (block.type === 'core' || block.type === 'generator') material.transmission = active ? 0.28 : 0.08;
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
  return block.type === 'normal' || (block.type === 'armor' && block.armorMode === 'protected') ? 0 : 0.62;
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
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
