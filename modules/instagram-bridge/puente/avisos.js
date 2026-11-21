'use strict';

/**
 * avisos — R4 · AvisoAnticipado · PUENTE.
 *
 * El puente avisa ANTES de que le pregunten. No es cortesia: es lo que evita que
 * el dueno descubra por su cuenta que la cuenta lleva dos dias caida, que una
 * publicacion no salio o que el acceso ha vencido. Un aviso tarde es una
 * reclamacion; el mismo aviso a tiempo es un puente que se cuida solo.
 *
 * LA REGLA DEL BLOQUE, Y POR QUE EXISTE:
 *   **UN aviso por causa y ventana.** Ni dos, ni «por si acaso», ni uno cada vez
 *   que se mira. Un aviso repetido no informa mas: entrena al dueno a ignorarlos,
 *   y entonces el que importa se pierde entre los otros. La anti-repeticion no es
 *   un detalle de confort, es lo que mantiene el canal util.
 *
 *   La `ventana` la declara quien llama (una fecha, un dia, un numero de semana:
 *   el reloj no vive aqui). Es obligatoria A PROPOSITO: sin ventana, la clave de
 *   anti-repeticion no se puede formar y el aviso o se repite para siempre o no
 *   se vuelve a dar nunca. Las dos cosas son peores que no avisar.
 *
 * DONDE SE CABLA (modulos REALES, no copias):
 *   `motor-avisos.producir.request` — el productor del repo
 *   (`modules/contabilidad-analitica/motor-avisos`). El produce el aviso y lo
 *   SUBE a `aviso-al-negocio.entregar.request`, que es el puente que lo entrega
 *   al negocio; detras de ese puente esta `adaptador-avisos`, que es quien tiene
 *   el canal. No se llama a `adaptador-avisos` directamente porque su tabla de
 *   tipos es cerrada y de otro proyecto (`terminado`, `cambio_filamento`,
 *   `cola_vacia`...): llamarlo con un aviso del puente seria pedirle un 400 y
 *   llamarlo «entregado». El camino real es el del productor.
 *
 *   Si no hay bus, o el productor no contesta, se devuelve `sin_productor` /
 *   `productor_no_contesto` y **no se marca como avisado**: no se puede decir
 *   «ya avise» de un aviso que no salio. Eso es exactamente lo que esta pieza
 *   existe para no hacer.
 *
 * MEMORIA: la anti-repeticion es un conjunto de claves en memoria, con `sembrar()`
 * para rehidratarlo y `avisados()` para leerlo. No se inventa un almacen aqui:
 * quien quiera que sobreviva a un reinicio guarda esas claves donde corresponda y
 * las siembra al arrancar. Guardar medio estado en un fichero propio seria un
 * segundo dueno de la misma verdad.
 *
 * PUENTE: compone y habla por el bus. Sin LLM (no hay nada que juzgar: un aviso
 * es un hecho que ya ocurrio o una causa que ya se sabe). Nunca lanza.
 */

const crypto = require('crypto');

const ORIGEN = 'instagram-bridge/aviso-anticipado';
const TIMEOUT_MS = 5000;

/**
 * El catalogo de causas: como se llama el aviso en el idioma del dueno y cuanto
 * pesa. El `detalle` NO se inventa aqui: lo trae quien sabe el hecho.
 */
const CAUSAS = Object.freeze({
  sesion_caida: Object.freeze({ titulo: 'La cuenta pide volver a entrar', severidad: 'alta' }),
  rotura: Object.freeze({ titulo: 'Algo que el puente sabia hacer ha dejado de servir', severidad: 'alta' }),
  cambio_de_plataforma: Object.freeze({ titulo: 'La otra parte ha cambiado algo', severidad: 'media' }),
  ritmo_al_limite: Object.freeze({ titulo: 'Bajo el ritmo para no quemar la cuenta', severidad: 'media' }),
  publicacion_no_salio: Object.freeze({ titulo: 'Una publicacion no ha salido', severidad: 'alta' }),
  respuesta_pendiente: Object.freeze({ titulo: 'Hay conversaciones esperando respuesta', severidad: 'media' }),
  sin_cobertura: Object.freeze({ titulo: 'Hay capacidades que hoy no puedo usar', severidad: 'alta' }),
  otro: Object.freeze({ titulo: 'Aviso del puente', severidad: 'info' })
});

const MOTIVOS = Object.freeze({
  AVISADO: 'avisado',
  YA_AVISADO: 'ya_avisado',
  SIN_CAUSA: 'sin_causa',
  SIN_VENTANA: 'sin_ventana',
  SIN_PROYECTO: 'sin_project_id',
  SIN_PRODUCTOR: 'sin_productor',
  PRODUCTOR_NO_CONTESTO: 'productor_no_contesto',
  PRODUCTOR_RECHAZO: 'productor_rechazo',
  PRODUCTOR_SIN_AVISO: 'productor_no_produjo_aviso'
});

// ---------------------------------------------------------------------------
// anti-repeticion: la regla, en una funcion pura
// ---------------------------------------------------------------------------

function _norm(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

/** La clave de la anti-repeticion: causa y ventana, juntas y sin adornos. */
function clave_de(causa, ventana) {
  const c = _norm(causa);
  const v = _norm(ventana);
  if (!c || !v) return null;
  return `${c}::${v}`;
}

/**
 * ¿Toca avisar? Puro: recibe lo ya avisado (Set, Map o array de claves) y
 * contesta. Devuelve tambien la clave para que el llamante la reuse.
 */
function debe_avisar(avisados, causa, ventana) {
  const clave = clave_de(causa, ventana);
  if (clave === null) {
    return {
      avisar: false,
      clave: null,
      motivo: _norm(causa) ? MOTIVOS.SIN_VENTANA : MOTIVOS.SIN_CAUSA
    };
  }
  return {
    avisar: !_contiene(avisados, clave),
    clave,
    motivo: _contiene(avisados, clave) ? MOTIVOS.YA_AVISADO : MOTIVOS.AVISADO
  };
}

function _contiene(avisados, clave) {
  if (!avisados) return false;
  if (avisados instanceof Set || avisados instanceof Map) return avisados.has(clave);
  if (Array.isArray(avisados)) return avisados.indexOf(clave) !== -1;
  return false;
}

// ---------------------------------------------------------------------------
// R4 · el puente
// ---------------------------------------------------------------------------

class AvisoAnticipado {
  /**
   * @param {{bus?:{publish:Function,subscribe?:Function}, productor?:Function,
   *          ya_avisados?:Iterable<string>, timeout_ms?:number}} [opciones]
   */
  constructor(opciones = {}) {
    this._bus = opciones.bus || null;
    // Puerto inyectable (pruebas, o un productor que no viva en este bus).
    this._productor = typeof opciones.productor === 'function' ? opciones.productor : null;
    this._avisados = new Set();
    this._timeout_ms = Number.isFinite(opciones.timeout_ms) ? opciones.timeout_ms : TIMEOUT_MS;
    if (opciones.ya_avisados) this.sembrar(opciones.ya_avisados);
  }

  /** Rehidrata la anti-repeticion (tras un reinicio o al arrancar el modulo). */
  sembrar(claves) {
    if (!claves) return 0;
    let n = 0;
    for (const c of claves) {
      if (typeof c !== 'string' || c.trim() === '') continue;
      if (!this._avisados.has(c)) { this._avisados.add(c); n += 1; }
    }
    return n;
  }

  /** Las claves ya avisadas, para que quien corresponda las guarde. */
  avisados() {
    return Array.from(this._avisados);
  }

  /** El bus del modulo, cuando el modulo arranca (el puente no adivina su bus). */
  con_bus(bus) {
    this._bus = bus || null;
    return this;
  }

  /** ¿Toca avisar de esta causa en esta ventana? No avisa: solo contesta. */
  decidir(causa, ventana) {
    return debe_avisar(this._avisados, causa, ventana);
  }

  /**
   * Avisa si toca. Idempotente por (causa, ventana): la segunda llamada del
   * mismo par no produce un segundo aviso.
   *
   * @param {{causa?:string, ventana?:string, project_id?:string, detalle?:string,
   *          titulo?:string, severidad?:string, momento?:string,
   *          correlation_id?:string}} peticion
   */
  async avisar(peticion = {}) {
    const d = peticion && typeof peticion === 'object' ? peticion : {};
    const causa = _norm(d.causa);
    const ventana = _norm(d.ventana);

    const decision = debe_avisar(this._avisados, causa, ventana);
    if (!decision.avisar) {
      return {
        ok: decision.motivo !== MOTIVOS.SIN_VENTANA && decision.motivo !== MOTIVOS.SIN_CAUSA,
        avisado: false,
        motivo: decision.motivo,
        clave: decision.clave,
        productor: null
      };
    }

    const project_id = _texto(d.project_id);
    if (project_id === null) {
      return { ok: false, avisado: false, motivo: MOTIVOS.SIN_PROYECTO, clave: decision.clave, productor: null };
    }

    const catalogo = CAUSAS[causa] || CAUSAS.otro;
    const aviso = {
      project_id,
      tipo: 'aviso',
      titulo: _texto(d.titulo) || catalogo.titulo,
      detalle: _texto(d.detalle),
      severidad: _texto(d.severidad) || catalogo.severidad,
      origen: ORIGEN,
      ref: decision.clave,
      senal: { causa, ventana, momento: _texto(d.momento), ref: decision.clave },
      correlation_id: _texto(d.correlation_id)
    };

    let respuesta = null;
    try {
      respuesta = await this._producir(aviso);
    } catch (err) {
      respuesta = { ok: false, motivo: MOTIVOS.PRODUCTOR_NO_CONTESTO, detalle: err && err.message };
    }

    if (!respuesta || respuesta.ok !== true) {
      // NO se marca: un aviso que no salio no es un aviso dado.
      return {
        ok: false,
        avisado: false,
        motivo: (respuesta && respuesta.motivo) || MOTIVOS.PRODUCTOR_NO_CONTESTO,
        clave: decision.clave,
        productor: respuesta && respuesta.productor ? respuesta.productor : null,
        causa_abierta: !CAUSAS[causa] ? 'la causa no esta en el catalogo: se avisa con el titulo del llamante y se declara' : null
      };
    }

    this._avisados.add(decision.clave);

    return {
      ok: true,
      avisado: true,
      motivo: MOTIVOS.AVISADO,
      clave: decision.clave,
      causa,
      ventana,
      aviso_id: respuesta.aviso_id || null,
      productor: respuesta.productor,
      causa_abierta: !CAUSAS[causa] ? 'la causa no esta en el catalogo: se avisa con el titulo del llamante y se declara' : null
    };
  }

  /**
   * El productor: primero el puerto inyectado; despues `motor-avisos` por el bus
   * (el camino real). Nunca devuelve un ok inventado.
   */
  async _producir(aviso) {
    if (this._productor) {
      const r = await this._productor(aviso);
      return _normalizar_productor(r, 'inyectado');
    }
    if (!this._bus || typeof this._bus.publish !== 'function') {
      return { ok: false, motivo: MOTIVOS.SIN_PRODUCTOR, productor: null };
    }

    const respuesta = await this._rpc('motor-avisos.producir.request', {
      project_id: aviso.project_id,
      tipo: aviso.tipo,
      titulo: aviso.titulo,
      detalle: aviso.detalle,
      severidad: aviso.severidad,
      origen: aviso.origen,
      ref: aviso.ref,
      senal: aviso.senal,
      correlation_id: aviso.correlation_id
    });

    if (!respuesta) return { ok: false, motivo: MOTIVOS.PRODUCTOR_NO_CONTESTO, productor: 'motor-avisos' };
    if (Number(respuesta.status) >= 400) {
      return { ok: false, motivo: MOTIVOS.PRODUCTOR_RECHAZO, productor: 'motor-avisos', codigo: respuesta.error && respuesta.error.code };
    }
    const avisoProducido = respuesta.data && respuesta.data.aviso;
    if (!avisoProducido) return { ok: false, motivo: MOTIVOS.PRODUCTOR_SIN_AVISO, productor: 'motor-avisos' };

    return { ok: true, productor: 'motor-avisos', aviso_id: avisoProducido.aviso_id || null };
  }

  /** RPC minimo sobre el bus: publica y espera la response correlada. */
  _rpc(evento, payload) {
    const bus = this._bus;
    if (!bus || typeof bus.publish !== 'function' || typeof bus.subscribe !== 'function') {
      return Promise.resolve(null);
    }
    const request_id = crypto.randomUUID();
    const responseEvent = evento.replace(/\.request$/, '.response');

    return new Promise((resolve) => {
      let unsub = null;
      let cerrado = false;
      const cerrar = (valor) => {
        if (cerrado) return;
        cerrado = true;
        clearTimeout(temporizador);
        try { if (unsub) unsub(); } catch (_) { /* el bus ya no escucha */ }
        resolve(valor);
      };
      const temporizador = setTimeout(() => cerrar(null), this._timeout_ms);
      try {
        unsub = bus.subscribe(responseEvent, (eventoBus) => {
          const datos = (eventoBus && eventoBus.data) || eventoBus;
          if (!datos || datos.request_id !== request_id) return;
          cerrar(datos);
        });
        bus.publish(evento, { request_id, ...payload });
      } catch (_) {
        cerrar(null);
      }
    });
  }
}

function _normalizar_productor(r, nombre) {
  if (r === true) return { ok: true, productor: nombre, aviso_id: null };
  if (!r || typeof r !== 'object') return { ok: false, motivo: MOTIVOS.PRODUCTOR_NO_CONTESTO, productor: nombre };
  if (r.ok === true) return { ok: true, productor: nombre, aviso_id: r.aviso_id || null };
  return { ok: false, motivo: r.motivo || MOTIVOS.PRODUCTOR_NO_CONTESTO, productor: nombre };
}

function _texto(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function describir() {
  return {
    regla: 'un aviso por causa y ventana',
    causas: Object.keys(CAUSAS),
    ventana: 'la declara quien llama (sin ventana no hay anti-repeticion: no se avisa)',
    productor: 'motor-avisos.producir.request (real) → aviso-al-negocio → adaptador-avisos',
    origen: ORIGEN
  };
}

module.exports = {
  CAUSAS,
  MOTIVOS,
  ORIGEN,
  clave_de,
  debe_avisar,
  AvisoAnticipado,
  describir
};
