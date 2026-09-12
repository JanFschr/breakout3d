import './style.css';
import { AudioDirector } from './audio/AudioDirector';
import { APP_CONFIG } from './core/config';
import { GameLoop } from './core/GameLoop';
import { REACTOR_GARDEN_LEVEL } from './data/levels/reactorGarden';
import { DebugPanel } from './debug/DebugPanel';
import { BreakoutSimulation } from './gameplay/BreakoutSimulation';
import { GameplayEventBus } from './gameplay/GameplayEvents';
import { MasterySystem } from './gameplay/MasterySystem';
import { evaluateStars } from './gameplay/Scoring';
import { SpatialRuntime, type SpatialPresentationState } from './gameplay/SpatialRuntime';
import { InputController } from './input/InputController';
import { GameScene } from './rendering/GameScene';
import { JuiceDirector } from './vfx/JuiceDirector';
import { VfxDirector } from './vfx/VfxDirector';

const FACE_SIZE = 14;
const FACE_HALF_SIZE = FACE_SIZE / 2;
const CUBE_BOUNDING_RADIUS = Math.sqrt(3) * FACE_HALF_SIZE;
const GAMEPLAY_FRAME_MARGIN = 1.12;
const WHOLE_BODY_FRAME_MARGIN = 1.08;

const container = document.querySelector<HTMLElement>('#game');
const status = document.querySelector<HTMLElement>('#status');
const inspectButton = document.querySelector<HTMLButtonElement>('#inspect');
const soundButton = document.querySelector<HTMLButtonElement>('#sound');
const hapticsButton = document.querySelector<HTMLButtonElement>('#haptics');
const results = document.querySelector<HTMLElement>('#results');
const resultTitle = document.querySelector<HTMLElement>('#result-title');
const resultStars = document.querySelector<HTMLElement>('#result-stars');
const resultDetails = document.querySelector<HTMLElement>('#result-details');
const retryButton = document.querySelector<HTMLButtonElement>('#retry');
if (!container || !status || !inspectButton || !soundButton || !hapticsButton || !results || !resultTitle || !resultStars || !resultDetails || !retryButton) {
  throw new Error('Missing required app container');
}

const eventBus = new GameplayEventBus();
const simulation = new BreakoutSimulation(APP_CONFIG.gameplay, REACTOR_GARDEN_LEVEL, eventBus);
const mastery = new MasterySystem(REACTOR_GARDEN_LEVEL, eventBus);
const spatial = new SpatialRuntime(simulation, APP_CONFIG.gameplay, eventBus);
const scene = new GameScene(container, simulation.state);
const juice = new JuiceDirector(mastery, eventBus);
const vfx = new VfxDirector(scene.getBodyRoot(), eventBus, (blockId) => scene.getBlockBodyPosition(blockId));
const audio = new AudioDirector(eventBus);
const input = new InputController();
let collisionOverlayVisible = false;

audio.arm();
updateSettingsButtons();

const loop = new GameLoop({
  simulate(dtSeconds) {
    const controls = input.consumeSnapshot();
    spatial.update(dtSeconds, controls);
    mastery.update(dtSeconds);
    juice.update(dtSeconds);
    audio.update(juice.getSnapshot().audio);
    if (spatial.phase === 'INSPECT') scene.applyInspectDrag(controls.gestureDeltaX, controls.gestureDeltaY);
  },
  render(alpha, frameDeltaSeconds) {
    const presentation = spatial.getPresentationState();
    const juiceSnapshot = juice.getSnapshot();
    vfx.update(frameDeltaSeconds, juiceSnapshot);
    scene.sync(simulation.state, alpha, presentation, juiceSnapshot, frameDeltaSeconds);
    applyResponsiveCameraFraming(presentation);
    if (collisionOverlayVisible) scene.setDebugCollisionVisible(true, simulation.state);
    scene.render();
    status.textContent = statusText(presentation.edgeWindowProgress);
    inspectButton.setAttribute('aria-pressed', String(spatial.phase === 'INSPECT'));
    inspectButton.textContent = spatial.phase === 'INSPECT' ? 'Resume' : 'Inspect';
    inspectButton.disabled = spatial.phase === 'CORE_KILL' || spatial.phase === 'RESULTS' || spatial.phase === 'GAME_OVER';
    updateResults();
    debug.update(frameDeltaSeconds, loop.getMetrics());
  },
});

const debug = new DebugPanel(loop, simulation, {
  onCollisionOverlayChanged(visible) {
    collisionOverlayVisible = visible;
    scene.setDebugCollisionVisible(visible, simulation.state);
  },
  onRestart: resetRun,
});

inspectButton.addEventListener('click', () => {
  if (spatial.phase === 'INSPECT') scene.resetInspect();
  spatial.requestInspectToggle();
});
soundButton.addEventListener('click', () => { audio.toggleEnabled(); updateSettingsButtons(); });
hapticsButton.addEventListener('click', () => { audio.toggleHaptics(); updateSettingsButtons(); });
retryButton.addEventListener('click', resetRun);
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'i' && !inspectButton.disabled) {
    if (spatial.phase === 'INSPECT') scene.resetInspect();
    spatial.requestInspectToggle();
  }
});
window.addEventListener('resize', () => scene.resize());
window.addEventListener('orientationchange', () => requestAnimationFrame(() => scene.resize()));
window.addEventListener('visibilitychange', () => loop.resetClock());
scene.renderer.setAnimationLoop((timestampMs) => loop.frame(timestampMs));

function resetRun(): void {
  simulation.restart();
  spatial.reset();
  mastery.reset(REACTOR_GARDEN_LEVEL.startFace);
  scene.resetInspect();
  scene.resetPresentation();
  results.hidden = true;
}

function updateSettingsButtons(): void {
  soundButton.setAttribute('aria-pressed', String(audio.isEnabled()));
  soundButton.textContent = audio.isEnabled() ? 'Sound' : 'Muted';
  hapticsButton.setAttribute('aria-pressed', String(audio.isHapticsEnabled()));
  hapticsButton.textContent = audio.isHapticsEnabled() ? 'Haptic' : 'No Haptic';
}

function updateResults(): void {
  const show = spatial.phase === 'RESULTS' || spatial.phase === 'GAME_OVER';
  results.hidden = !show;
  if (!show) return;

  if (spatial.phase === 'GAME_OVER') {
    resultTitle.textContent = 'Run beendet';
    resultStars.textContent = '☆☆☆';
    resultDetails.textContent = `${mastery.state.score} Punkte · Combo ${mastery.state.comboPeak}`;
    return;
  }

  const summary = mastery.summary(true, simulation.state.elapsedSeconds);
  const result = evaluateStars(summary, REACTOR_GARDEN_LEVEL.scoring);
  resultTitle.textContent = 'Core zerlegt';
  resultStars.textContent = `${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}`;
  resultDetails.textContent = `${simulation.state.elapsedSeconds.toFixed(1)} s · ${mastery.state.score} Punkte · Combo ${mastery.state.comboPeak} · Orbit ${mastery.state.orbitTier}`;
}

function statusText(edgeWindowProgress: number): string {
  const state = simulation.state;
  const masteryState = mastery.state;
  if (spatial.phase === 'EDGE_WINDOW') return `Swipe · Timing ${Math.round(edgeWindowProgress * 100)}% · x${masteryState.comboMultiplier.toFixed(2)}`;
  if (spatial.phase === 'EDGE_RIDE') return `FLIP · ${spatial.activeFace.toUpperCase()} · Combo ${masteryState.comboStreak}`;
  if (spatial.phase === 'INSPECT') return `Inspect · ${spatial.activeFace.toUpperCase()} · Orbit ${masteryState.orbitTier}`;
  if (spatial.phase === 'CORE_KILL') return `CORE COLLAPSE · ${Math.round(spatial.getPresentationState().coreKillProgress * 100)}%`;
  if (spatial.phase === 'RESULTS') return `${REACTOR_GARDEN_LEVEL.displayName} · Complete`;
  if (spatial.phase === 'GAME_OVER') return `Game Over · ${masteryState.score} pts`;
  const overdrive = masteryState.fullOrbitActive ? ` · OVERDRIVE ${masteryState.fullOrbitRemaining.toFixed(1)}s` : '';
  return `${spatial.activeFace.toUpperCase()} · ${state.lives} Leben · ${masteryState.score} · Combo ${masteryState.comboStreak} · Orbit ${masteryState.orbitTier}${overdrive}`;
}

/**
 * Keep the active square face readable on narrow portrait viewports and pull
 * farther back whenever the whole cube must remain visible. The original
 * fixed z=26 camera only works around landscape/desktop aspect ratios.
 */
function applyResponsiveCameraFraming(presentation: SpatialPresentationState): void {
  const camera = scene.camera;
  const verticalHalfFov = camera.fov * Math.PI / 360;
  const tanVertical = Math.tan(verticalHalfFov);
  const tanHorizontal = tanVertical * Math.max(camera.aspect, 0.01);

  const facePlaneDistance = Math.max(
    FACE_HALF_SIZE / tanVertical,
    FACE_HALF_SIZE / tanHorizontal,
  ) * GAMEPLAY_FRAME_MARGIN;
  const gameplayZ = FACE_HALF_SIZE + facePlaneDistance;

  const limitingHalfAngle = Math.atan(Math.min(tanVertical, tanHorizontal));
  const wholeBodyZ = CUBE_BOUNDING_RADIUS / Math.max(Math.sin(limitingHalfAngle), 0.01) * WHOLE_BODY_FRAME_MARGIN;

  let targetZ = gameplayZ;
  if (presentation.phase === 'INSPECT' || presentation.phase === 'RESULTS') {
    targetZ = wholeBodyZ;
  } else if (presentation.phase === 'CORE_KILL') {
    targetZ = wholeBodyZ + Math.sin(presentation.coreKillProgress * Math.PI) * FACE_SIZE * 0.18;
  } else if (presentation.phase === 'EDGE_RIDE' && presentation.ride) {
    const reveal = Math.sin(presentation.ride.progress * Math.PI);
    targetZ = gameplayZ + (wholeBodyZ - gameplayZ) * reveal * 0.72;
  }

  camera.position.z = targetZ;
  camera.far = Math.max(180, wholeBodyZ + FACE_SIZE * 4);
  camera.updateProjectionMatrix();
  camera.lookAt(0, 0, 0);

  const fog = scene.scene.fog;
  if (fog && 'near' in fog && 'far' in fog) {
    fog.near = Math.max(8, targetZ - FACE_SIZE * 0.42);
    fog.far = targetZ + FACE_SIZE * 2.5;
  }
}
