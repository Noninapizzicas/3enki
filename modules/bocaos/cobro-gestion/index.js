'use strict';

/**
 * cobro-gestion · PUENTE · PLAZA — H04 (CobroGestión), sobre `pago-gateway` v3.1.0.
 *
 * COBRA A LA PARTE SU DOCUMENTO, POR EL CANAL QUE ELLA DECLARÓ, Y DEVUELVE LA CONSTANCIA.
 * No construye el cobro: lo pide al órgano que ya cobra en este repo.
 *
 *   1. COBRA LO SUYO Y SÓLO LO SUYO. Un documento de cuota de la plaza (tienda o rider), con
 *      importe; ni la comida ni el reparto (H06). Un documento incompleto (`cobrable: false`) no
 *      se cobra: se dice por qué.
 *   2. EL CANAL ES DE LA PARTE. Se pregunta a `estado-parte` cuál declaró. Sin canal declarado no
 *      hay cobro: se publica el fallo con el hueco, no se elige un canal por ella.
 *   3. UN COBRO F ALLIDO NO CAMBIA LO DEVENGADO: cambia la deuda (H05). Por eso aquí no se toca el
 *      devengo y la constancia va aparte, con su motivo.
 *   4. LA VUELTA (Q29/Q24) ES UN ACTO CON AUTOR Y MOTIVO, y SÓLO ANTES DE LIQUIDAR: un cierre
 *      cerrado no se reabre (H02). La reversión la ejecuta el órgano (op `pago.revertir`, NUEVA y
 *      aditiva); aquí se valida, se pide y se devuelve la constancia.
 *
 * Sin store: la cuota tiene su cierre inmutable en `liquidacion` y el dinero su libro en
 * `pago-gateway`. Guardar aquí un tercer libro sería la tercera verdad del mismo euro.
 *
 * Isla: cero require a otra isla. Todo lo que necesita lo pide al bus.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const TIMEOUT_CANAL_MS = 2000;
const TIMEOUT_REVERSION_MS = 20000;      // la pasarela puede tardar; un timeout es estado incierto
const TIMEOUT_CIERRE_MS = 2500;
const MAX_DOCUMENTOS = 500;

class CobroGestion extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'cobro-gestion';
    this.version = 'puente-0.1.0';
    this._path = null;                     // sin estado: el libro es del órgano, el cierre de liquidacion

    this._documentos = new Map();          // documento_id → { documento_id, parte_id, rol, total, periodo, estado }
    this._iniciados = new Set();           // documento_id ya mandados a cobrar (un documento, un cobro)
    this._confirmados = new Set();         // transaction_id ya confirmadas (el webhook reintenta)
    this._mios = new Set();                // request_id de reversiones que este módulo reenvía
    this._discrepancias = new Map();       // documento_id → { esperado, recibido }
  }

  // ================= hechos que escucha =================
  // H04 · hay documento: se cobra por el canal de la parte (o se dice por qué no).
  async onDocumentoEmitido(e) {
    const d = this.datos(e);
    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    if (!d.documento_id || !d.parte_id) return null;
    if (this._iniciados.has(d.documento_id)) return null;   // un documento, un cobro

    const doc = {
      documento_id: d.documento_id,
      parte_id: d.parte_id,
      rol: d.parte || null,
      periodo: d.periodo || null,
      total_centimos: Number.isInteger(d.total_centimos) ? d.total_centimos : null,
      cobrable: d.cobrable !== false,
      motivo_no_cobrable: d.motivo_no_cobrable || null,
      tipo: d.tipo || 'ORDINARIA',
      plaza_id
    };
    this._documentos.set(doc.documento_id, { ...doc, estado: 'EMITIDO' });
    if (this._documentos.size > MAX_DOCUMENTOS) this._documentos.delete(this._documentos.keys().next().value);

    // H06 · la plaza cobra SU cuota: un documento cuyo receptor no es una parte del mercado (o que
    // trae la comida) no se cobra por aquí.
    if (!['tienda', 'rider'].includes(doc.rol)) {
      this._fallido(doc, { code: 'NO_ES_LA_CUOTA', motivo: 'el documento no es la cuota de una parte del mercado (H06)' });
      return null;
    }
    if (!doc.cobrable || doc.total_centimos === null) {
      this._fallido(doc, {
        code: 'DOCUMENTO_INCOMPLETO',
        motivo: doc.motivo_no_cobrable || 'el documento no tiene base: no hay importe que cobrar'
      });
      return null;
    }

    // El canal lo declara la parte. No se elige por ella.
    const canal = await this._canalDe(doc.parte_id, plaza_id);
    if (!canal) {
      this._fallido(doc, {
        code: 'SIN_CANAL',
        motivo: 'la parte no ha declarado canal de cobro en el censo (H04): no se elige por ella',
        hueco: 'canal_cobro'
      });
      return null;
    }

    this._iniciados.add(doc.documento_id);
    this.eventBus.publish('pago.iniciar.request', {
      request_id: crypto.randomUUID(),
      project_id: plaza_id,
      plaza_id,
      // `referencia` es el HECHO cobrado para el órgano: aquí, el documento de la cuota.
      referencia: doc.documento_id,
      documento_id: doc.documento_id,
      parte_id: doc.parte_id,
      monto_centimos: doc.total_centimos,
      concepto: `cuota de la plaza · ${doc.periodo || ''}`.trim(),
      canal,
      moneda: d.moneda || null,
      origen: this.name
    });
    return null;
  }

  // El dinero entró. Pero sólo se da por cobrado si el importe CUADRA: un cobro que no cuadra es
  // una discrepancia, y el caso no se cierra por bueno.
  async onPagoConfirmado(e) {
    const d = this.datos(e, 'project_id');
    const doc = this._docDe(d);
    if (!doc) return null;
    const tx = d.transaction_id || d.session_id || null;
    if (tx && this._confirmados.has(tx)) return null;

    const recibido = Number.isInteger(d.monto_centimos) ? d.monto_centimos : (Number.isInteger(d.amount) ? d.amount : null);
    if (recibido !== null && doc.total_centimos !== null && recibido !== doc.total_centimos) {
      // No se confirma. Se apunta la discrepancia y se espera a `pago.importe_discrepante`.
      this._discrepancias.set(doc.documento_id, { esperado: doc.total_centimos, recibido });
      this.logger?.warn('cobro-gestion.importe_no_cuadra', {
        documento_id: doc.documento_id, esperado: doc.total_centimos, recibido
      });
      return null;
    }
    if (tx) this._confirmados.add(tx);
    doc.estado = 'COBRADO';
    doc.cobrado_en = this.ahora();
    this.hecho('bocaos.cobro_confirmado', {
      documento_id: doc.documento_id,
      parte_id: doc.parte_id,
      parte: doc.rol,
      plaza_id: doc.plaza_id,
      periodo: doc.periodo,
      monto_centimos: recibido === null ? doc.total_centimos : recibido,
      transaction_id: d.transaction_id || null,
      session_id: d.session_id || null,
      canal: d.canal || null,
      estado: 'CONFIRMADO',
      // H04 · el devengo no se toca: lo cobrado es lo devengado, y el cierre manda.
      cambia_lo_devengado: false
    });
    return null;
  }

  async onPagoRechazado(e) {
    const d = this.datos(e, 'project_id');
    const doc = this._docDe(d);
    if (!doc) return null;
    doc.estado = 'FALLIDO';
    this._fallido(doc, {
      code: d.code || 'RECHAZADO',
      motivo: d.motivo || d.message || 'la pasarela rechazó el cobro',
      transaction_id: d.transaction_id || null
    });
    return null;
  }

  // Una discrepancia de importe: el caso NO se da por cobrado (H04).
  async onPagoImporteDiscrepante(e) {
    const d = this.datos(e, 'project_id');
    const doc = this._docDe(d);
    if (!doc) return null;
    const apuntada = this._discrepancias.get(doc.documento_id) || {};
    doc.estado = 'DISCREPANTE';
    this._fallido(doc, {
      code: 'IMPORTE_DISCREPANTE',
      motivo: 'el importe cobrado no cuadra con el documento: el caso no se da por cobrado',
      esperado_centimos: Number.isInteger(d.esperado_centimos) ? d.esperado_centimos : apuntada.esperado ?? doc.total_centimos,
      recibido_centimos: Number.isInteger(d.recibido_centimos) ? d.recibido_centimos : apuntada.recibido ?? null
    });
    return null;
  }

  // La vuelta del dinero. El cobro de un documento es UN agregado: el reembolso es una transición
  // suya, no un hecho nuevo (mismo criterio que el cargo: anotado · cobrado · anulado).
  async onPagoReembolsado(e) {
    const d = this.datos(e, 'project_id');
    const doc = this._docDe(d);
    if (!doc) return null;
    doc.estado = 'REEMBOLSADO';
    this.hecho('bocaos.cobro_confirmado', {
      documento_id: doc.documento_id,
      parte_id: doc.parte_id,
      parte: doc.rol,
      plaza_id: doc.plaza_id,
      periodo: doc.periodo,
      monto_centimos: Number.isInteger(d.monto_centimos) ? d.monto_centimos : null,
      transaction_id: d.transaction_id || null,
      estado: 'REEMBOLSADO',
      completo: d.completo === true,
      cambia_lo_devengado: false,
      motivo: 'el dinero volvió: el cobro deja de estar en pie, el devengo no se mueve (H04/H05)'
    });
    return null;
  }

  // ================= H04 · revertir (ORDEN) =================
  // Llega por el bus como cualquier op. Se atiende AQUÍ sólo si es la cuota de una parte de esta
  // plaza: una devolución de la comida la ejecuta el órgano y no pasa por este puente.
  async onRevertirRequest(e) {
    const d = (e && e.data) || e || {};
    if (d.via === this.name) return null;                       // mi propio reenvío: no se reenvía dos veces
    const doc = this._docDe(d);
    if (!doc) return null;                                      // no es un documento de esta plaza

    const request_id = d.request_id || (e && e.request_id) || null;
    const r = await this._revertir(d, doc);
    // El par honesto del op, en el nombre que el plano le da (`pago.revertir.response`): quien
    // pidió la reversión espera ahí su respuesta, con SU request_id.
    this.eventBus.publish('pago.revertir.response', {
      request_id,
      reemitido_por: this.name,
      correlation_id: d.correlation_id || crypto.randomUUID(),
      timestamp: this.ahora(),
      ...r
    });
    return null;
  }

  async _revertir(d, doc) {
    const motivo = typeof d.motivo === 'string' ? d.motivo.trim() : '';
    const autor = this._autor(d.autor);
    if (!autor) {
      return { status: 403, error: { code: 'SIN_AUTOR', message: 'revertir un cobro exige autor: es un acto, no un barrido' } };
    }
    if (!motivo) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'revertir un cobro exige motivo' } };
    }
    if (doc.estado !== 'COBRADO') {
      return {
        status: 409,
        error: {
          code: 'NO_COBRADO',
          message: `no se revierte un cobro que no está cobrado (estado ${doc.estado})`,
          details: { documento_id: doc.documento_id }
        }
      };
    }
    // H02 · sólo ANTES de liquidar: el cierre de la semana es inmutable y una vuelta posterior es
    // una nota en el periodo siguiente, no una reescritura del pasado.
    const cierre = await this._cierreDe(doc);
    if (cierre && cierre.estado === 'CERRADO') {
      return {
        status: 409,
        error: {
          code: 'CIERRE_CERRADO',
          message: 'el periodo de ese documento ya está cerrado: un cierre no se reabre (H02). La vuelta va como nota del periodo siguiente',
          details: { periodo: doc.periodo, cierre_id: cierre.cierre_id }
        }
      };
    }

    const forwards = crypto.randomUUID();
    this._mios.add(forwards);
    const r = await this._rpc('pago.revertir.request', {
      request_id: forwards,
      project_id: doc.plaza_id,
      plaza_id: doc.plaza_id,
      referencia: doc.documento_id,
      documento_id: doc.documento_id,
      parte_id: doc.parte_id,
      monto_centimos: Number.isInteger(d.monto_centimos) ? d.monto_centimos : doc.total_centimos,
      motivo,
      autor,
      via: this.name
    }, { timeout_ms: TIMEOUT_REVERSION_MS });
    if (!r) {
      // Un timeout de reversión es ESTADO INCIERTO: no se reintenta a ciegas (se devolvería dos veces).
      return {
        status: 504,
        error: {
          code: 'ESTADO_INCIERTO',
          message: 'el órgano no confirmó la reversión: estado incierto. Verifica antes de reintentar',
          details: { documento_id: doc.documento_id }
        }
      };
    }
    if (typeof r.status === 'number' && r.status >= 400) return r;

    doc.estado = 'REEMBOLSADO';
    this.hecho('bocaos.cobro_confirmado', {
      documento_id: doc.documento_id,
      parte_id: doc.parte_id,
      parte: doc.rol,
      plaza_id: doc.plaza_id,
      periodo: doc.periodo,
      monto_centimos: r.data && r.data.monto_centimos ? r.data.monto_centimos : null,
      transaction_id: r.data ? r.data.transaction_id || null : null,
      estado: 'REEMBOLSADO',
      motivo,
      autor,
      via: r.data ? r.data.via || 'reembolso' : 'reembolso',
      cambia_lo_devengado: false
    });
    return { status: 200, data: { documento_id: doc.documento_id, estado: 'REEMBOLSADO', motivo, autor, vuelta: r.data || null } };
  }

  // La respuesta de una reversión que NO pedimos nosotros (la hizo otro camino): se anota y se ve.
  async onPagoRevertirResponse(e) {
    const d = (e && e.data) || e || {};
    if (d.reemitido_por === this.name) return null;             // mi propia reemisión: no se muerde la cola
    if (d.request_id && this._mios.has(d.request_id)) return null;  // la atiende `_revertir`, que la espera
    const doc = this._docDe(d);
    if (!doc) return null;
    if (d.status && d.status >= 400) {
      this._fallido(doc, {
        code: d.error?.code || 'REVERSION_FALLIDA',
        motivo: d.error?.message || 'la reversión no se hizo'
      });
      return null;
    }
    doc.estado = 'REEMBOLSADO';
    this.hecho('bocaos.cobro_confirmado', {
      documento_id: doc.documento_id,
      parte_id: doc.parte_id,
      parte: doc.rol,
      plaza_id: doc.plaza_id,
      periodo: doc.periodo,
      monto_centimos: d.data ? d.data.monto_centimos ?? null : null,
      transaction_id: d.data ? d.data.transaction_id || null : null,
      estado: 'REEMBOLSADO',
      motivo: d.data ? d.data.motivo || null : null,
      autor: d.data ? d.data.autor || null : null,
      via: 'reversion',
      cambia_lo_devengado: false
    });
    return null;
  }

  // ================= utilidades =================
  _docDe(d) {
    const id = d.documento_id || d.referencia || null;
    if (!id) return null;
    const doc = this._documentos.get(id);
    if (doc) return doc;
    // Un documento que viene dado en la petición, con su forma: no se inventa lo que no se vio.
    if (d.documento && d.documento.documento_id === id && Array.isArray(d.documento.lineas)) {
      const doc2 = {
        documento_id: id,
        parte_id: d.documento.receptor?.parte_id || d.parte_id || null,
        rol: d.documento.receptor?.rol || d.parte || null,
        periodo: d.documento.periodo || d.periodo || null,
        total_centimos: Number.isInteger(d.documento.total_centimos) ? d.documento.total_centimos : null,
        cobrable: d.documento.cobrable !== false,
        estado: 'EMITIDO',
        plaza_id: d.documento.plaza_id || d.plaza_id || null
      };
      this._documentos.set(id, doc2);
      return doc2;
    }
    return null;
  }

  async _canalDe(parte_id, plaza_id) {
    const r = await this._rpc('estado-parte.de.request', { project_id: plaza_id, parte_id }, { timeout_ms: TIMEOUT_CANAL_MS });
    if (!r || typeof r.status === 'number' && r.status >= 400) return null;
    const parte = r.data && (r.data.parte || r.data.estado) ? (r.data.parte || r.data.estado) : r.data;
    if (!parte || typeof parte !== 'object') return null;
    const canal = parte.canal_cobro || (parte.cobro && parte.cobro.canal) || null;
    return typeof canal === 'string' && canal.trim() ? canal.trim() : null;
  }

  async _cierreDe(doc) {
    if (!doc.periodo) return null;
    const r = await this._rpc('liquidacion.de.request', {
      project_id: doc.plaza_id, periodo: doc.periodo
    }, { timeout_ms: TIMEOUT_CIERRE_MS });
    if (!r || typeof r.status === 'number' && r.status >= 400 || !r.data) return null;
    return r.data.cierre || null;
  }

  _fallido(doc, { code, motivo, hueco = null, transaction_id = null, esperado_centimos = null, recibido_centimos = null }) {
    this.hecho('bocaos.cobro_fallido', {
      documento_id: doc.documento_id,
      parte_id: doc.parte_id,
      parte: doc.rol,
      plaza_id: doc.plaza_id,
      periodo: doc.periodo,
      importe_centimos: doc.total_centimos,
      code,
      motivo,
      hueco,
      transaction_id,
      esperado_centimos,
      recibido_centimos,
      // H04 · un cobro fallido no cambia lo devengado: cambia la deuda (H05).
      cambia_lo_devengado: false
    });
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') return a.id || a.parte_id || a.rol || a.nombre || null;
    return null;
  }
}

module.exports = CobroGestion;
