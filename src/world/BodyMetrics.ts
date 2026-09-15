export const BODY_WIDTH = 14;
export const BODY_HALF_WIDTH = BODY_WIDTH / 2;
export const PORTRAIT_FACE_HEIGHT = 22;
export const PORTRAIT_FACE_HALF_HEIGHT = PORTRAIT_FACE_HEIGHT / 2;
export const CUBE_DEPTH = 14;
export const CUBE_HALF_DEPTH = CUBE_DEPTH / 2;

export const PYRAMID_SIDE_SLANT = PORTRAIT_FACE_HEIGHT;
export const PYRAMID_RISE = Math.sqrt(PYRAMID_SIDE_SLANT ** 2 - BODY_HALF_WIDTH ** 2);
export const PYRAMID_BASE_Y = -PYRAMID_RISE / 2;
export const PYRAMID_APEX_Y = PYRAMID_RISE / 2;
export const PYRAMID_MID_Y = 0;
export const PYRAMID_MID_INSET = BODY_HALF_WIDTH / 2;

export function isPortraitSideFace(faceId: string): boolean {
  return faceId === 'front'
    || faceId === 'right'
    || faceId === 'back'
    || faceId === 'left'
    || faceId === 'north'
    || faceId === 'east'
    || faceId === 'south'
    || faceId === 'west';
}

export function visualFaceHeight(faceId: string): number {
  return isPortraitSideFace(faceId) ? PORTRAIT_FACE_HEIGHT : BODY_WIDTH;
}

export function visualYScale(faceId: string, gameplayFieldHeight: number): number {
  return visualFaceHeight(faceId) / gameplayFieldHeight;
}
