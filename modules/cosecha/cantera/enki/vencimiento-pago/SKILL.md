---
name: vencimiento-pago
description: >
  Skill FULL del módulo REFLEJO `vencimiento-pago` de la vertical contabilidad de Enki.
  FECHA DE VENCIMIENTO POR FACTURA DESDE LA POLÍTICA DECLARADA: un solo tipo Vencimiento con DOS
  LADOS (pago/cobro), determinista, con los plazos entrando como DATO y sin estimar ninguna fecha
  cuando la política no se declara ([ABIERTO]). Sin estado. Úsala para operar, depurar o extender
  el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites la fecha de vencimiento de una factura (RPC
    vencimiento-pago.calcular.request).
  - Cuando depures por qué `fecha_vencimiento:null` y el campo aparece en `abierto`
    (`politica`/`plazo`/`fecha_base`/`lado`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    vencimiento (plazos declarables, ley como dato, sin festivos cableados, un vencimiento =
    una factura).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo vencimiento-pago.
tags: [enki, modulo, reflejo, contabilidad, vencimiento-pago]
---

# vencimiento-pago — REFLEJO STATELESS del vencimiento por factura

## Qué hace el módulo

`vencimiento-pago` es un **REFLEJO STATELESS** (N6, hoja del plan): la **FECHA DE
VENCIMIENTO POR FACTURA DESDE LA POLÍTICA DECLARADA**. Calcula, de forma **determinista**,
cuándo vence cada factura (**lado pago y lado cobro**) aplicando los **PLAZOS DECLARABLES**:
días de vencimiento, base de cómputo (emisión / recepción), calendario natural / laborable.

**LOS PLAZOS SON DECLARABLES (LEY COMO DATO, invariante 5)**: **NO hay ningún plazo
cableado** — ni «30 días», ni «60 días», ni un calendario de vencimientos estándar. Si la
**política NO se declara**, la fecha de vencimiento queda **`[ABIERTO]`**
(`fecha_vencimiento:null`, `abierto:['politica'|'plazo'|'fecha_base'|'lado']`): **NADA se
estima**. El módulo **nunca supone un plazo comercial**.

Alimenta `prevision-caja` (E5) y la antigüedad de saldos (N8) vía el tipo **`Vencimiento`**:
**un solo tipo con DOS LADOS** (pago/cobro) — el **lado es dato declarado**.

Invariantes:

- **Determinista**: misma factura + misma política → misma fecha de vencimiento.
- **Dato ausente = desconocido**: sin política declarada, sin fecha base, la fecha queda
  `null`.
- La **clave natural del vencimiento es la de la factura**: **un vencimiento = una factura**.
- **NO escribe, NO persiste, NO muta.** Sin `PosPersistencia` ni `project.activated`: **no es
  custodio**.
- **Sin festivos cableados**: un calendario no natural solo salta **fin de semana**; los
  festivos son **dato declarable** que **NO se asume**.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `vencimiento-pago.calcular.request` | `onCalcularRequest` | RPC reflejo (calculo puro, determinista): {project_id, factura:{clave_natural?, importe?, fecha_emision?, fecha_recepcion?, lado?, politica?}, lado?, politica?:{dias, base?, calendario?}, base?, hoy?} → {project_id, factura:{clave_natural, importe}, vencimiento:{clave_natural, lado:'pago'\\|'cobro', fecha_emision, fecha_base, base, dias, calendario, fecha_vencimiento, importe, dias_hasta_vencimiento, vencido}, politica_declarada, completo, abierto:[...], alimenta:['prevision-caja','antiguedad-de-saldos']}. Sin politica o sin plazo declarado la fecha_vencimiento queda null y el campo va en `abierto` ([ABIERTO], no se estima). Exito → publica contabilidad.vencimiento_proximo y responde por vencimiento-pago.calcular.response; project_id o factura ausente → vencimiento-pago.calcular.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `vencimiento-pago.calcular.response` | Respuesta RPC correlada de vencimiento-pago.calcular.request → {request_id, status:200, data:{vencimiento, politica_declarada, completo, abierto, alimenta}}. Emitida por el helper _atender. |
| `vencimiento-pago.calcular.failed` | Par de fallo determinista (N6): project_id o factura ausente → {status, error:{code, message, details?}}. Cierra el circulo de vencimiento-pago.calcular.request. |
| `contabilidad.vencimiento_proximo` | Fire-and-forget (N6): un vencimiento quedo calculado (o declarado [ABIERTO] si falta la politica) → {project_id, vencimiento, lado, fecha_vencimiento, abierto, correlation_id}. Lo LEEN prevision-caja (E5) y antiguedad-de-saldos (N8). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `vencimiento-pago.calcular.failed` cierra el círculo de
> `vencimiento-pago.calcular.request` cuando `_calcular` devuelve status ≠ 200 (`400`,
> `project_id` o `factura` ausente).

> Nota de honestidad (cruce con `index.js`): `onCalcularRequest` publica
> `contabilidad.vencimiento_proximo` **solo si `_calcular` devuelve `200`** — lo que incluye
> el caso `[ABIERTO]` (sin política): el payload lleva `abierto` declarando lo que falta. En
> ese caso `vencimiento.lado` y `vencimiento.fecha_vencimiento` pueden ser `null`. La rama
> `else` publica `vencimiento-pago.calcular.failed`.

## Reglas de negocio

1. **El LADO es dato declarado**: `lado = input.lado` (minúsculas, trim) si viene; si no,
   `factura.lado`. Es **un solo tipo `Vencimiento` con dos lados** (`'pago'` / `'cobro'`);
   ausente → `null` y se añade `'lado'` a `abierto`.
2. **La POLÍTICA es declarable y obligatoria para calcular**: `politica = input.politica`
   (objeto) si viene; si no, `factura.politica`. Sin política → `abierto:['politica']` y
   **no hay fecha**. `politica_declarada` refleja `Boolean(politica)`.
3. **La base de cómputo es declarable**: `base = input.base` si viene; si no,
   `politica.base`; si no, **`'emision'`**. La base por defecto es un *default declarado*, no
   una ley.
4. **La fecha base sale del hecho por el nombre de campo** (`_fechaDe`):
   `emision` → `factura.fecha_emision ?? factura.fecha ?? input.fecha_emision`;
   `recepcion` → `factura.fecha_recepcion ?? input.fecha_recepcion`;
   `base` → `factura.fecha_base ?? input.fecha_base`; para otros nombres se lee
   `factura[campo]`. Una fecha ilegible (`Date.parse` no finito) o ausente → `null`. Las
   fechas se normalizan a `YYYY-MM-DD`.
5. **Sin fecha base no hay fecha**: `abierto` incluye `'fecha_base'` si no se pudo resolver.
6. **Sin plazo declarado no hay fecha**: si `politica.dias` es `undefined`/`null` →
   `abierto:['plazo']`; la fecha solo se calcula si `dias` es un número finito
   (`Number.isFinite`). **Ningún plazo por defecto.**
7. **Cálculo de la fecha** (`_sumarDias`): con calendario `'natural'` (default mecánico) es
   **aritmética pura** (`t + dias * 86400000`). Con calendario **no natural** se salta
   **solo fin de semana** iterando día a día; **no se cablea ningún festivo** — los festivos
   son dato declarable que **no se asume**.
8. **Calendario declarable** (`_calendario`): `politica.calendario` normalizado a minúsculas;
   sin declarar → `'natural'`. El valor se refleja en `vencimiento.calendario` (o `null` si
   no hay política).
9. **Días hasta el vencimiento** (`_diffDias`): solo si hay `fecha_vencimiento` **y** `hoy`
   (`input.hoy`, declarable) → `round((vencimiento - hoy) / 86400000)`; si no → `null`.
10. **`vencido`**: `dias_hasta_vencimiento < 0` si se pudo calcular; si no → `null`
    (**dato ausente = desconocido**).
11. **Importe**: `factura.importe` numérico finito → redondeado a 2; si no → `null`.
12. **Clave natural**: la de la factura (`factura.clave_natural`), o `null` —
    **un vencimiento = una factura**.
13. **`completo`**: `abierto.length === 0`. Cualquier campo en `abierto` marca la respuesta
    como **incompleta** (faltan datos declarados).
14. **`alimenta:['prevision-caja','antiguedad-de-saldos']`**: se declara a quién sirve.
15. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`). La factura es obligatoria:
    `input.factura || input.f || input.hecho`; ausente/no objeto → `400 INVALID_INPUT`
    (`field:'factura'`).
16. **Puro**: sin estado, sin persistencia, sin reloj (el `hoy` es declarado).
17. **HTTP exacto**: éxito `200`; `project_id` o `factura` ausentes → `400`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `vencimiento-pago.calcular.response` y emite
`contabilidad.vencimiento_proximo`.

### 1. `calcular` — la fecha de vencimiento

```json
{
  "project_id": "e57a318a-...",
  "factura": { "clave_natural": "proveedor-x:factura:2026-0001", "importe": 1210.5, "fecha_emision": "2026-09-01" },
  "lado": "pago",
  "politica": { "dias": 30, "base": "emision", "calendario": "natural" },
  "hoy": "2026-09-25",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "factura": { "clave_natural": "proveedor-x:factura:2026-0001", "importe": 1210.5 },
  "vencimiento": {
    "clave_natural": "proveedor-x:factura:2026-0001",
    "lado": "pago",
    "fecha_emision": "2026-09-01",
    "fecha_base": "2026-09-01",
    "base": "emision",
    "dias": 30,
    "calendario": "natural",
    "fecha_vencimiento": "2026-10-01",
    "importe": 1210.5,
    "dias_hasta_vencimiento": 6,
    "vencido": false
  },
  "politica_declarada": true,
  "completo": true,
  "abierto": [],
  "alimenta": ["prevision-caja", "antiguedad-de-saldos"]
}
```

Emite `contabilidad.vencimiento_proximo`:

```json
{ "project_id": "e57a318a-...", "vencimiento": { "...": "..." }, "lado": "pago", "fecha_vencimiento": "2026-10-01", "abierto": [], "correlation_id": "abc-123" }
```

### 2. Sin política declarada — `[ABIERTO]` (no se estima)

Sin `politica` → `fecha_vencimiento:null`, `abierto:['politica']`, `completo:false`.
**El módulo nunca supone un plazo comercial** (ni 30 ni 60 días).

### 3. Calendario laborable

Con `politica.calendario:'laborable'` se saltan **solo** los fines de semana (iterando día a
día); **no se cablea ningún festivo**. El resultado es determinista.

### 4. Fallo — falta la factura

Respuesta `400` + `vencimiento-pago.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "factura requerida", "details": { "field": "factura" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/vencimiento-pago.test.js`. Cubre:

- `calcular` con política declarada → fecha determinista desde `fecha_emision` y emite
  `contabilidad.vencimiento_proximo`.
- Sin política → `fecha_vencimiento:null`, `abierto` contiene `'politica'`, `completo:false`
  (**no se estima**).
- Sin `dias` en la política → `abierto` contiene `'plazo'`.
- Sin fecha base → `abierto` contiene `'fecha_base'`; sin `lado` → `'lado'`.
- Calendario `'laborable'` → salta fin de semana (determinista); `'natural'` → aritmética
  pura.
- `dias_hasta_vencimiento` y `vencido` solo con `hoy` declarado; sin `hoy` → `null`.
- Un vencimiento = una factura: la clave natural es la de la factura.
- `project_id` o `factura` ausentes → `400 INVALID_INPUT` + `.calcular.failed`.
- **Determinismo**: dos llamadas con la misma factura + política → misma fecha.
- `toolCalcular` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `VencimientoPago extends ModuloHibridoReflejo`; `name = 'vencimiento-pago'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/vencimiento-pago/`; es de la vertical **entrada** — el
  `require` relativo es el mismo `../../_shared/...`).
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'vencimiento-pago.calcular.response',
  async (d) => {...})` y dentro hace el cierre de círculo (evento de dominio en `200`, par
  `failed` si no).
- Proyección `_calcular(input)` (**síncrona**, pura); helpers `_fechaDe`, `_calendario`,
  `_sumarDias`, `_diffDias`. Tool `toolCalcular`.
- `_invalid` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: lo LEEN `prevision-caja` (E5) por `vencimiento-pago.calcular.request` y la antigüedad
  de saldos (N8) vía `contabilidad.vencimiento_proximo`.
- **PARÁMETRO COMO DATO**: plazos (`dias`), base de cómputo, calendario, lado y `hoy` son
  **declarables**; el código **no cablea ningún plazo** ni asume ningún calendario de
  vencimientos.
