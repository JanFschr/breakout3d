import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { APP_CONFIG } from '../core/config';
import type { LevelDefinition } from '../data/LevelDefinition';
import type { SpatialPresentationState } from '../gameplay/SpatialRuntime';
import type { BlockState, BreakoutState } from '../gameplay/contracts';
import { BODY_FACE_IDS, FACE_GRAPH, localToBody, type FaceBasis, type FaceId, type Vec3Like } from '../world/FaceGraph';
import { BallTrail } from '../vfx/BallTrail';
import { EdgeRail } from '../vfx/EdgeRail';
import { createHeroBallMaterial, type HeroBallUniforms } from '../vfx/HeroBallMaterial';
import type { JuiceSnapshot } from '../vfx/JuiceDirector';

const FACE_SIZE = 14;
const Y_SCALE = FACE_SIZE / APP_CONFIG.gameplay.fieldHeight;
const CUBE_BACKGROUND = new THREE.Color(0x050a12);
const CUBE_PEAK_BACKGROUND = new THREE.Color(0x160d24);
const PYRAMID_BACKGROUND = new THREE.Color(0x09080d);
const PYRAMID_PEAK_BACKGROUND = new THREE.Color(0x241309);
const GAMEPLAY_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.035, 0.065, 0, 'XYZ'));

export class GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  readonly paddle: THREE.Mesh;
  readonly ball: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly bodyRoot = new THREE.Group();
  private readonly blockMeshes = new Map<string, THREE.Mesh<THREE.BoxGeometry, THREE.MeshPhysicalMaterial>>();
  private readonly facePanels = new Map<FaceId, THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>>();
  private readonly debugGroup = new THREE.Group();
  private readonly edgeRail = new EdgeRail();
  private readonly ballUniforms: HeroBallUniforms;
  private readonly ballTrail = new BallTrail();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly backgroundColor = new THREE.Color();
  private readonly faceIds: readonly FaceId[];
  private readonly warmTheme: boolean;
  private readonly baseBackground: THREE.Color;
  private readonly peakBackground: THREE.Color;
  private activeFace: FaceId;
  private inspectYaw = 0;
  private inspectPitch = 0;
  private visualTime = 0;

  constructor(private readonly container: HTMLElement, state: BreakoutState, private readonly level: LevelDefinition) {
    this.faceIds = BODY_FACE_IDS[level.body.type].filter((faceId) => level.faces[faceId]?.enabled);
    this.warmTheme = level.body.type === 'pyramid';
    this.baseBackground = this.warmTheme ? PYRAMID_BACKGROUND : CUBE_BACKGROUND;
    this.peakBackground = this.warmTheme ? PYRAMID_PEAK_BACKGROUND : CUBE_PEAK_BACKGROUND;
    this.activeFace = state.activeFace;
    this.scene.background = this.backgroundColor.copy(this.baseBackground);
    this.scene.fog = new THREE.Fog(this.baseBackground, 42, 96);
    this.camera.position.set(0, 0.7, 26);
    this.camera.lookAt(0, 0, 0);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, APP_CONFIG.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    this.container.append(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.24, 0.82);
    this.composer.addPass(this.bloomPass);

    this.scene.add(new THREE.HemisphereLight(this.warmTheme ? 0xffe3ad : 0xbfeaff, 0x02050d, 0.78));
    const key = new THREE.DirectionalLight(this.warmTheme ? 0xfff1d0 : 0xeaf8ff, 2.1);
    key.position.set(-8, 12, 18);
    key.castShadow = true;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(this.warmTheme ? 0xff9c42 : 0x7866ff, 1.2);
    rim.position.set(11, -5, 13);
    this.scene.add(rim);

    const fill = new THREE.PointLight(0x32dfff, this.warmTheme ? 0.8 : 0.6, 48, 2);
    fill.position.set(-11, 2, 13);
    this.scene.add(fill);

    this.scene.add(this.bodyRoot);
    this.buildBodyShell();

    this.paddle = new THREE.Mesh(
      new THREE.BoxGeometry(state.paddle.width, 0.62, Math.max(state.paddle.height * Y_SCALE * 1.65, 0.72)),
      new THREE.MeshPhysicalMaterial({
        color: this.warmTheme ? 0xffb44a : 0x596dff,
        emissive: this.warmTheme ? 0xff7a1f : 0x2540ff,
        emissiveIntensity: 0.86,
        roughness: 0.12,
        metalness: 0.04,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        transmission: 0,
        thickness: 0.24,
      }),
    );
    this.paddle.castShadow = true;
    this.paddle.renderOrder = 4;
    this.bodyRoot.add(this.paddle);

    const heroBall = createHeroBallMaterial();
    this.ballUniforms = heroBall.uniforms;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(state.ball.radius * 1.45, 48, 32), heroBall.material);
    this.ball.castShadow = false;
    this.ball.renderOrder = 5;
    this.bodyRoot.add(this.ballTrail.object);
    this.bodyRoot.add(this.ball);

    for (const faceId of this.faceIds) {
      for (const block of state.faces[faceId].blocks) this.createBlockMesh(block);
    }

    this.bodyRoot.add(this.edgeRail.object);
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
    const inspecting = spatial.phase === 'INSPECT';

    this.backgroundColor.lerpColors(this.baseBackground, this.peakBackground, clamp01(juice.intensity * 0.2 + juice.eventPulse * 0.08));
    this.bloomPass.strength = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.1, 0.62, juice.glow) + juice.eventPulse * 0.1, 0.08, 0.76);
    this.bloomPass.radius = THREE.MathUtils.lerp(0.16, 0.38, juice.intensity);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.92, 1.04, juice.intensity);
    if (spatial.phase === 'CORE_KILL') {
      const climax = Math.sin(spatial.coreKillProgress * Math.PI);
      this.bloomPass.strength = Math.max(this.bloomPass.strength, 0.34 + climax * 0.46);
      this.renderer.toneMappingExposure += climax * 0.055;
    }

    this.ballUniforms.time.value = this.visualTime;
    this.ballUniforms.energy.value = juice.intensity;
    this.ballUniforms.impact.value = juice.eventPulse;
    this.ballUniforms.direction.value.set(state.ball.velocity.x, 0, -state.ball.velocity.y * Y_SCALE).normalize();

    if (spatial.phase !== 'EDGE_RIDE') setBodyPosition(this.ball, localToBody(spatial.activeFace, ballX, centeredY(ballY), 0.48));
    setBodyPosition(this.paddle, localToBody(spatial.activeFace, paddleX, centeredY(state.paddle.y), 0.31));
    this.paddle.quaternion.copy(meshQuaternionForFace(activeBasis));
    this.paddle.rotateZ(THREE.MathUtils.clamp(-state.paddle.velocityX * 0.012, -0.11, 0.11));
    (this.paddle.material as THREE.MeshPhysicalMaterial).emissiveIntensity = THREE.MathUtils.lerp(0.74, 1.28, juice.glow) + juice.eventPulse * 0.18;

    this.updateFacePanels(spatial.activeFace, inspecting, juice);

    for (const faceId of this.faceIds) {
      for (const block of state.faces[faceId].blocks) {
        const mesh = this.blockMeshes.get(block.id);
        if (!mesh) continue;
        mesh.scale.setScalar(1);
        mesh.visible = !block.destroyed && spatial.phase !== 'RESULTS';
        setBodyPosition(mesh, localToBody(faceId, block.position.x, centeredY(block.position.y), 0.3));
        mesh.quaternion.copy(meshQuaternionForFace(FACE_GRAPH[faceId]));
        updateBlockMaterial(mesh, block, faceId === spatial.activeFace, inspecting, juice, this.warmTheme);
      }
    }

    this.ball.visible = spatial.phase !== 'RESULTS' && (spatial.phase !== 'CORE_KILL' || spatial.coreKillProgress < 0.34);
    this.paddle.visible = spatial.phase !== 'CORE_KILL' && spatial.phase !== 'RESULTS';

    if (spatial.phase === 'EDGE_RIDE' && spatial.ride) {
      const progress = smoothstep(spatial.ride.progress);
      setBodyPosition(this.ball, bezierRide(spatial.ride.sourceBodyPoint, spatial.ride.destinationBodyPoint, progress));
      this.bodyRoot.quaternion.copy(presentationQuaternion(spatial.ride.sourceFace)).slerp(presentationQuaternion(spatial.ride.destinationFace), progress);
    } else if (spatial.phase === 'INSPECT') {
      const target = presentationQuaternion(spatial.activeFace);
      const inspect = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.inspectPitch, this.inspectYaw, 0, 'YXZ'));
      this.bodyRoot.quaternion.copy(inspect.multiply(target));
    } else if (spatial.phase === 'CORE_KILL') {
      this.applyCoreKill(spatial.coreKillProgress, state);
    } else if (spatial.phase === 'RESULTS') {
      this.applyResultsPose();
    } else {
      this.setBodyFaceOrientation(spatial.activeFace);
      this.bodyRoot.scale.setScalar(1);
    }

    if (this.ball.visible) this.ballTrail.push(this.ball.position, juice.trail);
    this.edgeRail.update(spatial.activeFace, spatial.edgeWindow, spatial.edgeWindowProgress, juice, this.visualTime);
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
    this.bodyRoot.scale.setScalar(1);
    this.ball.visible = true;
    this.paddle.visible = true;
  }

  setDebugCollisionVisible(visible: boolean, state: BreakoutState): void {
    this.debugGroup.clear();
    if (!visible) return;
    const material = new THREE.LineBasicMaterial({ color: 0x44e6ff });
    const basis = FACE_GRAPH[this.activeFace];
    const addRect = (x: number, y: number, width: number, height: number): void => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-width / 2, 0, -height * Y_SCALE / 2),
        new THREE.Vector3(width / 2, 0, -height * Y_SCALE / 2),
        new THREE.Vector3(width / 2, 0, height * Y_SCALE / 2),
        new THREE.Vector3(-width / 2, 0, height * Y_SCALE / 2),
      ]);
      const line = new THREE.LineLoop(geometry, material);
      setBodyPosition(line, localToBody(this.activeFace, x, centeredY(y), 0.54));
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
      new THREE.BoxGeometry(block.width * 0.98, blockThickness(block), Math.max(block.height * Y_SCALE * 1.08, 0.58), 2, 2, 2),
      new THREE.MeshPhysicalMaterial({
        color: blockColor(block, this.warmTheme),
        roughness: hero ? 0.11 : 0.2,
        metalness: hero ? 0.04 : 0.02,
        clearcoat: hero ? 0.94 : 0.72,
        clearcoatRoughness: hero ? 0.08 : 0.14,
        transparent: true,
        opacity: 1,
        transmission: hero ? 0.08 : 0,
        thickness: hero ? 0.42 : 0.14,
        ior: 1.32,
      }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 3;
    this.bodyRoot.add(mesh);
    this.blockMeshes.set(block.id, mesh);
  }

  private buildBodyShell(): void {
    if (this.level.body.type === 'pyramid') this.buildPyramidShell();
    else this.buildCubeShell();
  }

  private buildCubeShell(): void {
    for (const faceId of this.faceIds) this.addFacePanel(faceId, new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE, 20, 20));
    this.bodyRoot.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(FACE_SIZE, FACE_SIZE, FACE_SIZE)),
      new THREE.LineBasicMaterial({ color: 0x2a6f88, transparent: true, opacity: 0.52 }),
    ));
  }

  private buildPyramidShell(): void {
    const slant = Math.hypot(12, 7);
    for (const faceId of this.faceIds) {
      const geometry = faceId === 'base'
        ? new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE, 16, 16)
        : triangleGeometry(FACE_SIZE, slant);
      this.addFacePanel(faceId, geometry);
    }

    const apex = new THREE.Vector3(0, 7, 0);
    const corners = [
      new THREE.Vector3(-7, -5, -7), new THREE.Vector3(7, -5, -7),
      new THREE.Vector3(7, -5, 7), new THREE.Vector3(-7, -5, 7),
    ];
    const edgePoints: THREE.Vector3[] = [];
    for (let i = 0; i < corners.length; i += 1) {
      edgePoints.push(corners[i], corners[(i + 1) % corners.length], corners[i], apex);
    }
    this.bodyRoot.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(edgePoints),
      new THREE.LineBasicMaterial({ color: 0xffb348, transparent: true, opacity: 0.58 }),
    ));
  }

  private addFacePanel(faceId: FaceId, geometry: THREE.BufferGeometry): void {
    const basis = FACE_GRAPH[faceId];
    const panel = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: this.warmTheme ? 0x171009 : 0x071019,
        emissive: this.warmTheme ? 0x160900 : 0x020711,
        emissiveIntensity: 0.08,
        transparent: true,
        opacity: 0.14,
        roughness: 0.34,
        metalness: 0.02,
        clearcoat: 0.58,
        clearcoatRoughness: 0.2,
        transmission: 0,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
    );
    panel.receiveShadow = true;
    setBodyPosition(panel, basis.origin);
    panel.quaternion.copy(panelQuaternionForFace(basis));
    this.bodyRoot.add(panel);
    this.facePanels.set(faceId, panel);
  }

  private updateFacePanels(activeFace: FaceId, inspecting: boolean, juice: JuiceSnapshot): void {
    for (const faceId of this.faceIds) {
      const panel = this.facePanels.get(faceId);
      if (!panel) continue;
      const material = panel.material;
      const active = faceId === activeFace;
      material.color.setHex(active ? (this.warmTheme ? 0x24170b : 0x0b1724) : (this.warmTheme ? 0x100b08 : 0x071019));
      material.opacity = active ? 0.99 : inspecting ? 0.4 : 0.12;
      material.emissive.setHex(active ? (this.warmTheme ? 0x351600 : 0x071a2b) : 0x020711);
      material.emissiveIntensity = active ? THREE.MathUtils.lerp(0.1, 0.26, juice.glow) : 0.04;
      material.roughness = active ? 0.28 : 0.42;
      material.clearcoat = active ? 0.7 : 0.38;
      material.depthWrite = active || inspecting;
    }
  }

  private setBodyFaceOrientation(faceId: FaceId): void { this.bodyRoot.quaternion.copy(presentationQuaternion(faceId)); }

  private applyCoreKill(progress: number, state: BreakoutState): void {
    const p = smoothstep(progress);
    this.bodyRoot.scale.setScalar(1 + Math.sin(p * Math.PI) * (this.reducedMotion ? 0.018 : 0.048));
    if (this.reducedMotion) {
      this.bodyRoot.quaternion.setFromEuler(new THREE.Euler(0.2, p * Math.PI * 0.8, 0.08));
    } else {
      this.bodyRoot.quaternion.setFromEuler(new THREE.Euler(p * Math.PI * 1.5, p * Math.PI * 4.4, Math.sin(p * Math.PI) * 0.35));
    }

    this.faceIds.forEach((faceId, faceIndex) => {
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
    this.bodyRoot.scale.setScalar(1);
    this.bodyRoot.quaternion.setFromEuler(new THREE.Euler(this.warmTheme ? 0.2 : 0.34, this.warmTheme ? 0.85 : 0.68, 0.08));
  }
}

function updateBlockMaterial(
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshPhysicalMaterial>,
  block: BlockState,
  active: boolean,
  inspecting: boolean,
  juice: JuiceSnapshot,
  warmTheme: boolean,
): void {
  const material = mesh.material;
  material.color.setHex(blockColor(block, warmTheme));
  material.opacity = active ? 1 : inspecting ? 0.55 : 0.12;
  material.emissive.setHex(blockEmissive(block, warmTheme));
  material.emissiveIntensity = active
    ? blockEmissiveIntensity(block) * (0.78 + juice.glow * 0.55)
    : blockEmissiveIntensity(block) * (inspecting ? 0.2 : 0.05);
  material.transmission = block.type === 'core' || block.type === 'generator'
    ? active ? 0.08 : inspecting ? 0.025 : 0
    : 0;
  material.depthWrite = active || inspecting;
}

function blockColor(block: BlockState, warmTheme: boolean): number {
  if (block.type === 'armor') return block.armorMode === 'weakened' ? 0xff8a3d : warmTheme ? 0xd96a2f : 0xd657ff;
  if (block.type === 'anchor') return warmTheme ? 0xffc34d : 0x35d9e6;
  if (block.type === 'generator') return warmTheme ? 0x35d9e6 : 0xff4fae;
  if (block.type === 'chain') return 0xffd54a;
  if (block.type === 'core') return block.exposed ? (warmTheme ? 0xfff0a0 : 0xffd85a) : 0x526174;
  return normalRowColor(block.position.y, warmTheme);
}
function normalRowColor(y: number, warmTheme: boolean): number {
  if (warmTheme) {
    if (y >= 15) return 0xfff0a0;
    if (y >= 13.5) return 0xffc247;
    if (y >= 12) return 0xff843d;
    if (y >= 10.5) return 0x45dfca;
    return 0x4b8dff;
  }
  if (y >= 15) return 0xff4b55;
  if (y >= 14) return 0xff8a3d;
  if (y >= 13) return 0xffd54a;
  if (y >= 12) return 0x4ddb78;
  if (y >= 11) return 0x35d9e6;
  if (y >= 10) return 0x4b8dff;
  return 0x9a6bff;
}
function blockEmissive(block: BlockState, warmTheme: boolean): number {
  if (block.type === 'normal') return normalRowColor(block.position.y, warmTheme);
  if (block.type === 'generator') return warmTheme ? 0x20cfee : 0xff2ea5;
  if (block.type === 'anchor') return warmTheme ? 0xf5a51d : 0x20cfee;
  if (block.type === 'chain') return 0xf4ae18;
  if (block.type === 'core') return block.exposed ? 0xffb81f : 0x172337;
  if (block.type === 'armor') return block.armorMode === 'weakened' ? 0xff6b2c : warmTheme ? 0x9b3f1c : 0x7c35b8;
  return 0x000000;
}
function blockEmissiveIntensity(block: BlockState): number {
  if (block.type === 'normal') return 0.12;
  if (block.type === 'armor' && block.armorMode === 'protected') return 0.16;
  return 0.62;
}
function blockThickness(block: BlockState): number { return block.type === 'core' ? 0.95 : block.type === 'generator' ? 0.76 : 0.54; }
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
function presentationQuaternion(faceId: FaceId): THREE.Quaternion {
  return GAMEPLAY_TILT.clone().multiply(faceQuaternion(faceId));
}
function triangleGeometry(width: number, height: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -width / 2, -height / 2, 0,
    width / 2, -height / 2, 0,
    0, height / 2, 0,
  ], 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
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
