/** Semantic UI audio policy shared by pointer, keyboard, and gamepad input. */
export type UiAudioEventId = 'ui-confirm' | 'ui-back' | 'ui-focus';
export type UiActionCue = UiAudioEventId | 'none';

export const UI_INTERACTIVE_SELECTOR = 'button, select, .upgrade-card, .unlock-row';

/** Controls with a dedicated result cue must not also receive generic confirm. */
export const UI_ACTION_CUES: Readonly<Record<string, UiActionCue>> = {
  'characters-back-button': 'ui-back',
  'character-select-back-button': 'ui-back',
  'draft-back-button': 'ui-back',
  'contracts-back-button': 'ui-back',
  'unlocks-back-button': 'ui-back',
  'settings-back-button': 'ui-back',
  'shop-leave-button': 'ui-back',
  'resume-button': 'none',
  'quit-run-button': 'none',
  'restart-button': 'none',
};

export function uiActionCue(target: { dataset?: DOMStringMap } | null): UiActionCue {
  const cue = target?.dataset?.uiCue;
  return cue === 'ui-back' || cue === 'none' ? cue : 'ui-confirm';
}

/** Touch and pen have no hover affordance, so they must never produce focus SFX. */
export function isMouseHover(event: { pointerType?: string }): boolean {
  return event.pointerType === 'mouse';
}

/** Emits only when the actual eligible focus target changes. */
export class UiFocusTracker<T> {
  private current: T | null = null;

  move(target: T | null, silent = false): boolean {
    if (target === this.current) return false;
    this.current = target;
    return target !== null && !silent;
  }

  clear(target?: T): void {
    if (target === undefined || target === this.current) this.current = null;
  }
}
