---
name: catalogo-capacidades
description: >-
  CUSTODIO del vertical NICHOS (bloque D · construccion): catalogo autorizado
  de lo que el sistema SABE construir. Guarda, por proyecto, las capacidades
  DISPONIBLES (cableadas y listas) y los ENCARGOS pendientes (faltantes que
  alguien pidio crear). Snapshot inmutable por version; escritores autorizados:
  ensamblador (D1) | dueno | constructor. Lectores libres por RPC.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, catalogo, capacidades, bloque-d, construccion, pos-persistencia, bus, mqtt]
---

# nichos · catalogo-capacidades

> **Que es.** CUSTODIO unico (bloque D construccion) del catalogo de
> capacidades del vertical NICHOS. Materializa la invariante F3 "si no
> existe, se crea": cada falta de capacidad se encola como ENCARGO; cuando
> se cubre, pasa a DISPONIBLE. Nada se asume.
>
> Codigo: `modules/nichos/catalogo-capacidades/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **CUSTODIO** (unico escritor autorizado, estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/catalogo-capacidades.json` dentro del storage del proyecto.
- Autores autorizados: `ensamblador` | `dueno` | `constructor` (regla F3).
- Factory: toda falta nace como EncargoCapacidad; `promover()` es la unica
  puerta por la que un encargo se convierte en disponible.

## Campos del Store

| Campo | Tipo | Semantica |
|---|---|---|
| `version` | `Int` | contador monotono de cambios al catalogo |
| `disponibles` | `Array<{id, descripcion, cableada_por, cableada_en, meta?}>` | capacidades listas para ensamblar |
| `encargos` | `Array<{id, descripcion, encargada_por, encargada_en, estado, meta?}>` | capacidades faltantes pendientes de cablear |
| `por_autor` | `Array<{version, autor, op, capacidad_id, at}>` | historial de escritura con version |

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.catalogo.capacidad.disponibles.request` | `onDisponiblesRequest` | `{status:200, data:{capacidades:[{id, descripcion, cableada_por, cableada_en, meta}]}}` |
| `nichos.catalogo.capacidad.encargar.request` | `onEncargarRequest` | `{status:200, data:{encargo:{id, descripcion, encargada_por, encargada_en, estado}}}` o `{status:403, error}` si autor no autorizado |
| `nichos.catalogo.capacidad.promover.request` | `onPromoverRequest` | `{status:200, data:{estado_catalogo:{version, disponibles[], encargos[]}}}` o `{status:404, error}` si no encargada |

### Payload de `.encargar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "por_autor": "ensamblador",
  "capacidad": {
    "id": "capacidad-123",
    "descripcion": "texto que describe la capacidad faltante",
    "meta": {}
  }
}
```

Idempotente por `capacidad.id`: si la capacidad ya existe (disponible o encargada), devuelve el estado vigente sin duplicar.

## Senales que escucha (fire-and-forget)

- `project.activated` -> `onProjectActivated` — restaura el catalogo persistido
  del proyecto desde `/prisma/pos/nichos/catalogo-capacidades.json` (PosPersistencia).

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.catalogo.capacidad.encargada` | tras crear un encargo nuevo | `{project_id, capacidad_id, descripcion, encargada_por, timestamp}` |
| `nichos.catalogo.capacidad.disponible` | tras promover un encargo a DISPONIBLE | `{project_id, capacidad_id, descripcion, promovida_por, timestamp}` |

## Invariantes

- **Autores autorizados**: solo `ensamblador`, `dueno` o `constructor` mutan el
  store. Otro autor -> 403 `PERMISSION_DENIED`.
- **Idempotencia por id**: encargar la misma capacidad dos veces devuelve el
  encargo vigente sin duplicar.
- **Inmutabilidad por version**: cada escritura incrementa `version` y queda
  registrada en `por_autor[]`.
- **Degradacion honesta**: sin `project_id` el store queda solo en memoria
  (PosPersistencia no persiste).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`, `por_autor`, `capacidad` o `capacidad.id` |
| 403 | `PERMISSION_DENIED` | `por_autor` no es `ensamblador`/`dueno`/`constructor` |
| 404 | `CAPACIDAD_NO_ENCARGADA` | promover una capacidad que no estaba encargada |

## Integracion (patron RPC del bus)

```javascript
// LEER DISPONIBLES
const resp = await bus.publishAndWait('nichos.catalogo.capacidad.disponibles.request', {
  project_id
});
const { capacidades } = resp.data;

// ENCARGAR UNA CAPACIDAD FALTANTE
await bus.publishAndWait('nichos.catalogo.capacidad.encargar.request', {
  project_id,
  por_autor: 'ensamblador',
  capacidad: { id: 'mi-capacidad', descripcion: 'lo que falta' }
});

// PROMOVER A DISPONIBLE
await bus.publishAndWait('nichos.catalogo.capacidad.promover.request', {
  project_id,
  por_autor: 'constructor',
  capacidad: { id: 'mi-capacidad' }
});
```

## Donde encaja en el vertical NICHOS

- **Bloque D — construccion**: el ensamblador-solucion (D1) consulta el catalogo
  antes de ensamblar; si le falta una capacidad, la encarga. Cuando alguien la
  cablea, la promueve a DISPONIBLE y el ensamblador reintenta.
- **El Jefe (bloque K)** puede consultar `.disponibles.request` para ver que
  sabe hacer el sistema en un proyecto dado.
- No depende de otro modulo del vertical para arrancar (solo `project.activated`
  del core). Es raiz del grafo de construccion.
