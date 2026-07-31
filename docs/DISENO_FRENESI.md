# Estudio de frenetismo — por qué el juego se siente (y se ve) quieto

**Fecha:** 2026-07-29 · **Build medida:** v0.6.7 · **Origen:** comentarios repetidos en X ("le falta movimiento", "le falta locura").

> **Aviso sobre la fuente.** Quien comenta en X está viendo **GIFs**, no jugando. Son dos problemas distintos y hay que separarlos: uno es qué material estamos publicando, el otro es cómo se juega de verdad. Este estudio encontró que **los dos están rotos, por la misma causa raíz**.

---

## 1. Diagnóstico medido

### 1.1 La curva de densidad — la causa raíz

Medido en build empaquetada, contando enemigos **dentro del frustum de cámara** (no el tamaño del pool, que es lo que el jugador no ve). Herramienta: `tmp/density-probe.mjs` (desechable).

| Minuto | Vivos | **En pantalla** | A ≤12 uds | Distancia media |
| ---: | ---: | ---: | ---: | ---: |
| 0:10 | 12 | **9** | 7 | 11.8 |
| 0:30 | 24 | **20** | 18 | 7.4 |
| 1:30 | 23 | **14** | 11 | 12.5 |
| 3:00 | 40 | **26** | 22 | 13.2 |
| 5:00 | 76 | **52** | 33 | 17.1 |
| 7:00 | 160 | **101** | 75 | 16.1 |
| 8:00 | 224 | **147** | 101 | 16.3 |

**El juego no es un bullet-heaven hasta el minuto 5.** Los primeros tres minutos se juegan con 9-26 cuerpos en pantalla, sobre una arena de 180×180. Eso no es un enjambre: es una escaramuza.

La curva analítica de `config.ts` confirma de dónde sale:

| t | dificultad | oleada cada | tamaño | spawn/s | cap activo |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0:00 | 0.00 | 2.80s | 3.0 | 1.1 | **28** |
| 1:00 | 0.13 | 2.53s | 4.6 | 1.8 | 72 |
| 3:00 | 0.38 | 1.99s | 7.9 | 3.9 | 160 |
| 5:00 | 0.63 | 1.46s | 11.1 | 7.6 | 248 |
| 8:00 | 1.00 | 0.65s | 16.0 | 24.6 | 380 |

`maxActiveStart: 28` es el techo del primer minuto. **El escaparate del juego — los primeros 60 segundos, lo que ve cualquiera que abra un GIF — está limitado por diseño a 28 enemigos.**

### 1.2 Cuatro de cada seis jugadores nunca ven la parte buena

De las 6 runs humanas registradas: muertes a **76s, 94s, 154s, 291s**, y dos runs completas a 600s. Es bimodal, sin término medio.

Cruzando eso con la tabla de arriba: **la mayoría de las partidas terminan antes de que el juego alcance 40 enemigos en pantalla.** El pico de 147 en pantalla del minuto 8 existe, está medido, es espectacular — y casi nadie lo ve.

### 1.3 El jugador no puede ser alcanzado. Nunca.

```
moveSpeed del jugador ........ 11
enemigo más rápido ...........  8   (Sparkrunner)
```

El jugador es un **38% más rápido que la cosa más rápida del juego**. Traducción de diseño: no existe una situación en la que tengas que *escapar*. Caminás y el enjambre queda atrás. No hay que trazar una ruta, no hay que leer un hueco, no hay decisión de movimiento bajo presión — que es exactamente el verbo central del género.

Los enemigos además aparecen en un anillo a **32-44 unidades** y tienen que recorrer todo eso para llegar. A velocidad 5.5, son ~6 segundos de caminata antes de ser una amenaza.

### 1.4 El último 20% de la run no escala

`difficultyScalar` es `min(elapsedS / 480, 1)`. Llega al máximo en el **minuto 8** y se queda plano.

Los últimos **120 segundos — el 20% de la partida, el tramo que debería ser el clímax — no añaden ni un enemigo ni un punto de dificultad.** La run no termina en crescendo: termina en meseta.

### 1.5 Lo que ya existe y lo que no

- ✅ Screen shake — existe, `hitAmp: 0.22` (suave), `bossKillAmp: 0.55`.
- ✅ Death burst de cubos voxel, VFX por arma y por mod, bloom.
- ❌ **Hitstop / freeze-frame: no existe.** Cero ocurrencias en `src/`. Es el recurso más barato y más efectivo del género para que un golpe se sienta.
- ❌ Sin dash ni movimiento de emergencia (candidato en el roadmap, sin prototipar).
- ❌ Sin respuesta a rachas: matar 3 enemigos o 30 en un segundo produce exactamente el mismo feedback.

---

## 2. Ideas, agrupadas por eje

Ordenadas dentro de cada eje por relación impacto/coste. **Recordá la regla: un cambio numérico por playtest.**

### Eje A — Densidad temprana *(ataca la causa raíz)*

| # | Idea | Coste | Notas |
| --- | --- | --- | --- |
| A1 | **`maxActiveStart` 28 → 70** y `waveSizeStart` 3 → 6 | 1 línea | El cambio más directo. Reversible. Empezar por acá. |
| A2 | **Curva front-loaded**: `Math.pow(t/480, 0.65)` en vez de lineal | 1 línea | A los 60s la dificultad pasa de 0.13 a 0.26; el minuto 1 se duplica sin tocar el minuto 8. |
| A3 | **Anillo de spawn dinámico**: 24-32 unidades al principio, 32-44 después | pequeño | Recorta ~3s de caminata muerta por enemigo temprano. |
| A4 | **Trickle constante** de un tipo débil desde t=0, al margen de las oleadas | medio | Garantiza que nunca haya pantalla vacía entre oleadas. |

### Eje B — Presión de movimiento *(ataca "no pasa nada si me quedo quieto")*

| # | Idea | Coste | Notas |
| --- | --- | --- | --- |
| B1 | **Subir Sparkrunner 8 → 11-12** (iguala o supera al jugador) | 1 línea | Convierte a un tipo en amenaza real de persecución. Es EL cambio que crea el verbo "esquivar". Ojo: puede volverse frustrante, hay que probarlo solo. |
| B2 | **Interceptores**: enemigos que apuntan a dónde vas a estar, no a dónde estás | medio | Obliga a fintar. Reutiliza el `heading` que ya tiene el Roller. |
| B3 | **Spawn sesgado hacia el vector de movimiento** del jugador | pequeño | Correr en línea recta deja de ser gratis. |
| B4 | **Dash con cooldown** | medio-alto | Ya está como candidato en el roadmap, con el riesgo anotado de trivializar la tensión. Solo tiene sentido DESPUÉS de B1 — un dash sin nada de qué huir no aporta nada. |

### Eje C — Impacto y locura visual *(lo que se ve en un GIF)*

| # | Idea | Coste | Notas |
| --- | --- | --- | --- |
| C1 | **Hitstop en muertes**: 40-80ms de congelación en kills grandes | pequeño | No existe hoy. Es el mejor retorno por línea de código de toda la lista. |
| C2 | **Respuesta a rachas**: umbral de kills/segundo que sube shake, bloom y densidad de partículas | medio | Convierte una buena build en un espectáculo. Hoy 3 kills y 30 kills se ven igual. |
| C3 | **Escalar el death burst con el tamaño de la oleada** en vez de por víctima | pequeño | Matar 20 a la vez debería reventar la pantalla. |
| C4 | Subir `hitAmp` 0.22 → ~0.3 | 1 línea | Cambio barato, medir solo. |

### Eje D — El clímax que falta

| # | Idea | Coste | Notas |
| --- | --- | --- | --- |
| D1 | **Escalar hasta 600s** en vez de 480 (`elapsedS / 600`) | 1 línea | Elimina la meseta final. Cuidado: aplana también la subida temprana, combinar con A2. |
| D2 | **Oleada final a los 9:00**: pico coreografiado, no solo más de lo mismo | medio | Le da un final a la run. Encaja con el arco hacia el Mapa 2. |

---

## 3. Recomendación

**Empezar por el Eje A.** La densidad temprana es la causa raíz de las dos quejas a la vez: es lo que hace que el juego se sienta vacío al jugarlo *y* lo que hace que se vea vacío en los GIFs. Son cambios de una línea en `config.ts`, totalmente reversibles, y el instrumento para juzgarlos ya existe.

Orden sugerido, un playtest por cambio: **A1 → A2 → C1 → B1**.

`C1` (hitstop) va antes que `B1` a propósito: es barato, no toca el balance y hace que todo lo demás se sienta mejor. `B1` es el más arriesgado de la lista — puede transformar el juego o puede volverlo frustrante — y por eso conviene probarlo con la densidad ya resuelta.

**Y una acción que cuesta cero:** el material que se publica debería capturarse a partir del **minuto 6**, no del arranque. El pico de 147 enemigos en pantalla ya existe hoy, medido, sin tocar una línea de código. Los GIFs actuales están enseñando la parte más floja del juego.

Eso arregla la percepción esta semana. No arregla la partida del que muere a los 90 segundos — para eso está el Eje A.

---

## 4. Dash y personajes — decisiones cerradas 2026-07-30

### 4.1 El hallazgo que ordena todo lo demás

Medido en el build empaquetado, jugador parado, con las armas desarmadas para que los kills no adelgacen la masa:

| Densidad | Enemigos tocando al jugador | DPS recibido |
| --- | --- | --- |
| ~0:40 | 5.8 | **20.0** |
| ~8:00 | 24.5 | **18.6** |

**4.2x más enemigos encima, el mismo daño.** El i-frame global de `PLAYER.invulnAfterHitS = 0.4` capa el DPS del enjambre a `contactDamage / invulnAfterHitS = 8 / 0.4 = 20`, y se cumple exacto — el propio comentario de `config.ts` ya lo anticipaba, pero ahora está medido.

Consecuencia directa sobre el Eje A: **añadir densidad hará que el juego se vea mucho más loco sin hacerlo un gramo más peligroso.** La palanca para que la profundidad cueste es `contactDamage` (el propio `config.ts` la señala como siguiente candidata) o un i-frame que se ablande con la densidad. Sin eso, la masa es decoración.

### 4.2 El dash se aplaza, y no es una excusa

Un dash resuelve *"estoy atrapado y el daño escala con lo atrapado que estoy"*. Hoy el juego no plantea esa pregunta: el jugador es un 38% más rápido que lo más rápido del elenco (11 vs 8) **y** el daño está capado a 20 DPS entre en la masa o se quede en el borde. Un dash hoy es un botón para ir un poco más rápido en una dirección en la que ya podías caminar.

Orden acordado: **Eje A (densidad) → `contactDamage`/i-frame (que la densidad importe) → B1 (que algo te alcance) → dash.** Prototiparlo antes del segundo paso da una lectura falsa: se siente bien porque moverse rápido es satisfactorio, no porque el juego lo necesite — y sobre esa lectura falsa se diseñarían los tres personajes.

**Cuando llegue: universal e idéntico para todos.** Que todos se muevan igual es lo que hace legibles las diferencias reales; si además cambia la movilidad, el jugador no sabe si perdió por el personaje o porque se mueve peor. Y la movilidad domina la supervivencia en este género: el que dashea mejor no es distinto, es *mejor*.

**Forma tentativa: 2 cargas con recarga individual lenta.** Casi siempre hay una disponible (sin aire muerto — la lección de Volt Pulse 2.4→1.4s), pero gastar las dos seguidas deja desnudo. La decisión no nace de que el recurso sea escaso, nace de que la amenaza sea legible: si el enjambre no telegrafía que te está cerrando el paso, ningún diseño de cooldown lo arregla.

### 4.3 La identidad de los personajes vive en REGLAS, no en la movilidad

Decisión del usuario: un dash con parámetros distintos por personaje es una hoja de stats, no un personaje. La identidad se engancha a los sistemas que ya existen (2 tipos de socket, 5 tiers, oro, chatarrero, cofres, pool de 17 mods, 20+ stats, contratos). Bocetos acordados:

| Boceto | Regla | Qué cambia en la run |
| --- | --- | --- |
| Apilador | +1 socket de arma, −2 de core | Muchas armas, stats de papel: cambia qué draftás, qué comprás, qué contratos persigues |
| Sobrecargado | Mods salen un tier por encima, +50% daño de contacto | Loot de lujo, cuerpo de cristal: cambia la relación con cofres y chatarrero |
| Bola de nieve | Orbes de XP se atraen desde todo el mapa, ~30% más rápido de nivel, 60 HP de inicio | Sube rápido pero frágil: la decisión de meterse en la masa es otra |

Cada una es un enganche de una línea a un sistema ya probado, y no necesita VFX ni SFX propio.

### 4.4 Las dos restricciones que se fijan AHORA aunque el dash llegue después

**R1 — Ningún personaje sobrevive por moverse bien.** La supervivencia sale de HP, armor, evasion, lifesteal o control; nunca de velocidad o esquiva. Motivo: el día que entre el dash universal, un personaje cuyo plan de supervivencia ya era esquivar saca mucho más provecho que el resto, pasa de equilibrado a roto, y obliga a recalibrar los tres. Con supervivencia por stats, el dash suma lo mismo a todos.

**R2 — El contador de "acorralado" se empieza a registrar ANTES de tocar la densidad.** Segundos con N+ enemigos a menos de X unidades y HP bajo umbral, en el registro de run. Motivo: la decisión de si el dash hace falta se toma comparando antes/después de los cambios de frenesí, y ese dato **no se puede rellenar hacia atrás** — misma trampa que el campo de mapa para el Mapa 2. Si se añade después, hay "después" y ningún "antes".

### 4.5 Desbloqueo de personajes por contratos

Se arranca con **un solo personaje**; los demás se desbloquean por contratos, igual que armas, cores, mods y sockets.

**Un personaje es contrato FIRMA, nunca peldaño de escalera.** Los peldaños son para contenido fungible — un arma vale aproximadamente lo que otra, y los de repuesto absorben contenido futuro. Un personaje es una forma entera de jugar: si es peldaño, la cola puede entregarlo en un punto arbitrario y contenido futuro puede correr qué peldaño da qué.

**El gate del segundo personaje es VOLUMEN, el del tercero MAESTRÍA.** Los datos actuales lo exigen: 0 bosses invocados en 6 runs, 4 de 6 muertes antes de 5:00, 33% de finalización. Un personaje detrás de "matá un boss" o "sobreviví 10:00" no lo ve la mayoría — y está al revés, porque encierra al personaje que podría ayudar a alguien que la pasa mal detrás de *no* pasarla mal. `LIFETIME` ya tiene `runsFinished`, `totalKills` y `totalPlayS`: gate por volumen sin plomería nueva. El tercero ya puede pedir el boss, porque a esa altura hay dos personajes y motivo real para querer ser bueno.

**El personaje inicial es el legible y perdonador, no el interesante.** Carga con las primeras ~10 runs de todo el mundo: es el juego que decide si alguien pide reembolso. Los bocetos raros de §4.3 son mala primera experiencia; el equilibrado va primero y los raros son la recompensa.

Persistencia: `unlockedCharacters` en `PROFILE` siguiendo la misma costura que las armas — IDs nunca índices, lo otorgado nunca se revoca, `PROFILE` se muta en su sitio.

---

## 5. Pendientes anotados durante los playtests

### 5.1 El Rustbrute hace de dique (usuario, 2026-07-30)

**Síntoma en partida:** con una oleada grande y varios Rustbrute ya spawneados, los enemigos rápidos de detrás se quedan frenados. El Rustbrute va a 2.6 (el más lento del elenco) y tapona el avance de todo lo que viene detrás.

**Causa localizada:** `pushApart()` en `src/enemies.ts` reparte el solapamiento **50/50** — `push = (minDist - dist) * 0.5`, ambos cuerpos se desplazan lo mismo. No existe concepto de masa ni de prioridad. Y como el empuje va por el eje centro-a-centro, un enemigo que llega de frente contra un Rustbrute es empujado **hacia atrás**, no hacia un lado. En oleada densa, una fila de Rustbrutes es una presa móvil.

**Por qué "darles masa" NO basta:** que el Rustbrute no ceda su mitad solo hace que el ligero absorba todo el desplazamiento, y sigue siendo hacia atrás. No genera rodeo.

**La palanca que sí encaja, y ya existe:** `ENEMIES.obstacleAvoidance` (`lookAhead`, `clearance`, `steerStrength`) ya hace que los enemigos **esquiven props**. Tratar al Rustbrute como obstáculo dinámico en esa pasada haría que los rápidos lo **rodeen** en vez de apilarse contra él — reutiliza código ya probado en vez de inventar una regla nueva. Ojo al coste: hoy los obstáculos son estáticos y pocos.

**La parte de ataque (idea del usuario):** si además deja de depender del contacto — golpe de área o embestida telegrafiada — su lentitud pasa a ser temática ("tanque: llega tarde pero pega fuerte") en vez de un defecto. Hoy es `behavior: 'chase'` con daño de contacto puro, así que ser lento solo le resta.

**✅ IMPLEMENTADO 2026-07-30, pendiente de playtest humano.** Las dos mitades:

- `blocksOthers: true` en el tipo → el Rustbrute entra cada frame en el set de evasión (`rebuildDynamicObstacles`), así que el resto del enjambre lo **rodea**. Un charger a mitad de embestida se excluye a propósito: va rápido y comprometido, y dejarlo dentro hace que el enjambre esquive un cuerpo que ya no estará ahí. Y `sourceEnemy` existe solo para que un pesado no se esquive a sí mismo.
- `behavior: 'charger'` → se acerca lento, se planta, **destella** (tinte índice 6, naranja caliente, parpadeante) y embiste en línea recta comprometida, quedando clavado al recuperar.

Balance medido: `2.6 × 4.2 = 10.9`, justo **por debajo** de los 11 del jugador; la embestida recorre 6.0 unidades exactas y **no re-apunta** (verificado: 1 solo heading durante todo el lunge). Correr en línea recta apenas te salva; cualquier paso lateral durante los 0.45s de aviso la hace fallar. La recuperación clavada es el premio por leer el aviso.

Efecto colateral corregido: mover el tipo de `chase` a `charger` lo sacó en silencio del pool de élites (`ELITES.behaviors`), así que se añadió `'charger'` a esa lista.

### 5.2 Fragilidad conocida del harness de smoke

`tools/smoke-run.mjs` falla de forma **intermitente** en el `page.reload()` entre armas (`waitForNavigation` agota el tiempo). Reproducido 2 veces seguidas y luego pase limpio 5/5 con el mismo código, así que es una carrera de navegación del harness, no una regresión del juego. Si falla, volver a lanzarlo. Pendiente de endurecer.
