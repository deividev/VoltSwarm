# Voltswarm — Handoff de la página de Steam

**Snapshot histórico confirmado (2026-07-16): handoff enviado → página creada por el publisher → página bajo revisión de Steam/Valve.**

> Este snapshot no demuestra aprobación, publicación ni visibilidad Coming Soon actual. No afirmar fecha o resultado de revisión sin confirmación externa. App ID vigente: `4979220`.

## Contenido entregado

| Contenido | Ubicación | Estado |
|---|---|---|
| Descripción corta | `short-description.txt` | Enviada |
| About This Game | `about-this-game.txt` | Enviado |
| Tags, categorías y features | `tags-and-categories.md` | Enviados |
| Requisitos | `system-requirements.md` | Plantilla/estado enviados; cifras pendientes de benchmark |
| Brief completo | `publisher-game-summary.md` | Enviado |
| Orden y propósito de capturas | `screenshots-plan.md` | Actualizado al set final |
| 9 screenshots PNG | `../screenshots/` | Enviados |
| 9 GIFs | `../gif/` | Enviados |
| Store/library/social assets | `../image/` | Enviados |
| Inventario de medios | `../STEAM-MEDIA-MANIFEST.md` | Enviado |

## Hechos que el publisher debe conservar

- **Single-player:** sí.
- **Controller:** usar **Partial Controller Support** hasta cerrar la matriz de validación del build empaquetado.
- **Steam Achievements:** catálogo 20/20 y Steam achievement transport implementados; el mantenedor confirma 20/20 entradas creadas en App Admin para App ID `4979220`. Confirmar publicación, ambos iconos y smoke de desbloqueo en RC antes del claim final.
- **Otras APIs Steamworks:** Leaderboards, User Stats, Cloud, Workshop, Rich Presence, Friends/lobbies/networking, Steam Input, Inventory/DLC/microtransactions y cualquier integración no relacionada con achievements no están implementadas, quedan fuera del lanzamiento y no se marcan ni prometen. Solo se reconsideran post-lanzamiento con suficiente visibilidad/tracción.
- **Plataforma actual:** Windows.
- **Idioma actual del juego:** English.
- **Tráiler:** deliberadamente diferido; la página inicial usa screenshots y loops reales.
- **Precio objetivo histórico:** $4.99 con 10–15% de descuento de lanzamiento; la decisión vigente se verifica en `docs/ROADMAP_STEAM.md`.

## Pendientes que NO invalidan el handoff

1. Medir requisitos mínimos/recomendados en hardware real.
2. Confirmar externamente publicación/iconos de los 20 achievements y ejecutar el smoke de desbloqueo en una build RC.
3. Validar Full Controller Support antes de cambiar la clasificación conservadora.
4. Producir el tráiler más adelante, con el contenido completo que debe representar.

## Limpieza posterior — completada

La limpieza aprobada 1 a 1 ya terminó. Se eliminaron backups, duplicados, temporales regenerables y builds obsoletas. Se conservaron `assets/preview/`, `art/concept/`, `tmp/quantize-portal.mjs`, `tmp/perf-400-output/`, los assets finales, las builds v0.1.1 y `art/video/2026-07-16 17-32-04.mp4`.

## Próximos pasos

1. Rigs temporales de captura cerrados: `RECORDING.levelUpDraft.enabled=false`, ambos flags de `RECORDING.chestTesting=false` y `GOLD.startingGold=0`.
2. Responder a cualquier feedback de Steam durante la revisión.
3. Tras aprobación confirmada, publicar la página como Coming Soon.
4. Continuar `docs/ROADMAP_STEAM.md`: Fase 3 → Fase 5 → Fase 4 (audio al final) → Fase 6.

“V1 cerrada” se refiere al paquete y handoff de la página, no a la versión completa del juego. Para lanzamiento, `steamworks.js` 0.4.0 se usa exclusivamente como infraestructura de desbloqueo de achievements; SDK init, overlay compatibility, packaging, IPC, allowlist y outbox no son features Steamworks independientes. El resto de APIs Steamworks queda fuera de alcance y sin compromiso.
