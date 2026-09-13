import type { BlockDefinition, LevelDefinition } from '../LevelDefinition';
import { brickGrid } from '../levelBuilders';
import { assertValidLevel } from '../validateLevel';

const nineX = [-5.6, -4.2, -2.8, -1.4, 0, 1.4, 2.8, 4.2, 5.6] as const;
const eightX = [-5.35, -3.82, -2.29, -0.76, 0.76, 2.29, 3.82, 5.35] as const;
const sevenX = [-5.1, -3.4, -1.7, 0, 1.7, 3.4, 5.1] as const;

const blocks: BlockDefinition[] = [
  ...brickGrid({
    prefix: 'front', face: 'front', rows: 8, x: nineX, startY: 8.7, rowStep: 0.92, width: 1.16, height: 0.64,
    cell: (row, column) => {
      if (row === 5 && column >= 1 && column <= 7) return { type: 'armor', group: 'front-armor', hitPoints: 6, score: 180 };
      if (row === 2 && (column === 2 || column === 6)) return { type: 'chain', score: 170 };
      return {};
    },
  }),
  { id: 'anchor-front-left', type: 'anchor', face: 'front', edge: 'left', x: -5.8, y: 16.55, width: 1.05, height: 0.95, hitPoints: 2, score: 220 },
  { id: 'anchor-front-top', type: 'anchor', face: 'front', edge: 'top', x: 0, y: 16.55, width: 1.05, height: 0.95, hitPoints: 2, score: 220 },
  { id: 'anchor-front-right', type: 'anchor', face: 'front', edge: 'right', x: 5.8, y: 16.55, width: 1.05, height: 0.95, hitPoints: 2, score: 220 },

  ...brickGrid({
    prefix: 'right', face: 'right', rows: 7, x: eightX, startY: 8.9, rowStep: 1, width: 1.25, height: 0.66,
    cell: (row, column) => {
      if (row === 4 && column >= 2 && column <= 5) return { type: 'armor', group: 'right-armor', hitPoints: 4, score: 150 };
      if (row === 1 && (column === 1 || column === 6)) return { type: 'chain', score: 170 };
      return {};
    },
  }),
  { id: 'generator-g1', type: 'generator', face: 'right', x: 0, y: 16.05, width: 2.05, height: 1.05, hitPoints: 4, score: 600 },
  { id: 'anchor-right-top', type: 'anchor', face: 'right', edge: 'top', x: -4.9, y: 17.05, width: 1, height: 0.9, hitPoints: 2, score: 220 },
  { id: 'anchor-right-back', type: 'anchor', face: 'right', edge: 'right', x: 4.9, y: 17.05, width: 1, height: 0.9, hitPoints: 3, score: 260 },

  ...brickGrid({
    prefix: 'top', face: 'top', rows: 6, x: sevenX, startY: 9.1, rowStep: 1.05, width: 1.38, height: 0.68,
    cell: (row, column) => row === 3 && column >= 1 && column <= 5 ? { type: 'chain', score: 180 } : {},
  }),
  { id: 'anchor-top-back', type: 'anchor', face: 'top', edge: 'top', x: 0, y: 16.45, width: 1.05, height: 0.95, hitPoints: 2, score: 240 },

  ...brickGrid({
    prefix: 'left', face: 'left', rows: 6, x: sevenX, startY: 9.1, rowStep: 1.05, width: 1.38, height: 0.68,
    cell: (row, column) => row === 2 && (column === 0 || column === 6) ? { type: 'chain', score: 180 } : {},
  }),
  { id: 'generator-g2', type: 'generator', face: 'left', x: 0, y: 16.05, width: 2.05, height: 1.05, hitPoints: 4, score: 600 },
  { id: 'anchor-left-back', type: 'anchor', face: 'left', edge: 'left', x: -5.1, y: 17, width: 1, height: 0.9, hitPoints: 2, score: 240 },

  ...brickGrid({
    prefix: 'back', face: 'back', rows: 6, x: eightX, startY: 9.3, rowStep: 1.05, width: 1.25, height: 0.66,
    cell: (row) => row === 5 ? { type: 'armor', group: 'back-armor', hitPoints: 7, score: 220 } : {},
  }),
  { id: 'core-back', type: 'core', face: 'back', x: 0, y: 16.45, width: 2.45, height: 1.25, hitPoints: 5, exposed: false, score: 2200 },
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
  mastery: { comboTimeoutSeconds: 3.1, fullOrbitFaces: 4, overdriveSeconds: 8 },
  scoring: { parSeconds: 320, comboPeakTarget: 44, orbitTierTarget: 3, scoreTarget: 24500, starThresholds: [60, 84] },
} satisfies LevelDefinition;

assertValidLevel(REACTOR_GARDEN_LEVEL);
