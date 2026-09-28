/**
 * contabilidad/cuenta-terceros — REFLEJO STATELESS (N3+N4+N6+N8, hoja del plan).
 *
 * Mayor AUXILIAR del tercero DERIVADO del libro: facturas vivas, saldo,
 * extracto CONFRONTABLE con el tercero, vencimientos desde la politica
 * DECLARADA y antiguedad de saldos por lado (POR_COBRAR | POR_PAGAR). Es de SOLO
 * LECTURA: no muta nada, no tiene store, nunca es un almacen paralelo al libro
 * (invariante: los saldos se DERIVAN, jamas se duplican). Calculo determinista:
 * mismas entradas → mismo extracto (un test lo afirma).
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated.
 * Las dependencias se leen POR EVENTO, NUNCA por require cruzado:
 *   · mayor-balanza (B3)  → contabilidad.mayor.movimientos.request  ← AUN NO EXISTE
 *   · maestro-terceros (N1)→ contabilidad.tercero.ficha.request
 *   · cola-declaraciones-criterio (K9) → contabilidad.criterio.leer.request (politica N6/E6)
 * CONTRATO TOLERANTE (exigido por la espina): si mayor-balanza no esta viva (o
 * no responde) se publica DEPENDENCIA_NO_DISPONIBLE y NUNCA se fabrican saldos,
 * extractos ni antiguedades — nada de basura por relleno. Si el hecho trae su
 * propia rebanada del libro (`movimientos`/`asientos` en el payload) el calculo
 * procede sin tocar la dependencia. Si la politica de vencimiento NO esta
 * declarada ([ABIERTO] E6/M4) se publica CRITERIO_NO_DECLARADO: lo no declarado
 * NO se estima.
 *
 * Emisor/par de fallo: exito publica contabilidad.cuenta_terceros_calculada;
 * error su par determinista. NO REUTILIZA: las vistas por rol del tercero
 * (auxiliar, extracto, vencimientos) cuelgan del libro de ESTA vertical.
 *
 * Ver hojas N3/N4/N6/N8 del diseno-oop y bloque `cuenta-terceros` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Lados de la antiguedad de saldos (N8).
const LADOS = new Set(['POR_COBRAR', 'POR_PAGAR', 'DEBE', 'HABER']);

// Critério declarable del que cuelga la politica de vencimiento (E6 → K9).
const CRITERIO_POLITICA = 'E6';

// Tramos del aging report (N8), en dias.
const TRAMOS = [
  { id: '0-30', desde: 0, hasta: 30 },
  { id: '31-60', desde: 31, hasta: 60 },
  { id: '61-90', desde: 61, hasta: 90 },
  { id: '90+', desde: 91, hasta: null }
];

class CuentaTerceros extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuenta-terceros';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless de SOLO LECTURA: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onSaldoRequest(e) {
    return this._atender(e, 'saldo', 'contabilidad.cuenta_terceros.saldo.response', async (d) => {
      const res = await this._saldo(d);
      this._publicarO(res, d, 'contabilidad.cuenta_terceros.saldo.failed');
      return res;
    });
  }

  onExtractoRequest(e) {
    return this._atender(e, 'extracto', 'contabilidad.cuenta_terceros.extracto.response', async (d) => {
      const res = await this._extracto(d);
      this._publicarO(res, d, 'contabilidad.cuenta_terceros.extracto.failed');
      return res;
    });
  }

  onVencimientoRequest(e) {
    return this._atender(e, 'vencimiento', 'contabilidad.cuenta_terceros.vencimiento.response', async (d) => {
      const res = await this._vencimiento(d);
      this._publicarO(res, d, 'contabilidad.cuenta_terceros.vencimiento.failed');
      return res;
    });
  }

  onAgingRequest(e) {
    return this._atender(e, 'aging', 'contabilidad.cuenta_terceros.aging.response', async (d) => {
      const res = await this._aging(d);
      this._publicarO(res, d, 'contabilidad.cuenta_terceros.aging.failed');
      return res;
    });
  }

  // Exito → evento de dominio; error → par determinista del op.
  _publicarO(res, d, eventoFallo) {
    if (res.status === 200) {
      this.eventBus?.publish('contabilidad.cuenta_terceros_calculada', {
        op: res.data.op || null,
        ...res.data,
        correlation_id: d && d.correlation_id
      });
    } else {
      this.eventBus?.publish(eventoFallo, res);
    }
  }

  // ── lectura de dependencias (por EVENTO, TOLERANTE) ──

  // Rebanada del libro: del payload, o pedida a mayor-balanza (B3) por EVENTO.
  // Devuelve null = DEPENDENCIA NO DISPONIBLE (no se fabrica nada).
  async _rebanadaLibro(pid, input) {
    const inline = (input && (input.movimientos || input.asientos)) || null;
    if (Array.isArray(inline)) return { movimientos: inline, fuente: 'PAYLOAD' };

    const resp = await this._rpc('contabilidad.mayor.movimientos.request', {
      project_id: pid,
      tercero: input && input.id_tercero,
      cuenta: input && input.cuenta,
      desde: input && input.desde,
      hasta: input && input.hasta
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200 || !resp.data) return null;
    return {
      movimientos: Array.isArray(resp.data.movimientos) ? resp.data.movimientos : [],
      fuente: 'MAYOR_BALANZA'
    };
  }

  // Ficha del tercero: del payload o pedida a maestro-terceros (N1) por EVENTO.
  async _fichaTercero(pid, input) {
    const inline = (input && input.tercero) || null;
    if (inline && typeof inline === 'object') return { tercero: inline, fuente: 'PAYLOAD' };
    const id = input && input.id_tercero;
    if (!id) return null;
    const resp = await this._rpc('contabilidad.tercero.ficha.request', { project_id: pid, id_tercero: id }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200 || !resp.data || !resp.data.tercero) return null;
    return { tercero: resp.data.tercero, fuente: 'MAESTRO_TERCEROS' };
  }

  // Politica de vencimiento DECLARADA (N6 cuelga de E6 en K9). No se estima.
  async _politicaPago(pid, input) {
    const inline = (input && (input.politica || input.condiciones)) || null;
    if (inline && typeof inline === 'object') return { politica: inline, fuente: 'PAYLOAD' };
    const resp = await this._rpc('contabilidad.criterio.leer.request', {
      project_id: pid, criterio: (input && input.criterio) || CRITERIO_POLITICA
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200 || !resp.data) return null;
    if (resp.data.hallado !== true || !resp.data.parametro) {
      return { politica: null, fuente: 'K9', estado: 'AUSENTE' };
    }
    return { politica: resp.data.parametro.valor || resp.data.parametro, fuente: 'K9', estado: 'DECLARADO' };
  }

  // ── proyecciones puras (deterministas) ──

  _importe(m) {
    const debe = Number(m && (m.debe ?? m.cargo)) || 0;
    const haber = Number(m && (m.haber ?? m.abono)) || 0;
    return this._round(debe - haber, 2);
  }

  // facturasVivas(idTercero) -> List<IdAsiento> (N3).
  _facturasVivas(pid, movimientos) {
    return movimientos
      .filter((m) => m && (m.es_factura === true || m.factura || m.tipo === 'FACTURA' || m.asiento))
      .map((m) => ({
        id_asiento: m.asiento || m.id_asiento || m.id || null,
        factura: m.factura || m.documento || null,
        fecha: m.fecha || m.fecha_operacion || null,
        importe: this._importe(m),
        pendiente: m.pendiente !== undefined ? !!m.pendiente : this._importe(m) !== 0,
        vencimiento: m.vencimiento || null,
        lado: this._importe(m) >= 0 ? 'POR_COBRAR' : 'POR_PAGAR'
      }))
      .filter((f) => f.pendiente);
  }

  // saldo(idTercero) -> Importe (N3). DERIVADO del libro: nunca almacen paralelo.
  async _saldo(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    if (!input.id_tercero && !input.tercero) return this._invalid('id_tercero');

    const rebanada = await this._rebanadaLibro(pid, input);
    if (!rebanada) return this._depNoDisponible('mayor-balanza', 'saldo', input);

    const ficha = await this._fichaTercero(pid, input);
    const movimientos = rebanada.movimientos.filter((m) => !input.id_tercero
      || m.tercero === input.id_tercero || m.id_tercero === input.id_tercero || (ficha && ficha.tercero && m.tercero === ficha.tercero.id));

    const saldo = this._round(movimientos.reduce((s, m) => s + this._importe(m), 0), 2);
    const vivas = this._facturasVivas(pid, movimientos);

    return {
      status: 200,
      data: {
        op: 'saldo',
        project_id: pid,
        id_tercero: (input && input.id_tercero) || null,
        saldo,
        n_movimientos: movimientos.length,
        n_facturas_vivas: vivas.length,
        facturas_vivas: vivas,
        fuente_libro: rebanada.fuente,
        derivado_del_libro: true,
        almacen_paralelo: false,
        solo_lectura: true,
        no_muta: true
      }
    };
  }

  // extracto(idTercero, desde, hasta) -> DocumentoConfrontable (N4).
  async _extracto(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    if (!input.id_tercero && !input.tercero) return this._invalid('id_tercero');

    const rebanada = await this._rebanadaLibro(pid, input);
    if (!rebanada) return this._depNoDisponible('mayor-balanza', 'extracto', input);

    const movimientos = rebanada.movimientos.filter((m) => !input.id_tercero
      || m.tercero === input.id_tercero || m.id_tercero === input.id_tercero);

    const lineas = movimientos.map((m) => ({
      fecha: m.fecha || m.fecha_operacion || null,
      documento: m.factura || m.documento || m.asiento || null,
      concepto: m.concepto || null,
      debe: this._round(Number(m.debe ?? m.cargo) || 0, 2),
      haber: this._round(Number(m.haber ?? m.abono) || 0, 2),
      saldo: this._importe(m)
    }));

    let acumulado = 0;
    const con_saldo = lineas.map((l) => {
      acumulado = this._round(acumulado + l.debe - l.haber, 2);
      return { ...l, saldo_acumulado: acumulado };
    });

    return {
      status: 200,
      data: {
        op: 'extracto',
        project_id: pid,
        id_tercero: (input && input.id_tercero) || null,
        desde: (input && input.desde) || null,
        hasta: (input && input.hasta) || null,
        lineas: con_saldo,
        saldo_inicial: this._round(Number(input && input.saldo_inicial) || 0, 2),
        saldo_final: acumulado,
        n_lineas: con_saldo.length,
        confrontable: true,            // se confronta con el tercero (N4)
        quien_confirma: 'DECLARABLE',  // dueño o asesor: declarable, no lo decide el sistema
        derivado_del_libro: true,
        solo_lectura: true,
        no_muta: true
      }
    };
  }

  // calcularVencimiento(factura) -> Fecha desde la politica declarada (N6).
  // fecha = vencimiento del hecho, o fecha de factura + plazo declarado. NO se estima.
  async _vencimiento(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const factura = (input && (input.factura || input.asiento)) || null;
    if (!factura || typeof factura !== 'object') return this._invalid('factura');

    const pol = await this._politicaPago(pid, input);
    if (!pol) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'cola-declaraciones-criterio (K9) no respondio: no se estima el vencimiento', {
          dependencia: 'cola-declaraciones-criterio', criterio: CRITERIO_POLITICA, op: 'vencimiento'
        });
    }

    const res = this._calcularVencimiento(factura, pol.politica, pol.estado);
    if (res.status !== 200) return res;
    const hoy = (input && input.hoy) || new Date().toISOString().slice(0, 10);

    return {
      status: 200,
      data: {
        op: 'vencimiento',
        project_id: pid,
        factura: factura.factura || factura.documento || factura.id || null,
        vencimiento: res.data.vencimiento,
        dias_plazo: res.data.dias_plazo,
        politica_fuente: pol.fuente,
        politica_estado: pol.estado,
        esta_vencido: this._estaVencido(res.data.vencimiento, hoy),
        hoy,
        solo_lectura: true,
        no_muta: true
      }
    };
  }

  // Puro: calcularVencimiento(factura, politica, estado) -> Fecha | CRITERIO_NO_DECLARADO.
  _calcularVencimiento(factura, politica, estado) {
    if (factura.vencimiento) {
      return { status: 200, data: { vencimiento: factura.vencimiento, dias_plazo: null, base: 'HECHO' } };
    }
    if (estado === 'AUSENTE' || !politica) {
      // Lo no declarado NO se estima: sin politica no hay fecha (jamas una inventada).
      return this._errorResponse(422, 'CRITERIO_NO_DECLARADO',
        'la politica de vencimiento (E6) no esta declarada: no se estima la fecha', {
          criterio: CRITERIO_POLITICA, pieza_abierta: true, op: 'vencimiento'
        });
    }
    const dias = Number(politica.plazo_dias ?? politica.dias ?? politica.plazo);
    if (!Number.isFinite(dias)) {
      return this._errorResponse(422, 'CRITERIO_NO_DECLARADO',
        'la politica declarada no trae plazo en dias: no se estima la fecha', {
          criterio: CRITERIO_POLITICA, politica, op: 'vencimiento'
        });
    }
    const base = factura.fecha || factura.fecha_operacion || factura.fecha_factura;
    if (!base) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'la factura no trae fecha: no se puede calcular el vencimiento', { op: 'vencimiento' });
    }
    const d = new Date(`${base}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      return this._errorResponse(422, 'PRECONDITION_FAILED', `fecha de la factura no valida: ${base}`, { op: 'vencimiento' });
    }
    d.setUTCDate(d.getUTCDate() + dias);
    return { status: 200, data: { vencimiento: d.toISOString().slice(0, 10), dias_plazo: dias, base: 'POLITICA_DECLARADA' } };
  }

  // Puro: estaVencido(factura|vencimiento, hoy) -> Bool (N6).
  _estaVencido(facturaOVencimiento, hoy) {
    const venc = typeof facturaOVencimiento === 'string'
      ? facturaOVencimiento
      : (facturaOVencimiento && facturaOVencimiento.vencimiento) || null;
    if (!venc || !hoy) return null;      // sin fecha de vencimiento no se afirma nada
    return venc < hoy;
  }

  // clasificarPorVencimiento(lado, hoy) -> AgingReport POR_COBRAR | POR_PAGAR (N8).
  async _aging(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const lado = String((input && input.lado) || '').toUpperCase();
    if (!LADOS.has(lado)) return this._invalid('lado');

    const rebanada = await this._rebanadaLibro(pid, input);
    if (!rebanada) return this._depNoDisponible('mayor-balanza', 'aging', input);

    const hoy = (input && input.hoy) || new Date().toISOString().slice(0, 10);
    const vivas = this._facturasVivas(pid, rebanada.movimientos);

    // Solo el lado pedido: POR_COBRAR (lo que nos deben) | POR_PAGAR (lo que debemos).
    const ladoNorm = (lado === 'DEBE') ? 'POR_COBRAR' : (lado === 'HABER' ? 'POR_PAGAR' : lado);
    const delLado = vivas.filter((f) => f.lado === ladoNorm);

    return {
      status: 200,
      data: {
        op: 'aging',
        project_id: pid,
        lado: ladoNorm,
        hoy,
        aging: this._clasificarPorVencimiento(delLado, hoy),
        n_facturas: delLado.length,
        fuente_libro: rebanada.fuente,
        derivado_del_libro: true,
        solo_lectura: true,
        no_muta: true
      }
    };
  }

  // Puro: clasificarPorVencimiento(facturas, hoy) -> AgingReport por tramos (N8).
  _clasificarPorVencimiento(facturas, hoy) {
    const tramos = TRAMOS.map((t) => ({ tramo: t.id, desde: t.desde, hasta: t.hasta, n: 0, importe: 0 }));
    const buscar = (dias) => tramos.find((t) => dias >= t.desde && (t.hasta === null || dias <= t.hasta));
    let sin_vencimiento = { n: 0, importe: 0 };

    for (const f of (Array.isArray(facturas) ? facturas : [])) {
      const venc = f && f.vencimiento;
      const importe = Math.abs(Number(f && f.importe) || 0);
      if (!venc) {
        sin_vencimiento.n += 1;
        sin_vencimiento.importe = this._round(sin_vencimiento.importe + importe, 2);
        continue;
      }
      const dias = Math.floor((new Date(`${hoy}T00:00:00Z`) - new Date(`${venc}T00:00:00Z`)) / 86400000);
      const diasClasif = dias < 0 ? 0 : dias;   // aun no vencido → tramo 0-30
      const t = buscar(diasClasif);
      if (t) { t.n += 1; t.importe = this._round(t.importe + importe, 2); }
    }

    return {
      tramos,
      sin_vencimiento,
      total_n: tramos.reduce((s, t) => s + t.n, 0) + sin_vencimiento.n,
      total_importe: this._round(tramos.reduce((s, t) => s + t.importe, 0) + sin_vencimiento.importe, 2)
    };
  }

  // Dependencia no viva: se DECLARA, no se fabrica (contrato TOLERANTE).
  _depNoDisponible(dependencia, op, input) {
    return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
      `${dependencia} no esta disponible: no se fabrican cifras`, {
        dependencia,
        op,
        project_id: (input && input.project_id) || null,
        accion: 'NO_FABRICAR_PUBLICAR_FALLO'
      });
  }

  // ── Tools ──
  toolSaldo(params) { return this._saldo(params); }
  toolExtracto(params) { return this._extracto(params); }
  toolVencimiento(params) { return this._vencimiento(params); }
  toolAging(params) { return this._aging(params); }
}

module.exports = CuentaTerceros;
