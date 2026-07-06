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

## 6. Modelos 3D de personajes — pipeline 2D→3D (CONGELADO 2026-07-04)

Los modelos 3D NO se generan directamente: se genera una **hoja de referencia frontal plana** por personaje y `src/models/icon-voxelizer.ts` la convierte en voxels automáticamente (detalle del pipeline en `DIRECCION_ARTE.md`). Ya validado: Voltling (in-game) y el boss nuevo Volt Warden.

**Prompt maestro de referencia frontal** (sustituir `[PERSONAJE]` y colores; las restricciones en mayúsculas son las que hacen o rompen la voxelización):

```
[PERSONAJE + rasgos], STRICT FRONT-FACING ORTHOGRAPHIC VIEW designed for direct 3D voxel
conversion. HARD constraints: ONE SINGLE CONTIGUOUS SILHOUETTE — every part physically
attached, zero floating pieces, zero background gaps inside the body; BOLD SIMPLE SHAPES,
minimal interior detail; perfectly symmetrical; flat solid colors only — no gradients, no
shading, no outlines; blocky square voxel construction; exact palette [colores hex],
TRANSPARENT background — no background color at all, only the character's voxel colors
(save as PNG with alpha). Square 1024x1024.
```

**Regla de fondo (2026-07-04)**: las referencias se generan SIEMPRE con fondo transparente, nunca con color de fondo. El voxelizador identifica el personaje por alpha, que es infalible; con fondo de color, el azul noche `#151a22` y las juntas gris oscuro `#232830` están tan cerca que la cuantización puede confundirlos. (Las refs aprobadas antes de esta regla — Voltling, Sparkrunner, Warden, jugador — se quedan como están; funcionan.)

Guardar como `public/assets/2d/ref-<nombre>-front.png` — en `public/` SIEMPRE, porque Vite solo copia esa carpeta a la build de producción (lección 2026-07-05: refs fuera de `public/` = modelos que funcionan en dev y desaparecen en el ejecutable). Nunca sobreescribir refs aprobadas; iterar con sufijo `-v2`, `-v3`. Después: entrada en `src/models/registry.ts` y revisión con `tools/capture-model-preview.mjs`.

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

## 7. Props de escenario (mapa 1 — variantes para romper la semilla fija)

Para cuando se implemente la semilla de layout aleatoria (Fase 5 del roadmap): más variedad de props que hoy son primitivas (`src/world.ts:scatterScrap`).

- **Prompt tipo**: `industrial toy aesthetic scrap prop, [pieza], built from voxel/blocky cubic blocks with visible edges, flat muted mid-tone colors [mostard/teal/mauve #8a7a3a #3f6e6a #7a5560], no textures, game environment asset, isolated`
- Sujetos: contenedor de chatarra volcado, tanque cilíndrico oxidado-pero-pintado, grúa desmontada, pila de piezas de motor, cono de tráfico gigante industrial, torre de neumáticos apilados

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
