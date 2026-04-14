/**
 * SQLite Manager para Recetas v2
 *
 * Responsabilidades:
 * - CRUD de recetas con versionado completo
 * - Gestión de ingredientes por proyecto
 * - Search index desnormalizado
 * - Transacciones con rollback automático
 * - Migración desde v1 (JSON files) a v2 (SQLite)
 *
 * Database: 1 SQLite por proyecto en `data/projects/{proyecto}/recetas.db`
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class SQLiteManager {
  constructor(projectId, basePath, logger) {
    this.projectId = projectId;
    this.basePath = basePath;
    this.logger = logger;
    this.db = null;
    this.dbPath = null;
  }

  // ==========================================
  // Lifecycle: init, close
  // ==========================================

  /**
   * Inicializa BD: crea si no existe, aplica schema
   */
  async init() {
    try {
      // Resolver ruta de BD
      const dbDir = path.join(this.basePath, 'data', 'projects', this.projectId);
      await fs.mkdir(dbDir, { recursive: true });
      this.dbPath = path.join(dbDir, 'recetas.db');

      // Abrir/crear BD
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          this.logger.error('sqlite.open_failed', { projectId: this.projectId, error: err.message });
          throw err;
        }
      });

      // Esperar que BD esté lista
      await new Promise((resolve, reject) => {
        this.db.serialize(() => {
          // Habilitar foreign keys y WAL mode para concurrencia
          this.db.run('PRAGMA foreign_keys = ON');
          this.db.run('PRAGMA journal_mode = WAL');
          this.db.run('PRAGMA synchronous = NORMAL');
          resolve();
        });
        this.db.on('error', reject);
      });

      // Aplicar schema
      await this._applySchema();

      this.logger.info('sqlite.initialized', { projectId: this.projectId, dbPath: this.dbPath });
    } catch (err) {
      this.logger.error('sqlite.init_failed', { projectId: this.projectId, error: err.message });
      throw err;
    }
  }

  /**
   * Lee schema.sql y lo ejecuta
   */
  async _applySchema() {
    try {
      const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf-8');

      // Dividir en statements (separa por ;)
      const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('/**') && !s.startsWith('--'));

      for (const statement of statements) {
        await this.run(statement);
      }

      this.logger.info('sqlite.schema_applied', { projectId: this.projectId });
    } catch (err) {
      this.logger.error('sqlite.schema_apply_failed', { projectId: this.projectId, error: err.message });
      throw err;
    }
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.close((err) => {
        if (err) reject(err);
        else {
          this.logger.info('sqlite.closed', { projectId: this.projectId });
          resolve();
        }
      });
    });
  }

  // ==========================================
  // Utilidades: run, get, all (promisified)
  // ==========================================

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);  // 'this' tiene lastID, changes
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
  // TRANSACCIONES
  // ==========================================

  async beginTransaction() {
    await this.run('BEGIN TRANSACTION');
  }

  async commit() {
    await this.run('COMMIT');
  }

  async rollback() {
    await this.run('ROLLBACK');
  }

  /**
   * Ejecuta función dentro de transacción con rollback automático en error
   */
  async transaction(fn) {
    try {
      await this.beginTransaction();
      const result = await fn();
      await this.commit();
      return result;
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  // ==========================================
  // RECETAS: CRUD + VERSIONADO
  // ==========================================

  /**
   * Guardar receta nueva (crea versión 1)
   */
  async createReceta(receta, projectId, userId = 'system') {
    const recetaId = receta.id || `rec_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();

    return this.transaction(async () => {
      // Insertar receta
      await this.run(
        `INSERT INTO recetas (id, proyecto_id, nombre, descripcion, estado, fuente, fuente_url, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recetaId,
          projectId,
          receta.nombre,
          receta.descripcion || null,
          'activa',
          receta.fuente || 'manual',
          receta.fuente_url || null,
          now,
          now,
          userId,
          userId
        ]
      );

      // Crear versión 1
      const versionId = `rver_${crypto.randomBytes(6).toString('hex')}`;
      await this.run(
        `INSERT INTO receta_versiones (id, receta_id, version_num, datos_json, changed_at, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          versionId,
          recetaId,
          1,
          JSON.stringify(receta),
          now,
          userId
        ]
      );

      // Actualizar ingredientes
      if (receta.ingredientes && Array.isArray(receta.ingredientes)) {
        for (const ing of receta.ingredientes) {
          await this._upsertIngrediente(ing, projectId);
          await this._linkRecetaIngrediente(recetaId, ing, projectId);
        }
      }

      // Actualizar search index
      await this._updateSearchIndex(recetaId, receta, projectId);

      return { id: recetaId, version: 1 };
    });
  }

  /**
   * Obtener receta completa (versión actual)
   */
  async getReceta(recetaId) {
    const receta = await this.get(
      `SELECT r.*, rv.datos_json FROM recetas r
       LEFT JOIN receta_versiones rv ON r.id = rv.receta_id AND rv.version_num = r.version_actual
       WHERE r.id = ?`,
      [recetaId]
    );

    if (!receta) return null;

    const datosJson = receta.datos_json ? JSON.parse(receta.datos_json) : {};

    // Enriquecer con ingredientes
    const ingredientesRows = await this.all(
      `SELECT ri.*, i.nombre FROM receta_ingredientes ri
       JOIN ingredientes i ON ri.ingrediente_id = i.id
       WHERE ri.receta_id = ?`,
      [recetaId]
    );

    return {
      ...receta,
      datos: datosJson,
      ingredientes: ingredientesRows
    };
  }

  /**
   * Listar recetas del proyecto (con filtros opcionales)
   */
  async listRecetas(projectId, filters = {}) {
    let sql = `SELECT id, nombre, descripcion, estado, fuente, updated_at
               FROM recetas WHERE proyecto_id = ?`;
    const params = [projectId];

    if (filters.estado) {
      sql += ` AND estado = ?`;
      params.push(filters.estado);
    }

    sql += ` ORDER BY updated_at DESC`;

    if (filters.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
    }

    return this.all(sql, params);
  }

  /**
   * Actualizar receta existente (crea nueva versión)
   */
  async updateReceta(recetaId, cambios, projectId, userId = 'system') {
    return this.transaction(async () => {
      // Obtener versión actual
      const receta = await this.getReceta(recetaId);
      if (!receta) throw new Error(`Receta no encontrada: ${recetaId}`);

      const now = Date.now();
      const nuevaVersion = receta.version_actual + 1;

      // Merging cambios con datos existentes
      const datosActuales = receta.datos || {};
      const datosMerged = { ...datosActuales, ...cambios };

      // Crear nueva versión
      const versionId = `rver_${crypto.randomBytes(6).toString('hex')}`;
      const diffJson = this._calculateDiff(datosActuales, datosMerged);

      await this.run(
        `INSERT INTO receta_versiones (id, receta_id, version_num, datos_json, cambios_json, changed_at, changed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId,
          recetaId,
          nuevaVersion,
          JSON.stringify(datosMerged),
          JSON.stringify(diffJson),
          now,
          userId
        ]
      );

      // Actualizar version_actual y updated_at en recetas
      await this.run(
        `UPDATE recetas SET version_actual = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
        [nuevaVersion, now, userId, recetaId]
      );

      // Actualizar ingredientes si están en cambios
      if (cambios.ingredientes && Array.isArray(cambios.ingredientes)) {
        // Borrar linkeos antiguos
        await this.run(`DELETE FROM receta_ingredientes WHERE receta_id = ?`, [recetaId]);

        // Crear linkeos nuevos
        for (const ing of cambios.ingredientes) {
          await this._upsertIngrediente(ing, projectId);
          await this._linkRecetaIngrediente(recetaId, ing, projectId);
        }
      }

      // Actualizar search index
      await this._updateSearchIndex(recetaId, datosMerged, projectId);

      return { id: recetaId, version: nuevaVersion };
    });
  }

  /**
   * Obtener historial de versiones
   */
  async getVersionHistory(recetaId, limit = 20) {
    return this.all(
      `SELECT id, version_num, cambios_json, changed_at, changed_by, es_revertida
       FROM receta_versiones WHERE receta_id = ?
       ORDER BY version_num DESC LIMIT ?`,
      [recetaId, limit]
    );
  }

  /**
   * Revertir a versión anterior
   */
  async revertVersion(recetaId, targetVersionNum, projectId, userId = 'system') {
    return this.transaction(async () => {
      // Obtener datos de versión target
      const targetVersion = await this.get(
        `SELECT * FROM receta_versiones WHERE receta_id = ? AND version_num = ?`,
        [recetaId, targetVersionNum]
      );

      if (!targetVersion) throw new Error(`Versión no encontrada: ${targetVersionNum}`);

      const datosTarget = JSON.parse(targetVersion.datos_json);

      // Crear nueva versión basada en target
      const now = Date.now();
      const receta = await this.get(`SELECT version_actual FROM recetas WHERE id = ?`, [recetaId]);
      const nuevaVersion = receta.version_actual + 1;

      const versionId = `rver_${crypto.randomBytes(6).toString('hex')}`;
      await this.run(
        `INSERT INTO receta_versiones (id, receta_id, version_num, datos_json, revertida_a_version_id, changed_at, changed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId,
          recetaId,
          nuevaVersion,
          JSON.stringify(datosTarget),
          targetVersion.id,
          now,
          userId
        ]
      );

      // Actualizar version_actual
      await this.run(
        `UPDATE recetas SET version_actual = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
        [nuevaVersion, now, userId, recetaId]
      );

      return { id: recetaId, version: nuevaVersion, revertidaA: targetVersionNum };
    });
  }

  /**
   * Eliminar receta (marcar como archived)
   */
  async deleteReceta(recetaId, userId = 'system') {
    const now = Date.now();
    await this.run(
      `UPDATE recetas SET estado = ?, updated_at = ?, updated_by = ? WHERE id = ?`,
      ['archivada', now, userId, recetaId]
    );
  }

  // ==========================================
  // INGREDIENTES: Catálogo por proyecto
  // ==========================================

  /**
   * Upsert ingrediente (crear si no existe, actualizar si existe)
   */
  async _upsertIngrediente(ingrediente, projectId) {
    const ingId = ingrediente.id || `ing_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();

    const existing = await this.get(
      `SELECT id FROM ingredientes WHERE proyecto_id = ? AND nombre = ?`,
      [projectId, ingrediente.nombre]
    );

    if (existing) {
      await this.run(
        `UPDATE ingredientes SET precio_mercado_kg = ?, precio_compra_kg = ?, updated_at = ?
         WHERE proyecto_id = ? AND nombre = ?`,
        [
          ingrediente.precio_mercado_kg || null,
          ingrediente.precio_compra_kg || null,
          now,
          projectId,
          ingrediente.nombre
        ]
      );
      return existing.id;
    } else {
      await this.run(
        `INSERT INTO ingredientes (id, proyecto_id, nombre, categoria, unidad_base, precio_mercado_kg, precio_compra_kg, alerge nos, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ingId,
          projectId,
          ingrediente.nombre,
          ingrediente.categoria || null,
          ingrediente.unidad_base || 'kg',
          ingrediente.precio_mercado_kg || null,
          ingrediente.precio_compra_kg || null,
          ingrediente.alerge nos ? JSON.stringify(ingrediente.alerge nos) : null,
          now,
          now
        ]
      );
      return ingId;
    }
  }

  /**
   * Link receta a ingrediente
   */
  async _linkRecetaIngrediente(recetaId, ingrediente, projectId) {
    const ingId = await this._upsertIngrediente(ingrediente, projectId);
    const linkId = `rl_${crypto.randomBytes(6).toString('hex')}`;

    await this.run(
      `INSERT INTO receta_ingredientes (id, receta_id, ingrediente_id, cantidad, unidad, precio_mercado_en_momento, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        linkId,
        recetaId,
        ingId,
        ingrediente.cantidad || 0,
        ingrediente.unidad || 'ud',
        ingrediente.precio_mercado || null,
        ingrediente.notas || null
      ]
    );
  }

  /**
   * Obtener ingredientes del proyecto
   */
  async getIngredientes(projectId, filters = {}) {
    let sql = `SELECT * FROM ingredientes WHERE proyecto_id = ?`;
    const params = [projectId];

    if (filters.categoria) {
      sql += ` AND categoria = ?`;
      params.push(filters.categoria);
    }

    sql += ` ORDER BY nombre ASC`;

    return this.all(sql, params);
  }

  /**
   * Actualizar precio de mercado de ingrediente
   */
  async updatePrecioMercado(ingredienteId, precioMercado, projectId, fuente = null) {
    const now = Date.now();
    await this.run(
      `UPDATE ingredientes SET precio_mercado_kg = ?, fuente_precio = ?, updated_at = ?
       WHERE id = ? AND proyecto_id = ?`,
      [precioMercado, fuente || null, now, ingredienteId, projectId]
    );
  }

  // ==========================================
  // BÚSQUEDA: Search Index desnormalizado
  // ==========================================

  /**
   * Actualizar search index (desnormalizado para búsquedas rápidas)
   */
  async _updateSearchIndex(recetaId, receta, projectId) {
    const now = Date.now();

    // Extraer datos para indexar
    const metodoCoccion = receta.metodo_coccion || [];
    const tipoPlato = receta.tipo_plato || [];
    const dificultad = receta.dificultad || 5;
    const tiempoPrep = receta.tiempo_preparacion || 0;
    const costePorcion = receta.coste_porcion || 0;
    const caracteristicas = receta.caracteristicas || [];
    const alerge nos = receta.alerge nos || [];
    const ingredientes = receta.ingredientes || [];
    const etiquetas = receta.etiquetas || [];
    const tagsCustom = receta.tags || [];
    const viabilidad = receta.viabilidad || 'media';

    // Concatenar nombres de ingredientes para búsqueda LIKE
    const ingredientesNombres = ingredientes.map(i => i.nombre).join(' | ');
    const ingredientesJson = JSON.stringify(ingredientes);

    await this.run(
      `INSERT OR REPLACE INTO receta_search_index
       (receta_id, proyecto_id, nombre_lower, metodos_coccion, tipos_plato, dificultad_min, dificultad_max,
        tiempo_prep_min, tiempo_prep_max, coste_porcion_min, coste_porcion_max, caracteristicas, alerge nos_excluir,
        ingredientes_nombres, ingredientes_json, etiquetas, tags_custom, viabilidad, coste_total_estimado,
        porciones, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recetaId,
        projectId,
        receta.nombre.toLowerCase(),
        JSON.stringify(metodoCoccion),
        JSON.stringify(tipoPlato),
        dificultad,
        dificultad,
        tiempoPrep,
        tiempoPrep,
        costePorcion,
        costePorcion,
        JSON.stringify(caracteristicas),
        JSON.stringify(alerge nos),
        ingredientesNombres,
        ingredientesJson,
        JSON.stringify(etiquetas),
        JSON.stringify(tagsCustom),
        viabilidad,
        receta.coste_total || 0,
        receta.porciones || 1,
        now
      ]
    );
  }

  /**
   * Buscar recetas por criterios (40+ variables posibles)
   */
  async searchRecetas(projectId, criteria = {}) {
    let sql = `SELECT * FROM receta_search_index WHERE proyecto_id = ?`;
    const params = [projectId];

    // Búsqueda por nombre (LIKE)
    if (criteria.nombre) {
      sql += ` AND nombre_lower LIKE ?`;
      params.push(`%${criteria.nombre.toLowerCase()}%`);
    }

    // Búsqueda por ingrediente
    if (criteria.ingredientes && Array.isArray(criteria.ingredientes)) {
      for (const ing of criteria.ingredientes) {
        sql += ` AND ingredientes_nombres LIKE ?`;
        params.push(`%${ing}%`);
      }
    }

    // Excluir ingredientes
    if (criteria.ingredientes_excluir && Array.isArray(criteria.ingredientes_excluir)) {
      for (const ing of criteria.ingredientes_excluir) {
        sql += ` AND ingredientes_nombres NOT LIKE ?`;
        params.push(`%${ing}%`);
      }
    }

    // Dificultad
    if (criteria.dificultad_min !== undefined) {
      sql += ` AND dificultad_max >= ?`;
      params.push(criteria.dificultad_min);
    }
    if (criteria.dificultad_max !== undefined) {
      sql += ` AND dificultad_min <= ?`;
      params.push(criteria.dificultad_max);
    }

    // Tiempo de preparación
    if (criteria.tiempo_min !== undefined) {
      sql += ` AND tiempo_prep_max >= ?`;
      params.push(criteria.tiempo_min);
    }
    if (criteria.tiempo_max !== undefined) {
      sql += ` AND tiempo_prep_min <= ?`;
      params.push(criteria.tiempo_max);
    }

    // Coste por porción
    if (criteria.coste_min !== undefined) {
      sql += ` AND coste_porcion_max >= ?`;
      params.push(criteria.coste_min);
    }
    if (criteria.coste_max !== undefined) {
      sql += ` AND coste_porcion_min <= ?`;
      params.push(criteria.coste_max);
    }

    // Viabilidad
    if (criteria.viabilidad) {
      sql += ` AND viabilidad = ?`;
      params.push(criteria.viabilidad);
    }

    // Características (vegetariano, sin_gluten, etc)
    if (criteria.caracteristicas) {
      for (const char of criteria.caracteristicas) {
        sql += ` AND caracteristicas LIKE ?`;
        params.push(`%${char}%`);
      }
    }

    // Alérgenos a excluir
    if (criteria.alerge nos_excluir) {
      for (const alg of criteria.alerge nos_excluir) {
        sql += ` AND alerge nos_excluir NOT LIKE ?`;
        params.push(`%${alg}%`);
      }
    }

    sql += ` ORDER BY updated_at DESC`;

    if (criteria.limit) {
      sql += ` LIMIT ?`;
      params.push(criteria.limit);
    }

    return this.all(sql, params);
  }

  // ==========================================
  // HELPERS
  // ==========================================

  /**
   * Calcular diff entre versiones (para auditoría)
   */
  _calculateDiff(oldData, newData) {
    const diff = {};
    const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

    for (const key of allKeys) {
      const oldVal = oldData?.[key];
      const newVal = newData?.[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diff[key] = { anterior: oldVal, nuevo: newVal };
      }
    }

    return diff;
  }

  /**
   * Estadísticas del proyecto
   */
  async getStats(projectId) {
    const stats = await this.get(
      `SELECT
        COUNT(*) as total_recetas,
        COUNT(CASE WHEN estado='activa' THEN 1 END) as recetas_activas,
        COUNT(CASE WHEN estado='archivada' THEN 1 END) as recetas_archivadas,
        (SELECT COUNT(*) FROM ingredientes WHERE proyecto_id = ?) as total_ingredientes
       FROM recetas WHERE proyecto_id = ?`,
      [projectId, projectId]
    );

    return stats || {};
  }
}

module.exports = SQLiteManager;
