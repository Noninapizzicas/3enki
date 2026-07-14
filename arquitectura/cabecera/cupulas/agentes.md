---
id: cupulas/agentes
dominio: cupulas
resumen: La flota como biblioteca buscable: buscar_agente/activar_agente sobre 364 definiciones (29 nativos + VoltAgent + agency-agents + acumulador-sectorial), overlay semilla+crecido.
fuentes:
  - modules/conversacion/ai-agent-framework/**
  - agency-agents/**
verificado: 2026-07-14
---

# CÚPULA DE AGENTES — la flota es una BIBLIOTECA buscable (ai-agent-framework {{version:modules/conversacion/ai-agent-framework}} · vivo 2026-07-06)

> Tercera sustancia del patrón cúpula (lentes=conocimiento · cantera=skills · **agentes=trabajadores
> en contexto aislado**). El framework NO cambia de motor —sigue cargando de `agents/*.json` y corriendo
> el invoke loop— sube al MOLDE: la flota deja de ser un set fijo y pasa a ser una BIBLIOTECA (search +
> activación por demanda). Gemela EXACTA de la cantera: `buscar_agente` = `buscar_skill`. El muro que
> aparcó a los 29 (tool-use roto bajo deepseek) YA cayó (deepseek corre por wire Anthropic) → los agentes
> funcionan; la cúpula da el catálogo y la puerta de encendido sobre ellos. Las 29 siguen aparcadas como
> RUNTIME (enabled:false) pero YA son BUSCABLES.

## Contrato (JSON)

```json
{
  "esquema": "cupula-de-agentes-v1",
  "dos_mapas": {
    "library": "TODA definición conocida (activa o no) → BUSCABLE. { name, description, activo, dominio, scope, tools_count, tags, obsoleto }",
    "agents":  "solo las enabled → INVOCABLES ya vía invoke_agent (intacto). Hoy vacío: las 29 aparcadas"
  },
  "puertas": {
    "buscar_agente": "{query, dominio?, limite?} → catálogo rankeado por tokens (name+description+tags+dominio), filtra obsoletos+dominio. Gemela de buscar_skill. Devuelve activo:true|false por agente.",
    "invoke_agent":  "INTACTO — invoca un agente ACTIVO (enabled ∨ overlay). La cúpula no lo toca.",
    "activar_agente": "{nombre} confirmation:true → enciende un aparcado (overlay data/ai-agent-framework/activaciones.json, patrón semilla+crecido), lo mete en this.agents y RE-REGISTRA invoke_agent EN CALIENTE → invocable sin reiniciar. Gemela de activar_skill. Reversible con desactivar_agente (solo apaga lo del overlay; la semilla activa no, 409)."
  },
  "obsoletos": "regex sobre description/_disabled_reason (obsolet|deprecat|apagad|eliminad|fantasma) → NO salen en la búsqueda (recipe-curator, recipe-structurer)",
  "universal": "buscar_agente en GLOBAL_TOOLS (ai-gateway) — como invoke_agent, llega a toda página",
  "no_toca": "el invoke loop, agent-flow canónico (agent.execute.*), agent-observer — solo AÑADE library + buscar_agente"
}
```

## Pseudocódigo (reflejo · sobre AiAgentFrameworkModule)

```
CLASE AiAgentFrameworkModule (ampliación 2.1.0) {
  ATRIBUTOS_NUEVOS { library: Map<name, DefLite> }   // junto a agents: Map<name, AgenteActivo>

  _loadAgents():                                       // un solo barrido, DOS destinos
    PARA def EN agents/*.json:
      SI !def.name: CONTINUAR
      library.set(def.name, {name, description, activo: def.enabled !== false,
        dominio: def.metadata?.domain || scope[0], scope, tools_count, tags,
        obsoleto: /obsolet|deprecat|apagad|eliminad|fantasma/.test(description + _disabled_reason)})
      SI def.enabled === false: CONTINUAR              // la biblioteca la tiene; agents NO
      agents.set(def.name, {…prompt, tools, provider…})   // solo activas → invocables

  _buscarAgente({query, dominio?, limite?}): PROYECCIÓN PURA   // gemela de _buscarSkill
    toks ← tokens(query)
    items ← library.values().filtrar(!obsoleto)
    SI dominio: items ← items.filtrar(a.dominio == dominio)
    ranked ← items.map(a → {a, s: Σ toks.incluido_en(name+description+tags+dominio)})
             .filtrar(s>0).ordenarDesc(s).tomar(limite ?? 10)
    RETORNA {total, activos_en_biblioteca, biblioteca: library.size,
             agentes: ranked.map(→ {nombre, descripcion, dominio, activo, tools})}

  onBuscarAgente(event):                               // path canónico de tool por bus
    result ← _buscarAgente(event.data)
    publish('buscar_agente.response', {request_id, result})   // o {error} en catch

  // ── TRAMO 2: encender/apagar de la biblioteca (overlay semilla+crecido) ──
  _loadAgents():                                       // activo = enabled ∨ activados.has(name)
    ... SI !activo: CONTINUAR   // clear() al arrancar → reload idempotente (desactivar SACA de agents)

  _activar({nombre}):                                  // confirmation:true (la tool)
    SI !library.has(nombre): RETORNA 404 {faltan:[nombre]}
    SI agents.has(nombre): RETORNA {ya_estaba:true}
    activados.add(nombre) ; _saveActivaciones()        // data/ai-agent-framework/activaciones.json (tmp+rename)
    _loadAgents() ; _registerInvokeAgentTool()         // EN CALIENTE: entra en agents + en el enum de invoke_agent
    RETORNA {activado:true, dominio, activos}
  _desactivar({nombre}):                               // reversibilidad; semilla activa → 409
    SI !activados.has(nombre): RETORNA (409 si es semilla activa · 404 si no)
    activados.delete(nombre) ; _saveActivaciones() ; _loadAgents() ; _registerInvokeAgentTool()
}
```

## Estado

```
✓ TRAMO 1 (2.1.0) — biblioteca + buscar_agente. library llena con las 29 (buscables) · buscar_agente en
  GLOBAL_TOOLS (universal) · path canónico buscar_agente.response. VERIFICADO EN VIVO (proyecto 1a): el LLM
  disparó buscar_agente solo → {biblioteca:29, escandallo-analyzer activo:false} en la página chat.
✓ TRAMO 2 (2.2.0) — activar_agente/desactivar_agente. Overlay CRECIDO (data/…/activaciones.json, semilla+crecido):
  enciende un aparcado sin editar su json. activar añade al overlay, persiste, re-carga y re-registra invoke_agent
  EN CALIENTE (invocable sin reiniciar). confirmation:true (conceder trabajador = decisión consciente). desactivar
  revierte (solo overlay; semilla activa → 409). Ambas en GLOBAL_TOOLS. VERIFICADO EN VIVO (1a): activar escandallo-analyzer
  → activos_en_biblioteca 0→1 → invoke_agent lo recoge en caliente → desactivar → 0 (sin residuo).
✓ FLOTA POBLADA (2026-07-06) — los 154 subagentes de VoltAgent (awesome-claude-code-subagents) importados como
  APARCADOS (enabled:false) → biblioteca de 183 (29 nativos + 154). Buscables por buscar_agente, activables por
  activar_agente; cero coste runtime hasta encenderlos (el prompt solo se lee al activar — _loadAgents salta la
  carga del prompt para los no-activos). metadata {domain=categoría, fuente:'voltagent', upstream_model/tools}.
  10 dominios: core-development(11)·language-specialists(30)·infrastructure(16)·quality-security(17)·data-ai(13)·
  developer-experience(15)·specialized-domains(14)·business-product(16)·meta-orchestration(11)·research-analysis(11).
✓ TOOLS MAPEADAS (2026-07-06) — el tool-use FUNCIONA (LLM por API de Claude), así que los agentes tienen MANOS,
  no tools:[]. Cada uno mapea su set declarado (metadata.upstream_tools) → tools de bus de Enki, POR AGENTE:
  Read→fs.read · Write→fs.write · Edit→fs.edit · Glob→fs.list · Grep→fs.search. Lo que NO tiene equivalente de
  agente se DEJA CAER (honesto, no se inventa): Bash/shell viven tras la reja del ejecutor (no es tool de agente,
  OFF por defecto) · WebFetch/WebSearch/Task sin equivalente. Resultado: 135 con write (developers), 19 read-only
  (analistas/auditores que solo declaraban Read/Grep/Glob). agent.tools = nombres filtrados contra getToolsForAI →
  un agente encendido recibe SUS tools reales. (La razón de no copiar tal cual NO era 'tool-use roto' — era que
  Read/Bash son nombres de Claude Code, no del bus.)
✓ DESPLEGADO + VERIFICADO EN VIVO (2026-07-06 · proyecto 1a): buscar_agente → biblioteca:183 · backend-developer
  activo:false con tools:5 (fs.read/write/edit/list/search, Bash caído) → activar → {activado:true, activos:1} en
  caliente → desactivar → activos:0. El mapeo y los 154 corren en producción; ciclo idéntico al de los nativos,
  sin residuo.
✓ agency-agents DEL REPO (2026-07-06) — la 2ª colección ya presente (raíz agency-agents/, formato persona:
  name·description·color·emoji·vibe, sin tools) importada como APARCADOS → biblioteca de 363 (183 + 180). Import
  RECURSIVO (los agentes reales están anidados: game-development/unity·godot·unreal-engine·roblox-studio·blender);
  dominio = categoría de PRIMER nivel (unity-multiplayer-engineer → game-development). Se saltan 21 docs (sin
  frontmatter name: playbooks/runbooks/examples) + 3 colisiones con VoltAgent (product-manager, sales-engineer,
  compliance-auditor). SIN tools declaradas (son personas) → default de LECTURA (fs.read/list/search), política
  consistente con los VoltAgent no-declarados. metadata {fuente:'agency-agents', display_name, emoji, vibe}.
  13 dominios: engineering(28)·marketing(30)·specialized(39)·game-development(20)·testing(8)·design(8)·sales(7)·
  paid-media(7)·project-management(6)·support(6)·spatial-computing(6)·academic(5)·finance(5)·product(4)·integrations(1).
SHELL PARA AGENTES (siguiente deliberado, NO hecho)  darles Bash = exponer ejecutor.ejecutar como tool de agente.
  Es un paso aparte por diseño: la reja del ejecutor NACE OFF (interruptor 'ejecutor', grupo sistema, default OFF →
  puerta_cerrada 503). Aunque se expusiera, ningún agente correría un comando hasta que el humano encienda el
  interruptor (decisión consciente, con testigo ejecutor.invocado→propiocepción, revocable en caliente). Por eso el
  poder de ejecutar no se cuela por default: se concede.
TESTS  agentes__cupula-biblioteca (16: biblioteca ≥360 · 154 VoltAgent + ~180 agency-agents aparcados+buscables+activables ·
       VoltAgent tools mapeadas · agency-agents anidados (unity→game-development) con default de lectura · agents=0 ·
       escandallo→escandallo-analyzer OFF · filtro dominio · obsoletos fuera · buscar_agente registrada+response ·
       activar/desactivar confirmation · _activar entra en agents+invoke_agent · persiste y sobrevive recarga ·
       404 desconocido · desactivar revierte · onActivarAgente response).
TRIAJE 29 nativos  4 perspectiva-c (invoice-structurer/validator, marketing-copywriter/onboarding) · 23 tool-caller ·
       2 obsoletos (recipe-curator, recipe-structurer). Los 154 externos = catálogo aparcado, se afinan al encenderse.
```

> **Trade-off vivo.** buscar_agente sobre 29 agentes casi todos apagados suena a catálogo de un almacén
> cerrado. Pero es el paso honesto: primero HACER LA FLOTA VISIBLE (search, tramo 1), luego encenderla por
> demanda (activar, tramo 2) — no un big-bang de 29 a la vez. Mismo orden gradual que el Portal (read→write)
> y la cantera (importar→promover): exponer antes que conceder. El encendido es reversible y por overlay:
> la semilla (`enabled` del json) queda intocable; el humano enciende encima, y apaga cuando quiera.
