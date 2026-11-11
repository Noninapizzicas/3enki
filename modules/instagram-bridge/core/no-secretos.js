'use strict';

/**
 * no-secretos — V1 · ReglaDeNoAlmacenamiento · REFLEJO.
 *
 * Enki guarda credenciales por diseno (credential-manager). Aqui la regla es la
 * contraria: NINGUN secreto entra en el estado del puente. Ni cifrado, ni "por
 * si acaso", ni "solo el trozo que hace falta". Si alguien manda una credencial
 * por la conversacion sin que nadie la pida, se descarta sin guardar y se avisa.
 *
 * La auditoria es sobre el estado ENTERO, no sobre la intencion: se recorre el
 * objeto completo y se nombran las rutas donde hay un secreto. Un estado limpio
 * es un invariante verificable, no una promesa.
 *
 * Dos decisiones que importan:
 *   - El hallazgo NUNCA lleva el valor, ni recortado: un secreto truncado sigue
 *     siendo un secreto, y un informe que lo copia es una segunda fuga.
 *   - El auditor se prueba tambien por lo que NO marca: `autorizaciones`,
 *     `clave_natural`, `tokens_usados` o un `code: 'INVALID_INPUT'` son datos
 *     legitimos del sistema. Un auditor con falsos positivos se acaba apagando.
 *
 * Puro: sin reloj, sin red, sin estado.
 */

const { es_objeto } = require('./formas');

const FAMILIAS = Object.freeze({
  CONTRASENA: 'contrasena',
  TOKEN: 'token',
  CLAVE_PRIVADA: 'clave_privada',
  COOKIE: 'cookie',
  CODIGO_UNICO: 'codigo_unico',
  CREDENCIAL: 'credencial'
});

const MOTIVOS = Object.freeze({
  contrasena: 'una contrasena no se guarda: ni cifrada, ni "por si acaso"',
  token: 'un token abre la cuenta mientras vive; no se guarda',
  clave_privada: 'una clave privada no entra en ningun estado',
  cookie: 'una cookie de sesion ES la sesion: guardarla es guardar la cuenta',
  codigo_unico: 'un codigo de un solo uso no se guarda ni se registra',
  credencial: 'una credencial recibida por la conversacion se descarta y se avisa',
  general: 'un secreto no entra en el estado, con o sin cifrado'
});

const EVENTO_AVISO = 'instagram.secreto_descartado';

// Nombres que son cookie de sesion aunque no lleven la palabra "cookie".
const NOMBRES_COOKIE = Object.freeze(['cookie', 'cookies', 'sessionid', 'csrftoken', 'xsrftoken']);

// Cualificadores que hacen benigna la palabra "codigo" (codigo postal, de error...).
const CODIGO_BENIGNO = Object.freeze([
  'postal', 'pais', 'error', 'estado', 'http', 'respuesta', 'producto', 'barras', 'color', 'idioma', 'moneda'
]);

// Cualificadores que convierten "tokens" en un contador (LLM), no en credencial.
const CONTADOR = Object.freeze(['usados', 'gastados', 'total', 'totales', 'max', 'maximo', 'limite', 'presupuesto', 'contador', 'count']);

const VALOR = Object.freeze({
  JWT: /^eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*$/,
  BEARER: /^bearer\s+\S{8,}/i,
  BASIC: /^basic\s+[A-Za-z0-9+/=]{8,}$/i,
  PEM: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  COOKIE: /(^|;\s*)(sessionid|csrftoken|xsrftoken|ds_user_id)=/i,
  URL_CON_CLAVE: /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i,
  EN_PROSA: /(password|passwd|contrasena|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S{4,}/i,
  NUMERO: /^\d{4,8}$/
});

// Prefijos de credencial emitida (no hace falta adivinar entropia).
const PREFIJOS = Object.freeze([
  /^ghp_[A-Za-z0-9]{20,}/, /^gho_[A-Za-z0-9]{20,}/, /^github_pat_/, /^glpat-/,
  /^sk-[A-Za-z0-9]{16,}/, /^sk_live_/, /^rk_live_/, /^xox[baprs]-/,
  /^AKIA[0-9A-Z]{16}$/, /^AIza[0-9A-Za-z_-]{30,}$/
]);

// ---- claves ----------------------------------------------------------------

function normalizar(clave) {
  return String(clave)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokens_de(clave) {
  return normalizar(clave).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Familia de secreto que delata una clave (con su valor, cuando hace falta
 * mirarlo). Devuelve null si la clave es legitima.
 */
function familia_por_clave(clave, valor) {
  const tokens = tokens_de(clave);
  const set = new Set(tokens);
  const junta = tokens.join('');
  const tiene = (...xs) => xs.some((x) => set.has(x));

  if (tiene(...NOMBRES_COOKIE)) return FAMILIAS.COOKIE;

  if (tiene('password', 'passwd', 'pwd', 'pass', 'contrasena', 'contrasenya', 'passphrase')) {
    return FAMILIAS.CONTRASENA;
  }

  if (tiene('credencial', 'credenciales', 'credential', 'credentials', 'authorization', 'authorisation')) {
    return FAMILIAS.CREDENCIAL;
  }

  // Clave privada / api key, por palabras o por compuesto.
  if (junta.includes('apikey') || junta.includes('privatekey') || junta.includes('secretkey') ||
      junta.includes('accesskey') || junta.includes('signingkey') || junta.includes('clientsecret')) {
    return FAMILIAS.CLAVE_PRIVADA;
  }
  if (set.has('key') && tiene('api', 'private', 'privada', 'secret', 'secreto', 'access', 'acceso', 'signing', 'client', 'master', 'firma')) {
    return FAMILIAS.CLAVE_PRIVADA;
  }
  if (set.has('clave') && tiene('privada', 'secreta', 'secreto', 'api', 'acceso', 'maestra')) {
    return FAMILIAS.CLAVE_PRIVADA;
  }

  if (tiene('secret', 'secreto', 'secretos', 'secrets')) return FAMILIAS.CREDENCIAL;

  if (tiene('jwt', 'bearer')) return FAMILIAS.TOKEN;

  if (tiene('recovery', 'backup') && tiene('code', 'codigo', 'codes', 'codigos')) return FAMILIAS.CODIGO_UNICO;

  // Tokens: un contador de tokens (LLM) no es una credencial.
  if (tiene('token', 'tokens', 'accesstoken', 'refreshtoken', 'idtoken', 'apitoken', 'authtoken')) {
    const es_contador = tiene(...CONTADOR) || typeof valor === 'number';
    return es_contador ? null : FAMILIAS.TOKEN;
  }

  // Codigos de un solo uso: la clave sola no basta, se mira el valor.
  const codigo = tiene('codigo', 'code', 'codigos', 'codes', 'pin', 'otp', 'totp');
  if (codigo) {
    if (tiene(...CODIGO_BENIGNO)) return null;
    if (tiene('unico', 'unica', 'acceso', 'verificacion', 'recuperacion', 'sms', 'whatsapp')) return FAMILIAS.CODIGO_UNICO;
    if (typeof valor === 'number' && !VALOR.NUMERO.test(String(valor))) return null;
    if (typeof valor === 'string' && VALOR.NUMERO.test(valor.trim())) return FAMILIAS.CODIGO_UNICO;
    return null;
  }

  return null;
}

/**
 * Familia de secreto que delata un VALOR, aunque la clave no diga nada.
 * (Solo cadenas: un numero o un booleano no es una credencial.)
 */
function familia_por_valor(valor) {
  if (typeof valor !== 'string' || valor.length < 8) return null;
  if (VALOR.PEM.test(valor)) return FAMILIAS.CLAVE_PRIVADA;
  if (VALOR.JWT.test(valor)) return FAMILIAS.TOKEN;
  if (VALOR.BEARER.test(valor)) return FAMILIAS.TOKEN;
  if (VALOR.BASIC.test(valor)) return FAMILIAS.CREDENCIAL;
  if (VALOR.COOKIE.test(valor)) return FAMILIAS.COOKIE;
  if (VALOR.URL_CON_CLAVE.test(valor)) return FAMILIAS.CREDENCIAL;
  for (const re of PREFIJOS) if (re.test(valor)) return FAMILIAS.TOKEN;
  if (VALOR.EN_PROSA.test(valor)) return FAMILIAS.CREDENCIAL;
  return null;
}

// ---- recorrido del estado --------------------------------------------------

function ruta_de(base, clave, indice) {
  const trozo = indice === undefined ? String(clave) : `[${indice}]`;
  if (indice === undefined) return base ? `${base}.${trozo}` : trozo;
  return `${base}${trozo}`;
}

function hallazgo(ruta, familia, valor) {
  return {
    ruta: ruta || '(raiz)',
    familia,
    motivo: MOTIVOS[familia] || MOTIVOS.general,
    clase: Array.isArray(valor) ? 'array' : typeof valor,
    longitud: typeof valor === 'string' ? valor.length : null,
    oculto: true // el valor no viaja: el informe no vuelve a filtrar el secreto
  };
}

function recorrer(valor, ruta, salida, vistos, profundidad) {
  if (profundidad > 16) return;
  if (valor === null || valor === undefined) return;
  if (typeof valor === 'string') return;
  if (typeof valor !== 'object') return;
  if (vistos.has(valor)) return;
  vistos.add(valor);

  if (Array.isArray(valor)) {
    valor.forEach((item, i) => {
      const r = ruta_de(ruta, i, i);
      if (typeof item === 'string') {
        const fam = familia_por_valor(item);
        if (fam) salida.push(hallazgo(r, fam, item));
        return;
      }
      recorrer(item, r, salida, vistos, profundidad + 1);
    });
    return;
  }

  for (const clave of Object.keys(valor)) {
    const v = valor[clave];
    const r = ruta ? `${ruta}.${clave}` : clave;

    const famClave = familia_por_clave(clave, v);
    if (famClave) { salida.push(hallazgo(r, famClave, v)); continue; }

    if (typeof v === 'string') {
      const famValor = familia_por_valor(v);
      if (famValor) salida.push(hallazgo(r, famValor, v));
      continue;
    }
    recorrer(v, r, salida, vistos, profundidad + 1);
  }
}

/**
 * Recorre el objeto entero y devuelve los hallazgos (vacio = limpio).
 * Determinista: mismo objeto, mismos hallazgos, en el mismo orden.
 *
 * @param {*} objeto
 * @returns {{ruta:string, familia:string, motivo:string, clase:string, longitud:number|null, oculto:boolean}[]}
 */
function detectar_secreto(objeto) {
  if (objeto === null || objeto === undefined) return [];
  if (typeof objeto === 'string') {
    const fam = familia_por_valor(objeto);
    return fam ? [hallazgo('(raiz)', fam, objeto)] : [];
  }
  if (typeof objeto !== 'object') return [];
  const salida = [];
  recorrer(objeto, '', salida, new WeakSet(), 0);
  return salida;
}

function hay_secreto(objeto) {
  return detectar_secreto(objeto).length > 0;
}

/** ¿Se puede admitir este dato en el estado? No si lleva cualquier secreto. */
function admitir_en_estado(dato) {
  if (dato === null || dato === undefined) return true;
  return detectar_secreto(dato).length === 0;
}

/**
 * Audita el estado completo. Un solo hallazgo mancha el estado entero: no hay
 * "limpio salvo un token".
 *
 * @param {*} estado
 */
function auditar(estado) {
  const hallazgos = detectar_secreto(estado);
  const familias = Array.from(new Set(hallazgos.map((h) => h.familia))).sort();
  return {
    estado: hallazgos.length ? 'con_hallazgos' : 'limpio',
    hallazgos,
    total: hallazgos.length,
    familias,
    rutas: hallazgos.map((h) => h.ruta)
  };
}

/**
 * Descarta el dato y devuelve el aviso que hay que dar. No guarda nada: la
 * pieza es refleja, el puente es quien publica `aviso`.
 *
 * @param {*} dato
 * @returns {{ok:boolean, descartado:boolean, guardado:boolean, motivo:string, hallazgos:object[], aviso:object|null}}
 */
function rechazar(dato) {
  const hallazgos = detectar_secreto(dato);
  if (hallazgos.length === 0) {
    return { ok: true, descartado: false, guardado: true, motivo: null, hallazgos: [], aviso: null };
  }
  const familias = Array.from(new Set(hallazgos.map((h) => h.familia))).sort();
  return {
    ok: true,
    descartado: true,
    guardado: false,
    motivo: 'secreto_recibido',
    familias,
    rutas: hallazgos.map((h) => h.ruta),
    hallazgos,
    aviso: {
      evento: EVENTO_AVISO,
      motivo: 'secreto_recibido',
      familias,
      rutas: hallazgos.map((h) => h.ruta),
      guardado: false,
      oculto: true
    }
  };
}

/** Motivo declarado de una familia (o el general, sin argumento). */
function motivo(hallazgo_o_familia) {
  const familia = typeof hallazgo_o_familia === 'string'
    ? hallazgo_o_familia
    : (es_objeto(hallazgo_o_familia) ? hallazgo_o_familia.familia : null);
  if (!familia) return MOTIVOS.general;
  return MOTIVOS[familia] || MOTIVOS.general;
}

/** Familias presentes en una lista de hallazgos (o en un estado, si se pasa crudo). */
function familias_de(hallazgos) {
  const lista = Array.isArray(hallazgos) ? hallazgos : detectar_secreto(hallazgos);
  return Array.from(new Set(lista.map((h) => h.familia))).sort();
}

module.exports = {
  FAMILIAS,
  MOTIVOS,
  EVENTO_AVISO,
  familia_por_clave,
  familia_por_valor,
  detectar_secreto,
  hay_secreto,
  admitir_en_estado,
  auditar,
  rechazar,
  descartar: rechazar,
  motivo,
  familias_de
};

// Vista "clase" para quien prefiera el nombre del diseno (V1 · ReglaDeNoAlmacenamiento).
module.exports.ReglaDeNoAlmacenamiento = Object.freeze({
  detectar_secreto,
  admitir_en_estado,
  auditar,
  rechazar,
  descartar: rechazar,
  motivo
});
