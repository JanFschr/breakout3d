import type { BlockType } from '../data/LevelDefinition';
import type { FaceEdge, FaceId } from '../world/FaceGraph';

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

export type ArmorMode = 'protected' | 'weakened';

export interface BlockState {
  id: string;
  type: BlockType;
  face: FaceId;
  position: Vec2;
  width: number;
  height: number;
  hitPoints: number;
  maxHitPoints: number;
  destroyed: boolean;
  group?: string;
  edge?: FaceEdge;
  armorMode?: ArmorMode;
  exposed: boolean;
  scoreValue: number;
}

export interface FaceRuntimeState {
  blocks: BlockState[];
}

export type RunPhase = 'ready' | 'playing' | 'life-lost' | 'game-over' | 'cleared';

export interface BreakoutState {
  ball: BallState;
  paddle: PaddleState;
  faces: Record<FaceId, FaceRuntimeState>;
  activeFace: FaceId;
  blocks: BlockState[];
  phase: RunPhase;
  lives: number;
  score: number;
  elapsedSeconds: number;
}
