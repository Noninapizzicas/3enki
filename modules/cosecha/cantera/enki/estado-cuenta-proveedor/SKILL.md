---
name: estado-cuenta-proveedor
description: >-
  Skill FULL del módulo REFLEJO STATELESS `estado-cuenta-proveedor` de la vertical
  contabilidad (Enki). Extracto CONFRONTABLE con el proveedor (conciliación de
  saldos). NO calcula el saldo (eso es cuenta-proveedor N3): le sube por EVENTO
  cuenta-proveedor.saldo.request y ARMA el extracto (cabecera + movimientos + saldo
  de cierre). No afirma cuadre: solo publica NUESTRO saldo. Sin tercero no se inventa
  cuenta; sin saldo el extracto queda ABIERTO. No escribe, no persiste; su cara es
  el bus.
when-to-use: >-
  - Cuando necesites un extracto confrontable con el proveedor (RPC
    estado-cuenta-proveedor.extracto.request).
  - Cuando depures un extracto abierto (sin saldo → desconocido) o un 400
    INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y por qué
    no afirma cuadre.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, entrada, proveedor, extracto, conciliacion, determinista]
---

# estado-cuenta-proveedor — REFLEJO STATELESS del extracto confrontable

## Qué hace el módulo

`estado-cuenta-proveedor` es un **REFLEJO STATELESS** (N4, hoja del plan): el
**extracto CONFRONTABLE** con el proveedor (conciliación de saldos). Derivación
determinista.

**NO calcula el saldo** (eso es `cuenta-proveedor` N3): le **SUBE por EVENTO**
`cuenta-proveedor.saldo.request` y **ARMA el extracto** (cabecera + movimientos +
saldo de cierre). **NO afirma cuadre**: solo publica NUESTRO saldo; confronta el
proveedor. **Honestidad (invariante 13)**: sin tercero no se inventa cuenta; **sin
saldo el extracto queda ABIERTO** (**0 no es "sin deuda", es desconocido**).

No escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus, sin panel.
Publica `estado-cuenta-proveedor.extracto.response` y su par `.failed`. Escucha
`contabilidad.asiento_asentado` (B2 `escritor-diario`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `estado-cuenta-proveedor.extracto.request` | `onExtractoRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, tercero\|proveedor\|nif, desde?, hasta?, movimientos?, facturas?, saldo?}` → `{project_id, tercero, cabecera, movimientos[], saldo_cierre, confrontable, abierto}`. Arma el extracto; sin saldo queda abierto. Responde por `estado-cuenta-proveedor.extracto.response`. Payload inválido → `estado-cuenta-proveedor.extracto.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada) como fuente alternativa; no se recalcula ni se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `estado-cuenta-proveedor.extracto.response` | Respuesta RPC correlada de la op `extracto` (una sola cara: el bus). |
| `estado-cuenta-proveedor.extracto.failed` | Par de fallo determinista: falta `project_id` o `tercero` → `{status, code, message}`. Cierra el círculo de `extracto.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `extracto` | **PREGUNTA** (bus) | `{project_id, tercero\|proveedor\|nif, desde?, hasta?, movimientos?, facturas?, saldo?}` | `{project_id, tercero, cabecera, movimientos[], saldo_cierre, confrontable, abierto}` | `400 INVALID_INPUT` (`project_id`, `tercero`) |

Tool expuesta: `estado-cuenta-proveedor.extracto` (`toolExtracto` → `_extracto`).

## Reglas de negocio

1. **No afirma cuadre**: solo arma NUESTRO extracto (saldo de cierre) para que el
   proveedor lo confronte. `confrontable:true` no significa "cuadra".
2. **No calcula el saldo**: lo pide por EVENTO a `cuenta-proveedor.saldo.request`
   (N3) o lo recibe declarado (`_deCuentaProveedor`).
3. **Honestidad**: sin tercero no se inventa cuenta (`400 INVALID_INPUT tercero`);
   sin saldo el extracto queda **ABIERTO** (0 no es "sin deuda", es desconocido).
4. **Ventana declarable**: `desde`/`hasta` filtran los movimientos (`_movimientosDe`).
5. **No escribe, no persiste**: reflejo derivador.
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `extracto` — extraer y confrontar

```json
{
  "project_id": "e57a318a-...",
  "tercero": "PROV-A",
  "desde": "2026-09-01",
  "hasta": "2026-09-30",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "tercero": "PROV-A", "cabecera": { "tercero": "PROV-A", "desde": "2026-09-01", "hasta": "2026-09-30" }, "movimientos": [ { "fecha": "2026-09-10", "concepto": "Compra", "debe": 0, "haber": 1500 } ], "saldo_cierre": -1500.0, "confrontable": true, "abierto": { "saldo": null } }
```
Sin saldo → `saldo_cierre:null` con `abierto.saldo` declarado.

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `tercero` — falta el campo; sin tercero no hay
  extracto.
- `200 {saldo_cierre:null, abierto.saldo}` — sin saldo (desconocido, no 0).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`).
  Sube best-effort `cuenta-proveedor.saldo.request` (N3).
- **Hacia delante (lo consumen)**: la conciliación de saldos con el proveedor; los
  informes de proveedores.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-entrada/estado-cuenta-proveedor/` (clase
  `EstadoCuentaProveedor extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "asiento_asentado" module.json index.js`.
- **Test unitario**: extracto con movimientos y saldo → `saldo_cierre` correcto;
  sin saldo → `abierto.saldo`; sin tercero → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_extracto`, `_deCuentaProveedor`, `_movimientosDe`, `_tercero`, `_num`,
  `toolExtracto`.
