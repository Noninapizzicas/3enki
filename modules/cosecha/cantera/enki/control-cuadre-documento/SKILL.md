---
name: control-cuadre-documento
description: >-
  Skill FULL del módulo REFLEJO STATELESS `control-cuadre-documento` de la vertical contabilidad
  (Enki). Control DETERMINISTA del cuadre del documento: `base + cuota == total` (tolerancia de
  céntimos, `EPSILON=0.005`). Si NO cuadra, lo lleva a la cola de excepciones (`encolado-excepcion`)
  — no se asienta mal. Sin cifras no es verificable (no se inventa). Sin store propio. La op
  `cuadra` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites verificar que un documento cuadra (base + cuota == total)
    (RPC control-cuadre-documento.cuadra.request).
  - Cuando depures por qué un documento fue a la cola de excepciones (descuadre real) o por qué
    sale `verificable:false` (sin cifras).
  - Cuando quieras entender su contrato de eventos y cómo encadena la entrada con A8.1.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, cuadre, validacion, excepciones]
---

# control-cuadre-documento — REFLEJO STATELESS del cuadre del documento

## Qué hace el módulo

`control-cuadre-documento` es un **REFLEJO STATELESS** (A4.3, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Hace un **control determinista del cuadre** de un documento:

```
base + cuota == total          (tolerancia de céntimos: |diferencia| <= 0.005)
```

**Si no cuadra, no se asienta mal**: se lleva el documento a la cola de excepciones
(`encolado-excepcion.encolar.request`, A8.1) para que un humano lo revise. **Cuadra o dato ausente
→ no se encola nada** (no se inventa la excepción por un hueco).

**Honestidad (invariante 13):** sin ninguna cifra (base/cuota/total) → **no verificable**
(`cuadra:null`, `verificable:false`, `abierto.cifras`).

**No persiste** (STATELESS). La op `cuadra` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `control-cuadre-documento.cuadra.request` | `onCuadraRequest` | RPC reflejo (PREGUNTA): `{project_id, documento?:{base, cuota, total, documento_id?, clave?}}` → `{base, cuota, total, suma_debe, suma_haber, diferencia, cuadra, verificable, encolada, abierto}`. Delega en `_atender` → `_cuadra`. **Si `cuadra === false`** publica `encolado-excepcion.encolar.request`. Si `status ≠ 200` publica `.failed`. Responde por `control-cuadre-documento.cuadra.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `control-cuadre-documento.cuadra.response` | Respuesta RPC correlada de la op `cuadra`. |
| `control-cuadre-documento.cuadra.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |
| `encolado-excepcion.encolar.request` | **Solo si el documento NO cuadra** (`cuadra === false`): `{project_id, rol:'CONTROL_CUADRE_DOCUMENTO', clave, motivo:'el documento NO cuadra (importe+impuestos): no se asienta mal', origen:'control-cuadre-documento', payload:{suma_debe, suma_haber, diferencia}, correlation_id}`. |

> **NO publica un hecho de dominio**: es un control de validación. Su única escritura (encolar)
> es por EVENTO a A8.1, y **solo cuando hay descuadre real**.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `cuadra` | **PREGUNTA** | `{project_id, documento?:{base?\|importe_base?\|subtotal?, cuota?\|impuestos?\|iva?, total?\|importe_total?\|importe?, documento_id?, clave?}}` | `{project_id, tipo, documento_id, clave, base, cuota, total, suma_debe, suma_haber, diferencia, cuadra, verificable, determinista, formula, encolada, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Normalización de cifras** (`_cifras`): `base = base ?? importe_base ?? subtotal`;
   `cuota = cuota ?? impuestos ?? iva ?? cuota_iva`; `total = total ?? importe_total ?? importe`.
   **Ausente → `null`** (un hueco no es un cero).
2. **Sin cifras no se afirma nada**: si las tres son `null` → `cuadra:null`, `verificable:false`,
   `abierto.cifras`. **No se encola** (no se inventa la excepción por un hueco).
3. **Comprobación**: `suma_debe = round(base + cuota, 2)`; `suma_haber = round(total, 2)`;
   `diferencia = round(suma_debe - suma_haber, 2)`; `cuadra = |diferencia| <= EPSILON`.
4. **Tolerancia de céntimos**: `EPSILON = 0.005` (redondeo, no descuadre real).
5. **Encolado solo con descuadre real**: `encolada = (cuadra === false)`; el handler publica
   `encolado-excepcion.encolar.request` con la diferencia y las sumas.
6. **Huecos declarados**: si falta `cuota` o `base`, se declara en `abierto.cuota` / `abierto.base`
   (no se inventan).
7. **Determinista**: mismas cifras → mismo cuadre; `formula` lo declara.
8. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Documento que cuadra

```json
{
  "project_id": "e57a318a-...",
  "documento": { "documento_id": "4455", "clave": "factura:4455", "base": 1000, "cuota": 210, "total": 1210 },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "control-cuadre-documento",
  "documento_id": "4455",
  "clave": "factura:4455",
  "base": 1000,
  "cuota": 210,
  "total": 1210,
  "suma_debe": 1210,
  "suma_haber": 1210,
  "diferencia": 0,
  "cuadra": true,
  "verificable": true,
  "determinista": true,
  "formula": "base + cuota == total (tolerancia de centimos)",
  "encolada": false,
  "abierto": { "cuota": null, "base": null }
}
```
**No** emite nada (cuadra).

### Documento que NO cuadra — va a la cola

```json
{ "project_id": "e57a318a-...", "documento": { "base": 1000, "cuota": 210, "total": 1300 } }
```
→ `diferencia:-90`, `cuadra:false`, `encolada:true`.
Publica `encolado-excepcion.encolar.request` con
`rol:'CONTROL_CUADRE_DOCUMENTO'` (no se asienta mal).

### Sin cifras — no verificable

```json
{ "project_id": "e57a318a-...", "documento": { "documento_id": "9999" } }
```
→ `cuadra:null`, `verificable:false`, `encolada:false`,
`abierto.cifras = "no llego ninguna cifra (base/cuota/total): el cuadre no es verificable (no se inventa)"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `control-cuadre-documento.cuadra.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_cuadra`. |
| (no es error) | 200 | Sin cifras → `verificable:false` (honesto, no se encola). |

## Relación con otras piezas (deps por EVENTO)

- **Encadena con**: `encolado-excepcion.encolar.request` (A8.1) cuando hay descuadre real.
- **Le encola (previsto)**: `extraccion-dato` (A4.1) llama a `control-cuadre-documento.cuadra.request`.
- **No llama a `_rpc`**: es puro y determinista.

## Verificación

1. Fichero: `modules/contabilidad-entrada/control-cuadre-documento/`.
2. Eventos reales: subscribes `control-cuadre-documento.cuadra.request`; publishes
   `control-cuadre-documento.cuadra.response`, `.failed`, `encolado-excepcion.encolar.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-entrada/control-cuadre-documento/index.js
   # → encolado-excepcion.encolar.request / control-cuadre-documento.cuadra.failed
   ```
4. Test unitario (si existe): cuadra → `cuadra:true`, sin encolar; descuadre → `cuadra:false` +
   encolar; sin cifras → `verificable:false`, sin encolar; sin `project_id` → 400 + failed.
