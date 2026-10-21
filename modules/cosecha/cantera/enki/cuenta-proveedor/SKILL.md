---
name: cuenta-proveedor
description: >-
  Skill FULL del módulo REFLEJO STATELESS `cuenta-proveedor` de la vertical
  contabilidad (Enki). Mayor AUXILIAR del tercero: cada factura de compra viva y su
  saldo, DERIVADO del diario. No calcula la cifra por su cuenta (eso es
  mayor-balanza): recibe los saldos (o los sube por EVENTO) y AISLA los del
  tercero. Sin tercero no se inventa cuenta; sin saldos no se inventa saldo (0 no es
  'sin deuda', es desconocido). No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites el saldo o las facturas vivas de un proveedor/tercero (RPC
    cuenta-proveedor.saldo.request / cuenta-proveedor.facturas_vivas.request).
  - Cuando depures un 400 INVALID_INPUT (sin tercero) o un saldo declarado en
    abierto (sin saldos → desconocido).
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el
    aislamiento del tercero.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, entrada, proveedor, tercero, mayor-auxiliar, determinista]
---

# cuenta-proveedor — REFLEJO STATELESS del mayor auxiliar del tercero

## Qué hace el módulo

`cuenta-proveedor` es un **REFLEJO STATELESS** (N3, hoja del plan): el **mayor
AUXILIAR del tercero** — cada factura de compra viva y su saldo, **DERIVADO del
diario**.

**NO calcula la cifra por su cuenta** (eso es `mayor-balanza`): **RECIBE los
saldos** (o los **sube por EVENTO** a `mayor-balanza.saldos.request`, best-effort) y
**AISLA** los del **TERCERO** pedido. **Honestidad**: sin tercero declarado no se
inventa una cuenta; sin saldos no se inventa un saldo (**0 no es "sin deuda", es
"desconocido"**) → se declara en `abierto`.

No escribe, no persiste. Sus ops (`saldo`, `facturas_vivas`) son **CLASE
PREGUNTA** → van por el bus, sin panel. Publica
`cuenta-proveedor.saldo.response`, `cuenta-proveedor.facturas_vivas.response` y sus
pares `.failed`. Escucha `contabilidad.asiento_asentado` (B2) y
`contabilidad.tercero_actualizado` (N1).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `cuenta-proveedor.saldo.request` | `onSaldoRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, tercero\|proveedor\|nif, saldos?, fecha?, ejercicio?}` → `{project_id, tercero, saldo, debe, haber, num_cuentas, abierto}`. Aísla los saldos del tercero; sin tercero → `INVALID_INPUT`. Responde por `cuenta-proveedor.saldo.response`. Payload inválido → `cuenta-proveedor.saldo.failed`. |
| `cuenta-proveedor.facturas_vivas.request` | `onFacturasVivasRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, tercero\|proveedor\|nif, saldos?, fecha?}` → `{project_id, tercero, facturas, total_pendiente, abierto}`. Lista las facturas de compra vivas del tercero con su saldo y vencimiento. Responde por `cuenta-proveedor.facturas_vivas.response`. Payload inválido → `cuenta-proveedor.facturas_vivas.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada) para poder derivar el auxiliar; no se escribe. |
| `contabilidad.tercero_actualizado` | `onTerceroActualizado` | Fire-and-forget (N1 `maestro-terceros`): la ficha de un tercero cambió. Se registra la marca (conviene re-derivar); no se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `cuenta-proveedor.saldo.response` | Respuesta RPC correlada de la op `saldo` (una sola cara: el bus). |
| `cuenta-proveedor.saldo.failed` | Par de fallo determinista: falta `project_id` o `tercero` → `{status, code, message}`. Cierra el círculo de `saldo.request`. |
| `cuenta-proveedor.facturas_vivas.response` | Respuesta RPC correlada de la op `facturas_vivas` (una sola cara: el bus). |
| `cuenta-proveedor.facturas_vivas.failed` | Par de fallo determinista: falta `project_id` o `tercero` → `{status, code, message}`. Cierra el círculo de `facturas_vivas.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `saldo` | **PREGUNTA** (bus) | `{project_id, tercero\|proveedor\|nif, saldos?, fecha?, ejercicio?}` | `{project_id, tercero, saldo, debe, haber, num_cuentas, abierto}` | `400 INVALID_INPUT` (`project_id`, `tercero`) |
| `facturas_vivas` | **PREGUNTA** (bus) | `{project_id, tercero\|proveedor\|nif, saldos?, fecha?}` | `{project_id, tercero, facturas, total_pendiente, abierto}` | `400 INVALID_INPUT` (`project_id`, `tercero`) |

Tools expuestas: `cuenta-proveedor.saldo` (`toolSaldo`) y
`cuenta-proveedor.facturas_vivas` (`toolFacturasVivas`).

## Reglas de negocio

1. **Aislamiento del tercero** (`_esDelTercero`): solo se agregan los saldos del
   tercero pedido. Sin tercero declarado → `400 INVALID_INPUT tercero` (no se inventa
   una cuenta).
2. **Honestidad**: sin saldos no se inventa un saldo. `0` no significa "sin deuda",
   significa desconocido → `abierto`.
3. **No calcula la cifra**: los saldos vienen declarados o de `mayor-balanza`
   (subida best-effort).
4. **Facturas vivas**: se listan las de compra pendientes con su saldo y vencimiento;
   `total_pendiente` las resume.
5. **Sin `project_id`** → `400 INVALID_INPUT` + el par `.failed`.
6. **No escribe, no persiste**: reflejo derivador.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `saldo` — saldo del proveedor

```json
{ "project_id": "e57a318a-...", "tercero": "PROV-A", "correlation_id": "abc-123" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "tercero": "PROV-A", "saldo": -1500.0, "debe": 0, "haber": 1500.0, "num_cuentas": 1, "abierto": { "saldos": null } }
```

### `facturas_vivas` — facturas de compra pendientes

```json
{ "project_id": "e57a318a-...", "tercero": "PROV-A" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "tercero": "PROV-A", "facturas": [ { "numero": "C-10", "saldo": 1500.0, "vencimiento": "2026-10-15" } ], "total_pendiente": 1500.0, "abierto": { "saldos": null } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `tercero` — falta el campo; sin tercero no hay
  auxiliar.
- `200 {abierto.saldos}` — no hay saldos (desconocido, no 0).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2),
  `contabilidad.tercero_actualizado` (N1). Sube best-effort
  `mayor-balanza.saldos.request` (B3).
- **Hacia delante (lo consumen)**: `estado-cuenta-proveedor` (N4) sube
  `cuenta-proveedor.saldo.request`; `rappel-pronto-pago` (N7) y
  `liquidacion-baja-empleado` (G10) también leen el saldo.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-entrada/cuenta-proveedor/` (clase
  `CuentaProveedor extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "tercero_actualizado" module.json index.js`.
- **Test unitario**: saldo del tercero aislado; sin tercero → `400 INVALID_INPUT`;
  sin saldos → abierto (desconocido); `facturas_vivas` resume `total_pendiente`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_saldo`, `_facturas_vivas`, `_tercero`, `_saldosDe`, `_esDelTercero`,
  `_num`, `toolSaldo`, `toolFacturasVivas`.
