import type { BlockDefinition, LevelDefinition } from '../LevelDefinition';
import { brickGrid } from '../levelBuilders';
import { assertValidLevel } from '../validateLevel';

const frontX = [-5.6, -4, -2.4, -0.8, 0.8, 2.4, 4, 5.6] as const;
const sixX = [-5, -3, -1, 1, 3, 5] as const;
const fiveX = [-4.8, -2.4, 0, 2.4, 4.8] as const;

const blocks: BlockDefinition[] = [
  ...brickGrid({
    prefix: 'front', face: 'front', rows: 6, x: frontX, startY: 9.2, rowStep: 1.05, width: 1.35, height: 0.7,
    cell: (row, column) => row === 4 && column >= 1 && column <= 6
      ? { type: 'armor', group: 'front-armor', hitPoints: 6, score: 180 }
      : {},
  }),
  { id: 'anchor-front-left', type: 'anchor', face: 'front', edge: 'left', x: -5.8, y: 16.2, width: 1.15, height: 1.05, hitPoints: 2, score: 220 },
  { id: 'anchor-front-top', type: 'anchor', face: 'front', edge: 'top', x: 0, y: 16.2, width: 1.15, height: 1.05, hitPoints: 2, score: 220 },
  { id: 'anchor-front-right', type: 'anchor', face: 'front', edge: 'right', x: 5.8, y: 16.2, width: 1.15, height: 1.05, hitPoints: 2, score: 220 },

  ...brickGrid({
    prefix: 'right', face: 'right', rows: 5, x: sixX, startY: 9.4, rowStep: 1.1, width: 1.55, height: 0.7,
    cell: (row, column) => row === 3 && (column === 2 || column === 3)
      ? { type: 'armor', group: 'right-armor', hitPoints: 4, score: 150 }
      : {},
  }),
  { id: 'generator-g1', type: 'generator', face: 'right', x: 0, y: 15.6, width: 2.2, height: 1.15, hitPoints: 4, score: 600 },
  { id: 'anchor-right-top', type: 'anchor', face: 'right', edge: 'top', x: -4.8, y: 16.6, width: 1.1, height: 1, hitPoints: 2, score: 220 },
  { id: 'anchor-right-back', type: 'anchor', face: 'right', edge: 'right', x: 4.8, y: 16.6, width: 1.1, height: 1, hitPoints: 3, score: 260 },

  ...brickGrid({
    prefix: 'top', face: 'top', rows: 4, x: fiveX, startY: 10, rowStep: 1.25, width: 1.7, height: 0.74,
    cell: (row, column) => row === 2 && column >= 1 && column <= 3 ? { type: 'chain', score: 180 } : {},
  }),
  { id: 'anchor-top-back', type: 'anchor', face: 'top', edge: 'top', x: 0, y: 16.4, width: 1.15, height: 1, hitPoints: 2, score: 240 },

  ...brickGrid({
    prefix: 'left', face: 'left', rows: 4, x: fiveX, startY: 10, rowStep: 1.25, width: 1.7, height: 0.74,
    cell: (row, column) => row === 1 && (column === 0 || column === 4) ? { type: 'chain', score: 180 } : {},
  }),
  { id: 'generator-g2', type: 'generator', face: 'left', x: 0, y: 15.5, width: 2.2, height: 1.15, hitPoints: 4, score: 600 },
  { id: 'anchor-left-back', type: 'anchor', face: 'left', edge: 'left', x: -5.1, y: 16.3, width: 1.1, height: 1, hitPoints: 2, score: 240 },

  ...brickGrid({
    prefix: 'back', face: 'back', rows: 3, x: sixX, startY: 10, rowStep: 1.25, width: 1.55, height: 0.72,
    cell: (row) => row === 2 ? { type: 'armor', group: 'back-armor', hitPoints: 7, score: 220 } : {},
  }),
  { id: 'core-back', type: 'core', face: 'back', x: 0, y: 15.8, width: 2.6, height: 1.4, hitPoints: 5, exposed: false, score: 2200 },
];

export const REACTOR_GARDEN_LEVEL = {
  version: 1,
  id: 'cube-01-reactor-garden',
  displayName: 'Reactor Garden Expanded',
  body: { type: 'cube', implicitTransitions: false },
  startFace: 'front',
  faces: {
    front: { enabled: true }, right: { enabled: true }, back: { enabled: true },
    left: { enabled: true }, top: { enabled: true }, bottom: { enabled: false },
  },
  blocks,
  edges: [
    { face: 'front', edge: 'left', requiredAnchors: ['anchor-front-left'] },
    { face: 'front', edge: 'right', requiredAnchors: ['anchor-front-right'] },
    { face: 'front', edge: 'top', requiredAnchors: ['anchor-front-top'] },
    { face: 'right', edge: 'top', requiredAnchors: ['anchor-right-top'] },
    { face: 'right', edge: 'right', requiredAnchors: ['anchor-right-back'] },
    { face: 'left', edge: 'left', requiredAnchors: ['anchor-left-back'] },
    { face: 'top', edge: 'top', requiredAnchors: ['anchor-top-back'] },
    { face: 'top', edge: 'left', requiredAnchors: [] },
    { face: 'top', edge: 'right', requiredAnchors: [] },
  ],
  dependencies: [
    { id: 'g1-weakens-front-armor', trigger: { type: 'blockDestroyed', blockId: 'generator-g1' }, effects: [{ type: 'weakenGroup', group: 'front-armor' }] },
    { id: 'g2-weakens-back-armor', trigger: { type: 'blockDestroyed', blockId: 'generator-g2' }, effects: [{ type: 'weakenGroup', group: 'back-armor' }] },
    { id: 'back-armor-exposes-core', trigger: { type: 'groupCleared', group: 'back-armor' }, effects: [{ type: 'exposeBlock', blockId: 'core-back' }] },
  ],
  objective: { type: 'destroyCore', blockId: 'core-back' },
  mastery: { comboTimeoutSeconds: 2.7, fullOrbitFaces: 4, overdriveSeconds: 8 },
  scoring: { parSeconds: 240, comboPeakTarget: 28, orbitTierTarget: 3, scoreTarget: 15000, starThresholds: [60, 84] },
} satisfies LevelDefinition;

assertValidLevel(REACTOR_GARDEN_LEVEL);
