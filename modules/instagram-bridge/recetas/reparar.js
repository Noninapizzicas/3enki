'use strict';

/**
 * reparar — F2 · ReparadorDeReceta · MICRO-AGENTE.
 *
 * Cuando F1 declara rotura, alguien tiene que dejar la receta otra vez en pie. Ese
 * alguien es esta pieza, y tiene dos mitades:
 *
 *   - la mitad DETERMINISTA (sin LLM): a partir de lo que se VIO en la pantalla
 *     propone anclas candidatas para los pasos rotos y arma una receta nueva;
 *   - la mitad FUZZY (opcional): un juicio que elige entre las candidatas. Si no
 *     hay juicio, o si el juicio falla, se sigue con la regla. Un juicio roto no
 *     rompe la reparacion: como mucho, elige peor.
 *
 * # Las dos reglas duras
 *
 * 1. **Sin confirmacion registrada NO llega al catalogo.** `reparar()` produce una
 *    REPARACION PROPUESTA con `confirmacion: null`; `para_catalogo()` se niega a
 *    devolver la entrada mientras no haya una persona que confirme con
 *    `autorizacion_id`. No hay ninguna ruta en la que esta pieza escriba en el
 *    catalogo: el catalogo es de su custodio.
 *
 * 2. **La reparacion no se autopromueve.** Nace `propuesta` y sigue `propuesta`
 *    despues de confirmarla: la confirmacion no publica, solo autoriza a que la
 *    propuesta entre. Publicar es de `catalogo.publicar`, que vuelve a exigir
 *    `autorizacion_id`. Un `estado: 'vigente'`, un `autorizacion_id` o un
 *    `confirmada: true` que lleguen en la entrada se DESCARTAN y se dice que se
 *    descartaron: el sistema no se firma a si mismo.
 *
 * # Lo que se propone sale de lo observado
 *
 * Las candidatas son nodos que estaban en el `HechoVisible` de ahora, con nombre
 * visible, que no son el ancla rota y que no estan ya usados por otro paso de la
 * receta. Si un paso roto no tiene ninguna candidata, NO se devuelve una receta a
 * medias: se devuelve `sin_observacion_suficiente` diciendo que paso hay que mirar
 * y por que. Una receta reparada a medias es una receta que sigue rota, pero con
 * aspecto de arreglada.
 *
 * # Una sospecha no reescribe el saber comun
 *
 * `reparar()` exige una declaracion de ROTURA (dos evidencias). Con una sola
 * evidencia (sospecha) devuelve `solo_sospecha`: el saber hacer es de todos los
 * proyectos, y una corazonada de un aparato no lo cambia.
 *
 * Puro: sin reloj, sin red, sin IO, sin estado global. El `momento` lo trae quien
 * invoca; la confirmacion tambien.
 *
 * Ver plan-construccion.md (bloque 12, F2) y diseno-oop.md.
 */

const crypto = require('crypto');

const { es_objeto, es_instante, texto_no_vacio, clonar, QUIENES } = require('../core/formas');
const forma_receta = require('../core/forma-receta');
const rotura = require('./rotura');

const ESTADO_PROPUESTA = 'propuesta';
const MAX_CANDIDATAS_POR_PASO = 3;

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  DEFECTO_DE_FORMA: 'defecto_de_forma',
  SIN_ROTURA: 'sin_rotura',
  SOLO_SOSPECHA: 'solo_sospecha',
  SIN_HECHO: 'sin_hecho',
  MIRADA_PARCIAL: 'mirada_parcial',
  SIN_OBSERVACION_SUFICIENTE: 'sin_observacion_suficiente',
  REPARACION_INVALIDA: 'reparacion_invalida',
  SIN_CONFIRMACION: 'sin_confirmacion',
  NO_ES_PERSONA: 'no_es_persona',
  YA_CONFIRMADA: 'ya_confirmada',
  AUTOPROMOCION: 'autopromocion'
});

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

function normalizar(v) {
  return String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Palabras utiles de una etiqueta ("Publicar ahora" -> [publicar, ahora]). */
function palabras(v) {
  const n = normalizar(v);
  return n ? n.split(' ').filter((p) => p.length > 1) : [];
}

/**
 * Parecido entre la etiqueta que se perdio y una candidata: palabras en comun.
 * No es "entender" el texto: es ordenar, y el orden se puede explicar.
 */
function parecido(antes, ahora) {
  if (!antes || !ahora) return 0;
  const a = new Set(palabras(antes));
  return palabras(ahora).filter((p) => a.has(p)).length;
}

/**
 * ¿La etiqueta candidata comparte alguna palabra con un ancla que ya usa otro
 * paso? Entonces es (casi seguro) el mismo elemento escrito mas largo, y no vale
 * como ancla de un paso distinto.
 */
function comparte_palabra_con_usada(clave, usadas) {
  const suyas = new Set(palabras(clave));
  if (suyas.size === 0) return false;
  for (const usada of usadas) {
    for (const p of palabras(usada)) {
      if (suyas.has(p)) return true;
    }
  }
  return false;
}

/**
 * Candidatas para un paso roto, sacadas SOLO de lo observado.
 *
 * Excluye: nodos sin nombre (no son ancla), el ancla que se perdio (reproponerla
 * no arregla nada), las anclas que otros pasos ya usan (dos pasos con la misma
 * ancla es una ambiguedad, no una reparacion) y, si el paso toca, lo que no es
 * tocable.
 */
function candidatas_de(hecho, paso, usadas) {
  const antes = paso.ancla_esperada && texto_no_vacio(paso.ancla_esperada.nombre_visible)
    ? paso.ancla_esperada.nombre_visible
    : null;
  const tipo_antes = paso.ancla_esperada && texto_no_vacio(paso.ancla_esperada.tipo)
    ? String(paso.ancla_esperada.tipo).trim().toLowerCase()
    : null;
  const necesita_tocar = es_objeto(paso.accion) && ['tocar', 'escribir', 'desplazar'].includes(paso.accion.tipo);

  const vistos = new Map();
  for (const nodo of hecho.nodos) {
    if (!es_objeto(nodo) || !texto_no_vacio(nodo.nombre_visible)) continue;
    const nombre = String(nodo.nombre_visible).trim();
    const clave = normalizar(nombre);
    if (!clave) continue;
    if (antes && normalizar(antes) === clave) continue;
    if (usadas.has(clave)) continue;
    // Si su etiqueta CONTIENE la de un ancla ya usada ("Compartir en" frente a
    // "Compartir"), es casi seguro el mismo elemento con el nombre largo: proponerlo
    // para otro paso es tocar dos veces el mismo boton.
    if (comparte_palabra_con_usada(clave, usadas)) continue;
    if (necesita_tocar && nodo.tocable === false) continue;

    const tipo = texto_no_vacio(nodo.tipo) ? String(nodo.tipo).trim().toLowerCase() : 'desconocido';
    const previa = vistos.get(clave);
    if (previa) {
      previa.veces += 1;
      continue;
    }
    vistos.set(clave, {
      ancla: { nombre_visible: nombre, tipo },
      veces: 1,
      del_mismo_tipo: tipo_antes !== null && tipo === tipo_antes,
      parecido: parecido(antes, nombre)
    });
  }

  const lista = Array.from(vistos.values());
  lista.sort((a, b) => {
    if (b.parecido !== a.parecido) return b.parecido - a.parecido;
    if (a.del_mismo_tipo !== b.del_mismo_tipo) return a.del_mismo_tipo ? -1 : 1;
    if (b.veces !== a.veces) return b.veces - a.veces;
    return a.ancla.nombre_visible.localeCompare(b.ancla.nombre_visible);
  });

  return lista.slice(0, MAX_CANDIDATAS_POR_PASO).map((c, i) => ({
    ancla: c.ancla,
    orden: i + 1,
    del_mismo_tipo: c.del_mismo_tipo,
    parecido: c.parecido,
    veces: c.veces
  }));
}

/**
 * Pregunta al juicio (opcional) por una candidata de cada paso roto. El juicio NO
 * puede inventar: solo puede elegir entre las candidatas que salieron de lo
 * observado. Si lanza, si devuelve basura o si elige algo que no se vio, se anota
 * y se sigue con la regla.
 */
function consultar_juicio(juez, contexto, candidatas_por_paso) {
  if (juez === undefined || juez === null) return { usado: false, motivo: 'sin_juicio', elecciones: {} };
  const fn = typeof juez === 'function' ? juez : (typeof juez.elegir === 'function' ? juez.elegir.bind(juez) : null);
  if (!fn) return { usado: false, motivo: 'juicio_no_invocable', elecciones: {} };

  let bruto;
  try {
    bruto = fn(contexto);
  } catch (err) {
    return { usado: false, motivo: 'juicio_fallo', detalle: err && err.message, elecciones: {} };
  }
  if (!es_objeto(bruto)) return { usado: false, motivo: 'juicio_sin_respuesta', elecciones: {} };

  const elecciones = {};
  const descartes = [];
  for (const [paso, candidatas] of Object.entries(candidatas_por_paso)) {
    const propuesta = bruto[paso] || bruto[String(paso)];
    if (!texto_no_vacio(propuesta)) continue;
    const buscada = normalizar(propuesta);
    const hallada = candidatas.find((c) => normalizar(c.ancla.nombre_visible) === buscada);
    if (!hallada) {
      // Inventar un ancla es exactamente lo que no se puede permitir: el juicio
      // propone entre lo observado o no propone.
      descartes.push({ paso: Number(paso), propuesta: String(propuesta).trim(), motivo: 'no_estaba_en_lo_observado' });
      continue;
    }
    elecciones[paso] = hallada.ancla;
  }

  return {
    usado: Object.keys(elecciones).length > 0,
    motivo: Object.keys(elecciones).length > 0 ? null : 'juicio_sin_eleccion_valida',
    elecciones,
    descartes
  };
}

/**
 * Repara una receta rota. Devuelve una PROPUESTA sin confirmar.
 *
 * @param {object} entrada
 *   {receta, rotura|evidencias, hecho, momento, quien?, proyecto?, cuenta?,
 *    aparato?, motivo?, juez?}
 * @returns {object}
 */
function reparar(entrada) {
  if (!es_objeto(entrada)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['entrada'], []);

  const v = forma_receta.validar(entrada.receta);
  if (!v.ok) return fallo(MOTIVOS.DEFECTO_DE_FORMA, [], [], { defectos: v.defectos });
  const receta = v.receta;

  // --- la rotura: se acepta la declaracion de F1 o las evidencias en crudo -----
  let declaracion;
  if (es_objeto(entrada.rotura)) {
    declaracion = entrada.rotura;
    if (declaracion.ok !== true || !Array.isArray(declaracion.pasos)) {
      return fallo(MOTIVOS.SIN_ROTURA, ['rotura'], []);
    }
  } else {
    declaracion = rotura.declarar(receta, entrada.evidencias, { capacidad: receta.capacidad });
    if (!declaracion.ok) return declaracion;
  }

  if (declaracion.veredicto === 'sospecha') {
    return fallo(MOTIVOS.SOLO_SOSPECHA, [], [], {
      veredicto: declaracion.veredicto,
      pista: 'una sola evidencia es una sospecha: no reescribe el saber comun. Hace falta una segunda mirada independiente',
      pasos_sospechosos: declaracion.pasos_sospechosos || []
    });
  }
  if (declaracion.veredicto !== 'rotura') {
    return fallo(MOTIVOS.SIN_ROTURA, [], [], {
      veredicto: declaracion.veredicto || null,
      pista: 'sin rotura declarada no hay nada que reparar'
    });
  }

  // --- la observacion: sin mirada completa no se proponen anclas ---------------
  const hecho = entrada.hecho;
  if (!es_objeto(hecho) || !Array.isArray(hecho.nodos)) {
    return fallo(MOTIVOS.SIN_HECHO, ['hecho'], [], {
      pista: 'las anclas candidatas salen de lo observado; sin hecho visible no se inventan'
    });
  }
  if (hecho.mirada === 'parcial') {
    return fallo(MOTIVOS.MIRADA_PARCIAL, [], ['hecho.mirada'], {
      pista: 'con media pantalla leida no se puede proponer el ancla de un paso: se puede confundir el boton de al lado'
    });
  }

  // --- las anclas que ya usan los pasos que NO estan rotos --------------------
  const rotos = new Set(declaracion.pasos.filter((p) => p.veredicto === 'rotura').map((p) => p.paso));
  const usadas = new Set();
  receta.pasos.forEach((paso, i) => {
    if (rotos.has(i + 1)) return;
    if (texto_no_vacio(paso.ancla_esperada && paso.ancla_esperada.nombre_visible)) {
      usadas.add(normalizar(paso.ancla_esperada.nombre_visible));
    }
  });

  const candidatas_por_paso = {};
  const sin_candidata = [];
  for (const numero of Array.from(rotos).sort((a, b) => a - b)) {
    const paso = receta.pasos[numero - 1];
    const lista = candidatas_de(hecho, paso, usadas);
    candidatas_por_paso[numero] = lista;
    if (lista.length === 0) {
      sin_candidata.push({
        paso: numero,
        ancla_que_falta: paso.ancla_esperada,
        motivo: 'ninguna_ancla_observada_encaja'
      });
    } else {
      usadas.add(normalizar(lista[0].ancla.nombre_visible));
    }
  }

  if (sin_candidata.length) {
    return fallo(MOTIVOS.SIN_OBSERVACION_SUFICIENTE, [], [], {
      pasos_sin_candidata: sin_candidata,
      que_haria_falta: sin_candidata.map((s) => `mirar la pantalla del paso ${s.paso} (${s.ancla_que_falta.nombre_visible}) y volver a demostrarlo`),
      pista: 'una receta reparada a medias sigue rota, pero con aspecto de arreglada'
    });
  }

  // --- el juicio opcional, despues de la regla y sin poder saltarsela ---------
  const juicio = consultar_juicio(entrada.juez, {
    capacidad: receta.capacidad,
    rotura: { veredicto: declaracion.veredicto, pasos_rotos: declaracion.pasos_rotos },
    candidatas: candidatas_por_paso
  }, candidatas_por_paso);

  // --- la receta nueva --------------------------------------------------------
  const nueva = clonar(receta);
  const cambios = [];
  const tomadas = new Set();
  for (const numero of Array.from(rotos).sort((a, b) => a - b)) {
    const paso = nueva.pasos[numero - 1];
    const de = paso.ancla_esperada;
    const lista = candidatas_por_paso[numero];
    const del_juicio = juicio.elecciones[String(numero)] || null;

    // El juicio decide, pero no puede repetir el ancla de otro paso: dos pasos con
    // la misma ancla es una ambiguedad, no una reparacion.
    let elegida = null;
    let elegido_por = 'regla';
    if (del_juicio && !tomadas.has(normalizar(del_juicio.nombre_visible))) {
      elegida = lista.find((c) => normalizar(c.ancla.nombre_visible) === normalizar(del_juicio.nombre_visible)) || { ancla: del_juicio };
      elegido_por = 'juicio';
    }
    if (!elegida) {
      elegida = lista.find((c) => !tomadas.has(normalizar(c.ancla.nombre_visible)));
      if (!elegida) elegida = lista[0]; // todos los caminos estan tomados; se dice
    }
    tomadas.add(normalizar(elegida.ancla.nombre_visible));

    paso.ancla_esperada = { nombre_visible: elegida.ancla.nombre_visible, tipo: elegida.ancla.tipo };
    cambios.push({
      paso: numero,
      de: { nombre_visible: de.nombre_visible, tipo: de.tipo },
      a: { nombre_visible: elegida.ancla.nombre_visible, tipo: elegida.ancla.tipo },
      elegido_por,
      candidatas: lista
    });
  }

  const comprobacion = forma_receta.validar(nueva);
  if (!comprobacion.ok) {
    return fallo(MOTIVOS.DEFECTO_DE_FORMA, [], [], {
      defectos: comprobacion.defectos,
      pista: 'la reparacion no produce una receta valida: no se devuelve a medias'
    });
  }

  const momento = vacio(entrada.momento) ? null : String(entrada.momento);
  const quien = vacio(entrada.quien) ? 'agente' : String(entrada.quien).trim();
  if (!QUIENES.includes(quien)) return fallo(MOTIVOS.ENTRADA_INVALIDA, [], ['quien'], { valor: quien });

  const firma_nueva = forma_receta.firma(comprobacion.receta);
  const reparacion_id = `rep-${crypto
    .createHash('sha256')
    .update(JSON.stringify({ clave: `${comprobacion.receta.plataforma}:${comprobacion.receta.capacidad}`, firma: firma_nueva, rotura: rotura.firma(declaracion) }))
    .digest('hex')
    .slice(0, 16)}`;

  return {
    ok: true,
    reparacion: {
      reparacion_id,
      plataforma: comprobacion.receta.plataforma,
      capacidad: comprobacion.receta.capacidad,
      clave: `${comprobacion.receta.plataforma}:${comprobacion.receta.capacidad}`,
      // Nace PROPUESTA y nunca vigente: la vigencia la da una persona y el catalogo.
      estado: ESTADO_PROPUESTA,
      vigente: false,
      origen: 'reparacion',
      receta: clonar(comprobacion.receta),
      firma: firma_nueva,
      anterior: {
        version: Number.isInteger(entrada.version) ? entrada.version : null,
        firma: forma_receta.firma(receta)
      },
      cambios,
      rotura: {
        veredicto: declaracion.veredicto,
        clave: declaracion.clave || `${receta.plataforma}:${receta.capacidad}`,
        pasos_rotos: declaracion.pasos_rotos || Array.from(rotos).sort((a, b) => a - b),
        consideradas: declaracion.consideradas === undefined ? null : declaracion.consideradas
      },
      juicio: {
        usado: juicio.usado,
        motivo: juicio.motivo,
        descartes: juicio.descartes || [],
        detalle: juicio.detalle === undefined ? null : juicio.detalle
      },
      descubierta_por: {
        proyecto: texto_no_vacio(entrada.proyecto) ? String(entrada.proyecto).trim() : null,
        cuenta: texto_no_vacio(entrada.cuenta) ? String(entrada.cuenta).trim() : null,
        aparato: texto_no_vacio(entrada.aparato) ? String(entrada.aparato).trim() : null,
        quien,
        momento
      },
      momento,
      quien,
      motivo: texto_no_vacio(entrada.motivo) ? String(entrada.motivo).trim() : 'reparacion de rotura declarada',
      // Nadie ha confirmado nada todavia. Esto es lo que separa una propuesta de
      // una receta que el puente va a ejecutar sin preguntar.
      confirmacion: null,
      requiere_confirmacion: true
    },
    // Lo que llegue en la entrada declarandose confirmado o vigente se descarta y
    // se dice: el reparador no puede firmarse a si mismo.
    descartado: {
      autopromocion: ['autorizacion_id', 'confirmacion', 'confirmada', 'estado', 'vigente', 'publicacion']
        .filter((campo) => entrada[campo] !== undefined)
    },
    requiere_confirmacion: true
  };
}

/**
 * Registra la confirmacion de una PERSONA sobre una reparacion. No publica ni
 * cambia el estado: la reparacion sigue siendo una propuesta, ahora autorizada.
 *
 * @param {object} reparacion lo que devolvio `reparar()`
 * @param {{autorizacion_id:string, quien:string, momento:string, motivo?:string}} confirmacion
 */
function confirmar(reparacion, confirmacion) {
  if (!es_objeto(reparacion) || !es_objeto(reparacion.receta) || reparacion.estado !== ESTADO_PROPUESTA) {
    return fallo(MOTIVOS.REPARACION_INVALIDA, ['reparacion'], [], {
      pista: 'solo se confirma una reparacion en estado propuesta'
    });
  }
  if (es_objeto(reparacion.confirmacion) && reparacion.confirmacion.autorizacion_id) {
    return fallo(MOTIVOS.YA_CONFIRMADA, [], [], {
      autorizacion_id: reparacion.confirmacion.autorizacion_id,
      pista: 'una reparacion se confirma una vez; si hay que rehacerla, se repara otra vez'
    });
  }
  if (!es_objeto(confirmacion)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['confirmacion'], []);

  const faltan = [];
  for (const campo of ['autorizacion_id', 'quien', 'momento']) if (vacio(confirmacion[campo])) faltan.push(campo);
  const invalidos = [];
  if (!faltan.includes('momento') && !es_instante(confirmacion.momento)) invalidos.push('momento');
  if (faltan.length || invalidos.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, faltan, invalidos);

  const quien = String(confirmacion.quien).trim();
  // Confirmar no es una accion del sistema: el sistema detecta la rotura, la
  // persona decide que la receta nueva es la buena.
  if (quien !== 'dueno') {
    return fallo(MOTIVOS.NO_ES_PERSONA, [], ['quien'], {
      valor: quien,
      pista: 'la reparacion la confirma el dueno; un agente o el sistema pueden proponer, no confirmar'
    });
  }

  return {
    ok: true,
    reparacion: Object.assign(clonar(reparacion), {
      confirmacion: {
        autorizacion_id: String(confirmacion.autorizacion_id).trim(),
        quien,
        momento: String(confirmacion.momento),
        motivo: texto_no_vacio(confirmacion.motivo) ? String(confirmacion.motivo).trim() : 'confirmacion de reparacion'
      }
    }),
    estado: ESTADO_PROPUESTA,
    vigente: false
  };
}

/**
 * La entrada que se puede llevar al catalogo. SIN confirmacion registrada no hay
 * entrada: esta funcion es la puerta.
 */
function para_catalogo(reparacion) {
  if (!es_objeto(reparacion) || !es_objeto(reparacion.receta)) {
    return fallo(MOTIVOS.REPARACION_INVALIDA, ['reparacion'], []);
  }
  if (!es_objeto(reparacion.confirmacion) || vacio(reparacion.confirmacion.autorizacion_id)) {
    return fallo(MOTIVOS.SIN_CONFIRMACION, ['confirmacion'], [], {
      guardado: false,
      pista: 'sin confirmacion registrada una reparacion no llega al catalogo'
    });
  }
  if (reparacion.estado !== ESTADO_PROPUESTA) {
    return fallo(MOTIVOS.AUTOPROMOCION, [], ['estado'], {
      valor: reparacion.estado,
      pista: 'una reparacion entra como propuesta; publicar es de catalogo.publicar'
    });
  }

  return {
    ok: true,
    entrada: {
      receta: clonar(reparacion.receta),
      plataforma: reparacion.receta.plataforma,
      capacidad: reparacion.receta.capacidad,
      origen: 'reparacion',
      motivo: reparacion.motivo || 'reparacion de rotura declarada',
      autorizacion_id: reparacion.confirmacion.autorizacion_id,
      momento: reparacion.confirmacion.momento,
      quien: reparacion.confirmacion.quien,
      proyecto: reparacion.descubierta_por ? reparacion.descubierta_por.proyecto : null,
      cuenta: reparacion.descubierta_por ? reparacion.descubierta_por.cuenta : null,
      aparato: reparacion.descubierta_por ? reparacion.descubierta_por.aparato : null,
      reparacion_id: reparacion.reparacion_id
    },
    confirmacion: clonar(reparacion.confirmacion),
    // Entra como propuesta: esto NO es una publicacion.
    estado: ESTADO_PROPUESTA,
    vigente: false
  };
}

module.exports = {
  ESTADO_PROPUESTA,
  MAX_CANDIDATAS_POR_PASO,
  MOTIVOS,
  normalizar,
  parecido,
  comparte_palabra_con_usada,
  candidatas_de,
  consultar_juicio,
  reparar,
  confirmar,
  para_catalogo
};

// Vista "clase" para quien prefiera el nombre del diseno (F2 · ReparadorDeReceta).
module.exports.ReparadorDeReceta = Object.freeze({
  reparar,
  confirmar,
  para_catalogo,
  candidatas_de,
  MOTIVOS
});
