---
name: pulso-avance
description: >-
  REFLEJO del vertical NICHOS (bloque K): calcula métricas de avance
  (duración en estado, velocidad) a partir de cada transición del pipeline
  y actualiza el cuadro de salud. Sin estado. Carga este módulo cuando el
  vertical NICHOS necesite métricas de progreso del pipeline por nicho.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: reflejo
tags: [nichos, reflejo, pulso, avance, metricas, pipeline, cuadro-salud, bloque-k, bus, mqtt]
---

# nichos · pulso-avance

> **Qué es.** REFLEJO (bloque K, #52) del vertical NICHOS. Calcula métricas
> de avance (duración en estado, velocidad) a partir de cada transición del
> pipeline y alimenta al cuadro de salud.
>
> Código: `modules/nichos/pulso-avance/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **REFLEJO** puro (JS determinista, sin LLM).
- Base: `ModuloHibridoReflejo`.
- Sin estado. Calcula la duración entre timestamps de entrada/salida
  del estado y emite un pulso de avance.

## Eventos

### Escucha (fire-and-forget entrante)

| Evento | Handler | Qué hace |
|---|---|---|
| `nichos.pipeline.transitado` | `onPipelineTransitado` | Calcula métricas de avance y emite pulso. Payload: `{id_nicho, estado_anterior, estado_nuevo, timestamp, timestamp_anterior?}` |

### Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.pulso.avance.emitido` | tras cada transición | `{id_nicho, estado_anterior, estado_nuevo, timestamp, duracion_en_estado_ms}` |

### Publica al bus

| Evento | Destino | Descripción |
|---|---|---|
| `nichos.cuadro.salud.actualizar.request` | cuadro-salud | Actualiza métricas de avance por nicho |

## Cuándo se usa

- **Pipeline** emite `nichos.pipeline.transitado` en cada transición de estado,
  y pulso-avance calcula la duración y actualiza el cuadro de salud.
- **Cuadro de salud** consume la actualización para mantener sus métricas vivas.
- Cualquier módulo que necesite saber cuánto tarda un nicho en avanzar.

## Integración

```javascript
// El pipeline emite (no hay RPC directo a pulso-avance):
bus.publish('nichos.pipeline.transitado', {
  id_nicho: 'nicho_xxx',
  estado_anterior: 'SONDEO',
  estado_nuevo: 'EVALUACION',
  timestamp: new Date().toISOString(),
  timestamp_anterior: '2026-10-04T10:00:00.000Z'
});
// → pulso-avance emite nichos.pulso.avance.emitido con duracion_en_estado_ms
// → pulso-avance solicita nichos.cuadro.salud.actualizar.request
```

## Métricas calculadas

| Métrica | Cálculo | Semántica |
|---|---|---|
| `duracion_en_estado_ms` | `timestamp - timestamp_anterior` | Tiempo que el nicho estuvo en el estado anterior (ms). 0 si no hay timestamp_anterior (primera transición). |
