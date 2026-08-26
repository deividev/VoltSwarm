import type * as THREE from 'three';
import { AUDIO, GOLD, type WeaponId } from '../config';
import { DEFAULT_CHARACTER_ID, type CharacterId } from '../characters';
import type { Game } from '../game';
import type { AudioDirector, AudioEvent, AudioDiagnostics } from '../audio';
import { emptyWeaponLevels, type CoreLevels, type WeaponBranchLevels, type WeaponLevels } from '../upgrades';
import type { PlayerStats } from '../stats';
import type { Player } from '../player';

const BENCHMARK = {
  scenario: 'audio-swarm-416',
  seed: 4979220,
  enemyCount: 400,
  typeCounts: [240, 112, 48] as const,
  spawnRadius: 22,
  sacrificeIntervalS: 0.25,
  sacrificeBatch: 4,
} as const;

interface BenchmarkEnemy {
  speed: number;
}

interface BenchmarkGame {
  renderer: THREE.WebGLRenderer;
  frame(): void;
  buildRun(characterId: CharacterId, weaponId: WeaponId): void;
  weaponLevels: WeaponLevels;
  weaponDamage: Record<WeaponId, number>;
  enemies: {
    activeCount: number;
    pool: Array<BenchmarkEnemy | undefined>;
    spawnAt(typeIndex: number, x: number, z: number, hp?: number): number;
    reset(): void;
  };
  goldSys: { spawn(x: number, z: number, amount: number): void };
  hud: {
    updateBuild(
      stats: PlayerStats,
      maxHp: number,
      weaponLevels: WeaponLevels,
      modCounts: Record<string, number>,
      coreLevels: CoreLevels,
      weaponBranches: WeaponBranchLevels,
      characterId: CharacterId,
    ): void;
  };
  stats: PlayerStats;
  player: Player;
  modCounts: Record<string, number>;
  coreLevels: CoreLevels;
  weaponBranches: WeaponBranchLevels;
  currentCharacterId: CharacterId;
  state: string;
  audio: AudioDirector;
  timer: THREE.Timer;
}

interface BenchmarkSnapshot {
  enemies: number;
  kills: number;
  xpPickups: number;
  goldPickups: number;
  audio: AudioDiagnostics;
}

interface BenchmarkHook {
  start(): { scenario: string; seed: number; enemies: number; digest: string };
  snapshot(): BenchmarkSnapshot;
  cleanup(): AudioDiagnostics;
}

declare global {
  interface Window {
    __voltswarmAudioBenchmark?: BenchmarkHook;
  }
}

/**
 * Installs the deterministic 400-enemy audio workload into a Vite development
 * session. This module is dynamically imported only from an
 * `import.meta.env.DEV` branch, so none of its rig code or hooks enter dist/.
 */
export function installAudioBenchmark(instance: Game): void {
  if (!new URLSearchParams(window.location.search).has('audioBenchmark')) return;

  const game = instance as unknown as BenchmarkGame;
  let active = false;
  let sacrificeS = 0;
  let kills = 0;
  let xpPickups = 0;
  let goldPickups = 0;
  let originalRandom: (() => number) | null = null;
  const originalEmit = game.audio.emit.bind(game.audio);
  let previousFrameAt = performance.now();

  game.audio.emit = (event: AudioEvent): void => {
    if (active) {
      if (event.id === 'enemy-death') kills++;
      else if (event.id === 'xp-pickup') xpPickups++;
      else if (event.id === 'gold-pickup') goldPickups++;
    }
    originalEmit(event);
  };

  const tick = (dt: number): void => {
    if (!active) return;
    sacrificeS -= dt;
    if (sacrificeS > 0) return;
    sacrificeS = BENCHMARK.sacrificeIntervalS;
    for (let index = 0; index < BENCHMARK.sacrificeBatch; index++) {
      const angle = (kills + index) * 1.7;
      const spawned = game.enemies.spawnAt(0, Math.cos(angle) * 4, Math.sin(angle) * 4);
      if (spawned !== -1) {
        game.goldSys.spawn(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, GOLD.dropAmount);
      }
    }
  };

  game.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - previousFrameAt) / 1000, 0.1);
    previousFrameAt = now;
    game.frame();
    tick(dt);
  });

  const restoreRandom = (): void => {
    if (originalRandom) Math.random = originalRandom;
    originalRandom = null;
  };

  window.__voltswarmAudioBenchmark = {
    start: () => {
      restoreRandom();
      let randomState = BENCHMARK.seed >>> 0;
      originalRandom = Math.random;
      Math.random = () => {
        randomState = (randomState * 1664525 + 1013904223) >>> 0;
        return randomState / 0x100000000;
      };

      game.buildRun(DEFAULT_CHARACTER_ID, 'bolt');
      (Object.keys(game.weaponLevels) as WeaponId[]).forEach((id) => {
        game.weaponLevels[id] = 1;
      });
      game.weaponDamage = emptyWeaponLevels();
      const voltlingCount = BENCHMARK.typeCounts[0];
      const sparkrunnerCount = BENCHMARK.typeCounts[1];
      for (let index = 0; index < BENCHMARK.enemyCount; index++) {
        const typeIndex = index < voltlingCount ? 0 : index < voltlingCount + sparkrunnerCount ? 1 : 2;
        const angle = (index * 2.399963229728653 + BENCHMARK.seed) % (Math.PI * 2);
        const radius = BENCHMARK.spawnRadius + (index % 8) * 1.4;
        const spawned = game.enemies.spawnAt(typeIndex, Math.cos(angle) * radius, Math.sin(angle) * radius, 1000);
        const enemy = game.enemies.pool[spawned];
        if (enemy) enemy.speed = 0;
      }
      game.hud.updateBuild(
        game.stats,
        game.player.maxHp,
        game.weaponLevels,
        game.modCounts,
        game.coreLevels,
        game.weaponBranches,
        game.currentCharacterId,
      );
      game.state = 'playing';
      game.audio.resetDiagnostics();
      active = true;
      sacrificeS = 0;
      kills = 0;
      xpPickups = 0;
      goldPickups = 0;
      game.audio.setMenu(false);
      game.audio.setPaused(false);
      game.audio.transitionMusic('foundation-music', 'foundation-run-loop', AUDIO.music.runLoopVolume);
      game.timer.reset();
      previousFrameAt = performance.now();
      return {
        scenario: BENCHMARK.scenario,
        seed: BENCHMARK.seed,
        enemies: game.enemies.activeCount,
        digest: `${BENCHMARK.seed}:${BENCHMARK.typeCounts.join('-')}:${BENCHMARK.sacrificeIntervalS}:${BENCHMARK.sacrificeBatch}`,
      };
    },
    snapshot: () => ({
      enemies: game.enemies.activeCount,
      kills,
      xpPickups,
      goldPickups,
      audio: game.audio.diagnostics(),
    }),
    cleanup: () => {
      active = false;
      restoreRandom();
      game.state = 'paused';
      game.enemies.reset();
      game.audio.reset();
      return game.audio.diagnostics();
    },
  };
}
