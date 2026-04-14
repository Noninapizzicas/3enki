/**
 * SCHEMA SQLITE PARA RECETAS V2
 *
 * Diseño:
 * - recetas: catalogo de recetas actuales
 * - receta_versiones: historial completo (audit trail)
 * - ingredientes: catalogo de ingredientes por proyecto
 * - receta_ingredientes: junction table (receta → ingredientes)
 *
 * Índices estratégicos para búsqueda (40+ criterios)
 */

-- ========================================
-- TABLAS PRINCIPALES
-- ========================================

CREATE TABLE IF NOT EXISTS recetas (
  id TEXT PRIMARY KEY,
  proyecto_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,

  -- Metadatos
  version_actual INTEGER DEFAULT 1,
  estado TEXT DEFAULT 'activa' CHECK(estado IN ('activa', 'archivada', 'borrador')),

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT,
  updated_by TEXT,

  -- Origen
  fuente TEXT CHECK(fuente IN ('url', 'pdf', 'imagen', 'manual', 'investigada')),
  fuente_url TEXT,

  UNIQUE(proyecto_id, nombre)
);

CREATE TABLE IF NOT EXISTS receta_versiones (
  id TEXT PRIMARY KEY,
  receta_id TEXT NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,

  -- Versionado
  version_num INTEGER NOT NULL,

  -- Datos completos (snapshot para rollback)
  datos_json TEXT NOT NULL,  -- JSON serializado con todo: ingredientes, instrucciones, etc.

  -- Auditoría
  cambios_json TEXT,  -- Diff legible: {campo: {anterior, nuevo}}
  changed_by TEXT,    -- Usuario o agente que cambió
  changed_at INTEGER NOT NULL,

  -- Rollback
  es_revertida INTEGER DEFAULT 0,
  revertida_a_version_id TEXT REFERENCES receta_versiones(id)
);

CREATE TABLE IF NOT EXISTS ingredientes (
  id TEXT PRIMARY KEY,
  proyecto_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  categoria TEXT,

  -- Precios
  unidad_base TEXT DEFAULT 'kg',  -- kg, l, ud, etc.
  precio_mercado_kg REAL,
  precio_compra_kg REAL,
  fuente_precio TEXT,

  -- Metadatos nutricionales/alérgenos
  alerge nos TEXT,  -- JSON array: ['gluten', 'lactosa', 'huevo']
  notas TEXT,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  UNIQUE(proyecto_id, nombre)
);

CREATE TABLE IF NOT EXISTS receta_ingredientes (
  id TEXT PRIMARY KEY,
  receta_id TEXT NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  ingrediente_id TEXT NOT NULL REFERENCES ingredientes(id),

  cantidad REAL NOT NULL,
  unidad TEXT NOT NULL,  -- g, ml, ud, cucharada, etc.

  -- Precio at time of recipe creation (snapshot)
  precio_mercado_en_momento REAL,
  precio_compra_en_momento REAL,

  notas TEXT,

  PRIMARY KEY (receta_id, ingrediente_id)
);

CREATE TABLE IF NOT EXISTS receta_search_index (
  receta_id TEXT PRIMARY KEY REFERENCES recetas(id) ON DELETE CASCADE,
  proyecto_id TEXT NOT NULL,

  -- 40+ criterios de búsqueda (desnormalizados para búsqueda rápida)
  nombre_lower TEXT,

  -- Métodos de cocción
  metodos_coccion TEXT,      -- JSON: ['caliente', 'frio', 'horno', 'plancha']

  -- Tipo de plato
  tipos_plato TEXT,          -- JSON: ['segundo', 'postre', 'entrada', 'finales']

  -- Dificultad
  dificultad_min INTEGER,
  dificultad_max INTEGER,

  -- Tiempos
  tiempo_prep_min INTEGER,
  tiempo_prep_max INTEGER,

  -- Costes
  coste_porcion_min REAL,
  coste_porcion_max REAL,

  -- Características
  caracteristicas TEXT,      -- JSON: ['vegetariano', 'sin_gluten', 'sin_lactosa']
  alerge nos_excluir TEXT,    -- JSON: ['huevo', 'cacahuete']

  -- Ingredientes (desnormalizados para LIKE search)
  ingredientes_nombres TEXT,  -- Concatenado con |
  ingredientes_json TEXT,     -- JSON array completo para búsqueda avanzada

  -- Tags
  etiquetas TEXT,             -- JSON: ['italiana', 'clasica']
  tags_custom TEXT,           -- JSON: ['favorita', 'probada']

  -- Viabilidad
  viabilidad TEXT CHECK(viabilidad IN ('baja', 'media', 'alta')),

  -- Otros
  coste_total_estimado REAL,
  porciones INTEGER,

  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS receta_feedback (
  id TEXT PRIMARY KEY,
  receta_id TEXT NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  tipo TEXT CHECK(tipo IN ('mejora', 'error', 'variante', 'nota')),
  feedback TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

-- ========================================
-- ÍNDICES PARA PERFORMANCE
-- ========================================

-- Búsqueda por proyecto
CREATE INDEX IF NOT EXISTS idx_recetas_proyecto ON recetas(proyecto_id, estado);

-- Búsqueda por nombre (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_recetas_nombre ON recetas(proyecto_id, nombre);

-- Versionado: historial de una receta
CREATE INDEX IF NOT EXISTS idx_versiones_receta ON receta_versiones(receta_id, version_num DESC);

-- Ingredientes por proyecto
CREATE INDEX IF NOT EXISTS idx_ingredientes_proyecto ON ingredientes(proyecto_id, nombre);

-- Search index: búsqueda multi-criterio
CREATE INDEX IF NOT EXISTS idx_search_proyecto ON receta_search_index(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_search_viabilidad ON receta_search_index(proyecto_id, viabilidad);
CREATE INDEX IF NOT EXISTS idx_search_dificultad ON receta_search_index(proyecto_id, dificultad_min, dificultad_max);
CREATE INDEX IF NOT EXISTS idx_search_tiempo ON receta_search_index(proyecto_id, tiempo_prep_min, tiempo_prep_max);

-- Feedback: auditoría
CREATE INDEX IF NOT EXISTS idx_feedback_receta ON receta_feedback(receta_id, created_at DESC);

-- ========================================
-- VISTAS ÚTILES
-- ========================================

CREATE VIEW IF NOT EXISTS recetas_latest_versiones AS
SELECT
  r.id, r.proyecto_id, r.nombre, r.descripcion,
  r.estado, r.fuente,
  rv.version_num,
  rv.datos_json,
  rv.changed_at,
  rv.changed_by
FROM recetas r
LEFT JOIN receta_versiones rv ON r.id = rv.receta_id AND rv.version_num = r.version_actual;

CREATE VIEW IF NOT EXISTS recetas_costes_resumen AS
SELECT
  r.proyecto_id,
  COUNT(*) as total_recetas,
  AVG(CAST(json_extract(rv.datos_json, '$.coste_total') AS REAL)) as coste_promedio,
  MIN(CAST(json_extract(rv.datos_json, '$.coste_total') AS REAL)) as coste_minimo,
  MAX(CAST(json_extract(rv.datos_json, '$.coste_total') AS REAL)) as coste_maximo
FROM recetas r
LEFT JOIN receta_versiones rv ON r.id = rv.receta_id AND rv.version_num = r.version_actual
WHERE r.estado = 'activa'
GROUP BY r.proyecto_id;
