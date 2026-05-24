# Cajones — frentes abiertos y conceptos pendientes (snapshot 2026-05-24)

> **Documento de retomar exhaustivo.** Escrito al final de una sesion larga
> (~13 PRs mergeados durante 2026-05-23/24) que cerro el guion de
> cajones-context-partitioning Fases 0-6 + Fase 5 bis backend + frontend +
> housekeeping. Durante la sesion aparecieron varios frentes nuevos que
> NO se cerraron y que estan empezando a diluirse. Este doc los inventaria
> sin omitir nada para que la proxima sesion arranque con claridad.

---

## 0 · Como leer este documento

- **Seccion 1**: lo que SI esta cerrado y vivo en main (para no re-hacer).
- **Seccion 2**: los frentes ABIERTOS, en orden de prioridad. Cada uno
  tiene contexto + decision tomada (si la hay) + accion pendiente.
- **Seccion 3**: conceptos / patrones nuevos que surgieron y necesitan
  cristalizar antes de que se pierdan.
- **Seccion 4**: orden recomendado de retoma con estimaciones.
- **Seccion 5**: tabla de commits relevantes para navegar la historia.

---

## 1 · Lo que esta CERRADO en main (no re-hacer)

### Cajones-context-partitioning v1.0.0 (paradigma vivo)

| Pieza | Donde vive | Commit |
|---|---|---|
| Contrato canonico | `arquitectura/decisiones/_contratos/cajones-context-partitioning.contract.json` | `2af69f0` |
| Motor + 7 metodos nuevos en ai-gateway | `modules/conversacion/ai-gateway/index.js` | `27110a5` |
| Tests POC2 (52/52) | `tests/unit/ai-gateway-cajones.test.js` | `27110a5`, `3892c91` |
| Piloto recetas (`cajones_enabled: true`) | `modules/pizzepos/recetas/module.json` | `eca73a1` |
| Validator (8 cross-checks) + wireado a validate-all | `arquitectura/decisiones/_validators/cajones-context-partitioning.validate.js` | `bd31506` |
| Seccion `modelo_de_contexto` en blueprint padre (bump v0.3 → v0.4) | `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json` | `bd31506` |
| Entrada en CLAUDE.md describiendo el patron | `CLAUDE.md` | `bd31506` |
| Fix cajon.listar redundante (regla operativa explicita) | `modules/conversacion/ai-gateway/index.js::_buildCajonesSystemPrompt` | `645f43d` |
| Fase 6: 9 blueprints restantes con `cajones_enabled: true` | `modules/pizzepos/{escandallo,viabilidad,tecnicas,carta-*}/module.json` | `a3c57e0` |
| Fase 5 bis backend (foco dinamico + grafo + nav tools) | `modules/conversacion/ai-gateway/index.js` (+217 LOC) | `3892c91` |
| Fase 5 bis frontend (RelatedPagesBar + listener chat.foco.cambiado) | `frontend/src/lib/components/layout/RelatedPagesBar.svelte`, `frontend/src/lib/stores/chat.ts`, `frontend/src/lib/modules/panels.ts` | `513e18c` |
| Migracion nav tools a tools.contract v1.2 (canonicas en module.json.tools[]) | `modules/conversacion/ai-gateway/{index.js,module.json}` | `9feda84` |
| Cierre doc cajones (cabecera de cerrado) | `arquitectura/decisiones/propuestas/cajones-context-partitioning.md` | `60509a7` |
| Validator `llm-runtime-discipline.validate.js` (6 cross-checks) + wireado a validate-all | `arquitectura/decisiones/_validators/llm-runtime-discipline.validate.js` | `fead23b` |
| Root cleanup (16 detritos archivados, 3 activos preservados) | `_archived/2026-05-23_root-cleanup/` | `a5231d6` |
| Doc de deuda escandallo (plan en 5 fases, NO toca runtime) | `arquitectura/decisiones/propuestas/escandallo-aislamiento-store.md` | `285df6c` |
| Restauracion de `_arranque-cajones.md` con 8 respuestas rellenas | `arquitectura/decisiones/propuestas/_arranque-cajones.md` | `a3d5eee5` |
| Refactor canonico modulo `related-pages` (UI module en lib/modules/) | `frontend/src/lib/modules/related-pages/{manifest.json,index.ts,RelatedPagesPanel.svelte}` | `016961e4` |
| Baseline regenerado (+1 validator llm-runtime-discipline, -2 obsoletos documentation) | `drift-baseline.json` | `6b6cb658` |
| Fix icono 🧭 visible en system-bar (entry en panels.ts apuntando al modulo canonico) | `frontend/src/lib/modules/panels.ts` | `255135f2` |

Mergeados a main en PRs #189 (cierre Fase 7 + housekeeping + UI module canonico + retomar doc) y #190 (fix icono panels.ts).

### Validacion en runtime (2 sesiones de audit confirmadas)

| Audit | Cuando | Que mide | Resultado |
|---|---|---|---|
| Recetas Fase 5 | 2026-05-23 | Comportamiento del LLM con cajones en recetas (8 turnos, deepseek) | 0% cajones equivocados; reduccion 68% en system prompt (63 KB → 24 KB); anti-patron cajon.listar redundante (mitigado en `645f43d` y re-validado) |
| Escandallo post-deploy | 2026-05-23 | Comportamiento en escandallo recien activado (3 turnos) | Cajones funcionan; **deuda detectada**: pseudocodigo de escandallo hace fs.read directo a `/recetas.json` (anti-patron pre-existente, no de cajones) |
| Multi-page (foco dinamico) | 2026-05-24 | Foco dinamico en serie compleja (7 turnos, recetas→viabilidad→escandallo→recetas) | 3 cambios de foco semanticamente correctos sin RESOURCE_NOT_FOUND; foco persiste entre turnos correctamente |

### Otros cierres housekeeping

| Pieza | Commit |
|---|---|
| Root del repo limpio: 16 detritos archivados a `_archived/2026-05-23_root-cleanup/` (3 activos preservados) | `a5231d6` |
| Validator `llm-runtime-discipline.validate.js` implementado (6 cross-checks, cierre del trabajo pendiente del contrato) | `fead23b` |
| Doc de deuda escandallo (plan 5 fases, NO implementado) | `285df6c` |

---

## 2 · FRENTES ABIERTOS (en orden de prioridad)

### 2.1 · `menu-generator` y pages JS legacy en el grafo (PRIORIDAD ALTA)

**Contexto**: cajones-Fase 5 bis (foco dinamico + `page.related` + `chat.cambiar_foco`) solo contempla **los 10 blueprints**. Los pages JS legacy del sistema (`menu-generator`, `comandero`, `cocina`, `pedidos`, `productos`, `facturas`, `staff-manager`, etc.) **no aparecen** en el grafo ni son destinos validos para `chat.cambiar_foco` — el LLM no puede dirigir al usuario alli aunque la pregunta vaya por ese dominio.

**Caso testigo**: `menu-generator` v7.0.0. Sigue siendo JS legacy (`index.js` + pipeline OCR con pdfjs/sharp/Google Vision). Esta **bloqueado** como candidato a blueprint hasta que existan modulos JS deterministas separados (`ocr-vision`, `image-preprocessor`, `pdf-extractor`) — documentado en `modulos-blueprint-driven.contract.json`. Pero el frontend SI tiene rutas para menu-generator: el usuario puede navegar alli.

**Decision tomada** (recomendacion de Claude, NO confirmada por usuario): **Opcion B — marcador explicito**. Anyadir `"navegable": true` al `module.json` de los pages JS, ampliar `_buildPageGraph` y `_executeNavTool` para consultarlos. Frontend conoce qué pages existen. ~1h.

**Que falta**:
1. Decidir cuales modulos marcar `navegable: true` (al menos `menu-generator`; probablemente tambien `comandero`, `cocina`, `pedidos`, `productos`, `facturas`, `staff-manager` si quieres que el LLM dirija a ellos).
2. Ampliar `_buildPageGraph` para escanear TODOS los modulos cargados con flag `navegable: true`, no solo blueprints.
3. Ampliar validacion en `_executeNavTool('chat.cambiar_foco', ...)`: validar contra `loadedModules` con `navegable: true`, no solo contra `blueprintModules`.
4. Test que cubra el caso (menu-generator aparece como destino en `page.related` desde un blueprint que lo consume).
5. Anyadir cross-check al validator de cajones para detectar pages marcados navegables sin module.json correspondiente.

**Por que es prioridad alta**: el gap es conceptual y observable. Cualquier conversacion que mencione "sube foto de menu" o "ver el comandero" hoy choca contra `RESOURCE_NOT_FOUND` cuando el LLM intenta `chat.cambiar_foco`. Mitigacion temporal: el LLM lo intuye y pide al usuario navegar manualmente, pero la barra `RelatedPagesBar` tampoco mostrara estos pages como destinos.

---

### 2.2 · Layout `RelatedPagesBar` en `AppShell.svelte` ✅ CERRADO (2026-05-24)

**Resuelto** en commits `016961e4` (refactor canonico) + `255135f2` (entry en panels.ts).

Decision final: **opcion B revisada** (system-bar como UI module canonico). El doc maestro de cajones decia "panel apilable en system-bar" — auditando `contexto/ui.json` se confirmo que NO existe el patron "barra lateral siempre visible"; el sistema declara solo 4 zonas y el principle es "1 click = 1 panel flotante". Reinterpretacion:

- Modulo UI en `frontend/src/lib/modules/related-pages/` (manifest.json + index.ts + RelatedPagesPanel.svelte) siguiendo patron de credentials.
- Entry adicional `'related-pages-panel'` en `panels.ts` con `zone: 'system-bar'` (necesario porque SystemBar.svelte solo lee del registry estatico, ver concepto 3.7 mas abajo).
- Aparece icono 🧭 en system-bar tras deploy. Click abre panel flotante; el usuario lo mantiene abierto el tiempo que quiera ("ambiental" del doc original = a discrecion del usuario).
- Doc maestro seccion 5.5.4 actualizada con la reinterpretacion canonica.

Pendiente trivial: smoke visual tras el proximo deploy del frontend confirmando que el icono aparece y abre el panel correctamente.

---

### 2.3 · 5 blueprints carta-* con `estado_persistente` incompleto (PRIORIDAD MEDIA, BAJO RIESGO)

**Contexto**: escaneo exhaustivo del 2026-05-24 detecto que **5 blueprints declaran `estado_persistente` parcial** (solo el archivo principal `/<modulo>.json`) pero en realidad operan con MAS paths propios:

| Blueprint | estado_persistente actual | Paths que USA pero no declara |
|---|---|---|
| `carta-design` | `/carta-design.json` | `/carta-design/profiles/`, `/carta-design/designs/` |
| `carta-impresion` | `/carta-impresion.json` | `/cartas-impresion/` (plural) |
| `carta-manager` | `/carta-manager.json` | `/cartas/`, `/cartas/versions/` |
| `carta-scheduler` | `/carta-scheduler.json` | `/carta-scheduler-reglas.json`, `/carta-scheduler-pendientes.json` |
| `carta-marketing` | `/carta-marketing.json` | `/storage/config/marca.json` |

**Verificado** (2026-05-24): `marca.json` solo lo referencia carta-marketing → es propio, no compartido.

**NO violan `no_explorar_estado_ajeno`** — son paths suyos. El escaneo los marca como falsos positivos por la heuristica simple "declara `/X.json` pero usa `/Y/`".

**Que falta**:
1. Anyadir paths reales al `estado_persistente` de los 5 blueprints (refactor de declaracion, cero cambio de runtime).
2. Bump menor en cada blueprint (v1.X.0 → v1.(X+1).0).
3. Verificar que ningun escaneo posterior los marca como anti-patron.
4. Idealmente: el validator `llm-runtime-discipline` deberia tener cross-check estatico `drift_blueprint_fs_read_a_storage_ajeno` que use exactamente esta heuristica MEJORADA (comparar paths usados vs `estado_persistente` declarado completo). Ver frente 2.5.

**Por que bajo riesgo**: cero modificacion del pseudocodigo, cero invocacion al LLM, cero deploy del VPS afectado. Solo metadata.

**Estimacion**: ~1h.

---

### 2.4 · Deuda escandallo + recetas + viabilidad (PRIORIDAD ALTA, ALTO RIESGO)

**Contexto**: escandallo viola `no_explorar_estado_ajeno` con **4 ocurrencias reales** (3 lecturas y 1 escritura) directas al store `/recetas.json` que pertenece al modulo recetas. Documento detallado en `arquitectura/decisiones/propuestas/escandallo-aislamiento-store.md` (commit `285df6c`).

**Bloqueo descubierto en la sesion**: `recetas.actualizar` tiene un whitelist limitado (`nombre, descripcion, porciones, tiempo_min, dificultad, notas, fuente, ingredientes, instrucciones, categorias, etiquetas`). Los 7 campos de coste que escandallo escribe (`coste_total`, `coste_porcion`, `coste_actualizado_at`, `postcode_usado`, `fuentes_precios`, `ingredientes_detalle`, `ingredientes_sin_precio`) **NO** estan en el whitelist. Si escandallo manda `cambios: { coste_total: 12.3 }`, recetas los ignora silenciosamente.

**Decisiones tomadas**:
- Opcion C del menu de opciones: documentar, NO tocar runtime ahora.
- Documento `escandallo-aislamiento-store.md` redactado con plan en 5 fases.
- Refactor canonico = Opcion A: anyadir operacion nueva `recetas.actualizar_coste` (NO ampliar el whitelist de `actualizar`). Separa semanticamente edicion humana vs actualizacion derivada.

**Probablemente afecta a `viabilidad`** (no comprobado — el audit del 2026-05-24 lo corto antes de ejecutar lecturas profundas porque la BD del proyecto de prueba estaba vacia). Hipotesis del usuario: viabilidad consume escandallo, probablemente via publishAndWait, pero hay que verificar leyendo su pseudocodigo.

**Que falta** (ver `escandallo-aislamiento-store.md` para detalle):
1. **Fase 1**: escaneo exhaustivo mejorado para detectar TODOS los blueprints con anti-patron real (no solo `/recetas.json` literal; cualquier path que apunte a `estado_persistente` de OTRO modulo, una vez que la Fase 2.3 de este documento haya completado las declaraciones).
2. **Fase 2**: operaciones canonicas faltantes. Para cada par (modulo_A, modulo_B) detectado, anyadir operacion canonica al destino.
3. **Fase 3**: refactor del consumer (escandallo → `publishAndWait('recetas.obtener.request', ...)` + `publishAndWait('recetas.actualizar_coste.request', ...)`).
4. **Fase 4**: tests POC2 + audit runtime corto contra VPS.
5. **Fase 5**: anyadir cross-check al validator `llm-runtime-discipline.validate.js` para detectar reaparicion del anti-patron.

**Por que alto riesgo**: toca runtime activo (escandallo con cajones_enabled en produccion), modifica multiples blueprints, requiere verificar que el LLM ejecute el nuevo pseudocodigo correctamente. **NO empezar sin tener tiempo dedicado y la disposicion de revertir si algo falla**.

**Estimacion**: 3-5h de cambios + audit.

**Dependencia**: idealmente cerrar 2.3 antes (declaraciones limpias) para que el escaneo de Fase 1 no de falsos positivos.

---

### 2.5 · Cross-check estatico en validator `llm-runtime-discipline` (PRIORIDAD MEDIA)

**Contexto**: el validator `llm-runtime-discipline.validate.js` esta implementado (commit `fead23b`) con 6 cross-checks que verifican:
- Estructura del contrato.
- Cada principio con anti_patron.
- 10 principios (cardinalidad).
- Padre canonico tiene seccion disciplina.
- Principios padre coinciden con contrato.
- Hijos extends padre con disciplina.

**PERO no tiene cross-check para los anti-patrones concretos** que el contrato lista. Concretamente falta `drift_blueprint_fs_read_a_storage_ajeno` que escanee los blueprints buscando `fs.read.request '/<X>.json'` donde `<X>` NO es propio del modulo. Hoy, si alguien anyade un blueprint nuevo que viole el principio, **no se detecta automaticamente** — solo se ve en runtime.

**Que falta**:
1. Anyadir funcion `checkBlueprintsRespetanEstadoPersistente(findings, blueprints)` al validator.
2. Para cada blueprint, leer `estado_persistente`, escanear pseudocodigos buscando `fs.read.request`/`fs.write.request`, y reportar como `error` cualquier path que no este en el `estado_persistente` declarado.
3. Para que esto no de los 5 falsos positivos actuales, primero hay que cerrar 2.3 (declarar paths reales).
4. Wireo a `validate-all` (ya esta).

**Por que prioridad media**: defensa en profundidad — sin esto, el anti-patron puede reaparecer en blueprints futuros sin que nadie se entere hasta el runtime real.

**Estimacion**: ~1h.

**Dependencia**: 2.3 cerrado primero (sin declaraciones limpias, este check da false positives masivos).

---

### 2.6 · Auditorias frescas para 15 sub-modulos (PRIORIDAD BAJA)

**Contexto**: detectado en el analisis inicial del sistema (turno 1 de la sesion). 15 sub-modulos sin `arquitectura/auditoria/_outputs/modulo-completo/<modulo>.json` actualizado — principalmente sub-modulos de `pizzepos/*` y `conversacion/*` anyadidos despues de la ultima ronda.

**Que falta**: regenerar las 15 auditorias con la skill `audit-module` o scripts equivalentes.

**Por que prioridad baja**: housekeeping. No bloquea nada operativamente.

---

### 2.7 · 3 modulos subsistema-recetario sin migrar a blueprint (PRIORIDAD BAJA, APARCADO)

`recetario-creativo`, `pase-cocina`, `mise-en-place`. Declarados como pendientes en `capa-unica-tools-via-plugins.md` y en el roadmap general. Migracion grande, no urgente. **Aparcado conscientemente.**

---

### 2.8 · 30 agentes legacy sin migrar a `agente-blueprint` (APARCADO)

Declarado en `agentes-roadmap.md`. Aparcado hasta que arranque horizontal nuevo, segun CLAUDE.md.

---

## 3 · CONCEPTOS Y PATRONES NUEVOS surgidos durante la sesion

Estos conceptos aparecieron en la sesion pero NO estan plenamente canonizados todavia. Si se diluyen, hay que redescubrirlos.

### 3.1 · "Page navegable" vs "blueprint con cajones_enabled" (DISTINCION CLAVE)

**Aparece en**: frente 2.1 (menu-generator).

**Captura**: el sistema tiene 2 universos parcialmente disjuntos:
- **Blueprints con `cajones_enabled`**: 10 modulos. El LLM los opera con cajones, tienen system prompt rankeado, son destinos validos para `chat.cambiar_foco`.
- **Pages JS legacy**: modulos como `menu-generator`, `comandero`, `cocina`, etc. con `index.js` propio. Tienen pagina en el frontend (rutas SvelteKit) pero el LLM no puede dirigir alli ni aparecen en `page.related`.

**Hacia donde tiende**: introducir flag `"navegable": true` en `module.json` que unifica ambos universos al nivel "page = destino navegable del usuario", independiente de si es blueprint o JS legacy.

**Si se diluye**: la barra `RelatedPagesBar` mostrara siempre subset incompleto. El LLM no podra dirigir a pages JS legacy aunque la conversacion vaya hacia alli.

### 3.2 · "estado_persistente debe declarar TODOS los paths del modulo" (PATRON DE DECLARACION COMPLETA)

**Aparece en**: frente 2.3 (5 blueprints carta-*).

**Captura**: cada blueprint debe declarar en `estado_persistente` TODOS los paths que escribe/lee — no solo el archivo principal. Hoy varios blueprints declaran solo `/<modulo>.json` cuando en realidad operan con subdirectorios (`/cartas/versions/`), archivos plurales (`/cartas-impresion/`), o archivos separados (`/carta-scheduler-reglas.json`).

**Por que importa**:
- Permite a un validador discriminar correctamente "propio" vs "ajeno" para detectar `no_explorar_estado_ajeno`.
- Documenta para el lector qué archivos posee cada modulo (boundary explicito del dominio).
- Permite que la migracion futura de storage (backups, replicacion, particionado) sepa qué mover.

**Si se diluye**: imposible automatizar la deteccion del anti-patron `fs.read/write a storage ajeno`. El validator tendra que decirle al humano "verifica manualmente cada blueprint".

### 3.3 · "Operacion canonica dedicada vs ampliar whitelist" (PATRON DE DOMINIO)

**Aparece en**: frente 2.4 (deuda escandallo).

**Captura**: cuando un modulo necesita actualizar campos derivados en otro (escandallo escribe coste_total en recetas), la opcion canonica es **anyadir operacion nueva** al modulo destino (`recetas.actualizar_coste`) NO ampliar el whitelist de `actualizar`.

**Por que**:
- Separa semanticamente la edicion humana (campos del usuario: nombre, ingredientes, ...) de la actualizacion derivada (campos calculados: coste_*, postcode_usado, fuentes_precios, ...).
- El whitelist de `actualizar` se mantiene focal y los emisores legitimos saben exactamente qué pueden tocar.
- La operacion nueva permite validacion especifica (coste_total >= 0, fuentes_precios subset de catalogo, etc.) sin contaminar la operacion generica.

**Si se diluye**: cada modulo cliente terminara modificando manualmente el whitelist de `actualizar` del destino, llevando a archivos `*.blueprint.json` masivos con switches de 50+ casos mezclando preocupaciones.

### 3.4 · "Cross-check estatico de runtime anti-patron" (PATRON DE VALIDACION)

**Aparece en**: frente 2.5 (validator llm-runtime-discipline incompleto).

**Captura**: los validators de contratos transversales deben detectar **estaticamente** los anti-patrones que el contrato lista, no solo verificar la estructura del contrato. Hoy `llm-runtime-discipline.validate.js` verifica que el contrato esta bien escrito y que los padres tienen la seccion disciplina — **pero no verifica que ningun blueprint viole los 10 principios**.

**Por que importa**:
- El runtime es la "ultima linea de defensa". Si un anti-patron se cuela a un blueprint, solo se ve cuando el LLM ejecuta y fallan cosas (o, peor, NO fallan y producen resultados sutilmente incorrectos).
- El cross-check estatico bloquea el commit antes del runtime.
- Define mecanicamente qué significa "cumplir el principio" (operacionaliza el principio).

**Si se diluye**: nuevos blueprints podran violar `no_explorar_estado_ajeno`, `no_inventes_datos`, `modo_silencioso_en_lecturas`, etc. sin que CI proteste. Solo se detectan en runtime real, donde son mas costosos de arreglar.

### 3.5 · "Falso positivo del validator vs deuda real" (DISCIPLINA INTERPRETATIVA)

**Aparece en**: frente 2.3 + 2.4 (5 carta-* falsos positivos, 1 deuda real).

**Captura**: cuando un validator reporta drift, la primera reaccion no debe ser "arregla todos". Hay que clasificar:
- **Deuda real**: el codigo viola el principio. Refactor del codigo necesario.
- **Falso positivo**: el codigo es correcto, pero el validator usa heuristica simple que no distingue. Refactor de la heuristica o de la declaracion (no del runtime).
- **Excepcion documentada**: el codigo viola conscientemente. Documentar como excepcion en el blueprint hijo, no en el contrato.

**Por que importa**:
- Sin esta disciplina, se "arreglan" sintomas movilizando codigo correcto, dejando la deuda real intacta.
- Y se infla baseline de warnings con falsos positivos que enmascaran drift nuevo real.

**Si se diluye**: cada PR con drift se cierra con "anyadir al baseline" sin analizar, perdiendo el valor del baseline como herramienta de deteccion de drift NUEVO.

### 3.6 · "Audit runtime > validator estatico para semantica" (LIMITES DE LA VALIDACION)

**Aparece en**: frentes 2.4 + el propio audit del 2026-05-23 que descubrio que escandallo viola el principio.

**Captura**: validators estaticos detectan **shape** y **declaraciones**. Algunos anti-patrones SOLO afloran en runtime con LLM real ejecutando un cajon. Casos:
- LLM inventa datos cuando el pseudocodigo es ambiguo.
- LLM abre cajon equivocado cuando la descripcion no es clara.
- LLM ejecuta pseudocodigo que tecnicamente "funciona" pero viola principios (caso escandallo).

**Por que importa**:
- Algunos refactores SOLO se descubren auditando runtime real. El audit del 2026-05-23 fue lo que revelo la deuda escandallo — ningun validator estatico la habia detectado antes.
- La skill `audit-module` no es opcional ni decorativa: es parte del feedback loop.

**Si se diluye**: confianza ciega en validators verdes → blueprints con deuda semantica pasan sin detectar.

### 3.7 · "Dos registries paralelos en el sistema UI" (DRIFT ESTRUCTURAL DETECTADO 2026-05-24)

**Aparece en**: PR #190 (fix icono RelatedPagesPanel no visible en system-bar pese al modulo canonico bien formado).

**Captura**: el sistema UI del frontend tiene DOS registries de paneles coexistiendo, ninguno marcado como obsoleto:

1. **`frontend/src/lib/modules/<name>/manifest.json` + `loader.ts`** — autodiscovery via `import.meta.glob('./*/manifest.json')`. Alimenta `lazy-registry`. Lo usa `registerAllModules()` en `AppShell.svelte`. **Patron moderno**.

2. **`frontend/src/lib/modules/panels.ts`** — objeto `panels: Record<string, PanelDef>` estatico, declarado manualmente. Lo usa `getPanelsByZone()`, consumido por `SystemBar.svelte`, `WorkBar.svelte` y `ChatConfig.svelte` para renderizar BOTONES por zona. **Patron legacy**.

**Consecuencia**: para que un modulo UI nuevo APAREZCA EN UNA BARRA, hay que registrarlo en AMBOS sitios. El precedente del propio repo es `credentials`: su `manifest.json` tiene `zone: 'system-bar'` (registry #1) Y tiene entry `'credentials-list'` en `panels.ts` con `zone: 'chat-config'` (registry #2). El icono visible en la barra viene del #2 — el #1 alimenta al lazy-registry usado por otra parte del sistema.

**Por que importa**:
- Quien anyade un modulo nuevo solo con `manifest.json` cree que "ya esta" porque el patron canonico esta bien formado, pero la barra del sistema queda sin icono. Trampa silenciosa.
- Mantener dos registries paralelos requiere disciplina dual y producira drift entre ambos con el tiempo (ya empieza: credentials declara `zone: 'system-bar'` en #1 pero `zone: 'chat-config'` en #2 — inconsistencia inocua hoy, riesgo manyana).

**Si se diluye**: cada modulo nuevo que se anyada tropezara con el mismo gap. Sin documentar, el patron de "doble registro" se pierde. Cuando finalmente el frontend se rehaga, sera dificil saber cual de los dos registries era "el bueno".

**Que falta documentar/canonizar**:
- Anyadir nota explicita en `contexto/ui.json` describiendo los dos registries, cual usa cada componente (`SystemBar`/`WorkBar`/`ChatConfig` vs `LazyShell`/`lazy-registry`), y la regla operativa: "para que un modulo aparezca con boton en una barra, registralo TAMBIEN en `panels.ts` con loader explicito". ~5 min, riesgo nulo.
- Decision a futuro: unificar los dos registries. Sesion dedicada de frontend, fuera de scope cajones.

---

## 4 · ORDEN RECOMENDADO DE RETOMA

| # | Frente | Riesgo | Coste | Por que en este orden |
|---|---|---|---|---|
| 1 | Nota en `contexto/ui.json` sobre **drift 3.7** (dos registries) | nulo | ~5min | Cierra trampa silenciosa antes de que otro modulo caiga. |
| 2 | **2.3** declaraciones completas en 5 carta-* | bajo | ~1h | Cero runtime. Habilita 2.5 sin falsos positivos. Habilita 2.4 escaneo Fase 1 sin ruido. |
| 3 | **2.5** cross-check estatico en validator disciplina | bajo | ~1h | Bloquea anti-patrones NUEVOS desde CI. Requiere 2.3 cerrado. |
| 4 | **2.1** flag `navegable` para pages JS legacy | bajo-medio | ~1.5h | Cierra agujero conceptual de Fase 5 bis. Decision UX requerida (que modulos marcar). |
| 5 | **2.4** refactor escandallo + recetas + verificar viabilidad | medio-alto | 3-5h | Sesion dedicada. Plan ya escrito en `escandallo-aislamiento-store.md`. Toca runtime. |
| 6 | **2.6** auditorias frescas (15 sub-modulos) | bajo | ~2h | Housekeeping. Sin valor inmediato. |
| 7 | **2.7, 2.8** refactores grandes aparcados | - | - | No urgentes. Esperan disposicion. |

(Frente **2.2** ya cerrado en commits `016961e4` + `255135f2` — ver seccion 2.2 con ✅.)

**Recomendacion**: si arrancas con poco tiempo, **1 + 2 + 3** cierra 3 frentes (~2h total, cero runtime). **4** otro bloque chico. **5** requiere bloque dedicado.

---

## 5 · COMMITS RELEVANTES (para navegar la historia)

```
255135f2 fix(related-pages): registra icono en panels.ts (SystemBar.svelte solo lee de ahi)         [PR #190]
ac1594df merge origin/main: resuelve add/add en _arranque-cajones.md
6b6cb658 chore(baseline): regenera drift-baseline.json con los 2 validators nuevos
016961e4 refactor(related-pages): migra a UI module canonico segun contexto/ui.json
a3d5eee5 docs(arranque-cajones): restaura archivo perdido + cierra 8 respuestas
cfe48809 docs(cajones): consolida 8 frentes abiertos + 6 conceptos pendientes para retomar       [este doc]
285df6c  docs(escandallo): captura deuda de aislamiento del store de recetas
fead23b  feat(llm-runtime-discipline): implementa validator (cierra trabajo pendiente)
a5231d6  chore(repo): archive 16 artefactos sueltos del root del repo
60509a7  docs(cajones): cierra documento de propuesta (Fase 7 del guion)
9feda84  fix(cajones): migra nav tools al patron canonico tools.contract v1.2
513e18c  feat(cajones): Fase 5 bis pieza frontend + uiHandlers nav
3892c91  feat(ai-gateway): cajones Fase 5 bis backend — foco dinamico + grafo
a3c57e0  feat(cajones): Fase 6 — activa cajones_enabled en los 9 blueprints restantes
645f43d  fix(cajones): desincentiva cajon.listar redundante en chitchat
bd31506  feat(cajones): validator + seccion modelo_de_contexto en padre + CLAUDE.md
eca73a1  feat(recetas): activa piloto cajones-context-partitioning (Fase 5)
27110a5  feat(ai-gateway): motor cajones-context-partitioning v1.0.0 (opt-in)
2af69f0  feat(cajones): contrato canonico v1.0.0 — 8 decisiones cerradas
```

3 audits guardados (no commiteados — `audit/` esta en gitignore):
- `audit/recetas-deepseek-20260523-141015/chat-export.json` (Fase 5 piloto).
- `audit/escandallo-postdeploy-20260523-223558/chat-export.json` (post-Fase 6).
- `audit/reaudit-multipage-20260524-022907/chat-export.json` (Fase 5 bis foco dinamico).

---

## 6 · COMO ARRANCAR LA PROXIMA SESION

Mensaje sugerido literal:

> *"Lee `arquitectura/decisiones/propuestas/cajones-frentes-abiertos-retomar.md`
> para retomar el estado de cajones. Tenemos 8 frentes abiertos. Empieza
> por el #1 (declaraciones completas en 5 carta-\*, bajo riesgo, ~1h)
> y para tras cerrarlo para que decida los siguientes."*

Cualquier Claude futuro que abra ese mensaje + lea este doc tendra el
contexto completo y el orden de prioridad explicito.
