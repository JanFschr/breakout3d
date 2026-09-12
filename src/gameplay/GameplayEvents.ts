import type { BlockType } from '../data/LevelDefinition';
import type { DependencyMutation } from './DependencyEngine';
import type { FaceEdge, FaceId } from '../world/FaceGraph';

export type FlipRating = 'normal' | 'good' | 'perfect';

export type GameplayEvent =
  | { readonly type: 'BlockHit'; readonly blockId: string; readonly blockType: BlockType; readonly points: number; readonly destroyed: boolean }
  | { readonly type: 'BlockDestroyed'; readonly blockId: string; readonly blockType: BlockType; readonly face: FaceId }
  | { readonly type: 'GeneratorDestroyed'; readonly blockId: string; readonly face: FaceId }
  | { readonly type: 'ChainTriggered'; readonly blockId: string; readonly face: FaceId }
  | { readonly type: 'CoreExposed'; readonly blockId: string }
  | { readonly type: 'CoreDestroyed'; readonly blockId: string; readonly face: FaceId }
  | { readonly type: 'DependencyTriggered'; readonly mutation: DependencyMutation }
  | { readonly type: 'LifeLost'; readonly remainingLives: number; readonly face: FaceId }
  | { readonly type: 'EdgeCommitted'; readonly sourceFace: FaceId; readonly destinationFace: FaceId; readonly edge: FaceEdge; readonly rating: FlipRating }
  | { readonly type: 'FaceEntered'; readonly face: FaceId; readonly previousFace: FaceId }
  | { readonly type: 'FlipRated'; readonly rating: FlipRating };

export type GameplayEventListener = (event: GameplayEvent) => void;

export class GameplayEventBus {
  private readonly listeners = new Set<GameplayEventListener>();

  emit(event: GameplayEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: GameplayEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
