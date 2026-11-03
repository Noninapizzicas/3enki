'use strict';

/**
 * disputa-fallo · PUENTE · PLAZA — G05 (DisputaFallo).
 *
 * EL CASO DE UNA PARTE QUE NO ESTÁ DE ACUERDO: se pone delante de un humano, con su traza y su
 * plazo. Bocaos NO decide la disputa. Tres reglas que son el módulo:
 *
 *   1. NO RE-JUZGA. Pone el caso en la cola (P01) y se aparta. No reabre un caso cerrado sin un
 *      hecho nuevo, no cambia la tabla de adjudicación (G03), no firma efectos (eso es O04).
 *   2. LA DEUDA SIGUE. Disputar no borra el cargo: lo que cambia es que no se cobra hasta el
 *      dictamen (Q29/Q24 [ABIERTOS]). El hecho lo dice con `cobrable: false`.
 *   3. EL CARGO SE LEE, NO SE SUPONE. Si el cargo no consta en `cargo-fallo`, no hay caso: se
 *      contesta NO_CONSTA en vez de abrir una disputa sobre una deuda inventada.
 *
 * El caso entra por `aviso-sala.caso.request` — el aviso es el que lo pone delante de una persona
 * y el que lo deja en la cola si no hay nadie (I07: vivo y visible, no perdido).
 *
 * Sin store: no escribe nada. La cola es de `cola-sala`; aquí sólo se recuerda, en caliente, qué
 * cargos se han visto y qué disputas ya están abiertas (idempotencia), nunca el estado del caso.
 *
 * Isla: cero require a otra isla. Lo que necesita lo pide al bus.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const TIMEOUT_CARGO_MS = 3000;
const MAX_CARGOS = 500;
const MAX_DISPUTAS = 500;

class DisputaFallo extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'disputa-fallo';
    this.version = 'puente-0.1.0';
    this._path = null;                     // sin estado: la deuda y el caso tienen dueño

    this._cargos = new Map();              // cargo_id → { cargo_id, estado, deudor, acreedor, ... }
    this._abiertas = new Map();            // cargo_id|parte_id → { disputa_id, motivo, abierta_en }
  }

  // ================= RPC del bus (una línea por op) =================
  onAbrirRequest(e) { return this.servir(e, 'abrir', 'disputa-fallo.abrir', (d) => this._abrir(d)); }

  // ================= hechos que escucha =================
  // El cargo existe (o se anuló): se recuerda en caliente para poder abrir su disputa sin volver
  // a preguntar, y para no disputar una deuda que ya no está. NO se abre nada solo: una disputa
  // la abre una parte, no el hecho de que exista una deuda.
  async onCargoAnotado(e) {
    const d = this.datos(e);
    if (!d.cargo_id) return null;
    this._cargos.set(d.cargo_id, {
      cargo_id: d.cargo_id,
      pedido_id: d.pedido_id || null,
      plaza_id: d.plaza_id || null,
      deudor: d.deudor || null,
      acreedor: d.acreedor || null,
      importe_centimos: d.importe_centimos === undefined ? null : d.importe_centimos,
      importe_estado: d.importe_estado || 'NO_CONSTA',
      evidencia: Array.isArray(d.evidencia) ? d.evidencia : [],
      estado: d.estado || 'ANOTADO'
    });
    if (this._cargos.size > MAX_CARGOS) this._cargos.delete(this._cargos.keys().next().value);
    return null;
  }

  // ================= G05 · abrir (ORDEN) =================
  async _abrir(d) {
    const plaza_id = this.plaza_id || d.plaza_id || d.project_id;
    if (!d.project_id && !plaza_id) return this._invalid('project_id');
    if (!d.cargo_id) return this._invalid('cargo_id');
    if (!d.parte_id) return this._invalid('parte_id');

    const motivo = typeof d.motivo === 'string' ? d.motivo.trim() : '';
    if (!motivo) {
      // G05: una disputa sin motivo es una queja; el motivo es lo que la hace revisable.
      return this._errorResponse(400, 'INVALID_INPUT', 'abrir una disputa exige motivo', { field: 'motivo' });
    }

    const cargo = await this._cargo(d, plaza_id);
    if (!cargo) {
      return this._errorResponse(404, 'NO_CONSTA',
        'el cargo no consta en esta plaza: no se abre una disputa sobre una deuda que no está',
        { field: 'cargo_id', hueco: 'cargo inexistente' });
    }
    if (cargo.estado === 'ANULADO') {
      // G04 ya lo anuló: no hay deuda que disputar (y abrir un caso la resucitaría).
      return this._errorResponse(409, 'CARGO_ANULADO',
        'el cargo está anulado: no hay deuda que disputar', { field: 'cargo_id' });
    }

    const partes = [cargo.deudor?.parte_id, cargo.acreedor?.parte_id].filter(Boolean);
    if (partes.length !== 2) {
      return this._errorResponse(409, 'CARGO_SIN_PARTES',
        'el cargo no tiene las dos partes con nombre: no hay a quién dar la razón',
        { field: 'cargo_id', partes });
    }
    if (!partes.includes(d.parte_id)) {
      // G05: disputa una PARTE del cargo. Un tercero no tiene nada que disputar aquí.
      return this._errorResponse(403, 'NO_ES_PARTE',
        'sólo una de las dos partes del cargo puede disputarlo', { field: 'parte_id', partes });
    }

    const clave = `${cargo.cargo_id}|${d.parte_id}`;
    const abierta = this._abiertas.get(clave);
    // G05: no se reabre sin un hecho nuevo. Un segundo intento con la misma clave y sin hecho
    // nuevo se contesta con la que ya está abierta (idempotente), no con un caso gemelo.
    if (abierta && d.hecho_nuevo !== true) {
      return { status: 200, data: { disputa: abierta, idempotente: true, en_cola: true } };
    }

    const ahora = this.ahora();
    const plazo = this._iso(d.plazo) || null;
    const hechos_citados = Array.isArray(d.hechos_citados) ? d.hechos_citados : [];
    const traza = {
      cargo_id: cargo.cargo_id,
      pedido_id: cargo.pedido_id || null,
      fila: d.fila || null,
      // G06: la evidencia del cargo viaja CON la disputa. Sin ella la sala sólo puede improvisar.
      evidencia: cargo.evidencia,
      hechos_citados,
      importe_centimos: cargo.importe_centimos,
      importe_estado: cargo.importe_estado,
      // Q28/Q29: lo que no consta se dice; no se rellena con un cero.
      como_se_hace_efectivo: 'Q29 [ABIERTO]: la deuda se acumula y se ve'
    };

    const disputa = {
      disputa_id: `dp-${crypto.randomUUID().slice(0, 8)}`,
      cargo_id: cargo.cargo_id,
      pedido_id: cargo.pedido_id || null,
      plaza_id: cargo.plaza_id || plaza_id,
      parte_id: d.parte_id,
      // Las dos caras, con nombre: la sala necesita ver a quién afecta sin pedir nada más.
      partes,
      motivo,
      hechos_citados,
      traza,
      // Q24 [ABIERTO]: quién decide. Lo que el diseño garantiza es que hay alguien y que firma.
      decide: 'Q24 [ABIERTO]: un humano de la plaza; su decisión queda firmada (O04)',
      plazo,
      plazo_estado: plazo ? 'DECLARADO' : 'NO_CONSTA',
      abierta_en: ahora,
      abierta_por: this._autor(d.autor) || d.parte_id,
      // G05: la deuda NO se borra y no se cobra hasta el dictamen.
      deuda_sigue: true,
      cobrable: false,
      motivo_no_cobrable: 'disputa abierta: no se cobra hasta el dictamen firmado (G05)',
      hecho_nuevo: d.hecho_nuevo === true
    };

    this._abiertas.set(clave, disputa);
    if (this._abiertas.size > MAX_DISPUTAS) this._abiertas.delete(this._abiertas.keys().next().value);

    // El HECHO: hay una disputa abierta y el cargo queda en el aire hasta el dictamen.
    this.hecho('bocaos.disputa_abierta', {
      disputa_id: disputa.disputa_id,
      cargo_id: disputa.cargo_id,
      pedido_id: disputa.pedido_id,
      plaza_id: disputa.plaza_id,
      parte_id: disputa.parte_id,
      partes: disputa.partes,
      motivo,
      hechos_citados,
      traza,
      plazo,
      plazo_estado: disputa.plazo_estado,
      deuda_sigue: true,
      cobrable: false,
      abierta_en: ahora
    });

    // Y el caso delante de una persona: por el aviso, que es quien lo deja en la cola si no hay
    // nadie (I07). El puente no escribe en la cola: se lo pide a su dueño.
    this.eventBus.publish('aviso-sala.caso.request', {
      request_id: crypto.randomUUID(),
      project_id: disputa.plaza_id || d.project_id,
      plaza_id: disputa.plaza_id,
      caso: {
        caso_id: disputa.disputa_id,
        tipo: 'disputa',
        titulo: `disputa del cargo ${disputa.cargo_id}`,
        parte_id: disputa.parte_id,
        partes: disputa.partes,
        pedido_id: disputa.pedido_id,
        cargo_id: disputa.cargo_id
      },
      tipo: 'disputa',
      traza,
      plazo,
      pedidos_afectados: disputa.pedido_id ? 1 : 0,
      origen: this.name
    });

    return { status: 201, data: { disputa } };
  }

  // El cargo, del sitio donde vive: en caliente si acaba de pasar por el bus; si no, se pregunta
  // a su dueño. Nunca se rellena con lo que «debería» ser.
  async _cargo(d, plaza_id) {
    if (d.cargo && typeof d.cargo === 'object' && d.cargo.cargo_id === d.cargo_id) {
      return this._normalizar(d.cargo);
    }
    const enCaliente = this._cargos.get(d.cargo_id);
    if (enCaliente) return enCaliente;
    const r = await this._rpc('cargo-fallo.de.request', {
      project_id: d.project_id || plaza_id,
      plaza_id,
      cargo_id: d.cargo_id
    }, { timeout_ms: TIMEOUT_CARGO_MS });
    if (!r || typeof r.status === 'number' && r.status >= 400) return null;
    return r.data && r.data.cargo ? this._normalizar(r.data.cargo) : null;
  }

  _normalizar(c) {
    return {
      cargo_id: c.cargo_id,
      pedido_id: c.pedido_id || null,
      plaza_id: c.plaza_id || null,
      deudor: c.deudor || null,
      acreedor: c.acreedor || null,
      importe_centimos: c.importe_centimos === undefined ? null : c.importe_centimos,
      importe_estado: c.importe_estado || 'NO_CONSTA',
      evidencia: Array.isArray(c.evidencia) ? c.evidencia : [],
      estado: c.estado || 'ANOTADO'
    };
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') return a.id || a.parte_id || a.rol || a.nombre || null;
    return null;
  }
}

module.exports = DisputaFallo;
