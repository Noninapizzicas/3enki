---
name: cortador-temprano
description: >-
  REFLEJO del vertical NICHOS: corta un nicho antes de la fase de construccion
  cuando el veredicto es NO_VIABLE. Transita el pipeline a CORTADO y registra
  en historial. Sin estado propio. Carga este modulo cuando el pipeline de
  validacion necesite descartar nichos no viables antes de invertir en
  construccion, o cuando reacciones al PULSO nichos.cortado.pre.construccion.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, cortador, temprano, pipeline, validacion, bus, mqtt]
---

# nichos · cortador-temprano

> **Que es.** REFLEJO sin estado del vertical NICHOS que corta un nicho antes de
> la fase de construccion cuando el veredicto es NO_VIABLE. Ejecuta la transicion
> del pipeline a CORTADO y registra el evento en el historial.
>
> Codigo: `modules/nichos/cortador-temprano/index.js`. La verdad viva es el
> codigo; esta skill es la referencia de uso.

---

## Forma Enki

- Patron: **REFLEJO** sin estado (JS determinista).
- Base: `ModuloHibridoReflejo`.
- Sin store — sin PosPersistencia. La transicion la delega al pipeline y el
  registro al historial.

## Eventos que atiende (request -> response)

| Evento | Handler | Que devuelve |
|---|---|---|
| `nichos.cortar.temprano.request` | `onCortarRequest` | `{status:200, data:{transicion:{id_nicho, estado_destino, resultado, razon}}}` |

### Payload de `.cortar.temprano.request`

```json
{
  "request_id": "uuid",
  "id_nicho": "nicho_xxx",
  "veredicto": {
    "codigo": "NO_VIABLE",
    "razon": "demanda insuficiente"
  }
}
```

## RPCs que emite (dependencias)

| Evento | Destino | Que pide |
|---|---|---|
| `nichos.pipeline.transitar.request` | pipeline | Transitar el nicho a estado CORTADO. |
| `nichos.historial.registrar.request` | historial | Registrar el corte temprano con detalle. |

## Pulsos que emite

| Evento | Cuando | Payload |
|---|---|---|
| `nichos.cortado.pre.construccion` | tras ejecutar el corte | `{id_nicho, razon, timestamp}` |

## Invariantes

- **Requiere id_nicho y veredicto**: sin ellos devuelve 400 INVALID_INPUT.
- **Degradacion honesta**: si el pipeline o el historial no responden (timeout en _rpc),
  el corte se reporta igualmente con resultado 'pendiente'.

## Integracion (patron RPC del bus)

```javascript
// CORTAR un nicho
const resp = await bus.publishAndWait('nichos.cortar.temprano.request', {
  id_nicho: 'nicho_123',
  veredicto: { codigo: 'NO_VIABLE', razon: 'demanda insuficiente' }
});
// resp.data.transicion.resultado === 'transitado' | 'pendiente'
```

## Donde encaja en el vertical NICHOS

- Lo invoca **batch-validacion** cuando un candidato recibe veredicto NO_VIABLE.
- Delega la transicion al **pipeline** y el registro al **historial**.
- El pulso `nichos.cortado.pre.construccion` lo escucha el **Jefe (K)** y
  **escalones-mensaje (G2)** para notificar al dueno si corresponde.
