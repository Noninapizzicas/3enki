---
name: emision-factura-venta
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `emision-factura-venta` de la
  vertical contabilidad (Enki). La cara EMITIDA de la factura de venta con
  SERIE/NUMERACIÓN: un número duplicado = corrupción → UN escritor. El cerrojo es
  la unicidad (serie, numero) — duplicado se rechaza (409 NUMERO_DUPLICADO), no se
  renumera en silencio. Append-only: una rectificación es OTRA factura (O2).
  Persiste por proyecto vía PosPersistencia y anuncia contabilidad.factura_emitida.
when-to-use: >-
  - Cuando necesites emitir una factura de venta con su serie/número único
    (RPC emision-factura-venta.emitir.request).
  - Cuando depures por qué una emisión se rechaza (409 NUMERO_DUPLICADO, 400
    INVALID_INPUT sin base/líneas/total) o no se emite contabilidad.factura_emitida.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    numeración por serie.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, entrada, factura-venta, numeracion, append-only]
---

# emision-factura-venta — CUSTODIO CON PERSISTENCIA de la factura de venta

## Qué hace el módulo

`emision-factura-venta` es un **CUSTODIO CON PERSISTENCIA** (O1, hoja del plan):
la cara **EMITIDA** de la factura de venta con **SERIE/NUMERACIÓN**. Es decisión
del dueño que contabilidad **SÍ** emita la factura de venta; y por eso es custodio:
**un número duplicado = corrupción → UN escritor**.

Su cerrojo es la **unicidad por (serie, numero)**: emitir dos veces la misma
`(serie, numero)` se **RECHAZA** (`409 NUMERO_DUPLICADO`); **no se renumera en
silencio**. El número se **DECLARA** o se toma el **SIGUIENTE** de la serie
(secuencia del custodio); **sin base ni líneas ni total NO se emite** (no se
fabrica la cuantía). Es **APPEND-ONLY**: la factura emitida se apila; una
rectificación es **OTRA factura** (O2), no una edición.

Es **CLASE ORDEN** → **SÍ lleva `ui_handler`** (`system_panel`,
`lateral_derecha`). Persiste por proyecto vía **PosPersistencia** (storage
`/contabilidad/emision-factura-venta`), restaura en `project.activated` y vuelca
en `onUnload`. **R2**: al emitir publica el HECHO `contabilidad.factura_emitida`
(lo consumen `registro-verifactu` y `factura-rectificativa`) y **sube best-effort**
a verifactu / factura-electrónica / asiento / tercero / archivo.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `emision-factura-venta.emitir.request` | `onEmitirRequest` | RPC custodio (ORDEN, panel): `{project_id, serie?, numero?, base?, iva?, total?, lineas?, tercero?, asiento?, fecha?}` → `{project_id, factura, emitida, total_emitidas, ultimo_de_serie, append_only, abierto}`. Numeración única por `(serie,numero)`: duplicado → `409 NUMERO_DUPLICADO`. Publica `contabilidad.factura_emitida` (R2) y responde por `emision-factura-venta.emitir.response`. Payload inválido o número duplicado → `emision-factura-venta.emitir.failed`. |
| `project.activated` | `onProjectActivated` | Restaura la numeración por serie del proyecto activado desde el storage (PosPersistencia). Emitido por el core. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.factura_emitida` | Fire-and-forget (O1): una factura de venta quedó emitida → `{project_id, factura, serie, numero, total}`. Lo consumen `registro-verifactu` y `factura-rectificativa`. |
| `emision-factura-venta.emitir.response` | Respuesta RPC correlada de la op `emitir`. |
| `emision-factura-venta.emitir.failed` | Par de fallo determinista: falta `project_id`/`base`/`lineas` o la `(serie,numero)` ya existe (`409 NUMERO_DUPLICADO`) → `{status, code, message}`. Cierra el círculo de `emitir.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `emitir` | **ORDEN** (panel) | `{project_id, serie?, numero?, base?, iva?, total?, lineas?, tercero?, asiento?, fecha?}` | `{project_id, factura, emitida, total_emitidas, ultimo_de_serie, append_only, abierto}` | `400 INVALID_INPUT` (`project_id`, `serie`, `base`); `409 NUMERO_DUPLICADO` |

Tools expuestas: `emision-factura-venta.emitir` (`toolEmitir` → `_emitir`).
Lectura de proceso: `facturaDe(...)`.

## Reglas de negocio

1. **Cerrojo de unicidad**: `(serie, numero)` es clave; si ya existe →
   `409 NUMERO_DUPLICADO` (**no se renumera en silencio**). La proyección
   `_emitir` detecta el duplicado antes de apilar.
2. **Siguiente de serie**: si no se declara `numero`, se toma el **siguiente** de
   la serie (secuencia del custodio, `_serieDe`/`_encadenar`); `ultimo_de_serie`
   lo reporta.
3. **Sin cuantía no se emite**: sin `base` ni líneas ni total → `400
   INVALID_INPUT base` (no se fabrica la cuantía).
4. **Sin `serie`** → `400 INVALID_INPUT serie`.
5. **APPEND-ONLY**: la factura emitida se apila; una rectificación es OTRA factura
   (O2 `factura-rectificativa`), nunca una edición.
6. **R2 — anuncia el hecho**: al emitir se publica `contabilidad.factura_emitida`
   y se sube best-effort a verifactu/factura-electrónica/asiento/tercero/archivo.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; duplicado → `409`;
   excepción no capturada → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPC)

### `emitir` — factura con serie e IVA

```json
{
  "project_id": "e57a318a-...",
  "serie": "F2026",
  "base": 1000.0,
  "iva": 210.0,
  "tercero": "Cliente A",
  "lineas": [ { "descripcion": "Servicio", "base": 1000.0 } ],
  "fecha": "2026-09-25",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.factura_emitida`):
```json
{ "project_id": "e57a318a-...", "factura": { "serie": "F2026", "numero": 1, "base": 1000.0, "iva": 210.0, "total": 1210.0 }, "emitida": true, "total_emitidas": 1, "ultimo_de_serie": 1, "append_only": true, "abierto": { "tercero": null } }
```

### Fallo — número duplicado

```json
{ "project_id": "e57a318a-...", "serie": "F2026", "numero": 1, "base": 100, "iva": 21 }
```
Respuesta `409` + `emision-factura-venta.emitir.failed`:
```json
{ "status": 409, "code": "NUMERO_DUPLICADO", "message": "la factura (serie,numero) ya existe: no se renumera en silencio", "details": { "serie": "F2026", "numero": 1 } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `serie` / `base` — falta el campo; sin cuantía
  no se emite.
- `409 NUMERO_DUPLICADO` — la `(serie, numero)` ya está emitida (corrupción
  evitada).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (publica el hecho)**: `contabilidad.factura_emitida` lo consumen
  `registro-verifactu` y `factura-rectificativa` (O2). Sube best-effort (REQUEST
  por evento) a verifactu / factura-electrónica / asiento (`escritor-diario`) /
  tercero (`maestro-terceros`) / archivo (`expediente-documental`).
- **Hacia atrás (restaura)**: `project.activated` (core).
- No importa a nadie: solo publica y sube.

## Verificación

- **Fichero**: `modules/contabilidad-entrada/emision-factura-venta/` (clase
  `EmisionFacturaVenta extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "factura_emitida" module.json index.js` y
  `grep -F "NUMERO_DUPLICADO" index.js`.
- **Test unitario**: emitir con serie nueva → `200` + `contabilidad.factura_emitida`;
  repetir la misma `(serie,numero)` → `409 NUMERO_DUPLICADO` + `.failed`; sin
  `base`/`lineas`/`total` → `400 INVALID_INPUT`; `project.activated` restaura.

## Notas de implementación

- Store en memoria: numeración por serie (`_obtenerOCrear`, `_serieDe`, `_contar`,
  `_encadenar`).
- **PosPersistencia**: `file: 'emision-factura-venta.json'`, `dir:
  '/contabilidad/emision-factura-venta'`; restaura en `onProjectActivated`, vuelca
  en `onUnload` (`flush` + `detener`).
- `_emitir` es la proyección (ORDEN); `toolEmitir` la envuelve.
- `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo` / `base-module`.
