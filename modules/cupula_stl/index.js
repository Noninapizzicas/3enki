/**
 * cupula_stl — CÚPULA STL (PASO 6 del plan-construccion).
 *
 * Contrato: custodia los STL/3MF UNIVERSALES (el MODELO 3D, una vez por pieza).
 * El STL es el modelo: se guarda una vez y sirve para CUALQUIER máquina. Es la
 * cripta single-writer de /impresion-3d/stl/. La receta de UNA máquina (el gcode)
 * vive aparte, en cupula_gcode.
 *
 * FORMA: REFLEJO + PosPersistencia por proyecto (patrón custodio, gemelo de
 * cola_modelos). Store: /impresion-3d/stl/stl.json (single-writer, fs.write atómico).
 *
 * Invariantes:
 *   - id único → 409 ALREADY_EXISTS.
 *   - el STL es universal: no lleva máquina ni perfil; solo geometría + parámetros.
 *   - registrar/obtener/listar son las únicas puertas; nadie más escribe /stl/.
 *
 * v0.1.0 (primera pasada del plan-construccion): la cripta del modelo 3D universal.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const _key = (pid, id) => `${pid}:${id}`;

class CupulaStlReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cupula_stl';
    this.version = 'reflejo-0.1.0';
    this.stls = new Map(); // `${project_id}:${id}` → stl

    this._persist = new PosPersistencia({
      modulo: this, file: 'stl.json', dir: '/impresion-3d/stl',
      snapshot: (pid) => {
        const suyos = (m) => [...m.values()].filter(s => s.project_id === pid);
        return { project_id: pid, stls: suyos(this.stls) };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        for (const s of (data.stls || [])) this.stls.set(_key(pid, s.id), s);
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onRegistrarRequest(e)  { return this._atender(e, 'registrar', 'cupula_stl.registrar.response', d => this._registrar(d)); }
  onObtenerRequest(e)    { return this._atender(e, 'obtener', 'cupula_stl.obtener.response', d => this._obtener(d)); }
  onListarRequest(e)     { return this._atender(e, 'listar', 'cupula_stl.listar.response', d => this._listar(d)); }

  // ── PROYECCIONES (dominio) ──

  // _registrar: da de alta un STL universal. Requiere nombre y archivo (ruta o
  // contenido). Dedup por (origen, ref) si vienen. El STL NO lleva máquina: es el
  // modelo 3D, sirve para cualquier máquina.
  async _registrar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.nombre) return this._invalid('nombre');
    if (!input.archivo) return this._invalid('archivo');

    const doc = await this._cargar(input.project_id);

    // Dedupe por (origen, ref) si ambos presentes (mismo archivo ya registrado).
    if (input.origen && input.ref) {
      const dupe = [...doc.stls.values()].find(s => s.origen === input.origen && s.ref === input.ref);
      if (dupe) return this._errorResponse(409, 'ALREADY_EXISTS', 'stl_ya_registrado', { id: dupe.id });
    }

    const id = `stl_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const stl = {
      id, project_id: input.project_id,
      nombre: String(input.nombre),
      archivo: String(input.archivo),
      formato: input.formato ? String(input.formato) : 'stl',
      parametros: input.parametros ? input.parametros : null,
      origen: input.origen ? String(input.origen) : null,
      ref: input.ref ? String(input.ref) : null,
      fecha: input.fecha || nowISO()
    };
    doc.stls.set(_key(input.project_id, id), stl);
    await this._guardar(input.project_id, doc);

    this._publicarEvento('cupula_stl.stl_registrado', { project_id: input.project_id, stl });
    return { status: 201, data: { stl } };
  }

  // _obtener: devuelve un STL por id.
  async _obtener(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');

    const doc = await this._cargar(input.project_id);
    const stl = doc.stls.get(_key(input.project_id, input.id));
    if (!stl) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'stl_no_encontrado', { id: input.id });
    return { status: 200, data: { stl } };
  }

  // _listar: lista los STL del proyecto (opcionalmente filtrados por nombre).
  async _listar(input) {
    if (!input.project_id) return this._invalid('project_id');

    const doc = await this._cargar(input.project_id);
    let lista = [...doc.stls.values()].filter(s => s.project_id === input.project_id);
    if (input.nombre) lista = lista.filter(s => s.nombre.toLowerCase().includes(String(input.nombre).toLowerCase()));
    lista.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
    return { status: 200, data: { stls: lista, total: lista.length } };
  }

  // ── store (single-writer, por proyecto) ──
  async _cargar(project_id) {
    return { stls: new Map([...this.stls].filter(([k]) => k.startsWith(`${project_id}:`))) };
  }

  async _guardar(project_id, doc) {
    for (const k of [...this.stls.keys()]) if (k.startsWith(`${project_id}:`)) this.stls.delete(k);
    for (const s of doc.stls.values()) this.stls.set(_key(project_id, s.id), s);
    this._persist.marcarDirty(project_id);
  }

  _publicarEvento(evento, payload) {
    try { this.eventBus?.publish(evento, payload); } catch (_) { /* best-effort */ }
  }
}

module.exports = CupulaStlReflejo;
