---
name: vista-portafolio
description: >-
  CUSTODIO del vertical NICHOS: snapshot agregado de salud por portafolio.
  Persiste la vista con los proyectos, cuantos generan, cuantos sangran y
  el flujo total. Se recalcula al recibir nichos.salud.recalculada. Carga
  este modulo cuando necesites la foto completa del portafolio de nichos,
  su flujo total o el conteo de proyectos que generan vs sangran.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, portafolio, vista, salud, pos-persistencia, bus, mqtt]
---

# nichos - vista-portafolio

> **Que es.** CUSTODIO del vertical NICHOS. Mantiene un snapshot agregado
> de salud por portafolio: lista de proyectos con su estado y flujo,
> cuantos generan, cuantos sangran y el flujo total.
>
> Codigo: `modules/nichos/vista-portafolio/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **CUSTODIO** (estado persistido, recalculado por eventos).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/vista-portafolio.json` dentro del storage del proyecto.

## Campos del snapshot

| Campo | Tipo | Semantica |
|---|---|---|
| `proyectos` | `Array<{id, estado, flujo}>` | lista de proyectos con su estado de salud y flujo |
| `generan` | `Int` | conteo de proyectos con flujo > 0 |
| `sangran` | `Int` | conteo de proyectos con flujo < 0 |
| `flujo_total` | `Number` | suma de todos los flujos |
| `version` | `Int` | version incremental del snapshot |

## Eventos que atiende (request - response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.portafolio.vista.request` | `onVistaRequest` | `{status:200, data:{vista_portafolio:{proyectos, generan, sangran, flujo_total, version}}}` |

### Payload de `.vista.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "ahora": "2026-10-04T12:00:00Z"
}
```

## Senales que escucha (fire-and-forget)

- `nichos.salud.recalculada` - `onSaludRecalculada` - recalcula la vista al
  recibir nueva salud de un proyecto. Payload esperado: `{project_id, id, estado, flujo}`.
- `project.activated` - `onProjectActivated` - restaura el store del proyecto
  desde `/prisma/pos/nichos/vista-portafolio.json` (PosPersistencia).

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.portafolio.recalculado` | tras recalcular la vista por salud nueva | `{vista, generan, sangran, flujo_total, timestamp}` |

## Invariantes

- **Snapshot coherente**: generan + sangran + neutros = total proyectos.
- **Recalculo reactivo**: la vista se actualiza solo al recibir
  `nichos.salud.recalculada`; no sondea activamente.
- **Degradacion honesta**: sin `project_id` el store queda solo en memoria
  (PosPersistencia no persiste).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id` |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.portafolio.vista.request', {
  project_id: 'prj_xxx'
});
const { proyectos, generan, sangran, flujo_total } = resp.data.vista_portafolio;
```
