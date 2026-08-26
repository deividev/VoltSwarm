export const AUDIO_BENCHMARK_THRESHOLDS = Object.freeze({
  minimumMeanFps: 60,
  minimumBucketFps: 50,
  maximumP99FrameMs: 33.4,
  minimumEnemies: 400,
  maximumPeakVoices: 22,
  minimumKills: 1,
  minimumXpPickups: 1,
  minimumGoldPickups: 1,
  minimumAudioAttempts: 1,
  minimumAudioAccepted: 1,
  maximumLoadFailures: 0,
  maximumLeakedVoices: 0,
  maximumCleanupVoices: 0,
});

/** Tooling-owned steady-state acceptance policy for the internal DEV workload. */
export function evaluateAudioBenchmark(report, thresholds = AUDIO_BENCHMARK_THRESHOLDS) {
  const { metrics, cleanup } = report;
  const checks = [
    { id: 'mean-fps', actual: metrics.meanFps, expected: `>= ${thresholds.minimumMeanFps}`, pass: metrics.meanFps >= thresholds.minimumMeanFps },
    { id: 'minimum-bucket-fps', actual: metrics.minimumBucketFps, expected: `>= ${thresholds.minimumBucketFps}`, pass: metrics.minimumBucketFps >= thresholds.minimumBucketFps },
    { id: 'p99-frame-time-ms', actual: metrics.frameTimeP99Ms, expected: `> 0 and <= ${thresholds.maximumP99FrameMs}`, pass: metrics.frameTimeP99Ms > 0 && metrics.frameTimeP99Ms <= thresholds.maximumP99FrameMs },
    { id: 'minimum-enemy-population', actual: metrics.minimumEnemies, expected: `>= ${thresholds.minimumEnemies}`, pass: metrics.minimumEnemies >= thresholds.minimumEnemies },
    { id: 'end-enemy-population', actual: metrics.end.enemies, expected: `>= ${thresholds.minimumEnemies}`, pass: metrics.end.enemies >= thresholds.minimumEnemies },
    { id: 'kills', actual: metrics.end.kills, expected: `>= ${thresholds.minimumKills}`, pass: metrics.end.kills >= thresholds.minimumKills },
    { id: 'xp-pickups', actual: metrics.end.xpPickups, expected: `>= ${thresholds.minimumXpPickups}`, pass: metrics.end.xpPickups >= thresholds.minimumXpPickups },
    { id: 'gold-pickups', actual: metrics.end.goldPickups, expected: `>= ${thresholds.minimumGoldPickups}`, pass: metrics.end.goldPickups >= thresholds.minimumGoldPickups },
    { id: 'audio-attempts', actual: metrics.end.audio.attempts, expected: `>= ${thresholds.minimumAudioAttempts}`, pass: metrics.end.audio.attempts >= thresholds.minimumAudioAttempts },
    { id: 'audio-accepted', actual: metrics.end.audio.accepted, expected: `>= ${thresholds.minimumAudioAccepted}`, pass: metrics.end.audio.accepted >= thresholds.minimumAudioAccepted },
    { id: 'peak-voices', actual: metrics.end.audio.peakActiveVoices, expected: `<= ${thresholds.maximumPeakVoices}`, pass: metrics.end.audio.peakActiveVoices <= thresholds.maximumPeakVoices },
    { id: 'load-failures', actual: metrics.end.audio.loadFailures, expected: `<= ${thresholds.maximumLoadFailures}`, pass: metrics.end.audio.loadFailures <= thresholds.maximumLoadFailures },
    { id: 'live-leaked-voices', actual: metrics.end.audio.leakedVoices, expected: `<= ${thresholds.maximumLeakedVoices}`, pass: metrics.end.audio.leakedVoices <= thresholds.maximumLeakedVoices },
    { id: 'cleanup-active-voices', actual: cleanup.audio.activeVoices, expected: `<= ${thresholds.maximumCleanupVoices}`, pass: cleanup.audio.activeVoices <= thresholds.maximumCleanupVoices },
    { id: 'cleanup-leaked-voices', actual: cleanup.audio.leakedVoices, expected: `<= ${thresholds.maximumLeakedVoices}`, pass: cleanup.audio.leakedVoices <= thresholds.maximumLeakedVoices },
    { id: 'cleanup-load-failures', actual: cleanup.audio.loadFailures, expected: `<= ${thresholds.maximumLoadFailures}`, pass: cleanup.audio.loadFailures <= thresholds.maximumLoadFailures },
  ];
  return { pass: checks.every((check) => check.pass), checks };
}
