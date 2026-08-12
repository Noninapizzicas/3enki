# La cadena de latencia del agente — mediciones y fix (panadería/f/a, 2026-08)

## El caso que lo destapó

- `esquematizador-negocio` en Panadería Artesana: 7 ejecuciones → 4 verificadas,
  3 con `PASO_FUZZY_NO_VALIDADO` (3 intentos "salida cruda vacía" c/u). Intentos
  de ~69-79s cada uno (presupuesto 300s — NO era timeout).
- Esquema del proyecto "a": truncado a 7.164 bytes ≈ ~2.000 tokens de salida
  (techo 32K = ~6%), cortado a mitad de la tabla de piezas ("…división, b"),
  y la bitácora decía `verificado: true` (regla `existe` solo comprueba presencia).
- El chat pagaba 55-62K tokens por turno (ej. `tokens: {input: 60361, output: 153,
  total: 60514}` en el metadata del último mensaje).

## La cadena de causa (de la lentitud)

1. **El motor publicaba `llm.complete.request` SIN `context.async_invocation`**
   (`ai-agent-framework-v3/index.js` `_generar`) → el gateway
   (`ai-gateway.onLlmCompleteRequest`) no veía el flag → trataba la generación del
   AGENTE como turno REAL del chat.
2. → `_executeLLM` inyectaba TODO el andamiaje: sintonizador + cantera completa +
   biblioteca + índice RPC + propiocepción + memoria resumen + perfil de usuario
   (líneas ~2562-2690, cada bloque gateado por `!context?.async_invocation`).
3. → system prompt de decenas de miles de tokens por generación → provider lento
   (70s/intento), salidas vacías intermitentes, truncados.
4. Encima, 8 lecturas RPC SECUENCIALES (cantera→biblioteca→propiocepción→resumen→
   perfil→rag→empujón→rail) con timeout propio de 2-3s: el turno pagaba la SUMA
   (8-20s) antes de llamar al LLM.

## Los fixes (PR #161 + #162)

- **Motor v3** (`_generar`): `context: { async_invocation: true, source: 'motor-v3' }`
  en el payload de `llm.complete.request` — marca el turno como SINTÉTICO.
- **ai-gateway** (`onLlmCompleteRequest`): desestructurar `context` del payload y
  pasarlo a `_executeLLM` — ANTES el gateway lo descartaba y el flag se perdía.
- **Gateway nervios en paralelo**: `Promise.all` sobre las 8 lecturas con el MISMO
  orden de ensamblado (cantera→biblioteca→índice→propio→resumen→perfil→rag→empujón→
  rail); la propiocepción sigue actualizando `conversationPropioTs` tras ensamblar.
- **Cache TTL 30s** para cantera/biblioteca (`_nervioCache`), invalidado por
  `cosecha.promover/crear/patch.response` y `bibliotecario.catalogo.actualizado`;
  se cachea también el `null` (timeout) para no repetir el castigo en el siguiente
  turno.

## Verificación

- Smoke del bloque de nervios: orden de ensamblado correcto (los 8 en secuencia
  exacta), propiocepción actualiza su timestamp, turno sintético → 0 lecturas RPC.
- smoke-blueprints 57/57 ✅ · smoke-tools 24/26 (los 2 fallos son PREEXISTENTES:
  verificados con `git stash` — están en el filtrado de tools, no en los nervios).
- Motor: 30/30 tests (incluye el test de `onLlmCompleteResponse` que propaga
  finish_reason + tokens).

## Cómo diagnosticar la lentitud de un agente (receta)

1. `finish_reason`/`tokens` del intento: tras el PR #161 la bitácora los registra
   (`intento 2: válido [finish_reason=end_turn · tokens=...]`).
2. Si el system prompt efectivo lleva cantera/biblioteca/RPC → el turno NO se marcó
   sintético: el flag `async_invocation` no llegó al gateway (revisar que el motor
   lo manda Y que `onLlmCompleteRequest` propaga `context`).
3. `current.jsonl` NO guarda payloads (solo metadata event_flow) — no buscar ahí
   el finish_reason; la verdad está en la bitácora y en la DB del proyecto
   (`agent_executions` deja `tokens/cost/duration_ms` a NULL; el metadata del
   mensaje del chat guarda tokens pero son los del CHAT, no los del agente).

## El truncado de "b" (PR #164) — el techo del gateway, no el modelo

La bitácora de "b" (con el finish_reason ya registrado) mostró la raíz de los
truncados repetidos del esquematizador:

```
intento 1: válido [finish_reason=max_tokens · tokens=10335 (in 2143 / out 8192)]
```

**El pipeline declara `max_tokens: 32000` pero la salida se cortaba en 8192
EXACTOS en cada reintento.** Causa: `ai-gateway.onLlmCompleteRequest` NO leía
`max_tokens` del payload de `llm.complete.request` — solo usaba
`settings?.max_tokens` (que el motor no manda) → `Math.max(0, 8192)` = el FLOOR
siempre. El techo declarado del pipeline nunca llegaba al provider.

**Firma diagnóstica:** `finish_reason=max_tokens` con `out` redondo (8192/4096)
= el gateway ignoró el techo del pipeline, NO que el modelo "terminó antes".
El provider reporta `max_tokens` cuando corta por techo — no `length`.

**Fix (PR #164, 30/30 tests):**
1. Gateway: desestructura `max_tokens` del payload, lo pasa a `_executeLLM`;
   `chatOptions.max_tokens = Math.max(settings, payloadMaxTokens, 8192)` — el
   techo del pipeline manda, el floor solo sube, nunca baja.
2. Motor v3: `finish_reason === 'max_tokens'` se trata como TRUNCADO (igual que
   `length`) → regenera en vez de certificar.

**Regla:** al tocar el pipeline del esquematizador, verificar con un smoke que el
`max_tokens` del payload llega a `_executeLLM` — no asumir que el floor respeta
el contrato.
