---
name: pipeline-por-nicho
description: >-
  Skill FULL del módulo CUSTODIO / ORQUESTADOR `pipeline-por-nicho` (L1, hoja del plan · último)
  de la vertical nichos (Radar de Nichos). LA MÁQUINA DE ESTADOS semilla→caja por nicho: es el
  DUEÑO del estado de cada nicho (un único escritor del agregado Nicho), consume eventos de dominio
  ajenos y aplica transiciones validadas. Úsala para operar, depurar o extender el orquestador, o
  para entender su contrato de eventos, PosPersistencia, la máquina de estados y sus reglas de
  negocio (transición ilegal imposible, corte DURO C6, gate RECHAZA).
when-to-use: >-
  - Cuando necesites registrar una semilla en la máquina (RPC nichos.pipeline.registrar_semilla.request),
    avanzar manualmente un nicho (RPC nichos.pipeline.avanzar.request), orquestar la etapa del scheduler
    (toolOrquestarEtapa) o leer el estado de un nicho (toolVer).
  - Cuando depures por qué una transición fue rechazada (422 PRECONDITION_FAILED transición ilegal,
    409 CONFLICT_STATE estado terminal, 404 RESOURCE_NOT_FOUND nicho no registrado, 400 input inválido).
  - Cuando entiendas el patrón CUSTODIO/ORQUESTADOR con PosPersistencia (project.activated +
    snapshot/hidratar + storage /prisma/nichos/pipeline-por-nicho.json) y la máquina de estados
    SEMILLA→BUSCADO→VALIDANDO→VALIDADO→CONSTRUIDO→OPERANDO→COBRANDO→EN_CAJA|SANGRA (+CORTADO,
    OPERANDO_EN_ESPERA).
  - Cuando vayas a escribir/ampliar el test unitario del orquestador.
tags: [enki, modulo, custodio, orquestador, persistencia, nichos, radar, pipeline, maquina, estados, semilla, caja, proyecto-3d]
---

# pipeline-por-nicho — CUSTODIO / ORQUESTADOR (L1) · LA MÁQUINA DE ESTADOS semilla→caja del Radar

## Qué hace el módulo

`pipeline-por-nicho` es el **CUSTODIO / ORQUESTADOR (L1)** — la **MÁQUINA DE ESTADOS semilla→caja**
de la vertical nichos. Es el **DUEÑO del estado de cada nicho** (un único escritor del agregado
Nicho): **ningún otro módulo muta el estado del nicho**. Consume eventos de dominio ajenos (semilla
capturada, normalizada, sondeada, estudiada, veredicto, camino, solución ensamblada, modelo de cobro,
paquete, gate, cobro, salud) y aplica las **transiciones validadas** contra la tabla de la máquina.

Los **ESTADOS** (sección 4 del plan):
`SEMILLA → BUSCADO → VALIDANDO → VALIDADO → CONSTRUIDO → OPERANDO → COBRANDO → EN_CAJA | SANGRA`;
más **`CORTADO`** (corte DURO determinista C6) y **`OPERANDO_EN_ESPERA`** (gate RECHAZA → re-pregunta).

La **REGLA DE ILEGALIDAD (determinista)**: las transiciones se validan contra la MÁQUINA. Una
transición no declarada (p.ej. saltar de VALIDANDO a CONSTRUIDO sin pasar por VALIDADO, o
NO_VIABLE → CONSTRUIDO) se **RECHAZA** con el par de fallo `nichos.pipeline.avanzar.failed`
(422 PRECONDITION_FAILED). **Estado ilegal imposible.**

Es un **CUSTODIO real** (patrón de `/criterio-viabilidad`): **persiste por proyecto con
PosPersistencia** (storage `/prisma/nichos/pipeline-por-nicho.json`), **restaura la máquina en
`project.activated`** y vuelca en `onUnload`. El scheduler (REUTILIZAR) dispara el ciclo vía la guía
de orquestación de etapa (`_orquestarEtapa`).

## Máquina de estados (del index.js real)

Estados canónicos (ASCII): `SEMILLA · BUSCADO · VALIDANDO · VALIDADO · CONSTRUIDO · OPERANDO ·
OPERANDO_EN_ESPERA · COBRANDO · EN_CAJA · SANGRA · CORTADO`. Terminales: `EN_CAJA · SANGRA · CORTADO`.

Tabla de transiciones (`TRANSICIONES`, `estado_origen → [ [tipo_evento, predicado] → estado_destino ]`):

| Desde | Evento de dominio | Predicado | Hacia |
|---|---|---|---|
| SEMILLA | `semilla.capturada` | — | BUSCADO |
| SEMILLA | `semilla.normalizada` | — | BUSCADO |
| BUSCADO | `territorio.sondeado` | — | VALIDANDO |
| BUSCADO | `candidato.encontrado` | — | VALIDANDO |
| (BUSCADO) | `semilla.normalizada` | — | (BUSCADO, permanece) |
| VALIDANDO | `estudio.medido` | — | (VALIDANDO, permanece) |
| VALIDANDO | `veredicto.emitido` | `veredicto != NO_VIABLE` | VALIDADO |
| VALIDANDO | `veredicto.emitido` | `veredicto == NO_VIABLE` | **CORTADO** (corte DURO C6) |
| VALIDANDO | `corte.aplicado` | — | CORTADO |
| VALIDADO | `camino.decidido` | — | CONSTRUIDO |
| VALIDADO | `corte.aplicado` | — | CORTADO |
| CONSTRUIDO | `solucion.construida` | — | OPERANDO |
| OPERANDO | `gate.aprobado` | — | COBRANDO |
| OPERANDO | `gate.rechazado` | — | OPERANDO_EN_ESPERA |
| OPERANDO | `gate.solicitado` | `decision == APRUEBA` | COBRANDO |
| OPERANDO | `gate.solicitado` | `decision != APRUEBA` | OPERANDO_EN_ESPERA |
| OPERANDO_EN_ESPERA | `gate.aprobado` | — | COBRANDO |
| OPERANDO_EN_ESPERA | `gate.solicitado` | `decision == APRUEBA` | COBRANDO |
| OPERANDO_EN_ESPERA | `gate.solicitado` | `decision != APRUEBA` | OPERANDO_EN_ESPERA |
| COBRANDO | `cobro.ejecutado` | `tipo != COMPROMETIDO` (EFECTIVO) | EN_CAJA |
| COBRANDO | `cobro.ejecutado` | `tipo == COMPROMETIDO` | (COBRANDO, permanece) |
| COBRANDO | `cobro_registrado` | — | EN_CAJA |
| COBRANDO | `salud.actualizada` | `resultado == SANGRA` | SANGRA |
| COBRANDO | `salud.actualizada` | `resultado == COBRO` | EN_CAJA |
| COBRANDO | `salud.actualizada` | `resultado == NEUTRO` | (COBRANDO, permanece) |

**Diagrama de flujo** (semilla → caja):

```text
                    ┌───────────────┐  semilla.capturada      ┌──────────┐
    registrar ──▶  │   SEMILLA     │  o semilla.normalizada  │  BUSCADO │
                    └───────────────┘ ─────────────────────▶ └──────────┘
                                                                 │ territorio.sondeado
                                                                 │ o candidato.encontrado
                                                                 ▼
        (permanece) ──┴── estudio.medido ──┬──▶ ┌────────────┐   │
                                            │     │ VALIDANDO │  ◀──┘
                                            │     └──────┬─────┘
                                            │        veredicto == NO_VIABLE
                                            │              └───────────▶ ┌────────┐
                                            │  veredicto != NO_VIABLE     │CORTADO │ (terminal)
                                            │              ────────────▶ └────────┘
                                            ▼              ▼  corte.aplicado
                                        ┌──────────┐  camino.decidido  ┌────────────┐
                                        │ VALIDADO │ ────────────────▶ │ CONSTRUIDO │
                                        └──────────┘                  └──────┬─────┘
                                            │ corte.aplicado        solucion.construida
                                            └───────────▶ ┌────────┐          │
                                                          │CORTADO │◀─────────▼
                                                          └────────┘       ┌──────────┐
                                                            gate.aprobado   │ OPERANDO │
                                                          ───────────────▶ └────┬─────┘
                                                            gate.rechazado/       │ gate.aprobado / gate.solicitado APRUEBA
                                                            gate.solicitado !=APR│ ────────────────▶ ┌────────────┐
                                                                                  │                   │ COBRANDO   │
                                                                                  ▼                   └─────┬───────┘
                                                                            ┌──────────────────┐           │ cobro.ejecutado EFECTIVO
                                                                            │ OPERANDO_EN_ESPERA│           │ o cobro_registrado / salud COBRO
                                                                            │  (gate RECHAZA)  │◀─────────  │
                                                                            └──────────────────┘   ┌───────┴────────┐
                                                                                 │ gate.aprobado  │ EN_CAJA (term.) │
                                                                                 └──────────────▶ │ SANGRA (term.)  │
                                                                                                  └────────────────┘
```

**Transiciones terminales** publican además `nichos.pipeline.ciclo_completado`.

**Guía de orquestación de etapa** (`_orquestarEtapa`, qué RPC toca según el estado para el scheduler):
SEMILLA→`normalizacion-semilla.normalizar` · BUSCADO→`sondeo-territorio.sondear` ·
VALIDANDO→`veredicto-viabilidad.evaluar` · VALIDADO→`camino-encontrar-construir.decidir` ·
CONSTRUIDO→`ensamblador-solucion.construir` · OPERANDO→`gate-decision-operar.solicitar` ·
OPERANDO_EN_ESPERA→`gate-decision-operar.solicitar` · COBRANDO→`motor-cobro.ejecutar` ·
EN_CAJA/SANGRA/CORTADO→`'CICLO_COMPLETADO'`.

El tipo de evento se normaliza desde el nombre completo (`tipoDeEvento`): quita el prefijo
`nichos.` y el sufijo `.failed`. Los eventos tempranos `semilla.capturada`/`semilla.normalizada`
**auto-crean** el nicho en SEMILLA si no estaba registrado y luego aplican la transición.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.pipeline.registrar_semilla.request` | `onRegistrarSemillaRequest` | RPC: {project_id, nicho} → registra la semilla en la máquina (estado SEMILLA) y publica nichos.pipeline.ciclo_iniciado. Nicho o project_id faltante → nichos.pipeline.avanzar.failed. Responde por nichos.pipeline.registrar_semilla.response. |
| `nichos.pipeline.avanzar.request` | `onAvanzarRequest` | RPC: {project_id, nicho, tipo_evento, payload} → aplica la transición validada de la máquina. Transición ilegal → rechazada con par de fallo. Éxito → nichos.pipeline.avanzado y responde por nichos.pipeline.avanzar.response. |
| `nichos.semilla.capturada` | `onSemillaCapturada` | Fire-and-forget (captura-semilla A1): SEMILLA→BUSCADO. Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.semilla.normalizada` | `onSemillaNormalizada` | Fire-and-forget (normalizacion-semilla A2): asegura SEMILLA→BUSCADO. Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.territorio.sondeado` | `onTerritorioSondeado` | Fire-and-forget (sondeo-territorio B1): BUSCADO→VALIDANDO. Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.candidato.encontrado` | `onCandidatoEncontrado` | Fire-and-forget (sondeo-territorio B1): BUSCADO→VALIDANDO. Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.estudio.medido` | `onEstudioMedido` | Fire-and-forget (estudio-demanda C1): permanece en VALIDANDO (embudo). Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.veredicto.emitido` | `onVeredictoEmitido` | Fire-and-forget (veredicto-viabilidad C3): VALIDANDO→VALIDADO si VIABLE\|PUENTE; VALIDANDO→CORTADO si NO_VIABLE (corte DURO C6). Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.corte.aplicado` | `onCorteAplicado` | Fire-and-forget (corte-temprano C6): VALIDANDO\|VALIDADO→CORTADO. Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.camino.decidido` | `onCaminoDecidido` | Fire-and-forget (camino-encontrar-construir C4): VALIDADO→CONSTRUIDO. Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.solucion.construida` | `onSolucionConstruida` | Fire-and-forget (ensamblador-solucion D1): CONSTRUIDO→OPERANDO. Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.modelo_cobro.propuesto` | `onModeloCobroPropuesto` | Fire-and-forget (proponedor-modelo-cobro D4): modelo propuesto, no muta estado (alimenta el paquete del gate). Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.cobro.ejecutado` | `onCobroEjecutado` | Fire-and-forget (motor-cobro E3): COBRANDO→EN_CAJA si EFECTIVO; permanece COBRANDO si COMPROMETIDO. Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.cobro_registrado` | `onCobroRegistrado` | Fire-and-forget (registro-cobros F1): COBRANDO→EN_CAJA. Publica nichos.pipeline.avanzado o par de fallo. |
| `nichos.salud.actualizada` | `onSaludActualizada` | Fire-and-forget (cuadro-salud-financiera F3): COBRANDO→SANGRA si resultado SANGRA; EN_CAJA si COBRO. Publica nichos.pipeline.avanzado, ciclo_completado o par de fallo. |
| `project.activated` | `onProjectActivated` | Custodio: restaura la máquina del proyecto activado via PosPersistencia. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.pipeline.ciclo_iniciado` | Fire-and-forget (L1): una semilla entró a la máquina (SEMILLA) → {project_id, nicho, estado:'SEMILLA'}. Lo consume pulso-avance (L5) y cola-candidatos (L2). |
| `nichos.pipeline.avanzado` | Fire-and-forget (L1): el nicho avanzó de etapa por un evento de dominio → {project_id, nicho, estado, nuevo_estado, evento, transicion_valida}. Lo consume pulso-avance (L5). |
| `nichos.pipeline.ciclo_completado` | Fire-and-forget (L1): el ciclo del nicho llegó a estado terminal (EN_CAJA\|SANGRA\|CORTADO) → {project_id, nicho, nuevo_estado, ciclo_completado:true}. Alimenta cuadro-salud (F3) / vista-portafolio (K1). |
| `nichos.pipeline.avanzar.failed` | Par de fallo determinista (L1): transición ilegal (estado ilegal imposible) o input inválido → {status, code, mensaje, data}. Cierra el círculo de todas las publicaciones del pipeline. |

> **Nota (honestidad sobre el código real)**: el evento `nichos.pipeline.ciclo_iniciado` que index.js
> publica en `onRegistrarSemillaRequest` (línea 166) lleva `correlation_id` del request además del
> shape de module.json; el `nichos.pipeline.ciclo_completado` que `_aplicarTransicion` publica en
> línea 301 es el **mismo data** que `nichos.pipeline.avanzado` (incluye también `estado`, `evento`,
> `transicion_valida`), solo que cuando el destino es terminal se publica en paralelo. Documentado.

> **Nota (honestidad sobre el código real)**: module.json declara para `nichos.pipeline.avanzar.failed`
> que "cierra el círculo de todas las publicaciones del pipeline". En `_consumir`
> (consumidores fire-and-forget) **todos** los fallos (transición ilegal, estado terminal, nicho no
> registrado, input inválido) se publican por ese **único par genérico** `nichos.pipeline.avanzar.failed`
> — igual que las transiciones ilegales del RPC `avanzar`. Confirmado en código.

> **Nota: no está en module.json pero sí lo emite `_atender` (modulo-hibrido-reflejo)**:
> ante una excepción inesperada en la proyección, se responde por el canal de la response con
> `{ status: 500, code: 'UNKNOWN_ERROR', mensaje: err.message }`.

> **Nota: no está en module.json pero sí existen como tools en index.js**: `toolVer(nicho_id,
> project_id)` (lectura del estado/historial) y `toolOrquestarEtapa(nicho_id)` (guía del scheduler)
> son helpers del módulo no expuestos como evento. Documentados en "Cómo se usa".

## Reglas de negocio

1. **LA MÁQUINA es la ley (transición ilegal imposible)**: `_aplicarTransicion` recorre
   `TRANSICIONES[st.estado]` buscando UNA regla que matchee (tipo `+` predicado). Si ninguna matchea
   → **`422 PRECONDITION_FAILED`** con
   `{ status:422, code:'PRECONDITION_FAILED', mensaje:'transicion ilegal: <estado> --(<tipo>)--> no es valida (estado ilegal imposible)', data:{ estado, evento:tipo, nicho } }` + `nichos.pipeline.avanzar.failed`. **No hay salto de etapa.**
2. **Corte DURO C6 (determinista)**: `veredicto.emitido` con `veredicto == 'NO_VIABLE'` → VALIDANDO
   a **CORTADO**; VIABLE|PUENTE → VALIDADO. `corte.aplicado` (corte-temprano) también lleva
   VALIDANDO|VALIDADO a CORTADO. CORTADO es **terminal** (`_condicionExtra` valida que el veredicto
   sea NO_VIABLE | VIABLE | PUENTE).
3. **Gate E2 → re-pregunta**: `gate.rechazado` o `gate.solicitado` con `decision != 'APRUEBA'` →
   **OPERANDO_EN_ESPERA** (no terminal, espera re-aprobación); `gate.aprobado`/`gate.solicitado`
   `decision == APRUEBA` → **COBRANDO** tanto desde OPERANDO como desde OPERANDO_EN_ESPERA.
4. **Cobro / salud**: `cobro.ejecutado` EFECTIVO (`tipo != 'COMPROMETIDO'`) → EN_CAJA (E3),
   COMPROMETIDO permanece COBRANDO. `cobro_registrado` → EN_CAJA (F1). `salud.actualizada` →
   SANGRA si `resultado == 'SANGRA'`, EN_CAJA si `'COBRO'`, COBRANDO si `'NEUTRO'` (F3).
5. **Auto-crear semilla (eventos tempranos)**: en `_transicion`, si el nicho no está registrado y el
   tipo es `semilla.capturada`/`semilla.normalizada`, se **auto-crea** en SEMILLA y aplica; si no
   está registrado para cualquier otro evento → `404 RESOURCE_NOT_FOUND` ('nicho no registrado en la
   máquina; registra la semilla').
6. **Estado terminal → `409 CONFLICT_STATE`**: si `st.estado` es terminal (EN_CAJA/SANGRA/CORTADO)
   no hay más transiciones → `{ status:409, code:'CONFLICT_STATE', mensaje:'el nicho ya esta en estado
   terminal <estado>', data:{ estado } }` + `avanzar.failed`.
7. **Input inválido → `400 INVALID_INPUT`**: `_registrarSemilla` exige `project_id` y `nicho`/`nicho_id`;
   `_avanzar` exige `project_id`, `nicho` y `tipo_evento` (o `evento`). Sin `project_id`/`nicho` se
   usa el activo (`this.project_id`) en `_consumir`; en los RPC son obligatorios.
8. **Registro idempotente**: `_registrarSemilla` si el nicho ya existe **reusa** el estado
   (`reusado:true`) sin mutarlo — no pisa un nicho en marcha.
9. **Regla de cierre de círculo**: en `onRegistrarSemillaRequest`/`onAvanzarRequest`,
   `onRegistrarSemillaRequest` éxito → publica `nichos.pipeline.ciclo_iniciado`; error → `avanzar.failed`.
   En `onAvanzarRequest` y `_consumir` (fire-and-forget), éxito → `nichos.pipeline.avanzado`
   (y `ciclo_completado` si terminal); fallo → `nichos.pipeline.avanzar.failed`. Todo se persiste con
   `_persist.marcarDirty(pid)`.

## Cómo se usa (RPCs)

RPCs que responden en `nichos.pipeline.registrar_semilla.response` y `nichos.pipeline.avanzar.response`:

### 1. `registrar-semilla` — registrar una semilla en la máquina (crea el nicho en SEMILLA)

```json
{ "project_id": "e57a318a-...", "nicho": "salsa-picante-artesanal" }
```
Respuesta `200` (nuevo) + publica `nichos.pipeline.ciclo_iniciado`:
```json
{ "status": 200, "data": { "project_id": "e57a318a-...", "nicho": "salsa-picante-artesanal", "estado": "SEMILLA", "reusado": false } }
```
Respuesta `200` (reuso si ya existe): `{ ..., "estado": "<vigente>", "reusado": true }`.

### 2. `avanzar` — avanzar manualmente la máquina (test / orquestación)

```json
{ "project_id": "e57a318a-...", "nicho": "salsa-picante-artesanal", "tipo_evento": "veredicto.emitido", "payload": { "veredicto": "VIABLE" } }
```
Respuesta `200` + publica `nichos.pipeline.avanzado` (desde VALIDANDO):
```json
{
  "status": 200,
  "data": {
    "project_id": "e57a318a-...",
    "nicho": "salsa-picante-artesanal",
    "estado": "VALIDANDO",
    "nuevo_estado": "VALIDADO",
    "evento": "veredicto.emitido",
    "transicion_valida": true,
    "ciclo_completado": false
  }
}
```

### Fallo — transición ilegal (estado ilegal imposible)

```json
{ "project_id": "e57a318a-...", "nicho": "x", "tipo_evento": "solucion.construida", "payload": {} }
```
(desde VALIDANDO, sin pasar por VALIDADO) Respuesta `422` + `nichos.pipeline.avanzar.failed`:
```json
{ "status": 422, "code": "PRECONDITION_FAILED", "mensaje": "transicion ilegal: VALIDANDO --(solucion.construida)--> no es valida (estado ilegal imposible)", "data": { "estado": "VALIDANDO", "evento": "solucion.construida", "nicho": "x" } }
```

### Fallo — nicho no registrado / estado terminal

```json
{ "project_id": "e57a318a-...", "nicho": "nuevo", "tipo_evento": "gate.aprobado", "payload": {} }
```
Respuesta `404` + `avanzar.failed`:
```json
{ "status": 404, "code": "RESOURCE_NOT_FOUND", "mensaje": "nicho no registrado en la máquina; registra la semilla", "data": { "nicho": "nuevo" } }
```
Si ya está en EN_CAJA → `409 CONFLICT_STATE` ("el nicho ya esta en estado terminal EN_CAJA").

### Tools de lectura / orquestación (no RPC, helpers reales)

- **`toolVer(nicho_id, project_id)`** → `{ project_id, nicho, estado, etapa_actual, historial }`
  (historial de transiciones: `[{de, a, evento, en}]`). `404` si el nicho no está en la máquina.
- **`toolOrquestarEtapa(nicho_id)`** → `{ project_id, nicho, estado, etapa_siguiente }` donde
  `etapa_siguiente` = el RPC que toca según el estado (guía del scheduler; `'CICLO_COMPLETADO'` en
  estados terminales).

### Fire-and-forget de dominio

Todos los `on<X>` de dominio (semilla.capturada, semilla.normalizada, territorio.sondeado,
candidato.encontrado, estudio.medido, veredicto.emitido, corte.aplicado, camino.decidido,
solucion.construida, modelo_cobro.propuesto, cobro.ejecutado, cobro_registrado, salud.actualizada)
delegan en `_consumir(e, '<nombreEvento>')`, que extrae `project_id || this.project_id` y
`d.nicho || d.nicho_id`, normaliza el tipo, aplica la transición y publica `nichos.pipeline.avanzado`
(o `avanzar.failed`; y `ciclo_completado` si llega a terminal).

## Tests

El test vive en `tests/unit/pipeline-por-nicho.test.js`. Cubre (del código real):

- `registrar-semilla` crea el nicho en SEMILLA y publica `nichos.pipeline.ciclo_iniciado`; reuso si existe.
- `avanzar` aplica la transición válida (p.ej. veredicto VIABLE → VALIDADO) y publica
  `nichos.pipeline.avanzado`.
- Transición ilegal (saltar etapa / NO_VIABLE→CONSTRUIDO) → `422 PRECONDITION_FAILED` + `avanzar.failed`.
- Corte DURO: `veredicto.emitido` NO_VIABLE → CORTADO; `corte.aplicado` (VALIDANDO/VALIDADO) → CORTADO.
- Gate: `gate.aprobado`/`gate.solicitado` APRUEBA → COBRANDO; `gate.rechazado`/`gate.solicitado`
  != APRUEBA → OPERANDO_EN_ESPERA.
- Cobro/salud: `cobro.ejecutado` EFECTIVO → EN_CAJA, COMPROMETIDO permanece; `cobro_registrado` → EN_CAJA;
  `salud.actualizada` SANGRA → SANGRA, COBRO → EN_CAJA, NEUTRO permanece COBRANDO.
- Auto-crear semilla en eventos tempranos; `404 RESOURCE_NOT_FOUND` para otros eventos sin registro.
- Estado terminal → `409 CONFLICT_STATE`.
- Input inválido (sin project_id/nicho/tipo_evento) → `400 INVALID_INPUT` + `avanzar.failed`.
- Todos los fire-and-forget delegan en `_consumir` y publican `avanzado`/`avanzar.failed`/
  `ciclo_completado`.
- PosPersistencia: `project.activated` restaura la máquina; `onUnload` vuelca; `_persist.marcarDirty`
  en cada transición.

Para ejecutarlo:
```bash
cd /home/admin/3enki/modules/nichos/pipeline-por-nicho
node tests/unit/pipeline-por-nicho.test.js
```

## Notas de implementación

- Clase `PipelinePorNicho extends ModuloHibridoReflejo`; `name = 'pipeline-por-nicho'`,
  `version = 'reflejo-0.1.0'`. Store en memoria: `this._nichos = new Map()` (project_id →
  Map(nicho_id → objeto estado)); `this.project_id` (activo).
- **PosPersistencia**: `this._persist = new PosPersistencia({ modulo:this, file:'pipeline-por-nicho.json',
  dir:'/prisma/nichos', snapshot, hidratar })`. `onProjectActivated` → `this._persist.restaurar(this.project_id)`;
  `onUnload` → `flush()` + `detener()`. Cada transición llama `this._persist.marcarDirty(pid)`.
- **Estado del nicho** (`nichoVacio`): `{ project_id, nicho, estado:'SEMILLA', etapa_actual:'SEMILLA',
  historial:[], creado_en, actualizado_en }`. `_aplicarTransicion` pusha `{de, a, evento, en}` al historial.
- **Tabla de estados**: `ESTADOS` (constante) + `TERMINALES` Set; `TRANSICIONES` (origen → reglas).
  `_condicionExtra` refina los predicados con datos del payload (veredicto/gate/cobro/salud).
- `tipoDeEvento` normaliza el tipo desde el nombre completo (quita `nichos.` y `.failed`).
- **Escritura de dominio**: todos los `on<X>` son de UNA línea (delegan a `_atender` para los RPC,
  a `_consumir` para los fire-and-forget). Un único orquestador `_transicion`/`_aplicarTransicion`.
- Proyecciones: `_registrarSemilla`, `_avanzar`, `_transicion`, `_aplicarTransicion`, `_orquestarEtapa`,
  `_ver`, `_condicionExtra`, `_mapaDe`, `tipoDeEvento`.
- Tools: `toolAvanzar`, `toolRegistrarSemilla`, `toolOrquestarEtapa`, `toolVer`.
- DEP: el orquestador CIERRA el ciclo L1 → L5. Publica `nichos.pipeline.avanzado` que consume
  `pulso-avance` (L5); `ciclo_iniciado` consume `pulso-avance` y `cola-candidatos` (L2);
  `ciclo_completado` alimenta `cuadro-salud-financiera` (F3) / `vista-portafolio` (K1). Los consumidores
  de dominio son las hojas A1→F3 nombradas en el contrato. Es el orquestador semilla→caja que cierra
  la vertical nichos (última hoja del plan).
