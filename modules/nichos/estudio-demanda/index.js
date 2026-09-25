/**
 * nichos/estudio-demanda — MICRO-AGENTE (fuzzy): la primera pieza del ESLABON
 * LIMITANTE del sistema (validacion, embudo C).
 *
 * Dado un CANDIDATO de nicho (producido por sondeo-territorio B1) y las fuentes
 * declaradas, produce un ESTUDIO DE DEMANDA estructurado: los datos de demanda
 * de 1er orden (quienes buscan y con que fuerza) + la disposicion a pagar del
 * mercado, la evidencia que alimenta al veredicto-viabilidad (C3). Genera la
 * celula de evidencia para decidir si el nicho es viable.
 *
 * Híbrido (patrón real de nichos/normalizacion-semilla + sondeo-territorio):
 *   _medirDemanda1erOrden   — REFLEJO (numeros declarados): convierte el volumen
 *                             de senales troceado de las fuentes en metricas de
 *                             1er orden (quienes_buscan, fuerza_demanda,
 *                             volumen_busqueda, fuentes).
 *   _medirDisposicionAPagar — REFLEJO (numeros declarados): de la evidencia de
 *                             precios en el barrido estima un rango de disposicion
 *                             a pagar (rango_min/max + precio medio en EUR).
 *   _redactarConclusion     — FUZZY (juicio LLM): un guion-prompt self-contained +
 *                             los numbers -> llm.complete.request -> string con la
 *                             CONCLUSION de mercado. Si el LLM falla o no cumple
 *                             el contrato, el reflejo determinista (_redactarReflex)
 *                             asegura una conclusion derivada de los numeros.
 *
 * SIEMPRE devuelve datos ESTRUCTURADOS (demanda_1er_orden, disposicion_pagar,
 * senales) — jamas un texto suelto. NUNCA inventa: no fabrica demanda que las
 * fuentes no apoyen; si el candidato viene vacio o no hay datos que apoyen la
 * medicion → par de fallo honesto (nichos.estudio.medir.failed). Sin store, sin
 * custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_CONCLUSION =
  'Eres el ANALISTA DE MERCADO de un buscador de nichos de negocio. Recibes un CANDIDATO de ' +
  'nicho y las METRICAS de demanda ya medidas de forma numerica: demanda de 1er orden (quienes ' +
  'buscan el producto/servicio y con que fuerza) y la DISPOSICION A PAGAR del mercado (rango de ' +
  'precio estimado en EUR). Tu trabajo es REDACTAR la CONCLUSION de mercado: si el nicho muestra ' +
  'demanda de 1er orden suficiente y una disposicion a pagar que sostenga un negocio. Reglas: ' +
  'usa SOLO los numeros que te dan, NO inventes datos de demanda ni de precio ausentes; si la ' +
  'fuerza de demanda es baja o la disposicion a pagar es estrecha, dilo con honestidad. Responde ' +
  'SOLO con un parrafo breve y directo de 2-3 frases en espanol, sin bullet ni JSON.';

const FUENTE_DEFAULT = 'puerto';
// Rango base declarado (numeros, no inventados): cota de disposicion a pagar si no hay evidencia de precio.
const PRECIO_COTA_BAJA = 9;
const PRECIO_COTA_ALTA = 200;
const PUNTOS_POR_SENAL = 100; // tope de volumen agregado por fuente (cota conservadora)

class EstudioDemanda extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estudio-demanda';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onMedirRequest(e) {
    return this._atender(e, 'medir', 'nichos.estudio.medir.response', async (d) => {
      const res = await this._medir(d);
      // Fire-and-forget de dominio: exito → medido; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.estudio.medido', res.data);
      } else {
        this.eventBus?.publish('nichos.estudio.medir.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: consulta fuentes (reflejo) + mide 1er orden/disposicion (reflejo) + concluye (fuzzy) ──
  async _medir({ project_id, candidato, fuentes } = {}) {
    project_id = project_id || this.project_id;
    if (!candidato || typeof candidato !== 'object') {
      return this._errorResponse(400, 'CANDIDATO_INVALIDO', 'el candidato es obligatorio para medir la demanda', { project_id });
    }
    // Barrido reflejo: consulta las fuentes y trocea el dataset en senales/trozos.
    const barrido = await this._consultarFuentes(project_id, candidato, fuentes);
    const registrosTotales = barrido.reduce((n, b) => n + (b.trozos ? b.trozos.length : 0), 0);
    if (registrosTotales === 0) {
      return this._errorResponse(422, 'SIN_DATOS', 'ninguna fuente devolvio datos que apoyen la medicion de demanda', { project_id, candidato });
    }
    // Reflejo (numeros declarados): metricas de 1er orden y disposicion a pagar.
    const demanda1erOrden = this._medirDemanda1erOrden(candidato, barrido);
    const disposicionPagar = this._medirDisposicionAPagar(candidato, barrido);
    const senales = this._extraerSenales(demanda1erOrden, disposicionPagar);
    // Juicio fuzzy: concluye el mercado de los numeros. Si falla → fallback reflejo por reglas.
    let conclusion = await this._redactarConclusion(candidato, demanda1erOrden, disposicionPagar);
    if (!conclusion) {
      conclusion = this._redactarConclusionReflejo(demanda1erOrden, disposicionPagar);
    }
    if (!conclusion) {
      return this._errorResponse(502, 'SIN_CONCLUSION', 'el juicio no pudo redactar una conclusion de mercado', { project_id, candidato });
    }
    return {
      status: 200,
      data: {
        project_id,
        candidato,
        demanda_1er_orden: demanda1erOrden,
        disposicion_pagar: disposicionPagar,
        senales,
        conclusion_mercado: conclusion,
        medido: true
      }
    };
  }

  // ── REFLEJO (mecánico, determinista): consulta cada fuente y trocea el dataset ──
  async _consultarFuentes(project_id, candidato, fuentes) {
    const termino = candidato.producto || candidato.servicio || candidato.audiencia || '';
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
          trozos: this._parsearTrozos(dataset),
          precio_seguro: this._precioSeguro(dataset)
        });
      } else {
        resultados.push({ fuente: fuente || FUENTE_DEFAULT, trozos: [], error: (resp && resp.code) || 'FUENTE_NO_DATOS' });
      }
    }
    return resultados;
  }

  // ── REFLEJO: normaliza el dataset en una lista plana de trozos/registros ──
  _parsearTrozos(dataset) {
    if (!dataset) return [];
    if (Array.isArray(dataset)) return dataset.map(r => typeof r === 'object' ? r : { texto: String(r) });
    if (typeof dataset === 'string') {
      return dataset.split(/\n+/).map(t => t.trim()).filter(Boolean).map(t => ({ texto: t }));
    }
    if (typeof dataset === 'object') {
      if (Array.isArray(dataset.items)) return dataset.items;
      for (const k of Object.keys(dataset)) if (Array.isArray(dataset[k])) return dataset[k];
      return [dataset];
    }
    return [];
  }

  // ── REFLEJO: detecta una senal de precio (EUR/$) en el dataset para dar evidencia ──
  _precioSeguro(dataset) {
    // Busca el primer numero tipo precio en cualquier trozo del dataset (evidencia para disposicion a pagar).
    if (Array.isArray(dataset)) {
      for (const r of dataset) {
        const txt = typeof r === 'string' ? r : (r.titulo || r.texto || r.precio || '');
        const m = String(txt).match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*[€$]/);
        if (m) return Number(String(m[1]).replace(',', '.'));
      }
    }
    if (typeof dataset === 'string') {
      const m = dataset.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*[€$]/);
      if (m) return Number(String(m[1]).replace(',', '.'));
    }
    return null;
  }

  // ── REFLEJO (numeros declarados): mide la demanda de 1er orden — quienes buscan y con que fuerza ──
  _medirDemanda1erOrden(candidato, barrido) {
    const quienes = [];
    if (candidato.audiencia) quienes.push(String(candidato.audiencia).trim());
    // Fuentes con datos → cuantifican el volumen agregado (cota conservadora por fuente).
    let volumen = 0, fuentesConDatos = 0;
    for (const b of barrido) {
      const trozos = b.trozos || [];
      if (trozos.length > 0) {
        fuentesConDatos += 1;
        volumen += Math.min(trozos.length, PUNTOS_POR_SENAL);
      }
    }
    if (!quienes.length) quienes.push(candidato.producto || candidato.servicio || 'mercado');
    // Fuerza de demanda en 0-1: mas fuentes con datos y mas senales → mas fuerza (nunca fabrica: ancla en volumen real).
    const fuerza = fuentesConDatos === 0 ? 0 : Math.min(1, this._round(0.3 + 0.15 * (fuentesConDatos - 1) + 0.02 * (volumen / 10), 2));
    return {
      quienes_buscan: quienes,
      fuerza_demanda: fuerza,
      volumen_busqueda: volumen,
      fuentes: barrido.filter(b => (b.trozos || []).length > 0).map(b => b.fuente)
    };
  }

  // ── REFLEJO (numeros declarados): estima la disposicion a pagar — rango y precio medio en EUR ──
  _medirDisposicionAPagar(candidato, barrido) {
    // Recolecta evidencias de precio seguras del barrido (no inventa: solo las que estan).
    const precios = barrido.map(b => b.precio_seguro).filter(p => typeof p === 'number' && p > 0);
    let min, max;
    if (precios.length) {
      min = Math.min(...precios);
      max = Math.max(...precios);
    } else {
      // Sin evidencia de precio concreta: cotas declaradas conservadoras, marcadas como estimadas.
      min = PRECIO_COTA_BAJA;
      max = PRECIO_COTA_ALTA;
    }
    const medio = max >= min ? this._round((min + max) / 2, 2) : this._round((min + max) / 2, 2);
    return {
      moneda: 'EUR',
      rango_min_eur: this._round(min, 2),
      rango_max_eur: this._round(max, 2),
      precio_medio_eur: medio,
      evidencia: precios.length ? `evidencia de ${precios.length} precio(s) observado(s) en las fuentes` : 'sin evidencia de precio concreta en las fuentes: cotas declaradas conservadoras'
    };
  }

  // ── REFLEJO: deja senales concretas que resumen el estudio (datos estructurados adicionales) ──
  _extraerSenales(demanda1erOrden, disposicionPagar) {
    const s = [];
    s.push({ senal: 'fuerza_demanda', valor: demanda1erOrden.fuerza_demanda, unidad: '0-1' });
    s.push({ senal: 'volumen_busqueda', valor: demanda1erOrden.volumen_busqueda, unidad: 'trozos' });
    s.push({ senal: 'precio_medio_eur', valor: disposicionPagar.precio_medio_eur, unidad: 'EUR' });
    return s;
  }

  // ── FUZZY: 1 llamada llm.complete.request con el guion + los numeros ──
  async _redactarConclusion(candidato, demanda1erOrden, disposicionPagar) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_CONCLUSION,
      messages: [{ role: 'user', content: JSON.stringify({ candidato, demanda_1er_orden: demanda1erOrden, disposicion_pagar: disposicionPagar }) }],
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
    // Si no tenia JSON contenedor, el parrafo mismo es la conclusion.
    if (original && typeof original === 'string' && original.trim().length > 1) return original.trim();
    return null;
  }

  // ── REFLEJO (fallback determinista): concluye el mercado de los numeros, nunca inventa ──
  _redactarConclusionReflejo(demanda1erOrden, disposicionPagar) {
    const fuerza = demanda1erOrden && typeof demanda1erOrden.fuerza_demanda === 'number' ? demanda1erOrden.fuerza_demanda : 0;
    const quienes = demanda1erOrden && demanda1erOrden.quienes_buscan && demanda1erOrden.quienes_buscan.length ? demanda1erOrden.quienes_buscan.join(', ') : 'el mercado';
    const min = disposicionPagar && disposicionPagar.rango_min_eur;
    const max = disposicionPagar && disposicionPagar.rango_max_eur;
    const base = `El mercado busca principalmente ${quienes}. `;
    if (fuerza >= 0.7) {
      return base + `La demanda de 1er orden es alta (fuerza ${fuerza}, volumen ${demanda1erOrden.volumen_busqueda} senales) con una disposicion a pagar estimada entre ${min} y ${max} EUR, lo que sostiene la viabilidad del nicho.`;
    }
    if (fuerza >= 0.4) {
      return base + `La demanda de 1er orden es moderada (fuerza ${fuerza}) con una disposicion a pagar estimada entre ${min} y ${max} EUR, un punto de partida que requiere confirmacion antes de viabilizar.`;
    }
    return base + `La demanda de 1er orden es debil (fuerza ${fuerza}) con una disposicion a pagar estimada entre ${min} y ${max} EUR, lo que probablemente no sostiene un negocio viable por si sola.`;
  }
}

module.exports = EstudioDemanda;
