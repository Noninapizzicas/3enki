---
name: clasificador-intencion
description: >-
  MICRO-AGENTE del vertical NICHOS: clasifica cada mensaje entrante del canal
  en 5 intenciones canonicas (SEMILLA, RESPUESTA_DECISION, CONSULTA,
  AJUSTE_CONFIG, DESCONOCIDO) via ai-gateway. Reactivo: escucha
  nichos.canal.mensaje.recibido (F7b) y emite nichos.intencion.clasificada;
  atiende el RPC nichos.intencion.clasificar. Carga este modulo cuando el
  vertical NICHOS necesite interpretar la intencion de un mensaje del dueno
  antes de enrutarlo al subsistema correcto.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, clasificador, intencion, ai-gateway, llm, bus, mqtt]
---

# nichos - clasificador-intencion

> **Que es.** MICRO-AGENTE del vertical NICHOS que clasifica mensajes
> entrantes del canal en 5 intenciones canonicas usando ai-gateway (LLM).
> Sin estado persistido: request puro (mensaje entra, intencion sale).
>
> Codigo: `modules/nichos/clasificador-intencion/index.js`. La verdad viva
> es el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (usa LLM via ai-gateway, sin estado persistido).
- Base: `ModuloHibridoReflejo`.
- Sin store (stateless por diseno).
- LLM: publica `llm.complete.request` y escucha `llm.complete.response`
  correlada por `request_id`.

## 5 intenciones canonicas

| Tipo | Semantica |
|---|---|
| `SEMILLA` | idea nueva de nicho o mercado a explorar |
| `RESPUESTA_DECISION` | respuesta a solicitud pendiente del sistema (aprobacion, rechazo, eleccion) |
| `CONSULTA` | pregunta del dueno sobre estado, datos o funcionamiento |
| `AJUSTE_CONFIG` | peticion de cambio de configuracion, perfil, umbral o parametro |
| `DESCONOCIDO` | no encaja en ninguna de las anteriores |

## Eventos que atiende

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.intencion.clasificar.request` | `onClasificarRequest` | `{status:200, data:{intencion_entrante:{tipo, confianza}}}` |
| `nichos.canal.mensaje.recibido` | `onMensajeRecibido` | fire-and-forget: emite `nichos.intencion.clasificada` |

### Payload de `.clasificar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "mensaje_entrante": "Quiero explorar el nicho de comida para mascotas premium"
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.intencion.clasificada` | tras clasificar un mensaje (RPC o reactivo) | `{project_id, mensaje_ref, tipo, confianza, timestamp}` |
| `nichos.intencion.clasificada.failed` | la clasificacion fallo (LLM error, timeout) | `{project_id, code, message, timestamp}` |

## Integracion (patron RPC del bus)

```javascript
// RPC — clasificar un mensaje
const resp = await bus.publishAndWait('nichos.intencion.clasificar.request', {
  project_id,
  mensaje_entrante: 'Quiero explorar comida premium para mascotas'
});
const { tipo, confianza } = resp.data.intencion_entrante;
// tipo: 'SEMILLA', confianza: 0.95
```

## Donde encaja en el vertical NICHOS

- **Punto de entrada del canal**: todo mensaje del dueno pasa por el
  clasificador antes de enrutarse. El jefe y el pipeline reaccionan al
  pulso `nichos.intencion.clasificada` para decidir que hacer.
- No depende de otro modulo del vertical para arrancar (solo ai-gateway
  para el LLM).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `mensaje_entrante` |
| 502 | `LLM_ERROR` | el LLM no devolvio clasificacion valida o timeout |
