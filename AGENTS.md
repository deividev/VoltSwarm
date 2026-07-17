# AGENTS.md - Voltswarm

Bullet-heaven 3D estilo Vampire Survivors, mundo futurista de robots, empieza en un desguace. Diferenciador: presentación voxel "juguete industrial", no una mecánica nueva.

## ⚡ Lo primero que hay que mirar, según lo que te pidan

| Te piden... | Leé ESTO primero | Guardarraíl que no se negocia aquí |
| --- | --- | --- |
| Fix de un bug puntual | `docs/PRD.md` (¿qué debería hacer este sistema?) | Números en `src/config.ts`, nunca hardcodeados |
| Arma / mejora / stat nueva | `docs/METODO_DISENO.md` (proceso) → `docs/DESIGN_MEJORAS.md` (¿ya está diseñada? estado ✅/🟢/🟡/🔴) | Sin apuntado manual · anti-clon de Megabonk |
| Enemigo / mapa / prop nuevo | `docs/DIRECCION_ARTE.md` (silueta, paleta, arco de mapas) | Silueta única por tipo · InstancedMesh por tipo |
| Modelo 3D de personaje/prop (nuevo o existente) | `docs/PROMPTS_IMAGENES.md` secciones 6-7 + `docs/DIRECCION_ARTE.md` | 3 vistas planas siempre: frontal/lateral/trasera -> `src/models/registry.ts`; validar enjambre 400+ |
| Suelo/ambiente de mapa | `docs/PROMPTS_IMAGENES.md` seccion 7b | Textura top-down estricta, sin props/personajes; mosaico `RepeatWrapping`; `litMaterial()` |
| Cualquier imagen a generar (icono, logo, HUD) | `docs/PROMPTS_IMAGENES.md` | Regla voxel SIEMPRE explícita en el prompt |
| Efecto visual / shader / particulas / sonido | `docs/DIRECCION_ARTE.md` + `docs/REFERENCIAS_VISUALES.md` | VFX = cubos voxel de paleta; audio mecanico de juguete, cero gore; validar con 400+ enemigos |
| Sistema/foundation de audio | `docs/DISENO_AUDIO.md` → `docs/AUDIO_AUTHORING_PIPELINE.md` → `docs/ROADMAP_STEAM.md` | Runtime reproduce assets pre-renderizados; SFX procedural solo offline y determinista, música Suno con provenance/licencia; buses, no-op y presupuesto de voces |
| Multiplayer / co-op | `docs/MULTIPLAYER_FEASIBILITY.md` → `docs/ROADMAP_STEAM.md` | Es un gate GO/NO-GO, no una promesa pública; simulación determinista/observadores antes de modo jugable |
| Balance (números que se sienten mal) | `docs/ROADMAP_STEAM.md` (¿existe ya el instrumento de medición?) | Un cambio numérico por playtest — no varios a la vez |
| "¿Qué nos falta?" / auditoría grande | `docs/COMPARATIVA_MEGABONK.md` + skill `judgment-day` | Dos jueces ciegos en paralelo, nunca un solo review |
| "¿Qué toca ahora?" a nivel proyecto | `docs/ROADMAP_STEAM.md` — es LA fuente de verdad del orden | No reordenar de memoria sin actualizar el doc |

Regla general: si el pedido no encaja claro en una fila, `docs/PRD.md` primero (qué existe) y `docs/ROADMAP_STEAM.md` segundo (qué toca ahora).

## Guardarraíles técnicos NO NEGOCIABLES (aplican siempre, sin excepción)

1. **`THREE.InstancedMesh`** — un mesh por TIPO de enemigo, nunca por instancia. Objetivo: 60 FPS con 400+ enemigos. Todo contenido nuevo se valida con el enjambre al máximo antes de darse por bueno.
2. **Todo número de gameplay vive en `src/config.ts`.** Cero magnitudes hardcodeadas en sistemas.
3. **Código, comentarios y copy de UI en inglés.** El español es el idioma de esta conversación, no del repo.
4. **Sin apuntado manual del jugador.** Toda arma se auto-apunta (caso real: Hydraulic Press se rediseñó por violar esto).
5. **Nunca clonar contenido de Megabonk 1:1.** Se extrae la base estructural, se genera contenido propio — proceso completo en `METODO_DISENO.md`.

## Mapa de documentación (referencia completa)

| Documento | Contenido |
| --- | --- |
| `docs/PRD.md` | Especificación viva de todo lo implementado (P1/P2/P3 + v3), criterios de aceptación, qué quedó fuera de alcance. Actualizar al cerrar cualquier feature. |
| `docs/METODO_DISENO.md` | Proceso de 4 pasos para diseñar sin clonar: estudiar la base real → extraer el principio → generar ideas propias ancladas a nuestros sistemas → tematizar en juguete industrial. |
| `docs/DESIGN_MEJORAS.md` | 3 listas de diseño (stats, mejoras, armas) con estado de implementación y bocetos de personajes. |
| `docs/COMPARATIVA_MEGABONK.md` | Gap-analysis estructural contra Megabonk completo (armas, tomos, stats, retención). |
| `docs/DIRECCION_ARTE.md` | Paleta, reglas de silueta/color, arco de mapas (scrapyard → fundición → ciudad neón), pipeline voxel. |
| `docs/PROMPTS_IMAGENES.md` | Prompts concretos de generación de imágenes IA, todos con la regla voxel reforzada. |
| `docs/REFERENCIAS_VISUALES.md` | Plan técnico del pase visual (bloom, sombras, toon, partículas) con referencias externas. |
| `docs/ROADMAP_STEAM.md` | Plan ordenado y con razones hacia el lanzamiento en Steam (fases 0-6 + post-lanzamiento). |
| `docs/DISENO_AUDIO.md` | Foundation `AudioDirector`/buses/presupuesto que se implementa ahora, más catálogo de ~95 SFX/música que se completa después de contenido/balance. |
| `docs/AUDIO_AUTHORING_PIPELINE.md` | Pipeline offline SFX determinista + Suno para música: masters/exports/manifiesto, reproducibilidad, provenance y reglas de licencia comercial. |
| `docs/MULTIPLAYER_FEASIBILITY.md` | Gate interno GO/NO-GO: 1–4 `PlayerId`, primero local exactamente 2P split-screen con cámaras independientes → Remote Play host si procede; online 4P posterior, no es promesa pública. |

**Actualizar, no solo leer**: feature nueva → sección en `PRD.md` · sistema con principio nuevo → `METODO_DISENO.md` · arma/mejora implementada → su estado a ✅ en `DESIGN_MEJORAS.md` · hito cumplido → marcarlo en `ROADMAP_STEAM.md` · nombre/precio/fecha → vive en `ROADMAP_STEAM.md`, no solo en el chat.

## Proceso de revisión (Judgment Day)

Antes de lanzamiento, pase grande de contenido, o si el usuario lo pide ("juicio", "revisa el proyecto"): skill `judgment-day`, dos jueces ciegos en paralelo. Nunca aplicar fixes de Ronda 1 sin confirmación del usuario.

## Nombre, precio, stack

- **Nombre: Voltswarm - CERRADO** (confirmado 2026-07-05, no reabrir salvo instruccion explicita del usuario).
- Precio objetivo: **$4.99** con descuento de lanzamiento 10-15%.
- Stack: Electron + Three.js + TypeScript + Vite sobre el boilerplate original (solo render + empaquetado). Todo el gameplay es código propio en `src/` — no asumir nada que no esté ahí.

---

---

## Estado operativo actual (2026-07-16)

- **Estado externo confirmado por el usuario:** handoff enviado al publisher → página creada por el publisher → **página actualmente en revisión de Steam/Valve**.
- **Límite de lo confirmado:** la página todavía NO está aprobada, publicada ni visible como Coming Soon. No afirmar resultado, fecha de aprobación, App ID ni publicación hasta confirmación externa.
- **Alcance de “v1 cerrada”:** se cerró la v1 del paquete de medios/copy y del handoff de la página; **NO** la versión completa del juego, que sigue el orden de `docs/ROADMAP_STEAM.md`.
- **Rigs temporales de captura CERRADOS (2026-07-17):** `RECORDING.levelUpDraft.enabled=false`, ambos flags de `RECORDING.chestTesting=false` y `GOLD.startingGold=0`. No queda ningún override de captura activo.
- **Material final conservado:** 9 screenshots en `art/steam/screenshots/`, 9 GIFs en `art/steam/gif/`, store/library/social assets y masters aprobados en `art/steam/image/`, copy/brief en `art/steam/info/` y manifiesto en `art/steam/STEAM-MEDIA-MANIFEST.md`. El cofre verde cubre la recompensa; no falta un cofre dorado.
- **Limpieza posterior COMPLETADA con aprobación 1 a 1:** se eliminaron backups, duplicados, temporales regenerables y builds obsoletas. Se retuvieron `assets/preview/` como contexto, `art/concept/`, `tmp/quantize-portal.mjs`, `tmp/perf-400-output/`, los assets finales, las builds v0.1.1 y la última grabación raw `art/video/2026-07-16 17-32-04.mp4`.
- **Fase 3 — COMPLETADA 2026-07-17:** pausa, Settings v3, menú principal con versión leída de `package.json` y desglose final de daño real por arma están cerrados.
- **Siguiente secuencia:** foundation de audio → gate interno de viabilidad multijugador → Fase 5 (contenido, balance, retención y diferenciación de personajes) → catálogo completo de audio → Fase 6 (Steamworks y cierre). Multiplayer/co-op no está implementado ni anunciado; el gate puede terminar NO-GO. **Stretch interno agresivo:** 2026-11-04 para el scope congelado (sin host migration/dedicated/hybrid, exactamente 3 personajes, ~30 contratos y sin expansión no planificada); no es fecha segura ni promesa pública y se revalida tras Audio Foundation + GO/NO-GO. Coming Soon sigue dependiente de la aprobación de Steam. Leaderboards: confirmados para el juego completo, todavía no implementados.

## Historial — spec original del Día 1 (superseded)

Se conserva por contexto, ya NO es la especificación vigente — `PRD.md` y `ROADMAP_STEAM.md` mandan sobre esto. Ejemplos de lo que cambió: "3 tipos de enemigo" → 6 tipos + 2 bosses; "sin meta-progresión" → roadmapeada (Fase 5-6); "3-4 armas" → 11; "itch.io el mismo día" → plan de Steam completo.

Concepto original: Vampire Survivors-like en 3D retro low-poly, presentación como diferenciador. Ambientación original: industrial/scrap con geometría primitiva — superseded por "juguete industrial" + arco futurista. Fases originales (MVP 1 día): escena+jugador+cámara → enemigos+IA+spawner → armas+XP+upgrades → timer+dificultad+rendimiento — ya completadas y superadas. Fuera del MVP original (ya no todo aplica): meta-progresión (roadmapeada), múltiples personajes (bocetados, roadmapeados), obstáculos (implementado), sonido (roadmapeado), modelado 3D custom (roadmapeado vía `PROMPTS_IMAGENES.md`).
