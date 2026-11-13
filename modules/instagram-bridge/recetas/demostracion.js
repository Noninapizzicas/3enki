'use strict';

/**
 * demostracion — A4.2 · SembradorDeDemostracion · CONVERSOR.
 *
 * Una receta no se inventa: nace de que una PERSONA haga la operacion una vez en
 * el movil y alguien la observe. Esta pieza traduce lo observado (hechos
 * visibles + gestos) a una receta PROPUESTA. Nada mas: no decide, no publica y
 * no persiste. La vigencia la dan la confirmacion humana (Q5) y el catalogo
 * (A4.4); aqui solo se siembra.
 *
 * Las dos reglas que hacen que una demostracion valga algo:
 *   - **Se traduce lo que se vio, no lo que "deberia" haber.** Si el paso no
 *     tenia ancla, la receta no se inventa una: el paso queda defectuoso y se
 *     dice cual. Si el gesto no cambio nada visible, no se inventa una
 *     consecuencia. Un hueco se nombra; no se rellena.
 *   - **Si un gesto resolvio dos cosas, se pide repetir.** Dos cosas nombradas
 *     apareciendo en un solo toque significa que la demostracion no dice QUE
 *     gesto produjo QUE consecuencia; el conversor no adivina la intencion.
 *     (Solo se aplica a tocar/desplazar: escribir abre un teclado, y eso no es
 *     resolver dos cosas.)
 *
 * La demostracion tiene que venir de un hecho completo: los `HechoVisible` que
 * no pasan `formas.validar_hecho_visible` se rechazan enteros, y una mirada
 * parcial no se anota: no se puede afirmar lo que no se vio.
 *
 * Puro: sin reloj, sin red, sin IO, sin estado global (la demostracion en curso
 * viaja como valor y se devuelve nueva en cada paso).
 *
 * Ver plan-construccion.md 4.1 (D12) y 8 (bloque 3), y diseno-oop.md "A4.2".
 */

const {
  es_objeto,
  texto_no_vacio,
  clonar,
  crear_sello,
  validar_hecho_visible,
  TIPOS_ANCLA
} = require('../core/formas');
const { comprobar: comprobar_sello } = require('../core/sello');
const forma_receta = require('../core/forma-receta');
const no_secretos = require('../core/no-secretos');

const PLATAFORMA_POR_DEFECTO = 'instagram';
// `en_curso` mientras se anota, `descartada` si se abandona. No hay `cerrada`:
// cerrar no muta la demostracion, devuelve la propuesta (cerrar dos veces da la
// misma propuesta, que es lo que se espera de un conversor determinista).
const ESTADOS = Object.freeze(['en_curso', 'descartada']);

// Gestos que se sabe observar -> accion de receta. Espejo de A3 y de
// `crate/src/almacen/demostracion.rs`.
const GESTOS = Object.freeze(['tocar', 'escribir', 'desplazar', 'esperar']);

// Solo estos gestos pueden "resolver dos cosas" en un toque. Escribir abre el
// teclado (muchos nodos nuevos que no son una segunda decision).
const GESTOS_DE_UN_SOLO_EFECTO = Object.freeze(['tocar', 'desplazar']);

const MOTIVOS = Object.freeze({
  DEMOSTRACION_VACIA: 'demostracion_vacia',
  PASOS_AMBIGUOS: 'pasos_ambiguos',
  DEFECTO_DE_FORMA: 'defecto_de_forma',
  SIN_MIRADA: 'sin_mirada',
  MIRADA_PARCIAL: 'mirada_parcial',
  GESTO_DESCONOCIDO: 'gesto_desconocido',
  DEMOSTRACION_NO_ABIERTA: 'demostracion_no_abierta',
  ENTRADA_INVALIDA: 'entrada_invalida',
  SECRETO_RECIBIDO: 'secreto_recibido',
  SIN_MOTIVO: 'sin_motivo'
});

function fallo(motivo, extra) {
  return Object.assign({ ok: false, motivo }, extra || {});
}

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** Tipo de ancla a partir del tipo de nodo observado: no se inventa, se degrada. */
function tipo_de_ancla(tipo) {
  const t = texto_no_vacio(tipo) ? String(tipo).trim().toLowerCase() : '';
  return TIPOS_ANCLA.includes(t) ? t : 'desconocido';
}

function ancla_de_nodo(nodo) {
  if (!es_objeto(nodo)) return null;
  const nombre = texto_no_vacio(nodo.nombre_visible) ? String(nodo.nombre_visible).trim() : null;
  if (!nombre) return null;
  return { nombre_visible: nombre, tipo: tipo_de_ancla(nodo.tipo) };
}

/** Momento de un hecho: el de su sello (P1). */
function momento_de(hecho) {
  if (!es_objeto(hecho)) return null;
  if (es_objeto(hecho.sello) && texto_no_vacio(hecho.sello.momento)) return String(hecho.sello.momento);
  if (texto_no_vacio(hecho.momento)) return String(hecho.momento);
  return null;
}

function ids_de(hecho) {
  const set = new Set();
  for (const nodo of hecho.nodos) if (nodo && texto_no_vacio(nodo.id)) set.add(String(nodo.id));
  return set;
}

/**
 * Diferencia observable entre dos hechos: que nodos aparecieron y cuales se
 * fueron. Se compara por `id` (A1 siempre lo trae; sin id no hay comparacion
 * posible y el hecho no pasa la validacion de forma).
 */
function diferencia(antes, despues) {
  const antesIds = ids_de(antes);
  const despuesIds = ids_de(despues);
  const aparecen = despues.nodos.filter((n) => n && !antesIds.has(String(n.id)));
  const desaparecen = antes.nodos.filter((n) => n && !despuesIds.has(String(n.id)));
  return { aparecen, desaparecen };
}

// ---- abrir ----------------------------------------------------------------

/**
 * Abre una demostracion. Necesita sello (quinteto) o un sello ya hecho: una
 * demostracion sin dueno no se puede atribuir y el catalogo no la admitiria.
 *
 * @param {object} partes {capacidad, cuenta, plataforma?, proyecto?, aparato?,
 *   momento?, quien?, sello?, demostracion_id?}
 */
function abrir(partes) {
  if (!es_objeto(partes)) return fallo(MOTIVOS.ENTRADA_INVALIDA, { faltan: ['partes'] });

  const faltan = [];
  if (vacio(partes.capacidad)) faltan.push('capacidad');
  if (faltan.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, { faltan, invalidos: [] });

  let sello;
  if (partes.sello !== undefined && partes.sello !== null) {
    const c = comprobar_sello({ sello: partes.sello });
    if (!c.ok) return fallo('sin_sello', { faltan: c.faltan || [], invalidos: c.invalidos || [] });
    sello = c.sello;
  } else {
    const s = crear_sello({
      proyecto: partes.proyecto,
      cuenta: partes.cuenta,
      aparato: partes.aparato,
      momento: partes.momento,
      quien: partes.quien
    });
    if (!s.ok) return fallo('sin_sello', { faltan: s.faltan || [], invalidos: s.invalidos || [] });
    sello = s.sello;
  }

  const plataforma = texto_no_vacio(partes.plataforma)
    ? String(partes.plataforma).trim().toLowerCase()
    : PLATAFORMA_POR_DEFECTO;

  // Id determinista: la misma demostracion (misma clave, misma cuenta, mismo
  // momento) tiene el mismo id. Nada de aleatoriedad en un conversor.
  const id = texto_no_vacio(partes.demostracion_id)
    ? String(partes.demostracion_id).trim()
    : `dem:${plataforma}:${String(partes.capacidad).trim()}:${sello.cuenta}:${sello.momento}`;

  const demostracion = {
    id,
    plataforma,
    capacidad: String(partes.capacidad).trim(),
    cuenta: sello.cuenta,
    sello: clonar(sello),
    estado: 'en_curso',
    pasos: [],
    motivo_descarte: null
  };

  return { ok: true, demostracion };
}

// ---- anotar paso ---------------------------------------------------------

/**
 * Anota un paso observado: lo que habia antes, el gesto de la persona y lo que
 * quedo despues.
 *
 * @param {object} demostracion
 * @param {object} observacion {antes, gesto, despues, espera_maxima?}
 */
function anotar_paso(demostracion, observacion) {
  if (!es_objeto(demostracion) || demostracion.estado !== 'en_curso') {
    return fallo(MOTIVOS.DEMOSTRACION_NO_ABIERTA, { estado: demostracion && demostracion.estado });
  }
  const secreto = no_secretos.detectar_secreto(observacion);
  if (secreto.length) {
    return fallo(MOTIVOS.SECRETO_RECIBIDO, {
      rutas: secreto.map((h) => h.ruta),
      familias: no_secretos.familias_de(secreto),
      guardado: false
    });
  }
  if (!es_objeto(observacion)) return fallo(MOTIVOS.ENTRADA_INVALIDA, { faltan: ['observacion'], invalidos: [] });

  const numero = demostracion.pasos.length + 1;
  const faltan = [];
  if (observacion.antes === undefined) faltan.push('antes');
  if (observacion.despues === undefined) faltan.push('despues');
  if (!es_objeto(observacion.gesto)) faltan.push('gesto');
  if (faltan.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, { faltan, invalidos: [] });

  // Los hechos tienen que ser hechos: completa, sellada y con nodos.
  for (const lado of ['antes', 'despues']) {
    const v = validar_hecho_visible(observacion[lado]);
    if (!v.ok) {
      return fallo(MOTIVOS.SIN_MIRADA, {
        paso: numero,
        lado,
        faltan: v.faltan,
        invalidos: v.invalidos,
        pista: 'sin un hecho visible completo no se puede sembrar una receta'
      });
    }
    if (observacion[lado].mirada !== 'completa') {
      return fallo(MOTIVOS.MIRADA_PARCIAL, {
        paso: numero,
        lado,
        motivo_sin_mirada: observacion[lado].motivo_sin_mirada || null,
        pista: 'una mirada parcial no se anota: no se puede afirmar lo que no se vio'
      });
    }
  }

  const gesto = observacion.gesto;
  const tipo = texto_no_vacio(gesto.tipo) ? String(gesto.tipo).trim().toLowerCase() : null;
  if (!tipo || !GESTOS.includes(tipo)) {
    return fallo(MOTIVOS.GESTO_DESCONOCIDO, { paso: numero, valor: gesto.tipo });
  }

  const { aparecen, desaparecen } = diferencia(observacion.antes, observacion.despues);

  // Dos cosas nombradas resueltas en un toque: no se sabe que gesto produjo que.
  if (GESTOS_DE_UN_SOLO_EFECTO.includes(tipo)) {
    const nombradas = aparecen.filter((n) => texto_no_vacio(n.nombre_visible));
    if (nombradas.length >= 2) {
      return fallo(MOTIVOS.PASOS_AMBIGUOS, {
        paso: numero,
        aparecen: nombradas.map((n) => String(n.nombre_visible)),
        pista: 'el gesto resolvio dos cosas: hay que repetir la demostracion paso a paso'
      });
    }
  }

  const paso = {
    numero,
    // Lo que se toco. Si la persona no dejo ancla, se anota el hueco: no se
    // rellena con "el elemento de al lado".
    ancla: es_objeto(gesto.ancla) ? clonar(gesto.ancla) : null,
    gesto: clonar(gesto),
    antes: { pantalla: observacion.antes.pantalla, nodos: observacion.antes.nodos.length },
    despues: { pantalla: observacion.despues.pantalla, nodos: observacion.despues.nodos.length },
    aparecen: aparecen.map((n) => (texto_no_vacio(n.nombre_visible) ? String(n.nombre_visible) : String(n.id))),
    desaparecen: desaparecen.map((n) => (texto_no_vacio(n.nombre_visible) ? String(n.nombre_visible) : String(n.id))),
    // Anclas reales de lo que aparecio (solo lo que tenia nombre visible): son
    // las unicas que pueden servir de consecuencia comprobable.
    aparecen_anclas: aparecen.map(ancla_de_nodo).filter((a) => a !== null),
    espera_maxima: Number.isInteger(observacion.espera_maxima) && observacion.espera_maxima > 0
      ? observacion.espera_maxima
      : null,
    // El momento del hecho vive en SU sello (P1): se lee de ahi, no de un campo
    // suelto que nadie garantiza.
    momento_antes: momento_de(observacion.antes),
    momento_despues: momento_de(observacion.despues)
  };

  const nueva = clonar(demostracion);
  nueva.pasos.push(paso);
  return { ok: true, demostracion: nueva, paso: clonar(paso) };
}

// ---- cerrar (traducir a propuesta) --------------------------------------

/** Espera de un paso: la medida por el aparato; si no, la que dicen los relojes. */
function espera_de(paso) {
  if (Number.isInteger(paso.espera_maxima) && paso.espera_maxima > 0) return paso.espera_maxima;
  if (paso.momento_antes && paso.momento_despues) {
    const a = Date.parse(paso.momento_antes);
    const b = Date.parse(paso.momento_despues);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) return Math.round(b - a);
  }
  return null;
}

/**
 * Cierra la demostracion y devuelve la receta PROPUESTA (nunca vigente).
 *
 * @param {object} demostracion
 * @returns {{ok:true, propuesta:object, defectos:object[]} | {ok:false, motivo:string, defectos?:object[]}}
 */
function cerrar(demostracion) {
  if (!es_objeto(demostracion) || demostracion.estado !== 'en_curso') {
    return fallo(MOTIVOS.DEMOSTRACION_NO_ABIERTA, { estado: demostracion && demostracion.estado });
  }
  if (!Array.isArray(demostracion.pasos) || demostracion.pasos.length === 0) {
    return fallo(MOTIVOS.DEMOSTRACION_VACIA, { defectos: [] });
  }

  const defectos = [];
  const pasos = [];

  demostracion.pasos.forEach((observado, i) => {
    const numero = i + 1;

    // 1 · ancla. Sin ancla no se sabe donde tocar y NO se inventa.
    const ancla = es_objeto(observado.ancla) && texto_no_vacio(observado.ancla.nombre_visible)
      ? { nombre_visible: String(observado.ancla.nombre_visible).trim(), tipo: tipo_de_ancla(observado.ancla.tipo) }
      : null;
    if (!ancla) {
      defectos.push({ paso: numero, parte: 'ancla_esperada', motivo: 'falta', pista: 'el paso no dejo ancla observada' });
    }

    // 2 · accion, desde el gesto observado.
    const gesto = es_objeto(observado.gesto) ? observado.gesto : {};
    const accion = { tipo: texto_no_vacio(gesto.tipo) ? String(gesto.tipo).trim().toLowerCase() : null };
    if (accion.tipo === 'escribir' && texto_no_vacio(gesto.texto)) accion.texto = String(gesto.texto);
    if (accion.tipo === 'desplazar' && texto_no_vacio(gesto.direccion)) accion.direccion = String(gesto.direccion).trim().toLowerCase();
    if (accion.tipo === 'desplazar' && Number.isFinite(gesto.distancia) && gesto.distancia > 0) accion.distancia = Number(gesto.distancia);
    if (accion.tipo === 'esperar' && Number.isInteger(gesto.ventana_ms)) accion.ventana_ms = gesto.ventana_ms;
    if (!GESTOS.includes(accion.tipo)) {
      defectos.push({ paso: numero, parte: 'accion', motivo: 'invalido', valor: accion.tipo });
    }

    // 3 · consecuencia: lo que cambio, tal cual. Si no cambio nada, no hay
    // consecuencia que vigilar y el paso no ensena nada.
    const aparecen = Array.isArray(observado.aparecen) ? observado.aparecen : [];
    const desaparecen = Array.isArray(observado.desaparecen) ? observado.desaparecen : [];
    const anclas_de_aparecidos = Array.isArray(observado.aparecen_anclas) ? observado.aparecen_anclas : [];
    let consecuencia = null;
    if (aparecen.length) {
      consecuencia = { descripcion: `aparece: ${aparecen.join(', ')}`, ancla: null };
    } else if (desaparecen.length) {
      consecuencia = { descripcion: `desaparece: ${desaparecen.join(', ')}`, ancla: null };
    } else if (accion.tipo === 'esperar') {
      consecuencia = { descripcion: 'la espera transcurre sin cambio visible', ancla: null };
    } else {
      defectos.push({
        paso: numero,
        parte: 'consecuencia_esperada',
        motivo: 'falta',
        pista: 'el gesto no cambio nada visible: no hay consecuencia que vigilar'
      });
    }
    if (consecuencia && anclas_de_aparecidos.length === 1) {
      // Un solo nodo con nombre aparecio: la consecuencia se puede comprobar
      // mirando, y su ancla es ese nodo, que SI se vio.
      consecuencia.ancla = {
        nombre_visible: anclas_de_aparecidos[0].nombre_visible,
        tipo: anclas_de_aparecidos[0].tipo
      };
    }

    // 4 · espera. Medida o deducida de los relojes; si no hay ninguna, hueco.
    const espera = espera_de(observado);
    if (espera === null) {
      defectos.push({ paso: numero, parte: 'espera_maxima', motivo: 'falta', pista: 'no se midio cuanto tardo el paso' });
    }

    if (ancla && consecuencia && defectos.every((d) => d.paso !== numero)) {
      pasos.push({
        ancla_esperada: ancla,
        accion,
        consecuencia_esperada: consecuencia,
        espera_maxima: espera
      });
    }
  });

  if (defectos.length) {
    return fallo(MOTIVOS.DEFECTO_DE_FORMA, { defectos });
  }

  const primero = demostracion.pasos[0];
  const ultimo = demostracion.pasos[demostracion.pasos.length - 1];
  const techo = pasos.reduce((total, p) => total + p.espera_maxima, 0);

  const receta = {
    plataforma: demostracion.plataforma,
    capacidad: demostracion.capacidad,
    precondicion: {
      descripcion: `pantalla ${primero.antes.pantalla} con ${primero.antes.nodos} elementos`,
      ancla: pasos[0].ancla_esperada
    },
    pasos,
    postcondicion: {
      descripcion: `pantalla ${ultimo.despues.pantalla} con ${ultimo.despues.nodos} elementos`,
      ancla: pasos[pasos.length - 1].consecuencia_esperada.ancla
    },
    techo
  };

  const v = forma_receta.validar(receta);
  if (!v.ok) return fallo(MOTIVOS.DEFECTO_DE_FORMA, { defectos: v.defectos });

  const propuesta = {
    // Nace PROPUESTA. No hay ningun camino en esta pieza que devuelva vigente.
    estado: 'propuesta',
    vigente: false,
    origen: 'demostracion',
    plataforma: demostracion.plataforma,
    capacidad: demostracion.capacidad,
    cuenta: demostracion.cuenta,
    sello: clonar(demostracion.sello),
    demostracion: {
      id: demostracion.id,
      pasos: demostracion.pasos.length,
      momento: demostracion.sello.momento
    },
    receta: clonar(v.receta)
  };

  return { ok: true, propuesta, defectos: [] };
}

/** Descarta la demostracion sin receta. Un descarte sin motivo es una leccion perdida. */
function descartar(demostracion, motivo) {
  if (!es_objeto(demostracion) || demostracion.estado !== 'en_curso') {
    return fallo(MOTIVOS.DEMOSTRACION_NO_ABIERTA, { estado: demostracion && demostracion.estado });
  }
  if (vacio(motivo)) return fallo(MOTIVOS.SIN_MOTIVO, { faltan: ['motivo'], invalidos: [] });
  const nueva = clonar(demostracion);
  nueva.estado = 'descartada';
  nueva.motivo_descarte = String(motivo).trim();
  return { ok: true, demostracion: nueva };
}

/**
 * La entrada que espera A4.4 (`proponer`) para inscribir la propuesta. Evita que
 * cada llamante improvise el traslado y pierda el sello por el camino.
 */
function entrada_de_catalogo(propuesta) {
  if (!es_objeto(propuesta) || !es_objeto(propuesta.receta)) return null;
  return {
    receta: clonar(propuesta.receta),
    plataforma: propuesta.plataforma,
    capacidad: propuesta.capacidad,
    origen: propuesta.origen || 'demostracion',
    sello: propuesta.sello ? clonar(propuesta.sello) : undefined,
    motivo: 'sembrada desde una demostracion'
  };
}

module.exports = {
  PLATAFORMA_POR_DEFECTO,
  ESTADOS,
  GESTOS,
  MOTIVOS,
  abrir,
  anotar_paso,
  cerrar,
  descartar,
  entrada_de_catalogo
};

// Vista "clase" para quien prefiera el nombre del diseno (A4.2 · SembradorDeDemostracion).
module.exports.SembradorDeDemostracion = Object.freeze({
  abrir,
  anotar_paso,
  cerrar,
  descartar,
  entrada_de_catalogo
});
