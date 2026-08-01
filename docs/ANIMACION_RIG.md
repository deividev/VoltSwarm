# Animación por rig de piezas (voxel)

Sistema para animar un modelo voxel partiéndolo en piezas con jerarquía de pivotes. Implementado 2026-07-31 sobre el boss final del Mapa 2 (`final-boss`), pero **es genérico**: sirve para cualquier entrada del registry — enemigo, personaje o boss futuro.

Código: `src/models/rig.ts` · Revisión: `model-preview.html?model=<clave>&anim=<clip>` · Captura: `tools/capture-anim-gif.mjs` y `tools/capture-anim-reel.mjs`.

---

## 1. Por qué existe, y cuándo NO usarlo

Todo enemigo —bosses incluidos— se dibuja como **una `BufferGeometry` fundida dentro de un `InstancedMesh`**, animada solo por una matriz 4×4 por instancia (`enemies.ts`). Eso es lo que compra 400+ bots a 60 FPS, y es un guardarraíl no negociable del proyecto. Pero implica que **un modelo no tiene miembros**: no existe un objeto "brazo" que mover, así que el único movimiento posible es de cuerpo entero (balanceo, escala, bote). `enemies.ts` incluso excluye a los bosses del balanceo del enjambre, con este comentario:

> `// Bosses are exempt — a waddling king loses its menace.`

**El rig rompe ese molde y solo se justifica cuando hay UNA instancia en pantalla.** Un boss lo cumple. Un enemigo de enjambre NO: darle rig a un tipo del que hay 200 copias tira el presupuesto de draw calls por el que existe todo el pipeline.

| Caso | Qué usar |
| --- | --- |
| Enjambre (decenas o cientos a la vez) | Matriz por instancia: `VISUAL.enemyWobble` y similares. Nunca rig. |
| Boss (1 en pantalla) | Rig de piezas. |
| Jugador (1 en pantalla) | Rig viable; hoy usa malla única. |
| Prop estático | Nada. |

El rig se construye del **MISMO `VoxelGrid`** que la malla única, así que no hay un segundo asset que mantener sincronizado: el modelo sigue siendo la única fuente de verdad.

---

## 2. Cómo se parte un modelo

Cada pieza declara **una o más bandas** en fracciones: `y` desde ARRIBA (orden de hoja), `x` desde la IZQUIERDA. Es la misma convención que ya usan `segments` y `recolorRegions` en el registry.

```ts
{ name: 'armL',
  bands: [
    { y0: 0.17, y1: 0.30, x0: 0, x1: 0.32 },  // hombrera: más ancha
    { y0: 0.30, y1: 0.66, x0: 0, x1: 0.26 },  // antebrazo + guantelete
  ],
  pivotY: 0.20, pivotX: 0.16, parent: 'torso' }
```

**El orden de la lista ES la prioridad.** Cada pieza reclama antes que las de abajo, y `torso` va **último** porque es el cajón de sastre que recoge lo que nadie reclamó.

### Las dos reglas que se aprendieron a golpes

**Un rectángulo por miembro NO basta.** Un miembro voxel no es una caja: el hombro es más ancho que el antebrazo y la bota más ancha que la espinilla. En la primera versión de este rig, las columnas 11-15 de cada bota (que se ensancha en las filas 85-92) y las filas 58-60 de cada guantelete cayeron **fuera** de su banda, se las quedó el torso, y **se quedaron congeladas mientras el miembro giraba**. Por eso `bands` es una lista.

**Un miembro que se dobla necesita su articulación como pieza aparte.** Sin rodilla la pierna es una tabla rígida y ninguna curva salva la sensación de maniquí. El corte va **justo por debajo** de la pieza de armadura de la articulación (aquí, fila 72 de 93, bajo la rodillera que ocupa 66-71) para que esa pieza no se parta por la mitad.

### Verificación obligatoria

`buildRig` devuelve un `report` con vóxeles y rango de filas por pieza, y el visor lo imprime en su etiqueta. **Léelo siempre**: un miembro mal cortado es invisible en un fotograma fijo y evidente en la tabla.

```
head 7320v rows 0-23 | armL 6138v rows 17-60 | armR 6138v rows 17-60
legL 2426v rows 53-72 | shinL 3217v rows 73-92 | ... | torso 12063v rows 24-52
```

Dos comprobaciones: **las piezas deben sumar el total exacto del modelo** (42.945 aquí — ni se pierde ni se duplica un vóxel), y **el torso no debe llegar al suelo**. Que el torso llegue a la última fila es la firma del bug de las botas congeladas.

---

## 3. Convenio de signos (esto muerde)

El modelo mira a **+Z**. Un miembro que cuelga, rotado con `rotation.x` POSITIVO, lleva su pie hacia **−Z**, o sea **hacia atrás**.

Consecuencia: **el pie adelantado en el contacto es un ángulo de cadera NEGATIVO.** Equivocarse aquí hace que la pierna de apoyo barra hacia delante bajo el cuerpo — el boss camina de espaldas. No se ve como un bug obvio; se ve como que "algo no encaja", que es peor porque cuesta encontrarlo.

La rodilla sí es positiva: el talón se recoge hacia atrás.

---

## 4. Qué hace que una marcha no parezca sintética

Tres cosas, y ninguna es ajustar números.

**Un seno es la curva equivocada.** Las dos mitades de una zancada no son el mismo movimiento. Con el pie plantado el cuerpo pasa por encima y la cadera barre hacia atrás a ritmo casi **constante** (lineal). Con la pierna en el aire vuelve adelante en ~40% del tiempo, rápido y suavizado en los extremos. Un seno hace ambas mitades iguales y lentas: eso es exactamente la sensación de flotar sin suelo. Ver `gait()` en `rig.ts`.

**La fase de apoyo ocupa el 62% del ciclo.** Por encima del 50% hay doble apoyo (ambos pies en el suelo un rato), y eso es literalmente lo que distingue un **andar** de una carrera.

**Hay que trasladar el peso.** El cuerpo se inclina sobre el pie plantado, una vez por ciclo. Sin eso un bípedo lee como dos piernas sobre un raíl.

Encima de esas tres: los hombros contrarrotan contra la cadera con un pequeño **retardo** (un cuerpo no es rígido), los brazos van con la pierna **contraria** y la persiguen con retraso, y la cabeza cancela casi toda la torsión para mantener la mirada fija — que es lo que hace un caminante pesado.

### Un número que no es de gusto

La pelvis baja `0.012 × altura` en el vault. Sale de la geometría: la cadera está a ~0.42 de la altura sobre el pie, así que al girar `HIP_SWING` la pierna recta pierde `L·(1−cos)` ≈ 0.024 de alcance vertical, y **la pelvis tiene que bajar eso o el pie plantado flota**. Si cambias `HIP_SWING`, recalcula este número; no lo ajustes a ojo.

---

## 5. Amplitudes: un boss no es un personaje ágil

El peso se lee con movimiento **lento y con la cabeza estable**, no con miembros lanzados. La referencia es la del propio `enemies.ts`: un rey que se contonea pierde su amenaza. Los brazos van amortiguados al 62% del ángulo de la pierna porque unos guanteletes pesados tienen inercia.

---

## 6. Clips y frecuencias

| Clip | Frecuencia | Notas |
| --- | --- | --- |
| `idle` | 0.31 Hz | Una respiración cada ~3,2 s. La cabeza contrarrota para quedarse nivelada mientras el pecho sube — el indicador de "está vivo" más fuerte en una silueta pesada. |
| `walk` | 0.62 Hz | Un ciclo completo (dos pisadas). |
| `hit` | disparo único, 0,45 s | Ver §8: **su disparador va a cambiar.** |

**Las frecuencias están elegidas para conmensurar**: 0.31 y 0.62 hacen que un bucle de 3,226 s sean exactamente 1 respiración y 2 zancadas. Eso permite montar los tres clips en un mismo GIF sin que ninguno salte en el wrap. Si añades un clip cíclico, elige su frecuencia dentro de esa familia.

Ojo: si un clip usa **dos frecuencias distintas** (a `idle` se le había quedado la oscilación de brazos a otro ritmo), el bucle se rompe igual aunque la principal encaje.

---

## 7. Herramientas

| Herramienta | Para qué |
| --- | --- |
| `model-preview.html?model=X&anim=<clip>` | Revisar en el visor. Expone `window.__setAnimTime(t)`. |
| `tools/capture-anim-gif.mjs` | Un clip → GIF. |
| `tools/capture-anim-reel.mjs` | Varios clips lado a lado → un GIF. |
| `tools/make-turnaround-sheet.mjs` | 8 ángulos del modelo → una hoja. |
| `tools/gif-encoder.mjs` | Codificador GIF compartido (PNG→median-cut→LZW), sin dependencias. |

**El tiempo es determinista**, no un bucle en tiempo real: `__setAnimTime(t)` posa y renderiza bajo demanda, así que el fotograma N siempre es la misma pose y las capturas son reproducibles.

**Para juzgar una marcha, mira el PERFIL (`angle=90`).** De frente se pierde casi toda la información de zancada.

**Aviso del banco de pruebas:** en el visor el modelo camina **en el sitio**, así que los pies patinan. In-game no aplica — la traslación la pone el juego. No confundas ese deslizamiento con un fallo de la animación.

---

## 8. Feedback de golpe: tinte, NO animación (decisión 2026-07-31)

**Decidido: cuando golpeen al boss NO se reproduce una animación de retroceso. Se resuelve con tinte de color y brillo.**

### Por qué

Es un bullet-heaven: al boss se le pega **muchas veces por segundo**. Una animación de retroceso falla por tres motivos, y los tres son de frecuencia, no de calidad:

1. **Se reinicia antes de terminar.** Nunca ves el clip entero, solo su primer fotograma en bucle. El boss queda en convulsión permanente.
2. **Compite con la locomoción.** El retroceso mueve torso, cabeza y brazos: lo mismo que mueve el caminar. O uno gana y el otro desaparece, o se mezclan y salen poses rotas.
3. **Un tinte se solapa consigo mismo sin romperse.** Veinte impactos seguidos dan un boss encendido, que es exactamente la lectura correcta.

Regla general que queda establecida: **la animación es para eventos RAROS y legibles; el color es para eventos FRECUENTES.**

### Lo que ya existe

`enemies.ts` **ya implementa** este destello para todo enemigo, bosses incluidos: al recibir daño pone `hitFlash = 0.08` y aplica `FLASH_TINT` vía `setColorAt` sobre la instancia, restaurando el tinte de estado al expirar. El tinte actual es `(2.5, 2.5, 2.5)` — **brillo blanco**, multiplicativo sobre los colores de vértice. O sea que el "brillo" ya está; lo que falta es el rojo.

### Cómo se implementará (pendiente)

Añadir componente roja al destello. **Dos avisos que hay que respetar:**

1. **El tinte es MULTIPLICATIVO** sobre los colores de vértice. Un rojo saturado tipo `(2.5, 0.3, 0.3)` sobre el cuerpo crema da rosa lavado, y sobre el charcoal casi no se ve. Con este modelo —crema, ámbar y negro— probablemente funcione mejor un **blanco caliente tirando a rojo** (del orden de `2.6, 1.1, 0.9`) que un rojo puro. **Medir in-game sobre el modelo real**, no elegirlo en abstracto.
2. **El rojo ya significa BOSS** en este juego: anillo doble, barra de vida, indicador de tótem. Si el boss además parpadea rojo al recibir daño, ese rojo pasa a significar dos cosas. Considerar reservar el rojo saturado para el peligro y dejar el impacto en blanco caliente.

### El clip `hit` no se tira: se recoloca

Un boss necesita **dos lecturas distintas**, y el tinte solo cubre una:

- *"te he dado"* → tinte + brillo, en cada impacto. Frecuente.
- *"algo ha cambiado"* → cambio de fase, romper armadura, stagger por daño acumulado. **Raro**, merece movimiento de cuerpo, y puede correr entero sin que nada lo reinicie.

El clip `hit` ya construido encaja tal cual en la segunda lectura, solo cambiándole el disparador. Queda guardado en `rig.ts` para eso.

---

## 9. Pendiente

- **Costuras en cadera y hombro** en las poses de máxima amplitud: rotar un miembro cúbico expone el plano de corte. Se arregla solapando un par de vóxeles en la junta.
- **Nada de esto está enganchado al juego.** El rig vive aislado y solo se revisa desde el visor; integrarlo toca `enemies.ts`/`boss.ts`.
- **No hay animaciones de ataque** porque no hay ataques diseñados. Se harán cuando exista el moveset del boss — ver `ROADMAP_STEAM.md`.
