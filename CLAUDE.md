# CLAUDE.md - Voltswarm

Bullet-heaven 3D estilo Vampire Survivors, mundo futurista de robots, empieza en un desguace. Diferenciador: presentación voxel "juguete industrial", no una mecánica nueva.

## Alcance de variantes (fuente de verdad)

- **Juego completo (`codex/map-2`):** Scrapyard / Mapa 1 → Swarm Foundry / Mapa 2 → **Hazard Marshal**. El boss conserva `modelKey: 'final-boss'`; su baseline jugable quedó cerrada en `0.22.0`. Balance humano y una arena reactiva/modular son mejoras diferidas. Volt Warden es histórico/futuro.
- **Steam Demo (`codex/demo-map1`, separada; snapshot `0.13.39-demo`):** solo Scrapyard / Mapa 1. Boss derrotado → `SECTOR CLEARED`; timeout sin boss → `SECTOR HELD`. Nunca transiciona a Mapa 2.
- Fin de agosto de 2026 es objetivo interno de RC de la Demo, no promesa pública ni confirmación de revisión/disponibilidad.

## Estado vigente del juego completo — source/HEAD 0.30.9 (2026-08-26)

- **Achievements:** catálogo de lanzamiento 20/20 implementado en `ACHIEVEMENT_REGISTRY`, con evaluación retroactiva/end-of-run y **Steam achievement transport** mediante `steamworks.js` `0.4.0`, IPC aislado, allowlist y outbox persistente/idempotente. SDK init, App ID, `electronEnableSteamOverlay`, packaging nativo e IPC son soporte auxiliar del desbloqueo, no features Steamworks independientes.
- **Steamworks App Admin:** el mantenedor confirma que las 20 entradas correspondientes están creadas para App ID `4979220`. Esto NO demuestra que los últimos cambios estén publicados, que ambos iconos estén subidos o que el desbloqueo haya pasado smoke end-to-end en una build de producción.
- **Audio:** final levels, mix, and crossfade baseline accepted by the maintainer after human playtesting. The canonical pack reconstructs 50 events / 97 variants from 96 versioned masters. The acceptance does not invent diagnostic counters or quantitative route data that were not supplied.
- **Remaining Steam launch work:** validate and package the exact committed `0.30.9` bytes, upload privately through SteamPipe, run the production achievement-unlock smoke, and externally confirm publication/icons. The `0.30.8` package remains the previous baseline; no `0.30.9` package is claimed yet. `shortMaps=false`, `audioDiagnostics=false`, `mapTransitionKey=false`, and `finaleKey=false`.
- **Otras APIs Steamworks:** Leaderboards, User Stats, Cloud, Workshop, Rich Presence, Friends/lobbies/networking, Steam Input, Inventory/DLC/microtransactions y cualquier otra integración no están implementadas y quedan fuera del lanzamiento. Solo se reconsideran post-lanzamiento con suficiente visibilidad/tracción; no hay compromiso ni promesa.

## ⚡ Lo primero que hay que mirar, según lo que te pidan

| Te piden... | Leé ESTO primero | Guardarraíl que no se negocia aquí |
| --- | --- | --- |
| Fix de un bug puntual | `docs/PRD.md` (¿qué debería hacer este sistema?) | Números en `src/config.ts`, nunca hardcodeados |
| Contrato / desbloqueo / progresión entre runs | `docs/PRD.md` §"Perfil persistente y Contratos" → `src/contracts.ts` | Añadir contenido = `push` a una cola, NUNCA escribir un contrato · lo otorgado se guarda como IDS, jamás como índice · lo otorgado nunca se revoca · umbrales solo en `config.ts CONTRACTS` |
| Datos de runs / calibrar números | `pnpm stats` (percentiles, nunca promedios) | Solo cuenta una run TERMINADA · jugar desde Electron, no navegador · datos de bot ≠ datos humanos |
| Arma / mejora / stat nueva | `docs/METODO_DISENO.md` (proceso) → `docs/DESIGN_MEJORAS.md` (¿ya está diseñada? estado ✅/🟢/🟡/🔴) | Sin apuntado manual · anti-clon de Megabonk |
| Personaje jugable nuevo, dash, o "se siente quieto" | `docs/DISENO_FRENESI.md` §4 (decisiones cerradas) → `docs/DESIGN_MEJORAS.md` §Personajes | Identidad = REGLA que dobla un sistema existente, NUNCA movilidad ni stats sueltos · ningún personaje sobrevive por moverse bien · dash universal e idéntico y va DESPUÉS de que la densidad importe · personaje = contrato FIRMA, jamás peldaño de escalera |
| Enemigo / mapa / prop nuevo | `docs/DIRECCION_ARTE.md` (silueta, paleta, arco de mapas) | Silueta única por tipo · InstancedMesh por tipo |
| Modelo 3D de personaje/prop (nuevo o existente) | `docs/PROMPTS_IMAGENES.md` §6-7 (prompt maestro) → `docs/DIRECCION_ARTE.md` (pipeline 2D→3D) | **3 vistas SIEMPRE** (frontal/lateral/trasera, regla 2026-07-06) contiguas y planas → entrada en `src/models/registry.ts` · validar enjambre 400+ |
| Suelo/ambiente de mapa | `docs/PROMPTS_IMAGENES.md` §7b (pipeline distinto: textura cenital, no se voxeliza) | Vista top-down estricta, sin props/personajes en la imagen · mosaico vía `RepeatWrapping` · `litMaterial()` para no desentonar con el resto |
| Cualquier imagen a generar (icono, logo, HUD) | `docs/PROMPTS_IMAGENES.md` | Regla voxel SIEMPRE explícita en el prompt |
| Animar un modelo (boss, personaje, enemigo) | `docs/ANIMACION_RIG.md` | Rig SOLO si hay 1 instancia en pantalla — el enjambre va por matriz de instancia · una banda por miembro NO basta (botas y manos se quedan congeladas) · leer SIEMPRE el reporte de reparto: las piezas deben sumar el total exacto y el torso no debe llegar al suelo |
| Feedback de recibir daño | `docs/ANIMACION_RIG.md` §8 | Evento FRECUENTE = color, nunca animación · el tinte es multiplicativo · el rojo ya significa "boss" |
| Efecto visual / shader / partículas / sonido | `docs/DIRECCION_ARTE.md` (sección VFX) → `docs/REFERENCIAS_VISUALES.md` | Partículas = cubos voxel de paleta · cero gore · validar con 400+ enemigos |
| Cualquier sonido/SFX/música | `docs/SOUND_EVENT_CATALOG.md` (leyes de estilo + estado por evento) → `docs/MUSIC_PROMPTS.md` (provenance Suno) → `docs/AUDIO_AUTHORING_PIPELINE.md` | 6 leyes 2026-07-18: NADA retro · latencia cero · frecuente=invisible · asimetría disparo/muerte · pirámide de volumen · muerte=VFX de cubos · veredicto SIEMPRE in-game |
| Trailer, vídeo o captura de marketing | `docs/TRAILER_V1_PLAN.md` (beat sheet, ventana de música medida, checklist de captura) → `docs/MARKETING_PLAN_LAUNCH_2026.md` (calendario de beats) | Se captura DEL build congelado, nunca antes · solo contenido de la variante que se publica · la intro de una cue se arregla recortando, el final NO · nada de Next Fest, fechas ni disponibilidad sin confirmación externa |
| Multiplayer / co-op | `docs/MULTIPLAYER_FEASIBILITY.md` → `docs/ROADMAP_STEAM.md` | Es un gate GO/NO-GO, no una promesa pública; simulación determinista/observadores antes de modo jugable |
| Bug visual / orden de dibujado | §"Reglas de render que ya mordieron" en este archivo | Transparente se dibuja SIEMPRE tras opaco · `renderOrder` no se hereda de un Group · medir el material en runtime, no juzgar por captura |
| Pelea del BOSS FINAL (Hazard Marshal) | `docs/PRD.md` §"Hazard Marshal — llegada telegrafiada y moveset de 3 fases" → `src/final-boss.ts` | Fases por VIDA, nunca por reloj · una sola telegrafía por frame · el encuadre se mide proyectando la CAJA del cuerpo, no el punto del suelo · todo spawn nuevo usa `enemies.waveHpMultiplier` · verificar con `pnpm test:finale-runtime`, no con una captura |
| Pelea de boss / moveset de boss (Mapa 1) | `docs/PRD.md` §"Crusher King — banquillo y el principio del boss anclado" — empezar AHÍ, no por la sección de accesibilidad anterior | El enjambre persigue al JUGADOR: un boss quieto nunca se llena de chatarra y el hueco aparece solo · el King está FUERA de la rotación (`BOSS_TYPE_INDEXES`), solo Tesla, en las dos ramas · mover cuerpos con física se rechazó 2 veces y la zona que erupciona una 3ª, SIEMPRE por cómo se ve · hay trabajo construido en un `git stash`: mirarlo antes de reimplementar nada · nunca preguntar por `BOSS_TYPE_INDEXES[0]`, usar las constantes de identidad |
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
6. **Subir `version` en `package.json` ANTES de cada commit** y escribirla en el asunto. Esta regla es INVARIANTE para cualquier agente o herramienta: los metadatos usan SemVer válido (`0.10.2-beta`) y ese valor crudo se estampa como `buildVersion`; la UI/copy humana usa número primero y etiqueta después (`0.10.2 Beta`). `Alpha`, `Beta`, `Preview` y `Playtest` SIEMPRE van después del número, nunca `Beta 0.10.2`.
7. **Ningún instrumento de desarrollo llega a producción.** Van gateados por `DEV_TOOLS` en `config.ts`, y `pnpm package` aborta si alguno queda encendido. Un jugador que paga no puede tener un botón de "desbloquear todo" en el menú.
8. **`PROFILE` se muta EN SU SITIO, nunca se reemplaza.** Todo el gating tiene una referencia viva a ese objeto; reemplazarlo los desconecta a todos en silencio.
9. **El gestor de paquetes es `pnpm`, SIEMPRE — nunca `npm install` ni `yarn`.** Fijado en `packageManager`, con `pnpm-lock.yaml` versionado, `package-lock.json`/`yarn.lock` en `.gitignore` y un `preinstall` (`tools/check-package-manager.mjs`) que aborta el install si lo lanza otro gestor. Mezclarlos ya mordió (2026-08-09): un `node_modules` de pnpm junto a un `package-lock.json` versionado dejó el árbol **sin `node_modules/.bin`**, y el build murió en `tsc` con un "no se reconoce como comando" que no apunta a nada. Dos consecuencias que hay que respetar: (a) pnpm 10 **no ejecuta scripts de postinstall** salvo los listados en `pnpm.onlyBuiltDependencies` — ahí vive `electron`, que es quien DESCARGA el binario, así que sacarlo de esa lista deja el juego sin arrancar; (b) pnpm no filtra dependencias transitivas, así que **toda importación debe estar declarada** (caso real: `tools/check-asar-payload.mjs` importaba `@electron/asar` sin declararla y el empaquetado reventaba con un engañoso "Cannot require() ES Module in a cycle").

## Cómo se verifica algo aquí (reglas de método, aprendidas a golpes 2026-07-25/26)

1. **MEDIR, no mirar una captura.** Dos veces se dio por bueno un arreglo visual leyendo un pantallazo: una vez "los iconos desaparecieron" (estaban ahí, oscuros a 40px) y otra "el aura del élite ya queda tapada" (eran los huecos entre sus 4 arcos). Se consulta el DOM o el material en runtime, y la captura confirma DESPUÉS; nunca al revés.
2. **Nunca editar código fuente con reemplazos de texto por script.** No hacen nada y no avisan cuando el patrón no coincide. Un lote de cinco "funcionó" porque acertó uno, y ese fallo silencioso costó tres rondas de depuración del mismo bug. Usar herramientas de edición que fallen ruidosamente ante un desajuste.
3. **Lo que se juzgue desde un arranque empaquetado o `file://` hay que reconstruirlo antes.** Trabajar contra el dev server deja `dist/` y `release/win-unpacked/` viejos, y una build vieja muestra comportamiento viejo sin decirlo. `pnpm electron:start` compila y lanza en un paso.
4. **Un cambio numérico por playtest.** Y si el instrumento de medida es el bot de `test:smoke`, recordar qué distorsiona: gira en círculo cerrado, lo que **infla** las armas de AoE centrado (amontona enemigos) y **hunde** las de contacto en órbita (huye de ellas). Sirve para detectar un extremo, no para elegir entre dos valores cercanos.

## Reglas de render que ya mordieron

- **Three.js dibuja TODA la cola transparente después de todos los opacos.** Por eso `renderOrder` no basta para que un marcador de suelo pase por delante de la escenografía y por detrás del personaje: hay que sacarlo de la cola transparente (`transparent: false`, el blending aditivo funciona igual) y hornear la opacidad en el color, porque `material.opacity` se ignora fuera de esa cola. Capas: escenografía 0 → marcadores 1 → personajes 2 (`VISUAL.renderOrders`).
- **Un núcleo encerrado dentro de un sólido NO EXISTE.** El "núcleo blanco" de
  la salva del boss era un cubo de 0,3 en el centro de uno opaco de 0,75: cero
  píxeles desde cualquier ángulo. Para que un rasgo interior se lea tiene que
  ser la SUPERFICIE (pintar las mitades por separado), no una pieza escondida.
- **Marca de suelo grande = con `depthTest`.** El truco de apagarlo
  (`groundMarkersOnTop`) sirve para anillos pequeños; una cuña de 20 unidades
  pintada sobre una chimenea de 12 se lee como lámina flotante. Las telegrafías
  del boss final van por `VISUAL.bossTelegraphsUnderScenery`, aparte.
- **Antes de elegir un color, censo de tonos.** La salva estaba a 5° de las
  zonas rojas y el violeta "libre" es el del Roller: se mide, no se estima.
- **Un núcleo encerrado dentro de un sólido NO EXISTE.** El "núcleo blanco" de
  la salva del boss era un cubo de 0,3 en el centro de uno opaco de 0,75: cero
  píxeles desde cualquier ángulo. Para que un rasgo interior se lea tiene que
  ser la SUPERFICIE (pintar las mitades por separado), no una pieza escondida.
- **Marca de suelo grande = con `depthTest`.** El truco de apagarlo
  (`groundMarkersOnTop`) sirve para anillos pequeños; una cuña de 20 unidades
  pintada sobre una chimenea de 12 se lee como lámina flotante. Las telegrafías
  del boss final van por `VISUAL.bossTelegraphsUnderScenery`, aparte.
- **Antes de elegir un color, censo de tonos.** La salva estaba a 5° de las
  zonas rojas y el violeta "libre" es el del Roller: se mide, no se estima.
- **`renderOrder` NO se hereda de un `Group`.** Three.js ordena por malla; ponerlo en el grupo no hace nada. Usar el helper `setRenderOrder()` de `player.ts`.

## Mapa de documentación (referencia completa)

| Documento | Contenido |
| --- | --- |
| `docs/PRD.md` | Especificación viva de todo lo implementado (P1/P2/P3 + v3), criterios de aceptación, qué quedó fuera de alcance. Actualizar al cerrar cualquier feature. |
| `docs/METODO_DISENO.md` | Proceso de 4 pasos para diseñar sin clonar: estudiar la base real → extraer el principio → generar ideas propias ancladas a nuestros sistemas → tematizar en juguete industrial. |
| `docs/DESIGN_MEJORAS.md` | 3 listas de diseño (stats, mejoras, armas) con estado de implementación y bocetos de personajes. |
| `docs/COMPARATIVA_MEGABONK.md` | Gap-analysis estructural contra Megabonk completo (armas, tomos, stats, retención). |
| `docs/DIRECCION_ARTE.md` | Paleta, reglas de silueta/color, arco de mapas (fábrica abandonada → megafábrica futurista activa; la ciudad neón/estación orbital es un mapa POST-v1, no el Mapa 2 — ver `DIRECCION_ARTE.md` líneas 27-28), pipeline voxel. |
| `docs/PROMPTS_IMAGENES.md` | Prompts concretos de generación de imágenes IA, todos con la regla voxel reforzada. |
| `docs/REFERENCIAS_VISUALES.md` | Plan técnico del pase visual (bloom, sombras, toon, partículas) con referencias externas. |
| `docs/ROADMAP_STEAM.md` | Plan ordenado y con razones hacia el lanzamiento en Steam (fases 0-6 + post-lanzamiento). |
| `docs/ACHIEVEMENTS.md` | Catálogo canónico de 20 logros, metadatos App Admin y arquitectura de desbloqueo con `steamworks.js`. |
| `docs/DISENO_FRENESI.md` | Estudio MEDIDO de por qué el juego se siente y se ve quieto (curva de densidad, jugador inalcanzable, meseta final) + ideas por ejes. §4 = decisiones cerradas de dash y personajes, con el hallazgo clave: el i-frame global capa el DPS del enjambre a 20, así que más densidad se VE más loca sin ser más peligrosa. |
| `docs/ANIMACION_RIG.md` | Sistema de animación por rig de piezas voxel (genérico, no solo del boss): cuándo se puede usar y cuándo NO, cómo partir un modelo en bandas, convenio de signos, qué hace que una marcha no parezca sintética, herramientas de captura, y la decisión de resolver el golpe con tinte en vez de animación. |
| `docs/DISENO_AUDIO.md` | Foundation `AudioDirector`/buses/presupuesto que se implementa ahora, más catálogo de ~95 SFX/música que se completa después de contenido/balance. |
| `src/contracts.ts` | Sistema de contratos: tipos de objetivo, contratos firma, escaleras y colas de premios. Los umbrales viven en `config.ts CONTRACTS`, no aquí. |
| `src/profile.ts` | `PROFILE` (desbloqueos/sockets) + `LIFETIME` (ledger de carrera) y su persistencia. Toda progresión entre runs pasa por acá. |
| `docs/AUDIO_AUTHORING_PIPELINE.md` | Deterministic offline SFX + Suno music pipeline: masters/exports/manifest, reproducibility, runtime provenance, and the explicit private-evidence boundary for the Steam release. |
| `docs/AUDIO_MIX_ACCEPTANCE_0.30.7.md` | Honest maintainer acceptance evidence for the final `0.30.7` levels, mix, and crossfade baseline, with explicit boundaries around data not supplied. |
| `docs/MULTIPLAYER_FEASIBILITY.md` | Gate interno GO/NO-GO: 1–4 `PlayerId`, primero local exactamente 2P split-screen con cámaras independientes → Remote Play host si procede; online 4P posterior, no es promesa pública. |
| `docs/SOUND_EVENT_CATALOG.md` | REESCRITO 2026-07-18: las 6 leyes de estilo de audio + catálogo completo con estado real (12 integrados / 10 hooks mudos / resto Fase 5). Fuente de verdad del audio. |
| `docs/SOUND_DIRECTION.md` | ⚠️ SUPERSEDED: dirección "juguete industrial" vieja, pendiente de reescritura; ante conflicto manda `SOUND_EVENT_CATALOG.md`. |
| `docs/MUSIC_PROMPTS.md` | Provenance Suno: prompt ancla "Neon Horizon", criterios de selección, direcciones rechazadas. Toda música rastrea a una entrada aquí. |
| `docs/TRAILER_V1_PLAN.md` | PLANIFICADO 2026-08-06 (nada capturado ni montado): trailer de 65s del lanzamiento de la Steam Demo — beat sheet, checklist de captura, cue de música, CTA gateado. Regla de orden: se captura DEL build congelado, nunca antes. Registra 4 decisiones abiertas (boss inalcanzable, choque con el beat S5 de octubre, Next Fest sin confirmar). |

**Actualizar, no solo leer**: feature nueva → sección en `PRD.md` · sistema con principio nuevo → `METODO_DISENO.md` · arma/mejora implementada → su estado a ✅ en `DESIGN_MEJORAS.md` · hito cumplido → marcarlo en `ROADMAP_STEAM.md` · nombre/precio/fecha → vive en `ROADMAP_STEAM.md`, no solo en el chat.

## Proceso de revisión (Judgment Day)

Antes de lanzamiento, pase grande de contenido, o si el usuario lo pide ("juicio", "revisa el proyecto"): skill `judgment-day`, dos jueces ciegos en paralelo. Nunca aplicar fixes de Ronda 1 sin confirmación del usuario.

## Estado del proyecto (foto a 2026-07-13)

- **Sistema de contenido completo implementado (2026-07-17, diseño canonico en `DESIGN_MEJORAS.md`)**: taxonomia de 2 categorias - **Cores** (cartas de stat permanentes, draft de level-up y sockets) y **Mods** (pool unico de 17: 4 consumibles + 13 permanentes; dos puertas: ruleta de cofre por tier + tienda del chatarrero con oro in-run). **Barrier Cell** es un Mod azul: nunca ocupa socket ni entra en level-up/Chaos; copias 1-6 dan cargas hasta 6, copias 7-10 reducen recarga de 8s a 4s y el cap se filtra del cofre/tienda. Reutiliza `icon-stat-shield-v2.png`; Coolant Burst sigue activandose cuando se rompe una carga. **5 tiers** (gris a dorado) con magnitudes por tier.
- **Gating de perfil activo (`config.PROFILE` — renombrado desde `ACCOUNT` el 2026-07-25; es la costura que consumen los Contratos, ya implementados)**: 1 socket de arma (+1 por contrato, máx 2), 2 de cores (+2, máx 4), sin swap; desbloqueados de inicio: 5 armas / 10 cores / 12 mods — el resto NUNCA aparece en pools hasta que un contrato lo abra. El HUD muestra TODOS los sockets (lleno / ◇ vacío / 🔒 contrato). Sin moneda meta en v1 (decisión cerrada; contratos = único motor, Fase 5).
- **Economía in-run**: moneda visual (ficha hexagonal dorada girando, merge tipo orbes XP, nombre pendiente — icono primero), drops 25%/elite 10/boss 50, precios escalan con el minuto de run. **Chatarrero** (The Scrapper): visitas 2:00/5:00/8:00, indicador con countdown 60s, tienda con E, stock 3 por tier/Luck. **Cofres de pago**: tier fijado al aparecer (beam coloreado = señal), se abren con E cobrando `tierPrice × 0.5`. **Ruleta con pausa de lectura (2026-07-10)**: la hoja de stats + listas del build se muestran durante TODA la apertura (desde que gira la ruleta — `#stat-sheet` vive ya FUERA de los overlays, gate `body:has(#chest-overlay:not(.hidden))` además del de level-up); al aterrizar el mod se aplica al instante y la run queda congelada hasta pulsar Continue. **La ruleta ES una `upgrade-card` real** (mismo DOM/CSS que tienda y level-up: tier border+glow+rarity tag+muescas — el tier se viste desde el primer frame), card 330px con ventana de 220px e icono a 180px SIEMPRE dentro del marco. **Animación v3 (2026-07-10, regla del usuario: parecido a Megabonk en estructura pero con IDENTIDAD propia, nunca copia)**: tira vertical de tragaperras REAL (`#chest-reel`, 19 celdas bajando por la ventana en una transición CSS decelerante de 2.6s, aterrizaje por `transitionend` + timeout de respaldo; los iconos del giro van en SOMBRA — `grayscale(1) brightness(0.5)` + halo del tier, NUNCA silueta plana `contrast(0)` que convierte los mods con salpicaduras en manchas — y el premio revienta a color en el reveal) → flash blanco 2 frames → god-rays del tier girando → el icono SUBE con overshoot `steps(8)` → lluvia continua de chispas voxel, sobre viñeta radial. El rattle lateral de v2 se ELIMINÓ (el usuario lo odiaba) — el reel vertical es nuestro beat de identidad frente al revelado directo de Megabonk. **Estado tras cerrar la captura comercial (2026-07-16): `GOLD.startingGold = 0`, `RECORDING.chestTesting.forceGreenChests = false` y `RECORDING.chestTesting.forceOrbSiphonReward = false`; todos los rigs temporales de captura están desactivados (`RECORDING.levelUpDraft.enabled = false`).** **Pase de generosidad económica 2026-07-10 (pendiente de playtest, juzgar como UN cambio)**: XP orbe ×1.3 (`XP_ORBS.valueMult`) + drop de oro 20%→25% + cofres 0.6→0.5 — precios de tienda intactos a propósito.
- **Elenco 3D**: 6 enemigos + 3 bosses + jugador + **chatarrero** + props (contenedores/bidones) + **portal de boss** (reemplazó al tótem, escala landmark) + **cofre ×5 tiers** (bronce "familia económica" + costura por tier). Voxelizador v3: `verticalRoundness` (cúpula), `sideProfileRef` (perfil medido de hoja lateral plana), `backPaintRef` (espalda pintada) — bosses actualizados con hojas medidas. Reglas nuevas en `PROMPTS_IMAGENES.md` §6: render bonito ≠ hoja de conversión (el voxelizador SOLO come hojas planas), pedir a Codex "generate an IMAGE (do NOT draw programmatically)". **✅ PASE DE FIDELIDAD DEL ENJAMBRE 2026-07-13 (cierra "alinear enemigos con la cápsula" — desde el MODELADO, no materiales)**: los 6 enemigos + jugador migrados a hojas medidas (Codex genera side/back desde la frontal aprobada como input + candado anti-invención — cero detalles inventados en 14 hojas); Sparkrunner rediseñado a **v5 CON BRAZOS** (aprobado; lecciones: hueco brazo-torso ≥ ancho del brazo o se fusiona, unión hombro-brazo GRUESA o "flota", los brazos ensanchan el bbox → targetWidth 17→21); laterales "action figure" para los planos (Rustbrute/Sparkrunner); excepción Drone (solo `backPaintRef` — el perfil medido del rotor tapaba el techo en negro); Roller conserva su ojo trasero espejado (backPaint gana a mirrorBack). **Greedy meshing en Y** en `voxel-builder.ts`: -27% a -66% de triángulos, visual pixel-idéntico, gratis para todo el elenco. **Anillo de élite UNIFICADO** (`ELITES.aura`): segmentado magenta ROTANTE bajo todo élite — lenguaje: élite = segmentado magenta girando · boss = doble rojo sólido; el anillo viejo no se registraba jugando. Herramienta nueva `tools/capture-elites.mjs` (fuerza élites vía dev hook). **Rim light probado y RECHAZADO por el usuario — revertido por completo, no reintentar sin pedido explícito.** ✅ Fix Junk Ricochet VALIDADO por el usuario 2026-07-13.
- **UI v2 COMPLETA (2026-07-10, 11 mejoras cerradas)**: fuente pixel **Press Start 2P** bundleada en TODOS los textos/números (subset latin real — ojo: el subset latin-ext "carga" pero cae a Segoe en ASCII) · barras SEGMENTADAS por celdas (vida/XP/boss) con valores `actual/máximo`, tapas de peligro en la del boss y retrato del boss (su hoja de ref a 36px) · esquinas con muesca pixel (clip-path) y placas biseladas en cartas/filas/botones · **cáscara de orbe integrada en runtime** (`src/core-orbs.ts`: UNA cáscara teñida por tier, icono centrado en la ventana óptica 46%, cartas 116px) — absorbió los ornamentos de rareza · banner de eventos arcade (AWAKENS/DESTROYED/SCRAPPER) · flash de daño + pulso rojo <25% HP · oro con tick+bump · prompt de interacción FLOTANDO sobre cofre/chatarrero (worldToScreen) · chip LV centrado bajo la XP · flash dorado de fila mejorada + pop cian al llenar socket · 💀 en kills. Paneles build/stats en 2 columnas espejadas. Scanlines/CRT: POSPUESTO post-fases (demo en `assets/preview/scanline-demo.png`).
- **Fase 1 visual + PASE DE VFX DE COMBATE COMPLETO (2026-07-11, pendiente de revisión a fondo del usuario en playtest)**: base en `config.VISUAL` (bloom, sombras blob, toon 3 pasos, cámara 52°, suelo fábrica en mosaico, screen shake, death burst, cielo degradado + vignette). **VFX de combate cerrado**: chispas de golpe universales (`VISUAL.hitSparks`, acento del icono vía `WEAPON_ACCENT` en weapons.ts — fuente única icono↔proyectil↔chispa) · VFX propio de las 11 armas (Bolt=perno voxel, Pulse=anillo de cubos, Blades=sierra, Welder=arco segmentado, Press=losa que cae, Tire=neumático negro+llama, Oil/Acid=manchas voxel+burbujeo+tinte de estado parpadeante, Turbine=tornado, Ricochet=chatarra+zigzag, Dismantler=zarpazo triple) · **VFX de los 12 mods permanentes** (`VISUAL.modVfx`: cada mod habla VoxelBurst en el color MEDIDO de su icono; retune anti-colisión de la "sopa cian" → paleta pairwise-distinta + el PATRÓN como eje de distinción: burst puntual / anillo / estela-línea / aura sostenida / tinte) · portal de boss telegrafiado (beam estroboscópico + anillos de aviso + erupción) + proyectiles enemigos diferenciados (Gunner esquirla naranja, Tesla Titan estrella roja). **Regla de DOS MITADES (usuario): siempre se ve el ORIGEN y el DESTINO del efecto.** Detalle completo en `ROADMAP_STEAM.md` punto 1 del gate; capturas en `assets/preview/vfx-*.png` y `modvfx-*.png`. ~120 FPS. Icono de app y logo v3 aprobados; 11 iconos de arma + 20 de stat cableados. `art/steam/` guarda el arte final de marketing; `art/concept/` renders; `art/archive/` assets retirados.
- **Regla de 3 vistas (§6) evolucionada**: personajes/props nuevos generan render (aprobación/marketing) + hojas PLANAS de conversión frontal/lateral/trasera; el lateral alimenta `sideProfileRef` y la trasera `backPaintRef`. La ref `ref-volt-warden-front-v2.png` está RESERVADA para un enemigo futuro (decisión usuario — el boss usa la v1).
- **TANDA DE ICONOS COMPLETA 18/18 (2026-07-10, cierre del arte 2D del Bloque C):** los 13 mods (familia 17/17 con icono en `MOD_REGISTRY`; Barrier Cell reutiliza `icon-stat-shield-v2.png`) + 3 glifos UI + 2 cartas + `icon-stat-armor-v2`, todos aprobados y cableados. **Bloque E CERRADO 2026-07-16:** arte Steam/social vigente en `art/steam/image/`; perfil X listo; pipeline de GIF operativo; set final consolidado de 9 screenshots + 9 GIFs; copy, tags, requisitos y brief enviados al publisher. Registro histórico: el publisher creó la página y se informó una revisión de Steam/Valve; su estado actual de revisión o disponibilidad requiere confirmación externa. **Captura cerrada:** `GOLD.startingGold=0`, `VISUAL.showFps=false`, `RECORDING.levelUpDraft.enabled=false` y ambos flags de `RECORDING.chestTesting=false`; no queda ningún rig temporal de captura activo. Pendientes de gameplay: cofres de boss ¿gratis o de pago? · revisión del elenco de armas post-arte-v1 · nombre de la moneda · techo de descartes de level-up.
- **Cápsula principal — pipeline por Codex (2026-07-12, reemplaza al compositor HTML como camino preferente)**: descubrimiento clave — Claude Code SÍ puede lanzar Codex para generar imágenes por IA (`C:\Users\david\.codex\plugins\.plugin-appserver\codex.exe exec -i ref.png - < prompt`, el prompt debe nombrar la ruta de guardado; receta completa en la memoria `codex-image-gen-from-claude`). La cápsula de composición (recortes de logo/letras sobre fondo, `tools/capsule-preview.html`) tiene techo de cohesión; el render full de Codex la supera (cabeza+wordmark voxel 3D integrados en la escena, DOF real). **✅ FIJADA 2026-07-12: `art/steam/capsule-codex-v2a.png`** (neón bajado, wordmark pegado a la cabeza, anatomía corregida; 3 variantes v2a/b/c, descartada la b por un robot de 3 piernas) → copiada al nombre canónico **`art/steam/capsule-main.png`** (v7 viejo preservado como `capsule-main-v7.png`). **Fuente histórica:** v2a es 1656×950; el export final ya existe como `art/steam/image/capsule-main-1232x706.png` y fue enviado al publisher. **Logos v2 derivados de la cápsula por Codex (transparentes, RGBA)**: `art/steam/logo-v2.png` (cabeza-mascota) + `art/steam/logo-letras-v2.png` (wordmark VOLTSWARM). El usuario notó que la cápsula se ve de MÁS calidad que el juego real. Decisión de dirección: la cápsula ES key art idealizado — lo sanciona `PROMPTS_IMAGENES.md` línea 247 (ilustración solo para composiciones imposibles en la cámara top-down, justo este caso), y la brecha se cierra por los SCREENSHOTS honestos + el pulido del juego, NUNCA rebajando el arte de marketing. Compositor viejo (`capsule-preview.html`, hasta v16) queda como plan B. **✅ ACTUALIZADO 07-12 — TODAS las cápsulas derivadas y organizadas**: entregables finales enviados en `art/steam/image/` (Main 1232×706, Header 920×430, Small 462×174, Vertical 748×896, Library Capsule 600×900, Library Hero 3840×1240 y Library Logo 1280×720). Fuentes en `art/steam/` (raíz): master renombrada `capsule-main-master-1656x950.png`, `capsule-bg-v2.png` (fondo suelto rescatado, sirve para el page background), logos v3 limpios (`logo-mascot-v3`/`logo-letras-v3`, re-keyeados con `tools/remove-green.mjs` para matar el fleco verde que dejaba el keyer viejo) + masters green-screen `logo-v2`/`logo-letras-v2`. Regla aprendida: cápsulas ANCHAS = recortar la master (wordmark sobrevive), ALTAS = componer (el recorte corta el wordmark).

- **✅ SETTINGS v3 + CONTROLES REMAPEABLES + GAMEPAD (2026-07-13 tarde, VALIDADO por el usuario en Electron; spec completa en `PRD.md` §"Settings v3")**: input por ACCIONES (`src/input.ts PlayerInput` — moveUp/Down/Left/Right + `interact`, que unificó los 3 `'KeyE'` de config; Escape/Start reservados para pausa) · bindings dentro del blob de settings persistido (normalize = migración) · settings a pantalla completa `menu-view` (sidebar General/Controls al borde izquierdo, contenido ancho encuadrado, **auto-apply sin botón Apply**, Back siempre abajo-izquierda) · captura de remapeo AGNÓSTICA de dispositivo · **gamepad completo**: stick+d-pad, traductor DirectInput (DualShock: caras reordenadas + hat del d-pad en `axes[9]`), navegación de menús con foco visible (vertical = foco, horizontal = ajustar selects/sliders, aceptar = SOLO el binding de interact del jugador, B = back contextual; en el cofre el foco cae en Continue) · notificación "Gamepad detected" abajo-derecha · **empaquetado**: `pnpm package` → NSIS setup + portable en `release/`; signing is not a Steam-only launch gate, and direct-download SmartScreen handling is optional/post-launch. **REGLAS PERMANENTES aprendidas** (mordieron 3+ veces): rutas de assets en strings JS/markup SIEMPRE relativas (`'assets/...'`, `file://` de Electron rompe absolutas — comillas simples Y dobles) y en CSS `url()` SIEMPRE absolutas (Vite las reescribe; las relativas resuelven contra `src/ui.css`) · glifos no-ASCII en UI = trampa (PS2P tiene ↑↓▲▼ pero NO ←→◄► — caen a fuente fina en silencio; etiquetas en ASCII) · animar un `.overlay-panel` = los keyframes DEBEN transportar su `translateX(-50%)` · precarga de arte de UI gated en la pantalla de carga (`hud.preloadUiAssets()` + `tickLoading`) — los hitches de primer-uso se pagan tras el Play, nunca mid-run.

## Nombre, precio, stack

- **Nombre: Voltswarm - CERRADO** (confirmado 2026-07-05, no reabrir salvo instruccion explicita del usuario).
- **Orden de trabajo confirmado (2026-07-05): cerrar TODO el arte de la v1 antes de tocar la capa Steam** (App ID, página, cápsulas) — no adelantar esos pasos aunque parezcan rápidos.
- Precio objetivo: **$4.99** con descuento de lanzamiento 10-15%.
- Stack: Electron + Three.js + TypeScript + Vite sobre el boilerplate original (solo render + empaquetado). Todo el gameplay es código propio en `src/` — no asumir nada que no esté ahí.

---

## Estado operativo actual (2026-08-19) — `codex/map-2` **0.15.0**

### Hazard Marshal: llegada + 3 fases — ENTREGADO 2026-08-19 (0.15.0)

Spec completa en `docs/PRD.md` §"Hazard Marshal — llegada telegrafiada y moveset
de 3 fases". Lo que hay que saber sin abrir el doc, y las reglas que salieron:

- **Al agotarse el reloj el sector se REABRE como arena**, detrás de la misma
  cortina de fundido que un cruce: campo limpio, jugador al centro, props
  vueltos a tirar con el **centro vacío** (radio 28) y curación a tope. No es un
  cruce: no acredita sector ni cambia de mapa; el sector lo sigue cerrando la
  muerte del boss.
- **Una zona de exclusión en el centro NO vacía el centro.** Los gates se
  colocan por su punto central y extienden contenedores a los lados: con un
  círculo de 28 quedó uno a 26,6. El radio se aplica **por familia de prop,
  inflado por el alcance de cada una** (`gateReach` en `world.ts`).
- **La llegada usa el MISMO camino que un summon del Mapa 1** (banner AWAKENS,
  erupción, anillo, temblor), solo que sin la puerta del portal y con un aviso
  de 2,5 s sobre el punto de aterrizaje. No hay una segunda implementación del
  beat que pueda divergir.
- **"Se ve en pantalla" se comprueba proyectando la CAJA del cuerpo, no el punto
  del suelo.** La cámara mira hacia abajo: un cuerpo de 9,87 unidades con los
  pies dentro del cuadro pierde la cabeza por el borde. Y el alto salió de
  MEDIR el modelo — la primera estimación (7) la cazó el chequeo de runtime.
- **El anillo de llegada es 11–15 unidades**, no más: cuanto más lejos, menos
  del cuerpo cabe. Entre los puntos válidos gana el mejor encuadrado, porque
  arriba está el reloj y abajo la barra del boss.
- **Una sola telegrafía por frame**, regla heredada del rechazo de la etapa C
  del Crusher (cuatro eventos en un frame, zona nacida fuera del foco).
- **Todo lo que ponga cuerpos en el campo debe usar `enemies.waveHpMultiplier`**
  — `spawnAt` por defecto pone vida ×1, que en el minuto 20 es un quinto de lo
  que lleva el enjambre alrededor.
- **Durante el finale NO entran oleadas** (`enemies.wavesPaused`, derivado de
  `runFlow.finaleStarted` cada frame). Sin eso el reinicio de arena duraría
  veinte segundos. Los refuerzos del boss sí entran: van por `spawnAt`.
- **NADA en la pelea es más rápido que el jugador (11).** El boss anda a 4 y los
  Voltlings a 5,5, así que **la presión la dan los refuerzos que caen alrededor
  del jugador**, no la persecución. Dos números que hay que respetar en
  cualquier ataque nuevo: una telegrafía de 1,4 s son **15,4 unidades** de
  jugador corriendo (por eso los refuerzos LIDERAN el objetivo), y un proyectil
  a 13 contra 11 cierra a 2 u/s, o sea que **nunca alcanza a quien huye** (por
  eso van a 18).
- **El i-frame de 0,4 s se come los ataques telegrafiados si no se le dice lo
  contrario.** Medido: la cuña pidió daño 5 veces y aterrizó 0, todas dentro de
  la ventana que abría un Voltling al rozarte. Los ataques del boss van por
  `damagePlayer(..., pierceIframe)`, que LIMPIA la invulnerabilidad (evasión,
  escudo y armadura siguen aplicándose). El i-frame capa el enjambre, no un
  ataque que se enseña 1,3 s antes.
- **`radius` NO es el cuerpo que toca el jugador.** Hace otros tres trabajos
  (esquiva del enjambre, spawns, aura/sombra). Para tocar existe
  `EnemyTypeDef.contactRadius`: el Marshal mide 3,24 × 1,33 de semiejes y su
  radius de 3,10 pegaba 1,77 unidades antes de tocarlo.
- **Un boss va con `hitSparks.bossCount` y `BOSS_FLASH_TINT`, no con los del
  enjambre.** Las cifras normales están calibradas para un cuerpo de 0,9 que
  muere en dos golpes; sobre 9,87 unidades golpeadas varias veces por frame, el
  tinte 2,5× no se apaga nunca y revienta el bloom (umbral 0,85).
- **La animación del boss va por `src/boss-rig.ts`**, tallada del MISMO grid que
  el cuerpo instanciado, que se oculta vía `EnemySystem.externallyDrawn`. Rig
  solo para 1 instancia en pantalla — el guardarraíl de InstancedMesh sigue
  intacto para todo lo demás.
- **"No me hace daño" casi nunca significa que no haga daño.** El barrido se
  midió en el frame exacto de la descarga: 3 de 3 con el jugador dentro hacían
  daño. Faltaba el FEEDBACK — 26 de daño daba el mismo flash rojo que el roce de
  un Voltling y ningún número. Los ataques de boss ahora pintan cifra sobre el
  jugador; el roce del enjambre no, a propósito.
- **Una comprobación que pasa sin muestras es peor que no tenerla.** El primer
  instrumento del barrido dio PASS con 0 descargas registradas (escribía en
  `__voltswarm.__sweeps` y leía `window.__sweeps`). Toda medición nueva tiene
  que fallar cuando la muestra está vacía.
- **Para juzgar si el boss pega, medí, no mires:** `node
  tools/finale-runtime-check.mjs --pressure` juega la pelea sin rellenar vida
  con tres patrones de movimiento y atribuye cada impacto a contacto o a
  distancia. "No me quita vida" y "solo me quita si me quedo quieto" se ven
  iguales en la barra y significan cosas opuestas.
- Instrumentos: `pnpm test` incluye `tools/final-boss.test.mjs`;
  `pnpm test:finale-runtime` mide 5 llegadas en el Mapa 2 real dentro de
  Electron y deja frames en `tmp/finale-runtime-output/`. **Tecla Y**
  (`DEV_TOOLS.finaleKey`): salta al finale desde cualquier punto del arco
  conservando la build viva, igual que la T. En el último mapa la T hace lo
  mismo; ambas comparten `windClockToFinale()`.
- **Abierto:** balance del encuentro con runs humanas y audio propio del boss
  (los ataques emiten `boss-attack`, que hoy no tiene asset y suena en silencio).

## Estado histórico (2026-08-18) — `codex/map-2` **0.14.0**

> ## ℹ️ Flags de dev encendidas — normal en desarrollo
>
> `DEV_TOOLS.mapTransitionKey`, `DEV_TOOLS.finaleKey` y
> `DEV_TOOLS.difficultyReadout` están en `true`
> para poder iterar el balance del Mapa 2 sin jugar 10 minutos por prueba. Esto es
> el estado NORMAL mientras se desarrolla, no una deuda: `check-release-flags.mjs`
> ya bloquea `pnpm package`, que es exactamente su trabajo, y solo hay que
> apagarlas antes del congelado del build.
>
> `DEV_TOOLS.shortMaps` está en **`false`**: las runs duran los 10 minutos reales.
> (El aviso anterior decía lo contrario y llevaba caducado desde el 2026-08-17.)

> ## ⚠️ Al balance del Mapa 2 le falta MUESTRA, no playtest
>
> La 0.14.0 mueve seis ejes (curva propia, reloj de roster, daño de contacto de
> enjambre y de boss, cobertura nueva, separación de color de props). Está medido,
> con tests, y **jugado por el usuario** — varios de esos números salieron de su
> playtest, no de una hoja de cálculo.
>
> Lo que NO hay es muestra registrada: ninguna run de 0.14.0 en
> `run-history.json`, porque **una run solo se graba si TERMINA** (muerte o reloj
> agotado); salir al menú no guarda nada. Hasta que existan varias, `pnpm stats`
> —que segmenta por mapa de fin— no puede calibrar umbrales. La validación externa
> (conocidos del usuario) llega después, cuando él esté conforme.
>
> Para leer el estado en vivo mientras jugás: el readout de la esquina
> (`DEV_TOOLS.difficultyReadout`) muestra los tres relojes, la dificultad contra
> el suelo/techo de su mapa, el multiplicador de vida, el daño de contacto y los
> cuerpos vivos. Se añadió porque "¿se aplicó el cambio?" costó tres vueltas de
> adivinanzas en una sola sesión.

> ## ⚠️ Trampa de rama compartida (mordió el 2026-08-06)
>
> Las tres ramas comparten UNA carpeta y UN `dist/`. Si alguien cambia de rama
> mientras otro juega, se compila y se juega la rama equivocada **sin ningún
> aviso**: pasó de verdad — se jugó el bundle de `codex/map-2` creyendo que era
> la Demo, y apareció un Mapa 2 que esta rama no tiene en su código.
>
> **Verificación de 2 segundos antes de fiarse de una sesión de juego:**
> `grep -l "megafactory" dist/assets/*.js`. En ESTA rama (`codex/map-2`) DEBE
> coincidir — si no coincide, el bundle es el de la Demo y lo que ves no vale.
> En la rama Demo es al revés: si coincide, estás jugando el juego completo.
> `git worktree` lo resuelve de raíz (una carpeta por rama); PROPUESTO, no hecho.
>
> **Y revalida la rama al RETOMAR trabajo, no solo al empezar.** Esto ya costó un
> commit en la rama equivocada el 2026-08-06: el árbol se movió entre turnos.
>
> **Portar a la Demo NO es automático (aclarado por el usuario 2026-08-18).** La
> regla de "todo cambio de gameplay va a las dos ramas" cubre los **sistemas
> compartidos**. El contenido del Mapa 2 y del arco completo —curvas por mapa,
> props de fundición, balance de la fundición— **no va a la Demo**, que es solo
> Scrapyard. Antes de ofrecer un port, preguntá: ¿la Demo tiene siquiera esto?

### Balance y presión del Mapa 2 — 0.14.0 (2026-08-18)

Desglose completo en `docs/PLAN_MAPA2.md` §Workstream 4. Lo que hay que saber sin
abrir el doc, y sobre todo **las reglas que salieron de aquí**:

- **Tres relojes, no uno.** `elapsedS` (combate, solo fases visuales) ·
  `arcElapsedS` (la run entera, **nunca rebobina** — vida de enemigo y rampa de
  élites) · `rosterElapsedS` (propio del mapa, **sí reinicia** — qué tipos
  aparecen). **Fuerza y puesta en escena son preguntas distintas** y estaban
  metidas en la misma variable: por eso el Mapa 2 abría con enemigos MÁS BLANDOS
  (2.2×) que el final del Mapa 1 (4.0×).
- **Curva de dificultad por mapa** (`floor`/`peak`/`rampS`) en vez del
  `difficultyOffsetS`. Un offset solo puede abrir alto **o** conservar recorrido,
  nunca las dos: deslizaba una curva de 480s, así que abrir en el minuto 4
  implicaba saturar en el minuto 4. El Mapa 2 barre 0.70 → 1.15 sobre sus 600s.
  **El Mapa 1 queda bit a bit idéntico** (`{0, 1, 480}`), verificado y congelado
  por test.
- **Jerarquía de golpe, congelada por test en CADA mapa: grunt < élite < boss.**
  Se rompió en silencio durante dos versiones al subir el multiplicador del
  enjambre sin mirar al boss. El límite superior también es medido: el DPS de
  boss debe quedar por debajo del que se rechazó el 2026-07-30 (62.5 = muerte en
  1.6s).
- **Los props se colocan mirando el color de sus vecinos** (`pickSpatialVariant`).
  Un sorteo independiente por prop produce rachas de 4-5 iguales **por
  aritmética, no por mala suerte**, con 54 props y 3 variantes.
- **Antes de elegir un color nuevo, hacé el censo de matices.** Hay siete bandas
  ocupadas (loot, boss, ácido, Sparkrunner, grises + azul del suelo, élite,
  malva del Mapa 1) y solo dos ventanas libres: **46-98** (oliva) y **225-285**
  (violeta). Elegir "acero" sin medir dio props nuevos y cero variedad.

### Escenografía del Mapa 2 — CERRADA 2026-08-17 (0.13.49 → 0.13.55)

Detalle completo en `docs/PLAN_MAPA2.md` §Workstream 2 y en `docs/PRD.md`.
Titulares y, sobre todo, **las reglas que salieron de aquí y aplican a todo prop
futuro**:

- **Suelo raster propio** (0.13.53) que arregla un contraste MEDIDO: el suelo
  procedural estaba en luminancia ~39 contra ~31.5 de las torres, ratio 1.10:1,
  o sea estructuras invisibles. El raster lo lleva a ~62 y el ratio a ~1.55:1.
- **Chimenea de fundición** (0.13.54) sustituye a las cajas primitivas del
  perímetro: 22 a radio 82 en tres escalas, más 7-10 repartidas por el campo, con
  tres recoloreados. **Celda de energía** (0.13.55) sube a 46-62 con tres
  recoloreados propios.
- **Rendimiento validado:** 430 enemigos, mediana 8.30 ms y p99 8.50 contra un
  período de vsync de 8.33. Sigue limitado por refresco, no por carga.

> ## ⚠️ Cuatro reglas que costaron tres rondas perdidas — leer antes de tocar un prop
>
> 1. **La proporción se juzga en PÍXELES DE PANTALLA, no en unidades de mundo.**
>    La cámara está en `(0, 24, 19)`, elevación 51.6°, y proyecta la altura por
>    `cos(51.6°) = 0.62` mientras el ancho va entero. Un 3.3:1 de mundo lee
>    2.07:1 en cuadro; un 2.0:1 lee 1.24:1, que es un cubo. Medir con
>    `tools/measure-screenshot-region.mjs` sobre captura real.
> 2. **Un rasgo por debajo de ~1 columna de vóxel NO EXISTE en el modelo**, por
>    perfecto que esté en la hoja. Pasó dos veces (conducto a 0.25, detalle
>    lateral a 0.94). Verificar con
>    `tools/check-conversion-sheet.mjs <hoja> --columns <targetWidth>`.
> 3. **La identidad de un prop está en la SILUETA, no en la pintura.** El primer
>    diseño modular exigía lados rectos para apilar y midió `row width 768..768`
>    en 512 filas: cero variación. Se leía como una caja y añadir detalle no lo
>    arregló. Test: borrá los colores interiores; si el contorno solo no dice qué
>    es, la hoja no sirve.
> 4. **`voxelizeMultiView` no puede dar sección redonda** — el casco visual de un
>    cilindro desde dos vistas ortogonales es un prisma cuadrado. Para columnas y
>    cuerpos redondos: front-only con `sideProfileRef`, el camino del bidón.
>
> Y una de proceso: **la generación de imagen no acierta cuotas de área ni anchos
> de rasgo**. Se piden en el prompt y se CORRIGEN por código
> (`widen-sheet-feature`, `trim-sheet-tail`, `recolorMap`). Caso medido: se pidió
> 30% del tono oscuro y volvió 2.1%.

**Abierto y sin decidir:** el núcleo cian de las celdas de energía, ahora ~55% más
presente en pantalla y compitiendo con el Sparkrunner — el mismo motivo por el
que las torres pasaron de cian a blanco.

**Empaquetado DESBLOQUEADO 2026-08-17 (0.13.57).** `pnpm package` vuelve a
producir instalador NSIS y portable: `asar payload OK - 221 files, 56.9 MB`.

- `DEV_TOOLS.mapTransitionKey` apagado.
- Las hojas huérfanas **no se borran, se excluyen**. `package.json build.files`
  ya usaba ese patrón (11 exclusiones `!dist/assets/2d/...`, todas hojas con cero
  referencias en el registry), y ahora lleva 6 más: un glob
  `prop-foundry-tower-*.png` para las 17 del experimento del módulo apilable,
  las 4 del `stack` v1/v2 EXPLÍCITAS — un glob `prop-foundry-stack-*` se llevaría
  por delante las tres que el modelo carga en runtime — y `prop-canister-front-v1`
  (868K, de la sesión anterior, que el guardián cazó de paso).
- Las iteraciones descartadas siguen en `public/assets/2d/` como historial. Es
  deliberado: el guardián solo exige que no VIAJEN, no que desaparezcan.

### Cambios del 2026-08-06 (0.13.6 → 0.13.13)

- **🔑 REGLA NUEVA: el BOSS despeja el sector, no el reloj.** Antes, llegar a
  10:00 terminaba la run como `sector-cleared` hicieras lo que hicieras, así que
  el portal no tenía ningún tirón — **0 de 6 runs humanas invocaron un boss** con
  la flecha señalándolo todo el rato. En ESTA rama la regla cae en el CRÉDITO:
  `RunFlowState.mapBossDefeated` gatea `sectorsCleared += 1` y se resetea en cada
  transición, para que despejar el sector 1 no pague el 2. **La run nunca se
  corta**: sobrevivir el reloj sigue avanzando al mapa siguiente, solo que sin
  crédito. (La Demo implementa la misma regla sobre el DESENLACE, porque no tiene
  `run-flow`: allí sale `Sector Held` en vez de `Sector Cleared`.)
  **Consecuencia deliberada, cubierta por un test con comentario:** saltarse el
  boss del Mapa 1 y matar solo al final cierra el último sector pero NO el arco →
  la run lee `Sector Cleared` en vez de `Run Complete` y los contratos de
  `complete-runs` no cobran. Completar una run exige ahora los DOS bosses, así que
  **`second-wind` es más difícil aquí que antes** (antes bastaba el boss final).
- **Portal encontrable:** el indicador dice **BOSS**, no `TOTEM` (el cambio de
  más palanca de los tres — "totem" no significa nada, "BOSS" lo entiende todo el
  mundo); el modelo pasa de `voxelSize` 0.12 a 0.16; y su haz, su anillo de aviso
  y su pilar provisional **derivan del modelo** (`portalScale()` en `boss.ts`),
  así que agrandar el portal ya nunca deja atrás su propia luz.
  `BOSS.totemColliderRadius` sigue en config a mano (es física, no visual) con la
  dependencia documentada en ambos lados. **PENDIENTE: la distancia
  (`totemDistMin/Max` 45-65) no se tocó** — si el playtest vuelve a dar 0 bosses,
  el problema es ese y no el tamaño.
- **Guardado a prueba de cortes** (`electron/safe-save.ts`): escritura atómica
  (temp → fsync → rename) para settings, perfil e historial, y las cargas que no
  parsean se mueven a `.corrupt-<ts>` en vez de leerse como "no hay save" y ser
  machacadas por el siguiente autoguardado. Antes, un corte de luz mientras
  guardaba —y guarda al final de CADA run y CADA contrato— borraba en silencio
  armas, cores, mods, sockets y el ledger entero. Cubierto por `test:safe-save`.
- **Pantalla completa a la resolución del jugador.** El default era el literal
  `1280x720` y la lista eran tres tamaños 16:9 fijos, así que un monitor
  1440p/4K/ultrawide **no tenía ninguna entrada que coincidiera** y
  `normalizeSettings` lo empujaba de vuelta a 720p. Ahora la lista se deriva de la
  pantalla y el nativo siempre está. Los tamaños se guardan en píxeles físicos y
  se dividen por el `scaleFactor` antes de llegar a Electron (que dimensiona en
  DIP). Cubierto por `test:display`.
- **`pnpm test` agregado (102 aserciones, ~7s) + `pnpm test:all`.** Había 17
  scripts `test:*` y ningún agregado, así que cada cambio se comprobaba solo
  contra el test que uno recordara — así se rompieron dos casos de `test:demo` sin
  que nadie lo viera. **Córrelo antes de cada commit.**

### Juicio de Contratos (2026-08-06, dos jueces ciegos)

Veredicto: **el mecanismo está bien hecho** (colas, escaleras, IDs, settlement
idempotente) pero **apuntaba mal**. Hallazgo severo confirmado por los dos: los
premios de más peso estaban detrás de un boss que nadie peleaba. La regla del
sector + el portal encontrable atacan justo eso.

Abierto, NO tocado (por si alguien lo retoma):
- `boss-hunter` (5 bosses → socket de arma) es el ÚNICO que da socket de arma.
  **OJO: `bossesDefeated` es acumulado de CARRERA, no por run** (`profile.ts:150`).
  El usuario quiere bajarlo; número sin decidir.
- `proving-ground` está `latent` aunque su objetivo y su premio funcionan hoy.
- Umbrales literales `n: 1` en `contracts.ts` (viola "umbrales solo en config"), y
  `CONTRACTS.fullRunSectors` / `twoOfAKindCharacters` declarados y jamás leídos.
- Ningún contrato tira del chatarrero, que ya medía 0-1 compras en 4 de 6 runs.
- La pantalla de resultados suena en SILENCIO (`endRun` para la música y no
  arranca nada) justo donde está el botón de Wishlist. **Se arregla sin música
  nueva**: la cama de menú ya está precargada.

### Trailer

Plan completo en `docs/TRAILER_V1_PLAN.md`. Música RESUELTA (fuente elegida y dos
ventanas cortadas); no hace falta generar nada más. Decisiones cerradas por el
usuario el 2026-08-06: `DEMO COMPLETE` descartado (las runs se siguen pudiendo
jugar), feedback de fin de sector descartado, accesibilidad fuera de la v1.
**El payoff sigue siendo `Sector Cleared`, pero ahora significa que el boss
murió** — el beat del boss y el del payoff quedan conectados por causa.

---

## Estado histórico (2026-08-04) — `codex/map-2` **0.12.6**

**REGLA DE VERSIONADO UNIVERSAL (usuario 2026-07-25, formato visible fijado 2026-08-01): aplica a Claude, GPT/Codex y cualquier otro agente o herramienta que modifique el repositorio. Antes de CADA commit se sube `version` en `package.json` según SemVer y se escribe esa versión en el asunto del commit.** `__APP_VERSION__` conserva el valor SemVer crudo y se estampa como `buildVersion`; el menú deriva `__APP_DISPLAY_VERSION__` con el número primero y la etiqueta después (por ejemplo, `0.10.2 Beta`). Un commit que cambia comportamiento sin subir versión hace que los registros mientan.

- **Estado externo:** el handoff y la creación de la página son hechos históricos. El estado actual de revisión y disponibilidad pública requiere confirmación externa. Steam App ID `4979220` está verificado y se preserva.
- **Límite de lo confirmado:** no afirmar resultado, fecha de aprobación, publicación ni Coming Soon sin confirmación externa actual. El App ID `4979220` sí puede citarse como dato verificado.
- **Alcance de “v1 cerrada”:** se cerró la v1 del paquete de medios/copy y del handoff de la página; **NO** la versión completa del juego, que sigue el orden de `docs/ROADMAP_STEAM.md`.
- **Rigs temporales de captura CERRADOS (2026-07-17):** `RECORDING.levelUpDraft.enabled=false`, ambos flags de `RECORDING.chestTesting=false` y `GOLD.startingGold=0`. No queda ningún override de captura activo.
- **Material final conservado:** 9 screenshots en `art/steam/screenshots/`, 9 GIFs en `art/steam/gif/`, store/library/social assets y masters aprobados en `art/steam/image/`, copy/brief en `art/steam/info/` y manifiesto en `art/steam/STEAM-MEDIA-MANIFEST.md`. El cofre verde cubre la recompensa; no falta un cofre dorado.
- **Limpieza posterior COMPLETADA con aprobación 1 a 1:** se eliminaron backups, duplicados, temporales regenerables y builds obsoletas. Se retuvieron `assets/preview/` como contexto, `art/concept/`, `tmp/quantize-portal.mjs`, `tmp/perf-400-output/`, los assets finales, las builds v0.1.1 y la última grabación raw `art/video/2026-07-16 17-32-04.mp4`.
- **Fase 3 — COMPLETADA 2026-07-17:** pausa, Settings v3, menú principal con versión leída de `package.json` y desglose final de daño real por arma están cerrados.
- **Foundation de audio — GRAN AVANCE 2026-07-18/19:** estilo de SFX y música ENCONTRADO y validado in-game (ver "Estado del audio"). **2026-07-19: los 10 hooks mudos CERRADOS (batches A-D: player-hit/shield-block, boss-portal/awaken/defeat, run-start/menu-enter/pause/resume/victory/defeat, merchant/shop) + música de menú "Neon Swarm (4)" + primer lote de armas propias (Pulse/Press/Ricochet validados; hooks `WEAPON_FIRE_SFX` mapeados para las 11).** ~28 eventos sonando. Quedan: 7 armas (blades/welder son continuas=difíciles), procs de mods, peligros de enemigos, ataques de boss, ambiente de mapa, camas del álbum (Suno) — todo Fase 5, con briefs en `SOUND_EVENT_CATALOG.md`. QoL 2026-07-18/19: pausa con RIG+stats, números XP/oro acumuladores anclados al player, sliders con valor centrado sobre la barra, click de UI universal (listener delegado), sección de Sockets en el panel de Unlocks (dev: "Unlock everything" abre también los huecos de armas/cores). **Pendiente de otro día con OÍDOS FRESCOS: revisar el sonido de muerte de enemigo (el usuario lo pidió tras fatiga auditiva — NO tocarlo en caliente) + la pasada de cohesión/balance de volumen global con todo el set.**
- **✅ HIGIENE DE RELEASE + COBERTURA (2026-07-25, hardened 2026-08-26 in 0.30.9):** el panel dev "Unlocks / Unlock everything" y las teclas F2-F9 de audición **llegaban a builds de producción**. Ahora los gatea `DEV_TOOLS` en `config.ts`, y `tools/check-release-flags.mjs` corre como hook `prepackage` que **aborta el instalador** si algún flag de dev, override de `RECORDING` o `showFps` sigue encendido. `pnpm test:smoke` juega una run real por arma inicial en Electron (perfil aislado, nunca toca el save real). El benchmark de audio conserva `pnpm benchmark:audio`, pero solo por servidor Vite DEV; `tools/check-release-bundle.mjs` prueba que el CLI/query/hook/rig no existen en `dist/` ni `electron/dist/` antes de empaquetar.
- **✅ PERFIL PERSISTENTE + CONTRATOS (2026-07-25, v0.5.6) — el motor de retención está vivo.** Spec completa en `PRD.md` §"Perfil persistente y Contratos". Titulares: `ACCOUNT` renombrado a **`PROFILE`** (chocaba conceptualmente con la clase `Progression` de progresión dentro de la run) y persistido en `userData/profile.json`; ledger de carrera `LIFETIME` aparte del historial **porque el historial se corta en 250 runs**; historial movido a `userData/run-history.json` legible por herramientas, con migración al arrancar; ~26 contratos (firma + escaleras con colas ordenadas) cubriendo 6 armas / 10 cores / 5 mods / 3 sockets. **Los umbrales son placeholders anclados a UNA run** — se calibran con `pnpm stats` (percentiles, nunca promedios) cuando haya decenas de runs humanas. Herramientas nuevas: `test:smoke`, `stats`, `reset:profile`, `check:release-flags`.
- **Trampas de datos que costaron tiempo y conviene no repetir:** (1) `localStorage` es **por ORIGEN** — jugar en navegador (`pnpm dev`) guarda en un almacén que las herramientas no pueden leer, y un build empaquetado escribe bajo `file://`; para que los datos sirvan hay que jugar desde Electron. (2) Una run **solo se registra si TERMINA** (muerte o 10:00); salir al menú desde la pausa no guarda nada — así se perdieron casi todos los playtests previos. (3) `dist/` y `release/win-unpacked/` se quedan viejos si se trabaja contra el dev server: **lo que se juzgue desde un arranque empaquetado o `file://` hay que reconstruirlo antes** (`pnpm electron:start` lo hace en un paso).
- **✅ PASE DE PULIDO VISUAL Y DE FEEL (2026-07-26, v0.5.6→v0.6.2), todo salido de playtests reales del usuario:** marcadores de suelo (jugador, élite, boss) que ya **pasan por delante de la escenografía y por detrás del personaje** — antes los contenedores los cortaban en bloques grises y el anillo se pintaba sobre el cuerpo del boss · el "glow" del jugador pasó de disco de borde duro a caída radial real · la ruleta del cofre ya **nunca muestra dos mods iguales seguidos** (la tira ciclaba el pool y pegaba el premio al final: 1 de cada 4 aperturas terminaba en pareja; y gold, con un solo mod, mostraba 19 celdas idénticas) · **Volt Pulse 2.4→1.4s de cooldown** (su daño no era el problema: necesita ~4 enemigos en el radio solo para igualar a Bolt, densidad que no existe al empezar; el coste real era el aire muerto). El reset de perfil además **no reseteaba**: la migración de historial reimportaba las runs viejas desde localStorage en cada arranque, ahora es de una sola vez con marcador.
- **📊 PRIMERAS 6 RUNS HUMANAS (2026-07-26) — lo que muestran, con la advertencia de que están repartidas en 4 builds distintas y no sirven para fijar umbrales:**
  - **0 bosses invocados en 6 runs**, incluidas las 2 que llegaron a 10:00. El portal es opcional y está a 45-65 unidades: nadie lo busca. Bloquea `First Blood`, `Boss Hunter` y con él **el único socket de arma** — el perfil de prueba está en 4/4 sockets de core y 1/2 de arma.
  - **Tire Fire está en otra liga**: 2.187 kills / nivel 41 frente a 550 / nivel 22 de Bolt en runs completas equivalentes, y eso que Bolt tenía el DOBLE de sockets de core. Acumula el 74% del daño de toda la carrera.
  - **Las runs son binarias**: se muere antes de los 3 minutos (76s, 94s, 154s, 291s) o se llega a los 600s. No hay término medio, así que la mediana no describe ninguna partida real. Solo 33% de finalización.
  - El chatarrero (primera visita 2:00) **apenas existe** en la mitad de las runs: 0-1 compras en cuatro de las seis.
- **Siguiente secuencia del juego completo (esta línea sustituye el orden histórico anterior):** runs humanas, balance y retención → cohesión del audio nuevo → confirmar publicación/iconos de los 20 achievements creados en App Admin → smoke de desbloqueo en producción → cierre técnico. Swarm Foundry, Hazard Marshal, los tres personajes de lanzamiento y el catálogo/runtime de achievements ya están cerrados. La Demo no amplía este arco. **El gate de viabilidad multijugador se DIFIRIÓ a post-lanzamiento por decisión del usuario**; multiplayer/co-op no está implementado ni anunciado. **El resto de APIs Steamworks están fuera del lanzamiento y solo se reevaluarán post-lanzamiento con suficiente visibilidad/tracción; no están confirmadas ni prometidas.** **RC interno de la Demo:** fin de agosto de 2026; no es fecha pública, promesa de disponibilidad ni confirmación de revisión. Las afirmaciones de Coming Soon siguen requiriendo confirmación externa.

---

## Historial — spec original del Día 1 (superseded)

Se conserva por contexto, ya NO es la especificación vigente — `PRD.md` y `ROADMAP_STEAM.md` mandan sobre esto. Ejemplos de lo que cambió: "3 tipos de enemigo" → 6 tipos + 2 bosses; "sin meta-progresión" → roadmapeada (Fase 5-6); "3-4 armas" → 11; "itch.io el mismo día" → plan de Steam completo.

Concepto original: Vampire Survivors-like en 3D retro low-poly, presentación como diferenciador. Ambientación original: industrial/scrap con geometría primitiva — superseded por "juguete industrial" + arco futurista. Fases originales (MVP 1 día): escena+jugador+cámara → enemigos+IA+spawner → armas+XP+upgrades → timer+dificultad+rendimiento — ya completadas y superadas. Fuera del MVP original (ya no todo aplica): meta-progresión (roadmapeada), múltiples personajes (bocetados, roadmapeados), obstáculos (implementado), sonido (roadmapeado), modelado 3D custom (roadmapeado vía `PROMPTS_IMAGENES.md`).

## TRAMPA de audio — el manifiesto de runtime es un ARTEFACTO DE BUILD (2026-08-19)

`public/assets/audio/prototypes/manifest.json` **lo reescribe `prebuild`** en cada
`pnpm build` (`audio:generate` → `tools/audio/ui-navigation.mjs`) a partir de la
fuente **`tools/audio/prototype-manifest.json`**. Editar el de runtime "funciona"
hasta el siguiente build y después desaparece sin decir nada.

Así se colaron cinco cues del boss final **habilitadas, emitidas y completamente
mudas**: `emit()` las aceptaba, `resolvePath` no encontraba nada y no se creaba
ninguna voz — o sea que todos los síntomas decían "sonó" menos los altavoces.

Dos consecuencias de método, ya cubiertas por test (`tools/audio-selection.test.mjs`):
- Todo id de `AUDIO.validation.enabledEvents` tiene que tener entrada en el
  manifiesto **fuente**.
- **"Aceptado" NO es "audible".** `lastEvent` se sella antes de resolver ruta,
  buffer y voz. Para comprobar que un sonido suena hay que contar VOCES
  (`tools/finale-runtime-check.mjs` envuelve `AudioDirector.play`).

## REGLA PERMANENTE de audio — latencia cero (2026-07-18, orden directa del usuario)

**Todo SFX debe sonar EXACTAMENTE en el frame de su acción/animación — un sonido tarde "queda fatal" y es peor que el silencio.** Implicaciones técnicas no negociables: (1) TODAS las variantes de TODOS los eventos habilitados se precargan y decodifican ANTES de poder sonar (`AudioDirector.preload` calienta el manifiesto entero del evento, nunca una variante suelta); (2) tras `audio.reset()` SIEMPRE se re-precarga (`preloadEnabled`); (3) cero `await` entre el gesto/acción y el `emit` — `activateFromUserGesture` retorna síncrono si el contexto ya corre; (4) sonidos ligados a animaciones (cofre, level-up) se cronometran contra las constantes REALES de la animación (duración de transición CSS, bezier, steps) — si la animación cambia, el asset se regenera.

## REGLA de estilo de audio — NADA retro (2026-07-18, usuario)

**Ni la música ni los SFX pueden sonar retro/antiguo**: nada de chiptune, 8-bit, láseres de onda cuadrada arcade ni bitcrush evidente. Sonido MODERNO. Proceso acordado: se fija primero el estilo de la música de fondo (búsqueda activa vía Suno, tomas en `tmp/music-prototypes/`) y DESPUÉS se regeneran todos los SFX en ese idioma, conservando los gestos y tiempos ya validados (cofre 3 actos, level-up 2 tiempos, sincronía frame-exacta). Los WAV actuales de `public/assets/audio/prototypes/` son placeholders hasta ese momento.

## Estado del audio (2026-07-18 — foundation de estilo ENCONTRADA)

Sesión de búsqueda de estilo completada (17 rondas validadas 1 a 1 in-game). **12 eventos sonando**: bolt "brrt" eléctrico (peak 0.78), muerte = explosión de cubitos (modal dice-knocks, 0.33, cooldown 0.16s), pickups XP/oro (números acumuladores que siguen al player), UI universal (listener delegado en captura), level-up 2 tiempos (fanfarria en la ventana de 0.72s del texto + bloom del draft), cofre 3 actos (pestillo → riser con ticks resueltos de la bezier real → reveal montado en la subida del icono), tienda (`panel-open` comparte bloom) y música "Neon Horizon" provisional (`AUDIO.music.runLoopVolume`). Servido desde `public/assets/audio/prototypes/manifest.json` + `AUDIO.validation.enabledEvents`; generadores DSP deterministas `tools/audio/prototype-*.mjs` (motor `dsp.mjs`); ElevenLabs en `elevenlabs-sfx*.mjs` (key en `.env`, gitignored). Teclas F2-F9 de audición TEMP (`auditionKeys`). El pack viejo `assets/audio/sfx/` sigue siendo fixture rechazado (`paths.finalManifest`) — no borrar. **Música de menú**: "Neon Swarm (4)" cableada como `menu-music.mp3` (evento `menu-music`, loop keyed, arranca al primer gesto en el menú por autoplay policy, handover a la cama de run al darle Play; `AUDIO.music.menuLoopVolume` compensa el duck). **Álbum/DLC**: carpetas por pista en `tmp/music-prototypes/` (Neon Horizon · Molten Circuit · Chrome District · Overcharge · Assembly Line · Menu · Trailer), cada una con su `PROMPT.md` copy-paste para Suno; plan completo en `docs/MUSIC_PROMPTS.md`. **Limpieza 2026-07-19**: public/prototypes reducido a los 35 archivos vigentes del manifiesto; en `tools/audio/` sobreviven solo `dsp.mjs` + los 4 generadores de los sonidos EN USO (r9 modern, r13 pickups, r15 bolt, r17 muerte) + `elevenlabs-sfx-v2` + el pipeline/benchmark original. Siguiente: 10 hooks mudos (player-hit, boss, resultados...) → llenar las camas del álbum → catálogo completo en Fase 5 (todo listado con briefs en `SOUND_EVENT_CATALOG.md`).

**Sesión de armas 2026-07-21 (SFX por arma):** las **5 armas de inicio** (bolt, pulse, press, tire, blades) ya tienen sonido, más **welder** (bloqueada, adelantada por reutilizar la infra de loop). **Blades** = rev one-shot + loop continuo sin costuras (`blades-loop`, respira) + hit metálico de cizalla (`blades-hit`; lección: un "corte" es cizalla de RUIDO resonante, no un timbre modal — el modal suena a cristal, mismo fallo que el ricochet). **Welder** = rayo de energía épico (`welder-beam`, loop; el fix de "sonaba cutre" fue añadir `saturate`+`compress` como el resto de la paleta + un núcleo tonal). **Tire** rehecho v2 = neumático ARDIENDO rodando (fuego + goma pesada + doppler), no un resorte. **Infra nueva de loops sfx** (patrón para toda arma continua): `AudioEvent.bus`, `CombatCtx.startWeaponLoop/stopWeaponLoop/weaponHit`, `WEAPON_LOOP_SFX` con volumen por arma, `WEAPON_HIT_SFX`; suspensión de loops y **duck de música bajo TODOS los overlays in-game** (pausa/level-up/cofre/tienda/game-over) dirigidos desde `game.frame()` por estado. **Bug arreglado:** re-ataque rápido de un loop se quedaba mudo (`stopLoop` liberaba la key tarde). **Review de distintividad hecho** (loops = mayor riesgo de fusión; welder rediseñado para separarlo de blades). **PENDIENTE PRIORITARIO:** revisión de niveles de volumen de TODOS los SFX (unos bien, otros altos/bajos) — juzgar in-game sobre música al ~50%. **Faltan 4 armas** (todas de contrato, one-shots periódicos): oil, acid (con loop de charco), turbine, dismantler. Detalle por sonido en `SOUND_EVENT_CATALOG.md`.

**Sesión de armas 2026-07-22:** cerradas **dismantler** (zarpazo pesado + triple desgarro de RUIDO resonante; el golpe/sub enmascaraba el desgarro → se subió el desgarro), **turbine** (v1 aireado de viento RESTAURADO tras rechazar el v2 "vórtice eléctrico"; + **loop de rugido de viaje** que acompaña al tornado) y **acid** (lanzamiento: lob→estallido→fizz+burbujas; + **loop de sizzle de charco**). **REGLA NUEVA — sonido por distancia en el mundo (`world-distance-audio-rule` en memoria):** los sonidos que ocurren LEJOS del jugador se atenúan con la distancia (más lejos = más bajo); los disparos centrados en el jugador van a volumen pleno. Infra: `AudioDirector.setListener(px,pz)` cada frame + `emit({pos})` para one-shots (`AUDIO.spatial`, con piso de volumen) + `setWeaponLoopVolume`/`setLoopVolume` para loops. Aplicado: acid-throw y dismantler-swipe (one-shots lejanos), acid-loop y turbine-loop (loops al más cercano). **Naming:** "tornado" (user-facing) → **"vortex"** porque se leía como español; verificado que NO hay texto español en el juego (src/dist/asar todo inglés). **Faltan solo:** oil (en veremos si se descarta, ver `oil-weapon-removal-consideration`) — todas las demás armas con sonido. Sigue pendiente prioritario la **revisión global de niveles de volumen**. Follow-ups del dismantler anotados (daño base alto + visual de 3 líneas simple).
