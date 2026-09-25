---
name: reglas-exclusion
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `reglas-exclusion` de la vertical nichos
  (Radar de Nichos). Es la célula que aprende a FILTRAR: recibe los candidatos que
  sondeo-territorio (B1) detectó (señales de demanda), aprende reglas de exclusion de
  las corridas reales (falsos positivos previos + criterio del dueño) y decide si se
  EXCLUYEN o pasan. Úsala para operar, depurar o extender el filtro, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites excluir (o validar) un candidato de nicho contra las reglas de
    exclusión (RPC nichos.reglas.excluir.request).
  - Cuando depures por qué un candidato se excluye (regla aprendida/declarada/umbral de
    señal) o por qué se rechaza un candidato malformed (CANDIDATO_INVALIDO).
  - Cuando quieras entender el patrón híbrido reflejo+fuzzy de aprendizaje de reglas
    (llm.complete.request con fallback reflejo por firmas) y su contrato.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, exclusion, proyecto-3d]
---

# reglas-exclusion — MICRO-AGENTE (fuzzy) que aprende a filtrar

## Qué hace el módulo

`reglas-exclusion` es un **MICRO-AGENTE HÍBRIDO** (B2, aprende a FILTRAR): recibe los
candidatos que `sondeo-territorio` (B1) detectó (las señales de demanda) y decide si se
**EXCLUYEN o pasan**, descartando los falsos positivos que no interesan — por experiencia
previa (corridas reales / falsos positivos del pasado), por criterio del dueño (reglas
explícitas) o por patrones (señal de demanda muy baja).

Tres mitades (patrón real de `normalizacion-semilla` + `sondeo-territorio`):

- **FUZZY** (`_aprenderDeCorridas`): juicio LLM. Un guion-prompt self-contained
  (`GUION_APRENDER_REGLA`) + historial de corridas/falsos positivos → `llm.complete.request`
  → reglas de exclusión. Si el LLM falla, el reflejo por reglas asegura al menos la firma
  de cada falso positivo previo como regla.
- **REFLEJO** (`_aprenderDeCorridasReflejo`): mecánico. Convierte cada falso positivo previo
  en una regla de firma (los campos que lo caracterizaron), respeta las reglas explícitas del
  dueño y marca un umbral mínimo de señal.
- **REFLEJO** (`_aplicar`): mecánico. Cruza el candidato contra las reglas y emite
  `{ excluido:bool, motivo, regla }`.

**NUNCA decide solo sin base**: solo excluye lo que una regla justifica (aprendida, declarada
por el dueño o de umbral de señal); sin reglas, el candidato pasa. Candidato vacío/malformed →
par de fallo honesto. Sin store, sin custodio: entra candidato + historial, sale veredicto.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.reglas.excluir.request` | `onExcluirRequest` | RPC híbrido: {project_id, candidato, historial?, reglas?} → {project_id, candidato, excluido:bool, motivo, regla, reglas:{explicitas, aprendidas, total}}. Aplica/actualiza las reglas de exclusión: la parte fuzzy (`_aprenderDeCorridas` vía llm.complete.request) deriva reglas de las corridas reales; el reflejo determinista reusa la firma de cada falso positivo previo y las reglas explícitas del dueño + umbral de señal. `_aplicar` cruza el candidato contra las reglas → excluido:bool, motivo y regla que lo descartó. Candidato vacío/malformed → error determinista `nichos.reglas.excluir.failed`. Éxito → publica `nichos.candidato.excluido` y responde por `nichos.reglas.excluir.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.candidato.excluido` | Fire-and-forget (B2): la aplicación de reglas de exclusión terminó → {project_id, candidato, excluido:bool, motivo, regla}. Emite qué se descarta y por qué. Lo consumen la cola-candidatos (L2) — que no encola lo excluido — y el pipeline-por-nicho (L1). |
| `nichos.reglas.excluir.failed` | Par de fallo determinista (B2): el candidato llegó vacío o malformed (sin señal identificable del candidato a excluir) → {status, code, mensaje, data}. Cierra el círculo de nichos.reglas.excluir.request. |

> **Regla de cierre de círculo**: el par `nichos.reglas.excluir.failed` cierra el círculo de
> `nichos.reglas.excluir.request`. En éxito siempre se emite `nichos.candidato.excluido` (con
> `excluido: true` o `false` — el veredicto siempre se publica, no solo cuando se excluye).

## Reglas de negocio

1. **NUNCA excluye sin base (honestidad)**: solo se excluye lo que una regla justifica
   (aprendida, declarada por el dueño o umbral de señal). Sin reglas vigenentes, `_aplicar`
   devuelve `excluido: false` con `motivo: 'ninguna regla de exclusion aplica'`.
2. **Candidato obligatorio → `400 CANDIDATO_INVALIDO`**: si `candidato` falta o no es objeto →
   `{ status:400, code:'CANDIDATO_INVALIDO', mensaje:'el candidato a excluir es obligatorio (objeto con producto/audiencia/lugar/senal)' }`
   + `nichos.reglas.excluir.failed`.
3. **Fallback reflejo por firmas (no romper el pipeline)**: si el LLM no deriva reglas
   (`_aprenderDeCorridas` devuelve null), `_aprenderDeCorridasReflejo` construye las reglas:
   (a) las reglas explícitas del dueño primero (`_validarReglas`), (b) una regla de firma por
   cada falso positivo previo (producto/audiencia/lugar a `confianza 0.6`, motivo por defecto
   `'falso positivo previo: mismo <campo>'`), y (c) siempre una regla de umbral de señal con
   `valor: UMBRAL_SENAL_DEFAULT (0.12)` (`confianza 0.8`, motivo
   `'senal de demanda por debajo del umbral minimo (0.12)'`). El dueño siempre manda.
4. **`_aplicar` cruza candidato contra reglas (mecánico)**: normaliza valores a minúsculas y
   compara. Para regla tipo `senal`, excluye si `senal < Number(regla.valor)`. Para `fuente`,
   coincide `campos.fuente === norm(regla.valor)`. Para `producto/audiencia/lugar`, coincide
   `campos[tipo] === norm(regla.valor)`. La primera regla que aplica gana (devuelve su motivo y regla).
5. **La señal del candidato se lee de varios campos**: `senal_de_demanda` (número) →
   `senal` → `Number(senal_de_demanda)`; si no hay señal interpretable → `0`.
6. **Contrato de reglas validado**: `_validarReglas` acepta `tipo` ∈ {producto, audiencia,
   lugar, senal, fuente}, exige un `valor` no vacío, y normaliza `confianza` a `(0,1]`
   (default `0.5`); `motivo` por defecto `excluido por regla de <tipo>`.
7. **Resultado rico**: `_excluir` devuelve también `reglas: { explicitas, aprendidas, total }`
   (conteo), donde `total = veredicto.normReglas`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.reglas.excluir.response`:

### 1. `excluir` — aplicar/actualizar reglas y decidir sobre un candidato

```json
{
  "project_id": "e57a318a-...",
  "candidato": { "producto": "salsa picante", "audiencia": "restaurantes", "senal_de_demanda": 0.9, "fuente": "puerto" },
  "historial": [ { "producto": "impresion 3d barata", "motivo": "margen nulo", "audiencia": "consumidor" } ],
  "reglas": [ { "tipo": "producto", "valor": "impresion 3d barata", "motivo": "regla del dueno", "confianza": 1 } ]
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "candidato": { "producto": "salsa picante", "audiencia": "restaurantes", "senal_de_demanda": 0.9, "fuente": "puerto" },
  "excluido": false,
  "motivo": "ninguna regla de exclusion aplica",
  "regla": null,
  "reglas": { "explicitas": 1, "aprendidas": 4, "total": 4 }
}
```
Emite `nichos.candidato.excluido` con el mismo conjunto.

Si el candidato cae bajo el umbral de señal (`senal_de_demanda: 0.05`), el veredicto sería
`excluido: true`, `motivo: "senal de demanda por debajo del umbral minimo (0.12)"`,
`regla: { tipo: "senal", valor: "0.12" }`.

### Fallo — candidato vacío o malformed

```json
{ "project_id": "e57a318a-...", "candidato": null }
```
Respuesta `400` + `nichos.reglas.excluir.failed`:
```json
{ "status": 400, "code": "CANDIDATO_INVALIDO", "mensaje": "el candidato a excluir es obligatorio (objeto con producto/audiencia/lugar/senal)", "project_id": "e57a318a-..." }
```

## Tests

El test vive en `tests/unit/reglas-exclusion.test.js`. Cubre:

- `excluir` con candidato válido → `200`, emite `nichos.candidato.excluido`; sin reglas que
  apliquen → `excluido: false` (`'ninguna regla de exclusion aplica'`).
- Un candidato que coincide con una regla de firma/umbral → `excluido: true` con motivo y regla.
- Si el LLM falla/incumple contrato → fallback `_aprenderDeCorridasReflejo` (reglas explícitas +
  firmas + umbral de señal).
- `_aplicar` cruza por campo normalizado y por umbral de señal.
- Candidato vacío/malformed → `400 CANDIDATO_INVALIDO` + `nichos.reglas.excluir.failed`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/reglas-exclusion
node tests/unit/reglas-exclusion.test.js
```

## Notas de implementación

- Clase `ReglasExclusion extends ModuloHibridoReflejo`; `name = 'reglas-exclusion'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onExcluirRequest` delega en `_atender(e, 'excluir', 'nichos.reglas.excluir.response', fn)`;
  con `status === 200` publica `nichos.candidato.excluido` (veredicto completo), si no
  `nichos.reglas.excluir.failed`.
- `_aprenderDeCorridas` hace 1 llamada `this._rpc('llm.complete.request', ...)` headless
  (`GUION_APRENDER_REGLA`, `temperature: 0.2`, `timeout_ms: 30000`, tools vacíos) con
  `messages: [{role:'user', content: JSON.stringify({ historial, reglas_explicitas })}]`.
- `_parse` / `_validarReglas` son los guardas de contrato (tolera fences ```json, exige tipo+valor).
- `_aprenderDeCorridasReflejo`/`_aplicar` son proyecciones puras (sin IO), deterministas.
- Constante `UMBRAL_SENAL_DEFAULT = 0.12` (umbral mínimo de señal para interesar).
- DEP hacia delante: lo consumen `cola-candidatos` (L2) y `pipeline-por-nicho` (L1) vía
  `nichos.candidato.excluido`.
