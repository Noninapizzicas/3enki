/**
 * contabilidad-libro/vista-revisable — REFLEJO STATELESS (L2, hoja del plan).
 *
 * Muestra cada asiento/calculo CON su ORIGEN: composicion determinista de la traza.
 * NO es una caja negra: cada linea declarada se muestra junto a los componentes que la explican
 * (traza B4, documento L7, regla, fuente, criterio). Lo que NO tiene origen NO se oculta: se
 * declara `sin_origen` en `abierto` — la vista es explicable o dice por que no lo es.
 *
 * Sube por EVENTO (best-effort) a traza-asiento.registrar.request y mayor-balanza.saldos.request
 * para traer el origen cuando no viene declarado; NUNCA escribe ni muta el libro.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. PREGUNTA (explicar) → sin ui_handler.
 * Ver hoja L2 del plan-construccion y diseno-oop.md (CLASE VistaRevisable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Componentes de origen que hacen explicable una linea/cifra (estructurales, no de negocio).
const ORIGENES = ['traza', 'documento', 'documento_id', 'referencia', 'regla', 'fuente', 'criterio', 'hecho', 'tercero'];

class VistaRevisable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'vista-revisable';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea). CLASE PREGUNTA → sin ui_handler ──
  onExplicarRequest(e) {
    return this._atender(e, 'explicar', 'vista-revisable.explicar.response', async (d) => {
      const res = await this._explicar(d);
      if (res.status !== 200) this.eventBus?.publish('vista-revisable.explicar.failed', res);
      return res;
    });
  }

  // ── handler de dominio: el libro cambio → se recuerda el ultimo asiento (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    if (d.asiento) this._vistos.push(d.asiento);
    if (this._vistos.length > 1000) this._vistos.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // explicar(asiento|calculo) → { vista, sin_origen }
  // ══════════════════════════════════════════════════════════════════════
  async _explicar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const obj = input.asiento || input.calculo || input.objeto || null;
    if (!obj || typeof obj !== 'object') return this._invalid('asiento');

    // El origen puede venir declarado o traerse por EVENTO (best-effort, no bloquea la vista).
    const origen = await this._origenDe(input, obj);

    const lineas = this._lineasDe(obj);
    const explicadas = [];
    const sinOrigen = [];

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      const componentes = this._componentes(obj, l, origen);
      // La linea es explicable SOLO si declara al menos un componente de origen.
      const explicable = componentes.length > 0;
      const entrada = {
        linea: i + 1,
        cuenta: l.cuenta,
        debe: l.debe,
        haber: l.haber,
        origen: componentes,
        explicable
      };
      explicadas.push(entrada);
      if (!explicable) sinOrigen.push({ linea: i + 1, cuenta: l.cuenta });
    }

    // Origenes del propio asiento/calculo (a nivel de cabecera).
    const origenCabecera = [];
    for (const k of ORIGENES) if (obj[k] != null) origenCabecera.push({ campo: k, valor: obj[k] });

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'vista-revisable',
        titulo: input.titulo || obj.concepto || obj.titulo || null,
        lineas: explicadas,
        num_lineas: explicadas.length,
        origen: origen || null,
        origen_cabecera: origenCabecera,
        explicable: sinOrigen.length === 0 && explicadas.length > 0,
        caja_negra: false,
        determinista: true,
        abierto: {
          origen: origenCabecera.length ? null : 'el asiento/calculo no declaro su origen en la cabecera (se anota el hueco, no se inventa)',
          lineas_sin_origen: sinOrigen.length
            ? `${sinOrigen.length} linea(s) sin componente de origen declarado: la vista lo DICE, no lo oculta (no es caja negra)`
            : null
        }
      }
    };
  }

  // Trae la traza/el origen del asiento: declarado, o subido por EVENTO (best-effort, 800ms).
  async _origenDe(input, obj) {
    if (input.traza || input.origen) return input.traza || input.origen;
    const asiento_id = obj.id || obj.numero || obj.asiento_id || input.asiento_id;
    const resp = await this._rpc('traza-asiento.registrar.request', {
      project_id: input.project_id || this.project_id, asiento_id, consulta: true
    }, { timeout_ms: 800 });
    // Se acepta tanto una traza devuelta como su ausencia (best-effort: no se inventa).
    if (resp && (resp.registro || resp.traza)) return resp.registro || resp.traza;
    return null;
  }

  _lineasDe(obj) {
    const raw = Array.isArray(obj.lineas) ? obj.lineas : (Array.isArray(obj.apunte) ? obj.apunte : []);
    return raw.filter((l) => l && typeof l === 'object').map((l) => ({
      cuenta: l.cuenta != null ? String(l.cuenta) : null,
      debe: this._num(l.debe),
      haber: this._num(l.haber)
    }));
  }

  // Componentes de origen de una linea: los declarados en la linea o presentes en la cabecera del asiento.
  _componentes(obj, l, origen) {
    const comps = [];
    for (const k of ORIGENES) if (l && l[k] != null) comps.push({ campo: k, valor: l[k] });
    for (const k of ORIGENES) if (obj[k] != null && !comps.some((c) => c.campo === k)) comps.push({ campo: k, valor: obj[k] });
    if (origen) comps.push({ campo: 'traza', valor: origen });
    return comps;
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolExplicar(params) { return this._explicar(params); }
}

module.exports = VistaRevisable;
