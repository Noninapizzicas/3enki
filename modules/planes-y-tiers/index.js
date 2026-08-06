/**
 * planes-y-tiers — CUSTODIO: definición de los planes del Radar de Nichos.
 *
 * Guarda la definición de Free (1 nicho/semana con retraso) · Pro 29-49€/mes ·
 * Agencias 199-499€/mes. Persiste por proyecto (PosPersistencia). Consulta vía
 * get (detalle de un plan) y list (la definición completa, la que reflejan la
 * página de precios 14 y las reglas de acceso 19). Garantía: rangos declarados
 * respetados — nunca sirve un precio fuera de rango (si la persistencia viniera
 * corrupta, se repara al hidratar). No hace: cobrar.
 *
 * v0.1.0: custodio de consulta con defaults del esquema.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const PLANES_DEFAULT = Object.freeze({
  free: Object.freeze({
    id: 'free',
    nombre: 'Free',
    detalle: '1 nicho/semana con retraso',
    precio_eur: 0,
    rango_eur: null,
    periodicidad: 'mensual',
    entrega: { nichos_por_semana: 1, retraso: true },
    alertas_en_vivo: false
  }),
  pro: Object.freeze({
    id: 'pro',
    nombre: 'Pro',
    detalle: 'Alertas en vivo · 29-49€/mes',
    precio_eur: null,
    rango_eur: { min: 29, max: 49 },
    periodicidad: 'mensual',
    entrega: { retraso: false },
    alertas_en_vivo: true
  }),
  agencias: Object.freeze({
    id: 'agencias',
    nombre: 'Agencias',
    detalle: 'Volumen para agencias · 199-499€/mes',
    precio_eur: null,
    rango_eur: { min: 199, max: 499 },
    periodicidad: 'mensual',
    entrega: { retraso: false, volumen: true },
    alertas_en_vivo: true
  })
});

class PlanesYTiersReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'planes-y-tiers';
    this.version = 'reflejo-0.1.0';
    this._definiciones = new Map(); // project_id → { planes }

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'planes-y-tiers.json',
      snapshot: (pid) => {
        const def = this._definiciones.get(pid);
        return def ? { project_id: pid, planes: def.planes } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.planes) {
          this._definiciones.set(pid, { planes: this._saneamiento(data.planes) });
        }
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers ──

  onGetRequest(e) {
    return this._atender(e, 'get', 'planes-y-tiers.get.response', d => this._get(d));
  }

  onListRequest(e) {
    return this._atender(e, 'list', 'planes-y-tiers.list.response', d => this._list(d));
  }

  // ── Proyecciones ──

  _get(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');
    const plan_id = input.plan_id;
    if (!plan_id) return this._invalid('plan_id');

    const plan = this._definicion(pid).planes[plan_id];
    if (!plan) {
      return { status: 404, data: { error: 'RESOURCE_NOT_FOUND', message: `plan '${plan_id}' no existe` } };
    }
    const violacion = this._violaRango(plan);
    if (violacion) {
      return { status: 409, data: { error: 'CONFLICT_RANGO', message: violacion } };
    }
    return { status: 200, data: { project_id: pid, plan } };
  }

  _list(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');

    const planes = this._definicion(pid).planes;
    const resultado = {};
    for (const [id, plan] of Object.entries(planes)) {
      const violacion = this._violaRango(plan);
      resultado[id] = violacion ? { ...plan, rango_violado: violacion } : plan;
    }
    return { status: 200, data: { project_id: pid, planes: resultado } };
  }

  // ── Internas ──

  _definicion(pid) {
    let def = this._definiciones.get(pid);
    if (!def) {
      // Bajo demanda: igual que project-profile. La definición canónica nace del esquema.
      def = { planes: this._clonar(PLANES_DEFAULT) };
      this._definiciones.set(pid, def);
      this._persist.marcarDirty(pid);
    }
    return def;
  }

  _violaRango(plan) {
    if (!plan || !plan.rango_eur || plan.precio_eur == null) return null;
    if (plan.precio_eur < plan.rango_eur.min || plan.precio_eur > plan.rango_eur.max) {
      return `precio ${plan.precio_eur}€ fuera del rango declarado [${plan.rango_eur.min}-${plan.rango_eur.max}]€`;
    }
    return null;
  }

  _saneamiento(planes) {
    const out = {};
    for (const [id, plan] of Object.entries(planes)) {
      const p = { ...plan };
      // Nunca se sirve un precio fuera de rango: si la persistencia lo trae, se descarta y se anota.
      if (p.rango_eur && p.precio_eur != null &&
          (p.precio_eur < p.rango_eur.min || p.precio_eur > p.rango_eur.max)) {
        p.precio_eur = null;
        p.rango_reparado = true;
      }
      out[id] = p;
    }
    return out;
  }

  _clonar(obj) { return JSON.parse(JSON.stringify(obj)); }
}

module.exports = PlanesYTiersReflejo;