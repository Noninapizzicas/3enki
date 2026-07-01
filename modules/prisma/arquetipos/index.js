/**
 * prisma/arquetipos — REFLEJO JS: el registro ABIERTO de arquetipos de Prisma.
 *
 * Un arquetipo = la FORMA de un producto (ejes+naturalezas) + defaults (sub_formas,
 * modelo_precio, órganos que enciende). La SEMILLA vive en _shared/arquetipos-semilla
 * (fuente única del clasificador, compartida con prisma/adaptador). El registro es
 * ABIERTO: la IA PROPONE uno nuevo cuando algo no encaja, y un humano lo APRUEBA
 * (anti-wipe: la semilla es intocable; un id ya aprobado no se pisa) — como el
 * destilador con las skills. Los custom aprobados clasifican con prioridad.
 *
 * Store /prisma/arquetipos.json (project scope v0.1.0). Ver prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { SEMILLA, SEMILLA_IDS, clasificar } = require('../../_shared/arquetipos-semilla');

const STORE = '/prisma/arquetipos.json';
const nowISO = () => new Date().toISOString();
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

class PrismaArquetiposReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'arquetipos';
    this.version = 'reflejo-0.1.0';
  }

  onListarRequest(e)     { return this._atender(e, 'listar', 'arquetipos.listar.response', d => this._listar(d)); }
  onObtenerRequest(e)    { return this._atender(e, 'obtener', 'arquetipos.obtener.response', d => this._obtener(d)); }
  onClasificarRequest(e) { return this._atender(e, 'clasificar', 'arquetipos.clasificar.response', d => this._clasificar(d)); }
  onProponerRequest(e)   { return this._atender(e, 'proponer', 'arquetipos.proponer.response', d => this._proponer(d)); }
  onAprobarRequest(e)    { return this._atender(e, 'aprobar', 'arquetipos.aprobar.response', d => this._aprobar(d)); }

  // ── store custom ──
  async _cargarCustom(project_id) {
    const obj = await this._leerJson(project_id, STORE);
    return (obj && Array.isArray(obj.arquetipos)) ? obj.arquetipos : [];
  }
  async _guardarCustom(project_id, arquetipos) {
    return this._rpc('fs.write.request', { project_id, path: STORE, content: JSON.stringify({ _version: 1, _updated: nowISO(), arquetipos }, null, 2), encoding: 'utf-8', atomic: true });
  }

  // la semilla es intocable
  _esSemilla(id) { return SEMILLA_IDS.has(id); }

  // ── ops ──
  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const custom = await this._cargarCustom(input.project_id);
    return { status: 200, data: { semilla: SEMILLA, custom, total: SEMILLA.length + custom.length } };
  }

  async _obtener(input) {
    if (!input.project_id || !input.id) return this._invalid('id');
    const semilla = SEMILLA.find(a => a.id === input.id);
    if (semilla) return { status: 200, data: { ...semilla, origen: 'semilla' } };
    const custom = await this._cargarCustom(input.project_id);
    const c = custom.find(a => a.id === input.id);
    if (!c) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'arquetipo no existe', { entity_type: 'arquetipo', id: input.id });
    return { status: 200, data: { ...c, origen: 'custom' } };
  }

  // clasifica una forma → arquetipo. Los custom APROBADOS tienen prioridad sobre la semilla.
  async _clasificar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const ejes = input.ejes || {};
    const naturalezas = input.naturalezas || {};
    const aprobados = (await this._cargarCustom(input.project_id)).filter(a => a.estado === 'aprobado');
    const id = clasificar(ejes, naturalezas, aprobados);
    const def = aprobados.find(a => a.id === id) || SEMILLA.find(a => a.id === id) || null;
    return { status: 200, data: { arquetipo_id: id, arquetipo: def } };
  }

  // PROPONER — la IA registra un arquetipo nuevo cuando algo no encaja. Anti-wipe: no pisa la
  // semilla ni un id ya aprobado. Queda 'propuesto' hasta que un humano lo apruebe.
  async _proponer(input) {
    if (!input.project_id) return this._invalid('project_id');
    const a = input.arquetipo || {};
    const id = a.id ? slug(a.id) : slug(a.nombre);
    if (!id) return this._invalid('arquetipo.id');
    if (this._esSemilla(id)) return this._errorResponse(409, 'CONFLICT_STATE', 'ese id es de la semilla (intocable)', { id });
    if (!Array.isArray(a.reglas)) return this._invalid('arquetipo.reglas');
    const custom = await this._cargarCustom(input.project_id);
    const existente = custom.find(x => x.id === id);
    if (existente && existente.estado === 'aprobado') return this._errorResponse(409, 'CONFLICT_STATE', 'ya hay un arquetipo aprobado con ese id (anti-wipe)', { id });
    const nuevo = {
      id, reglas: a.reglas,
      sub_formas: Array.isArray(a.sub_formas) ? a.sub_formas : [],
      modelo_precio: a.modelo_precio || 'por_unidad',
      organos: Array.isArray(a.organos) ? a.organos : [],
      estado: 'propuesto', propuesto_por: a.propuesto_por || 'ia', created_at: nowISO()
    };
    const siguiente = custom.filter(x => x.id !== id).concat([nuevo]);
    const w = await this._guardarCustom(input.project_id, siguiente);
    if (w && w.error) return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'no se pudo guardar el arquetipo');
    this.eventBus.publish('arquetipo.propuesto', { project_id: input.project_id, arquetipo: nuevo, correlation_id: input.correlation_id, timestamp: nowISO() });
    return { status: 201, data: { id, estado: 'propuesto' } };
  }

  // APROBAR — el humano cierra el anti-wipe: un custom 'propuesto' pasa a 'aprobado' y entra a
  // clasificar. No se aprueba sobre la semilla (ya está).
  async _aprobar(input) {
    if (!input.project_id || !input.id) return this._invalid('id');
    const id = slug(input.id);
    if (this._esSemilla(id)) return this._errorResponse(409, 'CONFLICT_STATE', 'la semilla no se aprueba (ya está)', { id });
    const custom = await this._cargarCustom(input.project_id);
    const idx = custom.findIndex(x => x.id === id);
    if (idx < 0) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'arquetipo propuesto no existe', { entity_type: 'arquetipo', id });
    custom[idx] = { ...custom[idx], estado: 'aprobado', aprobado_at: nowISO() };
    const w = await this._guardarCustom(input.project_id, custom);
    if (w && w.error) return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'no se pudo guardar');
    this.eventBus.publish('arquetipo.aprobado', { project_id: input.project_id, arquetipo: custom[idx], correlation_id: input.correlation_id, timestamp: nowISO() });
    return { status: 200, data: { id, estado: 'aprobado' } };
  }
}

module.exports = PrismaArquetiposReflejo;
