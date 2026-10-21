---
name: consolidacion
description: >-
  Skill FULL del módulo REFLEJO STATELESS `consolidacion` de la vertical
  contabilidad (Enki). Estados del conjunto (grupo COMPLETO, multi-sociedad) con
  criterio DECLARADO. NO calcula los estados por su cuenta: sube por EVENTO a
  mayor-balanza, balance-situacion, cuenta-resultados, eliminacion-intercompany y
  cola-declaraciones-criterio. Sin criterio no se consolida a ojo; una sociedad sin
  estado se declara faltante y el agregado se declara PARCIAL (completo:false). No
  escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites consolidar los estados de un grupo multi-sociedad (RPC
    consolidacion.estados.request).
  - Cuando depures un abierto.criterio (sin criterio → no se consolida a ojo) o un
    completo:false (sociedad sin estado).
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y las
    eliminaciones intragrupo.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, analitica, consolidacion, grupo, multi-sociedad, determinista]
---

# consolidacion — REFLEJO STATELESS de la consolidación del grupo

## Qué hace el módulo

`consolidacion` es un **REFLEJO STATELESS** (I3, hoja del plan): los **estados del
conjunto** (grupo **COMPLETO**, multi-sociedad) con criterio **DECLARADO**. La
consolidación es **AL CIERRE**.

**NO calcula los estados por su cuenta**: **SUBE por EVENTO**
`mayor-balanza.saldos.request` (B6), `balance-situacion.calcular.request` (C1) y
`cuenta-resultados.calcular.request` (C2) (estados por sociedad),
`eliminacion-intercompany.eliminar.request` (I1, intragrupo) y
`cola-declaraciones-criterio.fijar.request` (K9, criterio).

**Honestidad (invariante 13)**: **SIN criterio declarado NO se consolida a ojo**
(se declara abierto); una sociedad sin estado queda declarada **faltante** y el
agregado se declara **PARCIAL** (`completo:false`). No escribe, no persiste. Su op
es **CLASE PREGUNTA** → va por el bus, sin panel. Publica
`consolidacion.estados.response` y su par `.failed`.

> **Nota R3**: la escucha de `contabilidad.ejercicio_cerrado` del plan **NO se
> declara**: su emisor `cierre-ejercicio` (C4) aún no existe.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `consolidacion.estados.request` | `onEstadosRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, criterio\|criterio_consolidacion, sociedades[{sociedad_id,participacion_pct?,estado?}], eliminaciones?, ejercicio?}` → `{project_id, criterio, sociedades[], activo, pasivo, patrimonio, ingreso, gasto, resultado, eliminaciones, completo, parcial, abierto}`. Agrega por criterio declarado, resta eliminaciones; sin criterio → abierto. Responde por `consolidacion.estados.response`. Payload inválido → `consolidacion.estados.failed`. |

### Publishes

| Evento | Descripción |
|---|---|
| `consolidacion.estados.response` | Respuesta RPC correlada de la op `estados` (una sola cara: el bus). |
| `consolidacion.estados.failed` | Par de fallo determinista: falta `project_id` o `sociedades` → `{status, code, message}`. Cierra el círculo de `estados.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `estados` | **PREGUNTA** (bus) | `{project_id, criterio\|criterio_consolidacion, sociedades[{sociedad_id,participacion_pct?,estado?}], eliminaciones?, ejercicio?}` | `{project_id, criterio, sociedades[], activo, pasivo, patrimonio, ingreso, gasto, resultado, eliminaciones, completo, parcial, abierto}` | `400 INVALID_INPUT` (`project_id`, `sociedades`) |

Tool expuesta: `consolidacion.estados` (`toolEstados` → `_estados`).

## Reglas de negocio

1. **Sin criterio no se consolida a ojo** → `abierto.criterio = 'no se declaro el
   criterio de consolidacion (integracion global/proporcional...): no se consolida a
   ojo'`. Y se **sube el hueco** a `cola-declaraciones-criterio.fijar.request` (K9).
2. **Ponderación por participación**: `_pond` aplica el `participacion_pct` por
   sociedad según el criterio.
3. **Eliminaciones intragrupo**: `_eliminacionesDe` resta las operaciones
   intercompany (sube a `eliminacion-intercompany.eliminar.request` I1).
4. **Sociedad sin estado**: queda declarada **faltante** y el agregado se declara
   **PARCIAL** (`completo:false`, `parcial:true`). **No se finge completo.**
5. **No calcula los estados por su cuenta**: los sube por EVENTO a C1/C2/B6.
6. **Sin `sociedades`** → `400 INVALID_INPUT sociedades`; sin `project_id` → `400`.
7. **No escribe, no persiste**: reflejo derivador.
8. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `estados` — consolidar el grupo

```json
{
  "project_id": "e57a318a-...",
  "criterio": "integracion_global",
  "sociedades": [ { "sociedad_id": "S1", "participacion_pct": 100 }, { "sociedad_id": "S2", "participacion_pct": 60, "estado": { "activo": 2000, "pasivo": 800 } } ],
  "eliminaciones": [ { "concepto": "venta-intragrupo", "importe": 300 } ],
  "ejercicio": "2026",
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "criterio": "integracion_global", "sociedades": [ { "sociedad_id": "S1", "faltante": true }, { "sociedad_id": "S2", "estado": { ... } } ], "activo": 2000, "pasivo": 800, "patrimonio": 1200, "ingreso": 0, "gasto": 0, "resultado": 0, "eliminaciones": [ { "concepto": "venta-intragrupo", "importe": 300 } ], "completo": false, "parcial": true, "abierto": { "sociedades_faltantes": ["S1"] } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `sociedades` — falta el campo.
- `200 {abierto.criterio}` — sin criterio no se consolida a ojo.
- `completo:false / parcial:true` — falta el estado de alguna sociedad (se declara).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (sube por evento)**: `mayor-balanza.saldos.request` (B6),
  `balance-situacion.calcular.request` (C1), `cuenta-resultados.calcular.request`
  (C2), `eliminacion-intercompany.eliminar.request` (I1),
  `cola-declaraciones-criterio.fijar.request` (K9).
- **Hacia delante (lo consumen)**: `cuadro-mando-contable`, `tablero-margen-dimension`
  (J10), informes de grupo; `narrador-estados` (R3).
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/consolidacion/` (clase `Consolidacion
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "estados.request" module.json` y confirmar
  `eliminacion-intercompany.eliminar.request` / `balance-situacion.calcular.request`
  en `index.js`.
- **Test unitario**: sin criterio → `abierto.criterio`; sociedad sin estado →
  `completo:false`; eliminaciones restadas; sin `sociedades` → `400 INVALID_INPUT`.

## Notas de implementación

- Stateless: sin `PosPersistencia`.
- Helpers: `_estados`, `_estadoDe`, `_eliminacionesDe`, `_pond`, `_num`,
  `toolEstados`.
