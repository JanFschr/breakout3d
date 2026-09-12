export type FaceId = 'front' | 'right' | 'back' | 'left' | 'top' | 'bottom';
export type FaceEdge = 'left' | 'right' | 'top' | 'bottom';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface FaceBasis {
  readonly id: FaceId;
  readonly origin: Vec3Like;
  readonly u: Vec3Like;
  readonly v: Vec3Like;
  readonly normal: Vec3Like;
  readonly neighbors: Record<FaceEdge, FaceId>;
}

export interface LocalPoint {
  u: number;
  v: number;
  normal: number;
}

const HALF_SIZE = 7;

export const FACE_IDS: readonly FaceId[] = ['front', 'right', 'back', 'left', 'top', 'bottom'];

export const FACE_GRAPH: Record<FaceId, FaceBasis> = {
  front: face('front', [0, 0, HALF_SIZE], [1, 0, 0], [0, 1, 0], [0, 0, 1], {
    left: 'left', right: 'right', top: 'top', bottom: 'bottom',
  }),
  right: face('right', [HALF_SIZE, 0, 0], [0, 0, -1], [0, 1, 0], [1, 0, 0], {
    left: 'front', right: 'back', top: 'top', bottom: 'bottom',
  }),
  back: face('back', [0, 0, -HALF_SIZE], [-1, 0, 0], [0, 1, 0], [0, 0, -1], {
    left: 'right', right: 'left', top: 'top', bottom: 'bottom',
  }),
  left: face('left', [-HALF_SIZE, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0], {
    left: 'back', right: 'front', top: 'top', bottom: 'bottom',
  }),
  top: face('top', [0, HALF_SIZE, 0], [1, 0, 0], [0, 0, -1], [0, 1, 0], {
    left: 'left', right: 'right', top: 'back', bottom: 'front',
  }),
  bottom: face('bottom', [0, -HALF_SIZE, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], {
    left: 'left', right: 'right', top: 'front', bottom: 'back',
  }),
};

export function localToBody(faceId: FaceId, u: number, v: number, normalOffset = 0): Vec3Like {
  const basis = FACE_GRAPH[faceId];
  return add(
    basis.origin,
    add(scale(basis.u, u), add(scale(basis.v, v), scale(basis.normal, normalOffset))),
  );
}

export function bodyToLocal(faceId: FaceId, point: Vec3Like): LocalPoint {
  const basis = FACE_GRAPH[faceId];
  const relative = subtract(point, basis.origin);
  return {
    u: dot(relative, basis.u),
    v: dot(relative, basis.v),
    normal: dot(relative, basis.normal),
  };
}

export function destinationForEdge(faceId: FaceId, edge: FaceEdge): FaceId {
  return FACE_GRAPH[faceId].neighbors[edge];
}

export function reciprocalEdge(source: FaceId, destination: FaceId): FaceEdge {
  const entries = Object.entries(FACE_GRAPH[destination].neighbors) as [FaceEdge, FaceId][];
  const result = entries.find(([, faceId]) => faceId === source);
  if (!result) throw new Error(`Faces ${source} and ${destination} are not adjacent`);
  return result[0];
}

export function transferVelocity(
  source: FaceId,
  destination: FaceId,
  velocity: { x: number; y: number },
): { x: number; y: number } {
  const sourceBasis = FACE_GRAPH[source];
  const destinationBasis = FACE_GRAPH[destination];
  const worldVelocity = add(scale(sourceBasis.u, velocity.x), scale(sourceBasis.v, velocity.y));
  const edgeAxis = sharedEdgeAxis(source, destination);
  const positive = rotateQuarter(sourceBasis.normal, edgeAxis, 1);
  const sign = dot(positive, destinationBasis.normal) > 0.999 ? 1 : -1;
  const rotatedVelocity = rotateQuarter(worldVelocity, edgeAxis, sign);
  return {
    x: dot(rotatedVelocity, destinationBasis.u),
    y: dot(rotatedVelocity, destinationBasis.v),
  };
}

export function sharedEdgeAxis(source: FaceId, destination: FaceId): Vec3Like {
  const basis = FACE_GRAPH[source];
  const edge = (Object.entries(basis.neighbors) as [FaceEdge, FaceId][]).find(([, id]) => id === destination)?.[0];
  if (!edge) throw new Error(`Faces ${source} and ${destination} are not adjacent`);
  return edge === 'left' || edge === 'right' ? basis.v : basis.u;
}

function rotateQuarter(vector: Vec3Like, axis: Vec3Like, sign: 1 | -1): Vec3Like {
  const crossTerm = cross(axis, vector);
  const axisTerm = scale(axis, dot(axis, vector));
  return add(scale(crossTerm, sign), axisTerm);
}

function face(
  id: FaceId,
  origin: [number, number, number],
  u: [number, number, number],
  v: [number, number, number],
  normal: [number, number, number],
  neighbors: Record<FaceEdge, FaceId>,
): FaceBasis {
  return { id, origin: vec(origin), u: vec(u), v: vec(v), normal: vec(normal), neighbors };
}

function vec(value: [number, number, number]): Vec3Like {
  return { x: value[0], y: value[1], z: value[2] };
}

function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3Like, factor: number): Vec3Like {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3Like, b: Vec3Like): Vec3Like {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
