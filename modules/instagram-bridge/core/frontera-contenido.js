'use strict';

/**
 * frontera-contenido — T1 · FronteraSinContenido · REFLEJO.
 *
 * El puente no aporta contenido propio. Toda pieza que se publica ENTRO desde un
 * proyecto, con autor y sello. Si el puente escribe el texto, ha dejado de ser un
 * puente y se ha convertido en un proyecto: por eso la comprobacion es un
 * invariante auditable y no una recomendacion.
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, T1):
 *   - **Sin origen no hay pieza.** Un dato que no dice de que proyecto viene no
 *     se puede probar recibido: se trata como `originada` (fallar cerrado). La
 *     duda no se resuelve a favor de publicar.
 *   - **El origen tiene que cuadrar con el sello (P1).** Decir "vengo del
 *     proyecto A" y traer un sello del proyecto B es una pieza sin dueno claro.
 *   - **Una pieza originada por el puente se rechaza con su motivo**, no se
 *     "arregla" cambiandole el autor.
 *   - **EL RELLENO TAMBIEN ES CONTENIDO PROPIO.** Un texto "de transicion" o "de
 *     relleno" escrito por el puente para que la publicacion no quede vacia sigue
 *     siendo el puente hablando. Aqui se nombra dos veces: si el campo declara
 *     procedencia del puente (`procedencia.texto`), y si el texto es una de las
 *     frases de relleno de la tabla cerrada (aunque la procedencia diga
 *     "proyecto": una frase de relleno es de relleno venga de donde venga).
 *
 * Puro: sin IO, sin reloj, sin red, sin estado global.
 */

const { es_objeto, texto_no_vacio, clonar } = require('./formas');
const { comprobar: comprobar_sello } = require('./sello');

const CODIGOS = Object.freeze({
  SIN_PIEZA: 'sin_pieza',
  SIN_ORIGEN: 'sin_origen',
  ORIGEN_ES_EL_PUENTE: 'origen_es_el_puente',
  ORIGEN_NO_COINCIDE_CON_EL_SELLO: 'origen_no_coincide_con_el_sello',
  SIN_AUTOR: 'sin_autor',
  AUTOR_ES_EL_PUENTE: 'autor_es_el_puente',
  SIN_SELLO: 'sin_sello',
  PROCEDENCIA_DESCONOCIDA: 'procedencia_desconocida',
  TEXTO_ORIGINADO_POR_EL_PUENTE: 'texto_originado_por_el_puente',
  TEXTO_DE_RELLENO: 'texto_de_relleno',
  ADJUNTO_ORIGINADO_POR_EL_PUENTE: 'adjunto_originado_por_el_puente'
});

const ORIGENES_DEL_PUENTE = Object.freeze([
  'puente',
  'bridge',
  'instagram-bridge',
  'instagram_bridge',
  'sistema',
  'enki'
]);

// De donde puede venir un texto. `proyecto` es el unico origen admitido para
// texto que se publica; `relleno` esta aqui para nombrarlo, no para permitirlo.
const PROCEDENCIAS_DE_TEXTO = Object.freeze(['proyecto']);
const PROCEDENCIAS_DEL_PUENTE = Object.freeze(['puente', 'bridge', 'instagram-bridge', 'instagram_bridge', 'sistema', 'relleno', 'transicion']);

// Campos donde puede viajar el texto publicado.
const CAMPOS_DE_TEXTO = Object.freeze(['texto', 'caption', 'pie', 'titulo', 'descripcion']);

/**
 * Tabla CERRADA de frases de relleno. No es una heuristica: es la lista de lo que
 * el puente diria para tapar un hueco. Se compara normalizado y exacto (sin
 * puntuacion en los bordes), para no marcar contenido real que las mencione.
 */
const FRASES_DE_RELLENO = Object.freeze([
  'mira mi perfil',
  'no te lo pierdas',
  'sigueme para mas',
  'sigueme para mas contenido',
  'link en bio',
  'mas contenido pronto',
  'esto es todo por hoy',
  'gracias por tu apoyo',
  'comparte si te gusta',
  'asi soy yo'
]);

function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?¡¿"'()\u2026-]+/, '')
    .replace(/[\s.,;:!?¡¿"'()\u2026-]+$/, '')
    .trim();
}

function es_origen_del_puente(valor) {
  if (typeof valor !== 'string') return false;
  return ORIGENES_DEL_PUENTE.includes(valor.trim().toLowerCase());
}

/** ¿Este texto es una frase de relleno de la tabla? Comparacion exacta normalizada. */
function es_texto_de_relleno(texto) {
  if (typeof texto !== 'string') return false;
  const n = normalizar(texto);
  if (n === '') return false;
  return FRASES_DE_RELLENO.includes(n);
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign(
    { estado: 'originada', ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] },
    extra || {}
  );
}

/** Proyecto de origen declarado por la pieza (o null). */
function origen_de(pieza) {
  if (!es_objeto(pieza)) return null;
  if (texto_no_vacio(pieza.origen)) return String(pieza.origen).trim();
  if (es_objeto(pieza.origen) && texto_no_vacio(pieza.origen.proyecto)) return String(pieza.origen.proyecto).trim();
  return null;
}

/**
 * Procedencia declarada de los campos. Acepta `pieza.procedencia` (objeto) o los
 * atajos `texto_origen` / `relleno: true`. `null` significa "no declara nada", y
 * no declarar no se lee como "del proyecto": solo el texto se puede comprobar
 * contra la tabla de relleno.
 */
function procedencia_de(pieza) {
  if (!es_objeto(pieza)) return {};
  if (es_objeto(pieza.procedencia)) return pieza.procedencia;
  const p = {};
  if (texto_no_vacio(pieza.texto_origen)) p.texto = String(pieza.texto_origen).trim();
  if (pieza.relleno === true) p.texto = 'relleno';
  return p;
}

/**
 * ¿La pieza entro desde un proyecto? Recorre origen, autor, sello y texto.
 * Devuelve `recibida` solo si TODO cuadra; cualquier duda es `originada`.
 *
 * @param {object} pieza {origen, autor, sello, texto?, caption?, procedencia?, adjuntos?}
 * @returns {{estado:string, ok:boolean, motivo?:string, proyecto?:string|null, campo?:string, faltan?:string[]}}
 */
function comprobar(pieza) {
  if (!es_objeto(pieza)) return fallo(CODIGOS.SIN_PIEZA, ['pieza'], [], { proyecto: null });

  const origen = origen_de(pieza);
  if (!origen) {
    return fallo(CODIGOS.SIN_ORIGEN, ['origen'], [], {
      proyecto: null,
      pista: 'el puente no origina piezas: sin proyecto de origen no se puede probar que entro'
    });
  }
  if (es_origen_del_puente(origen)) {
    return fallo(CODIGOS.ORIGEN_ES_EL_PUENTE, [], ['origen'], { proyecto: origen });
  }

  if (!texto_no_vacio(pieza.autor)) return fallo(CODIGOS.SIN_AUTOR, ['autor'], [], { proyecto: origen });
  if (es_origen_del_puente(pieza.autor)) {
    return fallo(CODIGOS.AUTOR_ES_EL_PUENTE, [], ['autor'], { proyecto: origen, autor: pieza.autor });
  }

  const c = comprobar_sello(pieza);
  if (!c.ok) {
    return fallo(CODIGOS.SIN_SELLO, c.faltan || ['sello'], c.invalidos || [], {
      proyecto: origen,
      causa: c.motivo || 'sin_sello'
    });
  }
  if (String(c.sello.proyecto).trim() !== origen) {
    return fallo(CODIGOS.ORIGEN_NO_COINCIDE_CON_EL_SELLO, [], ['origen'], {
      proyecto: origen,
      proyecto_del_sello: String(c.sello.proyecto).trim()
    });
  }

  const procedencia = procedencia_de(pieza);

  // 1) La pieza declara que el texto lo escribio el puente.
  if (procedencia.texto !== undefined) {
    const proc = String(procedencia.texto).trim().toLowerCase();
    if (PROCEDENCIAS_DEL_PUENTE.includes(proc)) {
      return fallo(
        proc === 'relleno' || proc === 'transicion' ? CODIGOS.TEXTO_DE_RELLENO : CODIGOS.TEXTO_ORIGINADO_POR_EL_PUENTE,
        [],
        ['procedencia.texto'],
        { proyecto: origen, campo: 'texto', procedencia: proc }
      );
    }
    if (!PROCEDENCIAS_DE_TEXTO.includes(proc)) {
      // Una procedencia que no se entiende no se interpreta a favor de publicar.
      return fallo(CODIGOS.PROCEDENCIA_DESCONOCIDA, [], ['procedencia.texto'], { proyecto: origen, procedencia: proc });
    }
  }

  // 2) El texto es de relleno aunque la procedencia diga "proyecto": la frase
  //    delata el hueco tapado. Es la regla fina del bloque.
  for (const campo of CAMPOS_DE_TEXTO) {
    if (es_texto_de_relleno(pieza[campo])) {
      return fallo(CODIGOS.TEXTO_DE_RELLENO, [], [campo], {
        proyecto: origen,
        campo,
        texto: pieza[campo],
        pista: 'el texto de relleno tambien es contenido propio: no hay pieza sin texto del proyecto'
      });
    }
  }

  // 3) Adjuntos: cada uno puede declarar su procedencia. Se comprueba entera.
  if (Array.isArray(pieza.adjuntos)) {
    for (let i = 0; i < pieza.adjuntos.length; i += 1) {
      const adj = pieza.adjuntos[i];
      if (!es_objeto(adj)) continue;
      const p = es_objeto(adj.procedencia) && texto_no_vacio(adj.procedencia.origen) ? adj.procedencia.origen : adj.origen;
      if (es_origen_del_puente(p)) {
        return fallo(CODIGOS.ADJUNTO_ORIGINADO_POR_EL_PUENTE, [], [`adjuntos[${i}].origen`], {
          proyecto: origen,
          indice: i
        });
      }
    }
  }

  return { estado: 'recibida', ok: true, proyecto: origen, sello: c.sello, procedencia: clonar(procedencia) };
}

/**
 * Rechazo ejecutable: si la pieza fue originada por el puente, no sale. El
 * rechazo dice el motivo y nunca propone "arreglarlo" cambiando el autor.
 */
function rechazar_si_originada(pieza) {
  const r = comprobar(pieza);
  if (r.ok) return { ok: true, pieza, proyecto: r.proyecto || null, estado: 'recibida' };
  return {
    ok: false,
    estado: 'originada',
    motivo: r.motivo,
    faltan: r.faltan || [],
    invalidos: r.invalidos || [],
    campo: r.campo || null,
    rechazo: {
      motivo: r.motivo,
      campo: r.campo || null,
      proyecto: r.proyecto || null,
      que_haria_falta: 'que la pieza entre desde el proyecto, con su autor y su sello; el puente no la escribe'
    }
  };
}

/**
 * Auditoria de un dia de publicaciones. Un solo hallazgo invalida la entrega.
 *
 * @param {object[]|{piezas:object[]}} piezas
 */
function auditar(piezas) {
  const lista = Array.isArray(piezas)
    ? piezas
    : (es_objeto(piezas) && Array.isArray(piezas.piezas) ? piezas.piezas : null);
  if (lista === null) {
    return { ok: false, motivo: CODIGOS.SIN_PIEZA, total: 0, recibidas: 0, originadas: [] };
  }
  const originadas = [];
  lista.forEach((pieza, indice) => {
    const r = comprobar(pieza);
    if (r.ok) return;
    originadas.push({
      indice,
      motivo: r.motivo,
      campo: r.campo || null,
      proyecto: r.proyecto || null
    });
  });
  return {
    ok: originadas.length === 0,
    total: lista.length,
    recibidas: lista.length - originadas.length,
    originadas
  };
}

module.exports = {
  CODIGOS,
  ORIGENES_DEL_PUENTE,
  PROCEDENCIAS_DE_TEXTO,
  PROCEDENCIAS_DEL_PUENTE,
  CAMPOS_DE_TEXTO,
  FRASES_DE_RELLENO,
  normalizar,
  es_origen_del_puente,
  es_texto_de_relleno,
  origen_de,
  procedencia_de,
  comprobar,
  rechazar_si_originada,
  auditar
};

// Vista "clase" para quien prefiera el nombre del diseno (T1 · FronteraSinContenido).
module.exports.FronteraSinContenido = Object.freeze({
  comprobar,
  rechazar_si_originada,
  auditar,
  es_texto_de_relleno
});
