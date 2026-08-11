# Personajes de lanzamiento — estado y briefs

Este documento separa lo implementado de las hipótesis futuras. Field Engineer ya es el personaje inicial jugable; el resto del roster sigue sin definirse.

## Estado rápido

| Character | Role | Gameplay | Art | Runtime |
|---|---|---|---|---|
| Field Engineer | Forgiving starting character | Implemented | Runtime v1 definitively approved in-game | Playable |

## Field Engineer

### Decisión de producto

Debe ser una evolución reconocible del jugador actual y cargar con las primeras runs de un jugador nuevo. Su identidad nace de tolerar errores y relacionarse con los Cores; no de moverse mejor que el resto.

| Pieza | Candidato para validar |
|---|---|
| Perfil | 110 HP, Armor rating 5%, daño ×0.95, velocidad 11; Attack Speed ×1, crítico 5%/+50%, Luck y Regen 0. |
| Signature | **Field Repair**: instalar o subir de tier cualquier Core excepto Hull Plates durante gameplay cura 1% de HP máximo después de aplicar el Core, con clamp y sin overheal. No dispara al cargar/reproducir/reconstruir builds ni en Boss Lab. |
| Draft inicial | Bolt Cannon conserva las mismas odds y solo recibe la etiqueta `Recommended` cuando aparece naturalmente. Nunca se garantiza ni equipa por fuerza. |
| Regla de movilidad | Ninguna ventaja exclusiva. El personaje sobrevive por HP/Armor y la signature de Cores. |
| Tradeoff | Menor daño base a cambio de margen defensivo; magnitudes fijadas para la primera versión jugable y sujetas a recalibración con percentiles. |

### Estado implementado

- `src/characters.ts` es el registry data-driven y usa IDs estables; `field-engineer` está desbloqueado por defecto.
- Flujo: Play → selección de personaje → draft de arma → loading → run. El menú Characters reutiliza el mismo registry.
- `PROFILE.unlockedCharacters` persiste IDs y deja el seam listo para recompensas de Contracts, sin crear contratos ni umbrales todavía.
- Selection, character details, and model v1 are integrated at runtime. The body uses measured-profile extrusion with a pack-free `side-depth` sheet; `backPaintRef` paints the existing shell, while dedicated procedural geometry restores the pack's rear volume. Multi-angle inspection, rear-view locomotion, and the 400+ enemy swarm gate passed, and the runtime model is definitively approved in-game.

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

## Fuera de alcance actual

- Inventar o mostrar los otros dos personajes de lanzamiento.
- Crear contratos o umbrales de desbloqueo de personajes.
- Tratar las referencias v1 o el modelo runtime como arte final aprobado sin aprobación visual explícita del usuario.
