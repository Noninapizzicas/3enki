---
name: adaptador
description: "Adaptador de Prisma: producto crudo → ProductoUniversal (5 huecos) + arquetipo. blueprint-agentico; v0.1.0 mitad reflejo (clasifica por forma, marca lo abierto, valida contra el freno). El PENSAR fuzzy (LLM) llega como blueprint después."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [adaptador, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · adaptador

> **Qué es.** Manifest de prisma/adaptador — la pieza que DESCOMPONE un producto crudo en el ProductoUniversal (5 huecos) y clasifica su arquetipo. Sigue blueprint-agentico (6 fases: CONTRATO → LEER → PENSAR → VALIDAR → GUARDAR → EMITIR). v0.1.0 trae la MITAD REFLEJO (determinista): clasifica el arquetipo por la FORMA (ejes+naturalezas, NO la superficie), marca las preguntas_abiertas de lo privado (coste/stock/agenda/tarifa) y orquesta el loop VALIDAR contra el freno de producto-manager (catalogo.validar.request). El PENSAR de v0.1.0 mapea una entrada ESTRUCTURADA; la mitad FUZZY (LLM que descompone foto/texto libre → estructura) llega como adaptador.blueprint.json en el paso siguiente (será híbrido). GUARDAR = emite producto.adaptado, que producto-manager ya consume (onProductoAdaptado, upsert idempotente). Ver arquitectura/decisiones/propuestas/prisma.md.
>
>
> Código: `modules/prisma/adaptador/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `adaptador.adaptar.request` | `onAdaptarRequest` | Reflejo JS: crudo estructurado → ProductoUniversal (clasifica arquetipo, marca preguntas_abiertas, VALIDA contra el freno, EMITE producto.adaptado). Lo invoca el blueprint (cajón adaptar) tras descomponer el material. |

## Dependencias (RPC saliente)

- `arquetipos.listar.request`
- `catalogo.validar.request`

## Flujo típico

```
// 1. adaptador.request → adaptador.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
