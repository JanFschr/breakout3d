import type { BlockDefinition, BlockType } from './LevelDefinition';
import type { FaceId } from '../world/FaceGraph';

export interface GridCellOverride {
  readonly type?: BlockType;
  readonly hitPoints?: number;
  readonly group?: string;
  readonly score?: number;
}

export interface BrickGridOptions {
  readonly prefix: string;
  readonly face: FaceId;
  readonly rows: number;
  readonly x: readonly number[];
  readonly startY: number;
  readonly rowStep: number;
  readonly width: number;
  readonly height: number;
  readonly cell?: (row: number, column: number) => GridCellOverride | null;
}

/** Compact authoring helper. It only expands immutable level data; runtime never depends on it. */
export function brickGrid(options: BrickGridOptions): BlockDefinition[] {
  const blocks: BlockDefinition[] = [];
  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.x.length; column += 1) {
      const override = options.cell?.(row, column);
      if (override === null) continue;
      blocks.push({
        id: `${options.prefix}-${row + 1}-${column + 1}`,
        type: override?.type ?? 'normal',
        face: options.face,
        x: options.x[column],
        y: Number((options.startY + row * options.rowStep).toFixed(3)),
        width: options.width,
        height: options.height,
        hitPoints: override?.hitPoints ?? 1,
        ...(override?.group ? { group: override.group } : {}),
        ...(override?.score ? { score: override.score } : {}),
      });
    }
  }
  return blocks;
}
