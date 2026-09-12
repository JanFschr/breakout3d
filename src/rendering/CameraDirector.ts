import * as THREE from 'three';
import type { SpatialPresentationState } from '../gameplay/SpatialRuntime';
import type { GameScene } from './GameScene';

const FACE_SIZE = 14;
const FACE_HALF_SIZE = FACE_SIZE / 2;
const GAMEPLAY_WIDTH_FILL = 0.9;
const TRANSITION_WIDTH_FILL = 0.78;
const INSPECT_WIDTH_FILL = 0.74;
const RESULTS_WIDTH_FILL = 0.66;
const BODY_HALF_EXTENT = FACE_SIZE * Math.SQRT2 * 0.52;
const CAMERA_DAMPING = 11;

/**
 * Owns camera framing for the presentation layer. Gameplay always prioritizes
 * the active face; Inspect / Edge Ride / Core Kill deliberately reveal more of
 * the 3D body. Simulation coordinates never depend on these camera values.
 */
export class CameraDirector {
  private readonly lookTarget = new THREE.Vector3(0, 0, 0);

  constructor(private readonly gameScene: GameScene) {}

  update(presentation: SpatialPresentationState, dtSeconds: number): void {
    this.apply(presentation, Math.min(dtSeconds, 0.05), false);
  }

  snap(presentation: SpatialPresentationState): void {
    this.apply(presentation, 1, true);
  }

  private apply(presentation: SpatialPresentationState, dtSeconds: number, immediate: boolean): void {
    const camera = this.gameScene.camera;
    const tanVertical = Math.tan(camera.fov * Math.PI / 360);
    const tanHorizontal = tanVertical * Math.max(camera.aspect, 0.01);
    const limitingTan = Math.max(Math.min(tanVertical, tanHorizontal), 0.01);

    const gameplayZ = FACE_HALF_SIZE + FACE_HALF_SIZE / (limitingTan * GAMEPLAY_WIDTH_FILL);
    const transitionZ = BODY_HALF_EXTENT / (limitingTan * TRANSITION_WIDTH_FILL);
    const inspectZ = BODY_HALF_EXTENT / (limitingTan * INSPECT_WIDTH_FILL);
    const resultsZ = BODY_HALF_EXTENT / (limitingTan * RESULTS_WIDTH_FILL);

    let targetZ = gameplayZ;
    let targetY = 0.15;

    if (presentation.phase === 'INSPECT') {
      targetZ = inspectZ;
      targetY = 0;
    } else if (presentation.phase === 'RESULTS' || presentation.phase === 'GAME_OVER') {
      targetZ = resultsZ;
      targetY = 0.35;
    } else if (presentation.phase === 'CORE_KILL') {
      const pulse = Math.sin(presentation.coreKillProgress * Math.PI);
      targetZ = THREE.MathUtils.lerp(inspectZ, resultsZ, 0.35) + pulse * FACE_SIZE * 0.18;
      targetY = 0.25 + Math.sin(presentation.coreKillProgress * Math.PI * 2) * 0.35;
    } else if (presentation.phase === 'EDGE_RIDE' && presentation.ride) {
      const reveal = Math.sin(presentation.ride.progress * Math.PI);
      targetZ = THREE.MathUtils.lerp(gameplayZ, transitionZ, reveal);
      targetY = THREE.MathUtils.lerp(0.15, 0, reveal);
    }

    if (immediate) {
      camera.position.set(0, targetY, targetZ);
    } else {
      camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, CAMERA_DAMPING, dtSeconds);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, CAMERA_DAMPING, dtSeconds);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, CAMERA_DAMPING, dtSeconds);
    }

    camera.far = Math.max(220, resultsZ + FACE_SIZE * 5);
    camera.updateProjectionMatrix();
    camera.lookAt(this.lookTarget);

    const fog = this.gameScene.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.near = Math.max(18, camera.position.z - FACE_SIZE * 0.8);
      fog.far = camera.position.z + FACE_SIZE * 3.5;
    }
  }
}
