---
name: mayor-balanza
description: >-
  Skill FULL del módulo REFLEJO STATELESS `mayor-balanza` de la vertical
  contabilidad (Enki). Saldos por CUENTA y BALANZA de comprobación DERIVADOS del
  diario (determinista). Escucha contabilidad.asiento_asentado (B2) y acumula el
  mayor en memoria: NO escribe el libro, lo LEE. Debe/Haber se conservan separados
  y las líneas sin cuenta se agrupan aparte (sin_cuenta), no se imputan a una
  cuenta inventada. No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites los saldos por cuenta o la balanza de comprobación (RPC
    mayor-balanza.saldos.request / mayor-balanza.balanza.request).
  - Cuando depures por qué hay movimientos en `sin_cuenta` o `cuadra:false`, o un
    400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y su rol
    de derivador del mayor.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, libro, mayor, balanza, derivado, determinista]
---

# mayor-balanza — REFLEJO STATELESS del mayor y la balanza

## Qué hace el módulo

`mayor-balanza` es un **REFLEJO STATELESS** (B3, hoja del plan): calcula los
**saldos por CUENTA** y la **BALANZA de comprobación** DERIVADOS del diario. El
cálculo es **DETERMINISTA** (mismo diario → mismos saldos).

Escucha `contabilidad.asiento_asentado` (B2 `escritor-diario`) y va acumulando su
**DERIVADO en memoria** (el mayor): **NO escribe el libro, lo LEE**. Debe/Haber se
conservan **separados** y se deriva el saldo por cuenta. **Sin cuenta declarada**,
los movimientos se agrupan aparte (`sin_cuenta`), **no se imputan a una cuenta
inventada**. No escribe, no persiste. Sus ops (`saldos`, `balanza`) son **CLASE
PREGUNTA** → van por el bus, sin panel. Publica los pares `saldos`/`balanza`
`.response`/`.failed`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `mayor-balanza.saldos.request` | `onSaldosRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, prefijo?, cuenta?}` → `{project_id, saldos, num_cuentas, total_debe, total_haber, cuadra}`. Deriva los saldos por cuenta del mayor. Sin `project_id` → `INVALID_INPUT`. Responde por `mayor-balanza.saldos.response`. |
| `mayor-balanza.balanza.request` | `onBalanzaRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id}` → `{project_id, balanza:[{cuenta, suma_debe, suma_haber, saldo_deudor, saldo_acreedor}], total_debe, total_haber, cuadra}`. Balanza de comprobación por cuenta. Responde por `mayor-balanza.balanza.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (lo emite `escritor-diario` B2): un asiento quedó en el libro → se acumula en el mayor derivado. No responde (no es RPC) ni publica nada. |

### Publishes

| Evento | Descripción |
|---|---|
| `mayor-balanza.saldos.response` | Respuesta RPC correlada de la op `saldos`. |
| `mayor-balanza.saldos.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `saldos.request`. |
| `mayor-balanza.balanza.response` | Respuesta RPC correlada de la op `balanza`. |
| `mayor-balanza.balanza.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `balanza.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `saldos` | **PREGUNTA** (bus) | `{project_id, prefijo?, cuenta?}` | `{project_id, saldos, num_cuentas, total_debe, total_haber, cuadra}` | `400 INVALID_INPUT project_id` |
| `balanza` | **PREGUNTA** (bus) | `{project_id}` | `{project_id, balanza[], total_debe, total_haber, cuadra}` | `400 INVALID_INPUT project_id` |

Tools expuestas: `mayor-balanza.saldos` (`toolSaldos`) y `mayor-balanza.balanza`
(`toolBalanza`).

## Reglas de negocio

1. **Dato ausente = desconocido**: una línea **sin cuenta** NO se imputa a una
   cuenta inventada; se conserva como la clave `(sin_cuenta)` y se declara en
   `abierto`.
2. **Debe/Haber separados**: se acumulan por separado por cuenta y se deriva
   `saldo_deudor`/`saldo_acreedor` en la balanza.
3. **Cuadre**: `cuadra` compara `total_debe` vs `total_haber` (el mayor debería
   cuadrar si el libro cuadra).
4. **No escribe, no persiste, no muta**: su acumulado es un DERIVADO en memoria
   (`this._mayores`: Map `project_id` → Map `cuenta` → `{cuenta, debe, haber,
   movimientos}`).
5. **Filtros**: `saldos` acepta `prefijo` (por prefijo de cuenta) y `cuenta`.
6. **Sin `project_id`** → `400 INVALID_INPUT` + el par `.failed` correspondiente.
7. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `saldos` — saldos por cuenta

```json
{ "project_id": "e57a318a-...", "prefijo": "6", "correlation_id": "abc-123" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "saldos": [ { "cuenta": "600", "debe": 120.0, "haber": 0, "saldo": 120.0, "movimientos": 1 } ], "num_cuentas": 1, "total_debe": 120.0, "total_haber": 0, "cuadra": false, "abierto": { "lineas_sin_cuenta": null } }
```

### `balanza` — balanza de comprobación

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "balanza": [ { "cuenta": "600", "suma_debe": 120.0, "suma_haber": 0, "saldo_deudor": 120.0, "saldo_acreedor": 0 } ], "total_debe": 120.0, "total_haber": 120.0, "cuadra": true }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `cuadra:false` — los totales no coinciden (o hay movimientos sin contrapartida).
- `200 {sin_cuenta}` — hubo líneas sin cuenta agrupadas aparte (no se inventan).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`).
- **Hacia delante (lo consumen)**: `balance-situacion` (C1), `cuenta-resultados`
  (C2), `retenciones` (D4), `saldo-tesoreria` (E4), `cuenta-proveedor` (N3),
  `margen-analitico` (J2) — todos le **suben** `mayor-balanza.saldos.request`
  (best-effort) para no calcular la cifra por su cuenta.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-libro/mayor-balanza/` (clase `MayorBalanza
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "asiento_asentado" module.json index.js`.
- **Test unitario**: tras `onAsientoAsentado`, `saldos` devuelve la cuenta
  acumulada; `balanza` cuadra con un asiento cuadrado; una línea sin cuenta cae en
  `(sin_cuenta)`; sin `project_id` → `400 INVALID_INPUT`.

## Notas de implementación

- Store derivado en memoria: `this._mayores` (Map); se puebla en `onAsientoAsentado`
  vía `_acumular`.
- `onSaldosRequest`/`onBalanzaRequest` delegan en `_atender(...)`; publican el par
  `.failed` si el status ≠ 200.
- Helpers: `_acumular`, `_saldos`, `_balanza`, `_mayor`, `_num`, `toolSaldos`,
  `toolBalanza`.
