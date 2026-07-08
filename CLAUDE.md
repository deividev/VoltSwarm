# CLAUDE.md — Voltswarm (working title)

Bullet-heaven 3D estilo Vampire Survivors, mundo futurista de robots, empieza en un desguace. Diferenciador: presentación voxel "juguete industrial", no una mecánica nueva.

## ⚡ Lo primero que hay que mirar, según lo que te pidan

| Te piden... | Leé ESTO primero | Guardarraíl que no se negocia aquí |
| --- | --- | --- |
| Fix de un bug puntual | `docs/PRD.md` (¿qué debería hacer este sistema?) | Números en `src/config.ts`, nunca hardcodeados |
| Arma / mejora / stat nueva | `docs/METODO_DISENO.md` (proceso) → `docs/DESIGN_MEJORAS.md` (¿ya está diseñada? estado ✅/🟢/🟡/🔴) | Sin apuntado manual · anti-clon de Megabonk |
| Enemigo / mapa / prop nuevo | `docs/DIRECCION_ARTE.md` (silueta, paleta, arco de mapas) | Silueta única por tipo · InstancedMesh por tipo |
| Modelo 3D de personaje/prop (nuevo o existente) | `docs/PROMPTS_IMAGENES.md` §6-7 (prompt maestro) → `docs/DIRECCION_ARTE.md` (pipeline 2D→3D) | **3 vistas SIEMPRE** (frontal/lateral/trasera, regla 2026-07-06) contiguas y planas → entrada en `src/models/registry.ts` · validar enjambre 400+ |
| Suelo/ambiente de mapa | `docs/PROMPTS_IMAGENES.md` §7b (pipeline distinto: textura cenital, no se voxeliza) | Vista top-down estricta, sin props/personajes en la imagen · mosaico vía `RepeatWrapping` · `litMaterial()` para no desentonar con el resto |
| Cualquier imagen a generar (icono, logo, HUD) | `docs/PROMPTS_IMAGENES.md` | Regla voxel SIEMPRE explícita en el prompt |
| Efecto visual / shader / partículas / sonido | `docs/DIRECCION_ARTE.md` (sección VFX y audio) → `docs/REFERENCIAS_VISUALES.md` | Partículas = cubos voxel de paleta · audio mecánico de juguete, cero gore · validar con 400+ enemigos |
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

**Actualizar, no solo leer**: feature nueva → sección en `PRD.md` · sistema con principio nuevo → `METODO_DISENO.md` · arma/mejora implementada → su estado a ✅ en `DESIGN_MEJORAS.md` · hito cumplido → marcarlo en `ROADMAP_STEAM.md` · nombre/precio/fecha → vive en `ROADMAP_STEAM.md`, no solo en el chat.

## Proceso de revisión (Judgment Day)

Antes de lanzamiento, pase grande de contenido, o si el usuario lo pide ("juicio", "revisa el proyecto"): skill `judgment-day`, dos jueces ciegos en paralelo. Nunca aplicar fixes de Ronda 1 sin confirmación del usuario.

## Estado del proyecto (foto a 2026-07-06)

- **Elenco 3D completo**: 6 enemigos + 3 bosses (Volt Warden nuevo, sin gameplay) + jugador, todos voxelizados desde referencias 2D e in-game vía `src/models/registry.ts`.
- **Fase 1 visual completa**: bloom + vignette (composer con OutputPass), sombras blob, toon 3 escalones, partículas de muerte, screen shake, cielo degradado, cámara 52°, animación de caminata del jugador. Wobble de enemigos desactivado (decisión usuario). Todo en `config.VISUAL`. ~120 FPS validados con enjambre masivo.
- **Icono de app final aprobado** (`public/assets/2d/app-icon-test.png` → `build/icon.ico`). **Logo final aprobado** (`logo-voltswarm-v3.png`). **Las 11 armas tienen icono de HUD aprobado y cableado** (`src/hud.ts`).
- **Mapa 1 redefinido (2026-07-06)**: pasa de "scrapyard" a **fábrica abandonada, industrial con toque futurista** (ver `DIRECCION_ARTE.md`). Suelo final: `ground-factory-floor.png` generado con IA en vista cenital, en mosaico (`config.VISUAL.ground`), reemplazando el intento procedural por código que el usuario rechazó.
- **Regla de proceso nueva (2026-07-06): toda referencia 2D para voxelizar un personaje/prop se genera en 3 VISTAS** (frontal/lateral/trasera), no solo frontal — el boss final de prueba salió "masa lisa" de lado por depender solo de la vista frontal. Detalle en `PROMPTS_IMAGENES.md` §6.
- **Balance**: i-frames 0.85→0.4 validado (la horda ya mata).
- **Siguiente (acción concreta inmediata)**: **voxelizar el contenedor industrial** — referencia de 3 vistas ya APROBADA (`prop-container-front-v3.png`/`-side-v3.png`/`-back-v3.png`, ver `PROMPTS_IMAGENES.md` §7). Falta: entrada en el pipeline de voxelización (decidir si necesita un "kind" nuevo tipo prop en `src/models/registry.ts` o una función standalone) + colocarlo en `world.ts` como obstáculo con collider en posiciones deliberadas (chokepoint sutil). Después: más props (pila de chatarra, grúa) con el mismo proceso de 3 vistas + construcción multi-bloque (regla nueva, ver abajo); después iconos de 19 stats + ornamentos de rareza; después VFX de combate.
- **Regla de proceso reforzada (2026-07-06)**: al generar CUALQUIER prop/objeto nuevo (no personaje), referenciar explícitamente 1-2 iconos de arma ya aprobados (`icon-weapon-press-v2.png`, `icon-weapon-tire.png`) en el prompt y pedir la construcción "many individual visible cubic blocks with flat per-face shading" — decir solo "voxel" no basta, salió como ilustración vectorial plana la primera vez. Detalle completo y ejemplo de iteración en `PROMPTS_IMAGENES.md` §7 (caso del contenedor: 3 intentos hasta llegar a la v3 aprobada).

## Nombre, precio, stack

- **Nombre: Voltswarm — CERRADO** (confirmado 2026-07-05, no reabrir).
- **Orden de trabajo confirmado (2026-07-05): cerrar TODO el arte de la v1 antes de tocar la capa Steam** (App ID, página, cápsulas) — no adelantar esos pasos aunque parezcan rápidos.
- Precio objetivo: **$4.99** con descuento de lanzamiento 10-15%.
- Stack: Electron + Three.js + TypeScript + Vite sobre el boilerplate original (solo render + empaquetado). Todo el gameplay es código propio en `src/` — no asumir nada que no esté ahí.

---

## Historial — spec original del Día 1 (superseded)

Se conserva por contexto, ya NO es la especificación vigente — `PRD.md` y `ROADMAP_STEAM.md` mandan sobre esto. Ejemplos de lo que cambió: "3 tipos de enemigo" → 6 tipos + 2 bosses; "sin meta-progresión" → roadmapeada (Fase 5-6); "3-4 armas" → 11; "itch.io el mismo día" → plan de Steam completo.

Concepto original: Vampire Survivors-like en 3D retro low-poly, presentación como diferenciador. Ambientación original: industrial/scrap con geometría primitiva — superseded por "juguete industrial" + arco futurista. Fases originales (MVP 1 día): escena+jugador+cámara → enemigos+IA+spawner → armas+XP+upgrades → timer+dificultad+rendimiento — ya completadas y superadas. Fuera del MVP original (ya no todo aplica): meta-progresión (roadmapeada), múltiples personajes (bocetados, roadmapeados), obstáculos (implementado), sonido (roadmapeado), modelado 3D custom (roadmapeado vía `PROMPTS_IMAGENES.md`).
