'use strict';

/**
 * evidencia — O3 · EvidenciaConservada · CUSTODIO (single-writer de su almacen).
 *
 * Guarda la prueba de lo que ocurrio, y NO inventa una bitacora paralela: la
 * escribe en la bitacora REAL del cerebro (`agentes-bitacora`, en
 * `/opt/enki/modules/agentes/bitacora`), que es la unica que sabe donde vive
 * `data/projects/<project_id>/storage/agentes/bitacoras/<request_id>.json`.
 *
 * Por que mapear y no reimplementar:
 *   - La bitacora ya es CUSTODIO de los pasos de una ejecucion: abrir, anotar
 *     paso y sellar con veredicto. Si el puente escribiera su propio fichero de
 *     bitacora habria DOS memorias de la misma ejecucion y ninguna seria la
 *     buena. Aqui solo se emiten las peticiones del contrato que ya existe:
 *
 *       bitacora.abrir.request   { request_id, project_id, agent_name, task }
 *       bitacora.paso.request    { request_id, project_id, paso, message, tool_invoked }
 *       bitacora.sellar.request  { request_id, project_id, veredicto, duracion_ms }
 *       bitacora.leer.request    { request_id, project_id }
 *
 *   - Lo que SI es de este custodio es la evidencia: el registro sellado, con
 *     su veredicto y sus pruebas, escrito de forma atomica en
 *     `storage/instagram-bridge/evidencia/<request_id>.json`. Es el respaldo
 *     local cuando el bus no esta: se puede reemitir con `mapear()` sin perder
 *     nada, porque el registro es la fuente y la bitacora el destino.
 *
 * Reglas que esta pieza hace ejecutables:
 *   - **Sin sello de cuenta no hay evidencia** (P1). Se rechaza con
 *     `sin_sello_de_cuenta` ANTES de escribir una sola linea: una evidencia sin
 *     dueno no se puede atribuir a nadie.
 *   - **Aislamiento** (P2/P3). El `proyecto` del registro tiene que ser el del
 *     sello; si no, es `proyecto_ajeno` y no se guarda. Un proyecto no escribe
 *     evidencia de otro.
 *   - **`NoSeSabe` viaja con `que_haria_falta`**. Una evidencia que dice "no se"
 *     sin decir que haria falta es una excusa, y se rechaza.
 *   - **`Ocurrio` exige prueba**. Un paso `ocurrio` sin `prueba.nodo_id` no entra.
 *   - **Ningun secreto entra** (V1). Se audita el registro entero antes de
 *     escribir y se nombran las rutas donde venia la credencial.
 *   - **Nada se persiste sin auditar.** `auditar()` corre antes de cada
 *     escritura; si el registro no pasa, no se escribe y se devuelve el fallo.
 *   - **Escritura atomica + single-writer.** Temporal y `rename` en el mismo
 *     directorio, y una cola de promesas para que dos evidencias simultaneas no
 *     se pisen el fichero.
 *   - **Un fallo se devuelve como fallo** (`ok:false` + motivo). No hay respuesta
 *     `ok:true` con un `guardado:false` escondido.
 *
 * Sin dependencias npm nuevas: solo `fs/promises`, `path` y las piezas de
 * `core/` que ya existen (`formas`, `no-secretos`).
 */

const path = require('path');
const fsp = require('fs/promises');

const {
  es_objeto,
  texto_no_vacio,
  es_instante,
  clonar,
  validar_sello_de_cuenta
} = require('../core/formas');
const no_secretos = require('../core/no-secretos');

const ESQUEMA = 'evidencia-ejecucion-v1';

/** Contrato real de `agentes-bitacora` (module.json). No se inventa otro. */
const TOPICS = Object.freeze({
  ABRIR: 'bitacora.abrir.request',
  PASO: 'bitacora.paso.request',
  SELLAR: 'bitacora.sellar.request',
  LEER: 'bitacora.leer.request'
});

/** Los tres resultados de O1/O2. Ni uno mas: no hay "parcial". */
const VEREDICTOS = Object.freeze(['ocurrio', 'no_ocurrio', 'no_se_sabe']);

const MOTIVOS = Object.freeze({
  SIN_SELLO_DE_CUENTA: 'sin_sello_de_cuenta',
  PROYECTO_AJENO: 'proyecto_ajeno',
  ENTRADA_INVALIDA: 'entrada_invalida',
  VEREDICTO_DESCONOCIDO: 'veredicto_desconocido',
  NO_SE_SIN_QUE_HARIA_FALTA: 'no_se_sabe_sin_que_haria_falta',
  OCURRIO_SIN_PRUEBA: 'ocurrio_sin_prueba',
  SECRETO_RECIBIDO: 'secreto_recibido',
  EVIDENCIA_NO_AUDITADA: 'evidencia_no_auditada',
  NO_SE_PUDO_GUARDAR: 'no_se_pudo_guardar',
  SIN_BITACORA: 'sin_bitacora'
});

// `<request_id>` acaba siendo nombre de fichero en la bitacora real (ella misma
// sanea, pero no se le pasa basura): solo minusculas, digitos, guion y guion bajo.
const REQUEST_RE = /^[A-Za-z0-9_-]{1,120}$/;

// Directorio de la evidencia local. `ENKI_INSTAGRAM_STORAGE` existe para poder
// apuntar a otro sitio en pruebas, como en el padron.
const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign(
    { ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [], guardado: false },
    extra || {}
  );
}

function lista(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') return [v];
  return [];
}

/** Congela el sello de cuenta: es la firma de la evidencia y no se reescribe. */
function sello_congelado(partes) {
  return Object.freeze({
    proyecto: String(partes.proyecto).trim(),
    cuenta: String(partes.cuenta).trim(),
    plataforma: String(partes.plataforma === undefined ? 'instagram' : partes.plataforma).trim()
  });
}

/** Rechaza cualquier entrada que lleve un secreto, diciendo la ruta (V1). */
function guardia_secretos(entrada) {
  const hallazgos = no_secretos.detectar_secreto(entrada);
  if (hallazgos.length === 0) return null;
  return fallo(MOTIVOS.SECRETO_RECIBIDO, [], [], {
    rutas: hallazgos.map((h) => h.ruta),
    familias: no_secretos.familias_de(hallazgos)
  });
}

/**
 * Normaliza un paso tal y como lo entrega O2: numero, resultado y, segun el
 * caso, la prueba o lo que haria falta. No rellena: lo que no venga, se nombra.
 */
function normalizar_paso(paso, indice) {
  const p = es_objeto(paso) ? paso : {};
  const numero = Number.isInteger(p.paso) ? p.paso : indice + 1;
  const resultado = p.resultado === undefined ? p.veredicto : p.resultado;
  const salida = { paso: numero, resultado, resultado_conocido: VEREDICTOS.includes(resultado) };

  if (resultado === 'ocurrio') {
    const prueba = es_objeto(p.prueba) ? p.prueba : {};
    salida.prueba = {
      nodo_id: texto_no_vacio(prueba.nodo_id) ? String(prueba.nodo_id).trim() : null,
      ancla: texto_no_vacio(prueba.ancla) ? String(prueba.ancla).trim() : null,
      momento: Number.isFinite(prueba.momento) ? prueba.momento : null,
      cuenta: texto_no_vacio(prueba.cuenta) ? String(prueba.cuenta).trim() : null
    };
  }

  if (resultado === 'no_se_sabe') {
    const falta = p.que_haria_falta;
    salida.que_haria_falta = texto_no_vacio(falta) ? String(falta).trim() : null;
    if (es_objeto(falta)) {
      salida.que_haria_falta = texto_no_vacio(falta.descripcion)
        ? String(falta.descripcion).trim()
        : (texto_no_vacio(falta.motivo) ? String(falta.motivo).trim() : null);
    }
  }

  return salida;
}

/**
 * Audita el registro ANTES de escribirlo. Devuelve `{ok, problemas}` y nombra
 * cada problema con su campo: un rechazo sin campo es un enfado, no un informe.
 */
function auditar(registro) {
  if (!es_objeto(registro)) {
    return { ok: false, problemas: [{ campo: 'registro', motivo: 'sin_dato' }] };
  }

  const problemas = [];

  const sello = validar_sello_de_cuenta(registro.sello);
  if (!sello.ok) {
    problemas.push({
      campo: 'sello',
      motivo: MOTIVOS.SIN_SELLO_DE_CUENTA,
      faltan: sello.faltan,
      invalidos: sello.invalidos
    });
  } else {
    if (registro.proyecto !== registro.sello.proyecto) {
      problemas.push({ campo: 'proyecto', motivo: MOTIVOS.PROYECTO_AJENO });
    }
    if (registro.cuenta !== registro.sello.cuenta) {
      problemas.push({ campo: 'cuenta', motivo: 'cuenta_distinta_del_sello' });
    }
    if (registro.plataforma !== registro.sello.plataforma) {
      problemas.push({ campo: 'plataforma', motivo: 'plataforma_distinta_del_sello' });
    }
  }

  if (!texto_no_vacio(registro.request_id) || !REQUEST_RE.test(String(registro.request_id))) {
    problemas.push({ campo: 'request_id', motivo: MOTIVOS.ENTRADA_INVALIDA });
  }

  if (!VEREDICTOS.includes(registro.veredicto)) {
    problemas.push({ campo: 'veredicto', motivo: MOTIVOS.VEREDICTO_DESCONOCIDO });
  }

  if (registro.veredicto === 'no_se_sabe' && lista(registro.que_haria_falta).length === 0) {
    problemas.push({ campo: 'que_haria_falta', motivo: MOTIVOS.NO_SE_SIN_QUE_HARIA_FALTA });
  }

  const pasos = Array.isArray(registro.pasos) ? registro.pasos : [];
  if (pasos.length === 0) {
    problemas.push({ campo: 'pasos', motivo: 'sin_pasos' });
  }
  pasos.forEach((paso, i) => {
    if (!VEREDICTOS.includes(paso.resultado)) {
      problemas.push({ campo: `pasos[${i}].resultado`, motivo: MOTIVOS.VEREDICTO_DESCONOCIDO });
      return;
    }
    if (paso.resultado === 'ocurrio' && !(es_objeto(paso.prueba) && texto_no_vacio(paso.prueba.nodo_id))) {
      problemas.push({ campo: `pasos[${i}].prueba`, motivo: MOTIVOS.OCURRIO_SIN_PRUEBA });
    }
    if (paso.resultado === 'no_se_sabe' && !texto_no_vacio(paso.que_haria_falta)) {
      problemas.push({ campo: `pasos[${i}].que_haria_falta`, motivo: MOTIVOS.NO_SE_SIN_QUE_HARIA_FALTA });
    }
  });

  const hallazgos = no_secretos.detectar_secreto(registro);
  if (hallazgos.length > 0) {
    problemas.push({
      campo: '(raiz)',
      motivo: MOTIVOS.SECRETO_RECIBIDO,
      rutas: hallazgos.map((h) => h.ruta)
    });
  }

  return { ok: problemas.length === 0, problemas };
}

// ---------------------------------------------------------------------------
// El mapeo a la bitacora real (una sola direccion: evidencia -> peticiones)
// ---------------------------------------------------------------------------

function mensaje_de_paso(paso) {
  if (paso.resultado === 'ocurrio') {
    const nodo = paso.prueba && paso.prueba.nodo_id ? paso.prueba.nodo_id : '(sin nodo)';
    return `consecuencia del paso ${paso.paso}: ocurrio (nodo ${nodo})`;
  }
  if (paso.resultado === 'no_ocurrio') {
    return `consecuencia del paso ${paso.paso}: no ocurrio (ausencia probada en mirada completa)`;
  }
  return `consecuencia del paso ${paso.paso}: no se sabe. Hace falta: ${paso.que_haria_falta || '(sin declarar)'}`;
}

/**
 * Traduce el registro a las peticiones EXACTAS del contrato de `agentes-bitacora`.
 *
 * La bitacora decide estado y escribe: aqui solo se le pide. El veredicto viaja
 * con `verificado: true` solo cuando ocurrio; un `no_se_sabe` va con
 * `no_confirmado: true` para que nadie lo lea como una verificacion.
 */
function mapear(registro) {
  const base = { request_id: registro.request_id, project_id: registro.proyecto };
  const peticiones = [
    {
      topic: TOPICS.ABRIR,
      payload: Object.assign({}, base, {
        agent_name: registro.agente,
        task: registro.tarea === null ? null : registro.tarea
      })
    }
  ];

  for (const paso of registro.pasos) {
    peticiones.push({
      topic: TOPICS.PASO,
      payload: Object.assign({}, base, {
        paso: `consecuencia_${paso.paso}`,
        message: mensaje_de_paso(paso),
        tool_invoked: `instagram-bridge:${registro.cuenta}`
      })
    });
  }

  const veredicto = {
    resultado: registro.veredicto,
    verificado: registro.veredicto === 'ocurrio',
    no_confirmado: registro.veredicto === 'no_se_sabe',
    pruebas: registro.pasos.filter((p) => p.resultado === 'ocurrio').map((p) => p.prueba),
    que_haria_falta: lista(registro.que_haria_falta)
  };
  const sellar = Object.assign({}, base, { veredicto });
  if (Number.isFinite(registro.duracion_ms)) sellar.duracion_ms = registro.duracion_ms;

  peticiones.push({ topic: TOPICS.SELLAR, payload: sellar });
  return peticiones;
}

// ---------------------------------------------------------------------------
// O3 · EvidenciaConservada
// ---------------------------------------------------------------------------

class EvidenciaConservada {
  /**
   * @param {{directorio?:string, eventBus?:{publish:Function}, reloj?:()=>string}} [opts]
   *   `reloj` solo fecha el METADATO del fichero (`guardado_en`); el momento de
   *   negocio SIEMPRE lo trae el payload (P1).
   */
  constructor(opts = {}) {
    this.name = 'evidencia-conservada';
    this.version = '0.1.0';

    this._directorio = opts.directorio
      || process.env.ENKI_INSTAGRAM_EVIDENCIA
      || path.join(process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO, 'evidencia');

    this.eventBus = opts.eventBus || null;
    this.logger = opts.logger || null;
    this._reloj = opts.reloj || (() => new Date().toISOString());

    this._cola = Promise.resolve(); // candado de single-writer
    this._escrituras = 0;
    this._peticiones = 0;
  }

  /** El bus se puede inyectar despues (loader del cerebro). */
  onLoad(context) {
    if (context && context.eventBus) this.eventBus = context.eventBus;
    if (context && context.logger) this.logger = context.logger;
    return this;
  }

  _ruta(request_id) {
    return path.join(this._directorio, `${String(request_id).replace(/[^A-Za-z0-9_-]/g, '')}.json`);
  }

  /**
   * Escritura atomica: temporal + rename en el mismo directorio. Un corte a
   * mitad no deja una evidencia truncada: deja la anterior (o ninguna).
   */
  async _escribir(registro) {
    await fsp.mkdir(this._directorio, { recursive: true });
    const destino = this._ruta(registro.request_id);
    const temporal = `${destino}.${process.pid}.tmp`;
    await fsp.writeFile(temporal, `${JSON.stringify(registro, null, 2)}\n`, 'utf8');
    await fsp.rename(temporal, destino);
    this._escrituras += 1;
    return destino;
  }

  /**
   * GUARDAR: valida, audita, escribe atomico y mapea a la bitacora real.
   *
   * @param {object} entrada
   *   {request_id, sello, proyecto, agente, tarea?, momento, veredicto,
   *    pasos:[{paso, resultado, prueba?|que_haria_falta?}],
   *    que_haria_falta?, duracion_ms?}
   */
  guardar(entrada) {
    const siguiente = this._cola.then(() => this._guardar(entrada));
    // El candado no se rompe porque una evidencia sea rechazada.
    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  async _guardar(entrada) {
    const e = es_objeto(entrada) ? entrada : {};

    // 1 · P1: el sello de cuenta es la firma. Sin el, no hay evidencia que guardar.
    const v = validar_sello_de_cuenta(e.sello);
    if (!v.ok) {
      return fallo(MOTIVOS.SIN_SELLO_DE_CUENTA, v.faltan, v.invalidos);
    }
    const sello = sello_congelado(e.sello);

    // 2 · V1: ni una credencial entra en la evidencia.
    const secreto = guardia_secretos(e);
    if (secreto) return secreto;

    // 3 · forma de la entrada
    const faltan = [];
    const invalidos = [];
    if (!texto_no_vacio(e.request_id)) faltan.push('request_id');
    else if (!REQUEST_RE.test(String(e.request_id))) invalidos.push('request_id');
    if (!texto_no_vacio(e.proyecto)) faltan.push('proyecto');
    if (!texto_no_vacio(e.agente)) faltan.push('agente');
    if (e.momento === undefined || e.momento === null) faltan.push('momento');
    else if (!es_instante(e.momento)) invalidos.push('momento');
    if (e.veredicto === undefined || e.veredicto === null) faltan.push('veredicto');
    else if (!VEREDICTOS.includes(e.veredicto)) invalidos.push('veredicto');
    if (!Array.isArray(e.pasos) || e.pasos.length === 0) faltan.push('pasos');
    if (faltan.length || invalidos.length) {
      return fallo(MOTIVOS.ENTRADA_INVALIDA, faltan, invalidos);
    }

    // 4 · P2/P3: un proyecto no firma evidencia de otro.
    if (String(e.proyecto).trim() !== sello.proyecto) {
      return fallo(MOTIVOS.PROYECTO_AJENO, [], [], {
        sello_proyecto: sello.proyecto,
        proyecto: String(e.proyecto).trim()
      });
    }

    // 5 · un "no se" sin lo que haria falta es una excusa
    const faltas = lista(e.que_haria_falta);
    if (e.veredicto === 'no_se_sabe' && faltas.length === 0) {
      return fallo(MOTIVOS.NO_SE_SIN_QUE_HARIA_FALTA, ['que_haria_falta'], []);
    }

    const registro = {
      esquema: ESQUEMA,
      request_id: String(e.request_id).trim(),
      proyecto: sello.proyecto,
      cuenta: sello.cuenta,
      plataforma: sello.plataforma,
      sello,
      agente: String(e.agente).trim(),
      tarea: texto_no_vacio(e.tarea) ? String(e.tarea).trim() : null,
      momento: String(e.momento),
      veredicto: e.veredicto,
      pasos: e.pasos.map(normalizar_paso),
      que_haria_falta: faltas.map((f) => (texto_no_vacio(f) ? String(f).trim() : String(f))),
      duracion_ms: Number.isFinite(e.duracion_ms) ? e.duracion_ms : null,
      guardado_en: this._reloj()
    };

    // 6 · nada se persiste sin auditar
    const auditoria = auditar(registro);
    if (!auditoria.ok) {
      return fallo(MOTIVOS.EVIDENCIA_NO_AUDITADA, [], [], {
        problemas: auditoria.problemas,
        guardado: false
      });
    }

    // 7 · escritura atomica bajo el candado (ya estamos dentro de la cola)
    let ruta;
    try {
      ruta = await this._escribir(registro);
    } catch (err) {
      return fallo(
        err && err.code === 'ENOSPC' ? 'disco_lleno' : MOTIVOS.NO_SE_PUDO_GUARDAR,
        [],
        [],
        { detalle: err && err.message, guardado: false }
      );
    }

    // 8 · mapeo a la bitacora real: se le PIDE, no se escribe su almacen.
    const peticiones = mapear(registro);
    const { publicados, error } = this._publicar(peticiones);

    this.logger?.info('evidencia.guardada', {
      request_id: registro.request_id,
      proyecto: registro.proyecto,
      veredicto: registro.veredicto,
      bitacora: `${publicados}/${peticiones.length}`
    });

    return {
      ok: true,
      guardado: true,
      ruta,
      evidencia: clonar(registro),
      peticiones,
      bitacora: {
        publicados,
        total: peticiones.length,
        publicado: publicados === peticiones.length,
        motivo: publicados === peticiones.length ? null : MOTIVOS.SIN_BITACORA,
        error
      },
      // "completa" es lo unico que autoriza a decir que la ejecucion quedo
      // escrita donde hay que leerla: registro en disco Y peticiones al bus.
      completa: publicados === peticiones.length
    };
  }

  _publicar(peticiones) {
    if (!this.eventBus || typeof this.eventBus.publish !== 'function') {
      return { publicados: 0, error: 'sin_event_bus' };
    }
    let publicados = 0;
    try {
      for (const { topic, payload } of peticiones) {
        this.eventBus.publish(topic, payload);
        publicados += 1;
        this._peticiones += 1;
      }
      return { publicados, error: null };
    } catch (err) {
      return { publicados, error: (err && err.message) || String(err) };
    }
  }

  /**
   * Las peticiones de bitacora que corresponden a una evidencia, SIN publicarlas.
   * Sirve para reemitir cuando el bus estaba caido: la evidencia es la fuente.
   */
  mapear(entrada) {
    if (es_objeto(entrada) && entrada.esquema === ESQUEMA) return mapear(entrada);
    return [];
  }

  /** La evidencia guardada (copia), o `null` si no esta. */
  async recuperar(request_id) {
    try {
      const crudo = await fsp.readFile(this._ruta(request_id), 'utf8');
      return JSON.parse(crudo);
    } catch (err) {
      return null;
    }
  }

  /**
   * LEER la bitacora: se delega en su custodio. Este modulo no lee ni escribe
   * `agentes/bitacoras`: pide `bitacora.leer.request` y contesta el bus.
   */
  leer(entrada) {
    const e = es_objeto(entrada) ? entrada : {};
    if (!texto_no_vacio(e.request_id) || !texto_no_vacio(e.proyecto)) {
      return fallo(MOTIVOS.ENTRADA_INVALIDA, [
        ...(texto_no_vacio(e.request_id) ? [] : ['request_id']),
        ...(texto_no_vacio(e.proyecto) ? [] : ['proyecto'])
      ], []);
    }
    const peticion = {
      topic: TOPICS.LEER,
      payload: {
        request_id: String(e.request_id).trim(),
        project_id: String(e.proyecto).trim()
      }
    };
    const { publicados, error } = this._publicar([peticion]);
    return {
      ok: publicados === 1,
      motivo: publicados === 1 ? undefined : MOTIVOS.SIN_BITACORA,
      detalle: error,
      peticion
    };
  }

  /** Contadores, para auditorias y pruebas. */
  estado() {
    return {
      directorio: this._directorio,
      escrituras: this._escrituras,
      peticiones: this._peticiones,
      con_bus: Boolean(this.eventBus && typeof this.eventBus.publish === 'function')
    };
  }
}

/** Factory: la forma comoda para tests y para el loader. */
function crear(opts = {}) {
  return new EvidenciaConservada(opts);
}

module.exports = {
  ESQUEMA,
  TOPICS,
  VEREDICTOS,
  MOTIVOS,
  EvidenciaConservada,
  crear,
  auditar,
  mapear,
  normalizar_paso
};

// Vista "clase" del plano (O3 · EvidenciaConservada).
module.exports.Evidencia = Object.freeze({
  guardar: (instancia, entrada) => instancia.guardar(entrada),
  recuperar: (instancia, request_id) => instancia.recuperar(request_id),
  mapear,
  auditar
});
