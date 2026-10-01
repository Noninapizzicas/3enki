---
name: factura-rectificativa
description: >-
  Skill FULL del módulo REFLEJO STATELESS `factura-rectificativa` de la vertical
  contabilidad (Enki). Corrección comercial POSTERIOR a la emisión (abono/
  devolución/descuento/anulación) que NO BORRA NADA: una rectificación es OTRA
  factura (O1), jamás una edición. La POLARIDAD ES FIJA (signo negativo). Escucha
  contabilidad.factura_emitida (O1) para tener a mano las rectificables. Sin
  original ni importe queda ABIERTA. No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites calcular una factura rectificativa a partir de la original
    (RPC factura-rectificativa.calcular.request).
  - Cuando depures una rectificativa abierta (sin original ni importe) o un 400
    INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y los
    tipos abono/devolucion/descuento/anulacion.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, entrada, factura, rectificativa, append-only, determinista]
---

# factura-rectificativa — REFLEJO STATELESS de la factura rectificativa

## Qué hace el módulo

`factura-rectificativa` es un **REFLEJO STATELESS** (O2, hoja del plan): la
corrección comercial **POSTERIOR** a la emisión (abono / devolución / descuento /
anulación) que **NO BORRA NADA**. Una rectificación es **OTRA factura** (O1),
jamás una edición de la original (**append-only**). Esta hoja **CALCULA** la
rectificativa a partir de la **factura original**.

Escucha `contabilidad.factura_emitida` (O1 `emision-factura-venta`) para tener a
mano las facturas rectificables (registro **DERIVADO** en memoria, no un hecho).
**LA POLARIDAD ES FIJA**: la rectificativa **CORRIGE** (`signo:-1`); no se suma al
original. **Dato ausente = desconocido**: sin original ni importe declarado la
rectificativa queda **ABIERTA** (no se estima).

No escribe, no persiste: la emisión la hace O1 (sube
`emision-factura-venta.emitir.request`) y el asiento `escritor-diario` (B2) — por
EVENTO, no import. Su op es **CLASE PREGUNTA** → va por el bus, sin panel. Publica
`factura-rectificativa.calcular.response` y su par `.failed`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `factura-rectificativa.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, factura?\|factura_id?\|serie+numero?, tipo?, base?, iva?, total?, motivo?}` → `{project_id, original_id, tipo, rectificativa:{base, iva, total, signo:-1, motivo}, calculada, borra_original:false, abierto}`. Calcula la rectificativa desde el original (la sube a O1/B2 por evento). Sin original ni importe → `rectificativa:null` y abierto. Responde por `factura-rectificativa.calcular.response`. |
| `contabilidad.factura_emitida` | `onFacturaEmitida` | Fire-and-forget (lo emite `emision-factura-venta` O1): una factura de venta quedó emitida → se guarda su referencia (derivado en memoria) para poder rectificarla. No responde (no es RPC). |

### Publishes

| Evento | Descripción |
|---|---|
| `factura-rectificativa.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `factura-rectificativa.calcular.failed` | Par de fallo determinista: falta `project_id` o no hay factura original que rectificar → `{status, code, message}`. Cierra el círculo de `calcular.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** (bus) | `{project_id, factura?\|factura_id?\|serie+numero?, tipo?, base?, iva?, total?, motivo?}` | `{project_id, original_id, tipo, rectificativa:{base, iva, total, signo:-1, motivo}, calculada, borra_original:false, abierto}` | `400 INVALID_INPUT` (`project_id`, `factura`) |

Tool expuesta: `factura-rectificativa.calcular` (`toolCalcular` → `_calcular`).

## Reglas de negocio

1. **Tipos cerrados (const `TIPOS`)**: `['abono', 'devolucion', 'descuento',
   'anulacion']`.
2. **Polaridad fija**: `signo:-1`; la rectificativa **corrige**, no se suma al
   original.
3. **No borra**: `borra_original:false`. La original queda intacta; la rectificativa
   es OTRA factura.
4. **Sin original ni importe**: la rectificativa queda **ABIERTA** con
   `'no hay factura original con importes ni importe a rectificar declarado: no se
   inventa la rectificativa'`. **No se estima.**
5. **Localiza la original** (`_buscarOriginal`) entre las facturas emitidas
   observadas (`_almacen`) mediante `factura_id` / `serie+numero`.
6. **Sin `factura`** (ni original localizable) → `400 INVALID_INPUT factura`.
7. **No escribe**: la emisión la hace O1 y el asiento B2, por evento.
8. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `calcular` — rectificativa desde la original

```json
{
  "project_id": "e57a318a-...",
  "serie": "F2026",
  "numero": 1,
  "tipo": "abono",
  "motivo": "devolucion parcial",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "original_id": "F2026-1", "tipo": "abono", "rectificativa": { "base": -100.0, "iva": -21.0, "total": -121.0, "signo": -1, "motivo": "devolucion parcial" }, "calculada": true, "borra_original": false, "abierto": { "importe": null } }
```
Sin original ni importe → `rectificativa:null` y `abierto.importe` declarado.

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `factura` — falta el campo o no hay original.
- `200 {rectificativa:null, abierto.importe}` — sin datos no se estima (honesto).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.factura_emitida` (O1
  `emision-factura-venta`).
- **Hacia delante (sube por evento)**: la emisión real la hace O1
  (`emision-factura-venta.emitir.request`) y el asiento `escritor-diario` (B2). Esta
  hoja solo calcula.
- No escribe, no persiste.

## Verificación

- **Fichero**: `modules/contabilidad-entrada/factura-rectificativa/` (clase
  `FacturaRectificativa extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "factura_emitida" module.json index.js` y
  `grep -F "TIPOS" index.js`.
- **Test unitario**: con original observable + importe → `signo:-1`,
  `borra_original:false`; sin original ni importe → `rectificativa:null` +
  `abierto`; `onFacturaEmitida` guarda la referencia.

## Notas de implementación

- Stateless: sin `PosPersistencia`; registro derivado en memoria (`_almacen`).
- Helpers: `_calcular`, `_encadenar`, `_buscarOriginal`, `_idFactura`, `_tipo`,
  `_num`, `toolCalcular`.
