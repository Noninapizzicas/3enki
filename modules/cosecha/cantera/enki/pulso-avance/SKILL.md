---
name: pulso-avance
description: >-
  Skill FULL del módulo REFLEJO STATELESS `pulso-avance` (L5, hoja del plan) de la vertical
  nichos (Radar de Nichos). Progreso del ciclo del nicho por ETAPA → escalón de pulso al
  supervisor: calcula un % de avance determinista (0-100) según la etapa de la máquina
  (SEMILLA→EN_CAJA|SANGRA|CORTADO) y lo traduce a un escalón (informa/urge/cierre) que escala a
  escalones-mensaje (G2) / canal-supervision (G1). Úsala para operar, depurar o extender el
  reflejo, o para entender su contrato de eventos y reglas de negocio (proyección pura
  determinista, etapa por % de avance).
when-to-use: >-
  - Cuando necesites emitir un pulso de avance del ciclo de un nicho al supervisor
    (RPC nichos.pulso.emitir.request) o escalarlo a escalones-mensaje/canal-supervision.
  - Cuando depures por qué una etapa no se reconoce (400 INVALID_INPUT) o no se emite
    nichos.pulso_emitido.
  - Cuando quieras entender el patrón REFLEJO stateless (sin store ni PosPersistencia, proyección
    pura determinista de avance por etapa) y el mapeo etapa → % de avance.
  - Cuando vayas a escribir/ampliar el test unitario del reflejo.
tags: [enki, modulo, reflejo, stateless, nichos, radar, pulso, avance, progreso, escalones, superior, proyecto-3d]
---

# pulso-avance — REFLEJO STATELESS (L5) del avance por etapa del Radar

## Qué hace el módulo

`pulso-avance` es un **REFLEJO STATELESS** (L5): emite el **avance del ciclo del nicho por etapa** —
convierte el estado/etapa en que va la máquina del nicho (SEMILLA → … → EN_CAJA) en un **PROGRESO
determinista (0-100)** y lo traduce a un **escalón de mensaje** que escala a `escalones-mensaje`
(G2) / `canal-supervision` (G1). Es un **consumidor** de `nichos.salud.actualizada` (resultado real
COBRÓ|SANGRA|NEUTRO) y de `nichos.pipeline.avanzado` (etapa).

Cada etapa mapea a un % de avance del ciclo (regla dura, determinista — `PROGRESO_POR_ETAPA`):
`SEMILLA 5 · BUSCADO 15 · VALIDANDO 35 · VALIDADO 55 · CONSTRUIDO 70 · OPERANDO 85 ·
COBRANDO 93 · EN_CAJA 100 · SANGRA 100 · CORTADO 100 · OPERANDO_EN_ESPERA 85`.

Es un **REFLEJO** (patrón real, stateless): **sin store, sin PosPersistencia, cada op entra objeto,
sale objeto** — proyección pura determinista (`_calcularProgreso`, `_emitirEscalon`). Solo registra
en memoria el `project_id` activo (contexto) al recibir `project.activated`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.pulso.emitir.request` | `onEmitirRequest` | RPC puro: {project_id, nicho, etapa} → calcula el % de avance y emite el pulso escalonado. Etapa no reconocida o project_id faltante → error determinista nichos.pulso.emitir.failed. Éxito → publica nichos.pulso_emitido y responde por nichos.pulso.emitir.response. |
| `nichos.pipeline.avanzado` | `onPipelineAvanzado` | Fire-and-forget (pipeline-por-nicho): la máquina avanzó a una etapa → emite pulso de avance al supervisor. Publica nichos.pulso_emitido o nichos.pulso.emitir.failed. |
| `nichos.salud.actualizada` | `onSaludActualizada` | Fire-and-forget (cuadro-salud-financiera): el resultado real del nicho (COBRÓ\|SANGRA\|NEUTRO) → pulso de cierre. Publica nichos.pulso_emitido o nichos.pulso.emitir.failed. |
| `project.activated` | `onProjectActivated` | Reflejo sin estado: solo registra el proyecto activo para enriquecer los pulsos. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.pulso_emitido` | Fire-and-forget (L5): avance del ciclo del nicho → {project_id, nicho, etapa, avance, escalon, prioridad, tipo, cuerpo, emitido}. Lo escala escalones-mensaje (G2) / canal-supervision (G1). |
| `nichos.pulso.emitir.failed` | Par de fallo determinista (L5): la etapa no se reconoce o falta project_id → {status, code, mensaje, data}. Cierra el círculo de nichos.pulso.emitir.request. |

> **Nota (honestidad sobre el código real)**: en `onPipelineAvanzado`, la `etapa` que se pasa a la
> proyección se toma como `d.estado || d.nuevo_estado || d.etapa`; en `onSaludActualizada` se mapea
> el `resultado` a una etapa: `resultado === 'COBRO' → 'EN_CAJA'`, `resultado === 'SANGRA' → 'SANGRA'`,
> si no `'OPERANDO'`, y se añade `resultado_real` al payload. El evento `nichos.pulso_emitido` que
> publica `_emitirEscalon` lleva además `regla:'duro'` en el body real. Documentado tal cual.

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo)**:
> ante una excepción inesperada en la proyección, se responde por el canal de la response con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }`.

## Reglas de negocio

1. **Proyección pura determinista (reflejo)**: `_calcularProgreso` calcula el avance desde la
   etapa; `_emitirEscalon` lo traduce al escalón. La misma entrada → siempre el mismo % y escalón.
   Sin estado, sin red, sin PosPersistencia.
2. **Etapa desconocida → `400 INVALID_INPUT`**: en `_calcularProgreso`, si la etapa (tras
   `toUpperCase()`) no está en `PROGRESO_POR_ETAPA` → `400 INVALID_INPUT` con
   `{ status:400, code:'INVALID_INPUT', mensaje:'etapa del ciclo no reconocida', data:{ etapa } }`.
   El handler publica `nichos.pulso.emitir.failed`.
3. **Falta `project_id` → `400 INVALID_INPUT`**: `_calcularProgreso` usa `project_id || this.project_id`
   (activo); si ambos ausentes → `_invalid('project_id')` (400 + failed).
4. **Escalón del pulso según estado (determinista, `escalonDe`)**: etapa **terminal**
   (`EN_CAJA`|`SANGRA`|`CORTADO`) → `{ escalon:'PULSO', prioridad:1, tipo:'cierre' }`;
   `avance >= 85` → `{ prioridad:2, tipo:'avance' }`; etapa `VALIDANDO`|`CONSTRUIDO` →
   `{ prioridad:1, tipo:'avance' }`; resto → `{ prioridad:0, tipo:'avance' }`. El campo `escalon`
   siempre es `'PULSO'`; la granularidad la da `prioridad` + `tipo`.
5. **Pulso de cierre**: para etapas terminales el pulso **avisa de cierre**, no de avance
   (`terminal: true`), con el `cuerpo` `nicho <nicho> avanza a <etapa> (<avance>% del ciclo)`.
6. **Regla de cierre de círculo**: en `onEmitirRequest`, éxito → publica `nichos.pulso_emitido`;
   fallo → publica `nichos.pulso.emitir.failed`. El RPC responde por `nichos.pulso.emitir.response`;
   los fire-and-forget (`onPipelineAvanzado`, `onSaludActualizada`) solo publican.

## Cómo se usa (RPCs)

RPC que responde en `nichos.pulso.emitir.response`:

### 1. `emitir` — emitir el pulso de avance de un nicho

```json
{ "project_id": "e57a318a-...", "nicho": "salsa-picante", "etapa": "VALIDANDO" }
```
Respuesta `200` + publica `nichos.pulso_emitido`:
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "nicho": "salsa-picante",
    "etapa": "VALIDANDO",
    "avance": 35,
    "escalon": "PULSO",
    "prioridad": 1,
    "tipo": "avance",
    "cuerpo": "nicho salsa-picante avanza a VALIDANDO (35% del ciclo)",
    "regla": "duro",
    "emitido": true
  }
}
```

### Fallo — etapa no reconocida

```json
{ "project_id": "e57a318a-...", "nicho": "x", "etapa": "INEXISTENTE" }
```
Respuesta `400` + `nichos.pulso.emitir.failed`:
```json
{ "status": 400, "code": "INVALID_INPUT", "mensaje": "etapa del ciclo no reconocida", "data": { "etapa": "INEXISTENTE" } }
```

### Fire-and-forget — `nichos.pipeline.avanzado` (pipeline-por-nicho L1)

```json
{ "project_id": "e57a318a-...", "nicho": "salsa-picante", "estado": "VALIDADO" }
```
`onPipelineAvanzado` usa `etapa = 'VALIDADO'` → publica `nichos.pulso_emitido` con `avance:55`.

### Fire-and-forget — `nichos.salud.actualizada` (cuadro-salud-financiera F3)

```json
{ "project_id": "e57a318a-...", "nicho": "salsa-picante", "resultado": "COBRO" }
```
`onSaludActualizada` mapea `resultado:'COBRO' → etapa:'EN_CAJA'` → publica pulso de cierre con
`avance:100`, `tipo:'cierre'`, `terminal:true`, y añade `resultado_real:'COBRO'`.

## Tests

El test vive en `tests/unit/pulso-avance.test.js`. Cubre (del código real):

- `emitir` con etapa reconocida → `200`, `avance` correcto según `PROGRESO_POR_ETAPA`, escalón y
  `emitido:true`, y publica `nichos.pulso_emitido`.
- `emitir` con etapa desconocida → `400 INVALID_INPUT` + `nichos.pulso.emitir.failed`.
- `emitir` sin `project_id` → `400 INVALID_INPUT`.
- Etapa terminal (`EN_CAJA`/`SANGRA`/`CORTADO`) → `avance:100`, `tipo:'cierre'`, `terminal:true`.
- `onPipelineAvanzado` (fire-and-forget) emite pulso de avance por la etapa del evento.
- `onSaludActualizada` (fire-and-forget) mapea `COBRO→EN_CAJA`, `SANGRA→SANGRA`, si no `OPERANDO`.
- `_calcularProgreso`/`toolEmitirEscalon` devuelven el avance y el escalón.

Para ejecutarlo:
```bash
cd /home/admin/3enki/modules/nichos/pulso-avance
node tests/unit/pulso-avance.test.js
```

## Notas de implementación

- Clase `PulsoAvance extends ModuloHibridoReflejo`; `name = 'pulso-avance'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia: `this.project_id` (memoria) activo.
- **Constantes**: `PROGRESO_POR_ETAPA` (etapa → %); `TERMINALES = new Set(['EN_CAJA','SANGRA','CORTADO'])`.
- **Escritura de dominio**: `onEmitirRequest` delega en `_atender(e,'emitir',
  'nichos.pulso.emitir.response',fn)`; `onPipelineAvanzado` y `onSaludActualizada` (fire-and-forget)
  publican `nichos.pulso_emitido`/`nichos.pulso.emitir.failed` sin response.
- Proyecciones puras: `_calcularProgreso`, `_emitirEscalon` y helper `escalonDe`.
- `onUnload` es `return super.onUnload()` (no hay persistencia que volcar).
- Tools: `toolCalcularProgreso(params)`, `toolEmitirEscalon(params)`.
- DEP: escucha `nichos.pipeline.avanzado` (pipeline-por-nicho L1) y `nichos.salud.actualizada`
  (cuadro-salud-financiera F3); emite `nichos.pulso_emitido` que escalan `escalones-mensaje` (G2) /
  `canal-supervision` (G1). Es el L5 del radar de soporte del pipeline.
