'use strict';

/**
 * cambio — M2 · CambioDesdeUltimaLectura · REFLEJO.
 *
 * Que cambio desde la ultima lectura. La pieza es pequena; la regla que la
 * hace util es grande: **sin retrato anterior hay PRIMERA LECTURA, no
 * "cambio"**. No se inventa un delta contra la nada.
 *
 * Por que se insiste tanto: un delta contra la nada siempre sale bonito. Si no
 * hay lectura previa y el codigo devuelve `0 cambios`, el dueno lee "todo
 * sigue igual" cuando lo que pasa es que nunca se miro. Si devuelve
 * `+12 seguidores` porque compara con un cero implicito, el dueno lee un
 * crecimiento que nadie observo. Los dos son la misma mentira con distinto
 * signo. Aqui, sin lectura anterior, el resultado es `primera_lectura` con
 * `delta: null` y cero cambios calculados: no hay nada contra lo que comparar
 * y se dice.
 *
 * LAS CUATRO COSAS QUE NO SON UN CAMBIO, y por que:
 *   1. **No hay retrato anterior** (`null`, `undefined`, ilegible). Es una
 *      primera lectura. Un retrato ilegible no es un retrato: se descarta y se
 *      nombra (`retrato_anterior_invalido`), no se rellena con ceros.
 *   2. **El retrato anterior es de otra cuenta.** Dos cuentas distintas no
 *      comparten serie: su "diferencia" es la resta de dos cosas que no se
 *      restan. Primera lectura, motivo `retrato_anterior_de_otra_cuenta`.
 *   3. **El retrato anterior no tiene fecha.** Un dato sin fecha es una
 *      opinion (M1): no se puede decir que es "lo de antes" porque no se sabe
 *      cuando fue. Primera lectura, motivo `retrato_anterior_sin_fecha`.
 *   4. **El anterior es posterior (o del mismo instante).** Comparar contra el
 *      futuro da un delta con el signo cambiado y nadie lo nota. Se rechaza
 *      (`ok:false`, `retrato_anterior_no_es_anterior`): es un fallo de quien
 *      llama, y tiene que verlo.
 *
 * LOS DATOS SIN FECHA NO ENTRAN EN EL DELTA. Si el retrato actual trae un dato
 * sin `leido_en`, ese dato se OMITE y se nombra en `omitidos`; no se compara a
 * ciegas. Si todos los datos vienen sin fecha, no hay nada comparable y el
 * resultado es `no_comparable` con `dato_sin_fecha`. La regla de M1 se aplica
 * aqui dentro, no solo al guardar.
 *
 * Puro: sin IO, sin reloj, sin estado. `Date.parse` solo se usa sobre dos
 * instantes que ya vienen en el payload (para el intervalo); nunca sobre
 * "ahora". El mismo par de retratos produce siempre el mismo resultado.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, validar_sello_de_cuenta } = require('./formas');

const TIPOS = Object.freeze(['cambio', 'primera_lectura', 'no_comparable']);

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  SIN_RETRATO_ACTUAL: 'sin_retrato_actual',
  SIN_SELLO: 'sin_sello_de_cuenta',
  SIN_FECHA: 'dato_sin_fecha',
  SIN_DATOS: 'sin_datos',
  // los cuatro "no es un cambio"
  SIN_RETRATO_ANTERIOR: 'sin_retrato_anterior',
  RETRATO_ANTERIOR_INVALIDO: 'retrato_anterior_invalido',
  RETRATO_ANTERIOR_DE_OTRA_CUENTA: 'retrato_anterior_de_otra_cuenta',
  RETRATO_ANTERIOR_SIN_FECHA: 'retrato_anterior_sin_fecha',
  RETRATO_ANTERIOR_NO_ES_ANTERIOR: 'retrato_anterior_no_es_anterior',
  MISMO_MOMENTO: 'mismo_momento',
  DATO_DUPLICADO: 'dato_duplicado'
});

// ---------------------------------------------------------------------------
// lectura de un retrato
// ---------------------------------------------------------------------------

/**
 * Normaliza los datos de un retrato a `[{nombre, valor, leido_en}]`.
 *
 * M1 los guarda como lista; tambien se admite el mapa `{nombre: {valor,
 * leido_en}}`, porque a mano es comodo escribirlo asi y no cambia nada de lo
 * que se comprueba. Lo que NO se admite es un dato sin fecha: se queda fuera
 * del delta y se nombra.
 *
 * @returns {{datos:Array, sin_fecha:string[], duplicados:string[]}}
 */
function datos_de(retrato) {
  const crudos = es_objeto(retrato) ? retrato.datos : null;
  const lista = [];
  const sin_fecha = [];
  const duplicados = [];
  const vistos = new Set();

  const anadir = (nombre, valor, leido_en) => {
    const n = texto_no_vacio(nombre) ? String(nombre).trim() : null;
    if (!n) return;
    if (vistos.has(n)) { duplicados.push(n); return; }
    vistos.add(n);
    if (!es_instante(leido_en)) { sin_fecha.push(n); return; }
    lista.push({ nombre: n, valor: clonar(valor), leido_en: String(leido_en) });
  };

  if (Array.isArray(crudos)) {
    for (const d of crudos) {
      if (!es_objeto(d)) continue;
      anadir(d.nombre, d.valor, d.leido_en);
    }
  } else if (es_objeto(crudos)) {
    for (const nombre of Object.keys(crudos)) {
      const d = crudos[nombre];
      if (es_objeto(d) && ('valor' in d || 'leido_en' in d)) anadir(nombre, d.valor, d.leido_en);
      else anadir(nombre, d, null);
    }
  }

  return { datos: lista, sin_fecha, duplicados };
}

/**
 * Lee un retrato y dice si sirve para comparar. No lanza: devuelve el hueco.
 */
function leer_retrato(retrato) {
  if (!es_objeto(retrato)) return { ok: false, motivo: MOTIVOS.SIN_RETRATO_ACTUAL, invalidos: ['retrato'] };
  const sello = validar_sello_de_cuenta(retrato.sello);
  if (!sello.ok) return { ok: false, motivo: MOTIVOS.SIN_SELLO, faltan: sello.faltan, invalidos: sello.invalidos };
  if (!es_instante(retrato.tomado_en)) return { ok: false, motivo: MOTIVOS.SIN_FECHA, faltan: ['tomado_en'] };
  const leidos = datos_de(retrato);
  if (leidos.datos.length === 0 && leidos.sin_fecha.length === 0) {
    return { ok: false, motivo: MOTIVOS.SIN_DATOS, faltan: ['datos'] };
  }
  return {
    ok: true,
    retrato_id: texto_no_vacio(retrato.retrato_id) ? String(retrato.retrato_id).trim() : null,
    sello: { proyecto: String(retrato.sello.proyecto), cuenta: String(retrato.sello.cuenta), plataforma: String(retrato.sello.plataforma || 'instagram') },
    tomado_en: String(retrato.tomado_en),
    datos: leidos.datos,
    sin_fecha: leidos.sin_fecha,
    duplicados: leidos.duplicados
  };
}

function mismo_sello(a, b) {
  return a.proyecto === b.proyecto && a.cuenta === b.cuenta && a.plataforma === b.plataforma;
}

// ---------------------------------------------------------------------------
// comparacion de valores
// ---------------------------------------------------------------------------

function son_iguales(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return a === b;
  }
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (err) {
    return false;
  }
}

/** Diferencia numerica redondeada: 0.1 + 0.2 no debe salir 0.30000000000000004. */
function redondear(n, decimales = 6) {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

function delta_numerico(antes, despues) {
  if (typeof antes !== 'number' || typeof despues !== 'number') return { diferencia: null, variacion_pct: null };
  if (!Number.isFinite(antes) || !Number.isFinite(despues)) return { diferencia: null, variacion_pct: null };
  const diferencia = redondear(despues - antes);
  const variacion_pct = antes === 0 ? null : redondear((diferencia / Math.abs(antes)) * 100, 1);
  return { diferencia, variacion_pct };
}

function segundos_entre(desde, hasta) {
  const a = Date.parse(desde);
  const b = Date.parse(hasta);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return redondear((b - a) / 1000, 3);
}

// ---------------------------------------------------------------------------
// el resultado sin delta
// ---------------------------------------------------------------------------

function primera_lectura(retrato, motivo, extra) {
  return Object.assign({
    ok: true,
    tipo: 'primera_lectura',
    hay_delta: false,
    delta: null,
    cambios: [],
    nuevos: [],
    desaparecidos: [],
    iguales: 0,
    sin_cambio: false,
    motivo,
    desde: null,
    hasta: retrato.tomado_en,
    intervalo_s: null,
    omitidos: [],
    resumen: `Primera lectura de ${retrato.sello.cuenta}: ${retrato.datos.length} ${retrato.datos.length === 1 ? 'dato' : 'datos'}, sin lectura anterior con la que comparar.`
  }, extra || {});
}

/**
 * Compara dos retratos del MISMO sello. Devuelve SIEMPRE un objeto: no lanza.
 *
 * @param {object} actual    retrato de ahora (con `tomado_en` y datos fechados)
 * @param {object|null} anterior  retrato de la lectura previa (o nada)
 * @param {{tolerancia?:number}} [opciones]
 * @returns {object}
 */
function comparar(actual, anterior, opciones) {
  const opciones_ = es_objeto(opciones) ? opciones : {};

  // --- el actual tiene que ser un retrato de verdad ------------------------
  const a = leer_retrato(actual);
  if (!a.ok) {
    return { ok: false, tipo: 'no_comparable', motivo: a.motivo, faltan: a.faltan || [], invalidos: a.invalidos || [], hay_delta: false, delta: null };
  }

  // --- 1 · no hay retrato anterior: PRIMERA LECTURA ------------------------
  if (anterior === undefined || anterior === null) {
    return primera_lectura(a, MOTIVOS.SIN_RETRATO_ANTERIOR, { anterior: null });
  }

  // --- 2 · el anterior no es legible: tampoco hay contra que comparar -----
  const p = leer_retrato(anterior);
  if (!p.ok) {
    const motivo = p.motivo === MOTIVOS.SIN_FECHA ? MOTIVOS.RETRATO_ANTERIOR_SIN_FECHA : MOTIVOS.RETRATO_ANTERIOR_INVALIDO;
    return primera_lectura(a, motivo, { anterior: null, anterior_descartado: true });
  }

  // --- 3 · otra cuenta: dos series distintas no se restan -----------------
  if (!mismo_sello(p.sello, a.sello)) {
    return primera_lectura(a, MOTIVOS.RETRATO_ANTERIOR_DE_OTRA_CUENTA, {
      anterior: { retrato_id: p.retrato_id, sello: p.sello, tomado_en: p.tomado_en }
    });
  }

  // --- 4 · orden: el anterior tiene que ser ANTERIOR ----------------------
  if (p.tomado_en === a.tomado_en) {
    return {
      ok: false,
      tipo: 'no_comparable',
      hay_delta: false,
      delta: null,
      motivo: MOTIVOS.MISMO_MOMENTO,
      desde: p.tomado_en,
      hasta: a.tomado_en,
      intervalo_s: 0,
      anterior: { retrato_id: p.retrato_id, tomado_en: p.tomado_en },
      resumen: 'Los dos retratos son del mismo instante: no hay un antes y un despues que restar.'
    };
  }
  if (Date.parse(p.tomado_en) > Date.parse(a.tomado_en)) {
    return {
      ok: false,
      tipo: 'no_comparable',
      hay_delta: false,
      delta: null,
      motivo: MOTIVOS.RETRATO_ANTERIOR_NO_ES_ANTERIOR,
      desde: p.tomado_en,
      hasta: a.tomado_en,
      intervalo_s: segundos_entre(p.tomado_en, a.tomado_en),
      anterior: { retrato_id: p.retrato_id, tomado_en: p.tomado_en },
      resumen: 'El retrato llamado "anterior" es posterior al actual: el delta tendria el signo cambiado.'
    };
  }

  // --- 5 · sin datos con fecha no hay delta -------------------------------
  if (a.datos.length === 0) {
    return {
      ok: false,
      tipo: 'no_comparable',
      hay_delta: false,
      delta: null,
      motivo: MOTIVOS.SIN_FECHA,
      omitidos: a.sin_fecha.map((nombre) => ({ nombre, motivo: MOTIVOS.SIN_FECHA })),
      desde: p.tomado_en,
      hasta: a.tomado_en,
      intervalo_s: segundos_entre(p.tomado_en, a.tomado_en),
      resumen: 'Ningun dato del retrato actual tiene fecha: no se compara una opinion con un dato.'
    };
  }

  // --- 6 · el delta, dato a dato -----------------------------------------
  const antes = new Map(p.datos.map((d) => [d.nombre, d]));
  const ahora = new Map(a.datos.map((d) => [d.nombre, d]));
  const tolerancia = typeof opciones_.tolerancia === 'number' && opciones_.tolerancia >= 0 ? opciones_.tolerancia : 0;

  const cambios = [];
  const nuevos = [];
  const desaparecidos = [];
  const iguales = [];
  const delta = {};

  for (const d of a.datos) {
    const previo = antes.get(d.nombre);
    if (!previo) {
      nuevos.push({ nombre: d.nombre, valor: d.valor, leido_en: d.leido_en });
      continue;
    }
    const igual = son_iguales(previo.valor, d.valor);
    const numerico = delta_numerico(previo.valor, d.valor);
    const dentro_de_tolerancia = igual ? false
      : (numerico.diferencia !== null && tolerancia > 0 && Math.abs(numerico.diferencia) <= tolerancia);

    if (igual || dentro_de_tolerancia) {
      iguales.push({ nombre: d.nombre, valor: d.valor });
      continue;
    }

    cambios.push({
      nombre: d.nombre,
      antes: previo.valor,
      despues: d.valor,
      leido_en_antes: previo.leido_en,
      leido_en_actual: d.leido_en,
      diferencia: numerico.diferencia,
      variacion_pct: numerico.variacion_pct,
      dentro_de_tolerancia
    });
    if (numerico.diferencia !== null) delta[d.nombre] = numerico.diferencia;
  }

  for (const d of p.datos) {
    if (!ahora.has(d.nombre)) desaparecidos.push({ nombre: d.nombre, valor: d.valor, leido_en: d.leido_en });
  }

  const sin_cambio = cambios.length === 0 && nuevos.length === 0 && desaparecidos.length === 0;
  const intervalo_s = segundos_entre(p.tomado_en, a.tomado_en);

  let resumen;
  if (sin_cambio) resumen = `Sin cambios en ${iguales.length} datos entre ${p.tomado_en} y ${a.tomado_en}.`;
  else {
    const partes = [];
    if (cambios.length) partes.push(`${cambios.length} ${cambios.length === 1 ? 'dato cambiado' : 'datos cambiados'}`);
    if (nuevos.length) partes.push(`${nuevos.length} ${nuevos.length === 1 ? 'dato nuevo' : 'datos nuevos'}`);
    if (desaparecidos.length) partes.push(`${desaparecidos.length} ${desaparecidos.length === 1 ? 'dato que ya no aparece' : 'datos que ya no aparecen'}`);
    resumen = `${partes.join(', ')} entre ${p.tomado_en} y ${a.tomado_en}.`;
  }

  return {
    ok: true,
    tipo: 'cambio',
    hay_delta: true,
    motivo: null,
    sello: a.sello,
    desde: p.tomado_en,
    hasta: a.tomado_en,
    intervalo_s,
    anterior: { retrato_id: p.retrato_id, tomado_en: p.tomado_en },
    actual: { retrato_id: a.retrato_id, tomado_en: a.tomado_en },
    cambios,
    nuevos,
    desaparecidos,
    iguales: iguales.length,
    sin_cambio,
    delta,
    omitidos: a.sin_fecha.map((nombre) => ({ nombre, motivo: MOTIVOS.SIN_FECHA })),
    duplicados: a.duplicados.slice(),
    resumen
  };
}

/**
 * Elige la lectura inmediatamente anterior del mismo sello y compara contra
 * ella. Si no hay ninguna anterior, devuelve PRIMERA LECTURA: la seleccion no
 * inventa un cero ni coge "la que haya" aunque sea posterior.
 *
 * @param {object} actual
 * @param {Array<object>} retratos historial (en cualquier orden)
 * @param {object} [opciones]
 */
function comparar_con_historial(actual, retratos, opciones) {
  const a = leer_retrato(actual);
  if (!a.ok) {
    return { ok: false, tipo: 'no_comparable', motivo: a.motivo, faltan: a.faltan || [], invalidos: a.invalidos || [], hay_delta: false, delta: null };
  }
  const lista = Array.isArray(retratos) ? retratos : [];
  const t = Date.parse(a.tomado_en);

  let elegido = null;
  let elegido_t = -Infinity;
  let anteriores = 0;
  for (const r of lista) {
    const leido = leer_retrato(r);
    if (!leido.ok || !mismo_sello(leido.sello, a.sello)) continue;
    const tr = Date.parse(leido.tomado_en);
    if (!(tr < t)) continue;
    anteriores += 1;
    // Empate de instante: gana el ultimo del historial (el mas reciente anadido).
    if (tr >= elegido_t) { elegido = r; elegido_t = tr; }
  }

  if (!elegido) {
    const r = primera_lectura(a, MOTIVOS.SIN_RETRATO_ANTERIOR, { anterior: null, historial_considerado: lista.length });
    r.anteriores_del_mismo_sello = anteriores;
    return r;
  }

  const resultado = comparar(actual, elegido, opciones);
  resultado.anteriores_del_mismo_sello = anteriores;
  return resultado;
}

module.exports = {
  TIPOS,
  MOTIVOS,
  datos_de,
  leer_retrato,
  comparar,
  comparar_con_historial
};

module.exports.CambioDesdeUltimaLectura = Object.freeze({
  comparar,
  comparar_con_historial,
  MOTIVOS
});
