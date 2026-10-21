---
name: modelo-390
description: >-
  Skill FULL del módulo REFLEJO STATELESS `modelo-390` de la vertical contabilidad (Enki).
  Construye el MODELO 390 (resumen anual de IVA) DETERMINISTAMENTE desde las liquidaciones
  trimestrales: resumen {iva_devengado, iva_deducible, resultado}, desglose por tipo y periodos.
  **La LEY entra como DATO**: los tipos declarados se devuelven sin transformar y el desglose usa
  la clave `tipo` de cada liquidación. Sin liquidaciones no se inventa. Escucha
  `contabilidad.ejercicio_cerrado`. Sin store propio. La op `construir` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites construir el 390 anual (RPC modelo-390.construir.request).
  - Cuando depures por qué `verificable:false` (sin liquidaciones) o por qué falta el desglose por tipo.
  - Cuando quieras entender su contrato de eventos y su derivación de liquidacion-iva (D1).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, fiscal, modelo-390, iva, ley-como-dato]
---

# modelo-390 — REFLEJO STATELESS del resumen anual de IVA

## Qué hace el módulo

`modelo-390` es un **REFLEJO STATELESS** (D3, hoja del plan) de la vertical **contabilidad**, eje
**fiscal**. Construye el **modelo 390** (resumen anual de IVA) **determinísticamente** desde las
**liquidaciones** trimestrales:

```
resumen = { iva_devengado, iva_deducible, resultado }   (suma de las liquidaciones)
por_tipo  = desglose por la clave `tipo` de cada liquidación
periodos  = una fila por liquidación
```

> **LA LEY COMO DATO**: los **tipos declarados** (`input.tipos`) se devuelven **sin transformar**
> (`tipos_declarados`) y el módulo **no cablea casillas**. El desglose usa la clave `tipo` que cada
> liquidación declara. Si no se declaran tipos, se agrupa igual por la clave `tipo` de cada liquidación.

Las **liquidaciones** se declaran en el input o se piden best-effort a `liquidacion-iva.calcular.request`.

**Honestidad (invariante 13):** sin liquidaciones → `verificable:false` y `abierto.liquidaciones`.
**El 390 no se inventa.**

**No persiste** (STATELESS); observa `contabilidad.ejercicio_cerrado` (tope 200). La op `construir` es
**PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `modelo-390.construir.request` | `onConstruirRequest` | RPC reflejo (PREGUNTA): `{project_id, liquidaciones?, tipos?, periodos?, ejercicio?}` → `{resumen, por_tipo, periodos, total_periodos, verificable, abierto}`. Delega en `_atender` → `_construir`. Si `status ≠ 200` publica `.failed`. Responde por `modelo-390.construir.response`. |
| `contabilidad.ejercicio_cerrado` | `onEjercicioCerrado` | Fire-and-forget (cierre-ejercicio C4): cerró el ejercicio → se observa `{ejercicio, project_id}` (tope 200). |

### Publishes

| Evento | Cuándo |
|---|---|
| `modelo-390.construir.response` | Respuesta RPC correlada de la op `construir`. |
| `modelo-390.construir.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: reflejo de construcción. No escribe estado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `construir` | **PREGUNTA** | `{project_id, liquidaciones?:[{periodo?, iva_devengado?\|devengado?, iva_deducible?\|deducible?, resultado?, por_tipo?}], tipos?, periodos?, ejercicio?}` | `{project_id, tipo, ejercicio, fuente, tipos_declarados, resumen:{iva_devengado,iva_deducible,resultado}, por_tipo, periodos, total_periodos, verificable, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Origen de liquidaciones** (`_liquidacionesDe`): input `liquidaciones` → o RPC
   `liquidacion-iva.calcular.request` (timeout 800 ms; acepta `resp.liquidaciones` o
   `resp.data.liquidaciones`). `fuente` ∈ `{'declarado','liquidacion-iva',null}`.
2. **Devengado/deducible de cada liquidación**: `iva_devengado` → `devengado` → `cuota_devengada`;
   `iva_deducible` → `deducible` → `cuota_deducible`.
3. **Resultado por liquidación**: `resultado` declarado, o `dev − ded`.
4. **Suma anual**: `resumen = {iva_devengado, iva_deducible, resultado}` (todo redondeado a 2).
5. **Desglose por tipo NATIVO**: solo si la liquidación declara `por_tipo`; se acumula `{base, cuota}`
   por clave. **Nunca inventado.**
6. **`tipos_declarados`**: los tipos del input se devuelven **tal cual** (la ley entra como dato).
7. **`verificable`**: `true` solo si hay alguna liquidación.
8. **Sin liquidaciones**: `abierto.liquidaciones` (no se inventa). Sin tipos declarados:
   `abierto.tipos` (se agrupa igual por la clave `tipo` de cada liquidación).
9. **`_num`** devuelve `0` si no es finito (a diferencia de otros módulos que devuelven `null`).
10. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Construir el 390 con liquidaciones declaradas

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "tipos": [ { "tipo": 21, "casilla": "03" }, { "tipo": 10, "casilla": "06" } ],
  "liquidaciones": [
    { "periodo": "T1", "iva_devengado": 2100, "iva_deducible": 840, "por_tipo": { "21": { "base": 10000, "cuota": 2100 } } },
    { "periodo": "T2", "iva_devengado": 1500, "iva_deducible": 600, "por_tipo": { "21": { "base": 7000, "cuota": 1470 } } }
  ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "modelo-390",
  "ejercicio": "2026",
  "fuente": "declarado",
  "tipos_declarados": [ { "tipo": 21, "casilla": "03" }, { "tipo": 10, "casilla": "06" } ],
  "resumen": { "iva_devengado": 3600, "iva_deducible": 1440, "resultado": 2160 },
  "por_tipo": { "21": { "base": 17000, "cuota": 3570 } },
  "periodos": [
    { "periodo": "T1", "iva_devengado": 2100, "iva_deducible": 840, "resultado": 1260 },
    { "periodo": "T2", "iva_devengado": 1500, "iva_deducible": 600, "resultado": 900 }
  ],
  "total_periodos": 2,
  "verificable": true,
  "abierto": { "liquidaciones": null, "tipos": null }
}
```

### Sin liquidaciones — ABIERTO

```json
{ "project_id": "e57a318a-..." }
```
→ `verificable:false`, `resumen:{0,0,0}`,
`abierto.liquidaciones = "no se recibieron liquidaciones (ni declaradas ni de liquidacion-iva): el 390 no se inventa"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `modelo-390.construir.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_construir`. |
| (no es error) | 200 | Sin liquidaciones → `verificable:false` + `abierto` (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.ejercicio_cerrado` (C4).
- **Llama por RPC (best-effort, 800 ms)**: `liquidacion-iva.calcular.request` (D1).

## Verificación

1. Fichero: `modules/contabilidad-fiscal/modelo-390/`.
2. Eventos reales: subscribes `modelo-390.construir.request`, `contabilidad.ejercicio_cerrado`;
   publishes `modelo-390.construir.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-fiscal/modelo-390/index.js
   # → modelo-390.construir.failed → liquidacion-iva.calcular.request
   ```
4. **Ley como dato**: `tipos_declarados` devuelve los tipos del input sin transformar; no hay casillas cableadas.
5. Test unitario (si existe): suma anual; desglose por tipo nativo; sin liquidaciones → `verificable:false`;
   sin `project_id` → 400 + failed.
