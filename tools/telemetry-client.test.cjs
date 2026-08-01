const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { loadOrCreateInstallationId } = require('../electron/dist/telemetry/identity.js');
const {
  TelemetryQueue,
  exponentialBackoffMs,
} = require('../electron/dist/telemetry/queue.js');
const { TelemetryClient } = require('../electron/dist/telemetry/client.js');
const { validateRendererTelemetryEvent } = require('../electron/dist/telemetry/validation.js');

const FIXED_DATE = new Date('2026-08-01T12:00:00.000Z');
const scope = {
  gameId: 'voltswarm',
  waveId: 'wave-1',
  schemaVersion: 1,
  installationId: 'installation-00000001',
};

function withTempDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voltswarm-telemetry-'));
  try {
    return run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function withTempDirectoryAsync(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voltswarm-telemetry-'));
  try {
    return await run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function queueAt(directory, options = {}) {
  let nextId = options.startId ?? 1;
  return new TelemetryQueue(
    path.join(directory, 'queue.json'),
    options.maxEvents ?? 100,
    () => `event-${nextId++}`,
    () => FIXED_DATE,
  );
}

function enqueue(queue, payload = {}, overrides = {}) {
  return queue.enqueue({
    type: 'choice',
    payload,
    buildVersion: '0.10.0-beta.1',
    sessionId: 'session-1',
    runId: 'run-1',
    ...overrides,
  });
}

function readQueueState(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, 'telemetry-queue.json'), 'utf8'));
}

function validRunStarted(runId = 'run-1') {
  return {
    type: 'run_started',
    runId,
    payload: {
      mapId: 'scrapyard',
      mapNumber: 1,
      difficulty: 'standard',
      startingWeaponId: 'bolt-cannon',
    },
  };
}

function validRunEnded(overrides = {}) {
  return {
    type: 'run_ended', runId: 'run-1',
    payload: {
      outcome: 'defeat', map: { id: 'scrapyard', number: 1, title: 'Scrapyard' },
      durationS: 30, level: 2, kills: 10, bossesDefeated: 0,
      bossTypesDefeated: [],
      weaponLevels: { bolt: 2 }, weaponBranches: { bolt: { damage: 1.2 } },
      weaponDamage: { bolt: 100 }, coreLevels: { armor: 1 }, modCounts: { repair: 1 },
      ...overrides,
    },
  };
}

function acceptedBatchResponse(init, select = (events) => events) {
  const batch = JSON.parse(init.body);
  return new Response(JSON.stringify({
    results: select(batch.events).map((event) => ({ eventId: event.eventId, status: 'accepted' })),
  }), { status: 202, headers: { 'content-type': 'application/json' } });
}

function testClient(directory, fetchImpl, options = {}) {
  let nextId = 0;
  return new TelemetryClient(directory, '0.10.0-beta.1', {
    fetch: fetchImpl,
    createId: () => `test-id-${++nextId}`,
    now: () => FIXED_DATE,
    automaticScheduling: false,
    ...options,
  });
}

test('event IDs remain stable across retries and process reloads', () => {
  withTempDirectory((directory) => {
    const queue = queueAt(directory);
    const event = enqueue(queue, { selectedId: 'bolt' });
    const first = queue.selectBatch(scope, 100, 128 * 1024);
    const retry = queue.selectBatch(scope, 100, 128 * 1024);
    const reloaded = queueAt(directory, { startId: 99 }).selectBatch(scope, 100, 128 * 1024);

    assert.equal(first.events[0].eventId, event.eventId);
    assert.equal(retry.events[0].eventId, event.eventId);
    assert.equal(reloaded.events[0].eventId, event.eventId);
  });
});

test('batching respects count, byte, and original-session boundaries', () => {
  withTempDirectory((directory) => {
    const queue = queueAt(directory);
    enqueue(queue, { value: 'a'.repeat(70_000) });
    enqueue(queue, { value: 'b'.repeat(70_000) });
    enqueue(queue, { value: 'later-session' }, { sessionId: 'session-2' });

    const byteBound = queue.selectBatch(scope, 100, 128 * 1024);
    assert.equal(byteBound.events.length, 1);
    assert.equal(byteBound.sessionId, 'session-1');

    const countBound = queue.selectBatch(scope, 1, 512 * 1024);
    assert.equal(countBound.events.length, 1);
    assert.equal(countBound.sessionId, 'session-1');
  });
});

test('acknowledgement deletes only accepted or duplicate event IDs', () => {
  withTempDirectory((directory) => {
    const queue = queueAt(directory);
    const first = enqueue(queue);
    const second = enqueue(queue);
    const third = enqueue(queue);

    const removed = queue.acknowledge([
      { eventId: first.eventId, status: 'accepted' },
      { eventId: second.eventId, status: 'duplicate' },
      { eventId: 'unknown-event', status: 'accepted' },
    ]);

    assert.equal(removed, 2);
    assert.deepEqual(queue.snapshot().events.map((event) => event.eventId), [third.eventId]);
  });
});

test('exponential backoff is capped and applies deterministic jitter', () => {
  assert.equal(exponentialBackoffMs(0, () => 0, 2_000, 300_000), 1_500);
  assert.equal(exponentialBackoffMs(1, () => 0.5, 2_000, 300_000), 4_000);
  assert.equal(exponentialBackoffMs(20, () => 1, 2_000, 300_000), 300_000);
});

test('a corrupt queue is preserved and recovered as empty', () => {
  withTempDirectory((directory) => {
    const file = path.join(directory, 'queue.json');
    fs.writeFileSync(file, '{not-json', 'utf8');
    const queue = queueAt(directory);

    assert.equal(queue.length, 0);
    assert.equal(fs.existsSync(`${file}.corrupt-${FIXED_DATE.getTime()}.json`), true);
  });
});

test('queue cap drops oldest events and coalesces a reportable upload error', () => {
  withTempDirectory((directory) => {
    const queue = queueAt(directory, { maxEvents: 2 });
    enqueue(queue, { order: 1 });
    const second = enqueue(queue, { order: 2 });
    const third = enqueue(queue, { order: 3 });

    assert.deepEqual(queue.snapshot().events.map((event) => event.eventId), [second.eventId, third.eventId]);
    const failure = queue.consumeUploadFailureAfterRecovery();
    assert.equal(failure.lastReason, 'queue_overflow');
    assert.equal(failure.droppedEvents, 1);
    assert.equal(failure.quarantinedEvents, 0);
    assert.equal(queue.snapshot().uploadFailure, undefined);
  });
});

test('renderer validation enforces v1 event envelopes and JSON-safe payloads', () => {
  assert.deepEqual(validateRendererTelemetryEvent(validRunStarted()), validRunStarted());
  assert.equal(validateRendererTelemetryEvent({ ...validRunStarted(), runId: '../unsafe' }), null);
  assert.equal(validateRendererTelemetryEvent({
    type: 'feedback',
    runId: 'run-1',
    payload: { fun: 6, difficulty: 'about_right', reasons: [] },
  }), null);
  assert.equal(validateRendererTelemetryEvent({
    type: 'performance',
    runId: 'run-1',
    payload: { window: 'periodic', elapsedS: Number.NaN },
  }), null);
});

test('renderer validation rejects unknown payload fields for every event family', () => {
  assert.equal(validateRendererTelemetryEvent({
    ...validRunStarted(),
    payload: { ...validRunStarted().payload, deviceId: 'device-1' },
  }), null);
  assert.equal(validateRendererTelemetryEvent({
    ...validRunEnded(),
    payload: { ...validRunEnded().payload, account: 'unexpected-account' },
  }), null);
  assert.equal(validateRendererTelemetryEvent({
    type: 'choice',
    runId: 'run-1',
    payload: {
      choiceType: 'level_up',
      action: 'selected',
      selectedId: 'bolt-damage',
      offeredIds: ['bolt-damage'],
      level: 2,
      email: 'tester@example.com',
    },
  }), null);
  assert.equal(validateRendererTelemetryEvent({
    type: 'performance',
    runId: 'run-1',
    payload: {
      window: 'periodic',
      elapsedS: 30,
      frameCount: 3_600,
      averageFps: 120,
      averageFrameMs: 8.333,
      p95FrameMs: 10,
      maxFrameMs: 16,
      slowFrameRatio: 0,
      averageActiveEnemies: 100,
      peakActiveEnemies: 150,
      hardware: 'unexpected-device-fingerprint',
    },
  }), null);
  assert.equal(validateRendererTelemetryEvent({
    type: 'feedback',
    runId: 'run-1',
    payload: {
      fun: 4,
      difficulty: 'about_right',
      reasons: ['combat_feel'],
      freeText: 'This must never cross IPC.',
    },
  }), null);
});

test('run_ended validation rejects malformed and unbounded nested facts', () => {
  assert.ok(validateRendererTelemetryEvent(validRunEnded()));
  assert.equal(validateRendererTelemetryEvent(validRunEnded({ map: {
    id: 'scrapyard', number: 1, title: 'Scrapyard', email: 'hidden@example.com',
  } })), null);
  assert.equal(validateRendererTelemetryEvent(validRunEnded({ bossTypesDefeated:
    Array.from({ length: 33 }, (_, index) => `boss-${index}`) })), null);
  assert.equal(validateRendererTelemetryEvent(validRunEnded({ weaponBranches:
    { bolt: { damage: 'not-a-number' } } })), null);
  assert.equal(validateRendererTelemetryEvent(validRunEnded({ weaponDamage:
    Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`weapon-${index}`, index])) })), null);
});

test('request timeout covers response-body reading and preserves events for retry', async () => {
  await withTempDirectoryAsync(async (directory) => {
    let calls = 0;
    const client = testClient(directory, (_url, init) => {
      calls++;
      if (calls > 1) return Promise.resolve(acceptedBatchResponse(init));
      return Promise.resolve({
        status: 202,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
      });
    }, { requestTimeoutMs: 5 });
    client.start();
    const originalId = readQueueState(directory).events[0].eventId;

    await client.flushPending();
    let state = readQueueState(directory);
    assert.equal(state.events[0].eventId, originalId);
    assert.equal(state.uploadFailure.lastReason, 'request_timeout');

    await client.flushPending();
    await client.flushPending();
    state = readQueueState(directory);
    assert.equal(calls, 3);
    assert.equal(state.events.length, 0);
  });
});

test('HTTP 413 deterministically reduces a batch without changing event IDs', async () => {
  await withTempDirectoryAsync(async (directory) => {
    const requests = [];
    const client = testClient(directory, (_url, init) => {
      const batch = JSON.parse(init.body);
      requests.push(batch.events.map((event) => event.eventId));
      if (requests.length === 1) return Promise.resolve(new Response('', { status: 413 }));
      return Promise.resolve(acceptedBatchResponse(init));
    });
    client.start();
    client.captureRendererEvent(validRunStarted());
    const originalIds = readQueueState(directory).events.map((event) => event.eventId);

    await client.flushPending();
    assert.deepEqual(readQueueState(directory).events.map((event) => event.eventId), originalIds);
    await client.flushPending();
    assert.deepEqual(requests[1], [originalIds[0]]);
    await client.flushPending();
    await client.flushPending();
    assert.equal(readQueueState(directory).events.length, 0);
  });
});

test('a singleton HTTP 413 is quarantined and cannot head-of-line block later events', async () => {
  await withTempDirectoryAsync(async (directory) => {
    let rejectSingleton = true;
    const acceptedIds = [];
    const client = testClient(directory, (_url, init) => {
      if (rejectSingleton) {
        rejectSingleton = false;
        return Promise.resolve(new Response('', { status: 413 }));
      }
      const batch = JSON.parse(init.body);
      acceptedIds.push(...batch.events.map((event) => event.eventId));
      return Promise.resolve(acceptedBatchResponse(init));
    });
    client.start();
    const poisonedId = readQueueState(directory).events[0].eventId;

    await client.flushPending();
    let state = readQueueState(directory);
    assert.equal(state.events.length, 0);
    assert.equal(state.quarantinedEvents.length, 1);
    assert.equal(state.quarantinedEvents[0].event.eventId, poisonedId);
    assert.equal(state.uploadFailure.quarantinedEvents, 1);

    client.captureRendererEvent(validRunStarted('run-after-poison'));
    const nextId = readQueueState(directory).events[0].eventId;
    await client.flushPending();
    assert.equal(acceptedIds.includes(nextId), true);
    await client.flushPending();
    state = readQueueState(directory);
    assert.equal(state.events.length, 0);
    assert.equal(state.quarantinedEvents[0].event.eventId, poisonedId);
  });
});

test('partial ACK deletes only confirmed IDs and retries the remainder unchanged', async () => {
  await withTempDirectoryAsync(async (directory) => {
    const requests = [];
    const client = testClient(directory, (_url, init) => {
      const batch = JSON.parse(init.body);
      requests.push(batch.events.map((event) => event.eventId));
      return Promise.resolve(acceptedBatchResponse(
        init,
        (events) => requests.length === 1 ? events.slice(0, 1) : events,
      ));
    });
    client.start();
    client.captureRendererEvent(validRunStarted());
    const originalIds = readQueueState(directory).events.map((event) => event.eventId);

    await client.flushPending();
    assert.deepEqual(readQueueState(directory).events.map((event) => event.eventId), [originalIds[1]]);
    await client.flushPending();
    assert.deepEqual(requests[1], [originalIds[1]]);
    await client.flushPending();
    assert.equal(readQueueState(directory).events.length, 0);
  });
});

test('failures caused only by upload_error never generate recursive reports', () => {
  withTempDirectory((directory) => {
    const queue = queueAt(directory);
    queue.recordUploadFailure('http_503', false);
    assert.equal(queue.consumeUploadFailureAfterRecovery(), null);
  });
});

test('installation identity is random-once, durable, and recovers corruption', () => {
  withTempDirectory((directory) => {
    const file = path.join(directory, 'installation.json');
    let generated = 0;
    const createId = () => `installation-${String(++generated).padStart(8, '0')}`;
    const first = loadOrCreateInstallationId(file, createId, () => FIXED_DATE);
    const second = loadOrCreateInstallationId(file, createId, () => FIXED_DATE);
    assert.equal(first, second);
    assert.equal(generated, 1);

    fs.writeFileSync(file, 'broken', 'utf8');
    const recovered = loadOrCreateInstallationId(file, createId, () => FIXED_DATE);
    assert.notEqual(recovered, first);
    assert.equal(fs.existsSync(`${file}.corrupt-${FIXED_DATE.getTime()}.json`), true);
  });
});
