---
name: corte-temprano
description: >
  Skill FULL del módulo REFLEJO `corte-temprano` (C6) de la vertical nichos (Radar de Nichos).
  PROTEGE la salud financiera (F3): dado un VEREDICTO de viabilidad (C3, nichos.veredicto.emitido)
  decide si el nicho PASA A CONSTRUCCIÓN o se CORTA a tiempo. REGLA DURA determinista: un veredicto
  NO_VIABLE NUNCA avanza a construcción; PUENTE espera decisión humana. Stateless, función pura.
  Úsala para operar, depurar o extender el corte temprano, o para entender su contrato de eventos y
  reglas de negocio.
when-to-use: >
  - Cuando necesites evaluar el corte de un veredicto (RPC nichos.corte.evaluar.request).
  - Cuando depures por qué un nicho quedó CORTADO (NO_VIABLE), PASA_A_CONSTRUCCION (VIABLE) o
    PENDIENTE_DECISION (PUENTE), o por qué falló (veredicto inválido → 400 VEREDICTO_INVALIDO).
  - Cuando entiendas el patrón REFLEJO puro determinista que aplica el corte DURO del embudo (F3:
    los cortados no sangran; solo los viables entran al tramo caro con control).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo.
tags: [enki, modulo, reflejo, nichos, radar, embudo, corte, financiera, proyecto-3d]
---

# corte-temprano — REFLEJO stateless (C6) del EMBUDO que aplica el CORTE DURO del Radar

## Qué hace el módulo

`corte-temprano` **PROTEGE la salud financiera (F3)**: dado un **VEREDICTO de viabilidad**
(`veredicto-viabilidad` C3, `nichos.veredicto.emitido`), decide si el nicho **PASA A CONSTRUCCIÓN**
o se **CORTA a tiempo**. Es la pieza que **materializa el corte DURO** del eslabón limitante
(recordar: "no viable no pasa" vive aquí + en `criterio-viabilidad` C2, NUNCA en el agente de
veredicto).

**REGLA DURA determinista**: un veredicto `NO_VIABLE` **NUNCA avanza a construcción** (estado ilegal
`NO_VIABLE -> CONSTRUIDO` imposible en la máquina de estados). Los cortados **no sangran** (protege
F3); **solo los viables entran al tramo caro con control**.

Resultados por veredicto:

- **`VIABLE`** → `pasa_a_construccion = true` (entra al tramo caro con control).
- **`NO_VIABLE`** → `pasa_a_construccion = false`, `cortado = true` (`CORTADO`, no avanza).
- **`PUENTE`** → espera decisión humana (no corta solo, no avanza solo): pendiente.

Es un **REFLEJO puro y determinista**: sin estado, sin custodio, cada op es función pura de su
entrada. Proyecciones `_evaluar(veredicto) → PasaAConstruccion:bool` y `_aplicar(resultado) → corte/pase`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.corte.evaluar.request` | `onEvaluarRequest` | RPC reflejo: {project_id, veredicto:{veredicto:VIABLE\|NO_VIABLE\|PUENTE, confianza?, motivo?, candidato?}, nicho?} → {project_id, nicho, veredicto, pasa_a_construccion, cortado, decision:CORTADO\|PASA_A_CONSTRUCCION\|PENDIENTE_DECISION, evaluado}. REGLA DURA determinista: NO_VIABLE → pasa_a_construccion=false, cortado=true (CORTADO). VIABLE → pasa=true (control). PUENTE → pendiente (no corta ni avanza solo). Veredicto inválido → error determinista nichos.corte.evaluar.failed. Éxito → publica nichos.corte.aplicado y responde por nichos.corte.evaluar.response. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.corte.aplicado` | Fire-and-forget (C6): el corte/pase quedó aplicado → {project_id, nicho, veredicto, decision:CORTADO\|PASA_A_CONSTRUCCION\|PENDIENTE_DECISION, pasa_a_construccion, cortado, motivo, aplicado}. Lo consume el pipeline-por-nicho (L1): un CORTADO no avanza a construcción (protege F3). |
| `nichos.corte.evaluar.failed` | Par de fallo determinista (C6): el veredicto llegó vacío o sin veredicto → {status, code, mensaje, data}. Cierra el círculo de nichos.corte.evaluar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico. Aquí el único par
> posible es `nichos.corte.evaluar.failed` (veredicto vacío o sin `.veredicto`).

> **Nota: `project.activated` NO está en module.json ni como handler** en index.js — este reflejo
> es stateless y no se subscribe a él (aunque conserva `project_id`).

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo)**:
> ante una excepción inesperada en la evaluación, se responde por el canal de la response con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }`.

## Reglas de negocio

1. **REGLA DURA: NO_VIABLE → CORTADO**: un veredicto `NO_VIABLE` NUNCA avanza a construcción
   (`pasa_a_construccion: false`, `cortado: true`, `decision: 'CORTADO'`). El estado
   `NO_VIABLE -> CONSTRUIDO` es ilegal en la máquina de estados del pipeline.
2. **VIABLE → PASA con control**: `pasa_a_construccion: true`, `cortado: false`,
   `decision: 'PASA_A_CONSTRUCCION'`. Solo los viables entran al tramo caro (los no viables no sangran, protege F3).
3. **PUENTE → PENDIENTE (no decide solo)**: `pasa_a_construccion: null`, `cortado: false`,
   `decision: 'PENDIENTE_DECISION'`. Se sube a decisión humana (D2/K2); ni corta ni avanza solo.
4. **Veredicto inválido/vacío → `400 VEREDICTO_INVALIDO`** + `nichos.corte.evaluar.failed` con
   `{ status:400, code:'VEREDICTO_INVALIDO', mensaje:'el veredicto de viabilidad es obligatorio para evaluar el corte', project_id }`.
   Se dispara si falta `veredicto` o `veredicto.veredicto`.
5. **Función pura**: `_evaluar` decide únicamente por `veredicto.veredicto`; `confianza` (número
   en `[0,1]` o `null`) y `motivo` se propagan tal cual. `nicho` = `nicho` de entrada o
   `veredicto.candidato`.
6. **Sin estado (reflejo stateless)**: `project_id` del request tiene preferencia sobre el de
   contexto; no hay PosPersistencia ni store.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.corte.evaluar.response`:

### 1. `evaluar` — decidir si el veredicto pasa a construcción o se corta

```json
{
  "project_id": "e57a318a-...",
  "veredicto": { "veredicto": "VIABLE", "confianza": 0.8, "motivo": "alcanza umbral_ingresos", "candidato": { "producto": "salsa picante artesanal" } },
  "nicho": { "producto": "salsa picante artesanal" }
}
```
Respuesta `200` + publica `nichos.corte.aplicado`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "nicho": { "producto": "salsa picante artesanal" },
    "veredicto": "VIABLE",
    "confianza": 0.8,
    "motivo": "alcanza umbral_ingresos",
    "pasa_a_construccion": true,
    "cortado": false,
    "decision": "PASA_A_CONSTRUCCION",
    "evaluado": true
  }
}
```
Emite `nichos.corte.aplicado` con `{ ...data, aplicado:true }` (sin `evaluado`).

### Flujo CORTADO — NO_VIABLE nunca pasa

```json
{
  "project_id": "e57a318a-...",
  "veredicto": { "veredicto": "NO_VIABLE", "motivo": "la demanda medida no alcanza el criterio" }
}
```
Respuesta `200` + publica `nichos.corte.aplicado`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "nicho": null,
    "veredicto": "NO_VIABLE",
    "confianza": null,
    "motivo": "la demanda medida no alcanza el criterio",
    "pasa_a_construccion": false,
    "cortado": true,
    "decision": "CORTADO",
    "evaluado": true
  }
}
```

### Flujo PENDIENTE — PUENTE espera decisión humana

```json
{
  "project_id": "e57a318a-...",
  "veredicto": { "veredicto": "PUENTE", "motivo": "sin criterio de viabilidad declarado: no se asume viable" }
}
```
Respuesta `200` + publica `nichos.corte.aplicado` con `data.pasa_a_construccion: null`,
`data.cortado: false`, `data.decision: "PENDIENTE_DECISION"`.

### Fallo — veredicto inválido

```json
{ "project_id": "e57a318a-...", "veredicto": {} }
```
Respuesta `400` + `nichos.corte.evaluar.failed`:
```json
{ "status": 400, "code": "VEREDICTO_INVALIDO", "mensaje": "el veredicto de viabilidad es obligatorio para evaluar el corte", "project_id": "e57a318a-..." }
```

## Tests

El test vive en `tests/unit/corte-temprano.test.js`. Cubre:

- `evaluar` con veredicto `VIABLE` → `200`, `pasa_a_construccion: true`, `decision:'PASA_A_CONSTRUCCION'`; emite `nichos.corte.aplicado`.
- Verdicto `NO_VIABLE` → `200`, `pasa_a_construccion: false`, `cortado: true`, `decision:'CORTADO'`
  (REGLA DURA: nunca pasa a construcción).
- Verdicto `PUENTE` → `200`, `decision:'PENDIENTE_DECISION'`, `pasa_a_construccion: null`
  (ni corta ni avanza solo).
- Veredicto vacío / sin `.veredicto` → `400` + `nichos.corte.evaluar.failed` (`VEREDICTO_INVALIDO`).
- `_aplicar` materializa `nichos.corte.aplicado` con `aplicado: true`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/corte-temprano
node tests/unit/corte-temprano.test.js
```

## Notas de implementación

- Clase `CorteTemprano extends ModuloHibridoReflejo`; `name = 'corte-temprano'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onEvaluarRequest` delega en `_atender(e, 'evaluar', 'nichos.corte.evaluar.response', fn)`:
  si `status===200` → `_aplicar(res.data)` publica `nichos.corte.aplicado`; si no →
  `nichos.corte.evaluar.failed`.
- `_evaluar` es función pura: tres ramas por `veredicto.veredicto` (VIABLE / NO_VIABLE / resto =
  PUENTE); propaga `confianza` (o null) y `motivo`.
- `_aplicar(d)` construye el dominio publicado con `aplicado: true` (sin `evaluado`).
- DEP: consume `nichos.veredicto.emitido` (C3); su salida `nichos.corte.aplicado` la consume
  `pipeline-por-nicho` (L1): un CORTADO no avanza a construcción (protege F3).
