/**
 * nichos/pipeline — REFLEJO JS (CUSTODIO del vertical NICHOS).
 *
 * State machine del ciclo de vida del nicho (19 estados, transiciones legales).
 * Guarda el estado actual de cada nicho, valida la legalidad de las transiciones
 * y emite pulsos de transicion. Registra cada transicion en el historial via
 * nichos.historial.registrar.request.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/pipeline.json
 *   {
 *     _version, _updated,
 *     pipeline: {
 *       version:       Int,
 *       estados:       { <id_nicho>: { estado, desde, causa, autor, at } },
 *       total_nichos:  Int
 *     }
 *   }
 *
 * 19 estados del ciclo de vida:
 *   semilla → normalizada → sondeada → encolada → validando →
 *   viabilidad_emitida → camino_decidido → construyendo →
 *   gate_operacion → operando → distribuyendo → activo →
 *   sangria_alertada → cortado_pre_construccion → fallido →
 *   pausado → archivado → caja
 *
 * Solo las transiciones declaradas en TRANSICIONES_LEGALES son validas;
 * cualquier otra devuelve TRANSICION_ILEGAL.
 *
 * Patron: ModuloHibridoReflejo + PosPersistencia. REFLEJO puro con state machine.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

// ── STATE MACHINE: 19 estados + transiciones legales ──
const ESTADO_INICIAL = 'semilla';

const TRANSICIONES_LEGALES = {
  semilla:                  ['normalizada', 'fallido', 'archivado'],
  normalizada:              ['sondeada', 'fallido', 'archivado'],
  sondeada:                 ['encolada', 'fallido', 'archivado'],
  encolada:                 ['validando', 'fallido', 'archivado'],
  validando:                ['viabilidad_emitida', 'fallido', 'archivado'],
  viabilidad_emitida:       ['camino_decidido', 'fallido', 'archivado'],
  camino_decidido:          ['construyendo', 'cortado_pre_construccion', 'fallido', 'archivado'],
  construyendo:             ['gate_operacion', 'cortado_pre_construccion', 'fallido', 'pausado'],
  gate_operacion:           ['operando', 'fallido', 'pausado', 'archivado'],
  operando:                 ['distribuyendo', 'fallido', 'pausado', 'archivado'],
  distribuyendo:            ['activo', 'fallido', 'pausado', 'archivado'],
  activo:                   ['sangria_alertada', 'pausado', 'archivado', 'caja'],
  sangria_alertada:         ['activo', 'pausado', 'archivado', 'caja'],
  cortado_pre_construccion: ['archivado'],
  fallido:                  ['semilla', 'archivado'],
  pausado:                  ['operando', 'distribuyendo', 'activo', 'archivado'],
  archivado:                ['semilla'],
  caja:                     []
};

const ESTADOS_VALIDOS = Object.keys(TRANSICIONES_LEGALES);

function esqueletoVacio() {
  return {
    version: 0,
    estados: {},
    total_nichos: 0
  };
}

class Pipeline extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'pipeline';
    this.version = '0.1.0';
    this.pipelinePorProyecto = new Map();   // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'pipeline.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ pipeline: this.pipelinePorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.pipeline && typeof data.pipeline === 'object') {
          this.pipelinePorProyecto.set(pid, data.pipeline);
        }
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── RPC HANDLERS ──
  onTransitarRequest(e) {
    return this._atender(e, 'transitar', 'nichos.pipeline.transitar.response', d => this._transitar(d));
  }

  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'nichos.pipeline.estado.response', d => this._estado(d));
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto vacio si no hay fichero.
  // =============================================================
  _store(project_id) {
    let s = this.pipelinePorProyecto.get(project_id);
    if (!s) {
      s = esqueletoVacio();
      this.pipelinePorProyecto.set(project_id, s);
    }
    return s;
  }

  // =============================================================
  // PROYECCIONES — logica pura + state machine
  // =============================================================
  _transitar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');
    if (!input.transicion) return this._invalid('transicion');

    const store = this._store(input.project_id);
    const idNicho = input.id;
    const transicionDestino = input.transicion;

    // Validar que el estado destino es un estado valido.
    if (!ESTADOS_VALIDOS.includes(transicionDestino)) {
      return this._errorResponse(
        400,
        'ESTADO_DESCONOCIDO',
        `estado destino '${transicionDestino}' no existe en el pipeline`,
        { transicion: transicionDestino, estados_validos: ESTADOS_VALIDOS }
      );
    }

    // Estado actual: si el nicho no existe, nace en ESTADO_INICIAL.
    const registro = store.estados[idNicho];
    const estadoActual = registro ? registro.estado : ESTADO_INICIAL;

    // Guard: transicion legal.
    const destinosLegales = TRANSICIONES_LEGALES[estadoActual] || [];
    if (!destinosLegales.includes(transicionDestino)) {
      this.eventBus?.publish('nichos.pipeline.transicion.ilegal', {
        project_id: input.project_id,
        id: idNicho,
        desde: estadoActual,
        hasta: transicionDestino,
        razon_codigo: 'TRANSICION_ILEGAL',
        timestamp: nowISO()
      });

      return this._errorResponse(
        409,
        'TRANSICION_ILEGAL',
        `transicion '${estadoActual}' → '${transicionDestino}' no esta permitida`,
        {
          id: idNicho,
          desde: estadoActual,
          hasta: transicionDestino,
          destinos_legales: destinosLegales
        }
      );
    }

    // Aplicar la transicion.
    const desde = estadoActual;
    const causa = input.causa || null;
    const autor = input.autor || null;
    const ahora = nowISO();

    store.estados[idNicho] = {
      estado: transicionDestino,
      desde,
      causa,
      autor,
      at: ahora
    };

    // Si es un nicho nuevo, incrementar el contador.
    if (!registro) {
      store.total_nichos += 1;
    }

    store.version += 1;
    this._persist.marcarDirty(input.project_id);

    // Pulso: transicion aplicada.
    this.eventBus?.publish('nichos.pipeline.transicion.aplicada', {
      project_id: input.project_id,
      id: idNicho,
      desde,
      hasta: transicionDestino,
      causa,
      autor,
      timestamp: ahora
    });

    // Registrar en el historial (fire-and-forget al historial append-only).
    this.eventBus?.publish('nichos.historial.registrar.request', {
      project_id: input.project_id,
      id: idNicho,
      evento: {
        tipo: 'transicion',
        desde,
        hasta: transicionDestino,
        causa,
        autor
      }
    });

    return {
      status: 200,
      data: {
        estado_nuevo: {
          id: idNicho,
          estado: transicionDestino,
          desde,
          causa,
          autor,
          at: ahora
        }
      }
    };
  }

  _estado(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');

    const store = this._store(input.project_id);
    const idNicho = input.id;
    const registro = store.estados[idNicho];

    if (!registro) {
      return {
        status: 200,
        data: {
          estado_actual: {
            id: idNicho,
            estado: ESTADO_INICIAL,
            desde: null,
            causa: null,
            autor: null,
            at: null,
            es_nuevo: true
          }
        }
      };
    }

    return {
      status: 200,
      data: {
        estado_actual: {
          id: idNicho,
          estado: registro.estado,
          desde: registro.desde,
          causa: registro.causa,
          autor: registro.autor,
          at: registro.at
        }
      }
    };
  }
}

// Exportar tambien las constantes para tests.
Pipeline.TRANSICIONES_LEGALES = TRANSICIONES_LEGALES;
Pipeline.ESTADOS_VALIDOS = ESTADOS_VALIDOS;
Pipeline.ESTADO_INICIAL = ESTADO_INICIAL;

module.exports = Pipeline;
