---
name: paquetador-decision
description: >-
  MICRO-AGENTE del vertical NICHOS: redacta un paquete de contexto para el
  dueno (narrativa + riesgo + alternativa) via ai-gateway (llm.complete.request).
  Atiende el RPC nichos.paquete.decision.empaquetar y emite el pulso
  nichos.paquete.decision.redactado. Sin estado propio. Carga este modulo cuando
  el sistema necesite preparar un paquete de decision legible para el dueno antes
  de solicitar una decision.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, paquetador, decision, ai-gateway, llm, bus, mqtt]
---

# nichos - paquetador-decision

> **Que es.** MICRO-AGENTE del vertical NICHOS que redacta un paquete de
> contexto para el dueno: narrativa ejecutiva + riesgo principal + alternativa
> viable. Usa ai-gateway para la redaccion semantica.
>
> Codigo: `modules/nichos/paquetador-decision/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (usa LLM via ai-gateway, sin estado persistido).
- Base: `ModuloHibridoReflejo`.
- Sin store: micro-agente puro (request -> LLM -> response).

## Eventos que atiende (request - response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.paquete.decision.empaquetar.request` | `onEmpaquetarRequest` | `{status:200, data:{paquete_contexto:{nicho_id, narrativa, riesgo, alternativa}}}` |

### Payload de `.empaquetar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "nicho_id": "nicho_001",
  "evidencia": "datos de mercado recopilados...",
  "riesgo": "competencia alta en el segmento",
  "alternativa": "pivotar a sub-nicho premium"
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.paquete.decision.redactado` | tras redactar el paquete | `{nicho_id, narrativa, riesgo, alternativa, timestamp}` |
| `nichos.paquete.decision.redactado.failed` | LLM no respondio o payload invalido | `{nicho_id, code, message, timestamp}` |

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `nicho_id` o `evidencia` |
| 502 | `LLM_ERROR` | el LLM no devolvio un paquete valido o timeout |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.paquete.decision.empaquetar.request', {
  project_id,
  nicho_id: 'nicho_001',
  evidencia: 'datos recopilados...',
  riesgo: 'competencia alta',
  alternativa: 'pivotar a sub-nicho premium'
});
const { paquete_contexto } = resp.data;
```

## Donde encaja en el vertical NICHOS

- **Pre-decision**: prepara el contexto legible antes de que solicitud-decision
  presente la pregunta al dueno. El jefe (bloque K) pide el paquete, lo revisa
  y lo adjunta a la solicitud de decision.
- Consulta opcionalmente `nichos.historial.cronologia.request` y
  `nichos.cuadro.salud.estado.request` para enriquecer el contexto.
