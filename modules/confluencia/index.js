'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const { validarSchema } = require('../_shared/config-custodio');

// Estados canónicos de una línea de pedido contra el calendario.
const ESTADO = {
  CONFIRMADO: 'CONFIRMADO',           // día de salida + margen ok
  AJUSTADO: 'AJUSTADO',               // no sale ese día → día válido más cercano
  AJUSTADO_MARGEN: 'AJUSTADO_MARGEN', // margen insuficiente → fecha que cumple
  NO_DISPONIBLE: 'NO_DISPONIBLE'      // sin día válido en la ventana (honesto)
};

// Clasifica la respuesta de calendario.validar (H1) en un estado de confluencia.
const _clasificar = (res) => {
  if (!res) {
    return { estado: ESTADO.NO_DISPONIBLE, motivo: 'calendario no respondió (best-effort)' };
  }
  if (res.status === 404) {
    return { estado: ESTADO.NO_DISPONIBLE, motivo: res.message || 'sin calendario' };
  }
  const data = res.data || {};
  if (data.valido === true) {
    return { estado: ESTADO.CONFIRMADO, motivo: null, dia_semana: data.dia_semana || null };
  }
  const motivo = data.motivo || '';
  const noEsDia = motivo.includes('no sale');
  const esMargen = motivo.includes('margen');
  const propuesta = data.propuesta && data.propuesta.fecha ? data.propuesta.fecha : null;
  const base = { motivo, fecha_solicitada: data.fecha_deseada || null };
  if (!propuesta) {
    return { estado: ESTADO.NO_DISPONIBLE, ...base, motivo: 'sin día de salida en la ventana próxima' };
  }
  if (esMargen && !noEsDia) {
    return { estado: ESTADO.AJUSTADO_MARGEN, ...base, propuesta };
  }
  return { estado: ESTADO.AJUSTADO, ...base, propuesta };
};

// Resuelve UNA línea contra su calendario, consumiendo el RPC de H1 por el bus (sin duplicar).
const _resolverLinea = async (modulo, linea) => {
  const { producto_id, fecha_deseada, cantidad } = linea || {};
  if (!producto_id) return { producto_id: null, estado: ESTADO.NO_DISPONIBLE, motivo: 'producto_id requerido' };
  const res = await modulo._rpc('calendario.validar.request', { producto_id, fecha_deseada });
  return { producto_id, cantidad: cantidad ?? 1, fecha_deseada: fecha_deseada || null, ..._clasificar(res) };
};

// Mensaje honesto al cliente, en positivo (P0): qué se confirma, qué se ajusta, qué no hay.
const _mensajeCliente = (lines) => {
  const ok = lines.filter(l => l.estado === ESTADO.CONFIRMADO).length;
  const ajustadas = lines.filter(l => l.estado === ESTADO.AJUSTADO || l.estado === ESTADO.AJUSTADO_MARGEN);
  const noDisp = lines.filter(l => l.estado === ESTADO.NO_DISPONIBLE);
  const partes = [];
  if (ok) partes.push(`${ok} línea${ok > 1 ? 's' : ''} confirmada${ok > 1 ? 's' : ''} para su fecha`);
  if (ajustadas.length) {
    const dias = ajustadas.map(l => `${l.producto_id} → ${l.propuesta}`).join(', ');
    partes.push(`${ajustadas.length} ajustada${ajustadas.length > 1 ? 's' : ''}: ${dias}`);
  }
  if (noDisp.length) partes.push(`${noDisp.length} no disponible${noDisp.length > 1 ? 's' : ''} (${noDisp.map(l => l.producto_id).join(', ')})`);
  return partes.join(' · ') || 'Sin líneas resolubles.';
};

class ConfluenciaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'confluencia';
    this.version = 'reflejo-0.1.0';
  }

  // ================= RPC del bus (una línea por op — dispatch por id) =================
  onResolverPedidoRequest(e) { return this._atender(e, 'resolver_pedido', 'confluencia.resolver_pedido.response', d => this._resolverPedido(d)); }
  onValidarLineaRequest(e) { return this._atender(e, 'validar_linea', 'confluencia.validar_linea.response', d => this._validarLinea(d)); }

  // ================= proyecciones =================
  async _validarLinea(input) {
    const error = validarSchema({ producto_id: { tipo: 'string', requerido: true } }, input);
    if (error) return { status: 400, error: 'INVALID_INPUT', message: error.message, field: error.field };
    const linea = await _resolverLinea(this, input);
    return { status: 200, data: linea };
  }

  async _resolverPedido(input) {
    const lines = Array.isArray(input?.lines) ? input.lines : [];
    if (!lines.length) return { status: 400, error: 'INVALID_INPUT', message: 'lines requerido (array no vacío)', field: 'lines' };

    const resueltas = [];
    for (const linea of lines) {
      resueltas.push(await _resolverLinea(this, linea));
    }

    const resumen = resueltas.reduce((acc, l) => {
      acc[l.estado] = (acc[l.estado] || 0) + 1;
      return acc;
    }, {});

    const mensaje = _mensajeCliente(resueltas);

    // fire-and-forget: notifica el pedido resuelto al bus (lo capta propiocepción / portal).
    this.eventBus?.publish('confluencia.pedido_resuelto', { lines: resueltas, resumen, mensaje });

    return { status: 200, data: { lines: resueltas, resumen, mensaje } };
  }
}

module.exports = ConfluenciaReflejo;
