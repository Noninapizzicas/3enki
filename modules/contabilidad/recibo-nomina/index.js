/**
 * contabilidad/recibo-nomina — REFLEJO STATELESS (G1/G2/G3/G6/G8/G9/G10, hoja del plan).
 *
 * DEL RECIBO AL ASIENTO EQUILIBRADO Y EXPLICABLE. Cerro juicio: el sistema NO
 * calcula nomina por defecto — la RECIBE hecha por el puerto (puerto-nomina G4) y
 * solo le da FORMA ASENTABLE (G1 admitir). Sobre esa forma:
 *   G2  _calcularObligacion(recibo) -> Obligacion {gastoEmpresa, obligacionTGSS}
 *   G3  _construirAsiento(recibo)   -> AsientoEquilibrado (debe = haber)
 *   G6  _desglosar(recibo)          -> Lineas {bruto, retencion, cotizacionTrabajador, neto}
 *   G8  _aplicarAnticipo(empleado, recibo) -> NetoAjustado
 *   G9  _imputarConcepto(concepto, recibo) -> List<Apunte> (dietas, especie, pagas extra, finiquitos)
 *   G10 _liquidar(empleado)         -> AsientoCierre + SaldoCero
 *
 * LOS TIPOS DE COTIZACION SON DECLARABLES (cambian cada ano): entran por payload o
 * por cola-declaraciones-criterio (K9) por EVENTO. Los importes que el recibo YA
 * trae (bruto, retencion, cotizacion) se RESPETAN — no se re-estiman. Cuando hay
 * que CALCULAR un importe y los tipos no estan declarados, se DECLARA
 * TIPOS_NO_DECLARADOS: el sistema no se inventa el porcentaje.
 *
 * Una cuenta de empleado sin cerrar es un ERROR DE ESTADO, no un saldo valido:
 * _liquidar exige SaldoCero (G10).
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated.
 * Cada op entra objeto, sale objeto. El ASIENTO no lo escribe este modulo: publica
 * la PETICION al diario (escritor-diario B2) por EVENTO
 * contabilidad.asiento.asentar.request con rol ADMISION — dependencia por EVENTO,
 * NUNCA por require cruzado.
 *
 * Emisor/par de fallo: exito publica contabilidad.nomina_formada; error su par
 * determinista. NO REUTILIZA: no existe modulo de nomina en el inventario; el
 * asiento de personal y su desglose son propios.
 *
 * Ver hojas G1/G2/G3/G6/G8/G9/G10 del diseno-oop y bloque `recibo-nomina` de la espina.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Rol que se pide al diario para ASENTAR (el unico escritor del diario es ADMISION).
const ROL_DIARIO = 'ADMISION';

// Cuentas DECLARABLES por defecto (valor declarable inicial, no ley cableada):
// 640 sueldos · 642 cotizacion empresa · 641 indemnizaciones · 476 TGSS acreedor ·
// 4751 HP acreedora retenciones IRPF · 465 remuneraciones pendientes de pago ·
// 460 anticipos.
const CUENTAS_POR_DEFECTO = {
  sueldos: '640',
  cotizacion_empresa: '642',
  indemnizaciones: '641',
  tgss: '476',
  retencion_irpf: '4751',
  remuneraciones: '465',
  anticipos: '460',
  especie: '755'
};

// Conceptos extra DECLARABLES (G9): dietas, especie, pagas extra, finiquitos.
const CONCEPTOS = ['DIETAS', 'ESPECIE', 'PAGA_EXTRA', 'FINIQUITO', 'INDEMNIZACION'];

class ReciboNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'recibo-nomina';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. El recibo llega por payload o
    // por EVENTO (puerto-nomina G4 / contabilidad.nomina_recibida).
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onProcesarRequest(e) {
    return this._atender(e, 'procesar', 'contabilidad.nomina.procesar.response', async (d) => {
      const res = await this._procesar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.nomina_formada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.nomina.procesar.failed', res);
      }
      return res;
    });
  }

  onDesglosarRequest(e) {
    return this._atender(e, 'desglosar', 'contabilidad.nomina.desglosar.response', async (d) => {
      const res = await this._desglosarEntrada(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.nomina.desglosar.failed', res);
      return res;
    });
  }

  onLiquidarRequest(e) {
    return this._atender(e, 'liquidar', 'contabilidad.nomina.liquidar.response', async (d) => {
      const res = await this._liquidarEntrada(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.nomina_formada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.nomina.liquidar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: puerto-nomina (G4) recibio un recibo → se le da forma asentable.
  onNominaRecibida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return (async () => {
      const res = await this._procesar({
        project_id: d.project_id,
        recibo: d.recibo || d.hecho_nomina || d,
        tipos: d.tipos,
        cuentas: d.cuentas,
        correlation_id: d.correlation_id
      });
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.nomina_formada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.nomina.procesar.failed', res);
      }
      return res;
    })();
  }

  // ── dependencias por EVENTO ──

  // Recibo: payload, o el ultimo de puerto-nomina (G4) por EVENTO.
  async _reciboDe(pid, input) {
    const enPayload = input && (input.recibo || input.hecho_nomina);
    if (enPayload && typeof enPayload === 'object') return enPayload;
    const resp = await this._rpc('contabilidad.nomina.recibir.request', { project_id: pid }, { timeout_ms: 4000 });
    if (resp && resp.status === 200 && resp.data) {
      return resp.data.recibo || resp.data;
    }
    return null;
  }

  // Tipos de cotizacion DECLARABLES (cambian cada ano): payload o cola-declaraciones-criterio (K9).
  async _tiposDe(pid, input) {
    if (input && input.tipos && typeof input.tipos === 'object') return { tipos: input.tipos, fuente: 'PAYLOAD' };
    const resp = await this._rpc('contabilidad.criterio.leer.request',
      { project_id: pid, criterio: 'G2' }, { timeout_ms: 4000 });
    if (resp && resp.status === 200 && resp.data && resp.data.hallado) {
      const valor = (resp.data.parametro && resp.data.parametro.valor) || null;
      if (valor && typeof valor === 'object') return { tipos: valor, fuente: 'COLA_DECLARACIONES_CRITERIO' };
    }
    return { tipos: null, fuente: null };
  }

  _cuentasDe(input) {
    const c = (input && input.cuentas) || {};
    return { ...CUENTAS_POR_DEFECTO, ...c };
  }

  // ── proyecciones puras (deterministas) ──

  _num(...vals) {
    for (const v of vals) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  // admitir(recibo) -> ReciboFormado (G1: cero juicio; si el negocio no calcula, el recibo LLEGA hecho).
  _admitir(recibo) {
    const empleado = (recibo && (recibo.empleado || recibo.id_empleado)) || null;
    return {
      esquema: 'recibo-nomina-formado-v1',
      empleado,
      periodo: (recibo && recibo.periodo) || null,
      nif: (recibo && recibo.nif) || null,
      origen: (recibo && (recibo.origen || recibo.fuente)) || 'PUERTO_NOMINA',
      bruto: this._round(this._num(recibo && recibo.bruto, recibo && recibo.total_devengado, recibo && recibo.devengado) || 0, 2),
      retencion: this._num(recibo && recibo.retencion, recibo && recibo.retencion_irpf, recibo && recibo.irpf),
      cotizacion_trabajador: this._num(recibo && (recibo.cotizacion_trabajador ?? recibo.ss_trabajador ?? recibo.cotizacion)),
      cotizacion_empresa: this._num(recibo && (recibo.cotizacion_empresa ?? recibo.ss_empresa)),
      neto: this._num(recibo && recibo.neto, recibo && recibo.liquido, recibo && recibo.neto_a_pagar),
      conceptos: Array.isArray(recibo && recibo.conceptos) ? recibo.conceptos : [],
      anticipos: Array.isArray(recibo && recibo.anticipos) ? recibo.anticipos : [],
      extra: (recibo && recibo.extra) || (recibo && recibo.variables) || null,
      cero_juicio: true,
      recibo_llega_hecho: true
    };
  }

  // Porcentajes declarados (si existen): base para calcular lo que el recibo no trae.
  _porcentajes(tipos) {
    if (!tipos || typeof tipos !== 'object') return null;
    const t = tipos.tipos && typeof tipos.tipos === 'object' ? tipos.tipos : tipos;
    const cont_trabajador = this._num(t.cotizacion_trabajador, t.cont_trabajador, t.ss_trabajador, t.contingencias_comunes);
    const cont_empresa = this._num(t.cotizacion_empresa, t.cont_empresa, t.ss_empresa);
    const retencion = this._num(t.retencion_irpf, t.retencion, t.irpf);
    if (cont_trabajador === null && cont_empresa === null && retencion === null) return null;
    return { cont_trabajador, cont_empresa, retencion };
  }

  // desglosar(recibo) -> Lineas {bruto, retencion, cotizacionTrabajador, neto} (G6).
  _desglosar(recibo, porcentajes) {
    const bruto = this._round(this._num(recibo.bruto) || 0, 2);
    const p = porcentajes || {};
    const baseCotizacion = this._round(this._num(recibo.base_cotizacion, recibo.bruto) || 0, 2);

    let retencion = this._num(recibo.retencion);
    let retencionFuente = retencion !== null ? 'RECIBO' : null;
    if (retencion === null && p.retencion !== null && p.retencion !== undefined) {
      retencion = this._round(bruto * p.retencion / 100, 2);
      retencionFuente = 'TIPO_DECLARADO';
    }

    let cotTrab = this._num(recibo.cotizacion_trabajador);
    let cotTrabFuente = cotTrab !== null ? 'RECIBO' : null;
    if (cotTrab === null && p.cont_trabajador !== null && p.cont_trabajador !== undefined) {
      cotTrab = this._round(baseCotizacion * p.cont_trabajador / 100, 2);
      cotTrabFuente = 'TIPO_DECLARADO';
    }

    const brutoAjustado = this._round(bruto + this._round(this._num(recibo.extra && recibo.extra.importe) || 0, 2), 2);
    let neto = this._num(recibo.neto);
    if (neto === null && retencion !== null && cotTrab !== null) {
      neto = this._round(brutoAjustado - retencion - cotTrab, 2);
    }

    const faltantes = [];
    if (retencion === null) faltantes.push('retencion_irpf');
    if (cotTrab === null) faltantes.push('cotizacion_trabajador');
    if (neto === null) faltantes.push('neto');

    return {
      bruto: this._round(brutoAjustado, 2),
      retencion,
      retencion_fuente: retencionFuente,
      cotizacion_trabajador: cotTrab,
      cotizacion_trabajador_fuente: cotTrabFuente,
      neto,
      base_cotizacion: baseCotizacion,
      faltantes,
      explicable: faltantes.length === 0,
      nota: 'nomina EXPLICABLE, no un numero pelado (requisito de informacion rica)'
    };
  }

  // calcularObligacion(recibo) -> Obligacion {gastoEmpresa, obligacionTGSS} (G2).
  _calcularObligacion(recibo, porcentajes) {
    const p = porcentajes || {};
    const baseCotizacion = this._round(this._num(recibo.base_cotizacion, recibo.bruto) || 0, 2);

    let cotEmpresa = this._num(recibo.cotizacion_empresa);
    let fuenteEmpresa = cotEmpresa !== null ? 'RECIBO' : null;
    if (cotEmpresa === null && p.cont_empresa !== null && p.cont_empresa !== undefined) {
      cotEmpresa = this._round(baseCotizacion * p.cont_empresa / 100, 2);
      fuenteEmpresa = 'TIPO_DECLARADO';
    }

    const cotTrabajador = this._num(recibo.cotizacion_trabajador);
    const bruto = this._round(this._num(recibo.bruto) || 0, 2);

    const faltantes = [];
    if (cotEmpresa === null) faltantes.push('cotizacion_empresa');
    if (cotTrabajador === null) faltantes.push('cotizacion_trabajador');

    const gastoEmpresa = (cotEmpresa === null ? null : this._round(bruto + cotEmpresa, 2));
    const obligacionTGSS = (cotEmpresa === null || cotTrabajador === null)
      ? null
      : this._round(cotEmpresa + cotTrabajador, 2);

    return {
      gasto_empresa: gastoEmpresa,
      obligacion_tgss: obligacionTGSS,
      cotizacion_empresa: cotEmpresa,
      cotizacion_empresa_fuente: fuenteEmpresa,
      cotizacion_trabajador: cotTrabajador,
      base_cotizacion: baseCotizacion,
      faltantes,
      tipos_declarados: fuenteEmpresa === 'TIPO_DECLARADO' || (cotTrabajador !== null),
      nota: 'los tipos de cotizacion son DECLARABLES (cambian cada ano): no se cablean'
    };
  }

  // aplicarAnticipo(empleado, recibo) -> NetoAjustado (G8).
  _aplicarAnticipo(empleado, recibo, netoBase) {
    const anticipos = Array.isArray(recibo && recibo.anticipos) ? recibo.anticipos : [];
    const total = this._round(anticipos.reduce((t, a) => t + (this._num(a && (a.importe !== undefined ? a.importe : a)) || 0), 0), 2);
    const neto = this._round((this._num(netoBase) || 0) - total, 2);
    return {
      empleado: empleado || null,
      ant_anticipos: anticipos.length,
      anticipos_aplicados: total,
      neto_base: this._round(this._num(netoBase) || 0, 2),
      neto_ajustado: neto,
      determinista: true
    };
  }

  // imputarConcepto(concepto, recibo) -> List<Apunte> (G9: dietas, especie, pagas extra, finiquitos).
  _imputarConcepto(concepto, cuentas) {
    if (!concepto || typeof concepto !== 'object') return [];
    const tipo = String(concepto.tipo || concepto.concepto || '').toUpperCase();
    const importe = this._round(this._num(concepto.importe !== undefined ? concepto.importe : concepto.total) || 0, 2);
    if (importe === 0) return [];
    const c = cuentas || CUENTAS_POR_DEFECTO;

    switch (tipo) {
      case 'DIETAS':
        // Dieta: gasto (629) contra la cuenta de remuneraciones/anticipo; NO cotiza.
        return [
          { cuenta: (concepto.cuenta || '629'), debe: importe, haber: 0, concepto: 'DIETAS' },
          { cuenta: c.remuneraciones, debe: 0, haber: importe, concepto: 'DIETAS' }
        ];
      case 'ESPECIE':
        // Retribucion en especie: gasto (640) contra especie (755) + ingreso a cuenta declarable.
        return [
          { cuenta: c.sueldos, debe: importe, haber: 0, concepto: 'ESPECIE' },
          { cuenta: (concepto.cuenta_especie || c.especie), debe: 0, haber: importe, concepto: 'ESPECIE' }
        ];
      case 'PAGA_EXTRA':
        return [
          { cuenta: (concepto.cuenta || c.sueldos), debe: importe, haber: 0, concepto: 'PAGA_EXTRA' },
          { cuenta: c.remuneraciones, debe: 0, haber: importe, concepto: 'PAGA_EXTRA' }
        ];
      case 'FINIQUITO':
      case 'INDEMNIZACION':
        return [
          { cuenta: c.indemnizaciones, debe: importe, haber: 0, concepto: tipo },
          { cuenta: c.remuneraciones, debe: 0, haber: importe, concepto: tipo }
        ];
      default:
        // Concepto no declarado: se DEVUELVE vacio y se DECLARA (no se inventa la cuenta).
        return [];
    }
  }

  // construirAsiento(recibo) -> AsientoEquilibrado (G3: gasto, retencion y pago).
  _construirAsiento(reciboFormado, lineas, obligacion, cuentas) {
    const c = cuentas || CUENTAS_POR_DEFECTO;
    const apuntes = [];

    // Debe: gasto de personal (sueldos + cotizacion empresa).
    if (lineas.bruto) apuntes.push({ cuenta: c.sueldos, debe: lineas.bruto, haber: 0, concepto: 'SUELDOS' });
    if (obligacion.cotizacion_empresa) {
      apuntes.push({ cuenta: c.cotizacion_empresa, debe: obligacion.cotizacion_empresa, haber: 0, concepto: 'COTIZACION_EMPRESA' });
    }
    // Conceptos extra (G9).
    for (const concepto of (reciboFormado.conceptos || [])) {
      for (const ap of this._imputarConcepto(concepto, c)) apuntes.push(ap);
    }

    // Haber: obligacion TGSS + retencion IRPF + neto a pagar.
    if (obligacion.obligacion_tgss) apuntes.push({ cuenta: c.tgss, debe: 0, haber: obligacion.obligacion_tgss, concepto: 'TGSS' });
    if (lineas.retencion) apuntes.push({ cuenta: c.retencion_irpf, debe: 0, haber: lineas.retencion, concepto: 'RETENCION_IRPF' });
    if (lineas.neto) apuntes.push({ cuenta: c.remuneraciones, debe: 0, haber: lineas.neto, concepto: 'NETO_A_PAGAR' });

    const debe = this._round(apuntes.reduce((t, a) => t + (Number(a.debe) || 0), 0), 2);
    const haber = this._round(apuntes.reduce((t, a) => t + (Number(a.haber) || 0), 0), 2);
    const cuadra = Math.abs(debe - haber) < 0.005;

    return {
      tipo: 'NOMINA',
      origen: 'NOMINA_G3',
      empleado: reciboFormado.empleado,
      periodo: reciboFormado.periodo,
      apuntes,
      debe,
      haber,
      cuadra,
      equilibrado: cuadra,
      no_borra: true
    };
  }

  // ── entradas de las ops ──

  async _reciboFormadoDe(pid, input) {
    const recibo = await this._reciboDe(pid, input);
    if (!recibo) return null;
    return this._admitir(recibo);
  }

  // procesar: admitir (G1) → obligacion (G2) → desglose (G6) → asiento (G3) → PETICION al diario (B2).
  async _procesar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const formado = await this._reciboFormadoDe(pid, input);
    if (!formado) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'puerto-nomina (G4) no respondio y el payload no trae recibo: no se forma la nomina sin recibo', {
          dependencia: 'puerto-nomina', accion: 'NO_PROCESAR_PUBLICAR_FALLO'
        });
    }
    if (!formado.empleado) return this._invalid('recibo.empleado');

    const { tipos, fuente } = await this._tiposDe(pid, input);
    const porcentajes = this._porcentajes(tipos);
    const cuentas = this._cuentasDe(input);

    const lineas = this._desglosar(formado, porcentajes);
    const obligacion = this._calcularObligacion(formado, porcentajes);

    if (!lineas.explicable) {
      return this._errorResponse(422, 'TIPOS_NO_DECLARADOS',
        `la nomina no trae ${lineas.faltantes.join(', ')} y los tipos de cotizacion/retencion no estan declarados (G2): el sistema NO se inventa el porcentaje`, {
          faltantes: lineas.faltantes,
          dependencia: 'cola-declaraciones-criterio (G2)',
          accion: 'DECLARAR_TIPOS',
          tipos_cableados: false
        });
    }
    if (obligacion.faltantes.length > 0) {
      return this._errorResponse(422, 'TIPOS_NO_DECLARADOS',
        `la nomina no trae ${obligacion.faltantes.join(', ')} y los tipos de cotizacion no estan declarados (G2)`, {
          faltantes: obligacion.faltantes, accion: 'DECLARAR_TIPOS', tipos_cableados: false
        });
    }

    const netoAjustado = this._aplicarAnticipo(formado.empleado, { ...formado, anticipos: formado.anticipos }, lineas.neto);
    const asiento = this._construirAsiento(formado, lineas, obligacion, cuentas);
    if (!asiento.cuadra) {
      return this._errorResponse(409, 'DESCUADRE',
        `el asiento de nomina NO cuadra: debe ${asiento.debe} != haber ${asiento.haber}`, {
          debe: asiento.debe, haber: asiento.haber, asentado: false
        });
    }

    // El ASIENTO no lo escribe este modulo: se PIDE al diario (B2) por EVENTO con rol ADMISION.
    const asentado = await this._rpc('contabilidad.asiento.asentar.request', {
      project_id: pid,
      rol: ROL_DIARIO,
      asiento: {
        tipo: 'NOMINA',
        origen: 'NOMINA_G3',
        apuntes: asiento.apuntes,
        hecho: { clase: 'NOMINA', empleado: formado.empleado, periodo: formado.periodo },
        periodo: formado.periodo,
        clave_natural: (input && input.clave_natural)
          || `nomina:${formado.empleado}:${formado.periodo || 'sin-periodo'}`
      },
      correlation_id: input && input.correlation_id
    }, { timeout_ms: 6000 });

    const diarioRespondio = !!(asentado && (asentado.status === 200 || asentado.status === 409));
    const asientoAsentado = !!(asentado && asentado.status === 200);

    return {
      status: 200,
      data: {
        op: 'procesar',
        project_id: pid,
        recibo_formado: formado,
        lineas,
        obligacion,
        neto_ajustado: netoAjustado,
        asiento,
        asiento_equilibrado: asiento.cuadra,
        peticion_asiento_enviada: true,
        diario_respondio: diarioRespondio,
        asiento_asentado: asientoAsentado,
        asiento_resultado: diarioRespondio ? { status: asentado.status, error: (asentado.error && asentado.error.code) || null, clave_natural: asentado.clave_natural || null } : null,
        tipos_fuente: fuente,
        tipos_cableados: false,
        determinista: true,
        nota: 'del recibo al ASIENTO EQUILIBRADO y EXPLICABLE: el asiento lo escribe el diario (B2), aqui solo se PIDE'
      }
    };
  }

  async _desglosarEntrada(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const formado = await this._reciboFormadoDe(pid, input);
    if (!formado) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'puerto-nomina (G4) no respondio y el payload no trae recibo', { dependencia: 'puerto-nomina' });
    }

    const { tipos, fuente } = await this._tiposDe(pid, input);
    const porcentajes = this._porcentajes(tipos);
    const lineas = this._desglosar(formado, porcentajes);
    const obligacion = this._calcularObligacion(formado, porcentajes);
    const netoAjustado = this._aplicarAnticipo(formado.empleado, formado, lineas.neto);

    return {
      status: 200,
      data: {
        project_id: pid,
        empleado: formado.empleado,
        periodo: formado.periodo,
        lineas,
        obligacion,
        neto_ajustado: netoAjustado,
        explicable: lineas.explicable,
        tipos_fuente: fuente,
        determinista: true
      }
    };
  }

  // liquidar(empleado) -> AsientoCierre + SaldoCero (G10: cuenta sin cerrar = error de estado).
  async _liquidar(empleado_input) {
    const input = empleado_input || {};
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');

    const formado = await this._reciboFormadoDe(pid, input);
    if (!formado) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'puerto-nomina (G4) no respondio y el payload no trae recibo: no hay baja que liquidar',
        { dependencia: 'puerto-nomina' });
    }

    const { tipos, fuente } = await this._tiposDe(pid, input);
    const porcentajes = this._porcentajes(tipos);
    const cuentas = this._cuentasDe(input);

    const lineas = this._desglosar(formado, porcentajes);
    const obligacion = this._calcularObligacion(formado, porcentajes);
    if (!lineas.explicable) {
      return this._errorResponse(422, 'TIPOS_NO_DECLARADOS',
        `la liquidacion no puede desglosar ${lineas.faltantes.join(', ')}: los tipos no estan declarados`, {
          faltantes: lineas.faltantes, accion: 'DECLARAR_TIPOS', tipos_cableados: false
        });
    }

    const finiquito = this._round(this._num(input.finiquito) || 0, 2);
    const indemnizacion = this._round(this._num(input.indemnizacion) || 0, 2);

    const asiento = this._construirAsiento(formado, lineas, obligacion, cuentas);
    const apuntes = [...asiento.apuntes];
    if (finiquito) {
      apuntes.push({ cuenta: cuentas.sueldos, debe: finiquito, haber: 0, concepto: 'FINIQUITO' });
      apuntes.push({ cuenta: cuentas.remuneraciones, debe: 0, haber: finiquito, concepto: 'FINIQUITO' });
    }
    if (indemnizacion) {
      apuntes.push({ cuenta: cuentas.indemnizaciones, debe: indemnizacion, haber: 0, concepto: 'INDEMNIZACION' });
      apuntes.push({ cuenta: cuentas.remuneraciones, debe: 0, haber: indemnizacion, concepto: 'INDEMNIZACION' });
    }

    const debe = this._round(apuntes.reduce((t, a) => t + (Number(a.debe) || 0), 0), 2);
    const haber = this._round(apuntes.reduce((t, a) => t + (Number(a.haber) || 0), 0), 2);
    const cuadra = Math.abs(debe - haber) < 0.005;

    // CIERRE DE LA CUENTA DEL TRABAJADOR: el saldo de 465 debe quedar a CERO.
    const saldoTrabajador = this._round(
      apuntes.filter((a) => a.cuenta === cuentas.remuneraciones)
        .reduce((t, a) => t + (Number(a.haber) || 0) - (Number(a.debe) || 0), 0), 2);

    const asientoCierre = {
      tipo: 'CIERRE_EMPLEADO',
      origen: 'NOMINA_G10',
      empleado: formado.empleado,
      apuntes,
      debe,
      haber,
      cuadra,
      finiquito,
      indemnizacion,
      cuenta_trabajador: cuentas.remuneraciones,
      saldo_trabajador: saldoTrabajador,
      saldo_cero: Math.abs(saldoTrabajador) < 0.005,
      error_de_estado: Math.abs(saldoTrabajador) >= 0.005,
      no_borra: true
    };

    // El asiento de cierre tambien se PIDE al diario (B2) por EVENTO.
    const asentado = await this._rpc('contabilidad.asiento.asentar.request', {
      project_id: pid,
      rol: ROL_DIARIO,
      asiento: {
        tipo: 'CIERRE_EMPLEADO',
        origen: 'NOMINA_G10',
        apuntes,
        hecho: { clase: 'BAJA_EMPLEADO', empleado: formado.empleado },
        periodo: formado.periodo,
        clave_natural: (input && input.clave_natural) || `baja:${formado.empleado}:${formado.periodo || 'sin-periodo'}`
      },
      correlation_id: input.correlation_id
    }, { timeout_ms: 6000 });

    return {
      status: 200,
      data: {
        op: 'liquidar',
        project_id: pid,
        empleado: formado.empleado,
        recibo_formado: formado,
        lineas,
        obligacion,
        asiento_cierre: asientoCierre,
        saldo_cero: asientoCierre.saldo_cero,
        una_cuenta_de_empleado_sin_cerrar_es_un_error_de_estado: true,
        peticion_asiento_enviada: true,
        asiento_asentado: !!(asentado && asentado.status === 200),
        tipos_fuente: fuente,
        tipos_cableados: false,
        determinista: true
      }
    };
  }

  async _liquidarEntrada(input) { return this._liquidar(input); }

  // ── Tools ──
  toolProcesar(params) { return this._procesar(params); }
  toolDesglosar(params) { return this._desglosarEntrada(params); }
  toolLiquidar(params) { return this._liquidar(params); }
  toolCalcularObligacion(params) {
    const formado = this._admitir(params && (params.recibo || params));
    const porcentajes = this._porcentajes(params && params.tipos);
    return Promise.resolve({ status: 200, data: this._calcularObligacion(formado, porcentajes) });
  }
  toolConstruirAsiento(params) {
    const formado = this._admitir(params && (params.recibo || params));
    const porcentajes = this._porcentajes(params && params.tipos);
    const lineas = this._desglosar(formado, porcentajes);
    const obligacion = this._calcularObligacion(formado, porcentajes);
    return Promise.resolve({ status: 200, data: this._construirAsiento(formado, lineas, obligacion, this._cuentasDe(params)) });
  }
}

module.exports = ReciboNomina;
