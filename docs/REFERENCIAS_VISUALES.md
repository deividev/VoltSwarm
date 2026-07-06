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
4. **Suelo con carácter** — ✅ HECHO (2026-07-05) — Textura de canvas procedural determinista (`VISUAL.ground`): placas con jitter de tono, desgaste, manchas de paleta de props y costuras (GridHelper eliminado). Pendiente opcional: decales grandes (señalización pintada).
4b. **Pase de VFX de armas** — 🟡 NUEVO (pedido del usuario 2026-07-05) — Revisar el visual de TODOS los ataques/zonas de armas para alinearlos con voxel+toon+bloom. Caso señalado: el charco del Acid Drum (renombrada de "Acid Flask" 2026-07-05) es un disco verde plano saturado que compite con los enemigos (viola la regla de saturación) — tratamiento translúcido, más oscuro, con lenguaje voxel. Encaja natural junto al punto 5 (partículas).
5. **Partículas de muerte** — ✅ HECHO (2026-07-05, aprobado por el usuario) — `src/particles.ts`: pool InstancedMesh de 512 cubos con física (parábola+giro+shrink), color del bot muerto, 26 cubos en boss kills. Config en `VISUAL.deathBurst`. Chispas de golpe: pendientes, encajan con el pase de VFX de armas (4b).
6. **Micro-animación de enemigos** — ⏸️ EN PAUSA (2026-07-05) — Implementado (`VISUAL.enemyWobble`, bosses exentos) pero DESACTIVADO por decisión del usuario tras playtest: no convenció la sensación. Revisar más adelante (¿amplitud menor? ¿solo al spawnear?) antes de decidir mantener o borrar el código.
7. **Screen shake sutil** — ✅ HECHO (2026-07-05) — Solo con daño REAL recibido (no MISS/BLOCK — la sacudida es información) y en muerte de boss; decaimiento exponencial. `VISUAL.screenShake`.
8. **Cielo degradado + vignette** — ✅ HECHO (2026-07-05) — Fondo con gradiente vertical fundido con la niebla + vignette en el composer (`RenderPass → bloom → vignette → OutputPass`). `VISUAL.sky` / `VISUAL.vignette`.
9. **Modelos voxel IA** — ✅ ELENCO COMPLETO (2026-07-05) — Pipeline 2D→3D congelado y validado: 6 enemigos + 2 bosses in-game + jugador, todos vía `src/models/registry.ts`. Volt Warden (boss nuevo) modelado pero SIN gameplay (no tiene entrada en `ENEMY_TYPES`, no puede spawnear todavía). 121 FPS validados con el elenco completo + bloom activo.

Regla de oro (de Megabonk): cada efecto se valida con el enjambre al máximo (400+) antes de darse por bueno. El look nunca paga con FPS.

## Nota Steam (2-3 semanas)

El boilerplate ya trae empaquetado Electron + integración Steamworks (achievements, overlay). Lo que faltará para la página: cápsulas, GIFs del enjambre con el look nuevo, y demo. Los pasos 1-8 de arriba son exactamente lo que hace que esos GIFs vendan.
