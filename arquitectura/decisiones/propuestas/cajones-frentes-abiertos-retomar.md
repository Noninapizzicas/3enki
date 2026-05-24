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

### 2.1 · `menu-generator` y pages JS legacy en el grafo ✅ CERRADO (2026-05-24, menu-generator)

**Resuelto** sin introducir flag nuevo: el campo `target_page_id` que ya
usaban los blueprints es el marcador natural. Si un modulo JS legacy lo
declara en su `module.json`, ai-gateway lo trata como destino navegable
(equivalente a un blueprint a efectos del grafo + `chat.cambiar_foco` +
`page.related`), sin tocar su codigo. No es opcion B "navegable: true",
es opcion mas simple aun: reusar target_page_id.

**Cambios**:
1. `modules/pizzepos/menu-generator/module.json`: anyade `"target_page_id": "menu-generator"` + nota `_target_page_id_nota` explicando el patron.
2. `modules/conversacion/ai-gateway/index.js`:
   - 2 helpers nuevos: `_isNavegablePage(p)` y `_listNavegablePages()`. "Navegable" = blueprint registrado O modulo cargado con `target_page_id`.
   - `_buildPageGraph` registra como nodos del grafo los modulos no-blueprint con `target_page_id` (branch 3 del builder).
   - `_executeNavTool('chat.cambiar_foco')` valida contra `_isNavegablePage` (en lugar de solo `blueprintModules`).
   - `_executeNavTool('page.related')` filtra con `_isNavegablePage`.
   - `_executeLLM` NO necesita cambio: si focoPersistido apunta a page no-blueprint, `blueprintCtx = undefined` → `blueprintPrompt = null` → cae a `effectiveSystem = system` (modo legacy del chat). Ya funcionaba.
3. Tests anyadidos (`tests/unit/ai-gateway-cajones.test.js`, 5 nuevos = 57 totales): isNavegablePage, listNavegablePages, chat.cambiar_foco a menu-generator, _buildPageGraph registra nodo, page.related incluye menu-generator.

**Otros pages JS legacy NO marcados todavia**: `comandero`, `cocina`, `pedidos`, `productos`, `facturas`, `staff-manager`. La decision quedo enmarcada: cuando el usuario quiera anyadir alguno, basta con `"target_page_id": "<nombre>"` en su module.json. Mecanismo es generico.

**Migracion futura de menu-generator a blueprint pleno**: sigue bloqueada por extraccion de modulos OCR (ver `modulos-blueprint-driven.contract.json`). Cuando se haga, se anyade `blueprint_driven: true` + blueprint.json + cajones_enabled SIN cambiar target_page_id. La declaracion actual no obstaculiza esa migracion futura.

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

### 2.3 · 5 blueprints carta-* con `estado_persistente` incompleto ❌ FALSO POSITIVO (corregido 2026-05-24)

**Correccion respecto al primer pase de este doc**: lo describi como
"5 blueprints con declaracion parcial — solo declaran `/<modulo>.json`
pero usan mas paths propios". **INCORRECTO. Los 5 blueprints declaran
correctamente sus paths propios** en `estado_persistente.paths_relativos.*`
(o keys analogos). El problema NO era de los blueprints sino de mi
heuristica de escaneo del 2026-05-24:

| Blueprint | estado_persistente real (verificado) |
|---|---|
| `carta-design` | `paths_relativos_proyecto.designs: '/carta-design/designs/<carta_id>__<timestamp>.html'` + `profiles_custom: '/carta-design/profiles/<profile_id>.json'` |
| `carta-impresion` | `paths_relativos.html: '/cartas-impresion/<carta_id>.html'` + `meta: '/cartas-impresion/<carta_id>.meta.json'` |
| `carta-manager` | `paths_relativos.carta_actual: '/cartas/<carta_id>.json'` + `version_archivada: '/cartas/versions/<carta_id>/<timestamp>.json'` |
| `carta-scheduler` | `paths_relativos.reglas: '/carta-scheduler-reglas.json'` + `pendientes: '/carta-scheduler-pendientes.json'` |
| `carta-marketing` | `paths_relativos.perfil_marca: '/storage/config/marca.json'` |

**Que paso con el escaneo**: el script que escribi para detectar el
anti-patron `fs.read|fs.write` a storage ajeno comparaba los paths
usados contra `'/' + moduleName + '.json'` por defecto, sin leer
`estado_persistente.paths_relativos.*` ni normalizar templates como
`<carta_id>` o `<timestamp>`. Por eso reporto 5 falsos positivos.

**Que NO hay que hacer**: tocar los blueprints. Estan bien declarados.

**Que SI hay que hacer (heredado al frente 2.5)**: cuando se implemente
el cross-check estatico en el validator `llm-runtime-discipline`, la
heuristica DEBE:
1. Leer `estado_persistente` del blueprint y extraer TODOS los paths
   declarados (no asumir patron `/<modulo>.json`). Buscar en
   `paths_relativos.*`, `paths_relativos_proyecto.*`, `paths_modulo*`,
   y en cualquier valor string que empiece por `/` recursivamente.
2. Normalizar templates: `<carta_id>` → matcher, `<timestamp>` →
   matcher, etc. Un path declarado `/cartas/<carta_id>.json` matchea
   `/cartas/abc-123.json` en el pseudocodigo.
3. Cruzar contra paths usados en `fs.read.request`/`fs.write.request`
   del pseudocodigo. Solo marcar como anti-patron si el path usado NO
   matchea ninguno de los declarados.

Patron general aprendido en esta sesion: heuristicas simples del
agente producen falsos positivos que se reportan como "deuda del
sistema". Cada heuristica nueva debe verificarse contra ≥2 ejemplos
canonicos del propio repo antes de declarar drift.

---

### 2.4 · Deuda escandallo + recetas + viabilidad (PRIORIDAD ALTA, DECISION CERRADA, EJECUCION PENDIENTE)

> **Recorrido de la atribucion (cerrado 2026-05-24)**:
>
> 1. **Primera lectura mia** (commit `285df6c`, doc `escandallo-aislamiento-store.md`):
>    presente esto como "deuda silenciosa". Incompleto — el blueprint declara
>    la decision conscientemente.
>
> 2. **Segunda lectura mia** (al implementar el cross-check del frente 2.5):
>    descubri que escandallo declara EXPLICITAMENTE
>    `archivo_destino: /recetas.json` en su `estado_persistente` con
>    `_descripcion`: *"Decision arquitectonica: una sola fuente de verdad
>    por receta — todos los modulos leen del mismo sitio."* Concluí que
>    habia "disonancia real" entre contrato y blueprint, y presente como
>    Opcion A (enmendar contrato) vs Opcion B (refactor escandallo).
>
> 3. **Correccion del usuario** (2026-05-24): *"escandallo no toca nada
>    solo emite eventos y quien escucha y entiende hace o no lo que es
>    oportuno — la magia de los eventos"*. Esto es el paradigma event-core
>    puro. La declaracion `archivo_destino: /recetas.json` solo DOCUMENTA
>    la violacion, NO la legitima. La opcion A era falsa simetria — no es
>    opcion legitima bajo el paradigma del sistema. **La decision correcta
>    es B y siempre lo fue.**
>
> **Decision arquitectural CERRADA**: refactor (opcion B). El plan en 5
> fases sigue valido y vive en `escandallo-aislamiento-store.md`. Lo unico
> que sobra de aquel doc es la presentacion como "deuda silenciosa" — es
> deuda DOCUMENTADA en el blueprint que el blueprint mismo no debio
> documentar; documentarla no la legitima.

**Forma correcta del refactor (resumen del paradigma)**:

- escandallo: cuando termine el calculo, publica
  `escandallo.coste.calculado { receta_id, coste_total, coste_porcion,
  coste_actualizado_at, postcode_usado, fuentes_precios,
  ingredientes_detalle, ingredientes_sin_precio, correlation_id, ... }`.
  Cero `fs.read`/`fs.write` directos a `/recetas.json`.
- recetas: subscribe `escandallo.coste.calculado` y actualiza su propio
  store con esos campos (operacion canonica nueva
  `actualizar_coste` interna que no se expone como tool, solo como
  handler de evento). Mantiene la propiedad del archivo.
- Para LEER datos de recetas (escandallo necesita conocer ingredientes
  para calcular): escandallo invoca
  `publishAndWait('recetas.obtener.request', {project_id, receta_id})`
  y recetas responde. Cero `fs.read.request '/recetas.json'`.

**Que falta ejecutar** (sin disonancia previa que resolver):
1. Anyadir al blueprint de recetas: subscribe a `escandallo.coste.calculado`
   con handler que aplica los 7 campos via operacion interna.
2. Cambiar el blueprint de escandallo: las 3 lecturas a
   `publishAndWait('recetas.obtener.request', ...)`. La escritura sustituida
   por `publish('escandallo.coste.calculado', {...})`.
3. Remover el `archivo_destino: /recetas.json` del `estado_persistente`
   de escandallo (era documentacion de la violacion). Anyadir nota que
   escandallo NO tiene estado persistente propio porque sus calculos
   son derivacion publicada como evento.
4. Verificar `viabilidad` por el mismo patron (no comprobado por audit
   truncado — la BD vacia corto la inspeccion).
5. Tests + audit runtime corto en VPS.

**Por que alto riesgo**: toca runtime activo en el VPS (escandallo y
recetas con cajones_enabled en produccion). Requiere coordinar 2
blueprints simultaneamente — si solo se cambia uno, el otro queda
desincronizado y los costes no se persisten.

**Estimacion**: 3-5h.

---

### 2.5 · Cross-check estatico en validator `llm-runtime-discipline` ✅ PRIMERA CAPA CERRADA (2026-05-24)

**Estado actual**: cross-check `drift_blueprint_fs_read_a_storage_ajeno`
**implementado y wireado** en commit (este). PASS verde contra los 10
blueprints actuales — 0 findings (consistente con la decision arquitectonica
de escandallo de declarar `archivo_destino: /recetas.json` en su
`estado_persistente`, que la heuristica respeta).

**Refinamiento pendiente — "conflicto de propiedad"**: la heuristica actual
detecta uso sin declaracion, pero NO detecta el sub-caso real "dos modulos
declaran el mismo path como propio". Ese es el anti-patron de verdad cuando
un blueprint declara `archivo_destino` apuntando al storage de otro modulo
(escandallo declara /recetas.json, recetas tambien lo declara). El
refinamiento requiere:
1. Construir mapa global `path → [modulos que lo declaran]`.
2. Si un path aparece en >1 modulo: **flag para revision humana**
   (decision consciente legitima o drift inconsciente).
3. Si el blueprint que declara el path "ajeno" tiene `_descripcion` que
   justifica explicitamente la excepcion → warning informativo. Sin
   `_descripcion` → error.

Este refinamiento depende de resolver primero la disonancia del frente
2.4 (opcion A enmendar contrato vs opcion B refactorizar). Si va A,
el refinamiento debe formalizar la salvedad. Si va B, escandallo deja
de declarar y el refinamiento se convierte en check estricto.

**Contexto original (cumplido)**: el validator `llm-runtime-discipline.validate.js` esta implementado (commit `fead23b`) con 6 cross-checks que verifican:
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
3. Wireo a `validate-all` (ya esta).

**Heuristica obligatoria (importante — sin esto produce falsos positivos masivos)**:

Esta nota viene de la correccion del frente 2.3 (ver arriba): los
blueprints declaran `estado_persistente` en formatos heterogeneos
(claves `paths_relativos.*`, `paths_relativos_proyecto.*`, `paths_modulo*`,
o strings sueltos). Y usan TEMPLATES en los paths declarados
(`/cartas/<carta_id>.json`, `/carta-design/designs/<carta_id>__<timestamp>.html`)
que NO matchearan literalmente contra los paths que el pseudocodigo
construye en runtime. La heuristica DEBE:

1. **Leer `estado_persistente` recursivamente** y extraer TODOS los
   strings que empiecen por `/` (no asumir patron `/<modulo>.json`).
   Cubrir al menos: `paths_relativos.*`, `paths_relativos_proyecto.*`,
   `paths_modulo*`, y cualquier key del objeto cuyo valor sea string
   empezando por `/`.
2. **Normalizar templates** declarados a regex matchers:
   `<carta_id>` → `[\w-]+`, `<timestamp>` → `[\w.-]+`, etc.
3. **Cruzar contra paths usados** en `publishAndWait('fs.(read|write).request', {path: '/<X>...'})` del pseudocodigo. Marcar como anti-patron SOLO si ningun matcher declarado encaja.

**Test obligatorio antes de wirear el cross-check**: correr la
heuristica contra los 10 blueprints actuales del repo y verificar que
**solo escandallo** sale como anti-patron (las 3 lecturas + 1
escritura directa a `/recetas.json` desde escandallo, que es la deuda
real documentada en `escandallo-aislamiento-store.md`). Si la
heuristica produce findings en cualquier otro blueprint, esta mal
escrita — los 5 carta-* son falsos positivos garantizados de
heuristicas simples (ver frente 2.3).

**Por que prioridad media**: defensa en profundidad — sin esto, el anti-patron puede reaparecer en blueprints futuros sin que nadie se entere hasta el runtime real.

**Estimacion**: ~1.5h (1h implementacion + 30min verificacion contra los 10 blueprints actuales).

**Dependencia (corregida)**: ya NO depende de 2.3 (2.3 era falso positivo).
Depende solo de que la heuristica este bien escrita (ver nota obligatoria
arriba).

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

### 3.7 · "Dos registries paralelos en el sistema UI" — REGLA YA DOCUMENTADA, FUE ERROR DE LECTURA MIO (corregido 2026-05-24)

**Correccion respecto al primer pase de este doc**: lo describí como "drift
estructural descubierto" — INCORRECTO. La regla ESTA documentada en
`contexto/ui.json::panel_system.registro_obligatorio` desde antes de la
sesion:

> *"Cada panel flotante DEBE estar en panels.ts con su loader. El
> autodiscovery de manifest.json descubre módulos pero los paneles se
> registran aparte."*

Lo que paso es que en mi primer pase por `contexto/ui.json` (al hacer el
refactor canonico de related-pages, commit `016961e4`/PR #189) lei los
campos `layout`, `panel_system.flujo` y `ui_modules` pero NO me detuve
en `registro_obligatorio`. Resultado: el modulo canonico quedo bien
formado pero sin entry en `panels.ts`, asi que el icono no aparecio en
system-bar. El fix vino en PR #190 — corregir mi error de lectura,
NO de descubrir drift.

**La regla operativa sigue vigente**: para que un modulo UI con icono
visible aparezca en una barra, necesita DOS registros (autodiscovery +
panels.ts). Ver `contexto/ui.json::panel_system.doble_registro_obligatorio`
(reforzado en esta sesion con ejemplo canonico de `credentials` + ejemplo
real de la trampa de PR #189/#190 + regla operativa explicita para
agentes futuros).

**Captura mecanica**:

| Sistema | Que registra | Quien lo consume |
|---|---|---|
| `manifest.json` + `loader.ts` (autodiscovery via `import.meta.glob`) | el modulo como tal en `lazy-registry` para apertura de panel | `registerAllModules()` en `AppShell.svelte`, `LazyShell.svelte` para abrir paneles |
| `panels.ts` (registry estatico manual con `PanelDef` por entrada) | `PanelDef` con `zone`, `icon`, `title`, `size`, `loader` para renderizar BOTON en una barra | `SystemBar.svelte`, `WorkBar.svelte`, `ChatConfig.svelte` via `getPanelsByZone()` |

**Precedente del propio repo**: `credentials/manifest.json` tiene
`zone: 'system-bar'` (autodiscovery) y `panels.ts::'credentials-list'`
tiene `zone: 'chat-config'` (estatico) — los dos pueden diferir, no
contradiccion sino zonas distintas para roles distintos.

**Si se diluye**: cualquier modulo nuevo cae en la misma trampa
(manifest bien formado pero sin entry en panels.ts → boton invisible
en barras). El refuerzo de `contexto/ui.json::doble_registro_obligatorio`
de esta sesion deberia prevenirlo.

---

## 4 · ORDEN RECOMENDADO DE RETOMA

| # | Frente | Riesgo | Coste | Por que en este orden |
|---|---|---|---|---|
| 1 | **2.4** decidir A/B + ejecutar (refactor escandallo o enmendar contrato) | depende | ~30min decision + 3-5h si B / 30min si A | Decision arquitectural previa OBLIGATORIA. Ver seccion 2.4 (disonancia contrato vs blueprint documentada). |
| 2 | **2.5 refinamiento** "conflicto de propiedad" en validator | bajo | ~1.5h | Solo cobra sentido despues de cerrar 2.4. Ver seccion 2.5 (primera capa ✅ cerrada; falta segunda capa). |
| 3 | **2.6** auditorias frescas (15 sub-modulos) | bajo | ~2h | Housekeeping. Sin valor inmediato. |
| 4 | **2.7, 2.8** refactores grandes aparcados | - | - | No urgentes. Esperan disposicion. |

(Frente **2.1** menu-generator/pages JS legacy ya cerrado: reusa `target_page_id` existente, sin flag nuevo. Cualquier otro modulo JS legacy se anyade igual.)
(Frente **2.2** ya cerrado en commits `016961e4` + `255135f2`.)
(Frente **2.3** era FALSO POSITIVO de mi heuristica — los 5 blueprints carta-* declaran `estado_persistente` correctamente.)
(Frente **2.5 primera capa** ya cerrada en commit `7d5ff4a0`: cross-check `drift_blueprint_fs_read_a_storage_ajeno` implementado y wireado, PASS verde. Refinamiento "conflicto de propiedad" depende de cerrar 2.4 — ver tarea #2 arriba.)
(Concepto **3.7** ya cerrado en commit `6c8c5b66`.)

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
