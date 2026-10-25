'use strict';

/**
 * Conciliación SumUp — el órgano que cierra el círculo con la pasarela.
 *
 * El barrido de pago-gateway responde a "¿este checkout que YO abrí se pagó?".
 * Este órgano responde a la pregunta que el barrido NO puede: "¿qué ha pasado en la
 * cuenta de SumUp que yo no sé?". Son dos huecos distintos y el segundo cuesta dinero:
 *
 *   1. Reembolsos y contracargos hechos DESDE EL PANEL de SumUp. Hoy el sistema no se
 *      enteraría: el pedido sigue "confirmado" y el dinero ya no está.
 *   2. Cobros que entran sin casar con ningún pedido nuestro (link pagado dos veces,
 *      enlace compartido, prueba en producción): dinero cobrado, negocio sin enterarse.
 *   3. La comisión REAL y la liquidación del día. SumUp cobra 1,95% teórico, pero lo que
 *      ingresa en el banco es bruto − fee − deducciones, y esos números solo salen de
 *      /v1.0/merchants/{mc}/payouts. Sin esto el dueño no puede cuadrar la caja.
 *
 * Diseño (los tres pilares):
 *   - CURSOR INCREMENTAL, no ventana móvil. `changes_since` de /v2.1/transactions/history
 *     devuelve lo MODIFICADO desde un instante, incluidos pagos viejos que cambiaron de
 *     estado. Se avanza SOLO tras un tick completo y sin error: si el proceso muere a
 *     mitad, se re-lee la misma ventana (idempotente por `vistos`).
 *   - DEDUPE DURABLE. `vistos` = claves `TIPO:transaction_id` en disco, con tope. Un
 *     contracargo no se emite dos veces aunque se re-lea la ventana tres veces.
 *   - NADA SE INVENTA. Si no hay credencial, merchant o red, no se avanza el cursor y se
 *     deja constancia en `ultimo_error`. Una conciliación que miente es peor que no tenerla.
 *
 * Pseudocódigo:
 *   tick():
 *     para proyecto en proyectos:
 *       historial(proyecto)   // cambios de la cuenta → pago.reembolsado / pago.contracargo / cobro.huerfano
 *       payouts(proyecto)     // liquidación del día  → cobro.liquidado (bruto, fee real, neto)
 *
 *   historial(p):
 *     items ← GET history?changes_since=cursor&payment_types[]=ECOM  (paginado por links)
 *     para item en items:
 *       si clave(item) ∈ vistos: continuar
 *       casar item con el libro por transaction_id / transaction_code
 *       emitir lo que corresponda (nunca confirmar pagos: eso es del webhook/barrido)
 *       vistos += clave(item)
 *     cursor ← max(timestamp de items) − margen, o ahora − margen
 *     guardar estado
 *
 *   payouts(p):
 *     para fecha en [payouts_hasta … ayer]:
 *       registros ← GET /v1.0/merchants/{mc}/payouts?start_date&end_date
 *       emitir cobro.liquidado { bruto, comision, deducciones, neto }
 *     payouts_hasta ← ayer + 1
 */

const crypto = require('crypto');

const MARGEN_CURSOR_MS = 120000;          // 2 min de solape: changes_since es por timestamp de cambio
const VISTOS_MAX = 1000;
const PAGINAS_MAX = 5;                   // techo por tick: no quemar cuota si hay histórico atrás
const PAYOUTS_DIAS_MAX = 7;              // un solo tick nunca pide más de una semana

class ConciliacionSumUp {
  /**
   * @param {object} deps  todo inyectado (no conoce el bus ni el fs: se los da el módulo)
   *   cfg()                 → { merchant, moneda, provider }
   *   resolveCred(provider)→ { api_key } | { error }
   *   call(method, path, o)→ { ok, status, data, text, network, code }
   *   cargarLibro(pid)      → { checkouts: { id: entry } } | null
   *   buscarTx(pid, ids)    → entry | null     (por transaction_id o transaction_code)
   *   marcar(pid, cid, p)   → void
   *   leerEstado(pid)       → { history_cursor, payouts_hasta, vistos[] } | null
   *   guardarEstado(pid, e) → void
   *   publicar(ev, payload)
   *   logger, metrics
   */
  constructor(deps) {
    this.d = deps;
    this._corriendo = false;
  }

  // ── estado durable por proyecto ──
  async _estado(project_id) {
    const leido = await this.d.leerEstado(project_id);
    const e = leido && typeof leido === 'object' ? leido : {};
    if (!Array.isArray(e.vistos)) e.vistos = [];
    return e;
  }

  _clave(item) {
    return `${item?.type || 'PAYMENT'}:${item?.transaction_id || item?.transaction_code || ''}`;
  }

  _yaVisto(estado, clave) {
    return estado.vistos.includes(clave);
  }

  _apuntar(estado, clave) {
    estado.vistos.push(clave);
    if (estado.vistos.length > VISTOS_MAX) estado.vistos.splice(0, estado.vistos.length - VISTOS_MAX);
  }

  // ── el tick completo: historial + liquidación, por proyecto ──
  async tick(proyectos = []) {
    if (this._corriendo) return { saltado: 'en_curso' };
    this._corriendo = true;
    const resumen = { proyectos: 0, historial: 0, liquidaciones: 0, errores: 0 };
    try {
      for (const p of proyectos) {
        if (!p?.id) continue;
        resumen.proyectos++;
        try {
          const a = await this.historial(p);
          if (a?.ok) resumen.historial += a.emitidos || 0; else if (a?.error) resumen.errores++;
          const b = await this.payouts(p);
          if (b?.ok) resumen.liquidaciones += b.emitidos || 0; else if (b?.error) resumen.errores++;
          // El error visible es el de cualquiera de los dos trabajos: uno puede ir bien y el
          // otro no, y borrar el del primero con el éxito del segundo es mentir en el estado.
          const est = await this._estado(p.id);
          est.ultimo_error = est.error_historial || est.error_payouts || null;
          await this.d.guardarEstado(p.id, est);
        } catch (err) {
          resumen.errores++;
          this.d.logger?.warn('pago-gateway.conciliacion.error', { project_id: p.id, error: err.message });
        }
      }
    } finally { this._corriendo = false; }
    this.d.metrics?.increment?.('pago.conciliacion.tick', { errores: resumen.errores });
    return resumen;
  }

  async _credencial() {
    const cfg = this.d.cfg() || {};
    if (!cfg.merchant) return { error: 'sin merchant_code' };
    const cred = await this.d.resolveCred(cfg.provider || 'SUMUP');
    if (cred?.error) return { error: cred.error };
    return { api_key: cred.api_key, merchant: cfg.merchant, cfg };
  }

  // ── 1. HISTORIAL INCREMENTAL: reembolsos, contracargos y cobros sin casar ──
  async historial({ id: project_id, slug } = {}) {
    if (!project_id) return { error: 'sin proyecto' };
    const cred = await this._credencial();
    if (cred.error) return { error: cred.error };

    const estado = await this._estado(project_id);
    const ahora = Date.now();
    const desde = estado.history_cursor
      ? estado.history_cursor
      : new Date(ahora - 7 * 24 * 3600 * 1000).toISOString();   // primera vez: 7 días atrás

    let url = `/v2.1/merchants/${encodeURIComponent(cred.merchant)}/transactions/history`
      + `?changes_since=${encodeURIComponent(desde)}`
      + `&payment_types[]=ECOM`                                  // solo online: el datáfono es otro carril
      + `&limit=100&order=ascending`;

    const items = [];
    let paginas = 0;
    while (url && paginas < PAGINAS_MAX) {
      const r = await this.d.call('GET', url, { api_key: cred.api_key });
      if (!r.ok) {
        // No se avanza el cursor: la ventana se re-leerá entera en el próximo tick.
        estado.error_historial = `history ${r.status || r.code}: ${r?.data?.message || r?.message || ''}`.trim();
        estado.ultimo_error = estado.error_historial;
        estado.ultimo_tick = new Date().toISOString();
        await this.d.guardarEstado(project_id, estado);
        this.d.logger?.warn('pago-gateway.conciliacion.history_failed', { project_id, status: r.status, code: r.code });
        return { error: estado.error_historial };
      }
      const lote = Array.isArray(r.data?.items) ? r.data.items : [];
      items.push(...lote);
      const siguiente = this._siguientePagina(r.data?.links);
      url = siguiente && lote.length ? siguiente.replace('https://api.sumup.com', '') : null;
      paginas++;
    }

    let emitidos = 0;
    for (const item of items) {
      if (!item || !item.transaction_id) continue;
      const clave = this._clave(item);
      if (this._yaVisto(estado, clave)) continue;

      const entry = await this.d.buscarTx(project_id, {
        transaction_id: item.transaction_id, transaction_code: item.transaction_code
      });

      if (item.type === 'CHARGE_BACK') {
        await this.d.publicar('pago.contracargo', {
          pedido_id: entry?.pedido_id || null,
          project_slug: entry?.project_slug || slug || null,
          transaction_id: item.transaction_id,
          transaction_code: item.transaction_code || null,
          monto_centimos: this._cent(item.amount),
          moneda: item.currency || null,
          estado: item.status || null,
          pasarela: 'sumup-checkout', origen: 'conciliacion',
          correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
        });
        if (entry?.checkout_id) await this.d.marcar(project_id, entry.checkout_id, { estado: 'contracargo' });
        emitidos++;
      } else if (item.type === 'REFUND') {
        await this.d.publicar('pago.reembolsado', {
          pedido_id: entry?.pedido_id || null,
          session_id: entry?.checkout_id || null,
          transaction_id: item.transaction_id,
          monto_centimos: this._cent(item.amount),
          total_reembolsado_centimos: this._cent(item.refunded_amount) || null,
          completo: !!entry?.monto_centimos && this._cent(item.refunded_amount) >= entry.monto_centimos,
          pasarela: 'sumup-checkout', origen: 'conciliacion',
          correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
        });
        emitidos++;
      } else if (item.type === 'PAYMENT') {
        // (a) dinero cobrado que no casa con ningún pedido nuestro
        if (!entry && item.status === 'SUCCESSFUL') {
          await this.d.publicar('cobro.huerfano', {
            transaction_id: item.transaction_id, transaction_code: item.transaction_code || null,
            monto_centimos: this._cent(item.amount), moneda: item.currency || null,
            fecha: item.timestamp || null, payout_date: item.payout_date || null,
            pasarela: 'sumup-checkout', origen: 'conciliacion', project_slug: slug || null,
            correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
          });
          emitidos++;
        }
        // (b) reembolso hecho FUERA del sistema: el refunded_amount de SumUp supera lo que
        //     tenemos apuntado. Se emite solo la diferencia (nunca el total: se duplicaría).
        if (entry) {
          const devueltoSumup = this._cent(item.refunded_amount) || 0;
          const devueltoNuestro = (entry.reembolsos || []).reduce((s, x) => s + (Number(x.monto_centimos) || 0), 0);
          if (devueltoSumup > devueltoNuestro) {
            const diferencia = devueltoSumup - devueltoNuestro;
            await this.d.publicar('pago.reembolsado', {
              pedido_id: entry.pedido_id || null, session_id: entry.checkout_id || null,
              transaction_id: entry.transaction_id || item.transaction_id,
              monto_centimos: diferencia,
              total_reembolsado_centimos: devueltoSumup,
              completo: !!entry.monto_centimos && devueltoSumup >= entry.monto_centimos,
              pasarela: 'sumup-checkout', origen: 'conciliacion',
              correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
            });
            await this.d.marcar(project_id, entry.checkout_id, {
              reembolsos: [...(entry.reembolsos || []), { monto_centimos: diferencia, at: new Date().toISOString(), origen: 'conciliacion' }],
              estado: (entry.monto_centimos && devueltoSumup >= entry.monto_centimos) ? 'reembolsado' : entry.estado
            });
            emitidos++;
          }
        }
      }
      this._apuntar(estado, clave);
    }

    // El cursor avanza a lo más nuevo visto, con margen de solape (changes_since es por
    // timestamp de CAMBIO, y un pago puede cambiar de estado justo mientras leemos).
    const masNuevo = items.reduce((max, it) => {
      const t = it?.timestamp ? Date.parse(it.timestamp) : NaN;
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    const siguiente = Math.max(masNuevo, ahora) - MARGEN_CURSOR_MS;
    estado.history_cursor = new Date(siguiente).toISOString();
    estado.ultimo_tick = new Date().toISOString();
    estado.error_historial = null;
    estado.emitidos_ultimo_tick = emitidos;
    await this.d.guardarEstado(project_id, estado);

    return { ok: true, emitidos, items: items.length, cursor: estado.history_cursor };
  }

  // ── 2. LIQUIDACIÓN: la comisión REAL y lo que entra en el banco ──
  async payouts({ id: project_id, slug } = {}) {
    if (!project_id) return { error: 'sin proyecto' };
    const cred = await this._credencial();
    if (cred.error) return { error: cred.error };

    const estado = await this._estado(project_id);
    const hoy = new Date();
    const ayer = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - 1));
    const hasta = ayer.toISOString().slice(0, 10);                  // solo días cerrados
    const desdeDefault = new Date(ayer.getTime() - (PAYOUTS_DIAS_MAX - 1) * 86400000).toISOString().slice(0, 10);
    let desde = estado.payouts_hasta || desdeDefault;
    if (desde > hasta) return { ok: true, emitidos: 0, motivo: 'al_dia' };

    // Un tick nunca pide más de PAYOUTS_DIAS_MAX días: se pone al día en varios ticks.
    const desdeTope = new Date(Date.parse(hasta) - (PAYOUTS_DIAS_MAX - 1) * 86400000).toISOString().slice(0, 10);
    if (desde < desdeTope) desde = desdeTope;

    const r = await this.d.call('GET',
      `/v1.0/merchants/${encodeURIComponent(cred.merchant)}/payouts`
      + `?start_date=${desde}&end_date=${hasta}&format=json&limit=100&order=asc`,
      { api_key: cred.api_key });
    if (!r.ok) {
      estado.error_payouts = `payouts ${r.status || r.code}`;
      estado.ultimo_error = estado.error_historial || estado.error_payouts;
      await this.d.guardarEstado(project_id, estado);
      return { error: estado.error_payouts };
    }

    const registros = Array.isArray(r.data) ? r.data : (r.data?.items || []);
    const porFecha = new Map();
    for (const p of registros) {
      if (!p?.date) continue;
      const acc = porFecha.get(p.date) || { bruto: 0, comision: 0, deducciones: 0, n: 0, moneda: p.currency || null };
      const c = this._cent(p.amount) || 0;
      const fee = this._cent(p.fee) || 0;
      if (p.type === 'PAYOUT') {
        if (p.status === 'SUCCESSFUL') { acc.bruto += c; acc.n++; }
        acc.comision += fee;
      } else {
        // CHARGE_BACK_DEDUCTION · REFUND_DEDUCTION · DD_RETURN_DEDUCTION · BALANCE_DEDUCTION
        acc.deducciones += c;
        acc.n++;
      }
      porFecha.set(p.date, acc);
    }

    let emitidos = 0;
    for (const [fecha, acc] of [...porFecha.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      await this.d.publicar('cobro.liquidado', {
        fecha, project_slug: slug || null,
        bruto_centimos: acc.bruto,
        comision_centimos: acc.comision,
        deducciones_centimos: acc.deducciones,
        neto_centimos: acc.bruto - acc.deducciones,
        moneda: acc.moneda, registros: acc.n,
        pasarela: 'sumup-checkout', origen: 'conciliacion',
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      emitidos++;
    }

    estado.payouts_hasta = new Date(Date.parse(hasta) + 86400000).toISOString().slice(0, 10);
    estado.ultimo_tick = new Date().toISOString();
    estado.error_payouts = null;
    estado.liquidaciones_ultimo_tick = emitidos;
    await this.d.guardarEstado(project_id, estado);
    return { ok: true, emitidos, desde, hasta };
  }

  _siguientePagina(links) {
    if (!Array.isArray(links)) return null;
    const next = links.find(l => String(l?.rel || '').toLowerCase() === 'next');
    return next?.href || null;
  }

  _cent(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
}

module.exports = ConciliacionSumUp;
