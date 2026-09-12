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
  life: number;
  maxLife: number;
  power: number;
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

const FRAGMENT_COUNT = 84;
const WAVE_COUNT = 8;

export class VfxDirector {
  private readonly fragments: THREE.InstancedMesh;
  private readonly fragmentStates: FragmentState[] = [];
  private readonly waves: WaveState[] = [];
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
      new THREE.MeshBasicMaterial({ color: 0xc8f4ff, transparent: true, opacity: 0.8 }),
      FRAGMENT_COUNT,
    );
    this.fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragments.frustumCulled = false;
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
        new THREE.RingGeometry(0.92, 1, 64),
        new THREE.MeshBasicMaterial({ color: 0xb8f4ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
      );
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.root.add(mesh);
      this.waves.push({ active: false, life: 0, maxLife: 0, power: 0, mesh });
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
      wave.life -= dtSeconds;
      if (wave.life <= 0) {
        wave.active = false;
        wave.mesh.visible = false;
        continue;
      }
      const progress = 1 - wave.life / wave.maxLife;
      const radius = THREE.MathUtils.lerp(0.2, 7.2, easeOutCubic(progress));
      wave.mesh.scale.setScalar(radius);
      wave.mesh.material.opacity = (1 - progress) * (0.34 + wave.power * 0.5);
    }
  }

  dispose(): void {
    this.unsubscribe();
  }

  private onEvent(event: GameplayEvent): void {
    if (event.type === 'BlockDestroyed') {
      const position = this.resolveBlockPosition(event.blockId);
      if (position) this.spawnFragments(position, Math.round(5 + this.intensity * 8));
      return;
    }
    if (event.type === 'ChainTriggered' || event.type === 'GeneratorDestroyed' || event.type === 'CoreDestroyed') {
      const position = this.resolveBlockPosition(event.blockId);
      if (!position) return;
      const power = event.type === 'CoreDestroyed' ? 1 : event.type === 'ChainTriggered' ? 0.75 : 0.55;
      this.spawnWave(event.face, position, power);
      if (event.type === 'CoreDestroyed') this.spawnFragments(position, 22);
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
      const outward = origin.clone().normalize().multiplyScalar(THREE.MathUtils.lerp(0.5, 2.1, Math.random()));
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
    const wave = this.waves.find((candidate) => !candidate.active) ?? this.waves[0];
    const basis = FACE_GRAPH[face];
    wave.active = true;
    wave.life = 0.8 + power * 0.35;
    wave.maxLife = wave.life;
    wave.power = power;
    wave.mesh.visible = true;
    wave.mesh.position.copy(position).addScaledVector(new THREE.Vector3(basis.normal.x, basis.normal.y, basis.normal.z), 0.34);
    const matrix = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(basis.u.x, basis.u.y, basis.u.z),
      new THREE.Vector3(basis.v.x, basis.v.y, basis.v.z),
      new THREE.Vector3(basis.normal.x, basis.normal.y, basis.normal.z),
    );
    wave.mesh.quaternion.setFromRotationMatrix(matrix);
    wave.mesh.scale.setScalar(0.1);
    wave.mesh.material.color.setHSL(power > 0.9 ? 0.82 : 0.53, 0.9, 0.72);
  }

  private writeFragmentMatrix(index: number, state: FragmentState): void {
    this.dummy.position.copy(state.position);
    this.dummy.rotation.copy(state.rotation);
    this.dummy.scale.setScalar(state.scale);
    this.dummy.updateMatrix();
    this.fragments.setMatrixAt(index, this.dummy.matrix);
  }
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}
