/**
 * Escandallo Manager v2
 *
 * Responsabilidades:
 * - Cálculo de coste: receta + ingredientes + precios = coste total + porción
 * - Persistencia simple (sin versionado complejo)
 * - Detección de alertas (ingrediente subió precio)
 * - Búsqueda por rango de coste con filtros y ranking
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const SearchFilters = require('./search-filters');
const SearchRanker = require('./search-ranker');

class EscandalloManager {
  constructor(projectId, basePath, logger) {
    this.projectId = projectId;
    this.basePath = basePath;
    this.logger = logger;
    this.db = null;
    this.dbPath = null;

    // Search utilities
    this.filters = new SearchFilters(logger);
    this.ranker = new SearchRanker(logger);
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async init() {
    try {
      const dbDir = path.join(this.basePath, 'data', 'projects', this.projectId);
      await fs.mkdir(dbDir, { recursive: true });
      this.dbPath = path.join(dbDir, 'recetas.db');

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          this.logger.error('escandallo.db_open_failed', { projectId: this.projectId, error: err.message });
          throw err;
        }
      });

      await new Promise((resolve, reject) => {
        this.db.serialize(() => {
          this.db.run('PRAGMA foreign_keys = ON');
          this.db.run('PRAGMA journal_mode = WAL');
          this.db.run('PRAGMA synchronous = NORMAL');
          resolve();
        });
        this.db.on('error', reject);
      });

      // Aplicar schema
      await this._applySchema();
      this.logger.info('escandallo.initialized', { projectId: this.projectId, dbPath: this.dbPath });
    } catch (err) {
      this.logger.error('escandallo.init_failed', { projectId: this.projectId, error: err.message });
      throw err;
    }
  }

  async _applySchema() {
    try {
      const schemaPath = path.join(__dirname, '..', 'db', 'schema-escandallo.sql');
      const schema = await fs.readFile(schemaPath, 'utf-8');

      const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('/**') && !s.startsWith('--'));

      for (const statement of statements) {
        await this.run(statement);
      }

      this.logger.info('escandallo.schema_applied', { projectId: this.projectId });
    } catch (err) {
      this.logger.error('escandallo.schema_apply_failed', { projectId: this.projectId, error: err.message });
      throw err;
    }
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.close((err) => {
        if (err) reject(err);
        else {
          this.logger.info('escandallo.closed', { projectId: this.projectId });
          resolve();
        }
      });
    });
  }

  // ==========================================
  // Helper: Promise wrappers
  // ==========================================

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // ==========================================
  // Core Calculation
  // ==========================================

  /**
   * Calcula escandallo para una receta
   *
   * @param {string} recetaId - ID de receta
   * @param {Object} receta - Receta completa con ingredientes
   * @param {Object} preciosMercado - {nombre_ingrediente: precio_kg}
   * @returns {Promise<{coste_total, coste_porcion, notas, snapshot}>}
   */
  async calculateEscandallo(recetaId, receta, preciosMercado) {
    let costeTotal = 0;
    let notas = [];
    const snapshot = {};

    // Iterar ingredientes
    for (const ing of receta.ingredientes || []) {
      const precioMercado = preciosMercado[ing.nombre];

      if (!precioMercado) {
        notas.push(`Falta precio mercado: ${ing.nombre}`);
        snapshot[ing.nombre] = null;
        continue;
      }

      // Convertir a kg (simplificado: precio_mercado es €/kg)
      const costoIngrediente = this._calculateIngredientCost(ing.cantidad, ing.unidad, precioMercado);
      costeTotal += costoIngrediente;
      snapshot[ing.nombre] = precioMercado;
    }

    const costePorcion = receta.porciones > 0 ? costeTotal / receta.porciones : 0;

    return {
      coste_total: Math.round(costeTotal * 100) / 100, // 2 decimales
      coste_porcion: Math.round(costePorcion * 100) / 100,
      notas: notas.length > 0 ? notas.join('; ') : null,
      snapshot: JSON.stringify(snapshot),
      snapshot_fecha: Date.now()
    };
  }

  /**
   * Calcula coste de un ingrediente
   * Simplificado: asume precio_mercado es por kg
   */
  _calculateIngredientCost(cantidad, unidad, precioMercado) {
    // Conversión simple a kg
    const unidadAKg = {
      'g': 0.001,
      'kg': 1,
      'ml': 0.001, // Simplificación: 1ml ≈ 1g
      'l': 1,
      'ud': 0.1 // Unidad: asumir ~100g promedio
    };

    const factor = unidadAKg[unidad] || 1;
    const cantidadKg = cantidad * factor;

    return cantidadKg * precioMercado;
  }

  // ==========================================
  // CRUD
  // ==========================================

  /**
   * Crea o actualiza escandallo
   */
  async saveEscandallo(recetaId, calculation) {
    const now = Date.now();
    const id = `esc_${recetaId}_${now}`;

    // Buscar si ya existe
    const existing = await this.get(
      `SELECT id FROM escandallo WHERE proyecto_id = ? AND receta_id = ?`,
      [this.projectId, recetaId]
    );

    if (existing) {
      // Actualizar
      await this.run(
        `UPDATE escandallo SET
          coste_total = ?,
          coste_porcion = ?,
          precio_mercado_snapshot = ?,
          precio_snapshot_fecha = ?,
          notas = ?,
          calculado_at = ?,
          updated_at = ?
        WHERE receta_id = ? AND proyecto_id = ?`,
        [
          calculation.coste_total,
          calculation.coste_porcion,
          calculation.snapshot,
          calculation.snapshot_fecha,
          calculation.notas,
          now,
          now,
          recetaId,
          this.projectId
        ]
      );

      return existing.id;
    } else {
      // Crear
      await this.run(
        `INSERT INTO escandallo
        (id, receta_id, proyecto_id, coste_total, coste_porcion,
         precio_mercado_snapshot, precio_snapshot_fecha, notas,
         calculado_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          recetaId,
          this.projectId,
          calculation.coste_total,
          calculation.coste_porcion,
          calculation.snapshot,
          calculation.snapshot_fecha,
          calculation.notas,
          now,
          now,
          now
        ]
      );

      return id;
    }
  }

  /**
   * Obtiene escandallo de una receta
   */
  async getEscandallo(recetaId) {
    return this.get(
      `SELECT * FROM escandallo WHERE proyecto_id = ? AND receta_id = ?`,
      [this.projectId, recetaId]
    );
  }

  /**
   * Historial de cálculos (últimos N)
   */
  async getHistory(recetaId, limit = 10) {
    return this.all(
      `SELECT * FROM escandallo WHERE proyecto_id = ? AND receta_id = ?
       ORDER BY calculado_at DESC LIMIT ?`,
      [this.projectId, recetaId, limit]
    );
  }

  // ==========================================
  // Search
  // ==========================================

  /**
   * Busca escandallos por criterios (legacy method)
   */
  async search(criteria = {}) {
    const searchCriteria = {
      ...criteria,
      proyecto_id: this.projectId
    };

    const validation = this.filters.validate(searchCriteria);
    if (!validation.valid) {
      this.logger.warn('escandallo.search.invalid_criteria', {
        error: validation.error
      });
      return [];
    }

    const { sql, params } = this.filters.buildQuery(searchCriteria, {
      sort: 'reciente',
      limit: criteria.limit || 50
    });

    try {
      const results = await this.all(sql, params);
      return results || [];
    } catch (err) {
      this.logger.error('escandallo.search.error', {
        error: err.message
      });
      return [];
    }
  }

  /**
   * Busca y ordena escandallos por relevancia
   */
  async searchAndRank(criteria = {}, options = {}) {
    try {
      const searchCriteria = {
        ...criteria,
        proyecto_id: this.projectId
      };

      const validation = this.filters.validate(searchCriteria);
      if (!validation.valid) {
        this.logger.warn('escandallo.search_and_rank.invalid_criteria', {
          error: validation.error
        });
        return {
          results: [],
          summary: { total: 0 },
          error: validation.error
        };
      }

      // Get results
      const { sql, params } = this.filters.buildQuery(searchCriteria, {
        limit: options.limit || 100,
        offset: options.offset || 0
      });

      const results = await this.all(sql, params);

      if (!results || results.length === 0) {
        return {
          results: [],
          summary: { total: 0 }
        };
      }

      // Rank results
      const ranked = this.ranker.rank(results, options.rankBy || 'relevance');

      return {
        results: ranked,
        summary: this.ranker.getSummary(ranked),
        count: ranked.length
      };
    } catch (err) {
      this.logger.error('escandallo.search_and_rank.error', {
        error: err.message
      });
      return {
        results: [],
        summary: { total: 0 },
        error: err.message
      };
    }
  }

  /**
   * Get top anomalies
   */
  async getTopAnomalies(limit = 10) {
    try {
      const results = await this.search({
        proyecto_id: this.projectId,
        limit: limit * 3 // Get more, then rank
      });

      return this.ranker.getTopAnomalies(results, limit);
    } catch (err) {
      this.logger.error('escandallo.get_top_anomalies.error', {
        error: err.message
      });
      return [];
    }
  }

  // ==========================================
  // Alerts
  // ==========================================

  /**
   * Detecta cambios de precio y crea alertas
   */
  async detectPriceChanges(escandalloId, recetaId, nuevoSnapshot) {
    try {
      const escandallo = await this.getEscandallo(recetaId);
      if (!escandallo || !escandallo.precio_mercado_snapshot) return [];

      const antiguo = JSON.parse(escandallo.precio_mercado_snapshot);
      const nuevo = JSON.parse(nuevoSnapshot);
      const alertas = [];

      for (const ingrediente in nuevo) {
        if (!antiguo[ingrediente]) continue; // Nuevo ingrediente

        const precioAntiguo = antiguo[ingrediente];
        const precioNuevo = nuevo[ingrediente];

        if (precioAntiguo === null || precioNuevo === null) continue;

        const cambio = ((precioNuevo - precioAntiguo) / precioAntiguo) * 100;

        // Si cambio > ±10%, generar alerta
        if (Math.abs(cambio) > 10) {
          alertas.push({
            escandallo_id: escandalloId,
            ingrediente_nombre: ingrediente,
            precio_anterior: precioAntiguo,
            precio_nuevo: precioNuevo,
            porcentaje_cambio: Math.round(cambio * 10) / 10
          });
        }
      }

      // Persistir alertas
      for (const alerta of alertas) {
        const id = crypto.randomUUID();
        const now = Date.now();

        await this.run(
          `INSERT INTO escandallo_alerts
          (id, escandallo_id, proyecto_id, tipo_alerta, ingrediente_nombre,
           precio_anterior, precio_nuevo, porcentaje_cambio, detectada_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            escandalloId,
            this.projectId,
            cambio > 0 ? 'precio_subio' : 'precio_bajo',
            alerta.ingrediente_nombre,
            alerta.precio_anterior,
            alerta.precio_nuevo,
            alerta.porcentaje_cambio,
            now,
            now
          ]
        );
      }

      return alertas;
    } catch (err) {
      this.logger.error('escandallo.detect_price_changes_failed', { error: err.message });
      return [];
    }
  }

  /**
   * Obtiene alertas sin leer
   */
  async getUnreadAlerts() {
    return this.all(
      `SELECT * FROM escandallo_alerts WHERE proyecto_id = ? AND leida = 0
       ORDER BY detectada_at DESC`,
      [this.projectId]
    );
  }

  /**
   * Obtiene alertas para un escandallo específico
   */
  async getAlertas(escandalloId) {
    try {
      const alerts = await this.all(
        `SELECT * FROM escandallo_alerts WHERE escandallo_id = ?
         ORDER BY detectada_at DESC`,
        [escandalloId]
      );
      return alerts || [];
    } catch (err) {
      this.logger.error('escandallo.get_alerts.error', {
        escandallo_id: escandalloId,
        error: err.message
      });
      return [];
    }
  }

  /**
   * Marca alerta como leída
   */
  async markAlertAsRead(alertaId) {
    const now = Date.now();
    await this.run(
      `UPDATE escandallo_alerts SET leida = 1, leida_at = ? WHERE id = ?`,
      [now, alertaId]
    );
  }
}

module.exports = EscandalloManager;
