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
 *
 * Orquestación de agentes (PERSPECTIVA C — el reflejo hidrata y persiste, el agente
 * solo transforma): generar_copy carga {perfil, productos} con RPCs deterministas,
 * invoca al agente marketing-copywriter SIN herramientas (context inyectado), recoge
 * su entregable JSON y lo persiste. Así el tool-use roto del provider deja de importar:
 * el agente nunca toca una herramienta, hace pura transformación datos → copy.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const STORE_PATH = '/pizzepos/marca.json';
const COPY_PATH = '/pizzepos/carta-marketing/copy.json';   // store propio del copy generado (por producto_id)

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
  onGenerarCopyRequest(e) { return this._atender(e, 'generar_copy', 'carta-marketing.generar_copy.response', d => this._generarCopy(d)); }

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

  // ── ORQUESTACIÓN DE AGENTE (perspectiva C) ──
  // generar_copy: el reflejo hidrata (lee la voz de marca), invoca al agente
  // marketing-copywriter SIN herramientas (datos inyectados en el context), recoge
  // su entregable JSON y lo persiste. El agente nunca toca una tool → el tool-use
  // roto del provider no le afecta. Las 4 etapas del patrón, visibles:
  //   1. HIDRATAR (determinista)  2. AGENTE (fuzzy puro)  3. PERSISTIR  4. EMITIR
  async _generarCopy(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!Array.isArray(input.productos) || input.productos.length === 0) return this._invalid('productos');

    // 1. HIDRATAR — la voz de marca, con un RPC determinista al propio reflejo.
    const perfilResp = await this._rpc('carta-marketing.get_perfil.request', {
      project_id: input.project_id, correlation_id: input.correlation_id
    });
    const perfil = (perfilResp && perfilResp.data) || {};

    // 2. AGENTE — función pura {perfil, productos} → {descripciones}. Sin tools.
    const ag = await this._rpc('agent.execute.request', {
      agent_name: 'marketing-copywriter',
      task: 'Escribe el copy de carta para los productos del CONTEXTO ENTREGADO, en la voz de marca. Devuelve solo el JSON del entregable.',
      context: { project_id: input.project_id, perfil, productos: input.productos },
      correlation_id: input.correlation_id
    }, { timeout_ms: 120000 });
    if (ag && ag.status >= 400) return ag;
    const out = this._parseEntregable(ag);
    if (!out || !Array.isArray(out.descripciones) || out.descripciones.length === 0) {
      return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'el copywriter no devolvió descripciones');
    }

    // 3. PERSISTIR — store propio del módulo, merge por producto_id (determinista).
    const store = (await this._leerJson(input.project_id, COPY_PATH)) || { _version: '1.0', descripciones: {} };
    const now = new Date().toISOString();
    let guardados = 0;
    for (const d of out.descripciones) {
      if (!d || !d.producto_id) continue;
      store.descripciones[d.producto_id] = {
        nombre: d.nombre || null, texto: d.texto || '',
        emoji: d.emoji || null, tags: Array.isArray(d.tags) ? d.tags : [], _at: now
      };
      guardados++;
    }
    store._updated_at = now;
    const w = await this._rpc('fs.write.request', {
      project_id: input.project_id, path: COPY_PATH,
      content: JSON.stringify(store, null, 2), encoding: 'utf-8', atomic: true
    });
    if (w && w.status >= 400) return w;

    // 4. EMITIR — la propiocepción lo capta; la carta puede consumir el copy.
    this.eventBus.publish('marketing.copy.generado', {
      project_id: input.project_id, carta_id: input.carta_id || null, count: guardados,
      correlation_id: input.correlation_id || null, timestamp: now
    });
    return { status: 200, data: { descripciones: out.descripciones, guardados } };
  }

  // Extrae el entregable JSON del agente, tolerante a fences ```json y a texto alrededor.
  _parseEntregable(ag) {
    if (!ag) return null;
    let content = (ag.result && ag.result.content) || ag.content || (ag.data && ag.data.content);
    if (content == null) return null;
    if (typeof content === 'object') return content;
    let s = String(content).trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const b = s.indexOf('{'), e = s.lastIndexOf('}');
    if (b >= 0 && e > b) s = s.slice(b, e + 1);
    try { return JSON.parse(s); } catch (_) { return null; }
  }
}

module.exports = CartaMarketingReflejo;
