/**
 * contabilidad/partida-no-identificada — MICRO-AGENTE (E7, hoja del plan).
 *
 * EL JUICIO: el movimiento SIN contrapartida llega con DESCRIPCION AMBIGUA ->
 * INTERPRETAR (comision / interes / devolucion). Una vez existe la regla (E8
 * `regla-movimiento-bancario`, custodio), pasa a AUTOMATICO. Lo NO reconocible
 * -> excepcion a la cola (A8.1); NUNCA se ignora el movimiento. Aqui PROPONE,
 * no escribe el libro: la contrapartida reconocida se PUBLICA
 * (contabilidad.partida_clasificada) y la desconocida se ENCOLA
 * (contabilidad.excepcion.encolar.request) — el hecho no se pierde.
 *
 * MICRO-AGENTE (patron hibrido real): mitad REFLEJO determinista (lectura de las
 * reglas de E8 por EVENTO, matching de patron, grado de ambiguedad,
 * clasificacion por señales del texto) + mitad FUZZY en el cajon de blueprint
 * del modulo (el LLM que interpreta la descripcion cuando no hay regla; el gate
 * scripts/validate-hibridos.js exige que la op fuzzy NO vaya en
 * module.json.subscribes). SI PERSISTE: su memoria de lo reconocido es
 * APRENDIZAJE — evita re-interpretar el mismo movimiento, es la EVIDENCIA de la
 * regla que E8 aprende ("esta comision -> esta cuenta") y la base de la
 * explicacion; por eso lleva PosPersistencia + onProjectActivated, como pide la
 * espina para esta hoja. OJO: NO escribe el repositorio de reglas de E8 (es
 * custodio single-writer de rol DUENO/ASESOR): solo LEE por EVENTO
 * contabilidad.regla_movimiento.leer.request, y la candidata se PUBLICA para
 * que E8/desatasco la hidraten y L10 la ratifique.
 *
 * Emisor/par de fallo: exito publica contabilidad.partida_clasificada o
 * contabilidad.excepcion.encolar.request (segun el juicio); error su par
 * determinista. NO REUTILIZA: la interpretacion de partidas bancarias es propia;
 * no existe en el inventario.
 *
 * Ver hoja E7 del diseno-oop y bloque `partida-no-identificada` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Tipos reconocibles de partida bancaria (el juicio propone uno de estos).
const TIPOS_PARTIDA = ['COMISION', 'INTERES', 'DEVOLUCION', 'TRANSFERENCIA', 'IMPUESTO', 'OTRO'];

// Naturaleza de la excepcion de una partida bancaria (routing A8.1).
const NATURALEZA_EXCEPCION = 'BANCARIA';
const COLA_DESTINO = 'ASESOR';

// A partir de este grado, la ambiguedad es ALTA (se refleja en la excepcion).
const UMBRAL_AMBIGUEDAD = 0.5;

// Señales de la descripcion que orientan el reconocimiento (deterministas).
const SENALES = [
  { tipo: 'COMISION', claves: ['comision', 'comisiones', 'mantenimiento', 'cuota'] },
  { tipo: 'INTERES', claves: ['interes', 'intereses', 'abono interes', 'liquidacion'] },
  { tipo: 'DEVOLUCION', claves: ['devolucion', 'devuelto', 'rechazo', 'impagado', 'devol.'] },
  { tipo: 'TRANSFERENCIA', claves: ['transferencia', 'transf', 'traspaso'] },
  { tipo: 'IMPUESTO', claves: ['impuesto', 'iva', 'aeat', 'agencia tributaria', 'retencion'] }
];

class PartidaNoIdentificada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'partida-no-identificada';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, reconocidas: [], excepciones: [] }
    // Es APRENDIZAJE del juicio (lo reconocido / lo que hubo que encolar), no una
    // parcela de dominio: las reglas vivas son de E8; el movimiento es del extracto.
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'partida-no-identificada.json',
      dir: '/contabilidad/partida-no-identificada',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.reconocidas) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la memoria del juicio del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onReconocerRequest(e) {
    return this._atender(e, 'reconocer', 'contabilidad.partida.reconocer.response', async (d) => {
      const res = await this._reconocer(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.partida_clasificada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else if (res.error && res.error.code === 'SIN_REGLA') {
        // Lo no reconocible NO se ignora: va a la cola (A8.1) por su puerta unica.
        await this._encolar(d, res.error.details || {});
        this.eventBus?.publish('contabilidad.partida_clasificada.failed', res);
      } else {
        this.eventBus?.publish('contabilidad.partida_clasificada.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: conciliacion-bancaria (E1) entrego los movimientos SIN cruzar.
  // El JUICIO de cada partida ocurre aqui (aqui se interpreta la descripcion ambigua).
  onMovimientoSinCruzar(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const movimientos = Array.isArray(d.movimientos) ? d.movimientos : (d.movimiento ? [d.movimiento] : []);
    if (movimientos.length === 0) return null;

    return (async () => {
      const resultados = [];
      for (const mov of movimientos) {
        const res = await this._reconocer({
          project_id: d.project_id,
          movimiento: mov,
          correlation_id: d.correlation_id
        });
        if (res.status === 200) {
          resultados.push({ clasificada: true, ...res.data });
          this.eventBus?.publish('contabilidad.partida_clasificada', {
            ...res.data,
            correlation_id: d.correlation_id
          });
        } else {
          // SIN_REGLA u otro: a la cola. NUNCA se ignora el movimiento.
          await this._encolar({ ...d, movimiento: mov }, res.error && res.error.details ? res.error.details : {});
          resultados.push({ clasificada: false, error: res.error || null });
        }
      }
      return { status: 200, data: { project_id: d.project_id, n: movimientos.length, resultados } };
    })();
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-partida-no-identificada-v1', reconocidas: [], excepciones: [] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // Lee las reglas que ACTUAN del repositorio de E8 (por EVENTO). null = no disponible.
  async _reglasActivas(pid) {
    const resp = await this._rpc('contabilidad.regla_movimiento.leer.request', { project_id: pid }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    const reglas = (resp.data && resp.data.reglas) || [];
    return reglas.filter((r) => {
      const e = String(r && r.estado).toUpperCase();
      return e === 'DECLARADA' || e === 'RATIFICADA';
    });
  }

  // Coincidencia determinista regla <-> movimiento (misma semantica que E8).
  _reglaQueCubre(reglas, movimiento) {
    for (const regla of reglas) {
      const patron = (regla && regla.patron) || null;
      if (!patron || typeof patron !== 'object') continue;
      const claves = Object.keys(patron);
      if (claves.length === 0) continue;
      if (claves.every((k) => movimiento[k] === patron[k])) return regla;
    }
    return null;
  }

  // Grado de ambiguedad [0..1]: señales presentes / señales exigibles. Determinista.
  _gradoAmbiguedad(movimiento) {
    const m = movimiento || {};
    const señales = [
      !!(m.descripcion || m.concepto),
      !!(m.importe !== undefined && m.importe !== null),
      !!(m.fecha_valor || m.fecha),
      !!(m.referencia || m.documento),
      !!(m.contraparte || m.tercero),
      !!m.clave_natural
    ];
    const presentes = señales.filter(Boolean).length;
    return this._round(1 - presentes / señales.length, 2);
  }

  // reconocer(movimiento) -> Clasificacion | SIN_REGLA. La parte determinista: la
  // regla (E8) que cubre manda; si no cubre, el texto se clasifica por señales.
  async _reconocer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const movimiento = (input && (input.movimiento || input.mov)) || null;
    if (!movimiento || typeof movimiento !== 'object') return this._invalid('movimiento');

    const ambiguedad = this._gradoAmbiguedad(movimiento);

    // La REGLA (E8) manda: se lee por EVENTO (sin require cruzado).
    const reglas = await this._reglasActivas(pid);
    if (reglas === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'regla-movimiento-bancario (E8) no respondio: no se interpreta a ciegas', {
          dependencia: 'regla-movimiento-bancario',
          accion: 'NO_CLASIFICAR_PUBLICAR_FALLO',
          clave_natural: movimiento.clave_natural || null
        });
    }

    const regla = this._reglaQueCubre(reglas, movimiento);
    if (regla) {
      const cp = regla.contrapartida || {};
      const clasificacion = {
        project_id: pid,
        clave_natural: movimiento.clave_natural || null,
        movimiento,
        tipo: cp.tipo || regla.tipo || 'OTRO',
        contrapartida: cp,
        cuenta: cp.cuenta || null,
        tercero: cp.tercero || movimiento.tercero || null,
        origen: 'REGLA',
        regla_id: regla.id,
        confianza: 1,
        ambiguedad,
        automatico: true,
        propone_no_decide: true
      };
      return this._guardarClasificacion(pid, clasificacion, 'una regla de E8 ya cubre el movimiento');
    }

    // Sin regla: se interpreta el TEXTO por señales. Si la ambiguedad es alta, SIN_REGLA.
    const tipo = this._clasificarTexto(movimiento);
    if (!tipo || ambiguedad >= UMBRAL_AMBIGUEDAD * 2) {
      return this._errorResponse(409, 'SIN_REGLA',
        'el movimiento no se reconoce: no se inventa la contrapartida, va a la cola de revision', {
          project_id: pid,
          clave_natural: movimiento.clave_natural || null,
          ambiguedad,
          ambiguedad_alta: ambiguedad >= UMBRAL_AMBIGUEDAD,
          senal: 'excepcion_a_cola_revision',
          no_inventa_cuenta: true
        });
    }

    const clasificacion = {
      project_id: pid,
      clave_natural: movimiento.clave_natural || null,
      movimiento,
      tipo,
      contrapartida: { tipo, cuenta: null, tercero: movimiento.tercero || null },
      cuenta: null,
      tercero: movimiento.tercero || null,
      origen: 'TEXTO',
      regla_id: null,
      confianza: this._round(1 - ambiguedad, 2),
      ambiguedad,
      automatico: false,
      propone_no_decide: true,
      regla_candidata: this._proponerRegla(pid, movimiento, tipo)
    };
    return this._guardarClasificacion(pid, clasificacion, 'interpretacion por señales del texto: la regla (E8) la hara automatica');
  }

  // proponerContrapartida(movimiento) -> Contrapartida (comision/interes/devolucion).
  _proponerContrapartida(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const movimiento = (input && (input.movimiento || input.mov)) || null;
    if (!movimiento || typeof movimiento !== 'object') return this._invalid('movimiento');
    const tipo = this._clasificarTexto(movimiento);
    if (!tipo) {
      return this._errorResponse(409, 'SIN_REGLA',
        'sin señales en la descripcion no se propone contrapartida (no se inventa)', {
          clave_natural: movimiento.clave_natural || null
        });
    }
    return {
      status: 200,
      data: {
        project_id: pid,
        clave_natural: movimiento.clave_natural || null,
        contrapartida: {
          tipo,
          cuenta: null,
          tercero: movimiento.tercero || null,
          importe: this._round(Number(movimiento.importe) || 0, 2)
        },
        propone_no_decide: true
      }
    };
  }

  // Clasificacion determinista por señales del texto (comision/interes/devolucion...).
  _clasificarTexto(movimiento) {
    const texto = String(
      (movimiento && (movimiento.descripcion || movimiento.concepto)) || ''
    ).toLowerCase();
    if (!texto) return null;
    for (const s of SENALES) {
      if (s.claves.some((k) => texto.includes(k))) return s.tipo;
    }
    return null;
  }

  // Guarda el reconocimiento en la memoria (APRENDIZAJE) y devuelve la clasificacion.
  _guardarClasificacion(pid, clasificacion, nota) {
    const d = this._obtenerOCrear(pid);
    d.reconocidas.push({ clasificacion, reconocida_en: new Date().toISOString() });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);
    return {
      status: 200,
      data: {
        ...clasificacion,
        justificacion: {
          cifra: clasificacion.cuenta || null,
          base: clasificacion.clave_natural,
          origen: clasificacion.origen,
          confianza: clasificacion.confianza,
          ambiguedad: clasificacion.ambiguedad,
          explicable: true
        },
        nota
      }
    };
  }

  // produce la regla CANDIDATA (no actua; la hidrata E8 y la ratifica L10).
  _proponerRegla(pid, movimiento, tipo) {
    return {
      regla_id: `${pid}-E7-${movimiento.clave_natural || Date.now()}`,
      repositorio: 'regla-movimiento-bancario',
      patron: {
        descripcion_contiene: String((movimiento && (movimiento.descripcion || movimiento.concepto)) || '').slice(0, 40),
        tipo
      },
      contrapartida: { tipo, cuenta: null, tercero: (movimiento && movimiento.tercero) || null },
      estado: 'RATIFICACION_PENDIENTE',
      actua: false,
      aportada_por: 'PARTIDA_NO_IDENTIFICADA_E7',
      firma_del_sistema: false
    };
  }

  // encolar(excepcion) -> forward a la cola (A8.1) por su puerta UNICA. NO se ignora.
  async _encolar(d, detalles) {
    const pid = (d && d.project_id) || (detalles && detalles.project_id);
    if (!pid) return null;

    const movimiento = (d && (d.movimiento || (d.movimientos && d.movimientos[0]))) || null;
    const excepcion = {
      id: `${pid}-E7-${(movimiento && movimiento.clave_natural) || Date.now()}`,
      naturaleza: NATURALEZA_EXCEPCION,
      motivo: 'PARTIDA_NO_RECONOCIDA',
      cola_destino: COLA_DESTINO,
      ambiguedad: (detalles && detalles.ambiguedad) !== undefined ? detalles.ambiguedad : null,
      ambiguedad_alta: !!(detalles && detalles.ambiguedad_alta),
      prioridad: (detalles && detalles.ambiguedad_alta) ? 'ALTA' : 'NORMAL',
      movimiento,
      no_inventa_cuenta: true,
      senal: 'excepcion_a_cola_revision'
    };

    const store = this._obtenerOCrear(pid);
    store.excepciones.push({ excepcion, encolada_en: new Date().toISOString() });
    store.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    const resp = await this._rpc('contabilidad.excepcion.encolar.request', {
      project_id: pid,
      cola: COLA_DESTINO,
      excepcion,
      origen: 'E7_PARTIDA_NO_IDENTIFICADA'
    }, { timeout_ms: 4000 });

    const payload = {
      project_id: pid,
      cola: COLA_DESTINO,
      excepcion,
      encolada: !!(resp && resp.status === 200),
      en_cola: (resp && resp.data) || null,
      correlation_id: d && d.correlation_id
    };
    if (resp && resp.status === 200) {
      this.eventBus?.publish('contabilidad.excepcion.encolar.request', payload);
    } else {
      // La cola no confirmo: se DECLARA, no se asume encolado.
      this.eventBus?.publish('contabilidad.excepcion.encolar.failed', {
        status: (resp && resp.status) || 503,
        error: {
          code: 'DEPENDENCIA_NO_DISPONIBLE',
          message: 'cola-revision (A8.1) no confirmo el encolado de la partida no identificada',
          details: { cola: COLA_DESTINO, excepcion_id: excepcion.id }
        },
        excepcion
      });
    }
    return payload;
  }

  // ── Tools ──
  toolReconocer(params) { return this._reconocer(params); }
  toolProponerContrapartida(params) { return this._proponerContrapartida(params); }
  toolClasificarTexto(movimiento) { return this._clasificarTexto(movimiento || {}); }
}

module.exports = PartidaNoIdentificada;
