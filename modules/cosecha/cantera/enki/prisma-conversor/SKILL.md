---
name: conversor
description: "Manifest de prisma/conversor — REFLEJO JS PURO (cero LLM, cero estado, cero red): expone en el bus la lib _shared/prisma-unidades. Cuatro cálculos deterministas — convertir unidades (masa→g·volumen→ml·conteo→u; masa↔volumen SOLO con densidad, si falta NO inventa), precio a céntimos POR UNIDAD BASE (lo que el costeador multiplica), fórmula PANADERA (% sobre una referencia) y ESCALAR esa fórmula a una tanda de producción (el gran escalado: cambias un número y toda la receta escala). Sin store, sin custodio: entra objeto, sale objeto."
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [conversor, prisma, reflejo, bus, mqtt, integracion]
---

# prisma · conversor

> **Qué es.** Manifest de prisma/conversor — REFLEJO JS PURO (cero LLM, cero estado, cero red): expone en el bus la lib _shared/prisma-unidades. Cuatro cálculos deterministas — convertir unidades (masa→g·volumen→ml·conteo→u; masa↔volumen SOLO con densidad, si falta NO inventa), precio a céntimos POR UNIDAD BASE (lo que el costeador multiplica), fórmula PANADERA (% sobre una referencia) y ESCALAR esa fórmula a una tanda de producción (el gran escalado: cambias un número y toda la receta escala). Sin store, sin custodio: entra objeto, sale objeto.
>
>
> Código: `modules/prisma/conversor/index.js`. Esta skill es la referencia de uso; la verdad viva es el código.

---

## Eventos que atiende (request → response)

| Evento | Handler | Descripción |
|---|---|---|
| `conversor.convertir.request` | `onConvertirRequest` | Puro: {cantidad, desde, hacia, densidad_g_ml?} → {cantidad}. Misma dimensión = factor directo; masa↔volumen solo con densidad; conteo no cruza (null). |
| `conversor.precio.request` | `onPrecioRequest` | Puro: {precio_centimos, cantidad, unidad} → {coste_centimos_por_unidad, base}. Ej 350c/1kg → 0.35 c/g. El número que lee el costeador. |
| `conversor.formula.request` | `onFormulaRequest` | Puro (fórmula panadera): {componentes:[{ref,cantidad,unidad,densidad_g_ml?}], base_ref} → {formula:[{ref,pct,gramos}], faltantes}. La referencia = 100%. Componente sin masa → faltante, NO inventa. |
| `conversor.escalar.request` | `onEscalarRequest` | Puro (gran escalado): {formula:[{ref,pct}], modo:'referencia'|'total', gramos} → [{ref,cantidad,unidad:'g'}]. Cambias un número → toda la receta escala. |
| `conversor.referencia.request` | `onReferenciaRequest` | Puro (fase 1): {precios:[centimos], percentil?=75} → {precio_referencia}. NO es compra, no busca el más barato — coste estimado PRUDENTE tirando a alto (percentil 75: entre mediana y máximo). Para no quedarse corto. |

## Flujo típico

```
// 1. conversor.request → conversor.response
// 2. Procesa y emite eventos
// 3. Persiste si aplica
```

## Patrón RPC

```
publish →  ui/request/<dominio>/<accion>    { request_id, data }
listen  ←  ui/response/<request_id>         { request_id, status, data }
```
