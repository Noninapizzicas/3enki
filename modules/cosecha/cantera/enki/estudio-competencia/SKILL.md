---
name: estudio-competencia
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `estudio-competencia` de la vertical
  nichos (Radar de Nichos). Es el estudio de competencia del nicho ANTES del gate
  de operar (E1): dado un NICHO construido y las fuentes declaradas, produce un ESTUDIO
  DE COMPETENCIA ESTRUCTURADO (el dataset de competidores observados en las fuentes +
  la CONCLUSION de diferenciacion) que alimenta el paquete-decision (H1). Úsala para
  operar, depurar o extender la célula, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites analizar la competencia de un nicho (RPC nichos.competencia.analizar.request).
  - Cuando depures por qué un nicho no se analiza o un estudio falla
    (NICHO_INVALIDO / SIN_DATOS / SIN_CONCLUSION), o cuándo cae al fallback reflejo.
  - Cuando quieras entender el patrón híbrido reflejo+fuzzy del análisis (consultar fuentes
    vía nichos.fuente.consultar.request + concluir diferenciación vía llm.complete.request)
    y su contrato.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, competencia, proyecto-3d]
---

# estudio-competencia — MICRO-AGENTE (fuzzy) del estudio de competencia ante el gate

## Qué hace el módulo

`estudio-competencia` es un **MICRO-AGENTE HÍBRIDO** (E1): el estudio de competencia del
nicho **ANTES del gate de operar** (E2/gate-decision-operar). Recibe un **NICHO construido**
con las fuentes declaradas y produce un **ESTUDIO DE COMPETENCIA ESTRUCTURADO** — nunca un
texto suelto: el dataset de competidores observados en las fuentes (quién compite y con qué
fuerza) + la **CONCLUSIÓN de diferenciación** (por qué ángulo puede entrar el nicho). El
resultado alimenta el paquete-decision (H1) vía `nichos.competencia.analizado`.

Dos mitades (patrón real de `estudio-demanda` y `sondeo-territorio`):

- **REFLEJO** (`_consultarFuentes` + `_extraerCompetidores` + `_medirMetricas`): mecánico y
  determinista. Consulta cada fuente vía `nichos.fuente.consultar.request`, normaliza el
  dataset en una lista plana de competidores y mide el grado de competencia con **números
  declarados** (competidores observados, fuentes con datos, intensidad alta, grado 0-1, saturado).
- **FUZZY** (`_concluirDiferenciacion`): juicio LLM. Un guion-prompt self-contained
  (`GUION_DIFERENCIACION`) + los datos → `llm.complete.request` → **conclusión de diferenciación**
  en un párrafo breve. Si el LLM falla o incumple contrato, el reflejo determinista
  (`_concluirReflejo`) concluye **de los datos observados, sin fabricar competidores**.

**NUNCA inventa**: no fabrica un competidor que las fuentes no apoyen; si el nicho viene
vacío o no hay datos que apoyen el análisis → par de fallo honesto (`nichos.competencia.analizar.failed`).
Se corre **ANTES del gate** (E2). Sin store, sin custodio: entra nicho, sale estudio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.competencia.analizar.request` | `onAnalizarRequest` | RPC híbrido: {project_id, nicho, fuentes?} → {nicho, competidores:[{nombre, intensidad, fortaleza, fuentes}], metricas:{competidores_observados, fuentes_con_datos, competidores_intensidad_alta, grado_competencia, saturado}, conclusion_diferenciacion, analizado}. Consulta las fuentes vía `nichos.fuente.consultar.request`, normaliza el dataset de competidores y mide el grado (reflejo, números declarados) y concluye la diferenciación (fuzzy `llm.complete.request` con fallback reflejo que deriva la conclusión de los datos sin inventar). Nicho vacío o sin datos → error determinista `nichos.competencia.analizar.failed`. Éxito → publica `nichos.competencia.analizado` y responde por `nichos.competencia.analizar.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.competencia.analizado` | Fire-and-forget (E1): el estudio de competencia de un nicho quedó analizado → {project_id, nicho, competidores, metricas, conclusion_diferenciacion, analizado}. Se corre ANTES del gate; lo consume paquete-decision (H1) y el pipeline-por-nicho (L1). |
| `nichos.competencia.analizar.failed` | Par de fallo determinista (E1): el nicho llegó vacío o no hay datos de fuentes que apoyen el análisis de competencia → {status, code, mensaje, data}. Cierra el círculo de nichos.competencia.analizar.request. |

> **Regla de cierre de círculo**: el par `nichos.competencia.analizar.failed` cierra el círculo
> de `nichos.competencia.analizar.request`. En éxito se emite `nichos.competencia.analizado`
> (fire-and-forget de dominio) para el paquete-decision (H1).

> **Nota: los eventos de dominio que emite index.js en `onAnalizarRequest` (nichos.competencia.analizado,
> nichos.competencia.analizar.failed) coinciden exactamente con los publicados en module.json** —
> no hay sub-declaración en este módulo.

## Reglas de negocio

1. **NUNCA inventar competencia (honestidad)**: `_extraerCompetidores` normaliza SOLO lo que las
   fuentes devolvieron (agrupa por nombre en minúsculas, suma fuentes al Set); `_parsearRegistros`
   **descarta** registros sin nombre (`.filter(r => r.nombre)`). `_concluirReflejo` concluye
   **de los datos observados**, sin fabricar competidores, precios ni fortalezas ausentes.
2. **Nicho obligatorio → `400 NICHO_INVALIDO`**: si `nicho` falta o no es objeto →
   `{ status:400, code:'NICHO_INVALIDO', mensaje:'el nicho es obligatorio para analizar la competencia', data:{project_id} }`
   + `nichos.competencia.analizar.failed`.
3. **Sin datos de fuentes → `422 SIN_DATOS`**: si `_consultarFuentes` suma 0 registros →
   `{ status:422, code:'SIN_DATOS', mensaje:'ninguna fuente devolvio datos que apoyen el analisis de competencia', data:{project_id, nicho} }`
   + failed. No inventa barrido.
4. **Sin conclusión → `502 SIN_CONCLUSION`**: si ni el juicio fuzzy ni el fallback reflejo
   producen conclusión → `{ status:502, code:'SIN_CONCLUSION', mensaje:'el juicio no pudo concluir la diferenciacion', data:{project_id, nicho} }`
   + failed. Honesto: si no se puede concluir, no se finge.
5. **Fallback reflejo por reglas (no romper el pipeline)**: si el LLM no devuelve conclusión,
   `_concluirReflejo` deriva la conclusión DE LAS MÉTRICAS REALES: sin competidores observados →
   hueco posible con ventaja de primer movimiento; `grado >= 0.7` → exige ángulo diferencial
   estrecho (especialización o territorio); `grado >= 0.4` → hay espacio por calidad/servicio o
   territorio; por debajo → territorio poco saturado, viable entrar con ventaja.
6. **Barrido vía RPC al puerto (J1)**: `_consultarFuentes` llama `nichos.fuente.consultar.request`
   por fuente (con `timeout_ms: 15000` y `.catch(() => null)`); si `resp.status === 200` parsea
   `resp.data.dataset/resultados/raw`, si no registra `{fuente, registros:[], error}`. El término es
   `nicho.producto || nicho.servicio || nicho.audiencia || nicho.id`.
7. **Grado de competencia anclado en lo real (números declarados)**: `_medirMetricas` calcula
   `grado = min(1, 0.3 + min(0.4, numCompetidores*0.08) + alta*0.1)` redondeado a 2, y marca
   `saturado: grado >= 0.7`. Más competidores y más intensidad alta → más saturado.
8. **Cota de registros**: `_parsearRegistros` limita a `COMPETIDORES_COTA = 20` registros por
   fuente (cota conservadora). El dataset puede venir como array|string|objeto (`items` o primer
   array de claves); se normaliza en una lista plana con `nombre`, `intensidad` (default 0.5) y
   `fortaleza`.
9. **Análisis estructurado, nunca texto suelto**: la respuesta SIEMPRE lleva `competidores[]`,
   `metricas{}` y `conclusion_diferenciacion` — juntos forman el estudio de competencia.
10. **Sin estado**: `project_id` del request tiene preferencia sobre el de contexto; no hay store
    ni PosPersistencia (stateless).

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.competencia.analizar.response`:

### 1. `analizar` — estudiar la competencia de un nicho (antes del gate E2)

```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "salsa picante", "audiencia": "restaurantes", "lugar": "CDMX" },
  "fuentes": null
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "nicho": "salsa picante",
  "competidores": [
    { "nombre": "Cholula", "intensidad": 0.9, "fortaleza": "marca ancla", "fuentes": ["puerto"] }
  ],
  "metricas": {
    "competidores_observados": 1,
    "fuentes_con_datos": 1,
    "competidores_intensidad_alta": 1,
    "grado_competencia": 0.7,
    "saturado": true
  },
  "conclusion_diferenciacion": "La competencia en el nicho es alta y exige un angulo estrecho...",
  "analizado": true
}
```
Emite `nichos.competencia.analizado` (fire-and-forget para paquete-decision H1):
```json
{ "project_id": "e57a318a-...", "nicho": "salsa picante", "competidores": [...], "metricas": {...}, "conclusion_diferenciacion": "...", "analizado": true }
```

### Fallos típicos

- Nicho vacío/no-objeto → `400` + `nichos.competencia.analizar.failed` (`NICHO_INVALIDO`).
- Ninguna fuente con datos → `422` + failed (`SIN_DATOS`).
- Juicio sin conclusión ni fallback → `502` + failed (`SIN_CONCLUSION`).

## Tests

El test vive en `tests/unit/estudio-competencia.test.js`. Cubre:

- `analizar` con nicho → `200`, consulta vía `nichos.fuente.consultar.request`, extrae/agrupa
  competidores, mide métricas, emite `nichos.competencia.analizado`.
- Nicho vacío → `400 NICHO_INVALIDO` + failed.
- Fuentes sin datos → `422 SIN_DATOS` + failed.
- Si el LLM falla/incumple contrato → fallback `_concluirReflejo` (conclusión derivada de las métricas).
- Ni LLM ni reflejo → `502 SIN_CONCLUSION` + failed.
- `_extraerCompetidores` agrupa por nombre y suma las fuentes al Set.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/estudio-competencia
node tests/unit/estudio-competencia.test.js
```

## Notas de implementación

- Clase `EstudioCompetencia extends ModuloHibridoReflejo`; `name = 'estudio-competencia'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onAnalizarRequest` delega en `_atender(e, 'analizar', 'nichos.competencia.analizar.response', fn)`;
  con `status === 200` publica `nichos.competencia.analizado`; si no, `nichos.competencia.analizar.failed`.
- `_consultarFuentes` hace una RPC `nichos.fuente.consultar.request` por fuente (o `[null]` → la fuente
  activa) con `timeout_ms: 15000` y `.catch(() => null)`.
- `_concluirDiferenciacion` hace 1 llamada `this._rpc('llm.complete.request', ...)` headless
  (`GUION_DIFERENCIACION`, `settings.temperature: 0.2`, `timeout_ms: 30000`, tools vacíos).
- `_parseConclusion` tolera fences ```json y texto plano; extrae el `conclusion` del JSON si lo hay.
- `_concluirReflejo` garantiza la conclusión determinista de las métricas (grado 0.7/0.4, sin
  competidores) — nunca inventa.
- Dependencia hacia delante: lo consume el paquete-decision (H1) y el pipeline-por-nicho (L1);
  corre ANTES del gate-decision-operar (E2). Consulta puerto-fuente-datos (J1).
