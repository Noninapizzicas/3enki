/**
 * nichos/reglas-aprendidas — MICRO-AGENTE (fuzzy): el que aprende del resultado real.
 *
 * AFINA el umbral de validación de la vertical: cada proyecto que cobra o
 * sangra RECALIBRA el criterio (hoja C7). Es el bucle resultados-reales →
 * validador: la 'experiencia' se vuelve un embudo auto-afinado gobernado por
 * dato real, no intuición.
 *
 * Consume F1/F3 (nichos.cobro_registrado, nichos.salud.actualizada) y emite a
 * C2 (criterio-viabilidad) el umbral refinado via nichos.umbral.recalibrado.
 *
 * Híbrido (patrón real de normalizacion-semilla):
 *   _calcularDelta   — FUZZY (juicio LLM): interpreta metricas y resultado real
 *                      -> Delta de ajuste (mueve umbral_ingresos/minimos).
 *   _calcularDeltaReflejo — REFLEJO (determinista): reglas de aprendizaje puras
 *                      (COBRÓ sube/afirma, SANGRA baja, NEUTRO neutro) -> fallback
 *                      si el LLM falla o no cumple el contrato.
 *   _recalibrar      — fusiona el delta sobre el umbral vigente -> UmbralRefinado.
 *
 * NUNCA inventa: si no hay resultado real interpretable -> par de fallo honesto.
 * Sin store, sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_CALCULAR_DELTA =
  'Eres el MODULO DE APRENDIZAJE DE UN EMBUDO DE VALIDACION DE NICHOS DE NEGOCIO. Recibes el ' +
  'UMBRAL vigente y el RESULTADO REAL de un proyecto (COBRO = ingreso real entró en caja; ' +
  'SANGRA = coste supera el techo; NEUTRO = ni genera ni sangra) con sus METRICAS. Cuando un ' +
  'proyecto cobra, el umbral es correcto o incluso sube (confia en lo que funciona); cuando ' +
  'sangra, el umbral era demasiado exigente y debe bajar (no dejes que el embudo mate proyectos ' +
  'viables a perdida). Calcula un DELTA de ajuste. Regla: devuelve numeros finitos pequenos ' +
  '(proporcionales al resultado, maximo +-20 EUR o +-2% de minimos); ' +
  'COBRO -> umbral_ingresos positivo o cero, SANGRA -> negativo o cero, NEUTRO -> cero o muy pequeno. ' +
  'Responde SOLO JSON: {"delta":{"umbral_ingresos":<n o null>,"minimos_demanda":{"numero_busquedas":<n o null>,"contactos_semana":<n o null>}},"confianza":<0-1>}';

// Factores de aprendizaje deterministas por resultado real (reflejo fallback).
const FACTOR_DELTA = { 'COBRO': +10, 'SANGRA': -15, 'NEUTRO': 0 };

class ReglasAprendidas extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'reglas-aprendidas';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
    // umbrales vigentes por proyecto (semilla del juicio; C2 es el store).
    this._umbrales = new Map();
  }
  async onUnload() { return super.onUnload(); }

  // project.activated — micro-agente: anuncia y refresca el umbral conocido.
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    this.project_id = d.project_id || this.project_id;
    if (d.umbral) this._umbrales.set(this.project_id, d.umbral);
    this.logger?.info(`${this.name}.micro.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  onRecalibrarRequest(e) {
    return this._atender(e, 'recalibrar', 'nichos.reglas.recalibrar.response', async (d) => {
      const res = await this._recalibrar(d);
      // Fire-and-forget de dominio: exito → umbral recalibrado; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.umbral.recalibrado', res.data);
      } else {
        this.eventBus?.publish('nichos.reglas.recalibrar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget C7: salud actualizada -> aprende del resultado real.
  async onSaludActualizada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id || !d.estado) return null;
    const umbral = d.umbral || this._umbrales.get(d.project_id) || this._umbralVacio(d.project_id);
    const resultado = this._mapearResultado(d.estado);
    return this._dispararRecalibracion(d.project_id, umbral, resultado, {
      ingresos: d.ingresos, coste_total: d.coste_total, confianza: d.confianza
    });
  }

  // Fire-and-forget C7: cobro efectivo registrado -> COBRÓ real.
  async onCobroRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id || !d.cobro) return null;
    // Solo el cobro EFECTIVO es aprendizaje real de caja; un comprometido es promesa.
    const cobro = d.cobro;
    if (String(cobro.tipo || '').toUpperCase() !== 'EFECTIVO') return null;
    const umbral = this._umbrales.get(d.project_id) || this._umbralVacio(d.project_id);
    return this._dispararRecalibracion(d.project_id, umbral, 'COBRO', {
      importe: cobro.importe, confianza: 0.8
    });
  }

  async _dispararRecalibracion(pid, umbral, resultado, metricas) {
    const res = await this._recalibrar({ project_id: pid, umbral, resultados_real: resultado, metricas });
    if (res.status === 200) {
      this._umbrales.set(pid, res.data.umbral_refinado);
      this.eventBus?.publish('nichos.umbral.recalibrado', res.data);
    } else {
      this.eventBus?.publish('nichos.reglas.recalibrar.failed', res);
    }
    return res;
  }

  _umbralVacio(pid) {
    return { project_id: pid, umbral_ingresos: null, minimos_demanda: { numero_busquedas: null, contactos_semana: null } };
  }

  _mapearResultado(estado) {
    if (estado === 'GENERA') return 'COBRO';
    if (estado === 'SANGRA') return 'SANGRA';
    return 'NEUTRO';
  }

  // ── el juicio: recalibrar = comparar (fuzzy) + recalibrar (reflejo) ──
  async _recalibrar({ project_id, umbral, resultados_real, metricas } = {}) {
    project_id = project_id || this.project_id;
    if (!project_id) return this._invalid('project_id');
    const u = umbral || this._umbrales.get(project_id) || this._umbralVacio(project_id);

    const resultado = String(resultados_real || '').toUpperCase();
    if (!['COBRO', 'SANGRA', 'NEUTRO'].includes(resultado)) {
      return this._errorResponse(400, 'RESULTADO_INTERPRETABLE', `resultado real '${resultados_real}' no interpretable`, { project_id });
    }

    // Comparación fuzzy (juicio LLM). Si falla -> fallback reflejo por reglas.
    let delta = await this._calcularDelta(u, resultado, metricas);
    if (!delta) delta = this._calcularDeltaReflejo(u, resultado, metricas);
    if (!delta) {
      return this._errorResponse(502, 'SIN_DELTA', 'el juicio no pudo calcular un delta de ajuste', { project_id });
    }

    const umbral_refinado = this._recalibrarUmbral(u, delta, resultado);
    return {
      status: 200,
      data: {
        project_id,
        delta,
        resultado_real: resultado,
        umbral_refinado,
        recelibrado: true
      }
    };
  }

  // ── FUZZY: 1 llamada llm.complete headless con el guion + contexto ──
  async _calcularDelta(umbral, resultado, metricas) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_CALCULAR_DELTA,
      messages: [{ role: 'user', content: JSON.stringify({ umbral, resultado, metricas }) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._validarDelta(this._parse(resp));
  }

  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && (c.delta || c.umbral)) return c;
    if (c && typeof c === 'object') return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  _validarDelta(o) {
    if (!o || !o.delta) return null;
    const d = o.delta;
    const out = { minimos_demanda: {} };
    let alguno = false;
    for (const k of ['umbral_ingresos']) {
      const n = Number(d[k]);
      if (Number.isFinite(n) && n !== 0) { out[k] = n; alguno = true; }
    }
    if (d.minimos_demanda && typeof d.minimos_demanda === 'object') {
      for (const k of ['numero_busquedas', 'contactos_semana']) {
        const n = Number(d.minimos_demanda[k]);
        if (Number.isFinite(n) && n !== 0) { out.minimos_demanda[k] = Math.round(n); alguno = true; }
      }
    }
    if (!alguno) return null;
    // acota el delta para no romper el embudo (regla: ajuste pequeno)
    if (out.umbral_ingresos != null) out.umbral_ingresos = Math.max(-50, Math.min(50, out.umbral_ingresos));
    return out;
  }

  // ── REFLEJO (fallback determinista): reglas puras de aprendizaje ──
  _calcularDeltaReflejo(umbral, resultado, metricas) {
    const base = FACTOR_DELTA[resultado];
    if (base === undefined) return null;
    const delta = { minimos_demanda: {} };
    const importe = Number(metricas && (metricas.importe ?? metricas.ingresos));
    // Escala relativa al ingreso real cuando hay dato, sin salirse del rango.
    let ajuste = base;
    if (Number.isFinite(importe) && importe > 0) {
      const rel = Math.round(importe * 0.02 * Math.sign(base));
      ajuste = Math.max(-50, Math.min(50, rel));
    }
    if (ajuste !== 0) delta.umbral_ingresos = ajuste;
    else {
      const preU = Number(umbral && umbral.umbral_ingresos);
      if (Number.isFinite(preU)) delta.umbral_ingresos = base; // sin dato, usa el factor base no nulo
    }
    if (delta.umbral_ingresos === undefined) return null;
    return delta;
  }

  // ── REFLEJO: fusiona el delta sobre el umbral vigente (nunca baja de 0) ──
  _recalibrarUmbral(umbral, delta, resultado) {
    const prev = umbral || {};
    const prevMin = prev.minimos_demanda || {};
    const uB = Number(prev.umbral_ingresos);
    const umbral_ingresos = Number.isFinite(uB)
      ? Math.max(0, Math.round((uB + (Number(delta.umbral_ingresos) || 0)) * 100) / 100)
      : Math.max(0, (Number(delta.umbral_ingresos) || 0));
    const minimos_demanda = {
      numero_busquedas: this._ajustarMinimo(prevMin.numero_busquedas, delta.minimos_demanda && delta.minimos_demanda.numero_busquedas),
      contactos_semana: this._ajustarMinimo(prevMin.contactos_semana, delta.minimos_demanda && delta.minimos_demanda.contactos_semana)
    };
    return {
      project_id: prev.project_id || this.project_id,
      umbral_ingresos,
      minimos_demanda,
      recalibrado_por: 'SISTEMA_C7',
      resultado_real: resultado,
      updated_at: new Date().toISOString()
    };
  }

  _ajustarMinimo(actual, delta) {
    const base = Number.isFinite(Number(actual)) ? Number(actual) : 0;
    const adj = Number.isFinite(Number(delta)) ? Number(delta) : 0;
    return Math.max(0, Math.round(base + adj));
  }

  // ── Tools ──
  toolRecalibrar(params) { return this._recalibrar(params); }
  toolCalcularDeltaReflejo(umbral, resultado, metricas) { return this._calcularDeltaReflejo(umbral, resultado, metricas); }
}

module.exports = ReglasAprendidas;
