export interface Vec2 {
  x: number;
  y: number;
}

export interface BallState {
  position: Vec2;
  velocity: Vec2;
  radius: number;
}

export interface PaddleState {
  x: number;
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
}
