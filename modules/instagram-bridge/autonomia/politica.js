'use strict';

/**
 * politica — Q6 · PoliticaDeAutonomia · REFLEJO. LA SINTESIS.
 *
 * Una sola funcion (`decidir`) y un solo veredicto por accion:
 *
 *   ejecutar   se hace ahora (con ventana de arrepentimiento si es irreversible)
 *   borrador   se prepara y se queda esperando a una persona
 *   permiso    hay que preguntar: sin un si vigente no se toca el mundo
 *   no         no se hace, y no hay nada que preguntar
 *
 * Recorre SIEMPRE los mismos cuatro inputs y en el mismo orden, y va dejando el
 * `porque` escrito para que el veredicto se pueda discutir:
 *
 *   casilla -> rol -> nivel -> historial -> autorizacion -> ventana
 *
 * POR QUE ESE ORDEN:
 *   - La casilla va primero porque es el unico dato que no puede cambiar nadie:
 *     si la accion no esta en la tabla, no hay nada mas que hablar. Ni el rol,
 *     ni el nivel, ni un permiso del dueno resucitan una accion sin casilla.
 *   - El rol va segundo porque dice QUE clase de actor es: el sistema observa y
 *     no toca el mundo, pase lo que pase despues.
 *   - El nivel va tercero porque es la autonomia DECLARADA para esa cuenta.
 *   - El historial va cuarto, y aqui esta la regla dura del bloque: **el
 *     historial INFORMA pero NO AUTORIZA.**
 *   - La autorizacion va quinta: es el unico input que puede convertir un
 *     `permiso` en `ejecutar`, y solo si el nivel ya permitia preguntar.
 *   - La ventana va ultima porque no decide: solo dice cuanto rato hay para
 *     deshacer lo que ya se decidio hacer.
 *
 * LA REGLA DURA, EN DETALLE. El historial entra en la decision por UNA sola
 * puerta: `presion_del_historial()` devuelve 0 o 1, y ese 1 solo puede BAJAR un
 * escalon (`ejecutar` -> `permiso`). No hay ninguna rama que suba por historial,
 * ni que convierta `borrador` en `permiso`, ni que rellene el hueco de una
 * autorizacion. Si el historial pudiera autorizar, el sistema se estaria
 * concediendo permisos a si mismo: bastaria con portarse bien unas cuantas veces
 * para dejar de pedir permiso. Un buen historial no es un permiso; es, como
 * mucho, la ausencia de un motivo para desconfiar.
 *
 * Tampoco sirve disfrazar el historial de permiso: si llega un asiento que dice
 * `autoriza: true`, se ignora y se deja escrito en el `porque` que se ignoro.
 *
 * Puro: sin IO, sin reloj, sin estado global. La autorizacion que entra aqui
 * tiene que venir YA RESUELTA del registro (Q5); este fichero no la busca, solo
 * comprueba que sirve para ESTA accion.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, QUIENES } = require('../core/formas');
const casillas = require('../core/casillas');
const nivel = require('./nivel');
const ritmo = require('../core/ritmo');
const autorizaciones = require('./autorizaciones');

const DICTAMENES = Object.freeze(['ejecutar', 'borrador', 'permiso', 'no']);
const ROLES = Object.freeze(['dueno', 'agente', 'sistema']);

const MOTIVOS = Object.freeze({
  AMBITO_INCOMPLETO: 'ambito_incompleto',
  ENTRADA_INVALIDA: 'entrada_invalida',
  ACCION_SIN_CASILLA: 'accion_sin_casilla',
  ROL_DESCONOCIDO: 'rol_desconocido',
  SISTEMA_NO_TOCA_EL_MUNDO: 'el_sistema_no_toca_el_mundo',
  SISTEMA_SOLO_OBSERVA: 'rol_sistema_solo_observa',
  ACCION_INOCUA: 'accion_inocua',
  SIN_NIVEL_DECLARADO: 'sin_nivel_declarado',
  NIVEL_BORRADOR: 'nivel_borrador',
  NIVEL_PIDE_PERMISO: 'nivel_pide_permiso',
  NIVEL_EJECUTA: 'nivel_ejecuta',
  HISTORIAL_PIDE_CAUTELA: 'historial_pide_cautela',
  HISTORIAL_NO_AUTORIZA: 'el_historial_no_autoriza',
  FALTA_AUTORIZACION: 'falta_autorizacion',
  AUTORIZACION_PRESENTE: 'autorizacion_presente',
  AUTORIZACION_SIN_PROCEDENCIA: 'autorizacion_sin_procedencia',
  AUTORIZACION_POR_VIA_INVALIDA: 'autorizacion_por_via_invalida',
  AUTORIZACION_SIN_PERSONA: 'autorizacion_sin_persona',
  PERMISO_DE_OTRA_ACCION: 'permiso_de_otra_accion',
  PERMISO_DE_OTRA_CUENTA: 'permiso_de_otra_cuenta',
  PERMISO_DE_OTRO_PROYECTO: 'permiso_de_otro_proyecto',
  PERMISO_DE_OTRO_ROL: 'permiso_de_otro_rol',
  PERMISO_DE_OTRA_CASILLA: 'permiso_de_otra_casilla',
  HUELLA_NO_CORRESPONDE: 'huella_no_corresponde',
  PERMISO_YA_GASTADO: 'permiso_ya_gastado',
  PERMISO_CADUCADO: 'permiso_caducado',
  PERMISO_DE_NIVEL_CONSERVADOR: 'permiso_de_nivel_conservador'
});

// Tipos de asiento del historial que aprietan. `cancelacion` NO esta: una
// cancelacion a tiempo es un exito del sistema (Q4), no un fallo.
const PESO_DEL_HISTORIAL = Object.freeze({
  fallo: 1,
  reversion: 1,
  rechazo: 1,
  castigo_dudoso: 1,
  castigo: 2,
  castigo_firme: 2
});

// Un historial viejo no aprieta: lo que paso hace un mes no dice nada del rato
// de ahora. Sin `momento` no se puede envejecer, y entonces se cuenta todo.
const VENTANA_HISTORIAL_HORAS = 24;

// ---------------------------------------------------------------------------
// historial (informa, no autoriza)
// ---------------------------------------------------------------------------

/**
 * Cuanta cautela pide el historial. Devuelve `presion` 0 o 1, NUNCA negativa:
 * no existe un valor que suba la autonomia. `peso` va aparte para el informe.
 *
 * @param {*} historial
 * @param {string} [momento]
 */
function presion_del_historial(historial, momento) {
  const motivos = [];
  const ignorados = [];
  if (historial === undefined || historial === null) {
    return { presion: 0, peso: 0, motivos, ignorados, asientos: 0 };
  }
  if (!Array.isArray(historial)) {
    // Un historial que no es una lista (un objeto que "sugiere" un nivel, por
    // ejemplo) no es historial: se ignora entero.
    return { presion: 0, peso: 0, motivos, ignorados: ['historial_no_es_lista'], asientos: 0 };
  }

  let peso = 0;
  let asientos = 0;
  for (const a of historial) {
    if (!es_objeto(a)) continue;
    asientos += 1;

    // Un asiento que se presenta como permiso no es historial: es un intento.
    if (a.autoriza === true || a.permiso === true || String(a.tipo) === 'autorizacion') {
      ignorados.push(MOTIVOS.HISTORIAL_NO_AUTORIZA);
      continue;
    }

    const tipo = String(a.tipo);
    const p = PESO_DEL_HISTORIAL[tipo];
    if (p === undefined) continue; // 'exito', 'tolerado', 'cancelacion': no aprietan

    if (texto_no_vacio(momento) && es_instante(a.momento)) {
      const minutos = ritmo.minutos_entre(a.momento, momento);
      if (Number.isFinite(minutos) && minutos > VENTANA_HISTORIAL_HORAS * 60) continue;
    }
    peso += p;
    motivos.push(tipo);
  }

  return {
    presion: peso > 0 ? 1 : 0,
    peso,
    motivos,
    ignorados,
    asientos,
    ventana_horas: VENTANA_HISTORIAL_HORAS
  };
}

// ---------------------------------------------------------------------------
// autorizacion
// ---------------------------------------------------------------------------

/**
 * Comprueba que la autorizacion sirve para ESTA accion, ESTA cuenta y ESTE rol.
 * Cualquier desajuste es un `no`: presentar un permiso que no es tuyo no es una
 * duda, es un intento.
 */
function validar_autorizacion(aut, ambito, casilla, nivel_efectivo, momento) {
  if (!es_objeto(aut)) return { ok: false, motivo: MOTIVOS.FALTA_AUTORIZACION };

  if (String(aut.procedencia) !== 'registro_autorizaciones') {
    return { ok: false, motivo: MOTIVOS.AUTORIZACION_SIN_PROCEDENCIA, procedencia: aut.procedencia === undefined ? null : aut.procedencia };
  }
  if (!autorizaciones.VIA_PERMITIDA.includes(String(aut.via))) {
    return { ok: false, motivo: MOTIVOS.AUTORIZACION_POR_VIA_INVALIDA, via: aut.via === undefined ? null : aut.via };
  }
  if (String(aut.quien) !== 'dueno' || !QUIENES.includes(String(aut.quien))) {
    return { ok: false, motivo: MOTIVOS.AUTORIZACION_SIN_PERSONA, quien: aut.quien === undefined ? null : aut.quien };
  }

  const cuenta = casillas.normalizar_cuenta(ambito.cuenta);
  const proyecto = String(ambito.proyecto).trim();
  const rol = String(ambito.rol).trim();

  if (String(aut.accion) !== ambito.accion) {
    return { ok: false, motivo: MOTIVOS.PERMISO_DE_OTRA_ACCION, autorizada: aut.accion, pedida: ambito.accion };
  }
  if (casillas.normalizar_cuenta(aut.cuenta) !== cuenta) {
    return { ok: false, motivo: MOTIVOS.PERMISO_DE_OTRA_CUENTA, autorizada: aut.cuenta, pedida: cuenta };
  }
  if (String(aut.proyecto) !== proyecto) {
    return { ok: false, motivo: MOTIVOS.PERMISO_DE_OTRO_PROYECTO, autorizado: aut.proyecto, pedido: proyecto };
  }
  if (String(aut.rol) !== rol) {
    return { ok: false, motivo: MOTIVOS.PERMISO_DE_OTRO_ROL, autorizado: aut.rol, pedido: rol };
  }

  // La casilla VIGENTE manda: si la accion cambio de casilla desde que se
  // concedio el permiso, el permiso viejo ya no vale para la accion de hoy.
  const guardada = es_objeto(aut.casilla) ? aut.casilla : {};
  if (guardada.reversibilidad !== casilla.reversibilidad || guardada.visibilidad !== casilla.visibilidad) {
    return {
      ok: false,
      motivo: MOTIVOS.PERMISO_DE_OTRA_CASILLA,
      autorizada: { reversibilidad: guardada.reversibilidad, visibilidad: guardada.visibilidad },
      vigente: { reversibilidad: casilla.reversibilidad, visibilidad: casilla.visibilidad }
    };
  }

  const huella = casillas.huella({ proyecto, cuenta, accion: ambito.accion, rol });
  if (!huella || huella !== aut.huella) {
    return { ok: false, motivo: MOTIVOS.HUELLA_NO_CORRESPONDE, calculada: huella, autorizada: aut.huella === undefined ? null : aut.huella };
  }

  if (aut.consumida === true || aut.consumida_en !== null && aut.consumida_en !== undefined) {
    return { ok: false, motivo: MOTIVOS.PERMISO_YA_GASTADO, consumida_en: aut.consumida_en === undefined ? null : aut.consumida_en };
  }

  if (!es_instante(momento)) {
    // Sin momento no se puede decir que el permiso este vivo. Fail closed.
    return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['momento'] };
  }
  if (!es_instante(aut.caduca_en) || ritmo.antes_de(aut.caduca_en, momento)) {
    return { ok: false, motivo: MOTIVOS.PERMISO_CADUCADO, caduca_en: aut.caduca_en === undefined ? null : aut.caduca_en };
  }

  if (!['permiso', 'ejecutar'].includes(String(aut.nivel_al_conceder))) {
    return { ok: false, motivo: MOTIVOS.PERMISO_DE_NIVEL_CONSERVADOR, nivel_al_conceder: aut.nivel_al_conceder === undefined ? null : aut.nivel_al_conceder };
  }

  // El nivel de HOY no puede ser mas conservador que el que permitia preguntar.
  // Un permiso concedido cuando la cuenta podia preguntar no se usa si la cuenta
  // ha vuelto a `borrador`: primero se vuelve a declarar la autonomia.
  if (nivel_efectivo === nivel.CONSERVADOR) {
    return { ok: false, motivo: MOTIVOS.PERMISO_DE_NIVEL_CONSERVADOR, nivel_efectivo };
  }

  return { ok: true, autorizacion_id: aut.autorizacion_id === undefined ? null : aut.autorizacion_id };
}

// ---------------------------------------------------------------------------
// decidir
// ---------------------------------------------------------------------------

/**
 * El veredicto. Ver la cabecera para el orden y el porque.
 *
 * @param {{proyecto:string, cuenta:string, rol:'dueno'|'agente'|'sistema',
 *          accion:string, nivel?:*, declaraciones?:*, historial?:*,
 *          autorizacion?:object, momento:string}} peticion
 */
function decidir(peticion) {
  const p = es_objeto(peticion) ? peticion : {};
  const porque = [];
  const anota = (paso, resultado, motivo) => porque.push({ paso, resultado, motivo });

  const no = (motivo, extra) => {
    anota('veredicto', 'no', motivo);
    return Object.assign({
      ok: true,
      dictamen: 'no',
      motivo,
      porque,
      exige_ventana: false,
      ventana_segundos: 0
    }, extra || {});
  };

  // ---- 0 · ambito -------------------------------------------------------
  if (!texto_no_vacio(p.proyecto) || !texto_no_vacio(p.cuenta)) {
    return no(MOTIVOS.AMBITO_INCOMPLETO, { faltan: ['proyecto', 'cuenta'].filter((c) => !texto_no_vacio(p[c])) });
  }
  const ambito = {
    proyecto: String(p.proyecto).trim(),
    cuenta: casillas.normalizar_cuenta(p.cuenta),
    rol: texto_no_vacio(p.rol) ? String(p.rol).trim() : null,
    accion: texto_no_vacio(p.accion) ? String(p.accion).trim() : null
  };

  // ---- 1 · casilla ------------------------------------------------------
  const v = casillas.validar({ accion: p.accion, casilla: p.casilla });
  if (!v.ok) {
    anota('casilla', 'sin_casilla', v.motivo);
    return no(v.motivo, { accion: ambito.accion });
  }
  const casilla = v.casilla;
  anota('casilla', casilla.reversibilidad, casilla.visibilidad);

  // ---- 2 · rol ----------------------------------------------------------
  if (!ROLES.includes(String(p.rol))) {
    anota('rol', 'desconocido', p.rol === undefined ? null : p.rol);
    return no(MOTIVOS.ROL_DESCONOCIDO, { accion: v.accion, casilla });
  }
  const rol = String(p.rol);
  const inocua = casilla.reversibilidad === 'reversible' && casilla.visibilidad === 'privada';
  anota('rol', rol, null);

  // ---- 3 · nivel --------------------------------------------------------
  const declaracion = p.nivel !== undefined ? p.nivel : p.declaraciones;
  const n = nivel.resolver(declaracion, { cuenta: ambito.cuenta, proyecto: ambito.proyecto, momento: p.momento });
  anota('nivel', n.nivel, n.origen + (n.motivo ? `:${n.motivo}` : ''));

  let dictamen;
  let motivo;

  if (rol === 'sistema') {
    // El sistema observa. No publica, no comenta, no firma: si pudiera, no
    // haria falta el dueno.
    if (!inocua) {
      return no(MOTIVOS.SISTEMA_NO_TOCA_EL_MUNDO, { accion: v.accion, casilla, nivel: n.nivel, rol });
    }
    dictamen = 'ejecutar';
    motivo = MOTIVOS.SISTEMA_SOLO_OBSERVA;
  } else if (inocua) {
    // Observar no cambia nada: se permite incluso en el nivel mas conservador.
    dictamen = 'ejecutar';
    motivo = MOTIVOS.ACCION_INOCUA;
  } else if (n.nivel === 'borrador') {
    dictamen = 'borrador';
    motivo = n.origen === 'sin_declarar' ? MOTIVOS.SIN_NIVEL_DECLARADO : MOTIVOS.NIVEL_BORRADOR;
  } else if (n.nivel === 'permiso') {
    dictamen = 'permiso';
    motivo = MOTIVOS.NIVEL_PIDE_PERMISO;
  } else {
    dictamen = 'ejecutar';
    motivo = MOTIVOS.NIVEL_EJECUTA;
  }

  // ---- 4 · historial: solo puede bajar --------------------------------
  const h = presion_del_historial(p.historial, p.momento);
  if (h.ignorados.length > 0) {
    anota('historial', 'ignorado', MOTIVOS.HISTORIAL_NO_AUTORIZA);
  }
  if (dictamen === 'ejecutar' && h.presion > 0 && !inocua) {
    // Un escalon abajo y nada mas. El historial no puede llevar a `borrador`:
    // eso seria dejar que el pasado decida la autonomia declarada por el dueno.
    dictamen = 'permiso';
    motivo = MOTIVOS.HISTORIAL_PIDE_CAUTELA;
    anota('historial', 'baja_un_escalon', MOTIVOS.HISTORIAL_PIDE_CAUTELA);
  } else {
    anota('historial', 'sin_presion', null);
  }

  // ---- 5 · autorizacion ------------------------------------------------
  let autorizacion_id = null;
  if (dictamen === 'permiso') {
    if (p.autorizacion === undefined || p.autorizacion === null) {
      anota('autorizacion', 'ninguna', MOTIVOS.FALTA_AUTORIZACION);
      // se queda en `permiso`: el veredicto dice exactamente lo que falta
    } else {
      const a = validar_autorizacion(p.autorizacion, { ...ambito, accion: v.accion }, casilla, n.nivel, p.momento);
      if (!a.ok) {
        anota('autorizacion', 'invalida', a.motivo);
        const detalle = Object.assign({}, a);
        delete detalle.ok;
        delete detalle.motivo;
        return no(a.motivo, {
          accion: v.accion,
          casilla,
          nivel: n.nivel,
          rol,
          autorizacion: detalle
        });
      }
      dictamen = 'ejecutar';
      motivo = MOTIVOS.AUTORIZACION_PRESENTE;
      autorizacion_id = a.autorizacion_id;
      anota('autorizacion', 'valida', MOTIVOS.AUTORIZACION_PRESENTE);
    }
  } else {
    anota('autorizacion', 'no_hace_falta', null);
  }

  // ---- 6 · ventana -----------------------------------------------------
  const exige_ventana = dictamen === 'ejecutar' && casilla.reversibilidad === 'irreversible';
  anota('ventana', exige_ventana ? 'exigida' : 'no_exigida', exige_ventana ? String(casilla.ventana_segundos) : null);

  anota('veredicto', dictamen, motivo);

  return {
    ok: true,
    dictamen,
    motivo,
    accion: v.accion,
    rol,
    proyecto: ambito.proyecto,
    cuenta: ambito.cuenta,
    casilla,
    nivel: n.nivel,
    nivel_origen: n.origen,
    nivel_declarado: n.declarado === undefined ? null : n.declarado,
    inocua,
    presion_del_historial: h.presion,
    historial: { peso: h.peso, motivos: h.motivos.slice(), asientos: h.asientos, ignorados: h.ignorados.slice() },
    autorizacion_id,
    exige_ventana,
    ventana_segundos: exige_ventana ? casilla.ventana_segundos : 0,
    porque
  };
}

/** Azucar: ¿el veredicto permite tocar el mundo ahora mismo? */
function puede_ejecutar(peticion) {
  return decidir(peticion).dictamen === 'ejecutar';
}

function describir() {
  return {
    dictamenes: DICTAMENES.slice(),
    roles: ROLES.slice(),
    orden: ['casilla', 'rol', 'nivel', 'historial', 'autorizacion', 'ventana'],
    regla: 'el historial informa pero no autoriza'
  };
}

module.exports = {
  MOTIVOS,
  DICTAMENES,
  ROLES,
  PESO_DEL_HISTORIAL,
  decidir,
  puede_ejecutar,
  presion_del_historial,
  validar_autorizacion,
  describir
};

module.exports.PoliticaDeAutonomia = Object.freeze({
  DICTAMENES,
  ROLES,
  decidir,
  puede_ejecutar,
  presion_del_historial,
  validar_autorizacion
});
