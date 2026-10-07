---
name: camino-encontrar-construir
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `camino-encontrar-construir` (C4) de la vertical
  nichos (Radar de Nichos). Decide por OPCIÓN de nicho si la oportunidad se ENCUENTRA o se
  CONSTRUYE: ENCONTRAR si hay demanda real + capacidades existentes; CONSTRUIR si falta capacidad
  (invariante D3) o hay que crear la demanda; PUENTE (riesgo alto) SUBE una SolicitudDecision y
  NUNCA decide solo. Úsala para operar, depurar o extender el decisor de camino, o para entender su
  contrato de eventos y reglas de negocio (riesgo alto → no decide).
when-to-use: >
  - Cuando necesites decidir si una oportunidad se encuentra o se construye (RPC nichos.camino.decidir.request).
  - Cuando depures por qué un camino es PUENTE (riesgo alto / falta de datos), o por qué se emitió
    una SolicitudDecision (riesgo_alto true), o por qué cae al fallback reflejo.
  - Cuando entiendas el patrón híbrido reflexivo+fuzzy del eslabón de construcción y la REGLA de
    que un camino de alto riesgo NUNCA lo decide el sistema solo (sube a D2/K2).
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, construccion, camino, riesgo, proyecto-3d]
---

# camino-encontrar-construir — MICRO-AGENTE (fuzzy) de la CONSTRUCCIÓN del Radar (C4)

## Qué hace el módulo

`camino-encontrar-construir` decide, **para cada OPCION de nicho**, si la oportunidad se
ENCUENTRA o se CONSTRUYE:

- **`ENCONTRAR`** — hay demanda real (veredicto `VIABLE` / demanda de 1er orden suficiente) y la
  solución se sirve con las **CAPACIDADES EXISTENTES** del proyecto (`catalogo-capacidades` D3):
  no hay que crear nada, se aprovecha.
- **`CONSTRUIR`** — la necesidad no existe todavía o **falta CAPACIDAD** para materializarla
  (invariante D3 "lo que falta se crea"): hay que construir la solución.
- **`PUENTE`** — el riesgo declarado es ALTO o no hay datos para decidir con honestidad: en vez
  de decidir solo, **SUBE una SolicitudDecision** (D2/K2) y **no decide por cuenta propia**
  (REGLA del sistema, ver 5.3 — decisión humana).

Entra con `{ project_id, nicho, veredicto?, estudio?, capacidades?, riesgo? }`:

- `veredicto`: el de `veredicto-viabilidad` (C3, VIABLE|NO_VIABLE|PUENTE), si ya se emitió.
- `capacidades`: la respuesta de `catalogo-capacidades` (D3, disponibles/faltantes), si se consultó.
- `riesgo`: 0-1 declarado por el dueño/ensamblador (riesgo alto → sube decisión).

Dos mitades (patrón real de `veredicto-viabilidad` + `estudio-demanda`):

- **REFLEJO** (`_decidirReflejo`): determinista. De veredicto + capacidades deriva el **camino base**
  por reglas (no inventa: solo usa lo que llega).
- **FUZZY** (`_concluir`): una llamada headless a `llm.complete.request` con guion-prompt
  self-contained (`GUION_CAMINO`) → **camino asistido en JSON tipado** (camino, riesgo, motivo).
  Si falla, el reflejo asegura el camino.
- **`_subirRiesgo`**: riesgo alto → emite la **SolicitudDecision** (payload a K2/D2), NO decide.

**NUNCA inventa**: sin nicho → falla honesto (`nichos.camino.decidir.failed`); sin datos
suficientes → emite `PUENTE`, no asume. **NUNCA decide solo un camino de alto riesgo: lo SUBE.**
Sin store, sin custodio: entra opción, sale camino decidido.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.camino.decidir.request` | `onDecidirRequest` | RPC híbrido: {project_id, nicho:{...}, veredicto?:VIABLE\|NO_VIABLE\|PUENTE, estudio?:{demanda_1er_orden}, capacidades?:{capacidades_disponibles, capacidades_faltantes}, riesgo?:0-1} → {nicho, camino:ENCONTRAR\|CONSTRUIR\|PUENTE, motivo, riesgo, riesgo_alto}. Decide si encontrar (demanda real + capacidades existentes) o construir (falta capacidad / crear demanda). Reflejo por reglas con asistencia fuzzy (llm.complete.request) y fallback determinista. Riesgo alto (>=0.7 o camino PUENTE) → emite nichos.gate.solicitado (SolicitudDecision, no decide solo). Nicho inválido → error determinista nichos.camino.decidir.failed. Éxito → publica nichos.camino.decidido y responde por nichos.camino.decidir.response. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.camino.decidido` | Fire-and-forget (C4): el camino de una opción de nicho quedó decidido → {project_id, nicho, camino:ENCONTRAR\|CONSTRUIR\|PUENTE, motivo, riesgo, riesgo_alto, decidido}. Lo consumen ensamblador-solucion (D1) y el pipeline-por-nicho (L1). Si riesgo_alto, además se emite la SolicitudDecision. |
| `nichos.camino.decidir.failed` | Par de fallo determinista (C4): el nicho llegó vacío o no es una opción útil → {status, code, mensaje, data}. Cierra el círculo de nichos.camino.decidir.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico. Aquí el único par
> posible es `nichos.camino.decidir.failed` (nicho inválido).

> **Nota: no está en module.json pero sí lo emite index.js en `_subirRiesgo` (línea 158)**:
> cuando el riesgo es ALTO (`riesgo >= 0.7`) o el camino es `PUENTE`, el módulo publica además la
> SolicitudDecision **`nichos.gate.solicitado`** (fire-and-forget hacia K2/D2) con
> `{ tipo:'CAMINO_CONSTRUIR_ALTO_RIESGO', project_id, nicho, camino_propuesto, riesgo, motivo, estado:'PENDIENTE', decision:null }`.
> Es una emisión de dominio que module.json NO declara — el sistema **NUNCA decide solo un camino
> de alto riesgo**: lo sube y espera decisión humana.

> **Nota: `project.activated` NO está en module.json ni como handler** en index.js — este
> micro-agente es stateless y no se subscribe a él (aunque conserva `project_id`).

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo)**:
> ante una excepción inesperada en la decisión, se responde por el canal de la response con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }`.

## Reglas de negocio

1. **Riesgo alto → NUNCA decidir solo (REGLA del sistema)**: si `camino === 'PUENTE'` o
   `riesgo >= 0.7`, `riesgo_alto = true` y se sube la SolicitudDecision (`nichos.gate.solicitado`,
   PENDIENTE, para D2/K2). El sistema no decide un camino de alto riesgo por cuenta propia.
2. **NUNCA inventar**: el reflejo usa SOLO veredicto + estudio + capacidades que llegan; el LLM
   usa SOLO los datos del caso (`GUION_CAMINO`: "usa SOLO los datos que te dan").
3. **Nicho inválido → `400 NICHO_INVALIDO`** + `nichos.camino.decidir.failed` con
   `{ status:400, code:'NICHO_INVALIDO', mensaje:'la opcion de nicho es obligatoria para decidir el camino', project_id }`.
4. **`riesgo` normalizado a [0,1]**: `Number(riesgo)` → si finito se sujeta a `[0,1]`
   (`Math.min(1, Math.max(0, riesgo))`); si no finito → `0`. Default `0`.
5. **Camino base por reglas (`_decidirReflejo`)**:
   - `hayDemanda && existeCapacidad && faltantes===0` → **`ENCONTRAR`**.
   - `hayDemanda && faltantes > 0` → **`CONSTRUIR`**.
   - `!hayDemanda && (estudio || veredicto)` → **`CONSTRUIR`** (crear la demanda).
   - Sin datos suficientes → **`PUENTE`** (no se decide por defecto).
   `hayDemanda` = veredicto `VIABLE` **o** `estudio.demanda_1er_orden.fuerza_demanda >= 0.4`.
6. **Asistencia fuzzy solo si riesgo < 0.7**: si el riesgo es alto no se consulta el LLM (ya se sube
   a decisión). El asistido se acepta solo si `camino` ∈ {ENCONTRAR, CONSTRUIR, PUENTE}; si no, queda
   el reflejo `base`.
7. **`llm.complete.request` es una llamada RPC externa headless** con `{ system: GUION_CAMINO,
   messages:[{role:'user', content: JSON.stringify(caso)}], tools:[], settings:{temperature:0.2} }`,
   `timeout_ms: 30000`, `.catch(() => null)` (proveedor falla → reflejo asegura el camino).
8. **Sin estado (micro-agente stateless)**: `project_id` del request tiene preferencia sobre el de
   contexto; no hay PosPersistencia ni store.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.camino.decidir.response`:

### 1. `decidir` — decidir si se encuentra o se construye

```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "salsa picante artesanal", "audiencia": "restaurantes de barrio" },
  "veredicto": "VIABLE",
  "estudio": { "demanda_1er_orden": { "fuerza_demanda": 0.72 } },
  "capacidades": {
    "capacidades_disponibles": [ { "nombre": "recetario", "estado": "existente" } ],
    "capacidades_faltantes": []
  },
  "riesgo": 0.2
}
```
Respuesta `200` + publica `nichos.camino.decidido`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "nicho": { "producto": "salsa picante artesanal", "audiencia": "restaurantes de barrio" },
    "camino": "ENCONTRAR",
    "motivo": "hay demanda real y la solucion se sirve con las capacidades existentes del proyecto",
    "riesgo": 0.2,
    "riesgo_alto": false,
    "capacidad_faltante": 0,
    "decidido": true
  }
}
```
Emite `nichos.camino.decidido` con ese mismo `data`. Como `riesgo_alto` es `false`, NO emite
SolicitudDecision.

### Flujo CONSTRUIR — existe demanda pero falta capacidad (invariante D3)

```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "salsa picante artesanal" },
  "veredicto": "VIABLE",
  "capacidades": { "capacidades_disponibles": [], "capacidades_faltantes": [ { "nombre": "distribucion" } ] }
}
```
Respuesta `200`, `camino: "CONSTRUIR"`, `motivo: "hay demanda pero falta capacidad para materializar la solucion: se construye (D3)"`,
`capacidad_faltante: 1`.

### Flujo riesgo alto — sube SolicitudDecision, no decide solo

```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "energia alternativa" },
  "veredicto": "PUENTE",
  "riesgo": 0.85
}
```
Respuesta `200` + publica `nichos.camino.decidido` con `camino: "PUENTE"`, `riesgo: 0.85`,
`riesgo_alto: true`. Además, como es riesgo alto, publica `nichos.gate.solicitado`:
```json
{
  "tipo": "CAMINO_CONSTRUIR_ALTO_RIESGO",
  "project_id": "e57a318a-...",
  "nicho": { "producto": "energia alternativa" },
  "camino_propuesto": "PUENTE",
  "riesgo": 0.85,
  "motivo": "la demanda no esta establecida: hay que crear la demanda (construir)",
  "estado": "PENDIENTE",
  "decision": null
}
```

### Fallo — nicho inválido

```json
{ "project_id": "e57a318a-...", "nicho": null }
```
Respuesta `400` + `nichos.camino.decidir.failed`:
```json
{ "status": 400, "code": "NICHO_INVALIDO", "mensaje": "la opcion de nicho es obligatoria para decidir el camino", "project_id": "e57a318a-..." }
```

## Tests

El test vive en `tests/unit/camino-encontrar-construir.test.js`. Cubre:

- `decidir` con demanda real + capacidades existentes y sin faltantes → `200`, camino `ENCONTRAR`.
- Demanda + faltantes → `CONSTRUIR`; sin demanda establecida (pero con estudio/veredicto) → `CONSTRUIR`.
- Sin datos de demanda ni capacidades → `PUENTE` (no decide por defecto).
- Riesgo `>= 0.7` o camino PUENTE → `riesgo_alto: true` y publica `nichos.gate.solicitado`
  (PENDIENTE, no decide solo).
- Nicho inválido → `400` + `nichos.camino.decidir.failed` (`NICHO_INVALIDO`).
- Si el LLM falla o devuelve un camino no válido → cae al reflejo `_decidirReflejo`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/camino-encontrar-construir
node tests/unit/camino-encontrar-construir.test.js
```

## Notas de implementación

- Clase `CaminoEncontrarConstruir extends ModuloHibridoReflejo`; `name = 'camino-encontrar-construir'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onDecidirRequest` delega en `_atender(e, 'decidir', 'nichos.camino.decidir.response', fn)`,
  publica `nichos.camino.decidido` si `status===200` (y si `riesgo_alto`, `_subirRiesgo` → `nichos.gate.solicitado`),
  si no `nichos.camino.decidir.failed`.
- `_decidir` orquesta: reflejo `_decidirReflejo` ancla el camino → asistencia fuzzy `_concluir` solo
  si `riesgo < 0.7` y acepta el asistido solo si `camino` es canónico → `riesgoAlto = (camino==='PUENTE' || riesgo>=0.7)`.
- `_concluir` hace 1 llamada `llm.complete.request` headless (sin tools) con el `GUION_CAMINO`
  self-contained y `temperature: 0.2`, `timeout_ms: 30000`.
- `_parse` tolera fences ```` ```json ````, objetos crudos y texto al extraer el JSON del completado.
- `_subirRiesgo` publica `nichos.gate.solicitado` con `tipo:'CAMINO_CONSTRUIR_ALTO_RIESGO'`,
  `estado:'PENDIENTE'`, `decision:null` (SolicitudDecision a K2/D2).
- DEP: consume veredicto (C3) + catálogo de capacidades (D3); su salida `nichos.camino.decidido`
  la consumen `ensamblador-solucion` (D1) y `pipeline-por-nicho` (L1).
- **REGLA del sistema (5.3)**: un camino de alto riesgo NUNCA lo decide el sistema solo — se sube a
  decisión humana (D2/K2).
