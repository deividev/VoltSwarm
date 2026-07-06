# Comparativa Megabonk ↔ Voltswarm

Fecha: 2026-07-03. Fuentes: [megabonk.wiki/Weapons](https://megabonk.wiki/wiki/Weapons) · [megabonk.wiki/Tomes](https://megabonk.wiki/wiki/Tomes) · [megabonk.wiki/Stats](https://megabonk.wiki/wiki/Stats) · [guía Steam de upgrades](https://steamcommunity.com/sharedfiles/filedetails/?id=3576905235).

Recordatorio del método (`METODO_DISENO.md`): esta comparativa NO es una lista de compras. Sirve para detectar huecos ESTRUCTURALES; el contenido que los llene será nuestro.

---

## 1. Armas — 29 de Megabonk vs 6 nuestras

### Cobertura por arquetipo

| Arquetipo | Megabonk | Voltswarm | Estado |
| --- | --- | --- | --- |
| Golpe auto al más cercano | Sword, Katana, Hero Sword | Bolt Cannon | ✅ |
| AoE periódico alrededor | Aura, Lightning Staff, Frostwalker | Volt Pulse | ✅ |
| Orbitales por contacto | Chunkers | Orbital Blades | ✅ |
| Perforante en línea | Bow, Sniper Rifle | Tire Fire | ✅ (versión física rodante, más 3D) |
| Rayo/vínculo sostenido | Space Noodle | Arc Welder | ✅ (el ramp por fijar objetivo es nuestro) |
| Zona frontal contundente | — (lo más cercano: Sword) | Hydraulic Press | ✅ ORIGINAL nuestro |
| Estela al moverse | Flamewalker | Oil Trail (diseñada, no construida) | 📋 |
| Rebote entre enemigos | Bone, Bananarang, + stat Bounce | Junk Ricochet (diseñada) | 📋 |
| Abanico/escopeta | Shotgun, Revolver | Scrap Shotgun (diseñada) | 📋 |
| Cono direccional | Dragon's Breath | Plasma Torch (diseñada) | 📋 |
| Minas | Mines | Proximity Mines (diseñada) | 📋 |
| Homing | Slutty Rocket | Homing Rockets (diseñada) | 📋 |
| Atracción/agrupar | Black Hole | Junk Magnet / Compactor Field (diseñadas) | 📋 |
| Zona de daño en el tiempo | Poison Flask | Acid Flask (diseñada) | 📋 |
| Empuje/knockback | Tornado | Turbine (diseñada) | 📋 |
| Arma defensiva | Aegis (bloquea + onda) | — | ❌ HUECO |
| Armas "twist" de build | Dexecutioner (ejecuta), Corrupted Sword (+daño con poca vida), Blood Magic (roba vida), Dice (daño aleatorio) | — | ❌ HUECO |
| Apuntado manual opcional | Sniper, Shotgun | — | ❌ A PROPÓSITO (pilar: sin apuntado) |

### Lectura

- **Cantidad**: 6 vs 29. Para que el draft inicial y el tope de 2 armas generen builds variadas, el objetivo razonable es 10-12. El backlog de `DESIGN_MEJORAS.md` ya cubre 10 arquetipos — es construir, no diseñar.
- **Hueco estructural #1 — estados alterados**: Frostwalker congela, Poison Flask envenena, Tornado empuja. Nosotros NO tenemos sistema de estados (slow/DoT/knockback). Sin él, media lista de armas futuras no se puede construir. Es el prerequisito técnico más importante.
- **Hueco #2 — armas condicionales ("twist")**: ejecutar bajo % de vida, más daño con poca vida, robo de vida. Son baratas de código y carísimas en identidad de build. Versiones nuestras: *Chatarra Desesperada* (+daño por HP faltante), *Desguazador* (ejecuta <15% HP), *Sanguijuela Magnética* (lifesteal).
- **Hueco #3 — arma defensiva** (Aegis): con Shield/Thorns en la ficha (ver abajo) sale natural: *Placa Reactiva* — bloquea contacto frontal y devuelve onda.

---

## 2. Mejoras generales — 23 tomos vs nuestro pool

### Cubierto (12 de 23)

| Tomo Megabonk | Nuestro equivalente |
| --- | --- |
| Damage | Power Coupling |
| Cooldown (atk speed) | Overclock |
| Agility (move speed) | Servo Tune-Up |
| Health | Hull Plates |
| Regen | Nanobot Swarm |
| Precision (crit) | Targeting Chip |
| Projectile Speed | Ballistics Kit |
| Size | Expansion Module + cofre Area |
| Armor | Deflector Plates |
| Attraction (pickup) | Magnet Coil |
| Quantity (+1 proyectil) | Ammo Feeder (épica) |
| Luck / Cursed / XP | Cofres: Lucky Gear, Cursed Core (dificultad+XP) |

Además tenemos **Attack Range** y **Crit Damage** como mejoras propias que Megabonk no ofrece como tomo. Bien.

### NO cubierto (los huecos, por valor)

| Tomo | Qué haría en nuestro juego | Coste |
| --- | --- | --- |
| Evasion | % de esquivar un golpe entero — segunda capa defensiva con retornos decrecientes | 🟢 |
| Shield | Barrera que absorbe antes que la vida y recarga a los 5 s sin daño — premia el buen kiting | 🟡 |
| Bloody (lifesteal) | % de robar 1 HP por golpe — sinergia con attack speed | 🟡 |
| Thorns | Refleja daño al contacto — build "tanque" viable | 🟢 |
| Duration | Alarga buffs de cofre (Frenzy/Overdrive) y futuras zonas (Acid, Oil) | 🟢 |
| Chaos | Stat aleatorio — carta de apuesta, barata y divertida | 🟢 |
| Knockback | Requiere el sistema de estados (hueco #1) | 🟡 |
| Golden/Silver (moneda) | Economía → meta-progresión. POST-VALIDACIÓN, no tocar | ⛔ |
| Overheal | Curarse sobre el máximo — nicho, baja prioridad | 🟡 |

### Diferencia de sistema en rarezas

- Megabonk: **5 rarezas** (Común 1x → Legendaria 2x) y las cartas de ARMA eligen 1-2 stats del pool propio del arma según rareza.
- Nosotros: **3 rarezas** (Común/Rara/Épica) y la carta de arma es un "+1 nivel" fijo.
- Veredicto: 3 rarezas está BIEN para el prototipo (más legible). El hueco real es que nuestras cartas de arma no tienen identidad por arma: en Megabonk subir la Shotgun te ofrece perdigones o crit, subir el Black Hole te ofrece duración o tamaño. Nuestra mejora equivalente: que la carta "+1 nivel de arma" muestre QUÉ mejora concreta da a ese arma en ese nivel (ya es determinista en config) — barato, y a futuro, 2 opciones de mejora distintas por arma.

---

## 3. Ficha de stats — 8 de Megabonk vs 15 nuestros

Megabonk documenta: Max HP, HP Regen, Overheal, Shield, Armor, Evasion, Lifesteal, Thorns (los defensivos; los ofensivos van implícitos en tomos/armas). Nosotros: 15 stats, fuertes en ofensiva (crit, crit dmg, range, proj speed, area...) y **cojos en defensa**: solo Armor y Regen. Megabonk tiene 6 capas defensivas distintas; nosotros 2. Por eso todas nuestras builds defienden igual: moviéndose. Añadir Evasion + Thorns (🟢) y Shield + Lifesteal (🟡) abriría la primera build tanque real.

---

## 4. Plan recomendado (orden)

1. **Sistema de estados alterados** (slow, DoT, knockback) — prerequisito de media lista de armas. 🟡
2. **Defensa: Evasion + Thorns** (🟢), luego **Shield + Lifesteal** (🟡) — con sus cartas de módulo.
3. **Duration + Chaos** como cartas nuevas — 🟢, variedad inmediata del pool.
4. **3-4 armas nuevas del backlog** usando estados: Oil Trail (slow), Acid Flask (DoT), Turbine (knockback), Junk Ricochet — sube el draft a 10 armas.
5. **1-2 armas twist** (ejecución / daño por vida faltante) — identidad de build barata.
6. Cartas de arma con identidad por arma (mostrar la mejora concreta del nivel).
7. Economía/moneda y Overheal — post-validación, NO ahora.
