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

export interface TriangularBrickGridOptions {
  readonly prefix: string;
  readonly face: FaceId;
  readonly columnsByRow: readonly number[];
  readonly startY: number;
  readonly rowStep: number;
  readonly width: number;
  readonly height: number;
  readonly columnStep: number;
  readonly cell?: (row: number, column: number, columns: number) => GridCellOverride | null;
}

/** Compact authoring helper. It only expands immutable level data; runtime never depends on it. */
export function brickGrid(options: BrickGridOptions): BlockDefinition[] {
  const blocks: BlockDefinition[] = [];
  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.x.length; column += 1) {
      const override = options.cell?.(row, column);
      if (override === null) continue;
      blocks.push(createGridBlock(
        `${options.prefix}-${row + 1}-${column + 1}`,
        options.face,
        options.x[column],
        options.startY + row * options.rowStep,
        options.width,
        options.height,
        override,
      ));
    }
  }
  return blocks;
}

/**
 * Authors a centered stepped triangle while preserving normal rectangular block
 * collision boxes. `columnsByRow` should shrink toward the apex.
 */
export function triangularBrickGrid(options: TriangularBrickGridOptions): BlockDefinition[] {
  const blocks: BlockDefinition[] = [];
  for (let row = 0; row < options.columnsByRow.length; row += 1) {
    const columns = options.columnsByRow[row];
    for (let column = 0; column < columns; column += 1) {
      const override = options.cell?.(row, column, columns);
      if (override === null) continue;
      const x = (column - (columns - 1) / 2) * options.columnStep;
      blocks.push(createGridBlock(
        `${options.prefix}-${row + 1}-${column + 1}`,
        options.face,
        x,
        options.startY + row * options.rowStep,
        options.width,
        options.height,
        override,
      ));
    }
  }
  return blocks;
}

function createGridBlock(
  id: string,
  face: FaceId,
  x: number,
  y: number,
  width: number,
  height: number,
  override?: GridCellOverride,
): BlockDefinition {
  return {
    id,
    type: override?.type ?? 'normal',
    face,
    x: Number(x.toFixed(3)),
    y: Number(y.toFixed(3)),
    width,
    height,
    hitPoints: override?.hitPoints ?? 1,
    ...(override?.group ? { group: override.group } : {}),
    ...(override?.score ? { score: override.score } : {}),
  };
}
