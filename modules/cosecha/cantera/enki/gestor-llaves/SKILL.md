---
name: gestor-llaves
description: >-
  Usar cuando haya que emitir, revocar, listar o hidratar las LLAVES de acceso a
  una conversación (derecho de entrar a UN hilo con UN acto), o entender por qué
  una entrada no trae llave vigente. Skill FULL del módulo CUSTODIO
  `gestor-llaves` (P07) del proyecto sistema-de-conversaciones: ledger
  sólo-añadir por proyecto, contrato exacto del module.json, 409/403 con
  decision.solicitada en vez de inventar, pitfalls y test de 13 pasos.
version: 0.1.0
autor: enki
tags: [enki, modulo, custodio, conversaciones, gestor-llaves, llaves, ledger, proyecto-sistema-de-conversaciones]
---

# gestor-llaves — CUSTODIO del derecho de entrar (una llave por hilo y acto)

## Qué hace el módulo

Es el **único escritor** (GL1) del derecho de entrar a **UNA conversación** con
**UN acto**. Emite, revoca, hidrata las vigentes y lista el histórico.

La decisión ya tomada del proyecto (no se reabre): **el tipo de llave es una
REFERENCIA al secreto del proyecto** — cada llave guarda
`ref_secreto: 'HERMES_API_KEY'`, la **referencia**, **jamás el valor**. No hay
sistema de tokens nuevo ni material secreto en el ledger. Una llave con el
secreto dentro sería una copia más que rotar y filtrar.

Por qué un ledger **sólo-añadir**: revocar no puede ser un `UPDATE` ni un
`DELETE` (L1). Revocar es **anexar otro asiento**; la vigencia se calcula
**plegando** el ledger (emisiones sin revocación). Así el histórico es
irrebatible y la revocación es tan auditable como la emisión (GL3: los hechos
`llave.emitida` / `llave.revocada` se publican **después** de escribir).

Invariantes: **GL1** único escritor · **GL2** la llave declara su ámbito (una
conversación) y sus actos · **GL3** emisión y revocación se trazan · **L1** una
llave no se reescribe: se revoca y se emite otra · **L2** una llave sin
conversación no existe · **I7** LEER ≠ ESCRIBIR (los actos son un conjunto
explícito).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `llave.emitir.request` | `onLlaveEmitirRequest` | Emite una llave (forma `REFERENCIA_SECRETO`). Payload: `{ request_id, project_id, conversacion, actos[], emisor, forma, caducaEn?, ref_secreto?, emisor_autorizado?, hilo_existe?, ahora? }`. Sin forma declarada → 409 `DECISION_REQUERIDA` + `decision.solicitada` y CERO asientos. Sin autorización declarada → 403 + `decision.solicitada`. |
| `llave.revocar.request` | `onLlaveRevocarRequest` | Revoca anexando un asiento (nunca borra ni reescribe, L1). Payload: `{ request_id, project_id, id, actor, ahora? }`. |
| `llave.vigentes.request` | `onLlaveVigentesRequest` | Hidrata las llaves vigentes de un hilo (plegado del ledger: emisiones sin revocación, ámbito, actos y caducidad; `POR_DECLARAR` ⇒ no caduca y se declara). Payload: `{ request_id, project_id?, conversacion, ahora? }`. |
| `llave.listar.request` | `onLlaveListarRequest` | Lista TODAS las emisiones de un hilo con su revocación si la tienen (histórico, no vigencia). Payload: `{ request_id, project_id?, conversacion }`. |
| `project.activated` | `onProjectActivated` | Restaura el ledger de llaves del proyecto activado desde `/conversaciones/llaves.json`. |

### Publishes

| Evento | Descripción |
|---|---|
| `llave.emitida` | Hecho: se anexó una emisión. Se publica DESPUÉS de escribir. `{ llave }`. |
| `llave.revocada` | Hecho: se anexó una revocación. `{ llave, actor }`. |
| `llave.emitir.response` | Respuesta correlada del alta (201 con la llave, o el error canónico). |
| `llave.emitir.failed` | Error de dominio de la emisión (orden incompleta) — nunca un timeout como sustituto del error. |
| `llave.revocar.response` | Respuesta correlada de la revocación. |
| `llave.vigentes.response` | Llaves vigentes + total + si la caducidad está declarada. |
| `llave.listar.response` | Todas las emisiones del hilo con su revocación. |
| `decision.solicitada` | El módulo se BLOQUEA en vez de inventar: forma de llave `POR_DECLARAR` o emisor sin autorización declarada. `{ solicitud }`. |

> Cruce con `index.js`: **todo lo emitido está declarado**. Las cuatro
> `.response` las publica `_atender`; los hechos y `decision.solicitada`, con
> `_publicarEvento`. `llave.emitir.failed` sólo sale desde `_falloEmitir`
> (motivo literal `ORDEN_INCOMPLETA`). No hay eventos sub-declarados.

> Nota: el plan (`esquemas/plan-construccion.md`) declaró para esta hoja sólo
> `llave.emitida`, `llave.revocada`, `llave.emitir.response`,
> `llave.emitir.failed`, `llave.vigentes.response` y `decision.solicitada`. El
> **contrato vigente es el module.json**: añade `llave.revocar.response` y
> `llave.listar.response` (los publica `_atender` con su op real). Se documenta la
> diferencia para que nadie "arregle" el manifest hacia el plan.

## Reglas de negocio

### Emisión (`_emitir`) — orden exacto de las guardas

1. `conversacion` requerida (L2: sin hilo no hay llave) → **400** `INVALID_INPUT` +
   `llave.emitir.failed { motivo: 'ORDEN_INCOMPLETA', field: 'conversacion' }`.
2. `project_id` requerido → **400** (mismo `.failed`).
3. `actos[]` no vacío → **400** (`'actos[] requerido (LEER ≠ ESCRIBIR)'`).
4. `emisor` requerido → **400** (`'emisor requerido (toda llave tiene quién la emite)'`).
5. `hilo_existe === false` (hidratado por valor desde `chat-io`) → **409**
   `RESOURCE_NOT_FOUND` ("La conversación no existe: no se emite llave sobre un
   hilo inexistente"). No se escribe nada.
6. `forma` ausente o `POR_DECLARAR` → **409** `DECISION_REQUERIDA`,
   `details: { tipo: 'tipo_de_llave', motivo: 'FORMA_POR_DECLARAR', solicitud_id }`
   **y CERO asientos en disco**. Se publica `decision.solicitada`.
7. `forma !== 'REFERENCIA_SECRETO'` → **409** `DECISION_REQUERIDA`
   (`motivo: 'FORMA_NO_DECLARADA'`, con `forma`) + `decision.solicitada`.
8. `emisor_autorizado !== true` → **403** `PERMISSION_DENIED`:
   `false` ⇒ `motivo: 'EMISOR_NO_AUTORIZADO'`; `undefined` ⇒
   `motivo: 'POLITICA_EMISION_NO_DECLARADA'` (**no se asume permiso**) + 
   `decision.solicitada` con `tipo: 'politica_de_emision'`.
9. Sólo entonces: asiento `EMISION` con
   `id: "llave-<uuid>"`, `actos` **en mayúsculas y deduplicados**,
   `caducaEn: orden.caducaEn || 'POR_DECLARAR'`, `forma: 'REFERENCIA_SECRETO'`,
   `ref_secreto: orden.ref_secreto || 'HERMES_API_KEY'`,
   `hilo_verificado: orden.hilo_existe === true` → **201** `{ llave }`.

### Revocación (`_revocar`)

- **400** `INVALID_INPUT` si falta `project_id`, `id` o `actor` ("la revocación se
  traza").
- **404** `RESOURCE_NOT_FOUND` si no existe la **emisión** con ese `id`.
- **409** `CONFLICT_STATE` si ya está revocada (`_estaRevocada`) — idempotencia
  explícita: el ledger **no crece** con una segunda revocación.
- Si procede: asiento `REVOCACION` `{ id: "rev-<uuid>", llave_id, conversacion,
  revocadaEn, actor }` **anexado**, hecho `llave.revocada { llave: {...emision,
  revocadaEn}, actor }`, respuesta **200** con la emisión + `revocadaEn`.

### Vigencia y listado

- `_vigentes(project_id, conversacion, ahora)` = emisiones del hilo **no
  revocadas** y que no están caducadas. `caducaEn: 'POR_DECLARAR'` ⇒ **no caduca**
  (y la respuesta lo declara con `caducidad: 'POR_DECLARAR'`); caducidad declarada
  **sin `ahora`** ⇒ no se da por vigente (no se puede verificar).
- `llave.vigentes.response` → `{ llaves, total, caducidad: 'POR_DECLARAR'|'DECLARADA' }`.
- `llave.listar.response` → histórico: todas las emisiones del hilo, cada una con
  su `revocadaEn` (`'NINGUNO'` si vive). **Listar no es vigencia.**
- `project_id` es opcional en vigentes/listar: sin él se recorren todos los
  proyectos cargados en memoria (el llamante acota cuando puede).

## Cómo se usa (RPCs)

### Emitir

```json
{ "request_id": "req-emitir", "project_id": "bocaos", "conversacion": "c-1",
  "actos": ["ESCRIBIR"], "emisor": "dueno", "forma": "REFERENCIA_SECRETO",
  "emisor_autorizado": true, "hilo_existe": true,
  "ahora": "2026-11-09T04:00:00.000Z" }
```
```json
// llave.emitir.response — 201
{ "request_id": "req-emitir", "status": 201,
  "data": { "llave": {
    "id": "llave-8f3c…", "tipo": "EMISION", "conversacion": "c-1",
    "actos": ["ESCRIBIR"], "emisor": "dueno", "emitidaEn": "2026-11-09T04:00:00.000Z",
    "caducaEn": "POR_DECLARAR", "forma": "REFERENCIA_SECRETO",
    "ref_secreto": "HERMES_API_KEY", "hilo_verificado": true } } }
```
y el hecho `llave.emitida { llave }`.

### Emitir sin forma declarada (el bloqueo honesto)

```json
// request con "forma": "POR_DECLARAR"
{ "request_id": "req-x", "status": 409,
  "error": { "code": "DECISION_REQUERIDA",
             "message": "No se emite: la forma de la llave está POR_DECLARAR (tipo_de_llave)",
             "details": { "kind": "domain", "tipo": "tipo_de_llave",
                          "motivo": "FORMA_POR_DECLARAR", "solicitud_id": "dec-…" } } }
// + hecho decision.solicitada
{ "solicitud": { "id": "dec-…", "tipo": "tipo_de_llave", "motivo": "FORMA_POR_DECLARAR",
                 "conversacion": "c-1", "emisor": "dueno", "actos": ["ESCRIBIR"],
                 "preguntadoEn": "…" } }
```
**Ningún asiento, ningún fichero escrito.**

### Revocar

```json
{ "request_id": "req-rev", "project_id": "bocaos", "id": "llave-8f3c…",
  "actor": "dueno", "ahora": "2026-11-09T06:00:00.000Z" }
```
```json
{ "request_id": "req-rev", "status": 200,
  "data": { "llave": { "…": "emisión intacta", "revocadaEn": "2026-11-09T06:00:00.000Z" } } }
```

### Vigentes / listar

```json
{ "request_id": "req-v", "project_id": "bocaos", "conversacion": "c-1",
  "ahora": "2026-11-09T05:00:00.000Z" }
```
```json
{ "request_id": "req-v", "status": 200,
  "data": { "llaves": [ { "id": "llave-8f3c…", "actos": ["ESCRIBIR"], "…": "…" } ],
            "total": 1, "caducidad": "POR_DECLARAR" } }
```

### Flujo típico

1. `puerta-admision` pide `llave.vigentes` con `conversacion` + `ahora` y usa la
   lista en su paso 5 (una llave por acto).
2. El dueño emite con `llave.emitir` (`emisor_autorizado: true` declarado).
3. Revocar = `llave.revocar`; el siguiente `llave.vigentes` ya no la ve, pero
   `llave.listar` sigue mostrándola con su `revocadaEn`.
4. Tras un reinicio, `project.activated { project_id }` restaura el ledger desde
   `/conversaciones/llaves.json`.

## Tests

`tests/unit/gestor-llaves.test.js` — bus mock **con fs simulado**
(`fs.write.request` guarda el contenido; `fs.read.request` lo devuelve).
**13 pasos OK, 0 fallos (13 total)**:

```bash
node tests/unit/gestor-llaves.test.js
```

Cubre: 409 + `decision.solicitada` + **cero asientos y cero escrituras**; 403
`EMISOR_NO_AUTORIZADO`; 403 `POLITICA_EMISION_NO_DECLARADA` con
`emisor_autorizado: undefined`; 409 por `hilo_existe: false`; emisión 201 con
`ref_secreto: 'HERMES_API_KEY'` y **sin material secreto** en el JSON
(`!includes('sk-')`); `vigentes` de otra conversación = 0 (ámbito); revocar ⇒
2 asientos `['EMISION','REVOCACION']` con la emisión **intacta** y vigentes 0,
mientras `listar` sigue viendo la emisión con `revocadaEn`; revocar dos veces ⇒
409 y el ledger no crece; **chequeo estático** del código fuente (no `DELETE
FROM llaves`, no `UPDATE llaves`, no `splice(`); persistencia en
`/conversaciones/llaves.json` del proyecto; `project.activated` restaura y **no
duplica** asientos; el par `llave.emitir.request → .response` correlado por
`request_id`; orden incompleta ⇒ 400 + `llave.emitir.failed`.

## Notas de implementación

- `class GestorLlaves extends ModuloHibridoReflejo`, `this.name =
  'gestor-llaves'`, `this.version = 'reflejo-0.1.0'`.
- Estado: `this.ledger = new Map()` — `project_id → asientos[]`, **sólo-añadir**.
  `_asientos(pid)` crea el array si falta; `_anexar(pid, asiento)` hace `push`.
  No hay `splice`, ni escritura in-place de un asiento.
- Persistencia: `new PosPersistencia({ modulo: this, file: 'llaves.json',
  dir: '/conversaciones', snapshot: pid => ({ asientos: this._asientos(pid) }),
  hidratar: (pid, data) => this._hidratar(pid, data) })` → escribe
  `/conversaciones/llaves.json` **en el storage del proyecto** vía
  `fs.write.request` (atómico), debounced 800 ms (`marcarDirty`), `flush()` en
  `onUnload`. `config.persistence`: `json-file-per-project`,
  `restart_resilient: true`, `concurrency: single-writer`, `append_only: true`.
- Restauración: `onProjectActivated(e)` → `_persist.restaurar(e.data.project_id)`;
  `_hidratar` hace **merge por `id`** (nunca duplica si `project.activated` llega
  dos veces).
- Handlers de una línea con `_atender(e, 'llave.<op>', 'llave.<op>.response',
  d => this._<op>(d))`; la emisión y la revocación son `async` porque publican
  hechos.

### Pitfalls reales (pagados al construirlo)

- **El centinela `NINGUNO` es contrato, no adorno.** `_estaRevocada(pid, id)`
  compara `_revocacionDe(...) !== NINGUNO`; si `_revocacionDe` devolviera
  `undefined`/`null`/`false` en el caso "no hay revocación", **toda llave
  parecería revocada**: el primer `llave.revocar` daría 409 `CONFLICT_STATE` y
  `llave.vigentes` devolvería **0 siempre**. Por eso `_revocacionDe` devuelve
  `NINGUNO` (string) cuando no encuentra asiento de revocación — una sola
  sentencia sostiene GL3/L1.
- **`_emitir` escribe DESPUÉS de todas las guardas.** Un solo `_anexar` antes de
  validar la forma dejaría filas "sin forma" en el ledger: el test lo vigila
  (`mod.ledger.size === 0` **y** `bus.fsFiles.size === 0`).
- **La autorización es DATO.** `emisor_autorizado: undefined` **no** es "sí por
  defecto": es `POLITICA_EMISION_NO_DECLARADA` → 403 + `decision.solicitada`.
  Distinguirlo de `false` (`EMISOR_NO_AUTORIZADO`) importa: una dice "no consta",
  la otra "no puede".
- **Los actos se normalizan** (`String(a).toUpperCase()`, `Set`) al emitir, pero
  `_cubre` compara **estrictamente** contra el acto pedido: emitir `"escribir"`
  y pedir `"ESCRIBIR"` funciona; emitir `"LEER"` y pedir `"ESCRIBIR"` no (I7).
- **`marcarDirty` es debounced y sin `project_id` no persiste.** En los tests hay
  que llamar `_persist.flush()` explícitamente; en producción el timer lo hace.
  Si una llave se emite sin `project_id`, no se escribe: degradación honesta en
  memoria (el manifest lo declara como no persistente sin proyecto).
- **`listar` y `vigentes` NO son lo mismo.** Confundirlos produce "llaves
  fantasma": una revocada sigue en `listar` (con `revocadaEn`) y desaparece de
  `vigentes`. La puerta debe usar **vigentes**.
