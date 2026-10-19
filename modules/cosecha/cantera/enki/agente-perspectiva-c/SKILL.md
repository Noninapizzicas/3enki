---
name: agente-perspectiva-c
description: "Convierte un agente de dominio (o crea uno nuevo) al patron AGENTE-PERSPECTIVA-C: el reflejo JS HIDRATA los datos y PERSISTE el resultado; el agente solo TRANSFORMA (funcion pura, sin herramientas). El problema no es de tools, es de COLOCACION: sacando el determinismo (cargar/guardar) al reflejo, el entregable ATERRIZA siempre y el agente queda como transformacion pura, fiable y provider-agnostica."
when-to-use: "Un agente de dominio sale vacio/teatro, su salida no aterriza; o quieres crear un agente nuevo que GENERA/DECIDE sobre datos del proyecto y debe ATERRIZAR su salida de forma determinista. NO usar para ops deterministas puras ni para agentes con bucle de tools real."
source: enki
tags: [patron, agente, reflejo, colocacion, determinismo, fuzzy, modulo-hibrido]
---

# agente-perspectiva-c

> El problema de las tools no es de tools. Es de colocacion.
> Saca el determinismo (cargar/guardar) al reflejo JS; deja al agente solo lo fuzzy
> (transformar). Con la persistencia en el reflejo, el entregable aterriza SIEMPRE —
> sin depender de que el agente toque herramientas.

## Contrato (JSON)

```json
{
  "esquema": "agente-perspectiva-c-v1",
  "principio": "colocacion, no tools: determinismo fuera (reflejo JS), fuzzy dentro (agente puro)",
  "garantiza": [
    "el agente NO toca herramientas (tools:[]) -> su entregable no depende de su tool-use; lo aterriza el reflejo",
    "el reflejo HIDRATA antes y PERSISTE despues -> el entregable aterriza SIEMPRE",
    "entregable con contrato JSON tipado -> si no cumple, error declarado",
    "emite <dominio>.<algo>.generado -> la propiocepcion lo capta, los consumidores beben"
  ],
  "decisiones_cerradas": {
    "agente_tools": "[] SIEMPRE",
    "hidratacion": "RPC determinista del reflejo ANTES del turno del agente",
    "persistencia": "fs.write en el reflejo DESPUES, store propio del modulo",
    "timeout_agente": "120000 ms"
  }
}
```

## Motor del patron (pseudocodigo)

```
CLASE ReflejoOrquestador EXTIENDE ModuloHibridoReflejo {
  on<Op>Request(e): _atender(e, '<op>', '<modulo>.<op>.response', d => _<op>(d))

  ASYNC _<op>(input): RespuestaTipada {
    SI !input.<requeridos>: RETORNA _invalid(<campo>)

    // 1. HIDRATAR (determinista)
    datos <- AWAIT _rpc('<dominio>.<lectura>.request', { project_id: input.project_id, ... })

    // 2. AGENTE (fuzzy puro, SIN tools)
    ag <- AWAIT _rpc('agent.execute.request', {
           agent_name: '<agente>',
           task: '<instruccion>',
           context: { project_id: input.project_id, ...datos }
         }, { timeout_ms: 120000 })
    SI ag.status >= 400: RETORNA ag
    entregable <- _parseEntregable(ag)
    SI NO entregable.cumpleContrato(): RETORNA _err(502, 'UPSTREAM_INVALID_RESPONSE')

    // 3. PERSISTIR (determinista)
    store <- AWAIT _leerJson(input.project_id, <PATH>) || _vacio()
    store.aplicar(entregable)
    AWAIT _rpc('fs.write.request', { project_id, path: <PATH>, content: JSON(store), atomic: true })

    // 4. EMITIR
    eventBus.publish('<dominio>.<algo>.generado', { project_id, count, ... })
    RETORNA { status: 200, data: entregable }
  }
}
```

## Caso aplicado: clasificador de formas del diseccionador

En 3enki se aplico este patron para **asignar automaticamente la forma del
diseccionador** (reflejo, micro-agente, custodio, conversor, puente) a cada
modulo del sistema. El script vive en el repo en
`.claude/skills/agente-perspectiva-c/clasificador-forma.js`.

### Ciclo implementado

```
1. REFLEJO (lector):   module.json + index.js -> resumen estructurado
                       (blueprint, agents, fs.write, LLM calls, store, eventos)
2. AGENTE (tools:[]):  resumen + tabla de formas del diseccionador -> clasificacion
3. REFLEJO (escritor): escribe forma_diseccionador en module.json
```

## Antipatron: LLM cuando sobra

Si la transformacion es **puramente determinista** (una tabla de verdad, un lookup),
el 'agente' puede (y debe) ser reflejo puro. Preguntate:

> Si implemento esto como codigo, puedo escribir un test unitario que lo afirme?
> Si la respuesta es si, es reflejo, no LLM.

## Lo que NO es

- NO es para ops deterministas puras (lecturas/CRUD sin LLM) -> reflejo sin agente.
- NO es para agentes con bucle real de herramientas a servicios externos.
- NO depende del tool-use del agente - saca el determinismo al reflejo, asi el
  entregable aterriza por diseno.
