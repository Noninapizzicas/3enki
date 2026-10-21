---
name: proponedor-modelo-cobro
description: >-
  MICRO-AGENTE del vertical NICHOS (bloque D): propone un modelo de cobro
  para un nicho. Consulta la plantilla de cobro base por bus
  (nichos.perfil.cobro.plantilla.request) y usa ai-gateway
  (llm.complete.request) para ajustar la plantilla al nicho y la solucion
  concretos. Carga este modulo cuando el pipeline del vertical NICHOS
  necesite un modelo de cobro para una solucion, cuando otro modulo quiera
  reaccionar al PULSO nichos.modelo.cobro.propuesto, o cuando se necesite
  proponer monetizacion para un nicho.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, cobro, modelo, bloque-d, plantilla, llm, bus, mqtt]
---

# nichos · proponedor-modelo-cobro

> **Que es.** MICRO-AGENTE (bloque D) del vertical NICHOS. Propone un modelo
> de cobro para un nicho: consulta la plantilla base de cobro por bus y usa
> ai-gateway para ajustarla al nicho y la solucion concretos.
>
> Codigo: `modules/nichos/proponedor-modelo-cobro/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (sin estado persistido, request -> plantilla -> LLM -> response).
- Base: `ModuloHibridoReflejo`.
- Sin store — micro-agente puro.

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.modelo.cobro.proponer.request` | `onProponerRequest` | `{status:200, data:{modelo_cobro:{tipo, precio_sugerido, frecuencia, justificacion, variantes[]}}}` |

### Payload de `.proponer.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "id_nicho": "nicho_peluquerias",
  "solucion": {
    "nombre": "App de gestion de turnos",
    "propuesta_valor": "reserva online sin comision"
  }
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.modelo.cobro.propuesto` | tras completar la propuesta | `{id_proyecto, modelo, timestamp}` |
| `nichos.modelo.cobro.propuesto.failed` | la propuesta fallo (LLM, plantilla) | `{id_proyecto, code, message, timestamp}` |

## Flujo interno

1. Consulta `nichos.perfil.cobro.plantilla.request` para obtener plantilla base.
2. Monta contexto (nicho + solucion + plantilla) y pide ajuste al LLM.
3. LLM devuelve `{tipo, precio_sugerido, frecuencia, justificacion, variantes[]}`.
4. Emite pulso `.propuesto` y devuelve response RPC.

## Dependencias por bus

| Evento consumido | Modulo proveedor | Para que |
|---|---|---|
| `nichos.perfil.cobro.plantilla.request` | perfil-cobro-entrega | obtener la plantilla base de cobro |
| `llm.complete.request` | ai-gateway | ajuste de plantilla al nicho |

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `id_nicho` o `solucion` en el request |
| 502 | `LLM_ERROR` | el LLM no devolvio un modelo de cobro valido o timeout |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.modelo.cobro.proponer.request', {
  project_id,
  id_nicho: 'nicho_peluquerias',
  solucion: { nombre: 'Mi App', propuesta_valor: 'reserva sin comision' }
});
const modelo = resp.data.modelo_cobro;
// modelo.tipo => 'suscripcion'
// modelo.precio_sugerido => '9.99-19.99 EUR/mes'
```

## Donde encaja en el vertical NICHOS

- **Bloque D**: evaluacion de solucion. Se invoca despues de validar la
  solucion y antes de presentar la propuesta completa al dueno.
- El Jefe (bloque K) usa esta propuesta junto con el estudio de competencia
  para armar la decision final sobre el nicho.
