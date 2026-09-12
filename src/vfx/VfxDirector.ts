import * as THREE from 'three';
import type { GameplayEvent, GameplayEventBus } from '../gameplay/GameplayEvents';
import { FACE_GRAPH, type FaceId } from '../world/FaceGraph';
import type { JuiceSnapshot } from './JuiceDirector';

interface FragmentState {
  active: boolean;
  life: number;
  maxLife: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
}

interface WaveState {
  active: boolean;
  delay: number;
  life: number;
  maxLife: number;
  power: number;
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

interface FlashState {
  active: boolean;
  life: number;
  maxLife: number;
  power: number;
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
}

const FRAGMENT_COUNT = 84;
const WAVE_COUNT = 10;
const FLASH_COUNT = 12;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class VfxDirector {
  private readonly fragments: THREE.InstancedMesh;
  private readonly fragmentStates: FragmentState[] = [];
  private readonly waves: WaveState[] = [];
  private readonly flashes: FlashState[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly unsubscribe: () => void;
  private intensity = 0.3;

  constructor(
    private readonly root: THREE.Group,
    bus: GameplayEventBus,
    private readonly resolveBlockPosition: (blockId: string) => THREE.Vector3 | null,
  ) {
    this.fragments = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xbcefff, transparent: true, opacity: 0.82, toneMapped: false }),
      FRAGMENT_COUNT,
    );
    this.fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragments.frustumCulled = false;
    this.fragments.renderOrder = 6;
    this.root.add(this.fragments);

    for (let i = 0; i < FRAGMENT_COUNT; i += 1) {
      this.fragmentStates.push({
        active: false,
        life: 0,
        maxLife: 0,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        scale: 0,
      });
      this.writeFragmentMatrix(i, this.fragmentStates[i]);
    }

    for (let i = 0; i < WAVE_COUNT; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.91, 1, 72),
        new THREE.MeshBasicMaterial({
          color: 0x9feaff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.root.add(mesh);
      this.waves.push({ active: false, delay: 0, life: 0, maxLife: 0, power: 0, mesh });
    }

    for (let i = 0; i < FLASH_COUNT; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 32),
        new THREE.MeshBasicMaterial({
          color: 0xe9fbff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.root.add(mesh);
      this.flashes.push({ active: false, life: 0, maxLife: 0, power: 0, mesh });
    }

    this.fragments.instanceMatrix.needsUpdate = true;
    this.unsubscribe = bus.subscribe((event) => this.onEvent(event));
  }

  update(dtSeconds: number, juice: JuiceSnapshot): void {
    this.intensity = juice.particles;
    let fragmentsDirty = false;
    for (let i = 0; i < this.fragmentStates.length; i += 1) {
      const state = this.fragmentStates[i];
      if (!state.active) continue;
      state.life -= dtSeconds;
      if (state.life <= 0) {
        state.active = false;
        state.scale = 0;
      } else {
        state.position.addScaledVector(state.velocity, dtSeconds);
        state.velocity.multiplyScalar(Math.pow(0.35, dtSeconds));
        state.rotation.x += state.spin.x * dtSeconds;
        state.rotation.y += state.spin.y * dtSeconds;
        state.rotation.z += state.spin.z * dtSeconds;
        state.scale = Math.max(0, state.life / state.maxLife) * (0.7 + juice.intensity * 0.7);
      }
      this.writeFragmentMatrix(i, state);
      fragmentsDirty = true;
    }
    if (fragmentsDirty) this.fragments.instanceMatrix.needsUpdate = true;

    for (const wave of this.waves) {
      if (!wave.active) continue;
      if (wave.delay > 0) {
        wave.delay -= dtSeconds;
        if (wave.delay > 0) continue;
        wave.mesh.visible = true;
      }
      wave.life -= dtSeconds;
      if (wave.life <= 0) {
        wave.active = false;
        wave.mesh.visible = false;
        continue;
      }
      const progress = 1 - wave.life / wave.maxLife;
      const radius = THREE.MathUtils.lerp(0.18, 7.5 + wave.power * 2.8, easeOutCubic(progress));
      wave.mesh.scale.setScalar(radius);
      wave.mesh.material.opacity = Math.pow(1 - progress, 1.6) * (0.2 + wave.power * 0.38);
    }

    for (const flash of this.flashes) {
      if (!flash.active) continue;
      flash.life -= dtSeconds;
      if (flash.life <= 0) {
        flash.active = false;
        flash.mesh.visible = false;
        continue;
      }
      const progress = 1 - flash.life / flash.maxLife;
      const scale = THREE.MathUtils.lerp(0.12, 0.9 + flash.power * 0.9, easeOutCubic(progress));
      flash.mesh.scale.setScalar(scale);
      flash.mesh.material.opacity = Math.pow(1 - progress, 2.2) * (0.26 + flash.power * 0.44);
    }
  }

  dispose(): void {
    this.unsubscribe();
  }

  private onEvent(event: GameplayEvent): void {
    if (event.type === 'BlockHit') {
      const position = this.resolveBlockPosition(event.blockId);
      if (!position) return;
      this.spawnImpactFlash(position, event.destroyed ? 0.65 : 0.3);
      if (!event.destroyed) this.spawnFragments(position, Math.round(1 + this.intensity * 2));
      return;
    }

    if (event.type === 'BlockDestroyed') {
      const position = this.resolveBlockPosition(event.blockId);
      if (position) {
        this.spawnFragments(position, Math.round(5 + this.intensity * 8));
        this.spawnImpactFlash(position, 0.72);
      }
      return;
    }

    if (event.type === 'ChainTriggered' || event.type === 'GeneratorDestroyed' || event.type === 'CoreDestroyed') {
      const position = this.resolveBlockPosition(event.blockId);
      if (!position) return;
      const power = event.type === 'CoreDestroyed' ? 1 : event.type === 'ChainTriggered' ? 0.78 : 0.58;
      this.spawnWave(event.face, position, power);
      this.spawnImpactFlash(position, power);
      if (event.type === 'CoreDestroyed') this.spawnFragments(position, 24);
    }
  }

  private spawnFragments(origin: THREE.Vector3, requestedCount: number): void {
    let remaining = requestedCount;
    for (const state of this.fragmentStates) {
      if (remaining <= 0) break;
      if (state.active) continue;
      state.active = true;
      state.life = THREE.MathUtils.lerp(0.35, 0.9, Math.random());
      state.maxLife = state.life;
      state.position.copy(origin);
      const outward = dominantNormal(origin).multiplyScalar(THREE.MathUtils.lerp(0.5, 2.1, Math.random()));
      state.velocity.set(
        outward.x + THREE.MathUtils.randFloatSpread(2.2),
        outward.y + THREE.MathUtils.randFloatSpread(2.2),
        outward.z + THREE.MathUtils.randFloatSpread(2.2),
      );
      state.spin.set(THREE.MathUtils.randFloatSpread(9), THREE.MathUtils.randFloatSpread(9), THREE.MathUtils.randFloatSpread(9));
      state.rotation.set(0, 0, 0);
      state.scale = THREE.MathUtils.lerp(0.7, 1.5, Math.random());
      remaining -= 1;
    }
  }

  private spawnWave(face: FaceId, position: THREE.Vector3, power: number): void {
    const layers = power > 0.9 ? 3 : power > 0.7 ? 2 : 1;
    for (let layer = 0; layer < layers; layer += 1) {
      const wave = this.acquireWave();
      const basis = FACE_GRAPH[face];
      wave.active = true;
      wave.delay = layer * 0.085;
      wave.life = 0.72 + power * 0.42 + layer * 0.05;
      wave.maxLife = wave.life;
      wave.power = Math.max(0.35, power - layer * 0.12);
      wave.mesh.visible = layer === 0;
      wave.mesh.position.copy(position).addScaledVector(new THREE.Vector3(basis.normal.x, basis.normal.y, basis.normal.z), 0.36 + layer * 0.015);
      const matrix = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(basis.u.x, basis.u.y, basis.u.z),
        new THREE.Vector3(basis.v.x, basis.v.y, basis.v.z),
        new THREE.Vector3(basis.normal.x, basis.normal.y, basis.normal.z),
      );
      wave.mesh.quaternion.setFromRotationMatrix(matrix);
      wave.mesh.scale.setScalar(0.1);
      wave.mesh.material.color.setHSL(power > 0.9 ? 0.8 - layer * 0.035 : 0.52 + layer * 0.02, 0.94, 0.7);
    }
  }

  private spawnImpactFlash(position: THREE.Vector3, power: number): void {
    const flash = this.flashes.find((candidate) => !candidate.active) ?? this.flashes.reduce((oldest, candidate) => candidate.life < oldest.life ? candidate : oldest);
    const normal = dominantNormal(position);
    flash.active = true;
    flash.life = 0.12 + power * 0.12;
    flash.maxLife = flash.life;
    flash.power = power;
    flash.mesh.visible = true;
    flash.mesh.position.copy(position).addScaledVector(normal, 0.38);
    flash.mesh.quaternion.setFromUnitVectors(Z_AXIS, normal);
    flash.mesh.scale.setScalar(0.1);
    flash.mesh.material.color.setHSL(THREE.MathUtils.lerp(0.53, 0.78, power), 0.86, 0.82);
  }

  private acquireWave(): WaveState {
    return this.waves.find((candidate) => !candidate.active)
      ?? this.waves.reduce((oldest, candidate) => candidate.life < oldest.life ? candidate : oldest);
  }

  private writeFragmentMatrix(index: number, state: FragmentState): void {
    this.dummy.position.copy(state.position);
    this.dummy.rotation.copy(state.rotation);
    this.dummy.scale.setScalar(state.scale);
    this.dummy.updateMatrix();
    this.fragments.setMatrixAt(index, this.dummy.matrix);
  }
}

function dominantNormal(position: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(position.x);
  const ay = Math.abs(position.y);
  const az = Math.abs(position.z);
  if (ax >= ay && ax >= az) return new THREE.Vector3(Math.sign(position.x) || 1, 0, 0);
  if (ay >= ax && ay >= az) return new THREE.Vector3(0, Math.sign(position.y) || 1, 0);
  return new THREE.Vector3(0, 0, Math.sign(position.z) || 1);
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}
