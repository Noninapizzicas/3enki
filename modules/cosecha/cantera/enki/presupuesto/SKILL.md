---
name: presupuesto
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `presupuesto` de la vertical contabilidad
  (Enki). La parcela de la CIFRA OBJETIVO por dimensión declarable: el jefe/asesor fija (ORDEN,
  panel) el objetivo (dimension · periodo · importe) y queda como la vara contra la que
  `desviacion` (J4) y `comparador-periodos` (J9) miden el real. El objetivo NO se estima: sin
  cifra declarada queda [ABIERTO]. UN solo escritor (guard rol PRESUPUESTO; segundo escritor →
  403). No se borra: re-fijar appendea al historial. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando necesites fijar o leer la cifra objetivo de una dimensión
    (RPC presupuesto.fijar.request / .objetivo.request).
  - Cuando depures por qué se rechaza (403 PERMISSION_DENIED si el rol no es PRESUPUESTO), o por
    qué `objetivo:null`/`estado:'ABIERTO'` (no se declaró importe).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.presupuesto_fijado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, analitica, presupuesto, objetivo, desviacion]
---

# presupuesto — CUSTODIO de la cifra objetivo por dimensión

## Qué hace el módulo

`presupuesto` es un **CUSTODIO CON PERSISTENCIA** (J3, hoja del plan). Es la parcela de la
**CIFRA OBJETIVO** por dimensión declarable. El presupuesto NO se estima: se **DECLARA**. El
jefe/asesor fija el objetivo (`dimension · periodo`) y queda como la vara contra la que
`desviacion` (J4) y `comparador-periodos` (J9) miden el real.

Invariantes:
- **Nada se estima**: un objetivo sin cifra declarada NO se rellena con un valor por defecto —
  queda **[ABIERTO]** (el sistema pregunta; no decide).
- **No se borra**: re-fijar un objetivo APPENDEA a su historial con su fecha y su autor.
- **Dato ausente = desconocido**: lo que no viene queda `null`, nunca `0`.
- **UN SOLO ESCRITOR**: solo el rol `PRESUPUESTO` fija objetivos; cualquier otro rol es rechazado
  (segundo escritor → 403).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/presupuesto`, archivo
`presupuesto.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Dos caras:** `fijar` es **ORDEN** (`inline_render`, `area_chat`); `objetivo` es **PREGUNTA** (bus).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `presupuesto.fijar.request` | `onFijarRequest` | RPC custodio (**ORDEN**, panel): `{project_id, rol:'PRESUPUESTO', dimension, periodo?, importe?, moneda?}` → `{project_id, clave, objetivo, fijado, abierto}`. Guard de escritor (solo PRESUPUESTO). Fija la cifra objetivo (o la deja `[ABIERTO]` si no llega importe). Publica `contabilidad.presupuesto_fijado`. Responde por `.fijar.response`. |
| `presupuesto.objetivo.request` | `onObjetivoRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, dimension, periodo?}` → `{project_id, clave, dimension, periodo, objetivo, abierto}`. Devuelve el objetivo vigente; si no está fijado, `objetivo:null` y `abierto:true`. Responde por `.objetivo.response`. |
| `project.activated` | `onProjectActivated` | Restaura el presupuesto del proyecto activado desde el storage. |

> Nota de deriva (R3): el plan declara subir `cola-declaraciones-criterio.fijar.request`, pero el
> `module.json` real **no** lo declara.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.presupuesto_fijado` | Fire-and-forget (J3): un objetivo quedó fijado (o sigue `[ABIERTO]`) → `{project_id, clave, dimension, periodo, importe, moneda, estado, abierto}`. Lo consumen `desviacion` (J4) y `comparador-periodos` (J9). |
| `presupuesto.fijar.response` | Respuesta RPC correlada de la op `fijar`. |
| `presupuesto.fijar.failed` | Fallo determinista: rol ≠ PRESUPUESTO, falta `project_id` o `dimension`. |
| `presupuesto.objetivo.response` | Respuesta RPC correlada de la op `objetivo`. |
| `presupuesto.objetivo.failed` | Fallo determinista: falta `project_id` o `dimension`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `fijar` | **ORDEN** (panel) | `{project_id, rol:'PRESUPUESTO', dimension\|clave, periodo?, importe?\|objetivo?\|cifra?, moneda?}` | `{project_id, clave, objetivo, fijado:true, abierto}` | 403 `PERMISSION_DENIED`; 400 `INVALID_INPUT` (`project_id`/`dimension`) |
| `objetivo` | **PREGUNTA** (bus) | `{project_id, dimension, periodo?}` | `{project_id, clave, dimension, periodo, objetivo, abierto, motivo?}` | 400 `INVALID_INPUT` |

## Reglas de negocio (lo que el código IMPONE)

1. **Guard de escritor**: `input.rol === 'PRESUPUESTO'` (`ROL_ESCRITOR`). Otro rol →
   `403 PERMISSION_DENIED` con `{rol_esperado, rol_recibido}`.
2. **Dimension obligatoria**: de `dimension` o `clave`; si vacía → `_invalid('dimension')`.
   `periodo` opcional (`null` si vacío).
3. **Importe** (`_num`): de `importe`, `objetivo` o `cifra`; no finito → `null`.
4. **Con importe → DECLARADO**: `estado='DECLARADO'`, `fijado_por='PRESUPUESTO'`, `fijado_en=ahora`.
   **Sin importe → [ABIERTO]**: `importe:null`, `estado='ABIERTO'`, `fijado_en` conservado.
5. **No se borra**: cada `fijar` hace `push` a `objetivo.historial` con `{estado, importe, por, en}`.
6. **`clave`** = `` `${periodo || '*'}::${dimension}` ``.
7. **`_objetivo`**: si no hay objetivo fijado → `objetivo:null, abierto:true, motivo:'el objetivo no
   esta fijado: el sistema pregunta, no estima'`. Con objetivo → `abierto = estado === 'ABIERTO'`.
8. **`moneda`**: solo se actualiza si viene `input.moneda !== undefined`.

## Cómo se usa (RPCs)

### 1. Fijar el objetivo

```json
{ "project_id": "e57a318a-...", "rol": "PRESUPUESTO", "dimension": "ventas-pizzepos", "periodo": "2026-Q4", "importe": 50000, "moneda": "EUR", "correlation_id": "abc-13" }
```
Respuesta `200` + `contabilidad.presupuesto_fijado`:
```json
{ "project_id": "e57a318a-...", "clave": "2026-Q4::ventas-pizzepos", "objetivo": { "clave": "2026-Q4::ventas-pizzepos", "dimension": "ventas-pizzepos", "periodo": "2026-Q4", "importe": 50000, "moneda": "EUR", "estado": "DECLARADO", "fijado_por": "PRESUPUESTO", "fijado_en": "2026-10-01T...", "historial": [ { "estado": "DECLARADO", "importe": 50000, "por": "PRESUPUESTO", "en": "2026-10-01T..." } ] }, "fijado": true, "abierto": false }
```

### 2. Fijar sin importe → [ABIERTO]

```json
{ "project_id": "e57a318a-...", "rol": "PRESUPUESTO", "dimension": "costes-fijos", "periodo": "2026-Q4" }
```
Respuesta `200`: `estado:'ABIERTO'`, `importe:null`, `abierto:true`.

### 3. Leer objetivo no fijado

```json
{ "project_id": "e57a318a-...", "dimension": "otra" }
```
Respuesta `200`: `{objetivo:null, abierto:true, motivo:'el objetivo no esta fijado: el sistema pregunta, no estima'}`.

### Fallo — rol inválido

```json
{ "project_id": "e57a318a-...", "rol": "JEFE_CRITERIO", "dimension": "x", "importe": 1 }
```
Respuesta `403` + `presupuesto.fijar.failed` (`PERMISSION_DENIED`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `403 PERMISSION_DENIED` | `rol !== 'PRESUPUESTO'`. |
| `400 INVALID_INPUT` (`project_id`/`dimension`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; el plan dice `cola-declaraciones-criterio`, no cableado en el código).
- **Quién la consume:** `desviacion` (J4) y `comparador-periodos` (J9) miden el real contra el
  objetivo vía `contabilidad.presupuesto_fijado`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/presupuesto/module.json` + `index.js`.
2. Smoke: `fijar` con rol PRESUPUESTO → 200 + `contabilidad.presupuesto_fijado`.
3. Sin importe → `estado:'ABIERTO'`, `abierto:true`.
4. Rol inválido → 403 + `.fijar.failed`.
5. `objetivo` no fijado → `objetivo:null, abierto:true`.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `Presupuesto extends ModuloHibridoReflejo`; `name = 'presupuesto'`,
  `version = 'reflejo-0.1.0'`. Store `this._presupuestos` (Map `pid → {esquema, objetivos:
  Map<clave, Objetivo>}`).
- **PosPersistencia**: `file:'presupuesto.json'`, `dir:'/contabilidad/presupuesto'`.
- Proyecciones `_fijar`/`_objetivo`; helper `_clave`, `_num`; tools `toolFijar`/`toolObjetivo`.
