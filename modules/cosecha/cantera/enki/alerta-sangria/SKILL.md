---
name: alerta-sangria
description: >
  Skill FULL del módulo PUENTE (stateless) `alerta-sangria` de la vertical nichos (Radar
  de Nichos). Techo de pérdida (F4): vigila el CUADRO de salud financiera del nicho (F3) y,
  al cruzar el techo de sangría declarado, arma una SolicitudDecision y la entrega al canal
  de supervisión (G1) — el SISTEMA NUNCA mata el proyecto por su cuenta, siempre es caso a
  decidir por el dueño. Stateless: sin store, sin persistencia, cada op entra objeto y sale
  objeto. Publica nichos.alerta.sangria (-> cola-decisiones-gate) + su par determinista.
  Úsala para operar, depurar o extender el puente, o para entender su contrato de eventos y
  sus reglas de negocio.
when-to-use: >
  - Cuando necesites monitorear la sangría de un nicho contra su techo de pérdida
    (RPC nichos.alerta.monitorear.request).
  - Cuando depures por qué una alerta no se evalúa (INVALID_INPUT en sin techo, sin canal,
    sin cuadro o sin proyecto) o cuándo se emite (no) nichos.alerta.sangria.
  - Cuando quieras entender la proyección pura _monitorear/_emitirDecision (CruzaTecho de
    hechos reales) y el contrato de eventos del puente stateless.
  - Cuando vayas a escribir/ampliar el test unitario del módulo.
tags: [enki, modulo, puente, stateless, nichos, radar, sangria, alerta, techo, proyecto-3d]
---

# alerta-sangria — PUENTE (stateless) del techo de pérdida del nicho

## Qué hace el módulo

`alerta-sangria` es un **PUENTE STATELESS** (F4): el **techo de pérdida**. Vigila el **CUADRO de
salud financiera** del nicho (F3) y, **al cruzar el techo de sangría declarado**, arma una
**SolicitudDecision** y la entrega al **canal de supervisión (G1)** — el **SISTEMA NUNCA mata el
proyecto por su cuenta**, siempre es **caso a decidir por el dueño**.

Dos proyecciones puras:
- **`_monitorear`**: evalúa el cuadro contra `techo_perdida_eur` → `CruzaTecho:bool` (de **hechos**:
  la pérdida real del cuadro F3, no de promesas).
- **`_emitirDecision`**: al cruzar, arma la **SolicitudDecision** (estado `PENDIENTE`) y la emite
  por evento → caso a decidir, no mata sola.

Stateless: sin store, sin persistencia, cada op entra objeto y sale objeto. El puente comunica el
techo al exterior (el dueño vía canal-supervision G1), **NO decide**. Publica `nichos.alerta.sangria`
(+ `nichos.alerta.monitorear.failed`).

> **Nota de forma**: aunque es stateless (puente), su `module.json` declara `project.activated` como
> subscribe (y `onProjectActivated` existe) — pero SOLO registra el `project_id` activo en memoria
> (contexto), sin persistencia ni restauración. No es un custodio; no hay PosPersistencia.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.alerta.monitorear.request` | `onMonitorearRequest` | RPC puro: {project_id, cuadro, techo_perdida_eur, canal, pagador?} → {project_id, estado:'PENDIENTE', tipo:'sangria', cuadro, techo_perdida_eur, perdida_eur, cruza_techo, canal, decision_esperada, alertado_en} y, si cruza, además decision:{solicitud_id, ...SolicitudDecision}. CruzaTecho se calcula de hechos (perdida real del cuadro F3 vs techo). Al cruzar emite `nichos.alerta.sangria`; sin techo válido o sin canal → `nichos.alerta.monitorear.failed`. Éxito → responde por `nichos.alerta.monitorear.response`. |
| `project.activated` | `onProjectActivated` | Puente sin estado: registra el `project_id` activo para scope del contexto; no persiste nada. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.alerta.sangria` | Fire-and-forget (F4): el nicho cruzó el techo de pérdida → SolicitudDecision {project_id, tipo:'sangria', estado:'PENDIENTE', perdida_eur, techo_perdida_eur, decision_esperada:'MANTENER_A_PERDIDA\|MATA_PROYECTO', canal, ...}. Caso a decidir: la consume cola-decisiones-gate (K2) y el canal de supervisión (G1) para pedir al dueño. El sistema no mata sola. |
| `nichos.alerta.monitorear.failed` | Par de fallo determinista (F4): el monitoreo de sangría no pudo evaluarse (sin techo válido, sin canal o cuadro inválido) → {status, code, message, data}. Cierra el círculo de `nichos.alerta.monitorear.request`. |

> **Regla de cierre de círculo**: el par `nichos.alerta.monitorear.failed` cierra el círculo de
> `nichos.alerta.monitorear.request`. La alerta `nichos.alerta.sangria` solo se emite cuando
> `cruza_techo === true` — si NO cruza, no hay alerta (ni par de fallo).

> **Nota: los eventos de dominio que emite index.js en `onMonitorearRequest` (nichos.alerta.sangria,
> nichos.alerta.monitorear.failed) coinciden exactamente con los publicados en module.json** — no hay
> sub-declaración en este módulo.

## Reglas de negocio

1. **NUNCA mata el proyecto por su cuenta (ley de dominio)**: el puente solo arma y emite la
   SolicitudDecision; la decisión `MANTENER_A_PERDIDA|MATA_PROYECTO` la toma el **dueño** vía
   canal-supervision (G1) y cola-decisiones-gate (K2). El sistema nunca decide el cierre solo.
2. **CruzaTecho de hechos, no de promesas**: `_monitorear` calcula `perdida = Number(cuadro.perdida_eur
   ?? cuadro.sangria_eur ?? 0)` y `cruza_techo = Number.isFinite(perdida) && perdida >= techo`.
   Es la pérdida REAL del cuadro F3 la que decide, no una proyección.
3. **Techo de pérdida obligatorio → `400 INVALID_INPUT`**: si `techo_perdida_eur` es `null`, no
   finito o `<= 0` → `_invalid('techo_perdida_eur')` + `nichos.alerta.monitorear.failed`. El techo
   viene del contrato/umbría declarado (F0).
4. **Canal obligatorio → `400 INVALID_INPUT`**: si `canal` falta o no es string con trim no vacío →
   `_invalid('canal')` + failed. Sin canal no se puede entregar la solicitud.
5. **Cuadro obligatorio (objeto) → `400 INVALID_INPUT`**: si `cuadro` falta o no es objeto →
   `_invalid('cuadro')` + failed.
6. **`project_id` obligatorio**: si no viene y no hay contexto activo → `_invalid('project_id')`
   + failed.
7. **Solo alerta si cruza**: si `cruza_techo === false`, NO se emite `nichos.alerta.sangria` ni se
   arma `decision` (la data queda sin el campo; `decision` no aparece). Si cruza, se añade
   `decision:{solicitud_id: '<project_id>-sangria-<timestamp>', estado:'PENDIENTE', decision:null,
   entregado_a: canal, ...}`.
8. **SolicitudDecision autocxplicada**: al cruzar, la alerta lleva `tipo:'sangria'`, `estado:'PENDIENTE'`,
   `decision_esperada:'MANTENER_A_PERDIDA|MATA_PROYECTO'`, `alertado_en` ISO y `pagador` normalizado
   (trim) o `null`. Los estados PENDIENTE → RESUELTA|EXPIRADA los gestiona K2.
9. **Puente sin estado**: `project_id` del request tiene preferencia sobre el contexto
   (`this.project_id`); no hay store ni PosPersistencia. `project.activated` solo registra el
   proyecto activo en memoria.
10. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.alerta.monitorear.response`:

### 1. `monitorear` — evaluar la sangría del nicho contra su techo

```json
{
  "project_id": "e57a318a-...",
  "cuadro": { "estado": "SANGRA", "perdida_eur": 400 },
  "techo_perdida_eur": 300,
  "canal": "telegram",
  "pagador": "cliente a",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (cruza):
```json
{
  "project_id": "e57a318a-...",
  "estado": "PENDIENTE",
  "tipo": "sangria",
  "cuadro": { "estado": "SANGRA", "perdida_eur": 400 },
  "techo_perdida_eur": 300,
  "perdida_eur": 400,
  "cruza_techo": true,
  "canal": "telegram",
  "pagador": "cliente a",
  "decision_esperada": "MANTENER_A_PERDIDA|MATA_PROYECTO",
  "alertado_en": "2026-09-25T10:00:00.000Z",
  "decision": {
    "solicitud_id": "e57a318a-...-sangria-1727266800000",
    "project_id": "e57a318a-...",
    "tipo": "sangria",
    "estado": "PENDIENTE",
    "decision_esperada": "MANTENER_A_PERDIDA|MATA_PROYECTO",
    "decision": null,
    "entregado_a": "telegram"
  }
}
```
Emite `nichos.alerta.sangria` (fire-and-forget para cola-decisiones-gate K2 / canal-supervision G1):
```json
{ "project_id": "e57a318a-...", "estado": "PENDIENTE", "tipo": "sangria", "perdida_eur": 400, "techo_perdida_eur": 300, "decision_esperada": "MANTENER_A_PERDIDA|MATA_PROYECTO", "canal": "telegram", "decision": { "...": "..." } }
```
Si NO cruza (`perdida_eur:50 < techo:300`) → `200` con `cruza_techo:false`, sin `decision` y **sin**
emitir `nichos.alerta.sangria`.

### Fallos típicos

- Sin techo válido (`null`/`<=0`) → `400` + `nichos.alerta.monitorear.failed` (`INVALID_INPUT`).
- Sin canal → `400` + failed (`INVALID_INPUT`).
- Sin cuadro → `400` + failed (`INVALID_INPUT`).
- Sin `project_id` ni contexto → `400` + failed (`INVALID_INPUT`).

## Tests

El test vive en `tests/unit/nichos__alerta-sangria.test.js`. Cubre:

- `monitorear` con cuadro que cruza el techo → `200`, `cruza_techo:true`, arma `decision`
  (`estado:'PENDIENTE'`, `decision_esperada:'MANTENER_A_PERDIDA|MATA_PROYECTO'`), publica
  `nichos.alerta.sangria` + `.response` correlado con `request_id`.
- Cuadro bajo techo → `200`, `cruza_techo:false`, `decision` undefined y NO publica la alerta.
- Sin techo válido → `400 INVALID_INPUT` + `nichos.alerta.monitorear.failed`.
- Sin canal → `400 INVALID_INPUT`.
- `project.activated` registra el `project_id`; sin `project_id` explícito usa el contexto
  (con cruce → emite).
- Manifest: subscribes (`monitorear.request` + `project.activated`) ↔ handlers y publishes
  (`sangria` + `monitorear.failed`) exactos de la hoja F4.

Para ejecutarlo (test central del repo):

```bash
cd /home/admin/3enki
node tests/unit/nichos__alerta-sangria.test.js
```

## Notas de implementación

- Clase `AlertaSangria extends ModuloHibridoReflejo`; `name = 'alerta-sangria'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless); `this.project_id` en memoria.
- `onMonitorearRequest` delega en `_atender(e, 'monitorear', 'nichos.alerta.monitorear.response', fn)`;
  si `status !== 200` publica `nichos.alerta.monitorear.failed`; si `cruza_techo` publica
  `nichos.alerta.sangria` con la data (SolicitudDecision).
- `onProjectActivated` es reflejo de contexto: registra `this.project_id` (no persiste).
- Proyecciones puras: `_monitorear` (evalúa CruzaTecho de hechos) y `_emitirDecision` (arma la
  SolicitudDecision PENDIENTE, `solicitud_id` `<project_id>-sangria-<Date.now()>`, `entregado_a` canal).
- Tools: `toolMonitorear` → `_monitorear`, `toolEmitir` → `_emitirDecision`.
- DEP hacia delante: lo consumen cola-decisiones-gate (K2) y canal-supervision (G1); el cuadro
  viene del cuadro-salud-financiera (F3). El sistema nunca mata solo.
