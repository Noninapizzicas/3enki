/**
 * catalogo — CUSTODIO single-writer de la biblioteca de piezas del taller 3D (pieza 1).
 *
 * Guarda la ficha de cada modelo físico útil de la moneda real del taller:
 *   STL / 3MF / GCODE conviven como archivos distintos (archivo_stl, archivo_3mf,
 *   archivo_gcode), NUNCA solo .3mf. Es el único escritor del store modelos
 * (por proyecto, vía PosPersistencia).
 *
 * Operaciones del plano (plan-construccion.md 6.1): _registrar (reconcilia ANTES
 * de crear: nombre canónico + fuente + origenUrl → NO duplica), _porId, _listar,
 * _actualizar. Emite modelo.registrado al registrar (ficha nueva o actualizada);
 * par de fallo catalogo.registrar.failed / catalogo.actualizar.failed.
 *
 * CERO juicio: las decisiones del dueño (uso, filamento sugerido, aprobar) no se
 * automatizan; este custodio solo custodia la ficha. El rol CLIENTE es NULO (uso
 * propio, sin venta).
 *
 * v0.1.0: FASE 4 TANDA 1.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const FUENTES = Object.freeze(['DISEÑADO', 'REPOSITORIO', 'ARCHIVO']);
const FORMATOS = Object.freeze(['STL', '3MF', 'GCODE']);
const nowISO = () => new Date().toISOString();
const _key = (pid, id) => `${pid}:${id}`;

class CatalogoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'catalogo';
    this.version = 'reflejo-0.1.0';
    this.modelos = new Map(); // `${project_id}:${id}` → modelo

    this._persist = new PosPersistencia({
      modulo: this, file: 'catalogo.json', dir: '/3d/catalogo',
      snapshot: (pid) => ({
        project_id: pid,
        modelos: [...this.modelos.values()].filter(m => m.project_id === pid)
      }),
      hidratar: (pid, data) => {
        if (!data) return;
        for (const m of (data.modelos || [])) {
          if (!Array.isArray(m.formato_dispon)) m.formato_dispon = m.formato_dispon ? [m.formato_dispon] : [];
          this.modelos.set(_key(pid, m.id), m);
        }
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onRegistrarRequest(e)  { return this._atender(e, 'registrar', 'catalogo.registrar.response', d => this._registrar(d)); }
  onPorIdRequest(e)      { return this._atender(e, 'por_id', 'catalogo.por_id.response', d => this._porId(d)); }
  onListarRequest(e)     { return this._atender(e, 'listar', 'catalogo.listar.response', d => this._listar(d)); }
  onActualizarRequest(e) { return this._atender(e, 'actualizar', 'catalogo.actualizar.response', d => this._actualizar(d)); }

  // ── PROYECCIONES (dominio) ──

  // _registrar: reconcilia ANTES de crear. Clave de identidad canónica = nombre
  // canónico + fuente + origenUrl (ABIERTO identidad). Si existe ficha equivalente,
  // NO duplica: devuelve la existente (reconciliada). Si el modelo ya existe y aporta
  // formatos/rutas nuevos, los AÑADE a la ficha (los 3 formatos conviven).
  async _registrar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const nombre = this._canonico(input.nombre || input.modelo_nombre);
    if (!nombre) return this._invalid('nombre');

    const modelos = this.modelos;
    const dupe = [...modelos.keys()]
      .filter(k => k.startsWith(`${input.project_id}:`))
      .map(k => modelos.get(k))
      .find(m => m.nombre === nombre && m.fuente === (input.fuente || m.fuente) && m.origenUrl === (input.origenUrl || m.origenUrl));

    if (dupe) {
      const actualizado = this._mergeFormato(dupe, input);
      models_set(this.modelos, input.project_id, actualizado);
      this._persist.marcarDirty(input.project_id);
      this.eventBus?.publish('modelo.registrado', {
        modelo_id: actualizado.id, project_id: input.project_id, reconciliado: true,
        formatos: actualizado.formato_dispon,
        correlation_id: input.correlation_id, timestamp: nowISO()
      });
      return { status: 200, data: { modelo: actualizado, reconciliado: true, duplicado: true } };
    }

    const id = input.id || `mod_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const modelo = {
      id, project_id: input.project_id,
      nombre,
      uso: input.uso ? String(input.uso) : null,                 // qué resuelve
      filamento_sug: input.filamento_sug || input.material ? String(input.material || input.filamento_sug || 'PETG') : 'PETG',
      fuente: FUENTES.includes(input.fuente) ? input.fuente : 'ARCHIVO',
      origenUrl: input.origenUrl ? String(input.origenUrl) : null,
      // moneda real: los 3 formatos conviven como archivos distintos
      archivo_stl: input.archivo_stl ? String(input.archivo_stl) : null,
      archivo_3mf: input.archivo_3mf ? String(input.archivo_3mf) : null,
      archivo_gcode: input.archivo_gcode ? String(input.archivo_gcode) : null,
      formato_dispon: this._formatosDe(input),
      historia: [],
      registrado_en: nowISO()
    };
    this.modelos.set(_key(input.project_id, id), modelo);
    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('modelo.registrado', {
      modelo_id: id, project_id: input.project_id, reconciliado: false,
      formatos: modelo.formato_dispon,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
    return { status: 201, data: { modelo, reconciliado: false } };
  }

  async _porId(input) {
    if (!input.project_id || (!input.modelo_id && !input.id)) {
      return this._invalid(input.project_id ? 'modelo_id' : 'project_id');
    }
    const id = input.modelo_id || input.id;
    const m = this.modelos.get(_key(input.project_id, id));
    if (!m) return this._errorResponse(404, 'NOT_FOUND', `modelo no encontrado: ${id}`, { modelo_id: id });
    return { status: 200, data: { modelo: { ...m } } };
  }

  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const todos = [...this.modelos.values()]
      .filter(m => m.project_id === input.project_id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { status: 200, data: { modelos: todos, total: todos.length } };
  }

  // _actualizar: edición de ficha; no re-crea. Merge de campos editables.
  async _actualizar(input) {
    if (!input.project_id || (!input.modelo_id && !input.id)) {
      return this._invalid(input.project_id ? 'modelo_id' : 'project_id');
    }
    const id = input.modelo_id || input.id;
    const key = _key(input.project_id, id);
    const existente = this.modelos.get(key);
    if (!existente) return this._errorResponse(404, 'NOT_FOUND', `modelo no encontrado: ${id}`, { modelo_id: id });

    const cambios = {};
    if (input.uso !== undefined) cambios.uso = input.uso ? String(input.uso) : null;
    if (input.filamento_sug !== undefined) cambios.filamento_sug = String(input.filamento_sug);
    if (input.archivo_stl !== undefined) cambios.archivo_stl = input.archivo_stl ? String(input.archivo_stl) : null;
    if (input.archivo_3mf !== undefined) cambios.archivo_3mf = input.archivo_3mf ? String(input.archivo_3mf) : null;
    if (input.archivo_gcode !== undefined) cambios.archivo_gcode = input.archivo_gcode ? String(input.archivo_gcode) : null;
    if (Object.prototype.hasOwnProperty.call(input, 'fuente') && FUENTES.includes(input.fuente)) cambios.fuente = input.fuente;
    if (input.origenUrl !== undefined && input.origenUrl !== null) cambios.origenUrl = String(input.origenUrl);

    if (['archivo_stl', 'archivo_3mf', 'archivo_gcode'].some(f => Object.prototype.hasOwnProperty.call(cambios, f))) {
      cambios.formato_dispon = this._formatosDe({ ...existente, ...cambios });
    }

    const actualizado = { ...existente, ...cambios, actualizado_en: nowISO() };
    this.modelos.set(key, actualizado);
    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('modelo.registrado', {
      modelo_id: id, project_id: input.project_id, reconciliado: false, actualizado: true,
      formatos: actualizado.formato_dispon,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
    return { status: 200, data: { modelo: actualizado } };
  }

  // helpers internos (NO _shared; lógica de negocio DENTRO del módulo)
  _canonico(nombre) { return String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  _formatosDe(input) {
    const set = new Set(FORMATOS.filter(f => Boolean((input[`archivo_${f.toLowerCase()}`]))));
    for (const f of (input.formato_dispon || [])) if (FORMATOS.includes(f)) set.add(f);
    return [...set];
  }
  _mergeFormato(existente, input) {
    const cambios = {};
    for (const f of FORMATOS) {
      const campo = `archivo_${f.toLowerCase()}`;
      if (input[campo]) cambios[campo] = String(input[campo]);
    }
    if (!Object.keys(cambios).length) return existente;
    const nuevo = { ...existente, ...cambios, formato_dispon: this._formatosDe({ ...existente, ...cambios }) };
    this.modelos.set(_key(existente.project_id, existente.id), nuevo);
    return nuevo;
  }
}

function models_set(map, pid, modelo) { map.set(_key(pid, modelo.id), modelo); }

module.exports = CatalogoReflejo;
