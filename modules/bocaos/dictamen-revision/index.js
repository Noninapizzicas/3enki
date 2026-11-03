'use strict';

/**
 * dictamen-revision · CUSTODIO · PLAZA — O04 (DictamenRevisión).
 *
 * LA REVISIÓN HUMANA DE UNA DECISIÓN AUTOMÁTICA: el humano FIRMA, y su firma queda con hora, con
 * motivo y con el efecto que aplica. Es la única mano humana sobre el mercado.
 *
 *   1. TRES EFECTOS, CERRADOS: compensar a una parte · corregir un histórico mal medido · cambiar
 *      la regla HACIA ADELANTE. Cualquier otro no se puede escribir: se contesta EFECTO_PROHIBIDO.
 *   2. EL EFECTO PROHIBIDO ES REHACER LA PROPUESTA. Si el dictamen pudiera rehacerla, el humano
 *      sería un planificador — y no hay planificador (A28). El dictamen NO toca lo ya emitido.
 *   3. LA FIRMA DICE EL ÁMBITO. Una revisión de tienda no la firma el dueño de la plaza, y el
 *      nacional no dictamina sobre un caso de una plaza que no es suya (O03). Si el ámbito no
 *      cuadra, no hay dictamen.
 *   4. SIN FIRMANTE NO HAY DICTAMEN, y un caso ya dictaminado no se vuelve a firmar con otro
 *      efecto: el pasado no se reescribe (H02/G05). Una corrección es otro dictamen sobre otro
 *      caso, o una nota del periodo siguiente.
 *
 * Quién firma es Q26 [ABIERTO]: el diseño garantiza que hay un NOMBRE, no decide cuál. Y los
 * plazos son Q24/Q40. Aquí no se eligen: se exigen.
 *
 * Single-writer: nadie más escribe este hecho. Store `/bocaos/dictamen-revision.json` por proyecto.
 * Isla: cero require a otra isla.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

// O04 · la forma es cerrada. Los tres permitidos, y el que no puede existir, con nombre.
const EFECTOS = ['compensar', 'corregir_historico', 'cambiar_regla_adelante'];
const PROHIBIDOS = [
  'rehacer_propuesta', 'rehacer', 'reemitir_propuesta', 'recalcular_propuesta',
  'reabrir_propuesta', 'reasignar', 'replanificar', 'reordenar', 'puntuar'
];
const AMBITOS = ['plaza', 'tienda', 'nacional'];

class DictamenRevision extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'dictamen-revision';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/dictamen-revision.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onFirmarRequest(e) { return this.servir(e, 'firmar', 'dictamen-revision.firmar', (d) => this._dictaminar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'dictamen-revision.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  // O03 · el caso que hay que revisar. Se guarda su ámbito porque la firma lo necesita: sin él no
  // se puede decir si quien firma puede firmarlo.
  async onCasoEncolado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.caso_id) return null;
    const est = await this.estado(d.project_id);
    est.casos = est.casos || {};
    const previo = est.casos[d.caso_id] || {};
    est.casos[d.caso_id] = {
      caso_id: d.caso_id,
      tipo: d.tipo || (d.caso && d.caso.tipo) || previo.tipo || null,
      parte_id: d.parte_id || (d.caso && d.caso.parte_id) || previo.parte_id || null,
      pedido_id: d.pedido_id || (d.caso && d.caso.pedido_id) || previo.pedido_id || null,
      // El ámbito del caso: el de la plaza donde se decidió (O03). El nacional no dictamina aquí.
      ambito: (d.caso && d.caso.ambito) || d.ambito || previo.ambito || 'plaza',
      traza: d.traza || previo.traza || null,
      plazo: this._iso(d.plazo) || previo.plazo || null,
      dictamen_id: previo.dictamen_id || null,
      encolado_en: previo.encolado_en || this.ahora()
    };
    await this.guardar(d.project_id);
    return null;
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= O04 · firmar (ORDEN) =================
  async _dictaminar(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    if (!d.caso_id) return this._invalid('caso_id');

    // 1 · el efecto: forma cerrada.
    const efecto = typeof d.efecto === 'string' ? d.efecto.trim() : '';
    if (PROHIBIDOS.includes(efecto)) {
      return this._errorResponse(422, 'EFECTO_PROHIBIDO',
        'rehacer la propuesta que ya se emitió no es un efecto: si el dictamen pudiera rehacerla, ' +
        'el humano sería un planificador y no hay planificador (O04/A28)',
        { field: 'efecto', permitidos: EFECTOS });
    }
    if (!EFECTOS.includes(efecto)) {
      return this._errorResponse(422, 'EFECTO_NO_DECLARADO',
        `efecto debe ser uno de: ${EFECTOS.join(' | ')}`, { field: 'efecto', permitidos: EFECTOS });
    }

    // 2 · el motivo: sin él, la firma es un gesto.
    const motivo = typeof d.motivo === 'string' ? d.motivo.trim() : '';
    if (!motivo) {
      return this._errorResponse(400, 'INVALID_INPUT', 'un dictamen exige motivo', { field: 'motivo' });
    }

    // 3 · el firmante: hay un NOMBRE (Q26 [ABIERTO] dice cuál, no si hay).
    const firmante = this._firmante(d.firmante || d.autor);
    if (!firmante.id) {
      return this._errorResponse(403, 'SIN_FIRMANTE',
        'sin firmante no hay dictamen: es la única mano humana sobre el mercado (O04)',
        { field: 'firmante', q: 'Q26 [ABIERTO]' });
    }

    const est = await this.estado(project_id);
    est.casos = est.casos || {};
    est.dictamenes = est.dictamenes || {};
    const caso = est.casos[d.caso_id] || (d.caso && typeof d.caso === 'object' ? {
      caso_id: d.caso_id,
      tipo: d.caso.tipo || null,
      parte_id: d.caso.parte_id || null,
      pedido_id: d.caso.pedido_id || null,
      ambito: d.caso.ambito || d.ambito || 'plaza',
      traza: d.caso.traza || null,
      plazo: this._iso(d.caso.plazo) || null
    } : null);
    if (!caso) {
      return this._errorResponse(404, 'CASO_NO_CONSTA',
        'el caso no está en la revisión de esta plaza: el nacional no dictamina sobre lo que no tiene (O03)',
        { field: 'caso_id' });
    }

    // 4 · la firma dice el ámbito.
    const ambito = AMBITOS.includes(caso.ambito) ? caso.ambito : 'plaza';
    if (firmante.ambito && firmante.ambito !== ambito) {
      return this._errorResponse(403, 'FIRMA_FUERA_DE_AMBITO',
        `el caso es de ${ambito} y la firma dice ${firmante.ambito}: una revisión de ${ambito} no la ` +
        'firma quien no es de ahí (O04)', { field: 'firmante.ambito', caso_ambito: ambito });
    }

    // 5 · un caso dictaminado no se vuelve a firmar con otro efecto.
    if (caso.dictamen_id && est.dictamenes[caso.dictamen_id]) {
      return this._errorResponse(409, 'YA_DICTAMINADO',
        'ese caso ya tiene dictamen firmado: el pasado no se reescribe (H02/G05). Una corrección es ' +
        'otro caso, o una nota del periodo siguiente',
        { field: 'caso_id', dictamen_id: caso.dictamen_id });
    }

    const dictamen = {
      dictamen_id: `dt-${crypto.randomUUID().slice(0, 8)}`,
      caso_id: caso.caso_id,
      plaza_id: d.plaza_id || project_id,
      tipo: caso.tipo,
      parte_id: caso.parte_id,
      pedido_id: caso.pedido_id,
      ambito,
      firmante: { id: firmante.id, ambito: firmante.ambito || ambito, rol: firmante.rol || null },
      efecto,
      // O04 · lo que el efecto TOCA, dicho por el propio dictamen.
      efecto_aplicado: this._alcance(efecto, d),
      motivo,
      firmado_en: this._iso(d.firmado_en || d.hora) || this.ahora(),
      traza: caso.traza || null,
      // La línea roja, en el hecho: el dictamen NO rehace la propuesta y NO reescribe el cierre.
      rehace_propuesta: false,
      reabre_cierre: false,
      no_alcanza: [
        'la propuesta que ya se emitió (O04: el humano no es un planificador)',
        'las propuestas pasadas: cambiar la regla es hacia adelante (A29 las reproduce igual)',
        'un cierre cerrado (H02)'
      ]
    };

    est.dictamenes[dictamen.dictamen_id] = dictamen;
    est.casos[caso.caso_id] = { ...caso, dictamen_id: dictamen.dictamen_id, dictaminado_en: dictamen.firmado_en };
    await this.guardar(project_id);

    this.hecho('bocaos.dictamen_firmado', {
      dictamen_id: dictamen.dictamen_id,
      caso_id: dictamen.caso_id,
      plaza_id: dictamen.plaza_id,
      tipo: dictamen.tipo,
      parte_id: dictamen.parte_id,
      pedido_id: dictamen.pedido_id,
      ambito: dictamen.ambito,
      firmante: dictamen.firmante,
      efecto: dictamen.efecto,
      efecto_aplicado: dictamen.efecto_aplicado,
      motivo: dictamen.motivo,
      firmado_en: dictamen.firmado_en,
      rehace_propuesta: false,
      reabre_cierre: false,
      no_alcanza: dictamen.no_alcanza
    });

    return { status: 201, data: { dictamen } };
  }

  // Lo que cada efecto TOCA. Compensar toca dinero (y por eso la cuenta de la parte lo verá); los
  // otros dos no. Ninguno toca la propuesta emitida.
  _alcance(efecto, d) {
    if (efecto === 'compensar') {
      return {
        toca_dinero: true,
        a_quien: d.a_quien || null,
        importe_centimos: Number.isInteger(d.importe_centimos) ? d.importe_centimos : null,
        importe_estado: Number.isInteger(d.importe_centimos) ? 'DECLARADO' : 'NO_CONSTA',
        // Q29 [ABIERTO] · cómo se hace efectivo no lo decide este módulo.
        como: d.como || 'Q29 [ABIERTO]: compensación contra la cuota, pago directo o fianza'
      };
    }
    if (efecto === 'corregir_historico') {
      return {
        toca_dinero: false,
        corrige: d.corrige || null,
        // Corregir un histórico mal medido NO cambia lo ya cerrado: deja la nota para el siguiente.
        nota_en_periodo_siguiente: true
      };
    }
    return {
      toca_dinero: false,
      regla: d.regla || null,
      // Hacia adelante: la regla nueva rige desde mañana y no reescribe lo pasado.
      desde: this._iso(d.desde) || this.ahora(),
      aplica_a_lo_pasado: false
    };
  }

  // ================= de (PREGUNTA) =================
  async _de(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    const est = await this.estado(project_id);
    const todos = Object.values(est.dictamenes || {});

    if (d.dictamen_id) {
      const x = est.dictamenes?.[d.dictamen_id];
      if (!x) return this._errorResponse(404, 'NO_CONSTA', 'no hay dictamen con ese id', { field: 'dictamen_id' });
      return { status: 200, data: { dictamen: x } };
    }
    if (d.caso_id) {
      const caso = est.casos?.[d.caso_id];
      if (!caso) return this._errorResponse(404, 'NO_CONSTA', 'ese caso no está en la revisión de esta plaza', { field: 'caso_id' });
      const x = caso.dictamen_id ? est.dictamenes[caso.dictamen_id] : null;
      return {
        status: 200,
        data: {
          caso,
          dictamen: x || null,
          estado: x ? 'DICTAMINADO' : 'PENDIENTE',
          motivo: x ? null : 'el caso está encolado y sin firma'
        }
      };
    }
    return { status: 200, data: { dictamenes: todos, total: todos.length } };
  }

  _firmante(f) {
    if (typeof f === 'string' && f.trim()) return { id: f.trim(), ambito: null, rol: null };
    if (!f || typeof f !== 'object') return { id: null, ambito: null, rol: null };
    return {
      id: f.id || f.parte_id || f.nombre || null,
      ambito: AMBITOS.includes(f.ambito) ? f.ambito : null,
      rol: f.rol || null
    };
  }
}

module.exports = DictamenRevision;
module.exports.EFECTOS = EFECTOS;
module.exports.PROHIBIDOS = PROHIBIDOS;
