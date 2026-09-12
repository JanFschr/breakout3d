import './style.css';
import { APP_CONFIG } from './core/config';
import { GameLoop } from './core/GameLoop';
import { DebugPanel } from './debug/DebugPanel';
import { BreakoutSimulation } from './gameplay/BreakoutSimulation';
import { InputController } from './input/InputController';
import { GameScene } from './rendering/GameScene';

const container = document.querySelector<HTMLElement>('#game');
const status = document.querySelector<HTMLElement>('#status');
if (!container || !status) throw new Error('Missing required app container');

const simulation = new BreakoutSimulation(APP_CONFIG.gameplay);
const scene = new GameScene(container, simulation.state);
const input = new InputController();
let collisionOverlayVisible = false;
let lifeLostTimer = 0;

const loop = new GameLoop({
  simulate(dtSeconds) {
    const controls = input.consumeSnapshot();
    const pointerDeltaWorld =
      (controls.pointerDeltaPixels / Math.max(1, window.innerWidth)) *
      APP_CONFIG.gameplay.fieldWidth *
      APP_CONFIG.gameplay.paddleSensitivity;

    simulation.setPaddleInput(pointerDeltaWorld, controls.keyboardAxis, dtSeconds);
    simulation.update(dtSeconds);

    if (simulation.state.phase === 'life-lost') {
      lifeLostTimer += dtSeconds;
      if (lifeLostTimer >= 0.7) {
        lifeLostTimer = 0;
        simulation.resumeAfterLifeLoss();
      }
    } else {
      lifeLostTimer = 0;
    }
  },
  render(alpha, frameDeltaSeconds) {
    scene.sync(simulation.state, alpha);
    if (collisionOverlayVisible) scene.setDebugCollisionVisible(true, simulation.state);
    scene.render();
    status.textContent = statusText();
    debug.update(frameDeltaSeconds, loop.getMetrics());
  },
});

const debug = new DebugPanel(loop, simulation, {
  onCollisionOverlayChanged(visible) {
    collisionOverlayVisible = visible;
    scene.setDebugCollisionVisible(visible, simulation.state);
  },
  onRestart() {
    simulation.restart();
  },
});

window.addEventListener('resize', () => scene.resize());
window.addEventListener('visibilitychange', () => loop.resetClock());
scene.renderer.setAnimationLoop((timestampMs) => loop.frame(timestampMs));

function statusText(): string {
  const state = simulation.state;
  if (state.phase === 'game-over') return `Game Over · Score ${state.score} · Reload/Debug Restart`;
  if (state.phase === 'cleared') return `Clear · ${state.elapsedSeconds.toFixed(1)}s · Score ${state.score}`;
  if (state.phase === 'life-lost') return `Ball verloren · ${state.lives} Leben`;
  return `${state.lives} Leben · Score ${state.score}`;
}
