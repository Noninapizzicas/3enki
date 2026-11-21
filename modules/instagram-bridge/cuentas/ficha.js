'use strict';

/**
 * ficha — E1 · FichaDeCuenta · CUSTODIO (single-writer de su almacen).
 *
 * Quien es la cuenta: SU identidad visible, SU voz (tono, vocabulario, lo que
 * nunca dice) y SUS limites. La ficha es por cuenta Y por proyecto: dos proyectos
 * con el mismo handle tienen fichas distintas, y la de uno no se lee desde el
 * otro. La voz NUNCA la inventa el puente: la declara el proyecto (E3), con su
 * autorizacion; el puente la aplica, no la redacta ni la mejora.
 *
 * Reglas que esta pieza hace ejecutables (diseno-oop.md, E1):
 *   - **Sin ficha no se opera.** `puede_operar` contesta que no y `admite` nombra
 *     `sin_ficha`. No hay ficha por defecto.
 *   - **Sin voz declarada, la cuenta SOLO LEE.** La ficha existe (identidad y
 *     limites), pero `modo` es `lectura`, `puede_operar` es no y `admite` devuelve
 *     `sin_voz`. Una cuenta que aun no sabe como hablar no habla.
 *   - **La voz no se inventa.** Una voz sin `declarada_por: 'proyecto'` o sin
 *     `autorizacion_id` se rechaza (`voz_invalida` / `sin_autorizacion`); nunca se
 *     completa con una plantilla del sistema.
 *   - **Una cuenta sin proyecto dueno es un FALLO DE ALTA**
 *     (`cuenta_sin_proyecto_dueno`): la ficha pertenece a un proyecto, y el
 *     puente no es dueno de ninguna cuenta (T2).
 *   - **Nada se persiste sin auditar** (P1 sello, V1 secretos, P3 ambito): antes de
 *     cada escritura corre `auditar()`. Un almacen ilegible NO se sobrescribe.
 *
 * La logica de dominio es pura (`declarar`, `actualizar`, `leer`, `admitir`,
 * `auditar`) y vive en este mismo fichero; la clase del final es el borde con IO,
 * el candado de single-writer y los handlers del bus.
 */

const path = require('path');
const fsp = require('fs/promises');

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { es_objeto, es_instante, texto_no_vacio, clonar, QUIENES } = require('../core/formas');
const { sellar, comprobar: comprobar_sello } = require('../core/sello');
const propiedad = require('../core/propiedad');
const no_secretos = require('../core/no-secretos');
const padron = require('./padron');

const ESQUEMA = 'fichas-de-cuenta-v1';
const ALMACEN = 'fichas';
const PLATAFORMA = 'instagram';

// Modos de una ficha. Se DERIVAN de la voz declarada; no se guardan como verdad
// aparte (una sola verdad: la voz).
const MODOS = Object.freeze(['operativa', 'lectura', 'sin_ficha']);

// Quien puede declarar la voz. Solo el proyecto: el puente la aplica.
const DECLARANTES_DE_VOZ = Object.freeze(['proyecto']);

// Nombres que no son proyectos duenos. Una ficha a nombre del puente seria una
// identidad del sistema (T2), asi que se rechaza como fallo de alta.
const PROYECTOS_RESERVADOS = Object.freeze([
  'puente',
  'bridge',
  'instagram-bridge',
  'instagram_bridge',
  'sistema',
  'enki'
]);

const TIPOS_HISTORIA = Object.freeze(['actualizacion', 'voz_declarada', 'limites']);

const MOTIVOS = Object.freeze({
  SIN_FICHA: 'sin_ficha',
  SIN_VOZ: 'sin_voz',
  VOZ_INVALIDA: 'voz_invalida',
  VOZ_NO_DECLARADA_POR_EL_PROYECTO: 'voz_no_declarada_por_el_proyecto',
  FICHA_YA_DECLARADA: 'ficha_ya_declarada',
  FICHA_INEXISTENTE: 'ficha_inexistente',
  FICHA_DE_OTRO_PROYECTO: 'ficha_de_otro_proyecto',
  CUENTA_SIN_PROYECTO_DUENO: 'cuenta_sin_proyecto_dueno',
  AMBITO_INCOMPLETO: 'ambito_incompleto',
  SIN_AUTORIZACION: 'sin_autorizacion',
  SECRETO_RECIBIDO: 'secreto_recibido',
  ENTRADA_INVALIDA: 'entrada_invalida',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  ALMACEN_NO_AUDITADO: 'almacen_no_auditado',
  TEXTO_VACIO: 'texto_vacio',
  DICE_LO_QUE_NUNCA_DICE: 'dice_lo_que_nunca_dice',
  TEMA_FUERA_DE_LIMITE: 'tema_fuera_de_limite',
  NO_SE_PUBLICA: 'no_se_publica'
});

// ---- estado ---------------------------------------------------------------

function estado_vacio() {
  return { esquema: ESQUEMA, almacen: ALMACEN, revision: 0, actualizado: null, fichas: [] };
}

function es_estado(x) {
  return es_objeto(x) && x.esquema === ESQUEMA && Array.isArray(x.fichas);
}

// ---- utilidades -----------------------------------------------------------

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

function es_proyecto_reservado(p) {
  return typeof p === 'string' && PROYECTOS_RESERVADOS.includes(p.trim().toLowerCase());
}

function ficha_id_de(proyecto, plataforma, cuenta) {
  return `${proyecto}:${plataforma}:${cuenta}`;
}

function indice_de(estado, proyecto, plataforma, cuenta) {
  return estado.fichas.findIndex(
    (f) => f && f.proyecto === proyecto && f.plataforma === plataforma && f.cuenta === cuenta
  );
}

function normalizar_texto(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

/** Lista de textos declarada (vocabulario, lo que nunca dice, limites de tema). */
function validar_lista(valor, campo) {
  if (valor === undefined || valor === null) return { ok: true, valor: [] };
  if (!Array.isArray(valor)) return { ok: false, faltan: [], invalidos: [campo] };
  const out = [];
  for (let i = 0; i < valor.length; i += 1) {
    if (!texto_no_vacio(valor[i])) return { ok: false, faltan: [], invalidos: [`${campo}[${i}]`] };
    out.push(String(valor[i]).trim());
  }
  return { ok: true, valor: out };
}

/**
 * Valida la voz. La voz es del proyecto o no es voz: `declarada_por` tiene que ser
 * `proyecto` y tiene que venir con `autorizacion_id`. No se completa nada.
 */
function validar_voz(voz) {
  if (!es_objeto(voz)) return { ok: false, faltan: ['tono', 'declarada_por', 'autorizacion_id'], invalidos: ['voz'] };
  const faltan = [];
  const invalidos = [];
  if (!texto_no_vacio(voz.tono)) faltan.push('tono');
  if (vacio(voz.declarada_por)) faltan.push('declarada_por');
  else if (!DECLARANTES_DE_VOZ.includes(String(voz.declarada_por).trim())) invalidos.push('declarada_por');
  if (!texto_no_vacio(voz.autorizacion_id)) faltan.push('autorizacion_id');
  for (const campo of ['vocabulario', 'lo_que_nunca_dice', 'limites_de_tema']) {
    const v = validar_lista(voz[campo], campo);
    if (!v.ok) { faltan.push(...v.faltan); invalidos.push(...v.invalidos); }
  }
  return { ok: faltan.length === 0 && invalidos.length === 0, faltan, invalidos };
}

/** Valida la identidad visible: sin nombre no hay a quien nombrar. */
function validar_identidad(identidad) {
  if (!es_objeto(identidad)) return { ok: false, faltan: ['identidad_visible.nombre'], invalidos: ['identidad_visible'] };
  const faltan = [];
  const invalidos = [];
  if (!texto_no_vacio(identidad.nombre)) faltan.push('identidad_visible.nombre');
  if (identidad.presentacion !== undefined && identidad.presentacion !== null && typeof identidad.presentacion !== 'string') {
    invalidos.push('identidad_visible.presentacion');
  }
  return { ok: faltan.length === 0 && invalidos.length === 0, faltan, invalidos };
}

/** Valida los limites propios: listas de lo que no se publica / no se contesta. */
function validar_limites(limites) {
  if (limites === undefined || limites === null) return { ok: true, valor: { no_publica: [], no_contesta: [] } };
  if (!es_objeto(limites)) return { ok: false, faltan: [], invalidos: ['limites'] };
  const no_publica = validar_lista(limites.no_publica, 'limites.no_publica');
  const no_contesta = validar_lista(limites.no_contesta, 'limites.no_contesta');
  if (!no_publica.ok || !no_contesta.ok) {
    return { ok: false, faltan: [], invalidos: [...no_publica.invalidos, ...no_contesta.invalidos] };
  }
  return { ok: true, valor: { no_publica: no_publica.valor, no_contesta: no_contesta.valor } };
}

function preparar(consulta) {
  const e = es_objeto(consulta) ? consulta : {};
  const plataforma = texto_no_vacio(e.plataforma) ? String(e.plataforma).trim().toLowerCase() : PLATAFORMA;
  const proyecto = texto_no_vacio(e.proyecto) ? String(e.proyecto).trim() : '';
  return { e, plataforma, proyecto, cuenta: padron.normalizar_cuenta(e.cuenta) };
}

/** Modo derivado de la voz: con voz declarada se opera; sin ella solo se lee. */
function modo_de(ficha) {
  if (!es_objeto(ficha)) return 'sin_ficha';
  return validar_voz(ficha.voz).ok ? 'operativa' : 'lectura';
}

/**
 * ¿Se puede operar con esta ficha? Sin ficha, no. Con ficha y sin voz, no: solo
 * se lee (y se dice por que).
 */
function puede_operar(ficha) {
  const modo = modo_de(ficha);
  if (modo === 'operativa') return { ok: true, modo, motivo: null };
  return {
    ok: false,
    modo,
    motivo: modo === 'sin_ficha' ? MOTIVOS.SIN_FICHA : MOTIVOS.SIN_VOZ,
    solo_lectura: modo === 'lectura',
    pista:
      modo === 'sin_ficha'
        ? 'no hay ficha de esta cuenta en este proyecto: no se opera'
        : 'la cuenta no tiene voz declarada por el proyecto: solo se lee'
  };
}

// ---- alta / actualizacion -------------------------------------------------

/**
 * Declara la ficha de una cuenta en un proyecto. La voz es OPCIONAL: una ficha
 * sin voz nace en modo `lectura`, y no se rellena sola.
 *
 * @param {object} estado
 * @param {object} entrada {proyecto, cuenta, aparato, identidad_visible, voz?,
 *   limites?, momento, quien, autorizacion_id, plataforma?}
 */
function declarar(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const secreto = guardia_secretos(entrada);
  if (secreto) return secreto;

  const { e, plataforma, proyecto, cuenta } = preparar(entrada);

  // El fallo de alta va PRIMERO y con su nombre: una ficha sin proyecto dueno no
  // es una ficha incompleta, es un alta mal hecha (T2).
  if (!proyecto) {
    return fallo(MOTIVOS.CUENTA_SIN_PROYECTO_DUENO, ['proyecto'], [], {
      pista: 'la ficha pertenece a un proyecto: una cuenta sin proyecto dueno es un fallo de alta'
    });
  }
  if (es_proyecto_reservado(proyecto)) {
    return fallo(MOTIVOS.CUENTA_SIN_PROYECTO_DUENO, [], ['proyecto'], {
      proyecto,
      pista: 'el puente no es dueno de ninguna cuenta: no hay ficha a su nombre'
    });
  }

  const faltan = [];
  for (const campo of ['cuenta', 'aparato', 'momento', 'quien', 'autorizacion_id']) {
    if (vacio(e[campo])) faltan.push(campo);
  }
  const invalidos = [];
  if (!faltan.includes('cuenta') && !padron.CUENTA_RE.test(cuenta)) invalidos.push('cuenta');
  if (!faltan.includes('momento') && !es_instante(e.momento)) invalidos.push('momento');
  if (!faltan.includes('quien') && !QUIENES.includes(String(e.quien).trim())) invalidos.push('quien');

  const identidad = validar_identidad(e.identidad_visible);
  faltan.push(...identidad.faltan);
  invalidos.push(...identidad.invalidos);

  // La voz, si viene, tiene que ser una voz DECLARADA. No se admite a medias ni
  // se "arregla" con una plantilla.
  let voz = null;
  if (e.voz !== undefined && e.voz !== null) {
    const v = validar_voz(e.voz);
    if (!v.ok) {
      return fallo(MOTIVOS.VOZ_INVALIDA, v.faltan, v.invalidos, {
        pista: 'la voz la declara el proyecto (tono, declarada_por y autorizacion_id); el puente no la inventa'
      });
    }
    voz = {
      tono: String(e.voz.tono).trim(),
      vocabulario: validar_lista(e.voz.vocabulario, 'vocabulario').valor,
      lo_que_nunca_dice: validar_lista(e.voz.lo_que_nunca_dice, 'lo_que_nunca_dice').valor,
      limites_de_tema: validar_lista(e.voz.limites_de_tema, 'limites_de_tema').valor,
      declarada_por: String(e.voz.declarada_por).trim(),
      autorizacion_id: String(e.voz.autorizacion_id).trim()
    };
  }

  const limites = validar_limites(e.limites);
  if (!limites.ok) return fallo(MOTIVOS.ENTRADA_INVALIDA, limites.faltan, limites.invalidos);

  if (faltan.length || invalidos.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, faltan, invalidos);

  const i = indice_de(estado, proyecto, plataforma, cuenta);
  if (i !== -1) {
    return fallo(MOTIVOS.FICHA_YA_DECLARADA, [], [], {
      ficha: clonar(estado.fichas[i]),
      pista: 'la ficha ya existe: cambiarla es `actualizar`, con su autorizacion'
    });
  }

  const momento = String(e.momento);
  const quien = String(e.quien).trim();
  const sello = sellar(
    { identidad_visible: clonar(e.identidad_visible), limites: clonar(limites.valor) },
    { proyecto, cuenta, aparato: String(e.aparato).trim(), momento, quien }
  );
  if (!sello.ok) {
    return fallo(MOTIVOS.ENTRADA_INVALIDA, sello.faltan || [], sello.invalidos || [], { causa: sello.motivo });
  }

  const ficha = {
    almacen: ALMACEN,
    ficha_id: ficha_id_de(proyecto, plataforma, cuenta),
    proyecto,
    plataforma,
    cuenta,
    identidad_visible: clonar(e.identidad_visible),
    voz,
    limites: clonar(limites.valor),
    declarada_en: momento,
    autorizacion_id: String(e.autorizacion_id).trim(),
    estado: 'vigente',
    sello: sello.sello,
    historia: []
  };

  const nuevo = clonar(estado);
  nuevo.fichas.push(ficha);
  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = momento;

  return {
    ok: true,
    estado: nuevo,
    ficha: clonar(ficha),
    modo: modo_de(ficha),
    puede_operar: modo_de(ficha) === 'operativa'
  };
}

/**
 * Cambia identidad, voz o limites. Exige autorizacion y deja paso en la historia:
 * el sello de nacimiento NO se toca. Declarar la voz por primera vez es este
 * camino, y es el unico que convierte una ficha de `lectura` en `operativa`.
 *
 * @param {object} estado
 * @param {object} entrada {proyecto, cuenta, cambio:{identidad_visible?|voz?|limites?},
 *   motivo, momento, quien, autorizacion_id, plataforma?}
 */
function actualizar(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const secreto = guardia_secretos(entrada);
  if (secreto) return secreto;

  const { e, plataforma, proyecto, cuenta } = preparar(entrada);

  if (!proyecto) {
    return fallo(MOTIVOS.CUENTA_SIN_PROYECTO_DUENO, ['proyecto'], [], {
      pista: 'la ficha pertenece a un proyecto: una cuenta sin proyecto dueno es un fallo de alta'
    });
  }

  const faltan = [];
  for (const campo of ['cuenta', 'motivo', 'momento', 'quien', 'autorizacion_id']) {
    if (vacio(e[campo])) faltan.push(campo);
  }
  const invalidos = [];
  if (!faltan.includes('cuenta') && !padron.CUENTA_RE.test(cuenta)) invalidos.push('cuenta');
  if (!faltan.includes('momento') && !es_instante(e.momento)) invalidos.push('momento');
  if (!faltan.includes('quien') && !QUIENES.includes(String(e.quien).trim())) invalidos.push('quien');
  if (faltan.length || invalidos.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, faltan, invalidos);

  const i = indice_de(estado, proyecto, plataforma, cuenta);
  if (i === -1) {
    return fallo(MOTIVOS.FICHA_INEXISTENTE, [], [], {
      cuenta,
      proyecto,
      pista: 'no se cambia una ficha que no existe: primero se declara'
    });
  }

  const cambio = es_objeto(e.cambio) ? e.cambio : null;
  if (!cambio) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['cambio'], []);
  const campos = ['identidad_visible', 'voz', 'limites'].filter((c) => cambio[c] !== undefined);
  if (campos.length === 0) {
    return fallo(MOTIVOS.ENTRADA_INVALIDA, ['cambio.identidad_visible|cambio.voz|cambio.limites'], []);
  }

  if (cambio.identidad_visible !== undefined) {
    const id = validar_identidad(cambio.identidad_visible);
    if (!id.ok) return fallo(MOTIVOS.ENTRADA_INVALIDA, id.faltan, id.invalidos);
  }
  if (cambio.voz !== undefined) {
    const v = validar_voz(cambio.voz);
    if (!v.ok) {
      return fallo(MOTIVOS.VOZ_INVALIDA, v.faltan, v.invalidos, {
        pista: 'la voz la declara el proyecto; si no viene declarada, la ficha se queda en lectura'
      });
    }
  }
  if (cambio.limites !== undefined) {
    const l = validar_limites(cambio.limites);
    if (!l.ok) return fallo(MOTIVOS.ENTRADA_INVALIDA, l.faltan, l.invalidos);
  }

  const nuevo = clonar(estado);
  const ficha = nuevo.fichas[i];
  const de = {
    identidad_visible: clonar(ficha.identidad_visible),
    voz: clonar(ficha.voz),
    limites: clonar(ficha.limites)
  };

  if (cambio.identidad_visible !== undefined) ficha.identidad_visible = clonar(cambio.identidad_visible);
  if (cambio.limites !== undefined) ficha.limites = clonar(validar_limites(cambio.limites).valor);
  if (cambio.voz !== undefined) {
    ficha.voz = {
      tono: String(cambio.voz.tono).trim(),
      vocabulario: validar_lista(cambio.voz.vocabulario, 'vocabulario').valor,
      lo_que_nunca_dice: validar_lista(cambio.voz.lo_que_nunca_dice, 'lo_que_nunca_dice').valor,
      limites_de_tema: validar_lista(cambio.voz.limites_de_tema, 'limites_de_tema').valor,
      declarada_por: String(cambio.voz.declarada_por).trim(),
      autorizacion_id: String(cambio.voz.autorizacion_id).trim()
    };
  }

  ficha.historia.push({
    secuencia: ficha.historia.length + 1,
    tipo: cambio.voz !== undefined ? 'voz_declarada' : 'actualizacion',
    campos,
    de,
    motivo: String(e.motivo).trim(),
    momento: String(e.momento),
    quien: String(e.quien).trim(),
    autorizacion_id: String(e.autorizacion_id).trim()
  });

  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = String(e.momento);

  return {
    ok: true,
    estado: nuevo,
    ficha: clonar(ficha),
    modo: modo_de(ficha),
    puede_operar: modo_de(ficha) === 'operativa',
    historia_conservada: ficha.historia.length
  };
}

// ---- lecturas -------------------------------------------------------------

/**
 * La ficha de una cuenta EN UN PROYECTO. Sin proyecto no hay lectura (la ficha no
 * se comparte); con otro proyecto no se devuelve el contenido, solo se dice que
 * la ficha es de otro proyecto.
 *
 * @param {object} estado
 * @param {{proyecto:string, cuenta:string, plataforma?:string}} consulta
 */
function leer(estado, consulta) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const { e, plataforma, proyecto, cuenta } = preparar(consulta);
  if (!cuenta) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['cuenta'], []);
  if (!proyecto) {
    return fallo(MOTIVOS.AMBITO_INCOMPLETO, ['proyecto'], [], {
      pista: 'la ficha es por cuenta y por proyecto: sin proyecto no se lee, se mezclarian dos voces'
    });
  }
  if (e.proyecto !== undefined && es_proyecto_reservado(proyecto)) {
    return fallo(MOTIVOS.CUENTA_SIN_PROYECTO_DUENO, [], ['proyecto'], { proyecto });
  }

  const i = indice_de(estado, proyecto, plataforma, cuenta);
  if (i === -1) {
    const en_otro = estado.fichas.some((f) => f && f.plataforma === plataforma && f.cuenta === cuenta);
    return {
      ok: true,
      ficha: null,
      hallada: false,
      modo: 'sin_ficha',
      proyecto,
      cuenta,
      motivo: en_otro ? MOTIVOS.FICHA_DE_OTRO_PROYECTO : null
    };
  }

  const ficha = estado.fichas[i];
  const modo = modo_de(ficha);
  return { ok: true, ficha: clonar(ficha), hallada: true, modo, puede_operar: modo === 'operativa', proyecto, cuenta };
}

/** Las reglas de voz de una cuenta (o null si no hay voz declarada). */
function voz(estado, consulta) {
  const r = leer(estado, consulta);
  if (!r.ok) return r;
  return {
    ok: true,
    voz: r.ficha && r.ficha.voz ? clonar(r.ficha.voz) : null,
    modo: r.modo,
    hallada: r.hallada
  };
}

/**
 * ¿La voz de esta ficha admite este texto? Es la puerta que usa el redactor antes
 * de devolver un borrador (N3). Sin ficha o sin voz, NO: se lee, no se responde.
 *
 * @param {object|null} ficha
 * @param {string} texto
 */
function admite(ficha, texto) {
  const op = puede_operar(ficha);
  if (!op.ok) {
    return {
      ok: false,
      motivo: op.motivo,
      modo: op.modo,
      solo_lectura: op.modo === 'lectura',
      pista: op.pista
    };
  }
  if (!texto_no_vacio(texto)) return { ok: false, motivo: MOTIVOS.TEXTO_VACIO, modo: op.modo };

  const norm = normalizar_texto(texto);
  const reglas = ficha.voz;

  for (const frase of reglas.lo_que_nunca_dice || []) {
    if (norm.includes(normalizar_texto(frase))) {
      return { ok: false, motivo: MOTIVOS.DICE_LO_QUE_NUNCA_DICE, frase, modo: op.modo };
    }
  }
  for (const tema of reglas.limites_de_tema || []) {
    if (norm.includes(normalizar_texto(tema))) {
      return { ok: false, motivo: MOTIVOS.TEMA_FUERA_DE_LIMITE, tema, modo: op.modo };
    }
  }
  for (const tema of (ficha.limites && ficha.limites.no_publica) || []) {
    if (norm.includes(normalizar_texto(tema))) {
      return { ok: false, motivo: MOTIVOS.NO_SE_PUBLICA, tema, modo: op.modo };
    }
  }
  return { ok: true, modo: op.modo, tono: reglas.tono, voz_aplicada: true };
}

/** Admision por ambito (cuenta + proyecto): lee la ficha y pasa por `admite`. */
function admitir(estado, consulta) {
  const e = es_objeto(consulta) ? consulta : {};
  const r = leer(estado, e);
  if (!r.ok) return r;
  if (!r.hallada) {
    return {
      ok: false,
      motivo: MOTIVOS.SIN_FICHA,
      modo: 'sin_ficha',
      solo_lectura: true,
      detalle: r.motivo || null
    };
  }
  return admite(r.ficha, e.texto);
}

// ---- auditoria del almacen ------------------------------------------------

/**
 * Audita el almacen ENTERO: esquema, secretos (V1), sello de cada ficha (P1),
 * ambito privado y coherencia proyecto-sello (P3), voz declarada por el proyecto
 * y una sola ficha por (proyecto, cuenta, plataforma). Un solo problema mancha el
 * almacen y no se escribe.
 */
function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, problemas: [{ ruta: '(raiz)', motivo: MOTIVOS.ESQUEMA_DESCONOCIDO }] };
  }
  for (const h of no_secretos.detectar_secreto(estado)) {
    problemas.push({ ruta: h.ruta, motivo: 'secreto', familia: h.familia });
  }

  const claves = new Set();
  estado.fichas.forEach((f, i) => {
    const ruta = `fichas[${i}]`;
    if (!es_objeto(f)) {
      problemas.push({ ruta, motivo: 'ficha_no_es_objeto' });
      return;
    }
    const c = comprobar_sello(f);
    if (!c.ok) {
      problemas.push({ ruta, motivo: 'sin_sello', faltan: c.faltan, invalidos: c.invalidos });
    } else if (String(c.sello.proyecto).trim() !== f.proyecto) {
      problemas.push({ ruta, motivo: MOTIVOS.FICHA_DE_OTRO_PROYECTO, sello: c.sello.proyecto, proyecto: f.proyecto });
    }
    if (!texto_no_vacio(f.proyecto) || es_proyecto_reservado(f.proyecto)) {
      problemas.push({ ruta: `${ruta}.proyecto`, motivo: MOTIVOS.CUENTA_SIN_PROYECTO_DUENO, valor: f.proyecto });
    }

    // P3: la ficha es estado privado de un proyecto, no saber hacer compartido.
    const clase = propiedad.exigir_privado(Object.assign({}, f, { almacen: f.almacen || ALMACEN }));
    if (!clase.ok) problemas.push({ ruta: `${ruta}.almacen`, motivo: clase.motivo, almacen: ALMACEN });

    const id = ficha_id_de(f.proyecto, f.plataforma, f.cuenta);
    if (claves.has(id)) problemas.push({ ruta, motivo: 'ficha_duplicada', ficha_id: id });
    claves.add(id);

    const idv = validar_identidad(f.identidad_visible);
    if (!idv.ok) problemas.push({ ruta: `${ruta}.identidad_visible`, motivo: 'sin_identidad_visible', faltan: idv.faltan, invalidos: idv.invalidos });

    if (f.voz !== undefined && f.voz !== null) {
      const v = validar_voz(f.voz);
      if (!v.ok) {
        problemas.push({
          ruta: `${ruta}.voz`,
          motivo: MOTIVOS.VOZ_NO_DECLARADA_POR_EL_PROYECTO,
          faltan: v.faltan,
          invalidos: v.invalidos
        });
      }
    }

    const lim = validar_limites(f.limites);
    if (!lim.ok) problemas.push({ ruta: `${ruta}.limites`, motivo: 'limites_invalidos', invalidos: lim.invalidos });

    if (f.historia !== undefined) {
      if (!Array.isArray(f.historia)) {
        problemas.push({ ruta: `${ruta}.historia`, motivo: 'historia_no_es_lista' });
      } else {
        f.historia.forEach((paso, j) => {
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

  return { ok: problemas.length === 0, problemas };
}

// ---- el borde: custodio con IO y single-writer ----------------------------

const TOPICS = Object.freeze({
  LEER: 'instagram.ficha.leer',
  DECLARAR: 'instagram.ficha.declarar',
  ACTUALIZAR: 'instagram.ficha.actualizar',
  ADMITIR: 'instagram.ficha.admitir'
});

const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');
const FICHERO = 'fichas.json';

class FichaDeCuenta extends ModuloHibridoReflejo {
  /**
   * @param {{directorio?:string, fichero?:string}} [opts]
   */
  constructor(opts = {}) {
    super();
    this.name = 'ficha-cuenta';
    this.version = '0.1.0';

    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;
    this._fichero = opts.fichero || FICHERO;
    this._ruta = path.join(this._directorio, this._fichero);

    this._estado = estado_vacio();
    this._cargado = false;
    this._ilegible = null;
    this._cola = Promise.resolve();
    this._lecturas = 0;
    this._escrituras = 0;
  }

  // ---- ciclo de vida -------------------------------------------------------

  async onLoad(context) {
    await super.onLoad(context);
    await this.cargar();
    this.logger?.info('ficha-cuenta.loaded', {
      module: this.name,
      ruta: this._ruta,
      fichas: this._estado.fichas.length,
      revision: this._estado.revision
    });
  }

  async onUnload() {
    await this._cola;
    return super.onUnload();
  }

  async cargar() {
    try {
      const crudo = await fsp.readFile(this._ruta, 'utf8');
      const datos = JSON.parse(crudo);
      if (!es_estado(datos)) {
        this._ilegible = 'esquema_desconocido';
        this._estado = estado_vacio();
      } else {
        this._estado = datos;
        this._ilegible = null;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        this._estado = estado_vacio();
        this._ilegible = null;
      } else {
        this._ilegible = err && err.code === 'EACCES' ? 'fichas_sin_permiso' : 'fichas_ilegible';
        this._estado = estado_vacio();
      }
    }
    this._cargado = true;
    return { ok: this._ilegible === null, motivo: this._ilegible, estado: this._estado };
  }

  async recargar() {
    return this.cargar();
  }

  // ---- escritura -----------------------------------------------------------

  async _escribir(estado) {
    await fsp.mkdir(this._directorio, { recursive: true });
    const temporal = `${this._ruta}.${process.pid}.tmp`;
    const contenido = `${JSON.stringify(estado, null, 2)}\n`;
    await fsp.writeFile(temporal, contenido, 'utf8');
    await fsp.rename(temporal, this._ruta);
    this._escrituras += 1;
  }

  _mutar(mutacion) {
    const siguiente = this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: 'sin_fichas', detalle: this._ilegible, ruta: this._ruta };
      }
      const r = mutacion(this._estado);
      if (!r || r.ok !== true) return r || { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA };

      // Nada se persiste sin auditar: sello (P1), secretos (V1), ambito (P3).
      const auditoria = auditar(r.estado);
      if (!auditoria.ok) {
        return {
          ok: false,
          motivo: MOTIVOS.ALMACEN_NO_AUDITADO,
          problemas: auditoria.problemas,
          guardado: false
        };
      }

      try {
        await this._escribir(r.estado);
      } catch (err) {
        return {
          ok: false,
          motivo: err && err.code === 'ENOSPC' ? 'disco_lleno' : 'no_se_pudo_guardar',
          detalle: err && err.message,
          guardado: false
        };
      }

      this._estado = r.estado;
      return r;
    });
    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  _leer(lectura) {
    const siguiente = this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: 'sin_fichas', detalle: this._ilegible, ruta: this._ruta };
      }
      this._lecturas += 1;
      return lectura(this._estado);
    });
    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  // ---- operaciones de dominio ---------------------------------------------

  declarar(entrada) {
    return this._mutar((estado) => declarar(estado, entrada));
  }

  actualizar(entrada) {
    return this._mutar((estado) => actualizar(estado, entrada));
  }

  leer(consulta) {
    return this._leer((estado) => leer(estado, consulta));
  }

  voz(consulta) {
    return this._leer((estado) => voz(estado, consulta));
  }

  admitir(consulta) {
    return this._leer((estado) => admitir(estado, consulta));
  }

  foto() {
    return JSON.parse(JSON.stringify(this._estado));
  }

  // ---- handlers del bus ----------------------------------------------------

  onLeerRequest(e) {
    return this._rpc(TOPICS.LEER, e, (d) => this.leer(d));
  }

  onDeclararRequest(e) {
    return this._rpc(TOPICS.DECLARAR, e, (d) => this.declarar(d));
  }

  onActualizarRequest(e) {
    return this._rpc(TOPICS.ACTUALIZAR, e, (d) => this.actualizar(d));
  }

  onAdmitirRequest(e) {
    return this._rpc(TOPICS.ADMITIR, e, (d) => this.admitir(d));
  }

  /** Un rechazo sale por `.failed`, nunca como response con ok:false. */
  async _rpc(topic, event, fn) {
    const d = (event && event.data) || event || {};
    const request_id = d.request_id;
    let r;
    try {
      r = await fn(d);
    } catch (err) {
      this.logger?.error(`${this.name}.rpc.error`, { topic, error: err && err.message });
      r = { ok: false, motivo: 'error_interno', detalle: err && err.message };
    }

    if (r && r.ok === true) {
      const { ok, estado, ...datos } = r;
      const payload = Object.assign({ request_id, ok: true }, datos);
      this.eventBus?.publish(`${topic}.response`, payload);
      return payload;
    }

    const fallo_rpc = {
      request_id,
      ok: false,
      motivo: (r && r.motivo) || MOTIVOS.ENTRADA_INVALIDA,
      faltan: (r && r.faltan) || [],
      invalidos: (r && r.invalidos) || []
    };
    for (const campo of ['rutas', 'familias', 'problemas', 'detalle', 'pista', 'ficha', 'modo', 'solo_lectura', 'tema', 'frase']) {
      if (r && r[campo] !== undefined) fallo_rpc[campo] = r[campo];
    }
    this.eventBus?.publish(`${topic}.failed`, fallo_rpc);
    return fallo_rpc;
  }
}

function crear(opts = {}) {
  return new FichaDeCuenta(opts);
}

module.exports = {
  ESQUEMA,
  ALMACEN,
  PLATAFORMA,
  MODOS,
  DECLARANTES_DE_VOZ,
  PROYECTOS_RESERVADOS,
  TIPOS_HISTORIA,
  MOTIVOS,
  TOPICS,
  FICHERO,
  estado_vacio,
  es_estado,
  ficha_id_de,
  validar_voz,
  validar_identidad,
  validar_limites,
  modo_de,
  puede_operar,
  declarar,
  actualizar,
  leer,
  voz,
  admite,
  admitir,
  auditar,
  FichaDeCuenta,
  crear
};

// Vista "clase" del plano (cuentas/ficha.js#ficha).
module.exports.Ficha = Object.freeze({
  declarar,
  actualizar,
  leer,
  voz,
  admite,
  auditar,
  puede_operar
});
