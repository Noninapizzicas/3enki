'use strict';

/**
 * retratos — M1 · RetratoFechado · CUSTODIO (single-writer de su almacen).
 *
 * La foto de la cuenta CON SU FECHA. La regla del bloque, en una linea:
 * **un dato sin fecha es una opinion**. Un retrato no es "los seguidores de
 * esta cuenta": es "los seguidores que se leyeron a las 09:00 del 11". Sin el
 * segundo dato no hay foto, hay un comentario.
 *
 * COMO SE HACE EJECUTABLE:
 *   1. **La foto lleva fecha propia** (`tomado_en`, instante con zona). Sin
 *      ella no se custodia: `dato_sin_fecha`.
 *   2. **Cada dato lleva SU fecha** (`leido_en`), no solo la de la foto. Un
 *      retrato se puede montar con lecturas de hace diez minutos y de ayer; la
 *      fecha de la foto sola mentiria sobre la mitad de las cifras.
 *   3. **Un dato posterior a la foto es imposible.** Si `leido_en > tomado_en`
 *      se rechaza (`dato_posterior_al_retrato`): o la fecha de la foto esta
 *      mal, o el dato no es de esta foto. Las dos cosas hay que arreglarlas
 *      antes de guardar, no despues.
 *   4. **`valor: null` es un dato, no un hueco.** "A las 09:00 no se pudo leer
 *      el alcance" es informacion; se guarda con su fecha y su `motivo`. Lo
 *      que no se admite es el dato sin fecha, aunque venga vacio.
 *
 * LO QUE ESTE CUSTODIO NO HACE:
 *   - **No corrige un retrato.** Append-only: un retrato no se edita ni se
 *     borra. Si la foto estaba mal, se toma otra; la historia es la que dice
 *     que paso. Reescribir la foto de ayer para que cuadre con hoy es la forma
 *     mas comoda de no tener nunca un error.
 *   - **No calcula cambios.** Eso es M2 (`core/cambio.js`), que es puro y no
 *     necesita el almacen para nada.
 *   - **No inventa la fecha.** El reloj no vive aqui: `tomado_en` viene en el
 *     payload. `guardado_en` es metadato del fichero, no del negocio.
 *
 * Nada se persiste sin auditar (sello P1, fechas, secretos V1): antes de cada
 * escritura corre `auditar()`. Un almacen ilegible NO se sobrescribe.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, validar_sello_de_cuenta } = require('../core/formas');
const no_secretos = require('../core/no-secretos');
const { CustodiaJSON } = require('./custodia');

const ESQUEMA = 'retratos-fechados-v1';
const ALMACEN = 'retratos';
const FICHERO = 'retratos.json';
const CLAVE = 'retratos';

const MOTIVOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  SIN_SELLO: 'sin_sello_de_cuenta',
  SIN_FECHA: 'dato_sin_fecha',
  SIN_DATOS: 'sin_datos',
  DATO_SIN_NOMBRE: 'dato_sin_nombre',
  DATO_DUPLICADO: 'dato_duplicado',
  DATO_POSTERIOR_AL_RETRATO: 'dato_posterior_al_retrato',
  RETRATO_ID_YA_USADO_CON_OTROS_DATOS: 'retrato_id_ya_usado_con_otros_datos',
  SECRETO_RECIBIDO: 'secreto_recibido',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  ALMACEN_NO_AUDITADO: 'almacen_no_auditado'
});

// ---------------------------------------------------------------------------
// normalizacion y auditoria (puro)
// ---------------------------------------------------------------------------

/**
 * Normaliza `datos` a lista. Admite lista (`[{nombre, valor, leido_en}]`) y
 * mapa (`{seguidores: {valor, leido_en}}`), porque a mano es comodo escribirlo
 * como mapa. En los dos casos, el resultado es el mismo.
 */
function normalizar_datos(datos) {
  const lista = [];
  const faltan = [];
  const invalidos = [];

  if (Array.isArray(datos)) {
    datos.forEach((d, i) => {
      if (!es_objeto(d)) { invalidos.push(`datos[${i}]`); return; }
      if (!texto_no_vacio(d.nombre)) { faltan.push(`datos[${i}].nombre`); return; }
      lista.push({
        nombre: String(d.nombre).trim(),
        valor: clonar(d.valor === undefined ? null : d.valor),
        leido_en: d.leido_en,
        motivo: texto_no_vacio(d.motivo) ? String(d.motivo).trim() : null
      });
    });
  } else if (es_objeto(datos)) {
    for (const nombre of Object.keys(datos)) {
      const d = datos[nombre];
      if (es_objeto(d) && ('valor' in d || 'leido_en' in d)) {
        lista.push({
          nombre: String(nombre).trim(),
          valor: clonar(d.valor === undefined ? null : d.valor),
          leido_en: d.leido_en,
          motivo: texto_no_vacio(d.motivo) ? String(d.motivo).trim() : null
        });
      } else {
        // `{seguidores: 1200}` es un dato SIN fecha: se conserva el valor para
        // poder nombrarlo, pero no entra como foto valida.
        lista.push({ nombre: String(nombre).trim(), valor: clonar(d), leido_en: undefined, motivo: null });
      }
    }
  } else if (datos !== undefined && datos !== null) {
    invalidos.push('datos');
  }

  return { lista, faltan, invalidos };
}

function retrato_id_de(sello, tomado_en) {
  return `${sello.proyecto}:${sello.plataforma}:${sello.cuenta}:${tomado_en}`;
}

/**
 * Valida y normaliza un retrato. Devuelve `{ok, retrato}` o un rechazo que
 * nombra el hueco: el campo, el indice y el nombre del dato.
 *
 * @param {*} entrada
 * @returns {object}
 */
function preparar(entrada) {
  if (!es_objeto(entrada)) {
    return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['retrato'], invalidos: [] };
  }

  const sello_v = validar_sello_de_cuenta(entrada.sello);
  if (!sello_v.ok) {
    return { ok: false, motivo: MOTIVOS.SIN_SELLO, faltan: sello_v.faltan, invalidos: sello_v.invalidos };
  }
  const sello = {
    proyecto: String(entrada.sello.proyecto).trim(),
    cuenta: String(entrada.sello.cuenta).trim(),
    plataforma: String(entrada.sello.plataforma === undefined ? 'instagram' : entrada.sello.plataforma).trim()
  };

  if (!es_instante(entrada.tomado_en)) {
    return { ok: false, motivo: MOTIVOS.SIN_FECHA, faltan: ['tomado_en'], invalidos: [] };
  }
  const tomado_en = String(entrada.tomado_en);

  const n = normalizar_datos(entrada.datos);
  if (n.invalidos.length) {
    return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: n.faltan, invalidos: n.invalidos };
  }
  if (n.lista.length === 0) {
    return { ok: false, motivo: MOTIVOS.SIN_DATOS, faltan: ['datos'], invalidos: [] };
  }

  const sin_fecha = [];
  const posteriores = [];
  const vistos = new Set();
  const duplicados = [];

  for (const d of n.lista) {
    if (!texto_no_vacio(d.nombre)) { sin_fecha.push('(sin_nombre)'); continue; }
    if (!es_instante(d.leido_en)) { sin_fecha.push(d.nombre); continue; }
    if (Date.parse(d.leido_en) > Date.parse(tomado_en)) { posteriores.push(d.nombre); continue; }
    if (vistos.has(d.nombre)) { duplicados.push(d.nombre); continue; }
    vistos.add(d.nombre);
    d.leido_en = String(d.leido_en);
  }

  if (sin_fecha.length) {
    return { ok: false, motivo: MOTIVOS.SIN_FECHA, datos_sin_fecha: sin_fecha, faltan: ['datos[].leido_en'] };
  }
  if (posteriores.length) {
    return { ok: false, motivo: MOTIVOS.DATO_POSTERIOR_AL_RETRATO, datos_posteriores: posteriores };
  }
  if (duplicados.length) {
    return { ok: false, motivo: MOTIVOS.DATO_DUPLICADO, datos_duplicados: duplicados };
  }

  const retrato = {
    retrato_id: texto_no_vacio(entrada.retrato_id) ? String(entrada.retrato_id).trim() : retrato_id_de(sello, tomado_en),
    sello,
    tomado_en,
    datos: n.lista.slice(),
    fuentes: Array.isArray(entrada.fuentes) ? clonar(entrada.fuentes) : [],
    nota: texto_no_vacio(entrada.nota) ? String(entrada.nota).trim() : null
  };

  return { ok: true, retrato };
}

/**
 * Audita UN retrato. Es la misma comprobacion que `preparar` mas la de
 * secretos: sirve para lo que ya esta guardado, aunque se guardara con otra
 * version de la tabla. Devuelve la lista de problemas, no un booleano mudo.
 */
function auditar(retrato) {
  const problemas = [];
  if (!es_objeto(retrato)) return { ok: false, problemas: [{ motivo: MOTIVOS.ENTRADA_INVALIDA, campo: 'retrato' }] };

  const sello_v = validar_sello_de_cuenta(retrato.sello);
  if (!sello_v.ok) problemas.push({ motivo: MOTIVOS.SIN_SELLO, campo: 'sello', faltan: sello_v.faltan, invalidos: sello_v.invalidos });
  if (!es_instante(retrato.tomado_en)) problemas.push({ motivo: MOTIVOS.SIN_FECHA, campo: 'tomado_en' });
  if (!Array.isArray(retrato.datos) || retrato.datos.length === 0) {
    problemas.push({ motivo: MOTIVOS.SIN_DATOS, campo: 'datos' });
  } else {
    retrato.datos.forEach((d, i) => {
      if (!es_objeto(d) || !texto_no_vacio(d.nombre)) {
        problemas.push({ motivo: MOTIVOS.DATO_SIN_NOMBRE, campo: `datos[${i}].nombre` });
        return;
      }
      if (!es_instante(d.leido_en)) problemas.push({ motivo: MOTIVOS.SIN_FECHA, campo: `datos[${i}].leido_en`, dato: d.nombre });
      else if (es_instante(retrato.tomado_en) && Date.parse(d.leido_en) > Date.parse(retrato.tomado_en)) {
        problemas.push({ motivo: MOTIVOS.DATO_POSTERIOR_AL_RETRATO, campo: `datos[${i}].leido_en`, dato: d.nombre });
      }
    });
  }

  const hallazgos = no_secretos.detectar_secreto({ sello: retrato.sello, datos: retrato.datos, nota: retrato.nota });
  for (const h of hallazgos) problemas.push({ motivo: MOTIVOS.SECRETO_RECIBIDO, campo: h.ruta });

  return { ok: problemas.length === 0, problemas };
}

/** Audita el almacen entero. Es el test permanente sobre lo ya guardado. */
function auditar_almacen(estado) {
  const problemas = [];
  if (!es_objeto(estado) || !Array.isArray(estado[CLAVE])) {
    return { ok: false, problemas: [{ motivo: MOTIVOS.ESQUEMA_DESCONOCIDO, campo: 'almacen' }] };
  }
  for (const r of estado[CLAVE]) {
    const a = auditar(r);
    if (!a.ok) {
      for (const p of a.problemas) {
        problemas.push(Object.assign({ retrato_id: r && r.retrato_id ? r.retrato_id : null }, p));
      }
    }
  }
  return { ok: problemas.length === 0, problemas, retratos: estado[CLAVE].length };
}

// ---------------------------------------------------------------------------
// consultas puras sobre el estado
// ---------------------------------------------------------------------------

function mismo_sello(a, b) {
  return !!a && !!b && a.proyecto === b.proyecto && a.cuenta === b.cuenta && a.plataforma === b.plataforma;
}

function sellos_coinciden(retrato, consulta) {
  if (!es_objeto(consulta) || !es_objeto(consulta.sello)) return true;
  return mismo_sello(retrato.sello, {
    proyecto: consulta.sello.proyecto,
    cuenta: consulta.sello.cuenta,
    plataforma: consulta.sello.plataforma === undefined ? 'instagram' : consulta.sello.plataforma
  });
}

/**
 * La ultima foto de una cuenta: la de `tomado_en` mayor. Empate de instante
 * (dos fotos en el mismo segundo): gana la ultima que entro, que es la que el
 * custodio tiene mas a mano. Una foto de OTRA cuenta nunca es "la ultima".
 */
function ultimo(estado, consulta) {
  const lista = Array.isArray(estado[CLAVE]) ? estado[CLAVE].filter((r) => sellos_coinciden(r, consulta)) : [];
  if (lista.length === 0) return { ok: true, encontrado: false, retrato: null };
  let elegido = lista[0];
  for (const r of lista) {
    if (Date.parse(r.tomado_en) >= Date.parse(elegido.tomado_en)) elegido = r;
  }
  return { ok: true, encontrado: true, retrato: clonar(elegido) };
}

/** Historial de una cuenta, de la foto mas vieja a la mas nueva. */
function historial(estado, consulta) {
  const lista = Array.isArray(estado[CLAVE]) ? estado[CLAVE].filter((r) => sellos_coinciden(r, consulta)) : [];
  const orden = lista
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (Date.parse(a.r.tomado_en) - Date.parse(b.r.tomado_en)) || (a.i - b.i))
    .map((x) => clonar(x.r));
  return { ok: true, retratos: orden, total: orden.length };
}

function buscar(estado, retrato_id) {
  const id = texto_no_vacio(retrato_id) ? String(retrato_id).trim() : null;
  if (!id) return { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA, faltan: ['retrato_id'] };
  const lista = Array.isArray(estado[CLAVE]) ? estado[CLAVE] : [];
  const r = lista.find((x) => x && x.retrato_id === id) || null;
  return { ok: true, encontrado: r !== null, retrato: r ? clonar(r) : null };
}

// ---------------------------------------------------------------------------
// el custodio
// ---------------------------------------------------------------------------

class RetratosFechados extends CustodiaJSON {
  constructor(opts = {}) {
    super({
      directorio: opts.directorio,
      fichero: opts.fichero || FICHERO,
      esquema: ESQUEMA,
      almacen: ALMACEN,
      clave: CLAVE,
      reloj: opts.reloj
    });
  }

  /**
   * Toma una foto. Append-only e idempotente por `retrato_id`: reenviar la
   * misma foto no duplica el asiento. Reenviar el MISMO id con OTROS datos no
   * es un reintento, es reescribir la foto: se rechaza.
   */
  custodiar(entrada) {
    return this._mutar((estado) => {
      const p = preparar(entrada);
      if (!p.ok) return Object.assign({}, p, { guardado: false });

      const ya = estado[CLAVE].find((r) => r && r.retrato_id === p.retrato.retrato_id) || null;
      if (ya) {
        const mismos = JSON.stringify(ya.datos) === JSON.stringify(p.retrato.datos)
          && ya.tomado_en === p.retrato.tomado_en;
        if (!mismos) {
          return {
            ok: false,
            motivo: MOTIVOS.RETRATO_ID_YA_USADO_CON_OTROS_DATOS,
            retrato_id: p.retrato.retrato_id,
            guardado: false
          };
        }
        return { ok: true, retrato_id: p.retrato.retrato_id, repetido: true, sin_escritura: true };
      }

      const guardado_en = this._reloj();
      estado[CLAVE] = estado[CLAVE].concat([Object.assign({}, p.retrato, { guardado_en })]);
      return { ok: true, retrato_id: p.retrato.retrato_id, repetido: false, tomado_en: p.retrato.tomado_en };
    }, auditar_almacen);
  }

  /** La ultima foto de la cuenta (filtrada por `consulta.sello`). */
  ultimo(consulta) {
    return this._consultar((estado) => ultimo(estado, consulta));
  }

  /** Todas las fotos de la cuenta, en orden. */
  historial(consulta) {
    return this._consultar((estado) => historial(estado, consulta));
  }

  /** Una foto por id. */
  leer(retrato_id) {
    return this._consultar((estado) => buscar(estado, retrato_id));
  }

  /** Auditoria permanente del almacen. */
  auditar_almacen() {
    return this._consultar((estado) => auditar_almacen(estado));
  }
}

module.exports = {
  ESQUEMA,
  ALMACEN,
  FICHERO,
  MOTIVOS,
  normalizar_datos,
  preparar,
  auditar,
  auditar_almacen,
  ultimo,
  historial,
  buscar,
  RetratosFechados
};

module.exports.RetratoFechado = Object.freeze({
  preparar,
  auditar,
  ultimo,
  historial,
  MOTIVOS
});
