import { AUDIO } from './config';
import type { GameSettings } from './settings';

export type AudioEventId =
  | 'ui-confirm' | 'ui-back' | 'panel-open' | 'run-start' | 'menu-enter'
  | 'pause' | 'resume' | 'weapon-activation' | 'player-hit' | 'shield-block'
  | 'bolt-cannon-fire'
  | 'enemy-death' | 'xp-pickup' | 'gold-pickup' | 'levelup-intro' | 'levelup-open' | 'levelup-pick'
  | 'chest-open' | 'chest-spin' | 'chest-reveal' | 'merchant-arrival' | 'shop-purchase'
  | 'boss-awaken' | 'boss-attack' | 'boss-defeat' | 'run-victory' | 'run-defeat'
  | 'foundation-music' | 'menu-music';

export interface AudioEvent { id: AudioEventId; key?: string; priority?: number; volume?: number; loop?: boolean; }
export interface AudioDiagnostics { activeVoices: number; peakActiveVoices: number; drops: number; steals: number; loadFailures: number; leakedVoices: number; attempts: number; accepted: number; contextState: string; }
export interface AudioBusGains { master: number; sfx: number; music: number; }

type Voice = { source: AudioBufferSourceNode; gain: GainNode; bus: 'sfx' | 'music'; priority: number; key?: string };
type ManifestAsset = { runtime: { path: string; format: 'ogg' | 'wav' } };
type Manifest = { events?: Partial<Record<AudioEventId, ManifestAsset[]>> };

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
  /** Style-audition pins: event -> fixed variant index (dev cycling via debugCycleVariant). */
  private readonly pinnedVariant = new Map<AudioEventId, number>();
  private generation = 0;
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
    void this.play(event, this.generation);
  }
  setPaused(paused: boolean): void { this.paused = paused; this.applyGains(AUDIO.fades.pauseDuckS); }
  setMenu(menu: boolean): void { this.menu = menu; this.applyGains(AUDIO.fades.pauseDuckS); }
  reset(): void {
    this.generation++;
    this.manifest = null;
    this.manifestPromise = null;
    this.buffers.clear();
    for (const voice of [...this.voices]) this.stopVoice(voice, AUDIO.fades.defaultS);
    this.keyed.clear();
  }
  stopLoop(key: string): void {
    const voice = this.keyed.get(key);
    if (voice) this.stopVoice(voice, AUDIO.fades.defaultS);
  }
  diagnostics(): AudioDiagnostics { return { activeVoices: this.voices.size, peakActiveVoices: this.peakActiveVoices, drops: this.drops, steals: this.steals, loadFailures: this.loadFailures, leakedVoices: this.leaks, attempts: this.attempts, accepted: this.accepted, contextState: this.context?.state ?? 'unavailable' }; }
  resetDiagnostics(): void { this.drops = 0; this.steals = 0; this.loadFailures = 0; this.leaks = 0; this.attempts = 0; this.accepted = 0; this.peakActiveVoices = this.voices.size; }
  debugBusGains(): AudioBusGains {
    const musicMultiplier = (this.paused ? AUDIO.fades.pauseMusicGain : 1) * (this.menu ? AUDIO.fades.menuMusicGain : 1);
    return { master: this.settings.masterVolume, sfx: this.settings.sfxVolume, music: this.settings.musicVolume * musicMultiplier };
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
    const musicMultiplier = (this.paused ? AUDIO.fades.pauseMusicGain : 1) * (this.menu ? AUDIO.fades.menuMusicGain : 1);
    this.master.gain.setTargetAtTime(this.settings.masterVolume, at, fadeS);
    this.sfx.gain.setTargetAtTime(this.settings.sfxVolume, at, fadeS);
    this.music.gain.setTargetAtTime(this.settings.musicVolume * musicMultiplier, at, fadeS);
  }
  private async play(event: AudioEvent, token: number): Promise<void> {
    // Duplicate keyed loops must be rejected before any cap admission can evict a voice.
    if (event.loop && event.key && this.keyed.has(event.key)) return;
    const path = await this.resolvePath(event.id, token);
    if (token !== this.generation || !path || !this.context || !this.sfx || !this.music) return;
    const buffer = await this.loadBuffer(path, token);
    if (token !== this.generation || !buffer || !this.context || !this.sfx || !this.music) return;
    if (event.loop && event.key && this.keyed.has(event.key)) return;
    const bus = event.loop ? 'music' : 'sfx'; const cap = bus === 'music' ? AUDIO.voiceCaps.music : AUDIO.voiceCaps.sfx;
    const existing = [...this.voices].filter(v => v.bus === bus);
    if (this.voices.size >= AUDIO.voiceCaps.global || existing.length >= cap) {
      const victim = existing.sort((a, b) => a.priority - b.priority)[0];
      if (!victim || victim.priority > (event.priority ?? 0)) { this.drops++; return; }
      this.steals++;
      this.stopVoice(victim, AUDIO.fades.defaultS);
    }
    if (token !== this.generation) return;
    const source = this.context.createBufferSource(); const gain = this.context.createGain();
    source.buffer = buffer; source.loop = Boolean(event.loop); gain.gain.value = event.volume ?? 1;
    source.connect(gain); gain.connect(bus === 'music' ? this.music : this.sfx);
    const voice: Voice = { source, gain, bus, priority: event.priority ?? 0, key: event.key };
    this.voices.add(voice); if (event.key) this.keyed.set(event.key, voice);
    this.peakActiveVoices = Math.max(this.peakActiveVoices, this.voices.size);
    source.onended = () => {
      if (!this.voices.delete(voice)) this.leaks++;
      if (event.key && this.keyed.get(event.key) === voice) this.keyed.delete(event.key);
      source.disconnect(); gain.disconnect();
    };
    source.start();
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
    const pinned = this.pinnedVariant.get(id);
    const index = pinned !== undefined ? pinned % entries.length : Math.floor(Math.random() * entries.length);
    return entries[index]?.runtime.path ?? null;
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
