'use strict';

/**
 * Conciliación Stripe — el órgano que cierra el círculo con la cuenta de Stripe.
 *
 * El barrido de pago-gateway responde a "¿esta sesión que YO abrí se pagó?". Este órgano
 * responde a la pregunta que el barrido NO puede: "¿qué ha pasado en la cuenta de Stripe
 * que yo no sé?". Son dos huecos distintos y los dos cuestan dinero:
 *
 *   1. Reembolsos hechos DESDE EL PANEL de Stripe. Sin esto, el pedido sigue "confirmado"
 *      y el dinero ya no está: el negocio se entera al cuadrar la caja del mes.
 *   2. Cobros que entran sin casar con ningún pedido nuestro (enlace compartido, pagado dos
 *      veces, prueba en producción): dinero cobrado, negocio sin enterarse.
 *   3. La comisión REAL. Stripe cobra 1,5 % + 0,25 € teórico, pero lo que llega al banco es
 *      bruto − fee: eso solo sale de /v1/balance_transactions, no de la sesión de checkout.
 *
 * Diseño (los mismos tres pilares que el conciliador de SumUp, adaptados a Stripe):
 *   - CURSOR INCREMENTAL por fecha de creación (`created[gte]`), no ventana móvil. Se avanza
 *     SOLO tras un tick completo y sin error: si el proceso muere a mitad, se re-lee la misma
 *     ventana y el dedupe impide duplicar eventos.
 *   - DEDUPE DURABLE en `/pago/conciliacion.json` (`vistos[]`, claves `STRIPE_SESION:cs_…`,
 *     `STRIPE_REFUND:re_…`, `STRIPE_LIQ:YYYY-MM-DD`). Un reembolso no se emite dos veces.
 *   - NADA SE INVENTA. Sin credencial, sin permiso (403) o sin red, no se avanza el cursor y
 *     se deja `ultimo_error`. Una conciliación que miente es peor que no tenerla.
 *
 * Lo que NO hace, y se dice: no CONFIRMA pagos (eso es del webhook y del barrido — aquí solo
 * se detecta lo que no cuadra) y no convierte divisas (los importes llegan en su moneda).
 *
 * Permisos que pide (API key restringida):
 *   - Checkout Sessions · Lectura → listar sesiones pagadas (cobros huérfanos)
 *   - Refunds · Lectura           → reembolsos hechos en el panel
 *   - Balance · Lectura           → comisión real por cargo (opcional: sin él, `comisiones`
 *                                   se salta con aviso y el resto sigue trabajando)
 */

const crypto = require('crypto');

const MARGEN_CURSOR_MS = 120000;      // 2 min de solape: created[gte] es por reloj del servidor
const VISTOS_MAX = 1000;
const PAGINAS_MAX = 3;                // techo por tick: no quemar cuota si hay histórico atrás
const DIAS_COMISION_MAX = 3;          // un tick nunca cierra más de 3 días de comisiones
const PRIMERA_VENTANA_DIAS = 7;       // primera vez: una semana atrás

class ConciliacionStripe {
  /**
   * @param {object} deps  todo inyectado (no conoce el bus ni el fs: se los da el módulo)
   *   cfg()                 → { provider, moneda }
   *   resolveCred(p, pid)   → { api_key } | { error }
   *   call(method, path, o) → { ok, status, data, network, code }
   *   buscarSesion(pid, {checkout_id, referencia}) → entry | null
   *   buscarTx(pid, {transaction_id})              → entry | null
   *   marcar(pid, cid, p)   → void
   *   leerEstado(pid)       → { stripe_cursor, stripe_comision_hasta, vistos[] } | null
   *   guardarEstado(pid,e)  → void
   *   publicar(ev, payload)
   *   kind(pid)             → 'stripe-checkout' | 'sumup-checkout' | null
   *   logger, metrics
   */
  constructor(deps) {
    this.d = deps;
    this._corriendo = false;
  }

  async _estado(project_id) {
    const leido = await this.d.leerEstado(project_id);
    const e = leido && typeof leido === 'object' ? leido : {};
    if (!Array.isArray(e.vistos)) e.vistos = [];
    return e;
  }

  _yaVisto(estado, clave) { return estado.vistos.includes(clave); }

  _apuntar(estado, clave) {
    estado.vistos.push(clave);
    if (estado.vistos.length > VISTOS_MAX) estado.vistos.splice(0, estado.vistos.length - VISTOS_MAX);
  }

  async tick(proyectos = []) {
    if (this._corriendo) return { saltado: 'en_curso' };
    this._corriendo = true;
    const resumen = { proyectos: 0, historial: 0, comisiones: 0, errores: 0, saltados: 0 };
    try {
      for (const p of proyectos) {
        if (!p?.id) continue;
        const kind = this.d.kind ? this.d.kind(p.id) : 'stripe-checkout';
        if (kind !== 'stripe-checkout') { resumen.saltados++; continue; }
        resumen.proyectos++;
        try {
          const a = await this.historial(p);
          if (a?.ok) resumen.historial += a.emitidos || 0; else if (a?.error) resumen.errores++;
          const b = await this.comisiones(p);
          if (b?.ok) resumen.comisiones += b.emitidos || 0; else if (b?.error) resumen.errores++;
          const est = await this._estado(p.id);
          est.ultimo_error = est.error_historial || est.error_comisiones || null;
          await this.d.guardarEstado(p.id, est);
        } catch (err) {
          resumen.errores++;
          this.d.logger?.warn('pago-gateway.stripe.conciliacion.error', { project_id: p.id, error: err.message });
        }
      }
    } finally {
      this._corriendo = false;
    }
    this.d.metrics?.increment?.('pago.stripe.conciliacion.tick', { errores: resumen.errores });
    return resumen;
  }

  async _credencial(project_id = null) {
    const cfg = this.d.cfg(project_id) || {};
    const cred = await this.d.resolveCred(cfg.provider || 'STRIPE', project_id);
    if (cred?.error) return { error: cred.error };
    return { api_key: cred.api_key, cfg };
  }

  // ── 1. HISTORIAL: cobros sin pedido y reembolsos hechos fuera del sistema ──
  async historial({ id: project_id, slug } = {}) {
    if (!project_id) return { error: 'sin proyecto' };
    const cred = await this._credencial(project_id);
    if (cred.error) return { error: cred.error };

    const estado = await this._estado(project_id);
    const ahora = Date.now();
    const desde = estado.stripe_cursor
      ? Date.parse(estado.stripe_cursor)
      : ahora - PRIMERA_VENTANA_DIAS * 24 * 3600 * 1000;
    const desdeSeg = Math.floor((Number.isFinite(desde) ? desde : ahora - PRIMERA_VENTANA_DIAS * 86400000) / 1000);

    let emitidos = 0;
    let fallo = null;

    // ── (a) sesiones PAGADAS que no casan con ningún pedido nuestro ──
    //   Solo se emite el huérfano. Confirmar un pago NO es trabajo de la conciliación:
    //   si la sesión está en el libro pero sin confirmar, la cierra el barrido.
    const sesiones = [];
    let url = `/v1/checkout/sessions?payment_status=paid&created%5Bgte%5D=${desdeSeg}&limit=100`;
    let paginas = 0;
    while (url && paginas < PAGINAS_MAX) {
      const r = await this.d.call('GET', url, { api_key: cred.api_key });
      if (!r.ok) { fallo = `sessions ${r.status || r.code}${r.status === 403 ? ' (falta permiso Checkout Sessions · Lectura)' : ''}`; break; }
      const lote = Array.isArray(r.data?.data) ? r.data.data : [];
      sesiones.push(...lote);
      const ultima = lote[lote.length - 1]?.id;
      url = (r.data?.has_more && ultima)
        ? `/v1/checkout/sessions?payment_status=paid&created%5Bgte%5D=${desdeSeg}&limit=100&starting_after=${encodeURIComponent(ultima)}`
        : null;
      paginas++;
    }

    let masNuevo = 0;
    for (const s of sesiones) {
      const t = Number(s?.created) * 1000;
      if (Number.isFinite(t) && t > masNuevo) masNuevo = t;
      if (!s?.id) continue;
      const clave = `STRIPE_SESION:${s.id}`;
      if (this._yaVisto(estado, clave)) continue;

      const ref = s.metadata?.referencia || s.metadata?.pedido_id || s.client_reference_id || null;
      const entry = await this.d.buscarSesion(project_id, { checkout_id: s.id, referencia: ref });
      if (!entry) {
        await this.d.publicar('cobro.huerfano', {
          transaction_id: s.payment_intent || null,
          transaction_code: null,
          session_id: s.id,
          referencia: ref,
          monto_centimos: Number.isFinite(Number(s.amount_total)) ? Number(s.amount_total) : null,
          moneda: s.currency ? String(s.currency).toUpperCase() : null,
          fecha: s.created ? new Date(s.created * 1000).toISOString() : null,
          payout_date: null,
          project_id,
          pasarela: 'stripe-checkout', origen: 'conciliacion', project_slug: slug || null,
          correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
        });
        emitidos++;
      }
      this._apuntar(estado, clave);
    }

    // ── (b) reembolsos: los del panel y los nuestros se ven igual desde aquí ──
    //   Dedupe por `refund_id`, que quedó apuntado en la fila del libro al reembolsar.
    //   Así un reembolso hecho por API no se vuelve a emitir (nunca el total: la diferencia).
    const reembolsos = [];
    url = `/v1/refunds?created%5Bgte%5D=${desdeSeg}&limit=100`;
    paginas = 0;
    while (url && paginas < PAGINAS_MAX) {
      const r = await this.d.call('GET', url, { api_key: cred.api_key });
      if (!r.ok) { fallo = fallo || `refunds ${r.status || r.code}${r.status === 403 ? ' (falta permiso Refunds · Lectura)' : ''}`; break; }
      const lote = Array.isArray(r.data?.data) ? r.data.data : [];
      reembolsos.push(...lote);
      const ultimo = lote[lote.length - 1]?.id;
      url = (r.data?.has_more && ultimo)
        ? `/v1/refunds?created%5Bgte%5D=${desdeSeg}&limit=100&starting_after=${encodeURIComponent(ultimo)}`
        : null;
      paginas++;
    }

    for (const rf of reembolsos) {
      if (!rf?.id) continue;
      const t = Number(rf.created) * 1000;
      if (Number.isFinite(t) && t > masNuevo) masNuevo = t;
      if (rf.status !== 'succeeded' && rf.status !== 'pending') continue;   // failed/canceled: no salió dinero
      const clave = `STRIPE_REFUND:${rf.id}`;
      if (this._yaVisto(estado, clave)) continue;

      const entry = await this.d.buscarTx(project_id, { transaction_id: rf.payment_intent });
      if (!entry) {
        // Reembolso de un cobro que no es nuestro: lo caza el huérfano de arriba, no se duplica.
        this._apuntar(estado, clave);
        continue;
      }
      const ya = (entry.reembolsos || []).some(x => x.refund_id === rf.id);
      if (!ya) {
        const monto = Number.isFinite(Number(rf.amount)) ? Number(rf.amount) : 0;
        const devueltoAntes = (entry.reembolsos || []).reduce((s, x) => s + (Number(x.monto_centimos) || 0), 0);
        const total = devueltoAntes + monto;
        const completo = !!entry.monto_centimos && total >= entry.monto_centimos;
        await this.d.publicar('pago.reembolsado', {
          referencia: entry.referencia || entry.pedido_id || null,
          pedido_id: entry.referencia || entry.pedido_id || null,
          session_id: entry.checkout_id || null,
          transaction_id: rf.payment_intent || entry.transaction_id || null,
          refund_id: rf.id,
          monto_centimos: monto,
          total_reembolsado_centimos: total,
          completo,
          pasarela: 'stripe-checkout', origen: 'conciliacion',
          correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
        });
        await this.d.marcar(project_id, entry.checkout_id, {
          reembolsos: [...(entry.reembolsos || []), { monto_centimos: monto, at: new Date().toISOString(), refund_id: rf.id, origen: 'conciliacion' }],
          estado: completo ? 'reembolsado' : entry.estado
        });
        emitidos++;
      }
      this._apuntar(estado, clave);
    }

    // El cursor avanza a lo más nuevo visto, con margen de solape (created es por segundo).
    if (!fallo) {
      estado.stripe_cursor = new Date(Math.max(masNuevo, ahora) - MARGEN_CURSOR_MS).toISOString();
      estado.error_historial = null;
    } else {
      estado.error_historial = fallo;
    }
    estado.ultimo_tick = new Date().toISOString();
    estado.emitidos_ultimo_tick = emitidos;
    await this.d.guardarEstado(project_id, estado);
    this.d.metrics?.increment?.('pago.stripe.conciliacion.historial', { emitidos, error: fallo ? 1 : 0 });
    return fallo ? { error: fallo } : { ok: true, emitidos, sesiones: sesiones.length, reembolsos: reembolsos.length, cursor: estado.stripe_cursor };
  }

  // ── 2. COMISIONES: lo que Stripe se queda de verdad ──
  //   La sesión de checkout no trae la comisión; el balance transaction sí (amount/fee/net).
  //   Se cierra por DÍAS CERRADOS: el día en curso todavía se está moviendo.
  async comisiones({ id: project_id, slug } = {}) {
    if (!project_id) return { error: 'sin proyecto' };
    const cred = await this._credencial(project_id);
    if (cred.error) return { error: cred.error };

    const estado = await this._estado(project_id);
    const hoy = new Date();
    const ayer = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 1));
    const hasta = ayer.toISOString().slice(0, 10);                       // solo días cerrados
    const desdeDefault = new Date(ayer.getTime() - (DIAS_COMISION_MAX - 1) * 86400000).toISOString().slice(0, 10);
    let desde = estado.stripe_comision_hasta || desdeDefault;
    if (desde > hasta) return { ok: true, emitidos: 0, motivo: 'al_dia' };
    const desdeTope = new Date(Date.parse(hasta) - (DIAS_COMISION_MAX - 1) * 86400000).toISOString().slice(0, 10);
    if (desde < desdeTope) desde = desdeTope;

    const desdeSeg = Math.floor(Date.parse(desde + 'T00:00:00Z') / 1000);
    const hastaSeg = Math.floor((Date.parse(hasta + 'T00:00:00Z') + 86399) / 1000);
    const r = await this.d.call('GET',
      `/v1/balance_transactions?created%5Bgte%5D=${desdeSeg}&created%5Blte%5D=${hastaSeg}&type=charge&limit=100`,
      { api_key: cred.api_key });
    if (!r.ok) {
      // 403 = la clave no tiene Balance · Lectura. No se avanza el cursor: cuando se añada
      // el permiso, este mismo día se cierra sin hueco.
      estado.error_comisiones = `balance_transactions ${r.status || r.code}${r.status === 403 ? ' (falta permiso Balance · Lectura)' : ''}`;
      estado.ultimo_error = estado.error_historial || estado.error_comisiones;
      estado.ultimo_tick = new Date().toISOString();
      await this.d.guardarEstado(project_id, estado);
      return { error: estado.error_comisiones };
    }

    const items = Array.isArray(r.data?.data) ? r.data.data : [];
    const porFecha = new Map();
    for (const bt of items) {
      if (!bt?.created) continue;
      const fecha = new Date(bt.created * 1000).toISOString().slice(0, 10);
      const acc = porFecha.get(fecha) || { bruto: 0, comision: 0, neto: 0, n: 0, moneda: bt.currency ? String(bt.currency).toUpperCase() : null };
      acc.bruto += Number(bt.amount) || 0;
      acc.comision += Number(bt.fee) || 0;
      acc.neto += Number(bt.net) || 0;
      acc.n++;
      porFecha.set(fecha, acc);
    }

    let emitidos = 0;
    for (const [fecha, acc] of [...porFecha.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const clave = `STRIPE_LIQ:${fecha}`;
      if (this._yaVisto(estado, clave)) continue;
      await this.d.publicar('cobro.liquidado', {
        fecha, project_slug: slug || null,
        bruto_centimos: acc.bruto,
        comision_centimos: acc.comision,
        deducciones_centimos: 0,
        neto_centimos: acc.neto,
        moneda: acc.moneda, registros: acc.n,
        pasarela: 'stripe-checkout', origen: 'conciliacion',
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this._apuntar(estado, clave);
      emitidos++;
    }

    estado.stripe_comision_hasta = new Date(Date.parse(hasta) + 86400000).toISOString().slice(0, 10);
    estado.error_comisiones = null;
    estado.ultimo_tick = new Date().toISOString();
    estado.liquidaciones_ultimo_tick = emitidos;
    await this.d.guardarEstado(project_id, estado);
    this.d.metrics?.increment?.('pago.stripe.conciliacion.comisiones', { emitidos });
    return { ok: true, emitidos, desde, hasta, cargos: items.length };
  }
}

module.exports = ConciliacionStripe;
