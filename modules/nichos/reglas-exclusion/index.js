/**
 * nichos/reglas-exclusion — MICRO-AGENTE (fuzzy): la celula que aprende a FILTRAR.
 *
 * Recibe los candidatos que sondeo-territorio (B1) detecto (las senales de demanda)
 * y decide si se EXCLUYEN o pasan: descarta los falsos positivos que no interesan —
 * por experiencia previa (corridas reales / falsos positivos del pasado), por
 * criterio del dueño (reglas explicitas) o por patrones (senal de demanda muy baja).
 *
 * Híbrido (patrón real de nichos/normalizacion-semilla + sondeo-territorio):
 *   _aprenderDeCorridas        — FUZZY (juicio LLM): un guion-prompt self-contained +
 *                                 historial de corridas/falsos positivos -> llm.complete.request
 *                                 -> Reglas de exclusion. Si el LLM falla o no cumple el
 *                                 contrato, el reflejo por reglas asegura al menos la firma
 *                                 de cada falso positivo previo como regla.
 *   _aprenderDeCorridasReflejo — REFLEJO (mecánico, determinista): convierte cada falso
 *                                 positivo previo en una regla de firma (los campos que lo
 *                                 caracterizaron), respeta las reglas explicitas del dueño
 *                                 y marca un umbral minimo de señal.
 *   _aplicar(candidato, reglas) — REFLEJO (mecánico, determinista): cruza el candidato
 *                                 contra las reglas y emite excluido:bool + motivo + regla.
 *
 * NUNCA decide solo sin base: solo excluye lo que una regla justifica (aprendida,
 * declarada por el dueño o de umbral de señal); sin reglas, el candidato pasa.
 * Candidato vacio/malformed -> par de fallo honesto (nichos.reglas.excluir.failed).
 * Sin store, sin custodio: entra candidato + historial, sale veredicto de exclusion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_APRENDER_REGLA =
  'Eres el APRENDIZ DE REGLAS DE EXCLUSION de un buscador de nichos de negocio. Recibes el ' +
  'HISTORIAL de corridas reales: candidatos que en su momento parecian prometedores pero se ' +
  'confirmaron como FALSOS POSITIVOS (no interesaban: el nicho no rinde, mala demanda real, ' +
  'criterio del dueno) y, opcionalmente, las REGLAS EXPLICITAS que el dueno ya declaro. Tu ' +
  'trabajo es derivar REGLAS DE EXCLUSION generalizables: condiciones claras sobre los campos ' +
  'de un candidato (producto, audiencia, lugar, senal_de_demanda, fuente) que permitan descartar ' +
  'los falsos positivos futuros. Reglas: usa SOLO lo que el historial/reglas apoyen, NO inventes ' +
  'exclusiones sin base; si un falso positivo no deja un patron claro, no fuerces una regla. ' +
  'Responde SOLO JSON con la forma: {"reglas":[{"tipo":"producto|audiencia|lugar|senal|fuente",' +
  '"valor":"<texto o numero>","motivo":"<por que se excluye>","confianza":<0-1>}]}. Si no hay ' +
  'patron aprendible, reglas:[].';

const UMBRAL_SENAL_DEFAULT = 0.12;

class ReglasExclusion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'reglas-exclusion';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onExcluirRequest(e) {
    return this._atender(e, 'excluir', 'nichos.reglas.excluir.response', async (d) => {
      const res = await this._excluir(d);
      // Fire-and-forget de dominio: exito → veredicto (excluido:bool + motivo); fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.candidato.excluido', {
          project_id: res.data.project_id,
          candidato: res.data.candidato,
          excluido: res.data.excluido,
          motivo: res.data.motivo,
          regla: res.data.regla
        });
      } else {
        this.eventBus?.publish('nichos.reglas.excluir.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: aprende reglas (fuzzy) + aplica exclusion (reflejo) ──
  async _excluir({ project_id, candidato, historial, reglas } = {}) {
    project_id = project_id || this.project_id;
    if (!candidato || typeof candidato !== 'object') {
      return this._errorResponse(400, 'CANDIDATO_INVALIDO', 'el candidato a excluir es obligatorio (objeto con producto/audiencia/lugar/senal)', { project_id });
    }
    // Aprender/ajustar reglas: fuzzy con fallback reflejo determinista.
    const reglasAprendidas = await this._aprenderDeCorridas(historial, reglas);
    let reglasVigentes = (Array.isArray(reglasAprendidas) && reglasAprendidas.length > 0)
      ? reglasAprendidas
      : this._aprenderDeCorridasReflejo(historial, reglas, { umbral: UMBRAL_SENAL_DEFAULT });
    if (!reglasVigentes || reglasVigentes.length === 0) reglasVigentes = []; // sin base → no se excluye
    // Aplicar (reflejo puro): cruza candidato contra reglas.
    const veredicto = this._aplicar(candidato, reglasVigentes);
    return {
      status: 200,
      data: {
        project_id,
        candidato,
        excluido: veredicto.excluido,
        motivo: veredicto.motivo,
        regla: veredicto.regla,
        reglas: {
          explicitas: (Array.isArray(reglas) ? reglas : []).length,
          aprendidas: reglasVigentes.length,
          total: veredicto.normReglas
        }
      }
    };
  }

  // ── FUZZY: 1 llamada llm.complete.headless con el guion + historial/reglas ──
  async _aprenderDeCorridas(historial, reglas) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_APRENDER_REGLA,
      messages: [{ role: 'user', content: JSON.stringify({ historial: historial || [], reglas_explicitas: reglas || [] }) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._validarReglas(this._parse(resp));
  }

  // ── FUZZY: extrae el JSON del completado (tolera fences ```json y texto) ──
  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && Array.isArray(c.reglas)) return c;
    if (c && typeof c === 'object') return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  // Validador de contrato: solo reglas bien formadas; NUNCA inventa patrones sin base.
  _validarReglas(o) {
    if (!o || !Array.isArray(o.reglas)) return null;
    const tipos = ['producto', 'audiencia', 'lugar', 'senal', 'fuente'];
    const out = o.reglas.map(r => {
      const tipo = tipos.includes(r.tipo) ? r.tipo : null;
      if (!tipo) return null;
      const valor = r.valor !== undefined && r.valor !== null && String(r.valor).trim() !== ''
        ? String(r.valor).trim()
        : null;
      if (!valor) return null;
      return {
        tipo,
        valor,
        motivo: r.motivo && String(r.motivo).trim() ? String(r.motivo).trim() : `excluido por regla de ${tipo}`,
        confianza: (typeof r.confianza === 'number' && r.confianza > 0 && r.confianza <= 1) ? r.confianza : 0.5
      };
    }).filter(Boolean);
    return out.length ? out : null;
  }

  // ── REFLEJO (fallback determinista): reglas de las corridas + explicitas del dueño + umbral ──
  _aprenderDeCorridasReflejo(historial, reglas, { umbral = UMBRAL_SENAL_DEFAULT } = {}) {
    const out = [];
    // Reglas explicitas del dueño primero (siempre manda el criterio declarado).
    if (Array.isArray(reglas)) {
      for (const r of reglas) {
        const v = this._validarReglas({ reglas: [r] });
        if (v) out.push(...v);
      }
    }
    // Cada falso positivo previo deja una regla de firma: los campos que lo caracterizaron.
    if (Array.isArray(historial) && historial.length > 0) {
      for (const fp of historial) {
        if (fp) {
          if (fp.producto && String(fp.producto).trim()) out.push({ tipo: 'producto', valor: String(fp.producto).trim().toLowerCase(), motivo: (fp.motivo || 'falso positivo previo: mismo producto'), confianza: 0.6 });
          if (fp.audiencia && String(fp.audiencia).trim()) out.push({ tipo: 'audiencia', valor: String(fp.audiencia).trim().toLowerCase(), motivo: (fp.motivo || 'falso positivo previo: misma audiencia'), confianza: 0.6 });
          if (fp.lugar && String(fp.lugar).trim()) out.push({ tipo: 'lugar', valor: String(fp.lugar).trim().toLowerCase(), motivo: (fp.motivo || 'falso positivo previo: mismo lugar'), confianza: 0.6 });
        }
      }
    }
    // Umbral minimo de señal: patrón de demanda demasiado baja para interesar.
    out.push({ tipo: 'senal', valor: String(umbral), motivo: `senal de demanda por debajo del umbral minimo (${umbral})`, confianza: 0.8 });
    return out;
  }

  // ── REFLEJO (mecánico, determinista): cruza candidato contra reglas → {excluido, motivo, regla} ──
  _aplicar(candidato, reglas) {
    const norm = (v) => (v && String(v).trim() ? String(v).trim().toLowerCase() : '');
    const senal = (typeof candidato.senal_de_demanda === 'number') ? candidato.senal_de_demanda
      : (typeof candidato.senal === 'number') ? candidato.senal
      : (candidato.senal_de_demanda && !isNaN(Number(candidato.senal_de_demanda))) ? Number(candidato.senal_de_demanda)
      : 0;
    const campos = {
      producto: norm(candidato.producto),
      audiencia: norm(candidato.audiencia),
      lugar: norm(candidato.lugar),
      fuente: norm(candidato.fuente)
    };
    for (const regla of (reglas || [])) {
      if (!regla || !regla.tipo) continue;
      if (regla.tipo === 'senal') {
        // Excluye si la señal real queda bajo el umbral de la regla.
        if (senal < Number(regla.valor)) {
          return { excluido: true, motivo: regla.motivo, regla: { tipo: 'senal', valor: regla.valor }, normReglas: (reglas || []).length };
        }
        continue;
      }
      // Reglas de campo (producto/audiencia/lugar/fuente): coincidencia de firma normalizada.
      if (regla.tipo === 'fuente') {
        if (campos.fuente === norm(regla.valor)) {
          return { excluido: true, motivo: regla.motivo, regla: { tipo: 'fuente', valor: regla.valor }, normReglas: (reglas || []).length };
        }
        continue;
      }
      if (campos[regla.tipo] === norm(regla.valor)) {
        return { excluido: true, motivo: regla.motivo, regla: { tipo: regla.tipo, valor: regla.valor }, normReglas: (reglas || []).length };
      }
    }
    // Ninguna regla aplica → el candidato pasa (no se excluye).
    return { excluido: false, motivo: 'ninguna regla de exclusion aplica', regla: null, normReglas: (reglas || []).length };
  }
}

module.exports = ReglasExclusion;
