import './style.css';
import { AudioDirector } from './audio/AudioDirector';
import { APP_CONFIG } from './core/config';
import { GameLoop } from './core/GameLoop';
import { levelFromLocation, levelUrl, nextLevel } from './data/levels';
import { DebugPanel } from './debug/DebugPanel';
import { BreakoutSimulation } from './gameplay/BreakoutSimulation';
import { GameplayEventBus } from './gameplay/GameplayEvents';
import { MasterySystem } from './gameplay/MasterySystem';
import { evaluateStars } from './gameplay/Scoring';
import { SpatialRuntime } from './gameplay/SpatialRuntime';
import { InputController } from './input/InputController';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import { CameraDirector } from './rendering/CameraDirector';
import { GameScene } from './rendering/GameScene';
import { QualityManager } from './rendering/QualityManager';
import { JuiceDirector } from './vfx/JuiceDirector';
import { VfxDirector } from './vfx/VfxDirector';

registerServiceWorker();

const level = levelFromLocation(window.location.search);
const followingLevel = nextLevel(level);
document.title = `Breakout3D · ${level.displayName}`;

const container = document.querySelector<HTMLElement>('#game');
const status = document.querySelector<HTMLElement>('#status');
const inspectButton = document.querySelector<HTMLButtonElement>('#inspect');
const soundButton = document.querySelector<HTMLButtonElement>('#sound');
const hapticsButton = document.querySelector<HTMLButtonElement>('#haptics');
const results = document.querySelector<HTMLElement>('#results');
const resultKicker = document.querySelector<HTMLElement>('#result-kicker');
const resultTitle = document.querySelector<HTMLElement>('#result-title');
const resultStars = document.querySelector<HTMLElement>('#result-stars');
const resultDetails = document.querySelector<HTMLElement>('#result-details');
const retryButton = document.querySelector<HTMLButtonElement>('#retry');
if (!container || !status || !inspectButton || !soundButton || !hapticsButton || !results || !resultKicker || !resultTitle || !resultStars || !resultDetails || !retryButton) {
  throw new Error('Missing required app container');
}

resultKicker.textContent = `${level.body.type.toUpperCase()} · ${level.displayName.toUpperCase()}`;

const eventBus = new GameplayEventBus();
const simulation = new BreakoutSimulation(APP_CONFIG.gameplay, level, eventBus);
const mastery = new MasterySystem(level, eventBus);
const spatial = new SpatialRuntime(simulation, APP_CONFIG.gameplay, eventBus);
const scene = new GameScene(container, simulation.state, level);
const quality = new QualityManager();
quality.apply(scene);
const cameraDirector = new CameraDirector(scene);
const juice = new JuiceDirector(mastery, eventBus);
const vfx = new VfxDirector(scene.getBodyRoot(), eventBus, (blockId) => scene.getBlockBodyPosition(blockId));
const audio = new AudioDirector(eventBus);
const input = new InputController();
let collisionOverlayVisible = false;

audio.arm();
updateSettingsButtons();
cameraDirector.snap(spatial.getPresentationState());

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
    const rawJuice = juice.getSnapshot();
    quality.update(frameDeltaSeconds, scene);
    const visualJuice = quality.visualJuice(rawJuice);
    vfx.update(frameDeltaSeconds, visualJuice);
    scene.sync(simulation.state, alpha, presentation, visualJuice, frameDeltaSeconds);
    cameraDirector.update(presentation, frameDeltaSeconds, rawJuice);
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
  onQualityCycle() {
    quality.cycleOverride(scene);
    cameraDirector.snap(spatial.getPresentationState());
  },
  getQualityLabel() {
    const metrics = quality.metrics();
    const source = metrics.override ? 'manual' : 'auto';
    return `${metrics.tier}/${source} ${metrics.averageFrameMs.toFixed(1)}ms worst ${metrics.worstFrameMs.toFixed(1)}ms`;
  },
});

inspectButton.addEventListener('click', () => {
  if (spatial.phase === 'INSPECT') scene.resetInspect();
  spatial.requestInspectToggle();
});
soundButton.addEventListener('click', () => { audio.toggleEnabled(); updateSettingsButtons(); });
hapticsButton.addEventListener('click', () => { audio.toggleHaptics(); updateSettingsButtons(); });
retryButton.addEventListener('click', () => {
  if (spatial.phase === 'RESULTS' && followingLevel) {
    window.location.assign(levelUrl(followingLevel));
    return;
  }
  resetRun();
});
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'i' && !inspectButton.disabled) {
    if (spatial.phase === 'INSPECT') scene.resetInspect();
    spatial.requestInspectToggle();
  }
});
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => requestAnimationFrame(handleResize));
window.addEventListener('visibilitychange', () => loop.resetClock());
scene.renderer.setAnimationLoop((timestampMs) => loop.frame(timestampMs));

function handleResize(): void {
  quality.apply(scene);
  cameraDirector.snap(spatial.getPresentationState());
}

function resetRun(): void {
  simulation.restart();
  spatial.reset();
  mastery.reset(level.startFace);
  scene.resetInspect();
  scene.resetPresentation();
  cameraDirector.snap(spatial.getPresentationState());
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
    retryButton.textContent = 'Nochmal spielen';
    return;
  }

  const summary = mastery.summary(true, simulation.state.elapsedSeconds);
  const result = evaluateStars(summary, level.scoring);
  resultTitle.textContent = 'Core zerlegt';
  resultStars.textContent = `${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}`;
  resultDetails.textContent = `${simulation.state.elapsedSeconds.toFixed(1)} s · ${mastery.state.score} Punkte · Combo ${mastery.state.comboPeak} · Orbit ${mastery.state.orbitTier}`;
  retryButton.textContent = followingLevel ? `Weiter: ${followingLevel.displayName}` : 'Nochmal spielen';
}

function statusText(edgeWindowProgress: number): string {
  const state = simulation.state;
  const masteryState = mastery.state;
  if (spatial.phase === 'EDGE_WINDOW') return `Swipe · Timing ${Math.round(edgeWindowProgress * 100)}% · x${masteryState.comboMultiplier.toFixed(2)}`;
  if (spatial.phase === 'EDGE_RIDE') return `FLIP · ${spatial.activeFace.toUpperCase()} · Combo ${masteryState.comboStreak}`;
  if (spatial.phase === 'INSPECT') return `Inspect · ${spatial.activeFace.toUpperCase()} · Orbit ${masteryState.orbitTier}`;
  if (spatial.phase === 'CORE_KILL') return `CORE COLLAPSE · ${Math.round(spatial.getPresentationState().coreKillProgress * 100)}%`;
  if (spatial.phase === 'RESULTS') return `${level.displayName} · Complete`;
  if (spatial.phase === 'GAME_OVER') return `Game Over · ${masteryState.score} pts`;
  const overdrive = masteryState.fullOrbitActive ? ` · OVERDRIVE ${masteryState.fullOrbitRemaining.toFixed(1)}s` : '';
  return `${level.displayName} · ${spatial.activeFace.toUpperCase()} · ${state.lives} Leben · ${masteryState.score} · Combo ${masteryState.comboStreak} · Orbit ${masteryState.orbitTier}${overdrive}`;
}
