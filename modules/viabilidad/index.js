/**
 * Viabilidad v2.0.0 — POC2 canonico.
 *
 * Estudio de viabilidad de negocio: punto de equilibrio, escenarios,
 * proyecciones y analisis de rentabilidad. Lee datos de recetas y escandallo
 * por proyecto (cache invalidado por receta.{creada,actualizada,eliminada}).
 *
 * Tools:
 *   viabilidad.estudio             — Estudio completo (3 escenarios + analisis recetas)
 *   viabilidad.punto_equilibrio    — Break-even analysis
 *   viabilidad.escenario           — Calcula y persiste un escenario
 *   viabilidad.comparar_escenarios — Compara N escenarios lado a lado
 *   viabilidad.proyeccion          — Proyeccion financiera a N meses + ROI
 *   viabilidad.guardar_config      — Persiste config del negocio
 */

'use strict';

const path = require('path');
const BaseModule = require('../_shared/base-module');
const fs = require('fs').promises;

const DEFAULT_DIAS_OPERACION = 25;
const DEFAULT_COMENSALES_DIA = 50;
const DEFAULT_TICKET_MEDIO = 15;
const DEFAULT_FOOD_COST_PCT = 33;
const FOOD_COST_ALTO_PCT = 35;

class ViabilidadModule extends BaseModule {
  constructor() {
    super();
    this.name = 'viabilidad';
    this.version = '2.0.0';
    this.configs = new Map();
    this.recetasCache = new Map();
    this.projectPaths = new Map();
    this.escenarios = new Map();
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.configs.clear();
    this.recetasCache.clear();
    this.projectPaths.clear();
    this.escenarios.clear();
    this.logger?.info?.('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (code === 'EACCES' || code === 'EPERM') return { status: 500, code: 'FILESYSTEM_ERROR' };
    if (/required|invalid|missing|requerido|necesitan/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('viabilidad.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    await this.eventBus.publish(name, enriched);
    return enriched;
  }

  async _atomicWriteFile(targetPath, data) {
    const tmp = `${targetPath}.tmp`;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(tmp, data);
    try {
      await fs.rename(tmp, targetPath);
    } catch (err) {
      try { await fs.unlink(tmp); } catch (_) { /* ignore */ }
      throw err;
    }
  }

  async _readJsonSafe(filePath, defaultValue = null) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') return defaultValue;
      this.logger?.warn?.('viabilidad.read_json.error', {
        file: filePath,
        error_code: err.code || 'PARSE_ERROR',
        error_message: err.message
      });
      return defaultValue;
    }
  }

  // ==========================================
  // Project resolution + cache loaders
  // ==========================================

  resolveToActiveProject(projectId) {
    if (projectId && this.projectPaths.has(projectId)) return projectId;
    for (const [pid] of this.projectPaths) return pid;
    return projectId;
  }

  async loadRecetasData(projectId) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) return { recetas: [], ingredientes: [] };

    const dir = path.join(paths.storagePath, 'recetas');
    const recetas = await this._readJsonSafe(path.join(dir, 'recetas.json'), []);
    const ingredientes = await this._readJsonSafe(path.join(dir, 'ingredientes.json'), []);

    const data = { recetas, ingredientes };
    this.recetasCache.set(projectId, data);
    return data;
  }

  async getRecetas(projectId) {
    if (this.recetasCache.has(projectId)) return this.recetasCache.get(projectId);
    return await this.loadRecetasData(projectId);
  }

  async loadConfig(projectId) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) return null;
    const filePath = path.join(paths.storagePath, 'viabilidad', 'config.json');
    const config = await this._readJsonSafe(filePath, null);
    if (config) this.configs.set(projectId, config);
    return config;
  }

  async saveConfig(projectId, config) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) return;
    const filePath = path.join(paths.storagePath, 'viabilidad', 'config.json');
    await this._atomicWriteFile(filePath, JSON.stringify(config, null, 2));
    this.configs.set(projectId, config);
  }

  async saveEstudio(projectId, estudio) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) return;
    const filename = `estudio_${Date.now().toString(36)}.json`;
    const filePath = path.join(paths.storagePath, 'viabilidad', filename);
    await this._atomicWriteFile(filePath, JSON.stringify(estudio, null, 2));
  }

  async loadEscenarios(projectId) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) return [];
    const filePath = path.join(paths.storagePath, 'viabilidad', 'escenarios.json');
    const escenarios = await this._readJsonSafe(filePath, []);
    this.escenarios.set(projectId, escenarios);
    return escenarios;
  }

  async saveEscenarios(projectId) {
    const paths = this.projectPaths.get(projectId);
    if (!paths) return;
    const lista = this.escenarios.get(projectId) || [];
    const filePath = path.join(paths.storagePath, 'viabilidad', 'escenarios.json');
    await this._atomicWriteFile(filePath, JSON.stringify(lista, null, 2));
  }

  // ==========================================
  // Bus subscribers
  // ==========================================

  async onProjectActivated(event) {
    try {
      const data = event?.data || event;
      const { project_id, base_path, metadata } = data || {};
      const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
      if (resolvedBase) {
        this.projectPaths.set(project_id, {
          storagePath: path.join(resolvedBase, 'storage')
        });
      }
      await this.loadRecetasData(project_id);
      await this.loadConfig(project_id);
      await this.loadEscenarios(project_id);
      this.logger.info('viabilidad.project.activated', { project_id });
    } catch (err) {
      this._handleHandlerError('viabilidad.project_activated.error', err, 'subscribe');
    }
  }

  async onProjectDeactivated() {}

  async onRecetaChanged(event) {
    const data = event?.data || event;
    if (data?.proyecto_id) this.recetasCache.delete(data.proyecto_id);
    if (data?.project_id) this.recetasCache.delete(data.project_id);
  }

  async onEscandalloCalculado() {
    // hook para futuras auto-actualizaciones de estudios
  }

  // ==========================================
  // Helpers internos
  // ==========================================

  round(n, decimals = 2) {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }

  getConfig(projectId) {
    return this.configs.get(projectId) || {};
  }

  calcularFoodCostMedio(recetas) {
    if (!recetas || recetas.length === 0) return DEFAULT_FOOD_COST_PCT;
    return recetas.reduce((s, r) => s + (r.coste_porcion || 0), 0) / recetas.length;
  }

  calcularEscenario(params) {
    const {
      nombre, gastos_fijos_mensuales, comensales_dia,
      ticket_medio, food_cost_porcentaje,
      dias_operacion_mes = DEFAULT_DIAS_OPERACION
    } = params;

    const ingresos_dia = comensales_dia * ticket_medio;
    const ingresos_mes = ingresos_dia * dias_operacion_mes;
    const coste_materia_prima_mes = ingresos_mes * (food_cost_porcentaje / 100);
    const gastos_totales_mes = gastos_fijos_mensuales + coste_materia_prima_mes;
    const beneficio_mes = ingresos_mes - gastos_totales_mes;
    const beneficio_dia = beneficio_mes / dias_operacion_mes;

    const margen_contribucion_por_comensal = ticket_medio * (1 - food_cost_porcentaje / 100);
    const comensales_break_even_mes = margen_contribucion_por_comensal > 0
      ? Math.ceil(gastos_fijos_mensuales / margen_contribucion_por_comensal)
      : Infinity;
    const comensales_break_even_dia = Math.ceil(comensales_break_even_mes / dias_operacion_mes);

    return {
      nombre: nombre || 'Sin nombre',
      parametros: {
        gastos_fijos_mensuales, comensales_dia, ticket_medio,
        food_cost_porcentaje, dias_operacion_mes
      },
      ingresos: {
        dia: this.round(ingresos_dia),
        mes: this.round(ingresos_mes),
        anual: this.round(ingresos_mes * 12)
      },
      gastos: {
        fijos_mes: gastos_fijos_mensuales,
        materia_prima_mes: this.round(coste_materia_prima_mes),
        total_mes: this.round(gastos_totales_mes)
      },
      beneficio: {
        dia: this.round(beneficio_dia),
        mes: this.round(beneficio_mes),
        anual: this.round(beneficio_mes * 12),
        es_rentable: beneficio_mes > 0
      },
      punto_equilibrio: {
        comensales_dia: comensales_break_even_dia,
        comensales_mes: comensales_break_even_mes,
        margen_sobre_equilibrio: comensales_dia - comensales_break_even_dia,
        porcentaje_ocupacion_necesaria: this.round((comensales_break_even_dia / comensales_dia) * 100)
      }
    };
  }

  // ==========================================
  // UI Handlers (canonical shape)
  // ==========================================

  async handleEstudio(data) {
    try {
      const project_id = this.resolveToActiveProject(data?.project_id);
      return await this.toolEstudio({ ...data, project_id });
    } catch (err) {
      return this._handleHandlerError('viabilidad.ui.estudio.error', err);
    }
  }

  async handleEscenario(data) {
    try {
      const project_id = this.resolveToActiveProject(data?.project_id);
      return await this.toolEscenario({ ...data, project_id });
    } catch (err) {
      return this._handleHandlerError('viabilidad.ui.escenario.error', err);
    }
  }

  async handleConfig(data) {
    try {
      const project_id = this.resolveToActiveProject(data?.project_id);
      if (data?.action === 'get') {
        return { status: 200, data: this.getConfig(project_id) };
      }
      return await this.toolGuardarConfig({ ...data, project_id });
    } catch (err) {
      return this._handleHandlerError('viabilidad.ui.config.error', err);
    }
  }

  async handleHealth() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        proyectos_cargados: this.projectPaths.size
      }
    };
  }

  // ==========================================
  // Tools
  // ==========================================

  async toolEstudio(params) {
    try {
      const {
        nombre_negocio, tipo_negocio, gastos_fijos_mensuales,
        dias_operacion_mes, comensales_dia_estimados,
        ticket_medio, precios_venta, project_id, correlation_id
      } = params || {};

      if (!gastos_fijos_mensuales) {
        this.metrics?.increment?.('viabilidad.errors', { code: 'INVALID_INPUT', kind: 'estudio' });
        this.logger.warn('viabilidad.estudio.missing', { field: 'gastos_fijos_mensuales' });
        return this._errorResponse(400, 'INVALID_INPUT',
          'Se requiere gastos_fijos_mensuales',
          { field: 'gastos_fijos_mensuales' });
      }
      if (!project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id', { field: 'project_id' });
      }

      const config = this.getConfig(project_id);
      const { recetas } = await this.getRecetas(project_id);

      const gf = gastos_fijos_mensuales || config.gastos_fijos_mensuales || 0;
      const dias = dias_operacion_mes || config.dias_operacion_mes || DEFAULT_DIAS_OPERACION;
      const comensales = comensales_dia_estimados || config.comensales_dia_estimados || DEFAULT_COMENSALES_DIA;

      let foodCostPct = DEFAULT_FOOD_COST_PCT;
      let ticketMedio = ticket_medio || config.ticket_medio;

      if (recetas.length > 0) {
        const costeMedio = this.calcularFoodCostMedio(recetas);
        if (ticketMedio) {
          foodCostPct = this.round((costeMedio / ticketMedio) * 100);
        } else {
          ticketMedio = this.round(costeMedio * 3);
          foodCostPct = DEFAULT_FOOD_COST_PCT;
        }
      } else if (!ticketMedio) {
        ticketMedio = DEFAULT_TICKET_MEDIO;
      }

      const escenarioPrincipal = this.calcularEscenario({
        nombre: 'Principal',
        gastos_fijos_mensuales: gf, comensales_dia: comensales,
        ticket_medio: ticketMedio, food_cost_porcentaje: foodCostPct,
        dias_operacion_mes: dias
      });

      const escenarioConservador = this.calcularEscenario({
        nombre: 'Conservador (-20% comensales)',
        gastos_fijos_mensuales: gf,
        comensales_dia: Math.floor(comensales * 0.8),
        ticket_medio: ticketMedio, food_cost_porcentaje: foodCostPct,
        dias_operacion_mes: dias
      });

      const escenarioOptimista = this.calcularEscenario({
        nombre: 'Optimista (+30% comensales)',
        gastos_fijos_mensuales: gf,
        comensales_dia: Math.ceil(comensales * 1.3),
        ticket_medio: ticketMedio, food_cost_porcentaje: foodCostPct,
        dias_operacion_mes: dias
      });

      let analisisRecetas = null;
      if (recetas.length > 0) {
        const preciosMap = precios_venta || {};
        analisisRecetas = recetas.map(r => {
          const pv = preciosMap[r.id] || this.round((r.coste_porcion || 0) * 3);
          const margen = pv - (r.coste_porcion || 0);
          return {
            nombre: r.nombre,
            coste_porcion: r.coste_porcion || 0,
            precio_venta_sugerido: pv,
            margen: this.round(margen),
            food_cost: pv > 0 ? this.round(((r.coste_porcion || 0) / pv) * 100) : 0
          };
        });
      }

      const estudio = {
        negocio: {
          nombre: nombre_negocio || config.nombre_negocio || 'Nuevo negocio',
          tipo: tipo_negocio || config.tipo_negocio || 'No especificado'
        },
        fecha: new Date().toISOString(),
        recetas_analizadas: recetas.length,
        food_cost_medio: foodCostPct,
        ticket_medio: ticketMedio,
        escenarios: {
          principal: escenarioPrincipal,
          conservador: escenarioConservador,
          optimista: escenarioOptimista
        },
        recetas: analisisRecetas,
        conclusiones: []
      };

      const ep = escenarioPrincipal;
      if (ep.beneficio.es_rentable) {
        estudio.conclusiones.push(`El negocio es rentable con ${comensales} comensales/dia: beneficio estimado ${ep.beneficio.mes}€/mes.`);
      } else {
        estudio.conclusiones.push(`El negocio NO es rentable con ${comensales} comensales/dia. Perdida estimada: ${Math.abs(ep.beneficio.mes)}€/mes.`);
      }
      estudio.conclusiones.push(`Punto de equilibrio: ${ep.punto_equilibrio.comensales_dia} comensales/dia (${ep.punto_equilibrio.porcentaje_ocupacion_necesaria}% de ocupacion).`);

      if (escenarioConservador.beneficio.es_rentable) {
        estudio.conclusiones.push(`Incluso en escenario conservador (-20%), el negocio seria rentable.`);
      } else {
        estudio.conclusiones.push(`En escenario conservador (-20%), el negocio entraria en perdidas. Margen de seguridad bajo.`);
      }

      if (foodCostPct > FOOD_COST_ALTO_PCT) {
        estudio.conclusiones.push(`Food cost alto (${foodCostPct}%). Conviene optimizar costes o subir precios. Objetivo: < ${DEFAULT_FOOD_COST_PCT}%.`);
      }

      await this.saveEstudio(project_id, estudio);
      await this._publicarEvento('viabilidad.estudio.generado', estudio, { correlation_id, project_id });
      this.metrics?.increment?.('viabilidad.estudio.generated');

      return { status: 200, data: estudio };
    } catch (err) {
      return this._handleHandlerError('viabilidad.estudio.error', err);
    }
  }

  async toolPuntoEquilibrio(params) {
    try {
      const {
        gastos_fijos_mensuales, ticket_medio, food_cost_porcentaje,
        dias_operacion_mes, project_id
      } = params || {};

      if (!gastos_fijos_mensuales) {
        this.metrics?.increment?.('viabilidad.errors', { code: 'INVALID_INPUT', kind: 'punto_equilibrio' });
        return this._errorResponse(400, 'INVALID_INPUT',
          'Se requiere gastos_fijos_mensuales',
          { field: 'gastos_fijos_mensuales' });
      }
      if (!project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id', { field: 'project_id' });
      }

      const config = this.getConfig(project_id);
      const { recetas } = await this.getRecetas(project_id);

      const gf = gastos_fijos_mensuales;
      const dias = dias_operacion_mes || config.dias_operacion_mes || DEFAULT_DIAS_OPERACION;
      let tm = ticket_medio || config.ticket_medio;
      let fc = food_cost_porcentaje;

      if (recetas.length > 0 && (!tm || !fc)) {
        const costeMedio = this.calcularFoodCostMedio(recetas);
        if (!tm) tm = this.round(costeMedio * 3);
        if (!fc) fc = tm > 0 ? this.round((costeMedio / tm) * 100) : DEFAULT_FOOD_COST_PCT;
      }
      if (!tm) tm = DEFAULT_TICKET_MEDIO;
      if (!fc) fc = DEFAULT_FOOD_COST_PCT;

      const margen_por_comensal = tm * (1 - fc / 100);
      const comensales_mes = margen_por_comensal > 0 ? Math.ceil(gf / margen_por_comensal) : Infinity;
      const comensales_dia = Math.ceil(comensales_mes / dias);
      const facturacion_necesaria_mes = comensales_mes * tm;

      const escenarios = [20, 30, 40, 50, 60, 80, 100].map(n => {
        const ingresos = n * tm * dias;
        const costeMP = ingresos * (fc / 100);
        const beneficio = ingresos - gf - costeMP;
        return {
          comensales_dia: n,
          ingresos_mes: this.round(ingresos),
          beneficio_mes: this.round(beneficio),
          rentable: beneficio > 0
        };
      });

      this.metrics?.increment?.('viabilidad.punto_equilibrio.calculated');

      return {
        status: 200,
        data: {
          gastos_fijos_mensuales: gf,
          ticket_medio: tm,
          food_cost_porcentaje: fc,
          margen_contribucion_por_comensal: this.round(margen_por_comensal),
          punto_equilibrio: {
            comensales_dia,
            comensales_mes,
            facturacion_necesaria_mes: this.round(facturacion_necesaria_mes),
            facturacion_necesaria_dia: this.round(facturacion_necesaria_mes / dias)
          },
          tabla_escenarios: escenarios,
          message: `Necesitas ${comensales_dia} comensales/dia (${comensales_mes}/mes) para cubrir los ${gf}€ de gastos fijos.`
        }
      };
    } catch (err) {
      return this._handleHandlerError('viabilidad.punto_equilibrio.error', err);
    }
  }

  async toolEscenario(params) {
    try {
      const {
        nombre, gastos_fijos_mensuales, comensales_dia, ticket_medio,
        food_cost_porcentaje, dias_operacion_mes, project_id, correlation_id
      } = params || {};

      if (!nombre) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere nombre', { field: 'nombre' });
      }
      if (!gastos_fijos_mensuales) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'Se requiere gastos_fijos_mensuales',
          { field: 'gastos_fijos_mensuales' });
      }
      if (!project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id', { field: 'project_id' });
      }

      const { recetas } = await this.getRecetas(project_id);
      let fc = food_cost_porcentaje;
      if (!fc && recetas.length > 0) {
        const costeMedio = this.calcularFoodCostMedio(recetas);
        fc = ticket_medio > 0 ? this.round((costeMedio / ticket_medio) * 100) : DEFAULT_FOOD_COST_PCT;
      }
      if (!fc) fc = DEFAULT_FOOD_COST_PCT;

      const result = this.calcularEscenario({
        nombre, gastos_fijos_mensuales, comensales_dia, ticket_medio,
        food_cost_porcentaje: fc,
        dias_operacion_mes: dias_operacion_mes || DEFAULT_DIAS_OPERACION
      });

      if (!this.escenarios.has(project_id)) this.escenarios.set(project_id, []);
      const lista = this.escenarios.get(project_id);
      const idx = lista.findIndex(e => e.nombre === nombre);
      if (idx >= 0) lista[idx] = result;
      else lista.push(result);
      await this.saveEscenarios(project_id);

      await this._publicarEvento('viabilidad.escenario.calculado', result, { correlation_id, project_id });
      this.metrics?.increment?.('viabilidad.escenario.calculated');

      return { status: 200, data: result };
    } catch (err) {
      return this._handleHandlerError('viabilidad.escenario.error', err);
    }
  }

  async toolCompararEscenarios(params) {
    try {
      const { escenarios, project_id } = params || {};
      if (!escenarios || escenarios.length < 2) {
        this.metrics?.increment?.('viabilidad.errors', { code: 'INVALID_INPUT', kind: 'comparar_escenarios' });
        return this._errorResponse(400, 'INVALID_INPUT',
          'Se necesitan al menos 2 escenarios para comparar',
          { field: 'escenarios', min_length: 2 });
      }
      if (!project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id', { field: 'project_id' });
      }

      const { recetas } = await this.getRecetas(project_id);

      const resultados = escenarios.map(e => {
        let fc = e.food_cost_porcentaje;
        if (!fc && recetas.length > 0) {
          const costeMedio = this.calcularFoodCostMedio(recetas);
          fc = e.ticket_medio > 0 ? this.round((costeMedio / e.ticket_medio) * 100) : DEFAULT_FOOD_COST_PCT;
        }
        if (!fc) fc = DEFAULT_FOOD_COST_PCT;

        return this.calcularEscenario({
          ...e, food_cost_porcentaje: fc,
          dias_operacion_mes: e.dias_operacion_mes || DEFAULT_DIAS_OPERACION
        });
      });

      const mejor = resultados.reduce((best, r) => r.beneficio.mes > best.beneficio.mes ? r : best);
      const peor = resultados.reduce((worst, r) => r.beneficio.mes < worst.beneficio.mes ? r : worst);

      return {
        status: 200,
        data: {
          escenarios: resultados,
          comparativa: {
            mejor_escenario: mejor.nombre,
            mejor_beneficio_mes: mejor.beneficio.mes,
            peor_escenario: peor.nombre,
            peor_beneficio_mes: peor.beneficio.mes,
            diferencia: this.round(mejor.beneficio.mes - peor.beneficio.mes)
          }
        }
      };
    } catch (err) {
      return this._handleHandlerError('viabilidad.comparar_escenarios.error', err);
    }
  }

  async toolProyeccion(params) {
    try {
      const {
        meses, gastos_fijos_mensuales, comensales_dia_inicial,
        comensales_dia_objetivo, ticket_medio, food_cost_porcentaje,
        dias_operacion_mes, inversion_inicial, project_id
      } = params || {};

      if (!gastos_fijos_mensuales) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'Se requiere gastos_fijos_mensuales',
          { field: 'gastos_fijos_mensuales' });
      }
      if (!comensales_dia_inicial) {
        return this._errorResponse(400, 'INVALID_INPUT',
          'Se requiere comensales_dia_inicial',
          { field: 'comensales_dia_inicial' });
      }
      if (!ticket_medio) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere ticket_medio', { field: 'ticket_medio' });
      }
      if (!project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id', { field: 'project_id' });
      }

      const config = this.getConfig(project_id);
      const { recetas } = await this.getRecetas(project_id);

      const totalMeses = meses || 12;
      const dias = dias_operacion_mes || config.dias_operacion_mes || DEFAULT_DIAS_OPERACION;
      const objetivo = comensales_dia_objetivo || comensales_dia_inicial;
      const inversion = inversion_inicial || config.inversion_inicial || 0;

      let fc = food_cost_porcentaje;
      if (!fc && recetas.length > 0) {
        const costeMedio = this.calcularFoodCostMedio(recetas);
        fc = ticket_medio > 0 ? this.round((costeMedio / ticket_medio) * 100) : DEFAULT_FOOD_COST_PCT;
      }
      if (!fc) fc = DEFAULT_FOOD_COST_PCT;

      const proyeccion = [];
      let acumulado = -inversion;

      for (let mes = 1; mes <= totalMeses; mes++) {
        const progreso = totalMeses > 1 ? (mes - 1) / (totalMeses - 1) : 1;
        const comensalesDia = Math.round(comensales_dia_inicial + (objetivo - comensales_dia_inicial) * progreso);

        const ingresos = comensalesDia * ticket_medio * dias;
        const costeMP = ingresos * (fc / 100);
        const gastosTotales = gastos_fijos_mensuales + costeMP;
        const beneficio = ingresos - gastosTotales;
        acumulado += beneficio;

        proyeccion.push({
          mes,
          comensales_dia: comensalesDia,
          ingresos: this.round(ingresos),
          gastos_fijos: gastos_fijos_mensuales,
          materia_prima: this.round(costeMP),
          gastos_totales: this.round(gastosTotales),
          beneficio: this.round(beneficio),
          acumulado: this.round(acumulado),
          rentable: beneficio > 0
        });
      }

      const primerMesRentable = proyeccion.find(p => p.rentable);
      const mesRecuperacion = inversion > 0 ? proyeccion.find(p => p.acumulado >= 0) : null;

      const resultado = {
        parametros: {
          meses: totalMeses, gastos_fijos_mensuales,
          comensales_dia_inicial, comensales_dia_objetivo: objetivo,
          ticket_medio, food_cost_porcentaje: fc,
          dias_operacion_mes: dias, inversion_inicial: inversion
        },
        proyeccion,
        resumen: {
          beneficio_total_periodo: this.round(proyeccion.reduce((s, p) => s + p.beneficio, 0)),
          beneficio_medio_mensual: this.round(proyeccion.reduce((s, p) => s + p.beneficio, 0) / totalMeses),
          ingresos_total_periodo: this.round(proyeccion.reduce((s, p) => s + p.ingresos, 0)),
          primer_mes_rentable: primerMesRentable ? primerMesRentable.mes : null,
          mes_recuperacion_inversion: mesRecuperacion ? mesRecuperacion.mes : null,
          acumulado_final: this.round(acumulado)
        }
      };

      if (inversion > 0 && mesRecuperacion) {
        resultado.resumen.roi = this.round(((acumulado / inversion) * 100));
        resultado.resumen.roi_mensaje = `ROI: ${resultado.resumen.roi}% en ${totalMeses} meses. Inversion recuperada en mes ${mesRecuperacion.mes}.`;
      } else if (inversion > 0) {
        resultado.resumen.roi_mensaje = `La inversion de ${inversion}€ NO se recupera en ${totalMeses} meses. Acumulado: ${this.round(acumulado)}€.`;
      }

      this.metrics?.increment?.('viabilidad.proyeccion.generated');
      return { status: 200, data: resultado };
    } catch (err) {
      return this._handleHandlerError('viabilidad.proyeccion.error', err);
    }
  }

  async toolGuardarConfig(params) {
    try {
      const { project_id, ...configData } = params || {};
      if (!project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Se requiere project_id', { field: 'project_id' });
      }

      const existing = this.getConfig(project_id);
      const newConfig = { ...existing, ...configData, updated_at: new Date().toISOString() };

      for (const key of Object.keys(newConfig)) {
        if (newConfig[key] === undefined) delete newConfig[key];
      }

      await this.saveConfig(project_id, newConfig);

      return {
        status: 200,
        data: {
          config: newConfig,
          message: 'Configuracion del negocio guardada. Se usara como valores por defecto en los calculos.'
        }
      };
    } catch (err) {
      return this._handleHandlerError('viabilidad.guardar_config.error', err);
    }
  }
}

module.exports = ViabilidadModule;
