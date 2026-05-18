# Roadmap — Agentes adoptan el patrón blueprint-driven

> Documento horizontal de preparación. NO migra agentes. Inventaria los 30 agentes
> existentes en `modules/conversacion/ai-agent-framework/agents/`, clasifica drift por
> agente, y propone orden de migración cuando arranque el horizontal.
>
> Lectura de fondo obligatoria: `arquitectura/decisiones/_contratos/agente-blueprint.contract.json`
> (transversal nuevo) y `modules/_agentes-blueprint/agente-base.blueprint.json` (padre del que
> heredarán los agentes-blueprint).

Fecha: 2026-05-18.

---

## Decisión arquitectónica de fondo

Los 30 agentes pasan de **"datos de configuración cargados por ai-agent-framework"** a
**"módulos blueprint independientes del sistema"** con las 5 piezas (contrato + blueprint +
pseudocódigo + clase OOP filosófica + JSON).

- **Mismo formato que los módulos blueprint del subsistema-recetario.** Diferencia ontológica
  preservada: módulo = operación del dominio (determinista, persistencia propia,
  cardinalidad 1); agente = razonamiento sobre el dominio (indeterminista, sin persistencia,
  cardinalidad N).
- **Cada agente tendrá su propio contrato** en `arquitectura/decisiones/_contratos/<agente>.contract.json`
  derivado del transversal `agente-blueprint.contract.json`.
- **Cada agente tendrá su propio módulo** en `modules/<agente>/` con `module.json` declarativo
  + `<agente>.blueprint.json` que extiende `_agentes-blueprint/agente-base.blueprint.json`.
- **ai-agent-framework queda a evaluar** una vez completado el horizontal. Si todos los
  agentes son módulos blueprint independientes cargados por el loader normal, ai-agent-framework
  pierde su razón de ser como cargador. Puede sobrevivir aligerado (registry para
  `invoke_agent`/`agent.execute.request` dispatch) o desaparecer absorbido por el bus.

---

## Inventario completo (30 agentes)

### Por subsistema / scope

#### Subsistema-recetario (8 agentes)

- **`recetas` (6)**: recipe-analyzer, recipe-chef-advisor, recipe-completer, recipe-curator (disabled), recipe-researcher, recipe-structurer (disabled)
- **`escandallo,recetas` (1)**: escandallo-analyzer
- **`viabilidad,recetas` (1)**: viabilidad-receta-analyzer

> El subsistema-recetario tiene ya contrato propio (`subsistema-recetario.contract.json`),
> blueprint padre (`subsistema-recetario.modulo-base.blueprint.json`) y validator. Los agentes
> de este subsistema se migran PRIMERO porque la infraestructura del subsistema ya existe.

#### Subsistema carta-digital (8 agentes)

- **`carta-digital` (4)**: cartadigital-composer, cartadigital-ofertas, cartadigital-pwa-builder, cartadigital-reviewer
- **`tarifas,carta-digital` (2)**: tarifas-creator, tarifas-sync
- **`menu-generator,carta-marketing` (2)**: marketing-brand-keeper, marketing-copywriter

#### Subsistema menu-generator (4 agentes)

- **`menu-generator` (4)**: marketing-strategist, menu-enricher, menu-structurer, menu-validator

#### Subsistema carta-scheduler (2 agentes)

- **`carta-scheduler` (2)**: scheduler-dispatcher, scheduler-planner

#### Subsistema facturas (2 agentes)

- **`facturas` (2)**: invoice-structurer, invoice-validator

#### Subsistema impresion (2 agentes)

- **`impresion` (2)**: impresion-architect, impresion-builder

#### Subsistema device / esp32 (1 agente)

- **`device-registry,esp32-dev` (1)**: device-ops *(26 tools — outlier crítico, ver drift)*

#### Transversales sin scope claro (4 agentes)

- **`*` (4)**: architect (disabled), image-processor (disabled), intent-router, marketing-onboarding

> `intent-router` es caso especial: es "la única puerta de entrada del chat" según su
> descripción oficial. Su migración a blueprint reconfigura el chat entero, no es un agente
> más. Recomendado migrarlo último.

### Estado runtime

- **27 enabled** / **3 disabled (declarados)**: architect, image-processor, recipe-curator
- **Anomalía**: recipe-structurer aparece como disabled en el inventario pero está bajo recetas — verificar

---

## Drift conocido por agente (auditoría 2026-05-18)

### Drift `prompt_file` apunta a `.json` legacy (debe ser `.md`)

Violación de `agents-config.contract.json::drift_agent_prompt_file_inexistente` cuando
el `.md` real es `<name>-system.md` pero `prompt_file` apunta a `<name>.json`:

- `escandallo-analyzer` → `prompts/escandallo-analyzer.json`
- `image-processor` → `prompts/image-processor.json`
- `intent-router` → `prompts/intent-router.json`
- `marketing-onboarding` → `prompts/marketing-onboarding.json`
- `recipe-analyzer` → `prompts/recipe-analyzer.json`
- `recipe-chef-advisor` → `prompts/recipe-chef-advisor.json`
- `recipe-completer` → `prompts/recipe-completer.json`
- `recipe-curator` → `prompts/recipe-curator.json`
- `recipe-structurer` → `prompts/recipe-structurer.json`
- `viabilidad-receta-analyzer` → `prompts/viabilidad-receta-analyzer.json`

> Estos 10 agentes tienen ambos archivos en disco (legacy `.json` + canónico
> `-system.md`). El framework probablemente carga el `.md` por convención de nombre
> ignorando `prompt_file`, pero el campo declara incorrectamente. Limpieza: eliminar el
> `.json` legacy y actualizar `prompt_file`.

### Drift `architect` declara `prompt_file: prompts/architect.json` (no `.md`)

Caso especial: `architect` tiene además `prompts/architect-knowledge.md` separado del
system prompt. Su migración necesita decidir cómo se relaciona "knowledge" con
"system" (¿son dos partes del system prompt? ¿una es contexto inyectado?).

### Drift `device-ops` sin `prompt_file`

El agente no declara `prompt_file` en el JSON. ¿Está en `prompts/device-ops-system.md` y
se carga por convención, o no tiene system prompt? Verificar antes de migrar.

### Drift `device-ops` con 26 tools

Viola `agents-config.contract.json::drift_agent_demasiadas_tools` (umbral 20). Candidato
a dividir en agentes especialistas más acotados durante la migración:
device-registrar / esp32-flasher-operator / firmware-deployer.

### Drift `invoice-structurer` e `invoice-validator` con 0 tools

Ambos declaran `tools: []`. Si el LLM puede razonar la operación con solo el system
prompt (parsear factura → JSON estructurado) sin invocar ninguna tool, está OK. Pero
parece sospechoso. Verificar en system prompt si menciona tools que el agente "debería
tener".

### Drift agentes disabled sin `_disabled_reason` documentada

- `architect` — disabled, sin razón documentada.
- `image-processor` — disabled, sin razón documentada (sospecha: tools fantasma `sharp_*`).
- `recipe-curator` — disabled CON razón documentada en `_disabled_reason` (obsoleto post-v2 recetas).
- `recipe-structurer` — disabled, sin razón documentada (sospecha: redundante con `recetas.crear`).

Cierre canónico: cada disabled lleva `metadata.disabled_reason` con causa.

### Drift `tools` fantasma probables (verificar contra catálogo)

A revisar cruzando `tools[]` de cada agente con `module.json.tools[].name` de todos los
módulos del repo:

- `device-ops` (26 tools) — alta probabilidad de fantasmas
- `image-processor` (5 tools) — sospecha de `sharp_*` fantasmas
- `recipe-analyzer` — el system prompt menciona `recetas.calcular_costes` que NO existe
  en `modules/recetas/module.json` (sólo `recetas.analizar` y `recetas.ingredientes`)

---

## Plan de migración propuesto (orden)

### Fase 0 — Piezas estructurales transversales (este commit)

- [x] `arquitectura/decisiones/_contratos/agente-blueprint.contract.json` — contrato transversal nuevo
- [x] `modules/_agentes-blueprint/agente-base.blueprint.json` — blueprint padre
- [x] `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json` — categoría `agentes_especialistas`
- [x] `arquitectura/migracion/notas/agentes-roadmap.md` — este documento
- [x] `CLAUDE.md` — índice actualizado

### Fase 1 — Piloto único (un solo agente, end-to-end)

**Candidato: `escandallo-analyzer`**

- Pertenece al subsistema-recetario (infra existente).
- Operación acotada: análisis de coste-receta (input bien definido, output estructurado).
- Pipeline NO roto (a diferencia de recipe-analyzer cuyo curator está deshabilitado).
- Si funciona como módulo blueprint completo, valida el modelo end-to-end.

Entregables:
1. `arquitectura/decisiones/_contratos/escandallo-analyzer.contract.json` — contrato propio
2. `modules/escandallo-analyzer/module.json` — declarativo
3. `modules/escandallo-analyzer/escandallo-analyzer.blueprint.json` — hijo de `agente-base`
4. `modules/escandallo-analyzer/escandallo-analyzer-system.md` — system prompt curado
5. Validator AJV cruza contrato + blueprint + system prompt
6. Test fixture en `tests/fixtures/agentes-blueprint/escandallo-analyzer/`
7. `agent.execute.request` invocable apuntando al blueprint

### Fase 2 — Subsistema-recetario completo

Migrar los 7 agentes restantes del subsistema (re-evaluar primero cuáles sobreviven
post-blueprint padre):

- recipe-analyzer (¿se mantiene o lo absorbe el blueprint padre de recetas?)
- recipe-chef-advisor
- recipe-completer (¿redundante con `recetas.crear` que ya marca incompleta?)
- recipe-curator → ELIMINAR (obsoleto declarado)
- recipe-researcher
- recipe-structurer → ELIMINAR si redundante con `recetas.crear`
- viabilidad-receta-analyzer (¿se fusiona con módulo `viabilidad` directamente?)

Decisión de fondo: el subsistema-recetario tiene módulos blueprint (recetas, escandallo,
viabilidad). Algunos agentes son **operaciones del módulo blueprint** (no agentes
separados). Otros son razonamiento auxiliar (chef-advisor, researcher). Hay que decidir
por agente cuál es cuál.

### Fase 3 — Subsistemas secundarios

Orden tentativo (revisable):

1. **carta-digital + tarifas** (8 agentes) — subsistema concreto, drift limitado.
2. **menu-generator** (4 agentes) — afín a recetas.
3. **carta-scheduler** (2 agentes) — acotado.
4. **facturas** (2 agentes) — acotado, drift 0-tools a investigar.
5. **impresion** (2 agentes) — acotado.

### Fase 4 — Casos especiales

- **device-ops**: dividir en agentes especialistas (26 tools no cabe en un solo agente).
- **image-processor**: cerrar tools fantasma `sharp_*` antes de migrar.
- **marketing-onboarding**: ¿sigue siendo agente o se fusiona con onboarding del proyecto?
- **intent-router**: ÚLTIMO. Es la puerta de entrada del chat. Migrarlo reconfigura el
  flujo entero.
- **architect**: disabled — decidir si se reactiva o se borra.

### Fase 5 — Evaluación de ai-agent-framework

Una vez los 30 agentes son módulos blueprint cargados por el loader normal del sistema:

- ¿Sigue habiendo lógica que `ai-agent-framework` aporta?
- ¿La tool `invoke_agent` sobrevive o todos invocan via `agent.execute.request`?
- ¿`agent-observer` ya cubre la traducción a `chat.assistant.saved` desde `agent.execute.response`?

Outcome posible: ai-agent-framework reducido a un dispatcher delgado que solo expone la
tool `invoke_agent` (compat con LLMs que esperan tool-flow vs evento). O eliminado
completamente si el bus puede hacerlo igual.

---

## Cross-checks que el validator nuevo `agente-blueprint.validate.js` realizará

Pendiente de implementación. Mínimos exigibles (ver `agente-blueprint.contract.json`):

1. Cada `modules/<agente>/<agente>.blueprint.json` extiende `_agentes-blueprint/agente-base`.
2. Cada agente declara `tools_disponibles[]` con names existentes (no fantasma).
3. Cada agente declara `system_prompt_file` apuntando a `<agente>-system.md` existente.
4. El `.md` cumple reglas heredadas de `agents-config`: h1, sin frontmatter, longitud ≥200.
5. El `contrato` propio del agente está en `arquitectura/decisiones/_contratos/<agente>.contract.json`.
6. `module.json` no contiene `index.js` ni `main` declarado (es 100% blueprint, sin JS).
7. `operacion_canonica` declarada: `analizar`, `componer`, `validar`, etc. (verbo del rol).

---

## Cosas que NO se hacen en este horizontal

- NO se tocan los 30 agentes en `modules/conversacion/ai-agent-framework/agents/`. Quedan
  ahí intactos hasta que cada uno se migre individualmente.
- NO se cambia el código de `ai-agent-framework/index.js`. Su evaluación es Fase 5.
- NO se cambia el contrato `agents-config.contract.json`. Se mantiene válido para el
  legacy mientras los agentes vivan ahí. Cuando se vacíe el directorio, se archiva.
- NO se reabre `agent-flow.contract.json`. Los eventos canónicos (`agent.execute.request/response/failed/progress`)
  siguen vigentes y aplican a los nuevos agentes-blueprint igual que a los legacy.
