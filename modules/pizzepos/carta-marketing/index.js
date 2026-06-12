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
  onAvanzarOnboardingRequest(e) { return this._atender(e, 'avanzar_onboarding', 'carta-marketing.avanzar_onboarding.response', d => this._avanzarOnboarding(d)); }

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
    const pedir = (Array.isArray(input.pedir) && input.pedir.length) ? input.pedir : ['descripciones', 'preambulo', 'promos'];
    const quiereDesc = pedir.includes('descripciones');
    // productos solo es obligatorio si se piden descripciones (preámbulo/promos salen del perfil).
    if (quiereDesc && (!Array.isArray(input.productos) || input.productos.length === 0)) return this._invalid('productos');

    // 1. HIDRATAR — la voz de marca, con un RPC determinista al propio reflejo.
    const perfilResp = await this._rpc('carta-marketing.get_perfil.request', {
      project_id: input.project_id, correlation_id: input.correlation_id
    });
    const perfil = (perfilResp && perfilResp.data) || {};

    // 2. AGENTE — función pura {perfil, productos, pedir} → {descripciones, preambulo, promos}. Sin tools.
    const ag = await this._rpc('agent.execute.request', {
      agent_name: 'marketing-copywriter',
      task: 'Escribe el copy de carta (lo que pida context.pedir) en la voz de marca del CONTEXTO ENTREGADO. Devuelve solo el JSON del entregable.',
      context: { project_id: input.project_id, perfil, productos: input.productos || [], pedir },
      correlation_id: input.correlation_id
    }, { timeout_ms: 120000 });
    if (ag && ag.status >= 400) return ag;
    const out = this._parseEntregable(ag);
    const tieneDesc = out && Array.isArray(out.descripciones) && out.descripciones.length > 0;
    const tienePre = out && typeof out.preambulo === 'string' && out.preambulo.trim();
    const tienePromos = out && Array.isArray(out.promos) && out.promos.length > 0;
    if (!out || (!tieneDesc && !tienePre && !tienePromos)) {
      return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'el copywriter no devolvió copy');
    }

    // 3. PERSISTIR — store propio del módulo (determinista). Descripciones por producto_id;
    //    preámbulo y promos a nivel de carta.
    const store = (await this._leerJson(input.project_id, COPY_PATH)) || { _version: '1.0', descripciones: {} };
    if (!store.descripciones) store.descripciones = {};
    const now = new Date().toISOString();
    let guardadas = 0;
    if (tieneDesc) {
      for (const d of out.descripciones) {
        if (!d || !d.producto_id) continue;
        store.descripciones[d.producto_id] = {
          nombre: d.nombre || null, texto: d.texto || '',
          emoji: d.emoji || null, tags: Array.isArray(d.tags) ? d.tags : [], _at: now
        };
        guardadas++;
      }
    }
    if (tienePre) store.preambulo = { texto: out.preambulo.trim(), _at: now };
    if (tienePromos) {
      store.promos = out.promos
        .filter(p => p && (p.titulo || p.texto))
        .map(p => ({ titulo: p.titulo || null, texto: p.texto || '' }));
    }
    store._updated_at = now;
    const w = await this._rpc('fs.write.request', {
      project_id: input.project_id, path: COPY_PATH,
      content: JSON.stringify(store, null, 2), encoding: 'utf-8', atomic: true
    });
    if (w && w.status >= 400) return w;

    // 4. EMITIR — la propiocepción lo capta; la carta puede consumir el copy.
    const generado = { descripciones: guardadas, preambulo: tienePre ? 1 : 0, promos: tienePromos ? store.promos.length : 0 };
    this.eventBus.publish('marketing.copy.generado', {
      project_id: input.project_id, carta_id: input.carta_id || null, generado,
      correlation_id: input.correlation_id || null, timestamp: now
    });
    return { status: 200, data: { descripciones: tieneDesc ? out.descripciones : [], preambulo: tienePre ? out.preambulo.trim() : null, promos: tienePromos ? store.promos : [], generado } };
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

  // ── ONBOARDING INTERACTIVO (perspectiva C, por turno) ──
  // El agente NO lee ni escribe: el reflejo HIDRATA el perfil (LEE con _getPerfil) y
  // PERSISTE lo que el agente decide (ESCRIBE con _updatePerfil). Un turno por llamada:
  // la página dispara avanzar_onboarding con el mensaje del usuario, el reflejo guarda
  // y devuelve la siguiente pregunta. mensaje vacío/null = arranque (primera pregunta).
  async _avanzarOnboarding(input) {
    if (!input.project_id) return this._invalid('project_id');

    // 1. LEER — el perfil actual, in-process (la misma proyección determinista).
    const perfilResp = await this._getPerfil({ project_id: input.project_id });
    const perfil = (perfilResp && perfilResp.data) || {};

    // 2. AGENTE — función pura {perfil, mensaje} → {persistir, pregunta, completado}. Sin tools.
    const ag = await this._rpc('agent.execute.request', {
      agent_name: 'marketing-onboarding',
      task: 'Conduce un turno de la entrevista de marca con el CONTEXTO ENTREGADO. Devuelve solo el JSON del entregable {persistir, pregunta, completado}.',
      context: {
        project_id: input.project_id,
        perfil,
        mensaje: input.mensaje != null ? String(input.mensaje) : null,
        datos_iniciales: input.datos_iniciales || null
      },
      correlation_id: input.correlation_id
    }, { timeout_ms: 120000 });
    if (ag && ag.status >= 400) return ag;
    const out = this._parseEntregable(ag);
    if (!out || typeof out.pregunta !== 'string' || !out.pregunta.trim()) {
      return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'el onboarding no devolvió pregunta');
    }

    // 3. ESCRIBIR — el reflejo persiste el parche que decidió el agente (deep-merge por sección).
    const persistir = (out.persistir && typeof out.persistir === 'object' && !Array.isArray(out.persistir)) ? out.persistir : {};
    const completado = out.completado === true;
    let persistido = [];
    if (Object.keys(persistir).length > 0) {
      const w = await this._updatePerfil({ project_id: input.project_id, campos: persistir, correlation_id: input.correlation_id });
      if (w && w.status >= 400) return w;
      persistido = Object.keys(persistir);
    }
    if (completado) {
      await this._updatePerfil({ project_id: input.project_id, campos: { onboarding_completado: true }, correlation_id: input.correlation_id });
    }

    // 4. EMITIR — la propiocepción lo capta.
    const now = new Date().toISOString();
    this.eventBus.publish('marketing.onboarding.avanzado', {
      project_id: input.project_id, persistido, completado,
      correlation_id: input.correlation_id || null, timestamp: now
    });
    if (completado) {
      this.eventBus.publish('marketing.onboarding.completado', {
        project_id: input.project_id, correlation_id: input.correlation_id || null, timestamp: now
      });
    }

    return {
      status: 200,
      data: {
        pregunta: out.pregunta.trim(),
        completado,
        persistido,
        instruccion: completado
          ? 'Onboarding terminado: la identidad queda definida y guardada.'
          : 'Muestra la pregunta al usuario. En su próxima respuesta, vuelve a llamar avanzar_onboarding con su mensaje.'
      }
    };
  }
}

module.exports = CartaMarketingReflejo;
