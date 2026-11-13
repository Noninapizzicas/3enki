'use strict';

/**
 * regulador — G6 · ReguladorDePaso · REFLEJO.
 *
 * La sintesis. Recorre los cinco inputs EN ORDEN FIJO y emite un veredicto con
 * su razon. No calcula nada nuevo: pregunta a G1 cuanto cuesta, a G5 con que
 * margen se cuenta, a G2 si hay castigo, a G3/G4 si es el turno. Su valor es el
 * ORDEN y la HONESTIDAD del resultado: siempre dice que paso miro primero.
 *
 * ---- EL ORDEN, Y POR QUE ESTA EN ESE ORDEN ----
 *
 *   1 · TECHO  (G1 + G5)   El presupuesto que no se negocia. Si la cuenta ya
 *      gasto lo que puede gastar en la ventana, nada de lo que venga despues
 *      importa. Va primero porque es el unico veto que no depende de nadie:
 *      ni de la plataforma, ni del dueno, ni del agente. Es el que sigue siendo
 *      verdad a las once de la noche igual que a las nueve.
 *
 *   2 · CASTIGO  (G2)   La plataforma manda sobre la prisa del dueno. Va antes
 *      del turno a proposito: si hay castigo, el turno da igual, y ademas el
 *      castigo TIENE FIN, asi que conviene decirlo cuanto antes en vez de
 *      hacer esperar al dueno detras de una cuenta que ya esta bloqueada.
 *
 *   3 · TURNO  (G3 + G4)   Solo se actua si la cuenta esta libre y el trabajo
 *      es el que toca. Se mira despues del castigo para no llamar "turno" a lo
 *      que en realidad es una cuenta parada: el motivo que se publica tiene que
 *      ser el de mas arriba.
 *
 *   4 · ESPERA  (G1)   La pausa minima entre acciones. Va la ultima de las
 *      comprobaciones duras porque es la mas blanda: es lo unico que se puede
 *      acortar cuando las tres de arriba ya han dicho que si, y es lo unico que
 *      el castigo dudoso alarga.
 *
 *   5 · VEREDICTO   No es una comprobacion: es la sintesis. Se emite al final
 *      porque tiene que poder citar el input que decidio (`porque`), y porque
 *      solo entonces se sabe si hay algo que vetar.
 *
 * ---- DOS REGLAS QUE NO SE NEGOCIAN ----
 *
 *   a) NINGUNA PRESION PUEDE VETAR PARA SIEMPRE. Todo veredicto que no sea
 *      `seguir` lleva `hasta` (un instante) y `fin_declarado` (de donde sale
 *      ese fin: la senal, el techo, el turno, la espera, o un defecto del
 *      puente). Y hay un TOPE duro de 24 h: si algo pide mas, se recorta y se
 *      dice. Un `parar` sin fecha es una cuenta abandonada, no una cuenta
 *      cuidada.
 *
 *   b) SOLO LA PLATAFORMA PARA. `parar` se reserva para el castigo FIRME (G2).
 *      El techo agotado, la cuenta ocupada, el turno ajeno y la espera se
 *      ESPERAN: tienen fin conocido y se reanudan solos. Una senal DUDOSA baja
 *      el ritmo (mitad de presupuesto, doble de espera) y NUNCA para.
 *
 * Puro: sin IO, sin reloj, sin estado. El momento entra por parametro.
 */

const { es_objeto, es_instante, texto_no_vacio } = require('../core/formas');
const ritmo = require('../core/ritmo');
const castigoPieza = require('./castigo');

// El orden es el contrato de esta pieza: se exporta para que un test (o el
// dueno leyendo un informe) pueda comprobarlo sin leer el codigo.
const ORDEN = Object.freeze(['techo', 'castigo', 'turno', 'espera', 'veredicto']);

const DECISIONES = Object.freeze(['seguir', 'esperar', 'parar']);

// Razones. `parar` tiene UNA; el resto son esperas con su fin.
const RAZONES = Object.freeze({
  TECHO_AGOTADO: 'techo_agotado',
  CASTIGO_FIRME: 'castigo_firme',
  CASTIGO_DUDOSO: 'castigo_dudoso',
  CUENTA_OCUPADA: 'cuenta_ocupada',
  NO_ES_SU_TURNO: 'no_es_su_turno',
  EN_ESPERA: 'en_espera',
  TURNO_LIBRE: 'turno_libre'
});

// Fin por defecto de cada veto cuando el input no lo declara. NO es el mismo
// para todos: una cuenta ocupada no puede vetar un dia entero.
const FIN_POR_DEFECTO = Object.freeze({
  techo: 24 * 60,  // minutos hasta que se repone el techo
  castigo: 24 * 60,
  turno: 30,       // minutos hasta que el que esta en curso suelta la cuenta
  espera: 60
});

// Tope duro: nada veta mas de un dia. Si un input pide mas, se recorta y se dice.
const TOPE_HORAS = 24;
const TOPE_MINUTOS = TOPE_HORAS * 60;

// Cuanto recorta una senal dudosa: mitad de presupuesto y doble de espera.
const FACTOR_DUDOSO = 0.5;
const FACTOR_ESPERA_DUDOSA = 2;

const CODIGOS = Object.freeze({
  SIN_MOMENTO: 'sin_momento',
  ACCION_DESCONOCIDA: 'accion_desconocida',
  ENTRADA_INVALIDA: 'entrada_invalida'
});

const CLASES_CASTIGO = castigoPieza.CLASES;

// ---- normalizacion de entradas -------------------------------------------

function _numero(valor, porDefecto = null) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

/**
 * Normaliza la salida de G2. Una clase desconocida se lee como DUDOSA: fallar
 * hacia el lado del ritmo es el unico lado seguro.
 */
function normalizar_castigo(castigo, momento) {
  if (!es_objeto(castigo)) return { clase: 'ausente', familia: 'sin_senal', fin: null, fin_origen: null };
  const clase = CLASES_CASTIGO.includes(String(castigo.clase)) ? String(castigo.clase) : 'dudosa';
  const fin = es_instante(castigo.fin) ? castigo.fin
    : (clase === 'ausente' ? null : ritmo.desplazar(momento, (castigoPieza.FIN_POR_DEFECTO_HORAS[clase] || 6) * 60));
  return {
    clase,
    familia: texto_no_vacio(castigo.familia) ? String(castigo.familia) : null,
    fin,
    fin_origen: texto_no_vacio(castigo.fin_origen) ? String(castigo.fin_origen) : (castigo.fin ? 'senal' : 'por_defecto')
  };
}

function normalizar_turno(cola) {
  const c = es_objeto(cola) ? cola : {};
  return {
    en_curso: texto_no_vacio(c.en_curso) ? String(c.en_curso) : null,
    adelanta: texto_no_vacio(c.adelanta) ? String(c.adelanta) : null,
    hasta: es_instante(c.hasta) ? c.hasta : null
  };
}

// Que fin por defecto le toca a cada razon. No es el mismo para todo: una
// cuenta ocupada no puede vetar lo que vetaria un castigo de la plataforma.
const FIN_POR_DEFECTO_DE_RAZON = Object.freeze({
  [RAZONES.TECHO_AGOTADO]: 'techo',
  [RAZONES.CASTIGO_FIRME]: 'castigo',
  [RAZONES.CASTIGO_DUDOSO]: 'castigo',
  [RAZONES.CUENTA_OCUPADA]: 'turno',
  [RAZONES.NO_ES_SU_TURNO]: 'turno',
  [RAZONES.EN_ESPERA]: 'espera'
});

/**
 * Recorta el fin al tope del puente y dice de donde viene. Sin esto, un input
 * con "hasta dentro de un ano" seria un veto eterno con buena letra.
 */
function _acotar(hasta, fin_declarado, momento, razon) {
  const tope = ritmo.desplazar(momento, TOPE_MINUTOS);
  if (!es_instante(hasta)) {
    // Ni siquiera el "no hay fin" puede quedar sin fin: se pone el de su razon.
    const familia = FIN_POR_DEFECTO_DE_RAZON[razon] || 'techo';
    const minutos = FIN_POR_DEFECTO[familia] || TOPE_MINUTOS;
    return { hasta: ritmo.desplazar(momento, minutos), fin_declarado: 'por_defecto', recortado: true };
  }
  if (ritmo.antes_de(tope, hasta)) return { hasta: tope, fin_declarado: 'tope', recortado: true };
  // Un fin anterior al propio momento no veta nada: se queda en el acto.
  if (ritmo.antes_de(hasta, momento)) return { hasta: momento, fin_declarado, recortado: true };
  return { hasta, fin_declarado, recortado: false };
}

// ---- la sintesis ---------------------------------------------------------

/**
 * Decide el siguiente paso de UNA cuenta.
 *
 * @param {object} entrada
 * @param {string}  entrada.momento        instante ISO del acto (obligatorio)
 * @param {string}  [entrada.accion]       tipo de accion a hacer (G1)
 * @param {object}  [entrada.trabajo]      trabajo propuesto (si no hay `accion`)
 * @param {number}  [entrada.conservaduria] 0..100 (G5); sin dato = maximo conservador
 * @param {number}  [entrada.gastado]      consumo ya hecho en la ventana
 * @param {number}  [entrada.techo]        techo explicito (si no, el del perfil)
 * @param {string}  [entrada.techo_hasta]  cuando se repone el techo
 * @param {object}  [entrada.castigo]      salida de G2: {clase, fin, fin_origen}
 * @param {object}  [entrada.cola]         {en_curso, adelanta, hasta} de G3/G4
 * @param {string}  [entrada.ultima_accion_en] instante de la ultima accion de la cuenta
 * @param {string}  [entrada.espera_hasta] fin explicito de la espera, si se conoce
 * @returns {object} veredicto
 */
function decidir(entrada) {
  const e = es_objeto(entrada) ? entrada : {};
  const porque = [];

  const momento = es_instante(e.momento) ? e.momento : null;
  if (!momento) {
    return {
      ok: false,
      motivo: CODIGOS.SIN_MOMENTO,
      faltan: ['momento'],
      detalle: 'sin momento no se puede declarar un fin, y un veto sin fin es un veto eterno',
      orden: ORDEN
    };
  }

  const accion = texto_no_vacio(e.accion) ? String(e.accion)
    : (es_objeto(e.trabajo) && texto_no_vacio(e.trabajo.accion) ? String(e.trabajo.accion) : null);
  const coste = ritmo.coste_de(accion);
  if (coste === null) {
    return {
      ok: false,
      motivo: CODIGOS.ACCION_DESCONOCIDA,
      invalidos: ['accion'],
      accion,
      acciones: ritmo.ACCIONES.slice(),
      detalle: 'una accion sin precio (G1) no se puede regular: no se adivina el coste',
      orden: ORDEN
    };
  }

  // ---- contexto ----
  const conservaduria = e.conservaduria === undefined ? ritmo.CONSERVADURIA_MAXIMA : e.conservaduria;
  const perfil = ritmo.perfil(conservaduria);
  const techo = _numero(e.techo, perfil.techo_diario);
  const gastado = _numero(e.gastado, 0);
  const restante_bruto = techo - gastado;
  const castigo = normalizar_castigo(e.castigo, momento);
  const turno = normalizar_turno(e.cola);

  // Los vetos se recogen en orden; luego se elige el MAS DURO (el firme manda)
  // y, entre iguales, el primero de la lista. Asi el orden fijo decide los
  // empates sin que un techo agotado pueda tapar un castigo de la plataforma.
  const vetos = [];
  let restante = restante_bruto;
  let factor_espera = 1;
  let bajado = false;

  // =========================================================================
  // 1 · TECHO — ¿cabe en el presupuesto de la ventana?
  // =========================================================================
  if (coste > restante_bruto) {
    const fin = e.techo_hasta;
    vetos.push({
      razon: RAZONES.TECHO_AGOTADO,
      hasta: fin,
      fin_declarado: es_instante(fin) ? 'techo' : 'por_defecto',
      detalle: `coste ${coste} > restante ${restante_bruto} (techo ${techo}, gastado ${gastado})`
    });
    porque.push({
      paso: 'techo',
      resultado: 'agota',
      detalle: `no cabe: ${coste} > ${restante_bruto} del perfil ${perfil.nombre}`
    });
  } else {
    porque.push({
      paso: 'techo',
      resultado: 'pasa',
      detalle: `cabe: ${coste} <= ${restante_bruto} del perfil ${perfil.nombre} (conservaduria ${perfil.conservaduria})`
    });
  }

  // =========================================================================
  // 2 · CASTIGO — la plataforma manda sobre la prisa del dueno
  // =========================================================================
  if (castigo.clase === 'firme') {
    vetos.push({
      razon: RAZONES.CASTIGO_FIRME,
      hasta: castigo.fin,
      fin_declarado: castigo.fin_origen || 'por_defecto',
      detalle: `senal firme (${castigo.familia || 'sin familia'}); se para hasta ${castigo.fin}`
    });
    porque.push({ paso: 'castigo', resultado: 'para', detalle: `castigo firme: ${castigo.familia || 'sin familia'}` });
  } else if (castigo.clase === 'dudosa') {
    // Baja el ritmo: mitad de presupuesto y doble de espera. NUNCA para.
    bajado = true;
    factor_espera = FACTOR_ESPERA_DUDOSA;
    const recortado = Math.floor(Math.max(0, restante_bruto) * FACTOR_DUDOSO);
    const cabe_bruto = coste <= restante_bruto;
    if (!cabe_bruto || coste > recortado) {
      vetos.push({
        razon: RAZONES.CASTIGO_DUDOSO,
        hasta: castigo.fin,
        fin_declarado: castigo.fin_origen || 'por_defecto',
        detalle: `senal dudosa: presupuesto util ${recortado} < coste ${coste}; se espera (no se para)`
      });
      porque.push({
        paso: 'castigo',
        resultado: 'baja',
        detalle: `dudosa: presupuesto util ${recortado} < coste ${coste}; se espera hasta ${castigo.fin}, no se para`
      });
    } else {
      porque.push({
        paso: 'castigo',
        resultado: 'baja',
        detalle: `dudosa: presupuesto util recortado a ${recortado} y espera x${FACTOR_ESPERA_DUDOSA}; sigue`
      });
    }
    restante = recortado;
  } else {
    porque.push({ paso: 'castigo', resultado: 'pasa', detalle: 'sin senal de castigo' });
  }

  // =========================================================================
  // 3 · TURNO — ¿esta libre la cuenta y es este el trabajo que toca?
  // =========================================================================
  if (turno.en_curso) {
    vetos.push({
      razon: RAZONES.CUENTA_OCUPADA,
      hasta: turno.hasta,
      fin_declarado: turno.hasta ? 'turno' : 'por_defecto',
      detalle: `la cuenta ya tiene ${turno.en_curso} en curso`
    });
    porque.push({ paso: 'turno', resultado: 'ocupada', detalle: `en curso: ${turno.en_curso}` });
  } else if (turno.adelanta) {
    vetos.push({
      razon: RAZONES.NO_ES_SU_TURNO,
      hasta: turno.hasta,
      fin_declarado: turno.hasta ? 'turno' : 'por_defecto',
      detalle: `adelanta ${turno.adelanta} (orden G4)`
    });
    porque.push({ paso: 'turno', resultado: 'espera', detalle: `adelanta ${turno.adelanta}` });
  } else {
    porque.push({ paso: 'turno', resultado: 'libre', detalle: 'cuenta libre y es su turno' });
  }

  // =========================================================================
  // 4 · ESPERA — la pausa minima entre acciones
  // =========================================================================
  const espera_min = ritmo.espera_minima_de(accion);
  const pausa = Math.max(perfil.pausa_minima_minutos, espera_min) * factor_espera;
  let espera_hasta = es_instante(e.espera_hasta) ? e.espera_hasta : null;
  if (!espera_hasta && es_instante(e.ultima_accion_en)) {
    espera_hasta = ritmo.desplazar(e.ultima_accion_en, pausa);
  }
  if (espera_hasta && ritmo.antes_de(momento, espera_hasta)) {
    vetos.push({
      razon: RAZONES.EN_ESPERA,
      hasta: espera_hasta,
      fin_declarado: 'espera',
      detalle: `pausa de ${pausa} min desde ${e.ultima_accion_en || 'la ultima accion'}; hasta ${espera_hasta}`
    });
    porque.push({ paso: 'espera', resultado: 'en_espera', detalle: `faltan ${ritmo.minutos_entre(momento, espera_hasta)} min (pausa ${pausa})` });
  } else {
    porque.push({
      paso: 'espera',
      resultado: 'pasa',
      detalle: es_instante(e.ultima_accion_en) ? `pausa ${pausa} min ya cumplida` : 'sin accion previa: no hay pausa que exigir'
    });
  }

  // =========================================================================
  // 5 · VEREDICTO — la sintesis, con su fin y su razon
  // =========================================================================
  const DUROS = [RAZONES.CASTIGO_FIRME];
  const veto = vetos.reduce((acc, v) => {
    if (acc === null) return v;
    const duro = DUROS.includes(v.razon) && !DUROS.includes(acc.razon);
    return duro ? v : acc;
  }, null);

  const decision = veto ? (DUROS.includes(veto.razon) ? 'parar' : 'esperar') : 'seguir';
  const razon = veto ? veto.razon : RAZONES.TURNO_LIBRE;

  let hasta = null;
  let fin_declarado = null;
  let recortado = false;
  if (veto) {
    const acotado = _acotar(veto.hasta, veto.fin_declarado, momento, veto.razon);
    hasta = acotado.hasta;
    fin_declarado = acotado.fin_declarado;
    recortado = acotado.recortado;
  }

  porque.push({
    paso: 'veredicto',
    resultado: decision,
    detalle: decision === 'seguir'
      ? `se puede: quedan ${Math.max(0, restante - coste)} de presupuesto${bajado ? ' (ya recortado por duda)' : ''}`
      : `${razon} hasta ${hasta} (${fin_declarado})`
  });

  const veredicto = {
    ok: true,
    decision,
    razon,
    // Un veredicto que no sea `seguir` SIEMPRE lleva fin. No hay rama sin el.
    hasta,
    fin_declarado,
    recortado,
    momento,
    accion,
    coste,
    conservaduria: perfil.conservaduria,
    perfil: perfil.nombre,
    techo,
    gastado,
    restante: restante_bruto,
    restante_util: Math.max(0, restante),
    margen: decision === 'seguir' ? Math.max(0, restante - coste) : 0,
    bajado,
    castigo: { clase: castigo.clase, familia: castigo.familia, fin: castigo.fin, fin_origen: castigo.fin_origen },
    turno: { libre: !turno.en_curso && !turno.adelanta, en_curso: turno.en_curso, adelanta: turno.adelanta },
    espera: {
      minutos: pausa,
      exigida_hasta: espera_hasta,
      desde: es_instante(e.ultima_accion_en) ? e.ultima_accion_en : null
    },
    orden: ORDEN,
    porque
  };

  return veredicto;
}

/** ¿Se puede actuar con este veredicto? (azucar para no comparar cadenas a mano) */
function se_puede(veredicto) {
  return es_objeto(veredicto) && veredicto.decision === 'seguir';
}

/**
 * Comprueba el invariante de la pieza sobre un veredicto: si no es `seguir`,
 * tiene que traer fin declarado y dentro del tope. Es lo que usa `auditar`.
 */
function es_veredicto_valido(veredicto) {
  if (!es_objeto(veredicto) || veredicto.ok !== true) return false;
  if (!DECISIONES.includes(String(veredicto.decision))) return false;
  if (veredicto.decision === 'seguir') return veredicto.hasta === null && veredicto.fin_declarado === null;
  if (!es_instante(veredicto.hasta) || !texto_no_vacio(veredicto.fin_declarado)) return false;
  const tope = ritmo.desplazar(veredicto.momento, TOPE_MINUTOS);
  return !ritmo.antes_de(tope, veredicto.hasta);
}

/** Explicacion en una linea, para el informe del dueno. */
function explicar(veredicto) {
  if (!es_objeto(veredicto) || veredicto.ok !== true) return 'sin veredicto';
  if (veredicto.decision === 'seguir') {
    return `seguir con ${veredicto.accion}: margen ${veredicto.margen}${veredicto.bajado ? ' (ritmo bajado por duda)' : ''}`;
  }
  return `${veredicto.decision} por ${veredicto.razon} hasta ${veredicto.hasta} (${veredicto.fin_declarado})`;
}

module.exports = {
  ORDEN,
  DECISIONES,
  RAZONES,
  FIN_POR_DEFECTO,
  TOPE_HORAS,
  TOPE_MINUTOS,
  FACTOR_DUDOSO,
  FACTOR_ESPERA_DUDOSA,
  CODIGOS,
  normalizar_castigo,
  normalizar_turno,
  decidir,
  se_puede,
  es_veredicto_valido,
  explicar
};

// Vista "clase" para quien prefiera el nombre del diseno (G6 · ReguladorDePaso).
module.exports.ReguladorDePaso = Object.freeze({
  orden: () => ORDEN.slice(),
  decidir,
  se_puede,
  es_veredicto_valido,
  explicar
});
