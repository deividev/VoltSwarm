import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { PreviewLoadState } = await server.ssrLoadModule('/src/models/preview-load-state.ts');

test.after(async () => server.close());

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('a new preview clears first and only the latest load may become visible', async () => {
  const state = new PreviewLoadState();
  const first = deferred();
  const second = deferred();
  const events = [];
  const callbacks = (name) => ({
    loading: () => events.push(`loading:${name}`),
    ready: (value) => events.push(`ready:${value}`),
    failed: () => events.push(`failed:${name}`),
  });

  state.begin(() => first.promise, callbacks('first'));
  state.begin(() => second.promise, callbacks('second'));
  first.resolve('stale');
  await flushPromises();
  assert.deepEqual(events, ['loading:first', 'loading:second']);

  second.resolve('current');
  await flushPromises();
  assert.deepEqual(events, ['loading:first', 'loading:second', 'ready:current']);
});

test('current failure is terminal while a stale failure cannot replace current state', async () => {
  const state = new PreviewLoadState();
  const stale = deferred();
  const current = deferred();
  const events = [];
  const callbacks = (name) => ({
    loading: () => events.push(`loading:${name}`),
    ready: () => events.push(`ready:${name}`),
    failed: () => events.push(`failed:${name}`),
  });

  state.begin(() => stale.promise, callbacks('stale'));
  state.begin(() => current.promise, callbacks('current'));
  stale.reject(new Error('stale load failed'));
  current.reject(new Error('current load failed'));
  await flushPromises();
  assert.deepEqual(events, ['loading:stale', 'loading:current', 'failed:current']);
});

test('disposing during a pending rejected load is safe and produces no terminal callback', async () => {
  const state = new PreviewLoadState();
  const pending = deferred();
  const events = [];
  state.begin(() => pending.promise, {
    loading: () => events.push('loading'),
    ready: () => events.push('ready'),
    failed: () => events.push('failed'),
  });
  state.dispose();
  pending.reject(new Error('disposed load failed'));
  await flushPromises();
  assert.deepEqual(events, ['loading']);
});
