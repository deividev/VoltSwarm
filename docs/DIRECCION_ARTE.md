# Voltswarm — Dirección de arte: "Juguete industrial"

Decisión del 2026-07-02: mantenemos la ambientación scrapyard pero la dirección de arte pasa de "óxido realista" a **juguete industrial** — robots de metal pintado con colores saturados, tipo maquinaria de obra, sobre un suelo oscuro neutro. Dibujo animado, no Mad Max.

## El mundo es futurista; el scrapyard es el primer mapa

## Contrato visual de UI para todo personaje jugable

La incorporación exige `modelKey` validado y frontal/lateral/trasera planas aprobadas. La frontal transparente usa tile `#444e5e` y borde `#2b3340`; la tarjeta conserva retrato, nombre, estado y selección cian. `Unlocked` es el estado abierto; el cerrado muestra `Locked` + `assets/2d/icon-ui-lock-v2.png`, sin emoji ni otro candado. El detalle usa iconos existentes, distintos y veraces por stat, con magnitudes desde config/`CharacterDef`, firma, Recommended Weapon solo visual, tradeoff y Contract/progreso. Menú/pre-run comparten renderer, `data-character-*`, navegación teclado/gamepad y Confirm; la UI no muestra preview 3D. Field Engineer satisface el contrato con `ref-field-engineer-front-v1.png`.

**Alcance de variante:** la Steam Demo contiene solo Scrapyard / Mapa 1 y no transiciona a otro mapa. El juego completo, fuera de la demo, continúa en Mapa 2 **Swarm Foundry** y culmina contra **Hazard Marshal**; ese arco/finale ya es jugable, pero su combate actual sigue provisional. Volt Warden queda como diseño histórico/futuro.

Decisión del 2026-07-03 (usuario): el juego es de estética FUTURISTA — todos los enemigos son robots — y el scrapyard no es la identidad del juego sino su **primer escenario**: el desguace donde van a morir los robots (junkpunk). La progresión de mapas es también la progresión estética hacia lo futurista puro:

| Mapa | Escenario | Lenguaje visual |
| --- | --- | --- |
| 1 | **Fábrica abandonada** (redefinido 2026-07-06, antes "scrapyard") | Industrial con TOQUE futurista: planchas metálicas oscuras, remaches, franjas de peligro amarillas/negras, líneas de conducto cian tenues (apagadas, sin energía activa — es una fábrica MUERTA, no una en marcha) |
| 2 | **Swarm Foundry** | Fundición/fábrica activa: maquinaria encendida, cintas en marcha, brillos de calor y conductos cian iluminados; arena del Hazard Marshal del juego completo |
| 3 | Futuro / no comprometido | Ciudad neón / estación orbital: emisivos, holografía, futurismo puro |

Regla: cada mapa nuevo se ve MÁS "futuro" que el anterior — empezás en la fábrica apagada del mundo y peleás hacia la fuente que fabrica a los robots. Las armas-herramienta (Press, Welder, Tire) viajan con el jugador y mantienen su identidad de desguace en cualquier mapa.

El juego completo usa 2 mapas: Mapa 1 Scrapyard y Mapa 2 Swarm Foundry con Hazard Marshal. La demo pública queda congelada en Mapa 1.

## Por qué

1. **Legibilidad**: un bullet heaven se lee en un vistazo con 300 entidades en pantalla. Los colores saturados sobre suelo neutro separan enemigo / suelo / proyectil al instante. El marrón-óxido de baja saturación no.
2. **Marketing**: la señal se mide con un GIF de 3 segundos en un feed. El color viaja; el marrón no.
3. **Pipeline IA + voxel**: un robot es geometría cúbica por naturaleza — el sujeto más fácil y consistente de generar en voxel con IA. "Voxel robot, 3 flat colors" da resultados coherentes entre sí; "chatarra oxidada" da ruido marrón.
4. **Rating**: robots = sin sangre, y el "por qué hay 400 enemigos" se explica solo.

## Paleta

| Rol | Color | Hex |
| --- | --- | --- |
| Suelo | Pizarra neutra | `#30363f` |
| Fondo/niebla | Azul noche | `#151a22` |
| Voltling (enemigo básico) | Amarillo excavadora | `#ffb400` |
| Sparkrunner (enemigo veloz) | Cian eléctrico | `#2ee6de` |
| Rustbrute (tanque) | Rojo señal | `#ff4433` |
| Juntas/orugas de todos los bots | Gris oscuro | `#232830` |
| Ojos/visores | Cian `#7ee0ff` o ámbar `#ffd24a` |
| Jugador | Blanco hueso + amarillo | `#e8e3d5` / `#f2b632` |
| Cofres y recompensas | Dorado | `#f2b632` / `#ffd76a` |
| Props del escenario | Tonos medios apagados (mostaza, teal, malva) | `#8a7a3a` `#3f6e6a` `#7a5560` `#5a6a7e` `#6e7a52` |

## Reglas (no negociables)

1. **Cada tipo de enemigo se distingue por SILUETA además de por color.** Un daltónico debe poder leer la pantalla. Voltling = bajo y cuadrado; Sparkrunner = alto y fino con antena; Rustbrute = ancho con hombros. Todo enemigo nuevo necesita su propia silueta.
2. **Los enemigos son lo más saturado de la pantalla.** Props y suelo siempre en tonos medios/apagados. Si un prop compite en color con un enemigo, el prop pierde.
3. **Color plano, sin texturas.** La identidad visual es geometría + paleta. Máximo ~3 colores por modelo (primario + oscuro de juntas + acento de ojo).
4. **El ojo/visor siempre mira al frente (+Z del modelo).** Es lo que hace que el enjambre se sienta vivo: todos te miran.
5. **Rendimiento primero**: cada tipo de enemigo = 1 `InstancedMesh` (geometría voxel fusionada con colores por vértice, tinte por instancia para el flash de daño). Presupuesto: 3-6 draw calls para todo el enjambre.

## Pipeline de modelos voxel (CONGELADO 2026-07-04, actualizado 2026-07-06: referencia de 3 vistas)

El pipeline es **2D → 3D en dos pasos**. La calidad del modelo la decide la referencia 2D: una ilustración con perspectiva o sombreado se voxeliza en papilla; una vista plana y contigua se voxeliza con fidelidad.

1. **Referencia 2D — AHORA 3 VISTAS** (regla nueva 2026-07-06): frontal, lateral y trasera, todas ortográficas planas, generadas con gpt-image (prompt maestro en `PROMPTS_IMAGENES.md` §6) → `assets/2d/ref-<nombre>-front.png` / `-side.png` / `-back.png`. Motivo del cambio: con solo referencia frontal, la extrusión algorítmica ADIVINA la profundidad (perfil elíptico) — funciona bien para siluetas simples pero el boss final de prueba salió como una masa lisa de lado/atrás porque nunca hubo un dato real de esa profundidad. Restricciones DURAS del prompt (las 3 vistas): silueta única contigua (cero piezas flotantes), simetría perfecta, cero perspectiva/sombreado/gradientes/outlines, formas grandes simples, paleta exacta en hex. **Estado técnico actual (2026-07-06)**: `icon-voxelizer.ts` ya lee las 3 vistas programáticamente vía `voxelizeMultiView` (visual hull: frontal = silueta X/Y + cara frontal, lateral = silueta Z/Y real + caras laterales, trasera = cara trasera espejada), activado con `refSide`/`refBack` en el registry — estrenado con el prop contenedor. Los personajes existentes siguen en el camino original de una vista (`voxelizeIcon` con `depthFactor`/`segments`); migrar cada uno solo si su lateral real lo justifica.
2. **Voxelización**: entrada en `src/models/registry.ts` (ref + paleta + `armorColors` — qué colores son casco vs detalle, clave en personajes bicolor como el jugador — + resolución + bandas de extrusión) → `src/models/icon-voxelizer.ts` la convierte automáticamente (cuantización a paleta → simetrizado → extrusión por segmentos con relieve: visor hundido, rejillas encajadas, vents de cresta orgullosos). `EnemySystem` intercambia la geometría de cualquier tipo cuyo nombre (kebab-case) tenga entrada en el registro — bosses incluidos; sin entrada, se quedan las primitivas.

**Ampliaciones del voxelizador (2026-07-31, ambas opt-in — ningún modelo existente cambia):**

- **`sidePaint`** (`icon-voxelizer.ts`): en el camino de perfil medido (`sideProfileRef`), la hoja lateral se consumía SOLO para calcular la profundidad por fila y sus píxeles se tiraban — por eso cada flanco vestía el color que hubiera en el borde de la silueta FRONTAL, estirado hacia atrás por toda la profundidad, y 90°/270° era siempre el ángulo más flojo. Con `sidePaint` esas caras se repintan con lo que la lateral muestra ahí. La clave es que el flanco es exactamente el X mínimo/máximo de cada `(y, z)`, así que **pinta dato real sin poder tocar la silueta**. Es la diferencia con migrar a `voxelizeMultiView`, que también da color lateral verdadero pero talla el hull como producto cruzado de dos siluetas: probado en el boss del Mapa 2, **fusionó los guanteletes al torso** (la misma razón por la que el `foreman` nunca migró) y se descartó.
- **`recolorRegions`** (`registry.ts`): recoloreado post-clasificación como `recolorMap`, pero acotado a una banda de altura, con `from`/`to` en fracciones **desde arriba** (la convención de `segments`) mientras la Y de la malla va de abajo arriba. Permite que un modelo lleve dos esquemas de color a la vez — se estrenó dándole al boss del Mapa 2 el cuerpo del elenco y el casco de la marca.

**Tercera vía para conseguir hojas de conversión (2026-07-31): derivarlas de un render iluminado por código** (`tools/make-hazard-marshal-sheets.mjs`). Receta y las dos trampas que la hunden — la tolerancia del keying y la ausencia de retícula en un render en perspectiva — en `PROMPTS_IMAGENES.md` §6.

**Suelos/ambientes son un pipeline DISTINTO** (nuevo 2026-07-06, ver `PROMPTS_IMAGENES.md` §7b): no se voxelizan, se generan como textura 2D vista cenital (top-down estricta, sin personajes/props en la imagen) y se usan directamente como textura repetida en mosaico sobre el plano del suelo.

Reglas de presupuesto y validación:

- **La métrica es TRIÁNGULOS por instancia, no voxels** (el builder fusiona tramos y extrae solo la cáscara). Orientación: enemigos de enjambre ~3-6k tris (`targetWidth` 17-21); bosses/jugador sin límite práctico (`targetWidth` ~41, solo 1-2 instancias).
- Revisión SIEMPRE con `node tools/capture-model-preview.mjs <clave>` (luz/fondo del juego real) y después in-game (`node tools/capture-ingame.mjs`).
- El guardarraíl no cambia: todo modelo nuevo se valida con el enjambre al máximo (400+) antes de darse por definitivo.
- La cámara es top-down: el TECHO del modelo es la superficie más visible. Si un personaje necesita más lectura cenital, el detalle va en el techo de su referencia (vents, paneles), no en más resolución.

## Extensión de la dirección a VFX y audio (regla transversal)

Todo lo que se añada — efectos, partículas, sonido — habla el idioma "juguete industrial":

- **VFX**: las partículas son CUBOS voxel del color de paleta de su dueño (muerte = voxel burst del color del bot; chispas = cubos ámbar/cian). Nada de billboards suaves, humo realista ni glow orgánico. Los emisivos (visores, beams, orbes) son la única fuente de "brillo" y se potencian con bloom — plan en `REFERENCIAS_VISUALES.md`.
- **Audio**: sonidos MECÁNICOS de juguete/maquinaria — clanks metálicos cortos, servos, zumbidos eléctricos, chirps sintéticos. Cero gore (los enemigos son robots: mueren en "clank + burst", no en splat). La música sigue el arco de mapas: scrapyard = industrial percusivo → fundición → neón/synth futurista (mismo arco que la estética, ver tabla de mapas arriba).
