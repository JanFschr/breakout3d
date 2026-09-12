import * as THREE from 'three';

const MAX_POINTS = 56;

export class BallTrail {
  readonly object: THREE.Line;
  private readonly positions = new Float32Array(MAX_POINTS * 3);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.LineBasicMaterial({ color: 0x6ddcff, transparent: true, opacity: 0.26 });
  private count = 0;
  private lastPosition = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.object = new THREE.Line(this.geometry, this.material);
    this.object.frustumCulled = false;
  }

  push(position: THREE.Vector3, intensity: number): void {
    const minDistance = THREE.MathUtils.lerp(0.32, 0.08, intensity);
    if (Number.isFinite(this.lastPosition.x) && this.lastPosition.distanceToSquared(position) < minDistance * minDistance) {
      this.material.opacity = THREE.MathUtils.lerp(0.18, 0.72, intensity);
      return;
    }

    const visiblePoints = Math.max(8, Math.round(THREE.MathUtils.lerp(14, MAX_POINTS, intensity)));
    const previousCount = Math.min(this.count, visiblePoints - 1);
    if (previousCount > 0) {
      this.positions.copyWithin(0, 3, previousCount * 3 + 3);
    }
    const index = previousCount * 3;
    this.positions[index] = position.x;
    this.positions[index + 1] = position.y;
    this.positions[index + 2] = position.z;
    this.count = Math.min(previousCount + 1, visiblePoints);
    this.geometry.setDrawRange(0, this.count);
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.material.opacity = THREE.MathUtils.lerp(0.18, 0.72, intensity);
    this.material.color.setHSL(THREE.MathUtils.lerp(0.53, 0.83, intensity), 0.92, 0.7);
    this.lastPosition.copy(position);
  }

  clear(): void {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
    this.lastPosition.set(Number.POSITIVE_INFINITY, 0, 0);
  }
}
