---
name: entrega
description: Custodio single-writer de la entrega (the-pirate): estimación de tiempo de preparación/entrega y configuración de reparto (radio, coste, tiempo por km).
tags: [enki, the-pirate, entrega, reparto]
---
# entrega

> Módulo `entrega` — custodio single-writer de la entrega.

Proyecto: **the-pirate** (`5d09cb49`). Construido en F4 desde el esquema maestro P9.

## Eventos que escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `entrega.tiempo.estimar.request` | `onTiempoEstimarRequest` | Estimar tiempo de preparación/entrega |
| `entrega.reparto.obtener.request` | `onRepartoObtenerRequest` | Obtener política de reparto |
| `entrega.reglas.leer.request` | `onReglasLeerRequest` | Leer reglas de entrega |
| `entrega.reglas.actualizar.request` | `onReglasActualizarRequest` | Actualizar reglas de entrega |

## Eventos que publica

- `entrega.reglas.actualizadas` — reglas cambiadas, la propiocepción lo capta

## Dependencias

- `config-custodio` (patrón single-writer)
