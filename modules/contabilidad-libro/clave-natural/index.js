/**
 * contabilidad-libro/clave-natural — REFLEJO STATELESS (M3, hoja del plan).
 *
 * El CERROJO ANTI-BUCLE de la contabilidad: da la clave natural de un hecho o de un
 * cierre, de forma DETERMINISTA, para que reprocesar NO duplique ("un cierre = un
 * asiento"). Es la base de la idempotencia de todo el libro: `deduplicacion-hecho`
 * (A7) la aplica; el escritor del diario la usa como llave del asiento.
 *
 * La composicion de la clave es DECLARABLE (`composicion`: campos + normalizacion +
 * separador + prefijo). Sin declararla, se usa una composicion por defecto sobre los
 * campos presentes; los campos declarados que NO llegan no desaparecen en silencio:
 * se listan en `abierto` y la clave se marca `completa:false`. Nada se estima.
 *
 * Invariantes:
 *  - Misma entrada → misma clave. SIEMPRE. Cero azar, cero estado, cero reloj.
 *  - `calcular` es PURO: calcular dos veces el mismo hecho da la misma clave (idempotencia).
 *  - `coincide` es simetrica y determinista: a y b con la misma clave natural SON el mismo hecho.
 *  - No escribe ni recuerda: es un reflejo. Quien recuerda es deduplicacion-hecho (A7).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja M3 del plan-construccion y diseno-oop.md (CLASE ClaveNatural).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Composicion por defecto (declarable). El orden ES la identidad: cambiarlo cambia la clave.
const CAMPOS_DEFECTO = ['vertical', 'tipo', 'tercero', 'fecha', 'importe', 'referencia'];

class ClaveNatural extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'clave-natural';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'clave-natural.calcular.response', async (d) => {
      const res = this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('clave-natural.calcular.failed', res);
      return res;
    });
  }

  onCoincideRequest(e) {
    return this._atender(e, 'coincide', 'clave-natural.coincide.response', async (d) => {
      const res = this._coincide(d);
      if (res.status !== 200) this.eventBus?.publish('clave-natural.coincide.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: calcular(hecho) → ClaveNatural ──
  _calcular(input = {}) {
    const sujeto = input.hecho || input.cierre || input.sujeto || input.h;
    if (!sujeto || typeof sujeto !== 'object') return this._invalid('hecho');

    const pid = input.project_id || this.project_id || null;

    // Composicion DECLARABLE. Sin declarar → la de defecto (y se declara asi).
    const declarada = Boolean(input.composicion && typeof input.composicion === 'object');
    const campos = this._campos(declarada ? input.composicion.campos : null);
    const normalizacion = declarada && input.composicion.normalizacion
      ? String(input.composicion.normalizacion).toLowerCase() : 'defecto';
    const separador = declarada && input.composicion.separador != null
      ? String(input.composicion.separador) : '|';
    const prefijo = declarada && input.composicion.prefijo != null
      ? String(input.composicion.prefijo) + separador : '';

    const abierto = [];
    const partes = [];
    for (const campo of campos) {
      const raw = this._leerRuta(sujeto, campo);
      if (raw === undefined || raw === null || raw === '') {
        abierto.push(campo);            // [ABIERTO] — no se estima ni se rellena
        partes.push('');
        continue;
      }
      partes.push(this._normaliza(raw, campo, normalizacion));
    }

    const cuerpo = partes.join(separador);
    const completa = abierto.length === 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        // Clave legible (auditable) y su sello estable (unico, insensible a longitud).
        clave: prefijo + cuerpo,
        sello: this._sello(prefijo + cuerpo),
        composicion: { campos, normalizacion, separador, prefijo: prefijo ? prefijo.slice(0, -separador.length) : '' },
        composicion_declarada: declarada,
        completa,
        abierto
      }
    };
  }

  // ── proyeccion determinista: coincide(a, b) → bool ──
  _coincide(input = {}) {
    const a = input.a || input.hecho_a;
    const b = input.b || input.hecho_b;
    if (!a || typeof a !== 'object') return this._invalid('a');
    if (!b || typeof b !== 'object') return this._invalid('b');

    const pid = input.project_id || this.project_id || null;
    const composicion = input.composicion && typeof input.composicion === 'object' ? input.composicion : undefined;

    const ra = this._calcular({ project_id: pid, hecho: a, composicion });
    const rb = this._calcular({ project_id: pid, hecho: b, composicion });
    if (ra.status !== 200) return ra;
    if (rb.status !== 200) return rb;

    const coinciden = ra.data.clave === rb.data.clave;

    return {
      status: 200,
      data: {
        project_id: pid,
        coinciden,
        // Un hecho = un asiento: misma clave natural → ES el mismo hecho (idempotencia).
        es_mismo_hecho: coinciden,
        clave_a: ra.data.clave,
        clave_b: rb.data.clave,
        sello_a: ra.data.sello,
        sello_b: rb.data.sello,
        completa: ra.data.completa && rb.data.completa,
        abierto: [...new Set([...ra.data.abierto, ...rb.data.abierto])]
      }
    };
  }

  // Campos declarados normalizados a lista no vacia; sin declarar → los de defecto.
  _campos(raw) {
    if (!Array.isArray(raw)) return [...CAMPOS_DEFECTO];
    const campos = raw.map(c => String(c).trim()).filter(Boolean);
    return campos.length ? campos : [...CAMPOS_DEFECTO];
  }

  // Normalizacion MECANICA por campo (declarable). No aplica ninguna ley fiscal.
  _normaliza(raw, campo, normalizacion) {
    if (normalizacion === 'crudo') return this._crudo(raw);
    if (typeof raw === 'object') return this._crudo(raw);
    const s = String(raw).trim();
    if (normalizacion === 'minusculas') return s.toLowerCase();
    if (normalizacion === 'mayusculas') return s.toUpperCase();
    // 'defecto': fechas ISO a fecha; importes a 2 decimales; identificadores en mayusculas.
    if (/fecha|date|vencimiento/i.test(campo)) {
      const t = Date.parse(s);
      return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : s.toUpperCase();
    }
    if (/importe|total|base|cuota|saldo/i.test(campo)) {
      const n = Number(s.replace(',', '.'));
      return Number.isFinite(n) ? this._round(n, 2).toFixed(2) : s.toUpperCase();
    }
    return s.toUpperCase().replace(/[\s.\-_/]/g, '');
  }

  // Un valor compuesto (tercero:{nif,...}) no se aplasta a "[object Object]": se
  // serializa CANONICAMENTE (claves ordenadas) para que la clave siga siendo determinista.
  _crudo(raw) {
    if (raw === undefined || raw === null) return '';
    if (typeof raw !== 'object') return String(raw).trim();
    if (Array.isArray(raw)) return raw.map(v => this._crudo(v)).join(',');
    return Object.keys(raw).sort().map(k => `${k}=${this._crudo(raw[k])}`).join('&');
  }

  // Sello estable: hash corto de la clave (para llaves de mapa, no para auditar).
  _sello(clave) {
    return crypto.createHash('sha1').update(clave, 'utf8').digest('hex').slice(0, 16);
  }

  _leerRuta(obj, ruta) {
    if (!obj || !ruta) return undefined;
    return String(ruta).split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
  toolCoincide(params) { return this._coincide(params); }
}

module.exports = ClaveNatural;
