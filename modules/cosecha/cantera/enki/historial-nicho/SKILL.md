---
name: historial-nicho
description: >
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `historial-nicho` de la vertical nichos
  (Radar de Nichos). Registro APPEND-ONLY e inmutable de los estados y decisiones que cada
  nicho ha recorrido en el pipeline: la memoria de auditoría de un nicho. Solo lo escribe
  pipeline-por-nicho (L1), dueño de la máquina de estados (single-writer, guard de rol); toda
  escritura se añade al final sin borrar ni mutar nada. Persiste por proyecto vía
  PosPersistencia. Publica nichos.historial_actualizado y su par de fallo. Úsala para operar,
  depurar o extender el custodio, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites añadir o consultar el historial de estados/decisiones de un nicho
    (RPC nichos.historial.append.request).
  - Cuando depures por qué una entrada se rechaza (PERMISSION_DENIED si el rol no es PIPELINE,
    INVALID_INPUT si falta nicho/estado/project_id).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas de negocio
    (append-only inmutable, single-writer pipeline, guard de rol).
  - Cuando vayas a escribir/ampliar el test unitario del custodio.
tags: [enki, modulo, custodio, persistencia, nichos, radar, historial, auditoria, proyecto-3d]
---

# historial-nicho — CUSTODIO CON PERSISTENCIA de la memoria de auditoría por nicho

## Qué hace el módulo

`historial-nicho` es un **CUSTODIO CON PERSISTENCIA** (L4, hoja del plan): el registro
**APPEND-ONLY e inmutable** de los **ESTADOS y DECISIONES** que cada nicho ha recorrido en el
pipeline. Es la **memoria de auditoría** de un nicho: nadie borra ni muta una entrada una vez
escrita; solo se añade al final.

**SINGLE-WRITER**: el único escritor del historial es el **pipeline-por-nicho (L1)**, el dueño de
la máquina de estados. Cualquier otra escritura se rechaza (**guard de rol** por evento [ABIERTO]);
aquí el pipeline es el escritor declarado. Alimenta **vista-portafolio (K1)** y al propio
**pipeline-por-nicho (L1)**.

Persiste por proyecto con **PosPersistencia** (storage `/prisma/nichos/historial-nicho.json`),
restaura en `project.activated` y vuelca en `onUnload`. Emite `nichos.historial_actualizado` en
éxito y su par de fallo.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.historial.append.request` | `onAppendRequest` | RPC custodio: {project_id, nicho, estado, decision?} → añade una entrada al historial (append-only inmutable, single-writer pipeline). Éxito → publica `nichos.historial_actualizado` y responde por `nichos.historial.append.response`. Fallo (nicho/estado inválidos, escritor no permitido) → `nichos.historial.append.failed`. |
| `project.activated` | `onProjectActivated` | Custodio: restaura el historial del proyecto activado vía PosPersistencia. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.historial_actualizado` | Fire-and-forget (L4): se añadió una entrada al historial de un nicho → {project_id, nicho, entrada, total}. Alimenta vista-portafolio (K1) y el pipeline-por-nicho (L1). |
| `nichos.historial.append.failed` | Par de fallo determinista: la entrada llegó inválida o no pudo añadirse → {status, code, mensaje}. Cierra el círculo de nichos.historial.append.request. |

> **Regla de cierre de círculo**: el par `nichos.historial.append.failed` cierra el círculo de
> `nichos.historial.append.request`. En éxito `onAppendRequest` propaga el fire-and-forget de dominio
> `nichos.historial_actualizado` (con `correlation_id`) además de la `.response`.

> **Nota: no está en module.json pero sí lo implementa index.js** — el RPC **`nichos.historial.consultar.request`**
> (handler `onConsultarRequest`) con su respuesta `nichos.historial.consultar.response` (proyección
> `_consultar`, lectura que no muta). module.json sub-declara este query (solo lista append);
> index.js sí lo escucha y responde. Devuelve el historial de UN nicho o el mapa completo del
> proyecto sin mutar.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_appendUnico` exige `rol === 'PIPELINE'` (constante
   `ROL_PIPELINE`). Si el rol es cualquiera otro → `403 PERMISSION_DENIED` con
   `{ status:403, code:'PERMISSION_DENIED', mensaje:'solo el PIPELINE (dueño de la maquina) puede
   anadir al historial del nicho', rol_esperado:'PIPELINE', rol_recibido:<rol> }` +
   `nichos.historial.append.failed`. Second-writer rechazado.
2. **Append-only inmutable**: cada entrada usa el molde `entradaVacia()` (`esquema
   'nichos-historial-nicho-v1'`) y se hace `lista.push(entrada)`. Una vez escrita, `en_el` (ISO) se
   fija; NO hay borrado ni edición de entradas previas.
3. **`nicho` obligatorio y string → `400 INVALID_INPUT`**: si falta `nicho` o no es string →
   `_invalid('nicho')` + failed.
4. **`estado` obligatorio y string → `400 INVALID_INPUT`**: si falta `estado` o no es string →
   `_invalid('estado')` + failed.
5. **`project_id` obligatorio → `400 INVALID_INPUT`**: si falta → `_invalid('project_id')` en
   `_appendUnico` y `_consultar` + failed.
6. **Campos opcionales honestos**: `decision` y `evento` (qué disparó la transición) se guardan tal
   cual si vienen, `null` si no — nunca se inventan.
7. **Total de entradas**: la respuesta incluye `total` = longitud de la lista del nicho (cuenta los
   append). Cada append incrementa en 1.
8. **La lectura no muta**: `_consultar` devuelve `200` con el historial de UN nicho (si se pasa
   `nicho`) o el **mapa completo** `{historial: {nicho: [entradas...]}}` del proyecto; no modifica
   nada.
9. **HTTP exacto**: éxito `200`; rol no permitido → `403`; campos inválidos → `400`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responden en `nichos.historial.append.response` y
`nichos.historial.consultar.response`:

### 1. `append` — añadir una entrada al historial de un nicho (solo PIPELINE)

```json
{ "project_id": "e57a318a-...", "rol": "PIPELINE", "nicho": "pan-artesano-cordoba", "estado": "VIABLE", "decision": "APROBADO", "evento": "veredicto_viabilidad", "correlation_id": "abc-123" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba", "entrada": { "esquema": "nichos-historial-nicho-v1", "nicho": "pan-artesano-cordoba", "estado": "VIABLE", "decision": "APROBADO", "evento": "veredicto_viabilidad", "en_el": "2026-09-25T10:00:00.000Z" }, "total": 1, "anadido": true }
```
Emite `nichos.historial_actualizado`:
```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba", "entrada": { "esquema": "nichos-historial-nicho-v1", "nicho": "pan-artesano-cordoba", "estado": "VIABLE", "decision": "APROBADO", "evento": "veredicto_viabilidad", "en_el": "2026-09-25T10:00:00.000Z" }, "total": 1, "correlation_id": "abc-123" }
```

### 2. `consultar` — leer el historial (no muta) — **no declarado en module.json**

```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "nicho": "pan-artesano-cordoba", "historial": [ { "esquema": "nichos-historial-nicho-v1", "nicho": "pan-artesano-cordoba", "estado": "VIABLE", "decision": "APROBADO", "evento": "veredicto_viabilidad", "en_el": "2026-09-25T10:00:00.000Z" } ] }
```
Sin `nicho` devuelve el mapa completo: `{ "project_id": "...", "historial": { "pan-artesano-cordoba": [ { "...": "..." } ] } }`.

### Fallo típico

- Rol distinto de PIPELINE → `403` + `nichos.historial.append.failed` (`PERMISSION_DENIED`).
- Falta `project_id`, `nicho` o `estado` → `400` + failed (`INVALID_INPUT`).

## Tests

El test vive en `tests/unit/nichos__historial-nicho.test.js`. Cubre:

- `append` con rol PIPELINE y datos válidos → `200` añade la entrada (append-only), publica
  `nichos.historial_actualizado` + `.response` correlada con `correlation_id`.
- Second append → `total` crece; la primera entrada sigue intacta (inmutable).
- Rol distinto → `403 PERMISSION_DENIED` + `nichos.historial.append.failed`.
- Falta `nicho`/`estado`/`project_id` → `400 INVALID_INPUT` + failed.
- `consultar` por nicho y por mapa completo → `200` sin mutar.
- `project.activated` restaura el historial del proyecto (PosPersistencia) — formato Map.
- Manifest: subscribes/publishes exactos de la hoja L4.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__historial-nicho.test.js
```

## Notas de implementación

- Clase `HistorialNicho extends ModuloHibridoReflejo`; `name = 'historial-nicho'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._historial` (Map project_id → Map<nicho, Array>).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo: this, file:
  'historial-nicho.json', dir: '/prisma/nichos', snapshot, hidratar })`. `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`. Las escrituras/lecturas con creación
  marcan `marcarDirty(pid)`.
- `onAppendRequest` delega en `_atender(e, 'append', 'nichos.historial.append.response', d => _appendUnico(d))`
  con el fire-and-forget de dominio (`nichos.historial_actualizado` en 200 o
  `nichos.historial.append.failed` si no), propagando `correlation_id`.
- `onConsultarRequest` → `_atender(e, 'consultar', 'nichos.historial.consultar.response', d => _consultar(d))`.
- Proyecciones: `_appendUnico` (custodio single-writer, append-only + guard de rol) y `_consultar`
  (lectura). Helper `entradaVacia()`, constante `ROL_PIPELINE`.
- Tools: `toolAppendUnico` → `_appendUnico`, `toolConsultar` → `_consultar`.
- DEP hacia delante: lo consumen vista-portafolio (K1) y pipeline-por-nicho (L1, único escritor).
