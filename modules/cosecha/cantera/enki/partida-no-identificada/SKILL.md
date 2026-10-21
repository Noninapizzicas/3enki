---
name: partida-no-identificada
description: >-
  Skill FULL del módulo MICRO-AGENTE `partida-no-identificada` de la vertical contabilidad (Enki).
  Reconoce y clasifica el MOVIMIENTO BANCARIO sin contrapartida (comisión/interés/devolución…).
  El tipo es DATO declarable (no regla cableada) y la CUENTA la decide `regla-movimiento-bancario`
  (E8) por RPC: esta hoja **propone**, no fija. Sin regla declarada, el movimiento va a la cola
  (A8.1) — no se adivina la cuenta. Escucha `contabilidad.movimiento_regla_declarada`. Sin store
  propio. La op `juzgar` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites proponer la clasificación/contrapartida de un movimiento bancario sin
    contrapartida (RPC partida-no-identificada.juzgar.request).
  - Cuando depures por qué la conta queda `null` (`aplicada:false` de E8 → la regla no cubre) o
    por qué el movimiento fue a la cola.
  - Cuando quieras entender su contrato de eventos y su diferencia con `cuadre-cobro-pago` y
    `conciliacion-bancaria`.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, micro-agente, reflejo, stateless, contabilidad, libro, bancos, partidas, reglas]
---

# partida-no-identificada — MICRO-AGENTE que clasifica movimientos sin contrapartida

## Qué hace el módulo

`partida-no-identificada` es un **MICRO-AGENTE** (mitad refleja) (E7, hoja del plan) de la vertical
**contabilidad**, eje **libro** (aunque el plan lo etiqueta E7, vive en `contabilidad-libro`).
Reconoce y clasifica un **movimiento bancario sin contrapartida** (comisión, interés, devolución,
abono, cargo, otro).

**El tipo es DATO declarable** (o inferido del concepto), **no** una regla de negocio cableada.
La **cuenta/contrapartida** no la decide esta hoja: se la pide por **RPC a
`regla-movimiento-bancario` (E8)**, que sí es el dueño de la regla declarada. Esta hoja **PROPONE**
(`propone:true`, `fija:false`).

**Sin regla que cubra el movimiento** → la contrapartida queda abierta y el movimiento va a la
**cola de excepciones** (A8.1) — **no se adivina la cuenta**.

**No persiste**: memoria acotada `this._reglas` (tope 500) por `contabilidad.movimiento_regla_declarada`.
La op `juzgar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `partida-no-identificada.juzgar.request` | `onJuzgarRequest` | RPC (PREGUNTA): `{project_id, movimiento, tipo?, importe?, contexto?, clave?}` → `{tipo, importe, contexto, propuesta:{cuenta, tipo, completa}, propone:true, fija:false, abierto}`. Delega en `_atender` → `_juzgar`. **Tras juzgar**, pide por RPC `regla-movimiento-bancario.aplicar.request` y rellena la cuenta; si NO aplica, publica `encolado-excepcion.encolar.request`. Si `status ≠ 200` publica `.failed`. Responde por `partida-no-identificada.juzgar.response`. |
| `contabilidad.movimiento_regla_declarada` | `onMovimientoReglaDeclarada` | Fire-and-forget: una regla de movimiento quedó declarada → se observa en la ventana (tope 500). |

### Publishes

| Evento | Cuándo |
|---|---|
| `partida-no-identificada.juzgar.response` | Respuesta RPC correlada de la op `juzgar`. |
| `partida-no-identificada.juzgar.failed` | Par de fallo determinista: falta `project_id` o `movimiento`. |
| `regla-movimiento-bancario.aplicar.request` | **Siempre que haya contexto**: se pregunta a E8 qué cuenta aplica la regla declarada (`project_id, contexto, movimiento`). |
| `encolado-excepcion.encolar.request` | **Solo si E8 no aplica regla** (`aplicada:false`): `{rol:'PARTIDA_NO_IDENTIFICADA', clave, motivo:'movimiento sin contrapartida y sin regla declarada: la clasificacion queda abierta (no se adivina)', origen, payload:{tipo, importe}, correlation_id}`. |

> **NO publica un hecho de dominio**: PROPONE. Su salida es la respuesta RPC, la consulta a E8 y,
> si nada cubre, la excepción por EVENTO a A8.1.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `juzgar` | **PREGUNTA** | `{project_id, movimiento?\|partida?\|movimiento_bancario?, tipo?, importe?, contexto?, clave?}` | `{project_id, tipo_movimiento:'partida-no-identificada', movimiento_id, clave, concepto, tipo, importe, contexto, propuesta:{cuenta, tipo, completa}, propone:true, fija:false, reglas_observadas, abierto, regla?}` | `400 INVALID_INPUT` (falta `project_id` o `movimiento`); `500`. |

## Reglas de negocio

1. **Movimiento obligatorio**: si `movimiento` (o `partida`/`movimiento_bancario`) no es objeto
   → `400 INVALID_INPUT movimiento`.
2. **Tipo declarable** (`_tipo`): si `tipo` ∈ `TIPOS` (`comision`, `interes`/`interés`, `devolucion`/
   `devolución`, `abono`, `cargo`, `otro`) se usa; si no, se **infiere del texto** del concepto
   (comisión/interés/devolución) y por defecto `'otro'`. **Nunca una constante oculta.**
3. **Importe**: `importe` → `total` → `cargo` → `abono`; `null` si no hay.
4. **Contexto** (`_contexto`): `concepto` → `descripcion` → `texto` → `referencia` → `contraparte`.
   Es lo que la regla usa para casar.
5. **La cuenta la propone E8** (`regla-movimiento-bancario.aplicar.request`): si `aplicada:true`,
   `propuesta.cuenta = regla.data.cuenta ?? regla.data.contrapartida` y `completa:true`.
6. **Sin regla → cola**: si `aplicada:false`, `propuesta.completa:false`, `abierto` lo declara y se
   publica `encolado-excepcion.encolar.request`. **No se adivina la cuenta.**
7. **Propone, no fija**: `propone:true`, `fija:false`. El corte duro (fijar la regla) es de E8.
8. **Determinista en lo declarado**; lo no cubierto por regla declarada es juicio.
9. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Clasificar un movimiento (E8 aplica regla)

```json
{
  "project_id": "e57a318a-...",
  "movimiento": { "movimiento_id": "mov-12", "concepto": "COMISION MANTENIMIENTO", "importe": -12.5 },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo_movimiento": "partida-no-identificada",
  "movimiento_id": "mov-12",
  "concepto": "comision",
  "tipo": "comision",
  "importe": -12.5,
  "contexto": "COMISION MANTENIMIENTO",
  "propuesta": { "cuenta": "626", "tipo": "comision", "completa": true },
  "propone": true,
  "fija": false,
  "reglas_observadas": 1,
  "abierto": "no hay regla declarada que cubra este movimiento: la contrapartida queda abierta (no se adivina la cuenta)"
}
```
(El `abierto` se limpia a `null` si E8 `aplicada:true`.)

### Sin regla — va a la cola

→ `propuesta.cuenta:null`, `propuesta.completa:false`, y publica `encolado-excepcion.encolar.request`.

### Fallo — falta movimiento

`{ "project_id": "..." }` → `400 INVALID_INPUT movimiento` + `.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id` o falta `movimiento`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |
| (no es error) | 200 | E8 no aplica regla → `completa:false` + encola (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.movimiento_regla_declarada`.
- **Llama por RPC**: `regla-movimiento-bancario.aplicar.request` (E8) — **es quien decide la cuenta**.
- **Sube a**: `encolado-excepcion.encolar.request` (A8.1) si no hay regla.
- **Le alimentan**: `conciliacion-bancaria` (E1) y `cuadre-cobro-pago` (E3) piden
  `partida-no-identificada.juzgar.request` por RPC.

## Verificación

1. Fichero: `modules/contabilidad-libro/partida-no-identificada/`.
2. Eventos reales: subscribes `partida-no-identificada.juzgar.request`,
   `contabilidad.movimiento_regla_declarada`; publishes `partida-no-identificada.juzgar.response`,
   `.failed`, `regla-movimiento-bancario.aplicar.request`, `encolado-excepcion.encolar.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-libro/partida-no-identificada/index.js
   # → partida-no-identificada.juzgar.failed / encolado-excepcion.encolar.request → regla-movimiento-bancario.aplicar.request
   ```
4. Test unitario (si existe): tipo inferido/declarado; E8 aplica → cuenta; sin regla → cola;
   falta movimiento → 400; `propone:true, fija:false`.
