---
name: valor-neto-contable
description: >
  Skill FULL del módulo REFLEJO `valor-neto-contable` de la vertical contabilidad de Enki.
  VALOR NETO CONTABLE = COSTE − AMORTIZACIÓN ACUMULADA: cálculo puro y determinista, el valor
  que va al BALANCE. El coste es parámetro declarable; la acumulada se agrega de las cuotas de
  plan-amortizacion POR EVENTO. Sin ninguna de las dos piezas → `vnc:null` y `[ABIERTO]`, sin
  estimar. Sin estado. Úsala para operar, depurar o extender el reflejo, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el valor neto contable de un bien a una fecha (RPC
    valor-neto-contable.calcular.request).
  - Cuando depures por qué el VNC sale `null` (falta coste o falta amortización acumulada:
    `faltan` los nombra), por qué `negativo:true`, o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (determinista, coste declarable, acumulada agregada, dato ausente = desconocido,
    el negativo se declara).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo valor-neto-contable.
tags: [enki, modulo, reflejo, contabilidad, valor-neto-contable]
---

# valor-neto-contable — REFLEJO del valor neto al balance

## Qué hace el módulo

`valor-neto-contable` es un **REFLEJO STATELESS** (F4, hoja del plan):
**VALOR NETO CONTABLE = COSTE − AMORTIZACIÓN ACUMULADA**. Cálculo **PURO**, **determinista**:
misma entrada → mismo valor. Es el valor que va al **BALANCE**.

Atributos del diseño: `coste:ParametroDeclarable` y `amort_acumulada:PlanAmortizacion`.

- El **COSTE** es un **PARÁMETRO DECLARABLE**: entra declarado en la petición (o con la ficha del
  activo). El reflejo **NUNCA** lo estima.
- La **AMORTIZACIÓN ACUMULADA** se **AGREGA** de las **CUOTAS** del plan (`plan-amortizacion` F2)
  **POR EVENTO** — suma pura de lo que la tabla ya declaró, **sin interpretar ninguna cuota**.

**Ni el coste ni la acumulada se estiman**: si falta uno de los dos, el valor neto queda
`[ABIERTO]` (`vnc:null`) y se declara cuál falta — **jamás se rellena con `0`** ni con un default.

Invariantes:

- **DETERMINISTA**: mismo coste + misma acumulada → mismo VNC (una sola respuesta correcta).
- **Dato ausente = desconocido**: sin coste O sin acumulada → `vnc:null` y `abierto:true`. Un valor
  neto **NEGATIVO** no se corrige ni se recorta: se declara tal cual (señal de que la acumulada
  excede el coste — un dato del negocio, no algo que el reflejo tape).
- **NO escribe, NO persiste, NO muta**: las cuotas son de F2.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_calcular`.
Cierra el círculo de error con `valor-neto-contable.calcular.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `valor-neto-contable.calcular.request` | `onCalcularRequest` | RPC reflejo (calculo puro, determinista): {project_id, id_activo?, activo?, fecha?, coste?, amortizacion_acumulada?, cuotas?, periodo?} → {project_id, id_activo, fecha, vnc, coste, amortizacion_acumulada, fuente_coste, fuente_amortizacion, abierto, faltan, motivo, negativo}. El coste es ParametroDeclarable (declarado o en la ficha del activo); la amortizacion acumulada se agrega de las cuotas de plan-amortizacion (F2) POR EVENTO o de cuotas declaradas. Sin coste o sin acumulada → vnc:null y abierto:true con las piezas que faltan (nada se estima). Responde por valor-neto-contable.calcular.response; project_id ausente → valor-neto-contable.calcular.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `valor-neto-contable.calcular.response` | Respuesta RPC correlada de valor-neto-contable.calcular.request → {request_id, status:200, data:{vnc, coste, amortizacion_acumulada, faltan, abierto, negativo}}. Emitida por el helper _atender. |
| `valor-neto-contable.calcular.failed` | Par de fallo determinista (F4): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de valor-neto-contable.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `valor-neto-contable.calcular.failed` cierra el círculo de
> `valor-neto-contable.calcular.request` cuando `_calcular` devuelve status ≠ 200 (el único
> camino: `400 INVALID_INPUT` por `project_id` ausente).

> Nota de honestidad (cruce con `index.js`): `onCalcularRequest` publica el par `failed` **solo si
> `res.status !== 200`**; el camino de éxito lo cierra `_atender` con
> `valor-neto-contable.calcular.response`. Un VNC `[ABIERTO]` (`vnc:null`) sigue siendo un `200`.

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js` en `_amortizacion`** la RPC saliente
> `plan-amortizacion.cuota_del_periodo.request` (`{project_id, id_activo, periodo, hasta: fecha}`,
> `timeout_ms:4000`) — es una **DEP por evento**, no un evento emitido.

> Nota: el módulo expone `toolCalcular(params)` como **tool directa** — no es un evento del bus,
> no figura en `module.json`. Tampoco figuran `_coste`, `_amortizacion`, `_suma`, `_num` ni
> `_round` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **`id_activo` y `fecha` son etiquetas**: `id_activo` de `input.id_activo` o
   `input.activo.id_activo` (trim) o `null`; `fecha` como string o `null`. No estiman nada.
3. **El COSTE se resuelve en `_coste`**, declarando `fuente_coste`:
   - `input.coste` numérico → `fuente_coste:'declarado'`.
   - si no, `input.activo.valor` numérico → `fuente_coste:'activo_declarado'`.
   - si no → `{coste:null, fuente_coste:null}`. **Sin coste declarado NO se estima** (jamás se lee
     por una puerta que no sea de lectura).
4. **La AMORTIZACIÓN ACUMULADA se resuelve en `_amortizacion`**, declarando
   `fuente_amortizacion`, en este orden:
   - `input.amortizacion_acumulada` o `input.amort_acumulada` numérica → `'declarada'`.
   - `input.cuotas` array → **se AGREGA** la suma (2 decimales) → `'cuotas_declaradas'`.
   - sin `id_activo` → `{acumulada:null, fuente_amortizacion:null}`.
   - si no, RPC `plan-amortizacion.cuota_del_periodo.request` **por evento**; si la tabla llega como
     `data.cuotas` array → se agrega (suma de `importe` o `cuota`) → `'plan-amortizacion'`; si llega
     `data.acumulada` numérica → `'plan-amortizacion'`; si no → `{acumulada:null, ...}`.
   - **Suma pura, sin interpretar ninguna cuota.**
5. **La suma de cuotas** (`_suma`): `Σ _num(c.importe ?? c.cuota) || 0`, redondeada a 2.
6. **`faltan` nombra las piezas ausentes**: `'coste'` si `coste === null`;
   `'amortizacion_acumulada'` si `acumulada === null`.
7. **El VNC solo existe con las dos piezas**: `vnc = _round(coste − acumulada, 2)` si
   `faltan.length === 0`; si no, `vnc:null`, `abierto:true` y
   `motivo:'no se estima el valor neto: falta <piezas>'`.
8. **El NEGATIVO se declara, no se recorta**: `negativo = (vnc !== null) ? (vnc < 0) : null`.
9. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
   `onProjectActivated`.
10. **HTTP exacto**: éxito `200` (con `vnc` o `[ABIERTO]`); `project_id` ausente → `400`; excepción
    en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `valor-neto-contable.calcular.response`; el error cierra con
`valor-neto-contable.calcular.failed`.

### 1. `calcular` — coste y cuotas declaradas

```json
{
  "project_id": "e57a318a-...",
  "id_activo": "MAQ-01",
  "fecha": "2026-09-30",
  "coste": 48000,
  "cuotas": [ { "periodo": "2026-01", "importe": 4800 }, { "periodo": "2026-02", "importe": 4800 } ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...", "id_activo": "MAQ-01", "fecha": "2026-09-30",
  "vnc": 38400, "coste": 48000, "amortizacion_acumulada": 9600,
  "fuente_coste": "declarado", "fuente_amortizacion": "cuotas_declaradas",
  "abierto": false, "faltan": [], "motivo": null, "negativo": false
}
```

### 2. `calcular` — la acumulada se agrega del plan (F2) por evento

```json
{ "project_id": "e57a318a-...", "id_activo": "MAQ-01", "fecha": "2026-09-30", "coste": 48000 }
```

Con `plan-amortizacion` devolviendo `acumulada:9600` → `200` con
`fuente_amortizacion:'plan-amortizacion'` y `vnc:38400` (**suma pura, sin interpretar la cuota**).

### 3. `calcular` — falta una pieza → `[ABIERTO]`

Sin coste → `200` con `vnc:null`, `faltan:["coste"]`, `abierto:true` y
`motivo:'no se estima el valor neto: falta coste'`. **Nunca `vnc:0`.**

### 4. VNC negativo — se declara, no se recorta

Con `coste:48000` y `amortizacion_acumulada:52000` → `vnc:-4000`, `negativo:true`,
`abierto:false`. El reflejo **declara** la señal (acumulada > coste) sin taparla.

### 5. Fallo — falta `project_id`

Respuesta `400` + `valor-neto-contable.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/valor-neto-contable.test.js`. Cubre:

- `calcular` con coste declarado y cuotas declaradas → `vnc = coste − suma`, `faltan:[]`,
  `abierto:false`.
- La acumulada pedida a `plan-amortizacion` por evento (lista `cuotas` o `acumulada`) →
  `fuente_amortizacion:'plan-amortizacion'`.
- Sin coste o sin acumulada → `vnc:null`, `faltan` los nombra, `motivo` declarado (**nada se
  estima**; nunca `0`).
- Coste desde la ficha del activo (`input.activo.valor`) → `fuente_coste:'activo_declarado'`.
- VNC negativo → `negativo:true` y el valor **declarado tal cual** (no se recorta).
- `project_id` ausente → `400 INVALID_INPUT` + `.calcular.failed`.
- **NO ESCRIBE**: ninguna llamada persiste ni muta (stateless).
- `toolCalcular` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ValorNetoContable extends ModuloHibridoReflejo`; `name = 'valor-neto-contable'`,
  `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/valor-neto-contable/`).
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'valor-neto-contable.calcular.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_calcular(input)` (**async**: puede pedir F2 por evento); helpers `_coste`,
  `_amortizacion`, `_suma`, `_num`. Tool `toolCalcular`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `plan-amortizacion.cuota_del_periodo.request` (F2) por EVENTO. Lo consume el
  balance y `baja-activo` (F3) vía `valor-neto-contable.calcular.request`.
- **PARÁMETRO COMO DATO**: el coste es **declarable** (petición o ficha del activo); la acumulada
  es la que la tabla declaró. El reflejo **no estima ninguna de las dos**: sin una pieza, `vnc:null`
  y `[ABIERTO]`. Un negativo **se declara**, no se recorta.
