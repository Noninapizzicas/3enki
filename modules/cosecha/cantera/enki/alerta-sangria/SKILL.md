---
name: alerta-sangria
description: >-
  PUENTE del vertical NICHOS (bloque K): cuando el cuadro de salud detecta
  sangría (métricas de pérdida), evalúa indicador contra umbral y alza puente
  humano con alerta urgente. Sin estado. Carga este módulo cuando el vertical
  NICHOS necesite reaccionar a sangría detectada y escalar al dueño.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: puente
tags: [nichos, puente, alerta, sangria, cuadro-salud, puente-humano, bloque-k, bus, mqtt]
---

# nichos · alerta-sangria

> **Qué es.** PUENTE (bloque K, #50) del vertical NICHOS. Cuando el cuadro
> de salud detecta sangría, evalúa el indicador contra el umbral y alza
> puente humano con alerta urgente.
>
> Código: `modules/nichos/alerta-sangria/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **PUENTE** (reactivo: detecta, evalúa y escala).
- Base: `ModuloHibridoReflejo` (mitad REFLEJO, JS determinista).
- Sin estado. Puente reactivo entre cuadro de salud y puente humano.

## Eventos

### Escucha (fire-and-forget entrante)

| Evento | Handler | Qué hace |
|---|---|---|
| `nichos.sangria.detectada` | `onSangriaDetectada` | Evalúa indicador contra umbral y alza puente humano. Payload: `{id_nicho, indicador, umbral, valor_actual}` |

### Atiende (request -> response)

| Evento | Handler | Qué hace |
|---|---|---|
| `nichos.cuadro.salud.estado.request` | `onEstadoRequest` | Consulta estado del cuadro de salud para un nicho. Payload: `{id_nicho}` |

### Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.alerta.sangria.emitida` | tras evaluar sangría | `{id_nicho, indicador, umbral, valor_actual, timestamp}` |

### Publica al bus

| Evento | Destino | Descripción |
|---|---|---|
| `nichos.puente.humano.alzar.request` | puente-humano | Alza alerta urgente de sangría para el dueño |

## Cuándo se usa

- **Cuadro de salud** publica `nichos.sangria.detectada` cuando las métricas
  indican pérdida, y alerta-sangria reacciona emitiendo la alerta y escalando.
- Cualquier módulo que necesite monitorizar sangría y escalar al dueño.

## Integración

```javascript
// El cuadro de salud emite (no hay RPC directo a alerta-sangria):
bus.publish('nichos.sangria.detectada', {
  id_nicho: 'nicho_xxx',
  indicador: 'tasa_conversion',
  umbral: 0.05,
  valor_actual: 0.02
});
// → alerta-sangria emite nichos.alerta.sangria.emitida
// → alerta-sangria alza nichos.puente.humano.alzar.request
```

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `id_nicho` en consulta de estado |
| 502 | `CUADRO_SALUD_NO_DISPONIBLE` | no se pudo consultar el cuadro de salud |
