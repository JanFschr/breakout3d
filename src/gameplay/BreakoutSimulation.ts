import type { GameplayTuning } from '../core/config';
import { expandedAabb, sweepPointAgainstAabb } from '../physics/Sweep';
import type { FaceEdge } from '../world/FaceGraph';
import type { BlockState, BreakoutState, Vec2 } from './contracts';

interface CollisionCandidate {
  readonly time: number;
  readonly normal: Vec2;
  readonly kind: 'wall' | 'edge' | 'paddle' | 'block';
  readonly edge?: FaceEdge;
  readonly block?: BlockState;
}

export interface PendingEdgeHit {
  readonly edge: FaceEdge;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly normal: Vec2;
}

export class BreakoutSimulation {
  readonly state: BreakoutState;
  private pendingPaddleDelta = 0;
  private edgeTransitionsEnabled = false;
  private pendingEdgeHit: PendingEdgeHit | null = null;
  private lifeLostElapsed = 0;

  constructor(private readonly tuning: GameplayTuning) {
    this.state = this.createInitialState();
  }

  setEdgeTransitionsEnabled(enabled: boolean): void {
    this.edgeTransitionsEnabled = enabled;
  }

  setPaddleInput(pointerDeltaWorld: number, keyboardAxis: -1 | 0 | 1, dtSeconds: number): void {
    this.pendingPaddleDelta += pointerDeltaWorld;
    if (keyboardAxis !== 0) this.pendingPaddleDelta += keyboardAxis * this.tuning.paddleKeyboardSpeed * dtSeconds;
  }

  update(dtSeconds: number): void {
    this.updatePaddle(dtSeconds);
    if (this.state.phase === 'ready') {
      this.serveBall();
      return;
    }
    if (this.state.phase === 'life-lost') {
      this.lifeLostElapsed += dtSeconds;
      if (this.lifeLostElapsed >= 0.7) {
        this.lifeLostElapsed = 0;
        this.resumeAfterLifeLoss();
      }
      return;
    }
    if (this.state.phase !== 'playing' || this.pendingEdgeHit) return;

    this.state.elapsedSeconds += dtSeconds;
    this.state.ball.previousPosition = { ...this.state.ball.position };
    this.stepBall(dtSeconds);

    if (this.state.ball.position.y < -this.state.ball.radius - 0.2) this.loseLife();
    if (this.state.blocks.every((block) => block.destroyed)) this.state.phase = 'cleared';
  }

  consumePendingEdgeHit(): PendingEdgeHit | null {
    return this.pendingEdgeHit;
  }

  rejectPendingEdge(): void {
    if (!this.pendingEdgeHit) return;
    reflect(this.state.ball.velocity, this.pendingEdgeHit.normal);
    this.state.ball.position.x += this.pendingEdgeHit.normal.x * 1e-3;
    this.state.ball.position.y += this.pendingEdgeHit.normal.y * 1e-3;
    this.pendingEdgeHit = null;
  }

  completePendingEdge(position: Vec2, velocity: Vec2): void {
    this.state.ball.position = { ...position };
    this.state.ball.previousPosition = { ...position };
    this.state.ball.velocity = { ...velocity };
    this.pendingEdgeHit = null;
  }

  restart(): void {
    const next = this.createInitialState();
    Object.assign(this.state, next);
    this.pendingEdgeHit = null;
    this.lifeLostElapsed = 0;
  }

  resumeAfterLifeLoss(): void {
    if (this.state.phase !== 'life-lost') return;
    this.resetBallAndPaddle();
    this.state.phase = 'ready';
  }

  private createInitialState(): BreakoutState {
    const paddle = {
      x: 0,
      previousX: 0,
      velocityX: 0,
      y: this.tuning.paddleY,
      width: this.tuning.paddleWidth,
      height: this.tuning.paddleHeight,
    };
    return {
      ball: {
        position: { x: 0, y: paddle.y + 0.8 },
        previousPosition: { x: 0, y: paddle.y + 0.8 },
        velocity: { x: 0, y: 0 },
        radius: this.tuning.ballRadius,
      },
      paddle,
      blocks: createBlocks(),
      phase: 'ready',
      lives: this.tuning.lives,
      score: 0,
      elapsedSeconds: 0,
    };
  }

  private serveBall(): void {
    const speed = this.tuning.ballBaseSpeed;
    const direction = normalize({ x: 0.38, y: 1 });
    this.state.ball.velocity = { x: direction.x * speed, y: direction.y * speed };
    this.state.phase = 'playing';
  }

  private resetBallAndPaddle(): void {
    this.state.paddle.x = 0;
    this.state.paddle.previousX = 0;
    this.state.paddle.velocityX = 0;
    this.state.ball.position = { x: 0, y: this.state.paddle.y + 0.8 };
    this.state.ball.previousPosition = { ...this.state.ball.position };
    this.state.ball.velocity = { x: 0, y: 0 };
  }

  private updatePaddle(dtSeconds: number): void {
    const paddle = this.state.paddle;
    paddle.previousX = paddle.x;
    const half = paddle.width / 2;
    paddle.x = clamp(
      paddle.x + this.pendingPaddleDelta,
      -this.tuning.fieldWidth / 2 + half,
      this.tuning.fieldWidth / 2 - half,
    );
    paddle.velocityX = dtSeconds > 0 ? (paddle.x - paddle.previousX) / dtSeconds : 0;
    this.pendingPaddleDelta = 0;
  }

  private stepBall(dtSeconds: number): void {
    const ball = this.state.ball;
    let remaining = dtSeconds;

    for (let iteration = 0; iteration < 6 && remaining > 1e-6; iteration += 1) {
      const collision = this.findEarliestCollision(remaining);
      if (!collision) {
        ball.position.x += ball.velocity.x * remaining;
        ball.position.y += ball.velocity.y * remaining;
        break;
      }

      ball.position.x += ball.velocity.x * collision.time;
      ball.position.y += ball.velocity.y * collision.time;
      remaining -= collision.time;

      if (collision.kind === 'edge' && collision.edge) {
        this.pendingEdgeHit = {
          edge: collision.edge,
          position: { ...ball.position },
          velocity: { ...ball.velocity },
          normal: collision.normal,
        };
        return;
      }

      if (collision.kind === 'paddle') this.applyPaddleBounce();
      else reflect(ball.velocity, collision.normal);

      if (collision.kind === 'block' && collision.block && !collision.block.destroyed) {
        collision.block.hitPoints -= 1;
        if (collision.block.hitPoints <= 0) {
          collision.block.destroyed = true;
          this.state.score += 100;
        } else {
          this.state.score += 25;
        }
      }

      ball.position.x += collision.normal.x * 1e-4;
      ball.position.y += collision.normal.y * 1e-4;
      remaining = Math.max(0, remaining - 1e-5);
    }

    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    if (speed > this.tuning.ballMaxSpeed) {
      const scale = this.tuning.ballMaxSpeed / speed;
      ball.velocity.x *= scale;
      ball.velocity.y *= scale;
    }
  }

  private findEarliestCollision(maxTime: number): CollisionCandidate | null {
    const { ball, paddle } = this.state;
    let best: CollisionCandidate | null = null;
    const halfWidth = this.tuning.fieldWidth / 2;
    const top = this.tuning.fieldHeight;

    if (ball.velocity.x < 0) {
      const time = (-halfWidth + ball.radius - ball.position.x) / ball.velocity.x;
      if (time >= 0 && time <= maxTime) best = earlier(best, { time, normal: { x: 1, y: 0 }, kind: this.edgeTransitionsEnabled ? 'edge' : 'wall', edge: 'left' });
    }
    if (ball.velocity.x > 0) {
      const time = (halfWidth - ball.radius - ball.position.x) / ball.velocity.x;
      if (time >= 0 && time <= maxTime) best = earlier(best, { time, normal: { x: -1, y: 0 }, kind: this.edgeTransitionsEnabled ? 'edge' : 'wall', edge: 'right' });
    }
    if (ball.velocity.y > 0) {
      const time = (top - ball.radius - ball.position.y) / ball.velocity.y;
      if (time >= 0 && time <= maxTime) best = earlier(best, { time, normal: { x: 0, y: -1 }, kind: this.edgeTransitionsEnabled ? 'edge' : 'wall', edge: 'top' });
    }

    if (ball.velocity.y < 0) {
      const paddleHit = sweepPointAgainstAabb(
        ball.position,
        ball.velocity,
        maxTime,
        expandedAabb({ x: paddle.x, y: paddle.y }, paddle.width, paddle.height, ball.radius),
      );
      if (paddleHit) best = earlier(best, { ...paddleHit, kind: 'paddle' });
    }

    for (const block of this.state.blocks) {
      if (block.destroyed) continue;
      const hit = sweepPointAgainstAabb(
        ball.position,
        ball.velocity,
        maxTime,
        expandedAabb(block.position, block.width, block.height, ball.radius),
      );
      if (hit) best = earlier(best, { ...hit, kind: 'block', block });
    }

    return best;
  }

  private applyPaddleBounce(): void {
    const { ball, paddle } = this.state;
    const hitOffset = clamp((ball.position.x - paddle.x) / (paddle.width / 2), -1, 1);
    const speed = clamp(Math.hypot(ball.velocity.x, ball.velocity.y) * 1.015, this.tuning.ballBaseSpeed, this.tuning.ballMaxSpeed);
    const horizontal = clamp(hitOffset * 0.82 + paddle.velocityX * this.tuning.paddleMotionInfluence / speed, -0.92, 0.92);
    const vertical = Math.sqrt(Math.max(0.08, 1 - horizontal * horizontal));
    ball.velocity.x = horizontal * speed;
    ball.velocity.y = Math.abs(vertical * speed);
  }

  private loseLife(): void {
    this.state.lives -= 1;
    if (this.state.lives <= 0) {
      this.state.phase = 'game-over';
      return;
    }
    this.state.phase = 'life-lost';
  }
}

function createBlocks(): BlockState[] {
  const blocks: BlockState[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      blocks.push({
        id: `normal-${row}-${column}`,
        position: { x: (column - 3) * 1.8, y: 11 + row * 1.05 },
        width: 1.55,
        height: 0.62,
        hitPoints: 1,
        maxHitPoints: 1,
        destroyed: false,
      });
    }
  }
  return blocks;
}

function reflect(velocity: Vec2, normal: Vec2): void {
  const dot = velocity.x * normal.x + velocity.y * normal.y;
  velocity.x -= 2 * dot * normal.x;
  velocity.y -= 2 * dot * normal.y;
}

function normalize(value: Vec2): Vec2 {
  const length = Math.hypot(value.x, value.y) || 1;
  return { x: value.x / length, y: value.y / length };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function earlier(current: CollisionCandidate | null, candidate: CollisionCandidate): CollisionCandidate {
  return current === null || candidate.time < current.time ? candidate : current;
}
