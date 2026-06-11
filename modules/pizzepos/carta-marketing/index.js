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

function perfilVacio() {
  return {
    _version: '1.0', _updated_at: new Date().toISOString(),
    nombre_marca: '', tono_voz: '', valores: [], publico_objetivo: '',
    idiomas: ['es'], onboarding_completado: false
  };
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
    if (store === null) return { status: 200, data: perfilVacio() };
    return { status: 200, data: store };
  }

  async _updatePerfil(input) {
    if (!input.project_id || !input.campos || typeof input.campos !== 'object' || Object.keys(input.campos).length === 0) {
      return this._invalid('campos');
    }
    const now = new Date().toISOString();
    const store = await this._leerJson(input.project_id, STORE_PATH);

    // Rama A — no existe: fs.write atómico del store inicial con los campos.
    if (store === null) {
      const perfil = perfilVacio();
      for (const campo of Object.keys(input.campos)) {
        if (input.campos[campo] !== undefined) perfil[campo] = input.campos[campo];
      }
      perfil._updated_at = now;
      const w = await this._rpc('fs.write.request', {
        project_id: input.project_id, path: STORE_PATH,
        content: JSON.stringify(perfil, null, 2), encoding: 'utf-8', atomic: true
      });
      if (w && w.status >= 400) return w;
      this._emitirActualizado(input, Object.keys(input.campos));
      return { status: 200, data: perfil };
    }

    // Rama B — existe: fs.edit declarativo (un replace por campo + _updated_at).
    const perfil = store;
    const patches = [];
    for (const campo of Object.keys(input.campos)) {
      if (input.campos[campo] !== undefined) {
        patches.push({ op: 'replace', path: '/' + campo, value: input.campos[campo] });
        perfil[campo] = input.campos[campo];
      }
    }
    patches.push({ op: 'replace', path: '/_updated_at', value: now });
    perfil._updated_at = now;
    const ed = await this._editarJson(input.project_id, STORE_PATH, patches);
    if (ed && ed.status >= 400) return ed;
    this._emitirActualizado(input, Object.keys(input.campos));
    return { status: 200, data: perfil };
  }

  _emitirActualizado(input, campos_modificados) {
    this.eventBus.publish('marketing.perfil.actualizado', {
      project_id: input.project_id, campos_modificados,
      correlation_id: input.correlation_id || null, timestamp: new Date().toISOString()
    });
  }
}

module.exports = CartaMarketingReflejo;
