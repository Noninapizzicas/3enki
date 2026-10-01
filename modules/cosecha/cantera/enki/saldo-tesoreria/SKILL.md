---
name: saldo-tesoreria
description: >-
  Skill FULL del módulo REFLEJO STATELESS `saldo-tesoreria` de la vertical
  contabilidad (Enki). Posición real de DINERO por cuenta (grupo 5 PGC); derivación
  determinista del mayor. La MONEDA la DECLARA maestro-cuentas-bancarias (E11) vía
  contabilidad.cuenta_bancaria_declarada — no la adivina ni asume EUR. Sin saldos no
  se inventa la posición; con moneda sin declarar o varias monedas el total NO es
  agregable (posicion:null). No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites la posición de tesorería (dinero) por cuenta (RPC
    saldo-tesoreria.calcular.request).
  - Cuando depures una posicion:null (moneda sin declarar o varias monedas) o un 400
    INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    moneda declarada por E11.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, libro, tesoreria, dinero, moneda, determinista]
---

# saldo-tesoreria — REFLEJO STATELESS de la posición de tesorería

## Qué hace el módulo

`saldo-tesoreria` es un **REFLEJO STATELESS** (E4, hoja del plan): la **posición
real de DINERO** por cuenta (grupo **5** PGC), derivada del **mayor** de forma
determinista.

La **MONEDA** la **DECLARA** `maestro-cuentas-bancarias` (E11) vía el hecho
`contabilidad.cuenta_bancaria_declarada` — este reflejo **NO la adivina ni asume
EUR**. **Honestidad**: sin saldos no se inventa la posición; con moneda sin
declarar o **varias monedas** el total **NO es agregable** (`posicion:null`), **no
se mezcla a ciegas**.

No escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus, sin panel.
Publica `saldo-tesoreria.calcular.response` y su par `.failed`. Escucha
`contabilidad.asiento_asentado` (B2) y `contabilidad.cuenta_bancaria_declarada`
(E11).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `saldo-tesoreria.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, saldos?, fecha?, ejercicio?}` → `{project_id, posicion, moneda, agregable, cuentas, abierto}`. Agrupa el saldo por cuenta de tesorería; el total solo es agregable con moneda única declarada. Responde por `saldo-tesoreria.calcular.response`. Payload inválido → `saldo-tesoreria.calcular.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada); no se recalcula ni se escribe. |
| `contabilidad.cuenta_bancaria_declarada` | `onCuentaBancariaDeclarada` | Fire-and-forget (E11 `maestro-cuentas-bancarias`): quedó declarada una cuenta bancaria y su moneda. Se registra para no asumir la moneda al calcular la posición. |

### Publishes

| Evento | Descripción |
|---|---|
| `saldo-tesoreria.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `saldo-tesoreria.calcular.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `calcular.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** (bus) | `{project_id, saldos?, fecha?, ejercicio?}` | `{project_id, posicion, moneda, agregable, cuentas, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `saldo-tesoreria.calcular` (`toolCalcular` → `_calcular`).

## Reglas de negocio

1. **Solo dinero (grupo 5)**: `_esDinero` filtra las cuentas de tesorería (grupo 5
   PGC); las demás no forman la posición.
2. **La moneda no se adivina**: solo se conoce si E11 la declaró vía
   `contabilidad.cuenta_bancaria_declarada` (`_monedas`). **Nunca se asume EUR.**
3. **Agregabilidad**: `agregable` es `true` solo con **moneda única declarada**;
   con moneda desconocida o varias monedas → `posicion:null`, `agregable:false`
   (no se mezcla a ciegas).
4. **Honestidad**: sin saldos no se inventa la posición → `abierto`.
5. **No escribe, no persiste**: reflejo derivador.
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `calcular` — posición de tesorería

```json
{
  "project_id": "e57a318a-...",
  "saldos": [ { "cuenta": "572", "saldo": 5000 }, { "cuenta": "570", "saldo": 200 } ],
  "ejercicio": "2026",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "posicion": 5200, "moneda": "EUR", "agregable": true, "cuentas": [ { "cuenta": "572", "saldo": 5000 }, { "cuenta": "570", "saldo": 200 } ], "abierto": { "moneda": null } }
```
Moneda sin declarar o varias → `posicion:null`, `agregable:false` (no se agrega a
ciegas).

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {posicion:null, agregable:false}` — moneda desconocida/múltiple: no se
  mezcla.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2),
  `contabilidad.cuenta_bancaria_declarada` (E11 `maestro-cuentas-bancarias`). Sube
  best-effort `mayor-balanza.saldos.request` (B3).
- **Hacia delante (lo consumen)**: `partida-conciliatoria` (E9) sube
  `saldo-tesoreria.calcular.request`; `prevision-caja`, `conciliacion-bancaria`.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-libro/saldo-tesoreria/` (clase `SaldoTesoreria
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "cuenta_bancaria_declarada" module.json index.js`.
- **Test unitario**: cuentas grupo 5 con moneda única → `agregable:true`; sin moneda
  declarada → `posicion:null`; sin saldos → abierto; sin `project_id` → `400`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; `this._monedas` (Map `project_id` → Map
  `cuenta_id` → `{moneda, cuenta}`) y ventana observada.
- Helpers: `_calcular`, `_saldosDe`, `_esDinero`, `_num`, `toolCalcular`.
