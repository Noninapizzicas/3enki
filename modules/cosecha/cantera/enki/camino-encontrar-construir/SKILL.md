---
name: camino-encontrar-construir
description: >-
  MICRO-AGENTE del vertical NICHOS: decide el camino ENCONTRAR o CONSTRUIR
  para un nicho viable. Cruza informe y veredicto con el catalogo de
  capacidades disponibles (nichos.catalogo.capacidad.disponibles.request).
  Si capacidades existen → ENCONTRAR. Si no → CONSTRUIR. Si ambiguo →
  solicitud de decision al dueno. Carga este modulo cuando el pipeline
  del vertical NICHOS necesite decidir como abordar un nicho ya validado.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: micro-agente
tags: [nichos, micro-agente, camino, encontrar, construir, catalogo, capacidades, bus, mqtt]
---

# nichos · camino-encontrar-construir

> **Que es.** MICRO-AGENTE (sin estado) del vertical NICHOS que decide el
> camino ENCONTRAR (reusar capacidades existentes) o CONSTRUIR (crear nuevas)
> para un nicho cuyo veredicto es VIABLE. Si la situacion es ambigua,
> solicita decision al dueno.
>
> Codigo: `modules/nichos/camino-encontrar-construir/index.js`. La verdad viva
> es el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **MICRO-AGENTE** (sin estado, request → catalogo → decision).
- Base: `ModuloHibridoReflejo` (sin PosPersistencia).
- Sin store. Sin persistencia.

## Eventos que atiende (request → response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.camino.decidir.request` | `onDecidirRequest` | `{status:200, data:{camino:{tipo: ENCONTRAR\|CONSTRUIR}}}` o `{status:200, data:{solicitud_decision:{razon, opciones}}}` |

### Payload de `.decidir.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "informe": {
    "id_nicho": "nicho-123",
    "dominio": "alimentacion-mascotas",
    "demanda_1er_orden": "alta demanda en segmento urbano"
  },
  "veredicto": {
    "decision": "VIABLE",
    "razon": "demanda alta y coste asumible"
  }
}
```

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.camino.decidido` | camino decidido (ENCONTRAR o CONSTRUIR) | `{id_nicho, tipo: ENCONTRAR\|CONSTRUIR}` |
| `nichos.decision.solicitud.abierta` | cobertura parcial — el dueno debe elegir | `{id_nicho, razon, opciones: [ENCONTRAR, CONSTRUIR]}` |

## Eventos salientes (RPC a otros modulos)

| Evento | Que pide |
|---|---|
| `nichos.catalogo.capacidad.disponibles.request` | capacidades existentes que encajan con el informe |

## Proyeccion interna

- `_decidir(input)` — cruza informe y veredicto con catalogo de capacidades:
  cobertura TOTAL/ALTA → ENCONTRAR, NINGUNA → CONSTRUIR, PARCIAL → solicitud
  de decision al dueno.

## Logica de cobertura

| Nivel | Ratio | Resultado |
|---|---|---|
| `TOTAL` | >= 80% requisitos cubiertos | ENCONTRAR |
| `ALTA` | >= 80% requisitos cubiertos | ENCONTRAR |
| `PARCIAL` | 40%-79% requisitos cubiertos | Solicitud de decision al dueno |
| `NINGUNA` | < 40% requisitos cubiertos | CONSTRUIR |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.camino.decidir.request', {
  project_id,
  informe: { id_nicho: 'nicho-123', dominio: 'alimentacion-mascotas' },
  veredicto: { decision: 'VIABLE', razon: 'demanda alta' }
});

if (resp.data.camino) {
  console.log('Camino:', resp.data.camino.tipo); // ENCONTRAR o CONSTRUIR
} else if (resp.data.solicitud_decision) {
  console.log('Ambiguo:', resp.data.solicitud_decision.razon);
}
```

## Donde encaja en el vertical NICHOS

- **Pipeline de evaluacion**: despues de veredicto-viabilidad (solo si VIABLE),
  el pipeline pide decidir el camino. ENCONTRAR lleva a buscar soluciones
  existentes; CONSTRUIR lleva a disenar la solucion desde cero.
- Depende de: `catalogo-capacidades` (responde a catalogo.capacidad.disponibles).
- Lo consume: el pipeline del vertical NICHOS y el jefe (bloque K).
- Cuando emite `nichos.decision.solicitud.abierta`, el sistema espera respuesta
  del dueno (via cola-decisiones / clasificador-intencion).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `informe` o `veredicto` en el request |
| 502 | `ERROR_CAMINO` | fallo al consultar catalogo de capacidades |
