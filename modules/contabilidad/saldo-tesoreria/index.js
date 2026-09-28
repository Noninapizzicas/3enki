/**
 * contabilidad/saldo-tesoreria — REFLEJO STATELESS (E4 + E5, hoja del plan).
 *
 * LA POSICION REAL DE DINERO, por cuenta. No la posicion contable: la REAL
 * (E4). Derivacion determinista sobre los movimientos bancarios que llegan (por
 * payload o los LEE de puerto-extracto (E2) por EVENTO). Y la PREVISION de caja
 * (E5): proyecta entradas/salidas desde los compromisos (vencimientos de
 * cuenta-terceros, N6/N8) con la POLITICA DECLARADA (E6); los umbrales
 * ("caja minima", "deuda maxima") los declara el dueno — NO se asumen.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated.
 * Cada op entra objeto, sale objeto. Contrato TOLERANTE: si las dependencias
 * (puerto-extracto E2, maestro-cuentas-bancarias E11, cuenta-terceros N6/N8,
 * cola-declaraciones-criterio E6/Q24) no responden, se DECLARA la dependencia no
 * disponible (503 DEPENDENCIA_NO_DISPONIBLE) y NUNCA se emite un saldo o una
 * caja inventados. Emisor/par de fallo: exito publica
 * contabilidad.saldo_tesoreria_calculado / contabilidad.caja_proyectada; error
 * su par determinista.
 * NO REUTILIZA: la posicion real de tesoreria y la prevision de caja no existen
 * en el inventario.
 *
 * Ver hojas E4/E5 del diseno-oop y bloque `saldo-tesoreria` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tolerancia de redondeo (centimos).
const EPS = 0.005;

class SaldoTesoreria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'saldo-tesoreria';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. Los movimientos y los
    // compromisos llegan por payload o se LEEN por EVENTO.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onSaldoRequest(e) {
    return this._atender(e, 'saldo', 'contabilidad.tesoreria.saldo.response', async (d) => {
      const res = await this._saldoEntrada(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.saldo_tesoreria_calculado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.tesoreria.saldo.failed', res);
      }
      return res;
    });
  }

  onPrevisionRequest(e) {
    return this._atender(e, 'prevision', 'contabilidad.tesoreria.prevision.response', async (d) => {
      const res = await this._proyectarEntrada(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.caja_proyectada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.tesoreria.prevision.failed', res);
      }
      return res;
    });
  }

  // ── dependencias por EVENTO (contrato TOLERANTE: null = no disponible) ──

  // Movimientos bancarios: payload o puerto-extracto (E2).
  async _movimientosDe(pid, input) {
    const enPayload = input && (input.movimientos || input.extracto);
    if (Array.isArray(enPayload)) return enPayload;
    const resp = await this._rpc('contabilidad.extracto.leer.request',
      { project_id: pid, canal: (input && input.canal) || undefined }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    return (resp.data && (resp.data.movimientos || resp.data.extracto)) || [];
  }

  // Catalogo declarable de cuentas bancarias: payload o maestro-cuentas-bancarias (E11).
  async _cuentasDe(pid, input) {
    const enPayload = input && (input.cuentas || input.cuentas_bancarias);
    if (Array.isArray(enPayload)) return enPayload;
    const resp = await this._rpc('contabilidad.cuenta_bancaria.listar.request',
      { project_id: pid }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    return (resp.data && (resp.data.cuentas || resp.data.cuentas_bancarias)) || [];
  }

  // Compromisos (N6/N8): payload o cuenta-terceros.
  async _vencimientosDe(pid, input) {
    const enPayload = input && (input.vencimientos || input.compromisos);
    if (Array.isArray(enPayload)) return enPayload;
    const resp = await this._rpc('contabilidad.cuenta_terceros.vencimiento.request',
      { project_id: pid }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    return (resp.data && (resp.data.vencimientos || resp.data.compromisos)) || [];
  }

  // Politica de cobro/pago DECLARADA (E6): payload o cola-declaraciones-criterio.
  async _politicaDe(pid, input) {
    const enPayload = input && input.politica;
    if (enPayload && typeof enPayload === 'object') return enPayload;
    const resp = await this._rpc('contabilidad.criterio.leer.request',
      { project_id: pid, criterio: 'E6' }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200 || !resp.data || !resp.data.hallado) return null;
    return (resp.data.parametro && resp.data.parametro.valor) || null;
  }

  // ── proyecciones puras (deterministas) ──

  _idDe(m) {
    return (m && (m.cuenta_bancaria || m.cuenta || m.iban || m.id_cuenta_bancaria)) || null;
  }

  // saldoPorCuenta(idCuentaBancaria) -> Importe (E4). Determinista.
  _saldoPorCuenta(cuenta, movimientos, saldoInicial) {
    let mov = 0;
    for (const m of movimientos) {
      if (cuenta && this._idDe(m) !== cuenta) continue;
      mov += Number(m && m.importe) || 0;
    }
    return this._round((Number(saldoInicial) || 0) + mov, 2);
  }

  // posicionReal() -> Map<IdCuentaBancaria, Importe> (E4: la real, no la contable).
  async _posicionReal(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const movimientos = await this._movimientosDe(pid, input);
    if (movimientos === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'puerto-extracto (E2) no respondio: no se posiciona la tesoreria sin movimientos reales', {
          dependencia: 'puerto-extracto', accion: 'NO_CALCULAR_PUBLICAR_FALLO'
        });
    }

    const cuentas = await this._cuentasDe(pid, input);
    const iniciales = (input && (input.saldos_iniciales || input.saldos_iniciales_por_cuenta)) || {};

    let ids = [];
    if (Array.isArray(cuentas)) {
      ids = cuentas.map((c) => (c && (c.id_cuenta_bancaria || c.id || c.cuenta || c.iban)) || null).filter(Boolean);
    }
    if (ids.length === 0) {
      const vistos = new Set();
      for (const m of movimientos) {
        const c = this._idDe(m);
        if (c) vistos.add(c);
      }
      ids = [...vistos];
    }

    const por_cuenta = {};
    for (const id of ids) por_cuenta[id] = this._saldoPorCuenta(id, movimientos, iniciales[id]);
    const total = this._round(Object.values(por_cuenta).reduce((t, v) => t + v, 0), 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        posicion_real: por_cuenta,
        total,
        n_cuentas: ids.length,
        n_movimientos: movimientos.length,
        maestro_cuentas_disponible: Array.isArray(cuentas),
        derivado_de_movimientos_reales: true,
        determinista: true,
        nota: 'posicion REAL de dinero por cuenta: el importe lleva signo'
      }
    };
  }

  // saldo request: posicion completa, o el saldo de UNA cuenta si se declara.
  async _saldoEntrada(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const cuenta = input && (input.cuenta || input.id_cuenta_bancaria);
    if (cuenta) {
      const movimientos = await this._movimientosDe(pid, input);
      if (movimientos === null) {
        return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
          'puerto-extracto (E2) no respondio: no se calcula el saldo sin movimientos reales', {
            dependencia: 'puerto-extracto'
          });
      }
      const iniciales = (input && input.saldos_iniciales) || {};
      const saldo = this._saldoPorCuenta(cuenta, movimientos, iniciales[cuenta]);
      return {
        status: 200,
        data: {
          project_id: pid,
          cuenta,
          saldo,
          posicion_real: { [cuenta]: saldo },
          n_movimientos: movimientos.length,
          derivado_de_movimientos_reales: true,
          determinista: true
        }
      };
    }

    return this._posicionReal(input);
  }

  // proyectar(desde, hasta) -> CajaProyectada (E5).
  _proyectar(vencimientos, politica, cajaInicial, desde, hasta) {
    const enRango = (f) => {
      if (!f) return true;
      const s = String(f).slice(0, 10);
      if (desde && s < String(desde).slice(0, 10)) return false;
      if (hasta && s > String(hasta).slice(0, 10)) return false;
      return true;
    };

    let entradas = 0;
    let salidas = 0;
    let n = 0;
    for (const v of vencimientos) {
      if (!enRango(v && (v.fecha || v.fecha_vencimiento || v.vencimiento))) continue;
      const imp = Number(v && (v.importe !== undefined ? v.importe : v.total)) || 0;
      n += 1;
      if (imp >= 0) entradas += imp; else salidas += -imp;
    }
    entradas = this._round(entradas, 2);
    salidas = this._round(salidas, 2);
    const neto = this._round(entradas - salidas, 2);
    const caja_inicial = this._round(Number(cajaInicial) || 0, 2);

    return {
      entradas,
      salidas,
      neto,
      caja_inicial,
      caja_final: this._round(caja_inicial + neto, 2),
      desde: desde || null,
      hasta: hasta || null,
      n_compromisos: n,
      politica: politica || null,
      dias_cobro: (politica && politica.dias_cobro) || null,
      dias_pago: (politica && politica.dias_pago) || null
    };
  }

  // alertarUmbral(prevision, umbral) -> senal (E5, K2); el umbral es DECLARABLE (Q24).
  _alertarUmbral(prevision, umbral) {
    if (umbral === null || umbral === undefined) {
      return {
        alerta: false,
        senal: 'UMBRAL_NO_DECLARADO',
        declarable: true,
        umbral: null,
        caja_final: prevision && prevision.caja_final,
        nota: 'los umbrales (caja minima / deuda maxima) los declara el dueno: no se asumen'
      };
    }
    const u = Number(umbral) || 0;
    const caja = Number((prevision && prevision.caja_final) || 0);
    const bajo = caja < u;
    return {
      alerta: bajo,
      senal: bajo ? 'CAJA_BAJO_UMBRAL' : 'CAJA_EN_UMBRAL',
      umbral: this._round(u, 2),
      caja_final: this._round(caja, 2),
      declarable: true
    };
  }

  // prevision request: proyecta entradas/salidas desde los compromisos con la politica declarada.
  async _proyectarEntrada(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const vencimientos = await this._vencimientosDe(pid, input);
    if (vencimientos === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'cuenta-terceros (N6/N8) no respondio: no se proyecta caja sin compromisos', {
          dependencia: 'cuenta-terceros', accion: 'NO_CALCULAR_PUBLICAR_FALLO'
        });
    }

    const politica = await this._politicaDe(pid, input);
    const cajaInicial = (input && (input.caja_inicial !== undefined ? input.caja_inicial : input.total_tesoreria)) || 0;
    const desde = (input && input.desde) || null;
    const hasta = (input && input.hasta) || null;

    const prevision = this._proyectar(vencimientos, politica, cajaInicial, desde, hasta);
    const umbral = (input && input.umbral !== undefined)
      ? input.umbral
      : (politica && (politica.caja_minima !== undefined ? politica.caja_minima : politica.umbral));
    const senal = this._alertarUmbral(prevision, umbral === undefined ? null : umbral);

    return {
      status: 200,
      data: {
        project_id: pid,
        caja_proyectada: prevision,
        umbral_declarado: umbral === undefined ? null : umbral,
        senal,
        politica_declarada: !!politica,
        determinista: true,
        nota: 'la prevision proyecta desde los COMPROMISOS con la POLITICA DECLARADA; el umbral lo declara el dueno'
      }
    };
  }

  // ── Tools ──
  toolSaldoPorCuenta(params) { return this._saldoEntrada(params); }
  toolPosicionReal(params) { return this._posicionReal(params); }
  toolProyectar(params) { return this._proyectarEntrada(params); }
  toolAlertarUmbral(params) { return Promise.resolve(this._alertarUmbral(params.prevision, params.umbral)); }
}

module.exports = SaldoTesoreria;
