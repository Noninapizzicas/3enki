---
name: escandallo
description: >-
  Módulo de costeo de recetas (food cost) — HÍBRIDO: el reflejo JS sirve el
  costeo determinista (aritmética pura: escandallo.costear, recalcular_siguiente,
  recalcular_lote) sin turno LLM; el blueprint (cajones) maneja lo fuzzy
  (buscar precios en Mercadona). Valida procedencia y coherencia aritmética.
  Activable via page_id='escandallo'. Lente default: dominio negocio, tarea coste.
fuente: enki
dominio: comercio
tags: [pizzepos, escandallo, coste, food-cost, receta, hibrido, reflejo, mercadona]
---

# Pizzepos · escandallo

> **Qué es.** El módulo de costeo de recetas. Calcula el coste de cada receta
> a partir del precio de sus ingredientes, con orden topológico (masas → salsas
> → bases → pizzas). El reflejo JS hace la aritmética pura en milisegundos;
> el blueprint (LLM) busca precios en Mercadona cuando faltan.
>
> **Híbrido:** `blueprint_driven` + `index.js`. Segundo caso del Patrón Módulo
> Híbrido tras carta-manager (que fue el primero).
>
> **Freno (v2.1.0):** `escandallo.validar.request` rechaza precios inventados
> por el LLM (`estimado_llm` → `PRECIO_INVENTADO`) y aritmética incoherente.
> Lo que Mercadona no tiene es `sin_precio` honesto, no un número inventado.
>
> **Precisión (v2.2.0):** valor de línea a 6 decimales para evitar que
> sub-recetas < 0,005€/unidad se pierdan en el redondeo.
>
> Código: `modules/pizzepos/escandallo/index.js` · `reflejo-1.4.0`
> Versión módulo: `2.2.0`

---

## 1 · LÓGICA (cómo se costea)

### Orden topológico de costeo

Las recetas se costean en orden de dependencia para que una receta padre
pueda usar el coste de una sub-receta ya calculado:

```
masa (0) → salsa (0) → base (0) → pizza (1)
```

Las de tipo 0 se costean primero; las de tipo 1 (pizzas, productos finales)
usan los costes de las sub-recetas ya resueltas.

### Cálculo de coste (`_costear` — aritmética pura)

```
Para cada línea de ingrediente:
  valor_linea = cantidad × precio_unitario    (6 decimales)
  
coste_total = Σ valor_linea de todas las líneas    (2 decimales)
coste_unidad = coste_total / rinde                 (6 decimales, propaga al padre)
```

### Caché de catálogo (TTL 60s)

El reflejo cachea el catálogo de ingredientes durante 60s para evitar
recargarlo en ráfagas (ej: `recalcular_siguiente` 30 veces seguidas).

### Validación (el freno)

`escandallo.validar.request` comprueba:

| Regla | Qué detecta |
|-------|-------------|
| **PROCEDENCIA** | Precio con fuente `estimado_llm` → `PRECIO_INVENTADO`. Sin precio → `sin_precio` (no se fabrica) |
| **COHERENCIA** | `valor_linea ≠ cantidad × precio` → `VALOR_INCOHERENTE` |
| | `coste_total ≠ Σ valor_lineas` → `TOTAL_INCOHERENTE` |

---

## 2 · EVENTOS (RPC en el bus)

### Atiende (request → response)

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `escandallo.costear.request` | `onCostearRequest` | Coste determinista de UNA receta desde el catálogo |
| `escandallo.recalcular_siguiente.request` | `onRecalcularSiguienteRequest` | Costea la siguiente receta pendiente (orden topológico) y persiste |
| `escandallo.recalcular_lote.request` | `onRecalcularLoteRequest` | Costea TODAS las recetas pendientes en UNA llamada (batch) |
| `escandallo.validar.request` | `onValidarRequest` | Valida costeo por procedencia + coherencia (freno) |

### Publica

| Evento | Cuándo |
|--------|--------|
| `escandallo.coste.calculado` | Coste calculado y persistido (recetas lo aplican a su store) |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `recetas.receta_guardada` | — | Dispara recálculo de dependientes |

---

## 3 · FLUJO TÍPICO

### Costeo de una receta

```
1. REFLEJO recibe     → escandallo.costear.request { receta_id, project_id }
2. REFLEJO lee        → catálogo de ingredientes (caché TTL 60s o RPC)
3. REFLEJO calcula    → _costear(): Σ (cantidad × precio) para cada línea
                        → orden topológico: sub-recetas primero
                        → 6 decimales en valor de línea, 2 en coste total
4. REFLEJO valida     → escandallo.validar.request (si aplica)
5. REFLEJO persiste   → publica escandallo.coste.calculado
6. RECETAS recibe     → aplica el coste a su store
7. RESPUESTA          → { receta_id, coste_total, coste_unidad, lineas }
```

### Costeo en lote

```
1. REFLEJO recibe     → escandallo.recalcular_lote.request { project_id }
2. REFLEJO obtiene    → lista de recetas pendientes (orden topológico)
3. REFLEJO itera      → _costear() cada una, persiste, avanza
4. RESPUESTA          → { costeadas: 12, pendientes: 0, errores: [] }
```

### Búsqueda de precio en Mercadona (blueprint → fuzzy)

```
1. BLUEPRINT necesita → precio de "mozzarella" no está en catálogo
2. BLUEPRINT invoca   → _precio_de_mercadona("mozzarella")
3. MERCADONA responde → { precio: 3.50, unidad: "kg", url: "..." }
4. BLUEPRINT escribe  → precio en catálogo (con fuente "mercadona")
5. REFLEJO costea     → escandallo.costear.request (usa el nuevo precio)
```

### Lo que NO hace el LLM (desde v2.1.0)

```
❌ "estimo que la mozzarella cuesta 3€" → PRECIO_INVENTADO → rechazado
✅ "la mozzarella no tiene precio en Mercadona" → sin_precio honesto
❌ "coste total: 2.08€" (cuando Σ real = 2.29€) → TOTAL_INCOHERENTE → rechazado
```

---

## 4 · INTEGRACIÓN

> **Página activable:** `target_page_id: 'escandallo'` — el ai-gateway enfoca
> al LLM en costeo. Lente default: dominio `negocio`, tarea `coste`.

> **Herramientas principales:** `escandallo.costear` (una receta),
> `escandallo.recalcular_siguiente` (siguiente pendiente),
> `escandallo.recalcular_lote` (todas).

> **Validación:** siempre pasar por `escandallo.validar.request` ANTES de
> persistir un costeo. El blueprint llama a validar antes de guardar.

> **Precisión:** 6 decimales en valor de línea, 2 en coste total. Esto evita
> que sub-recetas de bajo coste (masa a 0,001€/g) se pierdan en el redondeo.

> **Sin Mercadona = sin precio.** El LLM no inventa precios. Si no encuentra
> el ingrediente en Mercadona, lo marca como `sin_precio`. Es honesto, no es
> un error.
