---
name: deduplicacion-hecho
description: >-
  Skill FULL del módulo REFLEJO STATELESS `deduplicacion-hecho` de la vertical contabilidad (Enki).
  IDEMPOTENCIA DETERMINISTA: la clave natural del hecho/documento decide si YA se vio; reprocesar
  NO duplica ("un cierre = un asiento" en la puerta de entrada). La clave no se recalcula aquí: la
  SUBE a clave-natural (M3) por EVENTO. El reflejo decide `es_nuevo` comparando la clave con las ya
  vistas (registro DERIVADO en memoria, por proyecto). Determinista. Sin elemento o sin clave →
  veredicto ABIERTO (null), nunca se adivina ni el nuevo ni el duplicado. NO escribe, NO persiste.
when-to-use: >-
  - Cuando necesites decidir si un hecho/documento es nuevo por su clave natural
    (RPC deduplicacion-hecho.es_nuevo.request).
  - Cuando depures por qué el veredicto es `null` (clave-natural no respondió) o `es_duplicado:true`.
  - Cuando quieras entender su contrato de eventos: es reflejo puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, deduplicacion, idempotencia, clave-natural]
---

# deduplicacion-hecho — REFLEJO de idempotencia en la puerta de entrada

## Qué hace el módulo

`deduplicacion-hecho` es un **REFLEJO STATELESS** (A7, hoja del plan). Garantiza **IDEMPOTENCIA
DETERMINISTA**: la clave natural del hecho/documento decide si **YA se vio**; reprocesar **NO
duplica**. Cierra "un cierre = un asiento" en la **PUERTA** de entrada.

La clave natural **NO se recalcula aquí**: la calcula `clave-natural` (M3) y esta hoja la **SUBE**
por **EVENTO** (`clave-natural.calcular.request`). El reflejo decide si el hecho es **NUEVO**
comparando su clave con las ya vistas (su propio registro de claves, en memoria, por proyecto).

Invariantes:
- **DETERMINISTA**: mismo hecho → misma clave → mismo veredicto (nuevo/duplicado).
- **Sin elemento NO hay clave ni veredicto** (dato ausente = desconocido): no se marca como nuevo ni
  como duplicado lo que no se pudo identificar.
- **NO escribe dominio, NO persiste, NO muta** el hecho: decide y declara. Su registro de claves
  vistas es un **DERIVADO en memoria** (no un hecho de negocio).

R3: el plan **no declara** escucha de dominio y el código no añade ninguna.

RPC **PREGUNTA** → sin `ui_handlers`; su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `deduplicacion-hecho.es_nuevo.request` | `onEsNuevoRequest` | RPC reflejo (**PREGUNTA**, por el bus): `{project_id?, elemento\|hecho\|documento, componentes?}` → `{project_id, clave, componentes, es_nuevo, es_duplicado, vistas, determinista}`. Calcula la clave natural (vía clave-natural M3 por evento) y decide si ya se vio. Sin elemento → `INVALID_INPUT`; sin clave → veredicto abierto (`null`). Responde por `.es_nuevo.response`. |

**Sube por evento:** `clave-natural.calcular.request` (M3) con `{project_id, elemento,
componentes?}`, `await this._rpc(...)`. Nunca import.

### Publishes

| Evento | Cuándo |
|---|---|
| `deduplicacion-hecho.es_nuevo.response` | Respuesta RPC correlada de la op `es_nuevo`. |
| `deduplicacion-hecho.es_nuevo.failed` | Fallo determinista: falta el elemento. |

> **No publica hecho de dominio** (R2).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `es_nuevo` | **PREGUNTA** (bus) | `{project_id?, elemento\|hecho\|documento, componentes?}` | `{project_id, elemento, clave, componentes, es_nuevo, es_duplicado, vistas, determinista:true, idempotente:true, abierto}` | 400 `INVALID_INPUT` (`elemento`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Elemento obligatorio**: `elemento`/`hecho`/`documento` objeto → si no, `_invalid('elemento')`.
2. **Sube a clave-natural**: `await this._rpc('clave-natural.calcular.request', {project_id,
   elemento, componentes})`. Si no responde o no da clave → **veredicto ABIERTO**: `clave:null,
   es_nuevo:null, es_duplicado:null, vistas:null`, `abierto.clave` declarado.
3. **`es_nuevo = previa === null`** (la clave no estaba en el registro). `es_duplicado = !es_nuevo`.
4. **Registro DERIVADO** (`_vistas`): Map `pid → Map<clave, {primera_vez, visto}>`. Al pasar, se
   `set` con `primera_vez` (la primera vez que se vio) y `visto` incrementado.
5. **`vistas`** = número de veces que se ha visto esa clave.
6. **Determinista e idempotente**: mismos elementos → misma clave → mismo veredicto.
7. **Lectura directa** `clavesDe(pid)` (derivado, no muta): claves vistas del proyecto.

## Cómo se usa (RPC)

### 1. Primera vez → nuevo

```json
{ "project_id": "e57a318a-...", "elemento": { "tipo": "cierre", "ejercicio": "2026", "sociedad": "A" } }
```
Respuesta `200`: `{clave:'2026|a|cierre', es_nuevo:true, es_duplicado:false, vistas:1, determinista:true, idempotente:true}`.

### 2. Reprocesar → duplicado

Misma petición → `{es_nuevo:false, es_duplicado:true, vistas:2}`.

### 3. clave-natural no responde → [ABIERTO]

Respuesta `200`: `{clave:null, es_nuevo:null, es_duplicado:null, vistas:null, abierto:{clave:'...'}}`.

### Fallo — sin elemento

Respuesta `400` + `deduplicacion-hecho.es_nuevo.failed` (`INVALID_INPUT`, field `elemento`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`elemento`) | no viene elemento/hecho/documento objeto. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** `clave-natural` (M3) — **sube** `clave-natural.calcular.request` por EVENTO.
- **Quién la usa:** la cadena de entrada (antes de asentar, para no duplicar).
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-entrada/deduplicacion-hecho/module.json` + `index.js`.
2. Smoke: `es_nuevo` dos veces con el mismo elemento → 1ª `es_nuevo:true`, 2ª `es_duplicado:true`.
3. Sin elemento → 400 + `.es_nuevo.failed`.
4. `grep -E '"event"' module.json` (solo `es_nuevo.request`).

## Notas de implementación

- Clase `DeduplicacionHecho extends ModuloHibridoReflejo`; `name = 'deduplicacion-hecho'`,
  `version = 'reflejo-0.1.0'`. **Sin PosPersistencia**, pero con un registro DERIVADO en memoria
  `this._vistas` (Map `pid → Map<clave, {primera_vez, visto}>`). No se restaura entre reinicios (no
  es estado de negocio).
- `onEsNuevoRequest` delega en `_atender` (`async`), publica `.es_nuevo.failed` si status ≠ 200.
  Proyección `async _es_nuevo`; helper `_registro`; lectura `clavesDe(pid)`; tool `toolEsNuevo`.
