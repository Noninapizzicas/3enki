---
name: tablero-margen-dimension
description: >-
  Skill FULL del módulo REFLEJO STATELESS `tablero-margen-dimension` de la vertical
  contabilidad (Enki). El CRUCE margen × DIMENSIÓN bajo lente de conjunto: por
  centro, familia o sociedad. NO calcula el margen (eso es margen-analitico J2, al
  que sube por EVENTO): AGREGA el margen ya calculado por cada dimensión declarada y
  compone el tablero. Sin margen no se compone tablero (abierto). La dimensión es
  DATO declarable. No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites el tablero de margen cruzado por dimensión (RPC
    tablero-margen-dimension.cruzar.request).
  - Cuando depures un abierto.margen (sin margen → no se inventa el tablero) o un 400
    INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y las
    dimensiones declarables.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, analitica, tablero, margen, dimension, determinista]
---

# tablero-margen-dimension — REFLEJO STATELESS del cruce margen × dimensión

## Qué hace el módulo

`tablero-margen-dimension` es un **REFLEJO STATELESS** (J10, hoja del plan): el
**CRUCE margen × DIMENSIÓN** bajo lente de **conjunto** — por centro, familia o
sociedad.

**NO calcula el margen** (eso es `margen-analitico` H2, al que **SUBE por EVENTO**):
**AGREGA** el margen **YA calculado** por cada dimensión declarada y compone el
tablero. **Invariante**: dato ausente = desconocido (**sin margen no se compone
tablero** → **ABIERTO**); la **dimensión es DATO declarable**, no una lista cableada
de negocio.

Escucha `contabilidad.asiento_asentado` (`escritor-diario` B2) y
`contabilidad.criterio_fijado` (`cola-declaraciones-criterio`) — ambos emisores **YA
existen** → **sí se declaran**. Su op es **CLASE PREGUNTA** → sin `ui_handler`.
STATELESS: sin PosPersistencia.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `tablero-margen-dimension.cruzar.request` | `onCruzarRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, filas?/periodo?/ejercicio?, dimensiones?/dimension?}` → `{project_id, dimensiones, tablero, total_filas, fuente_margen, abierto}`. Agrega el margen (declarado o de `margen-analitico`) por cada dimensión. Responde por `tablero-margen-dimension.cruzar.response`; payload inválido → `tablero-margen-dimension.cruzar.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Señal (fire-and-forget) de `escritor-diario` B2: el libro cambió → se observa (ventana acotada) para el tablero. |
| `contabilidad.criterio_fijado` | `onCriterioFijado` | Señal (fire-and-forget) de `cola-declaraciones-criterio`: se fijó un criterio → se observa (ventana acotada). |

### Publishes

| Evento | Descripción |
|---|---|
| `margen-analitico.calcular.request` | Subida (REQUEST por EVENTO) a H2: el margen ya calculado por fila. TableroMargenDimension NO lo calcula; lo AGREGA. |
| `tablero-margen-dimension.cruzar.response` | Respuesta RPC correlada de la op `cruzar` (una sola cara: el bus). |
| `tablero-margen-dimension.cruzar.failed` | Par de fallo determinista: falta `project_id` o `dimensiones` → `{status, code, message}`. Cierra el círculo de `cruzar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `cruzar` | **PREGUNTA** (bus, sin panel) | `{project_id, filas?/periodo?/ejercicio?, dimensiones?/dimension?}` | `{project_id, dimensiones, tablero, total_filas, fuente_margen, abierto}` | `400 INVALID_INPUT` (`project_id`, `dimensiones`) |

Tool expuesta: `tablero-margen-dimension.cruzar` (`toolCruzar` → `_cruzar`).

## Reglas de negocio

1. **NO calcula el margen**: lo **SUBE por EVENTO** a `margen-analitico.calcular.request`
   (H2) o lo recibe declarado (`_filasDe`); luego lo **AGREGA**.
2. **Dimensiones declarables (const `DIMENSIONES`)**: `['centro', 'familia',
   'sociedad', 'producto', 'canal', 'periodo', 'dimension', 'proyecto']`. Son DATO,
   no una lista cableada de negocio.
3. **Sin margen no se compone tablero** → `abierto.margen = 'no hay margen (ni
   declarado ni de margen-analitico): el tablero no se inventa'`.
4. **Sin `dimensiones`** → `400 INVALID_INPUT dimensiones`; sin `project_id` → `400`.
5. **`fuente_margen`**: declara de dónde salió el margen (declarado vs. H2).
6. **No escribe, no persiste**: reflejo agregador.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `cruzar` — margen por dimensión

```json
{
  "project_id": "e57a318a-...",
  "dimensiones": ["centro"],
  "filas": [ { "centro": "centro-A", "margen": 2000 }, { "centro": "centro-B", "margen": -500 } ],
  "periodo": "2026-09",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "dimensiones": ["centro"], "tablero": [ { "centro": "centro-A", "margen": 2000 }, { "centro": "centro-B", "margen": -500 } ], "total_filas": 2, "fuente_margen": "declarado", "abierto": { "margen": null } }
```
Sin margen → tablero vacío con `abierto.margen` declarado.

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `dimensiones` — falta el campo.
- `200 {abierto.margen}` — sin margen no se inventa el tablero.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2),
  `contabilidad.criterio_fijado` (K9). Sube best-effort
  `margen-analitico.calcular.request` (H2).
- **Hacia delante (lo consumen)**: `cuadro-mando-contable`, informes de dirección y
  `consolidacion` (I3).
- No escribe: agregador puro.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/tablero-margen-dimension/` (clase
  `TableroMargenDimension extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "criterio_fijado" module.json index.js` y
  `grep -F "DIMENSIONES" index.js`.
- **Test unitario**: filas por centro → tablero agregado; sin margen → `abierto.margen`;
  sin `dimensiones` → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_cruzar`, `_filasDe`, `_dimensiones`, `_num`, `toolCruzar`.
