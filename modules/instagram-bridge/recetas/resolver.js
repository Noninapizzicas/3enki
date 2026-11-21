'use strict';

/**
 * resolver — A2 · ResolvedorDeReceta · REFLEJO.
 *
 * Dada una capacidad pedida y la foto del saber hacer (lo que se ve del
 * catalogo), devuelve QUE RECETA se aplica. Nada mas: no ejecuta, no observa,
 * no compone.
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, A2):
 *
 *   - **Resuelve, no inventa.** Si no hay receta vigente para la clave devuelve
 *     `sin_receta` y PARA. No usa una antecesora, ni una propuesta, ni una
 *     receta de otra capacidad u otra plataforma, ni "la parecida". Una receta
 *     improvisada es un fallo caro disfrazado de solucion: se descubre a mitad
 *     de una publicacion, con la pieza medio subida.
 *
 *   - **Emparejamiento exacto por DOS claves**: `plataforma` y `capacidad`. Ni
 *     por texto de la receta, ni por proximidad, ni por historial. La clave es
 *     `instagram:publicar` y no hay mas clave que esa.
 *
 *   - **Una sola vigente por clave.** Si el catalogo trae dos (esta corrupto o
 *     alguien lo toco a mano), A2 NO ELIGE: devuelve `preguntar` con las dos
 *     versiones y para. Elegir una de dos vigentes es decidir por el dueno cual
 *     es la buena; eso no es resolver, es adivinar con acento de autoridad.
 *
 *   - **Una receta que no pasa la forma (A4.1) no se puede aplicar.** Se
 *     devuelve `rechazo` con los defectos y su numero de paso, no una receta
 *     mutilada para que cuadre.
 *
 *   - **Lo que se ve identifica, no elige.** El pedido puede traer `visible`
 *     (la pantalla tal y como se miro): se usa para comprobar que la plataforma
 *     declarada coincide y para dejar constancia de lo visto. La eleccion de la
 *     receta NO depende de la pantalla: si la receta encaja hoy o no lo dice el
 *     ensayo (A4.3), no el resolvedor.
 *
 *   - **Falla cerrado.** `ok` solo es `true` cuando hay receta aplicable. Un
 *     `sin_receta` es un hecho legitimo (`resuelto: true`), no un error, pero
 *     `ok: false` y `parar: true` en los dos casos: quien mire solo `ok` no
 *     ejecuta nunca de mas.
 *
 * Puro: sin reloj, sin red, sin IO, sin estado global, sin LLM. Todo entra por
 * argumento y todo lo que decide sale por el valor devuelto.
 *
 * Ver plan-construccion.md 4.2 (RPC 11) y 8 (bloque 5), y diseno-oop.md "A2".
 */

const { es_objeto, texto_no_vacio, clonar, PLATAFORMAS } = require('../core/formas');
const catalogo = require('./catalogo');
const forma_receta = require('../core/forma-receta');
const no_secretos = require('../core/no-secretos');

/**
 * Las cuatro salidas. No hay una quinta ni una "casi".
 *   aplicar   — hay UNA receta vigente, valida, de la clave pedida.
 *   sin_receta— no hay ninguna. Se para (regla dura).
 *   preguntar — hay mas de una vigente en la clave. No se elige.
 *   rechazo   — el pedido o el catalogo no permiten resolver.
 */
const VEREDICTOS = Object.freeze({
  APLICAR: 'aplicar',
  SIN_RECETA: 'sin_receta',
  PREGUNTAR: 'preguntar',
  RECHAZO: 'rechazo'
});

const MOTIVOS = Object.freeze({
  APLICAR: 'receta_vigente',
  SIN_RECETA: 'sin_receta',
  AMBIGUO: 'dos_vigentes_en_la_misma_clave',
  RECETA_DEFECTUOSA: 'receta_defectuosa',
  CATALOGO_ILEGIBLE: 'catalogo_ilegible',
  ENTRADA_INVALIDA: 'entrada_invalida',
  PLATAFORMA_DISTINTA: 'plataforma_distinta',
  SECRETO_RECIBIDO: 'secreto_recibido'
});

// Frases para una persona, indexadas por MOTIVO (no por veredicto): un motivo
// es lo que viaja en el payload y lo que R2 reescribe. Dicen que pasa y que
// hace falta, sin nombres de pantallas ni de nodos.
const PISTAS = Object.freeze({
  sin_receta: 'sin receta vigente para esta clave no se improvisa: se para y se pide una demostracion',
  dos_vigentes_en_la_misma_clave: 'el catalogo tiene dos vigentes en la misma clave: A2 no elige, pregunta cual vale',
  receta_defectuosa: 'la receta vigente no declara sus cuatro partes: no se aplica a medias',
  catalogo_ilegible: 'sin catalogo legible no se resuelve: no se improvisa una receta para tapar el hueco'
});

// ---- utilidades -----------------------------------------------------------

function rechazo(motivo, extra) {
  return Object.assign(
    {
      ok: false,
      resuelto: false,
      parar: true,
      veredicto: VEREDICTOS.RECHAZO,
      motivo,
      faltan: [],
      invalidos: []
    },
    extra || {}
  );
}

function parada(veredicto, motivo, extra) {
  return Object.assign(
    {
      ok: false,
      resuelto: true,
      parar: true,
      veredicto,
      motivo,
      pista: PISTAS[motivo] || null
    },
    extra || {}
  );
}

/**
 * Clave pedida: plataforma (por defecto `instagram`, la unica declarada) y
 * capacidad. La capacidad NO tiene valor por defecto: sin capacidad no hay
 * clave, y sin clave no se resuelve. Un hueco se nombra.
 */
function clave_del_pedido(pedido) {
  const plataforma = texto_no_vacio(pedido.plataforma)
    ? String(pedido.plataforma).trim().toLowerCase()
    : catalogo.PLATAFORMA;

  const faltan = [];
  const invalidos = [];
  if (!PLATAFORMAS.includes(plataforma)) invalidos.push('plataforma');
  const capacidad = texto_no_vacio(pedido.capacidad) ? String(pedido.capacidad).trim() : null;
  if (capacidad === null) faltan.push('capacidad');

  if (faltan.length || invalidos.length) return { ok: false, faltan, invalidos, plataforma, capacidad };
  return { ok: true, plataforma, capacidad, clave: catalogo.clave_de(plataforma, capacidad) };
}

/**
 * Plataforma declarada en lo que se ve (si la trae). Sirve para no resolver una
 * receta de Instagram contra una pantalla que no es Instagram.
 */
function plataforma_visible(visible) {
  if (!es_objeto(visible)) return null;
  const v = texto_no_vacio(visible.plataforma) ? String(visible.plataforma).trim().toLowerCase() : null;
  return v;
}

/** Lo visto, reducido a lo que A2 deja constancia. No se copia el arbol entero. */
function constancia_de_lo_visto(visible) {
  if (!es_objeto(visible)) return null;
  return {
    pantalla: texto_no_vacio(visible.pantalla) ? String(visible.pantalla).trim() : null,
    mirada: texto_no_vacio(visible.mirada) ? String(visible.mirada).trim() : null,
    nodos: Array.isArray(visible.nodos) ? visible.nodos.length : null
  };
}

function ambito_de(pedido) {
  return {
    proyecto: texto_no_vacio(pedido.proyecto) ? String(pedido.proyecto).trim() : null,
    cuenta: texto_no_vacio(pedido.cuenta) ? String(pedido.cuenta).trim() : null
  };
}

/**
 * Las versiones VIGENTES de la clave pedida, sin tocar nada. Es la unica puerta
 * por la que esta pieza mira el catalogo: dos claves, situacion `vigente`.
 *
 * @returns {{ok:boolean, clave?:string, vigentes?:object[], motivo?:string}}
 */
function candidatas(estado, pedido) {
  if (!catalogo.es_estado(estado)) return { ok: false, motivo: MOTIVOS.CATALOGO_ILEGIBLE };

  const clave = clave_del_pedido(pedido);
  if (!clave.ok) return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: clave.faltan, invalidos: clave.invalidos };

  const todas = catalogo.versiones(estado, { plataforma: clave.plataforma, capacidad: clave.capacidad });
  if (!todas.ok) return { ok: false, motivo: todas.motivo || MOTIVOS.CATALOGO_ILEGIBLE };

  return {
    ok: true,
    clave: clave.clave,
    plataforma: clave.plataforma,
    capacidad: clave.capacidad,
    vigentes: todas.versiones.filter((r) => r && r.estado === 'vigente')
  };
}

/**
 * RESUELVE. Devuelve la receta que se aplica, o la razon por la que no se puede
 * aplicar ninguna. Nunca devuelve una receta que no sea vigente y de la clave.
 *
 * @param {object} estado estado del catalogo (A4.4); se lee, no se muta
 * @param {object} pedido {capacidad, plataforma?, cuenta?, proyecto?, visible?}
 * @returns {object} ver veredictos arriba
 */
function resolver(estado, pedido) {
  if (!es_objeto(pedido)) return rechazo(MOTIVOS.ENTRADA_INVALIDA, { faltan: ['pedido'] });

  // Un secreto no entra ni para ser rechazado con el valor dentro (V1).
  const hallazgos = no_secretos.detectar_secreto(pedido);
  if (hallazgos.length > 0) {
    return rechazo(MOTIVOS.SECRETO_RECIBIDO, {
      rutas: hallazgos.map((h) => h.ruta),
      familias: no_secretos.familias_de(hallazgos)
    });
  }

  const c = candidatas(estado, pedido);
  if (!c.ok) {
    return rechazo(c.motivo, {
      faltan: c.faltan || [],
      invalidos: c.invalidos || [],
      pista: c.motivo === MOTIVOS.CATALOGO_ILEGIBLE ? PISTAS.catalogo_ilegible : null
    });
  }

  const clave = clave_del_pedido(pedido);
  const ambito = ambito_de(pedido);
  const visto = constancia_de_lo_visto(pedido.visible);
  const base = {
    clave: c.clave,
    plataforma: c.plataforma,
    capacidad: c.capacidad,
    ambito,
    visto
  };

  // La plataforma de lo que se ve manda: resolver una receta de Instagram
  // contra otra pantalla es aplicar el saber hacer al sitio equivocado.
  const visible = plataforma_visible(pedido.visible);
  if (visible !== null && visible !== clave.plataforma) {
    return rechazo(MOTIVOS.PLATAFORMA_DISTINTA, Object.assign({}, base, {
      invalidos: ['visible.plataforma'],
      visto: Object.assign({}, visto, { plataforma: visible })
    }));
  }

  if (c.vigentes.length === 0) {
    return parada(VEREDICTOS.SIN_RECETA, MOTIVOS.SIN_RECETA, Object.assign({}, base, {
      candidatas: 0
    }));
  }

  if (c.vigentes.length > 1) {
    // Dos vigentes: no se elige. Se devuelven las versiones para que quien
    // decida sepa que hay que decidir, y se para.
    const versiones = c.vigentes
      .map((r) => r.version)
      .filter((v) => Number.isInteger(v))
      .sort((a, b) => a - b);
    return parada(VEREDICTOS.PREGUNTAR, MOTIVOS.AMBIGUO, Object.assign({}, base, {
      candidatas: c.vigentes.length,
      versiones
    }));
  }

  const entrada = c.vigentes[0];
  const v = forma_receta.validar(entrada.receta);
  if (!v.ok) {
    return rechazo(MOTIVOS.RECETA_DEFECTUOSA, Object.assign({}, base, {
      version: entrada.version,
      defectos: v.defectos,
      pista: PISTAS.receta_defectuosa
    }));
  }

  return Object.assign({}, base, {
    ok: true,
    resuelto: true,
    parar: false,
    veredicto: VEREDICTOS.APLICAR,
    motivo: MOTIVOS.APLICAR,
    version: entrada.version,
    origen: entrada.origen || null,
    // La entrada tal y como vive en el catalogo (con su sello, su publicacion y
    // su historia): es lo que viaja en la evidencia.
    receta: clonar(entrada),
    // El cuerpo normalizado por A4.1: lo que A3 puede recorrer paso a paso.
    cuerpo: clonar(v.receta),
    pasos: v.receta.pasos.length
  });
}

/** ¿Se puede ejecutar con este resultado? Solo con `aplicar`. */
function puede_ejecutar(r) {
  return Boolean(r && r.ok === true && r.veredicto === VEREDICTOS.APLICAR && es_objeto(r.cuerpo));
}

/**
 * La parada, ya masticada para quien llama: `{ok:true}` o `{ok:false, motivo,
 * pista}`. Es el metodo que A3 consulta antes del primer gesto, igual que U1
 * tiene `parar_si_no_coincide`.
 */
function parar_si_no_hay(r) {
  if (puede_ejecutar(r)) return { ok: true };
  return {
    ok: false,
    veredicto: (r && r.veredicto) || VEREDICTOS.RECHAZO,
    motivo: (r && r.motivo) || MOTIVOS.SIN_RECETA,
    pista: (r && r.pista) || PISTAS.SIN_RECETA
  };
}

/**
 * Situacion de una receta del catalogo. `desconocida` se nombra: una entrada
 * sin situacion declarada no es "vigente por defecto".
 */
function vigencia(entrada) {
  if (!es_objeto(entrada) || !texto_no_vacio(entrada.estado)) return 'desconocida';
  return entrada.estado === 'vigente' ? 'vigente' : 'no_vigente';
}

/** Numero de version de una entrada, o null si no lo declara. */
function version_de(entrada) {
  if (!es_objeto(entrada) || !Number.isInteger(entrada.version) || entrada.version <= 0) return null;
  return entrada.version;
}

module.exports = {
  VEREDICTOS,
  MOTIVOS,
  PISTAS,
  clave_del_pedido,
  constancia_de_lo_visto,
  candidatas,
  resolver,
  puede_ejecutar,
  parar_si_no_hay,
  vigencia,
  version_de
};

// Vista "clase" para quien prefiera el nombre del diseno (A2 · ResolvedorDeReceta).
module.exports.ResolvedorDeReceta = Object.freeze({
  resolver,
  vigencia,
  version_de,
  candidatas,
  parar_si_no_hay
});
