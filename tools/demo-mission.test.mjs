import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hudSource = fs.readFileSync(new URL('../src/hud.ts', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../src/game.ts', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../src/ui.css', import.meta.url), 'utf8');

test('Demo mission copy states the two truthful Map 1 objectives', () => {
  assert.match(hudSource, /MISSION:/);
  assert.match(hudSource, /Survive until time expires/);
  assert.match(hudSource, /Defeat the boss to clear the sector/);
  assert.doesNotMatch(hudSource, /Defeat the boss to unlock the next sector/);
});

test('Demo timeout still ends once with clear credit gated by a boss defeat', () => {
  assert.match(
    gameSource,
    /if \(remaining <= 0\) \{[\s\S]*?this\.endRun\(this\.boss\.bossesDefeated > 0 \? 'sector-cleared' : 'survived'\);[\s\S]*?return;/,
  );
  assert.doesNotMatch(gameSource, /transitionToMap|startFinale|runFlow/);
});

test('mission completion follows the persisted boss count during active gameplay', () => {
  assert.match(gameSource, /this\.hud\.updateMission\(this\.boss\.bossesDefeated > 0\);/);
  assert.match(hudSource, /boss\.classList\.toggle\('complete', bossDefeated\)/);
  assert.match(hudSource, /bossDefeated \? '\[X\]' : '\[ \]'/);
});

test('BOSS and SHOP markers use enlarged CSS arrows without font glyphs', () => {
  assert.match(hudSource, /id="totem-indicator"[\s\S]*?<span class="arrow" aria-hidden="true"><\/span>/);
  assert.match(hudSource, /id="merchant-indicator"[\s\S]*?<span class="arrow" aria-hidden="true"><\/span>/);
  assert.match(cssSource, /#totem-indicator \.arrow \{[\s\S]*?border-left: 14px solid transparent;[\s\S]*?border-bottom: 26px solid #ff3355;/);
  assert.match(cssSource, /#merchant-indicator \.arrow \{[\s\S]*?border-left: 14px solid transparent;[\s\S]*?border-bottom: 26px solid #f2b632;/);
  assert.match(cssSource, /#totem-indicator \.label,[\s\S]*?#merchant-indicator \.label \{[\s\S]*?font-size: 11px;/);
});
