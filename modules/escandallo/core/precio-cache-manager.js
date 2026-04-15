/**
 * Precio Cache Manager
 *
 * Gestiona cache de precios:
 * - Almacenamiento en BD (persistencia)
 * - Validez 24h
 * - Promedio histórico para fallback
 */

class PrecioCacheManager {
  constructor(dbManager, logger) {
    this.db = dbManager;
    this.logger = logger;
  }

  /**
   * Obtiene precio en cache si es válido (< 24h)
   */
  async get(ingredienteName) {
    try {
      const sql = `
        SELECT * FROM ingrediente_precios_cache
        WHERE ingrediente_nombre = ?
        AND valido_hasta > ?
        ORDER BY buscado_at DESC
        LIMIT 1
      `;

      const cached = await this.db.get(sql, [
        ingredienteName,
        Date.now()
      ]);

      if (cached) {
        this.logger.info('precio_cache.hit', {
          ingrediente: ingredienteName,
          precio: cached.precio,
          fuente: cached.fuente
        });
        return {
          precio: cached.precio,
          fuente: cached.fuente,
          fecha: cached.buscado_at,
          confianza: cached.confianza
        };
      }

      return null;
    } catch (err) {
      this.logger.error('precio_cache.get_failed', { error: err.message });
      return null;
    }
  }

  /**
   * Guarda precio en cache
   */
  async set(ingredienteName, precioData) {
    try {
      const id = `cache_${ingredienteName}_${Date.now()}`;
      const now = Date.now();
      const validoHasta = now + (24 * 60 * 60 * 1000); // 24h

      await this.db.run(
        `INSERT INTO ingrediente_precios_cache
        (id, ingrediente_nombre, precio, fuente, confianza, buscado_at, valido_hasta, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          ingredienteName,
          precioData.precio,
          precioData.fuente,
          precioData.confianza || 'media',
          precioData.fecha || now,
          validoHasta,
          now
        ]
      );

      this.logger.info('precio_cache.saved', {
        ingrediente: ingredienteName,
        precio: precioData.precio,
        fuente: precioData.fuente
      });
    } catch (err) {
      this.logger.error('precio_cache.set_failed', { error: err.message });
    }
  }

  /**
   * Obtiene promedio de precios históricos
   * Para fallback cuando no hay búsqueda reciente
   */
  async getAverage(ingredienteName) {
    try {
      const sql = `
        SELECT AVG(precio) as promedio, COUNT(*) as count
        FROM ingrediente_precios_cache
        WHERE ingrediente_nombre = ?
        AND confianza IN ('alta', 'media')
      `;

      const result = await this.db.get(sql, [ingredienteName]);

      if (result && result.promedio && result.count > 0) {
        this.logger.info('precio_cache.average', {
          ingrediente: ingredienteName,
          promedio: result.promedio,
          muestras: result.count
        });
        return Math.round(result.promedio * 100) / 100;
      }

      return null;
    } catch (err) {
      this.logger.error('precio_cache.average_failed', { error: err.message });
      return null;
    }
  }

  /**
   * Limpia cache expirado (> 24h)
   * Ejecutar periódicamente (cron job)
   */
  async cleanupExpired() {
    try {
      const now = Date.now();
      const result = await this.db.run(
        `DELETE FROM ingrediente_precios_cache WHERE valido_hasta < ?`,
        [now]
      );

      this.logger.info('precio_cache.cleanup_completed', {
        deleted: result.changes
      });

      return result.changes;
    } catch (err) {
      this.logger.error('precio_cache.cleanup_failed', { error: err.message });
      return 0;
    }
  }

  /**
   * Obtiene estadísticas de cache
   */
  async getStats() {
    try {
      const total = await this.db.get(
        `SELECT COUNT(*) as count FROM ingrediente_precios_cache`
      );

      const válido = await this.db.get(
        `SELECT COUNT(*) as count FROM ingrediente_precios_cache WHERE valido_hasta > ?`,
        [Date.now()]
      );

      const porFuente = await this.db.all(
        `SELECT fuente, COUNT(*) as count FROM ingrediente_precios_cache
         GROUP BY fuente ORDER BY count DESC`
      );

      return {
        total: total.count,
        válido: válido.count,
        expirado: total.count - válido.count,
        porFuente: porFuente
      };
    } catch (err) {
      this.logger.error('precio_cache.stats_failed', { error: err.message });
      return null;
    }
  }
}

module.exports = PrecioCacheManager;
