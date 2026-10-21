---
name: envase-embalaje
description: Custodio single-writer del envase y embalaje (the-pirate): elección de envase por tipo de producto y stock de envases.
tags: [enki, the-pirate, envase, embalaje]
---
# envase-embalaje

> Módulo `envase-embalaje` — custodio single-writer del envase y embalaje.

Proyecto: **the-pirate** (`5d09cb49`). Construido en F4 desde el esquema maestro P8.

## Eventos que escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `envase.eleccion.obtener.request` | `onEleccionObtenerRequest` | Elegir envase según tipo de producto |
| `envase.stock.obtener.request` | `onStockObtenerRequest` | Consultar stock de envases |
| `envase.reglas.leer.request` | `onReglasLeerRequest` | Leer reglas de envase |
| `envase.reglas.actualizar.request` | `onReglasActualizarRequest` | Actualizar reglas de envase |

## Eventos que publica

- `envase.reglas.actualizadas` — reglas cambiadas, la propiocepción lo capta

## Dependencias

- `config-custodio` (patrón single-writer)
