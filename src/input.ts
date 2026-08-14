// Action-based input over keyboard + gamepad. Attacks stay automatic by
// design (no mouse aim); the rebindable surface is movement + Interact.
// Escape and the gamepad Start button are reserved for pause/cancel, and
// the left stick always drives movement (analog, on top of bound buttons).

import { type ActionId, type ControlBindings, cloneBindings, DEFAULT_BINDINGS } from './settings';

const STICK_DEADZONE = 0.25;
const PAUSE_BUTTON = 9; // Start on the standard mapping.

/**
 * Normalizes a NON-standard (DirectInput) pad to the standard button layout.
 * DualShock over DirectInput reports 0=Square 1=Cross 2=Circle 3=Triangle
 * (so "action" landed on Square — 2026-07-13 user repro) and the d-pad as an
 * 8-way HAT encoded in axes[9] instead of buttons 12-15.
 */
function translateDirectInput(pad: Gamepad, raw: boolean[]): boolean[] {
  const t = [...raw];
  t[0] = raw[1] ?? false; // Cross → action (A)
  t[1] = raw[2] ?? false; // Circle → back (B)
  t[2] = raw[0] ?? false; // Square → X
  t[9] = raw[9] ?? false; // Options → Start (pause)

  // HAT: idle reads > 1; directions encode as (dir/7)*2-1, dir 0..7
  // clockwise from up (0=up, 2=right, 4=down, 6=left).
  const hat = pad.axes[9];
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  if (typeof hat === 'number' && hat >= -1 && hat <= 1) {
    const dir = Math.round(((hat + 1) / 2) * 7);
    up = dir === 7 || dir === 0 || dir === 1;
    right = dir >= 1 && dir <= 3;
    down = dir >= 3 && dir <= 5;
    left = dir >= 5 && dir <= 7;
  }
  t[12] = up;
  t[13] = down;
  t[14] = left;
  t[15] = right;
  return t;
}

export class PlayerInput {
  private readonly pressed = new Set<string>();
  private readonly pressedOnce = new Set<string>();
  private bindings: ControlBindings = cloneBindings(DEFAULT_BINDINGS);

  // Gamepad state, refreshed once per frame by poll() — the Gamepad API has
  // no events for buttons, it must be sampled.
  private padButtons: boolean[] = [];
  private padButtonsOnce: boolean[] = [];
  private padAxisX = 0;
  private padAxisY = 0;
  private padConnected = false;

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

  setBindings(bindings: ControlBindings): void {
    this.bindings = cloneBindings(bindings);
  }

  /** Samples the first connected gamepad. Call once per frame, before reads.
   *  Prefers a standard-mapping pad but falls back to ANY connected one —
   *  DirectInput pads often report an empty mapping and would otherwise be
   *  detected (event fires) yet never read (2026-07-13 user repro). */
  poll(): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const connected = Array.from(pads).filter((p): p is Gamepad => p !== null && p.connected);
    const pad = connected.find((p) => p.mapping === 'standard') ?? connected[0] ?? null;
    this.padConnected = pad !== null;
    if (!pad) {
      this.padButtons = [];
      this.padButtonsOnce = [];
      this.padAxisX = 0;
      this.padAxisY = 0;
      return;
    }
    let next = pad.buttons.map((b) => b.pressed);
    if (pad.mapping !== 'standard') next = translateDirectInput(pad, next);
    this.padButtonsOnce = next.map((down, i) => down && !this.padButtons[i]);
    this.padButtons = next;
    this.padAxisX = Math.abs(pad.axes[0] ?? 0) > STICK_DEADZONE ? (pad.axes[0] ?? 0) : 0;
    this.padAxisY = Math.abs(pad.axes[1] ?? 0) > STICK_DEADZONE ? (pad.axes[1] ?? 0) : 0;
  }

  gamepadConnected(): boolean {
    return this.padConnected;
  }

  /** Whether an action is currently held on any bound device. */
  isActionDown(action: ActionId): boolean {
    if (this.bindings.keyboard[action].some((code) => this.pressed.has(code))) return true;
    return this.bindings.gamepad[action].some((index) => this.padButtons[index] === true);
  }

  /** True once per physical press of any binding of the action. */
  consumeActionPress(action: ActionId): boolean {
    let hit = false;
    for (const code of this.bindings.keyboard[action]) {
      if (this.pressedOnce.has(code)) {
        this.pressedOnce.delete(code);
        hit = true;
      }
    }
    for (const index of this.bindings.gamepad[action]) {
      if (this.padButtonsOnce[index]) {
        this.padButtonsOnce[index] = false;
        hit = true;
      }
    }
    return hit;
  }

  /** Pause/back: Escape or gamepad Start. Reserved, never rebindable. */
  consumePausePress(): boolean {
    const key = this.pressedOnce.has('Escape');
    if (key) this.pressedOnce.delete('Escape');
    const pad = this.padButtonsOnce[PAUSE_BUTTON] === true;
    if (pad) this.padButtonsOnce[PAUSE_BUTTON] = false;
    return key || pad;
  }

  /** Consumes any keyboard or normalized gamepad button edge. Used by the
   *  initial boot gate, where every non-repeat key/button is equivalent and
   *  the initiating edge must not leak into the menu revealed that frame. */
  consumeAnyPress(): boolean {
    const hit = this.pressedOnce.size > 0 || this.padButtonsOnce.some(Boolean);
    if (!hit) return false;
    this.clearTransientPresses();
    return true;
  }

  /** Normalized movement axis on the XZ plane: x = right, y = forward (-Z).
   *  Bound keys/buttons are digital; the left stick adds analog on top. */
  moveAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isActionDown('moveLeft')) x -= 1;
    if (this.isActionDown('moveRight')) x += 1;
    if (this.isActionDown('moveUp')) y -= 1;
    if (this.isActionDown('moveDown')) y += 1;
    x += this.padAxisX;
    y += this.padAxisY;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  /** Whether a SPECIFIC gamepad button is currently held. Pairs with
   *  isActionDown for release gates that must span both devices. */
  isGamepadDown(index: number): boolean {
    return this.padButtons[index] === true;
  }

  /** Drops every pending edge without consuming it as an action.
   *
   *  Used when a state change must not inherit the presses that led into it —
   *  the confirm that was held when the player died cannot be allowed to
   *  register on the defeat screen. Held state is untouched on purpose: the
   *  release gate is what observes it going up. */
  clearTransientPresses(): void {
    this.pressedOnce.clear();
    this.padButtonsOnce = [];
  }

  /** Edge-triggered press of a SPECIFIC gamepad button (menu navigation). */
  consumeGamepadPress(index: number): boolean {
    if (this.padButtonsOnce[index] !== true) return false;
    this.padButtonsOnce[index] = false;
    return true;
  }

  /** Left-stick vertical flick as a discrete step (menu navigation): -1 up,
   *  1 down, 0 none — edge-triggered so holding the stick steps once. */
  consumeStickStep(): number {
    const raw = this.padAxisY;
    const dir = raw < -0.6 ? -1 : raw > 0.6 ? 1 : 0;
    if (dir === this.lastStickDir) return 0;
    this.lastStickDir = dir;
    return dir;
  }

  /** Horizontal twin of consumeStickStep (menu value adjustment). */
  consumeStickStepX(): number {
    const raw = this.padAxisX;
    const dir = raw < -0.6 ? -1 : raw > 0.6 ? 1 : 0;
    if (dir === this.lastStickDirX) return 0;
    this.lastStickDirX = dir;
    return dir;
  }

  private lastStickDir = 0;
  private lastStickDirX = 0;

  /** Rebind capture: index of any gamepad button pressed THIS frame (edge),
   *  or null. Start is reserved and reported as null. */
  captureGamepadButton(): number | null {
    for (let i = 0; i < this.padButtonsOnce.length; i++) {
      if (this.padButtonsOnce[i] && i !== PAUSE_BUTTON) {
        this.padButtonsOnce[i] = false;
        return i;
      }
    }
    return null;
  }
}
