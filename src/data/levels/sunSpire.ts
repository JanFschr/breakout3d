import type { BlockDefinition, LevelDefinition } from '../LevelDefinition';
import { brickGrid, type GridCellOverride } from '../levelBuilders';
import { assertValidLevel } from '../validateLevel';

const baseX = [-5.4, -3.6, -1.8, 0, 1.8, 3.6, 5.4] as const;
const sideX = [-3.8, -1.9, 0, 1.9, 3.8] as const;

function pyramidMask(row: number, column: number): boolean {
  if (row <= 2) return true;
  if (row <= 4) return column >= 1 && column <= 3;
  return column === 2;
}

function triangularCell(
  decorate?: (row: number, column: number) => GridCellOverride,
): (row: number, column: number) => GridCellOverride | null {
  return (row, column) => pyramidMask(row, column) ? decorate?.(row, column) ?? {} : null;
}

const blocks: BlockDefinition[] = [
  ...brickGrid({
    prefix: 'base', face: 'base', rows: 4, x: baseX, startY: 9.5, rowStep: 1.15, width: 1.5, height: 0.72,
    cell: (row, column) => row === 2 && (column === 1 || column === 5) ? { type: 'chain', score: 190 } : {},
  }),
  { id: 'anchor-base-north', type: 'anchor', face: 'base', edge: 'top', x: -2.8, y: 15.2, width: 1.2, height: 1.05, hitPoints: 2, score: 240 },
  { id: 'anchor-base-east', type: 'anchor', face: 'base', edge: 'right', x: 2.8, y: 15.2, width: 1.2, height: 1.05, hitPoints: 2, score: 240 },

  ...brickGrid({
    prefix: 'north', face: 'north', rows: 6, x: sideX, startY: 5.6, rowStep: 1.05, width: 1.58, height: 0.72,
    cell: triangularCell((row, column) => row === 2 && column === 2 ? { type: 'chain', score: 200 } : {}),
  }),
  { id: 'sun-lock-north', type: 'anchor', face: 'north', edge: 'right', x: 3.9, y: 6.7, width: 1.05, height: 1, hitPoints: 3, score: 320 },

  ...brickGrid({
    prefix: 'east', face: 'east', rows: 6, x: sideX, startY: 5.6, rowStep: 1.05, width: 1.58, height: 0.72,
    cell: triangularCell((row, column) => row === 1 && (column === 1 || column === 3) ? { type: 'chain', score: 190 } : {}),
  }),
  { id: 'prism-node', type: 'generator', face: 'east', x: 0, y: 11.8, width: 2.1, height: 1.15, hitPoints: 4, score: 720 },
  { id: 'anchor-east-south', type: 'anchor', face: 'east', edge: 'right', x: 3.9, y: 6.7, width: 1.05, height: 1, hitPoints: 2, score: 260 },

  ...brickGrid({
    prefix: 'south', face: 'south', rows: 6, x: sideX, startY: 5.6, rowStep: 1.05, width: 1.58, height: 0.72,
    cell: triangularCell((row, column) => row >= 1 && row <= 4 && column >= 1 && column <= 3
      ? { type: 'armor', group: 'south-armor', hitPoints: 7, score: 240 }
      : {}),
  }),
  { id: 'sun-lock-south', type: 'anchor', face: 'south', edge: 'right', x: 3.9, y: 6.7, width: 1.05, height: 1, hitPoints: 3, score: 340 },

  ...brickGrid({
    prefix: 'west', face: 'west', rows: 6, x: sideX, startY: 5.6, rowStep: 1.05, width: 1.58, height: 0.72,
    cell: triangularCell((row, column) => row === 2 && column === 2 ? { type: 'chain', score: 220 } : {}),
  }),
  { id: 'core-west', type: 'core', face: 'west', x: 0, y: 12.2, width: 2.45, height: 1.35, hitPoints: 6, exposed: false, score: 2600 },
];

export const SUN_SPIRE_LEVEL = {
  version: 1,
  id: 'pyramid-01-sun-spire',
  displayName: 'Sun Spire',
  body: { type: 'pyramid', implicitTransitions: false },
  startFace: 'base',
  faces: {
    base: { enabled: true }, north: { enabled: true }, east: { enabled: true },
    south: { enabled: true }, west: { enabled: true },
  },
  blocks,
  edges: [
    { face: 'base', edge: 'top', requiredAnchors: ['anchor-base-north'] },
    { face: 'base', edge: 'right', requiredAnchors: ['anchor-base-east'] },
    { face: 'north', edge: 'right', requiredAnchors: ['sun-lock-north'] },
    { face: 'east', edge: 'left', requiredAnchors: [] },
    { face: 'east', edge: 'right', requiredAnchors: ['anchor-east-south'] },
    { face: 'south', edge: 'left', requiredAnchors: [] },
    { face: 'south', edge: 'right', requiredAnchors: ['sun-lock-south'] },
    { face: 'west', edge: 'left', requiredAnchors: [] },
  ],
  dependencies: [
    { id: 'prism-weakens-south-armor', trigger: { type: 'blockDestroyed', blockId: 'prism-node' }, effects: [{ type: 'weakenGroup', group: 'south-armor' }] },
    { id: 'south-armor-exposes-core', trigger: { type: 'groupCleared', group: 'south-armor' }, effects: [{ type: 'exposeBlock', blockId: 'core-west' }] },
  ],
  objective: { type: 'destroyCore', blockId: 'core-west' },
  mastery: { comboTimeoutSeconds: 2.8, fullOrbitFaces: 4, overdriveSeconds: 9 },
  scoring: { parSeconds: 260, comboPeakTarget: 30, orbitTierTarget: 3, scoreTarget: 16000, starThresholds: [60, 84] },
} satisfies LevelDefinition;

assertValidLevel(SUN_SPIRE_LEVEL);
