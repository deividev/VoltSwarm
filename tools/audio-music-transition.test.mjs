import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

class FakeGainParam {
  value = 1;
  calls = [];
  setTargetAtTime(value, at, duration) { this.value = value; this.calls.push(['target', value, at, duration]); }
  setValueAtTime(value, at) { this.value = value; this.calls.push(['set', value, at]); }
  linearRampToValueAtTime(value, at) { this.value = value; this.calls.push(['linear', value, at]); }
  cancelScheduledValues(at) { this.calls.push(['cancel', at]); }
}

class FakeGain {
  gain = new FakeGainParam();
  connect() {}
  disconnect() {}
}

class FakeSource {
  buffer = null;
  loop = false;
  onended = null;
  starts = [];
  stops = [];
  connect() {}
  disconnect() {}
  start(at = 0) { this.starts.push(at); }
  stop(at = 0) { this.stops.push(at); }
}

class FakeAudioContext {
  static instances = [];
  state = 'running';
  currentTime = 10;
  destination = {};
  gains = [];
  sources = [];
  constructor() { FakeAudioContext.instances.push(this); }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  decodeAudioData(bytes) { return Promise.resolve({ bytes }); }
  resume() { return Promise.resolve(); }
}

const pendingBytes = new Map();
globalThis.AudioContext = FakeAudioContext;
globalThis.window = { AudioContext: FakeAudioContext };
globalThis.fetch = async (path) => {
  if (path === 'assets/audio/sfx/manifest.json') {
    return {
      ok: true,
      json: async () => ({
        events: {
          'menu-music': [{ runtime: { path: 'assets/audio/sfx/menu-music.mp3', format: 'mp3' } }],
          'foundation-music': [{ runtime: { path: 'assets/audio/sfx/music-lead.mp3', format: 'mp3' } }],
        },
      }),
    };
  }
  const gate = deferred();
  pendingBytes.set(path, gate);
  return { ok: true, arrayBuffer: () => gate.promise };
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { AudioDirector } = await server.ssrLoadModule('/src/audio.ts');
const { AUDIO } = await server.ssrLoadModule('/src/config.ts');
test.after(async () => {
  await server.close();
  delete globalThis.window;
  delete globalThis.AudioContext;
  delete globalThis.fetch;
});

const settings = {
  masterVolume: 1,
  musicVolume: 1,
  sfxVolume: 1,
};

async function waitFor(predicate) {
  for (let i = 0; i < 40; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('timed out waiting for async audio request');
}

test('stale menu decode cannot resurrect after the run request wins', async () => {
  pendingBytes.clear();
  const director = new AudioDirector(settings);
  await director.activateFromUserGesture();
  const context = FakeAudioContext.instances.at(-1);

  director.transitionMusic('menu-music', 'menu-music-loop', AUDIO.music.menuLoopVolume);
  await waitFor(() => pendingBytes.has('assets/audio/sfx/menu-music.mp3'));
  // Matches Game.tickLoading: leaving menu changes lifecycle state before the
  // run request. The shared bus must stay at the settings gain; otherwise the
  // still-playing outgoing menu voice swells during the overlap.
  director.setMenu(false);
  const musicBus = context.gains[2].gain;
  assert.deepEqual(musicBus.calls.at(-1), ['target', 1, context.currentTime, AUDIO.fades.pauseDuckS]);
  director.transitionMusic('foundation-music', 'foundation-run-loop', AUDIO.music.runLoopVolume);
  await waitFor(() => pendingBytes.has('assets/audio/sfx/music-lead.mp3'));

  pendingBytes.get('assets/audio/sfx/music-lead.mp3').resolve(new ArrayBuffer(8));
  await waitFor(() => context.sources.length === 1);
  const incomingGain = context.gains.at(-1).gain.calls;
  assert.deepEqual(incomingGain.slice(-2), [
    ['set', 0, context.currentTime],
    ['linear', AUDIO.music.runLoopVolume, context.currentTime + AUDIO.fades.musicCrossfadeS],
  ]);

  pendingBytes.get('assets/audio/sfx/menu-music.mp3').resolve(new ArrayBuffer(8));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.sources.length, 1, 'stale menu music started after the run bed');
});

test('crossfade keeps the real music voice count capped at outgoing plus incoming', async () => {
  pendingBytes.clear();
  const director = new AudioDirector(settings);
  await director.activateFromUserGesture();
  const context = FakeAudioContext.instances.at(-1);

  director.transitionMusic('foundation-music', 'foundation-run-loop', AUDIO.music.runLoopVolume);
  await waitFor(() => pendingBytes.has('assets/audio/sfx/music-lead.mp3'));
  pendingBytes.get('assets/audio/sfx/music-lead.mp3').resolve(new ArrayBuffer(8));
  await waitFor(() => context.sources.length === 1);

  director.transitionMusic('menu-music', 'menu-music-loop', AUDIO.music.menuLoopVolume);
  await waitFor(() => pendingBytes.has('assets/audio/sfx/menu-music.mp3'));
  pendingBytes.get('assets/audio/sfx/menu-music.mp3').resolve(new ArrayBuffer(8));
  await waitFor(() => context.sources.length === 2);
  assert.deepEqual(context.gains.at(-2).gain.calls.slice(-3), [
    ['cancel', context.currentTime],
    ['set', AUDIO.music.runLoopVolume, context.currentTime],
    ['linear', 0, context.currentTime + AUDIO.fades.musicCrossfadeS],
  ]);

  director.transitionMusic('foundation-music', 'foundation-run-loop', AUDIO.music.runLoopVolume);
  await waitFor(() => context.sources.length === 3);
  assert.equal(director.diagnostics().activeVoices, AUDIO.voiceCaps.music);
});
