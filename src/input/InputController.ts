export interface InputSnapshot {
  pointerX: number | null;
  keyboardAxis: -1 | 0 | 1;
}

export class InputController {
  private pointerX: number | null = null;
  private leftDown = false;
  private rightDown = false;

  constructor(private readonly target: Window = window) {
    this.target.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
  }

  snapshot(): InputSnapshot {
    return {
      pointerX: this.pointerX,
      keyboardAxis: this.leftDown === this.rightDown ? 0 : this.leftDown ? -1 : 1,
    };
  }

  dispose(): void {
    this.target.removeEventListener('pointermove', this.onPointerMove);
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointerX = event.clientX;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft') this.leftDown = true;
    if (event.key === 'ArrowRight') this.rightDown = true;
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft') this.leftDown = false;
    if (event.key === 'ArrowRight') this.rightDown = false;
  };
}
