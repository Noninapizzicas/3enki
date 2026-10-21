# ESQUEMA — Unificar el LLM a Hermes (P1) con elección multi-tenant de provider

> Esquematizado con el método (prisma recursivo + disección). El sujeto: la fusión
> LLM — Hermes como cerebro único, Enki como cuerpo, y el provider **elegible por
> ámbito** (proyecto / agente / skill) para preservar el criterio multi-tenant.
> Ley del esquematizador respetada: agnosticismo — se nombran puertos, no el
> entorno concreto salvo donde ya existe y se referencia.

---

## FASE 1 · Prisma de 5 huecos (ronda 0)

### IDENTIDAD
- **Qué es**: un **nervio único de provisión LLM** que responde a TODO el sistema
  (chat, agentes internos, skills, blueprints) — Hermes como cerebro.
- **Qué NO es**: no es "un solo provider fijo"; es un **orquestador** que respeta
  la elección de provider por ámbito.
- **Actores**: Hermes (mente, resuelve+llama), Enki (cuerpo, declara ámbitos y
  guarda keys), credential-manager (store multi-nivel de keys).

### RESTRICCIONES (durables)
- R1. **Un solo salto**: ningún flujo paga dos veces el contexto (evita el bug del
  doble salto v2.34 — lección hermes-enki-integracion).
- R2. **Multi-tenant**: cada proyecto puede tener SU provider (key propia).
- R3. **Elección por ámbito**: un agente/skill concreto puede fijar provider.
- R4. **El que no declara cae al global** (Ollama Cloud por defecto).
- R5. **La key se resuelve una vez** (credential-manager), nunca duplicada.
- R6. **Nada de Enki elige provider por prioridad interna** (eso muere).
- R7. **Sin romper lo que ya funciona**: chat (Ollama), Gmail, Telegram.

### CONTRATO (interfaz esperada)
```
Entrada de cualquier flujo LLM:
  context.provider?  → provider elegido por el ámbito (agente/skill/proyecto)
  context.model?     → modelo dentro de ese provider
  context.scope      → { project_id?, agent?, skill? }

Resolución (cascada, de más a menos específico):
  context > agente > skill > proyecto > GLOBAL

Si context.provider viene → usar ESE (resolver su key del credential-manager).
Si no → GLOBAL (default Ollama Cloud).

Salida:
  llm.complete.response  → { content, finish_reason, tokens, provider, model }
```

### NO-OBJETIVOS
- NO reescribir los providers de Enki (se heredan tal cual).
- NO hacer que Enki toque la API del LLM (eso es de Hermes — P1).
- NO eliminar el credential-manager (es el store de keys).
- NO forzar un provider único (se mantiene la elección).
- NO unificar el FRONTEND de credenciales (ya es multi-nivel).

### PREGUNTAS ABIERTAS (resueltas)
- Q1. ¿Hermes resuelve la key del credential-manager por ámbito, o Enki la pre-resuelve?
  → DECIDIDO: Hermes la resuelve (P1). Enki solo le pasa el ámbito.
- Q2. ¿Cómo viaja la key entre credential-manager y Hermes sin exponerla en el bus?
  → DECIDIDO (ver Fase diseño): la key NO viaja por el bus; Hermes la resuelve del
    credential-manager del cuerpo por ámbito, con el ámbito como clave (scope).
- Q3. ¿El fallback (provider A cae) lo hace Hermes, o Enki declara alternativas?
  → **DECISIÓN DEL DUEÑO (20-ago): Hermes.** El que llama es el que reencola al
  siguiente provider del ámbito. Enki no declara alternativas; solo provee el
  provider primario del ámbito y la key.
- Q4. ¿Dónde vive la tabla ámbito→provider?
  → **DECISIÓN DEL DUEÑO (20-ago): la decide Hermes.** Tabla config central
  (config de la fusión): `scope_providers` con reglas ámbito→provider (por
  proyecto, por agente, por skill), default GLOBAL. Residle en el gateway Hermes
  (lado mente), NO en los manifiestos de los módulos (cuerpo).

---

## 2 · Recursión del prisma (sub-productos)

### Sub: la RESOLUCIÓN de key (por ámbito)
- Pieza convergente. Entrada: `{provider, scope}` → Salida: key del store.
- Puerto: `resolve(provider, scope)` desde credential-manager.
- Forma: **reflejo** (puro, sin estado) — lee el store por cascada GLOBAL→PROJECT→CUSTOM.

### Sub: la PROVISIÓN (Hermes llama)
- Pieza convergente. Entrada: `{provider, model, key, messages}` → Salida: completion.
- Puerto: `complete(provider, payload)`.
- Forma: **puente** (Hermes→API del provider elegido).

### Sub: el CONTEXTO de ámbito
- Pieza. Entrada: ámbito (agente/skill/proyecto) → `context.provider`.
- Puerto: `providerDe(agente)`, `providerDeSkill(skill)`, `providerProyecto(proyecto)`.
- Forma: **reflejo** (leer config del ámbito).

### Sub: el FALLBACK
- Entrada: provider falló → `fallback(provider, scope)` → otro provider o error claro.
- Puerto: `fallback`.
- Forma: **conversor** (traduce el fallo del provider a una alternativa).

---

## 3 · Disección (forma de cada pieza)

| Pieza | Forma | Puerto |
|---|---|---|
| resolución de provider | **reflejo** | `resolve(provider, scope)` |
| provisión LLM | **puente** | `complete(provider, key, payload)` |
| contexto de ámbito | **reflejo** | `providerOf(agente/skill/proyecto)` |
| fallback | **conversor** | `fallback(provider, scope)` |
| store de keys | **custodio** | `get/set(key, level, id)` (credential-manager ya) |

## Reparto de formas
- 3 reflejos (resolución, contexto, config ámbito)
- 1 puente (provisión)
- 1 conversor (fallback)
- 1 custodio existente (credential-manager)

## Recuento vivo
- Pasadas: 3 (prisma, sub-recursión, disección)
- Órganos: 5 (resolver, proveer, contexto, fallback, store)
- Puertos: 5
- Tecnologías nombradas: **0** (las del entorno real quedan fuera — solo el puerto)

---

## ESTADO VERIFICADO EN PROD (deploy 2026-08-20 11:47) — ancla para continuar

> Verificado en vivo con el sistema recién arrancado. Este es el punto de partida
> real para la pieza 2. No re-investigar lo que aquí se cierra.

- **scope-provider**: en prod, `loaded {default: ollama, ambits:0}` (pieza 1 ✓).
- **Prioridades ai-gateway**: `{ollama: 1, deepseek-anthropic: 9}` → el 402 de saldo
  NO volverá en el fallback automático.
- **Camino del chat**: responde por `hermes-relay.response {model:"hermes"}` →
  el CHAT de proyecto va por Hermes (mente) YA. Se carga vía `modules_config`
  (no por la lista `enabled` del config — por eso parecía "apagado").
- **Agente interno** (force-agent esquematizador): responde `status:response`
  pero `provider:null` y `length:0` (vacío) → **NO usa scope-provider todavía**,
  va por el loop del motor v3. Es lo que falta (pieza 2).

### LO QUE FALTA (mapa con datos)
1. ✅ Saldo agentes (ollama=1)
2. ✅ scope-provider pieza 1 en prod
3. ✅ Camino del chat por Hermes
4. ⚠️ **Pieza 2**: conectar `_executeLLM` (agentes internos) a Hermes vía scope-provider
   — hoy los agentes internos NO usan scope-provider (provider:null)
5. ⚠️ Fijar provider por ámbito en scope-provider (`ambits:0` → añadir reglas)

### LA DECISIÓN (Camino B — dueño): Enki no razona, Hermes razona.
Los pipelines internos pasan a ser subagentes de Hermes (delegate_task), no con el
motor v3. `scope-provider` queda como el puerto que dice QUÉ provider; Hermes llama.

### CIERRE DE LA PIEZA 2 (20-ago, verificado) — NO hay puente que construir
Tras apagar el motor v3, se verificó quién queda esperando `invoke_agent` /
`agent.execute.request` en el core: NADIE ejecuta (solo conversation-export buféa
pasivo, chat-io hace status UI, ai-gateway enriquece args). El chat de proyecto YA
es Hermes y YA lanza sus pipelines con `delegate_task` (edias lanzó
planificar-construccion a las 06:30). CONCLUSIÓN: el Camino B está completo de
facto; fabricar un puente en _executeLLM sería inventar trabajo innecesario
(regla: no inventar vías).

### PENDIENTES REALES (post-fusión)
1. `scope-provider` ambits:0 → llenar reglas ámbito→provider cuando haya caso.
2. **Bug `messages.id` duplicado** (SQLITE_CONSTRAINT) — afecta a edias y f, no
   bloquea el chat pero ensucia y puede comerse respuestas de agentes.
3. `facturas_asesoria_bot` token 401 (bucle de error).
4. Fijar `default_model` correcto en hermes-worker (hoy `deepseek-v4-flash` pero
   Ollama usa `deepseek-v4-flash:preview`).
