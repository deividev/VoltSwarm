# Personajes de lanzamiento — estado y briefs

**Field Engineer, Rack Hauler, and Overclocker are final and CLOSED for the current release scope.** Two of a Kind unlocks the third after two distinct registered character IDs complete the arc. No further launch-character production work remains active.

## Estado rápido

| Character | Role | Gameplay | Art | Runtime |
|---|---|---|---|---|
| Field Engineer | Forgiving starting character | Implemented | Runtime v1 definitively approved in-game | Playable |
| Rack Hauler | Broad weapon rack / shallow Core depth | Implemented | Seafoam v3 approved; Map 1/2 checked | Playable; specific 400+ gate passed |
| Overclocker | Premium loot / glass body | Final | Runtime v1 approved by explicit user acceptance | Closed; no separate 400+ result claimed |

## Field Engineer

### Decisión de producto

Debe ser una evolución reconocible del jugador actual y cargar con las primeras runs de un jugador nuevo. Su identidad nace de tolerar errores y relacionarse con los Cores; no de moverse mejor que el resto.

| Pieza | Candidato para validar |
|---|---|
| Perfil | 110 HP, Armor rating 0%, daño ×0.95, velocidad 11; Attack Speed ×1, crítico 5%/+50%, Luck y Regen 0. |
| Signature | **Field Repair**: instalar o subir de tier cualquier Core excepto Hull Plates durante gameplay cura 1% de HP máximo después de aplicar el Core, con clamp y sin overheal. No dispara al cargar/reproducir/reconstruir builds ni en Boss Lab. |
| Draft inicial | Bolt Cannon conserva las mismas odds y solo recibe la etiqueta `Recommended` cuando aparece naturalmente. Nunca se garantiza ni equipa por fuerza. |
| Regla de movilidad | Ninguna ventaja exclusiva. El personaje sobrevive por HP máximo y la signature de Cores. |
| Tradeoff | Menor daño base a cambio de margen defensivo; magnitudes fijadas para la primera versión jugable y sujetas a recalibración con percentiles. |

### Estado implementado

- `src/characters.ts` es el registry data-driven y usa IDs estables; `field-engineer` está desbloqueado por defecto.
- Flujo: Play → selección de personaje → draft de arma → loading → run. El menú Characters reutiliza el mismo registry.
- `PROFILE.unlockedCharacters` persiste IDs y Proving Ground concede Rack Hauler mediante un reward de personaje activo.
- `Proving Ground` y `Two of a Kind` están activos; el catálogo no contiene definiciones latentes.
- Selection, character details, and model v1 are integrated at runtime. The body uses measured-profile extrusion with a pack-free `side-depth` sheet; `backPaintRef` paints the existing shell, while dedicated procedural geometry restores the pack's rear volume. Multi-angle inspection, rear-view locomotion, and the 400+ enemy swarm gate passed, and the runtime model is definitively approved in-game.

## Rack Hauler — implementado y jugable

### Decisión de producto

Rack Hauler dobla la capacidad de build horizontal: carga un arma más y un Core menos que el perfil global. La diferencia se proyecta por run; **nunca** reescribe `PROFILE` ni altera lo que liquidan los Contracts de sockets.

| Pieza | Plan fijado para integración |
|---|---|
| Perfil | 100 HP, Armor 10%, Damage ×0.90, Move Speed 11, Attack Speed ×1, crítico 3%/+50%, Luck/Regen 0. |
| Signature | **Open Rack**: +1 socket de arma y −1 socket de Core sobre la capacidad global abierta y máxima. Es su única Signature; no existe garantía de arma nueva ni manipulación de odds. |
| Capacidad inicial | Field Engineer/global 2 armas/2 Cores → Rack Hauler 3 armas/1 Core. |
| Progresión | Boss Hunter conserva `PROFILE` 2→3 y Rack proyecta 3→4 armas. Second Wind y Full Loadout conservan Cores globales 2→3→4 y Rack proyecta 1→2→3. |
| Draft inicial | Orbital Blades es solo `Suggested Start`; no cambia pool, orden ni probabilidades. |
| Tradeoff | Más cobertura de armas y menos profundidad en los multiplicadores compartidos de Cores, con Damage y Crit Chance por debajo del baseline. |

### Estado técnico

- `CHARACTER_BALANCE.rackHauler` contiene todas las magnitudes y `CHARACTER_REGISTRY['rack-hauler']` aporta portrait, `modelKey`, identidad, tradeoff, arma sugerida y desbloqueo estable.
- El resolver puro de capacidad deriva sockets efectivos desde el `PROFILE` global y offsets config-backed. El draft y el RIG in-run ya consumen esa proyección; Field Engineer sigue produciendo exactamente 2/2→3/4.
- `src/socket-rewards.ts`, persistencia, liquidación de Contracts y pips de la UI de Contracts siguen globales. Seleccionar un personaje nunca mutará `PROFILE`.
- Runs guardadas, replay y Boss Lab restauran `rack-hauler` por ID aunque el perfil actual esté bloqueado; IDs desconocidos sí conservan el fallback histórico a Field Engineer.
- `Proving Ground` y `Two of a Kind` están activos. El catálogo queda en 29 Contracts declarados / 29 activos / 0 latentes.
- Arte runtime final: `ref-rack-hauler-{front,side,back,top}-v3-seafoam.png`, paleta seafoam `#BAE8C6`, tool green `#3B9B73`, graphite `#202830` y visor `#E9F6FF`. El modelo medido usa 14.914 vóxeles / 13.120 triángulos por instancia.
- Se verificaron previews cardinales 0°/90°/180°/270° y lectura real en Mapa 1 y Mapa 2. El harness read-only por hooks DEV seleccionó Rack Hauler real con desbloqueo solo en memoria y sostuvo 430 enemigos durante 12 s en Mapa 2: 430/430 movidos, modelo `rack-hauler` antes/después, 119.94 FPS medios, bucket mínimo 119.76, mediana 8.3 ms, p99 8.5 ms, 13.120 triángulos y 0 errores de página. Esto supera el gate específico 400+ de lectura/modelo sin degradación obvia. No equivale al benchmark canónico VFX-heavy de 65 s porque `tools/perf-stress.mjs` siempre confirma Field Engineer y no acepta personaje; parametrizarlo sigue siendo cobertura extendida, no un gate abierto de Rack.

### Checklist de integración

- [x] Aprobar frontal/lateral/trasera/top planas y retrato frontal empaquetado.
- [x] Registrar `modelKey` y modelo sin fallback de clave a Field Engineer.
- [x] Validar lectura cenital e in-game en Mapa 1 y Mapa 2.
- [x] Superar el gate específico de 400+ enemigos con movimiento y rendimiento medidos.
- [x] Integrar la definición runtime y activar `Proving Ground` con su reward de personaje.
- [x] Verificar selector bloqueado/desbloqueado, RIG 3/1→4/3 y persistencia por ID.

## Overclocker — implementado y jugable

### Decisión de producto

Overclocker dobla el sistema de tiers de recompensa: obtiene antes Mods de mayor rareza, pero el contacto físico castiga mucho más su cuerpo ligero. La promoción debe ser honesta y suceder antes de materializar la recompensa, su señal visual o su precio.

| Pieza | Contrato aprobado |
|---|---|
| Perfil | 85 HP, Move Speed 11, Damage ×1, Armor 0, Evasion 18 (15,25% efectivo), Crit Chance 8%, Crit Damage +50%, Attack Speed ×1, Luck/Regen 0. |
| Signature | **Runaway Draw**: cada cofre y cada slot del Chatarrero suben un tier antes de seleccionar el Mod: Gray→Green→Blue→Purple→Gold y Gold→Gold. Cambia el pool, no la potencia de un mismo Mod. |
| Alcance | Solo cofres y Chatarrero. Nunca afecta level-up, Cores, Chaos Module ni recompensas de Contracts. |
| Presentación y precio | Beam, tier del reel, recompensa y precio corresponden al tier ya promovido. No se muestra ni se cobra el tier anterior. |
| Tradeoff | Recibe ×1,35 de daño solo por contacto físico del swarm, élites, cuerpo de bosses y embestidas. No modifica proyectiles ni ataques telegrafiados. |
| Suggested Start | Volt Pulse, sin equiparlo, garantizarlo ni alterar sus odds. |
| Contract | **Two of a Kind**: completar el arco completo con dos IDs de personaje distintos. El progreso requiere un ledger monotónico y concede `overclocker` por ID estable. |

### Fallback de pool

1. Se intenta materializar un Mod elegible del tier promovido.
2. Si el tier no tiene candidatos válidos, se desciende tier a tier hasta encontrar el primero elegible.
3. Nunca se entregan Mods bloqueados o capados, ni Repair Kit con HP completo.
4. Si no existe ningún candidato en ningún tier, el flujo debe mostrar y resolver explícitamente la ausencia de recompensa; no puede inventar un Mod ni romper la apertura.

### Dirección visual aprobada

- Autoridad visual: `art/concept/overclocker/overclocker-concept-v3.png`. Los concepts V1/V2 quedan descartados y eliminados.
- Silueta: casco redondeado moderadamente grande, torso estrecho, extremidades largas y espalda completamente limpia. La identidad NO usa reactor dorsal, aletas, mochila ni rack.
- Tecnología: visor ancho y reactor pequeño encastrado en el pecho, protegido por marco graphite; el núcleo no altera la silueta exterior.
- Paleta plana aprobada para las hojas: machine white `#E7E5DE`, graphite `#1D232A`, granate `#9B3656` y ruby `#D84A77` reservado al núcleo frontal.
- Assets runtime empaquetados: `public/assets/2d/ref-overclocker-{front,side,back,top}-v1.png`. `CHARACTER_REGISTRY.overclocker` usa `modelKey: 'overclocker'` y el portrait frontal exacto, sin fallback.

### Estado de integración

- [x] Aprobar concept V3 y paleta plana candidata.
- [x] Preparar y probar balance, Runaway Draw, daño por fuente y fallback elegible.
- [x] Persistir el ledger monotónico de IDs que completaron el arco y definir `Two of a Kind` con recompensa estable `overclocker`.
- [x] Empaquetar frontal/lateral/trasera/top y portrait runtime.
- [x] Registrar `modelKey`, definición runtime y Contract por ID estable.
- [x] Verificar por tests UI bloqueada/desbloqueada, progreso de Two of a Kind, navegación y Confirm bloqueado.
- [x] Verificar promoción, precio, telegraph y fallback de pools en cofres y Chatarrero.
- [x] Close the runtime visual and top-down read by explicit user acceptance.
- [x] Record benchmark scope honestly: no separate Overclocker 400+ result exists or is claimed.

## Brief visual v1

### Lectura de silueta

Desde cámara cenital deben sobrevivir tres anclas: **casco grande**, **herramienta en hombro derecho** y **mochila-taller**. La mochila está físicamente unida al torso; el módulo de herramienta es asimétrico; antebrazos y botas son reforzados. Una columna de energía cian recorre la espalda.

La mochila contiene exactamente **3 alojamientos grandes de Core**, conectados mediante cables gruesos. Los alojamientos y cables deben superar el downsample del modelo; no se resuelven como decals ni piezas flotantes.

### Paleta

| Uso | Color |
|---|---|
| Casco de seguridad | `#ff8f2f` |
| Armadura hueso | `#e8e2d2` |
| Charcoal | `#222831` |
| Visor / azul noche | `#162533` |
| Energía cian | `#01e6fe` |

### Referencias existentes

The complete source set lives in `art/concept/field-engineer/` as versioned **conversion and provenance input for the approved runtime model**:

| Archivo | Uso |
|---|---|
| `field-engineer-turnaround-render-v1.png` | Intención de volumen e iluminación; no voxelizar directamente. |
| `field-engineer-turnaround-chroma-v1.png` | Fuente intermedia con chroma. |
| `field-engineer-turnaround-alpha-v1.png` | Turnaround con alpha. |
| `field-engineer-turnaround-flat-v1.png` | Lectura plana conjunta. |
| `field-engineer-front-flat-v1.png` | Fuente frontal prioritaria para reconstrucción 3D. |
| `field-engineer-side-flat-v1.png` | Fuente lateral prioritaria para perfil. |
| `field-engineer-back-flat-v1.png` | Fuente trasera prioritaria para pintura y alojamientos. |

These images remain source material for reconstruction and provenance. Approval applies to the in-game runtime result; the sheets are not pending shipped-art candidates.

## Validación técnica del modelo runtime v1

1. El preview 0°/90°/180°/270° confirmó la lectura del frente, ambos laterales y espalda frente a `front/side/back-flat-v1`; el render solo guía intención.
2. La marcha vista desde atrás confirmó que el cuerpo conserva los huecos de brazos/piernas y que la mochila procedural sigue el rig sin inflar el frente.
3. El modelo conserva cuerpo contiguo, mochila unida y exactamente tres alojamientos visibles.
4. El gate de enjambre pasó con 431–440 enemigos: 118.87 FPS medios, bucket mínimo 92.41 FPS, p99 8.5 ms, 0 errores de página y 431/431 enemigos en movimiento.
5. Result: runtime model v1 is technically validated and definitively approved in-game.

## Deferred coverage, not release blockers

- Parameterize `tools/perf-stress.mjs` by character if future coverage work needs a canonical 65 s comparison. This does not reopen any of the three closed characters.
