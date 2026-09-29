---
name: control-cuadre-documento
description: >
  Skill FULL del módulo REFLEJO `control-cuadre-documento` de la vertical
  contabilidad de Enki. Control DETERMINISTA del cuadre del documento: base +
  impuestos frente al total dentro de una TOLERANCIA declarable; si no cuadra va a
  la cola y no se asienta mal, y lo ausente no se afirma (`cuadra:null`). Úsala
  para operar, depurar o extender el control, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites saber si base + impuestos cuadran con el total de un documento
    (RPC control-cuadre-documento.cuadra.request).
  - Cuando depures por qué un documento no cuadra o por qué llega a la cola
    (400 INVALID_INPUT si documento/base/total no son validos).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del cuadre (tolerancia declarable, dato ausente no se afirma).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo control-cuadre-documento.
tags: [enki, modulo, reflejo, contabilidad, control-cuadre-documento]
---

# control-cuadre-documento — REFLEJO STATELESS de la contabilidad

## Qué hace el módulo

`control-cuadre-documento` es un **REFLEJO STATELESS** (A4.3, hoja del plan): el
control **DETERMINISTA** del cuadre del documento — `base + impuestos` frente al
`total`, dentro de una **TOLERANCIA DECLARABLE**. Si importe+impuestos no cuadran,
publica el fire-and-forget `contabilidad.documento_descuadrado` (lo consume
`encolado-excepcion` A8.1): **NO se asienta mal, va a la cola**. No corrige, no
estima, no decide: calcula.

**Dato ausente**: si falta base/impuestos/total, NO se afirma nada — se devuelve
`cuadra:null` con los campos en `abierto` (nada se estima). En entrada invalida
(documento ausente o base/total no numericos) cierra con su par
`control-cuadre-documento.cuadra.failed`. Sin PosPersistencia y sin
`project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `control-cuadre-documento.cuadra.request` | `onCuadraRequest` | RPC reflejo: {project_id, documento, tolerancia?} → {cuadra, esperado, total, base, suma_impuestos, descuadre, tolerancia, abierto}. Calcula de forma determinista si base + impuestos cuadran con el total dentro de la tolerancia declarada; si falta dato, `cuadra:null` con `abierto`. Descuadre → publica contabilidad.documento_descuadrado; documento/total invalidado → control-cuadre-documento.cuadra.failed. Responde por control-cuadre-documento.cuadra.response. |

### Publishes

| Evento | Descripción |
|---|---|
| `control-cuadre-documento.cuadra.response` | Respuesta RPC correlada de control-cuadre-documento.cuadra.request → {request_id, status:200, data:{cuadra, esperado, total, base, suma_impuestos, descuadre, tolerancia, abierto}}. Emitida por el helper _atender. |
| `control-cuadre-documento.cuadra.failed` | Par de fallo determinista (A4.3): documento ausente o base/total no numericos → {status, error:{code, message, details?}}. Cierra el circulo de control-cuadre-documento.cuadra.request. |
| `contabilidad.documento_descuadrado` | Fire-and-forget (A4.3): importe+impuestos no cuadran con el total → {project_id, documento, esperado, total, descuadre, correlation_id}. Lo consume encolado-excepcion (A8.1): el documento va a la cola, NO se asienta mal. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `control-cuadre-documento.cuadra.failed` cierra el círculo de
> `control-cuadre-documento.cuadra.request` cuando `_cuadra` devuelve status ≠ 200.

> Nota: `contabilidad.documento_descuadrado` se emite en `onCuadraRequest` solo si
> `status === 200 && data.cuadra === false`. Un `cuadra:null` (dato abierto) NO emite
> descuadre — no es un veredicto.

## Reglas de negocio

1. **Tolerancia DECLARABLE**: `tolerancia_declarada = Number.isFinite(Number(input.tolerancia))`;
   `tolerancia = |Number(input.tolerancia)|` o `0` si no se declaro. Sin declararla, el
   cuadre es exacto (tolerancia `0`). No se asume ninguna ley.
2. **Dato ausente = no se afirma nada (cero estimacion)**: si falta `base`, `total` o
   `impuestos` → `200` con `cuadra:null`, `motivo:'[ABIERTO]: falta dato para calcular
   el cuadre'` y los campos ausentes en `abierto`.
3. **Malformado != ausente**: un valor no vacio que no es numero (`!Number.isFinite`)
   es **entrada invalida** → `400 INVALID_INPUT` (`_invalid('documento.base|documento.total')`),
   no un `abierto`. Marca interna `__malformado__<campo>`.
4. **Formula del cuadre**: `esperado = _round(base + suma_impuestos, 2)`;
   `descuadre = _round(total - esperado, 2)`; `cuadra = Math.abs(descuadre) <= tolerancia`.
5. **Suma de impuestos flexible (forma libre declarable)**: `_sumaImpuestos` acepta un
   numero, o un array en el que cada item es numero o `{cuota|importe|total|cuota_impuesto}`.
   Los items no numericos se ignoran (suman 0). Redondeo a 2 decimales (`_round`).
6. **Descuadre → cola, nunca asiento mal**: `cuadra === false` publica
   `contabilidad.documento_descuadrado` con `{esperado, total, descuadre}`.
7. **No corrige, no decide**: solo calcula. No persiste, no hay store.
8. **`project_id` con fallback**: `input.project_id || this.project_id || null`.
9. **HTTP exacto**: éxito `200` (con `cuadra` true/false/null); documento inválido o
   base/total no numericos → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `control-cuadre-documento.cuadra.response` y emite `contabilidad.documento_descuadrado`.

### 1. `cuadra` — documento que cuadra

```json
{
  "project_id": "e57a318a-...",
  "documento": { "base": 100, "impuestos": [{ "cuota": 21 }], "total": 121 },
  "tolerancia": 0.01,
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "cuadra": true, "esperado": 121, "total": 121, "base": 100, "suma_impuestos": 21, "descuadre": 0, "tolerancia": 0.01, "tolerancia_declarada": true, "documento": { "...": "..." } }
```

### 2. `cuadra` — documento descuadrado (va a la cola)

```json
{ "project_id": "e57a318a-...", "documento": { "base": 100, "impuestos": 21, "total": 130 } }
```
Respuesta `200` con `cuadra:false`, `esperado:121`, `descuadre:9`, y emite
`contabilidad.documento_descuadrado`:
```json
{ "project_id": "e57a318a-...", "documento": { "...": "..." }, "esperado": 121, "total": 130, "descuadre": 9, "correlation_id": "abc-123" }
```

### 3. `cuadra` — dato ausente (no se afirma)

```json
{ "project_id": "e57a318a-...", "documento": { "base": 100 } }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "cuadra": null, "motivo": "[ABIERTO]: falta dato para calcular el cuadre", "abierto": ["total", "impuestos"], "tolerancia": 0, "tolerancia_declarada": false, "documento": { "base": 100 } }
```

### 4. Fallo — base/total malformados

```json
{ "documento": { "base": "cien", "total": 121 } }
```
Respuesta `400` + `control-cuadre-documento.cuadra.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "documento.base|documento.total requerido", "details": { "field": "documento.base|documento.total" } } }
```

## Tests

El test vive en `tests/unit/control-cuadre-documento.test.js`. Cubre:

- documento que cuadra (con y sin tolerancia) → `200 cuadra:true`, `descuadre` acotado.
- documento descuadrado → `200 cuadra:false` + `contabilidad.documento_descuadrado`.
- dato ausente (falta base/total/impuestos) → `200 cuadra:null`, `abierto` poblado, sin
  emitir descuadre.
- base/total no numericos → `400 INVALID_INPUT` + `control-cuadre-documento.cuadra.failed`.
- `impuestos` como numero, como array de numeros y como array de `{cuota}` → misma suma.
- documento ausente/no objeto → `400 INVALID_INPUT` (`field:'documento'`).
- `toolCuadra` devuelve la misma proyeccion que `_cuadra`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ControlCuadreDocumento extends ModuloHibridoReflejo`; `name =
  'control-cuadre-documento'`, `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin
  store, sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/control-cuadre-documento/`).
- `onCuadraRequest` usa `this._atender(e, 'cuadra',
  'control-cuadre-documento.cuadra.response', async (d) => {...})`. Dentro, cierre de
  circulo: `status !== 200` → `control-cuadre-documento.cuadra.failed`;
  `cuadra === false` → `contabilidad.documento_descuadrado`.
- Proyeccion unica `_cuadra(input)` → `{status, data}`; helper `_sumaImpuestos(impuestos)`.
  Tool directa `toolCuadra`. Usa `_round(x, 2)` (de la base) y `_invalid`/`_errorResponse`.
- DEP: lo consume `encolado-excepcion` (A8.1) via `contabilidad.documento_descuadrado`.
