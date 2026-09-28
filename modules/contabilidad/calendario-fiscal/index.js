/**
 * contabilidad/calendario-fiscal — CUSTODIO (D6, hoja del plan).
 *
 * LOS PLAZOS DECLARABLES POR EJERCICIO. Y son declarables PORQUE CAMBIAN:
 * prorrogas, festivos, domiciliacion, cambios de criterio. Aqui NUNCA se fija
 * una fecha de memoria: cada plazo (que modelo, que ejercicio, que periodo,
 * hasta cuando) entra DECLARADO por el asesor o el dueno. Si un plazo no esta
 * declarado, NO EXISTE para el sistema — no se estima, no se supone.
 *
 * DISPARA AVISO PROACTIVO: cuando un plazo declarado se acerca, se PIDE el aviso
 * al motor de avisos (K2) por EVENTO (contabilidad.aviso.solicitar.request). El
 * aviso es lo unico que K2 produce; el aviso NO cambia el plazo.
 *
 * CUSTODIO (patron real): store en memoria (plazos por (ejercicio, modelo,
 * periodo) + secuencia append-only de declaraciones); PosPersistencia (storage
 * /contabilidad/calendario-fiscal/*.json); restaura en project.activated; flush
 * en onUnload. GUARD de un solo escritor: solo ASESOR/DUENO declaran plazos —
 * cualquier otro se rechaza con ERROR_DOS_ESCRITORES.
 * Emisor/par de fallo: exito publica contabilidad.plazo_declarado ·
 * contabilidad.plazo_proximo; error su par determinista. La dependencia con
 * perfil-administrativo (D15) y motor-avisos (K2) es por EVENTO, NUNCA por
 * require cruzado (de D15 se LEEN las obligaciones que aplican, sin asumirlas).
 * NO REUTILIZA: el calendario fiscal con plazos declarables no existe en el
 * inventario.
 *
 * Ver hoja D6 del diseno-oop y bloque `calendario-fiscal` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Un solo escritor del calendario (D6): ASESOR o DUENO declaran los plazos.
const ROLES_AUTORIZADOS = new Set(['ASESOR', 'DUENO']);

// Codigo simbolico determinista del cerrojo de escritor unico.
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';

// Antelacion por defecto con la que se dispara el aviso (DECLARABLE).
const DIAS_AVISO_DEFECTO = 15;

// Destinatario por defecto del aviso de plazo (lo fiscal lo lleva el asesor).
const DESTINATARIO_DEFECTO = 'ASESOR';

// Fecha minima valida (ISO corto): se compara en texto, sin construir objetos
// de fecha del sistema — el "hoy" siempre lo DICE quien pregunta.
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

class CalendarioFiscal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'calendario-fiscal';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, ejercicios:{<ejercicio>:{...}},
    //                                  declaraciones:[], antelacion_dias }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'calendario-fiscal.json',
      dir: '/contabilidad/calendario-fiscal',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.ejercicios) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el calendario declarado del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.calendario.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.plazo_declarado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.calendario.declarar.failed', res);
      }
      return res;
    });
  }

  onProximosRequest(e) {
    return this._atender(e, 'proximos', 'contabilidad.calendario.proximos.response', async (d) => {
      const res = this._proximos(d);
      if (res.status === 200) {
        // Cada plazo proximo dispara su aviso proactivo (K2), por EVENTO.
        for (const plazo of res.data.plazos) {
          const disparo = this._dispararAviso({ ...d, plazo, hoy: res.data.hoy });
          if (disparo.status !== 200) {
            this.eventBus?.publish('contabilidad.plazo_declarado.failed', disparo);
            continue;
          }
          this.eventBus?.publish('contabilidad.plazo_proximo', {
            ...disparo.data,
            correlation_id: d.correlation_id
          });
          await this._pedirAviso(d, disparo.data);
        }
      } else {
        this.eventBus?.publish('contabilidad.calendario.proximos.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = {
        esquema: 'contabilidad-calendario-fiscal-v1',
        ejercicios: {},
        declaraciones: [],
        antelacion_dias: DIAS_AVISO_DEFECTO,
        escritor: [...ROLES_AUTORIZADOS],
        ley_cableada: false
      };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (D6): solo ASESOR/DUENO declaran los plazos.
  _verificarEscritorUnico(rol) {
    const r = String(rol || '').toUpperCase();
    if (!ROLES_AUTORIZADOS.has(r)) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'el calendario fiscal tiene UN escritor: solo ASESOR/DUENO declaran los plazos', {
          escritor_vigente: [...ROLES_AUTORIZADOS],
          rol_intentado: r || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  // declarar(rol, ejercicio, plazos) -> ok. Un solo escritor (ASESOR/DUENO).
  // Los plazos CAMBIAN (prorrogas, festivos, domiciliacion): se DECLARAN.
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const ejercicio = input && (input.ejercicio !== undefined ? input.ejercicio : null);
    if (ejercicio === null || ejercicio === '') return this._invalid('ejercicio');

    const plazosIn = Array.isArray(input && input.plazos) ? input.plazos : null;
    if (!plazosIn || plazosIn.length === 0) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'declarar el calendario exige la lista de plazos del ejercicio: no se fija ninguna fecha de memoria', {
          ejercicio, asumido: false, senal: 'SIN_PLAZOS_DECLARADOS'
        });
    }

    // Cada plazo exige su fecha limite DECLARADA. Sin ella no entra.
    for (const p of plazosIn) {
      const hasta = p && (p.hasta || p.fecha_limite || p.fecha);
      if (!hasta) {
        return this._errorResponse(422, 'PRECONDITION_FAILED',
          'cada plazo exige su fecha limite DECLARADA (hasta): no se fija ninguna fecha de memoria', {
            plazo: p, asumido: false
          });
      }
      if (!RE_FECHA.test(String(hasta))) {
        return this._errorResponse(422, 'INVALID_INPUT',
          `la fecha limite ${hasta} no tiene forma AAAA-MM-DD`, { plazo: p, fecha_recibida: hasta });
      }
    }

    const d = this._obtenerOCrear(pid);
    if (input.antelacion_dias !== undefined) {
      const ad = Number(input.antelacion_dias);
      if (Number.isFinite(ad) && ad >= 0) d.antelacion_dias = ad;
    }

    const claveEj = String(ejercicio);
    const registro = d.ejercicios[claveEj] || { ejercicio: claveEj, plazos: {}, declarado_en: null, declaraciones: 0 };

    const declarados = [];
    for (const p of plazosIn) {
      const modelo = String(p.modelo || p.id_obligacion || p.obligacion || '').toUpperCase();
      if (!modelo) return this._invalid('plazo.modelo');
      const periodo = p.periodo !== undefined && p.periodo !== null ? String(p.periodo) : 'EJERCICIO';
      const clave = `${claveEj}:${modelo}:${periodo}`;

      const plazo = {
        clave,
        ejercicio: claveEj,
        modelo,
        periodo,
        hasta: String(p.hasta || p.fecha_limite || p.fecha),
        // La fecha es un DATO declarado, jamas una constante legal.
        declarada: true,
        origen_fecha: p.origen_fecha || 'DECLARADA',
        // Circunstancias que CAMBIAN el plazo: se declaran, no se suponen.
        prorroga: p.prorroga || null,
        festivo: p.festivo || null,
        domiciliacion: p.domiciliacion !== undefined ? !!p.domiciliacion : null,
        via: p.via || null,
        descripcion: p.descripcion || null,
        destinatario: String(p.destinatario || DESTINATARIO_DEFECTO).toUpperCase(),
        declarado_por: String(input.rol || '').toUpperCase(),
        declarado_en: new Date().toISOString()
      };
      registro.plazos[clave] = plazo;
      registro.declaraciones += 1;
      registro.declarado_en = plazo.declarado_en;
      declarados.push(plazo);
      d.declaraciones.push({ clave, ejercicio: claveEj, modelo, periodo, hasta: plazo.hasta, declarado_en: plazo.declarado_en });
    }
    d.ejercicios[claveEj] = registro;
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: claveEj,
        plazos: declarados,
        n_plazos: declarados.length,
        antelacion_dias: d.antelacion_dias,
        fecha_de_memoria: false,
        ley_cableada: false
      }
    };
  }

  // proximos(hoy) -> List<Plazo>. El "hoy" lo DICE quien pregunta: el modulo no
  // construye fechas por su cuenta (nada de relojes implicitos).
  _proximos(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const hoy = input && (input.hoy || input.fecha);
    if (!hoy || !RE_FECHA.test(String(hoy))) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'proximos exige el "hoy" declarado (AAAA-MM-DD): el modulo no fija fechas de memoria', {
          hoy_recibido: hoy || null, asumido: false
        });
    }

    const d = this._obtenerOCrear(pid);
    const antelacion = (input && input.antelacion_dias !== undefined)
      ? Number(input.antelacion_dias)
      : d.antelacion_dias;
    const ejercicio = input && input.ejercicio !== undefined ? String(input.ejercicio) : null;

    const plazos = [];
    for (const [claveEj, reg] of Object.entries(d.ejercicios)) {
      if (ejercicio && claveEj !== ejercicio) continue;
      for (const plazo of Object.values(reg.plazos || {})) {
        const dias = this._diasHasta(hoy, plazo.hasta);
        if (dias === null) continue;
        // Proximo = aun no vencido y dentro de la antelacion declarada; y
        // tambien lo atrasado (dias < 0) se declara, no se esconde.
        if (dias <= antelacion) {
          plazos.push({
            ...plazo,
            dias_restantes: dias,
            vencido: dias < 0,
            proximo: dias >= 0,
            estado: dias < 0 ? 'ATRASADO' : (dias === 0 ? 'VENCE_HOY' : 'PROXIMO')
          });
        }
      }
    }
    plazos.sort((a, b) => a.dias_restantes - b.dias_restantes);

    return {
      status: 200,
      data: {
        project_id: pid,
        hoy: String(hoy),
        antelacion_dias: antelacion,
        plazos,
        n_plazos: plazos.length,
        n_atrasados: plazos.filter((p) => p.vencido).length,
        determinista: true,
        lee_el_hoy_declarado: true
      }
    };
  }

  // dispararAviso(plazo) -> senal a K2. El aviso es proactivo; el plazo NO cambia.
  _dispararAviso(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const plazo = input && input.plazo;
    if (!plazo || typeof plazo !== 'object') return this._invalid('plazo');

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'AVISO_PLAZO',
        origen: 'D6_CALENDARIO_FISCAL',
        modelo: plazo.modelo,
        periodo: plazo.periodo,
        ejercicio: plazo.ejercicio,
        hasta: plazo.hasta,
        dias_restantes: plazo.dias_restantes !== undefined ? plazo.dias_restantes : null,
        estado: plazo.estado || null,
        destinatario: plazo.destinatario || DESTINATARIO_DEFECTO,
        cola_destino: plazo.destinatario || DESTINATARIO_DEFECTO,
        // La prorroga/festivo/domiciliacion viaja con el aviso: es lo que CAMBIA.
        prorroga: plazo.prorroga || null,
        festivo: plazo.festivo || null,
        domiciliacion: plazo.domiciliacion !== undefined ? plazo.domiciliacion : null,
        prioridad: plazo.vencido ? 'ALTA' : (plazo.dias_restantes !== null && plazo.dias_restantes <= 3 ? 'ALTA' : 'NORMAL'),
        motivo: `plazo declarado${plazo.modelo ? ` del modelo ${plazo.modelo}` : ''}: ${plazo.estado || 'PROXIMO'}`,
        contexto: {
          hoy: input.hoy || null,
          modelo: plazo.modelo,
          periodo: plazo.periodo,
          ejercicio: plazo.ejercicio,
          hasta: plazo.hasta,
          prorroga: plazo.prorroga || null,
          festivo: plazo.festivo || null,
          domiciliacion: plazo.domiciliacion !== undefined ? plazo.domiciliacion : null,
          origen_fecha: 'DECLARADA'
        }
      }
    };
  }

  // Aviso a motor-avisos (K2) por EVENTO. CONTRATO TOLERANTE.
  async _pedirAviso(d, senal) {
    const resp = await this._rpc('contabilidad.aviso.solicitar.request', {
      project_id: senal.project_id,
      origen: senal.origen,
      tipo: senal.tipo,
      motivo: senal.motivo,
      destinatario: senal.destinatario,
      cola_destino: senal.cola_destino,
      prioridad: senal.prioridad,
      contexto: senal.contexto,
      correlation_id: d && d.correlation_id
    }, { timeout_ms: 4000 });

    if (!resp || resp.status !== 200) {
      this.eventBus?.publish('contabilidad.plazo_proximo.failed', {
        status: (resp && resp.status) || 503,
        error: {
          code: 'DEPENDENCIA_NO_DISPONIBLE',
          message: 'motor-avisos (K2) no respondio: el plazo QUEDA declarado y su aviso emitido, no se fabrica el aviso',
          details: { dependencia: 'motor-avisos', modelo: senal.modelo, hasta: senal.hasta }
        },
        correlation_id: d && d.correlation_id
      });
      return null;
    }
    return resp;
  }

  // diasHasta(hoy, hasta) -> Int | null. Aritmetica de calendario en texto (UTC),
  // sin leer el reloj del sistema.
  _diasHasta(hoy, hasta) {
    const a = this._aMs(hoy);
    const b = this._aMs(hasta);
    if (a === null || b === null) return null;
    return Math.round((b - a) / 86400000);
  }

  _aMs(fecha) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isFinite(ms) ? ms : null;
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolProximos(params) { return this._proximos(params); }
  toolDispararAviso(params) { return this._dispararAviso(params); }
}

module.exports = CalendarioFiscal;
