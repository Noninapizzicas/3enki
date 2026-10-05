---
name: estudio-competencia
description: >-
  MICRO-AGENTE del vertical NICHOS (bloque D): estudia la competencia de una
  solucion propuesta. Consume fuentes externas por bus
  (nichos.fuente.consumir.request, nichos.fuente.limites.puede.consumir.request)
  y usa ai-gateway (llm.complete.request) para sintetizar el panorama
  competitivo y el diferencial. Carga este modulo cuando el pipeline del
  vertical NICHOS necesite evaluar la competencia de una solucion, cuando
  otro modulo quiera reaccionar al PULSO nichos.competencia.estudiada, o
  cuando se necesite entender el panorama competitivo de un nicho.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, competencia, estudio, bloque-d, fuentes, llm, bus, mqtt]
---

# nichos · estudio-competencia

> **Que es.** MICRO-AGENTE (bloque D) del vertical NICHOS. Estudia la
> competencia de una solucion propuesta: consulta fuentes externas por bus
> y usa ai-gateway para sintetizar panorama competitivo + diferencial.
>
> Codigo: `modules/nichos/estudio-competencia/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (sin estado persistido, request -> LLM -> response).
- Base: `ModuloHibridoReflejo`.
- Sin store — micro-agente puro.

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.competencia.estudiar.request` | `onEstudiarRequest` | `{status:200, data:{informe_competencia:{panorama, diferencial, fuentes_usadas[]}}}` |

### Payload de `.estudiar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "solucion": {
    "nombre": "App de gestion de turnos",
    "nicho": "peluquerias",
    "propuesta_valor": "reserva online sin comision"
  }
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.competencia.estudiada` | tras completar el estudio | `{id_proyecto, panorama, diferencial, fuentes_usadas[], timestamp}` |
| `nichos.competencia.estudiada.failed` | el estudio fallo (LLM, fuentes) | `{id_proyecto, code, message, timestamp}` |

## Flujo interno

1. Consulta `nichos.fuente.limites.puede.consumir.request` para verificar permisos.
2. Si puede, consume fuentes via `nichos.fuente.consumir.request` (tipo: competencia).
3. Monta contexto (solucion + datos de fuentes) y pide analisis al LLM.
4. LLM devuelve `{panorama, diferencial}`.
5. Emite pulso `.estudiada` y devuelve response RPC.

## Dependencias por bus

| Evento consumido | Modulo proveedor | Para que |
|---|---|---|
| `nichos.fuente.limites.puede.consumir.request` | gestion-limites-fuente | verificar si puede consumir fuentes |
| `nichos.fuente.consumir.request` | conversor-fuente / puerto-fuente-datos | obtener datos de competencia |
| `llm.complete.request` | ai-gateway | analisis competitivo semantico |

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `solucion` en el request |
| 502 | `LLM_ERROR` | el LLM no devolvio un analisis valido o timeout |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.competencia.estudiar.request', {
  project_id,
  solucion: { nombre: 'Mi App', nicho: 'restaurantes', propuesta_valor: 'pedidos sin comision' }
});
const { panorama, diferencial, fuentes_usadas } = resp.data.informe_competencia;
```

## Donde encaja en el vertical NICHOS

- **Bloque D**: evaluacion de solucion. Se invoca despues de que el pipeline
  tiene una solucion candidata y antes de decidir el modelo de cobro.
- El Jefe (bloque K) puede invocar el estudio para presentar el panorama
  competitivo al dueno antes de una decision.
