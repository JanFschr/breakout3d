export interface GameplayTuning {
  readonly fieldWidth: number;
  readonly fieldHeight: number;
  readonly ballRadius: number;
  readonly ballBaseSpeed: number;
  readonly ballMaxSpeed: number;
  readonly paddleWidth: number;
  readonly paddleHeight: number;
  readonly paddleY: number;
  readonly paddleSensitivity: number;
  readonly paddleKeyboardSpeed: number;
  readonly paddleMotionInfluence: number;
  readonly lives: number;
}

export interface AppConfig {
  readonly maxPixelRatio: number;
  readonly background: number;
  readonly gameplay: GameplayTuning;
}

function queryNumber(name: string, fallback: number): number {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const APP_CONFIG: AppConfig = {
  maxPixelRatio: 2,
  background: 0xeafcff,
  gameplay: {
    fieldWidth: 14,
    fieldHeight: 22,
    ballRadius: 0.36,
    ballBaseSpeed: queryNumber('ballSpeed', 10.5),
    ballMaxSpeed: queryNumber('ballMaxSpeed', 16),
    paddleWidth: queryNumber('paddleWidth', 3.2),
    paddleHeight: 0.5,
    paddleY: 0.65,
    paddleSensitivity: queryNumber('paddleSensitivity', 1.15),
    paddleKeyboardSpeed: 9,
    paddleMotionInfluence: 0.18,
    lives: Math.max(1, Math.round(queryNumber('lives', 3))),
  },
};
