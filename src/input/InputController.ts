export interface InputSnapshot {
  readonly pointerDeltaPixels: number;
  readonly gestureDeltaX: number;
  readonly gestureDeltaY: number;
  readonly keyboardAxis: -1 | 0 | 1;
}

export class InputController {
  private pointerActive = false;
  private lastPointerX: number | null = null;
  private lastPointerY: number | null = null;
  private accumulatedDeltaX = 0;
  private accumulatedDeltaY = 0;
  private leftDown = false;
  private rightDown = false;

  constructor(private readonly target: Window = window) {
    this.target.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    this.target.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.target.addEventListener('pointerup', this.onPointerUp, { passive: true });
    this.target.addEventListener('pointercancel', this.onPointerUp, { passive: true });
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
  }

  consumeSnapshot(): InputSnapshot {
    const pointerDeltaPixels = this.accumulatedDeltaX;
    const gestureDeltaX = this.accumulatedDeltaX;
    const gestureDeltaY = this.accumulatedDeltaY;
    this.accumulatedDeltaX = 0;
    this.accumulatedDeltaY = 0;
    return {
      pointerDeltaPixels,
      gestureDeltaX,
      gestureDeltaY,
      keyboardAxis: this.leftDown === this.rightDown ? 0 : this.leftDown ? -1 : 1,
    };
  }

  dispose(): void {
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('pointercancel', this.onPointerUp);
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerActive = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const shouldTrack = this.pointerActive || event.pointerType === 'mouse';
    if (!shouldTrack) return;

    if (this.lastPointerX !== null) this.accumulatedDeltaX += event.clientX - this.lastPointerX;
    if (this.lastPointerY !== null) this.accumulatedDeltaY += event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
  };

  private readonly onPointerUp = (): void => {
    this.pointerActive = false;
    this.lastPointerX = null;
    this.lastPointerY = null;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') this.leftDown = true;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') this.rightDown = true;
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') this.leftDown = false;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') this.rightDown = false;
  };
}
