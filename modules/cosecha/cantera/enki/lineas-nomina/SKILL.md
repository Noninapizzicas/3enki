---
name: lineas-nomina
description: >
  Skill FULL del módulo REFLEJO `lineas-nomina` de la vertical contabilidad de Enki.
  Desglosa el recibo en LÍNEAS EXPLÍCITAS (bruto / retención / cotización del trabajador / neto +
  conceptos declarados) para hacer la nómina EXPLICABLE — conceptos declarables, cero catálogo
  cableado. Sin estado. Úsala para operar, depurar o extender el reflejo, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites desglosar un recibo en líneas explicables (RPC
    lineas-nomina.desglosar.request).
  - Cuando depures por qué la respuesta sale con `lineas:[]` y `abierto:true` (sin recibo ni
    conceptos), por qué `explica_bruto:null` (algún concepto sin signo declarado), por qué un importe
    sale `null` (→ `faltantes`) o por qué falla con 400 INVALID_INPUT (falta `project_id`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (no calcula la nómina, conceptos declarables, signo declarado, consistencia declarada).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo lineas-nomina.
tags: [enki, modulo, reflejo, contabilidad, lineas-nomina]
---

# lineas-nomina — REFLEJO del desglose explicable del recibo

## Qué hace el módulo

`lineas-nomina` es un **REFLEJO STATELESS** (G6, hoja del plan): **DESGLOSE BRUTO / RETENCIÓN /
COTIZACIÓN DEL TRABAJADOR / NETO**. El diseño lo dice literal: `desglosar(n:ReciboNomina):Set<Linea>`.
Hace la nómina **EXPLICABLE** — no un número pelado. **Cálculo PURO, determinista.**

**LOS CONCEPTOS SON DECLARABLES**: vienen del sistema externo **TAL CUAL** (en el recibo o en la
petición). Aquí **NO** hay ningún catálogo de conceptos cableado, ni tipos, ni bases, ni **signos
legales impuestos**. Cada línea de concepto se organiza con **SU signo declarado** (`signo`: +1/−1)
o, si no viene, se declara sin signo (`signo:null`) y **NO se resta ni se suma por su cuenta**.

**ESTE MÓDULO NO CALCULA LA NÓMINA**: los cuatro importes (`bruto`, `retencion`,
`cotizacion_trabajador`, `neto`) se **COPIAN** del recibo (`calculada_aqui:false`,
`calculo_delegado_a:'sistema-de-nomina-externo'`). Lo que se hace es desglosarlos y comprobar que los
conceptos declarados **EXPLICAN el bruto** — esa consistencia se **DECLARA** (`explica_bruto`,
`descuadre`, `suma_conceptos`), **no se corrige**.

Invariante: **dato ausente = desconocido**. El importe que no venga queda `null` y se declara en
`faltantes`; **jamás** se rellena con `0` ni se estima una línea.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_desglosar`.
Cierra el círculo de error con `lineas-nomina.desglosar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `lineas-nomina.desglosar.request` | `onDesglosarRequest` | RPC reflejo (determinista): {project_id, recibo\|nomina\|clave_natural\|empleado+periodo (el recibo ya formado; si falta se pide a recibo-nomina G1 POR EVENTO), conceptos? (DECLARABLES, del sistema externo: [{concepto, importe, signo?, a_cargo?, cantidad?, precio?}])} → {project_id, empleado, periodo, magnitudes:{bruto, retencion, cotizacion_trabajador, neto} (COPIADAS del recibo — no calculadas aqui), lineas_concepto, lineas_magnitud, lineas, conceptos_origen, catalogo_cableado:false, explicable, suma_conceptos, explica_bruto, descuadre, calculada_aqui:false, calculo_delegado_a:'sistema-de-nomina-externo', faltantes, abierto}. Los cuatro importes y los conceptos se copian tal cual; lo ausente queda null y se declara en `faltantes`; la consistencia de lo declarado se declara, no se corrige. Responde por lineas-nomina.desglosar.response; project_id ausente o sin recibo ni conceptos → lineas-nomina.desglosar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `lineas-nomina.desglosar.response` | Respuesta RPC correlada de lineas-nomina.desglosar.request → {request_id, status:200, data:{magnitudes, lineas, explica_bruto, descuadre, faltantes, abierto}}. Emitida por el helper _atender. |
| `lineas-nomina.desglosar.failed` | Par de fallo determinista (G6): project_id ausente (400), sin recibo ni conceptos que desglosar, o excepcion de la proyeccion (500) → {status, error:{code, message, details?}}. Cierra el circulo de lineas-nomina.desglosar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `lineas-nomina.desglosar.failed` cierra el círculo de `lineas-nomina.desglosar.request` cuando
> `_desglosar` devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onDesglosarRequest` publica
> `lineas-nomina.desglosar.failed` **solo si `_desglosar` devuelve status ≠ 200**; en `200` responde
> por `_atender` y **no** emite evento de dominio (este reflejo no tiene fire-and-forget propio).

> Nota: `_desglosar` **pide el recibo al bus** con `this._rpc('recibo-nomina.dar_forma.request', …)`
> cuando no se lo declaran — es una **llamada saliente**, **no** un evento que el módulo publique, y
> por eso **no figura en `module.json`**. Tampoco figuran `_recibo`, `_signo`, `_num`, la constante
> `MAGNITUDES` ni `toolDesglosar`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`).
2. **El RECIBO** (`_recibo`): declarado (`input.recibo || input.nomina` objeto) → `origen_recibo:
   'declarado'`; si no, **pide por evento** a `recibo-nomina.dar_forma.request` (G1) con
   `clave_natural` o `empleado`+`periodo`, `timeout_ms:4000`; si responde →
   `origen_recibo:'recibo-nomina'`.
3. **Sin recibo NI conceptos no hay desglose**: `lineas:[]`, `abierto:true`, `faltantes:['recibo']` y
   `motivo:'no hay recibo ni conceptos que desglosar (nada se estima)'`.
4. **LAS CUATRO MAGNITUDES SE COPIAN** (`MAGNITUDES = ['bruto','retencion',
   'cotizacion_trabajador','neto']`): de `fuente[m]`, con aliasing `cotizacion` → `cotizacion_trabajador`.
   Normalizadas con `_num`; `null` → se apila en `faltantes`. **Nunca se calcula la nómina.**
5. **Los CONCEPTOS son DECLARABLES**: gana `input.conceptos` (array) si viene; si no, los del recibo
   (`fuente.conceptos`); si no, `[]`. Cada concepto se normaliza: un escalar → `{concepto: c}`; un
   objeto → `{concepto, importe, signo, a_cargo, cantidad, precio}`. **Cero catálogo cableado.**
6. **EL SIGNO ES DECLARABLE** (`_signo`): numérico (`<0 → −1`, `>0 → +1`, `0 → null`); texto `+1`,
   `+`, `1`, `positivo`, `devengo`, `haber` → `+1`; `-1`, `-`, `negativo`, `deduccion`, `debe` → `−1`;
   cualquier otra cosa (o ausente) → **`null`** (no se interpreta, no se supone).
7. **Dato ausente = desconocido**: un `importe` no numérico → `null` y `faltantes:
   'conceptos[i].importe'`; **no se rellena con 0**.
8. **Las magnitudes también son líneas**: `lineas_magnitud` da a cada una de las cuatro su línea
   explícita `{tipo:'magnitud', magnitud, concepto, importe, a_cargo}` (solo
   `cotizacion_trabajador` lleva `a_cargo:'trabajador'`). `lineas` = `[...lineas_concepto,
   ...lineas_magnitud]`.
9. **CONSISTENCIA DECLARADA, NO CORREGIDA**: se suman **solo** los conceptos con signo e importe
   (`con_signo`); `suma_conceptos = Σ(signo × importe)` redondeado a 2. Si **todos** los conceptos
   tienen signo y la lista no está vacía → `explica_bruto = (suma_conceptos === bruto)` y `descuadre
   = suma_conceptos − bruto`; en cualquier otro caso **ambos `null`**. **Nada se ajusta.**
10. **`explicable`** = `lineas_concepto.length > 0` (la nómina deja de ser un número pelado).
11. **`conceptos_origen`**: `'declarados'` si vinieron en la petición; `'recibo'` si vinieron en el
    recibo; `null` si no hubo. **`catalogo_cableado:false`** siempre.
12. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
13. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender` → `500
    UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `lineas-nomina.desglosar.response`; el error cierra con `lineas-nomina.desglosar.failed`.

### 1. `desglosar` — recibo + conceptos declarados

```json
{
  "project_id": "e57a318a-...",
  "recibo": { "empleado": "E-014", "periodo": "2026-09", "bruto": 2100, "retencion": 210, "cotizacion_trabajador": 133, "neto": 1757 },
  "conceptos": [
    { "concepto": "salario base", "importe": 2000, "signo": "devengo" },
    { "concepto": "plus transporte", "importe": 100, "signo": "+1" }
  ],
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "empleado": "E-014",
  "periodo": "2026-09",
  "clave_natural": null,
  "origen_recibo": "declarado",
  "magnitudes": { "bruto": 2100, "retencion": 210, "cotizacion_trabajador": 133, "neto": 1757 },
  "lineas_concepto": [
    { "tipo": "concepto", "concepto": "salario base", "importe": 2000, "signo": 1, "a_cargo": null, "cantidad": null, "precio": null },
    { "tipo": "concepto", "concepto": "plus transporte", "importe": 100, "signo": 1, "a_cargo": null, "cantidad": null, "precio": null }
  ],
  "lineas_magnitud": [
    { "tipo": "magnitud", "magnitud": "bruto", "concepto": "bruto", "importe": 2100, "a_cargo": null },
    { "tipo": "magnitud", "magnitud": "retencion", "concepto": "retencion", "importe": 210, "a_cargo": null },
    { "tipo": "magnitud", "magnitud": "cotizacion_trabajador", "concepto": "cotizacion_trabajador", "importe": 133, "a_cargo": "trabajador" },
    { "tipo": "magnitud", "magnitud": "neto", "concepto": "neto", "importe": 1757, "a_cargo": null }
  ],
  "lineas": [ "…lineas_concepto + lineas_magnitud…" ],
  "conceptos_origen": "declarados",
  "catalogo_cableado": false,
  "explicable": true,
  "suma_conceptos": 2100,
  "explica_bruto": true,
  "descuadre": 0,
  "calculada_aqui": false,
  "calculo_delegado_a": "sistema-de-nomina-externo",
  "faltantes": [],
  "abierto": false
}
```

### 2. `desglosar` — un concepto sin signo declarado (no se interpreta)

Un concepto sin `signo` → `signo:null` en su línea y **no entra en `suma_conceptos`**; como no todos
los conceptos tienen signo, `explica_bruto:null` y `descuadre:null`. **El módulo no supone el signo.**

### 3. `desglosar` — una magnitud que no llega (importe `null`)

Sin `neto` en la fuente → `magnitudes.neto:null`, `linea_magnitud` de `neto` con `importe:null` y
`faltantes:["neto"]`. **No se rellena con 0.**

### 4. `desglosar` — sin recibo ni conceptos

```json
{ "project_id": "e57a318a-..." }
```

`200` con `lineas:[]`, `abierto:true`, `faltantes:["recibo"]` y `motivo`.

### 5. Fallo — falta `project_id`

Respuesta `400` + `lineas-nomina.desglosar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/lineas-nomina.test.js`. Cubre:

- `desglosar` con recibo + conceptos → `200`, las cuatro `magnitudes` **copiadas**, `lineas` con
  conceptos + magnitudes y `explica_bruto:true` cuando los conceptos suman el bruto.
- Un concepto sin signo → `signo:null`, no suma, `explica_bruto:null` (**no se interpreta**).
- Un importe o magnitud ausente → `null` y en `faltantes` (**no se estima**).
- `conceptos_origen` (`'declarados'`/`'recibo'`), `catalogo_cableado:false`, `explicable`.
- Sin recibo ni conceptos → `lineas:[]`, `abierto:true`, `faltantes:['recibo']`.
- Sin recibo declarado se pide por evento a `recibo-nomina` (G1).
- `project_id` ausente → `400 INVALID_INPUT` + `.desglosar.failed`.
- `toolDesglosar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `LineasNomina extends ModuloHibridoReflejo`; `name = 'lineas-nomina'`, `version =
  'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/lineas-nomina/`).
- Constante `MAGNITUDES = ['bruto', 'retencion', 'cotizacion_trabajador', 'neto']` — **solo nombres**,
  ningún valor legal.
- `onDesglosarRequest` usa `this._atender(e, 'desglosar', 'lineas-nomina.desglosar.response',
  async (d) => {...})` con cierre de círculo.
- Proyección `_desglosar(input)` (**asíncrona**); helpers `_recibo` (RPC a G1), `_signo`, `_num`. Tool
  `toolDesglosar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta el recibo de `recibo-nomina` (G1) por evento; hace **explicable** la nómina de la
  cadena de personal (G6).
- **PARÁMETRO COMO DATO**: conceptos, importes y **signos** son **declarables**; el código **no
  asume** ningún signo ni tratamiento. Los cuatro importes se **copian** del recibo; la consistencia
  se **declara**, no se corrige.
