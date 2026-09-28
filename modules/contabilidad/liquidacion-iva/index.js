/**
 * contabilidad/liquidacion-iva — REFLEJO STATELESS (D1 + D2 + D3, hoja del plan).
 *
 * EL IMPUESTO INDIRECTO DERIVADO DEL LIBRO con los TIPOS DECLARADOS
 * (IVA/IGIC/IPSI segun territorio DECLARADO en perfil-administrativo D15).
 * NINGUN TIPO CABLEADO: el sistema no asume 21/10/4 — los tipos y las cuentas de
 * impuesto son DATOS declarables (D10/D11, cola-declaraciones-criterio K9), y el
 * impuesto indirecto concreto tampoco se asume "IVA": se asume el que el perfil
 * declara. Sobre el libro:
 *   D1  _devengado(periodo)   -> Importe (repercutido)
 *   D1  _soportado(periodo)   -> Importe (deducible)
 *   D1  _liquidar(periodo)    -> Liquidacion {devengado, deducible, resultado}
 *   D2  _construir303(periodo)-> Modelo (autoliquidacion periodica)
 *   D3  _resumen390(ejercicio)-> Modelo (resumen anual)
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated.
 * Cada op entra objeto, sale objeto. El libro lo da escritor-diario (B2) o
 * mayor-balanza (B3) por EVENTO; el perfil lo da perfil-administrativo (D15) por
 * EVENTO; los tipos/cuentas los da cola-declaraciones-criterio (K9) por EVENTO.
 * Contrato TOLERANTE pero EXIGENTE en lo fiscal: sin TIPOS DECLARADOS no se
 * calcula nada (422 TIPOS_NO_DECLARADOS — la ley no se cablea); sin libro se
 * devuelve 503 DEPENDENCIA_NO_DISPONIBLE. JAMAS se inventa una cuota.
 *
 * Emisor/par de fallo: exito publica contabilidad.iva_liquidado /
 * contabilidad.modelo_construido; error su par determinista.
 * NO REUTILIZA: IVA y modelos no existen en el inventario (verificado: 0
 * modulos). La ley entra como DATO declarable.
 *
 * Ver hojas D1/D2/D3 del diseno-oop y bloque `liquidacion-iva` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Cuentas de impuesto POR DEFECTO: declarables (sobreescribibles en el payload o
// en cola-declaraciones-criterio D10/D11). El sistema NO cablea estas cuentas
// como ley: son el valor declarable inicial, no una constante de la logica.
const CUENTAS_POR_DEFECTO = {
  devengado: ['477', '472'],
  soportado: ['472', '477'],
  repercutido: ['477'],
  deducible: ['472']
};

class LiquidacionIVA extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'liquidacion-iva';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. Libro, tipos y perfil llegan
    // por payload o se LEEN por EVENTO.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onLiquidarRequest(e) {
    return this._atender(e, 'liquidar', 'contabilidad.iva.liquidar.response', async (d) => {
      const res = await this._liquidar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.iva_liquidado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.iva.liquidar.failed', res);
      }
      return res;
    });
  }

  on303Request(e) {
    return this._atender(e, '303', 'contabilidad.modelo.303.response', async (d) => {
      const res = await this._construir303(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.modelo_construido', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.modelo.303.failed', res);
      }
      return res;
    });
  }

  on390Request(e) {
    return this._atender(e, '390', 'contabilidad.modelo.390.response', async (d) => {
      const res = await this._resumen390(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.modelo_construido', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.modelo.390.failed', res);
      }
      return res;
    });
  }

  // ── dependencias por EVENTO (contrato TOLERANTE: null = no disponible) ──

  async _libroDe(pid, input) {
    const enPayload = input && (input.diario || input.asientos || input.libro);
    if (Array.isArray(enPayload)) return enPayload;
    if (enPayload && Array.isArray(enPayload.diario)) return enPayload.diario;

    const resp = await this._rpc('contabilidad.diario.leer.request', { project_id: pid }, { timeout_ms: 4000 });
    if (resp && resp.status === 200 && resp.data) {
      return (resp.data.diario || resp.data.asientos) || [];
    }
    const respMayor = await this._rpc('contabilidad.mayor.saldo.request', { project_id: pid }, { timeout_ms: 4000 });
    if (respMayor && respMayor.status === 200 && respMayor.data && Array.isArray(respMayor.data.saldos)) {
      return respMayor.data.saldos;
    }
    return null;
  }

  // Perfil administrativo (D15) por EVENTO: territorio + impuesto indirecto.
  async _perfilDe(pid, input) {
    if (input && (input.territorio || input.impuesto_indirecto)) {
      return {
        territorio: (input.territorio && String(input.territorio).toUpperCase()) || null,
        impuesto_indirecto: (input.impuesto_indirecto && String(input.impuesto_indirecto).toUpperCase()) || null,
        fuente: 'PAYLOAD'
      };
    }
    const resp = await this._rpc('contabilidad.perfil.aplicables.request',
      { project_id: pid, sociedad: (input && input.sociedad) || undefined }, { timeout_ms: 4000 });
    if (resp && resp.status === 200 && resp.data) {
      return {
        territorio: resp.data.territorio || null,
        impuesto_indirecto: resp.data.impuesto_indirecto || null,
        fuente: 'PERFIL_ADMINISTRATIVO'
      };
    }
    return null;
  }

  // Tipos/cuentas declarables (D10/D11) por EVENTO.
  async _parametrosDe(pid, input) {
    const declarado = { tipos: null, cuentas: null, fuente: null };

    if (input && input.tipos && typeof input.tipos === 'object') {
      declarado.tipos = input.tipos;
      declarado.fuente = 'PAYLOAD';
    } else {
      const resp = await this._rpc('contabilidad.criterio.leer.request',
        { project_id: pid, criterio: 'D11' }, { timeout_ms: 4000 });
      if (resp && resp.status === 200 && resp.data && resp.data.hallado) {
        const valor = (resp.data.parametro && resp.data.parametro.valor) || null;
        if (valor && typeof valor === 'object' && valor.tipos) {
          declarado.tipos = valor.tipos;
          declarado.fuente = 'COLA_DECLARACIONES_CRITERIO';
        } else if (valor && typeof valor === 'object') {
          declarado.tipos = valor;
          declarado.fuente = 'COLA_DECLARACIONES_CRITERIO';
        }
      }
    }

    if (input && input.cuentas && typeof input.cuentas === 'object') {
      declarado.cuentas = input.cuentas;
    }
    return declarado;
  }

  // ── proyecciones puras (deterministas) ──

  _normalizarTipos(tipos) {
    if (!tipos || typeof tipos !== 'object') return null;
    const out = {};
    for (const [k, v] of Object.entries(tipos)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[String(k).toUpperCase()] = this._round(n, 2);
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  _cuentasDe(input, parametros) {
    const c = (input && input.cuentas) || (parametros && parametros.cuentas) || CUENTAS_POR_DEFECTO;
    const norm = (arr) => (Array.isArray(arr) ? arr.map((x) => String(x).replace(/\D/g, '').slice(0, 3)).filter(Boolean) : []);
    return {
      repercutido: norm(c.repercutido || c.devengado),
      deducible: norm(c.deducible || c.soportado)
    };
  }

  _enPeriodo(asiento, periodo) {
    if (!periodo) return true;
    return String(asiento.periodo || '') === String(periodo)
      || String(asiento.fecha_operacion || asiento.fecha || '').startsWith(String(periodo));
  }

  _apuntesDe(asiento) {
    return Array.isArray(asiento && asiento.apuntes) ? asiento.apuntes
      : (Array.isArray(asiento && asiento.lineas) ? asiento.lineas : []);
  }

  // devengado(periodo) -> Importe (D1): el impuesto REPERCUTIDO del periodo.
  _devengado(pid, libro, cuentas, periodo) {
    let total = 0;
    for (const asiento of libro) {
      if (!this._enPeriodo(asiento, periodo)) continue;
      for (const a of this._apuntesDe(asiento)) {
        const cuenta = String((a && a.cuenta) || '').slice(0, 3);
        if (!cuentas.repercutido.includes(cuenta)) continue;
        total += Number(a.haber) || 0;
        total -= Number(a.debe) || 0;
      }
    }
    return this._round(total, 2);
  }

  // soportado(periodo) -> Importe (D1): el impuesto DEDUCIBLE del periodo.
  _soportado(pid, libro, cuentas, periodo) {
    let total = 0;
    for (const asiento of libro) {
      if (!this._enPeriodo(asiento, periodo)) continue;
      for (const a of this._apuntesDe(asiento)) {
        const cuenta = String((a && a.cuenta) || '').slice(0, 3);
        if (!cuentas.deducible.includes(cuenta)) continue;
        total += Number(a.debe) || 0;
        total -= Number(a.haber) || 0;
      }
    }
    return this._round(total, 2);
  }

  // porTipo(periodo) -> List<{tipo, base, cuota}> con los TIPOS DECLARADOS.
  _porTipo(libro, tipos, periodo) {
    const acumulado = new Map();
    for (const asiento of libro) {
      if (!this._enPeriodo(asiento, periodo)) continue;
      for (const a of this._apuntesDe(asiento)) {
        const tipoDeclarado = a && (a.tipo_impuesto ?? a.tipo_iva ?? a.tipo);
        if (tipoDeclarado === undefined || tipoDeclarado === null) continue;
        const clave = String(tipoDeclarado);
        if (!(clave in tipos) && !(clave.toUpperCase() in tipos)) continue;
        const t = tipos[clave] !== undefined ? tipos[clave] : tipos[clave.toUpperCase()];
        const claveNorm = String(t);
        const base = Number(a.base) || (Number(a.debe) || 0) + (Number(a.haber) || 0) || 0;
        const actual = acumulado.get(claveNorm) || { tipo: t, base: 0, cuota: 0 };
        actual.base = this._round(actual.base + base, 2);
        actual.cuota = this._round(actual.base * t / 100, 2);
        acumulado.set(claveNorm, actual);
      }
    }
    return [...acumulado.values()];
  }

  // liquidar(periodo) -> Liquidacion {devengado, deducible, resultado} (D1).
  async _liquidar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const tipos = this._normalizarTipos((input && input.tipos) || null);
    const parametros = await this._parametrosDe(pid, input);
    const tiposEfectivos = tipos || this._normalizarTipos(parametros.tipos);

    if (!tiposEfectivos) {
      // LA LEY NO SE CABLEA: sin tipos declarados NO se calcula nada.
      return this._errorResponse(422, 'TIPOS_NO_DECLARADOS',
        'los tipos del impuesto son DATOS DECLARABLES (D10/D11): sin tipos declarados no se liquida; el sistema no asume 21/10/4', {
          dependencia: 'cola-declaraciones-criterio (D11)',
          accion: 'DECLARAR_TIPOS',
          tipos_cableados: false
        });
    }

    const perfil = await this._perfilDe(pid, input);
    const libro = await this._libroDe(pid, input);
    if (libro === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'escritor-diario (B2) no respondio: no se liquida el impuesto sin libro', {
          dependencia: 'escritor-diario', accion: 'NO_CALCULAR_PUBLICAR_FALLO'
        });
    }

    const cuentas = this._cuentasDe(input, parametros);
    const periodo = (input && input.periodo) || null;

    const devengado = this._devengado(pid, libro, cuentas, periodo);
    const soportado = this._soportado(pid, libro, cuentas, periodo);
    const resultado = this._round(devengado - soportado, 2);
    const porTipo = this._porTipo(libro, tiposEfectivos, periodo);

    const impuesto = (perfil && perfil.impuesto_indirecto) || (input && input.impuesto_indirecto) || null;

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo,
        impuesto_indirecto: impuesto,
        territorio: (perfil && perfil.territorio) || null,
        liquidacion: {
          devengado,
          deducible: soportado,
          soportado,
          resultado,
          a_ingresar: resultado > 0 ? resultado : 0,
          a_compensar: resultado < 0 ? this._round(-resultado, 2) : 0,
          por_tipo: porTipo
        },
        tipos_declarados: tiposEfectivos,
        fuente_tipos: tipos ? 'PAYLOAD' : (parametros.fuente || null),
        fuente_perfil: perfil ? perfil.fuente : 'NO_DISPONIBLE',
        n_asientos: libro.length,
        tipos_cableados: false,
        derivado_del_libro: true,
        determinista: true,
        nota: 'impuesto indirecto DERIVADO del libro con los tipos DECLARADOS: ningun tipo cableado; el impuesto concreto lo declara el perfil'
      }
    };
  }

  // construir303(periodo) -> Modelo (D2) desde la liquidacion. Ningun tipo ni plazo cableado.
  async _construir303(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const liq = await this._liquidar(input);
    if (liq.status !== 200) return liq;
    const L = liq.data.liquidacion;

    return {
      status: 200,
      data: {
        project_id: pid,
        modelo: '303',
        periodo: liq.data.periodo,
        ejercicio: (input && input.ejercicio) || null,
        impuesto_indirecto: liq.data.impuesto_indirecto,
        territorio: liq.data.territorio,
        casillas: {
          devengado_repercutido: L.devengado,
          deducible_soportado: L.deducible,
          resultado: L.resultado,
          a_ingresar: L.a_ingresar,
          a_compensar: L.a_compensar,
          por_tipo: L.por_tipo
        },
        modelo_construido: true,
        presentado: false,
        presentar_es_del_asesor: true,
        tipos_cableados: false,
        nota: 'autoliquidacion periodica construida desde la liquidacion: el sistema PREPARA, no presenta'
      }
    };
  }

  // resumir390(ejercicio) -> Modelo (D3), resumen anual. Determinista desde el libro/liquidaciones.
  async _resumen390(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const ejercicio = (input && (input.ejercicio || input.periodo)) || null;
    const liquidaciones = Array.isArray(input && input.liquidaciones) ? input.liquidaciones : null;

    let periodos = liquidaciones;
    if (!periodos) {
      // Sin liquidaciones en payload: se resume el ejercicio entero sobre el libro.
      const liq = await this._liquidar({ ...input, periodo: ejercicio });
      if (liq.status !== 200) return liq;
      periodos = [liq.data.liquidacion];
    }

    const devengado = this._round(periodos.reduce((t, l) => t + (Number(l && (l.devengado !== undefined ? l.devengado : l.devengado_repercutido)) || 0), 0), 2);
    const deducible = this._round(periodos.reduce((t, l) => t + (Number(l && (l.deducible !== undefined ? l.deducible : (l.soportado !== undefined ? l.soportado : l.deducible_soportado))) || 0), 0), 2);
    const resultado = this._round(devengado - deducible, 2);

    return {
      status: 200,
      data: {
        project_id: pid,
        modelo: '390',
        ejercicio,
        impuesto_indirecto: (input && input.impuesto_indirecto) || null,
        resumen: {
          devengado,
          deducible,
          resultado,
          a_ingresar: resultado > 0 ? resultado : 0,
          a_compensar: resultado < 0 ? this._round(-resultado, 2) : 0
        },
        n_liquidaciones: periodos.length,
        modelo_construido: true,
        presentado: false,
        determinista: true,
        nota: 'resumen anual del impuesto indirecto: determinista desde el libro/liquidaciones'
      }
    };
  }

  // ── Tools ──
  toolLiquidar(params) { return this._liquidar(params); }
  toolConstruir303(params) { return this._construir303(params); }
  toolResumen390(params) { return this._resumen390(params); }
}

module.exports = LiquidacionIVA;
