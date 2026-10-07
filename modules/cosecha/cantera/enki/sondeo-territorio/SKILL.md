---
name: sondeo-territorio
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `sondeo-territorio` de la vertical
  nichos (Radar de Nichos). Es la célula del buscador de nichos: recibe un TERRITORIO
  normalizado (las intenciones de búsqueda desambiguadas por normalizacion-semilla A2)
  y lo barre preguntando a las fuentes vía puerto-fuente-datos (J1), interpreta los
  resultados (juicio fuzzy) y deja señales de demanda y candidatos de nichos. Úsala
  para operar, depurar o extender la célula, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites sondear un territorio a candidatos de nicho (RPC nichos.territorio.sondear.request).
  - Cuando depures por qué un territorio vacío u sin demanda no se sondea
    (TERRITORIO_INVALIDO / FUENTES_SIN_DATOS / SIN_DEMANDA), o cuándo cae al fallback reflejo.
  - Cuando quieras entender el patrón híbrido reflejo+fuzzy de la búsqueda (barrer fuentes
    vía puerto-fuente-datos + interpretar demanda vía llm.complete.request) y su contrato.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, sondeo, proyecto-3d]
---

# sondeo-territorio — MICRO-AGENTE (fuzzy) de la célula del buscador

## Qué hace el módulo

`sondeo-territorio` es un **MICRO-AGENTE HÍBRIDO** (B1, demanda-primero): la célula del
buscador de nichos. Recibe el **TERRITORIO normalizado** (las intenciones de búsqueda ya
desambiguadas por `normalizacion-semilla`, p. ej. `{producto:'salsa picante', audiencia:'restaurantes'}`)
y lo **BARRE** preguntando a las fuentes vía `puerto-fuente-datos` (J1), con el rate gobernado
por `gestion-limites-fuente` (J3). Del dataset crudo que devuelven las fuentes extrae
**señales y candidatos de nichos** — interpreta resultados y deja señales de demanda.

Tres mitades (patrón real de `normalizacion-semilla` + `prisma/formulador`):

- **REFLEJO** (`_barrerFuentes` + `_parsearDataset`): mecánico. Pide a cada fuente los datos
  del territorio vía `nichos.fuente.consultar.request` y parsea el dataset crudo en registros/trozos limpios.
- **FUZZY** (`_juzgarTerritorio`): juicio LLM. Un guion-prompt self-contained (`GUION_JUZGAR_TERRITORIO`)
  + el barrido normalizado → `llm.complete.request` → `List<Candidato>` con `senal_de_demanda`.
  Si el LLM falla, el reflejo por heurística (`_heuristicaSenalReflejo`) asegura al menos el
  candidato derivado del territorio, **sin inventar demanda**.
- **REFLEJO** (`_proponerSiguientes`): ordena/prioriza los candidatos (por señal desc) para
  quien los consuma (`reglas-exclusion` B2).

**NUNCA inventa**: no fabrica un candidato que las fuentes no apoyen; si no hay nada
interpretable o el territorio viene vacío → par de fallo honesto. Sin store, sin custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.territorio.sondear.request` | `onSondearRequest` | RPC híbrido: {project_id, territorio, fuentes?} → {territorio, barrido:[{fuente, registros\|error}], candidatos:[{producto, audiencia, lugar, senal, fuente}], sondeado}. Barre las fuentes vía `nichos.fuente.consultar.request`, parsea el dataset (reflejo) e interpreta la demanda (fuzzy `llm.complete.request` con fallback reflejo por heurística). Territorio vacío → error determinista `nichos.territorio.sondear.failed`. Éxito → publica `nichos.territorio.sondeado` (+ `nichos.candidato.encontrado` por candidato) y responde por `nichos.territorio.sondear.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.territorio.sondeado` | Fire-and-forget (B1): el barrido del territorio terminó → {project_id, territorio, total_fuentes, total_registros, total_candidatos, fuentes}. Resumen para el pipeline-por-nicho (L1) y propuesta-valor-canal (I2). |
| `nichos.candidato.encontrado` | Fire-and-forget (B1): un candidato de nicho fue detectado en el territorio → {project_id, candidato:{producto, audiencia, lugar, senal_de_demanda, fuente}}. Lo consumen reglas-exclusion (B2) y la cola-candidatos (L2). |
| `nichos.territorio.sondear.failed` | Par de fallo determinista (B1): el territorio llegó vacío, las fuentes no devolvieron nada interpretable o el juicio no encontró demanda → {status, code, mensaje, data}. Cierra el círculo de nichos.territorio.sondear.request. |

> **Regla de cierre de círculo**: el par `nichos.territorio.sondear.failed` cierra el círculo
> de `nichos.territorio.sondear.request`. En éxito se emiten `nichos.territorio.sondeado` (resumen)
> **más un `nichos.candidato.encontrado` POR CADA candidato** (fire-and-forget de dominio).

> **Nota: los eventos de dominio que emite index.js en `onSondearRequest` (nichos.territorio.sondeado,
> nichos.candidato.encontrado, nichos.territorio.sondear.failed) coinciden exactamente con los
> publicados en module.json** — no hay sub-declaración en este módulo.

## Reglas de negocio

1. **NUNCA inventar demanda (honestidad)**: `_juzgarTerritorio` interpreta SOLO lo que las
   fuentes devolvieron. `_validarCandidatos` pone `senal_de_demanda: 0` cuando no hay señal y
   **descarta** el candidato (`if (senal <= 0) return null`). También descarta candidatos sin
   ninguna señal de producto/audiencia/lugar.
2. **Territorio obligatorio → `400 TERRITORIO_INVALIDO`**: si `territorio` falta o no es objeto →
   `{ status:400, code:'TERRITORIO_INVALIDO', mensaje:'el territorio es obligatorio para sondear (intencion de busqueda normalizada)' }`
   + `nichos.territorio.sondear.failed`.
3. **Fuentes sin datos → `422 FUENTES_SIN_DATOS`**: si `_barrerFuentes` suma 0 registros →
   `{ status:422, code:'FUENTES_SIN_DATOS', mensaje:'ninguna fuente devolvio datos interpretables del territorio' }`
   + failed. No inventa barrido.
4. **Sin demanda interpretable → `422 SIN_DEMANDA`**: si ni el juicio fuzzy ni el fallback
   reflejo producen candidatos → `{ status:422, code:'SIN_DEMANDA', mensaje:'el juicio no encontro senales de demanda en el barrido del territorio' }` + failed.
5. **Fallback reflejo por heurística (no romper el pipeline)**: si el LLM no devuelve
   candidatos, `_heuristicaSenalReflejo` deriva un solo candidato DEL PROPIO TERRITORIO con
   `senal_de_demanda = min(0.6, 0.3 + 0.1 * soporte)` (donde `soporte` = número de fuentes con
   registros) y `fuente: 'puerto'`. Exige soporte > 0 y producto presente; si no → null.
6. **Barrido vía RPC al puerto (J1)**: `_barrerFuentes` llama `nichos.fuente.consultar.request`
   por fuente (`timeout_ms: 15000`, `.catch(() => null)`); si `resp.status === 200` parsea
   `resp.data.dataset/resultados/raw/data`, si no registra `{fuente, registros:[], error}`.
   El término de búsqueda es `producto || servicio || audiencia`.
7. **Priorización por señal**: `_proponerSiguientes` ordena los candidatos por
   `senal_de_demanda` desc (la señal más fuerte primero) para quien los consuma.
8. **Sin estado**: `project_id` del request tiene preferencia sobre el de contexto; no hay
   store ni PosPersistencia (stateless).

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.territorio.sondear.response`:

### 1. `sondear` — barrer un territorio y dejar señales/candidatos

```json
{
  "project_id": "e57a318a-...",
  "territorio": { "producto": "salsa picante", "audiencia": "restaurantes" },
  "fuentes": null
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "territorio": { "producto": "salsa picante", "audiencia": "restaurantes" },
  "barrido": [ { "fuente": "puerto", "registros": [ { "texto": "..." } ] } ],
  "candidatos": [
    { "producto": "salsa picante", "audiencia": "restaurantes", "lugar": null, "senal_de_demanda": 0.9, "fuente": "puerto" }
  ],
  "sondeado": true
}
```
Emite `nichos.territorio.sondeado` (resumen) y un `nichos.candidato.encontrado` por cada candidato:
```json
{ "project_id": "e57a318a-...", "candidato": { "producto": "salsa picante", "audiencia": "restaurantes", "lugar": null, "senal_de_demanda": 0.9, "fuente": "puerto" } }
```

### Fallos típicos

- Territorio vacío → `400` + `nichos.territorio.sondear.failed` (`TERRITORIO_INVALIDO`).
- Ninguna fuente con datos → `422` + failed (`FUENTES_SIN_DATOS`).
- Juicio sin candidatos ni fallback → `422` + failed (`SIN_DEMANDA`).

## Tests

El test vive en `tests/unit/sondeo-territorio.test.js`. Cubre:

- `sondear` con territorio → `200`, barre vía `nichos.fuente.consultar.request`, parsea el
  dataset crudo, emite `nichos.territorio.sondeado` + un `nichos.candidato.encontrado` por candidato.
- Territorio vacío → `400 TERRITORIO_INVALIDO` + failed.
- Fuentes sin datos → `422 FUENTES_SIN_DATOS` + failed.
- Si el LLM falla/incumple contrato → fallback `_heuristicaSenalReflejo` (≥1 candidato derivado del territorio).
- Ni LLM ni heurística → `422 SIN_DEMANDA` + failed.
- `_proponerSiguientes` ordena por señal desc.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/sondeo-territorio
node tests/unit/sondeo-territorio.test.js
```

## Notas de implementación

- Clase `SondeoTerritorio extends ModuloHibridoReflejo`; `name = 'sondeo-territorio'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onSondearRequest` delega en `_atender(e, 'sondear', 'nichos.territorio.sondear.response', fn)`;
  con `status === 200` publica `nichos.territorio.sondeado` y un `nichos.candidato.encontrado` por
  candidato; si no, `nichos.territorio.sondear.failed`.
- `_barrerFuentes` hace una RPC `nichos.fuente.consultar.request` por fuente (o `[null]` → la fuente
  activa) con `timeout_ms: 15000` y `.catch(() => null)`.
- `_juzgarTerritorio` hace 1 llamada `this._rpc('llm.complete.request', ...)` headless
  (`GUION_JUZGAR_TERRITORIO`, `temperature: 0.2`, `timeout_ms: 30000`, tools vacíos).
- `_parsearDataset` normaliza dataset array|string|objeto en una lista plana de registros (trozos).
- `_validarCandidatos` / `_parse` son los guardas de contrato (tolera fences ```json, descarta sin señal).
- DEP hacia delante: los consumen `reglas-exclusion` (B2), `cola-candidatos` (L2) y
  `pipeline-por-nicho` (L1); consulta `puerto-fuente-datos` (J1).
