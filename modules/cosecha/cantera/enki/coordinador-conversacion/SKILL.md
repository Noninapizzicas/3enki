---
name: coordinador-conversacion
description: >-
  Usar cuando haya que entender, operar o depurar la SECUENCIA de entrada de una
  conversación — quién decide el orden sobre → llaves → puerta → sesión → relay y
  qué pasa cuando un paso falla. Skill FULL del módulo MICRO-AGENTE
  `coordinador-conversacion` (C1–C3) del proyecto sistema-de-conversaciones: los
  tres coordinadores del diseño fundidos en UN dueño del orden, RPC correlado por
  request_id, fail-closed y cero escrituras de almacén ajeno.
version: 0.1.0
autor: enki
tags: [enki, modulo, micro-agente, conversaciones, coordinador, secuencia, fail-closed, proyecto-sistema-de-conversaciones]
---

# coordinador-conversacion — MICRO-AGENTE dueño de la SECUENCIA (C1–C3)

## Qué hace el módulo

Es el **único dueño del orden** de la entrada. El diseño tenía tres objetos de
coordinación (`CoordinadorDeEntrada`, `CoordinadorDeLectura`,
`CoordinadorDeGobierno`) que «no pueden existir dos veces con criterios
distintos»: tres módulos serían tres caminos para romper la secuencia. Aquí hay
**un módulo y tres caminos internos**; esta hoja materializa el camino de
**ENTRADA** (F1/F2) sobre las islas ya vivas:

```
1  SOBRE     sobre-conversacion  construir + validar   (S1: nada se completa)
2  LLAVES    gestor-llaves       vigentes del hilo      (la puerta es isla)
3  PUERTA    puerta-admision     ABRIR | RECHAZAR       (I6: reproducible)
4  SESIÓN    amarre-sesion       atar el par            (I4)
5  RELAY     chat.message.saved  SÓLO tras ABRIR + sesión atada
```

**No juzga y no escribe**: la decisión es de la puerta, el sobre es de P01, las
llaves de P07, la sesión de P08. El coordinador **ordena** y asienta el rastro
(`conversacion.sobre_incompleto`, `conversacion.entrada_rechazada`). Su único
«estado» es el `Map` de RPC en vuelo (`this.pendientes`), con timeout declarado.

Invariantes: **CO1** el orden es de este módulo y de nadie más · **CO2** toda
llamada correlaciona por `request_id` y el `.failed` cierra el círculo (un
timeout **nunca** se disfraza de respuesta) · **CO3** fail-closed: sin `ABRIR` +
sesión atada no se publica el paso al relay · **CO4** no juzga ni escribe
almacén ajeno · **I1** ninguna entrada anónima toca estado ni llega al LLM ·
**I4** la sesión se ata al par · **I7** LEER ≠ ESCRIBIR (la llave que cubre el
acto la decide la puerta).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `conversacion.entrada.recibida` | `onEntradaRecibida` | Entrada cruda del chat (gate `conversaciones.gate` ON). Payload: `{ request_id?, project_id, conversacion, participante, user_message, estado_conversacion?, politica?, acto?, mensaje?, padre?, instante?, ahora? }`. Corre la secuencia y responde en `conversacion.entrada_resultado` **antes** del `INSERT` de chat-io. |

Es fire-and-forget desde chat-io, pero **con resultado correlado**: el handler
usa `_atender(e, 'entrada', 'conversacion.entrada_resultado', …)`, así que la
respuesta lleva el `request_id` de la entrada y chat-io puede esperarla.

### Publishes

| Evento | Descripción |
|---|---|
| `conversacion.entrada_resultado` | Resultado correlado: `200 { ok:true, admitida:true, actos, llaves, sesion, sobre, relay_event }` o `403/422/503/504` con `error.details { motivo, paso, causa }`. |
| `conversacion.sobre_incompleto` | Cuarentena (O5): `{ motivo:'SOBRE_INCOMPLETO', estado, faltantes[], referencia }`. No se toca cuaderno ni hilo y NO se sigue. |
| `conversacion.entrada_rechazada` | Hecho: rechazo o paso fallido. `{ motivo, paso, base, detalle, referencia }`. La consumen la traza y `adaptador-avisos`. |
| `sobre.construir.request` | Paso 1 · P01: construir el sobre copiando campo a campo (S1). Espera `sobre.construir.response`. |
| `sobre.validar.request` | Paso 1b · P01: veredicto del sobre. Espera `sobre.validar.response` / `sobre.validar.failed`. |
| `llave.vigentes.request` | Paso 2 · P07: hidratar por valor las vigentes del hilo. Espera `llave.vigentes.response`. |
| `conversacion.admitir.request` | Paso 3 · P03: veredicto con `{ veredicto, proyecto, conversacion, participante, acto, politica, llaves[], ahora }`. Espera `conversacion.admitir.response` / `.failed`. |
| `sesion.resolver.request` | Paso 4 · P08: atar el par. Espera `sesion.resolver.response` / `sesion.resolver.failed`. |
| `chat.message.saved` | Paso 5 · **el paso al LLM**: lo que hoy escucha `hermes-relay`. Sólo tras `ABRIR` + llaves cubiertas + sesión atada. |

> Cruce con `index.js`: todo lo emitido está declarado. Los `.request` de salida
> se publican desde `_pedir`; el resultado y los hechos desde `_atender` y
> `_publicarEvento`. **No hay eventos sub-declarados.**

> Nota: el plan sólo listaba `conversacion.admitir.request` entre las requests
> de salida y `chat.message.saved` no aparece en su lista de publishes porque la
> costura final del plan es `llamada.nativa.request` (op nueva de hermes-relay,
> §5.2). Esta hoja **no toca el relay**: hoy el cable escucha `chat.message.saved`
> y la constante `EVENTO_RELAY` es el único punto que habrá que cambiar.

## Reglas de negocio

1. **El orden no se negocia.** `sobre.construir` → `sobre.validar` →
   `llave.vigentes` → `conversacion.admitir` → `sesion.resolver` →
   `chat.message.saved`. Cualquier otro orden es un camino nuevo para romperlo
   (CO1). El test fija la lista exacta.
2. **Sobre no `COMPLETO` ⇒ cuarentena, no rechazo de puerta.** Se publica
   `conversacion.sobre_incompleto { motivo:'SOBRE_INCOMPLETO', estado, faltantes }`
   y se devuelve **422** `PRECONDITION_FAILED` con
   `details.motivo='SOBRE_INCOMPLETO'`. **No** se llama a llaves, puerta ni
   sesión; el mensaje no toca el cuaderno (I1).
3. **Un fallo de transporte NO se convierte en motivo de dominio.** Si
   `llave.vigentes` falla, el motivo es `LLAVES_NO_HIDRATADAS` (paso `llaves`),
   **nunca** «no hay llaves» (`MOTIVO_SIN_LLAVE` sería una decisión falsa de la
   puerta). Igual con `SOBRE_NO_CONSTRUIDO`, `SOBRE_NO_VALIDADO`,
   `ADMISION_NO_DECIDIDA`, `SESION_NO_ATADA`.
4. **Fail-closed con status honesto.** Timeout → **504** `UPSTREAM_TIMEOUT`;
   `.failed`/respuesta de error/bus roto → **503** `UPSTREAM_UNREACHABLE`. En
   ambos `error.details` lleva `{ kind:'dependency', motivo, paso, causa,
   timeout_ms }`. Nunca se inventa una respuesta ni se sigue adelante (CO2/CO3).
5. **`RECHAZAR` corta la cadena.** Se publica `conversacion.entrada_rechazada
   { motivo:<MOTIVO_* literal de la puerta>, paso:'puerta', base }` y se devuelve
   **403** `PERMISSION_DENIED` con `details.motivo`. **No** se ata sesión y
   **no** se publica `chat.message.saved`.
6. **Sin sesión no hay LLM.** `sesion.resolver` debe devolver `data.sesion.id`;
   una respuesta vacía también es `SESION_NO_ATADA` (fail-closed). La sesión se
   pide **sólo** con `ABRIR` y **por el par**, jamás «la sesión activa».
7. **El paso al relay exige mensaje.** Sin `user_message` (o alias
   `contenido`/`mensaje_texto`) → `MENSAJE_AUSENTE` (422); sin proyecto/hilo en
   el sobre → `SOBRE_SIN_HILO`. El relay real descarta en silencio un payload sin
   `user_message`: publicarlo sería un éxito falso.
8. **Cuarentena declarada, no adivinada.** El coordinador no rellena campos del
   sobre ni resuelve alias de proyecto: si el hueco existe, se nombra.

## Cómo se usa (RPCs)

Entrada disparada por chat-io (gate ON), p. ej.:

```json
// conversacion.entrada.recibida  (data)
{
  "request_id": "req-entrada-1",
  "project_id": "sistema-de-conversaciones",
  "conversacion": "c-1",
  "participante": "ana",
  "user_message": "hola, ¿qué tal?",
  "message_id": "m-1",
  "estado_conversacion": "ABIERTA",
  "politica": {
    "actosPorEntrada": { "ESCRIBIR": ["LEER", "ESCRIBIR"] },
    "actosPorEstado": { "ABIERTA": ["LEER", "ESCRIBIR"] }
  },
  "ahora": "2026-11-09T04:00:00.000Z"
}
```

Camino feliz (`ABRIR` + llave vigente + sesión nueva):

```json
// conversacion.entrada_resultado
{
  "request_id": "req-entrada-1",
  "status": 200,
  "data": {
    "ok": true, "admitida": true,
    "actos": ["LEER", "ESCRIBIR"],
    "llaves": [{ "id": "llave-1", "actos": ["LEER", "ESCRIBIR"] }],
    "sesion": { "id": "sesion-1", "participante": "ana", "conversacion": "c-1" },
    "sobre": { "proyecto": "sistema-de-conversaciones", "conversacion": "c-1", "participante": "ana", "padre": "NINGUNO" },
    "relay_event": "chat.message.saved"
  }
}
// + chat.message.saved (payload real de hermes-relay + rastro de admisión):
{
  "correlation_id": "…", "project_id": "…", "conversation_id": "c-1",
  "message_id": "m-1", "user_message": "hola, ¿qué tal?", "user_id": "ana",
  "admitido": true, "sobre": { … },
  "sesion": { "id": "sesion-1", "participante": "ana", "conversacion": "c-1" },
  "decision": { "decision": "ABRIR", "actos": ["LEER", "ESCRIBIR"] }
}
```

Rechazo de la puerta:

```json
// conversacion.entrada_rechazada
{ "motivo": "MOTIVO_SIN_LLAVE", "paso": "puerta", "base": { "estado": "ABIERTA" }, "detalle": { "decision": "RECHAZAR", "base": { … } }, "referencia": { "proyecto": "…", "conversacion": "c-1", "participante": "ana", "acto": "ESCRIBIR" } }

// conversacion.entrada_resultado
{ "request_id": "req-entrada-1", "status": 403,
  "error": { "code": "PERMISSION_DENIED", "message": "entrada rechazada: MOTIVO_SIN_LLAVE",
             "details": { "kind": "domain", "motivo": "MOTIVO_SIN_LLAVE", "detalle": { … } } } }
```

Sobre incompleto (cuarentena):

```json
// conversacion.sobre_incompleto
{ "motivo": "SOBRE_INCOMPLETO", "estado": "PARCIAL", "faltantes": ["participante"], "referencia": { … } }
// conversacion.entrada_resultado
{ "request_id": "req-entrada-1", "status": 422,
  "error": { "code": "PRECONDITION_FAILED", "message": "entrada rechazada: SOBRE_INCOMPLETO",
             "details": { "kind": "domain", "motivo": "SOBRE_INCOMPLETO", "detalle": { "faltantes": ["participante"], "estado": "PARCIAL" } } } }
```

Paso caído (timeout de llaves):

```json
// conversacion.entrada_resultado
{ "request_id": "req-entrada-1", "status": 504,
  "error": { "code": "UPSTREAM_TIMEOUT", "message": "llaves: LLAVES_NO_HIDRATADAS (TIMEOUT)",
             "details": { "kind": "dependency", "motivo": "LLAVES_NO_HIDRATADAS", "paso": "llaves", "causa": "TIMEOUT", "timeout_ms": 8000 } } }
```

Timeouts por paso (module.json, inyectables en el constructor para tests):
`sobre` 8000 · `llaves` 8000 · `puerta` 8000 · `sesion` 8000 · `default` 8000.

## Tests

`node tests/unit/coordinador-conversacion.test.js` — 6 casos, todos verdes:

- **(a)** `ABRIR`: el orden exacto `sobre.construir → sobre.validar →
  llave.vigentes → admitir → sesion.resolver → chat.message.saved`, el
  `entrada_resultado` correlado y el payload del relay (`user_message`,
  `admitido`, `sesion`, `sobre`).
- **(b)** `RECHAZAR`: 403 `PERMISSION_DENIED`, **cero** `sesion.resolver.request`
  y **cero** `chat.message.saved`; hecho `entrada_rechazada`.
- **(c)** `.failed` **real sin `request_id`** (`sesion.resolver.failed`): 503
  `UPSTREAM_UNREACHABLE`, `details.paso='sesion'`, cadena cortada.
- **(d)** timeout declarado de `llave.vigentes` (40 ms en test): 504
  `UPSTREAM_TIMEOUT`, no se pide la puerta y no hay relay.
- **(e)** sobre `PARCIAL`: cuarentena 422, `faltantes:['participante']`, **ni
  siquiera se llama a llaves**.
- **(f)** costura con los **4 módulos reales** cableados al bus (sobre, gestor de
  llaves, puerta, amarre): emite una llave real, corre la secuencia y comprueba
  que `chat.message.saved` sale con el `user_message` — el payload de cada paso
  encaja con el contrato de su isla.

## Notas de implementación

- `class CoordinadorConversacion extends ModuloHibridoReflejo` (sin
  PosPersistencia: **stateless**, no escribe almacén ajeno — CO4).
- `this.name = 'coordinador-conversacion'`, `this.version = 'reflejo-0.1.0'`.
- Entry: `onEntradaRecibida(e) → this._atender(e, 'entrada',
  'conversacion.entrada_resultado', d => this._recibir(d))` — el RPC correlado se
  publica con el `request_id` de la entrada.
- `_recibir(entrada)` es la secuencia; cada paso es un `await this._pedir(...)`.
- `_pedir(evento, payload, { timeout_ms })` **sustituye a `_rpc`** de la base: se
  suscribe a `.response` **y** `.failed`, guarda el `request_id` en
  `this.pendientes`, limpia suscripciones y timer al cerrar, y resuelve
  `{ ok:false, motivo:'TIMEOUT' | 'FAILED' | 'BUS_NO_DISPONIBLE' | 'PUBLISH_FALLIDO' }`.
- **Pitfall capital: las islas publican su `.failed` con `_publicarEvento` SIN
  `request_id`** (p. ej. `sesion.resolver.failed`, `sobre.validar.failed`,
  `conversacion.admitir.failed`). `_pedir` acepta un `.failed` sin `request_id`
  **sólo si hay UNA sola llamada en vuelo para ese evento** (`_unicoEnVuelo`):
  sin correlación posible, un fallo ajeno no puede cortar esta cadena.
- Los módulos devuelven `{status, data}` y la isla publica
  `{request_id, status, data}`: el payload útil está en `r.data.data`
  (`_data(r)`), y la respuesta es error si `status >= 400` o hay `data.error`
  (`_ok(r)`).
- El payload de la puerta se hidrata **por valor**: `proyecto` como
  `{ idCanonico }`, `conversacion` como `{ id, proyecto, estado }`,
  `participante` como `{ id }`, más `veredicto`, `acto`, `politica`, `llaves[]`,
  `ahora`. La puerta no consulta almacenes (isla).
- El paso al relay reenvía el contrato real de `hermes-relay.onMessageSaved`
  (`project_id`, `conversation_id`, `user_message`, `message_id`,
  `correlation_id`, …) y añade `admitido`, `sobre`, `sesion`, `decision`,
  `entrada_request_id` como rastro.
- Al cambiar la costura a `llamada.nativa.request` (op futura del relay, §5.2),
  se toca **sólo** `EVENTO_RELAY` y su descripción en el manifest.
