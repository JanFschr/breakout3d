import type { GameLoop, GameLoopMetrics } from '../core/GameLoop';
import type { BreakoutSimulation } from '../gameplay/BreakoutSimulation';

export interface DebugPanelCallbacks {
  readonly onCollisionOverlayChanged: (visible: boolean) => void;
  readonly onRestart: () => void;
  readonly onQualityCycle: () => void;
  readonly getQualityLabel: () => string;
}

export class DebugPanel {
  private readonly root = document.createElement('aside');
  private readonly metricsNode = document.createElement('pre');
  private collisionVisible = false;
  private fps = 0;
  private frameSamples = 0;
  private frameTimeAccumulator = 0;

  constructor(
    private readonly loop: GameLoop,
    private readonly simulation: BreakoutSimulation,
    private readonly callbacks: DebugPanelCallbacks,
  ) {
    this.root.className = 'debug-panel';
    this.root.hidden = !new URLSearchParams(window.location.search).has('debug');
    this.root.innerHTML = '<strong>DEBUG</strong>';
    this.root.append(this.metricsNode);

    const pauseButton = button('Pause / Resume', () => this.loop.setPaused(!this.loop.isPaused()));
    const stepButton = button('Single step', () => this.loop.singleStep());
    const restartButton = button('Restart', callbacks.onRestart);
    const qualityButton = button('Cycle quality', callbacks.onQualityCycle);
    const collisionButton = button('Collision overlay', () => {
      this.collisionVisible = !this.collisionVisible;
      callbacks.onCollisionOverlayChanged(this.collisionVisible);
    });

    this.root.append(pauseButton, stepButton, restartButton, qualityButton, collisionButton);
    document.body.append(this.root);
  }

  update(frameDeltaSeconds: number, metrics: GameLoopMetrics): void {
    if (this.root.hidden) return;
    this.frameSamples += 1;
    this.frameTimeAccumulator += frameDeltaSeconds;
    if (this.frameTimeAccumulator >= 0.5) {
      this.fps = this.frameSamples / this.frameTimeAccumulator;
      this.frameSamples = 0;
      this.frameTimeAccumulator = 0;
    }

    const state = this.simulation.state;
    this.metricsNode.textContent = [
      `fps ${this.fps.toFixed(1)}`,
      `quality ${this.callbacks.getQualityLabel()}`,
      `steps ${metrics.simulationSteps}`,
      `drop ${(metrics.droppedSimulationSeconds * 1000).toFixed(2)}ms`,
      `phase ${state.phase}`,
      `lives ${state.lives}`,
      `score ${state.score}`,
      `ball ${state.ball.position.x.toFixed(2)}, ${state.ball.position.y.toFixed(2)}`,
      `speed ${Math.hypot(state.ball.velocity.x, state.ball.velocity.y).toFixed(2)}`,
    ].join('\n');
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}
