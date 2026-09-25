---
name: batch-validacion
description: >
  Skill FULL del módulo REFLEJO `batch-validacion` (C5) de la vertical nichos (Radar de Nichos).
  DESACOPLA el cuello de botella del sistema (el embudo de validación C): dado N candidatos de la
  cola (cola-candidatos L2), los REPARTE/PROCESA en un LOTE en PARALELO — no en serie —, corre
  estudio-demanda (C1) + veredicto-viabilidad (C3) por RPC por ítem y agrega la List<Veredicto>.
  Stateless, proyección pura determinista. Úsala para operar, depurar o extender el lote de
  validación, o para entender su contrato de eventos y reglas de negocio.
when-to-use: >
  - Cuando necesites programar/ejecutar un lote de candidatos en paralelo (RPC nichos.batch.programar.request).
  - Cuando depures por qué un lote falló (lote vacío → 400 LOTE_VACIO) o por qué un candidato quedó
    con status 'fallido' en el veredicto (ESTUDIO/VEREDICTO_NO_DISPONIBLE, ERROR_BATCH).
  - Cuando entiendas el patrón REFLEJO stateless que coordina RPCs de otros módulos (el batch NO
    decide por sí mismo: solo organiza y reparte en paralelo).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo.
tags: [enki, modulo, reflejo, nichos, radar, embudo, validacion, batch, paralelismo, proyecto-3d]
---

# batch-validacion — REFLEJO stateless (C5) del EMBUDO de validación del Radar

## Qué hace el módulo

`batch-validacion` **desacopla el cuello de botella** del sistema (el embudo de validación C):
dado **N candidatos de la cola** (`cola-candidatos` L2), los **REPARTE/PROCESA en un LOTE en
PARALELO** — no en serie. Cada candidato del lote pasa por `estudio-demanda` (C1,
`nichos.estudio.medir.request`) y `veredicto-viabilidad` (C3, `nichos.veredicto.evaluar.request`)
por RPC, y el batch agrega la **List<Veredicto>**.

Es un **REFLEJO puro y determinista en la ORGANIZACIÓN del lote** (`_programar`, `_repartir`),
aunque el **juicio de cada candidato lo delega por RPC a los micro-agentes C1/C3** — el batch
NO decide por sí mismo: **solo coordina**. Stateless: sin estado, sin custodio, cada op es
función pura de su entrada.

Proyecciones:

- `_programar(lote)` → `loteEnEjecucion` (id, items, programado_at).
- `_repartir(items, n)` → N grupos paralelos del lote (distribución justa, round-robin).
- `_ejecutarEnParalelo(lote)` → List<Veredicto> (un RPC estudio.medir + veredicto.evaluar por ítem,
  resueltos en paralelo con `Promise.all`).

Cierra su círculo: si el lote viene vacío o un ítem malformado, responde honesto y publica
`nichos.batch.programar.failed`. Sin store, sin custodio: entra lote, sale List<Veredicto>.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.batch.programar.request` | `onProgramarRequest` | RPC reflejo: {project_id, lote:[candidato], criterio?, paralelismo?:int} → {batch_id, lote_en_ejecucion, veredictos, fallidos, total, ejecutado}. Programa el lote EnEjecucion (reparte ítems en N grupos paralelos con distribución justa) y ejecuta la cadena estudio-demanda (C1) + veredicto-viabilidad (C3) por ítem en paralelo (Promise.all), agregando la List<Veredicto>. Fallos por ítem se marcan sin romper el lote. Lote vacío → error determinista nichos.batch.programar.failed. Éxito → publica nichos.batch.lote_ejecutado y responde por nichos.batch.programar.response. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.batch.lote_ejecutado` | Fire-and-forget (C5): un lote de validación quedó ejecutado en paralelo → {project_id, batch_id, lote_en_ejecucion, veredictos, fallidos, total, ejecutado}. Lo consume el pipeline-por-nicho (L1) y los siguientes pasos del embudo (C6 corte-temprano). |
| `nichos.batch.programar.failed` | Par de fallo determinista (C5): el lote llegó vacío o no es un array → {status, code, mensaje, data}. Cierra el círculo de nichos.batch.programar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico. Aquí el único par
> posible es `nichos.batch.programar.failed` (lote vacío o no array).

> **Nota: `project.activated` NO está en module.json ni como handler** en index.js — este reflejo
> es stateless y no se subscribe a él (aunque conserva `project_id`).

> **Nota: no está en module.json pero sí lo emiten las RPCs que coordina en `_validarItem` (líneas 117-129)**:
> el batch hace RPCs externas `nichos.estudio.medir.request` (C1) y `nichos.veredicto.evaluar.request`
> (C3) por cada candidato, con `timeout_ms: 20000`, `.catch(() => null)`. Son LECTURAS/coordinación
> de otros módulos, no subscribes propios. Cada fallo por ítem se marca con un `codigo`
> (`ESTUDIO_NO_DISPONIBLE`, `VEREDICTO_NO_DISPONIBLE` o `ERROR_BATCH`) sin romper el lote.

## Reglas de negocio

1. **Lote vacío o no-array → `400 LOTE_VACIO`** + `nichos.batch.programar.failed` con
   `{ status:400, code:'LOTE_VACIO', mensaje:'el lote de candidatos a validar esta vacio', project_id }`.
2. **Paralelismo declarado**: `n = Number(paralelismo)`; si `n` es entero `> 0` → `n`, si no → `3`
   (default). `_repartir` hace round-robin (`grupos[i % n].push(item)`) y filtra grupos vacíos
   (distribución justa).
3. **El batch NO decide**: el juicio de cada candidato lo delega por RPC a C1 (estudio) y C3
   (veredicto). Solo organiza el lote y agrega la List<Veredicto>.
4. **Fallos por ítem NO rompen el lote**: `_validarItem` envuelve cada RPC en try/catch. Si el
   estudio 0 el veredicto no es `200` → `{ status:'fallido', candidato, codigo }` (codigo del
   `error.code` o `'ESTUDIO_NO_DISPONIBLE'`/`'VEREDICTO_NO_DISPONIBLE'`); excepción inesperada →
   `{ status:'fallido', candidato, codigo:'ERROR_BATCH' }`. Los fallidos se cuentan en `fallidos`
   y los exitosos van en `veredictos`.
5. **Salida estructurada**: `data = { project_id, batch_id, lote_en_ejecucion, veredictos
   (solo status==='exito'), fallidos, total, ejecutado:true }`. `batch_id = \`${project_id}-${Date.now()}\``.
6. **Item candidato**: en `_validarGrupo`, `candidato = typeof item === 'object' ? (item.candidato || item)
   : { nombre: item }` — tolera objetos planos y strings.
7. **Sin estado (reflejo stateless)**: `project_id` del request tiene preferencia sobre el de
   contexto; no hay PosPersistencia ni store.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.batch.programar.response`:

### 1. `programar` — programar y ejecutar un lote en paralelo

```json
{
  "project_id": "e57a318a-...",
  "lote": [
    { "nombre": "salsa picante artesanal", "audiencia": "restaurantes" },
    { "nombre": "aceite trufado premium", "audiencia": "gourmet" }
  ],
  "criterio": { "umbral_ingresos": 150 },
  "paralelismo": 2
}
```
Respuesta `200` + publica `nichos.batch.lote_ejecutado`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "batch_id": "e57a318a-...-1758800000000",
    "lote_en_ejecucion": {
      "batch_id": "e57a318a-...-1758800000000",
      "project_id": "e57a318a-...",
      "items": 2,
      "paralelismo": 2,
      "grupos": [
        [ { "nombre": "salsa picante artesanal", "audiencia": "restaurantes" } ],
        [ { "nombre": "aceite trufado premium", "audiencia": "gourmet" } ]
      ],
      "programado_at": "2026-09-25T11:00:00.000Z"
    },
    "veredictos": [
      { "status": "exito", "candidato": { "nombre": "salsa picante artesanal", "audiencia": "restaurantes" }, "veredicto": "VIABLE", "confianza": 0.8, "motivo": "alcanza umbral_ingresos" },
      { "status": "fallido", "candidato": { "nombre": "aceite trufado premium", "audiencia": "gourmet" }, "codigo": "ESTUDIO_NO_DISPONIBLE" }
    ],
    "fallidos": 1,
    "total": 2,
    "ejecutado": true
  }
}
```
(Nota: los `veredictos` incluyen tanto `status:'exito'` como el shape de fallido con `codigo`;
el campo `data.veredictos` filtrado para `status==='exito'` es el agregado de la List<Veredicto>.
Los valores exactos dependen de lo que devuelvan C1/C3.)

### Fallo — lote vacío

```json
{ "project_id": "e57a318a-...", "lote": [] }
```
Respuesta `400` + `nichos.batch.programar.failed`:
```json
{ "status": 400, "code": "LOTE_VACIO", "mensaje": "el lote de candidatos a validar esta vacio", "project_id": "e57a318a-..." }
```

## Tests

El test vive en `tests/unit/batch-validacion.test.js`. Cubre:

- `programar` con lote válido → `200`, arma `lote_en_ejecucion`, procesa en paralelo (Promise.all)
  agregando la List<Veredicto>; emite `nichos.batch.lote_ejecutado`.
- Lote vacío / no-array → `400` + `nichos.batch.programar.failed` (`LOTE_VACIO`).
- Fallos por ítem (estudio o veredicto no `200`, o excepción) se marcan `status:'fallido'` con
  `codigo` sin romper el lote; `fallidos` se cuenta y `veredictos` filtra solo `exito`.
- `_repartir` distribuye equitativamente (round-robin, sin grupos vacíos) para un paralelismo dado.
- `paralelismo` inválido → default 3.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/batch-validacion
node tests/unit/batch-validacion.test.js
```

## Notas de implementación

- Clase `BatchValidacion extends ModuloHibridoReflejo`; `name = 'batch-validacion'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onProgramarRequest` delega en `_atender(e, 'programar', 'nichos.batch.programar.response', fn)`
  y publica el fire-and-forget de dominio (`nichos.batch.lote_ejecutado` si `status===200`, si no
  `nichos.batch.programar.failed`).
- `_programar` orquesta: valida lote → `_repartir` (grupos justos) → `_ejecutarEnParalelo`
  (un RPC C1 + C3 por ítem, `Promise.all`) → cuenta `fallidos`.
- `_ejecutarEnParalelo` mapea cada grupo a una tarea `_validarGrupo`, y `Promise.all(...).flat()`.
- `_validarItem` hace 2 RPCs headless: `nichos.estudio.medir.request` y `nichos.veredicto.evaluar.request`
  (C1 → C3), `timeout_ms: 20000`, `.catch(() => null)`; fallo por ítem → `{ status:'fallido', codigo }`.
- DEP: consume la cola (L2) y los juicios de C1/C3; su salida `nichos.batch.lote_ejecutado` la consumen
  `pipeline-por-nicho` (L1) y `corte-temprano` (C6).
