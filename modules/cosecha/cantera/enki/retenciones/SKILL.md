---
name: retenciones
description: >-
  Skill FULL del módulo REFLEJO STATELESS `retenciones` de la vertical
  contabilidad (Enki, eje fiscal). Retenciones PRACTICADAS (475, salida que el
  negocio practica a otros) y SOPORTADAS (473, que le practican) calculadas desde
  los asientos vía el mayor. No calcula la cifra por su cuenta: recibe los saldos
  (o los sube por EVENTO). Lo inclasificable NO se cuenta, se declara en abierto.
  No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites las retenciones practicadas y soportadas de un ejercicio (RPC
    retenciones.calcular.request).
  - Cuando depures retenciones no clasificables (abierto con su saldo) o un 400
    INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    naturaleza 475/473.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, fiscal, retenciones, irpf, iva, determinista]
---

# retenciones — REFLEJO STATELESS de las retenciones practicadas y soportadas

## Qué hace el módulo

`retenciones` es un **REFLEJO STATELESS** (D4, hoja del plan, eje fiscal):
calcula las **retenciones PRACTICADAS** y **SOPORTADAS** desde los asientos (vía el
**mayor**). **Determinista**.

- **Practicadas** = retenciones que EL NEGOCIO practica a otros (salida: cuenta
  **4751**).
- **Soportadas** = retenciones que a EL NEGOCIO le practican (entrada: cuenta
  **473**).

**NO calcula la cifra por su cuenta** (eso es `mayor-balanza`): **RECIBE los
saldos** (o los **sube por EVENTO** a `mayor-balanza.saldos.request`, best-effort) y
**AISLA** las cuentas de retención. La naturaleza sale de la **cuenta declarada o de
su prefijo** (`475` practicada / `473` soportada); lo inclasificable **NO se cuenta**,
se declara en `abierto` con su saldo. **Honestidad**: sin saldos no se inventan
retenciones.

No escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus, sin panel.
Publica `retenciones.calcular.response` y su par `.failed`. Escucha
`contabilidad.asiento_asentado` (B2 `escritor-diario`).

> **Nota R3**: la escucha de `contabilidad.ejercicio_cerrado` del plan **NO se
> declara**: su emisor `cierre-ejercicio` (C4) aún no existe.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `retenciones.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, saldos?, fecha?, ejercicio?}` → `{project_id, practicadas, soportadas, neto, detalle, determinista, abierto}`. Aísla las cuentas de retención y las clasifica por naturaleza. Responde por `retenciones.calcular.response`. Payload inválido → `retenciones.calcular.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada); no se recalcula ni se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `retenciones.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `retenciones.calcular.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `calcular.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** (bus) | `{project_id, saldos?, fecha?, ejercicio?}` | `{project_id, practicadas, soportadas, neto, detalle, determinista, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `retenciones.calcular` (`toolCalcular` → `_calcular`).

## Reglas de negocio

1. **Naturaleza por prefijo/cuenta** (`_naturaleza`): `475` → **practicada**;
   `473` → **soportada**. La cuenta declarada manda; si no, el prefijo.
2. **Lo inclasificable NO se cuenta** (`_esRetencion`): se declara en `abierto` con
   su saldo, no se suma.
3. **`neto`** = practicadas − soportadas (resumen del efecto).
4. **No calcula la cifra**: los saldos vienen declarados o de `mayor-balanza`
   (subida best-effort).
5. **Honestidad**: sin saldos no se inventan retenciones.
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **No escribe, no persiste**: reflejo derivador.
8. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `calcular` — practicadas y soportadas

```json
{
  "project_id": "e57a318a-...",
  "saldos": [ { "cuenta": "4751", "saldo": 800 }, { "cuenta": "473", "saldo": 300 } ],
  "ejercicio": "2026",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "practicadas": 800, "soportadas": 300, "neto": 500, "detalle": [ { "cuenta": "4751", "naturaleza": "practicada", "saldo": 800 }, { "cuenta": "473", "naturaleza": "soportada", "saldo": 300 } ], "determinista": true, "abierto": { "inclasificable": null } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {abierto.inclasificable}` — cuenta de retención no clasificable: no se cuenta.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`).
  Sube best-effort `mayor-balanza.saldos.request` (B3).
- **Hacia delante (lo consumen)**: `modelo-303`, `modelo-390`,
  `obligacion-seguridad-social`, `estimacion-is-irpf`, `asiento-personal`.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-fiscal/retenciones/` (clase `Retenciones
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "asiento_asentado" module.json index.js`.
- **Test unitario**: 4751 → practicada; 473 → soportada; cuenta ambigua → `abierto`;
  sin `project_id` → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana `this._vistos` (máx. 1000).
- Helpers: `_calcular`, `_saldosDe`, `_esRetencion`, `_naturaleza`, `_saldo`,
  `toolCalcular`.
