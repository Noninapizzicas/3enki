---
name: criterio-viabilidad
description: >-
  CUSTODIO del vertical NICHOS (bloque C · validación): ranura autorizada que
  guarda el umbral de viabilidad del motor de decisión (ingresos_semana_min,
  ingresos_semana_objetivo, disposicion_pagar_min, por_tipo_nicho,
  exige_vb_previo_construir) con inmutabilidad por versión. Escritores: dueño
  o ajustador-umbrales (K3) por el canal; lectores libres por RPC. Carga este
  módulo cuando el VeredictoViabilidad (C3) necesite leer el umbral antes de
  emitir, cuando el panel del dueño ajuste el umbral, o cuando K3 promueva una
  propuesta aceptada.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, criterio, viabilidad, umbral, validacion, bloque-c, pos-persistencia, bus, mqtt]
---

# nichos · criterio-viabilidad

> **Qué es.** CUSTODIO (bloque C validación) del umbral de viabilidad del
> vertical NICHOS. Snapshot inmutable por versión con los cinco campos que
> acotan la decisión 'VIABLE | NO_VIABLE | PUENTE'.
>
> Código: `modules/nichos/criterio-viabilidad/index.js`. La verdad viva es el
> código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **CUSTODIO** (escritores autorizados, estado persistido).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/criterio-viabilidad.json`.
- Autores autorizados: `dueño` (canal directo) | `ajustador-umbrales` (K3, al
  promover una propuesta aceptada).
- Esqueleto por defecto: todo campo nace `ABIERTO` — el consumidor degrada
  (C3 → `Veredicto.PUENTE('umbral_sin_declarar')`), jamás se asume valor.

## Campos del umbral

| Campo | Tipo | Semántica |
|---|---|---|
| `ingresos_semana_min` | `Dinero \| 'ABIERTO'` | ingresos semanales mínimos para considerar viable |
| `ingresos_semana_objetivo` | `Dinero \| 'ABIERTO'` | ingresos semanales objetivo (meta de salud) |
| `disposicion_pagar_min` | `Dinero \| 'ABIERTO'` | precio unitario mínimo aceptable |
| `por_tipo_nicho` | `Map<TipoNicho, UmbralEspecifico> \| 'ABIERTO'` | overrides por tipo de nicho (empresa/persona/organismo) |
| `exige_vb_previo_construir` | `Boolean \| 'ABIERTO'` | si pide VB del dueño antes de ir a CONSTRUIR |

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.criterio.viabilidad.leer.request` | `onLeerRequest` | `{status:200, data:{umbral_viabilidad:{version, umbral, por_autor}}}` |
| `nichos.criterio.viabilidad.declarar.request` | `onDeclararRequest` | `{status:200, data:{nueva_version, umbral_viabilidad}}` o `{status:403, error:{code:'PERMISSION_DENIED'}}` |

### Payload de `.declarar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "por_autor": "dueño",
  "cambio": {
    "ingresos_semana_min": 50,
    "ingresos_semana_objetivo": 300,
    "disposicion_pagar_min": 5,
    "exige_vb_previo_construir": true
  }
}
```

Campos del `cambio` no incluidos → se conservan del snapshot anterior. Campos
fuera del esquema → 400 `INVALID_INPUT`.

## Señales que escucha (fire-and-forget)

- `project.activated` → `onProjectActivated` — restaura el umbral persistido
  desde `/prisma/pos/nichos/criterio-viabilidad.json`.

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.criterio.viabilidad.declarado` | tras aplicar una declaración válida | `{project_id, version, por_autor, timestamp}` |
| `nichos.criterio.viabilidad.declarado.failed` | rechazo por autor no autorizado o cambio inválido | `{project_id, code, message, timestamp}` |

## Invariantes

- **Escritores autorizados**: solo `dueño` o `ajustador-umbrales`. Otro autor
  → 403 `PERMISSION_DENIED` + pulso `.declarado.failed`.
- **Inmutabilidad por versión**: cada declaración crea un snapshot nuevo
  (`version++`); el historial queda en `por_autor[]`.
- **ABIERTO explícito**: el consumidor sabe que no se asume nada.
- **Degradación honesta**: sin `project_id` el store queda en memoria.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`/`por_autor`/`cambio`, o `cambio` trae campos fuera del esquema |
| 403 | `PERMISSION_DENIED` | `por_autor` no está en `['dueño','ajustador-umbrales']` |

## Integración (patrón RPC del bus)

```javascript
// LEER (VeredictoViabilidad antes de emitir)
const r = await bus.publishAndWait('nichos.criterio.viabilidad.leer.request', { project_id });
const u = r.data.umbral_viabilidad.umbral;
if (u.ingresos_semana_min === 'ABIERTO') return Veredicto.PUENTE('umbral_sin_declarar');

// DECLARAR (dueño por el canal)
await bus.publishAndWait('nichos.criterio.viabilidad.declarar.request', {
  project_id, por_autor: 'dueño',
  cambio: { ingresos_semana_min: 100 }
});

// DECLARAR (K3 promueve propuesta aceptada)
await bus.publishAndWait('nichos.criterio.viabilidad.declarar.request', {
  project_id, por_autor: 'ajustador-umbrales',
  cambio: { ingresos_semana_min: 150 }
});
```

## Dónde encaja en el vertical NICHOS

- **Bloque C — validación**: lo lee `nichos-veredicto-viabilidad` (C3) en cada
  emisión; también `nichos-camino-encontrar-construir` (C4) para el flag
  `exige_vb_previo_construir`.
- **K3 (ajustador-umbrales)** lo re-escribe cuando el dueño responde una
  propuesta de ajuste de umbral (aprendizaje cerrado).
- No depende de otro módulo del vertical para arrancar (solo
  `project.activated` del core). Es raíz del grafo del bloque C.
