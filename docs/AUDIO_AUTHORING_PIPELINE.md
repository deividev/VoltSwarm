# Pipeline de autoría de audio

**Decisión:** los SFX procedurales se generan **offline** de forma determinista y
el runtime solo reproduce assets pre-renderizados. Los candidatos externos de
ElevenLabs y la música Suno NO son reproducibles desde su prompt: se conservan
como masters inmutables con hash y provenance. Este documento define qué se
conserva para reconstruir y mapear cada asset, y separa esa evidencia técnica
de cualquier evidencia privada de derechos comerciales.

> **Current status 2026-08-26:** `pnpm audio:generate` reconstructs the complete
> active runtime pack (50 events, 97 variants) from accepted immutable masters,
> verifies hashes/format/provenance, and atomically promotes the output to
> `public/assets/audio/sfx/`. The maintainer listened to the current state in game
> and accepted its mix, levels, and crossfade as the `0.30.7` baseline.
> Structural validation complements that verdict; it does not replace it.

## 1. SFX procedural offline

### Alcance y salida

- Un generador offline toma receta versionada + seed determinista y produce variantes de una familia SFX.
- Cada receta declara osciladores y/o ruido, envolventes, filtros, bitcrush, capas y parámetros de variante. El seed, versión del generador y receta bastan para re-renderizar el resultado.
- Salidas: WAV master sin pérdida para edición/archivo y export runtime (OGG) normalizado con fades de entrada/salida para evitar clicks.
- Familias esperadas: impactos, armas, pickups, UI, enemigos/boss y ambiente. Las variantes pertenecen a su familia, no a un random runtime no reproducible.
- **Prohibido en runtime:** síntesis, generación procedural o render de buffers SFX. `AudioDirector` selecciona/reproduce exports ya renderizados por evento semántico.

### Manifiesto y provenance

El manifiesto versionado mapea `semanticEventId → family → variantes → runtime export`. Por asset conserva los campos deterministas generados: receta/version, seed, índice de variante, versión/hash del generador, hash y formato PCM del WAV, duración, pico, normalización, fade y formato/ruta del export. Git conserva autoría y cambio; no se guardan fecha de render, responsable ni commit por entrada. El manifiesto permite que `AudioDirector` no conozca nombres físicos ni reglas de generación.

**Layout operativo vigente:**

```text
tools/audio/runtime-pack.json          # lock canónico: eventos, paths, hashes y provenance
tools/audio/rebuild-runtime-pack.mjs   # validación + staging + promoción atómica
tools/audio/validate-runtime-pack.mjs  # cobertura/formato/hash/orphans; admite --dist
audio-masters/runtime/                 # vault canónico versionado: 96 masters aceptados
public/assets/audio/sfx/               # ÚNICO pack runtime; manifiesto + bytes exactos
```

Antes de aceptar un lote nuevo: producir desde su receta/origen, escuchar, fijar
el master ganador y su hash en `runtime-pack.json`, reconstruir y validar. El
pack canónico reconstruye **los bytes aceptados**; no vuelve a decidir qué
candidato gana. Los thresholds numéricos de mix/runtime pertenecen a config.

## 2. Música generada con Suno

**Uso previsto:** música de menú, loop de run y capa/tema de boss. No usar prompts de imitación de artistas, bandas ni obras identificables; describir instrumentación, energía, arco y dirección “juguete industrial” propios.

### Evidence boundary for the shipped external masters

- **Required technical evidence:** immutable source bytes, SHA-256, provider/source classification, prompt or catalog provenance, and the exact runtime mapping.
- **Maintainer-owned scope/risk decision (2026-08-26):** provider receipts, account/subscription records, generation URLs/IDs, and private commercial-entitlement evidence for the currently shipped Suno/ElevenLabs masters are outside the Steam launch gate. Their absence does not block RC.
- This scope decision is **not** proof of commercial rights or legal entitlement and does not claim that any excluded artifact exists.
- For future provider generations or a separately distributed soundtrack, archiving current terms and private entitlement evidence is recommended risk reduction, but it becomes a release gate only through a new explicit maintainer decision.

Fuentes oficiales: [Suno commercial use / subscription](https://help.suno.com/en/articles/9601665) · [Suno ownership / commercial rights](https://help.suno.com/en/articles/2416769) · [Suno Terms of Service](https://suno.com/terms/).

## 3. Gate de entrega de audio

- [ ] SFX: receta, seed, generador, masters, exports y manifiesto reproducibles en source control.
- [ ] SFX: `AudioDirector` solo reproduce exports pre-renderizados para IDs semánticos.
- [x] External masters: immutable bytes, hashes, prompt/catalog provenance, and runtime mappings are versioned. Private provider receipts, URLs/IDs, account records, and commercial-entitlement evidence are excluded from this Steam launch gate by explicit maintainer risk acceptance; no legal-entitlement claim is made.
- [ ] Música: prompts sin imitación de artistas; términos revisados para el uso previsto.
- [ ] Runtime: `AUDIO.voiceCaps` config-owned y benchmark 400+/60 FPS registrado con drops de voz/fugas de fuentes.


## Implementation status (updated 2026-08-26)

`pnpm audio:generate` (también `prebuild`) reconstruye los 50 eventos habilitados
desde `runtime-pack.json`. Falla si falta un master, cambia un hash, la extensión
no coincide con WAV/OGG/MP3, hay cobertura incompleta o queda un orphan; solo
después promociona el staging. `pnpm audio:validate` relee el pack público y
`node tools/audio/validate-runtime-pack.mjs --dist` prueba la copia de Vite.
`AUDIO.paths.manifest` carga ese mismo `assets/audio/sfx/manifest.json`; el árbol
`prototypes/` ya no es runtime ni se copia al build.

### External masters are not recipes

Suno takes (`Neon Horizon`, `Neon Swarm (4)`) and ElevenLabs candidates are
non-deterministic external generations. Their chosen bytes are immutable masters
with SHA-256 and prompt/catalog provenance in `runtime-pack.json`. Reconstruction
copies them exactly. It MUST NOT call either provider or pretend the prompt can
recreate the same take. Procedural winners also remain byte-pinned so a later
generator refactor cannot silently alter an already accepted mix.

## Final cohesion calibration (human gate)

**Gate CLOSED for `0.30.7` on 2026-08-26.** The maintainer completed human
playtesting and accepted the current volume, mix and crossfade baseline. The
acceptance record is `docs/AUDIO_MIX_ACCEPTANCE_0.30.7.md`. It deliberately does
not invent route notes, diagnostic counters or quantitative run data that were
not supplied. Any later change to the runtime pack, `AUDIO` mix/fade values or
music lifecycle invalidates this release-scoped acceptance and reopens the flow
below.

### Recalibration workflow

1. Temporarily set `DEV_TOOLS.audioDiagnostics=true`, then run
   `pnpm audio:generate && pnpm audio:validate && pnpm build && pnpm electron:build`.
   Validate the built copy with
   `node tools/audio/validate-runtime-pack.mjs --dist`.
2. Run `pnpm audio:mix-sheet`; it creates a pending evidence sheet tied to the
   exact runtime-pack hash, AUDIO-config hash, Git HEAD/dirty diff identity and
   hashes of the tested `dist` files. Any mix/fade edit requires a new sheet.
3. Launch those exact frozen bytes with `pnpm exec electron .` — do NOT use
   `pnpm electron:start`, because it rebuilds after the evidence sheet is bound.
   Complete menu → Scrapyard → Foundry → Hazard Marshal → menu. Record the three
   route notes, five listening checkpoints and
   `window.__voltswarmAudio.diagnostics()` in the sheet. Revert the flag to
   `false`; the release guard refuses packaging while it is enabled.
4. Change only one config-owned mix value per comparison. A newly generated report stays
   `pending-human-listening` until the maintainer records the final decision.

The automated 400+ benchmark proves voice/performance hygiene, not loudness or
cohesion. No Map 2 bed or boss track exists in the active pack. Menu → run is a
real two-track overlap; end-of-run intentionally fades the run bed to silence so
the later menu return starts a clean fade-in rather than overlapping results.

## Artistic approval status

Audio v1's current generated pack is accepted. Read `SOUND_EVENT_CATALOG.md`
before authoring; `SOUND_DIRECTION.md` is superseded where it conflicts with the
six current style laws. New content still requires its brief, deterministic
recipe/provenance, integración explícita en el pipeline canónico correspondiente y un
veredicto in-game. Nunca se deben editar a mano los masters/exports locales.
`audio-masters/runtime/` is the narrow tracked-media exception, so a normal clone
contains every accepted byte needed for one-command reconstruction. Los fixtures históricos rechazados no
definen el estado del pack v1 activo.
