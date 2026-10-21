---
name: aislamiento-negocio
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `aislamiento-negocio` de la vertical contabilidad
  (Enki). Multi-negocio SIN FUGA: cada negocio tiene su PARCELA (frontera de aislamiento) con UN
  dueño; un negocio NUNCA se fuga a la parcela de otro. La LEY de escritura NO se reimplementa: se
  RECLAMA la parcela en `single-writer` (M2) por EVENTO (`single-writer.reclamar.request`); este
  módulo guarda la relación negocio → parcela. AISLAMIENTO: un segundo negocio sobre la misma
  parcela → 409 PARCELA_OCUPADA. ESCUCHA contabilidad.negocio_registrado. Persiste por proyecto.
when-to-use: >-
  - Cuando necesites crear la parcela aislada de un negocio, o leer su parcela/escritor
    (RPC aislamiento-negocio.crear_parcela.request / .parcela.request / .escritor.request).
  - Cuando depures un 409 PARCELA_OCUPADA (otro negocio ya tiene la parcela) o por qué
    `reclamada:false` (no se pudo subir a single-writer).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.negocio_parcela_creada.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, analitica, multi-negocio, aislamiento, parcela]
---

# aislamiento-negocio — CUSTODIO del aislamiento multi-negocio

## Qué hace el módulo

`aislamiento-negocio` es un **CUSTODIO CON PERSISTENCIA** (I4, hoja del plan). Garantiza
**multi-negocio SIN FUGA**: cada negocio tiene su **PARCELA** (frontera de aislamiento) con un
solo dueño. Un negocio **NUNCA** se fuga a la parcela de otro. (Espejo de la pareja eje negocio ←→
persona.)

La **LEY de escritura NO se reimplementa**: **RECLAMA** la parcela en `single-writer` (M2) por
**EVENTO** (`single-writer.reclamar.request`), que es el único que concede titularidad. Aquí solo
se **GUARDA** la relación negocio → parcela y se impide que dos negocios compartan una.

Invariantes:
- **AISLAMIENTO**: una parcela pertenece a UN negocio; un segundo negocio sobre la misma parcela se
  **RECHAZA** (`409 PARCELA_OCUPADA`). Los negocios no se fugan.
- **Dato ausente = desconocido**: sin `negocio_id` declarado NO hay parcela (no se inventa una).
- **No se borra**: re-crear una parcela del MISMO negocio es idempotente; el historial se apila.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/aislamiento-negocio`, archivo
`aislamiento-negocio.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Tres caras:** `parcela` y `escritor` son **PREGUNTA** (bus); `crear_parcela` es **ORDEN**
(`system_panel`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `aislamiento-negocio.parcela.request` | `onParcelaRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, negocio_id\|parcela}` → `{project_id, negocio_id, parcela, escritor, existe, aislado}`. Devuelve la frontera (parcela) del negocio; si no tiene, `parcela:null, existe:false`. Responde por `.parcela.response`. |
| `aislamiento-negocio.escritor.request` | `onEscritorRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, negocio_id\|parcela}` → `{project_id, negocio_id, parcela, escritor, unico_escritor}`. Devuelve el ÚNICO escritor de la parcela; sin parcela, `escritor:null` (no se asume). Responde por `.escritor.response`. |
| `aislamiento-negocio.crear_parcela.request` | `onCrearParcelaRequest` | RPC custodio (**ORDEN**, panel): `{project_id, negocio_id, escritor?, parcela?}` → `{project_id, negocio_id, parcela, escritor, creada, aislada, reclamada}`. Crea la parcela (por defecto `negocio:<id>`) y la reclama en `single-writer` por EVENTO. Una parcela ya ocupada por OTRO negocio → `409 PARCELA_OCUPADA`. Publica `contabilidad.negocio_parcela_creada`. |
| `contabilidad.negocio_registrado` | `onNegocioRegistrado` | **Fire-and-forget** (lo emite `onboarding-negocio` K1): un negocio quedó registrado → deja constancia de que existe para su parcela. **No responde.** (Solo refresca `updated_at`; la parcela se crea con `crear_parcela`.) |
| `project.activated` | `onProjectActivated` | Restaura la parcela por negocio del proyecto activado desde el storage. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.negocio_parcela_creada` | Fire-and-forget (I4): la parcela aislada de un negocio quedó creada (y reclamada) → `{project_id, negocio_id, parcela, escritor, creada}`. Lo consumen los custodios multi-negocio para operar por parcela sin fuga. |
| `aislamiento-negocio.parcela.response` / `.parcela.failed` | RPC `parcela`. |
| `aislamiento-negocio.escritor.response` / `.escritor.failed` | RPC `escritor`. |
| `aislamiento-negocio.crear_parcela.response` / `.crear_parcela.failed` | RPC `crear_parcela`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `parcela` | **PREGUNTA** (bus) | `{project_id, negocio_id\|parcela}` | `{project_id, negocio_id, parcela, escritor, existe, aislado, creada_en?, abierto}` | 400 `INVALID_INPUT` (`project_id`/`negocio_id`) |
| `escritor` | **PREGUNTA** (bus) | `{project_id, negocio_id\|parcela}` | `{project_id, negocio_id, parcela, escritor, unico_escritor, abierto}` | 400 `INVALID_INPUT` |
| `crear_parcela` | **ORDEN** (panel) | `{project_id, negocio_id\|negocio, escritor?\|rol?, parcela?}` | `{project_id, negocio_id, parcela, escritor, creada, ya_era, aislada, total_negocios, reclamada, abierto}` | 409 `PARCELA_OCUPADA`; 400 `INVALID_INPUT` |

## Reglas de negocio (lo que el código IMPONE)

1. **`_negocioId`**: de `negocio_id`/`negocio`/`n`. Sin `negocio_id` ni `parcela` →
   `_invalid('negocio_id')`.
2. **`_parcela`** (no muta): busca por `negocio_id` o, si no, por `parcela`. Sin match →
   `parcela:null, existe:false, aislado:true`, `abierto.parcela` declarado.
3. **`_escritor`** (no muta): `escritor:null, unico_escritor:false` si no hay parcela;
   `abierto.parcela` declarado.
4. **`crear_parcela`**: `escritor` de `input.escritor`/`input.rol`/`negocio_id`; `parcela` de
   `input.parcela` o `negocio:<id>`.
5. **AISLAMIENTO**: si la parcela ya es de OTRO negocio → `409 PARCELA_OCUPADA` con
   `{project_id, parcela, ocupante, pretendiente}`.
6. **No se borra**: si el negocio ya tenía esa parcela (`ya_era`), no se apila historial; si cambia,
   cada creada hace `push` a `historial` con `{parcela, escritor, en}`.
7. **Reclama en single-writer por EVENTO**: `await this._rpc('single-writer.reclamar.request',
   {project_id, parcela, escritor})`. `reclamada = (reclamacion?.status === 200)`. Si falla
   (best-effort), `abierto.single_writer` lo declara y la parcela queda creada.
8. **`onNegocioRegistrado`**: solo anota/refresca el libro para el negocio; no crea parcela. Envuelto
   en `try/catch` con `logger.error`.

## Cómo se usa (RPC + evento)

### 1. Crear la parcela de un negocio

```json
{ "project_id": "e57a318a-...", "negocio_id": "pizzepos-1", "escritor": "escritor-pizzepos", "correlation_id": "abc-17" }
```
Respuesta `200` + `contabilidad.negocio_parcela_creada`:
```json
{ "project_id": "e57a318a-...", "negocio_id": "pizzepos-1", "parcela": "negocio:pizzepos-1", "escritor": "escritor-pizzepos", "creada": true, "ya_era": false, "aislada": true, "total_negocios": 1, "reclamada": true, "abierto": null }
```
(Reclama `negocio:pizzepos-1` en `single-writer`.)

### 2. Segundo negocio sobre la misma parcela → 409

```json
{ "project_id": "e57a318a-...", "negocio_id": "pizzepos-2", "parcela": "negocio:pizzepos-1" }
```
Respuesta `409` + `aislamiento-negocio.crear_parcela.failed` (`PARCELA_OCUPADA`, `{ocupante,
pretendiente}`).

### 3. Leer parcela

```json
{ "project_id": "e57a318a-...", "negocio_id": "pizzepos-1" }
```
Respuesta `200`: `{parcela:'negocio:pizzepos-1', escritor:'escritor-pizzepos', existe:true, aislado:true}`.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `409 PARCELA_OCUPADA` | la parcela ya pertenece a otro negocio. |
| `400 INVALID_INPUT` (`project_id`/`negocio_id`/`escritor`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** `single-writer` (M2) — **sube** `single-writer.reclamar.request` por EVENTO.
- **De quién depende por evento:** `onboarding-negocio` (K1, grupo 5) emite
  `contabilidad.negocio_registrado`.
- **Quién la consume:** los custodios multi-negocio operan por parcela sin fuga vía
  `contabilidad.negocio_parcela_creada`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/aislamiento-negocio/module.json` + `index.js`.
2. Smoke: `crear_parcela` → 200 + `contabilidad.negocio_parcela_creada`, `reclamada:true`.
3. Segundo negocio sobre la misma parcela → `409 PARCELA_OCUPADA`.
4. Re-crear la del mismo negocio → idempotente (`ya_era:true`).
5. `parcela`/`escritor` sin parcela → `existe:false`/`escritor:null`.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `AislamientoNegocio extends ModuloHibridoReflejo`; `name = 'aislamiento-negocio'`,
  `version = 'reflejo-0.1.0'`. Store `this._libros` (Map `pid → {esquema, negocios: Map<negocio_id,
  NegocioParcela>}`).
- **PosPersistencia**: `file:'aislamiento-negocio.json'`, `dir:'/contabilidad/aislamiento-negocio'`.
- Proyecciones `_parcela`/`_escritor`/`_crear_parcela` (esta última `async`); handler
  `onNegocioRegistrado`; helper `_negocioId`; lectura `negociosDe(pid)`; tools `toolParcela`/
  `toolEscritor`/`toolCrearParcela`.
