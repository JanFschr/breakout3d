import type { LevelDefinition } from '../data/LevelDefinition';
import type { FaceId } from '../world/FaceGraph';
import type { FlipRating, GameplayEvent, GameplayEventBus } from './GameplayEvents';

export interface MasteryState {
  score: number;
  comboStreak: number;
  comboPeak: number;
  comboMultiplier: number;
  comboTimeRemaining: number;
  orbitFaces: Set<FaceId>;
  orbitTier: number;
  fullOrbitActive: boolean;
  fullOrbitRemaining: number;
  fullOrbitAchieved: boolean;
  perfectFlips: number;
  goodFlips: number;
  livesLost: number;
}

export interface RunSummary {
  readonly cleared: boolean;
  readonly elapsedSeconds: number;
  readonly score: number;
  readonly comboPeak: number;
  readonly orbitTier: number;
  readonly fullOrbitAchieved: boolean;
  readonly perfectFlips: number;
  readonly livesLost: number;
}

export class MasterySystem {
  readonly state: MasteryState;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly level: LevelDefinition,
    bus: GameplayEventBus,
  ) {
    this.state = this.createState();
    this.unsubscribe = bus.subscribe((event) => this.onEvent(event));
  }

  update(dtSeconds: number): void {
    if (this.state.comboTimeRemaining > 0) {
      this.state.comboTimeRemaining = Math.max(0, this.state.comboTimeRemaining - dtSeconds);
      if (this.state.comboTimeRemaining === 0) this.resetCombo();
    }
    if (this.state.fullOrbitActive) {
      this.state.fullOrbitRemaining = Math.max(0, this.state.fullOrbitRemaining - dtSeconds);
      if (this.state.fullOrbitRemaining === 0) this.state.fullOrbitActive = false;
    }
  }

  reset(startFace: FaceId): void {
    const next = this.createState();
    next.orbitFaces.add(startFace);
    Object.assign(this.state, next);
  }

  summary(cleared: boolean, elapsedSeconds: number): RunSummary {
    return {
      cleared,
      elapsedSeconds,
      score: this.state.score,
      comboPeak: this.state.comboPeak,
      orbitTier: this.state.orbitTier,
      fullOrbitAchieved: this.state.fullOrbitAchieved,
      perfectFlips: this.state.perfectFlips,
      livesLost: this.state.livesLost,
    };
  }

  dispose(): void { this.unsubscribe(); }

  private createState(): MasteryState {
    return {
      score: 0,
      comboStreak: 0,
      comboPeak: 0,
      comboMultiplier: 1,
      comboTimeRemaining: 0,
      orbitFaces: new Set<FaceId>([this.level.startFace]),
      orbitTier: 0,
      fullOrbitActive: false,
      fullOrbitRemaining: 0,
      fullOrbitAchieved: false,
      perfectFlips: 0,
      goodFlips: 0,
      livesLost: 0,
    };
  }

  private onEvent(event: GameplayEvent): void {
    if (event.type === 'BlockHit') {
      this.state.comboStreak += 1;
      this.state.comboPeak = Math.max(this.state.comboPeak, this.state.comboStreak);
      this.state.comboMultiplier = Math.min(4, 1 + Math.floor(this.state.comboStreak / 5) * 0.25);
      this.state.comboTimeRemaining = this.level.mastery.comboTimeoutSeconds;
      this.state.score += Math.round(event.points * this.state.comboMultiplier * (this.state.fullOrbitActive ? 1.5 : 1));
      return;
    }
    if (event.type === 'EdgeCommitted') {
      this.state.score += flipBonus(event.rating);
      return;
    }
    if (event.type === 'FlipRated') {
      if (event.rating === 'perfect') this.state.perfectFlips += 1;
      if (event.rating === 'good') this.state.goodFlips += 1;
      return;
    }
    if (event.type === 'FaceEntered') {
      const before = this.state.orbitFaces.size;
      this.state.orbitFaces.add(event.face);
      if (this.state.orbitFaces.size > before) {
        this.state.orbitTier = Math.max(0, this.state.orbitFaces.size - 1);
        this.state.score += 150 * this.state.orbitTier;
      }
      if (!this.state.fullOrbitAchieved && this.state.orbitFaces.size >= this.level.mastery.fullOrbitFaces) {
        this.state.fullOrbitAchieved = true;
        this.state.fullOrbitActive = true;
        this.state.fullOrbitRemaining = this.level.mastery.overdriveSeconds;
        this.state.score += 1000;
      }
      return;
    }
    if (event.type === 'LifeLost') {
      this.state.livesLost += 1;
      this.resetCombo();
      this.state.orbitFaces = new Set<FaceId>([event.face]);
      this.state.orbitTier = 0;
      this.state.fullOrbitActive = false;
      this.state.fullOrbitRemaining = 0;
      return;
    }
    if (event.type === 'ChainTriggered') this.state.score += 250;
    if (event.type === 'GeneratorDestroyed') this.state.score += 300;
    if (event.type === 'CoreDestroyed') this.state.score += 1200;
  }

  private resetCombo(): void {
    this.state.comboStreak = 0;
    this.state.comboMultiplier = 1;
    this.state.comboTimeRemaining = 0;
  }
}

function flipBonus(rating: FlipRating): number {
  if (rating === 'perfect') return 500;
  if (rating === 'good') return 180;
  return 40;
}
