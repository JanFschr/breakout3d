import './style.css';
import { GameScene } from './rendering/GameScene';
import { InputController } from './input/InputController';

const container = document.querySelector<HTMLElement>('#game');
if (!container) throw new Error('Missing #game container');

const gameScene = new GameScene(container);
const input = new InputController();
const clock = new THREEClockAdapter();

window.addEventListener('resize', () => gameScene.resize());

function frame(): void {
  const elapsed = clock.elapsedSeconds();
  const controls = input.snapshot();

  if (controls.pointerX !== null) {
    gameScene.paddle.position.x = clamp((controls.pointerX / window.innerWidth - 0.5) * 14, -6, 6);
  } else if (controls.keyboardAxis !== 0) {
    gameScene.paddle.position.x = clamp(gameScene.paddle.position.x + controls.keyboardAxis * 0.11, -6, 6);
  }

  gameScene.ball.position.y = 0.65 + Math.abs(Math.sin(elapsed * 2.2)) * 0.8;
  gameScene.ball.rotation.x = elapsed * 2;
  gameScene.render();
}

gameScene.renderer.setAnimationLoop(frame);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

class THREEClockAdapter {
  private readonly start = performance.now();

  elapsedSeconds(): number {
    return (performance.now() - this.start) / 1000;
  }
}
