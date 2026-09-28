/**
 * contabilidad/resolucion-contrapartida — MICRO-AGENTE (A6.1, hoja del plan).
 *
 * EL JUICIO DE LA CONTRAPARTIDA ASISTIDA: propone cuenta + tercero + periodo
 * para un hecho YA admitido/normalizado/deduplicado. PROPONE, NO DECIDE: el
 * corte DURO lo fija la REGLA (A6.2 `regla-contrapartida`, custodio) — si una
 * regla que ACTUA cubre el hecho, la propuesta es la de la regla (origen REGLA,
 * confianza 1). Si NINGUNA regla cubre, aqui NO se inventa la cuenta: se ALZA
 * UNA EXCEPCION a la cola de revision (A8.1, naturaleza CONTABLE -> cola ASESOR)
 * para que lo decida quien tiene la silla. Inventar una cuenta seria asentar
 * sobre nada (invariante 7: dato ausente = desconocido).
 *
 * MICRO-AGENTE (patron hibrido real): mitad REFLEJO determinista (lectura de la
 * regla por EVENTO `contabilidad.regla.leer.request`, matching del patron,
 * ambiguedad medida) + mitad FUZZY en el cajon de blueprint del modulo (el LLM
 * que elige cuenta/tercero cuando la ambiguedad es baja pero no hay regla; el
 * gate scripts/validate-hibridos.js exige que la op fuzzy NO vaya en
 * module.json.subscribes). SI PERSISTE: su memoria de lo proponido y de lo
 * alzado es APRENDIZAJE —evita re-proponer lo ya resuelto y es la base de la
 * explicacion (L2)—, por eso lleva PosPersistencia + onProjectActivated, como
 * pide la espina para esta hoja. La dependencia con normalizador-hecho,
 * catalogo-cuentas, regla-contrapartida, maestro-terceros y deduplicacion-hecho
 * es por EVENTO (request/response del bus), NUNCA por require cruzado; si
 * regla-contrapartida (A6.2) NO responde se publica DEPENDENCIA_NO_DISPONIBLE y
 * NUNCA se emite una propuesta inventada (contrato TOLERANTE).
 *
 * Emisor/par de fallo: exito publica contabilidad.contrapartida_propuesta (lo
 * consume escritor-diario, B2); error su par determinista.
 * NO REUTILIZA: no existe resolucion de contrapartida contable en el inventario
 * (IVA/plan/diario = 0 modulos).
 *
 * Ver hoja A6.1 del diseno-oop y bloque `resolucion-contrapartida` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Solo las reglas que ACTUAN sobre el volumen (una APRENDIDA espera a L10).
const ESTADOS_QUE_ACTUAN = new Set(['DECLARADA', 'RATIFICADA']);

// La excepcion de contrapartida es CONTABLE -> cola ASESOR (routing A8.1).
const NATURALEZA_EXCEPCION = 'CONTABLE';
const COLA_DESTINO = 'ASESOR';

// A partir de este grado, la ambiguedad es ALTA (se refleja en la excepcion).
const UMBRAL_AMBIGUEDAD = 0.5;

// Señales que hacen un hecho direccionable/legible (base del grado de ambiguedad).
const SENALES_HECHO = ['vertical', 'fecha_operacion', 'tercero', 'lineas', 'impuestos', 'documento_origen'];

class ResolucionContrapartida extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'resolucion-contrapartida';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, propuestas: [], excepciones: [] }
    // Es APRENDIZAJE del juicio (lo propuesto / lo que hubo que escalar), no una
    // parcela de dominio: la contrapartida VIVA es del asiento (B2).
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'resolucion-contrapartida.json',
      dir: '/contabilidad/resolucion-contrapartida',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.propuestas) this._store.set(pid, data);
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
  onProponerRequest(e) {
    return this._atender(e, 'proponer', 'contabilidad.contrapartida.proponer.response', async (d) => {
      const res = await this._proponer(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.contrapartida_propuesta', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        // Lo dudoso NO se asienta: la excepcion va a su cola (senal a A8.1).
        this.eventBus?.publish('contabilidad.contrapartida.proponer.failed', {
          ...res,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // Fire-and-forget: deduplicacion-hecho (A7) declaro el hecho NUEVO.
  onHechoNuevo(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return (async () => {
      const res = await this._proponer({
        project_id: d.project_id,
        hecho: d.hecho || d,
        vertical: d.vertical,
        reglas: d.reglas,
        correlation_id: d.correlation_id
      });
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.contrapartida_propuesta', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.contrapartida_propuesta.failed', {
          ...res,
          correlation_id: d.correlation_id
        });
      }
      return res;
    })();
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-resolucion-contrapartida-v1', propuestas: [], excepciones: [] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // El CORTE DURO vive en A6.2: aqui solo se LEE por EVENTO (sin require cruzado).
  async _leerReglasActivas(pid) {
    const resp = await this._rpc('contabilidad.regla.leer.request', { project_id: pid }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;   // null = dependencia no disponible
    const reglas = (resp.data && resp.data.reglas) || [];
    return reglas.filter((r) => ESTADOS_QUE_ACTUAN.has(String(r && r.estado).toUpperCase()));
  }

  // Coincidencia determinista regla <-> hecho (misma semantica que el patron de A6.2).
  _reglaQueCubre(reglas, hecho) {
    for (const regla of reglas) {
      const patron = (regla && regla.patron) || null;
      if (!patron || typeof patron !== 'object') continue;
      const claves = Object.keys(patron);
      if (claves.length === 0) continue;
      if (claves.every((k) => hecho[k] === patron[k])) return regla;
    }
    return null;
  }

  // Grado de ambiguedad [0..1]: señales presentes / señales exigibles. Determinista.
  _gradoAmbiguedad(hecho) {
    const presentes = SENALES_HECHO.filter((c) => {
      const v = hecho[c];
      return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
    });
    const cobertura = presentes.length / SENALES_HECHO.length;
    return this._round(1 - cobertura, 2);
  }

  // proponer(hecho) -> ContrapartidaPropuesta {cuenta, tercero, periodo} — FUZZY (LLM).
  // La parte determinista: si la REGLA cubre, la propuesta es la de la regla. Si no
  // cubre, NO se inventa la cuenta: excepcion a la cola (A8.1).
  async _proponer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = (input && (input.hecho || input.hecho_normalizado)) || null;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');
    if (!hecho.vertical && !(input && input.vertical)) return this._invalid('hecho.vertical');

    const vertical = hecho.vertical || input.vertical;
    const ambiguedad = this._gradoAmbiguedad(hecho);

    // CORTE DURO: la regla (A6.2) manda. Se lee por EVENTO.
    const reglas = await this._leerReglasActivas(pid);
    if (reglas === null) {
      return this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'regla-contrapartida (A6.2) no respondio: no se inventa la contrapartida', {
          dependencia: 'regla-contrapartida',
          accion: 'NO_PROPONER_PUBLICAR_FALLO',
          hecho_vertical: vertical
        });
    }

    const regla = this._reglaQueCubre(reglas, hecho);
    if (!regla) {
      // Sin cobertura NO se inventa la cuenta: excepcion a la cola de revision.
      return this._alzarExcepcion(pid, hecho, vertical, ambiguedad);
    }

    const cp = regla.contrapartida || {};
    const propuesta = {
      hecho_vertical: vertical,
      clave_natural: hecho.clave_natural || null,
      cuenta: cp.cuenta || null,
      tercero: cp.tercero || hecho.tercero || null,
      periodo: cp.periodo || hecho.periodo || hecho.fecha_operacion || null,
      origen: 'REGLA',
      regla_id: regla.id,
      confianza: 1,
      ambiguedad,
      propone_no_decide: true,
      decidido_por_regla: true
    };
    if (!propuesta.cuenta) {
      // Una regla que actua sin cuenta declarada tampoco autoriza inventar: a la cola.
      return this._alzarExcepcion(pid, hecho, vertical, ambiguedad, 'REGLA_SIN_CUENTA');
    }

    const justificacion = this._justificar(propuesta);
    const d = this._obtenerOCrear(pid);
    d.propuestas.push({ propuesta, justificacion, propuesta_en: new Date().toISOString() });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        propuesta,
        justificacion,
        origen: 'REGLA',
        ambiguedad,
        nota: 'propone, no decide: el corte duro lo fija la regla (A6.2) y lo asienta escritor-diario (B2)'
      }
    };
  }

  // justificar(propuesta) -> Explicacion (base de L2: nada es caja negra).
  _justificar(propuesta) {
    const p = propuesta || {};
    return {
      cifra: p.cuenta || null,
      base: p.clave_natural || null,
      origen: p.origen === 'REGLA' ? `regla ${p.regla_id}` : 'juicio',
      estado: 'PROPUESTA',
      confianza: p.confianza !== undefined ? p.confianza : null,
      ambiguedad: p.ambiguedad !== undefined ? p.ambiguedad : null,
      explicable: true,
      propone_no_decide: true
    };
  }

  // ambiguedad alta y sin regla -> excepcion a cola (A8.1), no se asienta.
  _alzarExcepcion(pid, hecho, vertical, ambiguedad, motivoBase) {
    const ambiguedadAlta = ambiguedad >= UMBRAL_AMBIGUEDAD;
    const excepcion = {
      id: `${pid}-A6.1-${(hecho && hecho.clave_natural) || Date.now()}`,
      naturaleza: NATURALEZA_EXCEPCION,
      motivo: motivoBase || 'SIN_COBERTURA',
      cola_destino: COLA_DESTINO,
      ambiguedad,
      ambiguedad_alta: ambiguedadAlta,
      prioridad: ambiguedadAlta ? 'ALTA' : 'NORMAL',
      vertical,
      hecho,
      regla_cubre: false,
      senal: 'excepcion_a_cola_revision',
      no_inventa_cuenta: true
    };
    const d = this._obtenerOCrear(pid);
    d.excepciones.push({ excepcion, alzada_en: new Date().toISOString() });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return this._errorResponse(409, 'SIN_COBERTURA',
      'ninguna regla cubre el hecho: no se inventa la cuenta, va a la cola de revision', {
        project_id: pid,
        cola: COLA_DESTINO,
        excepcion,
        ambiguedad,
        senal: 'excepcion_a_cola_revision',
        no_inventa_cuenta: true,
        nota: 'el encolado entra por ADMISION (unica puerta de A8.1); aqui se alza la senal'
      });
  }

  // ── Tools ──
  toolProponer(params) { return this._proponer(params); }
  toolJustificar(params) { return this._justificar(params.propuesta || params); }
  toolGradoAmbiguedad(params) { return this._gradoAmbiguedad(params.hecho || params); }
}

module.exports = ResolucionContrapartida;
