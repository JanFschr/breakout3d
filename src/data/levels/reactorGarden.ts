import rawLevel from './reactor-garden.json';
import type { LevelDefinition } from '../LevelDefinition';
import { assertValidLevel } from '../validateLevel';

export const REACTOR_GARDEN_LEVEL = rawLevel as LevelDefinition;
assertValidLevel(REACTOR_GARDEN_LEVEL);
