import type { GameplayEvent, GameplayEventBus, FlipRating } from '../gameplay/GameplayEvents';
import type { RuntimePhase } from '../gameplay/SpatialRuntime';
import type { QualityMetrics, QualityTier } from '../rendering/QualityManager';
import type { FaceId } from '../world/FaceGraph';

interface FaceDwellEntry {
  face: FaceId;
  seconds: number;
}

export interface PlaytestRunExport {
  readonly schemaVersion: 1;
  readonly levelId: string;
  readonly outcome: 'running' | 'clear' | 'fail';
  readonly elapsedSeconds: number;
  readonly lifeLosses: number;
  readonly faceOrder: FaceId[];
  readonly faceDwell: FaceDwellEntry[];
  readonly edgeWindowsShown: number;
  readonly edgeCommits: number;
  readonly edgeTimeouts: number;
  readonly flipRatings: Record<FlipRating, number>;
  readonly inspectEntries: number;
  readonly generatorDestroyedAtSeconds: number | null;
  readonly coreDestroyedAtSeconds: number | null;
  readonly armorHitsBeforeGenerator: number;
  readonly armorHitsAfterGenerator: number;
  readonly comboPeak: number;
  readonly orbitTierPeak: number;
  readonly score: number;
  readonly performance: {
    readonly averageFrameMs: number;
    readonly worstFrameMs: number;
    readonly finalQualityTier: QualityTier;
  };
  readonly device: {
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly devicePixelRatio: number;
    readonly hardwareConcurrency: number;
  };
}

interface UpdateInput {
  readonly frameDeltaSeconds: number;
  readonly phase: RuntimePhase;
  readonly activeFace: FaceId;
  readonly elapsedSeconds: number;
  readonly score: number;
  readonly comboPeak: number;
  readonly orbitTier: number;
  readonly quality: QualityMetrics;
}

const STORAGE_KEY = 'breakout3d.playtest.v1';

export class PlaytestMetrics {
  private readonly unsubscribe: () => void;
  private elapsedSeconds = 0;
  private outcome: PlaytestRunExport['outcome'] = 'running';
  private lifeLosses = 0;
  private readonly faceOrder: FaceId[] = [];
  private readonly faceDwell = new Map<FaceId, number>();
  private previousPhase: RuntimePhase = 'PLAY_FACE';
  private activeFace: FaceId;
  private edgeWindowsShown = 0;
  private edgeCommits = 0;
  private edgeTimeouts = 0;
  private committedCurrentWindow = false;
  private readonly flipRatings: Record<FlipRating, number> = { normal: 0, good: 0, perfect: 0 };
  private inspectEntries = 0;
  private generatorDestroyedAtSeconds: number | null = null;
  private coreDestroyedAtSeconds: number | null = null;
  private armorHitsBeforeGenerator = 0;
  private armorHitsAfterGenerator = 0;
  private comboPeak = 0;
  private orbitTierPeak = 0;
  private score = 0;
  private frameMsTotal = 0;
  private frameSamples = 0;
  private worstFrameMs = 0;
  private finalQualityTier: QualityTier = 'medium';
  private finished = false;

  constructor(
    private readonly enabled: boolean,
    private readonly levelId: string,
    startFace: FaceId,
    bus: GameplayEventBus,
  ) {
    this.activeFace = startFace;
    if (enabled) this.faceOrder.push(startFace);
    this.unsubscribe = bus.subscribe((event) => this.onEvent(event));
  }

  update(input: UpdateInput): void {
    if (!this.enabled || this.finished) return;
    this.elapsedSeconds = input.elapsedSeconds;
    this.score = input.score;
    this.comboPeak = Math.max(this.comboPeak, input.comboPeak);
    this.orbitTierPeak = Math.max(this.orbitTierPeak, input.orbitTier);
    this.finalQualityTier = input.quality.tier;

    const frameMs = Math.min(input.frameDeltaSeconds * 1000, 100);
    this.frameMsTotal += frameMs;
    this.frameSamples += 1;
    this.worstFrameMs = Math.max(this.worstFrameMs, frameMs);
    this.faceDwell.set(input.activeFace, (this.faceDwell.get(input.activeFace) ?? 0) + input.frameDeltaSeconds);

    if (input.phase !== this.previousPhase) {
      if (input.phase === 'EDGE_WINDOW') {
        this.edgeWindowsShown += 1;
        this.committedCurrentWindow = false;
      }
      if (this.previousPhase === 'EDGE_WINDOW' && input.phase === 'PLAY_FACE' && !this.committedCurrentWindow) this.edgeTimeouts += 1;
      if (input.phase === 'INSPECT') this.inspectEntries += 1;
      this.previousPhase = input.phase;
    }

    if (input.activeFace !== this.activeFace) {
      this.activeFace = input.activeFace;
      this.faceOrder.push(input.activeFace);
    }
  }

  finish(outcome: 'clear' | 'fail'): void {
    if (!this.enabled || this.finished) return;
    this.outcome = outcome;
    this.finished = true;
    this.persist();
  }

  reset(startFace: FaceId): void {
    if (!this.enabled) return;
    this.elapsedSeconds = 0;
    this.outcome = 'running';
    this.lifeLosses = 0;
    this.faceOrder.length = 0;
    this.faceOrder.push(startFace);
    this.faceDwell.clear();
    this.previousPhase = 'PLAY_FACE';
    this.activeFace = startFace;
    this.edgeWindowsShown = 0;
    this.edgeCommits = 0;
    this.edgeTimeouts = 0;
    this.committedCurrentWindow = false;
    this.flipRatings.normal = 0;
    this.flipRatings.good = 0;
    this.flipRatings.perfect = 0;
    this.inspectEntries = 0;
    this.generatorDestroyedAtSeconds = null;
    this.coreDestroyedAtSeconds = null;
    this.armorHitsBeforeGenerator = 0;
    this.armorHitsAfterGenerator = 0;
    this.comboPeak = 0;
    this.orbitTierPeak = 0;
    this.score = 0;
    this.frameMsTotal = 0;
    this.frameSamples = 0;
    this.worstFrameMs = 0;
    this.finished = false;
  }

  snapshot(): PlaytestRunExport {
    return {
      schemaVersion: 1,
      levelId: this.levelId,
      outcome: this.outcome,
      elapsedSeconds: round(this.elapsedSeconds),
      lifeLosses: this.lifeLosses,
      faceOrder: [...this.faceOrder],
      faceDwell: [...this.faceDwell.entries()].map(([face, seconds]) => ({ face, seconds: round(seconds) })),
      edgeWindowsShown: this.edgeWindowsShown,
      edgeCommits: this.edgeCommits,
      edgeTimeouts: this.edgeTimeouts,
      flipRatings: { ...this.flipRatings },
      inspectEntries: this.inspectEntries,
      generatorDestroyedAtSeconds: nullableRound(this.generatorDestroyedAtSeconds),
      coreDestroyedAtSeconds: nullableRound(this.coreDestroyedAtSeconds),
      armorHitsBeforeGenerator: this.armorHitsBeforeGenerator,
      armorHitsAfterGenerator: this.armorHitsAfterGenerator,
      comboPeak: this.comboPeak,
      orbitTierPeak: this.orbitTierPeak,
      score: this.score,
      performance: {
        averageFrameMs: round(this.frameSamples > 0 ? this.frameMsTotal / this.frameSamples : 0),
        worstFrameMs: round(this.worstFrameMs),
        finalQualityTier: this.finalQualityTier,
      },
      device: {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
      },
    };
  }

  download(): void {
    if (!this.enabled) return;
    const text = JSON.stringify(this.snapshot(), null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `breakout3d-playtest-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async copy(): Promise<void> {
    if (!this.enabled || !navigator.clipboard) return;
    await navigator.clipboard.writeText(JSON.stringify(this.snapshot(), null, 2));
  }

  dispose(): void {
    this.unsubscribe();
  }

  private onEvent(event: GameplayEvent): void {
    if (!this.enabled || this.finished) return;
    if (event.type === 'LifeLost') this.lifeLosses += 1;
    if (event.type === 'EdgeCommitted') {
      this.edgeCommits += 1;
      this.committedCurrentWindow = true;
    }
    if (event.type === 'FlipRated') this.flipRatings[event.rating] += 1;
    if (event.type === 'GeneratorDestroyed' && this.generatorDestroyedAtSeconds === null) this.generatorDestroyedAtSeconds = this.elapsedSeconds;
    if (event.type === 'CoreDestroyed' && this.coreDestroyedAtSeconds === null) this.coreDestroyedAtSeconds = this.elapsedSeconds;
    if (event.type === 'BlockHit' && event.blockType === 'armor') {
      if (this.generatorDestroyedAtSeconds === null) this.armorHitsBeforeGenerator += 1;
      else this.armorHitsAfterGenerator += 1;
    }
  }

  private persist(): void {
    const snapshot = this.snapshot();
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      const parsed = existing ? JSON.parse(existing) as { best?: PlaytestRunExport } : {};
      const best = !parsed.best || snapshot.score > parsed.best.score ? snapshot : parsed.best;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ last: snapshot, best }));
    } catch {
      // Metrics are optional; storage failures must never affect gameplay.
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function nullableRound(value: number | null): number | null {
  return value === null ? null : round(value);
}
