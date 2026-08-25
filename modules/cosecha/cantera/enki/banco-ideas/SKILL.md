---
name: banco-ideas
description: Gestiona un banco de ideas compartido entre módulos: guardar, listar y recuperar ideas con autor opcional.
tags: [enki, ideas, banco, memoria, utilidad]
---
# banco-ideas

> Módulo `banco-ideas` — banco de ideas compartido en memoria.

Ofrece un almacén de ideas en memoria durante la vida del proceso. Otros módulos pueden crear, listar y recuperar ideas por ID.

## Eventos que escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `banco-ideas.crear.request` | `_crearIdea` | Guardar una idea (texto obligatorio, autor opcional) |
| `banco-ideas.listar.request` | `_listarIdeas` | Listar ideas con límite opcional |
| `banco-ideas.obtener.request` | `_obtenerIdea` | Obtener una idea por su ID |

## Eventos que publica

Ninguno (responde directamente a los requests).

## Dependencias

- `_shared/base-module` — infraestructura de módulo Enki

## Estado interno

Las ideas se mantienen en un array en memoria (`this._ideas`). Se pierden al reiniciar el proceso. Cada idea tiene: `id`, `texto`, `autor` (default `anónimo`), `creadaEn` (ISO timestamp).
