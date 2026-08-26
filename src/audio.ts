import { AUDIO } from './config';
import type { GameSettings } from './settings';

export type AudioEventId =
  | 'ui-confirm' | 'ui-back' | 'ui-focus' | 'panel-open' | 'run-start' | 'menu-enter'
  | 'pause' | 'resume' | 'weapon-activation' | 'player-hit' | 'player-fatal' | 'shield-block'
  | 'bolt-cannon-fire' | 'pulse-fire' | 'blades-spin' | 'blades-loop' | 'blades-hit' | 'welder-beam' | 'press-slam'
  | 'tire-launch' | 'oil-drop' | 'acid-throw' | 'acid-loop' | 'turbine-launch' | 'turbine-loop' | 'ricochet-throw' | 'dismantler-swipe'
  | 'enemy-death' | 'xp-pickup' | 'gold-pickup' | 'levelup-intro' | 'levelup-open' | 'levelup-pick'
  | 'chest-open' | 'chest-spin' | 'chest-reveal' | 'merchant-arrival' | 'shop-purchase'
  | 'boss-portal' | 'boss-awaken' | 'boss-defeat' | 'run-victory' | 'run-defeat'
  // The Marshal's sector sweep, one cue per moment on screen: the plates go
  // live, the deadline closes, the arc discharges.
  | 'boss-sweep-charge' | 'boss-sweep-warn' | 'boss-sweep-fire'
  // Core overload: the chain unlocking, and each link of it blowing.
  | 'boss-overload-open' | 'boss-overload-erupt'
  // The ring of red shots: a battery firing, not an impact.
  | 'boss-volley'
  // The ORDER that opens the assembly lines: contactors closing and line motors
  // spinning up, at the boss, 1.4s before anything lands. Mechanical on purpose
  // — its child below is the electric half of the same beat.
  | 'boss-assembly-open'
  // Bodies materialising at a drop zone — the one electric cue in the fight.
  | 'boss-assembly-spawn'
  | 'foundation-music' | 'menu-music';

export interface AudioEvent { id: AudioEventId; key?: string; priority?: number; volume?: number; loop?: boolean; bus?: 'sfx' | 'music'; pos?: { x: number; z: number }; }
export interface AudioDiagnostics { activeVoices: number; peakActiveVoices: number; drops: number; steals: number; loadFailures: number; leakedVoices: number; attempts: number; accepted: number; contextState: string; }
export interface AudioBusGains { master: number; sfx: number; music: number; }

type Voice = { source: AudioBufferSourceNode; gain: GainNode; bus: 'sfx' | 'music'; priority: number; key?: string; loop: boolean; volume: number; disposed: boolean };
type ManifestAsset = { runtime: { path: string; format: 'mp3' | 'ogg' | 'wav' } };
type Manifest = { events?: Partial<Record<AudioEventId, ManifestAsset[]>> };

export function audioBusGains(
  settings: Pick<GameSettings, 'masterVolume' | 'musicVolume' | 'sfxVolume'>,
  paused: boolean,
  _menu: boolean,
): AudioBusGains {
  const musicMultiplier = paused ? AUDIO.fades.pauseMusicGain : 1;
  return {
    master: settings.masterVolume,
    sfx: settings.sfxVolume * AUDIO.mix.sfxBusGain,
    music: settings.musicVolume * musicMultiplier,
  };
}

/** Resolves an event variant without ever returning an out-of-range index.
 * Audition pins are intentional developer overrides, fixed choices are release
 * policy, and every other event preserves manifest rotation. */
export function selectAudioVariantIndex(
  entryCount: number,
  pinnedIndex: number | undefined,
  fixedIndex: number | undefined,
  randomValue = Math.random(),
): number | null {
  if (!Number.isSafeInteger(entryCount) || entryCount <= 0) return null;
  const bounded = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return ((Math.trunc(value) % entryCount) + entryCount) % entryCount;
  };
  if (pinnedIndex !== undefined) return bounded(pinnedIndex);
  if (fixedIndex !== undefined) return bounded(fixedIndex);
  const safeRandom = Number.isFinite(randomValue) ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON) : 0;
  return Math.floor(safeRandom * entryCount);
}

/** Observer-only renderer audio. It never changes gameplay and silently degrades without assets/Web Audio. */
export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private settings: GameSettings;
  private manifest: Manifest | null = null;
  private manifestPromise: Promise<void> | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly voices = new Set<Voice>();
  private readonly keyed = new Map<string, Voice>();
  private readonly lastEvent = new Map<string, number>();
  /** Invalidates an async keyed load when its owner stops before decode ends. */
  private readonly keyRevision = new Map<string, number>();
  /** Style-audition pins: event -> fixed variant index (dev cycling via debugCycleVariant). */
  private readonly pinnedVariant = new Map<AudioEventId, number>();
  private generation = 0;
  private musicRevision = 0;
  private desiredMusicKey: string | null = null;
  private sfxLoopsSuspended = false;
  private listenerX = 0;
  private listenerZ = 0;
  private hasListener = false;
  private paused = false;
  private menu = true;
  private drops = 0;
  private steals = 0;
  private peakActiveVoices = 0;
  private loadFailures = 0;
  private leaks = 0;
  private attempts = 0;
  private accepted = 0;

  constructor(settings: GameSettings) { this.settings = settings; }

  setSettings(settings: GameSettings): void { this.settings = settings; this.applyGains(); }
  async activateFromUserGesture(): Promise<void> {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    if (!this.context) this.createGraph();
    // Skip the audio-thread round trip when already running: awaiting resume()
    // on a running context adds audible latency to gesture-driven UI sounds.
    if (this.context?.state === 'running') return;
    try { await this.context?.resume(); } catch { /* browser policy: remain silent */ }
  }
  async preload(eventIds: readonly AudioEventId[]): Promise<void> {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    if (!this.context) this.createGraph();
    const token = this.generation;
    // Warm EVERY variant of every event. Decoding at emit time delays the sound
    // past its animation frame, and delayed feedback reads worse than silence.
    if (!this.manifestPromise) this.manifestPromise = this.loadManifest(token);
    await this.manifestPromise;
    if (token !== this.generation) return;
    await Promise.all(eventIds.map(async (id) => {
      const entries = this.manifest?.events?.[id] ?? [];
      await Promise.all(entries.map((entry) => this.loadBuffer(entry.runtime.path, token)));
    }));
  }
  preloadEnabled(): Promise<void> {
    return this.preload(AUDIO.validation.enabledEvents as readonly AudioEventId[]);
  }
  emit(event: AudioEvent): void {
    const benchmarkMode = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).has('audioBenchmark');
    if (!benchmarkMode && !AUDIO.validation.enabledEvents.includes(event.id)) return;
    this.attempts++;
    const now = performance.now() / 1000;
    const cooldown = AUDIO.cooldownS[event.id as keyof typeof AUDIO.cooldownS] ?? 0;
    const key = event.key ?? event.id;
    if ((this.lastEvent.get(key) ?? -Infinity) + cooldown > now) { this.drops++; return; }
    this.lastEvent.set(key, now);
    this.accepted++;
    if (!this.context || this.context.state !== 'running') return;
    const keyRevision = event.key === undefined ? undefined : (this.keyRevision.get(event.key) ?? 0);
    void this.play(event, this.generation, keyRevision);
  }
  /**
   * Requests the one current music bed. The outgoing bed is kept alive until
   * the incoming buffer is ready, then both gains ride one exact crossfade.
   * A later request invalidates every earlier async fetch/decode, so a delayed
   * menu load can never resurrect after a run has started.
   */
  transitionMusic(id: AudioEventId, key: string, volume: number): void {
    if (this.desiredMusicKey === key) return;
    this.desiredMusicKey = key;
    const revision = ++this.musicRevision;
    void this.playMusicTransition(id, key, volume, revision);
  }
  /** Stops the current music and cancels any pending replacement. */
  stopMusic(fadeS: number = AUDIO.fades.musicCrossfadeS): void {
    this.desiredMusicKey = null;
    this.musicRevision++;
    for (const voice of [...this.voices].filter((candidate) => candidate.bus === 'music')) {
      this.fadeVoiceToSilence(voice, fadeS);
      if (voice.key && this.keyed.get(voice.key) === voice) this.keyed.delete(voice.key);
    }
  }
  /** Update the listener (player) world position for distance attenuation of
   *  world-positioned one-shots (`emit({pos})`). Call each frame while playing. */
  setListener(x: number, z: number): void { this.listenerX = x; this.listenerZ = z; this.hasListener = true; }
  /** World-distance volume multiplier for a sound at `pos` (the RULE): 1 at the
   *  listener, falling linearly to `minVolume` at/beyond `maxHearingDistance`. */
  private spatialGain(pos: { x: number; z: number }): number {
    if (!this.hasListener) return 1;
    const dist = Math.hypot(pos.x - this.listenerX, pos.z - this.listenerZ);
    const k = Math.max(0, 1 - dist / AUDIO.spatial.maxHearingDistance);
    return AUDIO.spatial.minVolume + (1 - AUDIO.spatial.minVolume) * k;
  }
  /** Ducks the run music (pause-style). Safe to call every frame — no-ops when
   *  unchanged so the ramp isn't re-armed each tick. Driven from the game state
   *  so ANY in-game overlay (pause, level-up, chest, shop, game over) ducks the
   *  music the same way pause does. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.applyGains(AUDIO.fades.pauseDuckS);
  }
  /** Silence sustained sfx loops (weapon hums) while the run isn't actively
   *  simulating — any modal overlay (pause, level-up, chest, shop, game over).
   *  Scoped to sfx-bus LOOPS only: one-shots and menu/UI clicks still sound.
   *  Driven every frame from the game state, so it self-heals; no-ops when the
   *  target hasn't changed to avoid re-arming the ramp each frame. */
  setSfxLoopsSuspended(suspended: boolean): void {
    if (suspended === this.sfxLoopsSuspended) return;
    this.sfxLoopsSuspended = suspended;
    if (!this.context) return;
    const at = this.context.currentTime;
    for (const v of this.voices) {
      if (v.bus === 'sfx' && v.loop) {
        v.gain.gain.setTargetAtTime(suspended ? 0 : v.volume, at, AUDIO.fades.pauseDuckS);
      }
    }
  }
  setMenu(menu: boolean): void { this.menu = menu; this.applyGains(AUDIO.fades.pauseDuckS); }
  reset(): void {
    this.generation++;
    this.musicRevision++;
    this.desiredMusicKey = null;
    this.manifest = null;
    this.manifestPromise = null;
    this.buffers.clear();
    this.keyRevision.clear();
    for (const voice of [...this.voices]) this.stopVoice(voice, AUDIO.fades.defaultS);
    this.keyed.clear();
  }
  /** Live-set a keyed loop's volume — e.g. distance attenuation for a world-
   *  positioned zone loop (acid pool). Updates the stored target so an
   *  overlay-suspend still restores to the LATEST value; ramps the gain smoothly
   *  unless this sfx loop is currently suspended (then stay muted). Safe to call
   *  every frame. */
  setLoopVolume(key: string, volume: number): void {
    const voice = this.keyed.get(key);
    if (!voice) return;
    voice.volume = volume;
    const muted = this.sfxLoopsSuspended && voice.bus === 'sfx' && voice.loop;
    if (this.context && !muted) {
      voice.gain.gain.setTargetAtTime(volume, this.context.currentTime, AUDIO.fades.defaultS);
    }
  }
  /**
   * Fades a keyed loop to TRUE silence in exactly `fadeS`, then stops it.
   *
   * Deliberately separate from stopLoop: stopVoice uses setTargetAtTime, whose
   * argument is a time CONSTANT, so a 0.45s "fade" there is still at ~37% gain
   * after 0.45s. The defeat beat has a measured duration requirement, so it gets
   * a linear ramp that actually lands on zero — and every other loop keeps the
   * cheap exponential stop it already had.
   */
  fadeOutLoop(key: string, fadeS: number): void {
    this.invalidateKey(key);
    const voice = this.keyed.get(key);
    if (!voice) return;
    if (!this.context) return;
    const at = this.context.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(at);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
      voice.gain.gain.linearRampToValueAtTime(0, at + fadeS);
      voice.source.stop(at + fadeS);
    } catch { /* one-shot already ended */ }
    if (this.keyed.get(key) === voice) this.keyed.delete(key);
  }
  stopLoop(key: string): void {
    this.invalidateKey(key);
    const voice = this.keyed.get(key);
    if (!voice) return;
    this.stopVoice(voice, AUDIO.fades.defaultS);
    // Free the key NOW, not on the voice's onended (~0.16s later). Otherwise a
    // quick re-attack inside the fade window is rejected by play()'s duplicate
    // guard, then the old voice ends leaving nothing playing while the weapon
    // still thinks it's active → the loop stays silent until the next stop/start
    // (welder re-attack bug, 2026-07-21). onended's identity check (keyed.get ===
    // voice) stops it from clobbering a newer voice that reclaimed the key.
    if (this.keyed.get(key) === voice) this.keyed.delete(key);
  }
  /** Stop every sustained loop owned by one key namespace without resetting
   * decoded audio. Used when a world reset invalidates weapon-side edge
   * trackers while their AudioDirector voices are still alive. */
  stopLoopsByKeyPrefix(prefix: string): void {
    for (const [key, voice] of [...this.keyed]) {
      if (!key.startsWith(prefix) || !voice.loop) continue;
      this.stopVoice(voice, AUDIO.fades.defaultS);
      if (this.keyed.get(key) === voice) this.keyed.delete(key);
    }
  }
  diagnostics(): AudioDiagnostics { return { activeVoices: this.voices.size, peakActiveVoices: this.peakActiveVoices, drops: this.drops, steals: this.steals, loadFailures: this.loadFailures, leakedVoices: this.leaks, attempts: this.attempts, accepted: this.accepted, contextState: this.context?.state ?? 'unavailable' }; }
  resetDiagnostics(): void { this.drops = 0; this.steals = 0; this.loadFailures = 0; this.leaks = 0; this.attempts = 0; this.accepted = 0; this.peakActiveVoices = this.voices.size; }
  debugBusGains(): AudioBusGains {
    return audioBusGains(this.settings, this.paused, this.menu);
  }
  /** Pin an event to a fixed variant index (audition determinism). */
  debugPinVariant(id: AudioEventId, index: number): void {
    this.pinnedVariant.set(id, index);
  }
  /** Advance the audition pin for an event and return the newly pinned asset path. */
  debugCycleVariant(id: AudioEventId): string | null {
    const entries = this.manifest?.events?.[id];
    if (!entries || entries.length === 0) return null;
    const next = ((this.pinnedVariant.get(id) ?? -1) + 1) % entries.length;
    this.pinnedVariant.set(id, next);
    return entries[next]?.runtime.path ?? null;
  }
  diagnosticBurst(): AudioDiagnostics {
    for (let i = 0; i < AUDIO.diagnostics.stressEventCount; i++) {
      this.emit({ id: 'enemy-death', priority: AUDIO.diagnostics.stressPriority });
    }
    return this.diagnostics();
  }

  private createGraph(): void {
    try {
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.sfx = this.context.createGain(); this.music = this.context.createGain();
      this.sfx.connect(this.master); this.music.connect(this.master); this.master.connect(this.context.destination); this.applyGains();
    } catch { this.context = null; this.master = this.sfx = this.music = null; }
  }
  private applyGains(fadeS: number = AUDIO.fades.defaultS): void {
    if (!this.context || !this.master || !this.sfx || !this.music) return;
    const at = this.context.currentTime;
    const gains = audioBusGains(this.settings, this.paused, this.menu);
    this.master.gain.setTargetAtTime(gains.master, at, fadeS);
    this.sfx.gain.setTargetAtTime(gains.sfx, at, fadeS);
    this.music.gain.setTargetAtTime(gains.music, at, fadeS);
  }
  private async play(event: AudioEvent, token: number, keyRevision?: number): Promise<void> {
    // Duplicate keyed loops must be rejected before any cap admission can evict a voice.
    if (event.loop && event.key && this.keyed.has(event.key)) return;
    const path = await this.resolvePath(event.id, token);
    if (!this.requestIsCurrent(event.key, keyRevision) || token !== this.generation || !path || !this.context || !this.sfx || !this.music) return;
    const buffer = await this.loadBuffer(path, token);
    if (!this.requestIsCurrent(event.key, keyRevision) || token !== this.generation || !buffer || !this.context || !this.sfx || !this.music) return;
    if (event.loop && event.key && this.keyed.has(event.key)) return;
    // Loops default to the music bus (menu/foundation music), but a weapon loop
    // can pin itself to the sfx bus so it obeys the SFX slider and never fights
    // the 2-voice music cap.
    const bus = event.bus ?? (event.loop ? 'music' : 'sfx'); const cap = bus === 'music' ? AUDIO.voiceCaps.music : AUDIO.voiceCaps.sfx;
    const existing = [...this.voices].filter(v => v.bus === bus);
    if (this.voices.size >= AUDIO.voiceCaps.global || existing.length >= cap) {
      // A one-shot may never evict a sustained LOOP. Weapon hums start on an
      // edge (weapons.ts starts them when the weapon activates, not per frame),
      // so a stolen loop is gone until that weapon fully stops and restarts —
      // the blades would go silent mid-fight for no visible reason. One-shots
      // are the only voices that can be replaced without leaving a hole.
      // Absolute, not a preference: with nothing but loops holding the bus the
      // incoming one-shot is DROPPED rather than cutting a hum. Reachable only
      // in theory (there are at most a handful of weapon loops against a cap of
      // 14), and a rule with an escape hatch is the kind that fires once, in
      // front of a player, for reasons nobody can reconstruct.
      const victim = existing
        .filter((v) => !v.loop)
        .sort((a, b) => a.priority - b.priority)[0];
      if (!victim || victim.priority > (event.priority ?? 0)) { this.drops++; return; }
      this.steals++;
      this.stopVoice(victim, AUDIO.fades.defaultS);
    }
    if (token !== this.generation) return;
    const source = this.context.createBufferSource(); const gain = this.context.createGain();
    // A sfx loop born while the run is suspended starts silent, then ramps up
    // when play resumes (setSfxLoopsSuspended). Prevents a one-frame blip.
    const startMuted = Boolean(event.loop) && bus === 'sfx' && this.sfxLoopsSuspended;
    // World-positioned sounds attenuate by the listener's distance (the RULE).
    const spatial = event.pos ? this.spatialGain(event.pos) : 1;
    source.buffer = buffer; source.loop = Boolean(event.loop); gain.gain.value = startMuted ? 0 : (event.volume ?? 1) * spatial;
    source.connect(gain); gain.connect(bus === 'music' ? this.music : this.sfx);
    const voice: Voice = { source, gain, bus, priority: event.priority ?? 0, key: event.key, loop: Boolean(event.loop), volume: event.volume ?? 1, disposed: false };
    this.voices.add(voice); if (event.key) this.keyed.set(event.key, voice);
    this.peakActiveVoices = Math.max(this.peakActiveVoices, this.voices.size);
    source.onended = () => this.disposeVoice(voice);
    source.start();
  }
  private async playMusicTransition(id: AudioEventId, key: string, volume: number, revision: number): Promise<void> {
    const token = this.generation;
    const path = await this.resolvePath(id, token);
    if (!this.musicRequestIsCurrent(key, revision, token) || !path || !this.context || !this.music) return;
    const buffer = await this.loadBuffer(path, token);
    if (!this.musicRequestIsCurrent(key, revision, token) || !buffer || !this.context || !this.music) return;

    const at = this.context.currentTime;
    const existing = [...this.voices].filter((voice) => voice.bus === 'music');
    // A rapid third transition may arrive while the first bed is still fading.
    // Retire every older outgoing source now so the real music cap remains two:
    // one outgoing plus one incoming, never an accumulating fade tail.
    for (const voice of existing.slice(0, -1)) this.disposeVoiceImmediately(voice, at);
    const outgoing = existing.at(-1);
    if (outgoing) {
      this.fadeVoiceToSilence(outgoing, AUDIO.fades.musicCrossfadeS);
      if (outgoing.key && this.keyed.get(outgoing.key) === outgoing) this.keyed.delete(outgoing.key);
    }

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + AUDIO.fades.musicCrossfadeS);
    source.connect(gain);
    gain.connect(this.music);
    const voice: Voice = { source, gain, bus: 'music', priority: 2, key, loop: true, volume, disposed: false };
    this.voices.add(voice);
    this.keyed.set(key, voice);
    this.peakActiveVoices = Math.max(this.peakActiveVoices, this.voices.size);
    source.onended = () => this.disposeVoice(voice);
    source.start(at);
  }
  private musicRequestIsCurrent(key: string, revision: number, generation: number): boolean {
    return generation === this.generation && revision === this.musicRevision && key === this.desiredMusicKey;
  }
  private requestIsCurrent(key: string | undefined, revision: number | undefined): boolean {
    return key === undefined || revision === (this.keyRevision.get(key) ?? 0);
  }
  private invalidateKey(key: string): void {
    this.keyRevision.set(key, (this.keyRevision.get(key) ?? 0) + 1);
  }
  private fadeVoiceToSilence(voice: Voice, fadeS: number): void {
    if (!this.context || voice.disposed) return;
    const at = this.context.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(at);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
      voice.gain.gain.linearRampToValueAtTime(0, at + fadeS);
      voice.source.stop(at + fadeS);
    } catch { /* voice already ended */ }
  }
  private disposeVoiceImmediately(voice: Voice, at: number): void {
    if (voice.disposed) return;
    try { voice.source.stop(at); } catch { /* voice already ended */ }
    this.disposeVoice(voice);
  }
  private disposeVoice(voice: Voice): void {
    if (voice.disposed) return;
    voice.disposed = true;
    if (!this.voices.delete(voice)) this.leaks++;
    if (voice.key && this.keyed.get(voice.key) === voice) this.keyed.delete(voice.key);
    voice.source.disconnect();
    voice.gain.disconnect();
  }
  private stopVoice(voice: Voice, fadeS: number): void {
    if (!this.context) return;
    try { voice.gain.gain.setTargetAtTime(0, this.context.currentTime, fadeS); voice.source.stop(this.context.currentTime + fadeS * 4); } catch { /* one-shot already ended */ }
  }
  private async resolvePath(id: AudioEventId, token: number): Promise<string | null> {
    if (!this.manifestPromise) this.manifestPromise = this.loadManifest(token);
    await this.manifestPromise;
    if (token !== this.generation) return null;
    const entries = this.manifest?.events?.[id];
    if (!entries || entries.length === 0) return null;
    const index = selectAudioVariantIndex(
      entries.length,
      this.pinnedVariant.get(id),
      AUDIO.fixedVariantIndex[id],
    );
    return index === null ? null : entries[index]?.runtime.path ?? entries[0]?.runtime.path ?? null;
  }
  private async loadManifest(token: number): Promise<void> {
    try {
      const response = await fetch(AUDIO.paths.manifest);
      if (token !== this.generation) return;
      if (!response.ok) throw new Error(String(response.status));
      const parsed = await response.json() as Manifest;
      if (token !== this.generation) return;
      this.manifest = parsed;
    } catch {
      if (token !== this.generation) return;
      this.loadFailures++; this.manifest = { events: {} };
    }
  }
  private loadBuffer(path: string, token: number): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(path); if (cached) return cached;
    const pending = (async () => {
      try {
        const response = await fetch(path);
        if (token !== this.generation || !response.ok || !this.context) return null;
        const bytes = await response.arrayBuffer();
        if (token !== this.generation || !this.context) return null;
        const decoded = await this.context.decodeAudioData(bytes);
        return token === this.generation ? decoded : null;
      } catch {
        if (token === this.generation) this.loadFailures++;
        return null;
      }
    })();
    this.buffers.set(path, pending); return pending;
  }
}
