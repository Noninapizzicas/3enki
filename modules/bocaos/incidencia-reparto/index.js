'use strict';

/**
 * incidencia-reparto · PUENTE · PLAZA — F06 (IncidenciaReparto).
 *
 * ABRE EL CASO CUANDO ALGO NO SALIÓ: relato, autor, hora y traza. Y nada más.
 *
 * Tres reglas que son el módulo:
 *
 *   1. NO JUZGA. No adjudica, no puntúa, no decide si es grave: pone el caso con su autor y su hora,
 *      y `clasificar es leer (F07)`. Por eso el hecho sale SIN tipo, SIN gravedad y con
 *      `clasificado: false` — un campo que no se rellena es un hueco, y un hueco inventado es una
 *      versión de los hechos.
 *   2. NO CREA DEUDA. La deuda la crea G04 con evidencia; una incidencia es una queja, no un cargo.
 *      El hecho lo dice: `crea_deuda: false`.
 *   3. CUALQUIERA DE LAS DOS PARTES PUEDE ABRIRLA. El relato es LIBRE: no hay campos obligatorios que
 *      fuercen una versión de lo ocurrido. Lo único que no se puede es abrir un caso sin autor — un
 *      caso anónimo no se puede contestar.
 *
 * La TRAZA es lo que sostiene el caso: el acta del reparto en el momento de abrirlo (se le PIDE a su
 * custodio, `hechos-reparto.acta`) y los hechos del reparto que este puente ha oído. Si la entrega
 * llega después de abrir el caso, la traza crece — el caso no se reabre, se completa.
 *
 * Sin store: el caso es un hecho del bus y su dueño es la cola de la sala (P01). Lo que se guarda
 * aquí es sólo lo que aún no ha pasado a hecho.
 *
 * Isla: cero require a otra isla.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const TIMEOUT_BUS_MS = 2000;
const MAX_HECHOS = 30;
const MAX_CASOS = 500;

class IncidenciaReparto extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'incidencia-reparto';
    this.version = 'puente-0.1.0';
    this._path = null;              // sin store: el caso se publica y su dueño es la cola
    this.tiempo_bus_ms = TIMEOUT_BUS_MS;
    this._hechos = new Map();       // pedido_id → hechos del reparto oídos (para la traza)
    this._casos = new Map();        // incidencia_id → caso abierto (para que la traza crezca)
  }

  // ================= RPC del bus =================
  onAbrirRequest(e) { return this.servir(e, 'abrir', 'incidencia-reparto.abrir', (d) => this._abrir(d)); }

  // ================= hechos que escucha =================
  // La traza del caso se alimenta de los hechos del reparto. No se abre un caso por un hecho: eso
  // sería que el sistema decidiera que algo «no salió».
  async onHechoRepartoAnotado(e) {
    const d = this.datos(e);
    if (!d.pedido_id) return null;
    const hecho = {
      tipo: d.tipo || null,
      hora: this._iso(d.hora) || null,
      autor: d.autor || null,
      nota: d.nota || null,
      anotado_en: this._iso(d.anotado_en) || this.ahora()
    };
    const previos = this._hechos.get(d.pedido_id) || [];
    previos.push(hecho);
    this._hechos.set(d.pedido_id, previos.slice(-MAX_HECHOS));
    if (this._hechos.size > MAX_CASOS) this._hechos.delete(this._hechos.keys().next().value);

    // Si el caso ya está abierto, la traza crece: no se abre otro caso ni se reescribe el anterior.
    for (const caso of this._casos.values()) {
      if (caso.pedido_id === d.pedido_id && !caso.traza.hechos.some((h) => h.hora === hecho.hora && h.tipo === hecho.tipo)) {
        caso.traza.hechos.push(hecho);
      }
    }
    return null;
  }

  // ================= F06 · abrir (ORDEN) =================
  async _abrir(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');

    const relato = typeof d.relato === 'string' ? d.relato.trim() : '';
    if (!relato) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'relato requerido: sin relato no hay caso (no se redacta uno por nadie)', { field: 'relato' });
    }
    const autor = this._autor(d.autor);
    if (!autor) {
      // «Relato sin autor → 400»: un caso anónimo no se puede contestar.
      return this._errorResponse(400, 'INVALID_INPUT',
        'autor requerido: cualquiera de las dos partes abre el caso, pero con nombre', { field: 'autor' });
    }

    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    const incidencia_id = d.incidencia_id || `inc-${crypto.randomUUID().slice(0, 8)}`;

    // Idempotente: la misma incidencia no se abre dos veces; se devuelve con la traza de ahora.
    const ya = this._casos.get(incidencia_id);
    if (ya) {
      return { status: 200, data: { incidencia: this._conTraza(ya), idempotente: true } };
    }

    const caso = {
      incidencia_id,
      pedido_id: d.pedido_id,
      plaza_id,
      contrato_id: d.contrato_id || null,
      relato,
      autor,
      hora: this._iso(d.hora) || this.ahora(),
      abierta_en: this.ahora(),
      // F06 · no clasifica: eso es leer (F07), y no es cosa de quien abre el caso.
      tipo: null,
      gravedad: null,
      clasificado: false,
      sin_clasificar: 'clasificar es leer (F07): este puente no decide si es grave',
      // F06 · la incidencia NO crea deuda: la crea G04 con evidencia.
      crea_deuda: false,
      traza: await this._traza(d, plaza_id)
    };

    this._casos.set(incidencia_id, caso);
    if (this._casos.size > MAX_CASOS) this._casos.delete(this._casos.keys().next().value);

    this.hecho('bocaos.incidencia_abierta', this._conTraza(caso));

    return { status: 201, data: { incidencia: this._conTraza(caso) } };
  }

  // ================= la traza =================
  async _traza(d, plaza_id) {
    const traza = {
      pedido_id: d.pedido_id,
      contrato_id: d.contrato_id || null,
      acta: null,
      hechos: [...(this._hechos.get(d.pedido_id) || [])],
      huecos: []
    };

    // El acta es del custodio del reparto: se PIDE. Si no hay reparto abierto, se dice.
    try {
      const r = await this._rpc('hechos-reparto.acta.request', {
        project_id: plaza_id, plaza_id, pedido_id: d.pedido_id
      }, { timeout_ms: this.tiempo_bus_ms });
      if (r && r.status === 200 && r.data) {
        traza.acta = r.data.completa ? { completa: true, relojes: r.data.acta ? r.data.acta.relojes : null } : {
          completa: false,
          faltan: r.data.faltan || []
        };
        if (!r.data.completa) traza.huecos.push('acta incompleta: no se puede adjudicar todavía');
      } else {
        traza.huecos.push('sin reparto abierto para ese pedido');
      }
    } catch (_) {
      traza.huecos.push('el custodio del reparto no contestó');
    }

    if (traza.hechos.length === 0) traza.huecos.push('sin hechos del reparto oídos');
    return traza;
  }

  _conTraza(caso) {
    return {
      incidencia_id: caso.incidencia_id,
      pedido_id: caso.pedido_id,
      plaza_id: caso.plaza_id,
      contrato_id: caso.contrato_id,
      relato: caso.relato,
      autor: caso.autor,
      hora: caso.hora,
      abierta_en: caso.abierta_en,
      tipo: null,
      gravedad: null,
      clasificado: false,
      sin_clasificar: caso.sin_clasificar,
      crea_deuda: false,
      traza: { ...caso.traza, hechos: [...caso.traza.hechos] }
    };
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') {
      return a.id || a.parte_id || a.rider_id || a.tienda_id || a.nombre || null;
    }
    return null;
  }
}

module.exports = IncidenciaReparto;
module.exports.MAX_HECHOS = MAX_HECHOS;
