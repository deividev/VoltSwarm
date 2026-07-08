# Voltswarm — Roadmap a Steam

Fecha: 2026-07-04. Orden decidido por el usuario: primero visual, luego sonido y balance, y al final la capa de lanzamiento. **Nombre: Voltswarm — CERRADO (confirmado 2026-07-05).** Precio objetivo: **$4.99** con descuento de lanzamiento 10-15%.

**Orden de trabajo confirmado por el usuario (2026-07-05): terminar TODO el arte de la v1 (Fase 1 visual + gate de captura) antes de tocar nada de la capa Steam (App ID, página, cápsulas). No adelantar esos pasos.**

## Hecho (pase de endurecimiento, 2026-07-04)

- ✅ Marca de lanzamiento migrada a **Voltswarm** en metadata, UI principal y documentación clave
- ✅ Pausa real implementada (`Escape` + pause-on-blur) con overlay Resume/Settings/Quit
- ✅ Pantalla de Settings añadida (display mode, resolución, volumen master/music/SFX) con persistencia Electron/localStorage
- ✅ Icono de app **placeholder técnico** creado y conectado a `BrowserWindow.icon` + `build.win.icon` para que el build no use el icono default de Electron. **No es el icono final**.
- ✅ Build de Electron endurecido: salida CommonJS marcada dentro de `electron/dist` para convivir con `type: module`
- ✅ Menú de Electron eliminado en producción (`Menu.setApplicationMenu(null)`, sin Ctrl+R que borre runs, DevTools solo en dev)
- ✅ Diálogo de recuperación ante crash del renderer (Restart/Close)
- ✅ Sourcemaps fuera del build de producción (no regalar código ni tabla de balance)
- ✅ `Player.reset()` limpia invulnerabilidad residual entre runs
- ✅ Lockfile duplicado eliminado (npm es el gestor), README actualizado a 11 armas

Regla del orden (decidida 2026-07-04): **el arte va primero porque es el único prerequisito de la página de Steam, y cada semana sin página son wishlists perdidas.** La página se publica en cuanto el juego es fotogénico; el resto se hace con la página ya acumulando wishlists.

## Fase 0 — Prompts de generación de imágenes (antes de arrancar la Fase 1)

Lista completa en `docs/PROMPTS_IMAGENES.md`. **Estado 2026-07-05:**
- ✅ Icono de la app — APROBADO como final (`public/assets/2d/app-icon-test.png` → `build/icon.ico` multi-res vía `tools/make-app-icon.mjs`)
- ✅ Los 10 modelos voxel (6 enemigos + 3 bosses incl. Volt Warden + jugador) — pipeline 2D→3D congelado, todos in-game
- ✅ Logo/wordmark (2026-07-05): `logo-voltswarm-v3.png`, amarillo + transparencia real
- ✅ Iconos de armas (11 de 11, 2026-07-05) · ✅ props de escenario Mapa 1 (contenedor 3 colores + bidón 3 colores, 2026-07-08)
- 🔴 Iconos de stats (19), ornamentos de rareza, cofre/portal voxel, menú+UI, key art — PENDIENTES (bloquean la sesión de captura, ver checklist del gate)

## Fase 1 — Visual (plan en REFERENCIAS_VISUALES.md)

1. ✅ Bloom selectivo (2026-07-05: umbral sobre emisivos, validado 121 FPS con enjambre masivo; contador FPS dev en `VISUAL.showFps`)
2. ✅ Sombras blob instanciadas (2026-07-05)
3. ✅ Toon shading 3 escalones (2026-07-05)
4. ✅ Suelo con carácter — **REHECHO 2026-07-06**: Mapa 1 redefinido como fábrica abandonada (ver `DIRECCION_ARTE.md`); el suelo procedural por código se descartó (no convenció) y se reemplazó por `ground-factory-floor.png` generado con IA (vista cenital, pipeline nuevo en `PROMPTS_IMAGENES.md` §7b), en mosaico vía `RepeatWrapping` (`config.VISUAL.ground.worldSizePerRepeat: 18`), material `litMaterial()` unificado con el resto de entidades. Aprobado en playtest real.
5. ✅ Partículas de muerte voxel burst (2026-07-05; chispas de golpe → pase VFX de armas)
6. ✅ Screen shake y cielo degradado + vignette (2026-07-05) · wobble de enemigos ⏸️ desactivado por decisión del usuario, revisar tras VFX
7. ✅ Modelos voxel IA — **ELENCO COMPLETO (2026-07-05)**: 6 enemigos + 3 bosses + jugador in-game (Volt Warden con gameplay pendiente); refs en `public/assets/2d/`; 121 FPS validados con todo activo
8. ✅ **Icono final de la app** (2026-07-05): `app-icon-test.png` aprobado como final → `build/icon.ico` multi-res
9. **GATE de la sesión de captura — lo que falta para las capturas v1** (detalle abajo, actualizado 2026-07-08): iconos de stats (19) + ornamentos de rareza · cofre voxelizado · portal de boss (reemplaza al tótem) · VFX de armas/portal/ataques enemigos · menú inicial · pase de UI voxel
10. **Sesión de captura**: cápsulas, screenshots, GIFs del enjambre

## Checklist del gate de captura v1 (definido 2026-07-05 con el usuario)

Lo que falta para que las capturas/GIFs vendan la página de Steam:

1. **Pase de VFX de combate** — armas (Acid Drum, Hydraulic Press, Volt Pulse, todas), tótem (invocación telegrafiada más espectacular) y ataques enemigos (proyectiles Gunner/Tesla): alinear con voxel+toon+bloom; chispas de golpe. Regla: partículas = cubos de paleta. **Coherencia icono↔VFX (2026-07-05): el VFX del ataque de cada arma en el mundo debe usar el mismo acento de color que su icono de HUD** (p. ej. Bolt Cannon = amarillo `#ffe066`, Volt Pulse = cian `#7ee0ff`, Orbital Blades = gris claro `#c9d4de`) — si el jugador ve el icono en el panel y el efecto en pantalla, tiene que poder asociarlos al instante sin leer el nombre. **Pendiente de revisión específica: Junk Ricochet (2026-07-05)** — el icono v3 (chatarra + zigzag morado `#c060ff`) quedó aprobado para seguir avanzando, pero el usuario no queda convencido de cómo se ve/lee la habilidad EN JUEGO (el rebote entre enemigos) comparado con lo que el icono promete. Al llegar a este punto del pase, revisar si hay que rehacer el VFX in-game del rebote, o el icono, o ambos, para que se entiendan como la misma cosa.
2. **Props del mapa con rol táctico** — EN CURSO. Modelos nuevos vía pipeline 2D→3D CON LA REGLA NUEVA DE 3 VISTAS + construcción multi-bloque (frontal/lateral/trasera, `PROMPTS_IMAGENES.md` §6-7) que ADEMÁS canalicen oleadas: colisión que corte el paso a enemigos y jugador (muros de contenedores volcados, pilas de chatarra/maquinaria altas, esqueletos de grúa) para poder llevar la horda a donde quieres. Densidad confirmada por el usuario: **sutil** — pocos embudos grandes en puntos clave, el enjambre se sigue viendo casi todo el tiempo (rechazadas las opciones "moderado" y "denso/táctico"). Las franjas de peligro del suelo nuevo ya sugieren dónde alinear los chokepoints.
   - ✅ **Contenedor industrial** (2026-07-08): voxelizado desde las 3 vistas, in-game como gates-chokepoint con collider, 3 variantes de color (teal/naranja/mauve) con anti-repetición entre vecinos, 13-17 gates por run con scatter uniforme por área. 120 FPS validados.
   - ✅ **Bidón industrial** (2026-07-08): voxelizado, 3 variantes (mostaza/negro/blanco), 60-85 por run con collider.
   - ⏸️ Andamio: voxelizado pero retirado del mapa (2026-07-06, el color/escala no convenció tras dos pases).
   - ⚪ Pila de chatarra / grúa: **NO bloquean las capturas v1** (densidad actual validada por el usuario 2026-07-08) — se reevalúan después.
3. **Iconos 2D en el HUD**:
   - ✅ **Armas (11 de 11) — CERRADO 2026-07-05**, cableadas en `src/hud.ts`, verificado en vivo a 120 FPS. Pendiente no bloqueante: revisar Junk Ricochet cuando exista el VFX de combate (ver punto 1).
   - 🔴 Stats (19) y ornamentos de rareza en cartas — pendientes (§4-5 de PROMPTS_IMAGENES). Un HUD con emojis en los stats todavía no puede salir en capturas de tienda.
4. ✅ **Logo/wordmark** — cerrado 2026-07-05 (`logo-voltswarm-v3.png`)
5. ✅ **Nombre final** — Voltswarm, confirmado 2026-07-05 (no reabrir)
6. **Key art / cápsula** — con el logo cerrado (§8; preferencia: capturas reales del motor).
7. (Recomendado) **Pantalla de Game Over/victoria con el desglose de daño por arma** — es de Fase 3, pero si las capturas incluyen el final de run, mejor que luzca.
8. 🔴 **Cofre voxelizado** (añadido 2026-07-08) — los cofres de élite/boss salen en cualquier captura de mid-run y hoy son geometría primitiva. Prop sólido → pipeline de 3 vistas (`PROMPTS_IMAGENES.md` §6-7), referenciando los iconos de arma aprobados en el prompt (regla multi-bloque).
9. 🔴 **Portal futurista/industrial reemplazando el tótem** (decisión 2026-07-08) — el tótem con calavera no encaja con fábrica/robots; se sustituye por un portal industrial-futurista como invocador del boss. Si el diseño es un marco abierto (see-through), va por el pipeline de vista única como el andamio, no el de 3 vistas. El VFX de invocación telegrafiada (punto 1) se diseña sobre el portal, no sobre el tótem — no hacer el VFX dos veces.
10. 🔴 **Menú inicial en condiciones** (añadido 2026-07-08) — pantalla de inicio con el logo aprobado, estética voxel/industrial; es la primera imagen del juego en vídeos y streams.
11. 🔴 **Pase de UI al estilo voxel** (añadido 2026-07-08) — cartas de mejora, paneles del HUD y overlays alineados con la dirección de arte (hoy son cajas CSS genéricas); incluye los ornamentos de rareza del punto 3.

## Fase 2 — Página de Steam ARRIBA (inmediatamente tras la captura)

- Registrar App ID ($100), subir página con cápsulas/GIFs/descripción, tags, empezar a acumular wishlists
- Desde aquí, todo lo demás se desarrolla con la página viva

## Fase 3 — Instrumentos (1-2 días, justo tras publicar la página)

- **Pausa** (Escape + pause-on-blur) — CRITICAL de los jueces
- **Desglose de daño por arma en pantalla final** — el instrumento de medición del balance (el embudo `dealDamage` ya centraliza todo)
- **Settings in-game** conectando el IPC de Electron ya construido (fullscreen, resolución; el volumen se añade en Fase 4)
- **Menú principal completo**: botones Start Game + Settings (la misma pantalla de settings, accesible desde el menú principal Y desde la pausa); número de versión del build visible abajo a la derecha (formato `vMAJOR.MINOR.PATCH`, leído de `package.json`)

## Fase 4 — Sonido

- Dirección de audio (fijada 2026-07-04, detalle en DIRECCION_ARTE.md): mecánica de juguete/maquinaria — clanks, servos, zumbidos, chirps sintéticos; cero gore; música siguiendo el arco scrapyard→fundición→neón
- SFX: golpe, kill, level-up, cofre (ruleta), invocación de boss, escudo BLOCK, orbes
- Música: loop de combate + intensidad en boss
- Mixer con volumen/mute en la pantalla de settings

## Fase 5 — Balance + contenido de rejugabilidad

- Playtests con datos del desglose por arma (55 combinaciones de build)
- Selector de dificultad alimentando `difficultyScalar` + persistencia de mejor run
- **Historial local de runs** (fecha, arma inicial, nivel, kills, bosses, tiempo) — es la base de datos del leaderboard de Fase 6 y del propio jugador comparándose consigo mismo
- Semilla de layout aleatoria por run, escalera extendida de bosses/elites (candidato listo: **Volt Warden**, boss con modelo voxel aprobado 2026-07-04, pendiente de diseño de mecánicas), meta-progresión ligera
- **Boss final (mapa 3) — modelo REVISAR antes de usar (2026-07-05)**: voxelizado de prueba en `src/models/registry.ts` clave `final-boss` (ref `ref-volt-warden-front.png`, la v1 original, NO la v2). Capturado desde 4 ángulos (`assets/preview/final-boss-{0,90,180,270}.png`): de frente se lee bien (cara, visor, mandíbula), pero de lado y de espaldas es una masa amarilla lisa sin detalle — la ref v1 solo tenía diseño en la cara frontal, nunca se le aplicó la técnica de silueta contigua que sí tiene la v2. Aceptable si el boss casi siempre se ve de frente/3-4 con la cámara del juego, pero NO sirve para marketing con ángulos laterales. Decidir al construir el mapa 3: generar una ref dedicada "boss final" con detalle en los 360°, o adaptar la v2 del Warden a mayor escala. NO usar tal cual sin revisar.
- **Personajes al final del bloque** (presets sobre stats ya balanceados; diseño en DESIGN_MEJORAS.md)
- **Retención (gap-analysis vs Megabonk completo, 2026-07-04):**
  - **Contratos de Desguace**: misiones tipo "mata X con Y / sobrevive sin daño N min" → desbloqueos. Es el motor de retención de Megabonk (~240 quests) traducido a nuestro tema.
  - **Desbloqueos de contenido**: v1 lanza con ~5-6 armas disponibles y el resto se "reconstruye desde restos" completando contratos (mismo contenido, mucha más longevidad percibida; lore gratis de desguace).
  - **Modo Overload (endless)**: al sobrevivir los 10 min, opción de seguir con la dificultad descapada hasta morir — alimenta el leaderboard con puntuación no acotada (gemelo del "Final Swarm" de Megabonk).
  - **Reroll / Skip / Banish** en el level-up (ya diseñado en DESIGN_MEJORAS.md; N usos por run).
- INFO pendientes de los juicios: subida multinivel de XP por orbe, `BOSS_TYPE_INDEXES` posicional → campo `isBoss`, wrap del `gen % 1000`, alocación en `pickEnemyType`, `ELITES.scaleMultiplier` separado visual/daño, i-frames en dodge/block (¿intencional?)

## Fase 6 — Steamworks técnico + cierre

1. `steamworks.js` a dependencies + `asarUnpack`, logros definidos y llamados (boss kill, survive, nivel X, N runs)
1b. **Leaderboards de Steam** (API de leaderboards vía steamworks.js): comparar runs propios y de otros jugadores. Decisiones de diseño pendientes: métrica principal (kills totales vs bosses derrotados vs nivel alcanzado — recomendación: un leaderboard por mapa con kills como métrica, y el detalle del run en el desglose), y asumir que es client-authoritative (falsificable — estándar aceptado en indies de este tamaño, no invertir en anti-cheat)
2. Legal: créditos, licencias de terceros (three.js MIT), EULA si aplica
3. Firma de código (presupuestar certificado o aceptar SmartScreen "Unknown Publisher")
4. Demo para festivales como último empujón de wishlists

## Post-lanzamiento (del gap-analysis vs Megabonk; NO bloquean v1)

- **Economía dual**: moneda in-run (tienda a mitad de run) + moneda meta que compra los desbloqueos de contratos — el par oro/plata de Megabonk.
- **Estaciones de carga** (shrines): interactuables de mapa con boosts temporales, para el mapa 2 en adelante.
- Mapas 2 y 3 con sus bosses propios (arco visual en DIRECCION_ARTE.md), evolución de armas (Spark Plug + Oil → Inferno Refinery), más personajes.

## Referencias de mercado

- Megabonk: $9.99, 2.6M copias — el techo del género en 3D
- Vampire Survivors: $4.99 — el ancla psicológica del impulse-buy
- Voltswarm entra por debajo del techo, al precio del ancla, con roadmap de mapas/personajes como motor de updates
