---
name: paquete-decision
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `paquete-decision` de la vertical nichos
  (Radar de Nichos). Arma un paquete de decisión autocxplicado para el dueño (H1): dado un
  NICHO y la célula evidencia/riesgo/alternativa, produce un PAQUETE DE DECISIÓN en estructura
  JSON que el dueño lee y decide (APRUEBA/RECHAZA). Lo consume el gate-decision-operar (E2) y
  el canal-supervision (G1). Úsala para operar, depurar o extender la célula, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites armar el paquete de decisión de un nicho (RPC nichos.paquete.construir.request).
  - Cuando depures por qué un paquete no se construye o la síntesis falla
    (NICHO_INVALIDO / SIN_SINTESIS), o cuándo cae al fallback reflejo.
  - Cuando quieras entender el patrón híbrido reflejo+fuzzy del paquete (normalizar la célula
    evidencia/riesgo/alternativa + sintetizar vía llm.complete.request) y su contrato.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, decision, gate, proyecto-3d]
---

# paquete-decision — MICRO-AGENTE (fuzzy) que arma el paquete de decisión del dueño

## Qué hace el módulo

`paquete-decision` es un **MICRO-AGENTE HÍBRIDO** (H1): arma un **paquete de decisión
autocxplicado** para el dueño. Dado un **NICHO** y la **célula evidencia/riesgo/alternativa**,
produce un **PAQUETE DE DECISIÓN** en estructura JSON autocxplicada — **nicho + evidencia +
riesgo + alternativa** — que el dueño puede leer y decidir (**APRUEBA/RECHAZA**). Lo consume el
**gate-decision-operar** (E2) y el **canal-supervision** (G1) vía `nichos.paquete_construido`.

Dos mitades (patrón real de `proponedor-modelo-cobro` + `estudio-competencia`):

- **REFLEJO** (`_hidratarReflejo`): mecánico y determinista. Valida el nicho y **normaliza la
  célula evidencia/riesgo/alternativa** en estructura (arrays de texto; si faltan, marcadores
  honestos `'sin evidencia declarada'`, `'sin riesgo declarado'`, `'sin alternativa declarada'`).
- **FUZZY** (`_redactarSintesis`): juicio LLM. Un guion-prompt self-contained (`GUION_SINTESIS`)
  + los datos → `llm.complete.request` → **síntesis autocxplicada** (qué se propone, por qué,
  qué puede salir mal, qué otra opción hay). Si falla, el reflejo determinista (`_sintesisReflejo`)
  resume **de los datos, sin inventar**.

**NUNCA inventa**: no fabrica evidencia/riesgo/alternativa ausentes; si el nicho viene vacío →
par de fallo honesto (`nichos.paquete.construir.failed`). Sin store, sin custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.paquete.construir.request` | `onConstruirRequest` | RPC híbrido: {project_id, nicho, evidencia?, riesgo?, alternativa?} → {nicho, tipo_nicho, evidencia, riesgo, alternativa, sintesis, autocxplicado, construido}. Valida el nicho y normaliza la célula evidencia/riesgo/alternativa en estructura (reflejo, números declarados) y redacta la síntesis autocxplicada (fuzzy `llm.complete.request` con fallback reflejo que deriva el resumen de los datos sin inventar). Nicho vacío → error determinista `nichos.paquete.construir.failed`. Éxito → publica `nichos.paquete_construido` y responde por `nichos.paquete.construir.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.paquete_construido` | Fire-and-forget (H1): el paquete de decisión de un nicho quedó construido → {project_id, nicho, evidencia, riesgo, alternativa, sintesis, autocxplicado, construido}. Lo consume el gate-decision-operar (E2) y lo entrega el canal-supervision (G1). |
| `nichos.paquete.construir.failed` | Par de fallo determinista (H1): el nicho llegó vacío o el juicio no pudo armar el paquete → {status, code, mensaje, data}. Cierra el círculo de nichos.paquete.construir.request. |

> **Regla de cierre de círculo**: el par `nichos.paquete.construir.failed` cierra el círculo
> de `nichos.paquete.construir.request`. En éxito se emite `nichos.paquete_construido`
> (fire-and-forget de dominio) para el gate-decision-operar (E2) y el canal-supervision (G1).

> **Nota: los eventos de dominio que emite index.js en `onConstruirRequest` (nichos.paquete_construido,
> nichos.paquete.construir.failed) coinciden exactamente con los publicados en module.json** —
> no hay sub-declaración en este módulo.

## Reglas de negocio

1. **NUNCA inventar evidencia/riesgo/alternativa (honestidad)**: `_hidratarReflejo` normaliza la
   célula SOLO con las entradas recibidas; si faltan, pone marcadores `'sin evidencia declarada'`,
   `'sin riesgo declarado'`, `'sin alternativa declarada'` — jamás rellena contenido. `_sintesisReflejo`
   omite la sección que venga marcada como ausente.
2. **Nicho obligatorio → `400 NICHO_INVALIDO`**: si `nicho` falta o no es objeto →
   `{ status:400, code:'NICHO_INVALIDO', mensaje:'el nicho es obligatorio para armar el paquete de decision', data:{project_id} }`
   + `nichos.paquete.construir.failed`.
3. **Sin síntesis → `502 SIN_SINTESIS`**: si ni el juicio fuzzy ni el fallback reflejo producen
   síntesis → `{ status:502, code:'SIN_SINTESIS', mensaje:'el juicio no pudo sintetizar el paquete de decision', data:{project_id, nicho} }`
   + failed. Honesto: si no se puede armar el paquete, no se finge.
4. **Paquete autocxplicado y estructurado**: la respuesta SIEMPRE lleva `nicho`, `tipo_nicho`,
   `evidencia[]`, `riesgo[]`, `alternativa[]`, `sintesis`, `autocxplicado: true` y `construido: true`.
   El dueño lee el paquete y decide APRUEBA/RECHAZA.
5. **Fallback reflejo por reglas (no romper el pipeline)**: si el LLM no devuelve síntesis,
   `_sintesisReflejo` construye "Se propone operar el nicho \"X\"" + la evidencia/riesgo/alternativa
   presentes, omitiendo las ausentes.
6. **Autocxplicado**: la síntesis responde qué se propone, por qué (evidencia), qué puede salir mal
   (riesgo) y qué otra opción existe (alternativa).
7. **Sin estado**: `project_id` del request tiene preferencia sobre el de contexto; no hay store
   ni PosPersistencia (stateless).

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.paquete.construir.response`:

### 1. `construir` — armar el paquete de decisión de un nicho (para el dueño, antes del gate E2)

```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "salsa picante", "audiencia": "restaurantes", "tipo": "producto" },
  "evidencia": ["demanda creciente en CDMX"],
  "riesgo": ["competencia alta"],
  "alternativa": ["enfocar a un subsegmento"]
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "nicho": "salsa picante",
  "tipo_nicho": "producto",
  "evidencia": ["demanda creciente en CDMX"],
  "riesgo": ["competencia alta"],
  "alternativa": ["enfocar a un subsegmento"],
  "sintesis": "Se propone operar 'salsa picante' para restaurantes, apoyada en demanda creciente. Riesgo: competencia alta. Alternativa: enfocar a un subsegmento.",
  "autocxplicado": true,
  "construido": true
}
```
Emite `nichos.paquete_construido` (fire-and-forget para el gate E2 / canal-supervision G1):
```json
{ "project_id": "e57a318a-...", "nicho": "salsa picante", "evidencia": [...], "riesgo": [...], "alternativa": [...], "sintesis": "...", "autocxplicado": true, "construido": true }
```

### Fallos típicos

- Nicho vacío/no-objeto → `400` + `nichos.paquete.construir.failed` (`NICHO_INVALIDO`).
- Juicio sin síntesis ni fallback → `502` + failed (`SIN_SINTESIS`).
- Célula incompleta — NO es fallo; las secciones ausentes quedan marcadas `'sin ... declarado'`.

## Tests

El test vive en `tests/unit/paquete-decision.test.js`. Cubre:

- `construir` con nicho y célula → `200`, hidrata evidencia/riesgo/alternativa, sintetiza, emite
  `nichos.paquete_construido`.
- Nicho vacío → `400 NICHO_INVALIDO` + failed.
- Célula incompleta → marcadores `'sin ... declarado'` (no inventa).
- Si el LLM falla/incumple contrato → fallback `_sintesisReflejo` (síntesis derivada de los datos).
- Ni LLM ni reflejo → `502 SIN_SINTESIS` + failed.
- `_sintesisReflejo` omite la sección ausente.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/paquete-decision
node tests/unit/paquete-decision.test.js
```

## Notas de implementación

- Clase `PaqueteDecision extends ModuloHibridoReflejo`; `name = 'paquete-decision'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onConstruirRequest` delega en `_atender(e, 'construir', 'nichos.paquete.construir.response', fn)`;
  con `status === 200` publica `nichos.paquete_construido`; si no, `nichos.paquete.construir.failed`.
- `_hidratarReflejo` valida el nicho (400 NICHO_INVALIDO) y normaliza la célula en arrays de texto.
- `_redactarSintesis` hace 1 llamada `this._rpc('llm.complete.request', ...)` headless
  (`GUION_SINTESIS`, `settings.temperature: 0.2`, `timeout_ms: 30000`, tools vacíos).
- `_parseSintesis` tolera fences ```json y texto; extrae el `sintesis` del JSON si lo hay.
- `_sintesisReflejo` garantiza el resumen determinista de los datos (omite secciones ausentes).
- Dependencia hacia delante: lo consumen gate-decision-operar (E2) y canal-supervision (G1);
  entra tras la célula de evidencia/riesgo/alternativa del nicho (D1 y sucesores).
