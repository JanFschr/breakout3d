import type { BodyType, FaceEdge, FaceId } from '../world/FaceGraph';

export type BlockType = 'normal' | 'armor' | 'anchor' | 'generator' | 'chain' | 'core';
export interface LevelBodyDefinition {
  readonly type: BodyType;
  /** When false, only edges listed in `edges` may trigger an Edge Ride. */
  readonly implicitTransitions?: boolean;
}
export interface LevelFaceDefinition { readonly enabled: boolean; }
export interface BlockDefinition {
  readonly id: string; readonly type: BlockType; readonly face: FaceId; readonly x: number; readonly y: number;
  readonly width: number; readonly height: number; readonly hitPoints: number; readonly group?: string; readonly edge?: FaceEdge;
  readonly exposed?: boolean; readonly score?: number;
}
export interface EdgeDefinition { readonly face: FaceId; readonly edge: FaceEdge; readonly requiredAnchors: readonly string[]; }
export type DependencyTrigger = { readonly type: 'blockDestroyed'; readonly blockId: string } | { readonly type: 'groupCleared'; readonly group: string };
export type DependencyEffect = { readonly type: 'weakenGroup'; readonly group: string } | { readonly type: 'exposeBlock'; readonly blockId: string };
export interface DependencyRule { readonly id: string; readonly trigger: DependencyTrigger; readonly effects: readonly DependencyEffect[]; }
export interface CoreObjective { readonly type: 'destroyCore'; readonly blockId: string; }
export interface MasteryDefinition { readonly comboTimeoutSeconds: number; readonly fullOrbitFaces: number; readonly overdriveSeconds: number; }
export interface ScoringDefinition {
  readonly parSeconds: number;
  readonly comboPeakTarget: number;
  readonly orbitTierTarget: number;
  readonly scoreTarget: number;
  readonly starThresholds: readonly [number, number];
}
export interface LevelDefinition {
  readonly version: 1;
  readonly id: string;
  readonly displayName: string;
  readonly body: LevelBodyDefinition;
  readonly startFace: FaceId;
  readonly faces: Partial<Record<FaceId, LevelFaceDefinition>>;
  readonly blocks: readonly BlockDefinition[];
  readonly edges: readonly EdgeDefinition[];
  readonly dependencies: readonly DependencyRule[];
  readonly objective: CoreObjective;
  readonly mastery: MasteryDefinition;
  readonly scoring: ScoringDefinition;
}
