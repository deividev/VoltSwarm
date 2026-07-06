# Voltswarm — Dirección de arte: "Juguete industrial"

Decisión del 2026-07-02: mantenemos la ambientación scrapyard pero la dirección de arte pasa de "óxido realista" a **juguete industrial** — robots de metal pintado con colores saturados, tipo maquinaria de obra, sobre un suelo oscuro neutro. Dibujo animado, no Mad Max.

## El mundo es futurista; el scrapyard es el primer mapa

Decisión del 2026-07-03 (usuario): el juego es de estética FUTURISTA — todos los enemigos son robots — y el scrapyard no es la identidad del juego sino su **primer escenario**: el desguace donde van a morir los robots (junkpunk). La progresión de mapas es también la progresión estética hacia lo futurista puro:

| Mapa | Escenario | Lenguaje visual |
| --- | --- | --- |
| 1 | **Fábrica abandonada** (redefinido 2026-07-06, antes "scrapyard") | Industrial con TOQUE futurista: planchas metálicas oscuras, remaches, franjas de peligro amarillas/negras, líneas de conducto cian tenues (apagadas, sin energía activa — es una fábrica MUERTA, no una en marcha) |
| 2 | *(pendiente, se diseña después de validar el Mapa 1)* | Candidato: fundición/fábrica ACTIVA — mismo lenguaje que el Mapa 1 pero con la maquinaria encendida (cintas en marcha, brillos de calor, conductos cian iluminados) |
| 3 | Escenario del boss final (2026-07-06: pasa a ser el Mapa 2 de la v1, saltando el intermedio por ahora) | Ciudad neón / estación orbital: emisivos, holografía, futurismo puro |

Regla: cada mapa nuevo se ve MÁS "futuro" que el anterior — empezás en la fábrica apagada del mundo y peleás hacia la fuente que fabrica a los robots. Las armas-herramienta (Press, Welder, Tire) viajan con el jugador y mantienen su identidad de desguace en cualquier mapa.

**v1 usa 2 mapas** (decisión del usuario 2026-07-06): Mapa 1 (fábrica abandonada, éste) + Mapa 2 (boss final, futurista puro). El mapa intermedio de fundición activa queda diseñado en la tabla pero se construye después, basándose en lo que funcione del Mapa 1.

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

## Pipeline de modelos voxel (CONGELADO 2026-07-04, validado con Voltling in-game)

El pipeline es **2D → 3D en dos pasos**. La calidad del modelo la decide la referencia 2D: una ilustración con perspectiva o sombreado se voxeliza en papilla; una vista frontal plana y contigua se voxeliza con fidelidad.

1. **Referencia 2D**: vista frontal ortográfica plana del personaje, generada con gpt-image (prompt maestro en `PROMPTS_IMAGENES.md` §6) → `assets/2d/ref-<nombre>-front.png`. Restricciones DURAS del prompt: silueta única contigua (cero piezas flotantes), simetría perfecta, cero perspectiva/sombreado/gradientes/outlines, formas grandes simples, paleta exacta en hex.
2. **Voxelización**: entrada en `src/models/registry.ts` (ref + paleta + `armorColors` — qué colores son casco vs detalle, clave en personajes bicolor como el jugador — + resolución + bandas de extrusión) → `src/models/icon-voxelizer.ts` la convierte automáticamente (cuantización a paleta → simetrizado → extrusión por segmentos con relieve: visor hundido, rejillas encajadas, vents de cresta orgullosos). `EnemySystem` intercambia la geometría de cualquier tipo cuyo nombre (kebab-case) tenga entrada en el registro — bosses incluidos; sin entrada, se quedan las primitivas.

Reglas de presupuesto y validación:

- **La métrica es TRIÁNGULOS por instancia, no voxels** (el builder fusiona tramos y extrae solo la cáscara). Orientación: enemigos de enjambre ~3-6k tris (`targetWidth` 17-21); bosses/jugador sin límite práctico (`targetWidth` ~41, solo 1-2 instancias).
- Revisión SIEMPRE con `node tools/capture-model-preview.mjs <clave>` (luz/fondo del juego real) y después in-game (`node tools/capture-ingame.mjs`).
- El guardarraíl no cambia: todo modelo nuevo se valida con el enjambre al máximo (400+) antes de darse por definitivo.
- La cámara es top-down: el TECHO del modelo es la superficie más visible. Si un personaje necesita más lectura cenital, el detalle va en el techo de su referencia (vents, paneles), no en más resolución.

## Extensión de la dirección a VFX y audio (regla transversal)

Todo lo que se añada — efectos, partículas, sonido — habla el idioma "juguete industrial":

- **VFX**: las partículas son CUBOS voxel del color de paleta de su dueño (muerte = voxel burst del color del bot; chispas = cubos ámbar/cian). Nada de billboards suaves, humo realista ni glow orgánico. Los emisivos (visores, beams, orbes) son la única fuente de "brillo" y se potencian con bloom — plan en `REFERENCIAS_VISUALES.md`.
- **Audio**: sonidos MECÁNICOS de juguete/maquinaria — clanks metálicos cortos, servos, zumbidos eléctricos, chirps sintéticos. Cero gore (los enemigos son robots: mueren en "clank + burst", no en splat). La música sigue el arco de mapas: scrapyard = industrial percusivo → fundición → neón/synth futurista (mismo arco que la estética, ver tabla de mapas arriba).
