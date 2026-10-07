/**
 * nichos/proponedor-modelo-cobro — MICRO-AGENTE (fuzzy): propone el modelo de
 * negocio/cobro por nicho antes del gate de operar (D4).
 *
 * Dado un NICHO (construido, D1) y (opcionalmente) el estudio de competencia (E1),
 * propone un MODELO DE COBRO estructurado: la opcion recomendada (suscripcion |
 * empresa | transaccional | abierto), el porqué en 1 frase y el precio sugerido
 * derivado del estudio. NO lo impone: lo confirma el gate E2, no se autoimpone.
 *
 * Híbrido (patrón real de nichos/estudio-demanda + estudio-competencia):
 *   _proponerEstructura   — REFLEJO (mecánico, determinista): valida el nicho y
 *                           deriva las opciones de modelo declaradas + el precio
 *                           sugerido de la evidencia.
 *   _redactarPropuesta    — FUZZY (juicio LLM): un guion-prompt self-contained +
 *                           los datos -> llm.complete.request -> propuesta razonada.
 *                           Si el LLM falla → fallback reflejo (_redactarReflejo)
 *                           garantiza una propuesta derivada de la evidencia.
 *
 * NUNCA inventa: no fabrica precio ni modelo que la evidencia no apoye; si el nicho
 * viene vacio → par de fallo honesto (nichos.modelo_cobro.proponer.failed).
 * Sin store, sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_PROPUESTA =
  'Eres el ASESOR DE MODELO DE COBRO de un buscador de nichos de negocio. Recibes un NICHO ' +
  'construido y (si aplica) el estudio de su competencia. Debes PROPONER el MODELO DE COBRO ' +
  'adecuado para ese nicho. Reglas: elige SOLO entre [suscripcion, empresa, transaccional, ' +
  'abierto]; razona con los datos que te dan (tipo de producto/servicio, audiencia, competencia, ' +
  'disposicion a pagar estimada), NO inventes numeros ausentes; si no hay evidencia suficiente, ' +
  'marca la opcion como provisional. Responde SOLO JSON: ' +
  '{"modelo":"<suscripcion|empresa|transaccional|abierto>","razon":"<1 frase>","precio_sugerido_eur":<0-? num o null>,' +
  '"provisional":<true|false>}.';

// Modelo por tipo de entrega (reglas declaradas, no inventadas).
const POR_TIPO = {
  servicio: 'suscripcion',
  producto: 'transaccional',
  empresa: 'empresa',
  contenido: 'suscripcion'
};

class ProponedorModeloCobro extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'proponedor-modelo-cobro';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onProponerRequest(e) {
    return this._atender(e, 'proponer', 'nichos.modelo_cobro.proponer.response', async (d) => {
      const res = await this._proponer(d);
      // Fire-and-forget de dominio: exito → propuesto; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.modelo_cobro.propuesto', res.data);
      } else {
        this.eventBus?.publish('nichos.modelo_cobro.proponer.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: estructura el modelo (reflejo) + lo razona (fuzzy) ──
  async _proponer({ project_id, nicho, competencia } = {}) {
    project_id = project_id || this.project_id;
    if (!nicho || typeof nicho !== 'object') {
      return this._errorResponse(400, 'NICHO_INVALIDO', 'el nicho es obligatorio para proponer el modelo de cobro', { project_id });
    }
    // Reflejo (mecánico, determinista): opciones declaradas + precio derivado de la evidencia.
    const estructura = this._proponerEstructura(nicho, competencia);
    // Juicio fuzzy: razona la propuesta. Si falla → fallback reflejo por reglas.
    let propuesta = await this._redactarPropuesta(nicho, estructura, competencia);
    const provisional = estructura.provisional;
    if (!propuesta) {
      propuesta = this._redactarReflejo(nicho, estructura, provisional);
    }
    if (!propuesta) {
      return this._errorResponse(502, 'SIN_PROPUESTA', 'el juicio no pudo proponer un modelo de cobro', { project_id, nicho });
    }
    return { status: 200, data: { project_id, nicho: nicho.producto || nicho.servicio || nicho.nombre || nicho.id || null, ...estructura, ...propuesta, propuesto: true } };
  }

  // ── REFLEJO (mecánico, determinista): valida el nicho y deriva opciones + precio ──
  _proponerEstructura(nicho, competencia) {
    const tipo = nicho.tipo || (nicho.producto ? 'producto' : (nicho.servicio ? 'servicio' : 'abierto'));
    const opcion = POR_TIPO[tipo] || (tipo === 'abierto' ? 'abierto' : 'transaccional');
    // Precio sugerido derivado de la evidencias de disposicion a pagar/competencia (numeros declarados).
    let precio = null;
    const pagar = competencia && competencia.disposicion_pagar;
    if (pagar && typeof pagar.precio_medio_eur === 'number') precio = this._round(pagar.precio_medio_eur, 2);
    const provisional = !pagar || typeof pagar.precio_medio_eur !== 'number';
    const opciones = ['suscripcion', 'empresa', 'transaccional', 'abierto'];
    return {
      modelo: opcion,
      opciones,
      precio_sugerido_eur: precio,
      provisional,
      basado_en: competencia ? 'estudio de competencia (D4 -> E1)' : 'tipo de entrega del nicho'
    };
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + los datos ──
  async _redactarPropuesta(nicho, estructura, competencia) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_PROPUESTA,
      messages: [{ role: 'user', content: JSON.stringify({ nicho, estructura, competencia }) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._validarPropuesta(this._parse(resp));
  }

  // ── FUZZY: extrae el JSON del completado (tolera fences ```json y texto) ──
  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && c.modelo) return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  // Validador de contrato: modelo valido + razon presente; nunca suelta un modelo invalido.
  _validarPropuesta(o) {
    const modelos = ['suscripcion', 'empresa', 'transaccional', 'abierto'];
    if (!o || !o.modelo || !modelos.includes(o.modelo)) return null;
    // Solo usa precios numericos validos si vienen del LLM; si no, lo marca provisional.
    const precio = (typeof o.precio_sugerido_eur === 'number' && o.precio_sugerido_eur >= 0)
      ? this._round(o.precio_sugerido_eur, 2) : null;
    return {
      modelo: o.modelo,
      razon: (typeof o.razon === 'string' && o.razon.trim()) ? o.razon.trim() : 'modelo razonado para este nicho',
      precio_sugerido_eur: precio,
      provisional: precio === null
    };
  }

  // ── REFLEJO (fallback determinista): propuesta derivada de la evidencia, nunca inventa ──
  _redactarReflejo(nicho, estructura, provisional) {
    const nombres = nicho.producto || nicho.servicio || nicho.nombre || nicho.id || 'el nicho';
    const base = `Para ${nombres} el modelo de cobro recomendado es ${estructura.modelo}: encaja con su tipo de entrega.`;
    if (provisional) {
      return {
        modelo: estructura.modelo,
        razon: `${base} Aun sin precio confirmado, queda provisional y lo confirma el gate E2 con la evidencia de disposicion a pagar.`,
        precio_sugerido_eur: null,
        provisional: true
      };
    }
    return {
      modelo: estructura.modelo,
      razon: `${base} Precio sugerido de ${estructura.precio_sugerido_eur} EUR, derivado de la disposicion a pagar observada.`,
      precio_sugerido_eur: estructura.precio_sugerido_eur,
      provisional: false
    };
  }
}

module.exports = ProponedorModeloCobro;
