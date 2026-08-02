import type { RunRecordV1 } from './run-history';

export type FeedbackDifficulty = 'too_easy' | 'about_right' | 'too_hard';
export type FeedbackReason =
  | 'combat_feel'
  | 'build_choices'
  | 'enemy_pressure'
  | 'bosses'
  | 'economy'
  | 'clarity'
  | 'performance';

export interface StructuredFeedback {
  fun: 1 | 2 | 3 | 4 | 5;
  difficulty: FeedbackDifficulty;
  reasons: FeedbackReason[];
}

type ClientEventType = 'run_started' | 'run_ended' | 'choice' | 'performance' | 'feedback';

interface PerformanceMetrics {
  window: 'periodic' | 'final';
  elapsedS: number;
  frameCount: number;
  averageFps: number;
  averageFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  slowFrameRatio: number;
  averageActiveEnemies: number;
  peakActiveEnemies: number;
}

const PERIODIC_PERFORMANCE_WINDOW_S = 30;
const FRAME_BUCKET_MS = 5;
const FRAME_BUCKET_COUNT = 51;

class PerformanceAccumulator {
  elapsedS = 0;
  frameCount = 0;
  frameMsSum = 0;
  maxFrameMs = 0;
  slowFrames = 0;
  enemySeconds = 0;
  peakActiveEnemies = 0;
  readonly buckets = new Uint32Array(FRAME_BUCKET_COUNT);

  add(frameS: number, activeEnemies: number): void {
    if (!Number.isFinite(frameS) || frameS <= 0) return;
    const frameMs = frameS * 1_000;
    this.elapsedS += frameS;
    this.frameCount++;
    this.frameMsSum += frameMs;
    this.maxFrameMs = Math.max(this.maxFrameMs, frameMs);
    if (frameMs > 33.333) this.slowFrames++;
    const safeEnemies = Math.max(0, Math.floor(activeEnemies));
    this.enemySeconds += safeEnemies * frameS;
    this.peakActiveEnemies = Math.max(this.peakActiveEnemies, safeEnemies);
    const bucket = Math.min(FRAME_BUCKET_COUNT - 1, Math.floor(frameMs / FRAME_BUCKET_MS));
    this.buckets[bucket] = (this.buckets[bucket] ?? 0) + 1;
  }

  metrics(window: PerformanceMetrics['window']): PerformanceMetrics | null {
    if (this.frameCount === 0 || this.elapsedS <= 0) return null;
    const threshold = Math.ceil(this.frameCount * 0.95);
    let cumulative = 0;
    let p95Bucket = 0;
    for (let index = 0; index < this.buckets.length; index++) {
      cumulative += this.buckets[index] ?? 0;
      if (cumulative >= threshold) {
        p95Bucket = index;
        break;
      }
    }
    return {
      window,
      elapsedS: round3(this.elapsedS),
      frameCount: this.frameCount,
      averageFps: round3(this.frameCount / this.elapsedS),
      averageFrameMs: round3(this.frameMsSum / this.frameCount),
      p95FrameMs: round3((p95Bucket + 1) * FRAME_BUCKET_MS),
      maxFrameMs: round3(this.maxFrameMs),
      slowFrameRatio: round3(this.slowFrames / this.frameCount),
      averageActiveEnemies: round3(this.enemySeconds / this.elapsedS),
      peakActiveEnemies: this.peakActiveEnemies,
    };
  }
}

class TelemetryFacade {
  private readonly enabled = __BUILD_FLAVOR__ === 'playtest' &&
    (window.electronAPI?.telemetry?.isEnabled() ?? false);
  private runId: string | null = null;
  private periodicPerformance = new PerformanceAccumulator();
  private totalPerformance = new PerformanceAccumulator();

  isAvailable(): boolean {
    return this.enabled;
  }

  startRun(
    runId: string,
    payload: {
      mapId: string;
      mapNumber: number;
      difficulty: string;
      startingWeaponId: string;
    },
  ): void {
    this.runId = runId;
    this.periodicPerformance = new PerformanceAccumulator();
    this.totalPerformance = new PerformanceAccumulator();
    this.emit('run_started', payload, runId);
  }

  samplePerformance(frameS: number, activeEnemies: number): void {
    if (!this.runId) return;
    this.periodicPerformance.add(frameS, activeEnemies);
    this.totalPerformance.add(frameS, activeEnemies);
    if (this.periodicPerformance.elapsedS < PERIODIC_PERFORMANCE_WINDOW_S) return;
    const metrics = this.periodicPerformance.metrics('periodic');
    if (metrics) this.emit('performance', metrics, this.runId);
    this.periodicPerformance = new PerformanceAccumulator();
  }

  choice(choiceType: string, payload: Record<string, unknown>): void {
    if (!this.runId) return;
    this.emit('choice', { choiceType, ...payload }, this.runId);
  }

  endRun(record: RunRecordV1): void {
    this.flushFinalPerformance(record.id);
    this.emit('run_ended', {
      outcome: record.outcome,
      map: record.map,
      durationS: record.durationS,
      level: record.level,
      kills: record.kills,
      bossesDefeated: record.bossesDefeated,
      bossTypesDefeated: record.bossTypesDefeated ?? [],
      damageTaken: record.damageTaken,
      goldEarned: record.goldEarned,
      chestsByTier: record.chestsByTier ?? {},
      shopPurchases: record.shopPurchases,
      contactS: record.contactS,
      enclosedS: record.enclosedS,
      enclosedLowHpS: record.enclosedLowHpS,
      peakEnclosedSectors: record.peakEnclosedSectors,
      cursedFinal: record.cursedFinal,
      cursedTimeAvg: record.cursedTimeAvg,
      totalDamage: record.totalDamage,
      weaponLevels: record.weaponLevels,
      weaponBranches: record.weaponBranches ?? {},
      weaponDamage: record.weaponDamage,
      coreLevels: record.coreLevels,
      modCounts: record.modCounts,
    }, record.id);
    this.runId = null;
  }

  abandonRun(runId: string, payload: Record<string, unknown>): void {
    this.flushFinalPerformance(runId);
    this.emit('run_ended', { outcome: 'abandoned', ...payload }, runId);
    this.runId = null;
  }

  async feedback(runId: string, feedback: StructuredFeedback): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      return await window.electronAPI!.telemetry.submitFeedback({
        type: 'feedback',
        payload: feedback as unknown as Record<string, unknown>,
        runId,
      });
    } catch {
      return false;
    }
  }

  private flushFinalPerformance(runId: string): void {
    const metrics = this.totalPerformance.metrics('final');
    if (metrics) this.emit('performance', metrics, runId);
    this.periodicPerformance = new PerformanceAccumulator();
    this.totalPerformance = new PerformanceAccumulator();
  }

  private emit(type: ClientEventType, payload: object, runId: string): void {
    if (!this.enabled) return;
    try {
      window.electronAPI?.telemetry?.emit({
        type,
        payload: payload as Record<string, unknown>,
        runId,
      });
    } catch {
      // Telemetry is deliberately non-blocking. The main process owns durable
      // error tracking once an event crosses the IPC boundary.
    }
  }
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export const telemetry = new TelemetryFacade();
