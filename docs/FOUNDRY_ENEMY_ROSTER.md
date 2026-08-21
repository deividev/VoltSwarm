# Roster visual aprobado para Swarm Foundry

Se aprobaron cuatro reemplazos visuales para Mapa 2: **Furnace Mite, Forge Dart, Slagcaster y Arc Courier**. Furnace Mite dispone además de un juego de vistas aprobado y queda listo para entrar en implementación. Esta unidad documental **no integra modelos, referencias runtime ni comportamiento jugable**.

> **Provenance local:** las rutas bajo `art/concept/` están ignoradas por Git según la política de assets del proyecto. Identifican las fuentes conservadas en la máquina de trabajo, pero no prometen archivos versionados, empaquetados ni disponibles en un clon limpio. La futura unidad de implementación deberá entregar y validar conjuntamente cualquier referencia que consuma el runtime.

## Estado rápido

| Diseño | Sustituye a | Rol heredado | Estado | Contrato visual y de animación |
| --- | --- | --- | --- | --- |
| **Furnace Mite** | Voltling | Unidad común, ligera y rápida | Concepto y vistas aprobados; listo para implementación | Cuerpo compacto, crisol bajo y silueta ligera. Cuerpo y patas rígidos; nunca debe leerse como una unidad pesada. |
| **Forge Dart** | Roller | Unidad rápida con trayectoria comprometida | Concepto aprobado; hojas finales pendientes | Silueta angular de chevrón y paleta morada heredada del Roller. La dirección frontal debe leerse inmediatamente desde la cámara de juego. |
| **Slagcaster** | Gunner | Tirador lento que se detiene para atacar | Concepto de transformación aprobado; hojas finales pendientes | Se desplaza como una bola industrial compacta; al disparar se despliega y queda anclado. Ambos estados deben conservar correspondencia clara entre todas sus piezas. |
| **Arc Courier** | Sparkrunner | Perseguidor alto y rápido | Concepto aprobado; hojas finales pendientes | Droide utilitario cilíndrico, cian y estrecho. Piernas completamente fijas, sin animación articulada: solo traslación rígida y el `wobble` global existente. |

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
- **Slagcaster:** `art/concept/swarm-foundry-enemies/slagcaster-transform-concept-v1.png`
- **Arc Courier:** `art/concept/swarm-foundry-enemies/arc-courier-concept-v1.png`

## Contrato de hojas y modelado

Todas las hojas finales deben ser **ortográficas, planas y contiguas**, con fondo transparente, cero perspectiva, sombreado, gradientes u `outlines`, regiones de color uniforme, paleta medida, detalles gruesos y cada parte físicamente unida.

### Furnace Mite — preproducción aprobada

- [x] Frontal: silueta compacta y rejilla frontal aprobadas.
- [x] Lateral: perfil, orientación y respiraderos aprobados; el frente mira a la derecha.
- [x] Trasera: crisol, espalda simple y cuatro patas aprobados.
- [x] Cenital adicional: crisol, techo, orientación y distribución de patas aprobados.

La cenital es una guía adicional para reconstruir la geometría superior; no sustituye las tres hojas canónicas. Ruta prevista de modelado: frontal + `sideProfileRef` + `backPaintRef`, con el crisol como geometría superior dedicada guiada por la cenital. Es una decisión de pipeline pendiente de ejecutar y validar, **no un modelo runtime cerrado**.

### Resto del roster — hojas pendientes

- [ ] **Forge Dart — 3 hojas:** frontal, lateral y trasera.
- [ ] **Arc Courier — 3 hojas:** frontal, lateral y trasera, manteniendo pose y piernas rígidas.
- [ ] **Slagcaster — 6 hojas:** cerrado frontal/lateral/trasera y desplegado frontal/lateral/trasera.

Slagcaster requiere diseño técnico especial: ambos estados deben compartir topología visual y correspondencia inequívoca de piezas. Su transformación **no puede tratarse como un simple reskin** de Gunner ni resolverse inventando geometría entre vistas.

## Gate de integración posterior

Cada reemplazo se cierra por separado:

1. Entregar las referencias de conversión que vaya a consumir el runtime y medir su paleta.
2. Crear el modelo y registrarlo en `src/models/registry.ts`.
3. Capturar previews a **0° / 90° / 180° / 270°** y corregir silueta, perfil y espalda.
4. Validar lectura, escala, color y VFX dentro del juego.
5. Revalidar rendimiento y legibilidad con **400+ enemigos**.

## Breaker Colossus — futuro boss de Mapa 1

`art/concept/map1-bosses/breaker-colossus-concept-v1.png` queda como provenance visual local aprobada para un candidato a **tercer boss de Mapa 1 en el juego completo**, con armadura cobalto, carbón y núcleo ámbar.

Es solo una reserva visual: no existe gameplay ni `moveset` implementado. Añadirlo alterará el pool de bosses de Mapa 1 y el progreso de **Boss Hunter**, por lo que requerirá una decisión de diseño e integración independiente. Su inclusión en la **Steam Demo NO está aprobada** y no debe inferirse de esta referencia.
