import type { BlockDefinition, LevelDefinition } from '../LevelDefinition';
import { brickGrid, triangularBrickGrid } from '../levelBuilders';
import { assertValidLevel } from '../validateLevel';

const baseX = [-5.6, -4.2, -2.8, -1.4, 0, 1.4, 2.8, 4.2, 5.6] as const;
const SIDE_COLUMNS = [9, 7, 7, 7, 5, 5, 5, 3, 3, 1] as const;
const SIDE_START_Y = 8.8;
const SIDE_ROW_STEP = 0.95;
const SIDE_WIDTH = 0.76;
const SIDE_HEIGHT = 0.58;
const SIDE_COLUMN_STEP = 0.82;

const blocks: BlockDefinition[] = [
  ...brickGrid({
    prefix: 'base', face: 'base', rows: 7, x: baseX, startY: 11.5, rowStep: 1, width: 1.16, height: 0.64,
    cell: (row, column) => {
      if (row === 2 && (column === 2 || column === 6)) return { type: 'chain', score: 190 };
      if (row === 5 && column >= 2 && column <= 6) return { type: 'armor', group: 'base-armor', hitPoints: 3, score: 150 };
      return {};
    },
  }),
  { id: 'anchor-base-north', type: 'anchor', face: 'base', edge: 'top', x: -3.1, y: 20.45, width: 1.05, height: 0.95, hitPoints: 2, score: 240 },
  { id: 'anchor-base-east', type: 'anchor', face: 'base', edge: 'right', x: 3.1, y: 20.45, width: 1.05, height: 0.95, hitPoints: 2, score: 240 },

  ...triangularBrickGrid({
    prefix: 'north', face: 'north', columnsByRow: SIDE_COLUMNS, startY: SIDE_START_Y, rowStep: SIDE_ROW_STEP,
    width: SIDE_WIDTH, height: SIDE_HEIGHT, columnStep: SIDE_COLUMN_STEP,
    cell: (row, column, columns) => {
      if (row === 4 && column === columns - 1) return null;
      if ((row === 2 || row === 6) && column === Math.floor(columns / 2)) return { type: 'chain', score: 200 };
      return {};
    },
  }),
  { id: 'sun-lock-north', type: 'anchor', face: 'north', edge: 'right', x: 2.45, y: 11, width: 0.8, height: 0.82, hitPoints: 3, score: 320 },

  ...triangularBrickGrid({
    prefix: 'east', face: 'east', columnsByRow: SIDE_COLUMNS, startY: SIDE_START_Y, rowStep: SIDE_ROW_STEP,
    width: SIDE_WIDTH, height: SIDE_HEIGHT, columnStep: SIDE_COLUMN_STEP,
    cell: (row, column, columns) => {
      if (row === 4 && column === columns - 1) return null;
      if (row === 8 && column === Math.floor(columns / 2)) return null;
      if (row === 1 && (column === 1 || column === columns - 2)) return { type: 'chain', score: 190 };
      return {};
    },
  }),
  { id: 'prism-node', type: 'generator', face: 'east', x: 0, y: 18.4, width: 1.4, height: 0.8, hitPoints: 4, score: 720 },
  { id: 'anchor-east-south', type: 'anchor', face: 'east', edge: 'right', x: 2.45, y: 11, width: 0.8, height: 0.82, hitPoints: 2, score: 260 },

  ...triangularBrickGrid({
    prefix: 'south', face: 'south', columnsByRow: SIDE_COLUMNS, startY: SIDE_START_Y, rowStep: SIDE_ROW_STEP,
    width: SIDE_WIDTH, height: SIDE_HEIGHT, columnStep: SIDE_COLUMN_STEP,
    cell: (row, column, columns) => {
      if (row === 4 && column === columns - 1) return null;
      if (row === 2 && column === Math.floor(columns / 2)) return { type: 'chain', score: 210 };
      if (row >= 4 && row <= 7) return { type: 'armor', group: 'south-armor', hitPoints: 6, score: 240 };
      return {};
    },
  }),
  { id: 'sun-lock-south', type: 'anchor', face: 'south', edge: 'right', x: 2.45, y: 11, width: 0.8, height: 0.82, hitPoints: 3, score: 340 },

  ...triangularBrickGrid({
    prefix: 'west', face: 'west', columnsByRow: SIDE_COLUMNS, startY: SIDE_START_Y, rowStep: SIDE_ROW_STEP,
    width: SIDE_WIDTH, height: SIDE_HEIGHT, columnStep: SIDE_COLUMN_STEP,
    cell: (row, column, columns) => {
      if (row === 9 && column === Math.floor(columns / 2)) return null;
      if ((row === 2 || row === 6) && column === Math.floor(columns / 2)) return { type: 'chain', score: 220 };
      return {};
    },
  }),
  { id: 'core-west', type: 'core', face: 'west', x: 0, y: 18.7, width: 1.5, height: 0.82, hitPoints: 6, exposed: false, score: 2600 },
];

export const SUN_SPIRE_LEVEL = {
  version: 1,
  id: 'pyramid-01-sun-spire',
  displayName: 'Sun Spire',
  body: { type: 'pyramid', implicitTransitions: false },
  startFace: 'north',
  faces: {
    base: { enabled: true }, north: { enabled: true }, east: { enabled: true },
    south: { enabled: true }, west: { enabled: true },
  },
  blocks,
  edges: [
    { face: 'base', edge: 'top', requiredAnchors: ['anchor-base-north'] },
    { face: 'base', edge: 'right', requiredAnchors: ['anchor-base-east'] },
    { face: 'north', edge: 'bottom', requiredAnchors: [] },
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
  mastery: { comboTimeoutSeconds: 3.8, fullOrbitFaces: 4, overdriveSeconds: 9 },
  scoring: { parSeconds: 430, comboPeakTarget: 48, orbitTierTarget: 3, scoreTarget: 29000, starThresholds: [60, 84] },
} satisfies LevelDefinition;

assertValidLevel(SUN_SPIRE_LEVEL);
