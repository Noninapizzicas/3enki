# Migración agentes legacy → patrón agente-blueprint

> **Documento de retomar.** Captura el plan completo para migrar los 30
> agentes que viven en `modules/conversacion/ai-agent-framework/agents/`
> al patrón `agente-blueprint` (módulos independientes con las 5 piezas:
> contrato propio + blueprint hijo + system prompt + module.json + cero JS).
> Es la deuda mayor que queda en el sistema tras cerrar `cajones` y
> `tools.contract v1.2`.
>
> **NO se implementa todavía en esta sesión.** Esta propuesta deja todo
> escrito para que otra conversación ejecute Fase 0 (completar piezas
> estructurales) + Fase 1 (piloto único end-to-end) + Fases 2-5 (resto).

Fecha: 2026-05-24.
Documentos hermanos:
- `capa-unica-tools-via-plugins.md` ✅ cerrado (tools.contract v1.2 en main).
- `cajones-context-partitioning.md` ✅ cerrado (motor + Fase 5 bis + Fase 6 en main).

---

## 1 · Por qué existe este documento

Tras cerrar cajones, el frente 2.8 del doc retomar
(`cajones-frentes-abiertos-retomar.md`) quedó como **único frente mayor
abierto del sistema**: *"30 agentes legacy sin migrar a `agente-blueprint`
(APARCADO)"*. El roadmap viejo
(`arquitectura/migracion/notas/agentes-roadmap.md`, 2026-05-18) está bien
escrito pero:

1. **Vive en `notas/`**, no en `propuestas/`. No tiene la disciplina del
   patrón que estamos usando (propuesta consolidada + arranque + ejecución
   en otra sesión).
2. **Marcó `[x]` Fase 0 entera**, pero piezas físicas faltan:
   - `modules/_agentes-blueprint/agente-base.blueprint.json` — **NO existe**.
   - `arquitectura/decisiones/_validators/agente-blueprint.validate.js` —
     **NO existe**.
   - `arquitectura/decisiones/_schemas/agente-blueprint/...` — **NO existe**.
   - SÍ existe el contrato transversal `agente-blueprint.contract.json`
     v1.0.0 (485 líneas, 13 principios, 11 decisiones arquitectónicas,
     10 prohibiciones, 20 cross-checks declarados).
3. **Decisiones de fondo abiertas** que el roadmap planteó como preguntas
   y nunca cerró (ver sección 7 de este doc).
4. **Algunos agentes no encajan en el modelo simple** — tienen
   `event_listener` + `publish_on_success` + `publish_on_failure` (son
   trigger-based, reaccionan a eventos del dominio en lugar de invocarse
   on-demand). El contrato canónico no contempla este modo explícitamente.

Este documento consolida el roadmap, las piezas reales en disco, las
decisiones abiertas y un camino de implementación con guion de arranque.

**Cómo usar este documento en la próxima sesión:**
1. Lee este doc (~15 min).
2. Lee `arquitectura/decisiones/_contratos/agente-blueprint.contract.json`
   (~10 min, fuente de verdad del modelo).
3. Lee `arquitectura/migracion/notas/agentes-roadmap.md` (~5 min, plan de
   fases por subsistema).
4. Sigue el guion en `_arranque-agentes-blueprint.md`.

---

## 2 · Estado actual del sistema

### Los 30 agentes legacy (en disco hoy)

Listados en `modules/conversacion/ai-agent-framework/agents/`. 31 archivos
JSON (uno por agente). Inventario completo por subsistema en
`agentes-roadmap.md`. Resumen:

| Subsistema | Agentes | Notas |
|---|---|---|
| Recetario | 8 | escandallo-analyzer, viabilidad-receta-analyzer, 6 recipe-* (2 disabled) |
| Carta digital + tarifas | 8 | cartadigital-* (4), tarifas-* (2), marketing-* (2) |
| Menu generator | 4 | marketing-strategist, menu-{enricher,structurer,validator} |
| Carta scheduler | 2 | scheduler-{dispatcher,planner} |
| Facturas | 2 | invoice-{structurer,validator} (ambos con tools:[]) |
| Impresion | 2 | impresion-{architect,builder} |
| Device/ESP32 | 1 | device-ops (26 tools — outlier crítico) |
| Transversales | 4 | architect (disabled), image-processor (disabled), intent-router, marketing-onboarding |

Estados runtime: **27 enabled / 3 disabled** (architect, image-processor,
recipe-curator). Anomalía: recipe-structurer aparece como disabled en
inventario pero `enabled:true` en su JSON.

### Tres patrones de invocación distintos coexisten

Examinando los JSONs, los agentes legacy se invocan de tres formas
distintas:

1. **On-demand vía `agent.execute.request`** (mayoría): el LLM principal
   o un módulo publica el evento al bus con `{agent_name, task, context}`.
   Es el modelo limpio que el contrato `agente-blueprint` describe.

2. **Trigger-based vía `event_listener` + `publish_on_success/failure`**
   (algunos del subsistema-recetario, ej. `escandallo-analyzer`): el
   agente declara que escucha un evento del dominio (`escandallo.calculado`)
   y al ejecutarse publica resultado en otro evento canónico
   (`escandallo.analysis.completed`). El framework actual los engancha
   al bus directamente. **Esto NO está en el contrato agente-blueprint
   actual.**

3. **Tool de un LLM principal** (`invoke_agent`): el LLM principal tiene
   esta tool y la llama con el `agent_name`. Es lo mismo que el modo 1
   pero invocado desde tool call. El contrato `agent-flow` ya canoniza el
   evento subyacente.

### Lo que SÍ está cerrado de Fase 0

- ✅ Contrato transversal `agente-blueprint.contract.json` v1.0.0 (vivo,
  validado por revisión humana, no por validator todavía).
- ✅ Categoría `agentes_especialistas` declarada en
  `modulos-blueprint-driven.contract.json`.
- ✅ Roadmap `agentes-roadmap.md` con inventario + drift por agente +
  plan de fases.
- ✅ Mención en `CLAUDE.md` del contrato (1 ocurrencia).
- ✅ `arquitectura/agentes-tools.json` con categorías read/write/destructive
  + reglas de confirmación inline para destructivas (vigente desde
  2026-04-27).

### Lo que FALTA de Fase 0 (deuda crítica antes de migrar nada)

| Pieza | Por qué falta | Esfuerzo |
|---|---|---|
| `modules/_agentes-blueprint/agente-base.blueprint.json` (blueprint padre del que heredan todos los hijos) | El contrato lo referencia pero el archivo no existe. Sin padre no hay herencia posible. | 1-2h |
| `arquitectura/decisiones/_schemas/agente-blueprint/agente-blueprint.schema.json` (schema AJV 2020-12 strict del shape `<agente>.blueprint.json`) | Sin schema no hay validación mecánica. | 1h |
| `arquitectura/decisiones/_schemas/agente-blueprint/<agente>.contract.schema.json` (schema del contrato propio de cada agente) | Sin schema no se valida cada contrato derivado. | 30min |
| `arquitectura/decisiones/_validators/agente-blueprint.validate.js` (implementa los 20 cross-checks declarados en el contrato) | Wireado a `validate-all` pendiente. | 3-4h |
| Drift baseline section para `agente-blueprint` en `drift-baseline.json` | El validator publica sus drifts; el baseline los congela. | 30min |
| Decidir cómo el modelo trata agentes trigger-based (event_listener) | Crítico: ~8 agentes recetario tienen este shape. | 1h diseño |

**Total Fase 0**: ~7-9h de trabajo estructural antes de migrar el primer
agente.

---

## 3 · Decisiones ya tomadas (en el contrato `agente-blueprint.contract.json`)

El contrato v1.0.0 canoniza las siguientes decisiones que NO hay que
revisitar:

| Decisión | Detalle |
|---|---|
| **Agente = módulo independiente** | Vive en `modules/<agente>/` como ciudadano de primera, cargado por loader normal. NO en `ai-agent-framework/agents/`. |
| **Cero JS por agente** | `module.json` sin `main`, sin `*.js` en el directorio. Blueprint puro + system prompt. |
| **Blueprint padre dedicado** | `_agentes-blueprint/agente-base.blueprint.json`. NO heredan de `subsistema-recetario.modulo-base` aunque sean del recetario. La distinción ontológica (razonamiento vs operación) se preserva vía padre distinto. |
| **Contrato propio obligatorio** | `arquitectura/decisiones/_contratos/<agente>.contract.json` por cada agente. Sin contrato no es canónico. |
| **System prompt en `.md` separado** | `modules/<agente>/<agente>-system.md`. NO inline en JSON. Reglas heredadas: h1, sin frontmatter YAML, ≥200 caracteres. |
| **Invocación canónica vía `agent.execute.request`** | El LLM publica el evento al bus (vía `bus.publish` o `bus.publishAndWait`). La tool `invoke_agent` legacy sobrevive en transición pero NO es necesaria. |
| **`operacion_canonica` verbo imperativo** | Idioma del módulo. Ej: 'analizar', 'componer', 'validar'. |
| **`dominios_consultados[]`** | Array de nombres de módulos del repo que el agente consulta vía `bus.publishAndWait`. Validable. |
| **`eventos_que_invoca[]`** | Array de eventos canónicos que el agente envía al bus. Cruzable con catálogo. |
| **Cero `estado_persistente`** | Drift crítico si declara persistencia propia. El agente razona; no es dueño de data. |
| **Cero eventos de dominio publicados** | El agente NO publica `<entidad>.<verbo_participio>`. Solo `agent.execute.response`. Los eventos de dominio los publica el módulo destino. |
| **Provider del enum cerrado** | `{auto, deepseek, anthropic, openai, groq, gemini, ollama, claude-cli}`. `auto` recomendado. |
| **`enabled:false` lleva `disabled_reason`** | Sin razón documentada = drift. |
| **Un rol por (dominio, operacion_canonica)** | Dos agentes con misma operación + dominio = drift de diseño. |
| **`agents-config.contract.json` coexiste durante transición** | El legacy queda válido para los agentes que aún viven en `ai-agent-framework/agents/`. Cuando esa carpeta se vacíe, se archiva el contrato legacy. |

---

## 4 · Decisiones AÚN abiertas (a cerrar antes de tocar código)

Las 9 decisiones que el roadmap dejó como preguntas y el contrato no
resuelve.

### 4.1 Agentes trigger-based: ¿cómo encajan en el modelo blueprint?

`escandallo-analyzer` y otros 7 agentes del subsistema-recetario declaran
`event_listener` + `publish_on_success` + `publish_on_failure`. Reaccionan
a un evento del dominio en lugar de invocarse via `agent.execute.request`.

- **Opción A — Mantener trigger-based como modo declarativo del blueprint**.
  El blueprint hijo declara `reacciona_a_evento: '<x>'` + `publica_resultado_en: '<y>'`.
  ai-gateway (o un módulo nuevo `agent-trigger-dispatcher`) escucha esos
  eventos y publica `agent.execute.request` automáticamente.
- **Opción B — Eliminar el modo trigger durante la migración**. El módulo
  que publica el evento del dominio (ej. `escandallo` cuando publica
  `escandallo.calculado`) se modifica para invocar explícitamente el agente
  via `agent.execute.request` en su pseudocódigo. Más limpio, más cambios
  cross-módulo.
- **Opción C — Híbrida**. Soportar ambos modos, default on-demand,
  trigger opcional declarable en el blueprint.

**Implicación**: A preserva el shape actual (mínima fricción). B unifica
el modelo (más coherente, más trabajo de migración). C añade complejidad
sin beneficio claro.

### 4.2 ¿Migración por subsistema o agente-a-agente?

El roadmap propone fases por subsistema (recetario → carta → menu →
scheduler → facturas → impresion → device → especiales). Pero también
dice "uno por uno".

- **Opción A — Subsistema entero por sprint**. Migrar los 8 agentes del
  recetario en un sprint, los 8 de carta-digital en otro, etc. Mejor para
  validar el modelo end-to-end por dominio.
- **Opción B — Agente a agente individual**. Cada agente es un PR. Más
  granular, más PRs, más overhead. Coherente con `module-rewrite` que
  hicimos para los 70 módulos.
- **Opción C — Olas pragmáticas**. Sprint 1: escandallo-analyzer (piloto).
  Sprint 2: resto del recetario. Sprint 3-N: subsistema entero por sprint.

### 4.3 ¿Qué hacer con los 3 (4) disabled?

- `architect` (disabled, sin razón). Tiene `prompts/architect-knowledge.md`
  separado del system prompt.
- `image-processor` (disabled, sin razón. Sospecha: tools fantasma
  `sharp_*`).
- `recipe-curator` (disabled CON razón: obsoleto post-v2 recetas).
- `recipe-structurer` (aparece disabled en inventario pero
  `enabled:true` en JSON — verificar).

**Opciones generales**: (a) eliminar todos los disabled durante la
migración; (b) migrarlos como disabled (con `disabled_reason` documentado);
(c) caso por caso.

### 4.4 ¿`recipe-analyzer`, `recipe-completer`, `recipe-structurer` siguen siendo agentes?

El módulo `recetas` ya tiene cajones (`crear`, `obtener`, `listar`, ...).
¿Sigue tiendo sentido tener un `recipe-analyzer` separado o se absorbe
como operación `recetas.analizar`?

- **Opción A — Conservar como agentes** (razonamiento sobre recetas vs
  operación del módulo).
- **Opción B — Absorber como operaciones del módulo `recetas`** (el LLM
  ejecuta el blueprint de `recetas`, ya no hay agente intermedio).
- **Opción C — Mixto**: `recipe-analyzer` se absorbe (es razonamiento
  básico que puede vivir en el blueprint del módulo) pero
  `recipe-chef-advisor` y `recipe-researcher` se conservan (son
  razonamientos más complejos con personalidad propia).

### 4.5 ¿`viabilidad-receta-analyzer` se fusiona con el módulo `viabilidad`?

Mismo dilema que 4.4 pero específico a viabilidad. El módulo `viabilidad`
ya tiene su blueprint. ¿Tiene sentido un agente separado?

### 4.6 ¿`device-ops` se divide durante la migración o se migra entero?

`device-ops` tiene 26 tools — viola el umbral 20 de `agents-config`. El
roadmap propone dividirlo en `device-registrar` + `esp32-flasher-operator`
+ `firmware-deployer`.

- **Opción A — Dividir durante la migración** (3-4 agentes nuevos, cada
  uno con su contrato).
- **Opción B — Migrar entero** (1 agente con 26 tools, drift warning
  asumido, dividir después en otro horizontal).
- **Opción C — No migrar todavía** (caso especial, posponer hasta que
  el subsistema device tenga su propio horizontal).

### 4.7 ¿Qué pasa con `intent-router`?

Es la **única puerta de entrada del chat** según su descripción. Migrarlo
a blueprint reconfigura el flujo entero del chat (cómo el LLM principal
ve sus tools, qué eventos publica, etc.).

- **Opción A — Migrarlo último** (cuando los otros 29 ya estén
  migrados). El roadmap recomienda esto.
- **Opción B — Migrarlo primero** (como piloto definitivo del modelo).
  Si funciona aquí, funciona en cualquier lado. Pero si rompe, rompe el
  chat entero.
- **Opción C — No migrarlo nunca**. Es tan central que vive como
  excepción del modelo. Se mantiene en `ai-agent-framework`.

### 4.8 ¿Qué hace `ai-agent-framework` cuando los 30 estén migrados?

- **Opción A — Se elimina completamente**. Toda la lógica pasa a ai-gateway
  (dispatching de `agent.execute.request`).
- **Opción B — Sobrevive aligerado** como dispatcher de
  `agent.execute.request` + `invoke_agent` tool (compat). Sin gestionar
  archivos en `agents/`.
- **Opción C — Se fusiona con `ai-gateway`** (un solo módulo que ejecuta
  blueprints sean módulos o agentes).

### 4.9 ¿Cómo se integra `agentes-tools.json` (categorías read/write/destructive) con el modelo blueprint?

Hoy existe `arquitectura/agentes-tools.json` con categorías y reglas de
confirmación inline. En el modelo agente-blueprint:

- **Opción A — Conservar el archivo como regla global** que el validator
  cruza con cada `eventos_que_invoca[]` del blueprint.
- **Opción B — Embeber las categorías en el blueprint padre**
  `_agentes-blueprint/agente-base.blueprint.json`.
- **Opción C — Mover la regla al contrato `tools.contract.json`** (que ya
  cubre tools del sistema). Centralizar en un solo lugar.

---

## 5 · Cuellos identificados

| # | Cuello | Severidad | Mitigación |
|---|---|---|---|
| 1 | Blueprint padre `_agentes-blueprint/agente-base.blueprint.json` no existe | Alta | Crearlo en Fase 0. Bloquea cualquier migración. |
| 2 | Validator `agente-blueprint.validate.js` no existe | Alta | Implementarlo en Fase 0 con los 20 cross-checks ya declarados. |
| 3 | 8 agentes son trigger-based (event_listener) — modelo no canonizado | Alta | Cerrar decisión 4.1 antes de migrar nada del recetario. |
| 4 | `intent-router` es la puerta del chat — su migración reconfigura todo | Alta | Cerrar decisión 4.7. Si A (último), no preocupa hasta Fase 4. |
| 5 | Lock-in al provider `deepseek` en agentes con `provider: deepseek` (device-ops, marketing-*) | Media | Migración cambia a `provider: auto` por defecto. Validar que el rol no necesita un provider específico. |
| 6 | Tools fantasma documentadas en roadmap (device-ops 26 tools, image-processor sharp_*, recipe-analyzer recetas.calcular_costes) | Media | Validator detecta en Fase 0. Cerrar caso a caso durante migración. |
| 7 | Drift `prompt_file: prompts/<x>.json` legacy (10 agentes) | Baja | Limpieza mecánica durante la migración: `.json` legacy se borra, `prompt_file` se actualiza al `.md`. |
| 8 | `architect` tiene `prompts/architect-knowledge.md` separado del system prompt | Media | Decidir en Fase 4 si knowledge es contexto inyectado o parte del system prompt. |
| 9 | `invoice-{structurer,validator}` con `tools:[]` | Baja | Verificar si es legítimo (LLM razona con prompt solo) o si faltan tools. Decisión por agente. |
| 10 | 30 contratos derivados a escribir (uno por agente migrado) | Media | Trabajo proporcional pero mecánico una vez existe el schema del contrato derivado. |

---

## 6 · Lo que NO se incluye en v1 de la migración

- **NO se reescriben los pseudocódigos de los agentes desde cero**. El
  system prompt y la lógica de cada agente se preservan; solo cambia el
  formato (JSON+`prompt_file` → blueprint+`<agente>-system.md`).
- **NO se cambian los eventos `agent.execute.{request,response,failed,progress}`**.
  El contrato `agent-flow` sigue vigente sin tocar.
- **NO se inventa una capa de orquestación nueva**. Si surge la
  necesidad de orquestar varios agentes en pipeline, eso es horizontal
  futuro.
- **NO se migran `architect`, `image-processor` ni `recipe-curator`** si
  la decisión 4.3 cierra como "eliminar disabled durante la migración".
- **NO se toca el código del módulo `ai-agent-framework/index.js` hasta
  Fase 5** (evaluación post-migración).
- **NO se modifica `agents-config.contract.json`** mientras la carpeta
  `agents/` tenga algún agente vivo. Convivencia transitoria.

---

## 7 · Camino propuesto para implementación

### Fase 0 — Completar piezas estructurales (7-9h, antes de migrar nada)

Bloqueante para todo lo demás.

1. **Crear blueprint padre** `modules/_agentes-blueprint/agente-base.blueprint.json`.
   Captura: `modelo_de_ejecucion`, `contexto_inyectado`,
   `primitivas_universales_del_bus` (`bus.publish`, `bus.publishAndWait`,
   `llm.complete.request`), `tools_universales`, `helpers_built_in`,
   `manejo_de_errores`, `naming_canonico_de_eventos`, `limite_del_agente`,
   sección `disciplina_del_llm_runtime` inline (heredada del padre
   recetario, adaptada).
2. **Crear schemas** en `arquitectura/decisiones/_schemas/agente-blueprint/`:
   - `agente-blueprint.schema.json` (shape de `<agente>.blueprint.json`).
   - `<agente>.contract.schema.json` (shape del contrato derivado).
3. **Implementar validator** `arquitectura/decisiones/_validators/agente-blueprint.validate.js`
   con los 20 cross-checks declarados en el contrato.
4. **Wirear** a `scripts/validate-all.js`, npm script `validate:agente-blueprint`,
   y workflow `validate.yml`.
5. **Sección baseline** `agente-blueprint` en `drift-baseline.json` con
   los drifts conocidos de los 30 agentes legacy (todos quedan congelados
   antes de migrar; al migrar, cada PR cierra unos cuantos).

### Fase 1 — Cerrar las 9 decisiones abiertas (1-2h, sin código)

Cerrar las decisiones 4.1-4.9 con el usuario. Sin esto la Fase 2 va a
ciegas.

### Fase 2 — Piloto único end-to-end: `escandallo-analyzer` (3-5h)

**Razón del piloto**: subsistema-recetario (infra existente), operación
acotada (análisis de coste-receta), pipeline funcional, trigger-based (si
4.1 cierra como A o C, valida el modelo trigger).

Entregables:
1. `arquitectura/decisiones/_contratos/escandallo-analyzer.contract.json`.
2. `modules/escandallo-analyzer/module.json`.
3. `modules/escandallo-analyzer/escandallo-analyzer.blueprint.json` (extiende `agente-base`).
4. `modules/escandallo-analyzer/escandallo-analyzer-system.md` (system prompt curado del actual `prompts/escandallo-analyzer.md`).
5. Tests POC2 cubriendo `agent.execute.request` invocación + (si aplica)
   modo trigger.
6. Eliminación del archivo legacy `ai-agent-framework/agents/escandallo-analyzer.json`.
7. Audit runtime: ejecutar el agente en una sesión real, verificar que
   `agent.execute.response` llega + `chat.assistant.saved` se publica
   vía agent-observer.

### Fase 3 — Subsistema-recetario completo (5-8h)

Migrar los 7 agentes restantes del recetario, en este orden:

1. `viabilidad-receta-analyzer` (o decisión 4.5 cierra como "fusionar").
2. `recipe-chef-advisor` (claro caso de razonamiento complejo).
3. `recipe-researcher`.
4. `recipe-analyzer` (o decisión 4.4 cierra como "absorber").
5. `recipe-completer` (o decisión 4.4 cierra como "absorber").
6. **Eliminar** `recipe-curator` (disabled, razón documentada).
7. **Eliminar o migrar** `recipe-structurer` (decisión 4.3).

### Fase 4 — Subsistemas secundarios (10-15h)

Por subsistema, según decisión 4.2:

1. **carta-digital + tarifas** (8 agentes).
2. **menu-generator** (4 agentes).
3. **carta-scheduler** (2 agentes).
4. **facturas** (2 agentes — verificar tools vacías antes).
5. **impresion** (2 agentes).

### Fase 5 — Casos especiales (5-8h)

1. **`device-ops`** según decisión 4.6 (dividir/migrar entero/posponer).
2. **`image-processor`** (cerrar tools fantasma sharp_* o eliminar).
3. **`marketing-onboarding`** (¿agente o se fusiona con onboarding del
   proyecto?).
4. **`architect`** (decisión 4.3).
5. **`intent-router`** según decisión 4.7 (último, primero, o nunca).

### Fase 6 — Evaluar `ai-agent-framework` (2-4h)

Decisión 4.8. Tres outcomes posibles:
- Eliminar el módulo (carpeta `modules/conversacion/ai-agent-framework/`
  archivada en `_archived/`).
- Aligerar a dispatcher de `agent.execute.request` + tool `invoke_agent`.
- Fusionar con `ai-gateway`.

### Fase 7 — Cierre

1. Archivar `agents-config.contract.json` (legacy).
2. Actualizar `CLAUDE.md` con el nuevo paradigma.
3. Regenerar baseline.
4. PR a main.
5. Cerrar frente 2.8 del doc retomar de cajones.

**Total estimado**: 30-50h de trabajo repartido en 5-7 sesiones. Cada
fase es commit independiente.

---

## 8 · Cómo arrancar la próxima sesión

Mensaje sugerido literal:

> *"Vamos a implementar la migración de los 30 agentes al patrón
> `agente-blueprint`. Lee
> `arquitectura/decisiones/propuestas/migracion-agentes-blueprint.md`
> entero. Sigue el guion en
> `arquitectura/decisiones/propuestas/_arranque-agentes-blueprint.md`."*

El guion del arranque hace que la próxima conversación:
1. Verifique el estado de Fase 0 en disco.
2. Te haga las **9 preguntas abiertas** en orden.
3. Cierre las decisiones contigo.
4. **Para y pide tu OK** antes de tocar código.

---

## 9 · Relación con otros contratos del sistema

| Contrato | Cómo se relaciona |
|---|---|
| `agente-blueprint.contract.json` | **Fuente de verdad del modelo**. Define el shape de cada agente migrado. |
| `agents-config.contract.json` | **Modelo legacy**. Coexiste durante la transición. Cuando `ai-agent-framework/agents/` quede vacío, se archiva. |
| `agent-flow.contract.json` | **Eventos canónicos** (`agent.execute.request/response/failed/progress`). Sigue vigente sin tocar. |
| `companero-viaje.contract.json` | "Agente" es uno de los 5 tipos canónicos de extensión del compañero. Esta migración formaliza el tipo en su forma blueprint. |
| `modulos-blueprint-driven.contract.json` | Define la categoría `agentes_especialistas`. Este horizontal materializa esa categoría. |
| `tools.contract.json` v1.2 | Las tools del agente son referencias a eventos canónicos cruzables contra el catálogo. |
| `llm-flow.contract.json` | `llm.complete.{request,response,failed}` que ai-gateway publica al ejecutar el blueprint del agente. |
| `llm-runtime-discipline.contract.json` | Las 10 reglas del LLM aplican al agente como a cualquier otro blueprint. |
| `cajones-context-partitioning.contract.json` | Los blueprints de agentes **NO** activan cajones en v1. Posible extensión futura si un agente tiene >5 modos. |
| `errors.contract.json` | Errores canónicos del agente: AGENT_TIMEOUT, AGENT_TOOL_NOT_FOUND, AGENT_INVALID_RESPONSE, AGENT_UPSTREAM_FAILURE. |
| `agentes-tools.json` (categorías read/write/destructive) | Regla global. Decisión 4.9 define cómo se integra con el nuevo modelo. |

---

## 10 · Referencias rápidas

| Qué | Dónde | Por qué |
|---|---|---|
| Contrato transversal | `arquitectura/decisiones/_contratos/agente-blueprint.contract.json` | Fuente de verdad del modelo |
| Roadmap original (2026-05-18) | `arquitectura/migracion/notas/agentes-roadmap.md` | Inventario por subsistema + drift por agente + 5 fases |
| 30 agentes legacy | `modules/conversacion/ai-agent-framework/agents/*.json` | Lo que hay que migrar |
| Prompts legacy | `modules/conversacion/ai-agent-framework/prompts/*.md` (o `.json` legacy) | Source del system prompt curado |
| Frente 2.8 del retomar cajones | `arquitectura/decisiones/propuestas/cajones-frentes-abiertos-retomar.md` § 2.8 | El frente que estamos cerrando |
| Categorías de tools (read/write/destructive) | `arquitectura/agentes-tools.json` | Regla global vigente, decisión 4.9 |
| Blueprint padre del recetario (modelo de cómo se hace un padre) | `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json` | Plantilla mental para escribir `agente-base.blueprint.json` |
| Patrón POC2 (no aplica directamente) | `arquitectura/decisiones/_contratos/module-rewrite.contract.json` | Solo referencia: los agentes NO siguen POC2 (son blueprint puro). |
| `agent-flow.contract.json` | `arquitectura/decisiones/_contratos/agent-flow.contract.json` | Eventos canónicos que el agente publica/escucha |
| `agents-config.contract.json` (legacy) | `arquitectura/decisiones/_contratos/agents-config.contract.json` | Modelo viejo, en convivencia |
| Tools.contract v1.2 (auto-wire) | `arquitectura/decisiones/_contratos/tools.contract.json` | Auto-wire ya canónico en main |

---

## 11 · Frase resumen para retomar

**30 agentes legacy en `modules/conversacion/ai-agent-framework/agents/`
migran al patrón `agente-blueprint`: cada agente es un módulo
independiente en `modules/<agente>/` con las 5 piezas (contrato propio +
blueprint hijo extendiendo `agente-base` + system prompt en `.md` + module.json
sin `main` + cero JS). El contrato transversal está cerrado v1.0.0 con 13
principios, 11 decisiones arquitectónicas, 10 prohibiciones y 20
cross-checks. FALTA Fase 0: blueprint padre + 2 schemas + validator +
baseline (~7-9h). DESPUÉS 9 decisiones abiertas que cerrar contigo
(trigger-based vs on-demand, división de device-ops, qué hacer con
intent-router, etc.). DESPUÉS piloto `escandallo-analyzer` end-to-end
(3-5h). DESPUÉS resto del recetario (5-8h). DESPUÉS subsistemas
secundarios (10-15h). DESPUÉS casos especiales (5-8h). DESPUÉS evaluar
ai-agent-framework (2-4h). Total 30-50h en 5-7 sesiones.**
