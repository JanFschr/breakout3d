import './style.css';
import { GameLoop } from './core/GameLoop';
import { GameScene } from './rendering/GameScene';
import { InputController } from './input/InputController';

const container = document.querySelector<HTMLElement>('#game');
if (!container) throw new Error('Missing #game container');

const gameScene = new GameScene(container);
const input = new InputController();
let simulationTime = 0;

const loop = new GameLoop({
  simulate(dtSeconds) {
    simulationTime += dtSeconds;
    const controls = input.snapshot();

    if (controls.pointerX !== null) {
      gameScene.paddle.position.x = clamp((controls.pointerX / window.innerWidth - 0.5) * 14, -6, 6);
    } else if (controls.keyboardAxis !== 0) {
      gameScene.paddle.position.x = clamp(
        gameScene.paddle.position.x + controls.keyboardAxis * 8 * dtSeconds,
        -6,
        6,
      );
    }
  },
  render() {
    gameScene.ball.position.y = 0.65 + Math.abs(Math.sin(simulationTime * 2.2)) * 0.8;
    gameScene.ball.rotation.x = simulationTime * 2;
    gameScene.render();
  },
});

window.addEventListener('resize', () => gameScene.resize());
window.addEventListener('visibilitychange', () => loop.resetClock());
gameScene.renderer.setAnimationLoop((timestampMs) => loop.frame(timestampMs));

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
