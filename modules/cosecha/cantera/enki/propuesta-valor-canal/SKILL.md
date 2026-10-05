---
name: propuesta-valor-canal
description: >-
  MICRO-AGENTE del vertical NICHOS: redacta una propuesta de valor (tono + gancho)
  adecuada al canal destino (email, whatsapp, landing, redes...) via ai-gateway
  (llm.complete.request). Atiende el RPC nichos.propuesta.valor.redactar y emite
  el pulso nichos.propuesta.valor.redactada. Sin estado propio. Carga este modulo
  cuando el sistema necesite adaptar la comunicacion de un nicho al canal por
  donde se va a contactar al publico objetivo.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, propuesta-valor, canal, ai-gateway, llm, bus, mqtt]
---

# nichos - propuesta-valor-canal

> **Que es.** MICRO-AGENTE del vertical NICHOS que redacta una propuesta de
> valor adaptada al canal destino. Dado un nicho, su panorama y un canal
> (email, whatsapp, landing, redes...), genera el tono comunicativo y el
> gancho de entrada adecuados.
>
> Codigo: `modules/nichos/propuesta-valor-canal/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (usa LLM via ai-gateway, sin estado persistido).
- Base: `ModuloHibridoReflejo`.
- Sin store: micro-agente puro (request -> LLM -> response).

## Eventos que atiende (request - response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.propuesta.valor.redactar.request` | `onRedactarRequest` | `{status:200, data:{propuesta_valor:{canal, tono, gancho}}}` |

### Payload de `.redactar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "nicho": "accesorios para mascotas premium",
  "panorama": "mercado en crecimiento, competencia media",
  "canal": "whatsapp"
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.propuesta.valor.redactada` | tras redactar la propuesta | `{id_proyecto, canal, tono, gancho, timestamp}` |
| `nichos.propuesta.valor.redactada.failed` | LLM no respondio o payload invalido | `{id_proyecto, code, message, timestamp}` |

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `nicho` o `canal` |
| 502 | `LLM_ERROR` | el LLM no devolvio una propuesta valida o timeout |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.propuesta.valor.redactar.request', {
  project_id,
  nicho: 'accesorios para mascotas premium',
  panorama: 'mercado en crecimiento, competencia media',
  canal: 'whatsapp'
});
const { propuesta_valor } = resp.data;
// propuesta_valor.tono → "Cercano y directo, con emojis moderados..."
// propuesta_valor.gancho → "Hola! Tu mascota merece lo mejor..."
```

## Donde encaja en el vertical NICHOS

- **Adaptador de comunicacion**: el pipeline de contenido del vertical le pide
  la propuesta de valor antes de generar el primer mensaje para un canal nuevo.
- El jefe (bloque K) o el generador de contenido llama al RPC cuando va a
  abrir comunicacion con el publico objetivo de un nicho por un canal concreto.
