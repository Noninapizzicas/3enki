---
name: agenda-operacion
description: Custodio single-writer de la operación diaria del negocio (the-pirate): horario por franja, ciclo de tareas del día y predicción de demanda.
tags: [enki, the-pirate, agenda, operacion, horario]
---
# agenda-operacion

> Módulo `agenda-operacion` — custodio single-writer de la operación diaria.

Proyecto: **the-pirate** (`5d09cb49`). Construido en F4 desde el esquema maestro P13.

## Eventos que escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `agenda.horario.obtener.request` | `onHorarioObtenerRequest` | Obtener horario de apertura por franja |
| `agenda.ciclo.obtener.request` | `onCicloObtenerRequest` | Obtener ciclo de tareas del día |
| `agenda.demanda.predecir.request` | `onDemandaPredecirRequest` | Predecir demanda (venta del día anterior) |
| `agenda.reglas.leer.request` | `onReglasLeerRequest` | Leer reglas de agenda |
| `agenda.reglas.actualizar.request` | `onReglasActualizarRequest` | Actualizar reglas de agenda |

## Eventos que publica

- `agenda.reglas.actualizadas` — reglas cambiadas, la propiocepción lo capta

## Dependencias

- `config-custodio` (patrón single-writer)
