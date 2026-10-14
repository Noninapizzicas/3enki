---
name: veredicto-viabilidad
description: >-
  MICRO-AGENTE del vertical NICHOS: emite veredicto de viabilidad
  (VIABLE, NO_VIABLE o PUENTE) sobre un informe de nicho. Consulta el
  criterio de viabilidad vigente (nichos.criterio.viabilidad.leer.request)
  y usa ai-gateway (llm.complete.request) para evaluar el informe contra
  el criterio. Carga este modulo cuando el pipeline del vertical NICHOS
  necesite un veredicto sobre si un nicho merece inversion, descarte o
  mas investigacion.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, veredicto, viabilidad, criterio, llm, bus, mqtt]
---

# nichos · veredicto-viabilidad

> **Que es.** MICRO-AGENTE (sin estado) del vertical NICHOS que emite un
> veredicto de viabilidad — VIABLE, NO_VIABLE o PUENTE — evaluando un
> informe de nicho contra el criterio de viabilidad vigente via LLM.
>
> Codigo: `modules/nichos/veredicto-viabilidad/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (sin estado, request → criterio + LLM → response).
- Base: `ModuloHibridoReflejo` (sin PosPersistencia).
- Sin store. Sin persistencia.

## Eventos que atiende (request → response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.veredicto.emitir.request` | `onEmitirRequest` | `{status:200, data:{veredicto:{decision: VIABLE\|NO_VIABLE\|PUENTE, razon, criterio_aplicado}}}` |

### Payload de `.emitir.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "informe": {
    "id_nicho": "nicho-123",
    "demanda_1er_orden": "alta demanda en segmento urbano 25-40",
    "disposicion_a_pagar": "media",
    "fuentes_usadas": ["google-trends", "crawl4rs"],
    "coste": { "total": 0.35, "moneda": "EUR" }
  }
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.veredicto.emitido` | veredicto emitido con exito | `{id_nicho, decision, razon}` |

## Eventos salientes (RPC a otros modulos)

| Evento | Que pide |
|---|---|
| `nichos.criterio.viabilidad.leer.request` | el criterio de viabilidad vigente |
| `llm.complete.request` | evaluacion del informe contra criterio via ai-gateway |

## Proyeccion interna

- `_emitir(input)` — aplica criterio: lee criterio vigente → LLM evalua informe contra criterio → emite VIABLE, NO_VIABLE o PUENTE.

## Decisiones validas

| Decision | Semantica |
|---|---|
| `VIABLE` | el nicho cumple el criterio y merece inversion |
| `NO_VIABLE` | el nicho no cumple el criterio; descartar |
| `PUENTE` | datos insuficientes o ambiguos; requiere mas investigacion |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.veredicto.emitir.request', {
  project_id,
  informe: {
    id_nicho: 'nicho-123',
    demanda_1er_orden: 'alta demanda en segmento urbano',
    disposicion_a_pagar: 'media',
    fuentes_usadas: ['google-trends'],
    coste: { total: 0.15, moneda: 'EUR' }
  }
});
const { decision, razon, criterio_aplicado } = resp.data.veredicto;
```

## Donde encaja en el vertical NICHOS

- **Pipeline de evaluacion**: despues de estudio-demanda y estudio-competencia,
  el pipeline pide veredicto de viabilidad. Si VIABLE → pasa a camino-encontrar-construir.
  Si PUENTE → requiere mas datos. Si NO_VIABLE → descarte.
- Depende de: `criterio-viabilidad` (responde a criterio.viabilidad.leer),
  `ai-gateway` (responde a llm.complete).
- Lo consume: `camino-encontrar-construir` (recibe el veredicto para decidir camino).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `informe` en el request |
| 502 | `ERROR_VEREDICTO` | fallo del LLM o del criterio |
