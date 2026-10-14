---
name: ajustador-umbrales
description: >-
  REFLEJO del vertical NICHOS: traduce respuestas de decision en declaraciones
  de ajuste a custodios (criterio-viabilidad, perfil-limite, perfil-supervision).
  Escucha nichos.decision.solicitud.respondida (F7b auto-ajuste) y atiende el
  RPC nichos.umbrales.ajustar. Guarda historial de ajustes por proyecto con
  PosPersistencia. Carga este modulo cuando el sistema necesite propagar un
  ajuste de umbral tras una decision del dueno, o cuando quieras consultar el
  historial de ajustes aplicados.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, ajustador, umbrales, pos-persistencia, bus, mqtt, f7b]
---

# nichos - ajustador-umbrales

> **Que es.** REFLEJO del vertical NICHOS que traduce respuestas de decision
> en declaraciones de ajuste a los custodios pertinentes. Cuando el dueno
> responde una decision, este modulo interpreta la respuesta y propaga los
> cambios a criterio-viabilidad, perfil-limite o perfil-supervision.
>
> Codigo: `modules/nichos/ajustador-umbrales/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **REFLEJO** (JS determinista, con estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/ajustador-umbrales.json` dentro del storage del proyecto.
- Historial: append-only de ajustes aplicados `{ destino, cambio, por_autor, at }`.

## Destinos de ajuste

| Destino | Topic de declaracion | Custodio receptor |
|---|---|---|
| `CRITERIO` | `nichos.criterio.viabilidad.declarar.request` | criterio-viabilidad |
| `PERFIL_LIMITE` | `nichos.perfil.limite.declarar.request` | perfil-limite-busqueda |
| `PERFIL_SUPERVISION` | `nichos.perfil.supervision.declarar.request` | perfil-supervision |

## Eventos que atiende (request - response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.umbrales.ajustar.request` | `onAjustarRequest` | `{status:200, data:{aplicados:[{destino, status}]}}` |

### Payload de `.ajustar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "por_autor": "dueno",
  "respuesta_decision": {
    "ajustes": [
      { "destino": "CRITERIO", "cambio": { "umbral_minimo": 0.7 } },
      { "destino": "PERFIL_LIMITE", "cambio": { "max_candidatos_por_semilla": 30 } }
    ]
  }
}
```

## Senales que escucha (fire-and-forget)

- `nichos.decision.solicitud.respondida` -> `onDecisionRespondida` — F7b: al
  responder una decision, extrae los ajustes y los propaga a los custodios.
- `project.activated` -> `onProjectActivated` — restaura el historial de ajustes
  del proyecto desde PosPersistencia.

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.umbral.ajustado` | tras propagar un ajuste al custodio | `{project_id, destino, cambio, por_autor, timestamp}` |
| `nichos.umbral.ajustado.failed` | destino desconocido o payload invalido | `{project_id, code, message, timestamp}` |

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id` o `respuesta_decision` |
| - | `DESTINO_DESCONOCIDO` | el destino del ajuste no esta en la lista de custodios |

## Integracion (patron RPC del bus)

```javascript
// AJUSTAR UMBRALES
const resp = await bus.publishAndWait('nichos.umbrales.ajustar.request', {
  project_id,
  por_autor: 'dueno',
  respuesta_decision: {
    ajustes: [{ destino: 'CRITERIO', cambio: { umbral_minimo: 0.8 } }]
  }
});
const { aplicados } = resp.data;
```

## Donde encaja en el vertical NICHOS

- **Propagador de ajustes**: puente entre las decisiones del dueno y los custodios
  que guardan la configuracion del vertical. No interpreta la decision (eso lo
  hace el jefe); recibe los ajustes ya resueltos y los entrega a cada custodio.
- **F7b auto-ajuste**: al suscribirse a `nichos.decision.solicitud.respondida`,
  cierra el ciclo de retroalimentacion automatica entre decisiones y configuracion.
