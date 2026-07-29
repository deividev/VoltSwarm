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
