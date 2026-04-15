/**
 * SCHEMA VIABILIDAD RECETA v2
 *
 * Tablas para evaluar rentabilidad individual de cada receta:
 * - viabilidad_receta: Viabilidad actual de cada receta
 * - viabilidad_recomendacion: Sugerencias automáticas
 */

-- ==========================================
-- VIABILIDAD_RECETA (evaluación por receta)
-- ==========================================

CREATE TABLE IF NOT EXISTS viabilidad_receta (
  -- Identifiers
  id TEXT PRIMARY KEY,
  receta_id TEXT NOT NULL,
  proyecto_id TEXT NOT NULL,

  -- Inputs (from escandallo)
  escandallo_id TEXT,
  coste_porcion REAL NOT NULL,           -- € costo por porción
  precio_venta REAL,                     -- € precio de venta (si definido)

  -- Cálculos
  margen_bruto REAL,                     -- € precio_venta - coste_porcion
  margen_porcentaje REAL,                -- % margen / precio_venta
  food_cost_porcentaje REAL,             -- % coste_porcion / precio_venta
  markup REAL,                           -- multiplicador precio/coste

  -- Estado evaluado
  estado TEXT NOT NULL,                  -- VIABLE, ACEPTABLE, CRÍTICO, INVIABLE
  razon_estado TEXT,                     -- ¿Por qué este estado?

  -- Control
  evaluado_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  UNIQUE(proyecto_id, receta_id),
  FOREIGN KEY(proyecto_id) REFERENCES projects(id),
  FOREIGN KEY(receta_id) REFERENCES recetas(id)
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_viabilidad_proyecto
  ON viabilidad_receta(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_viabilidad_proyecto_estado
  ON viabilidad_receta(proyecto_id, estado);

CREATE INDEX IF NOT EXISTS idx_viabilidad_margen
  ON viabilidad_receta(proyecto_id, margen_porcentaje DESC);

CREATE INDEX IF NOT EXISTS idx_viabilidad_fecha
  ON viabilidad_receta(proyecto_id, evaluado_at DESC);

-- ==========================================
-- VIABILIDAD_RECOMENDACION (sugerencias)
-- ==========================================

CREATE TABLE IF NOT EXISTS viabilidad_recomendacion (
  -- Identifiers
  id TEXT PRIMARY KEY,
  receta_id TEXT NOT NULL,
  proyecto_id TEXT NOT NULL,

  -- Recomendación
  tipo TEXT NOT NULL,                    -- 'subir_precio', 'bajar_coste', 'reformular', 'eliminar'
  texto TEXT NOT NULL,                   -- Descripción legible
  prioridad TEXT NOT NULL,               -- CRÍTICA, ADVERTENCIA, INFO
  impacto_estimado REAL,                 -- € ganancia potencial si se implementa

  -- Detalles accionables
  detalles TEXT,                         -- JSON con variables (nuevo_precio, ingrediente_a_cambiar, etc)

  -- Control
  detectada_at INTEGER NOT NULL,
  implementada BOOLEAN DEFAULT 0,
  implementada_at INTEGER,

  -- Metadata
  created_at INTEGER NOT NULL,

  FOREIGN KEY(receta_id) REFERENCES recetas(id),
  FOREIGN KEY(proyecto_id) REFERENCES projects(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_recomendacion_proyecto
  ON viabilidad_recomendacion(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_recomendacion_sin_implementar
  ON viabilidad_recomendacion(proyecto_id, implementada);

CREATE INDEX IF NOT EXISTS idx_recomendacion_receta
  ON viabilidad_recomendacion(receta_id);

-- ==========================================
-- VU: v_viabilidad_con_estado
-- ==========================================

CREATE VIEW IF NOT EXISTS v_viabilidad_con_estado AS
SELECT
  vr.id,
  vr.receta_id,
  vr.proyecto_id,
  vr.coste_porcion,
  vr.precio_venta,
  vr.margen_bruto,
  vr.margen_porcentaje,
  vr.food_cost_porcentaje,
  vr.estado,
  vr.evaluado_at,
  COUNT(DISTINCT CASE WHEN vrec.prioridad = 'CRÍTICA' THEN vrec.id END) as recomendaciones_criticas,
  COUNT(DISTINCT CASE WHEN vrec.implementada = 0 THEN vrec.id END) as recomendaciones_sin_implementar
FROM viabilidad_receta vr
LEFT JOIN viabilidad_recomendacion vrec ON vr.receta_id = vrec.receta_id
GROUP BY vr.id;

-- ==========================================
-- PRAGMA: optimización
-- ==========================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
