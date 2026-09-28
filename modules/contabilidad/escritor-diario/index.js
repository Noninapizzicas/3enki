/**
 * contabilidad/escritor-diario — CUSTODIO (B2, hoja del plan). EL CORAZON.
 *
 * EL UNICO ESCRITOR DEL DIARIO (M2 single-writer por parcela). Aqui entrega el
 * cuello: el libro tiene UN escritor y solo uno. Antes de escribir:
 *   1. GUARD DE UN SOLO ESCRITOR — el rol autorizado de la parcela es ADMISION
 *      (la unica puerta del hecho); cualquier otro rol intentando escribir el
 *      diario se rechaza con ERROR_DOS_ESCRITORES.
 *   2. PARTIDA DOBLE — la invariante mas dura del dominio: sum(debe) = sum(haber).
 *      Un DESC UADRE es un ERROR, no un estado: se RECHAZA ANTES de escribir,
 *      con codigo DESCUADRE. Nunca se escribe un asiento que no cuadra.
 *   3. IDEMPOTENCIA POR CLAVE NATURAL (M3) — si la clave del asiento ya esta
 *      asentada, se rechaza con ERROR_DUPLICADO: reprocesar NO duplica. La clave
 *      la da clave-natural (M3) por EVENTO cuando el payload no la trae.
 *
 * CUSTODIO (patron real): store en memoria (asientos por clave natural + diario
 * append-only + apertura/cierre); PosPersistencia (storage
 * /contabilidad/escritor-diario/*.json); restaura en project.activated; flush en
 * onUnload. Fire-and-forget: recibe contabilidad.contrapartida_propuesta (A6.1)
 * y COMPONE los apuntes desde el hecho + la contrapartida (proyeccion interna).
 *
 * Emisor/par de fallo: exito publica contabilidad.asiento_asentado; un rechazo de
 * partida doble publica contabilidad.asiento_rechazado (el hecho se declara, no
 * se asienta); error su par determinista. Lo consumen mayor-balanza (B3), traza-asiento
 * (B4), asiento-ajuste (B5), estados-contables (C1/C2), aviso-cuadre (C6).
 * NO REUTILIZA: no existe diario de partida doble en el inventario.
 *
 * Ver hoja B2 del diseno-oop y bloque `escritor-diario` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol UNICO autorizado a escribir el diario (M2): la unica puerta del hecho.
const ROL_ESCRITOR_DIARIO = 'ADMISION';

// Codigos simbolicos deterministas de los cerrojos (clase B2).
const CODE_DESCUADRE = 'DESCUADRE';
const CODE_DUPLICADO = 'ERROR_DUPLICADO';
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';

// Tolerancia de redondeo de la partida doble (centimos).
const EPS = 0.005;

class EscritorDiario extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escritor-diario';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, asientos: {}, diario: [], eventos: [] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'escritor-diario.json',
      dir: '/contabilidad/escritor-diario',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.asientos) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el diario del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onAsentarRequest(e) {
    return this._atender(e, 'asentar', 'contabilidad.asiento.asentar.response', async (d) => {
      const res = await this._asentar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.asiento_asentado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else if (res.error && res.error.code === CODE_DESCUADRE) {
        // Un descuadre es un ERROR, no un estado: el asiento NO se escribe.
        this.eventBus?.publish('contabilidad.asiento_rechazado', {
          ...res,
          correlation_id: d.correlation_id
        });
        this.eventBus?.publish('contabilidad.asiento.asentar.failed', res);
      } else {
        this.eventBus?.publish('contabilidad.asiento.asentar.failed', res);
      }
      return res;
    });
  }

  onAperturaRequest(e) {
    return this._atender(e, 'apertura', 'contabilidad.asiento.apertura.response', async (d) => {
      const res = this._registrarApertura(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.asiento_asentado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.asiento.apertura.failed', res);
      }
      return res;
    });
  }

  onCierreRequest(e) {
    return this._atender(e, 'cierre', 'contabilidad.asiento.cierre.response', async (d) => {
      const res = this._registrarCierre(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.asiento_asentado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.asiento.cierre.failed', res);
      }
      return res;
    });
  }

  onAjustarRequest(e) {
    return this._atender(e, 'ajustar', 'contabilidad.asiento.ajustar.response', async (d) => {
      const res = await this._asentar({ ...d, asiento: { ...(d.asiento || {}), tipo: 'AJUSTE', suma: true } });
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.asiento_asentado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.asiento.ajustar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: resolucion-contrapartida (A6.1) propuso la contrapartida
  // de un hecho → aqui se COMPONE el asiento y se asienta (no hay orquestador).
  onContrapartidaPropuesta(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return (async () => {
      const compuesto = this._componerDesdeContrapartida(d);
      if (compuesto.status !== 200) {
        this.eventBus?.publish('contabilidad.asiento.asentar.failed', {
          ...compuesto,
          correlation_id: d.correlation_id
        });
        return compuesto;
      }
      const res = await this._asentar({
        project_id: d.project_id,
        rol: ROL_ESCRITOR_DIARIO,
        asiento: compuesto.data.asiento,
        correlation_id: d.correlation_id
      });
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.asiento_asentado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else if (res.error && res.error.code === CODE_DESCUADRE) {
        this.eventBus?.publish('contabilidad.asiento_rechazado', {
          ...res,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.asiento.asentar.failed', res);
      }
      return res;
    })();
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-escritor-diario-v1', asientos: {}, diario: [], eventos: [], escritor: ROL_ESCRITOR_DIARIO };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (M2): solo ADMISION escribe el diario.
  _verificarEscritorUnico(rol) {
    if (String(rol || '').toUpperCase() !== ROL_ESCRITOR_DIARIO) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'el diario tiene UN escritor: solo ADMISION asienta', {
          escritor_vigente: ROL_ESCRITOR_DIARIO,
          rol_intentado: String(rol || '').toUpperCase() || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  // suma los lados del asiento (debe / haber). Determinista, redondeado a centimos.
  _sumas(apuntes) {
    let debe = 0;
    let haber = 0;
    for (const a of apuntes) {
      debe += Number(a && a.debe) || 0;
      haber += Number(a && a.haber) || 0;
    }
    return { debe: this._round(debe, 2), haber: this._round(haber, 2) };
  }

  // claveNaturalDelAsiento: la trae el payload o la da clave-natural (M3) por EVENTO.
  async _claveDe(pid, asiento, input) {
    const directa = (input && input.clave_natural) || (asiento && asiento.clave_natural) || null;
    if (directa) return directa;
    const resp = await this._rpc('contabilidad.clave.calcular.request', {
      project_id: pid,
      hecho: asiento && (asiento.hecho || asiento),
      unidad_de_cierre: (input && input.unidad_de_cierre) || (asiento && asiento.unidad_cierre) || null
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    return (resp.data && resp.data.clave_natural) || null;
  }

  // asentar(rol, asiento) -> ok | ERROR_DESCUADRE | ERROR_DUPLICADO | ERROR_DOS_ESCRITORES.
  // Partida doble CUADRA antes de escribir: un descuadre no se asienta.
  async _asentar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const asiento = input && input.asiento;
    if (!asiento || typeof asiento !== 'object') return this._invalid('asiento');

    const apuntes = Array.isArray(asiento.apuntes) ? asiento.apuntes
      : (Array.isArray(asiento.lineas) ? asiento.lineas : null);
    if (!apuntes || apuntes.length < 2) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'un asiento exige al menos dos apuntes (partida doble)', {
          n_apuntes: apuntes ? apuntes.length : 0
        });
    }
    for (const a of apuntes) {
      const debe = Number(a && a.debe) || 0;
      const haber = Number(a && a.haber) || 0;
      if ((debe === 0 && haber === 0) || (debe !== 0 && haber !== 0)) {
        return this._errorResponse(422, 'INVALID_INPUT',
          'cada apunte lleva debe O haber (nunca ambos ni ninguno)', { apunte: a });
      }
      if (!(a && a.cuenta)) return this._invalid('apunte.cuenta');
    }

    // PARTIDA DOBLE: sum(debe) == sum(haber). Descuadre = rechazo, no estado.
    const sumas = this._sumas(apuntes);
    if (Math.abs(sumas.debe - sumas.haber) > EPS) {
      return this._errorResponse(409, CODE_DESCUADRE,
        `el asiento NO cuadra: debe ${sumas.debe} != haber ${sumas.haber}`, {
          debe: sumas.debe,
          haber: sumas.haber,
          diferencia: this._round(sumas.debe - sumas.haber, 2),
          simbolico: CODE_DESCUADRE,
          asentado: false,
          nota: 'un descuadre es un ERROR, no un estado: se rechaza ANTES de escribir'
        });
    }

    // IDEMPOTENCIA por clave natural (M3): reprocesar NO duplica.
    const clave = await this._claveDe(pid, asiento, input);
    if (!clave) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'clave-natural (M3) no devolvio la clave: sin clave no se asegura la idempotencia', {
          dependencia: 'clave-natural', accion: 'NO_ASENTAR_SIN_CLAVE'
        });
    }

    const d = this._obtenerOCrear(pid);
    if (d.asientos[clave]) {
      return this._errorResponse(409, CODE_DUPLICADO,
        `el asiento ${clave} ya esta asentado: reprocesar NO duplica`, {
          clave_natural: clave,
          simbolico: CODE_DUPLICADO,
          asentado: false,
          asiento_existente: d.asientos[clave].id
        });
    }

    const registrado = this._registrar(pid, d, {
      tipo: asiento.tipo || 'NORMAL',
      apuntes,
      debe: sumas.debe,
      haber: sumas.haber,
      clave_natural: clave,
      hecho: asiento.hecho || null,
      fecha_operacion: asiento.fecha_operacion || null,
      fecha_valor: asiento.fecha_valor || null,
      periodo: asiento.periodo || null,
      origen: asiento.origen || 'ADMISION'
    });

    return {
      status: 200,
      data: {
        project_id: pid,
        asiento: registrado,
        clave_natural: clave,
        cuadrado: true,
        debe: sumas.debe,
        haber: sumas.haber,
        idempotente: true,
        escritor: ROL_ESCRITOR_DIARIO
      }
    };
  }

  // registrarApertura(apertura) -> ok — asiento de apertura (misma ley de partida doble).
  _registrarApertura(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const apertura = input && (input.apertura || input.asiento);
    if (!apertura || typeof apertura !== 'object') return this._invalid('apertura');

    const res = this._validarSinClave(apertura);
    if (res.status !== 200) return res;

    const d = this._obtenerOCrear(pid);
    if (d.apertura) {
      return this._errorResponse(409, CODE_DUPLICADO,
        'el asiento de apertura ya existe: los saldos de apertura son los de cierre, nunca inventados', {
          clave_natural: d.apertura.clave_natural, simbolico: CODE_DUPLICADO
        });
    }
    const clave = `apertura:${pid}:${input.periodo || apertura.periodo || 'ejercicio'}`;
    const registrado = this._registrar(pid, d, {
      tipo: 'APERTURA',
      apuntes: apertura.apuntes || apertura.lineas,
      debe: res.sumas.debe,
      haber: res.sumas.haber,
      clave_natural: clave,
      periodo: input.periodo || apertura.periodo || null,
      origen: 'APERTURA'
    });
    d.apertura = registrado;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);
    return { status: 200, data: { project_id: pid, asiento: registrado, clave_natural: clave, tipo: 'APERTURA' } };
  }

  // registrarCierre(cierre) -> ok — asiento de cierre.
  _registrarCierre(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const cierre = input && (input.cierre || input.asiento);
    if (!cierre || typeof cierre !== 'object') return this._invalid('cierre');

    const res = this._validarSinClave(cierre);
    if (res.status !== 200) return res;

    const d = this._obtenerOCrear(pid);
    const periodo = input.periodo || cierre.periodo || null;
    const clave = `cierre:${pid}:${periodo || 'ejercicio'}`;
    if (d.asientos[clave]) {
      return this._errorResponse(409, CODE_DUPLICADO, 'el cierre de ese periodo ya esta asentado', {
        clave_natural: clave, simbolico: CODE_DUPLICADO
      });
    }
    const registrado = this._registrar(pid, d, {
      tipo: 'CIERRE',
      apuntes: cierre.apuntes || cierre.lineas,
      debe: res.sumas.debe,
      haber: res.sumas.haber,
      clave_natural: clave,
      periodo,
      origen: 'CIERRE'
    });
    d.cierre = registrado;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);
    return { status: 200, data: { project_id: pid, asiento: registrado, clave_natural: clave, tipo: 'CIERRE' } };
  }

  // compone los apuntes desde el hecho + la contrapartida recibida (A6.1). Determinista.
  _componerDesdeContrapartida(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const propuesta = (input && (input.propuesta || input.contrapartida)) || null;
    if (!propuesta || typeof propuesta !== 'object') return this._invalid('propuesta');

    const hecho = (input && input.hecho) || propuesta.hecho || null;
    const cuentas = Array.isArray(propuesta.apuntes) ? propuesta.apuntes : null;

    let apuntes = cuentas;
    if (!apuntes) {
      // Sin apuntes explicitos: se compone debe = cuenta de la contrapartida,
      // haber = cuenta del hecho (o la misma si la contrapartida trae una sola).
      const cuentaPropuesta = propuesta.cuenta || null;
      const cuentaHecho = propuesta.cuenta_contrapartida || propuesta.cuenta_origen || null;
      const importe = this._round(Number(propuesta.importe !== undefined ? propuesta.importe : (hecho && hecho.total)) || 0, 2);
      if (!cuentaPropuesta || !cuentaHecho || importe <= 0) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          'la contrapartida no trae apuntes ni (cuenta + contraparte + importe): no se inventa el asiento', {
            propuesta, senal: 'CONTRAPARTIDA_INCOMPLETA'
          });
      }
      apuntes = [
        { cuenta: cuentaHecho, debe: importe, haber: 0 },
        { cuenta: cuentaPropuesta, debe: 0, haber: importe }
      ];
    }

    const res = this._validarSinClave({ apuntes });
    if (res.status !== 200) return res;

    const asiento = {
      tipo: 'NORMAL',
      origen: 'CONTRAPARTIDA_A6.1',
      apuntes,
      hecho,
      clave_natural: (hecho && hecho.clave_natural) || propuesta.clave_natural || null,
      fecha_operacion: (hecho && hecho.fecha_operacion) || null,
      fecha_valor: (hecho && hecho.fecha_valor) || null,
      periodo: propuesta.periodo || (hecho && hecho.periodo) || null
    };
    return { status: 200, data: { project_id: pid, asiento, debe: res.sumas.debe, haber: res.sumas.haber } };
  }

  // validacion de partida doble reutilizable (apertura/cierre/contrapartida).
  _validarSinClave(asiento) {
    const apuntes = Array.isArray(asiento && asiento.apuntes) ? asiento.apuntes
      : (Array.isArray(asiento && asiento.lineas) ? asiento.lineas : null);
    if (!apuntes || apuntes.length < 2) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'un asiento exige al menos dos apuntes (partida doble)', { n_apuntes: apuntes ? apuntes.length : 0 });
    }
    for (const a of apuntes) {
      const debe = Number(a && a.debe) || 0;
      const haber = Number(a && a.haber) || 0;
      if ((debe === 0 && haber === 0) || (debe !== 0 && haber !== 0)) {
        return this._errorResponse(422, 'INVALID_INPUT', 'cada apunte lleva debe O haber', { apunte: a });
      }
      if (!(a && a.cuenta)) return this._invalid('apunte.cuenta');
    }
    const sumas = this._sumas(apuntes);
    if (Math.abs(sumas.debe - sumas.haber) > EPS) {
      return this._errorResponse(409, CODE_DESCUADRE,
        `el asiento NO cuadra: debe ${sumas.debe} != haber ${sumas.haber}`, {
          debe: sumas.debe, haber: sumas.haber, simbolico: CODE_DESCUADRE, asentado: false
        });
    }
    return { status: 200, sumas };
  }

  // registra el asiento en el diario APPEND-ONLY del custodio (nunca se borra).
  _registrar(pid, d, datos) {
    const id = `${pid}-A${d.diario.length + 1}`;
    const asiento = {
      id,
      ...datos,
      asentado_por: ROL_ESCRITOR_DIARIO,
      asentado_en: new Date().toISOString(),
      borrable: false
    };
    d.asientos[asiento.clave_natural] = asiento;
    d.diario.push({ id, clave_natural: asiento.clave_natural, tipo: asiento.tipo, debe: asiento.debe, haber: asiento.haber });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);
    return asiento;
  }

  // ── Tools ──
  toolAsentar(params) { return this._asentar(params); }
  toolRegistrarApertura(params) { return this._registrarApertura(params); }
  toolRegistrarCierre(params) { return this._registrarCierre(params); }
  toolComponerDesdeContrapartida(params) { return this._componerDesdeContrapartida(params); }
}

module.exports = EscritorDiario;
