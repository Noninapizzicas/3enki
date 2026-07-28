---
name: recetas
description: >-
  Módulo de recetas HÍBRIDO: blueprint-driven (cajones) para lo fuzzy
  (crear desde intención, investigar, editar vía LLM) + reflejo JS para
  las lecturas deterministas servidas en el bus (listar, ingredientes,
  obtener) sin turno LLM. PILOTO del patrón Módulo Híbrido + cajones
  context-partitioning. Validador AJV como freno antes de persistir.
fuente: enki
dominio: comercio
tags: [pizzepos, recetas, hibrido, reflejo, cajones, validacion, ajv, coste]
---

# Pizzepos · recetas

> **Qué es.** El módulo de recetas. Primer caso del **Patrón Módulo Híbrido**:
> las lecturas deterministas (listar, obtener, ingredientes) las sirve el reflejo
> JS en milisegundos; el blueprint (LLM) se queda con lo fuzzy (crear desde
> intención en lenguaje natural, investigar variaciones, editar).
>
> **Por qué nació:** cada lectura por RPC costaba un turno LLM sintético con el
> blueprint de recetas (~18K tokens). Un escandallo llegaba a 250-370K tokens
> solo en lecturas. Servidas por el reflejo: ~10x menos coste e instantáneo.
>
> **PILOTO:** primer módulo híbrido del sistema. Segundo: carta-manager.
> Tercero: escandallo.
>
> Código: `modules/pizzepos/recetas/index.js` · `reflejo-1.3.0`
> Versión módulo: `2.2.0`

---

## 1 · LÓGICA (el reparto híbrido)

### Qué hace el REFLEJO (JS determinista)

| Operación | Coste | Tiempo |
|-----------|-------|--------|
| `recetas.listar.request` | ~0 tokens | < 5ms |
| `recetas.ingredientes.request` | ~0 tokens | < 5ms |
| `recetas.obtener.request` | ~0 tokens | < 5ms |
| `recetas.validar.request` | ~0 tokens | < 5ms (AJV) |
| `recetas.crear.request` | ~0 tokens | < 10ms (persist) |
| `escandallo.coste.calculado` | ~0 tokens | < 5ms (aplicar) |

### Qué hace el BLUEPRINT (LLM fuzzy)

| Operación | Coste |
|-----------|-------|
| Crear receta desde lenguaje natural | ~ turno LLM |
| Investigar ingredientes/variaciones | ~ turno LLM |
| Editar descripciones | ~ turno LLM |

### Store

```
/pizzepos/recetas.json       single-json-per-project
```

Persistencia scope `project`, single-writer. Cada proyecto tiene su propio
archivo de recetas en `storage/<project_id>/pizzepos/recetas.json`.

### Validación (AJV — freno)

`recetas.validar.request` valida la receta contra `receta.schema.json` (AJV).
Mata la línea hueca (cantidad:0, nombre vacío) sin prohibir el borrador.
El blueprint re-PIENSA solo lo roto, no la receta entera.

---

## 2 · EVENTOS (RPC en el bus)

### Atiende (request → response)

| Evento | Handler | Reflejo | Descripción |
|--------|---------|---------|-------------|
| `recetas.listar.request` | `onListarRequest` | ✅ | Lista recetas (proyección) sin turno LLM |
| `recetas.ingredientes.request` | `onIngredientesRequest` | ✅ | Catálogo de ingredientes |
| `recetas.obtener.request` | `onObtenerRequest` | ✅ | Una receta por id/nombre |
| `recetas.validar.request` | `onValidarRequest` | ✅ | Valida receta contra schema AJV (freno) |
| `recetas.crear.request` | `onCrearRequest` | ✅ | Persiste receta YA normalizada (el blueprint interpreta, el reflejo guarda) |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `escandallo.coste.calculado` | `onCosteCalculado` | Aplica el coste calculado al store de la receta |

### Patrón: crear desde el blueprint

```
1. USUARIO dice          → "crea una receta de pizza barbacoa con..."
2. BLUEPRINT interpreta  → lenguaje natural → estructura canónica
3. BLUEPRINT valida      → recetas.validar.request (AJV) → si falla, repiensa
4. BLUEPRINT persiste    → recetas.crear.request { receta normalizada }
5. REFLEJO recibe        → valida otra vez + slug + dedup + persist atómico
6. REFLEJO VERIFICA      → que aterrizó en disco ANTES de emitir receta.creada
                          (mata los fantasmas de guardado del LLM)
7. RESPUESTA             → { receta_id, nombre, ingredientes, coste }
```

---

## 3 · FLUJO TÍPICO

### Consultar recetas (reflejo, 0 tokens)

```
recetas.listar.request { project_id }
  → { recetas: [{ id, nombre, tipo, coste_unidad, rendimiento }] }

recetas.obtener.request { project_id, receta_id: "masa_klasica" }
  → { receta: { id, nombre, ingredientes: [...], coste_unidad, ... } }

recetas.ingredientes.request { project_id }
  → { ingredientes: [{ id, nombre, familia, precio, unidad }] }
```

### Costeo desde escandallo

```
1. ESCANDALLO costea    → escandallo.coste.calculado { receta_id, coste_total, coste_unidad }
2. RECETAS recibe       → onCosteCalculado → aplica al store
3. REFLEJO persiste     → escribe recetas.json con el nuevo coste
```

Antes esto era un turno LLM sintético por cada coste. Ahora es JS↔JS en ms.

---

## 4 · INTEGRACIÓN

> **Página activable:** `target_page_id: 'recetas'` — el ai-gateway enfoca
> al LLM en recetas. Cajones habilitados.

> **Lecturas rápidas:** usa `recetas.listar`, `recetas.obtener` y
> `recetas.ingredientes` directamente — son reflejo, 0 tokens, <5ms.

> **Creación:** el LLM interpreta el lenguaje natural, estructura la receta,
> la valida con `recetas.validar`, y persiste con `recetas.crear`.
> El reflejo verifica que aterrizó en disco antes de confirmar.

> **Coste:** `escandallo.coste.calculado` aplica el coste automáticamente.
> No hay que hacer nada — escandallo y recetas se comunican vía el bus.
