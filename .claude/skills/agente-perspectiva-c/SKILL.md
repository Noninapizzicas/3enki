---
name: agente-perspectiva-c
description: Convierte un agente de dominio (o crea uno nuevo) al patrón AGENTE-PERSPECTIVA-C — el reflejo JS HIDRATA los datos y PERSISTE el resultado; el agente solo TRANSFORMA (función pura, sin herramientas). Resuelve de raíz el fallo de tool-use roto bajo providers que emiten tool-calls como texto (deepseek): si el agente no toca herramientas, el tool-use roto no importa. Determinismo (cargar/guardar) en JS, chispa fuzzy (generar/decidir) en el agente. Caso testigo: marketing-copywriter.
when-to-use: Un agente de dominio sale vacío/teatro porque sus tool-calls no ejecutan (auditoría muestra el agente escribiendo `<invoke name="X">` como texto y cero eventos de esa tool en el bus); o quieres crear un agente nuevo que GENERA/DECIDE sobre datos del proyecto y debe ATERRIZAR su salida. NO usar para ops deterministas puras (eso es reflejo sin agente, patrón Módulo Híbrido), ni para agentes que de verdad necesitan navegar/llamar servicios externos en bucle (ahí el tool-use es el punto).
---

# agente-perspectiva-c

> El problema de las tools no es de tools. Es de **colocación**.
> Saca el determinismo (cargar/guardar) al reflejo JS; deja al agente solo lo fuzzy
> (transformar). Sin tools en el agente, el tool-use roto del provider no importa.

## Contrato (JSON)

```json
{
  "esquema": "agente-perspectiva-c-v1",
  "principio": "colocacion, no tools: determinismo fuera (reflejo JS), fuzzy dentro (agente puro)",
  "garantiza": [
    "el agente NO toca herramientas (tools:[]) → no emite tool-calls → el tool-use roto no aplica",
    "el reflejo HIDRATA antes y PERSISTE despues → el entregable aterriza SIEMPRE",
    "entregable con contrato JSON tipado → si no cumple, error declarado (no length:0 silencioso)",
    "emite <dominio>.<algo>.generado → la propiocepcion lo capta, los consumidores beben"
  ],
  "aplica_si": "el agente GENERA/DECIDE sobre datos del proyecto y debe aterrizar su salida",
  "no_aplica_si": [
    "op determinista pura (lectura/CRUD sin LLM) → reflejo sin agente (Patron Modulo Hibrido)",
    "el agente necesita un bucle real de tools con servicios externos → ahi el tool-use ES el trabajo"
  ],
  "decisiones_cerradas": {
    "agente_provider": "irrelevante (auto vale) — no hay tool-use",
    "agente_tools": "[] SIEMPRE",
    "hidratacion": "RPC determinista del reflejo (_rpc / _leerJson) ANTES del turno del agente",
    "persistencia": "fs.write/_editarJson en el reflejo DESPUES, store propio del modulo",
    "context_al_agente": "{ project_id, ...datos } → el framework lo inyecta como 'CONTEXTO ENTREGADO'",
    "timeout_agente": "120000 ms en el _rpc('agent.execute.request')"
  }
}
```

## Motor del patrón (pseudocódigo + OOP)

```
CLASE ReflejoOrquestador EXTIENDE ModuloHibridoReflejo {
  // El cajón del blueprint delega aquí (publishAndWait). 4 etapas, visibles.

  on<Op>Request(e): _atender(e, '<op>', '<modulo>.<op>.response', d => _<op>(d))   // 1 línea

  ASYNC _<op>(input): RespuestaTipada {
    SI !input.<requeridos>: RETORNA _invalid(<campo>)              // guard duro

    // ── 1. HIDRATAR (determinista) ──
    datos ← AWAIT _rpc('<dominio>.<lectura>.request',
                       { project_id: input.project_id, ... })      // o _leerJson(store)

    // ── 2. AGENTE (fuzzy puro, SIN tools) ──
    ag ← AWAIT _rpc('agent.execute.request', {
           agent_name: '<agente>',
           task: '<instrucción de transformación>',
           context: { project_id: input.project_id, ...datos }      // se inyecta en el system prompt
         }, { timeout_ms: 120000 })
    SI ag.status >= 400: RETORNA ag
    entregable ← _parseEntregable(ag)                               // tolerante a fences ```json
    SI NO entregable.cumpleContrato(): RETORNA _err(502, 'UPSTREAM_INVALID_RESPONSE')

    // ── 3. PERSISTIR (determinista) ──
    store ← AWAIT _leerJson(input.project_id, <PATH>) || _vacio()
    store.aplicar(entregable)                                        // merge por id
    AWAIT _rpc('fs.write.request',
               { project_id, path: <PATH>, content: JSON(store), atomic: true })

    // ── 4. EMITIR ──
    eventBus.publish('<dominio>.<algo>.generado', { project_id, count, ... })
    RETORNA { status: 200, data: entregable }
  }

  _parseEntregable(ag): Objeto|null {
    content ← ag.result?.content ?? ag.content ?? ag.data?.content
    SI content es objeto: RETORNA content
    s ← quitarFences(content); s ← recorteLlaves(s)                 // { ... } más externo
    RETORNA tryJSON(s)                                              // null si no parsea
  }
}

ABSTRACT CLASE AgenteDominio {          // la mitad fuzzy — vive en <agente>-system.md
  identidad   : String                  // 1-2 líneas (no biografía)
  mision      : String                  // el ENTREGABLE que termina (no "ayudar con")
  recibe      : "context.<datos>"       // hidratado por el reflejo; tools = []
  reglasDuras : Array<Regla>            // "SOLO los datos dados" · "NUNCA inventes" · "respeta la voz"
  entregable  : ContratoJSON            // tipado y EXACTO; sin esto → divaga/vacío
  // ejecutar = función pura: context.{datos} → entregable. No charla, no opina, no llama tools.
}
```

## Modelo OOP de la skill (qué hace al invocarse)

```
CLASE SkillAgentePerspectivaC {
  pieza : Map<rol, Archivo> {
    promptAgente : 'prompts/<agente>-system.md'          // sin tools + entregable
    metaAgente   : 'agents/<agente>.json'                // tools:[]
    reflejo      : '<modulo>/index.js'                    // on<Op>Request + _<op> + _parseEntregable
    manifest     : '<modulo>/module.json'                // subscribes: <modulo>.<op>.request
    blueprint    : '<modulo>/<modulo>.blueprint.json'    // cajón <op> + eventos_publicados
  }

  METODO convertir(agente):                 // — RECETA A: agente tool-driven existente —
    PASO 0  auditar(agente)                  // audit-module/force-agent: confirma vacío + tool-calls-como-texto
    PASO 1  { lee, guarda, transforma } ← repartir(agente)   // lee/guarda → reflejo ; transforma → agente
    PASO 2  reescribirPrompt(promptAgente, perspectivaC)     // recibe context, sin tools, entregable JSON
              CONSERVA riquezaDeDominio(tono, reglas)
              TIRA grasa(procesoDeTools, metricasVanity, verbosidad)
    PASO 3  metaAgente.tools ← [] ; metaAgente.version++
    PASO 4  reflejo.add(on<Op>Request, _<op>(4 etapas), _parseEntregable)
    PASO 5  manifest.subscribes.add('<modulo>.<op>.request' → on<Op>Request) ; manifest.version++
    PASO 6  blueprint.operaciones.add(cajon <op> → publishAndWait reflejo)
              blueprint.eventos_publicados.add('<dominio>.<algo>.generado') ; blueprint.version++
    PASO 7  GATE: node scripts/validate-hibridos.js  →  DEBE pasar
    PASO 8  verificarEnVivo(audit-module/force-agent): entregable aterriza · evento emitido · fichero persiste

  METODO crear(spec):                        // — RECETA B: agente nuevo —
    PASO 1  entregable ← definirContrato(spec)               // el JSON de salida PRIMERO
    PASO 2  datos ← lo que necesita → los HIDRATA el reflejo (lecturas existentes o store)
    PASO 3  promptAgente ← esqueleto(spec, entregable) ; metaAgente ← { tools:[], scope }
    PASO 4  reflejo + manifest + blueprint  (piezas 3-5)
    PASO 5  GATE + verificarEnVivo

  INVARIANTE anti_colision:                  // lo verifica validate-hibridos.js
    '<modulo>.<op>.request' ∈ manifest.subscribes  XOR  ∈ blueprint.eventos_que_escucho
    (un cajón que delega NO añade el evento a eventos_que_escucho → sin colisión)
}
```

## Esqueleto del prompt del agente (los huesos buenos, sin la grasa)

```
# <Agente> — <una línea de qué hace>
## Identidad        (1-2 líneas — quién es, no biografía)
## Misión           (el ENTREGABLE que termina el problema)
## Lo que recibes   (context.<datos> — ÚSALOS. "NO tienes herramientas, no cargas ni guardas")
## Reglas duras     (SIEMPRE/NUNCA — incluir SIEMPRE: "NUNCA inventes lo que no está en los datos")
## Entregable       (JSON EXACTO, "solo JSON, sin texto alrededor")
```

PROHIBIDO copiar de librerías genéricas (agency-agents): métricas inventadas ("300% más leads"),
verbosidad/emojis/vibe, proliferación por canal. Un prompt rico NO sustituye tool-use que ejecuta —
y aquí no hay tool-use: el entregable es la prueba, no la prosa.

## Caso testigo

```
marketing-copywriter (carta-marketing · module 2.2.0 · blueprint 1.6.0) {
  REFLEJO _generarCopy : hidrata get_perfil → invoca copywriter(tools:[]) {perfil,productos}
                         → persiste /pizzepos/carta-marketing/copy.json → emite marketing.copy.generado
  AGENTE               : tools:[] · entregable { descripciones:[{producto_id,nombre,texto,emoji,tags}] }
  antes                : salida vacía (carta.get/save como texto, no ejecutaban)
  después              : el copy aterriza; el agente no toca herramientas
}
SIGUIENTES (mismo patrón) {
  marketing-strategist   : entregable { estrella[], orden }
  marketing-brand-keeper : entregable { ajustes[] }
}
```

## Lo que NO es

- **NO** es para ops deterministas puras (lecturas/CRUD sin LLM) → reflejo sin agente (Patrón Módulo Híbrido).
- **NO** es para agentes con bucle real de herramientas a servicios externos (ahí el tool-use ES el trabajo).
- **NO** arregla el tool-use del framework — lo **esquiva** sacando el determinismo al reflejo. Si necesitas tool-use nativo real, esa es otra decisión (fijar provider / parsear el formato del provider).
