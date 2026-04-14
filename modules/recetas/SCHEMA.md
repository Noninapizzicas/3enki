# Modelo de Datos - Recetas v2

## Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ recetas (tabla principal)                                    │
├──────────────────────────────────────────────────────────────┤
│ id STRING PRIMARY KEY                                        │
│ proyecto_id STRING FOREIGN KEY                              │
│ nombre STRING                                                │
│ descripcion TEXT                                             │
│ categoria STRING                                             │
│ porciones INTEGER                                            │
│ tiempo_preparacion INTEGER (minutos)                        │
│ dificultad INTEGER (1-10)                                   │
│ data_completa JSON (todos los campos)                       │
│ version INTEGER                                              │
│ estado STRING ('activa' | 'borrador' | 'archivada')         │
│ created_at INTEGER (timestamp)                              │
│ updated_at INTEGER (timestamp)                              │
└──────────────────────────────────────────────────────────────┘
            │
            ├──────────────┬──────────────────┐
            │              │                  │
            ▼              ▼                  ▼
┌──────────────────┐  ┌──────────────────────────┐  ┌────────────────────────┐
│ receta_versiones │  │ receta_ingredientes      │  │ receta_search_index    │
├──────────────────┤  ├──────────────────────────┤  ├────────────────────────┤
│ id (PK)          │  │ id (PK)                  │  │ receta_id (PK)         │
│ receta_id (FK)   │  │ receta_id (FK)           │  │ proyecto_id (FK)       │
│ version          │  │ ingrediente_id (FK)      │  │ nombre_lower           │
│ snapshot JSON    │  │ cantidad                 │  │ metodos_coccion JSON   │
│ cambios_desc     │  │ unidad                   │  │ tipos_plato JSON       │
│ cambiado_por     │  │ precio                   │  │ dificultad_min/max     │
│ cambiado_at      │  │ notas                    │  │ tiempo_prep_min/max    │
└──────────────────┘  │ added_at                 │  │ coste_porcion_min/max  │
                      │ removed_at               │  │ caracteristicas JSON   │
                      └──────────────────────────┘  │ alerge nos JSON        │
                               │                    │ ingredientes_nombres   │
                               │                    │ ingredientes_json      │
                               │                    │ etiquetas JSON         │
                               │                    │ viabilidad             │
                               │                    │ coste_total            │
                               │                    │ porciones              │
                               │                    │ created_at             │
                               │                    │ updated_at             │
                               │                    └────────────────────────┘
                               │
                               ▼
                      ┌──────────────────┐
                      │ ingredientes     │
                      ├──────────────────┤
                      │ id (PK)          │
                      │ proyecto_id (FK) │
                      │ nombre           │
                      │ precio_mercado   │
                      │ alerge nos JSON  │
                      │ categoria        │
                      │ estacional       │
                      │ added_at         │
                      └──────────────────┘

┌──────────────────────┐
│ receta_feedback      │
├──────────────────────┤
│ id (PK)              │
│ receta_id (FK)       │
│ rating (1-5)         │
│ comentario           │
│ usuario_id           │
│ created_at           │
└──────────────────────┘
```

## Tablas

### `recetas`
Tabla principal con recetas activas

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | STRING | `rec_{slug}_{timestamp}` |
| `proyecto_id` | STRING | Aislamiento por proyecto |
| `nombre` | STRING | Índice LOWER |
| `descripcion` | TEXT | Opcional |
| `categoria` | STRING | Pastas, Carnes, Postres, etc. |
| `porciones` | INTEGER | > 0 |
| `tiempo_preparacion` | INTEGER | Minutos |
| `dificultad` | INTEGER | 1-10 |
| `data_completa` | JSON | Snapshot completo |
| `version` | INTEGER | Número de versión actual |
| `estado` | STRING | activa / borrador / archivada |
| `created_at` | INTEGER | Timestamp (ms) |
| `updated_at` | INTEGER | Timestamp (ms) |

**Índices:**
- PRIMARY KEY (id)
- UNIQUE (proyecto_id, nombre) - evita duplicados por proyecto
- (proyecto_id, estado, updated_at) - búsqueda rápida

---

### `receta_versiones`
Historial completo de cambios (immutable)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | INTEGER | Auto-increment, nunca se borra |
| `receta_id` | STRING | FK → recetas.id |
| `version` | INTEGER | Número de versión (1, 2, 3, ...) |
| `snapshot` | JSON | Receta COMPLETA en ese momento |
| `cambios_descripcion` | STRING | Qué cambió |
| `cambiado_por` | STRING | Usuario/agente que hizo cambio |
| `cambiado_at` | INTEGER | Timestamp |

**Índices:**
- (receta_id, version DESC) - historial rápido
- (cambio_at DESC) - timeline global

**Garantías:**
- Append-only: versiones nunca se borran/editan
- Rollback: revertir = copiar snapshot de versión anterior a receta + crear nueva versión

---

### `ingredientes`
Catálogo por proyecto

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | STRING | `ing_{nombre_slug}_{proyecto}` |
| `proyecto_id` | STRING | FK → projects.id |
| `nombre` | STRING | Normalizado |
| `precio_mercado` | REAL | €/kg (puede ser NULL = pendiente) |
| `alerge nos` | JSON | ["gluten", "lactosa", ...] |
| `categoria` | STRING | granos, carnes, lácteos, etc. |
| `estacional` | BOOLEAN | Hay variación de precio por época |
| `added_at` | INTEGER | Timestamp |

**Índices:**
- PRIMARY KEY (id)
- UNIQUE (proyecto_id, nombre)

**Nota:** Precio es por kg. Agents calculan en función de cantidad + unidad.

---

### `receta_ingredientes`
Relación many-to-many con historial

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | INTEGER | PK |
| `receta_id` | STRING | FK |
| `ingrediente_id` | STRING | FK |
| `cantidad` | REAL | 300 (para 300g pasta) |
| `unidad` | STRING | g, ml, ud, cucharada, etc. |
| `precio` | REAL | Caché: precio en momento de guardado |
| `notas` | STRING | "fresco", "picado", etc. |
| `added_at` | INTEGER | Cuándo se agregó |
| `removed_at` | INTEGER | NULL si aún está activo |

**Índices:**
- (receta_id, ingrediente_id)
- (removed_at IS NULL) - filtra activos

**Nota:** `removed_at` permite ver historial de cambios en ingredientes sin borrar.

---

### `receta_search_index`
Tabla desnormalizada para búsqueda rápida (40+ criterios)

| Campo | Tipo | Notas |
|-------|------|-------|
| `receta_id` | STRING | PK, FK → recetas.id |
| `proyecto_id` | STRING | FK |
| `nombre_lower` | STRING | Búsqueda LIKE insensitiva |
| `metodos_coccion` | JSON | ["caliente", "frio"] |
| `tipos_plato` | JSON | ["segundo", "postre"] |
| `dificultad_min` | INTEGER | Min y max porque pueden variar |
| `dificultad_max` | INTEGER | |
| `tiempo_prep_min` | INTEGER | Minutos |
| `tiempo_prep_max` | INTEGER | |
| `coste_porcion_min` | REAL | € |
| `coste_porcion_max` | REAL | |
| `caracteristicas` | JSON | ["vegetariano", "sin_gluten"] |
| `alerge nos` | JSON | ["gluten", "huevo"] |
| `ingredientes_nombres` | STRING | "pasta \| jamón \| huevo" (para LIKE) |
| `ingredientes_json` | JSON | Estructura completa |
| `etiquetas` | JSON | ["italiana", "clasica"] |
| `viabilidad` | STRING | alta / media / baja |
| `coste_total` | REAL | € |
| `porciones` | INTEGER | |
| `created_at` | INTEGER | Timestamp |
| `updated_at` | INTEGER | Timestamp |

**Índices:**
- PRIMARY KEY (receta_id)
- (proyecto_id, nombre_lower) - búsqueda por proyecto
- (proyecto_id, viabilidad) - filtro viabilidad
- (proyecto_id, dificultad_min) - filtro dificultad
- (proyecto_id, tiempo_prep_min) - filtro tiempo
- (proyecto_id, coste_porcion_min) - filtro coste

**Nota:** Se actualiza cada vez que se guarda/versiona una receta. Es **denormalizado** por velocidad: mejor tener algunos datos duplicados que hacer 5-10 JOINs en búsqueda.

---

### `receta_feedback`
Ratings y comentarios de usuarios

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | INTEGER | PK |
| `receta_id` | STRING | FK |
| `rating` | INTEGER | 1-5 |
| `comentario` | TEXT | Opcional |
| `usuario_id` | STRING | Quién valoró |
| `created_at` | INTEGER | Timestamp |

**Índices:**
- (receta_id, rating) - para calcular promedio

---

## SQL Views

### `v_receta_con_ingredientes`
```sql
SELECT 
  r.id, r.nombre, r.porciones, r.tiempo_preparacion, r.dificultad,
  COUNT(ri.id) as num_ingredientes,
  ROUND(AVG(rf.rating), 1) as rating_promedio
FROM recetas r
LEFT JOIN receta_ingredientes ri ON r.id = ri.receta_id AND ri.removed_at IS NULL
LEFT JOIN receta_feedback rf ON r.id = rf.receta_id
GROUP BY r.id
```

### `v_ingrediente_uso`
```sql
SELECT 
  i.nombre,
  COUNT(DISTINCT ri.receta_id) as num_recetas,
  AVG(i.precio_mercado) as precio_promedio
FROM ingredientes i
LEFT JOIN receta_ingredientes ri ON i.id = ri.ingrediente_id AND ri.removed_at IS NULL
GROUP BY i.id
```

---

## Transacciones

### Create Receta
```
BEGIN TRANSACTION
  INSERT INTO recetas (id, proyecto_id, nombre, ...)
  INSERT INTO receta_versiones (receta_id, version=1, snapshot)
  INSERT INTO receta_search_index (receta_id, ...)
  INSERT INTO receta_ingredientes (receta_id, ingrediente_id, ...)
COMMIT
```

### Update Receta (nueva versión)
```
BEGIN TRANSACTION
  UPDATE recetas SET version = version+1, updated_at = NOW()
  INSERT INTO receta_versiones (receta_id, version=N+1, snapshot, cambios_desc, cambiado_por)
  UPDATE receta_search_index SET ... (actualizar campos denormalizados)
  UPDATE/INSERT INTO receta_ingredientes (si hubo cambios)
COMMIT
```

### Revert to Version N
```
BEGIN TRANSACTION
  SELECT snapshot FROM receta_versiones WHERE receta_id = X AND version = N
  UPDATE recetas SET data_completa = snapshot, version = MAX_VERSION+1
  INSERT INTO receta_versiones (receta_id, version=MAX_VERSION+1, snapshot, cambios_desc='Reverted to version N', cambiado_por=usuario)
  UPDATE receta_search_index SET ...
COMMIT
```

---

## Data Types & Constraints

- **STRING/TEXT**: UTF-8, sin límite (SQLite)
- **INTEGER**: 64-bit signed
- **REAL**: IEEE 754 floating point (€ con 2 decimales)
- **JSON**: TEXT stored as JSON (validado por schema)
- **BOOLEAN**: INTEGER (0/1)

### Validaciones de Aplicación

- `porciones` > 0
- `tiempo_preparacion` >= 0
- `dificultad` 1-10
- `cantidad` > 0
- `precio_mercado` >= 0
- `estado` ∈ {activa, borrador, archivada}
- `viabilidad` ∈ {alta, media, baja}

---

## Índices - Estrategia

**Búsqueda rápida:**
- (proyecto_id, nombre_lower) - búsquedas por texto
- (proyecto_id, viabilidad, updated_at DESC) - listados filtrados

**Versionado:**
- (receta_id, version DESC) - historial
- (cambio_at DESC) - timeline

**Integridad:**
- PRIMARY KEY + FOREIGN KEY + UNIQUE constraints

**Performance:**
- WAL mode para concurrencia
- PRAGMA synchronous = NORMAL (balance entre velocidad y seguridad)
- Índices compound (proyecto_id, ...) porque datos están aislados por proyecto

---

## Notas de Diseño

1. **Per-project isolation:** Cada proyecto tiene datos completamente separados (por proyecto_id)
2. **Immutable versions:** receta_versiones nunca se actualiza/borra, solo INSERT
3. **Denormalized search:** receta_search_index replica datos por velocidad (búsqueda es crítica)
4. **Soft delete para ingredientes:** removed_at = NULL significa activo (permite historial)
5. **JSON para flexibilidad:** Metadata como JSON permite agregar campos sin migración
6. **Timestamps en ms:** Precisión mayor para auditoría
