'use strict';

/**
 * autorizaciones — Q5 · RegistroDeAutorizaciones · CUSTODIO (logica pura; el IO
 * esta en `index.js`).
 *
 * El unico sitio donde vive un "si" del dueno. Es un libro APPEND-ONLY: no se
 * edita ni se borra un asiento; el gasto de una autorizacion tampoco la muta,
 * se anota como un consumo aparte y "esta gastada" se DERIVA del libro (una sola
 * verdad, igual que la conservaduria de G5).
 *
 * CINCO REGLAS QUE HACEN QUE UN SI SEA UN SI:
 *
 *   1. **El silencio nunca se anota como autorizacion.** `via` solo puede ser
 *      `puerta` (una persona respondio en la puerta de Q2) o `canal` (la
 *      respuesta llego por el canal del dueno). `silencio` e `historial` se
 *      rechazan con su nombre. Que nadie conteste no es que si.
 *
 *   2. **Sin persona no hay autorizacion.** `quien` tiene que ser `dueno`. El
 *      agente y el sistema no autorizan nada, ni siquiera su propio trabajo.
 *
 *   3. **El si tambien caduca.** Un si viejo es un no: `respuesta_momento` no
 *      puede ser posterior a `caduca_en`, y la autorizacion entera tiene un
 *      techo de vida (`TTL_MAXIMO_SEGUNDOS`). Una autorizacion eterna es un
 *      nivel `ejecutar` disfrazado, y por ahi se cuela la autonomia sin que
 *      nadie la haya declarado.
 *
 *   4. **La autorizacion esta atada a su huella.** Se concede para
 *      (proyecto, cuenta, accion, rol) con la casilla VIGENTE. Consumirla exige
 *      exactamente esa accion, esa cuenta y ese rol: presentar un permiso de
 *      "comentar" para "publicar" se rechaza (`permiso_de_otra_accion`). Esta es
 *      la mitad Q5 de la garantia contra el ataque de las dos vias.
 *
 *   5. **Un si se gasta UNA vez.** `consumir` anota un consumo y a partir de ahi
 *      la autorizacion esta gastada para siempre. Dos ejecuciones simultaneas no
 *      pueden gastar el mismo si: el consumo pasa por el candado del custodio y
 *      la segunda ve el primero.
 *
 * Puro: sin IO, sin reloj. Todos los momentos (`momento`, `respuesta_momento`,
 * `caduca_en`) los trae quien llama.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, QUIENES, crear_sello, validar_sello } = require('../core/formas');
const casillas = require('../core/casillas');
const ritmo = require('../core/ritmo');
const noSecretos = require('../core/no-secretos');

const ESQUEMA = 'autorizaciones-v1';
const ALMACEN = 'autorizaciones';

// Las dos unicas vias por las que un si puede llegar. Las dos tienen una persona
// detras y un momento. Ni el silencio ni el historial estan en la lista, y no
// estan por decision, no por olvido.
const VIA_PERMITIDA = Object.freeze(['puerta', 'canal']);
const VIA_PROHIBIDA = Object.freeze({
  silencio: 'el_silencio_no_se_anota_como_autorizacion',
  historial: 'el_historial_no_autoriza',
  costumbre: 'la_costumbre_no_autoriza',
  sistema: 'el_sistema_no_se_autoriza_a_si_mismo'
});

const TTL_POR_DEFECTO_SEGUNDOS = 900;
const TTL_MAXIMO_SEGUNDOS = 3600;

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  SECRETO_RECIBIDO: 'secreto_recibido',
  ENTRADA_INCOMPLETA: 'entrada_incompleta',
  VIA_INVALIDA: 'via_invalida',
  VIA_PROHIBIDA: 'via_prohibida',
  SIN_PERSONA: 'autorizacion_sin_persona',
  ACCION_SIN_CASILLA: 'accion_sin_casilla',
  HUELLA_NO_CORRESPONDE: 'huella_no_corresponde',
  CADUCIDAD_INVALIDA: 'caducidad_invalida',
  CADUCIDAD_DEMASIADO_LARGA: 'caducidad_demasiado_larga',
  SI_CADUCADO: 'si_caducado_es_no',
  RESPUESTA_POSTERIOR: 'respuesta_posterior_a_la_concesion',
  NIVEL_NO_DECLARADO: 'nivel_no_declarado',
  NIVEL_CONSERVADOR: 'autorizacion_de_nivel_conservador',
  AUTORIZACION_DUPLICADA: 'autorizacion_duplicada',
  CONFIRMACION_YA_AUTORIZADA: 'confirmacion_ya_autorizada',
  AUTORIZACION_DESCONOCIDA: 'autorizacion_desconocida',
  YA_GASTADA: 'autorizacion_ya_consumida',
  CADUCADA: 'autorizacion_caducada',
  PERMISO_DE_OTRA_ACCION: 'permiso_de_otra_accion',
  PERMISO_DE_OTRA_CUENTA: 'permiso_de_otra_cuenta',
  PERMISO_DE_OTRO_PROYECTO: 'permiso_de_otro_proyecto',
  PERMISO_DE_OTRO_ROL: 'permiso_de_otro_rol',
  ALMACEN_NO_AUDITADO: 'almacen_no_auditado'
});

// ---------------------------------------------------------------------------
// estado
// ---------------------------------------------------------------------------

function estado_vacio() {
  return {
    esquema: ESQUEMA,
    almacen: ALMACEN,
    revision: 0,
    secuencia: 0,
    actualizado: null,
    autorizaciones: [],
    consumos: []
  };
}

function es_estado(estado) {
  return es_objeto(estado)
    && estado.esquema === ESQUEMA
    && Number.isFinite(Number(estado.revision))
    && Number.isFinite(Number(estado.secuencia))
    && Array.isArray(estado.autorizaciones)
    && Array.isArray(estado.consumos);
}

function _siguiente(estado, cambios) {
  return Object.assign(clonar(estado), cambios, {
    revision: Number(estado.revision) + 1,
    secuencia: Number(estado.secuencia) + 1,
    actualizado: cambios.actualizado || estado.actualizado
  });
}

function _fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

// ---------------------------------------------------------------------------
// anotar (crear la autorizacion)
// ---------------------------------------------------------------------------

function _id_de(entrada) {
  const crypto = require('crypto');
  const partes = [
    String(entrada.confirmacion_id || ''),
    String(entrada.accion || ''),
    String(entrada.rol || ''),
    casillas.normalizar_cuenta(entrada.cuenta),
    String(entrada.respuesta_momento || '')
  ].join('|');
  return `az-${crypto.createHash('sha256').update(partes, 'utf8').digest('hex').slice(0, 12)}`;
}

/**
 * Anota una autorizacion. NO la crea cualquiera: la llama el borde de Q2 cuando
 * la puerta dijo que si, o el canal del dueno si trae la respuesta entera.
 *
 * @param {object} estado
 * @param {object} entrada  {proyecto, cuenta, accion, rol, nivel_al_conceder,
 *                           via, quien, referencia, confirmacion_id,
 *                           respuesta_momento, momento, aparato, caduca_en?}
 */
function anotar(estado, entrada) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};

  const hallazgos = noSecretos.detectar_secreto(e);
  if (hallazgos.length > 0) {
    return _fallo(MOTIVOS.SECRETO_RECIBIDO, [], [], { hallazgos });
  }

  // ---- via: el silencio y el historial no son vias ----------------------
  if (texto_no_vacio(e.via) && Object.prototype.hasOwnProperty.call(VIA_PROHIBIDA, String(e.via))) {
    return _fallo(VIA_PROHIBIDA[String(e.via)], [], ['via'], { via: e.via });
  }
  if (!VIA_PERMITIDA.includes(String(e.via))) {
    return _fallo(MOTIVOS.VIA_INVALIDA, texto_no_vacio(e.via) ? [] : ['via'], texto_no_vacio(e.via) ? ['via'] : [],
      { via: e.via === undefined ? null : e.via, permitidas: VIA_PERMITIDA.slice() });
  }

  // ---- campos obligatorios ----------------------------------------------
  const faltan = [];
  if (!texto_no_vacio(e.proyecto)) faltan.push('proyecto');
  if (!texto_no_vacio(e.cuenta)) faltan.push('cuenta');
  if (!texto_no_vacio(e.accion)) faltan.push('accion');
  if (!texto_no_vacio(e.rol)) faltan.push('rol');
  if (!texto_no_vacio(e.quien)) faltan.push('quien');
  if (!texto_no_vacio(e.referencia)) faltan.push('referencia');
  if (!texto_no_vacio(e.confirmacion_id)) faltan.push('confirmacion_id');
  if (!texto_no_vacio(e.nivel_al_conceder)) faltan.push('nivel_al_conceder');
  if (!es_instante(e.momento)) faltan.push('momento');
  if (!es_instante(e.respuesta_momento)) faltan.push('respuesta_momento');
  if (faltan.length > 0) return _fallo(MOTIVOS.ENTRADA_INCOMPLETA, faltan, []);

  // ---- sin persona no hay autorizacion ----------------------------------
  if (String(e.quien) !== 'dueno' || !QUIENES.includes(String(e.quien))) {
    return _fallo(MOTIVOS.SIN_PERSONA, [], ['quien'], { quien: e.quien });
  }

  // ---- casilla y huella --------------------------------------------------
  const v = casillas.validar({ accion: e.accion, casilla: e.casilla });
  if (!v.ok) return _fallo(v.motivo, v.faltan || [], v.invalidos || []);

  const proyecto = String(e.proyecto).trim();
  const cuenta = casillas.normalizar_cuenta(e.cuenta);
  const rol = String(e.rol).trim();
  const huella = casillas.huella({ proyecto, cuenta, accion: v.accion, rol });
  if (!huella) return _fallo(MOTIVOS.HUELLA_NO_CORRESPONDE, [], ['huella'], { proyecto, cuenta, accion: v.accion, rol });
  if (texto_no_vacio(e.huella) && String(e.huella) !== huella) {
    return _fallo(MOTIVOS.HUELLA_NO_CORRESPONDE, [], ['huella'], { huella_calculada: huella, huella_recibida: e.huella });
  }

  // ---- nivel: un permiso concedido en borrador no vale ------------------
  if (!['permiso', 'ejecutar'].includes(String(e.nivel_al_conceder))) {
    return _fallo(MOTIVOS.NIVEL_CONSERVADOR, [], ['nivel_al_conceder'], { nivel_al_conceder: e.nivel_al_conceder });
  }

  // ---- caducidad: obligatoria, y con techo ------------------------------
  let caduca_en = e.caduca_en;
  if (caduca_en === undefined || caduca_en === null) {
    caduca_en = ritmo.desplazar(e.momento, TTL_POR_DEFECTO_SEGUNDOS / 60);
  }
  if (!es_instante(caduca_en) || !ritmo.antes_de(e.momento, caduca_en)) {
    return _fallo(MOTIVOS.CADUCIDAD_INVALIDA, [], ['caduca_en'], { caduca_en });
  }
  const minutos = ritmo.minutos_entre(e.momento, caduca_en);
  // `minutos_entre` redondea: se compara en ms para no dejar pasar 3601 s.
  const segundos = Math.round((Date.parse(caduca_en) - Date.parse(e.momento)) / 1000);
  if (!Number.isFinite(segundos) || segundos > TTL_MAXIMO_SEGUNDOS) {
    return _fallo(MOTIVOS.CADUCIDAD_DEMASIADO_LARGA, [], ['caduca_en'],
      { caduca_en, segundos, tope_segundos: TTL_MAXIMO_SEGUNDOS, minutos });
  }

  // ---- el si no puede ser viejo ni anterior a existir -------------------
  if (ritmo.antes_de(caduca_en, e.respuesta_momento)) {
    return _fallo(MOTIVOS.SI_CADUCADO, [], ['respuesta_momento'],
      { caduca_en, respuesta_momento: e.respuesta_momento });
  }
  if (ritmo.antes_de(e.momento, e.respuesta_momento)) {
    return _fallo(MOTIVOS.RESPUESTA_POSTERIOR, [], ['respuesta_momento'],
      { concedida_en: e.momento, respuesta_momento: e.respuesta_momento });
  }

  // ---- un si, una autorizacion -----------------------------------------
  const autorizacion_id = texto_no_vacio(e.autorizacion_id) ? String(e.autorizacion_id).trim() : _id_de(e);
  if (estado.autorizaciones.some((a) => a && a.autorizacion_id === autorizacion_id)) {
    return _fallo(MOTIVOS.AUTORIZACION_DUPLICADA, [], ['autorizacion_id'], { autorizacion_id });
  }
  if (estado.autorizaciones.some((a) => a && a.confirmacion_id === String(e.confirmacion_id))) {
    return _fallo(MOTIVOS.CONFIRMACION_YA_AUTORIZADA, [], ['confirmacion_id'],
      { confirmacion_id: e.confirmacion_id, nota: 'una respuesta no puede acunar dos permisos' });
  }

  const sello = crear_sello({
    proyecto,
    cuenta,
    aparato: e.aparato,
    momento: e.momento,
    quien: e.quien
  });
  if (!sello.ok) return _fallo('sin_sello', sello.faltan, sello.invalidos);

  const autorizacion = {
    autorizacion_id,
    proyecto,
    cuenta,
    accion: v.accion,
    rol,
    huella,
    casilla: clonar(v.casilla),
    nivel_al_conceder: String(e.nivel_al_conceder),
    concedida_en: e.momento,
    caduca_en,
    via: String(e.via),
    referencia: String(e.referencia).trim(),
    confirmacion_id: String(e.confirmacion_id),
    respuesta_momento: e.respuesta_momento,
    quien: 'dueno',
    operacion_id: texto_no_vacio(e.operacion_id) ? String(e.operacion_id).trim() : null,
    sello: sello.sello
  };

  const nuevo = _siguiente(estado, {
    autorizaciones: estado.autorizaciones.concat([autorizacion]),
    actualizado: e.momento
  });

  return { ok: true, estado: nuevo, autorizacion: clonar(autorizacion), autorizacion_id, huella };
}

// ---------------------------------------------------------------------------
// gasto (derivado)
// ---------------------------------------------------------------------------

/** Momento del primer consumo de una autorizacion, o `null` si no se ha gastado. */
function consumida_en(estado, autorizacion_id) {
  if (!es_estado(estado) || !texto_no_vacio(autorizacion_id)) return null;
  const c = estado.consumos.find((x) => x && x.autorizacion_id === String(autorizacion_id));
  return c ? c.momento : null;
}

function esta_gastada(estado, autorizacion_id) {
  return consumida_en(estado, autorizacion_id) !== null;
}

function _buscar(estado, autorizacion_id) {
  if (!es_estado(estado) || !texto_no_vacio(autorizacion_id)) return null;
  return estado.autorizaciones.find((a) => a && a.autorizacion_id === String(autorizacion_id)) || null;
}

// ---------------------------------------------------------------------------
// consumir
// ---------------------------------------------------------------------------

/**
 * Gasta una autorizacion para UNA ejecucion concreta.
 *
 * El que ejecuta dice que va a hacer (accion, cuenta, proyecto, rol) y el libro
 * comprueba que eso es exactamente lo que el dueno autorizo. Si no coincide, no
 * hay gasto y no hay ejecucion: no se gasta "un permiso", se gasta ESTE permiso
 * para ESTA accion.
 *
 * @param {object} estado
 * @param {{autorizacion_id:string, momento:string, accion:string, cuenta:string,
 *          proyecto:string, rol:string, quien:string, operacion_id?:string}} entrada
 */
function consumir(estado, entrada) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};

  const faltan = [];
  if (!texto_no_vacio(e.autorizacion_id)) faltan.push('autorizacion_id');
  if (!es_instante(e.momento)) faltan.push('momento');
  if (!texto_no_vacio(e.accion)) faltan.push('accion');
  if (!texto_no_vacio(e.cuenta)) faltan.push('cuenta');
  if (!texto_no_vacio(e.proyecto)) faltan.push('proyecto');
  if (!texto_no_vacio(e.rol)) faltan.push('rol');
  if (!texto_no_vacio(e.quien)) faltan.push('quien');
  if (faltan.length > 0) return _fallo(MOTIVOS.ENTRADA_INCOMPLETA, faltan, []);

  const aut = _buscar(estado, e.autorizacion_id);
  if (!aut) return _fallo(MOTIVOS.AUTORIZACION_DESCONOCIDA, [], ['autorizacion_id'], { autorizacion_id: e.autorizacion_id });

  // Un si, un uso. Antes que nada: si ya se gasto, no hay nada que discutir.
  const gastada = consumida_en(estado, aut.autorizacion_id);
  if (gastada !== null) {
    return _fallo(MOTIVOS.YA_GASTADA, [], [], { autorizacion_id: aut.autorizacion_id, consumida_en: gastada });
  }

  if (ritmo.antes_de(aut.caduca_en, e.momento)) {
    return _fallo(MOTIVOS.CADUCADA, [], [], { autorizacion_id: aut.autorizacion_id, caduca_en: aut.caduca_en });
  }

  // ---- la comprobacion que impide las dos vias --------------------------
  const cuenta = casillas.normalizar_cuenta(e.cuenta);
  const proyecto = String(e.proyecto).trim();
  const rol = String(e.rol).trim();
  const accion = String(e.accion).trim();

  if (accion !== aut.accion) {
    return _fallo(MOTIVOS.PERMISO_DE_OTRA_ACCION, [], ['accion'],
      { autorizada: aut.accion, pedida: accion, autorizacion_id: aut.autorizacion_id });
  }
  if (cuenta !== aut.cuenta) {
    return _fallo(MOTIVOS.PERMISO_DE_OTRA_CUENTA, [], ['cuenta'],
      { autorizada: aut.cuenta, pedida: cuenta, autorizacion_id: aut.autorizacion_id });
  }
  if (proyecto !== aut.proyecto) {
    return _fallo(MOTIVOS.PERMISO_DE_OTRO_PROYECTO, [], ['proyecto'],
      { autorizado: aut.proyecto, pedido: proyecto, autorizacion_id: aut.autorizacion_id });
  }
  if (rol !== aut.rol) {
    return _fallo(MOTIVOS.PERMISO_DE_OTRO_ROL, [], ['rol'],
      { autorizado: aut.rol, pedido: rol, autorizacion_id: aut.autorizacion_id });
  }

  const huella = casillas.huella({ proyecto, cuenta, accion, rol });
  if (huella !== aut.huella) {
    // La accion cambio de casilla desde que se concedio (o alguien toco la
    // huella): el permiso viejo muere con la casilla vieja.
    return _fallo(MOTIVOS.HUELLA_NO_CORRESPONDE, [], ['huella'],
      { calculada: huella, autorizada: aut.huella, autorizacion_id: aut.autorizacion_id });
  }

  const consumo = {
    autorizacion_id: aut.autorizacion_id,
    momento: e.momento,
    accion,
    cuenta,
    proyecto,
    rol,
    huella,
    quien: String(e.quien),
    operacion_id: texto_no_vacio(e.operacion_id) ? String(e.operacion_id).trim() : null
  };

  const nuevo = _siguiente(estado, {
    consumos: estado.consumos.concat([consumo]),
    actualizado: e.momento
  });

  return { ok: true, estado: nuevo, autorizacion: clonar(aut), consumo, huella };
}

// ---------------------------------------------------------------------------
// lecturas
// ---------------------------------------------------------------------------

/**
 * Devuelve una autorizacion con su estado DERIVADO: gastada o no, y si sigue
 * viva en el momento que se pregunta. Sin momento no se inventa vigencia.
 */
function consultar(estado, consulta) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const c = es_objeto(consulta) ? consulta : {};
  if (!texto_no_vacio(c.autorizacion_id)) return _fallo(MOTIVOS.ENTRADA_INVALIDA, ['autorizacion_id'], []);

  const aut = _buscar(estado, c.autorizacion_id);
  if (!aut) return _fallo(MOTIVOS.AUTORIZACION_DESCONOCIDA, [], ['autorizacion_id'], { autorizacion_id: c.autorizacion_id });

  const gastada = consumida_en(estado, aut.autorizacion_id);
  const viva = es_instante(c.momento) ? !ritmo.antes_de(aut.caduca_en, c.momento) : null;

  const fila = clonar(aut);
  fila.consumida_en = gastada;
  fila.consumida = gastada !== null;
  fila.vigente = viva === null ? null : (viva && gastada === null);

  return {
    ok: true,
    autorizacion: fila,
    autorizacion_id: aut.autorizacion_id,
    gastada: gastada !== null,
    consumida_en: gastada,
    vigente: fila.vigente,
    motivo: gastada !== null ? MOTIVOS.YA_GASTADA : (viva === false ? MOTIVOS.CADUCADA : null)
  };
}

function listar(estado, filtro) {
  if (!es_estado(estado)) return _fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const f = es_objeto(filtro) ? filtro : {};
  const proyecto = texto_no_vacio(f.proyecto) ? String(f.proyecto).trim() : null;
  const cuenta = texto_no_vacio(f.cuenta) ? casillas.normalizar_cuenta(f.cuenta) : null;

  const filas = estado.autorizaciones
    .filter((a) => a && (proyecto === null || a.proyecto === proyecto) && (cuenta === null || a.cuenta === cuenta))
    .map((a) => {
      const gastada = consumida_en(estado, a.autorizacion_id);
      return Object.assign(clonar(a), { consumida_en: gastada, consumida: gastada !== null });
    });

  return { ok: true, autorizaciones: filas, total: filas.length, proyecto, cuenta };
}

// ---------------------------------------------------------------------------
// auditoria
// ---------------------------------------------------------------------------

/**
 * Lo que no puede estar mal en el fichero, escrito una vez:
 *   - cada asiento con su sello (P1) y sin secretos (V1);
 *   - `quien` es `dueno` y la via es una de las dos (nada de silencio);
 *   - el si no es posterior a su caducidad, y la caducidad tiene techo;
 *   - la huella guardada es la que la tabla calcula HOY;
 *   - cada consumo apunta a una autorizacion que existe y no se repite.
 */
function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, problemas: [{ ruta: '(raiz)', motivo: MOTIVOS.ESQUEMA_DESCONOCIDO }] };
  }

  for (const h of noSecretos.detectar_secreto(estado)) {
    problemas.push({ ruta: h.ruta, motivo: 'secreto', familia: h.familia });
  }

  const vistos = new Set();
  const confirmaciones = new Set();
  estado.autorizaciones.forEach((a, i) => {
    const ruta = `autorizaciones[${i}]`;
    if (!es_objeto(a)) {
      problemas.push({ ruta, motivo: 'asiento_no_es_objeto' });
      return;
    }

    if (!validar_sello(a.sello).ok) {
      problemas.push({ ruta: `${ruta}.sello`, motivo: 'sin_sello' });
    }
    if (!texto_no_vacio(a.autorizacion_id)) {
      problemas.push({ ruta: `${ruta}.autorizacion_id`, motivo: 'sin_autorizacion_id' });
    } else {
      if (vistos.has(a.autorizacion_id)) problemas.push({ ruta: `${ruta}.autorizacion_id`, motivo: 'autorizacion_duplicada' });
      vistos.add(a.autorizacion_id);
    }
    if (texto_no_vacio(a.confirmacion_id)) {
      if (confirmaciones.has(a.confirmacion_id)) {
        problemas.push({ ruta: `${ruta}.confirmacion_id`, motivo: 'confirmacion_ya_autorizada' });
      }
      confirmaciones.add(a.confirmacion_id);
    }

    if (a.quien !== 'dueno') {
      problemas.push({ ruta: `${ruta}.quien`, motivo: MOTIVOS.SIN_PERSONA, valor: a.quien });
    }
    if (!VIA_PERMITIDA.includes(String(a.via))) {
      problemas.push({ ruta: `${ruta}.via`, motivo: MOTIVOS.VIA_INVALIDA, valor: a.via });
    }
    if (!texto_no_vacio(a.referencia)) {
      problemas.push({ ruta: `${ruta}.referencia`, motivo: 'autorizacion_sin_referencia' });
    }
    if (!es_instante(a.respuesta_momento)) {
      problemas.push({ ruta: `${ruta}.respuesta_momento`, motivo: 'respuesta_sin_momento' });
    }
    if (!es_instante(a.concedida_en)) {
      problemas.push({ ruta: `${ruta}.concedida_en`, motivo: 'sin_momento' });
    }
    if (!es_instante(a.caduca_en)) {
      problemas.push({ ruta: `${ruta}.caduca_en`, motivo: MOTIVOS.CADUCIDAD_INVALIDA });
    }
    if (es_instante(a.concedida_en) && es_instante(a.caduca_en)) {
      const segundos = (Date.parse(a.caduca_en) - Date.parse(a.concedida_en)) / 1000;
      if (!(segundos > 0)) problemas.push({ ruta: `${ruta}.caduca_en`, motivo: MOTIVOS.CADUCIDAD_INVALIDA });
      if (segundos > TTL_MAXIMO_SEGUNDOS) {
        problemas.push({ ruta: `${ruta}.caduca_en`, motivo: MOTIVOS.CADUCIDAD_DEMASIADO_LARGA, segundos });
      }
    }
    if (es_instante(a.caduca_en) && es_instante(a.respuesta_momento) && ritmo.antes_de(a.caduca_en, a.respuesta_momento)) {
      problemas.push({ ruta: `${ruta}.respuesta_momento`, motivo: MOTIVOS.SI_CADUCADO });
    }

    const huella = casillas.huella({ proyecto: a.proyecto, cuenta: a.cuenta, accion: a.accion, rol: a.rol });
    if (huella === null) {
      problemas.push({ ruta: `${ruta}.accion`, motivo: MOTIVOS.ACCION_SIN_CASILLA, valor: a.accion });
    } else if (huella !== a.huella) {
      problemas.push({ ruta: `${ruta}.huella`, motivo: MOTIVOS.HUELLA_NO_CORRESPONDE });
    }

    if (!['permiso', 'ejecutar'].includes(String(a.nivel_al_conceder))) {
      problemas.push({ ruta: `${ruta}.nivel_al_conceder`, motivo: MOTIVOS.NIVEL_CONSERVADOR, valor: a.nivel_al_conceder });
    }
  });

  const gastadas = new Set();
  estado.consumos.forEach((c, j) => {
    const ruta = `consumos[${j}]`;
    if (!es_objeto(c) || !texto_no_vacio(c.autorizacion_id)) {
      problemas.push({ ruta, motivo: 'consumo_sin_autorizacion' });
      return;
    }
    if (!vistos.has(c.autorizacion_id)) {
      problemas.push({ ruta: `${ruta}.autorizacion_id`, motivo: 'consumo_de_autorizacion_inexistente' });
    }
    if (gastadas.has(c.autorizacion_id)) {
      problemas.push({ ruta: `${ruta}.autorizacion_id`, motivo: 'autorizacion_gastada_dos_veces' });
    }
    gastadas.add(c.autorizacion_id);
    if (!es_instante(c.momento)) problemas.push({ ruta: `${ruta}.momento`, motivo: 'sin_momento' });
    if (!QUIENES.includes(String(c.quien))) problemas.push({ ruta: `${ruta}.quien`, motivo: 'quien_no_declarado', valor: c.quien });
  });

  return { ok: problemas.length === 0, problemas };
}

function describir() {
  return {
    esquema: ESQUEMA,
    vias: VIA_PERMITIDA.slice(),
    vias_prohibidas: Object.keys(VIA_PROHIBIDA),
    ttl_por_defecto_segundos: TTL_POR_DEFECTO_SEGUNDOS,
    ttl_maximo_segundos: TTL_MAXIMO_SEGUNDOS,
    regla: 'el silencio nunca se anota como autorizacion'
  };
}

module.exports = {
  MOTIVOS,
  ESQUEMA,
  ALMACEN,
  VIA_PERMITIDA,
  VIA_PROHIBIDA,
  TTL_POR_DEFECTO_SEGUNDOS,
  TTL_MAXIMO_SEGUNDOS,
  estado_vacio,
  es_estado,
  anotar,
  consumir,
  consultar,
  listar,
  consumida_en,
  esta_gastada,
  auditar,
  describir
};

module.exports.RegistroDeAutorizaciones = Object.freeze({
  estado_vacio,
  es_estado,
  anotar,
  consumir,
  consultar,
  listar,
  consumida_en,
  esta_gastada,
  auditar
});
