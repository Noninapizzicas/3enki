/**
 * contabilidad/cierre-ejercicio — CUSTODIO (C4·C5, hoja del plan).
 *
 * EL CIERRE, EN DOS NIVELES (decision del dueno):
 *   NIVEL 1 · LA JORNADA cierra la caja. Consume el hecho CIERRE_JORNADA ya
 *     admitido por la puerta (A1) — contabilidad LEE la operacion, no la
 *     ejecuta. Clave natural: (proyecto, jornada).
 *   NIVEL 2 · EL MES cierra la contabilidad. Ajustes, periodificacion,
 *     amortizaciones, IVA devengado/soportado y regularizacion. Clave natural:
 *     (proyecto, ejercicio, mes).
 *
 * IRREVERSIBLE SALVO AJUSTE: un cierre NO se reabre. `esIrreversible()` lo
 * declara. Si hay que corregir, se corrige SUMANDO (B5, asiento-ajuste): el
 * cierre original queda en la traza y el ajuste entra como un asiento mas. Un
 * cierre = un asiento, y la IDEMPOTENCIA cuelga de la CLAVE NATURAL DE DOS
 * NIVELES: reprocesar la misma jornada o el mismo mes NO duplica, devuelve el
 * cierre ya registrado (ERROR_PERIODO_YA_CERRADO).
 *
 * C5 (AperturaEjercicio) es la cara determinista: los saldos de apertura son
 * los del cierre anterior, NUNCA inventados.
 *
 * CUSTODIO (patron real): store en memoria (cierres por clave natural de cada
 * nivel + secuencia append-only); PosPersistencia (storage
 * /contabilidad/cierre-ejercicio/*.json); restaura en project.activated; flush
 * en onUnload. GUARD de un solo escritor: el rol autorizado del cierre es CIERRE
 * — cualquier otro se rechaza con ERROR_DOS_ESCRITORES. Fire-and-forget:
 * contabilidad.hecho_admitido (A1) → si el hecho es CIERRE_JORNADA se cierra el
 * NIVEL 1 sin que nadie lo pida. Los cierres SE ASIENTAN por EVENTO
 * (contabilidad.asiento.cierre.request / contabilidad.asiento.asentar.request a
 * B2): aqui no se escribe el diario.
 * Emisor/par de fallo: exito publica contabilidad.cierre_realizado ·
 * contabilidad.apertura_generada; error su par determinista. La dependencia con
 * escritor-diario (B2), mayor-balanza (B3), periodificacion (C3), inmovilizado
 * (F2) y cola-declaraciones-criterio (K9) es por EVENTO, NUNCA por require
 * cruzado.
 * NO REUTILIZA: el cierre de caja diario de la OPERACION no se toca: entra como
 * hecho observado. El cierre contable con ajustes no existe en el inventario.
 *
 * Ver hoja C4/C5 del diseno-oop y bloque `cierre-ejercicio` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Un solo escritor del cierre (C4). El rol del cierre es CIERRE; SISTEMA puede
// dispararlo (cierre automatico de jornada desde el hecho admitido).
const ROLES_AUTORIZADOS = new Set(['CIERRE', 'SISTEMA']);

// Codigos simbolicos deterministas de los cerrojos (clase C4).
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';
const CODE_YA_CERRADO = 'ERROR_PERIODO_YA_CERRADO';

// Las DOS unidades de cierre: los dos niveles, con su clave natural.
const NIVEL_JORNADA = 1;
const NIVEL_MES = 2;

// Rol unico del diario (B2).
const ROL_ESCRITOR_DIARIO = 'ADMISION';

// Tolerancia de centimos.
const EPS = 0.005;

class CierreEjercicio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cierre-ejercicio';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, cierres: { <clave> : Cierre },
    //                                 secuencia: [], abierto:  }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cierre-ejercicio.json',
      dir: '/contabilidad/cierre-ejercicio',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.cierres) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los cierres (los dos niveles) del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onCerrarRequest(e) {
    return this._atender(e, 'cerrar', 'contabilidad.cierre.cerrar.response', async (d) => {
      const res = await this._cerrarConLibro(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.cierre_realizado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else if (res.error && res.error.code === CODE_YA_CERRADO) {
        // IRREVERSIBLE: no se reabre. Se declara, no se finge un cierre nuevo.
        this.eventBus?.publish('contabilidad.cierre_realizado.failed', res);
        this.eventBus?.publish('contabilidad.cierre.cerrar.failed', res);
      } else {
        this.eventBus?.publish('contabilidad.cierre.cerrar.failed', res);
      }
      return res;
    });
  }

  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'contabilidad.cierre.estado.response', async (d) => {
      const res = this._estado(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.cierre.estado.failed', res);
      return res;
    });
  }

  // Fire-and-forget: puerto-evento-vertical (A1) admitio un hecho → si el hecho
  // es CIERRE_JORNADA se cierra el NIVEL 1 (la jornada cierra la caja).
  onHechoAdmitido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const hecho = d.hecho || d;
    const tipo = String(hecho.tipo || hecho.vertical || '').toUpperCase();
    if (tipo !== 'CIERRE_JORNADA') return null;
    return (async () => {
      const res = await this._cerrarConLibro({
        project_id: d.project_id,
        rol: 'SISTEMA',
        nivel: NIVEL_JORNADA,
        jornada: hecho.jornada || hecho.fecha || hecho.clave_natural || null,
        periodo: hecho.periodo || null,
        cierre: hecho,
        origen: 'A1_CIERRE_JORNADA',
        correlation_id: d.correlation_id
      });
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.cierre_realizado', { ...res.data, correlation_id: d.correlation_id });
      } else {
        this.eventBus?.publish('contabilidad.cierre_realizado.failed', res);
      }
      return res;
    })();
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = {
        esquema: 'contabilidad-cierre-ejercicio-v1',
        cierres: {},
        secuencia: [],
        abierto: {},
        escritor: [...ROLES_AUTORIZADOS]
      };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (C4): el cierre tiene UN escritor.
  _verificarEscritorUnico(rol) {
    const r = String(rol || '').toUpperCase();
    if (!ROLES_AUTORIZADOS.has(r)) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'el cierre tiene UN escritor: solo CIERRE cierra el periodo', {
          escritor_vigente: [...ROLES_AUTORIZADOS],
          rol_intentado: r || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  // Clave natural de DOS niveles: (proyecto, jornada) o (proyecto, ejercicio, mes).
  _claveNatural(pid, nivel, input) {
    if (nivel === NIVEL_JORNADA) {
      const jornada = (input && (input.jornada || input.periodo)) || null;
      if (!jornada) return null;
      return `${pid}:jornada:${jornada}`;
    }
    const ejercicio = (input && input.ejercicio) || null;
    const mes = (input && input.mes) || null;
    if (ejercicio === null || mes === null) return null;
    return `${pid}:${ejercicio}:${mes}`;
  }

  // cerrar(periodo, ajustes) -> Cierre | ERROR_PERIODO_YA_CERRADO.
  // IRREVERSIBLE salvo ajuste posterior (B5): un cierre no se reabre.
  _cerrar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const nivel = Number(input && input.nivel) === NIVEL_JORNADA ? NIVEL_JORNADA : NIVEL_MES;
    const clave = this._claveNatural(pid, nivel, input);
    if (!clave) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        nivel === NIVEL_JORNADA
          ? 'el cierre de NIVEL 1 exige la JORNADA (clave natural: proyecto+jornada)'
          : 'el cierre de NIVEL 2 exige EJERCICIO y MES (clave natural: proyecto+ejercicio+mes)', {
          nivel, unidad_de_cierre: nivel === NIVEL_JORNADA ? 'JORNADA' : 'MES', clave_natural: null
        });
    }

    const d = this._obtenerOCrear(pid);
    // IRREVERSIBLE: un periodo ya cerrado NO se reabre (se corrige SUMANDO, B5).
    if (d.cierres[clave]) {
      return this._errorResponse(409, CODE_YA_CERRADO,
        `el periodo ${clave} ya esta cerrado: el cierre es IRREVERSIBLE salvo ajuste posterior`, {
          clave_natural: clave,
          simbolico: CODE_YA_CERRADO,
          cierre_existente: d.cierres[clave],
          reabrible: false,
          correccion: 'AJUSTE_POSTERIOR_B5 (el ajuste SUMA, no reabre)'
        });
    }

    const ajustes = Array.isArray(input && input.ajustes) ? input.ajustes : [];
    for (const a of ajustes) {
      const apuntes = Array.isArray(a && a.apuntes) ? a.apuntes : null;
      if (!apuntes || apuntes.length < 2) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          'un ajuste de cierre exige al menos dos apuntes (partida doble)', { ajuste: a });
      }
      const sumas = this._sumas(apuntes);
      if (Math.abs(sumas.debe - sumas.haber) > EPS) {
        return this._errorResponse(409, 'DESCUADRE',
          `el ajuste del cierre NO cuadra: debe ${sumas.debe} != haber ${sumas.haber}`, {
            debe: sumas.debe, haber: sumas.haber, simbolico: 'DESCUADRE'
          });
      }
    }

    const cuerpo = nivel === NIVEL_JORNADA
      ? this._nivel1({ project_id: pid, jornada: input.jornada || input.periodo, cierre: input.cierre })
      : this._nivel2({
        project_id: pid,
        ejercicio: input.ejercicio,
        mes: input.mes,
        ajustes,
        periodificacion: input.periodificacion,
        amortizaciones: input.amortizaciones,
        iva_devengado: input.iva_devengado,
        iva_soportado: input.iva_soportado,
        regularizacion: input.regularizacion
      });
    if (cuerpo.status !== 200) return cuerpo;

    const cierre = {
      clave_natural: clave,
      nivel,
      unidad_de_cierre: nivel === NIVEL_JORNADA ? 'JORNADA' : 'MES',
      jornada: nivel === NIVEL_JORNADA ? (input.jornada || input.periodo) : null,
      ejercicio: nivel === NIVEL_MES ? input.ejercicio : null,
      mes: nivel === NIVEL_MES ? input.mes : null,
      periodo: input.periodo || (nivel === NIVEL_MES ? `${input.ejercicio}-${input.mes}` : (input.jornada || null)),
      saldos: cuerpo.data.saldos || {},
      ajustes: ajustes.length,
      importes: cuerpo.data.importes || {},
      hechos_del_tiempo: cuerpo.data.hechos_del_tiempo || [],
      asiento_cierre: cuerpo.data.asiento_cierre || null,
      irreversible: true,
      reabrible: false,
      borrable: false,
      cerrado_por: String((input && input.rol) || '').toUpperCase(),
      cerrado_en: new Date().toISOString(),
      origen: (input && input.origen) || 'CIERRE'
    };
    d.cierres[clave] = cierre;
    d.secuencia.push({ clave_natural: clave, nivel, periodo: cierre.periodo, cerrado_en: cierre.cerrado_en });
    d.abierto[`n${nivel}`] = cierre;
    d.updated_at = cierre.cerrado_en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        cierre,
        clave_natural: clave,
        nivel,
        irreversible: true,
        reabrible: false,
        un_cierre_un_asiento: true,
        idempotente_por: nivel === NIVEL_JORNADA ? '(proyecto, jornada)' : '(proyecto, ejercicio, mes)'
      }
    };
  }

  // esIrreversible() -> Bool. El cierre NO se reabre; se corrige sumando (B5).
  _esIrreversible() {
    return {
      status: 200,
      data: {
        irreversible: true,
        reabrible: false,
        salvo: 'AJUSTE_POSTERIOR (B5): el ajuste SUMA, no reabre',
        el_original_no_se_borra: true
      }
    };
  }

  // NIVEL 1 — caja del dia: consume el hecho CIERRE_JORNADA admitido por la
  // puerta. Clave natural: (proyecto, jornada). No inventa el importe de caja:
  // si el hecho no lo trae, lo declara ausente.
  _nivel1(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const jornada = input && input.jornada;
    if (!jornada) return this._invalid('jornada');

    const hecho = (input && input.cierre) || null;
    const cajaDeclarada = this._num(hecho && (hecho.caja_final !== undefined ? hecho.caja_final : hecho.caja));

    return {
      status: 200,
      data: {
        project_id: pid,
        nivel: NIVEL_JORNADA,
        unidad_de_cierre: 'JORNADA',
        jornada,
        clave_natural: `${pid}:jornada:${jornada}`,
        caja_final: cajaDeclarada === null ? null : this._round(cajaDeclarada, 2),
        caja_declarada: cajaDeclarada !== null,
        hecho_origen: hecho ? { tipo: hecho.tipo || null, clave_natural: hecho.clave_natural || null } : null,
        // El cierre de caja es de la OPERACION: aqui SOLO se observa.
        observa_la_operacion: true,
        ejecuta_la_caja: false,
        saldos: {},
        importes: { caja_final: cajaDeclarada === null ? null : this._round(cajaDeclarada, 2) },
        asiento_cierre: null,
        nota: 'el cierre de caja diario de la operacion NO se ejecuta aqui: entra como hecho observado (CIERRE_JORNADA)'
      }
    };
  }

  // NIVEL 2 — mes natural: ajustes, periodificacion, amortizaciones, IVA
  // devengado/soportado y regularizacion. Clave: (proyecto, ejercicio, mes).
  _nivel2(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const ejercicio = input && input.ejercicio;
    const mes = input && input.mes;
    if (ejercicio === undefined || ejercicio === null) return this._invalid('ejercicio');
    if (mes === undefined || mes === null) return this._invalid('mes');

    const ajustes = Array.isArray(input && input.ajustes) ? input.ajustes : [];
    const devengado = this._num(input && input.iva_devengado);
    const soportado = this._num(input && input.iva_soportado);
    const regularizacion = this._num(input && input.regularizacion);

    // Los HECHOS DEL TIEMPO (amortizacion F2, periodificacion C3) no se
    // calculan aqui: se declaran como producidos por quien los produce. Aqui
    // se deja constancia de que se dispararon (dependencia por EVENTO).
    const hechosDelTiempo = [];
    if (input && input.amortizaciones !== undefined) hechosDelTiempo.push({ tipo: 'AMORTIZACION', dispara: 'inmovilizado (F2)' });
    if (input && input.periodificacion !== undefined) hechosDelTiempo.push({ tipo: 'PERIODIFICACION', dispara: 'periodificacion (C3)' });

    // Asiento de cierre = suma de los ajustes declarados (nunca inventados).
    const apuntes = [];
    for (const a of ajustes) {
      for (const ap of (a.apuntes || [])) apuntes.push(ap);
    }
    const sumas = apuntes.length >= 2 ? this._sumas(apuntes) : { debe: 0, haber: 0 };
    const asientoCierre = apuntes.length >= 2
      ? {
        tipo: 'CIERRE',
        origen: 'C4_NIVEL2',
        periodo: `${ejercicio}-${mes}`,
        apuntes,
        debe: sumas.debe,
        haber: sumas.haber,
        borra_historia: false,
        suma: true
      }
      : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        nivel: NIVEL_MES,
        unidad_de_cierre: 'MES',
        ejercicio,
        mes,
        clave_natural: `${pid}:${ejercicio}:${mes}`,
        saldos: {},
        ajustes: ajustes.length,
        importes: {
          iva_devengado: devengado === null ? null : this._round(devengado, 2),
          iva_soportado: soportado === null ? null : this._round(soportado, 2),
          regularizacion: regularizacion === null ? null : this._round(regularizacion, 2),
          iva_liquidado: (devengado === null || soportado === null) ? null : this._round(devengado - soportado, 2)
        },
        hechos_del_tiempo: hechosDelTiempo,
        asiento_cierre: asientoCierre,
        cuadrado: asientoCierre ? Math.abs(sumas.debe - sumas.haber) <= EPS : true,
        determinista: true
      }
    };
  }

  // _cerrar + envio al libro (B2) por EVENTO. Un cierre = un asiento.
  async _cerrarConLibro(d) {
    const res = this._cerrar(d);
    if (res.status !== 200) return res;

    const asiento = res.data.cierre.asiento_cierre;
    if (!asiento) {
      // Cierre de NIVEL 1 (o nivel 2 sin ajustes): no hay asiento que enviar.
      // El cierre queda registrado igualmente (idempotencia por clave natural).
      return res;
    }
    const senal = await this._senalarAlDiario(d, asiento);
    if (!senal.ok) {
      // El libro (B2) es el UNICO escritor y no confirmo: se DECLARA el fallo.
      // El cierre NO se declara realizado sin su asiento.
      const d2 = this._obtenerOCrear(d.project_id);
      delete d2.cierres[res.data.clave_natural];
      d2.secuencia = d2.secuencia.filter((x) => x.clave_natural !== res.data.clave_natural);
      d2.updated_at = new Date().toISOString();
      this._persist.marcarDirty(d.project_id);
      return this._errorResponse(senal.status || 503, (senal.error && senal.error.code) || 'DEPENDENCIA_NO_DISPONIBLE',
        (senal.error && senal.error.message) || 'escritor-diario (B2) no confirmo el asiento de cierre', {
          dependencia: 'escritor-diario', clave_natural: res.data.clave_natural, accion: 'NO_DECLARAR_CIERRE_SIN_ASIENTO'
        });
    }
    res.data.asiento = senal.data.asiento;
    res.data.clave_natural_asiento = senal.data.clave_natural;
    return res;
  }

  // estado(periodo) -> Cierre | ABIERTO.
  _estado(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);

    const nivel = Number(input && input.nivel) || null;
    const clave = input && input.clave_natural
      ? input.clave_natural
      : (nivel ? this._claveNatural(pid, nivel, input) : null);

    if (!clave) {
      const lista = Object.values(d.cierres);
      return {
        status: 200,
        data: {
          project_id: pid,
          cierres: lista,
          n_cierres: lista.length,
          ultimo_nivel1: d.abierto.n1 || null,
          ultimo_nivel2: d.abierto.n2 || null,
          irreversible: true,
          reabrible: false,
          dos_niveles: { nivel_1: '(proyecto, jornada)', nivel_2: '(proyecto, ejercicio, mes)' }
        }
      };
    }
    const cierre = d.cierres[clave] || null;
    return {
      status: 200,
      data: {
        project_id: pid,
        clave_natural: clave,
        cerrado: !!cierre,
        estado: cierre ? 'CERRADO' : 'ABIERTO',
        cierre,
        irreversible: !!cierre,
        reabrible: false
      }
    };
  }

  // generarApertura(cierreAnterior) -> List<Asiento> (C5).
  // Los saldos de apertura SON los de cierre, NUNCA inventados.
  _generarApertura(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);

    const cierre = (input && input.cierre_anterior)
      || (input && input.clave_natural ? d.cierres[input.clave_natural] : null)
      || d.abierto.n2 || d.abierto.n1 || null;
    if (!cierre) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'no hay cierre anterior del que abrir: los saldos de apertura SON los de cierre, nunca inventados', {
          senal: 'SIN_CIERRE_ANTERIOR', asumido: false
        });
    }

    const saldos = cierre.saldos || {};
    const apuntes = Object.keys(saldos).map((cuenta) => {
      const saldo = this._round(Number(saldos[cuenta]) || 0, 2);
      return saldo >= 0
        ? { cuenta, debe: saldo, haber: 0 }
        : { cuenta, debe: 0, haber: this._round(-saldo, 2) };
    });
    const sumas = apuntes.length ? this._sumas(apuntes) : { debe: 0, haber: 0 };

    return {
      status: 200,
      data: {
        project_id: pid,
        cierre_origen: cierre.clave_natural,
        apuntes,
        n_apuntes: apuntes.length,
        debe: sumas.debe,
        haber: sumas.haber,
        cuadra: Math.abs(sumas.debe - sumas.haber) <= EPS,
        saldos_de_cierre: true,
        inventados: false,
        determinista: true
      }
    };
  }

  // arrastrarSaldos() -> Balance (C5).
  _arrastrarSaldos(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);
    const cierre = d.abierto.n2 || d.abierto.n1 || null;
    if (!cierre) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'no hay cierre del que arrastrar saldos: nunca se inventan saldos de arranque', {
          senal: 'SIN_CIERRE_ANTERIOR', inventados: false
        });
    }
    return {
      status: 200,
      data: {
        project_id: pid,
        cierre_origen: cierre.clave_natural,
        saldos: cierre.saldos || {},
        n_cuentas: Object.keys(cierre.saldos || {}).length,
        arrastrado_del_cierre: true,
        inventados: false
      }
    };
  }

  _sumas(apuntes) {
    let debe = 0;
    let haber = 0;
    for (const a of apuntes) {
      debe += Number(a && a.debe) || 0;
      haber += Number(a && a.haber) || 0;
    }
    return { debe: this._round(debe, 2), haber: this._round(haber, 2) };
  }

  _num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // señalAlDiario(asiento) -> se ENVIA a B2 por EVENTO (aqui no se escribe).
  async _senalarAlDiario(d, asiento) {
    const pid = d && d.project_id;
    if (!pid) return { ok: false, status: 400, error: { code: 'INVALID_INPUT', message: 'project_id requerido' } };

    const resp = await this._rpc('contabilidad.asiento.cierre.request', {
      project_id: pid,
      rol: ROL_ESCRITOR_DIARIO,
      cierre: asiento,
      periodo: asiento.periodo || null
    }, { timeout_ms: 5000 });

    if (!resp || resp.status !== 200) {
      return {
        ok: false,
        status: (resp && resp.status) || 503,
        error: (resp && resp.error) || { code: 'DEPENDENCIA_NO_DISPONIBLE', message: 'escritor-diario (B2) no respondio' }
      };
    }
    return { ok: true, data: { asiento: (resp.data && resp.data.asiento) || null, clave_natural: (resp.data && resp.data.clave_natural) || null } };
  }

  // ── Tools ──
  toolCerrar(params) { return this._cerrar(params); }
  toolEsIrreversible() { return this._esIrreversible(); }
  toolGenerarApertura(params) { return this._generarApertura(params); }
  toolArrastrarSaldos(params) { return this._arrastrarSaldos(params); }
}

module.exports = CierreEjercicio;
