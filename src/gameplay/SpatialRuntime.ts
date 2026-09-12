import type { GameplayTuning } from '../core/config';
import type { InputSnapshot } from '../input/InputController';
import {
  bodyToLocal,
  destinationForEdge,
  localToBody,
  reciprocalEdge,
  transferVelocity,
  type FaceEdge,
  type FaceId,
  type Vec3Like,
} from '../world/FaceGraph';
import type { BreakoutSimulation, PendingEdgeHit } from './BreakoutSimulation';

export type RuntimePhase = 'PLAY_FACE' | 'EDGE_WINDOW' | 'EDGE_RIDE' | 'INSPECT' | 'LIFE_LOST' | 'GAME_OVER' | 'CLEARED';

export interface EdgeRidePresentation {
  readonly sourceFace: FaceId;
  readonly destinationFace: FaceId;
  readonly sourceBodyPoint: Vec3Like;
  readonly destinationBodyPoint: Vec3Like;
  readonly progress: number;
}

export interface SpatialPresentationState {
  readonly phase: RuntimePhase;
  readonly activeFace: FaceId;
  readonly edgeWindow: FaceEdge | null;
  readonly edgeWindowProgress: number;
  readonly ride: EdgeRidePresentation | null;
}

const EDGE_WINDOW_SECONDS = 0.42;
const EDGE_RIDE_SECONDS = 0.58;
const SWIPE_THRESHOLD = 28;
const FACE_SIZE = 14;

export class SpatialRuntime {
  phase: RuntimePhase = 'PLAY_FACE';
  activeFace: FaceId;
  private edgeWindowElapsed = 0;
  private edgeGestureX = 0;
  private edgeGestureY = 0;
  private rideElapsed = 0;
  private pending: PendingEdgeHit | null = null;
  private destinationFace: FaceId | null = null;
  private destinationPosition: { x: number; y: number } | null = null;
  private destinationVelocity: { x: number; y: number } | null = null;
  private sourceBodyPoint: Vec3Like | null = null;
  private destinationBodyPoint: Vec3Like | null = null;
  private inspectRequested = false;

  constructor(private readonly simulation: BreakoutSimulation, private readonly tuning: GameplayTuning) {
    this.activeFace = simulation.state.activeFace;
    simulation.setEdgeTransitionsEnabled(true);
  }

  requestInspectToggle(): void { this.inspectRequested = true; }

  update(dtSeconds: number, input: InputSnapshot): void {
    if (this.inspectRequested) {
      this.inspectRequested = false;
      if (this.phase === 'INSPECT') this.phase = 'PLAY_FACE';
      else if (this.phase === 'PLAY_FACE') this.phase = 'INSPECT';
    }
    if (this.phase === 'INSPECT') return;
    if (this.phase === 'PLAY_FACE') return this.updatePlay(dtSeconds, input);
    if (this.phase === 'EDGE_WINDOW') return this.updateEdgeWindow(dtSeconds, input);
    if (this.phase === 'EDGE_RIDE') return this.updateEdgeRide(dtSeconds);
    if (this.phase === 'LIFE_LOST') {
      this.simulation.update(dtSeconds);
      if (this.simulation.state.phase === 'ready') this.phase = 'PLAY_FACE';
    }
  }

  getPresentationState(): SpatialPresentationState {
    const ride = this.phase === 'EDGE_RIDE' && this.destinationFace && this.sourceBodyPoint && this.destinationBodyPoint
      ? { sourceFace: this.activeFace, destinationFace: this.destinationFace, sourceBodyPoint: this.sourceBodyPoint, destinationBodyPoint: this.destinationBodyPoint, progress: clamp01(this.rideElapsed / EDGE_RIDE_SECONDS) }
      : null;
    return { phase: this.phase, activeFace: this.activeFace, edgeWindow: this.pending?.edge ?? null, edgeWindowProgress: clamp01(this.edgeWindowElapsed / EDGE_WINDOW_SECONDS), ride };
  }

  private updatePlay(dtSeconds: number, input: InputSnapshot): void {
    const pointerDeltaWorld = (input.pointerDeltaPixels / Math.max(1, window.innerWidth)) * this.tuning.fieldWidth * this.tuning.paddleSensitivity;
    this.simulation.setPaddleInput(pointerDeltaWorld, input.keyboardAxis, dtSeconds);
    this.simulation.update(dtSeconds);
    const hit = this.simulation.consumePendingEdgeHit();
    if (hit) {
      this.pending = hit;
      this.edgeWindowElapsed = 0;
      this.edgeGestureX = 0;
      this.edgeGestureY = 0;
      this.phase = 'EDGE_WINDOW';
      return;
    }
    if (this.simulation.state.phase === 'life-lost') this.phase = 'LIFE_LOST';
    if (this.simulation.state.phase === 'game-over') this.phase = 'GAME_OVER';
    if (this.simulation.state.phase === 'cleared') this.phase = 'CLEARED';
  }

  private updateEdgeWindow(dtSeconds: number, input: InputSnapshot): void {
    this.edgeWindowElapsed += dtSeconds;
    this.edgeGestureX += input.gestureDeltaX;
    this.edgeGestureY += input.gestureDeltaY;
    if (!this.pending) return void (this.phase = 'PLAY_FACE');
    if (gestureCommitsEdge(this.pending.edge, this.edgeGestureX, this.edgeGestureY)) {
      this.prepareRide(this.pending);
      this.phase = 'EDGE_RIDE';
      this.rideElapsed = 0;
      return;
    }
    if (this.edgeWindowElapsed >= EDGE_WINDOW_SECONDS) {
      this.simulation.rejectPendingEdge();
      this.pending = null;
      this.phase = 'PLAY_FACE';
    }
  }

  private prepareRide(hit: PendingEdgeHit): void {
    const destination = destinationForEdge(this.activeFace, hit.edge);
    const yScale = FACE_SIZE / this.tuning.fieldHeight;
    const sourceBodyPoint = localToBody(this.activeFace, hit.position.x, (hit.position.y - this.tuning.fieldHeight / 2) * yScale, 0.12);
    const destLocal = bodyToLocal(destination, sourceBodyPoint);
    const destEdge = reciprocalEdge(this.activeFace, destination);
    const position = { x: destLocal.u, y: destLocal.v / yScale + this.tuning.fieldHeight / 2 };
    nudgeInside(position, destEdge, this.tuning);
    const transferred = transferVelocity(this.activeFace, destination, { x: hit.velocity.x, y: hit.velocity.y * yScale });
    const velocity = { x: transferred.x, y: transferred.y / yScale };
    this.destinationFace = destination;
    this.destinationPosition = position;
    this.destinationVelocity = velocity;
    this.sourceBodyPoint = sourceBodyPoint;
    this.destinationBodyPoint = localToBody(destination, position.x, (position.y - this.tuning.fieldHeight / 2) * yScale, 0.12);
  }

  private updateEdgeRide(dtSeconds: number): void {
    this.rideElapsed += dtSeconds;
    if (this.rideElapsed < EDGE_RIDE_SECONDS) return;
    if (!this.destinationFace || !this.destinationPosition || !this.destinationVelocity) throw new Error('Edge Ride completed without destination state');
    this.activeFace = this.destinationFace;
    this.simulation.setActiveFace(this.activeFace);
    this.simulation.completePendingEdge(this.destinationPosition, this.destinationVelocity);
    this.pending = null;
    this.destinationFace = null;
    this.destinationPosition = null;
    this.destinationVelocity = null;
    this.sourceBodyPoint = null;
    this.destinationBodyPoint = null;
    this.edgeGestureX = 0;
    this.edgeGestureY = 0;
    this.phase = 'PLAY_FACE';
  }
}

function gestureCommitsEdge(edge: FaceEdge, deltaX: number, deltaY: number): boolean {
  if (edge === 'left') return deltaX <= -SWIPE_THRESHOLD;
  if (edge === 'right') return deltaX >= SWIPE_THRESHOLD;
  if (edge === 'top') return deltaY <= -SWIPE_THRESHOLD;
  return deltaY >= SWIPE_THRESHOLD;
}
function nudgeInside(position: { x: number; y: number }, edge: FaceEdge, tuning: GameplayTuning): void {
  const inset = 0.08;
  if (edge === 'left') position.x = -tuning.fieldWidth / 2 + tuning.ballRadius + inset;
  if (edge === 'right') position.x = tuning.fieldWidth / 2 - tuning.ballRadius - inset;
  if (edge === 'top') position.y = tuning.fieldHeight - tuning.ballRadius - inset;
  if (edge === 'bottom') position.y = tuning.ballRadius + inset;
}
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
