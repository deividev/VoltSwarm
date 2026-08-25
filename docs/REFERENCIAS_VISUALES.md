# Voltswarm — Referencias visuales y plan de mejora

Fecha: 2026-07-03. Objetivo: subir el nivel visual manteniendo el estilo "juguete industrial" (voxel, color plano saturado) y el presupuesto de rendimiento (500+ entidades instanciadas a 60 FPS).

## Referencias (qué copiar de cada una)

| Referencia | Qué es | Qué tomamos |
| --- | --- | --- |
| **Megabonk** | El benchmark directo: low-poly simple, texturas mínimas, "efectos eficientes diseñados para impacto, no complejidad" | La lección de presupuesto: el salto visual viene del POST-PROCESADO y el juice, no de modelos más detallados |
| **Crossy Road** | El padre del voxel flat-shaded: colores vibrantes SIN sombras complejas, cada entidad con wobble/bob al moverse | Paleta saturada sobre suelo bicolor de tiles; animación de bob barata que da vida a todo |
| **The Touryst** | El techo de calidad del voxel: la geometría es simple, la belleza viene de iluminación, AO y profundidad de campo | La prueba de que voxel ≠ barato visualmente; su look = luz + post, no polígonos |
| **Astroneer** | Low-poly + paleta pastel/saturada con gradientes de cielo | Skybox degradado + niebla en armonía con el fondo |
| **Fugl** | Campos de color voxel procedurales relajantes | Variación de color del terreno por zonas (manchas/parches, no un plano uniforme) |

## Plan de mejora (orden por impacto/coste en NUESTRO código)

1. **Bloom selectivo** — ✅ HECHO (2026-07-05) — UnrealBloomPass por umbral (`config.VISUAL.bloom`: strength 0.55, radius 0.35, threshold 0.85): brillan los emisivos puros (beams, anillos elite/boss, orbes, proyectiles, placas de escudo, indicador de tótem); los cuerpos con luz quedan bajo el umbral. **Validado en playtest con enjambre masivo mixto: 121 FPS estables** (contador in-game en `VISUAL.showFps`). Pendiente opcional: visores de bots como emisivos reales (hoy son vertex-color, no brillan).
2. **Sombras blob instanciadas** — ✅ HECHO (2026-07-05) — Un InstancedMesh de discos oscuros para todo el enjambre + disco propio del jugador (sigue posición, no el bob). Config en `VISUAL.blobShadow`. 120 FPS verificado.
3. **Toon shading (MeshToonMaterial, gradiente de 3 pasos)** — ✅ HECHO (2026-07-05) — `src/toon.ts`: fábrica `litMaterial()` (3 escalones, suelo de sombra 45%) sustituye a Lambert en bots, jugador, props, cofres, tótem y armas con malla. `VISUAL.toon`.
4. **Suelo con carácter** — ✅ HECHO, versión final 2026-07-06 — El intento procedural por canvas (2026-07-05) se descartó (el usuario: "no me gusta nada"). Reemplazado por `ground-factory-floor.png`, textura 2D generada con IA en vista cenital estricta (mismo pipeline de estilo que personajes/iconos, ver `PROMPTS_IMAGENES.md` §7b), en mosaico (`RepeatWrapping`, `VISUAL.ground.worldSizePerRepeat: 18`) con material `litMaterial()` unificado (antes usaba `MeshLambertMaterial` crudo, inconsistente con el toon del resto). Carga async con fallback al procedural viejo si la imagen falla.
4b. **Pase de VFX de armas** — 🟡 NUEVO (pedido del usuario 2026-07-05) — Revisar el visual de TODOS los ataques/zonas de armas para alinearlos con voxel+toon+bloom. Caso señalado: el charco del Acid Drum (renombrada de "Acid Flask" 2026-07-05) es un disco verde plano saturado que compite con los enemigos (viola la regla de saturación) — tratamiento translúcido, más oscuro, con lenguaje voxel. Encaja natural junto al punto 5 (partículas).
5. **Partículas de muerte** — ✅ HECHO (2026-07-05, aprobado por el usuario) — `src/particles.ts`: pool InstancedMesh de 512 cubos con física (parábola+giro+shrink), color del bot muerto, 26 cubos en boss kills. Config en `VISUAL.deathBurst`. Chispas de golpe: pendientes, encajan con el pase de VFX de armas (4b).
6. **Micro-animación de enemigos** — ⏸️ EN PAUSA (2026-07-05) — Implementado (`VISUAL.enemyWobble`, bosses exentos) pero DESACTIVADO por decisión del usuario tras playtest: no convenció la sensación. Revisar más adelante (¿amplitud menor? ¿solo al spawnear?) antes de decidir mantener o borrar el código.
7. **Screen shake sutil** — ✅ HECHO (2026-07-05) — Solo con daño REAL recibido (no MISS/BLOCK — la sacudida es información) y en muerte de boss; decaimiento exponencial. `VISUAL.screenShake`.
8. **Cielo degradado + vignette** — ✅ HECHO (2026-07-05) — Fondo con gradiente vertical fundido con la niebla + vignette en el composer (`RenderPass → bloom → vignette → OutputPass`). `VISUAL.sky` / `VISUAL.vignette`.
9. **Modelos voxel IA** — ✅ Pipeline 2D→3D congelado y validado: 6 enemigos + bosses in-game + jugador, todos vía `src/models/registry.ts`. Hazard Marshal es el boss final vigente del juego completo, integrado de forma provisional; Volt Warden queda como diseño histórico/futuro. 121 FPS validados con el elenco completo + bloom activo.

Regla de oro (de Megabonk): cada efecto se valida con el enjambre al máximo (400+) antes de darse por bueno. El look nunca paga con FPS.

## Nota Steam

> **Histórico:** la estimación inicial de 2–3 semanas y la descripción del boilerplate ya no representan el estado actual.

La implementación cerrada en `0.30.5` incluye los 20 achievements de lanzamiento y su **Steam achievement transport** con `steamworks.js` `0.4.0`; SDK/overlay initialization, packaging, IPC, allowlist y outbox son soporte auxiliar del desbloqueo, no features independientes. El mantenedor confirma 20/20 entradas creadas en Steamworks App Admin para App ID `4979220`. Los masters conseguidos/bloqueados y sus exports de revisión existen en `art/concept/achievements/`. Aun así, la creación externa no prueba publicación, iconos subidos ni el desbloqueo end-to-end en producción. Todas las demás APIs Steamworks quedan fuera del lanzamiento y solo se reconsideran post-lanzamiento con suficiente visibilidad/tracción, sin compromiso.
