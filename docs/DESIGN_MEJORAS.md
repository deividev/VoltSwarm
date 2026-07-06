# Voltswarm — Diseño de mejoras

No copiamos el contenido de Megabonk: extraemos las bases de su planteamiento y generamos ideas propias con identidad de scrapyard, ancladas a los sistemas que ya existen en el prototipo (cofres con beam, enjambre denso, kiting, rampa lineal). Este método aplica a TODOS los sistemas futuros — ver `METODO_DISENO.md`. Dirección de arte en `DIRECCION_ARTE.md`.

---

## Parte 0 — Las bases: cómo lo plantea Megabonk

Lo que hace que su sistema funcione, destilado de la wiki:

1. **Tres capas separadas que se multiplican entre sí.** Stats base del personaje (la ficha) × pasivas generales (tomos) × armas con mejoras propias. Cada capa escala a las otras: un stat global como Size o Projectile Count toca a cada arma de forma distinta — de ahí salen las builds.
2. **Identidad por restricción.** Damage es mejorable en todas las armas, pero el resto de stats está restringido por arma (Crit solo en 7 armas, Bounce solo en 4). Un arma no es solo su patrón de ataque: es QUÉ stats puede escalar. Eso hace que elegir arma sea elegir estrategia.
3. **Defensa con retornos decrecientes.** Armor y Evasion escalan con rendimiento decreciente para que nunca exista la build inmortal. La supervivencia siempre depende del posicionamiento.
4. **El riesgo como recurso.** El Cursed Tome SUBE la dificultad a cambio de más recompensa. Dar al jugador la palanca de riesgo es diseño, no contenido.
5. **El personaje es un preset, no un sistema.** Stats iniciales distintos + arma inicial distinta + un pasivo único. Con las tres capas construidas, añadir personajes es barato.

Nuestra regla derivada: **cada elemento nuevo debe interactuar con algo que ya existe** (enjambre, cofres, kiting, rampa). Si una mejora no cambia cómo te mueves o qué decides, es relleno.

---

## Leyenda

✅ ya implementado · 🟢 barato (config/1 función) · 🟡 medio (sistema pequeño) · 🔴 caro (sistema nuevo)

---

## Lista 1 — Stats del personaje (la ficha)

Núcleo genérico inevitable del género + stats propios que solo tienen sentido en NUESTRO juego.

### Núcleo

| Stat | Qué hace | Estado |
| --- | --- | --- |
| Integrity (HP) | Vida máxima | ✅ |
| Power | Multiplicador de daño global | ✅ |
| Cycle Rate | Reduce cooldowns de todas las armas | ✅ |
| Servos | Velocidad de movimiento | ✅ |
| Plating | Reducción de daño de contacto (retornos decrecientes) | 🟢 |
| Auto-Repair | Regenera HP por minuto SIN enemigos en radio corto — premia crear espacio, no esconderse | 🟡 |

### Propios de Voltswarm

| Stat | Qué hace | Por qué es nuestro | Estado |
| --- | --- | --- | --- |
| Magnetism | Radio en el que los cofres se deslizan hacia vos | Interactúa con el sistema de cofres, no con drops que no tenemos | 🟢 |
| Salvage | Probabilidad de que un kill suelte un micro-cofre (mini recompensa instantánea) | Convierte matar en generar objetivos de movimiento | 🟡 |
| Heat | Matar en ráfaga acumula calor; con calor alto, +daño. Recibir un golpe lo resetea | Premia meterse en el enjambre — tensión contra el kiting pasivo | 🟡 |
| Momentum | +daño proporcional a segundos moviéndote sin parar; pararse lo pierde | El juego ES moverse; el stat lo convierte en build | 🟢 |
| Scrap Armor | Cada X kills genera 1 placa que absorbe 1 golpe (máx. N placas visibles orbitando) | Defensa que se GANA matando, y se ve en pantalla | 🟡 |

---

## Lista 2 — Mejoras generales (pool de level-up)

La base Megabonk: pasivas que suben la ficha. Nuestra vuelta: la mitad del pool son **tradeoffs** — la palanca de riesgo repartida por todo el pool, no en un solo tomo maldito.

### Directas (suben un stat de la Lista 1)

| Mejora | Efecto | Estado |
| --- | --- | --- |
| Power Coupling | +25% Power | ✅ |
| Overclock | +20% Cycle Rate | ✅ |
| Servo Tune-Up | +12% Servos | ✅ |
| Hull Plates | +25 Integrity | ✅ |
| Magnet Coil | +Magnetism | 🟢 |
| Salvage Scanner | +Salvage | 🟡 |
| Heat Sink | El Heat tarda el doble en decaer | 🟡 |

### Con tradeoff (identidad nuestra)

| Mejora | Efecto | El precio | Estado |
| --- | --- | --- | --- |
| Unstable Core | +40% Power | −20% Integrity máxima | 🟢 |
| Stripped Chassis | +25% Servos | Los enemigos también corren +10% | 🟢 |
| Loud Beacon | Cofres aparecen 40% más seguido | Cada cofre atrae una mini-oleada al abrirse | 🟡 |
| Volatile Ammo | Los proyectiles explotan en área pequeña | −30% velocidad de proyectil | 🟡 |
| Scavenger Pact | +50% XP | Los cofres ya no curan (Repair Kit fuera del pool de cofres) | 🟢 |
| Rusty Spikes | Los enemigos que te tocan reciben tu daño de contacto ×3 | +1 s de invulnerabilidad menos tras cada golpe | 🟢 |
| Emergency Battery | Al llegar a 0 HP: explosión masiva y sobrevivís con 1 HP | Una vez por run; ocupa una elección | 🟡 |
| Siren Protocol | +1 carta para elegir en cada level-up (4 en vez de 3) | +10% velocidad de rampa de dificultad | 🟢 |

### Mecánicas del pool (base Megabonk, adopción directa)

- **Reroll** (N por run) y **Skip** — 🟡
- **Banish**: eliminar una carta del pool el resto del run — 🟡

---

## Lista 3 — Armas / habilidades

La base Megabonk que adoptamos: cada arma tiene **su propia lista de stats mejorables** (Power siempre; el resto restringido por arma → identidad). Las ideas son nuestras: cada arma nace de una herramienta de desguace y de una interacción con el enjambre.

### Ya implementadas (11 armas shippeadas, draft de 11 — sincronizado con `WEAPON_INFO` en `src/config.ts`, 2026-07-05)

| Arma | Patrón | Stats propios mejorables |
| --- | --- | --- |
| Bolt Cannon ✅ | Perno al enemigo más cercano | Power, Cycle, +Proyectil, Vel. proyectil |
| Volt Pulse ✅ | Onda periódica alrededor | Power, Cycle, Radio |
| Orbital Blades ✅ | Hojas orbitando por contacto | Power, +Hoja, Vel. rotación |
| Arc Welder ✅ | Rayo continuo al más cercano; el daño CRECE mientras no cambie de objetivo (anti-kiting inverso) | Power, Alcance, Ramp/s |
| Hydraulic Press ✅ | Pistón que aplasta una franja frontal cada X s | Power, Cycle, Ancho de franja |
| Tire Fire ✅ | Neumático ardiendo que rueda en línea recta atropellando todo | Power, Cycle, Vel., +Neumático |
| Oil Sprayer ✅ | Charcos que ralentizan al enjambre; 0 daño — control puro | Radio de charco, Fuerza de ralentización, Duración |
| Acid Drum ✅ (renombrada de "Acid Flask" 2026-07-05 — el frasco de cristal leía como poción medieval, no encajaba en la estética industrial/futurista) | Bidones industriales que dejan zona corrosiva con DoT | Power (DoT), Cycle, Radio de zona |
| Turbine Fan ✅ | Tornados que empujan al enjambre (knockback) | Power, Cycle, Radio (la fuerza de empuje es fija, no escala con nivel — pendiente `knockbackForcePerLevel`) |
| Junk Ricochet ✅ | Chatarra cargada que rebota entre enemigos | Power, Cycle, +Rebote |
| Dismantler ✅ | Garra pesada; EJECUTA enemigos no-boss bajo 15% HP | Power, Cycle, Umbral de ejecución |

### Ideas descartadas / no implementadas (quedaban en el backlog original, no forman parte del draft de 11 shippeado)

| Arma | Patrón | Interacción que la hace nuestra |
| --- | --- | --- |
| Spark Plug | Chispa que ENCIENDE charcos de aceite (daño en área sobre empapados) | Sinergia con Oil Sprayer — superada por Acid Drum como arma de DoT |
| Grappling Claw | Garra que engancha al enemigo más LEJANO del radio y lo arrastra hacia vos | Usa la densidad del enjambre como daño — candidata para evolución futura |
| Compactor Field | Atrae enemigos cercanos y los comprime (daño por apretujarse) | Agrupa el enjambre para el Pulse/explosiones — solapa con Turbine (empuje inverso) |
| Salvage Drone | Dron que orbita lejos y ARRASTRA cofres lejanos hacia vos | Arma-utilidad conectada al sistema de cofres — no existe en Megabonk |
| Junk Turret | Torreta desplegable donde estás parado; dispara sola 15 s | Ancla territorial |
| Piston Boots | Cada X pasos, pisotón AoE bajo el jugador | Escala con Move Speed — el movimiento ES el arma |

### Regla de evolución (fase 2, 🔴)

Arma al máximo + stat relacionado alto → forma evolucionada (ej. Oil Sprayer max + Spark Plug max → **Inferno Refinery**: los charcos arden permanentemente). Base del género que Megabonk también usa; solo cuando las armas base estén validadas.

---

## Personajes (post-validación)

Con las tres capas construidas, un personaje = stats iniciales + arma inicial + un pasivo único. Bocetos para entonces:

- **The Welder** — empieza con Arc Welder; pasivo: Heat no se resetea al recibir golpe, solo baja a la mitad.
- **The Rat** — empieza con Piston Boots; +Servos, −Integrity; pasivo: Momentum sube el doble de rápido.
- **The Magnet** — empieza con Salvage Drone; pasivo: Magnetism enorme, los cofres dan doble recompensa, pero −20% Power (vive de los cofres, no de las armas).

Fuentes de las bases: [megabonk.wiki/Weapons](https://megabonk.wiki/wiki/Weapons) · [megabonk.wiki/Tomes](https://megabonk.wiki/wiki/Tomes) · [megabonk.wiki/Stats](https://megabonk.wiki/wiki/Stats)
