// Minimal WASD/arrow keyboard state. The prototype needs nothing more: no
// remapping, no gamepad, no mouse aim (attacks are automatic by design).

export class KeyboardInput {
  private readonly pressed = new Set<string>();
  private readonly pressedOnce = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressedOnce.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    window.addEventListener('blur', () => {
      this.pressed.clear();
      this.pressedOnce.clear();
    });
  }

  /** Whether a specific key is currently held (e.g. 'KeyE'). */
  isDown(code: string): boolean {
    return this.pressed.has(code);
  }

  /** True once per physical key press. */
  consumePress(code: string): boolean {
    const pressed = this.pressedOnce.has(code);
    this.pressedOnce.delete(code);
    return pressed;
  }

  /** Normalized movement axis on the XZ plane: x = right, y = forward (-Z). */
  moveAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.pressed.has('KeyA') || this.pressed.has('ArrowLeft')) x -= 1;
    if (this.pressed.has('KeyD') || this.pressed.has('ArrowRight')) x += 1;
    if (this.pressed.has('KeyW') || this.pressed.has('ArrowUp')) y -= 1;
    if (this.pressed.has('KeyS') || this.pressed.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }
}
