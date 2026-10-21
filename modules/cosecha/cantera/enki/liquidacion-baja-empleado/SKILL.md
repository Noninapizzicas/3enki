---
name: liquidacion-baja-empleado
description: >-
  Skill FULL del módulo REFLEJO STATELESS `liquidacion-baja-empleado` de la
  vertical contabilidad (Enki, eje fiscal). Cierre de la cuenta del trabajador:
  finiquito + indemnización de la baja (salario pendiente + vacaciones no
  disfrutadas + indemnización − IRPF − SS − anticipos = neto a pagar) para que NO
  quede un acreedor abierto. No calcula la nómina ordinaria: LIQUIDA la relación.
  Sin salario_dia/dias no se estima la indemnización. No escribe, no persiste; su
  cara es el bus.
when-to-use: >-
  - Cuando necesites liquidar la baja de un empleado (RPC
    liquidacion-baja-empleado.liquidar.request).
  - Cuando depures una liquidación abierta (sin salario_dia/dias → no se estima) o un
    400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el
    cierre de la cuenta del trabajador.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, fiscal, nomina, finiquito, indemnizacion, baja, determinista]
---

# liquidacion-baja-empleado — REFLEJO STATELESS de la liquidación de baja

## Qué hace el módulo

`liquidacion-baja-empleado` es un **REFLEJO STATELESS** (G10, hoja del plan, eje
fiscal): el **cierre de la cuenta del trabajador** — **finiquito + indemnización**
de la baja (salario pendiente + vacaciones no disfrutadas + indemnización − IRPF −
SS − anticipos = **neto a pagar**) para que **NO quede un acreedor abierto**.
**Determinista**.

**NO calcula la nómina ordinaria** (`lineas-nomina`/`recibo-nomina`): **LIQUIDA la
relación**. **SUBE por EVENTO** `cuenta-proveedor.saldo.request` para leer lo que
aún se le debe y comprobar si la liquidación cierra la cuenta. **SUBE**
`escritor-diario.asentar.request` **solo si puede construir el asiento** (cuentas
declaradas); quien ESCRIBE el libro es B2 (single-writer).

**Honestidad (invariante 13)**: sin `salario_dia`/`dias` no se estima la
indemnización; un acreedor que no se cierra **se declara** (no se finge cerrado).
No escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus, sin panel.
Publica `liquidacion-baja-empleado.liquidar.response` y su par `.failed`. Escucha
`contabilidad.nomina_recibida` (G5 `puerto-nomina`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `liquidacion-baja-empleado.liquidar.request` | `onLiquidarRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, empleado, salario_dia?, dias?, dias_vacaciones?, anios?, dias_por_anio?, salario_pendiente?, vacaciones?, indemnizacion?, irpf_pct?, ss_pct?, anticipos?, cuentas?, asiento?, saldo_trabajador?, fecha_baja?}` → `{project_id, empleado, conceptos, bruto, retenciones, neto_pagar, saldo_trabajador, remanente, cierra_cuenta, abierto}`. Responde por `liquidacion-baja-empleado.liquidar.response`. Payload inválido → `liquidacion-baja-empleado.liquidar.failed`. |
| `contabilidad.nomina_recibida` | `onNominaRecibida` | Fire-and-forget (G5 `puerto-nomina`): llegó una nómina. Se observa (ventana acotada); no se recalcula ni se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `liquidacion-baja-empleado.liquidar.response` | Respuesta RPC correlada de la op `liquidar` (una sola cara: el bus). |
| `liquidacion-baja-empleado.liquidar.failed` | Par de fallo determinista: falta `project_id` o `empleado` → `{status, code, message}`. Cierra el círculo de `liquidar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `liquidar` | **PREGUNTA** (bus) | `{project_id, empleado, salario_dia?, dias?, ..., cuentas?, asiento?, saldo_trabajador?, fecha_baja?}` | `{project_id, empleado, conceptos, bruto, retenciones, neto_pagar, saldo_trabajador, remanente, cierra_cuenta, abierto}` | `400 INVALID_INPUT` (`project_id`, `empleado`) |

Tool expuesta: `liquidacion-baja-empleado.liquidar` (`toolLiquidar` →
`_liquidar`).

## Reglas de negocio

1. **Finiquito + indemnización**: `bruto = salario_pendiente + vacaciones +
   indemnización`; `retenciones = IRPF + SS + anticipos`; `neto_pagar = bruto −
   retenciones`.
2. **Sin `salario_dia`/`dias` no se estima la indemnización** (invariante 13).
3. **Cierre de la cuenta**: `saldo_trabajador` (leído por EVENTO de N3) − neto =
   `remanente`; `cierra_cuenta` indica si queda a cero. Un acreedor que **no se
   cierra se declara** (no se finge cerrado).
4. **Asiento solo si es construible**: sube `escritor-diario.asentar.request`
   (`_subirAsiento`/`_construirAsiento`) **solo si las cuentas están declaradas**;
   quien escribe es B2 (single-writer).
5. **No calcula la nómina ordinaria**: liquida la relación.
6. **Sin `empleado`** → `400 INVALID_INPUT empleado`; sin `project_id` → `400`.
7. **No escribe, no persiste**: reflejo derivador.
8. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `liquidar` — finiquito + indemnización

```json
{
  "project_id": "e57a318a-...",
  "empleado": "EMP-1",
  "salario_dia": 80.0,
  "dias": 20,
  "dias_vacaciones": 5,
  "anios": 2,
  "dias_por_anio": 33,
  "irpf_pct": 15,
  "ss_pct": 6.35,
  "cuentas": { "gasto": "640", "a_pagar": "465" },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y sube `escritor-diario.asentar.request` si el asiento es
construible):
```json
{ "project_id": "e57a318a-...", "empleado": "EMP-1", "conceptos": [ { "concepto": "salario_pendiente", "importe": 1600.0 }, { "concepto": "vacaciones", "importe": 400.0 }, { "concepto": "indemnizacion", "importe": 5280.0 } ], "bruto": 7280.0, "retenciones": { "irpf": 1092.0, "ss": 462.28 }, "neto_pagar": 5725.72, "saldo_trabajador": 0, "remanente": -5725.72, "cierra_cuenta": false, "abierto": { "indemnizacion": null } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `empleado` — falta el campo.
- `200 {abierto.indemnizacion}` — sin salario_dia/dias no se estima la indemnización.
- `cierra_cuenta:false` — queda remanente: se declara, no se finge cerrado.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.nomina_recibida` (G5 `puerto-nomina`).
  Sube best-effort `cuenta-proveedor.saldo.request` (N3).
- **Hacia delante (sube por evento)**: `escritor-diario.asentar.request` (B2) solo si
  el asiento es construible.
- No escribe, no persiste.

## Verificación

- **Fichero**: `modules/contabilidad-fiscal/liquidacion-baja-empleado/` (clase
  `LiquidacionBajaEmpleado extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "nomina_recibida" module.json index.js`.
- **Test unitario**: cálculo de bruto/retenciones/neto; sin `salario_dia` → no se
  estima indemnización; `cierra_cuenta` coherente con el remanente; sube asiento solo
  si hay cuentas.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_liquidar`, `_subirAsiento`, `_construirAsiento`, `_saldoTrabajador`,
  `_num`, `toolLiquidar`.
