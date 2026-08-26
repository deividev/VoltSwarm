# Voltswarm — PRD v2 (definitivo)

## Alcance de variantes — fuente de verdad

**Juego completo (`codex/map-2`):** Mapa 1 / Scrapyard → Mapa 2 **Swarm Foundry** → **Hazard Marshal**. Hazard Marshal conserva `modelKey: 'final-boss'` y su baseline jugable quedó **CERRADA en el candidato 0.22.0**: llegada propia, arena despejada con muro, fuego retenido en las 11 armas, combate de tres fases, sweep/volley/assembly/overload, refuerzos, audio y desenlace. Solo quedan diferidos el balance fino con runs humanas y una posible arena reactiva/modular. Volt Warden es diseño histórico/futuro, no el boss final vigente.

### Snapshot vigente — source/HEAD 0.30.8 (2026-08-26)

| Área | Estado real |
| --- | --- |
| Arco | Mapa 1 exige 10:00 + ≥1 boss; sin boss termina `OBJECTIVE FAILED` (`boss-required`). El cruce conserva build, nivel, XP y descartes, cura al 100% y deja oro en 0. El crédito final depende de sectores acreditados; matar solo al boss final sin crédito previo no produce `run-complete`. |
| Foundry | Raster floor, stacks/cells, cover, arena wall, and per-map sky/fog are implemented. The current replacement slice is CLOSED with Furnace Mite, Axle Runner, and Slagcaster. The ambient presentation is closed at its current visual state; molten-flow glow and voxel sparks are optional future enhancements. Forge Dart, further Rustbrute/Drone replacements, Arc Courier, and other enemy expansion are deferred. |
| Profile and content | Global weapons 2→3; global Cores 2→4; discards 3→4. 11 registered weapons / 10 playable (Oil disabled), 20 Cores, 17 Mods, and 29 declared / 29 active Contracts. Field Engineer, Rack Hauler, and Overclocker are final and CLOSED for the current release scope; Proving Ground and Two of a Kind unlock the two additional characters. |
| Achievements / Steam | 20/20 launch achievements are implemented in `ACHIEVEMENT_REGISTRY`, including durable startup/end-of-run evaluation and the `steamworks.js` 0.4.0 **Steam achievement transport**. SDK init, App ID, `electronEnableSteamOverlay`, native packaging, IPC, allowlist, and outbox are auxiliary achievement-unlock infrastructure, not separate features. The maintainer confirms that the matching 20 entries are created in Steamworks App Admin for App ID `4979220`. Publication, uploaded icon state, and a production-build unlock smoke are not evidenced by the repository. Every other Steamworks product API—Leaderboards, User Stats, Cloud, Workshop, Rich Presence, Friends/lobbies/networking, Steam Input, Inventory/DLC/microtransactions, and any unlisted integration—is not implemented and outside launch scope; reconsider post-launch only with sufficient visibility/traction, with no commitment. |
| Recompensas | Cofres pagados a 0.5× entregan Mods. Skip/descartes está implementado; Reroll y Banish siguen pendientes. Barrier Cell: 30 s base, −3 s por copias 7–10, mínimo 18 s, cap 10. La recomendación de arma del personaje se presenta como `Suggested Start`, nunca como obligación. |
| Audio | Audio v1 and the final `0.30.7` mix baseline are accepted by the maintainer after human playtesting. `pnpm audio:generate` reconstructs 50 events/97 variants from the versioned `audio-masters/runtime/` vault, with hashes/provenance, real format checks, exact coverage, orphan policy, and atomic promotion; runtime and packaging read `assets/audio/sfx/manifest.json`. `AudioDirector` performs a real menu→run overlap without changing the shared bus, cancels stale loads, and fades to silence at run end before the later menu fade-in. No diagnostic counters or quantitative route data were supplied or claimed; no distinct Foundry/boss beds exist. Oil remains disabled and `oil-drop` remains outside the pack. |
| Delivery | Source/HEAD `0.30.8`; `shortMaps=false`, `audioDiagnostics=false`, `mapTransitionKey=false`, and `finaleKey=false`. Production-blocking shortcuts are off and the candidate is ready for post-commit validation/packaging; no `0.30.8` package is claimed yet. |

**Next sequence:** completed human runs plus `pnpm stats` for balance/retention → package the committed `0.30.8` candidate → external Steamworks publication/icon confirmation, production achievement-unlock smoke, and technical close. Audio cohesion, the achievement catalog and Steam achievement transport are closed implementation work; external confirmation and RC validation are not. Other Steamworks APIs are not part of this sequence or the launch scope. Closed characters, the current Foundry visual state, and deferred enemy expansion are not active work items.

## Swarm Foundry — escenografía del Mapa 2 (2026-08-17, v0.13.49 → 0.13.55)

**Suelo.** Textura raster cenital propia (`ground-megafactory-floor-v14.png`), teselada con `RepeatWrapping` a `worldSizePerRepeat: 20` — medido sobre captura, no copiado del Mapa 1, porque cada hoja empaqueta un número distinto de rasgos por tesela. Existe para arreglar un fallo de contraste MEDIDO: el suelo procedural estaba en luminancia media ~39 contra ~31.5 del carboncillo de las torres, un ratio de 1.10:1 que hacía invisibles las estructuras. El raster lo lleva a ~62 y el ratio a ~1.55:1. El canvas procedural queda como fallback honesto.

**Chimenea de fundición (`foundry-stack`).** Prop de periféria y de campo, tres vistas medidas, voxelizado por el camino front-only (`sideProfileRef` + `backPaintRef` + `sidePaint`) porque `voxelizeMultiView` no puede producir sección redonda. Silueta con plinto escalonado, fuste que afina, tres bridas que sobresalen, tubo externo con codo y corona volada. Tres recoloreados vía `recolorMap` (acero / hierro cálido / grafito), que varían temperatura Y luminancia porque a luma ~38 el toon aplasta el matiz puro.

- **Anillo:** 22 unidades a radio 82, tres escalas uniformes (0.85 / 1.0 / 1.2) → alturas 7.5 / 9.0 / 10.5. Separación centro a centro 23.4 unidades, hueco libre entre vecinas 20.8, cobertura del arco 11.3%.
- **Campo:** 7-10 a escala 0.85, cantidad y posición aleatorias por partida y por cruce de mapa.
- **Regla de proporción:** se juzga en PÍXELES DE PANTALLA. La cámara a 51.6° proyecta la altura por `cos(51.6°) = 0.62`, así que un 3.3:1 de mundo lee 2.07:1 en cuadro y un 2.0:1 lee 1.24:1, que es un cubo.

**Celda de energía (`powercell`).** Prop de dispersión, 46-62 por partida, tres recoloreados (acero / óxido / pálida). A diferencia de la chimenea sí varían por MATIZ, porque es tono medio (~77) y ahí el matiz sobrevive. Conserva su núcleo cian.

**Colocación.** `regenerateProps` corre en `startRun` y en la transición de mapa, así que cada entrada a la fundición trae un reparto nuevo. Los props evitan el tótem del boss y — desde 0.13.54 — también las estructuras propias del mapa: antes solo esquivaban el tótem, y las celdas se reparten hasta `ARENA_HALF_SIZE - 4 = 86`, atravesando el anillo, de modo que podían plantarse dentro de una torre.

**Rendimiento validado:** 430 enemigos, mediana de frametime 8.30 ms y p99 8.50 ms contra un período de vsync de 8.33 — sigue limitado por el refresco, no por la carga.

**Foundry visual scope:** the current ambient presentation is closed. Molten-flow glow and voxel sparks are optional future enhancements, not RC requirements. The current enemy replacement slice is closed; additional replacements are deferred rather than active backlog. Per-map sky/fog, arena clearing, and the base wall are implemented; a reactive/modular arena remains optional.

**Steam Demo (`codex/demo-map1`, snapshot separado `0.13.39-demo`):** solo Scrapyard / Mapa 1. Boss derrotado → `SECTOR CLEARED`; timeout sin boss → `SECTOR HELD`. No transiciona a Mapa 2 ni contiene Hazard Marshal, y no describe el flujo ni los metadatos de producto de esta rama de juego completo.

Fecha: 2026-07-02. Extiende el spec base (`CLAUDE_megabonk_3d.md`) con las decisiones del playtest del usuario y el estudio de la base de Megabonk. Método: `docs/METODO_DISENO.md`. Arte: `docs/DIRECCION_ARTE.md`. Diseño de mejoras: `docs/DESIGN_MEJORAS.md`.

## Estado de la arquitectura (actualizado 2026-08-06, v0.13.11-demo)

0. 🔑 **Mapa 1 exige tiempo Y boss para abrir Mapa 2** — actualizado 2026-08-09,
   spec en §12. Es la regla que hay que leer antes de tocar el final de una run.
0b. ✅ **Persistencia a prueba de cortes** — `electron/safe-save.ts`: escritura
   atómica (temp → fsync → rename) para settings/perfil/historial y cuarentena de
   saves corruptos en `.corrupt-<ts>`. Antes, un corte de luz mientras guardaba
   —y guarda al final de CADA run y CADA contrato— borraba en silencio todo el
   progreso, porque los cargadores leían un JSON truncado como "no hay save".
   Cubierto por `test:safe-save`.
0c. ✅ **Arranque a pantalla completa en la resolución del jugador** — el default
   era el literal `1280x720` contra una lista de tres tamaños 16:9 fijos, así que
   1440p/4K/ultrawide no tenían entrada y `normalizeSettings` los empujaba a 720p.
   La lista se deriva ahora de la pantalla, el nativo siempre está presente, y los
   tamaños se guardan en píxeles físicos divididos por `scaleFactor` antes de
   llegar a Electron (que dimensiona en DIP). General lo presenta como **Window
   Resolution**: queda deshabilitado en Fullscreen porque allí manda la resolución
   nativa, pero conserva la elección y la restaura al volver a Windowed. UI Scale
   permanece independiente. Cubierto por `test:display`.
0d. ✅ **Escala de UI accesible** — General ofrece `Auto` (default), `100%`,
   `125%` y `150%`, con auto-apply y persistencia. Auto usa la resolución física:
   100% hasta 1080p, 125% desde 1440p y 150% desde 4K. Se aplica mediante page
   zoom de Electron a TODO el DOM (HUD, menús, overlays, precios, prompts,
   indicadores BOSS/SHOP, intro de nivel, números y avisos) sin agrandar geometría
   3D. La resolución física llega por contextBridge desde Electron para que el
   propio zoom no contamine la detección vía `devicePixelRatio`; cada resize por
   zoom refresca también el pixel ratio del renderer para evitar WebGL borroso.
   La política pura —migración de saves legacy/inválidos, valores permitidos y
   umbrales de Auto— está cubierta por `test:display`. **Aceptación Electron:**
   los valores explícitos sobreviven a reinicios; el cambio se ve al instante;
   Auto se recalcula al mover la ventana entre monitores; las coordenadas
   world-to-screen siguen alineadas con sus marcadores DOM; el mundo 3D conserva
   tamaño y proporciones y el WebGL permanece nítido.
0e. ✅ **`pnpm test` agregado** — había 17 scripts `test:*` y ninguno que los
   corriera todos, así que cada cambio se validaba solo contra el test que uno
   recordara. `pnpm test` (~7 s) antes de cada commit; `pnpm test:all` incluye
   los que arrancan Electron/navegador, antes de congelar un build.

1. ✅ **Foundation de audio** — implementada 2026-07-17, ver §"Audio Foundation" al final. No incluye el catálogo completo.
2. ✅ **Perfil persistente + Contratos** — implementados 2026-07-25, ver §"Perfil persistente y Contratos". Es el motor de retención y sustituye al panel dev de Unlocks.
3. ⏸️ **Preparación/viabilidad multijugador — DIFERIDA A POST-LANZAMIENTO (decisión del usuario 2026-07-25).** Consumía ~8 de las ~14 semanas restantes hasta el objetivo interno, para una feature que `MULTIPLAYER_FEASIBILITY.md` documenta como no diferenciadora, no prometida y que puede terminar NO-GO — mientras el contenido que decide si el juego vale su precio quedaba comprimido. Del gate se rescató solo la mitad barata: cobertura de smoke tests. **El determinismo de tick fijo, el RNG sembrado y los snapshots siguen sin implementar**, y por eso tampoco se guarda semilla en los registros de run. Si el gate se retoma y da GO, el primer objetivo sigue siendo exactamente 2 jugadores local split-screen; online peer-host exige aprobación posterior; hybrid y dedicated servers quedan fuera de alcance.
4. 🟡 **NOW:** the full arc is playable, the Hazard Marshal baseline is closed in 0.22.0, and audio cohesion is closed in 0.30.7 after maintainer playtesting. The 20 launch achievements and their `steamworks.js` Steam achievement transport are implemented; the maintainer confirms 20/20 matching App Admin entries created. Next: balance/retention with completed human runs → package the committed 0.30.8 candidate → external Steamworks publication/icon confirmation, production achievement-unlock smoke, and technical close. Every other Steamworks product API is explicitly outside launch scope. All three launch characters, the current Foundry visual state, and the current Foundry replacement slice are closed.

## P1 — Estructural

### 1. Orbes de XP con rango de recogida
- Los enemigos ya no dan XP directa: sueltan un orbe donde mueren.
- El jugador recoge orbes acercándose a su `pickupRange` (stat de la ficha); el orbe vuela hacia él acelerando.
- Orbes cercanos entre sí se fusionan (suman valor) para controlar densidad y rendimiento.
- Render: 1 InstancedMesh, pool con cap.
- Criterio de aceptación: matar lejos y no acercarse = no XP. Recoger dispara level-up.

### 2. Ficha de stats RPG + pool de mejoras con rareza
- Ficha del personaje: Damage, Attack Speed, Crit Chance, Crit Damage, Move Speed, Attack Range, Pickup Range, Projectile Count, Projectile Speed, Area (tamaño de disparos/efectos), Armor (rating porcentual con retornos decrecientes), Regen y Luck (rating porcentual que desplaza pesos de rareza).
- **Semántica de Armor y Luck (2026-08-03):** ambos se almacenan como fracciones y se muestran como porcentaje (`0.08` = `8%`). Armor NO es reducción directa punto por punto: la reducción efectiva es `armor / (armor + 1)`. Luck NO es una probabilidad directa de tier: desplaza los pesos azul/morado/dorado y luego se normaliza el pool completo. La migración desde puntos conservó las curvas anteriores; la única excepción posterior es el experimento Common de Lucky Gear documentado debajo.
- Level-up: al cruzar el umbral de XP, primero se muestra un beat visual `LEVEL UP!` encima del jugador (`VISUAL.levelUpIntro`) y después se abre la UI con 3 cartas aleatorias entre mejoras de stat y cartas de arma (desbloquear/subir nivel de arma).
- **Tiers (rareza) — DEFINICIÓN CANÓNICA. 5 tiers: gris → verde → azul → morado → dorado** (`Rarity` en `upgrades.ts`; pesos de tirada en `TIERS.weights`/`luckShift`, Luck sube los tiers altos). ⚠️ Cada categoría usa los tiers DISTINTO — esto es lo que hay que respetar para que no haya desalineamientos:
  - **Calibración base (playtest 2026-07-17; experimento 2026-08-04):** con `Luck = 0`, pesos por carta 62/27/9/1.8/0.2. En una pantalla de 3 cartas esto deja `5.881%` de ver al menos una morada/dorada y `0.599%` de ver una dorada. La primera copia Common de Lucky Gear baja de `+6%` a `+4%`: con ella las probabilidades pasan a aproximadamente `11.633%` y `2.857%`. Es el ÚNICO número de balance que cambia para el próximo playtest humano; Luck base sigue en `0%`, los tiers superiores siguen en `8/10/14/20%` y no cambian pesos, `luckShift`, fórmulas, consumidores, desbloqueos ni economía de cofres/chatarrero.
  - **Orbes (Cores):** el tier se **TIRA** en cada carta del draft (luck-weighted). El tier fija la **magnitud** del stat: cada core define un array de 5 valores `[gris, verde, azul, morado, dorado]`. Un mismo core puede salir en CUALQUIERA de los 5 tiers.
  - **Sustain (2026-08-11):** Nanobot Swarm cura `1/6, 2/6, 3/6, 4/6, 5/6` HP cada 10 s por tier; tanto la carta como la ficha lo presentan como `1/2/3/4/5 HP/min`, derivado de la misma configuración. Hull Plates aumenta solo el Max HP: no modifica el HP actual ni activa Field Repair. Field Repair cura 1% del HP máximo tras instalar o subir cualquier otro Core durante gameplay. La ficha muestra una fila `Max HP` con el total vivo del jugador. Leech Coil usa `0.1/0.5/1/1.5/2%` de probabilidad por golpe para curar exactamente 1 HP, con un cooldown global de 1 s entre curaciones.
  - **Compatibilidad del draft (2026-07-17):** un core dependiente de arma solo entra si al menos un arma o mod instalado consume realmente ese stat. La matriz explícita cubre Range, Projectile Speed, Area, Duration y Projectile Count; los stats universales permanecen siempre disponibles. Así una elección de socket permanente nunca es una carta sin efecto para la build actual.
  - Chaos Module usa la misma matriz y la misma regla de valor marginal que el draft directo: no puede elegir un stat incompatible ni Crit Chance o Lifesteal cuando ya alcanzaron su cap efectivo. Crit Chance y Lifesteal se limitan además a 100%; Crit Damage y los stats sin techo siguen sin cap artificial.
  - **Mods:** cada mod tiene **UN tier FIJO e intrínseco** (definido en `MOD_REGISTRY`, no se tira). Los 17 mods se reparten así: **5 gris, 4 verde, 3 azul, 4 morado, 1 dorado**. El cofre/tienda tira un tier (luck-weighted) y entrega un mod de ESE tier; nunca cambia el tier de un mod concreto. Barrier Cell es azul: sus copias 1–6 suman una carga hasta 6; las 7–10 bajan la recarga 30→27→24→21→18 s (−3 s por copia, mínimo 18 s). Al llegar a 10 copias deja de entrar en cofre/tienda. Overload Trigger y Orb Siphon son morados/Epic. Overload conserva x2 attack speed durante 5 s y cada copia adicional añade 2 s. Orb Siphon solo puede ser premio de cofre una vez por run; después se excluye de candidatos de cofres, sin cambiar su efecto ni el comportamiento existente del chatarrero.
  - **Armas / Habilidades (cambio de playtest 2026-07-17):** progresan por **NIVEL (Lv1-20)**, pero cada mejora de un arma YA instalada tira tier. El tier escala la magnitud de ESE incremento siguiendo el patrón de referencia de Megabonk: gris/Common ×1 · verde/Uncommon ×1.2 · azul/Rare ×1.4 · morado/Epic ×1.6 · dorado/Legendary ×2. La carta muestra el valor real resultante (p. ej. Tire Fire: +10/+12/+14/+16/+20% damage). Desbloquear un arma sigue siendo azul/base y los milestones discretos de cantidad en Lv3/Lv5 siguen otorgando +1 unidad solo a Bolt Cannon, Orbital Blades, Tire Fire, Turbine Fan y Junk Ricochet; la rareza escala sus mejoras continuas, no proyectiles fraccionarios.
  - Precios de cofre/tienda por tier (escalan con el minuto de run): gris 25 / verde 45 / azul 80 / morado 140 / dorado 240 (`MERCHANT.tierPrices`).
- **Contrato visual de cofres (playtest 2026-08-09):** cada cofre activo que esté dentro de la pantalla muestra permanentemente un marcador compacto con SOLO el icono de chatarra y su precio vigente. Verde indica que se puede pagar y rojo que falta chatarra; no muestra tier, texto de estado, panel, fondo, borde ni información adicional. El marcador se proyecta desde el mundo sin depender de la distancia ni aplicar escalado manual; UI Scale lo amplía mediante el zoom global de Electron. Los cofres fuera de pantalla no generan flechas. Este marcador es informativo: solo `nearestOpenable()` y `CHEST.interactRadius` habilitan la interacción, y la fórmula económica permanece `round(tierPrice × CHEST.priceMult)`.
- **HISTÓRICO / SUPERSEDED:** el diseño temprano de cofres con recompensas directas de stats generales fue retirado. El cofre vigente es de pago (`tierPrice × 0.5`), fija su tier al aparecer y entrega exclusivamente un Mod elegible de ese tier.
- Los cofres pagados excluyen Repair Kit cuando el jugador ya está a vida completa. Si el propio cofre entrega la primera copia de Orb Siphon, ese mismo cofre ya activa la aspiración global; desde entonces Orb Siphon deja de entrar en candidatos de cofres durante esa run. Barrier Cell es un Mod azul unificado de cofre/tienda, nunca una carta de level-up ni Chaos: cada copia tiene valor visible y acumulativo, primero capacidad y luego recarga.
- Pase Steam 2026-07-15: abrir un cofre dispara un burst voxel dorado/blanco y shake corto; si Orb Siphon está activo, la vacuum de XP usa burst azul/blanco en el jugador y los orbes arrancan más rápido con un pulso de escala para leerse mejor en GIFs.
- TEMP test 2026-07-15 → REVERTIDO Y CERRADO 2026-07-17: `RECORDING.chestTesting.forceGreenChests`, `forceOrbSiphonReward` y `RECORDING.levelUpDraft.enabled` están en `false`; `GOLD.startingGold` está en `0`. Todos los rigs temporales de captura están desactivados.
- Pase Steam 2026-07-15: la llegada del Scrapper tiene burst cálido, núcleo blanco, anillo de impacto, shake suave y pulso inicial del beam (`VISUAL.merchantVfx`) para que el momento sea claro en GIF antes de abrir la tienda.
- Criterio: dos runs consecutivos ofrecen builds distintas; Luck visible en la calidad de cartas.

### 3. Dificultad unificada
- Un único escalar de Dificultad = rampa temporal × (1 + bonus de cartas malditas).
- Gobierna: tamaño de oleada, intervalo de spawn, multiplicador de vida, probabilidad de elite.
- Criterio: subir dificultad por carta se nota en spawns en <30 s.

### 4. Separación entre enemigos
- Grid espacial (hash); empuje posicional entre enemigos que se solapan.
- El enjambre no colapsa en un punto: se ve más grande y rodea al jugador.
- Voladores excluidos.

### 5. Números de daño flotantes
- Texto flotante en cada golpe (pool DOM proyectado a pantalla, cap ~48).
- Pase Steam 2026-07-15: daño normal más grande y contrastado para lectura en vídeo; críticos con jerarquía fuerte (más grandes, dorados, glow cálido) para que destaquen en GIFs sin convertir todo el combate en sopa visual.

## P2 — Contenido y tuning

### 6. Elites
- Probabilidad por Dificultad. Elite = tipo base con ×escala, ×vida, tinte magenta distintivo.
- Al morir sueltan un COFRE (cierra el loop elite → recompensa).
- **Marcador unificado (2026-07-13, pedido del usuario: una sola señal legible al primer vistazo en cualquier tipo)**: anillo SEGMENTADO magenta ROTANTE bajo todo élite (`ELITES.aura` en config: color/grosor/segmentos/giro/escala). Lenguaje de patrón reservado: élite = segmentado magenta girando · boss = doble anillo rojo sólido. El anillo previo (fino, tenue, sin giro) no se registraba jugando.

### 7. Enemigos nuevos: Roller y Gunner
- **Roller** (robot bola): carga en línea recta con giro limitado — se pasa de largo; castiga quedarse quieto, se esquiva lateralmente. Rueda visualmente.
- **Gunner** (a distancia): mantiene ~12 u, dispara proyectil lento al jugador. Rompe el kiting como respuesta universal. Requiere sistema de proyectiles enemigos.

### 8. Colisión con props del mapa
- Solo props grandes (lista de colisionadores circulares). Jugador y enemigos se deslizan (push-out circular). Sin pathfinding: props escasos y convexos.

### 9. Tuning numérico (un cambio por playtest)
- Mejoras de stat al rango Megabonk (8-15% común) — ya cubierto por rareza del punto 2.
- Vida base de enemigos +20%.

## P3 — Estructura de run

### 10. Tres armas nuevas (para habilitar el draft)
- **Arc Welder**: rayo continuo al más cercano; el daño CRECE mientras no cambie de objetivo.
- **Hydraulic Press**: pistón que aplasta una franja frontal (dirección de movimiento) cada X s.
- **Tire Fire**: neumático ardiendo que rueda en línea recta atravesando todo.
- Base P1: 6 armas. El roster implementado actual tiene 11 IDs; 10 están disponibles por perfil/contratos y Oil Sprayer permanece fuera del camino de desbloqueo.

### 11. Draft de arma inicial y tope de armas
- Al empezar run: 3 opciones aleatorias del pool desbloqueado (5 armas en un perfil nuevo); la elegida es tu arma inicial (reemplaza al Bolt fijo).
- **Capacidad de armas por build:** 2 en un perfil nuevo y 3 tras Boss Hunter. Mientras quede un socket libre, el level-up puede ofrecer desbloqueos; al llenar la capacidad desaparecen y solo salen mejoras (stats + niveles de tus armas).
- **Panel de build** a la izquierda de la pantalla: iconos con las armas (y su nivel) y cada stat que hayas subido, actualizado con cada elección y cofre.

### 12. Tótem + boss aleatorio

> **🔑 REGLA VIGENTE (2026-08-09): Mapa 1 exige tiempo Y boss para abrir Mapa 2.**
> No la deshagas sin leer esto — un test la protege a propósito.
>
> **Por qué existe:** hasta esta fecha, llegar al final del tiempo despejaba el
> sector hicieras lo que hicieras, así que el portal era un desvío opcional sin
> recompensa asociada. Medido: **0 bosses invocados en 6 runs humanas**, incluidas
> las 2 que agotaron el reloj, con la flecha indicadora señalándolo todo el rato.
> Un juicio de dos jueces ciegos sobre Contratos confirmó lo mismo desde el otro
> lado: los premios de más peso del motor de retención estaban detrás de contenido
> que nadie tocaba.
>
> **Cómo se implementa, y difiere por rama porque los modelos difieren:**
> - **`codex/demo-map1`** (sin `run-flow`): la regla cae en el DESENLACE. Boss
>   muerto → `sector-cleared` (**Sector Cleared**); tiempo agotado sin boss →
>   `survived` (**Sector Held**). "Sector Held" no está redactado como fracaso:
>   el jugador aguantó la run entera, simplemente no la despejó.
> - **`codex/map-2`** (con `run-flow`): la regla cae en el DESBLOQUEO.
>   `RunFlowState.mapBossDefeated` gatea la transición y `sectorsCleared += 1`.
>   Si el reloj de Mapa 1 llega a cero sin haber derrotado un boss, `run-flow`
>   devuelve una acción terminal explícita y la run acaba inmediatamente como
>   `defeat`: no transiciona, no espera congelada en cero y no otorga crédito.
>   Si el boss ya cayó, el reloj abre Mapa 2 y acredita el sector 1. El flag se
>   resetea al cruzar para que el boss de un sector nunca pague el siguiente.
>
> **Consecuencia deliberada en `codex/map-2`:** ya no existe una ruta jugable que
> salte el boss de Mapa 1 y llegue al finale. Completar el arco exige derrotar el
> boss de Mapa 1 antes de su timeout y después al Hazard Marshal. Cubierto por
> `tools/map-flow.test.mjs`, incluido el outcome terminal y la ausencia de
> transición/crédito cuando falta el primer boss.
>
> **Descubribilidad, mismo pase:** el indicador dice **BOSS** (no `TOTEM`), el
> modelo pasa de `voxelSize` 0.12 a 0.16, y su haz/anillo/pilar derivan del modelo
> vía `portalScale()` en `boss.ts`. **La DISTANCIA (`BOSS.totemDistMin/Max`,
> 45-65) NO se tocó** — si un playtest vuelve a dar 0 bosses, el culpable es esa.
> El HUD mantiene una misión compacta en el extremo derecho de la banda superior,
> opuesta a oro/kills: sobrevivir hasta agotar el tiempo y derrotar el boss para
> abrir el siguiente sector. Marca la baja del boss con `[X]`; en Mapa 2 adapta
> el segundo objetivo al boss final. Los indicadores off-screen BOSS/SHOP usan
> ahora triángulos CSS de 28×26 px y labels de 11 px, sin depender de glifos
> no-ASCII; conservan colores, proyección al borde seguro y el zoom de UI Scale.

- Un tótem con beam distintivo (rojo) spawnea en posición aleatoria lejana al iniciar el run.
- Al entrar en su zona aparece el prompt "Press E to summon the boss"; el boss SOLO spawnea al pulsar la tecla — nunca por pasar al lado.
- **Invocación telegrafiada (2026-07-05, feedback de playtest)**: al pulsar E el tótem gira acelerado durante `BOSS.summonDelayS` (2.5 s) y el boss materializa a una distancia mínima del jugador (`BOSS.spawnMinDistFromPlayer`, 14 u, empujado en la dirección jugador→tótem y clampeado al arena) — nunca encima del jugador.
- La invocación trae UN boss aleatorio de un pool de 2:
  - **Crusher King**: tanque con embestida telegrafiada y spawn de scraplings.
  - **Tesla Titan**: mantiene distancia y dispara ráfagas radiales de proyectiles.
- En el Mapa 1, matar al boss NO termina el sector: suelta 3 cofres + su orbe de XP y a los ~25 s se alza un nuevo tótem cuyo boss tiene +60% de vida. Al llegar a 10:00, la run cruza al Mapa 2 solo si ya cayó un boss; si no, termina inmediatamente como derrota. Cuando cruza, el reloj del mapa se reinicia, pero el reloj total y la build continúan.
- Cada final de run persiste un registro local versionado con resultado, mapa donde terminó, versión del build, fecha, duración total, `sectorsCleared`, `mapsReached`, nivel, kills, bosses, build completa y daño real por arma. Son datos crudos para poder separar rendimiento por mapa y distinguir una run completa de una derrota larga sin inferirlo por duración.
- Pase Steam 2026-07-15: el spawn de boss tiene beat de materialización reforzado con burst rojo, núcleo blanco, anillo de impacto y shake dedicado (`VISUAL.bossSummonVfx`) para que el título `AWAKENS` sea capturable.
- **Arco vigente (actualizado 2026-08-20):** Mapa 1 durante 10 minutos + boss obligatorio → transición → Mapa 2 durante 10 minutos → Hazard Marshal baseline 0.22.0. `RUN COMPLETE` requiere crédito estructural de ambos sectores; se limpian actores/efectos locales y el jugador reaparece en el centro seguro.
- **🔑 Qué se conserva al cruzar (decisión cerrada 2026-08-15, v0.13.41 — sustituye al comportamiento anterior de arrastrar oro y HP):**
  - **Se conserva:** armas, cores, mods, niveles, potencia acumulada, **descartes de level-up** y contadores de run. El reloj total sigue corriendo.
  - **Vida: se cura al 100%.** Cruzar es un premio, no un castigo por haber sobrevivido justo.
  - **Oro: empieza de 0.** La economía del Mapa 2 arranca limpia.
  - **XP:** el nivel se conserva y la curva no se toca — `xpForLevel` depende solo del nivel, así que subir "alineado a la oleada" ocurre por construcción (el Mapa 2, más denso, suelta más orbes).
  - **Dificultad vigente:** Foundry usa `{ floor: 0.7, peak: 1.15, rampS: 600 }`; HP lee el reloj de arco y el roster avanza con reloj local ×2.5. Calibrar con `pnpm stats` segmentada por mapa.
- **Transición animada de sector (2026-08-16, v0.13.43-0.13.47):** el cambio de mapa dejó de ser un salto de un frame. Estado `map-transition` (espeja a `defeat-transition`): cortina a negro → **el mundo se cambia oculto en el negro pleno** → hold sobre el nombre del sector → fundido de entrada. Duración total **2.8s** en `config.MAP_TRANSITION` (0.8 / 1.1 / 0.9), alargada desde 1.55s tras playtest. La **música cabalga la misma curva** que la cortina (silencio al negro, vuelta al aparecer el mapa), y el nombre del sector entra con animación escalonada `steps()` al llegar al negro. Pendiente: sting propio y camas de música por mapa (0c del roadmap).
- **Fallo del gate = `OBJECTIVE FAILED` (2026-08-15, v0.13.41):** si la run llega a 10:00 sin haber derrotado un boss, la pantalla de resultados dice explícitamente que faltó el objetivo, en vez del `SYSTEM OVERLOAD` genérico de muerte. La muerte por daño conserva su pantalla de siempre.
- **Atajos de desarrollo del arco (gateados, el guard de release aborta el empaquetado si quedan encendidos):** `DEV_TOOLS.simulateMap1Handoff` arranca la run directamente en el Mapa 2 con la build de la última run grabada superpuesta, como si se hubiera cruzado; `DEV_TOOLS.mapTransitionKey` añade la tecla **T**, que ejecuta la transición REAL (con su animación) y aterriza en el mapa siguiente con esa misma build. El avance del arco usa la función `enterMap` de `run-flow.ts`, la misma del cruce real, para que el atajo no pueda divergir de lo que ve el jugador.
- Arco estético vigente: fábrica abandonada/desguace → **megafábrica futurista activa**. La antigua ciudad neón/estación orbital no se borra: queda como capa de inspiración o escenario posterior, no como el Mapa 2 de esta primera versión jugable (detalle en `DIRECCION_ARTE.md`).
- **Selector de mapa inicial (solo desarrollo, 2026-08-02):** `DEV_TOOLS.startingMapSelector` añade Map 1 / Map 2 al draft de arma para probar directamente la megafábrica. Al empezar en Map 2, sus relojes y `sectorsCleared` parten de cero, se aplica su offset de dificultad y no se crean ni el tótem ni los props del scrapyard. Ese final registra `sector-cleared`, `sectorsCleared: 1` y `mapsReached: 2`: es una prueba parcial veraz, no una run completa ni progreso inventado del Mapa 1. Con el flag apagado no se renderiza el selector y todo caller empieza en Map 1; el guard de release bloquea el empaquetado mientras siga encendido.
- Barra de vida del boss en el HUD.

### 13. Enemigo volador (Drone)
- Vuela por encima del enjambre: ignora separación y colisiones de props ambientales; entra directo. Las estructuras interactivas (portal, cofres y Scrapper) sí lo bloquean, igual que al resto de enemigos.
- Las armas le pegan igual (el combate es 2D en XZ).

### 14. Colocación segura y navegación entre obstáculos — implementado 2026-07-17
- Todo spawn de estructura valida su radio completo contra los límites del suelo y contra el espacio ya ocupado. Si no existe un punto legal, el spawn se omite o reintenta más tarde: nunca se coloca fuera del mapa ni solapado.
- Portal, Scrapper y cofres aportan colliders dinámicos al mismo conjunto que usa jugador, enemigos y búsquedas de spawn. Dejan de ser atravesables mientras están activos.
- Los cofres activos reservan una separación mínima configurable entre centros (`CHEST.minSpawnSeparation`), también en las recompensas múltiples de boss.
- Enemigos y bosses combinan steering tangencial anticipado con varias pasadas de resolución de colisión; los casos de centro exacto ya no se ignoran. Los spawns de enemigos también respetan arena y obstáculos.
- El layout del scrapyard reduce densidad y amplía carriles: gates de contenedores más abiertos y separados, y menos bidones con mayor separación. El hueco físico medido es ~7,01u; el Crusher King reducido mide 5,2u de diámetro, deja ~1,81u de holgura dura total y conserva ~0,91u de corredor de steering al incluir el clearance.
- Los spawns regulares de oleada vuelven a muestrear dentro del anillo real alrededor del jugador; ya no se clampa un candidato exterior hacia el borde, evitando apariciones repentinas junto al jugador cuando este está cerca del límite.

### 15. Combate con oclusión y feedback de recursos — implementado 2026-07-17
- El auto-target elige el enemigo más cercano con línea de visión libre. Si un contenedor, bidón o estructura interactiva bloquea al objetivo más cercano, busca el siguiente visible.
- Proyectiles del jugador y enemigos hacen colisión barrida contra obstáculos y desaparecen con impacto; no atraviesan props entre frames. Daño, control, beams, AoE, rebotes y procs también respetan línea de visión desde su origen.
- Los números de daño normales suben a 20 px y los críticos a 30 px. XP y oro recogidos aparecen durante 1.05 s a la derecha del jugador con color propio (`+N XP` cian, `+N GOLD` dorado).
- La potencia acumulada por tiers de las mejoras de arma se conserva junto al historial local de la run para que dos armas con el mismo nivel nominal pero tiradas distintas no pierdan información.

## P0 Steam readiness — Implementado 2026-07-04

- Marca de lanzamiento: **Voltswarm**. La horda robótica puede referirse internamente como **the Volts**.
- Pausa: `Escape` pausa/reanuda y perder foco pausa automáticamente la run.
- Menú de pausa: Resume / Settings / Quit to Menu.
- Settings: display mode, **Window Resolution** (editable solo en Windowed), UI Scale (Auto/100%/125%/150%) y volumen master/music/SFX; persistencia vía Electron y fallback localStorage.
- Branding de app: icono voxel placeholder conectado a Electron y al empaquetado Windows. Es **placeholder técnico**, no icono final; se reemplaza después del pase de arte.

### Menú inicial (Implementado 2026-07-12)

- **Gate de lanzamiento**: cada arranque de la app empieza en una vista `boot` no interactiva sobre el mismo key-art del menú. La primera pulsación de cualquier tecla o botón de mando (incluidos mandos DirectInput y su HAT) activa Web Audio, inicia una sola vez la música del menú y revela sus controles. Esa pulsación se consume completa: nunca navega ni activa el menú que acaba de aparecer. Volver desde una run omite el gate y muestra el menú directamente.
- **Vista fuera del juego**: tras el gate, el menú es una vista DOM opaca con fondo key-art; el 3D NO se renderiza detrás (`game.ts` salta el render en estados `boot` y `menu`). Botones: Play / Characters / Contracts / Settings / Exit. Play → selección de personaje → draft de arma inicial → carga → run. La esquina inferior derecha muestra `MAJOR.MINOR.PATCH Label` (por ejemplo, `0.10.2 Beta`); `vite.config.ts` deriva esa presentación desde el SemVer crudo de `package.json`, evitando duplicar o reordenar la versión manualmente.
- **Pantalla de carga con warmup** (estado `loading`): al elegir arma, se muestra una pantalla de carga que monta el mundo y renderiza unos frames ocultos antes de revelar el juego, para que no se vea el bajón de rendimiento del arranque. Es el hook donde entra una animación de carga más elaborada.
- **Panel de desbloqueos (dev/temporal) — SUPERSEDED 2026-07-25**: 3 columnas Armas / Orbes / Mods; desbloquear un ítem lo empujaba a `ACCOUNT` (hoy `PROFILE`) en vivo para playtestear con todo abierto. **Lo reemplazaron los Contratos**; el panel sobrevive solo como herramienta de desarrollo detrás de `DEV_TOOLS.unlockPanel` y ya no llega a builds de release. Su persistencia era solo de sesión; la real vive ahora en `src/profile.ts`.
- Criterio de aceptación: el gate acepta teclado, mando estándar y DirectInput/HAT sin filtrar la pulsación inicial; la música solo comienza después de activar Web Audio; volver de una run no repite el gate; el menú no arrastra FPS (3D apagado), el warmup elimina el hitch visible al dar Play, y el panel refleja el estado real de los pools (armas/cores leen `PROFILE` vivo; mods vía `refreshUnlockedMods()`).

### Informe de daño por arma (Implementado 2026-07-17)

- La pantalla final muestra todas las armas equipadas ordenadas por daño, con daño acumulado, porcentaje del total y barra comparativa; las armas de control puro permanecen visibles con `0` para no falsear su participación en la build.
- La misma pantalla conserva una foto completa de la build terminada en tres secciones — Weapons, Cores y Mods — reutilizando exactamente los tiles, iconos, niveles, cantidades y colores de tier del RIG mostrado durante la run. Solo aparecen elecciones realmente obtenidas; no se muestran sockets vacíos o bloqueados.
- `Game.dealDamage` atribuye únicamente el HP realmente eliminado: el overkill no infla las cifras y la ejecución de Dismantler cuenta solo la vida restante del objetivo.
- El daño en el tiempo conserva su arma de origen, por lo que los ticks de Acid Drum se suman a Acid Drum. El daño adicional de mods, como Chain Relay, no se atribuye a la arma que disparó el proc.
- El acumulador se reinicia al construir cada run y no modifica números ni lógica de combate.
- Criterio de aceptación: al finalizar una run, la suma y los porcentajes reflejan el daño real por arma; una build con Oil Sprayer muestra el arma aunque su daño sea cero.

## Pase visual Fase 1 — Implementado 2026-07-05 (plan en REFERENCIAS_VISUALES.md)

- **Post-procesado** (`config.VISUAL`): cadena `RenderPass → UnrealBloomPass → vignette (ShaderPass) → OutputPass`. Bloom por umbral (solo emisivos puros brillan); vignette sutil; el OutputPass es obligatorio o los valores lineales crudos oscurecen todo el frame.
- **Sombras blob**: InstancedMesh de discos para todo el enjambre + disco del jugador (sigue posición, no el bob de caminata). `VISUAL.blobShadow`.
- **Toon shading**: `src/toon.ts` — fábrica `litMaterial()` (MeshToonMaterial 3 escalones, suelo de sombra 45%) sustituye a Lambert en bots, jugador, props, cofres, tótem y armas con malla. `VISUAL.toon`.
- **Suelo con carácter**: textura canvas procedural determinista (placas + desgaste + manchas + costuras; GridHelper eliminado). `VISUAL.ground`.
- **Partículas de muerte**: `src/particles.ts` — pool de 512 cubos voxel con física, color del bot; 26 cubos en boss kill. `VISUAL.deathBurst`.
- **Screen shake**: solo con daño REAL recibido (no MISS/BLOCK — la sacudida es información) y en muerte de boss; decaimiento exponencial. `VISUAL.screenShake`.
- **Cielo degradado + vignette**: fondo con gradiente vertical fundido con la niebla. `VISUAL.sky` / `VISUAL.vignette`.
- **Wobble de enemigos**: implementado pero DESACTIVADO por decisión del usuario tras playtest (`VISUAL.enemyWobble.enabled: false`) — revisar tras el pase de VFX de armas.
- **Animación del jugador**: saltito de caminata + balanceo (config en `PLAYER.walkBobHz/walkBobAmplitude/walkRockAmplitude`, ajustado en dos playtests a 3.2 Hz).
- **Contador FPS dev**: abajo a la derecha, `VISUAL.showFps`, medición con delta crudo.
- Validado todo junto en playtest de usuario: **~120 FPS estables con enjambre masivo mixto**.

## Judgment Day — auditoría de proyecto completo (2026-07-05)

Dos jueces ciegos en paralelo sobre todo el código + docs. Confirmados y arreglados:
- **`Progression.grantXp` con `if` en vez de `while`**: un orbe de XP fusionado (varios kills en un punto) podía superar 2-3 umbrales de nivel de golpe; solo subía 1 y el resto quedaba atascado hasta el siguiente pickup. Arreglado a `while`, ahora devuelve el NÚMERO de niveles ganados (no un booleano).
- **Encadenado de cartas de mejora**: tras arreglar el bug de arriba, subir 3 niveles de golpe mostraba solo 1 pantalla de elegir mejora (las otras 2 se perdían). Decisión del usuario: encolar una pantalla por nivel ganado (`Game.pendingLevelUps`, contador en vez de booleano; `applyUpgrade`/`openChest` re-llaman a `maybeShowLevelUp()` para encadenar la siguiente).
- `docs/REFERENCIAS_VISUALES.md` y `docs/DESIGN_MEJORAS.md` estaban desincronizados del código real (items marcados como pendientes que ya estaban hechos; 7 de 11 armas mal etiquetadas) — sincronizados.

También corregido de paso (trivial, claramente incorrecto): este mismo doc describía una barra de escudo en el HUD que no existe — el escudo son placas cian orbitando al jugador, ver sección v3 más abajo.

Hallazgos de un solo juez, pendientes de triage (no bloquean v1, quedan para revisión futura): `ELITES.scaleMultiplier` con doble uso visual+daño; dodge/block otorgan i-frames completos vía `takeHit(0)`; `BOSS.tesla.speed/preferredDist` son config muerta; `BOSS_TYPE_INDEXES` posicional sin validación; `RicochetWeapon` no escala con `stats.area` (inconsistente con el resto de armas de área).

## Tuning de dificultad (2026-07-05, validado en playtest)

- `PLAYER.invulnAfterHitS`: **0.85 → 0.4**. Diagnóstico: los i-frames capaban el DPS del enjambre entero a ~9.4 (contactDamage/invuln) — bucear en la horda era matemáticamente seguro. Con 0.4 la permanencia dentro de una manada es letal sin castigar el roce ocasional del early game. Validado: "ha mejorado mucho mucho". Siguiente palanca si hiciera falta: `contactDamage`.

## Cámara (decidida 2026-07-05, playtest del usuario)

- Cámara fija de seguimiento con offset en `config.CAMERA` — **(0, 24, 19) ≈ 52° de picado**, bajada desde el (0, 27, 15) ≈ 61° original para que las caras de los modelos voxel lean en pantalla. Validada en playtest: rendimiento correcto con enjambre denso y sin problemas de percepción del peligro por el norte de pantalla.
- Pase Steam 2026-07-15: el jugador tiene una retícula persistente bajo los pies (`VISUAL.playerMarker`): glow tenue + aro cian/blanco + 4 ticks cardinales blancos, con pulso y rotación lenta. Objetivo: lectura en enjambres densos sin cambiar el modelo del player ni colisionar con lenguaje de élite (magenta segmentado) o boss (rojo sólido).
- Cámara libre/rotable por el jugador: DESCARTADA — el encuadre fijo es parte del balance y de la dirección de arte (decisión razonada, no pendiente).

## Pipeline de modelos voxel 2D→3D — Implementado 2026-07-04

- **Sistema**: referencia frontal plana por personaje (`assets/2d/ref-*.png`, gpt-image) → voxelización automática (`src/models/icon-voxelizer.ts`) → registro central (`src/models/registry.ts`). `EnemySystem.upgradeVoxelModels()` intercambia async la geometría de cualquier tipo de enemigo/boss registrado; sin entrada o si falla la carga, se mantienen las primitivas (fallback seguro).
- **Estado actual**: los modelos del enjambre están cableados y validados visualmente con densidad alta. **Hazard Marshal** ocupa el slot `final-boss` y su baseline jugable está cerrada en 0.22.0; el pod **Volt Warden** reconstruido conserva sus hojas como diseño disponible para un enemigo futuro.
- **Herramientas**: `tools/capture-model-preview.mjs <clave>` (viewer con luz del juego) y `tools/capture-ingame.mjs [segundos]` (arranca el juego headless, juega y captura).
- **Criterio de aceptación por modelo**: silueta distinguible a distancia de cámara, paleta exacta, triángulos por instancia en presupuesto (enemigos ~3-6k), y validación final con 400+ enemigos activos.
- **Pase de fidelidad 2026-07-13 (gate de captura)**: los 6 enemigos + jugador migrados de extrusión front-only al pipeline de hojas MEDIDAS de los bosses (`sideProfileRef` + `backPaintRef` — la cámara a 52° ve espaldas/techos y ahora están pintados de verdad); Sparkrunner rediseñado a v5 con brazos (aprobado); excepción Drone (solo espalda pintada — el perfil medido del rotor tapaba el techo); **greedy meshing en Y** en `voxel-builder.ts` (-27% a -66% de triángulos, visual idéntico). Rim light probado y rechazado por el usuario (revertido).
- Detalle del método y reglas: `DIRECCION_ARTE.md` (pipeline + extensión a VFX/audio) y `PROMPTS_IMAGENES.md` §6 (prompt maestro).

## v3 — Expansión de contenido (implementada 2026-07-03, del plan de COMPARATIVA_MEGABONK.md)

- **Sistema de estados alterados**: slow (factor + duración), daño en el tiempo (ticks de 0.5 s por el embudo normal de daño) y knockback con decaimiento. Bosses inmunes al knockback. API en `EnemySystem.applySlow/applyDot/applyKnockback`.
- **Capas defensivas**: Evasion (esquiva con retornos decrecientes, muestra "MISS"), Shield (absorbe antes que la vida; solo existe si la build tiene Barrier Cell y se representa como placas cian orbitando al jugador — `Player.setShieldCharges`, NO una barra en el HUD; cada carga bloquea un golpe completo. `MODS.barrierCell` define 1–6 cargas y copias 7–10 de recarga 30→27→24→21→18 s, −3 s por copia y mínimo 18 s), Thorns (refleja al contacto), Lifesteal (% de robar 1 HP por golpe). Embudo único de daño al jugador en `Game.damagePlayer`.
- **Cartas nuevas**: Ghost Plating, Rusty Spikes, Leech Coil, Capacitor Bank (Duration: alarga buffs y estados) y Chaos Module (stat aleatorio a la rareza de la carta). Barrier Cell pertenece al pool unificado de Mods, no a cartas.
- **5 armas nuevas (draft de 11)**: Oil Sprayer (charcos que ralentizan, 0 daño — control puro), Acid Drum (zonas corrosivas con DoT; renombrada de "Acid Flask" el 2026-07-05 para encajar con la estética industrial/futurista), Turbine Fan (tornados con knockback), Junk Ricochet (rebota entre enemigos), Dismantler (garra que EJECUTA no-bosses bajo 15% de vida — primera arma "twist").
- Verificado headless: estados, defensas, cartas y las 5 armas ejercitadas; 120 FPS con zonas activas y enjambre.
- Pendiente del plan: moneda/economía (post-validación, sin cambios).

## Settings v3 + Controles remapeables + Gamepad — Implementado 2026-07-13 (validado por el usuario)

- **Gramática compartida de UI (Characters / Contracts / Settings):** los tres shells usan placas neutrales casi opacas `rgba(12,16,22,.96)`, borde `#2b3340`, muescas pixel y una cabecera de pantalla dorada embebida de 13px. Las etiquetas de sección y tab son mayúsculas mudas de 8px, los títulos de entidad mantienen Title Case y los valores quedan en 10-12px. El oro queda para títulos, recompensas y acción primaria; el azul para selección, información y progreso persistentes; el verde para completado; el naranja para bloqueo/tradeoff; el cian con interior blanco solo para foco transitorio de teclado/mando. Characters conserva su detalle integrado sin caja; estado y detalle de Contracts son placas voxel. Back queda abajo-izquierda y la acción contextual, cuando existe, abajo-derecha. En `<=900px`, Settings pasa a una tira segmentada horizontal con contenido a todo el ancho y sin overflow horizontal; en `<=560px` compacta filas y mantiene el footer fuera del contenido con scroll.

- **Contrato durable de layout UI:** cada shell y fila a ancho completo usa `box-sizing: border-box`, `min-width: 0` (y `min-height: 0` si encoge verticalmente) en hijos flex/grid reducibles y `max-width: 100%`; el overflow horizontal queda oculto por defecto. Cada pantalla declara UN dueño de scroll vertical; Contracts puede usar master/detail como excepción explícita (`#contracts-list` y `.contract-detail`), mientras Settings usa `#settings-frame` y Characters `.character-layout`. Header, tabs y footer permanecen fuera de ese scroll. Esos cuatro dueños comparten scrollbar voxel fino, cuadrado, track casi negro y thumb `#526172`, con gutter estable en Firefox/WebKit; la tira horizontal intencional de categorías de Contracts mantiene su scrollbar oculto. Todo botón conserva al menos 16px de padding lateral. Antes de aceptar una UI se mide en `1920x1080`, `1280x720`, `1024x600`, `900x600`, `560x600` y `520x400`: `clientWidth === scrollWidth` salvo scroll horizontal explícito, y header/tabs/footer deben quedar íntegros dentro del viewport.

- **Pantalla de Settings** (`#settings-overlay`, vista `menu-view` a pantalla completa — key-art de fondo, el 3D no renderiza detrás): título arriba, **sidebar de secciones anclado al borde izquierdo** (General / Controls) y contenido ancho centrado, ambos en placas del lenguaje del juego (marco oscuro casi opaco + muescas pixel — regla: sobre key-art, los paneles van a `rgba(12,16,22,0.96)` para que el arte nunca sangre bajo el texto, aplicada globalmente vía `.menu-view .overlay-panel`). **Auto-apply**: no existe botón Apply — selects y bindings se aplican al confirmar; los sliders Master/Music/SFX actualizan, persisten y se oyen en tiempo real mientras se arrastran. Music Volume controla tanto la pista del menú como la de la run; sin toast (sería ruido). Back siempre abajo-izquierda en ambas pestañas; Reset to Defaults solo en Controls, a la derecha.
- **Acciones remapeables** (`ActionId` en `src/settings.ts`): moveUp/Down/Left/Right + **interact** (unificó los 3 `'KeyE'` que vivían en config — cofre/chatarrero/invocación de boss — en UNA acción; el prompt flotante muestra la tecla/botón REAL del binding y cambia según el dispositivo en mano). Escape y Start del mando = pausa, reservados. Los bindings viajan dentro del blob de settings persistido (`normalizeBindings` = migración por campo, saves viejos caen a defaults). **Captura agnóstica de dispositivo**: "PRESS KEY / BUTTON…" — lo próximo pulsado (tecla o botón) se asigna a su dispositivo; una captura por-dispositivo se tragaba pulsaciones del otro. La pestaña muestra el dispositivo activo (mando conectado → botones de pad; si no → teclado), con notificación de esquina "Gamepad detected/disconnected" (en `document.body` fixed — la capa `#hud` se oculta bajo vistas de menú).
- **Gamepad completo** (`src/input.ts`, `PlayerInput` por acciones con polling por frame): stick izquierdo analógico + d-pad para moverse, botón de interact remapeable, **traductor DirectInput** para mandos no-estándar (DualShock: Cruz/Círculo/Cuadrado reordenados al layout estándar + d-pad decodificado del hat en `axes[9]`; los mandos estándar no pasan por él). **Navegación de menús**: foco visible (`.pad-focus`) sobre botones/cartas/selects/sliders del overlay activo — vertical mueve foco, **horizontal AJUSTA el control enfocado** (cicla selects con wrap, sliders ±5, disparando `change` → auto-apply), aceptar = SOLO el binding de interact del jugador (sin A fijo — una tecla de acción en todo el juego, regla del usuario), B = back/resume/leave/continue contextual. El `<select>` nativo no puede abrirse programáticamente → aceptar sobre él cicla; al mover el foco se hace `blur()` del control nativo (un select con foco DOM comía flechas del teclado en silencio). En el cofre el foco aterriza en Continue (la card de la ruleta es escaparate, excluida de la navegación).
- **Fixes de plataforma**: el modo ventana/resolución solo se re-aplica cuando ELLOS cambian (re-aplicarlo en cada save parpadeaba la pantalla con cada tick de slider) · **precarga de TODO el arte de UI gated en la pantalla de carga** (`hud.preloadUiAssets()`, idempotente; `tickLoading` no revela hasta warmup 3D + decode de iconos de armas/stats/cartas/mods/retratos/glifos + cáscaras de orbe) — mató el tirón del primer level-up/cofre/tienda · animación de entrada compartida de los paneles de mitad de run (pop 0.32s; los keyframes DEBEN transportar el `translateX(-50%)` de centrado del panel o lo teletransportan).
- **Empaquetado Electron**: `pnpm package` genera instalador NSIS (`-setup.exe`, asistente + desinstalador) Y portable (`-portable.exe`, un archivo para testers) en `release/`; sin firma → SmartScreen "Unknown Publisher" (certificado en Fase 6). **Regla de rutas de assets (mordió 3 veces el mismo día)**: en strings de JS/markup SIEMPRE relativas (`'assets/...'` — `file://` rompe las absolutas y Vite no puede reescribir strings); en CSS `url()` SIEMPRE absolutas (`'/assets/...'` — Vite las reescribe al compilar; las relativas resuelven contra `src/ui.css`). Gamepad API = Chromium nativo, cero cambios en el main process de Electron.
- Límite conocido v1: las etiquetas de tecla muestran el código físico (layouts no-QWERTY ven la posición) y los botones usan nomenclatura Xbox (A/B/X/Y) también en mandos PlayStation.

## Fuera de alcance actual
- Multiplayer/co-op: no implementado ni anunciado; solo existe el gate interno de viabilidad de `docs/MULTIPLAYER_FEASIBILITY.md`. Local/Remote Play persistiría solo en el save host/local; la progresión por cuenta de invitados no está prometida. Native online solo podría persistir cuentas propias tras validación host-authoritative.
- Dedicated servers: fuera de alcance.
- **Ya no están fuera de alcance:** la meta-progresión por perfil/Contratos, el arco de dos mapas y los tres personajes de lanzamiento están implementados. Siguen fuera del cierre actual una moneda meta y la evolución de armas. **Field Engineer** is the playable starting character; **Rack Hauler** and **Overclocker** are playable and unlocked through Proving Ground and Two of a Kind respectively (`DISENO_PERSONAJES.md`).

### Personajes — Field Engineer, Rack Hauler y Overclocker

#### Contrato reutilizable de UI para personajes jugables — implementado

Antes de integrar un personaje nuevo, verificar TODO este checklist:

- [ ] **Definición y arte:** `CharacterDef` aporta un `modelKey` validado y una ruta empaquetada a su referencia/retrato ortográfico frontal aprobado. La tarjeta reutiliza esa frontal 2D para identificación rápida; si tiene transparencia, se presenta sobre el fondo compartido `#444e5e` con borde `#2b3340`.
- [ ] **Roster:** siempre muestra retrato, nombre y estado. La selección usa cian. Desbloqueado muestra `Unlocked`; bloqueado muestra texto visible exacto `Locked` junto a `assets/2d/icon-ui-lock-v2.png` (decorativo porque el texto comunica el estado). El artículo integrado no repite ese estado; un bloqueo se explica una sola vez mediante requisito y progreso a ancho completo.
- [ ] **Dossier:** el orden es **Identity → Gameplay Identity → Stats**. Signature es la primera lectura, seguida inmediatamente por Tradeoff; **Suggested Start** es apoyo honesto de presentación y nunca garantiza el arma ni cambia pool u odds. Cada stat conserva una fila y un icono veraz; solo valores distintos del baseline config-backed reciben énfasis, mientras los nueve siguen legibles.
- [ ] **Un solo flujo:** Characters y la selección pre-run comparten renderer y artículo sin marco interior. Se preservan `data-character-*`, nombres completos, teclado/gamepad y el bloqueo de Confirm para personajes cerrados. `.character-layout` es el único posible dueño de scroll; roster, artículo, columnas y módulos siempre usan overflow visible.
- [ ] **Responsive:** `>=900px` usa tres columnas Identity / Gameplay Identity / Stats; `600–899px` conserva Identity + Gameplay Identity lado a lado y Stats ocupa la fila siguiente; `420–599px` compacta retrato/identidad, apila gameplay y usa dos columnas de stats; `<420px` usa una columna.
- [ ] **Foco:** `.character-layout` solo entra en el orden de teclado/gamepad cuando tiene rango vertical real. Sin rango, roster entrega foco directamente a Back/Confirm; con rango, el scroll de sección completa permanece operable y sale correctamente por ambos límites.
- [ ] **Estrategia de render:** la UI actual es 2D y no monta visor 3D, canvas, observers, RAF ni otro contexto WebGL. `src/models/character-preview.ts` permanece dormido y reservado para un caso futuro explícito.
- [ ] **Pipeline:** todo personaje nuevo conserva frontal/lateral/trasera planas. La frontal solo puede servir como retrato tras validación/aprobación y registro en una ruta empaquetada.

#### Implementación actual: Field Engineer

- `src/characters.ts` define un registry data-driven con ID estable, copy derivada de `CHARACTER_BALANCE`, `modelKey`, perfil base, signature, arma recomendada y metadata de unlock.
- Flujo de nueva run: **Play → Character Selection → Starting Weapon Draft → Loading → Run**. La selección es una `menu-view`, no un `GameState` nuevo; exige Confirm y soporta teclado/gamepad.
- Field Engineer (`field-engineer`) está desbloqueado por defecto: 110 HP, Armor rating 0%, Damage ×0.95, Move Speed 11, Attack Speed ×1, crítico 5%/+50%, Luck/Regen 0 y los sockets globales sin cambios propios (2 armas/2 cores iniciales, 3 armas/4 cores máximos).
- **Field Repair** cura 1% del HP máximo después de instalar o subir tier de cualquier Core excepto Hull Plates durante gameplay. Hull Plates nunca modifica el HP actual. Field Repair clampea a máximo y no se ejecuta en load, replay, Boss Lab o reconstrucción.
- Bolt Cannon no se garantiza ni cambia las odds: si entra naturalmente en el draft, solo muestra `Suggested Start`.
- `PROFILE.unlockedCharacters` persiste IDs y Contracts concede rewards `character`; Proving Ground desbloquea Rack Hauler al terminar runs con cuatro armas iniciales distintas.
- El menú **Characters** y la selección previa al arma usan el mismo renderer y contenido data-driven. El artículo compone **Identity | Gameplay Identity | Stats**; arquetipo, Signature, icono, Tradeoff y Suggested Start proceden del `CharacterDef` seleccionado. Las nueve stats compartidas comparan contra `PLAYER`/`defaultStats()` y Evasion aparece como décima fila solo cuando el personaje se desvía del baseline, como Overclocker. Un personaje bloqueado conserva requisito/progreso real de Contract y Confirm deshabilitado; desbloqueado muestra `Unlocked`. Field Engineer usa `ref-field-engineer-front-v1.png`, Rack Hauler `ref-rack-hauler-front-v3-seafoam.png` y Overclocker `ref-overclocker-front-v1.png`. El renderer conserva los breakpoints, scroll único, navegación teclado/gamepad, accesibilidad y ausencia de WebGL definidos en el contrato anterior.
- Boss Lab conserva el `characterId` registrado y reconstruye primero ese baseline antes de reproducir Cores; la reproducción no atraviesa el trigger de gameplay de Field Repair.
- The runtime model v1 uses a measured pack-free side profile plus dedicated procedural rear volume; `backPaintRef` only paints the existing shell. It is definitively approved in-game after the 0°/90°/180°/270° preview, rear-view locomotion check, and 400+ gate (431–440 enemies, 118.87 average FPS, 92.41 minimum bucket, 8.5 ms p99, 0 page errors, and 431/431 enemies moving). Its source sheets remain conversion and provenance inputs, not pending shipped-art approval.

#### Implementación actual: Rack Hauler

- `CHARACTER_BALANCE.rackHauler` fija 100 HP, Armor 10%, Damage ×0.90, Move Speed 11, Attack Speed ×1, Crit Chance 3%, Crit Damage +50%, Luck/Regen 0. `Open Rack` es la única Signature y Orbital Blades solo una recomendación no vinculante.
- La capacidad efectiva es una proyección pura del `PROFILE` global: +1 arma/−1 Core tanto en sockets abiertos como máximos. Resultado: 3/1 iniciales; 4 armas tras Boss Hunter; Cores 2 y 3 tras Second Wind y Full Loadout.
- La liquidación permanece global y canónica: Boss Hunter `PROFILE.weaponSockets` 2→3; Second Wind y Full Loadout `PROFILE.coreSockets` 2→3→4. Ni selección ni resolver reemplazan/mutan `PROFILE`; los pips de Contracts siguen mostrando esos targets globales.
- Draft y RIG in-run consumen el resolver por personaje. Field Engineer conserva 2/2→3/4 sin cambios. Run history, replay y Boss Lab persisten/restauran `rack-hauler` por ID estable; no requieren migración de formato y no dependen de que el personaje siga desbloqueado en el perfil actual.
- `CHARACTER_REGISTRY['rack-hauler']` usa `modelKey: 'rack-hauler'`, portrait `ref-rack-hauler-front-v3-seafoam.png`, Open Rack config-derived y unlock `proving-ground`. El Contract está activo y concede `{ kind: 'character', id: 'rack-hauler' }` de forma idempotente sin reemplazar el array vivo de `PROFILE`.
- El modelo runtime consume frontal/lateral/trasera/top seafoam v3: `#BAE8C6`, tool green `#3B9B73`, graphite `#202830`, visor `#E9F6FF`; mide 14.914 vóxeles / 13.120 triángulos por instancia. Previews 0°/90°/180°/270° y capturas reales de Mapa 1/2 están verificadas. El harness read-only mediante hooks DEV seleccionó Rack Hauler real con desbloqueo solo en memoria y sostuvo 430 enemigos durante 12 s en Mapa 2: 430/430 movidos, modelo `rack-hauler` antes/después, 119.94 FPS medios, bucket mínimo 119.76, mediana 8.3 ms, p99 8.5 ms y 0 errores de página. Esto cierra su gate específico 400+ de lectura/modelo y ausencia de degradación obvia. No sustituye el benchmark canónico VFX-heavy de 65 s: `tools/perf-stress.mjs` siempre confirma Field Engineer y no acepta personaje; parametrizarlo queda como cobertura extendida, no como gate de Rack pendiente.

#### Implementación actual: Overclocker

- `CHARACTER_REGISTRY.overclocker` usa `modelKey: 'overclocker'` y portrait `assets/2d/ref-overclocker-front-v1.png`. Runaway Draw, contacto físico ×1,35, Evasion 18 y el resto del perfil se derivan de config; Volt Pulse es solo `Suggested Start`.
- Perfil aprobado: 85 HP, Armor 0, Damage ×1, Move Speed 11, Attack Speed ×1, Evasion 18 (15,25% efectivo), Crit Chance 8%, Crit Damage +50%, Luck/Regen 0.
- **Runaway Draw:** cofres y cada slot del Chatarrero se promueven un tier antes de seleccionar el pool, fijar beam/reel y calcular precio: Gray→Green→Blue→Purple→Gold; Gold→Gold. No afecta level-up, Cores, Chaos Module ni recompensas de Contracts.
- El tier promovido selecciona otro pool; no aumenta la potencia de un Mod concreto. Ante un pool sin candidatos elegibles, desciende al primer tier válido sin conceder locked/capped ni Repair Kit a HP completo. Si no existe candidato, el flujo debe resolverlo explícitamente.
- Tradeoff: multiplicador ×1,35 solo para contacto físico de swarm/élite/cuerpo de boss/embestida; no se aplica a proyectiles ni ataques telegrafiados. Volt Pulse es `Suggested Start`, nunca garantizado ni equipado.
- **Two of a Kind:** completar el arco con dos IDs de personaje registrados distintos. El ledger monotónico `completedCharacterIds` persiste el progreso fuera del historial limitado; el Contract está visible/evaluable y concede `overclocker` por ID estable de forma idempotente, mutando el array vivo de `PROFILE`.
- Runtime/UI complete: portrait `ref-overclocker-front-v1.png`, packaged front/side/back/top sheets, `modelKey: 'overclocker'`, shared third card, and Locked/Unlocked state connected to Two of a Kind. **Overclocker is final and CLOSED for the current release scope by explicit user acceptance. No separate 400+ benchmark result exists or is claimed.**

## Orden de implementación
Ficha+pool → orbes XP → dificultad → separación → damage numbers → elites → roller/gunner → colisiones props → tuning → armas nuevas → draft → tótem+bosses → volador → verificación completa (FPS 100+ enemigos, run jugable de punta a punta).

### Weapon branches v1 (2026-07-17)

All 11 weapons now use three specialised owned-level cards. Every branch pick raises nominal weapon level. Lv3/Lv5 quantity milestones apply only to Bolt Cannon, Orbital Blades, Tire Fire, Turbine Fan, and Junk Ricochet; aggregate `WeaponPower` is retained for snapshots; only the selected behavior receives tier-weighted power (Common x1, Uncommon x1.2, Rare x1.4, Epic x1.6, Legendary x2). Branch card copy also discloses any simultaneous Lv3/Lv5 quantity gain.

- Bolt Cannon: damage, fire cycle, bolt size. Volt Pulse: damage, radius, pulse cycle. Orbital Blades: damage, orbit radius, rotation speed.
- Arc Welder: damage, ramp stability, range. Hydraulic Press: damage, width, press cycle. Tire Fire: damage, tire size, travel distance.
- Oil Sprayer: puddle radius, slow strength, duration. Acid Drum: DoT damage, radius, launch cycle. Turbine Fan: damage, radius, knockback.
- Junk Ricochet: damage, bounce count, launch cycle. Dismantler: damage, execute threshold, range.

A level-up screen allows at most one branch for each weapon owner. When both sockets are committed, the draft leads with one eligible branch and one installed eligible core, then fills remaining slots from legal alternatives without violating core no-swap. If owner uniqueness would otherwise leave a supported build at two cards, Salvage Dividend supplies a run-only Gold reward instead of a duplicate branch or zero-value core. Fully exhausted builds may still show fewer choices gracefully. `WeaponPower` is persisted only as a compatibility snapshot; combat reads `WeaponBranchLevels` only. Run records optionally persist branch state and remain compatible with older records.


## Audio Foundation — Implemented 2026-07-17

UI navigation uses one semantic cue per action: quiet `ui-focus` on real hover/keyboard/Tab/gamepad target changes, `ui-back` for Back/Escape, and dedicated Resume/purchase cues without generic-confirm overlap.

`Game` owns observer-style renderer audio; `Hud` does not. `AudioDirector` lazily creates/resumes Web Audio only from a gesture and silently no-ops without context/assets. Runtime selects cached pre-rendered assets only. All music lifecycle transitions go through `transitionMusic`/`stopMusic`: the incoming keyed loop starts at zero, the outgoing loop lands at zero over `AUDIO.fades.musicCrossfadeS`, the two-voice music cap remains intact, and a revision token prevents stale fetch/decode work from resurrecting an obsolete bed. The only active beds remain menu + the shared run track; no Foundry/boss track is claimed.

The canonical active pack is `audio-masters/runtime/` + `tools/audio/runtime-pack.json` → `public/assets/audio/sfx/`. `pnpm audio:generate` verifies source hashes/formats/provenance and exact enabled-event coverage in staging before atomic promotion; `pnpm audio:validate` verifies the public pack and `validate-runtime-pack.mjs --dist` verifies Vite/package input. Suno/ElevenLabs winners are immutable external masters, never regenerated from prompts. Final volume/cohesion listening remains a human gate documented in `AUDIO_AUTHORING_PIPELINE.md`; `pnpm audio:mix-sheet` binds pending evidence to pack, AUDIO config, source/diff and built-file hashes without claiming a verdict.

### Packaged audio swarm evidence (2026-07-17)

Successful local packaged Electron run via `pnpm benchmark:audio`: deterministic `audio-swarm-416` (seed 4979220; digest `4979220:240-112-48:0.25:4`), 404 peak / 411 minimum / 411 end active enemies, including normal-HP sacrificial enemies. At 800x600 after 3 s warmup + 10 s rAF sample on Windows 10 / AMD Ryzen 7 3700X / NVIDIA GeForce RTX 2060 (D3D11): 120.10 mean FPS, 119 minimum complete 1 s bucket FPS and 8.5 ms frame-time p99. Actual paths: 9 kills, 7 XP pickups, 14 Gold pickups; audio 47 attempts / 27 accepted, 15 peak voices, 20 cooldown drops, 0 steals/load failures/leaks and 0 active audio voices after cleanup. Evidence: `tmp/perf-audio-output/report.json`. This validates this machine and scenario only, not Steam minimum hardware.


## Perfil persistente y Contratos — Implementado 2026-07-25 (v0.5.6)

**Snapshot operativo histórico (SUPERSEDED):** Steam Playtest Wave 1 en `main` usaba `0.10.5-beta` y `codex/map-2` usaba `0.12.6` con telemetría desactivada. Se conserva para explicar la costura de reset/consentimiento, no como versión vigente. El consentimiento de telemetría nunca autoriza un borrado, que exige confirmación propia. El marcador `userData/playtest-reset.json` sigue siendo transaccional y settings/consentimiento/identidad/cola quedan fuera del reset.

Reemplaza al panel dev de Unlocks como motor de progresión. **No hay moneda meta**: los contratos son el único motor (decisión cerrada).

### Perfil (`src/profile.ts`)

`PROFILE` (antes `ACCOUNT`, renombrado porque `upgrades.ts` ya exporta una clase `Progression` para la progresión DENTRO de la run) guarda desbloqueos y sockets. Se persiste en `userData/profile.json` por IPC de Electron, con `localStorage` como fallback de navegador, espejando la costura de `settings.ts`.

Reglas que no se rompen:

- **`PROFILE` se muta EN SU SITIO, nunca se reemplaza.** Todo consumidor de gating (pool del draft, draft inicial, sockets, pool de mods) tiene una referencia viva; reemplazar el objeto los desconecta a todos en silencio. `loadProfile()` corre en `main.ts` ANTES de construir `Game`.
- **Los techos de diseño (`maxWeaponSockets`/`maxCoreSockets`) NO se persisten**: son constantes de balance, así que subirlos alcanza a saves existentes.
- **Estado implementado para el playtest:** el perfil empieza con **2 sockets de arma** y tiene un techo de **3**. **Boss Hunter** abre el tercero al derrotar cada tipo de boss que puede aparecer en el Mapa 1; los saves antiguos se elevan al nuevo mínimo y, si ya habían completado el contrato, conservan el premio migrando directamente a 3.
- **Dirección futura, todavía no implementada:** se podrá llegar a **4 sockets de arma** solo después de ampliar suficientemente el roster de armas seleccionables para que equipar cuatro no elimine decisiones significativas de build. Antes de esa expansión deben rediseñarse los requisitos y contratos tanto del socket 3 como del futuro socket 4; el requisito actual de todos los bosses del Mapa 1 para Boss Hunter sirve únicamente para este playtest y no constituye el diseño final.
- Los sockets de contrato tienen un **índice objetivo canónico**: Second Wind = Core 3, Level Milestone = Core 4 y Boss Hunter = Weapon 3. Ese índice, no el contador actual de `PROFILE`, es la verdad para preview, copy, pips, migración y liquidación; ids completados restauran como mínimo su capacidad objetivo y los registros antiguos sin índice se canonizan al cargar.
- Las listas de desbloqueo se **mergean sobre los defaults** y se filtran contra los registries reales: promover un ítem a desbloqueado-por-defecto llega a jugadores existentes, y un save editado a mano no puede inyectar un id fantasma.

`LIFETIME` es el ledger monótono de carrera (runs, runs completas, sectores limpiados, máximo de mapas alcanzados, kills, mejores marcas, bosses y tipos de boss, daño por arma, runs por arma inicial, oro, cofres por tier, compras, hazañas de estilo). Vive aparte del historial **porque el historial se corta en 250 runs** y un contrato de "10.000 kills acumuladas" perdería terreno al envejecer las runs. Es idempotente por id de run, así que rellenar retroactivamente nunca infla totales.

### Historial de runs (`src/run-history.ts`)

Los registros pasan a `userData/run-history.json` (antes solo `localStorage`, dentro del LevelDB de Chromium, ilegible para herramientas). `migrateRunHistory()` corre al arrancar, no de forma perezosa: migrar dentro de `loadRunHistory()` solo se disparaba al TERMINAR una run. **Aviso: `localStorage` es por ORIGEN** — lo escrito por un build empaquetado vive bajo `file://` y una sesión de dev server ve otro almacén.

Fields added because they cannot be reconstructed later: `startingWeapon`, `difficulty` (stamped `'standard'` even before a selector exists), `characterId` (records Field Engineer, Rack Hauler, or Overclocker by stable ID), `bossTypesDefeated`, `damageTaken`, `goldEarned`, `chestsByTier`, `shopPurchases`, `sectorsCleared`, `mapsReached`, and `submittedTo`. Completion is structural (`run-complete` or all sectors), never `durationS >= N`; old records remain compatible without inventing progress from elapsed time. Run seeds are not stored because gameplay RNG is not yet seeded.

### Ciclo reutilizable de telemetría privada — `main` activa / Mapa 2 inert

Un único `TELEMETRY_CONFIG` tipado gobierna habilitación, builds exactas admitidas, `gameId`, `waveId`, schema/disclosure, epoch nullable y límites de transporte/cola. `main` `0.10.5-beta` mantiene la release Wave 1 activa. En `codex/map-2` `0.12.6`, el config es `enabled: false`, allowlist `[]`, `gameId: 'voltswarm'`, `waveId: 'map-2'` y `resetEpoch: null`. La elegibilidad global queda siempre falsa: Electron no puede mostrar prompts de consentimiento/reset, crear identidad/cola, abrir red ni declarar disponible la fachada que habilita el feedback final.

Cuando una wave futura se habilite, Electron main exige una prueba atómica `userData/telemetry-consent.json` ligada al digest determinista de `consentVersion` y de todo el copy renderizado desde `TELEMETRY_CONFIG.disclosure`: ausencia pide consentimiento; corrupción bloquea; la misma disclosure sirve silenciosamente en launches/waves posteriores; cambiar versión o texto vuelve a preguntar automáticamente. El reset tiene un diálogo independiente incluso con consentimiento existente. El renderer **nunca sube datos directamente**: solo publica eventos tipados mediante `contextBridge`; Electron main valida, identifica, encola y sube después de elegibilidad y consentimiento.

Contrato de datos:

- Un `installationId` UUID aleatorio vive en `userData/telemetry-installation.json`, separado de perfil, settings e historial. No se recopilan Steam ID, email, nombre, hardware ni huellas del dispositivo.
- Cada proceso crea un `sessionId`; cada run crea un único `runId` reutilizado tanto por telemetría como por `RunRecordV1`. El historial local sigue guardando **solo runs terminadas**; abandonar desde pausa produce `run_ended: abandoned` remoto sin contaminar contratos, percentiles ni carrera.
- Eventos permitidos: inicio/fin de sesión, inicio/fin de run, decisiones, rendimiento agregado, feedback y resumen de fallos de subida. Las decisiones registran únicamente hechos observados: cartas ofrecidas y selección/descarte, invocación de boss, compra/recompensa de cofre y compra de tienda.
- Rendimiento se agrega mientras el estado es `playing`: ventanas periódicas de 30 s y un resumen final. Nunca se emite un evento por frame.
- La cola `userData/telemetry-queue.json` usa escritura atómica, IDs estables y scope inmutable por evento (`gameId`/`waveId`/schema/build/session). Un cliente posterior puede drenar Wave 1 sin relabelarla como Wave 2; cada lote contiene solo scope/session/build compatibles. La migración v1 nunca adivina scope: mueve entradas legacy sin scope a cuarentena `legacy_unscoped_event`. Se mantienen los límites de 100 eventos/128 KiB, deadline 10 s, backoff, tope 2.000, ACK estricto y cuarentena `413` de 100 entradas.

La pantalla final incluye feedback explícito y seudónimo sin texto libre: diversión 1–5, dificultad (`too_easy` / `about_right` / `too_hard`) y etiquetas fijas opcionales. Nada se envía hasta pulsar **Submit Feedback**. El endpoint y `X-Client-Token` son identificadores públicos del cliente; secretos HMAC, Cloudflare, D1, Google y cuentas de servicio permanecen fuera del juego.

Verificación focal: `pnpm test:telemetry` cubre además cero efectos sin elegibilidad/consentimiento, aislamiento cross-wave y migración legacy; `pnpm test:playtest-reset` cubre admisión exacta, kill switch, epoch nullable, consentimiento persistido/versionado/corrupto y confirmación de reset separada.

### Contratos (`src/contracts.ts`)

Arquitectura que separa RITMO de CONTENIDO, para que añadir contenido nunca obligue a escribir un contrato:

- **Contratos firma** (~10) escritos a mano, nombran su premio: sockets, primer boss, desafíos de maestría.
- **Peldaños de escalera** generados de plantilla que pagan "el siguiente de una cola" (`WEAPON_QUEUE`, `CORE_QUEUE`, `MOD_QUEUE`). Añadir un arma es un `push`; el peldaño ya existe.

#### Estado implementado verificado (2026-08-12)

Hay **29 contratos declarados y 29 activos**. `Proving Ground` concede Rack Hauler; `Two of a Kind` concede Overclocker tras completar el arco con dos personajes registrados distintos.

| Área | Estado actual |
| --- | --- |
| Armas | 5 por defecto. `First Blood` entrega Junk Ricochet; Arsenal consume, en orden de liquidación, Arc Welder, Acid Drum, Turbine Fan y Dismantler. Arsenal V queda seco/de repuesto. Oil Sprayer existe en código y herramientas de desarrollo, pero está explícitamente fuera del camino de desbloqueo y no está disponible para el jugador. |
| Cores | 10 por defecto + 10 IDs en `CORE_QUEUE`. Los 11 peldaños activos que pagan `next-core` (Scrap Quota 4 + Veteran 4 + Ascension 3) compiten por esa cola compartida: el ID concedido depende del orden de liquidación, no de un nombre de contrato fijo. Un peldaño queda seco/de repuesto y oculto hasta que exista premio. |
| Mods | 12 por defecto. Overkill, Purist y Foreman entregan Overload Trigger, Phase Chassis y Magnetron Heart; Endurance consume Coolant Burst y Chain Relay. Endurance III queda seco/de repuesto. |
| Capacidad | Armas 2 → 3 por Boss Hunter; cores 2 → 4 por Second Wind y Level Milestone; descartes de level-up 3 → 4 por Untouchable. |
| Personajes | Field Engineer está desbloqueado por defecto. Rack Hauler y Overclocker están registrados; Proving Ground y Two of a Kind los conceden por ID estable. |

**Semántica vigente en esta rama:** Second Wind exige completar estructuralmente la run; Boss Hunter, derrotar los 2 bosses exactos del Mapa 1; Purist, completar los 2 sectores con una sola arma y sin mods; Foreman, derrotar los 3 tipos de boss, incluido Hazard Marshal. **Maestría de arma** significa acumular **50.000 de daño de carrera con esa arma**.

| Escalera | Umbrales activos |
| --- | --- |
| Arsenal | 1 / 2 / 3 / 4 / 5 armas dominadas |
| Scrap Quota | 300 / 1.500 / 5.000 / 12.000 kills de carrera |
| Veteran | 3 / 8 / 15 / 25 runs terminadas |
| Ascension | mejor nivel 10 / 15 / 20 |
| Endurance | 120 / 240 / 360 s |

Decisiones que sostienen el diseño:

- Lo otorgado se guarda como **IDS**, nunca como posición en la cola: reordenar la cola no puede duplicar ni saltear.
- **Lo otorgado nunca se revoca**, así que subir un umbral no le quita nada a quien ya lo tenía.
- Las escaleras llevan **más peldaños que ítems** a propósito. Un peldaño sin premio disponible **ni se liquida ni se ofrece**; reaparece cuando la cola crece.
- `progressOf()` devuelve actual y objetivo, sirviendo a la vez para "¿está hecho?" y la barra de progreso, que así no pueden discrepar.
- Se evalúa **una vez por run terminada** contra el ledger, y también al arrancar, así un contrato publicado después se completa retroactivamente sin dejar una ventana donde la pantalla diga COMPLETE sin haber pagado.
- No hay contratos latentes en el catálogo actual; los 29 se evalúan y muestran cuando tienen una recompensa resoluble.

Umbrales en `config.ts` `CONTRACTS`, marcados como **placeholders**: están anclados a una sola run registrada y necesitan decenas de runs humanas del balance actual antes de significar algo.

### UI

Pantalla de Contratos desde el menú con navegador **master-detail**. Cada entrada abre en `Active` y `All`. La cabecera integra un control segmentado conectado `Active / Completed` con recuentos propios; ambos segmentos conservan geometría estable y `Completed 0` permanece visible pero deshabilitado. Debajo, una tira visualmente distinta de tabs `All / Weapons / Cores / Mods / Sockets / Perks` muestra totales pequeños del catálogo ofrecido que no cambian al alternar el estado. En `All`, las filas se agrupan siempre en ese mismo orden (`Weapons → Cores → Mods → Sockets → Perks`), manteniendo el orden canónico de `ACTIVE_CONTRACTS` dentro de cada grupo; progreso, perfil y estado nunca reordenan el DOM. `Completed` significa contrato liquidado en `LIFETIME.completedContracts`, nunca objetivo alcanzado sin pago. El navegador usa todo el ancho útil del shell: la lista compacta queda a la izquierda y el detalle actual permanece completo a la derecha sin scroll a 1280×720 y 1024×600. En ventanas estrechas se apila y la tira conserva alcance horizontal con un degradado de continuación, sin scrollbar visible. El foco entra en `Active`, sobrevive a los rerenders de filtros y vuelve al botón `Contracts` al salir; selección y cursor tienen tratamientos distintos.

Cada botón de la lista muestra arte/pips del premio, título, progreso exacto y una barra segmentada pequeña; la descripción completa y el copy de propiedad/recompensa viven una sola vez en el detalle, junto con arte grande, categoría, estado y barra ampliada. La selección inicial, o el fallback si el ID seleccionado deja de ser visible, es el contrato visible más cercano a completarse dentro del filtro; ese cálculo usa progreso y es independiente del orden visual agrupado. La selección se conserva por ID mientras siga visible. Los peldaños secos continúan ocultos y el preview mantiene el orden canónico de liquidación. Mouse, activación nativa de teclado, flechas acotadas al overlay y navegación XInput/DirectInput usan botones reales y foco visible: el estado se expone como grupo con `aria-pressed`, las categorías como `tablist` / `tab` con `aria-selected`, y la fila seleccionada con `aria-current`. Los controles deshabilitados quedan fuera de la navegación. Reveal al terminar la run permanece entre las stats y el desglose de daño, solo si se ganó algo, con tope de 5 filas.

La barra de progreso comparte renderer en lista y detalle: objetivos de 1–12 muestran una celda por unidad real; objetivos mayores normalizan a 12 celdas y cada celda conserva su fracción de relleno, sin redondear a una celda completa. El valor visual se clampa a `0–target`; un objetivo inválido usa una celda vacía segura; `aria-valuenow`, `aria-valuemax` y el texto exacto de progreso permanecen sincronizados.

Los pips de socket del detalle se centran y caben con sus bordes y gaps dentro del frame `border-box`; la contención final no sustituye el ajuste de composición.

### Herramientas de desarrollo

`pnpm test:smoke` (una run real por arma inicial, perfil aislado), `pnpm stats` (percentiles para calibrar umbrales, nunca promedios), `pnpm reset:profile` (escribe perfiles vacíos, no los borra: `loadProfile` cae a `localStorage` si falta el archivo y resucitaría el save), `pnpm check:release-flags` (hook `prepackage` que aborta el build con cualquier instrumento de dev encendido).


## Pulido visual y de feel — Implementado 2026-07-26 (v0.5.6 → v0.6.2)

Todo salido de playtests reales del usuario, no de auditoría interna.

### Marcadores de suelo (jugador, élite, boss)

Los anillos son planos a pocos centímetros del suelo (blob shadow 0.04, aura élite 0.07, aura boss 0.08, marcador del jugador 0.075-0.10), y contenedores y bidones son cubos opacos apoyados en ese mismo suelo. La escenografía los cortaba en bloques grises, y el anillo del boss se pintaba encima de su propio cuerpo.

Se resuelve con **ordenación explícita de cola**, no con un flag de profundidad. Three.js dibuja toda la cola transparente después de la opaca, así que un marcador transparente sin `depthTest` acababa por encima del jugador además de por encima de la caja. Los marcadores pasan a la **cola opaca** (el blending aditivo no necesita la bandera `transparent`) y las tres capas se ordenan a mano vía `VISUAL.renderOrders`:

```
escenografía 0  →  marcadores 1  →  personajes 2
```

Consecuencias que hay que respetar al tocar esto: `material.opacity` se ignora fuera de la cola transparente, así que la opacidad va **horneada en el color** (y en los colores de vértice del glow); y `renderOrder` **no se hereda de un `Group`**, por lo que hace falta el helper `setRenderOrder()` de `player.ts`. Reversible entero con `VISUAL.groundMarkersOnTop = false`.

El "glow" del marcador del jugador era un `CircleGeometry` pelado —borde duro, leído como placa gris estampada— y ahora tiene caída radial cuadrada por colores de vértice; bajo blending aditivo el negro no aporta, así que es un degradado real sin textura.

### Ruleta del cofre

Nunca puede mostrar dos mods iguales en celdas contiguas. Blue tiene 3 mods propios y purple 4; ambos conservan una tira formada solo por sus objetos reales. Gold tiene un único premio, Magnetron Heart: sus 18 celdas previas son **anticipación Legendary neutral**, geometría voxel teñida por `--burst`, y la penúltima también es neutral. Esas celdas no son Mods ni recompensas: no llevan `data-mod-id`, nombre, candado, imagen de objeto, moneda ni asset de modelo. La celda final sigue siendo exactamente Magnetron Heart.

**Criterio de salida obligatorio — solución temporal:** las 18 celdas neutrales existen solo mientras el pool gold tenga menos de 3 Mods reales. En cuanto `modsOfTier('gold').length >= 3`, la construcción de la tira vuelve automáticamente a celdas item-only del mismo tier y desaparece toda anticipación neutral. Añadir el tercer Mod gold CIERRA este placeholder; ningún pase futuro de contenido debe conservarlo manualmente.

El aterrizaje y el reveal son **una única aparición continua** del premio. La ruleta promociona al contenedor final el mismo nodo visual que aterrizó — nunca lo oculta para clonar o recrear inmediatamente el mismo mod — y conserva el timing, el fallback de `transitionend`, el flash, los god-rays, las chispas, el overshoot, el audio y el botón Continue.

### Balance

**Volt Pulse: cooldown 2.4 → 1.4s, daño sin tocar.** Su daño no era el problema: a 10 por pulso cada 2.4s necesita ~4 enemigos en el radio solo para igualar a Bolt Cannon, y esa densidad no existe en los primeros minutos — un arma de media run en manos de quien empieza. Subir el daño habría inflado el late, donde ya es fuerte. El coste real era el aire muerto: a diferencia de Orbital Blades, donde el jugador controla el contacto moviéndose, Pulse no ofrece nada que hacer entre disparo y disparo.

## HISTÓRICO/SUPERSEDED — primera versión jugable provisional del Mapa 2 (2026-08-02, v0.10.6-beta)

> Este snapshot explica el origen del bloque, pero ya no describe el estado actual. La fuente vigente está al principio del PRD y en la sección Hazard Marshal de 0.22.0.

### Megafábrica futurista activa

El Mapa 2 ya existe como primera arena procedural jugable: suelo metálico generado en runtime, centro de combate abierto, doce torres monumentales en el perímetro, anillo de conductos cian y ocho carriles térmicos radiales. La composición protege la lectura del enjambre en el centro y concentra la escala industrial en los bordes. **No hay todavía textura raster final, props voxel finales ni set final de enemigos propio del mapa**; esta versión prueba estructura, continuidad y silueta espacial, no cierra el arte.

La dificultad usa reloj propio de mapa. **Baseline provisional para playtest:** el Mapa 2 arranca con `difficultyOffsetS = 0`, equivalente al minuto 0 del Mapa 1; la presión posterior queda pendiente de calibración con runs humanas. El Mapa 2 conserva la build y el estado persistente de la run, pero limpia enemigos, proyectiles, pickups, orbes, cofres, mercader, buffs temporales y otros actores locales.

### Hazard Marshal: integración provisional

Decisión del usuario: el boss final del Mapa 2 es el **Hazard Marshal**, clave `final-boss` en `src/models/registry.ts`. Sustituye al pod Volt Warden que ocupaba ese hueco. El modelo ya está enganchado al juego como tipo semántico de boss y se renderiza mediante el `InstancedMesh` compartido de `EnemySystem`, preservando el guardarraíl de un mesh por tipo. Al terminar los 10 minutos del Mapa 2 aparece sin pasar por el sorteo de tótems del Mapa 1; derrotarlo cierra el segundo sector y la run.

**Su combate actual es un arnés PROVISIONAL de integración, no el moveset final:** persecución, parada telegrafiada, empuje de arena y descarga radial orientada al jugador. Prueba spawn, targeting, inmunidades de boss, VFX/HUD, muerte y cierre de run. No declara fases, patrones definitivos, arena reactiva ni animaciones de ataque finales.

### Por qué cambió el candidato

El pod Volt Warden se reconstruyó primero, y ahí apareció el hallazgo que importa: su masa grumosa **no venía de que le faltaran las vistas lateral y trasera**, como decía el repo. Auditada, `ref-volt-warden-front.png` es **215 piezas desconectadas con 101 agujeros interiores** — el 45% de su superficie vive fuera de la silueta principal, y esos fragmentos se extruyen cada uno por su cuenta. Es concept art, no una hoja de conversión. La v2 de esa misma referencia son 2 piezas.

Reconstruido (`tools/make-final-boss-sheets.mjs`: frontal derivada de la referencia y reparada a 1 pieza, laterales y trasera autoradas, 32.376 → 10.208 triángulos) y puesto al lado del Hazard Marshal, perdió la comparación. Sus hojas y su generador se conservan: ese diseño queda libre para un enemigo futuro.

### El modelo

Hojas derivadas de renders de referencia por `tools/make-hazard-marshal-sheets.mjs` (ruta nueva, ver `PROMPTS_IMAGENES.md` §6). 61 columnas de ancho, ~el doble que el resto del elenco.

**Esa resolución solo se justifica a tamaño de boss, y está medido:** el mismo modelo ocupa **50×58 px como jugador y 244×293 px como boss** — unas 24 veces el área. A tamaño de jugador el rasterizador tira todo el panelado; a tamaño de boss sobrevive entero. `voxelSize` 0.0204 deja el modelo en ~1,9u, que es la base que usan los demás bosses ANTES de que la escala 4.6× de su tipo multiplique.

### Color: cuerpo del elenco, cabeza de marca

El cuerpo conserva la paleta `FOREMAN_*`; **solo el casco** (banda 0 → 0,245 desde arriba, que termina justo donde empiezan las hombreras) viste la paleta del logo: ámbar `#fdb601`, carbón `#152532`, negro `#0a1219`, cian `#01e6fe` — todos medidos de `logo-mascot-v3.png`, no elegidos a ojo.

**Teñir el modelo ENTERO de marca se construyó y se descartó.** El logo tiene tres colores y ningún tono medio, así que llevar el cuerpo a ámbar deja ~82% cálido y bajo luz Lambert los dos ámbares se funden: sale una estatua de oro sin definición de paneles. Profundizar el segundo escalón tampoco lo salva. El casco es la pieza que de verdad cita a la mascota (cúpula, visor, rejilla) y basta con él.

### Capacidades nuevas del voxelizador

Dos, ambas opt-in, ninguna cambia el comportamiento de los modelos existentes:

- **`recolorRegions`** (`registry.ts`): igual que `recolorMap` pero acotado a una banda de altura, con `from`/`to` como fracciones **desde arriba** (la convención de `segments`) mientras la Y de la malla va de abajo arriba. Es lo que permite que un modelo lleve dos esquemas de color a la vez.
- **`sidePaint`** (`icon-voxelizer.ts`): usa los COLORES de la hoja lateral, no solo su profundidad, para pintar las caras exteriores izquierda/derecha. Sin esto la lateral se consumía solo para `rowHalfDepth` y los flancos vestían el color del borde de la silueta frontal estirado hacia atrás. El flanco es exactamente el X mínimo/máximo de cada `(y, z)`, así que pinta dato real **sin poder alterar la silueta** — esa es la diferencia con `voxelizeMultiView`, que también pinta color lateral pero talla el hull como producto cruzado y **fusiona los miembros que cuelgan sueltos**. Probado en este modelo: fusionó los guanteletes al torso, descartado.

### Pendiente en aquel snapshot (SUPERSEDED por 0.22.0)

- **Gameplay final:** faltan fases, telegrafías y patrones autorados, relación definitiva con el arena y animaciones de ataque. El patrón radial actual es provisional y reemplazable.
- **Arte final del mapa:** no existen todavía assets raster finales, props voxel finales ni una pasada de iluminación/ambiente aprobada por el usuario.
- **Aviso de lenguaje visual:** el boss es ámbar+carbón y los Voltling del enjambre también. A tamaño de boss más el doble anillo rojo se distingue, pero conviene revisarlo al definir el elenco del Mapa 2 (la fundición mueve paletas igualmente).
- **Ángulos 90°/270°** siguen siendo los más flojos. Importa menos de lo que parece: el boss gira siempre hacia el jugador y la cámara va detrás del jugador, así que in-game el ángulo dominante es el frontal.

### Animaciones — rig de piezas (2026-07-31)

El boss tiene **rig de piezas con jerarquía de pivotes** (`src/models/rig.ts`): cabeza, torso, dos brazos, dos muslos y dos espinillas, cortados del MISMO `VoxelGrid` que la malla única. Tres clips: `idle` (0.31 Hz), `walk` (0.62 Hz) y `hit` (disparo único).

Es una ruta autorada que el boss podría permitirse porque solo hay uno en pantalla; no cambia el guardarraíl del enjambre, donde cada tipo se dibuja mediante `InstancedMesh` y una matriz por instancia sin miembros.

**Sistema completo, reutilizable para futuros enemigos/personajes/bosses, en `docs/ANIMACION_RIG.md`** — incluye cómo partir un modelo, el convenio de signos, por qué un seno hace que una marcha parezca sintética, y la verificación obligatoria del reparto de piezas.

**El rig todavía no está enganchado al runtime de combate:** la primera integración jugable del Hazard Marshal usa la malla única del `InstancedMesh` de enemigos. Los clips se revisan desde `model-preview.html?model=final-boss&anim=<clip>` y quedan disponibles para la pasada de moveset final.

### Feedback de golpe — tinte, no animación (decisión 2026-07-31)

**Cuando golpeen al boss NO se reproduce animación de retroceso.** Es un bullet-heaven y recibe muchos impactos por segundo: el clip se reiniciaría antes de terminar (convulsión permanente) y competiría con la locomoción por los mismos huesos. Un tinte se solapa consigo mismo sin romperse.

`enemies.ts` ya implementa el destello (`hitFlash = 0.08` + `FLASH_TINT` por `setColorAt`), hoy en **blanco** `(2.5, 2.5, 2.5)`. Falta añadirle rojo, con dos cuidados: el tinte es multiplicativo (un rojo puro sobre crema da rosa lavado) y el rojo ya significa *boss* en el lenguaje visual del juego. Detalle y valores propuestos en `ANIMACION_RIG.md` §8.

El clip `hit` no se descarta: se recoloca a eventos **raros** — cambio de fase, rotura de armadura, stagger.

## Tesla Titan — modelo rehecho 2026-08-03

Se veía flojo al lado del Crusher King, y **la causa no era el voxelizador sino la referencia**: la hoja v1 era una columna lisa con tres discos planos y casi ningún detalle interior. Subirle la resolución no habría arreglado nada — no había nada dentro que resolver.

Las tres hojas se rehacen **autoradas a la resolución exacta de vóxel del modelo** (45×76, así el remuestreo del voxelizador es un mapeo 1:1 sin pérdida) con `tools/make-tesla-titan-sheets.mjs`. Autoradas y no generadas por IA porque el diseño es geométrico y regular — una torre de bobinas —, que es justo el caso donde el autorado da control total, resultado determinista y regenerable con un comando.

**Detalle nuevo:** bobinados por tramo de columna con conducto central de carga, muescas radiales y nodos emisores en los tres anillos, carcasa de cabeza con rejillas laterales y alojamiento de visor, base blindada escalonada con garras y emisores.

| | antes | ahora | Crusher King (vara de medir) |
| --- | --- | --- | --- |
| vóxeles | 8.059 | **48.360** | 27.740 |
| triángulos | 6.592 | **29.832** | 13.480 |
| columnas | 25 | **45** | 41 |

**Constante nueva `TESLA_DEEP` (`#1a7d78`).** Hacía falta: el charcoal sobre cian brillante lee como daño, no como mecanizado. Un teal profundo del mismo tono permite tallar juntas y bobinados sin agujerear el casco. Misma convención de rampa de 3 pasos que las familias contenedor/andamio/bidón.

También se le activa `sidePaint`: ahora que la hoja lateral tiene detalle real, sus colores pintan los flancos en vez de estirar el borde de la silueta frontal.

**La altura en el mundo NO cambia**: 76 filas × 0,0263 = 2,00u, lo mismo que medía antes (42 × 0,048). Escala de instancia, hitbox y balance quedan intactos; solo cambia la densidad visual. El `previewScale` sí baja (2.4 → 1.75) porque la torre pasó de 42 a 76 filas y se salía del visor — eso es solo encuadre de revisión.

**Pendiente conocido (pre-existente, no una regresión):** la torre es tan alta que su cabeza queda detrás del HUD a distancia de combate. Ya pasaba con el modelo viejo — la altura en el mundo es idéntica —, pero antes no había arriba nada que perderse. Decisión aplazada a cuando exista la pelea real: dejarlo como lectura de coloso, acortar la torre, o bajar su escala de instancia.

## Peleas de boss — pase de accesibilidad 2026-08-06

Origen: playtest del usuario. *"Sigue siendo muy complicado matar a ambos bosses en 10 min mapa 1 con toda la oleada."* Se atacó desde cuatro ángulos independientes; tres están dentro y el cuarto se probó, se rechazó y se revirtió entero. El problema de fondo que motivaba ese cuarto **sigue abierto** y se documenta al final para poder diseñarlo aparte.

### 1. El cuerpo del boss es sólido para el jugador

**Era un bug, no un ajuste.** `refreshCollisionObstacles()` construía su lista con props estáticos, portal, chatarrero y pickups — **nunca con el pool de enemigos**. El jugador no tenía colisión con ningún boss.

Con `crusher.chargeSpeed = 22` contra `PLAYER.moveSpeed = 11`, el Crusher King simplemente atravesaba al jugador y lo mantenía dentro de su volumen durante los 0,9 s completos del lunge. A un impacto por ventana de `invulnAfterHitS = 0,4`, eso son **hasta 3 golpes de `BOSS.contactDamage = 12` — 36 HP de 100 — sin contrajuego posible**.

Tres piezas:

- **Lista de colisión propia del jugador** (`playerObstacles` = lista del mundo + cuerpo del boss vivo). Deliberadamente separada de `collisionObstacles`, porque esa **también alimenta el steering del enjambre**, donde el boss ya tiene su entrada ancha de `clearRadius`. Meterlo en la compartida habría cambiado en silencio cómo el enjambre rodea al boss.
- **Una embestida cobra un golpe.** No alargando los i-frames globales, que habrían hecho al jugador inmune también a la oleada durante casi un segundo. El boss lleva un contador `ramSerial` que sube al entrar en `charging`, y el juego apunta cuál ya cobró: da igual cuántos fotogramas estén solapados los cuerpos. **Solo se calla ese boss**; la oleada sigue haciendo daño.
- **Empujón lateral, cruzando el carril.** Nunca a lo largo de él: empujar al jugador por delante de un cuerpo que va a 22 cuando él va a 11 solo lo convierte en quitanieves. El lado elegido es en el que ya estaba, para que se lea como un roce de hombro; el centro exacto no tiene lado propio y cae al izquierdo del boss.

**Perfil del impulso** (`BOSS.ramKnockbackForce = 70`, `ramKnockbackDecayPerS = 16`, `PLAYER.knockbackStopSpeed = 1,5`, `ramShakeAmp = 0,45`). El primer intento fue 30 con el decaimiento estándar del enjambre (`STATUS.knockbackDecay = 6`) y el usuario lo describió como *"es como que lo arrastras en vez de empujarlo"*. Tenía razón y el número lo confirma: recorría 5 unidades, pero el 95 % en 0,5 s y el resto reptando hasta **1,07 s**. Un empujón y un remolque dejan al jugador en el mismo sitio y **se diferencian en la forma de la curva, no en la distancia**. La misma distancia comprimida en ~0,24 s, con corte en seco por debajo de una velocidad mínima, ya se lee como golpe. El jugador tiene ahora **su propia curva de knockback**, separada de la del enjambre: a un cuerpo arrastrado por un vendaval le queda bien flotar, al jugador hay que golpearlo.

**Pendiente conocido (aceptado, aplazado por el usuario):** durante el empujón el personaje **ni gira ni anima**, porque `moving` en `player.ts` se calcula solo desde el eje del mando. Se desliza rígido. Candidato local y barato. El segundo candidato es que `updateCamera` (`world.ts`) pega la cámara al jugador sin ninguna interpolación, así que la escena entera da un latigazo — pero eso cambia el tacto de todo el juego y no se toca sin petición explícita.

### 2. Distancia de plantado del Tesla Titan: 7 → 4,5

`preferredDist` valía exactamente lo mismo que `BOSS.clearRadius`. **La distancia de plantado se mide desde el jugador y el anillo limpio desde el boss**, así que un Tesla aguantando a 7 dejaba al jugador parado justo en el borde del anillo — el único punto del arena donde la chatarra se amontona. Todas las peleas contra el Tesla se jugaban de pie encima del muro.

A 4,5 el jugador queda 2,5 unidades **dentro** de la burbuja limpia, con el boss como lo más cercano que tiene delante, que es lo que el auto-apuntado necesita. `retreatDist` baja 4 → 3,4 en el mismo movimiento: el gunner se queda quieto **entre** `retreatDist` y `preferredDist`, y una banda de 0,5 es demasiado fina para asentarse. 3,4 además queda justo por encima del contacto de cuerpos (2,5 + 0,7 = 3,2), así que retrocede antes de que el jugador esté dentro de él — lo que ahora importa, porque su cuerpo es sólido.

**Regla que queda escrita en `config.ts`:** no volver a subir `preferredDist` hacia `clearRadius` sin mover uno de los dos. El día que vuelvan a coincidir, la pelea vuelve al muro.

### 3. El portal de respawn nace donde está el jugador

`startRun()` sorteaba la posición alrededor de `(0, 0)` — el centro del mapa — **siempre, incluso para el portal que aparece tras matar a un boss**. En un arena de 180×180 podía salir en la punta opuesta a donde acababa de pelear.

Ahora se sortea alrededor del jugador. **El primer portal no cambia**: al empezar la run el jugador está en el origen, así que origen y jugador son el mismo punto. Lo único que cambia es el portal posterior a cada muerte, que es donde estaba el problema.

Distancias propias para el respawn — `respawnTotemDistMin/Max = 22/34` frente a `45/65`. 45-65 es correcto para el primero: es un hito que se ve de lejos y al que se decide ir, y la caminata **es** el compromiso. Cobrar ese peaje otra vez es impuesto puro, porque el momento de descubrimiento ya ocurrió. Sumado a `respawnDelayS = 25`, llegar a un segundo boss costaba en torno a un veinteavo de la run solo en desplazarse, antes de empezar a pelear — y encima con `respawnHpGrowth = 1,6` esperando al llegar.

Nunca cero: un portal que aparece encima deja de ser un sitio al que se va. Y si el jugador está pegado a una pared, un anillo centrado en él cae casi entero fuera del arena; si la colocación falla se **cae de vuelta al sorteo desde el origen**, que siempre tiene suelo alrededor, para que un jugador acorralado no bloquee el bucle de respawn indefinidamente.

`respawnDelayS = 25` se deja intacto a propósito: es la otra mitad del mismo coste de tiempo, y un cambio numérico por playtest.

### 4. RECHAZADO Y REVERTIDO — pasillo de embestida del Crusher King

Se construyó `shoveOutOfLane`: un corredor por delante del boss durante el lunge que tiraba los cuerpos **de lado**, cruzando el pasillo, para abrirle la cara al jugador. Iba acompañado de eximir al boss del filtro de `rebuildDynamicObstacles` que lo borraba de la lista de esquiva durante toda la embestida.

**Rechazado por el usuario, dos veces, siempre por cómo se VE, nunca por balance:** *"se ve como si se teleportan los enemigos a los lados en vez de apartarlos con el empujón con pura física"*. Revertido entero; `src/enemies.ts` volvió a HEAD sin restos.

Lo que se aprendió por el camino y **conviene no volver a descubrir**:

- **Los empujones de boss se acumulan por fotograma.** El barrido del King corre cada fotograma del lunge y `applyKnockback` **suma**, contra un decaimiento de 6/s. La recurrencia `v = v·0,9 + fuerza` a 60 fps no converge a la fuerza: converge a **diez veces** la fuerza. Un empujón de 34 lanzaba cuerpos a ~340 unidades por segundo. Eso, y no el ajuste, era lo que se veía como teletransporte.
- **Cambiar a velocidad objetivo tampoco lo salvó.** Se rehízo como "sube la velocidad de salida hasta N, nunca apiles" y se probó a 16 y, por el propio usuario, a 10. Siguió leyéndose mal. Tres valores distintos con el mismo veredicto: **el planteamiento es lo que falla, no el número.**
- **Un degradado hacia los bordes del pasillo es un error con velocidad objetivo.** La velocidad objetivo cae según el cuerpo se acerca al borde al que intenta llegar — una asíntota que deja cuerpos flotando en la frontera en vez de saliendo.
- **El bug de acumulación sigue vivo tras la reversión.** El barrido radial (`chargeShoveRadius = 4,5`, `chargeShoveForce = 26`) también corre cada fotograma durante la carga y también se apila: converge a ~260. Es **pre-existente**, el usuario nunca se ha quejado de él por separado, y arreglarlo es su propio cambio aislado — no algo que colar dentro de otro.

### El problema que sigue abierto

Nada de lo anterior resuelve la queja original completa. **El enjambre sigue tapando el acceso al boss**, y esa es la razón estructural por la que dos bosses en diez minutos son duros.

Los hechos medidos que cualquier solución tiene que respetar:

1. **Las armas apuntan al enemigo más cercano**, y la chatarra pegada al boss siempre está más cerca que el boss. `clearRadius` ataca esto por geometría y el sesgo de apuntado por la otra vía: `BOSS_TARGET_BIAS = 3` para las tres cazadoras con `range` explícito (bolt, welder, dismantler) y `BOSS_TARGET_BIAS_BASE = 1,5` de suelo para el resto. Es un multiplicador de cercanía aparente, no de alcance real.
2. **El propio anillo construye el muro.** Repeler cuerpos hasta radio 7 levanta una cáscara densa justo donde el jugador tiene que entrar. Ya estaba anotado en `config.ts` desde el pase anterior; subir `clearRadius` a secas mueve el muro más lejos y lo hace más denso.
3. **El King pierde su anillo en cada embestida.** Toma prestado `CHARGE.lunging` del Rustbrute para heredar el destello del telegrafiado, y con él cae en el filtro de `rebuildDynamicObstacles` pensado para chargeadores pequeños. Durante los 0,9 s del lunge deja de estar en la lista de esquiva y el enjambre camina hacia dentro. Como embiste cada ~7,8 s, el arena se come a sí misma a lo largo de la pelea. **Esto sigue tal cual: la exención se revirtió junto con el pasillo.**
4. **La embestida del King persigue, no se compromete.** Su `behavior` es `chase`, no `charger`: `moveChase` lo reapunta al jugador cada fotograma, solo que a velocidad 22. A diferencia del Rustbrute — que fija su rumbo en el telegrafiado y por eso se esquiva dando un paso al lado — **no hay nada que esquivar**. Es un cambio de diseño mayor, nunca se ha tocado, y es probable que sea la causa de que la embestida siga sintiéndose injusta aun con el empujón arreglado.
5. **Restricción de presentación, la más cara de aprender:** cualquier solución que cambie de golpe la velocidad de muchos cuerpos a la vez corre el riesgo de leerse como teletransporte, aunque los números sean correctos. El veredicto del usuario llegó tres veces sobre tres valores distintos.

Cuestiones abiertas para la sesión de diseño: ¿se ataca por densidad (menos cuerpos durante la pelea, vía `spawnDampenEarly/Late`), por geometría (forma del anillo en vez de su radio), por apuntado (subir `BOSS_TARGET_BIAS_BASE` mientras haya un boss vivo), por el moveset del King (embestida comprometida al estilo Rustbrute), o por el coste de tiempo (`respawnDelayS`, `respawnHpGrowth`)? Ninguna se ha evaluado todavía.

---

## Crusher King — reactivado con su comportamiento móvil anterior (2026-08-10)

**Estado actual:** el Crusher King vuelve a la rotación normal de invocación de Mapa 1 en AMBAS ramas para el siguiente playtest, junto al Tesla Titan. Recupera exactamente su comportamiento móvil anterior: `behavior: 'chase'` y `speed: 3`. El experimento posterior que lo anclaba con velocidad 0 queda revertido y no describe el comportamiento vigente.

> **HISTÓRICO / SUPERSEDED:** el resto de este apartado conserva el razonamiento y los resultados del experimento anclado. Ninguna mención posterior a velocidad 0, boss quieto o embestida al vacío describe el estado activo.

Este apartado sustituye a `docs/BOSS_KING_MOVESET_PLAN.md`, que se elimina: su propuesta se implementó, se juzgó y quedó superada por el hallazgo de abajo.

### El hallazgo que reencuadra el problema

Se fue a la fuente real de Megabonk (paso 1 de `METODO_DISENO.md`, que prohíbe explícitamente tirar de memoria). Lo relevante, verificado:

- **El portal del boss ya está colocado al empezar la run y se puede activar cuando el jugador quiera.** Es el modelo que queremos.
- **La oleada normal NO se detiene durante la pelea**; las guías avisan de matar rápido *"para que la arena del boss no se llene"*.
- **Todo ataque de boss tiene un wind-up visible que da al menos medio segundo de reacción.** Es una ley global, no una decisión por ataque.
- **Su primer boss (Lil Bark) se queda QUIETO**, y la contrajugada documentada es orbitarlo.

**El principio, que es lo que importa: el enjambre persigue al JUGADOR.** Si el boss está quieto en otro sitio, la chatarra se estira en cola detrás del jugador y nunca se apelmaza sobre el boss. **El hueco para dispararle es una consecuencia de quién se mueve, no algo que el boss tenga que fabricar.**

Nuestro King hacía lo contrario (`behavior: 'chase'`): jugador y enjambre compartían destino, así que el boss llegaba con la oleada puesta. Vista así, **las cuatro soluciones intentadas eran cuatro formas de deshacer un problema que creaba la propia persecución.** Y explica por qué subir la velocidad del boss —propuesta intuitiva— habría ido en dirección contraria: acelera justo el comportamiento que levanta el muro.

Fuentes: [guía de bosses](https://megabonk.org/guides/bosses/) · [timeline de fase](https://megabonk.org/guides/mechanics/timer/) · [ScreenRant](https://screenrant.com/megabonk-boss-guide-locations-how-to-beat/) · [Megabonk Wiki](https://megabonkwiki.net/articles/how-to-beat-every-boss-in-megabonk).

### Experimento histórico superado: anclaje y banquillo

`ENEMY_TYPES` 'Crusher King' pasa a `speed: 0` — el King se ancla. El usuario lo juzgó **mejor** que la persecución, pero encontró el defecto que motiva el banquillo:

> Si el jugador se aleja lo suficiente, el King se queda allí embistiendo al vacío, y esas embestidas largas terminan pegándolo otra vez a la oleada.

**Es la mitad no terminada de la EMBESTIDA, no del anclaje.** El ancla funciona; lo que falta es que el ram deje de perseguir y de cruzar 20 unidades para acabar encima del jugador. Eso es exactamente lo que hacía la etapa A del trabajo guardado (ver abajo).

El Tesla no tiene ese problema: aguanta una distancia de plantado y dispara, así que nunca comparte destino con el jugador. Por eso sigue siendo la referencia estable mientras se mide de nuevo al King.

### Trabajo construido, guardado sin juzgar (`git stash`)

Tres mecánicas se llegaron a construir y se apilaron sobre la misma pelea sin juzgar ninguna por separado. **El usuario cortó por eso**, con razón. Están en un stash con el mensaje `boss: stages A+B + open core`:

- **Etapa A — embestida comprometida + recuperación clavada.** El rumbo se fija al empezar el wind-up, un camino de movimiento comprometido en `EnemySystem` sobreescribe `moveChase`, y una fase `'recover'` deja al boss a velocidad 0 durante `recoverS`. **Es la pieza que le falta al King anclado.**
- **Etapa B — el pisotón que DESTRUYE chatarra.** `EnemySystem.killWithoutReward`, una vía de muerte deliberadamente separada que nunca pasa por `Game.onEnemyDeath`: sin XP, sin oro, sin crédito de kill, y élites y bosses inmunes. Cierra el exploit de invocar-y-farmear.
- **Núcleo expuesto durante la recuperación.** `Enemy.exposed`: las armas puntúan un cuerpo expuesto a `-1`, así que **gana por encima de la distancia** en vez de dividirla, más ×1,6 de daño. Atacaba el problema en la capa de apuntado, donde nació.

**Medido al hacerlo:** el pisotón no desinfla la oleada — `updateSpawner` rellena hacia un techo, así que el hueco se recupera en un ciclo o dos. Su coste real no es densidad, es **ingreso**: esas muertes no pagan.

### Ya rechazado — no volver a proponerlo

- **Barrido de pasillo (`shoveOutOfLane`)**: rechazado dos veces, siempre por cómo se VE. Detalle en la sección anterior.
- **Zona marcada que erupciona (etapa C del plan)**: construida y **rechazada al verla** el 2026-08-07 — *"queda muy raro"*. Diagnóstico estructural: cuatro eventos comparten un fotograma (chatarra estallando, anillo del pisotón, screen shake y un disco naciendo a 7 unidades), y la zona nace **fuera del foco** que la destrucción acaba de robar. No re-proponerla con esa forma.

### Dos medidas que conviene tener delante

- **El boss NO es una esponja.** El King son 2.600 HP a nivel de referencia 24 (escalado `nivel/24`, topes 0,35-1,6). Una run que llega a 600 s reparte entre 21.700 y 102.000 de daño total: el boss es el **2-16 %** de lo que el jugador ya suelta. Nunca fue el tamaño de la barra, sino qué fracción del DPS le aterriza.
- **Ninguna run grabada en 0.13.x ha llegado a un boss.** Las cinco terminaron en derrota entre 58 y 151 s, nivel 3-6. La restricción que muerde hoy no es el reloj de 10 minutos, es sobrevivir al minuto 2 — dar más tiempo no ayuda a quien muere en 105 s.

### Dos trampas de código encontradas por el camino

- **`BOSS.crusher.speed` y `BOSS.tesla.speed` eran valores MUERTOS.** `boss.ts` lee la velocidad base de `ENEMY_TYPES`. Tunear la clave "obvia" no habría hecho nada — mismo fallo que tuvo `BOSS.tesla.preferredDist` hasta el 2026-07-30. Ambas claves eliminadas.
- **`BOSS_TYPE_INDEXES[0]` se usaba como identidad.** Dos sitios de `boss.ts` despachaban así, y con un pool sin King ese `[0]` pasa a ser el Tesla: lo habría ejecutado por `updateCrusher` — embistiendo, invocando scraplings y sin disparar una sola ráfaga. Ahora se pregunta por `CRUSHER_KING_TYPE_INDEX` / `TESLA_TITAN_TYPE_INDEX`.

## Presión y balance del Mapa 2 — Implementado 2026-08-18 (v0.14.0)

Cierra el Workstream 4 de `docs/PLAN_MAPA2.md`, donde vive el detalle completo con
sus mediciones. Está medido, cubierto por tests y **jugado por el usuario en la
propia sesión** — varios de los números salieron de ese playtest. Lo que falta es
**muestra**: no hay runs de 0.14.0 en `run-history.json` (una run solo se graba si
termina), así que `pnpm stats` todavía no tiene contra qué calibrar.

### Tres relojes en vez de uno

`EnemySystem.update` recibía un solo reloj y de él derivaba tanto la presentación
como la fuerza de la oleada. Se separan porque son preguntas distintas:

| Reloj | Qué decide | ¿Rebobina al cruzar de mapa? |
| --- | --- | --- |
| `elapsedS` | fases visuales (parpadeos, auras, wobble) | sí |
| `arcElapsedS` | vida de enemigo, rampa de élites | **nunca** |
| `rosterElapsedS` | qué tipos de enemigo aparecen | **sí, a propósito** |

El síntoma que lo destapó: el Mapa 2 abría con un multiplicador de vida de 2.2×
justo después de que el Mapa 1 cerrara en 4.0×. El enjambre se ablandaba justo
donde la build del jugador estaba en su pico.

`rosterElapsedS = mapElapsedS × MAPS[].rosterSpeed`. El Mapa 2 usa `2.5`, así que
replantea las presentaciones (Voltling a 0:00, elenco completo de vuelta a 2:48) y
la fundición tiene una apertura propia en vez de heredar el reparto terminado del
mapa anterior.

### Curva de dificultad por mapa

`MAPS[].difficulty = { floor, peak, rampS }` sustituye a `difficultyOffsetS`.

- **Mapa 1: `{ floor: 0, peak: 1, rampS: 480 }`** — reproduce la fórmula global
  histórica **bit a bit**, verificado en 7 puntos de tiempo y congelado por test.
- **Mapa 2: `{ floor: 0.7, peak: 1.15, rampS: 600 }`** — abre en la presión del
  minuto 5 del Mapa 1 (277 cuerpos) y cierra en 437, por encima de cualquier cosa
  que el Mapa 1 alcance.

`peak > 1` es significativo: el motor ya multiplicaba cap de vivos, tamaño de
oleada y vida por todo lo que pase de 1, pero solo el mod Cursed llegaba ahí.

`rewardScalar(difficulty, curve)` acompaña al cambio: la XP y el oro de élite
pagaban un bonus por "dificultad por encima de 1", regla que solo se sostenía
mientras 1 fuera también el techo del reloj. Ahora el exceso se mide contra el
techo DEL MAPA, así que vale exactamente 1.0 cuando la presión la puso el reloj.

### Jerarquía de golpe, por mapa

`MAPS[].contactDamageMult` y `MAPS[].bossContactDamageMult`, más
`BOSS.contactDamage` de 12 a 16.

| Mapa | Grunt | Élite | Boss | Muere en |
| --- | --- | --- | --- | --- |
| Scrapyard | 8.0 (20 dps) | 10.8 (27) | 16.0 (40) | 2.5 s |
| Swarm Foundry | 12.0 (30) | 16.2 (41) | 20.0 (50) | 2.0 s |

Los proyectiles de boss y los disparos del Gunner quedan **fuera** del
multiplicador de mapa a propósito: tienen su propio tuneo y el jefe final vive en
el Mapa 2.

Un test congela, para cada mapa, `grunt < élite < boss` y que el DPS de boss se
mantenga por debajo del que se midió y rechazó el 2026-07-30 (62.5, muerte en
1.6 s). Esta jerarquía se había invertido en silencio.

### Cobertura y variedad de props

- **`FOUNDRY_CONTAINER_PROP`**: 7-9 puertas de contenedor, pasillo de 5.4 de medio
  ancho, en violeta (hue 258) y musgo (hue 88) — las dos únicas ventanas de matiz
  que el proyecto tenía libres. Reutiliza el modelo del Mapa 1 recoloreado, como
  test barato de si la fundición quiere esta geografía antes de autorar arte.
  El conteo va por debajo de las 10-13 del Mapa 1 porque los obstáculos bloquean
  también las armas del jugador (`hasLineOfSight`), y el apuntado es automático.
- **`pickSpatialVariant()`** elige la variante más rara entre los props ya puestos
  dentro de un radio. El scatter sorteaba de forma independiente por prop, lo que
  produce rachas de 4-5 iguales por aritmética. Vecinos del mismo color: celdas
  34.6% → 10.4%, puertas 50.7% → 19.0%. El Mapa 1 conserva su comportamiento
  (`BARREL_PROP.variantSeparation: 0`).

### Instrumento: readout de dificultad en vivo

`DEV_TOOLS.difficultyReadout` pinta en la esquina mapa, los tres relojes, la
dificultad contra el suelo/techo de su mapa, el multiplicador de vida, el daño de
contacto vigente y los cuerpos vivos. Todos los valores se **leen** de lo que usan
los sistemas. Existe porque "¿se aplicó el cambio de balance?" era irrespondible
jugando: los números solo salían en el historial al terminar una run. Gateado, y
`check-release-flags.mjs` aborta el empaquetado con él encendido.

### Atajos de dev que mentían

La tecla **T** saltaba a la transición sin tocar el reloj de arco, así que pulsarla
en el segundo 30 metía al jugador en un Mapa 2 con vida ×1.15 en vez de ×4.0. Y
`applyRecordedBuild` **machacaba la build en vivo** con una grabación vieja, o sea
que jugar el Mapa 1 de verdad y pulsar T te cruzaba con otra build.

Ahora: el reloj se adelanta a un Mapa 1 completo (sin rebobinar nunca), la build en
vivo manda siempre, y la grabación de respaldo exige `durationS >= MAPS[0].durationS`
— `sectorsCleared` y `mapsReached` **los falsifica el propio atajo**, porque la T
pasa por el mismo `enterMap` que un cruce real.

---

## Hazard Marshal — baseline jugable CERRADA (2026-08-20, candidato v0.22.0)

Cierra el Workstream 3 de `PLAN_MAPA2.md`. Sustituye al arnés
provisional de integración: el boss final ya no es "un cuerpo que persigue y
descarga", sino un encuentro con entrada propia y escalada legible.

> **Cómo leer esta sección:** es un changelog cronológico del cierre. Los valores
> de las primeras tandas (por ejemplo, el despeje inicial del arena) son historia
> de implementación; las tandas posteriores y el snapshot al principio del PRD
> mandan cuando un número o estado evolucionó.

### El sector se reabre como ARENA antes de que llegue el boss

Al agotarse el reloj no aparece el boss encima de lo que hubiera: **se reinicia
el Mapa 2 detrás de la MISMA cortina de fundido que usa un cruce de sector**
(`MAP_TRANSITION`, etiqueta **`FINAL BOSS PHASE`** — antes decía `SECTOR SEALED`,
que describía la puerta cerrandose detras del jugador y dejaba el evento real,
una pelea de boss, a que se dedujera). A negro pleno —donde el proyecto ya
aprendió que hay que esconder cualquier swap— pasa esto:

- Se limpian todos los actores locales (`resetForMapTransition`): enjambre,
  proyectiles, pickups, orbes, oro suelto, chatarrero, marcadores. El jugador
  vuelve al **centro** (lo hace ya `player.enterMap()`).
- Se **vuelven a tirar los props con el centro vacío**: nada de escenografía
  dentro de `FINAL_BOSS.arena.clearRadius` (28). El resto de la fundición sigue
  ahí — los props se redistribuyen hacia fuera, no se borran: 124 colisionadores
  siguen en pie tras el reinicio.
- Se cura a tope si `FINAL_BOSS.arena.healToFull` (por defecto sí, misma lógica
  que el cruce de 0.3: llegar al clímax con 4 de vida decide la pelea antes de
  empezarla). **El oro NO se pone a cero**, al revés que un cruce: la run no
  abre economía nueva, cierra la que tenía.

**No es un cruce de sector**: `openFinaleArena` no llama a `transitionToMap`, no
acredita sector, no cambia de mapa y no toca el estado del arco — el sector lo
cierra la muerte del boss, como antes. Y si la colocación falla, **reintenta la
LLEGADA, nunca la cortina**: un finale no puede reiniciar el sector dos veces.

**Trampa medida al implementarlo:** una sola zona de exclusión en el centro no
vacía el centro. Los gates (`buildContainerProps`) se colocan por su punto
CENTRAL y luego extienden dos contenedores `gapHalf + length/2` a cada lado con
colisionadores repartidos por su eje — con un círculo de 28 apareció un
contenedor a **26,6** del medio. `placeRandomProps` aplica ahora el radio
**por familia de prop, inflado por el alcance de cada una** (`gateReach`).

### La llegada: mismo lenguaje que un boss del Mapa 1, sin portal

`advanceRunFlow` sigue emitiendo su `start-finale` al agotarse los 10 minutos;
lo que cambia es lo que ocurre después. Antes el cuerpo aparecía de golpe a
`px + 24`. Ahora, **con la arena ya reabierta y la cortina levantada**, se abre
una **llegada telegrafiada de 2,5 s** —el
mismo `BOSS.summonDelayS` de un tótem— con el haz estroboscópico y los anillos
de aviso rojos sobre el punto de aterrizaje, pero **sin la puerta del portal
visible**: el Marshal no se invoca, llega. El cuerpo se materializa por el
**mismo camino de código** que un summon normal, así que el banner `HAZARD
MARSHAL AWAKENS`, la erupción de cubos, el anillo de choque y el temblor son
literalmente el mismo beat, no una segunda implementación que pueda divergir.
Durante el telegrafiado no se añade colisión en ese punto: hay un aviso en el
suelo, no un muro invisible.

### Dónde aterriza: tres reglas medidas, no una distancia a ojo

`FINAL_BOSS.arrival`, con la colocación en `BossSystem.findArrivalSpot`:

1. **Fuera de alcance.** Anillo de 11–15 unidades alrededor del JUGADOR. El
   contacto son 3,8 (radio del boss 3,1 + jugador 0,7), así que 11 es 2,9× esa
   distancia — y nada puede estar ahí cuando cae, porque el aviso dura 2,5 s.
2. **Dentro del cuadro, entero.** No basta con proyectar el punto del suelo: la
   cámara mira hacia abajo, así que un cuerpo de 9,87 unidades con los pies
   cómodamente en pantalla pierde la cabeza por el borde superior (medido: a 19
   unidades hacia arriba de pantalla la cabeza cae en ndc.y 1,12). Se proyecta
   la **caja del cuerpo** —cabeza, pies y ambos flancos— a través de la cámara
   viva, nunca un radio fijo: el cuadro depende del aspect ratio y se movería
   con cualquier resize.
3. **Con sitio para pelear.** Libre de props, torres y pickups por su radio
   **más 3,5 unidades** de holgura. Map 2 esparce ~130 colisionadores; "libre" y
   "con espacio para moverse" no son la misma pregunta.

Entre los puntos que cumplen las tres, gana el **mejor encuadrado**: se prefiere
la banda central del cuadro, porque la franja superior lleva el reloj y la vida
y la inferior la barra del boss — un Marshal ahí está técnicamente en pantalla y
prácticamente medio tapado. Si nada cumple, se relaja en dos pasos documentados
(primero la holgura, luego el encuadre) y en último caso el frame siguiente
reintenta: un finale que no llega es peor fallo que uno descentrado.

### Las tres fases (`src/final-boss.ts`)

Acumulativas y **por VIDA, nunca por reloj** (un temporizador castigaría a la
build que mata rápido). Umbrales en `FINAL_BOSS.phaseThresholds` (66% / 33%).
Cada cambio de fase **aturde** al boss 1,4 s, revienta cubos ámbar + núcleo
blanco + anillo rojo, sacude la cámara y anuncia: `ASSEMBLY LINES ONLINE`,
`CORE OVERLOAD`. Ese es el evento raro que reserva el clip `hit` de 3.A.2; el
daño corriente sigue siendo solo tinte.

- **Base (todas las fases) — descarga radial.** El comportamiento que el pase de
  integración ya validó, conservado como latido del combate. Su cooldown se
  acorta por fase (6,5 → 5,5 → 4,5 s).
- **Fase 1 — barrido sectorial.** El boss se planta, se enciende una **cuña** de
  42° y 20 unidades apuntada al jugador durante 1,3 s, y descarga: **25% de la
  vida máxima** dentro de la cuña más un abanico de cubos por el arco. **La puntería se fija
  al empezar el telegrafiado**, no al disparar: una cuña que persiguiera sería
  un impacto inevitable disfrazado de aviso.
- **Fase 2 — líneas de ensamblaje.** Abre **bahías en el perímetro** del lado en
  que se está jugando, avisa 1,4 s **en la bahía** (no en el boss) y mete 4-6
  refuerzos por bahía. Las bahías se abren en un anillo alrededor del jugador
  que **crece con la fase** (9 → 11 → 14 unidades): con 6 puntos sobre el anillo
  de 9 los vecinos quedaban a 9 unidades y caían todos dentro de una sola
  reacción; a 14 quedan a 14 y hay hueco para colarse entre dos.
  Van con el **multiplicador de vida de la oleada viva**
  (`EnemySystem.waveHpMultiplier`), no con el 1 por defecto de `spawnAt`, o
  serían enemigos de papel en el minuto más duro. Techo duro de 320 cuerpos: el
  spawner ya está rellenando hacia su propio cap y el finale no puede duplicarlo.
  Las líneas están activas desde la Fase 1 y escalan **2 → 4 → 6 áreas** con un
  reparto legible por fase: **Voltling original + Roller**; después se conserva
  esa pareja y entra **Axle Runner** en una de las áreas nuevas; finalmente se
  conserva el reparto anterior y entra **Slagcaster** en otra área nueva. Esta
  es una excepción visual exclusiva del finale: las oleadas normales de Swarm
  Foundry siguen sustituyendo Voltling por Furnace Mite. El Voltling original
  usa un tipo de refuerzo separado y su propio `InstancedMesh`; nunca crea una
  malla por cuerpo.
- **Fase 3 — sobrecarga del núcleo.** Cadena de 4 **zonas de peligro** que nacen
  en el boss y erupcionan hacia fuera por la línea del jugador, una cada 0,45 s;
  **25% de la vida máxima** por zona. Son **3 líneas paralelas** separadas 18
  unidades entre centros, y cada zona nace más grande que la anterior (3,2 →
  5,2 de radio), así que los carriles se estrechan de 11,6 a 7,6 unidades según
  avanza la oleada: se elige carril pronto o no se elige. El boss además acelera
  ×1,15.

### El daño del boss es un PORCENTAJE de la vida del jugador (2026-08-19)

Decisión del usuario. Los cuatro ataques piden una fracción de la **vida
MÁXIMA** —`player.maxHp`, nunca la vida que queda en la barra—, leída en el
momento del impacto para que un core de Max HP a mitad de pelea cuente:
**cuña 25% · zonas rojas 25% · balas rojas 20% · caer dentro de una bahía 15%**. Un número plano se calibra contra
una vida concreta y deja de significar lo mismo en cuanto entran cores de Max
HP: el mismo golpe que quitaba un cuarto de la barra al llegar al finale pasaba
a quitar un octavo. El porcentaje mantiene el peso del encuentro constante en
cualquier build, y **todo lo demás del embudo sigue igual** — evasión, escudo y
armadura se aplican después, exactamente como con cualquier otro daño.

Un porcentaje sobre la vida ACTUAL haría lo contrario de lo que hace falta: el
boss se ablandaría cuanto más cerca estuviera de matarte y ningún ataque podría
rematar a nadie. Congelado en dos sitios: `tools/final-boss.test.mjs` comprueba
la fuente, y `pnpm test:finale-runtime` lo MIDE en el frame de la descarga con
la barra retenida a un tercio — pidió 28 (25% de 110 de máximo) y no 416.655
(25% de lo que quedaba).

La jerarquía está congelada por test: bahía (nudge para moverse) < balas <
los dos ataques firma; y ninguno pasa del 35% de la barra, porque un ataque que
mata en tres golpes se lee como injusto, no como difícil. A la vida base de 100
el 15% de la bahía queda por debajo del roce del boss (16), y es deliberado: ese
marcador está para empujarte fuera, no para matarte.

**Las balas rojas también atraviesan el i-frame.** MEDIDO: conectaban 6 veces en
40 s y aterrizaban 0, porque con el enjambre encima la ventana de 0,4 s está
abierta casi siempre. El i-frame es el tope del DPS del ENJAMBRE; el proyectil
de un boss es un ataque que se ve venir. La esquirla del Gunner conserva el tope.

**Una sola telegrafía a la vez**, y es regla, no ajuste: la única zona de suelo
que este proyecto rechazó de un vistazo (Crusher etapa C, 2026-08-07) falló
porque cuatro eventos compartían un frame y la zona nacía fuera del foco que el
resto ya había capturado. Aquí origen y destino siempre están en pantalla y nada
más dispara durante una cadena.

### La entrada del boss es suya: fuego en pausa y la orden se oye (2026-08-20)

Dos huecos que quedaban abiertos del finale, los dos del mismo momento.

**1. Las armas disparaban sobre la llegada.** Durante los 2,5 s del aviso el
campo está vacío (arena reiniciada + `enemies.wavesPaused`), pero solo 4 de las
11 armas comprueban si hay enemigos antes de disparar. Volt Pulse, Hydraulic
Press, Acid Drum y Dismantler seguían soltando losas, ácido y zarpazos contra la
nada, con las sierras zumbando encima, justo en el momento más importante del
arco. Ahora `CombatCtx.holdFire` corta la DESCARGA mientras corre el
telegrafiado (`FINAL_BOSS.arrival.holdPlayerFire`): las órbitas siguen girando y
los cooldowns siguen corriendo — la pelea abre con la salva que se les debía —
pero nada dispara ni suena encima de la entrada. **Solo el finale**: en el Mapa 1
el portal se carga con el enjambre encima y frenar el fuego mataría al jugador.

**2. La orden de abrir las líneas de ensamblaje no sonaba.** Emitía
`boss-attack`, un id que nunca estuvo en `enabledEvents`, así que moría dentro de
`emit()`; sonaba solo su consecuencia (`boss-assembly-spawn`, cada bahía
materializando cuerpos) y no la causa. Nueva cue **`boss-assembly-open`**
(`tools/audio/prototype-r39-assembly-open.mjs`): dos contactores cerrando y los
motores de línea arrancando, en el boss, 1,4 s antes de que caiga nada. El id
genérico se eliminó del código: una cue muerta que aparenta sonar es peor que
uno que falta.

Se diseñó **midiendo**, no de oído, contra las cues hermanas. La primera versión
salió con centroide 230 Hz y un 1% de energía sobre 2 kHz — más oscura que
`boss-overload-open` (313 Hz), que es justo la que tiene que distinguirse — y con
la misma envolvente descendente. La versión final invierte las dos cosas:
**29% de energía en medios** contra el 10% de la de sobrecarga (mecánico, no
presión) y una envolvente que **CRECE hasta 0,4 s** mientras la otra decae. Esa
diferencia de forma sobrevive a una mezcla cargada mejor que cualquier
diferencia de timbre.

Verificado en Electron: `boss-assembly-open` arranca voz real, y durante el
telegrafiado se cuentan **0 voces de arma**.

### La barra tiene que enseñar el golpe que mata (2026-08-20)

Queja del usuario: "queda raro ver que tengo 15 de vida y muero". Y era
literal, no una sensación: `updateBars` **solo corre mientras la run está
`playing`**, y el golpe letal cambia de estado en el MISMO frame, así que lo
último que se dibujaba era la vida que tenías ANTES de morir. La sobrecarga del
chasis se reproducía debajo de una barra marcando 15/100.

Dos mitades:

1. `beginDefeatTransition` empuja la barra a 0 y le da el mismo flash que
   cualquier otro golpe — el impacto se lee igual lo lance quien lo lance.
2. El beat de impacto pasa de 0,10 s a **0,15 s**, que es exactamente la
   transición real de `#hp-bar-fill` (`width 0.15s steps(4)`). Así la barra
   termina de vaciarse en el frame en que arranca la animación de muerte, no
   sobre una barra a medio bajar. `titleRevealS` sube a 0,80 para conservar la
   regla de que el título es el final de la sobrecarga, no un número suelto.

Las dos constantes son UNA decisión viviendo en dos ficheros, así que hay un
test que parsea la hoja de estilos y falla si se cambia una sin la otra — misma
disciplina que los sonidos cortados contra la animación real. Y
`pnpm test:defeat-runtime` lo mide en Electron: la barra marca `0/…` desde el
frame del golpe y le quedan **0,0 px de relleno** cuando empieza la sobrecarga.

### Legibilidad de la salva y capa de las telegrafías (2026-08-20)

Dos quejas del usuario, las dos medidas antes de tocar nada:

- **"Sigo confundiendo las balas rojas con otros efectos."** Censo de tonos: la
  salva estaba en **hue 355** y las zonas de peligro sobre las que vuela en
  **350** — cinco grados. Por eso subirle tamaño y saturación no arregló nada.
  Además, el "núcleo blanco" que se le había puesto para separarla era un cubo
  de 0,3 **dentro** de uno sólido de 0,75: encerrado en un cuerpo opaco no se ve
  desde ningún ángulo, o sea que no existía. Ahora las dos mitades de la
  estrella se pintan por separado: el cubo alineado es el **núcleo casi blanco y
  es la superficie que se ve**, y el girado solo asoma las puntas en rojo. El
  blanco sobrevive a cualquier fondo de este suelo; el rojo plano no. No se
  cambió el tono a violeta ni a verde porque **el violeta es del Roller** (uno
  de los dos tipos que suelta el propio boss) y el cian es de sus bahías.
- **"Los efectos predominan por encima de los modelos 3D del escenario."** Las
  telegrafías del finale eran las únicas marcas de suelo grandes y llevaban el
  `depthTest` apagado como el resto: un anillo de 4 unidades pintado sobre una
  caja pasa desapercibido, una cuña de 20 sobre una chimenea de 12 se lee como
  una lámina flotando sobre el nivel. `VISUAL.bossTelegraphsUnderScenery` les
  devuelve el test de profundidad — **solo a ellas**: el marcador del jugador,
  el de élite y el del boss conservan la decisión de playtest del 2026-07-26.
  Siguen en la cola opaca, sin escribir profundidad y por debajo de los cuerpos,
  así que la chimenea se planta DENTRO de la zona en vez de quedar detrás.

### Telegrafías de suelo: la regla de render que ya mordió dos veces

Cuña y zonas viven en la cola **opaca** (`transparent: false`), con la opacidad
**horneada en el color** —`material.opacity` se ignora fuera de la cola
transparente— y `renderOrder` puesto **por malla**, que no se hereda del grupo.
Así la escenografía no las corta y ellas no tapan los cuerpos. `reset()` apaga
todas: un aviso que sobrevive a su dueño es una mentira pintada en el suelo.

### HUD

La barra del boss gana una línea ámbar `PHASE n/3`, solo en el finale. Sin ella
la escalada solo era legible en el instante en que parpadea el banner.

### Verificación

- `pnpm test` incluye `tools/final-boss.test.mjs`; el cierre del candidato suma **36/36 pruebas del boss**: geometría de la
  cuña contra su regla de impacto, puntería fijada, escalada de fases, refuerzos
  con la vida correcta y con techo, una telegrafía por frame, `reset` limpio,
  reglas de render, y el anillo de llegada contra proyecciones reales a 16:9,
  16:10 y 4:3.
- `pnpm test:finale-runtime` mide el finale **en Electron, sobre el Mapa 2 real**
  (5 llegadas independientes): distancia, caja del cuerpo dentro del cuadro,
  holgura contra los colisionadores del mapa, **centro vacío tras el reinicio de
  arena** (obstáculo más cercano al medio ≥ 28), escenografía conservada,
  jugador en el centro, alto/ancho reales del modelo contra los de `config`, y
  las tres fases con sus banners, **y que ninguna oleada se une a la pelea**
  (20 muestras en 10 s). Guarda frames en `tmp/finale-runtime-output/`. Llega al
  finale con una sola pulsación de Y desde el Mapa 1, así que requiere
  `DEV_TOOLS.finaleKey`.

### Fuera del cierre de la baseline

- Balance del encuentro con datos de runs humanas (`pnpm stats`): los números de
  daño, cooldowns y umbrales son primeros valores razonados, no medidos en juego.
- Audio propio **cerrado para esta baseline**: `boss-sweep-charge/warn/fire`,
  `boss-volley`, `boss-assembly-open/spawn` y `boss-overload-open/erupt` están
  cableados. `boss-assembly-open` se reproduce desde un checkout limpio mediante
  la ruta canónica `pnpm audio:generate`; `boss-attack` fue retirado.
- Arena reactiva de 2.4 (suelo sectorizado, bahías visibles, suelo modular): las
  fases funcionan hoy con telegrafías propias, sin depender del layout.
- **Oleadas normales: CERRADO.** `enemies.wavesPaused` permanece activo durante
  el finale; solo entran los refuerzos que el propio Marshal invoca.
### Decisión 0.8 CERRADA: durante el finale no entran oleadas

`enemies.wavesPaused` se deriva de `runFlow.finaleStarted` cada frame, así que
desde el instante en que el finale se dispara **el spawner no emite nada**. El
reinicio de arena sería si no un efecto de veinte segundos: en el pico de la
fundición el spawner rellena hacia ~437 cuerpos, o sea que el suelo limpio sobre
el que aterriza el boss desaparecería antes de que terminara de llegar.

Los **refuerzos de la Fase 2 no se ven afectados**: entran por `spawnAt`
directamente, no por el spawner, así que la única presión añadida durante la
pelea es la que el propio Marshal decide llamar. Medido en runtime: 20 muestras
en 10 s con el boss vivo en Fase 1 dan **1 cuerpo** (él).

Detalle: la pausa se comprueba ANTES del temporizador de oleada. Un spawner
pausado que siguiera descontando soltaría una oleada entera al reanudarse — en
el pico de la fundición, dieciséis cuerpos de golpe.

### Atajo de dev: Y salta al finale desde cualquier punto del arco

`DEV_TOOLS.finaleKey` (gateado, y `check-release-flags.mjs` aborta el
empaquetado con él encendido). **T** ya llegaba al finale, pero solo desde
dentro de la fundición; desde una run nueva verlo costaba un Mapa 1 entero, un
boss y diez minutos más. **Y** cruza lo que quede del arco por el mismo
`enterMap` de `run-flow` —crédito de sector incluido, igual que la T— y después
adelanta el reloj del mapa, así que el encuentro sigue llegando por el
`start-finale` estructural y no por una puerta trasera. **La build en vivo se
conserva**, exactamente igual que con la T (`overlayLatestRecordedBuild` solo
actúa si la run no tiene progreso propio). Cuando una run fresca toma una build
grabada, conserva el personaje seleccionado y recalcula esa build desde sus
stats base; así una victoria con Rack Hauler se registra como Rack Hauler y
puede progresar `Two of a Kind`. Solo **Shift+Y**, la variante explícita de
restauración, recupera también el personaje de la run grabada.

Las dos teclas comparten un único `windClockToFinale()`: dos copias del disparo
acabarían divergiendo el día que cambie el trigger.


### Pase de presión tras el primer playtest humano (2026-08-19)

**Reporte:** "el boss no me ha quitado vida ni una vez". Se midió en vez de
suponer, con una sonda nueva (`node tools/finale-runtime-check.mjs --pressure`)
que juega la pelea con la vida SIN rellenar, tres patrones de movimiento y
atribución de cada impacto por la distancia al boss en el momento de recibirlo
(contacto vs kit a distancia). Los tres defectos que salieron:

1. **Nada en la pelea es más rápido que el jugador.** El Marshal caminaba a 3,2
   contra 11. Sin oleadas ambientales —que se acababan de quitar— no quedaba
   nada que le robara espacio, así que todo su kit telegrafiado se esquivaba
   andando. Un bot quieto recibía 97 impactos en 45 s; uno kiteando, 0.
2. **Los refuerzos aterrizaban DETRÁS.** Se colocaban en un anillo alrededor de
   la posición actual del jugador, pero la telegrafía dura 1,4 s y a 11 de
   velocidad eso son **15,4 unidades** — más que el radio del propio anillo (9).
   Contra alguien corriendo, la caja se cerraba sobre suelo vacío.
3. **La descarga radial no podía alcanzar a nadie que huyera.** Proyectil a 13
   contra jugador a 11 cierra a **2 u/s**: desde las 15 unidades a las que se
   dispara, tarda 7,5 s en alcanzarlo, más de lo que vive el proyectil. El
   anillo solo podía golpear a quien estuviera quieto.

**Cambios (decisión del usuario + lo que la medición exigía):**

- **Vida ×5** (7200 → 36000 en `hpLevelReference`): la primera pelea humana
  moría antes de la Fase 2, así que dos tercios del moveset no llegaban a pasar.
- **Velocidad 3,2 → 4,0.** No puede ser el arreglo por sí sola —nada por debajo
  de 11 atrapa a quien kitea—, solo evita que el cuerpo se deje atrás andando.
- **Los refuerzos son ahora el motor de presión y viven en TODAS las fases**
  (la fase decide cuántas líneas se abren: 1 → 3 → 3 puntos, 4 → 4 → 5
  Voltlings). Caen **alrededor del jugador** (radio 9 ± 2,5), no en el
  perímetro: 46 unidades a velocidad 5,5 son ocho segundos y el jugador ya no
  está ahí.
- **Lideran el objetivo**: el punto de caída se adelanta `velocidad ×
  telegrafía × 0,8`, con tope de 13 unidades. El 0,8 es deliberado — un lidereo
  perfecto sería injusto; este se rompe girando, que es justo la habilidad que
  el ataque debe pedir.
- **Proyectil 13 → 18** (cierra a 7 u/s, alcanza en 2 s).

**Medido después, 40 s por patrón, Fase 1:** quieto 89 impactos · órbita cerrada
12 (10 a distancia) · kiteo ancho **0 → 5, todos a distancia**. La pelea sigue
premiando jugar bien; ya no es imposible que te toque.

**Sigue abierto:** el balance fino es cosa de tus runs, no de la sonda. Si aún
se siente inofensiva, las dos palancas siguientes en orden son la DENSIDAD de la
descarga (16 disparos dejan ~6 unidades de hueco a la distancia a la que cruzan
al jugador: un abanico apuntado cerraría el carril) y el número de puntos de
caída por llamada.


### Segundo pase de playtest: cuña, VFX, animación y collider (2026-08-19)

Cuatro reportes, cuatro causas medidas.

**1. "Si estoy dentro de la onda ámbar no me quita daño."** El barrido pedía
daño y **el daño se lo comían los i-frames**: medido, 5 peticiones en 40 s y
**0 aterrizajes**, todas dentro de la ventana de 0,4 s que acababa de abrir un
Voltling al tocarte. `damagePlayer` descarta el golpe entero, no lo reduce.

El i-frame existe para **capar el DPS del ENJAMBRE** —es la palanca de dificultad
de meterse en una multitud—; un ataque que se te enseña 1,3 s antes no es daño de
roce. Ahora los ataques del boss pasan por `damagePlayer(..., pierceIframe)`, que
**limpia** la invulnerabilidad en vez de ignorarla, así que evasión, escudo,
armadura y espinas siguen ejecutándose una vez cada uno por el embudo real. Solo
pincha el hook de la pelea: contacto y proyectiles conservan el cap.
Medido después: 5 pedidos → 3 aterrizados (los otros 2, esquiva/escudo).

**2. "Las partículas y el bloom al pegarle son exagerados."** Dos causas
sumadas, ambas por tamaño: las chispas por impacto (2, 5 en crítico) están
calibradas para un cuerpo de 0,9 unidades que muere en dos golpes, y el tinte de
golpe es **2,5×** durante 0,08 s. Un boss mide 9,87, recibe cientos de impactos y
a menudo varios por frame, así que `hitFlash` no se apaga nunca: el cuerpo entero
vive a 2,5×, muy por encima del umbral de bloom (0,85). Ahora hay
`VISUAL.hitSparks.bossCount/bossCritCount` (1/2) y un `BOSS_FLASH_TINT` de 1,45.

**3. "No está la animación de caminar."** Estaba construida (`src/models/rig.ts`,
clips `idle`/`walk`/`hit`) pero **solo se veía en el previsualizador**: el boss se
dibujaba por el `InstancedMesh` compartido, y una instancia no tiene miembros.
Nuevo `src/boss-rig.ts`: talla el rig del **mismo VoxelGrid** que el cuerpo
instanciado (un modelo, no dos assets), lo coloca por un grupo aparte —`poseRig`
sobrescribe el transform de la raíz cada frame— y **oculta la instancia**
(`EnemySystem.externallyDrawn`) para que el cuerpo no se dibuje dos veces. La
sombra y el doble anillo rojo se siguen dibujando: son del cuerpo, no del mesh.
Clip por lo que hace la pelea: `walk` al moverse, `idle` cuando una telegrafía lo
planta, `hit` una vez por cambio de fase. Carga async: hasta que está listo sigue
dibujando la instancia, así que un decode lento degrada al comportamiento de
antes, nunca a un boss invisible. Verificado en runtime: 8 piezas, instancia
oculta, y **0,48 rad de movimiento de articulaciones en 0,4 s** — un rig
congelado y uno vivo son idénticos en una captura fija.

**4. "El collider es raro, me golpea antes de chocar."** Medido: el cuerpo tiene
semiejes **3,24 de ancho y 1,33 de fondo**, contra un `radius` de **3,10**. De
frente, el daño saltaba **1,77 unidades antes** de tocar nada visible.

La causa de fondo es que `radius` hace otros tres trabajos (esquiva del enjambre,
colocación de spawns, discos de aura y sombra), así que tocar al jugador tiene
ahora su propio número: `EnemyTypeDef.contactRadius`, usado por el contacto y por
el cuerpo que el jugador no puede atravesar. Un círculo no puede acertar en un
cuerpo 2,4 veces más ancho que profundo, así que **2,2 reparte el error**: de
frente lo solapás 0,17 antes de que duela; por el costado te metés 0,34 en un
brazo. Ambos por debajo de media unidad, contra el cuerpo y medio de aire de antes.


### El barrido: SÍ golpea — lo que faltaba era poder notarlo (2026-08-19)

Reporte: "el área dorada sigue sin golpear al jugador si estoy dentro cuando
explota". Se instrumentó el **frame exacto de la descarga** (posición del
jugador, ángulo respecto al eje del ataque, rotación del marcador dibujado vs
la del arco probado, y si se pidió daño). Resultado, tres descargas seguidas:

```
discharge: player 2.9 away, 0 deg off the aim  drawn 2.206 vs aim 2.206  -> DAMAGE
```

**3 de 3 con el jugador dentro hicieron daño**, y el marcador dibujado coincide
con el arco probado hasta el último decimal. El mecanismo estaba bien; lo que
fallaba era el **feedback**: un impacto de 26 producía exactamente lo mismo que
el roce de un Voltling —flash rojo, un temblor y un pelín de barra— y ninguna
cifra. Con una barra de vida crecida por cores, eso es invisible.

De paso, el primer instrumento **pasó en vacío** (0 descargas registradas) porque
escribía en `__voltswarm.__sweeps` y leía `window.__sweeps`. Una comprobación que
pasa sin muestras es peor que no tenerla: ahora "0 descargas" es un FALLO
explícito, y si no registra nada imprime la traza de estado de la pelea.

**Lo que se añadió, que es lo que el reporte pedía:**

- **Número de daño sobre el jugador: PROBADO Y REVERTIDO** (decisión del usuario,
  mismo día). Un número solo para ataques de boss hacía que una fuente de daño
  hablara un idioma que el resto del juego no habla; el jugador tiene que
  aprender UN contrato de "me están haciendo daño", no dos. El feedback vuelve a
  ser el de siempre para todo: flash de vida, temblor y `player-hit`. Lo que SÍ
  se queda es el pinchazo del i-frame, que es lo que hace que el golpe exista.
- **La explosión ya no es un puf**: el marcador **no se apaga** en el frame del
  daño. Se pone blanco, se expande un 6% y se desvanece en 0,18 s mientras una
  **onda viaja** por la cuña — 4 arcos de cubos a radios crecientes, uno cada
  0,055 s, con el frente en blanco caliente. Más anillo de choque en el boss y
  temblor de 0,38 (por debajo del 0,72 de la llegada: esto pasa cada pocos
  segundos y una pantalla que nunca se asienta deja de significar nada).
- **Tres sonidos propios** (`tools/audio/prototype-r35-sweep.mjs`, DSP
  determinista). **Dirección: MAQUINARIA INDUSTRIAL PESADA** (decisión del
  usuario 2026-08-19). La primera versión se hizo como arma de energía —anillo
  de condensador, oleada eléctrica— y se **rechazó entera**. Dos razones que son
  el brief de la actual: la fundición es el escenario, y el arsenal del JUGADOR
  ya es dueño del registro eléctrico (bolt, pulse, welder), así que un boss cuyo
  ataque estrella también es eléctrico compite con las armas en vez de
  imponerse. Es una prensa, no un rayo: aire, acero y masa.
  `boss-sweep-charge` al encenderse (válvula neumática y las placas asentándose,
  metal AMORTIGUADO — es la carga, no el golpe), `boss-sweep-warn` en los
  últimos 0,4 s (trinquete cuyos clics aceleran sobre un siseo de presión que
  sube) y `boss-sweep-fire` en la descarga (impacto de banda ancha, caída de sub
  como una masa cayendo, la placa resonando ABIERTA —lo contrario de la carga,
  para que cargar y disparar no se confundan— y vapor soltándose detrás). Los tres son
  espaciales (`effects.sound(id, priority, x, z)` → regla de distancia).
  El WAV de aviso dura **exactamente `sweep.warnLeadS`**, así que su última
  muestra ES el impacto: regla de latencia cero, cortado contra la constante
  real y no de oído. Verificado en runtime: los tres eventos llegan al director.

**Pendiente tuyo:** el veredicto de los sonidos es siempre in-game. Si alguno no
encaja con "Neon Horizon", se regenera con otra semilla en el mismo script.

### Sonido de la sobrecarga del núcleo — el otro ataque de área (2026-08-19)

`tools/audio/prototype-r36-overload.mjs`, misma familia industrial que el
barrido y deliberadamente **la otra mitad de ella**: el barrido es una prensa
que BAJA y golpea; esto es presión que ESCAPA. Si los dos fueran impactos serían
un solo ataque con dos colores y el jugador no tendría nada que aprender.

- `boss-overload-open` — el núcleo se desbloquea: un pestillo cediendo, metal
  bajo tensión (modos graves de decaimiento lento, distinto de la placa
  GOLPEADA del barrido) y presión subiendo. Suena una vez, EN el boss: mitad de
  origen.
- `boss-overload-erupt` — un eslabón reventando, **a propósito más pequeño que
  el pisotón del barrido**: caen cuatro en dos segundos y la pirámide de volumen
  dice que lo que pasa cuatro veces no puede ser lo más fuerte de la pelea.
  Golpe sordo desde abajo, escoria y grava saltando, y se acaba. Cola corta a
  propósito: una larga fundiría la cadena en un rugido continuo y la SECUENCIA
  —que es lo que el jugador lee para esquivar— dejaría de oírse como pasos.
  Suena en la posición de CADA zona, así que una cadena que se aleja se oye
  alejarse. Cooldown de 0,12 s: impide dos en un frame sin comerse los pasos
  (el intervalo real entre eslabones es 0,45 s).

Verificado en runtime: los dos eventos llegan al director durante la Fase 3.

**HISTÓRICO / SUPERSEDED:** en esta tanda la descarga radial y la llamada de
refuerzos seguían mudas y emitían el placeholder `boss-attack`. El estado vigente
retiró ese id genérico: assembly usa `boss-assembly-open/spawn` y el resto del
finale dispone de sus cues específicas documentadas en la baseline 0.22.0.

### Por qué no se oían: el manifiesto de runtime es un artefacto de build (2026-08-19)

Reporte: "los sonidos del cono naranja no se escuchan". Mi comprobación anterior
decía que los tres eventos "sonaban", y **era un instrumento débil**:
`AudioDirector.lastEvent` se sella en `emit()` **antes** de resolver ruta, buffer,
hueco de voz y estado del contexto. Un evento puede figurar como reproducido y no
producir un solo sample.

Medida la cadena entera (asset → decode → voz), el resultado fue inequívoco:

```
asset boss-sweep-charge: not in manifest
voices boss-sweep-fire: started 0
```

**Causa histórica (SUPERSEDED por el pack canónico 2026-08-25):** `public/assets/audio/prototypes/manifest.json` **lo reescribía
`prebuild`** en cada build (`audio:generate` → `tools/audio/ui-navigation.mjs`)
desde la fuente `tools/audio/prototype-manifest.json`. Las entradas que había
añadido a mano al de runtime sobrevivieron hasta el siguiente `pnpm build` y
desaparecieron sin avisar. Los cinco cues quedaron **habilitados, emitidos y
mudos**: todos los síntomas decían "sonó" menos los altavoces.

**Arreglo de aquel incidente:** registrados en el manifiesto FUENTE. Medido después: los assets
decodifican (0,60 / 0,40 / 1,00 s) y los cinco arrancan voces reales.

**Guardas vigentes:** aquella cobertura pasó a `runtime-pack.json` +
`validate-runtime-pack.mjs`; `tools/audio-selection.test.mjs` conserva la prueba
de cobertura semántica. Esto es lo que habría cazado el fallo en el minuto uno:
todo id de `enabledEvents` debe tener entrada en el manifiesto fuente, y el
generado no puede contener eventos que la fuente no tenga.
Y el chequeo de runtime ahora cuenta VOCES arrancadas, envolviendo
`AudioDirector.play`, en vez de fiarse de `lastEvent`.

**Dato del margen:** de cuatro descargas medidas, una perdió su cue por el tope de
14 voces de SFX (prioridad 4 contra los loops de arma, que van a 5). Con el
enjambre del bot muriendo alrededor es el peor caso; si en juego real se nota que
falta el golpe, la palanca es la prioridad del evento, no el volumen.

### Cuarta tanda de playtest: spawn, balas rojas, y la zona roja más explosiva (2026-08-19)

1. **Sonido de spawn del jugador en los sitios nuevos.** `run-start` —el mismo cue
   que suena al materializarte al empezar una run— se emite ahora también al
   cruzar a un mapa nuevo y al reabrirse la arena del finale. Es literalmente el
   mismo evento (el chasis puesto en el suelo), y oírlo otra vez es lo que dice
   que el suelo que pisás es nuevo.

2. **Voz para la descarga radial** (`tools/audio/prototype-r37-volley.mjs`): las
   dieciséis balas rojas eran el tercer y último ataque mudo. Mismo idioma
   industrial y **otro verbo**, que es la regla que mantiene los tres ataques
   distinguibles: el barrido es una prensa que BAJA, la sobrecarga es presión
   que ESCAPA, y esto es una BATERÍA que dispara — dieciséis tubos neumáticos
   soltando en medio segundo con el bastidor traqueteando debajo. Los tiempos
   van desiguales a propósito: espaciarlos igual convierte la ráfaga en zumbido
   de ametralladora y se pierde la cuenta. Sin cue de carga propia: el boss se
   planta 1,1 s, esa es la telegrafía, y otro riser encima sonaría al barrido.

3. **La erupción, rehecha como explosión.** La primera era un golpe sordo: todo
   cuerpo y ningún frente, así que leía como algo que ATERRIZA, no como algo que
   DETONA. Ahora lleva delante un crack de banda ancha, la caída de sub es más
   corta y más profunda (96→38 en 0,10 s pasó a 118→28 en 0,075 s: una caída más
   empinada es lo que suena a detonación en vez de a bombo), una ráfaga de
   presión que antes no existía, y escombros que sobreviven al golpe. Sigue
   siendo el cue más corto de la pelea, y esa restricción no se ha movido.

4. **La explosión visual de cada zona, subida de nivel.** El marcador ya **no se
   apaga** en el frame del daño: detona — se pone blanco, se expande un 35% y se
   desvanece en 0,16 s. Encima, tres capas en el mismo idioma que el resto de
   detonaciones del juego (cuerpo del estallido 16→30 cubos, núcleo blanco 5→14,
   y un anillo de suelo de 18 cubos a radio 5 que enseña dónde PARÓ) más un
   temblor pequeño de 0,2 — pequeño a propósito: caen cuatro en dos segundos, y
   una sacudida grande cuatro veces seguidas no es cuatro veces más dramática,
   es una cámara que no se asienta nunca.

### Y una corrección: el tope de voces NO era el problema

Al medir esto vi "la mitad de las descargas del barrido descartadas por el tope
de voces" y actué: protegí los loops de ser desalojados y subí la prioridad de
los ataques del boss. **La medición era mía y estaba mal.** `play()` es async, así
que cualquier otro `emit` que caiga durante sus awaits mueve el contador global
de descartes, y leer ese delta como "este cue se descartó" es una carrera. Medido
en limpio: **pico de 4 voces contra un tope de 14 y cero robos** — el tope nunca
se acercó.

Los dos cambios se quedan porque se sostienen solos, no porque los justificara
esa lectura: un one-shot desalojando un LOOP es un fallo latente real (los hums
de arma arrancan por flanco en `weapons.ts`, así que un loop robado no vuelve
hasta que el arma para y rearranca), y un ataque telegrafiado de boss por debajo
de un disparo rutinario de arma es un orden equivocado si algún día el bus se
llena. El instrumento ya no atribuye descartes por evento: cuenta voces
arrancadas y comprueba la salud del bus globalmente.

### Quinta tanda: spawn bajo el telón, drops que muerden, y ataques con cuerpo (2026-08-19)

1. **El cue de spawn suena bajo la imagen, no detrás del negro.** Antes se
   emitía en el swap, que ocurre a negro pleno: la sonido terminaba **1,7 s
   antes** de que el mapa fuera visible. Ahora sale a `MAP_TRANSITION.spawnCueLeadS`
   (0,16 s) del final del fundido, cortado contra la constante real de la
   cortina como manda la regla de latencia cero. Vale para el cruce de sector y
   para la arena del finale.

2. **Las zonas azules muerden y hablan.** Materializarse encima cuesta 12 (el
   marcador estuvo encendido 1,4 s: quedarse ahí es una decisión), y el cobro va
   ANTES del tope de cuerpos — la zona se abrió con independencia de si el campo
   tenía sitio. Sonido nuevo `boss-assembly-spawn`
   (`tools/audio/prototype-r38-assembly.mjs`): **el único cue eléctrico de la
   pelea**, y se lo puede permitir porque no es un ataque sino materia
   apareciendo — chasquido, un brillo digital que **resuelve hacia abajo** hasta
   un golpe sólido (hacia arriba leería como desmaterializarse). Y el reparto
   pasa a **Voltling + Roller**: el primero va recto a por vos, el segundo se
   compromete con un rumbo y atropiesa, así que el drop es algo que hay que
   RODEAR en vez de solo dejar atrás. El reparto progresivo posterior mantiene
   esa base y añade Axle Runner y Slagcaster al crecer el número de áreas; ver
   «Las tres fases» para el contrato vigente.

3. **Vida del boss a 100.000** (con el escalado por nivel: 85.000 llegando a
   nivel 20, 100.000 a nivel 30, y el techo de 150.000 a partir de nivel 48).

4. **El cono sale del CUERPO.** La descarga revienta primero a la altura del
   pecho (5,6 de los 9,87 del modelo) y solo después contesta el suelo. Sin eso
   el ataque leía como que el SUELO hacía algo al lado de un boss que casualmente
   estaba ahí. `VoxelBurst.spawn` acepta ahora una altura opcional; por defecto
   sigue naciendo a ras de suelo, que es lo correcto para un cuerpo que se
   deshace.

5. **La cadena roja se dispara: un misil por zona desde la ESPALDA.** Sale de
   `back = -(sin h, cos h)` (el modelo mira a +Z rotado por su heading), a 6,2 de
   altura, describe una parábola y **aterriza exactamente cuando su zona
   revienta** — el tiempo de vuelo no es un número ajustable, es la telegrafía de
   la propia zona, así que no puede desincronizarse por tuneo. Deja estela de
   cubos en el aire y va en la capa de personaje, para que los marcadores de
   suelo a los que vuela no lo pinten por encima.

Verificado en runtime: 4 misiles en el aire a la vez, 34 muestras por encima del
suelo, y los cinco cues nuevos arrancando voces reales.

### Sexta tanda: la zona azul avisa, y los misiles se ven (2026-08-19)

1. **El cue de la zona azul, mucho más eléctrico.** La primera versión resolvía
   en un golpe mecánico seco: decía "ha aterrizado un bot" —cierto— pero no
   decía nada de que el suelo estuviera vivo. La información que tiene que
   llevar no es "ha llegado algo", es **"no te quedes aquí"**, así que la
   llegada va ahora metida DENTRO de un evento eléctrico: arco duro de
   apertura, un chisporroteo irregular que sigue escupiendo después, y un
   zumbido cargado que queda flotando sobre el punto mientras se apaga. El
   chisporroteo es la capa que hace el trabajo: un tono continuo lee como
   máquina zumbando; escupir irregular lee como algo que no hay que tocar.

2. **Los misiles, rehechos.** Eran una caja roja lisa —a la altura de esta
   cámara, un punto. Ahora son un cuerpo voxel de 8 bloques (192 vértices
   contra los 24 de una caja): cuerpo, morro escalonado en dos bloques (un cono
   voxel), cuatro aletas y un bloque de escape blanco. Material sin iluminar y
   con color por vértice, así el bloom coge los blancos sin tocar el rojo.
   Además ruedan sobre su eje (1,4 Hz — lento, un giro rápido en un cuerpo así
   lee como glitch), y la estela sale de la **COLA**, no del centro: una pluma
   detrás lee como empuje, cubos cayéndose del medio leen como daño. Un cubo de
   cada tres va en blanco caliente para que la pluma parpadee en vez de ser una
   cinta plana. La bocanada de lanzamiento va en dos colores.

3. **Los refuerzos de la zona azul aguantan más:** ×1,4 sobre el multiplicador
   de la oleada viva. Son los del boss y tienen que sobrevivir lo suficiente
   para quitar espacio; un cuerpo que muere a la primera pasada de la build no
   quita ninguno. Modesto a propósito — es la palanca con el camino más corto a
   lo injusto, porque estos caen ENCIMA del jugador.

**Y un tropiezo del instrumento, otra vez el mismo:** el chequeo de misiles dio
FALLO con 0 en el aire en un juego que funcionaba, porque acorté su ventana de
muestreo a 7,2 s contra una cadena que sale cada 8. Ahora la ventana es de 19,5 s
y lo dice en el comentario: **tiene que sobrevivir al cooldown de lo que mide**.

### Séptima tanda: la muerte se ve, el spawn no corta, y el escudo deja de blindar (2026-08-19)

1. **El beat de muerte del Marshal.** El kill abría la pantalla de resultados en
   el MISMO frame, así que la explosión que celebraba duraba 16 ms. Ahora el
   cuerpo se deshace en **5 estallidos escalonados** (uno cada 0,13 s) que
   **bajan por el cuerpo** —la cabeza primero, después el colapso sobre su
   propia huella, que es lo que distingue una máquina de 9,87 unidades de un
   grunt reventando— con temblor decreciente y un anillo de suelo al final. La
   pantalla llega **1,6 s** después (medido en runtime: 1607 ms).
   Dos cosas que el beat no permite: **el nivel no interrumpe** (los level-up
   pendientes se descartan, igual que ya hacía la derrota — si no, la tarjeta
   congela la explosión en el aire), y **un Voltling rezagado no puede convertir
   una run ganada en derrota** (el embudo de daño se cierra durante el hold).

2. **El microcorte al aparecer el boss: era el RIG.** Se construía en el primer
   frame en que el cuerpo existía —tallar ocho piezas del grid y mallarlas no es
   gratis— así que la llegada venía con una parada justo cuando estás mirando.
   Ahora se construye **detrás de la cortina** (`prepareFinalRig()` desde
   `openFinaleArena`), con el fundido entero más los 2,5 s de telegrafía para
   terminar, y si no llega el cuerpo instanciado sigue cubriéndolo.
   Medido con `PerformanceObserver` de longtasks: antes **14 tareas largas, la
   peor de 114 ms**; ahora **cero dentro de los 0,7 s del spawn**. Las que
   quedan (7, peor 111 ms) caen TODAS en estado `map-transition`, o sea detrás
   del negro — que es exactamente donde se quieren.

3. **Barrier Cell: recarga 8 s → 14 s** (suelo 4 → 8, reducción por copia extra
   1 → 1,5). La aritmética detrás de la queja: una carga bloquea un golpe
   ENTERO valga lo que valga, así que el rendimiento real del mod son golpes
   absorbidos por minuto — a 8 s eran **7,5/min**, y el kit telegrafiado del
   Marshal ronda los diez eventos de daño por minuto contra alguien que se
   mueve. El escudo se comía tres cuartas partes de la pelea y el buffer de seis
   cargas hacía gratis el primer medio minuto. A 14 s la absorción sostenida
   baja a **4,3/min**. Sigue siendo el mod defensivo más fuerte del juego.
   **Es un cambio GLOBAL, no un parche del boss:** Barrier Cell es un mod normal
   y el Mapa 1 también lo nota. Deliberado — la aritmética era la misma allí, la
   pelea del boss es solo donde se hizo visible.

**Y tres tropiezos del arnés, todos del mismo tipo:** el chequeo culpaba a la
llegada de tareas largas que eran de otro sitio (ahora se ancla al frame del
`boss-awaken`); daba "los resultados no abren nunca" porque nadie cerraba los
overlays y el juego estaba en pausa; y su "muerte" del boss se quedaba **325 de
vida corta** porque `dealDamage` pasa el número por `rollHit`, que lo escala por
el daño del jugador (×0,95).

### Octava tanda: escudo a 30 s, fases en tercios exactos, y el anillo de drops (2026-08-19)

1. **Barrier Cell: 14 s → 30 s** (suelo 8 → 18, reducción por copia extra
   1,5 → 3, manteniendo la forma de la curva). Absorción sostenida: **2,0
   golpes/min** con cualquier número de copias hasta el tope de capacidad, 3,3
   con las diez. Sigue siendo global, Mapa 1 incluido.

2. **Umbrales de fase en tercios EXACTOS** (2/3 y 1/3). Ya estaban en 0,66 y
   0,33 —a un 0,7% de eso—, así que en juego no cambia nada perceptible; lo que
   cambia es que la intención queda escrita y nadie los "ordena" luego a 0,7/0,35
   moviendo en silencio dónde gira la pelea.

3. **El anillo de drops crece por fase: 2 → 4 → 6 puntos**, y los cuerpos por
   punto BAJAN con ellos (4 → 3 → 3). Total por llamada: **8 / 12 / 18**.

   Seis puntos con los cinco cuerpos de antes habrían sido 30 por llamada cada
   5 s en Fase 3 — **6 cuerpos por segundo** sobre un techo de 320. Los drops
   dejarían de ser un beat para ser la pelea entera, y los ataques telegrafiados
   del boss (lo que costó tres pasadas hacer que importara) volverían a ser
   decorado. Con 3 por punto la presión sigue duplicándose a lo largo del
   combate, pero lo que escala es la **FORMA**, no el volumen: a radio 9, seis
   puntos dejan **9,4 unidades** de hueco entre ellos — pasable para un jugador
   de 1,4 de ancho, pero solo si se compromete pronto. Eso es una decisión;
   treinta cuerpos son un muro.

**Cuarto tropiezo del arnés en la misma sesión:** el chequeo de "no entran
oleadas" tenía la lista de tipos llamados ESCRITA A MANO (solo Voltling) y se
quedó vieja al añadir Rollers, denunciando los refuerzos del propio boss como
fuga del spawner. Ahora aplana y deduplica
`FINAL_BOSS.assembly.typeIndexesByPhase`, así que el arnés sigue el reparto
configurado al entrar Axle Runner o Slagcaster sin volver a quedarse obsoleto.

### Novena tanda: la ráfaga se distingue, la arena se despeja, el boss aprieta (2026-08-19)

1. **Las balas rojas: propias, más grandes, más rojas y más rápidas.** Antes
   reutilizaban la estrella del Tesla Titan. Ahora la ráfaga tiene su propio
   tipo de proyectil (`marshal`): la misma caltrop a **1,7×**, en un rojo más
   duro y saturado (`0xff1024` contra el carmesí rosado del Tesla) y con un
   **núcleo BLANCO**. El núcleo es lo que resuelve tu problema real: el tamaño
   solo no basta, una forma roja más grande cruzando la cuña ámbar sigue siendo
   roja sobre ámbar — el blanco se lee contra cualquier color de este suelo, así
   que el disparo conserva un centro inconfundible vuele sobre lo que vuele.
   Es el mismo truco que el morro del misil. Velocidad **18 → 21** (cierra a
   10 u/s contra el jugador).

   De paso, un fallo latente: el bucle de dibujo ocultaba "el OTRO tipo" de
   proyectil con un par escrito a mano, que dejaba de cubrirlo todo en cuanto
   existiera un tercero — el síntoma habría sido un disparo fantasma
   irrastreable. Ahora itera sobre la lista de tipos.

2. **La arena del finale: hueco de 28 → 40 y la mitad de props** (`propDensity`
   0,45). El Marshal mide 6,5 de ancho y esquiva obstáculos como todo el mundo,
   así que un prop con el que roza es un boss que deja de avanzar por razones
   que el jugador no ve. Un centro limpio con un borde denso tampoco vale:
   embudona la pelea hacia el borde en cuanto cualquiera de los dos se mueve.
   Medido: obstáculo más cercano al centro **40,9**, y quedan **66** en pie —
   la fundición sigue leyéndose como ella misma de 40 hasta el muro en 89.

3. **Velocidad del boss 4,0 → 4,8.** Sigue siendo el 44% de los 11 del jugador:
   no atrapa a quien corre, y no debe — lo que compra es poder cerrar sobre
   alguien que se paró a pelear con los drops.

### Décima tanda: la cadena roja se convierte en tres carriles (2026-08-19)

1. **Cada zona es más grande que la anterior**: 3,2 → 5,2 de radio a lo largo de
   la cadena. El estallido crece según se aleja del boss, y el anillo de suelo de
   cada erupción escala con SU zona (`ringRadiusScale`) — un radio fijo se
   quedaría dentro de las lejanas y fuera de las cercanas, que es peor que no
   tener anillo.

2. **Tres líneas PARALELAS con carriles**, no una sola cadena. Paralelas y no en
   abanico por una razón medida: un abanico radial lo bastante ancho como para
   dejar carril en la PRIMERA zona necesita ~88° de apertura, y a esa separación
   deja de leerse como un ataque con huecos y pasa a ser tres ataques distintos.
   Con separación lateral de 14 y las zonas creciendo, los carriles miden
   **7,6 / 6,3 / 4,9 / 3,6** unidades contra un jugador de 1,4: ancho al salir
   del boss, cerrándose según viaja la onda. Esquivás pronto o te aprietan.
   Las tres líneas de un mismo paso erupcionan A LA VEZ — esa simultaneidad es
   lo que las convierte en un muro con carriles en vez de en ruido.

   Son 12 zonas y **12 misiles en el aire a la vez** (verificado en runtime), con
   una bocanada de lanzamiento por OLEADA en vez de por misil: tres en el mismo
   punto y el mismo frame es la misma imagen al triple de coste.

3. **5-6 enemigos por área en el anillo azul** (`perPoint` 4/5/6): **8 / 20 / 36**
   cuerpos por llamada, 7,2 por segundo en Fase 3. Esto revierte la recomendación
   que hice la vuelta pasada, y así es como debe ser: la hice sobre el papel y el
   playtest la tumbó. El techo de 320 cuerpos vivos sigue siendo lo único que
   impide que se convierta en un muro, y ahora es un test quien lo vigila (una
   llamada no puede pasar de un cuarto del techo).

**Test nuevo con dientes:** los carriles se calculan y se exigen ≥ 2,5 unidades
en CADA paso. Por debajo de eso no es una decisión, es una moneda al aire contra
el resolver de colisiones — y ese número cae solo si alguien toca `lineOffset` o
el crecimiento de las zonas sin mirar al otro.
