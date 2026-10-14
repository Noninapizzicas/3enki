---
name: reglas-exclusion
description: >-
  CUSTODIO del vertical NICHOS (bloque B · búsqueda): guarda las reglas
  aprendidas de EXCLUSIÓN por firma de semilla y las sirve al sondeador. Carga
  este módulo cuando el sondeador necesite consultar qué patrones NO explorar
  para una semilla, cuando el dueño o el ajustador-umbrales (K3) añada/quite
  patrones a una firma, o cuando otro módulo reaccione al PULSO
  nichos.reglas.exclusion.actualizadas. Ingiere los sondeos cerrados como
  feedback para una futura destilación semántica de patrones.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: custodio
tags: [nichos, custodio, reglas, exclusion, aprendizaje, busqueda, bloque-b, pos-persistencia, bus, mqtt]
---

# nichos · reglas-exclusion

> **Qué es.** CUSTODIO (bloque B búsqueda) del vertical NICHOS. Mantiene por
> firma de semilla el conjunto activo de patrones que el sondeador debe
> EXCLUIR de los candidatos, y archiva los sondeos cerrados como feedback.
>
> Código: `modules/nichos/reglas-exclusion/index.js`. La verdad viva es el
> código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **CUSTODIO** (append-only de feedback + conjunto activo versionado).
- Base: `ModuloHibridoReflejo` + `PosPersistencia` (per-proyecto).
- Store: `/prisma/pos/nichos/reglas-exclusion.json`.
- Autores autorizados a mutar: `dueño` | `ajustador-umbrales` (K3).
- Sin mitad blueprint — la destilación de patrones queda deferida a K3 o al
  blueprint cuando se cablee la fuzzy.

## Shape del store

```json
{
  "version": 7,
  "reglas_por_firma": {
    "<firma_semilla>": {
      "patrones": ["adulto", "cripto-estafa"],
      "actualizada_por": "dueño",
      "at": "2026-..."
    }
  },
  "sondeos_ingeridos": [
    { "semilla_firma": "...", "candidatos_total": 42, "at": "2026-..." }
  ],
  "por_autor": [ { "version", "autor", "firma", "cambio", "at" } ]
}
```

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.reglas.exclusion.consultar.request` | `onConsultarRequest` | `{status:200, data:{conjunto_reglas:{semilla_firma, patrones_excluir, version}}}` — conjunto vacío si la firma no tiene aún reglas (no inventa). |
| `nichos.reglas.exclusion.actualizar.request` | `onActualizarRequest` | `{status:200, data:{nueva_version, conjunto_reglas}}` o `{status:403, error:{code:'PERMISSION_DENIED'}}`. |

### Payload de `.actualizar.request`

```json
{
  "request_id": "uuid",
  "project_id": "prj_xxx",
  "semilla_firma": "<firma>",
  "por_autor": "dueño",
  "cambio": {
    "añadir":   ["patron1", "patron2"],
    "quitar":   ["patron_viejo"],
    "reemplazar": null
  }
}
```

`reemplazar` sustituye el conjunto entero; `añadir`/`quitar` operan sobre el
conjunto previo. Mezclarlos no está prohibido pero `reemplazar` gana.

## Señales que escucha (fire-and-forget)

- `nichos.sondeo.completado` → `onSondeoCompletado` — ingiere el sondeo cerrado
  en `sondeos_ingeridos` (feedback para destilación futura). No muta el
  conjunto activo por sí solo.
- `project.activated` → `onProjectActivated` — restaura el store del proyecto
  desde `/prisma/pos/nichos/reglas-exclusion.json`.

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.reglas.exclusion.actualizadas` | tras aplicar un cambio válido | `{project_id, semilla_firma, patrones_total, actualizada_por, timestamp}` |
| `nichos.reglas.exclusion.actualizadas.failed` | rechazo por autor no autorizado o cambio vacío | `{project_id, code, message, timestamp}` |

## Invariantes

- **Autor autorizado**: solo `dueño` o `ajustador-umbrales`. Otro autor → 403.
- **Append-only de feedback**: `sondeos_ingeridos` nunca se mutan ni se podan
  aquí; el destilador los lee cuando toque.
- **Vacío ≠ invento**: si una firma no tiene reglas, `patrones_excluir = []`.
  El sondeador decide qué hacer con un conjunto vacío.
- **Degradación honesta**: sin `project_id` el store queda en memoria.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `project_id`/`semilla_firma`/`por_autor`/`cambio`, o `cambio` vacío |
| 403 | `PERMISSION_DENIED` | `por_autor` no está en `['dueño','ajustador-umbrales']` |

## Integración (patrón RPC del bus)

```javascript
// CONSULTAR (sondeador-territorio antes de filtrar candidatos)
const r = await bus.publishAndWait('nichos.reglas.exclusion.consultar.request', {
  project_id, semilla_firma
});
const bloqueados = r.data.conjunto_reglas.patrones_excluir;

// ACTUALIZAR (dueño añade un patrón manual)
await bus.publishAndWait('nichos.reglas.exclusion.actualizar.request', {
  project_id, semilla_firma, por_autor: 'dueño',
  cambio: { añadir: ['nicho-X-irrelevante'] }
});
```

## Dónde encaja en el vertical NICHOS

- **Bloque B — búsqueda**: alimenta al `nichos-sondeador-territorio` con los
  patrones que debe EXCLUIR al dedupar candidatos.
- **K3 (ajustador-umbrales)** promueve propuestas de patrones aceptadas por el
  dueño llamando a `.actualizar.request` con `por_autor:'ajustador-umbrales'`.
- No depende de otro módulo del vertical para arrancar (solo `project.activated`
  del core).
