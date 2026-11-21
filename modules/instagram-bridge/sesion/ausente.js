'use strict';

/**
 * ausente — H1 · AparatoAusente · CUSTODIO (logica pura del almacen de avisos).
 *
 * Cuando el aparato no esta (apagado, sin bateria, en otro sitio, con la pantalla
 * rota) el puente NO puede seguir y el trabajo no se pierde: queda en cola. Lo
 * unico que hay que hacer es decirlo, y decirlo de verdad.
 *
 * # La regla: acuse REAL, nunca fire-and-forget
 *
 * Un mensaje enviado no es un aviso recibido. Si el puente manda "no encuentro el
 * movil", lo marca como enviado y se olvida, el trabajo se queda parado en una
 * cola que nadie mira y no hay forma de saber si alguien se entero. Por eso un
 * aviso:
 *
 *   1. nace `pendiente_de_acuse` (enviarlo no lo cierra);
 *   2. solo se cierra con un `acusar` de una PERSONA ('dueno') que trae
 *      `referencia` (el mensaje/canal del que consta el acuse) y `momento`;
 *   3. un `avisar` repetido es un RECORDATORIO: sube el contador, no acusa;
 *   4. `sistema` o `agente` no pueden acusar: el acuse es de quien tiene el
 *      aparato en la mano.
 *
 * Un aviso pendiente SIEMPRE se puede reclamar (`pendientes`) y el resumen lo
 * cuenta: "cero pendientes" es la unica prueba de que alguien lo vio.
 *
 * Puro: sin IO, sin reloj (el `momento` viene en el payload), sin red. El borde
 * esta en `index.js` (single-writer, temporal + rename, auditoria previa).
 *
 * Ver plan-construccion.md (bloque 8, H1) y diseno-oop.md "AparatoAusente".
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, QUIENES } = require('../core/formas');
const { sellar, comprobar: comprobar_sello } = require('../core/sello');
const no_secretos = require('../core/no-secretos');

const ESQUEMA = 'aparato-ausente-v1';
const ESTADOS = Object.freeze(['pendiente_de_acuse', 'acusado']);
const CANALES = Object.freeze(['telegram', 'whatsapp', 'email', 'panel', 'desconocido']);

const MOTIVOS = Object.freeze({
  ENTRADA_INCOMPLETA: 'entrada_incompleta',
  ENTRADA_INVALIDA: 'entrada_invalida',
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  SECRETO_RECIBIDO: 'secreto_recibido',
  AVISO_DESCONOCIDO: 'aviso_desconocido',
  ACUSE_NO_HUMANO: 'acuse_no_humano',
  ACUSE_SIN_REFERENCIA: 'acuse_sin_referencia',
  SIN_ACUSE: 'sin_acuse',
  AMBITO_INCOMPLETO: 'ambito_incompleto'
});

// ---- estado ---------------------------------------------------------------

function estado_vacio() {
  return { esquema: ESQUEMA, revision: 0, actualizado: null, avisos: [] };
}

function es_estado(x) {
  return es_objeto(x) && x.esquema === ESQUEMA && Array.isArray(x.avisos);
}

// ---- utilidades -----------------------------------------------------------

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

function indice_de(estado, aviso_id) {
  return estado.avisos.findIndex((a) => a && a.aviso_id === aviso_id);
}

/** Un trozo de clave estable: minusculas y separadores simples, sin reloj. */
function slug(valor) {
  return String(valor)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * El identificador del aviso. Si no viene, se DERIVA de
 * (proyecto, cuenta, aparato, motivo), que NO depende del momento: el mismo
 * aparato que sigue ausente por el mismo motivo es la MISMA incidencia, y volver
 * a avisar es un recordatorio, no un aviso nuevo. Se dice de donde salio
 * (`origen_id`) para que nadie confunda un id declarado con uno derivado.
 */
function id_de(entrada, cuenta, proyecto, aparato) {
  if (texto_no_vacio(entrada.aviso_id)) {
    return { aviso_id: String(entrada.aviso_id).trim(), origen_id: 'declarado' };
  }
  return {
    aviso_id: `ausente:${slug(proyecto)}:${cuenta}:${slug(aparato)}:${slug(entrada.motivo)}`,
    origen_id: 'derivado'
  };
}

// ---- avisar ---------------------------------------------------------------

/**
 * Declara que el aparato no esta. NO cierra nada: deja el aviso pendiente de
 * acuse. Un segundo `avisar` con el mismo id es un recordatorio.
 *
 * @param {object} estado
 * @param {object} entrada
 *   {cuenta, proyecto, aparato, motivo, momento, quien, aviso_id?, canal?,
 *    que_hace_falta?, trabajo_en_cola?}
 */
function avisar(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};
  const secreto = guardia_secretos(e);
  if (secreto) return secreto;

  const cuenta = typeof e.cuenta === 'string' ? e.cuenta.trim().toLowerCase().replace(/^@/, '') : '';

  const faltan = [];
  if (!cuenta) faltan.push('cuenta');
  if (!texto_no_vacio(e.proyecto)) faltan.push('proyecto');
  if (!texto_no_vacio(e.aparato)) faltan.push('aparato');
  if (!texto_no_vacio(e.motivo)) faltan.push('motivo');
  if (!es_instante(e.momento)) faltan.push('momento');
  if (!QUIENES.includes(e.quien)) faltan.push('quien');
  if (faltan.length > 0) return fallo(MOTIVOS.ENTRADA_INCOMPLETA, faltan, []);

  const proyecto = String(e.proyecto).trim();
  const aparato = String(e.aparato).trim();
  const { aviso_id, origen_id } = id_de(e, cuenta, proyecto, aparato);
  const momento = e.momento;
  const quien = e.quien;
  const i = indice_de(estado, aviso_id);

  // Un aviso ya acusado y repetido: no se reabre solo porque el aparato siga
  // fuera. Se devuelve el aviso acusado y un `reabrir_exige_persona`: volver a
  // abrir una incidencia cerrada es una decision, no un efecto de reintentar.
  if (i !== -1 && estado.avisos[i].estado === 'acusado') {
    return {
      ok: true,
      estado,
      aviso: clonar(estado.avisos[i]),
      aviso_id,
      origen_id,
      creado: false,
      recordatorio: false,
      cerrado: true,
      requiere_acuse: false,
      reabrir_exige_persona: true,
      nota: 'el aviso ya estaba acusado: un reintento no reabre una incidencia cerrada'
    };
  }

  // Recordatorio: el aviso estaba pendiente y se vuelve a avisar. Sube el
  // contador y NO acusa nada.
  if (i !== -1) {
    const previo = estado.avisos[i];
    const aviso = Object.assign({}, clonar(previo), {
      recordatorios: (previo.recordatorios || 0) + 1,
      ultimo_recordatorio: momento,
      ultimo_canal: CANALES.includes(e.canal) ? e.canal : 'desconocido',
      historia: (previo.historia || []).concat([
        { tipo: 'recordatorio', momento, quien, canal: CANALES.includes(e.canal) ? e.canal : 'desconocido' }
      ])
    });
    const avisos = estado.avisos.slice();
    avisos[i] = aviso;
    return {
      ok: true,
      estado: { esquema: ESQUEMA, revision: (estado.revision || 0) + 1, actualizado: momento, avisos },
      aviso: clonar(aviso),
      aviso_id,
      origen_id,
      creado: false,
      recordatorio: true,
      cerrado: false,
      requiere_acuse: true,
      estado_del_aviso: 'pendiente_de_acuse'
    };
  }

  const canal = CANALES.includes(e.canal) ? e.canal : 'desconocido';
  const que_hace_falta = texto_no_vacio(e.que_hace_falta)
    ? String(e.que_hace_falta).trim()
    : 'una persona coja el aparato, lo encienda y lo deje operativo (o diga donde esta)';

  let aviso = {
    aviso_id,
    origen_id,
    cuenta,
    proyecto,
    aparato,
    estado: 'pendiente_de_acuse',
    motivo: String(e.motivo).trim(),
    que_hace_falta,
    desde: momento,
    quien,
    canal,
    notificado_en: momento,
    recordatorios: 0,
    ultimo_recordatorio: null,
    trabajo_en_cola: texto_no_vacio(e.operacion_id) ? String(e.operacion_id).trim() : null,
    acuse: null,
    historia: [{ tipo: 'aviso', momento, quien, canal, motivo: String(e.motivo).trim() }]
  };

  const s = sellar(aviso, {
    proyecto: aviso.proyecto,
    cuenta,
    aparato: aviso.aparato,
    momento,
    quien
  });
  if (!s.ok) {
    return fallo(s.motivo || 'sin_sello', s.faltan || [], s.invalidos || [], { guardado: false });
  }
  aviso = s.dato;

  const avisos = estado.avisos.slice();
  avisos.push(aviso);

  return {
    ok: true,
    estado: { esquema: ESQUEMA, revision: (estado.revision || 0) + 1, actualizado: momento, avisos },
    aviso: clonar(aviso),
    aviso_id,
    origen_id,
    creado: true,
    recordatorio: false,
    // Las tres senales que impiden leerlo como fire-and-forget.
    cerrado: false,
    requiere_acuse: true,
    estado_del_aviso: 'pendiente_de_acuse'
  };
}

// ---- acusar ---------------------------------------------------------------

/**
 * El acuse. Solo vale de una persona y con referencia: "lo he visto" sin de donde
 * consta es exactamente el fire-and-forget que esta pieza existe para impedir.
 *
 * @param {object} estado
 * @param {object} entrada {aviso_id, momento, quien, referencia, canal?}
 */
function acusar(estado, entrada) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const e = es_objeto(entrada) ? entrada : {};
  const secreto = guardia_secretos(e);
  if (secreto) return secreto;

  const faltan = [];
  if (!texto_no_vacio(e.aviso_id)) faltan.push('aviso_id');
  if (!es_instante(e.momento)) faltan.push('momento');
  if (!QUIENES.includes(e.quien)) faltan.push('quien');
  if (!texto_no_vacio(e.referencia)) faltan.push('referencia');
  if (faltan.length > 0) return fallo(MOTIVOS.ENTRADA_INCOMPLETA, faltan, []);

  if (e.quien !== 'dueno') {
    return fallo(MOTIVOS.ACUSE_NO_HUMANO, [], ['quien'], {
      quien: e.quien,
      que_hace_falta: 'el acuse lo da la persona que tiene el aparato, no el sistema'
    });
  }

  const aviso_id = String(e.aviso_id).trim();
  const i = indice_de(estado, aviso_id);
  if (i === -1) return fallo(MOTIVOS.AVISO_DESCONOCIDO, [], ['aviso_id'], { aviso_id });

  const previo = estado.avisos[i];

  // Acusar dos veces es idempotente: el aviso ya esta cerrado y no se reescribe
  // el acuse original (quien acuso primero manda).
  if (previo.estado === 'acusado') {
    return {
      ok: true,
      estado,
      aviso: clonar(previo),
      aviso_id,
      cerrado: true,
      repetido: true,
      acuse: clonar(previo.acuse),
      requiere_acuse: false
    };
  }

  const acuse = {
    quien: 'dueno',
    momento: e.momento,
    referencia: String(e.referencia).trim(),
    canal: CANALES.includes(e.canal) ? e.canal : (previo.canal || 'desconocido')
  };

  const aviso = Object.assign({}, clonar(previo), {
    estado: 'acusado',
    acuse,
    acusado_en: e.momento,
    historia: (previo.historia || []).concat([
      { tipo: 'acuse', momento: e.momento, quien: 'dueno', referencia: acuse.referencia, canal: acuse.canal }
    ])
  });

  const avisos = estado.avisos.slice();
  avisos[i] = aviso;

  return {
    ok: true,
    estado: { esquema: ESQUEMA, revision: (estado.revision || 0) + 1, actualizado: e.momento, avisos },
    aviso: clonar(aviso),
    aviso_id,
    cerrado: true,
    repetido: false,
    acuse,
    requiere_acuse: false
  };
}

// ---- lecturas -------------------------------------------------------------

/** Los avisos que siguen sin acuse. Sin proyecto no lista: ambito incompleto. */
function pendientes(estado, filtro) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const f = es_objeto(filtro) ? filtro : {};
  if (!texto_no_vacio(f.proyecto)) return fallo(MOTIVOS.AMBITO_INCOMPLETO, ['proyecto'], []);

  const proyecto = String(f.proyecto).trim();
  const avisos = estado.avisos.filter(
    (a) => a && a.proyecto === proyecto && a.estado === 'pendiente_de_acuse'
      && (!f.aparato || a.aparato === f.aparato)
  );
  return { ok: true, proyecto, pendientes: clonar(avisos), total: avisos.length, exige_acuse: true };
}

/** El resumen de un proyecto: cuantos avisos hay, cuantos siguen sin acuse. */
function resumen(estado, filtro) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const f = es_objeto(filtro) ? filtro : {};
  if (!texto_no_vacio(f.proyecto)) return fallo(MOTIVOS.AMBITO_INCOMPLETO, ['proyecto'], []);

  const proyecto = String(f.proyecto).trim();
  const del_proyecto = estado.avisos.filter(
    (a) => a && a.proyecto === proyecto && (!f.aparato || a.aparato === f.aparato)
  );
  const sin_acuse = del_proyecto.filter((a) => a.estado !== 'acusado');

  return {
    ok: true,
    proyecto,
    total: del_proyecto.length,
    pendientes: sin_acuse.length,
    acusados: del_proyecto.length - sin_acuse.length,
    exige_acuse: true,
    // "Cero pendientes" es la unica prueba de que alguien vio los avisos.
    todo_acusado: del_proyecto.length > 0 && sin_acuse.length === 0,
    avisos_pendientes: clonar(sin_acuse.map((a) => a.aviso_id))
  };
}

function consultar(estado, consulta) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const c = es_objeto(consulta) ? consulta : {};
  if (!texto_no_vacio(c.aviso_id)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['aviso_id'], []);
  const aviso_id = String(c.aviso_id).trim();
  const i = indice_de(estado, aviso_id);
  if (i === -1) return { ok: true, aviso: null, aviso_id, hallado: false };
  return { ok: true, aviso: clonar(estado.avisos[i]), aviso_id, hallado: true };
}

// ---- auditoria ------------------------------------------------------------

/**
 * Antes de cada escritura: sello (P1), cero secretos (V1), estados declarados, y
 * la invariante de la pieza: **un aviso acusado lo acuso una persona con
 * referencia y momento; un aviso pendiente no tiene acuse**.
 */
function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, problemas: [{ ruta: '(raiz)', motivo: MOTIVOS.ESQUEMA_DESCONOCIDO }] };
  }
  for (const h of no_secretos.detectar_secreto(estado)) {
    problemas.push({ ruta: h.ruta, motivo: 'secreto', familia: h.familia });
  }

  const vistos = new Set();
  estado.avisos.forEach((a, i) => {
    const ruta = `avisos[${i}]`;
    const sello = comprobar_sello(a);
    if (!sello.ok) {
      problemas.push({ ruta, motivo: 'sin_sello', faltan: sello.faltan, invalidos: sello.invalidos });
    }
    if (!a || !texto_no_vacio(a.aviso_id)) {
      problemas.push({ ruta: `${ruta}.aviso_id`, motivo: 'sin_aviso_id' });
    } else {
      if (vistos.has(a.aviso_id)) problemas.push({ ruta: `${ruta}.aviso_id`, motivo: 'aviso_duplicado' });
      vistos.add(a.aviso_id);
    }
    if (!a || !ESTADOS.includes(a.estado)) {
      problemas.push({ ruta: `${ruta}.estado`, motivo: 'estado_no_declarado', valor: a && a.estado });
    }
    if (a && a.estado === 'acusado') {
      const ac = a.acuse;
      if (!es_objeto(ac)) {
        problemas.push({ ruta: `${ruta}.acuse`, motivo: MOTIVOS.SIN_ACUSE });
      } else {
        if (ac.quien !== 'dueno') {
          problemas.push({ ruta: `${ruta}.acuse.quien`, motivo: MOTIVOS.ACUSE_NO_HUMANO, valor: ac.quien });
        }
        if (!texto_no_vacio(ac.referencia)) {
          problemas.push({ ruta: `${ruta}.acuse.referencia`, motivo: MOTIVOS.ACUSE_SIN_REFERENCIA });
        }
        if (!es_instante(ac.momento)) {
          problemas.push({ ruta: `${ruta}.acuse.momento`, motivo: 'instante_invalido' });
        }
      }
    }
    if (a && a.estado === 'pendiente_de_acuse' && a.acuse !== null && a.acuse !== undefined) {
      problemas.push({ ruta: `${ruta}.acuse`, motivo: 'pendiente_con_acuse' });
    }
    if (a && (!texto_no_vacio(a.que_hace_falta))) {
      problemas.push({ ruta: `${ruta}.que_hace_falta`, motivo: 'aviso_sin_instruccion' });
    }
    if (a && a.historia !== undefined) {
      if (!Array.isArray(a.historia)) {
        problemas.push({ ruta: `${ruta}.historia`, motivo: 'historia_no_es_lista' });
      } else {
        const tipos = ['aviso', 'recordatorio', 'acuse'];
        a.historia.forEach((paso, j) => {
          if (!es_objeto(paso) || !tipos.includes(paso.tipo)) {
            problemas.push({ ruta: `${ruta}.historia[${j}]`, motivo: 'paso_de_historia_no_declarado', valor: paso && paso.tipo });
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
  CANALES,
  MOTIVOS,
  estado_vacio,
  es_estado,
  avisar,
  acusar,
  pendientes,
  resumen,
  consultar,
  auditar
};

module.exports.AparatoAusente = Object.freeze({
  avisar,
  acusar,
  pendientes,
  resumen,
  consultar,
  auditar
});
