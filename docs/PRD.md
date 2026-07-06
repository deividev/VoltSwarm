# Voltswarm — PRD v2 (definitivo)

Fecha: 2026-07-02. Extiende el spec base (`CLAUDE_megabonk_3d.md`) con las decisiones del playtest del usuario y el estudio de la base de Megabonk. Método: `docs/METODO_DISENO.md`. Arte: `docs/DIRECCION_ARTE.md`. Diseño de mejoras: `docs/DESIGN_MEJORAS.md`.

## P1 — Estructural

### 1. Orbes de XP con rango de recogida
- Los enemigos ya no dan XP directa: sueltan un orbe donde mueren.
- El jugador recoge orbes acercándose a su `pickupRange` (stat de la ficha); el orbe vuela hacia él acelerando.
- Orbes cercanos entre sí se fusionan (suman valor) para controlar densidad y rendimiento.
- Render: 1 InstancedMesh, pool con cap.
- Criterio de aceptación: matar lejos y no acercarse = no XP. Recoger dispara level-up.

### 2. Ficha de stats RPG + pool de mejoras con rareza
- Ficha del personaje: Damage, Attack Speed, Crit Chance, Crit Damage, Move Speed, Attack Range, Pickup Range, Projectile Count, Projectile Speed, Area (tamaño de disparos/efectos), Armor (retornos decrecientes), Regen.
- Level-up: 3 cartas aleatorias entre mejoras de stat y cartas de arma (desbloquear/subir nivel de arma).
- Rareza: Común / Rara / Épica con magnitudes crecientes (base 8-15% común, según stat). Luck mejora los pesos de rareza.
- Cofres: recompensas de stats generales estilo Megabonk — +Luck, +Area, +Dificultad (con +XP a cambio) — además de reparar/cache/frenzy/haste existentes.
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
- Críticos: más grandes y en color acento.

## P2 — Contenido y tuning

### 6. Elites
- Probabilidad por Dificultad. Elite = tipo base con ×escala, ×vida, tinte magenta distintivo.
- Al morir sueltan un COFRE (cierra el loop elite → recompensa).

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
- Matar al boss NO termina el run: suelta 3 cofres + su orbe de XP y a los ~25 s se alza un nuevo tótem cuyo boss tiene +60% de vida (ciclo farmear → boss → boss más duro hasta el timer). La única victoria es sobrevivir los 10 minutos; la pantalla final cuenta los bosses derrotados.
- Dirección futura (abierta, post-validación): cada boss derrotado transiciona a un mapa nuevo estilo Megabonk, culminando en un boss final. El ciclo de tótems actual es el placeholder mecánico de esa estructura.
- Arco estético del multi-mapa (decidido 2026-07-03): scrapyard → fundición/fábrica → ciudad neón/estación orbital. El mundo es futurista; el scrapyard es el mapa 1, y cada mapa se ve más "futuro" que el anterior (detalle en `DIRECCION_ARTE.md`).
- Barra de vida del boss en el HUD.

### 13. Enemigo volador (Drone)
- Vuela por encima del enjambre: ignora separación y colisiones de props; entra directo.
- Las armas le pegan igual (el combate es 2D en XZ).

## P0 Steam readiness — Implementado 2026-07-04

- Marca de lanzamiento: **Voltswarm**. La horda robótica puede referirse internamente como **the Volts**.
- Pausa: `Escape` pausa/reanuda y perder foco pausa automáticamente la run.
- Menú de pausa: Resume / Settings / Quit to Menu.
- Settings: display mode, resolución, volumen master/music/SFX; persistencia vía Electron y fallback localStorage.
- Branding de app: icono voxel placeholder conectado a Electron y al empaquetado Windows. Es **placeholder técnico**, no icono final; se reemplaza después del pase de arte.

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
- Cámara libre/rotable por el jugador: DESCARTADA — el encuadre fijo es parte del balance y de la dirección de arte (decisión razonada, no pendiente).

## Pipeline de modelos voxel 2D→3D — Implementado 2026-07-04

- **Sistema**: referencia frontal plana por personaje (`assets/2d/ref-*.png`, gpt-image) → voxelización automática (`src/models/icon-voxelizer.ts`) → registro central (`src/models/registry.ts`). `EnemySystem.upgradeVoxelModels()` intercambia async la geometría de cualquier tipo de enemigo/boss registrado; sin entrada o si falla la carga, se mantienen las primitivas (fallback seguro).
- **Estado**: Voltling cableado in-game y validado visualmente con enjambre denso; **Volt Warden** (boss nuevo, cabeza-casco flotante derivada del icono aprobado) tiene modelo listo pero SIN gameplay — diseño de mecánicas pendiente.
- **Herramientas**: `tools/capture-model-preview.mjs <clave>` (viewer con luz del juego) y `tools/capture-ingame.mjs [segundos]` (arranca el juego headless, juega y captura).
- **Criterio de aceptación por modelo**: silueta distinguible a distancia de cámara, paleta exacta, triángulos por instancia en presupuesto (enemigos ~3-6k), y validación final con 400+ enemigos activos.
- Detalle del método y reglas: `DIRECCION_ARTE.md` (pipeline + extensión a VFX/audio) y `PROMPTS_IMAGENES.md` §6 (prompt maestro).

## v3 — Expansión de contenido (implementada 2026-07-03, del plan de COMPARATIVA_MEGABONK.md)

- **Sistema de estados alterados**: slow (factor + duración), daño en el tiempo (ticks de 0.5 s por el embudo normal de daño) y knockback con decaimiento. Bosses inmunes al knockback. API en `EnemySystem.applySlow/applyDot/applyKnockback`.
- **Capas defensivas**: Evasion (esquiva con retornos decrecientes, muestra "MISS"), Shield (absorbe antes que la vida; se representa como placas cian orbitando al jugador — `Player.setShieldCharges`, NO una barra en el HUD; cada carga bloquea un golpe completo y se regenera una carga cada 8 s, intervalo fijo — `PLAYER.shieldRegenS`), Thorns (refleja al contacto), Lifesteal (% de robar 1 HP por golpe). Embudo único de daño al jugador en `Game.damagePlayer`.
- **Cartas nuevas**: Ghost Plating, Rusty Spikes, Barrier Cell, Leech Coil, Capacitor Bank (Duration: alarga buffs y estados) y Chaos Module (stat aleatorio a la rareza de la carta).
- **5 armas nuevas (draft de 11)**: Oil Sprayer (charcos que ralentizan, 0 daño — control puro), Acid Drum (zonas corrosivas con DoT; renombrada de "Acid Flask" el 2026-07-05 para encajar con la estética industrial/futurista), Turbine Fan (tornados con knockback), Junk Ricochet (rebota entre enemigos), Dismantler (garra que EJECUTA no-bosses bajo 15% de vida — primera arma "twist").
- Verificado headless: estados, defensas, cartas y las 5 armas ejercitadas; 120 FPS con zonas activas y enjambre.
- Pendiente del plan: moneda/economía (post-validación, sin cambios).

## Fuera de alcance (sin cambios)
- Meta-progresión entre runs, moneda, mapas múltiples, evolución de armas, personajes (post-validación; los bocetos viven en DESIGN_MEJORAS.md).

## Orden de implementación
Ficha+pool → orbes XP → dificultad → separación → damage numbers → elites → roller/gunner → colisiones props → tuning → armas nuevas → draft → tótem+bosses → volador → verificación completa (FPS 100+ enemigos, run jugable de punta a punta).
