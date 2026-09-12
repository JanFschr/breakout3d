import * as THREE from 'three';

const MAX_POINTS = 56;

export class BallTrail {
  readonly object: THREE.Line;
  private readonly positions = new Float32Array(MAX_POINTS * 3);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.LineBasicMaterial({ color: 0x63e6ff, transparent: true, opacity: 0.38 });
  private count = 0;
  private lastPosition = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.object = new THREE.Line(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
  }

  push(position: THREE.Vector3, intensity: number): void {
    const minDistance = THREE.MathUtils.lerp(0.28, 0.08, intensity);
    if (Number.isFinite(this.lastPosition.x) && this.lastPosition.distanceToSquared(position) < minDistance * minDistance) {
      this.material.opacity = THREE.MathUtils.lerp(0.34, 0.78, intensity);
      return;
    }

    const visiblePoints = Math.max(10, Math.round(THREE.MathUtils.lerp(18, MAX_POINTS, intensity)));
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
    this.material.opacity = THREE.MathUtils.lerp(0.34, 0.78, intensity);
    this.material.color.setHSL(THREE.MathUtils.lerp(0.52, 0.78, intensity), 0.96, 0.68);
    this.lastPosition.copy(position);
  }

  clear(): void {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
    this.lastPosition.set(Number.POSITIVE_INFINITY, 0, 0);
  }
}
