/**
 * carta-marketing — REFLEJO JS (mitad determinista del módulo híbrido). Tercer
 * caso del Patrón Módulo Híbrido. El blueprint sirve lo FUZZY (completar_onboarding
 * = entrevista de descubrimiento de marca via el agente marketing-onboarding);
 * este reflejo sirve el CRUD determinista del perfil de marca (/pizzepos/marca.json):
 * leer y escribir campos. Réplica fiel de get_perfil/update_perfil del blueprint.
 *
 * Mata el teatro del onboarding: antes, sin poder abrir la op real, el LLM roleaba
 * "el agente lo registra" sin persistir nada. Ahora update_perfil ESCRIBE de verdad
 * (fs.write/fs.edit) y emite marketing.perfil.actualizado → la propiocepción lo
 * capta → el LLM sabe que se guardó, no lo finge.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const STORE_PATH = '/pizzepos/marca.json';

// Estructura CANÓNICA de la identidad (ver _schemas/marca/marca.schema.json).
// Secciones con dueño; se rellenan de a poco. Mínimo para arrancar: esencia.nombre.
function identidadVacia() {
  return {
    _version: '1.0',
    _updated_at: new Date().toISOString(),
    onboarding_completado: false,
    esencia: { nombre: '', lema: '', proposito: '', valores: [] },   // ADN — onboarding
    voz: { tono: [], registro: '', referencias: [], si: [], no: [] },// cómo habla — onboarding
    publico: { quien: '', actitud: '' },                             // a quién — onboarding
    visual: { colores: {}, tipografias: {}, estilo: '', logo: '' },  // cómo se ve — carta-design
    negocio: { tipo_cocina: '', local: {}, redes: {} }               // contexto — onboarding
  };
}

// Deep-merge: objetos se funden recursivamente; arrays/escalares reemplazan.
// Así un update parcial de una sección NO pisa el resto de la identidad.
function deepMerge(base, parche) {
  if (parche === null || typeof parche !== 'object' || Array.isArray(parche)) return parche;
  const out = (base && typeof base === 'object' && !Array.isArray(base)) ? { ...base } : {};
  for (const k of Object.keys(parche)) {
    out[k] = deepMerge(out[k], parche[k]);
  }
  return out;
}

class CartaMarketingReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'carta-marketing';
    this.version = 'reflejo-1.0.0';
  }

  // ── handlers RPC (una línea) ──
  onGetPerfilRequest(e) { return this._atender(e, 'get_perfil', 'carta-marketing.get_perfil.response', d => this._getPerfil(d)); }
  onUpdatePerfilRequest(e) { return this._atender(e, 'update_perfil', 'carta-marketing.update_perfil.response', d => this._updatePerfil(d)); }

  // ── proyecciones deterministas (réplica fiel del pseudocódigo) ──

  async _getPerfil(input) {
    if (!input.project_id) return this._invalid('project_id');
    const store = await this._leerJson(input.project_id, STORE_PATH);
    // Devuelve siempre la estructura completa (secciones vacías si falta).
    return { status: 200, data: store === null ? identidadVacia() : deepMerge(identidadVacia(), store) };
  }

  // Update por SECCIÓN: campos es un parche parcial de la identidad
  // (p.ej. { esencia: { nombre, valores }, visual: { colores } }). Deep-merge
  // sobre lo que ya hay → se rellena de a poco sin pisar el resto. Reescritura
  // atómica del fichero (single-writer, store pequeño).
  async _updatePerfil(input) {
    if (!input.project_id || !input.campos || typeof input.campos !== 'object' || Array.isArray(input.campos) || Object.keys(input.campos).length === 0) {
      return this._invalid('campos');
    }
    const base = (await this._leerJson(input.project_id, STORE_PATH)) || identidadVacia();
    const merged = deepMerge(base, input.campos);
    merged._version = merged._version || '1.0';
    merged._updated_at = new Date().toISOString();
    // onboarding_completado: lo marca explícito el caller; si no, se infiere de la esencia.
    if (input.campos.onboarding_completado === undefined && merged.esencia && merged.esencia.nombre) {
      // no forzamos a true — solo dejamos lo que venga; la esencia mínima existe.
    }
    const w = await this._rpc('fs.write.request', {
      project_id: input.project_id, path: STORE_PATH,
      content: JSON.stringify(merged, null, 2), encoding: 'utf-8', atomic: true
    });
    if (w && w.status >= 400) return w;
    this._emitirActualizado(input, Object.keys(input.campos));
    return { status: 200, data: merged };
  }

  _emitirActualizado(input, campos_modificados) {
    this.eventBus.publish('marketing.perfil.actualizado', {
      project_id: input.project_id, campos_modificados,
      correlation_id: input.correlation_id || null, timestamp: new Date().toISOString()
    });
  }
}

module.exports = CartaMarketingReflejo;
