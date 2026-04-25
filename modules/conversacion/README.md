# modules/conversacion/

Capa conversacional del sistema. Reescrita desde cero siguiendo estrictamente
el paradigma de `CLAUDE.md` (event-core): emite evento, quien sabe hace.

## Módulos

- **chat-io**           — MQTT in/out + persistencia de conversaciones y mensajes
- **prompt-builder**    — lee `prompt.json`/`context.json` de cada módulo, construye system prompt
- **ai-gateway**        — LLM + agentic loop + ejecución de tool calls via eventos
- **ai-agent-framework**— escucha `invoke_agent`, carga agente desde `agents/{name}.json`, llama al LLM con el prompt del agente

## Flujo

```
Usuario (frontend MQTT)
  → chat/{project_id}/send {conversation_id, content, page}

chat-io
  → guarda mensaje user
  → publish chat.message.saved

prompt-builder
  → lee base + prompt.json del módulo activo (page) + context.json + historial
  → publish chat.prompt.ready {system, messages, page}

ai-gateway
  → filtra tools por page (+ invoke_agent global)
  → llama LLM
  → si tool_calls: publica evento {tool_name}, espera {tool_name}.response, continua
  → cuando el LLM deja de pedir tools → publish ai.chat.response

chat-io (escucha ai.chat.response)
  → guarda mensaje assistant
  → MQTT publish chat/{project_id}/response
```

## Flujo invoke_agent

```
LLM llama tool invoke_agent(name, task, context)
  → ai-gateway publica evento invoke_agent

ai-agent-framework (escucha invoke_agent)
  → carga agent.json + prompt.json del agente
  → llama LLM con ese prompt + context
  → publica invoke_agent.response con el resultado
```

## Referencia histórica

El código anterior (8000+ líneas repartidas en 10 módulos, con capas aspiracionales
y nudos heredados) está archivado en `arquitectura/conversacion-ref/` para consulta.
