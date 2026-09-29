---
name: contrapartida-asistida
description: >
  Skill FULL del módulo MICRO-AGENTE `contrapartida-asistida` de la vertical
  contabilidad de Enki. PROPONE la contrapartida de un hecho (cuenta + tercero +
  periodo) contra el PLAN DECLARADO y la ficha del tercero, ambas consultadas POR
  EVENTO; PROPONE y no escribe, y JAMÁS fabrica una cuenta — sin regla que cubra el
  hecho devuelve propuesta:null y manda la duda a la cola de excepción con destino
  derivado de su naturaleza. Úsala para operar, depurar o extender el micro-agente,
  o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites proponer la contrapartida de un hecho (RPC
    contrapartida-asistida.juzgar.request).
  - Cuando depures por qué no hay propuesta (400 INVALID_INPUT si falta hecho o
    project_id, o propuesta:null con requiere_cola:true cuando no hay regla).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la cara asistida (no inventa la cuenta, el plan manda, el corte
    duro lo fija la regla).
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente
    contrapartida-asistida.
tags: [enki, modulo, micro-agente, contabilidad, contrapartida-asistida]
---

# contrapartida-asistida — MICRO-AGENTE STATELESS de la contabilidad

## Qué hace el módulo

`contrapartida-asistida` es un **MICRO-AGENTE** (A6.1, hoja del plan): **PROPONE** la
contrapartida de un hecho (**cuenta + tercero + periodo**) contra el **PLAN
DECLARADO** (`catalogo-cuentas`, B1) y la **ficha del tercero** (`maestro-terceros`,
N1), ambas consultadas **POR EVENTO** (request/response) — **nunca por import
cruzado**.

Es la cara **ASISTIDA**: **PROPONE, no escribe, no decide**. El **CORTE DURO** lo fija
la **REGLA** (`regla-contrapartida`, A6.2).

Invariantes:
- **JAMÁS fabrica una cuenta**: no hay regla que cubra el hecho → no hay propuesta
  (`propuesta:null`) y el asunto va a la cola de excepción (A8.1).
- **JAMÁS escribe**: no asienta, no persiste, no marca nada.
- **El plan manda**: una cuenta propuesta **fuera del plan** no se propone (se declara
  el motivo y va a cola).
- **Si el plan o el maestro no responden, no se inventa dato**: `disponible:false`
  (tiempo de espera agotado) y va a cola.
- **La propuesta es determinista y auditable**: `regla`, `plan_confirmado`,
  `tercero_conocido`, `motivo`.

**FORMA**: MICRO-AGENTE **stateless** en este contrato — no persiste estado propio: su
cajón fuzzy vive en el blueprint y toda su memoria relevante es **EXTERNA** (plan +
reglas + terceros). Persistir aquí duplicaría estado ya custodido por A6.2/N1 sin ganar
nada. Sin `PosPersistencia` y sin `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contrapartida-asistida.juzgar.request` | `onJuzgarRequest` | RPC micro-agente: {project_id, hecho, naturaleza?} → {propuesta, propuesta_por:'REGLA', regla, plan_disponible, plan_confirmado, tercero_disponible, requiere_cola, destino_cola}. Consulta la REGLA (A6.2) por evento y confirma la cuenta contra el PLAN (B1) y el tercero (N1); sin regla que cubra NO inventa la cuenta — propuesta:null y requiere_cola:true. Exito → publica contabilidad.contrapartida_propuesta y responde por contrapartida-asistida.juzgar.response; hecho/project_id ausente → contrapartida-asistida.juzgar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contrapartida-asistida.juzgar.response` | Respuesta RPC correlada de contrapartida-asistida.juzgar.request → {request_id, status:200, data:{propuesta, propuesta_por, regla, plan_disponible, plan_confirmado, tercero_disponible, motivo, requiere_cola, destino_cola, disponible}}. Emitida por el helper _atender. |
| `contrapartida-asistida.juzgar.failed` | Par de fallo determinista (A6.1): hecho o project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de contrapartida-asistida.juzgar.request. |
| `contabilidad.contrapartida_propuesta` | Fire-and-forget (A6.1): el juicio de contrapartida quedo resuelto → {project_id, propuesta, propuesta_por, regla, plan_disponible, tercero_disponible, requiere_cola, destino_cola, correlation_id}. Lo consume la regla (A6.2) como corte duro y la cola de excepcion (A8.1) cuando requiere_cola es true. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contrapartida-asistida.juzgar.failed` cierra el círculo de
> `contrapartida-asistida.juzgar.request`: `onJuzgarRequest` lo publica en la rama
> `status !== 200`. Ojo: una duda (sin regla, cuenta fuera del plan) **no** es un
> fallo del contrato — es `200` con `propuesta:null` y `requiere_cola:true`, y se
> publica igualmente `contabilidad.contrapartida_propuesta`.

## Reglas de negocio

1. **El corte duro primero (la REGLA)**: `_juzgar` llama por evento a
   `regla-contrapartida.aplicar.request` (`timeout_ms:4000`). Sin respuesta →
   `propuesta:null`, `plan_disponible:false`, `tercero_disponible:false`,
   `requiere_cola:true`, `disponible:false` con motivo «la regla (A6.2) no respondio».
2. **Sin regla que cubra NO se inventa la cuenta**: si `corte.cubierta` es falso →
   `propuesta:null`, `requiere_cola:true`, `motivo` = el de la regla (o «ninguna regla
   cubre el hecho»), `destino_cola` = el de la regla (o derivado de la naturaleza).
3. **Destino de la cola DERIVADO de la naturaleza**: `naturaleza` (por defecto
   `'CONTABLE'`, se normaliza a mayúsculas) → `NEGOCIO:DUENO`, cualquier otra
   → `ASESOR`. El micro-agente **no decide**, deriva.
4. **El plan manda**: si la regla cubre, se confirma la cuenta contra el plan con
   `catalogo-cuentas.buscar.request` (`timeout_ms:4000`). Si el plan responde y
   `encontrada:false` → **no se propone**: `propuesta:null`, `plan_confirmado:false`,
   `requiere_cola:true`, `destino_cola:'ASESOR'`, motivo
   «la regla apunta a la cuenta <cuenta>, que no esta en el plan declarado».
5. **Tercero confirmado solo si el hecho lo trae y el maestro responde**: `_nifDe(hecho)`
   lee `hecho.tercero.nif ?? hecho.tercero.numero_fiscal` (o el tercero plano) y
   normaliza igual que N1 (mayúsculas, sin separadores). Sin nif o sin respuesta →
   `tercero_disponible:false, tercero:null`; la propuesta NO se aborta por eso.
6. **Propuesta con trazabilidad (sin inventar)**: `propuesta = {cuenta, tercero,
   periodo, base:{regla_id, plan_confirmado, tercero_conocido}}`. `tercero` cae al nif
   del hecho si la regla no declara uno; `periodo` sale del apunte de la regla o queda
   `null`.
7. **`propuesta_por:'REGLA'`** cuando sale de la regla declarada; `null` cuando no hay
   propuesta. El micro-agente no firma como autor: el corte lo fija A6.2.
8. **Validaciones deterministas**: `hecho` ausente/no objeto → `400 INVALID_INPUT`
   (`field:'hecho'`); `project_id` ausente → `400 INVALID_INPUT`
   (`field:'project_id'`).
9. **No escribe ni persiste**: sin store, sin PosPersistencia. Solo consulta por evento
   y publica.
10. **HTTP exacto**: éxito `200` (con o sin propuesta); hecho/project_id inválidos →
    `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `contrapartida-asistida.juzgar.response` y emite
`contabilidad.contrapartida_propuesta`.

### 1. `juzgar` — proponer la contrapartida

```json
{
  "project_id": "e57a318a-...",
  "hecho": {
    "vertical": "pizzepos", "tipo": "compra",
    "tercero": { "nif": "B12345678" },
    "fecha": "2026-09-01", "importe": 121, "concepto": "harina"
  },
  "naturaleza": "CONTABLE",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (la regla cubre y el plan confirma):
```json
{
  "project_id": "e57a318a-...",
  "propuesta": { "cuenta": "600", "tercero": "B12345678", "periodo": "2026-09", "base": { "regla_id": "r1", "plan_confirmado": true, "tercero_conocido": true } },
  "propuesta_por": "REGLA",
  "regla": { "id": "r1", "condicion": { "tercero_nif": "B12345678" }, "origen": "APRENDIDA" },
  "plan_disponible": true, "plan_confirmado": true, "tercero_disponible": true,
  "requiere_cola": false, "destino_cola": null, "disponible": true
}
```

Emite `contabilidad.contrapartida_propuesta`:
```json
{ "project_id": "e57a318a-...", "propuesta": { "...": "..." }, "propuesta_por": "REGLA", "regla": { "...": "..." }, "plan_disponible": true, "tercero_disponible": true, "requiere_cola": false, "destino_cola": null, "correlation_id": "abc-123" }
```

### 2. Sin regla que cubra — no se inventa la cuenta

Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "propuesta": null, "propuesta_por": null, "regla": null, "plan_disponible": true, "tercero_disponible": false, "motivo": "ninguna regla cubre el hecho: no se inventa la cuenta", "requiere_cola": true, "destino_cola": "ASESOR", "disponible": true }
```

### 3. Cuenta fuera del plan — el plan manda

Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "propuesta": null, "propuesta_por": null, "regla": { "id": "r1", "...": "..." }, "plan_disponible": true, "plan_confirmado": false, "tercero_disponible": false, "motivo": "la regla apunta a la cuenta 600, que no esta en el plan declarado", "requiere_cola": true, "destino_cola": "ASESOR", "disponible": true }
```

### 4. Fallo — falta el hecho

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `contrapartida-asistida.juzgar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hecho requerido", "details": { "field": "hecho" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/contrapartida-asistida.test.js`.
Cubre:

- `juzgar` con regla que cubre y plan que confirma → `200 propuesta_por:'REGLA'`,
  `plan_confirmado:true`, `requiere_cola:false` y emite
  `contabilidad.contrapartida_propuesta`.
- `juzgar` sin regla que cubra (`cubierta:false`) → `propuesta:null`,
  `requiere_cola:true`, `destino_cola:'ASESOR'`.
- Regla que apunta a una cuenta fuera del plan (`encontrada:false`) → `propuesta:null`
  con motivo de plan y `requiere_cola:true`.
- Regla (A6.2) que no responde → `disponible:false`, `requiere_cola:true`; con
  `naturaleza:'NEGOCIO'` → `destino_cola:'DUENO'`.
- `hecho` o `project_id` ausente → `400 INVALID_INPUT` +
  `contrapartida-asistida.juzgar.failed`.
- `toolJuzgar` devuelve la misma proyección que `_juzgar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ContrapartidaAsistida extends ModuloHibridoReflejo`; `name =
  'contrapartida-asistida'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin
  store, sin `onProjectActivated` (MICRO-AGENTE stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/contrapartida-asistida/`).
- `onJuzgarRequest` usa `this._atender(e, 'juzgar',
  'contrapartida-asistida.juzgar.response', async (d) => {...})`; dentro hace el cierre
  de círculo: en `200` publica `contabilidad.contrapartida_propuesta`, si no
  `contrapartida-asistida.juzgar.failed`.
- Proyección única `_juzgar(input)` → `{status, data}`, `async` porque consulta la
  regla, el plan y el maestro por evento (`this._rpc`, `timeout_ms:4000`). Helper
  `_nifDe(hecho)`. Tool directa `toolJuzgar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: consulta `regla-contrapartida` (A6.2), `catalogo-cuentas` (B1) y
  `maestro-terceros` (N1) por evento; lo consumen `regla-contrapartida` como corte y
  `encolado-excepcion` (A8.1) cuando `requiere_cola` es `true`.
