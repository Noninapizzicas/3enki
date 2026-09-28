---
name: aviso-revision
description: >
  Skill FULL del módulo PUENTE `aviso-revision` de la vertical contabilidad de Enki
  (A8.2, hoja del plan). EMPUJÓN AL MOTOR DE AVISOS: reacciona a la señal
  `contabilidad.excepcion_encolada` (que publica la cola-revisión A8.1) y EMPUJA un
  aviso de revisión para que nadie se quede mirando una cola muda. NO resuelve ni
  decide nada: la cola encola, el asesor resuelve (P3), este puente solo avisa. La
  señal lleva el MOTIVO y la COLA DE DESTINO (ASESOR|DUENO) derivada de la naturaleza,
  para que motor-avisos (K2) lo enrute a quien tiene la silla. Stateless; contrato
  TOLERANTE (503 si K2 no está vivo, pero la señal queda emitida). Úsala para operar,
  depurar o extender el puente.
when-to-use: >
  - Cuando la cola encola una excepción y hay que empujar el aviso de revisión (entrada
    por el evento `contabilidad.excepcion_encolada`).
  - Cuando depures por qué el aviso no llega (503: motor-avisos K2 aún no existe — la
    señal sigue emitida) o por qué la señal es inválida (400 INVALID_INPUT si falta
    excepción o project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el routing
    por naturaleza (contable→ASESOR, negocio→DUENO) y por qué el puente no decide.
  - Cuando vayas a escribir/ampliar el test unitario del puente aviso-revision.
tags: [enki, modulo, puente, contabilidad, aviso-revision, avisos, cola]
---

# aviso-revision — PUENTE del empujón al motor de avisos

## Qué hace el módulo

`aviso-revision` es un **PUENTE STATELESS** (A8.2, hoja del plan): **EMPUJÓN AL MOTOR DE
AVISOS** — *"esto necesita revisión"*. Conecta por **SEÑAL**; **NO resuelve ni decide
nada**: la cola (A8.1) encola, el asesor resuelve (P3) y este puente **solo avisa** para
que nadie se quede mirando una **cola muda**.

La señal lleva el **MOTIVO** y la **COLA DE DESTINO** (`ASESOR | DUENO`) **derivada de la
naturaleza** de la excepción, para que motor-avisos (K2) lo enrute a quien tiene la silla:
**lo contable al asesor, lo del negocio al dueño**. El mapeo es
`DESTINO_POR_NATURALEZA`: `CONTABLE`/`DOCUMENTO_DESCUADRADO`/`SIN_COBERTURA` → `ASESOR`;
`NEGOCIO`/`DECISION_DUENO`/`FUENTE_FALTANTE` → `DUENO` (y por defecto `ASESOR`).

Es **stateless**: sin PosPersistencia ni `project.activated` — no guarda estado; reacciona
al evento de dominio y sigue. La dependencia con cola-revisión (A8.1) es por **EVENTO**
(`contabilidad.excepcion_encolada`, fire-and-forget), nunca por `require` cruzado. La
dependencia con **motor-avisos (K2) AÚN NO EXISTE** en el proyecto: el aviso se **PIDE**
por EVENTO (`contabilidad.aviso.solicitar.request`, que K2 declarará en sus subscribes)
con **CONTRATO TOLERANTE** — si K2 no contesta, se publica
`contabilidad.aviso.solicitar.failed` con **`503 DEPENDENCIA_NO_DISPONIBLE`**, pero la
señal de revisión **QUEDA EMITIDA igualmente**
(`contabilidad.aviso_revision_solicitado`), porque **la señal es de contabilidad** y no
depende de que K2 esté vivo. **No se fabrica un aviso que K2 no produjo.**

> **NO REUTILIZA**: el aviso de revisión nace de la cola de ESTA vertical; K2
> (`motor-avisos`) solo lo produce/entrega.

## Contrato de eventos (module.json real)

### Subscribes (consumo por evento fire-and-forget)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.excepcion_encolada` | `onExcepcionEncolada` | Fire-and-forget (A8.2): cola-revision (A8.1) encolo una excepcion -> {project_id, excepcion:{id, motivo, naturaleza, vertical, prioridad/ambiguedad_alta, cola\|cola_destino}}. Arma la senal de revision con su motivo y su cola de destino (ASESOR si la naturaleza es contable — CONTABLE/DOCUMENTO_DESCUADRADO/SIN_COBERTURA —; DUENO si es del negocio — NEGOCIO/DECISION_DUENO/FUENTE_FALTANTE), publica contabilidad.aviso_revision_solicitado y PIDE el aviso a motor-avisos (K2) por contabilidad.aviso.solicitar.request. Si falta excepcion o project_id -> contabilidad.aviso.solicitar.failed. No resuelve ni decide: solo empuja la senal. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.aviso_revision_solicitado` | Fire-and-forget (A8.2): la senal de revision quedo EMITIDA -> {project_id, tipo:'AVISO_REVISION', excepcion_id, motivo, naturaleza, cola_destino, destinatario, vertical, prioridad, texto:'esto necesita revision', resuelve:false, decide:false, empuja_senal:true}. Es de contabilidad: se publica SIEMPRE, no depende de que motor-avisos (K2) este vivo. Traza la senal empujada. |
| `contabilidad.aviso.solicitar.failed` | Par de fallo determinista (A8.2): la senal no se pudo armar (falta excepcion o project_id) o motor-avisos (K2) no respondio al pedido de aviso. En el caso de la dependencia no viva -> {status:503, error:{code:'DEPENDENCIA_NO_DISPONIBLE', message, details:{dependencia:'motor-avisos', cola_destino, excepcion_id}}}. La senal de revision queda igualmente EMITIDA: NO se fabrica un aviso que K2 no produjo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.aviso.solicitar.failed` cierra tanto el armado de la señal (payload
> inválido) como el pedido de aviso a K2 (dependencia no viva).

> Nota: el evento de dominio `contabilidad.aviso_revision_solicitado` **se emite siempre**
> (también cuando K2 no responde): la señal es de contabilidad, no del motor de avisos.

> Nota: **no hay `*.request`/`*.response` de RPC propio** en su `module.json`: todo entra
> y sale por EVENTOS fire-and-forget. **No usa `_atender`** ni hay pares response.

> Nota: no está en module.json pero sí lo emite index.js — `onExcepcionEncolada` publica
> `contabilidad.aviso.solicitar.failed` tanto si `_avisar` devuelve status ≠ 200 (falta
> excepción/project_id) como si `_pedirAviso` no obtiene respuesta de K2 (dentro de
> `_pedirAviso`).

## Reglas de negocio

1. **Conecta por SEÑAL: no resuelve ni decide**: la señal siempre lleva `resuelve:false`,
   `decide:false`, `empuja_senal:true`, `origen_cola:'A8.1'`. El puente solo **avisa**.
2. **La cola de destino se DERIVA de la naturaleza**: primero respeta la cola declarada en
   el payload (`input.cola` o `excepcion.cola`, si está en `{ASESOR, DUENO}`); luego
   `excepcion.cola_destino`; si no, `DESTINO_POR_NATURALEZA[naturaleza]`, y por defecto
   `'ASESOR'`. *Lo contable al asesor, lo del negocio al dueño.*
3. **`destinatario` = `cola_destino`**: la señal nombra explícitamente a la silla que
   resuelve esa cola (K2 enruta con él).
4. **Prioridad derivada**: `prioridad = excepcion.prioridad || (excepcion.ambiguedad_alta ?
   'ALTA' : 'NORMAL')`.
5. **La señal es de contabilidad (se emite SIEMPRE)**: cuando `_avisar` devuelve `200`, se
   publica `contabilidad.aviso_revision_solicitado` **antes** de pedir el aviso a K2 —
   **independiente** de que K2 esté vivo.
6. **Contrato TOLERANTE con motor-avisos (K2)**: `_pedirAviso` hace `_rpc`
   (`timeout_ms:4000`) a `contabilidad.aviso.solicitar.request`; si no hay respuesta o el
   `status !== 200`, publica `contabilidad.aviso.solicitar.failed` con **`503
   DEPENDENCIA_NO_DISPONIBLE`** y `details:{dependencia:'motor-avisos', cola_destino,
   excepcion_id}`. **No se fabrica el aviso.**
7. **Aviso armado con contexto**: la petición a K2 lleva `origen:'A8.2_AVISO_REVISION'`,
   `tipo:'AVISO_REVISION'`, `motivo`, `destinatario`, `cola_destino`, `prioridad` y
   `contexto:{excepcion_id, naturaleza, vertical, origen_cola:'A8.1'}`.
8. **Fallo al armar la señal**: si `_avisar` devuelve status ≠ 200 (falta excepción o
   `project_id`), se publica `contabilidad.aviso.solicitar.failed` con el `code` de la
   proyección (por defecto `'DEPENDENCIA_NO_DISPONIBLE'` si no hay otro) y **no** se
   emite la señal.
9. **Texto fijo**: `texto:'esto necesita revision'`.
10. **Validaciones deterministas**: `excepcion` ausente/no objeto → `400 INVALID_INPUT
    excepcion`; sin `project_id` (ni en `input` ni en `excepcion`) → `400 INVALID_INPUT
    project_id`. Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo>
    requerido', details:{ field:<campo> } } }`.
11. **La ley entra como DATO**: el mapeo naturaleza→destinatario es la política de
    enrutado del dominio (espejo del routing de A8.1); el puente no resuelve excepciones.
12. **HTTP exacto**: señal armada → `200`; payload inválido → `400`; K2 no disponible →
    `503` en el par `aviso.solicitar.failed` (la señal **sigue** emitida); no usa
    `_atender` (no hay RPC propio).

## Cómo se usa (eventos)

Este puente **no tiene RPCs**: todo entra por el evento `contabilidad.excepcion_encolada`.

### 1. Entrada — cola encola excepción CONTABLE → señal al ASESOR

Entra `contabilidad.excepcion_encolada`:
```json
{
  "project_id": "e57a318a-...",
  "excepcion": { "id": "e57a318a-...-A8.1-007", "motivo": "SIN_COBERTURA", "naturaleza": "CONTABLE", "vertical": "COMPRA", "ambiguedad_alta": true },
  "correlation_id": "abc-123"
}
```
Se publica `contabilidad.aviso_revision_solicitado`:
```json
{ "project_id": "e57a318a-...", "tipo": "AVISO_REVISION", "excepcion_id": "e57a318a-...-A8.1-007", "motivo": "SIN_COBERTURA", "naturaleza": "CONTABLE", "cola_destino": "ASESOR", "destinatario": "ASESOR", "vertical": "COMPRA", "prioridad": "ALTA", "texto": "esto necesita revision", "resuelve": false, "decide": false, "empuja_senal": true, "origen_cola": "A8.1", "correlation_id": "abc-123" }
```
Y se PIDE el aviso a K2 por `contabilidad.aviso.solicitar.request`:
```json
{ "project_id": "e57a318a-...", "origen": "A8.2_AVISO_REVISION", "tipo": "AVISO_REVISION", "motivo": "SIN_COBERTURA", "destinatario": "ASESOR", "cola_destino": "ASESOR", "prioridad": "ALTA", "contexto": { "excepcion_id": "e57a318a-...-A8.1-007", "naturaleza": "CONTABLE", "vertical": "COMPRA", "origen_cola": "A8.1" }, "correlation_id": "abc-123" }
```

### 2. Entrada — excepción del NEGOCIO → señal al DUENO

Con `"naturaleza": "DECISION_DUENO"` (o `NEGOCIO`/`FUENTE_FALTANTE`) → `cola_destino:'DUENO'`
y `destinatario:'DUENO'` (misma emisión de `contabilidad.aviso_revision_solicitado`).

### 3. K2 no está vivo → 503 TOLERANTE (la señal queda emitida)

Si motor-avisos (K2) no responde, se publica `contabilidad.aviso.solicitar.failed`:
```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "motor-avisos (K2) no respondio: la senal de revision queda EMITIDA, no se fabrica el aviso", "details": { "dependencia": "motor-avisos", "cola_destino": "ASESOR", "excepcion_id": "e57a318a-...-A8.1-007" } } }
```
La señal `contabilidad.aviso_revision_solicitado` ya se emitió **igual**.

### 4. Fallo — señal inválida

Sin `excepcion` o sin `project_id` → `400 INVALID_INPUT` + `contabilidad.aviso.solicitar.failed`.

### 5. Tools (sin RPC en module.json)

`toolAvisar` → `_avisar`.

## Tests

El test vive en `tests/unit/aviso-revision.test.js`. Cubre:

- Excepción `CONTABLE` → emite `contabilidad.aviso_revision_solicitado` con
  `cola_destino:'ASESOR'`, `resuelve:false`, `decide:false`, `empuja_senal:true`, y pide
  el aviso `contabilidad.aviso.solicitar.request`.
- Excepción del negocio (`DECISION_DUENO`/`NEGOCIO`/`FUENTE_FALTANTE`) → `cola_destino:'DUENO'`.
- La cola declarada en el payload (`colas`) manda sobre la derivada de la naturaleza.
- `prioridad` derivada de `ambiguedad_alta`.
- **Contrato TOLERANTE**: K2 no responde → `contabilidad.aviso.solicitar.failed` (503) y
  la señal **sigue** emitida.
- Payload sin `excepcion`/`project_id` → `400 INVALID_INPUT` + `contabilidad.aviso.solicitar.failed`.
- El puente es **stateless**: sin `project.activated` ni persistencia; **no usa
  `_atender`** (sin RPC propio).

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/aviso-revision
node --test tests/unit/aviso-revision.test.js
```

## Notas de implementación

- Clase `AvisoRevision extends ModuloHibridoReflejo`; `name = 'aviso-revision'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (puente stateless: no hay `this._store` ni
  PosPersistencia ni `project.activated`).
- Constantes: `COLAS` (Set `ASESOR`,`DUENO`), `DESTINO_POR_NATURALEZA` (mapa de 6
  naturalezas).
- **No usa `_atender`** (no hay RPCs request/response): el único handler es
  `onExcepcionEncolada`, fire-and-forget. El aviso se pide con `_rpc`
  (`contabilidad.aviso.solicitar.request`, `timeout_ms:4000`).
- Proyección pura: `_avisar` (arma la señal con su cola de destino), `_pedirAviso`
  (PUERTO a K2, tolerante). `_invalid`/`_rpc` vienen de la base.
- Tools: `toolAvisar`.
- DEP hacia delante: `contabilidad.aviso_revision_solicitado` (traza la señal
  empujada); `contabilidad.aviso.solicitar.request` es el PUERTO a K2 `motor-avisos`
  (AÚN NO EXISTE). DEP hacia atrás por evento: A8.1 `cola-revision` (entrada
  `contabilidad.excepcion_encolada`).
