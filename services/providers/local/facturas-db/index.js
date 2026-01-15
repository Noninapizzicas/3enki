/**
 * Facturas Database Service
 *
 * Servicio local para gestión de facturas en SQLite.
 * Maneja el registro, estado y metadatos de facturas.
 *
 * Eventos:
 * - local.facturas-db.registrar.request -> local.facturas-db.registrar.response
 * - local.facturas-db.actualizar.request -> local.facturas-db.actualizar.response
 * - local.facturas-db.listar.request -> local.facturas-db.listar.response
 * - local.facturas-db.obtener.request -> local.facturas-db.obtener.response
 * - local.facturas-db.pendientes.request -> local.facturas-db.pendientes.response
 *
 * @version 1.0.0
 * @created 2026-01-15
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// SQLite - usar better-sqlite3 si está disponible, sino sqlite3
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  // Fallback básico
  Database = null;
}

module.exports = {
  name: 'local.facturas-db',
  description: 'Gestión de facturas en SQLite',

  // Base de datos por proyecto
  databases: new Map(),

  functions: {
    registrar: {
      event: 'local.facturas-db.registrar.request',
      description: 'Registrar nueva factura en la base de datos',
      input: {
        proyecto: { type: 'string', required: true, description: 'ID del proyecto' },
        nombre_archivo: { type: 'string', required: true },
        source: { type: 'string', required: true, enum: ['telegram', 'gmail'] },
        path_original: { type: 'string', required: true },
        origen: { type: 'object', description: 'Metadata del origen (bot, email, etc.)' }
      },
      output: {
        success: { type: 'boolean' },
        data: { type: 'object', description: 'Factura registrada con ID' }
      }
    },
    actualizar: {
      event: 'local.facturas-db.actualizar.request',
      description: 'Actualizar factura existente',
      input: {
        proyecto: { type: 'string', required: true },
        id: { type: 'string', required: true },
        campos: { type: 'object', required: true, description: 'Campos a actualizar' }
      }
    },
    listar: {
      event: 'local.facturas-db.listar.request',
      description: 'Listar facturas con filtros',
      input: {
        proyecto: { type: 'string', required: true },
        estado: { type: 'string', description: 'Filtrar por estado' },
        desde: { type: 'string', description: 'Fecha desde (ISO)' },
        hasta: { type: 'string', description: 'Fecha hasta (ISO)' },
        limit: { type: 'number', default: 100 }
      }
    },
    obtener: {
      event: 'local.facturas-db.obtener.request',
      description: 'Obtener una factura por ID',
      input: {
        proyecto: { type: 'string', required: true },
        id: { type: 'string', required: true }
      }
    },
    pendientes: {
      event: 'local.facturas-db.pendientes.request',
      description: 'Obtener facturas pendientes de procesar',
      input: {
        proyecto: { type: 'string', required: true },
        limit: { type: 'number', default: 100 }
      }
    },
    estadisticas: {
      event: 'local.facturas-db.estadisticas.request',
      description: 'Obtener estadísticas de facturas',
      input: {
        proyecto: { type: 'string', required: true },
        semana: { type: 'string', description: 'Semana ISO (2026-W03)' }
      }
    },
    exportar: {
      event: 'local.facturas-db.exportar.request',
      description: 'Exportar facturas procesadas en formato para asesoría',
      input: {
        proyecto: { type: 'string', required: true },
        semana: { type: 'string', description: 'Semana ISO (si no se especifica, usa actual)' }
      },
      output: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            semana: { type: 'string' },
            facturas: { type: 'array', description: 'Facturas formateadas para Excel' },
            total: { type: 'number' }
          }
        }
      }
    },
    marcarExportadas: {
      event: 'local.facturas-db.marcarExportadas.request',
      description: 'Marcar facturas como exportadas',
      input: {
        proyecto: { type: 'string', required: true },
        ids: { type: 'array', required: true, description: 'IDs de facturas a marcar' },
        semana: { type: 'string', required: true }
      }
    }
  },

  /**
   * Obtiene o crea la base de datos para un proyecto
   */
  getDatabase(proyecto) {
    if (this.databases.has(proyecto)) {
      return this.databases.get(proyecto);
    }

    // Crear directorio si no existe
    const dbDir = path.join(process.cwd(), 'data', 'projects', proyecto, 'storage');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'facturas.db');

    if (!Database) {
      throw new Error('SQLite not available. Install better-sqlite3: npm install better-sqlite3');
    }

    const db = new Database(dbPath);

    // Crear esquema si no existe
    this.initializeSchema(db);

    this.databases.set(proyecto, db);
    return db;
  },

  /**
   * Inicializa el esquema de la base de datos
   */
  initializeSchema(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS facturas (
        id TEXT PRIMARY KEY,

        -- IDENTIFICACIÓN ARCHIVO
        nombre_archivo TEXT NOT NULL,
        path_original TEXT,
        path_procesada TEXT,
        path_ocr_json TEXT,

        -- ORIGEN/ENTRADA
        source TEXT NOT NULL,
        fecha_entrada DATETIME NOT NULL,
        origen_bot TEXT,
        origen_chat_id TEXT,
        origen_user_id TEXT,
        origen_user_name TEXT,
        origen_caption TEXT,
        origen_email_cuenta TEXT,
        origen_email_de TEXT,
        origen_email_asunto TEXT,
        origen_email_message_id TEXT,

        -- ESTADO PROCESAMIENTO
        estado TEXT DEFAULT 'pendiente',
        fecha_procesado DATETIME,
        ocr_provider TEXT,
        ocr_confianza REAL,
        ocr_texto TEXT,
        ocr_error TEXT,

        -- DATOS FACTURA (extraídos/revisados)
        factura_numero TEXT,
        factura_fecha DATE,
        factura_fecha_operacion DATE,
        proveedor_nif TEXT,
        proveedor_nombre TEXT,
        concepto TEXT,
        categoria TEXT,

        -- IMPORTES
        base_imponible REAL,
        tipo_iva REAL,
        cuota_iva REAL,
        cuota_deducible REAL,
        retencion_irpf REAL,
        total_factura REAL,

        -- PAGO
        metodo_pago TEXT,
        estado_pago TEXT DEFAULT 'pendiente',
        fecha_vencimiento DATE,
        fecha_pago DATE,

        -- EXPORT
        semana_export TEXT,
        fecha_exportado DATETIME,

        -- METADATA
        notas TEXT,
        revisado_por TEXT,
        fecha_revision DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_facturas_estado ON facturas(estado);
      CREATE INDEX IF NOT EXISTS idx_facturas_fecha_entrada ON facturas(fecha_entrada);
      CREATE INDEX IF NOT EXISTS idx_facturas_source ON facturas(source);
      CREATE INDEX IF NOT EXISTS idx_facturas_semana ON facturas(semana_export);
    `);
  },

  /**
   * Genera nombre de archivo con formato estándar
   * Formato: {source}_{fecha}_{hora}_{estado}.{ext}
   */
  generarNombreArchivo(source, extension, estado = 'pendiente') {
    const now = new Date();
    const fecha = now.toISOString().split('T')[0]; // 2026-01-15
    const hora = now.toTimeString().slice(0, 5).replace(':', ''); // 1030
    return `${source}_${fecha}_${hora}_${estado}.${extension}`;
  },

  /**
   * Calcula la semana ISO (2026-W03)
   */
  calcularSemanaISO(fecha = new Date()) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  },

  // ==========================================
  // FUNCIONES
  // ==========================================

  /**
   * Registrar nueva factura
   */
  async registrar({ proyecto, nombre_archivo, source, path_original, origen = {} }) {
    try {
      const db = this.getDatabase(proyecto);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      const stmt = db.prepare(`
        INSERT INTO facturas (
          id, nombre_archivo, source, path_original, fecha_entrada, estado,
          origen_bot, origen_chat_id, origen_user_id, origen_user_name, origen_caption,
          origen_email_cuenta, origen_email_de, origen_email_asunto, origen_email_message_id
        ) VALUES (
          ?, ?, ?, ?, ?, 'pendiente',
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `);

      stmt.run(
        id, nombre_archivo, source, path_original, now,
        origen.botName || null,
        origen.chatId || null,
        origen.userId || null,
        origen.userName || null,
        origen.caption || null,
        origen.cuenta || null,
        origen.de || null,
        origen.asunto || null,
        origen.messageId || null
      );

      return {
        success: true,
        data: {
          id,
          nombre_archivo,
          source,
          path_original,
          estado: 'pendiente',
          fecha_entrada: now
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Error registrando factura: ${error.message}`
      };
    }
  },

  /**
   * Actualizar factura existente
   */
  async actualizar({ proyecto, id, campos }) {
    try {
      const db = this.getDatabase(proyecto);

      // Construir query dinámico
      const keys = Object.keys(campos);
      const setClause = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => campos[k]);

      // Añadir updated_at
      const sql = `UPDATE facturas SET ${setClause}, updated_at = ? WHERE id = ?`;
      values.push(new Date().toISOString(), id);

      const stmt = db.prepare(sql);
      const result = stmt.run(...values);

      if (result.changes === 0) {
        return {
          success: false,
          error: `Factura ${id} no encontrada`
        };
      }

      return {
        success: true,
        data: { id, updated: keys }
      };

    } catch (error) {
      return {
        success: false,
        error: `Error actualizando factura: ${error.message}`
      };
    }
  },

  /**
   * Listar facturas con filtros
   */
  async listar({ proyecto, estado, desde, hasta, limit = 100 }) {
    try {
      const db = this.getDatabase(proyecto);

      let sql = 'SELECT * FROM facturas WHERE 1=1';
      const params = [];

      if (estado) {
        sql += ' AND estado = ?';
        params.push(estado);
      }

      if (desde) {
        sql += ' AND fecha_entrada >= ?';
        params.push(desde);
      }

      if (hasta) {
        sql += ' AND fecha_entrada <= ?';
        params.push(hasta);
      }

      sql += ' ORDER BY fecha_entrada DESC LIMIT ?';
      params.push(limit);

      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);

      return {
        success: true,
        data: {
          facturas: rows,
          total: rows.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Error listando facturas: ${error.message}`
      };
    }
  },

  /**
   * Obtener factura por ID
   */
  async obtener({ proyecto, id }) {
    try {
      const db = this.getDatabase(proyecto);

      const stmt = db.prepare('SELECT * FROM facturas WHERE id = ?');
      const row = stmt.get(id);

      if (!row) {
        return {
          success: false,
          error: `Factura ${id} no encontrada`
        };
      }

      return {
        success: true,
        data: row
      };

    } catch (error) {
      return {
        success: false,
        error: `Error obteniendo factura: ${error.message}`
      };
    }
  },

  /**
   * Obtener facturas pendientes de procesar
   */
  async pendientes({ proyecto, limit = 100 }) {
    try {
      const db = this.getDatabase(proyecto);

      const stmt = db.prepare(`
        SELECT * FROM facturas
        WHERE estado = 'pendiente'
        ORDER BY fecha_entrada ASC
        LIMIT ?
      `);
      const rows = stmt.all(limit);

      return {
        success: true,
        data: {
          facturas: rows,
          total: rows.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Error obteniendo pendientes: ${error.message}`
      };
    }
  },

  /**
   * Obtener estadísticas
   */
  async estadisticas({ proyecto, semana }) {
    try {
      const db = this.getDatabase(proyecto);

      const semanaActual = semana || this.calcularSemanaISO();

      // Stats generales
      const general = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
          SUM(CASE WHEN estado = 'procesada' THEN 1 ELSE 0 END) as procesadas,
          SUM(CASE WHEN estado = 'exportada' THEN 1 ELSE 0 END) as exportadas,
          SUM(CASE WHEN estado = 'error' THEN 1 ELSE 0 END) as errores
        FROM facturas
      `).get();

      // Stats por source
      const porSource = db.prepare(`
        SELECT source, COUNT(*) as total
        FROM facturas
        GROUP BY source
      `).all();

      // Stats de la semana
      const semanaStats = db.prepare(`
        SELECT COUNT(*) as total
        FROM facturas
        WHERE semana_export = ? OR (semana_export IS NULL AND estado != 'exportada')
      `).get(semanaActual);

      return {
        success: true,
        data: {
          semana: semanaActual,
          general,
          porSource,
          semanaActual: semanaStats
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Error obteniendo estadísticas: ${error.message}`
      };
    }
  },

  /**
   * Exportar facturas procesadas en formato para asesoría
   * Devuelve datos listos para generar Excel
   */
  async exportar({ proyecto, semana }) {
    try {
      const db = this.getDatabase(proyecto);
      const semanaExport = semana || this.calcularSemanaISO();

      // Obtener facturas procesadas no exportadas
      const stmt = db.prepare(`
        SELECT * FROM facturas
        WHERE estado = 'procesada'
        ORDER BY fecha_entrada ASC
      `);
      const facturas = stmt.all();

      // Formatear para Excel (formato asesoría)
      const facturasFormateadas = facturas.map((f, index) => ({
        'Nº Registro': index + 1,
        'Fecha Factura': f.factura_fecha || '',
        'Fecha Operación': f.factura_fecha_operacion || '',
        'Nº Factura': f.factura_numero || '',
        'NIF Proveedor': f.proveedor_nif || '',
        'Proveedor': f.proveedor_nombre || '',
        'Concepto': f.concepto || '',
        'Categoría': f.categoria || '',
        'Base Imponible': f.base_imponible || '',
        '% IVA': f.tipo_iva || '',
        'Cuota IVA': f.cuota_iva || '',
        'Cuota Deducible': f.cuota_deducible || '',
        'Total': f.total_factura || '',
        'Estado Pago': f.estado_pago || 'pendiente',
        'Origen': f.source,
        'Archivo': f.nombre_archivo,
        'Fecha Entrada': f.fecha_entrada,
        'OCR Confianza': f.ocr_confianza || 0,
        'Texto OCR': f.ocr_texto ? f.ocr_texto.substring(0, 500) : '',
        '_id': f.id
      }));

      return {
        success: true,
        data: {
          semana: semanaExport,
          facturas: facturasFormateadas,
          total: facturasFormateadas.length,
          ids: facturas.map(f => f.id)
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Error exportando facturas: ${error.message}`
      };
    }
  },

  /**
   * Marcar facturas como exportadas
   */
  async marcarExportadas({ proyecto, ids, semana }) {
    try {
      const db = this.getDatabase(proyecto);
      const now = new Date().toISOString();

      const stmt = db.prepare(`
        UPDATE facturas
        SET estado = 'exportada', semana_export = ?, fecha_exportado = ?, updated_at = ?
        WHERE id = ?
      `);

      let updated = 0;
      for (const id of ids) {
        const result = stmt.run(semana, now, now, id);
        updated += result.changes;
      }

      return {
        success: true,
        data: {
          updated,
          semana
        }
      };

    } catch (error) {
      return {
        success: false,
        error: `Error marcando exportadas: ${error.message}`
      };
    }
  },

  /**
   * Cleanup
   */
  async cleanup() {
    for (const [_, db] of this.databases) {
      db.close();
    }
    this.databases.clear();
  }
};
