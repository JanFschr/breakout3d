import type { LevelDefinition } from '../LevelDefinition';
import { REACTOR_GARDEN_LEVEL } from './reactorGarden';
import { SUN_SPIRE_LEVEL } from './sunSpire';

export const LEVELS: readonly LevelDefinition[] = [REACTOR_GARDEN_LEVEL, SUN_SPIRE_LEVEL];

export function levelFromLocation(search: string): LevelDefinition {
  const id = new URLSearchParams(search).get('level');
  return LEVELS.find((level) => level.id === id) ?? LEVELS[0];
}

export function nextLevel(current: LevelDefinition): LevelDefinition | null {
  const index = LEVELS.findIndex((level) => level.id === current.id);
  return index >= 0 && index + 1 < LEVELS.length ? LEVELS[index + 1] : null;
}

export function levelUrl(level: LevelDefinition): string {
  const url = new URL(window.location.href);
  url.searchParams.set('level', level.id);
  url.searchParams.delete('debug');
  url.searchParams.delete('metrics');
  return `${url.pathname}${url.search}`;
}
