---
name: cuenta-resultados
description: >-
  Skill FULL del módulo REFLEJO STATELESS `cuenta-resultados` de la vertical
  contabilidad (Enki). Ingresos/gastos/resultado DERIVADO del mayor
  (resultado = ingresos − gastos), determinista. No calcula la cifra por cuenta:
  recibe los saldos (o los sube por EVENTO) y los agrega. Solo suma lo clasificable
  (grupo 6/7 o masa declarada); lo demás queda en abierto, no se suma a ciegas. No
  escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites la cuenta de resultados (ingresos/gastos/resultado) de un
    proyecto (RPC cuenta-resultados.calcular.request).
  - Cuando depures un abierto con partidas inclasificables o un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    clasificación grupo 6/7.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, libro, resultados, ingresos, gastos, determinista]
---

# cuenta-resultados — REFLEJO STATELESS de la cuenta de resultados

## Qué hace el módulo

`cuenta-resultados` es un **REFLEJO STATELESS** (C2, hoja del plan):
ingresos/gastos/resultado **DERIVADO del mayor**. **Determinista**.

**NO calcula la cifra por cuenta** (eso es `mayor-balanza`): **RECIBE los saldos**
(o los **sube por EVENTO** a `mayor-balanza.saldos.request`, best-effort) y los
**AGREGA** en ingresos y gastos; `resultado = ingresos − gastos`. **Honestidad**:
solo suma lo **CLASIFICABLE** (grupo 6/7 o masa declarada); lo demás queda en
`abierto`, **no se suma a ciegas**.

No escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus, sin panel.
Publica `cuenta-resultados.calcular.response` y su par `.failed`. Escucha
`contabilidad.asiento_asentado` (B2 `escritor-diario`).

> **Nota R3**: la escucha de `contabilidad.ejercicio_cerrado` del plan **NO se
> declara**: su emisor `cierre-ejercicio` (C4) aún no existe.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `cuenta-resultados.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, saldos?, fecha?, ejercicio?}` → `{project_id, ingresos, gastos, resultado, determinista, lineas, abierto}`. Agrega los saldos en ingresos/gastos; lo inclasificable queda abierto. Responde por `cuenta-resultados.calcular.response`. Payload inválido → `cuenta-resultados.calcular.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada); no se recalcula ni se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `cuenta-resultados.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `cuenta-resultados.calcular.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `calcular.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** (bus) | `{project_id, saldos?, fecha?, ejercicio?}` | `{project_id, ingresos, gastos, resultado, determinista, lineas, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `cuenta-resultados.calcular` (`toolCalcular` → `_calcular`).

## Reglas de negocio

1. **Resultado = ingresos − gastos**: agregación determinista.
2. **Solo lo clasificable se suma** (`_grupo`): grupo 6 (gastos) / grupo 7
   (ingresos) o masa declarada. Lo demás queda en `abierto` — **no se suma a
   ciegas**.
3. **No calcula la cifra por cuenta**: recibe los saldos (`_saldosDe`) o los sube por
   EVENTO a `mayor-balanza.saldos.request`.
4. **No escribe, no persiste**: reflejo derivador.
5. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
6. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `calcular` — ingresos, gastos y resultado

```json
{
  "project_id": "e57a318a-...",
  "saldos": [ { "cuenta": "700", "saldo": 10000 }, { "cuenta": "600", "saldo": 4000 } ],
  "ejercicio": "2026",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "ingresos": 10000, "gastos": 4000, "resultado": 6000, "determinista": true, "lineas": [ { "cuenta": "700", "grupo": "INGRESO", "saldo": 10000 }, { "cuenta": "600", "grupo": "GASTO", "saldo": 4000 } ], "abierto": { "inclasificable": null } }
```
Partidas inclasificables → van a `abierto` sin sumarse.

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {abierto.inclasificable}` — hay partidas fuera de grupo 6/7: no se suman.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`).
  Sube best-effort `mayor-balanza.saldos.request` (B3).
- **Hacia delante (lo consumen)**: `consolidacion` (I3), `narrador-estados` (R3),
  `cuadro-mando-contable`, `estimacion-is-irpf`, `informe-rico`.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-libro/cuenta-resultados/` (clase
  `CuentaResultados extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "asiento_asentado" module.json index.js`.
- **Test unitario**: 700/600 → ingresos/gastos/resultado correctos; cuenta fuera de
  grupo 6/7 → `abierto`; sin `project_id` → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_calcular`, `_saldosDe`, `_grupo`, `_num`, `toolCalcular`.
