/**
 * contabilidad-libro/puerto-extracto — CONVERSOR STATELESS (E2, hoja del plan).
 *
 * FRONTERA de CANAL/FORMATO del EXTRACTO BANCARIO. Un ADAPTADOR por BANCO; si falta,
 * se CREA (declarandolo). Aqui solo se traduce la FORMA, no se decide CONTENIDO.
 *
 * LA LEY / EL CANAL ENTRA COMO DATO: el `banco`/`formato` y el `mapeo` (campo canonico
 * → clave externa) son DECLARABLES. NO hay NINGUN esquema cableado (ni OFX, ni N43, ni
 * CSV). Sin canal/formato declarado NO se traduce; si el formato no tiene `mapeo`
 * declarado y no es el canonico → 422 FORMATO_NO_DECLARABLE.
 *
 * Invariante: dato ausente = desconocido. Un movimiento con campos que no vienen del
 * exterior los deja `null` y se declaran en `abierto` (jamas se estiman).
 *
 * NO concilia (eso es `conciliacion-bancaria` E1): si los movimientos son interpretables,
 * los SUBE por EVENTO a `conciliacion-bancaria.cruzar.request`.
 *
 * Forma: CONVERSOR → STATELESS. Sin PosPersistencia. PREGUNTA (entrar) → sin ui_handler.
 * Ver hoja E2 del plan-construccion y diseno-oop.md (CLASE PuertoExtracto).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos de un MOVIMIENTO bancario. Su ORIGEN externo es declarable (mapeo).
const CAMPOS_MOVIMIENTO = ['fecha', 'concepto', 'importe', 'saldo', 'referencia', 'divisa'];

class PuertoExtracto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-extracto';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (PREGUNTA → sin ui_handler) ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'puerto-extracto.entrar.response', async (d) => {
      const res = this._entrar(d);
      // Conversor puro: no escribe → no hay hecho que anunciar. Su cara es el bus.
      if (res.status !== 200) this.eventBus?.publish('puerto-extracto.entrar.failed', res);
      // Si los movimientos son interpretables, se encadenan a conciliacion (best-effort).
      else this._encadenar(res, d);
      return res;
    });
  }

  // ── entrar: extracto externo → movimientos canonicos ──
  _entrar(input = {}) {
    const banco = this._banco(input);
    const formato = this._formato(input, banco);
    if (!formato) {
      return this._errorResponse(400, 'FORMATO_NO_DECLARADO',
        'hay que declarar el canal/banco o el formato del extracto', { esquemas_declarables: this._esquemas(input) });
    }
    const externo = input.extracto || input.externo;
    if (!externo || typeof externo !== 'object') return this._invalid('extracto');

    const mapeo = this._mapeoDe(input, formato, this._esquemas(input));
    if (!mapeo) {
      return this._errorResponse(422, 'FORMATO_NO_DECLARABLE',
        'formato no declarable: declara `mapeo` (campo canonico → clave externa) o un `esquema` declarado',
        { banco, formato, esquemas_declarables: this._esquemas(input) });
    }

    // La lista de movimientos: declarada como array, o bajo la clave de lista del externo.
    const raw = Array.isArray(externo)
      ? externo
      : (Array.isArray(externo[mapeo.movimientos != null ? String(mapeo.movimientos) : 'movimientos'])
          ? externo[mapeo.movimientos != null ? String(mapeo.movimientos) : 'movimientos']
          : null);
    if (!raw) return this._invalid('extracto.movimientos');

    const movimientos = [];
    const faltantes = new Set();
    for (const m of raw) {
      const mov = {};
      for (const campo of CAMPOS_MOVIMIENTO) {
        const clave = mapeo[campo] != null ? String(mapeo[campo]) : campo;
        const v = m ? m[clave] : undefined;
        if (v === undefined || v === null || v === '') { mov[campo] = null; faltantes.add(campo); }
        else mov[campo] = v;
      }
      // Importe normalizado a numero SOLO si viene (no se estima); la moneda se conserva.
      mov.importe = mov.importe === null ? null : this._num(mov.importe);
      movimientos.push(mov);
    }

    return {
      status: 200,
      data: {
        project_id: input.project_id || this.project_id || null,
        banco,
        formato,
        direccion: 'entrar',
        movimientos,
        total: movimientos.length,
        adaptador_declarado: Boolean(input.mapeo),
        // Cruza FORMATO, no decide CONTENIDO: se declara que no se concilio nada.
        conciliado: false,
        abierto: [...faltantes]
      }
    };
  }

  // La frontera TRADUCE; si hay movimientos interpretables los sube a conciliacion-bancaria
  // (E1) por EVENTO, que es quien CRUZA. No se inventa nada.
  _encadenar(res, d) {
    const movimientos = res.data.movimientos || [];
    if (!movimientos.length) return;
    try {
      this.eventBus?.publish('conciliacion-bancaria.cruzar.request', {
        project_id: res.data.project_id,
        banco: res.data.banco,
        movimientos,
        origen: 'puerto-extracto',
        correlation_id: d.correlation_id
      });
    } catch (_) { /* best-effort */ }
  }

  _banco(input = {}) {
    const b = input.banco != null ? String(input.banco).trim() : '';
    return b || null;
  }

  _formato(input = {}, banco) {
    const f = input.formato != null ? String(input.formato).trim() : (banco || '');
    return f || null;
  }

  _esquemas(input = {}) {
    return Array.isArray(input.esquemas_declarables)
      ? input.esquemas_declarables.map((f) => String(f)).filter(Boolean)
      : [];
  }

  _mapeoDe(input, formato, esquemas) {
    if (input.mapeo && typeof input.mapeo === 'object') return input.mapeo;
    const canonico = formato === 'canonico' || formato === 'enki';
    if (canonico || esquemas.includes(formato)) {
      const identidad = {};
      for (const c of CAMPOS_MOVIMIENTO) identidad[c] = c;
      identidad.movimientos = 'movimientos';
      return identidad;
    }
    return null;
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

  // ── Tools ──
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = PuertoExtracto;
