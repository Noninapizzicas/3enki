---
name: cupula-gcode
description: >
  Operar el módulo CUSTODIO cupula-gcode del proyecto 3D (taller de impresión 3D).
  Es la CÚPULA de gcode: almacén de gcode indexado por (modelo, material) y fuente
  de verdad del gcode — si un modelo no tiene gcode aquí, no se puede imprimir.
  Guarda el gcode por modelo una vez sliceado para reutilizarlo sin reslicear
  (invariante 3). Rechaza gcode vacío/corrupto y avisa (invariante 10). Single-writer
  de su store por proyecto vía PosPersistencia. Lo consume ciclo-impresion por RPC
  (cupula.almacenar/buscar.request).
when-to-use: >
  Cuando necesites almacenar, buscar o reutilizar gcode de un modelo 3D en el
  proyecto 3d; cuando el ciclo de impresión necesite el gcode de una pieza sin
  volver a slicear; cuando un modelo no tenga gcode y haya que decidir si slicear;
  o cuando quieras diagnosticar/verificar el módulo cupula-gcode (CUSTODIO, hoja 6.3).
tags: [enki, proyecto-3d, custodia, gcode, impresion-3d, cupula, reflejo-js, pos-persistencia]
---

# cupula-gcode — CÚPULA de gcode (CUSTODIO)

## Qué hace el módulo

`cupula-gcode` es un **CUSTODIO** (reflejo JS puro, `blueprint_driven: false`) del
proyecto 3D. Es la **fuente de verdad del gcode**: si un modelo no tiene gcode aquí,
**no se puede imprimir**. Guarda el gcode **por modelo** una vez sliceado para
reutilizarlo **sin reslicear** (invariante 3 del plan: *gcode reusable*).

- **Single-writer** de su store por proyecto vía `PosPersistencia` (file
  `cupula-gcode.json`, dir `/3d/cupula-gcode`, patrón `json-file-per-project`,
  concurrencia `single-writer`).
- Depende de `filesystem` (`fs.*.request`) para persistir.
- Lo consume `ciclo-impresion` por RPC (`cupula.almacenar.request` /
  `cupula.buscar.request`).
- Todo flujo cierra su círculo: par canónico `cupula.almacenar.failed`.

**Rol en el sistema**: actúa como **caché** para encadenar la siguiente pieza sin
espera de slicing (el cuello de botella es la impresora SPARKX i7, una pieza a la
vez). Garantiza que la impresora nunca quede idle por falta de gcode (invariante 11).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `cupula.almacenar.request` | `onAlmacenarRequest` | Almacena (upsert) un gcode por (modelo, material). Rechaza vacío/corrupto. Emite `cupula.gcode_almacenado` o `cupula.almacenar.failed`. |
| `cupula.buscar.request` | `onBuscarRequest` | Busca el gcode de un modelo (con material o `material_por_defecto`). Devuelve el gcode o `ausente`. |
| `project.activated` | `onProjectActivated` | Restaura el estado persistido del proyecto (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `cupula.gcode_almacenado` | Gcode almacenado en la cúpula por (modelo, material). Lleva `project_id` top-level + `correlation_id`. |
| `cupula.almacenar.failed` | Fallo al almacenar gcode (vacío/corrupto). Par canónico de `cupula.almacenar.request`. Lleva `project_id` top-level + `correlation_id`. |

### Config / Observabilidad

- `config.persistence`: scope `project`, tipo `pos-persistencia`, data_path
  `3d/cupula-gcode`, patrón `json-file-per-project`, concurrencia `single-writer`.
- `observability.logging`: level `info`, structured, `correlation_id: true`.
- `observability.metrics.counters`: `cupula-gcode.gcode_almacenado.total`,
  `cupula-gcode.almacenar.failed.total`, `cupula-gcode.errors`.
- `observability.metrics.gauges`: `cupula-gcode.gcode.count`.

## Cómo se usa (RPCs)

El módulo expone dos RPCs request/response (handlers de una línea que delegan en
`_atender`):

### `cupula.almacenar.request` → `cupula.almacenar.response`

Payload de entrada:

```json
{
  "project_id": "e57a318a-...",
  "modelo_id": "m1",
  "gcode": "G28 ; home\nG1 Z5 F3000\n...",
  "material": "PLA",
  "perfil": "0.2mm"            // opcional, default "desconocido"
}
```

Respuesta `200` (éxito):

```json
{
  "status": 200,
  "data": { "project_id": "...", "clave": "m1::PLA", "modelo_id": "m1", "material": "PLA", "reutilizable": true }
}
```

Respuesta `400` (rechazo, emite `cupula.almacenar.failed`):

```json
{ "status": 400, "data": { "error": "INVALID_INPUT", "message": "gcode requerido (no vacio)" } }
```

### `cupula.buscar.request` → `cupula.buscar.response`

Payload de entrada:

```json
{ "project_id": "...", "modelo_id": "m1", "material": "PLA" }
```

Respuesta `200` (encontrado):

```json
{
  "status": 200,
  "data": { "project_id": "...", "modelo_id": "m1", "material": "PLA", "encontrado": true, "gcode": { "clave": "m1::PLA", "modelo_id": "m1", "material": "PLA", "contenido": "...", "perfil": "...", "sliceado_en": "...", "actualizado_en": "..." } }
}
```

Respuesta `200` (no encontrado — **no se puede imprimir**):

```json
{ "status": 200, "data": { "project_id": "...", "modelo_id": "m1", "material": "PLA", "encontrado": false, "gcode": null } }
```

> **Nota**: `buscar` devuelve `200` incluso cuando no encuentra (no es un error);
> el flag `encontrado:false` es la señal de "no hay gcode → hay que slicear".

También expone tools/UI: `toolAlmacenar`, `toolBuscar`, `handleUiAlmacenar`,
`handleUiBuscar`.

## Reglas de negocio

1. **Gcode por (modelo, material)** — la clave es `${modeloId}::${material}`. Un
   mismo modelo puede tener gcode distinto por material (PLA vs PETG).
2. **Reutilizable sin reslicear** — si `buscar` encuentra el gcode del
   (modelo, material), se reutiliza; no se vuelve a slicear (invariante 3).
3. **Material por defecto** — si el gcode no declara material, se indexa como
   `material_por_defecto` (pregunta abierta 11). `buscar` sin material cae al
   `material_por_defecto`; si pide un material concreto y no existe, también
   intenta el `material_por_defecto` como fallback.
4. **Gcode vacío/corrupto NO se guarda** (invariante 10) — se rechaza con `400`
   `INVALID_INPUT`, se emite `cupula.almacenar.failed` y se avisa. Umbral de
   corrupción: `GCODE_MIN_LEN = 16` (gcode más corto → sospechoso de corrupto).
5. **Upsert** — re-almacenar el mismo (modelo, material) actualiza el contenido
   sin duplicar (misma clave, `actualizado_en` renovado).
6. **Fuente de verdad** — si un modelo no tiene gcode aquí, no se puede imprimir
   (`encontrado:false`). El ciclo decide entonces slicear antes de encadenar.
7. **Single-writer** — solo `cupula-gcode` escribe en su store; nadie más.
8. **Cierre de círculo** — todo flujo cierra con par canónico (`*.failed` /
   `ok:false`); nadie da por hecho un almacenamiento sin `ok:true` explícito.

## Verificación (test unitario)

Test determinista (sin bus, sin red) en
`tests/unit/cupula-gcode__almacenar.test.js`. Verifica la lógica pura
(`_almacenar` · `_buscar` · `_indexar`) con `_rpc`/`eventBus` stubeados (patrón de
la casa: el reflejo se testea por métodos internos).

```bash
cd /opt/enki/modules/cupula-gcode
node tests/unit/cupula-gcode__almacenar.test.js
# Esperado: RESULTADO: 8/8 bloques OK  (exit 0)
```

Casos cubiertos (8 bloques):

1. **T1** — almacena gcode por (m1, PLA) → clave `m1::PLA`, `reutilizable:true`.
2. **T2** — buscar (m1, PLA) → `encontrado:true`, mismo gcode (reutilizado, sin reslicear).
3. **T3** — almacenar sin material → clave `m2::material_por_defecto`; buscar sin material lo encuentra.
4. **T4** — modelo sin gcode → `encontrado:false`, `gcode:null` (no se puede imprimir).
5. **T5** — gcode vacío → `400 INVALID_INPUT` + emite `cupula.almacenar.failed`.
6. **T6** — gcode corrupto (muy corto) → `400` + emite `failed` + **NO se guarda** (invariante 10).
7. **T7** — almacenar sin `modelo_id` → `400 INVALID_INPUT`.
8. **T8** — upsert (m5, PETG) → misma clave, contenido actualizado sin duplicar.

## Pitfalls

- **No confundir `400` con fallo de busqueda**: `buscar` devuelve `200` con
  `encontrado:false` cuando no hay gcode; `400` solo ocurre en `almacenar` por
  input inválido (falta `project_id`/`modelo_id`, gcode vacío/corrupto).
- **`project_id` es obligatorio** en ambas operaciones; sin él → `400 INVALID_INPUT`.
- **El gcode corrupto no se guarda**: si un test o flujo espera que un gcode corto
  persista, fallará — es comportamiento intencional (invariante 10).
- **No escribir en `/opt/enki/`**: para editar/crear skills de este módulo, escribe
  en `/tmp/skills/cupula-gcode/` y deja que el orquestador las coloque.
- **El store es por proyecto**: `_stores` es `Map<project_id, Map<clave, Gcode>>`;
  cada proyecto tiene su propio store aislado.
