import type { BlockDefinition } from '../data/LevelDefinition';
import type { BlockState } from './contracts';

export interface BlockHitResult {
  readonly blocked: boolean;
  readonly destroyed: boolean;
  readonly score: number;
}

export function createBlockState(definition: BlockDefinition): BlockState {
  return {
    id: definition.id,
    type: definition.type,
    face: definition.face,
    position: { x: definition.x, y: definition.y },
    width: definition.width,
    height: definition.height,
    hitPoints: definition.hitPoints,
    maxHitPoints: definition.hitPoints,
    destroyed: false,
    group: definition.group,
    edge: definition.edge,
    armorMode: definition.type === 'armor' ? 'protected' : undefined,
    exposed: definition.type !== 'core' || definition.exposed === true,
    scoreValue: definition.score ?? defaultScore(definition.type),
  };
}

export function hitBlock(block: BlockState): BlockHitResult {
  if (block.destroyed) return { blocked: false, destroyed: true, score: 0 };
  if (block.type === 'core' && !block.exposed) return { blocked: true, destroyed: false, score: 5 };

  const damage = block.type === 'armor' && block.armorMode === 'weakened' ? 4 : 1;
  block.hitPoints -= damage;
  if (block.hitPoints <= 0) {
    block.hitPoints = 0;
    block.destroyed = true;
    return { blocked: false, destroyed: true, score: block.scoreValue };
  }
  return { blocked: false, destroyed: false, score: Math.max(10, Math.round(block.scoreValue * 0.12)) };
}

export function forceDestroyBlock(block: BlockState): boolean {
  if (block.destroyed) return false;
  if (block.type === 'core' && !block.exposed) return false;
  block.hitPoints = 0;
  block.destroyed = true;
  return true;
}

function defaultScore(type: BlockDefinition['type']): number {
  if (type === 'normal') return 100;
  if (type === 'armor') return 220;
  if (type === 'anchor') return 180;
  if (type === 'generator') return 500;
  if (type === 'chain') return 160;
  return 1600;
}
