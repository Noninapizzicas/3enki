# Arquitectura: Conversation Routing

**Fecha**: 2026-04-17
**Estado**: Decisión tomada — base del sistema de agentes

---

## El problema que resuelve

El sistema nació chat-first: la conversación era el registro canónico de todo lo que pasaba. Al añadir agentes, apareció una contradicción intrínseca: el agente ejecuta pipelines, llama tools, produce estado — y nada de eso vive en el historial de chat. El chat y el agente hablan idiomas distintos y no tienen un punto de encuentro limpio.

Esta arquitectura define ese punto de encuentro.

---

## Las tres premisas

Todo lo demás es consecuencia de estas tres:

1. **La conversación tiene estado** — no es solo un historial de mensajes. Sabe en qué modo está: esperando input, procesando, esperando un agente. El estado determina cómo se enruta el siguiente mensaje del usuario.

2. **Los módulos se registran solos** — el sistema aprende las capacidades de cada módulo leyendo su `module.json` al arrancar. No hay configuración central. Añadir un módulo nuevo es suficiente para que el router lo conozca.

3. **`conversation_id` es el hilo** — es el único dato que conecta el chat con el agente que trabaja para él. El agente no sabe que existe el chat. El chat no sabe cómo trabaja el agente. Se comunican solo a través de eventos que llevan ese ID.

---

## Las cinco capas

```
CAPA 1 — INTENT REGISTRY
─────────────────────────
Construido al arrancar leyendo todos los module.json.
Sin LLM. Sin código manual.

Cada módulo declara en module.json:

"intents": [
  {
    "keywords": ["receta", "cocinar", "ingredientes"],
    "action": "tool_call",
    "tool": "recetas.buscar"
  },
  {
    "keywords": ["investiga", "analiza en profundidad"],
    "action": "agent",
    "agent": "recetas-investigator",
    "multi_turn": true
  }
]

El registry es un Map en memoria: keyword → { module, action, tool/agent }.
Se reconstruye en cada arranque. No persiste — los module.json son la fuente de verdad.


CAPA 2 — CONVERSATION ROUTER
──────────────────────────────
Recibe: mensaje del usuario + conversation_id.

  ¿Conversación en estado AWAITING_AGENT?
    → SÍ: reenvía al agente activo (conversation_id como clave)
         El usuario puede estar respondiendo al agente, no iniciando algo nuevo.
    → NO: pasa a Capa 3.

Esta capa es la que resuelve el problema multi-turno.
No contiene lógica de dominio.


CAPA 3 — INTENT MATCHER
─────────────────────────
Consulta el Intent Registry con las palabras del mensaje.

  Alta confianza → emite el evento de dominio directamente
  Baja confianza → LLM clasifica (structured output, modelo pequeño y rápido)

El LLM no está en el camino crítico. Solo actúa cuando hay ambigüedad real.


CAPA 4 — EXECUTION (dos caminos)
──────────────────────────────────
  tool_call → LLM con tools del dominio (síncrono, respuesta rápida)

  agent     → emite: agent.execute {
                agent_name,
                task,
                project_id,
                conversation_id    ← el hilo
              }
              Conversación cambia a estado AWAITING_AGENT.
              El agente corre de forma independiente.
              Tiene su propio registro de ejecución en SQLite (no el activityBuffer).
              Puede emitir preguntas de vuelta (multi-turn).
              Emite agent.completed cuando termina.


CAPA 5 — RESPONSE
───────────────────
  Recibe: agent.completed / tool result
  → Añade resultado a chat-session como mensaje del assistant
  → Conversación vuelve a estado IDLE
```

---

## El estado de la conversación

Tres valores. Vive en `chat-session.conversations.metadata.state`.

```
IDLE            → esperando mensaje del usuario
PROCESSING      → procesando (tool call síncrono en curso)
AWAITING_AGENT  → agente async activo, esperando su completion
                  metadata incluye: { agent_name, agent_started_at }
```

Transiciones:

```
IDLE → mensaje → PROCESSING
PROCESSING → tool_call → IDLE
PROCESSING → agent.execute → AWAITING_AGENT
AWAITING_AGENT → mensaje_usuario → (reenviar al agente, no cambiar estado)
AWAITING_AGENT → agent.completed → IDLE
AWAITING_AGENT → agent.interrupt → IDLE
```

---

## El contrato de eventos del agente

```javascript
// El dispatcher lanza el agente:
agent.execute {
  agent_name: 'recetas-investigator',
  task: string,
  project_id: string,
  conversation_id: string,   // el hilo
  params: {}                 // parámetros específicos del dominio
}

// El agente necesita input del usuario (multi-turn):
agent.question {
  conversation_id: string,
  question: string,
  options?: string[],        // opciones si es elección múltiple
  timeout_ms?: number        // tiempo máximo de espera (default: 5min)
}

// El agente termina:
agent.completed {
  conversation_id: string,
  result: string | object,
  domain: string             // 'recetas', 'escandallo', etc.
}

// El usuario interrumpe (o timeout):
agent.interrupt {
  conversation_id: string,
  reason: 'user' | 'timeout' | 'error'
}
```

---

## Qué NO hace esta arquitectura

- **No centraliza lógica de negocio** — el router no sabe qué hace cada módulo
- **No requiere LLM para tareas claras** — el matcher resuelve el caso común sin él
- **No comparte estado entre chat y agente** — solo se pasan el `conversation_id`
- **No bloquea el chat mientras el agente trabaja** — son canales independientes

---

## Qué escala solo

Cuando se añade un módulo nuevo con sus `intents` declarados en `module.json`:
- El Intent Registry lo recoge en el arranque
- El router ya sabe que existe
- Cero cambios en el resto del sistema

---

## Relación con el patrón de módulos (recetas/escandallo/viabilidad)

Estos tres módulos ya implementan la mitad de esta arquitectura:
- Tools declaradas en `module.json` → base del Intent Registry
- Estado propio en SQLite → el agente tiene su estado separado del chat
- Eventos de dominio (`receta.creada`, `escandallo.calculado`) → el contrato entre módulos

Lo que falta es la capa de routing (1-3) y el estado de conversación (Capa 2).
Los módulos en sí no necesitan cambiar.
