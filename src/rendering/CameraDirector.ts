import * as THREE from 'three';
import type { SpatialPresentationState } from '../gameplay/SpatialRuntime';
import { BODY_WIDTH, PORTRAIT_FACE_HEIGHT, visualFaceHeight } from '../world/BodyMetrics';
import { FACE_GRAPH, type FaceId } from '../world/FaceGraph';
import type { JuiceSnapshot } from '../vfx/JuiceDirector';
import type { GameScene } from './GameScene';

const GAMEPLAY_WIDTH_FILL = 0.94;
const GAMEPLAY_HEIGHT_FILL = 0.8;
const TRANSITION_WIDTH_FILL = 0.8;
const INSPECT_WIDTH_FILL = 0.74;
const RESULTS_WIDTH_FILL = 0.66;
const BODY_HALF_EXTENT = 15.5;
const CAMERA_DAMPING = 11;

/**
 * Owns camera framing for the presentation layer. Gameplay always prioritizes
 * the active face; Inspect / Edge Ride / Core Kill deliberately reveal more of
 * the 3D body. Simulation coordinates never depend on these camera values.
 */
export class CameraDirector {
  private readonly lookTarget = new THREE.Vector3(0, 0.12, 0);
  private visualTime = 0;

  constructor(private readonly gameScene: GameScene) {}

  update(presentation: SpatialPresentationState, dtSeconds: number, juice: JuiceSnapshot): void {
    const dt = Math.min(dtSeconds, 0.05);
    this.visualTime += dt;
    this.apply(presentation, dt, false, juice);
  }

  snap(presentation: SpatialPresentationState): void {
    this.apply(presentation, 1, true, null);
  }

  private apply(
    presentation: SpatialPresentationState,
    dtSeconds: number,
    immediate: boolean,
    juice: JuiceSnapshot | null,
  ): void {
    const camera = this.gameScene.camera;
    const tanVertical = Math.max(Math.tan(camera.fov * Math.PI / 360), 0.01);
    const tanHorizontal = Math.max(tanVertical * Math.max(camera.aspect, 0.01), 0.01);
    const limitingTan = Math.max(Math.min(tanVertical, tanHorizontal), 0.01);

    const faceHalfWidth = BODY_WIDTH / 2;
    const faceHalfHeight = visualFaceHeight(presentation.activeFace) / 2;
    const surfaceDistance = faceSurfaceDistance(presentation.activeFace);
    const gameplayFromSurface = Math.max(
      faceHalfWidth / (tanHorizontal * GAMEPLAY_WIDTH_FILL),
      faceHalfHeight / (tanVertical * GAMEPLAY_HEIGHT_FILL),
    );
    const gameplayZ = surfaceDistance + gameplayFromSurface;
    const transitionZ = BODY_HALF_EXTENT / (limitingTan * TRANSITION_WIDTH_FILL);
    const inspectZ = BODY_HALF_EXTENT / (limitingTan * INSPECT_WIDTH_FILL);
    const resultsZ = BODY_HALF_EXTENT / (limitingTan * RESULTS_WIDTH_FILL);

    let targetZ = gameplayZ;
    let targetY = 0.05;
    let targetX = 0;

    if (presentation.phase === 'INSPECT') {
      targetZ = inspectZ;
      targetY = 0;
    } else if (presentation.phase === 'RESULTS' || presentation.phase === 'GAME_OVER') {
      targetZ = resultsZ;
      targetY = 0.3;
    } else if (presentation.phase === 'CORE_KILL') {
      const pulse = Math.sin(presentation.coreKillProgress * Math.PI);
      targetZ = THREE.MathUtils.lerp(inspectZ, resultsZ, 0.35) + pulse * BODY_WIDTH * 0.18;
      targetY = 0.2 + Math.sin(presentation.coreKillProgress * Math.PI * 2) * 0.35;
    } else if (presentation.phase === 'EDGE_RIDE' && presentation.ride) {
      const reveal = Math.sin(presentation.ride.progress * Math.PI);
      targetZ = THREE.MathUtils.lerp(gameplayZ, transitionZ, reveal);
      targetY = THREE.MathUtils.lerp(0.05, 0, reveal);
    }

    const allowsMicroResponse = presentation.phase === 'PLAY_FACE' || presentation.phase === 'EDGE_WINDOW' || presentation.phase === 'LIFE_LOST';
    if (juice && allowsMicroResponse) {
      const impulse = juice.eventPulse * juice.camera;
      targetZ -= impulse * 0.75;
      targetX += Math.sin(this.visualTime * 43) * impulse * 0.055;
      targetY += Math.cos(this.visualTime * 37) * impulse * 0.04;
    }

    if (immediate) {
      camera.position.set(targetX, targetY, targetZ);
    } else {
      camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, CAMERA_DAMPING, dtSeconds);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, CAMERA_DAMPING, dtSeconds);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, CAMERA_DAMPING, dtSeconds);
    }

    camera.far = Math.max(260, resultsZ + PORTRAIT_FACE_HEIGHT * 4);
    camera.updateProjectionMatrix();
    camera.lookAt(this.lookTarget);

    const fog = this.gameScene.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.near = Math.max(20, camera.position.z - PORTRAIT_FACE_HEIGHT * 0.6);
      fog.far = camera.position.z + PORTRAIT_FACE_HEIGHT * 2.8;
    }
  }
}

function faceSurfaceDistance(faceId: FaceId): number {
  const basis = FACE_GRAPH[faceId];
  return Math.abs(
    basis.origin.x * basis.normal.x
      + basis.origin.y * basis.normal.y
      + basis.origin.z * basis.normal.z,
  );
}
