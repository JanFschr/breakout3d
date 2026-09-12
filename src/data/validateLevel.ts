import type { LevelDefinition } from './LevelDefinition';
import { FACE_GRAPH, FACE_IDS, type FaceEdge, type FaceId } from '../world/FaceGraph';

const PLAYABLE_TRANSITION_EDGES: readonly FaceEdge[] = ['left', 'right', 'top'];

export interface LevelValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateLevel(level: LevelDefinition): LevelValidationResult {
  const errors: string[] = [];
  const blocks = new Map(level.blocks.map((block) => [block.id, block]));

  if (!level.id.trim()) errors.push('level.id must not be empty');
  if (!level.faces[level.startFace]?.enabled) errors.push(`startFace ${level.startFace} is not enabled`);
  if (blocks.size !== level.blocks.length) errors.push('block ids must be unique');

  for (const faceId of FACE_IDS) {
    if (!level.faces[faceId]) errors.push(`missing face definition: ${faceId}`);
  }

  for (const block of level.blocks) {
    if (!level.faces[block.face]?.enabled) errors.push(`block ${block.id} references disabled face ${block.face}`);
    if (block.width <= 0 || block.height <= 0) errors.push(`block ${block.id} must have positive dimensions`);
    if (block.hitPoints <= 0) errors.push(`block ${block.id} must have positive hitPoints`);
    if (Math.abs(block.x) > 7.1 || block.y < 0 || block.y > 18) errors.push(`block ${block.id} is outside playable bounds`);
    if (block.type === 'anchor' && !block.edge) errors.push(`anchor ${block.id} must declare edge`);
  }

  for (const edge of level.edges) {
    if (!level.faces[edge.face]?.enabled) errors.push(`edge ${edge.face}:${edge.edge} uses disabled face`);
    const destination = FACE_GRAPH[edge.face].neighbors[edge.edge];
    if (!level.faces[destination]?.enabled) errors.push(`edge ${edge.face}:${edge.edge} points to disabled ${destination}`);
    for (const anchorId of edge.requiredAnchors) {
      const anchor = blocks.get(anchorId);
      if (!anchor) errors.push(`edge ${edge.face}:${edge.edge} references missing anchor ${anchorId}`);
      else if (anchor.type !== 'anchor') errors.push(`${anchorId} is required as anchor but has type ${anchor.type}`);
      else if (anchor.face !== edge.face) errors.push(`anchor ${anchorId} must live on source face ${edge.face}`);
      else if (anchor.edge !== edge.edge) errors.push(`anchor ${anchorId} edge mismatch: ${anchor.edge} != ${edge.edge}`);
    }
  }

  for (const rule of level.dependencies) {
    if (rule.trigger.type === 'blockDestroyed' && !blocks.has(rule.trigger.blockId)) {
      errors.push(`dependency ${rule.id} references missing source block ${rule.trigger.blockId}`);
    }
    for (const effect of rule.effects) {
      if (effect.type === 'exposeBlock' && !blocks.has(effect.blockId)) {
        errors.push(`dependency ${rule.id} exposes missing block ${effect.blockId}`);
      }
      if (effect.type === 'weakenGroup' && !level.blocks.some((block) => block.group === effect.group)) {
        errors.push(`dependency ${rule.id} weakens empty group ${effect.group}`);
      }
    }
  }

  const objective = blocks.get(level.objective.blockId);
  if (!objective) errors.push(`objective references missing block ${level.objective.blockId}`);
  else if (objective.type !== 'core') errors.push(`objective block ${objective.id} must be core`);

  errors.push(...validateReachability(level));
  return { valid: errors.length === 0, errors };
}

export function assertValidLevel(level: LevelDefinition): void {
  const result = validateLevel(level);
  if (!result.valid) throw new Error(`Invalid level ${level.id}:\n${result.errors.join('\n')}`);
}

function validateReachability(level: LevelDefinition): string[] {
  const errors: string[] = [];
  const reachable = new Set<FaceId>([level.startFace]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const face of [...reachable]) {
      for (const edge of PLAYABLE_TRANSITION_EDGES) {
        const destination = FACE_GRAPH[face].neighbors[edge];
        if (!level.faces[destination]?.enabled || reachable.has(destination)) continue;
        const config = level.edges.find((candidate) => candidate.face === face && candidate.edge === edge);
        const anchorsAreLocal = (config?.requiredAnchors ?? []).every((anchorId) => {
          const anchor = level.blocks.find((block) => block.id === anchorId);
          return anchor?.face === face && anchor.type === 'anchor';
        });
        if (anchorsAreLocal) {
          reachable.add(destination);
          changed = true;
        }
      }
    }
  }

  const requiredBlocks = new Set<string>([level.objective.blockId]);
  for (const rule of level.dependencies) {
    if (rule.trigger.type === 'blockDestroyed') requiredBlocks.add(rule.trigger.blockId);
    for (const effect of rule.effects) if (effect.type === 'exposeBlock') requiredBlocks.add(effect.blockId);
  }

  for (const blockId of requiredBlocks) {
    const block = level.blocks.find((candidate) => candidate.id === blockId);
    if (block && !reachable.has(block.face)) errors.push(`required block ${blockId} on ${block.face} is unreachable from ${level.startFace}`);
  }

  return errors;
}
