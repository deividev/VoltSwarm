# PLAN — Bloque Mapa 2 (Swarm Foundry): transición · visual · Hazard Marshal

> **Current decision 2026-08-25:** Step 0 and Workstreams 1, 3, and 4 are CLOSED. Hazard Marshal has an accepted gameplay baseline in candidate 0.22.0. Workstream 2 retains only molten-flow glow and voxel sparks. The current enemy replacement slice—Furnace Mite, Axle Runner, and Slagcaster—is CLOSED; all further enemy expansion is deferred. Per-map sky/fog and the base walled arena are done.
> Alcance: cerrar la run completa **Mapa 1 (10 min de oleadas + gate de boss) → transición → Mapa 2 (10 min de oleadas) → Hazard Marshal (jefe final, 3 fases)**.
> Rama de trabajo: `codex/map-2`. Config titula el mapa como **"Swarm Foundry"**. La Demo vive separada en `codex/demo-map1` (`0.13.39-demo`); no se portan Mapa 2 ni Hazard Marshal.
> Fuente de verdad de orden: `docs/ROADMAP_STEAM.md` §"Bloque Mapa 2 + Hazard Marshal". Este doc conserva el desglose y la historia de implementación.

---

## Paso 0 — DECISIONES a cerrar ANTES de tocar código

No son burocracia: cada una cambia qué se implementa. Marcar cuando el usuario las cierre.

- [x] **0.1 Regla del gate de transición — CERRADA 2026-08-15.** Cruzar al Mapa 2 exige **AMBAS** condiciones: derrotar **al menos 1 boss** en el Mapa 1 **y** aguantar los **10 min completos** de oleadas. Se modela como contrato del arco (dos condiciones en AND).
  - **Consecuencia a resolver (sub-decisión abierta, ver 0.7):** con AND, la run necesita garantizar que el jugador pueda invocar y matar un boss DENTRO de la ventana — las 6 primeras runs humanas invocaron **0 bosses** (portal opcional a 45-65 unidades). El gate ya no tolera un boss "opcional": hay que forzar/garantizar su aparición y accesibilidad.
- [x] **0.2 Techo de dificultad — CERRADA 2026-08-15. Opción (a).** El Mapa 2 tiene su **propio reloj 0→10** y su **propia curva de dificultad con base más alta** que el minuto 0 del Mapa 1: empieza duro pero recupera rampa (no llega plano). Resuelve de paso los acoplamientos de 0.3: la XP se reescala contra la oleada del Mapa 2 y los precios de economía escalan contra el minuto propio del Mapa 2. Aísla al Mapa 1 de recalibración. Implementación: `difficultyScalar` parametrizado por mapa en `config.ts`, sin hardcodear.
- [x] **0.3 Qué se conserva al cruzar — CERRADA 2026-08-15.**
  - **Build** (armas/cores/mods/sockets): se conserva.
  - **Vida**: se **cura al 100%** al entrar al Mapa 2 (la transición es premio, no castigo).
  - **Oro**: **empieza de 0** — la economía del Mapa 2 arranca limpia.
  - **Nivel**: se **conserva** y se sigue subiendo desde el nivel alcanzado.
  - **Curva de XP**: se **reescala alineada con la oleada** del Mapa 2 (el coste de XP acompaña la presión del mapa, no la del Mapa 1). **Acoplada a 0.2**: la curva de dificultad por mapa alimenta este reescalado.
  - **Descartes de level-up restantes**: se **conservan**.
  - **Coupling económico (a resolver en 0.2):** con oro a 0, el chatarrero y los precios del Mapa 2 escalan con el "minuto de run" — hay que definir si el reloj del arco continúa (min 10→20) o el Mapa 2 tiene su propio reloj (0→10). Misma decisión que alimenta la dificultad y el reescalado de XP.
- [x] **0.4 Reparto y duración del arco — CERRADA 2026-08-15.** **Reinicio total desde el Mapa 1**, sin checkpoint: morir o fallar el gate manda a empezar el arco entero de nuevo (puro al género; los **contratos** son la red de seguridad meta que avanza aunque se pierda la run). **Reparto 10+10** (el Mapa 1 ya está tuneado a 10 min); revisable solo si los datos humanos muestran que el arco de ~20 min + boss es demasiado largo. Riesgo de retención asumido conscientemente, a vigilar con el campo `map` de muerte (0.6).
- [x] **0.5 Map 2 enemy slice — CLOSED 2026-08-25.** The production slice is Furnace Mite, Axle Runner, and Slagcaster. Furnace Mite and Axle Runner retain their measured gates; Slagcaster is final by explicit user acceptance and has no claimed 400+ result. Forge Dart, further Rustbrute/Drone replacements, Arc Courier, and any other expansion are deferred until a future scope decision.
- [x] **0.7 Interacción del gate AND — CERRADA 2026-08-15.**
  - El gate se presenta como **misión visible en pantalla** durante todo el Mapa 1: "invoca y derrota al boss + aguanta los 10:00 para avanzar", con el estado de las dos condiciones (boss ✓/✗ · tiempo).
  - **Sin muerte súbita ni boss forzado.** El Mapa 1 termina en su corte natural de 10:00 (o al morir antes). En el corte se evalúa: **vivo + ≥1 boss derrotado → cruza** al Mapa 2; **cualquier otro caso → run cortada sin cruce**.
  - **Fin sin cruce = pantalla de resultados/muerte estándar** (reusa `src/defeat-transition.ts` + la pantalla de resultados), con los datos de la run y una **indicación clara de que no se completó el objetivo pedido** (p. ej. "Objetivo no completado: falta derrotar al boss"). Política de reintento del arco = 0.4.
  - Matar el boss antes de 10:00 **no acorta** el Mapa 1: se sigue jugando hasta el corte; el cruce solo se habilita al cumplir ambas condiciones.

- [x] **0.8 Estructura del clímax del Mapa 2 — CERRADA 2026-08-15.** El Hazard Marshal es el **jefe final fijo** del arco: entra **al terminar las oleadas del Mapa 2 (su minuto 10)**, no por portal opcional como el gate del Mapa 1. La curva propia del Mapa 2 (0.2) alcanza su pico justo al entrar el boss, dando un handoff limpio de tensión. **Resuelto 2026-08-19 (decisión del usuario): durante la pelea NO entran oleadas normales — solo los refuerzos de la Fase 2.** Además el sector se reinicia como arena al agotarse el reloj: campo limpio, jugador al centro y props con el centro vacío. Sin la pausa del spawner ese reinicio duraría veinte segundos, porque en el pico la fundición rellena hacia ~437 cuerpos.

**Instrumentación irrecuperable — hay que meterla ANTES de la primera run del Mapa 2:**
- [x] **0.6 Campo `map` en el registro de muerte — HECHO 2026-08-15.** Al revisarlo, la mitad ya existía en esta rama: `RunSnapshot.map` (`{id,number,title}`) + `mapsReached`, y `game.ts` graba `map: this.currentMap` (getter que deriva de `runFlow.mapIndex`), así que **la atribución de muerte por mapa ya era correcta** (una run que muere en el Mapa 2 graba `megafactory`). Lo que faltaba y se añadió: **`pnpm stats` (`tools/run-stats.mjs`) ahora segmenta por el mapa en el que terminó la run** — conteo, outcomes y distribuciones de duración/kills/nivel, con los registros sin `map` en un bucket aparte (nunca plegados al Mapa 1). Verificado contra datos reales: 89% de runs terminan en el Mapa 1, 11% ya alcanzan el Mapa 2 (1 arco completo).

---

## Workstream 1 — Transición Mapa 1 → Mapa 2 ✅ COMPLETADO 2026-08-16

> **HISTÓRICO:** el log siguiente conserva el offset y los flags usados durante
> la implementación. La dificultad vigente está en Workstream 4 y en el bloque
> de estado inicial; no reconstruir el offset provisional.

> **CIERRE 2026-08-16 (v0.13.40 → 0.13.47).** El arco Mapa 1 → Mapa 2 obedece las decisiones del Paso 0 de punta a punta y la transición está animada con imagen y sonido.
>
> **Lo entregado:** stats segmentada por mapa (`0.13.40`) · vida 100% + oro 0 + pantalla `OBJECTIVE FAILED` al fallar el gate (`0.13.41`) · `difficultyOffsetS: 240` para el Mapa 2 + flag `simulateMap1Handoff` (`0.13.42`) · transición animada con estado `map-transition` (`0.13.43`) · tecla dev **T** que salta a la transición con build grabada (`0.13.44`) · fundido de música atado a la misma curva (`0.13.45`) · duración 1.55s → **2.8s** tras playtest (`0.13.46`) · entrada escalonada del nombre del sector al negro pleno (`0.13.47`).
>
> **Cómo probarlo sin jugar 10 min:** `DEV_TOOLS.mapTransitionKey = true` → tecla **T** en una run. `DEV_TOOLS.simulateMap1Handoff = true` arranca directo en el Mapa 2. Ambos gateados: `check-release-flags.mjs` aborta el `package` si quedan encendidos.
>
> **Deuda consciente que queda (no bloquea los Workstreams 2/3):** un **sting** propio de transición y **camas de música por mapa** (hoy una sola cama de run) = pendiente **0c del roadmap**, requiere assets nuevos · validar en playtest que el tótem del boss es alcanzable de forma fiable dentro de los 10 min (1.12).
>
> **HALLAZGO 2026-08-15:** la lógica central del arco YA existe en `src/run-flow.ts` (verificado). `advanceRunFlow` implementa el gate (`end-run` con `reason: 'boss-required'` → run cortada si no cae boss, exactamente 0.1/0.7), la `transition` entre mapas y el `start-finale` del boss al acabar el último mapa (0.8); `game.ts` la consume (~líneas 1207-1222) y actualiza `currentMap`. `MAPS` en `config.ts` ya define los 2 mapas (`scrapyard`, `megafactory`/"Swarm Foundry"). Por tanto varios ítems de abajo NO son lógica nueva sino **cableado/UX**; **re-scopear cada uno contra la rama antes de tocar nada** en vez de reconstruir lo que ya está. Lo que casi seguro falta es la capa visible: misión en HUD (1.2b), pantalla "objetivo no completado" (1.2c), y confirmar que el handoff (vida 100%, oro 0, XP reescalada) coincide con 0.3.

Depende de: 0.1 (cerrada), 0.2, 0.3, 0.6 (hecha), 0.7.

**Ya implementado en la rama (verificado 2026-08-15) — NO reconstruir:**
- [x] **1.1 Máquina de estados del arco** — `run-flow.ts` + consumo en `game.ts` (~1207-1222): `transition`, `end-run` (gate) y `start-finale`.
- [x] **1.2 Misión en HUD** con las dos condiciones — `hud.ts:435-438` ("Survive until time expires" + "Defeat the boss to unlock the next sector").
- [x] **1.3 Mecánica de transición** — `transitionToMap()`: cambia el mundo (`worldMaps.setMap`), limpia props/enjambre, banner `MAP 2: SWARM FOUNDRY`, telemetría.
- [x] **1.4 Atribución de muerte + stats por mapa** — 0.6, cerrado hoy.

**Divergencias con las decisiones de hoy (la rama es ANTERIOR a ellas) — esto es el Workstream 1 real:**
- [x] **1.5 Vida al cruzar (0.3 = curar 100%) — HECHO 2026-08-15.** `transitionToMap()` ahora hace `this.player.hp = this.player.maxHp` al cruzar.
- [x] **1.6 Oro al cruzar (0.3 = empezar de 0) — HECHO 2026-08-15.** `transitionToMap()` ahora hace `this.gold = 0` + `hud.updateGold(0)`.
- [x] **1.7 Curva de dificultad por mapa (0.2) — HECHO 2026-08-15 (valor provisional).** El mecanismo ya existía (`combatElapsedS = difficultyOffsetS + mapElapsedS`, game.ts:1289); solo faltaba el número. Fijado `MAPS.megafactory.difficultyOffsetS = 240` → el Mapa 2 abre en la intensidad del ~min 4 del Mapa 1 y rampa hasta el cap de 8 min, sin ser un clon. Provisional, a tunear con la stats segmentada por mapa (0.6). Interacción conocida: `difficultyScalar` capa a 480s, así que un offset ≥480 dejaría el Mapa 2 plano al máximo.
- [x] **1.8 Pantalla "objetivo no completado" (0.7) — HECHO 2026-08-15.** `endRun` propaga `reason`; `showEnd` pinta título `OBJECTIVE FAILED` + subtítulo "Defeat a boss to unlock the next sector" SOLO en el fallo del gate (la muerte por HP no cambia).

**Por confirmar (aún no verificado):**
- [x] **1.9 Reescalado de XP — RESUELTO POR CONSTRUCCIÓN 2026-08-15, sin código.** `xpForLevel(level)` depende solo del nivel (`4 + level*2.5 + level^1.4`), no del tiempo/mapa; el valor de orbe es un mult global fijo (`XP_ORBS.valueMult`). El nivel se arrastra y el Mapa 2 (más denso) suelta más orbes → subir "alineado a la oleada" pasa solo. No existe ni hace falta una curva de XP por-mapa. Confirmar el feel en playtest.
- [x] **1.10 Descartes de level-up — YA CORRECTO 2026-08-15.** `discardsLeft` se fija al arrancar (`game.ts:589`) y solo decrementa al descartar; nada lo resetea en la transición → se conserva.
- [x] **1.11 Beat de transición (visual) — HECHO 2026-08-15.** Estado `map-transition` que espeja a `defeat-transition`: cortina de fundido (`#map-fade`) fade-out → swap del mundo al negro pleno (invisible) → hold sobre "ENTERING SWARM FOUNDRY" → fade-in → resume. Timing en `config.MAP_TRANSITION` (0.5 / 0.45 / 0.6 s). Los loops de SFX se auto-silencian durante el estado y el salto de cámara queda oculto tras el negro. **Audio del fundido HECHO 2026-08-15:** la música cabalga la MISMA curva que la cortina (`setLoopVolume('foundation-run-loop', runLoopVolume * (1 - opacity))`), silencio al negro pleno y vuelta al aparecer el mapa nuevo; aterriza exacto en el nivel de run al terminar. Los loops de armas ya se auto-silencian fuera de `playing`. **Sigue pendiente (no bloqueante):** un **sting** propio de transición y el crossfade entre CAMAS distintas por mapa (hoy hay una sola cama de run) = pendiente **0c del roadmap**; requiere asset nuevo en el manifiesto + `AUDIO.validation.enabledEvents`. Verificado por typecheck + `vite build`; falta la validación visual en Electron (el panel Browser no puede correr el juego).
- [~] **1.12 Accesibilidad del boss — SATISFECHO POR DISEÑO 2026-08-15; queda chequeo de playtest.** El tótem aparece al arrancar y al tocarlo invoca un boss (`boss.ts`); la misión en HUD ahora lo señaliza. NO forzado a propósito (elección del jugador → si no, "objetivo no completado", 0.7). Los "0 bosses" eran del estado viejo sin misión. Pendiente solo: validar en playtest que el tótem es alcanzable de forma fiable dentro de los 10 min.

**Tooling de desarrollo:**
- [x] **1.13 Flag `DEV_TOOLS.simulateMap1Handoff` — HECHO 2026-08-15.** Arranca la run directo en el Mapa 2 con la build de la última run grabada superpuesta (reusa `applyRecordedBuild`, extraído del boss lab), como si se hubiera cruzado desde el Mapa 1 (vida llena, oro de arranque, build+nivel). Gateado por `DEV_TOOLS`; verificado que `check-release-flags.mjs` aborta el `package` si queda encendido. Permite playtestear el Mapa 2 sin jugar el Mapa 1.

---

## Workstream 2 — Pase visual del Mapa 2 (Swarm Foundry)

> **STATUS 2026-08-25.** Floor, props, perimeter, cover, per-map sky/fog, the
> base walled arena, and the current enemy slice are closed. Only **2.5**
> (ambient molten-flow glow and voxel sparks) remains. A reactive/modular arena
> is optional and does not reopen the boss.

Objetivo del usuario: que **no parezca otro juego**. Alinear props y ambiente con el lenguaje del Mapa 1 (misma familia voxel, mismos materiales `litMaterial()`, misma dirección de silueta) pero en el tema **fundición** del arco de arte (chatarrería → **fundición** → ciudad neón, `DIRECCION_ARTE.md`).

- [x] **2.1 Auditoría de contraste con Mapa 1 — HECHA por medición, no por comparación lado a lado.** El hallazgo que la cerró: el suelo procedural estaba en luminancia media ~39 y el carboncillo de las torres en ~31.5, un ratio de **1.10:1** — las estructuras del perímetro eran prácticamente invisibles contra su propio suelo, y los props también.
- [x] **2.2 Paleta y suelo de fundición — HECHO (0.13.53).** Textura raster cenital propia (`ground-megafactory-floor-v14.png`, `worldSizePerRepeat: 20` medido, no copiado del Mapa 1) que sube el suelo a ~62 y el ratio a ~1.55:1. Canales de energía en AZUL (el cian es del Sparkrunner y de la maquinaria). Se eliminaron el anillo de conductos y los ocho carriles radiales: eran bandas planas `MeshBasicMaterial` apiladas sobre el suelo, sin cuantización toon, y duplicaban el lenguaje que ahora lleva la textura.
- [x] **2.3 Props de fundición — HECHO (0.13.52 → 0.13.55).** Dos familias, ambas por el pipeline voxel y con variantes de color vía `recolorMap`:
  - **Celda de energía** (`powercell` + `-rust` + `-bone`), 46-62 por partida.
  - **Chimenea de fundición** (`foundry-stack` + `-iron` + `-graphite`), 22 en el anillo a radio 82 con tres escalas uniformes, más 7-10 repartidas por el campo a escala 0.85.
  - Cantidad y posición **aleatorias por partida y por cruce de mapa** (`regenerateProps` se llama en `startRun` y en la transición).
- [x] **2.4 Arena base que sirve al boss.** HECHA: reinicio con centro despejado, pared/muro y espacio legible para las tres fases. El suelo sectorizado, bahías físicas y modularidad reactiva quedan como mejora opcional.
- [ ] **2.5 VFX de ambiente.** Resplandor de colada y chispas en lenguaje voxel de partículas. **Cielo y niebla por mapa ya están implementados**; no volver a tratarlos como deuda.
- [x] **2.6 Validación de rendimiento — HECHA.** 430 enemigos, mediana de frametime **8.30 ms** y p99 **8.50 ms** contra un período de vsync de 8.33: el juego sigue limitado por el refresco, no por la carga, con las chimeneas nuevas a 13.688 triángulos por instancia.

### Lecciones medidas de este workstream (evitan repetir tres rondas perdidas)

1. **El aspecto que juzga el ojo es el de PANTALLA, no el del mundo.** La cámara está en `(0, 24, 19)`, elevación `atan(24/19)` = 51.6°, así que la altura se proyecta por `cos(51.6°) = 0.62` y el ancho entero. Una torre de 3.3:1 en unidades de mundo mide 2.07:1 en pantalla; una de 2.0:1 mide 1.24:1, que es un cubo. Medido sobre captura real: 325×476 px. **Herramienta:** `tools/measure-screenshot-region.mjs`.
2. **Un rasgo por debajo de ~1 columna de vóxel desaparece del modelo aunque esté en la hoja.** Pasó dos veces: conducto cian a 0.25 columnas y detalle de la cara lateral a 0.94. Los rasgos de BORDE sobreviven con menos (0.63) porque la columna del extremo los tiene en mayoría; los centrados no. **Herramienta:** `tools/check-conversion-sheet.mjs --columns N`.
3. **`voxelizeMultiView` no puede dar sección redonda.** Talla por intersección de dos siluetas ortogonales, y el casco visual de un cilindro visto de frente y de lado es un prisma cuadrado. Para columnas redondas: camino front-only con `sideProfileRef` (el del bidón y la celda).
4. **Un módulo apilable obliga a silueta recta, y una silueta recta es una caja.** El primer intento midió `row width 768..768` en las 512 filas — cero variación. La identidad de un prop voxel vive en la SILUETA, no en la pintura de las caras.
5. **El toon cuantiza a 3 pasos.** Tonos separados por ~12 escalones de luma colapsan en superficie plana a distancia. Props oscuros (masa, luma ~38) varían **temperatura y luminancia**; props de tono medio (luma ~77) sí admiten variación de **matiz**.
6. **La generación de imagen no acierta cuotas de área ni anchos de rasgo pedidos.** Se piden en el prompt y se CORRIGEN por código: `tools/widen-sheet-feature.mjs`, `tools/trim-sheet-tail.mjs` y `recolorMap`. Misma lección que ya había producido `tools/thin-floor-channels.mjs`.

## Workstream 4 — Presión y balance del Mapa 2 ✅ ENTREGADO 2026-08-18 (v0.14.0)

> Abierto 2026-08-18 a pedido del usuario: el Mapa 2 tenía que subir de verdad,
> "acorde a cómo ha mejorado el jugador". La auditoría encontró **dos** defectos
> distintos, y la sesión acabó tocando seis ejes.
>
> **ESTADO: entregado, verificado (149 tests, `tsc`, `vite build`) y jugado por el
> usuario durante la propia sesión.** Buena parte de los números SALIÓ de ese
> playtest: el suelo de dificultad bajó de 0.9 a 0.7 porque leyó la apertura como
> "básicamente donde terminó el Mapa 1", el reloj de roster existe porque vio
> entrar el elenco completo del final del Mapa 1, el daño de contacto subió porque
> lo encontró flojo, y los dos arreglos de color de props son observaciones suyas.
>
> **Lo que falta no es playtest, es MUESTRA.** No hay ninguna run de 0.14.0 en
> `run-history.json`, porque una run solo se graba si TERMINA (muerte o reloj
> agotado). Sin eso `pnpm stats` no tiene contra qué calibrar. Validación externa
> (conocidos del usuario) prevista para más adelante.
>
> Historical note: work deliberately left undone at that snapshot included
> **4.5** (Map 2 XP—the evidence pointed the other way), **4.7** (the then-open
> Map 2 roster), a third door color (which would reduce repetition from 19% to
> 3.1%), and color separation for Map 1 barrels. The roster note is superseded:
> the current three-enemy slice
> is now closed and further expansion is deferred.

**Las tres palancas reales** (no hay más): densidad/ritmo vía `difficultyScalar`
(enemigos vivos 38→380, intervalo y tamaño de oleada, % de élite) · vida de
enemigos vía `ENEMIES.hpRampPerMinute` · daño de contacto, que es **uno global**
(`PLAYER.contactDamage: 8`) capado por el i-frame de `0.4s` a **20 DPS pase lo
que pase** — por eso la densidad NUNCA se lee como daño y subir el daño es la
palanca más brusca, reservada para el final.

- [x] **4.1 El bajón de vida al cruzar — ARREGLADO (0.13.59).** `enemies.update`
  recibía UN reloj (`combatElapsedS = difficultyOffsetS + mapElapsedS`) y de él
  derivaba tanto la presentación como la FUERZA de la oleada. Como el offset del
  Mapa 2 es 240 y el Mapa 1 termina en 600, el enjambre **rebobinaba** al cruzar.
  Ahora hay dos relojes explícitos: `elapsedS` (combate, solo fases visuales) y
  `arcElapsedS` (el de la run, nunca rebobina), y la vida, la mezcla de tipos y
  la rampa de élites cuelgan del segundo.

  | Momento | Multiplicador de HP antes | ahora |
  | --- | --- | --- |
  | Mapa 1 min 0 | 1.00× | 1.00× (intacto) |
  | Mapa 1 min 10 | 4.00× | 4.00× (intacto) |
  | Mapa 2 min 0 | **2.20×** | **4.00×** |
  | Mapa 2 min 10 | 5.20× | 7.00× |

  De regalo, dos cosas que también rebobinaban: las élites entraban al Mapa 2 a
  4.73× en vez de su 6× pleno (`ELITES.hpFullAtS = 300` contra un reloj de 240),
  y el tipo de enemigo que se desbloquea a los 420s no existía durante los
  primeros 3 minutos del Mapa 2. **El Mapa 1 no cambia en absoluto**: ahí los dos
  relojes son el mismo número (offset 0, primer mapa), como exige la decisión 0.2.
  Verificado con `tsc`, `vite build` y 147/147 tests; el guardián de deriva de
  `tools/regen-pressure.test.mjs` se actualizó al nuevo nombre.

- [x] **4.2 Curva propia del Mapa 2 (suelo + techo + tramo) — HECHO (0.13.60),
  PENDIENTE DE PLAYTEST.** `difficultyOffsetS` desaparece; cada mapa lleva
  `difficulty: { floor, peak, rampS }` y barre esa curva sobre su PROPIO reloj.
  El offset solo podía hacer una de dos cosas —abrir alto o mantener recorrido—
  porque deslizaba una curva de 480s: abrir en el minuto 4 implicaba saturar en
  el minuto 4. Medido, viejo → nuevo:

  | Minuto del Mapa 2 | Dificultad | Enemigos vivos |
  | --- | --- | --- |
  | 0 | 0.58 → **0.70** | 237 → **277** |
  | 3 | 0.90 → 0.88 | 344 → 338 |
  | 5 | 1.00 → 0.96 | 380 → 367 |
  | 10 | 1.00 → **1.15** | 380 → **437** |

  **Suelo retuneado 0.9 → 0.7 tras el primer playtest (2026-08-18).** Con 0.9 el
  mapa abría en 346 contra los 380 del cierre del Mapa 1 y el usuario lo leyó como
  "básicamente donde terminó el Mapa 1": lectura correcta, un suelo tan pegado al
  techo no deja crescendo que oír. 0.7 abre en la presión del **minuto 5 del Mapa
  1** (277 cuerpos) pero cargando la vida de enemigo del minuto 10, que no
  rebobina. El alivio vive en el número de cuerpos y solo puede vivir ahí: la
  continuidad de vida al cruzar es justamente lo que arregló 4.1.
  El test que acota esto dejó de usar un ratio mágico (`0.8`) y ahora ata el
  límite inferior al **punto medio de la curva del Mapa 1**.

  El Mapa 1 queda `{ floor: 0, peak: 1, rampS: 480 }`, que reproduce la fórmula
  global histórica **bit a bit** (verificado en 7 puntos de tiempo) — decisión
  0.2. Un test nuevo congela esos tres números.

  **Efecto secundario que hubo que arreglar:** la XP y el oro de élite pagaban un
  bonus por "dificultad por encima de 1", regla que solo funcionaba mientras 1
  fuera también el techo del reloj. Con el Mapa 2 llegando a 1.15 por tiempo, la
  fundición se habría llevado un **+15% de pago de élite que nadie pidió**. Ahora
  `rewardScalar(difficulty, curve)` mide el exceso contra el techo DEL MAPA: vale
  exactamente 1.0 cuando la presión la puso el reloj, y solo Cursed Core la mueve.

  **Guardarraíl abierto:** el techo aterriza en ~437 enemigos vivos y la última
  validación medida fue **430**. El trabajo real por frame es ~1.5 ms contra un
  vsync de 8.33, así que el margen existe, pero hace falta una pasada de 400+
  antes de dar el número por bueno.

- [x] **4.3 Daño de contacto por mapa — HECHO (0.13.60), PENDIENTE DE PLAYTEST.**
  `MAPS[].contactDamageMult`: Mapa 1 en `1` (baseline, congelado por test),
  Mapa 2 en **`1.25`** → el golpe de enjambre pasa de 8 a 10 y el techo de DPS
  que impone el i-frame sube de **20 a 25**. Es la única palanca que mueve ese
  techo, porque `PLAYER.invulnAfterHitS` lo capa en `contactDamage / 0.4` haya
  los cuerpos que haya.

  **Alcance deliberadamente estrecho:** NO toca daño de contacto de boss, ni
  proyectiles de boss, ni disparos de Gunner. Esos tienen su propio tuneo, y el
  jefe final vive en este mapa — meterlo en un multiplicador de mapa retunearía
  en silencio un encuentro que todavía nadie balanceó.

  **Cómo aislarlo:** 4.2 y 4.3 son DOS cambios y el guardarraíl del proyecto pide
  uno por playtest. Poner `contactDamageMult` del Mapa 2 en `1` deja la curva sola
  bajo prueba, sin tocar código.

- [x] **4.4 El atajo de dev tenía que dejar de mentir — HECHO (0.13.60).**
  Consecuencia directa de 4.1: en cuanto la fuerza de la oleada pasó a colgar del
  reloj de arco, la tecla **T** quedó rota como instrumento. Saltaba a la
  transición sin tocar ese reloj, así que pulsarla en el segundo 30 metía al
  jugador en un Mapa 2 con multiplicador de vida **1.15×** en vez del **4.0×** que
  entrega un cruce real: el atajo habría reportado el mapa como trivial y el
  reporte habría sido puro artefacto.
  - `fastForwardArcClockPastMap1()` adelanta el reloj de arco a un Mapa 1 completo
    antes de `enterMap` (que solo resetea el reloj del mapa). Nunca rebobina, así
    que pulsar T tarde conserva el reloj real.
  - **La build en vivo MANDA (arreglado tras el playtest del 2026-08-18).** El
    atajo llamaba a `applyRecordedBuild` siempre, y eso **machacaba el progreso
    que el jugador acababa de ganar en el Mapa 1** con una grabación vieja: se
    jugaban minutos reales de Mapa 1 y al pulsar T se cruzaba con otra build. Ahora
    `hasLiveProgress()` (nivel > 1, o cualquier mod/core, o un arma por encima de
    su nivel inicial) corta la superposición en seco. La grabación solo cubre el
    caso para el que existe: que no haya ninguna run que llevar.
  - Si no hay build en vivo, usa **la última run que aguantó el Mapa 1 entero**, y
    "entero" se mide SOLO por `durationS`. **Trampa cazada en el playtest del
    2026-08-18:** el primer filtro también aceptaba `sectorsCleared > 0` y
    `mapsReached > 1`, que parecen autoritativos pero **el propio atajo los
    falsifica** — la tecla T pasa por el mismo `enterMap` que un cruce real. Una
    run de 90 segundos y nivel 2 (dos armas a nivel 1, cero cores) llevaba esas
    banderas y, por ser la más reciente, ganaba a todas las pasadas reales del
    Mapa 1. Era exactamente la build que se cargaba. El reloj no se puede falsificar
    con una tecla; las banderas sí.
  - Si no hay ninguna pasada real, carga **la run más AVANZADA**, no la más
    reciente: la última suele ser lo último que murió en veinte segundos, y una
    build de muñón haría parecer imposible la fundición por motivos que no tienen
    nada que ver con el mapa.
  - El toast **enumera lo cargado** (nivel, cores, mods, armas con su nivel) en vez
    de afirmar que cargó algo.
  - El atajo puede adelantar el reloj del enjambre, pero **no puede inventar una
    build**. Si se pulsa T con progreso en vivo tras saltarse más de un minuto, el
    toast avisa de cuántos segundos de Mapa 1 vivió realmente esa build, para que
    una lectura dura se le atribuya al atajo y no al mapa.
  - Mismo tratamiento para `DEV_TOOLS.simulateMap1Handoff`.

- [x] **4.6 Lectura de dificultad en vivo — HECHO (0.13.60).**
  `DEV_TOOLS.difficultyReadout` pinta en la esquina el mapa, los DOS relojes
  (mapa y arco), el escalar de dificultad contra el suelo/techo de su mapa, el
  multiplicador de vida de enemigo, el daño de contacto vigente y los cuerpos
  vivos. Todos los valores se LEEN de lo que usan los sistemas; ninguno se
  recalcula a mano, porque una lectura que deriva su propia respuesta puede
  coincidir con el documento de diseño mientras el juego hace otra cosa.
  Existe porque "¿se aplicó el cambio de balance que acabo de hacer?" era
  irrespondible jugando —los números solo salían en el historial DESPUÉS de
  terminar una run— y se perdieron tres vueltas adivinándolo. Gateado, y
  `check-release-flags.mjs` aborta el empaquetado con él encendido (verificado).

- [x] **4.8 Reloj de roster por mapa — HECHO (0.13.60). Revierte a propósito una
  parte del 4.1.** Petición del usuario tras ver el Mapa 2 abriendo con el elenco
  completo del final del Mapa 1: quería **entrar con enemigos de principio pero en
  cantidad**.

  La corrección conceptual que salió de ahí: **fuerza y puesta en escena son dos
  preguntas distintas** y estaban metidas en el mismo reloj. Ahora se separan.
  - **Fuerza** (vida de enemigo, rampa de élites) sigue en el reloj de arco y
    **nunca rebobina** — un Voltling abre el Mapa 2 con 60 HP contra los 15 que
    tenía en el Mapa 1. Esto es lo que el 4.1 arregló y no se toca.
  - **Puesta en escena** (qué tipos aparecen) pasa a un reloj propio del mapa,
    `MAPS[].rosterSpeed`. Mapa 1 en `1` (el calendario autorado, congelado por
    test); Mapa 2 en **`2.5`**.

  | Tipo | Entra en Mapa 2 | Entraba en Mapa 1 |
  | --- | --- | --- |
  | Voltling | 0:00 | 0:00 |
  | Drone | 0:30 | 1:15 |
  | Roller | 1:00 | 2:30 |
  | Sparkrunner | 1:30 | 3:45 |
  | Gunner | 2:06 | 5:15 |
  | Rustbrute | **2:48** | 7:00 |

  **Por qué 2.5 y no un reinicio limpio:** el calendario autorado termina a los
  420s, así que a velocidad 1.0 la fundición pasaría siete de sus diez minutos sin
  sus pesados. A 2.5 el elenco entero vuelve a las 2:48.

  **COSTE MEDIDO, asumido a conciencia:** replantear las presentaciones **parte por
  la mitad la vida media por cuerpo al abrir** (60 contra 110). Es deliberado — la
  presión ahí la pone el CONTEO (277 cuerpos contra los 38 con que abre el Mapa 1)
  y la vida media trepa sola conforme el calendario se repite.

- [x] **4.9 Cobertura larga para el Mapa 2 — HECHO (0.13.60), reutilizando arte.**
  Petición del usuario tras jugar la densidad nueva. La auditoría le dio la razón:

  | Clase de prop | Mapa 1 | Mapa 2 (antes) |
  | --- | --- | --- |
  | Cobertura larga | 10-13 contenedores (cápsula ~6.4 uds, alto 3.0) | **ninguna** |
  | Dispersos | 36-50 bidones, collider 0.55 | 46-62 celdas, collider 0.55 |
  | Verticales | ninguno | 7-10 chimeneas, alto 7.31 |

  Las celdas llevan el MISMO collider que un bidón: son decoración, no terreno.

  **La petición era "un prop más grande" y ahí hubo que corregir la dirección:**
  más grande en ALTURA es la única dirección ya medida como dañina. Esta cámara
  esconde `altura × 0.79` unidades de suelo detrás de un objeto, así que una
  chimenea de 7.31 borra 5.8 y un contenedor de 3.0 borra 2.4. Al Mapa 2 no le
  faltaba altura —ya la tiene— le faltaba algo **largo y bajo** que se pueda
  orbitar. Y lo que crea terreno es la **puerta** (dos cuerpos con un pasillo),
  no el objeto suelto: props dispersos son ruido que come disparos sin partir al
  enjambre.

  `FOUNDRY_CONTAINER_PROP`: 7-9 puertas (por debajo de las 10-13 del Mapa 1) con
  pasillo de 5.4 de medio ancho (más que los 4.2 del Mapa 1, porque el enjambre
  es de hasta 437 cuerpos y no hay dash: un pasillo de talla Mapa 1 sería trampa,
  no cobertura). Dos recoloreados propios de fundición, acero y hierro, ambos por
  ENCIMA de la luma ~62 del suelo — al revés que las chimeneas, porque una
  chimenea se lee por silueta y una cobertura tiene que verse de un vistazo
  mientras corrés.

  **COSTE ASUMIDO:** los obstáculos bloquean también las armas DEL JUGADOR
  (`hasLineOfSight` en `weapons.ts`), y como el apuntado es automático un disparo
  bloqueado es un disparo perdido. Por eso el conteo arranca por debajo del Mapa 1.

  **PROVISIONAL a propósito:** reutiliza el modelo de contenedor del Mapa 1
  recoloreado. Es un test barato de si la fundición quiere esta geografía; si la
  quiere, se autora un prop propio, y si no, no se gastó arte.

- [x] **4.10 Daño de contacto subido a ×1.5 (0.13.60)** tras el playtest ("el daño
  no es suficiente"): 10 → **12** por toque, techo de DPS del enjambre 25 → **30**.
  **Y ahí se para, por una razón medida:** 12 es exactamente `BOSS.contactDamage`.
  Pasar de ahí hace que el enjambre ambiental pegue más que un boss, que es una
  afirmación sobre los bosses, no sobre el Mapa 2.
  **Si 30 DPS sigue leyéndose blando, la siguiente palanca NO es esta**: es
  `PLAYER.invulnAfterHitS`, entre la que se divide todo el techo del enjambre y a
  la que su propio comentario llama "the real difficulty dial". Necesitaría un
  factor por mapa que hoy no existe.

- [x] **4.11 Daño de boss recalibrado en los DOS mapas (0.13.60).** Consecuencia
  obligada de 4.10, no un capricho: el `BOSS.contactDamage: 12` estaba calibrado
  **contra un techo de enjambre de 20 DPS**, y el trabajo del Mapa 2 movió ese
  techo. La relación que ese número protegía —"tocar un boss es lo peor que hay en
  el campo"— se había roto en silencio: el golpe ambiental más fuerte del juego
  (élite del Mapa 2, `8 × 1.35 × 1.5 = 16.2`) había pasado al toque de boss.

  `BOSS.contactDamage` 12 → **16**, más `MAPS[].bossContactDamageMult` (Mapa 1
  en `1`, Mapa 2 en `1.25`). Jerarquía resultante, medida:

  | Mapa | Grunt | Élite | Boss | Muere en |
  | --- | --- | --- | --- | --- |
  | Scrapyard | 8.0 (20 dps) | 10.8 (27) | **16.0 (40)** | 2.5s |
  | Swarm Foundry | 12.0 (30) | 16.2 (41) | **20.0 (50)** | 2.0s |

  **Por qué el boss del Mapa 2 NO usa el ×1.5 del enjambre:** daría 24, o sea 60
  DPS, a un pelo de los **62.5 que se midieron y se RECHAZARON el 2026-07-30** por
  matar a un jugador a vida llena en 1.6s mientras el boss necesitaba ~30s para
  caer. `1.25` deja 50 DPS: claramente por encima de los élites de su mapa,
  claramente por debajo del número que rompió la pelea.

  **Alcance:** solo el CUERPO del boss (contacto y embestida comparten una única
  función, así que no pueden desincronizarse). Los proyectiles de boss quedan
  fuera a propósito — son ataques telegrafiados y esquivables con su propio tuneo,
  y el jefe final vive en este mapa.

  **Congelado en test:** para CADA mapa, `grunt < élite < boss`, y el DPS de boss
  se mantiene por debajo del 85% del que se rechazó. Esta jerarquía se rompió sin
  que nadie lo viera durante dos versiones; ahora falla el build.

- [x] **4.12 Separación de color entre props — HECHO (0.13.60).** Playtest:
  "contenedores morados pegados a otros idénticos" y "4 o 5 celdas marrones una al
  lado de otra". Eran DOS defectos distintos:
  - **El scatter (celdas, chimeneas) sorteaba la variante de forma independiente
    por prop, sin ninguna memoria.** Con 54 props y 3 variantes, una racha de
    cuatro iguales no es mala suerte: es el resultado esperado.
  - **Las puertas** sí tenían regla, pero aproximaba el vecino angular por
    **posición en el array**. Solo valía mientras `scatterPoints` devolviera los
    puntos en orden de sector, y no podía ver dos puertas cercanas en el suelo
    pero lejanas en la lista — justo el caso que cazó el playtest.

  `pickSpatialVariant()` reemplaza a las dos: elige la variante **más rara entre
  los props ya colocados dentro de un radio**, con desempate aleatorio (un prop
  aislado sigue siendo uniformemente aleatorio) y sin negarse nunca a colocar.

  Medido sobre 200-400 layouts simulados:

  | | Antes | Ahora |
  | --- | --- | --- |
  | Celdas: vecinas cercanas del mismo color | 34.6% | **10.4%** |
  | Celdas: peor racha pegada | 3 | **2** |
  | Puertas: vecinas del mismo color | 50.7% | **19.0%** |

  **El radio se barrió, no se eligió a ojo:** en las puertas da 25.1% a radio 35,
  19.0% a 45 y **30.3% a 60**. Empeora pasado un punto porque un radio que se
  traga la arena entera deja de ser una regla local y se vuelve balanceo global de
  conteos, que no dice nada de lo que el jugador ve en una pantalla.

  **Techo conocido:** las puertas solo tienen DOS colores, así que el 19% es casi
  su mínimo matemático. Con un tercer color cae a **3.1%**.

  **Mapa 1 NO se tocó** (`BARREL_PROP.variantSeparation: 0`): tiene el mismo
  defecto con sus 36-50 bidones, pero el pedido era del Mapa 2 y el Mapa 1 es el
  mapa de la Demo. Ponerlo a 20 lo arregla y no hace falta nada más.

- [ ] **4.7 El elenco del Mapa 2 es ahora el cuello de botella — MEDIDO 2026-08-18.**
  La dificultad ya sube, pero el mapa **no puede sentirse nuevo**: el roster se
  satura a los **420s** y a partir de ahí la mezcla no vuelve a cambiar nunca.

  | Reloj | Mezcla ponderada |
  | --- | --- |
  | 5 min | Voltling 53% · Sparkrunner 16% · Roller 16% · Drone 16% |
  | 7 min | Voltling 43% · Sparkrunner 13% · Roller 13% · Drone 13% · Rustbrute 9% · Gunner 9% |
  | **todo el Mapa 2** | **idéntica a la de 7 min** |

  O sea que el Mapa 2 entero enseña exactamente los mismos 6 tipos que el último
  tercio del Mapa 1, y el 82% de lo que se ve ya estaba en el minuto 5. Es la
  decisión **0.5** (reteñido + 1-3 enemigos de firma) sin implementar: `enemies.ts`
  no tiene ni una rama por mapa. Ninguna curva de dificultad puede tapar eso.

- [ ] **4.5 XP del Mapa 2 — NO SE TOCA TODAVÍA, y la evidencia dice por qué.**
  Propuesta razonable (si los enemigos aguantan más, el nivel se estanca), pero la
  única run de arco completo registrada terminó en **nivel 73 con 7.254 kills**,
  contra un máximo de **nivel 37** en las runs que solo llegaron al Mapa 1. El
  comentario de `xpForLevel` fija el objetivo de diseño en **~25-30 para 10
  minutos**; un arco de 20 debería rondar 40-45 si la curva se sostuviera. Llegó a
  73. O sea que el Mapa 2 **ya paga XP de más**, no de menos, y la subida de vida
  de 4.1/4.2 empuja hacia el objetivo en vez de alejarse.
  **n = 1**, así que no es una conclusión cerrada: es la razón para medir antes de
  actuar. El instrumento ya existe — `pnpm stats` segmenta "nivel alcanzado" por
  mapa de fin. Si tras el playtest el nivel al cerrar el Mapa 2 cae mucho, la
  palanca correcta es un `xpMult` por mapa (gemelo de `contactDamageMult`), NUNCA
  editar `ENEMY_TYPES[].xp`: el roster es global y no hay rama por mapa en
  `enemies.ts`, así que tocarlo cambiaría también el Mapa 1.

---

## Workstream 3 — Boss final: Hazard Marshal ✅ BASELINE CERRADA 2026-08-20 (0.22.0)

**Modelo, integración y combate baseline están cerrados.** `src/models/registry.ts` conserva la clave histórica `final-boss`; la pelea tiene llegada propia, arena despejada con muro, fuego retenido en las 11 armas, tres fases, sweep/volley/assembly/overload, refuerzos, audio y desenlace. Balance fino con runs humanas y una arena reactiva/modular quedan diferidos.

> ## HISTÓRICO — entrega intermedia 2026-08-19 (v0.15.0)
>
> Detalle completo en `docs/PRD.md` §"Hazard Marshal — llegada telegrafiada y
> moveset de 3 fases". Titulares: el sector se **reabre como arena** al agotarse
> el reloj (misma cortina que un cruce, campo limpio, jugador al centro, props
> con el centro vacío en radio 28, sin acreditar sector) · llegada telegrafiada
> 2,5 s con el lenguaje de un summon del Mapa 1 pero sin portal · colocación por
> tres reglas medidas
> (fuera de alcance 11–15 · caja del cuerpo dentro del cuadro por proyección
> real · holgura de 3,5 sobre props) · tres fases acumulativas por vida
> (barrido sectorial → líneas de ensamblaje → sobrecarga del núcleo) · una sola
> telegrafía por frame · `PHASE n/3` en la barra del boss.
>
> Verificado por `tools/final-boss.test.mjs` (en `pnpm test`) y por
> `pnpm test:finale-runtime`, que mide 5 llegadas en el Mapa 2 real dentro de
> Electron. El audio se cerró después en 0.22.0; el balance humano permanece diferido.

### 3.A Integración (sin diseño nuevo)
- [x] **3.A.1 Instanciar el Hazard Marshal como jefe final del Mapa 2**, **disparado al terminar las oleadas (minuto 10 del Mapa 2)** — no por portal — en `boss.ts` / `enemies.ts`. HECHO 2026-08-19: la llegada abre una telegrafía de 2,5 s en un punto elegido por distancia, encuadre y holgura, y el cuerpo se materializa por el MISMO camino que un summon de tótem (banner AWAKENS, erupción, anillo de choque y temblor compartidos).
- [x] **3.A.2 Feedback de daño = tinte + brillo, NO animación.** El clip `hit` se reserva para eventos raros.
- [x] **3.A.3 Lenguaje visual baseline.** Tamaño de boss, doble anillo rojo, proyectiles con núcleo blanco y telegrafías bajo escenografía separan el encuentro. El futuro reteñido/elenco de Foundry deberá conservar esa lectura.

### 3.B Moveset por fases (dirección inicial del usuario — a prototipar y medir)
Un cambio a la vez; validar cada fase in-game antes de la siguiente. Números en `config.ts`.

- [x] **3.B.1 Fase 1 — Barridos energéticos por sectores.** HECHO 2026-08-19 con telegrafía PROPIA en vez de esperar al suelo sectorizado de 2.4: cuña de 42°/20 unidades, 1,3 s de aviso, puntería fijada al empezar (una cuña que persigue es un impacto inevitable disfrazado de aviso). Cola opaca + opacidad horneada + `renderOrder` por malla. Dos mitades: el boss se planta (origen) y el suelo se enciende (destino).
- [x] **3.B.2 Fase 2 — Líneas de ensamblaje.** HECHO 2026-08-19: bahías en el perímetro del lado en que se juega, avisadas 1,6 s **en la bahía**, 5 refuerzos por bahía con el multiplicador de vida de la oleada viva y techo de 320 cuerpos para no pelearse con el cap del spawner. Las cintas visibles siguen dependiendo de 2.4.
- [x] **3.B.3 Fase 3 — Sobrecarga del núcleo.** HECHO 2026-08-19: cadena de 4 zonas que nacen EN el boss y erupcionan hacia fuera por la línea del jugador, una cada 0,45 s. Anclada al boss a propósito — la etapa C del Crusher se rechazó porque la zona nacía fuera del foco que otro evento acababa de capturar. El suelo modular de 2.4 sigue pendiente.
- [x] **3.B.4 Transiciones de fase** HECHO 2026-08-19: umbrales por vida en `FINAL_BOSS.phaseThresholds` (66%/33%), stagger de 1,4 s + erupción + banner + temblor. El clip `hit` del rig sigue sin engancharse al runtime de combate (el enjambre usa la malla instanciada), así que el beat es VFX + aturdimiento.
- [x] **3.B.5 Audio del boss.** Cues cableadas: `boss-sweep-charge/warn/fire`, `boss-volley`, `boss-assembly-open/spawn` y `boss-overload-open/erupt`. `boss-assembly-open` forma parte de la generación canónica de `pnpm audio:generate`.
- [ ] **3.B.6 Balance fino** con runs humanas terminadas y `pnpm stats`. No reabre la baseline.

---

## Backlog vigente después del cierre

1. Foundry molten-flow glow and voxel sparks.
2. Completed human runs plus `pnpm stats` for balance and retention.
3. Cohesion pass for new audio.
4. External Steamworks publication/icon confirmation, production achievement-unlock smoke, and technical close. The 20 launch achievements and their `steamworks.js` 0.4.0 Steam achievement transport are implemented in 0.30.5; SDK/overlay initialization, packaging, IPC, allowlist, and outbox are auxiliary support for that flow, not independent Steam features. The maintainer confirms all 20 App Admin entries created for App ID `4979220`, but publication, uploaded icons, and production-build unlocking are not evidenced here. All other Steamworks product APIs are outside launch scope and carry no commitment; reconsider only post-launch if sufficient visibility/traction justifies them. A reactive/modular arena remains optional.

The three launch characters and current enemy replacement slice are closed. Deferred enemy expansion is not part of this active backlog.

## Guardarraíles que aplican a todo el bloque
- InstancedMesh por tipo · 60 FPS con 400+ · números en `config.ts` · sin apuntado manual · nada de clonar Megabonk 1:1 · subir `version` antes de cada commit · `PROFILE` se muta en su sitio · código/UI en inglés.
