# Roster visual aprobado para Swarm Foundry

Se aprobaron cuatro reemplazos visuales para Mapa 2: **Furnace Mite, Forge Dart, Slagcaster y Axle Runner**. **Furnace Mite quedó integrado y validado en 0.23.0** como variante visual de Voltling exclusiva de Swarm Foundry. **Axle Runner quedó aprobado, integrado y validado en 0.24.0** como sustitución visual permanente de Sparkrunner en Mapa 2, conservando comportamiento, slot de tipo y un único `InstancedMesh`. Forge Dart y Slagcaster permanecen en preproducción.

> **Provenance local:** las rutas bajo `art/concept/` están ignoradas por Git según la política de assets del proyecto. Identifican las fuentes conservadas en la máquina de trabajo, pero no prometen archivos versionados, empaquetados ni disponibles en un clon limpio. Las cuatro referencias runtime de Furnace Mite bajo `public/assets/2d/` forman parte de la unidad 0.23.0 y requieren `git add -f` al preparar el commit.

## Estado rápido

| Diseño | Sustituye a | Rol heredado | Estado | Contrato visual y de animación |
| --- | --- | --- | --- | --- |
| **Furnace Mite** | Voltling | Unidad común, ligera y rápida | ✅ Runtime Map 2 integrado, validado visualmente y con enjambre 400+ | Cuerpo compacto, crisol bajo y silueta ligera. Cuerpo y patas rígidos; nunca debe leerse como una unidad pesada. |
| **Forge Dart** | Roller | Unidad rápida con trayectoria comprometida | Concepto aprobado; hojas finales pendientes | Silueta angular de chevrón y paleta morada heredada del Roller. La dirección frontal debe leerse inmediatamente desde la cámara de juego. |
| **Slagcaster** | Gunner | Tirador lento que se detiene para atacar | Runtime Map 2 listo para prueba humana; aprobación visual y gate 400+ pendientes | Se desplaza como una bola industrial compacta; al disparar se despliega y queda anclado. Ambos estados deben conservar correspondencia clara entre todas sus piezas. |
| **Axle Runner** | Sparkrunner | Perseguidor alto y rápido | ✅ Runtime Map 2 aprobado, integrado y validado con enjambre 400+ en Electron | Droide utilitario blanco/cobalto con dos módulos de rueda laterales. Las ruedas y suspensiones permanecen rígidas: solo traslación y el `wobble` global existente. La silueta debe comunicar velocidad, no masa de tanque. |

Rustbrute y Drone siguen **sin sustituto aprobado** para Mapa 2.

## Provenance visual local

Estas fuentes documentan la aprobación visual; no son carga runtime:

- **Furnace Mite:**
  - `art/concept/swarm-foundry-enemies/furnace-mite-concept-v1.png`
  - `art/concept/swarm-foundry-enemies/furnace-mite-front-candidate-v1.png`
  - `art/concept/swarm-foundry-enemies/furnace-mite-side-candidate-v2.png`
  - `art/concept/swarm-foundry-enemies/furnace-mite-back-candidate-v1.png`
  - `art/concept/swarm-foundry-enemies/furnace-mite-top-candidate-v1.png`
- **Forge Dart:** `art/concept/swarm-foundry-enemies/forge-dart-concept-v1.png`
- **Slagcaster:**
  - Concepto de transformación aprobado: `art/concept/swarm-foundry-enemies/slagcaster-transform-concept-v1.png`.
  - Candidatas cerradas: `slagcaster-closed-front-candidate-v1.png`, `slagcaster-closed-side-candidate-v1.png` y `slagcaster-closed-back-candidate-v1.png` en la misma carpeta.
  - Candidatas desplegadas: `slagcaster-deployed-front-candidate-v1.png`, `slagcaster-deployed-side-candidate-v1.png` y `slagcaster-deployed-back-candidate-v1.png` en la misma carpeta.
  - Rediseño desplegado v3: `slagcaster-deployed-{front,back}-candidate-v3.png` más `slagcaster-deployed-side-corrected-candidate-v3.png`. El primer `slagcaster-deployed-side-candidate-v3.png` se conserva como descarte porque hacía leer el cañón como montado desde la espalda; la corrección recupera el perfil puro con cuerpo a la izquierda, pivote corto unido al torso y barril hacia la derecha.
  - Las seis candidatas preservan el reparto de piezas entre bola y despliegue. ImageGen devolvió RGB 1254×1254 con fondo de damero horneado, sombreado y miles de colores; `tools/make-slagcaster-sheets.mjs` las normaliza de forma determinista a RGBA plano, alpha duro y la paleta `#788239` / `#232830` / `#ffa803`.
  - Hojas técnicas cerradas: `public/assets/2d/ref-slagcaster-closed-{front,side,back}-v1.png`. El endpoint desplegado runtime usa `ref-slagcaster-deployed-{front,side,back}-v3.png`; v1/v2 se conservan como historial. V3 aporta visor central estrecho y cañón grande a la derecha del observador en frontal / izquierda en trasera; el lateral corregido mantiene la boca en el extremo derecho sin patas en tres cuartos.
  - Endpoints estáticos de comparación: `slagcaster-closed` y `slagcaster-deployed` en `src/models/registry.ts`. La clave runtime animada es `slagcaster`.
  - Turnarounds cardinales: `assets/preview/slagcaster-closed-viewer-turnaround.png` y `assets/preview/slagcaster-deployed-viewer-turnaround.png` (más sus capturas `-0/-90/-180/-270`).
  - Runtime de prueba: Gunner resuelve a `slagcaster` solo en `megafactory`. Una única topología desplegada lleva posición cerrada + `partId` por vértice y `instanceSlagDeploy` por instancia; el shader escalona carcasa, anclajes, crisol y cañón sin sumar meshes ni compartir el progreso entre enemigos.
  - Capturas del shader real: `assets/preview/slagcaster-transform-deploy-0.png`, `-0_5.png` y `-1.png`. Compila sin errores y los extremos leen correctamente; el 50% todavía separa masas en bloques demasiado evidentes y requiere juicio humano in-game antes de aprobar la animación.
- **Axle Runner:**
  - Concept aprobado: `art/concept/swarm-foundry-enemies/axle-runner-concept-v1.png`
  - Frontal técnica aprobada/runtime: `public/assets/2d/ref-axle-runner-front-v1.png`.
  - Lateral técnica aprobada/runtime: `public/assets/2d/ref-axle-runner-side-v1.png`.
  - Trasera técnica aprobada/runtime: `public/assets/2d/ref-axle-runner-back-v1.png` (fuente local: `art/concept/swarm-foundry-enemies/axle-runner-back-flat-candidate-v2.png`).
  - Previews del modelo: `assets/preview/axle-runner-viewer-0.png`, `-90.png`, `-180.png` y `-270.png`.
  - Captura real: `assets/preview/axle-runner-ingame.png`.
  - Gate Electron 400+: `tmp/perf-400-output/axle-runner-electron-report.json`, `axle-runner-stress-start.png` y `axle-runner-stress-end.png`.

Las tres vistas técnicas de Axle Runner miden 1024×1024 RGBA, tienen alpha duro, una sola componente contigua y comparten una caja opaca de 598×900 px en frontal/trasera y 437×900 px en lateral. Las tres usan los cinco colores aprobados (`#e8e3d5`, `#104090`, `#232830`, `#2ee6de`, `#ff4433`). La trasera v2 se reconstruyó desde cero y bloquea exactamente la máscara exterior de la frontal: coinciden sus 900 filas, no solo la caja global.

El modelo `axle-runner` usa extrusión frontal con `sideProfileRef`, `backPaintRef` y `sidePaint`; no usa `voxelizeMultiView`, que convertiría el cuerpo redondo en una caja. Trabaja a 25×45/0.04 u por voxel y estampa los dos cilindros de rueda dentro de la misma rejilla, sin sumar mallas ni draw calls por instancia. Las siete filas verticales adicionales fijan su altura runtime medida en 1.98 u frente a las 2.112 u de Sparkrunner, ambos con la escala compartida 1.1, sin aumentar anchura/profundidad ni deformar los voxels. La captura técnica actual mide 10 315 voxels y 7368 triángulos por instancia.

**Gate definitivo 2026-08-22:** Electron a 1920×1080, RTX 2060, 430 enemigos iniciales y 428–430 durante 65 s. Axle Runner resolvió realmente el slot Sparkrunner (`modelKey: axle-runner`), preservó la identidad del `InstancedMesh` tipo 1 y los nueve tipos conservaron exactamente nueve `InstancedMesh`. Resultado: 119.55 FPS medios, bucket mínimo 104.99 FPS, frametime 8.3 ms mediana / 8.5 ms p99, 4.91 M triángulos/frame medios, 430/430 enemigos desplazados más de una unidad y cero errores de página/consola. **PASS**.

El concept inicial de Arc Courier se conserva únicamente como reserva visual futura en `art/concept/swarm-foundry-enemies/arc-courier-concept-v1.png`. Ya no gobierna este slot ni sus futuras hojas técnicas.

## Contrato de hojas y modelado

Todas las hojas finales deben ser **ortográficas, planas y contiguas**, con fondo transparente, cero perspectiva, sombreado, gradientes u `outlines`, regiones de color uniforme, paleta medida, detalles gruesos y cada parte físicamente unida.

### Furnace Mite — runtime cerrado en 0.23.0

- [x] Frontal: silueta compacta y rejilla frontal aprobadas.
- [x] Lateral: perfil, orientación y respiraderos aprobados; el frente mira a la derecha.
- [x] Trasera: crisol, espalda simple y cuatro patas aprobados.
- [x] Cenital adicional: crisol, techo, orientación y distribución de patas aprobados.
- [x] Referencias runtime 1024×1024: `ref-furnace-mite-front-v1.png`, `side`, `back` y `top` bajo `public/assets/2d/`.
- [x] Modelo voxel `furnace-mite` integrado como sustitución de Voltling solo en `megafactory`, sin cambiar gameplay ni crear otro mesh.
- [x] Previews 0°/90°/180°/270°, captura real de Mapa 2 y benchmark canónico 400+ validados.

La cenital sigue siendo una guía adicional y no sustituye las tres hojas canónicas. El runtime usa frontal + `sideProfileRef` + `backPaintRef`, pintura cenital opt-in y stamps dentro del mismo `VoxelGrid` para el crisol, las cuatro patas y el visor macro escalonado. El resultado conserva una sola geometría y el mismo `InstancedMesh` del slot Voltling.

### Resto del roster — hojas pendientes

- [ ] **Forge Dart — 3 hojas:** frontal, lateral y trasera.
- [x] **Axle Runner — 3 hojas:** frontal ✅; lateral ✅; trasera ✅. Modelo voxel aprobado, integrado, validado in-game y con gate Electron 400+ superado.
- [x] **Slagcaster — 6 hojas:** cerrado frontal/lateral/trasera y desplegado frontal/lateral/trasera. Ambos modelos existen solo como endpoints estáticos de preview; la transformación runtime sigue pendiente.

Slagcaster requiere diseño técnico especial: ambos estados deben compartir topología visual y correspondencia inequívoca de piezas. Su transformación **no puede tratarse como un simple reskin** de Gunner ni resolverse inventando geometría entre vistas. El runtime de prueba usa una representación topology-stable: `slagcaster-transform.ts` envuelve la topología desplegada sobre el diámetro cerrado y asigna partes semánticas; el shader interpola cada grupo con ventanas escalonadas y un atributo de progreso independiente por slot. Sigue siendo exactamente el `InstancedMesh` de Gunner. El proceso imita la disciplina del rig del Hazard Marshal, no su arquitectura multi-`Mesh`.

Comportamiento de prueba: fuera de la banda Foundry de 9–14 unidades se retrae y se mueve como bola; dentro se detiene y despliega. El límite exterior de 14 mantiene la velocidad heredada de 12 u/s y deja aproximadamente 1,17 s de lectura al disparo desde el borde. El disparo queda bloqueado hasta completar el despliegue y espera solo 0,2 s para que se lea la pose plantada; los disparos posteriores conservan el cooldown Gunner de 3 s. La bola rota alrededor de su centro local; los estados intermedios permanecen verticales y apoyados. V3 refuerza el cañón dentro de la MISMA geometría con cuatro sólidos voxel solapados: puente, barril +Z, carcasa oliva de boca y núcleo caliente. El socket XZ medido queda en `{ lateral: +0,6206, forward: +1,14 }`, sobre la cara máxima real de la boca; se transforma con el mismo yaw y el disparo se reorienta desde allí al jugador. El proyectil conserva cuerpo 1,05, collider 0,42, velocidad 12 y daño 10. Map 1 y la Demo conservan el Gunner, spawn centrado, rango 9–12, temporización histórica y esquirla. Esto aún **no es aprobación visual**: falta comprobar en Electron que el cañón v3 no domina demasiado la silueta, que su puente lee conectado durante el morph, que el origen coincide con la boca y que el enjambre 400+ mantiene el presupuesto.

## Gate de integración posterior

Cada reemplazo se cierra por separado:

1. Entregar las referencias de conversión que vaya a consumir el runtime y medir su paleta.
2. Crear el modelo y registrarlo en `src/models/registry.ts`.
3. Capturar previews a **0° / 90° / 180° / 270°** y corregir silueta, perfil y espalda.
4. Validar lectura, escala, color y VFX dentro del juego.
5. Revalidar rendimiento y legibilidad con **400+ enemigos**.

Furnace Mite y Axle Runner ya completaron los cinco pasos. Forge Dart y Slagcaster permanecen pendientes desde el primero.

## Breaker Colossus — futuro boss de Mapa 1

`art/concept/map1-bosses/breaker-colossus-concept-v1.png` queda como provenance visual local aprobada para un candidato a **tercer boss de Mapa 1 en el juego completo**, con armadura cobalto, carbón y núcleo ámbar.

Es solo una reserva visual: no existe gameplay ni `moveset` implementado. Añadirlo alterará el pool de bosses de Mapa 1 y el progreso de **Boss Hunter**, por lo que requerirá una decisión de diseño e integración independiente. Su inclusión en la **Steam Demo NO está aprobada** y no debe inferirse de esta referencia.
