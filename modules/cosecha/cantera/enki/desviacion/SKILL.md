---
name: desviacion
description: >
  Skill FULL del módulo REFLEJO `desviacion` de la vertical contabilidad de Enki.
  REAL VS PRESUPUESTO determinista: el delta contra el objetivo que el JEFE declaró (leído
  de J3 por evento, nunca duplicado); solo avisa si un umbral DECLARADO se supera y sin real
  u objetivo no computa nada. Sin estado. Úsala para operar, depurar o extender el reflejo,
  o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites la desviación real vs presupuesto de una dimensión y periodo (RPC
    desviacion.calcular.request).
  - Cuando depures por qué `desviacion:null` (`abierto:true`, falta real u objetivo) o por
    qué `avisa:false` aunque la desviación sea grande (no hay umbral declarado).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del reflejo (determinista, presupuesto no duplicado, umbral declarable, no escribe ni
    persiste).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo desviacion.
tags: [enki, modulo, reflejo, contabilidad, desviacion]
---

# desviacion — REFLEJO STATELESS de real vs presupuesto

## Qué hace el módulo

`desviacion` es un **REFLEJO STATELESS** (J4, hoja del plan): **REAL VS PRESUPUESTO** — la
desviación de lo que ha pasado contra lo que el **JEFE declaró**. Cálculo **PURO** y
**DETERMINISTA**: `delta = real − objetivo`, con signo declarado
(`DESVIACION_POSITIVA` si el real va por encima del objetivo, `DESVIACION_NEGATIVA` si por
debajo, `NULA` si coinciden).

Atributos del diseño: `real`, `presupuesto:Presupuesto`, `umbral:Umbral`.
Métodos: `calcular(d, periodo):Delta`. Regla: **real vs presupuesto → dispara aviso SI se
sale del umbral declarado.**

**EL PRESUPUESTO NO SE DUPLICA**: el objetivo sale de `presupuesto` (J3) **POR EVENTO**
(`presupuesto.objetivo.request`, best-effort) o declarado en la petición. Este módulo **NO
guarda** objetivos ni los infiere — solo los **RESTA** contra el real. El real sale
declarado en la petición o de `margen-analitico` (J2) **POR EVENTO**
(`margen-analitico.calcular.request`); aquí **NO se recalcula** el margen ni el resultado.

**EL UMBRAL ES DECLARABLE**: sin umbral declarado (ni en la petición ni en el objetivo de
J3) **NO se afirma que haya que avisar** — `avisa:false` con el motivo declarado. **Cero
porcentajes cableados**: un umbral inventado dispararía avisos que el jefe no pidió.

Invariantes:

- **DETERMINISTA**: mismo real + mismo objetivo + mismo umbral → misma desviación.
- **Dato ausente = desconocido**: sin real o sin objetivo declarado → `desviacion:null`,
  `abierto:true` (no se computa contra `0`: un objetivo `0` no declarado **no es** un
  objetivo `0`).
- **LEY/PARÁMETRO COMO DATO**: el objetivo y el umbral son datos declarados; cero constantes.
- **NO escribe, NO persiste, NO muta**: la desviación es un **DERIVADO**. Sin
  `PosPersistencia` ni `project.activated`.

Escucha `contabilidad.presupuesto_fijado` (fire-and-forget) **solo como señal/espejo en
memoria** para no re-preguntar a J3 — **no es parcela**. Proyección `_calcular` (async).
Publica `contabilidad.desviacion` cuando hay que avisar (lo consume `motor-avisos` K2). Tool
`toolCalcular`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `desviacion.calcular.request` | `onCalcularRequest` | RPC reflejo (calculo puro, determinista): {project_id, dimension, periodo, real?/margen?, objetivo?, umbral?, destino?} → {project_id, dimension, periodo, fuente_objetivo:'declarado'\|'presupuesto_fijado'\|'presupuesto', fuente_real:'declarado'\|'margen-analitico', objetivo, real, umbral, umbral_declarado, desviacion, desviacion_relativa, signo:'DESVIACION_POSITIVA'\|'DESVIACION_NEGATIVA'\|'NULA', avisa, aviso, abierto, faltan, motivo}. Lee el objetivo de presupuesto (J3) y el real de margen-analitico (J2) por EVENTO si no vienen declarados. Sin real o sin objetivo declarado → desviacion:null y abierto:true (no se mide contra un 0 que nadie declaro); sin umbral declarado → avisa:false con motivo. Exito con aviso → publica contabilidad.desviacion; responde por desviacion.calcular.response; project_id ausente → desviacion.calcular.failed. |
| `contabilidad.presupuesto_fijado` | `onPresupuestoFijado` | Fire-and-forget (J3 → J4): el JEFE fijo (o dejo abierto) un objetivo → se refleja en un espejo en memoria por proyecto (clave '<periodo>\|<dimension>') para poder medir sin re-preguntar a J3. NO es parcela ni persistencia: el dueño del objetivo sigue siendo presupuesto (J3); no muta nada ni publica evento de dominio. |

### Publishes

| Evento | Descripción |
|---|---|
| `desviacion.calcular.response` | Respuesta RPC correlada de desviacion.calcular.request → {request_id, status:200, data:{desviacion, signo, avisa, aviso, objetivo, real, umbral, faltan}}. Emitida por el helper _atender. |
| `desviacion.calcular.failed` | Par de fallo determinista (J4): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de desviacion.calcular.request. |
| `contabilidad.desviacion` | Fire-and-forget (J4): la desviacion se salio del UMBRAL DECLARADO y hay que avisar → {project_id, desviacion, dimension, periodo, umbral, aviso, correlation_id}. Lo consume motor-avisos (K2) para producir el aviso. Sin umbral declarado NO se emite. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `desviacion.calcular.failed` cierra el círculo de `desviacion.calcular.request` cuando
> `_calcular` devuelve status ≠ 200 (`400`, `project_id` ausente). El fire-and-forget
> `onPresupuestoFijado` **no** tiene par `failed`: no es una petición — devuelve `null` y no
> publica evento de dominio.

> Nota de honestidad (cruce con `index.js`): `onCalcularRequest` publica
> `contabilidad.desviacion` **solo si `res.data.avisa && res.data.aviso`** (con el payload
> `{project_id, desviacion, dimension, periodo, umbral, aviso, correlation_id}`); con
> `status !== 200` publica `desviacion.calcular.failed`; con `200` sin aviso **no emite
> evento de dominio**.

> Nota: el módulo pide a `presupuesto.objetivo.request` (J3) y a
> `margen-analitico.calcular.request` (J2) **POR EVENTO** (dependencias salientes) — no
> figuran como subscripción en `module.json`. Tampoco figuran `_objetivo`, `_real`, `_umbral`,
> `_clave` ni `_num`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). `dimension` con `_clave(input.dimension ??
   input.centro ?? input.linea ?? input.producto)`; `periodo` con `String(...).trim()` o
   `null`.
2. **El OBJETIVO** (`_objetivo`), en orden:
   - `input.objetivo` numérico → `fuente_objetivo:'declarado'`.
   - `input.presupuesto` objeto con clave `\`${periodo}|${dimension}\`` → `'declarado'`.
   - Espejo en memoria (`this._objetivos`, poblado por `onPresupuestoFijado`) con valor no
     `null` → `'presupuesto_fijado'`.
   - Si no, **POR EVENTO** `presupuesto.objetivo.request` (`{project_id, dimension, periodo}`,
     `timeout_ms:4000`) → lee `data.objetivo.valor` (o `data.valor`) → `'presupuesto'`.
   - Sin respuesta → `{objetivo:null, fuente_objetivo:null}`.
3. **El REAL** (`_real`): `input.real` (o `input.margen`) numérico → `fuente_real:'declarado'`.
   Si no, **POR EVENTO** `margen-analitico.calcular.request` (`{project_id, periodo,
   dimension, eje}`, `timeout_ms:4000`); con `dimension`, se busca la cubeta de
   `data.por_dimension` por `_clave(x.dimension) === dimension` y se lee su `margen`; sin
   dimensión se lee `data.margen_total`. **Aquí NO se recalcula el margen.**
4. **El UMBRAL** (`_umbral`): `_num(input.umbral)`; si no, el `umbral` del objetivo traído de
   J3; si no, `null`. **Cero porcentajes cableados.**
5. **Sin real o sin objetivo NO se computa nada**: `real === null || objetivo === null` →
   `200` con `desviacion:null`, `desviacion_relativa:null`, `signo:null`, `avisa:false`,
   `aviso:null`, `abierto:true`, `faltan` con `'real'` y/o `'objetivo'` y
   `motivo:'no se computa desviacion: falta <faltan> (no se mide contra un 0 que nadie
   declaro)'`.
6. **El delta**: `delta = round(real − objetivo, 2)`. Signo: `> 0` →
   `'DESVIACION_POSITIVA'`; `< 0` → `'DESVIACION_NEGATIVA'`; `= 0` → `'NULA'`. Relativa:
   `objetivo !== 0 ? round(delta / Math.abs(objetivo), 4) : null`.
7. **El AVISO (solo con umbral DECLARADO)**: `avisa = umbral !== null &&
   Math.abs(delta) > umbral`. Si avisa, `aviso` es `{tipo:'DESVIACION', dimension, periodo,
   real, objetivo, umbral, desviacion, signo, destino, destino_declarado, emitido_en}` — el
   `destino` lo declara el jefe (`input.destino`); **aquí no se inventa quién actúa**.
8. **Sin umbral la desviación se mide pero no se avisa**: `faltan:['umbral']` y
   `motivo:'la desviacion se mide, pero no se avisa: no hay umbral declarado por el jefe'`.
   `umbral_declarado = umbral !== null`.
9. **El espejo** (`onPresupuestoFijado`): sin `project_id` → `null`; clave
   `o.clave ?? \`${periodo}|${dimension}\``; guarda `{clave, dimension, periodo, valor:
   _num(o.valor), umbral: _num(o.umbral)}` en `this._objetivos` (`Map<project_id,
   Map<clave, Objetivo>>`). **No muta nada ni publica evento de dominio.**
10. **Redondeo a 2 decimales** (`_round`) del delta; relativa a 4.
11. **`_clave(v)`**: `null`/`''` → `null`; objeto → `v.id ?? v.clave ?? v.nombre ??
    v.dimension ?? v.centro ?? v.linea ?? v.producto` (recursivo); si no → `String(v)`.
12. **`_num(v)`**: `undefined`/`null`/`''` → `null`; no finito → `null`.
13. **Puro**: sin estado persistente, sin persistencia, sin reloj salvo `emitido_en` del
    aviso, sin azar. El espejo es **memoria volátil**, no parcela.
14. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `desviacion.calcular.response`; emite `contabilidad.desviacion` **solo si hay
aviso**.

### 1. `calcular` — la desviación con aviso

```json
{
  "project_id": "e57a318a-...",
  "dimension": "C1",
  "periodo": "2026-09",
  "real": 17000,
  "objetivo": 15000,
  "umbral": 1200,
  "destino": "jefe-operaciones",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "dimension": "C1",
  "periodo": "2026-09",
  "fuente_objetivo": "declarado",
  "fuente_real": "declarado",
  "objetivo": 15000,
  "real": 17000,
  "umbral": 1200,
  "umbral_declarado": true,
  "desviacion": 2000,
  "desviacion_relativa": 0.1333,
  "signo": "DESVIACION_POSITIVA",
  "avisa": true,
  "aviso": { "tipo": "DESVIACION", "dimension": "C1", "periodo": "2026-09", "real": 17000, "objetivo": 15000, "umbral": 1200, "desviacion": 2000, "signo": "DESVIACION_POSITIVA", "destino": "jefe-operaciones", "destino_declarado": true, "emitido_en": "2026-09-30T..." },
  "abierto": false,
  "faltan": [],
  "motivo": null
}
```

Emite `contabilidad.desviacion` (lo consume `motor-avisos` K2):

```json
{ "project_id": "e57a318a-...", "desviacion": 2000, "dimension": "C1", "periodo": "2026-09", "umbral": 1200, "aviso": { "...": "..." }, "correlation_id": "abc-123" }
```

### 2. Sin umbral declarado — se mide pero **no se avisa**

`200` con `desviacion:2000`, `avisa:false`, `aviso:null`, `faltan:['umbral']` y
`motivo:'la desviacion se mide, pero no se avisa: no hay umbral declarado por el jefe'`.
**No se emite `contabilidad.desviacion`.**

### 3. Sin real u objetivo — `desviacion:null` (`[ABIERTO]`)

Sin objetivo declarado y sin respuesta de J3 → `200` con `desviacion:null`,
`abierto:true`, `faltan:['objetivo']` y el motivo. **No se mide contra un 0 que nadie
declaró.**

### 4. Fire-and-forget — reacción a `contabilidad.presupuesto_fijado`

`onPresupuestoFijado` refleja el objetivo en el espejo en memoria (clave
`'<periodo>|<dimension>'`) para medir sin re-preguntar a J3; **no muta** la parcela de J3 ni
publica evento de dominio. Sin `project_id` o sin clave → devuelve `null`.

### 5. Fallo — falta `project_id`

Respuesta `400` + `desviacion.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/desviacion.test.js`. Cubre:

- `calcular` con real, objetivo y umbral declarados → `200` con `desviacion`, `signo` y
  emite `contabilidad.desviacion` si se sale del umbral.
- Sin umbral declarado → `desviacion` medida pero `avisa:false`, `faltan:['umbral']` y
  **sin** evento de aviso.
- Sin real u objetivo → `desviacion:null`, `abierto:true` (**no se mide contra 0**).
- Objetivo leído de J3 por evento (`presupuesto.objetivo.request`) → `fuente_objetivo:
  'presupuesto'`; real leído de J2 por evento → `fuente_real:'margen-analitico'`.
- Signo: por encima → `DESVIACION_POSITIVA`, por debajo → `DESVIACION_NEGATIVA`, igual →
  `NULA`.
- `onPresupuestoFijado` refleja el objetivo en el espejo (no muta, devuelve `null`).
- **Determinismo**: mismo real + mismo objetivo + mismo umbral → misma desviación.
- `project_id` ausente → `400 INVALID_INPUT` + `desviacion.calcular.failed`.
- `toolCalcular` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `Desviacion extends ModuloHibridoReflejo`; `name = 'desviacion'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store persistente, sin
  `onProjectActivated` (REFLEJO stateless). Espejo volátil `this._objetivos`
  (`Map<project_id, Map<clave, Objetivo>>`).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/desviacion/`).
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'desviacion.calcular.response',
  async (d) => {...})` con cierre de círculo (evento de aviso en `200` con `avisa`, par
  `failed` si no). `onPresupuestoFijado` **no** usa `_atender`.
- Proyección `_calcular(input)` (async: pide objetivo a J3 y real a J2 por evento); helpers
  `_objetivo`, `_real`, `_umbral`, `_clave`, `_num`. Tool `toolCalcular`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- **DEP**: lee `presupuesto.objetivo.request` (J3) y `margen-analitico.calcular.request` (J2)
  por EVENTO; observa `contabilidad.presupuesto_fijado` (J3). Emite `contabilidad.desviacion`
  (lo consume `motor-avisos` K2). Lo consume `comparador-periodos` (J9) en modo
  `real_vs_presupuesto` por EVENTO.
- **PARÁMETRO COMO DATO**: el objetivo y el umbral son **declarables** (en la petición o en
  J3); el código **no cablea ningún porcentaje** de aviso. El objetivo **no se duplica**: se
  lee de su dueño por evento.
