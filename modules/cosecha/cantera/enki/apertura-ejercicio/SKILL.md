---
name: apertura-ejercicio
description: >-
  Skill FULL del módulo REFLEJO STATELESS `apertura-ejercicio` de la vertical
  contabilidad (Enki). Deriva los asientos de APERTURA del cierre anterior y los
  DELEGA a `escritor-diario` (B2) subiendo `escritor-diario.asentar.request`:
  quien escribe y anuncia es el custodio, NUNCA este reflejo. Sin cierre anterior
  declarado NO se inventan saldos (0 líneas, no un default). No escribe, no
  persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites generar los asientos de apertura de un ejercicio
    (RPC apertura-ejercicio.generar.request).
  - Cuando depures por qué la apertura sale con 0 líneas (cierre anterior no
    declarado → no se estiman saldos).
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    delegación al single-writer.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, libro, apertura, ejercicio, delegacion, single-writer]
---

# apertura-ejercicio — REFLEJO STATELESS de los asientos de apertura

## Qué hace el módulo

`apertura-ejercicio` es un **REFLEJO STATELESS** (C5, hoja del plan): deriva los
**asientos de APERTURA** a partir del **CIERRE anterior**. La clave de diseño es
que **quien ESCRIBE y ANUNCIA es `escritor-diario` (B2), NO este módulo**: aquí
solo se deriva el asiento propuesto y se **SUBE `escritor-diario.asentar.request`**
para que el custodio lo asiente. Así se respeta el **single-writer** del libro —
este reflejo **NUNCA toca el diario**.

**Honestidad (invariante 13)**: sin cierre anterior declarado **NO se inventan
saldos** → devuelve `0 líneas` (no un default). No escribe, no persiste (sin
PosPersistencia). Su op es **CLASE PREGUNTA**: va por el bus, sin panel. Publica
`apertura-ejercicio.generar.response` y su par `.failed`.

> **Nota R3**: la escucha de `contabilidad.ejercicio_cerrado` que el plan
> mencionaba **NO se declara aún**: su emisor `cierre-ejercicio` (C4) no existe
> todavía → la cadena quedaría colgada.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `apertura-ejercicio.generar.request` | `onGenerarRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, cierre|saldos, fecha?, ejercicio?}` → `{project_id, asiento, lineas, escritor:'escritor-diario', delegado, abierto}`. Deriva el asiento de apertura y sube `escritor-diario.asentar.request`; sin cierre → 0 líneas (no estima). Responde por `apertura-ejercicio.generar.response`. Payload inválido → `apertura-ejercicio.generar.failed`. |

### Publishes

| Evento | Descripción |
|---|---|
| `apertura-ejercicio.generar.response` | Respuesta RPC correlada de la op `generar` (una sola cara: el bus). |
| `apertura-ejercicio.generar.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `generar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `generar` | **PREGUNTA** (bus, sin panel) | `{project_id, cierre\|saldos, fecha?, ejercicio?}` | `{project_id, asiento, lineas, escritor:'escritor-diario', delegado, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `apertura-ejercicio.generar` (`toolGenerar` → `_generar`).

## Reglas de negocio

1. **Delegación (single-writer)**: este módulo **no escribe el libro**; sube el
   asiento propuesto a `escritor-diario.asentar.request` (B2). El campo
   `escritor:'escritor-diario'` lo declara.
2. **Sin cierre no se inventa**: si no hay cierre/saldos declarados → `0 líneas`
   con `abierto` declarado. No se estiman saldos por defecto.
3. **Sin project_id** → `400 INVALID_INPUT` + `apertura-ejercicio.generar.failed`.
4. **Reflejo stateless**: no persiste, no muta; solo deriva y delega.
5. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `generar` — derivar y delegar la apertura

```json
{
  "project_id": "e57a318a-...",
  "cierre": { "saldos": [ { "cuenta": "100", "saldo": 5000 }, { "cuenta": "400", "saldo": -5000 } ] },
  "fecha": "2027-01-01",
  "ejercicio": "2027",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se sube `escritor-diario.asentar.request` al custodio):
```json
{ "project_id": "e57a318a-...", "asiento": { "lineas": [ { "cuenta": "100", "debe": 5000, "haber": 0 }, { "cuenta": "400", "debe": 0, "haber": 5000 } ] }, "lineas": 2, "escritor": "escritor-diario", "delegado": true, "abierto": { "cierre": null } }
```
Sin cierre declarado → `lineas: 0` + `abierto.cierre` (no se estiman saldos).

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {lineas:0, abierto.cierre}` — no hay cierre anterior: comportamiento
  honesto, no un error.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (delega)**: `escritor-diario` (B2) es quien asienta y, si
  cuadra, anuncia `contabilidad.asiento_asentado`.
- **Hacia atrás (cierre)**: `cierre-ejercicio` (C4). *Aún sin escucha por evento (R3).*
- Nunca escribe: es un puente de derivación hacia el single-writer del libro.

## Verificación

- **Fichero**: `modules/contabilidad-libro/apertura-ejercicio/` (clase
  `AperturaEjercicio extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "generar.request" module.json` y confirmar
  `escritor-diario.asentar.request` en `index.js`.
- **Test unitario**: con cierre → `lineas >= 1` y se sube `asentar.request`; sin
  cierre → `lineas:0` + `abierto`; sin `project_id` → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`.
- `onGenerarRequest` delega en `_atender(e, 'generar',
  'apertura-ejercicio.generar.response', ...)`; si status ≠ 200 publica
  `apertura-ejercicio.generar.failed`.
- Helpers: `_generar`, `_lineasDeSaldos`, `_linea`. `_invalid`/`_errorResponse`
  de `modulo-hibrido-reflejo`.
