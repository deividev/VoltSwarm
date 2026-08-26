# Voltswarm - campana de wishlists en X, Reddit y Steam (20-07-2026 - lanzamiento)

**Destino canónico verificado del juego completo:** Steam App ID `4979220` — `https://store.steampowered.com/app/4979220/Voltswarm/`.

> **Alcance de producto:** el juego completo (`codex/map-2`) recorre Scrapyard / Mapa 1 → Swarm Foundry / Mapa 2 → Hazard Marshal; la baseline del combate final está cerrada en el candidato 0.22.0. La Steam Demo separada (`codex/demo-map1`, `0.13.39-demo`) contiene solo Mapa 1: boss derrotado → `SECTOR CLEARED`, timeout sin boss → `SECTOR HELD`; Mapa 2 y Hazard Marshal no son claims de esa build. Volt Warden queda como diseño histórico/futuro. El RC de fin de agosto de 2026 es un objetivo interno de la Demo, nunca una promesa pública de lanzamiento, revisión o disponibilidad.
>
> **Production status 2026-08-25:** Field Engineer, Rack Hauler, and Overclocker
> are final and closed. Foundry's current replacement slice—Furnace Mite, Axle
> Runner, and Slagcaster—is also closed; further enemies are deferred. The active
> sequence is molten-flow glow/sparks → human runs/balance/retention → new-audio
> cohesion → external Steamworks achievement publication/icon confirmation, production achievement-unlock smoke, and
> technical close. Steamworks product APIs beyond achievement unlocking—including
> Leaderboards, User Stats, Cloud, Workshop, Rich Presence, Friends/lobbies/networking,
> Steam Input, Inventory/DLC/microtransactions—are not implemented and are outside
> launch scope; reconsider post-launch only if Voltswarm demonstrates sufficient
> visibility/traction, with no commitment or marketing promise. In current full-game source `0.30.7`, all 20 launch
> achievements and the `steamworks.js` `0.4.0` Steam achievement transport are implemented. SDK/overlay
> initialization, App ID, packaging, IPC, allowlist, and outbox are auxiliary unlock infrastructure, not separate features. The
> maintainer confirms that all 20 matching entries are created in Steamworks
> App Admin for App ID `4979220`; this is NOT evidence that the latest changes
> are published/live, that both icon states were uploaded, or that production
> smoke passed. The Demo trailer
> sigue sin producir ni exportar; sus materiales CUT A/B/C/D no equivalen a un
> corte aprobado. El futuro S5 es un tráiler del juego completo y no debe
> confundirse con ese plan de Demo.

> **Resultado buscado:** empezar a construir audiencia el lunes **20-07-2026** y llegar a **1.000 wishlists o mas en el ultimo dia cerrado de Steam Wishlist Reporting anterior al lanzamiento** (`W_final`). Guardar su `as_of_date_pt`; registrar aparte `release_activated_at_utc`. No afirmar un total inmediato en vivo salvo contador live verificado por el publisher. El **04-11-2026** es un *stretch target histórico superseded*, no una fecha pública ni un objetivo vigente.

## Flujo dominical operativo (activo desde 02-08-2026)

El domingo a las 10:00 `Europe/Madrid` existe una sola ejecucion X + YouTube en
`Marketing tools/marketing-dashboard`. Sus checkpoints persistentes son:

1. sincronizacion con fallback y edad visible de cada fuente;
2. cierre de cohortes disponibles +24/+72/+120/+168;
3. comparacion contra objetivo y propuesta sin atribuir causalidad no probada;
4. inventario anti-repeticion, brief de grabacion y derivados FFmpeg;
5. manifiesto unico con borradores publicos en ingles;
6. espera obligatoria de aprobacion humana;
7. programacion y verificacion mediante adaptadores reanudables.

Sin API o navegador autenticado, una pieza solo puede quedar `validated` con su
runbook: nunca `scheduled`. YouTube privado/programado no es `published`; la
evidencia confirmada en Studio no se degrada por una lectura API incompleta.
Steam Events S1 y Reddit comparten la ejecucion como trabajo asistido, pero no se
autopublican. Reddit exige rules check vigente con URL, `checkedAt`, hash y
caducidad, ademas del disclosure exacto cuando corresponda. X y Reddit siguen
admitiendo solo MP4 o PNG/JPG, nunca GIF.
>
> **Registro externo histórico, pendiente de confirmación actual:** se anotó una supuesta disponibilidad Coming Soon de `https://store.steampowered.com/app/4979220/Voltswarm/` (App ID `4979220`). No usarla como afirmación vigente sin confirmación externa; los totales de wishlists y cualquier dato privado de Steamworks requieren confirmación del publisher.

## Estado operativo — 29 de julio de 2026

- **T1 histórico pendiente de reconfirmación:** se registró una activación el 26 de julio. Las acciones nuevas pueden enlazar la URL canónica, pero no deben afirmar Coming Soon, publicación o datos privados sin evidencia externa actual.
- **Baseline histórico reportado:** 6 wishlists. La cadencia y fechas asociadas al objetivo anterior del 4 de noviembre no gobiernan el RC interno de fin de agosto ni constituyen forecast o fecha pública.
- **Primera señal X:** post del 20: 32 impresiones / 12 engagements / 1 visita de perfil; post del 22: 22 / 9 / 0. Las muestras no permiten elegir ganador; abrir UTMs y medir la primera cohorte T1 antes de iterar.
- **Activacion T1 histórica ejecutada el 26 de julio, 11:53 Europe/Madrid:** post X page-live fijado con PNG y URL canonica de Steam; la misma URL quedo en Website del perfil. Es un registro fechado, no confirma el estado actual de la página. Por preferencia del usuario no usa UTM: medir por ventana temporal/Steamworks y no atribuir conversiones por post.

## Decisiones no negociables

| Tema | Decision operativa |
| --- | --- |
| Inicio | T0 fue la fase previa del 20 al 26 de julio. Está cerrada y se conserva solo como historial operativo. |
| Activacion Steam | **T1 tiene un registro histórico, pendiente de reconfirmación actual.** Solo tras confirmación externa se puede pedir wishlist y enlazar Steam; no se inventan métricas privadas ni se convierte `To be announced` en una fecha pública. |
| Objetivo | `W_final >= 1.000`, definido como el ultimo dia cerrado de Wishlist Reporting anterior al release, con `as_of_date_pt`. `release_activated_at_utc` se registra aparte. Sin contador live verificado no existe claim de total inmediato. |
| Fecha | El objetivo del 04-11-2026 es histórico superseded. El RC interno de fin de agosto es solo de la Demo y no se publica hasta superar el gate de fecha de este documento. |
| Producto | La estrategia anterior de lanzamiento directo sin Demo ni Steam Next Fest queda **explícitamente sustituida y deja de ser autoritativa**. La Steam Demo de Mapa 1 es separada del juego completo; no afirmar participación en Next Fest sin confirmación externa. |
| Multiplayer/co-op | No se promociona, etiqueta ni promete antes del GO documentado, implementacion terminada y verificacion jugable. "Como minimo co-op 2" es una intencion condicionada, no una feature actual. |
| Disclosure publico sobre IA | La unica redaccion autorizada es: `The game does not contain AI-generated content. AI-generated content is used just for Steam cover.` No se parafrasea ni amplia mientras Steam no se actualice oficialmente. |
| Formato por plataforma | Desde 23-07-2026, X y Reddit usan solo MP4 de alta calidad o capturas PNG/JPG; nunca GIF. Steam puede usar GIF, MP4 o capturas segun convenga. |
| Hashtags semanales de X | Cada post original semanal de X lleva exactamente tres hashtags relevantes: uno contextual del día y dos de descubrimiento/género. Lunes: `#IndieDevMonday #IndieGame #BulletHeaven`; miércoles: `#WishlistWednesday #IndieGame #BulletHeaven`; viernes: `#FollowFriday #IndieGame #BulletHeaven`. No se hace *tag stuffing* ni se usan etiquetas de eventos que no correspondan. El manifiesto rechaza la aprobación si falta o cambia la terna. |
| Canal de video propio | Herramienta semanal multijuego disponible en `C:\Users\david\Desktop\Agent Games Web\Marketing tools\youtube-shorts` (v0.2.0). Los Shorts forman parte del proceso semanal unico de cada domingo a las 10:00 Europe/Madrid: se revisan datos, se decide el contenido de la semana siguiente y se prepara el mismo manifiesto operativo que X. Nunca se publica ni programa sin aprobar expresamente el manifiesto. Voltswarm aporta MP4 reutilizables; OAuth, canal y auditoria de YouTube siguen siendo gates externos. No abrir ni prometer TikTok/Reels como sustituto sin una decision posterior. |
| Título superior de Shorts | Todo Short muestra arriba el nombre exacto del juego en mayúsculas (`VOLTSWARM`, `SCRAP YARD IDLE`, etc.). No añadir `(Steam)` al título visual ni colocarlo abajo. El manifiesto semanal debe declarar y validar este overlay antes de permitir la aprobación. |
| Outreach cualificado | Mantenerlo en el hito de septiembre con el primer minitrailer y material de desarrollo mas avanzado. No adelantar mensajes a prensa/creadores por la pagina Steam sola. |
| Overlay explicativo de gameplay | Cuando el usuario pida texto explicativo sobre gameplay en un clip, usar el lower-third aprobado: franja inferior azul oscuro a ancho completo, borde cian, titulo blanco y subtitulo cian centrados. Mantenerlo breve, usar terminos in-game verificados y retirarlo antes del payoff. Cuando enumere tiers, colorear cada nombre con su color in-game correspondiente. |
| Cover de Steam Events | Sistema aprobado: base canonica `art/steam/events/s1/event-cover-s1-capsule-800x450.png` + banda inferior compacta de estado para futuros Events/Announcements. Mantener exactamente el capsule y agregar solo: banda azul marino semitransparente, regla superior cian y texto blanco centrado. El copy depende del hito (`UPDATED vX.Y.Z`, `NEW CONTENT`, `PATCH vX.Y.Z`). Nunca alterar logo, personajes ni composicion del capsule. El ejemplo visual literal `UPDTED v1.0.0` vive en `art/steam/events/templates/event-cover-overlay-example-updted-v1.0.0.png`; es referencia de estilo, no master de produccion. |
| Etica | Cero spam, engagement falso, cuentas coordinadas o posts disfrazados de preguntas. Cada publicacion debe aportar prueba real o una conversacion honesta. |

## Camino rápido vigente

1. No asumir `page_status=public_coming_soon`: reconfirmar externamente el estado actual. La URL canónica y el App ID `4979220` son datos verificados, pero no autorizan un claim de disponibilidad.
2. Registrar wishlists y conversiones únicamente desde Steamworks/publisher; no inferirlas desde tráfico público.
3. Publicar gameplay real con CTA de wishlist cuando el canal y sus reglas lo permitan.
4. Keep current marketing on existing assets while production finishes Foundry's molten-flow glow and voxel sparks; Hazard Marshal, the three characters, and the current Foundry replacement slice are closed.
5. Treat Forge Dart and all further enemy expansion as deferred future material, not launch claims or active production dependencies.
6. Review closed cohorts before iterating formats; human balance playtests remain a later product phase.

### Roles operativos

| Rol | Responsabilidad |
| --- | --- |
| Publisher / Steamworks data owner | Confirmar T1/release; registrar `W0`, `W_final`, `as_of_date_pt` y `release_activated_at_utc`; exportar cohortes preliminares +24/+72 y cerradas +120/+168. |
| Content publisher | Preparar, comprobar claims/reglas, publicar y responder en X/Reddit. |
| Analytics / decision owner | Mantener dashboard y formulas; comparar piezas; decidir `double_down`, `iterate`, `hold` o `kill_format`. |

### Dashboard del lunes (15 minutos)

| Campo | Valor semanal |
| --- | --- |
| Estado | `page_status`; gate de fecha; gate co-op |
| Objetivo | `W_actual / W_target`; `gap`; `R`; dias restantes |
| Ritmo | wishlists ultimos 7 dias; `required_weekly`; Trusted/Tracked Visits requeridas |
| Funnel | `c_low / c_base / c_high`; conversion real; tracked share |
| Contenido | ganador finalizado; pieza X; candidato Reddit + rules check |
| Decision | una hipotesis a probar; formato a mantener/iterar; owner y fecha |
| Riesgo | aprobacion, asset, medicion o claim bloqueado |

---

## 1. Embudo y matematicas del objetivo

### Formula base

Definiciones para una activación T1 reconfirmada (página pública):

- `W0` = baseline histórico exacto de wishlists al inicio de la ventana T1. No está reconstruido ni confirmado, por lo que permanece sin valor operativo. El conteo actual aproximado reportado por el mantenedor —~30 wishlists a 2026-08-25— es una referencia fechada, no live, NO sustituye `W0` y requiere un export de Steamworks para conocer la cifra exacta vigente.
- `R = max(0, 1000 - W0)` = wishlists restantes.
- `D = dias entre T1 y la fecha interna de lanzamiento vigente`.
- `ritmo_diario = R / D`.
- `ritmo_semanal = 7R / D`.
- `objetivo_acumulado(d) = W0 + R * d / D`, donde `d` son dias transcurridos desde T1.

**Escenario histórico superseded, no forecast:** con la activación T1 registrada, baseline reportado de 6 wishlists y 101 días operativos entre el 27-07 y el objetivo interno histórico del 04-11, quedaban 994: **9,84 wishlists/día** o **68,89/semana**. No usar este cálculo para el RC actual; rehacerlo solo con un baseline y una activación T1 reconfirmados por el publisher.

### Funnel T1: wishlists restantes -> visitas Steam requeridas

No se inventa una tasa. Tras T1, completar las tres tasas con datos reales comparables y conservar la fuente/ventana:

- `c = UTM wishlists / Tracked Visits`.
- `t = Tracked Visits / Trusted Visits`.
- `Tracked Visits requeridas = R / c`.
- `Trusted Visits requeridas = R / (c * t)`.
- `Tracked Visits semanales = (R / c) * 7 / D`.

| Escenario | Tasa que debe cargar analytics owner | Tracked Visits necesarias | Trusted Visits necesarias |
| --- | --- | ---: | ---: |
| Low | `c_low` = percentil/tasa conservadora real | `R / c_low` | `R / (c_low * t)` |
| Base | `c_base` = baseline real acordada | `R / c_base` | `R / (c_base * t)` |
| High | `c_high` = tasa fuerte real, no aspiracional | `R / c_high` | `R / (c_high * t)` |

Hasta disponer de baseline, las tasas quedan **en blanco** y el modelo no produce un numero de visitas defendible. Este funnel estima visitas atribuibles; `W_final` sigue siendo el criterio de aceptacion porque parte del trafico social puede quedar sin atribuir.

### Checkpoints semanales

La columna absoluta conserva la ilustración histórica `T1=20-07`, `W0=0` para comparar el plan original. **No es el baseline operativo actual.** La columna válida para operar es el porcentaje de `R`; la hoja privada debe usar T1 real y el `W0` confirmado por Steamworks.

| Revision | % de `R` acumulado | Ilustracion absoluta | Accion si estamos por debajo |
| --- | ---: | ---: | --- |
| 27-07 | 6,5% | 65 | Validar T1/medicion; no juzgar formatos con una sola muestra. |
| 03-08 | 13,1% | 131 | Repetir el mejor hook con otro asset. |
| 10-08 | 19,6% | 196 | Continuar bootstrap; no matar formatos antes de 6 piezas comparables finalizadas. |
| 17-08 | 26,2% | 262 | Reordenar pilares por UTM wishlists, no por likes. |
| 24-08 | 32,7% | 327 | Crear 2 variantes del ganador, sin subir cadencia aun. |
| 31-08 | 39,3% | 393 | Auditar store-page click-to-wishlist con publisher. |
| 07-09 | 45,8% | 458 | Refrescar post fijado y primer frame de clips. |
| 14-09 | 52,3% | 523 | Reservar los 3 mejores assets para la recta final. |
| 21-09 | 58,9% | 589 | Recalcular ritmo y reforzar el pilar de mayor conversion. |
| 28-09 | 65,4% | 654 | Si falta >10 puntos porcentuales, revision extraordinaria. |
| 05-10 | 72,0% | 720 | Confirmar si el gate de fecha permite iniciar countdown. |
| 12-10 | 78,5% | 785 | Solo anunciar fecha si el gate esta en verde. |
| 19-10 | 85,0% | 850 | Mantener presencia sin fingir participacion en Next Fest. |
| 26-10 | 91,6% | 916 | Activar paquete final solo con RC/QA y fecha publica. |
| 02-11 | 98,1% | 981 | Recordatorio final; no compensar con spam. |
| Activacion de release | 100% | 1.000 | Tomar `W_final` del ultimo dia cerrado anterior con `as_of_date_pt`; registrar aparte `release_activated_at_utc`. Launch copy solo tras confirmacion. |

### KPI: jerarquia y lectura

| Nivel | KPI | Calculo / fuente | Uso |
| --- | --- | --- | --- |
| Norte | Wishlists netas totales | Steamworks, cierre semanal | Saber si se alcanza la meta. |
| Conversion atribuida | Wishlists UTM | Steam UTM Analytics | Comparar canal/campana/contenido. Es un minimo atribuible, no toda la causalidad. |
| Calidad de trafico | `wishlist_utm / tracked_visits` | Steam UTM Analytics | Evaluar intencion entre usuarios identificables. |
| Trafico | Total / Trusted / Tracked Visits | Steam UTM Analytics | Distinguir alcance, trafico fiable y trafico logueado. |
| X | impresiones, video views, engagement rate, profile visits, link clicks si esta disponible | X Analytics + UTM | Diagnosticar hook y salida hacia Steam. |
| Reddit | upvotes, ratio, comentarios sustantivos, moderacion, UTM visits cuando haya link permitido | Reddit + UTM | Validar encaje comunitario; no perseguir karma vacio. |
| Produccion | piezas publicadas / planificadas, horas invertidas, assets agotados | hoja interna | Evitar que marketing comprometa el juego. |

> Steam atribuye conversiones UTM durante 72 h desde cada visita y finaliza cada dia de visita 4 dias despues. Por eso +24/+72 son preliminares. Cohortes comparables: primeras 24 h de visitas cerradas a +120 h; primeras 72 h cerradas a +168 h.

---

## 2. Dos modos de activacion: T0 y T1

### T0 - página aún no pública (HISTÓRICO, CERRADO EL 26-07)

**Objetivo:** construir reconocimiento, aprender que prueba visual atrae y preparar comunidad sin falsos CTA.

- X: 3 posts originales/semana, 2 bloques de 20 minutos para responder e interactuar con cuentas afines.
- Reddit: comentar con utilidad en 2-3 hilos relevantes/semana; maximo 1 post original candidato y solo si pasa reglas. No se fuerza un post si no hay encaje.
- CTA permitido: "Follow for development updates" o una pregunta genuina cuyo resultado si vaya a usarse.
- CTA prohibido: "Wishlist now", `[STEAM LINK]`, "page live" o fecha de lanzamiento.
- Medicion: alcance, retencion del clip, interaccion cualitativa, follows y temas preguntados.

### T1 - página pública reconfirmada (GATEADO)

La activación inicial queda como registro histórico. No ejecutar ni reutilizar sus acciones promocionales hasta que el publisher reconfirme el estado actual de la página:

- [x] **Histórico:** registrar fecha/hora T1, URL y App ID reales. `W0` solo se considera confirmado si viene de Steamworks/publisher.
- [ ] Crear enlaces UTM desde la URL verificada cuando la campaña decida usarlos; la activación inicial se publicó sin UTM por preferencia del usuario.
- [x] **Histórico:** publicar y fijar el post X page-live con la URL registrada.
- [x] **Histórico:** actualizar la bio/enlace del perfil de X con la URL registrada de Steam.
- [ ] Responder a conversaciones activas con el enlace solo cuando sea relevante; nunca pegarlo en masa.
- [ ] Publicar en Reddit solo si hay subreddit y formato que pasaron el rules check ese mismo dia.
- [ ] Publicar el Beat S1 de Steam dentro de 24-48 h, solo con permisos, cover y claims verificados.
- [ ] Capturar baseline de Steam a las 24 h, 72 h preliminar, 96 h final y 7 dias.

---

## 3. Mensaje y pilares de contenido

**Pitch operativo, solo sobre gameplay confirmado:**

> Voltswarm is a 3D voxel bullet-heaven where movement and build choices turn one robot into an industrial projectile storm.

| Pilar | Prueba | Assets actuales | Accion buscada |
| --- | --- | --- | --- |
| Caos legible | enjambre grande y supervivencia avanzada | GIF 05/08; shots 06/08 | detener scroll -> ver clip completo -> wishlist tras T1 |
| Build decisions | draft y efecto visible de una mejora | GIF 02; shot 07 | comentar eleccion -> entender profundidad -> wishlist |
| Recompensa | cofre, recompensa y vacuum de XP | GIF 01/04/07; shots 01/02 | compartir momento satisfactorio -> wishlist |
| Ritmo de run | Scrapper/tienda entre combates | GIF 06; shot 04 | descubrir sistema -> visitar Steam |
| Picos de tension | spawn y combate de Crusher King | GIF 03/09; shots 03/05/09 | completar clip -> visitar Steam |
| Identidad | voxel "industrial toy", siluetas y color | crops honestos de shots 06/08/09 | reconocer Voltswarm sin depender del logo |
| Construccion abierta | leccion concreta de legibilidad, VFX o balance | before/after nuevo, solo si existe | conversacion util en Reddit; confianza |

**Do not use as a public pillar until it exists in the announced variant and its marketing asset/build is approved:** multiplayer, co-op, deferred enemy expansion, a date, or a discount. All three characters exist in the full game and are closed for current production, but that does not make them Demo claims. Swarm Foundry and Hazard Marshal likewise remain full-game-only claims.

### Capacidad realista

| Trabajo semanal | Presupuesto |
| --- | ---: |
| X originales | 3 (lunes/miercoles/viernes); 4 solo en T1, anuncio de fecha o launch week |
| X community blocks | 3 x 20 min (martes, jueves y sábado) |
| Reddit posts | 0-1; maximo 2 promociones honestas en cualquier ventana movil de 30 dias entre todos los subreddits |
| Reddit participation | 2-3 comentarios utiles/semana, sin link salvo relevancia clara |
| Steam Events | 1 beat significativo cada 2-3 semanas desde T1; excepcion: trailer, one-week y launch. |
| Asset nuevo | maximo 1 recorte/subtitulado de material existente; captura nueva solo cuando pruebe una mejora real |
| Analitica | +24/+72 preliminar; cohorte 24 h a +120 h y cohorte 72 h a +168 h; revision semanal solo con cohortes finalizadas. |

No aumentar frecuencia para corregir una mala conversion. Primero mejorar hook, primer frame, claridad de gameplay y pagina Steam.

### Ritmo semanal: publicar, aportar y medir

- **Lunes, miércoles y viernes:** slots principales de publicación en X; Reddit y Steam solo cuando el calendario y sus gates los habiliten.
- **Martes, jueves y sábado:** un bloque de 20 minutos para 2–5 replies útiles desde la cuenta de Voltswarm en conversaciones relevantes. Aportar una observación concreta sobre gameplay, diseño o desarrollo; nunca respuestas genéricas, engagement bait o enlaces no solicitados. Incluir un enlace solo si responde directamente a una pregunta y las reglas del espacio lo permiten.
- **Domingo, 10:00 Europe/Madrid:** preparar la semana siguiente y comparar la semana que acaba de cerrar con sus objetivos. No es un slot público obligatorio; una activación excepcional de domingo (por ejemplo, T1 page-live) requiere gate, materiales y aprobación individual.

Los replies sirven para ganar reconocimiento y aprender el lenguaje de la audiencia, no para reemplazar posts propios ni para forzar tráfico. Registrar conversación, tema, resultado cualitativo y cualquier visita/enlace permitido.

---

## 4. Calendario editorial exacto

Cada semana conserva 3 slots X: **Proof** (clip), **System** (explicacion), **Conversation** (pregunta/observacion). Reddit usa solo el angulo indicado si las reglas lo permiten. En T0, sustituir cualquier wishlist CTA por follow/update.

| Semana | Tema y entrega X | Reddit community-first | Gate/CTA |
| --- | --- | --- | --- |
| 20-26 jul | **Histórico cerrado:** identidad T0 con combate/auto-aim y build; activación page-live ejecutada el 26-07. | Participación útil; sin duplicar promociones. | T0 cerrado, T1 activado. |
| 27 jul-2 ago | Registro histórico de página pública pendiente de reconfirmación; teaser MP4 de cofre + absorción de XP (sin explicar el sistema completo). El boss/portal ya tiene la visibilidad corregida: usarlo como prueba de mejora cerrada, no como problema abierto. | 1 post posible sobre la mejora de telegraphing del boss, en un solo subreddit. | CTA solo si la URL canónica se confirma; reservar el tratamiento profundo de cofre/XP para agosto. |
| 3-9 ago | Early choice -> late chaos: GIF 02 + GIF 05/08; encuesta real de build. | Debate de diseno sobre hacer legible un bullet-heaven 3D. | Medir cual combo genera visitas cualificadas. |
| 10-16 ago | Loot ceremony: GIF 01/07 y shot 01. | Sin promocion; responder a threads de rewards/juice. | Repetir solo el hook ganador. |
| 17-23 ago | XP vacuum y progreso: GIF 04 + shot 02/07. | Post opcional sobre feedback visual de pickups, sin pregunta falsa. | CTA Steam habilitado; medir con la fuente disponible. |
| 24-30 ago | Meet the Scrapper: GIF 06 + shot 04; explicar pausa economica in-run. | Un unico post de sistema si el subreddit admite dev posts. | No mencionar co-op aunque exista checkpoint interno. |
| 31 ago-6 sep | Crusher King: GIF 09 -> GIF 03 -> shot 05. | Post tecnico sobre spawn telegraph; no reutilizar el post de julio. | Mejor pieza pasa a banco final. |
| 7-13 sep | Industrial toy identity: crops de shots 08/09 y paleta/silueta. | Conversacion de direccion visual, con contexto suficiente en el cuerpo. | Sin claims de contenido futuro. |
| 14-20 sep | Run loop recap: combat -> level-up -> chest -> shop, un sistema por post. | No post promocional; aportar a conversaciones existentes. | Refrescar pinned X con el mejor formato. |
| 21-27 sep | "Controlled mess": GIF 05 vs GIF 08 como test A/B secuencial, no simultaneo. | Post de learnings solo si incluye una conclusion concreta. | Recalcular `R/D`. |
| 28 sep-4 oct | Best-of Q3: 3 ganadores con hooks nuevos, no repost identico. | Sin post salvo oportunidad organica clara. | Auditoria de KPI + store page. |
| 5-11 oct | Picos de tension: boss/chest/swarm. Preparar copy de fecha, no publicarlo aun. | Participacion normal, cero countdown. | Gate de fecha inicia revision. |
| 12-18 oct | Si fecha aprobada: announcement + clip mas fuerte + wishlist reminder. Si no: "development continues" con gameplay actual. | Un post de progreso honesto, fecha solo si publica y reglas lo permiten. | Fecha condicionada. |
| 19-25 oct | Build/shop/boss; no decir ni insinuar participación en Next Fest sin confirmación. | No capitalizar Next Fest con spam; participar solo donde aporte. | La Steam Demo existe; Next Fest no se presupone. |
| 26 oct-1 nov | Si RC/fecha en verde: "one week", feature proof, mejor GIF. Si no, seguir evergreen sin countdown. | Post pre-launch maximo en un subreddit y solo con permiso. | Activar launch pack solo con gate. |
| 2-4 nov | Countdown y "out now" unicamente con release confirmada. | Un post de lanzamiento maximo, en una sola comunidad que lo permita. | Conversion final; si no hay release, re-baseline publico claro. |

### Domingo 6 de septiembre — preflight de outreach editorial japonés (interno)

**Objetivo:** dejar una campaña editorial lista para aprobación; no ejecutar contacto externo ni comunicar una fecha de lanzamiento en este hito.

- [ ] Producir un tráiler breve de alta atención y un corte social de **6–15 s**; ambos deben mostrar gameplay real y cumplir el formato MP4 de alta calidad.
- [ ] Revalidar la página pública de Steam y el enlace UTM antes de compartirlo. Usar la taxonomía vigente, por ejemplo `utm_source=x&utm_medium=organic_social&utm_campaign=coming_soon_2026&utm_content=20260906_jp_editorial_trailer_a`; crear una variante ASCII distinta por cuenta/canal.
- [ ] Investigar el encaje editorial, cobertura reciente y canal profesional actual de **@dotpixel3d**, **@denfaminicogame**, **@famitsu** y cuentas editoriales/de videojuegos japonesas similares.
- [ ] Preparar un pitch localizado y una ficha de prensa en japonés con hechos verificables: premisa, plataformas, URL de Steam, assets y CTA de wishlist. No inventar métricas, features ni disponibilidad.
- [ ] **Contacto externo:** enviar solo tras verificar cuenta, canal y política de contacto, confirmar el encaje de la pieza y recibir aprobación explícita del responsable/publisher. Esta lista es preflight, no autorización implícita.
- [ ] **Fecha de lanzamiento:** incluirla o establecerla públicamente solo si todas las casillas del [gate de fecha](#gate-de-fecha-de-lanzamiento) están confirmadas; en caso contrario, mantener el claim como `Coming to Steam` sin día concreto.

---


## 5. Playbook de Steam Events & Announcements

### Decision y guardarrailes

Steam es el **hogar de conversion**, no un devlog diario. X prueba hooks; Reddit construye confianza; Steam reune la prueba completa junto al boton de wishlist. Su copy se escribe desde cero.

- Maximo **7 beats** desde T1, separados 2-3 semanas salvo trailer, one-week y launch. Si T1 se retrasa, fusionar o eliminar; no comprimir.
- Mantener **1, maximo 2 eventos Library homepage-visible**. Ocultar/expirar el teaser sustituido de Library homepage no borra su archivo.
- La store page muestra como maximo dos eventos recientes en su bloque: cada beat debe mejorar esa pareja.
- Reservar `Featured Event` para un hito grande y espaciado: trailer y, despues, lanzamiento.
- No usar **Small Update / Patch Notes** para page-live, trailer, fecha o launch: queda fuera de superficies de alta visibilidad.
- Elegir la categoria de anuncio/noticia segun el contenido y confirmar las superficies en el preview de Steamworks. No asumir Store homepage.
- Solo contenido disponible al lanzamiento. Sin fecha, demo, descuento, co-op o multiplayer hasta sus gates.
- No introducir el tema de IA en announcements, comentarios o plantillas salvo que una regla lo exija o alguien pregunte. En ese caso, responder unicamente con el disclosure publico canonico de la seccion 9, sin parafrasearlo ni ampliarlo.

**Follow no es wishlist:** Follow distribuye noticias por Activity Feed/News Hub. Wishlist es la conversion objetivo y puede generar notificacion de lanzamiento. Medir `follower_delta` y `wishlist_net_delta` por separado; nunca sumar followers al objetivo de 1.000.

### Calendario ejecutable: 7 beats

Todos usan una categoria de anuncio/noticia confirmada en la UI, **nunca Patch Notes**.

| Beat | Ventana | Objetivo / working title | Prueba, asset y CTA | Visibilidad | Gate / fallback | Medicion |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | T1 +24-48 h | Wishlist abierta: **`Voltswarm Steam page is now available to wishlist`** | Pitch, 3 sistemas reales, GIF/shot 08. Wishlist; follow secundario. | Store product page + Community Hub + feeds si preview confirma. No Featured. | Coming Soon, URL y App ID confirmados; si no, draft. | Impressions, reads, read rate y deltas +24/+72 preliminar; +120/+168 cohortes cerradas. |
| S2 | No antes de T1 +2 semanas; objetivo T1 +2-3 semanas | Builds: **`From one upgrade to an industrial projectile storm`** | Level-up -> consecuencia -> late build. GIF 02 + 05; shot 07. | Anuncio; no Featured. Evaluar ocultar S1. | Upgrades implementados. Fallback: early vs late run actual. | Reads, comentarios, follower/wishlist delta. |
| S3 | T1 +5-6 semanas y minimo 2 semanas tras el beat publicado anterior | Sistema: **`Meet the Scrapper`** | Decision, intercambio, regreso al combate. GIF 06 + shot 04. | Anuncio; no Featured; dejar solo S2/S3 visibles. | Scrapper cerrado. Fallback: **`Crusher King changes the run`**, GIF 09 -> 03. Si ninguno, SKIP. | Impressions, reads y deltas. |
| S4 | T1 +8-9 semanas y minimo 2 semanas tras el beat publicado anterior | Confianza: **`Keeping a 3D swarm readable`** | Problema -> cambio -> prueba. GIF 05/08; before/after real. | Anuncio de desarrollo; no Featured. | Requiere asset before/after documentado y resultado reproducible. Sin ese asset: SKIP. No publicar cifras FPS sin evidencia. | Read rate, comentarios utiles y deltas. |
| S5 | T1 +11-12 semanas y minimo 2 semanas tras el beat publicado anterior; ventana histórica objetivo **14-15 oct**, sujeta a rebaseline | Pico del **juego completo**: **`Voltswarm - Gameplay Trailer`** | Trailer gameplay-first, 3 bullets reales, cover/header y GIF payoff. No reutilizar el plan de Demo como si fuera este entregable. | Featured solo si preview/owner confirma; ocultar teaser sustituido. | Trailer full-game aprobado y store sincronizada. Sin trailer aprobado: SKIP o renombrar con precision como anuncio de gameplay actual; nunca usar `Trailer`. Puede salir sin fecha: `Coming to Steam`. Co-op solo tras gate. | Views disponibles, impressions/reads y deltas +24/+72 preliminar; +120/+168 cohortes cerradas. |
| S6 | Exactamente 7 dias antes del timestamp publico verificado; **28 oct solo si release 4 nov** | Conversion: **`Voltswarm launches in one week`** | Fecha/hora, 3 razones, cutdown 10-15 s. | Anuncio visible; un solo Featured. | Gate completo de fecha/release de la seccion 9, incluido build Valve-approved, checklist, permisos, pricing/package y dry-run. Si falla: SKIP. | Reads, delta diario y gap a 1.000. |
| S7 | Release confirmado | Jugadores: **`Voltswarm is out now`** | Contenido real, launch cut 20-30 s, precio/descuento verificados, soporte. | Categoria vigente de launch; unico Featured; ocultar/expirar S6. | Steam confirma release activo y se registra `release_activated_at_utc`. Si se retrasa, reprogramar; no renombrar S6. | Impressions/reads, trafico/ventas; separar `W_final` del post-release. |

### Steam dentro del calendario cruzado

**Prioridad determinista si falta runway:** S1 es obligatorio. Mantener separacion minima de 2 semanas; recortar primero S3 y despues S4. S2 se conserva si cabe. S5 existe solo si pasa el gate de trailer; de lo contrario se omite o se publica con nombre exacto de gameplay actual.

| Semana | Accion Steam |
| --- | --- |
| 20 jul-2 ago | Preparar permisos/cover; S1 unicamente si ocurre T1. |
| 3-16 ago | S2 cuando hayan pasado 2-3 semanas desde S1. |
| 17-30 ago | Medir S2 y preparar S3; sin evento adicional. |
| 31 ago-6 sep | S3 solo si han pasado 2 semanas desde S2; sin sistema cerrado o sin runway, saltar primero. |
| 7-20 sep | Preparar prueba reproducible S4. |
| 21-27 sep | S4 solo 2 semanas despues de S3 y con before/after documentado; si no, saltar. |
| 28 sep-11 oct | Sin evento; QA y draft privado del trailer. |
| 12-18 oct | S5 el 14-15 oct solo con trailer aprobado y separacion minima; si no, SKIP o anuncio de gameplay correctamente nombrado. |
| 19-25 oct | Sostener S5; no fingir Next Fest. |
| 26 oct-1 nov | S6 exactamente T_release -7 dias; 28 oct solo si el timestamp verificado es 4 nov. |
| 2-4 nov | S7 solo tras release confirmado. |

### Produccion

- **Event Cover obligatorio: 800 x 450 px**, usando template oficial. Una idea visual; Steam ya muestra nombre/icono.
- **Event Header recomendado: 1920 x 622 px**, respetando zonas seguras. Header propio para S1, S5 y S7.
- **Spotlight/Featured:** no inventar formato independiente; preparar mediante preview/crop desde cover/header. Featured no promete Store homepage.
- **Cuerpo:** 1 GIF de prueba + 1 imagen secundaria maximo operativo. Steam admite JPG/PNG/GIF y presenta imagenes del cuerpo hasta 800 px de ancho.
- Derivar desde `art/steam/gif/` y `art/steam/screenshots/`; exportar aparte, sin tocar masters. Registrar beat, fuente, build, fecha, claims, idioma y owner. Base English; Steam lo usa como fallback.

### Checklist operativo

- [ ] T1, URL/App ID y permiso `Edit App Marketing Data`.
- [ ] Separacion 2-3 semanas o excepcion final.
- [ ] Claims verificados contra build/gates; store sincronizada.
- [ ] Categoria y preview correctas; NO Patch Notes.
- [ ] Cover y header/Featured con templates actuales.
- [ ] Solo 1-2 eventos Library homepage-visible.
- [ ] Titulo/summary/apertura claros; gameplay real; English/localizaciones, crops, enlaces y accesibilidad revisados.
- [ ] Segunda persona revisa draft; publisher confirma autor/hora.
- [ ] Reservar hasta una hora de posible revision/retraso en Library; no coordinar X al minuto.
- [ ] Responder 60-90 min; capturar metricas +24/+72 preliminar; +120/+168 cohortes cerradas.
- [ ] Ocultar teaser sustituido; decidir `keep`, `iterate` o `retire` solo con cohorte cerrada +120 o +168.

### Metricas y atribucion

Steam Events Stats cuenta **impressions** cuando el banner entra en pantalla y **reads/clicks** cuando se abre el evento. Solo cuenta usuarios logueados y unicos, registra su primera ubicacion y actualiza aproximadamente cada hora.

| Campo | Lectura |
| --- | --- |
| `event_impressions` | Alcance interno, por ubicacion. |
| `event_reads` / `event_read_rate` | Aperturas unicas; fuerza de cover+titulo. |
| `follower_delta` | Manage Members antes/despues; NO wishlists. |
| `wishlist_net_delta` | Wishlist reporting al mismo corte; correlacion temporal, no atribucion individual. |
| `comments_quality` | Preguntas/objeciones utiles para store/trailer. |

**No usar UTM externo para trafico interno de Steam Events.** Evaluar con Events Stats + follower delta + wishlist net delta en +24/+72 preliminar; +120/+168 cohortes cerradas. X y Reddit mantienen enlaces directos a la store page con sus UTMs. Si comparten el evento, sus reads externos son amplificacion, no wishlists atribuibles al evento.

### Outlines English

```text
S1 - Voltswarm Steam page is now available to wishlist
Opening: Voltswarm is a 3D voxel bullet-heaven built around movement, positioning, and auto-aim weapon builds.
Proof: [large-swarm GIF] + three verified gameplay bullets.
CTA: Wishlist Voltswarm. Follow for future development announcements.
```

```text
S2 - From one upgrade to an industrial projectile storm
Opening: A Voltswarm run starts readable and becomes dangerous by choice.
Proof: Level-up decision -> visible combat consequence.
CTA: Wishlist Voltswarm if you enjoy this kind of build escalation.
```

```text
S3 - Meet the Scrapper
Opening: Not every important decision happens while firing.
Proof: Trade -> change -> return to combat.
CTA: Wishlist on Steam.
```

```text
S4 - Keeping a 3D swarm readable
Opening: More enemies only work if the next safe move stays visible.
Proof: Problem -> verified change -> current swarm footage.
CTA: Follow for updates; wishlist to play the finished run.
```

```text
S5 - Voltswarm - Gameplay Trailer
Opening: Movement, builds, bosses, and one robot becoming an industrial projectile storm.
CTA: Wishlist Voltswarm. [Coming to Steam / VERIFIED PUBLIC DATE]
```

```text
S6 - Voltswarm launches in one week
Opening: Voltswarm launches on [VERIFIED PUBLIC DATE].
CTA: Wishlist now to receive Steam's release notification.
```

```text
S7 - Voltswarm is out now
Opening: The swarm is live. Voltswarm is now available on Steam.
CTA: Play on Steam. [VERIFIED PRICE/DISCOUNT ONLY]
```

---

## 6. Playbook de X

### Estructura de cada post

1. **Hook en una linea:** consecuencia visible, no descripcion generica.
2. **Una sola idea:** boss, build, cofre o swarm; nunca el feature dump completo.
3. **Visual nativo:** el payoff debe aparecer en el primer segundo o primer frame.
4. **CTA:** ninguno/seguir en T0; wishlist con UTM en T1; "out now" solo el dia confirmado.
5. **Respuesta:** durante los primeros 60-90 min, contestar preguntas reales y anotar lenguaje del publico.

### Reglas operativas

- Subir GIF/video directamente; no depender de que el enlace genere preview.
- Mantener copy conciso y conversacional; usar hashtags solo si aportan descubrimiento, nunca una nube.
- No poner el enlace en todas las piezas. Cadencia T1 sugerida: 2 posts prueba pura + 1 post con CTA por semana.
- El post fijado solo puede contener la URL canónica de Steam cuando T1 esté reconfirmado externamente. Usar UTM solo si se decide abrir una campaña atribuible; la activación histórica T1 no usó UTM por preferencia del usuario.
- No publicar el mismo asset con el mismo hook dentro de 30 dias. Reuso valido = nuevo aprendizaje, crop o framing.
- Responder a jugadores y desarrolladores como personas, no convertir cada reply en un pitch.
- Registrar cada publicacion antes de salir para no perder su `utm_content`.
- No introducir el tema de IA en posts, replies o plantillas salvo que una regla lo exija o alguien pregunte. En ese caso, usar unicamente el disclosure publico canonico de la seccion 9.

### Templates X (English)

**T0 - gameplay proof (histórico; reutilizable sin CTA si alguna publicación no debe enlazar Steam)**

```text
No manual aiming. Just movement, positioning, and a build that is getting wildly out of control.

Voltswarm is a 3D voxel bullet-heaven in development.
```

**T1 - page live / pinned (solo tras reconfirmación externa)**

```text
Voltswarm is now available to wishlist on Steam.

Turn one robot into an industrial projectile storm through movement, auto-aim weapons, and build choices.

Wishlist: [VERIFIED STEAM LINK]
```

**Swarm proof**

```text
The challenge is not putting hundreds of robots on screen.
It is making the next safe move readable.

Wishlist Voltswarm: [VERIFIED UTM LINK]
```

**Build conversation**

```text
One upgrade slot. Two bad ideas in the best possible way:

Attack Speed or Projectile Quantity?
```

**Boss proof**

```text
A good boss entrance gives you just enough time to understand that the run has changed.

Voltswarm on Steam: [VERIFIED UTM LINK]
```

**Date - locked behind gate**

```text
Voltswarm launches on [VERIFIED PUBLIC DATE].

Wishlist on Steam and get notified at release: [VERIFIED UTM LINK]
```

**Launch - confirmed only**

```text
Voltswarm is OUT NOW on Steam.

Survive the swarm. Shape the build. Become the projectile storm.

Play now: [VERIFIED UTM LINK]
```

---

## 7. Playbook de Reddit: comunidad antes que distribucion

Reddit no es un replicador de X. El objetivo es encontrar **una comunidad donde la pieza aporte valor por si misma**. No hay lista permanente de subreddits "seguros": reglas, flairs y megathreads cambian.

### Shortlist priorizada (verificada 19-07-2026)

La prioridad se basa en **afinidad de jugadores + camino permitido a una promocion honesta**, no en volumen bruto. Ninguna comunidad garantiza wishlists. **Todas las filas requieren volver a leer reglas, wiki, fijados y flairs el mismo dia de publicar**; si difieren de esta captura, mandan las reglas nuevas.

| Rango | Comunidad | Por que encaja | Camino permitido y caveats actuales | Veredicto |
| ---: | --- | --- | --- | --- |
| A1 | `r/survivorslikes` | Publico exacto: survivor-likes, horde survival y bullet-heavens. | Acepta gameplay, capturas, ventas y actualizaciones; tambien auto-shooters/wave survival. La unica frecuencia escrita es no publicar varias veces al dia, pero el plan impone **maximo 1 aparicion cada 4 semanas** para no contribuir a la fatiga promocional. Usar contenido SFW, flair correcto y disclosure de desarrollador. Puede llevar Steam UTM solo desde T1. | **Prioridad A.** Primera prueba de trafico cualificado. |
| A2 | `r/roguelites` | Jugadores del genero cercano; Voltswarm encaja solo si el post explica honestamente su estructura roguelite/survivor-like. | La regla visible adopta moderacion abierta y solo veta sitewide spam/NSFW, pero hay quejas recientes de usuarios por saturacion de autopromocion. Publicar **solo un hito fuerte cada 6-8 semanas**, nunca una micro-actualizacion; disclosure, clip autocontenido y participacion previa. Link Steam: `VERIFY BEFORE POSTING` con reglas/fijados del dia. | **Prioridad A condicionada.** Alta afinidad, alto riesgo de rechazo comunitario. |
| Condicionada | `r/IndieGaming` | Audiencia de jugadores indie; en abstracto admite devlogs, GIFs, screenshots y trailers originales. | Cuenta de al menos 1 semana con historial real; **1 submission cada 2 semanas** y no repetir contenido. Su regla exige declarar GenAI usado en cualquier aspecto del desarrollo o promocion. Si el post no muestra la Steam cover y el rules check del dia confirma que el disclosure es suficiente, incluir el texto canonico exacto. Si el post, enlace o preview puede mostrar la cover, queda bloqueado hasta permiso escrito de moderacion solicitado con ese mismo texto. | **Prioridad B condicionada.** Fuera de la rotacion base hasta resolver el check concreto. |
| Bloqueado | `r/indiegames` | Comunidad orientada a jugadores y descubrimiento, con prohibicion de posts GenAI y reglas contra feedback promocional disfrazado. | Aplicar el disclosure canonico exacto de la seccion 9. Como un enlace a Steam o su preview puede mostrar la cover, no publicar ni asumir una excepcion: solo reconsiderar tras **aprobacion escrita explicita de moderacion**, usando en modmail ese mismo texto exacto. | **Bloqueado salvo permiso escrito.** Fuera de la rotacion activa. |
| B1 | `r/BulletHeavens` | Encaje semantico exacto, pero comunidad mucho menor; sirve para lenguaje y feedback de conocedores. | La pagina visible no mostraba reglas comunitarias propias el 19-07 y mostraba la senal de moderacion/app **`Stop AI`**. Aunque aparecen promociones con Steam, eso **no equivale a permiso**. Si el post, enlace o preview puede mostrar la Steam cover, pedir permiso a moderacion y usar unicamente el disclosure canonico exacto en el modmail. No publicar hasta respuesta escrita favorable ni duplicar la pieza de `r/survivorslikes`. | **Prioridad B bloqueada hasta permiso.** No presentarlo como canal permitido. |
| B2 | `r/IndieDev` | Util para aprendizajes de produccion, legibilidad y postmortems. | La propia guia dice que es una sala de pares, no la audiencia objetivo; GIFs/imagenes funcionan mejor y Steam/Kickstarter/YouTube reciben poca atencion. No hay limite general estricto visible; capsulas comparativas solo los miercoles. Sin CTA de wishlist: aportar una conclusion tecnica real. | **Prioridad B.** Confianza/feedback, efecto wishlist indirecto. |
| B3 | `r/gamedevscreens` | Adecuado para una captura o GIF visual fuerte y conversacion entre devs. | No habia reglas comunitarias visibles en la pagina publica consultada. `VERIFY BEFORE POSTING`; no asumir que un feed lleno de showcases autoriza link Steam, frecuencia o CTA. Usar asset visual distinto y sin venta agresiva. | **Prioridad B.** Awareness entre pares; no canal de conversion principal. |
| - | `r/playmygame` | La comunidad exige jugar, no solo wishlist. | El juego debe ser jugable gratis **ahora** mediante build/demo, o sortear al menos 10 keys; tambien exige enlace directo y limita a 1 post/mes. Los anuncios de juegos completos de pago solo se aceptan en `Trailer Tuesday`. La Demo real de Mapa 1 puede satisfacer el requisito de build/demo, pero publicar exige rules check vigente, evidencia de elegibilidad y aprobación: no autoriza promoción automática. | **Condicionado.** Reevaluar solo cuando las reglas del día, una build accesible y la aprobación confirmen elegibilidad; el lanzamiento completo no es prerrequisito. |
| - | `r/gamedev` | Gran comunidad, pero de profesionales/desarrolladores, no compradores objetivo. | Prohibe showcases y autopromocion directa; un link solo vale dentro de feedback, postmortem, analytics o aprendizaje sustantivo. Un CTA de wishlist o trailer promocional viola el proposito. | **Evitar para adquisicion directa.** Solo postmortem futuro con datos y aprendizaje reales. |

**Decision operativa:** empezar por `r/survivorslikes`; el unico segundo candidato activo es `r/roguelites`, de forma condicionada y con baja frecuencia. `r/IndieGaming` queda fuera de la rotacion base hasta resolver su check concreto y pasa a bloqueado si la cover puede aparecer sin permiso escrito. `r/indiegames` no se desbloquea por suposicion y `r/BulletHeavens` tampoco se presenta como canal permitido: ambos requieren el control indicado en su fila. Toda consulta a moderacion usa el disclosure canonico exacto, sin ampliaciones. El resto no justifica sacrificar desarrollo por alcance teorico.

### Rotacion Reddit inicial

Maximo **1 post total por semana y 2 promociones directas en cualquier ventana movil de 30 dias** entre todas las comunidades. Los huecos no promocionales se usan para 2-3 comentarios utiles; no se rellenan por obligacion. Cada fila usa asset, titular y tesis distintos: **cero cross-post del mismo material/copy**. Una pieza de reserva **reemplaza** un slot promocional programado; nunca se suma como un tercer post dentro de la ventana de 30 dias.

| Ciclo | Comunidad | Pieza exclusiva | Angulo | CTA / enlace |
| --- | --- | --- | --- | --- |
| 1 - primeras 72 h tras T1 | `r/survivorslikes` | GIF 08, gran enjambre | Presentacion directa: auto-aim, movimiento y build en un survivor-like 3D; developer disclosure claro. | Steam UTM en el cuerpo solo si el rules check del dia lo permite. |
| 2 - 10-14 dias despues | Sin post promocional | Ningun asset | Participacion util mientras madura el historial de cuenta y se prepara el siguiente hito distinto. | Sin enlace propio. |
| 3 - semana sin promocion | Sin post propio | Ningun asset | Comentar con sustancia en conversaciones de build readability, bosses o survivor-likes. | Sin link propio salvo peticion genuina y regla compatible. |
| 4 - siguiente mes | `r/roguelites` | GIF 06, Scrapper | Como la decision de gastar/reciclar cambia el ritmo de una run; hito, no micro-devlog. | Steam solo si `VERIFY BEFORE POSTING` queda resuelto; si no, post autocontenido sin CTA. |
| 5 - 6-8 semanas tras el primer A | Sin post promocional por defecto | Ningun asset | Reservar capacidad para el trailer o un hito real; no sustituir falta de permiso con otra comunidad al azar. | Sin enlace propio. |
| Reserva cualitativa, bloqueada | `r/BulletHeavens` | GIF 04, XP vacuum | Satisfaccion del pickup y lectura con horda; no reutilizar el swarm de A1. | Solo reemplaza un slot existente tras permiso escrito si la cover puede aparecer; modmail con el disclosure canonico exacto por la senal `Stop AI`. |

No publicar el anuncio de pagina, el trailer ni el lanzamiento en varias comunidades a la vez. Para el trailer histórico de octubre se habría elegido **una sola** comunidad activa usando los resultados UTM y la recepción acumulada; cualquier pieza futura debe volver a pasar los gates vigentes. La Demo de Mapa 1 elimina la exclusión automática de `r/playmygame`, pero exige rules check vigente, build accesible y aprobación antes de cualquier publicación. Fecha y co-op siguen bloqueados por sus gates.

### Checklist obligatorio por post

Guardar una fila por subreddit y publicacion:

- [ ] Lei hoy las reglas, wiki, post fijado y flairs desde la interfaz del subreddit.
- [ ] La autopromocion esta permitida en este formato/dia/megathread.
- [ ] Revise la politica GenAI vigente y confirme si alcanza la Steam cover, enlaces o previews que puedan mostrarla.
- [ ] Complete el control `canonical_ai_disclosure_match = yes/no` y confirme si `steam_cover_ai_visible = yes/no` en el asset, enlace o preview enviado.
- [ ] Si la comunidad prohibe GenAI o su regla es ambigua y la Steam cover puede aparecer, obtuve aprobacion escrita explicita despues de enviar solo el disclosure canonico exacto; sin respuesta o con respuesta ambigua, el subreddit sigue bloqueado.
- [ ] Mi historial reciente muestra participacion real, no solo enlaces propios.
- [ ] El titulo declara el contexto de desarrollador; no disfraza promocion como feedback.
- [ ] Si pido feedback, existe una decision concreta abierta y explicare despues que cambio.
- [ ] El contenido aporta valor sin abrir Steam.
- [ ] No publique esta pieza en otro subreddit ni voy a cross-postearla en cadena.
- [ ] El enlace esta permitido; si no, queda fuera del post y no se fuerza en comentarios.
- [ ] Elegi flair correcto y elimine lenguaje de venta que incumpla la norma local.
- [ ] Puedo quedarme 60-90 min para responder con sustancia.
- [ ] Registre URL de reglas, fecha/hora y captura/nota de evidencia.

**Si alguna respuesta es "no" o ambigua: no publicar; preguntar a moderacion o usar otro formato.**

### Flujo operativo

1. Lunes: seleccionar una conversacion o aprendizaje de la semana, no "el clip que toca distribuir".
2. Martes: comprobar reglas de un subreddit candidato.
3. Miercoles/jueves: publicar solo alli; nunca copiar el mismo titulo/cuerpo en varios sitios.
4. Primeras 24 h: responder, agradecer criticas y no discutir votos/moderacion.
5. A +72 h: lectura preliminar. Cerrar cohorte 24 h a +120 h y/o cohorte 72 h a +168 h. Retirar antes solo por rechazo, remocion o incumplimiento.

### Nota especifica sobre r/indiegames

La aclaracion enlazada por moderacion distingue autopromocion honesta de posts promocionales disfrazados de peticion de feedback, pero **no anula su prohibicion GenAI**. Aplicar el disclosure canonico exacto de la seccion 9. Como un enlace o preview puede mostrar la cover, `r/indiegames` permanece bloqueado salvo aprobacion escrita explicita de moderacion; el modmail debe incluir ese mismo texto exacto y nada mas. Incluso con permiso, no titular "Which one do you prefer?" si la decision ya esta cerrada o si el proposito real es pegar el enlace.

### Templates Reddit (English; adaptar a las reglas reales)

**Technical/value post - no link required**

```text
Title: What helped us keep a 3D bullet-heaven readable when the swarm gets dense

We found that enemy count was not the main readability problem. The harder problem was preserving a clear silhouette for the player, threats, and safe movement while weapons covered the arena.

This clip shows the current result. The next thing we are evaluating is whether the boss telegraph stays readable once the build becomes this dense.

I am the developer of Voltswarm. I am happy to explain the approach or hear where the visual hierarchy breaks for you.
```

**Honest promotion - only where explicitly allowed**

```text
Title: I am making Voltswarm, a 3D voxel bullet-heaven about turning one robot into a projectile storm

This is a short clip from a late run. The game uses auto-aim weapons, so the player's decisions are movement, positioning, and how the build develops.

The Steam page is live here if you want to follow it: [VERIFIED SUBREDDIT-SPECIFIC UTM LINK]

Disclosure: I am the developer. Feedback is welcome, but this is a promotion post rather than a disguised feedback request.
```

**Launch - one allowed community maximum**

```text
Title: Voltswarm, a 3D voxel bullet-heaven, is out now on Steam

Voltswarm has launched with auto-aim combat, build choices, chest rewards, shops, and boss fights.

Here is a short gameplay clip showing the current game. Steam: [VERIFIED SUBREDDIT-SPECIFIC UTM LINK]

Disclosure: I am the developer, and this is a launch promotion post posted under this community's current rules.
```

No afirmar "our", "solo developer", duracion de desarrollo u otra biografia si no se ha verificado para la publicacion concreta.

---

## 8. UTM y hoja de medicion

### Taxonomia

Usar minusculas ASCII, guiones bajos, sin datos personales y sin cambiar nombres a mitad de campana.

| Parametro | Valores | Ejemplo |
| --- | --- | --- |
| `utm_source` | `x`, `reddit` | `reddit` |
| `utm_medium` | `organic_social`, `community` | `community` |
| `utm_campaign` | `coming_soon_2026`, `date_announce_2026`, `launch_2026` | `coming_soon_2026` |
| `utm_content` | `{yyyymmdd}_{pillar}_{format}_{variant}` | `20260817_build_gif_a` |

Ejemplo estructural, **no URL real**:

```text
[VERIFIED STEAM APP URL]?utm_source=x&utm_medium=organic_social&utm_campaign=coming_soon_2026&utm_content=20260720_swarm_gif_a
```

Para Reddit, un `utm_content` distinto por subreddit; nunca usarlo como excusa para cross-postear.

### Campos minimos de la hoja

| Bloque | Campos |
| --- | --- |
| Identidad | `post_id`, `published_at_utc`, `owner`, `platform`, `subreddit`, `post_url` |
| Contenido | `week`, `pillar`, `format`, `asset_file`, `hook`, `cta`, `claim_gate`, `variant` |
| Compliance | `page_status`, `rules_url`, `rules_checked_at`, `flair`, `developer_disclosure`, `canonical_ai_disclosure_match`, `steam_cover_ai_visible`, `moderator_approval_ref`, `moderation_status` |
| UTM | `base_url_verified`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `final_url` |
| +24 h | Preliminar: social reach/engagement y primeras 24 h de visitas Steam, sin decision de conversion. |
| +72 h | Preliminar: primeras 72 h de visitas; todavia contiene dias sin finalizar. |
| +120 h | **Cohorte cerrada 24 h:** visitas ocurridas en [0,24 h), evaluadas 96 h despues de cerrar esa cohorte. |
| +168 h | **Cohorte cerrada 72 h:** visitas ocurridas en [0,72 h), evaluadas 96 h despues de cerrar esa cohorte. |
| Resultado | `utm_wishlist_cvr` por cohorte cerrada, rolling median comparable, horas, decision y aprendizaje. |
| Control | `W_actual` con su `as_of_date_pt`, `W_target`, `gap`, `R`, `D`, `required_daily`, `required_weekly` |

### Bucle preliminar y cohortes cerradas

**A +24 h y +72 h (preliminar)**

- Verificar post/enlace, evaluar hook y responder.
- Importar alcance, visitas y conversiones solo como lectura provisional.
- No declarar ganador, calcular medianas ni decidir por conversion.

**A +120 h: cohorte cerrada de primeras 24 h**

- Filtrar visitas cuyo timestamp cae entre publicacion y +24 h.
- Como cada dia de visita tuvo 96 h para finalizar, calcular `c`, `t` y resultado de esa cohorte.
- Comparar solo con otras cohortes cerradas de 24 h del mismo canal/formato.

**A +168 h: cohorte cerrada de primeras 72 h**

- Filtrar visitas entre publicacion y +72 h.
- Calcular `c`, `t` y resultado tras 96 h adicionales.
- Comparar solo con cohortes cerradas de 72 h. Nunca mezclar mediana 24 h con resultado 72 h.
- Separar problema de alcance de problema de conversion y elegir `double_down`, `iterate`, `hold` o `kill_format`.

**Viernes semanal**

- Capturar el ultimo dia cerrado de Wishlist Reporting y guardar `as_of_date_pt`.
- Recalcular `R/D`.
- Elegir un unico experimento; las decisiones de conversion esperan a la cohorte cerrada correspondiente.

### Umbrales de decision

**Bootstrap:** hasta tener 6 cohortes cerradas y comparables del mismo ancho (24 h o 72 h), no existe mediana estable. El default es `hold`/`iterate`. Solo hay stop inmediato por compliance, remocion o rechazo claro.

| Decision | Umbral con cohorte finalizada comparable | Siguiente accion |
| --- | --- | --- |
| Double down | >=1,5x mediana de Trusted Visits o >=1,25x mediana de CVR con >=20 Tracked Visits; sin senal negativa | 2 variaciones en 14 dias, mismo principio y assets distintos. |
| Iterar | 0,75-1,49x mediana, o buen debate pero CTA debil | Cambiar una variable y probar una vez. |
| Hold | <20 Tracked Visits o muestra insuficiente | Acumular 3 cohortes comparables antes de concluir. |
| Kill format | Baseline de 6 cohortes y 3 pruebas adicionales: <0,5x mediana y sin comentarios utiles/wishlists atribuibles | Retirar formato 30 dias; conservar pilar. |
| Stop inmediato | Regla incumplida, moderacion negativa, claim no verificado o rechazo claro | Corregir/retirar y no repostear. |

No "matar Reddit" o "matar X" por una publicacion. Se mata un formato/hook despues de evidencia comparable.

---

## 9. Gates de claims publicos

### Disclosure publico canonico sobre IA

La unica redaccion publica autorizada es, verbatim:

> The game does not contain AI-generated content. AI-generated content is used just for Steam cover.

- No parafrasear, resumir ni ampliar esta redaccion en X, Reddit, Steam Events/Announcements, modmail, respuestas de prensa, templates, campos de compliance o comentarios.
- X y Steam no introducen el tema salvo que una regla lo exija o alguien pregunte; si ocurre, se responde solo con el texto exacto anterior.
- En Reddit, registrar si la Steam cover aparece en el asset, enlace o preview. Una prohibicion GenAI o una regla ambigua mantiene el canal bloqueado cuando la cover pueda aparecer, salvo permiso escrito de moderacion solicitado con el texto exacto anterior.
- **Change-control unico:** si cambia el disclosure, actualizar primero la pagina de Steam o publicarla en la misma release coordinada; despues actualizar juntos este plan, las evaluaciones de Reddit, todos los templates y las respuestas outbound. Hasta entonces gobierna exclusivamente el texto anterior.

### Gate de fecha de lanzamiento

La fecha solo pasa de interna a publica cuando **todas** las casillas estan confirmadas por sus responsables:

- [ ] Reconfirmar externamente el estado actual de Coming Soon, revisión o disponibilidad pública antes de afirmarlo. La URL canónica y el App ID `4979220` ya están verificados; los registros previos no confirman release ni disponibilidad actual.
- [ ] Product owner confirma scope congelado.
- [ ] La build candidata ha superado la revision de Valve y figura aprobada para release.
- [ ] Store page/build changes necesarios estan publicados y aprobados; QA confirma cero bloqueantes.
- [ ] Steamworks Release Checklist esta **completado**, no solo preparado.
- [ ] La cuenta que activara tiene `Publish app changes to Steam` y `Manage pricing and discounts`.
- [ ] Precio, package y territorios de venta estan configurados y verificados; descuento solo si fue aprobado.
- [ ] Publisher realizo un dry-run documentado de los controles `Release App`/activacion sin ejecutar el release.
- [ ] La fecha respeta el minimo de dos semanas de Coming Soon.
- [ ] Store page, Steam Events, X, Reddit y documentos se actualizan coordinadamente.

Hasta entonces usar `Coming to Steam` solo despues de T1, sin dia concreto.

### Gate multiplayer/co-op

No usar "multiplayer", "co-op", "2 player", "Remote Play Together", "online co-op", sus tags o iconografia hasta cumplir:

1. GO documentado en `docs/MULTIPLAYER_FEASIBILITY.md`.
2. Modo exacto implementado de extremo a extremo; no basta infraestructura o menu.
3. Test funcional repetible con exactamente la configuracion que se anunciara.
4. Rendimiento y estabilidad validados bajo los objetivos del proyecto, incluido el enjambre.
5. UX de entrada/salida, controles, pausa y fallos cubierta.
6. Store copy/tags aprobados por product owner y publisher con wording exacto.
7. Assets capturados del build verificado; no mockups.

Un GO arquitectonico por si solo NO autoriza marketing. Si solo queda validado local 2P, se anuncia unicamente local 2P; no se extrapola a online o 4 jugadores.

---

## 10. Contingencias

| Evento | Respuesta publica | Respuesta operativa |
| --- | --- | --- |
| Página pública deja de estar accesible o recibe feedback nuevo de Valve | No especular sobre causa/plazo; pausar CTA hasta reconfirmar el estado. | Publisher responde y confirma si hace falta volver temporalmente a un estado de revisión. |
| Gate multiplayer = NO-GO | No anunciar, etiquetar ni insinuar co-op. | Lanzar/marketear solo features verificadas; retirar toda plantilla provisional de co-op. Revalidar fecha/scope. |
| Co-op no llega a calidad | Igual que NO-GO: no prometer "coming later" sin decision nueva. | Sacarlo del scope/claims; priorizar RC y single-player probado. |
| Fecha no supera gate | Sin countdown ni "November 4". | Re-baselinar calendario, UTM campaign y copy; publicar fecha solo cuando sea defendible. |
| Wishlists van bajo ritmo | No spamear ni comprar engagement. | Auditar store conversion, duplicar formatos ganadores, mejorar primer segundo y concentrar Reddit en valor. |
| Formato ganador agota asset | No repetir identico. | Derivar crop/subtitulo o capturar nueva prueba solo despues de una mejora real. |

---

## 11. Inventario de assets y rotacion

El paquete final v1 contiene 9 screenshots y 9 GIFs revisados. Fuente de verdad: `art/steam/STEAM-MEDIA-MANIFEST.md`.

| Momento | GIF | Screenshot | Uso recomendado |
| --- | --- | --- | --- |
| Chest reward | `steam-gif-01-chest-open-reward.gif`, `steam-gif-07-green-chest-reward.gif` | `steam-shot-01-chest-reward.png` | recompensa, rareza, ceremony |
| Level-up/build | `steam-gif-02-level-up-draft.gif` | `steam-shot-07-level-up-draft.png` | decision de build, encuesta genuina |
| Boss fight | `steam-gif-03-boss-fight.gif` | `steam-shot-05-crusher-king-fight.png` | tension y combate legible |
| XP vacuum | `steam-gif-04-chest-xp-vacuum.gif` | `steam-shot-02-chest-xp-vacuum.png` | feedback y progreso |
| Surrounded combat | `steam-gif-05-epic-surrounded.gif` | `steam-shot-06-advanced-surrounded.png` | caos controlado |
| Scrapper | `steam-gif-06-scrapper-shop.gif` | `steam-shot-04-scrapper-shop-open.png` | economia y ritmo de run |
| Large swarm | `steam-gif-08-large-swarm.gif` | `steam-shot-08-large-swarm.png` | pieza hero reservada para T1/pinned test; T0 usa GIF 05 |
| Boss spawn | `steam-gif-09-crusher-king-spawn.gif` | `steam-shot-03-boss-title-spawn.png`, `steam-shot-09-crusher-king-title.png` | telegraph y presentacion |

Reglas:

- Mantener nombres/rutas; no editar masters para un post.
- Crear derivados en carpeta de campana solo si hace falta subtitulo/crop y registrar el asset fuente.
- No presentar screenshots como multiplayer ni como contenido futuro.
- Reservar GIF 08, GIF 09 y el ganador medido para T1, fecha y lanzamiento respectivamente; la eleccion final depende de datos, no preferencias.

---

## 12. Que esta verificado y que es interno

### Hechos de plataforma verificados

- Valve indica que una Coming Soon permite crear audiencia y wishlists; para productos nuevos debe estar publica al menos dos semanas antes del lanzamiento.
- La pagina requiere revision/aprobacion y, despues, la accion de publicarla como Coming Soon.
- Steam Events & Announcements puede aparecer en la store page del producto, Community Hub, Library y feeds segun categoria/contexto; los seguidores reciben eventos en Activity Feed y News Hub.
- La store page presenta como maximo dos eventos recientes; Valve recomienda mantener uno o, como maximo, dos eventos Library homepage-visible y ocultar teasers sustituidos.
- Events Stats cuenta usuarios unicos logueados, impressions y reads por primera ubicacion, con actualizacion aproximada cada hora.
- Event Cover es obligatorio a 800 x 450 px; Event Header es recomendado a 1920 x 622 px; las imagenes del cuerpo aparecen hasta 800 px de ancho.
- Steam UTM Analytics acepta parametros `utm_source`, `utm_campaign`, `utm_medium` y `utm_content`, distingue Total/Trusted/Tracked Visits, cuenta conversiones de usuarios tracked dentro de 72 horas y finaliza el dato 4 dias despues de la visita.
- X recomienda copy conciso, CTA claro, evitar hashtags excesivos y usar media para destacar.
- Reddit considera spam las acciones repetidas/no solicitadas y cada comunidad puede aplicar reglas adicionales.
- La aclaracion de r/indiegames rechaza la autopromocion disfrazada de feedback; no sustituye comprobar sus reglas vigentes.

### Objetivos, decisiones o supuestos internos

- `W_final >= 1.000` en el ultimo dia cerrado de Wishlist Reporting anterior al release, guardando `as_of_date_pt`; objetivo interno, no garantia. `release_activated_at_utc` se registra aparte.
- 04-11-2026: stretch target interno histórico y superseded; fue reemplazado por el objetivo vigente de RC interno de la Demo a fin de agosto de 2026. No es fecha pública.
- Registro histórico: T1 activado el 26-07 y página pública verificada el 29-07 en la URL canónica de Steam. No confirma el estado actual; reconfirmar externamente antes de usarlo en copy o promoción.
- Steam Demo/Next Fest: la Demo de Mapa 1 existe; participación en Next Fest no es requisito de plataforma ni debe afirmarse sin confirmación.
- Cadencia, thresholds y forecast: marco operativo que se ajustara con datos reales.
- Multiplayer/co-op: sujeto a GO/NO-GO e implementacion; hoy no es un claim publico autorizado.
- Disclosure publico de IA vigente: `The game does not contain AI-generated content. AI-generated content is used just for Steam cover.` No existe otra redaccion autorizada en este plan.

## Referencias

- [Steamworks - Coming Soon](https://partner.steamgames.com/doc/store/coming_soon)
- [Steamworks - Wishlist Reporting](https://partner.steamgames.com/doc/marketing/wishlist/reporting)
- [Steamworks - Release Process](https://partner.steamgames.com/doc/store/releasing)
- [Steamworks - Events and Announcements Tools](https://partner.steamgames.com/doc/marketing/event_tools)
- [Steamworks - Events and Announcements Visibility](https://partner.steamgames.com/doc/marketing/event_tools/visibility)
- [Steamworks - Events and Announcements Stats](https://partner.steamgames.com/doc/marketing/event_tools/stats)
- [Steamworks - Followers](https://partner.steamgames.com/doc/marketing/followers)
- [Steamworks - Visibility on Steam](https://partner.steamgames.com/doc/marketing/visibility)
- [Steamworks - Event Graphical Assets](https://partner.steamgames.com/doc/store/assets/eventassets)
- [Steamworks - UTM Analytics](https://partner.steamgames.com/doc/marketing/utm_analytics)
- [X Business - Organic best practices](https://business.x.com/en/basics/organic-best-practices)
- [Reddit Help - Spam](https://support.reddithelp.com/hc/en-us/articles/360043504051/Spam)
- [r/indiegames - clarification on developer self-promotion disguised as feedback](https://www.reddit.com/r/indiegames/comments/1esd7yf/new_rule_no_more_developer_self_promotion_posts/)
- [r/indiegames - reglas actuales](https://www.reddit.com/r/indiegames/)
- [r/IndieGaming - reglas actuales](https://www.reddit.com/r/IndieGaming/)
- [r/survivorslikes - reglas actuales](https://www.reddit.com/r/survivorslikes/)
- [r/roguelites - reglas y descripcion actuales](https://www.reddit.com/r/roguelites/)
- [r/roguelites - debate reciente sobre saturacion promocional](https://www.reddit.com/r/roguelites/comments/1uxzl27/sub_is_degenerating_into_roguelike_dev/)
- [r/BulletHeavens - pagina actual; sin reglas comunitarias visibles en la verificacion](https://www.reddit.com/r/BulletHeavens/)
- [r/IndieDev - reglas y guia actuales](https://www.reddit.com/r/IndieDev/)
- [r/gamedevscreens - pagina actual; sin reglas comunitarias visibles en la verificacion](https://www.reddit.com/r/gamedevscreens/)
- [r/playmygame - reglas actuales](https://www.reddit.com/r/playmygame/)
- [r/gamedev - reglas actuales](https://www.reddit.com/r/gamedev/)
- `docs/ROADMAP_STEAM.md` - orden, fecha interna y estado operativo.
- `docs/MULTIPLAYER_FEASIBILITY.md` - gate GO/NO-GO y alcance.
- `art/steam/STEAM-MEDIA-MANIFEST.md` - inventario final de assets.
