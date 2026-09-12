import './style.css';
import { APP_CONFIG } from './core/config';
import { GameLoop } from './core/GameLoop';
import { REACTOR_GARDEN_LEVEL } from './data/levels/reactorGarden';
import { DebugPanel } from './debug/DebugPanel';
import { BreakoutSimulation } from './gameplay/BreakoutSimulation';
import { GameplayEventBus } from './gameplay/GameplayEvents';
import { MasterySystem } from './gameplay/MasterySystem';
import { evaluateStars } from './gameplay/Scoring';
import { SpatialRuntime } from './gameplay/SpatialRuntime';
import { InputController } from './input/InputController';
import { GameScene } from './rendering/GameScene';

const container = document.querySelector<HTMLElement>('#game');
const status = document.querySelector<HTMLElement>('#status');
const inspectButton = document.querySelector<HTMLButtonElement>('#inspect');
if (!container || !status || !inspectButton) throw new Error('Missing required app container');

const eventBus = new GameplayEventBus();
const simulation = new BreakoutSimulation(APP_CONFIG.gameplay, REACTOR_GARDEN_LEVEL, eventBus);
const mastery = new MasterySystem(REACTOR_GARDEN_LEVEL, eventBus);
const spatial = new SpatialRuntime(simulation, APP_CONFIG.gameplay, eventBus);
const scene = new GameScene(container, simulation.state);
const input = new InputController();
let collisionOverlayVisible = false;

const loop = new GameLoop({
  simulate(dtSeconds) {
    const controls = input.consumeSnapshot();
    spatial.update(dtSeconds, controls);
    mastery.update(dtSeconds);
    if (spatial.phase === 'INSPECT') scene.applyInspectDrag(controls.gestureDeltaX, controls.gestureDeltaY);
  },
  render(alpha, frameDeltaSeconds) {
    const presentation = spatial.getPresentationState();
    scene.sync(simulation.state, alpha, presentation);
    if (collisionOverlayVisible) scene.setDebugCollisionVisible(true, simulation.state);
    scene.render();
    status.textContent = statusText(presentation.edgeWindowProgress);
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
  onRestart() {
    simulation.restart();
    spatial.reset();
    mastery.reset(REACTOR_GARDEN_LEVEL.startFace);
  },
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

function statusText(edgeWindowProgress: number): string {
  const state = simulation.state;
  const masteryState = mastery.state;
  if (spatial.phase === 'EDGE_WINDOW') return `Swipe · timing ${Math.round(edgeWindowProgress * 100)}% · x${masteryState.comboMultiplier.toFixed(2)}`;
  if (spatial.phase === 'EDGE_RIDE') return `FLIP · ${spatial.activeFace.toUpperCase()} · Combo ${masteryState.comboStreak}`;
  if (spatial.phase === 'INSPECT') return `Inspect · ${spatial.activeFace.toUpperCase()} · Orbit ${masteryState.orbitTier}`;
  if (spatial.phase === 'GAME_OVER') return `Game Over · ${masteryState.score} pts · Combo ${masteryState.comboPeak}`;
  if (spatial.phase === 'CLEARED') {
    const result = evaluateStars(mastery.summary(true, state.elapsedSeconds), REACTOR_GARDEN_LEVEL.scoring);
    return `${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)} · ${state.elapsedSeconds.toFixed(1)}s · ${masteryState.score} pts`;
  }
  const overdrive = masteryState.fullOrbitActive ? ` · OVERDRIVE ${masteryState.fullOrbitRemaining.toFixed(1)}s` : '';
  return `${spatial.activeFace.toUpperCase()} · ${state.lives} Leben · ${masteryState.score} · Combo ${masteryState.comboStreak} · Orbit ${masteryState.orbitTier}${overdrive}`;
}
