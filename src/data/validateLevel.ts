import { blockFitsTriangularFace, isTriangularPlayfield } from '../physics/FacePlayfield';
import { BODY_FACE_IDS, FACE_GRAPH, type FaceEdge, type FaceId } from '../world/FaceGraph';
import type { LevelDefinition } from './LevelDefinition';

const PLAYABLE_TRANSITION_EDGES: readonly FaceEdge[] = ['left', 'right', 'top'];
const PLAYFIELD = { fieldWidth: 14, fieldHeight: 18 } as const;
export interface LevelValidationResult { readonly valid: boolean; readonly errors: readonly string[]; }

export function validateLevel(level: LevelDefinition): LevelValidationResult {
  const errors: string[] = [];
  const blocks = new Map(level.blocks.map((block) => [block.id, block]));
  const bodyFaces = BODY_FACE_IDS[level.body.type];
  const bodyFaceSet = new Set<FaceId>(bodyFaces);

  if (!level.id.trim()) errors.push('level.id must not be empty');
  if (!bodyFaceSet.has(level.startFace)) errors.push(`startFace ${level.startFace} does not belong to ${level.body.type}`);
  if (!level.faces[level.startFace]?.enabled) errors.push(`startFace ${level.startFace} is not enabled`);
  if (blocks.size !== level.blocks.length) errors.push('block ids must be unique');
  for (const faceId of bodyFaces) if (!level.faces[faceId]) errors.push(`missing face definition: ${faceId}`);
  for (const [faceId, face] of Object.entries(level.faces) as [FaceId, { enabled: boolean }][]) {
    if (face.enabled && !bodyFaceSet.has(faceId)) errors.push(`enabled face ${faceId} does not belong to ${level.body.type}`);
  }

  for (const block of level.blocks) {
    if (!bodyFaceSet.has(block.face)) errors.push(`block ${block.id} references face ${block.face} outside ${level.body.type}`);
    if (!level.faces[block.face]?.enabled) errors.push(`block ${block.id} references disabled face ${block.face}`);
    if (block.width <= 0 || block.height <= 0) errors.push(`block ${block.id} must have positive dimensions`);
    if (block.hitPoints <= 0) errors.push(`block ${block.id} must have positive hitPoints`);
    if (Math.abs(block.x) > 7.1 || block.y < 0 || block.y > 18) errors.push(`block ${block.id} is outside playable bounds`);
    if (isTriangularPlayfield(level.body.type, block.face)
      && !blockFitsTriangularFace(PLAYFIELD, block.x, block.y, block.width, block.height)) {
      errors.push(`block ${block.id} does not fit inside triangular face ${block.face}`);
    }
    if (block.type === 'anchor' && !block.edge) errors.push(`anchor ${block.id} must declare edge`);
  }

  const edgeKeys = new Set<string>();
  for (const edge of level.edges) {
    const key = `${edge.face}:${edge.edge}`;
    if (edgeKeys.has(key)) errors.push(`duplicate edge definition ${key}`);
    edgeKeys.add(key);
    if (!bodyFaceSet.has(edge.face)) errors.push(`edge ${key} uses face outside ${level.body.type}`);
    if (!level.faces[edge.face]?.enabled) errors.push(`edge ${key} uses disabled face`);
    const destination = FACE_GRAPH[edge.face].neighbors[edge.edge];
    if (destination === edge.face) errors.push(`edge ${key} does not lead to another face`);
    if (!bodyFaceSet.has(destination)) errors.push(`edge ${key} points outside ${level.body.type}`);
    if (!level.faces[destination]?.enabled) errors.push(`edge ${key} points to disabled ${destination}`);
    for (const anchorId of edge.requiredAnchors) {
      const anchor = blocks.get(anchorId);
      if (!anchor) errors.push(`edge ${key} references missing anchor ${anchorId}`);
      else if (anchor.type !== 'anchor') errors.push(`${anchorId} is required as anchor but has type ${anchor.type}`);
      else if (anchor.face !== edge.face) errors.push(`anchor ${anchorId} must live on source face ${edge.face}`);
      else if (anchor.edge !== edge.edge) errors.push(`anchor ${anchorId} edge mismatch: ${anchor.edge} != ${edge.edge}`);
    }
  }

  for (const rule of level.dependencies) {
    if (rule.trigger.type === 'blockDestroyed' && !blocks.has(rule.trigger.blockId)) errors.push(`dependency ${rule.id} references missing source block ${rule.trigger.blockId}`);
    for (const effect of rule.effects) {
      if (effect.type === 'exposeBlock' && !blocks.has(effect.blockId)) errors.push(`dependency ${rule.id} exposes missing block ${effect.blockId}`);
      if (effect.type === 'weakenGroup' && !level.blocks.some((block) => block.group === effect.group)) errors.push(`dependency ${rule.id} weakens empty group ${effect.group}`);
    }
  }

  const objective = blocks.get(level.objective.blockId);
  if (!objective) errors.push(`objective references missing block ${level.objective.blockId}`);
  else if (objective.type !== 'core') errors.push(`objective block ${objective.id} must be core`);
  if (level.mastery.comboTimeoutSeconds <= 0) errors.push('mastery.comboTimeoutSeconds must be positive');
  if (level.mastery.fullOrbitFaces < 2 || level.mastery.fullOrbitFaces > bodyFaces.length) errors.push(`mastery.fullOrbitFaces must be between 2 and ${bodyFaces.length}`);
  if (level.mastery.overdriveSeconds <= 0) errors.push('mastery.overdriveSeconds must be positive');
  if (level.scoring.parSeconds <= 0 || level.scoring.comboPeakTarget <= 0 || level.scoring.scoreTarget <= 0) errors.push('scoring targets must be positive');
  if (level.scoring.starThresholds[0] >= level.scoring.starThresholds[1]) errors.push('starThresholds must be strictly increasing');
  errors.push(...validateReachability(level));
  return { valid: errors.length === 0, errors };
}

export function assertValidLevel(level: LevelDefinition): void {
  const result = validateLevel(level);
  if (!result.valid) throw new Error(`Invalid level ${level.id}:\n${result.errors.join('\n')}`);
}

function validateReachability(level: LevelDefinition): string[] {
  const errors: string[] = [];
  const bodyFaces = new Set<FaceId>(BODY_FACE_IDS[level.body.type]);
  const reachable = new Set<FaceId>([level.startFace]);
  const implicit = level.body.implicitTransitions !== false;
  let changed = true;
  while (changed) {
    changed = false;
    for (const face of [...reachable]) {
      for (const edge of PLAYABLE_TRANSITION_EDGES) {
        const config = level.edges.find((candidate) => candidate.face === face && candidate.edge === edge);
        if (!implicit && !config) continue;
        const destination = FACE_GRAPH[face].neighbors[edge];
        if (destination === face || !bodyFaces.has(destination) || !level.faces[destination]?.enabled || reachable.has(destination)) continue;
        const anchorsAreLocal = (config?.requiredAnchors ?? []).every((anchorId) => {
          const anchor = level.blocks.find((block) => block.id === anchorId);
          return anchor?.face === face && anchor.type === 'anchor';
        });
        if (anchorsAreLocal) { reachable.add(destination); changed = true; }
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
