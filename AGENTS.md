# AGENTS.md - Voltswarm

Bullet-heaven 3D estilo Vampire Survivors, mundo futurista de robots, empieza en un desguace. Diferenciador: presentación voxel "juguete industrial", no una mecánica nueva.

## Alcance de variantes (fuente de verdad)

- **Juego completo (`codex/map-2`):** Scrapyard / Mapa 1 → Swarm Foundry / Mapa 2 → **Hazard Marshal**. El boss conserva `modelKey: 'final-boss'`; su baseline jugable quedó **CERRADA en 0.22.0** (llegada, arena, tres fases, refuerzos, audio y desenlace). Balance humano y una arena reactiva/modular son mejoras diferidas. Volt Warden es histórico/futuro.
- **Steam Demo (`codex/demo-map1`, separada; snapshot `0.13.39-demo`):** solo Scrapyard / Mapa 1. Boss derrotado → `SECTOR CLEARED`; llegar al timeout sin derrotarlo → `SECTOR HELD`. Nunca transiciona a Mapa 2 ni contiene Hazard Marshal.
- Fin de agosto de 2026 es objetivo interno de RC de la Demo, no promesa pública ni confirmación de revisión/disponibilidad.

## ⚡ Lo primero que hay que mirar, según lo que te pidan

| Te piden... | Leé ESTO primero | Guardarraíl que no se negocia aquí |
| --- | --- | --- |
| Fix de un bug puntual | `docs/PRD.md` (¿qué debería hacer este sistema?) | Números en `src/config.ts`, nunca hardcodeados |
| Contrato / desbloqueo / progresión entre runs | `docs/PRD.md` §"Perfil persistente y Contratos" → `src/contracts.ts` | Añadir contenido = `push` a una cola, NUNCA escribir un contrato · lo otorgado se guarda como IDS, jamás como índice · lo otorgado nunca se revoca · umbrales solo en `config.ts CONTRACTS` |
| Datos de runs / calibrar números | `pnpm stats` (percentiles, nunca promedios) | Solo cuenta una run TERMINADA · jugar desde Electron, no navegador · datos de bot ≠ datos humanos |
| Arma / mejora / stat nueva | `docs/METODO_DISENO.md` (proceso) → `docs/DESIGN_MEJORAS.md` (¿ya está diseñada? estado ✅/🟢/🟡/🔴) | Sin apuntado manual · anti-clon de Megabonk |
| Personaje jugable nuevo, dash, o "se siente quieto" | `docs/DISENO_FRENESI.md` §4 (decisiones cerradas) → `docs/DESIGN_MEJORAS.md` §Personajes → `docs/PRD.md` §Personajes | Identidad = REGLA que dobla un sistema existente, NUNCA movilidad ni stats sueltos · ningún personaje sobrevive por moverse bien · dash universal e idéntico y va DESPUÉS de que la densidad importe · personaje = contrato FIRMA, jamás peldaño de escalera · cumplir el contrato reutilizable de UI antes de integrar |
| Enemigo / mapa / prop nuevo | `docs/DIRECCION_ARTE.md` (silueta, paleta, arco de mapas) | Silueta única por tipo · InstancedMesh por tipo |
| Modelo 3D de personaje/prop (nuevo o existente) | `docs/PROMPTS_IMAGENES.md` §6-7 (prompt maestro) → `docs/DIRECCION_ARTE.md` (pipeline 2D→3D) | **3 vistas SIEMPRE** (frontal/lateral/trasera, regla 2026-07-06) contiguas y planas → entrada en `src/models/registry.ts` · validar enjambre 400+ |
| Suelo/ambiente de mapa | `docs/PROMPTS_IMAGENES.md` §7b (pipeline distinto: textura cenital, no se voxeliza) | Vista top-down estricta, sin props/personajes en la imagen · mosaico vía `RepeatWrapping` · `litMaterial()` para no desentonar con el resto |
| Cualquier imagen a generar (icono, logo, HUD) | `docs/PROMPTS_IMAGENES.md` | Regla voxel SIEMPRE explícita en el prompt |
| Efecto visual / shader / partículas / sonido | `docs/DIRECCION_ARTE.md` (sección VFX) → `docs/REFERENCIAS_VISUALES.md` | Partículas = cubos voxel de paleta · cero gore · validar con 400+ enemigos |
| Cualquier sonido/SFX/música | `docs/SOUND_EVENT_CATALOG.md` (leyes de estilo + estado por evento) → `docs/MUSIC_PROMPTS.md` (provenance Suno) → `docs/AUDIO_AUTHORING_PIPELINE.md` | 6 leyes 2026-07-18: NADA retro · latencia cero · frecuente=invisible · asimetría disparo/muerte · pirámide de volumen · muerte=VFX de cubos · veredicto SIEMPRE in-game |
| Trailer, vídeo o captura de marketing | `docs/TRAILER_V1_PLAN.md` (beat sheet, ventana de música medida, checklist de captura) → `docs/MARKETING_PLAN_LAUNCH_2026.md` (calendario de beats) | Se captura DEL build congelado, nunca antes · solo contenido de la variante que se publica · la intro de una cue se arregla recortando, el final NO · nada de Next Fest, fechas ni disponibilidad sin confirmación externa |
| Multiplayer / co-op | `docs/MULTIPLAYER_FEASIBILITY.md` → `docs/ROADMAP_STEAM.md` | Es un gate GO/NO-GO, no una promesa pública; simulación determinista/observadores antes de modo jugable |
| Bug visual / orden de dibujado | §"Reglas de render que ya mordieron" en este archivo | Transparente se dibuja SIEMPRE tras opaco · `renderOrder` no se hereda de un Group · medir el material en runtime, no juzgar por captura |
| Balance (números que se sienten mal) | `docs/ROADMAP_STEAM.md` (¿existe ya el instrumento de medición?) | Un cambio numérico por playtest — no varios a la vez |
| "¿Qué nos falta?" / auditoría grande | `docs/COMPARATIVA_MEGABONK.md` + skill `judgment-day` | Dos jueces ciegos en paralelo, nunca un solo review |
| "¿Qué toca ahora?" a nivel proyecto | `docs/ROADMAP_STEAM.md` — es LA fuente de verdad del orden | No reordenar de memoria sin actualizar el doc |

Regla general: si el pedido no encaja claro en una fila, `docs/PRD.md` primero (qué existe) y `docs/ROADMAP_STEAM.md` segundo (qué toca ahora).

## Contrato obligatorio — UI de personaje jugable nuevo

Este checklist es la regla vigente; las notas históricas del estado del proyecto no la sustituyen:

- [ ] `CharacterDef` aporta `modelKey` validado y ruta empaquetada a una frontal ortográfica/retrato aprobado. El pipeline de arte mantiene **frontal/lateral/trasera** planas; la frontal solo entra en UI después de validación/aprobación.
- [ ] La tarjeta izquierda siempre muestra retrato, nombre y estado. Transparencia sobre `#444e5e`, borde `#2b3340`, selección cian. Abierto = `Unlocked`; cerrado = texto visible exacto `Locked` + `assets/2d/icon-ui-lock-v2.png`, jamás emoji u otro candado.
- [ ] El detalle usa un icono in-game existente, distinto y veraz por stat. No combinar stats no relacionados, no usar Shield para Armor y derivar números/unidades de config/`CharacterDef`.
- [ ] Son obligatorios: encabezado de arquetipo, firma/regla con magnitud config-derived, `Suggested Start` solo como recomendación visual, tradeoff y Contract/progreso cuando esté bloqueado.
- [ ] Characters y pre-run comparten renderer. Preservar `data-character-*`, teclado/gamepad, scroll responsive y Confirm bloqueado. No montar visor 3D visible; el preview dormido es solo futuro.

**Implementación actual:** Field Engineer cumple el contrato con `ref-field-engineer-front-v1.png`. Consultar el checklist verificable en `docs/PRD.md`, la dirección visual en `docs/DIRECCION_ARTE.md` y el pipeline de tres vistas en `docs/PROMPTS_IMAGENES.md`.

## Guardarraíles técnicos NO NEGOCIABLES (aplican siempre, sin excepción)

1. **`THREE.InstancedMesh`** — un mesh por TIPO de enemigo, nunca por instancia. Objetivo: 60 FPS con 400+ enemigos. Todo contenido nuevo se valida con el enjambre al máximo antes de darse por bueno.
2. **Todo número de gameplay vive en `src/config.ts`.** Cero magnitudes hardcodeadas en sistemas.
3. **Código, comentarios y copy de UI en inglés.** El español es el idioma de esta conversación, no del repo.
4. **Sin apuntado manual del jugador.** Toda arma se auto-apunta (caso real: Hydraulic Press se rediseñó por violar esto).
5. **Nunca clonar contenido de Megabonk 1:1.** Se extrae la base estructural, se genera contenido propio — proceso completo en `METODO_DISENO.md`.
6. **Subir `version` en `package.json` ANTES de cada commit** y escribirla en el asunto. Esta regla es INVARIANTE para Claude, GPT/Codex y cualquier otro agente o herramienta: los metadatos usan SemVer válido (`0.10.2-beta`) y ese valor crudo se estampa como `buildVersion`; la UI/copy humana usa número primero y etiqueta después (`0.10.2 Beta`). `Alpha`, `Beta`, `Preview` y `Playtest` SIEMPRE van después del número, nunca `Beta 0.10.2`.
7. **Ningún instrumento de desarrollo llega a producción.** Van gateados por `DEV_TOOLS` en `config.ts`, y `pnpm package` aborta si alguno queda encendido. Un jugador que paga no puede tener un botón de "desbloquear todo" en el menú.
8. **`PROFILE` se muta EN SU SITIO, nunca se reemplaza.** Todo el gating tiene una referencia viva a ese objeto; reemplazarlo los desconecta a todos en silencio.
9. **El gestor de paquetes es `pnpm`, SIEMPRE — nunca `npm install` ni `yarn`.** Esta regla es INVARIANTE para Claude, GPT/Codex y cualquier otro agente o herramienta. Fijado en `packageManager`, con `pnpm-lock.yaml` versionado, `package-lock.json`/`yarn.lock` en `.gitignore` y un `preinstall` (`tools/check-package-manager.mjs`) que aborta el install si lo lanza otro gestor. Mezclarlos ya mordió (2026-08-09): un `node_modules` de pnpm junto a un `package-lock.json` versionado dejó el árbol **sin `node_modules/.bin`**, y el build murió en `tsc` con un "no se reconoce como comando" que no apunta a nada. Dos consecuencias que hay que respetar: (a) pnpm 10 **no ejecuta scripts de postinstall** salvo los listados en `pnpm.onlyBuiltDependencies` — ahí vive `electron`, que es quien DESCARGA el binario, así que sacarlo de esa lista deja el juego sin arrancar; (b) pnpm no filtra dependencias transitivas, así que **toda importación debe estar declarada** (caso real: `tools/check-asar-payload.mjs` importaba `@electron/asar` sin declararla y el empaquetado reventaba con un engañoso "Cannot require() ES Module in a cycle").

## Cómo se verifica algo aquí (reglas de método, aprendidas a golpes 2026-07-25/26)

1. **MEDIR, no mirar una captura.** Dos veces se dio por bueno un arreglo visual leyendo un pantallazo: una vez "los iconos desaparecieron" (estaban ahí, oscuros a 40px) y otra "el aura del élite ya queda tapada" (eran los huecos entre sus 4 arcos). Se consulta el DOM o el material en runtime, y la captura confirma DESPUÉS; nunca al revés.
2. **Nunca editar código fuente con reemplazos de texto por script.** No hacen nada y no avisan cuando el patrón no coincide. Un lote de cinco "funcionó" porque acertó uno, y ese fallo silencioso costó tres rondas de depuración del mismo bug. Usar herramientas de edición que fallen ruidosamente ante un desajuste.
3. **Lo que se juzgue desde un arranque empaquetado o `file://` hay que reconstruirlo antes.** Trabajar contra el dev server deja `dist/` y `release/win-unpacked/` viejos, y una build vieja muestra comportamiento viejo sin decirlo. `pnpm electron:start` compila y lanza en un paso.
4. **Un cambio numérico por playtest.** Y si el instrumento de medida es el bot de `test:smoke`, recordar qué distorsiona: gira en círculo cerrado, lo que **infla** las armas de AoE centrado (amontona enemigos) y **hunde** las de contacto en órbita (huye de ellas). Sirve para detectar un extremo, no para elegir entre dos valores cercanos.

## Reglas de render que ya mordieron

- **Three.js dibuja TODA la cola transparente después de todos los opacos.** Por eso `renderOrder` no basta para que un marcador de suelo pase por delante de la escenografía y por detrás del personaje: hay que sacarlo de la cola transparente (`transparent: false`, el blending aditivo funciona igual) y hornear la opacidad en el color, porque `material.opacity` se ignora fuera de esa cola. Capas: escenografía 0 → marcadores 1 → personajes 2 (`VISUAL.renderOrders`).
- **`renderOrder` NO se hereda de un `Group`.** Three.js ordena por malla; ponerlo en el grupo no hace nada. Usar el helper `setRenderOrder()` de `player.ts`.

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
| `docs/DISENO_FRENESI.md` | Estudio MEDIDO de por qué el juego se siente y se ve quieto (curva de densidad, jugador inalcanzable, meseta final) + ideas por ejes. §4 = decisiones cerradas de dash y personajes, con el hallazgo clave: el i-frame global capa el DPS del enjambre a 20, así que más densidad se VE más loca sin ser más peligrosa. |
| `docs/DISENO_AUDIO.md` | Foundation `AudioDirector`/buses/presupuesto que se implementa ahora, más catálogo de ~95 SFX/música que se completa después de contenido/balance. |
| `src/contracts.ts` | Sistema de contratos: tipos de objetivo, contratos firma, escaleras y colas de premios. Los umbrales viven en `config.ts CONTRACTS`, no aquí. |
| `src/profile.ts` | `PROFILE` (desbloqueos/sockets) + `LIFETIME` (ledger de carrera) y su persistencia. Toda progresión entre runs pasa por acá. |
| `docs/AUDIO_AUTHORING_PIPELINE.md` | Pipeline offline SFX determinista + Suno para música: masters/exports/manifiesto, reproducibilidad, provenance y reglas de licencia comercial. |
| `docs/MULTIPLAYER_FEASIBILITY.md` | Gate interno GO/NO-GO: 1–4 `PlayerId`, primero local exactamente 2P split-screen con cámaras independientes → Remote Play host si procede; online 4P posterior, no es promesa pública. |
| `docs/SOUND_EVENT_CATALOG.md` | Las 6 leyes de estilo + estado real por evento. Audio v1 aceptado; catálogo futuro aún abierto. Fuente de verdad del audio. |
| `docs/SOUND_DIRECTION.md` | ⚠️ SUPERSEDED: dirección "juguete industrial" vieja, pendiente de reescritura; ante conflicto manda `SOUND_EVENT_CATALOG.md`. |
| `docs/MUSIC_PROMPTS.md` | Provenance Suno: prompt ancla "Neon Horizon", criterios de selección, direcciones rechazadas. Toda música rastrea a una entrada aquí. |
| `docs/TRAILER_V1_PLAN.md` | PLANIFICADO 2026-08-06 (nada capturado ni montado): trailer de 65s del lanzamiento de la Steam Demo — beat sheet, checklist de captura, cue de música, CTA gateado. Regla de orden: se captura DEL build congelado, nunca antes. Registra 4 decisiones abiertas (boss inalcanzable, choque con el beat S5 de octubre, Next Fest sin confirmar). |

**Actualizar, no solo leer**: feature nueva → sección en `PRD.md` · sistema con principio nuevo → `METODO_DISENO.md` · arma/mejora implementada → su estado a ✅ en `DESIGN_MEJORAS.md` · hito cumplido → marcarlo en `ROADMAP_STEAM.md` · nombre/precio/fecha → vive en `ROADMAP_STEAM.md`, no solo en el chat.

## Proceso de revisión (Judgment Day)

Antes de lanzamiento, pase grande de contenido, o si el usuario lo pide ("juicio", "revisa el proyecto"): skill `judgment-day`, dos jueces ciegos en paralelo. Nunca aplicar fixes de Ronda 1 sin confirmación del usuario.

## Estado vigente del proyecto (2026-08-25, source/HEAD `0.30.1`)

- **Arco completo:** para cruzar Mapa 1 hacen falta 10:00 **y** al menos un boss derrotado; fallar el gate termina en `OBJECTIVE FAILED`. El cruce conserva build, nivel, XP y descartes, cura al 100% y reinicia el oro a 0. El crédito final depende de sectores acreditados: matar solo al boss final sin crédito previo no produce `run-complete`.
- **Swarm Foundry:** raster floor, stacks, cells, cover, arena wall, and per-map sky/fog are implemented. The current enemy-replacement slice is CLOSED with Furnace Mite, Axle Runner, and Slagcaster. The current ambient visual state is closed; molten-flow glow and voxel sparks are optional future enhancements. Forge Dart, further Rustbrute/Drone replacements, Arc Courier, and all other enemy expansion are deferred beyond the current production scope.
- **Hazard Marshal:** baseline cerrada en `0.22.0`: llegada propia con `holdFire` en las 11 armas incluida Oil, arena despejada, tres fases, sweep/volley/assembly/overload, refuerzos, cues propios y desenlace. El balance fino espera runs humanas terminadas; arena reactiva/modular queda opcional.
- **Content and profile:** 11 registered weapons / 10 playable (Oil disabled), 20 Cores, 17 Mods, and 29 declared / 29 active Contracts. Global capacity is weapons 2→3, Cores 2→4, and discards 3→4. **Field Engineer, Rack Hauler, and Overclocker are final and CLOSED for the current release scope.** Rack retains its measured 430-enemy evidence. Overclocker is closed by explicit user acceptance; no separate 400+ benchmark is claimed.
- **Next sequence:** completed human runs plus `pnpm stats` for balance/retention → cohesion pass for new audio → Steamworks/technical close.
- **Estado de entrega:** source/HEAD declara `0.30.1`. `DEV_TOOLS.shortMaps = false`; `mapTransitionKey = true` y `finaleKey = true`, así que `pnpm package` está bloqueado y **no existe paquete 0.30.1**. Rigs de recording, FPS y oro están limpios.

## Foto histórica del proyecto (2026-07-13; SUPERSEDED donde contradiga el bloque vigente)

- **Sistema de contenido (snapshot histórico 2026-07-17):** taxonomía de Cores y Mods ya implementada. Los valores de Barrier Cell de esta foto fueron sustituidos por la curva vigente de **30 s base, −3 s por copias 7–10, mínimo 18 s y cap 10**.
- **Gating de perfil (snapshot histórico):** el diseño inicial de sockets fue ampliado después. La capacidad vigente está en el bloque superior: armas 2→3 y Cores 2→4.
- **Economía in-run**: moneda visual (ficha hexagonal dorada girando, merge tipo orbes XP, nombre pendiente — icono primero), drops 25%/elite 10/boss 50, precios escalan con el minuto de run. **Chatarrero** (The Scrapper): visitas 2:00/5:00/8:00, indicador con countdown 60s, tienda con E, stock 3 por tier/Luck. **Cofres de pago**: tier fijado al aparecer (beam coloreado = señal), se abren con E cobrando `tierPrice × 0.5`. **Ruleta con pausa de lectura (2026-07-10)**: la hoja de stats + listas del build se muestran durante TODA la apertura (desde que gira la ruleta — `#stat-sheet` vive ya FUERA de los overlays, gate `body:has(#chest-overlay:not(.hidden))` además del de level-up); al aterrizar el mod se aplica al instante y la run queda congelada hasta pulsar Continue. **La ruleta ES una `upgrade-card` real** (mismo DOM/CSS que tienda y level-up: tier border+glow+rarity tag+muescas — el tier se viste desde el primer frame), card 330px con ventana de 220px e icono a 180px SIEMPRE dentro del marco. **Animación v3 (2026-07-10, regla del usuario: parecido a Megabonk en estructura pero con IDENTIDAD propia, nunca copia)**: tira vertical de tragaperras REAL (`#chest-reel`, 19 celdas bajando por la ventana en una transición CSS decelerante de 2.6s, aterrizaje por `transitionend` + timeout de respaldo; los iconos del giro van en SOMBRA — `grayscale(1) brightness(0.5)` + halo del tier, NUNCA silueta plana `contrast(0)` que convierte los mods con salpicaduras en manchas — y el premio revienta a color en el reveal) → flash blanco 2 frames → god-rays del tier girando → el icono SUBE con overshoot `steps(8)` → lluvia continua de chispas voxel, sobre viñeta radial. El rattle lateral de v2 se ELIMINÓ (el usuario lo odiaba) — el reel vertical es nuestro beat de identidad frente al revelado directo de Megabonk. **Estado tras cerrar la captura comercial (2026-07-16): `GOLD.startingGold = 0`, `RECORDING.chestTesting.forceGreenChests = false` y `RECORDING.chestTesting.forceOrbSiphonReward = false`; todos los rigs temporales de captura están desactivados (`RECORDING.levelUpDraft.enabled = false`).** **Pase de generosidad económica 2026-07-10 (pendiente de playtest, juzgar como UN cambio)**: XP orbe ×1.3 (`XP_ORBS.valueMult`) + drop de oro 20%→25% + cofres 0.6→0.5 — precios de tienda intactos a propósito.
- **Elenco 3D**: 6 enemigos + 3 bosses + jugador + **chatarrero** + props (contenedores/bidones) + **portal de boss** (reemplazó al tótem, escala landmark) + **cofre ×5 tiers** (bronce "familia económica" + costura por tier). Voxelizador v3: `verticalRoundness` (cúpula), `sideProfileRef` (perfil medido de hoja lateral plana), `backPaintRef` (espalda pintada) — bosses actualizados con hojas medidas. Reglas nuevas en `PROMPTS_IMAGENES.md` §6: render bonito ≠ hoja de conversión (el voxelizador SOLO come hojas planas), pedir a Codex "generate an IMAGE (do NOT draw programmatically)". **✅ PASE DE FIDELIDAD DEL ENJAMBRE 2026-07-13 (cierra "alinear enemigos con la cápsula" — desde el MODELADO, no materiales)**: los 6 enemigos + jugador migrados a hojas medidas (Codex genera side/back desde la frontal aprobada como input + candado anti-invención — cero detalles inventados en 14 hojas); Sparkrunner rediseñado a **v5 CON BRAZOS** (aprobado; lecciones: hueco brazo-torso ≥ ancho del brazo o se fusiona, unión hombro-brazo GRUESA o "flota", los brazos ensanchan el bbox → targetWidth 17→21); laterales "action figure" para los planos (Rustbrute/Sparkrunner); excepción Drone (solo `backPaintRef` — el perfil medido del rotor tapaba el techo en negro); Roller conserva su ojo trasero espejado (backPaint gana a mirrorBack). **Greedy meshing en Y** en `voxel-builder.ts`: -27% a -66% de triángulos, visual pixel-idéntico, gratis para todo el elenco. **Anillo de élite UNIFICADO** (`ELITES.aura`): segmentado magenta ROTANTE bajo todo élite — lenguaje: élite = segmentado magenta girando · boss = doble rojo sólido; el anillo viejo no se registraba jugando. Herramienta nueva `tools/capture-elites.mjs` (fuerza élites vía dev hook). **Rim light probado y RECHAZADO por el usuario — revertido por completo, no reintentar sin pedido explícito.** ✅ Fix Junk Ricochet VALIDADO por el usuario 2026-07-13.
- **UI v2 COMPLETA (2026-07-10, 11 mejoras cerradas)**: fuente pixel **Press Start 2P** bundleada en TODOS los textos/números (subset latin real — ojo: el subset latin-ext "carga" pero cae a Segoe en ASCII) · barras SEGMENTADAS por celdas (vida/XP/boss) con valores `actual/máximo`, tapas de peligro en la del boss y retrato del boss (su hoja de ref a 36px) · esquinas con muesca pixel (clip-path) y placas biseladas en cartas/filas/botones · **cáscara de orbe integrada en runtime** (`src/core-orbs.ts`: UNA cáscara teñida por tier, icono centrado en la ventana óptica 46%, cartas 116px) — absorbió los ornamentos de rareza · banner de eventos arcade (AWAKENS/DESTROYED/SCRAPPER) · flash de daño + pulso rojo <25% HP · oro con tick+bump · prompt de interacción FLOTANDO sobre cofre/chatarrero (worldToScreen) · chip LV centrado bajo la XP · flash dorado de fila mejorada + pop cian al llenar socket · 💀 en kills. Paneles build/stats en 2 columnas espejadas. Scanlines/CRT: POSPUESTO post-fases (demo en `assets/preview/scanline-demo.png`).
- **Fase 1 visual + PASE DE VFX DE COMBATE COMPLETO (2026-07-11, pendiente de revisión a fondo del usuario en playtest)**: base en `config.VISUAL` (bloom, sombras blob, toon 3 pasos, cámara 52°, suelo fábrica en mosaico, screen shake, death burst, cielo degradado + vignette). **VFX de combate cerrado**: chispas de golpe universales (`VISUAL.hitSparks`, acento del icono vía `WEAPON_ACCENT` en weapons.ts — fuente única icono↔proyectil↔chispa) · VFX propio de las 11 armas (Bolt=perno voxel, Pulse=anillo de cubos, Blades=sierra, Welder=arco segmentado, Press=losa que cae, Tire=neumático negro+llama, Oil/Acid=manchas voxel+burbujeo+tinte de estado parpadeante, Turbine=tornado, Ricochet=chatarra+zigzag, Dismantler=zarpazo triple) · **VFX de los 12 mods permanentes** (`VISUAL.modVfx`: cada mod habla VoxelBurst en el color MEDIDO de su icono; retune anti-colisión de la "sopa cian" → paleta pairwise-distinta + el PATRÓN como eje de distinción: burst puntual / anillo / estela-línea / aura sostenida / tinte) · portal de boss telegrafiado (beam estroboscópico + anillos de aviso + erupción) + proyectiles enemigos diferenciados (Gunner esquirla naranja, Tesla Titan estrella roja). **Regla de DOS MITADES (usuario): siempre se ve el ORIGEN y el DESTINO del efecto.** Detalle completo en `ROADMAP_STEAM.md` punto 1 del gate; capturas en `assets/preview/vfx-*.png` y `modvfx-*.png`. ~120 FPS. Icono de app y logo v3 aprobados; 11 iconos de arma + 20 de stat cableados. `art/steam/` guarda el arte final de marketing; `art/concept/` renders; `art/archive/` assets retirados.
- **Regla de 3 vistas (§6) evolucionada**: personajes/props nuevos generan render (aprobación/marketing) + hojas PLANAS de conversión frontal/lateral/trasera; el lateral alimenta `sideProfileRef` y la trasera `backPaintRef`. La ref `ref-volt-warden-front-v2.png` está RESERVADA para un enemigo futuro (decisión usuario — el boss usa la v1).
- **TANDA DE ICONOS COMPLETA 18/18 (2026-07-10, cierre del arte 2D del Bloque C):** los 13 mods (familia 17/17 con icono en `MOD_REGISTRY`; Barrier Cell reutiliza `icon-stat-shield-v2.png`) + 3 glifos UI + 2 cartas + `icon-stat-armor-v2`, todos aprobados y cableados. **Bloque E CERRADO 2026-07-16:** arte Steam/social vigente en `art/steam/image/`; perfil X listo; pipeline de GIF operativo; set final consolidado de 9 screenshots + 9 GIFs; copy, tags, requisitos y brief enviados al publisher. Registro histórico: el publisher creó la página y se informó una revisión de Steam/Valve; su estado actual de revisión o disponibilidad requiere confirmación externa. **Captura cerrada:** `GOLD.startingGold=0`, `VISUAL.showFps=false`, `RECORDING.levelUpDraft.enabled=false` y ambos flags de `RECORDING.chestTesting=false`; no queda ningún rig temporal de captura activo. Pendientes de gameplay: cofres de boss ¿gratis o de pago? · revisión del elenco de armas post-arte-v1 · nombre de la moneda · techo de descartes de level-up.
- **Cápsula principal — pipeline por Codex (2026-07-12, reemplaza al compositor HTML como camino preferente)**: descubrimiento clave — Claude Code SÍ puede lanzar Codex para generar imágenes por IA (`C:\Users\david\.codex\plugins\.plugin-appserver\codex.exe exec -i ref.png - < prompt`, el prompt debe nombrar la ruta de guardado; receta completa en la memoria `codex-image-gen-from-claude`). La cápsula de composición (recortes de logo/letras sobre fondo, `tools/capsule-preview.html`) tiene techo de cohesión; el render full de Codex la supera (cabeza+wordmark voxel 3D integrados en la escena, DOF real). **✅ FIJADA 2026-07-12: `art/steam/capsule-codex-v2a.png`** (neón bajado, wordmark pegado a la cabeza, anatomía corregida; 3 variantes v2a/b/c, descartada la b por un robot de 3 piernas) → copiada al nombre canónico **`art/steam/capsule-main.png`** (v7 viejo preservado como `capsule-main-v7.png`). **Fuente histórica:** v2a es 1656×950; el export final ya existe como `art/steam/image/capsule-main-1232x706.png` y fue enviado al publisher. **Logos v2 derivados de la cápsula por Codex (transparentes, RGBA)**: `art/steam/logo-v2.png` (cabeza-mascota) + `art/steam/logo-letras-v2.png` (wordmark VOLTSWARM). El usuario notó que la cápsula se ve de MÁS calidad que el juego real. Decisión de dirección: la cápsula ES key art idealizado — lo sanciona `PROMPTS_IMAGENES.md` línea 247 (ilustración solo para composiciones imposibles en la cámara top-down, justo este caso), y la brecha se cierra por los SCREENSHOTS honestos + el pulido del juego, NUNCA rebajando el arte de marketing. Compositor viejo (`capsule-preview.html`, hasta v16) queda como plan B. **✅ ACTUALIZADO 07-12 — TODAS las cápsulas derivadas y organizadas**: entregables finales enviados en `art/steam/image/` (Main 1232×706, Header 920×430, Small 462×174, Vertical 748×896, Library Capsule 600×900, Library Hero 3840×1240 y Library Logo 1280×720). Fuentes en `art/steam/` (raíz): master renombrada `capsule-main-master-1656x950.png`, `capsule-bg-v2.png` (fondo suelto rescatado, sirve para el page background), logos v3 limpios (`logo-mascot-v3`/`logo-letras-v3`, re-keyeados con `tools/remove-green.mjs` para matar el fleco verde que dejaba el keyer viejo) + masters green-screen `logo-v2`/`logo-letras-v2`. Regla aprendida: cápsulas ANCHAS = recortar la master (wordmark sobrevive), ALTAS = componer (el recorte corta el wordmark).

- **✅ SETTINGS v3 + CONTROLES REMAPEABLES + GAMEPAD (2026-07-13 tarde, VALIDADO por el usuario en Electron; spec completa en `PRD.md` §"Settings v3")**: input por ACCIONES (`src/input.ts PlayerInput` — moveUp/Down/Left/Right + `interact`, que unificó los 3 `'KeyE'` de config; Escape/Start reservados para pausa) · bindings dentro del blob de settings persistido (normalize = migración) · settings a pantalla completa `menu-view` (sidebar General/Controls al borde izquierdo, contenido ancho encuadrado, **auto-apply sin botón Apply**, Back siempre abajo-izquierda) · captura de remapeo AGNÓSTICA de dispositivo · **gamepad completo**: stick+d-pad, traductor DirectInput (DualShock: caras reordenadas + hat del d-pad en `axes[9]`), navegación de menús con foco visible (vertical = foco, horizontal = ajustar selects/sliders, aceptar = SOLO el binding de interact del jugador, B = back contextual; en el cofre el foco cae en Continue) · notificación "Gamepad detected" abajo-derecha · **empaquetado**: `pnpm package` → NSIS setup + portable en `release/` (sin firma → SmartScreen, Fase 6). **REGLAS PERMANENTES aprendidas** (mordieron 3+ veces): rutas de assets en strings JS/markup SIEMPRE relativas (`'assets/...'`, `file://` de Electron rompe absolutas — comillas simples Y dobles) y en CSS `url()` SIEMPRE absolutas (Vite las reescribe; las relativas resuelven contra `src/ui.css`) · glifos no-ASCII en UI = trampa (PS2P tiene ↑↓▲▼ pero NO ←→◄► — caen a fuente fina en silencio; etiquetas en ASCII) · animar un `.overlay-panel` = los keyframes DEBEN transportar su `translateX(-50%)` · precarga de arte de UI gated en la pantalla de carga (`hud.preloadUiAssets()` + `tickLoading`) — los hitches de primer-uso se pagan tras el Play, nunca mid-run.

## Nombre, precio, stack

- **Nombre: Voltswarm - CERRADO** (confirmado 2026-07-05, no reabrir salvo instruccion explicita del usuario).
- **Orden de trabajo confirmado (2026-07-05): cerrar TODO el arte de la v1 antes de tocar la capa Steam** (App ID, página, cápsulas) — no adelantar esos pasos aunque parezcan rápidos.
- Precio objetivo: **$4.99** con descuento de lanzamiento 10-15%.
- Stack: Electron + Three.js + TypeScript + Vite sobre el boilerplate original (solo render + empaquetado). Todo el gameplay es código propio en `src/` — no asumir nada que no esté ahí.

---

## Estado operativo histórico (2026-08-06) — `codex/map-2` **0.13.13** (SUPERSEDED)

> ## HISTÓRICO — el rig de mapas cortos ya está apagado
>
> En este snapshot **`DEV_TOOLS.shortMaps = true`** y las runs duraban 4 minutos. En el estado vigente es `false`. Rig de
> validación temporal para probar el arco completo rápido. Implicaciones:
>
> - **Cualquier medición hecha ahora está distorsionada.** Densidad, oro, nivel,
>   XP y todos los umbrales de contratos asumen 10 minutos. No calibres nada, no
>   corras `pnpm stats` contra estas runs, y no las trates como datos.
> - **No se puede empaquetar** mientras esté encendido: `check-release-flags.mjs`
>   aborta `pnpm package` a propósito.
> - **Revertir = `DEV_TOOLS.shortMaps` a `false`** en `src/config.ts`. Nada más;
>   `SHORT_RUN_DURATION_S` queda inerte.
>
> **Antes del congelado del build hay que revertirlo.**

> ## ⚠️ Trampa de rama compartida (mordió el 2026-08-06)
>
> Las tres ramas comparten UNA carpeta y UN `dist/`. Si alguien cambia de rama
> mientras otro juega, se compila y se juega la rama equivocada **sin ningún
> aviso**: pasó de verdad — se jugó el bundle de `codex/map-2` creyendo que era
> la Demo, y apareció un Mapa 2 que esta rama no tiene en su código.
>
> **Verificación de 2 segundos antes de fiarse de una sesión de juego:**
> `grep -l "megafactory" dist/assets/*.js`. En ESTA rama (`codex/map-2`) DEBE
> coincidir — si no, el bundle es el de la Demo. En la rama Demo es al revés.
> `git worktree` lo resuelve de raíz (una carpeta por rama); PROPUESTO, no hecho.
>
> **Y revalida la rama al RETOMAR trabajo, no solo al empezar.** Esto ya costó un
> commit en la rama equivocada el 2026-08-06: el árbol se movió entre turnos.

### Cambios del 2026-08-06 (0.13.6 → 0.13.13)

- **🔑 REGLA NUEVA: el BOSS despeja el sector, no el reloj.** Antes, llegar a
  10:00 terminaba la run como `sector-cleared` hicieras lo que hicieras, así que
  el portal no tenía ningún tirón — **0 de 6 runs humanas invocaron un boss** con
  la flecha señalándolo todo el rato. En ESTA rama la regla cae en el CRÉDITO:
  `RunFlowState.mapBossDefeated` gatea `sectorsCleared += 1` y se resetea en cada
  transición. La run nunca se corta: sobrevivir el reloj sigue avanzando de mapa,
  solo que sin crédito. (La Demo aplica la misma regla al DESENLACE, porque no
  tiene `run-flow`: allí sale `Sector Held`.) **Consecuencia deliberada, con test
  y comentario:** saltarse el boss del Mapa 1 y matar solo al final cierra el
  último sector pero NO el arco → `Sector Cleared` en vez de `Run Complete`, y los
  contratos de `complete-runs` no cobran. **`second-wind` es más difícil aquí que
  antes**: exige los DOS bosses, no solo el final.
- **Portal encontrable:** el indicador dice **BOSS**, no `TOTEM`; el modelo pasa
  de `voxelSize` 0.12 a 0.16; y su haz, su anillo de aviso y su pilar provisional
  **derivan del modelo** (`portalScale()` en `boss.ts`), así que agrandar el
  portal ya nunca deja atrás su propia luz. `BOSS.totemColliderRadius` sigue en
  config a mano (es física, no visual). **PENDIENTE: la distancia
  (`totemDistMin/Max` 45-65) no se tocó** — si el playtest vuelve a dar 0 bosses,
  el problema es ese y no el tamaño.
- **Guardado a prueba de cortes** (`electron/safe-save.ts`): escritura atómica
  (temp → fsync → rename) y cargas corruptas movidas a `.corrupt-<ts>` en vez de
  leerse como "no hay save" y ser machacadas por el siguiente autoguardado. Antes,
  un corte de luz mientras guardaba borraba en silencio todo el progreso.
  Cubierto por `test:safe-save`.
- **Pantalla completa a la resolución del jugador.** El default era el literal
  `1280x720` contra una lista de tres tamaños 16:9 fijos, así que 1440p/4K/
  ultrawide no tenían entrada y `normalizeSettings` los empujaba a 720p. Ahora la
  lista se deriva de la pantalla, el nativo siempre está, y los tamaños se
  guardan en píxeles físicos divididos por `scaleFactor` antes de Electron (DIP).
  Cubierto por `test:display`.
- **`pnpm test` agregado (102 aserciones, ~7s) + `pnpm test:all`.** Había 17
  scripts `test:*` y ningún agregado, así que cada cambio se comprobaba solo
  contra el test que uno recordara. **Córrelo antes de cada commit.**

### Juicio de Contratos (2026-08-06, dos jueces ciegos)

**El mecanismo está bien hecho** (colas, escaleras, IDs, settlement idempotente)
pero **apuntaba mal**: los premios de más peso estaban detrás de un boss que nadie
peleaba. La regla del sector + el portal encontrable atacan justo eso.

Abierto, NO tocado:
- `boss-hunter` (5 bosses → socket de arma) es el ÚNICO que da socket de arma.
  **OJO: `bossesDefeated` es acumulado de CARRERA, no por run** (`profile.ts:150`).
- `proving-ground` está activo y desbloquea Rack Hauler; el catálogo queda en 29 contratos declarados / 28 activos / 1 latente.
- Umbrales literales `n: 1` en `contracts.ts`; `CONTRACTS.fullRunSectors` y
  `twoOfAKindCharacters` declarados y jamás leídos.
- Ningún contrato tira del chatarrero (0-1 compras en 4 de 6 runs).
- La pantalla de resultados suena en SILENCIO justo donde está el botón de
  Wishlist. **Se arregla sin música nueva**: la cama de menú ya está precargada.

### Trailer

Plan en `docs/TRAILER_V1_PLAN.md`. Música RESUELTA; no hace falta generar nada
más. Cerrado por el usuario el 2026-08-06: `DEMO COMPLETE` descartado, feedback de
fin de sector descartado, accesibilidad fuera de la v1. **El payoff sigue siendo
`Sector Cleared`, pero ahora significa que el boss murió.**

---

## Estado histórico (2026-08-04) — `codex/map-2` **0.12.6** recording-safe; `main` Playtest **0.10.5-beta**

**REGLA DE VERSIONADO (usuario 2026-07-25, formato visible fijado 2026-08-01): antes de CADA commit se sube `version` en `package.json` según SemVer y se escribe esa versión en el asunto del commit.** No es decorativo: `__APP_VERSION__` conserva el valor SemVer crudo y se estampa en cada registro de run como `buildVersion`; el menú deriva `__APP_DISPLAY_VERSION__` con el número primero y la etiqueta después (por ejemplo, `0.10.2 Beta`). Un commit que cambia comportamiento sin subir versión hace que esos registros mientan.

- **Estado externo:** el handoff y la creación de la página son hechos históricos. El estado actual de revisión y disponibilidad pública requiere confirmación externa. Steam App ID `4979220` está verificado y se preserva.
- **Límite de lo confirmado:** no afirmar resultado, fecha de aprobación, publicación ni Coming Soon sin confirmación externa actual. El App ID `4979220` sí puede citarse como dato verificado.
- **Alcance de “v1 cerrada”:** se cerró la v1 del paquete de medios/copy y del handoff de la página; **NO** la versión completa del juego, que sigue el orden de `docs/ROADMAP_STEAM.md`.
- **Rigs temporales de captura CERRADOS (2026-07-17):** `RECORDING.levelUpDraft.enabled=false`, ambos flags de `RECORDING.chestTesting=false` y `GOLD.startingGold=0`. No queda ningún override de captura activo.
- **Material final conservado:** 9 screenshots en `art/steam/screenshots/`, 9 GIFs en `art/steam/gif/`, store/library/social assets y masters aprobados en `art/steam/image/`, copy/brief en `art/steam/info/` y manifiesto en `art/steam/STEAM-MEDIA-MANIFEST.md`. El cofre verde cubre la recompensa; no falta un cofre dorado.
- **Limpieza posterior COMPLETADA con aprobación 1 a 1:** se eliminaron backups, duplicados, temporales regenerables y builds obsoletas. Se retuvieron `assets/preview/` como contexto, `art/concept/`, `tmp/quantize-portal.mjs`, `tmp/perf-400-output/`, los assets finales, las builds v0.1.1 y la última grabación raw `art/video/2026-07-16 17-32-04.mp4`.
- **Fase 3 — COMPLETADA 2026-07-17:** pausa, Settings v3, menú principal con versión leída de `package.json` y desglose final de daño real por arma están cerrados.
- **HISTÓRICO — Foundation de audio, avance 2026-07-18/19:** este registro conserva la secuencia de integración inicial (~28 eventos y el primer lote de armas), pero ya no describe el catálogo vigente. Audio v1 está aceptado; Hazard Marshal tiene cues propias y `SOUND_EVENT_CATALOG.md` manda sobre cobertura, silencios conocidos y trabajo futuro. La pasada de cohesión/balance global sigue pendiente para el contenido final.
- **✅ HIGIENE DE RELEASE + COBERTURA (2026-07-25, v0.1.1→v0.2.0):** el panel dev "Unlocks / Unlock everything" y las teclas F2-F9 de audición **llegaban a builds de producción**. Ahora los gatea `DEV_TOOLS` en `config.ts`, y `tools/check-release-flags.mjs` corre como hook `prepackage` que **aborta el instalador** si algún flag de dev, override de `RECORDING` o `showFps` sigue encendido. `pnpm test:smoke` juega una run real por arma inicial en Electron (perfil aislado, nunca toca el save real) — primera cobertura automatizada del proyecto. NO gatear `?audioBenchmark`: `electron/main.ts` ya exige `app.isPackaged` + flag de CLI, y hacerlo rompería el benchmark del build empaquetado del que dependen los requisitos de sistema.
- **✅ PERFIL PERSISTENTE + CONTRATOS (2026-07-25, v0.5.6) — el motor de retención está vivo.** Spec completa en `PRD.md` §"Perfil persistente y Contratos". Titulares: `ACCOUNT` renombrado a **`PROFILE`** (chocaba conceptualmente con la clase `Progression` de progresión dentro de la run) y persistido en `userData/profile.json`; ledger de carrera `LIFETIME` aparte del historial **porque el historial se corta en 250 runs**; historial movido a `userData/run-history.json` legible por herramientas, con migración al arrancar; ~26 contratos (firma + escaleras con colas ordenadas) cubriendo 6 armas / 10 cores / 5 mods / 3 sockets. **Los umbrales son placeholders anclados a UNA run** — se calibran con `pnpm stats` (percentiles, nunca promedios) cuando haya decenas de runs humanas. Herramientas nuevas: `test:smoke`, `stats`, `reset:profile`, `check:release-flags`.
- **Trampas de datos que costaron tiempo y conviene no repetir:** (1) `localStorage` es **por ORIGEN** — jugar en navegador (`pnpm dev`) guarda en un almacén que las herramientas no pueden leer, y un build empaquetado escribe bajo `file://`; para que los datos sirvan hay que jugar desde Electron. (2) Una run **solo se registra si TERMINA** (muerte o 10:00); salir al menú desde la pausa no guarda nada — así se perdieron casi todos los playtests previos. (3) `dist/` y `release/win-unpacked/` se quedan viejos si se trabaja contra el dev server: **lo que se juzgue desde un arranque empaquetado o `file://` hay que reconstruirlo antes** (`pnpm electron:start` lo hace en un paso).
- **✅ PASE DE PULIDO VISUAL Y DE FEEL (2026-07-26, v0.5.6→v0.6.2), todo salido de playtests reales del usuario:** marcadores de suelo (jugador, élite, boss) que ya **pasan por delante de la escenografía y por detrás del personaje** — antes los contenedores los cortaban en bloques grises y el anillo se pintaba sobre el cuerpo del boss · el "glow" del jugador pasó de disco de borde duro a caída radial real · la ruleta del cofre ya **nunca muestra dos mods iguales seguidos** (la tira ciclaba el pool y pegaba el premio al final: 1 de cada 4 aperturas terminaba en pareja; y gold, con un solo mod, mostraba 19 celdas idénticas) · **Volt Pulse 2.4→1.4s de cooldown** (su daño no era el problema: necesita ~4 enemigos en el radio solo para igualar a Bolt, densidad que no existe al empezar; el coste real era el aire muerto). El reset de perfil además **no reseteaba**: la migración de historial reimportaba las runs viejas desde localStorage en cada arranque, ahora es de una sola vez con marcador.
- **📊 PRIMERAS 6 RUNS HUMANAS (2026-07-26) — lo que muestran, con la advertencia de que están repartidas en 4 builds distintas y no sirven para fijar umbrales:**
  - **0 bosses invocados en 6 runs**, incluidas las 2 que llegaron a 10:00. El portal es opcional y está a 45-65 unidades: nadie lo busca. Bloquea `First Blood`, `Boss Hunter` y con él **el único socket de arma** — el perfil de prueba está en 4/4 sockets de core y 1/2 de arma.
  - **Tire Fire está en otra liga**: 2.187 kills / nivel 41 frente a 550 / nivel 22 de Bolt en runs completas equivalentes, y eso que Bolt tenía el DOBLE de sockets de core. Acumula el 74% del daño de toda la carrera.
  - **Las runs son binarias**: se muere antes de los 3 minutos (76s, 94s, 154s, 291s) o se llega a los 600s. No hay término medio, así que la mediana no describe ninguna partida real. Solo 33% de finalización.
  - El chatarrero (primera visita 2:00) **apenas existe** en la mitad de las runs: 0-1 compras en cuatro de las seis.
- **Current full-game sequence:** human runs, balance, and retention → cohesion pass for new audio → Steamworks/technical close. The three launch characters, the current Foundry replacement slice (Furnace Mite, Axle Runner, Slagcaster), and the current Foundry ambient visual state are closed; molten-flow glow and voxel sparks are optional future enhancements, while deferred enemy expansion is not part of this sequence. Hazard Marshal already has its baseline closed in 0.22.0; fine balance and an optional reactive arena remain deferred. The Demo does not extend this arc. **The multiplayer feasibility gate remains deferred to post-launch by user decision**; multiplayer/co-op is neither implemented nor announced. **Internal Demo RC target:** end of August 2026; this is not a public date, availability promise, or review confirmation. External claims still require current confirmation. Leaderboards remain planned for the full game and are not implemented.

---

## Historial — spec original del Día 1 (superseded)

Se conserva por contexto, ya NO es la especificación vigente — `PRD.md` y `ROADMAP_STEAM.md` mandan sobre esto. Ejemplos de lo que cambió: "3 tipos de enemigo" → 6 tipos + 2 bosses; "sin meta-progresión" → roadmapeada (Fase 5-6); "3-4 armas" → 11; "itch.io el mismo día" → plan de Steam completo.

Concepto original: Vampire Survivors-like en 3D retro low-poly, presentación como diferenciador. Ambientación original: industrial/scrap con geometría primitiva — superseded por "juguete industrial" + arco futurista. Fases originales (MVP 1 día): escena+jugador+cámara → enemigos+IA+spawner → armas+XP+upgrades → timer+dificultad+rendimiento — ya completadas y superadas. Fuera del MVP original (ya no todo aplica): meta-progresión (roadmapeada), múltiples personajes (bocetados, roadmapeados), obstáculos (implementado), sonido (roadmapeado), modelado 3D custom (roadmapeado vía `PROMPTS_IMAGENES.md`).

## REGLA PERMANENTE de audio — latencia cero (2026-07-18, orden directa del usuario)

**Todo SFX debe sonar EXACTAMENTE en el frame de su acción/animación — un sonido tarde "queda fatal" y es peor que el silencio.** Implicaciones técnicas no negociables: (1) TODAS las variantes de TODOS los eventos habilitados se precargan y decodifican ANTES de poder sonar (`AudioDirector.preload` calienta el manifiesto entero del evento, nunca una variante suelta); (2) tras `audio.reset()` SIEMPRE se re-precarga (`preloadEnabled`); (3) cero `await` entre el gesto/acción y el `emit` — `activateFromUserGesture` retorna síncrono si el contexto ya corre; (4) sonidos ligados a animaciones (cofre, level-up) se cronometran contra las constantes REALES de la animación (duración de transición CSS, bezier, steps) — si la animación cambia, el asset se regenera.

## REGLA de estilo de audio — NADA retro (2026-07-18, usuario)

**Ni la música ni los SFX pueden sonar retro/antiguo**: nada de chiptune, 8-bit, láseres de onda cuadrada arcade ni bitcrush evidente. Sonido MODERNO. El proceso histórico fijó primero el estilo musical y después llevó los SFX a ese idioma conservando gestos y timings validados. Audio v1 ya fue aceptado: los WAV activos no son placeholders por defecto. Las ampliaciones siguen el catálogo vigente, receta determinista, integración explícita y veredicto in-game; la cobertura completa de regeneración canónica continúa siendo deuda de pipeline.

## Estado histórico del audio (2026-07-18 — SUPERSEDED por `SOUND_EVENT_CATALOG.md`)

Sesión de búsqueda de estilo completada (17 rondas validadas 1 a 1 in-game). **12 eventos sonando**: bolt "brrt" eléctrico (peak 0.78), muerte = explosión de cubitos (modal dice-knocks, 0.33, cooldown 0.16s), pickups XP/oro (números acumuladores que siguen al player), UI universal (listener delegado en captura), level-up 2 tiempos (fanfarria en la ventana de 0.72s del texto + bloom del draft), cofre 3 actos (pestillo → riser con ticks resueltos de la bezier real → reveal montado en la subida del icono), tienda (`panel-open` comparte bloom) y música "Neon Horizon" provisional (`AUDIO.music.runLoopVolume`). Servido desde `public/assets/audio/prototypes/manifest.json` + `AUDIO.validation.enabledEvents`; generadores DSP deterministas `tools/audio/prototype-*.mjs` (motor `dsp.mjs`); ElevenLabs en `elevenlabs-sfx*.mjs` (key en `.env`, gitignored). Teclas F2-F9 de audición TEMP (`auditionKeys`). El pack viejo `assets/audio/sfx/` sigue siendo fixture rechazado (`paths.finalManifest`) — no borrar. **Música de menú**: "Neon Swarm (4)" cableada como `menu-music.mp3` (evento `menu-music`, loop keyed, arranca al primer gesto en el menú por autoplay policy, handover a la cama de run al darle Play; `AUDIO.music.menuLoopVolume` compensa el duck). **Álbum/DLC**: carpetas por pista en `tmp/music-prototypes/` (Neon Horizon · Molten Circuit · Chrome District · Overcharge · Assembly Line · Menu · Trailer), cada una con su `PROMPT.md` copy-paste para Suno; plan completo en `docs/MUSIC_PROMPTS.md`. **Limpieza 2026-07-19**: public/prototypes reducido a los 35 archivos vigentes del manifiesto; en `tools/audio/` sobreviven solo `dsp.mjs` + los 4 generadores de los sonidos EN USO (r9 modern, r13 pickups, r15 bolt, r17 muerte) + `elevenlabs-sfx-v2` + el pipeline/benchmark original. Siguiente: 10 hooks mudos (player-hit, boss, resultados...) → llenar las camas del álbum → catálogo completo en Fase 5 (todo listado con briefs en `SOUND_EVENT_CATALOG.md`).

**Sesión de armas 2026-07-21 (SFX por arma):** las **5 armas de inicio** (bolt, pulse, press, tire, blades) ya tienen sonido, más **welder** (bloqueada, adelantada por reutilizar la infra de loop). **Blades** = rev one-shot + loop continuo sin costuras (`blades-loop`, respira) + hit metálico de cizalla (`blades-hit`; lección: un "corte" es cizalla de RUIDO resonante, no un timbre modal — el modal suena a cristal, mismo fallo que el ricochet). **Welder** = rayo de energía épico (`welder-beam`, loop; el fix de "sonaba cutre" fue añadir `saturate`+`compress` como el resto de la paleta + un núcleo tonal). **Tire** rehecho v2 = neumático ARDIENDO rodando (fuego + goma pesada + doppler), no un resorte. **Infra nueva de loops sfx** (patrón para toda arma continua): `AudioEvent.bus`, `CombatCtx.startWeaponLoop/stopWeaponLoop/weaponHit`, `WEAPON_LOOP_SFX` con volumen por arma, `WEAPON_HIT_SFX`; suspensión de loops y **duck de música bajo TODOS los overlays in-game** (pausa/level-up/cofre/tienda/game-over) dirigidos desde `game.frame()` por estado. **Bug arreglado:** re-ataque rápido de un loop se quedaba mudo (`stopLoop` liberaba la key tarde). **Review de distintividad hecho** (loops = mayor riesgo de fusión; welder rediseñado para separarlo de blades). **PENDIENTE PRIORITARIO:** revisión de niveles de volumen de TODOS los SFX (unos bien, otros altos/bajos) — juzgar in-game sobre música al ~50%. **Faltan 4 armas** (todas de contrato, one-shots periódicos): oil, acid (con loop de charco), turbine, dismantler. Detalle por sonido en `SOUND_EVENT_CATALOG.md`.

**Sesión de armas 2026-07-22:** cerradas **dismantler** (zarpazo pesado + triple desgarro de RUIDO resonante; el golpe/sub enmascaraba el desgarro → se subió el desgarro), **turbine** (v1 aireado de viento RESTAURADO tras rechazar el v2 "vórtice eléctrico"; + **loop de rugido de viaje** que acompaña al tornado) y **acid** (lanzamiento: lob→estallido→fizz+burbujas; + **loop de sizzle de charco**). **REGLA NUEVA — sonido por distancia en el mundo (`world-distance-audio-rule` en memoria):** los sonidos que ocurren LEJOS del jugador se atenúan con la distancia (más lejos = más bajo); los disparos centrados en el jugador van a volumen pleno. Infra: `AudioDirector.setListener(px,pz)` cada frame + `emit({pos})` para one-shots (`AUDIO.spatial`, con piso de volumen) + `setWeaponLoopVolume`/`setLoopVolume` para loops. Aplicado: acid-throw y dismantler-swipe (one-shots lejanos), acid-loop y turbine-loop (loops al más cercano). **Naming:** "tornado" (user-facing) → **"vortex"** porque se leía como español; verificado que NO hay texto español en el juego (src/dist/asar todo inglés). **Faltan solo:** oil (en veremos si se descarta, ver `oil-weapon-removal-consideration`) — todas las demás armas con sonido. Sigue pendiente prioritario la **revisión global de niveles de volumen**. Follow-ups del dismantler anotados (daño base alto + visual de 3 líneas simple).
