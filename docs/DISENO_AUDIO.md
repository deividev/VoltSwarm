# DISEÑO_AUDIO.md — Lista maestra de SFX y música

> **Estado (2026-07-13): el juego NO tiene audio.** Los sliders Master/Music/SFX de settings (`src/settings.ts`, `src/hud.ts`) existen y persisten, pero nada los lee — son la costura ya preparada para el mixer. Este doc es el inventario COMPLETO de lo que hay que generar, basado en una revisión del código a fecha de hoy. Fase del roadmap: **Fase 4 — Sonido** (`ROADMAP_STEAM.md`).
>
> **⏳ CUÁNDO se ejecuta (decisión del usuario 2026-07-13): AL FINAL DEL TODO** — cuando el juego esté completo en visual y jugabilidad (tras la Fase 5 de balance/contenido, antes del cierre de Fase 6). Antes de ejecutar, **re-auditar esta lista contra el juego terminado**: Volt Warden, mapa 2+, contratos, endless y todo lo implementado después del 2026-07-13 NO están inventariados aquí. Única excepción al orden: si el tráiler de lanzamiento se captura antes, adelantar solo la pista principal de música.

## Dirección de audio (regla de `DIRECCION_ARTE.md`, no negociable)

- **Mecánica de juguete/maquinaria**: clanks metálicos cortos, servos, zumbidos eléctricos, chirps sintéticos. Nada orgánico.
- **Cero gore**: los enemigos son robots — mueren en "clank + burst", nunca en splat.
- **La música sigue el arco de mapas**: scrapyard = industrial percusivo → fundición → neón/synth futurista. La v1 solo necesita el Mapa 1 (fábrica muerta).
- **Regla de las dos mitades (heredada del VFX)**: los efectos sostenidos suenan en el ORIGEN (trigger one-shot) y en el DESTINO (loop de estado sobre el enemigo/jugador afectado).
- **Anti-fatiga**: todo SFX que puede dispararse >1 vez/segundo (golpes, orbes, monedas, chispas) necesita 3-4 variaciones de pitch/timbre + cap de voces simultáneas. Con 400+ enemigos esto es tan crítico como el InstancedMesh.

## Convención de nombres y formato

- Archivos: `public/assets/audio/sfx/<categoria>-<nombre>[-vN].ogg` y `public/assets/audio/music/<nombre>.ogg`
- Formato: OGG Vorbis (Electron/Chromium lo come nativo), 44.1kHz. SFX mono salvo ambientes/música (estéreo).
- Prioridad: **P1** = mínimo para que el juego "suene completo" · **P2** = pulido profesional · **P3** = detalle fino post-playtest.

---

## 1. Armas (11) — cada una con su identidad, alineada al acento de `WEAPON_ACCENT`

| # | ID | Arma | SFX | Prioridad |
|---|---|---|---|---|
| 1 | `sfx-weapon-bolt-fire` | Bolt Cannon | Disparo eléctrico corto (pew mecánico) + `sfx-weapon-bolt-impact` clink al impactar | P1 |
| 2 | `sfx-weapon-pulse-release` | Volt Pulse | Zap de descarga en anillo; opcional hum de carga previo (P3) | P1 |
| 3 | `sfx-weapon-blades-loop` | Orbital Blades | **Loop** de sierra girando (whirr grave) + clank por golpe de contacto | P1 |
| 4 | `sfx-weapon-welder-loop` | Welder | **Loop** de arco de soldadura (sizzle) que sube de intensidad/pitch con el ramp de daño | P1 |
| 5 | `sfx-weapon-press-slam` | Press | Slam metálico pesado + siseo hidráulico de retorno | P1 |
| 6 | `sfx-weapon-tire-roll` | Tire | Chirrido de goma rodando + crepitar de llama (loop corto mientras vive el neumático) | P1 |
| 7 | `sfx-weapon-oil-splash` | Oil | Plaf de charco + goteo viscoso; el enemigo ralentizado lleva el loop de goteo (dos mitades) | P1 |
| 8 | `sfx-weapon-acid-splash` | Acid | Rotura de frasco + **loop** de burbujeo del charco corrosivo | P1 |
| 9 | `sfx-weapon-turbine-loop` | Turbine | Rugido de torbellino + traqueteo de chatarra desprendiéndose | P1 |
| 10 | `sfx-weapon-ricochet-ting` | Junk Ricochet | "Ting" metálico POR REBOTE (pitch sube con cada rebote encadenado — vende la mecánica) | P1 |
| 11 | `sfx-weapon-dismantler-swipe` | Dismantler | Zarpazo triple + **sting de ejecución** (`sfx-weapon-dismantler-execute`, shred metálico) cuando remata a un low-HP | P1 |

- P2: sting de milestone al ganar +1 proyectil/hoja/etc. en Lv3/Lv5 (`sfx-weapon-milestone`, compartido).

## 2. Mods (16) — cada mod habla el mismo idioma que su VoxelBurst

**Consumibles (4):**

| ID | Mod | SFX |
|---|---|---|
| `sfx-mod-repair` | Repair Kit | Chime de reparación (servo + ding) — P1 |
| `sfx-mod-haste` | Overdrive | Rev de motor acelerando — P1 |
| `sfx-mod-scrap-cache` | Volt Cache | Chime de XP grande (versión "premium" del orbe) — P1 |
| `sfx-mod-frenzy` | Frenzy | Sting agresivo de power-up (distorsión corta) — P1 |

**Permanentes (12)** — one-shot en el trigger; los de estado sostenido añaden loop (dos mitades):

| ID | Mod | SFX | Loop de estado |
|---|---|---|---|
| `sfx-mod-stun-bumper` | Stun Bumper | Zap cian de contacto | ✅ crepitar eléctrico en el enemigo aturdido |
| `sfx-mod-kick-plate` | Kick Plate | Thump de patada metálica | — |
| `sfx-mod-loose-bolts` | Loose Bolts | Traqueteo de tornillos dispersándose | — |
| `sfx-mod-detonator-rig` | Detonator Rig | Boom AoE (contenido, no "guerra") | — |
| `sfx-mod-coolant-burst` | Coolant Burst | Crack de hielo + siseo de nova | ✅ opcional: chasquido helado en congelados (P3) |
| `sfx-mod-orb-siphon` | Orb Siphon | Whoosh magnético de aspirado | — |
| `sfx-mod-chain-relay` | Chain Relay | Zap de arco encadenado (1 por salto, pitch descendente) | — |
| `sfx-mod-piston-stompers` | Piston Stompers | Pisotón hidráulico grave | — |
| `sfx-mod-overload-trigger` | Overload Trigger | Sting de sobrecarga | ✅ hum rojo mientras dura el buff |
| `sfx-mod-phase-chassis` | Phase Chassis | Whoosh de desfase (out) + whoosh inverso (in) | ✅ shimmer violeta sutil durante la intangibilidad |
| `sfx-mod-foremans-whistle` | Foreman's Whistle | **Silbato de latón literal** al llegar el chatarrero (ya nombrado en el diseño VFX) | — |
| `sfx-mod-magnetron-heart` | Magnetron Heart | Hum de atracción creciente → boom de nova | — |

Prioridad de bloque: P2 (el juego funciona sin ellos; el pulido pro está aquí).

## 3. Enemigos y bosses

**Regulares (6):**

| ID | Enemigo | SFX |
|---|---|---|
| `sfx-enemy-death-clank-v1..v4` | TODOS | **El sonido más repetido del juego**: clank + burst de muerte, 4 variaciones + pitch aleatorio, cap de ~6 voces — P1 |
| `sfx-enemy-rustbrute-step` | Rustbrute | Pisada pesada (loop de proximidad) + crunch de muerte más gordo — P2 |
| `sfx-enemy-roller-charge` | Roller | Wind-up de carga + rev rodando (telegrafía la embestida) — P1 |
| `sfx-enemy-gunner-shot` | Gunner | Disparo de esquirla naranja + `sfx-enemy-shot-impact` al golpear al jugador — P1 |
| `sfx-enemy-drone-hum` | Drone | Zumbido de hover (loop de proximidad, atenuado por distancia) — P2 |
| `sfx-enemy-elite-spawn` | Elites | Sting corto al spawnear un elite (magenta 1.35×) — P2 |

Voltling/Sparkrunner no necesitan voz propia: los cubre el clank común (son masa).

**Bosses (2 implementados + portal):**

| ID | Evento | SFX | Prioridad |
|---|---|---|---|
| `sfx-portal-idle` | Portal en reposo | Hum grave giratorio (loop, espacial) | P2 |
| `sfx-portal-telegraph` | Telegraph de invocación (2.5s, beam estroboscópico + anillos) | Alarma de carga in crescendo sincronizada con los 2.5s | P1 |
| `sfx-portal-eruption` | Erupción + materialización | Boom + screen shake | P1 |
| `sfx-boss-crusher-charge` | Crusher King: wind-up → dash | Growl mecánico de carga + whoosh del dash | P1 |
| `sfx-boss-crusher-summon` | Invocación de scraplings | Chirp de invocación | P2 |
| `sfx-boss-tesla-burst` | Tesla Titan: anillo radial | Descarga eléctrica grande (más gorda que el Gunner) + disparo de estrella roja con impacto propio | P1 |
| `sfx-boss-death` | Boss DESTROYED | Fanfarria de demolición (colapso metálico + sting de victoria) — claramente distinta al clank común | P1 |

Volt Warden: **fuera de alcance** — sin mecánicas diseñadas aún (Fase 5). Anotar su audio cuando exista.

## 4. Jugador

| ID | Evento | SFX | Prioridad |
|---|---|---|---|
| `sfx-player-hurt` | `takeHit()` | Golpe metálico + chispa (nada de "ay") | P1 |
| `sfx-player-block` | Escudo consume carga | Clink de deflexión ("BLOCK", ya en la lista del roadmap) | P1 |
| `sfx-player-lowhp-loop` | HP < 25% | Pulso de alarma grave (sincronizado con el pulso rojo del HUD) | P1 |
| `sfx-player-death` | `endRun('Overloaded')` | Apagado de sistema (power-down descendente) | P1 |
| `sfx-player-levelup` | Sube de nivel | Fanfarria corta de level-up (chirp ascendente) | P1 |
| `sfx-player-footsteps` | Caminar | Shuffle de servos (loop sutil, sincronizado con `walkBobHz`) | P3 |

## 5. Economía y pickups

| ID | Evento | SFX | Prioridad |
|---|---|---|---|
| `sfx-xp-pickup-v1..v3` | Recoger orbe XP | Pop cristalino; **pitch escala con el valor del orbe** (los merged suenan más graves/ricos) | P1 |
| `sfx-xp-merge` | Merge de orbes | Tick suave | P3 |
| `sfx-gold-pickup` | Recoger moneda | Cha-ching metálico corto + `sfx-ui-gold-tick` en el contador del HUD (acompaña el bump visual) | P1 |
| `sfx-gold-drop` | Drop de moneda | Clink de ficha cayendo | P3 |
| `sfx-chest-pay` | Pagar cofre (E) | Gasto de monedas + cerrojo abriéndose | P1 |
| `sfx-chest-reel-loop` | Ruleta girando (2.6s) | **Tick-tick de tragaperras desacelerando** — sincronizado con la transición CSS decelerante; ES el sonido de identidad del cofre | P1 |
| `sfx-chest-land` | Aterrizaje + flash blanco | Thud + sting de flash | P1 |
| `sfx-chest-reveal` | God-rays + icono sube | Swell de revelado **teñido por tier** (gris plano → dorado celestial; mínimo: capa extra en tier 4-5) | P1 (base) / P2 (por tier) |
| `sfx-chest-sparks-loop` | Lluvia de chispas | Crepitar suave mientras dura el reveal | P2 |
| `sfx-merchant-arrive` | THE SCRAPPER HAS ARRIVED | Sting de llegada (ruedas de carrito + silbato si hay Foreman's Whistle) | P1 |
| `sfx-merchant-countdown` | Últimos ~10s del countdown | Tick de urgencia | P2 |
| `sfx-merchant-buy` | Compra en tienda | Monedas + "item get" | P1 |
| `sfx-merchant-leave` | Se va | Ruedas alejándose (acompaña el toast) | P2 |
| `sfx-ui-cant-afford` | Sin oro (cofre o tienda) | Buzz de denegación | P1 |

## 6. Draft de level-up y overlays

| ID | Evento | SFX | Prioridad |
|---|---|---|---|
| `sfx-ui-cards-in` | Cartas del draft aparecen | Whoosh de abanico | P1 |
| `sfx-ui-card-hover` | Hover de carta | Blip sutil | P2 |
| `sfx-ui-card-select` | Elegir carta | Chime de confirmación | P1 |
| `sfx-ui-card-discard` | Botón de descarte | Sonido de rechazo (papel/metal arrugado, distinto al select) | P2 |
| `sfx-ui-socket-fill` | Socket se llena (pop cian) | Pop + click de encaje | P2 |
| `sfx-ui-row-upgrade` | Flash dorado de fila mejorada | Ding shimmer | P2 |

## 7. UI general y menú

| ID | Evento | SFX | Prioridad |
|---|---|---|---|
| `sfx-ui-banner` | Banner arcade (AWAKENS / DESTROYED / ARRIVED) | Slam-in de banner (compartido; el contexto lo da la música/el evento) | P1 |
| `sfx-ui-bossbar-in` | Barra de boss aparece | Sting corto de amenaza | P2 |
| `sfx-ui-prompt` | Prompt de interacción flotante aparece | Blip sutil | P3 |
| `sfx-ui-click` / `sfx-ui-hover` | Botones de menú (Play/Unlocks/Settings/Exit, Continue, Leave, Resume…) | Click/hover mecánico de juguete — universal | P1 |
| `sfx-ui-pause` / `sfx-ui-unpause` | Pausa | Whoosh in/out + duck de música | P2 |
| `sfx-ui-victory` | "You Survived" | Fanfarria de victoria (la run entera desemboca aquí — que se sienta GRANDE) | P1 |
| `sfx-ui-defeat` | "Overloaded" | Power-down + sting melancólico-mecánico | P1 |
| `sfx-ui-slider-tick` | Sliders de volumen | Tick por paso (además sirve de preview del volumen elegido) | P2 |

## 8. Ambiente (Mapa 1 — fábrica muerta)

| ID | Qué | Prioridad |
|---|---|---|
| `amb-factory-loop` | Cama base: viento entre chapas + maquinaria MUY lejana + crujidos metálicos ocasionales. Es una fábrica MUERTA — el ambiente es vacío, no actividad | P2 |
| `amb-portal-hum` | Hum espacial del portal (ya listado en §3, es la única fuente ambiental "viva") | P2 |
| `amb-merchant-beam` | Drone sutil del beam ámbar del chatarrero mientras está activo | P3 |

## 9. Música — diseñada sobre los beats reales del código

La dificultad escala LINEAL (`difficultyScalar` es el knob único; waves 2.8s→0.65s, cap 28→380 enemigos), así que la música debe ser **por capas con crossfade continuo**, no por saltos. Los desbloqueos de enemigo (2:00 Sparkrunner, 4:00 Rustbrute/Roller, 5:00 Gunner, 6:00 Drone) y las visitas del chatarrero (2:00/5:00/8:00) son los puntos naturales para añadir capa.

| ID | Pieza | Diseño | Prioridad |
|---|---|---|---|
| `music-menu` | Menú principal | Industrial-synth contenido, con el "tema Voltswarm" reconocible. Loop ~1:30 | P1 |
| `music-run-scrapyard` | Combate Mapa 1 | Industrial percusivo (metales golpeados, servos como percusión, bajo synth). **3-4 capas verticales** (base → percusión → lead → caos) mezcladas contra `difficultyScalar`. Loop ~2:00 por capa, todas alineadas | P1 |
| `music-boss` | Boss activo | Capa/pieza de intensidad máxima; **entra en `state === 'summoning'`** (el telegraph de 2.5s es el pickup perfecto) y sale con DESTROYED. El boss es a demanda del jugador — trigger por estado, nunca por reloj | P1 |
| `music-victory` / `music-defeat` | Pantalla de fin | Stings de 5-8s (pueden ser variaciones del tema del menú) | P1 |
| `music-merchant-duck` | Ventana del chatarrero | No es pieza nueva: **duck** de la música de combate + capa cálida ligera opcional mientras la tienda está abierta | P2 |
| `music-run-foundry` / `music-run-neon` | Mapas 2-3 | Arco fundición → neón/synth. **Post-v1** — anotado para no perder el arco | P3 |

## 10. Requisitos técnicos del sistema de audio (para la implementación, no para la generación)

- **Motor**: Web Audio API (nativo en Electron) o Howler.js. Un `src/audio.ts` central: `sfx(id, {pitch, volume})` + `music` con capas y crossfade.
- **Los 3 sliders de settings ya existen** — `src/settings.ts` persiste master/music/sfx: cablear el mixer a ellos es el primer paso.
- **Pool de voces + variación**: pitch aleatorio ±10% en todo SFX repetitivo, cap por categoría (muertes ~6, golpes ~4, pickups ~4). Sin esto, 400 enemigos = puré blanco.
- **Atenuación por distancia** para loops espaciales (portal, drone, merchant beam): con la cámara top-down basta distancia 2D al jugador, no hace falta HRTF.
- **Prioridad de mezcla**: jugador herido > boss > armas > muertes > pickups > ambiente.
- **Ducking**: música baja durante ruleta de cofre, tienda, pausa y pantallas de fin.

## Resumen de volumen de trabajo

| Bloque | P1 | P2 | P3 | Total |
|---|---|---|---|---|
| Armas | 12 | 1 | 1 | 14 |
| Mods | 4 | 15 | 2 | 21 |
| Enemigos/bosses | 8 | 5 | 0 | 13 |
| Jugador | 5 | 0 | 1 | 6 |
| Economía/pickups | 9 | 4 | 2 | 15 |
| Draft/UI/menú | 7 | 7 | 1 | 15 |
| Ambiente | 0 | 2 | 1 | 3 |
| Música | 5 | 1 | 2 | 8 |
| **Total** | **~50** | **~35** | **~10** | **~95** |

**Orden de ataque sugerido**: (1) `src/audio.ts` + mixer cableado a settings → (2) los ~50 P1 (con eso el juego "suena completo") → (3) playtest de mezcla → (4) P2 → (5) P3 post-feedback.
