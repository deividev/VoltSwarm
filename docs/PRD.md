# Voltswarm — PRD v2 (definitivo)

## Alcance de variantes — fuente de verdad

**Juego completo (`codex/map-2`):** Mapa 1 / Scrapyard → Mapa 2 **Swarm Foundry** → **Hazard Marshal**. El arco y el finale ya son jugables; Hazard Marshal conserva `modelKey: 'final-boss'`. Su integración y combate actuales son provisionales: faltan moveset autorado definitivo, arena y balance. Volt Warden es diseño histórico/futuro, no el boss final vigente.

**Steam Demo (`codex/demo-map1`, separada):** solo Scrapyard / Mapa 1; termina a los 10 minutos como `SECTOR CLEARED`, sin transición a Mapa 2. No describe el flujo ni los metadatos de producto de esta rama de juego completo.

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
4. 🟡 **AHORA:** primera versión jugable del arco completo ya integrada: Mapa 1 → Mapa 2 conservando build → Hazard Marshal provisional. El siguiente trabajo es validar y autorar el contenido final de Mapa 2 y el moveset definitivo del boss; después, 3 personajes diferenciados → balance y retención con datos reales → catálogo de audio → Steamworks/cierre.

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
  - **Mods:** cada mod tiene **UN tier FIJO e intrínseco** (definido en `MOD_REGISTRY`, no se tira). Los 17 mods se reparten así: **5 gris, 4 verde, 3 azul, 4 morado, 1 dorado**. El cofre/tienda tira un tier (luck-weighted) y entrega un mod de ESE tier; nunca cambia el tier de un mod concreto. Barrier Cell es azul: sus copias 1–6 suman una carga hasta 6; las 7–10 bajan la recarga de 8 a 4 s. Al llegar a 10 copias deja de entrar en cofre/tienda. Overload Trigger y Orb Siphon son morados/Epic. Overload conserva x2 attack speed durante 5 s y cada copia adicional añade 2 s. Orb Siphon solo puede ser premio de cofre una vez por run; después se excluye de candidatos de cofres, sin cambiar su efecto ni el comportamiento existente del chatarrero.
  - **Armas / Habilidades (cambio de playtest 2026-07-17):** progresan por **NIVEL (Lv1-20)**, pero cada mejora de un arma YA instalada tira tier. El tier escala la magnitud de ESE incremento siguiendo el patrón de referencia de Megabonk: gris/Common ×1 · verde/Uncommon ×1.2 · azul/Rare ×1.4 · morado/Epic ×1.6 · dorado/Legendary ×2. La carta muestra el valor real resultante (p. ej. Tire Fire: +10/+12/+14/+16/+20% damage). Desbloquear un arma sigue siendo azul/base y los milestones discretos de cantidad en Lv3/Lv5 siguen otorgando +1 unidad solo a Bolt Cannon, Orbital Blades, Tire Fire, Turbine Fan y Junk Ricochet; la rareza escala sus mejoras continuas, no proyectiles fraccionarios.
  - Precios de cofre/tienda por tier (escalan con el minuto de run): gris 25 / verde 45 / azul 80 / morado 140 / dorado 240 (`MERCHANT.tierPrices`).
- **Contrato visual de cofres (playtest 2026-08-09):** cada cofre activo que esté dentro de la pantalla muestra permanentemente un marcador compacto con SOLO el icono de chatarra y su precio vigente. Verde indica que se puede pagar y rojo que falta chatarra; no muestra tier, texto de estado, panel, fondo, borde ni información adicional. El marcador se proyecta desde el mundo sin depender de la distancia ni aplicar escalado manual; UI Scale lo amplía mediante el zoom global de Electron. Los cofres fuera de pantalla no generan flechas. Este marcador es informativo: solo `nearestOpenable()` y `CHEST.interactRadius` habilitan la interacción, y la fórmula económica permanece `round(tierPrice × CHEST.priceMult)`.
- Cofres: recompensas de stats generales estilo Megabonk — +Luck, +Area, +Dificultad (con +XP a cambio) — además de reparar/cache/frenzy/haste existentes.
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
- Total armas: 6 (Bolt, Pulse, Blades, Welder, Press, Tire).

### 11. Draft de arma inicial y tope de armas
- Al empezar run: 3 opciones aleatorias de las 6 armas; la elegida es tu arma inicial (reemplaza al Bolt fijo).
- **Tope de 2 armas por build.** Mientras tengas 1, cada level-up garantiza una carta de desbloqueo entre las 3 opciones; al llegar a 2, desaparecen los desbloqueos y solo salen mejoras (stats + niveles de tus armas).
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
- **Primera versión jugable del arco (2026-08-09, PROVISIONAL):** Mapa 1 durante 10 minutos + boss obligatorio → transición conservando armas, cores, mods, niveles, potencia acumulada, oro, HP actual, descartes y contadores de run → Mapa 2 durante 10 minutos → Hazard Marshal → `RUN COMPLETE` únicamente al derrotarlo. Se limpian solo actores y efectos locales del mapa; el jugador reaparece en el centro seguro.
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

- **Vista fuera del juego**: al abrir la app, el menú es una vista DOM opaca con fondo key-art; el 3D NO se renderiza detrás (`game.ts` salta el render en estado `menu`). Botones: Play / Characters / Unlocks / Settings / Exit. Play → selección de personaje → draft de arma inicial → carga → run. La esquina inferior derecha muestra `MAJOR.MINOR.PATCH Label` (por ejemplo, `0.10.2 Beta`); `vite.config.ts` deriva esa presentación desde el SemVer crudo de `package.json`, evitando duplicar o reordenar la versión manualmente.
- **Pantalla de carga con warmup** (estado `loading`): al elegir arma, se muestra una pantalla de carga que monta el mundo y renderiza unos frames ocultos antes de revelar el juego, para que no se vea el bajón de rendimiento del arranque. Es el hook donde entra una animación de carga más elaborada.
- **Panel de desbloqueos (dev/temporal) — SUPERSEDED 2026-07-25**: 3 columnas Armas / Orbes / Mods; desbloquear un ítem lo empujaba a `ACCOUNT` (hoy `PROFILE`) en vivo para playtestear con todo abierto. **Lo reemplazaron los Contratos**; el panel sobrevive solo como herramienta de desarrollo detrás de `DEV_TOOLS.unlockPanel` y ya no llega a builds de release. Su persistencia era solo de sesión; la real vive ahora en `src/profile.ts`.
- Criterio de aceptación: el menú no arrastra FPS (3D apagado), el warmup elimina el hitch visible al dar Play, y el panel refleja el estado real de los pools (armas/cores leen `PROFILE` vivo; mods vía `refreshUnlockedMods()`).

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
- **Estado actual**: los modelos del enjambre están cableados y validados visualmente con densidad alta. **Hazard Marshal** ocupa el slot `final-boss` y ya entra en juego provisionalmente mediante `EnemySystem`; el pod **Volt Warden** reconstruido conserva sus hojas como diseño disponible para un enemigo futuro.
- **Herramientas**: `tools/capture-model-preview.mjs <clave>` (viewer con luz del juego) y `tools/capture-ingame.mjs [segundos]` (arranca el juego headless, juega y captura).
- **Criterio de aceptación por modelo**: silueta distinguible a distancia de cámara, paleta exacta, triángulos por instancia en presupuesto (enemigos ~3-6k), y validación final con 400+ enemigos activos.
- **Pase de fidelidad 2026-07-13 (gate de captura)**: los 6 enemigos + jugador migrados de extrusión front-only al pipeline de hojas MEDIDAS de los bosses (`sideProfileRef` + `backPaintRef` — la cámara a 52° ve espaldas/techos y ahora están pintados de verdad); Sparkrunner rediseñado a v5 con brazos (aprobado); excepción Drone (solo espalda pintada — el perfil medido del rotor tapaba el techo); **greedy meshing en Y** en `voxel-builder.ts` (-27% a -66% de triángulos, visual idéntico). Rim light probado y rechazado por el usuario (revertido).
- Detalle del método y reglas: `DIRECCION_ARTE.md` (pipeline + extensión a VFX/audio) y `PROMPTS_IMAGENES.md` §6 (prompt maestro).

## v3 — Expansión de contenido (implementada 2026-07-03, del plan de COMPARATIVA_MEGABONK.md)

- **Sistema de estados alterados**: slow (factor + duración), daño en el tiempo (ticks de 0.5 s por el embudo normal de daño) y knockback con decaimiento. Bosses inmunes al knockback. API en `EnemySystem.applySlow/applyDot/applyKnockback`.
- **Capas defensivas**: Evasion (esquiva con retornos decrecientes, muestra "MISS"), Shield (absorbe antes que la vida; solo existe si la build tiene Barrier Cell y se representa como placas cian orbitando al jugador — `Player.setShieldCharges`, NO una barra en el HUD; cada carga bloquea un golpe completo. `MODS.barrierCell` define 1–6 cargas y copias 7–10 de recarga 8→4 s), Thorns (refleja al contacto), Lifesteal (% de robar 1 HP por golpe). Embudo único de daño al jugador en `Game.damagePlayer`.
- **Cartas nuevas**: Ghost Plating, Rusty Spikes, Leech Coil, Capacitor Bank (Duration: alarga buffs y estados) y Chaos Module (stat aleatorio a la rareza de la carta). Barrier Cell pertenece al pool unificado de Mods, no a cartas.
- **5 armas nuevas (draft de 11)**: Oil Sprayer (charcos que ralentizan, 0 daño — control puro), Acid Drum (zonas corrosivas con DoT; renombrada de "Acid Flask" el 2026-07-05 para encajar con la estética industrial/futurista), Turbine Fan (tornados con knockback), Junk Ricochet (rebota entre enemigos), Dismantler (garra que EJECUTA no-bosses bajo 15% de vida — primera arma "twist").
- Verificado headless: estados, defensas, cartas y las 5 armas ejercitadas; 120 FPS con zonas activas y enjambre.
- Pendiente del plan: moneda/economía (post-validación, sin cambios).

## Settings v3 + Controles remapeables + Gamepad — Implementado 2026-07-13 (validado por el usuario)

- **Pantalla de Settings** (`#settings-overlay`, vista `menu-view` a pantalla completa — key-art de fondo, el 3D no renderiza detrás): título arriba, **sidebar de secciones anclado al borde izquierdo** (General / Controls) y contenido ancho centrado, ambos en placas del lenguaje del juego (marco oscuro casi opaco + muescas pixel — regla: sobre key-art, los paneles van a `rgba(12,16,22,0.96)` para que el arte nunca sangre bajo el texto, aplicada globalmente vía `.menu-view .overlay-panel`). **Auto-apply**: no existe botón Apply — selects y bindings se aplican al confirmar; los sliders Master/Music/SFX actualizan, persisten y se oyen en tiempo real mientras se arrastran. Music Volume controla tanto la pista del menú como la de la run; sin toast (sería ruido). Back siempre abajo-izquierda en ambas pestañas; Reset to Defaults solo en Controls, a la derecha.
- **Acciones remapeables** (`ActionId` en `src/settings.ts`): moveUp/Down/Left/Right + **interact** (unificó los 3 `'KeyE'` que vivían en config — cofre/chatarrero/invocación de boss — en UNA acción; el prompt flotante muestra la tecla/botón REAL del binding y cambia según el dispositivo en mano). Escape y Start del mando = pausa, reservados. Los bindings viajan dentro del blob de settings persistido (`normalizeBindings` = migración por campo, saves viejos caen a defaults). **Captura agnóstica de dispositivo**: "PRESS KEY / BUTTON…" — lo próximo pulsado (tecla o botón) se asigna a su dispositivo; una captura por-dispositivo se tragaba pulsaciones del otro. La pestaña muestra el dispositivo activo (mando conectado → botones de pad; si no → teclado), con notificación de esquina "Gamepad detected/disconnected" (en `document.body` fixed — la capa `#hud` se oculta bajo vistas de menú).
- **Gamepad completo** (`src/input.ts`, `PlayerInput` por acciones con polling por frame): stick izquierdo analógico + d-pad para moverse, botón de interact remapeable, **traductor DirectInput** para mandos no-estándar (DualShock: Cruz/Círculo/Cuadrado reordenados al layout estándar + d-pad decodificado del hat en `axes[9]`; los mandos estándar no pasan por él). **Navegación de menús**: foco visible (`.pad-focus`) sobre botones/cartas/selects/sliders del overlay activo — vertical mueve foco, **horizontal AJUSTA el control enfocado** (cicla selects con wrap, sliders ±5, disparando `change` → auto-apply), aceptar = SOLO el binding de interact del jugador (sin A fijo — una tecla de acción en todo el juego, regla del usuario), B = back/resume/leave/continue contextual. El `<select>` nativo no puede abrirse programáticamente → aceptar sobre él cicla; al mover el foco se hace `blur()` del control nativo (un select con foco DOM comía flechas del teclado en silencio). En el cofre el foco aterriza en Continue (la card de la ruleta es escaparate, excluida de la navegación).
- **Fixes de plataforma**: el modo ventana/resolución solo se re-aplica cuando ELLOS cambian (re-aplicarlo en cada save parpadeaba la pantalla con cada tick de slider) · **precarga de TODO el arte de UI gated en la pantalla de carga** (`hud.preloadUiAssets()`, idempotente; `tickLoading` no revela hasta warmup 3D + decode de iconos de armas/stats/cartas/mods/retratos/glifos + cáscaras de orbe) — mató el tirón del primer level-up/cofre/tienda · animación de entrada compartida de los paneles de mitad de run (pop 0.32s; los keyframes DEBEN transportar el `translateX(-50%)` de centrado del panel o lo teletransportan).
- **Empaquetado Electron**: `pnpm package` genera instalador NSIS (`-setup.exe`, asistente + desinstalador) Y portable (`-portable.exe`, un archivo para testers) en `release/`; sin firma → SmartScreen "Unknown Publisher" (certificado en Fase 6). **Regla de rutas de assets (mordió 3 veces el mismo día)**: en strings de JS/markup SIEMPRE relativas (`'assets/...'` — `file://` rompe las absolutas y Vite no puede reescribir strings); en CSS `url()` SIEMPRE absolutas (`'/assets/...'` — Vite las reescribe al compilar; las relativas resuelven contra `src/ui.css`). Gamepad API = Chromium nativo, cero cambios en el main process de Electron.
- Límite conocido v1: las etiquetas de tecla muestran el código físico (layouts no-QWERTY ven la posición) y los botones usan nomenclatura Xbox (A/B/X/Y) también en mandos PlayStation.

## Fuera de alcance actual
- Multiplayer/co-op: no implementado ni anunciado; solo existe el gate interno de viabilidad de `docs/MULTIPLAYER_FEASIBILITY.md`. Local/Remote Play persistiría solo en el save host/local; la progresión por cuenta de invitados no está prometida. Native online solo podría persistir cuentas propias tras validación host-authoritative.
- Dedicated servers: fuera de alcance.
- Meta-progresión entre runs, moneda, mapas múltiples y evolución de armas: post-validación. **Field Engineer** is the playable starting character, and its runtime model v1 is definitively approved in-game. The other two launch characters remain out of scope with no committed designs (`DISENO_PERSONAJES.md`).

### Personajes — Field Engineer

#### Contrato reutilizable de UI para personajes jugables — implementado

Antes de integrar un personaje nuevo, verificar TODO este checklist:

- [ ] **Definición y arte:** `CharacterDef` aporta un `modelKey` validado y una ruta empaquetada a su referencia/retrato ortográfico frontal aprobado. La tarjeta reutiliza esa frontal 2D para identificación rápida; si tiene transparencia, se presenta sobre el fondo compartido `#444e5e` con borde `#2b3340`.
- [ ] **Tarjeta izquierda:** siempre muestra retrato, nombre y estado. La selección usa cian. Desbloqueado muestra `Unlocked`; bloqueado muestra texto visible exacto `Locked` junto a `assets/2d/icon-ui-lock-v2.png` (decorativo porque el texto comunica el estado). Nunca usar emoji ni crear otro candado.
- [ ] **Detalle derecho:** encabezado de arquetipo; una fila y un icono existente distinto por stat veraz; nunca combinar stats no relacionados ni usar Shield para Armor. Valores, magnitudes y unidades salen de config/`CharacterDef`.
- [ ] **Módulos obligatorios:** firma/regla con magnitud exacta derivada de config, **Recommended Weapon** como recomendación de presentación que no cambia pool ni odds, tradeoff explícito y requisito/progreso de Contract cuando esté bloqueado.
- [ ] **Un solo flujo:** Characters y la selección pre-run comparten renderer. Se preservan `data-character-*`, scroll responsive independiente, teclado/gamepad y el bloqueo de Confirm para personajes cerrados.
- [ ] **Estrategia de render:** la UI actual es 2D y no monta visor 3D, canvas, observers, RAF ni otro contexto WebGL. `src/models/character-preview.ts` permanece dormido y reservado para un caso futuro explícito.
- [ ] **Pipeline:** todo personaje nuevo conserva frontal/lateral/trasera planas. La frontal solo puede servir como retrato tras validación/aprobación y registro en una ruta empaquetada.

#### Implementación actual: Field Engineer

- `src/characters.ts` define un registry data-driven con ID estable, copy derivada de `CHARACTER_BALANCE`, `modelKey`, perfil base, signature, arma recomendada y metadata de unlock.
- Flujo de nueva run: **Play → Character Selection → Starting Weapon Draft → Loading → Run**. La selección es una `menu-view`, no un `GameState` nuevo; exige Confirm y soporta teclado/gamepad.
- Field Engineer (`field-engineer`) está desbloqueado por defecto: 110 HP, Armor rating 5%, Damage ×0.95, Move Speed 11, Attack Speed ×1, crítico 5%/+50%, Luck/Regen 0 y los sockets globales sin cambios propios (2 armas/2 cores iniciales, 3 armas/4 cores máximos).
- **Field Repair** cura 1% del HP máximo después de instalar o subir tier de cualquier Core excepto Hull Plates durante gameplay. Hull Plates nunca modifica el HP actual. Field Repair clampea a máximo y no se ejecuta en load, replay, Boss Lab o reconstrucción.
- Bolt Cannon no se garantiza ni cambia las odds: si entra naturalmente en el draft, solo muestra `Recommended`.
- `PROFILE.unlockedCharacters` persiste IDs y Contracts admite rewards `character`; todavía no existen contratos ni umbrales de personajes.
- El menú **Characters** y la selección previa al arma usan el mismo roster. Para identificación rápida, la tarjeta izquierda reutiliza intencionalmente la referencia ortográfica frontal aprobada del modelo (`ref-field-engineer-front-v1.png`, fondo transparente); no genera un retrato alternativo ni muestra concept art. El detalle reutiliza el lenguaje del stat-sheet/RIG: cada stat tiene fila e icono propios (Crit Chance, Crit Damage, Luck y Regen nunca se combinan), Field Repair es el módulo firma con su regla config-backed de 1%, Bolt Cannon aparece solo como **Recommended Weapon** y el tradeoff declara `-5% Damage`. El estado `Unlocked` vive solo bajo el retrato y no se duplica en el detalle; un personaje bloqueado sí añade allí el requisito de Contract con candado y barra segmentada. Roster y detalle desplazan por separado, y bajo 760 px la grilla de stats pasa a una columna. La identificación es inmediata y no crea canvas, observers, RAF ni contexto WebGL. La infraestructura reutilizable de preview 3D permanece en `src/models/character-preview.ts` para un caso futuro específico, pero está dormida y no es visible para el jugador. La estructura de requirement/progreso sigue derivada de Contracts para futuros bloqueados, sin duplicar thresholds ni alterar los atributos `data-character-*` de automatización.
- Boss Lab conserva el `characterId` registrado y reconstruye primero ese baseline antes de reproducir Cores; la reproducción no atraviesa el trigger de gameplay de Field Repair.
- The runtime model v1 uses a measured pack-free side profile plus dedicated procedural rear volume; `backPaintRef` only paints the existing shell. It is definitively approved in-game after the 0°/90°/180°/270° preview, rear-view locomotion check, and 400+ gate (431–440 enemies, 118.87 average FPS, 92.41 minimum bucket, 8.5 ms p99, 0 page errors, and 431/431 enemies moving). Its source sheets remain conversion and provenance inputs, not pending shipped-art approval.

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

`Game` owns observer-style renderer audio; `Hud` does not. `AudioDirector` lazily creates/resumes Web Audio only from a gesture and silently no-ops without context/assets. Runtime selects cached pre-rendered assets only; offline deterministic SFX generation lives in `tools/audio/`. The validation pack covers representative semantic events and diagnostics, not the final audio catalog/music.

### Packaged audio swarm evidence (2026-07-17)

Successful local packaged Electron run via `pnpm benchmark:audio`: deterministic `audio-swarm-416` (seed 4979220; digest `4979220:240-112-48:0.25:4`), 404 peak / 411 minimum / 411 end active enemies, including normal-HP sacrificial enemies. At 800x600 after 3 s warmup + 10 s rAF sample on Windows 10 / AMD Ryzen 7 3700X / NVIDIA GeForce RTX 2060 (D3D11): 120.10 mean FPS, 119 minimum complete 1 s bucket FPS and 8.5 ms frame-time p99. Actual paths: 9 kills, 7 XP pickups, 14 Gold pickups; audio 47 attempts / 27 accepted, 15 peak voices, 20 cooldown drops, 0 steals/load failures/leaks and 0 active audio voices after cleanup. Evidence: `tmp/perf-audio-output/report.json`. This validates this machine and scenario only, not Steam minimum hardware.


## Perfil persistente y Contratos — Implementado 2026-07-25 (v0.5.6)

La release activa de Steam Playtest Wave 1 en `main` es `0.10.5-beta`: admite exclusivamente esa build empaquetada y reutiliza la epoch `wave-1-rc-2026-08`. La rama de desarrollo `codex/map-2` usa `0.12.6` con el master desactivado y `resetEpoch: null`, así que ni procesa un marcador pendiente ni vuelve a resetear grabaciones. El consentimiento de telemetría nunca autoriza un borrado, que exige confirmación propia. El marcador `userData/playtest-reset.json` sigue siendo transaccional y settings/consentimiento/identidad/cola quedan fuera del reset.

Reemplaza al panel dev de Unlocks como motor de progresión. **No hay moneda meta**: los contratos son el único motor (decisión cerrada).

### Perfil (`src/profile.ts`)

`PROFILE` (antes `ACCOUNT`, renombrado porque `upgrades.ts` ya exporta una clase `Progression` para la progresión DENTRO de la run) guarda desbloqueos y sockets. Se persiste en `userData/profile.json` por IPC de Electron, con `localStorage` como fallback de navegador, espejando la costura de `settings.ts`.

Reglas que no se rompen:

- **`PROFILE` se muta EN SU SITIO, nunca se reemplaza.** Todo consumidor de gating (pool del draft, draft inicial, sockets, pool de mods) tiene una referencia viva; reemplazar el objeto los desconecta a todos en silencio. `loadProfile()` corre en `main.ts` ANTES de construir `Game`.
- **Los techos de diseño (`maxWeaponSockets`/`maxCoreSockets`) NO se persisten**: son constantes de balance, así que subirlos alcanza a saves existentes.
- **Estado implementado para el playtest:** el perfil empieza con **2 sockets de arma** y tiene un techo de **3**. **Boss Hunter** abre el tercero al derrotar cada tipo de boss que puede aparecer en el Mapa 1; los saves antiguos se elevan al nuevo mínimo y, si ya habían completado el contrato, conservan el premio migrando directamente a 3.
- **Dirección futura, todavía no implementada:** se podrá llegar a **4 sockets de arma** solo después de ampliar suficientemente el roster de armas seleccionables para que equipar cuatro no elimine decisiones significativas de build. Antes de esa expansión deben rediseñarse los requisitos y contratos tanto del socket 3 como del futuro socket 4; el requisito actual de todos los bosses del Mapa 1 para Boss Hunter sirve únicamente para este playtest y no constituye el diseño final.
- Las listas de desbloqueo se **mergean sobre los defaults** y se filtran contra los registries reales: promover un ítem a desbloqueado-por-defecto llega a jugadores existentes, y un save editado a mano no puede inyectar un id fantasma.

`LIFETIME` es el ledger monótono de carrera (runs, runs completas, sectores limpiados, máximo de mapas alcanzados, kills, mejores marcas, bosses y tipos de boss, daño por arma, runs por arma inicial, oro, cofres por tier, compras, hazañas de estilo). Vive aparte del historial **porque el historial se corta en 250 runs** y un contrato de "10.000 kills acumuladas" perdería terreno al envejecer las runs. Es idempotente por id de run, así que rellenar retroactivamente nunca infla totales.

### Historial de runs (`src/run-history.ts`)

Los registros pasan a `userData/run-history.json` (antes solo `localStorage`, dentro del LevelDB de Chromium, ilegible para herramientas). `migrateRunHistory()` corre al arrancar, no de forma perezosa: migrar dentro de `loadRunHistory()` solo se disparaba al TERMINAR una run. **Aviso: `localStorage` es por ORIGEN** — lo escrito por un build empaquetado vive bajo `file://` y una sesión de dev server ve otro almacén.

Campos añadidos por ser irrecuperables después: `startingWeapon`, `difficulty` (estampada `'standard'` aunque no exista selector aún — un leaderboard que mezcla dificultades no ordena nada), `characterId` (reservado), `bossTypesDefeated`, `damageTaken`, `goldEarned`, `chestsByTier`, `shopPurchases`, `sectorsCleared`, `mapsReached` y `submittedTo` (Steam es dueño del ranking; esto solo evita enviar dos veces). La completitud es **estructural** (`run-complete` o todos los sectores), nunca `durationS >= N`: una derrota larga en el Mapa 2 no es una run completa. Los registros antiguos conservan compatibilidad sin inventar progreso a partir del reloj. **No se guarda semilla de run**: exigiría sembrar el RNG de gameplay primero, que es el refactor de determinismo diferido.

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

Decisiones que sostienen el diseño:

- Lo otorgado se guarda como **IDS**, nunca como posición en la cola: reordenar la cola no puede duplicar ni saltear.
- **Lo otorgado nunca se revoca**, así que subir un umbral no le quita nada a quien ya lo tenía.
- Las escaleras llevan **más peldaños que ítems** a propósito. Un peldaño sin premio disponible **ni se liquida ni se ofrece**; reaparece cuando la cola crece.
- `progressOf()` devuelve actual y objetivo, sirviendo a la vez para "¿está hecho?" y la barra de progreso, que así no pueden discrepar.
- Se evalúa **una vez por run terminada** contra el ledger, y también al arrancar, así un contrato publicado después se completa retroactivamente sin dejar una ventana donde la pantalla diga COMPLETE sin haber pagado.
- Los contratos cuyo contenido no existe (personajes) quedan **latentes**: definidos, nunca evaluados, nunca mostrados.

Umbrales en `config.ts` `CONTRACTS`, marcados como **placeholders**: están anclados a una sola run registrada y necesitan decenas de runs humanas del balance actual antes de significar algo.

### UI

Pantalla de Contratos desde el menú (una columna por categoría: Weapons/Cores/Mods/Sockets/Perks), ordenada por cercanía a completarse, con el arte del premio en cada fila y barras de celdas segmentadas. Los sockets usan un diagrama de pips en vez de icono, porque ninguna imagen comunica "capacidad". Reveal al terminar la run entre las stats y el desglose de daño, solo si se ganó algo, con tope de 5 filas.

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

## Mapa 2 + boss final — primera versión jugable PROVISIONAL (2026-08-02, v0.10.6-beta)

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

### Pendiente

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
