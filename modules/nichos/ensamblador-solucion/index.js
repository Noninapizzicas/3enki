/**
 * nichos/ensamblador-solucion — MICRO-AGENTE (fuzzy): el que arma la solución.
 *
 * Materializa la solución de un nicho CONSTRUIR (hoja D1): decide QUÉ construir
 * según el nicho y las capacidades disponibles del catálogo (D3), y ejecuta el
 * montaje de forma determinista para obtener una Solución operable.
 *
 * Híbrido (patrón real de normalizacion-semilla):
 *   _decidirQueConstruir — FUZZY (juicio LLM): propone la ESPECIFICACIÓN (qué
 *                      piezas/capacidades usa y cómo) a partir del nicho y las
 *                      capacidades; fallback reflejo si el LLM falla.
 *   _ejecutarMontaje     — REFLEJO (determinista): monta la SoluciónOperable a
 *                      partir de la especificación sobre las capacidades.
 *
 * NUNCA inventa: no usa una capacidad que no esté en el catálogo; si falta una
 * capacidad esencial -> par de fallo honesto (la crea el catálogo D3,
 * INVARIANTE 'se crea lo que falta'). Sin store, sin custodio.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ── guion-prompt del micro-agente (self-contained) ──
const GUION_MONTAR =
  'Eres el ENSAMBLADOR DE SOLUCION de una fabrica de nichos de negocio. Recibes un NICHO (producto/audiencia) ' +
  'y las CAPACIDADES disponibles del catalogo (lista de capacidades con id y descripcion). Decide QUE construir: ' +
  'una solucion operable minimamente (producto digital, servicio, o canal) que resuelva al nicho. Reglas: usa SOLO ' +
  'capacidades que existan en el catalogo (por id); arma una especificacion con 1-4 capacidades ordenadas por rol ' +
  '(\"captura\", \"entrega\", \"cobro\"); pon un nombre y una descripcion corta de la solucion. NO inventes capacidades ausentes. ' +
  'Si falta la capacidad esencial para entregar/cobrar, marca faltante:true con la capacidad pendiente. Responde SOLO JSON: ' +
  '{"especificacion":{"nombre":"<s>","descripcion":"<d>","capacidades":[{"id":"<id>","rol":"captura|entrega|cobro"}],"faltante":{"id":"<id o null>","motivo":"<m>"}}}';

class EnsambladorSolucion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ensamblador-solucion';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  // project.activated — micro-agente: anuncia el project activo.
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    this.project_id = d.project_id || this.project_id;
    this.logger?.info(`${this.name}.micro.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'nichos.solucion.construir.response', async (d) => {
      const res = await this._construir(d);
      // Fire-and-forget de dominio: exito → construida; fallo → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.solucion.construida', res.data);
      } else {
        this.eventBus?.publish('nichos.solucion.construir.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget D1: camino decidió CONSTRUIR -> arma la solución.
  async onCaminoDecidido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    // Solo CONSTRUIR pide ensamblaje; ENCONTRAR/PUENTE no.
    if (String(d.camino || '').toUpperCase() !== 'CONSTRUIR') return null;
    const res = await this._construir({ project_id: d.project_id, nicho: d.nicho, capacidades: d.capacidades });
    if (res.status === 200) {
      this.eventBus?.publish('nichos.solucion.construida', res.data);
    } else {
      this.eventBus?.publish('nichos.solucion.construir.failed', res);
    }
    return res;
  }

  // ── la construcción: decidir (fuzzy) + montar (reflejo) ──
  async _construir({ project_id, nicho, capacidades } = {}) {
    project_id = project_id || this.project_id;
    if (!project_id) return this._invalid('project_id');
    if (!nicho || typeof nicho !== 'object') return this._invalid('nicho');
    const caps = Array.isArray(capacidades) ? capacidades : [];

    // 1) Decidir qué construir (juicio LLM); fallback reflejo por reglas.
    let espec = await this._decidirQueConstruir(nicho, caps);
    if (!espec) espec = this._decidirQueConstruirReflejo(nicho, caps);
    if (!espec) {
      return this._errorResponse(502, 'SIN_ESPECIFICACION', 'el juicio no pudo componer una especificación para el nicho', { project_id, nicho });
    }

    // 2) Ejecutar el montaje (reflejo determinista) sobre el catálogo.
    const solucion = this._ejecutarMontaje(project_id, nicho, espec, caps);
    if (!solucion) {
      return this._errorResponse(400, 'FALTA_CAPACIDAD_ESENCIAL', 'falta una capacidad esencial para montar la solución (INVARIANTE: se crea)', {
        project_id, faltante: espec.faltante
      });
    }
    return { status: 200, data: { project_id, nicho, especificacion: espec, solucion, construida: true } };
  }

  // ── FUZZY: 1 llamada llm.complete headless con el guion + contexto ──
  async _decidirQueConstruir(nicho, capacidades) {
    const resp = await this._rpc('llm.complete.request', {
      system: GUION_MONTAR,
      messages: [{ role: 'user', content: JSON.stringify({ nicho, capacidades }) }],
      tools: [], settings: { temperature: 0.2 }
    }, { timeout_ms: 30000 }).catch(() => null);
    if (!resp || resp.status >= 400) return null;
    return this._validarEspecificacion(this._parse(resp), capacidades);
  }

  _parse(resp) {
    let c = resp?.data?.content ?? resp?.content ?? resp?.data?.text ?? resp?.text ?? resp?.data?.message ?? '';
    if (c && typeof c === 'object' && c.especificacion) return c;
    if (c && typeof c === 'object') return c;
    if (typeof c !== 'string') return null;
    c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
    const i = c.indexOf('{'), j = c.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
  }

  _validarEspecificacion(o, capacidades) {
    if (!o || !o.especificacion) return null;
    const e = o.especificacion;
    const nombres = new Set(capacidades.map(c => String(c && (c.id ?? c.capacidad ?? c.nombre)).trim()).filter(Boolean));
    const caps = (Array.isArray(e.capacidades) ? e.capacidades : [])
      .map(c => {
        const id = String(c && (c.id ?? c.capacidad)).trim();
        const rol = ['captura', 'entrega', 'cobro'].includes(c?.rol) ? c.rol : null;
        return { id, rol: rol || 'captura' };
      })
      .filter(c => c.id && nombres.has(c.id)); // SOLO capacidades del catálogo
    if (caps.length === 0) return null;
    return {
      nombre: String(e.nombre || '').trim() || 'Solución del nicho',
      descripcion: String(e.descripcion || '').trim() || '',
      capacidades: caps,
      faltante: (e.faltante && String(e.faltante.id || '').trim()) ? e.faltante : null
    };
  }

  // ── REFLEJO (fallback determinista): compone a partir del catálogo existente ──
  _decidirQueConstruirReflejo(nicho, capacidades) {
    if (!capacidades || capacidades.length === 0) return null;
    const nombres = new Set(capacidades.map(c => String(c && (c.id ?? c.capacidad ?? c.nombre)).trim()).filter(Boolean));
    const caps = capacidades
      .map((c, i) => {
        const id = String(c && (c.id ?? c.capacidad ?? c.nombre)).trim();
        if (!id) return null;
        return { id, rol: i === 0 ? 'captura' : (i === 1 ? 'entrega' : 'cobro') };
      })
      .filter(Boolean);
    if (caps.length === 0) return null;
    const nombre = `Solución para ${typeof nicho === 'object' ? (nicho.nombre || nicho.producto || 'nicho') : nicho}`;
    return {
      nombre,
      descripcion: 'Ensamblada por el módulo reflejo determinista (fallback).',
      capacidades: caps,
      faltante: null
    };
  }

  // ── REFLEJO: monta la SoluciónOperable (determinista) ──
  _ejecutarMontaje(project_id, nicho, espec, capacidades) {
    const porId = new Map(capacidades.map(c => [String(c && (c.id ?? c.capacidad ?? c.nombre)).trim(), c]));
    const piezas = [];
    for (const cp of espec.capacidades) {
      const origen = porId.get(cp.id);
      if (!origen) continue; // descarta pieza sin capacidad real (no inventa)
      piezas.push({ id: cp.id, rol: cp.rol, capacidad: origen.descripcion || origen.tipo || nombreCap(origen) });
    }
    // INVARIANTE D3: falta la capacidad esencial de entrega/cobro -> no se monta a medias.
    if (!piezas.some(p => p.rol === 'entrega' || p.rol === 'cobro') && !espec.faltante) {
      return null;
    }
    return {
      nombre: espec.nombre,
      descripcion: espec.descripcion,
      piezas,
      operativa: true,
      montada_el: new Date().toISOString()
    };
  }
}

function nombreCap(c) {
  return String(c && (c.id ?? c.capacidad ?? c.tipo ?? 'capacidad')).trim();
}

module.exports = EnsambladorSolucion;
