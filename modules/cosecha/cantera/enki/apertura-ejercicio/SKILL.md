---
name: apertura-ejercicio
description: >
  Skill FULL del módulo REFLEJO `apertura-ejercicio` de la vertical contabilidad de
  Enki. Arrastra los SALDOS DEL CIERRE ANTERIOR al EJERCICIO NUEVO — DERIVA, NO DECIDE:
  los asientos de apertura son consecuencia determinista del cierre; sin cierre previo se
  declara, no se estima. Úsala para operar, depurar o extender el reflejo, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites generar los asientos de apertura (RPC
    apertura-ejercicio.generar.request).
  - Cuando depures por qué no hay apertura (422 PRECONDITION_FAILED si falta el cierre
    anterior, 400 INVALID_INPUT si falta project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la apertura (deriva no decide, un cierre una apertura, lo que falta se
    declara).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo apertura-ejercicio.
tags: [enki, modulo, reflejo, contabilidad, apertura-ejercicio]
---

# apertura-ejercicio — REFLEJO STATELESS de la apertura

## Qué hace el módulo

`apertura-ejercicio` es un **REFLEJO STATELESS** (C5, hoja del plan): arrastra los
**SALDOS DEL CIERRE ANTERIOR** al **EJERCICIO NUEVO**. **DERIVA, NO DECIDE**: los
asientos de apertura son la **consecuencia determinista** del cierre precedente. **NO
decide** qué se arrastra ni lo reabre.

El cierre anterior llega por **DOS vías**, ninguna es un `require` cruzado:

- **`contabilidad.ejercicio_cerrado`** (fire-and-forget, C4 → C5): se **refleja** el
  cierre para poder generar su apertura.
- **`apertura-ejercicio.generar.request`**: se **PIDE** el cierre a `cierre-ejercicio`
  **POR EVENTO** (el cierre se lee del reflejo publicado por C4); si el payload trae el
  cierre directo se usa, si no se toma el reflejado. Se declara la fuente.

Invariantes:
- **Deriva, no decide**: la apertura **refleja** los saldos de cierre, no los
  reinterpreta.
- **Un mismo cierre → una misma apertura** (clave natural `APERTURA|<ejercicio>`):
  determinista.
- **No muta** el cierre ni el diario; es una proyección pura.
- **Lo que falta se declara** (`abierto`), **no se estima**.
- **SIN cierre anterior se rechaza** (`422`, `cierre_anterior_ausente`).

**Activo al DEBE, pasivo y patrimonio al HABER**; el resultado del ejercicio se
incorpora al patrimonio de apertura; si el cierre no cuadraba **se refleja el descuadre**,
**no se inventa un ajuste**. Sin `PosPersistencia` ni `project.activated` (reflejo puro).
Proyección `_generar`. Par de fallo `apertura-ejercicio.generar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `apertura-ejercicio.generar.request` | `onGenerarRequest` | RPC reflejo (cálculo puro): {project_id, ejercicio_origen?, ejercicio_nuevo?, fecha?} → {project_id, fuente:'cierre-ejercicio'\|'reflejo', ejercicio_origen, ejercicio_nuevo, clave_natural:'APERTURA\|<ej>', asientos:[{tipo:'asiento-apertura', apuntes:[{cuenta, debe, haber}], suma_debe, suma_haber, cuadra, deriva_de}], total_asientos, abierto, deriva_de:'cierre-anterior', decide:false}. Pide el cierre a cierre-ejercicio POR EVENTO; SIN cierre anterior → 422 (la apertura deriva del cierre, no lo decide). Responde por apertura-ejercicio.generar.response; fallo → apertura-ejercicio.generar.failed. |
| `contabilidad.ejercicio_cerrado` | `onEjercicioCerrado` | Fire-and-forget (C4 → C5): el ejercicio quedó cerrado → se refleja el cierre en memoria (por ejercicio) para poder generar su apertura aunque cierre-ejercicio no responda. No muta el cierre ni decide. |

### Publishes

| Evento | Descripción |
|---|---|
| `apertura-ejercicio.generar.response` | Respuesta RPC correlada de apertura-ejercicio.generar.request → {request_id, status:200, data:{ejercicio_origen, ejercicio_nuevo, clave_natural, asientos, total_asientos, abierto, deriva_de, decide}}. Emitida por el helper _atender. |
| `apertura-ejercicio.generar.failed` | Par de fallo determinista (C5): sin cierre anterior que arrastrar (422, cierre_anterior_ausente), project_id ausente (400) → {status, error:{code, message, details?}}. Cierra el círculo de apertura-ejercicio.generar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `apertura-ejercicio.generar.failed` cierra el círculo de
> `apertura-ejercicio.generar.request` cuando `_generar` devuelve status ≠ 200 (`400` por
> `project_id` ausente, `422` por `cierre_anterior_ausente`).

> Nota de honestidad (cruce con `index.js`): `onEjercicioCerrado` (fire-and-forget)
> **devuelve `null` siempre** y **no publica ningún evento**: solo refleja el cierre en
> memoria bajo su ejercicio (`this._cierresDe(pid).set(ejercicio, cierre)`). Sin
> `project_id`/`cierre`/`ejercicio` devuelve `null` sin reflejar.

> Nota: `module.json` declara `fuente:'cierre-ejercicio'|'reflejo'`, pero `index.js`
> (`_cierreAnterior`) devuelve en realidad `'payload'` (cierre directo en el payload),
> `'cierre-ejercicio'` (cierre reflejado por el evento) o `'ninguna'` (sin cierre →
> `422`). Es una discrepancia de valores, no de flujo: **el código manda**.

## Reglas de negocio

1. **Fallo determinista del proyecto**: `_generar` toma `input.project_id ||
   this.project_id`; ausente → `400 INVALID_INPUT` (`field:'project_id'`).
2. **SIN cierre anterior no hay apertura (deriva, no decide)**: `_cierreAnterior` resuelve
   el cierre en cascada — `input.cierre` (objeto) → `fuente:'payload'`; si no, el cierre
   reflejado por `contabilidad.ejercicio_cerrado` (`fuente:'cierre-ejercicio'`); si no,
   `{cierre:null, fuente:'ninguna'}` → `422 PRECONDITION_FAILED` con
   `{ejercicio_origen, motivo:'cierre_anterior_ausente'}`. **No se inventa un ejercicio en
   blanco.**
3. **Cierre reflejado por ejercicio**: `_cierreReflejado(pid, origen)` devuelve el cierre
   del ejercicio declarado si lo tiene; sin ejercicio declarado, el **más reciente**
   (`[...m.keys()].sort()` y el último) — determinista.
4. **Ejercicio origen/nuevo**: `ejercicio_origen = cierre.ejercicio ?? input.ejercicio_origen`;
   `ejercicio_nuevo = input.ejercicio_nuevo ?? input.ejercicio ?? _siguiente(ejercicio_origen)`.
   `_siguiente(origen)` = `YYYY+1` sobre los 4 primeros dígitos (determinista); sin origen
   → `null`.
5. **Los saldos se DERIVAN a apuntes (no se reinterpretan)**: `_asientosDeApertura(cierre,
   origen, nuevo, fecha)` — **activo al DEBE** (`{cuenta:'ACTIVO', debe:|activo|,
   haber:0}`), **pasivo y patrimonio al HABER** (`{cuenta:'PASIVO', debe:0,
   haber:|pasivo|}`); el **resultado del ejercicio se incorpora al patrimonio**:
   `patrimonio_apertura = round((patrimonio||0) + (resultado||0), 2)`, emitido al HABER
   (`{cuenta:'PATRIMONIO', debe:0, haber:|patrimonio_apertura|}`). Un saldo `0`/ausente
   **no** genera apunte.
6. **`_num(v)`**: `undefined`/`null`/`''` → `0`; no finito → `0` (los saldos del cierre se
   tratan como números; la ausencia no rompe la apertura).
7. **El descuadre del cierre se REFLEJA, no se arregla**: con
   `suma_debe = round(Σ debe, 2)` y `suma_haber = round(Σ haber, 2)`, si
   `|round(suma_debe - suma_haber, 2)| >= 0.01` se añade un apunte
   `{cuenta:'DESCUADRE_APERTURA', debe: descuadre<0 ? -descuadre : 0, haber: descuadre>0 ?
   descuadre : 0}`. **No se inventa un ajuste**: se refleja el descuadre para cuadrar la
   partida doble al abrir.
8. **Clave natural determinista**: `clave_natural = APERTURA|<ejercicio_nuevo>` — un
   mismo cierre → una misma apertura (idempotencia).
9. **El asiento de apertura se declara completo**: `{tipo:'asiento-apertura',
   clave_natural, concepto:'Apertura del ejercicio <nuevo> (derivada del cierre <origen>)',
   fecha, ejercicio:nuevo, deriva_de:{ejercicio:origen, clave_natural: cierre.clave_natural
   ?? 'CIERRE|<origen>'}, apuntes, suma_debe, suma_haber, cuadra:true, decide:false}`.
   `fecha` cae a `<nuevo>-01-01` si no se declara.
10. **DERIVA, NO DECIDE (siempre)**: la respuesta declara `deriva_de:'cierre-anterior'` y
    `decide:false`; el asiento también lleva `decide:false`.
11. **Lo que faltaba en el cierre se declara (no se estima)**: `abierto =
    Array.isArray(cierre.abierto) ? cierre.abierto : []` — se propaga tal cual.
12. **No muta el cierre ni el diario**: es una proyección pura; el reflejo de cierres solo
    se **lee**.
13. **Sin apuntes → sin asiento**: si no hay saldos (`apuntes.length === 0`), `_asientosDeApertura`
    devuelve `[]` y `total_asientos:0`.
14. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; sin cierre anterior → `422`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `apertura-ejercicio.generar.response`.

### 1. `generar` — la apertura derivada del cierre

```json
{
  "project_id": "e57a318a-...",
  "ejercicio_origen": "2026",
  "ejercicio_nuevo": "2027",
  "fecha": "2027-01-01",
  "correlation_id": "abc-123"
}
```

Con el cierre `CIERRE|2026` ya reflejado por `contabilidad.ejercicio_cerrado`
(`activo:121, pasivo:121, patrimonio:0, resultado:71`), Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "fuente": "cierre-ejercicio",
  "ejercicio_origen": "2026",
  "ejercicio_nuevo": "2027",
  "clave_natural": "APERTURA|2027",
  "asientos": [
    {
      "tipo": "asiento-apertura",
      "clave_natural": "APERTURA|2027",
      "concepto": "Apertura del ejercicio 2027 (derivada del cierre 2026)",
      "fecha": "2027-01-01",
      "ejercicio": "2027",
      "deriva_de": { "ejercicio": "2026", "clave_natural": "CIERRE|2026" },
      "apuntes": [
        { "cuenta": "ACTIVO", "debe": 121, "haber": 0 },
        { "cuenta": "PASIVO", "debe": 0, "haber": 121 },
        { "cuenta": "PATRIMONIO", "debe": 0, "haber": 71 },
        { "cuenta": "DESCUADRE_APERTURA", "debe": 71, "haber": 0 }
      ],
      "suma_debe": 192,
      "suma_haber": 192,
      "cuadra": true,
      "decide": false
    }
  ],
  "total_asientos": 1,
  "abierto": [],
  "deriva_de": "cierre-anterior",
  "decide": false
}
```

**El resultado del ejercicio se incorpora al patrimonio** de apertura
(`patrimonio_apertura = 0 + 71`); como el cierre era de beneficio y el patrimonio venía a
0, el apunte `DESCUADRE_APERTURA` **refleja** el descuadre que cuadra la partida doble al
abrir — **no se inventa un ajuste**.

### 2. `generar` con el cierre en el payload (`fuente:'payload'`)

```json
{ "project_id": "e57a318a-...", "ejercicio_origen": "2026", "cierre": { "ejercicio": "2026", "activo": 100, "pasivo": 100, "patrimonio": 0, "resultado": 0 } }
```

Se deriva con el cierre del payload; `ejercicio_nuevo` se calcula como `2027`
(`_siguiente`).

### 3. Fire-and-forget — reacción a `contabilidad.ejercicio_cerrado`

`onEjercicioCerrado` toma `d.cierre` y el ejercicio (de `d.ejercicio` o de
`cierre.ejercicio`), lo guarda en el reflejo por ejercicio y **devuelve `null`** sin
publicar evento. Así la apertura puede generarse aunque `cierre-ejercicio` no responda.

### 4. Fallo — sin cierre anterior (deriva, no decide)

```json
{ "project_id": "e57a318a-...", "ejercicio_origen": "2026" }
```

Sin cierre reflejado ni en el payload → Respuesta `422` +
`apertura-ejercicio.generar.failed`:

```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "no hay cierre anterior que arrastrar: la apertura deriva del cierre, no lo decide", "details": { "ejercicio_origen": "2026", "motivo": "cierre_anterior_ausente" } } }
```

### 5. Fallo — falta `project_id`

Respuesta `400` + `apertura-ejercicio.generar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/apertura-ejercicio.test.js`. Cubre:

- `generar` con cierre reflejado por `contabilidad.ejercicio_cerrado` →
  `fuente:'cierre-ejercicio'`, activo al DEBE / pasivo+patrimonio al HABER, `decide:false`,
  `deriva_de:'cierre-anterior'`, `clave_natural:'APERTURA|<nuevo>'`.
- El resultado del ejercicio se incorpora al patrimonio de apertura.
- Cierre que no cuadra → apunte `DESCUADRE_APERTURA` que refleja el descuadre (no se
  inventa un ajuste).
- `generar` con `cierre` en el payload → `fuente:'payload'`.
- Sin cierre anterior → `422 PRECONDITION_FAILED` (`motivo:'cierre_anterior_ausente'`).
- `ejercicio_nuevo` derivado con `_siguiente` (YYYY+1); `fecha` por defecto `<nuevo>-01-01`.
- `abierto` se propaga del cierre (lo que faltaba se declara, no se estima).
- `generar` sin `project_id` → `400 INVALID_INPUT` + `apertura-ejercicio.generar.failed`.
- `onEjercicioCerrado` refleja el cierre y devuelve `null` sin publicar evento.
- `toolGenerar` devuelve la misma proyección que `_generar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `AperturaEjercicio extends ModuloHibridoReflejo`; `name = 'apertura-ejercicio'`,
  `version = 'reflejo-0.1.0'`. Reflejo en memoria `this._cierres`
  (`Map<project_id, Map<ejercicio, cierre>>`). Sin `PosPersistencia`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/apertura-ejercicio/`).
- `onGenerarRequest` usa `this._atender(e, 'generar',
  'apertura-ejercicio.generar.response', async (d) => {...})`; dentro publica
  `apertura-ejercicio.generar.failed` si `status !== 200`. `onEjercicioCerrado` **no** usa
  `_atender` y devuelve `null`.
- Proyección `_generar(input)` (`async`: resuelve el cierre por evento/payload); helpers
  `_asientosDeApertura`, `_cierreAnterior`, `_cierreReflejado`, `_cierresDe`, `_siguiente`,
  `_num`. Tool `toolGenerar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: lo alimenta `contabilidad.ejercicio_cerrado` (C4) y lee el cierre reflejado por esa
  misma vía; **deriva** del cierre anterior, nunca decide.
