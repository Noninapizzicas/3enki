'use strict';

/**
 * cola — G3 · ColaDeTrabajos · CUSTODIO (logica pura; el IO vive en index.js).
 *
 * La cola es la memoria de lo que queda por hacer en UNA cuenta. Su unica
 * promesa dura, la que justifica que exista:
 *
 *   NUNCA DOS TRABAJOS EN CURSO PARA LA MISMA CUENTA.
 *
 * Dos pestanas, dos hilos, dos reintentos: cualquiera de ellos puede abrir dos
 * veces el mismo editor y publicar dos veces. La cola no lo evita "casi
 * siempre": lo evita por construccion, porque `tomar_siguiente` se niega a
 * entregar un trabajo mientras haya otro en curso en esa cuenta, y `auditar`
 * vuelve a comprobarlo sobre el fichero (un fallo de codigo no puede quedar
 * escondido en el almacen).
 *
 * Reglas que esta pieza hace ejecutables:
 *   - El orden NO es "el que llego primero" a secas: es `prioridad.ordenar`
 *     (G4), FIFO con urgencia. Aqui no se reimplementa la escala.
 *   - Un trabajo en curso OCUPA la cuenta, no el proyecto: el limite lo pone la
 *     plataforma a la cuenta, asi que dos cuentas del mismo proyecto pueden
 *     trabajar a la vez y una sola cuenta no puede hacerlo dos veces.
 *   - NADA DURA PARA SIEMPRE. Todo trabajo nace con `expira_en`; al tomarlo, los
 *     caducados se archivan como `caducado` en vez de esperar eternamente. Una
 *     cola con un trabajo que nadie puede hacer es una cuenta bloqueada por la
 *     puerta de atras.
 *   - La historia no se borra: lo cerrado pasa a `historial` con su desenlace.
 *   - Un trabajo sin sello (P1), con secreto (V1) o con una accion que G1 no
 *     sabe cobrar no entra.
 *
 * Puro: recibe el estado, devuelve un estado nuevo. Sin IO, sin reloj.
 */

const { es_objeto, es_instante, texto_no_vacio, clonar, crear_sello, validar_sello } = require('../core/formas');
const ritmo = require('../core/ritmo');
const prioridad = require('../core/prioridad');
const propiedad = require('../core/propiedad');
const noSecretos = require('../core/no-secretos');

const ESQUEMA = 'cola-trabajos-v1';
const ALMACEN = 'colas';

// Estados vivos (los que compiten) y desenlaces (los que ya no).
const ESTADOS = Object.freeze(['pendiente', 'en_curso']);
const DESENLACES = Object.freeze(['hecho', 'fallado', 'caducado', 'abandonado']);

// Un trabajo que nadie toma en este tiempo deja de bloquear la cuenta.
const VIDA_POR_DEFECTO_MINUTOS = 240;

const CODIGOS = Object.freeze({
  ENTRADA_INVALIDA: 'entrada_invalida',
  ACCION_DESCONOCIDA: 'accion_desconocida',
  SIN_SELLO: 'sin_sello',
  SECRETO_RECIBIDO: 'secreto_recibido',
  TRABAJO_YA_ENCOLADO: 'trabajo_ya_encolado',
  CUENTA_OCUPADA: 'cuenta_ocupada',
  TRABAJO_DESCONOCIDO: 'trabajo_desconocido',
  TRABAJO_NO_EN_CURSO: 'trabajo_no_en_curso',
  DESENLACE_INVALIDO: 'desenlace_invalido',
  AMBITO_INCOMPLETO: 'ambito_incompleto',
  SIN_MOMENTO: 'sin_momento',
  COLA_NO_AUDITADA: 'almacen_no_auditado'
});

// ---- estado ---------------------------------------------------------------

function estado_vacio() {
  return {
    esquema: ESQUEMA,
    almacen: ALMACEN,
    revision: 0,
    secuencia: 0,
    actualizado: null,
    trabajos: [],
    historial: []
  };
}

function es_estado(estado) {
  return es_objeto(estado)
    && estado.esquema === ESQUEMA
    && Number.isFinite(Number(estado.revision))
    && Number.isFinite(Number(estado.secuencia))
    && Array.isArray(estado.trabajos)
    && Array.isArray(estado.historial);
}

function _siguiente_revision(estado) {
  return Object.assign(clonar(estado), { revision: Number(estado.revision) + 1 });
}

// ---- consultas ------------------------------------------------------------

function es_vigente(trabajo) {
  return es_objeto(trabajo) && ESTADOS.includes(String(trabajo.estado));
}

function en_curso_de(estado, cuenta) {
  if (!es_estado(estado)) return null;
  const c = String(cuenta || '').trim();
  return estado.trabajos.find((t) => es_vigente(t) && t.estado === 'en_curso' && String(t.cuenta) === c) || null;
}

function pendientes_de(estado, cuenta, proyecto) {
  if (!es_estado(estado)) return [];
  const c = String(cuenta || '').trim();
  return estado.trabajos.filter((t) => es_vigente(t)
    && t.estado === 'pendiente'
    && String(t.cuenta) === c
    && (proyecto === undefined || proyecto === null || String(t.proyecto) === String(proyecto)));
}

/** ¿Esta caducado a este momento? Sin `expira_en` no caduca (pero `auditar` lo nota). */
function caducado(trabajo, momento) {
  if (!es_objeto(trabajo) || !es_instante(momento)) return false;
  if (!es_instante(trabajo.expira_en)) return false;
  return !ritmo.antes_de(momento, trabajo.expira_en);
}

/**
 * Lista por ambito. Sin cuenta ni proyecto NO se lista la cola entera: eso
 * seria servir el estado de todos los proyectos en una respuesta (P2).
 */
function listar(estado, filtro = {}) {
  if (!es_estado(estado)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, trabajos: [] };
  const f = es_objeto(filtro) ? filtro : {};
  if (!texto_no_vacio(f.cuenta) && !texto_no_vacio(f.proyecto)) {
    return { ok: false, motivo: CODIGOS.AMBITO_INCOMPLETO, faltan: ['cuenta', 'proyecto'], trabajos: [] };
  }
  const coincide = (t) => (texto_no_vacio(f.cuenta) ? String(t.cuenta) === String(f.cuenta).trim() : true)
    && (texto_no_vacio(f.proyecto) ? String(t.proyecto) === String(f.proyecto).trim() : true);
  const vivos = estado.trabajos.filter((t) => es_vigente(t) && coincide(t));
  const orden = prioridad.ordenar(vivos);
  return {
    ok: true,
    ambito: { proyecto: texto_no_vacio(f.proyecto) ? String(f.proyecto).trim() : null, cuenta: texto_no_vacio(f.cuenta) ? String(f.cuenta).trim() : null },
    total: vivos.length,
    en_curso: vivos.filter((t) => t.estado === 'en_curso').length,
    pendientes: vivos.filter((t) => t.estado === 'pendiente').length,
    trabajos: orden.orden,
    descartados: orden.descartados
  };
}

// ---- mutaciones -----------------------------------------------------------

/**
 * Encola un trabajo.
 *
 * @param {object} estado
 * @param {{id?:string, proyecto:string, cuenta:string, aparato:string, momento:string,
 *          quien:string, accion:string, urgencia?:number, motivo?:string,
 *          expira_en?:string, sello?:object}} entrada
 */
function enconlar(estado, entrada) {
  if (!es_estado(estado)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['estado'] };
  if (!es_objeto(entrada)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['entrada'] };

  // Lo minimo para poder hablar de un trabajo: una accion y un instante. Los
  // demas campos del sello los valida P1 mas abajo (y su rechazo se llama
  // `sin_sello`, que es lo que de verdad falta: el dueno del dato).
  const faltan = [];
  if (!texto_no_vacio(entrada.accion)) faltan.push('accion');
  if (!es_instante(entrada.momento)) faltan.push('momento');
  if (faltan.length) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan, invalidos: [] };

  // La accion tiene que tener precio (G1): lo que no se puede cobrar no se regula.
  if (!ritmo.es_accion(entrada.accion)) {
    return {
      ok: false,
      motivo: CODIGOS.ACCION_DESCONOCIDA,
      invalidos: ['accion'],
      acciones: ritmo.ACCIONES.slice()
    };
  }

  const urgencia = entrada.urgencia === undefined ? 0 : Number(entrada.urgencia);
  if (!Number.isFinite(urgencia) || urgencia < 0 || urgencia > 3) {
    return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, invalidos: ['urgencia'], rango: [0, 3] };
  }

  // P1: nada nace sin dueno. El sello se construye aqui, no se acepta a ciegas.
  const sello = crear_sello(entrada.sello || entrada);
  if (!sello.ok) {
    return { ok: false, motivo: CODIGOS.SIN_SELLO, faltan: sello.faltan, invalidos: sello.invalidos };
  }

  // V1: un token en la cola es un token en el disco.
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

  const id = texto_no_vacio(entrada.id) ? String(entrada.id).trim() : null;
  if (id) {
    const repetido = [...estado.trabajos, ...estado.historial].some((t) => es_objeto(t) && String(t.id) === id);
    if (repetido) return { ok: false, motivo: CODIGOS.TRABAJO_YA_ENCOLADO, id };
  }

  const secuencia = Number(estado.secuencia) + 1;
  const nuevo_id = id || `t-${String(secuencia).padStart(5, '0')}`;

  const expira_en = es_instante(entrada.expira_en)
    ? entrada.expira_en
    : ritmo.desplazar(entrada.momento, VIDA_POR_DEFECTO_MINUTOS);

  if (es_instante(entrada.expira_en) && !ritmo.antes_de(entrada.momento, entrada.expira_en)) {
    return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, invalidos: ['expira_en'], pista: 'un trabajo que nace caducado no se encola' };
  }

  const trabajo = {
    id: nuevo_id,
    secuencia,
    almacen: ALMACEN,
    proyecto: String(entrada.proyecto).trim(),
    cuenta: String(entrada.cuenta).trim(),
    // `quien` se copia del sello porque el orden (G4) lo necesita en la primera
    // linea del trabajo: el dueno gana al agente sin tener que abrir el sello.
    quien: sello.sello.quien,
    accion: String(entrada.accion),
    coste: ritmo.coste_de(entrada.accion),
    urgencia: Math.round(urgencia),
    estado: 'pendiente',
    momento_alta: entrada.momento,
    momento_inicio: null,
    expira_en,
    intentos: 0,
    motivo: texto_no_vacio(entrada.motivo) ? String(entrada.motivo).trim() : null,
    sello: sello.sello
  };

  const siguiente = _siguiente_revision(estado);
  siguiente.secuencia = secuencia;
  siguiente.trabajos = [...estado.trabajos, trabajo];
  siguiente.actualizado = entrada.momento;

  const auditoria = auditar(siguiente);
  if (!auditoria.ok) {
    return { ok: false, motivo: CODIGOS.COLA_NO_AUDITADA, problemas: auditoria.problemas, guardado: false };
  }

  return { ok: true, trabajo: clonar(trabajo), estado: siguiente, revision: siguiente.revision };
}

/**
 * Archiva los pendientes caducados de una cuenta. Es la puerta por la que un
 * trabajo imposible deja de ocupar sitio.
 */
function caducar(estado, cuenta, momento) {
  if (!es_estado(estado) || !es_instante(momento)) return { ok: false, motivo: CODIGOS.SIN_MOMENTO, estado };
  const c = String(cuenta || '').trim();
  const siguen = [];
  const archivados = [];
  for (const t of estado.trabajos) {
    if (es_vigente(t) && String(t.cuenta) === c && caducado(t, momento)) {
      archivados.push(Object.assign(clonar(t), { estado: 'caducado', cerrado_en: momento, detalle: 'caducado sin tomar' }));
    } else {
      siguen.push(t);
    }
  }
  if (!archivados.length) return { ok: true, estado, archivados: [] };
  const siguiente = _siguiente_revision(estado);
  siguiente.trabajos = siguen;
  siguiente.historial = [...estado.historial, ...archivados];
  siguiente.actualizado = momento;
  return { ok: true, estado: siguiente, archivados };
}

/**
 * Entrega EL siguiente trabajo de una cuenta y lo pone en curso.
 *
 * **Se niega si la cuenta ya tiene uno en curso** (`cuenta_ocupada`): esa es la
 * regla que sostiene todo lo demas.
 *
 * @param {object} estado
 * @param {{cuenta:string, proyecto?:string, momento:string}} pedido
 */
function tomar_siguiente(estado, pedido = {}) {
  if (!es_estado(estado)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['estado'] };
  const p = es_objeto(pedido) ? pedido : {};
  if (!texto_no_vacio(p.cuenta)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['cuenta'] };
  if (!es_instante(p.momento)) return { ok: false, motivo: CODIGOS.SIN_MOMENTO, faltan: ['momento'] };

  const cuenta = String(p.cuenta).trim();

  // 1 · la cuenta ya esta trabajando: no se entrega nada, ni siquiera "el siguiente"
  const ocupado = en_curso_de(estado, cuenta);
  if (ocupado) {
    return {
      ok: false,
      motivo: CODIGOS.CUENTA_OCUPADA,
      cuenta,
      en_curso: ocupado.id,
      accion_en_curso: ocupado.accion,
      desde: ocupado.momento_inicio
    };
  }

  // 2 · lo caducado se archiva antes de elegir, para no elegir un muerto
  const limpio = caducar(estado, cuenta, p.momento);
  const base = limpio.ok ? limpio.estado : estado;

  // 3 · el orden lo decide G4, no esta pieza
  const candidatos = pendientes_de(base, cuenta, p.proyecto);
  const elegido = prioridad.primero(candidatos);
  if (!elegido) {
    // No hay nada que entregar, pero el estado SI vuelve: si el paso previo
    // archivo caducados, ese cambio tiene que llegar al disco.
    return {
      ok: true,
      trabajo: null,
      motivo: 'sin_trabajo',
      cuenta,
      estado: base,
      revision: base.revision,
      archivados: limpio.ok ? limpio.archivados.map((t) => t.id) : []
    };
  }

  const siguiente = _siguiente_revision(base);
  siguiente.trabajos = base.trabajos.map((t) => (String(t.id) === String(elegido.id)
    ? Object.assign(clonar(t), { estado: 'en_curso', momento_inicio: p.momento, intentos: Number(t.intentos || 0) + 1 })
    : t));
  siguiente.actualizado = p.momento;

  const trabajo = siguiente.trabajos.find((t) => String(t.id) === String(elegido.id));
  const auditoria = auditar(siguiente);
  if (!auditoria.ok) {
    return { ok: false, motivo: CODIGOS.COLA_NO_AUDITADA, problemas: auditoria.problemas, guardado: false };
  }

  // Por que este y no otro: solo se puede citar la razon si habia con quien
  // comparar. Con un unico candidato no hay escala que explicar.
  const rival = candidatos.find((t) => String(t.id) !== String(elegido.id));
  const razon = rival ? prioridad.razon_de(elegido, rival) : 'unico_candidato';

  return {
    ok: true,
    trabajo: clonar(trabajo),
    razon,
    estado: siguiente,
    revision: siguiente.revision,
    archivados: limpio.ok ? limpio.archivados.map((t) => t.id) : []
  };
}

/**
 * Cierra un trabajo en curso con su desenlace. Lo cerrado pasa a `historial`:
 * la cola no borra, archiva.
 */
function cerrar(estado, entrada) {
  if (!es_estado(estado)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['estado'] };
  if (!es_objeto(entrada) || !texto_no_vacio(entrada.id)) {
    return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['id'] };
  }
  if (!DESENLACES.includes(String(entrada.desenlace))) {
    return { ok: false, motivo: CODIGOS.DESENLACE_INVALIDO, invalidos: ['desenlace'], desenlaces: DESENLACES.slice() };
  }
  if (!es_instante(entrada.momento)) return { ok: false, motivo: CODIGOS.SIN_MOMENTO, faltan: ['momento'] };

  const id = String(entrada.id);
  const trabajo = estado.trabajos.find((t) => String(t.id) === id);
  if (!trabajo) return { ok: false, motivo: CODIGOS.TRABAJO_DESCONOCIDO, id };
  if (trabajo.estado !== 'en_curso') {
    return { ok: false, motivo: CODIGOS.TRABAJO_NO_EN_CURSO, id, estado: trabajo.estado };
  }

  const cerrado = Object.assign(clonar(trabajo), {
    estado: String(entrada.desenlace),
    cerrado_en: entrada.momento,
    detalle: texto_no_vacio(entrada.detalle) ? String(entrada.detalle).trim() : null
  });

  const siguiente = _siguiente_revision(estado);
  siguiente.trabajos = estado.trabajos.filter((t) => String(t.id) !== id);
  siguiente.historial = [...estado.historial, cerrado];
  siguiente.actualizado = entrada.momento;

  const auditoria = auditar(siguiente);
  if (!auditoria.ok) return { ok: false, motivo: CODIGOS.COLA_NO_AUDITADA, problemas: auditoria.problemas, guardado: false };

  return { ok: true, trabajo: clonar(cerrado), estado: siguiente, revision: siguiente.revision, cuenta_libre: true };
}

/**
 * Devuelve un trabajo en curso a la cola (fallo sin desenlace: se reintenta
 * mas tarde). No es "cerrar": el trabajo sigue vivo y conserva sus intentos.
 */
function devolver(estado, entrada) {
  if (!es_estado(estado)) return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['estado'] };
  if (!es_objeto(entrada) || !texto_no_vacio(entrada.id)) {
    return { ok: false, motivo: CODIGOS.ENTRADA_INVALIDA, faltan: ['id'] };
  }
  if (!es_instante(entrada.momento)) return { ok: false, motivo: CODIGOS.SIN_MOMENTO, faltan: ['momento'] };

  const id = String(entrada.id);
  const trabajo = estado.trabajos.find((t) => String(t.id) === id);
  if (!trabajo) return { ok: false, motivo: CODIGOS.TRABAJO_DESCONOCIDO, id };
  if (trabajo.estado !== 'en_curso') return { ok: false, motivo: CODIGOS.TRABAJO_NO_EN_CURSO, id, estado: trabajo.estado };

  const siguiente = _siguiente_revision(estado);
  siguiente.trabajos = estado.trabajos.map((t) => (String(t.id) === id
    ? Object.assign(clonar(t), {
      estado: 'pendiente',
      momento_inicio: null,
      ultimo_fallo: entrada.momento,
      detalle: texto_no_vacio(entrada.detalle) ? String(entrada.detalle).trim() : null
    })
    : t));
  siguiente.actualizado = entrada.momento;

  const auditoria = auditar(siguiente);
  if (!auditoria.ok) return { ok: false, motivo: CODIGOS.COLA_NO_AUDITADA, problemas: auditoria.problemas, guardado: false };

  return { ok: true, trabajo: siguiente.trabajos.find((t) => String(t.id) === id), estado: siguiente, revision: siguiente.revision };
}

// ---- auditoria ------------------------------------------------------------

/**
 * Audita la cola entera antes de escribirla. Comprueba:
 *   - esquema y estados conocidos;
 *   - sello P1 en cada trabajo (tambien los del historial);
 *   - cero secretos (V1);
 *   - clase de almacen privada (P3) por proyecto: `colas` no se mezcla ni con
 *     otro almacen ni con otro proyecto dentro del mismo grupo;
 *   - **como mucho UN trabajo en curso por (proyecto, cuenta)**, que es la
 *     promesa de la pieza comprobada sobre el disco, no sobre la intencion;
 *   - ids unicos y secuencia monotona.
 */
function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, estado: 'exceso', problemas: [{ motivo: 'esquema_desconocido', detalle: String(estado && estado.esquema) }] };
  }

  const todos = [...estado.trabajos, ...estado.historial];
  const vistos = new Set();
  let max_secuencia = 0;

  todos.forEach((t, i) => {
    if (!es_objeto(t)) {
      problemas.push({ motivo: 'trabajo_ilegible', indice: i });
      return;
    }
    if (!texto_no_vacio(t.id)) problemas.push({ motivo: 'sin_id', indice: i });
    else if (vistos.has(String(t.id))) problemas.push({ motivo: 'id_repetido', detalle: String(t.id), indice: i });
    else vistos.add(String(t.id));

    if (t.almacen !== ALMACEN) {
      problemas.push({ motivo: 'almacen_no_declarado', detalle: String(t.almacen), id: t.id });
    }
    if (!validar_sello(t.sello).ok) {
      problemas.push({ motivo: 'dato_sin_sello', detalle: 'sello', id: t.id });
    }
    if (!ritmo.es_accion(t.accion)) {
      problemas.push({ motivo: 'accion_desconocida', detalle: String(t.accion), id: t.id });
    }
    const estado_vivo = String(t.estado);
    if (!ESTADOS.includes(estado_vivo) && !DESENLACES.includes(estado_vivo)) {
      problemas.push({ motivo: 'estado_desconocido', detalle: estado_vivo, id: t.id });
    }
    if (t.expira_en !== undefined && t.expira_en !== null && !es_instante(t.expira_en)) {
      problemas.push({ motivo: 'expira_en_invalido', id: t.id });
    }
    const secuencia = Number(t.secuencia);
    if (!Number.isFinite(secuencia)) problemas.push({ motivo: 'sin_secuencia', id: t.id });
    else max_secuencia = Math.max(max_secuencia, secuencia);
  });

  if (max_secuencia > Number(estado.secuencia)) {
    problemas.push({ motivo: 'secuencia_incoherente', detalle: `${max_secuencia} > ${estado.secuencia}` });
  }

  // La regla de la pieza: una sola cosa en curso por cuenta.
  const enCurso = new Map();
  for (const t of estado.trabajos) {
    if (!es_objeto(t) || t.estado !== 'en_curso') continue;
    const clave = `${t.proyecto}::${t.cuenta}`;
    if (enCurso.has(clave)) {
      problemas.push({
        motivo: CODIGOS.CUENTA_OCUPADA,
        detalle: `${clave} tiene ${enCurso.get(clave)} y ${t.id}`,
        id: t.id
      });
    } else {
      enCurso.set(clave, t.id);
    }
  }

  // V1 sobre el almacen entero.
  const secretos = noSecretos.detectar_secreto(estado);
  if (secretos.length) {
    problemas.push({ motivo: CODIGOS.SECRETO_RECIBIDO, familias: noSecretos.familias_de(secretos), rutas: secretos.map((h) => h.ruta) });
  }

  // P3: la clase privada se comprueba por proyecto (el estado se sirve por
  // ambito; el fichero guarda varias cuentas de varios proyectos a proposito).
  const porProyecto = new Map();
  for (const t of todos) {
    if (!es_objeto(t)) continue;
    const p = String(t.proyecto || '');
    if (!porProyecto.has(p)) porProyecto.set(p, []);
    porProyecto.get(p).push(t);
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
    trabajos: estado.trabajos.length,
    historial: estado.historial.length,
    problemas
  };
}

module.exports = {
  ESQUEMA,
  ALMACEN,
  ESTADOS,
  DESENLACES,
  VIDA_POR_DEFECTO_MINUTOS,
  CODIGOS,
  estado_vacio,
  es_estado,
  es_vigente,
  caducado,
  en_curso_de,
  pendientes_de,
  listar,
  enconlar,
  caducar,
  tomar_siguiente,
  cerrar,
  devolver,
  auditar
};
