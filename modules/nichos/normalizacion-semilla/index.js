/**
 * nichos/normalizacion-semilla — MICRO-AGENTE (fuzzy): el juicio de la busqueda.
 *
 * Recibe la semilla capturada por captura-semilla (A1) — la palabra/idea cruda
 * del dueño, ej. 'quiero vender salsa picante' — y la DESAMBIGUA a intenciones
 * de busqueda claras: qué producto/servicio, a qué audiencia, en qué territorio.
 *
 * Híbrido (patrón real de prisma/formulador):
 *   _normalizarEstructura  — REFLEJO (mecánico, determinista): normaliza el texto
 *                            y lo trocea en señales de producto/audiencia/lugar/verbo.
 *   _desambiguar           — FUZZY (juicio LLM): un guion-prompt self-contained + la
 *                            semilla normalizada -> llm.complete.request -> List<Intencion>
 *                            en JSON tipado validado. Si el LLM falla o no cumple el
 *                            contrato, el reflejo determinista por reglas asegura al
 *                            menos una intención útil (no deja el pipeline roto).
 *
 * NUNCA inventa: no fabrica producto ni audiencia que no estén en la semilla; si no
 * hay nada interpretable → par de fallo honesto (nichos.semilla.normalizar.failed).
 * Sin store, sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_DESAMBIGUAR =
  'Eres el DESAMBIGUADOR DE SEMILLA de un buscador de nichos de negocio. Recibes la idea ' +
  'cruda que un dueño da para arrancar una busqueda (ej. "quiero vender salsa picante a ' +
  'restaurantes"). Extrae las INTENCIONES de busqueda claras: combinaciones de producto/servicio, ' +
  'audiencia y territorio que se puedan perseguir. Reglas: usa SOLO lo que esté en la semilla, ' +
  'NO inventes producto, audiencia ni lugar ausentes (si falta audiencia, ponla null). Si la semilla ' +
  'es ambigua con varios sentidos (ej. "cerveza" = artesanal / de importación / de autor), saca una ' +
  'intencion por sentido con su confianza. Verbo de negocio detectado: vender|ofrecer|crear|hacer|' +
  'fabricar|exportar|sustituir|automatizar|enseñar|asesorar. Responde SOLO JSON: ' +
  '{"intenciones":[{"tipo":"producto|servicio|audiencia|territorio","producto":"<p o null>",' +
  '"audiencia":"<a o null>","lugar":"<l o null>","confianza":<0-1>}]}';

const VERBOS = ['vender', 'ofrecer', 'crear', 'hacer', 'fabricar', 'exportar', 'sustituir', 'automatizar', 'ensenar', 'enseñar', 'asesorar', 'comercializar', 'producir'];

class NormalizacionSemilla extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'normalizacion-semilla';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  onNormalizarRequest(e) {
    return this._atender(e, 'normalizar', 'nichos.semilla.normalizar.response', async (d) => {
      const res = await this._normalizar(d);
      // Fire-and-forget de dominio: exito → normalizada; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.semilla.normalizada', res.data);
      } else {
        this.eventBus?.publish('nichos.semilla.normalizar.failed', res);
      }
      return res;
    });
  }

  // ── el juicio: normaliza (reflejo) + desambigua (fuzzy) ──
  async _normalizar({ project_id, semilla } = {}) {
    project_id = project_id || this.project_id;
    const normalizada = this._normalizarEstructura(semilla);
    if (normalizada == null) {
      return this._errorResponse(400, 'SEMILLA_VACIA', 'la semilla esta vacia o no es util para desambiguar', { project_id });
    }
    // Desambiguación fuzzy (juicio LLM). Si falla → fallback reflejo por reglas.
    let intenciones = await this._desambiguar(normalizada);
    if (!intenciones || intenciones.length === 0) {
      intenciones = this._desambiguarReflejo(normalizada);
    }
    if (!intenciones || intenciones.length === 0) {
      return this._errorResponse(502, 'SIN_INTENCIONES', 'el juicio no pudo extraer intenciones interpretables de la semilla', { project_id, semilla: normalizada });
    }
    return { status: 200, data: { project_id, semilla: normalizada, intenciones, normalizada: true } };
  }

  // ── REFLEJO (mecánico, determinista): limpia y trocea el texto en señales ──
  _normalizarEstructura(texto) {
    if (typeof texto !== 'string') return null;
    const t = texto.trim().replace(/\s+/g, ' ');
    if (t.length === 0) return null;
    return t;
  }

  // ── FUZZY: 1 llamada llm.complete headless con el guion + la semilla ──
  async _desambiguar(semilla) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_DESAMBIGUAR,
      messages: [{ role: 'user', content: JSON.stringify({ semilla }) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._validarIntenciones(this._parse(resp));
  }

  // ── FUZZY: extrae el JSON del completado (tolera fences ```json y texto) ──
  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && Array.isArray(c.intenciones)) return c;
    if (c && typeof c === 'object') return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  // Validador de contrato: solo intenciones bien formadas; NUNCA inventa sentidos sin señal.
  _validarIntenciones(o) {
    if (!o || !Array.isArray(o.intenciones) || o.intenciones.length === 0) return null;
    const out = o.intenciones.map(it => {
      const tipo = ['producto', 'servicio', 'audiencia', 'territorio'].includes(it.tipo) ? it.tipo : 'producto';
      return {
        tipo,
        producto: it.producto && String(it.producto).trim() ? String(it.producto).trim() : null,
        audiencia: it.audiencia && String(it.audiencia).trim() ? String(it.audiencia).trim() : null,
        lugar: it.lugar && String(it.lugar).trim() ? String(it.lugar).trim() : null,
        confianza: (typeof it.confianza === 'number' && it.confianza >= 0 && it.confianza <= 1) ? it.confianza : 0.5
      };
    }).filter(i => i.producto || i.audiencia || i.lugar); // sin señal → descartada
    return out.length ? out : null;
  }

  // ── REFLEJO (fallback determinista): garantiza >= 1 intencion si el LLM no responde ──
  _desambiguarReflejo(semilla) {
    if (!semilla) return null;
    const lower = semilla.toLowerCase();
    const tieneVerbo = VERBOS.some(v => lower.includes(v));
    const producto = semilla.replace(new RegExp(`^(.*?(?:${VERBOS.join('|')}))\\s+`, 'i'), '').trim() || semilla;
    // Señal de audiencia típica: 'para X', 'a X', 'de X'
    let audiencia = null, lugar = null;
    const para = semilla.match(/\b(?:para|a)\s+([^,.;:-]+)$/i);
    if (para && para[1].trim()) audiencia = para[1].trim();
    const en = semilla.match(/\ben\s+([^,.;:-]+)$/i);
    if (en && en[1].trim()) lugar = en[1].trim();

    const intenciones = [{
      tipo: tieneVerbo ? 'producto' : 'territorio',
      producto: producto || semilla,
      audiencia,
      lugar,
      confianza: tieneVerbo ? 0.7 : 0.4
    }];
    return this._validarIntenciones({ intenciones });
  }
}

module.exports = NormalizacionSemilla;
