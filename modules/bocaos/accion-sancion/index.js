'use strict';

/**
 * accion-sancion · CUSTODIO · PLAZA — P03 (AcciónSanción).
 *
 * LA SANCIÓN COMO ACTO CON AUTOR, MOTIVO Y PLAZO — y su reversión. Nada se sanciona por un número:
 * se sanciona por un hecho del acta.
 *
 *   1. SIN FIRMANTE NO HAY SANCIÓN, y sin ACTA tampoco. Suspender a alguien sin dejar por qué es el
 *      principio de un mercado de abusos — y este mercado se llama así a propósito (P03).
 *   2. «POR TASA DE RECHAZO» NO ES UNA FALTA: rechazar es un derecho (A21). No hay camino.
 *   3. NO TOCA LO QUE ESTÁ EN VUELO. La suspensión corta la ENTRADA de pedidos nuevos; no corta
 *      pedidos en vuelo ni retira propuestas vivas (H05) y no toca el dinero (H06). Un rider o una
 *      tienda que se queda a medias por una cuota es daño colateral que el diseño no acepta.
 *   4. SE REVOCA CON MOTIVO Y AUTOR, y la revocación es una transición del MISMO hecho (activa →
 *      revocada), no un borrado: una sanción que desaparece no deja rastro de que existió.
 *
 * Single-writer: nadie más escribe este hecho. Store `/bocaos/accion-sancion.json` por proyecto.
 * Isla: cero require a otra isla.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

// P03 · lo que NO puede ser el motivo de una sanción: es un derecho, no una falta.
const NO_ES_FALTA = ['tasa_rechazo', 'tasa_de_rechazo', 'ratio_rechazo', 'rechazar', 'rechazos'];

class AccionSancion extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'accion-sancion';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/accion-sancion.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onAplicarRequest(e) { return this.servir(e, 'aplicar', 'accion-sancion.aplicar', (d) => this._aplicar(d)); }
  onRevocarRequest(e) { return this.servir(e, 'revocar', 'accion-sancion.revocar', (d) => this._revocar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'accion-sancion.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // O04 · un dictamen firmado puede corregir una sanción: SÓLO si la nombra (`sancion_id`). Si no
  // la nombra, no la toca — un dictamen genérico no es un indulto.
  async onDictamenFirmado(e) {
    const d = this.datos(e);
    if (!d.sancion_id || !d.project_id) return null;
    const est = await this.estado(d.project_id);
    const sancion = est.sanciones?.[d.sancion_id];
    if (!sancion || sancion.estado !== 'ACTIVA') return null;
    const autor = d.firmante && (d.firmante.id || d.firmante.nombre) ? (d.firmante.id || d.firmante.nombre) : null;
    return this._revocarSancion({
      project_id: d.project_id,
      sancion,
      autor: autor || 'dictamen',
      motivo: `dictamen ${d.dictamen_id || ''}: ${d.motivo || 'corrige la sanción'}`.trim(),
      via: 'dictamen',
      dictamen_id: d.dictamen_id || null,
      hora: d.firmado_en || null
    });
  }

  // ================= P03 · aplicar (ORDEN) =================
  async _aplicar(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    const parte_id = d.parte_id || d.rider_id || d.tienda_id;
    if (!parte_id) return this._invalid('parte_id');

    const autor = this._autor(d.firmante || d.autor);
    if (!autor) {
      return this._errorResponse(403, 'SIN_FIRMANTE',
        'una sanción exige firmante: suspender sin nombre es el principio de un mercado de abusos (P03)',
        { field: 'firmante', q: 'Q26 [ABIERTO]' });
    }
    const acta = typeof d.acta === 'string' ? d.acta.trim() : (d.acta && d.acta.acta_id ? String(d.acta.acta_id) : '');
    if (!acta) {
      return this._errorResponse(409, 'SIN_ACTA',
        'una sanción exige acta: el acta no se corrige y por eso se puede citar (P03/O02)',
        { field: 'acta' });
    }
    const motivo = typeof d.motivo === 'string' ? d.motivo.trim() : '';
    if (!motivo) return this._errorResponse(400, 'INVALID_INPUT', 'una sanción exige motivo', { field: 'motivo' });

    // A21 · rechazar es un derecho. Si el motivo es «rechaza mucho», no hay sanción.
    const causa = typeof d.causa === 'string' ? d.causa.toLowerCase() : '';
    if (NO_ES_FALTA.includes(causa) || /tasa\s+de\s+rechazo|ratio\s+de\s+rechazo/i.test(motivo)) {
      return this._errorResponse(409, 'NO_ES_UNA_FALTA',
        'la tasa de rechazo no es una falta: rechazar es un derecho del rider y de la tienda (A21)',
        { field: 'causa', regla: 'A21' });
    }

    // H05/P03 · los límites: la suspensión corta la ENTRADA, nunca lo que ya está en marcha.
    const limites = this._limites(d);
    if (limites.prohibido) {
      return this._errorResponse(409, limites.code, limites.motivo, { field: limites.field });
    }

    const plazo = this._iso(d.plazo || d.hasta) || null;
    if (!plazo) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'una sanción sin plazo es indefinida: el plazo es lo que la separa de un destierro (P03)',
        { field: 'plazo' });
    }

    const est = await this.estado(project_id);
    est.sanciones = est.sanciones || {};

    // La misma sanción dos veces no es dos sanciones (misma parte, mismo motivo, mismo plazo).
    const ya = Object.values(est.sanciones).find((s) =>
      s.parte_id === parte_id && s.motivo === motivo && s.plazo === plazo && s.estado === 'ACTIVA');
    if (ya) return { status: 200, data: { sancion: ya, idempotente: true } };

    const sancion = {
      sancion_id: `sn-${crypto.randomUUID().slice(0, 8)}`,
      parte_id,
      parte: d.parte || (String(parte_id).startsWith('rider') ? 'rider' : 'tienda'),
      plaza_id: d.plaza_id || project_id,
      motivo,
      plazo,
      acta,
      firmante: autor,
      aplicada_en: this._iso(d.hora) || this.ahora(),
      estado: 'ACTIVA',
      revocada_en: null,
      revocada_por: null,
      motivo_revocacion: null,
      // P03 · el alcance, escrito en la sanción para que no se pueda ampliar después sin otro acto.
      alcance: {
        corta: 'entrada_de_pedidos_nuevos',
        pedidos_en_vuelo: false,
        propuestas_vivas: false,
        toca_dinero: false,
        motivo: 'la suspensión no corta pedidos en vuelo ni propuestas vivas (H05) y no toca el dinero (H06)'
      }
    };

    est.sanciones[sancion.sancion_id] = sancion;
    await this.guardar(project_id);
    this._publicar(sancion, 'aplicada');
    return { status: 201, data: { sancion } };
  }

  // Lo que la sanción NO puede hacer. Se comprueba en la entrada: si alguien pide «corta también lo
  // que está en vuelo», no hay sanción (y no se aplica a medias).
  _limites(d) {
    if (d.cortar_en_vuelo === true || d.corta_pedidos_en_vuelo === true) {
      return {
        prohibido: true, code: 'NO_CORTA_LO_EN_VUELO', field: 'cortar_en_vuelo',
        motivo: 'la suspensión no corta pedidos en vuelo: corta la entrada de pedidos nuevos (H05/P03)'
      };
    }
    if (d.retirar_propuestas === true || d.corta_propuestas_vivas === true) {
      return {
        prohibido: true, code: 'NO_RETIRA_PROPUESTAS', field: 'retirar_propuestas',
        motivo: 'la suspensión no retira propuestas vivas (H05/P03)'
      };
    }
    if (d.tocar_dinero === true || d.descontar === true) {
      return {
        prohibido: true, code: 'NO_TOCA_EL_DINERO', field: 'tocar_dinero',
        motivo: 'una sanción no toca el dinero: la plaza no retiene (H06)'
      };
    }
    return { prohibido: false };
  }

  // ================= P03 · revocar (ORDEN) =================
  async _revocar(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    if (!d.sancion_id) return this._invalid('sancion_id');
    const est = await this.estado(project_id);
    const sancion = est.sanciones?.[d.sancion_id];
    if (!sancion) {
      return this._errorResponse(404, 'NO_CONSTA', 'no hay sanción con ese id en esta plaza', { field: 'sancion_id' });
    }
    if (sancion.estado === 'REVOCADA') return { status: 200, data: { sancion, idempotente: true } };
    const autor = this._autor(d.firmante || d.autor);
    if (!autor) {
      return this._errorResponse(403, 'SIN_FIRMANTE', 'revocar exige autor', { field: 'firmante' });
    }
    const motivo = typeof d.motivo === 'string' ? d.motivo.trim() : '';
    if (!motivo) return this._errorResponse(400, 'INVALID_INPUT', 'revocar exige motivo', { field: 'motivo' });

    return this._revocarSancion({ project_id, sancion, autor, motivo, hora: d.hora, via: 'revocacion' });
  }

  async _revocarSancion({ project_id, sancion, autor, motivo, hora = null, via = 'revocacion', dictamen_id = null }) {
    sancion.estado = 'REVOCADA';
    sancion.revocada_en = this._iso(hora) || this.ahora();
    sancion.revocada_por = autor;
    sancion.motivo_revocacion = motivo;
    sancion.revocada_via = via;
    if (dictamen_id) sancion.dictamen_id = dictamen_id;
    await this.guardar(project_id);
    this._publicar(sancion, 'revocada');
    return { status: 200, data: { sancion } };
  }

  // ================= de (PREGUNTA) =================
  async _de(d) {
    const project_id = d.project_id || this.plaza_id;
    if (!project_id) return this._invalid('project_id');
    const est = await this.estado(project_id);
    const todas = Object.values(est.sanciones || {});

    if (d.sancion_id) {
      const s = est.sanciones?.[d.sancion_id];
      if (!s) return this._errorResponse(404, 'NO_CONSTA', 'no hay sanción con ese id', { field: 'sancion_id' });
      return { status: 200, data: { sancion: this._vista(s) } };
    }
    const parte_id = d.parte_id || d.rider_id || d.tienda_id;
    if (!parte_id) return this._invalid('parte_id');
    const suyas = todas.filter((s) => s.parte_id === parte_id);
    return {
      status: 200,
      data: {
        parte_id,
        sanciones: suyas.map((s) => this._vista(s)),
        activa: suyas.some((s) => this._vista(s).vigente),
        // Lo que una sanción NUNCA ha hecho aquí, para que la respuesta lo pueda afirmar.
        limites: { pedidos_en_vuelo: false, propuestas_vivas: false, toca_dinero: false }
      }
    };
  }

  // Una sanción vencida NO se borra: deja de estar vigente y sigue en el histórico (P03).
  _vista(s) {
    const ahora = Date.parse(this.ahora());
    const fin = Date.parse(s.plazo);
    const vigente = s.estado === 'ACTIVA' && Number.isFinite(fin) && fin > ahora;
    return {
      ...s,
      vigente,
      estado_efectivo: s.estado === 'REVOCADA' ? 'REVOCADA' : (vigente ? 'ACTIVA' : 'VENCIDA')
    };
  }

  _publicar(sancion, transicion) {
    this.hecho('bocaos.parte_sancionada', {
      sancion_id: sancion.sancion_id,
      parte_id: sancion.parte_id,
      parte: sancion.parte,
      plaza_id: sancion.plaza_id,
      motivo: sancion.motivo,
      plazo: sancion.plazo,
      acta: sancion.acta,
      firmante: sancion.firmante,
      estado: sancion.estado,
      transicion,
      alcance: sancion.alcance,
      revocada_en: sancion.revocada_en,
      revocada_por: sancion.revocada_por,
      motivo_revocacion: sancion.motivo_revocacion,
      revocada_via: sancion.revocada_via || null
    });
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') return a.id || a.parte_id || a.nombre || a.rol || null;
    return null;
  }
}

module.exports = AccionSancion;
