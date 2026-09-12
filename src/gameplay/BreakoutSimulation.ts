import type { GameplayTuning } from '../core/config';
import type { LevelDefinition } from '../data/LevelDefinition';
import { assertValidLevel } from '../data/validateLevel';
import { expandedAabb, sweepPointAgainstAabb } from '../physics/Sweep';
import { FACE_IDS, type FaceEdge, type FaceId } from '../world/FaceGraph';
import { createBlockState, forceDestroyBlock, hitBlock } from './BlockRegistry';
import { DependencyEngine, type DependencyMutation } from './DependencyEngine';
import type { FlipRating, GameplayEventBus } from './GameplayEvents';
import type { BlockState, BreakoutState, FaceRuntimeState, Vec2 } from './contracts';

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
  private dependencyEngine: DependencyEngine;
  private nextHitDamageMultiplier = 1;

  constructor(
    private readonly tuning: GameplayTuning,
    private readonly level: LevelDefinition,
    private readonly eventBus: GameplayEventBus,
  ) {
    assertValidLevel(level);
    this.state = this.createInitialState();
    this.dependencyEngine = new DependencyEngine(level, this.state);
  }

  setEdgeTransitionsEnabled(enabled: boolean): void {
    this.edgeTransitionsEnabled = enabled;
  }

  setActiveFace(faceId: FaceId): void {
    this.state.activeFace = faceId;
    this.state.blocks = this.state.faces[faceId].blocks;
  }

  isEdgeUnlocked(face: FaceId, edge: FaceEdge): boolean {
    const config = this.level.edges.find((candidate) => candidate.face === face && candidate.edge === edge);
    if (!config || config.requiredAnchors.length === 0) return true;
    return config.requiredAnchors.every((anchorId) => this.findBlock(anchorId)?.destroyed === true);
  }

  applyFlipReward(rating: FlipRating): void {
    if (rating === 'normal') return;
    const speedScale = rating === 'perfect' ? 1.28 : 1.1;
    const currentSpeed = Math.hypot(this.state.ball.velocity.x, this.state.ball.velocity.y) || 1;
    const targetSpeed = Math.min(this.tuning.ballMaxSpeed, currentSpeed * speedScale);
    const scale = targetSpeed / currentSpeed;
    this.state.ball.velocity.x *= scale;
    this.state.ball.velocity.y *= scale;
    this.nextHitDamageMultiplier = rating === 'perfect' ? 2 : 1.25;
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
    if (this.findBlock(this.level.objective.blockId)?.destroyed) this.state.phase = 'cleared';
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
    this.nextHitDamageMultiplier = 1;
    this.dependencyEngine = new DependencyEngine(this.level, this.state);
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
    const faces = Object.fromEntries(
      FACE_IDS.map((faceId) => [faceId, { blocks: this.level.blocks.filter((block) => block.face === faceId).map(createBlockState) }]),
    ) as Record<FaceId, FaceRuntimeState>;
    return {
      ball: {
        position: { x: 0, y: paddle.y + 0.8 },
        previousPosition: { x: 0, y: paddle.y + 0.8 },
        velocity: { x: 0, y: 0 },
        radius: this.tuning.ballRadius,
      },
      paddle,
      faces,
      activeFace: this.level.startFace,
      blocks: faces[this.level.startFace].blocks,
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
    this.nextHitDamageMultiplier = 1;
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
        const multiplier = this.nextHitDamageMultiplier;
        const result = hitBlock(collision.block, multiplier);
        if (!result.blocked) this.nextHitDamageMultiplier = 1;
        this.state.score += result.score;
        this.eventBus.emit({
          type: 'BlockHit',
          blockId: collision.block.id,
          blockType: collision.block.type,
          points: result.score,
          destroyed: result.destroyed,
        });
        if (result.destroyed) this.onBlockDestroyed(collision.block);
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

    if (ball.velocity.x < 0) best = this.edgeOrWall(best, 'left', (-halfWidth + ball.radius - ball.position.x) / ball.velocity.x, { x: 1, y: 0 }, maxTime);
    if (ball.velocity.x > 0) best = this.edgeOrWall(best, 'right', (halfWidth - ball.radius - ball.position.x) / ball.velocity.x, { x: -1, y: 0 }, maxTime);
    if (ball.velocity.y > 0) best = this.edgeOrWall(best, 'top', (top - ball.radius - ball.position.y) / ball.velocity.y, { x: 0, y: -1 }, maxTime);

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
      const hit = sweepPointAgainstAabb(ball.position, ball.velocity, maxTime, expandedAabb(block.position, block.width, block.height, ball.radius));
      if (hit) best = earlier(best, { ...hit, kind: 'block', block });
    }
    return best;
  }

  private edgeOrWall(
    best: CollisionCandidate | null,
    edge: FaceEdge,
    time: number,
    normal: Vec2,
    maxTime: number,
  ): CollisionCandidate | null {
    if (time < 0 || time > maxTime) return best;
    const unlocked = this.edgeTransitionsEnabled && this.isEdgeUnlocked(this.state.activeFace, edge);
    return earlier(best, { time, normal, kind: unlocked ? 'edge' : 'wall', edge });
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

  private onBlockDestroyed(block: BlockState): void {
    this.eventBus.emit({ type: 'BlockDestroyed', blockId: block.id, blockType: block.type, face: block.face });
    if (block.type === 'generator') this.eventBus.emit({ type: 'GeneratorDestroyed', blockId: block.id, face: block.face });
    if (block.type === 'chain') this.triggerChain(block);
    if (block.type === 'core') this.eventBus.emit({ type: 'CoreDestroyed', blockId: block.id, face: block.face });
    this.emitDependencyMutations(this.dependencyEngine.onBlockDestroyed(block.id));
  }

  private emitDependencyMutations(mutations: DependencyMutation[]): void {
    for (const mutation of mutations) {
      this.eventBus.emit({ type: 'DependencyTriggered', mutation });
      if (mutation.effect.type === 'exposeBlock') {
        this.eventBus.emit({ type: 'CoreExposed', blockId: mutation.effect.blockId });
      }
    }
  }

  private triggerChain(source: BlockState): void {
    this.eventBus.emit({ type: 'ChainTriggered', blockId: source.id, face: source.face });
    const radius = 2.75;
    for (const target of this.state.faces[source.face].blocks) {
      if (target.id === source.id || target.destroyed) continue;
      if (Math.hypot(target.position.x - source.position.x, target.position.y - source.position.y) > radius) continue;
      if (forceDestroyBlock(target)) {
        this.state.score += target.scoreValue;
        this.eventBus.emit({ type: 'BlockHit', blockId: target.id, blockType: target.type, points: target.scoreValue, destroyed: true });
        this.eventBus.emit({ type: 'BlockDestroyed', blockId: target.id, blockType: target.type, face: target.face });
        if (target.type === 'generator') this.eventBus.emit({ type: 'GeneratorDestroyed', blockId: target.id, face: target.face });
        if (target.type === 'core') this.eventBus.emit({ type: 'CoreDestroyed', blockId: target.id, face: target.face });
        this.emitDependencyMutations(this.dependencyEngine.onBlockDestroyed(target.id));
      }
    }
  }

  private findBlock(id: string): BlockState | undefined {
    return Object.values(this.state.faces).flatMap((face) => face.blocks).find((block) => block.id === id);
  }

  private loseLife(): void {
    this.state.lives -= 1;
    this.eventBus.emit({ type: 'LifeLost', remainingLives: this.state.lives, face: this.state.activeFace });
    if (this.state.lives <= 0) {
      this.state.phase = 'game-over';
      return;
    }
    this.state.phase = 'life-lost';
  }
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
