/**
 * Reaches the first interactive menu in both boot-gated and legacy builds.
 * A real keyboard event is required when the boot overlay is present so
 * browser automation exercises the same trusted-input path as a player.
 */
export async function enterMainMenu(page, timeout = 15_000) {
  const stateHandle = await page.waitForFunction(
    () => {
      const isVisible = (element) =>
        element instanceof HTMLElement &&
        !element.classList.contains('hidden') &&
        element.getClientRects().length > 0;
      if (isVisible(document.querySelector('#menu-overlay'))) return 'menu';
      if (isVisible(document.querySelector('#boot-overlay'))) return 'boot';
      return false;
    },
    { timeout },
  );
  const state = await stateHandle.jsonValue();
  if (state === 'boot') await page.keyboard.press('KeyX');
  await page.waitForSelector('#menu-overlay:not(.hidden)', { visible: true, timeout });
}

/**
 * Advances the optional character-selection step introduced between Play and
 * the starting weapon draft. Older builds go straight to the draft, so the
 * helper also accepts that state without adding a fixed delay.
 */
export async function confirmOnlyVisibleCharacterIfPresent(page, timeout = 1_000) {
  let nextStep;
  try {
    const result = await page.waitForFunction(
      () => {
        const isVisible = (element) =>
          element instanceof HTMLElement &&
          !element.classList.contains('hidden') &&
          element.getClientRects().length > 0;
        const characterOverlay =
          document.querySelector('#character-select-overlay') ??
          document.querySelector('#character-overlay');
        if (isVisible(characterOverlay)) return 'character';
        if ([...document.querySelectorAll('#draft-cards > *')].some(isVisible)) return 'draft';
        return false;
      },
      { timeout },
    );
    nextStep = await result.jsonValue();
  } catch (error) {
    if (error?.name !== 'TimeoutError') throw error;
    return false;
  }

  if (nextStep === 'draft') return false;

  await page.waitForFunction(
    () => {
      const overlay =
        document.querySelector('#character-select-overlay:not(.hidden)') ??
        document.querySelector('#character-overlay:not(.hidden)');
      if (!(overlay instanceof HTMLElement)) return false;
      const visibleCards = [...overlay.querySelectorAll('[data-character-id][data-character-unlocked="true"]')]
        .filter((card) => card instanceof HTMLElement && card.getClientRects().length > 0);
      const confirm = overlay.querySelector('#character-confirm-button');
      return visibleCards.length > 0 && confirm instanceof HTMLButtonElement;
    },
    { timeout: 5_000 },
  );

  const candidates = await page.evaluate(() => {
    const overlay =
      document.querySelector('#character-select-overlay:not(.hidden)') ??
      document.querySelector('#character-overlay:not(.hidden)');
    if (!(overlay instanceof HTMLElement)) throw new Error('Character overlay disappeared before confirmation');
    return {
      defaultId: overlay.querySelector('#character-select-roster')?.getAttribute('data-default-character-id') ?? null,
      characters: [...overlay.querySelectorAll('[data-character-id]')]
        .filter((card) => card instanceof HTMLElement && card.getClientRects().length > 0)
        .map((card) => ({
          id: card.getAttribute('data-character-id'),
          unlocked: card.getAttribute('data-character-unlocked') === 'true',
        })),
    };
  });
  const characterId = chooseCharacterId(candidates.characters, candidates.defaultId);
  if (!characterId) throw new Error('Character selector has no visible unlocked character');

  await page.evaluate((selectedId) => {
    const overlay =
      document.querySelector('#character-select-overlay:not(.hidden)') ??
      document.querySelector('#character-overlay:not(.hidden)');
    if (!(overlay instanceof HTMLElement)) throw new Error('Character overlay disappeared before confirmation');
    const card = [...overlay.querySelectorAll('[data-character-id]')].find(
      (candidate) =>
        candidate.getAttribute('data-character-id') === selectedId &&
        candidate.getAttribute('data-character-unlocked') === 'true',
    );
    if (!(card instanceof HTMLElement)) throw new Error(`Unlocked character '${selectedId}' is unavailable`);
    card.click();
    const confirm = overlay.querySelector('#character-confirm-button');
    if (!(confirm instanceof HTMLButtonElement) || confirm.disabled) {
      throw new Error('Character confirmation is unavailable');
    }
    confirm.click();
  }, characterId);
  return true;
}

export function chooseCharacterId(characters, defaultId) {
  const unlocked = characters.filter((character) => character.unlocked && character.id);
  return unlocked.find((character) => character.id === defaultId)?.id ?? unlocked[0]?.id ?? null;
}
