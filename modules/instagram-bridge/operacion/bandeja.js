'use strict';

/**
 * bandeja — N1 · BandejaDeEspera · CUSTODIO (single-writer de su almacen).
 *
 * LO QUE ESPERA RESPUESTA. No un historial de mensajes: una lista de deudas.
 * Cada fila es alguien que escribio y todavia no tiene contestacion verificada.
 * Cuando la tenga, sale de la lista — y solo entonces.
 *
 * LA REGLA DEL BLOQUE, Y COMO SE HACE EJECUTABLE:
 *   **contestado sin veredicto "ocurrio" se RECHAZA.**
 *
 *   "Contestado" no es un estado que se pueda declarar: es una consecuencia que
 *   se observa. Aqui `marcar_contestado` exige `veredicto === 'ocurrio'` y un
 *   `evidencia_id`; si falta cualquiera de los dos, la marca NO se aplica y la
 *   espera SIGUE EN LA BANDEJA. No se cierra la fila y se devuelve un aviso: se
 *   rechaza la marca. La diferencia importa, porque un aviso se pierde en un
 *   log y una fila que sigue abierta se ve cada mañana.
 *
 *   El motivo es concreto: el fallo clasico de un puente es dar por contestado
 *   lo que se intento contestar. Un `ok` de la mano, un borrador guardado, un
 *   texto preparado — nada de eso es que la persona lo haya recibido. Si la
 *   bandeja se vacia con eso, la siguiente persona que escriba espera detras de
 *   una deuda que ya nadie recuerda.
 *
 * LO QUE TAMPOCO HACE:
 *   - **No reabre lo contestado.** Reenviar el mismo `mensaje_id` no vuelve a
 *     poner la fila en `esperando`: contestar dos veces la misma cosa es peor
 *     que no contestarla.
 *   - **No silencia una queja.** Puede guardar un silencio decidido por N5,
 *     pero si la fila es una queja lo rechaza aunque la decision diga que si.
 *     Es defensa en profundidad: la regla no depende de que el llamante haya
 *     consultado a N5.
 *   - **No redacta.** El texto de la respuesta es de N3; aqui solo se guarda su
 *     veredicto y su evidencia.
 *
 * Nada se persiste sin auditar, y un almacen ilegible NO se sobrescribe.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, validar_sello_de_cuenta } = require('../core/formas');
const no_secretos = require('../core/no-secretos');
const { CustodiaJSON } = require('./custodia');
const { es_queja } = require('./silencio');

const ESQUEMA = 'bandeja-de-espera-v1';
const ALMACEN = 'bandeja';
const FICHERO = 'bandeja.json';
const CLAVE = 'esperas';

const ESTADOS = Object.freeze(['esperando', 'contestado', 'silenciado']);
const VEREDICTOS = Object.freeze(['ocurrio', 'no_ocurrio', 'no_se_sabe']);

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  SIN_SELLO: 'sin_sello_de_cuenta',
  SIN_CONVERSACION: 'sin_conversacion',
  SIN_MENSAJE: 'sin_mensaje',
  SIN_REMITENTE: 'sin_remitente',
  SIN_MOMENTO: 'sin_momento',
  MOMENTO_INVALIDO: 'momento_invalido',
  ESPERA_NO_ENCONTRADA: 'espera_no_encontrada',
  // la regla
  CONTESTADO_SIN_VEREDICTO_OCURRIO: 'contestado_sin_veredicto_ocurrio',
  SIN_EVIDENCIA: 'contestado_sin_evidencia',
  YA_CONTESTADA: 'ya_contestada',
  // silencio
  SIN_DECISION_DE_SILENCIO: 'sin_decision_de_silencio',
  SIN_DECISION_ID: 'sin_decision_id',
  UNA_QUEJA_NO_SE_SILENCIA: 'una_queja_no_se_silencia',
  // auditoria
  SECRETO_RECIBIDO: 'secreto_recibido',
  ESTADO_DESCONOCIDO: 'estado_desconocido',
  ESPERA_DUPLICADA: 'espera_duplicada',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  ALMACEN_NO_AUDITADO: 'almacen_no_auditado'
});

const CAMPOS_DE_TEXTO_DEL_MENSAJE = Object.freeze(['texto', 'caption', 'pie']);

// ---------------------------------------------------------------------------
// normalizacion (puro)
// ---------------------------------------------------------------------------

function espera_id_de(sello, conversacion_id, mensaje_id) {
  return `${sello.proyecto}:${sello.plataforma}:${sello.cuenta}:${conversacion_id}:${mensaje_id}`;
}

/**
 * Valida una llegada a la bandeja. Sin conversacion o sin mensaje no hay a que
 * contestar; sin remitente no hay a quien; sin fecha de llegada no hay orden
 * (y una bandeja sin orden no es una cola, es un monton).
 */
function preparar(entrada) {
  if (!es_objeto(entrada)) {
    return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['espera'], invalidos: [] };
  }

  const sello_v = validar_sello_de_cuenta(entrada.sello);
  if (!sello_v.ok) return { ok: false, motivo: MOTIVOS.SIN_SELLO, faltan: sello_v.faltan, invalidos: sello_v.invalidos };
  const sello = {
    proyecto: String(entrada.sello.proyecto).trim(),
    cuenta: String(entrada.sello.cuenta).trim(),
    plataforma: String(entrada.sello.plataforma === undefined ? 'instagram' : entrada.sello.plataforma).trim()
  };

  const faltan = [];
  if (!texto_no_vacio(entrada.conversacion_id)) faltan.push('conversacion_id');
  if (!texto_no_vacio(entrada.mensaje_id)) faltan.push('mensaje_id');
  if (!texto_no_vacio(entrada.remitente)) faltan.push('remitente');
  if (!es_instante(entrada.momento)) faltan.push('momento');
  if (faltan.length) {
    const motivo = faltan.includes('momento') ? MOTIVOS.SIN_MOMENTO
      : faltan.includes('conversacion_id') ? MOTIVOS.SIN_CONVERSACION
        : faltan.includes('mensaje_id') ? MOTIVOS.SIN_MENSAJE : MOTIVOS.SIN_REMITENTE;
    return { ok: false, motivo, faltan };
  }

  const conversacion_id = String(entrada.conversacion_id).trim();
  const mensaje_id = String(entrada.mensaje_id).trim();

  const espera = {
    espera_id: texto_no_vacio(entrada.espera_id)
      ? String(entrada.espera_id).trim()
      : espera_id_de(sello, conversacion_id, mensaje_id),
    sello,
    conversacion_id,
    mensaje_id,
    remitente: String(entrada.remitente).trim(),
    texto: typeof entrada.texto === 'string' ? entrada.texto : '',
    tipo: texto_no_vacio(entrada.tipo) ? String(entrada.tipo).trim() : 'dm',
    clase: texto_no_vacio(entrada.clase) ? String(entrada.clase).trim() : null,
    delicado: entrada.delicado === true,
    momento: String(entrada.momento),
    estado: 'esperando',
    contestado_en: null,
    veredicto: null,
    evidencia_id: null,
    silencio: null
  };

  return { ok: true, espera };
}

// ---------------------------------------------------------------------------
// auditoria (puro)
// ---------------------------------------------------------------------------

function auditar(estado) {
  const problemas = [];
  if (!es_objeto(estado) || !Array.isArray(estado[CLAVE])) {
    return { ok: false, problemas: [{ motivo: MOTIVOS.ESQUEMA_DESCONOCIDO, campo: 'almacen' }] };
  }

  const ids = new Set();
  estado[CLAVE].forEach((e, i) => {
    const donde = `esperas[${i}]`;
    if (!es_objeto(e)) { problemas.push({ motivo: MOTIVOS.ENTRADA_INVALIDA, campo: donde }); return; }

    if (!validar_sello_de_cuenta(e.sello).ok) problemas.push({ motivo: MOTIVOS.SIN_SELLO, campo: `${donde}.sello`, espera_id: e.espera_id });
    if (!texto_no_vacio(e.conversacion_id)) problemas.push({ motivo: MOTIVOS.SIN_CONVERSACION, campo: `${donde}.conversacion_id` });
    if (!texto_no_vacio(e.mensaje_id)) problemas.push({ motivo: MOTIVOS.SIN_MENSAJE, campo: `${donde}.mensaje_id` });
    if (!es_instante(e.momento)) problemas.push({ motivo: MOTIVOS.SIN_MOMENTO, campo: `${donde}.momento` });

    if (texto_no_vacio(e.espera_id)) {
      if (ids.has(e.espera_id)) problemas.push({ motivo: MOTIVOS.ESPERA_DUPLICADA, campo: `${donde}.espera_id`, espera_id: e.espera_id });
      ids.add(e.espera_id);
    }

    if (!ESTADOS.includes(e.estado)) {
      problemas.push({ motivo: MOTIVOS.ESTADO_DESCONOCIDO, campo: `${donde}.estado`, espera_id: e.espera_id });
    }

    // La regla, aplicada tambien a lo ya guardado: una fila contestada sin
    // veredicto `ocurrio` (o sin evidencia) es un exceso, venga de donde venga.
    if (e.estado === 'contestado') {
      if (e.veredicto !== 'ocurrio') {
        problemas.push({ motivo: MOTIVOS.CONTESTADO_SIN_VEREDICTO_OCURRIO, campo: `${donde}.veredicto`, espera_id: e.espera_id, veredicto: e.veredicto === undefined ? null : e.veredicto });
      }
      if (!texto_no_vacio(e.evidencia_id)) problemas.push({ motivo: MOTIVOS.SIN_EVIDENCIA, campo: `${donde}.evidencia_id`, espera_id: e.espera_id });
      if (!es_instante(e.contestado_en)) problemas.push({ motivo: MOTIVOS.MOMENTO_INVALIDO, campo: `${donde}.contestado_en`, espera_id: e.espera_id });
    }

    if (e.estado === 'silenciado') {
      const s = es_objeto(e.silencio) ? e.silencio : {};
      if (!texto_no_vacio(s.decision_id)) problemas.push({ motivo: MOTIVOS.SIN_DECISION_ID, campo: `${donde}.silencio.decision_id`, espera_id: e.espera_id });
      if (e.clase === 'queja' || es_queja(e.texto)) {
        problemas.push({ motivo: MOTIVOS.UNA_QUEJA_NO_SE_SILENCIA, campo: `${donde}.estado`, espera_id: e.espera_id });
      }
    }

    const hallazgos = no_secretos.detectar_secreto({ texto: e.texto, remitente: e.remitente });
    for (const h of hallazgos) problemas.push({ motivo: MOTIVOS.SECRETO_RECIBIDO, campo: `${donde}.${h.ruta}`, espera_id: e.espera_id });
  });

  return { ok: problemas.length === 0, problemas, esperas: estado[CLAVE].length };
}

function sellos_coinciden(espera, consulta) {
  if (!es_objeto(consulta) || !es_objeto(consulta.sello)) return true;
  const c = consulta.sello;
  const plataforma = c.plataforma === undefined ? 'instagram' : c.plataforma;
  return espera.sello.proyecto === c.proyecto
    && espera.sello.cuenta === c.cuenta
    && espera.sello.plataforma === plataforma;
}

/**
 * Lo que sigue esperando, en orden de llegada (FIFO). El orden no es cosmetico:
 * es la unica forma de que la persona que lleva dos dias esperando no quede
 * detras de la que acaba de escribir.
 */
function pendientes(estado, consulta) {
  const lista = Array.isArray(estado[CLAVE]) ? estado[CLAVE] : [];
  const cola = lista
    .map((e, i) => ({ e, i }))
    .filter((x) => x.e.estado === 'esperando' && sellos_coinciden(x.e, consulta))
    .sort((a, b) => (Date.parse(a.e.momento) - Date.parse(b.e.momento)) || (a.i - b.i))
    .map((x) => clonar(x.e));
  return { ok: true, esperas: cola, total: cola.length };
}

function resumen(estado, consulta) {
  const lista = (Array.isArray(estado[CLAVE]) ? estado[CLAVE] : []).filter((e) => sellos_coinciden(e, consulta));
  const cuenta = { esperando: 0, contestado: 0, silenciado: 0 };
  for (const e of lista) if (cuenta[e.estado] !== undefined) cuenta[e.estado] += 1;
  return { ok: true, total: lista.length, ...cuenta };
}

function buscar(estado, espera_id) {
  const id = texto_no_vacio(espera_id) ? String(espera_id).trim() : null;
  if (!id) return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['espera_id'] };
  const e = (Array.isArray(estado[CLAVE]) ? estado[CLAVE] : []).find((x) => x && x.espera_id === id) || null;
  return { ok: true, encontrada: e !== null, espera: e ? clonar(e) : null };
}

// ---------------------------------------------------------------------------
// el custodio
// ---------------------------------------------------------------------------

class BandejaDeEspera extends CustodiaJSON {
  constructor(opts = {}) {
    super({
      directorio: opts.directorio,
      fichero: opts.fichero || FICHERO,
      esquema: ESQUEMA,
      almacen: ALMACEN,
      clave: CLAVE,
      reloj: opts.reloj
    });
  }

  /**
   * Anota una llegada. Idempotente por `espera_id` (o por el par
   * conversacion+mensaje, que es de donde sale). Lo contestado no se reabre.
   */
  entrar(entrada) {
    return this._mutar((estado) => {
      const p = preparar(entrada);
      if (!p.ok) return Object.assign({}, p, { guardado: false });

      const ya = estado[CLAVE].find((e) => e
        && (e.espera_id === p.espera.espera_id
          || (e.conversacion_id === p.espera.conversacion_id && e.mensaje_id === p.espera.mensaje_id))) || null;

      if (ya) {
        return {
          ok: true,
          espera_id: ya.espera_id,
          repetido: true,
          estado: ya.estado,
          reabierta: false,
          sin_escritura: true,
          en_bandeja: ya.estado === 'esperando'
        };
      }

      estado[CLAVE] = estado[CLAVE].concat([Object.assign({}, p.espera, { encolada_en: this._reloj() })]);
      return { ok: true, espera_id: p.espera.espera_id, repetido: false, estado: 'esperando', en_bandeja: true };
    }, auditar);
  }

  /**
   * Marca una espera como contestada. SOLO con veredicto `ocurrio` y evidencia:
   * lo demas se rechaza y la fila sigue esperando.
   */
  marcar_contestado(peticion) {
    return this._mutar((estado) => {
      if (!es_objeto(peticion) || !texto_no_vacio(peticion.espera_id)) {
        return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['espera_id'], marcada: false };
      }
      const id = String(peticion.espera_id).trim();
      const i = estado[CLAVE].findIndex((e) => e && e.espera_id === id);
      if (i < 0) return { ok: false, motivo: MOTIVOS.ESPERA_NO_ENCONTRADA, espera_id: id, marcada: false };

      const e = estado[CLAVE][i];
      if (e.estado === 'contestado') {
        // Reintento del bus con la misma prueba: idempotente, no un error.
        if (e.veredicto === 'ocurrio' && peticion.veredicto === 'ocurrio') {
          return { ok: true, espera_id: id, repetido: true, estado: 'contestado', sin_escritura: true };
        }
        return { ok: false, motivo: MOTIVOS.YA_CONTESTADA, espera_id: id, estado: e.estado, marcada: false };
      }
      if (e.estado === 'silenciado') {
        return { ok: false, motivo: MOTIVOS.YA_CONTESTADA, espera_id: id, estado: e.estado, marcada: false };
      }

      // ---- LA REGLA ------------------------------------------------------
      if (peticion.veredicto !== 'ocurrio') {
        return {
          ok: false,
          motivo: MOTIVOS.CONTESTADO_SIN_VEREDICTO_OCURRIO,
          espera_id: id,
          veredicto_recibido: peticion.veredicto === undefined ? null : peticion.veredicto,
          veredictos_admitidos: VEREDICTOS.slice(),
          marcada: false,
          sigue_esperando: true,
          estado: 'esperando'
        };
      }
      if (!texto_no_vacio(peticion.evidencia_id)) {
        return {
          ok: false,
          motivo: MOTIVOS.SIN_EVIDENCIA,
          espera_id: id,
          marcada: false,
          sigue_esperando: true,
          estado: 'esperando'
        };
      }
      if (!es_instante(peticion.contestado_en)) {
        return { ok: false, motivo: MOTIVOS.MOMENTO_INVALIDO, campo: 'contestado_en', marcada: false, sigue_esperando: true, estado: 'esperando' };
      }
      if (Date.parse(peticion.contestado_en) < Date.parse(e.momento)) {
        return { ok: false, motivo: MOTIVOS.MOMENTO_INVALIDO, campo: 'contestado_en', detalle: 'anterior_a_la_llegada', marcada: false, sigue_esperando: true, estado: 'esperando' };
      }

      estado[CLAVE][i] = Object.assign({}, e, {
        estado: 'contestado',
        veredicto: 'ocurrio',
        evidencia_id: String(peticion.evidencia_id).trim(),
        contestado_en: String(peticion.contestado_en)
      });

      return { ok: true, espera_id: id, estado: 'contestado', veredicto: 'ocurrio', marcada: true };
    }, auditar);
  }

  /**
   * Guarda un silencio DECIDIDO (N5). No lo decide aqui. Si la fila es una
   * queja, se rechaza aunque la decision venga firmada: una queja se escala.
   */
  marcar_silenciado(peticion) {
    return this._mutar((estado) => {
      if (!es_objeto(peticion) || !texto_no_vacio(peticion.espera_id)) {
        return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['espera_id'], marcada: false };
      }
      const id = String(peticion.espera_id).trim();
      const i = estado[CLAVE].findIndex((e) => e && e.espera_id === id);
      if (i < 0) return { ok: false, motivo: MOTIVOS.ESPERA_NO_ENCONTRADA, espera_id: id, marcada: false };

      const e = estado[CLAVE][i];
      if (e.estado === 'contestado') return { ok: false, motivo: MOTIVOS.YA_CONTESTADA, espera_id: id, estado: e.estado, marcada: false };

      const d = peticion.decision;
      if (!es_objeto(d) || d.decision !== 'silencio' || d.silencio !== true) {
        return { ok: false, motivo: MOTIVOS.SIN_DECISION_DE_SILENCIO, espera_id: id, marcada: false, estado: e.estado };
      }
      if (!texto_no_vacio(peticion.decision_id)) {
        return { ok: false, motivo: MOTIVOS.SIN_DECISION_ID, espera_id: id, marcada: false };
      }
      if (e.clase === 'queja' || es_queja(e.texto)) {
        return {
          ok: false,
          motivo: MOTIVOS.UNA_QUEJA_NO_SE_SILENCIA,
          espera_id: id,
          marcada: false,
          estado: e.estado,
          escala_a: 'persona'
        };
      }
      if (!es_instante(peticion.decidido_en)) {
        return { ok: false, motivo: MOTIVOS.MOMENTO_INVALIDO, campo: 'decidido_en', marcada: false };
      }

      estado[CLAVE][i] = Object.assign({}, e, {
        estado: 'silenciado',
        silencio: {
          decision_id: String(peticion.decision_id).trim(),
          motivo: texto_no_vacio(d.motivo) ? String(d.motivo).trim() : null,
          decidido_en: String(peticion.decidido_en),
          decidido_por: texto_no_vacio(peticion.decidido_por) ? String(peticion.decidido_por).trim() : 'agente'
        }
      });

      return { ok: true, espera_id: id, estado: 'silenciado', marcada: true };
    }, auditar);
  }

  pendientes(consulta) {
    return this._consultar((estado) => pendientes(estado, consulta));
  }

  resumen(consulta) {
    return this._consultar((estado) => resumen(estado, consulta));
  }

  leer(espera_id) {
    return this._consultar((estado) => buscar(estado, espera_id));
  }

  auditar_almacen() {
    return this._consultar((estado) => auditar(estado));
  }
}

module.exports = {
  ESQUEMA,
  ALMACEN,
  FICHERO,
  ESTADOS,
  VEREDICTOS,
  MOTIVOS,
  preparar,
  auditar,
  pendientes,
  resumen,
  buscar,
  BandejaDeEspera
};

module.exports.BandejaDeEsperaPieza = Object.freeze({
  preparar,
  auditar,
  pendientes,
  MOTIVOS
});
