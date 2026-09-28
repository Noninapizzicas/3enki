/**
 * contabilidad/presupuesto — CUSTODIO (J3 + J4 + J9, hoja del plan).
 *
 * DONDE EL JEFE FIJA LOS OBJETIVOS. Tres clases en una parcela:
 *   J3 Presupuesto          la cifra OBJETIVO por dimension, DECLARADA (no inferida).
 *   J4 Desviacion           real vs presupuesto, con el UMBRAL DECLARADO; dispara
 *                           señal a K2 si se sale.
 *   J9 ComparadorPeriodos   ejercicio vs ejercicio, mes vs mes, real vs presupuesto
 *                           — REUTILIZA ambos, NO los duplica.
 *
 * LA CIFRA OBJETIVO ES UNA DECLARACION, NO UNA INFERENCIA: el presupuesto no se
 * "estima" a partir de la historia. El JEFE lo declara. GUARD de un solo escritor
 * (M2): solo JEFE declara la cifra objetivo; cualquier otro rol se rechaza con
 * ERROR_DOS_ESCRITORES. Un rol distinto puede LEER (objetivo/comparar), nunca
 * escribir.
 *
 * EL UMBRAL DE DESVIACION ES DECLARABLE: sin umbral declarado la desviacion se
 * CALCULA igual (es real vs objetivo) pero NO se dispara aviso — se declara
 * UMBRAL_NO_DECLARADO. Jamas se asume un umbral.
 *
 * CUSTODIO (patron real): store en memoria (presupuestos por dimension/periodo +
 * secuencia append-only); PosPersistencia (storage
 * /contabilidad/presupuesto/*.json); restaura en project.activated; flush en
 * onUnload.
 *
 * La desviacion se DISPARA a motor-avisos (K2) por EVENTO
 * `contabilidad.aviso.solicitar.request` (tipo AVISO_SANGRIA, familia ANALITICA),
 * NUNCA por require cruzado; si K2 no responde se publica el fallo y NUNCA se
 * fabrica el aviso.
 *
 * Emisor/par de fallo: exito publica contabilidad.presupuesto_declarado ·
 * contabilidad.desviacion_calculada · contabilidad.comparacion_calculada; error su
 * par determinista. NO REUTILIZA: `marketing-budget` es presupuesto de marketing y
 * declara "custodia contable" solo de nombre: contabilidad lo LEE, no lo absorbe
 * (solape registrado).
 *
 * Ver hojas J3/J4/J9 del diseno-oop y bloque `presupuesto` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Un solo escritor de la parcela del presupuesto (J3): el JEFE.
const ROL_ESCRITOR_PRESUPUESTO = 'JEFE';

// Codigos simbolicos deterministas.
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';
const CODE_UMBRAL_NO_DECLARADO = 'UMBRAL_NO_DECLARADO';
const CODE_DEPENDENCIA_NO_DISPONIBLE = 'DEPENDENCIA_NO_DISPONIBLE';

// Tipos de comparacion declarables (J9).
const TIPOS_COMPARACION = ['EJERCICIO_VS_EJERCICIO', 'MES_VS_MES', 'REAL_VS_PRESUPUESTO'];

class Presupuesto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'presupuesto';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, presupuestos:{}, secuencia:[] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'presupuesto.json',
      dir: '/contabilidad/presupuesto',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.presupuestos) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los objetivos del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contabilidad.presupuesto.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.presupuesto_declarado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.presupuesto.declarar.failed', res);
      }
      return res;
    });
  }

  onDesviacionRequest(e) {
    return this._atender(e, 'desviacion', 'contabilidad.desviacion.calcular.response', async (d) => {
      const res = await this._desviacionConAviso(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.desviacion_calculada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.desviacion.calcular.failed', res);
      }
      return res;
    });
  }

  onCompararRequest(e) {
    return this._atender(e, 'comparar', 'contabilidad.periodos.comparar.response', async (d) => {
      const res = await this._comparar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.comparacion_calculada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.periodos.comparar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-presupuesto-v1', presupuestos: {}, secuencia: [], escritor: ROL_ESCRITOR_PRESUPUESTO };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (J3): solo el JEFE declara la cifra objetivo.
  _verificarEscritorUnico(rol) {
    const r = String(rol || '').toUpperCase();
    if (r !== ROL_ESCRITOR_PRESUPUESTO) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'la cifra objetivo tiene UN escritor: solo el JEFE declara el presupuesto', {
          escritor_vigente: ROL_ESCRITOR_PRESUPUESTO,
          rol_intentado: r || null,
          simbolico: CODE_DOS_ESCRITORES,
          nota: 'un rol distinto puede LEER (objetivo/comparar), nunca fijar el objetivo'
        });
    }
    return null;
  }

  // declarar(rol, dimension, cifra) -> ok (J3). DECLARACION, no inferencia.
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const dimension = this._dimensionDe(input);
    if (!dimension) return this._invalid('dimension');

    const cifra = this._num(input && (input.cifra !== undefined ? input.cifra : input.importe));
    if (cifra === null) return this._invalid('cifra');

    const periodo = (input && input.periodo) || null;
    const concepto = (input && input.concepto) || null;
    const clave = this._clave(pid, dimension, periodo, concepto);

    const entrada = {
      clave,
      dimension,
      periodo,
      concepto,
      cifra: this._round(cifra, 2),
      umbral: this._num(input && (input.umbral !== undefined ? input.umbral : input.umbral_desviacion)),
      moneda: (input && input.moneda) || null,
      declarado_por: ROL_ESCRITOR_PRESUPUESTO,
      declarado_en: new Date().toISOString(),
      // DECLARADA, no inferida: el objetivo no se estima de la historia.
      inferida: false,
      ley_cableada: false,
      borrable: false
    };

    const d = this._obtenerOCrear(pid);
    const creado = !d.presupuestos[clave];
    // La declaracion se SUMA al historial (nunca se borra): fijar de nuevo = re-declarar.
    d.presupuestos[clave] = entrada;
    d.secuencia.push({ clave, dimension, periodo, cifra: entrada.cifra, declarado_en: entrada.declarado_en });
    d.updated_at = entrada.declarado_en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        presupuesto: entrada,
        clave,
        creado,
        redeclarado: !creado,
        declaracion_no_inferencia: true,
        escritor: ROL_ESCRITOR_PRESUPUESTO
      }
    };
  }

  // objetivo(dimension, periodo) -> CifraObjetivo (J3). Lectura: cualquier rol.
  _objetivo(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const dimension = this._dimensionDe(input);
    if (!dimension) return this._invalid('dimension');

    const d = this._obtenerOCrear(pid);
    const periodo = (input && input.periodo) || null;
    const concepto = (input && input.concepto) || null;
    const clave = this._clave(pid, dimension, periodo, concepto);
    const hallado = d.presupuestos[clave] || null;
    if (!hallado) {
      // Lo no declarado queda ABIERTO: no se asume objetivo.
      return {
        status: 200,
        data: {
          project_id: pid, dimension, periodo, clave,
          hallado: false, estado: 'ABIERTO', objetivo: null,
          nota: 'el objetivo no declarado queda ABIERTO: no se asume'
        }
      };
    }
    return { status: 200, data: { project_id: pid, dimension, periodo, clave, hallado: true, estado: 'DECLARADO', objetivo: hallado } };
  }

  // calcular(real, presupuesto) -> Desviacion (J4). Determinista.
  // El UMBRAL es DECLARABLE: sin umbral la desviacion se calcula igual, pero no dispara.
  _calcular(input) {
    const real = this._num(input && (input.real !== undefined ? input.real : (input.real && input.real.total)));
    const objetivo = this._num(
      input && (input.presupuesto !== undefined
        ? (typeof input.presupuesto === 'object' ? input.presupuesto.cifra : input.presupuesto)
        : input.objetivo));
    if (real === null) return this._invalid('real');
    if (objetivo === null) return this._invalid('presupuesto');

    const umbral = this._num(input && (input.umbral !== undefined ? input.umbral : input.umbral_desviacion));
    const desviacion = this._round(real - objetivo, 2);
    const desviacion_pct = objetivo !== 0 ? this._round((real - objetivo) / Math.abs(objetivo), 4) : null;
    const abs = Math.abs(desviacion);
    const absPct = desviacion_pct !== null ? Math.abs(desviacion_pct) : null;

    // El umbral puede declararse en importe o en proporcion.
    const umbralPct = this._num(input && (input.umbral_pct !== undefined ? input.umbral_pct : input.umbral_proporcion));
    const declarado = umbral !== null || umbralPct !== null;
    const excede = declarado && (
      (umbral !== null && abs > umbral) ||
      (umbralPct !== null && absPct !== null && absPct > umbralPct)
    );

    return {
      status: 200,
      data: {
        project_id: (input && input.project_id) || null,
        periodo: (input && input.periodo) || null,
        dimension: this._dimensionDe(input),
        real: this._round(real, 2),
        objetivo: this._round(objetivo, 2),
        desviacion,
        desviacion_pct,
        signo: desviacion > 0 ? 'POR_ENCIMA' : (desviacion < 0 ? 'POR_DEBAJO' : 'EN_OBJETIVO'),
        umbral: umbral,
        umbral_pct: umbralPct,
        umbral_declarado: declarado,
        excede,
        senal: declarado ? (excede ? 'EXCEDE_UMBRAL' : 'DENTRO_DE_UMBRAL') : CODE_UMBRAL_NO_DECLARADO,
        determinista: true,
        nota: declarado ? 'real vs objetivo con el umbral declarado' : 'sin umbral declarado: la desviacion se calcula, el aviso NO se dispara'
      }
    };
  }

  // dispararSiExcede(desviacion) -> senal a K2 (J4). Umbral declarado o nada.
  _dispararSiExcede(desviacion) {
    const dev = desviacion || {};
    if (!dev.excede) {
      return { disparar: false, motivo: dev.umbral_declarado ? 'DENTRO_DE_UMBRAL' : CODE_UMBRAL_NO_DECLARADO, umbral_declarado: !!dev.umbral_declarado };
    }
    return {
      disparar: true,
      tipo: 'AVISO_SANGRIA',
      familia: 'ANALITICA',
      destinatario: 'DUENO',
      prioridad: 'ALTA',
      motivo: 'la desviacion supera el umbral declarado',
      umbral_declarado: true
    };
  }

  // comparar(a, b) -> Delta (J9). REUTILIZA objetivo (J3) y desviacion (J4).
  async _comparar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const tipo = String((input && (input.tipo || input.tipo_comparacion)) || 'REAL_VS_PRESUPUESTO').toUpperCase();
    if (!TIPOS_COMPARACION.includes(tipo)) {
      return this._errorResponse(422, 'TIPO_COMPARACION_NO_VALIDO',
        `tipo de comparacion ${tipo} fuera del catalogo declarable`, { tipos_posibles: TIPOS_COMPARACION });
    }

    // Los dos lados: en payload o REUTILIZANDO las proyecciones de la propia parcela.
    const a = this._num(input && (input.a !== undefined ? input.a : (input.periodo_a && input.valor_a)));
    const b = this._num(input && (input.b !== undefined ? input.b : (input.periodo_b && input.valor_b)));

    let real = a;
    let objetivo = b;
    let fuente = 'PAYLOAD';

    if (tipo === 'REAL_VS_PRESUPUESTO' && (real === null || objetivo === null)) {
      // REUTILIZA J3: el objetivo declarado de la dimension/periodo (no lo duplica).
      const obj = this._objetivo({
        project_id: pid,
        dimension: this._dimensionDe(input),
        periodo: (input && (input.periodo || input.periodo_b)) || null
      });
      if (obj.status === 200 && obj.data.hallado) {
        objetivo = this._num(obj.data.objetivo.cifra);
        fuente = 'J3_objetivo_declarado';
      }
      if (real === null) {
        real = this._num(input && (input.real !== undefined ? input.real : input.valor_real));
      }
    }

    if (real === null || objetivo === null) {
      // Sin los dos lados no hay delta: se DECLARA, no se inventa.
      return this._errorResponse(422, 'COMPARACION_INCOMPLETA',
        'faltan los dos lados de la comparacion (real/objetivo o a/b): no se inventa el delta', {
          tipo, faltan: { real: real === null, objetivo: objetivo === null },
          reutiliza: 'objetivo (J3) y desviacion (J4)'
        });
    }

    // REUTILIZA J4 para el delta real-vs-objetivo: no lo reimplementa.
    const dev = this._calcular({
      project_id: pid, real, presupuesto: objetivo, umbral: input && input.umbral, umbral_pct: input && input.umbral_pct,
      periodo: input && input.periodo, dimension: this._dimensionDe(input)
    });
    if (dev.status !== 200) return dev;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo,
        a: this._round(real, 2),
        b: this._round(objetivo, 2),
        delta: this._round(real - objetivo, 2),
        delta_pct: objetivo !== 0 ? this._round((real - objetivo) / Math.abs(objetivo), 4) : null,
        desviacion: dev.data,
        fuente_objetivo: fuente,
        reutiliza_j3_j4: true,
        no_duplica: true,
        determinista: true
      }
    };
  }

  // desviacion + disparo de la señal a K2 por EVENTO (sin require cruzado).
  async _desviacionConAviso(input) {
    let real = this._num(input && (input.real !== undefined ? input.real : input.valor_real));
    let objetivo = this._num(
      input && (input.presupuesto !== undefined
        ? (typeof input.presupuesto === 'object' ? input.presupuesto.cifra : input.presupuesto)
        : input.objetivo));

    if (real === null || objetivo === null) {
      // REUTILIZA J3: objetivo declarado; y el real por derivacion del resultado (C2).
      const obj = this._objetivo({
        project_id: input && input.project_id, dimension: this._dimensionDe(input), periodo: input && input.periodo
      });
      if (objetivo === null && obj.status === 200 && obj.data.hallado) objetivo = this._num(obj.data.objetivo.cifra);
      if (real === null) {
        const resp = await this._rpc('contabilidad.estado.resultado.request',
          { project_id: input && input.project_id, periodo: input && input.periodo }, { timeout_ms: 4000 });
        if (resp && resp.status === 200 && resp.data && resp.data.resultado) {
          real = this._num(resp.data.resultado.resultado);
        }
      }
    }

    const res = this._calcular({ ...input, real, presupuesto: objetivo });
    if (res.status !== 200) return res;

    // J4: si excede el umbral DECLARADO, se dispara la señal a K2 por EVENTO.
    const senal = this._dispararSiExcede(res.data);
    if (senal.disparar) {
      const aviso = await this._rpc('contabilidad.aviso.solicitar.request', {
        project_id: res.data.project_id,
        origen: 'J4_DESVIACION',
        tipo: senal.tipo,
        motivo: senal.motivo,
        destinatario: senal.destinatario,
        cola_destino: senal.destinatario,
        prioridad: senal.prioridad,
        contexto: {
          dimension: res.data.dimension, periodo: res.data.periodo,
          real: res.data.real, objetivo: res.data.objetivo,
          desviacion: res.data.desviacion, umbral: res.data.umbral
        },
        correlation_id: input && input.correlation_id
      }, { timeout_ms: 4000 });

      if (!aviso || aviso.status !== 200) {
        this.eventBus?.publish('contabilidad.aviso.solicitar.failed', {
          status: (aviso && aviso.status) || 503,
          error: { code: CODE_DEPENDENCIA_NO_DISPONIBLE, message: 'motor-avisos (K2) no respondio: la desviacion excede el umbral pero el aviso NO se fabrica', details: { dependencia: 'motor-avisos' } },
          correlation_id: input && input.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.aviso.enrutar.request', {
          ...(aviso.data || {}),
          origen_desviacion: 'J4',
          correlation_id: input && input.correlation_id
        });
      }
    }

    return { ...res, data: { ...res.data, senal_k2: senal } };
  }

  // ── helpers internos ──
  _clave(pid, dimension, periodo, concepto) {
    return `${pid}:${dimension}:${periodo || '*'}:${concepto || '*'}`;
  }

  _dimensionDe(input) {
    const d = input && (input.dimension || input.centro || input.id_dimension);
    if (d && typeof d === 'object') return d.id || d.nombre || d.centro || d.linea || null;
    return d ? String(d) : null;
  }

  _num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolObjetivo(params) { return this._objetivo(params); }
  toolCalcularDesviacion(params) { return this._calcular(params); }
  toolComparar(params) { return this._comparar(params); }
}

module.exports = Presupuesto;
