---
name: lote-admision
description: >
  Skill FULL del módulo REFLEJO STATELESS `lote-admision` de la vertical contabilidad
  de Enki (A9, hoja del plan). DESACOPLE del cuello: la admisión no se hace en serie.
  Toma la cola de hechos y la trocea en LOTES de tamaño `paralelismo` (8 por defecto,
  declarable) para que N hechos entren en paralelo y la serie no atasque el embudo.
  Mecánico, CERO juicio: misma entrada → mismos lotes (determinista). Sin estado: no
  persiste. Lo consumen AMBAS puertas (hechos y documentos). Úsala para operar, depurar
  o extender el reflejo, o para entender su contrato de eventos.
when-to-use: >
  - Cuando necesites trocear una cola de hechos en lotes paralelizables
    (RPC contabilidad.lote.despachar.request).
  - Cuando depures por qué no se despacha ningún lote (INVALID_INPUT si falta
    project_id o hechos) o por qué los lotes no salen como esperabas (paralelismo).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y la garantía
    de determinismo (mismas entradas → mismos lotes).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo lote-admision.
tags: [enki, modulo, reflejo, stateless, contabilidad, lote-admision, admision, paralelismo]
---

# lote-admision — REFLEJO del troceo en lotes de la admisión

## Qué hace el módulo

`lote-admision` es un **REFLEJO STATELESS** (A9, hoja del plan): no guarda nada, no
tiene store ni persistencia. Resuelve un problema puramente **mecánico**: el embudo de
admisión no debe hacerse en serie, así que toma la **cola de hechos** y la **trocea en
lotes** de tamaño `paralelismo` (8 por defecto, **declarable** vía payload). Así N hechos
entran en paralelo y la serie no bloquea.

Aquí **el módulo NO ejerce juicio**: mismo `project_id` + misma lista de hechos +
mismo `paralelismo` → **exactamente los mismos lotes**. Esa determinicidad es una
propiedad del dominio (un test puede afirmarla) y la razón de que sea REFLEJO puro y no
micro-agente: no hay ambigüedad que resolver, solo un troceo reproducible.

Lo consumen **AMBAS puertas** (la de hechos y la de documentos): **el lote es el mismo
empujón para las dos**, un único cálculo reutilizado (`_despachar` delega en `_lotear`).

Emite **un `contabilidad.lote_despachado` por cada lote** (fire-and-forget) y su par de
fallo determinista. Sin estado: no hay `project.activated` ni PosPersistencia.

> **NO REUTILIZA**: el paralelismo declarable de la admisión no existe en el inventario.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.lote.despachar.request` | `onDespacharRequest` | RPC reflejo: {project_id, hechos:[Hecho], paralelismo?} → {project_id, paralelismo, lotes:[{lote_id, hechos}], total}. Proyeccion DETERMINISTA (mismas entradas → mismos lotes): trocea la cola en lotes de tamano `paralelismo` (8 por defecto, declarable). Publica un contabilidad.lote_despachado por cada lote y responde por contabilidad.lote.despachar.response; si el payload es invalido → contabilidad.lote.despachar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.lote_despachado` | Fire-and-forget (A9): un lote de hechos quedo despachado para admision en paralelo → {project_id, lote_id, hechos, n, paralelismo}. Un evento por lote. Lo consume la puerta de admision (puerto-evento-vertical / normalizador-hecho) como empujon de N hechos en paralelo. |
| `contabilidad.lote.despachar.failed` | Par de fallo determinista: despachar con payload invalido (sin project_id o sin hechos). Cierra el circulo de contabilidad.lote.despachar.request. |
| `contabilidad.lote_despachado.failed` | Par de fallo del evento de dominio contabilidad.lote_despachado: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.lote.despachar.failed` cierra el círculo de
> `contabilidad.lote.despachar.request` cuando `_despachar` devuelve status ≠ 200.

> Nota: no está en module.json pero sí lo emite index.js en `onDespacharRequest` — el
> par de fallo `contabilidad.lote.despachar.failed` se publica dentro del handler cuando
> `res.status !== 200`, además de la response de `_atender`.

## Reglas de negocio

1. **Determinismo (CERO juicio)**: `_lotear` es una función mecánica. Mismas entradas →
   mismos lotes. No hay heurística, ni aleatoriedad, ni ambigüedad: por eso es REFLEJO.
2. **Validaciones de payload deterministas**: falta `project_id` → `400 INVALID_INPUT
   project_id`; `hechos` no es array → `400 INVALID_INPUT hechos`. Shape
   `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
3. **`paralelismo` es declarable con default 8**: `Number(input.paralelismo)`; si es
   finito y `> 0` se usa `Math.floor(p)`; en cualquier otro caso cae al default
   `PARALELISMO_DEFECTO = 8`. **La ley entra como DATO**: el paralelismo no está
   cableado como único valor.
4. **Troceo por bloques contiguos**: se itera de `i = 0` a `hechos.length` en pasos de
   `paralelismo` y se hace `slice(i, i + paralelismo)`. Los lotes conservan el ORDEN de
   entrada; el último puede ser más corto.
5. **`lote_id` determinista por proyecto**: `` `${pid}-lote-${n}` `` con `n` = índice del
   lote (1-based). Reproducible para el mismo project_id y mismo troceo.
6. **Un evento por lote**: por cada lote despachado se publica
   `contabilidad.lote_despachado` con `{ project_id, lote_id, hechos, n, paralelismo, correlation_id }`.
   Si `hechos` está vacío, `lotes = []` y no se emite ningún evento de dominio (pero la
   response sigue siendo `200`).
7. **La misma proyección sirve a AMBAS puertas**: `_despachar` **es** `_lotear` (mismo
   cálculo). No hay dos caminos de troceo: el lote es el mismo empujón para hechos y
   documentos.
8. **HTTP exacto**: éxito `200`; payload inválido → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

La RPC responde en `contabilidad.lote.despachar.response`.

### `despachar` — trocear la cola en lotes paralelizables

```json
{
  "project_id": "e57a318a-...",
  "hechos": [
    { "id": "C-1" }, { "id": "C-2" }, { "id": "C-3" }, { "id": "C-4" },
    { "id": "C-5" }, { "id": "C-6" }, { "id": "C-7" }, { "id": "C-8" },
    { "id": "C-9" }, { "id": "C-10" }
  ],
  "paralelismo": 4,
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "paralelismo": 4,
  "lotes": [
    { "lote_id": "e57a318a-...-lote-1", "hechos": [ { "id": "C-1" }, { "id": "C-2" }, { "id": "C-3" }, { "id": "C-4" } ] },
    { "lote_id": "e57a318a-...-lote-2", "hechos": [ { "id": "C-5" }, { "id": "C-6" }, { "id": "C-7" }, { "id": "C-8" } ] },
    { "lote_id": "e57a318a-...-lote-3", "hechos": [ { "id": "C-9" }, { "id": "C-10" } ] }
  ],
  "total": 10
}
```
Emite **un** `contabilidad.lote_despachado` por lote, p. ej. para el primero:
```json
{ "project_id": "e57a318a-...", "lote_id": "e57a318a-...-lote-1", "hechos": [ { "id": "C-1" }, { "id": "C-2" }, { "id": "C-3" }, { "id": "C-4" } ], "n": 4, "paralelismo": 4, "correlation_id": "abc-123" }
```

### Fallo — payload inválido

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `contabilidad.lote.despachar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "hechos requerido", "details": { "field": "hechos" } } }
```

## Tests

El test vive en `tests/unit/lote-admision.test.js`. Cubre:

- `despachar` con 10 hechos y `paralelismo:4` → `200`, 3 lotes `[4,4,2]` con `lote_id`
  deterministas, y emite **un** `contabilidad.lote_despachado` por lote.
- **Determinismo**: la misma entrada produce exactamente los mismos lotes (afirmable).
- `paralelismo` ausente o inválido → se usa el default 8.
- `despachar` sin `project_id` o con `hechos` no-array → `400 INVALID_INPUT` +
  `contabilidad.lote.despachar.failed`.
- `hechos` vacío → `200 {lotes:[], total:0}` sin eventos de dominio.
- `_despachar` y `_lotear` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/lote-admision
node --test tests/unit/lote-admision.test.js
```

## Notas de implementación

- Clase `LoteAdmision extends ModuloHibridoReflejo`; `name = 'lote-admision'`,
  `version = 'reflejo-0.1.0'`. **REFLEJO stateless**: sin `this._store`, sin
  PosPersistencia, sin `project.activated`. `onUnload` solo delega en `super.onUnload()`.
- `onDespacharRequest` delega en `_atender(e, 'despachar',
  'contabilidad.lote.despachar.response', fn)`; el bucle de publicación de un
  `contabilidad.lote_despachado` por lote (o el par determinista en fallo) vive dentro
  de la proyección, propagando `correlation_id`.
- Proyecciones puras: `_lotear` (el cálculo) y `_despachar` (alias que delega en
  `_lotear`). `_invalid`/`_errorResponse` vienen de `modulo-hibrido-reflejo`.
- Tools: `toolLotear` → `_lotear`, `toolDespachar` → `_despachar`.
- DEP hacia delante: lo consume la puerta de admisión (`puerto-evento-vertical` /
  `normalizador-hecho`) como empujón de N hechos en paralelo.
