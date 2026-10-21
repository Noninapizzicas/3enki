---
name: cambio-desde-ultima-revision
description: >-
  Skill FULL del módulo REFLEJO STATELESS `cambio-desde-ultima-revision` de la
  vertical contabilidad (Enki). Delta de asientos NUEVOS, AJUSTES y REGLAS
  CAMBIADAS desde el último visto bueno: cálculo de DIFERENCIA. Escucha
  contabilidad.asiento_asentado (B2), contabilidad.ajuste_entrado (B5) y
  contabilidad.revision_firmada (que MUEVE LA MARCA). Sin revisión firmada previa
  NO se inventa la marca: el delta se declara ABIERTO. Determinista; no escribe, no
  persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites saber qué cambió desde el último visto bueno (RPC
    cambio-desde-ultima-revision.delta.request).
  - Cuando depures un delta abierto (sin marca previa → se cuenta desde el inicio)
    o un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    marca de revisión firmada.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, libro, delta, revision, determinista, derivado]
---

# cambio-desde-ultima-revision — REFLEJO STATELESS del delta desde la última revisión

## Qué hace el módulo

`cambio-desde-ultima-revision` es un **REFLEJO STATELESS** (L9, hoja del plan):
calcula la **DIFERENCIA (delta)** de **asientos NUEVOS**, **AJUSTES** y **REGLAS
CAMBIADAS** desde el **último visto bueno**. **DETERMINISTA**.

Escucha los tres hechos que mueven el delta: `contabilidad.asiento_asentado` (B2
`escritor-diario`), `contabilidad.ajuste_entrado` (B5 `asiento-ajuste`) y
`contabilidad.revision_firmada` (`flujo-firma`), este último **MUEVE LA MARCA**
desde la que se cuenta. **Sin revisión firmada previa NO se inventa la marca**: el
delta se declara **ABIERTO** (se cuenta desde el inicio).

El delta es un **DERIVADO en memoria** (no escribe, no persiste, no muta el libro).
Su op es **CLASE PREGUNTA** → va por el bus, sin panel. Publica
`cambio-desde-ultima-revision.delta.response` y su par `.failed`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `cambio-desde-ultima-revision.delta.request` | `onDeltaRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id}` → `{project_id, marca, marca_seq, delta:{asientos_nuevos, ajustes_nuevos, reglas_cambiadas}, num_asientos, num_ajustes, num_reglas, hay_cambio, abierto}`. Cuenta lo cambiado desde el último visto bueno; sin marca previa, se declara abierto. Responde por `cambio-desde-ultima-revision.delta.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (lo emite `escritor-diario` B2): un asiento entró en el libro → se anota en el delta. No responde (no es RPC). |
| `contabilidad.ajuste_entrado` | `onAjusteEntrado` | Fire-and-forget (lo emite `asiento-ajuste` B5): la corrección del asesor entró → se anota como ajuste del delta. No responde (no es RPC). |
| `contabilidad.revision_firmada` | `onRevisionFirmada` | Fire-and-forget (lo emite `flujo-firma`): el asesor dio su visto bueno → **MUEVE LA MARCA** desde la que se cuenta el delta. No responde (no es RPC). |

### Publishes

| Evento | Descripción |
|---|---|
| `cambio-desde-ultima-revision.delta.response` | Respuesta RPC correlada de la op `delta` (una sola cara: el bus). |
| `cambio-desde-ultima-revision.delta.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `delta.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `delta` | **PREGUNTA** (bus) | `{project_id}` | `{project_id, marca, marca_seq, delta:{asientos_nuevos, ajustes_nuevos, reglas_cambiadas}, num_asientos, num_ajustes, num_reglas, hay_cambio, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `cambio-desde-ultima-revision.delta` (`toolDelta` → `_delta`).

## Reglas de negocio

1. **Delta determinista**: se cuentan asientos nuevos, ajustes nuevos y reglas
   cambiadas desde la marca (`_anotar` alimenta, `_delta` calcula).
2. **Sin marca no se inventa**: sin revisión firmada previa, el delta se declara
   **ABIERTO** (se cuenta desde el inicio). No se finge una marca.
3. **`revision_firmada` mueve la marca**: al recibir el hecho, la marca avanza
   (con su `marca_seq`); lo anterior deja de contar como cambio.
4. **No escribe, no persiste, no muta el libro**: el delta es un DERIVADO en
   memoria.
5. **`hay_cambio`**: resume si hay algo nuevo (asientos/ajustes/reglas).
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `delta` — qué cambió desde el visto bueno

```json
{ "project_id": "e57a318a-...", "correlation_id": "abc-123" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "marca": "2026-09-20T10:00:00Z", "marca_seq": 42, "delta": { "asientos_nuevos": [ ... ], "ajustes_nuevos": [ ... ], "reglas_cambiadas": [] }, "num_asientos": 3, "num_ajustes": 1, "num_reglas": 0, "hay_cambio": true, "abierto": { "marca": null } }
```
Sin revisión firmada → `marca:null` y `abierto.marca` explicando que se cuenta
desde el inicio.

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {abierto.marca}` — sin marca previa, delta abierto (honesto).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2),
  `contabilidad.ajuste_entrado` (B5), `contabilidad.revision_firmada` (`flujo-firma`).
- **Hacia delante**: alimenta la revisión del asesor (qué mirar) y el flujo de
  firma.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-libro/cambio-desde-ultima-revision/` (clase
  `CambioDesdeUltimaRevision extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "revision_firmada" module.json index.js` y
  `grep -F "ajuste_entrado" module.json`.
- **Test unitario**: sin marca → `abierto.marca`; tras un asiento → `hay_cambio:true`;
  tras `revision_firmada` → la marca avanza y el delta se reinicia; sin
  `project_id` → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; estado derivado en memoria (`_anotar`,
  `_estado`).
- `onDeltaRequest` delega en `_atender(...)`; si status ≠ 200 publica el par
  `.failed`.
- Helpers: `_delta`, `_anotar`, `_estado`, `_logErr`, `toolDelta`.
