# Voltswarm — Prompts de generación de imágenes (IA)

Fecha: 2026-07-04. Se genera ANTES de arrancar la Fase 1 visual del roadmap, para tener el pipeline de assets listo cuando empiece el trabajo de bloom/sombras/modelos. Todo prompt hereda la paleta y reglas de `DIRECCION_ARTE.md` — no se inventa estilo nuevo aquí, se traduce a instrucciones concretas.

## Regla de consistencia (NO NEGOCIABLE)

**Toda imagen generada para este juego es VOXEL. Sin excepción.** Icono, logo, icono de arma, icono de stat, ornamento de carta, prop de escenario: todos deben mostrar geometría cúbica/voxel visible, no solo "flat colors" o "vector limpio". "Plano y saturado" describe la paleta, no reemplaza la construcción voxel — un icono vectorial plano sin cubos rompe la coherencia con los modelos 3D del juego aunque use los mismos colores.

Por eso la palabra **`voxel`** (o `built from cubic voxel blocks` / `blocky cubic construction`) va SIEMPRE explícita en cada prompt de este documento, nunca sobreentendida por el prompt base. Si al redactar un prompt nuevo la palabra "voxel" no aparece en el texto, el prompt está incompleto — corregirlo antes de usarlo.

Todo prompt de este documento debe mantener la MISMA estructura de base para que las imágenes generadas en sesiones distintas sigan siendo del mismo juego:

```
[sujeto], voxel/blocky cubic construction, industrial toy aesthetic, flat saturated colors,
painted machinery look, no textures, dark gray joints, [color de acento] accent,
visible cube/block edges, game asset, isolated on [fondo]
```

Negative/evitar siempre: fotorrealismo, óxido sucio, texturas de ruido, sombras duras realistas, gradientes complejos, sangre/gore, **superficies curvas suaves o vectoriales sin geometría de bloques (rompe la coherencia con los modelos 3D del juego)**.

**Regla de construcción multi-bloque (2026-07-06, lección del prop de contenedor)**: decir "voxel" en el prompt NO BASTA — hay que describir explícitamente que la superficie ENTERA está construida de muchos bloques/cubos individuales VISIBLES, cada uno de un color plano, con caras vecinas en tonos ligeramente distintos (cara superior más clara, cara lateral más oscura — sigue siendo color PLANO por cara, no degradado) para que el objeto se lea como un conjunto de cubos ensamblados (estilo Lego/Minecraft), en vez de una ilustración vectorial plana con un patrón impreso encima. El primer intento del prop de contenedor salió como icono vectorial liso (sin bloques visibles) hasta que el prompt referenció EXPLÍCITAMENTE `public/assets/2d/icon-weapon-press-v2.png` y `icon-weapon-tire.png` pidiendo "study exactly HOW their surfaces are constructed: built from many small individual visible cubic blocks/segments... every ridge, panel, and edge is its OWN distinct visible cube with a clear outline/seam". Usar SIEMPRE 1-2 iconos de arma ya aprobados como referencia de estilo en el prompt (no solo el icono de la app o una referencia de personaje) cuando se genere cualquier prop u objeto nuevo — es la referencia que mejor demuestra esta técnica.

---

## 1. Icono de la aplicación (blocker de lanzamiento)

Necesario: `.ico` multi-resolución (16/32/48/256px) para `build.win.icon` y `BrowserWindow`. Debe leerse incluso a 16px (favicon/taskbar).

Estado: ✅ **CERRADO (2026-07-05)** — `public/assets/2d/app-icon-test.png` aprobado por el usuario como icono FINAL del juego (además de ancla de estilo de todo el arte de personajes). Convertido a `build/icon.ico` multi-resolución (16→256) + `build/icon.png` con `tools/make-app-icon.mjs` (regenerable con cualquier PNG fuente).

- **Prompt principal**: `Voltswarm game icon, a squat square voxel robot head (Voltling enemy design) front-facing, blocky cubic construction with visible voxel edges, yellow #ffb400 body, dark gray #232830 joints, cyan #7ee0ff glowing eye visor, flat colors, centered, simple bold silhouette readable at tiny size, square icon format, dark background #151a22`
- **Variante alterna** (si el robot no lee bien a 16px): usar solo el visor cian sobre un fragmento de chatarra amarilla como icono más abstracto — `a single glowing cyan eye visor on a voxel yellow scrap block, blocky cubic geometry, minimal geometric icon, square format`

## 2. Logo / wordmark del juego — ✅ CERRADO (2026-07-05)

**Aprobado**: `public/assets/2d/logo-voltswarm-v3.png` — amarillo `#ffb400` primario (mismo peso cromático que el icono), acentos cian y remaches oscuros, transparencia alpha real verificada (76%).

Historial de iteración (por si hace falta repetir el proceso con otro asset):
- v1 (`logo-voltswarm.png`): estilo aprobado, pero sin transparencia real (fondo negro sólido pese al prompt).
- v2 (`logo-voltswarm-v2.png`): recoloreado a cian primario para evitar choque con el icono amarillo — el usuario lo rechazó por sentirse "plano y fuera de la línea de arte".
- **v3 (final)**: mismo amarillo que v1, con transparencia real pedida explícitamente ("TRUE alpha transparency... verify zero background color"). Coexiste con el icono por COMPOSICIÓN (separación espacial), no por color — así se resuelve en la mayoría de cápsulas de Steam.

**Lección de proceso**: verificar SIEMPRE el alpha real de un PNG con `tools/check-alpha.mjs` antes de dar un asset por bueno — el modelo puede ignorar la instrucción de fondo transparente y rellenar con color sólido aunque el PNG tenga canal alpha (color type RGBA) presente pero opaco. Si falla, `tools/remove-background.mjs` quita un fondo plano por color-key con borde suavizado (usado para reparar `app-icon-test.png` → `app-icon-test-transparent.png`, que ahora coexisten: original opaco para el `.ico`, versión transparente para marketing/composiciones).

## 3. Iconos de armas — ✅ LAS 11 CERRADAS Y CABLEADAS EN EL JUEGO (2026-07-05)

Las 11 armas del draft tienen icono aprobado y están wireadas en `src/hud.ts` (`WEAPON_ICON_IMAGES`, panel de build izquierdo), reemplazando el placeholder de emoji uno por uno según se aprobaba cada cual — verificado en vivo a 120 FPS con `tools/capture-ingame.mjs`. Archivos finales en `public/assets/2d/icon-weapon-*.png` (ver tabla de abajo por el nombre exacto de cada archivo, incluye sufijo `-v2`/`-v3` en las que necesitaron iteración).

**Pendiente único, no bloqueante**: **Junk Ricochet** — el icono v3 (chatarra + zigzag morado `#c060ff`) se aprobó para seguir avanzando, pero el usuario no queda convencido de que el concepto de icono case con cómo se ve/lee la habilidad IN-GAME (el rebote real entre enemigos). Revisar cuando se haga el pase de VFX de combate (`ROADMAP_STEAM.md`, punto 1 del checklist de captura): puede que haya que rehacer el VFX del rebote, el icono, o ambos, para que se entiendan como la misma cosa.

Uno por arma, mismo prompt base, cambiando sujeto y color de acento por arma. Grid/padding uniforme, fondo transparente, 128×128 fuente.

**Regla de silueta única (2026-07-05)**: antes de aprobar un icono, compararlo contra los ya aprobados — dos armas con siluetas parecidas (p. ej. "aspas girando" para Turbine Fan vs la sierra de Orbital Blades) se confunden de un vistazo en el panel. Si colisiona, cambiar la FORMA del sujeto, no solo el color (ver caso Turbine Fan: pinwheel → tornado cónico).

**Regla de contraste de HUD (2026-07-05)**: cada icono se prueba SIEMPRE en la fila real del panel (`tools/lockup-preview.html` con las clases `.build-row`/`.build-icon-img` reales) antes de aprobar — un dibujo que se ve bien a tamaño completo puede desaparecer a 32px si su acento es demasiado oscuro para el chip de fondo (caso Oil Sprayer: acento casi negro sobre chip oscuro = invisible; solución, etiqueta de color vivo). El chip de fondo del icono vive en `.build-icon-img` (`src/ui.css`) — actualmente `#444e5e`.

| Arma | Sujeto del icono | Acento | Archivo final |
| --- | --- | --- | --- |
| Bolt Cannon ✅ | cañón corto de perno, boca amarilla brillante | `#ffe066` | `icon-weapon-bolt.png` |
| Volt Pulse ✅ | anillo de onda expansiva concéntrico | `#7ee0ff` | `icon-weapon-pulse.png` |
| Orbital Blades ✅ | hoja de sierra orbitando un punto central | `#c9d4de` | `icon-weapon-blades.png` |
| Arc Welder ✅ | electrodo de soldar de perfil (misma pose que Bolt Cannon) con chispa de arco cian en zigzag | `#9fe8ff` | `icon-weapon-welder-v2.png` |
| Hydraulic Press ✅ | bloque de maquinaria con franjas de peligro + brazo de pistón rematado en placa plana de aplastar (NO punta de cañón) | `#ff5f33` naranja-rojo (el ámbar `#ffc44d` original chocaba con el amarillo de Bolt Cannon) | `icon-weapon-press-v2.png` |
| Tire Fire ✅ | neumático envuelto en llamas estilizadas | `#ff7733` | `icon-weapon-tire.png` |
| Oil Sprayer ✅ | bidón de aceite goteando con etiqueta de peligro amarilla (el acento casi negro original era invisible en el HUD) | `#ffd24a` etiqueta + `#1a1522` gotas | `icon-weapon-oil-v2.png` |
| Acid Drum ✅ (renombrada de "Acid Flask" 2026-07-05 — el frasco de cristal redondo leía como poción medieval, rompía con la estética industrial/futurista; regenerado como bidón con calavera y tibias cruzadas, símbolo de peligro más reconocible que el original de "mano derritiéndose") | bidón industrial con etiqueta de calavera y tibias cruzadas en verde, un par de gotas junto a la tapa | `#52e858` | `icon-weapon-acid-drum.png` (histórico: `icon-weapon-acid.png` = v1 frasco descartado, `icon-weapon-corrosive-drum.png` = intento con símbolo de mano derritiéndose, `icon-weapon-corrosive-drum-v2.png` = origen del archivo final) |
| Turbine Fan ✅ | tornado/remolino cónico con chatarra atrapada dentro (NO aspas de pinwheel — colisiona en silueta con Orbital Blades; el tornado además es más fiel al efecto real del arma) | `#cfe8f0` | `icon-weapon-turbine-v2.png` |
| Junk Ricochet ✅ (revisar coherencia con VFX in-game, ver nota arriba) | UN trozo de chatarra grande y sólido (mismo peso visual que Acid Drum/Tire Fire, no piezas pequeñas dispersas) con un zigzag de energía GRUESO cruzándolo, marcando el rebote | `#c060ff` morado eléctrico (el `#b9c8d4` original casi se solapaba con Orbital Blades y Turbine, tres grises azulados compitiendo) | `icon-weapon-ricochet-v3.png` |
| Dismantler ✅ | garra mecánica abierta con marcas de zarpazo diagonales | `#ffd24a` | `icon-weapon-dismantler.png` |
| Dismantler | garra mecánica abierta, marcas de zarpazo | `#ffd24a` |

Prompt tipo (Bolt Cannon): `weapon icon: a short stubby bolt cannon barrel, voxel/blocky cubic construction with visible block edges, glowing yellow #ffe066 muzzle, industrial toy aesthetic, flat saturated colors, dark gray #232830 body, centered, transparent background, 128x128 game UI icon` — para el resto de armas de la tabla, sustituir sujeto y acento manteniendo intacto el resto del prompt (voxel + fondo transparente + 128×128).

## 4. Iconos de stats (panel de build — 15 stats + rareza de cartas)

Ya tienen emoji provisional en `src/hud.ts` (💥⚡🎯💢👟📏🧲🔩🚀⭕🛡️❤️🍀📖💀). Reemplazo 1:1 por versión propia, mismo prompt base, mismo grid que los iconos de armas para que convivan en el panel.

- **Prompt tipo** (Damage): `stat icon: a stylized impact burst / explosion symbol, built from voxel/blocky cubic shapes, yellow-orange #ffb400 flat colors, industrial toy aesthetic, visible block edges, centered, transparent background, 64x64 game UI icon, matches the weapon-icon set style`
- Repetir para: Attack Speed (rayo), Crit (mira/diana), Crit Damage (puño impactando), Move Speed (huella con líneas de velocidad), Range (regla/compás), Pickup (imán en herradura), Projectiles (racimo de pernos), Proj Speed (cohete), Area (círculo expandiéndose), Armor (placa/escudo), Regen (corazón mecánico con engranaje), Evasion (silueta fantasma), Thorns (púas), Shield (núcleo hexagonal brillante), Lifesteal (gota con circuito), Duration (reloj de arena), Luck (trébol de tuercas), XP Gain (libro/chip de datos), Cursed (cráneo de robot) — en todos, mantener `built from voxel/blocky cubic shapes` en el prompt.

## 5. Rareza de cartas (marco visual, no solo borde de color)

Las cartas de level-up hoy distinguen rareza solo por color de borde (`ui.css`). Añadir un ornamento de esquina generado:

- **Común**: `simple corner rivet decoration made of voxel cubic blocks, gray metal, minimal`
- **Rara**: `corner rivet decoration made of voxel cubic blocks with small cyan glowing accent, slightly ornate`
- **Épica**: `corner decoration made of voxel cubic blocks with purple energy glow, engraved geometric pattern, premium feel` — mismo prompt base + `card corner ornament, blocky voxel construction, transparent background, matches industrial toy aesthetic`

## 6. Modelos 3D de personajes — pipeline 2D→3D (actualizado 2026-07-06: referencia de 3 vistas)

Los modelos 3D NO se generan directamente: se genera una hoja de referencia por personaje y `src/models/icon-voxelizer.ts` la convierte en voxels automáticamente (detalle del pipeline en `DIRECCION_ARTE.md`). Ya validado: Voltling, Sparkrunner, Rustbrute, Roller, Gunner, Drone, Crusher King, Tesla Titan, Volt Warden y el jugador (todos con referencia FRONTAL únicamente, técnica previa a esta actualización).

**REGLA NUEVA (2026-07-06): a partir de ahora, generar SIEMPRE 3 vistas por personaje — frontal, lateral y trasera —, no solo frontal.** Motivo: el boss final de prueba (`final-boss` en `registry.ts`, ref `ref-volt-warden-front.png` sin `-v2`) se ve bien de frente pero es una masa lisa sin detalle de lado y de espaldas — la técnica de extrusión algorítmica (segments/depthFactor) solo puede ADIVINAR la profundidad real sin una vista lateral que la confirme. Con las 3 vistas, la lateral fija el perfil de profundidad real (en vez de la aproximación elíptica actual) y la trasera evita que la espalda quede en blanco o repita la cara.

**Prompt maestro** (uno por vista, mismo personaje y paleta en las 3; sustituir `[PERSONAJE]`, colores y `[VISTA]` por `FRONT-FACING` / `SIDE-FACING (profile, 90°)` / `BACK-FACING`):

```
[PERSONAJE + rasgos], STRICT [VISTA] ORTHOGRAPHIC VIEW designed for direct 3D voxel
conversion. HARD constraints: ONE SINGLE CONTIGUOUS SILHOUETTE — every part physically
attached, zero floating pieces, zero background gaps inside the body; BOLD SIMPLE SHAPES,
minimal interior detail; perfectly symmetrical (front-to-back or top-to-bottom as the view
requires); flat solid colors only — no gradients, no shading, no outlines; blocky square
voxel construction; exact palette [colores hex], TRANSPARENT background — no background
color at all, only the character's voxel colors (save as PNG with alpha). Square 1024x1024.
```

Guardar como `public/assets/2d/ref-<nombre>-front.png` / `-side.png` / `-back.png` — en `public/` SIEMPRE, porque Vite solo copia esa carpeta a la build de producción (lección 2026-07-05: refs fuera de `public/` = modelos que funcionan en dev y desaparecen en el ejecutable). Nunca sobreescribir refs aprobadas; iterar con sufijo `-v2`, `-v3`. Después: entrada en `src/models/registry.ts` y revisión con `tools/capture-model-preview.mjs` (capturar desde varios ángulos con el parámetro `angle` del visor — ver §"Historial" abajo).

**Estado técnico (actualizado 2026-07-06)**: `icon-voxelizer.ts` ya tiene DOS caminos. (1) `voxelizeIcon` — el original de una sola vista frontal con perfil de profundidad elíptico estimado (`Math.sqrt(1 - t²)` + `segments`); sigue siendo el camino de todos los personajes ya aprobados, no se regeneran sin necesidad. (2) `voxelizeMultiView` — NUEVO, talla el volumen con las 3 vistas por intersección de siluetas (visual hull): la frontal define la silueta X/Y y pinta la cara frontal, la lateral define la silueta Z/Y real fila a fila Y pinta los laterales (corrugación, franjas), la trasera pinta la cara de atrás (espejada). Se activa añadiendo `refSide`/`refBack` a la entrada del registry; las opciones de extrusión (`segments`, `depthFactor`, `frontOnly`…) se ignoran en ese camino. Primer modelo con este pipeline: el contenedor (`container`). Convención de la hoja lateral: el FRENTE del objeto queda al lado DERECHO de la imagen; las 3 vistas deben compartir la misma extensión vertical (las filas se alinean por fracción de altura).

**Regla de paleta MEDIDA (obligatoria, 2026-07-06)**: la paleta de todo modelo (`palette`/`bodyColor` en `src/models/registry.ts`) se MIDE de las PNG de referencia, nunca se adivina a ojo — objetivo del usuario: "máximo detalle copiado de las imágenes". Motivo: el voxelizador cuantiza cada píxel al color de paleta más cercano por distancia euclídea RGB; una superficie con rango amplio de luminosidad (las puertas teal del contenedor iban de `rgb(52,121,118)` iluminado a `rgb(18,59,56)` en sombra) no cabe en UNA entrada — los píxeles en sombra caen más cerca de otra familia de color y se colapsan (el verde oscuro se volvió azul-negro porque el teal oscuro quedaba más cerca del `DARK` gris-azul que del único teal claro). Proceso: (1) muestrear las PNG con un canvas headless `getImageData` (los MISMOS píxeles que ve el voxelizador — puppeteer-core está, pngjs NO), bucketizar a 4 bits/canal y ordenar por frecuencia; (2) agrupar los clusters por familia de color y elegir una RAMPA de 2-3 pasos medidos para cualquier superficie con luz/sombra visible, más el tono real de cada material distinto; (3) volcar esos hex como constantes con nombre en `registry.ts` y listarlos en la `palette` del modelo; (4) validar en el visor Y in-game (el bloom + toon cambian la lectura) antes de aprobar. Primer caso: el contenedor (rampa `TEAL_LIGHT`/`TEAL`/`TEAL_DARK` + `CONTAINER_FRAME` gris medido). Lección general: más entradas de paleta en una superficie de luminosidad amplia = las sombras se quedan en la familia de color correcta.

**Regla de fondo (2026-07-04)**: las referencias se generan SIEMPRE con fondo transparente, nunca con color de fondo. El voxelizador identifica el personaje por alpha, que es infalible; con fondo de color, el azul noche `#151a22` y las juntas gris oscuro `#232830` están tan cerca que la cuantización puede confundirlos.

**Regla de grosor (lección del Sparkrunner, 2026-07-04)**: todo rasgo fino — antenas, visores, cañones, rotores — debe medir en la referencia al menos ~1/5 del ancho/alto de su pieza padre, o el downsample a resolución de enjambre (~17-21 columnas) se lo come. Si un rasgo es de silueta (la antena del Sparkrunner), pedirlo CHUNKY explícitamente en el prompt; la solución nunca es subir la resolución de voxelización (paga triángulos para nada).

Sujetos por personaje — **ELENCO COMPLETO 2026-07-05** (todos con ref aprobada + entrada en registry + voxelizados; enemigos y bosses cableados in-game vía `EnemySystem.upgradeVoxelModels`, jugador vía `Player.upgradeVoxelModel`):

- **Voltling** ✅ (`ref-voltling-front.png`): squat wide square robot, big cyan goggle visor, jaw grille, ear pods, tank treads — yellow #ffb400 / dark / cyan #7ee0ff
- **Sparkrunner** ✅ (`ref-sparkrunner-front-v2.png`): tall THIN runner, CHUNKY antenna, amber visor band, long legs, flat feet — cyan #2ee6de / dark / amber #ffd24a
- **Rustbrute** ✅ (`ref-rustbrute-front-v2.png`): extra WIDE crusher, head raised above shoulder line, wide amber visor, thick-bar grille, huge fists, treads — red #ff4433 / dark / amber
- **Roller** ✅ (`ref-roller-front.png`): spherical ball, chunky equator band, one big amber eye (mirrored front+back; `sphericalDepth` + `originAtCenter` + `mirrorBack`) — purple #b069ff / dark / amber
- **Gunner** ✅ (`ref-gunner-front.png`): squat turret, big forward cannon with protruding red muzzle ring (`raisedColors`) — green #7dd94a / dark / red #ff5533 / amber
- **Drone** ✅ (`ref-drone-front.png`): flat wide flyer, THIN rotor blade band (deep rotor caps the roof in dark — camera looks down at flyers), amber eye — pink #ff9de2 / dark / amber
- **Crusher King (boss)** ✅ (`ref-crusher-king-front-v2.png`): brute king, gold crown (full material, NOT frontOnly — silhouette), gold glare visor, toothed jaw, huge fists — red / dark / gold #f2b632
- **Tesla Titan (boss)** ✅ (`ref-tesla-titan-front.png`): tall coil tower, three wrapped bright-cyan ring slabs (bloom emissives), amber visor, orb tip, anchored base — cyan #2ee6de / #7ee0ff / dark / amber
- **Volt Warden (boss nuevo)** ✅ (`ref-volt-warden-front-v2.png`): chibi helmet-head boss, goggle visor, grilles, cyan core, shoulder pads, hover skirt — yellow / dark / cyan. Modelo listo; gameplay pendiente de diseño.
- **Jugador** ✅ (`ref-player-front-v3.png`): scavenger hero, head ~1/3 naranja #ff8c33 con visor oscuro #1c2a38, cuerpo blanco hueso #e8e3d5, mochila de herramientas (two-tone `armorColors`)

Regla de silueta (de `DIRECCION_ARTE.md`): cada personaje se distingue por SILUETA además de color — si dos referencias comparten silueta, se rehace una.

## 7. Props de escenario del Mapa 1 (fábrica abandonada)

**Mapa 1 redefinido 2026-07-06**: ya NO es "scrapyard" puro, es una **fábrica abandonada, industrial con toque futurista** (ver `DIRECCION_ARTE.md`, tabla de mapas). La paleta de props se mantiene (tonos medios apagados, nunca compiten en saturación con los enemigos) pero el SUJETO pasa de chatarra desordenada a maquinaria/infraestructura de fábrica muerta.

**Objetivo doble de estos props**: además de vestir el mapa, deben poder actuar de **chokepoint** — colisión que canalice al enjambre y al jugador hacia embudos puntuales, con densidad **SUTIL** (el enjambre se sigue viendo casi todo el tiempo — el jugador rechazó explícitamente las opciones "moderado" y "denso/táctico").

**Randomización por partida (2026-07-06, pedido explícito del usuario)**: contenedores y bidones YA NO tienen posiciones fijas en código — `world.ts:placeRandomProps` sortea cantidad (`CONTAINER_PROP.countRange` / `BARREL_PROP.countRange`) y posición con `Math.random()` en CADA partida (no solo en cada carga de página): `game.ts:startRun()` llama a `boss.startRun()` primero (coloca el tótem), lee su posición y recién entonces limpia (`clearProps`) y regenera (`placeRandomProps`) el layout, evitando el tótem. `scatterPoints()` (helper en `world.ts`) reparte puntos dentro de un anillo `[minDistFromCenter, maxDistFromCenter]` respetando una `minSeparation` entre ellos y un `AvoidPoint[]` con radio propio por elemento a evitar (reintenta hasta 20 veces por punto): los bidones evitan tanto los gates de contenedores (`containerClearance`) como el tótem (`totemClearance`), y los propios gates de contenedores evitan el tótem. **Cantidad duplicada (mismo pedido)**: mínimos originales [3,5]/[12,22] → ahora [6,9]/[24,36]. Verificado en 3 cargas de página (gates=4/4/5, bidones=15/20/22 con los rangos viejos) Y en 2 partidas dentro de la MISMA sesión sin recargar (jugar→salir al menú→jugar de nuevo): 65 vs 87 obstáculos totales, posiciones distintas — confirma que regenera por partida, no solo por carga de página. Los cofres del boss NO se pueden evitar de antemano (aparecen donde muere el boss, posición que no existe hasta que ocurre en la partida) — es una limitación real, no un olvido. `scatterScrap` (las geometrías primitivas de caja/cono/cilindro que vestían el mapa desde el Día 1) se ELIMINÓ por completo el mismo día, ahora que contenedores + bidones cumplen ese rol con más detalle.

**Distribución por sectores + variantes de color (2026-07-06, mismo pedido, quinta pasada)**: el usuario reportó zonas del mapa vacías y otras cargadas — `scatterPoints` generaba ángulo+distancia totalmente independientes por punto, lo que por pura probabilidad podía dejar cuadrantes enteros sin nada. Arreglado dividiendo el círculo en tantos SECTORES angulares como elementos a colocar (`sectorSize = 2π / count`), uno por sector con ángulo/distancia random DENTRO de su propia porción — garantiza cobertura pareja alrededor de todo el mapa sin dejar de ser aleatorio dentro de cada sector.

**Variantes de color, mismo modelo 3D**: contenedor teal (original) + naranja; bidón mustard (original) + negro + blanco (se descartó azul a propósito — ya aprendimos con el andamio que un azul-gris se pierde contra el piso frío de la fábrica). **Lección técnica clave**: recolorear cambiando los valores hex de la paleta de clasificación NO funciona de forma confiable — el primer intento (contenedor con paleta `[NARANJA_LIGHT, NARANJA, NARANJA_DARK, CONTAINER_FRAME, DARK, BONE]`) salió casi completamente GRIS, sin nada de naranja visible, porque el clasificador elige el color MÁS CERCANO por distancia RGB a los píxeles REALES de la imagen de referencia (que siguen siendo teal) — y el naranja quedaba más lejos numéricamente del teal medido que el gris del marco (`CONTAINER_FRAME`), así que el marco "ganaba" la clasificación en toda la superficie. Mismo problema con el bidón blanco (colapsó casi todo a negro). **Solución correcta**: clasificar con la paleta ORIGINAL sin tocar (mismos colores medidos, misma silueta/sombreado) y aplicar el recoloreo DESPUÉS, sobre la grilla ya clasificada — nuevo campo `recolorMap: Record<sourceHex, targetHex>` en `VoxelModelDef`, aplicado en `registry.ts:buildModelGrid` vía `recolorGrid()`. Las entradas `container-orange`/`barrel-black`/`barrel-white` usan la MISMA `ref`/`palette` que el original + un `recolorMap` que sustituye los 3 tonos del cuerpo. Verificado visualmente (antes/después) y en el juego: ambas variantes de contenedor y al menos una variante de bidón visibles en la misma escena, coloreado correcto, cero errores de consola.

**Sexta pasada, mismo día (2026-07-06)**: el usuario seguía viendo zonas "desérticas" incluso con distribución por sectores, y pidió más cantidad todavía + revisar que las props no coincidan con cofres/tótem. Cantidad subida de nuevo: contenedores `countRange` [6,9]→**[10,14]** gates (`minSeparation` bajado de 22 a 18 para que quepan cómodos en el anillo), bidones [24,36]→**[45,65]**. **Cofres**: a diferencia del tótem (se coloca ANTES de generar las props, así que las props ya lo evitan), el cofre del boss aparece donde MUERE el boss — una posición que no existe hasta que pasa en la partida, imposible de evitar de antemano por las props. En vez de eso, se invirtió el problema: nuevo helper `world.ts:findClearSpot(x, z, obstacles, margin)` empuja el punto candidato del cofre (o del cofre de élite) radialmente lejos de cualquier obstáculo en el que caiga, iterando unas pocas veces por si el empujón lo mete en otro — aplicado en `game.ts:onEnemyDeath` tanto al cofre de élite como a los 3 cofres del boss. Verificado in-game: 120 FPS estables con la cantidad nueva, visiblemente menos huecos en el mapa, cero errores de consola.

### Contenedor industrial — ✅ CERRADO (voxelizado y en juego, 2026-07-06)

`public/assets/2d/prop-container-front-v3.png` / `-side-v3.png` / `-back-v3.png` — un solo contenedor rectangular simple (teal, marco/esquinas oscuro, franja de peligro blanco hueso, NO amarilla). Frontal y trasera son IDÉNTICAS (un contenedor real es simétrico). El "muro" de contenedores se forma poniendo varias instancias de este ÚNICO objeto en `world.ts`, no pidiéndole a la IA que dibuje la composición completa de un muro (ver historial de iteración abajo — por qué).

**Resultado final**: `registry.ts` ganó `kind: 'prop'` y las 3 vistas se voxelizan con `voxelizeMultiView` (talla por intersección de siluetas — real, no adivinado; ver §6 "Estado técnico"). Paleta MEDIDA de las PNG de referencia (rampa `TEAL_LIGHT`/`TEAL`/`TEAL_DARK` + `CONTAINER_FRAME` gris medido — ver regla de paleta medida arriba). Colocado en `world.ts:buildContainerProps` como 3 gates de chokepoint (pares de contenedores con collider capsula-aprox), placeholder primitivo inmediato + swap async al modelo voxel. Aprobado por el usuario in-game 2026-07-06.

**Historial de iteración (lecciones, por si hay que repetirlo con el próximo prop)**:
1. Primer intento: pedir a la IA que dibujara un MURO de 2-3 contenedores inclinados/formando composición → RECHAZADO, las 3 vistas (frontal/lateral/trasera) mostraban composiciones distintas e inconsistentes entre sí (imposible reconstruir un objeto 3D coherente), y encima con textura de óxido sucio con ruido (viola la regla negativa de `DIRECCION_ARTE.md`). Lección: pedir SIEMPRE un objeto simple único para la referencia de voxelización; la composición (varios contenedores formando un muro) se arma en el motor del juego posicionando instancias, nunca en la imagen de referencia.
2. Segundo intento: un solo contenedor simple → mejoró la consistencia entre vistas, pero salió como ilustración vectorial plana sin bloques voxel visibles (no coincidía con el estilo de los iconos de armas) → RECHAZADO. Lección: ver "Regla de construcción multi-bloque" al principio de este documento.
3. Tercer intento: referenciando explícitamente `icon-weapon-press-v2.png`/`icon-weapon-tire.png` y pidiendo bloques individuales con sombreado plano por cara → el estilo quedó correcto, pero (a) el acento era amarillo (competía con enemigos/suelo) y (b) frontal/trasera no eran idénticas (asas y esquinas distintas).
4. v2: corregido el color a blanco hueso y pedida la simetría frontal/trasera exacta → casi perfecto, pero las franjas diagonales formaban una "V" espejada en frontal/trasera mientras que la lateral las tenía todas en una sola dirección — inconsistencia de ángulo entre vistas.
5. **v3 (aprobada, final)**: misma dirección diagonal en las 3 vistas, sin espejado. Lista para voxelizar.

Sujetos restantes por generar (mismo proceso completo de iteración de arriba, uno por uno):
- **Andamio de acero** 🟡 voxelizado pero RETIRADO del mapa por ahora (2026-07-06) — estructura vertical delgada de vigas de acero cruzadas (patrón X repetido), deja ver el enjambre A TRAVÉS de los huecos. Refs: `prop-scaffold-front-v1.png` / `-side-v1.png` / `-back-v2.png` (back es byte-idéntico al front — el propio agente de Codex lo razonó así por simetría estructural, mismo criterio que el contenedor). **Lección técnica importante**: NO usar `voxelizeMultiView` (3 vistas) para este tipo de objeto — ver "Límite de `voxelizeMultiView`" más abajo. Se voxelizó con `voxelizeIcon` de una sola vista (extrusión plana y delgada, `depthFactor: 0.16` + `mirrorBack`), que es lo que preserva los huecos reales. Iteró 2 veces en color/escala (azul→bronce→rojizo óxido, +ancho, +profundidad) pero al usuario "no le gustó nada como queda" tras verlo repetidamente en el juego — decisión: sacarlo del spawn (`config.SCAFFOLD_PROP.enabled = false` en `world.ts`, código y registry intactos por si se retoma) y probar con bidones en su lugar. Lección: cuando una iteración de color/escala no convence tras 2 pasadas, mejor pausar el prop que seguir iterando a ciegas — puede que el problema sea el CONCEPTO (silueta/lugar en el mapa), no el tuning.

**Límite de `voxelizeMultiView` (descubierto 2026-07-06, andamio)**: el carving por 3 vistas SOLO sirve para objetos genuinamente SÓLIDOS en su interior (el contenedor: puertas contra una caja rellena). Para un objeto HUECO cuyas caras llevan cada una su propio patrón independiente (una celosía en X en cada cara, con aire en medio — el andamio), el producto cruzado "cualquier columna rellena de frente" × "cualquier columna rellena de lateral" genera combinaciones fantasma que rellenan el interior, aunque cada vista por separado tenga huecos reales y correctos (verificado con volcado ASCII de las siluetas clasificadas — los huecos SÍ estaban ahí, el bug estaba en cómo se combinaban). Para celosías/estructuras caladas: usar `voxelizeIcon` de una sola vista con `depthFactor` bajo (extrusión delgada tipo placa) — al dibujar geometría solo detrás de un píxel real del frente, nunca puede rellenar un hueco que el frente ya muestra vacío. Detalle técnico completo en el comentario JSDoc de `voxelizeMultiView` en `icon-voxelizer.ts`.
- **Pila de chatarra/maquinaria compuesta y alta** — reemplaza las primitivas actuales, decorativa + bloquea línea de visión en zonas puntuales
- **Esqueleto de grúa/vehículo industrial grande** — landmark vertical, más decorativo que táctico
- **Bidón industrial** ✅ CERRADO (2026-07-06) — bidón sólido y redondeado (a diferencia del andamio hueco), color mustard-oliva `#8a7a3a` de la familia ya establecida, aros oscuros, etiqueta de peligro en tono tostado. Solo referencia FRONTAL (no necesita 3 vistas: es un objeto sólido de sección circular, la extrusión estándar de una vista con `depthFactor` da el perfil redondeado correcto por sí sola, sin el problema de huecos fantasma del andamio). Registrado como `barrel` en `registry.ts`, colocado vía `world.ts:buildBarrelProps` — 8 instancias puramente decorativas, SIN collider (a diferencia de contenedor/andamio).
- Piezas de motor sueltas (aún por generar) para relleno visual

- **Prompt tipo actualizado**: `industrial toy aesthetic factory prop, [pieza SIMPLE, un solo objeto], built from many individual visible cubic voxel blocks with flat per-face shading (lighter top faces, darker side faces — still flat colors, no gradients), matching the exact construction style of icon-weapon-press-v2.png and icon-weapon-tire.png, flat muted mid-tone colors [mostard/teal/mauve #8a7a3a #3f6e6a #7a5560 — evitar amarillo, reservado para enemigos/suelo], no rust/dirt/noise texture, game environment asset` + generar en 3 vistas (frontal/lateral/trasera, regla de la sección 6) + verificar simetría frontal=trasera + verificar que las franjas/patrones diagonales usen la MISMA dirección en las 3 vistas.

## 7b. Suelos/ambientes (nueva categoría, validada 2026-07-06)

A diferencia de personajes/props, el suelo NO se voxeliza — se usa DIRECTAMENTE como textura 2D fotografiada en vista CENITAL (top-down estricta), sin personajes ni props en la imagen, repetida en mosaico sobre el plano del suelo (`THREE.RepeatWrapping`).

- **Prompt tipo** (usado y aprobado para el suelo de fábrica del Mapa 1): `[ambiente], STRICT TOP-DOWN VIEW (camera looking straight down, zero perspective), floor texture for a video game level, [detalles de paneles/desgaste/marcas], blocky voxel-cube texture language matching the game's 3D models, flat saturated colors, no gradients, no realistic shading. Absolutely NO characters, NO props, NO 3D objects — ONLY the floor material, edge-to-edge, tileable-looking.` Ver el prompt completo usado para `ground-factory-floor.png` en el historial de git/memoria si hace falta repetirlo.
- **Aprobado para Mapa 1**: `public/assets/2d/ground-factory-floor.png` — planchas metálicas frías con remaches voxel, costuras de conducto cian apagadas (fábrica muerta, sin brillo), franjas de peligro amarillas/negras dispersas. Cableado en `src/world.ts` (`upgradeGroundTexture`, carga async con fallback al suelo procedural anterior si falla) + `config.VISUAL.ground.aiTextureUrl`/`worldSizePerRepeat` (repetición en mosaico; **18** aprobado tras probar 9 — el jugador lo sintió repetitivo/"papel pintado").
- **Lección de consistencia de material**: el suelo usa `litMaterial()` (la fábrica de `src/toon.ts`), NO `MeshLambertMaterial` en crudo — si el suelo no comparte el material toon con bots/jugador/props, puede desentonar visualmente aunque la textura en sí sea correcta.
- **Intento descartado**: generar el suelo por CÓDIGO (canvas procedural con remaches/franjas/conductos dibujados a mano) — el usuario lo rechazó ("no me gusta nada"), prefirió generarlo con el mismo pipeline de IA que los personajes. La lección: para texturas de ambiente, el resultado de IA con referencia de estilo (icono + un personaje ya aprobado) superó claramente al intento hecho a mano.

## 8. Marketing (Fase 1 → sesión de captura del roadmap)

**Única excepción consciente a la regla voxel, y solo parcial**: el key art de marketing puede añadir iluminación atmosférica y profundidad (rim light, niebla) que el motor del juego no renderiza, PERO los personajes y robots representados deben seguir siendo reconociblemente voxel/cúbicos — nunca reemplazar la geometría por un robot orgánico o fotorrealista. Regla práctica: si alguien compara el key art con una captura real del juego, el robot debe verse como el MISMO robot, solo mejor iluminado.

Preferencia por defecto: usar capturas reales del motor (con el pase de bloom/sombras ya aplicado) en vez de estas ilustraciones siempre que sea posible — son más honestas con el comprador y ya están en la sesión de captura de la Fase 1. Usar key art ilustrado solo si Steam pide una pieza que el motor no puede producir (p. ej. la cápsula principal con composición imposible en cámara top-down).

- **Cápsula/key art**: `key art illustration, the player voxel robot character (blocky cubic construction, visible block edges) surrounded by a swarm of small yellow voxel Volt robots at night in an industrial scrapyard, dramatic rim lighting in cyan and amber, industrial toy aesthetic, voxel geometry preserved throughout — only lighting and atmosphere add extra depth, wide 16:9 composition, logo space at top`
- **Fondo de comunidad Steam**: mismo prompt, composición vertical, espacio negativo para texto

## Orden de ejecución sugerido

1. Icono final de la app (candidato fuerte ya generado: `assets/2d/app-icon-test.png`; falta convertir a `.ico`)
2. Referencias frontales de los 5 enemigos restantes + 2 bosses + jugador → voxelización vía registry (§6; Voltling y Volt Warden ya hechos)
3. Logo + key art (necesarios para la página de Steam ya en Fase 2)
4. Iconos de armas y stats (pulen el HUD, no bloquean nada)
5. Props de escenario y ornamentos de rareza (última milla, coinciden con Fase 5 de contenido)
