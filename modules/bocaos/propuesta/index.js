'use strict';

/**
 * propuesta · CUSTODIO · PLAZA — A13 + A14 + A15 + A19 + A27 + A29 + A33 + M05.
 *
 * La propuesta y su desenlace, en UN solo custodio. Cuatro clases del diseño escriben la MISMA
 * propuesta (emitirla, abrir su reloj, cerrarla, aceptarla): cuatro hojas serían cuatro
 * escritores y exactamente la carrera que A14 existe para impedir.
 *
 *   A13  se escribe una vez y no se edita: es la prueba de qué se ofreció, a quién y con qué números
 *   A14  un desenlace por propuesta; el segundo recibe YA_NO_ESTA y no paga nada
 *   A15  dos relojes y dos caducidades: sin acuse (el canal falló) ≠ sin respuesta (el rider no dijo)
 *   A19  el sí lo escribe el rider, es atómico, y es el ÚNICO camino a un contrato (A27)
 *   A33  una propuesta viva por pedido: no hay sorteo
 *   M05  los cuatro números SIEMPRE en el mismo orden + la frase + de qué plaza + qué umbrales
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const VENTANA_S = 20;        // F0 §6, cerrado
const DECISION_S = 10;       // Q42: acuse ≤5 s, decisión 10 s
const VIVAS = ['EMITIDA', 'ENTREGADA', 'ACUSADA'];

const ES_NUMERO = (v) => typeof v === 'number' && Number.isFinite(v);

class Propuesta extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'propuesta';
    this.version = 'reflejo-0.2.0';
    this._path = '/bocaos/propuesta.json';
  }

  // ================= RPC del bus =================
  onEmitirRequest(e) { return this.servir(e, 'emitir', 'propuesta.emitir', (d) => this._emitir(d)); }
  onAcuseRequest(e) { return this.servir(e, 'acuse', 'propuesta.acuse', (d) => this._acuse(d)); }
  onAceptarRequest(e) { return this.servir(e, 'aceptar', 'propuesta.aceptar', (d) => this._aceptar(d)); }
  onRechazarRequest(e) { return this.servir(e, 'rechazar', 'propuesta.rechazar', (d) => this._rechazar(d)); }
  onCerrarRequest(e) { return this.servir(e, 'cerrar', 'propuesta.cerrar', (d) => this._cerrar(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'propuesta.de', (d) => this._de(d)); }

  // ================= hechos que escucha =================
  async onPropuestaEntregada(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.propuesta_id) return;
    const est = await this.estado(d.project_id);
    const p = est.propuestas?.[d.propuesta_id];
    if (!p || !VIVAS.includes(p.estado)) return;
    p.estado = 'ENTREGADA';
    p.hora_entrega = this._iso(d.hora) || this.ahora();
    await this.guardar(d.project_id);
  }

  async onPropuestaNoEntregada(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.propuesta_id) return;
    const est = await this.estado(d.project_id);
    const p = est.propuestas?.[d.propuesta_id];
    if (!p || !VIVAS.includes(p.estado)) return;
    // A15/M04: sin acuse, el que falló es el canal, no el rider.
    await this._resolver(d.project_id, p, 'CADUCADA_SIN_ACUSE', d.motivo || 'sin acuse del canal');
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= A13/A14/A15/A33 · emitir =================
  async _emitir(d) {
    if (!d.project_id) return this._invalid('project_id');
    for (const campo of ['pedido_id', 'rider_id', 'huella']) {
      if (!d[campo]) return this._invalid(campo);
    }
    const m = d.medidas || {};
    for (const campo of ['desvio_m', 'espera_min', 'retraso_min', 'cobra_cents']) {
      if (!ES_NUMERO(m[campo])) {
        return this._errorResponse(400, 'MEDIDA_SIN_CONSTAR', `medida ${campo} sin constar: no se emite una propuesta con un hueco`, { field: `medidas.${campo}`, hueco: `sin ${campo}` });
      }
    }
    const politica = d.politica;
    if (!politica || !politica.umbrales) {
      return this._errorResponse(409, 'POLITICA_SIN_CONSTAR', 'sin política resuelta no hay propuesta: la explicación necesita capa y autor', { field: 'politica', hueco: 'sin política' });
    }

    const est = await this.estado(d.project_id);
    est.propuestas = est.propuestas || {};
    est.viva = est.viva || {};

    const ahora = this._iso(d.ahora) || this.ahora();
    const viva_id = est.viva[d.pedido_id];
    const viva = viva_id ? est.propuestas[viva_id] : null;

    if (viva && VIVAS.includes(viva.estado)) {
      if (ahora < viva.expira_en) {
        // A33: una viva por pedido. No hay sorteo, ni segunda oferta «por si acaso».
        return this._errorResponse(409, 'YA_HAY_UNA_VIVA', 'ya hay una propuesta viva para este pedido', {
          field: 'pedido_id', propuesta_id: viva.propuesta_id, expira_en: viva.expira_en
        });
      }
      // Venció sin que nadie la cerrara: se cierra como caducada antes de emitir la siguiente.
      await this._resolver(d.project_id, viva, 'CADUCADA_SIN_RESPUESTA', 'vencida sin cerrar');
    }

    const ventana_s = Number.isFinite(d.ventana_s) ? d.ventana_s : (politica.ventana_s || VENTANA_S);
    const propuesta_id = `prop-${this.huella({
      pedido_id: d.pedido_id, rider_id: d.rider_id, huella: d.huella, politica: politica.version
    }).slice(0, 12)}`;

    const p = {
      propuesta_id,
      plaza_id: d.plaza_id || this.plaza_id || null,
      pedido_id: d.pedido_id,
      rider_id: d.rider_id,
      medidas: {
        desvio_m: m.desvio_m,
        espera_min: m.espera_min,
        retraso_min: m.retraso_min,
        cobra_cents: m.cobra_cents
      },
      huella: d.huella,
      politica: {
        capa: politica.capa,
        version: politica.version,
        autor: politica.autor,
        umbrales: politica.umbrales
      },
      estado: 'EMITIDA',
      emitida_en: ahora,
      ventana_s,
      expira_en: new Date(Date.parse(ahora) + ventana_s * 1000).toISOString(),
      hora_entrega: null,
      hora_acuse: null,
      decision_expira_en: null,
      hora_aceptacion: null,
      desenlace: null,
      motivo: null
    };
    p.vista = this._vista(p);

    est.propuestas[propuesta_id] = p;
    est.viva[d.pedido_id] = propuesta_id;
    await this.guardar(d.project_id);

    this.hecho('bocaos.propuesta_emitida', {
      propuesta_id,
      pedido_id: p.pedido_id,
      rider_id: p.rider_id,
      plaza_id: p.plaza_id,
      medidas: p.medidas,
      huella: p.huella,
      politica: p.politica,
      ventana_s: p.ventana_s,
      expira_en: p.expira_en,
      vista: p.vista
    });

    return { status: 201, data: { propuesta: p, vista: p.vista } };
  }

  // ================= A15 · acuse =================
  async _acuse(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.propuesta_id) return this._invalid('propuesta_id');
    const est = await this.estado(d.project_id);
    const p = est.propuestas?.[d.propuesta_id];
    if (!p) return this._errorResponse(404, 'PROPUESTA_NO_CONSTA', 'no hay propuesta con ese id en esta plaza', { field: 'propuesta_id' });
    if (p.estado === 'ACUSADA') return { status: 200, data: { propuesta: p, idempotente: true } };
    if (!VIVAS.includes(p.estado)) return this._errorResponse(409, 'YA_NO_ESTA', 'la propuesta ya tiene desenlace', { field: 'propuesta_id', desenlace: p.desenlace });
    if (d.rider_id && d.rider_id !== p.rider_id) {
      return this._errorResponse(403, 'FORBIDDEN', 'el acuse no es de esa propuesta', { field: 'rider_id' });
    }

    const ahora = this._iso(d.hora) || this.ahora();
    if (ahora > p.expira_en) {
      await this._resolver(d.project_id, p, 'CADUCADA_SIN_ACUSE', 'acuse fuera de la ventana');
      return this._errorResponse(409, 'PROPUESTA_CADUCADA', 'el acuse llegó fuera de la ventana', { field: 'hora', expira_en: p.expira_en });
    }

    // A15: el acuse arranca el reloj de DECISIÓN (10 s, Q42). Son dos relojes, no uno.
    p.estado = 'ACUSADA';
    p.hora_acuse = ahora;
    p.decision_expira_en = new Date(Date.parse(ahora) + DECISION_S * 1000).toISOString();
    await this.guardar(d.project_id);

    this.hecho('bocaos.propuesta_acusada', {
      propuesta_id: p.propuesta_id,
      pedido_id: p.pedido_id,
      rider_id: p.rider_id,
      plaza_id: p.plaza_id,
      hora_acuse: p.hora_acuse,
      decision_expira_en: p.decision_expira_en
    });

    return { status: 200, data: { propuesta: p } };
  }

  // ================= A19 · el sí =================
  async _aceptar(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.propuesta_id) return this._invalid('propuesta_id');
    const est = await this.estado(d.project_id);
    const p = est.propuestas?.[d.propuesta_id];
    if (!p) return this._errorResponse(404, 'PROPUESTA_NO_CONSTA', 'no hay propuesta con ese id en esta plaza', { field: 'propuesta_id' });

    // A14: un solo desenlace. El segundo sí recibe YA_NO_ESTA y NO PAGA NADA.
    if (!VIVAS.includes(p.estado)) {
      return this._errorResponse(409, 'YA_NO_ESTA', 'la propuesta ya tiene desenlace; este sí no cuesta nada', {
        field: 'propuesta_id', desenlace: p.desenlace
      });
    }
    if (!d.rider_id || d.rider_id !== p.rider_id) {
      // A19: el sí sólo lo escribe el rider al que se le propuso.
      return this._errorResponse(403, 'FORBIDDEN', 'el sí no es de ese rider', { field: 'rider_id' });
    }
    const ahora = this._iso(d.hora) || this.ahora();
    if (ahora > p.expira_en) {
      await this._resolver(d.project_id, p, 'CADUCADA_SIN_RESPUESTA', 'sí fuera de la ventana');
      return this._errorResponse(409, 'PROPUESTA_CADUCADA', 'el sí llegó fuera de la ventana', { field: 'hora', expira_en: p.expira_en });
    }

    p.estado = 'ACEPTADA';
    p.hora_aceptacion = ahora;
    p.desenlace = 'ACEPTADA';
    await this.guardar(d.project_id);

    // A19/A20: el hecho con hora alimenta los relojes del reparto.
    this.hecho('bocaos.propuesta_aceptada', {
      propuesta_id: p.propuesta_id,
      pedido_id: p.pedido_id,
      rider_id: p.rider_id,
      plaza_id: p.plaza_id,
      hora_aceptacion: p.hora_aceptacion,
      medidas: p.medidas,
      huella: p.huella,
      politica: p.politica
    });

    return { status: 200, data: { propuesta: p } };
  }

  async _rechazar(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.propuesta_id) return this._invalid('propuesta_id');
    const est = await this.estado(d.project_id);
    const p = est.propuestas?.[d.propuesta_id];
    if (!p) return this._errorResponse(404, 'PROPUESTA_NO_CONSTA', 'no hay propuesta con ese id', { field: 'propuesta_id' });
    if (!VIVAS.includes(p.estado)) return this._errorResponse(409, 'YA_NO_ESTA', 'la propuesta ya tiene desenlace', { field: 'propuesta_id' });
    if (d.rider_id && d.rider_id !== p.rider_id) return this._errorResponse(403, 'FORBIDDEN', 'el no no es de ese rider', { field: 'rider_id' });

    const ahora = this._iso(d.hora) || this.ahora();
    p.estado = 'RECHAZADA';
    p.desenlace = 'RECHAZADA';
    p.motivo = d.motivo || null;   // A21: se guarda con el caso, NUNCA se agrega en una nota
    p.hora_desenlace = ahora;
    await this.guardar(d.project_id);

    this.hecho('bocaos.propuesta_rechazada', {
      propuesta_id: p.propuesta_id,
      pedido_id: p.pedido_id,
      rider_id: p.rider_id,
      plaza_id: p.plaza_id,
      hora: ahora,
      motivo: p.motivo,
      coste: 0            // A21: rechazar no cuesta nada, ni ahora ni en la siguiente
    });

    return { status: 200, data: { propuesta: p } };
  }

  // ================= A15 · cerrar por caducidad =================
  async _cerrar(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.propuesta_id) return this._invalid('propuesta_id');
    const est = await this.estado(d.project_id);
    const p = est.propuestas?.[d.propuesta_id];
    if (!p) return this._errorResponse(404, 'PROPUESTA_NO_CONSTA', 'no hay propuesta con ese id', { field: 'propuesta_id' });
    if (!VIVAS.includes(p.estado)) return this._errorResponse(409, 'YA_CERRADA', 'la propuesta ya tiene desenlace', { field: 'propuesta_id', desenlace: p.desenlace });

    const ahora = this._iso(d.ahora) || this.ahora();
    if (ahora < p.expira_en && d.forzar !== true) {
      return this._errorResponse(409, 'AUN_VIVA', 'la propuesta sigue dentro de su ventana', { field: 'ahora', expira_en: p.expira_en });
    }

    const sin_acuse = !p.hora_acuse;
    await this._resolver(
      d.project_id, p,
      sin_acuse ? 'CADUCADA_SIN_ACUSE' : 'CADUCADA_SIN_RESPUESTA',
      sin_acuse ? 'sin acuse del canal' : 'el rider no respondió'
    );
    return { status: 200, data: { propuesta: p } };
  }

  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');
    const est = await this.estado(d.project_id);
    const id = est.viva?.[d.pedido_id];
    const p = id ? est.propuestas?.[id] : null;
    if (!p || !VIVAS.includes(p.estado)) return this._errorResponse(404, 'NO_HAY', 'no hay propuesta viva para ese pedido', { field: 'pedido_id' });
    return { status: 200, data: { propuesta: p, vista: p.vista } };
  }

  // ================= desenlace único =================
  async _resolver(project_id, p, desenlace, motivo) {
    p.estado = desenlace;
    p.desenlace = desenlace;
    p.motivo = motivo;
    p.hora_desenlace = this.ahora();
    const est = await this.estado(project_id);
    if (est.viva?.[p.pedido_id] === p.propuesta_id) delete est.viva[p.pedido_id];
    await this.guardar(project_id);

    const carga = {
      propuesta_id: p.propuesta_id,
      pedido_id: p.pedido_id,
      rider_id: p.rider_id,
      plaza_id: p.plaza_id,
      hora: p.hora_desenlace,
      motivo,
      coste: 0
    };
    // Dos caducidades distintas, dos hechos distintos: el que lee sabe qué falló.
    if (desenlace === 'CADUCADA_SIN_ACUSE') this.hecho('bocaos.propuesta_caducada_sin_acuse', carga);
    else if (desenlace === 'CADUCADA_SIN_RESPUESTA') this.hecho('bocaos.propuesta_caducada_sin_respuesta', carga);
    return p;
  }

  // ================= M05 · los cuatro números, siempre en el mismo orden =================
  _vista(p) {
    const n = p.medidas;
    const u = p.politica.umbrales;
    return {
      orden: ['desvio_m', 'espera_min', 'retraso_min', 'cobra_cents'],
      numeros: { desvio_m: n.desvio_m, espera_min: n.espera_min, retraso_min: n.retraso_min, cobra_cents: n.cobra_cents },
      frase: `Te lo propongo porque pasas a ${n.desvio_m} m del local, esperarías ${n.espera_min} min y ganarías ${n.cobra_cents} céntimos.`,
      frase_umbrales: `Umbrales: los de ${p.politica.capa === 'tienda' ? 'la tienda' : 'la plaza'} ${p.politica.autor || ''}, versión ${p.politica.version}.`.replace('  ', ' '),
      plaza_id: p.plaza_id,
      umbrales: { desvio_m: u.desvio_m, espera_min: u.espera_min, retraso_min: u.retraso_min, cobra_min_cents: u.cobra_min_cents },
      politica: { capa: p.politica.capa, version: p.politica.version, autor: p.politica.autor },
      expira_en: p.expira_en
    };
  }
}

module.exports = Propuesta;
module.exports.VENTANA_S = VENTANA_S;
module.exports.DECISION_S = DECISION_S;
