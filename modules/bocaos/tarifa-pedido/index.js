'use strict';

/**
 * tarifa-pedido · CUSTODIO · PLAZA — E01 (OfertaCliente) + E02 (IncentivoTienda) + E03 (PrecioReparto)
 * + E07 (SubidaDeOferta).
 *
 * LOS CUATRO NÚMEROS DEL PEDIDO, Y UN ÚNICO ESCRITOR (si la tienda y la plaza escriben, hay carrera):
 *
 *   E01 · la OFERTA del cliente. Se congela con el pedido y no la toca nadie más: ni la tienda, ni
 *         la sala, ni Bocaos. El rider ve un número que no va a cambiar mientras decide. Si Bocaos
 *         pudiera formarla, estaría subastando reparto — y entonces sería transportista.
 *   E02 · el INCENTIVO de la tienda. Lo sube ella, con autor y hora: es su única palanca económica.
 *         No puede BAJAR por debajo de lo ya ofrecido: sería cambiarle el número bajo los ojos.
 *   E03 · el PRECIO del reparto. Sólo SUMA oferta + incentivo. No forma, no estima, no subasta, no
 *         redondea a favor de nadie. Es la entrada de `cobra`: sin este número cerrado no hay
 *         propuesta, y por eso es una dependencia dura del cuello.
 *   E07 · la SUBIDA con tope autorizado por el cliente (Q43) y AUTOR humano. El sistema no puede
 *         ser autor: una subida automática sería una subvención, y una subvención automática es una
 *         asignación con otro nombre. Quién paga el escalón es Q17: se anota el acto y la deuda
 *         queda VISIBLE, no cobrada.
 *
 * El tramo del contrato (E06) entra en el DESGLOSE, no en el precio: lo paga la parte según su
 * contrato y lo liquida `liquidacion`. Sumarlo aquí haría que el rider cobrara dos veces lo mismo.
 * Se marca `sumado_en_el_precio: false` para que nadie lo confunda con la oferta.
 *
 * Isla: cero require a otra isla. El pedido y su oferta llegan por evento; el tramo se pide al bus.
 */

const ModuloBocaos = require('../_bocaos');

const CENTIMOS = (v) => Number.isInteger(v) && v >= 0;

class TarifaPedido extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'tarifa-pedido';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/tarifa-pedido.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onOfertaRequest(e) { return this.servir(e, 'oferta', 'tarifa-pedido.oferta', (d) => this._oferta(d)); }
  onIncentivoRequest(e) { return this.servir(e, 'incentivo', 'tarifa-pedido.incentivo', (d) => this._incentivo(d)); }
  onSubirRequest(e) { return this.servir(e, 'subir', 'tarifa-pedido.subir', (d) => this._subir(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'tarifa-pedido.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // E01: la oferta del cliente llega CON el pedido y se congela con su hora. Después, nadie.
  async onPedidoCreado(e) {
    const d = this.datos(e);
    const plaza_id = this.plaza_id || d.plaza_id || null;
    if (!plaza_id || !d.pedido_id) return null;

    const entrega = (d.entrega && typeof d.entrega === 'object') ? d.entrega : {};
    const oferta = entrega.oferta_centimos ?? entrega.oferta_cents ?? d.oferta_centimos ?? null;
    if (!CENTIMOS(oferta)) {
      // Sin oferta no hay precio: se dice el hueco y NO se inventa un número.
      this.logger?.warn('tarifa-pedido.sin_oferta', { pedido_id: d.pedido_id, hueco: 'sin oferta del cliente' });
      return null;
    }
    return this._congelarAlNacer({
      project_id: plaza_id,
      plaza_id,
      pedido_id: d.pedido_id,
      tienda_id: d.tienda_id || d.project_slug || null,
      oferta_centimos: oferta,
      tope_centimos: CENTIMOS(entrega.tope_centimos) ? entrega.tope_centimos : null,
      // Q43: el escalón y su número máximo son parte de la MISMA autorización del cliente. Si no
      // los dice, no se rellenan: `escalada-enlace` tiene su default declarado y se sabe cuál es.
      escalon_centimos: CENTIMOS(entrega.escalon_centimos) ? entrega.escalon_centimos
        : (CENTIMOS(entrega.escalon_cents) ? entrega.escalon_cents : null),
      escalones_max: Number.isInteger(entrega.escalones_max) && entrega.escalones_max >= 0 ? entrega.escalones_max : null,
      hora: this._iso(d.hora) || this.ahora()
    });
  }

  // ================= E01/E02/E03 · oferta =================
  async _oferta(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    if (!CENTIMOS(d.oferta_centimos)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'oferta_centimos debe ser un entero ≥ 0', { field: 'oferta_centimos' });
    }

    const est = await this.estado(d.project_id);
    const t = est.tarifas?.[d.pedido_id];
    if (t && t.congelada_en) {
      // E01: congelada es congelada. Cambiarla sería subastar el reparto con el rider mirando.
      return this._errorResponse(409, 'OFERTA_CONGELADA',
        `la oferta del cliente se congeló en ${t.congelada_en}: no la toca nadie más (E01)`,
        { field: 'oferta_centimos', congelada_en: t.congelada_en, oferta_centimos: t.oferta_centimos });
    }

    const congelada = await this._congelarAlNacer({
      project_id: d.project_id,
      plaza_id: d.plaza_id || this.plaza_id || d.project_id,
      pedido_id: d.pedido_id,
      tienda_id: d.tienda_id || null,
      oferta_centimos: d.oferta_centimos,
      tope_centimos: CENTIMOS(d.tope_centimos) ? d.tope_centimos : null,
      hora: this._iso(d.hora) || this.ahora(),
      autor: d.autor || 'cliente'
    });
    // Si la tarifa ya estaba congelada y el tope llega AHORA, se anota y se anuncia: es el mismo
    // acto del cliente, sólo que por la puerta del RPC en vez de con el pedido.
    if (CENTIMOS(d.tope_centimos) && congelada && congelada.tope_centimos !== d.tope_centimos) {
      congelada.tope_centimos = d.tope_centimos;
      this._anunciarTarifa(congelada, { autor: d.autor || 'cliente', hora: this._iso(d.hora) || this.ahora() });
      await this.guardar(d.project_id);
    }
    const vista = await this._vista(d.project_id, d.pedido_id);
    return { status: 201, data: { pedido_id: d.pedido_id, precio: vista } };
  }

  // E02 · el incentivo lo sube LA TIENDA, con autor y hora. Y nunca baja.
  async _incentivo(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const est = await this.estado(d.project_id);
    const t = est.tarifas?.[d.pedido_id];
    if (!t) {
      return this._errorResponse(404, 'NO_CONSTA',
        'el pedido no tiene tarifa: sin oferta del cliente no hay precio que subir', 
        { field: 'pedido_id', hueco: 'sin oferta' });
    }

    const autor = this._autor(d.autor);
    if (!autor) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'el incentivo lo sube la tienda, con autor: sin autor no hay acto (E02)', { field: 'autor' });
    }
    const importe = d.incentivo_centimos ?? d.importe ?? null;
    if (!CENTIMOS(importe)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'incentivo_centimos debe ser un entero ≥ 0', { field: 'incentivo_centimos' });
    }

    const antes = this._precioDe(t);
    const despues = this._precioDe({ ...t, incentivo_centimos: importe });
    if (despues < antes) {
      return this._errorResponse(409, 'NO_BAJA',
        'el incentivo no baja el precio ya ofrecido: sería cambiarle el número al rider mientras decide (E02/E07)',
        { field: 'incentivo_centimos', precio_antes: antes, precio_ahora: despues });
    }

    t.incentivo_centimos = importe;
    t.incentivo_autor = autor;
    t.incentivo_hora = this._iso(d.hora) || this.ahora();
    await this.guardar(d.project_id);

    const vista = await this._vista(d.project_id, d.pedido_id);
    this._cerrarPrecio(d, vista);
    return { status: 200, data: { pedido_id: d.pedido_id, precio: vista } };
  }

  // ================= E07 · la subida, con autor y tope =================
  async _subir(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const est = await this.estado(d.project_id);
    const t = est.tarifas?.[d.pedido_id];
    if (!t) {
      return this._errorResponse(404, 'NO_CONSTA', 'el pedido no tiene tarifa que subir', { field: 'pedido_id', hueco: 'sin oferta' });
    }

    // E07: acto con AUTOR humano. El sistema no puede ser autor.
    const autor = this._autor(d.autor);
    if (!autor || this._esSistema(autor)) {
      return this._errorResponse(403, 'SIN_AUTOR',
        'una subida sin autor humano es una subvención automática, y eso es una asignación con otro nombre (E07/Q43)',
        { field: 'autor', hueco: 'sin autor humano' });
    }

    const importe = d.importe_centimos ?? d.nuevo_precio_centimos ?? null;
    if (!CENTIMOS(importe)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'importe_centimos debe ser un entero ≥ 0', { field: 'importe_centimos' });
    }

    const tope = CENTIMOS(d.tope_centimos) ? d.tope_centimos : t.tope_centimos;
    if (!CENTIMOS(tope)) {
      return this._errorResponse(409, 'SIN_TOPE',
        'sin tope autorizado por el cliente no se sube: la escalada no paga más de lo que el cliente autorizó (Q43)',
        { field: 'tope_centimos', hueco: 'sin tope autorizado' });
    }
    if (importe > tope) {
      return this._errorResponse(409, 'TOPE_EXCEDIDO',
        `la subida (${importe} c€) pasa el tope autorizado (${tope} c€)`,
        { field: 'importe_centimos', tope_centimos: tope, importe_centimos: importe });
    }

    const antes = this._precioDe(t);
    if (importe < antes) {
      return this._errorResponse(409, 'NO_BAJA', 'una subida no puede dejar el precio por debajo de lo ya ofrecido (E07)',
        { field: 'importe_centimos', precio_antes: antes });
    }

    t.oferta_centimos = importe;
    t.ofertas = [...(t.ofertas || []), { importe_centimos: importe, autor, hora: this._iso(d.hora) || this.ahora() }];
    await this.guardar(d.project_id);

    // Q17 abierto: se anota el acto y la deuda queda visible. NO se cobra a nadie.
    this.hecho('bocaos.oferta_subida', {
      pedido_id: d.pedido_id,
      plaza_id: t.plaza_id,
      tienda_id: t.tienda_id,
      precio_antes_centimos: antes,
      precio_ahora_centimos: importe,
      escalon_centimos: importe - antes,
      tope_centimos: tope,
      autor,
      hora: this._iso(d.hora) || this.ahora(),
      cobrado: false,
      deuda_visible: true,
      motivo_deuda: 'quién paga el escalón es Q17: se anota, no se cobra a nadie'
    });

    const vista = await this._vista(d.project_id, d.pedido_id);
    this._cerrarPrecio(d, vista);
    return { status: 200, data: { pedido_id: d.pedido_id, precio: vista, autor, deuda: { visible: true, cobrada: false } } };
  }

  // ================= E03 · de (PREGUNTA) =================
  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const vista = await this._vista(d.project_id, d.pedido_id, d.tienda_id || null);
    if (!vista) {
      return this._errorResponse(404, 'NO_CONSTA',
        'el pedido no tiene precio de reparto: sin la oferta del cliente no hay número que dar (E01/E03)',
        { field: 'pedido_id', hueco: 'sin oferta' });
    }
    return { status: 200, data: { precio: vista } };
  }

  // ================= piezas =================
  async _congelarAlNacer(d) {
    const est = await this.estado(d.project_id);
    est.tarifas = est.tarifas || {};
    const existente = est.tarifas[d.pedido_id];
    if (existente && existente.congelada_en) return existente;   // la primera oferta es la que vale

    const t = {
      pedido_id: d.pedido_id,
      plaza_id: d.plaza_id,
      tienda_id: d.tienda_id || (existente && existente.tienda_id) || null,
      oferta_centimos: d.oferta_centimos,
      ofertas: [{ importe_centimos: d.oferta_centimos, autor: d.autor || 'cliente', hora: d.hora }],
      incentivo_centimos: 0,
      incentivo_autor: null,
      incentivo_hora: null,
      tope_centimos: d.tope_centimos ?? (existente ? existente.tope_centimos : null) ?? null,
      escalon_centimos: d.escalon_centimos ?? (existente ? existente.escalon_centimos : null) ?? null,
      escalones_max: d.escalones_max ?? (existente ? existente.escalones_max : null) ?? null,
      congelada_en: d.hora,
      horario: []
    };
    est.tarifas[d.pedido_id] = t;
    await this.guardar(d.project_id);

    const vista = await this._vista(d.project_id, d.pedido_id);
    this._cerrarPrecio(d, vista);
    // E07/Q43 · si el cliente autorizó un tope, se DICE en el bus: `escalada-enlace` lo escucha y
    // sin él no puede subir la oferta (no hay permiso que cumplir). Un tope que no existe no se
    // anuncia: un 0 sería un tope inventado.
    this._anunciarTarifa(t, { autor: d.autor || 'cliente', hora: d.hora });
    return t;
  }

  // ================= E07/Q43 · el tope autorizado, como hecho =================
  // `bocaos.tarifa` es el ÚNICO idioma que `escalada-enlace` entiende para saber hasta dónde puede
  // subir. Lo habla el custodio del tope (aquí), no el pedido: si lo hablara el pedido, habría dos
  // escritores del mismo número. Sin tope NO se emite.
  _anunciarTarifa(t, { autor, hora, escalon_centimos, escalones_max } = {}) {
    if (!CENTIMOS(t.tope_centimos)) return null;
    if (t.tope_anunciado === t.tope_centimos) return null;   // el mismo tope no se anuncia dos veces
    t.tope_anunciado = t.tope_centimos;

    const escalon = CENTIMOS(escalon_centimos) ? escalon_centimos : (CENTIMOS(t.escalon_centimos) ? t.escalon_centimos : null);
    if (escalon !== null) t.escalon_centimos = escalon;
    if (Number.isInteger(escalones_max) && escalones_max >= 0) t.escalones_max = escalones_max;

    const carga = {
      pedido_id: t.pedido_id,
      plaza_id: t.plaza_id,
      tienda_id: t.tienda_id,
      tope_cents: t.tope_centimos,
      oferta_cents: t.oferta_centimos,
      autor: autor || 'cliente',
      hora: hora || this.ahora(),
      // Q43: el tope lo autoriza el cliente, no el sistema. Quién paga el escalón es Q17 (abierto):
      // se anota el acto y la deuda queda visible, no cobrada.
      cobrado: false,
      deuda_visible: true
    };
    if (escalon !== null) carga.escalon_cents = escalon;
    if (Number.isInteger(t.escalones_max)) carga.escalones_max = t.escalones_max;
    return this.hecho('bocaos.tarifa', carga);
  }

  // E03: SÓLO SUMA. Ni redondeo, ni estimación, ni comisión escondida.
  _precioDe(t) {
    return Number(t.oferta_centimos || 0) + Number(t.incentivo_centimos || 0);
  }

  _cerrarPrecio(d, vista) {
    this.hecho('bocaos.precio_cerrado', {
      pedido_id: vista.pedido_id,
      plaza_id: vista.plaza_id,
      tienda_id: vista.tienda_id,
      oferta_centimos: vista.desglose.oferta_centimos,
      incentivo_centimos: vista.desglose.incentivo_centimos,
      precio_centimos: vista.precio_centimos,
      tope_centimos: vista.tope_centimos,
      congelada_en: vista.congelada_en,
      // E03: el número está cerrado y es la entrada de `cobra` (A11). Sin él, no hay propuesta.
      cerrado: true
    });
  }

  // La vista compone oferta + incentivo + el tramo del contrato (que se PIDE al bus y NO se suma).
  async _vista(project_id, pedido_id, tienda_id) {
    const est = await this.estado(project_id);
    const t = est.tarifas?.[pedido_id];
    if (!t) return null;

    const precio = this._precioDe(t);
    const tramo = await this._tramo(project_id, t.plaza_id, t.tienda_id || tienda_id);

    return {
      pedido_id,
      plaza_id: t.plaza_id,
      tienda_id: t.tienda_id || tienda_id || null,
      precio_centimos: precio,
      moneda: 'EUR',
      desglose: {
        oferta_centimos: t.oferta_centimos,
        incentivo_centimos: t.incentivo_centimos,
        // El tramo va en el desglose para liquidar, NO en el precio: lo paga la parte según su
        // contrato y sumarlo aquí sería cobrar dos veces lo mismo.
        tramo: tramo ? { ...tramo, sumado_en_el_precio: false } : null
      },
      tope_centimos: t.tope_centimos,
      congelada_en: t.congelada_en,
      ofertas: t.ofertas || [],
      incentivo: t.incentivo_autor ? { centimos: t.incentivo_centimos, autor: t.incentivo_autor, hora: t.incentivo_hora } : null,
      // E03: la composición se explica; el número, sólo suma.
      regla: 'precio = oferta del cliente + incentivo de la tienda (E03: sólo suma)'
    };
  }

  async _tramo(project_id, plaza_id, tienda_id) {
    if (!tienda_id) return null;
    try {
      const r = await this._rpc('contrato-tramos.vigente.request', {
        project_id, parte_id: tienda_id, instante: this.ahora()
      }, { timeout_ms: 2000 });
      const c = r?.data?.contrato;
      if (!c) return null;
      return {
        contrato_id: c.contrato_id,
        parte: c.parte,
        tramo: c.tramo,
        cents_por_pedido: c.cents_por_pedido,
        fijo_mensual_cents: c.fijo_mensual_cents,
        devenga: !!c.devenga
      };
    } catch (_) {
      return null;
    }
  }

  _autor(a) {
    if (typeof a === 'string' && a.trim()) return a.trim();
    if (a && typeof a === 'object') return a.id || a.nombre || a.rol || null;
    return null;
  }

  // El sistema no es un autor: si lo fuera, la subida sería automática.
  _esSistema(autor) {
    return ['sistema', 'system', 'bocaos', 'escalada', 'automatico', 'automático'].includes(String(autor).toLowerCase());
  }
}

module.exports = TarifaPedido;
