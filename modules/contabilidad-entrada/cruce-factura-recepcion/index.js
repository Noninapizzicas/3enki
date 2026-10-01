/**
 * contabilidad-entrada/cruce-factura-recepcion — REFLEJO STATELESS (N5, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * COTEJA pedido <-> recepcion <-> factura ANTES DE ASENTAR; lo que no cuadra -> COLA.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * El hecho de una compra llega con TRES caras (lo pedido, lo recibido, lo facturado). Este
 * control comprueba que las tres concuerdan (importes y, si vienen, cantidades) ANTES de que
 * el asiento entre en el libro.
 *
 * DECISION DETERMINISTA:
 *   · todo cuadra        → devuelve `cuadra:true` y SUBE best-effort el asiento a escritor-diario
 *                          (escritor-diario.asentar.request). El asiento lo asienta el custodio,
 *                          NUNCA este modulo.
 *   · algo NO cuadra     → SUBE encolado-excepcion.encolar.request (la cola A8.1). NO se asienta
 *                          lo que no cuadra y NO se fuerza el cotejo.
 *   · falta una cara     → no verificable: NO se inventa el cotejo (dato ausente = desconocido);
 *                          si falta factura o recepcion NO se lleva a cola por adivinar, se declara ABIERTO.
 *
 * Invariante: un cotejo que "arregla" la diferencia para cuadrar es un cotejo que miente. La
 * diferencia se declara con las dos cifras, no se reparte.
 *
 * ESCUCHA (R3): contabilidad.hecho_recibido, emitido por puerto-evento-vertical (A1) → emisor vivo.
 * R2 · no aplica: no escribe el libro. SUBE asentar.request (a B2) y encolar.request (a A8.1).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia. RPC cotejar es CLASE PREGUNTA → SIN ui_handler.
 * Ver hoja N5 del plan-construccion y diseno-oop.md (CLASE CruceFacturaRecepcion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const EPSILON = 0.005;

class CruceFacturaRecepcion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cruce-factura-recepcion';
    this.version = 'reflejo-0.1.0';
    // Hechos observados por proyecto (memoria acotada, no store).
    this._hechos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onCotejarRequest(e) {
    return this._atender(e, 'cotejar', 'cruce-factura-recepcion.cotejar.response', (d) => {
      const res = this._cotejar(d);
      if (res.status === 200) {
        if (res.data.cuadra === true && res.data.caras_completas) {
          // Todo cuadra: SUBE best-effort el asiento a escritor-diario (B2), que es quien asienta.
          this.eventBus?.publish('escritor-diario.asentar.request', {
            project_id: res.data.project_id,
            asiento: res.data.asiento || res.data.documento,
            origen: 'cruce-factura-recepcion',
            correlation_id: d.correlation_id
          });
        } else if (res.data.cuadra === false) {
          // NO cuadra: se sube a la cola (A8.1). No se asienta mal.
          this.eventBus?.publish('encolado-excepcion.encolar.request', {
            project_id: res.data.project_id,
            rol: 'CRUCE_FACTURA_RECEPCION',
            clave: res.data.clave || `cruce:${res.data.hecho_id || 's/ref'}`,
            motivo: 'pedido/recepcion/factura NO cotejan: no se asienta',
            origen: 'cruce-factura-recepcion',
            payload: { pendiente: res.data.pendiente, diferencia: res.data.diferencia },
            correlation_id: d.correlation_id
          });
        }
        // Falta una cara → no verificable: no se asienta ni se encola (no se adivina).
      } else {
        this.eventBus?.publish('cruce-factura-recepcion.cotejar.failed', res);
      }
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): llego un hecho → se observa (ventana acotada) ──
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const lista = this._hechos.get(pid) || [];
    lista.push(d.hecho || d);
    if (lista.length > 1000) lista.shift();
    this._hechos.set(pid, lista);
  }

  // ══════════════════════════════════════════════════════════════════════
  // _cotejar(input) → { status, data }  ·  cotejo determinista de las tres caras
  // ══════════════════════════════════════════════════════════════════════
  _cotejar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = input.hecho && typeof input.hecho === 'object' ? input.hecho : input;
    const pedido = this._cara(input, hecho, ['pedido', 'orden', 'orden_compra', 'solicitado']);
    const recepcion = this._cara(input, hecho, ['recepcion', 'recepción', 'recibido', 'albaran', 'albarán', 'entrega']);
    const factura = this._cara(input, hecho, ['factura', 'facturado', 'invoice']);

    const faltan = [];
    if (!pedido) faltan.push('pedido');
    if (!recepcion) faltan.push('recepcion');
    if (!factura) faltan.push('factura');

    const hecho_id = hecho.hecho_id != null ? String(hecho.hecho_id)
      : (input.hecho_id != null ? String(input.hecho_id) : null);
    const clave = input.clave != null ? String(input.clave)
      : (hecho.clave != null ? String(hecho.clave) : null);

    // Sin las tres caras NO se inventa un cotejo: no verificable (dato ausente = desconocido).
    if (faltan.length > 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'cruce-factura-recepcion',
          hecho_id,
          clave,
          cuadra: null,
          verificable: false,
          caras_completas: false,
          faltan,
          importe_pedido: null,
          importe_recepcion: null,
          importe_factura: null,
          diferencia: null,
          abierto: { caras: `faltan caras declaradas (${faltan.join(', ')}): el cotejo no es verificable (no se inventa)` }
        }
      };
    }

    const imp_pedido = this._importe(pedido);
    const imp_recepcion = this._importe(recepcion);
    const imp_factura = this._importe(factura);

    const diferencias = [];
    const d_pr = this._round((imp_pedido || 0) - (imp_recepcion || 0), 2);
    const d_rf = this._round((imp_recepcion || 0) - (imp_factura || 0), 2);
    if (Math.abs(d_pr) > EPSILON) diferencias.push({ par: 'pedido_vs_recepcion', diferencia: d_pr });
    if (Math.abs(d_rf) > EPSILON) diferencias.push({ par: 'recepcion_vs_factura', diferencia: d_rf });

    // Si vienen cantidades, se cotejan tambien (dato declarable).
    const cantidades = this._cotejaCantidades(pedido, recepcion, factura);
    for (const c of cantidades) diferencias.push(c);

    const cuadra = diferencias.length === 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'cruce-factura-recepcion',
        hecho_id,
        clave,
        importe_pedido: imp_pedido,
        importe_recepcion: imp_recepcion,
        importe_factura: imp_factura,
        diferencia: this._round((imp_pedido || 0) - (imp_factura || 0), 2),
        pendiente: cuadra ? null : this._round((imp_factura || 0) - (imp_recepcion || 0), 2),
        cuadra,
        verificable: true,
        caras_completas: true,
        determinista: true,
        formula: 'importe_pedido == importe_recepcion == importe_factura (tolerancia de centimos)',
        diferencias: diferencias.length ? diferencias : null,
        // NO se fuerza el cotejo: cuadra → asienta (best-effort); no cuadra → cola.
        asiento: hecho.asiento || input.asiento || null,
        documento: hecho.documento || input.documento || null,
        abierto: {
          importes: (imp_pedido !== null && imp_recepcion !== null && imp_factura !== null) ? null
            : 'alguna cara no declaro importe: el cotejo de importes no es pleno'
        }
      }
    };
  }

  // Toma una cara declarada (del input directo o dentro del hecho). Ausente → null.
  _cara(input, hecho, claves) {
    for (const k of claves) {
      if (input[k] && typeof input[k] === 'object') return input[k];
      if (hecho[k] && typeof hecho[k] === 'object') return hecho[k];
    }
    return null;
  }

  _importe(cara) {
    if (!cara || typeof cara !== 'object') return null;
    return this._num(cara.importe ?? cara.total ?? cara.importe_total ?? cara.base);
  }

  // Cotejo de cantidades (solo si las tres las declaran): diferencia != 0 → hallazgo.
  _cotejaCantidades(pedido, recepcion, factura) {
    const out = [];
    const cp = this._cantidad(pedido);
    const cr = this._cantidad(recepcion);
    const cf = this._cantidad(factura);
    if (cp !== null && cr !== null && Math.abs(this._round(cp - cr, 4)) > 1e-9) out.push({ par: 'cantidad_pedido_vs_recepcion', diferencia: this._round(cp - cr, 4) });
    if (cr !== null && cf !== null && Math.abs(this._round(cr - cf, 4)) > 1e-9) out.push({ par: 'cantidad_recepcion_vs_factura', diferencia: this._round(cr - cf, 4) });
    return out;
  }

  _cantidad(cara) {
    if (!cara || typeof cara !== 'object') return null;
    const v = cara.cantidad ?? cara.unidades ?? cara.cantidad_total;
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCotejar(params) { return this._cotejar(params); }
}

module.exports = CruceFacturaRecepcion;
