import * as THREE from 'three';
import { BODY_HALF_WIDTH, visualFaceHeight } from '../world/BodyMetrics';
import { localToBody, type FaceEdge, type FaceId, type Vec3Like } from '../world/FaceGraph';
import type { JuiceSnapshot } from './JuiceDirector';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const CYAN = new THREE.Color(0x35d9ff);
const GOLD = new THREE.Color(0xffd85a);

export class EdgeRail {
  readonly object = new THREE.Group();
  private readonly uniforms = {
    time: { value: 0 },
    intensity: { value: 0 },
    sweetSpot: { value: 0 },
    color: { value: CYAN.clone() },
  };
  private readonly rail: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly halo: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly start = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly midpoint = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.uniforms.time,
        uIntensity: this.uniforms.intensity,
        uSweetSpot: this.uniforms.sweetSpot,
        uColor: this.uniforms.color,
      },
      vertexShader: `
        varying float vAlong;
        void main() {
          vAlong = position.y + 0.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uSweetSpot;
        uniform vec3 uColor;
        varying float vAlong;
        void main() {
          float flow = 0.5 + 0.5 * sin(vAlong * 42.0 - uTime * 11.0);
          float spark = smoothstep(0.72, 1.0, flow);
          float alpha = 0.58 + spark * (0.24 + uIntensity * 0.18) + uSweetSpot * 0.12;
          vec3 color = uColor * (1.15 + spark * 0.85 + uSweetSpot * 0.65);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.rail = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1, 8, 1, true), material);
    this.rail.renderOrder = 7;
    this.object.add(this.rail);

    this.halo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x35d9ff,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.halo.renderOrder = 6;
    this.object.add(this.halo);
    this.object.visible = false;
  }

  update(faceId: FaceId, edge: FaceEdge | null, progress: number, juice: JuiceSnapshot, visualTime: number): void {
    if (!edge) {
      this.object.visible = false;
      return;
    }

    this.object.visible = true;
    const [a, b] = edgePoints(faceId, edge);
    setVector(this.start, localToBody(faceId, a[0], a[1], 0.58));
    setVector(this.end, localToBody(faceId, b[0], b[1], 0.58));
    this.midpoint.copy(this.start).add(this.end).multiplyScalar(0.5);
    this.direction.copy(this.end).sub(this.start);
    const length = this.direction.length();
    if (length < 1e-4) {
      this.object.visible = false;
      return;
    }
    this.direction.normalize();

    this.object.position.copy(this.midpoint);
    this.object.quaternion.setFromUnitVectors(Y_AXIS, this.direction);
    this.rail.scale.set(1, length, 1);
    this.halo.scale.set(1, length, 1);

    const sweetSpot = smoothBand(progress, 0.28, 0.42, 0.62, 0.78);
    const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 8);
    this.uniforms.time.value = visualTime;
    this.uniforms.intensity.value = THREE.MathUtils.clamp(0.35 + juice.glow * 0.55 + pulse * 0.1, 0, 1);
    this.uniforms.sweetSpot.value = sweetSpot;
    this.uniforms.color.value.copy(CYAN).lerp(GOLD, sweetSpot * 0.82);
    this.halo.material.color.copy(this.uniforms.color.value);
    this.halo.material.opacity = 0.06 + juice.glow * 0.08 + sweetSpot * 0.08;
  }
}

function edgePoints(faceId: FaceId, edge: FaceEdge): [[number, number], [number, number]] {
  const halfHeight = visualFaceHeight(faceId) / 2;
  if (isPyramidSide(faceId)) {
    if (edge === 'left') return [[-BODY_HALF_WIDTH, -halfHeight], [0, halfHeight]];
    if (edge === 'right') return [[BODY_HALF_WIDTH, -halfHeight], [0, halfHeight]];
    if (edge === 'bottom') return [[-BODY_HALF_WIDTH, -halfHeight], [BODY_HALF_WIDTH, -halfHeight]];
    return [[0, halfHeight], [0, halfHeight]];
  }
  if (edge === 'left') return [[-BODY_HALF_WIDTH, -halfHeight], [-BODY_HALF_WIDTH, halfHeight]];
  if (edge === 'right') return [[BODY_HALF_WIDTH, -halfHeight], [BODY_HALF_WIDTH, halfHeight]];
  if (edge === 'top') return [[-BODY_HALF_WIDTH, halfHeight], [BODY_HALF_WIDTH, halfHeight]];
  return [[-BODY_HALF_WIDTH, -halfHeight], [BODY_HALF_WIDTH, -halfHeight]];
}

function isPyramidSide(faceId: FaceId): boolean {
  return faceId === 'north' || faceId === 'east' || faceId === 'south' || faceId === 'west';
}

function setVector(target: THREE.Vector3, value: Vec3Like): void {
  target.set(value.x, value.y, value.z);
}

function smoothBand(value: number, a: number, b: number, c: number, d: number): number {
  const rise = THREE.MathUtils.smoothstep(value, a, b);
  const fall = 1 - THREE.MathUtils.smoothstep(value, c, d);
  return rise * fall;
}
