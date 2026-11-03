'use strict';

/**
 * ModuloBocaos — base de las islas de la vertical Bocaos.
 *
 * No añade negocio: añade las tres cosas que TODAS las islas de Bocaos necesitan y que,
 * copiadas ocho veces, se copian mal.
 *
 *   1. servir()   RPC request/response con el par honesto: publica `<base>.response` siempre
 *                 y `<base>.failed` cuando la guarda dice que no. Sin esto, un rechazo de
 *                 negocio viaja como una response con status 409 y nadie lo ve en el bus.
 *   2. estado()   estado del módulo POR PROYECTO (una plaza = un despliegue; una tienda = un
 *                 proyecto dentro). Vive en memoria y se vuelca por el reflejo fs con
 *                 `fs.write.request` — evento, no require. Si el fs no contesta, el estado
 *                 sigue vivo en memoria (degradación honesta, igual que pos-persistencia).
 *   3. canonico() huella estable: mismo objeto → mismo sha256, con las claves ordenadas.
 *                 Es lo que hace reproducible una foto del mercado (A03/A29).
 *
 * REGLA DE LA VERTICAL: aquí no hay ni un `require` a otro módulo. Lo que un módulo necesita
 * de otro lo PIDE AL BUS (`this._rpc(...)`) y el dato VIAJA en el evento.
 */

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

class ModuloBocaos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this._mem = new Map();        // project_id → estado del módulo
    this._hidratando = new Map(); // project_id → promesa en vuelo
    this._path = null;            // '/bocaos/<slug>.json' — lo fija el subclase
    this.plaza_id = null;         // sello del despliegue (project_id 'plaza-<slug>')
  }

  async onUnload() {
    for (const project_id of this._mem.keys()) await this.guardar(project_id);
    await super.onUnload();
  }

  // =============================================================
  // RPC con response correlada + hecho `.failed` cuando la guarda dice no.
  // =============================================================
  async servir(event, op, base, proyeccion) {
    const r = await this._atender(event, op, `${base}.response`, proyeccion);
    if (r && typeof r.status === 'number' && r.status >= 400) {
      const d = (event && event.data) || event || {};
      const request_id = d.request_id ?? event?.request_id ?? null;
      try {
        this.eventBus.publish(`${base}.failed`, { request_id, op, ...r });
      } catch (_) { /* sin bus no hay hecho: el response ya salió */ }
    }
    return r;
  }

  // =============================================================
  // Estado por proyecto: memoria + snapshot por evento fs.write.
  // =============================================================
  async estado(project_id) {
    if (!project_id) return {};
    if (this._mem.has(project_id)) return this._mem.get(project_id);
    if (!this._hidratando.has(project_id)) {
      this._hidratando.set(project_id, (async () => {
        let data = null;
        if (this._path) {
          try { data = await this._leerJson(project_id, this._path); } catch (_) { data = null; }
        }
        const e = data && typeof data === 'object' ? data : {};
        this._mem.set(project_id, e);
        return e;
      })());
    }
    return this._hidratando.get(project_id);
  }

  async guardar(project_id) {
    if (!project_id || !this._path) return;
    const e = this._mem.get(project_id);
    if (!e) return;
    try {
      await this._rpc('fs.write.request', {
        project_id,
        path: this._path,
        content: JSON.stringify({ _version: 1, _updated: new Date().toISOString(), ...e }),
        encoding: 'utf-8',
        atomic: true
      });
    } catch (_) { /* best-effort: el estado sigue en memoria */ }
  }

  // =============================================================
  // Utilidades
  // =============================================================
  huella(v) {
    return crypto.createHash('sha256').update(canonico(v)).digest('hex');
  }

  ahora() {
    return new Date().toISOString();
  }

  // Datos de un hecho del bus, con el proyecto resuelto. Un hecho no repite `project_id`:
  // dice de qué plaza (y de qué tienda) es. Cada isla guarda en el proyecto que le toca:
  // la plaza usa `plaza_id` (que ES su project_id, §1.1) y la tienda usa `tienda_id`.
  datos(e, campo = 'plaza_id') {
    const d = { ...((e && e.data) || e || {}) };
    if (!d.project_id) d.project_id = d[campo] || null;
    return d;
  }

  _iso(v) {
    if (typeof v !== 'string' || !v) return null;
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }

  _minutosEntre(desde, hasta) {
    const a = Date.parse(desde);
    const b = Date.parse(hasta);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return this._round((b - a) / 60000, 2);
  }

  // Publica un HECHO (fire-and-forget) con su hora: sin hora no es un hecho, es una impresión.
  hecho(evento, payload) {
    const p = { ...payload, origen: this.name, publicado_en: this.ahora() };
    this.eventBus.publish(evento, p);
    return p;
  }
}

module.exports = ModuloBocaos;
module.exports.canonico = canonico;
