---
name: cuadro-mando-contable
description: >-
  Skill FULL del módulo REFLEJO STATELESS `cuadro-mando-contable` de la vertical contabilidad
  (Enki). Cuadro de mando que AGREGA cuatro cifras (caja, resultado, margen, desviación) SIN
  bajar al asiento: las recibe declaradas o las pide por RPC best-effort a sus calculadores en
  paralelo. Lo que no llega queda ABIERTO (`faltan`), nunca se rellena con cero. Escucha
  `contabilidad.asiento_asentado` (ventana acotada de latidos). Sin store propio. La op
  `componer` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites la foto de conjunto de las cuatro cifras de un proyecto/periodo
    (RPC cuadro-mando-contable.componer.request).
  - Cuando depures por qué el cuadro sale `disponible:false` y qué cifras `faltan`.
  - Cuando quieras entender su contrato de eventos y a quién pide cada cifra (saldo-tesoreria,
    cuenta-resultados, margen-analitico, desviacion).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, analitica, cuadro-mando, kpis, agregacion]
---

# cuadro-mando-contable — REFLEJO STATELESS que agrega el cuadro de mando

## Qué hace el módulo

`cuadro-mando-contable` es un **REFLEJO STATELESS** (J8, hoja del plan) de la vertical
**contabilidad**, eje **analítica**. Compone un **cuadro de mando** agregando **cuatro cifras**
— **caja**, **resultado**, **margen** y **desviación** — **sin bajar al asiento**.

No calcula ninguna cifra él mismo: cada una se toma **declarada** en el input o se **pide por RPC**
a quien la calcula (saldo-tesoreria, cuenta-resultados, margen-analitico, desviacion) **en paralelo**
(`Promise.all`, timeout 900 ms).

**Honestidad (invariante 13):** lo que no llega **no se rellena con cero**: se marca
`disponible:false`, se lista en `faltan` y se declara en `abierto`.

**No persiste**: una ventana acotada `this._latidos` (tope 500) alimentada por
`contabilidad.asiento_asentado`. La op `componer` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `cuadro-mando-contable.componer.request` | `onComponerRequest` | RPC reflejo (PREGUNTA): `{project_id, ejercicio?, periodo?, dimension?, caja?, resultado?, margen?, desviacion?}` → `{cuadro:{caja,resultado,margen,desviacion}, disponible, faltan, sin_bajar_al_asiento, abierto}`. Delega en `_atender` → `_componer`. Si `status ≠ 200` publica `.failed`. Responde por `cuadro-mando-contable.componer.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se anota un latido `{project_id, numero, en}` en la ventana (tope 500). Observar no es escribir. |

### Publishes

| Evento | Cuándo |
|---|---|
| `cuadro-mando-contable.componer.response` | Respuesta RPC correlada de la op `componer`. |
| `cuadro-mando-contable.componer.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: reflejo de agregación. No escribe estado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `componer` | **PREGUNTA** | `{project_id, ejercicio?, periodo?, dimension?, caja?, resultado?, margen?, desviacion?}` | `{project_id, tipo, ejercicio, periodo, cuadro:{caja,resultado,margen,desviacion}, disponible, faltan, sin_bajar_al_asiento:true, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Contexto común**: `{project_id, ejercicio, periodo, dimension}` se pasa a cada calculador.
2. **Cifra declarada**: si `input[clave]` no es `null`/`undefined`: acepta un número o un objeto con
   `.importe`. Si declara objeto sin importe → `disponible:false` (se declara el hueco, no se rellena).
3. **Cifra por EVENTO**: si no se declaró, se pide por RPC (`Promise.all`, timeout 900 ms) a:
   `caja → saldo-tesoreria.calcular.request`, `resultado → cuenta-resultados.calcular.request`,
   `margen → margen-analitico.calcular.request`, `desviacion → desviacion.calcular.request`.
4. **Extracción tolerante** (`_extraer`): del payload de respuesta toma el primer campo numérico entre
   `importe, saldo, total, resultado, margen, desviacion, caja, valor, cifra`.
5. **Disponibilidad**: `disponible = faltan.length === 0`; `faltan` = claves con `disponible:false`.
   Cada cifra lleva `origen` (`'declarado'`/`'evento'`/`null`) y `fuente_evento`.
6. **Sin bajar al asiento**: `sin_bajar_al_asiento:true` — el cuadro se compone de agregados ya calculados.
7. **Sin datos no se rellena**: `abierto` = `"no llegaron: <faltan> (se declaran abiertas, NO se rellenan con cero)"`.
8. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Componer con dos cifras declaradas

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "periodo": "09",
  "caja": 12500.75,
  "resultado": 8400.5,
  "correlation_id": "abc-123"
}
```
Respuesta `200` (margen y desviación se piden por evento; si no llegan, `faltan`):
```json
{
  "project_id": "e57a318a-...",
  "tipo": "cuadro-mando-contable",
  "ejercicio": "2026",
  "periodo": "09",
  "cuadro": {
    "caja": { "clave": "caja", "importe": 12500.75, "origen": "declarado", "disponible": true, "fuente_evento": null },
    "resultado": { "clave": "resultado", "importe": 8400.5, "origen": "declarado", "disponible": true, "fuente_evento": null },
    "margen": { "clave": "margen", "importe": null, "origen": null, "disponible": false, "fuente_evento": "margen-analitico.calcular.request" },
    "desviacion": { "clave": "desviacion", "importe": null, "origen": null, "disponible": false, "fuente_evento": "desviacion.calcular.request" }
  },
  "disponible": false,
  "faltan": ["margen", "desviacion"],
  "sin_bajar_al_asiento": true,
  "abierto": "no llegaron: margen, desviacion (se declaran abiertas, NO se rellenan con cero)"
}
```

### Todo declarado — cuadro completo

→ `disponible:true`, `faltan:[]`, `abierto:null`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `cuadro-mando-contable.componer.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_componer`. |
| (no es error) | 200 | Faltan cifras → `disponible:false` (honesto, no ceros). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.asiento_asentado` (B2).
- **Llama por RPC (best-effort, 900 ms)**: `saldo-tesoreria.calcular.request`,
  `cuenta-resultados.calcular.request`, `margen-analitico.calcular.request`,
  `desviacion.calcular.request`.

## Verificación

1. Fichero: `modules/contabilidad-analitica/cuadro-mando-contable/`.
2. Eventos reales: subscribes `cuadro-mando-contable.componer.request`, `contabilidad.asiento_asentado`;
   publishes `cuadro-mando-contable.componer.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-analitica/cuadro-mando-contable/index.js
   # → cuadro-mando-contable.componer.failed
   # → saldo-tesoreria.calcular.request / cuenta-resultados.calcular.request / margen-analitico.calcular.request / desviacion.calcular.request
   ```
4. Test unitario (si existe): declaradas + evento → `disponible` correcto; faltan → `faltan` y `abierto`;
   sin `project_id` → 400 + failed.
