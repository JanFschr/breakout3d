export interface GameLoopCallbacks {
  simulate(dtSeconds: number): void;
  render(alpha: number, frameDeltaSeconds: number): void;
}

export interface GameLoopMetrics {
  readonly simulationSteps: number;
  readonly frameDeltaSeconds: number;
  readonly droppedSimulationSeconds: number;
}

export interface GameLoopOptions {
  readonly fixedStepSeconds?: number;
  readonly maxFrameDeltaSeconds?: number;
  readonly maxCatchUpSteps?: number;
}

export class GameLoop {
  readonly fixedStepSeconds: number;
  private readonly maxFrameDeltaSeconds: number;
  private readonly maxCatchUpSteps: number;
  private accumulatorSeconds = 0;
  private lastTimestampMs: number | null = null;
  private paused = false;
  private metrics: GameLoopMetrics = {
    simulationSteps: 0,
    frameDeltaSeconds: 0,
    droppedSimulationSeconds: 0,
  };

  constructor(
    private readonly callbacks: GameLoopCallbacks,
    options: GameLoopOptions = {},
  ) {
    this.fixedStepSeconds = options.fixedStepSeconds ?? 1 / 120;
    this.maxFrameDeltaSeconds = options.maxFrameDeltaSeconds ?? 0.1;
    this.maxCatchUpSteps = options.maxCatchUpSteps ?? 8;
  }

  frame(timestampMs: number): void {
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs;
      this.callbacks.render(0, 0);
      return;
    }

    const rawFrameDelta = Math.max(0, (timestampMs - this.lastTimestampMs) / 1000);
    this.lastTimestampMs = timestampMs;
    const frameDeltaSeconds = Math.min(rawFrameDelta, this.maxFrameDeltaSeconds);

    if (!this.paused) this.accumulatorSeconds += frameDeltaSeconds;

    let simulationSteps = 0;
    while (
      !this.paused &&
      this.accumulatorSeconds >= this.fixedStepSeconds &&
      simulationSteps < this.maxCatchUpSteps
    ) {
      this.callbacks.simulate(this.fixedStepSeconds);
      this.accumulatorSeconds -= this.fixedStepSeconds;
      simulationSteps += 1;
    }

    let droppedSimulationSeconds = 0;
    if (this.accumulatorSeconds >= this.fixedStepSeconds) {
      droppedSimulationSeconds = this.accumulatorSeconds;
      this.accumulatorSeconds = this.accumulatorSeconds % this.fixedStepSeconds;
    }

    const alpha = this.paused ? 0 : this.accumulatorSeconds / this.fixedStepSeconds;
    this.metrics = { simulationSteps, frameDeltaSeconds, droppedSimulationSeconds };
    this.callbacks.render(alpha, frameDeltaSeconds);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.accumulatorSeconds = 0;
  }

  isPaused(): boolean {
    return this.paused;
  }

  singleStep(): void {
    if (!this.paused) return;
    this.callbacks.simulate(this.fixedStepSeconds);
    this.metrics = {
      simulationSteps: 1,
      frameDeltaSeconds: 0,
      droppedSimulationSeconds: 0,
    };
    this.callbacks.render(0, 0);
  }

  resetClock(): void {
    this.lastTimestampMs = null;
    this.accumulatorSeconds = 0;
  }

  getMetrics(): GameLoopMetrics {
    return this.metrics;
  }
}
