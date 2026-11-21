'use strict';

/**
 * borrador — N3 · RedactorDeBorrador · MICRO-AGENTE.
 *
 * Escribe el borrador de una respuesta con la VOZ de la ficha (E1). No escribe
 * "un mensaje": escribe el mensaje de ESTA cuenta, con su tono, su vocabulario
 * y sus vetos.
 *
 * LA REGLA DEL BLOQUE, EN DOS MITADES QUE SE VEN EN EL CODIGO:
 *   **un borrador NUNCA envia y NUNCA persiste.**
 *
 *   - **No envia**: este fichero no importa el puerto de envio, ni la mano, ni
 *     el publicador, ni `http`, ni `net`. No tiene con que enviar. El resultado
 *     lleva `se_envia: false`, `envio: null` y `destino: 'revision_humana'`; el
 *     texto sale como valor de retorno, en memoria, y ahi se acaba. Es una
 *     propiedad comprobable leyendo los `require`, no una promesa del
 *     comentario.
 *   - **No persiste**: no importa `fs`, ni `path`, ni ningun almacen. Un
 *     borrador guardado es un borrador que alguien puede enviar por error tres
 *     dias despues; si el dueno lo quiere, que lo copie. Lo que no existe no se
 *     envia solo.
 *
 * SIN VOZ NO HAY BORRADOR. Si la ficha no trae voz declarada por el proyecto
 * (o le falta la autorizacion), esta pieza NO redacta: devuelve `sin_voz`,
 * `modo: 'lectura'` y `texto: null`. La cuenta sigue en modo lectura, que es
 * exactamente lo que dice E1. Rellenar el hueco con una plantilla del sistema
 * seria inventar la voz del proyecto, y una voz inventada se nota en el tercer
 * mensaje.
 *
 * SI LA VOZ PROHIBE ALGO, SE RESPETA. `lo_que_nunca_dice` y `limites_de_tema`
 * no son sugerencias de estilo: son vetos. El borrador se revisa contra ellos
 * ANTES de devolverse; si ninguna variante pasa, no se devuelve un texto
 * "casi": se devuelve el rechazo con la frase que incumple.
 *
 * MICRO-AGENTE SIN LLM OBLIGATORIO. Sin `opciones.juicio`, redacta con una
 * tabla de plantillas por clase y tono (determinista). Con juicio, el texto
 * propuesto pasa por la MISMA revision; si la incumple o lanza, se usa la
 * tabla. Nunca falla por no haber LLM, y nunca devuelve un texto sin revisar.
 *
 * LO QUE NO HACE: no decide si se contesta (N5), no clasifica (N2), no firma la
 * voz (E1) y no guarda nada. Redacta.
 */

const { es_objeto, texto_no_vacio } = require('../core/formas');

const NO_ENVIA = true;
const NO_PERSISTE = true;

const TONOS = Object.freeze(['cercano', 'profesional', 'directo', 'divertido']);

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  SIN_VOZ: 'sin_voz',
  VOZ_INVALIDA: 'voz_invalida',
  VOZ_NO_DECLARADA_POR_EL_PROYECTO: 'voz_no_declarada_por_el_proyecto',
  SIN_AUTORIZACION: 'sin_autorizacion',
  SIN_MENSAJE: 'sin_mensaje',
  MENSAJE_ININTELIGIBLE: 'mensaje_ininteligible',
  SPAM_NO_SE_RESPONDE: 'spam_no_se_contesta',
  DICE_LO_QUE_NUNCA_DICE: 'dice_lo_que_nunca_dice',
  TEMA_FUERA_DE_LIMITE: 'tema_fuera_de_limite',
  TEXTO_DEMASIADO_LARGO: 'texto_demasiado_largo',
  TEXTO_VACIO: 'texto_vacio',
  SIN_REDACCION: 'sin_redaccion',
  JUICIO_DESCARTADO: 'juicio_descartado_por_la_voz',
  TONO_NO_RECONOCIDO: 'tono_no_reconocido'
});

const LARGO_MAX = 600;

// ---------------------------------------------------------------------------
// la voz (E1) y el tono
// ---------------------------------------------------------------------------

function normalizar(texto) {
  if (typeof texto !== 'string') return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resuelve la voz. No la completa: si falta, se dice cual falta.
 * @returns {{ok:true, voz:object}|{ok:false, motivo:string, faltan?:string[]}}
 */
function resolver_voz(entrada) {
  const voz = es_objeto(entrada) ? (entrada.voz || (es_objeto(entrada.ficha) ? entrada.ficha.voz : null)) : null;
  if (!es_objeto(voz)) return { ok: false, motivo: MOTIVOS.SIN_VOZ, faltan: ['voz'] };
  if (!texto_no_vacio(voz.tono)) return { ok: false, motivo: MOTIVOS.SIN_VOZ, faltan: ['voz.tono'] };
  if (voz.declarada_por === undefined || voz.declarada_por === null || voz.declarada_por === '') {
    return { ok: false, motivo: MOTIVOS.SIN_VOZ, faltan: ['voz.declarada_por'] };
  }
  if (voz.declarada_por !== 'proyecto') {
    return { ok: false, motivo: MOTIVOS.VOZ_NO_DECLARADA_POR_EL_PROYECTO, faltan: [], invalidos: ['voz.declarada_por'] };
  }
  if (!texto_no_vacio(voz.autorizacion_id)) return { ok: false, motivo: MOTIVOS.SIN_AUTORIZACION, faltan: ['voz.autorizacion_id'] };

  const lista = (v) => (Array.isArray(v) ? v.filter(texto_no_vacio).map((x) => String(x).trim()) : []);
  return {
    ok: true,
    voz: {
      tono: String(voz.tono).trim(),
      vocabulario: lista(voz.vocabulario),
      lo_que_nunca_dice: lista(voz.lo_que_nunca_dice),
      limites_de_tema: lista(voz.limites_de_tema),
      declarada_por: 'proyecto',
      autorizacion_id: String(voz.autorizacion_id).trim()
    }
  };
}

/** Traduce el tono declarado a uno de los cuatro registros que hay plantilla. */
function tono_de(voz) {
  const t = normalizar(voz.tono);
  if (/cercan|calid|amable|cercania/.test(t)) return { tono: 'cercano', reconocido: true };
  if (/profesional|formal|serio|institucional/.test(t)) return { tono: 'profesional', reconocido: true };
  if (/direct|breve|concis|sin rodeos/.test(t)) return { tono: 'directo', reconocido: true };
  if (/divertid|alegre|desenfadad|humor|jugueton/.test(t)) return { tono: 'divertido', reconocido: true };
  return { tono: 'profesional', reconocido: false };
}

// ---------------------------------------------------------------------------
// plantillas deterministas
// ---------------------------------------------------------------------------

const APERTURAS = Object.freeze({
  cercano: Object.freeze(['Hola, ', 'Buenas, ']),
  profesional: Object.freeze(['Buenos dias: ', 'Hola: ']),
  directo: Object.freeze(['Hola. ', 'Hola: ']),
  divertido: Object.freeze(['¡Hola! ', 'Hola, '])
});

const CIERRES = Object.freeze({
  cercano: Object.freeze(['', ' Un saludo.']),
  profesional: Object.freeze(['', ' Gracias por su tiempo.']),
  directo: Object.freeze(['', ' Gracias.']),
  divertido: Object.freeze(['', ' ¡Gracias!'])
});

/**
 * Cuerpos por clase y tono. Reglas de redaccion que se cumplen aqui:
 *   - **No se afirma ningun hecho del negocio**: ni precios, ni plazos, ni
 *     stock, ni horarios. Un borrador que inventa un precio es peor que no
 *     tener borrador.
 *   - **No se promete una compensacion** ni se admite una culpa juridica.
 *   - **Con una queja no se hace humor**: el tono `divertido` cae a `cercano`.
 */
const CUERPO = Object.freeze({
  consulta: Object.freeze({
    cercano: Object.freeze([
      'gracias por escribir. Cuentame un poco mas y lo miramos juntos.',
      'gracias por tu mensaje. Dime un poco mas y te respondo con calma.'
    ]),
    profesional: Object.freeze([
      'gracias por su consulta. Si nos amplia la informacion, podremos responderle con precision.',
      'gracias por escribirnos. Con un poco mas de detalle podremos darle una respuesta concreta.'
    ]),
    directo: Object.freeze([
      'dime mas detalle y te contesto.',
      'cuentame un poco mas y lo vemos.'
    ]),
    divertido: Object.freeze([
      'gracias por asomarte. Cuentame un poco mas y le damos una vuelta.',
      'gracias por escribir. Dime mas y lo miramos sin prisa.'
    ])
  }),
  pedido: Object.freeze({
    cercano: Object.freeze([
      'gracias por tu interes. Cuentame que necesitas y lo vemos con calma.',
      'gracias por escribirnos. Dime que tienes en mente y te cuento como lo miramos.'
    ]),
    profesional: Object.freeze([
      'gracias por su interes. Indiquenos que necesita y le daremos los detalles.',
      'gracias por contactar. Con los datos de su solicitud podremos atenderle.'
    ]),
    directo: Object.freeze([
      'dime que necesitas y lo miramos.',
      'cuentame que buscas y te digo.'
    ]),
    divertido: Object.freeze([
      'gracias por el interes. Cuentame que tienes en mente y lo miramos.',
      'gracias por escribir. Dime que buscas y le damos forma.'
    ])
  }),
  queja: Object.freeze({
    cercano: Object.freeze([
      'siento mucho lo que cuentas. Lo leo con calma y lo paso a la persona que puede mirarlo; te cuento en cuanto sepa algo.',
      'vaya, siento que haya pasado esto. Lo traslado a una persona del equipo para revisarlo y te digo algo.'
    ]),
    profesional: Object.freeze([
      'lamento lo ocurrido. Traslado su mensaje a una persona del equipo para revisarlo y le responderemos.',
      'siento la situacion. Su mensaje queda con una persona responsable, que lo revisara y le contestara.'
    ]),
    directo: Object.freeze([
      'lo siento. Lo paso a una persona del equipo y te digo algo en cuanto lo mire.',
      'siento lo que cuentas. Lo revisa una persona y te contestamos.'
    ]),
    divertido: Object.freeze([
      'siento mucho lo que cuentas. Lo paso a la persona que puede mirarlo y te cuento en cuanto sepa algo.',
      'vaya, siento que haya pasado esto. Lo revisa una persona del equipo y te decimos algo.'
    ])
  }),
  agradecimiento: Object.freeze({
    cercano: Object.freeze([
      'gracias a ti por escribir. Aqui estamos para lo que necesites.',
      'gracias por el mensaje. Cualquier cosa, nos dices.'
    ]),
    profesional: Object.freeze([
      'gracias por su mensaje. Quedamos a su disposicion.',
      'gracias por escribirnos. Estamos a su disposicion para lo que necesite.'
    ]),
    directo: Object.freeze([
      'gracias a ti. Aqui estamos.',
      'gracias por escribir. Cualquier cosa, aqui estamos.'
    ]),
    divertido: Object.freeze([
      'gracias a ti. Aqui seguimos para lo que haga falta.',
      'gracias por el mensaje. Cualquier cosa, nos dices.'
    ])
  })
});

const CLASES_CON_BORRADOR = Object.freeze(['consulta', 'pedido', 'queja', 'agradecimiento']);

// ---------------------------------------------------------------------------
// revision contra la voz
// ---------------------------------------------------------------------------

/**
 * Revisa un texto contra la voz. Devuelve TODAS las violaciones, no la primera:
 * corregir de una en una lo que un veto detecta de golpe es trabajo perdido.
 *
 * @returns {{ok:boolean, violaciones:Array<{motivo:string, frase?:string, campo?:string}>}}
 */
function revisar(texto, voz, opciones) {
  const o = es_objeto(opciones) ? opciones : {};
  const largo_max = Number.isFinite(o.largo_max) ? Number(o.largo_max) : LARGO_MAX;
  const violaciones = [];

  if (!texto_no_vacio(texto)) {
    return { ok: false, violaciones: [{ motivo: MOTIVOS.TEXTO_VACIO }] };
  }
  if (String(texto).length > largo_max) {
    violaciones.push({ motivo: MOTIVOS.TEXTO_DEMASIADO_LARGO, campo: 'texto', largo: String(texto).length, largo_max });
  }

  const v = es_objeto(voz) ? voz : {};
  const n = normalizar(texto);
  const acotado = ` ${n} `;

  for (const frase of Array.isArray(v.lo_que_nunca_dice) ? v.lo_que_nunca_dice : []) {
    const f = normalizar(frase);
    if (f && acotado.includes(` ${f} `)) {
      violaciones.push({ motivo: MOTIVOS.DICE_LO_QUE_NUNCA_DICE, frase: String(frase), campo: 'lo_que_nunca_dice' });
    }
  }

  for (const tema of Array.isArray(v.limites_de_tema) ? v.limites_de_tema : []) {
    const t = normalizar(tema);
    if (t && acotado.includes(` ${t} `)) {
      violaciones.push({ motivo: MOTIVOS.TEMA_FUERA_DE_LIMITE, frase: String(tema), campo: 'limites_de_tema' });
    }
  }

  return { ok: violaciones.length === 0, violaciones };
}

// ---------------------------------------------------------------------------
// la pieza
// ---------------------------------------------------------------------------

function leer_peticion(peticion) {
  if (!es_objeto(peticion)) return null;
  const mensaje = es_objeto(peticion.mensaje) ? peticion.mensaje : {};
  const texto = typeof mensaje.texto === 'string' ? mensaje.texto
    : (typeof peticion.texto === 'string' ? peticion.texto : '');
  const clase = texto_no_vacio(peticion.clase) ? String(peticion.clase).trim() : null;
  return { texto, clase, remitente: texto_no_vacio(mensaje.remitente) ? String(mensaje.remitente).trim() : null };
}

function sin_redaccion(motivo, extra) {
  return Object.assign({
    ok: false,
    motivo,
    redacta: false,
    texto: null,
    se_envia: false,
    se_persiste: false,
    envio: null,
    persistencia: null,
    no_envia: NO_ENVIA,
    no_persiste: NO_PERSISTE
  }, extra || {});
}

function componer(tono, cuerpo) {
  const aperturas = APERTURAS[tono] || APERTURAS.profesional;
  const cierres = CIERRES[tono] || CIERRES.profesional;
  const variantes = [];
  for (const cuerpo_ of cuerpo) {
    for (const apertura of aperturas) {
      for (const cierre of cierres) {
        variantes.push(`${apertura}${cuerpo_}${cierre}`);
      }
    }
  }
  return variantes;
}

/**
 * Redacta un borrador. No envia, no guarda, no promete nada del negocio.
 *
 * @param {{mensaje?:object, texto?:string, ficha?:object, voz?:object, clase?:string}} peticion
 * @param {{juicio?:Function, largo_max?:number}} [opciones]
 * @returns {object}
 */
function redactar(peticion, opciones) {
  const o = es_objeto(opciones) ? opciones : {};
  const p = leer_peticion(peticion);
  if (!p) return sin_redaccion(MOTIVOS.ENTRADA_INVALIDA, { faltan: ['peticion'] });

  // ---- la voz primero: sin voz no hay nada que escribir ------------------
  const v = resolver_voz(peticion);
  if (!v.ok) {
    return sin_redaccion(v.motivo, {
      modo: 'lectura',
      faltan: v.faltan || [],
      invalidos: v.invalidos || [],
      nota: 'Sin voz declarada por el proyecto, la cuenta solo lee.'
    });
  }
  const voz = v.voz;

  // ---- lo que no se redacta ni con voz ----------------------------------
  if (p.clase === 'ininteligible') {
    return sin_redaccion(MOTIVOS.MENSAJE_ININTELIGIBLE, {
      requiere_persona: true,
      escala_a: 'persona',
      nota: 'No se puede redactar una respuesta a algo que no se ha entendido sin inventarlo.'
    });
  }
  if (p.clase === 'spam') {
    return sin_redaccion(MOTIVOS.SPAM_NO_SE_RESPONDE, {
      nota: 'El spam no se contesta; si acaso, se silencia (N5).'
    });
  }
  if (!texto_no_vacio(p.texto)) {
    return sin_redaccion(MOTIVOS.SIN_MENSAJE, { faltan: ['mensaje.texto'] });
  }

  const clase = CLASES_CON_BORRADOR.includes(p.clase) ? p.clase : 'consulta';
  const avisos = [];
  if (!p.clase) avisos.push('clase_no_declarada');

  const t = tono_de(voz);
  if (!t.reconocido) avisos.push(MOTIVOS.TONO_NO_RECONOCIDO);
  let tono = t.tono;
  if (clase === 'queja' && tono === 'divertido') {
    tono = 'cercano';
    avisos.push('queja_sin_humor');
  }

  // ---- juicio opcional: se usa solo si pasa la revision de la voz -------
  if (typeof o.juicio === 'function') {
    let propuesto = null;
    try {
      const r = o.juicio({ clase, texto: p.texto, remitente: p.remitente, voz, tono });
      if (r && typeof r.then === 'function') propuesto = null;
      else if (typeof r === 'string') propuesto = r;
      else if (es_objeto(r) && typeof r.texto === 'string') propuesto = r.texto;
    } catch (err) {
      propuesto = null;
    }
    if (texto_no_vacio(propuesto)) {
      const rev = revisar(propuesto, voz, o);
      if (rev.ok) {
        return {
          ok: true,
          texto: String(propuesto),
          clase,
          tono_aplicado: tono,
          via: 'juicio',
          variante: null,
          avisos,
          revisado: true,
          requiere_revision: true,
          destino: 'revision_humana',
          longitud: String(propuesto).length,
          se_envia: false,
          se_persiste: false,
          envio: null,
          persistencia: null,
          no_envia: NO_ENVIA,
          no_persiste: NO_PERSISTE
        };
      }
      avisos.push(MOTIVOS.JUICIO_DESCARTADO);
    } else {
      avisos.push(MOTIVOS.JUICIO_DESCARTADO);
    }
  }

  // ---- tabla determinista ----------------------------------------------
  const cuerpo = (CUERPO[clase] && CUERPO[clase][tono]) || CUERPO.consulta[tono] || CUERPO.consulta.profesional;
  const variantes = componer(tono, cuerpo);

  let ultima = null;
  for (let i = 0; i < variantes.length; i += 1) {
    const texto = variantes[i];
    const rev = revisar(texto, voz, o);
    if (rev.ok) {
      return {
        ok: true,
        texto,
        clase,
        tono_aplicado: tono,
        via: 'tabla',
        variante: i,
        avisos,
        revisado: true,
        requiere_revision: true,
        destino: 'revision_humana',
        longitud: texto.length,
        se_envia: false,
        se_persiste: false,
        envio: null,
        persistencia: null,
        no_envia: NO_ENVIA,
        no_persiste: NO_PERSISTE
      };
    }
    ultima = rev;
  }

  // Ninguna variante respeta la voz: no se devuelve un "casi".
  return sin_redaccion(MOTIVOS.SIN_REDACCION, {
    detalle: MOTIVOS.DICE_LO_QUE_NUNCA_DICE,
    violaciones: (ultima && ultima.violaciones) || [],
    tono_aplicado: tono,
    clase,
    nota: 'La voz veta todas las variantes: se prefiere no redactar a redactar contra la ficha.'
  });
}

module.exports = {
  NO_ENVIA,
  NO_PERSISTE,
  TONOS,
  MOTIVOS,
  LARGO_MAX,
  resolver_voz,
  tono_de,
  revisar,
  redactar
};

module.exports.RedactorDeBorrador = Object.freeze({
  redactar,
  revisar,
  NO_ENVIA,
  NO_PERSISTE,
  MOTIVOS
});
