'use strict';

/**
 * escalada-enlace · PUENTE · PLAZA — Q43 (los tres peldaños, sin sala humana).
 *
 * Cuando el enlace dice «agotado», no hay nadie mirando una pantalla: se sube un peldaño.
 * La escalada NO elige rider ni emite propuestas — pide al bus que el enlace vuelva a medir
 * con más mercado o con más dinero. El que decide sigue siendo el cuello.
 *
 *   escucha  bocaos.enlace_agotado
 *   peldaño 1  los dos candidatos ya se agotaron → abrir a TODOS los riders activos de la zona,
 *              la misma oferta, 30 s.
 *   peldaño 2+ subir la oferta en escalones, con el TOPE que el cliente autorizó (bocaos.tarifa).
 *   agotado    bocaos.escalada_agotada + bocaos.pedido_sin_reparto (cancelación explícita).
 *
 * Lo que se emite por peldaño:
 *   bocaos.escalada_peldano { pedido_id, peldaño, segundos, nuevo_tope }
 *   bocaos.escalada_reintentar { pedido_id, oferta_cents, zona, excluir }   → el enlace vuelve
 *
 * Sin tope autorizado NO se sube la oferta: no se puede pagar con el dinero de nadie sin su
 * permiso. En ese caso la escalada se agota y se dice por qué.
 *
 * El estado por pedido (qué peldaño, cuánto se ofreció, qué tope hay) sí es suyo: sin él, cada
 * agotado volvería a empezar por el peldaño 1 y la escalada no escalaría.
 *
 * Isla: el pedido se PIDE al bus (pedido.de) para saber zona y oferta. Cero require a otra isla.
 */

const ModuloBocaos = require('../_bocaos');

const PELDANO_TODOS_S = 30;        // Q43: abrir a todos los activos de la zona
const ESCALON_CENTS = 50;          // cuánto sube cada peldaño si el cliente no dice otra cosa
const ESCALONES_MAX = 3;           // tres subidas, ni una más
const TIMEOUT_BUS_MS = 1200;

class EscaladaEnlace extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'escalada-enlace';
    this.version = 'puente-0.1.0';
    this._path = '/bocaos/escalada-enlace.json';

    this.escalon_cents = ESCALON_CENTS;
    this.escalones_max = ESCALONES_MAX;
  }

  // ================= hechos que escucha =================
  async onEnlaceAgotado(e) { return this._escalar(e); }

  // El cliente autoriza hasta aquí. Sin esta autorización, la oferta no sube.
  async onTarifa(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    const tope = this._cents(d.tope_cents ?? d.tope);
    if (tope === null) {
      this.logger?.warn('escalada-enlace.tarifa_sin_tope', { pedido_id: d.pedido_id });
      return null;
    }
    const est = await this.estado(d.project_id);
    est.pedidos = est.pedidos || {};
    const it = est.pedidos[d.pedido_id] || this._nuevo(d.pedido_id);
    it.tope_cents = tope;
    if (this._cents(d.escalon_cents) !== null) it.escalon_cents = this._cents(d.escalon_cents);
    if (Number.isInteger(d.escalones_max) && d.escalones_max >= 0) it.escalones_max = d.escalones_max;
    it.actualizado_en = this.ahora();
    est.pedidos[d.pedido_id] = it;
    await this.guardar(d.project_id);
    return null;
  }

  // Con reparto, la escalada de ese pedido terminó: no se sigue subiendo por detrás.
  async onContratoCreado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    const est = await this.estado(d.project_id);
    if (!est.pedidos?.[d.pedido_id]) return null;
    delete est.pedidos[d.pedido_id];
    await this.guardar(d.project_id);
    return null;
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= Q43 · el siguiente peldaño =================
  async _escalar(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;

    const est = await this.estado(d.project_id);
    est.pedidos = est.pedidos || {};
    const it = est.pedidos[d.pedido_id] || this._nuevo(d.pedido_id);
    it.plaza_id = it.plaza_id || d.plaza_id || d.project_id;

    // Ya se dijo «sin reparto»: repetirlo sería dos cancelaciones del mismo pedido.
    if (it.agotada) return null;

    const pedido = await this._pedidoDe(d.project_id, d.pedido_id);
    const zona = d.zona || pedido.zona || it.zona || null;
    const oferta = this._cents(it.oferta_cents) ?? this._cents(pedido.oferta_reparto_cents);
    it.zona = zona;
    it.oferta_cents = oferta;
    if (pedido.tienda_id) it.tienda_id = pedido.tienda_id;
    it.peldano = (it.peldano || 0) + 1;
    it.actualizado_en = this.ahora();

    // ── peldaño 1 · abrir a todos los activos de la zona, con la misma oferta ──
    if (it.peldano === 1) {
      est.pedidos[d.pedido_id] = it;
      await this.guardar(d.project_id);
      this.hecho('bocaos.escalada_peldano', {
        pedido_id: d.pedido_id,
        plaza_id: it.plaza_id,
        peldano: 1,
        segundos: PELDANO_TODOS_S,
        nuevo_tope: null,
        oferta_cents: oferta,
        zona,
        motivo: 'los dos candidatos se agotaron: se abre a todos los riders activos de la zona',
        razones: d.razones || []
      });
      return this._reintentar(it, d.pedido_id, { oferta_cents: oferta, zona, peldano: 1, todos: true });
    }

    // ── peldaños 2+ · subir la oferta, pero sólo hasta el tope que el cliente autorizó ──
    // El tope puede llegar por bocaos.tarifa o venir ya con el pedido (si el bus se rehidrató).
    const tope = this._cents(it.tope_cents) ?? this._cents(pedido.tope_reparto_cents);
    if (tope === null) {
      return this._agotar(d, it, 'no hay tope autorizado por el cliente: sin permiso no se sube la oferta');
    }
    if (oferta !== null && oferta >= tope) {
      return this._agotar(d, it, 'la oferta ya está en el tope autorizado por el cliente');
    }

    const escalones_max = Number.isFinite(it.escalones_max) ? it.escalones_max : this.escalones_max;
    if (it.peldano > 1 + escalones_max) {
      return this._agotar(d, it, 'se agotaron los escalones de la oferta');
    }

    const escalon = Number.isFinite(it.escalon_cents) ? it.escalon_cents : this.escalon_cents;
    // Sin oferta de partida, el primer escalón es el tope: no se inventa un punto intermedio.
    const nuevo_tope = oferta === null ? tope : Math.min(tope, oferta + escalon);
    it.oferta_cents = nuevo_tope;
    est.pedidos[d.pedido_id] = it;
    await this.guardar(d.project_id);

    this.hecho('bocaos.escalada_peldano', {
      pedido_id: d.pedido_id,
      plaza_id: it.plaza_id,
      peldano: it.peldano,
      segundos: PELDANO_TODOS_S,
      nuevo_tope,
      oferta_cents: oferta,
      tope_cents: tope,
      zona,
      motivo: `sube la oferta ${oferta === null ? '' : `${oferta} → `}${nuevo_tope} c€ dentro del tope autorizado`,
      razones: d.razones || []
    });
    return this._reintentar(it, d.pedido_id, { oferta_cents: nuevo_tope, zona, peldano: it.peldano, todos: true });
  }

  // El enlace vuelve a medir. `excluir` va vacío: el peldaño abre el mercado, no lo cierra.
  _reintentar(it, pedido_id, { oferta_cents, zona, peldano, todos }) {
    this.hecho('bocaos.escalada_reintentar', {
      pedido_id,
      plaza_id: it.plaza_id,
      tienda_id: it.tienda_id || null,
      peldano,
      oferta_cents: oferta_cents ?? null,
      zona: zona ?? null,
      excluir: [],
      todos: !!todos
    });
    return null;
  }

  async _agotar(d, it, motivo) {
    it.agotada = true;
    it.motivo_agotado = motivo;
    it.actualizado_en = this.ahora();
    const est = await this.estado(d.project_id);
    est.pedidos = est.pedidos || {};
    est.pedidos[d.pedido_id] = it;
    await this.guardar(d.project_id);

    this.hecho('bocaos.escalada_agotada', {
      pedido_id: d.pedido_id,
      plaza_id: it.plaza_id,
      peldano: it.peldano,
      motivo,
      oferta_cents: it.oferta_cents ?? null,
      tope_cents: it.tope_cents ?? null,
      zona: it.zona || null,
      razones: d.razones || [],
      huecos: d.huecos || []
    });

    const carga = {
      pedido_id: d.pedido_id,
      plaza_id: it.plaza_id,
      tienda_id: it.tienda_id || null,
      motivo,
      peldano: it.peldano,
      oferta_cents: it.oferta_cents ?? null,
      tope_cents: it.tope_cents ?? null,
      razones: d.razones || []
    };
    this.hecho('bocaos.pedido_sin_reparto', carga);

    // Cancelación explícita: se PIDE al custodio del pedido. Si no contesta, el hecho queda
    // como prueba y el pedido no se cancela por la espalda de su registro.
    try {
      const r = await this._rpc('pedido.cancelar.request', {
        project_id: d.project_id, pedido_id: d.pedido_id, rol: 'plaza', motivo: `sin reparto: ${motivo}`
      }, { timeout_ms: 800 });
      if (r && typeof r.status === 'number' && r.status >= 400) {
        this.logger?.warn('escalada-enlace.cancelacion_no_aplicada', {
          pedido_id: d.pedido_id, code: r.error?.code
        });
      }
    } catch (_) { /* el hecho ya está publicado */ }
    return null;
  }

  // ================= utilidades =================
  _nuevo(pedido_id) {
    return {
      pedido_id,
      plaza_id: this.plaza_id,
      peldano: 0,
      oferta_cents: null,
      tope_cents: null,
      escalon_cents: this.escalon_cents,
      escalones_max: this.escalones_max,
      zona: null,
      tienda_id: null,
      agotada: false,
      creado_en: this.ahora(),
      actualizado_en: this.ahora()
    };
  }

  _cents(v) {
    return Number.isInteger(v) && v >= 0 ? v : null;
  }

  async _pedidoDe(project_id, pedido_id) {
    try {
      const r = await this._rpc('pedido.de.request', { project_id, pedido_id }, { timeout_ms: TIMEOUT_BUS_MS });
      const p = r?.data?.pedido;
      return p && typeof p === 'object' ? p : {};
    } catch (_) {
      return {};
    }
  }
}

module.exports = EscaladaEnlace;
module.exports.PELDANO_TODOS_S = PELDANO_TODOS_S;
module.exports.ESCALON_CENTS = ESCALON_CENTS;
module.exports.ESCALONES_MAX = ESCALONES_MAX;
