'use strict';

/**
 * atribucion — E2 · SelloDeAtribucion · REFLEJO.
 *
 * Lo publicado lleva a quien pertenece. Toda pieza y toda respuesta se atribuyen
 * al PROYECTO dueno de la cuenta, nunca al puente. El puente no tiene firma: si
 * algo se atribuye a si mismo, deja de ser un puente y se convierte en un
 * proyecto que habla por los demas.
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, E2):
 *   - **Una pieza huerfana NO sale.** No es una advertencia: `verificar` contesta
 *     `huerfana` y quien publica tiene que parar. Huerfana = sin sello (P1), sin
 *     atribucion, con atribucion incoherente con el sello, o atribuida al puente.
 *   - **El puente no firma.** `sellar` exige un dueno con proyecto; `firmar`
 *     siempre rechaza. No hay ninguna rama que ponga el nombre del puente: una
 *     atribucion al puente es un fallo nombrado (`firma_del_puente`).
 *   - **La atribucion no se reescribe.** Sellar dos veces con el mismo dueno es
 *     idempotente (el bus reintenta); con otro dueno es `atribucion_ya_fijada`.
 *     Corregirla despues de publicar es retirar y volver a publicar: otra accion,
 *     que pasa por Q6.
 *   - **El sello manda.** La atribucion tiene que coincidir con el proyecto del
 *     sello de la pieza: atribuir a un proyecto una pieza sellada por otro es
 *     exactamente la fuga de ambito que P1/P2 prohiben.
 *
 * Puro: sin IO, sin reloj, sin red, sin estado global. El `momento` de la
 * atribucion es el del sello de la pieza, que lo trajo quien invoco (P1).
 */

const { es_objeto, texto_no_vacio, clonar, crear_sello_de_cuenta } = require('./formas');
const { comprobar: comprobar_sello } = require('./sello');

const CODIGOS = Object.freeze({
  SIN_PIEZA: 'sin_pieza',
  SIN_CUENTA: 'sin_cuenta',
  CUENTA_SIN_DUENO: 'cuenta_sin_dueno',
  PIEZA_HUERFANA: 'pieza_huerfana',
  SIN_ATRIBUCION: 'sin_atribucion',
  PROYECTO_AJENO: 'proyecto_ajeno',
  FIRMA_DEL_PUENTE: 'firma_del_puente',
  EL_PUENTE_NO_FIRMA: 'el_puente_no_firma',
  ATRIBUCION_YA_FIJADA: 'atribucion_ya_fijada',
  ATRIBUCION_INCOHERENTE: 'atribucion_incoherente'
});

/**
 * Nombres con los que el puente se firmaria a si mismo. Lista CERRADA: no es una
 * heuristica, es el vocabulario del sistema. `enki` esta aqui porque el cerebro
 * tampoco es dueno de una cuenta de un proyecto.
 */
const NOMBRES_DEL_PUENTE = Object.freeze([
  'puente',
  'bridge',
  'instagram-bridge',
  'instagram_bridge',
  'sistema',
  'enki'
]);

const AUTOR = 'proyecto';

function es_nombre_del_puente(valor) {
  if (typeof valor !== 'string') return false;
  return NOMBRES_DEL_PUENTE.includes(valor.trim().toLowerCase());
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

/** Atribucion ya puesta en la pieza (o null). */
function atribucion_de(pieza) {
  return es_objeto(pieza) && es_objeto(pieza.atribucion) ? pieza.atribucion : null;
}

/**
 * Dueno de una pieza: el de su atribucion, o el de su sello. Devuelve null si no
 * hay forma de saberlo (`motivo` dice por que).
 */
function dueno_de(pieza) {
  if (!es_objeto(pieza)) return { ok: false, proyecto: null, motivo: CODIGOS.SIN_PIEZA };
  const a = atribucion_de(pieza);
  if (a && texto_no_vacio(a.proyecto)) return { ok: true, proyecto: String(a.proyecto).trim(), fuente: 'atribucion' };
  const c = comprobar_sello(pieza);
  if (c.ok && texto_no_vacio(c.sello.proyecto)) return { ok: true, proyecto: String(c.sello.proyecto).trim(), fuente: 'sello' };
  return { ok: false, proyecto: null, motivo: c.ok ? CODIGOS.SIN_ATRIBUCION : (c.motivo || CODIGOS.PIEZA_HUERFANA) };
}

/**
 * ¿Esta pieza se puede publicar? `atribuida` exige sello (P1) + atribucion
 * coherente con el sello y con un proyecto real. Todo lo demas es `huerfana`,
 * con el motivo nombrado: sin sello, sin atribucion, atribucion de otro proyecto
 * o firma del puente.
 *
 * @param {object} pieza
 * @returns {{estado:string, ok:boolean, motivo?:string, proyecto?:string|null, sello?:object, atribucion?:object|null}}
 */
function verificar(pieza) {
  if (!es_objeto(pieza)) {
    return { estado: 'huerfana', ok: false, motivo: CODIGOS.SIN_PIEZA, proyecto: null, faltan: ['pieza'] };
  }

  const c = comprobar_sello(pieza);
  if (!c.ok) {
    return {
      estado: 'huerfana',
      ok: false,
      motivo: CODIGOS.PIEZA_HUERFANA,
      causa: c.motivo || 'sin_sello',
      proyecto: null,
      faltan: c.faltan || [],
      invalidos: c.invalidos || []
    };
  }

  const proyecto_sello = String(c.sello.proyecto).trim();
  if (es_nombre_del_puente(proyecto_sello)) {
    return { estado: 'huerfana', ok: false, motivo: CODIGOS.FIRMA_DEL_PUENTE, proyecto: proyecto_sello, sello: c.sello };
  }

  // Un autor declarado en la pieza tampoco puede ser el puente.
  if (pieza.autor !== undefined && es_nombre_del_puente(pieza.autor)) {
    return { estado: 'huerfana', ok: false, motivo: CODIGOS.FIRMA_DEL_PUENTE, proyecto: proyecto_sello, autor: pieza.autor, sello: c.sello };
  }

  const a = atribucion_de(pieza);
  if (!a) {
    return {
      estado: 'huerfana',
      ok: false,
      motivo: CODIGOS.SIN_ATRIBUCION,
      proyecto: proyecto_sello,
      sello: c.sello,
      pista: 'una pieza sellada pero sin atribucion no ha pasado por E2: se sella antes de salir'
    };
  }
  if (!texto_no_vacio(a.proyecto)) {
    return { estado: 'huerfana', ok: false, motivo: CODIGOS.SIN_ATRIBUCION, proyecto: proyecto_sello, sello: c.sello };
  }
  if (es_nombre_del_puente(a.proyecto)) {
    return { estado: 'huerfana', ok: false, motivo: CODIGOS.FIRMA_DEL_PUENTE, proyecto: String(a.proyecto).trim(), sello: c.sello, atribucion: a };
  }
  if (String(a.proyecto).trim() !== proyecto_sello) {
    return {
      estado: 'huerfana',
      ok: false,
      motivo: CODIGOS.PROYECTO_AJENO,
      proyecto: proyecto_sello,
      proyecto_atribuido: String(a.proyecto).trim(),
      sello: c.sello,
      atribucion: a
    };
  }
  if (a.firmado_por_el_puente === true || (a.autor !== undefined && es_nombre_del_puente(a.autor))) {
    return { estado: 'huerfana', ok: false, motivo: CODIGOS.FIRMA_DEL_PUENTE, proyecto: proyecto_sello, sello: c.sello, atribucion: a };
  }

  return {
    estado: 'atribuida',
    ok: true,
    proyecto: proyecto_sello,
    sello: c.sello,
    atribucion: a,
    autor: a.autor || AUTOR
  };
}

function esta_atribuida(pieza) {
  return verificar(pieza).ok;
}

/**
 * Pone la atribucion del proyecto dueno de la cuenta sobre la pieza.
 *
 * @param {object} pieza pieza ya sellada (P1)
 * @param {{proyecto:string, cuenta:string, plataforma?:string}} cuenta
 * @returns {{ok:boolean, pieza?:object, atribucion?:object, motivo?:string, ...}}
 */
function sellar(pieza, cuenta) {
  if (!es_objeto(pieza)) return fallo(CODIGOS.SIN_PIEZA, ['pieza']);
  if (!es_objeto(cuenta)) return fallo(CODIGOS.SIN_CUENTA, ['cuenta']);

  const proyecto = texto_no_vacio(cuenta.proyecto) ? String(cuenta.proyecto).trim() : '';
  const handle = texto_no_vacio(cuenta.cuenta) ? String(cuenta.cuenta).trim().replace(/^@/, '').toLowerCase() : '';

  // Sin dueno no hay atribucion posible: el puente no se atribuye nada.
  if (!proyecto) {
    return fallo(CODIGOS.CUENTA_SIN_DUENO, ['cuenta.proyecto'], [], {
      pista: 'una cuenta sin proyecto dueno no puede atribuir: eso es un fallo de alta'
    });
  }
  if (es_nombre_del_puente(proyecto)) {
    return fallo(CODIGOS.FIRMA_DEL_PUENTE, [], ['cuenta.proyecto'], {
      proyecto,
      pista: 'el puente no firma: lo publicado se atribuye al proyecto dueno de la cuenta'
    });
  }
  if (!handle) return fallo(CODIGOS.SIN_CUENTA, ['cuenta.cuenta']);

  const sello_cuenta = crear_sello_de_cuenta({ proyecto, cuenta: handle, plataforma: cuenta.plataforma });
  if (!sello_cuenta.ok) {
    return fallo(CODIGOS.SIN_CUENTA, sello_cuenta.faltan, sello_cuenta.invalidos, { proyecto });
  }

  const c = comprobar_sello(pieza);
  if (!c.ok) {
    return fallo(CODIGOS.PIEZA_HUERFANA, c.faltan || ['sello'], c.invalidos || [], {
      causa: c.motivo || 'sin_sello',
      pista: 'sin sello de proyecto no se sabe de quien es la pieza, y una pieza huerfana no sale'
    });
  }

  const proyecto_sello = String(c.sello.proyecto).trim();
  if (es_nombre_del_puente(proyecto_sello)) {
    return fallo(CODIGOS.FIRMA_DEL_PUENTE, [], ['sello.proyecto'], { proyecto: proyecto_sello });
  }
  if (proyecto_sello !== proyecto) {
    return fallo(CODIGOS.PROYECTO_AJENO, [], ['cuenta.proyecto'], {
      proyecto,
      proyecto_del_sello: proyecto_sello,
      pista: 'una pieza sellada por un proyecto no se atribuye a otro'
    });
  }
  if (pieza.autor !== undefined && es_nombre_del_puente(pieza.autor)) {
    return fallo(CODIGOS.FIRMA_DEL_PUENTE, [], ['autor'], { autor: pieza.autor });
  }

  const previa = atribucion_de(pieza);
  if (previa) {
    if (es_nombre_del_puente(previa.proyecto)) {
      return fallo(CODIGOS.FIRMA_DEL_PUENTE, [], ['atribucion.proyecto'], { proyecto: previa.proyecto });
    }
    const mismo_dueno =
      String(previa.proyecto).trim() === proyecto &&
      String(previa.cuenta || '').trim().replace(/^@/, '').toLowerCase() === handle;
    if (mismo_dueno) {
      return { ok: true, pieza, atribucion: previa, sello: c.sello, idempotente: true };
    }
    return fallo(CODIGOS.ATRIBUCION_YA_FIJADA, [], [], {
      atribucion_existente: clonar(previa),
      pista: 'la atribucion no se cambia despues de puesta: corregir es retirar y volver a publicar'
    });
  }

  const atribucion = Object.freeze({
    proyecto,
    cuenta: handle,
    plataforma: sello_cuenta.sello.plataforma,
    autor: AUTOR,
    firmado_por_el_puente: false,
    momento: String(c.sello.momento),
    sello_de_cuenta: sello_cuenta.sello
  });

  return {
    ok: true,
    pieza: Object.assign({}, pieza, { atribucion }),
    atribucion,
    sello: c.sello,
    sello_de_cuenta: sello_cuenta.sello
  };
}

/**
 * El puente no tiene firma. Esta funcion existe para que la respuesta sea la
 * misma venga de donde venga: no hay argumento que la convierta en un si.
 */
function firmar(firma) {
  return fallo(CODIGOS.EL_PUENTE_NO_FIRMA, [], ['firma'], {
    firma: es_objeto(firma) ? clonar(firma) : firma,
    pista: 'lo publicado se atribuye al proyecto dueno de la cuenta (E2), nunca al puente (T2)'
  });
}

/**
 * Auditoria de lo publicado: lista las huerfanas y las firmas del puente. Un solo
 * hallazgo invalida la entrega.
 *
 * @param {object[]|{piezas:object[]}} publicado
 */
function auditar(publicado) {
  const lista = Array.isArray(publicado)
    ? publicado
    : (es_objeto(publicado) && Array.isArray(publicado.piezas) ? publicado.piezas : null);
  if (lista === null) {
    return { ok: false, motivo: CODIGOS.SIN_PIEZA, total: 0, atribuidas: 0, huerfanas: [], firmas: [] };
  }
  const huerfanas = [];
  const firmas = [];
  lista.forEach((pieza, indice) => {
    const v = verificar(pieza);
    if (v.ok) return;
    const hallazgo = { indice, motivo: v.motivo, proyecto: v.proyecto || null };
    if (v.causa) hallazgo.causa = v.causa;
    if (v.proyecto_atribuido) hallazgo.proyecto_atribuido = v.proyecto_atribuido;
    huerfanas.push(hallazgo);
    if (v.motivo === CODIGOS.FIRMA_DEL_PUENTE) firmas.push(hallazgo);
  });
  return {
    ok: huerfanas.length === 0 && firmas.length === 0,
    total: lista.length,
    atribuidas: lista.length - huerfanas.length,
    huerfanas,
    firmas
  };
}

module.exports = {
  CODIGOS,
  NOMBRES_DEL_PUENTE,
  AUTOR,
  es_nombre_del_puente,
  atribucion_de,
  dueno_de,
  verificar,
  esta_atribuida,
  sellar,
  firmar,
  auditar
};

// Vista "clase" para quien prefiera el nombre del diseno (E2 · SelloDeAtribucion).
module.exports.SelloDeAtribucion = Object.freeze({
  sellar,
  verificar,
  auditar,
  firmar,
  dueno_de
});
