---
name: puente-compuesto
description: "Manifest de prisma/puente-compuesto — REFLEJO JS: EL PUENTE prisma-puro compuesto↔producto↔precio (el módulo prisma/recetario se retiró 2026-07-20 — prisma no usa escandallo/pizzepos; pizzepos/recetas ya persiste su propio coste). Escucha compuesto.coste.calculado (evento PRISMA del costeador), resuelve QUÉ producto referencia ese compuesto (por compuesto_ref) y entrega el coste a prisma/coste (coste.aplicar), que escribe el pvp. NO PISA el precio manual: si el comerciante ya fijó pvp y la pregunta de coste está cerrada, canta la deriva (puente.coste_actualizado) en vez de sobrescribir. ATAR: un producto elaborado sin compuesto_ref → busca el compuesto homónimo (compuestos.list por nombre) y fija el arco. Sin store: conecta, no guarda. Ver arquitectura/decisiones/propuestas/prisma-compuestos.md."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [puente-compuesto, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · puente-compuesto

> **Qué es.** Manifest de prisma/puente-compuesto — REFLEJO JS: EL PUENTE prisma-puro compuesto↔producto↔precio (el módulo prisma/recetario se retiró 2026-07-20 — prisma no usa escandallo/pizzepos; pizzepos/recetas ya persiste su propio coste). Escucha compuesto.coste.calculado (evento PRISMA del costeador), resuelve QUÉ producto referencia ese compuesto (por compuesto_ref) y entrega el coste a prisma/coste (coste.aplicar), que escribe el pvp. NO PISA el precio manual: si el comerciante ya fijó pvp y la pregunta de coste está cerrada, canta la deriva (puente.coste_actualizado) en vez de sobrescribir. ATAR: un producto elaborado sin compuesto_ref → busca el compuesto homónimo (compuestos.list por nombre) y fija el arco. Sin store: conecta, no guarda. Ver arquitectura/decisiones/propuestas/prisma-compuestos.md.
>
>
> Código: `modules/prisma/puente-compuesto/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|

## Señales que escucha

- `compuesto.coste.calculado` → Reflejo (el puente): {project_id, compuesto_id, coste_unidad|coste_centimos} → resuelve el producto por compuesto_ref → coste.aplicar (escribe pvp) o testigo puente.coste_actualizado si el precio es manual. GATE si nadie lo referencia.
- `catalogo.editado` → Reflejo (atar identidad): un producto origen=='elaborado' sin compuesto_ref → busca el compuesto homónimo (compuestos.list) y fija compuesto_ref via catalogo.update_product. Idempotente; no inventa el arco si no hay homónimo.
- `catalogo.actualizado` → Igual que catalogo.editado, para save/restore/clonar/activar.

## Dependencias (RPC saliente)

- `coste.aplicar.request`
- `catalogo.list.request`
- `catalogo.get.request`
- `compuestos.list.request`
- `catalogo.update_product.request`

## Flujo típico

```
// 1. puente-compuesto.request → puente-compuesto.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
