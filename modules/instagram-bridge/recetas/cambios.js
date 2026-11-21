'use strict';

/**
 * cambios — F3 · MemoriaDeCambios · CUSTODIO (logica pura + borde).
 *
 * La plataforma cambia su interfaz cada pocas semanas. Cuando un proyecto
 * descubre que "Compartir" ahora se llama "Publicar", ese descubrimiento no sirve
 * solo a ese proyecto: sirve a todos. Esta memoria guarda ESO — los cambios de la
 * interfaz de Instagram — una vez, para todos.
 *
 * # Las dos reglas que la definen
 *
 * 1. **Es COMPARTIDA a proposito.** Una rotura descubierta por un proyecto ahorra
 *    el golpe a todos los demas. Por eso no lleva sello de proyecto (`sello`), y
 *    una entrada que lo traiga se rechaza: si el cambio tuviera dueno, dejaria de
 *    ser saber comun (P3). Lo que SI lleva es quien lo descubrio — `descubierto_por`
 *    — para poder agradecerlo y atribuirlo (E2), y `visto_por`, la lista de los que
 *    despues lo corroboraron. Atribucion, no propiedad.
 *
 * 2. **NO guarda estado de ninguna cuenta.** Ni seguidores, ni retratos, ni
 *    sesiones, ni metricas, ni el ultimo estado de nada. Solo cambios de interfaz:
 *    que paso cambio, de que ancla a que ancla, en que (plataforma, capacidad). El
 *    estado de una cuenta es privado de su proyecto (P3) y este fichero lo leen
 *    todos: meter ahi el estado de una cuenta es publicarlo.
 *    Y no es una recomendacion: los campos de una entrada son una LISTA CERRADA y
 *    `auditar()` recorre el fichero entero buscando campos de cuenta. Un fichero
 *    tocado a mano con `seguidores` dentro no se persiste ni se completa: se
 *    devuelve `almacen_no_auditado` y no se escribe nada.
 *
 * # Corroborar no es duplicar
 *
 * Dos proyectos que ven el mismo cambio no crean dos entradas: la misma
 * (plataforma, capacidad, paso, tipo, ancla antes, ancla ahora) es EL MISMO cambio.
 * La segunda vez suma `confirmaciones`, anota al que lo vio en `visto_por` y
 * conserva `descubierto_por` del primero (a quien hay que agradecerselo). Asi la
 * memoria dice cuantas veces se confirmo un cambio, que es lo que la hace fiable.
 *
 * Single-writer, escritura temporal + rename, auditoria antes de cada escritura y
 * un fichero roto que NO se pisa: las mismas reglas que el padron, el catalogo y la
 * sesion. Reescribir una memoria de cambios corrupta es perder lo que ya se sabia
 * de la plataforma.
 *
 * La logica de dominio es pura (recibe estado, devuelve estado); el IO vive en
 * `CustodioDeCambios`, al final del fichero.
 *
 * Ver plan-construccion.md (bloque 12, F3) y diseno-oop.md.
 */

const path = require('path');
const fsp = require('fs/promises');

const { es_objeto, es_instante, texto_no_vacio, clonar, QUIENES, PLATAFORMAS } = require('../core/formas');
const no_secretos = require('../core/no-secretos');

const ESQUEMA = 'memoria-cambios-v1';
const ALMACEN = 'memoria-cambios';

// Que cambio en la interfaz. Lista cerrada: un cambio que no es de esta lista es
// una impresion, y las impresiones no viajan a todos los proyectos.
const TIPOS = Object.freeze([
  'ancla_renombrada',
  'ancla_desaparecida',
  'ancla_anadida',
  'paso_anadido',
  'paso_retirado',
  'postcondicion_cambiada'
]);

// Los campos de UNA entrada. Fuera de esta lista no entra nada: es lo que
// convierte "no guardes estado de cuenta" en algo que se puede comprobar.
const CAMPOS_CAMBIO = Object.freeze([
  'cambio_id',
  'secuencia',
  'plataforma',
  'capacidad',
  'paso',
  'tipo',
  'ancla_antes',
  'ancla_ahora',
  'confirmaciones',
  'evidencia_ids',
  'descubierto_por',
  'visto_por',
  'registrado_en',
  'actualizado_en'
]);

const CAMPOS_DESCUBRIDOR = Object.freeze(['proyecto', 'cuenta', 'quien', 'momento']);

const CAMPOS_ENTRADA = Object.freeze([
  'plataforma',
  'capacidad',
  'paso',
  'tipo',
  'ancla_antes',
  'ancla_ahora',
  'evidencia_ids',
  'confirmaciones',
  'descubierto_por'
]);

// Campos del SOBRE, no de la carta: los pone el bus para correlacionar y no son
// parte del cambio. Se descartan antes de validar; lo que se guarda no los lleva.
const CAMPOS_DE_TRANSPORTE = Object.freeze(['request_id', 'correlation_id', 'trace_id', 'reply_to', 'evento']);

function sin_transporte(entrada) {
  const cuerpo = {};
  for (const clave of Object.keys(entrada)) {
    if (!CAMPOS_DE_TRANSPORTE.includes(clave)) cuerpo[clave] = entrada[clave];
  }
  return cuerpo;
}

// Nombres que solo pueden ser estado de una cuenta. Si aparecen en una entrada o
// en el fichero, la memoria ha dejado de ser lo que dice ser.
const CAMPOS_DE_CUENTA = Object.freeze([
  'estado_de_cuenta',
  'estado_cuenta',
  'cuenta_estado',
  'seguidores',
  'seguidos',
  'publicaciones',
  'retrato',
  'retratos',
  'ultima_lectura',
  'ultimo_estado',
  'sesion',
  'credenciales',
  'tokens',
  'token',
  'metricas',
  'alcance',
  'datos'
]);

const MOTIVOS = Object.freeze({
  ESQUEMA_DESCONOCIDO: 'esquema_desconocido',
  ENTRADA_INVALIDA: 'entrada_invalida',
  PLATAFORMA_NO_DECLARADA: 'plataforma_no_declarada',
  TIPO_NO_DECLARADO: 'tipo_no_declarado',
  ANCLA_INVALIDA: 'ancla_invalida',
  ANCLA_INCOHERENTE: 'ancla_incoherente',
  SIN_DESCUBRIDOR: 'sin_descubridor',
  DESCUBRIDOR_INVALIDO: 'descubridor_invalido',
  ESTADO_DE_CUENTA_EN_MEMORIA: 'estado_de_cuenta_en_memoria',
  CAMPO_NO_PERMITIDO: 'campo_no_permitido',
  SELLO_DE_PROYECTO_EN_MEMORIA_COMUN: 'sello_de_proyecto_en_memoria_comun',
  SECRETO_RECIBIDO: 'secreto_recibido',
  AMBITO_INCOMPLETO: 'ambito_incompleto',
  CAMBIO_INEXISTENTE: 'cambio_inexistente'
});

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function fallo(motivo, faltan, invalidos, extra) {
  return Object.assign({ ok: false, motivo, faltan: faltan || [], invalidos: invalidos || [] }, extra || {});
}

function normalizar(v) {
  return String(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ---- estado ---------------------------------------------------------------

function estado_vacio() {
  return {
    esquema: ESQUEMA,
    almacen: ALMACEN,
    revision: 0,
    secuencia: 0,
    actualizado: null,
    cambios: []
  };
}

function es_estado(x) {
  return es_objeto(x) && x.esquema === ESQUEMA && Array.isArray(x.cambios);
}

// ---- campos permitidos ----------------------------------------------------

/**
 * Revisa las claves de un objeto contra una lista cerrada. Un campo de cuenta se
 * nombra como tal (no como "campo raro"): el motivo tiene que decir la verdad.
 */
function revisar_campos(objeto, permitidos, ruta) {
  const problemas = [];
  for (const clave of Object.keys(objeto)) {
    if (permitidos.includes(clave)) continue;
    const de_cuenta = CAMPOS_DE_CUENTA.includes(clave);
    problemas.push({
      ruta: `${ruta}.${clave}`,
      motivo: de_cuenta ? MOTIVOS.ESTADO_DE_CUENTA_EN_MEMORIA : MOTIVOS.CAMPO_NO_PERMITIDO,
      valor: de_cuenta ? '(no se copia el valor)' : clave
    });
  }
  return problemas;
}

/** Un ancla valida o null. No rellena el tipo: un tipo que falta no se adivina. */
function leer_ancla(v) {
  if (!es_objeto(v) || !texto_no_vacio(v.nombre_visible)) return null;
  return {
    nombre_visible: String(v.nombre_visible).trim(),
    tipo: texto_no_vacio(v.tipo) ? String(v.tipo).trim().toLowerCase() : 'desconocido'
  };
}

function leer_descubridor(v) {
  if (!es_objeto(v)) return { ok: false, motivo: MOTIVOS.SIN_DESCUBRIDOR };
  const problema = revisar_campos(v, CAMPOS_DESCUBRIDOR, 'descubierto_por');
  if (problema.length) {
    return { ok: false, motivo: problema[0].motivo, problemas: problema };
  }
  const faltan = [];
  if (vacio(v.quien)) faltan.push('quien');
  if (vacio(v.momento)) faltan.push('momento');
  const invalidos = [];
  if (!faltan.includes('quien') && !QUIENES.includes(String(v.quien).trim())) invalidos.push('quien');
  if (!faltan.includes('momento') && !es_instante(v.momento)) invalidos.push('momento');
  if (faltan.length || invalidos.length) {
    return { ok: false, motivo: MOTIVOS.DESCUBRIDOR_INVALIDO, faltan, invalidos };
  }
  return {
    ok: true,
    descubridor: {
      proyecto: texto_no_vacio(v.proyecto) ? String(v.proyecto).trim() : null,
      cuenta: texto_no_vacio(v.cuenta) ? String(v.cuenta).trim() : null,
      quien: String(v.quien).trim(),
      momento: String(v.momento)
    }
  };
}

/** Identidad del cambio de interfaz: dos iguales son el MISMO cambio. */
function clave_de_cambio(c) {
  const antes = es_objeto(c.ancla_antes) ? normalizar(c.ancla_antes.nombre_visible) : '-';
  const ahora = es_objeto(c.ancla_ahora) ? normalizar(c.ancla_ahora.nombre_visible) : '-';
  return `${c.plataforma}|${c.capacidad}|${c.paso}|${c.tipo}|${antes}|${ahora}`;
}

// ---- registrar ------------------------------------------------------------

/**
 * Anota un cambio de interfaz. Si el cambio ya estaba, lo CORROBORA: suma una
 * confirmacion y anota quien lo vio, sin duplicar la entrada.
 *
 * @param {object} estado
 * @param {object} entrada {plataforma?, capacidad, paso?, tipo, ancla_antes,
 *   ancla_ahora, evidencia_ids?, confirmaciones?, descubierto_por}
 */
function registrar(estado, entrada_cruda) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  if (!es_objeto(entrada_cruda)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['entrada'], []);

  // V1: ningun secreto entra (ni el valor se copia al informe). Se mira el sobre
  // entero, por si el secreto viene fuera del cuerpo.
  const hallazgos = no_secretos.detectar_secreto(entrada_cruda);
  if (hallazgos.length) {
    return fallo(MOTIVOS.SECRETO_RECIBIDO, [], [], {
      rutas: hallazgos.map((h) => h.ruta),
      familias: no_secretos.familias_de(hallazgos),
      guardado: false
    });
  }

  // El sobre del bus no es parte del cambio: se descarta antes de validar.
  const entrada = sin_transporte(entrada_cruda);

  // La puerta de "solo cambios de interfaz": campos cerrados, y el estado de una
  // cuenta se nombra por su nombre.
  const fuera = revisar_campos(entrada, CAMPOS_ENTRADA, 'entrada');
  if (fuera.length) {
    const de_cuenta = fuera.filter((p) => p.motivo === MOTIVOS.ESTADO_DE_CUENTA_EN_MEMORIA);
    return fallo(de_cuenta.length ? MOTIVOS.ESTADO_DE_CUENTA_EN_MEMORIA : MOTIVOS.CAMPO_NO_PERMITIDO, [], [], {
      problemas: fuera,
      guardado: false,
      pista: de_cuenta.length
        ? 'la memoria de cambios es comun: el estado de una cuenta es privado de su proyecto y no se guarda aqui'
        : 'una entrada de la memoria solo tiene los campos declarados en CAMPOS_CAMBIO'
    });
  }

  const plataforma = vacio(entrada.plataforma)
    ? 'instagram'
    : String(entrada.plataforma).trim().toLowerCase();
  if (!PLATAFORMAS.includes(plataforma)) {
    return fallo(MOTIVOS.PLATAFORMA_NO_DECLARADA, [], ['plataforma'], { valor: plataforma });
  }
  if (vacio(entrada.capacidad)) return fallo(MOTIVOS.ENTRADA_INVALIDA, ['capacidad'], []);

  const tipo = vacio(entrada.tipo) ? null : String(entrada.tipo).trim().toLowerCase();
  if (!tipo) return fallo(MOTIVOS.TIPO_NO_DECLARADO, ['tipo'], []);
  if (!TIPOS.includes(tipo)) return fallo(MOTIVOS.TIPO_NO_DECLARADO, [], ['tipo'], { valor: tipo });

  const paso = entrada.paso === undefined || entrada.paso === null ? 0 : entrada.paso;
  if (!Number.isInteger(paso) || paso < 0) return fallo(MOTIVOS.ENTRADA_INVALIDA, [], ['paso'], { valor: entrada.paso });

  const ancla_antes = leer_ancla(entrada.ancla_antes);
  if (!ancla_antes) return fallo(MOTIVOS.ANCLA_INVALIDA, [], ['ancla_antes']);

  const ancla_ahora = entrada.ancla_ahora === undefined || entrada.ancla_ahora === null
    ? null
    : leer_ancla(entrada.ancla_ahora);
  if (entrada.ancla_ahora !== undefined && entrada.ancla_ahora !== null && !ancla_ahora) {
    return fallo(MOTIVOS.ANCLA_INVALIDA, [], ['ancla_ahora']);
  }
  // Un cambio tiene que cambiar algo: misma ancla antes y despues no es un cambio.
  if (ancla_ahora && normalizar(ancla_ahora.nombre_visible) === normalizar(ancla_antes.nombre_visible)) {
    return fallo(MOTIVOS.ANCLA_INCOHERENTE, [], ['ancla_ahora'], {
      pista: 'el ancla de antes y la de ahora son la misma: no hubo cambio que recordar'
    });
  }
  if (tipo === 'ancla_desaparecida' && ancla_ahora) {
    return fallo(MOTIVOS.ANCLA_INCOHERENTE, [], ['ancla_ahora'], {
      pista: 'una ancla desaparecida no tiene ancla de ahora'
    });
  }
  if (['ancla_renombrada', 'ancla_anadida'].includes(tipo) && !ancla_ahora) {
    return fallo(MOTIVOS.ANCLA_INCOHERENTE, [], ['ancla_ahora'], {
      pista: 'un ancla renombrada o anadida dice a que ancla se paso'
    });
  }

  const descubierto = leer_descubridor(entrada.descubierto_por);
  if (!descubierto.ok) {
    return fallo(descubierto.motivo, descubierto.faltan || [], descubierto.invalidos || [], {
      problemas: descubierto.problemas || [],
      pista: 'la memoria es comun, pero se sabe quien la descubrio: sin testigo ni momento no entra'
    });
  }

  const evidencia_ids = Array.isArray(entrada.evidencia_ids)
    ? Array.from(new Set(entrada.evidencia_ids.filter((e) => texto_no_vacio(String(e || ''))).map((e) => String(e).trim())))
    : [];
  const confirmaciones = Number.isInteger(entrada.confirmaciones) && entrada.confirmaciones > 0
    ? entrada.confirmaciones
    : 1;

  const candidato = {
    plataforma,
    capacidad: String(entrada.capacidad).trim(),
    paso,
    tipo,
    ancla_antes,
    ancla_ahora
  };
  const clave = clave_de_cambio(candidato);

  const nuevo = clonar(estado);
  const existente = nuevo.cambios.find((c) => c && clave_de_cambio(c) === clave);

  if (existente) {
    // Corroboracion: el mismo cambio visto por otro proyecto o en otro momento.
    existente.confirmaciones = Number(existente.confirmaciones || 1) + confirmaciones;
    const ids = new Set(Array.isArray(existente.evidencia_ids) ? existente.evidencia_ids : []);
    for (const id of evidencia_ids) ids.add(id);
    existente.evidencia_ids = Array.from(ids);

    const vistos = Array.isArray(existente.visto_por) ? existente.visto_por : [];
    const ya = vistos.some((v) => v.quien === descubierto.descubridor.quien
      && v.momento === descubierto.descubridor.momento
      && v.proyecto === descubierto.descubridor.proyecto
      && v.cuenta === descubierto.descubridor.cuenta);
    if (!ya) vistos.push(clonar(descubierto.descubridor));
    existente.visto_por = vistos;
    existente.actualizado_en = descubierto.descubridor.momento;

    nuevo.revision = Number(estado.revision || 0) + 1;
    nuevo.actualizado = descubierto.descubridor.momento;

    return {
      ok: true,
      estado: nuevo,
      cambio: clonar(existente),
      corroborado: true,
      confirmaciones: existente.confirmaciones,
      cambios: nuevo.cambios.length
    };
  }

  const secuencia = Number(estado.secuencia || 0) + 1;
  const cambio = {
    cambio_id: `cambio-${String(secuencia).padStart(6, '0')}`,
    secuencia,
    plataforma,
    capacidad: candidato.capacidad,
    paso,
    tipo,
    ancla_antes,
    ancla_ahora,
    confirmaciones,
    evidencia_ids,
    descubierto_por: clonar(descubierto.descubridor),
    visto_por: [clonar(descubierto.descubridor)],
    registrado_en: descubierto.descubridor.momento,
    actualizado_en: descubierto.descubridor.momento
  };

  nuevo.cambios.push(cambio);
  nuevo.secuencia = secuencia;
  nuevo.revision = Number(estado.revision || 0) + 1;
  nuevo.actualizado = descubierto.descubridor.momento;

  return {
    ok: true,
    estado: nuevo,
    cambio: clonar(cambio),
    corroborado: false,
    confirmaciones,
    cambios: nuevo.cambios.length
  };
}

// ---- lecturas -------------------------------------------------------------

/**
 * Lista cambios. Exige un criterio: la memoria se lee por plataforma o por
 * capacidad, no "entera y mezclada" — y con `paso` se lee el cambio de un paso.
 */
function listar(estado, filtro) {
  if (!es_estado(estado)) return fallo(MOTIVOS.ESQUEMA_DESCONOCIDO, [], ['estado']);
  const f = es_objeto(filtro) ? filtro : {};
  if (vacio(f.plataforma) && vacio(f.capacidad) && vacio(f.tipo)) {
    return fallo(MOTIVOS.AMBITO_INCOMPLETO, ['plataforma|capacidad|tipo'], [], {
      pista: 'la memoria se lee por plataforma, capacidad o tipo de cambio'
    });
  }

  const plataforma = texto_no_vacio(f.plataforma) ? String(f.plataforma).trim().toLowerCase() : null;
  const capacidad = texto_no_vacio(f.capacidad) ? String(f.capacidad).trim() : null;
  const tipo = texto_no_vacio(f.tipo) ? String(f.tipo).trim().toLowerCase() : null;
  const paso = Number.isInteger(f.paso) ? f.paso : null;

  const cambios = estado.cambios
    .filter((c) => {
      if (!c) return false;
      if (plataforma && c.plataforma !== plataforma) return false;
      if (capacidad && c.capacidad !== capacidad) return false;
      if (tipo && c.tipo !== tipo) return false;
      if (paso !== null && c.paso !== paso) return false;
      return true;
    })
    .sort((a, b) => b.confirmaciones - a.confirmaciones || a.secuencia - b.secuencia)
    .map(clonar);

  return { ok: true, cambios, total: cambios.length, ambito: { plataforma, capacidad, tipo, paso } };
}

/**
 * El cambio que explica un paso roto: lo que la memoria ya sabe de ese paso. Es lo
 * que F2 mira antes de proponer nada — si otro proyecto ya pago el golpe, no hay
 * por que adivinarlo otra vez.
 */
function buscar(estado, consulta) {
  const r = listar(estado, consulta);
  if (!r.ok) return r;
  const primero = r.cambios[0] || null;
  return {
    ok: true,
    hallado: primero !== null,
    motivo: primero ? null : MOTIVOS.CAMBIO_INEXISTENTE,
    cambio: primero,
    cambios: r.cambios,
    total: r.total
  };
}

// ---- auditoria del almacen ------------------------------------------------

/**
 * Audita la memoria ENTERA. Un solo problema mancha el almacen y lo llama el
 * custodio antes de persistir: con este fichero van a trabajar todos los
 * proyectos, asi que se mira entero cada vez.
 */
function auditar(estado) {
  const problemas = [];
  if (!es_estado(estado)) {
    return { ok: false, problemas: [{ ruta: '(raiz)', motivo: MOTIVOS.ESQUEMA_DESCONOCIDO }] };
  }

  for (const h of no_secretos.detectar_secreto(estado)) {
    problemas.push({ ruta: h.ruta, motivo: 'secreto', familia: h.familia });
  }
  if (estado.almacen !== undefined && estado.almacen !== ALMACEN) {
    problemas.push({ ruta: 'almacen', motivo: 'no_es_memoria_de_cambios', valor: estado.almacen });
  }

  const ids = new Set();
  let ultima_secuencia = 0;

  estado.cambios.forEach((c, i) => {
    const ruta = `cambios[${i}]`;
    if (!es_objeto(c)) {
      problemas.push({ ruta, motivo: 'entrada_no_es_objeto' });
      return;
    }

    // La regla del bloque, comprobada sobre el fichero (no solo al escribir).
    for (const p of revisar_campos(c, CAMPOS_CAMBIO, ruta)) problemas.push(p);
    if (c.sello !== undefined) {
      problemas.push({
        ruta: `${ruta}.sello`,
        motivo: MOTIVOS.SELLO_DE_PROYECTO_EN_MEMORIA_COMUN,
        valor: '(la memoria es comun: no se sella por proyecto)'
      });
    }

    if (!texto_no_vacio(c.cambio_id)) problemas.push({ ruta: `${ruta}.cambio_id`, motivo: 'sin_cambio_id' });
    else if (ids.has(c.cambio_id)) problemas.push({ ruta: `${ruta}.cambio_id`, motivo: 'cambio_id_duplicado', valor: c.cambio_id });
    else ids.add(c.cambio_id);

    if (!Number.isInteger(c.secuencia) || c.secuencia <= ultima_secuencia) {
      problemas.push({ ruta: `${ruta}.secuencia`, motivo: 'secuencia_no_creciente', valor: c.secuencia });
    } else {
      ultima_secuencia = c.secuencia;
    }

    if (!PLATAFORMAS.includes(c.plataforma)) {
      problemas.push({ ruta: `${ruta}.plataforma`, motivo: MOTIVOS.PLATAFORMA_NO_DECLARADA, valor: c.plataforma });
    }
    if (!texto_no_vacio(c.capacidad)) problemas.push({ ruta: `${ruta}.capacidad`, motivo: 'sin_capacidad' });
    if (!Number.isInteger(c.paso) || c.paso < 0) {
      problemas.push({ ruta: `${ruta}.paso`, motivo: 'paso_no_declarado', valor: c.paso });
    }
    if (!TIPOS.includes(c.tipo)) {
      problemas.push({ ruta: `${ruta}.tipo`, motivo: MOTIVOS.TIPO_NO_DECLARADO, valor: c.tipo });
    }
    if (!leer_ancla(c.ancla_antes)) {
      problemas.push({ ruta: `${ruta}.ancla_antes`, motivo: MOTIVOS.ANCLA_INVALIDA });
    }
    if (c.ancla_ahora !== null && !leer_ancla(c.ancla_ahora)) {
      problemas.push({ ruta: `${ruta}.ancla_ahora`, motivo: MOTIVOS.ANCLA_INVALIDA });
    }
    if (['ancla_renombrada', 'ancla_anadida'].includes(c.tipo) && !leer_ancla(c.ancla_ahora)) {
      problemas.push({ ruta: `${ruta}.ancla_ahora`, motivo: MOTIVOS.ANCLA_INCOHERENTE });
    }
    if (!Number.isInteger(c.confirmaciones) || c.confirmaciones < 1) {
      problemas.push({ ruta: `${ruta}.confirmaciones`, motivo: 'confirmaciones_invalidas', valor: c.confirmaciones });
    }
    if (!es_instante(c.registrado_en)) {
      problemas.push({ ruta: `${ruta}.registrado_en`, motivo: 'instante_invalido', valor: c.registrado_en });
    }

    const d = leer_descubridor(c.descubierto_por);
    if (!d.ok) {
      problemas.push({ ruta: `${ruta}.descubierto_por`, motivo: d.motivo, faltan: d.faltan, invalidos: d.invalidos });
    }
    if (!Array.isArray(c.visto_por) || c.visto_por.length === 0) {
      problemas.push({ ruta: `${ruta}.visto_por`, motivo: 'sin_testigos' });
    } else {
      c.visto_por.forEach((v, j) => {
        const leido = leer_descubridor(v);
        if (!leido.ok) {
          problemas.push({ ruta: `${ruta}.visto_por[${j}]`, motivo: leido.motivo, faltan: leido.faltan, invalidos: leido.invalidos });
        }
      });
    }
  });

  return {
    ok: problemas.length === 0,
    problemas,
    cambios: estado.cambios.length,
    confirmaciones: estado.cambios.reduce((t, c) => t + (Number.isInteger(c && c.confirmaciones) ? c.confirmaciones : 0), 0)
  };
}

// ---- el custodio (borde: IO, candado, escritura atomica) ------------------

const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');
const FICHERO = 'cambios.json';

/**
 * Custodio single-writer de `storage/instagram-bridge/cambios.json`.
 *
 * Reglas de esta capa (las mismas que el padron, el catalogo y la sesion):
 *   - **Single-writer**: una cola de promesas por almacen.
 *   - **Escritura atomica**: temporal + rename en el mismo directorio.
 *   - **Nada se persiste sin auditar**: `auditar()` corre antes de cada escritura.
 *   - **Un fichero roto NO se pisa**: ni ilegible ni con una entrada que guarde
 *     estado de cuenta. Se devuelve `sin_cambios` / `almacen_no_auditado` y se
 *     espera a que una persona lo mire.
 */
class CustodioDeCambios {
  /**
   * @param {{directorio?:string, fichero?:string}} [opts]
   */
  constructor(opts = {}) {
    this.nombre = 'memoria-cambios';
    this.version = '0.1.0';

    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;
    this._fichero = opts.fichero || FICHERO;
    this._ruta = path.join(this._directorio, this._fichero);

    this._estado = estado_vacio();
    this._cargado = false;
    this._ilegible = null;
    this._cerrojo = Promise.resolve();
    this._lecturas = 0;
    this._escrituras = 0;
  }

  async cargar() {
    try {
      const crudo = await fsp.readFile(this._ruta, 'utf8');
      const datos = JSON.parse(crudo);
      if (!es_estado(datos)) {
        this._ilegible = 'esquema_desconocido';
        this._estado = estado_vacio();
      } else {
        this._estado = datos;
        this._ilegible = null;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        this._estado = estado_vacio();
        this._ilegible = null;
      } else {
        this._ilegible = err && err.code === 'EACCES' ? 'cambios_sin_permiso' : 'cambios_ilegible';
        this._estado = estado_vacio();
      }
    }
    this._cargado = true;
    return { ok: this._ilegible === null, motivo: this._ilegible, estado: this._estado };
  }

  async recargar() {
    return this.cargar();
  }

  /** Espera a que termine la escritura en curso (lo usa `onUnload`). */
  async cerrar() {
    await this._cerrojo;
  }

  async _escribir(estado) {
    await fsp.mkdir(this._directorio, { recursive: true });
    const temporal = `${this._ruta}.${process.pid}.tmp`;
    await fsp.writeFile(temporal, `${JSON.stringify(estado, null, 2)}\n`, 'utf8');
    await fsp.rename(temporal, this._ruta);
    this._escrituras += 1;
  }

  _mutar(mutacion) {
    const siguiente = this._cerrojo.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: 'sin_cambios', detalle: this._ilegible, ruta: this._ruta };
      }
      const r = mutacion(this._estado);
      if (!r || r.ok !== true) return r || { ok: false, motivo: MOTIVOS.ENTRADA_INVALIDA };
      if (!r.estado) return r;

      const auditoria = auditar(r.estado);
      if (!auditoria.ok) {
        return { ok: false, motivo: 'almacen_no_auditado', problemas: auditoria.problemas, guardado: false };
      }

      try {
        await this._escribir(r.estado);
      } catch (err) {
        return {
          ok: false,
          motivo: err && err.code === 'ENOSPC' ? 'disco_lleno' : 'no_se_pudo_guardar',
          detalle: err && err.message,
          guardado: false
        };
      }

      this._estado = r.estado;
      return r;
    });
    this._cerrojo = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  _leer(lectura) {
    const siguiente = this._cerrojo.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: 'sin_cambios', detalle: this._ilegible, ruta: this._ruta };
      }
      this._lecturas += 1;
      return lectura(this._estado);
    });
    this._cerrojo = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  registrar(entrada) {
    return this._mutar((estado) => registrar(estado, entrada));
  }

  listar(filtro) {
    return this._leer((estado) => listar(estado, filtro));
  }

  buscar(consulta) {
    return this._leer((estado) => buscar(estado, consulta));
  }

  /** Auditoria del fichero tal y como esta (no repara nada). */
  auditar() {
    return this._leer((estado) => auditar(estado));
  }

  foto() {
    return clonar(this._estado);
  }
}

function crear(opts = {}) {
  return new CustodioDeCambios(opts);
}

module.exports = {
  ESQUEMA,
  ALMACEN,
  TIPOS,
  CAMPOS_CAMBIO,
  CAMPOS_DESCUBRIDOR,
  CAMPOS_ENTRADA,
  CAMPOS_DE_TRANSPORTE,
  CAMPOS_DE_CUENTA,
  MOTIVOS,
  normalizar,
  estado_vacio,
  es_estado,
  revisar_campos,
  clave_de_cambio,
  registrar,
  listar,
  buscar,
  auditar,
  CustodioDeCambios,
  crear
};

// Vista "clase" para quien prefiera el nombre del diseno (F3 · MemoriaDeCambios).
module.exports.MemoriaDeCambios = Object.freeze({
  registrar,
  listar,
  buscar,
  auditar,
  estado_vacio,
  MOTIVOS,
  TIPOS
});
