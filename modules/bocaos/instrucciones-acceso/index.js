'use strict';

/**
 * instrucciones-acceso · CUSTODIO · PLAZA — F05 (InstruccionesAcceso).
 *
 * CÓMO SE ENTRA A CADA DESTINO: portal, piso, código, «llamar al 3º». Las escribe el cliente y las
 * ve SÓLO el rider del contrato vivo — mientras el contrato está vivo.
 *
 * Tres reglas que son el módulo:
 *
 *   1. SIN CONTRATO VIVO NO HAY INSTRUCCIONES. Al entregar dejan de mostrarse aunque el dato siga
 *      escrito: `de` devuelve NO_HAY. Un dato personal que sobrevive a su motivo es una fuga con
 *      fecha.
 *   2. SÓLO EL RIDER DEL CONTRATO. Otro rider recibe 403. La plaza no las reparte: las guarda para
 *      quien las necesita, y quien las necesita lo dice el contrato.
 *   3. NO ENTRAN EN NINGÚN AGREGADO. Es dato personal del cliente DEL cliente: ni histórico de
 *      tienda, ni informe, ni acta. Aquí se escribe y aquí se lee, con su motivo.
 *
 * El contrato NO se guarda aquí (sería una segunda verdad): se pregunta a `contrato-puntual.de` por
 * el bus en cada lectura, y `bocaos.contrato_cerrado` cierra la ventana también en este almacén
 * por si el cierre llega antes que la pregunta.
 *
 * Isla: cero require a otra isla.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const TIMEOUT_CONTRATO_MS = 3000;

class InstruccionesAcceso extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'instrucciones-acceso';
    this.version = 'custodio-0.1.0';
    this._path = '/bocaos/instrucciones-acceso.json';
  }

  // ================= RPC del bus (una línea por op) =================
  onAnotarRequest(e) { return this.servir(e, 'anotar', 'instrucciones-acceso.anotar', (d) => this._anotar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'instrucciones-acceso.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // F05: entregado el pedido, las instrucciones dejan de mostrarse. El dato sigue escrito; lo que
  // se cierra es la ventana.
  async onContratoCerrado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return null;
    const est = await this.estado(d.project_id);
    const i = est.instrucciones?.[d.pedido_id];
    if (!i) return null;
    i.mostrable_hasta = this._iso(d.hora_cierre) || this.ahora();
    i.cerrado = true;
    await this.guardar(d.project_id);
    return null;
  }

  // ================= F05 · anotar (ORDEN) =================
  async _anotar(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');

    const texto = typeof d.texto === 'string' ? d.texto.trim() : '';
    const portal = typeof d.portal === 'string' ? d.portal.trim() : null;
    const piso = typeof d.piso === 'string' || typeof d.piso === 'number' ? String(d.piso) : null;
    if (!texto && !portal && !piso) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'sin texto ni portal ni piso no hay instrucción que anotar', { field: 'texto' });
    }

    const est = await this.estado(d.project_id);
    est.instrucciones = est.instrucciones || {};
    const hora = this.ahora();
    const previa = est.instrucciones[d.pedido_id] || null;

    // Se CORRIGE añadiendo: la anterior queda en el historial con su hora. No se borra nada.
    const instruccion = {
      instruccion_id: `ia-${crypto.randomUUID().slice(0, 8)}`,
      pedido_id: d.pedido_id,
      plaza_id: this.plaza_id || d.plaza_id || d.project_id,
      portal,
      piso,
      texto: texto || null,
      autor: d.autor || d.cliente_id || 'cliente',
      hora: this._iso(d.hora) || hora,
      anotado_en: hora,
      // F05: la ventana la abre el contrato; aquí sólo se dice que está abierta a la espera de él.
      cerrado: false,
      mostrable_hasta: null,
      historial: previa ? [...(previa.historial || []), this._vista(previa)] : []
    };
    est.instrucciones[d.pedido_id] = instruccion;
    await this.guardar(d.project_id);

    this.hecho('bocaos.instrucciones_anotadas', {
      instruccion_id: instruccion.instruccion_id,
      pedido_id: instruccion.pedido_id,
      plaza_id: instruccion.plaza_id,
      // El TEXTO no viaja en el hecho: es dato personal del cliente del cliente (F05).
      tiene_portal: !!portal,
      tiene_piso: !!piso,
      tiene_texto: !!texto,
      autor: instruccion.autor,
      hora: instruccion.hora
    });

    return { status: 201, data: { instruccion_id: instruccion.instruccion_id, pedido_id: d.pedido_id, anotada_en: hora } };
  }

  // ================= F05 · mostrar (PREGUNTA) =================
  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const rider_id = d.rider_id || d.parte_id || null;
    if (!rider_id) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'sin rider no hay a quién mostrarlas: sólo las ve el rider del contrato vivo', { field: 'rider_id' });
    }

    const est = await this.estado(d.project_id);
    const i = est.instrucciones?.[d.pedido_id];
    const noHay = (motivo) => ({ status: 200, data: { no_hay: true, pedido_id: d.pedido_id, motivo } });

    if (!i) return noHay('no hay instrucciones anotadas para ese pedido');
    if (i.cerrado) return noHay('el contrato se cerró: las instrucciones dejan de mostrarse (F05)');

    // El contrato vivo se PIDE al bus: guardarlo aquí sería una segunda verdad.
    const contrato = await this._contratoVivo(d.project_id, d.pedido_id);
    if (!contrato) return noHay('sin contrato vivo no se muestran las instrucciones');

    if (contrato.rider_id && contrato.rider_id !== rider_id) {
      // 403: no es su pedido. Se dice, y no se filtra nada del contenido.
      return this._errorResponse(403, 'FORBIDDEN',
        'las instrucciones son del rider del contrato vivo: otro rider no las ve (F05)',
        { field: 'rider_id', contrato_id: contrato.contrato_id });
    }

    return {
      status: 200,
      data: {
        no_hay: false,
        pedido_id: d.pedido_id,
        instrucciones: {
          portal: i.portal,
          piso: i.piso,
          texto: i.texto,
          anotada_en: i.anotado_en
        },
        contrato_id: contrato.contrato_id,
        // Se dice HASTA CUÁNDO se puede ver: al cerrar el contrato, NO_HAY.
        mostrable: true,
        ventana: { contrato: contrato.estado, desde: contrato.creado_en || null }
      }
    };
  }

  async _contratoVivo(project_id, pedido_id) {
    try {
      const r = await this._rpc('contrato-puntual.de.request', {
        project_id, pedido_id
      }, { timeout_ms: TIMEOUT_CONTRATO_MS });
      const c = r?.data?.contrato;
      if (!c || c.estado !== 'VIVO') return null;
      return c;
    } catch (_) {
      return null;
    }
  }

  _vista(i) {
    return {
      instruccion_id: i.instruccion_id,
      portal: i.portal,
      piso: i.piso,
      texto: i.texto,
      autor: i.autor,
      hora: i.hora,
      anotado_en: i.anotado_en
    };
  }
}

module.exports = InstruccionesAcceso;
