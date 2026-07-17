# Pipeline de autoría de audio

**Decisión:** los SFX procedurales se generan **offline** de forma determinista y el runtime solo reproduce assets pre-renderizados. La música de menú/run/boss se genera con Suno bajo un plan comercial válido. Este documento define qué se conserva para reproducir, licenciar y mapear cada asset; no describe un sistema runtime ni confirma que los assets existan todavía.

## 1. SFX procedural offline

### Alcance y salida

- Un generador offline toma receta versionada + seed determinista y produce variantes de una familia SFX.
- Cada receta declara osciladores y/o ruido, envolventes, filtros, bitcrush, capas y parámetros de variante. El seed, versión del generador y receta bastan para re-renderizar el resultado.
- Salidas: WAV master sin pérdida para edición/archivo y export runtime (OGG) normalizado con fades de entrada/salida para evitar clicks.
- Familias esperadas: impactos, armas, pickups, UI, enemigos/boss y ambiente. Las variantes pertenecen a su familia, no a un random runtime no reproducible.
- **Prohibido en runtime:** síntesis, generación procedural o render de buffers SFX. `AudioDirector` selecciona/reproduce exports ya renderizados por evento semántico.

### Manifiesto y provenance

El manifiesto versionado debe mapear `semanticEventId → family → variantes → runtime export`, y por asset conservar: receta, seed, hash/version del generador, WAV master, export OGG, fecha de render, normalización objetivo, fades y responsable/cambio de source control. El manifiesto permite que `AudioDirector` no conozca nombres físicos ni reglas de generación.

**Layout propuesto al iniciar implementación** (todo fuente y manifiestos bajo source control; exports runtime siguen el pipeline de assets del repo):

```text
art/audio/sfx/recipes/          # recipe JSON/TS versionado
art/audio/sfx/masters/          # WAV master por familia/variante
art/audio/sfx/manifest.json     # semantic event -> export + provenance
public/assets/audio/sfx/        # OGG pre-renderizados que carga runtime
tools/audio/                    # generador offline y exportador reproducible
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
