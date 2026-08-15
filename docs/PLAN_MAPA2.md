# PLAN — Bloque Mapa 2 (Swarm Foundry): transición · visual · Hazard Marshal

> Estado: PLANIFICADO 2026-08-15. Nada implementado en este doc todavía.
> Alcance: cerrar la run completa **Mapa 1 (10 min de oleadas + gate de boss) → transición → Mapa 2 (10 min de oleadas) → Hazard Marshal (jefe final, 3 fases)**.
> Rama de trabajo: `codex/map-2` (worktree `chest-marker-demo`). Config ya titula el mapa como **"Swarm Foundry"** (`config.ts` ~línea 209). Cambios de gameplay portan a `codex/demo-map1` según la regla de ramas.
> Fuente de verdad de orden: `docs/ROADMAP_STEAM.md` §"Bloque Mapa 2 + Volt Warden". Este doc es el desglose accionable de ese bloque.

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
- [x] **0.5 Elenco del Mapa 2 — CERRADA 2026-08-15 (dirección; roster concreto a iterar).** **Mezcla**: conservar parte de los 6 actuales **reteñidos** a la paleta de fundición + **1-3 enemigos nuevos de firma** que den identidad al mapa. El roster exacto y el diseño de los nuevos se **iteran al acometer este workstream** (modelado + retoque), no ahora. Restricciones fijas: cada enemigo nuevo = 3 hojas medidas del pipeline voxel + validación del enjambre a 400+; vigilar que la paleta ámbar+carbón del elenco no se funda con la del Hazard Marshal (ver 3.A.3).
- [x] **0.7 Interacción del gate AND — CERRADA 2026-08-15.**
  - El gate se presenta como **misión visible en pantalla** durante todo el Mapa 1: "invoca y derrota al boss + aguanta los 10:00 para avanzar", con el estado de las dos condiciones (boss ✓/✗ · tiempo).
  - **Sin muerte súbita ni boss forzado.** El Mapa 1 termina en su corte natural de 10:00 (o al morir antes). En el corte se evalúa: **vivo + ≥1 boss derrotado → cruza** al Mapa 2; **cualquier otro caso → run cortada sin cruce**.
  - **Fin sin cruce = pantalla de resultados/muerte estándar** (reusa `src/defeat-transition.ts` + la pantalla de resultados), con los datos de la run y una **indicación clara de que no se completó el objetivo pedido** (p. ej. "Objetivo no completado: falta derrotar al boss"). Política de reintento del arco = 0.4.
  - Matar el boss antes de 10:00 **no acorta** el Mapa 1: se sigue jugando hasta el corte; el cruce solo se habilita al cumplir ambas condiciones.

- [x] **0.8 Estructura del clímax del Mapa 2 — CERRADA 2026-08-15.** El Hazard Marshal es el **jefe final fijo** del arco: entra **al terminar las oleadas del Mapa 2 (su minuto 10)**, no por portal opcional como el gate del Mapa 1. La curva propia del Mapa 2 (0.2) alcanza su pico justo al entrar el boss, dando un handoff limpio de tensión. A resolver en el moveset (3.B): si durante la pelea siguen entrando oleadas normales o **solo** los refuerzos que genera la Fase 2.

**Instrumentación irrecuperable — hay que meterla ANTES de la primera run del Mapa 2:**
- [x] **0.6 Campo `map` en el registro de muerte — HECHO 2026-08-15.** Al revisarlo, la mitad ya existía en esta rama: `RunSnapshot.map` (`{id,number,title}`) + `mapsReached`, y `game.ts` graba `map: this.currentMap` (getter que deriva de `runFlow.mapIndex`), así que **la atribución de muerte por mapa ya era correcta** (una run que muere en el Mapa 2 graba `megafactory`). Lo que faltaba y se añadió: **`npm run stats` (`tools/run-stats.mjs`) ahora segmenta por el mapa en el que terminó la run** — conteo, outcomes y distribuciones de duración/kills/nivel, con los registros sin `map` en un bucket aparte (nunca plegados al Mapa 1). Verificado contra datos reales: 89% de runs terminan en el Mapa 1, 11% ya alcanzan el Mapa 2 (1 arco completo).

---

## Workstream 1 — Transición Mapa 1 → Mapa 2

> **HALLAZGO 2026-08-15:** la lógica central del arco YA existe en `src/run-flow.ts` (verificado). `advanceRunFlow` implementa el gate (`end-run` con `reason: 'boss-required'` → run cortada si no cae boss, exactamente 0.1/0.7), la `transition` entre mapas y el `start-finale` del boss al acabar el último mapa (0.8); `game.ts` la consume (~líneas 1207-1222) y actualiza `currentMap`. `MAPS` en `config.ts` ya define los 2 mapas (`scrapyard`, `megafactory`/"Swarm Foundry"). Por tanto varios ítems de abajo NO son lógica nueva sino **cableado/UX**; **re-scopear cada uno contra la rama antes de tocar nada** en vez de reconstruir lo que ya está. Lo que casi seguro falta es la capa visible: misión en HUD (1.2b), pantalla "objetivo no completado" (1.2c), y confirmar que el handoff (vida 100%, oro 0, XP reescalada) coincide con 0.3.

Depende de: 0.1 (cerrada), 0.2, 0.3, 0.6 (hecha), 0.7.

- [ ] **1.1 Máquina de estados del arco.** Estado explícito de fase (Mapa 1 → transición → Mapa 2 → final → fin) chequeable en `game.ts`. El comentario de `config.ts` (~línea 75) ya anticipa este flujo; convertirlo en estado real.
- [ ] **1.2 Gate AND cableado** (0.1 + 0.7): rastrear "≥1 boss derrotado" y "≥10:00 sobrevividos"; en el corte de 10:00 habilitar el cruce solo con ambas, o cortar la run sin cruce.
- [ ] **1.2b Misión en pantalla (HUD)** en el Mapa 1: objetivo visible con estado de las dos condiciones (boss ✓/✗ · tiempo). Copy en inglés.
- [ ] **1.2c Pantalla de resultados "objetivo no completado"**: variante del flujo de derrota (`defeat-transition.ts` + resultados) que muestra datos + aviso de objetivo incumplido cuando la run se corta sin cruce.
- [ ] **1.2d Accesibilidad del boss dentro de la ventana**: garantizar que el jugador pueda **invocar y matar** un boss antes de 10:00 (las 6 primeras runs invocaron 0 bosses con el portal opcional). Requisito de diseño de la transición, no opcional.
- [ ] **1.3 Handoff de build.** Al cruzar, conservar armas/cores/mods/sockets intactos (depende de 0.3 para vida/oro/XP). `PROFILE` se muta en su sitio, nunca se reemplaza (guardarraíl #8).
- [ ] **1.4 Reset/rebuild del mundo** para el Mapa 2: limpiar enjambre, props y pickups del Mapa 1; construir el entorno foundry (Workstream 2) sin recargar la app ni perder la sesión de audio.
- [ ] **1.5 Curva de dificultad del Mapa 2** según 0.2 (multiplicador base por mapa en `config.ts`, cero magnitudes hardcodeadas).
- [ ] **1.6 Beat visual + audio de transición.** Fundido / secuencia corta al cruzar el portal. Crossfade de música entre cama de Mapa 1 y cama de Mapa 2 (engancha con el pendiente 0c del roadmap: crossfade real en vez de corte seco). Cero gore, lenguaje voxel.
- [ ] **1.7 Atribución de muerte por mapa** cableada de punta a punta (0.6): el `map` se escribe en cada run terminada y `npm run stats` lo segmenta.

---

## Workstream 2 — Pase visual del Mapa 2 (Swarm Foundry)

Objetivo del usuario: que **no parezca otro juego**. Alinear props y ambiente con el lenguaje del Mapa 1 (misma familia voxel, mismos materiales `litMaterial()`, misma dirección de silueta) pero en el tema **fundición** del arco de arte (chatarrería → **fundición** → ciudad neón, `DIRECCION_ARTE.md`).

- [ ] **2.1 Auditoría de contraste con Mapa 1.** Poner los dos entornos lado a lado y listar exactamente qué "canta" a otro juego (paleta, escala de props, densidad, materiales, iluminación). Medir, no juzgar por captura (regla de método #1).
- [ ] **2.2 Paleta y suelo de fundición.** Textura de suelo cenital tipo colada/metal fundido vía el pipeline de suelo (`PROMPTS_IMAGENES.md` §7b: top-down estricto, mosaico `RepeatWrapping`, `litMaterial()`), no se voxeliza. Paleta molten (ámbar/naranja calor + carbón) coherente con el logo y el resto del elenco.
- [ ] **2.3 Props de fundición** en el mismo pipeline voxel que contenedores/bidones del Mapa 1: crisoles, cintas transportadoras, moldes, cubas de colada. **InstancedMesh por tipo** (guardarraíl #1), silueta única por tipo, reusar el sistema de variantes de color ya presente en `world.ts` de la rama.
- [ ] **2.4 Layout que sirva al boss.** El arena debe soportar el moveset (Workstream 3): **suelo dividido en sectores visibles** (Fase 1), **bahías/corredores de entrada en el perímetro** (Fase 2), **suelo modular que se vuelve peligro** (Fase 3). Diseñar el entorno y el arena juntos, no por separado.
- [ ] **2.5 Iluminación/VFX de ambiente** (resplandor de colada, chispas) en lenguaje voxel de partículas (cubos de paleta, cero gore), validado con el enjambre a 400+.
- [ ] **2.6 Validación de rendimiento**: 60 FPS con 400+ enemigos en el entorno nuevo antes de darlo por bueno (guardarraíl #1).

---

## Workstream 3 — Boss final: Hazard Marshal

**El modelo YA está cerrado.** `src/models/registry.ts` clave `final-boss`: hojas medidas frontal/lateral/trasera (`tools/make-hazard-marshal-sheets.mjs`), cabeza vestida con paleta del logo vía `recolorRegions`, rig de piezas con clips `idle`/`walk`/`hit` (`docs/ANIMACION_RIG.md`). Lo que falta es **engancharlo al juego** y **diseñar el moveset** — sin moveset no hay animaciones de ataque que autorizar.

### 3.A Integración (sin diseño nuevo)
- [ ] **3.A.1 Instanciar el Hazard Marshal como jefe final del Mapa 2**, **disparado al terminar las oleadas (minuto 10 del Mapa 2)** — no por portal — en `boss.ts` / `enemies.ts` (hoy el modelo existe pero no se invoca en juego).
- [ ] **3.A.2 Feedback de daño = tinte + brillo, NO animación** (`ANIMACION_RIG.md` §8): recibe demasiados impactos/segundo para que un clip termine. El clip `hit` se reserva para eventos raros (cambio de fase, rotura de armadura, stagger).
- [ ] **3.A.3 Lenguaje visual anti-confusión.** El boss es ámbar+carbón y los Voltling también; a tamaño de boss (medido 244×293 px vs 50×58 del jugador) + doble anillo rojo se distingue, pero **revisar en vivo contra el elenco del Mapa 2** (0.5).

### 3.B Moveset por fases (dirección inicial del usuario — a prototipar y medir)
Un cambio a la vez; validar cada fase in-game antes de la siguiente. Números en `config.ts`.

- [ ] **3.B.1 Fase 1 — Barridos energéticos por sectores.** Ataques que cubren sectores del suelo dividido. Necesita **arena abierta con suelo dividido visualmente** (2.4). Telegrafía de suelo: marcador que pasa por delante de la escenografía y por detrás del personaje — sacarlo de la cola transparente y hornear la opacidad en el color (regla de render mordida; capas `VISUAL.renderOrders`). Regla de dos mitades: se ve el origen y el destino.
- [ ] **3.B.2 Fase 2 — Líneas de ensamblaje.** El boss activa cintas que **producen refuerzos desde el perímetro**. Necesita **bahías y corredores de entrada claramente visibles** (2.4). Refuerzos vía InstancedMesh del tipo de enemigo, spawn presupuestado para no romper el enjambre.
- [ ] **3.B.3 Fase 3 — Sobrecarga del núcleo.** Activa **zonas peligrosas secuenciales**; el **suelo modular pasa a ser parte del combate**. Telegrafías de zona con la misma regla de cola de render que 3.B.1. Este es el pico de tensión del arco.
- [ ] **3.B.4 Transiciones de fase** con el clip `hit`/stagger reservado (3.A.2), y umbrales de fase en `config.ts` (por vida, no hardcodeados).
- [ ] **3.B.5 Audio del boss** (Fase 4b del roadmap): telegrafías, ataques y capa musical de boss; se audita como contenido nuevo, no reabre audio v1.
- [ ] **3.B.6 Balance del encuentro** medido sobre build comparable; sin apuntado manual (guardarraíl #4), validado a 400+ con los refuerzos activos.

---

## Orden sugerido

1. **Paso 0 — DECISIONES CERRADAS** (0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.8). Queda solo **0.6**, que no es decisión sino tarea obligatoria: el campo `map` en el registro de muerte, ANTES de la primera run del Mapa 2.
2. **Workstream 2** (visual foundry) en paralelo con **Workstream 1** (transición): el arena de 2.4 y el moveset de 3.B se diseñan juntos.
3. **3.A** (enganchar el modelo ya cerrado) — barato, da un boss jugable base.
4. **3.B** fase por fase, un cambio por playtest.
5. Balance y audio de boss al final del bloque; playtests humanos cuando el arco entero exista en una build comparable.

## Guardarraíles que aplican a todo el bloque
- InstancedMesh por tipo · 60 FPS con 400+ · números en `config.ts` · sin apuntado manual · nada de clonar Megabonk 1:1 · subir `version` antes de cada commit · `PROFILE` se muta en su sitio · código/UI en inglés.
