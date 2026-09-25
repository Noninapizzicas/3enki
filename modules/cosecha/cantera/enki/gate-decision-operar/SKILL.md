---
name: gate-decision-operar
description: >
  Skill FULL del módulo PUENTE (stateless) `gate-decision-operar` de la vertical nichos
  (Radar de Nichos). Es el gate de operar (E2): el SISTEMA NUNCA decide operar por su cuenta.
  Dado un nicho construido + competencia/modelo/costo/proyeccion, arma el paquete-cerrado
  (nicho + competencia + modelo + costo + proyeccion) y lo entrega al dueño por EVENTO como
  SolicitudDecision (APRUEBA/RECHAZA). No es una reunión síncrona: viaja por el bus y espera
  la decisión vía canal-supervision (G1). Úsala para operar, depurar o extender el puente, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites armar y entregar una SolicitudDecision de operar a un nicho (RPC nichos.gate.solicitar.request).
  - Cuando depures por qué una solicitud de gate falla (NICHO_INVALIDO) o cuándo se arma y no se resuelve.
  - Cuando quieras entender el patrón de puente stateless que enruta al dueño por evento
    (sin resolver la decisión) y su contrato.
  - Cuando vayas a escribir/ampliar el test unitario del puente.
tags: [enki, modulo, puente, stateless, nichos, radar, gate, decision, proyecto-3d]
---

# gate-decision-operar — PUENTE (stateless) del gate de operar

## Qué hace el módulo

`gate-decision-operar` es un **PUENTE STATELESS** (E2): el **gate de operar** — el sitio donde el
sistema **NUNCA decide operar por su cuenta**. Dado un **nicho construido** + el **paquete de
decisión** y la proyección, arma el **paquete-cerrado** (nicho + competencia + modelo + costo +
proyección) y lo **entrega al dueño por EVENTO** como **SolicitudDecision** (`APRUEBA|RECHAZA`).
No es una reunión síncrona: **viaja por el bus y espera la decisión** del dueño vía
canal-supervision (G1).

Una proyección pura (`_armarPaquete`): valida el nicho y consolida la célula de evidencia
(competencia, modelo, costo, proyección) en un paquete-cerrado autocxplicado, y lo enruta hacia
el dueño por evento. **Sin persistencia**: solo enruta/comunica con el exterior; **NUNCA resuelve
la decisión** — la aprueba o rechaza el dueño.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `nichos.gate.solicitar.request` | `onSolicitarRequest` | RPC puro: {project_id, nicho, competencia?, modelo_cobro?, costo?, proyeccion?} → SolicitudDecision (APRUEBA\|RECHAZA). Arma el paquete-cerrado autocxplicado (nicho + competencia + modelo + costo + proyeccion; reflejo: solo lo declarado, nunca fabrica numeros) y enruta la solicitud hacia el dueño. Nicho faltante/invalido → error determinista `nichos.gate.solicitar.failed`. Éxito → publica `nichos.gate.solicitado` y responde por `nichos.gate.solicitar.response`. |

### Publishes

| Evento | Descripción |
|---|---|
| `nichos.gate.solicitado` | Fire-and-forget (E2): el paquete-cerrado de operar fue solicitado al dueño → {project_id, tipo:'gate_operar', estado:'PENDIENTE', nicho, competencia, modelo_cobro, costo, proyeccion, paquete_cerrado, decision_esperada:'APRUEBA\|RECHAZA'}. Lo consume cola-decisiones-gate (K2) y lo entrega el canal-supervision (G1). El sistema NUNCA resuelve por su cuenta. |
| `nichos.gate.solicitar.failed` | Par de fallo determinista (E2): el paquete del gate no pudo armarse (nicho faltante/invalido) → {status, code, mensaje, data}. Cierra el círculo de nichos.gate.solicitar.request. |

> **Regla de cierre de círculo**: el par `nichos.gate.solicitar.failed` cierra el círculo de
> `nichos.gate.solicitar.request`. En éxito se emite `nichos.gate.solicitado` (fire-and-forget de
> dominio) con `decision_esperada:'APRUEBA|RECHAZA'` para el dueño.

> **Nota: los eventos de dominio que emite index.js en `onSolicitarRequest` (nichos.gate.solicitado,
> nichos.gate.solicitar.failed) coinciden exactamente con los publicados en module.json** — no hay
> sub-declaración en este módulo.

## Reglas de negocio

1. **El sistema NUNCA decide operar por su cuenta (ley de dominio)**: `gate-decision-operar` solo
   arma y enruta la SolicitudDecision; la aprueba o rechaza el **dueño** vía canal-supervision (G1).
   Este módulo no persiste la decisión ni la resuelve.
2. **NUNCA fabricar números ausentes**: `_armarPaquete` consolida SOLO lo declarado: si falta
   `competencia` deja `{conclusion_diferenciacion:null}`, si falta `modelo_cobro` deja
   `{modelo:null, precio_sugerido_eur:null}`, y `costo`/`proyeccion` quedan `null`. No inventa cifras.
3. **Nicho obligatorio → `400 NICHO_INVALIDO`**: si `nicho` falta o no es objeto →
   `{ status:400, code:'NICHO_INVALIDO', mensaje:'el nicho es obligatorio para armar el paquete del gate', data:{project_id} }`
   + `nichos.gate.solicitar.failed`.
4. **Paquete-cerrado autocxplicado**: la solicitud SIEMPRE lleva `tipo:'gate_operar'`,
   `estado:'PENDIENTE'`, `decision_esperada:'APRUEBA|RECHAZA'`, `paquete_cerrado:true` y las cuatro
   células de evidencia (nicho, competencia, modelo_cobro, costo, proyeccion). Se marca `solicitado_en`
   con la timestamp ISO del enrutado.
5. **Comunicación asíncrona por el bus**: la solicitación NO es una reunión síncrona; viaja por el
   bus y el dueño decide por evento (no hay espera bloqueante de la parte del puente).
6. **Sin estado**: `project_id` del request tiene preferencia sobre el de contexto; no hay store ni
   PosPersistencia (stateless). Cada op entra objeto, sale objeto.

## Cómo se usa (RPCs)

RPC request/response que responde en `nichos.gate.solicitar.response`:

### 1. `solicitar` — armar el paquete-cerrado de operar y entregarlo al dueño por evento

```json
{
  "project_id": "e57a318a-...",
  "nicho": { "producto": "salsa picante", "audiencia": "restaurantes" },
  "competencia": { "conclusion_diferenciacion": "competencia moderada..." },
  "modelo_cobro": { "modelo": "transaccional", "precio_sugerido_eur": 8.5 },
  "costo": 3.2,
  "proyeccion": { "margen_esperado": 25 }
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "gate_operar",
  "estado": "PENDIENTE",
  "nicho": "salsa picante",
  "competencia": { "conclusion_diferenciacion": "competencia moderada..." },
  "modelo_cobro": { "modelo": "transaccional", "precio_sugerido_eur": 8.5 },
  "costo": 3.2,
  "proyeccion": { "margen_esperado": 25 },
  "paquete_cerrado": true,
  "decision_esperada": "APRUEBA|RECHAZA",
  "solicitado_en": "2026-09-25T10:00:00.000Z"
}
```
Emite `nichos.gate.solicitado` (fire-and-forget para cola-decisiones-gate K2 / canal-supervision G1):
```json
{ "project_id": "e57a318a-...", "tipo": "gate_operar", "estado": "PENDIENTE", "nicho": "salsa picante", "competencia": {...}, "modelo_cobro": {...}, "costo": 3.2, "proyeccion": {...}, "paquete_cerrado": true, "decision_esperada": "APRUEBA|RECHAZA" }
```

### Fallos típicos

- Nicho vacío/no-objeto → `400` + `nichos.gate.solicitar.failed` (`NICHO_INVALIDO`).
- Célula incompleta — NO es fallo; las secciones ausentes quedan `null`/vacíos (solo lo declarado).

## Tests

El test vive en `tests/unit/gate-decision-operar.test.js`. Cubre:

- `solicitar` con nicho y célula → `200`, arma el paquete-cerrado, emite `nichos.gate.solicitado`.
- Nicho vacío → `400 NICHO_INVALIDO` + failed.
- Célula ausente → no fabrica números (`modelo_cobro` → `{modelo:null, precio_sugerido_eur:null}`,
  `costo`/`proyeccion` → null).
- Verifica `tipo:'gate_operar'`, `estado:'PENDIENTE'`, `decision_esperada:'APRUEBA|RECHAZA'`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/nichos/gate-decision-operar
node tests/unit/gate-decision-operar.test.js
```

## Notas de implementación

- Clase `GateDecisionOperar extends ModuloHibridoReflejo`; `name = 'gate-decision-operar'`,
  `version = 'reflejo-0.1.0'`. Sin store ni PosPersistencia (stateless).
- `onSolicitarRequest` delega en `_atender(e, 'solicitar', 'nichos.gate.solicitar.response', fn)`;
  con `status === 200` publica `nichos.gate.solicitado`; si no, `nichos.gate.solicitar.failed`.
- `_armarPaquete` es la proyección pura: valida el nicho (400 NICHO_INVALIDO) y consolida la célula
  de evidencia sin fabricar números ausentes.
- No hace llamadas entrantes/salientes a transporte; solo enruta el paquete-cerrado por el bus.
- Dependencia hacia delante: lo consumen cola-decisiones-gate (K2) y canal-supervision (G1); la
  decisión (APRUEBA/RECHAZA) la toma el dueño, nunca el sistema.
