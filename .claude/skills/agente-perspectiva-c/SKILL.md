---
name: agente-perspectiva-c
description: Convierte un agente de dominio (o crea uno nuevo) al patrón AGENTE-PERSPECTIVA-C — el reflejo JS HIDRATA los datos y PERSISTE el resultado; el agente solo TRANSFORMA (función pura, sin herramientas). Resuelve de raíz el fallo de tool-use roto bajo providers que emiten tool-calls como texto (deepseek): si el agente no toca herramientas, el tool-use roto no importa. Determinismo (cargar/guardar) en JS, chispa fuzzy (generar/decidir) en el agente. Caso testigo: marketing-copywriter.
when-to-use: Un agente de dominio sale vacío/teatro porque sus tool-calls no ejecutan (auditoría muestra el agente escribiendo `<invoke name="X">` como texto y cero eventos de esa tool en el bus); o quieres crear un agente nuevo que GENERA/DECIDE sobre datos del proyecto y debe ATERRIZAR su salida. NO usar para ops deterministas puras (eso es reflejo sin agente, patrón Módulo Híbrido), ni para agentes que de verdad necesitan navegar/llamar servicios externos en bucle (ahí el tool-use es el punto).
---

# agente-perspectiva-c

> El problema de las tools no es de tools. Es de **colocación**.

## El principio

Un agente que mezcla en el mismo turno LLM **persona + cargar datos + transformar + guardar** depende de que el tool-use del provider funcione. Bajo deepseek (y otros), las tool-calls salen como texto (`<invoke name="carta.get">`) y nadie las ejecuta → el agente se queda sin datos → salida vacía. Teatro.

La perspectiva C **disuelve** el problema: se sacan las dos puntas deterministas (cargar, guardar) a un **reflejo JS**, y al agente solo le queda lo que el LLM sí sabe hacer — transformar `{datos} → {entregable}` y devolverlo. El agente **no toca ninguna herramienta** (`tools: []`), así que el tool-use roto deja de importar.

Es el **Patrón Módulo Híbrido aplicado al agente**: determinismo fuera (JS), fuzzy dentro (LLM puro). Y aterriza el entregable SIEMPRE — eso es solucionar, no ayudar.

## El patrón (pseudocódigo + OOP)

```
CLASE ReflejoOrquestador EXTIENDE ModuloHibridoReflejo {
  // 4 etapas visibles. El cajón del blueprint delega aquí (publishAndWait).
  async _<op>(input): { status, data } {
    GUARD input                                            // precondiciones duras
    // 1. HIDRATAR — lecturas deterministas (RPC al bus / _leerJson)
    datos ← await _rpc('<dominio>.<lectura>.request', {...})
    // 2. AGENTE — función pura, datos inyectados en context, SIN tools
    ag ← await _rpc('agent.execute.request', {
      agent_name: '<agente>', task: '<qué transforme>',
      context: { project_id, ...datos }
    }, { timeout_ms: 120000 })
    SI ag.status >= 400: RETORNA ag
    entregable ← _parseEntregable(ag)                      // tolerante a fences ```json
    SI !entregable.cumple(contrato): RETORNA UPSTREAM_INVALID_RESPONSE   // no length:0 silencioso
    // 3. PERSISTIR — escritura determinista (fs.write/_editarJson)
    await _rpc('fs.write.request', { project_id, path, content: JSON(entregable) })
    // 4. EMITIR — la propiocepción lo capta; los consumidores beben
    eventBus.publish('<dominio>.<algo>.generado', { project_id, ... })
    RETORNA { status: 200, data: entregable }
  }
}

ABSTRACT AgenteDominio {            // la mitad fuzzy — vive en un .md de prompt
  identidad   : 1-2 líneas
  mision      : el ENTREGABLE que termina (no "ayudar con")
  recibe      : context.{datos}     // hidratado por el reflejo; NO tiene tools
  reglasDuras : ["SOLO los datos dados", "NUNCA inventes", "respeta la voz", ...]
  entregable  : ContratoJSON tipado // SIN esto → divaga / vacío
}
```

## Las 5 piezas (anatomía de un caso)

1. **`prompts/<agente>-system.md`** — prompt del agente: identidad · misión · *lo que recibe en CONTEXTO ENTREGADO* · **reglas duras** · **entregable JSON exacto**. Sin proceso de tools, sin "carga con X / guarda con Y".
2. **`agents/<agente>.json`** — `"tools": []` (clave: sin tools el LLM no emite tool-calls). Sube `version`, ajusta `description`.
3. **reflejo `index.js`** (del módulo de dominio, extiende `ModuloHibridoReflejo`) — `on<Op>Request` de una línea (`_atender`) + `_<op>` con las 4 etapas + `_parseEntregable`.
4. **`module.json`** — `subscribes`: `<modulo>.<op>.request → on<Op>Request`. Sube `version` + changelog.
5. **`<modulo>.blueprint.json`** — cajón `<op>` que `publishAndWait('<modulo>.<op>.request', ...)` (la página lo dispara). Añade el evento a `eventos_publicados`. Sube `version`.

## Receta A — convertir un agente tool-driven existente

```
0. Audita primero (skill audit-module / force-agent): confirma que el agente sale
   vacío y que escribe sus tool-calls como TEXTO (cero eventos de esa tool en el bus).
1. Reparte: ¿qué lee el agente (carta.get, get_perfil...) y qué guarda (carta.save...)?
   Eso pasa al REFLEJO (hidratar/persistir). Lo que QUEDA (generar/decidir) es del agente.
2. Reescribe su prompt -> perspectiva C: recibe context.{datos}, sin tools, devuelve
   el entregable JSON. Conserva la riqueza de dominio (tono, reglas), tira la grasa
   (proceso de tools, métricas vanity, verbosidad).
3. agents/<agente>.json: tools: [] + sube version.
4. reflejo: añade on<Op>Request + _<op> (4 etapas) al index.js del módulo de dominio.
5. module.json: subscribe <modulo>.<op>.request -> on<Op>Request (+ sube version).
6. blueprint: cajón <op> que delega al reflejo (+ evento publicado + sube version).
7. node scripts/validate-hibridos.js -> PASS (anti-colisión + handlers existen).
8. Verifica en vivo (audit-module / force-agent): el entregable aterriza, hay evento
   <algo>.generado, y el fichero persiste. Si sigue vacío, mira _parseEntregable.
```

## Receta B — crear un agente nuevo con el patrón

```
1. Define el ENTREGABLE primero (el contrato JSON de salida). Sin entregable no hay agente.
2. Identifica qué datos necesita -> esos los HIDRATA el reflejo (lecturas que ya existan
   por RPC, o _leerJson de un store).
3. Escribe prompt <agente>-system.md (esqueleto de abajo) + agents/<agente>.json (tools:[],
   provider auto da igual: no hay tool-use; scope = el/los módulos donde aplica).
4. reflejo + module.json + blueprint cajón: las piezas 3-5 de arriba.
5. gate + verificación en vivo.
```

## Esqueleto de prompt (los huesos buenos, sin la grasa)

```
# <Agente> — <una línea de qué hace>
## Identidad        (1-2 líneas — quién es, no biografía)
## Misión           (el ENTREGABLE que termina el problema)
## Lo que recibes   (context.<datos> — ÚSALOS. "NO tienes herramientas, no cargas ni guardas")
## Reglas duras     (SIEMPRE/NUNCA — incluir SIEMPRE: "NUNCA inventes lo que no está en los datos")
## Entregable       (JSON EXACTO, "solo JSON, sin texto alrededor")
```
Prohibido copiar de librerías genéricas (agency-agents): métricas inventadas ("300% más leads"),
verbosidad/emojis/vibe, proliferación por canal. Un prompt rico NO sustituye tool-use que ejecuta —
y aquí no hay tool-use: el entregable es la prueba, no la prosa.

## Gate

```
node scripts/validate-hibridos.js
```
Verifica: anti-colisión (el evento no está a la vez en module.json.subscribes y en
blueprint.eventos_que_escucho) + los handlers de subscribes existen en la clase del reflejo.

## Caso testigo

`marketing-copywriter` (carta-marketing, v2.2.0 / blueprint 1.6.0):
- REFLEJO `_generarCopy`: hidrata `get_perfil` → invoca copywriter (tools:[]) con `{perfil, productos}` → persiste en `/pizzepos/carta-marketing/copy.json` → emite `marketing.copy.generado`.
- AGENTE: `tools: []`, prompt tool-less con entregable `{descripciones:[{producto_id, nombre, texto, emoji, tags}]}`.
- Antes: salida vacía (tool-calls de `carta.get/save` como texto, no ejecutaban). Después: el copy aterriza, el agente no toca herramientas.

Candidatos siguientes (mismo patrón): `marketing-strategist` (entregable: {estrella[], orden}), `marketing-brand-keeper` (entregable: {ajustes[]}).

## Lo que NO es

- **NO** es para ops deterministas puras (lecturas/CRUD sin LLM) → eso es reflejo sin agente (Patrón Módulo Híbrido).
- **NO** es para agentes que de verdad necesitan un bucle de herramientas con servicios externos (ahí el tool-use ES el trabajo; arréglalo, no lo evites).
- **NO** arregla el tool-use del framework — lo **esquiva** sacando el determinismo al reflejo. Si necesitas tool-use nativo real, esa es otra decisión (fijar provider / parsear el formato del provider).
