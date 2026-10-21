/**
 * contabilidad-entrada/puerto-cobro-pos — PUENTE STATELESS (A15, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * EL CABLE DEL POS A LA CONTABILIDAD — la caja de hoy, al diario, al vuelo.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * ESCUCHA `cobro.procesado` (el evento VIVO que publica pizzepos/cobros al bus,
 * medido: 13 publicaciones en 30 días) y PUBLICA el hecho de dominio
 * `contabilidad.hecho_recibido` con el hecho derivado del cobro.
 *
 * Traduce y anuncia; NO escribe. La cadena YA VIVA hace el resto:
 *   contabilidad.hecho_recibido → normalizador-hecho (A2 homogeneiza)
 *   → escritor-diario (asienta, partida doble, append-only)
 *   → mayor-balanza (los saldos) → liquidación-iva (el fiscal).
 *
 * IDEMPOTENCIA: no se fabrica aquí — la garantiza la clave natural del diario
 * (referencia = cobro_id → un cobro = un asiento, aunque QoS entregue 2 veces).
 *
 * Invariante (honestidad): sin project_id o sin importe NO se anuncia nada
 * (dato ausente = desconocido, no se estima). El par de fallo cierra el círculo.
 *
 * R3 · ESCUCHA: `cobro.procesado` SÍ se declara — su emisor existe y está vivo
 * (modules/pizzepos/cobros/index.js:506). El RPC `cobrar` es PREGUNTA (bus):
 * traduce un cobro sin suscribirse — la cara del módulo es el bus.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A15 del plan-construccion y diseno-oop.md (CLASE PuertoCobroPos).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuertoCobroPos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-cobro-pos';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler de dominio: el cobro del POS llega por el bus → se anuncia el hecho ──
  onCobroProcesado(e) {
    const d = (e && (e.data || e)) || {};
    const res = this._cobrar({
      project_id: d.project_id,
      cobro_id: d.cobro_id,
      cuenta_id: d.cuenta_id,
      monto_total: d.monto_total,
      metodo_pago: d.metodo_pago,
      propina: d.propina,
      origen: d.origen || 'pizzepos'
    });
    if (res.status !== 200) {
      // Cobro sin lo esencial → par de fallo determinista (no se anuncia nada).
      this.eventBus?.publish('puerto-cobro-pos.cobrar.failed', res);
    }
    return res;
  }

  // ── handler RPC (PREGUNTA, por bus — su cara es el bus) ──
  onCobrarRequest(e) {
    return this._atender(e, 'cobrar', 'puerto-cobro-pos.cobrar.response', (d) => {
      const res = this._cobrar(d);
      if (res.status === 200) {
        // R2 · traduce y ESCRIBE al dominio (anuncia el hecho) → contabilidad lo escucha.
        this.eventBus?.publish('contabilidad.hecho_recibido', res.data.hecho_recibido);
      } else {
        this.eventBus?.publish('puerto-cobro-pos.cobrar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _cobrar(input) → { status, data }  ·  traduce el cobro a hecho contable
  // ══════════════════════════════════════════════════════════════════════
  _cobrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Sin cobro no hay hecho (dato ausente = desconocido — JAMÁS se estima).
    const monto = Number(input.monto_total);
    if (!Number.isFinite(monto) || monto === 0) return this._invalid('monto_total');
    const referencia = input.cobro_id != null ? String(input.cobro_id) : null;
    if (!referencia) return this._invalid('cobro_id');

    const metodo = input.metodo_pago != null ? String(input.metodo_pago) : null;
    const propina = Number.isFinite(Number(input.propina)) ? Number(input.propina) : 0;

    // El HECHO de dominio: la venta cobrada en el POS (forma canónica de la cadena).
    const hecho = {
      tipo: 'venta_cobro_pos',
      fecha: new Date().toISOString(),
      concepto: `Venta POS (${metodo || 'método sin declarar'})`,
      importe: Number(monto.toFixed(2)),
      moneda: 'EUR',
      referencia,               // ← la clave natural del diario (un cobro = un asiento)
      origen: input.origen != null ? String(input.origen) : 'pizzepos',
      metadatos: {
        cuenta_id: input.cuenta_id != null ? String(input.cuenta_id) : null,
        metodo_pago: metodo,
        propina
      }
    };

    const hecho_recibido = {
      project_id: pid,
      hecho,
      origen: hecho.origen,
      vertical: 'contabilidad',
      // El puente NO decide contrapartida ni IVA: eso lo hace la cadena
      // (regla-contrapartida aplica, perfil-administrativo declara los tipos).
      traduce: { de: 'cobro.procesado', a: 'contabilidad.hecho_recibido' },
      recibido_en: new Date().toISOString(),
      abierto: { contrapartida: null }
    };

    return { status: 200, data: { project_id: pid, recibido: true, hecho_recibido } };
  }

  // ── Tools ──
  toolCobrar(params) { return this._cobrar(params); }
}

module.exports = PuertoCobroPos;