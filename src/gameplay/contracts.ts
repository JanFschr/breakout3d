export interface Vec2 {
  x: number;
  y: number;
}

export interface BallState {
  position: Vec2;
  previousPosition: Vec2;
  velocity: Vec2;
  radius: number;
}

export interface PaddleState {
  x: number;
  previousX: number;
  velocityX: number;
  y: number;
  width: number;
  height: number;
}

export interface BlockState {
  id: string;
  position: Vec2;
  width: number;
  height: number;
  hitPoints: number;
  maxHitPoints: number;
  destroyed: boolean;
}

export type RunPhase = 'ready' | 'playing' | 'life-lost' | 'game-over' | 'cleared';

export interface BreakoutState {
  ball: BallState;
  paddle: PaddleState;
  blocks: BlockState[];
  phase: RunPhase;
  lives: number;
  score: number;
  elapsedSeconds: number;
}
