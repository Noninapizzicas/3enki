---
name: catalogo-modelos
description: >-
  Catálogo de modelos 3D del taller (CUSTODIO del proyecto 3D): registrar,
  listar, obtener, categorías y metadatos, persistido por proyecto. Es el
  único escritor de su store (Map<id,Modelo>).
when-to-use: >-
  Cuando necesites registrar un modelo 3D en el catálogo del taller, listar
  los modelos de un proyecto, obtener uno por id, consultar las categorías
  distintas, o entender cómo persiste el catálogo por proyecto. Lo llaman
  importacion-modelo (tras leer el .3mf) y el dueño.
tags: [enki, 3d, catalogo, custodio, modelo, reflejo]
---

# 3D · catalogo-modelos

> **Qué es.** El CUSTODIO del catálogo de modelos 3D del taller personal de
> impresión 3D. Registra cada modelo (append), lo lista, lo obtiene por id,
> y deriva las categorías distintas y los metadatos. Es el **único escritor**
> de su store `Map<id,Modelo>` — nadie más escribe en él.
>
> **Tipo:** CUSTODIO (reflejo JS puro, determinista, 0 fuzzy).
>
> Código: `modules/catalogo-modelos/index.js` · v0.1.0 (reflejo-0.1.0)
> Manifest: `modules/catalogo-modelos/module.json`
> Plan: `plan-construccion.md` sección 6.1 (piezas 1.1, 1.2, 1.3)

---

## 1 · LÓGICA

El catálogo es un **CUSTODIO**: guarda el estado (los modelos) y es el único
que escribe en su store. No calcula nada externo ni orquesta: solo registra,
lista, obtiene y deriva proyecciones internas.

**Estado:** `this.modelos = new Map()` — `id → Modelo`.

**Persistencia por proyecto** vía `_shared/pos-persistencia`:
- Fichero: `/3d/catalogo/catalogo-modelos.json` (snapshot fs por `project_id`, debounced).
- `snapshot(pid)` → solo los modelos de ese proyecto.
- `hidratar(pid, data)` → repuebla el Map.
- Restaura en `project.activated` (`onProjectActivated`).
- Vuelca en `onUnload` (`flush` + `detener`).

**Estructura de un Modelo** (campos con huecos nombrados, nunca inventados):

```json
{
  "id": "uuid",
  "project_id": "e57a318a-...",
  "nombre": "Soporte de llaves",
  "categoria": "utilidad | sin_categoria",
  "archivo3mf": "ruta.3mf | null",
  "origen": "desconocido | ...",
  "metadatos": {
    "material": "desconocido | ...",
    "dimensiones": "desconocido | ...",
    "tiempo_estimado": "desconocido | ...",
    "peso_estimado": "desconocido | ..."
  },
  "created_at": "ISO-8601"
}
```

**Proyecciones internas** (piezas del esquema):
- `_registrar` (1.1) — append + emite `catalogo.modelo_registrado`.
- `_categorias` (1.2) — categorías distintas de `listar`, ordenadas.
- `_metadatos` (1.3) — huecos como `desconocido` (nunca inventado).

---

## 2 · RPCs (request/response)

El módulo **escucha** 4 RPCs y responde con `catalogo.<op>.response`. Todos
pasan por `_atender(e, op, responseEvent, fn)`.

### `catalogo.registrar.request` → `catalogo.registrar.response`

Registra un modelo nuevo (append). Lo llama `importacion-modelo` (tras leer
el .3mf) y el dueño.

**Request:**
```json
{
  "project_id": "e57a318a-...",
  "nombre": "Soporte de llaves",
  "categoria": "utilidad",
  "archivo3mf": "soporte.3mf",
  "origen": "thingiverse",
  "metadatos": { "material": "PLA", "dimensiones": "80x40x10" },
  "correlation_id": "opcional"
}
```

**Response 201:**
```json
{ "status": 201, "data": { "modelo": { "id": "uuid", "project_id": "...", "nombre": "...", "categoria": "...", "archivo3mf": "...", "origen": "...", "metadatos": { "...": "..." }, "created_at": "..." } } }
```

**Errores:**
| Código | HTTP | Cuándo |
|---|---|---|
| `INVALID_INPUT` | 400 | falta `nombre` o `project_id` |
| `ALREADY_EXISTS` | 409 | el `id` ya existe en el catálogo (NO sobreescribe) |

### `catalogo.listar.request` → `catalogo.listar.response`

Lista los modelos del proyecto (filtra por `project_id`).

**Request:** `{ "project_id": "..." }`

**Response 200:**
```json
{ "status": 200, "data": { "modelos": [ { "id": "...", "nombre": "...", "categoria": "...", "archivo3mf": "...", "origen": "..." } ], "total": 1 } }
```

### `catalogo.obtener.request` → `catalogo.obtener.response`

Obtiene un modelo por `id`.

**Request:** `{ "id": "uuid" }`

**Response 200:** `{ "status": 200, "data": { "modelo": { ... } } }`

**Error:** `RESOURCE_NOT_FOUND` (404) si el id no existe.

### `catalogo.categorias.request` → `catalogo.categorias.response`

Categorías distintas del catálogo (pieza 1.2), ordenadas alfabéticamente.

**Request:** `{ "project_id": "..." }`

**Response 200:**
```json
{ "status": 200, "data": { "categorias": ["sin_categoria", "utilidad"], "total": 2 } }
```

---

## 3 · EVENTOS

### Publica
| Evento | Cuándo |
|---|---|
| `catalogo.modelo_registrado` | al registrar un modelo nuevo (payload: `modelo_id`, `nombre`, `categoria`, `project_id`, `correlation_id`, `timestamp`) |
| `catalogo.registrar.failed` | par de fallo: el registro no se completó (input inválido o duplicado) |

### Escucha
| Evento | Handler |
|---|---|
| `catalogo.registrar.request` | `onRegistrarRequest` |
| `catalogo.listar.request` | `onListarRequest` |
| `catalogo.obtener.request` | `onObtenerRequest` |
| `catalogo.categorias.request` | `onCategoriasRequest` |
| `project.activated` | `onProjectActivated` (restaura el store del proyecto) |

> **Regla de cierre de círculo:** todo flujo cierra con un par de resultado
> canónico. El registro emite `catalogo.modelo_registrado` SOLO si se completó
> (status 201); si falla, emite `catalogo.registrar.failed`. Nadie da por hecho
> un registro sin `ok:true`/201 explícito.

---

## 4 · REGLAS DE NEGOCIO

1. **Único escritor del store** — el catálogo es el único que escribe en
   `Map<id,Modelo>`. Invariante del sistema #2.
2. **Deduplicación por `id`** — si el `id` ya existe, responde
   `ALREADY_EXISTS` (409) y **NO sobreescribe** el modelo original.
3. **Validación de entrada** — `nombre` y `project_id` son obligatorios; sin
   ellos → `INVALID_INPUT` (400) y no se guarda nada.
4. **Dato ausente nombrado, nunca inventado** — `categoria` por defecto
   `sin_categoria`; `origen` por defecto `desconocido`; metadatos con huecos
   → `desconocido`. Invariante del sistema #5.
5. **Persistencia por proyecto** — el store se restaura en `project.activated`
   y se vuelca en `onUnload`; cada proyecto ve solo sus modelos.
6. **Determinismo total** — 0 piezas fuzzy; el dueño aporta todo el juicio.

---

## 5 · FLUJO TÍPICO

**Flujo A — Registro de modelo** (del plan-construccion.md):
```
dueño busca → busqueda-repositorios.buscar
  → dueño elige → importacion-modelo.importar
  → adaptador-slicing.leer_3mf
  → catalogo-modelos.registrar  ← ESTE MÓDULO
  → catalogo.modelo_registrado
```

**Consumidores de `catalogo.modelo_registrado`:** `cola-impresion`,
`adaptador-avisos`.

**Llamadores de los RPCs del catálogo:**
- `catalogo.registrar.request` → `importacion-modelo`, dueño
- `catalogo.listar.request` → `adaptador-avisos` (panel), `ciclo-impresion`
- `catalogo.obtener.request` → `cola-impresion`, `ciclo-impresion`
- `catalogo.categorias.request` → `adaptador-avisos`

---

## 6 · VERIFICACIÓN

Test unitario de la proyección principal `_registrar` (pura, sin bus ni fs):

```bash
node modules/catalogo-modelos/tests/unit/catalogo-modelos__registrar.test.js
```

Cubre: modelo bien formado → 201 + guardado + emite `modelo_registrado`;
sin `nombre` → 400; sin `project_id` → 400; `id` duplicado → 409 y NO
sobreescribe; metadatos con huecos → `desconocido`; `listar` filtra por
`project_id`.

**Gate:** `validate-hibridos` (manifest válido: `name` + `version` +
`description`; en la allowlist `config.modules.enabled`).
