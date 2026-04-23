/**
 * MÓDULO RECETAS v2 — Refactorizado
 *
 * Responsabilidades:
 * - Ingestion multi-formato (URL/PDF/foto/JSON) → eventos
 * - Búsqueda en BD local (40+ criterios)
 * - Persistencia SQLite per-project con versionado
 * - Orquestación vía eventos (NO lógica bloqueante)
 *
 * Flujo event-driven:
 *   Ingestion Pipeline → receta.ingestion.completed
 *   → Recipe Structurer Agent → receta.structuring.completed
 *   → Recipe Analyzer Agent → receta.analysis.completed
 *   → Recipe Curator Agent → receta.creada/actualizada
 *
 * @version 2.0.0
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const ServiceExecutor = require('../../core/service-executor');

class RecetasModule {
  constructor() {
    this.name = 'recetas';
    this.version = '2.0.0';

    // Inyected by loader
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    this.services = null;                // ServiceExecutor

    // Config
    this.config = {
      ingestion: {
        timeout_url: 30000,
        timeout_pdf: 60000,
        timeout_ocr: 60000,
        max_file_size: 50000000
      }
    };
  }

  // ==========================================
  // LIFECYCLE
  // ==========================================

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.uiHandler = context.uiHandler;

    // ServiceExecutor para providers
    this.services = new ServiceExecutor(this.eventBus, this.logger);

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // PROJECT ACTIVATION
  // ==========================================

  async onProjectActivated(event) {
    const { project_id } = event.data || event;
    try {
      // Leer schema SQL y enviarlo a database-manager para inicializar
      const schemaPath = require('path').join(__dirname, 'db', 'schema.sql');
      const schema = require('fs').readFileSync(schemaPath, 'utf-8');
      await this.eventBus.publish('db.schema.init.request', {
        project_id,
        schema,
        request_id: require('crypto').randomUUID()
      });
      this.logger.info('recetas.project.activated', { project_id });
    } catch (err) {
      this.logger.error('recetas.project.activation_failed', { project_id, error: err.message });
    }
  }

  async onProjectDeactivated(event) {
    const { project_id } = event.data || event;
    this.logger.info('recetas.project.deactivated', { project_id });
  }

  // ==========================================
  // DB HELPERS — emite eventos, no toca SQLite
  // ==========================================

  async _dbQuery(project_id, query, params = []) {
    const request_id = require('crypto').randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('db.query timeout')), 10000);
      const unsub = this.eventBus.subscribe('db.query.response', (e) => {
        const d = e.data || e;
        if (d.request_id !== request_id) return;
        unsub();
        clearTimeout(timeout);
        if (d.error) return reject(new Error(d.error));
        resolve(d.results || []);
      });
      this.eventBus.publish('db.query.request', { project_id, query, params, read_only: true, request_id }).catch(reject);
    });
  }

  async _dbRun(project_id, query, params = []) {
    const request_id = require('crypto').randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('db.run timeout')), 10000);
      const unsub = this.eventBus.subscribe('db.query.response', (e) => {
        const d = e.data || e;
        if (d.request_id !== request_id) return;
        unsub();
        clearTimeout(timeout);
        if (d.error) return reject(new Error(d.error));
        resolve(d);
      });
      this.eventBus.publish('db.query.request', { project_id, query, params, read_only: false, request_id }).catch(reject);
    });
  }

  // ==========================================
  // HANDLERS: UI endpoints (domain: recetas)
  // ==========================================

  async handleIngestar(request) {
    const { proyecto_id, input, tipo, fuente_referencia } = request;
    try {
      const ingestion_id = require('crypto').randomUUID();
      await this.eventBus.publish('receta.ingestion.request', {
        proyecto_id, input, tipo, fuente_referencia, ingestion_id
      });
      return { status: 200, data: { ingestion_id, status: 'processing' } };
    } catch (err) {
      this.logger.error('recetas.ingestar.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleBuscar(request) {
    const { proyecto_id, ...criteria } = request;

    try {
      // Build simple query from criteria
      const { texto, estado, limit: lim = 50 } = criteria;
      let query = 'SELECT * FROM recetas WHERE proyecto_id = ?';
      const params = [proyecto_id];
      if (estado) { query += ' AND estado = ?'; params.push(estado); }
      if (texto) { query += ' AND (nombre LIKE ? OR descripcion LIKE ?)'; params.push(`%${texto}%`, `%${texto}%`); }
      query += ` LIMIT ${parseInt(lim)}`;
      const resultados = await this._dbQuery(proyecto_id, query, params);
      this.metrics?.increment('receta.buscada');

      return {
        status: 200,
        data: {
          recetas: resultados,
          total_encontradas: resultados.length,
          criterios_aplicados: criteria,
          timestamp: Date.now()
        }
      };
    } catch (err) {
      this.logger.error('recetas.buscar.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleListar(request) {
    const { proyecto_id, estado, limit } = request;

    try {
      const { estado: est, limit: lim = 100 } = request;
      let query = 'SELECT * FROM recetas WHERE proyecto_id = ?';
      const params = [proyecto_id];
      if (est) { query += ' AND estado = ?'; params.push(est); }
      query += ` ORDER BY created_at DESC LIMIT ${parseInt(lim)}`;
      const recetas = await this._dbQuery(proyecto_id, query, params);

      return {
        status: 200,
        data: {
          recetas,
          total: recetas.length
        }
      };
    } catch (err) {
      this.logger.error('recetas.listar.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleObtener(request) {
    const { receta_id, proyecto_id } = request;

    try {
      const rows = await this._dbQuery(proyecto_id, 'SELECT * FROM recetas WHERE id = ? AND proyecto_id = ?', [receta_id, proyecto_id]);
      const receta = rows[0];
      if (!receta) {
        return { status: 404, error: 'Receta no encontrada' };
      }

      return { status: 200, data: receta };
    } catch (err) {
      this.logger.error('recetas.obtener.failed', { receta_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleHistorial(request) {
    const { receta_id, proyecto_id, limit = 50 } = request;

    try {
      const historial = await this._dbQuery(
        proyecto_id,
        'SELECT * FROM recetas_versiones WHERE receta_id = ? ORDER BY version DESC LIMIT ?',
        [receta_id, parseInt(limit)]
      );

      return { status: 200, data: historial };
    } catch (err) {
      this.logger.error('recetas.historial.failed', { receta_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleRevertir(request) {
    const { receta_id, proyecto_id, target_version } = request;

    try {
      // TODO: implementar via db events (revertVersion requiere lógica multi-step)
      await this.eventBus.publish('receta.revertida', {
        receta_id,
        proyecto_id,
        revertida_a_version: target_version,
        timestamp: Date.now()
      });

      return { status: 200, data: { receta_id, revertida_a_version: target_version } };
    } catch (err) {
      this.logger.error('recetas.revertir.failed', { receta_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleIngredientes(request) {
    const { proyecto_id, categoria } = request;

    try {
      let query = 'SELECT * FROM ingredientes WHERE proyecto_id = ?';
      const params = [proyecto_id];
      if (categoria) { query += ' AND categoria = ?'; params.push(categoria); }
      query += ' ORDER BY nombre';
      const ingredientes = await this._dbQuery(proyecto_id, query, params);

      return { status: 200, data: ingredientes };
    } catch (err) {
      this.logger.error('recetas.ingredientes.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleActualizarPrecio(request) {
    const { ingrediente_id, proyecto_id, precio_mercado, fuente } = request;

    try {
      await this._dbRun(
        proyecto_id,
        'UPDATE ingredientes SET precio_mercado = ?, precio_fuente = ?, precio_updated_at = ? WHERE id = ? AND proyecto_id = ?',
        [precio_mercado, fuente || null, Date.now(), ingrediente_id, proyecto_id]
      );

      await this.eventBus.publish('ingrediente.precio.actualizado', {
        ingrediente_id,
        proyecto_id,
        precio_mercado,
        fuente,
        timestamp: Date.now()
      });

      return { status: 200, data: { ingrediente_id, precio_mercado } };
    } catch (err) {
      this.logger.error('recetas.actualizar_precio.failed', { ingrediente_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleEstadisticas(request) {
    const { proyecto_id } = request;

    try {
      const [totalRows, estadosRows] = await Promise.all([
        this._dbQuery(proyecto_id, 'SELECT COUNT(*) as total FROM recetas WHERE proyecto_id = ?', [proyecto_id]),
        this._dbQuery(proyecto_id, 'SELECT estado, COUNT(*) as count FROM recetas WHERE proyecto_id = ? GROUP BY estado', [proyecto_id])
      ]);

      const stats = {
        total: totalRows[0]?.total || 0,
        por_estado: estadosRows
      };

      return { status: 200, data: stats };
    } catch (err) {
      this.logger.error('recetas.estadisticas.failed', { proyecto_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  /**
   * Extraer palabras clave de un nombre de receta
   * "salsa oriental con patatas" → ["salsa", "oriental", "patatas"]
   */
  extractKeywords(text) {
    if (!text) return [];
    const stopwords = new Set(['con', 'de', 'la', 'el', 'y', 'o', 'a', 'al', 'del', 'los', 'las']);
    const words = text
      .toLowerCase()
      .split(/[\s\-,]+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
    return [...new Set(words)];
  }

  /**
   * Búsqueda multi-criterio inteligente
   * Realiza varias búsquedas y rankea por relevancia
   */
  async intelligentSearch(projectId, nombreReceta, descripcion) {
    const keywords = this.extractKeywords(nombreReceta);

    // Búsquedas a ejecutar: { sqlWhere, sqlParams, weight, name }
    const searches = [];

    // Búsqueda 1: Nombre exacto (mayor relevancia)
    searches.push({
      query: 'SELECT * FROM recetas WHERE proyecto_id = ? AND nombre = ? LIMIT 10',
      params: [projectId, nombreReceta],
      weight: 100,
      name: 'exact_name'
    });

    // Búsqueda 2: Palabras clave del nombre
    for (const keyword of keywords) {
      searches.push({
        query: 'SELECT * FROM recetas WHERE proyecto_id = ? AND nombre LIKE ? LIMIT 10',
        params: [projectId, `%${keyword}%`],
        weight: 80,
        name: 'keyword_name'
      });
    }

    // Búsqueda 3: Por tipo de plato
    const tiposPlato = {
      'salsa': 'salsa', 'sopa': 'sopa', 'ensalada': 'ensalada',
      'postre': 'postre', 'pasta': 'pasta', 'arroz': 'arroz',
      'carne': 'carne', 'pescado': 'pescado', 'verdura': 'verdura', 'pan': 'pan'
    };

    for (const keyword of keywords) {
      if (tiposPlato[keyword]) {
        searches.push({
          query: 'SELECT * FROM recetas WHERE proyecto_id = ? AND tipo_plato = ? LIMIT 10',
          params: [projectId, tiposPlato[keyword]],
          weight: 60,
          name: 'type_search'
        });
      }
    }

    // Ejecutar todas las búsquedas y recolectar resultados
    const resultMap = new Map(); // receta_id → { receta, score }

    for (const search of searches) {
      try {
        const results = await this._dbQuery(projectId, search.query, search.params);
        if (results && results.length > 0) {
          for (const receta of results) {
            const existingEntry = resultMap.get(receta.id);
            const newScore = search.weight;

            // Calcular score adicional por coincidencia
            let matchBonus = 0;
            if (receta.nombre.toLowerCase() === nombreReceta.toLowerCase()) {
              matchBonus = 50; // Coincidencia exacta
            } else if (receta.nombre.toLowerCase().includes(nombreReceta.toLowerCase())) {
              matchBonus = 30; // Coincidencia parcial
            } else {
              // Calcular similitud de Levenshtein simplificada
              matchBonus = this.calculateSimilarity(nombreReceta.toLowerCase(), receta.nombre.toLowerCase()) * 25;
            }

            const totalScore = newScore + matchBonus;

            if (!existingEntry || existingEntry.score < totalScore) {
              resultMap.set(receta.id, {
                receta,
                score: totalScore,
                matchedBy: search.name
              });
            }
          }
        }
      } catch (err) {
        this.logger.debug('recetas.investigar.search-error', {
          search: search.name,
          error: err.message
        });
      }
    }

    // Ordenar por score y retornar top 5
    const ranked = Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(entry => ({
        ...entry.receta,
        _investigacion_score: entry.score,
        _matched_by: entry.matchedBy
      }));

    return ranked;
  }

  /**
   * Calcular similitud simple entre dos strings (0-1)
   * Implementación simplificada de Levenshtein
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.getEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calcular distancia de edición (Levenshtein)
   */
  getEditDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  /**
   * Handle: investigar_receta (OPCIÓN 2 - Fase 1 MEJORADA)
   *
   * Orquesta la investigación de una receta con búsqueda inteligente multi-criterio:
   * 1. Búsqueda por nombre exacto
   * 2. Búsqueda por palabras clave
   * 3. Búsqueda por tipo de plato
   * 4. Búsqueda por ingredientes
   * 5. Rankea por relevancia
   * 6. Si existe → retorna con costos
   * 7. Si no existe → estructura parcial con "needs_generation"
   */
  async handleInvestigarReceta(request) {
    const { proyecto_id, nombre_receta, descripcion_opcional } = request;

    try {
      if (!nombre_receta || nombre_receta.trim() === '') {
        return { status: 400, error: 'nombre_receta es requerido' };
      }

      this.logger.info('recetas.investigar.iniciado', {
        proyecto_id,
        nombre_receta,
        tiene_descripcion: !!descripcion_opcional,
        busqueda_inteligente: true
      });

      // PASO 1: Búsqueda inteligente multi-criterio
      const busqueda = await this.intelligentSearch(proyecto_id, nombre_receta, descripcion_opcional);

      let resultado = {
        investigacion_id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        proyecto_id,
        nombre_buscado: nombre_receta,
        descripcion_proporcionada: descripcion_opcional || null
      };

      // PASO 2: Evaluar resultados
      if (busqueda && busqueda.length > 0) {
        // Encontró coincidencias
        const receta = busqueda[0];
        const confidence = this.calculateConfidence(receta._investigacion_score);

        resultado.status = 'receta_encontrada';
        resultado.confianza = confidence;
        resultado.receta = receta;
        resultado.ingredientes_pendientes = [];
        resultado.flags = [];
        resultado.search_score = receta._investigacion_score;
        resultado.matched_by = receta._matched_by;

        // Mostrar alternativas si hay varias coincidencias
        if (busqueda.length > 1) {
          resultado.alternativas = busqueda.slice(1, 4).map(r => ({
            id: r.id,
            nombre: r.nombre,
            score: r._investigacion_score,
            matched_by: r._matched_by
          }));
        }

        // Obtener costos (reales o estimados)
        try {
          resultado.costes = await this.obtenerCostosReceta(receta, proyecto_id);

          // Agregar advertencia si son estimados
          if (resultado.costes.tipo === 'estimado') {
            resultado.flags.push('costos_estimados_no_reales');
          }
        } catch (e) {
          this.logger.error('recetas.investigar.costos-error', {
            receta_id: receta.id,
            error: e.message
          });
          // Continuar sin costos si hay error
        }

        resultado.viabilidad = {
          estado: 'VIABLE',
          razon: `Receta encontrada (score: ${receta._investigacion_score.toFixed(1)})`,
          confianza_alta: confidence === 'alta'
        };

        this.logger.info('recetas.investigar.encontrada', {
          proyecto_id,
          receta_id: receta.id,
          confidence,
          search_score: receta._investigacion_score
        });

      } else {
        // No encontró - necesita generación (Fase 2)
        resultado.status = 'needs_generation';
        resultado.confianza = 'baja';
        resultado.receta = {
          nombre: nombre_receta,
          descripcion: descripcion_opcional || '',
          estado: 'borrador',
          ingredientes: [],
          elaboracion: [],
          _estatus_investigacion: 'pendiente_generacion'
        };
        resultado.ingredientes_pendientes = [
          {
            razon: 'no_encontrada_en_bd',
            sugerencia: 'Se requiere generación con Claude en Fase 2'
          }
        ];
        resultado.flags = [
          'receta_no_existe',
          'requiere_generacion_fase_2',
          'fase_1_completada',
          'busqueda_inteligente_ejecutada'
        ];

        this.logger.info('recetas.investigar.no_encontrada', {
          proyecto_id,
          nombre_receta,
          busqueda_inteligente: true
        });
      }

      this.metrics?.increment('receta.investigada');

      return {
        status: 200,
        data: resultado
      };

    } catch (err) {
      this.logger.error('recetas.investigar.failed', {
        proyecto_id,
        nombre_receta,
        error: err.message
      });
      return { status: 500, error: err.message };
    }
  }

  /**
   * Calcular nivel de confianza basado en score
   */
  calculateConfidence(score) {
    if (score >= 80) return 'alta';
    if (score >= 50) return 'media';
    return 'baja';
  }

  /**
   * Intentar obtener costos reales de escandallo
   * Si no existe escandallo, calcula estimado y marca como tal
   */
  async obtenerCostosReceta(receta, projectId) {
    const costos = {
      tipo: 'estimado', // 'real' o 'estimado'
      coste_total: 0,
      coste_porcion: 0,
      food_cost_porcentaje: null,
      detalles: []
    };

    try {
      // PASO 1: Intentar obtener costos del escandallo si existen
      // (En futuro, usar escandallo tool directamente)
      // Para ahora, calcular basado en ingredientes

      if (!receta.ingredientes || receta.ingredientes.length === 0) {
        return costos; // Sin ingredientes
      }

      // PASO 2: Calcular costos basados en precios de ingredientes
      let coste_total = 0;
      const detalles = [];

      for (const ing of receta.ingredientes) {
        const precio = ing.precio_mercado_en_momento || ing.precio_mercado || 0;
        coste_total += precio;

        detalles.push({
          nombre: ing.nombre,
          cantidad: ing.cantidad,
          unidad: ing.unidad,
          precio_unitario: precio,
          es_precio_real: !!ing.precio_mercado // true si es precio de mercado real
        });
      }

      // PASO 3: Calcular por porción
      const coste_porcion = receta.porciones && receta.porciones > 0
        ? coste_total / receta.porciones
        : coste_total;

      // PASO 4: Determinar si es "real" o "estimado"
      // Es "real" si todos los ingredientes tienen precio_mercado
      const todosTienenPrecio = receta.ingredientes.every(
        ing => ing.precio_mercado_en_momento || ing.precio_mercado
      );

      costos.tipo = todosTienenPrecio ? 'real' : 'estimado';
      costos.coste_total = Math.round(coste_total * 100) / 100;
      costos.coste_porcion = Math.round(coste_porcion * 100) / 100;
      costos.detalles = detalles;
      costos.fuente = todosTienenPrecio ? 'precios_mercado' : 'precios_parciales';

      // PASO 5: Log para debugging
      this.logger.debug('recetas.investigar.costos-calculados', {
        receta_id: receta.id,
        tipo: costos.tipo,
        coste_total: costos.coste_total,
        ingredientes_con_precio: detalles.filter(d => d.es_precio_real).length,
        ingredientes_total: detalles.length
      });

      return costos;

    } catch (err) {
      this.logger.error('recetas.investigar.costos-error', {
        receta_id: receta.id,
        error: err.message
      });
      // Retornar objeto vacío pero válido
      return costos;
    }
  }

  // ==========================================
  // TOOLS: Para agentes IA
  // ==========================================

  async toolIngestar(params) {
    return this.handleIngestar(params);
  }

  // Emitido por el LLM cuando detecta una receta nueva en la conversación
  async onRecetaCrear(event) {
    const data = event.data || event;
    const { proyecto_id, nombre, ingredientes, notas } = data;
    if (!proyecto_id || !ingredientes) return;
    const input = notas
      ? `${nombre || 'Receta'}: ${ingredientes}. ${notas}`
      : `${nombre || 'Receta'}: ${ingredientes}`;
    const result = await this.handleIngestar({ proyecto_id, input, tipo: 'texto', fuente_referencia: 'chat' });
    if (result.status === 200) {
      await this.eventBus.publish('receta.creada', { proyecto_id, nombre, resultado: result.data });
    }
  }

  // Tool que el LLM llama desde el chat (fire-and-forget)
  async toolCrearDesdeChat(params) {
    const { nombre, ingredientes, proyecto_id, notas } = params;
    // Lanzar sin await — el LLM continúa la conversación
    this.eventBus.publish('receta.crear', { proyecto_id, nombre, ingredientes, notas })
      .catch(() => {});
    return { status: 'ok', message: `Guardando receta "${nombre}"…` };
  }

  async onRecetaActualizar(event) {
    const { proyecto_id, id, cambios } = event.data || event;
    const result = await this.handleActualizar({ proyecto_id, receta_id: id, ...cambios });
    if (result.status === 200) {
      await this.eventBus.publish('receta.actualizada', { proyecto_id, id, datos: result.data });
    }
  }

  async onRecetaBorrar(event) {
    const { proyecto_id, id } = event.data || event;
    const result = await this.handleEliminar({ proyecto_id, receta_id: id });
    if (result.status === 200) {
      await this.eventBus.publish('receta.borrada', { proyecto_id, id });
    }
  }

  async onRecetaBuscar(event) {
    const { proyecto_id, request_id, ...criteria } = event.data || event;
    const result = await this.handleBuscar({ proyecto_id, ...criteria });
    await this.eventBus.publish('receta.buscada', {
      proyecto_id, request_id,
      resultados: result.data?.recetas || [],
      error: result.error || null
    });
  }

  async onRecetaObtener(event) {
    const { proyecto_id, id, request_id } = event.data || event;
    const result = await this.handleObtener({ proyecto_id, receta_id: id });
    await this.eventBus.publish('receta.obtenida', {
      proyecto_id, request_id,
      datos: result.data || null,
      error: result.error || null
    });
  }

  async onRecetaListar(event) {
    const { proyecto_id, request_id, estado, limit } = event.data || event;
    const result = await this.handleListar({ proyecto_id, estado, limit });
    await this.eventBus.publish('receta.listada', {
      proyecto_id, request_id,
      items: result.data?.recetas || [],
      error: result.error || null
    });
  }

  async onRecetaIngestar(event) {
    const { proyecto_id, input, tipo, fuente_referencia } = event.data || event;
    const result = await this.handleIngestar({ proyecto_id, input, tipo, fuente_referencia });
    if (result.status === 200) {
      await this.eventBus.publish('receta.ingestada', { proyecto_id, resultado: result.data });
    }
  }

  async onRecetaInvestigar(event) {
    const { proyecto_id, request_id, query } = event.data || event;
    const result = await this.handleInvestigarReceta({ proyecto_id, query });
    await this.eventBus.publish('receta.investigada', {
      proyecto_id, request_id,
      resultado: result.data || null,
      error: result.error || null
    });
  }

  async toolBuscar(params) {
    return this.handleBuscar(params);
  }

  async toolListar(params) {
    return this.handleListar(params);
  }

  async toolObtener(params) {
    return this.handleObtener(params);
  }

  async toolHistorial(params) {
    return this.handleHistorial(params);
  }

  async toolRevertir(params) {
    return this.handleRevertir(params);
  }

  async toolIngredientes(params) {
    return this.handleIngredientes(params);
  }

  async toolActualizarPrecio(params) {
    return this.handleActualizarPrecio(params);
  }

  async toolEstadisticas(params) {
    return this.handleEstadisticas(params);
  }

  async toolInvestigarReceta(params) {
    return this.handleInvestigarReceta(params);
  }

  // ==========================================
  // TOOL EVENT HANDLERS — paradigma event-driven
  // AI emite recetas.buscar → recetas responde recetas.buscar.response
  // ==========================================

  async _toolResponse(toolName, event, handlerFn) {
    const data = event.data || event;
    const { request_id, project_id, ...rest } = data;
    const params = { ...rest, proyecto_id: project_id ?? rest.proyecto_id };
    try {
      const result = await handlerFn(params);
      await this.eventBus.publish(`${toolName}.response`, { request_id, result });
    } catch (err) {
      await this.eventBus.publish(`${toolName}.response`, { request_id, error: err.message });
    }
  }

  async onToolBuscar(event)          { return this._toolResponse('recetas.buscar',            event, p => this.handleBuscar(p)); }
  async onToolListar(event)          { return this._toolResponse('recetas.listar',             event, p => this.handleListar(p)); }
  async onToolObtener(event)         { return this._toolResponse('recetas.obtener',            event, p => this.handleObtener(p)); }
  async onToolIngestar(event)        { return this._toolResponse('recetas.ingestar',           event, p => this.handleIngestar(p)); }
  async onToolHistorial(event)       { return this._toolResponse('recetas.historial',          event, p => this.handleHistorial(p)); }
  async onToolEstadisticas(event)    { return this._toolResponse('recetas.estadisticas',       event, p => this.handleEstadisticas(p)); }
  async onToolIngredientes(event)    { return this._toolResponse('recetas.ingredientes',       event, p => this.handleIngredientes(p)); }
  async onToolActualizarPrecio(event){ return this._toolResponse('recetas.actualizar_precio',  event, p => this.handleActualizarPrecio(p)); }
  async onToolCrearDesdeChat(event)  { return this._toolResponse('recetas.crear_desde_chat',   event, p => this.handleIngestar(p)); }

  async onToolCrear(event) {
    return this._toolResponse('recetas.crear', event, async (p) => {
      const { proyecto_id, nombre, descripcion, ingredientes, instrucciones, ...rest } = p;
      const input = JSON.stringify({ nombre, descripcion, ingredientes, instrucciones, ...rest });
      return this.handleIngestar({ proyecto_id, input, tipo: 'json', fuente_referencia: 'chat' });
    });
  }

  async onToolAnalizar(event) {
    return this._toolResponse('recetas.analizar', event, async (p) => {
      const { proyecto_id, receta_id } = p;
      // Obtener nombre de la receta para investigar
      const row = await this.handleObtener({ proyecto_id, receta_id });
      const nombre = row?.data?.nombre || receta_id;
      return this.handleInvestigarReceta({ proyecto_id, nombre_receta: nombre });
    });
  }

  async onToolActualizar(event) {
    return this._toolResponse('recetas.actualizar', event, p => this.handleActualizar(p));
  }

  async onToolEliminar(event) {
    return this._toolResponse('recetas.eliminar', event, p => this.handleEliminar(p));
  }

  async handleActualizar({ proyecto_id, receta_id, cambios = {} }) {
    try {
      const { nombre, descripcion, estado } = cambios;
      const sets = [];
      const params = [];
      if (nombre) { sets.push('nombre = ?'); params.push(nombre); }
      if (descripcion !== undefined) { sets.push('descripcion = ?'); params.push(descripcion); }
      if (estado) { sets.push('estado = ?'); params.push(estado); }
      if (sets.length === 0) return { status: 400, error: 'No hay campos para actualizar' };
      sets.push('updated_at = ?');
      params.push(Date.now(), receta_id, proyecto_id);
      await this._dbRun(proyecto_id,
        `UPDATE recetas SET ${sets.join(', ')} WHERE id = ? AND proyecto_id = ?`,
        params
      );
      return { status: 200, data: { updated: true, receta_id } };
    } catch (err) {
      this.logger.error('recetas.actualizar.failed', { receta_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleEliminar({ proyecto_id, receta_id }) {
    try {
      await this._dbRun(proyecto_id,
        'UPDATE recetas SET estado = ?, updated_at = ? WHERE id = ? AND proyecto_id = ?',
        ['archivada', Date.now(), receta_id, proyecto_id]
      );
      return { status: 200, data: { eliminada: true, receta_id } };
    } catch (err) {
      this.logger.error('recetas.eliminar.failed', { receta_id, error: err.message });
      return { status: 500, error: err.message };
    }
  }
}

module.exports = RecetasModule;
