/**
 * contabilidad/desatasco-entrada — MICRO-AGENTE (P3, hoja del plan).
 *
 * LA ACCION QUE COMPLETA LA COLA: resolver / REENColar / descartar con MOTIVO.
 * La cola (A8.1) solo ENCOLA; aqui esta el juicio que la vacia. Resolver una
 * excepcion con su motivo es JUICIO (fuzzy): se mide la ambiguedad/el motivo y
 * se decide la salida. Y produce la REGLA CANDIDATA que cierra el bucle
 * `excepcion -> regla -> menos excepciones`, PERO esa regla NO ACTUA hasta ser
 * RATIFICADA por el ASESOR (L10 `ratificacion-regla-aprendida`, ya construido):
 * el sistema NO firma ni decide solo (invariante 11). Aqui se PROPONE y se
 * captura la decision de la silla (A8.3 [ABIERTO]: si la ocupa un humano, esta
 * clase CAPTURA su decision — no la inventa).
 *
 * MICRO-AGENTE (patron hibrido real): mitad REFLEJO determinista (clasificacion
 * de la salida, derivacion del patron/contrapartida de la regla candidata,
 * lectura de los repositorios por EVENTO) + mitad FUZZY en el cajon de blueprint
 * del modulo (el LLM que juzga el motivo y propone la salida; el gate
 * scripts/validate-hibridos.js exige que la op fuzzy NO vaya en
 * module.json.subscribes). SI PERSISTE: su memoria de desatascos y de reglas
 * candidatas es el APRENDIZAJE del bucle (evidencia para L10 y medida del "menos
 * excepciones"), por eso lleva PosPersistencia + onProjectActivated, como pide
 * la espina para esta hoja. OJO: NO escribe en los repositorios de reglas —
 * A6.2/E8 son custodios single-writer de rol DUENO/ASESOR; aqui solo se LEEN por
 * EVENTO (contabilidad.regla.leer.request / contabilidad.regla_movimiento.leer.request)
 * para no proponer lo ya cubierto, y la candidata se PUBLICA
 * (contabilidad.regla_aprendida) para que la hidrate su repositorio y la ratifique
 * L10. Resolver en la cola tampoco lo hace P3: se FORWARD al RPC de A8.1 con el
 * rol de la silla (guard de escritor por cola); sin `rol` NO se resuelve
 * (ROL_NO_DECLARADO) — el sistema no firma solo.
 *
 * Emisor/par de fallo: exito publica contabilidad.excepcion_desatascada y, si hay
 * regla candidata, contabilidad.regla_aprendida; error su par determinista.
 * NO REUTILIZA: el bucle excepcion -> regla -> menos excepciones es el corazon
 * del cuello y no existe en el inventario.
 *
 * Ver hoja P3 del diseno-oop y bloque `desatasco-entrada` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Salidas posibles del desatasco (P3).
const SALIDAS = new Set(['RESOLVER', 'REENColar', 'DESCARTAR_CON_MOTIVO']);

// Roles que pueden ocupar la silla de cada cola (guard real de A8.1).
const SILLAS = { ASESOR: 'ASESOR', DUENO: 'DUENO' };

// Repositorio de reglas por ambito de la excepcion (A6.2 contable | E8 banco).
const REPOSITORIO_CONTRAPARTIDA = 'regla-contrapartida';
const REPOSITORIO_BANCARIO = 'regla-movimiento-bancario';

// Motivo minimo exigible para descartar (descartar sin motivo NO vale).
const MOTIVO_MIN_CHARS = 4;

class DesatascoEntrada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'desatasco-entrada';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, desatascos: [], reglas: [] }
    // Es la MEMORIA del aprendizaje: evidencia del bucle y base de la ratificacion
    // (L10). No es una parcela de dominio (la cola viva es de A8.1; las reglas
    // vivas, de A6.2/E8).
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'desatasco-entrada.json',
      dir: '/contabilidad/desatasco-entrada',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.desatascos) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la memoria de aprendizaje del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC ──
  onResolverRequest(e) {
    return this._atender(e, 'resolver', 'contabilidad.desatasco.resolver.response', async (d) => {
      const res = await this._resolver(d);
      if (res.status === 200) {
        // La ACCION: se forward al RPC de A8.1 con el rol de la SILLA (guard por cola).
        const registro = await this._registrarEnCola(d, res.data);
        if (registro && registro.status === 200) {
          this.eventBus?.publish('contabilidad.excepcion_desatascada', {
            ...res.data,
            en_cola: registro.data || null,
            correlation_id: d.correlation_id
          });
        } else {
          this.eventBus?.publish('contabilidad.excepcion_desatascada.failed', {
            status: (registro && registro.status) || 503,
            error: (registro && registro.error) || {
              code: 'DEPENDENCIA_NO_DISPONIBLE',
              message: 'cola-revision (A8.1) no confirmo la resolucion: NO se declara desatascada'
            },
            detalle: res.data
          });
        }
        // Regla candidata: se PUBLICA (no actua hasta L10). El repo la hidrata.
        await this._publicarReglaCandidata(d, res.data);
      } else {
        this.eventBus?.publish('contabilidad.desatasco.resolver.failed', {
          ...res,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // Fire-and-forget: cola-revision (A8.1) encolo una excepcion.
  // Se PREPARA el desatasco (diagnostico + propuesta + regla candidata) sin
  // firmarlo: si el payload trae la decision de la silla, se aplica; si no, se
  // publica la PROPUESTA marcada como pendiente de silla (el sistema no decide solo).
  onExcepcionEncolada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return (async () => {
      const res = await this._resolver({
        project_id: d.project_id,
        cola: d.cola,
        excepcion: d.excepcion || d,
        decision: d.decision,
        rol: d.rol,
        correlation_id: d.correlation_id
      });
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.desatasco.resolver.failed', res);
        return res;
      }
      const aplicada = await this._registrarEnCola({ ...d, rol: d.rol }, res.data);
      if (aplicada && aplicada.status === 200) {
        this.eventBus?.publish('contabilidad.excepcion_desatascada', {
          ...res.data,
          en_cola: aplicada.data || null,
          correlation_id: d.correlation_id
        });
      } else {
        // No hay silla/decision: se publica la PROPUESTA, no una resolucion.
        this.eventBus?.publish('contabilidad.excepcion_desatascada', {
          ...res.data,
          decision_aplicada: false,
          en_cola: null,
          pendiente_de_silla: true,
          correlation_id: d.correlation_id
        });
      }
      await this._publicarReglaCandidata(d, res.data);
      return res;
    })();
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-desatasco-entrada-v1', desatascos: [], reglas: [] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // Repositorio por AMBITO de la excepcion: contable -> A6.2; bancario -> E8.
  _repositorioDe(excepcion) {
    const nat = String((excepcion && (excepcion.naturaleza || excepcion.ambito)) || '').toUpperCase();
    const vertical = String((excepcion && (excepcion.vertical || (excepcion.hecho && excepcion.hecho.vertical))) || '').toUpperCase();
    if (nat.includes('BANC') || nat.includes('EXTRACTO') || vertical === 'BANCO' || vertical === 'MOVIMIENTO_BANCARIO') {
      return REPOSITORIO_BANCARIO;
    }
    return REPOSITORIO_CONTRAPARTIDA;
  }

  // Lee las reglas que ACTUAN del repositorio (por EVENTO). null = no disponible.
  async _reglasActivas(pid, repositorio) {
    const evento = repositorio === REPOSITORIO_BANCARIO
      ? 'contabilidad.regla_movimiento.leer.request'
      : 'contabilidad.regla.leer.request';
    const resp = await this._rpc(evento, { project_id: pid }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) return null;
    const reglas = (resp.data && resp.data.reglas) || [];
    return reglas.filter((r) => {
      const e = String(r && r.estado).toUpperCase();
      return e === 'DECLARADA' || e === 'RATIFICADA';
    });
  }

  // Sonda de cobertura: ¿ya hay una regla que cubre esto? (evita proponer lo repetido).
  _hayReglaQueCubre(reglas, excepcion) {
    const hecho = (excepcion && (excepcion.hecho || excepcion)) || {};
    return reglas.some((r) => {
      const patron = (r && r.patron) || null;
      if (!patron || typeof patron !== 'object') return false;
      const claves = Object.keys(patron);
      return claves.length > 0 && claves.every((k) => hecho[k] === patron[k]);
    });
  }

  // resolver(excepcion, decision) -> Resolucion | REENColar | DescartarConMotivo — FUZZY.
  async _resolver(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const excepcion = (input && (input.excepcion || input)) || null;
    if (!excepcion || typeof excepcion !== 'object') return this._invalid('excepcion');

    const cola = String((input && (input.cola || excepcion.cola)) || '').toUpperCase() || 'ASESOR';
    if (!SILLAS[cola]) return this._invalid('cola');

    const motivo = excepcion.motivo || null;
    const ambiguedad = this._gradoAmbiguedad(excepcion, motivo);
    const repositorio = this._repositorioDe(excepcion);

    // La silla: sin `rol` NO se firma (el sistema no decide solo).
    const rol = String((input && input.rol) || '').toUpperCase() || null;
    const sillaOcupada = rol === SILLAS[cola];

    // Salida PROPUESTA (juicio). El humano puede traer la suya en `decision`.
    const decidida = String((input && input.decision) || '').toUpperCase();
    const salida = this._salidaValida(decidida) ? this._salidaCanonica(decidida) : this._clasificarSalida(excepcion, motivo, ambiguedad);

    if (salida === 'DESCARTAR_CON_MOTIVO') {
      const motivoTexto = String((input && input.motivo_descarte) || motivo || '');
      if (motivoTexto.trim().length < MOTIVO_MIN_CHARS) {
        return this._errorResponse(422, 'MOTIVO_REQUERIDO',
          'descartar una excepcion exige MOTIVO: no se descarta a ciegas', { cola, excepcion_id: excepcion.id || null });
      }
    }

    const resolucion = {
      project_id: pid,
      cola,
      excepcion_id: excepcion.id || null,
      naturaleza: excepcion.naturaleza || null,
      vertical: excepcion.vertical || (excepcion.hecho && excepcion.hecho.vertical) || null,
      repositorio,
      salida,
      motivo: motivo || (input && input.motivo_descarte) || null,
      ambiguedad,
      ambiguedad_alta: ambiguedad >= 0.5,
      silla: cola,
      rol_silla: rol,
      silla_ocupada: sillaOcupada,
      decision_de: decidida ? 'SILLA' : 'PROPUESTA_DEL_MICRO_AGENTE',
      decision_aplicada: false,        // lo pone _registrarEnCola tras el forward a A8.1
      firma_del_sistema: false,        // el sistema NO firma ni decide solo
      regla_candidata: null            // lo pone _producirRegla
    };

    // Regla candidata SOLO cuando la salida es RESOLVER (reencolar/descartar no aprenden).
    if (salida === 'RESOLVER') {
      const reglas = await this._reglasActivas(pid, repositorio);
      if (reglas === null) {
        // No se sabe si ya esta cubierto: se declara, no se asume.
        resolucion.repositorio_no_disponible = true;
        resolucion.nota = 'repositorio de reglas no disponible: la candidata se declara, no se asume cubierta';
      } else if (this._hayReglaQueCubre(reglas, excepcion)) {
        resolucion.ya_cubierto = true;
        resolucion.nota = 'una regla que actua ya cubre esta excepcion: no se propone regla nueva';
      } else {
        const reg = this._producirRegla(resolucion, input && input.evidencia);
        resolucion.regla_candidata = reg.status === 200 ? reg.data.regla : null;
      }
    }

    const d = this._obtenerOCrear(pid);
    d.desatascos.push({ resolucion, resuelto_en: new Date().toISOString() });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: resolucion };
  }

  // Salidas admitidas: se canonizan las variantes (REENColar <-> REENCOLAR).
  _salidaValida(v) { return SALIDAS.has(String(v || '').toUpperCase()); }
  _salidaCanonica(v) {
    const s = String(v || '').toUpperCase();
    if (s === 'REENCOLAR') return 'REENColar';
    if (s === 'DESCARTAR' || s === 'DESCARTE') return 'DESCARTAR_CON_MOTIVO';
    return SALIDAS.has(s) ? s : null;
  }

  // Clasificacion determinista de la salida a partir de la naturaleza y el motivo.
  _clasificarSalida(excepcion, motivo, ambiguedad) {
    const m = String(motivo || '').toUpperCase();
    if (m.includes('IRRECUPERABLE') || m.includes('NO_ES_HECHO') || m.includes('BASURA') || m.includes('SPAM')) {
      return 'DESCARTAR_CON_MOTIVO';
    }
    if (m.includes('ILEGIBLE') || m.includes('SIN_DATOS') || m.includes('FALTA') || ambiguedad >= 0.75) {
      return 'REENColar';    // vuelve a la cola: hoy no hay base para resolverlo
    }
    return 'RESOLVER';
  }

  // Grado de ambiguedad [0..1] de la excepcion. Determinista.
  _gradoAmbiguedad(excepcion, motivo) {
    const e = excepcion || {};
    const señales = [
      !!e.hecho,
      !!e.naturaleza,
      !!motivo,
      !!(e.hecho && (e.hecho.tercero || e.hecho.documento_origen)),
      !!(e.hecho && Array.isArray(e.hecho.lineas) && e.hecho.lineas.length > 0),
      !!e.id
    ];
    const presentes = señales.filter(Boolean).length;
    return this._round(1 - presentes / señales.length, 2);
  }

  // producirRegla(resolucion, evidencia) -> ReglaDeclarada candidata (aprendizaje HIDRATADO).
  // NO actua: nace CANDIDATA y espera la ratificacion del asesor (L10).
  _producirRegla(resolucion, evidencia) {
    const r = resolucion || {};
    const hecho = (r.hecho || r.excepcion_hecho) || null;
    const vertical = r.vertical || (hecho && hecho.vertical) || null;
    if (!vertical && !(hecho && hecho.documento_origen)) {
      return this._errorResponse(422, 'PRECONDITION_FAILED',
        'sin vertical ni documento no hay patron que aprender: no se inventa la regla', {
          repositorio: r.repositorio || null
        });
    }

    const regla = {
      regla_id: `${r.project_id}-P3-${r.excepcion_id || Date.now()}`,
      repositorio: r.repositorio || REPOSITORIO_CONTRAPARTIDA,
      ambito: vertical,
      patron: {
        vertical,
        documento_origen: (hecho && hecho.documento_origen) || null
      },
      contrapartida: {
        cuenta: (r.contrapartida && r.contrapartida.cuenta) || (r.cuenta || null),
        tercero: (hecho && hecho.tercero) || null,
        periodo: (r.periodo || null)
      },
      estado: 'RATIFICACION_PENDIENTE',   // NO actua hasta L10
      actua: false,
      aportada_por: 'DESATASCO_ENTRADA',
      evidencia: evidencia || { excepcion_id: r.excepcion_id, salida: r.salida, motivo: r.motivo },
      firma_del_sistema: false
    };
    return { status: 200, data: { project_id: r.project_id, repositorio: regla.repositorio, regla } };
  }

  // Publica la regla candidata (no actua hasta L10) y la guarda en la memoria.
  async _publicarReglaCandidata(d, resolucion) {
    const regla = (resolucion && resolucion.regla_candidata) || null;
    if (!regla) return null;
    const pid = (d && d.project_id) || resolucion.project_id;
    const store = this._obtenerOCrear(pid);
    store.reglas.push({ regla, producida_en: new Date().toISOString() });
    store.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    // Contrato tolerante del repositorio: si no esta disponible, SE DECLARA.
    const payload = {
      project_id: pid,
      repositorio: regla.repositorio,
      regla,
      actua: false,
      requiere_ratificacion: true,
      repositorio_disponible: !resolucion.repositorio_no_disponible,
      origen: 'P3_DESATASCO',
      correlation_id: d && d.correlation_id
    };
    if (resolucion && resolucion.repositorio_no_disponible) {
      this.eventBus?.publish('contabilidad.regla_aprendida.failed', {
        status: 503,
        error: {
          code: 'DEPENDENCIA_NO_DISPONIBLE',
          message: `${regla.repositorio} no respondio: la candidata se declara, NO se hidrata a ciegas`,
          details: { repositorio: regla.repositorio, regla_id: regla.regla_id }
        },
        regla
      });
    }
    this.eventBus?.publish('contabilidad.regla_aprendida', payload);
    return payload;
  }

  // Forward a A8.1 con el rol de la SILLA (guard de escritor por cola).
  async _registrarEnCola(d, resolucion) {
    const pid = (d && d.project_id) || (resolucion && resolucion.project_id);
    if (!pid) return this._invalid('project_id');
    const rol = String((d && d.rol) || (resolucion && resolucion.rol_silla) || '').toUpperCase();
    if (!rol) {
      return this._errorResponse(400, 'ROL_NO_DECLARADO',
        'sin el rol de la silla NO se resuelve: el sistema no firma solo', {
          cola: resolucion && resolucion.cola, excepcion_id: resolucion && resolucion.excepcion_id
        });
    }
    const resp = await this._rpc('contabilidad.excepcion.resolver.request', {
      project_id: pid,
      cola: (resolucion && resolucion.cola) || (d && d.cola),
      rol,
      excepcion_id: (resolucion && resolucion.excepcion_id) || (d && d.excepcion_id),
      resolucion: {
        salida: resolucion && resolucion.salida,
        motivo: (resolucion && resolucion.motivo) || null,
        origen: 'P3_DESATASCO',
        ambiguedad: resolucion && resolucion.ambiguedad,
        decidido_por: (resolucion && resolucion.decision_de) || 'PROPUESTA_DEL_MICRO_AGENTE'
      }
    }, { timeout_ms: 4000 });
    if (!resp || resp.status !== 200) {
      return resp || this._errorResponse(503, 'DEPENDENCIA_NO_DISPONIBLE',
        'cola-revision (A8.1) no respondio: la excepcion NO se declara resuelta', {
          dependencia: 'cola-revision', cola: resolucion && resolucion.cola
        });
    }
    if (resolucion) {
      resolucion.decision_aplicada = true;
      resolucion.en_cola = resp.data || null;
    }
    return resp;
  }

  // ── Tools ──
  toolResolver(params) { return this._resolver(params); }
  toolProducirRegla(params) { return this._producirRegla(params.resolucion || params, params.evidencia); }
  toolGradoAmbiguedad(params) { return this._gradoAmbiguedad(params.excepcion || params, params.motivo); }
}

module.exports = DesatascoEntrada;
