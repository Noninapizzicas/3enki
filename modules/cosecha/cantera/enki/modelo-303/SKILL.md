---
name: modelo-303
description: >-
  Skill FULL del módulo REFLEJO STATELESS `modelo-303` de la vertical contabilidad (Enki).
  Construye el MODELO TRIMESTRAL 303 derivado de la liquidación de IVA: determinista. **Sin
  liquidación queda ABIERTO — no se rellena con ceros** (0 no es «sin IVA», es desconocido). El
  mapeo de bloques es estructura; los casilleros concretos son DATO declarable. Escucha
  `contabilidad.asiento_asentado` y `contabilidad.ejercicio_cerrado`. Sin store propio. La op
  `construir` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites construir el 303 del trimestre (RPC modelo-303.construir.request).
  - Cuando depures por qué sale `casillas:[]` (`abierto.liquidacion`) o por qué hay casillas `null`.
  - Cuando quieras entender su contrato de eventos y su derivación de liquidacion-iva (D1).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, fiscal, modelo-303, iva, ley-como-dato]
---

# modelo-303 — REFLEJO STATELESS del modelo trimestral de IVA

## Qué hace el módulo

`modelo-303` es un **REFLEJO STATELESS** (D2, hoja del plan) de la vertical **contabilidad**, eje
**fiscal**. Construye el **modelo trimestral 303** a partir de la **liquidación de IVA** (D1):

- la **liquidación** se declara o se pide best-effort a `liquidacion-iva.calcular.request`;
- los **casilleros** se componen con un **mapeo declarado** (`casillas`/`mapeo`) o con el **mapeo por
  defecto de bloques** (`BLOQUES`: `devengado_repercutido ← devengado`, `soportado_deducible ←
  soportado`, `resultado_regimen_general ← resultado`).

**Los casilleros numéricos concretos son DATO declarable, no se cablean** (`tipos_cableados:false`).
El modelo se **DERIVA** de la liquidación (`derivado_de:'liquidacion-iva'`).

**Honestidad (invariante 13):** **sin liquidación el modelo NO se rellena con ceros** —
`casillas:[]` y `abierto.liquidacion` («0 no es “sin IVA”, es desconocido»). Un casillero sin valor
en la liquidación queda `null` (`abierto.casilla`).

**No persiste** (STATELESS); observa asientos (tope 1000) y cierres (tope 100). La op `construir` es
**PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `modelo-303.construir.request` | `onConstruirRequest` | RPC reflejo (PREGUNTA): `{project_id, liquidacion?, devengado?, soportado?, resultado?, casillas?\|mapeo?, periodo?, trimestre?, fecha?, ejercicio?}` → `{periodo, casillas, total_a_ingresar, total_a_compensar, derivado_de, abierto}`. Delega en `_atender` → `_construir`. Si `status ≠ 200` publica `.failed`. Responde por `modelo-303.construir.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento (tope 1000). |
| `contabilidad.ejercicio_cerrado` | `onEjercicioCerrado` | Fire-and-forget (cierre-ejercicio C4): cerró el ejercicio → se observa el cierre (tope 100) si `estado === 'cerrado'`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `modelo-303.construir.response` | Respuesta RPC correlada de la op `construir`. |
| `modelo-303.construir.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: reflejo de construcción. No escribe estado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `construir` | **PREGUNTA** | `{project_id, liquidacion?, devengado?, soportado?, resultado?, a_ingresar?, a_compensar?, casillas?:[{casilla, de\|campo}], mapeo?, periodo?, trimestre?, fecha?, ejercicio?}` | `{project_id, tipo, periodo, fuente, casillas, total_a_ingresar, total_a_compensar, derivado_de:'liquidacion-iva', tipos_cableados:false, determinista, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **La liquidación** (`_liquidacionDe`): declarada (objeto) → o por cifras básicas
   (`devengado`/`soportado`/`resultado`, derivando `resultado = devengado − soportado`) → o RPC
   `liquidacion-iva.calcular.request` (timeout 800 ms). `fuente` ∈ `{'declarado','liquidacion-iva',null}`.
2. **Sin liquidación no hay modelo**: `casillas:[]`, `total_a_ingresar:null`, `total_a_compensar:null`
   y `abierto.liquidacion`. **No se rellena con ceros.**
3. **Casillas por mapeo** (`_casillas`): si llega `casillas`/`mapeo` (lista `{casilla, de|campo}`) se usa;
   si no, el mapeo por defecto `BLOQUES`. Cada casilla → `{casilla, de, valor}`; el valor se copia de
   `liquidacion[de]` o queda `null`.
4. **Casillero sin valor** → `valor:null` y `abierto.casilla` lo declara.
5. **Totales**: `total_a_ingresar`/`total_a_compensar` se copian de la liquidación (o `null`).
6. **El modelo deriva; no recablea tipos**: `tipos_cableados:false`.
7. **Periodo** (`_periodo`): `periodo` → o `T<trimestre>`.
8. **Determinista**: misma liquidación → mismo modelo.
9. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Construir el 303 con liquidación declarada

```json
{
  "project_id": "e57a318a-...",
  "periodo": "T1",
  "liquidacion": { "devengado": 2100, "soportado": 840, "resultado": 1260, "a_ingresar": 1260, "a_compensar": 0 },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "modelo-303",
  "periodo": "T1",
  "fuente": "declarado",
  "casillas": [
    { "casilla": "devengado_repercutido", "de": "devengado", "valor": 2100 },
    { "casilla": "soportado_deducible", "de": "soportado", "valor": 840 },
    { "casilla": "resultado_regimen_general", "de": "resultado", "valor": 1260 }
  ],
  "total_a_ingresar": 1260,
  "total_a_compensar": 0,
  "derivado_de": "liquidacion-iva",
  "tipos_cableados": false,
  "determinista": true,
  "abierto": { "casilla": null }
}
```

### Sin liquidación — ABIERTO (no ceros)

```json
{ "project_id": "e57a318a-..." }
```
→ `casillas:[]`, `total_a_ingresar:null`,
`abierto.liquidacion = "no hay liquidacion (ni declarada ni de liquidacion-iva D1): el modelo no se rellena con ceros (0 no es \"sin IVA\", es desconocido)"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `modelo-303.construir.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_construir`. |
| (no es error) | 200 | Sin liquidación → `casillas:[]` + `abierto` (honesto, sin ceros). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.asiento_asentado` (B2), `contabilidad.ejercicio_cerrado` (C4).
- **Llama por RPC (best-effort, 800 ms)**: `liquidacion-iva.calcular.request` (D1).

## Verificación

1. Fichero: `modules/contabilidad-fiscal/modelo-303/`.
2. Eventos reales: subscribes `modelo-303.construir.request`, `contabilidad.asiento_asentado`,
   `contabilidad.ejercicio_cerrado`; publishes `modelo-303.construir.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-fiscal/modelo-303/index.js
   # → modelo-303.construir.failed → liquidacion-iva.calcular.request
   ```
4. **Ley como dato**: los casilleros numéricos no están cableados; el mapeo sale del input o de `BLOQUES`.
5. Test unitario (si existe): con liquidación → casillas derivadas; sin liquidación → `casillas:[]`;
   casillero sin valor → `null`; sin `project_id` → 400 + failed.
