import type { GameplayEvent, GameplayEventBus } from '../gameplay/GameplayEvents';
import type { MasterySystem } from '../gameplay/MasterySystem';

export interface JuiceSnapshot {
  readonly intensity: number;
  readonly eventPulse: number;
  readonly trail: number;
  readonly glow: number;
  readonly particles: number;
  readonly camera: number;
  readonly audio: number;
}

export class JuiceDirector {
  private eventPulse = 0;
  private readonly unsubscribe: () => void;
  private snapshot: JuiceSnapshot = {
    intensity: 0,
    eventPulse: 0,
    trail: 0.15,
    glow: 0.2,
    particles: 0.2,
    camera: 0.05,
    audio: 0.1,
  };

  constructor(
    private readonly mastery: MasterySystem,
    bus: GameplayEventBus,
  ) {
    this.unsubscribe = bus.subscribe((event) => this.onEvent(event));
  }

  update(dtSeconds: number): void {
    this.eventPulse = Math.max(0, this.eventPulse - dtSeconds * 1.9);
    const mastery = this.mastery.state;
    const combo = clamp01((mastery.comboMultiplier - 1) / 2.2);
    const orbit = clamp01(mastery.orbitTier / 3);
    const overdrive = mastery.fullOrbitActive ? 1 : 0;
    const base = clamp01(combo * 0.5 + orbit * 0.25 + overdrive * 0.35);
    const intensity = clamp01(base + this.eventPulse * 0.55);

    this.snapshot = {
      intensity,
      eventPulse: this.eventPulse,
      trail: clamp01(0.18 + intensity * 0.82),
      glow: clamp01(0.22 + intensity * 0.78),
      particles: clamp01(0.18 + intensity * 0.82),
      camera: clamp01(0.06 + intensity * 0.46),
      audio: clamp01(0.12 + intensity * 0.88),
    };
  }

  getSnapshot(): JuiceSnapshot {
    return this.snapshot;
  }

  dispose(): void {
    this.unsubscribe();
  }

  private onEvent(event: GameplayEvent): void {
    const impulse = eventImpulse(event);
    this.eventPulse = Math.max(this.eventPulse, impulse);
  }
}

function eventImpulse(event: GameplayEvent): number {
  if (event.type === 'BlockHit') return event.destroyed ? 0.26 : 0.12;
  if (event.type === 'BlockDestroyed') return 0.3;
  if (event.type === 'GeneratorDestroyed') return 0.55;
  if (event.type === 'ChainTriggered') return 0.7;
  if (event.type === 'FlipRated') return event.rating === 'perfect' ? 0.65 : event.rating === 'good' ? 0.35 : 0.18;
  if (event.type === 'CoreExposed') return 0.55;
  if (event.type === 'CoreDestroyed') return 1;
  if (event.type === 'FaceEntered') return 0.24;
  return 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
