---
name: marca-cliente
description: Custodio single-writer de la relación con el cliente (the-pirate): voz de marca, presencia digital, clientes y fidelización.
tags: [enki, the-pirate, marca, cliente, fidelizacion]
---
# marca-cliente

> Módulo `marca-cliente` — custodio single-writer de la relación con el cliente.

Proyecto: **the-pirate** (`5d09cb49`). Construido en F4 desde el esquema maestro P11.

## Eventos que escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `marca.voz.obtener.request` | `onVozObtenerRequest` | Obtener voz/tono de marca |
| `marca.presencia.obtener.request` | `onPresenciaObtenerRequest` | Obtener presencia digital (canales) |
| `marca.cliente.obtener.request` | `onClienteObtenerRequest` | Obtener datos de contacto del cliente |
| `marca.fidelizacion.obtener.request` | `onFidelizacionObtenerRequest` | Obtener programa de fidelización |
| `marca.reglas.leer.request` | `onReglasLeerRequest` | Leer reglas de marca |
| `marca.reglas.actualizar.request` | `onReglasActualizarRequest` | Actualizar reglas de marca |

## Eventos que publica

- `marca.reglas.actualizadas` — reglas cambiadas, la propiocepción lo capta

## Dependencias

- `config-custodio` (patrón single-writer)
