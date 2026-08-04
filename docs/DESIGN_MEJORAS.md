# Voltswarm — Diseño de mejoras

No copiamos el contenido de Megabonk: extraemos las bases de su planteamiento y generamos ideas propias con identidad de scrapyard, ancladas a los sistemas que ya existen en el prototipo (cofres con beam, enjambre denso, kiting, rampa lineal). Este método aplica a TODOS los sistemas futuros — ver `METODO_DISENO.md`. Dirección de arte en `DIRECCION_ARTE.md`.

---

## Parte 0 — Las bases: cómo lo plantea Megabonk

Lo que hace que su sistema funcione, destilado de la wiki:

1. **Tres capas separadas que se multiplican entre sí.** Stats base del personaje (la ficha) × pasivas generales (tomos) × armas con mejoras propias. Cada capa escala a las otras: un stat global como Size o Projectile Count toca a cada arma de forma distinta — de ahí salen las builds.
2. **Identidad por restricción.** Damage es mejorable en todas las armas, pero el resto de stats está restringido por arma (Crit solo en 7 armas, Bounce solo en 4). Un arma no es solo su patrón de ataque: es QUÉ stats puede escalar. Eso hace que elegir arma sea elegir estrategia.
3. **Defensa con retornos decrecientes.** Armor y Evasion escalan con rendimiento decreciente para que nunca exista la build inmortal. La supervivencia siempre depende del posicionamiento.
4. **El riesgo como recurso.** El Cursed Tome SUBE la dificultad a cambio de más recompensa. Dar al jugador la palanca de riesgo es diseño, no contenido.
5. **El personaje es una identidad de build validada, no un preset barato.** Requiere loadout/arma inicial, perfil de stats, pasiva o regla signature y tradeoff significativo; las cuatro piezas se validan contra el balance antes de comprometerlo. Con las tres capas construidas, la implementación puede ser acotada, pero el diseño no es automático.

Nuestra regla derivada: **cada elemento nuevo debe interactuar con algo que ya existe** (enjambre, cofres, kiting, rampa). Si una mejora no cambia cómo te mueves o qué decides, es relleno.

---

## Leyenda

✅ ya implementado · 🟢 barato (config/1 función) · 🟡 medio (sistema pequeño) · 🔴 caro (sistema nuevo)

---

## Sistema de consumo — 3 categorías, sockets y tiers (cerrado 2026-07-08)

Decisiones que enmarcan todas las listas (proceso completo: sesión de diseño 2026-07-08 sobre los canales de consumo de Megabonk):

- **Taxonomia con una excepcion documentada (v3, 2026-07-17)**: stat permanente del draft -> **Core** (ocupa socket); comportamientos y consumibles -> **Mod** por cofre/chatarrero. Barrier Cell es Mod azul defensivo: no entra en sockets, level-up ni Chaos.
- **Sockets** (estado de cuenta, se amplían por Contratos de Desguace): armas **1 de inicio → 2** · cores **2 de inicio → 4**. **Sin swap en v1**: un core instalado es compromiso de todo el run. Números a revisitar con datos de playtest. Los primeros contratos de socket deben caer rápido (runs 1-3) para que el estado mínimo no se alargue.
- **5 tiers de rareza**: gris → verde → azul → morado → dorado. Las magnitudes de cores pasan a arrays de 5 en `upgrades.ts`; el roll por Luck se recalibra a 5 pesos; el tier regula precio del chatarrero y peso del jackpot. (Arte: ornamentos de rareza pasan de 3 a 4 — gris va limpio.)
- **Carta de arma con identidad (Opción A, ampliada 2026-07-17)**: la carta "+1 nivel" tira tier y muestra la mejora concreta ya escalada por esa rareza. Escala común tomada del patrón de las tablas de armas/tomos de Megabonk: gris/Common ×1 · verde/Uncommon ×1.2 · azul/Rare ×1.4 · morado/Epic ×1.6 · dorado/Legendary ×2. Opción B (roll del pool propio del arma, estilo Megabonk) sigue diferida.
- **Migración de recompensas de cofre (2026-07-08)**: **Lucky Gear** y **Cursed Core** pasan a CORES del draft (Lucky Gear = core de Luck, el core "meta" que mejora tus tiers; Cursed Core = core tradeoff +dificultad/+XP por nivel — paridad con el Cursed Tome). **Expansion Core se elimina** (redundante con Expansion Module). **Repair Kit, Volt Cache, Frenzy y Overdrive se integran en la lista de Mods como consumibles** — la ruleta del cofre tira del pool de mods completo, pesada por tier.
- **Desbloqueo v1**: sin moneda meta — Contratos de Desguace como único motor. Cada lista lleva columna default/contrato. HUD: sockets de cores en lista bajo la sección de armas.

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
| Combo Charge | Matar en ráfaga acumula carga; con carga alta, +daño. Recibir un golpe la resetea | Premia meterse en el enjambre — tensión contra el kiting pasivo | 🟡 |
| Momentum | +daño proporcional a segundos moviéndote sin parar; pararse lo pierde | El juego ES moverse; el stat lo convierte en build | 🟢 |
| Scrap Armor | Cada X kills genera 1 placa que absorbe 1 golpe (máx. N placas visibles orbitando) | Defensa que se GANA matando, y se ve en pantalla | 🟡 |

> **Nota de nomenclatura (2026-07-26): `Combo Charge` se llamaba `Heat`. NO volver a usar "Heat" para este stat.**
> **Scrapwake** — el co-op de extracción del Scrapverse — usa `Heat` como su mecánica ESPINA, con el significado **opuesto**: allá el calor es PELIGRO (extraer hace ruido, el ruido despierta al enjambre), no una recompensa por racha de kills.
> Los dos juegos van a compartir motor y módulos de código, así que dos `heat` con sentidos contrarios producirían bugs silenciosos y una colisión de API el día que se extraiga el paquete compartido. Se renombró el de Voltswarm porque acá es un stat menor **sin implementar** (cero coincidencias de "heat" en `src/` al 2026-07-26) y allá es la identidad del juego.
> Ver `Scrap_Extraction_Coop/SCRAPWAKE_PRD.md` §4.1.

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
| Flywheel | La Combo Charge tarda el doble en decaer | 🟡 |

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

### Cores v1 — reparto default/contrato (cerrado 2026-07-09)

Los 20 cores = 16 cartas de stat existentes + Chaos Module + Ammo Feeder + Lucky Gear y Cursed Core (migrados de cofre). Lógica: default = kit coherente para aprender; contrato = capas que definen builds avanzadas. Las condiciones concretas de cada contrato se diseñan en Fase 5.

- **Default (10)**: Power Coupling · Overclock · Servo Tune-Up · Hull Plates · Deflector Plates · Nanobot Swarm · Long Barrel · Magnet Coil · Ballistics Kit · Expansion Module
- **Por contrato (10)**: Targeting Chip + Piercing Rounds (la rama crit completa se GANA — decisión 2026-07-09: media rama suelta se percibe inútil aunque el crit base pegue +50%) · Ghost Plating · Rusty Spikes · Leech Coil (cadena de build tanque) · Capacitor Bank · Chaos Module · Ammo Feeder (power-spike tardío) · Lucky Gear · Cursed Core (rama de codicia/riesgo)

**Guardarraíl de compatibilidad (implementado 2026-07-17):** los cores que dependen de comportamiento de arma (Range, Projectile Speed, Area, Duration y Projectile Count) declaran qué armas/mods consumen ese stat y no se ofrecen si la build actual no contiene ninguno. Los cores universales no se filtran. Barrier Cell ya no ocupa un socket de core: es un Mod azul del pool de cofre/tienda, con 1–6 cargas y 7–10 copias de recarga.
Chaos Module reutiliza ese guardarraíl y la misma regla de valor marginal del draft directo: descarta Crit Chance y Lifesteal al alcanzar sus caps efectivos. Crit Chance y Lifesteal se limitan a 100%; Crit Damage y los demás stats sin techo no reciben un cap artificial.

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
| Tire Fire - implemented | Burning tire that rolls through the swarm | Damage, tire size, travel distance |
| Oil Sprayer ⏸️ FUERA DEL CAMINO DE DESBLOQUEO (2026-07-26) | Charcos que ralentizan al enjambre; 0 daño — control puro | Radio de charco, Fuerza de ralentización, Duración |
| Acid Drum ✅ (renombrada de "Acid Flask" 2026-07-05 — el frasco de cristal leía como poción medieval, no encajaba en la estética industrial/futurista) | Bidones industriales que dejan zona corrosiva con DoT | Power (DoT), Cycle, Radio de zona |
| Turbine Fan - implemented | Tornado launcher that shoves the swarm | Damage, tornado radius, knockback |
| Junk Ricochet ✅ | Chatarra cargada que rebota entre enemigos | Power, Cycle, +Rebote |
| Dismantler - implemented | Heavy claw that executes non-boss enemies below its threshold | Damage, execute threshold, claw range |

### Progresión por nivel y desbloqueo (v2, cerrado 2026-07-09)

- **Nivel máximo de arma: 20** (antes 5, `MAX_WEAPON_LEVEL`).
- **Todo escalado por nivel en % del valor BASE** (aditivo, no compuesto). Desde 2026-07-17 cada carta de rama acumula potencia segun su tier (`WEAPON_UPGRADE_TIER_SCALE`); el valor de config representa Common y los tiers superiores aplican x1.2/x1.4/x1.6/x2. La carta muestra el incremento real auto-generado desde `describeWeaponBranch`, sin strings manuales. El nivel nominal conserva elecciones y milestones; `WeaponPower` solo persiste la suma ponderada para snapshots compatibles y el combate lee exclusivamente `WeaponBranchLevels`.
- **Cantidad SOLO en Lv3 y Lv5**; desde Lv5 solo stats. **Ammo Feeder se redefine: "+1 unidad" del arma correspondiente** (proyectil/neumático/hoja/tornado) — el único escalador de cantidad post-Lv5, y está tras contrato (sinergia). El bounce del Ricochet queda solo de milestone.
- Blades y Turbine ganan milestones como el resto (decisión 2026-07-09): +1 hoja / +1 tornado en dirección distinta.
- Topes de diseño: execute threshold ≤30% (Dismantler) · slow con suelo ~25% de velocidad mínima (Oil — a nivel alto no puede congelar el enjambre).
- Números iniciales (regla de balance: un cambio por playtest):

| Arma | Cada nivel (%) | Lv3 y Lv5 (cantidad) | Desbloqueo |
| --- | --- | --- | --- |
| Bolt Cannon | +10% damage | +1 projectile | ✅ Default |
| Volt Pulse | +10% damage · +6% radius | — | ✅ Default |
| Orbital Blades | +10% damage | +1 blade | ✅ Default |
| Hydraulic Press | +12% damage · +5% width | — | ✅ Default |
| Tire Fire | Damage / tire size / travel distance branches | +1 tire | Default |
| Arc Welder | +10% damage · +8% ramp rate | — | 🔒 Contrato |
| Oil Sprayer | +6% puddle radius · +4% slow | — | ⏸️ Fuera del camino de desbloqueo (2026-07-26) |
| Acid Drum | +10% DoT DPS · +5% zone radius | — | 🔒 Contrato |
| Turbine Fan | Damage / tornado radius / knockback branches | +1 tornado | Contract |
| Junk Ricochet | +10% damage | +1 bounce | 🔒 Contrato |
| Dismantler | Damage / execute threshold / claw range branches | - | Contract |

Reparto **5 default / 6 contrato** (espeja el ~5-6 del roadmap): los 5 default cubren un arquetipo básico cada uno y TODOS se sostienen solos — con 1 socket de arma en cuenta nueva, un arma de 0 daño en el pool default sería una trampa. Los contratos enseñan mecánicas avanzadas: ramp, control, DoT, rebote, ejecución.

**⏸️ Oil Sprayer — FUERA DEL CAMINO DE DESBLOQUEO (decisión del usuario 2026-07-26).** Con 1 socket de arma, un arma de 0 daño no es "control puro", es una run perdida; el mismo argumento que la mantenía fuera del pool default la deja también fuera de los contratos. **No se borró nada**: `WeaponId`, `WEAPON_INFO`, icono, VFX e implementación siguen enteros, y el panel dev todavía la desbloquea para pruebas. Solo se quitó de `WEAPON_QUEUE` en `contracts.ts`, con lo que las armas por contrato pasan a **5 obtenibles** (Junk Ricochet por First Blood + 4 por la escalera Arsenal) y el peldaño Arsenal V queda de repuesto, oculto hasta que haya un arma que dar. Volver a meterla = añadir `'oil'` a ese array. Sigue sin sonido a propósito: no se produce SFX para un arma que quizá se rediseñe.

**Revisión pendiente (apuntada 2026-07-09, post-arte v1)**: cuando la v1 de arte + capturas + página Steam esté cerrada, pase a fondo del elenco de armas — si todas tienen sentido y qué ideas nuevas bien ambientadas merecen entrar.

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

## Lista 4 — Mods (pool único de cofre + chatarrero, aprobada 2026-07-08)

La base Megabonk que adoptamos: items = categoría separada del draft, obtenida explorando/gastando (sus cofres + Shady Guy → nuestra ruleta de cofre + chatarrero). El contenido es nuestro. Reglas de la categoría:

- **Un único pool, dos puertas**: la **ruleta del cofre** lo tira gratis (pesada por tier) y el **chatarrero** lo vende por **oro in-run** (dropean los kills), apareciendo periódicamente cerca del jugador con 2-3 mods.
- Dos naturalezas dentro del pool: **consumibles** (efecto al momento, re-obtenibles siempre) y **permanentes** (comportamientos que duran el run).
- **Los stats permanentes del draft son Cores**; los Mods no entran en sockets. Excepcion intencional: Barrier Cell modifica la defensa como comportamiento de Mod y se obtiene solo por cofre/chatarrero.
- **Copias sanas por Mod**: los permanentes escalan con su suelo/tope propio. Barrier Cell tiene cap duro de 10 copias: 1-6 suman carga hasta 6; 7-10 reducen recarga de 8s a 4s; al cap se filtra de cofre y chatarrero.
- El tier fija precio en el chatarrero y peso en la ruleta. Reparto: 12 default / 5 por contrato.

| Mod | Tier | Efecto (in-game, EN) | Stack por copia | Icono | Origen |
| --- | --- | --- | --- | --- | --- |
| Repair Kit | ⚪ Gris | Restores 40% of max HP | n/a — consumible | ✅ ya aprobado (`icon-item-repair`) | Default |
| Overdrive | ⚪ Gris | x1.5 move speed for 8s | n/a — consumible | ✅ ya aprobado (`icon-item-overdrive`) | Default |
| Volt Cache | 🟢 Verde | Instantly grants 50% of the XP for next level | n/a — consumible | ✅ ya aprobado (`icon-item-volt-cache`) | Default |
| Frenzy | 🟢 Verde | x2 damage for 10s | n/a — consumible | ✅ ya aprobado (`icon-item-frenzy`) | Default |
| Stun Bumper | ⚪ Gris | Every 8s, the next enemy that touches you is zapped and stunned 1.5s | −1s cooldown (mín. 3s) | Parachoques goma oscura + chispa cian | Default |
| Kick Plate | ⚪ Gris | Enemies that hit you are knocked back | +fuerza/radio | Placa de acero + flechas de empuje | Default |
| Loose Bolts | ⚪ Gris | Taking a hit scatters 3 damaging bolts around you | +2 pernos | Pernos hexagonales volando | Default |
| Detonator Rig | 🟢 Verde | Every 25 kills, the next kill explodes in an AoE | −5 kills (mín. 10) | Caja detonadora con émbolo | Default |
| Barrier Cell | Blue Azul | Blocks a full hit; copies 1-6 add charges to 6, copies 7-10 reduce recharge 8s to 4s | +1 charge, then -1s recharge; cap 10 copies | Reuses `icon-stat-shield-v2.png` | Default |
| Coolant Burst | 🟢 Verde | When a shield charge breaks, coolant freezes nearby enemies 2s | +radio | Bidón cian agrietado | Contrato |
| Orb Siphon | 🟢 Verde | Opening a chest pulls every XP orb on the map to you | +2s haste por cofre | Cofre + chorro de orbes azules | Default |
| Chain Relay | 🔵 Azul | Critical hits arc lightning to up to 3 nearby enemies | +1 salto | Relé industrial + arco bifurcado | Contrato |
| Piston Stompers | 🔵 Azul | Every 12 steps, stomp: AoE damage scaling with Move Speed | −2 pasos (mín. 6) | Bota con suela de pistón | Default |
| Overload Trigger | 🔵 Azul | Elite and boss kills overcharge you: +100% attack speed 5s | +2s | Interruptor industrial rojo en ON | Contrato |
| Phase Chassis | 🟣 Morado | After taking damage, phase 1s: enemies pass through you | +0.4s | Silueta de robot translúcida | Contrato |
| Foreman's Whistle | 🟣 Morado | The scrapper visits twice as often and stocks +1 mod | −10% precios (tope 50%) | Silbato de latón de fábrica | Default |
| Magnetron Heart | 🟡 Dorado | Every 45s: drags the whole horde toward you 2s, then a nova deals damage per enemy dragged | +daño por enemigo, −5s ciclo (mín. 30s) | Núcleo magnetrón con flechas de atracción | Contrato |

Notas: **Piston Stompers** recicla la idea descartada Piston Boots (Lista 3). Iconos de mods = familia visual propia con regla de "rima" contra el stat que tocan; **Barrier Cell es la excepcion aprobada** y reutiliza `icon-stat-shield-v2.png` porque ya lee claramente como defensa. Coolant Burst continua disparando al romper una carga.

---

## Economía in-run y el chatarrero (cerrado 2026-07-09)

**La moneda** (decisión 2026-07-09: **icono primero, nombre después** — se representa solo visualmente en v1; "scrap" y "cogs" descartados, candidatos vivos: Watts/Flux/Credits):

- **Drop in-world**: ficha hexagonal PLANA de oro (token voxel, oro cálido #f2b632 — el dorado ya usado en HUD), **girando sobre su eje Y** (lenguaje universal de moneda), brillo emisivo suave. Diferenciación por forma+color+movimiento: orbes XP = esferas AZULES flotando · cofres = beacon dorado GRANDE con beam · moneda = token plano diminuto girando.
- **Icono UI** (contador + precios): el hexágono de frente con un **rayo/volt grabado** al centro y borde oscuro — neutral al nombre futuro, ata con la marca Voltswarm. Precio en tienda: `[icono] 45`. ✅ **IMPLEMENTADO 2026-07-10**: `icon-ui-coin-v2.png`, rayo en el cian de marca `#63ecfd` (medido del logo — decisión del usuario para atar HUD y marca), cableado en contador/tienda/precios/prompt de cofre vía `coinHtml()` (hud.ts). Detalle en `PROMPTS_IMAGENES.md` §4b-bis.

- Drop: **25% de los kills → 2 unidades** · elites **10** · boss **50**. El drop normal pasó de 1 a 2 en el playtest económico del 2026-07-17: duplica el ingreso esperado por enemigo de 0.25 a 0.50 sin aumentar la cantidad de pickups ni tocar a la vez la rampa de precios. Obligatorio reusar el merge de los orbes de XP (pickups cercanos se funden) — con 400+ enemigos no se llena el suelo de monedas. Ingreso objetivo: ~400-500 por run de 10 min; validar compras reales en el siguiente playtest.
- **Los precios ESCALAN con el tiempo de run** (decisión 2026-07-09: la densidad de enemigos crece → el ingreso crece → precios fijos regalarían los tiers altos): `precio = base del tier × (1 + 0.12 × minuto)`. Bases: gris 25 · verde 45 · azul 80 · morado 140 · dorado 240. Todo en `config.ts`, un cambio por playtest.

**Rareza del draft (recalibrada 2026-07-17; unidad normalizada 2026-08-03):** pesos a `Luck = 0%` gris 62 · verde 27 · azul 9 · morado 1.8 · dorado 0.2. Con tres cartas, la probabilidad inicial de ver morado/dorado baja de 31.85% a 5.88%, y la de ver dorado baja de 8.73% a 0.60%. Luck se guarda y muestra como rating porcentual (`0.10` = `10%`), pero NO suma puntos porcentuales directos a una probabilidad: desplaza los pesos azul/morado/dorado y después se normaliza el pool. `luckShift` se reescaló para conservar exactamente la curva anterior; Lucky Gear sigue siendo la vía para abrir tiers altos de forma progresiva, no un requisito para que exista el jackpot inicial.

**El chatarrero** (vendedor futurista, misma estética del elenco):

- Visitas: **2:00, 5:00, 8:00** (cada 3 min desde la primera).
- Posición **random tipo totem del boss**, con `findClearSpot` — nunca dentro de props/totem/cofres.
- **Indicador de posición en pantalla** que guía al jugador, con **countdown de 60 s** (el tiempo que el chatarrero permanece) mostrado en el propio indicador.
- Stock: **3 mods**, tier pesado por Luck. **Sin reroll en v1** (apuntado: reroll de tienda para versiones avanzadas post-v1). El mod Foreman's Whistle dobla frecuencia y +1 stock (ya en Lista 4).
- Look (para las refs de 3 vistas): robot vendedor encorvado con **mochila-crate gigante** llena de piezas colgando — silueta única del elenco (regla de silueta por tipo). Señales de no-hostil: farol ámbar cálido, formas más redondas que los enemigos, quieto o con vaivén lento. Juguete industrial; paleta medida de la ref aprobada (regla estándar).

---

## Personajes — workstream de diferenciación (post-validación; contenido exacto pendiente)

Una silueta no define un personaje jugable. Cada personaje futuro debe tener las cuatro piezas y una decisión de build reconocible:

| Pieza obligatoria | Criterio |
|---|---|
| Loadout/arma inicial | Cambia la primera prioridad de la run; no es solo un icono distinto. |
| Perfil de stats | Ventaja inicial legible y coste o limitación compensatoria. |
| Pasiva o regla signature | Interactúa con sistemas reales (armas, cores, mods, economía o movimiento), no un bonus plano aislado. |
| Tradeoff significativo | Aporta una razón para elegirlo y otra para no hacerlo; debe sobrevivir playtest de balance. |

El primer personaje jugable es **Field Engineer**, evolución reconocible del jugador actual. Su gameplay y magnitudes están implementados; el modelo runtime v1 superó la validación técnica, pero las referencias visuales continúan como candidate hasta que exista aprobación final explícita del usuario. Los demás personajes siguen sin nombre, cifras ni pasivas comprometidas.

### ✅ Personaje inicial — Field Engineer

- **Rol:** perfil inicial legible y perdonador: 110 HP, Armor rating 5%, Damage ×0.95, Move Speed 11, Attack Speed ×1, crítico 5%/+50%, Luck/Regen 0.
- **Signature — Field Repair:** instalar o subir de tier un Core durante gameplay cura 6% de HP máximo después de aplicar el Core, con clamp y sin overheal. No dispara en load/replay/Boss Lab/rebuild.
- **Elección temprana:** Bolt Cannon conserva sus odds normales. Si aparece naturalmente, su tarjeta muestra `Recommended`; no se garantiza ni equipa por obligación.
- **Identidad:** supervivencia por HP/Armor y relación con Cores, NUNCA por movilidad. Cumple la regla de doblar un sistema existente en vez de añadir un stat plano como única identidad.
- **Visual:** casco de seguridad naranja grande, visor oscuro, cuerpo hueso/charcoal, mochila-taller unida, herramienta asimétrica en hombro derecho, refuerzos en antebrazos/botas, columna de energía cian y exactamente tres alojamientos grandes de Core conectados con cables gruesos. La lectura cenital debe ser casco + hombro herramienta + mochila.
- **Estado:** sistema jugable, selección, persistencia y UI implementados. Modelo runtime v1 técnicamente validado: preview 0°/90°/180°/270°, marcha trasera y gate 400+ superados (431–440 enemigos, 118.87 FPS medios, bucket mínimo 92.41 FPS, p99 8.5 ms, 0 errores de página y 431/431 enemigos en movimiento). Las referencias de `art/concept/field-engineer/` siguen candidate v1 porque no consta aprobación visual final explícita del usuario.

### Decisiones cerradas 2026-07-30 (detalle y medición en `DISENO_FRENESI.md` §4)

- **La identidad vive en REGLAS que doblan sistemas ya existentes**, no en la movilidad ni en un dash con parámetros distintos por personaje. Un dash con otros números es una hoja de stats, no un personaje. Enganchar a lo que ya está probado: sockets de arma/core, los 5 tiers, oro, chatarrero, cofres, pool de mods, contratos. Bocetos de dirección: apilador de armas (+1 socket de arma, −2 de core) · sobrecargado (mods un tier por encima, +50% daño de contacto) · bola de nieve (imán de XP global, ~30% más rápido de nivel, 60 HP).
- **R1 — Ningún personaje sobrevive por moverse bien.** La supervivencia sale de HP, armor, evasion, lifesteal o control; nunca de velocidad o esquiva. Cuando entre el dash universal, un personaje cuyo plan ya era esquivar saca mucho más provecho que el resto y obliga a recalibrar los tres.
- **El dash será universal e idéntico**, y llega DESPUÉS de la densidad y de que la profundidad cueste (medido: 4.2x más enemigos encima = el mismo daño, por el i-frame global). Que todos se muevan igual es lo que hace legibles las diferencias reales.
- **Se arranca con UN personaje**; el resto por contratos. Siempre **contrato firma, nunca peldaño de escalera** — un personaje no es contenido fungible. Segundo personaje gateado por **volumen** (`LIFETIME.runsFinished`/`totalKills`/`totalPlayS`, ya existen), tercero por **maestría**: con 0 bosses invocados en 6 runs y 33% de finalización, un gate de maestría en el segundo lo haría invisible para la mayoría.
- **El personaje inicial es el legible y perdonador, no el interesante.** Carga con las primeras ~10 runs de todo el mundo. Los bocetos raros son mala primera experiencia; el equilibrado va primero.
- Persistencia: `unlockedCharacters` en `PROFILE`, misma costura que las armas — IDs nunca índices, lo otorgado nunca se revoca, `PROFILE` se muta en su sitio.

### Dirección aprobada para la exploración futura

- Cada personaje podrá arrancar con **un stat mejorado y un contra-stat significativo**.
- Su perfil debe **sesgar, no forzar**, la sinergia con uno o más estilos de arma.
- Una pasiva pequeña debe completar su identidad más allá de los números base.
- Las combinaciones pueden ser definitorias y fuertes, pero deben mantenerse acotadas: no pueden invalidar las demás armas.
- **Las cifras de Field Engineer están fijadas para su primera versión jugable** y se recalibrarán con percentiles cuando exista una build comparable; no extrapolarlas a personajes futuros.

La exploración parte de un perfil compuesto por **sesgo de stat, contra-stat real, afinidad de estilo de arma y pasiva pequeña**. El objetivo es que la combinación personaje-build resulte fuerte y definitoria, pero nunca obligatoria ni desproporcionada: debe orientar una decisión temprana sin convertir el resto del arsenal en una elección errónea.

Evitar una identidad basada únicamente en daño global. Ese stat escala cada impacto de las armas, por lo que su ventaja se propaga a todo el arsenal y puede acabar dominando incluso cuando la intención era favorecer un estilo concreto. Los sesgos de comportamiento —área, movilidad, rango, cadencia o resistencia— permiten expresar una preferencia más acotada y legible.

#### Checklist de diseño

- [ ] Stat positivo que exprese una forma concreta de jugar.
- [ ] Contra-stat que genere un coste perceptible durante la run.
- [ ] Estilo de arma compatible, sin restringir el resto de opciones.
- [ ] Pasiva pequeña que complete la identidad sin sustituir al build.
- [ ] Build alternativo viable para que la afinidad no se convierta en obligación.

#### Arquetipos ilustrativos — no finales

Estos ejemplos describen relaciones de diseño, no personajes, pasivas, nombres ni valores aprobados:

| Arquetipo | Sesgo y tradeoff | Afinidad de estilo | Papel de la pasiva futura |
|---|---|---|---|
| Control de zona | Más área a cambio de menor movilidad. | Ataques de zona como Pulse o Press. | Reforzar la colocación y el control de espacio, no añadir daño universal. |
| Hostigamiento móvil | Más movilidad y rango a cambio de menor resistencia. | Proyectiles de alcance y rebote como Bolt o Ricochet. | Favorecer el reposicionamiento y la selección de objetivos, sin bloquear un build cercano viable. |
| Presión sostenida | Más cadencia y resistencia a cambio de menor área o movilidad. | Un estilo de fuego rápido o continuo, pensado para mantener presión. | Apoyar la continuidad de combate sin convertir cada impacto del juego en una mejora global. |

La elección definitiva de contra-stats, afinidades y pasivas se validará con el contenido completo de Mapa 2 Swarm Foundry, Hazard Marshal y percentiles de runs humanas comparables. Hasta entonces, estos arquetipos son hipótesis de exploración, no contratos de implementación.

Fuentes estructurales: [Megabonk en Steam](https://store.steampowered.com/app/3405340/Megabonk/) · [Vampire Survivors en Steam](https://store.steampowered.com/app/1794680/Vampire_Survivors/).

## Weapon branches v1 - implemented 2026-07-17

Megabonk is used structurally: universal damage exists alongside weapon-specific upgrade pools. Voltswarm applies that principle without copying its weapons, names, or text. Every owned weapon now offers three original branch cards. Each pick advances nominal level. Lv3/Lv5 quantity milestones apply only to Bolt Cannon, Orbital Blades, Tire Fire, Turbine Fan, and Junk Ricochet; tier power changes only the selected behavior. The branch card explicitly shows any simultaneous quantity gain. A level-up screen may contain only one branch for a given weapon; the other cards prefer an eligible installed core, another weapon, or an unlock. If uniqueness exhausts a normal supported draft, a run-only Gold fallback appears instead of duplicating a branch or offering a capped core. Branch groups: Bolt (damage/cadence/size), Pulse (damage/radius/cadence), Blades (damage/orbit/rotation), Welder (damage/ramp/range), Press (damage/width/cadence), Tire (damage/size/travel), Oil (radius/slow/duration), Acid (DoT/radius/cadence), Turbine (damage/radius/knockback), Ricochet (damage/bounces/cadence), and Dismantler (damage/execute/range).
