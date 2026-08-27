import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIO_BENCHMARK_THRESHOLDS, evaluateAudioBenchmark } from './audio-benchmark-policy.mjs';

function passingFixture() {
  const audio = {
    activeVoices: 5,
    peakActiveVoices: 24,
    drops: 20,
    steals: 2,
    loadFailures: 0,
    leakedVoices: 0,
    attempts: 50,
    accepted: 30,
    contextState: 'running',
  };
  return {
    metrics: {
      meanFps: AUDIO_BENCHMARK_THRESHOLDS.minimumMeanFps,
      minimumBucketFps: AUDIO_BENCHMARK_THRESHOLDS.minimumBucketFps,
      frameTimeP99Ms: AUDIO_BENCHMARK_THRESHOLDS.maximumP99FrameMs,
      minimumEnemies: 400,
      end: { enemies: 410, kills: 8, xpPickups: 7, goldPickups: 14, audio },
    },
    cleanup: { audio: { ...audio, activeVoices: 0 } },
  };
}

test('the complete boundary fixture passes with 24 peak voices', () => {
  const result = evaluateAudioBenchmark(passingFixture());
  assert.equal(result.pass, true);
  assert.equal(result.checks.every((check) => check.pass), true);
  assert.equal(result.checks.find((check) => check.id === 'peak-voices')?.pass, true);
});

test('25 peak voices fails the internal DEV ceiling', () => {
  const fixture = passingFixture();
  fixture.metrics.end.audio.peakActiveVoices = 25;
  const result = evaluateAudioBenchmark(fixture);
  assert.equal(result.pass, false);
  assert.equal(result.checks.find((check) => check.id === 'peak-voices')?.pass, false);
});

test('a low complete one-second bucket fails even when mean FPS is high', () => {
  const fixture = passingFixture();
  fixture.metrics.meanFps = 120;
  fixture.metrics.minimumBucketFps = AUDIO_BENCHMARK_THRESHOLDS.minimumBucketFps - 1;
  const result = evaluateAudioBenchmark(fixture);
  assert.equal(result.pass, false);
  assert.equal(result.checks.find((check) => check.id === 'minimum-bucket-fps')?.pass, false);
});

test('excessive p99 frame time fails even when average and buckets pass', () => {
  const fixture = passingFixture();
  fixture.metrics.meanFps = 120;
  fixture.metrics.minimumBucketFps = 119;
  fixture.metrics.frameTimeP99Ms = AUDIO_BENCHMARK_THRESHOLDS.maximumP99FrameMs + 0.1;
  const result = evaluateAudioBenchmark(fixture);
  assert.equal(result.pass, false);
  assert.equal(result.checks.find((check) => check.id === 'p99-frame-time-ms')?.pass, false);
});

test('voice, load, leak and cleanup hygiene are enforced independently', () => {
  const fixture = passingFixture();
  fixture.metrics.end.audio.peakActiveVoices = AUDIO_BENCHMARK_THRESHOLDS.maximumPeakVoices + 1;
  fixture.metrics.end.audio.loadFailures = 1;
  fixture.cleanup.audio.activeVoices = 1;
  fixture.cleanup.audio.leakedVoices = 1;
  const result = evaluateAudioBenchmark(fixture);
  assert.equal(result.pass, false);
  for (const id of ['peak-voices', 'load-failures', 'cleanup-active-voices', 'cleanup-leaked-voices']) {
    assert.equal(result.checks.find((check) => check.id === id)?.pass, false, id);
  }
});
