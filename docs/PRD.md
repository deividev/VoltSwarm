# Voltswarm — PRD v2 (definitivo)

## Alcance por variante — fuente de verdad

**Steam Demo (`codex/demo-map1`):** Scrapyard / Mapa 1 únicamente. `package.json` permite solo `['scrapyard']`; una run termina a los 10 minutos como `SECTOR CLEARED`, sin transición a Mapa 2. Todo el contenido del arco completo queda explícitamente fuera de esta build.

**Juego completo (`codex/map-2`):** Mapa 1 → Mapa 2 **Swarm Foundry** → **Hazard Marshal**. El arco y el finale ya son jugables; Hazard Marshal aparece mediante `modelKey: 'final-boss'`. Su configuración de combate y moveset actuales son provisionales; faltan mecánicas autoradas definitivas, arena y balance. Volt Warden es diseño histórico/futuro, no el boss final vigente.

La demo mantiene flavor `demo`, identidad runtime (`appId: 'com.davidseco.voltswarm.demo'`, `productName: 'Voltswarm Demo'`), `userDataDirectory: 'Voltswarm Demo'` y CTA al juego completo en Steam App ID `4979220` / `https://store.steampowered.com/app/4979220/Voltswarm/`. `build` es solo configuración de electron-builder y debe coincidir con esa identidad; Electron no depende de ella porque electron-builder no la preserva en `app.asar`.

Criterios de aceptación:

- Identidad Electron y de artefactos explícita de demo; saves separados del juego completo y del playtest.
- La versión visible se deriva de `package.json`; ningún mapa distinto de Scrapyard es admisible.
- Telemetría, consentimiento, reset de playtest, identidad, cola, red y feedback sin efectos laterales en flavor `demo`; el código reutilizable permanece.
- **Wishlist Full Game** en menú principal y pantalla final, operable con teclado/gamepad. Electron abre únicamente la URL HTTPS canónica, sin aceptar URL del renderer; el CTA se oculta o falla de forma segura si el destino no está disponible.
- Los dos comandos de empaquetado ejecutan el guard de release, que valida flavor, versión, allowlist, telemetría, identidad, `userData`, Steam y flags dev existentes.

El balance no cambia en este corte. Los cambios futuros se validan primero en `main` y se propagan de forma explícita `main -> demo-map1` y `main -> map-2`; las ramas derivadas no son autoridades de balance.

Fecha: 2026-07-02. Extiende el spec base (`CLAUDE_megabonk_3d.md`) con las decisiones del playtest del usuario y el estudio de la base de Megabonk. Método: `docs/METODO_DISENO.md`. Arte: `docs/DIRECCION_ARTE.md`. Diseño de mejoras: `docs/DESIGN_MEJORAS.md`.

## Estado de la arquitectura (actualizado 2026-08-04, v0.12.2-demo)

1. ✅ **Foundation de audio** — implementada 2026-07-17, ver §"Audio Foundation" al final. No incluye el catálogo completo.
2. ✅ **Perfil persistente + Contratos** — implementados 2026-07-25, ver §"Perfil persistente y Contratos". Es el motor de retención y sustituye al panel dev de Unlocks.
3. ⏸️ **Preparación/viabilidad multijugador — DIFERIDA A POST-LANZAMIENTO (decisión del usuario 2026-07-25).** Consumía ~8 de las ~14 semanas restantes hasta el objetivo interno, para una feature que `MULTIPLAYER_FEASIBILITY.md` documenta como no diferenciadora, no prometida y que puede terminar NO-GO — mientras el contenido que decide si el juego vale su precio quedaba comprimido. Del gate se rescató solo la mitad barata: cobertura de smoke tests. **El determinismo de tick fijo, el RNG sembrado y los snapshots siguen sin implementar**, y por eso tampoco se guarda semilla en los registros de run. Si el gate se retoma y da GO, el primer objetivo sigue siendo exactamente 2 jugadores local split-screen; online peer-host exige aprobación posterior; hybrid y dedicated servers quedan fuera de alcance.
4. **Juego completo, fuera de esta demo:** arco Mapa 1 → Mapa 2 Swarm Foundry → Hazard Marshal provisional → personajes diferenciados → balance y retención con datos reales → catálogo de audio → Steamworks/cierre.

## P1 — Estructural

### 1. Orbes de XP con rango de recogida
- Los enemigos ya no dan XP directa: sueltan un orbe donde mueren.
- El jugador recoge orbes acercándose a su `pickupRange` (stat de la ficha); el orbe vuela hacia él acelerando.
- Orbes cercanos entre sí se fusionan (suman valor) para controlar densidad y rendimiento.
- Render: 1 InstancedMesh, pool con cap.
- Criterio de aceptación: matar lejos y no acercarse = no XP. Recoger dispara level-up.

### 2. Ficha de stats RPG + pool de mejoras con rareza
- Ficha del personaje: Damage, Attack Speed, Crit Chance, Crit Damage, Move Speed, Attack Range, Pickup Range, Projectile Count, Projectile Speed, Area (tamaño de disparos/efectos), Armor (rating porcentual con retornos decrecientes), Regen y Luck (rating porcentual que desplaza pesos de rareza).
- **Semántica de Armor y Luck (2026-08-03):** ambos se almacenan como fracciones y se muestran como porcentaje (`0.08` = `8%`). Armor NO es reducción directa punto por punto: la reducción efectiva es `armor / (armor + 1)`. Luck NO es una probabilidad directa de tier: desplaza los pesos azul/morado/dorado y luego se normaliza el pool completo. La migración desde puntos conserva exactamente las curvas anteriores; cambia la unidad visible, no el balance.
- Level-up: al cruzar el umbral de XP, primero se muestra un beat visual `LEVEL UP!` encima del jugador (`VISUAL.levelUpIntro`) y después se abre la UI con 3 cartas aleatorias entre mejoras de stat y cartas de arma (desbloquear/subir nivel de arma).
- **Tiers (rareza) — DEFINICIÓN CANÓNICA. 5 tiers: gris → verde → azul → morado → dorado** (`Rarity` en `upgrades.ts`; pesos de tirada en `TIERS.weights`/`luckShift`, Luck sube los tiers altos). ⚠️ Cada categoría usa los tiers DISTINTO — esto es lo que hay que respetar para que no haya desalineamientos:
  - **Calibración base (playtest 2026-07-17):** con `Luck = 0`, pesos por carta 62/27/9/1.8/0.2%. En una pantalla de 3 cartas esto deja 5.88% de ver al menos una morada/dorada y 0.60% de ver una dorada. Los tiers altos iniciales son jackpots; Lucky Gear debe volverlos progresivamente fiables.
  - **Orbes (Cores):** el tier se **TIRA** en cada carta del draft (luck-weighted). El tier fija la **magnitud** del stat: cada core define un array de 5 valores `[gris, verde, azul, morado, dorado]`. Un mismo core puede salir en CUALQUIERA de los 5 tiers.
  - **Compatibilidad del draft (2026-07-17):** un core dependiente de arma solo entra si al menos un arma o mod instalado consume realmente ese stat. La matriz explícita cubre Range, Projectile Speed, Area, Duration y Projectile Count; los stats universales permanecen siempre disponibles. Así una elección de socket permanente nunca es una carta sin efecto para la build actual.
  - Chaos Module usa la misma matriz y la misma regla de valor marginal que el draft directo: no puede elegir un stat incompatible ni Crit Chance o Lifesteal cuando ya alcanzaron su cap efectivo. Crit Chance y Lifesteal se limitan además a 100%; Crit Damage y los stats sin techo siguen sin cap artificial.
  - **Mods:** cada mod tiene **UN tier FIJO e intrínseco** (definido en `MOD_REGISTRY`, no se tira). Los 17 mods se reparten así: **5 gris, 5 verde, 4 azul, 2 morado, 1 dorado**. El cofre/tienda tira un tier (luck-weighted) y entrega un mod de ESE tier; nunca cambia el tier de un mod concreto. Barrier Cell es azul: sus copias 1–6 suman una carga hasta 6; las 7–10 bajan la recarga de 8 a 4 s. Al llegar a 10 copias deja de entrar en cofre/tienda.
  - **Armas / Habilidades (cambio de playtest 2026-07-17):** progresan por **NIVEL (Lv1-20)**, pero cada mejora de un arma YA instalada tira tier. El tier escala la magnitud de ESE incremento siguiendo el patrón de referencia de Megabonk: gris/Common ×1 · verde/Uncommon ×1.2 · azul/Rare ×1.4 · morado/Epic ×1.6 · dorado/Legendary ×2. La carta muestra el valor real resultante (p. ej. Tire Fire: +10/+12/+14/+16/+20% damage). Desbloquear un arma sigue siendo azul/base y los milestones discretos de cantidad en Lv3/Lv5 siguen otorgando +1 unidad solo a Bolt Cannon, Orbital Blades, Tire Fire, Turbine Fan y Junk Ricochet; la rareza escala sus mejoras continuas, no proyectiles fraccionarios.
  - Precios de cofre/tienda por tier (escalan con el minuto de run): gris 25 / verde 45 / azul 80 / morado 140 / dorado 240 (`MERCHANT.tierPrices`).
- Cofres: recompensas de stats generales estilo Megabonk — +Luck, +Area, +Dificultad (con +XP a cambio) — además de reparar/cache/frenzy/haste existentes.
- Los cofres pagados excluyen Repair Kit cuando el jugador ya está a vida completa. Si el propio cofre entrega la primera copia de Orb Siphon, ese mismo cofre ya activa la aspiración global. Barrier Cell es un Mod azul unificado de cofre/tienda, nunca una carta de level-up ni Chaos: cada copia tiene valor visible y acumulativo, primero capacidad y luego recarga.
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
- Un tótem con beam distintivo (rojo) spawnea en posición aleatoria lejana al iniciar el run.
- Al entrar en su zona aparece el prompt "Press E to summon the boss"; el boss SOLO spawnea al pulsar la tecla — nunca por pasar al lado.
- **Invocación telegrafiada (2026-07-05, feedback de playtest)**: al pulsar E el tótem gira acelerado durante `BOSS.summonDelayS` (2.5 s) y el boss materializa a una distancia mínima del jugador (`BOSS.spawnMinDistFromPlayer`, 14 u, empujado en la dirección jugador→tótem y clampeado al arena) — nunca encima del jugador.
- La invocación trae UN boss aleatorio de un pool de 2:
  - **Crusher King**: tanque con embestida telegrafiada y spawn de scraplings.
  - **Tesla Titan**: mantiene distancia y dispara ráfagas radiales de proyectiles.
- Matar al boss NO termina el run: suelta 3 cofres + su orbe de XP y a los ~25 s se alza un nuevo tótem cuyo boss tiene +60% de vida (ciclo farmear → boss → boss más duro hasta el timer). En **`codex/demo-map1`**, la única victoria es sobrevivir los 10 minutos; la pantalla final distingue `SYSTEM OVERLOAD` (muerte), `SECTOR CLEARED` (mapa completado) y deja preparado `RUN COMPLETE` para el último mapa.
- Cada final de run persiste un registro local versionado con resultado, mapa, versión del build, fecha, duración, nivel, kills, bosses, build completa y daño real por arma. Son datos crudos —la métrica no se fija todavía— para poder derivar más adelante leaderboards por mapa sin migrar información incompleta.
- Pase Steam 2026-07-15: el spawn de boss tiene beat de materialización reforzado con burst rojo, núcleo blanco, anillo de impacto y shake dedicado (`VISUAL.bossSummonVfx`) para que el título `AWAKENS` sea capturable.
- **Histórico/superseded para `codex/map-2`:** el ciclo de tótems y la transición abierta entre mapas fueron placeholders. El arco Mapa 1 → Swarm Foundry → Hazard Marshal ya es jugable; solo su combate autorado final sigue provisional.
- Arco estético del multi-mapa (decidido 2026-07-03): scrapyard → fundición/fábrica → ciudad neón/estación orbital. El mundo es futurista; el scrapyard es el mapa 1, y cada mapa se ve más "futuro" que el anterior (detalle en `DIRECCION_ARTE.md`).
- Barra de vida del boss en el HUD.

### 13. Enemigo volador (Drone)
- Vuela por encima del enjambre: ignora separación y colisiones de props ambientales; entra directo. Las estructuras interactivas (portal, cofres y Scrapper) sí lo bloquean, igual que al resto de enemigos.
- Las armas le pegan igual (el combate es 2D en XZ).

### 14. Colocación segura y navegación entre obstáculos — implementado 2026-07-17
- Todo spawn de estructura valida su radio completo contra los límites del suelo y contra el espacio ya ocupado. Si no existe un punto legal, el spawn se omite o reintenta más tarde: nunca se coloca fuera del mapa ni solapado.
- Portal, Scrapper y cofres aportan colliders dinámicos al mismo conjunto que usa jugador, enemigos y búsquedas de spawn. Dejan de ser atravesables mientras están activos.
- Los cofres activos reservan una separación mínima configurable entre centros (`CHEST.minSpawnSeparation`), también en las recompensas múltiples de boss.
- Enemigos y bosses combinan steering tangencial anticipado con varias pasadas de resolución de colisión; los casos de centro exacto ya no se ignoran. Los spawns de enemigos también respetan arena y obstáculos.
- El layout del scrapyard reduce densidad y amplía carriles: gates de contenedores más abiertos y separados, y menos bidones con mayor separación. El hueco útil ya supera el diámetro del Crusher King.
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
- Settings: display mode, resolución, volumen master/music/SFX; persistencia vía Electron y fallback localStorage.
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
- **Estado**: Voltling cableado in-game y validado visualmente con enjambre denso; **Volt Warden** es un diseño histórico/futuro con modelo candidato, no el boss final vigente.
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

- **Default de primer arranque**: sin `settings.json`, Electron crea la ventana en fullscreen y el renderer normaliza el mismo default. Una preferencia persistida explícita de ventana o fullscreen siempre conserva su autoridad en los siguientes arranques.
- **Pantalla de Settings** (`#settings-overlay`, vista `menu-view` a pantalla completa — key-art de fondo, el 3D no renderiza detrás): título arriba, **sidebar de secciones anclado al borde izquierdo** (General / Controls) y contenido ancho centrado, ambos en placas del lenguaje del juego (marco oscuro casi opaco + muescas pixel — regla: sobre key-art, los paneles van a `rgba(12,16,22,0.96)` para que el arte nunca sangre bajo el texto, aplicada globalmente vía `.menu-view .overlay-panel`). **Auto-apply**: no existe botón Apply — todo cambio se aplica y persiste al momento (selects/sliders en `change`, bindings al capturar); sin toast (sería ruido). Back siempre abajo-izquierda en ambas pestañas; Reset to Defaults solo en Controls, a la derecha.
- **Acciones remapeables** (`ActionId` en `src/settings.ts`): moveUp/Down/Left/Right + **interact** (unificó los 3 `'KeyE'` que vivían en config — cofre/chatarrero/invocación de boss — en UNA acción; el prompt flotante muestra la tecla/botón REAL del binding y cambia según el dispositivo en mano). Escape y Start del mando = pausa, reservados. Los bindings viajan dentro del blob de settings persistido (`normalizeBindings` = migración por campo, saves viejos caen a defaults). **Captura agnóstica de dispositivo**: "PRESS KEY / BUTTON…" — lo próximo pulsado (tecla o botón) se asigna a su dispositivo; una captura por-dispositivo se tragaba pulsaciones del otro. La pestaña muestra el dispositivo activo (mando conectado → botones de pad; si no → teclado), con notificación de esquina "Gamepad detected/disconnected" (en `document.body` fixed — la capa `#hud` se oculta bajo vistas de menú).
- **Gamepad completo** (`src/input.ts`, `PlayerInput` por acciones con polling por frame): stick izquierdo analógico + d-pad para moverse, botón de interact remapeable, **traductor DirectInput** para mandos no-estándar (DualShock: Cruz/Círculo/Cuadrado reordenados al layout estándar + d-pad decodificado del hat en `axes[9]`; los mandos estándar no pasan por él). **Navegación de menús**: foco visible (`.pad-focus`) sobre botones/cartas/selects/sliders del overlay activo — vertical mueve foco, **horizontal AJUSTA el control enfocado** (cicla selects con wrap, sliders ±5, disparando `change` → auto-apply), aceptar = SOLO el binding de interact del jugador (sin A fijo — una tecla de acción en todo el juego, regla del usuario), B = back/resume/leave/continue contextual. El `<select>` nativo no puede abrirse programáticamente → aceptar sobre él cicla; al mover el foco se hace `blur()` del control nativo (un select con foco DOM comía flechas del teclado en silencio). En el cofre el foco aterriza en Continue (la card de la ruleta es escaparate, excluida de la navegación).
- **Fixes de plataforma**: el modo ventana/resolución solo se re-aplica cuando ELLOS cambian (re-aplicarlo en cada save parpadeaba la pantalla con cada tick de slider) · **precarga de TODO el arte de UI gated en la pantalla de carga** (`hud.preloadUiAssets()`, idempotente; `tickLoading` no revela hasta warmup 3D + decode de iconos de armas/stats/cartas/mods/retratos/glifos + cáscaras de orbe) — mató el tirón del primer level-up/cofre/tienda · animación de entrada compartida de los paneles de mitad de run (pop 0.32s; los keyframes DEBEN transportar el `translateX(-50%)` de centrado del panel o lo teletransportan).
- **Empaquetado Electron**: `npm run package` genera instalador NSIS (`-setup.exe`, asistente + desinstalador) Y portable (`-portable.exe`, un archivo para testers) en `release/`; sin firma → SmartScreen "Unknown Publisher" (certificado en Fase 6). **Regla de rutas de assets (mordió 3 veces el mismo día)**: en strings de JS/markup SIEMPRE relativas (`'assets/...'` — `file://` rompe las absolutas y Vite no puede reescribir strings); en CSS `url()` SIEMPRE absolutas (`'/assets/...'` — Vite las reescribe al compilar; las relativas resuelven contra `src/ui.css`). Gamepad API = Chromium nativo, cero cambios en el main process de Electron.
- Límite conocido v1: las etiquetas de tecla muestran el código físico (layouts no-QWERTY ven la posición) y los botones usan nomenclatura Xbox (A/B/X/Y) también en mandos PlayStation.

## Fuera de alcance actual
- Multiplayer/co-op: no implementado ni anunciado; solo existe el gate interno de viabilidad de `docs/MULTIPLAYER_FEASIBILITY.md`. Local/Remote Play persistiría solo en el save host/local; la progresión por cuenta de invitados no está prometida. Native online solo podría persistir cuentas propias tras validación host-authoritative.
- Dedicated servers: fuera de alcance.
- Meta-progresión entre runs, moneda, mapas múltiples y evolución de armas: post-validación. **Field Engineer** ya es el personaje inicial jugable; los otros dos personajes de lanzamiento siguen fuera de alcance y sin diseño comprometido. Su modelo runtime v1 está técnicamente validado, pero permanece como candidate visual hasta que exista aprobación final explícita del usuario (`DISENO_PERSONAJES.md`).

### Personajes — Field Engineer

#### Contrato reutilizable de UI para personajes jugables — implementado

Todo personaje nuevo exige `modelKey` validado y frontal/lateral/trasera planas aprobadas; la frontal empaquetada es el retrato 2D sobre `#444e5e`/`#2b3340`. La tarjeta comunica retrato, nombre y estado: `Unlocked` o texto visible exacto `Locked` junto a `assets/2d/icon-ui-lock-v2.png`, sin emoji. El detalle tiene encabezado, una fila con icono in-game veraz por cada stat (sin combinar stats ni usar Shield para Armor), firma config-derived, Recommended Weapon solo de presentación, tradeoff y Contract/progreso. Menú y pre-run comparten renderer, `data-character-*`, scroll responsive, teclado/gamepad y bloqueo de Confirm. No se monta WebGL: `src/models/character-preview.ts` queda como infraestructura dormida. Field Engineer implementa este contrato con `ref-field-engineer-front-v1.png`.

- `src/characters.ts` define un registry data-driven con ID estable, copy derivada de `CHARACTER_BALANCE`, `modelKey`, perfil base, signature, arma recomendada y metadata de unlock.
- Flujo de nueva run: **Play → Character Selection → Starting Weapon Draft → Loading → Run**. La selección es una `menu-view`, no un `GameState` nuevo; exige Confirm y soporta teclado/gamepad.
- Field Engineer (`field-engineer`) está desbloqueado por defecto: 110 HP, Armor rating 5%, Damage ×0.95, Move Speed 11, Attack Speed ×1, crítico 5%/+50%, Luck/Regen 0 y los sockets globales sin cambios (1/2 iniciales, 2/4 máximos).
- **Field Repair** cura 6% del HP máximo después de instalar o subir tier de un Core durante gameplay. Clampea a máximo, no hace overheal y no se ejecuta en load, replay, Boss Lab o reconstrucción.
- Bolt Cannon no se garantiza ni cambia las odds: si entra naturalmente en el draft, solo muestra `Recommended`.
- `PROFILE.unlockedCharacters` persiste IDs y Contracts admite rewards `character`; todavía no existen contratos ni umbrales de personajes.
- El menú **Characters** y la selección previa al arma usan el mismo roster y una frontal ortográfica 2D aprobada (`ref-field-engineer-front-v1.png`). El detalle mantiene filas e iconos propios por stat, Field Repair es config-backed, Bolt Cannon sigue siendo solo **Recommended Weapon** y el tradeoff declara `-5% Damage`. El estado `Unlocked` vive solo bajo el retrato y no se duplica en el detalle; un personaje bloqueado sí añade allí el requisito de Contract con candado y barra segmentada. El preview 3D permanece dormido y no es visible; los atributos `data-character-*` no cambian.
- Boss Lab conserva el `characterId` registrado y reconstruye primero ese baseline antes de reproducir Cores; la reproducción no atraviesa el trigger de gameplay de Field Repair.
- El modelo runtime v1 usa perfil lateral medido sin mochila más volumen procedural trasero dedicado. `backPaintRef` solo pinta la carcasa existente. La validación técnica superó el preview 0°/90°/180°/270°, la marcha vista desde atrás y el gate de 400+ (431–440 enemigos, 118.87 FPS medios, bucket mínimo 92.41 FPS, p99 8.5 ms, 0 errores de página y 431/431 enemigos en movimiento). No consta aprobación visual final explícita del usuario, por lo que sigue siendo candidate visual.

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

Successful local packaged Electron run via `npm run benchmark:audio`: deterministic `audio-swarm-416` (seed 4979220; digest `4979220:240-112-48:0.25:4`), 404 peak / 411 minimum / 411 end active enemies, including normal-HP sacrificial enemies. At 800x600 after 3 s warmup + 10 s rAF sample on Windows 10 / AMD Ryzen 7 3700X / NVIDIA GeForce RTX 2060 (D3D11): 120.10 mean FPS, 119 minimum complete 1 s bucket FPS and 8.5 ms frame-time p99. Actual paths: 9 kills, 7 XP pickups, 14 Gold pickups; audio 47 attempts / 27 accepted, 15 peak voices, 20 cooldown drops, 0 steals/load failures/leaks and 0 active audio voices after cleanup. Evidence: `tmp/perf-audio-output/report.json`. This validates this machine and scenario only, not Steam minimum hardware.


## Perfil persistente y Contratos — Implementado 2026-07-25 (v0.5.6)

**Estado histórico superseded:** Steam Playtest Wave 1 (`0.10.5-beta`) admitía esa build y reutilizaba la epoch `wave-1-rc-2026-08`. La demo `0.11.1-demo` no continúa esa wave: no pide consentimiento, no resetea progreso y no crea identidad ni cola de telemetría.

Reemplaza al panel dev de Unlocks como motor de progresión. **No hay moneda meta**: los contratos son el único motor (decisión cerrada).

### Perfil (`src/profile.ts`)

`PROFILE` (antes `ACCOUNT`, renombrado porque `upgrades.ts` ya exporta una clase `Progression` para la progresión DENTRO de la run) guarda desbloqueos y sockets. Se persiste en `userData/profile.json` por IPC de Electron, con `localStorage` como fallback de navegador, espejando la costura de `settings.ts`.

Reglas que no se rompen:

- **`PROFILE` se muta EN SU SITIO, nunca se reemplaza.** Todo consumidor de gating (pool del draft, draft inicial, sockets, pool de mods) tiene una referencia viva; reemplazar el objeto los desconecta a todos en silencio. `loadProfile()` corre en `main.ts` ANTES de construir `Game`.
- **Los techos de diseño (`maxWeaponSockets`/`maxCoreSockets`) NO se persisten**: son constantes de balance, así que subirlos alcanza a saves existentes.
- Las listas de desbloqueo se **mergean sobre los defaults** y se filtran contra los registries reales: promover un ítem a desbloqueado-por-defecto llega a jugadores existentes, y un save editado a mano no puede inyectar un id fantasma.

`LIFETIME` es el ledger monótono de carrera (runs, kills, mejores marcas, bosses y tipos de boss, daño por arma, runs por arma inicial, oro, cofres por tier, compras, hazañas de estilo). Vive aparte del historial **porque el historial se corta en 250 runs** y un contrato de "10.000 kills acumuladas" perdería terreno al envejecer las runs. Es idempotente por id de run, así que rellenar retroactivamente nunca infla totales.

### Historial de runs (`src/run-history.ts`)

Los registros pasan a `userData/run-history.json` (antes solo `localStorage`, dentro del LevelDB de Chromium, ilegible para herramientas). `migrateRunHistory()` corre al arrancar, no de forma perezosa: migrar dentro de `loadRunHistory()` solo se disparaba al TERMINAR una run. **Aviso: `localStorage` es por ORIGEN** — lo escrito por un build empaquetado vive bajo `file://` y una sesión de dev server ve otro almacén.

Campos añadidos por ser irrecuperables después: `startingWeapon`, `difficulty` (estampada `'standard'` aunque no exista selector aún — un leaderboard que mezcla dificultades no ordena nada), `characterId` (reservado), `bossTypesDefeated`, `damageTaken`, `goldEarned`, `chestsByTier`, `shopPurchases`, y `submittedTo` (Steam es dueño del ranking; esto solo evita enviar dos veces). **No se guarda semilla de run**: exigiría sembrar el RNG de gameplay primero, que es el refactor de determinismo diferido.

### Ciclo reutilizable de telemetría privada — Wave 1 histórica, demo inerte

Un único `TELEMETRY_CONFIG` tipado gobierna habilitación, builds exactas admitidas, `gameId`, `waveId`, schema/disclosure, epoch nullable y límites de transporte/cola. La elegibilidad exige además flavor `playtest`: `flavor === 'playtest' && enabled && packaged && !benchmark && admittedBuildVersions.includes(buildVersion)`. Si falla, no hay prompt, reset, lectura/escritura de consentimiento, identidad, cola, red ni feedback, y la fachada renderer informa no disponible. En la demo vigente: `enabled: false`, allowlist vacía y `resetEpoch: null`; los valores activos de Wave 1 quedan documentados solo como historial.

Cuando una wave futura se habilite, Electron main exige una prueba atómica `userData/telemetry-consent.json` ligada al digest determinista de `consentVersion` y de todo el copy renderizado desde `TELEMETRY_CONFIG.disclosure`: ausencia pide consentimiento; corrupción bloquea; la misma disclosure sirve silenciosamente en launches/waves posteriores; cambiar versión o texto vuelve a preguntar automáticamente. El reset tiene un diálogo independiente incluso con consentimiento existente. El renderer **nunca sube datos directamente**: solo publica eventos tipados mediante `contextBridge`; Electron main valida, identifica, encola y sube después de elegibilidad y consentimiento.

Contrato de datos:

- Un `installationId` UUID aleatorio vive en `userData/telemetry-installation.json`, separado de perfil, settings e historial. No se recopilan Steam ID, email, nombre, hardware ni huellas del dispositivo.
- Cada proceso crea un `sessionId`; cada run crea un único `runId` reutilizado tanto por telemetría como por `RunRecordV1`. El historial local sigue guardando **solo runs terminadas**; abandonar desde pausa produce `run_ended: abandoned` remoto sin contaminar contratos, percentiles ni carrera.
- Eventos permitidos: inicio/fin de sesión, inicio/fin de run, decisiones, rendimiento agregado, feedback y resumen de fallos de subida. Las decisiones registran únicamente hechos observados: cartas ofrecidas y selección/descarte, invocación de boss, compra/recompensa de cofre y compra de tienda.
- Rendimiento se agrega mientras el estado es `playing`: ventanas periódicas de 30 s y un resumen final. Nunca se emite un evento por frame.
- La cola `userData/telemetry-queue.json` usa escritura atómica, IDs estables y scope inmutable por evento (`gameId`/`waveId`/schema/build/session). Un cliente posterior puede drenar Wave 1 sin relabelarla como Wave 2; cada lote contiene solo scope/session/build compatibles. La migración v1 nunca adivina scope: mueve entradas legacy sin scope a cuarentena `legacy_unscoped_event`. Se mantienen los límites de 100 eventos/128 KiB, deadline 10 s, backoff, tope 2.000, ACK estricto y cuarentena `413` de 100 entradas.

La pantalla final incluye feedback explícito y seudónimo sin texto libre: diversión 1–5, dificultad (`too_easy` / `about_right` / `too_hard`) y etiquetas fijas opcionales. Nada se envía hasta pulsar **Submit Feedback**. El endpoint y `X-Client-Token` son identificadores públicos del cliente; secretos HMAC, Cloudflare, D1, Google y cuentas de servicio permanecen fuera del juego.

Verificación focal: `npm run test:telemetry` cubre además cero efectos sin elegibilidad/consentimiento, aislamiento cross-wave y migración legacy; `npm run test:playtest-reset` cubre admisión exacta, kill switch, epoch nullable, consentimiento persistido/versionado/corrupto y confirmación de reset separada.

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

`npm run test:smoke` (una run real por arma inicial, perfil aislado), `npm run stats` (percentiles para calibrar umbrales, nunca promedios), `npm run reset:profile` (escribe perfiles vacíos, no los borra: `loadProfile` cae a `localStorage` si falta el archivo y resucitaría el save), `npm run check:release-flags` (hook `prepackage` que aborta el build con cualquier instrumento de dev encendido).


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

Nunca puede mostrar dos mods iguales en celdas contiguas. Había dos causas: la tira era un ciclo del pool con el premio pegado al final (si el ciclo terminaba en el premio, quedaban dos iguales — ~1 de cada 4 aperturas), y los tiers pequeños no daban para una ruleta (purple tiene 2 mods, **gold tiene 1**: mostraba 19 celdas idénticas). Ahora la tira se construye como ids y se sanean adyacencias sin tocar nunca la celda del premio, y por debajo de 3 entradas el giro toma prestados mods de otros tiers **solo como paisaje** — el tier lo sigue diciendo el marco de la carta y la celda donde aterriza es siempre el premio del tier correcto.

El aterrizaje y el reveal son **una única aparición continua** del premio. La ruleta promociona al contenedor final el mismo nodo visual que aterrizó — nunca lo oculta para clonar o recrear inmediatamente el mismo mod — y conserva el timing, el fallback de `transitionend`, el flash, los god-rays, las chispas, el overshoot, el audio y el botón Continue.

### Balance

**Volt Pulse: cooldown 2.4 → 1.4s, daño sin tocar.** Su daño no era el problema: a 10 por pulso cada 2.4s necesita ~4 enemigos en el radio solo para igualar a Bolt Cannon, y esa densidad no existe en los primeros minutos — un arma de media run en manos de quien empieza. Subir el daño habría inflado el late, donde ya es fuerte. El coste real era el aire muerto: a diferencia de Orbital Blades, donde el jugador controla el contacto moviéndose, Pulse no ofrece nada que hacer entre disparo y disparo.

## Boss final del Mapa 2 — modelo CERRADO 2026-07-31 (v0.8.1)

Decisión del usuario: el boss final del Mapa 2 es el **Hazard Marshal**, clave `final-boss` en `src/models/registry.ts`. Sustituye al pod Volt Warden que ocupaba ese hueco. Está integrado como enemigo spawnable y jugable mediante `modelKey: 'final-boss'`, dentro del arco Mapa 1 → Mapa 2 → finale. La configuración de combate y moveset vigentes son provisionales; faltan mecánicas autoradas definitivas, arena y balance.

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

- **Gameplay definitivo:** las fases, telegrafías, patrones y cambios de arena siguen por autorar y balancear. La configuración y moveset jugables actuales son provisionales.
- **Aviso de lenguaje visual:** el boss es ámbar+carbón y los Voltling del enjambre también. A tamaño de boss más el doble anillo rojo se distingue, pero conviene revisarlo al definir el elenco del Mapa 2 (la fundición mueve paletas igualmente).
- **Ángulos 90°/270°** siguen siendo los más flojos. Importa menos de lo que parece: el boss gira siempre hacia el jugador y la cámara va detrás del jugador, así que in-game el ángulo dominante es el frontal.

### Animaciones — rig de piezas (2026-07-31)

El boss tiene **rig de piezas con jerarquía de pivotes** (`src/models/rig.ts`): cabeza, torso, dos brazos, dos muslos y dos espinillas, cortados del MISMO `VoxelGrid` que la malla única. Tres clips: `idle` (0.31 Hz), `walk` (0.62 Hz) y `hit` (disparo único).

Es la única entidad que puede permitírselo: el resto del elenco se dibuja con `InstancedMesh` y una matriz por instancia, que no tiene miembros. De un boss solo hay uno en pantalla.

**Sistema completo, reutilizable para futuros enemigos/personajes/bosses, en `docs/ANIMACION_RIG.md`** — incluye cómo partir un modelo, el convenio de signos, por qué un seno hace que una marcha parezca sintética, y la verificación obligatoria del reparto de piezas.

El rig se revisa desde `model-preview.html?model=final-boss&anim=<clip>`. Esa preview no sustituye la integración runtime: Hazard Marshal ya está enganchado como `modelKey: 'final-boss'`; las animaciones de ataque definitivas dependen del moveset que queda por autorar.

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
