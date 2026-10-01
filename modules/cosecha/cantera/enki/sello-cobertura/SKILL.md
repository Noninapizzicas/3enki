---
name: sello-cobertura
description: >-
  Skill FULL del módulo REFLEJO STATELESS `sello-cobertura` de la vertical contabilidad
  (Enki). MARCA de completitud de lo consultado, FUERA DE CICLO. Sella el objeto devuelto
  (no escribe estado): `COMPLETO` / `INCOMPLETO` / `INDETERMINADO`. LEE la métrica única de
  `completitud-cobertura` (A12) — no la recalcula. Escucha `contabilidad.hecho_recibido`
  (ventana acotada). Honestidad (invariante 13): sin métrica la marca queda `INDETERMINADO`
  («no se dice completo lo que no se sabe»). Sin store propio. La op `sellar` es PREGUNTA →
  sin ui_handler.
when-to-use: >-
  - Cuando necesites sellar la completitud de un objeto/consulta que se devuelve
    (RPC sello-cobertura.sellar.request).
  - Cuando depures por qué un sello sale `INDETERMINADO` (sin métrica) o por qué faltan
    nombres de faltantes (la métrica dice que faltan pero no los nombra).
  - Cuando quieras entender su contrato de eventos y su relación con completitud-cobertura.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, analitica, cobertura, sello, honestidad]
---

# sello-cobertura — REFLEJO STATELESS que sella la completitud

## Qué hace el módulo

`sello-cobertura` es un **REFLEJO STATELESS** (Q3, hoja del plan) de la vertical
**contabilidad**, eje **analítica**. Emite una **marca de completitud** de lo consultado,
**FUERA DE CICLO** (la marca se pone **antes de decidir**, no espera al cierre como C6).

El sello tiene tres estados: `COMPLETO`, `INCOMPLETO`, `INDETERMINADO`. **No escribe estado**:
el sello es una propiedad del **objeto devuelto** (`persistido:false`). **No recalcula** la
métrica: **la LEE** de `completitud-cobertura` (A12) — declarada en el input o pedida por RPC.

**Honestidad (invariante 13):** si no llega la métrica (ni declarada ni de `completitud-cobertura`),
el sello queda **`INDETERMINADO`** — «no se dice completo lo que no se sabe». Y si la métrica dice
que faltan hechos pero **no nombra cuáles**, el sello lo declara **sin inventarlos**.

**No persiste**: una ventana acotada `this._vistos` (tope 1000) por `contabilidad.hecho_recibido`.
La op `sellar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `sello-cobertura.sellar.request` | `onSellarRequest` | RPC reflejo (PREGUNTA): `{project_id, metrica?\|cobertura?\|senal?, ejercicio?, desde?, hasta?}` → `{project_id, sello, fuente, recalcula_metrica:false, abierto}`. Delega en `_atender` → `_sellar`. Si `status ≠ 200` publica `.failed`. Responde por `sello-cobertura.sellar.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (puerto-evento-vertical A1): llegó un hecho → se observa en una ventana acotada (tope 1000). **Observar NO es escribir**: solo memoria para el sello de la próxima consulta. |

### Publishes

| Evento | Cuándo |
|---|---|
| `sello-cobertura.sellar.response` | Respuesta RPC correlada de la op `sellar`. |
| `sello-cobertura.sellar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: es un reflejo de marca. No escribe estado → no hay hecho
> que anunciar (R2 no aplica). Su marca viaja **dentro** de la respuesta del objeto sellado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `sellar` | **PREGUNTA** | `{project_id, metrica?:\{esperados, llegados, faltantes?\}\|cobertura?\|senal?, ejercicio?, desde?, hasta?}` | `{project_id, tipo, fuente, sello:{completo, estado, esperados, llegados, faltan, cobertura, faltantes, fuera_de_ciclo:true, persistido:false}, recalcula_metrica:false, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Hay métrica solo con ambos números**: `hayMetrica = esperados !== null && llegados !== null`.
   Sin ambos → sello `INDETERMINADO` (`completo:null`).
2. **Cálculo del sello**: `faltan = max(esperados - llegados, 0)`; `cobertura = llegados/esperados`
   (si `esperados > 0`); `completo = (faltan === 0)`.
3. **Estados**: `completo === null` → `INDETERMINADO`; `true` → `COMPLETO`; `false` → `INCOMPLETO`.
4. **Fuera de ciclo**: `fuera_de_ciclo:true` — la marca se emite **antes** de decidir, no espera al cierre.
5. **No persiste el sello**: `persistido:false`. La marca es del objeto devuelto.
6. **No recalcula la métrica**: `recalcula_metrica:false`; se limita a leer `completitud-cobertura`.
7. **Faltantes sin inventar**: `faltantesDeclarados` se extrae de `metrica.faltantes` (acepta array
   de objetos con `cuenta`/`clave` o de escalares). Si la métrica dice que faltan pero no los nombra,
   `abierto.faltantes` lo declara.
8. **Origen de la métrica** (`_metricaDe`): input `metrica`/`cobertura`/`senal` → si no, RPC
   `completitud-cobertura.medir.request` (timeout 800 ms). `fuente` ∈ `{'declarado','completitud-cobertura',null}`.
9. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Sellar con métrica declarada

```json
{
  "project_id": "e57a318a-...",
  "metrica": { "esperados": 120, "llegados": 114, "faltantes": [ { "cuenta": "430001" }, { "cuenta": "430007" } ] },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "sello-cobertura",
  "fuente": "declarado",
  "sello": {
    "completo": false,
    "estado": "INCOMPLETO",
    "esperados": 120,
    "llegados": 114,
    "faltan": 6,
    "cobertura": 0.95,
    "faltantes": ["430001", "430007"],
    "fuera_de_ciclo": true,
    "persistido": false
  },
  "recalcula_metrica": false,
  "abierto": { "metrica": null, "faltantes": null }
}
```

### Sin métrica — INDETERMINADO

```json
{ "project_id": "e57a318a-..." }
```
→ `sello.estado:'INDETERMINADO'`, `sello.completo:null`,
`abierto.metrica = "no llego la metrica de cobertura (ni declarada ni de completitud-cobertura): la marca queda INDETERMINADA (no se dice completo lo que no se sabe)"`.

### Métrica incompleta que no nombra los faltantes

```json
{ "project_id": "e57a318a-...", "metrica": { "esperados": 10, "llegados": 8 } }
```
→ `estado:'INCOMPLETO'`, `faltan:2`, `faltantes:[]`,
`abierto.faltantes = "la metrica dice que faltan hechos pero NO nombra cuales: la marca los declara sin inventarlos"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `sello-cobertura.sellar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_sellar`. |
| (no es error) | 200 | Sin métrica → INDETERMINADO (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.hecho_recibido` (puerto-evento-vertical A1).
- **Lee por RPC (800 ms)**: `completitud-cobertura.medir.request` (métrica única, A12).
- **Le consume**: `consulta-cuentas-bajo-demanda` (Q1) pide `sello-cobertura.sellar.request` por RPC
  para sellar lo que devuelve al dueño.

## Verificación

1. Fichero: `modules/contabilidad-analitica/sello-cobertura/`.
2. Eventos reales: subscribes `sello-cobertura.sellar.request`, `contabilidad.hecho_recibido`;
   publishes `sello-cobertura.sellar.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-analitica/sello-cobertura/index.js
   # → sello-cobertura.sellar.failed  → completitud-cobertura.medir.request
   ```
4. Test unitario (si existe): con métrica → COMPLETO/INCOMPLETO; sin métrica → INDETERMINADO;
   faltantes nombrados/no nombrados; sin `project_id` → 400 + failed.
