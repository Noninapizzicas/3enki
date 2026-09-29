---
name: conceptos-extra-nomina
description: >
  Skill FULL del módulo REFLEJO `conceptos-extra-nomina` de la vertical contabilidad de Enki.
  Imputa los CONCEPTOS EXTRA de nómina (dietas, especie, finiquito, paga extra) aplicando el
  TRATAMIENTO DECLARADO — conceptos y reglas declarables, cero tratamiento cableado. Sin estado.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites imputar conceptos extra de nómina a su cuenta/rol destino (RPC
    conceptos-extra-nomina.imputar.request).
  - Cuando depures por qué un concepto sale `abierto:true` y `imputable:false` (sin tratamiento
    declarado), por qué `total_imputado:null` (algún concepto sin importe/tratamiento), por qué
    `tratamiento_origen:null` o por qué falla con 400 INVALID_INPUT (falta `project_id` o
    `concepto`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (no decide, tratamiento declarable, aplicar lo declarado es puro, dato ausente =
    desconocido).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo conceptos-extra-nomina.
tags: [enki, modulo, reflejo, contabilidad, conceptos-extra-nomina]
---

# conceptos-extra-nomina — REFLEJO de la imputación de conceptos extra

## Qué hace el módulo

`conceptos-extra-nomina` es un **REFLEJO STATELESS** (G9, hoja del plan): **DIETAS, ESPECIE,
FINIQUITO, PAGA EXTRA: cálculo de SU IMPUTACIÓN**. El diseño lo dice literal:
`imputar(c:Concepto):Set<Apunte>`, con `conceptos:Set<Concepto>`. **Cálculo PURO, determinista**:
mismo concepto declarado + misma regla declarada → mismo apunte.

**LOS CONCEPTOS SON DECLARABLES** (invariante **LEY/PARÁMETRO COMO DATO**): aquí **NO** se cablea que
es una dieta, **ni** que la especie exonera, **ni** que la paga extra se prorratea, **ni** ningún
tratamiento fiscal. El negocio **DECLARA** cada concepto y su **TRATAMIENTO** (`tratamiento`: la
cuenta/rol destino, si es exento, si integra la base, si es de un solo pago). **Aplicar** el
tratamiento declarado es puro; **INVENTAR** un tratamiento es lo que este reflejo **NO** hace.

**ESTE MÓDULO NO DECIDE**: no valora el concepto, **no decide si está exento** y **no calcula
retención** alguna. Deriva los apuntes que la regla **DECLARADA** produce; si un concepto no trae
tratamiento, queda **`[ABIERTO]`** (no se le asigna uno por defecto).

Invariante: **dato ausente = desconocido**. Un concepto sin importe o sin tratamiento queda declarado
como **abierto**; **jamás** se rellena con `0` **ni** se le supone un tratamiento.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_imputar`. Cierra
el círculo de error con `conceptos-extra-nomina.imputar.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `conceptos-extra-nomina.imputar.request` | `onImputarRequest` | RPC reflejo (calculo puro, determinista): {project_id, conceptos\|concepto (DECLARABLES: [{concepto, importe, clase?, cantidad?, precio?, especie?, tratamiento?}] o un concepto suelto), tratamientos?\|reglas? (DECLARABLES: mapa {concepto: {cuenta\|rol_destino, exento?, integra_base?, pago_unico?, signo?}}), tratamiento? (tratamiento unico declarado), empleado?, periodo?} → {project_id, conceptos:[{concepto, importe, clase, especie, tratamiento, abierto, imputable}], apuntes:[{concepto, importe, cuenta, rol_destino, exento, integra_base, pago_unico, signo}], total_imputado, tratamiento_origen:'declarado'\|'declarado_unico', tratamientos_cableados:false, decide:false, aplica_regla_declarada:true, faltantes, abierto}. Un concepto sin importe o sin tratamiento queda abierto y se declara en `faltantes` — no se le supone nada. Responde por conceptos-extra-nomina.imputar.response; project_id ausente o concepto ausente → conceptos-extra-nomina.imputar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `conceptos-extra-nomina.imputar.response` | Respuesta RPC correlada de conceptos-extra-nomina.imputar.request → {request_id, status:200, data:{conceptos, apuntes, total_imputado, faltantes, abierto}}. Emitida por el helper _atender. |
| `conceptos-extra-nomina.imputar.failed` | Par de fallo determinista (G9): project_id o concepto ausente (400), o excepcion de la proyeccion (500) → {status, error:{code, message, details?}}. Cierra el circulo de conceptos-extra-nomina.imputar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `conceptos-extra-nomina.imputar.failed` cierra el círculo de
> `conceptos-extra-nomina.imputar.request` cuando `_imputar` devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onImputarRequest` publica
> `conceptos-extra-nomina.imputar.failed` **solo si `_imputar` devuelve status ≠ 200**; en `200`
> responde por `_atender` y **no** emite evento de dominio (este reflejo no tiene fire-and-forget
> propio y **no** llama a ningún otro módulo por evento: es cálculo puro sobre lo declarado).

> Nota: **no hay** llamadas salientes `_rpc` en este módulo: todo lo que necesita (conceptos y
> tratamientos) llega **declarado en la petición**. No figuran `_catalogo`, `_tratamiento`, `_signo`,
> `_num` ni `toolImputar` en `module.json` (utilidades internas / tool directa).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`).
2. **Los CONCEPTOS son DECLARABLES**: gana `input.conceptos` (array); si no, `input.concepto`
   (uno suelto → `[concepto]`); si **ninguno** → `400 INVALID_INPUT` (`field:'concepto'`).
3. **El TRATAMIENTO es DECLARABLE, en tres niveles** (precedencia exacta): **(a)** el declarado en el
   propio concepto (`obj.tratamiento`); **(b)** el catálogo declarado (`input.tratamientos ||
   input.reglas`) por **nombre** de concepto; **(c)** un `tratamiento` **único** declarado en la
   petición. Si ninguno aplica → el concepto queda **`abierto:true`** y `faltantes` recibe
   `conceptos[i].tratamiento`. **No se le supone nada.**
4. **Un tratamiento solo es aplicable si declara destino** (`_tratamiento`): sin `cuenta` **ni**
   `rol_destino` → **`null`** (no hay a dónde imputar; **no se inventa la cuenta**). Con destino,
   normaliza `exento`, `integra_base`, `pago_unico` (`true`/`false`/`null`) y `signo`
   (`_signo`), y sella `origen:'declarado'`.
5. **EL SIGNO del tratamiento** (`_signo`): ausente/`''` → **`1`** (neutro declarado); numérico → `−1`
   si `<0`, si no `1`; texto `-1`, `-`, `negativo`, `deduccion`, `debe` → `−1`; cualquier otro → `1`.
6. **Dato ausente = desconocido**: nombre ausente → `faltantes:'conceptos[i].concepto'`; importe
   ausente/no numérico → `faltantes:'conceptos[i].importe'`. **No se rellena con 0.**
7. **El concepto declarado se devuelve completo**: `{concepto, importe, clase, cantidad, precio,
   especie, tratamiento, abierto, imputable}` — donde `abierto = (tratamiento === null)` e
   **`imputable = (tratamiento !== null && importe !== null)`**.
8. **Solo los imputables producen apunte**: por cada concepto imputable se empuja a `apuntes`
   `{concepto, importe, cuenta, rol_destino, exento, integra_base, pago_unico, signo,
   origen_tratamiento}` — **aplicar la regla declarada es puro**.
9. **`total_imputado`** = `Σ(importe × (signo del tratamiento || 1))` redondeado **solo** si
   **todos** los conceptos son imputables y hay al menos uno; si no → `null`. **Nada se estima.**
10. **`tratamiento_origen`**: `'declarado'` si el catálogo tiene entradas; `'declarado_unico'` si solo
    hubo tratamiento único; si no, `null`. **`tratamientos_cableados:false`** siempre.
11. **El módulo NO valora ni decide exenciones**: `decide:false`, `aplica_regla_declarada:true`,
    `calculo_puro:true`. El módulo **aplica** la regla declarada; **no** la conoce ni la juzga.
12. **NO escribe, NO persiste, NO muta**: stateless puro. Sin `PosPersistencia`, sin
    `onProjectActivated`.
13. **HTTP exacto**: éxito `200`; `project_id` o concepto ausentes → `400`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `conceptos-extra-nomina.imputar.response`; el error cierra con
`conceptos-extra-nomina.imputar.failed`.

### 1. `imputar` — conceptos + catálogo de tratamientos declarados

```json
{
  "project_id": "e57a318a-...",
  "conceptos": [
    { "concepto": "dietas", "importe": 120, "especie": false },
    { "concepto": "paga extra", "importe": 1400 }
  ],
  "tratamientos": {
    "dietas": { "cuenta": "629", "exento": true, "integra_base": false, "signo": "+1" },
    "paga extra": { "rol_destino": "gasto_sueldos", "integra_base": true, "pago_unico": false }
  },
  "empleado": "E-014",
  "periodo": "2026-09",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "empleado": "E-014",
  "periodo": "2026-09",
  "conceptos": [
    { "concepto": "dietas", "importe": 120, "clase": null, "cantidad": null, "precio": null, "especie": false, "tratamiento": { "cuenta": "629", "rol_destino": null, "exento": true, "integra_base": false, "pago_unico": null, "signo": 1, "origen": "declarado" }, "abierto": false, "imputable": true },
    { "concepto": "paga extra", "importe": 1400, "clase": null, "cantidad": null, "precio": null, "especie": null, "tratamiento": { "cuenta": null, "rol_destino": "gasto_sueldos", "exento": null, "integra_base": true, "pago_unico": false, "signo": 1, "origen": "declarado" }, "abierto": false, "imputable": true }
  ],
  "apuntes": [
    { "concepto": "dietas", "importe": 120, "cuenta": "629", "rol_destino": null, "exento": true, "integra_base": false, "pago_unico": null, "signo": 1, "origen_tratamiento": "declarado" },
    { "concepto": "paga extra", "importe": 1400, "cuenta": null, "rol_destino": "gasto_sueldos", "exento": null, "integra_base": true, "pago_unico": false, "signo": 1, "origen_tratamiento": "declarado" }
  ],
  "total_imputado": 1520,
  "tratamiento_origen": "declarado",
  "tratamientos_cableados": false,
  "decide": false,
  "aplica_regla_declarada": true,
  "calculo_puro": true,
  "faltantes": [],
  "abierto": false,
  "motivo": null
}
```

### 2. `imputar` — un concepto sin tratamiento declarado: queda `[ABIERTO]`

Sin entrada en `tratamientos` ni `tratamiento` en el concepto ni `tratamiento` único →
`tratamiento:null`, `abierto:true`, `imputable:false`, `faltantes:["conceptos[0].tratamiento"]`,
`total_imputado:null`. **El módulo no le asigna un tratamiento por defecto.**

### 3. `imputar` — un tratamiento sin destino no es aplicable

`{ "cuenta": null, "exento": true }` (sin `cuenta` **ni** `rol_destino`) → `_tratamiento` devuelve
`null`: el concepto **no es imputable** y se declara en `faltantes`. **La cuenta no se inventa.**

### 4. `imputar` — un concepto sin importe (no se rellena con 0)

`{ "concepto": "bonus", "tratamiento": { "cuenta": "640" } }` → `importe:null`,
`faltantes:["conceptos[i].importe"]`, `imputable:false` y `total_imputado:null`.

### 5. Fallo — falta `project_id` o `concepto`

Respuesta `400` + `conceptos-extra-nomina.imputar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/conceptos-extra-nomina.test.js`. Cubre:

- `imputar` con `tratamientos` declarados → `200`, un `apunte` por concepto imputable,
  `tratamiento_origen:'declarado'` y `total_imputado` = Σ importe × signo.
- **Cero tratamiento cableado**: sin tratamiento → `abierto:true`, `imputable:false`, `faltantes` y
  `total_imputado:null`; el módulo **no** decide exenciones ni asigna tratamiento.
- Precedencia del tratamiento: concepto → catálogo → único (`declarado_unico`).
- Un tratamiento **sin destino** (`cuenta` ni `rol_destino`) → `null` (**no se inventa la cuenta**).
- Un concepto sin importe queda `null` y en `faltantes` (**no se rellena con 0**).
- El signo declarado afecta a `total_imputado` (`-1`/`deduccion` resta).
- `project_id` o concepto ausentes → `400 INVALID_INPUT` + `.imputar.failed`.
- `toolImputar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ConceptosExtraNomina extends ModuloHibridoReflejo`; `name = 'conceptos-extra-nomina'`,
  `version = 'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated` (REFLEJO
  stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-fiscal/conceptos-extra-nomina/`).
- `onImputarRequest` usa `this._atender(e, 'imputar', 'conceptos-extra-nomina.imputar.response',
  async (d) => {...})` con cierre de círculo.
- Proyección `_imputar(input)` (**SÍNCRONA**); helpers `_catalogo` (mapa declarado → tratamientos),
  `_tratamiento` (normaliza y exige destino), `_signo`, `_num`. Tool `toolImputar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: es reflejo de la cadena de personal (G9); **no** llama a ningún otro módulo por evento (todo
  llega declarado).
- **PARÁMETRO COMO DATO**: conceptos, importes, `clase`, `especie` y **tratamientos** (cuenta, rol
  destino, exento, integra base, pago único, signo) son **declarables**; el código **no cablea**
  ningún tratamiento fiscal ni ninguna cuenta.
