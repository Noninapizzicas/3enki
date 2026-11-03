'use strict';

/**
 * cuenta-parte · REFLEJO · PLAZA — Q01 (EstadoCuentaParte) + M01 (CarteraRider).
 *
 * LA CUENTA DE CADA PARTE: qué debe, qué se le debe y su cartera. Es una PROYECCIÓN sobre devengos,
 * documentos y cobros — no un libro paralelo. Y no guarda nada: si guardara, habría dos verdades del
 * dinero y una de las dos estaría vieja.
 *
 *   1. CADA IMPORTE APUNTA A UN HECHO: un pedido aceptado, un cierre, un documento, un cargo con
 *      evidencia. Lo que no consta se muestra como «sin evidencia», NUNCA como cero: un cero es una
 *      cuenta saldada sin que nadie pagara (Q28).
 *   2. LA CUENTA ES DE ESTA PLAZA. Un rider en dos plazas tiene dos cuentas y dos carteras (§7.9,
 *      Q45): se piden a la plaza en la que se pregunta, y la de al lado no se ve desde aquí.
 *   3. EL CLIENTE FINAL NO TIENE CUENTA: no es parte de nada (Q01).
 *
 * Sin store y sin PosPersistencia. Todo lo que necesita lo pide al bus y el dato vuelve en la
 * response: `liquidacion.de` (devengo), `cargo-fallo.de` (deudas), `factura-gestion.de` (documento),
 * `pago-gateway` (el cobro de verdad, por su recibo) y `hechos-reparto.acta` (ganado / reclamado).
 *
 * Isla: cero require a otra isla.
 */

const ModuloBocaos = require('../_bocaos');

const TIMEOUT_MS = 2500;
const LOTE = 8;

class CuentaParte extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'cuenta-parte';
    this.version = 'reflejo-0.1.0';
    this._path = null;                     // sin store: es un cálculo, no un libro
  }

  // ================= RPC del bus (una línea por op) =================
  onVerRequest(e) { return this.servir(e, 'ver', 'cuenta-parte.ver', (d) => this._ver(d)); }
  onCarteraRequest(e) { return this.servir(e, 'cartera', 'cuenta-parte.cartera', (d) => this._cartera(d)); }

  // ================= Q01 · ver =================
  async _ver(d) {
    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    if (!plaza_id) return this._invalid('project_id');
    if (!d.parte_id) return this._invalid('parte_id');

    // Q01 · el cliente final no es una parte: no tiene cuenta.
    if (d.parte === 'cliente' || d.rol === 'cliente') {
      return this._errorResponse(409, 'NO_ES_PARTE',
        'el cliente final no tiene cuenta en la plaza: no es parte de nada (Q01)', { field: 'parte_id' });
    }

    const periodo = d.periodo || null;
    const [devengo, cartera] = await Promise.all([
      this._devengoDe(plaza_id, d.parte_id, periodo),
      Promise.resolve(null)
    ]);
    if (devengo.estado === 'NO_EXISTE') {
      return this._errorResponse(404, 'PARTE_NO_CONSTA',
        'esa parte no tiene devengo en esta plaza para ese periodo',
        { field: 'parte_id', periodo, hueco: devengo.motivo });
    }

    const [cargos, documento, cobro] = await Promise.all([
      this._cargosDe(plaza_id, d.parte_id),
      this._documentoDe(plaza_id, d.parte_id, periodo, devengo),
      this._cobroDe(plaza_id, d.parte_id, periodo, devengo, d)
    ]);

    const seguro = Number.isInteger(devengo.total_seguro_centimos) ? devengo.total_seguro_centimos : null;
    const enDuda = Number.isInteger(devengo.variable_en_duda_centimos) ? devengo.variable_en_duda_centimos : null;
    const facturado = documento.total_centimos;
    const cobrado = cobro.importe_centimos;

    return {
      status: 200,
      data: {
        parte_id: d.parte_id,
        parte: devengo.parte || cartera,
        plaza_id,
        periodo,
        cierre_id: devengo.cierre_id || null,
        // La versión de tramos que estaba viva: la cuenta no cambia sola a fin de mes (E06).
        tramo: { tramo: devengo.tramo ?? null, version: devengo.version ?? null, contrato_id: devengo.contrato_id || null },
        devengado: {
          seguro_centimos: seguro,
          en_duda_centimos: enDuda,
          fijo_periodo_centimos: Number.isInteger(devengo.fijo_periodo_centimos) ? devengo.fijo_periodo_centimos : null,
          fijo_estado: devengo.fijo_estado || 'NO_CONSTA',
          estado: devengo.total_seguro_estado || 'NO_CONSTA',
          detalle: devengo.detalle || [],
          motivo: devengo.motivo || devengo.motivo_fijo || null
        },
        facturado: {
          documento_id: documento.documento_id,
          importe_centimos: facturado,
          estado: documento.estado,
          motivo: documento.motivo
        },
        cobrado: {
          importe_centimos: cobrado,
          estado: cobro.estado,
          fuente: cobro.fuente,
          motivo: cobro.motivo
        },
        deuda: {
          // G04/Q29 · deudas con nombre y evidencia; el importe puede no constar y se dice.
          cargos: cargos.map((c) => ({
            cargo_id: c.cargo_id,
            de: c.deudor?.parte_id || null,
            a: c.acreedor?.parte_id || null,
            sentido: c.deudor?.parte_id === d.parte_id ? 'debe' : 'le_deben',
            importe_centimos: c.importe_centimos === undefined ? null : c.importe_centimos,
            importe_estado: c.importe_estado || 'NO_CONSTA',
            evidencia: c.evidencia || [],
            estado: c.estado || 'ANOTADO'
          })),
          total_centimos: this._totalCargos(cargos),
          total_estado: this._totalCargos(cargos) === null ? 'NO_CONSTA' : 'SUMA'
        },
        // Q01 · pendiente y saldo: sólo si los dos términos constan. Ni un 0 que finja cuadrar.
        pendiente_centimos: this._resta(facturado, cobrado),
        pendiente_estado: this._resta(facturado, cobrado) === null ? 'NO_CONSTA' : 'SUMA',
        saldo_centimos: this._resta(seguro, cobrado),
        saldo_estado: this._resta(seguro, cobrado) === null ? 'NO_CONSTA' : 'SUMA',
        nota: 'cada importe apunta a un hecho; lo que no consta se dice, no se pone a cero (Q01)'
      }
    };
  }

  // ================= M01 · cartera =================
  async _cartera(d) {
    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    if (!plaza_id) return this._invalid('project_id');
    const rider_id = d.rider_id || d.parte_id;
    if (!rider_id) return this._invalid('rider_id');

    const devengo = await this._devengoDe(plaza_id, rider_id, d.periodo || null);
    if (devengo.estado === 'NO_EXISTE') {
      return this._errorResponse(404, 'PARTE_NO_CONSTA',
        'ese rider no tiene devengo en ESTA plaza para ese periodo: una cartera por plaza (§7.9)',
        { field: 'rider_id', hueco: devengo.motivo });
    }

    const detalle = devengo.detalle || [];
    // M01 · ganado (contrato cerrado CON prueba) · reclamado (entregado sin prueba, Q30) · pendiente.
    const actas = await this._enLotes(detalle.map((x) => this._rpc('hechos-reparto.acta.request', {
      project_id: plaza_id, pedido_id: x.pedido_id
    }, { timeout_ms: TIMEOUT_MS })));

    let ganado = 0; let reclamado = 0; let pendiente = 0;
    let ganadoConocido = true; let reclamadoConocido = true; let pendienteConocido = true;
    // Si a UN pedido le falta el acta, las tres cifras dejan de constar: un 0 diría «no ha ganado
    // nada», y lo que pasa es que no se sabe (M01: no se estima).
    let haySinActa = false;
    const pedidos = detalle.map((x, i) => {
      const r = actas[i];
      const acta = r && r.data && r.data.acta ? r.data.acta : null;
      const precio = Number.isInteger(x.precio_cents) ? x.precio_cents : null;
      let clasificacion;
      if (!acta) {
        clasificacion = 'SIN_ACTA';
        haySinActa = true;
      } else if (acta.completa && acta.prueba && !acta.prueba.falta) {
        clasificacion = 'GANADO';
        if (precio === null) ganadoConocido = false; else ganado += precio;
      } else if (acta.entrega) {
        // Q30 [ABIERTO] · entregado sin prueba: RECLAMADO, no ganado. No se presume.
        clasificacion = 'RECLAMADO';
        if (precio === null) reclamadoConocido = false; else reclamado += precio;
      } else {
        clasificacion = 'PENDIENTE';
        if (precio === null) pendienteConocido = false; else pendiente += precio;
      }
      return {
        pedido_id: x.pedido_id, precio_cents: precio, clasificacion,
        en_duda_cuota: x.estado === 'en_duda',
        motivo: clasificacion === 'RECLAMADO' ? 'entregado sin prueba: reclamado (Q30 [ABIERTO])'
          : (clasificacion === 'SIN_ACTA' ? 'sin acta del reparto: no consta' : null)
      };
    });

    if (haySinActa) { ganadoConocido = false; reclamadoConocido = false; pendienteConocido = false; }

    const cargos = await this._cargosDe(plaza_id, rider_id);
    const deudas = this._totalCargos(cargos);
    // La cuota que el rider debe a la plaza en el periodo (su lado del contrato).
    const cuota = Number.isInteger(devengo.total_seguro_centimos) ? devengo.total_seguro_centimos : null;

    const neto = (ganadoConocido && cuota !== null && deudas !== null)
      ? ganado - cuota - deudas : null;

    return {
      status: 200,
      data: {
        rider_id,
        plaza_id,
        periodo: d.periodo || null,
        cierre_id: devengo.cierre_id || null,
        // M01 · una cartera por plaza: dos plazas, dos carteras, dos ciclos y dos moras (Q45).
        cartera: 'esta plaza',
        ganado_centimos: ganadoConocido ? ganado : null,
        ganado_estado: ganadoConocido ? 'SUMA' : 'NO_CONSTA',
        reclamado_centimos: reclamadoConocido ? reclamado : null,
        reclamado_estado: reclamadoConocido ? 'SUMA' : 'NO_CONSTA',
        pendiente_centimos: pendienteConocido ? pendiente : null,
        pendiente_estado: pendienteConocido ? 'SUMA' : 'NO_CONSTA',
        cuota_centimos: cuota,
        cuota_estado: cuota === null ? 'NO_CONSTA' : 'SUMA',
        deudas_centimos: deudas,
        deudas_estado: deudas === null ? 'NO_CONSTA' : 'SUMA',
        deudas: cargos.map((c) => ({
          cargo_id: c.cargo_id, importe_centimos: c.importe_centimos,
          importe_estado: c.importe_estado, estado: c.estado
        })),
        // neto = ganado − cuota de la plaza − cargos. Si falta un término, no hay neto.
        neto_centimos: neto,
        neto_estado: neto === null ? 'NO_CONSTA' : 'SUMA',
        pedidos,
        no_estima: 'no hay propinas ni «ganancias potenciales»: sólo lo que consta (M01)'
      }
    };
  }

  // ================= el devengo, del sitio donde vive =================
  async _devengoDe(plaza_id, parte_id, periodo) {
    const r = await this._rpc('liquidacion.de.request', {
      project_id: plaza_id, parte_id, periodo: periodo || undefined
    }, { timeout_ms: TIMEOUT_MS });
    if (!r) return { estado: 'NO_EXISTE', motivo: 'liquidacion no contestó: no consta el devengo' };
    if (typeof r.status === 'number' && r.status >= 400) {
      return { estado: 'NO_EXISTE', motivo: r.error?.message || 'sin devengo para esa parte' };
    }
    if (!r.data || !r.data.devengo) return { estado: 'NO_EXISTE', motivo: 'sin devengo congelado para ese periodo' };
    return { ...r.data.devengo, estado: 'CONSTA', cierre_id: r.data.cierre_id || null };
  }

  async _cargosDe(plaza_id, parte_id) {
    const r = await this._rpc('cargo-fallo.de.request', { project_id: plaza_id, parte_id }, { timeout_ms: TIMEOUT_MS });
    if (!r || typeof r.status === 'number' && r.status >= 400) return [];
    return (r.data && Array.isArray(r.data.cargos)) ? r.data.cargos.filter((c) => c.estado !== 'ANULADO') : [];
  }

  async _documentoDe(plaza_id, parte_id, periodo, devengo) {
    const p = periodo || (devengo && devengo.periodo) || null;
    if (!p) return { documento_id: null, total_centimos: null, estado: 'NO_CONSTA', motivo: 'sin periodo no hay documento' };
    const r = await this._rpc('factura-gestion.de.request', {
      project_id: plaza_id, periodo: p, parte_id
    }, { timeout_ms: TIMEOUT_MS });
    if (!r || typeof r.status === 'number' && r.status >= 400 || !r.data || !r.data.documento) {
      return {
        documento_id: null, total_centimos: null, estado: 'NO_CONSTA',
        motivo: (r && r.error && r.error.message) || 'no hay documento emitido de ese periodo'
      };
    }
    const doc = r.data.documento;
    return {
      documento_id: doc.documento_id,
      total_centimos: Number.isInteger(doc.total_centimos) ? doc.total_centimos : null,
      estado: 'EMITIDO'
    };
  }

  // Q01 · el cobro de verdad. Dos fuentes honestas: lo que declara quien acaba de cobrar (el
  // llamante, con su hecho delante) o la pasarela, preguntándole por el recibo del documento. Si
  // ninguna contesta, se dice que no consta — no se pone un cero.
  async _cobroDe(plaza_id, parte_id, periodo, devengo, d) {
    const declarado = d.cobros && typeof d.cobros === 'object' ? d.cobros : null;
    if (declarado && Number.isInteger(declarado.importe_centimos)) {
      return { importe_centimos: declarado.importe_centimos, estado: 'DECLARADO', fuente: 'declarado por quien cobró' };
    }
    const doc = await this._documentoDe(plaza_id, parte_id, periodo || (devengo && devengo.periodo), devengo);
    if (!doc.documento_id) {
      return { importe_centimos: null, estado: 'NO_CONSTA', fuente: 'sin documento', motivo: doc.motivo };
    }
    const r = await this._rpc('pago.recibo.request', {
      project_id: plaza_id, referencia: doc.documento_id
    }, { timeout_ms: TIMEOUT_MS });
    if (r && r.status === 200 && r.data && r.data.recibo && Number.isInteger(r.data.recibo.total_centimos)) {
      return { importe_centimos: r.data.recibo.total_centimos, estado: 'CONFIRMADO_POR_PASARELA', fuente: 'pago-gateway' };
    }
    return {
      importe_centimos: null, estado: 'NO_CONSTA', fuente: 'pago-gateway',
      motivo: r && r.error ? r.error.message : 'la pasarela no da un cobro para ese documento'
    };
  }

  _totalCargos(cargos) {
    const vivos = cargos.filter((c) => c.estado !== 'ANULADO');
    if (vivos.length === 0) return 0;
    return vivos.every((c) => Number.isInteger(c.importe_centimos))
      ? vivos.reduce((t, c) => t + c.importe_centimos, 0) : null;
  }

  _resta(a, b) {
    return (Number.isInteger(a) && Number.isInteger(b)) ? a - b : null;
  }

  async _enLotes(promesas) {
    const out = [];
    for (let i = 0; i < promesas.length; i += LOTE) out.push(...await Promise.all(promesas.slice(i, i + LOTE)));
    return out;
  }
}

module.exports = CuentaParte;
