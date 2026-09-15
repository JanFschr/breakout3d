import type { GameplayTuning } from '../core/config';
import type { InputSnapshot } from '../input/InputController';
import { nudgeBallInsidePlayfield } from '../physics/FacePlayfield';
import { visualYScale } from '../world/BodyMetrics';
import {
  bodyToLocal,
  destinationForEdge,
  localToBody,
  reciprocalEdge,
  transferVelocity,
  type BodyType,
  type FaceEdge,
  type FaceId,
  type Vec3Like,
} from '../world/FaceGraph';
import type { BreakoutSimulation, PendingEdgeHit } from './BreakoutSimulation';
import type { FlipRating, GameplayEventBus } from './GameplayEvents';

export type RuntimePhase = 'PLAY_FACE' | 'EDGE_WINDOW' | 'EDGE_RIDE' | 'INSPECT' | 'LIFE_LOST' | 'GAME_OVER' | 'CORE_KILL' | 'RESULTS';

export interface EdgeRidePresentation {
  readonly sourceFace: FaceId;
  readonly destinationFace: FaceId;
  readonly sourceBodyPoint: Vec3Like;
  readonly destinationBodyPoint: Vec3Like;
  readonly progress: number;
  readonly rating: FlipRating;
}

export interface SpatialPresentationState {
  readonly phase: RuntimePhase;
  readonly activeFace: FaceId;
  readonly edgeWindow: FaceEdge | null;
  readonly edgeWindowProgress: number;
  readonly ride: EdgeRidePresentation | null;
  readonly coreKillProgress: number;
}

const EDGE_WINDOW_SECONDS = 0.42;
const EDGE_RIDE_SECONDS = 0.58;
const CORE_KILL_SECONDS = 3.2;
const SWIPE_THRESHOLD = 28;

export class SpatialRuntime {
  phase: RuntimePhase = 'PLAY_FACE';
  activeFace: FaceId;
  private edgeWindowElapsed = 0;
  private edgeGestureX = 0;
  private edgeGestureY = 0;
  private rideElapsed = 0;
  private coreKillElapsed = 0;
  private pending: PendingEdgeHit | null = null;
  private destinationFace: FaceId | null = null;
  private destinationPosition: { x: number; y: number } | null = null;
  private destinationVelocity: { x: number; y: number } | null = null;
  private sourceBodyPoint: Vec3Like | null = null;
  private destinationBodyPoint: Vec3Like | null = null;
  private inspectRequested = false;
  private rideRating: FlipRating = 'normal';

  constructor(
    private readonly simulation: BreakoutSimulation,
    private readonly tuning: GameplayTuning,
    private readonly eventBus: GameplayEventBus,
  ) {
    this.activeFace = simulation.state.activeFace;
    simulation.setEdgeTransitionsEnabled(true);
  }

  requestInspectToggle(): void { this.inspectRequested = true; }

  reset(): void {
    this.phase = 'PLAY_FACE';
    this.activeFace = this.simulation.state.activeFace;
    this.edgeWindowElapsed = 0;
    this.edgeGestureX = 0;
    this.edgeGestureY = 0;
    this.rideElapsed = 0;
    this.coreKillElapsed = 0;
    this.pending = null;
    this.destinationFace = null;
    this.destinationPosition = null;
    this.destinationVelocity = null;
    this.sourceBodyPoint = null;
    this.destinationBodyPoint = null;
    this.inspectRequested = false;
    this.rideRating = 'normal';
  }

  update(dtSeconds: number, input: InputSnapshot): void {
    if (this.inspectRequested) {
      this.inspectRequested = false;
      if (this.phase === 'INSPECT') this.phase = 'PLAY_FACE';
      else if (this.phase === 'PLAY_FACE') this.phase = 'INSPECT';
    }
    if (this.phase === 'INSPECT' || this.phase === 'RESULTS' || this.phase === 'GAME_OVER') return;
    if (this.phase === 'PLAY_FACE') return this.updatePlay(dtSeconds, input);
    if (this.phase === 'EDGE_WINDOW') return this.updateEdgeWindow(dtSeconds, input);
    if (this.phase === 'EDGE_RIDE') return this.updateEdgeRide(dtSeconds);
    if (this.phase === 'CORE_KILL') return this.updateCoreKill(dtSeconds);
    if (this.phase === 'LIFE_LOST') {
      this.simulation.update(dtSeconds);
      if (this.simulation.state.phase === 'ready') this.phase = 'PLAY_FACE';
    }
  }

  getPresentationState(): SpatialPresentationState {
    const ride = this.phase === 'EDGE_RIDE' && this.destinationFace && this.sourceBodyPoint && this.destinationBodyPoint
      ? { sourceFace: this.activeFace, destinationFace: this.destinationFace, sourceBodyPoint: this.sourceBodyPoint, destinationBodyPoint: this.destinationBodyPoint, progress: clamp01(this.rideElapsed / EDGE_RIDE_SECONDS), rating: this.rideRating }
      : null;
    return {
      phase: this.phase,
      activeFace: this.activeFace,
      edgeWindow: this.pending?.edge ?? null,
      edgeWindowProgress: clamp01(this.edgeWindowElapsed / EDGE_WINDOW_SECONDS),
      ride,
      coreKillProgress: clamp01(this.coreKillElapsed / CORE_KILL_SECONDS),
    };
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
    if (this.simulation.state.phase === 'cleared') {
      this.coreKillElapsed = 0;
      this.phase = 'CORE_KILL';
    }
  }

  private updateEdgeWindow(dtSeconds: number, input: InputSnapshot): void {
    this.edgeWindowElapsed += dtSeconds;
    this.edgeGestureX += input.gestureDeltaX;
    this.edgeGestureY += input.gestureDeltaY;
    if (!this.pending) return void (this.phase = 'PLAY_FACE');
    if (gestureCommitsEdge(this.pending.edge, this.edgeGestureX, this.edgeGestureY)) {
      const destination = destinationForEdge(this.activeFace, this.pending.edge);
      this.rideRating = classifyFlip(this.edgeWindowElapsed / EDGE_WINDOW_SECONDS);
      this.eventBus.emit({ type: 'FlipRated', rating: this.rideRating });
      this.eventBus.emit({ type: 'EdgeCommitted', sourceFace: this.activeFace, destinationFace: destination, edge: this.pending.edge, rating: this.rideRating });
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
    const sourceScale = visualYScale(this.activeFace, this.tuning.fieldHeight);
    const destinationScale = visualYScale(destination, this.tuning.fieldHeight);
    const sourceBodyPoint = localToBody(
      this.activeFace,
      hit.position.x,
      (hit.position.y - this.tuning.fieldHeight / 2) * sourceScale,
      0.12,
    );
    const destLocal = bodyToLocal(destination, sourceBodyPoint);
    const destEdge = reciprocalEdge(this.activeFace, destination);
    const position = {
      x: destLocal.u,
      y: destLocal.v / destinationScale + this.tuning.fieldHeight / 2,
    };
    nudgeBallInsidePlayfield(bodyTypeForFace(destination), destination, destEdge, position, this.tuning);
    const transferred = transferVelocity(this.activeFace, destination, {
      x: hit.velocity.x,
      y: hit.velocity.y * sourceScale,
    });
    const velocity = { x: transferred.x, y: transferred.y / destinationScale };
    this.destinationFace = destination;
    this.destinationPosition = position;
    this.destinationVelocity = velocity;
    this.sourceBodyPoint = sourceBodyPoint;
    this.destinationBodyPoint = localToBody(
      destination,
      position.x,
      (position.y - this.tuning.fieldHeight / 2) * destinationScale,
      0.12,
    );
  }

  private updateEdgeRide(dtSeconds: number): void {
    this.rideElapsed += dtSeconds;
    if (this.rideElapsed < EDGE_RIDE_SECONDS) return;
    if (!this.destinationFace || !this.destinationPosition || !this.destinationVelocity) throw new Error('Edge Ride completed without destination state');
    const previousFace = this.activeFace;
    this.activeFace = this.destinationFace;
    this.simulation.setActiveFace(this.activeFace);
    this.simulation.completePendingEdge(this.destinationPosition, this.destinationVelocity);
    this.simulation.applyFlipReward(this.rideRating);
    this.eventBus.emit({ type: 'FaceEntered', face: this.activeFace, previousFace });
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

  private updateCoreKill(dtSeconds: number): void {
    this.coreKillElapsed += dtSeconds;
    if (this.coreKillElapsed >= CORE_KILL_SECONDS) this.phase = 'RESULTS';
  }
}

function classifyFlip(normalizedTime: number): FlipRating {
  if (normalizedTime >= 0.32 && normalizedTime <= 0.62) return 'perfect';
  if (normalizedTime >= 0.15 && normalizedTime <= 0.82) return 'good';
  return 'normal';
}

function gestureCommitsEdge(edge: FaceEdge, deltaX: number, deltaY: number): boolean {
  if (edge === 'left') return deltaX <= -SWIPE_THRESHOLD;
  if (edge === 'right') return deltaX >= SWIPE_THRESHOLD;
  if (edge === 'top') return deltaY <= -SWIPE_THRESHOLD;
  return deltaY >= SWIPE_THRESHOLD;
}

function bodyTypeForFace(faceId: FaceId): BodyType {
  return faceId === 'base' || faceId === 'north' || faceId === 'east' || faceId === 'south' || faceId === 'west'
    ? 'pyramid'
    : 'cube';
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
