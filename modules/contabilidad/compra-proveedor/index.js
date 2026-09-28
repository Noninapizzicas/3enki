/**
 * contabilidad/compra-proveedor — REFLEJO STATELESS (N5+N7, hoja del plan).
 *
 * La compra VERIFICADA antes de asentar: (N5) cotejo pedido <-> recepcion <->
 * factura — lo que NO cuadra va a la cola de revision (A8.1), jamas se asienta
 * "casi cuadrado"; (N7) ajuste del COSTE REAL por rappels, pronto-pago,
 * descuentos y anticipos — a lo realmente pagado. El ajuste SUMA, NUNCA borra
 * (invariante de correccion del dominio).
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated —
 * cada op entra objeto, sale objeto y el calculo es DETERMINISTA (mismas
 * entradas → mismo cotejo/ajuste; un test lo afirma). Las dependencias se leen
 * POR EVENTO, NUNCA por require cruzado:
 *   · maestro-terceros (N1) -> contabilidad.tercero.ficha.request  (opcional: la
 *     ficha del proveedor cuando el payload solo trae el NIF)
 *   · mayor-balanza (B3)     -> contabilidad.mayor.movimientos.request  (AUN NO
 *     EXISTE; solo se usa si el payload NO trae los anticipos ya asentados)
 * CONTRATO TOLERANTE: si mayor-balanza no esta viva no se fabrican anticipos;
 * el ajuste se calcula con lo DECLARADO en el payload y la ausencia se marca
 * (`anticipos_fuente: 'NO_DISPONIBLE'`). Nada de basura por relleno: si hay que
 * certificar "a lo realmente pagado" y falta la fuente, se publica
 * DEPENDENCIA_NO_DISPONIBLE. El cotejo es DECLARABLE: si el negocio declara que
 * no coteja (pieza [ABIERTO]), se asienta directo PERO SE DECLARA.
 *
 * Emisor/par de fallo: exito publica contabilidad.compra_cotejada; error su par
 * determinista. NO REUTILIZA: no existe cotejo compra/recepcion/factura en el
 * inventario.
 *
 * Ver hojas N5/N7 del diseno-oop y bloque `compra-proveedor` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tolerancia por defecto del cotejo (declarable; [ABIERTO] como parametro).
const TOLERANCIA_DEFECTO = 0.01;

class CompraProveedor extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'compra-proveedor';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onCotejarRequest(e) {
    return this._atender(e, 'cotejar', 'contabilidad.compra.cotejar.response', async (d) => {
      const res = await this._cotejar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.compra_cotejada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.compra.cotejar.failed', res);
      }
      return res;
    });
  }

  onCoste_realRequest(e) {
    return this._atender(e, 'coste_real', 'contabilidad.compra.coste_real.response', async (d) => {
      const res = await this._costeReal(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.compra_cotejada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.compra.coste_real.failed', res);
      }
      return res;
    });
  }

  // ── lectura de dependencias (por EVENTO, TOLERANTE) ──

  // Ficha del proveedor: del payload o pedida a maestro-terceros (N1) por EVENTO.
  // Si no responde NO se inventa: se sigue con lo que el payload declara.
  async _fichaProveedor(pid, input) {
    const inline = (input && input.proveedor) || null;
    if (inline && typeof inline === 'object') return { proveedor: inline, fuente: 'PAYLOAD' };
    const nif = (input && input.nif) || null;
    if (!nif) return { proveedor: null, fuente: 'SIN_NIF' };
    const resp = await this._rpc('contabilidad.tercero.identificar.request', { project_id: pid, nif }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200 || !resp.data) return { proveedor: null, fuente: 'NO_DISPONIBLE' };
    return { proveedor: { id_tercero: resp.data.id_tercero, nif: resp.data.nif }, fuente: 'MAESTRO_TERCEROS' };
  }

  // Anticipos ya asentados: del payload o de mayor-balanza (B3, AUN NO EXISTE) por EVENTO.
  async _anticiposAsentados(pid, input) {
    const inline = (input && (input.anticipos || input.anticipos_asentados)) || null;
    if (Array.isArray(inline)) return { anticipos: inline, fuente: 'PAYLOAD' };
    const resp = await this._rpc('contabilidad.mayor.movimientos.request', {
      project_id: pid, tercero: (input && input.id_tercero) || null
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200 || !resp.data) return { anticipos: [], fuente: 'NO_DISPONIBLE' };
    const movs = Array.isArray(resp.data.movimientos) ? resp.data.movimientos : [];
    return { anticipos: movs.filter((m) => m && m.anticipo === true), fuente: 'MAYOR_BALANZA' };
  }

  // ── proyecciones puras (deterministas) ──
  _importe(x) { return this._round(Number(x) || 0, 2); }

  // Importe de una linea (base o total con impuesto), segun lo que declare.
  _importeLinea(l) {
    const base = Number(l && (l.base ?? l.importe ?? l.precio));
    const cuota = Number(l && l.cuota);
    if (Number.isFinite(base) && Number.isFinite(cuota)) return this._round(base + cuota, 2);
    if (Number.isFinite(base)) return this._round(base, 2);
    return this._round(Number(l && l.total) || 0, 2);
  }

  // Cantidad de una linea (declarable: cantidad | uds | unidades).
  _cantidadLinea(l) {
    const c = Number(l && (l.cantidad ?? l.uds ?? l.unidades));
    return Number.isFinite(c) ? c : null;
  }

  // Clave de agrupacion de una linea (articulo/codigo/referencia/descripcion).
  _claveLinea(l) {
    return String((l && (l.articulo || l.codigo || l.referencia || l.descripcion || l.concepto)) || '').trim().toUpperCase() || null;
  }

  // cotejar(pedido, recepcion, factura) -> Cuadra | Descuadre (N5). Si el negocio
  // no coteja (declarable), se asienta directo y SE DECLARA.
  async _cotejar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const pedido = (input && input.pedido) || null;
    const recepcion = (input && input.recepcion) || null;
    const factura = (input && input.factura) || null;
    if (!factura || typeof factura !== 'object') return this._invalid('factura');
    if (!pedido && !recepcion) return this._invalid('pedido/recepcion');

    const proveedor = await this._fichaProveedor(pid, input);
    const t = Number(input && input.tolerancia);
    const tolerancia = Number.isFinite(t) && t >= 0 ? t : TOLERANCIA_DEFECTO;

    // DECLARABLE: hay negocios que no cotejan. Se asienta directo PERO SE DECLARA.
    const coteja = !(input && input.coteja === false);

    const resultado = this._comparar(pedido, recepcion, factura, tolerancia);

    return {
      status: 200,
      data: {
        op: 'cotejar',
        project_id: pid,
        proveedor: proveedor.proveedor,
        proveedor_fuente: proveedor.fuente,
        coteja,
        ...(coteja ? {} : { se_declara: true, nota: 'el negocio declara que NO coteja: se asienta directo y SE DECLARA' }),
        ...resultado,
        senal: (coteja && !resultado.cuadra) ? 'excepcion_a_cola_revision' : null,
        determinista: true
      }
    };
  }

  // Comparacion pura pedido <-> recepcion <-> factura.
  _comparar(pedido, recepcion, factura, tolerancia) {
    const lineasFactura = Array.isArray(factura.lineas) ? factura.lineas : [];
    const sumaFactura = this._round(lineasFactura.reduce((s, l) => s + this._importeLinea(l), 0), 2);

    const comparar = (contra, nombre) => {
      if (!contra) return { contra: nombre, disponible: false, cuadra: null, descuadre: null };
      const lineas = Array.isArray(contra.lineas) ? contra.lineas : [];
      const total = Number.isFinite(Number(contra.total))
        ? this._round(Number(contra.total), 2)
        : this._round(lineas.reduce((s, l) => s + this._importeLinea(l), 0), 2);
      const descuadre = this._round(this._round(total, 2) - sumaFactura, 2);
      return {
        contra: nombre,
        disponible: true,
        total: this._round(total, 2),
        descuadre,
        cuadra: Math.abs(descuadre) <= tolerancia,
        lineas: this._lineasDescuadradas(lineas, lineasFactura, tolerancia)
      };
    };

    const vsPedido = comparar(pedido, 'PEDIDO');
    const vsRecepcion = comparar(recepcion, 'RECEPCION');

    const cuadra = [vsPedido, vsRecepcion]
      .filter((x) => x.disponible)
      .every((x) => x.cuadra === true);

    const descuadres = [vsPedido, vsRecepcion].filter((x) => x.disponible && x.cuadra === false);

    return {
      cuadra,
      resultado: cuadra ? 'CUADRA' : 'DESCUADRE',
      suma_factura: sumaFactura,
      vs_pedido: vsPedido,
      vs_recepcion: vsRecepcion,
      descuadres,
      n_descuadres: descuadres.length,
      tolerancia
    };
  }

  // Diferencias por linea (cantidad e importe) entre una fuente y la factura.
  _lineasDescuadradas(lineasOrigen, lineasFactura, tolerancia) {
    const porClave = new Map();
    for (const l of lineasFactura) {
      const k = this._claveLinea(l);
      if (k) porClave.set(k, l);
    }
    const dif = [];
    for (const l of lineasOrigen) {
      const k = this._claveLinea(l);
      const f = k ? porClave.get(k) : null;
      const impO = this._importeLinea(l);
      const impF = f ? this._importeLinea(f) : 0;
      const descImp = this._round(impO - impF, 2);
      const co = this._cantidadLinea(l);
      const cf = f ? this._cantidadLinea(f) : null;
      const descCant = (co !== null && cf !== null) ? this._round(co - cf, 2) : null;
      if (Math.abs(descImp) > tolerancia || (descCant !== null && Math.abs(descCant) > 0)) {
        dif.push({ articulo: k, importe_origen: impO, importe_factura: impO - descImp, descuadre_importe: descImp, cantidad_origen: co, cantidad_factura: cf, descuadre_cantidad: descCant });
      }
    }
    return dif;
  }

  // ajustarCosteReal(factura) -> Importe a lo realmente pagado (N7); el ajuste SUMA.
  async _costeReal(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const factura = (input && (input.factura || input.asiento)) || null;
    if (!factura || typeof factura !== 'object') return this._invalid('factura');

    // Anticipos: del payload o de mayor-balanza (B3) por EVENTO (contrato TOLERANTE).
    const ant = await this._anticiposAsentados(pid, input);
    const exigeCertificacion = input && input.certificar === true;

    // Si hay que CERTIFICAR "a lo realmente pagado" y falta la fuente, no se
    // fabrican anticipos: se declara.
    if (exigeCertificacion && ant.fuente === 'NO_DISPONIBLE') {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'mayor-balanza (B3) no esta disponible: no se fabrican los anticipos del coste real', {
          dependencia: 'mayor-balanza', op: 'coste_real', accion: 'NO_FABRICAR_PUBLICAR_FALLO'
        });
    }

    const res = this._ajustarCosteReal(factura, input && input.descuentos, ant.anticipos);
    if (res.status !== 200) return res;

    return {
      status: 200,
      data: {
        op: 'coste_real',
        project_id: pid,
        ...res.data,
        anticipos_fuente: ant.fuente,
        anticipos_disponible: ant.fuente !== 'NO_DISPONIBLE',
        no_borra: true,
        suma: true
      }
    };
  }

  // Puro: ajustarCosteReal(factura, descuentos, anticipos) -> Importe real (N7).
  // descuentos/rappels/pronto-pago/anticipos ajustan el coste; el ajuste SUMA.
  _ajustarCosteReal(factura, descuentos, anticipos) {
    const f = factura || {};
    const lineas = Array.isArray(f.lineas) ? f.lineas : [];
    const bruto = Number.isFinite(Number(f.total))
      ? this._round(Number(f.total), 2)
      : this._round(lineas.reduce((s, l) => s + this._importeLinea(l), 0), 2);

    const listaDesc = Array.isArray(descuentos) ? descuentos : [];
    const totalDescuentos = this._round(listaDesc.reduce((s, d) => s + (Number(d && (d.importe ?? d.importe_total ?? d.valor)) || 0), 0), 2);

    const listaAnt = Array.isArray(anticipos) ? anticipos : [];
    const totalAnticipos = this._round(listaAnt.reduce((s, a) => s + Math.abs(Number(a && (a.importe ?? a.total)) || 0), 0), 2);

    const neto = this._round(bruto - totalDescuentos - totalAnticipos, 2);

    return {
      status: 200,
      data: {
        factura: f.factura || f.documento || f.id || null,
        coste_bruto: bruto,
        descuentos: listaDesc.map((d) => ({ tipo: (d && (d.tipo || d.concepto)) || 'DESCUENTO', importe: this._round(Number(d && (d.importe ?? d.valor)) || 0, 2) })),
        total_descuentos: totalDescuentos,
        anticipos: listaAnt.map((a) => ({ id_asiento: (a && (a.asiento || a.id_asiento)) || null, importe: this._round(Math.abs(Number(a && (a.importe ?? a.total)) || 0), 2) })),
        total_anticipos: totalAnticipos,
        coste_real: neto,
        ajuste: this._round(bruto - neto, 2),
        signo_ajuste: 'SUMA',
        no_borra: true,
        determinista: true
      }
    };
  }

  // ── Tools ──
  toolCotejar(params) { return this._cotejar(params); }
  toolCosteReal(params) { return this._costeReal(params); }
  toolAjustarCosteReal(params) { return this._ajustarCosteReal(params.factura, params.descuentos, params.anticipos); }
}

module.exports = CompraProveedor;
