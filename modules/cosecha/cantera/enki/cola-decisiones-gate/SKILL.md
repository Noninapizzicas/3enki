---
name: cola-decisiones-gate
description: >
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `cola-decisiones-gate` de la vertical nichos
  (Radar de Nichos). Una sola cola de GATES por resolver en el proyecto: encola las solicitudes
  de decisión (gate de operar E2, puente humano D2, alerta de sangria F4) y el jefe resuelve la
  siguiente en orden FIFO. Es la pieza que concentra las decisiones humanas del sistema en una
  ventanilla única para el dueño. CUSTODIO single-writer: auto-encola por evento o RPC, y solo el
  DUEÑO desencola/resuelve. Persiste por proyecto vía PosPersistencia. Publica nichos.gate_encolado,
  nichos.gate_resuelto y nichos.decision.resuelta. Úsala para operar, depurar o extender el
  custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites encolar, resolver o listar las solicitudes de decisión de un proyecto
    (RPC nichos.gate.encolar.request / nichos.gate.resolver.request).
  - Cuando depures por qué una decisión se rechaza (PERMISSION_DENIED si el rol no es DUEÑO,
    COLA_VACIA si no hay solicitudes, INVALID_INPUT de solicitud/resolucion/project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y el patrón fire-and-forget
    de auto-encolado (nichos.gate/puente/alerta.solicitado).
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, reflect, nichos, radar, cola, decision, gate, proyecto-3d]
---

# cola-decisiones-gate — CUSTODIO CON PERSISTENCIA de la ventanilla única de decisiones del jefe

## Qué hace el módulo

`cola-decisiones-gate` es un **CUSTODIO CON PERSISTENCIA** (K2, hoja del plan): mantiene **UNA sola
COLA de GATES por resolver** en el proyecto. Encola las **SOLICITUDES de decisión** que el sistema
no puede resolver solo:

- **gate de operar** (E2, `gate-decision-operar`);
- **puente humano** (D2, `puente-humano`);
- **alerta de sangria** (F4, `alerta-sangria`);

y el **JEFE** resuelve la siguiente en orden FIFO (`_resolverSiguiente`). Es la pieza que concentra
las decisiones humanas del sistema en una **ventanilla única** para el dueño.

Es un **CUSTODIO single-writer** (patrón real de cola-candidatos L2): se **auto-encola** vía evento
(`nichos.gate.solicitado`, `nichos.puente_solicitado`, `nichos.alerta.sangria`) o por RPC, y **solo el
jefe (rol DUEÑO)** desencola y resuelve. Proyecciones `_encolar`, `_resolverSiguiente`, `_listar`.
Persiste por proyecto con **PosPersistencia** (storage `/prisma/nichos/cola-decisiones-gate.json`),
restaura en `project.activated` y vuelca en `onUnload`. Publica `nichos.gate_encolado`,
`nichos.gate_resuelto` y `nichos.decision.resuelta`, más su par de fallo `nichos.gate.encolar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response + fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.gate.encolar.request` | `onEncolarRequest` | RPC custodia: {project_id, solicitud} → encola una solicitud de decisión en la cola única de gates (single-writer). Éxito → publica `nichos.gate_encolado` y responde por `nichos.gate.encolar.response`. Fallo (solicitud inválida) → `nichos.gate.encolar.failed`. |
| `nichos.gate.resolver.request` | `onResolverRequest` | RPC custodia: {project_id, resolucion, rol} → desencola la siguiente solicitud en orden y la resuelve (APRUEBA\|RECHAZA\|EXPIRA). Éxito → publica `nichos.gate_resuelto` y `nichos.decision.resuelta`. Fallo (sin solicitudes o rol no permitido) → `nichos.gate.encolar.failed`. |
| `nichos.gate.solicitado` | `onSolicitudRecibida` | Fire-and-forget (E2): gate-decision-operar pide resolver un gate → auto-encola la solicitud; publica `nichos.gate_encolado`. |
| `nichos.puente_solicitado` | `onSolicitudRecibida` | Fire-and-forget (D2): puente-humano pide decisión humana → auto-encola la solicitud; publica `nichos.gate_encolado`. |
| `nichos.alerta.sangria` | `onSolicitudRecibida` | Fire-and-forget (F4): alerta-sangria cruza el techo de pérdida → auto-encola la decisión; publica `nichos.gate_encolado`. |
| `project.activated` | `onProjectActivated` | Custodio: restaura la cola de decisiones del proyecto activado vía PosPersistencia. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.gate_encolado` | Fire-and-forget (K2): una solicitud de decisión fue encolada en la cola única → {project_id, solicitud, posicion}. |
| `nichos.gate_resuelto` | Fire-and-forget (K2): la solicitud en cabecera fue desencolada y resuelta → {project_id, solicitud, resolucion}. |
| `nichos.decision.resuelta` | Fire-and-forget (K2): la decisión del jefe impactó el sistema → {project_id, decision, resolucion}. La consume gate-decision-operar (E2) y canal-supervision para materializar. |
| `nichos.gate.encolar.failed` | Par de fallo determinista: la solicitud está vacía/inválida o no hay cola → {status, code, mensaje}. Cierra el círculo de los requests y fire-and-forget que encolan. |

> **Regla de cierre de círculo**: el par `nichos.gate.encolar.failed` cierra el círculo tanto de
> `nichos.gate.encolar.request` como de `nichos.gate.resolver.request` y de los tres fire-and-forget
> auto-encolados (`nichos.gate.solicitado`, `nichos.puente_solicitado`, `nichos.alerta.sangria`) — aun
> cuando el nombre del par sugiere solo "encolar". En éxito:
> - `onEncolarRequest` → `nichos.gate_encolado`;
> - `onResolverRequest` → `nichos.gate_resuelto` + `nichos.decision.resuelta`;
> - `onSolicitudRecibida` → `nichos.gate_encolado`.

> **Nota: no está en module.json pero sí lo implementa index.js** — el RPC **`nichos.gate.listar.request`**
> (handler `onListarRequest`) con su respuesta `nichos.gate.listar.response` (proyección `_listar`,
> lectura que no muta). module.json sub-declara este query (solo lista encolar/resolver);
> index.js sí lo escucha y responde `{project_id, solicitudes, numero_en_cola}`.

> **Nota de honestidad sobre el guard de rol del encolar**: `_encolar` NO aplica guard de rol en el
> código real (puede encolar cualquier llamador con `project_id` válido y solicitud correcta) — el
> "single-writer" se materializa en el `_resolverSiguiente` (rol DUEÑO obligatorio). module.json habla
> de "single-writer" para el encolar, pero en código el rol solo se exige al resolver.

## Reglas de negocio

1. **`project_id` obligatorio → `400 INVALID_INPUT`**: si falta → `_invalid('project_id')` en
   `_encolar`, `_resolverSiguiente` y `_listar` + failed.
2. **Solicitud obligatoria → `400 INVALID_INPUT`**: `_encolar` exige `input.solicitud` objeto o una
   forma plana (`tipo`/`nicho`/`descripcion` directos). Si no hay nada → `_invalid('solicitud')` + failed.
3. **`nicho` obligatorio → `400 INVALID_INPUT`**: la solicitud debe traer `nicho` (si no →
   `_invalid('solicitud.nicho')` + failed).
4. **Guarda de rol al RESOLVER → `403 PERMISSION_DENIED`**: `_resolverSiguiente` exige
   `rol === 'DUEÑO'` (constante `ROL_DUENYO`). Si el rol es otro → `{ status:403,
   code:'PERMISSION_DENIED', mensaje:'solo el DUEÑO puede resolver las decisiones en cola',
   rol_esperado:'DUEÑO', rol_recibido:<rol> }` + `nichos.gate.encolar.failed`.
5. **Resoluciones cerradas**: `resolucion` se normaliza a mayúsculas y debe estar en
   `RESOLUCIONES = {'APRUEBA','RECHAZA','EXPIRA'}`; si no → `_invalid('resolucion')` + failed.
6. **FIFO estricto**: `_resolverSiguiente` usa `c.solicitudes.shift()` — la **solicitud más antigua**
   se desencola primero, siempre. La respuesta incluye `restantes` = solicitudes que quedan en cola.
7. **COLA_VACÍA → `404`**: si no hay solicitudes al resolver → `{ status:404, code:'COLA_VACIA',
   mensaje:'no quedan solicitudes de decision por resolver', data:{ project_id } }` + failed.
8. **Auto-encolado por evento**: `onSolicitudRecibida` infiere el `tipo` por la envoltura del evento
   (`puente`→`PUENTE_HUMANO`, `alerta`→`ALERTA_SANGRIA`, `gate`→`GATE_OPERAR`, si no `GATE_OPERAR`)
   y encola con `nicho`/`descripcion` (o `mensaje`) del payload; publica `nichos.gate_encolado`.
9. **Id de solicitud determinista-honesto**: `id` es el provisto o un generado
   `{pid}-{Date.now()}-{len+1}`; `solicitado_en` ISO y `descripcion` (o `null`) nunca se inventan.
10. **La lectura no muta**: `_listar` devuelve `200 {project_id, solicitudes, numero_en_cola}` sin tocar la cola.
11. **HTTP exacto**: éxito `200`; campos inválidos → `400`; rol no permitido → `403`; cola vacía → `404`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responden en `nichos.gate.encolar.response`, `nichos.gate.resolver.response`
y `nichos.gate.listar.response`:

### 1. `encolar` — encolar una solicitud de decisión

```json
{ "project_id": "e57a318a-...", "solicitud": { "tipo": "GATE_OPERAR", "nicho": "pan-artesano-cordoba", "descripcion": "aprobar el siguiente paso del pipeline", "correlation_id": "abc-123" } }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "solicitud": { "id": "e57a318a-...-1727299200000-1", "tipo": "GATE_OPERAR", "nicho": "pan-artesano-cordoba", "descripcion": "aprobar el siguiente paso del pipeline", "solicitado_en": "2026-09-25T10:00:00.000Z" }, "posicion": 1, "encolado": true }
```
Emite `nichos.gate_encolado`:
```json
{ "project_id": "e57a318a-...", "solicitud": { "id": "e57a318a-...-1727299200000-1", "tipo": "GATE_OPERAR", "nicho": "pan-artesano-cordoba", "descripcion": "aprobar el siguiente paso del pipeline", "solicitado_en": "2026-09-25T10:00:00.000Z" }, "posicion": 1 }
```

### 2. `resolver` — resolver la siguiente solicitud (solo DUEÑO)

```json
{ "project_id": "e57a318a-...", "rol": "DUEÑO", "resolucion": "APRUEBA", "correlation_id": "abc-123" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "solicitud": { "id": "e57a318a-...-1727299200000-1", "tipo": "GATE_OPERAR", "nicho": "pan-artesano-cordoba", "descripcion": "aprobar el siguiente paso del pipeline", "solicitado_en": "2026-09-25T10:00:00.000Z" }, "resolucion": "APRUEBA", "restantes": 0, "resuelto": true }
```
Emite `nichos.gate_resuelto`:
```json
{ "project_id": "e57a318a-...", "solicitud": { "...": "..." }, "resolucion": "APRUEBA" }
```
y `nichos.decision.resuelta`:
```json
{ "project_id": "e57a318a-...", "decision": { "...": "..." }, "resolucion": "APRUEBA" }
```

### 3. `listar` — leer la cola (no muta) — **no declarado en module.json**

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "solicitudes": [ { "id": "...", "tipo": "GATE_OPERAR", "nicho": "pan-artesano-cordoba", "descripcion": "...", "solicitado_en": "..." } ], "numero_en_cola": 1 }
```

### 4. Auto-encolado (fire-and-forget) — p. ej. `nichos.gate.solicitado`

gate-decision-operar (E2) emite `nichos.gate.solicitado`; `onSolicitudRecibida` auto-encola con
`{tipo:'GATE_OPERAR', nicho, descripcion}` y publica `nichos.gate_encolado`.

### Fallos típicos

- Rol distinto de DUEÑO al resolver → `403` + `nichos.gate.encolar.failed` (`PERMISSION_DENIED`).
- No quedan solicitudes → `404` + failed (`COLA_VACIA`).
- Falta `project_id`, `solicitud`/`nicho` o `resolucion` no permitida → `400` + failed (`INVALID_INPUT`).

## Tests

El test vive en `tests/unit/nichos__cola-decisiones-gate.test.js`. Cubre:

- `encolar` solicitud válida → `200` posiciona en la cola (FIFO), publica `nichos.gate_encolado` + `.response`.
- `resolver` con rol DUEÑO y resolución válida → desencola la más antigua, publica `nichos.gate_resuelto`
  y `nichos.decision.resuelta`; `restantes` decrece.
- Acepta solicitud plana (tipo/nicho/descripcion sin envoltura).
- `onSolicitudRecibida` auto-encola y publica `nichos.gate_encolado` (fire-and-forget).
- `_inferirTipo` de la envoltura (puente→PUENTE_HUMANO, alerta→ALERTA_SANGRIA, gate→GATE_OPERAR).
- Rol distinto → `403 PERMISSION_DENIED` + `nichos.gate.encolar.failed`.
- Cola vacía → `404 COLA_VACIA` + failed.
- `resolucion` no permitida / falta `nicho`/`project_id` → `400 INVALID_INPUT` + failed.
- `listar` → `200 {numeros_en_cola}` sin mutar.
- `project.activated` restaura la cola del proyecto (PosPersistencia).
- Manifest: subscribes/publishes exactos de la hoja K2.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__cola-decisiones-gate.test.js
```

## Notas de implementación

- Clase `ColaDecisionesGate extends ModuloHibridoReflejo`; `name = 'cola-decisiones-gate'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._colas` (Map project_id → cola).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo: this, file:
  'cola-decisiones-gate.json', dir: '/prisma/nichos', snapshot, hidratar })`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Escrituras marcan `marcarDirty(pid)`.
- `onEncolarRequest` delega en `_atender(e, 'encolar', 'nichos.gate.encolar.response', d => _encolar(d))`
  y publica `nichos.gate_encolado` (200) o `nichos.gate.encolar.failed` (si no).
- `onResolverRequest` delega en `_atender(e, 'resolver', 'nichos.gate.resolver.response', d => _resolverSiguiente(d))`
  y publica `nichos.gate_resuelto` + `nichos.decision.resuelta` en 200, o `nichos.gate.encolar.failed` si no.
- `onListarRequest` → `_atender(e, 'listar', 'nichos.gate.listar.response', d => _listar(d))` — **no
  declarado en module.json**.
- `onSolicitudRecibida` es el handler **fire-and-forget** (no `_atender`) de los tres eventos de
  auto-encolado; usa `_encolar` + `_inferirTipo` y publica `nichos.gate_encolado`/failed.
- Proyecciones: `_encolar` (escribir, sin guard de rol), `_resolverSiguiente` (escribir FIFO + guard
  DUEÑO), `_listar` (lectura). Helpers `colaVacia()`, constantes `ROL_DUENYO`, `RESOLUCIONES`.
- Tools: `toolEncolar` → `_encolar`, `toolResolverSiguiente` → `_resolverSiguiente`, `toolListar` → `_listar`.
- DEP: origen de solicitudes = gate-decision-operar (E2), puente-humano (D2), alerta-sangria (F4);
  consumen nichos.decision.resuelta = gate-decision-operar (E2) y canal-supervision.
