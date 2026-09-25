/**
 * nichos/sondeo-territorio — MICRO-AGENTE (fuzzy): la celula del buscador de nichos.
 *
 * Recibe el TERRITORIO normalizado (las intenciones de busqueda desambiguadas por
 * normalizacion-semilla A2, ej. {producto:'salsa picante', audiencia:'restaurantes'})
 * y lo BARRE preguntando a las fuentes via puerto-fuente-datos (J1), con el rate
 * gobernado por gestion-limites-fuente (J3). Del dataset crudo que devuelven las
 * fuentes extrae SENALES y CANDIDATOS de nichos — es demanda-primero: interpreta
 * resultados y deja señales de demanda.
 *
 * Híbrido (patrón real de nichos/normalizacion-semilla + prisma/formulador):
 *   _barrerFuentes            — REFLEJO (mecánico, determinista): pide a cada fuente
 *                               (via puerto-fuente-datos) los datos del territorio y
 *                               parsea el dataset crudo en registros/trozos limpos.
 *   _juzgarTerritorio         — FUZZY (juicio LLM): un guion-prompt self-contained +
 *                               el barrido normalizado -> llm.complete.request ->
 *                               List<Candidato> con senal_de_demanda. Si el LLM falla
 *                               o no cumple el contrato, el reflejo por heuristica
 *                               (heuristicaSenalReflejo) asegura al menos el candidato
 *                               derivado del territorio, sin inventar demanda.
 *   _proponerSiguientes(candidatos) — ordena/prioriza los candidatos (por fuente y
 *                               señal) para quien los consuma (reglas-exclusion B2).
 *
 * NUNCA inventa: no fabrica un candidato que las fuentes no apoyen; si no hay nada
 * interpretable o el territorio viene vacio → par de fallo honesto
 * (nichos.territorio.sondear.failed). Sin store, sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_JUZGAR_TERRITORIO =
  'Eres el SONDISTA DE TERRITORIO de un buscador de nichos de negocio. Recibes un TERRITORIO ' +
  'normalizado (las intenciones de busqueda: producto/servicio + audiencia + lugar) y el resultado del ' +
  'BARRIO DE UNA FUENTE: registros/trozos crudos que la fuente devolvio sobre ese territorio. Tu trabajo es ' +
  'INTERPRETAR ese resultado y dejar SENALES DE DEMANDA -> candidatos de nicho concretos. Reglas: usa SOLO ' +
  'lo que las fuentes devolvieron, NO inventes demanda que no este apoyada por el dataset; si no hay una señal ' +
  'clara de demanda en un trozo, pon senal_de_demanda: 0 (ese registro NO es candidato). Por cada registro con ' +
  'señal, saca un candidato con: producto, audiencia, lugar, senal_de_demanda (0-1, cuan fuerte parece la demanda), ' +
  'fuente (nombre de la fuente que lo devolvio). Un territorio sin señales claras -> candidatos:[]. Responde SOLO ' +
  'JSON con la forma: {candidatos:[{producto, audiencia, lugar, senal_de_demanda:{0-1}, fuente}]}.';

const FUENTE_DEFAULT = 'puerto';

class SondeoTerritorio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'sondeo-territorio';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onSondearRequest(e) {
    return this._atender(e, 'sondear', 'nichos.territorio.sondear.response', async (d) => {
      const res = await this._sondear(d);
      // Fire-and-forget de dominio: exito → sondeado + candidatos; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.territorio.sondeado', {
          project_id: res.data.project_id,
          territorio: res.data.territorio,
          total_fuentes: res.data.barrido.length,
          total_registros: res.data.barrido.reduce((n, b) => n + (b.registros ? b.registros.length : 0), 0),
          total_candidatos: res.data.candidatos.length,
          fuentes: res.data.barrido.map(b => b.fuente)
        });
        for (const c of res.data.candidatos) {
          this.eventBus?.publish('nichos.candidato.encontrado', { project_id: res.data.project_id, candidato: c });
        }
      } else {
        this.eventBus?.publish('nichos.territorio.sondear.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: barre (reflejo) + juzga territorio (fuzzy) + propone siguientes ──
  async _sondear({ project_id, territorio, fuentes } = {}) {
    project_id = project_id || this.project_id;
    if (!territorio || (typeof territorio !== 'object')) {
      return this._errorResponse(400, 'TERRITORIO_INVALIDO', 'el territorio es obligatorio para sondear (intencion de busqueda normalizada)', { project_id });
    }
    // Barrido reflejo: pide datos a cada fuente y parsea el dataset crudo.
    const barrido = await this._barrerFuentes(project_id, territorio, fuentes);
    const registrosTotales = barrido.reduce((n, b) => n + (b.registros ? b.registros.length : 0), 0);
    if (registrosTotales === 0) {
      return this._errorResponse(422, 'FUENTES_SIN_DATOS', 'ninguna fuente devolvio datos interpretables del territorio', { project_id, territorio });
    }
    // Juicio fuzzy: interpreta el barrido y deja señales de demanda -> candidatos.
    let candidatos = await this._juzgarTerritorio(territorio, barrido);
    if (!candidatos || candidatos.length === 0) {
      // Fallback reflejo por heuristica: no inventa demanda, deriva candidato del territorio.
      candidatos = this._heuristicaSenalReflejo(territorio, barrido);
    }
    if (!candidatos || candidatos.length === 0) {
      return this._errorResponse(422, 'SIN_DEMANDA', 'el juicio no encontro senales de demanda en el barrido del territorio', { project_id, territorio });
    }
    const propuestos = this._proponerSiguientes(candidatos);
    return { status: 200, data: { project_id, territorio, barrido, candidatos: propuestos, sondeado: true } };
  }

  // ── REFLEJO (mecánico, determinista): barre las fuentes y parsea el dataset crudo ──
  async _barrerFuentes(project_id, territorio, fuentes) {
    // Consultas atómicas al puerto. Si se indican fuentes concretas, se barre solo esa(s);
    // si no, se consulta a las conectadas con el territorio como término (la fuente decide).
    const termino = territorio.producto || territorio.servicio || territorio.audiencia || '';
    const targets = (Array.isArray(fuentes) && fuentes.length > 0) ? fuentes : [null];
    const resultados = [];
    for (const fuente of targets) {
      const resp = await this._rpc('nichos.fuente.consultar.request', {
        project_id, nicho: termino, fuente: fuente || undefined
      }, { timeout_ms: 15000 }).catch(() => null);
      if (resp && resp.status === 200) {
        const dataset = resp.data && (resp.data.dataset || resp.data.resultados || resp.data.raw || resp.data);
        const registros = this._parsearDataset(dataset);
        resultados.push({ fuente: (resp.data && resp.data.fuente) || fuente || FUENTE_DEFAULT, registros });
      } else {
        resultados.push({ fuente: fuente || FUENTE_DEFAULT, registros: [], error: (resp && resp.code) || 'FUENTE_NO_DATOS' });
      }
    }
    return resultados;
  }

  // ── REFLEJO: normaliza el dataset crudo en una lista plana de registros/trozos ──
  _parsearDataset(dataset) {
    if (!dataset) return [];
    if (Array.isArray(dataset)) return dataset.map(r => typeof r === 'object' ? r : { texto: String(r) });
    if (typeof dataset === 'string') {
      const trozos = dataset.split(/\n+/).map(t => t.trim()).filter(Boolean);
      return trozos.map(t => ({ texto: t }));
    }
    if (typeof dataset === 'object') {
      const keys = Object.keys(dataset);
      if (keys.some(k => Array.isArray(dataset[k]))) {
        // busco el primer array de la estructura (trozos o registros)
        for (const k of keys) if (Array.isArray(dataset[k])) return dataset[k];
      }
      return [dataset];
    }
    return [];
  }

  // ── FUZZY: 1 llamada llm.complete.headless con el guion + el barrido ──
  async _juzgarTerritorio(territorio, barrido) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_JUZGAR_TERRITORIO,
      messages: [{ role: 'user', content: JSON.stringify({ territorio, barrido }) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._validarCandidatos(this._parse(resp));
  }

  // ── FUZZY: extrae el JSON del completado (tolera fences ```json y texto) ──
  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && Array.isArray(c.candidatos)) return c;
    if (c && typeof c === 'object') return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  // Validador de contrato: solo candidatos bien formados; NUNCA inventa señales sin dato.
  _validarCandidatos(o) {
    if (!o || !Array.isArray(o.candidatos)) return null;
    const out = o.candidatos.map(c => {
      const senal = (typeof c.senal_de_demanda === 'number' && c.senal_de_demanda >= 0) ? Math.min(1, c.senal_de_demanda) : 0;
      if (senal <= 0) return null; // sin señal de demanda -> no es candidato
      return {
        producto: c.producto && String(c.producto).trim() ? String(c.producto).trim() : null,
        audiencia: c.audiencia && String(c.audiencia).trim() ? String(c.audiencia).trim() : null,
        lugar: c.lugar && String(c.lugar).trim() ? String(c.lugar).trim() : null,
        senal_de_demanda: senal,
        fuente: c.fuente && String(c.fuente).trim() ? String(c.fuente).trim() : FUENTE_DEFAULT
      };
    }).filter(c => c && (c.producto || c.audiencia || c.lugar));
    return out.length ? out : null;
  }

  // ── REFLEJO (fallback determinista): solo deriva el candidato del propio territorio ──
  _heuristicaSenalReflejo(territorio, barrido) {
    // Un registro con texto apoya el territorio -> señal basal; no inventa producto ajeno.
    const soporte = barrido.filter(b => (b.registros || []).length > 0).length;
    if (soporte === 0) return null;
    const producto = territorio.producto || territorio.servicio || territorio.audiencia || null;
    if (!producto) return null;
    return this._validarCandidatos({ candidatos: [{
      producto,
      audiencia: territorio.audiencia || null,
      lugar: territorio.lugar || null,
      senal_de_demanda: Math.min(0.6, 0.3 + 0.1 * soporte),
      fuente: FUENTE_DEFAULT
    }] });
  }

  // ── REFLEJO: prioriza candidatos por señal (desc) para quien los consuma ──
  _proponerSiguientes(candidatos) {
    return [...(candidatos || [])].sort((a, b) => (b.senal_de_demanda || 0) - (a.senal_de_demanda || 0));
  }
}

module.exports = SondeoTerritorio;
