'use strict';

/**
 * rotura — F1 · DeclaradorDeRotura · REFLEJO.
 *
 * La plataforma cambia su interfaz sin avisar: un boton se llama distinto, un
 * paso ya no existe, la postcondicion deja de ocurrir. Esta pieza dice si eso que
 * se vio es una ROTURA o solo una SOSPECHA. La regla es una sola y no se negocia:
 *
 *   DOS EVIDENCIAS independientes del MISMO sintoma -> ROTURA.
 *   UNA evidencia                                   -> SOSPECHA.
 *
 * Por que el umbral es dos: con una sola evidencia no se puede distinguir una
 * platform que cambio de un dedo que resbaló, de una pantalla a medio cargar o de
 * un aparato lento. Declarar rotura con una evidencia retira una receta vigente
 * que funciona para todos los proyectos; declarar sospecha no retira nada y solo
 * pide una segunda mirada. El error barato es esperar; el caro es retirar.
 *
 * Que cuenta como evidencia INDEPENDIENTE (y que no):
 *   - Con `evidencia_id`, dos entradas con el mismo id son LA MISMA evidencia
 *     repetida (el bus reintenta, el movil reenvia): cuentan una, y se nombra en
 *     `repetidas`. Copiar una evidencia no la convierte en dos.
 *   - Sin id, la huella es (paso, tipo, ancla, observado_en, quien). Dos iguales
 *     son una: el mismo ojo, en el mismo instante, viendo lo mismo.
 *   - Un mismo sintoma visto por DOS ojos distintos (o en DOS momentos distintos)
 *     son dos evidencias. Es exactamente lo que hay que exigir: que no sea el
 *     mismo testigo contando dos veces.
 *
 * Que cuenta como el MISMO sintoma: (paso, tipo, ancla observada). Dos evidencias
 * de que el paso 2 perdio "Siguiente" son una rotura. Una de que el paso 2 perdio
 * "Siguiente" y otra de que el paso 2 perdio "Compartir" son DOS sospechas, y se
 * dicen asi: no se suman dos cosas distintas para llegar a dos y declarar una
 * rotura que nadie vio dos veces.
 *
 * Lo que esta pieza NO hace: no retira recetas, no repara nada y no escribe. Eso
 * es F2 (reparar, con persona) y el catalogo (marcar_no_vigente, con motivo). Aqui
 * solo se dice la verdad sobre lo observado.
 *
 * Puro: sin reloj, sin red, sin IO, sin estado global. El `observado_en` de cada
 * evidencia lo trae quien la tomo.
 *
 * Ver plan-construccion.md (bloque 12, F1) y diseno-oop.md.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, QUIENES, PLATAFORMAS } = require('../core/formas');
const forma_receta = require('../core/forma-receta');

// Que se puede observar cuando una receta deja de servir. Lista cerrada: un
// sintoma que no esta aqui no se puede contar por motivo, y lo que no se cuenta
// no se puede comparar entre proyectos.
const TIPOS = Object.freeze([
  'ancla_ausente',
  'ancla_renombrada',
  'paso_imposible',
  'accion_sin_efecto',
  'postcondicion_no_ocurre'
]);

const VEREDICTOS = Object.freeze(['sin_evidencia', 'sospecha', 'rotura']);

// Dos. Ni uno (sospecha) ni tres (una rotura se ve dos veces o no se vio).
const UMBRAL = 2;

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  DEFECTO_DE_FORMA: 'defecto_de_forma',
  SIN_EVIDENCIA: 'sin_evidencia',
  PASO_FUERA_DE_LA_RECETA: 'paso_fuera_de_la_receta',
  TIPO_NO_DECLARADO: 'tipo_no_declarado',
  SIN_MOMENTO: 'sin_momento',
  MOMENTO_INVALIDO: 'momento_invalido',
  SIN_TESTIGO: 'sin_testigo',
  TESTIGO_NO_DECLARADO: 'testigo_no_declarado',
  ANCLA_INVALIDA: 'ancla_invalida',
  PLATAFORMA_NO_DECLARADA: 'plataforma_no_declarada'
});

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

/** Etiqueta comparable: sin acentos, sin mayusculas de mas, espacios colapsados. */
function normalizar_etiqueta(v) {
  return String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Huella de independencia de una evidencia: con id, el id; sin id, lo que hace
 * falta para decir "esto es la misma observacion": paso, tipo, ancla, instante y
 * testigo.
 */
function huella_de(evidencia) {
  if (texto_no_vacio(evidencia.evidencia_id)) return `id:${String(evidencia.evidencia_id).trim()}`;
  const ancla = es_objeto(evidencia.ancla) && texto_no_vacio(evidencia.ancla.nombre_visible)
    ? normalizar_etiqueta(evidencia.ancla.nombre_visible)
    : '-';
  return `obs:${evidencia.paso}|${evidencia.tipo}|${ancla}|${String(evidencia.observado_en)}|${String(evidencia.quien)}`;
}

/**
 * Valida UNA evidencia contra la receta. Devuelve `{ok:true, evidencia}` o
 * `{ok:false, motivo}`. Un rechazo se nombra: una evidencia descartada en
 * silencio es una evidencia que alguien cree que conto.
 */
function leer_evidencia(evidencia, pasos) {
  if (!es_objeto(evidencia)) return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA };
  if (!Number.isInteger(evidencia.paso) || evidencia.paso < 1 || evidencia.paso > pasos) {
    return { ok: false, motivo: MOTIVOS.PASO_FUERA_DE_LA_RECETA, valor: evidencia.paso };
  }
  const tipo = texto_no_vacio(evidencia.tipo) ? String(evidencia.tipo).trim().toLowerCase() : null;
  if (!tipo) return { ok: false, motivo: MOTIVOS.TIPO_NO_DECLARADO };
  if (!TIPOS.includes(tipo)) return { ok: false, motivo: MOTIVOS.TIPO_NO_DECLARADO, valor: tipo };
  if (vacio(evidencia.observado_en)) return { ok: false, motivo: MOTIVOS.SIN_MOMENTO };
  if (!es_instante(evidencia.observado_en)) return { ok: false, motivo: MOTIVOS.MOMENTO_INVALIDO, valor: evidencia.observado_en };
  if (vacio(evidencia.quien)) return { ok: false, motivo: MOTIVOS.SIN_TESTIGO };
  if (!QUIENES.includes(String(evidencia.quien).trim())) {
    return { ok: false, motivo: MOTIVOS.TESTIGO_NO_DECLARADO, valor: evidencia.quien };
  }

  let ancla = null;
  if (evidencia.ancla !== undefined && evidencia.ancla !== null) {
    if (!es_objeto(evidencia.ancla) || !texto_no_vacio(evidencia.ancla.nombre_visible)) {
      return { ok: false, motivo: MOTIVOS.ANCLA_INVALIDA };
    }
    ancla = {
      nombre_visible: String(evidencia.ancla.nombre_visible).trim(),
      tipo: texto_no_vacio(evidencia.ancla.tipo) ? String(evidencia.ancla.tipo).trim().toLowerCase() : 'desconocido'
    };
  }

  return {
    ok: true,
    evidencia: {
      evidencia_id: texto_no_vacio(evidencia.evidencia_id) ? String(evidencia.evidencia_id).trim() : null,
      paso: evidencia.paso,
      tipo,
      ancla,
      ancla_clave: ancla ? normalizar_etiqueta(ancla.nombre_visible) : '-',
      observado_en: String(evidencia.observado_en),
      quien: String(evidencia.quien).trim(),
      cuenta: texto_no_vacio(evidencia.cuenta) ? String(evidencia.cuenta).trim() : null,
      nota: texto_no_vacio(evidencia.nota) ? String(evidencia.nota).trim() : null
    }
  };
}

/**
 * Declara si lo observado es rotura o sospecha.
 *
 * @param {object} receta receta vigente que se esta usando (A4.1)
 * @param {object[]} evidencias lo que se vio fallar, con su paso y su instante
 * @param {{plataforma?:string, capacidad?:string, version?:number}} [ambito]
 * @returns {object}
 */
function declarar(receta, evidencias, ambito) {
  const v = forma_receta.validar(receta);
  if (!v.ok) {
    return fallo(MOTIVOS.DEFECTO_DE_FORMA, [], [], {
      defectos: v.defectos,
      pista: 'una rotura se declara sobre una receta; sin receta valida no hay nada que romper'
    });
  }
  if (evidencias !== undefined && evidencias !== null && !Array.isArray(evidencias)) {
    return fallo(MOTIVOS.ENTRADA_INVALIDA, ['evidencias'], []);
  }

  const r = v.receta;
  const plataforma = texto_no_vacio(ambito && ambito.plataforma)
    ? String(ambito.plataforma).trim().toLowerCase()
    : r.plataforma;
  if (!PLATAFORMAS.includes(plataforma)) {
    return fallo(MOTIVOS.PLATAFORMA_NO_DECLARADA, [], ['plataforma'], { valor: plataforma });
  }

  const lista = Array.isArray(evidencias) ? evidencias : [];
  const consideradas = [];
  const descartadas = [];
  const repetidas = [];
  const vistas = new Set();

  lista.forEach((cruda, i) => {
    const leida = leer_evidencia(cruda, r.pasos.length);
    if (!leida.ok) {
      descartadas.push({ indice: i, motivo: leida.motivo, valor: leida.valor === undefined ? null : leida.valor });
      return;
    }
    const huella = huella_de(leida.evidencia);
    if (vistas.has(huella)) {
      // La misma evidencia otra vez no es una segunda evidencia: es la primera
      // contada dos veces, y ese es justo el error que este umbral cierra.
      repetidas.push({
        indice: i,
        evidencia_id: leida.evidencia.evidencia_id,
        huella,
        motivo: 'evidencia_repetida'
      });
      return;
    }
    vistas.add(huella);
    consideradas.push(leida.evidencia);
  });

  // Agrupacion por (paso, tipo, ancla): el MISMO sintoma del MISMO paso.
  const porPaso = new Map();
  r.pasos.forEach((paso, i) => {
    porPaso.set(i + 1, { paso: i + 1, ancla_esperada: paso.ancla_esperada, sintomas: new Map() });
  });

  for (const e of consideradas) {
    const entrada = porPaso.get(e.paso);
    const claveSintoma = `${e.tipo}|${e.ancla_clave}`;
    if (!entrada.sintomas.has(claveSintoma)) {
      entrada.sintomas.set(claveSintoma, {
        tipo: e.tipo,
        ancla: e.ancla,
        clave: claveSintoma,
        evidencias: [],
        testigos: []
      });
    }
    const sintoma = entrada.sintomas.get(claveSintoma);
    sintoma.evidencias.push({
      evidencia_id: e.evidencia_id,
      observado_en: e.observado_en,
      quien: e.quien,
      cuenta: e.cuenta,
      nota: e.nota
    });
    if (!sintoma.testigos.includes(e.quien)) sintoma.testigos.push(e.quien);
  }

  const pasos = [];
  const pasos_rotos = [];
  const pasos_sospechosos = [];
  let sintomas_rotos = 0;
  let sintomas_sospechosos = 0;

  for (const numero of Array.from(porPaso.keys()).sort((a, b) => a - b)) {
    const entrada = porPaso.get(numero);
    const sintomas = Array.from(entrada.sintomas.values()).map((s) => {
      const veredicto = s.evidencias.length >= UMBRAL ? 'rotura' : 'sospecha';
      if (veredicto === 'rotura') sintomas_rotos += 1;
      else sintomas_sospechosos += 1;
      return {
        tipo: s.tipo,
        ancla: s.ancla,
        evidencias: s.evidencias.length,
        testigos: s.testigos,
        veredicto
      };
    });

    const rotos = sintomas.filter((s) => s.veredicto === 'rotura');
    const veredicto_paso = rotos.length ? 'rotura' : (sintomas.length ? 'sospecha' : 'sin_evidencia');
    if (veredicto_paso === 'rotura') pasos_rotos.push(numero);
    if (veredicto_paso === 'sospecha') pasos_sospechosos.push(numero);

    pasos.push({
      paso: numero,
      ancla_esperada: entrada.ancla_esperada,
      veredicto: veredicto_paso,
      sintomas
    });
  }

  const veredicto = sintomas_rotos > 0 ? 'rotura' : (sintomas_sospechosos > 0 ? 'sospecha' : 'sin_evidencia');

  let resumen;
  if (veredicto === 'rotura') {
    resumen = `Rotura en el paso ${pasos_rotos.join(', ')}: el mismo sintoma visto por ${UMBRAL} o mas evidencias independientes (${sintomas_rotos} sintoma(s) con dos testigos).`;
  } else if (veredicto === 'sospecha') {
    resumen = `Sospecha en el paso ${pasos_sospechosos.join(', ')}: una sola evidencia. No se retira ninguna receta hasta que otra independiente confirme.`;
  } else {
    resumen = 'Sin evidencia: no se ha visto fallar nada que se pueda contar, asi que no hay rotura ni sospecha.';
  }

  return {
    ok: true,
    veredicto,
    rotura: veredicto === 'rotura',
    sospecha: veredicto === 'sospecha',
    motivo: veredicto === 'sin_evidencia' ? MOTIVOS.SIN_EVIDENCIA : null,
    plataforma,
    capacidad: r.capacidad,
    clave: `${plataforma}:${r.capacidad}`,
    version: Number.isInteger(ambito && ambito.version) ? ambito.version : null,
    umbral: UMBRAL,
    pasos_rotos,
    pasos_sospechosos,
    pasos,
    consideradas: consideradas.length,
    descartadas,
    repetidas,
    resumen
  };
}

/** Atajo: ¿estas evidencias declaran rotura? (una sola es sospecha). */
function es_rotura(receta, evidencias, ambito) {
  const d = declarar(receta, evidencias, ambito);
  return d.ok === true && d.rotura === true;
}

/**
 * Firma estable de una declaracion: sirve para que dos proyectos que vieron la
 * misma rotura produzcan el MISMO identificador y la memoria de cambios (F3) no
 * guarde dos veces el mismo cambio de interfaz.
 */
function firma(declaracion) {
  if (!es_objeto(declaracion) || declaracion.ok !== true || declaracion.rotura !== true) return null;
  return declaracion.pasos
    .filter((p) => p.veredicto === 'rotura')
    .map((p) => {
      const sintomas = p.sintomas
        .filter((s) => s.veredicto === 'rotura')
        .map((s) => `${s.tipo}@${s.ancla ? normalizar_etiqueta(s.ancla.nombre_visible) : '-'}`)
        .sort()
        .join('+');
      return `${p.paso}:${sintomas}`;
    })
    .join(';');
}

module.exports = {
  TIPOS,
  VEREDICTOS,
  UMBRAL,
  MOTIVOS,
  normalizar_etiqueta,
  huella_de,
  leer_evidencia,
  declarar,
  es_rotura,
  firma
};

// Vista "clase" para quien prefiera el nombre del diseno (F1 · DeclaradorDeRotura).
module.exports.DeclaradorDeRotura = Object.freeze({
  declarar,
  es_rotura,
  firma,
  MOTIVOS,
  TIPOS,
  UMBRAL
});
