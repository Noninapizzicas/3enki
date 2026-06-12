/**
 * carta-marketing — REFLEJO JS (mitad determinista del módulo híbrido). El blueprint
 * sirve lo FUZZY (lo conduce el LLM de PÁGINA: entrevista de marca, redacción de copy);
 * este reflejo sirve lo DETERMINISTA: leer y escribir el perfil de marca
 * (/pizzepos/marca.json) y persistir el copy (/pizzepos/carta-marketing/copy.json).
 *
 * SIN capa de agentes. Modelo de dos capas:
 *   - LLM de PÁGINA (blueprint/cajones) → genera/decide (voz de marca, preguntas, copy).
 *   - REFLEJO (este JS)                 → persiste de verdad y emite el evento.
 * El LLM de página produce; el reflejo guarda. update_perfil y guardar_copy ESCRIBEN
 * de verdad (fs.write) y emiten su evento → la propiocepción lo capta → nada de teatro.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const STORE_PATH = '/pizzepos/marca.json';
const COPY_PATH = '/pizzepos/carta-marketing/copy.json';   // store del copy (por producto_id + preámbulo + promos)

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
    this.version = 'reflejo-2.0.0';
  }

  // ── handlers RPC (una línea) ──
  onGetPerfilRequest(e) { return this._atender(e, 'get_perfil', 'carta-marketing.get_perfil.response', d => this._getPerfil(d)); }
  onUpdatePerfilRequest(e) { return this._atender(e, 'update_perfil', 'carta-marketing.update_perfil.response', d => this._updatePerfil(d)); }
  onGuardarCopyRequest(e) { return this._atender(e, 'guardar_copy', 'carta-marketing.guardar_copy.response', d => this._guardarCopy(d)); }

  // ── proyecciones deterministas ──

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
    const w = await this._rpc('fs.write.request', {
      project_id: input.project_id, path: STORE_PATH,
      content: JSON.stringify(merged, null, 2), encoding: 'utf-8', atomic: true
    });
    if (w && w.status >= 400) return w;
    this._emitirActualizado(input, Object.keys(input.campos));
    // El LLM de página marca el cierre del onboarding con onboarding_completado:true → evento canónico.
    if (input.campos.onboarding_completado === true) {
      this.eventBus.publish('marketing.onboarding.completado', {
        project_id: input.project_id, correlation_id: input.correlation_id || null, timestamp: new Date().toISOString()
      });
    }
    return { status: 200, data: merged };
  }

  _emitirActualizado(input, campos_modificados) {
    this.eventBus.publish('marketing.perfil.actualizado', {
      project_id: input.project_id, campos_modificados,
      correlation_id: input.correlation_id || null, timestamp: new Date().toISOString()
    });
  }

  // ── PERSISTENCIA DEL COPY (determinista) ──
  // El LLM de PÁGINA redacta el copy en la voz de marca (lee el perfil via get_perfil) y
  // llama aquí para GUARDARLO. El reflejo no redacta nada: solo persiste lo recibido.
  //   input: { project_id, carta_id?, descripciones?: [{producto_id, nombre, texto, emoji, tags}],
  //            preambulo?: string, promos?: [{titulo, texto}] }
  async _guardarCopy(input) {
    if (!input.project_id) return this._invalid('project_id');
    const tieneDesc = Array.isArray(input.descripciones) && input.descripciones.length > 0;
    const tienePre = typeof input.preambulo === 'string' && input.preambulo.trim();
    const tienePromos = Array.isArray(input.promos) && input.promos.length > 0;
    if (!tieneDesc && !tienePre && !tienePromos) return this._invalid('descripciones|preambulo|promos');

    const store = (await this._leerJson(input.project_id, COPY_PATH)) || { _version: '1.0', descripciones: {} };
    if (!store.descripciones) store.descripciones = {};
    const now = new Date().toISOString();
    let guardadas = 0;
    if (tieneDesc) {
      for (const d of input.descripciones) {
        if (!d || !d.producto_id) continue;
        store.descripciones[d.producto_id] = {
          nombre: d.nombre || null, texto: d.texto || '',
          emoji: d.emoji || null, tags: Array.isArray(d.tags) ? d.tags : [], _at: now
        };
        guardadas++;
      }
    }
    if (tienePre) store.preambulo = { texto: input.preambulo.trim(), _at: now };
    if (tienePromos) {
      store.promos = input.promos
        .filter(p => p && (p.titulo || p.texto))
        .map(p => ({ titulo: p.titulo || null, texto: p.texto || '' }));
    }
    store._updated_at = now;
    const w = await this._rpc('fs.write.request', {
      project_id: input.project_id, path: COPY_PATH,
      content: JSON.stringify(store, null, 2), encoding: 'utf-8', atomic: true
    });
    if (w && w.status >= 400) return w;

    const generado = { descripciones: guardadas, preambulo: tienePre ? 1 : 0, promos: tienePromos ? store.promos.length : 0 };
    this.eventBus.publish('marketing.copy.generado', {
      project_id: input.project_id, carta_id: input.carta_id || null, generado,
      correlation_id: input.correlation_id || null, timestamp: now
    });
    return { status: 200, data: { generado } };
  }
}

module.exports = CartaMarketingReflejo;
