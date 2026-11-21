'use strict';

/**
 * piezas — L1 · PreparadorDePieza · CONVERSOR.
 *
 * La UNICA frontera de formato del sistema. Toda pieza que va a salir pasa por
 * aqui (o por A4.2, que es el otro conversor declarado, y por ningun otro sitio).
 * Si cada capacidad adaptara a su manera, habria tantas definiciones de "cabe"
 * como caminos, y la que menos se usara seria la que decide.
 *
 * QUE HACE:
 *   `admitir`  comprueba y NO toca nada. Si no cabe, rechaza diciendo QUE falta
 *              exactamente (cuantos caracteres de mas, cuantos MB de mas).
 *   `adaptar`  admite y, si hace falta, ADAPTA: recorta el texto y declara el
 *              encuadre de los adjuntos. Si no cabe sin cambiar lo que dice,
 *              rechaza igual que `admitir`.
 *   `comprobar_completitud`  dice si a la pieza le falta un mensaje (texto o
 *              adjunto) o un dato de un adjunto. Nombra el hueco.
 *
 * LA REGLA QUE DEFINE EL RECORTE: **recortar una frase no puede invertir lo que
 * dice**. Aqui se hace ejecutable con una propiedad estructural, no con buenas
 * intenciones:
 *
 *   1. **El recorte es un PREFIJO del original.** No se reordena, no se
 *      reescribe, no se añade una sola comilla (ni siquiera "…"). Si es
 *      prefijo, no puede decir lo contrario: para invertir el sentido habria
 *      que añadir un "no" o cambiar el orden, y aqui no se hace ninguna de las
 *      dos cosas.
 *   2. **Se corta por frases enteras, de atras hacia delante.** Nunca por la
 *      mitad: cortar dentro de una frase es lo que parte un "no" de su verbo y
 *      lo que convierte "45 €" en "4". Una frase o entra completa o no entra.
 *   3. **La primera frase no se toca.** Es la que dice de que va la pieza. Si la
 *      primera frase no cabe, la pieza NO se publica: recortarla seria cambiar
 *      el mensaje, y este conversor no cambia mensajes.
 *   4. **Lo que se quita se declara.** El resultado lleva `recorte.quitado`
 *      (cuantas frases y cuantos caracteres) y `recorte.texto_original` en
 *      claro, para que el dueno pueda ver que se dejo fuera. Un recorte
 *      silencioso es una edicion, y editar sin avisar no es recortar.
 *
 * LOS ADJUNTOS NO SE TOCAN AQUI. No hay manipulacion de imagen ni de video en
 * el cerebro (ni dependencias nuevas, ni pixels viajando por el bus). Lo que
 * hace `adaptar` es declarar el ENCUADRE: a que proporcion admitida se lleva
 * cada adjunto y si eso pierde parte de lo que se ve. Si la perdida es tanta
 * que la pieza ya no ensena lo mismo, se rechaza. Ejecutar el recorte de pixels
 * es trabajo del aparato, que es quien tiene la imagen.
 *
 * No publica nada: PREPARA. Puro: sin IO, sin reloj, sin red, sin estado.
 */

const { es_objeto, texto_no_vacio, clonar } = require('../core/formas');

const PLATAFORMAS = Object.freeze(['instagram']);
const DESTINOS = Object.freeze(['publicacion', 'historia', 'reel']);
const TIPOS_DE_ADJUNTO = Object.freeze(['imagen', 'video']);

// Campos donde puede viajar el texto que se publica. Se procesan TODOS los que
// vengan: una pieza con `texto` y `caption` tiene dos sitios donde pasarse.
const CAMPOS_DE_TEXTO = Object.freeze(['texto', 'caption', 'pie', 'titulo', 'descripcion']);

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  PLATAFORMA_DESCONOCIDA: 'plataforma_desconocida',
  DESTINO_DESCONOCIDO: 'destino_desconocido',
  SIN_MENSAJE: 'sin_mensaje',
  TEXTO_NO_CABE: 'texto_no_cabe',
  TEXTO_NO_CABE_SIN_CAMBIAR_EL_SENTIDO: 'texto_no_cabe_sin_cambiar_el_sentido',
  ADJUNTOS_DE_MAS: 'adjuntos_de_mas',
  ADJUNTO_INCOMPLETO: 'adjunto_incompleto',
  TIPO_DE_ADJUNTO_NO_ADMITIDO: 'tipo_de_adjunto_no_admitido',
  PESA_DE_MAS: 'pesa_de_mas',
  DURACION_DE_MAS: 'duracion_de_mas',
  PROPORCION_NO_ADMISIBLE: 'proporcion_no_admisible'
});

/**
 * Reglas de admision por plataforma. Una tabla, no un if repartido: si mañana
 * entra otra plataforma (W1), entra como clave y ninguna clase cambia de forma.
 */
const REGLAS = Object.freeze({
  instagram: Object.freeze({
    plataforma: 'instagram',
    texto_max: 2200,
    hashtags_max: 30,
    adjuntos_max: 10,
    proporciones: Object.freeze({
      publicacion: Object.freeze(['1:1', '4:5', '1.91:1']),
      historia: Object.freeze(['9:16']),
      reel: Object.freeze(['9:16'])
    }),
    duracion_max_s: Object.freeze({ publicacion: 60, historia: 60, reel: 90 }),
    peso_max_mb: Object.freeze({ imagen: 8, video: 100 }),
    // Cuanto de la imagen puede perderse al llevarla a la proporcion admitida.
    // Por debajo de esto, el encuadre ya no ensena lo mismo: se rechaza.
    conservacion_minima: 0.6
  })
});

// ---------------------------------------------------------------------------
// texto: frases y recorte
// ---------------------------------------------------------------------------

/**
 * Parte un texto en frases ENTERAS conservando los separadores, de forma que
 * `frases_de(t).join('') === t` (el texto no se toca: solo se localizan cortes
 * posibles). Un salto de linea tambien cierra frase: en una publicacion, cada
 * linea es una idea.
 *
 * @returns {string[]}
 */
function frases_de(texto) {
  if (typeof texto !== 'string' || texto === '') return [];
  const out = [];
  const n = texto.length;
  let i = 0;
  while (i < n) {
    let fin = -1;
    let j = i;
    while (j < n) {
      const c = texto[j];
      if (c === '.' || c === '!' || c === '?' || c === '\u2026') {
        // Consumir cierres encadenados y comillas de cierre ("...!"», etc.).
        let k = j + 1;
        while (k < n && '.!?\u2026"\')]\u00bb'.includes(texto[k])) k += 1;
        // Solo cierra frase si despues hay espacio o se acaba el texto. Si no,
        // es un punto dentro de una abreviatura o de una URL.
        if (k >= n || /\s/.test(texto[k])) { fin = k; break; }
        j = k;
        continue;
      }
      if (c === '\n') { fin = j + 1; break; }
      j += 1;
    }
    if (fin === -1) fin = n;
    out.push(texto.slice(i, fin));
    i = fin;
  }
  return out;
}

/**
 * Recorta un texto a `maximo` caracteres SIN cambiar el sentido.
 *
 * @param {string} texto
 * @param {number} maximo
 * @returns {{ok:boolean, texto:string, recortado:boolean, motivo?:string,
 *            frases_quitadas:number, caracteres_quitados:number,
 *            que_falta?:object}}
 */
function recortar_texto(texto, maximo) {
  if (typeof texto !== 'string') {
    return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, texto: '', frases_quitadas: 0, caracteres_quitados: 0, que_falta: { campo: 'texto' } };
  }
  const tope = Number(maximo);
  if (!Number.isFinite(tope) || tope <= 0) {
    return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, texto, frases_quitadas: 0, caracteres_quitados: 0, que_falta: { maximo } };
  }
  if (texto.length <= tope) {
    return { ok: true, texto, recortado: false, frases_quitadas: 0, caracteres_quitados: 0 };
  }

  const frases = frases_de(texto);

  // La primera frase es intocable: si ella sola no cabe, no hay recorte posible
  // que respete lo que la pieza dice.
  const primera = frases.length > 0 ? frases[0] : texto;
  if (primera.length > tope) {
    return {
      ok: false,
      motivo: MOTIVOS.TEXTO_NO_CABE_SIN_CAMBIAR_EL_SENTIDO,
      texto: '',
      frases_quitadas: 0,
      caracteres_quitados: 0,
      que_falta: {
        maximo: tope,
        primera_frase: primera.length,
        caracteres_de_mas: primera.length - tope,
        regla: 'la primera frase no se recorta: recortarla cambia lo que la pieza dice'
      }
    };
  }

  // Prefijo mas largo de frases enteras que cabe.
  let corte = 0;
  let acumulado = 0;
  for (const frase of frases) {
    if (acumulado + frase.length > tope) break;
    acumulado += frase.length;
    corte += 1;
  }
  if (corte === 0) corte = 1; // la primera frase ya se comprobo que cabe

  const recortado = texto.slice(0, acumulado).replace(/\s+$/, '');
  if (recortado === '') {
    return { ok: false, motivo: MOTIVOS.SIN_MENSAJE, texto: '', frases_quitadas: 0, caracteres_quitados: 0, que_falta: { campo: 'texto' } };
  }

  return {
    ok: true,
    texto: recortado,
    recortado: recortado !== texto,
    frases_quitadas: frases.length - corte,
    caracteres_quitados: texto.length - recortado.length,
    prefijo: texto.startsWith(recortado)
  };
}

// ---------------------------------------------------------------------------
// adjuntos: proporcion y encuadre
// ---------------------------------------------------------------------------

function razon_de(proporcion) {
  if (!texto_no_vacio(proporcion)) return null;
  const partes = String(proporcion).trim().split(':');
  if (partes.length !== 2) return null;
  const a = Number(partes[0]);
  const b = Number(partes[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  return a / b;
}

/**
 * Proporcion admitida mas cercana en escala logaritmica (la distancia entre 1:1
 * y 4:5 es la misma que entre 4:5 y 16:9, cosa que con la resta no pasa).
 */
function proporcion_mas_cercana(proporcion, admitidas) {
  const r = razon_de(proporcion);
  if (r === null || !Array.isArray(admitidas) || admitidas.length === 0) return null;
  let mejor = null;
  for (const cand of admitidas) {
    const rc = razon_de(cand);
    if (rc === null) continue;
    const d = Math.abs(Math.log(r) - Math.log(rc));
    if (mejor === null || d < mejor.distancia) mejor = { proporcion: cand, distancia: d };
  }
  return mejor;
}

/** Fraccion del encuadre que sobrevive al llevarlo a la proporcion destino. */
function conservacion(proporcion, destino) {
  const r = razon_de(proporcion);
  const t = razon_de(destino);
  if (r === null || t === null) return null;
  return Math.min(r, t) / Math.max(r, t);
}

/**
 * Declara el encuadre de un adjunto: a que proporcion admitida se lleva y
 * cuanto se conserva. No procesa pixels.
 */
function encuadrar(adjunto, destino, reglas) {
  const a = es_objeto(adjunto) ? adjunto : {};
  const admitidas = reglas.proporciones[destino] || [];
  const pedida = texto_no_vacio(a.proporcion) ? String(a.proporcion).trim() : null;
  if (pedida === null) {
    // Sin dato no se inventa una proporcion: se declara que falta y el aparato
    // la mide. Rellenar con "1:1" seria afirmar algo que no se sabe.
    return { ok: true, proporcion_de_salida: null, se_recorta: null, faltan: ['proporcion'] };
  }
  const cercana = proporcion_mas_cercana(pedida, admitidas);
  if (!cercana) {
    return { ok: false, motivo: MOTIVOS.PROPORCION_NO_ADMISIBLE, que_falta: { admitidas: admitidas.slice() } };
  }
  const queda = conservacion(pedida, cercana.proporcion);
  if (queda !== null && queda < reglas.conservacion_minima) {
    return {
      ok: false,
      motivo: MOTIVOS.PROPORCION_NO_ADMISIBLE,
      que_falta: {
        pedida,
        admitidas: admitidas.slice(),
        conservaria: Number(queda.toFixed(2)),
        minimo: reglas.conservacion_minima,
        regla: 'llevarla a la proporcion admitida dejaria fuera lo que la pieza ensena'
      }
    };
  }
  return {
    ok: true,
    proporcion_pedida: pedida,
    proporcion_de_salida: cercana.proporcion,
    se_recorta: pedida !== cercana.proporcion,
    conserva: queda === null ? null : Number(queda.toFixed(2)),
    encuadre: 'centrado',
    ejecuta_el_recorte: 'aparato'
  };
}

// ---------------------------------------------------------------------------
// comprobacion de la pieza
// ---------------------------------------------------------------------------

function reglas_de(plataforma) {
  const clave = texto_no_vacio(plataforma) ? String(plataforma).trim().toLowerCase() : 'instagram';
  return REGLAS[clave] || null;
}

/**
 * ¿A la pieza le falta algo para poder publicarse? Nombra cada hueco.
 * No opina sobre formato: eso es `admitir`.
 *
 * @returns {{ok:boolean, faltan:string[], campos_de_texto:string[], adjuntos:number}}
 */
function comprobar_completitud(pieza) {
  if (!es_objeto(pieza)) {
    return { ok: false, faltan: ['pieza'], campos_de_texto: [], adjuntos: 0 };
  }
  const faltan = [];
  const campos = CAMPOS_DE_TEXTO.filter((c) => pieza[c] !== undefined && pieza[c] !== null);
  const con_texto = campos.filter((c) => texto_no_vacio(pieza[c]));
  const adjuntos = Array.isArray(pieza.adjuntos) ? pieza.adjuntos : [];

  if (con_texto.length === 0 && adjuntos.length === 0) faltan.push('mensaje');

  adjuntos.forEach((a, i) => {
    if (!es_objeto(a)) { faltan.push(`adjuntos[${i}]`); return; }
    if (!texto_no_vacio(a.tipo)) faltan.push(`adjuntos[${i}].tipo`);
    else if (!TIPOS_DE_ADJUNTO.includes(String(a.tipo))) faltan.push(`adjuntos[${i}].tipo`);
    if (!texto_no_vacio(a.referencia) && !texto_no_vacio(a.ruta)) faltan.push(`adjuntos[${i}].referencia`);
  });

  return { ok: faltan.length === 0, faltan, campos_de_texto: con_texto, adjuntos: adjuntos.length };
}

function rechazo(motivo, que_falta, extra) {
  return Object.assign({ ok: false, estado: 'rechazada', motivo, que_falta: que_falta || null }, extra || {});
}

/** Resuelve plataforma, destino y reglas de una pieza. */
function contexto(pieza, opts) {
  const o = es_objeto(opts) ? opts : {};
  const plataforma = texto_no_vacio(o.plataforma)
    ? String(o.plataforma).trim().toLowerCase()
    : (texto_no_vacio(pieza.plataforma) ? String(pieza.plataforma).trim().toLowerCase() : 'instagram');
  const reglas = reglas_de(plataforma);
  if (!reglas) {
    return { ok: false, motivo: MOTIVOS.PLATAFORMA_DESCONOCIDA, que_falta: { plataforma, admitidas: PLATAFORMAS.slice() } };
  }
  const destino = texto_no_vacio(o.destino)
    ? String(o.destino).trim().toLowerCase()
    : (texto_no_vacio(pieza.destino) ? String(pieza.destino).trim().toLowerCase() : 'publicacion');
  if (!DESTINOS.includes(destino)) {
    return { ok: false, motivo: MOTIVOS.DESTINO_DESCONOCIDO, que_falta: { destino, admitidos: DESTINOS.slice() } };
  }
  return { ok: true, plataforma, destino, reglas };
}

// ---------------------------------------------------------------------------
// admitir
// ---------------------------------------------------------------------------

/**
 * Admite o rechaza. NO adapta, NO recorta, NO escribe.
 *
 * @param {object} pieza
 * @param {{plataforma?:string, destino?:string}} [opts]
 * @returns {{ok:boolean, estado:'admitida'|'rechazada', pieza?:object, motivo?:string,
 *            que_falta?:object, faltan?:string[]}}
 */
function admitir(pieza, opts) {
  if (!es_objeto(pieza)) return rechazo(MOTIVOS.ENTRADA_INVALIDA, { pieza: true }, { faltan: ['pieza'] });

  const ctx = contexto(pieza, opts);
  if (!ctx.ok) return rechazo(ctx.motivo, ctx.que_falta);

  const completo = comprobar_completitud(pieza);
  if (!completo.ok) return rechazo(MOTIVOS.SIN_MENSAJE, { faltan: completo.faltan }, { faltan: completo.faltan });

  const reglas = ctx.reglas;

  // ---- texto -------------------------------------------------------------
  for (const campo of completo.campos_de_texto) {
    const largo = String(pieza[campo]).length;
    if (largo > reglas.texto_max) {
      return rechazo(MOTIVOS.TEXTO_NO_CABE, {
        campo,
        caracteres: largo,
        maximo: reglas.texto_max,
        caracteres_de_mas: largo - reglas.texto_max,
        arreglo: 'adaptar (recorta frases enteras por el final)'
      });
    }
  }

  // ---- adjuntos ----------------------------------------------------------
  const adjuntos = Array.isArray(pieza.adjuntos) ? pieza.adjuntos : [];
  if (adjuntos.length > reglas.adjuntos_max) {
    return rechazo(MOTIVOS.ADJUNTOS_DE_MAS, { adjuntos: adjuntos.length, maximo: reglas.adjuntos_max, sobran: adjuntos.length - reglas.adjuntos_max });
  }
  const encuadres = [];
  for (let i = 0; i < adjuntos.length; i += 1) {
    const a = adjuntos[i];
    if (!es_objeto(a)) return rechazo(MOTIVOS.ADJUNTO_INCOMPLETO, { campo: `adjuntos[${i}]` });
    if (!TIPOS_DE_ADJUNTO.includes(String(a.tipo))) {
      return rechazo(MOTIVOS.TIPO_DE_ADJUNTO_NO_ADMITIDO, { campo: `adjuntos[${i}].tipo`, tipo: a.tipo === undefined ? null : a.tipo, admitidos: TIPOS_DE_ADJUNTO.slice() });
    }
    const tope_mb = reglas.peso_max_mb[String(a.tipo)];
    const mb = Number(a.peso_mb);
    if (Number.isFinite(mb) && mb > tope_mb) {
      return rechazo(MOTIVOS.PESA_DE_MAS, { campo: `adjuntos[${i}].peso_mb`, mb, maximo_mb: tope_mb, mb_de_mas: Number((mb - tope_mb).toFixed(2)) });
    }
    const dur = Number(a.duracion_s);
    if (String(a.tipo) === 'video' && Number.isFinite(dur) && dur > reglas.duracion_max_s[ctx.destino]) {
      return rechazo(MOTIVOS.DURACION_DE_MAS, {
        campo: `adjuntos[${i}].duracion_s`,
        segundos: dur,
        maximo_s: reglas.duracion_max_s[ctx.destino],
        segundos_de_mas: Number((dur - reglas.duracion_max_s[ctx.destino]).toFixed(1))
      });
    }
    const enc = encuadrar(a, ctx.destino, reglas);
    if (!enc.ok) return rechazo(enc.motivo, Object.assign({ campo: `adjuntos[${i}]` }, enc.que_falta));
    encuadres.push(Object.assign({ indice: i }, enc));
  }

  return {
    ok: true,
    estado: 'admitida',
    plataforma: ctx.plataforma,
    destino: ctx.destino,
    pieza: clonar(pieza),
    encuadres,
    texto: { campos: completo.campos_de_texto, maximo: reglas.texto_max }
  };
}

// ---------------------------------------------------------------------------
// adaptar
// ---------------------------------------------------------------------------

/**
 * Prepara la pieza: admite y ADAPTA lo que se puede adaptar sin cambiar lo que
 * dice (el texto se recorta por frases enteras; el encuadre se declara). Lo que
 * no se puede adaptar sin cambiar la pieza se rechaza con lo que falta.
 *
 * @returns {{ok:boolean, estado:'preparada'|'rechazada', pieza?:object,
 *            recorte?:object, motivo?:string, que_falta?:object}}
 */
function adaptar(pieza, opts) {
  if (!es_objeto(pieza)) return rechazo(MOTIVOS.ENTRADA_INVALIDA, { pieza: true }, { faltan: ['pieza'] });

  const ctx = contexto(pieza, opts);
  if (!ctx.ok) return rechazo(ctx.motivo, ctx.que_falta);

  const completo = comprobar_completitud(pieza);
  if (!completo.ok) return rechazo(MOTIVOS.SIN_MENSAJE, { faltan: completo.faltan }, { faltan: completo.faltan });

  const reglas = ctx.reglas;
  const salida = clonar(pieza);
  const recortes = [];
  const encuadres = [];

  // ---- texto: recorta frases enteras, nunca el sentido -------------------
  for (const campo of completo.campos_de_texto) {
    const original = String(pieza[campo]);
    const r = recortar_texto(original, reglas.texto_max);
    if (!r.ok) {
      return rechazo(r.motivo, Object.assign({ campo }, r.que_falta), { recorte: { campo, original } });
    }
    salida[campo] = r.texto;
    if (r.recortado) {
      recortes.push({
        campo,
        caracteres: original.length,
        caracteres_finales: r.texto.length,
        caracteres_quitados: r.caracteres_quitados,
        frases_quitadas: r.frases_quitadas,
        texto_original: original
      });
    }
  }

  // ---- adjuntos: mismo limite que en `admitir`, mas el encuadre ----------
  const adjuntos = Array.isArray(salida.adjuntos) ? salida.adjuntos : [];
  if (adjuntos.length > reglas.adjuntos_max) {
    return rechazo(MOTIVOS.ADJUNTOS_DE_MAS, { adjuntos: adjuntos.length, maximo: reglas.adjuntos_max, sobran: adjuntos.length - reglas.adjuntos_max });
  }
  for (let i = 0; i < adjuntos.length; i += 1) {
    const a = adjuntos[i];
    if (!es_objeto(a)) return rechazo(MOTIVOS.ADJUNTO_INCOMPLETO, { campo: `adjuntos[${i}]` });
    if (!TIPOS_DE_ADJUNTO.includes(String(a.tipo))) {
      return rechazo(MOTIVOS.TIPO_DE_ADJUNTO_NO_ADMITIDO, { campo: `adjuntos[${i}].tipo`, tipo: a.tipo === undefined ? null : a.tipo, admitidos: TIPOS_DE_ADJUNTO.slice() });
    }
    const tope_mb = reglas.peso_max_mb[String(a.tipo)];
    const mb = Number(a.peso_mb);
    if (Number.isFinite(mb) && mb > tope_mb) {
      return rechazo(MOTIVOS.PESA_DE_MAS, { campo: `adjuntos[${i}].peso_mb`, mb, maximo_mb: tope_mb, mb_de_mas: Number((mb - tope_mb).toFixed(2)) });
    }
    const dur = Number(a.duracion_s);
    if (String(a.tipo) === 'video' && Number.isFinite(dur) && dur > reglas.duracion_max_s[ctx.destino]) {
      return rechazo(MOTIVOS.DURACION_DE_MAS, {
        campo: `adjuntos[${i}].duracion_s`,
        segundos: dur,
        maximo_s: reglas.duracion_max_s[ctx.destino],
        segundos_de_mas: Number((dur - reglas.duracion_max_s[ctx.destino]).toFixed(1))
      });
    }
    const enc = encuadrar(a, ctx.destino, reglas);
    if (!enc.ok) return rechazo(enc.motivo, Object.assign({ campo: `adjuntos[${i}]` }, enc.que_falta));
    encuadres.push(Object.assign({ indice: i }, enc));
  }

  // La pieza declara su preparacion: el que publica no tiene que adivinar que
  // se recorto ni a que proporcion se va a encuadrar.
  salida.preparacion = {
    plataforma: ctx.plataforma,
    destino: ctx.destino,
    recortada: recortes.length > 0,
    recortes,
    encuadres,
    texto_max: reglas.texto_max
  };

  return {
    ok: true,
    estado: 'preparada',
    plataforma: ctx.plataforma,
    destino: ctx.destino,
    pieza: salida,
    recorte: {
      hubo: recortes.length > 0,
      campos: recortes.map((r) => r.campo),
      caracteres_quitados: recortes.reduce((s, r) => s + r.caracteres_quitados, 0),
      frases_quitadas: recortes.reduce((s, r) => s + r.frases_quitadas, 0),
      detalle: recortes
    },
    encuadres
  };
}

function describir() {
  return {
    plataformas: PLATAFORMAS.slice(),
    destinos: DESTINOS.slice(),
    campos_de_texto: CAMPOS_DE_TEXTO.slice(),
    reglas: clonar(REGLAS),
    regla_del_recorte: 'se cortan frases enteras por el final; el resultado es un prefijo del original; la primera frase no se toca'
  };
}

module.exports = {
  PLATAFORMAS,
  DESTINOS,
  TIPOS_DE_ADJUNTO,
  CAMPOS_DE_TEXTO,
  MOTIVOS,
  REGLAS,
  frases_de,
  recortar_texto,
  razon_de,
  proporcion_mas_cercana,
  conservacion,
  encuadrar,
  reglas_de,
  comprobar_completitud,
  admitir,
  adaptar,
  describir
};
