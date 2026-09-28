/**
 * contabilidad/estados-contables — REFLEJO STATELESS (C1 + C2, hoja del plan).
 *
 * BALANCE DE SITUACION (C1) y CUENTA DE RESULTADOS (C2) DERIVADOS del mayor. No
 * se recalcula el libro: los estados se DERIVAN de `mayor-balanza` (B3), que a su
 * vez deriva del diario. Este modulo NO muta nada. Determinista: mismas entradas
 * -> mismos estados (un test lo afirma). No se "arregla" un resultado: se explica
 * con su base y su cobertura.
 *
 * La CLASIFICACION de cuentas (que grupo es activo/pasivo/patrimonio/ingreso/
 * gasto) es DECLARABLE: el plan contable entra como DATO (payload `clasificacion`
 * o `mapa_cuentas`); si no se declara, se aplica el mapa PGC por defecto como
 * convencion, NUNCA como ley cableada. El inmovilizado (F4) y las existencias
 * valoradas (H1) llegan por EVENTO/payload para completar el activo.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated EN
 * EL CODIGO. Cada op entra objeto, sale objeto. Contrato TOLERANTE con
 * mayor-balanza (B3): si no responde, se DECLARA la dependencia no disponible y
 * NUNCA se emite un balance inventado. Dependencia por EVENTO, NUNCA require
 * cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.balance_calculado y
 * contabilidad.resultado_calculado; error su par determinista. NO REUTILIZA: los
 * estados contables no existen en el inventario; son la derivacion del mayor.
 *
 * Ver hojas C1/C2 del diseno-oop y bloque `estados-contables` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Mapa PGC por defecto (CONVENCION, declarable/override): primer digito -> grupo.
// La ley/el plan contable entra como DATO; esto NO es una constante legal cableada.
const CLASIFICACION_PGC = {
  1: 'PASIVO_PATRIMONIO',
  2: 'ACTIVO',
  3: 'ACTIVO',
  4: 'TERCEROS',
  5: 'ACTIVO',
  6: 'GASTO',
  7: 'INGRESO'
};

class EstadosContables extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estados-contables';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. Los estados se derivan del mayor.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onBalanceRequest(e) {
    return this._atender(e, 'balance', 'contabilidad.estado.balance.response', async (d) => {
      const res = await this._balanceConCuadre(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.balance_calculado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.estado.balance.failed', res);
      }
      return res;
    });
  }

  onResultadoRequest(e) {
    return this._atender(e, 'resultado', 'contabilidad.estado.resultado.response', async (d) => {
      const res = await this._componerResultado(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.resultado_calculado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.estado.resultado.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──

  // componerBalance(periodo) -> Balance {activo, pasivo, patrimonio} (C1).
  // DERIVADO del mayor (B3) + inmovilizado (F4) + existencias valoradas (H1).
  async _componerBalance(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const balanza = await this._balanzaDe(pid, input);
    if (balanza === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'mayor-balanza (B3) no respondio: no se emite un balance sin derivarlo del libro', {
          dependencia: 'mayor-balanza', accion: 'NO_CALCULAR_PUBLICAR_FALLO'
        });
    }

    const clasificacion = this._clasificacionDe(input);
    const lineas = Array.isArray(balanza.lineas) ? balanza.lineas : [];

    const activo = [];
    const pasivo = [];
    const patrimonio = [];

    for (const l of lineas) {
      const grupo = this._grupoDe(l.cuenta, clasificacion);
      const deudor = Number(l.saldo_deudor) || 0;
      const acreedor = Number(l.saldo_acreedor) || 0;

      if (grupo === 'ACTIVO') {
        activo.push({ cuenta: l.cuenta, importe: this._round(deudor - acreedor, 2) });
      } else if (grupo === 'PASIVO') {
        pasivo.push({ cuenta: l.cuenta, importe: this._round(acreedor - deudor, 2) });
      } else if (grupo === 'PATRIMONIO') {
        patrimonio.push({ cuenta: l.cuenta, importe: this._round(acreedor - deudor, 2) });
      } else if (grupo === 'PASIVO_PATRIMONIO') {
        // Grupo 1 PGC (financiacion basica): el signo decide pasivo vs patrimonio declarado.
        const destino = (acreedor - deudor) >= 0 ? pasivo : activo;
        destino.push({ cuenta: l.cuenta, importe: this._round(Math.abs(acreedor - deudor), 2) });
      } else if (grupo === 'TERCEROS') {
        // Grupo 4 PGC: deudor -> activo; acreedor -> pasivo (declarable por subcuenta).
        if (deudor - acreedor >= 0) activo.push({ cuenta: l.cuenta, importe: this._round(deudor - acreedor, 2) });
        else pasivo.push({ cuenta: l.cuenta, importe: this._round(acreedor - deudor, 2) });
      }
      // INGRESO/GASTO no van al balance (van a la cuenta de resultados, C2).
    }

    // Completar el activo con lo declarado/por EVENTO: inmovilizado (F4) y existencias (H1).
    const inmovilizado = this._inmovilizadoDe(input);
    if (inmovilizado !== null) {
      activo.push({ cuenta: inmovilizado.cuenta || 'INMOVILIZADO', importe: this._round(inmovilizado.valor_neto_contable || 0, 2), origen: 'inmovilizado' });
    }
    const existencias = this._existenciasDe(input);
    if (existencias !== null) {
      activo.push({ cuenta: existencias.cuenta || 'EXISTENCIAS', importe: this._round(existencias.total_valor || 0, 2), origen: 'valoracion-existencia' });
    }

    const totalActivo = this._round(activo.reduce((t, x) => t + x.importe, 0), 2);
    const totalPasivo = this._round(pasivo.reduce((t, x) => t + x.importe, 0), 2);
    const totalPatrimonio = this._round(patrimonio.reduce((t, x) => t + x.importe, 0), 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: balanza.periodo || (input && input.periodo) || null,
        balance: {
          activo: { lineas: activo, total: totalActivo },
          pasivo: { lineas: pasivo, total: totalPasivo },
          patrimonio: { lineas: patrimonio, total: totalPatrimonio }
        },
        derivado_del_mayor: true,
        clasificacion_declarada: !!clasificacion,
        determinista: true
      }
    };
  }

  // cuadrar() -> ok | ERROR_ACTIVO_NO_CUADRA (C1).
  _cuadrar(input) {
    // El balance a cuadrar: en payload (`balance`) o el propio input.
    const balance = (input && (input.balance || (input.activo ? input : null))) || null;
    if (!balance) return this._invalid('balance');

    const activo = Number(balance.activo && balance.activo.total) || 0;
    const pasivo = Number(balance.pasivo && balance.pasivo.total) || 0;
    const patrimonio = Number(balance.patrimonio && balance.patrimonio.total) || 0;
    const esperado = this._round(pasivo + patrimonio, 2);
    const descuadre = this._round(activo - esperado, 2);
    const tolerancia = Number.isFinite(Number(input && input.tolerancia)) ? Number(input.tolerancia) : 0.01;
    const cuadra = Math.abs(descuadre) <= tolerancia;

    return {
      status: 200,
      data: {
        project_id: (input && input.project_id) || null,
        cuadra,
        activo: this._round(activo, 2),
        pasivo: this._round(pasivo, 2),
        patrimonio: this._round(patrimonio, 2),
        pasivo_mas_patrimonio: esperado,
        descuadre,
        tolerancia,
        resultado: cuadra ? 'CUADRA' : 'ERROR_ACTIVO_NO_CUADRA'
      }
    };
  }

  // componerResultado(periodo) -> Resultado {ingresos, gastos, resultado} (C2).
  _componerResultado(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // El resultado puede venir derivado del mayor (balanza en el payload) o del mayor por EVENTO.
    const balanza = this._balanzaDeInput(input);
    if (balanza === null) {
      return this._balanzaDeRpcResultado(pid, input);
    }

    const clasificacion = this._clasificacionDe(input);
    const lineas = Array.isArray(balanza) ? balanza : balanza.lineas;
    const ingresos = [];
    const gastos = [];

    for (const l of (lineas || [])) {
      const grupo = this._grupoDe(l.cuenta, clasificacion);
      const deudor = Number(l.saldo_deudor ?? l.debe) || 0;
      const acreedor = Number(l.saldo_acreedor ?? l.haber) || 0;
      if (grupo === 'INGRESO') ingresos.push({ cuenta: l.cuenta, importe: this._round(acreedor - deudor, 2) });
      else if (grupo === 'GASTO') gastos.push({ cuenta: l.cuenta, importe: this._round(deudor - acreedor, 2) });
    }

    const totalIngresos = this._round(ingresos.reduce((t, x) => t + x.importe, 0), 2);
    const totalGastos = this._round(gastos.reduce((t, x) => t + x.importe, 0), 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: (balanza && balanza.periodo) || (input && input.periodo) || null,
        resultado: {
          ingresos: { lineas: ingresos, total: totalIngresos },
          gastos: { lineas: gastos, total: totalGastos },
          resultado: this._round(totalIngresos - totalGastos, 2)
        },
        derivado_del_mayor: true,
        se_explica_no_se_arregla: true,
        determinista: true
      }
    };
  }

  // Balance con su verificacion de cuadre: componer + cuadrar (C1).
  async _balanceConCuadre(input) {
    const comp = await this._componerBalance(input);
    if (comp.status !== 200) return comp;
    const cuadre = this._cuadrar({ project_id: comp.data.project_id, balance: comp.data.balance, tolerancia: input && input.tolerancia });
    return {
      status: 200,
      data: {
        ...comp.data,
        cuadre: cuadre.status === 200 ? cuadre.data : null,
        cuadra: cuadre.status === 200 ? cuadre.data.cuadra : false
      }
    };
  }

  // ── helpers internos ──

  async _balanzaDe(pid, input) {
    const enPayload = this._balanzaDeInput(input);
    if (enPayload !== null) {
      const b = Array.isArray(enPayload) ? { lineas: enPayload } : enPayload;
      return { lineas: b.lineas || b.balanza?.lineas || [], periodo: b.periodo || (input && input.periodo) || null };
    }
    const resp = await this._rpc('contabilidad.mayor.balanza.request', {
      project_id: pid,
      periodo: (input && input.periodo) || null
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    const b = (resp.data && (resp.data.balanza || resp.data)) || null;
    if (!b) return null;
    return { lineas: b.lineas || [], periodo: b.periodo || null };
  }

  _balanzaDeInput(input) {
    const b = input && (input.balanza || input.lineas_balanza || (Array.isArray(input.lineas) ? input.lineas : null));
    if (!b) return null;
    if (Array.isArray(b)) return b;
    return b;
  }

  async _balanzaDeRpcResultado(pid, input) {
    const balanza = await this._balanzaDe(pid, input);
    if (balanza === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'mayor-balanza (B3) no respondio: no se emite una cuenta de resultados sin derivarla del libro', {
          dependencia: 'mayor-balanza', accion: 'NO_CALCULAR_PUBLICAR_FALLO'
        });
    }
    return this._componerResultado({ ...input, balanza });
  }

  // Clasificacion de cuentas DECLARABLE (payload); si no, el mapa PGC por defecto.
  _clasificacionDe(input) {
    const c = input && (input.clasificacion || input.mapa_cuentas);
    return (c && typeof c === 'object') ? c : null;
  }

  _grupoDe(cuenta, clasificacion) {
    if (clasificacion) {
      if (clasificacion[cuenta]) return String(clasificacion[cuenta]).toUpperCase();
      // Mapa por prefijo declarado.
      const prefijos = Object.keys(clasificacion).filter((k) => String(cuenta).startsWith(k)).sort((a, b) => b.length - a.length);
      if (prefijos.length) return String(clasificacion[prefijos[0]]).toUpperCase();
    }
    const primer = String(cuenta || '').charAt(0);
    return CLASIFICACION_PGC[primer] || 'TERCEROS';
  }

  _inmovilizadoDe(input) {
    const v = input && (input.inmovilizado || input.valor_neto_contable);
    if (v === undefined || v === null) return null;
    if (typeof v === 'number') return { valor_neto_contable: v };
    return v;
  }

  _existenciasDe(input) {
    const v = input && (input.existencias || input.valoracion_existencias);
    if (v === undefined || v === null) return null;
    if (typeof v === 'number') return { total_valor: v };
    return v;
  }

  // ── Tools ──
  toolComponerBalance(params) { return this._componerBalance(params); }
  toolCuadrar(params) { return this._cuadrar(params); }
  toolComponerResultado(params) { return this._componerResultado(params); }
}

module.exports = EstadosContables;
