---
name: reglas-aprendidas
description: >
  Skill FULL del módulo MICRO-AGENTE (fuzzy) `reglas-aprendidas` de la vertical
  nichos (Radar de Nichos, proyecto 3D). Es el bucle de APRENDIZAJE: afina el
  umbral de validación con resultados REALES — cada proyecto que cobra o sangra
  recalibra el criterio. Consume nichos.salud.actualizada (GENERA/SANGRA/NEUTRO)
  y nichos.cobro_registrado, compara el umbral contra el resultado real (juicio
  fuzzy con fallback reflejo determinista) y emite el umbral refinado a
  criterio-viabilidad (C2) en caliente. Úsala para operar, depurar o extender el
  micro-agente, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites recalibrar el umbral de validación de un proyecto con su
    resultado real (RPC nichos.reglas.recalibrar.request).
  - Cuando depures por qué un delta no se calcula (RESULTADO_INTERPRETABLE si el
    resultado no es COBRO/SANGRA/NEUTRO, SIN_DELTA si ni el LLM ni el reflejo
    producen delta) o cuándo cae al fallback reflejo determinista.
  - Cuando quieras entender el patrón híbrido reflejo+fuzzy del aprendizaje
    (comparar con llm.complete + recalibrar con reglas de factor fijo) y su contrato.
  - Cuando vayas a escribir/ampliar el test unitario del micro-agente.
tags: [enki, modulo, micro-agente, fuzzy, nichos, radar, reglas, aprendizaje, proyecto-3d]
---

# reglas-aprendidas — MICRO-AGENTE (fuzzy) que aprende del resultado real

## Qué hace el módulo

`reglas-aprendidas` es un **MICRO-AGENTE HÍBRIDO** (C7, hoja del plan): el que
**aprende del resultado real**. **AFINA el umbral de validación** de la vertical:
cada proyecto que cobra o sangra **RECALIBRA** el criterio. Es el bucle
resultados-reales → validador: la "experiencia" se vuelve un embudo auto-afinado
**gobernado por dato real, no intuición**.

Consume `nichos.cobro_registrado` (F1) y `nichos.salud.actualizada` (F3) y emite a
**criterio-viabilidad (C2)** el umbral refinado vía `nichos.umbral.recalibrado`.

Cuatro mitades (patrón real de `normalizacion-semilla` + `estudio-demanda`):

- **FUZZY** (`_calcularDelta`): juicio LLM. Un guion-prompt self-contained
  (`GUION_CALCULAR_DELTA`) + el umbral vigente/resultado real → `llm.complete.request`
  → **Delta** de ajuste (mueve `umbral_ingresos`/`minimos`).
- **REFLEJO** (`_calcularDeltaReflejo`): reglas de aprendizaje puras
  (COBRÓ sube/afirma, SANGRA baja, NEUTRO neutro, factor `+10 / -15 / 0`) — fallback
  si el LLM falla o no cumple el contrato.
- **REFLEJO** (`_recalibrarUmbral`): fusiona el delta sobre el umbral vigente →
  `UmbralRefinado` (nunca baja de `0`).

**NUNCA inventa**: si no hay resultado real interpretable → par de fallo honesto.
Sin store, sin custodio (aunque mantiene `_umbrales` en memoria como semilla del
juicio; el store real es C2).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.reglas.recalibrar.request` | `onRecalibrarRequest` | RPC micro-agente: {project_id, umbral, resultados_real:'COBRÓ'\|'SANGRA'\|'NEUTRO', metricas?} → {project_id, delta, umbral_refinado, recelibrado}. Compara el umbral con el resultado real, calcula el delta (juicio) y emite el umbral refinado a C2 via `nichos.umbral.recalibrado`. Si el payload es inválido → `nichos.reglas.recalibrar.failed`. |
| `nichos.salud.actualizada` | `onSaludActualizada` | Fire-and-forget (C7): cuadro-salud-financiera (F3) publica {project_id, estado:'GENERA'\|'SANGRA'\|'NEUTRO', ingresos, coste_total}. Aprende del resultado real (mapea a COBRÓ/SANGRA/NEUTRO), calcula el delta y publica `nichos.umbral.recalibrado` hacia C2 si tiene un umbral vigente. |
| `nichos.cobro_registrado` | `onCobroRegistrado` | Fire-and-forget (C7): registro-cobros (F1) asentó un cobro EFECTIVO → {project_id, cobro}. Confirma un COBRÓ real; calcula el delta (aprendizaje positivo) y publica `nichos.umbral.recalibrado` hacia C2. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.umbral.recalibrado` | Fire-and-forget (C7→C2): umbral refinado por resultado real → {project_id, delta, resultado_real, umbral_refinado}. Lo consume criterio-viabilidad (C2) para recalibrar en caliente; el siguiente lote de C1/C3 evalúa contra el umbral refinado (embudo auto-afinado gobernado por dato real). |
| `nichos.reglas.recalibrar.failed` | Par de fallo determinista (C7): payload inválido o sin resultado interpretable → {status, code, message, data}. Cierra el círculo de `nichos.reglas.recalibrar.request`. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `nichos.reglas.recalibrar.failed` cierra `nichos.reglas.recalibrar.request`
> cuando `_recalibrar` devuelve status ≠ 200 (INVALID_INPUT, RESULTADO_INTERPRETABLE
> o SIN_DELTA).

> **Nota: no está en module.json pero sí lo escucha index.js en `onProjectActivated`
> (líneas 55-61)**: el micro-agente registra el `project_id` activo y, si el evento
> trae `umbral`, guarda ese umbral vigente en `this._umbrales` (respondiendo
> `200 {project_id}`). Es sub-declaración de module.json: el índice sí escucha
> `project.activated` pero el manifest no lo lista como subscribe.

## Reglas de negocio

1. **Resultado interpretable → `400 RESULTADO_INTERPRETABLE`**: `resultados_real`
   (upper) debe ser `COBRO`, `SANGRA` o `NEUTRO`. Si no →
   `{ status:400, code:'RESULTADO_INTERPRETABLE', mensaje:'resultado real \'<r>\' no interpretable', project_id }`
   + `nichos.reglas.recalibrar.failed`.
2. **Sin delta → `502 SIN_DELTA`**: si ni el juicio fuzzy ni el fallback reflejo
   producen un delta → `{ status:502, code:'SIN_DELTA', mensaje:'el juicio no pudo calcular un delta de ajuste', project_id }`
   + failed.
3. **Fallback reflejo por reglas (no romper el aprendizaje)**: si el LLM no
   devuelve un delta válido, `_calcularDeltaReflejo` usa el factor fijo por resultado
   (`FACTOR_DELTA = { COBRO: +10, SANGRA: -15, NEUTRO: 0 }`). Cuando hay dato de
   `importe`/`ingresos` positivo, escala relativa: `ajuste = round(importe * 0.02 *
   sign(base))`, acotado a `[-50, 50]`. Sin dato y con `base === 0` (NEUTRO), usa
   `base` si el umbral previo es finito.
4. **Solo el cobro EFECTIVO es aprendizaje real**: `onCobroRegistrado` ignora
   cobros `COMPROMETIDO` (son promesa, no caja) — solo el `EFECTIVO` dispara
   recalibración con `confianza: 0.8`.
5. **Acote del delta (no romper el embudo)**: `_validarDelta` descarta deltas
   con todos los campos a `0` (no ajuste) y **acota** `umbral_ingresos` a
   `[-50, 50]`. `_recalibrarUmbral` **nunca baja de 0** (`Math.max(0, ...)`) en
   `umbral_ingresos` ni en los `minimos_demanda`.
6. **Umbral refinado etiquetado**: `_recalibrarUmbral` devuelve
   `{ project_id, umbral_ingresos, minimos_demanda:{ numero_busquedas, contactos_semana },
   recalibrado_por:'SISTEMA_C7', resultado_real, updated_at }`.
7. **HTTP exacto**: éxito `200`; sin `project_id` → `400 INVALID_INPUT project_id`;
   resultado no interpretable → `400`; juicio sin delta → `502`; excepción en
   `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.reglas.recalibrar.response`:

### 1. `recalibrar` — afinar el umbral con el resultado real

```json
{
  "project_id": "e57a318a-...",
  "umbral": { "umbral_ingresos": 500, "minimos_demanda": { "numero_busquedas": 30, "contactos_semana": 8 } },
  "resultados_real": "COBRO",
  "metricas": { "ingresos": 650, "confianza": 0.8 }
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "delta": { "umbral_ingresos": 10 },
  "resultado_real": "COBRO",
  "umbral_refinado": { "project_id": "e57a318a-...", "umbral_ingresos": 510, "minimos_demanda": { "numero_busquedas": 30, "contactos_semana": 8 }, "recalibrado_por": "SISTEMA_C7", "resultado_real": "COBRO", "updated_at": "2026-09-25T..." },
  "recelibrado": true
}
```
Emite `nichos.umbral.recalibrado` con ese mismo `data`.

### Fallo — resultado no interpretable

```json
{ "project_id": "e57a318a-...", "umbral": null, "resultados_real": "quizas", "metricas": {} }
```
Respuesta `400` + `nichos.reglas.recalibrar.failed`:
```json
{ "status": 400, "code": "RESULTADO_INTERPRETABLE", "mensaje": "resultado real 'quizas' no interpretable", "project_id": "e57a318a-..." }
```

## Tests

El test vive en `tests/unit/reglas-aprendidas.test.js`. Cubre:

- `recalibrar` con `resultados_real` COBRO/SANGRA/NEUTRO → `200`, calcula delta
  (fuzzy o fallback reflejo), fusiona el umbral y emite `nichos.umbral.recalibrado`.
- Resultado no interpretable → `400 RESULTADO_INTERPRETABLE` + failed.
- Si el LLM falla/incumple contrato → fallback `_calcularDeltaReflejo` (factor fijo).
- Ni LLM ni reflejo producen delta → `502 SIN_DELTA` + failed.
- `onCobroRegistrado` ignora cobros COMPROMETIDO; solo EFECTIVO recalibra.
- `onSaludActualizada` mapea GENERA→COBRO, SANGRA→SANGRA, NEUTRO→NEUTRO y aprende.
- `_recalibrarUmbral` nunca baja de 0 (umbrales y mínimos).

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/reglas-aprendidas
node tests/unit/reglas-aprendidas.test.js
```

## Notas de implementación

- Clase `ReglasAprendidas extends ModuloHibridoReflejo`; `name = 'reglas-aprendidas'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia; `this._umbrales`
  (Map project_id → umbral, semilla del juicio) y `this.project_id` en memoria.
- `GUION_CALCULAR_DELTA`: guion-prompt self-contained que exige JSON
  `{"delta":{"umbral_ingresos":<n o null>,"minimos_demanda":{"numero_busquedas":<n o null>,"contactos_semana":<n o null>}},"confianza":<0-1>}`
  con deltas pequeños (máx ±20 EUR o ±2% mínimos) y signo según resultado COBRO+/SANGRA-/NEUTRO 0.
- `_calcularDelta` hace 1 llamada `this._rpc('llm.complete.request', ...)` headless
  (`system=GUION`, `temperature: 0.2`, `timeout_ms: 30000`, `tools: []`). `_parse`
  tolera fences ```json; `_validarDelta` descarta sin ajuste y acota `[-50,50]`.
- `_recalibrar` es la operación maestra (juicio → delta → `_recalibrarUmbral`).
- `onRecalibrarRequest` delega en `_atender(e, 'recalibrar',
  'nichos.reglas.recalibrar.response', fn)` y publica `nichos.umbral.recalibrado`
  en 200 o `nichos.reglas.recalibrar.failed` si no. `_dispararRecalibracion` hace el
  mismo fire-and-forget desde los handlers de evento.
- `_mapearResultado`: `GENERA→COBRO`, `SANGRA→SANGRA`, resto→`NEUTRO`.
- Tools: `toolRecalibrar` → `_recalibrar`, `toolCalcularDeltaReflejo` →
  `_calcularDeltaReflejo`.
- DEP hacia delante: emite a criterio-viabilidad (C2) vía `nichos.umbral.recalibrado`;
  consume `nichos.salud.actualizada` (F3) y `nichos.cobro_registrado` (F1).
