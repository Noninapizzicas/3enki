'use strict';

/**
 * tolerancia — G5 · MemoriaDeTolerancia · CUSTODIO (logica pura; IO en index.js).
 *
 * "Que se ha tolerado hasta ahora" es la unica prueba que tiene el puente de
 * que una cuenta aguanta lo que se le pide. No es una intuicion ni una nota del
 * agente: es una lista de asientos fechados, uno por hecho tolerado o castigado.
 *
 * Reglas que esta pieza hace ejecutables:
 *   - CUENTA NUEVA ARRANCA EN EL MAXIMO CONSERVADOR. No hay "perfil inicial
 *     normal" ni "ya veremos": sin asientos, la conservaduria es la maxima
 *     (100) y el perfil que devuelve es el mas lento de G1. El margen se gana,
 *     no se supone.
 *   - La memoria es APPEND-ONLY. Se anade el hecho; nunca se reescribe ni se
 *     borra un asiento. La conservaduria NO se guarda: se DERIVA del historial
 *     cada vez. Un numero guardado a mano se desincroniza del historial y
 *     entonces hay dos verdades.
 *   - La derivacion es una cuenta declarada y determinista: se recorre el
 *     historial en orden de secuencia y se aplica la tabla. Dos lecturas del
 *     mismo historial dan el mismo numero, siempre.
 *   - Un castigo firme devuelve la cuenta al maximo conservador: si la
 *     plataforma ya ha dicho que no, no se sigue con el margen de antes.
 *   - El estado es POR CUENTA, no por proyecto: el limite lo impone la
 *     plataforma a la cuenta, asi que dos cuentas del mismo proyecto tienen
 *     memorias distintas y no se contaminan.
 *
 * Puro: sin IO, sin reloj. El instante de cada asiento lo trae quien anota.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, crear_sello, validar_sello } = require('../core/formas');
const ritmo = require('../core/ritmo');
const propiedad = require('../core/propiedad');
const noSecretos = require('../core/no-secretos');

const ESQUEMA = 'tolerancia-v1';
const ALMACEN = 'tolerancia';

const TIPOS = Object.freeze(['tolerado', 'castigo_firme', 'castigo_dudoso', 'reinicio']);

// Tabla de la derivacion. Los numeros son pasos de conservaduria, no minutos:
// `tolerado` gana margen de uno en uno; un castigo lo devuelve de golpe.
const PASOS = Object.freeze({
  tolerado: -3,
  castigo_dudoso: +15,
  castigo_firme: null, // no suma: devuelve al maximo (ver derivar)
  reinicio: null       // tampoco: vuelve a empezar como cuenta nueva
});

const CODIGOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  TIPO_DESCONOCIDO: 'tipo_desconocido',
  SIN_SELLO: 'sin_sello',
  SECRETO_RECIBIDO: 'secreto_recibido',
  AMBITO_INCOMPLETO: 'ambito_incompleto',
  SIN_MOMENTO: 'sin_momento',
  ALMACEN_NO_AUDITADO: 'almacen_no_auditado'
});

// ---- estado ---------------------------------------------------------------

function estado_vacio() {
  return {
    esquema: ESQUEMA,
    almacen: ALMACEN,
    revision: 0,
    secuencia: 0,
    actualizado: null,
    asientos: []
  };
}

function es_estado(estado) {
  return es_objeto(estado)
    && estado.esquema === ESQUEMA
    && Number.isFinite(Number(estado.revision))
    && Number.isFinite(Number(estado.secuencia))
    && Array.isArray(estado.asientos);
}

function _siguiente_revision(estado) {
  return Object.assign(clonar(estado), { revision: Number(estado.revision) + 1 });
}

// ---- derivacion -----------------------------------------------------------

/**
 * Conservaduria de una cuenta sin asientos: el maximo conservador de G1.
 * Existe como funcion para que "cuenta nueva" se lea una sola vez.
 */
function conservaduria_de_cuenta_nueva() {
  return ritmo.CONSERVADURIA_MAXIMA;
}

/**
 * Recorre un historial y devuelve la conservaduria resultante.
 *
 * @param {object[]} asientos
 * @returns {number} 10..100 (100 = maximo conservador)
 */
function derivar_conservaduria(asientos) {
  let conservaduria = conservaduria_de_cuenta_nueva();
  if (!Array.isArray(asientos)) return conservaduria;

  const orden = asientos
    .filter((a) => es_objeto(a))
    .slice()
    .sort((a, b) => Number(a.secuencia) - Number(b.secuencia));

  for (const asiento of orden) {
    const tipo = String(asiento.tipo);
    if (tipo === 'castigo_firme' || tipo === 'reinicio') {
      conservaduria = ritmo.CONSERVADURIA_MAXIMA;
      continue;
    }
    const paso = PASOS[tipo];
    if (typeof paso !== 'number') continue; // un tipo que no se conoce no mueve nada
    conservaduria = Math.min(ritmo.CONSERVADURIA_MAXIMA, Math.max(ritmo.CONSERVADURIA_MINIMA, conservaduria + paso));
  }
  return conservaduria;
}

/** Resumen del historial de una cuenta (sin estado: sirve para tests y para el fold). */
function resumir(asientos) {
  const lista = Array.isArray(asientos) ? asientos.filter((a) => es_objeto(a)) : [];
  const cuenta = { tolerados: 0, castigos_firmes: 0, castigos_dudosos: 0, reinicios: 0, ultimo_momento: null };
  for (const a of lista) {
    if (a.tipo === 'tolerado') cuenta.tolerados += 1;
    else if (a.tipo === 'castigo_firme') cuenta.castigos_firmes += 1;
    else if (a.tipo === 'castigo_dudoso') cuenta.castigos_dudosos += 1;
    else if (a.tipo === 'reinicio') cuenta.reinicios += 1;
    if (es_instante(a.momento) && (!cuenta.ultimo_momento || ritmo.antes_de(cuenta.ultimo_momento, a.momento))) {
      cuenta.ultimo_momento = a.momento;
    }
  }
  return cuenta;
}

/**
 * Tolerancia de una cuenta. Si no hay asientos devuelve el maximo conservador
 * con `origen: 'cuenta_nueva'`: quien pregunta tiene que poder distinguir "no
 * he tolerado nada" de "he tolerado poco".
 *
 * @param {object} estado
 * @param {{proyecto?:string, cuenta:string}} consulta
 */
function tolerancia_de(estado, consulta = {}) {
  const c = es_objeto(consulta) ? consulta : {};
  if (!texto_no_vacio(c.cuenta)) {
    return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['cuenta'] };
  }
  if (!es_estado(estado)) {
    return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['estado'] };
  }
  const cuenta = String(c.cuenta).trim();
  const proyecto = texto_no_vacio(c.proyecto) ? String(c.proyecto).trim() : null;

  const suyos = estado.asientos.filter((a) => es_objeto(a)
    && String(a.cuenta) === cuenta
    && (proyecto === null || String(a.proyecto) === proyecto));

  const conservaduria = derivar_conservaduria(suyos);
  const resumen = resumir(suyos);
  const perfil = ritmo.perfil(conservaduria);

  return {
    ok: true,
    proyecto: proyecto || (suyos.length ? String(suyos[suyos.length - 1].proyecto) : null),
    cuenta,
    conservaduria,
    origen: suyos.length ? 'registro' : 'cuenta_nueva',
    asientos: suyos.length,
    tolerados: resumen.tolerados,
    castigos_firmes: resumen.castigos_firmes,
    castigos_dudosos: resumen.castigos_dudosos,
    ultimo_momento: resumen.ultimo_momento,
    perfil: {
      nombre: perfil.nombre,
      techo_diario: perfil.techo_diario,
      pausa_minima_minutos: perfil.pausa_minima_minutos,
      publicaciones_al_dia: perfil.publicaciones_al_dia
    }
  };
}

/**
 * Asientos de una cuenta, en orden. Sin criterio NO se devuelve la memoria
 * entera (P2: el estado de una cuenta no se sirve mezclado con el de otra).
 */
function listar(estado, filtro = {}) {
  if (!es_estado(estado)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, asientos: [] };
  const f = es_objeto(filtro) ? filtro : {};
  if (!texto_no_vacio(f.cuenta) && !texto_no_vacio(f.proyecto)) {
    return { ok: false, motivo: CODIGOS.AMBITO_INCOMPLETO, faltan: ['cuenta', 'proyecto'], asientos: [] };
  }
  const asientos = estado.asientos
    .filter((a) => es_objeto(a)
      && (texto_no_vacio(f.cuenta) ? String(a.cuenta) === String(f.cuenta).trim() : true)
      && (texto_no_vacio(f.proyecto) ? String(a.proyecto) === String(f.proyecto).trim() : true))
    .slice()
    .sort((a, b) => Number(a.secuencia) - Number(b.secuencia));
  return { ok: true, total: asientos.length, asientos: clonar(asientos) };
}

// ---- mutaciones -----------------------------------------------------------

/**
 * Anota un hecho en la memoria. No mueve la conservaduria directamente: la
 * anota, y la conservaduria se vuelve a derivar al leer.
 *
 * @param {object} estado
 * @param {{proyecto:string, cuenta:string, aparato:string, momento:string, quien:string,
 *          tipo:string, detalle?:string, sello?:object}} entrada
 */
function anotar(estado, entrada) {
  if (!es_estado(estado)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['estado'] };
  if (!es_objeto(entrada)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['entrada'] };

  // El hecho y su instante son lo que hay que poder contar; los campos del
  // sello (proyecto, cuenta, aparato, quien) los valida P1 mas abajo, y su
  // rechazo se llama `sin_sello` porque eso es lo que falta: el dueno del hecho.
  const faltan = [];
  if (!texto_no_vacio(entrada.tipo)) faltan.push('tipo');
  if (!es_instante(entrada.momento)) faltan.push('momento');
  if (faltan.length) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan, invalidos: [] };

  if (!TIPOS.includes(String(entrada.tipo))) {
    return { ok: false, motivo: CODIGOS.TIPO_DESCONOCIDO, invalidos: ['tipo'], tipos: TIPOS.slice() };
  }

  const sello = crear_sello(entrada.sello || entrada);
  if (!sello.ok) {
    return { ok: false, motivo: CODIGOS.SIN_SELLO, faltan: sello.faltan, invalidos: sello.invalidos };
  }

  if (!noSecretos.admitir_en_estado(entrada)) {
    const hallazgos = noSecretos.detectar_secreto(entrada);
    return {
      ok: false,
      motivo: CODIGOS.SECRETO_RECIBIDO,
      familias: noSecretos.familias_de(hallazgos),
      rutas: hallazgos.map((h) => h.ruta),
      guardado: false
    };
  }

  const secuencia = Number(estado.secuencia) + 1;
  const asiento = {
    id: texto_no_vacio(entrada.id) ? String(entrada.id).trim() : `a-${String(secuencia).padStart(5, '0')}`,
    secuencia,
    almacen: ALMACEN,
    proyecto: String(entrada.proyecto).trim(),
    cuenta: String(entrada.cuenta).trim(),
    tipo: String(entrada.tipo),
    momento: entrada.momento,
    detalle: texto_no_vacio(entrada.detalle) ? String(entrada.detalle).trim() : null,
    sello: sello.sello
  };

  const siguiente = _siguiente_revision(estado);
  siguiente.secuencia = secuencia;
  siguiente.asientos = [...estado.asientos, asiento];
  siguiente.actualizado = entrada.momento;

  const auditoria = auditar(siguiente);
  if (!auditoria.ok) {
    return { ok: false, motivo: CODIGOS.ALMACEN_NO_AUDITADO, problemas: auditoria.problemas, guardado: false };
  }

  const suyos = siguiente.asientos.filter((a) => String(a.cuenta) === asiento.cuenta && String(a.proyecto) === asiento.proyecto);
  return {
    ok: true,
    asiento: clonar(asiento),
    conservaduria: derivar_conservaduria(suyos),
    perfil: ritmo.perfil(derivar_conservaduria(suyos)).nombre,
    estado: siguiente,
    revision: siguiente.revision
  };
}

/** Azucar: una accion que salio bien y la plataforma tolero. */
function anotar_tolerado(estado, entrada) {
  return anotar(estado, Object.assign({}, entrada, { tipo: 'tolerado' }));
}

/**
 * Azucar: una senal de castigo. `clase` es la salida de G2
 * ('firme' | 'dudosa'); una clase desconocida se anota como DUDOSA, porque
 * anotar de menos prudencia de la que hay es el unico error que no se corrige.
 */
function anotar_castigo(estado, entrada) {
  const clase = entrada && entrada.clase;
  const tipo = clase === 'firme' ? 'castigo_firme' : 'castigo_dudoso';
  return anotar(estado, Object.assign({}, entrada, { tipo }));
}

/** Azucar: la cuenta vuelve a empezar (cambio de aparato, revision manual). */
function reiniciar(estado, entrada) {
  return anotar(estado, Object.assign({}, entrada, { tipo: 'reinicio' }));
}

// ---- auditoria ------------------------------------------------------------

/**
 * Audita la memoria entera antes de escribirla:
 *   - esquema, tipos conocidos, ids unicos y secuencia monotona;
 *   - sello P1 en cada asiento (la fecha sola no identifica quien lo anoto);
 *   - cero secretos (V1);
 *   - clase privada (P3) por proyecto: `tolerancia` no se mezcla;
 *   - la conservaduria derivada de CADA cuenta cae dentro de [MINIMA, MAXIMA]:
 *     un numero fuera de rango es un fallo de la derivacion, no un caso raro.
 */
function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, estado: 'exceso', problemas: [{ motivo: 'esquema_desconocido', detalle: String(estado && estado.esquema) }] };
  }

  const vistos = new Set();
  const porCuenta = new Map();
  let max_secuencia = 0;

  estado.asientos.forEach((a, i) => {
    if (!es_objeto(a)) {
      problemas.push({ motivo: 'asiento_ilegible', indice: i });
      return;
    }
    if (!texto_no_vacio(a.id)) problemas.push({ motivo: 'sin_id', indice: i });
    else if (vistos.has(String(a.id))) problemas.push({ motivo: 'id_repetido', detalle: String(a.id), indice: i });
    else vistos.add(String(a.id));

    if (a.almacen !== ALMACEN) problemas.push({ motivo: 'almacen_no_declarado', detalle: String(a.almacen), id: a.id });
    if (!validar_sello(a.sello).ok) problemas.push({ motivo: 'dato_sin_sello', detalle: 'sello', id: a.id });
    if (!TIPOS.includes(String(a.tipo))) problemas.push({ motivo: CODIGOS.TIPO_DESCONOCIDO, detalle: String(a.tipo), id: a.id });
    if (!es_instante(a.momento)) problemas.push({ motivo: 'sin_momento', id: a.id });

    const secuencia = Number(a.secuencia);
    if (!Number.isFinite(secuencia)) problemas.push({ motivo: 'sin_secuencia', id: a.id });
    else max_secuencia = Math.max(max_secuencia, secuencia);

    const clave = `${a.proyecto}::${a.cuenta}`;
    if (!porCuenta.has(clave)) porCuenta.set(clave, []);
    porCuenta.get(clave).push(a);
  });

  if (max_secuencia > Number(estado.secuencia)) {
    problemas.push({ motivo: 'secuencia_incoherente', detalle: `${max_secuencia} > ${estado.secuencia}` });
  }

  const secretos = noSecretos.detectar_secreto(estado);
  if (secretos.length) {
    problemas.push({ motivo: CODIGOS.SECRETO_RECIBIDO, familias: noSecretos.familias_de(secretos), rutas: secretos.map((h) => h.ruta) });
  }

  for (const [clave, asientos] of porCuenta) {
    const c = derivar_conservaduria(asientos);
    if (c < ritmo.CONSERVADURIA_MINIMA || c > ritmo.CONSERVADURIA_MAXIMA) {
      problemas.push({ motivo: 'conservaduria_fuera_de_rango', detalle: `${clave} = ${c}` });
    }
  }

  // P3 por proyecto: el fichero guarda varias cuentas de varios proyectos (el
  // estado es por cuenta), pero cada proyecto se comprueba como almacen privado.
  const porProyecto = new Map();
  for (const a of estado.asientos) {
    if (!es_objeto(a)) continue;
    const p = String(a.proyecto || '');
    if (!porProyecto.has(p)) porProyecto.set(p, []);
    porProyecto.get(p).push(a);
  }
  for (const [proyecto, datos] of porProyecto) {
    const mezcla = propiedad.verificar_mezcla({ nombre: ALMACEN, datos });
    if (!mezcla.ok || mezcla.estado !== 'limpio') {
      for (const h of mezcla.hallazgos) problemas.push({ motivo: h.motivo, detalle: h.detalle, proyecto });
    }
  }

  return {
    ok: problemas.length === 0,
    estado: problemas.length === 0 ? 'limpio' : 'exceso',
    asientos: estado.asientos.length,
    cuentas: porCuenta.size,
    problemas
  };
}

module.exports = {
  ESQUEMA,
  ALMACEN,
  TIPOS,
  PASOS,
  CODIGOS,
  estado_vacio,
  es_estado,
  conservaduria_de_cuenta_nueva,
  derivar_conservaduria,
  resumir,
  tolerancia_de,
  listar,
  anotar,
  anotar_tolerado,
  anotar_castigo,
  reiniciar,
  auditar
};

// Vista "clase" para quien prefiera el nombre del diseno (G5 · MemoriaDeTolerancia).
module.exports.MemoriaDeTolerancia = Object.freeze({
  tolerancia_de,
  derivar_conservaduria,
  anotar,
  anotar_tolerado,
  anotar_castigo,
  listar,
  auditar
});
