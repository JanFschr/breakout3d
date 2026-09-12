import * as THREE from 'three';
import type { GameScene } from './GameScene';
import type { JuiceSnapshot } from '../vfx/JuiceDirector';

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualityProfile {
  readonly tier: QualityTier;
  readonly pixelRatioCap: number;
  readonly glowScale: number;
  readonly trailScale: number;
  readonly particleScale: number;
  readonly transmissionScale: number;
  readonly shadows: boolean;
}

export interface QualityMetrics {
  readonly tier: QualityTier;
  readonly override: QualityTier | null;
  readonly averageFrameMs: number;
  readonly worstFrameMs: number;
  readonly fps: number;
}

const PROFILES: Record<QualityTier, QualityProfile> = {
  high: { tier: 'high', pixelRatioCap: 2, glowScale: 1, trailScale: 1, particleScale: 1, transmissionScale: 1, shadows: true },
  medium: { tier: 'medium', pixelRatioCap: 1.5, glowScale: 0.78, trailScale: 0.72, particleScale: 0.66, transmissionScale: 0.45, shadows: true },
  low: { tier: 'low', pixelRatioCap: 1, glowScale: 0.5, trailScale: 0.46, particleScale: 0.34, transmissionScale: 0, shadows: false },
};

const SAMPLE_COUNT = 120;

export class QualityManager {
  private automaticTier: QualityTier = chooseInitialTier();
  private override: QualityTier | null = null;
  private readonly frameSamples = new Float32Array(SAMPLE_COUNT);
  private sampleIndex = 0;
  private sampleSize = 0;
  private reevaluateElapsed = 0;
  private readonly baseTransmission = new WeakMap<THREE.Material, number>();
  private readonly baseCastShadow = new WeakMap<THREE.Object3D, boolean>();
  private readonly baseReceiveShadow = new WeakMap<THREE.Object3D, boolean>();

  get profile(): QualityProfile {
    return PROFILES[this.override ?? this.automaticTier];
  }

  setOverride(tier: QualityTier | null, scene: GameScene): void {
    this.override = tier;
    this.apply(scene);
  }

  cycleOverride(scene: GameScene): void {
    const sequence: Array<QualityTier | null> = [null, 'high', 'medium', 'low'];
    const index = sequence.indexOf(this.override);
    this.setOverride(sequence[(index + 1) % sequence.length], scene);
  }

  apply(scene: GameScene): void {
    const profile = this.profile;
    scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap));
    scene.renderer.shadowMap.enabled = profile.shadows;

    scene.getBodyRoot().traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!this.baseCastShadow.has(object)) this.baseCastShadow.set(object, object.castShadow);
      if (!this.baseReceiveShadow.has(object)) this.baseReceiveShadow.set(object, object.receiveShadow);
      object.castShadow = profile.shadows && (this.baseCastShadow.get(object) ?? false);
      object.receiveShadow = profile.shadows && (this.baseReceiveShadow.get(object) ?? false);

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshPhysicalMaterial)) continue;
        if (!this.baseTransmission.has(material)) this.baseTransmission.set(material, material.transmission);
        material.transmission = (this.baseTransmission.get(material) ?? 0) * profile.transmissionScale;
        material.needsUpdate = true;
      }
    });
    scene.resize();
  }

  update(frameDeltaSeconds: number, scene: GameScene): void {
    const frameMs = Math.min(frameDeltaSeconds * 1000, 100);
    this.frameSamples[this.sampleIndex] = frameMs;
    this.sampleIndex = (this.sampleIndex + 1) % SAMPLE_COUNT;
    this.sampleSize = Math.min(SAMPLE_COUNT, this.sampleSize + 1);

    if (this.override) return;
    this.reevaluateElapsed += frameDeltaSeconds;
    if (this.reevaluateElapsed < 4 || this.sampleSize < 60) return;
    this.reevaluateElapsed = 0;

    const average = this.averageFrameMs();
    const next = average > 20 ? downgrade(this.automaticTier) : average < 13.5 ? upgrade(this.automaticTier) : this.automaticTier;
    if (next !== this.automaticTier) {
      this.automaticTier = next;
      this.apply(scene);
    }
  }

  visualJuice(snapshot: JuiceSnapshot): JuiceSnapshot {
    const profile = this.profile;
    return {
      ...snapshot,
      glow: clamp01(snapshot.glow * profile.glowScale),
      trail: clamp01(snapshot.trail * profile.trailScale),
      particles: clamp01(snapshot.particles * profile.particleScale),
    };
  }

  metrics(): QualityMetrics {
    const averageFrameMs = this.averageFrameMs();
    let worstFrameMs = 0;
    for (let i = 0; i < this.sampleSize; i += 1) worstFrameMs = Math.max(worstFrameMs, this.frameSamples[i]);
    return {
      tier: this.profile.tier,
      override: this.override,
      averageFrameMs,
      worstFrameMs,
      fps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
    };
  }

  private averageFrameMs(): number {
    if (this.sampleSize === 0) return 0;
    let total = 0;
    for (let i = 0; i < this.sampleSize; i += 1) total += this.frameSamples[i];
    return total / this.sampleSize;
  }
}

function chooseInitialTier(): QualityTier {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const memory = navigatorWithMemory.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 8;
  if (memory <= 4 || cores <= 4) return 'low';
  if (memory <= 6 || cores <= 6 || /iPhone|iPad|Android/i.test(navigator.userAgent)) return 'medium';
  return 'high';
}

function downgrade(tier: QualityTier): QualityTier {
  return tier === 'high' ? 'medium' : 'low';
}

function upgrade(tier: QualityTier): QualityTier {
  return tier === 'low' ? 'medium' : 'high';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
