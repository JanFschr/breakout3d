import type { DependencyEffect, DependencyRule, LevelDefinition } from '../data/LevelDefinition';
import type { BlockState, BreakoutState } from './contracts';

export interface DependencyMutation {
  readonly ruleId: string;
  readonly effect: DependencyEffect;
}

export class DependencyEngine {
  private readonly triggeredRules = new Set<string>();

  constructor(
    private readonly level: LevelDefinition,
    private readonly state: BreakoutState,
  ) {}

  onBlockDestroyed(blockId: string): DependencyMutation[] {
    const mutations: DependencyMutation[] = [];
    for (const rule of this.level.dependencies) {
      if (this.triggeredRules.has(rule.id)) continue;
      if (rule.trigger.type === 'blockDestroyed' && rule.trigger.blockId === blockId) {
        mutations.push(...this.trigger(rule));
      }
    }
    mutations.push(...this.evaluateGroupRules());
    return mutations;
  }

  evaluateGroupRules(): DependencyMutation[] {
    const mutations: DependencyMutation[] = [];
    for (const rule of this.level.dependencies) {
      if (this.triggeredRules.has(rule.id) || rule.trigger.type !== 'groupCleared') continue;
      const groupBlocks = this.allBlocks().filter((block) => block.group === rule.trigger.group);
      if (groupBlocks.length > 0 && groupBlocks.every((block) => block.destroyed)) {
        mutations.push(...this.trigger(rule));
      }
    }
    return mutations;
  }

  private trigger(rule: DependencyRule): DependencyMutation[] {
    this.triggeredRules.add(rule.id);
    for (const effect of rule.effects) this.apply(effect);
    return rule.effects.map((effect) => ({ ruleId: rule.id, effect }));
  }

  private apply(effect: DependencyEffect): void {
    if (effect.type === 'weakenGroup') {
      for (const block of this.allBlocks()) {
        if (block.group === effect.group && block.type === 'armor' && !block.destroyed) block.armorMode = 'weakened';
      }
      return;
    }
    const target = this.findBlock(effect.blockId);
    if (target) target.exposed = true;
  }

  private allBlocks(): BlockState[] {
    return Object.values(this.state.faces).flatMap((face) => face.blocks);
  }

  private findBlock(id: string): BlockState | undefined {
    return this.allBlocks().find((block) => block.id === id);
  }
}
