'use strict';

/**
 * casillas — Q1 · CasillaDeAccion · REFLEJO.
 *
 * Toda accion del puente tiene UNA casilla, y la casilla la declara el sistema,
 * no el que pide. La casilla dice dos cosas que no se pueden deducir despues:
 *
 *   reversibilidad   reversible  -> existe una accion inversa que deja la
 *                                   plataforma como estaba Y nadie fue avisado
 *                    irreversible-> no existe, o existe pero ya se notifico
 *   visibilidad      privada     -> solo lo ve el dueno
 *                    visible     -> lo ve (o lo recibe) otra persona
 *
 * REGLA DURA (la unica que hace falta recordar): **una accion SIN casilla NO
 * se ejecuta**. No hay casilla por defecto, ni casilla "provisional", ni casilla
 * que traiga el payload. Si manana la plataforma estrena una accion y esta tabla
 * no la conoce, el puente la rechaza: no saber que hace una accion es motivo
 * suficiente para no hacerla.
 *
 * La tabla esta escrita del lado caro a proposito. La regla para decidir la
 * reversibilidad es la de los abogados, no la de los ingenieros: si el estado se
 * puede restaurar pero la notificacion ya salio, es IRREVERSIBLE. Seguir a
 * alguien se puede deshacer con "dejar de seguir", pero el aviso que recibio esa
 * persona no se recoge.
 *
 * `ventana_segundos` es el rato de arrepentimiento DECLARADO para esa accion
 * (Q4). Cero significa "no hace falta ventana": o es inocua, o el acto no tiene
 * nada que deshacer. La ventana nunca se acorta por peticion (ver ventana.js):
 * acortarla es menos conservador.
 *
 * La `huella` es el pegamento de todo el bloque 9: ata (proyecto, cuenta,
 * accion, rol) a la casilla VIGENTE y produce un identificador reproducible. Un
 * permiso se concede con una huella y solo vale para esa huella. Si la tabla
 * cambia de opinion sobre una accion, las huellas viejas dejan de casar y los
 * permisos viejos mueren con ellas: es el comportamiento correcto.
 *
 * Puro: sin IO, sin reloj, sin estado global. La tabla es inmutable.
 */

const crypto = require('crypto');
const { es_objeto, texto_no_vacio, clonar } = require('./formas');

const REVERSIBILIDAD = Object.freeze(['reversible', 'irreversible']);
const VISIBILIDAD = Object.freeze(['visible', 'privada']);

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  ACCION_SIN_CASILLA: 'accion_sin_casilla',
  CASILLA_AJENA: 'casilla_ajena',
  SIN_AMBITO: 'ambito_incompleto'
});

function _c(reversibilidad, visibilidad, ventana_segundos, nota) {
  return Object.freeze({ reversibilidad, visibilidad, ventana_segundos, nota });
}

/**
 * La tabla. Catorce acciones, ni una mas. Las seis primeras son las de G1
 * (`core/ritmo.js`), que es quien las cobra; el resto son las que el modo
 * degradado (H3) ya nombraba, para que no exista una accion ejecutable que no
 * tenga casilla.
 */
const CASILLAS = Object.freeze({
  // --- observar: no cambia nada en el mundo -------------------------------
  pulso: _c('reversible', 'privada', 0,
    'no toca nada: solo dice que el puente sigue vivo'),
  leer: _c('reversible', 'privada', 0,
    'leer no deja huella en la plataforma ni avisa a nadie'),

  // --- reversible porque aun no ha pasado nada ----------------------------
  programar: _c('reversible', 'privada', 0,
    'programar se cancela antes de que dispare; cuando dispara manda la casilla de la accion programada'),

  // --- escribir en el mundo ----------------------------------------------
  seguir: _c('irreversible', 'visible', 30,
    'dejar de seguir restaura el estado, pero la notificacion ya se envio'),
  dejar_de_seguir: _c('irreversible', 'visible', 30,
    'volver a seguir no devuelve el aviso que la otra cuenta ya recibio'),
  dar_me_gusta: _c('irreversible', 'visible', 20,
    'quitar el me gusta no recoge la notificacion'),
  comentar: _c('irreversible', 'visible', 60,
    'borrar el comentario no lo des-ve quien lo leyo ni quien lo recibio'),
  responder: _c('irreversible', 'privada', 60,
    'un mensaje directo entregado no se puede recoger: solo lo ve el dueno'),
  enviar_dm: _c('irreversible', 'privada', 60,
    'igual que responder: la entrega es el hecho'),
  publicar: _c('irreversible', 'visible', 120,
    'la publicacion es el hecho; borrarla despues no la despublica del feed de nadie'),
  subir_historia: _c('irreversible', 'visible', 120,
    'la historia se ve 24 h; borrarla no la borra de quien ya la vio'),
  editar_perfil: _c('irreversible', 'visible', 120,
    'lo que estaba escrito ya se vio; volver al texto anterior no lo des-ve'),
  etiquetar: _c('irreversible', 'visible', 60,
    'la persona etiquetada recibe el aviso en el momento'),
  compartir: _c('irreversible', 'visible', 60,
    'lo compartido vive fuera de la cuenta que lo compartio'),
  borrar: _c('irreversible', 'visible', 180,
    'borrar es el ejemplo canonico: no hay inversa; la ventana es lo unico que queda')
});

const ACCIONES = Object.freeze(Object.keys(CASILLAS));

// ---------------------------------------------------------------------------
// consulta
// ---------------------------------------------------------------------------

function es_accion(accion) {
  return texto_no_vacio(accion) && Object.prototype.hasOwnProperty.call(CASILLAS, String(accion).trim());
}

/** La casilla de una accion, o `null`. Copia: la tabla no se toca desde fuera. */
function casilla_de(accion) {
  if (!es_accion(accion)) return null;
  return clonar(CASILLAS[String(accion).trim()]);
}

/** Lista cerrada de acciones con casilla. */
function acciones() {
  return ACCIONES.slice();
}

/**
 * Valida que una accion tenga casilla. Acepta la accion suelta o un objeto con
 * `accion` (y, si viene, `casilla`).
 *
 * Una `casilla` que traiga el que pide NO se usa: si coincide con la tabla se
 * acepta como confirmacion redundante; si no coincide, la peticion se rechaza
 * (`casilla_ajena`). Traerse la propia casilla es exactamente la maniobra que
 * este bloque existe para impedir.
 *
 * @param {string|{accion:string, casilla?:object}} entrada
 * @returns {{ok:boolean, accion?:string, casilla?:object, motivo?:string, faltan?:string[], traida?:object}}
 */
function validar(entrada) {
  const pedida = typeof entrada === 'string'
    ? entrada
    : (es_objeto(entrada) ? entrada.accion : undefined);

  if (!texto_no_vacio(pedida)) {
    return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['accion'], invalidos: [] };
  }

  const accion = String(pedida).trim();
  const casilla = CASILLAS[accion];
  if (!casilla) {
    return { ok: false, motivo: MOTIVOS.ACCION_SIN_CASILLA, accion, declarada: false };
  }

  if (es_objeto(entrada) && entrada.casilla !== undefined && entrada.casilla !== null) {
    const traida = entrada.casilla;
    const coincide = es_objeto(traida)
      && traida.reversibilidad === casilla.reversibilidad
      && traida.visibilidad === casilla.visibilidad;
    if (!coincide) {
      return {
        ok: false,
        motivo: MOTIVOS.CASILLA_AJENA,
        accion,
        casilla: clonar(casilla),
        traida: clonar(traida)
      };
    }
  }

  return { ok: true, accion, casilla: clonar(casilla) };
}

/** LA REGLA DURA, en una linea: sin casilla no se ejecuta. */
function puede_ejecutarse(entrada) {
  return validar(entrada).ok === true;
}

function es_irreversible(accion) {
  const c = casilla_de(accion);
  return !!(c && c.reversibilidad === 'irreversible');
}

function es_visible(accion) {
  const c = casilla_de(accion);
  return !!(c && c.visibilidad === 'visible');
}

/**
 * Inocua = reversible Y privada. Es el unico tipo de accion que se puede hacer
 * sin cambiar nada del mundo: observa y no avisa. Q6 la deja pasar incluso en el
 * nivel mas conservador, porque un puente que no puede mirar no puede trabajar.
 */
function es_inocua(accion) {
  const c = casilla_de(accion);
  return !!(c && c.reversibilidad === 'reversible' && c.visibilidad === 'privada');
}

/** Segundos de arrepentimiento declarados para la accion (0 si no tiene). */
function ventana_de(accion) {
  const c = casilla_de(accion);
  if (!c) return { segundos: 0, declarada: false, accion: null };
  return { segundos: c.ventana_segundos, declarada: true, accion: String(accion).trim() };
}

/**
 * La casilla de un paso compuesto: la PEOR de las dos. Un paso que hace dos
 * cosas es tan irreversible como la mas irreversible de ellas, y tan visible
 * como la mas visible. La ventana es la mayor.
 */
function combinar(a, b) {
  const ca = typeof a === 'string' ? casilla_de(a) : (es_objeto(a) ? a : null);
  const cb = typeof b === 'string' ? casilla_de(b) : (es_objeto(b) ? b : null);
  if (!ca || !cb) return null;
  return {
    reversibilidad: (ca.reversibilidad === 'irreversible' || cb.reversibilidad === 'irreversible')
      ? 'irreversible' : 'reversible',
    visibilidad: (ca.visibilidad === 'visible' || cb.visibilidad === 'visible') ? 'visible' : 'privada',
    ventana_segundos: Math.max(Number(ca.ventana_segundos) || 0, Number(cb.ventana_segundos) || 0),
    nota: 'peor de las dos'
  };
}

// ---------------------------------------------------------------------------
// huella
// ---------------------------------------------------------------------------

/** Cuenta canonica: minusculas y sin arroba. La misma en todo el bloque 9. */
function normalizar_cuenta(cuenta) {
  if (!texto_no_vacio(cuenta)) return '';
  return String(cuenta).trim().toLowerCase().replace(/^@/, '');
}

/**
 * Huella de una autorizacion: ata el ambito y el rol a la casilla VIGENTE de la
 * accion. Dos peticiones con la misma huella son la misma peticion; una accion
 * distinta, otra cuenta, otro rol u otra casilla dan huellas distintas.
 *
 * Sin esto, un permiso para "comentar" serviria para "publicar": mismo dueno,
 * misma cuenta, misma sesion. La huella es lo que hace que un si sea un si PARA
 * ALGO.
 *
 * @param {{proyecto:string, cuenta:string, accion:string, rol:string}} partes
 * @returns {string|null} 32 hex, o `null` si falta algo o la accion no tiene casilla
 */
function huella(partes) {
  if (!es_objeto(partes)) return null;
  const proyecto = texto_no_vacio(partes.proyecto) ? String(partes.proyecto).trim() : '';
  const cuenta = normalizar_cuenta(partes.cuenta);
  const rol = texto_no_vacio(partes.rol) ? String(partes.rol).trim() : '';
  const v = validar(partes.accion);
  if (!proyecto || !cuenta || !rol || !v.ok) return null;

  const canonico = [
    proyecto,
    cuenta,
    v.accion,
    rol,
    v.casilla.reversibilidad,
    v.casilla.visibilidad,
    String(v.casilla.ventana_segundos)
  ].join('|');

  return crypto.createHash('sha256').update(canonico, 'utf8').digest('hex').slice(0, 32);
}

function describir() {
  return {
    acciones: acciones(),
    reversibilidad: REVERSIBILIDAD.slice(),
    visibilidad: VISIBILIDAD.slice(),
    regla: 'una accion sin casilla no se ejecuta'
  };
}

module.exports = {
  MOTIVOS,
  REVERSIBILIDAD,
  VISIBILIDAD,
  CASILLAS,
  ACCIONES,
  acciones,
  es_accion,
  casilla_de,
  validar,
  puede_ejecutarse,
  es_irreversible,
  es_visible,
  es_inocua,
  ventana_de,
  combinar,
  normalizar_cuenta,
  huella,
  describir
};

module.exports.CasillaDeAccion = Object.freeze({
  acciones,
  es_accion,
  casilla_de,
  validar,
  puede_ejecutarse,
  es_irreversible,
  es_visible,
  es_inocua,
  ventana_de,
  combinar,
  normalizar_cuenta,
  huella
});
