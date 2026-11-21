'use strict';

/**
 * catalogo — A4.4 · CatalogoDeRecetas · CUSTODIO (logica pura).
 *
 * El catalogo es DONDE VIVE el saber hacer: las recetas vigentes de cada
 * (plataforma, capacidad), con su historia completa. Es saber COMUN (P3): se
 * mejora una vez para todos los proyectos y ningun proyecto tiene recetas
 * privadas. Por eso el almacen es global y cada entrada lleva el sello del
 * proyecto que la propuso, como atribucion (E2), no como dueno.
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, A4.4):
 *   - **Una vigente por clave, siempre.** `(plataforma, capacidad)` es la clave.
 *     Publicar una version nueva degrada la anterior a `antecesora` en el mismo
 *     acto: nunca hay dos vigentes ni un hueco sin vigente tras publicar.
 *   - **Nada se borra: se marca.** Las antecesoras se conservan enteras, con su
 *     receta y su firma de publicacion, porque `restaurar` existe justo para el
 *     caso en que una reparacion empeora las cosas.
 *   - **Una receta NACE PROPUESTA y nunca vigente.** `proponer` es el unico
 *     nacimiento y siempre deja `estado: 'propuesta'`; una entrada que llegue
 *     declarandose vigente se rechaza (`nace_propuesta`). La vigencia se gana en
 *     `publicar`, con autorizacion humana registrada (Q5): sin `autorizacion_id`
 *     el catalogo no promueve nada (`sin_confirmacion`).
 *   - **Solo entra lo que A4.1 valida.** El catalogo no es un cajon: una receta
 *     con un defecto de forma se rechaza al nacer y se vuelve a validar al
 *     publicar (el fichero puede haberse tocado a mano entre medias).
 *   - **Sin sello no hay entrada** (P1) y **ningun secreto entra** (V1); lo
 *     verifica `auditar()` sobre el almacen entero antes de cada escritura.
 *
 * Puro: sin reloj, sin red, sin IO. Cada operacion recibe el `estado` y devuelve
 * un `estado` NUEVO. El IO, el candado single-writer y la correlacion de eventos
 * viven en `index.js`.
 *
 * Ver plan-construccion.md secciones 4.2 (RPC 12) y 8 (bloque 3), y
 * diseno-oop.md "A4.4".
 */

const { es_objeto, es_instante, texto_no_vacio, clonar } = require('../core/formas');
const { sellar, comprobar: comprobar_sello } = require('../core/sello');
const { clase_de_almacen, almacen_de, COMPARTIBLES } = require('../core/propiedad');
const no_secretos = require('../core/no-secretos');
const forma_receta = require('../core/forma-receta');

const ESQUEMA = 'catalogo-recetas-v1';
const ALMACEN = 'catalogo-recetas';
const PLATAFORMA = 'instagram';

// Situacion de una version. `propuesta` = nacio y espera; `vigente` = la que se
// usa; `antecesora` = fue vigente y la sustituyo otra; `no_vigente` = se retiro
// sin sustituta (rotura declarada, F1).
const ESTADOS = Object.freeze(['propuesta', 'vigente', 'antecesora', 'no_vigente']);
const ORIGENES = Object.freeze(['demostracion', 'reparacion', 'chat', 'importada']);
const TIPOS_HISTORIA = Object.freeze(['propuesta', 'publicacion', 'sustitucion', 'retirada', 'restauracion']);

const MOTIVOS = Object.freeze({
  PROPUESTA: 'propuesta',
  VIGENTE: 'vigente',
  ANTECESORA: 'antecesora',
  NO_VIGENTE: 'no_vigente',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  ENTRADA_INVALIDA: 'entrada_invalida',
  DEFECTO_DE_FORMA: 'defecto_de_forma',
  NACE_PROPUESTA: 'nace_propuesta',
  SIN_CONFIRMACION: 'sin_confirmacion',
  RECETA_INEXISTENTE: 'receta_inexistente',
  YA_VIGENTE: 'ya_vigente',
  RETIRADA: 'receta_no_vigente',
  NO_ES_ANTECESORA: 'no_es_antecesora',
  CLAVE_INCOHERENTE: 'clave_incoherente',
  AMBITO_INCOMPLETO: 'ambito_incompleto',
  SECRETO_RECIBIDO: 'secreto_recibido'
});

// ---- estado ---------------------------------------------------------------

function estado_vacio() {
  return { esquema: ESQUEMA, revision: 0, actualizado: null, recetas: [] };
}

function es_estado(x) {
  return es_objeto(x) && x.esquema === ESQUEMA && Array.isArray(x.recetas);
}

// ---- utilidades -----------------------------------------------------------

function clave_de(plataforma, capacidad) {
  return `${plataforma}:${capacidad}`;
}

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

/** Rechaza cualquier entrada que lleve un secreto, diciendo la ruta (V1). */
function guardia_secretos(entrada) {
  const hallazgos = no_secretos.detectar_secreto(entrada);
  if (hallazgos.length === 0) return null;
  return fallo(MOTIVOS.SECRETO_RECIBIDO, [], [], {
    rutas: hallazgos.map((h) => h.ruta),
    familias: no_secretos.familias_de(hallazgos),
    guardado: false
  });
}

/**
 * Clave pedida en una operacion: de la entrada o, si no viene, de la propia
 * receta. Si vienen las dos y no coinciden, se rechaza: publicar una receta de
 * `instagram` bajo la clave `otra:publicar` es como se envenena un catalogo.
 */
function clave_pedida(entrada, receta) {
  const plataforma = texto_no_vacio(entrada.plataforma)
    ? String(entrada.plataforma).trim().toLowerCase()
    : (es_objeto(receta) && texto_no_vacio(receta.plataforma) ? String(receta.plataforma).trim().toLowerCase() : PLATAFORMA);
  const capacidad = texto_no_vacio(entrada.capacidad)
    ? String(entrada.capacidad).trim()
    : (es_objeto(receta) && texto_no_vacio(receta.capacidad) ? String(receta.capacidad).trim() : null);

  if (es_objeto(receta)) {
    if (texto_no_vacio(receta.plataforma) && String(receta.plataforma).trim().toLowerCase() !== plataforma) return { ok: false };
    if (texto_no_vacio(receta.capacidad) && capacidad !== null && String(receta.capacidad).trim() !== capacidad) return { ok: false };
  }
  return { ok: true, plataforma, capacidad };
}

function indice_de(estado, clave, version) {
  return estado.recetas.findIndex((r) => r && r.clave === clave && r.version === version);
}

function versiones_de(estado, clave) {
  return estado.recetas
    .filter((r) => r && r.clave === clave)
    .sort((a, b) => a.version - b.version);
}

function vigente_de(estado, clave) {
  return estado.recetas.find((r) => r && r.clave === clave && r.estado === 'vigente') || null;
}

function siguiente_version(estado, clave) {
  const versiones = versiones_de(estado, clave);
  if (versiones.length === 0) return 1;
  return versiones[versiones.length - 1].version + 1;
}

/** Anota un cambio de situacion sin reescribir la historia anterior. */
function anotar(entrada, tipo, de, a, datos) {
  const historia = Array.isArray(entrada.historia) ? entrada.historia : [];
  historia.push({
    secuencia: historia.length + 1,
    tipo,
    de,
    a,
    motivo: datos.motivo,
    momento: datos.momento,
    quien: datos.quien,
    autorizacion_id: datos.autorizacion_id === undefined ? null : datos.autorizacion_id
  });
  entrada.historia = historia;
}

// ---- nacimiento (propuesta) ----------------------------------------------

/**
 * Inscribe una receta NUEVA como propuesta. Nunca vigente: si la entrada se
 * declara vigente se rechaza (`nace_propuesta`), porque la vigencia solo la da
 * una publicacion con autorizacion.
 *
 * @param {object} estado
 * @param {object} entrada {receta, plataforma?, capacidad?, origen?, sello?,
 *   proyecto?, cuenta?, aparato?, momento?, quien?, motivo?}
 */
function proponer(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const secreto = guardia_secretos(entrada);
  if (secreto) return secreto;
  if (!es_objeto(entrada)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['entrada'], []);

  // Una receta no nace vigente ni por accidente ni por comodidad.
  if (entrada.estado !== undefined && String(entrada.estado) !== 'propuesta') {
    return fallo(MOTIVOS.NACE_PROPUESTA, [], [], {
      estado_recibido: entrada.estado,
      pista: 'una receta nace propuesta; la vigencia se gana con publicar y autorizacion'
    });
  }

  const v = forma_receta.validar(entrada.receta);
  if (!v.ok) {
    return fallo(MOTIVOS.DEFECTO_DE_FORMA, [], [], {
      defectos: v.defectos,
      pista: 'una receta que no declara sus cuatro partes no entra en el catalogo'
    });
  }

  const clave = clave_pedida(entrada, v.receta);
  if (!clave.ok) {
    return fallo(MOTIVOS.CLAVE_INCOHERENTE, [], ['plataforma', 'capacidad'], {
      pista: 'la clave (plataforma, capacidad) tiene que ser la de la receta'
    });
  }
  if (vacio(clave.capacidad)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['capacidad'], []);

  const origen = vacio(entrada.origen) ? 'chat' : String(entrada.origen).trim().toLowerCase();
  if (!ORIGENES.includes(origen)) return fallo(MOTIVOS.ENTRADA_INVALIDA, [], ['origen'], { valor: origen });

  const k = clave_de(clave.plataforma, clave.capacidad);

  // Sello de nacimiento (P1). Si la entrada trae sello valido, se respeta.
  let sello;
  if (entrada.sello !== undefined && entrada.sello !== null) {
    const c = comprobar_sello({ sello: entrada.sello });
    if (!c.ok) return fallo('sin_sello', c.faltan || [], c.invalidos || []);
    sello = c.sello;
  } else {
    const s = sellar({}, {
      proyecto: entrada.proyecto,
      cuenta: entrada.cuenta,
      aparato: entrada.aparato,
      momento: entrada.momento,
      quien: entrada.quien
    });
    if (!s.ok) return fallo(s.motivo || 'sin_sello', s.faltan || [], s.invalidos || []);
    sello = s.sello;
  }

  const version = siguiente_version(estado, k);
  const momento = String(sello.momento);
  const quien = String(sello.quien);

  const receta = {
    clave: k,
    plataforma: clave.plataforma,
    capacidad: clave.capacidad,
    version,
    estado: 'propuesta',
    almacen: ALMACEN,
    origen,
    receta: clonar(v.receta),
    sello: clonar(sello),
    propuesta: { momento, quien, motivo: texto_no_vacio(entrada.motivo) ? String(entrada.motivo).trim() : null },
    publicacion: null,
    historia: []
  };
  anotar(receta, 'propuesta', null, 'propuesta', {
    motivo: texto_no_vacio(entrada.motivo) ? String(entrada.motivo).trim() : 'nace propuesta',
    momento,
    quien
  });

  const nuevo = clonar(estado);
  nuevo.recetas.push(receta);
  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = momento;

  return {
    ok: true,
    estado: nuevo,
    receta: clonar(receta),
    clave: k,
    version,
    estado_receta: 'propuesta',
    vigente: false
  };
}

// ---- publicacion (la unica via a vigente) --------------------------------

/**
 * Promueve una version a vigente. Exige autorizacion registrada (Q5) y degrada
 * la vigente anterior a `antecesora` en el mismo acto.
 *
 * Acepta la version ya propuesta (`version`) o una receta nueva (`receta`), que
 * en ese caso nace propuesta y se publica en la misma operacion: el camino no
 * se salta el nacimiento, solo lo recorre de una vez.
 *
 * @param {object} estado
 * @param {object} entrada {plataforma?, capacidad?, version?, receta?, origen?,
 *   motivo?, autorizacion_id, momento, quien, sello?, proyecto?, cuenta?, aparato?}
 */
function publicar(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const secreto = guardia_secretos(entrada);
  if (secreto) return secreto;
  if (!es_objeto(entrada)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['entrada'], []);

  const faltan = [];
  if (vacio(entrada.autorizacion_id)) faltan.push('autorizacion_id');
  if (vacio(entrada.momento)) faltan.push('momento');
  if (vacio(entrada.quien)) faltan.push('quien');
  const invalidos = [];
  if (!faltan.includes('momento') && !es_instante(entrada.momento)) invalidos.push('momento');

  // Sin confirmacion humana registrada no se publica: es lo unico que separa una
  // propuesta de una receta vigente que el puente va a ejecutar sin preguntar.
  if (faltan.includes('autorizacion_id')) {
    return fallo(MOTIVOS.SIN_CONFIRMACION, faltan, invalidos, {
      pista: 'publicar exige autorizacion_id: la vigencia la da una persona, no el catalogo'
    });
  }
  if (faltan.length || invalidos.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, faltan, invalidos);

  const momento = String(entrada.momento);
  const quien = String(entrada.quien).trim();
  const autorizacion_id = String(entrada.autorizacion_id).trim();
  const motivo = texto_no_vacio(entrada.motivo) ? String(entrada.motivo).trim() : 'publicacion';

  let trabajo = estado;
  let clave;
  let version;

  if (entrada.version !== undefined && entrada.version !== null) {
    clave = clave_pedida(entrada, null);
    if (vacio(clave.capacidad)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['capacidad'], []);
    version = entrada.version;
    if (!Number.isInteger(version) || version <= 0) return fallo(MOTIVOS.ENTRADA_INVALIDA, [], ['version']);
  } else if (entrada.receta !== undefined && entrada.receta !== null) {
    const creada = proponer(trabajo, {
      receta: entrada.receta,
      plataforma: entrada.plataforma,
      capacidad: entrada.capacidad,
      origen: entrada.origen,
      sello: entrada.sello,
      proyecto: entrada.proyecto,
      cuenta: entrada.cuenta,
      aparato: entrada.aparato,
      momento,
      quien,
      motivo
    });
    if (!creada.ok) return creada;
    trabajo = creada.estado;
    clave = { ok: true, plataforma: creada.receta.plataforma, capacidad: creada.receta.capacidad };
    version = creada.version;
  } else {
    return fallo(MOTIVOS.ENTRADA_INVALIDA, ['version|receta'], []);
  }

  const k = clave_de(clave.plataforma, clave.capacidad);
  const i = indice_de(trabajo, k, version);
  if (i === -1) return fallo(MOTIVOS.RECETA_INEXISTENTE, [], [], { clave: k, version });

  const objetivo = trabajo.recetas[i];
  if (objetivo.estado === 'vigente') {
    return {
      ok: true,
      estado: trabajo,
      receta: clonar(objetivo),
      clave: k,
      version,
      estado_receta: 'vigente',
      vigente: true,
      idempotente: true
    };
  }
  if (objetivo.estado === 'no_vigente') {
    return fallo(MOTIVOS.RETIRADA, [], [], {
      clave: k,
      version,
      pista: 'una version retirada no se republica: para volver atras se usa restaurar'
    });
  }

  // Se revalida la forma: el almacen puede haberse tocado a mano entre el
  // nacimiento y la publicacion.
  const v = forma_receta.validar(objetivo.receta);
  if (!v.ok) return fallo(MOTIVOS.DEFECTO_DE_FORMA, [], [], { defectos: v.defectos, clave: k, version });

  const nuevo = clonar(trabajo);
  const anterior = vigente_de(nuevo, k);
  const estado_previo = objetivo.estado;

  // Una vigente por clave: la anterior baja a antecesora, no se borra.
  if (anterior && anterior.version !== version) {
    const ia = indice_de(nuevo, k, anterior.version);
    const previa = nuevo.recetas[ia];
    previa.estado = 'antecesora';
    anotar(previa, 'sustitucion', 'vigente', 'antecesora', {
      motivo: `sustituida por la version ${version}`,
      momento,
      quien,
      autorizacion_id
    });
  }

  const entradaNueva = nuevo.recetas[indice_de(nuevo, k, version)];
  entradaNueva.estado = 'vigente';
  entradaNueva.receta = clonar(v.receta);
  entradaNueva.publicacion = { momento, quien, autorizacion_id, motivo };
  anotar(entradaNueva, 'publicacion', estado_previo, 'vigente', { motivo, momento, quien, autorizacion_id });

  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = momento;

  return {
    ok: true,
    estado: nuevo,
    receta: clonar(nuevo.recetas[indice_de(nuevo, k, version)]),
    clave: k,
    version,
    estado_receta: 'vigente',
    vigente: true,
    sustituye_a: anterior && anterior.version !== version ? anterior.version : null
  };
}

// ---- retirada y restauracion --------------------------------------------

/**
 * Marca no vigente una version (rotura declarada por F1, retirada pedida).
 * No borra: cambia la situacion y deja el paso en la historia.
 */
function marcar_no_vigente(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const secreto = guardia_secretos(entrada);
  if (secreto) return secreto;
  if (!es_objeto(entrada)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['entrada'], []);

  const faltan = [];
  for (const campo of ['motivo', 'momento', 'quien']) if (vacio(entrada[campo])) faltan.push(campo);
  const invalidos = [];
  if (!faltan.includes('momento') && !es_instante(entrada.momento)) invalidos.push('momento');
  if (faltan.length || invalidos.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, faltan, invalidos);

  const clave = clave_pedida(entrada, null);
  if (vacio(clave.capacidad)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['capacidad'], []);
  const k = clave_de(clave.plataforma, clave.capacidad);

  const actual = vigente_de(estado, k);
  const version = entrada.version === undefined || entrada.version === null
    ? (actual ? actual.version : null)
    : entrada.version;
  if (version === null) return fallo(MOTIVOS.RECETA_INEXISTENTE, [], [], { clave: k });

  const i = indice_de(estado, k, version);
  if (i === -1) return fallo(MOTIVOS.RECETA_INEXISTENTE, [], [], { clave: k, version });

  const objetivo = estado.recetas[i];
  if (objetivo.estado === 'no_vigente') {
    return { ok: true, estado, receta: clonar(objetivo), clave: k, version, estado_receta: 'no_vigente', idempotente: true };
  }
  if (objetivo.estado === 'propuesta') {
    return fallo(MOTIVOS.ENTRADA_INVALIDA, [], ['version'], {
      clave: k,
      version,
      pista: 'una propuesta no se retira: se descarta o se deja sin publicar'
    });
  }

  const momento = String(entrada.momento);
  const quien = String(entrada.quien).trim();
  const motivo = String(entrada.motivo).trim();

  const nuevo = clonar(estado);
  const cambio = nuevo.recetas[i];
  const de = cambio.estado;
  cambio.estado = 'no_vigente';
  anotar(cambio, 'retirada', de, 'no_vigente', {
    motivo,
    momento,
    quien,
    autorizacion_id: vacio(entrada.autorizacion_id) ? null : String(entrada.autorizacion_id).trim()
  });

  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = momento;

  return { ok: true, estado: nuevo, receta: clonar(cambio), clave: k, version, estado_receta: 'no_vigente' };
}

/**
 * Devuelve a vigente una antecesora (la salida cuando una reparacion empeora las
 * cosas). Exige autorizacion registrada: volver atras tambien es una decision.
 */
function restaurar(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const secreto = guardia_secretos(entrada);
  if (secreto) return secreto;
  if (!es_objeto(entrada)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['entrada'], []);

  const faltan = [];
  for (const campo of ['autorizacion_id', 'momento', 'quien']) if (vacio(entrada[campo])) faltan.push(campo);
  if (entrada.version === undefined || entrada.version === null) faltan.push('version');
  const invalidos = [];
  if (!faltan.includes('momento') && !es_instante(entrada.momento)) invalidos.push('momento');
  if (faltan.length || invalidos.length) {
    return fallo(faltan.includes('autorizacion_id') ? MOTIVOS.SIN_CONFIRMACION : MOTIVOS.ENTRADA_INVALIDA, faltan, invalidos);
  }

  const clave = clave_pedida(entrada, null);
  if (vacio(clave.capacidad)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['capacidad'], []);
  const k = clave_de(clave.plataforma, clave.capacidad);
  const version = entrada.version;

  const i = indice_de(estado, k, version);
  if (i === -1) return fallo(MOTIVOS.RECETA_INEXISTENTE, [], [], { clave: k, version });

  const objetivo = estado.recetas[i];
  if (objetivo.estado === 'vigente') {
    return { ok: true, estado, receta: clonar(objetivo), clave: k, version, estado_receta: 'vigente', idempotente: true };
  }
  if (!objetivo.publicacion) {
    return fallo(MOTIVOS.NO_ES_ANTECESORA, [], [], {
      clave: k,
      version,
      pista: 'solo se restaura una version que estuvo publicada alguna vez'
    });
  }

  const momento = String(entrada.momento);
  const quien = String(entrada.quien).trim();
  const autorizacion_id = String(entrada.autorizacion_id).trim();
  const motivo = texto_no_vacio(entrada.motivo) ? String(entrada.motivo).trim() : 'restauracion';

  const nuevo = clonar(estado);
  const actual = vigente_de(nuevo, k);
  if (actual && actual.version !== version) {
    const ia = indice_de(nuevo, k, actual.version);
    const previa = nuevo.recetas[ia];
    previa.estado = 'antecesora';
    anotar(previa, 'sustitucion', 'vigente', 'antecesora', {
      motivo: `sustituida por la restauracion de la version ${version}`,
      momento,
      quien,
      autorizacion_id
    });
  }

  const restaurada = nuevo.recetas[indice_de(nuevo, k, version)];
  const de = restaurada.estado;
  restaurada.estado = 'vigente';
  restaurada.publicacion = {
    momento,
    quien,
    autorizacion_id,
    motivo,
    restauracion: true
  };
  anotar(restaurada, 'restauracion', de, 'vigente', { motivo, momento, quien, autorizacion_id });

  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = momento;

  return { ok: true, estado: nuevo, receta: clonar(restaurada), clave: k, version, estado_receta: 'vigente' };
}

// ---- lecturas -------------------------------------------------------------

/**
 * La receta vigente de una clave. `hallada:false` y `receta:null` es una
 * respuesta legitima (`sin_receta`), no un error del catalogo: que no haya
 * receta es un hecho, y A2 es quien decide que hacer con el.
 */
function vigente(estado, consulta) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  if (!es_objeto(consulta)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['consulta'], []);
  const plataforma = texto_no_vacio(consulta.plataforma) ? String(consulta.plataforma).trim().toLowerCase() : PLATAFORMA;
  const capacidad = texto_no_vacio(consulta.capacidad) ? String(consulta.capacidad).trim() : null;
  if (!capacidad) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['capacidad'], []);

  const k = clave_de(plataforma, capacidad);
  const entrada = vigente_de(estado, k);
  return {
    ok: true,
    clave: k,
    hallada: entrada !== null,
    motivo: entrada ? null : 'sin_receta',
    receta: entrada ? clonar(entrada) : null
  };
}

/** Las versiones publicadas que ya no estan vigentes, de mas vieja a mas nueva. */
function antecesoras(estado, consulta) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  if (!es_objeto(consulta)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['consulta'], []);
  const plataforma = texto_no_vacio(consulta.plataforma) ? String(consulta.plataforma).trim().toLowerCase() : PLATAFORMA;
  const capacidad = texto_no_vacio(consulta.capacidad) ? String(consulta.capacidad).trim() : null;
  if (!capacidad) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['capacidad'], []);

  const k = clave_de(plataforma, capacidad);
  const lista = versiones_de(estado, k)
    .filter((r) => r.publicacion !== null && r.estado !== 'vigente')
    .map(clonar);

  return { ok: true, clave: k, antecesoras: lista, total: lista.length };
}

/** Todas las versiones de una clave, incluidas propuestas y vigente. */
function versiones(estado, consulta) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  if (!es_objeto(consulta)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['consulta'], []);
  const plataforma = texto_no_vacio(consulta.plataforma) ? String(consulta.plataforma).trim().toLowerCase() : PLATAFORMA;
  const capacidad = texto_no_vacio(consulta.capacidad) ? String(consulta.capacidad).trim() : null;
  if (!capacidad) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['capacidad'], []);
  const k = clave_de(plataforma, capacidad);
  const lista = versiones_de(estado, k).map(clonar);
  return { ok: true, clave: k, versiones: lista, total: lista.length };
}

/**
 * Lista entradas por ambito. Exige al menos un criterio (plataforma, capacidad o
 * situacion): el catalogo se lee por clave o por plataforma, no "todo y
 * mezclado" — y nunca devuelve estado privado, porque no lo guarda.
 */
function listar(estado, filtro) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const f = es_objeto(filtro) ? filtro : {};

  if (vacio(f.plataforma) && vacio(f.capacidad) && vacio(f.estado)) {
    return fallo(MOTIVOS.AMBITO_INCOMPLETO, ['plataforma|capacidad|estado'], [], {
      pista: 'el catalogo se lee por clave o por plataforma; nunca entero y sin criterio'
    });
  }
  if (!vacio(f.estado) && !ESTADOS.includes(String(f.estado).trim())) {
    return fallo(MOTIVOS.ENTRADA_INVALIDA, [], ['estado'], { valor: f.estado });
  }

  const plataforma = texto_no_vacio(f.plataforma) ? String(f.plataforma).trim().toLowerCase() : null;
  const capacidad = texto_no_vacio(f.capacidad) ? String(f.capacidad).trim() : null;
  const situacion = vacio(f.estado) ? null : String(f.estado).trim();

  const recetas = estado.recetas.filter((r) => {
    if (!r) return false;
    if (plataforma && r.plataforma !== plataforma) return false;
    if (capacidad && r.capacidad !== capacidad) return false;
    if (situacion && r.estado !== situacion) return false;
    return true;
  }).map(clonar);

  return {
    ok: true,
    recetas,
    total: recetas.length,
    ambito: { plataforma, capacidad, estado: situacion }
  };
}

// ---- auditoria del almacen ----------------------------------------------

/**
 * Audita el catalogo ENTERO: esquema, secretos (V1), sello de cada entrada (P1),
 * clase de almacen (P3: saber comun, no estado privado), forma de cada receta
 * (A4.1) y la invariante del catalogo: una sola vigente por clave.
 *
 * Un solo problema mancha el almacen: lo llama `index.js` antes de persistir.
 */
function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, problemas: [{ ruta: '(raiz)', motivo: MOTIVOS.ESQUEMA_DESCONOCIDO }] };
  }

  for (const h of no_secretos.detectar_secreto(estado)) {
    problemas.push({ ruta: h.ruta, motivo: 'secreto', familia: h.familia });
  }

  const vigentes = new Map();

  estado.recetas.forEach((r, i) => {
    const ruta = `recetas[${i}]`;
    if (!es_objeto(r)) {
      problemas.push({ ruta, motivo: 'entrada_no_es_objeto' });
      return;
    }

    const c = comprobar_sello(r);
    if (!c.ok) {
      problemas.push({ ruta, motivo: 'sin_sello', faltan: c.faltan, invalidos: c.invalidos });
    }

    if (!ESTADOS.includes(r.estado)) {
      problemas.push({ ruta: `${ruta}.estado`, motivo: 'estado_no_declarado', valor: r.estado });
    }

    if (r.clave !== clave_de(r.plataforma, r.capacidad)) {
      problemas.push({ ruta: `${ruta}.clave`, motivo: 'clave_incoherente', valor: r.clave });
    }

    if (!Number.isInteger(r.version) || r.version <= 0) {
      problemas.push({ ruta: `${ruta}.version`, motivo: 'version_no_es_entero', valor: r.version });
    }

    // P3: el catalogo es saber hacer compartido. Si una entrada se declara de
    // otro almacen (estado privado), el catalogo ha dejado de ser lo que dice.
    const almacen = almacen_de(r);
    if (clase_de_almacen(almacen) !== 'compartible' || !COMPARTIBLES.includes(almacen)) {
      problemas.push({ ruta: `${ruta}.almacen`, motivo: 'no_es_saber_comun', valor: almacen });
    }

    const v = forma_receta.validar(r.receta);
    if (!v.ok) {
      problemas.push({ ruta: `${ruta}.receta`, motivo: MOTIVOS.DEFECTO_DE_FORMA, defectos: v.defectos });
    }

    if (r.estado === 'vigente') {
      if (!r.publicacion) {
        problemas.push({ ruta, motivo: 'vigente_sin_publicacion' });
      }
      const previa = vigentes.get(r.clave);
      if (previa !== undefined) {
        problemas.push({
          ruta,
          motivo: 'dos_vigentes_en_la_misma_clave',
          clave: r.clave,
          versiones: [previa, r.version]
        });
      } else {
        vigentes.set(r.clave, r.version);
      }
    }

    if (r.historia !== undefined) {
      if (!Array.isArray(r.historia)) {
        problemas.push({ ruta: `${ruta}.historia`, motivo: 'historia_no_es_lista' });
      } else {
        r.historia.forEach((paso, j) => {
          if (!es_objeto(paso) || !TIPOS_HISTORIA.includes(paso.tipo)) {
            problemas.push({
              ruta: `${ruta}.historia[${j}]`,
              motivo: 'paso_de_historia_no_declarado',
              valor: paso && paso.tipo
            });
          }
        });
      }
    }
  });

  return { ok: problemas.length === 0, problemas, claves: vigentes.size };
}

module.exports = {
  ESQUEMA,
  ALMACEN,
  PLATAFORMA,
  ESTADOS,
  ORIGENES,
  TIPOS_HISTORIA,
  MOTIVOS,
  estado_vacio,
  es_estado,
  clave_de,
  proponer,
  publicar,
  marcar_no_vigente,
  restaurar,
  vigente,
  antecesoras,
  versiones,
  listar,
  auditar
};

// Vista "clase" para quien prefiera el nombre del diseno (A4.4 · CatalogoDeRecetas).
module.exports.CatalogoDeRecetas = Object.freeze({
  proponer,
  publicar,
  marcar_no_vigente,
  restaurar,
  vigente,
  antecesoras,
  versiones,
  listar,
  auditar
});
