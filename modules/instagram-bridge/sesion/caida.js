'use strict';

/**
 * caida — D2 · CaidaYReautenticacion · CUSTODIO (logica pura del almacen).
 *
 * Cuando la sesion se cae (o la plataforma pide volver a entrar) hay que decidir
 * QUE PASA CON EL TRABAJO QUE ESTABA EN VUELO. No hay una respuesta: hay dos, y
 * dependen de una sola pregunta.
 *
 *   ¿el paso en curso pudo cambiar el mundo?
 *     NO   -> lo reversible: el trabajo VUELVE CON SU PASO a la cola, tal cual
 *             estaba. No se reinicia la operacion ni se pierde el numero de paso.
 *     SI   -> lo irreversible: el trabajo va a REVISION. Una persona mira la
 *             cuenta y decide si aquel paso llego a ocurrir antes de que el
 *             puente vuelva a tocarla.
 *     NO SE SABE -> tambien revision (el lado caro, siempre).
 *
 * # La reautenticacion es SIEMPRE humana
 *
 * El puente no teclea contrasenas, no guarda credenciales y no resuelve un
 * captcha. La sesion la abre una persona. Por eso:
 *   - `reanudar()` exige `quien === 'dueno'` y un `autorizacion_id` registrado;
 *   - el sistema puede DETECTAR la caida (quien: 'sistema'/'agente'), pero no
 *     puede autorizar la vuelta;
 *   - una sesion reabierta NO cierra una revision abierta: son dos cosas
 *     distintas y se resuelven por separado (`resolver_revision`).
 *
 * # Lo que esta pieza NO hace
 *
 * No escribe, no publica, no llama a nadie: recibe el estado y devuelve un estado
 * NUEVO (no muta el de entrada). El IO y el single-writer viven en `index.js`.
 * Sin reloj: el `momento` lo trae el payload.
 *
 * Ver plan-construccion.md (bloque 8, D2) y diseno-oop.md
 * "CaidaYReautenticacion".
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, QUIENES, PLATAFORMAS } = require('../core/formas');
const { sellar, comprobar: comprobar_sello } = require('../core/sello');
const no_secretos = require('../core/no-secretos');

const ESQUEMA = 'sesion-cuentas-v1';

// Estados de la SESION de una cuenta. No hay un tercero: o hay sesion o hace
// falta una persona. Cualquier otro estado (mirando, reintentando) es del bucle,
// no de la sesion.
const ESTADOS = Object.freeze(['operativa', 'reauth_pendiente']);

// Que pudo hacer el paso en curso con el mundo. Es la unica pregunta que decide
// el destino del trabajo.
const CONSECUENCIAS = Object.freeze(['ninguna', 'posible', 'incierta']);

// Destinos del trabajo. `sin_trabajo_en_vuelo` no es un destino: es el caso de la
// caida sin trabajo (se cae la sesion mientras el puente no hacia nada).
const DESENLACES = Object.freeze(['vuelve_con_su_paso', 'revision', 'sin_trabajo_en_vuelo']);

const ESTADOS_TRABAJO = Object.freeze(['en_cola', 'en_revision', 'descartado']);

const TIPOS_HISTORIA = Object.freeze(['caida', 'reautenticacion', 'revision_resuelta']);

const MOTIVOS = Object.freeze({
  ENTRADA_INCOMPLETA: 'entrada_incompleta',
  ENTRADA_INVALIDA: 'entrada_invalida',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  CUENTA_DESCONOCIDA: 'cuenta_desconocida',
  SECRETO_RECIBIDO: 'secreto_recibido',
  REAUTH_EXIGE_PERSONA: 'reauth_exige_persona',
  SIN_AUTORIZACION: 'sin_autorizacion',
  SIN_REAUTH_PENDIENTE: 'sin_reauth_pendiente',
  SIN_REVISION: 'sin_revision',
  DECISION_NO_DECLARADA: 'decision_no_declarada',
  YA_OPERATIVA: 'ya_operativa'
});

const CUENTA_RE = /^[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9])?$/;

// ---- estado ---------------------------------------------------------------

function estado_vacio() {
  return { esquema: ESQUEMA, revision: 0, actualizado: null, cuentas: [] };
}

function es_estado(x) {
  return es_objeto(x) && x.esquema === ESQUEMA && Array.isArray(x.cuentas);
}

// ---- utilidades -----------------------------------------------------------

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

function indice_de(estado, plataforma, cuenta) {
  return estado.cuentas.findIndex((a) => a && a.plataforma === plataforma && a.cuenta === cuenta);
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

function guardia_secretos(entrada) {
  const hallazgos = no_secretos.detectar_secreto(entrada);
  if (hallazgos.length === 0) return null;
  return fallo(MOTIVOS.SECRETO_RECIBIDO, [], [], {
    rutas: hallazgos.map((h) => h.ruta),
    familias: no_secretos.familias_de(hallazgos),
    guardado: false
  });
}

function plataforma_de(entrada) {
  return texto_no_vacio(entrada.plataforma) ? String(entrada.plataforma).trim().toLowerCase() : 'instagram';
}

/**
 * Que destino tiene el trabajo con esta consecuencia. Tabla CERRADA y en orden:
 * solo `ninguna` es reversible. Lo que no esta declarado NO se supone reversible.
 */
function desenlace_de(consecuencia) {
  return consecuencia === 'ninguna' ? 'vuelve_con_su_paso' : 'revision';
}

/**
 * La consecuencia del paso, tal como vino, y de donde salio. Una consecuencia
 * ausente o no declarada se resuelve como `incierta` y se DICE
 * (`origen: 'por_defecto'`): es el lado caro, y nadie puede leer despues que se
 * sabia que era reversible.
 */
function consecuencia_de(entrada) {
  const declarada = es_objeto(entrada.paso) && entrada.paso.consecuencia !== undefined
    ? entrada.paso.consecuencia
    : entrada.consecuencia;

  if (CONSECUENCIAS.includes(declarada)) {
    return { valor: declarada, origen: 'declarada' };
  }
  if (declarada === undefined || declarada === null) {
    return { valor: 'incierta', origen: 'por_defecto' };
  }
  return { valor: 'incierta', origen: 'invalida', recibida: declarada };
}

/** El paso, conservado tal cual: numero, ancla y accion si venian. */
function paso_conservado(entrada) {
  if (!es_objeto(entrada.paso)) return null;
  const paso = {
    numero: Number.isInteger(entrada.paso.numero) ? entrada.paso.numero : null,
    ancla: entrada.paso.ancla === undefined ? null : clonar(entrada.paso.ancla),
    accion: entrada.paso.accion === undefined ? null : clonar(entrada.paso.accion)
  };
  return paso;
}

function trabajo_de(entrada, consecuencia, desenlace, momento) {
  if (desenlace === 'sin_trabajo_en_vuelo') return null;

  const paso = paso_conservado(entrada);
  const trabajo = {
    operacion_id: texto_no_vacio(entrada.operacion_id) ? String(entrada.operacion_id).trim() : null,
    paso,
    consecuencia: consecuencia.valor,
    consecuencia_origen: consecuencia.origen,
    desenlace,
    estado: desenlace === 'revision' ? 'en_revision' : 'en_cola',
    devuelto_en: momento
  };

  if (desenlace === 'revision') {
    trabajo.revision = {
      motivo: consecuencia.valor === 'incierta' ? 'consecuencia_incierta' : 'consecuencia_posible',
      consecuencia: consecuencia.valor,
      desde: momento,
      que_hace_falta:
        'una persona mire la cuenta y confirme si el paso llego a ocurrir antes de que el puente la vuelva a tocar'
    };
  }

  return trabajo;
}

// ---- caida ----------------------------------------------------------------

/**
 * Registra una caida de sesion y decide el destino del trabajo en vuelo.
 *
 * @param {object} estado
 * @param {object} entrada
 *   {cuenta, proyecto, aparato, motivo, momento, quien,
 *    operacion_id?, paso?:{numero, consecuencia}, consecuencia?}
 * @returns {{ok:boolean, estado?:object, asiento?:object, desenlace?:string,
 *            trabajo?:object|null, reautenticacion?:object, motivo?:string,
 *            faltan?:string[], invalidos?:string[]}}
 */
function registrar_caida(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);

  const e = es_objeto(entrada) ? entrada : {};
  const secreto = guardia_secretos(e);
  if (secreto) return secreto;

  const plataforma = plataforma_de(e);
  const cuenta = normalizar_cuenta(e.cuenta);

  const faltan = [];
  if (!cuenta) faltan.push('cuenta');
  else if (!CUENTA_RE.test(cuenta)) faltan.push('cuenta (handle no valido)');
  if (!texto_no_vacio(e.proyecto)) faltan.push('proyecto');
  if (!texto_no_vacio(e.aparato)) faltan.push('aparato');
  if (!es_instante(e.momento)) faltan.push('momento');
  if (!QUIENES.includes(e.quien)) faltan.push('quien');
  if (!texto_no_vacio(e.motivo)) faltan.push('motivo');
  if (!PLATAFORMAS.includes(plataforma)) faltan.push('plataforma');

  if (faltan.length > 0) return fallo(MOTIVOS.ENTRADA_INCOMPLETA, faltan, []);

  const consecuencia = consecuencia_de(e);
  const hay_trabajo = es_objeto(e.paso) || texto_no_vacio(e.operacion_id) || e.consecuencia !== undefined;
  let desenlace = hay_trabajo ? desenlace_de(consecuencia.valor) : 'sin_trabajo_en_vuelo';

  const momento = e.momento;
  const quien = e.quien;
  const motivo = String(e.motivo).trim();

  const i = indice_de(estado, plataforma, cuenta);
  const previo = i === -1 ? null : estado.cuentas[i];

  let trabajo = trabajo_de(e, consecuencia, desenlace, momento);

  // Una revision pendiente NO se pisa: si la sesion vuelve a caer mientras hay
  // un trabajo en revision, el trabajo sigue en revision (lo irreversible no se
  // cierra por cansancio).
  if (previo && previo.trabajo && previo.trabajo.estado === 'en_revision' && (!trabajo || trabajo.estado !== 'en_revision')) {
    // Da igual que la caida nueva no traiga paso: lo que estaba en revision
    // sigue en revision. Perderlo seria cerrar una duda por no volver a oirla.
    trabajo = clonar(previo.trabajo);
    trabajo.origen = 'revision_pendiente';
    // El desenlace que se devuelve es el del TRABAJO, no el de esta caida: si
    // sigue en revision, se dice revision aunque esta caida no traiga paso.
    desenlace = 'revision';
  }

  const caida = {
    motivo,
    momento,
    quien,
    consecuencia: consecuencia.valor,
    consecuencia_origen: consecuencia.origen
  };
  if (consecuencia.recibida !== undefined) caida.consecuencia_recibida = consecuencia.recibida;

  const reautenticacion = {
    exige: 'persona',
    desde: momento,
    motivo,
    autorizada: false
  };

  let asiento;
  if (previo) {
    asiento = Object.assign({}, clonar(previo), {
      proyecto: String(e.proyecto).trim(),
      aparato: String(e.aparato).trim(),
      estado: 'reauth_pendiente',
      caida,
      reautenticacion,
      trabajo,
      historia: (Array.isArray(previo.historia) ? clonar(previo.historia) : []).concat([
        {
          tipo: 'caida',
          momento,
          quien,
          motivo,
          desenlace,
          consecuencia: consecuencia.valor,
          consecuencia_origen: consecuencia.origen
        }
      ])
    });
  } else {
    asiento = {
      plataforma,
      cuenta,
      proyecto: String(e.proyecto).trim(),
      aparato: String(e.aparato).trim(),
      estado: 'reauth_pendiente',
      caida,
      reautenticacion,
      trabajo,
      historia: [
        {
          tipo: 'caida',
          momento,
          quien,
          motivo,
          desenlace,
          consecuencia: consecuencia.valor,
          consecuencia_origen: consecuencia.origen
        }
      ]
    };
    const s = sellar(asiento, {
      proyecto: asiento.proyecto,
      cuenta,
      aparato: asiento.aparato,
      momento,
      quien
    });
    if (!s.ok) {
      return fallo(s.motivo || 'sin_sello', s.faltan || [], s.invalidos || [], {
        guardado: false,
        motivo_sello: s.motivo
      });
    }
    asiento = s.dato;
  }

  const cuentas = estado.cuentas.slice();
  if (i === -1) cuentas.push(asiento);
  else cuentas[i] = asiento;

  const siguiente = {
    esquema: ESQUEMA,
    revision: (estado.revision || 0) + 1,
    actualizado: momento,
    cuentas
  };

  return {
    ok: true,
    estado: siguiente,
    asiento: clonar(asiento),
    desenlace,
    trabajo,
    reautenticacion,
    cuenta,
    plataforma,
    requiere_acuse: desenlace === 'revision'
  };
}

// ---- reautenticacion ------------------------------------------------------

/**
 * La sesion vuelve. SIEMPRE por mano humana: `quien` tiene que ser `dueno` y
 * tiene que venir un `autorizacion_id` registrado. El sistema detecta la caida;
 * no la repara.
 *
 * Un trabajo en revision NO se cierra aqui: la sesion puede estar operativa y la
 * revision seguir pendiente. La respuesta lo dice (`trabajo_queda_en_revision`).
 */
function reanudar(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};
  const secreto = guardia_secretos(e);
  if (secreto) return secreto;

  const plataforma = plataforma_de(e);
  const cuenta = normalizar_cuenta(e.cuenta);

  const faltan = [];
  if (!cuenta) faltan.push('cuenta');
  if (!es_instante(e.momento)) faltan.push('momento');
  if (!QUIENES.includes(e.quien)) faltan.push('quien');
  if (!texto_no_vacio(e.autorizacion_id)) faltan.push('autorizacion_id');
  if (faltan.length > 0) return fallo(MOTIVOS.ENTRADA_INCOMPLETA, faltan, []);

  // La regla: la sesion la abre una persona. `sistema` y `agente` no autorizan.
  if (e.quien !== 'dueno') {
    return fallo(MOTIVOS.REAUTH_EXIGE_PERSONA, [], ['quien'], {
      quien: e.quien,
      que_hace_falta: 'una persona (dueno) abra la sesion en el aparato y lo registre'
    });
  }

  const i = indice_de(estado, plataforma, cuenta);
  if (i === -1) return fallo(MOTIVOS.CUENTA_DESCONOCIDA, ['cuenta'], [], { cuenta });

  const previo = estado.cuentas[i];
  if (!previo.reautenticacion || previo.estado !== 'reauth_pendiente') {
    return fallo(MOTIVOS.YA_OPERATIVA, [], [], { cuenta, estado: previo.estado });
  }

  const momento = e.momento;
  const reautenticacion = Object.assign({}, previo.reautenticacion, {
    autorizada: true,
    autorizada_por: 'dueno',
    autorizada_en: momento,
    autorizacion_id: String(e.autorizacion_id).trim()
  });

  const trabajo = previo.trabajo ? clonar(previo.trabajo) : null;
  const trabajo_queda_en_revision = !!trabajo && trabajo.estado === 'en_revision';

  const asiento = Object.assign({}, clonar(previo), {
    estado: 'operativa',
    reautenticacion,
    trabajo,
    historia: (previo.historia || []).concat([
      {
        tipo: 'reautenticacion',
        momento,
        quien: 'dueno',
        autorizacion_id: reautenticacion.autorizacion_id,
        trabajo_en_revision: trabajo_queda_en_revision
      }
    ])
  });

  const cuentas = estado.cuentas.slice();
  cuentas[i] = asiento;

  return {
    ok: true,
    estado: { esquema: ESQUEMA, revision: (estado.revision || 0) + 1, actualizado: momento, cuentas },
    asiento: clonar(asiento),
    cuenta,
    plataforma,
    trabajo,
    trabajo_queda_en_revision,
    aviso: trabajo_queda_en_revision
      ? 'sesion operativa; el trabajo sigue en revision hasta que una persona lo resuelva'
      : null
  };
}

// ---- revision -------------------------------------------------------------

/**
 * Resolver lo que quedo en revision. Exige persona y autorizacion, igual que la
 * reautenticacion: nadie borra una duda sobre si algo se publico sin mirar.
 *
 * `decision`: 'volver_a_cola' (con su paso) o 'descartar' (no se reintenta; la
 * operacion se cierra y se dice por que).
 */
function resolver_revision(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};
  const secreto = guardia_secretos(e);
  if (secreto) return secreto;

  const plataforma = plataforma_de(e);
  const cuenta = normalizar_cuenta(e.cuenta);

  const faltan = [];
  if (!cuenta) faltan.push('cuenta');
  if (!es_instante(e.momento)) faltan.push('momento');
  if (!texto_no_vacio(e.autorizacion_id)) faltan.push('autorizacion_id');
  if (!texto_no_vacio(e.motivo)) faltan.push('motivo');
  if (faltan.length > 0) return fallo(MOTIVOS.ENTRADA_INCOMPLETA, faltan, []);

  if (e.quien !== 'dueno') {
    return fallo(MOTIVOS.REAUTH_EXIGE_PERSONA, [], ['quien'], {
      quien: e.quien,
      que_hace_falta: 'una persona mire la cuenta y resuelva la revision'
    });
  }

  const decisiones = Object.freeze(['volver_a_cola', 'descartar']);
  if (!decisiones.includes(e.decision)) {
    return fallo(MOTIVOS.DECISION_NO_DECLARADA, ['decision'], [], { decisiones });
  }

  const i = indice_de(estado, plataforma, cuenta);
  if (i === -1) return fallo(MOTIVOS.CUENTA_DESCONOCIDA, ['cuenta'], [], { cuenta });

  const previo = estado.cuentas[i];
  if (!previo.trabajo || previo.trabajo.estado !== 'en_revision') {
    return fallo(MOTIVOS.SIN_REVISION, [], [], { cuenta, estado_trabajo: previo.trabajo && previo.trabajo.estado });
  }

  const momento = e.momento;
  const trabajo = Object.assign({}, clonar(previo.trabajo), {
    // Volver a la cola es volver CON SU PASO: el desenlace tiene que decirlo, o
    // la auditoria (y quien lea) vera una cola sin paso devuelto.
    desenlace: e.decision === 'volver_a_cola' ? 'vuelve_con_su_paso' : 'descartado',
    estado: e.decision === 'volver_a_cola' ? 'en_cola' : 'descartado',
    revision_resuelta: {
      decision: e.decision,
      motivo: String(e.motivo).trim(),
      momento,
      quien: 'dueno',
      autorizacion_id: String(e.autorizacion_id).trim()
    }
  });
  if (e.decision === 'volver_a_cola') trabajo.devuelto_en = momento;

  const asiento = Object.assign({}, clonar(previo), {
    trabajo,
    historia: (previo.historia || []).concat([
      { tipo: 'revision_resuelta', momento, quien: 'dueno', decision: e.decision, motivo: trabajo.revision_resuelta.motivo }
    ])
  });

  const cuentas = estado.cuentas.slice();
  cuentas[i] = asiento;

  return {
    ok: true,
    estado: { esquema: ESQUEMA, revision: (estado.revision || 0) + 1, actualizado: momento, cuentas },
    asiento: clonar(asiento),
    cuenta,
    plataforma,
    trabajo,
    desenlace: e.decision
  };
}

// ---- lecturas -------------------------------------------------------------

function consultar(estado, consulta) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const c = es_objeto(consulta) ? consulta : {};
  const plataforma = plataforma_de(c);
  const cuenta = normalizar_cuenta(c.cuenta);
  if (!cuenta) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['cuenta'], []);

  const i = indice_de(estado, plataforma, cuenta);
  if (i === -1) return { ok: true, asiento: null, cuenta, hallada: false };
  return { ok: true, asiento: clonar(estado.cuentas[i]), cuenta, hallada: true };
}

/**
 * Lista las cuentas de UN proyecto. Sin proyecto no lista: devolver el almacen
 * entero es mezclar proyectos (P2), y aqui hay proyectos distintos.
 */
function listar(estado, filtro) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const f = es_objeto(filtro) ? filtro : {};
  if (!texto_no_vacio(f.proyecto)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['proyecto'], []);

  const proyecto = String(f.proyecto).trim();
  const cuentas = estado.cuentas.filter((a) => a && a.proyecto === proyecto && (!f.estado || a.estado === f.estado));
  return { ok: true, proyecto, cuentas: clonar(cuentas), total: cuentas.length };
}

// ---- auditoria ------------------------------------------------------------

/**
 * La auditoria que corre el custodio antes de cada escritura. Comprueba lo que
 * no puede colarse: esquema, secretos (V1), sello en cada asiento (P1), estados
 * declarados, y las dos invariantes de la pieza:
 *   - `reauth_pendiente` SIEMPRE exige persona;
 *   - `en_revision` SIEMPRE lleva su revision (motivo y que hace falta);
 *   - lo autorizado lo autorizo una persona ('dueno'), nunca el sistema.
 */
function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, problemas: [{ ruta: '(raiz)', motivo: MOTIVOS.ESQUEMA_DESCONOCIDO }] };
  }
  for (const h of no_secretos.detectar_secreto(estado)) {
    problemas.push({ ruta: h.ruta, motivo: 'secreto', familia: h.familia });
  }

  const vistas = new Set();
  estado.cuentas.forEach((a, i) => {
    const ruta = `cuentas[${i}]`;
    const sello = comprobar_sello(a);
    if (!sello.ok) {
      problemas.push({ ruta, motivo: 'sin_sello', faltan: sello.faltan, invalidos: sello.invalidos });
    }
    if (!a || !PLATAFORMAS.includes(a.plataforma)) {
      problemas.push({ ruta: `${ruta}.plataforma`, motivo: 'plataforma_no_declarada', valor: a && a.plataforma });
    }
    if (a && a.plataforma && a.cuenta) {
      const clave = clave_de(a.plataforma, a.cuenta);
      if (vistas.has(clave)) problemas.push({ ruta: `${ruta}.cuenta`, motivo: 'cuenta_duplicada', valor: a.cuenta });
      vistas.add(clave);
    }
    if (!a || !ESTADOS.includes(a.estado)) {
      problemas.push({ ruta: `${ruta}.estado`, motivo: 'estado_no_declarado', valor: a && a.estado });
    }
    if (!a || !es_objeto(a.reautenticacion)) {
      problemas.push({ ruta: `${ruta}.reautenticacion`, motivo: 'sin_reautenticacion' });
    } else {
      if (a.reautenticacion.exige !== 'persona') {
        problemas.push({
          ruta: `${ruta}.reautenticacion.exige`,
          motivo: 'reauth_no_exige_persona',
          valor: a.reautenticacion.exige
        });
      }
      if (a.reautenticacion.autorizada === true) {
        if (a.reautenticacion.autorizada_por !== 'dueno') {
          problemas.push({
            ruta: `${ruta}.reautenticacion.autorizada_por`,
            motivo: 'reauth_autorizada_por_sistema',
            valor: a.reautenticacion.autorizada_por
          });
        }
        if (!texto_no_vacio(a.reautenticacion.autorizacion_id)) {
          problemas.push({ ruta: `${ruta}.reautenticacion.autorizacion_id`, motivo: 'sin_autorizacion' });
        }
        if (!es_instante(a.reautenticacion.autorizada_en)) {
          problemas.push({ ruta: `${ruta}.reautenticacion.autorizada_en`, motivo: 'instante_invalido' });
        }
      }
      if (a.estado === 'reauth_pendiente' && a.reautenticacion.autorizada === true) {
        problemas.push({ ruta: `${ruta}.reautenticacion`, motivo: 'pendiente_y_autorizada' });
      }
    }

    if (a && a.trabajo !== null && a.trabajo !== undefined) {
      const t = a.trabajo;
      if (!es_objeto(t)) {
        problemas.push({ ruta: `${ruta}.trabajo`, motivo: 'trabajo_no_es_objeto' });
      } else {
        if (!ESTADOS_TRABAJO.includes(t.estado)) {
          problemas.push({ ruta: `${ruta}.trabajo.estado`, motivo: 'estado_de_trabajo_no_declarado', valor: t.estado });
        }
        if (!CONSECUENCIAS.includes(t.consecuencia)) {
          problemas.push({ ruta: `${ruta}.trabajo.consecuencia`, motivo: 'consecuencia_no_declarada', valor: t.consecuencia });
        }
        if (t.estado === 'en_revision' && (!es_objeto(t.revision) || !texto_no_vacio(t.revision.que_hace_falta))) {
          problemas.push({ ruta: `${ruta}.trabajo.revision`, motivo: 'revision_sin_que_hace_falta' });
        }
        if (t.estado === 'en_cola' && t.desenlace !== 'vuelve_con_su_paso') {
          problemas.push({ ruta: `${ruta}.trabajo.desenlace`, motivo: 'cola_sin_paso_devuelto', valor: t.desenlace });
        }
      }
    }

    if (a && a.historia !== undefined) {
      if (!Array.isArray(a.historia)) {
        problemas.push({ ruta: `${ruta}.historia`, motivo: 'historia_no_es_lista' });
      } else {
        a.historia.forEach((paso, j) => {
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

module.exports = {
  ESQUEMA,
  ESTADOS,
  CONSECUENCIAS,
  DESENLACES,
  ESTADOS_TRABAJO,
  TIPOS_HISTORIA,
  MOTIVOS,
  CUENTA_RE,
  estado_vacio,
  es_estado,
  normalizar_cuenta,
  desenlace_de,
  registrar_caida,
  reanudar,
  resolver_revision,
  consultar,
  listar,
  auditar
};

// Vista "clase" del plano (sesion/index.js#caida).
module.exports.CaidaYReautenticacion = Object.freeze({
  registrar_caida,
  reanudar,
  resolver_revision,
  consultar,
  listar,
  auditar,
  desenlace_de
});
