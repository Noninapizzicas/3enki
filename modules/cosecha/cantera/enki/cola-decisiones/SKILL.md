---
name: cola-decisiones
description: >-
  CUSTODIO del vertical NICHOS: cola de solicitudes de decision pendientes
  por proyecto. Encola, lista por dueno/vencimiento, cierra con respuesta y
  barre caducadas via scheduler. Persiste el array de solicitudes con estado
  ABIERTA|RESPONDIDA|CADUCADA. Carga este modulo cuando el jefe (K) necesite
  encolar decisiones para el dueno, listar pendientes o cerrar una decision
  con la opcion elegida.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, cola, decisiones, scheduler, pos-persistencia, bus, mqtt]
---

# nichos - cola-decisiones

> **Que es.** CUSTODIO del vertical NICHOS. Cola de solicitudes de decision
> pendientes por proyecto. Encola solicitudes con opciones y caducidad, las
> lista por dueno/vencimiento, las cierra con la opcion elegida y barre
> caducadas periodicamente via scheduler.
>
> Codigo: `modules/nichos/cola-decisiones/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **CUSTODIO** (estado persistido, multiples RPCs).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/cola-decisiones.json` dentro del storage del proyecto.

## Campos de una solicitud

| Campo | Tipo | Semantica |
|---|---|---|
| `id` | `String` | identificador unico generado al encolar |
| `tipo` | `String` | tipo de decision (p.ej. `pivote`, `inversion`, `abandono`) |
| `contexto` | `Object\|null` | datos de contexto para la decision |
| `opciones` | `Array<String>` | opciones disponibles para el dueno |
| `caducidad` | `String\|null` | ISO timestamp limite para responder |
| `estado` | `ABIERTA\|RESPONDIDA\|CADUCADA` | estado actual de la solicitud |
| `dueno` | `String\|null` | a quien va dirigida la decision |
| `respuesta` | `Object\|null` | `{opcion_elegida, dueno, nota_libre, cerrada_at}` si respondida |

## Eventos que atiende (request - response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.cola.decisiones.encolar.request` | `onEncolarRequest` | `{status:200, data:{encolada:true, solicitud_id}}` |
| `nichos.cola.decisiones.siguientes.request` | `onSiguientesRequest` | `{status:200, data:{solicitudes[]}}` |
| `nichos.cola.decisiones.cerrar.request` | `onCerrarRequest` | `{status:200, data:{cerrada:true, solicitud_id}}` |

### Payload de `.encolar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "solicitud_decision": {
    "tipo": "pivote",
    "contexto": { "nicho": "nicho_abc", "razon": "sangria prolongada" },
    "opciones": ["pivotar", "mantener", "abandonar"],
    "caducidad": "2026-10-05T12:00:00Z",
    "dueno": "admin"
  }
}
```

### Payload de `.siguientes.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "dueno": "admin"
}
```

`dueno` es opcional; sin el, devuelve todas las abiertas ordenadas por caducidad.

### Payload de `.cerrar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "solicitud_id": "dec_xxx",
  "respuesta": "pivotar",
  "dueno": "admin",
  "nota_libre": "El mercado ha cambiado"
}
```

## Senales que escucha (fire-and-forget)

- `scheduler.job.triggered` - `onSchedulerTriggered` - barre solicitudes
  caducadas (solo reacciona a `job_name === 'nichos.cola-decisiones.barrer'`).
- `project.activated` - `onProjectActivated` - restaura el store del proyecto
  desde `/prisma/pos/nichos/cola-decisiones.json` (PosPersistencia).

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.decision.solicitud.abierta` | al encolar una solicitud | `{solicitud_id, tipo, contexto, opciones, caducidad, timestamp}` |
| `nichos.decision.solicitud.respondida` | al cerrar con respuesta | `{solicitud_id, opcion_elegida, dueno, nota_libre, timestamp}` |
| `nichos.decision.solicitud.caducada` | al barrer una caducada | `{solicitud_id, caducidad, timestamp}` |

## Invariantes

- **Estado cerrado**: una solicitud RESPONDIDA o CADUCADA no acepta mas cambios.
  Intentar cerrar una ya cerrada devuelve 409 `ALREADY_CLOSED`.
- **Caducidad por scheduler**: el barrido depende de `scheduler.job.triggered`
  con `job_name: 'nichos.cola-decisiones.barrer'`. Sin scheduler no caducan.
- **Degradacion honesta**: sin `project_id` el store queda solo en memoria
  (PosPersistencia no persiste).

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`, `solicitud_decision`, `tipo`, `opciones`, `solicitud_id` o `respuesta` |
| 404 | `NOT_FOUND` | `solicitud_id` no existe en el store |
| 409 | `ALREADY_CLOSED` | la solicitud ya esta RESPONDIDA o CADUCADA |

## Integracion (patron RPC del bus)

```javascript
// ENCOLAR
const resp = await bus.publishAndWait('nichos.cola.decisiones.encolar.request', {
  project_id: 'prj_xxx',
  solicitud_decision: {
    tipo: 'pivote',
    contexto: { nicho: 'nicho_abc' },
    opciones: ['pivotar', 'mantener'],
    caducidad: '2026-10-05T12:00:00Z'
  }
});
const { solicitud_id } = resp.data;

// LISTAR SIGUIENTES
const siguientes = await bus.publishAndWait('nichos.cola.decisiones.siguientes.request', {
  project_id: 'prj_xxx',
  dueno: 'admin'
});

// CERRAR
await bus.publishAndWait('nichos.cola.decisiones.cerrar.request', {
  project_id: 'prj_xxx',
  solicitud_id,
  respuesta: 'pivotar'
});
```
