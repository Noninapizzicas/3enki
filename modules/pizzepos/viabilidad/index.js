/**
 * viabilidad — REFLEJO JS (mitad determinista del módulo híbrido). Evaluador
 * económico previo del subsistema-recetario: combina el coste (delegado a
 * escandallo) + PVP objetivo y emite un veredicto canónico por reglas de food
 * cost. Persiste un expediente por evaluación (audit trail) en viabilidad.json.
 *
 * Las 4 ops son DETERMINISTAS (aritmética + CRUD de expedientes) → reflejo JS de
 * milisegundos, mismo contrato de bus (viabilidad.<op>.request). Antes las
 * ejecutaba un turno LLM (blueprint puro): listar/obtener/descartar costaban un
 * turno completo, y evaluar otro encadenando escandallo.
 *
 * Cadena reflejo→reflejo: evaluar delega el coste a escandallo.costear (el reflejo
 * determinista, JS↔JS ms) y normaliza su modelo canónico (coste_unidad/lineas/rinde)
 * al vocabulario de viabilidad (coste_porcion/ingredientes/porciones). NO usa
 * escandallo.calcular (el cajón fuzzy de Mercadona, turno LLM) — el coste sale del
 * catálogo cacheado, orientativo, que es lo que pide una comprobación de viabilidad.
 *
 * Los `caminos` (la brújula del comerciante: 0-3 tarjetas {titulo, prompt} que
 * prefillan el chat) se generan por REGLA desde el veredicto/advertencias — el
 * blueprint los describe como "stubs ligeros, NO análisis pesado". La riqueza
 * cualitativa sigue en el chat cuando el comerciante toca la tarjeta.
 *
 * Norma del reflejo: cada op devuelve un objeto FRESCO { status, data }.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const STORE_PATH = '/pizzepos/viabilidad.json';
const nowISO = () => new Date().toISOString();

class ViabilidadReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'viabilidad';
    this.version = 'reflejo-1.0.0';
  }

  // ── handlers RPC (una línea) ──
  onEvaluarRequest(e) { return this._atender(e, 'evaluar', 'viabilidad.evaluar.response', d => this._evaluar(d)); }
  onObtenerRequest(e) { return this._atender(e, 'obtener', 'viabilidad.obtener.response', d => this._obtener(d)); }
  onListarRequest(e) { return this._atender(e, 'listar', 'viabilidad.listar.response', d => this._listar(d)); }
  onDescartarRequest(e) { return this._atender(e, 'descartar', 'viabilidad.descartar.response', d => this._descartar(d)); }

  // =============================================================
  // fs helpers — contrato REAL (éxito={content}/{...} ; error={error}). Normaliza.
  // =============================================================
  async _readRaw(project_id, path) {
    const r = await this._rpc('fs.read.request', { project_id, path });
    if (!r) return { status: 503 };
    if (r.error) return { status: r.error.code === 'RESOURCE_NOT_FOUND' ? 404 : 502, error: r.error };
    if (typeof r.content === 'string') return { status: 200, content: r.content };
    return { status: 404 };
  }
  async _writeRaw(project_id, path, content) {
    const r = await this._rpc('fs.write.request', { project_id, path, content, encoding: 'utf-8', atomic: true });
    if (!r) return { status: 503 };
    if (r.error) return { status: 502, error: r.error };
    return { status: 200 };
  }
  async _editRaw(project_id, path, patches) {
    const r = await this._rpc('fs.edit.request', { project_id, path, patches });
    if (!r) return { status: 503 };
    if (r.error) return { status: r.error.code === 'RESOURCE_NOT_FOUND' ? 404 : (r.error.code === 'CONFLICT_STATE' ? 409 : 502), error: r.error };
    return { status: 200 };
  }

  // =============================================================
  // ops
  // =============================================================

  async _evaluar(input) {
    // 1. Validación mínima.
    if (!input.project_id) return this._invalid('project_id');
    if (!input.receta_id && (!Array.isArray(input.ingredientes) || !input.porciones || !input.nombre)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'pasar receta_id O { nombre, ingredientes, porciones }', { hint: 'receta_id | {nombre, ingredientes, porciones}' });
    }
    if (input.pvp_objetivo !== undefined && input.pvp_objetivo <= 0) {
      return this._invalid('pvp_objetivo');
    }
    const foodCostObj = (input.food_cost_objetivo_pct >= 1 && input.food_cost_objetivo_pct < 100) ? input.food_cost_objetivo_pct : 30;

    // 2. Coste vía escandallo.costear (REFLEJO determinista, JS↔JS). Normaliza su modelo.
    const escInput = input.receta_id
      ? { project_id: input.project_id, receta_id: input.receta_id, correlation_id: input.correlation_id }
      : { project_id: input.project_id, lineas: input.ingredientes, rinde: { cantidad: input.porciones, unidad: 'ud' }, correlation_id: input.correlation_id };
    const escResp = await this._rpc('escandallo.costear.request', escInput, { timeout_ms: 20000 });
    if (!escResp) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'escandallo no responde');
    if (escResp.status >= 400) return { status: escResp.status, data: escResp.data, error: escResp.error };
    const e = escResp.data || {};
    const calculo = {
      coste_total: e.coste_total,
      coste_porcion: e.coste_unidad,
      porciones: (e.rinde && e.rinde.cantidad) || input.porciones || 1,
      ingredientes_detalle: e.lineas_detalle || [],
      ingredientes_sin_precio: e.lineas_sin_precio || [],
      postcode_usado: null   // costear usa catálogo cacheado, no Mercadona
    };

    // 2b. Resolver nombre_idea (recetas es la fuente canónica; NO inventar).
    let nombreIdea = input.nombre;
    if (!nombreIdea && input.receta_id) {
      const recResp = await this._rpc('recetas.obtener.request', { project_id: input.project_id, receta_id: input.receta_id, correlation_id: input.correlation_id }, { timeout_ms: 15000 });
      if (!recResp) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'recetas no responde');
      if (recResp.status >= 400) return { status: recResp.status, data: recResp.data, error: recResp.error };
      nombreIdea = (recResp.data?.receta?.nombre) || recResp.data?.nombre || input.receta_id;
    }

    // 3. pvp_efectivo + food_cost_pct.
    const pvpSugerido = calculo.coste_porcion > 0 ? this._round(calculo.coste_porcion / (foodCostObj / 100), 2) : null;
    let pvpEfectivo, foodCostPct;
    if (input.pvp_objetivo) {
      pvpEfectivo = input.pvp_objetivo;
      foodCostPct = this._round((calculo.coste_porcion / pvpEfectivo) * 100, 1);
    } else {
      pvpEfectivo = pvpSugerido;
      foodCostPct = foodCostObj;
    }
    const margenPorcion = pvpEfectivo != null ? this._round(pvpEfectivo - calculo.coste_porcion, 2) : null;

    // 4. Veredicto canónico + advertencias.
    const advertencias = [];
    if (calculo.ingredientes_sin_precio.length > 0) {
      advertencias.push('ingredientes_sin_precio: ' + calculo.ingredientes_sin_precio.join(', '));
    }
    let veredicto;
    if (!input.pvp_objetivo) {
      veredicto = 'sin_pvp_objetivo';
      advertencias.push('veredicto_orientativo: se uso pvp_sugerido al ' + foodCostObj + '% food cost');
    } else if (foodCostPct < 25) {
      veredicto = 'viable';
    } else if (foodCostPct < 35) {
      veredicto = 'viable_con_advertencias';
    } else if (foodCostPct < 45) {
      veredicto = 'viable_con_advertencias';
      advertencias.push('alerta_margen_critico: food cost ' + foodCostPct + '% por encima de 35%');
    } else {
      veredicto = 'no_viable_economicamente';
    }

    // 4b. Caminos (brújula del comerciante) — por regla, "stubs ligeros".
    const caminos = this._caminos({ veredicto, foodCostPct, advertencias, nombreIdea, costePorcion: calculo.coste_porcion, pvpEfectivo, ingredientesSinPrecio: calculo.ingredientes_sin_precio });

    // 5. Expediente.
    const expediente = {
      id: crypto.randomUUID(),
      fecha_evaluacion: nowISO(),
      estado: 'activo',
      motivo_descarte: null,
      fecha_descarte: null,
      input: {
        receta_id: input.receta_id || null,
        nombre: nombreIdea,
        porciones: calculo.porciones,
        ingredientes: input.receta_id ? calculo.ingredientes_detalle : (input.ingredientes || []),
        pvp_objetivo: input.pvp_objetivo || null
      },
      calculo,
      pvp_efectivo: pvpEfectivo,
      pvp_sugerido: pvpSugerido,
      food_cost_pct: foodCostPct,
      margen_porcion: margenPorcion,
      veredicto,
      advertencias,
      caminos
    };

    // 6. Persistir (dual-branch: write inicial si 404, edit append si existe).
    const now = nowISO();
    const raw = await this._readRaw(input.project_id, STORE_PATH);
    if (raw.status === 404) {
      const w = await this._writeRaw(input.project_id, STORE_PATH, JSON.stringify({ _version: '1.0', _updated_at: now, expedientes: [expediente] }, null, 2));
      if (w.status >= 400) return w;
    } else if (raw.status >= 400) {
      return raw;
    } else {
      const ed = await this._editRaw(input.project_id, STORE_PATH, [
        { op: 'add', path: '/expedientes/-', value: expediente },
        { op: 'replace', path: '/_updated_at', value: now }
      ]);
      if (ed.status >= 400) return ed;
    }

    // 7. Evento de dominio canónico (shape oficial, additionalProperties:false).
    this.eventBus.publish('viabilidad.evaluacion.completada', {
      correlation_id: input.correlation_id || crypto.randomUUID(),
      project_id: input.project_id,
      user_id: input.user_id || null,
      expediente_id: expediente.id,
      nombre_idea: expediente.input.nombre,
      veredicto,
      coste_total: calculo.coste_total,
      coste_por_porcion: calculo.coste_porcion,
      coste_es_real: calculo.ingredientes_sin_precio.length === 0,
      food_cost_pct: input.pvp_objetivo ? foodCostPct : null,
      precio_venta_objetivo: input.pvp_objetivo || null,
      ingredientes_sin_precio: calculo.ingredientes_sin_precio,
      advertencias,
      timestamp: now
    });
    return { status: 201, data: expediente };
  }

  // Caminos deterministas (0-3). Palancas mapeadas del veredicto/advertencias.
  _caminos({ veredicto, foodCostPct, advertencias, nombreIdea, costePorcion, pvpEfectivo, ingredientesSinPrecio }) {
    const out = [];
    const ctx = `Para "${nombreIdea}" (coste/porción ${costePorcion}€` + (pvpEfectivo != null ? `, PVP ${pvpEfectivo}€)` : ')');
    if (ingredientesSinPrecio.length > 0) {
      out.push({ titulo: 'Completar precios', prompt: `${ctx}: faltan precios de ${ingredientesSinPrecio.join(', ')}. Ayúdame a completarlos y reafinar el veredicto.` });
    }
    if (veredicto === 'sin_pvp_objetivo') {
      out.push({ titulo: 'Fijar un PVP', prompt: `${ctx}: dame un PVP firme y dime el veredicto económico con ese precio.` });
    } else if (veredicto === 'no_viable_economicamente') {
      out.push({ titulo: 'Replantear el producto', prompt: `${ctx}: el food cost (${foodCostPct}%) lo hace inviable. Replanteemos formato, porción o ingredientes para que salga rentable.` });
    } else if (advertencias.some(a => a.startsWith('alerta_margen_critico')) || (typeof foodCostPct === 'number' && foodCostPct >= 35)) {
      out.push({ titulo: 'Mejorar el margen', prompt: `${ctx}: el food cost (${foodCostPct}%) está apretado. ¿Subimos PVP o recortamos coste sin perder calidad?` });
    }
    return out.slice(0, 3);
  }

  async _obtener(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.expediente_id) return this._invalid('expediente_id');
    const raw = await this._readRaw(input.project_id, STORE_PATH);
    if (raw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'sin expedientes', { entity_type: 'expediente' });
    if (raw.status >= 400) return raw;
    let store; try { store = JSON.parse(raw.content); } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'viabilidad.json corrupto'); }
    const exp = (store.expedientes || []).find(x => x.id === input.expediente_id);
    if (!exp) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'expediente no existe', { entity_type: 'expediente', id: input.expediente_id });
    return { status: 200, data: exp };
  }

  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const raw = await this._readRaw(input.project_id, STORE_PATH);
    if (raw.status === 404) return { status: 200, data: [] };
    if (raw.status >= 400) return raw;
    let store; try { store = JSON.parse(raw.content); } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'viabilidad.json corrupto'); }
    const estado = input.estado || 'activo';
    let res = store.expedientes || [];
    if (estado !== 'todos') res = res.filter(x => x.estado === estado);
    if (input.veredicto) res = res.filter(x => x.veredicto === input.veredicto);
    if (input.receta_id) res = res.filter(x => x.input && x.input.receta_id === input.receta_id);
    res = res.slice().sort((a, b) => String(b.fecha_evaluacion || '').localeCompare(String(a.fecha_evaluacion || '')));
    return { status: 200, data: res };
  }

  async _descartar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.expediente_id) return this._invalid('expediente_id');
    const raw = await this._readRaw(input.project_id, STORE_PATH);
    if (raw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'sin expedientes', { entity_type: 'expediente' });
    if (raw.status >= 400) return raw;
    let store; try { store = JSON.parse(raw.content); } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'viabilidad.json corrupto'); }
    const idx = (store.expedientes || []).findIndex(x => x.id === input.expediente_id);
    if (idx < 0) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'expediente no existe', { entity_type: 'expediente', id: input.expediente_id });
    if (store.expedientes[idx].estado === 'descartado') return this._errorResponse(409, 'CONFLICT_STATE', 'expediente ya descartado', { id: input.expediente_id });

    const motivo = input.motivo || 'descartado por el usuario';
    const fecha = nowISO();
    const ed = await this._editRaw(input.project_id, STORE_PATH, [
      { op: 'test', path: `/expedientes/${idx}/id`, value: input.expediente_id },
      { op: 'replace', path: `/expedientes/${idx}/estado`, value: 'descartado' },
      { op: 'replace', path: `/expedientes/${idx}/motivo_descarte`, value: motivo },
      { op: 'replace', path: `/expedientes/${idx}/fecha_descarte`, value: fecha },
      { op: 'replace', path: '/_updated_at', value: fecha }
    ]);
    if (ed.status >= 400) return ed;

    const exp = store.expedientes[idx];
    exp.estado = 'descartado'; exp.motivo_descarte = motivo; exp.fecha_descarte = fecha;
    this.eventBus.publish('viabilidad.evaluacion.descartada', {
      correlation_id: input.correlation_id || crypto.randomUUID(),
      project_id: input.project_id,
      user_id: input.user_id || null,
      expediente_id: exp.id,
      nombre_idea: exp.input.nombre,
      motivo,
      veredicto_economico: exp.veredicto,
      timestamp: fecha
    });
    return { status: 200, data: exp };
  }
}

module.exports = ViabilidadReflejo;
