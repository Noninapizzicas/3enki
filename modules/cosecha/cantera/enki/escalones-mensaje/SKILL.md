---
name: escalones-mensaje
description: >-
  REFLEJO del vertical NICHOS (bloque G · comunicación — G2): clasifica cada
  evento de dominio en uno de cuatro escalones de notificación
  (PULSO | ALERTA | DECISION | SILENCIO) según el perfil de supervisión del
  dueño (H2). Determina la urgencia del mensaje antes de que G1 (puerto-canal)
  lo envíe. Carga este módulo cuando el vertical NICHOS necesite decidir la
  urgencia de un evento antes de notificar al dueño.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, escalones, mensaje, clasificador, bloque-g, bus, mqtt, notificacion]
---

# nichos · escalones-mensaje

> **Qué es.** REFLEJO (bloque G, G2) del vertical NICHOS. Clasificador
> determinista que asigna a cada evento de dominio un escalón de notificación
> (PULSO, ALERTA, DECISION, SILENCIO) combinando tabla canónica + perfil de
> supervisión del dueño.
>
> Código: `modules/nichos/escalones-mensaje/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **REFLEJO** puro (JS determinista, sin LLM).
- Base: `ModuloHibridoReflejo`.
- Sin estado persistido — la tabla canónica es constante; el perfil se lee
  por RPC a H2 (perfil-supervision) en cada clasificación.

## Escalones

| Escalón | Semántica | Ejemplo de evento |
|---|---|---|
| `PULSO` | Informativo de fondo (el dueño lo ve cuando quiera) | `nichos.semilla.capturada`, `nichos.cobro.registrado` |
| `ALERTA` | Requiere atención pronto (notificación activa) | `nichos.sangria.alerta.emitida`, `nichos.cobro.failed` |
| `DECISION` | Requiere respuesta del dueño (se encola en K2) | `nichos.decision.solicitud.abierta`, `nichos.gate.operar.abierto` |
| `SILENCIO` | El perfil pide no notificar este tipo | cualquier evento en modo silencioso (excepto DECISION) |

## Eventos

### Atiende (request -> response)

| Evento | Handler | Qué hace |
|---|---|---|
| `nichos.escalon.clasificar.request` | `onClasificarRequest` | Clasifica evento en escalón. Payload: `{evento_dominio:{tipo, fuente?, payload?}, project_id?}` |

### Payload de `.clasificar.request`

```json
{
  "request_id": "uuid",
  "evento_dominio": {
    "tipo": "nichos.sangria.alerta.emitida",
    "fuente": "F4",
    "payload": { "id_proyecto": "prj_xxx", "solicitud_id": "sol_1" }
  },
  "project_id": "prj_xxx",
  "correlation_id": "corr_yyy"
}
```

### Publica al bus

| Evento | Destino | Descripción |
|---|---|---|
| `nichos.perfil.supervision.leer.request` | H2 perfil-supervision | Lee umbrales y preferencias del dueño |

### Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.escalon.clasificado` | tras clasificación | `{evento_ref, escalon: PULSO\|ALERTA\|DECISION\|SILENCIO}` |

## Cuándo se usa

- **Orquestador** clasifica eventos de dominio antes de decidir si notificar
  al dueño.
- **G1 (puerto-canal)** usa el escalón para decidir la urgencia del envío.
- **K2 (cola-decisiones)** recibe los eventos clasificados como DECISION.
- Cualquier módulo que necesite saber la urgencia de un evento para el dueño.

## Integración (patrón RPC del bus)

```javascript
// CLASIFICAR
const resp = await bus.publishAndWait('nichos.escalon.clasificar.request', {
  evento_dominio: { tipo: 'nichos.sangria.alerta.emitida' },
  project_id: 'prj_xxx'
});
const { escalon } = resp.data; // 'ALERTA'
```

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `evento_dominio` o `evento_dominio.tipo` |
