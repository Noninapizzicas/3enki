/**
 * Módulo Notas v2.0.0 — POC del rewrite
 *
 * Aplica los 4 contratos arquitectónicos (events, lifecycle, observability,
 * errors) y las 2 convenciones (naming, glossary).
 *
 * Doctrina:
 *   - Emite. No esperas. Tu evento es información que viaja.
 *   - El módulo es un invitado. Recibe del core lo que necesita.
 *   - Lo que se reserva se libera (this.notas en onUnload).
 *   - Toda respuesta sigue { status, data?, error? }.
 *   - Cada error genera log + métrica automáticos via _buildErrorResponse().
 *   - Stack jamás en respuesta — solo en logs.
 *
 * Persistencia: JSON file con write atómico (tempFile + rename).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

class NotasModule {
  constructor() {
    this.name    = 'notas';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.logger   = null;
    this.metrics  = null;
    this.eventBus = null;

    // Config (mergeada en onLoad desde core.config?.[this.name])
    this.config = {
      data_path:            './data/notas.json',
      max_titulo_length:    100,
      max_contenido_length: 5000,
      valid_colors:         ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'],
      default_color:        'yellow'
    };

    // Estado interno (init en onLoad)
    this.notas      = null;  // Map<id, nota>
    this._dataFile  = null;  // path absoluto
    this._dataDir   = null;  // dir absoluto
  }

  // ============================================================
  // Lifecycle (canonical signatures)
  // ============================================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    // Config namespacing — solo lee su slice
    if (core.config?.[this.name]) {
      this.config = { ...this.config, ...core.config[this.name] };
    }

    this._dataFile = path.resolve(this.config.data_path);
    this._dataDir  = path.dirname(this._dataFile);

    this.notas = new Map();
    await this._cargarDesdeDisco();

    this.logger.info('notas.modulo.cargado', {
      module:      this.name,
      version:     this.version,
      total_notas: this.notas.size,
      data_path:   this._dataFile
    });

    this.metrics.gauge(`${this.name}.activas.count`, this.notas.size);
  }

  async onUnload() {
    // Persistir estado actual antes de descargar (defensivo)
    if (this.notas && this.notas.size > 0) {
      await this._persistirADisco();
    }

    // Liberar lo reservado
    this.notas?.clear();
    this.notas = null;

    this.logger?.info('notas.modulo.descargado', { module: this.name });
  }

  // ============================================================
  // HTTP Handlers
  // Forma de respuesta canónica: { status, data?, error? }
  // ============================================================

  async handleListar(req, context) {
    const correlation_id = context?.correlationId;

    try {
      const { color, pinned } = req.query || {};

      let notas = Array.from(this.notas.values());

      if (color) {
        notas = notas.filter(n => n.color === color);
      }
      if (pinned !== undefined) {
        const isPinned = pinned === 'true' || pinned === true;
        notas = notas.filter(n => n.pinned === isPinned);
      }

      // Pinned primero, luego por created_at descendente
      notas.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      this.logger.info('notas.listado.completado', {
        total:           notas.length,
        filtros_color:   color || null,
        filtros_pinned:  pinned ?? null,
        correlation_id
      });

      return { status: 200, data: { notas, total: notas.length } };

    } catch (err) {
      return this._buildErrorResponse({
        action:         'listar',
        status:         500,
        code:           'UNKNOWN_ERROR',
        message:        'Error inesperado al listar notas',
        cause:          err,
        correlation_id
      });
    }
  }

  async handleObtener(req, context) {
    const correlation_id = context?.correlationId;
    const id             = req.params?.id;

    if (!id) {
      return this._buildErrorResponse({
        action: 'obtener',
        status: 400,
        code:   'INVALID_INPUT',
        message: 'id es obligatorio',
        details: { field: 'id' },
        correlation_id
      });
    }

    const nota = this.notas.get(id);
    if (!nota) {
      return this._buildErrorResponse({
        action: 'obtener',
        status: 404,
        code:   'RESOURCE_NOT_FOUND',
        message: `Nota con id ${id} no existe`,
        details: { entity_type: 'nota', entity_id: id },
        correlation_id
      });
    }

    return { status: 200, data: nota };
  }

  async handleCrear(req, context) {
    const correlation_id = context?.correlationId;
    const start          = Date.now();

    const body          = req.body || {};
    const errores       = this._validarCrear(body);
    if (errores.length > 0) {
      return this._buildErrorResponse({
        action: 'crear',
        status: 400,
        code:   errores[0].code,
        message: errores[0].message,
        details: { ...errores[0].details, all_errors: errores },
        correlation_id
      });
    }

    try {
      const nota = {
        id:          this._generarId(),
        titulo:      body.titulo.trim(),
        contenido:   body.contenido ?? '',
        color:       body.color ?? this.config.default_color,
        pinned:      body.pinned === true,
        created_at:  new Date().toISOString(),
        updated_at:  null
      };

      this.notas.set(nota.id, nota);
      await this._persistirADisco();

      // Métricas de éxito
      this.metrics.increment(`${this.name}.creado.total`);
      this.metrics.gauge(`${this.name}.activas.count`, this.notas.size);
      this.metrics.timing(`${this.name}.crear.duration`, Date.now() - start);

      this.logger.info('notas.creado', {
        nota_id: nota.id,
        titulo:  nota.titulo,
        color:   nota.color,
        pinned:  nota.pinned,
        correlation_id
      });

      // Evento de dominio (forma canónica del nombre, masculino singular)
      await this._publicarEvento('notas.creado', {
        nota_id:   nota.id,
        titulo:    nota.titulo,
        contenido: nota.contenido,
        color:     nota.color,
        pinned:    nota.pinned
      }, correlation_id);

      return { status: 201, data: nota };

    } catch (err) {
      return this._buildErrorResponse({
        action: 'crear',
        status: 500,
        code:   'UNKNOWN_ERROR',
        message: 'Error inesperado al crear nota',
        cause:  err,
        correlation_id
      });
    }
  }

  async handleActualizar(req, context) {
    const correlation_id = context?.correlationId;
    const start          = Date.now();
    const id             = req.params?.id;

    if (!id) {
      return this._buildErrorResponse({
        action: 'actualizar', status: 400, code: 'INVALID_INPUT',
        message: 'id es obligatorio', details: { field: 'id' },
        correlation_id
      });
    }

    const nota = this.notas.get(id);
    if (!nota) {
      return this._buildErrorResponse({
        action: 'actualizar', status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Nota con id ${id} no existe`,
        details: { entity_type: 'nota', entity_id: id },
        correlation_id
      });
    }

    const body    = req.body || {};
    const errores = this._validarActualizar(body);
    if (errores.length > 0) {
      return this._buildErrorResponse({
        action: 'actualizar', status: 400, code: errores[0].code,
        message: errores[0].message,
        details: { ...errores[0].details, all_errors: errores },
        correlation_id
      });
    }

    try {
      // Snapshot previo para el evento
      const previous = { ...nota };

      // Aplicar updates parciales
      const updates = {};
      if (body.titulo !== undefined)    { nota.titulo    = body.titulo.trim(); updates.titulo    = nota.titulo; }
      if (body.contenido !== undefined) { nota.contenido = body.contenido;     updates.contenido = nota.contenido; }
      if (body.color !== undefined)     { nota.color     = body.color;         updates.color     = nota.color; }
      if (body.pinned !== undefined)    { nota.pinned    = body.pinned === true; updates.pinned  = nota.pinned; }

      nota.updated_at = new Date().toISOString();

      this.notas.set(id, nota);
      await this._persistirADisco();

      this.metrics.increment(`${this.name}.actualizado.total`);
      this.metrics.timing(`${this.name}.actualizar.duration`, Date.now() - start);

      this.logger.info('notas.actualizado', {
        nota_id: id,
        updates: Object.keys(updates),
        correlation_id
      });

      await this._publicarEvento('notas.actualizado', {
        nota_id:  id,
        updates,
        previous
      }, correlation_id);

      return { status: 200, data: nota };

    } catch (err) {
      return this._buildErrorResponse({
        action: 'actualizar', status: 500, code: 'UNKNOWN_ERROR',
        message: 'Error inesperado al actualizar nota',
        cause:  err, correlation_id
      });
    }
  }

  async handleEliminar(req, context) {
    const correlation_id = context?.correlationId;
    const id             = req.params?.id;

    if (!id) {
      return this._buildErrorResponse({
        action: 'eliminar', status: 400, code: 'INVALID_INPUT',
        message: 'id es obligatorio', details: { field: 'id' },
        correlation_id
      });
    }

    const nota = this.notas.get(id);
    if (!nota) {
      return this._buildErrorResponse({
        action: 'eliminar', status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Nota con id ${id} no existe`,
        details: { entity_type: 'nota', entity_id: id },
        correlation_id
      });
    }

    try {
      this.notas.delete(id);
      await this._persistirADisco();

      this.metrics.increment(`${this.name}.eliminado.total`);
      this.metrics.gauge(`${this.name}.activas.count`, this.notas.size);

      this.logger.info('notas.eliminado', {
        nota_id: id,
        titulo:  nota.titulo,
        correlation_id
      });

      await this._publicarEvento('notas.eliminado', {
        nota_id: id,
        titulo:  nota.titulo
      }, correlation_id);

      return { status: 204, data: { id } };

    } catch (err) {
      return this._buildErrorResponse({
        action: 'eliminar', status: 500, code: 'UNKNOWN_ERROR',
        message: 'Error inesperado al eliminar nota',
        cause:  err, correlation_id
      });
    }
  }

  async handleFijar(req, context) {
    const correlation_id = context?.correlationId;
    const id             = req.params?.id;

    if (!id) {
      return this._buildErrorResponse({
        action: 'fijar', status: 400, code: 'INVALID_INPUT',
        message: 'id es obligatorio', details: { field: 'id' },
        correlation_id
      });
    }

    const nota = this.notas.get(id);
    if (!nota) {
      return this._buildErrorResponse({
        action: 'fijar', status: 404, code: 'RESOURCE_NOT_FOUND',
        message: `Nota con id ${id} no existe`,
        details: { entity_type: 'nota', entity_id: id },
        correlation_id
      });
    }

    try {
      const previous_pinned = nota.pinned;
      nota.pinned     = !nota.pinned;
      nota.updated_at = new Date().toISOString();

      this.notas.set(id, nota);
      await this._persistirADisco();

      this.metrics.increment(`${this.name}.fijado.total`, 1, { new_state: String(nota.pinned) });

      this.logger.info('notas.fijado', {
        nota_id:    id,
        pinned:     nota.pinned,
        previous:   previous_pinned,
        correlation_id
      });

      // Pin toggle es semánticamente una actualización — emite el evento canónico
      await this._publicarEvento('notas.actualizado', {
        nota_id:  id,
        updates:  { pinned: nota.pinned },
        previous: { pinned: previous_pinned }
      }, correlation_id);

      return { status: 200, data: { id, pinned: nota.pinned } };

    } catch (err) {
      return this._buildErrorResponse({
        action: 'fijar', status: 500, code: 'UNKNOWN_ERROR',
        message: 'Error inesperado al fijar/desfijar nota',
        cause:  err, correlation_id
      });
    }
  }

  // ============================================================
  // Helpers privados
  // ============================================================

  /**
   * Construye respuesta de error canónica + telemetría automática.
   * Cumple errors.contract.json:
   *   - shape canónico { status, error: { code, message, details? } }
   *   - log automático con stack en err original (si existe)
   *   - métrica automática
   *   - stack JAMÁS en la respuesta
   */
  _buildErrorResponse({ action, status, code, message, details, cause, correlation_id }) {
    const isInfra = status >= 500;
    const level   = isInfra ? 'error' : 'warn';
    const kind    = isInfra ? 'infrastructure' : 'domain';

    // Auto-log con stack interno
    this.logger[level](`${this.name}.${action}.fallido`, {
      error_code:    code,
      error_message: message,
      error_details: details || {},
      stack:         cause?.stack || null,
      correlation_id
    });

    // Auto-metric con label code
    this.metrics?.increment(`${this.name}.${action}.errors`, 1, { code, kind });

    // Respuesta limpia (sin stack)
    return {
      status,
      error: {
        code,
        message,
        ...(details ? { details } : {})
      }
    };
  }

  /**
   * Publica evento de dominio con correlation_id propagado (cuando aplique).
   * Cumple events.contract.json + observability.contract.json:
   *   - publish via eventBus (canal único)
   *   - timestamp lo añade el bus internamente (si lo hace) o lo añadimos aquí
   *   - correlation_id propagado en el payload
   *   - sin .catch silencioso
   */
  async _publicarEvento(nombre, payload, correlation_id) {
    if (!this.eventBus) {
      this.logger.warn('notas.publicar.bus_no_disponible', {
        evento: nombre,
        correlation_id
      });
      return;
    }

    const finalPayload = {
      ...payload,
      timestamp: new Date().toISOString(),
      ...(correlation_id ? { correlation_id } : {})
    };

    try {
      await this.eventBus.publish(nombre, finalPayload);
    } catch (err) {
      this.logger.error('notas.publicar.fallido', {
        evento:        nombre,
        error_message: err.message,
        stack:         err.stack,
        correlation_id
      });
      this.metrics?.increment(`${this.name}.publicar.errors`, 1, { evento: nombre });
    }
  }

  _validarCrear(data) {
    const errores = [];
    const titulo  = data.titulo;

    if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
      errores.push({
        code:    'INVALID_INPUT',
        message: 'titulo es obligatorio',
        details: { field: 'titulo' }
      });
    } else if (titulo.length > this.config.max_titulo_length) {
      errores.push({
        code:    'INVALID_INPUT',
        message: `titulo excede ${this.config.max_titulo_length} caracteres`,
        details: { field: 'titulo', max: this.config.max_titulo_length }
      });
    }

    if (data.contenido !== undefined && typeof data.contenido === 'string' &&
        data.contenido.length > this.config.max_contenido_length) {
      errores.push({
        code:    'INVALID_INPUT',
        message: `contenido excede ${this.config.max_contenido_length} caracteres`,
        details: { field: 'contenido', max: this.config.max_contenido_length }
      });
    }

    if (data.color !== undefined && !this.config.valid_colors.includes(data.color)) {
      errores.push({
        code:    'INVALID_INPUT',
        message: `color inválido (válidos: ${this.config.valid_colors.join(', ')})`,
        details: { field: 'color', allowed: this.config.valid_colors }
      });
    }

    return errores;
  }

  _validarActualizar(data) {
    const errores = [];

    if (data.titulo !== undefined) {
      if (typeof data.titulo !== 'string' || data.titulo.trim() === '') {
        errores.push({
          code:    'INVALID_INPUT',
          message: 'titulo no puede estar vacío',
          details: { field: 'titulo' }
        });
      } else if (data.titulo.length > this.config.max_titulo_length) {
        errores.push({
          code:    'INVALID_INPUT',
          message: `titulo excede ${this.config.max_titulo_length} caracteres`,
          details: { field: 'titulo', max: this.config.max_titulo_length }
        });
      }
    }

    if (data.contenido !== undefined && typeof data.contenido === 'string' &&
        data.contenido.length > this.config.max_contenido_length) {
      errores.push({
        code:    'INVALID_INPUT',
        message: `contenido excede ${this.config.max_contenido_length} caracteres`,
        details: { field: 'contenido', max: this.config.max_contenido_length }
      });
    }

    if (data.color !== undefined && !this.config.valid_colors.includes(data.color)) {
      errores.push({
        code:    'INVALID_INPUT',
        message: `color inválido (válidos: ${this.config.valid_colors.join(', ')})`,
        details: { field: 'color', allowed: this.config.valid_colors }
      });
    }

    return errores;
  }

  _generarId() {
    return `nota_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Carga notas desde JSON file. Si no existe, arranca con Map vacía.
   * No lanza si el archivo está corrupto — loguea warn y arranca limpio.
   */
  async _cargarDesdeDisco() {
    try {
      await fs.promises.mkdir(this._dataDir, { recursive: true });
      const raw  = await fs.promises.readFile(this._dataFile, 'utf8');
      const data = JSON.parse(raw);
      if (data?.notas && Array.isArray(data.notas)) {
        for (const nota of data.notas) {
          this.notas.set(nota.id, nota);
        }
      }
      this.logger.info('notas.persistencia.cargada', {
        total: this.notas.size,
        path:  this._dataFile
      });
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.logger.info('notas.persistencia.archivo_inexistente', {
          path: this._dataFile,
          nota: 'arrancando con notas vacías'
        });
      } else {
        // Archivo corrupto u otro error — arrancar limpio pero loguear
        this.logger.warn('notas.persistencia.error_carga', {
          error_message: err.message,
          stack:         err.stack,
          path:          this._dataFile
        });
      }
    }
  }

  /**
   * Persiste el estado actual a disco con write atómico (tempFile + rename).
   * Falla silenciosa con log error — no propaga porque el caller ya hizo su trabajo
   * (la nota está en memoria y la respuesta es de éxito); la persistencia
   * fallida queda visible en logs/métricas para que el operador actúe.
   */
  async _persistirADisco() {
    const tmp = `${this._dataFile}.tmp`;

    try {
      await fs.promises.mkdir(this._dataDir, { recursive: true });
      const data = {
        _version: this.version,
        _updated: new Date().toISOString(),
        notas:    Array.from(this.notas.values())
      };
      await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fs.promises.rename(tmp, this._dataFile);
    } catch (err) {
      this.logger.error('notas.persistencia.error_escritura', {
        error_message: err.message,
        stack:         err.stack,
        path:          this._dataFile
      });
      this.metrics?.increment(`${this.name}.persistir.errors`, 1, { kind: 'infrastructure' });
    }
  }
}

module.exports = NotasModule;
