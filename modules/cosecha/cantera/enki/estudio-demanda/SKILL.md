---
name: estudio-demanda
description: >-
  MICRO-AGENTE del vertical NICHOS: estudia la demanda de primer orden de un
  candidato a nicho. Consulta fuentes externas por bus
  (nichos.fuente.consumir.request), pre-chequea limites
  (nichos.fuente.limites.puede.consumir.request) y usa ai-gateway
  (llm.complete.request) para sintetizar un informe con demanda de primer
  orden, disposicion a pagar, fuentes usadas y coste imputable. Carga este
  modulo cuando el pipeline del vertical NICHOS necesite evaluar la demanda
  real de un candidato antes del veredicto de viabilidad.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, demanda, estudio, fuentes, llm, bus, mqtt]
---

# nichos · estudio-demanda

> **Que es.** MICRO-AGENTE (sin estado) del vertical NICHOS que estudia la
> demanda de primer orden de un candidato a nicho. Consulta fuentes externas,
> pre-chequea limites de consumo y usa LLM para sintetizar el informe.
>
> Codigo: `modules/nichos/estudio-demanda/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (sin estado, request → fuentes + LLM → response).
- Base: `ModuloHibridoReflejo` (sin PosPersistencia).
- Sin store. Sin persistencia.

## Eventos que atiende (request → response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.demanda.estudiar.request` | `onEstudiarRequest` | `{status:200, data:{informe:{demanda_1er_orden, disposicion_a_pagar, fuentes_usadas[], coste}}}` |

### Payload de `.estudiar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "candidato": {
    "id": "nicho-123",
    "nombre": "comida vegana para mascotas",
    "descripcion": "nicho de alimentacion vegana premium para perros y gatos"
  },
  "correlacion": "corr-abc"
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.estudio.demanda.completado` | estudio completado con exito | `{id_nicho, demanda_1er_orden, disposicion_a_pagar, fuentes_usadas[], coste}` |
| `nichos.estudio.demanda.failed` | el estudio fallo | `{id_nicho, razon_codigo, detalle}` |

## Eventos salientes (RPC a otros modulos)

| Evento | Que pide |
|---|---|
| `nichos.fuente.consumir.request` | datos de fuentes externas sobre el candidato |
| `nichos.fuente.limites.puede.consumir.request` | pre-check de limites de consumo |
| `llm.complete.request` | sintesis del informe via ai-gateway |

## Proyecciones internas

- `_estudiar(input)` — ensambla el informe: pre-check limites → consumir fuentes → LLM sintetiza → agrega coste.
- `_coste(total)` — agrega coste imputable con total redondeado y moneda.

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.demanda.estudiar.request', {
  project_id,
  candidato: { id: 'nicho-123', nombre: 'comida vegana para mascotas' }
});
const { demanda_1er_orden, disposicion_a_pagar, fuentes_usadas, coste } = resp.data.informe;
```

## Donde encaja en el vertical NICHOS

- **Pipeline de evaluacion**: despues de recibir un candidato (semilla refinada),
  el pipeline pide estudio de demanda antes de pasar al veredicto de viabilidad.
- Depende de: `puerto-fuente-datos` (responde a fuente.consumir),
  `gestion-limites-fuente` (responde a fuente.limites.puede.consumir),
  `ai-gateway` (responde a llm.complete).
- Lo consume: `veredicto-viabilidad` (recibe el informe para emitir veredicto).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `candidato` en el request |
| 429 | `LIMITE_ALCANZADO` | los limites de consumo de fuentes estan agotados |
| 502 | `ERROR_ESTUDIO` | fallo del LLM o de las fuentes externas |
