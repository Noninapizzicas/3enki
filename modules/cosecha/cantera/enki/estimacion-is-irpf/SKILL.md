---
name: estimacion-is-irpf
description: >-
  Skill FULL del módulo REFLEJO STATELESS `estimacion-is-irpf` de la vertical contabilidad (Enki).
  Estima el resultado fiscal (IS/IRPF) con BASE DECLARADA. **Los tramos y tipos son DATO — nunca
  cableados** (la ley entra como dato). Sin base o sin tramos, la cuota queda ABIERTA (no se finge).
  La base se declara o se deriva de `cuenta-resultados` (C2) + ajustes declarados. El régimen sale
  de `perfil-administrativo` (D15) best-effort. Escucha `contabilidad.ejercicio_cerrado`. Sin store
  propio. La op `estimar` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites estimar IS/IRPF con base y tramos declarados (RPC estimacion-is-irpf.estimar.request).
  - Cuando depures por qué la cuota sale `null` (`abierto.base` o `abierto.tramos`).
  - Cuando quieras entender la LEY COMO DATO (tramos/tipos declarables) y sus dependencias best-effort.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, fiscal, is, irpf, ley-como-dato]
---

# estimacion-is-irpf — REFLEJO STATELESS de la estimación fiscal

## Qué hace el módulo

`estimacion-is-irpf` es un **REFLEJO STATELESS** (D5, hoja del plan) de la vertical **contabilidad**,
eje **fiscal**. **Estima el resultado fiscal** (Impuesto de Sociedades / IRPF) a partir de una
**base imponible declarada** y unos **tramos/tipos declarados**.

> **LA LEY COMO DATO**: los **tramos** y los **tipos** **NO van cableados**. Se declaran en el input
> (`tramos`, `regimen.tramos`, `tipos`) o se derivan del régimen. El código **no** contiene la tabla
> de la ley: la recibe. Si no llegan tramos, la cuota queda **sin calcular** y se declara.

La **base imponible** se declara, o se **deriva** del resultado contable + ajustes declarados
(`base = resultado + ajustes`); el resultado contable se pide best-effort a `cuenta-resultados` (C2).
El **régimen** se toma del input o de `perfil-administrativo` (D15) best-effort.

**Honestidad (invariante 13):** sin base → `abierto.base`; sin tramos → `abierto.tramos`.
En ambos casos la cuota queda `null`. **No se finge una cuota.**

**No persiste** (STATELESS); observa `contabilidad.ejercicio_cerrado` (tope 100). La op `estimar` es
**PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `estimacion-is-irpf.estimar.request` | `onEstimarRequest` | RPC reflejo (PREGUNTA): `{project_id, base?, resultado?, ajustes?, tramos?\|regimen.tramos?\|tipos?, deducciones?, retenciones_pagadas?, regimen?, obligaciones?, ejercicio?, fecha?}` → `{base_imponible, cuota, tramos_aplicados, deducciones, retenciones, a_ingresar, abierto}`. Delega en `_atender` → `_estimar`. Si `status ≠ 200` publica `.failed`. Responde por `estimacion-is-irpf.estimar.response`. |
| `contabilidad.ejercicio_cerrado` | `onEjercicioCerrado` | Fire-and-forget (cierre-ejercicio C4): cerró el ejercicio → se observa el cierre (tope 100) si `estado === 'cerrado'`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `estimacion-is-irpf.estimar.response` | Respuesta RPC correlada de la op `estimar`. |
| `estimacion-is-irpf.estimar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: reflejo de estimación. No escribe estado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `estimar` | **PREGUNTA** | `{project_id, base?, resultado?, ajustes?, tramos?:[{hasta, tipo\|tipo_pct}], deducciones?, retenciones_pagadas?, regimen?, obligaciones?, ejercicio?, fecha?}` | `{project_id, tipo, regimen, fuente_perfil, base_imponible, fuente_base, resultado_contable, ajustes, tramos_aplicados, cuota, deducciones, retenciones, a_ingresar, determinista, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **La base** (`_base`): declarada (`base`) → o `resultado + ajustes` (resultado declarado o de
   `cuenta-resultados.calcular.request`, ajustes declarados). `fuente_base` ∈
   `{'declarado','resultado+ajustes',null}`.
2. **Los tramos son DATO** (`_tramos`): input `tramos` → `regimen.tramos` → `tipos`; normalizados a
   `{hasta, tipo}` y ordenados por `hasta` (el último puede ser `hasta:null` = abierto → `Infinity`).
   **Ninguno está cableado en el código.**
3. **Cálculo por tramos**: progresivo; `enTramo = max(0, min(base,hasta) − anterior)`; cuota del
   tramo = `enTramo × tipo/100`. El tramo abierto final (`hasta:null`) **sí se aplica**.
4. **Sin base o sin tramos** → `cuota:null` y `abierto.base` / `abierto.tramos`. **No se finge cuota.**
5. **Deducciones y retenciones declaradas**: `a_ingresar = cuota − deducciones − retenciones`
   (solo si hay cuota).
6. **El régimen** (`_perfil`): input `regimen`/`obligaciones` → o `perfil-administrativo.obligaciones.request`
   (D15, timeout 800 ms). `fuente_perfil` ∈ `{'declarado','perfil-administrativo',null}`.
7. **Determinista**: mismas base+tramos → misma estimación.
8. **`_round`** a 2 decimales en todos los importes.

## Cómo se usa (RPC)

### Estimar con base y tramos declarados

```json
{
  "project_id": "e57a318a-...",
  "base": 60000,
  "ajustes": 0,
  "tramos": [
    { "hasta": 50000, "tipo": 20 },
    { "hasta": null, "tipo": 25 }
  ],
  "deducciones": 500,
  "retenciones_pagadas": 1000,
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "estimacion-is-irpf",
  "regimen": null,
  "base_imponible": 60000,
  "fuente_base": "declarado",
  "tramos_aplicados": [
    { "desde": 0, "hasta": 50000, "tipo": 20, "base_en_tramo": 50000, "cuota": 10000 },
    { "desde": 50000, "hasta": null, "tipo": 25, "base_en_tramo": 10000, "cuota": 2500 }
  ],
  "cuota": 12500,
  "deducciones": 500,
  "retenciones": 1000,
  "a_ingresar": 11000,
  "determinista": true,
  "abierto": { "base": null, "tramos": null }
}
```

### Sin tramos — cuota abierta

```json
{ "project_id": "e57a318a-...", "base": 60000 }
```
→ `cuota:null`,
`abierto.tramos = "no se declararon tramos/tipos (la ley entra como DATO): sin tramos la cuota queda sin calcular"`.

### Sin base — se declara

→ `abierto.base = "no hay base (ni declarada ni derivable del resultado contable): la estimacion no se inventa"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `estimacion-is-irpf.estimar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_estimar`. |
| (no es error) | 200 | Sin base o sin tramos → cuota `null` + `abierto` (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.ejercicio_cerrado` (C4).
- **Llama por RPC (best-effort, 800 ms)**: `cuenta-resultados.calcular.request` (C2),
  `perfil-administrativo.obligaciones.request` (D15).

## Verificación

1. Fichero: `modules/contabilidad-fiscal/estimacion-is-irpf/`.
2. Eventos reales: subscribes `estimacion-is-irpf.estimar.request`, `contabilidad.ejercicio_cerrado`;
   publishes `estimacion-is-irpf.estimar.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-fiscal/estimacion-is-irpf/index.js
   # → estimacion-is-irpf.estimar.failed → cuenta-resultados.calcular.request / perfil-administrativo.obligaciones.request
   ```
4. **Ley como dato**: `grep` no debe encontrar tramos/tipos numéricos de la ley cableados; el array
   de tramos sale siempre del input.
5. Test unitario (si existe): tramos progresivos correctos; tramo abierto; sin tramos → abierto;
   sin base → abierto; sin `project_id` → 400 + failed.
