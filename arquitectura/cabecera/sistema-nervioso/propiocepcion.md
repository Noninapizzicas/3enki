---
id: sistema-nervioso/propiocepcion
dominio: aprendizaje
resumen: Copia eferente + nervio: los eventos de dominio quedan registrados por proyecto y la rebanada nueva se inyecta en el turno.
fuentes:
  - modules/propiocepcion/**
verificado: 2026-07-06
---

# Capa de Propiocepción — Reflejo + Consciencia

> Copia eferente (los eventos de dominio quedan registrados por proyecto) +
> nervio (la rebanada nueva se inyecta en el contexto del turno). El LLM trata lo
> registrado como hecho verificado; no afirma lo que no esté ahí.

## Modelo (tres piezas, una idea)

```
INTERFAZ CapaPropioceptiva {
  // escritura (copia eferente): lo que pasó queda registrado
  capturar(evento: BusEvent): Void
  leer(project_id: String, desde_ts?: String, limite?: Integer): Array<Registro>
  // lectura (nervio): la consciencia se entera
  inyectarEnTurno(project_id: String, conversation_id: String): SeccionContexto|Null
}

CLASE PropiocepcionModule HEREDA BaseModule {        // ── EL REFLEJO QUE OBSERVA
  ATRIBUTOS {
    name = 'propiocepcion'
    buffers: Map<project_id, RingBuffer<Registro>>   // bounded (buffer_max=200)
    dirty: Set<project_id>
    scope: Set<modulo>                                // qué módulos son "su mundo" (recetario)
    blueprint: Set<modulo>                            // cuáles son consciente vs reflejo
    pendingFsReads: Map<request_id, {project_id}>
    _onBusMessage: Function                           // mqtt.on('message') — bus crudo
    _flushTimer: Timeout
    config: { scope_modulos, modulos_blueprint, buffer_max, flush_interval_ms, archivo_path }
  }
  METODOS {
    onLoad(core):
      _startBusCapture()                              // mqtt.on('message') → _capturar
      _flushTimer = setInterval(_flushDirty, flush_interval_ms)

    _capturar(topic, message):
      env ← _parseEnvelope(message)
      dominio ← env.event_type.split('.')[0]
      SI dominio NO EN scope: RETORNA                 // solo su mundo (filtro por proyecto)
      project_id ← env.data.project_id ; SI falta: RETORNA
      registro ← {
        ts, modulo: dominio,
        tipo: blueprint.has(dominio) ? 'consciente' : 'reflejo',
        evento: env.event_type,
        resumen: _resumen(evento, data),              // frase humana: "costeó samba → 1.45€/ud"
        datos_clave, correlation_id
      }
      buffers[project_id].push(registro)              // ring bounded
      dirty.add(project_id)

    async _flushDirty():
      PARA project_id EN dirty:
        publish('fs.write.request', { project_id, path: '/_propiocepcion.json',
                 content: { _version, _updated, eventos: buffer } })   // reflejo sobre el reflejo fs

    onProjectActivated(event): restaura buffer desde disco (fs.read.request)
    handleLeer(data): RETORNA buffer[project_id].slice(desde_ts, limite)   // lo consume el nervio
  }
  EVENTOS_SUBSCRIBES { '(bus crudo: mqtt.on message)', 'project.activated', 'fs.read.response' }
  EVENTOS_PUBLISHES  { 'fs.write.request', 'fs.read.request' }   // se apoya en el reflejo fs
}

CLASE NervioPropioceptivo {                          // ── EL NERVIO (vive en AIGateway)
  ATRIBUTOS {
    conversationPropioTs: Map<conversation_id, ts>   // "desde tu último turno": solo lo NUEVO
  }
  METODOS {
    async _leerPropiocepcion(project_id, desde_ts):
      RPC de bus → propiocepcion.leer (reflejo JS, responde en ms)
      timeout corto (3s) ; SI tarda → []             // best-effort, NUNCA bloquea el turno

    _composePropiocepcionSection(eventos): SeccionContexto
      // "# LO QUE PASO EN TU MUNDO — propiocepcion (contexto SILENCIOSO)"
      // USALO EN SILENCIO: para no suponer. NO lo recites ni enumeres al usuario
      // salvo que pregunte. Es memoria de fondo, no parte de tu respuesta.

    // engancha en _executeLLM, SOLO en turno REAL (no sintético) con proyecto:
    inyectar(effectiveSystem, project_id, conversation_id, context):
      SI context.async_invocation: RETORNA           // los turnos sintéticos no tienen consciencia
      eventos ← _leerPropiocepcion(project_id, conversationPropioTs.get(conv))   // limite 10
      SI eventos: effectiveSystem += seccion ; conversationPropioTs.set(conv, ultimaTs)
  }
}

CLASE Registro {
  ATRIBUTOS { ts, modulo, tipo ∈ {consciente, reflejo}, evento, resumen, datos_clave, correlation_id }
}
```

## Contrato

```json
{
  "garantiza": [
    "El reflejo (JS) actúa solo; el LLM no lo controla, pero queda CONSCIENTE de que pasó.",
    "El 'guardado' falso se vuelve imposible: o el hecho está en la propiocepción, o el LLM no lo afirma.",
    "Best-effort: la consciencia nunca bloquea ni encarece el turno (timeout 3s, inyección bounded a 10).",
    "Memoria por proyecto (los blueprints están vinculados por proyecto vía el grafo de cajones).",
    "consciente = evento de un módulo blueprint (lo produjo un turno LLM); reflejo = ejecución JS."
  ],
  "asimetria_eventos": "El mecanismo de eventos del bus es de UN SENTIDO. Vale para notificar (fire-and-forget) y para que el nervio LEA. NO sirve para que un blueprint conteste un RPC síncrono sin el bridge de turno sintético (ver AI-Gateway v2)."
}
```

## Ciclo

```
REFLEJO_ACTUA {
  1. un módulo JS (o un turno LLM) publica un evento de dominio al bus
  2. PropiocepcionModule (suscrito al bus crudo) lo capta SI su dominio ∈ scope
  3. lo resume en una frase humana y lo apila en el ring del proyecto
  4. flush periódico → /_propiocepcion.json (vía el reflejo fs)
}
CONSCIENCIA_SE_ENTERA {
  1. arranca un turno REAL del chat en una página de proyecto
  2. NervioPropioceptivo._leerPropiocepcion(project_id, desde_ultimo_turno)
  3. inyecta la rebanada nueva en el system prompt (contexto silencioso)
  4. el LLM trata lo listado como hecho verificado
}
```
