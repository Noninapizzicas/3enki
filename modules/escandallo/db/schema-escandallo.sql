/**
 * SCHEMA ESCANDALLO v2
 *
 * Tablas simples:
 * - escandallo: cálculo de coste receta (total + porción)
 * - escandallo_alerts: alertas cuando ingrediente sube precio
 */

-- ==========================================
-- ESCANDALLO (cálculo principal)
-- ==========================================

CREATE TABLE IF NOT EXISTS escandallo (
  -- Identifiers
  id TEXT PRIMARY KEY,
  receta_id TEXT NOT NULL,
  proyecto_id TEXT NOT NULL,

  -- Costes calculados
  coste_total REAL NOT NULL,           -- € totales
  coste_porcion REAL NOT NULL,         -- € por porción

  -- Snapshot de precios usados (JSON)
  precio_mercado_snapshot TEXT,        -- JSON: {ingrediente: precio, ...}

  -- Control
  calculado_at INTEGER NOT NULL,       -- timestamp when calculated
  precio_snapshot_fecha INTEGER,       -- timestamp of prices snapshot

  -- Notas si falta algo
  notas TEXT,                          -- "Falta precio: azúcar, sal"

  -- Metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  UNIQUE(proyecto_id, receta_id),
  FOREIGN KEY(proyecto_id) REFERENCES projects(id),
  FOREIGN KEY(receta_id) REFERENCES recetas(id)
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_escandallo_proyecto
  ON escandallo(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_escandallo_proyecto_coste
  ON escandallo(proyecto_id, coste_porcion);

CREATE INDEX IF NOT EXISTS idx_escandallo_fecha
  ON escandallo(proyecto_id, calculado_at DESC);

CREATE INDEX IF NOT EXISTS idx_escandallo_receta
  ON escandallo(receta_id);

-- ==========================================
-- ESCANDALLO_ALERTS (cambios de precio)
-- ==========================================

CREATE TABLE IF NOT EXISTS escandallo_alerts (
  -- Identifiers
  id TEXT PRIMARY KEY,
  escandallo_id TEXT NOT NULL,
  proyecto_id TEXT NOT NULL,

  -- Alerta
  tipo_alerta TEXT NOT NULL,           -- 'precio_subio', 'precio_bajo', 'falta_precio'
  ingrediente_nombre TEXT NOT NULL,
  precio_anterior REAL,
  precio_nuevo REAL,
  porcentaje_cambio REAL,              -- 15.5 = +15.5%

  -- Control
  detectada_at INTEGER NOT NULL,
  leida BOOLEAN DEFAULT 0,             -- Si usuario ya vio alerta
  leida_at INTEGER,

  -- Metadata
  created_at INTEGER NOT NULL,

  FOREIGN KEY(escandallo_id) REFERENCES escandallo(id),
  FOREIGN KEY(proyecto_id) REFERENCES projects(id)
);

-- Índices para alertas
CREATE INDEX IF NOT EXISTS idx_escandallo_alerts_proyecto
  ON escandallo_alerts(proyecto_id);

CREATE INDEX IF NOT EXISTS idx_escandallo_alerts_sin_leer
  ON escandallo_alerts(proyecto_id, leida);

CREATE INDEX IF NOT EXISTS idx_escandallo_alerts_escandallo
  ON escandallo_alerts(escandallo_id);

-- ==========================================
-- VU: v_escandallo_con_alerta
-- ==========================================

CREATE VIEW IF NOT EXISTS v_escandallo_con_alerta AS
SELECT
  e.id,
  e.receta_id,
  e.proyecto_id,
  e.coste_total,
  e.coste_porcion,
  e.calculado_at,
  COUNT(CASE WHEN ea.leida = 0 THEN 1 END) as alertas_sin_leer,
  MAX(ea.porcentaje_cambio) as max_cambio_porcentaje
FROM escandallo e
LEFT JOIN escandallo_alerts ea ON e.id = ea.escandallo_id
GROUP BY e.id;

-- ==========================================
-- INGREDIENTE_PRECIOS_CACHE (búsqueda de precios)
-- ==========================================

CREATE TABLE IF NOT EXISTS ingrediente_precios_cache (
  -- Identifiers
  id TEXT PRIMARY KEY,
  ingrediente_nombre TEXT NOT NULL,

  -- Precio encontrado
  precio REAL NOT NULL,
  fuente TEXT NOT NULL,           -- mercadona_api, carrefour_scraping, google_images_ocr, historico
  confianza TEXT,                 -- alta, media, baja

  -- Validez
  buscado_at INTEGER NOT NULL,    -- timestamp cuando se buscó
  valido_hasta INTEGER NOT NULL,  -- timestamp cuando expira (24h)

  -- Control
  created_at INTEGER NOT NULL,

  UNIQUE(ingrediente_nombre, buscado_at)
);

-- Índices para cache
CREATE INDEX IF NOT EXISTS idx_precio_cache_ingrediente
  ON ingrediente_precios_cache(ingrediente_nombre);

CREATE INDEX IF NOT EXISTS idx_precio_cache_valido
  ON ingrediente_precios_cache(valido_hasta);

-- ==========================================
-- PRAGMA: optimización
-- ==========================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
