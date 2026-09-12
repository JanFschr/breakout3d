import './style.css';
import { APP_CONFIG } from './core/config';
import { GameLoop } from './core/GameLoop';
import { REACTOR_GARDEN_LEVEL } from './data/levels/reactorGarden';
import { DebugPanel } from './debug/DebugPanel';
import { BreakoutSimulation } from './gameplay/BreakoutSimulation';
import { SpatialRuntime } from './gameplay/SpatialRuntime';
import { InputController } from './input/InputController';
import { GameScene } from './rendering/GameScene';

const container = document.querySelector<HTMLElement>('#game');
const status = document.querySelector<HTMLElement>('#status');
const inspectButton = document.querySelector<HTMLButtonElement>('#inspect');
if (!container || !status || !inspectButton) throw new Error('Missing required app container');

const simulation = new BreakoutSimulation(APP_CONFIG.gameplay, REACTOR_GARDEN_LEVEL);
const spatial = new SpatialRuntime(simulation, APP_CONFIG.gameplay);
const scene = new GameScene(container, simulation.state);
const input = new InputController();
let collisionOverlayVisible = false;

const loop = new GameLoop({
  simulate(dtSeconds) {
    const controls = input.consumeSnapshot();
    spatial.update(dtSeconds, controls);
    if (spatial.phase === 'INSPECT') scene.applyInspectDrag(controls.gestureDeltaX, controls.gestureDeltaY);
  },
  render(alpha, frameDeltaSeconds) {
    const presentation = spatial.getPresentationState();
    scene.sync(simulation.state, alpha, presentation);
    if (collisionOverlayVisible) scene.setDebugCollisionVisible(true, simulation.state);
    scene.render();
    status.textContent = statusText();
    inspectButton.setAttribute('aria-pressed', String(spatial.phase === 'INSPECT'));
    inspectButton.textContent = spatial.phase === 'INSPECT' ? 'Resume' : 'Inspect';
    debug.update(frameDeltaSeconds, loop.getMetrics());
  },
});

const debug = new DebugPanel(loop, simulation, {
  onCollisionOverlayChanged(visible) {
    collisionOverlayVisible = visible;
    scene.setDebugCollisionVisible(visible, simulation.state);
  },
  onRestart() { simulation.restart(); },
});

inspectButton.addEventListener('click', () => {
  if (spatial.phase === 'INSPECT') scene.resetInspect();
  spatial.requestInspectToggle();
});
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'i') {
    if (spatial.phase === 'INSPECT') scene.resetInspect();
    spatial.requestInspectToggle();
  }
});
window.addEventListener('resize', () => scene.resize());
window.addEventListener('visibilitychange', () => loop.resetClock());
scene.renderer.setAnimationLoop((timestampMs) => loop.frame(timestampMs));

function statusText(): string {
  const state = simulation.state;
  if (spatial.phase === 'EDGE_WINDOW') return `Swipe zur Kante · ${spatial.activeFace.toUpperCase()}`;
  if (spatial.phase === 'EDGE_RIDE') return `ROTATE · ${spatial.activeFace.toUpperCase()}`;
  if (spatial.phase === 'INSPECT') return `Inspect · ${spatial.activeFace.toUpperCase()}`;
  if (spatial.phase === 'GAME_OVER') return `Game Over · Score ${state.score}`;
  if (spatial.phase === 'CLEARED') return `Core down · ${state.elapsedSeconds.toFixed(1)}s · ${state.score}`;
  return `${REACTOR_GARDEN_LEVEL.displayName} · ${spatial.activeFace.toUpperCase()} · ${state.lives} Leben · ${state.score}`;
}
