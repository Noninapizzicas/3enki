---
name: viabilidad
description: >-
  Evaluador económico previo del subsistema recetario. HÍBRIDO: el reflejo JS
  sirve las 4 ops deterministas (evaluar, obtener, listar, descartar) en el bus.
  Recibe una receta o propuesta + PVP objetivo opcional, delega el coste a
  escandallo.costear (reflejo→reflejo, ms), aplica reglas de food cost y emite
  veredicto canónico. Persiste expediente por evaluación (audit trail).
fuente: enki
dominio: comercio
tags: [pizzepos, viabilidad, food-cost, margen, evaluacion, expediente, hibrido]
---

# Pizzepos · viabilidad

> **Qué es.** El evaluador económico previo. Antes de añadir un producto a la
> carta, viabilidad responde: ¿es rentable? Combina el coste real (delegado a
> `escandallo.costear`) con el PVP objetivo y aplica reglas de food cost para
> emitir un veredicto canónico.
>
> **4º caso del Patrón Módulo Híbrido.** Las 4 ops son deterministas → reflejo
> JS. Antes las ejecutaba un turno LLM (blueprint puro), costando turnos de
> segundos. Ahora: milisegundos, reflejo→reflejo con escandallo.
>
> **Lente default:** dominio `negocio`, tarea `viabilidad`.
>
> Código: `modules/pizzepos/viabilidad/index.js` · `reflejo-2.0.0`

---

## 1 · LÓGICA

### El veredicto económico

Viabilidad recibe el coste de `escandallo.costear` (reflejo determinista,
cadena JS↔JS en ms) y aplica reglas de food cost contra el PVP objetivo:

```
coste_porcion = escandallo.costear(receta_id).coste_unidad
PVP_objetivo  = input del usuario (o null)

si PVP_objetivo:
  margen = (PVP_objetivo - coste_porcion) / PVP_objetivo × 100

  si margen ≥ 70%  → VIABLE (margen excelente)
  si margen ≥ 50%  → VIABLE_CON_RESERVAS (margen ajustado)
  si margen < 50%  → INVIABLE (margen insuficiente)
  si coste > PVP   → INVIABLE (coste superior al precio)
sino:
  → SIN_PVP (no se puede evaluar sin precio objetivo)
```

### Los caminos (brújula del comerciante)

Cada evaluación produce 0-3 `caminos`: tarjetas `{ titulo, prompt }` que
el frontend renderiza como sugerencias. Ejemplos:

| Veredicto | Camino generado |
|-----------|-----------------|
| INVIABLE | "Subir el PVP a X€" / "Reducir costes quitando Y" |
| VIABLE_CON_RESERVAS | "Probar con ingrediente más barato" |
| VIABLE | [] (sin caminos, el producto sale redondo) |

Los caminos son **stubs ligeros generados por regla**, no análisis pesado del
LLM. La riqueza cualitativa llega cuando el comerciante toca la tarjeta y
el chat se prefilla con el prompt.

### Expediente (audit trail)

Cada evaluación persiste un expediente:

```jsonc
{
  "id": "eval_abc123",
  "receta_id": "pizza_barbacoa",
  "nombre_idea": "Pizza Barbacoa Premium",
  "estado": "activo",
  "veredicto": "VIABLE_CON_RESERVAS",
  "coste_porcion": 2.45,
  "pvp_objetivo": 8.00,
  "margen": 69.4,
  "porciones": 1,
  "ingredientes": [/*...*/],
  "caminos": [
    { "titulo": "Aumenta el PVP", "prompt": "¿Subimos el precio a 8.50?" }
  ],
  "created_at": "2026-07-28T..."
}
```

---

## 2 · TOOLS (invocables por LLM)

### `viabilidad.evaluar`

```jsonc
{
  "receta_id": "pizza_barbacoa",
  "nombre_idea": "Pizza Barbacoa Premium",    // opcional
  "pvp_objetivo": 8.50,                        // opcional (sin él → SIN_PVP)
  "project_id": "uuid"
}
// → 200
{
  "id": "eval_abc123",
  "veredicto": "VIABLE_CON_RESERVAS",
  "coste_porcion": 2.45,
  "pvp_objetivo": 8.50,
  "margen": 71.2,
  "caminos": [],
  "created_at": "2026-07-28T..."
}
```

**Internamente:** llama a `escandallo.costear.request` (reflejo→reflejo).
Normaliza el modelo (coste_unidad → coste_porcion, lineas → ingredientes).
Aplica reglas de food cost. Genera caminos por regla. Persiste expediente.

### `viabilidad.obtener`

```jsonc
{ "id": "eval_abc123", "project_id": "uuid" }
// → 200 { "expediente": { /* expediente completo */ } }
```

### `viabilidad.listar`

```jsonc
{ "estado": "activo", "veredicto": "VIABLE", "project_id": "uuid" }
// → 200 { "expedientes": [ /* ... */ ] }
```

Filtros: estado (activo/descartado), veredicto, receta_id.

### `viabilidad.descartar`

```jsonc
{ "id": "eval_abc123", "project_id": "uuid" }
// → 200 { "id": "eval_abc123", "estado": "descartado" }
```

Soft-delete via fs.edit. Emite `viabilidad.evaluacion.descartada`.

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `viabilidad.evaluacion.completada` | Evaluación completada con veredicto |
| `viabilidad.evaluacion.descartada` | Expediente descartado (soft-delete) |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `viabilidad.evaluar.request` | `onEvaluarRequest` | Evalúa, persiste, emite |
| `viabilidad.obtener.request` | `onObtenerRequest` | Lee expediente |
| `viabilidad.listar.request` | `onListarRequest` | Lista con filtros |
| `viabilidad.descartar.request` | `onDescartarRequest` | Soft-delete |

### Dependencias

| RPC | Módulo | Para qué |
|-----|--------|----------|
| `escandallo.costear.request` | escandallo (reflejo) | Coste determinista del producto |

---

## 4 · FLUJO TÍPICO

### Evaluar un producto nuevo

```
1. USUARIO propone     → "¿sería rentable una pizza barbacoa a 8.50€?"
2. LLM cambia foco     → page_id='viabilidad'
3. REFLEJO recibe      → viabilidad.evaluar.request { receta_id, pvp_objetivo }
4. REFLEJO delega      → escandallo.costear.request (reflejo→reflejo, ms)
5. ESCANDALLO responde → { coste_unidad: 2.45, ingredientes: [...] }
6. REFLEJO normaliza   → coste_porcion = 2.45
7. REFLEJO calcula     → margen = (8.50 - 2.45) / 8.50 = 71.2%
8. REFLEJO emite       → veredicto: VIABLE
9. REFLEJO persiste    → expediente en viabilidad.json
10. RESPUESTA          → { veredicto, coste, margen, caminos }
```

### Listar y descartar

```
viabilidad.listar { estado: "activo" }
  → expedientes pendientes de revisión

viabilidad.descartar { id: "eval_abc123" }
  → soft-delete, fuera del roadmap
```

---

## 5 · INTEGRACIÓN

> **Página activable:** `target_page_id: 'viabilidad'` — el ai-gateway enfoca
> al LLM en viabilidad económica. Lente default: dominio `negocio`, tarea
> `viabilidad` (rutea a financial-analyst del cuenco).

> **Coste orientativo:** viabilidad usa `escandallo.costear` (reflejo, catálogo
> cacheado), NO `escandallo.calcular` (cajón fuzzy Mercadona, turno LLM).
> Es suficientemente preciso para una comprobación de viabilidad.

> **Sin PVP = SIN_PVP:** si no se pasa `pvp_objetivo`, el veredicto es
> `SIN_PVP`. Viabilidad no inventa precios.

> **Persistencia:** expedientes en `data/projects/<slug>/pizzepos/viabilidad.json`.
> Single-writer, audit trail completo.
