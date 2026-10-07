---
name: veredicto-viabilidad
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `veredicto-viabilidad` (C3) de la vertical
  nichos (Radar de Nichos). Es el JUICIO ASISTIDO del eslabón limitante (validación, embudo
  C): recibe el estudio de demanda ya medido (C1) y el criterio de viabilidad vigente (C2) y
  decide por candidato VIABLE | NO_VIABLE | PUENTE con confianza y motivo. Úsala para operar,
  depurar o extender el veredicto de viabilidad, o para entender su contrato de eventos y reglas
  de negocio (el corte DURO lo aplica C6, no este agente).
when-to-use: >
  - Cuando necesites evaluar la viabilidad de un candidato (RPC nichos.veredicto.evaluar.request).
  - Cuando depures por qué el veredicto es PUENTE (sin criterio declarado o datos insuficientes),
    NO_VIABLE (demanda que no alcanza), o por qué cae al fallback reflejo.
  - Cuando entiendas el patrón híbrido reflexivo+fuzzy del eslabón limitante (reflejo de números
    declarados + llm.complete.request con guion-prompt self-contained) y la regla de que el corte
    DURO "no viable no pasa" vive en C6, no en el agente.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, eslabon-limitante, validacion, veredicto, proyecto-3d]
---

# veredicto-viabilidad — MICRO-AGENTE (fuzzy) del ESLABÓN LIMITANTE del Radar

## Qué hace el módulo

`veredicto-viabilidad` es el **juicio asistido de viabilidad** (pieza C3) del eslabón limitante.
Recibe el **ESTUDIO DE DEMANDA ya medido** (`estudio-demanda` C1, vía `nichos.estudio.medido`)
y el **CRITERIO DE VIABILIDAD vigente** (`criterio-viabilidad` C2, umbral de ingresos + mínimos
de demanda) y decide, **por candidato**, uno de tres veredictos:

- **`VIABLE`** — la demanda medida supera/iguala el criterio vigente (ingresos prospectivos y/o
  mínimos de demanda). Entra al tramo caro con control.
- **`NO_VIABLE`** — la demanda no alcanza el criterio. **El corte DURO lo aplica C6
  (corte-temprano), NO este agente**: aquí solo se evalúa y se declara el veredicto. Un
  `NO_VIABLE` NUNCA avanza a construcción.
- **`PUENTE`** — el juicio no tiene datos suficientes o el criterio no está declarado: no se
  decide por defecto, se sube a decisión humana (D2/K2), **nunca se asume viable**.

Dos mitades (patrón real de `normalizacion-semilla` + `estudio-demanda`):

- **REFLEJO** (`_evaluarReflejo`): determinista (números declarados). Contrasta el estudio con el
  criterio por reglas y devuelve el **veredicto base**. Ancla el veredicto en números reales.
- **FUZZY** (`_concluir`): una llamada headless a `llm.complete.request` con un guion-prompt
  self-contained (`GUION_VEREDICTO`) que refina el veredicto en **JSON tipado** (veredicto,
  confianza, motivo). Si el LLM falla o no cumple el contrato → el **reflejo determinista
  asegura el veredicto** (no rompe el embudo).

**NUNCA inventa**: no fabrica demanda que el estudio no apoye; si el estudio viene vacío →
par de fallo honesto (`nichos.veredicto.evaluar.failed`); sin criterio declarado o sin datos
suficientes → veredicto `PUENTE` con motivo explícito. Sin store, sin custodio: entra
estudio + criterio, sale veredicto.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.veredicto.evaluar.request` | `onEvaluarRequest` | RPC híbrido: {project_id, estudio:{demanda_1er_orden, disposicion_pagar, candidato}, criterio:{umbral_ingresos, minimos_demanda}} → {candidato, estudio, criterio, veredicto:VIABLE\|NO_VIABLE\|PUENTE, confianza, motivo}. Evalúa la demanda medida contra el criterio vigente (reflejo por números) y refina el veredicto con juicio fuzzy (llm.complete.request con fallback reflejo). Estudio vacío → error determinista nichos.veredicto.evaluar.failed; sin criterio declarado → veredicto PUENTE con motivo (no asume viable). Éxito → publica nichos.veredicto.emitido y responde por nichos.veredicto.evaluar.response. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.veredicto.emitido` | Fire-and-forget (C3): el veredicto de viabilidad de un candidato quedó emitido → {project_id, candidato, estudio, criterio, veredicto:VIABLE\|NO_VIABLE\|PUENTE, confianza, motivo, emitido}. Lo consumen corte-temprano (C6) y el pipeline-por-nicho (L1). Un NO_VIABLE no avanza a construcción: lo corta C6. |
| `nichos.veredicto.evaluar.failed` | Par de fallo determinista (C3): el estudio llegó vacío o no es un objeto útil → {status, code, mensaje, data}. Cierra el círculo de nichos.veredicto.evaluar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico. Aquí el único
> par posible es `nichos.veredicto.evaluar.failed` (estudio vacío o inútil).

> **Nota: `project.activated` NO está en module.json ni como handler** en index.js — este
> micro-agente es stateless y no se subscribe a él (aunque conserva `project_id`).

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo)**:
> ante una excepción inesperada en la evaluación, se responde por el canal de la response con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }`.

## Reglas de negocio

1. **El corte DURO "no viable no pasa" vive en C6 (corte-temprano), NUNCA aquí**: este agente solo
   evalúa y declara el veredicto. Un `NO_VIABLE` emitido NUNCA avanza a construcción: lo corta C6.
2. **NUNCA inventar demanda**: el veredicto usa SOLO los números del estudio y del criterio.
   `ingresosProspectivos = round(volumen_busqueda * precio_medio_eur, 2)` (proyección derivada de
   los números del estudio, NO fabricada). El criterio no permite decidir → PUENTE, no se asume viability.
3. **Estudio inválido → `400 ESTUDIO_INVALIDO`** + `nichos.veredicto.evaluar.failed` con
   `{ status:400, code:'ESTUDIO_INVALIDO', mensaje:'el estudio de demanda es obligatorio para evaluar la viabilidad', project_id }`.
4. **Sin criterio declarado → `PUENTE` honesto** (no es fallo): `_evaluarReflejo` detecta que
   `umbral_ingresos`, `numero_busquedas` y `contactos_semana` son todos `null` → retorna
   `{ veredicto:'PUENTE', confianza:0.2, motivo:'SIN_CRITERIO' }`; `_evaluar` emite con motivo
   `'sin criterio de viabilidad declarado: no se asume viable'`. Se sube a decisión humana (D2/K2).
5. **Viable → `VIABLE`**: cumple AL MENOS una dimensión declarada (`cumplidos.length > 0`) **y**
   `fuerza_demanda >= 0.4`. Confianza `= round(0.6 + 0.1 * cumplidos.length, 2)`; motivo `alcanza <dims>`.
6. **Sin dimensión cumplida → `NO_VIABLE`** de confianza alta `0.8`, motivo
   `'la demanda medida no alcanza el criterio de viabilidad vigente'`.
7. **Datos pero fuerza baja → `PUENTE`**: hay dimensiones cumplidas pero `fuerza < 0.4` — no se
   descarta duro, se sube a decisión. Confianza `0.4`, motivo
   `'la demanda alcanza alguna dimension pero la fuerza de demanda es baja'`.
8. **Contraste "precio alto sobre demanda diminuta" NO viabiliza**: el umbral de ingresos solo se
   considera cumplido si además se cumple el mínimo de búsquedas declarado
   (`cumpleIngresos = cumple(ingresosProspectivos, umbral) && (minBusquedas == null || cumple(volumen, minBusquedas))`).
   `contactos_semana` es un proxy determinista del volumen de señales (mismo número).
9. **`llm.complete.request` es una llamada RPC externa headless** con `{ system: GUION_VEREDICTO,
   messages:[{role:'user', content: JSON.stringify({estudio, criterio, evaluacion_reflejo: base})}],
   tools:[], settings:{temperature:0.2} }`, `timeout_ms: 30000`, `.catch(() => null)` (proveedor
   falla → cae al reflejo ya calculado). El veredicto asistido solo se acepta si es válido
   (`asistioValido`: ∈ {VIABLE, NO_VIABLE, PUENTE} y `confianza` ∈ [0,1]).
10. **Sin estado (micro-agente stateless)**: `project_id` del request tiene preferencia sobre el
    de contexto; no hay PosPersistencia ni store.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.veredicto.evaluar.response`:

### 1. `evaluar` — evaluar la viabilidad de un candidato

```json
{
  "project_id": "e57a318a-...",
  "estudio": {
    "candidato": { "producto": "salsa picante artesanal", "audiencia": "restaurantes de barrio" },
    "demanda_1er_orden": { "quienes_buscan": ["restaurantes de barrio"], "fuerza_demanda": 0.72, "volumen_busqueda": 84, "fuentes": ["puerto"] },
    "disposicion_pagar": { "moneda": "EUR", "precio_medio_eur": 104.5 }
  },
  "criterio": {
    "umbral_ingresos": 150,
    "minimos_demanda": { "numero_busquedas": 40, "contactos_semana": 10 }
  }
}
```
Respuesta `200` + publica `nichos.veredicto.emitido`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "candidato": { "producto": "salsa picante artesanal", "audiencia": "restaurantes de barrio" },
    "estudio": {
      "candidato": { "producto": "salsa picante artesanal", "audiencia": "restaurantes de barrio" },
      "demanda_1er_orden": { "quienes_buscan": ["restaurantes de barrio"], "fuerza_demanda": 0.72, "volumen_busqueda": 84, "fuentes": ["puerto"] },
      "disposicion_pagar": { "moneda": "EUR", "precio_medio_eur": 104.5 }
    },
    "criterio": { "umbral_ingresos": 150, "minimos_demanda": { "numero_busquedas": 40, "contactos_semana": 10 } },
    "veredicto": "VIABLE",
    "confianza": 0.8,
    "motivo": "alcanza umbral_ingresos, numero_busquedas, contactos_semana",
    "emitido": true
  }
}
```
(En este ejemplo: `ingresosProspectivos = 84 * 104.5 = 8778` ≥ 150 ✓, `volumen 84 ≥ 40` ✓ y `84 ≥ 10` ✓,
`fuerza 0.72 ≥ 0.4` → VIABLE con `0.6 + 0.3 = 0.9` redondeado; los valores de `confianza`/`motivo` exactos
los deriva el reflejo de los números reales.)

### Fallo — estudio inválido

```json
{ "project_id": "e57a318a-...", "estudio": null }
```
Respuesta `400` + `nichos.veredicto.evaluar.failed`:
```json
{ "status": 400, "code": "ESTUDIO_INVALIDO", "mensaje": "el estudio de demanda es obligatorio para evaluar la viabilidad", "project_id": "e57a318a-..." }
```

### Flujo PUENTE — sin criterio declarado (no es fallo, es decisión de subir a humano)

```json
{
  "project_id": "e57a318a-...",
  "estudio": { "candidato": { "producto": "xyz" }, "demanda_1er_orden": {}, "disposicion_pagar": {} },
  "criterio": {}
}
```
Respuesta `200` + publica `nichos.veredicto.emitido`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "candidato": { "producto": "xyz" },
    "estudio": { "candidato": { "producto": "xyz" }, "demanda_1er_orden": {}, "disposicion_pagar": {} },
    "criterio": {},
    "veredicto": "PUENTE",
    "confianza": 0.2,
    "motivo": "sin criterio de viabilidad declarado: no se asume viable",
    "emitido": true
  }
}
```

## Tests

El test vive en `tests/unit/veredicto-viabilidad.test.js`. Cubre:

- `evaluar` con estudio válido y criterio cumplido → `200`, veredicto `VIABLE` con confianza
  derivada; emite `nichos.veredicto.emitido`.
- Estudio vacío/inútil → `400` + `nichos.veredicto.evaluar.failed` (`ESTUDIO_INVALIDO`).
- Sin criterio declarado → `200` con veredicto `PUENTE` y motivo explícito (no asume viable).
- Demanda que no alcanza el criterio → `NO_VIABLE` (confianza alta); con fuerza baja y alguna
  dimensión cumplida → `PUENTE` (no descarte duro).
- La regla "precio alto sobre demanda diminuta no viabiliza" (umbral de ingresos condicionado al
  mínimo de búsquedas).
- Si el LLM falla o no valida → cae al reflejo `_evaluarReflejo` (veredicto base asegurado).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/veredicto-viabilidad
node tests/unit/veredicto-viabilidad.test.js
```

## Notas de implementación

- Clase `VeredictoViabilidad extends ModuloHibridoReflejo`; `name = 'veredicto-viabilidad'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onEvaluarRequest` delega en `_atender(e, 'evaluar', 'nichos.veredicto.evaluar.response', fn)`
  y publica el fire-and-forget de dominio (`nichos.veredicto.emitido` si `status===200`, si no
  `nichos.veredicto.evaluar.failed`).
- `_evaluar` orquesta: ancla el reflejo `_evaluarReflejo` primero → si `SIN_CRITERIO` emite PUENTE
  honesto sin consultar LLM → si no, `_concluir` (fuzzy) y acepta el asistido solo si `asistioValido`,
  si no cae al reflejo ya calculado → `_emitir` estructura el dominio publicado.
- `_concluir` hace 1 llamada `llm.complete.request` headless (sin tools) con el `GUION_VEREDICTO`
  self-contained y `temperature: 0.2`, `timeout_ms: 30000`.
- `_parse` tolera fences ```` ```json ````, objetos crudos y texto al extraer el JSON del completado.
- `_emitir` setea `candidato: estudio.candidato || (estudio.producto || estudio.audiencia || '')`,
  `emitido: true` y devuelve `status: 200`.
- **Corte DURO del eslabón**: "no viable no pasa" vive en C6 (corte-temprano), no en este agente.
  DEP: consume `nichos.estudio.medido` (C1) + `criterio-viabilidad` (C2); su salida `nichos.veredicto.emitido`
  la consumen `corte-temprano` (C6) y `pipeline-por-nicho` (L1).
