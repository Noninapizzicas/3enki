---
name: imputacion-costes
description: >-
  REFLEJO del vertical NICHOS: agrega coste de un proyecto hasta un instante
  dado por categoria. Sin estado propio — consulta por bus a registro-cobros
  e imputacion-coste-fuente, suma y responde con el coste total desglosado.
  Carga este modulo cuando necesites el coste agregado de un proyecto del
  vertical NICHOS, o cuando otro modulo necesite el total de costes para
  calcular salud financiera o rentabilidad.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, costes, imputacion, agregador, bus, mqtt]
---

# nichos - imputacion-costes

> **Que es.** REFLEJO puro del vertical NICHOS. Agrega coste de un proyecto
> hasta un instante dado consultando dos fuentes por bus (registro-cobros e
> imputacion-coste-fuente) y devolviendo el total desglosado.
>
> Codigo: `modules/nichos/imputacion-costes/index.js`. La verdad viva es
> el codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **REFLEJO** (sin estado propio, determinista).
- Base: `ModuloHibridoReflejo`.
- Sin persistencia: no guarda estado; agrega bajo demanda.

## Eventos que atiende (request - response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.costes.imputar.request` | `onImputarRequest` | `{status:200, data:{coste_total:{fuentes, cobros, total, hasta, timestamp}}}` |

### Payload de `.imputar.request`

```json
{
  "request_id": "uuid",
  "id_proyecto": "prj_xxx",
  "hasta": "2026-10-04T12:00:00Z"
}
```

`hasta` es opcional; por defecto se usa el instante actual.

## RPCs que emite (consultas al bus)

| Evento | Destino | Que consulta |
|---|---|---|
| `nichos.fuente.coste.consultar.request` | imputacion-coste-fuente | coste de fuentes del proyecto hasta el instante |
| `nichos.registro.cobros.consultar.request` | registro-cobros | cobros del proyecto hasta el instante |

## Invariantes

- **Sin estado propio**: todo dato se obtiene del bus en cada llamada.
- **Degradacion honesta**: si alguna fuente no responde, su coste se
  reporta como 0 con `error: 'fuente_no_disponible'` o `'cobros_no_disponible'`.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `id_proyecto` |

## Integracion (patron RPC del bus)

```javascript
const resp = await bus.publishAndWait('nichos.costes.imputar.request', {
  id_proyecto: 'prj_xxx',
  hasta: '2026-10-04T12:00:00Z'
});
const { total, fuentes, cobros } = resp.data.coste_total;
```
