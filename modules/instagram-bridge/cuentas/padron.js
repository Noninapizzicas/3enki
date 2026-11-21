'use strict';

/**
 * padron — B1 · PadronDeCuentas · CUSTODIO (single-writer de su almacen).
 *
 * El padron es EL INDICE DE DUENOS del puente: que cuenta sirve a que proyecto y
 * en que aparato. No es la ficha (E1, bloque 10), no es el estado de sesion (D2)
 * y no es la cola (G3): es solo la terna **cuenta → proyecto → aparato**, con su
 * historia. Quien no esta aqui, no puede operar en nombre de nadie.
 *
 * Cardinalidades (el plano de obra las llama W3/W8):
 *   - una cuenta tiene UN proyecto vigente (para cambiarlo se hace `traspaso`,
 *     que deja historia; no se reescribe el asiento),
 *   - un proyecto puede tener N cuentas,
 *   - un aparato sostiene por defecto UNA cuenta (W3). Dos cuentas vivas en el
 *     mismo movil es la forma mas rapida de publicar en la cuenta equivocada.
 *
 * Reglas que esta pieza hace ejecutables:
 *   - **Baja archiva, no borra.** El asiento se queda para siempre con su
 *     `archivo` y su historia: sin el, no se puede reconstruir de quien fue una
 *     publicacion. Borrar de verdad es otra orden (B4), explicita y distinta.
 *   - **Traspaso no pierde historia.** El dueno cambia y el asiento gana un paso
 *     en `historia` con de/a/motivo/momento/quien. El `alta` de nacimiento no se
 *     toca nunca.
 *   - **Sin sello no hay asiento** (P1). El asiento nace sellado con el quinteto
 *     proyecto-cuenta-aparato-momento-quien; `auditar()` lo verifica sobre el
 *     almacen entero.
 *   - **Sin permiso registrado no se archiva.** El plano dice que B4 archiva con
 *     permiso registrado; el padron no acepta la orden sin `autorizacion_id`.
 *   - **Ningun secreto entra** (V1). Un alta o un traspaso que traiga una
 *     credencial se rechaza entero y se dice en que ruta venia.
 *
 * Puro: sin reloj, sin red, sin IO. Cada operacion recibe el `estado` y devuelve
 * un `estado` NUEVO (no muta el de entrada). El IO y el single-writer viven en
 * `index.js`, que es quien persiste; asi estas reglas se pueden probar sin
 * arrancar el bus ni tocar el disco.
 *
 * Ver plan-construccion.md secciones 2 (B1), 5.2 (estados de la cuenta) y 8
 * (bloque 2), y diseno-oop.md "PadronDeCuentas".
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, QUIENES } = require('../core/formas');
const { sellar, comprobar: comprobar_sello } = require('../core/sello');
const no_secretos = require('../core/no-secretos');

const ESQUEMA = 'padron-cuentas-v1';
const PLATAFORMA = 'instagram';

// Estados del indice de duenos. La ceremonia del alta (declarada / esperando
// persona / operativa) es de B2 y vive en su ficha; aqui solo se pregunta si el
// asiento sigue sirviendo o esta archivado.
const ESTADOS = Object.freeze(['vigente', 'archivada']);
const TIPOS_HISTORIA = Object.freeze(['traspaso', 'archivado', 'realta']);

// Handle canonico de Instagram: 1..30, minusculas, digitos, punto y guion bajo;
// no empieza ni acaba en punto. Se guarda normalizado (sin @) para que la
// comparacion sea exacta y no dependa de como lo escribio una persona.
const CUENTA_RE = /^[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9])?$/;

const MOTIVOS = Object.freeze({
  CUENTA_YA_INSCRITA: 'cuenta_ya_inscrita',
  CUENTA_DESCONOCIDA: 'cuenta_desconocida',
  CUENTA_ARCHIVADA: 'cuenta_archivada',
  YA_ARCHIVADA: 'ya_archivada',
  CARDINALIDAD_APARATO: 'cardinalidad_aparato',
  MISMO_PROYECTO: 'mismo_proyecto',
  AMBITO_INCOMPLETO: 'ambito_incompleto',
  SIN_AUTORIZACION: 'sin_autorizacion',
  SECRETO_RECIBIDO: 'secreto_recibido',
  ENTRADA_INVALIDA: 'entrada_invalida',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido'
});

// ---- estado ---------------------------------------------------------------

function estado_vacio() {
  return { esquema: ESQUEMA, revision: 0, actualizado: null, asientos: [] };
}

function es_estado(x) {
  return es_objeto(x) && x.esquema === ESQUEMA && Array.isArray(x.asientos);
}

// ---- utilidades -----------------------------------------------------------

/**
 * Handle canonico: sin @, sin barra final, en minusculas. Lo que no sea un
 * handle de Instagram se devuelve igual y lo rechaza el validador: normalizar no
 * es adivinar.
 */
function normalizar_cuenta(v) {
  if (typeof v !== 'string') return '';
  let h = v.trim();
  if (h.startsWith('@')) h = h.slice(1);
  h = h.replace(/\/+$/, '');
  return h.toLowerCase();
}

function clave_de(plataforma, cuenta) {
  return `${plataforma}:${cuenta}`;
}

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function indice_de(estado, plataforma, cuenta) {
  return estado.asientos.findIndex(
    (a) => a && a.plataforma === plataforma && a.cuenta === cuenta
  );
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

/**
 * Normaliza la entrada comun a alta/baja/traspaso: plataforma por defecto,
 * handle canonico y lista de huecos. Un rechazo nombra lo que falta.
 */
function preparar(entrada) {
  const e = es_objeto(entrada) ? entrada : {};
  const plataforma = texto_no_vacio(e.plataforma) ? String(e.plataforma).trim().toLowerCase() : PLATAFORMA;
  return { e, plataforma, cuenta: normalizar_cuenta(e.cuenta) };
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

// ---- alta -----------------------------------------------------------------

/**
 * Inscribe una cuenta en un proyecto y un aparato.
 *
 * @param {object} estado
 * @param {object} entrada {cuenta, proyecto, aparato, momento, quien, plataforma?, sello?, nota?}
 */
function alta(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const secreto = guardia_secretos(entrada);
  if (secreto) return secreto;

  const { e, plataforma, cuenta } = preparar(entrada);
  const faltan = [];
  for (const campo of ['cuenta', 'proyecto', 'aparato', 'momento', 'quien']) {
    if (vacio(e[campo])) faltan.push(campo);
  }
  const invalidos = [];
  if (!faltan.includes('cuenta') && !CUENTA_RE.test(cuenta)) invalidos.push('cuenta');
  if (!faltan.includes('momento') && !es_instante(e.momento)) invalidos.push('momento');
  if (!faltan.includes('quien') && !QUIENES.includes(String(e.quien).trim())) invalidos.push('quien');
  if (faltan.length || invalidos.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, faltan, invalidos);

  const proyecto = String(e.proyecto).trim();
  const aparato = String(e.aparato).trim();
  const momento = String(e.momento);
  const quien = String(e.quien).trim();

  const i = indice_de(estado, plataforma, cuenta);
  const previo = i === -1 ? null : estado.asientos[i];

  // Una cuenta con dueno vigente no se re-inscribe: se traspasa (y queda historia).
  if (previo && previo.estado === 'vigente') {
    return fallo(MOTIVOS.CUENTA_YA_INSCRITA, [], [], {
      asiento: clonar(previo),
      proyecto_vigente: previo.proyecto,
      pista: 'para cambiar de proyecto se usa traspaso, que deja historia'
    });
  }

  // W3: un aparato, una cuenta viva. Dos cuentas en el mismo movil es el atajo
  // mas corto a publicar en la cuenta equivocada.
  const ocupante = estado.asientos.find(
    (a) => a && a.estado === 'vigente' && a.aparato === aparato && clave_de(a.plataforma, a.cuenta) !== clave_de(plataforma, cuenta)
  );
  if (ocupante) {
    return fallo(MOTIVOS.CARDINALIDAD_APARATO, [], [], {
      aparato,
      cuenta_ocupante: ocupante.cuenta,
      pista: 'un aparato sostiene una cuenta por defecto (W3)'
    });
  }

  const nuevo = clonar(estado);
  const base = {
    cuenta,
    plataforma,
    proyecto,
    aparato,
    estado: 'vigente',
    desde: momento,
    alta: { momento, quien, aparato, proyecto },
    historia: [],
    archivo: null
  };

  // El asiento nace sellado (P1). Si el llamante ya trae sello valido, se
  // respeta: volver a sellar con el mismo quinteto es idempotente.
  let asiento;
  if (e.sello !== undefined && e.sello !== null) {
    const c = comprobar_sello({ sello: e.sello });
    if (!c.ok) return fallo('sin_sello', c.faltan || [], c.invalidos || []);
    asiento = Object.assign(base, { sello: c.sello });
  } else {
    const s = sellar(base, { proyecto, cuenta, aparato, momento, quien });
    if (!s.ok) return fallo(s.motivo || 'sin_sello', s.faltan || [], s.invalidos || []);
    asiento = s.dato;
  }

  if (previo) {
    // Realta de una cuenta archivada: no se borra nada, se anade el paso y el
    // archivo anterior queda en la historia.
    asiento.alta = clonar(previo.alta);
    asiento.historia = clonar(previo.historia);
    asiento.historia.push({
      secuencia: asiento.historia.length + 1,
      tipo: 'realta',
      de: { proyecto: previo.proyecto, aparato: previo.aparato, estado: previo.estado },
      a: { proyecto, aparato, estado: 'vigente' },
      motivo: texto_no_vacio(e.motivo) ? String(e.motivo).trim() : 'realta de una cuenta archivada',
      momento,
      quien
    });
    asiento.desde = momento;
    asiento.archivo = null;
    nuevo.asientos[i] = asiento;
  } else {
    nuevo.asientos.push(asiento);
  }

  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = momento;
  return { ok: true, estado: nuevo, asiento: clonar(asiento), cuenta, plataforma };
}

// ---- baja (archiva, no borra) ---------------------------------------------

/**
 * Archiva el asiento. El asiento NO se elimina: sigue en `asientos` con
 * `estado: 'archivada'`, su `archivo` y su historia intacta.
 *
 * @param {object} estado
 * @param {object} entrada {cuenta, motivo, momento, quien, autorizacion_id, plataforma?}
 */
function baja(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const secreto = guardia_secretos(entrada);
  if (secreto) return secreto;

  const { e, plataforma, cuenta } = preparar(entrada);
  const faltan = [];
  for (const campo of ['cuenta', 'motivo', 'momento', 'quien']) {
    if (vacio(e[campo])) faltan.push(campo);
  }
  const invalidos = [];
  if (!faltan.includes('momento') && !es_instante(e.momento)) invalidos.push('momento');
  // Sin permiso registrado no se archiva: el plano lo exige a B4 y el padron no
  // acepta la orden sin el asiento que la respalda.
  if (vacio(e.autorizacion_id)) faltan.push('autorizacion_id');
  if (faltan.length || invalidos.length) {
    const motivo = faltan.includes('autorizacion_id') && faltan.length === 1
      ? MOTIVOS.SIN_AUTORIZACION
      : MOTIVOS.ENTRADA_INVALIDA;
    return fallo(motivo, faltan, invalidos);
  }

  const i = indice_de(estado, plataforma, cuenta);
  if (i === -1) return fallo(MOTIVOS.CUENTA_DESCONOCIDA, [], [], { cuenta });
  if (estado.asientos[i].estado === 'archivada') {
    return fallo(MOTIVOS.YA_ARCHIVADA, [], [], { asiento: clonar(estado.asientos[i]) });
  }

  const momento = String(e.momento);
  const quien = String(e.quien).trim();
  const motivo = String(e.motivo).trim();

  const nuevo = clonar(estado);
  const asiento = nuevo.asientos[i];
  asiento.estado = 'archivada';
  asiento.archivo = {
    momento,
    motivo,
    quien,
    autorizacion_id: String(e.autorizacion_id).trim()
  };
  asiento.historia.push({
    secuencia: asiento.historia.length + 1,
    tipo: 'archivado',
    de: { proyecto: asiento.proyecto, aparato: asiento.aparato, estado: 'vigente' },
    a: { proyecto: asiento.proyecto, aparato: asiento.aparato, estado: 'archivada' },
    motivo,
    momento,
    quien,
    autorizacion_id: asiento.archivo.autorizacion_id
  });

  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = momento;

  // Se comprueba lo que se acaba de escribir: el asiento sigue existiendo y el
  // total no ha bajado. Es la forma de que "archivar no borra" no sea un comentario.
  const borrado = nuevo.asientos.length !== estado.asientos.length;
  return {
    ok: !borrado,
    motivo: borrado ? MOTIVOS.ENTRADA_INVALIDA : undefined,
    estado: nuevo,
    asiento: clonar(asiento),
    historia_conservada: nuevo.asientos.length === estado.asientos.length,
    motivo_baja: motivo
  };
}

// ---- traspaso -------------------------------------------------------------

/**
 * Cambia el dueno vigente de una cuenta sin perder nada: el asiento gana un paso
 * en `historia` y el `alta` de nacimiento queda como estaba.
 *
 * @param {object} estado
 * @param {object} entrada {cuenta, proyecto_destino, motivo, momento, quien, aparato?, plataforma?}
 */
function traspaso(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const secreto = guardia_secretos(entrada);
  if (secreto) return secreto;

  const { e, plataforma, cuenta } = preparar(entrada);
  const faltan = [];
  for (const campo of ['cuenta', 'proyecto_destino', 'motivo', 'momento', 'quien']) {
    if (vacio(e[campo])) faltan.push(campo);
  }
  const invalidos = [];
  if (!faltan.includes('momento') && !es_instante(e.momento)) invalidos.push('momento');
  if (faltan.length || invalidos.length) return fallo(MOTIVOS.ENTRADA_INVALIDA, faltan, invalidos);

  const i = indice_de(estado, plataforma, cuenta);
  if (i === -1) return fallo(MOTIVOS.CUENTA_DESCONOCIDA, [], [], { cuenta });

  const previo = estado.asientos[i];
  if (previo.estado === 'archivada') {
    return fallo(MOTIVOS.CUENTA_ARCHIVADA, [], [], {
      asiento: clonar(previo),
      pista: 'una cuenta archivada no se traspasa: se da de alta otra vez'
    });
  }

  const proyecto_destino = String(e.proyecto_destino).trim();
  const aparato = texto_no_vacio(e.aparato) ? String(e.aparato).trim() : previo.aparato;
  if (proyecto_destino === previo.proyecto && aparato === previo.aparato) {
    return fallo(MOTIVOS.MISMO_PROYECTO, [], [], { proyecto: previo.proyecto });
  }

  if (aparato !== previo.aparato) {
    const ocupante = estado.asientos.find(
      (a) => a && a.estado === 'vigente' && a.aparato === aparato && a.cuenta !== cuenta
    );
    if (ocupante) {
      return fallo(MOTIVOS.CARDINALIDAD_APARATO, [], [], {
        aparato,
        cuenta_ocupante: ocupante.cuenta
      });
    }
  }

  const momento = String(e.momento);
  const quien = String(e.quien).trim();
  const motivo = String(e.motivo).trim();

  const nuevo = clonar(estado);
  const asiento = nuevo.asientos[i];
  const de = { proyecto: asiento.proyecto, aparato: asiento.aparato };
  asiento.historia.push({
    secuencia: asiento.historia.length + 1,
    tipo: 'traspaso',
    de,
    a: { proyecto: proyecto_destino, aparato },
    motivo,
    momento,
    quien
  });
  asiento.proyecto = proyecto_destino;
  asiento.aparato = aparato;
  asiento.desde = momento;

  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = momento;

  return {
    ok: true,
    estado: nuevo,
    asiento: clonar(asiento),
    de,
    a: { proyecto: proyecto_destino, aparato },
    historia_conservada: asiento.historia.length
  };
}

// ---- lecturas -------------------------------------------------------------

/** El asiento de una cuenta (vigente o archivado), o null. */
function consultar(estado, consulta) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const { plataforma, cuenta } = preparar(consulta);
  if (!cuenta) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['cuenta'], []);
  const i = indice_de(estado, plataforma, cuenta);
  if (i === -1) return { ok: true, asiento: null, cuenta, hallada: false };
  return { ok: true, asiento: clonar(estado.asientos[i]), cuenta, hallada: true };
}

/** El dueno vigente de una cuenta, o null si no la hay o esta archivada. */
function vigente_de(estado, consulta) {
  const r = consultar(estado, consulta);
  if (!r.ok || !r.asiento) return null;
  return r.asiento.estado === 'vigente' ? r.asiento : null;
}

/**
 * Lista asientos por ambito. Exige al menos un criterio de ambito: sin el, la
 * respuesta mezclaria proyectos y el padron dejaria de ser un indice para
 * convertirse en un vertedero (motivo `ambito_incompleto`, el mismo que declara
 * el contrato `instagram.cuenta.padron.consultar`).
 *
 * @param {object} estado
 * @param {{proyecto?:string, aparato?:string, cuenta?:string, plataforma?:string, estado?:string}} filtro
 */
function listar(estado, filtro) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const f = es_objeto(filtro) ? filtro : {};

  if (vacio(f.proyecto) && vacio(f.aparato) && vacio(f.cuenta)) {
    return fallo(MOTIVOS.AMBITO_INCOMPLETO, ['proyecto|aparato|cuenta'], [], {
      pista: 'el padron se lee por proyecto, por aparato o por cuenta; nunca entero y mezclado'
    });
  }
  if (!vacio(f.estado) && !ESTADOS.includes(String(f.estado).trim())) {
    return fallo(MOTIVOS.ENTRADA_INVALIDA, [], ['estado']);
  }

  const proyecto = texto_no_vacio(f.proyecto) ? String(f.proyecto).trim() : null;
  const aparato = texto_no_vacio(f.aparato) ? String(f.aparato).trim() : null;
  const cuenta = vacio(f.cuenta) ? null : normalizar_cuenta(f.cuenta);
  const plataforma = texto_no_vacio(f.plataforma) ? String(f.plataforma).trim().toLowerCase() : null;
  const estado_pedido = vacio(f.estado) ? null : String(f.estado).trim();

  const asientos = estado.asientos.filter((a) => {
    if (!a) return false;
    if (proyecto && a.proyecto !== proyecto) return false;
    if (aparato && a.aparato !== aparato) return false;
    if (cuenta && a.cuenta !== cuenta) return false;
    if (plataforma && a.plataforma !== plataforma) return false;
    if (estado_pedido && a.estado !== estado_pedido) return false;
    return true;
  }).map(clonar);

  return {
    ok: true,
    asientos,
    total: asientos.length,
    ambito: { proyecto, aparato, cuenta, plataforma, estado: estado_pedido }
  };
}

/** Las N cuentas vigentes de un proyecto (la cardinalidad que el plano permite). */
function cuentas_de(estado, proyecto) {
  const r = listar(estado, { proyecto, estado: 'vigente' });
  return r.ok ? r.asientos : [];
}

/** Las cuentas vigentes que sostiene un aparato (por defecto, como mucho una). */
function cuentas_en_aparato(estado, aparato) {
  const r = listar(estado, { aparato, estado: 'vigente' });
  return r.ok ? r.asientos : [];
}

// ---- auditoria del almacen ------------------------------------------------

/**
 * Audita el padron ENTERO: esquema, secretos (V1) y sello de cada asiento (P1).
 * Un solo problema mancha el almacen. Lo llama `index.js` antes de persistir y
 * lo llaman los tests para afirmar el invariante sobre el fichero real.
 */
function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, problemas: [{ ruta: '(raiz)', motivo: MOTIVOS.ESQUEMA_DESCONOCIDO }] };
  }
  for (const h of no_secretos.detectar_secreto(estado)) {
    problemas.push({ ruta: h.ruta, motivo: 'secreto', familia: h.familia });
  }
  estado.asientos.forEach((a, i) => {
    const c = comprobar_sello(a);
    if (!c.ok) {
      problemas.push({
        ruta: `asientos[${i}]`,
        motivo: 'sin_sello',
        faltan: c.faltan,
        invalidos: c.invalidos
      });
    }
    if (a && !ESTADOS.includes(a.estado)) {
      problemas.push({ ruta: `asientos[${i}].estado`, motivo: 'estado_no_declarado', valor: a && a.estado });
    }
    if (a && a.historia !== undefined) {
      if (!Array.isArray(a.historia)) {
        problemas.push({ ruta: `asientos[${i}].historia`, motivo: 'historia_no_es_lista' });
      } else {
        a.historia.forEach((paso, j) => {
          if (!es_objeto(paso) || !TIPOS_HISTORIA.includes(paso.tipo)) {
            problemas.push({
              ruta: `asientos[${i}].historia[${j}]`,
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

module.exports = {
  ESQUEMA,
  PLATAFORMA,
  ESTADOS,
  TIPOS_HISTORIA,
  CUENTA_RE,
  MOTIVOS,
  estado_vacio,
  es_estado,
  normalizar_cuenta,
  clave_de,
  alta,
  baja,
  traspaso,
  consultar,
  vigente_de,
  listar,
  cuentas_de,
  cuentas_en_aparato,
  auditar
};

// Vista "clase" para quien prefiera el nombre del diseno (B1 · PadronDeCuentas).
module.exports.PadronDeCuentas = Object.freeze({
  alta,
  baja,
  traspaso,
  consultar,
  listar,
  vigente_de,
  auditar
});
