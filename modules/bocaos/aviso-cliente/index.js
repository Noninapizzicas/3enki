'use strict';

/**
 * aviso-cliente · PUENTE · TIENDA — C05 (EstadoCocinaVisible) + C06 (AvisoCliente) + K02 (GuardaMarcaAjena).
 *
 * EL ÚNICO CANAL DE BOCAOS HACIA EL CLIENTE FINAL. Y por eso el más delicado del negocio: si este
 * aviso se rompe, la tienda pierde la cara de SU cliente y culpa a Bocaos.
 *
 * Dos guardas que son el módulo:
 *
 *   1. EL CLIENTE VE CUATRO ESTADOS, NO EL INTERNO (C05). «Recibido · en cocina · en camino ·
 *      entregado». No ve «en cola», ni «sin rider», ni «esperando propuesta»: ve lo que le sirve
 *      para decidir si baja. Dos hechos que caen en el mismo estado no producen dos mensajes.
 *   2. NINGUNA COMUNICACIÓN LLEVA LA MARCA DE BOCAOS NI LA DE LA PLAZA (C06/K02). Ni el nombre, ni
 *      un enlace, ni un remitente reconocible, ni «powered by». Si la lleva, el aviso NO SALE: se
 *      emite `bocaos.aviso_rechazado` y se dice qué marca se encontró.
 *
 * El transporte es el de la tienda: `whatsapp.enviar` (sus TOOLS, no su copy). Su par honesto se
 * publica tal cual: `whatsapp.mensaje.enviado` o `whatsapp.envio.fallido` — y este último es
 * visible, no silencioso. Si el transporte falla, el hecho del pedido ya está escrito: el aviso es
 * transporte, no verdad.
 *
 * Sin store: no guarda nada. Lo que no viaja en el evento se PIDE al bus (`pedido.get` de
 * pizzepos es de la tienda, y el teléfono del cliente se queda allí: D05).
 *
 * Isla: cero require a otra isla.
 */

const ModuloBocaos = require('../_bocaos');

// C05 · los cuatro estados que el cliente ve. El resto del mundo no existe para él.
const ESTADOS = {
  recibido: 'Pedido recibido. Estamos preparándolo.',
  en_cocina: 'Tu pedido está en cocina. Te avisamos cuando salga.',
  en_camino: 'Tu pedido va en camino.',
  entregado: 'Pedido entregado. ¡Que aproveche!'
};

// K02 · la marca de Bocaos y la de la plaza no viajan al cliente final.
const MARCAS_FIJAS = ['bocaos', 'powered by', 'powered-by', 'impulsado por', 'una plaza de', 'bocaos.app'];

const TIMEOUT_ENVIO_MS = 5000;
const TIMEOUT_PEDIDO_MS = 3000;

class AvisoCliente extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'aviso-cliente';
    this.version = 'puente-0.1.0';
    this._path = null;              // sin estado: el pedido lo guarda su custodio
    this.marcas_vedadas = [];       // ampliable con el nombre de la plaza
    this._ultimo = new Map();       // pedido_id → último estado avisado (C05: no dos veces lo mismo)
    this._enVuelo = new Set();
  }

  onComponerRequest(e) { return this.servir(e, 'componer', 'aviso-cliente.componer', (d) => this._componer(d)); }

  // ================= hechos que escucha =================
  async onPedidoCreado(e) { return this._porHecho(e, 'recibido'); }
  async onPedidoAceptado(e) { return this._porHecho(e, 'en_cocina'); }
  async onPedidoListo(e) { return this._porHecho(e, 'en_cocina'); }
  async onContratoCreado(e) { return this._porHecho(e, 'en_cocina'); }
  async onHechoRepartoAnotado(e) {
    const d = this.datos(e);
    if (d.tipo === 'recogida') return this._porHecho(e, 'en_camino');
    if (d.tipo === 'entrega') return this._porHecho(e, 'entregado');
    return null;   // «espera» y «salida» no son estados del cliente
  }

  async _porHecho(e, estado) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    const r = await this._componer({
      project_id: d.project_id,
      pedido_id: d.pedido_id,
      tienda_id: d.tienda_id || d.project_slug || null,
      plaza_id: d.plaza_id || null,
      plaza_nombre: d.plaza_nombre || null,
      telefono: d.telefono || d.cliente_telefono || null,
      estado
    });
    if (r.status >= 400) {
      this.logger?.warn('aviso-cliente.no_compuesto', { pedido_id: d.pedido_id, estado, code: r.error?.code });
    }
    return null;
  }

  // ================= C05/C06/K02 · componer y enviar =================
  async _componer(d) {
    if (!d.pedido_id) return this._invalid('pedido_id');
    const project_id = d.project_id || null;
    if (!project_id) return this._invalid('project_id');

    const estado = this._podar(d.estado || d.hecho || d.tipo || null);
    if (!estado) {
      return this._errorResponse(400, 'ESTADO_NO_VISIBLE',
        'el cliente sólo ve cuatro estados: recibido · en cocina · en camino · entregado (C05)',
        { field: 'estado', ve: Object.keys(ESTADOS) });
    }

    // C05: el cliente no recibe dos veces el mismo estado. El que repite no avisa.
    if (this._ultimo.get(d.pedido_id) === estado) {
      return { status: 200, data: { pedido_id: d.pedido_id, estado, enviado: false, motivo: 'ya avisado de ese estado' } };
    }
    if (this._enVuelo.has(d.pedido_id)) {
      return { status: 200, data: { pedido_id: d.pedido_id, estado, enviado: false, motivo: 'aviso en vuelo' } };
    }

    const texto = typeof d.texto === 'string' && d.texto ? d.texto : ESTADOS[estado];

    // K02: antes de enviar, la guarda. Si lleva una marca que no es de la tienda, no sale.
    const marca = this._marcaAjena(texto, d);
    if (marca) {
      this.hecho('bocaos.aviso_rechazado', {
        pedido_id: d.pedido_id,
        plaza_id: d.plaza_id || null,
        estado,
        marca_encontrada: marca,
        motivo: 'la comunicación al cliente final no puede llevar la marca de Bocaos ni la de la plaza (K02)',
        enviado: false
      });
      return this._errorResponse(409, 'MARCA_AJENA',
        `el aviso lleva la marca «${marca}»: no sale al cliente final (C06/K02)`,
        { field: 'texto', marca, enviado: false });
    }

    const telefono = await this._telefono(d, project_id);
    if (!telefono) {
      // Sin destino no se inventa un número: se publica el fallo del transporte, visible.
      this._fallido(d, null, 'SIN_DESTINO', 'el pedido no trae teléfono del cliente y la tienda no lo da');
      return this._errorResponse(422, 'SIN_DESTINO',
        'sin el teléfono del cliente no hay a quién avisar: la tienda lo tiene, la plaza no lo guarda',
        { field: 'telefono', enviado: false });
    }

    this._enVuelo.add(d.pedido_id);
    let res;
    try {
      res = await this._rpc('whatsapp.enviar.request', {
        project_slug: d.tienda_id || d.project_slug || null,
        to: telefono,
        text: texto
      }, { timeout_ms: TIMEOUT_ENVIO_MS });
    } catch (err) {
      res = { status: 500, error: { code: 'UPSTREAM_UNREACHABLE', message: err.message } };
    } finally {
      this._enVuelo.delete(d.pedido_id);
    }

    const ok = res && res.status === 200;
    if (!ok) {
      const code = res?.error?.code || 'UPSTREAM_UNREACHABLE';
      const message = res?.error?.message || 'sin respuesta de whatsapp.enviar';
      this._fallido(d, telefono, code, message);
      this._olvidar(d.pedido_id);
      return this._errorResponse(502, 'ENVIO_FALLIDO',
        'el transporte del aviso falló; el pedido existe igual (el aviso es transporte, no verdad)',
        { field: 'whatsapp', code, enviado: false });
    }

    this._ultimo.set(d.pedido_id, estado);
    if (this._ultimo.size > 2000) this._ultimo.delete(this._ultimo.keys().next().value);

    this.hecho('whatsapp.mensaje.enviado', {
      project_slug: d.tienda_id || d.project_slug || null,
      to: telefono,
      message_id: res?.data?.message_id ?? res?.message_id ?? null,
      kind: 'text',
      pedido_id: d.pedido_id,
      estado
    });
    this.hecho('bocaos.cliente_avisado', {
      pedido_id: d.pedido_id,
      plaza_id: d.plaza_id || null,
      tienda_id: d.tienda_id || null,
      estado,
      canal: 'whatsapp',
      to: telefono,
      texto
    });

    return { status: 200, data: { pedido_id: d.pedido_id, estado, texto, to: telefono, enviado: true } };
  }

  // C05 · podar el estado interno a lo que el cliente ve.
  _podar(bruto) {
    const e = typeof bruto === 'string' ? bruto.toLowerCase() : '';
    if (Object.prototype.hasOwnProperty.call(ESTADOS, e)) return e;
    return null;
  }

  // El teléfono es de la tienda (D05): viaja en el evento o se pide a SU pedido. Aquí no se guarda.
  async _telefono(d, project_id) {
    if (typeof d.telefono === 'string' && d.telefono.trim()) return d.telefono.trim();
    try {
      const r = await this._rpc('pedido.get.request', {
        project_id, pedido_id: d.pedido_id
      }, { timeout_ms: TIMEOUT_PEDIDO_MS });
      const t = r?.data?.pedido?.cliente_telefono || r?.data?.pedido?.telefono || r?.data?.cliente_telefono;
      if (typeof t === 'string' && t.trim()) return t.trim();
    } catch (_) { /* sin teléfono: se dice, no se inventa */ }
    return null;
  }

  _fallido(d, to, code, message) {
    this.hecho('whatsapp.envio.fallido', {
      project_slug: d.tienda_id || d.project_slug || null,
      to: to || null,
      pedido_id: d.pedido_id,
      estado: d.estado || null,
      error_code: code,
      error_message: message
    });
  }

  _olvidar(pedido_id) {
    this._ultimo.delete(pedido_id);
  }

  _marcaAjena(texto, d) {
    const bajo = String(texto || '').toLowerCase();
    for (const marca of this._marcas(d)) {
      if (marca && bajo.includes(marca)) return marca;
    }
    return null;
  }

  _marcas(d) {
    const extra = [];
    if (d && typeof d.plaza_nombre === 'string' && d.plaza_nombre.trim()) extra.push(d.plaza_nombre.trim().toLowerCase());
    if (d && typeof d.marca_plaza === 'string' && d.marca_plaza.trim()) extra.push(d.marca_plaza.trim().toLowerCase());
    return [...new Set([...MARCAS_FIJAS, ...this.marcas_vedadas, ...extra])];
  }
}

module.exports = AvisoCliente;
module.exports.ESTADOS = ESTADOS;
module.exports.MARCAS_FIJAS = MARCAS_FIJAS;
