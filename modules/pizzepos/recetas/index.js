/**
 * recetas — REFLEJO JS (mitad determinista del módulo híbrido). Primer caso del
 * Patrón Módulo Híbrido. El blueprint sirve lo FUZZY (crear/investigar/editar via
 * LLM); este reflejo sirve las LECTURAS deterministas + el persist del coste, en
 * el bus, sin turno LLM. Réplica fiel de la proyección del blueprint.
 *
 * Extiende ModuloHibridoReflejo (la base con toda la fontanería): aquí solo van
 * los handlers de una línea + las proyecciones.
 */

'use strict';

const path = require('path');
const Ajv = require('ajv');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const STORE_PATH = '/pizzepos/recetas.json';
const SCHEMA_PATH = path.join(__dirname, 'receta.schema.json');

class RecetasReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'recetas';
    this.version = 'reflejo-1.3.0';
    this._validarReceta = null; // validador AJV compilado (lazy, cacheado)
  }

  // ── handlers RPC (una línea: delegan a _atender de la base) ──
  onListarRequest(e) { return this._atender(e, 'listar', 'recetas.listar.response', d => this._listar(d)); }
  onIngredientesRequest(e) { return this._atender(e, 'ingredientes', 'recetas.ingredientes.response', d => this._ingredientes(d)); }
  onObtenerRequest(e) { return this._atender(e, 'obtener', 'recetas.obtener.response', d => this._obtener(d)); }
  onCrearRequest(e) { return this._atender(e, 'crear', 'recetas.crear.response', d => this._crear(d)); }
  onValidarRequest(e) { return this._atender(e, 'validar', 'recetas.validar.response', d => this._validar(d)); }

  // ── proyecciones deterministas (réplica fiel del pseudocódigo) ──

  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const estado = input.estado || 'en_servicio';
    if (!['borrador', 'en_servicio', 'archivada'].includes(estado)) return this._invalid('estado');
    const limit = (typeof input.limit === 'number' && input.limit > 0) ? input.limit : 50;

    const store = await this._leerJson(input.project_id, STORE_PATH);
    if (store === null) return { status: 200, data: { total: 0, recetas: [] } };

    let items = (store.recetas || []).filter(r => r.estado_operativo === estado);
    if (input.solo_incompletas === true) items = items.filter(r => r.incompleta === true);

    return {
      status: 200,
      data: {
        total: items.length,
        recetas: items.slice(0, limit).map(r => ({
          receta_id: r.id, nombre: r.nombre, tipo: r.tipo, rinde: r.rinde,
          lineas_count: Array.isArray(r.lineas) ? r.lineas.length : 0,
          incompleta: r.incompleta, campos_pendientes: r.campos_pendientes,
          estado_operativo: r.estado_operativo, version: r.version, updated_at: r.updated_at,
          ...(input.incluir_lineas === true
            ? { lineas: Array.isArray(r.lineas) ? r.lineas : [], coste_unidad: r.coste_unidad }
            : {})
        }))
      }
    };
  }

  async _ingredientes(input) {
    if (!input.project_id) return this._invalid('project_id');
    const store = await this._leerJson(input.project_id, STORE_PATH);
    if (store === null) return { status: 200, data: { total: 0, ingredientes: [] } };
    let arr = store.ingredientes_catalogo || [];
    if (input.categoria) arr = arr.filter(i => i.categoria === input.categoria);
    return { status: 200, data: { total: arr.length, ingredientes: arr } };
  }

  async _obtener(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.receta_id && !input.nombre) return this._invalid('receta_id|nombre');
    const store = await this._leerJson(input.project_id, STORE_PATH);
    if (store === null) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'recetas.json no existe', { entity_type: 'recipe' });
    }
    const ref = input.receta_id || input.nombre;
    const norm = String(ref).toLowerCase().trim();
    const r = (store.recetas || []).find(x => x.id === ref)
      || (store.recetas || []).find(x => String(x.nombre || '').toLowerCase().trim() === norm);
    if (!r) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'receta no encontrada', { entity_type: 'recipe', entity_ref: ref });
    }
    const rest = {};
    for (const campo of Object.keys(r)) {
      if (campo !== 'history') rest[campo] = r[campo];
    }
    return { status: 200, data: { ...rest, versiones_anteriores: (r.history || []).length } };
  }

  // ── EL FRENO (skill blueprint-agentico). Valida la 'receta' que el LLM dio
  //    forma contra el contrato (receta.schema.json) ANTES de que se persista.
  //    Función pura: ni lee ni escribe el store — solo juzga la FORMA. Devuelve
  //    siempre 200 (la validación tuvo éxito); el veredicto va en data.valid, y
  //    los errores con su path para que el blueprint re-PIENSE solo lo roto.
  //    Determinista: la misma receta da el mismo veredicto, sin turno LLM. ──
  _validador() {
    if (!this._validarReceta) {
      const schema = require(SCHEMA_PATH);
      const ajv = new Ajv({ allErrors: true, strict: false });
      this._validarReceta = ajv.compile(schema);
    }
    return this._validarReceta;
  }

  async _validar(input) {
    const receta = input.receta || input.obra;
    if (!receta || typeof receta !== 'object' || Array.isArray(receta)) return this._invalid('receta');
    const validate = this._validador();
    const ok = validate(receta);
    if (ok) {
      this.metrics?.increment('recetas.reflejo.served', { op: 'validar', veredicto: 'valida' });
      return { status: 200, data: { valid: true, errors: [] } };
    }
    const errors = (validate.errors || []).map(e => {
      const p = e.instancePath || '(raíz)';
      const extra = e.params && e.params.allowedValues ? ` (permitido: ${e.params.allowedValues.join(', ')})`
        : (e.params && e.params.missingProperty ? `: ${e.params.missingProperty}` : '');
      return { path: e.instancePath || '/', keyword: e.keyword, message: `${p} ${e.message}${extra}`.trim() };
    });
    this.metrics?.increment('recetas.reflejo.served', { op: 'validar', veredicto: 'invalida' });
    return { status: 200, data: { valid: false, errors } };
  }

  // ── ALTA determinista (REFLEJO). El blueprint NORMALIZA lenguaje natural →
  //    lineas[] estructuradas (lo fuzzy) y delega aquí el GUARDAR. Antes el alta
  //    era 100% del LLM: el mismo turno decidía escribir Y afirmar éxito → 3
  //    fantasmas medidos (2026-06-23: chillout, flamenco, hip-hop) + K-Pop, que
  //    EJECUTÓ pero la escritura no aterrizó (fs inestable). Aquí: id slug estable,
  //    dedup, persist atómico, y VERIFICA que la receta esté en el archivo antes
  //    de emitir receta.creada — si no aterrizó, error explícito, nunca fantasma. ──
  _slug(s) {
    return String(s || '').toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // acentos → ascii
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'receta';
  }

  _normalizarLineas(lineas) {
    if (!Array.isArray(lineas)) return [];
    const U = new Set(['g', 'ml', 'ud']);
    return lineas.map(l => {
      const nombre = String(l.nombre || l.ref || '').trim();
      const out = {
        ref: l.ref ? String(l.ref) : this._slug(nombre),
        nombre,
        cantidad: Number(l.cantidad) || 0,
        unidad: U.has(l.unidad) ? l.unidad : 'g'
      };
      if (l.notas) out.notas = String(l.notas);
      return out;
    }).filter(l => l.nombre);
  }

  // ── FIRMA DE SUSTANTIVO — el ESQUELETO de la receta, no su contenido. La
  //    observación de deriva monta sobre el trabajo que _crear ya hace (los 5
  //    puntos en una pasada): aquí salen semántica/intención. Determinista y
  //    transparente; léxico a propósito (brittle) — captura LA FORMA: ¿lleva
  //    masa? ¿base? ¿queso? ¿cuántos toppings? Es el dial plasticidad/rigidez:
  //    grueso, para que "pizza sin masa ×3" salte como deriva y "pepperoni en
  //    vez de jamón" NO. Generaliza luego vía catálogo/familias o LLM.
  _rolDeLinea(l) {
    const t = `${l.ref || ''} ${l.nombre || ''}`.toLowerCase();
    if (/masa/.test(t)) return 'masa';
    if (/tomate|salsa|ali.?oli|ajo.?trufa|pesto|crema|nata/.test(t)) return 'base';
    if (/queso|mozzar|mozarela|parmesano|grana|burrata|azul/.test(t)) return 'queso';
    return 'topping';
  }

  _formaDe(receta) {
    const roles = (receta.lineas || []).map(l => this._rolDeLinea(l));
    return {
      tipo: receta.tipo,
      tiene_masa: roles.includes('masa'),
      tiene_base: roles.includes('base'),
      tiene_queso: roles.includes('queso'),
      n_toppings: roles.filter(r => r === 'topping').length
    };
  }

  async _crear(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.nombre || !String(input.nombre).trim()) return this._invalid('nombre');
    const nombre = String(input.nombre).trim();
    const norm = nombre.toLowerCase();

    const store = await this._leerJson(input.project_id, STORE_PATH);
    const existe = store !== null;
    const recetas = (existe && Array.isArray(store.recetas)) ? store.recetas : [];

    // dedup: no duplicado activo (nombre normalizado + en_servicio)
    const dup = recetas.find(r => String(r.nombre || '').toLowerCase().trim() === norm && r.estado_operativo === 'en_servicio');
    if (dup) return this._errorResponse(409, 'ALREADY_EXISTS', `ya existe una receta activa "${nombre}"`, { entity_type: 'recipe', existing_id: dup.id });

    // id slug estable; sufijo -N si choca con cualquiera (activa o no)
    let id = this._slug(nombre);
    if (recetas.some(r => r.id === id)) { let n = 2; while (recetas.some(r => r.id === `${id}-${n}`)) n++; id = `${id}-${n}`; }

    const tipo = ['pizza', 'masa', 'salsa', 'base'].includes(input.tipo) ? input.tipo : 'pizza';
    const lineas = this._normalizarLineas(input.lineas);
    const rinde = (input.rinde && Number(input.rinde.cantidad) > 0)
      ? { cantidad: Number(input.rinde.cantidad), unidad: String(input.rinde.unidad || 'ud') }
      : (tipo === 'pizza' ? { cantidad: 1, unidad: 'ud' } : null);
    const now = new Date().toISOString();

    // completitud (campos mínimos: nombre, tipo, lineas no vacío)
    const campos_pendientes = [];
    if (lineas.length === 0) campos_pendientes.push('lineas');
    const incompleta = campos_pendientes.length > 0;

    const receta = {
      id, nombre, tipo,
      descripcion: input.descripcion ? String(input.descripcion) : '',
      rinde, lineas,
      instrucciones: Array.isArray(input.instrucciones) ? input.instrucciones.map(String)
        : (input.instrucciones ? [String(input.instrucciones)] : []),
      categorias: Array.isArray(input.categorias) ? input.categorias.map(String) : [],
      etiquetas: Array.isArray(input.etiquetas) ? input.etiquetas.map(String) : [],
      // fuente de una receta = CREACION (prisma-del-caso): sin evidencia que exigir, pero
      // la coercion silenciosa a 'manual' MENTIA sobre la procedencia. String libre.
      fuente: (typeof input.fuente === 'string' && input.fuente.trim()) ? input.fuente.trim().toLowerCase() : 'manual',
      notas: input.notas ? String(input.notas) : '',
      estado_operativo: incompleta ? 'borrador' : 'en_servicio',
      version: 1, history: [], incompleta, campos_pendientes,
      created_at: now, updated_at: now
    };

    // persistir — rama A (archivo no existe): fs.write atómico del store inicial.
    // rama B (existe): fs.edit declarativo (RFC 6902) op:add — NO compone el
    // archivo entero (cierra el bug 'salmorejo perdido' de raíz).
    if (!existe) {
      const store_inicial = { _version: '1.0', _updated_at: now, recetas: [receta], ingredientes_catalogo: [] };
      const w = await this._rpc('fs.write.request', {
        project_id: input.project_id, path: STORE_PATH,
        content: JSON.stringify(store_inicial, null, 2), encoding: 'utf-8', atomic: true
      });
      if (!w || (typeof w.status === 'number' && w.status >= 400)) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs.write falló al crear el store de recetas', { op: 'write' });
      }
    } else {
      const e = await this._editarJson(input.project_id, STORE_PATH, [
        { op: 'add', path: '/recetas/-', value: receta },
        { op: 'replace', path: '/_updated_at', value: now }
      ]);
      if (!e || (typeof e.status === 'number' && e.status >= 400)) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs.edit falló al añadir la receta', { op: 'edit' });
      }
    }

    // VERIFICAR que aterrizó (la causa K-Pop: el turno ejecutó pero el fs no
    // persistió). Releemos y confirmamos. Solo emitimos receta.creada si la
    // receta está REALMENTE en el archivo → nunca un éxito fantasma.
    const check = await this._leerJson(input.project_id, STORE_PATH);
    const landed = check && Array.isArray(check.recetas) && check.recetas.some(r => r.id === id);
    if (!landed) {
      this.metrics?.increment('recetas.reflejo.errors', { op: 'crear_no_landed' });
      this.logger?.error('recetas.reflejo.crear.no_landed', { project_id: input.project_id, receta_id: id });
      return this._errorResponse(503, 'UPSTREAM_UNREACHABLE',
        'la receta no se confirmó en el archivo tras escribir (filesystem inestable) — NO guardada', { op: 'verify', receta_id: id });
    }

    this.eventBus.publish('receta.creada', {
      receta_id: id, nombre, version: 1, estado_operativo: receta.estado_operativo,
      firma: this._formaDe(receta),   // el ESQUELETO — observable de deriva (gemelo-de-sustantivos)
      ...(incompleta ? { incompleta: true, campos_pendientes } : {}),
      correlation_id: input.correlation_id || null, timestamp: now
    });

    return {
      status: 201,
      data: { receta_id: id, nombre, tipo, estado_operativo: receta.estado_operativo, incompleta, campos_pendientes, lineas_count: lineas.length }
    };
  }

  // ── persist WRITE (fire-and-forget): aplica el coste de escandallo al store.
  //    Antes era un turno LLM sintético por cada coste; ahora es código. ──
  async onCosteCalculado(event) {
    const d = (event && event.data) || event || {};
    if (!d.project_id || !d.receta_id) return;
    try {
      const store = await this._leerJson(d.project_id, STORE_PATH);
      if (!store) return;
      const idx = (store.recetas || []).findIndex(r => r.id === d.receta_id);
      if (idx < 0) return;
      const r = store.recetas[idx];
      const aplicados = [];
      for (const campo of ['coste_total', 'coste_unidad', 'coste_actualizado_at', 'fuentes_precios', 'lineas_detalle', 'lineas_sin_precio']) {
        if (d[campo] !== undefined && d[campo] !== null) { r[campo] = d[campo]; aplicados.push(campo); }
      }
      if (aplicados.length === 0) return;
      const now = new Date().toISOString();
      await this._editarJson(d.project_id, STORE_PATH, [
        { op: 'test', path: `/recetas/${idx}/id`, value: d.receta_id },
        { op: 'replace', path: `/recetas/${idx}`, value: r },
        { op: 'replace', path: '/_updated_at', value: now }
      ]);
      this.eventBus.publish('receta.actualizada', {
        receta_id: r.id, nombre: r.nombre, version: r.version,
        campos_actualizados: aplicados, origen: 'escandallo.coste.calculado',
        correlation_id: d.correlation_id || null, timestamp: now
      });
      this.metrics?.increment('recetas.reflejo.served', { op: 'aplicar_coste' });
    } catch (err) {
      this.logger?.error('recetas.reflejo.aplicar_coste.failed', { error: err.message });
      this.metrics?.increment('recetas.reflejo.errors', { op: 'aplicar_coste' });
    }
  }
}

module.exports = RecetasReflejo;
