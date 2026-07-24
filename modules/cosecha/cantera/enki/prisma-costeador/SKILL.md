---
name: costeador
description: "Manifest de prisma/costeador — REFLEJO JS: el MOTOR que cuesta un COMPUESTO. Recorre sus componentes por ref (insumo o sub-compuesto, recursivo), suma precio_referencia × cantidad → coste del compuesto, y EMITE compuesto.coste.calculado (evento PRISMA, ya NO escandallo/pizzepos). Cuesta RECETA A RECETA (1 compuesto : 1 cálculo : 1 evento) — nunca en bloque (la lección del POS). Si a un componente le falta el precio de referencia, NO inventa: lo lista en `faltantes` y AVISA (compuesto.coste.incompleto). Fase 1 = coste ESTIMADO (referencia); el real es fase 2. Ver la skill prisma-compuestos."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [costeador, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · costeador

> **Qué es.** Manifest de prisma/costeador — REFLEJO JS: el MOTOR que cuesta un COMPUESTO. Recorre sus componentes por ref (insumo o sub-compuesto, recursivo), suma precio_referencia × cantidad → coste del compuesto, y EMITE compuesto.coste.calculado (evento PRISMA, ya NO escandallo/pizzepos). Cuesta RECETA A RECETA (1 compuesto : 1 cálculo : 1 evento) — nunca en bloque (la lección del POS). Si a un componente le falta el precio de referencia, NO inventa: lo lista en `faltantes` y AVISA (compuesto.coste.incompleto). Fase 1 = coste ESTIMADO (referencia); el real es fase 2. Ver la skill prisma-compuestos.
>
>
> Código: `modules/prisma/costeador/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `costeador.costear.request` | `onCostearRequest` | Reflejo: {project_id, compuesto_id} → resuelve precios de componentes (insumos.get / recursión) → Σ → EMITE compuesto.coste.calculado {coste_unidad} o compuesto.coste.incompleto {faltantes}. Una receta, un cálculo, un evento. |
| `costeador.costear_todos.request` | `onCostearTodosRequest` | Reflejo (EL LOOP): {project_id} → lee compuestos.pendientes (la cola) → cuesta UNA a UNA (await por compuesto, nunca en bloque). Devuelve {total, calculados, incompletos}. Por salud: fallo aislado, progreso, reintentable. |

## Señales que escucha

- `insumo.actualizado` → Reflejo (cascada): cambió el precio de un insumo → re-cuesta de A UNA los compuestos que lo referencian. Nunca en bloque. Aquí el anti-cuello se vuelve real (un precio, propaga).

## Dependencias (RPC saliente)

- `compuestos.pendientes.request`
- `insumos.get.request`
- `compuestos.get.request`
- `compuestos.get.request`
- `compuestos.list.request`
- `compuestos.get.request`

## Flujo típico

```
// 1. costeador.request → costeador.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
