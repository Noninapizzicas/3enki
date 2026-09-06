/**
 * cupula_gcode — CÚPULA GCODE POR MÁQUINA (PASO 7 del plan-construccion).
 *
 * Contrato: custodia el gcode POR MÁQUINA (la RECETA de UNA máquina, firmada y
 * cacheada). A diferencia del STL (modelo universal, cupula_stl), el gcode es la
 * receta específica de UNA máquina: lleva maquina + hash/firma. Cripta single-writer
 * de /impresion-3d/gcode/.
 *
 * FORMA: REFLEJO + PosPersistencia por proyecto (patrón custodio, gemelo de
 * cola_modelos). Store: /impresion-3d/gcode/gcode.json (single-writer, fs.write atómico).
 *
 * Invariantes:
 *   - id único → 409 ALREADY_EXISTS.
 *   - el gcode es POR MÁQUINA: (stl_id, maquina) es la clave de cache; re-slicear el
 *     mismo STL para la misma máquina devuelve el gcode ya firmado (no duplica).
 *   - registrar/obtener_por_maquina/listar son las únicas puertas; nadie más escribe /gcode/.
 *
 * v0.1.0 (primera pasada del plan-construccion): la cripta de la receta firmada por máquina.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const _key = (pid, id) => `${pid}:${id}`;

class CupulaGcodeReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cupula_gcode';
    this.version = 'reflejo-0.1.0';
    this.gcodes = new Map(); // `${project_id}:${id}` → gcode

    this._persist = new PosPersistencia({
      modulo: this, file: 'gcode.json', dir: '/impresion-3d/gcode',
      snapshot: (pid) => {
        const suyos = (m) => [...m.values()].filter(g => g.project_id === pid);
        return { project_id: pid, gcodes: suyos(this.gcodes) };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        for (const g of (data.gcodes || [])) this.gcodes.set(_key(pid, g.id), g);
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onRegistrarRequest(e)        { return this._atender(e, 'registrar', 'cupula_gcode.registrar.response', d => this._registrar(d)); }
  onObtenerPorMaquinaRequest(e){ return this._atender(e, 'obtener_por_maquina', 'cupula_gcode.obtener_por_maquina.response', d => this._obtenerPorMaquina(d)); }
  onListarRequest(e)           { return this._atender(e, 'listar', 'cupula_gcode.listar.response', d => this._listar(d)); }

  // ── PROYECCIONES (dominio) ──

  // _registrar: da de alta un gcode POR MÁQUINA. Requiere stl_id, maquina y archivo.
  // Dedup por (stl_id, maquina): re-slicear el mismo STL para la misma máquina
  // devuelve el gcode ya firmado (cache por máquina, no duplica).
  async _registrar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.stl_id) return this._invalid('stl_id');
    if (!input.maquina) return this._invalid('maquina');
    if (!input.archivo) return this._invalid('archivo');

    const doc = await this._cargar(input.project_id);

    // Cache por (stl_id, maquina): si ya existe el gcode firmado para esa máquina,
    // devolverlo (idempotente) en lugar de duplicar.
    const existente = [...doc.gcodes.values()].find(g => g.stl_id === input.stl_id && g.maquina === input.maquina);
    if (existente) {
      return { status: 200, data: { gcode: existente, cacheado: true } };
    }

    const id = `gcode_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const gcode = {
      id, project_id: input.project_id,
      stl_id: String(input.stl_id),
      maquina: String(input.maquina),
      archivo: String(input.archivo),
      hash: input.hash ? String(input.hash) : null,
      firma: input.firma ? String(input.firma) : null,
      perfil: input.perfil ? String(input.perfil) : null,
      fecha: input.fecha || nowISO()
    };
    doc.gcodes.set(_key(input.project_id, id), gcode);
    await this._guardar(input.project_id, doc);

    this._publicarEvento('cupula_gcode.gcode_registrado', { project_id: input.project_id, gcode });
    return { status: 201, data: { gcode, cacheado: false } };
  }

  // _obtenerPorMaquina: devuelve el gcode firmado para (stl_id, maquina). Es la
  // puerta que usa el puente CrealityPrint para saber si ya hay receta o hay que slicear.
  async _obtenerPorMaquina(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.stl_id) return this._invalid('stl_id');
    if (!input.maquina) return this._invalid('maquina');

    const doc = await this._cargar(input.project_id);
    const gcode = [...doc.gcodes.values()].find(g => g.stl_id === input.stl_id && g.maquina === input.maquina);
    if (!gcode) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'gcode_no_encontrado', { stl_id: input.stl_id, maquina: input.maquina });
    return { status: 200, data: { gcode } };
  }

  // _listar: lista los gcode del proyecto (opcionalmente filtrados por maquina).
  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');

    const doc = await this._cargar(input.project_id);
    let lista = [...doc.gcodes.values()].filter(g => g.project_id === input.project_id);
    if (input.maquina) lista = lista.filter(g => g.maquina === input.maquina);
    lista.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
    return { status: 200, data: { gcodes: lista, total: lista.length } };
  }

  // ── store (single-writer, por proyecto) ──
  async _cargar(project_id) {
    return { gcodes: new Map([...this.gcodes].filter(([k]) => k.startsWith(`${project_id}:`))) };
  }

  async _guardar(project_id, doc) {
    for (const k of [...this.gcodes.keys()]) if (k.startsWith(`${project_id}:`)) this.gcodes.delete(k);
    for (const g of doc.gcodes.values()) this.gcodes.set(_key(project_id, g.id), g);
    this._persist.marcarDirty(project_id);
  }

  _publicarEvento(evento, payload) {
    try { this.eventBus?.publish(evento, payload); } catch (_) { /* best-effort */ }
  }
}

module.exports = CupulaGcodeReflejo;
