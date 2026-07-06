# Voltswarm — Método de diseño de sistemas

Regla vigente desde el 2026-07-02 para TODO sistema nuevo (armas, mejoras, enemigos, economía, meta-progresión, jefes, eventos...):

**Copiamos la BASE de Megabonk, nunca su contenido. La estructura es de ellos; las ideas son nuestras.**

## El proceso, en 4 pasos

1. **Estudiar cómo lo plantea Megabonk.** Fuente real (wiki, el juego), no memoria. Qué capas tiene el sistema, cómo se conectan, qué restricciones impone.
2. **Extraer el principio, no la lista.** La pregunta es "¿por qué funciona?", no "¿qué contiene?". Ejemplo: de sus tomos no extraemos "Agility Tome +15%", extraemos "las pasivas globales multiplican a las armas de forma distinta según el arma → de ahí salen las builds".
3. **Generar ideas propias ancladas a NUESTROS sistemas.** Cada elemento nuevo debe interactuar con algo que ya existe (enjambre denso, cofres con beam, kiting, rampa lineal, Heat/Momentum). Si una idea no cambia cómo te movés o qué decidís, es relleno y se descarta.
4. **Tematizar en "juguete industrial".** Robots, herramientas de desguace, metal pintado (ver `DIRECCION_ARTE.md`). Si la idea no se puede contar con esa fantasía, se rediseña o se descarta.

## Principios base ya extraídos de Megabonk

(Detalle completo en `DESIGN_MEJORAS.md`, Parte 0)

- Tres capas que se multiplican: ficha de stats × pasivas generales × armas con mejoras propias.
- Identidad por restricción: cada arma solo mejora ciertos stats.
- Defensa con retornos decrecientes: nunca existe la build inmortal.
- El riesgo como recurso que el jugador elige.
- El personaje es un preset de las tres capas, no un sistema aparte.

## Anti-patrones (prohibido)

- Renombrar 1:1 un elemento de Megabonk y darlo por diseñado.
- Añadir un stat/arma/mejora "porque el género lo tiene" sin interacción con nuestros sistemas.
- Diseñar contenido cuyo coste visual rompa las reglas de `DIRECCION_ARTE.md` (silueta única, paleta, presupuesto de draw calls).
