---
name: balance-situacion
description: >-
  Skill FULL del módulo REFLEJO STATELESS `balance-situacion` de la vertical
  contabilidad (Enki). Activo/pasivo/patrimonio DERIVADO del mayor; invariante
  ACTIVO = PASIVO + PATRIMONIO. No calcula la cifra por cuenta: RECIBE los saldos
  (o los sube por EVENTO a mayor-balanza) y los AGRUPA en masas. Lo ambiguo queda
  `desconocido` y no se suma → la invariante queda NO verificable (cuadra:null), no
  se finge un balance. No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites el balance de situación (activo/pasivo/patrimonio) de un
    proyecto (RPC balance-situacion.calcular.request).
  - Cuando depures un cuadra:null (no verificable por partidas inclasificables) o un
    400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    heurística PGC por prefijo.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, libro, balance, activo-pasivo, pymes, determinista]
---

# balance-situacion — REFLEJO STATELESS del balance de situación

## Qué hace el módulo

`balance-situacion` es un **REFLEJO STATELESS** (C1, hoja del plan): el **balance**
activo/pasivo/patrimonio **DERIVADO del mayor**, con la invariante **ACTIVO =
PASIVO + PATRIMONIO**.

**NO calcula la cifra por cuenta** (eso es `mayor-balanza`): **RECIBE los saldos**
(o los **sube por EVENTO** a `mayor-balanza.saldos.request`, best-effort) y los
**AGRUPA en masas**. **Honestidad (invariante 13)**: la masa sale de `masa`
declarada o de una **heurística PGC por prefijo**; lo ambiguo (grupo 4) queda
`desconocido` y **NO se suma** — entonces la invariante queda **NO verificable**
(`cuadra:null`), **no se finge un balance**.

No escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus, sin panel.
Publica `balance-situacion.calcular.response` y su par `.failed`. Escucha
`contabilidad.asiento_asentado` (B2 `escritor-diario`).

> **Nota R3**: la escucha de `contabilidad.ejercicio_cerrado` del plan **NO se
> declara**: su emisor `cierre-ejercicio` (C4) aún no existe.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `balance-situacion.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, saldos?, fecha?, ejercicio?}` → `{project_id, activo, pasivo, patrimonio, resultado, cuadra, verificable, invariante, partidas, abierto}`. Agrupa los saldos en masas; lo inclasificable queda abierto y la invariante no se afirma. Responde por `balance-situacion.calcular.response`. Payload inválido → `balance-situacion.calcular.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada) como fuente alternativa de saldos; no se recalcula ni se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `balance-situacion.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `balance-situacion.calcular.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `calcular.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** (bus) | `{project_id, saldos?, fecha?, ejercicio?}` | `{project_id, activo, pasivo, patrimonio, resultado, cuadra, verificable, invariante, partidas, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `balance-situacion.calcular` (`toolCalcular` → `_calcular`).

## Reglas de negocio

1. **Invariante ACTIVO = PASIVO + PATRIMONIO**: `cuadra` compara ambos lados.
2. **No calcula la cifra por cuenta**: recibe los saldos (`_saldosDe`) o los sube por
   EVENTO a `mayor-balanza.saldos.request`.
3. **Honestidad 13**: lo inclasificable (p. ej. grupo 4 ambiguo) queda `desconocido`
   y **NO se suma** → `cuadra:null`, `verificable:false`. **No se finge.**
4. **Clasificación por masa declarada o heurística PGC por prefijo** (`_masa`).
5. **No escribe, no persiste**: reflejo derivador.
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `calcular` — balance desde saldos declarados

```json
{
  "project_id": "e57a318a-...",
  "saldos": [ { "cuenta": "100", "saldo": 5000 }, { "cuenta": "400", "saldo": -3000 }, { "cuenta": "102", "saldo": -2000 } ],
  "ejercicio": "2026",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "activo": 5000, "pasivo": 3000, "patrimonio": 2000, "resultado": 0, "cuadra": true, "verificable": true, "invariante": "ACTIVO=PASIVO+PATRIMONIO", "partidas": [ { "cuenta": "100", "masa": "ACTIVO", "saldo": 5000 } ], "abierto": { "desconocido": null } }
```
Si hay partidas inclasificables → `cuadra:null`, `verificable:false` y
`abierto.desconocido` declarado (la invariante NO se afirma).

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `cuadra:null / verificable:false` — hay partidas no clasificables: no se finge.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`).
  Sube best-effort `mayor-balanza.saldos.request` (B3) para traer los saldos.
- **Hacia delante (lo consumen)**: `consolidacion` (I3), `narrador-estados` (R3),
  `cuadro-mando-contable`, `informe-rico`.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-libro/balance-situacion/` (clase
  `BalanceSituacion extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "asiento_asentado" module.json index.js`.
- **Test unitario**: saldos clasificables → `cuadra:true`; partida ambigua →
  `cuadra:null`, `verificable:false`; sin `project_id` → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_calcular`, `_saldosDe`, `_masa`, `_num`, `toolCalcular`.
