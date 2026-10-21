---
name: single-writer
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `single-writer` de la vertical contabilidad
  (Enki). LA LEY que gobierna cada Custodio: UN SOLO ESCRITOR por parcela; el segundo escritor se
  RECHAZA (409 SEGUNDO_ESCRITOR) porque dos escritores sobre la misma parcela = corrupción. Una
  de las 3 piezas anti-bucle del dominio. `reclamar` (ORDEN, panel) concede la parcela libre a un
  escritor y ANUNCIA contabilidad.parcela_reclamada; el mismo escritor re-reclamando es
  idempotente; otro escritor no la roba. `es_escritor` (PREGUNTA, por el bus) deriva si un
  escritor tiene la parcela. La parcela no se libera sola. Persiste por proyecto.
when-to-use: >-
  - Cuando un custodio necesite reclamar su parcela antes de escribir, o consultar si sigue
    siendo el escritor (RPC single-writer.reclamar.request / .es_escritor.request).
  - Cuando depures un 409 SEGUNDO_ESCRITOR (otro escritor tiene la parcela) o 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.parcela_reclamada.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, libro, anti-bucle, single-writer, parcela]
---

# single-writer — CUSTODIO de la ley de un solo escritor por parcela

## Qué hace el módulo

`single-writer` es un **CUSTODIO CON PERSISTENCIA** (M2, hoja del plan). Es **una de las 3
piezas anti-bucle del dominio. LA LEY DE ESCRITURA.**

La LEY que gobierna cada Custodio: **UN SOLO ESCRITOR por parcela**. El segundo escritor **NO
espera ni hace cola — se RECHAZA**: dos escritores sobre la misma parcela = corrupción. Cada
custodia (el libro, la traza, el cierre, la firma, el expediente…) **RECLAMA** su parcela aquí
antes de escribir, y pregunta `es_escritor` para saber si sigue siéndolo.

- **`reclamar`** — pide la parcela para un escritor. Libre → se concede y se ANUNCIA el hecho
  `contabilidad.parcela_reclamada`. Ya del mismo escritor → idempotente. De OTRO escritor →
  `409 SEGUNDO_ESCRITOR` (no se roba la parcela).
- **`es_escritor`** — PREGUNTA: ¿este escritor es quien tiene la parcela? Deriva, no muta.

**Invariante**: dato ausente = desconocido. Sin parcela o sin escritor NO se concede nada (no se
inventa un titular). **La parcela NO se libera sola**: su titular sigue siéndolo. `reclamar` es
**ORDEN** (panel); `es_escritor` es **PREGUNTA** (bus).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `single-writer.reclamar.request` | `onReclamarRequest` | RPC custodio (**ORDEN**, panel): `{project_id, parcela, escritor}` → `{project_id, parcela, escritor, reclamada, ya_era, unico_escritor, reclamada_en}`. Concede la parcela libre; el mismo escritor → idempotente; otro escritor → 409 `SEGUNDO_ESCRITOR`. Publica `contabilidad.parcela_reclamada`. Responde por `.reclamar.response`. |
| `single-writer.es_escritor.request` | `onEsEscritorRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, parcela, escritor}` → `{project_id, parcela, escritor, es_escritor, titular, libre, reclamada_en, abierto}`. Deriva si un escritor tiene la parcela; no muta. Responde por `.es_escritor.response`. |
| `project.activated` | `onProjectActivated` | Restaura la ley de escritura (parcelas reclamadas) del proyecto activado desde el storage. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.parcela_reclamada` | Fire-and-forget (M2): una parcela quedó concedida a un escritor → `{project_id, parcela, escritor, reclamada_en}`. **Solo se publica si `reclamada===true`** (concesión nueva; el re-reclamo idempotente NO). Es la ley que gobierna cada Custodio: un segundo escritor se rechaza. |
| `single-writer.reclamar.response` | Respuesta RPC correlada de la op `reclamar`. |
| `single-writer.reclamar.failed` | Fallo determinista: falta campo o la parcela ya tiene otro titular (409). |
| `single-writer.es_escritor.response` | Respuesta RPC correlada de la op `es_escritor`. |
| `single-writer.es_escritor.failed` | Fallo determinista: falta `project_id`/`parcela`/`escritor`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `reclamar` | **ORDEN** (panel) | `{project_id, parcela\|parcela_id, escritor\|modulo\|rol}` | `{project_id, parcela, escritor, reclamada, ya_era, unico_escritor, reclamada_en, total_parcelas?}` | 409 `SEGUNDO_ESCRITOR`; 400 `INVALID_INPUT` |
| `es_escritor` | **PREGUNTA** (bus) | `{project_id, parcela, escritor}` | `{project_id, parcela, escritor, es_escritor, titular, libre, reclamada_en, abierto}` | 400 `INVALID_INPUT` |

## Reglas de negocio (lo que el código IMPONE)

1. **Validación**: sin `project_id` → `_invalid('project_id')`; sin `parcela`/`parcela_id` →
   `_invalid('parcela')`; sin `escritor` (ni `modulo`/`rol`) → `_invalid('escritor')`.
2. **Parcela con titular**: si `titular.escritor === escritor` → 200 idempotente
   (`reclamada:false, ya_era:true, unico_escritor:true`); si es **otro** → `409 SEGUNDO_ESCRITOR`
   con `{project_id, parcela, titular, pretendiente, reclamada_en}`.
3. **Parcela libre**: se concede (`{parcela, escritor, reclamada_en}`), `reclamada:true,
   ya_era:false, unico_escritor:true, total_parcelas`. El libro solo crece.
4. **`es_escritor`**: `es_escritor = Boolean(titular && titular.escritor === escritor)`;
   `titular` (o `null`); `libre = titular === null`; sin titular → `abierto.parcela` declarado.
   **No muta.**
5. **Normalización**: `parcela`/`escritor` se hacen `trim`. Lecturas directas `titularDe(pid,
   parcela)` y `parcelasDe(pid)`.

## Cómo se usa (RPCs)

### 1. Reclamar una parcela

```json
{ "project_id": "e57a318a-...", "parcela": "libro-diario", "escritor": "escritor-diario", "correlation_id": "abc-8" }
```
Respuesta `200` + `contabilidad.parcela_reclamada`:
```json
{ "project_id": "e57a318a-...", "parcela": "libro-diario", "escritor": "escritor-diario", "reclamada": true, "ya_era": false, "unico_escritor": true, "reclamada_en": "2026-10-01T...", "total_parcelas": 1 }
```

### 2. Segundo escritor → rechazado

```json
{ "project_id": "e57a318a-...", "parcela": "libro-diario", "escritor": "otro" }
```
Respuesta `409` + `single-writer.reclamar.failed`:
```json
{ "status": 409, "code": "SEGUNDO_ESCRITOR", "mensaje": "la parcela ya tiene un escritor: un segundo escritor sobre la misma parcela es corrupcion", "data": { "project_id": "e57a318a-...", "parcela": "libro-diario", "titular": "escritor-diario", "pretendiente": "otro", "reclamada_en": "2026-10-01T..." } }
```

### 3. ¿Sigo siendo el escritor?

```json
{ "project_id": "e57a318a-...", "parcela": "libro-diario", "escritor": "escritor-diario" }
```
Respuesta `200`: `{es_escritor:true, titular:'escritor-diario', libre:false, abierto:{parcela:null}}`.

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `409 SEGUNDO_ESCRITOR` | la parcela ya tiene OTRO titular. |
| `400 INVALID_INPUT` (`project_id`/`parcela`/`escritor`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` +
  `_shared/pos-persistencia` + `filesystem` + `project-manager`.
- **De quién depende:** ninguno. Es la ley transversal.
- **Quién la usa:** TODOS los custodios del dominio reclaman aquí su parcela antes de escribir y
  consultan `es_escritor`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/single-writer/module.json` + `index.js`.
2. Smoke: `reclamar` parcela libre → 200 + `contabilidad.parcela_reclamada`.
3. Mismo escritor re-reclama → `ya_era:true` sin publicar hecho.
4. Otro escritor → `409 SEGUNDO_ESCRITOR` + `.reclamar.failed`.
5. `es_escritor` → deriva sin mutar.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `SingleWriter extends ModuloHibridoReflejo`; `name = 'single-writer'`,
  `version = 'reflejo-0.1.0'`. Store `this._libros` (Map `pid → {esquema, parcelas:
  Map<parcela, {escritor, reclamada_en}>}`).
- **PosPersistencia**: `file:'single-writer.json'`, `dir:'/contabilidad/single-writer'`.
- Proyecciones `_reclamar`/`_es_escritor`; lecturas `titularDe`/`parcelasDe`; tools
  `toolReclamar`/`toolEsEscritor`. `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
