/**
 * contabilidad/conciliacion-bancaria — REFLEJO STATELESS (E1/E3/E9/E10, hoja del plan).
 *
 * EL CRUCE extracto <-> libro por CLAVE NATURAL y reglas es DETERMINISTA
 * (un test lo afirma). El JUICIO vive AISLADO en sus satelites: E7
 * `partida-no-identificada` (fuzzy) y E8 `regla-movimiento-bancario` (custodio).
 * Aqui NO se duplica el juicio: lo que no cruza se PUBLICA como
 * contabilidad.movimiento_sin_cruzar y se lo entrega a E7; aqui jamas se
 * inventa la contrapartida de un movimiento.
 *
 * Cuatro derivaciones deterministas:
 *   E1  _cruzar(extracto, libro)          -> List<Conciliacion>
 *   E3  _cuadrarMovimiento(mov, cobroOPago) -> Ok | Descuadre (clave natural compartida)
 *   E9  _explicarDesfase()                -> List<PartidaEnTransito>
 *   E10 _componerInforme()                -> DocumentoCuadre (saldo banco <-> contable ajustado)
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated.
 * Cada op entra objeto, sale objeto. El libro/mayor lo da mayor-balanza (B3) por
 * EVENTO; el extracto lo da puerto-extracto (E2) por EVENTO (contrato TOLERANTE:
 * si faltan, se DECLARA la dependencia no disponible, no se inventa el cruce).
 * Emisor/par de fallo: exito publica contabilidad.conciliacion_realizada y, si
 * hay movimientos que no cruzan, contabilidad.movimiento_sin_cruzar (senal a E7);
 * error su par determinista. NO REUTILIZA: la conciliacion bancaria no existe en
 * el inventario.
 *
 * Ver hojas E1/E3/E9/E10 del diseno-oop y bloque `conciliacion-bancaria` de la espina.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tolerancia de cuadre (centimos) para el cruce por importe.
const EPS = 0.005;

class ConciliacionBancaria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'conciliacion-bancaria';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. Extracto y libro llegan por payload o EVENTO.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onCruzarRequest(e) {
    return this._atender(e, 'cruzar', 'contabilidad.conciliacion.cruzar.response', async (d) => {
      const res = await this._cruzarEntrada(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.conciliacion_realizada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
        // Lo que NO cruza se PUBLICA para su satelite de juicio (E7). No se inventa.
        if (res.data.sin_cruzar && res.data.sin_cruzar.length > 0) {
          this.eventBus?.publish('contabilidad.movimiento_sin_cruzar', {
            project_id: res.data.project_id,
            movimientos: res.data.sin_cruzar,
            n: res.data.sin_cruzar.length,
            destino: 'partida-no-identificada (E7)',
            juicio_aislado: true,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('contabilidad.conciliacion.cruzar.failed', res);
      }
      return res;
    });
  }

  onInformeRequest(e) {
    return this._atender(e, 'informe', 'contabilidad.conciliacion.informe.response', async (d) => {
      const res = await this._componerInforme(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.conciliacion.informe.failed', res);
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // El extracto y el libro llegan en el payload o se LEEN por EVENTO. null = no disponible.
  async _extractoDe(pid, input) {
    const enPayload = input && (input.extracto || input.movimientos);
    if (Array.isArray(enPayload)) return enPayload;
    const resp = await this._rpc('contabilidad.extracto.leer.request', { project_id: pid }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    return (resp.data && (resp.data.movimientos || resp.data.extracto)) || [];
  }

  async _libroDe(pid, input) {
    const enPayload = input && (input.libro || input.apuntes);
    if (Array.isArray(enPayload)) return enPayload;
    const resp = await this._rpc('contabilidad.mayor.movimientos.request', { project_id: pid, cuenta: (input && input.cuenta) }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return [];
    return (resp.data && resp.data.movimientos) || [];
  }

  // Clave natural compartida del movimiento: (fecha_valor | importe | documento/ref).
  _claveDe(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.clave_natural) return String(m.clave_natural);
    const fecha = m.fecha_valor || m.fecha || m.fecha_operacion || '';
    const importe = this._round(Number(m.importe) || 0, 2);
    const ref = m.referencia || m.documento || m.documento_origen || m.concepto || '';
    return `${String(fecha).slice(0, 10)}|${importe}|${String(ref).trim()}`;
  }

  _importeDe(m) {
    const v = Number(m && m.importe);
    return Number.isFinite(v) ? this._round(v, 2) : null;
  }

  // cruzar(extracto, libro) -> { conciliaciones, sin_cruzar } (E1). Determinista.
  async _cruzarEntrada(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const extracto = await this._extractoDe(pid, input);
    if (extracto === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'puerto-extracto (E2) no respondio: no se concilia sin extracto', {
          dependencia: 'puerto-extracto', accion: 'NO_CRUZAR_PUBLICAR_FALLO'
        });
    }
    const libro = await this._libroDe(pid, input);

    const { conciliaciones, sinCruzar } = this._cruzar(extracto, libro);

    return {
      status: 200,
      data: {
        project_id: pid,
        conciliaciones,
        n_conciliaciones: conciliaciones.length,
        sin_cruzar: sinCruzar,
        n_sin_cruzar: sinCruzar.length,
        determinista: true,
        juicio_aislado: 'el juicio vive en E7 (partida-no-identificada) y E8 (regla-movimiento-bancario)',
        nota: 'el cruce por clave natural y reglas es DETERMINISTA; aqui no se inventa contrapartida'
      }
    };
  }

  // E1: cruce por clave natural (y por importe+fecha como tolerancia declarada).
  _cruzar(extracto, libro) {
    const noUsados = new Set(libro.map((_, i) => i));
    const conciliaciones = [];
    const sinCruzar = [];

    for (const mov of extracto) {
      const clave = this._claveDe(mov);
      const importe = this._importeDe(mov);
      let indice = -1;
      let via = null;

      // 1) clave natural exacta (determinista).
      for (const i of noUsados) {
        if (this._claveDe(libro[i]) === clave) { indice = i; via = 'CLAVE_NATURAL'; break; }
      }
      // 2) tolerancia declarada: mismo importe (una vez consumida la clave).
      if (indice === -1 && importe !== null) {
        for (const i of noUsados) {
          if (this._importeDe(libro[i]) === importe) { indice = i; via = 'IMPORTE'; break; }
        }
      }

      if (indice === -1) {
        sinCruzar.push({ ...mov, clave_natural: clave, importe, motivo: 'SIN_CONTRAPARTIDA_EN_LIBRO' });
        continue;
      }
      noUsados.delete(indice);
      const apunte = libro[indice];
      conciliaciones.push({
        clave_natural: clave,
        via,
        movimiento: mov,
        apunte,
        cuadra: importe !== null && this._importeDe(apunte) === importe
      });
    }

    return { conciliaciones, sinCruzar };
  }

  // cuadrarMovimiento(movimiento, cobroOPago) -> Ok | Descuadre (E3, clave compartida).
  async _cuadrarMovimiento(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const movimiento = input && (input.movimiento || input.mov);
    if (!movimiento) return this._invalid('movimiento');

    const cobroOPago = (input && (input.cobro_o_pago || input.cobroOPago || input.asiento)) || null;
    const importeMov = this._importeDe(movimiento);

    if (!cobroOPago || typeof cobroOPago !== 'object') {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'un movimiento bancario = un cobro/pago: sin su contraparte no se cuadra', {
          clave_natural: this._claveDe(movimiento), senal: 'SIN_CONTRAPARTE'
        });
    }
    const importeCobro = this._importeDe(cobroOPago) !== null
      ? this._importeDe(cobroOPago)
      : this._round(Number(cobroOPago.importe !== undefined ? cobroOPago.importe : (cobroOPago.total !== undefined ? cobroOPago.total : cobroOPago.haber)) || 0, 2);

    const descuadre = (importeMov === null || importeCobro === null || Math.abs(importeMov - importeCobro) > EPS);
    if (descuadre) {
      // No casa -> E7/E9, NUNCA se ignora.
      return this._errorResponse(409, 'DESCUADRE',
        `el movimiento NO cuadra con su cobro/pago: ${importeMov} != ${importeCobro}`, {
          clave_natural: this._claveDe(movimiento),
          importe_movimiento: importeMov,
          importe_cobro_pago: importeCobro,
          destino: 'E7/E9 (partida no identificada / partida en transito)',
          ignorado: false
        });
    }
    return {
      status: 200,
      data: {
        project_id: pid,
        clave_natural: this._claveDe(movimiento),
        cuadra: true,
        importe: importeMov,
        determinista: true
      }
    };
  }

  // explicarDesfase() -> List<PartidaEnTransito> (E9: cheque no cobrado, cobro no apuntado).
  async _explicarDesfase(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const extracto = await this._extractoDe(pid, input);
    if (extracto === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'puerto-extracto (E2) no respondio: no se explica el desfase sin extracto', {
          dependencia: 'puerto-extracto'
        });
    }
    const libro = await this._libroDe(pid, input);
    const { sinCruzar } = this._cruzar(extracto, libro);

    const transito = sinCruzar.map((m) => ({
      clave_natural: m.clave_natural,
      importe: m.importe,
      motivo: 'MOVIMIENTO_EN_BANCO_NO_APUNTADO_EN_LIBRO',
      explicacion: 'cheque no cobrado / cobro no apuntado: partida en transito',
      en_banco: true,
      en_libro: false
    }));

    return {
      status: 200,
      data: {
        project_id: pid,
        partidas_en_transito: transito,
        n: transito.length,
        determinista: true
      }
    };
  }

  // componer() -> DocumentoCuadre (E10: saldo banco <-> saldo contable ajustado).
  async _componerInforme(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const saldoBanco = this._round(Number((input && (input.saldo_banco !== undefined ? input.saldo_banco : input.saldoBanco))) || 0, 2);
    const saldoContable = this._round(Number((input && (input.saldo_contable !== undefined ? input.saldo_contable : input.saldoContable))) || 0, 2);

    const desfase = await this._explicarDesfase(input);
    if (desfase.status !== 200) return desfase;
    const transito = desfase.data.partidas_en_transito;

    const ajuste = this._round(transito.reduce((t, p) => t + (Number(p.importe) || 0), 0), 2);
    const saldoContableAjustado = this._round(saldoContable + ajuste, 2);
    const cuadra = Math.abs(saldoBanco - saldoContableAjustado) < EPS;

    return {
      status: 200,
      data: {
        project_id: pid,
        documento_cuadre: {
          saldo_banco: saldoBanco,
          saldo_contable: saldoContable,
          partidas_en_transito: transito,
          ajuste_transito: ajuste,
          saldo_contable_ajustado: saldoContableAjustado,
          cuadra
        },
        n_partidas: transito.length,
        determinista: true,
        nota: 'la prueba de que el cuadre cuadra: saldo banco <-> saldo contable ajustado'
      }
    };
  }

  // ── Tools ──
  toolCruzar(params) { return this._cruzarEntrada(params); }
  toolCuadrarMovimiento(params) { return this._cuadrarMovimiento(params); }
  toolExplicarDesfase(params) { return this._explicarDesfase(params); }
  toolComponerInforme(params) { return this._componerInforme(params); }
}

module.exports = ConciliacionBancaria;
