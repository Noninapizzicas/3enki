'use strict';

/**
 * hechos-reparto · CUSTODIO · PLAZA — F01 (HechosDelReparto) + F02 (PruebaEntrega) + F03 (SeguimientoVivo).
 *
 * Los hechos del reparto con hora y su prueba: recogida, entrega, espera real y la prueba (foto,
 * firma, código o su FALTA DECLARADA — que es un hecho distinto de no tener nada). Append-only:
 * es la materia prima de todo lo que se mide después. Un hecho no se edita: se añade otro que
 * lo desmiente.
 *
 * El acta se compone aquí y NO se inventa: si falta un hecho, devuelve INCOMPLETA con el nombre
 * del que falta (Q30: la prueba es el evento).
 *
 * El reparto se abre con `bocaos.contrato_creado` (A24) y con la hora de listo del hecho (A01).
 * Un reparto por pedido: el segundo aviso completa, no duplica.
 */

const ModuloBocaos = require('../_bocaos');

const TIPOS = ['recogida', 'entrega', 'espera', 'salida'];
const PRUEBAS = ['foto', 'firma', 'codigo'];

class HechosReparto extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'hechos-reparto';
    this.version = 'reflejo-0.1.0';
    this._path = '/bocaos/hechos-reparto.json';
  }

  // ================= RPC del bus =================
  onAnotarRequest(e) { return this.servir(e, 'anotar', 'hechos-reparto.anotar', (d) => this._anotar(d)); }
  onPruebaRequest(e) { return this.servir(e, 'prueba', 'hechos-reparto.prueba', (d) => this._prueba(d)); }
  onActaRequest(e) { return this.servir(e, 'acta', 'hechos-reparto.acta', (d) => this._acta(d)); }

  // ================= hechos que escucha =================
  async onContratoCreado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return;
    await this._abrir(d.project_id, {
      pedido_id: d.pedido_id,
      plaza_id: d.plaza_id,
      contrato_id: d.contrato_id || null,
      rider_id: d.rider_id || null,
      hora_aceptacion: this._iso(d.hora_contrato || d.hora_aceptacion)
    });
  }

  async onPedidoListo(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return;
    const est = await this.estado(d.project_id);
    est.repartos = est.repartos || {};
    est.repartos[d.pedido_id] = est.repartos[d.pedido_id] || { pedido_id: d.pedido_id, plaza_id: d.plaza_id || null, contrato_id: null, rider_id: null, hora_aceptacion: null, hechos: [], pruebas: [], abierto_en: this.ahora() };
    // El reloj de la espera es la hora declarada por la tienda; si no consta, la espera no se mide.
    est.repartos[d.pedido_id].hora_listo = this._iso(d.hora_listo);
    await this.guardar(d.project_id);
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= F01 · anotar =================
  async _anotar(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    if (!TIPOS.includes(d.tipo)) {
      return this._errorResponse(400, 'INVALID_INPUT', `tipo debe ser uno de: ${TIPOS.join(' | ')}`, { field: 'tipo' });
    }
    const hora = this._iso(d.hora);
    // F01: sin hora no es un hecho, es una impresión.
    if (!hora) {
      return this._errorResponse(400, 'HORA_REQUERIDA', 'un hecho del reparto sin hora no es un hecho', { field: 'hora' });
    }

    const reparto = await this._abrir(d.project_id, { pedido_id: d.pedido_id, plaza_id: d.plaza_id });
    const hecho = {
      tipo: d.tipo,
      hora,
      autor: d.autor || null,
      pedido_id: d.pedido_id,
      anotado_en: this.ahora(),
      nota: d.nota || null
    };
    reparto.hechos.push(hecho);
    await this.guardar(d.project_id);

    this.hecho('bocaos.hecho_reparto_anotado', {
      pedido_id: d.pedido_id,
      plaza_id: reparto.plaza_id,
      contrato_id: reparto.contrato_id,
      ...hecho
    });
    return { status: 201, data: { hecho, hechos: reparto.hechos.length } };
  }

  // ================= F02 · prueba o su falta declarada =================
  async _prueba(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');

    const falta = d.falta === true;
    if (!falta) {
      if (!PRUEBAS.includes(d.tipo)) {
        return this._errorResponse(400, 'INVALID_INPUT', `prueba: tipo debe ser ${PRUEBAS.join(' | ')} o falta:true`, { field: 'tipo' });
      }
      if (!d.valor && !d.referencia) {
        return this._errorResponse(400, 'INVALID_INPUT', 'una prueba sin valor ni referencia no prueba nada', { field: 'valor' });
      }
    } else if (!d.motivo) {
      // F02: la FALTA también se declara con motivo. «No hay prueba» sin motivo no es un hecho.
      return this._errorResponse(400, 'INVALID_INPUT', 'declarar la falta exige motivo (no es lo mismo que no tener nada)', { field: 'motivo' });
    }

    const reparto = await this._abrir(d.project_id, { pedido_id: d.pedido_id, plaza_id: d.plaza_id });
    const prueba = falta
      ? { falta: true, motivo: d.motivo, autor: d.autor || null, anotado_en: this.ahora() }
      : { falta: false, tipo: d.tipo, valor: d.valor || null, referencia: d.referencia || null, autor: d.autor || null, anotado_en: this.ahora() };
    reparto.pruebas.push(prueba);
    await this.guardar(d.project_id);

    this.hecho('bocaos.prueba_anotada', {
      pedido_id: d.pedido_id,
      plaza_id: reparto.plaza_id,
      contrato_id: reparto.contrato_id,
      prueba,
      autor: prueba.autor,
      hora: prueba.anotado_en
    });
    return { status: 201, data: { prueba } };
  }

  // ================= F01 · el acta =================
  async _acta(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const est = await this.estado(d.project_id);
    const reparto = est.repartos?.[d.pedido_id];
    if (!reparto) return this._errorResponse(404, 'NO_CONSTA', 'no hay reparto abierto para ese pedido', { field: 'pedido_id' });

    const ultimo = (tipo) => [...reparto.hechos].reverse().find((h) => h.tipo === tipo) || null;
    const recogida = ultimo('recogida');
    const entrega = ultimo('entrega');
    const prueba = reparto.pruebas.length > 0 ? reparto.pruebas[reparto.pruebas.length - 1] : null;

    const faltan = [];
    if (!recogida) faltan.push('recogida');
    if (!entrega) faltan.push('entrega');
    if (!prueba) faltan.push('prueba o su falta declarada');
    if (!reparto.hora_aceptacion) faltan.push('hora de aceptación');

    if (faltan.length > 0) {
      const incompleta = {
        pedido_id: d.pedido_id,
        plaza_id: reparto.plaza_id || null,
        contrato_id: reparto.contrato_id || null,
        rider_id: reparto.rider_id || null,
        faltan,
        hechos: reparto.hechos.length
      };
      this.hecho('bocaos.acta_incompleta', incompleta);
      return { status: 200, data: { completa: false, ...incompleta } };
    }

    const relojes = {
      aceptacion: reparto.hora_aceptacion,
      listo: reparto.hora_listo || null,
      recogida: recogida.hora,
      entrega: entrega.hora,
      espera_min: reparto.hora_listo ? this._minutosEntre(reparto.hora_listo, recogida.hora) : null,
      reparto_min: this._minutosEntre(recogida.hora, entrega.hora),
      total_min: this._minutosEntre(reparto.hora_aceptacion, entrega.hora)
    };

    return {
      status: 200,
      data: {
        completa: true,
        acta: {
          pedido_id: d.pedido_id,
          plaza_id: reparto.plaza_id || null,
          contrato_id: reparto.contrato_id || null,
          rider_id: reparto.rider_id || null,
          relojes,
          prueba,
          hechos: reparto.hechos.length
        }
      }
    };
  }

  // ================= abrir el reparto (idempotente) =================
  async _abrir(project_id, datos) {
    const est = await this.estado(project_id);
    est.repartos = est.repartos || {};
    const actual = est.repartos[datos.pedido_id];
    if (actual) {
      // No se pisa lo que ya consta: el contrato completa lo que la aceptación abrió.
      if (!actual.contrato_id && datos.contrato_id) actual.contrato_id = datos.contrato_id;
      if (!actual.rider_id && datos.rider_id) actual.rider_id = datos.rider_id;
      if (!actual.hora_aceptacion && datos.hora_aceptacion) actual.hora_aceptacion = datos.hora_aceptacion;
      if (!actual.plaza_id && datos.plaza_id) actual.plaza_id = datos.plaza_id;
      return actual;
    }
    const nuevo = {
      pedido_id: datos.pedido_id,
      plaza_id: datos.plaza_id || this.plaza_id || null,
      contrato_id: datos.contrato_id || null,
      rider_id: datos.rider_id || null,
      hora_aceptacion: datos.hora_aceptacion || null,
      hora_listo: null,
      hechos: [],
      pruebas: [],
      abierto_en: this.ahora()
    };
    est.repartos[datos.pedido_id] = nuevo;
    await this.guardar(project_id);
    return nuevo;
  }
}

module.exports = HechosReparto;
