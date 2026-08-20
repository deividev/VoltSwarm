# Pipeline de autoría de audio

**Decisión:** los SFX procedurales se generan **offline** de forma determinista y el runtime solo reproduce assets pre-renderizados. La música de menú/run/boss se genera con Suno bajo un plan comercial válido. Este documento define qué se conserva para reproducir, licenciar y mapear cada asset.

> **Estado vigente 2026-08-20:** audio v1 está aceptado/cerrado y el pipeline
> offline está operativo, con recetas y manifiestos versionados. La reconstrucción
> completa del pack runtime activo todavía no está unificada: `pnpm audio:generate`
> cubre foundation, navegación UI y `boss-assembly-open`, no todos los WAV del
> manifiesto de prototipos. El catálogo sigue abierto para contenido nuevo y
> cohesión final: v1 cerrado no significa que todos los eventos futuros estén
> producidos. `boss-assembly-open` forma parte de la generación canónica del
> Hazard Marshal; no depende de un archivo manual en `tmp`.

## 1. SFX procedural offline

### Alcance y salida

- Un generador offline toma receta versionada + seed determinista y produce variantes de una familia SFX.
- Cada receta declara osciladores y/o ruido, envolventes, filtros, bitcrush, capas y parámetros de variante. El seed, versión del generador y receta bastan para re-renderizar el resultado.
- Salidas: WAV master sin pérdida para edición/archivo y export runtime (OGG) normalizado con fades de entrada/salida para evitar clicks.
- Familias esperadas: impactos, armas, pickups, UI, enemigos/boss y ambiente. Las variantes pertenecen a su familia, no a un random runtime no reproducible.
- **Prohibido en runtime:** síntesis, generación procedural o render de buffers SFX. `AudioDirector` selecciona/reproduce exports ya renderizados por evento semántico.

### Manifiesto y provenance

El manifiesto versionado mapea `semanticEventId → family → variantes → runtime export`. Por asset conserva los campos deterministas generados: receta/version, seed, índice de variante, versión/hash del generador, hash y formato PCM del WAV, duración, pico, normalización, fade y formato/ruta del export. Git conserva autoría y cambio; no se guardan fecha de render, responsable ni commit por entrada. El manifiesto permite que `AudioDirector` no conozca nombres físicos ni reglas de generación.

**Layout operativo** (fuentes y manifiestos bajo source control; exports runtime siguen el pipeline de assets del repo):

```text
tools/audio/generate.mjs        # recetas versionadas + generador offline
tools/audio/manifest.json       # semantic event -> export + provenance
tools/audio/validate.mjs        # validaci?n read-only y fixtures
art/audio/sfx/masters/          # WAV masters locales, ignorados/regenerables
public/assets/audio/sfx/        # OGG/WAV runtime locales, ignorados/regenerables
```

Antes de aceptar un lote: reproducir desde receta/seed, verificar hash/manifiesto, revisar picos/normalización/fades y actualizar la referencia del evento semántico. Los thresholds numéricos de mix/runtime pertenecen a config, no al generador ni al director.

## 2. Música generada con Suno

**Uso previsto:** música de menú, loop de run y capa/tema de boss. No usar prompts de imitación de artistas, bandas ni obras identificables; describir instrumentación, energía, arco y dirección “juguete industrial” propios.

### Regla comercial y evidencia obligatoria

- Generar bajo **Suno Pro o Premier activo en el momento de la generación** para uso comercial. No asumir licencia retroactiva por suscribirse después.
- Por cada pista/versionado de loop conservar: WAV fuente, prompt completo, fecha/hora de generación, URL o ID de Suno, versión de edición/loop y notas de licencia.
- Conservar evidencia del plan activo/recibo correspondiente a la generación y la referencia de source control que incorpora la exportación.
- Los derechos comerciales no garantizan protección de copyright ni exclusividad; revisar los términos vigentes antes de publicar o licenciar.

Fuentes oficiales: [Suno commercial use / subscription](https://help.suno.com/en/articles/9601665) · [Suno ownership / commercial rights](https://help.suno.com/en/articles/2416769) · [Suno Terms of Service](https://suno.com/terms/).

## 3. Gate de entrega de audio

- [ ] SFX: receta, seed, generador, masters, exports y manifiesto reproducibles en source control.
- [ ] SFX: `AudioDirector` solo reproduce exports pre-renderizados para IDs semánticos.
- [ ] Música: evidencia de Pro/Premier activa al generar, WAV, prompt, fecha, Suno URL/ID, edición/loop y notas de licencia archivadas.
- [ ] Música: prompts sin imitación de artistas; términos revisados para el uso previsto.
- [ ] Runtime: `AUDIO.voiceCaps` config-owned y benchmark 400+/60 FPS registrado con drops de voz/fugas de fuentes.


## Implementation status (updated 2026-08-20)

Repository deliverables include generator scripts, embedded versioned recipes and tracked manifests. `art/audio` WAV masters and `public/assets/audio` runtime exports remain locales/ignorados por política. `pnpm audio:generate` (también invocado por `pnpm build`) regenera el pack foundation, la navegación UI y `boss-assembly-open`; **no reconstruye todavía todos los WAV del manifiesto runtime de prototipos desde cero**. El manifiesto conserva recipe/version/seed, generator hash, variant index, WAV hash y metadatos PCM/duración/pico/fade. `pnpm audio:validate` valida outputs existentes sin generarlos; `pnpm audio:foundation-check` genera y prueba el pack foundation. OGG es preferido cuando ffmpeg/libvorbis local funciona; WAV fallback es válido. El pack v1 está aceptado, pero completar la cobertura de generación canónica sigue siendo deuda de pipeline, no de dirección artística.

### UI navigation prototypes

The active `assets/audio/prototypes/manifest.json` is ignored runtime state, so
`tools/audio/prototype-manifest.json` is its tracked source. `node
tools/audio/ui-navigation.mjs` updates only `ui-focus` and `ui-back` WAV
exports plus that manifest; it deliberately does not regenerate unrelated SFX.
The four focus variants and the Back asset retain recipe/seed/hash provenance in
the source manifest and are synchronized by `pnpm audio:generate`.

## Artistic approval status

Audio v1's current generated pack is accepted. Read `SOUND_EVENT_CATALOG.md`
before authoring; `SOUND_DIRECTION.md` is superseded where it conflicts with the
six current style laws. New content still requires its brief, deterministic
recipe/provenance, integración explícita en el pipeline canónico correspondiente y un
veredicto in-game. Hasta que el comando cubra todo el manifiesto activo, no se debe
afirmar reproducibilidad completa del pack desde un checkout limpio. Nunca se deben
editar a mano los masters/exports locales. Los fixtures históricos rechazados no
definen el estado del pack v1 activo.
