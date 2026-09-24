/**
 * nichos/estudio-competencia — MICRO-AGENTE (fuzzy): el estudio de competencia del
 * nicho ANTES del gate de operar (E1).
 *
 * Dado un NICHO (construido) y las fuentes declaradas, produce un ESTUDIO DE
 * COMPETENCIA estructurado: el dataset de competidores observados en las fuentes
 * (quien compite y con que fuerza) + la CONCLUSION de diferenciacion (donde puede
 * entrar el nicho). Alimenta el paquete de decision (H1/paquete-decision) via
 * nichos.competencia.analizado.
 *
 * Híbrido (patrón real de nichos/estudio-demanda):
 *   _analizarFuentes         — REFLEJO (mecánico, determinista): consulta las fuentes
 *                              (via nichos.fuente.consultar.request) y trocea el dataset
 *                              en registros de competidores observados.
 *   _concluirDiferenciacion  — FUZZY (juicio LLM): un guion-prompt self-contained +
 *                              el dataset -> llm.complete.request -> CONCLUSION de
 *                              diferenciacion. Si el LLM falla, el reflejo determinista
 *                              (_concluirReflejo) asegura una conclusion derivada de
 *                              los datos observados.
 *
 * SIEMPRE devuelve datos ESTRUCTURADOS (competidores, metricas, diferenciacion) —
 * jamas un texto suelto. NUNCA inventa: no fabrica competidores que las fuentes no
 * apoyen; si no hay datos que apoyen el analisis → par de fallo honesto
 * (nichos.competencia.analizar.failed). Sin store, sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_DIFERENCIACION =
  'Eres el ANALISTA DE COMPETENCIA de un buscador de nichos de negocio. Recibes un NICHO ' +
  'y el DATASET de competidores ya observados en las fuentes (quien compite, con que fuerza ' +
  'y en que territorio). Tu trabajo es redactar la CONCLUSION DE DIFERENCIACION: si el nicho ' +
  'puede entrar y por que angulo (precio, calidad, especializacion, territorio, servicio). ' +
  'Reglas: usa SOLO los competidores que te dan, NO inventes competidores, precios ni ' +
  'fortalezas ausentes; si hay muchos competidores fuertes, dilo con honestidad y sugiere ' +
  'un angulo estrecho. Responde SOLO con un parrafo breve y directo de 2-3 frases en espanol, ' +
  'sin bullet ni JSON.';

const FUENTE_DEFAULT = 'puerto';
const COMPETIDORES_COTA = 20; // tope de registros de competidores por fuente (cota conservadora)

class EstudioCompetencia extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estudio-competencia';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onAnalizarRequest(e) {
    return this._atender(e, 'analizar', 'nichos.competencia.analizar.response', async (d) => {
      const res = await this._analizar(d);
      // Fire-and-forget de dominio: exito → analizado; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.competencia.analizado', res.data);
      } else {
        this.eventBus?.publish('nichos.competencia.analizar.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: consulta fuentes (reflejo) + analiza dataset (reflejo) + concluye (fuzzy) ──
  async _analizar({ project_id, nicho, fuentes } = {}) {
    project_id = project_id || this.project_id;
    if (!nicho || typeof nicho !== 'object') {
      return this._errorResponse(400, 'NICHO_INVALIDO', 'el nicho es obligatorio para analizar la competencia', { project_id });
    }
    // Barrido reflejo: consulta las fuentes y trocea el dataset en registros de competidores.
    const barrido = await this._consultarFuentes(project_id, nicho, fuentes);
    const registrosTotales = barrido.reduce((n, b) => n + (b.registros ? b.registros.length : 0), 0);
    if (registrosTotales === 0) {
      return this._errorResponse(422, 'SIN_DATOS', 'ninguna fuente devolvio datos que apoyen el analisis de competencia', { project_id, nicho });
    }
    // Reflejo (numeros declarados): dataset de competidores observados.
    const competidores = this._extraerCompetidores(barrido);
    const metricas = this._medirMetricas(barrido, competidores);
    // Juicio fuzzy: concluye la diferenciacion de los datos. Si falla → fallback reflejo por reglas.
    let conclusion = await this._concluirDiferenciacion(nicho, competidores, metricas);
    if (!conclusion) {
      conclusion = this._concluirReflejo(competidores, metricas);
    }
    if (!conclusion) {
      return this._errorResponse(502, 'SIN_CONCLUSION', 'el juicio no pudo concluir la diferenciacion', { project_id, nicho });
    }
    return {
      status: 200,
      data: {
        project_id,
        nicho: nicho.producto || nicho.servicio || nicho.nombre || nicho.id || null,
        competidores,
        metricas,
        conclusion_diferenciacion: conclusion,
        analizado: true
      }
    };
  }

  // ── REFLEJO (mecánico, determinista): consulta cada fuente y trocea el dataset ──
  async _consultarFuentes(project_id, nicho, fuentes) {
    const termino = nicho.producto || nicho.servicio || nicho.audiencia || nicho.id || '';
    const targets = (Array.isArray(fuentes) && fuentes.length > 0) ? fuentes : [null];
    const resultados = [];
    for (const fuente of targets) {
      const resp = await this._rpc('nichos.fuente.consultar.request', {
        project_id, nicho: termino, fuente: fuente || undefined
      }, { timeout_ms: 15000 }).catch(() => null);
      if (resp && resp.status === 200) {
        const dataset = resp.data && (resp.data.dataset || resp.data.resultados || resp.data.raw || resp.data);
        resultados.push({
          fuente: (resp.data && resp.data.fuente) || fuente || FUENTE_DEFAULT,
          registros: this._parsearRegistros(dataset)
        });
      } else {
        resultados.push({ fuente: fuente || FUENTE_DEFAULT, registros: [], error: (resp && resp.code) || 'FUENTE_NO_DATOS' });
      }
    }
    return resultados;
  }

  // ── REFLEJO: normaliza el dataset en una lista plana de registros de competidores ──
  _parsearRegistros(dataset) {
    if (!dataset) return [];
    if (Array.isArray(dataset)) {
      return dataset.map(r => {
        if (typeof r === 'string') return { nombre: r, intensidad: 0.5 };
        return {
          nombre: r.nombre || r.competidor || r.puesto || r.titulo || r.texto || null,
          intensidad: (typeof r.intensidad === 'number') ? r.intensidad : 0.5,
          fortaleza: r.fortaleza || r.foco || r.angulo || null
        };
      }).filter(r => r.nombre).slice(0, COMPETIDORES_COTA);
    }
    if (typeof dataset === 'string') {
      return dataset.split(/\n+/).map(t => t.trim()).filter(Boolean)
        .map(t => ({ nombre: t, intensidad: 0.5 })).slice(0, COMPETIDORES_COTA);
    }
    if (typeof dataset === 'object') {
      if (Array.isArray(dataset.items)) return this._parsearRegistros(dataset.items);
      for (const k of Object.keys(dataset)) if (Array.isArray(dataset[k])) return this._parsearRegistros(dataset[k]);
      return [{ nombre: dataset.nombre || dataset.titulo || null, intensidad: 0.5 }].filter(r => r.nombre);
    }
    return [];
  }

  // ── REFLEJO: deja la lista plana de competidores observados (normalizados) ──
  _extraerCompetidores(barrido) {
    const vistos = new Map();
    for (const b of barrido) {
      for (const r of (b.registros || [])) {
        const clave = String(r.nombre || 'competidor').toLowerCase().trim();
        if (vistos.has(clave)) {
          vistos.get(clave).fuentes.add(b.fuente);
        } else {
          vistos.set(clave, { nombre: String(r.nombre), intensidad: r.intensidad, fortaleza: r.fortaleza || null, fuentes: new Set([b.fuente]) });
        }
      }
    }
    return [...vistos.values()].map(c => ({
      nombre: c.nombre,
      intensidad: c.intensidad,
      fortaleza: c.fortaleza,
      fuentes: [...c.fuentes]
    }));
  }

  // ── REFLEJO (numeros declarados): metricas del grado de competencia observado ──
  _medirMetricas(barrido, competidores) {
    const fuentesConDatos = barrido.filter(b => (b.registros || []).length > 0).length;
    const numCompetidores = competidores.length;
    const alta = competidores.filter(c => c.intensidad >= 0.7).length;
    // Grado de competencia 0-1: mas competidores y mas intensidad alta → mas saturado (ancla en lo real).
    const grado = numCompetidores === 0 ? 0 : Math.min(1, this._round(0.3 + Math.min(0.4, numCompetidores * 0.08) + alta * 0.1, 2));
    return {
      competidores_observados: numCompetidores,
      fuentes_con_datos: fuentesConDatos,
      competidores_intensidad_alta: alta,
      grado_competencia: grado,
      saturado: grado >= 0.7
    };
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + los datos ──
  async _concluirDiferenciacion(nicho, competidores, metricas) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_DIFERENCIACION,
      messages: [{ role: 'user', content: JSON.stringify({ nicho, competidores, metricas }) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    const texto = this._parseConclusion(resp);
    return texto && texto.trim() ? texto.trim() : null;
  }

  // ── FUZZY: extrae el JSON de la conclusion (tolera fences ```json y texto) y devuelve el parrafo ──
  _parseConclusion(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && c.conclusion && typeof c.conclusion === 'string') return c.conclusion;
    if (typeof c !== 'string') return null;
    const original = c;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i >= 0 && j > i) {
      try {
        const o = JSON.parse(c.slice(i, j + 1));
        if (o && o.conclusion && typeof o.conclusion === 'string') return o.conclusion;
      } catch (_) { /* cae al final */ }
    }
    if (original && typeof original === 'string' && original.trim().length > 1) return original.trim();
    return null;
  }

  // ── REFLEJO (fallback determinista): concluye la diferenciacion de los datos, nunca inventa ──
  _concluirReflejo(competidores, metricas) {
    const n = metricas.competidores_observados;
    const grado = metricas.grado_competencia;
    if (n === 0) return 'Sin competidores observados en las fuentes: el nicho aparece desatendido, un hueco posible con ventaja de primer movimiento, aunque exige confirmar la demanda.';
    if (grado >= 0.7) {
      return `Competencia alta en el nicho (${n} competidores observados, ${metricas.competidores_intensidad_alta} con intensidad alta): la entrada exige un angulo diferencial estrecho — especializacion o territorio — para no competir de frente.`;
    }
    if (grado >= 0.4) {
      return `Competencia moderada en el nicho (${n} competidores observados): hay espacio para entrar con un angulo de calidad/servicio o territorio, sin enfrentarse a jugadores consolidados.`;
    }
    return `Competencia baja en el nicho (${n} competidores observados, grado ${grado}): el territorio esta poco saturado y es viable entrar con ventaja, con margen para diferenciarse por calidad o especializacion.`;
  }
}

module.exports = EstudioCompetencia;
