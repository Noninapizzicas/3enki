/**
 * contabilidad-fiscal/asiento-personal — REFLEJO STATELESS (G3, hoja del plan).
 *
 * GASTO DE PERSONAL, RETENCION Y PAGO → ASIENTO EQUILIBRADO. El diseno lo dice literal:
 * `construir(...):Asiento`, con `nomina:ReciboNomina` y `ss:ObligacionSeguridadSocial`.
 * Calculo PURO, determinista: misma entrada → mismo asiento.
 *
 * LA CADENA DE PERSONAL ENTRA COMO DATO, por EVENTO (jamas un require cruzado):
 *   - el RECIBO ya calculado por el sistema externo (recibo-nomina G1),
 *   - la OBLIGACION con la SS ya derivada (obligacion-seguridad-social G2).
 * Las dos pueden venir declaradas en la peticion o pedirse al bus.
 *
 * LAS CUENTAS SON DECLARABLES: este reflejo NO cablea ningun numero de cuenta del PGC. Si el
 * negocio declara el mapa de cuentas (`cuentas`), las partidas lo usan; si no, cada partida
 * declara su `cuenta:null` y su ROL — la numeracion es del negocio, no del modulo.
 *
 * EQUILIBRIO: el asiento se cierra por construccion (Debe = Haber) y se PUBLICAN las dos sumas y
 * el `cuadra`. Un descuadre de lo declarado NO se corrige ni se ajusta a ciegas: se DECLARA en
 * `descuadre` y su resolucion es del humano.
 *
 * Invariante: dato ausente = desconocido. Sin retencion declarada no se estima un 0 — la partida
 * queda `null` y se declara en `faltantes` (puede ser que la fuente no la traiga).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G3 del plan-construccion y diseno-oop.md (CLASE AsientoPersonal).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// ROLES de partida (el ROL es del dominio; la CUENTA es declarable). Nada de numeros cableados.
const ROLES = {
  SUELDOS: 'gasto_sueldos',
  SS_EMPRESA: 'gasto_ss_empresa',
  RETENCION: 'retencion_irpf_pasivo',
  ORGANISMOS: 'organismos_ss_pasivo',
  NETO: 'neto_a_pagar'
};

// Cuentas de la cadena de personal: ParametroDeclarable por negocio (nombre de cuenta, no numero legal).
const CUENTAS = {
  gasto_sueldos: 'cuentas.gasto_sueldos',
  gasto_ss_empresa: 'cuentas.gasto_ss_empresa',
  retencion: 'cuentas.retencion',
  organismos: 'cuentas.organismos',
  neto: 'cuentas.neto'
};

class AsientoPersonal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'asiento-personal';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'asiento-personal.construir.response', async (d) => {
      const res = await this._construir(d);
      if (res.status !== 200) this.eventBus?.publish('asiento-personal.construir.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: construir(recibo, obligacion ss) → Asiento EQUILIBRADO ──
  async _construir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { recibo, origen_recibo } = await this._recibo(pid, input);
    const { obligacion, origen_obligacion } = await this._obligacion(pid, input, recibo);
    const cuentas = this._mapaCuentas(input.cuentas);

    if (!recibo && !obligacion) {
      return {
        status: 200,
        data: {
          project_id: pid,
          asiento: null,
          abierto: true,
          faltantes: ['recibo', 'obligacion_ss'],
          motivo: 'no se construye asiento sin recibo ni obligacion de SS (nada se estima)'
        }
      };
    }

    const faltantes = [];
    const bruto = recibo ? this._num(recibo.bruto) : null;
    const retencion = recibo ? this._num(recibo.retencion) : null;
    const neto = recibo ? this._num(recibo.neto) : null;
    if (recibo && bruto === null) faltantes.push('recibo.bruto');
    if (recibo && retencion === null) faltantes.push('recibo.retencion');
    if (recibo && neto === null) faltantes.push('recibo.neto');

    const cuota_empresa = obligacion ? this._num(obligacion.cuota_empresa) : null;
    const cuota_trabajador = obligacion ? this._num(obligacion.cuota_trabajador) : null;
    if (obligacion && cuota_empresa === null) faltantes.push('ss.cuota_empresa');
    if (obligacion && cuota_trabajador === null) faltantes.push('ss.cuota_trabajador');

    const debe = [];
    const haber = [];
    const partida = (rol, lado, importe, clave_cuenta) => {
      const cuenta = cuentas[clave_cuenta] != null ? cuentas[clave_cuenta] : null;
      const p = { rol, cuenta, importe, descripcion: this._desc(rol) };
      (lado === 'debe' ? debe : haber).push(p);
      return p;
    };

    // 1) DEBE — gasto de sueldos = bruto del recibo (copiado, no calculado aqui).
    if (bruto !== null) partida(ROLES.SUELDOS, 'debe', bruto, CUENTAS.gasto_sueldos);
    // 2) DEBE — gasto de SS a cargo de la empresa (de la obligacion G2).
    if (cuota_empresa !== null) partida(ROLES.SS_EMPRESA, 'debe', cuota_empresa, CUENTAS.gasto_ss_empresa);
    // 3) HABER — neto a pagar al trabajador = neto del recibo (copiado).
    if (neto !== null) partida(ROLES.NETO, 'haber', neto, CUENTAS.neto);
    // 4) HABER — retencion de IRPF practicada (deuda con la Administracion).
    if (retencion !== null) partida(ROLES.RETENCION, 'haber', retencion, CUENTAS.retencion);
    // 5) HABER — obligacion con la TGSS = parte empresa + parte trabajador (de la obligacion G2).
    const organismos = (cuota_empresa !== null && cuota_trabajador !== null)
      ? this._round(cuota_empresa + cuota_trabajador, 2) : null;
    if (organismos !== null) partida(ROLES.ORGANISMOS, 'haber', organismos, CUENTAS.organismos);

    const suma_debe = this._round(debe.reduce((s, p) => s + p.importe, 0), 2);
    const suma_haber = this._round(haber.reduce((s, p) => s + p.importe, 0), 2);
    const completa = faltantes.length === 0;
    const descuadre = this._round(suma_debe - suma_haber, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        asiento: {
          clase: 'nomina',
          empleado: recibo ? recibo.empleado : null,
          periodo: recibo ? recibo.periodo : null,
          fecha: input.fecha != null ? String(input.fecha) : (recibo ? recibo.fecha : null),
          clave_natural: recibo ? recibo.clave_natural : null,
          partidas: [...debe, ...haber],
          debe,
          haber,
          total_debe: suma_debe,
          total_haber: suma_haber,
          // Se PUBLICAN las dos sumas y si cuadra: el equilibrio es del asiento, no se parchea.
          cuadra: completa ? descuadre === 0 : null,
          descuadre: completa ? descuadre : null,
          // Las cuentas son DECLARABLES: se declara si vinieron o no (cero numeros cableados).
          cuentas_origen: Object.keys(cuentas).length > 0 ? 'declaradas' : 'sin_declarar',
          cuentas_cableadas: false,
          origen_recibo,
          origen_obligacion,
          calculado_aqui: true,
          calculo_puro: true
        },
        faltantes,
        abierto: faltantes.length > 0,
        motivo: faltantes.length > 0
          ? `hay importes declarados incompletos: ${faltantes.join(', ')} (nada se estima)`
          : null
      }
    };
  }

  // El RECIBO: declarado en la peticion, o pedido a recibo-nomina (G1) POR EVENTO.
  async _recibo(pid, input = {}) {
    const declarado = input.recibo || input.nomina || null;
    if (declarado && typeof declarado === 'object') return { recibo: declarado, origen_recibo: 'declarado' };
    const clave = input.clave_natural != null ? String(input.clave_natural) : null;
    if (clave || (input.empleado != null && input.periodo != null)) {
      const r = await this._rpc('recibo-nomina.dar_forma.request', {
        project_id: pid, clave_natural: clave, empleado: input.empleado, periodo: input.periodo
      }, { timeout_ms: 4000 });
      const rec = r && r.data ? r.data.recibo : null;
      if (rec) return { recibo: rec, origen_recibo: 'recibo-nomina' };
    }
    return { recibo: null, origen_recibo: null };
  }

  // La OBLIGACION de SS: declarada en la peticion, o pedida a obligacion-seguridad-social (G2) POR EVENTO.
  async _obligacion(pid, input = {}, recibo = null) {
    const declarada = input.obligacion || input.ss || null;
    if (declarada && typeof declarada === 'object') {
      const cuota_empresa = this._num(declarada.cuota_empresa != null ? declarada.cuota_empresa : declarada.gasto_empresa);
      const cuota_trabajador = this._num(declarada.cuota_trabajador);
      return { obligacion: { cuota_empresa, cuota_trabajador }, origen_obligacion: 'declarada' };
    }
    // Sin obligacion declarada se PIDE por evento (solo si hay recibo o tipos declarados).
    if (!recibo && !input.tipos) return { obligacion: null, origen_obligacion: null };
    const r = await this._rpc('obligacion-seguridad-social.calcular.request', {
      project_id: pid,
      recibo,
      clave_natural: input.clave_natural ?? (recibo ? recibo.clave_natural : null),
      tipos: input.tipos,
      bases: input.bases
    }, { timeout_ms: 4000 });
    const ob = r && r.data ? r.data.obligacion : null;
    if (ob) {
      return {
        obligacion: { cuota_empresa: this._num(ob.cuota_empresa), cuota_trabajador: this._num(ob.cuota_trabajador) },
        origen_obligacion: 'obligacion-seguridad-social'
      };
    }
    // Si el recibo ya trae la cotizacion del trabajador, se usa SOLO esa para el HABER de organismos.
    if (recibo) {
      const ct = this._num(recibo.cotizacion_trabajador);
      if (ct !== null) {
        return { obligacion: { cuota_empresa: null, cuota_trabajador: ct }, origen_obligacion: 'recibo.cotizacion_trabajador' };
      }
    }
    return { obligacion: null, origen_obligacion: null };
  }

  // El mapa de cuentas es DECLARABLE: {gasto_sueldos, gasto_ss_empresa, retencion, organismos, neto}.
  // Acepta los nombres del contrato o alias directos (sueldos, ss_empresa, irpf, tgss, trabajador).
  _mapaCuentas(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const alias = {
      gasto_sueldos: ['gasto_sueldos', 'sueldos', 'cuenta_sueldos'],
      gasto_ss_empresa: ['gasto_ss_empresa', 'ss_empresa', 'cuenta_ss_empresa'],
      retencion: ['retencion', 'irpf', 'cuenta_retencion', 'hp_acreedores'],
      organismos: ['organismos', 'tgss', 'ss_acreedores', 'organismos_ss'],
      neto: ['neto', 'neto_a_pagar', 'cuenta_neto', 'remuneraciones_pendientes']
    };
    const out = {};
    for (const [rol, claves] of Object.entries(alias)) {
      for (const k of claves) {
        if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') { out[rol] = String(raw[k]); break; }
      }
    }
    return out;
  }

  _desc(rol) {
    const d = {
      gasto_sueldos: 'gasto de sueldos (bruto del recibo)',
      gasto_ss_empresa: 'gasto de Seguridad Social a cargo de la empresa',
      neto_a_pagar: 'neto a pagar al trabajador',
      retencion_irpf_pasivo: 'retencion de IRPF practicada',
      organismos_ss_pasivo: 'organismos de la Seguridad Social acreedores'
    };
    return d[rol] || rol;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolConstruir(params) { return this._construir(params); }
}

module.exports = AsientoPersonal;
