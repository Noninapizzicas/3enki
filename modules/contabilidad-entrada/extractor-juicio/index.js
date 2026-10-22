/**
 * contabilidad-entrada/extractor-juicio — MICRO-AGENTE HÍBRIDO, STATELESS (respaldo del hueco de A4.1).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * EL RESPALDO DEL HUECO: cuando la extracción DETERMINISTA no completa el documento,
 * un LLM LEE EL TEXTO Y PROPONE LOS CAMPOS. Propone, NO asienta. Si no puede, lo dice.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * `extraccion-dato` (A4.1) aplica un ESQUEMA de regex declarado. Cuando el documento no casa
 * (no hay esquema, o faltan obligatorios) devuelve `propuesta:false` y encola la excepción:
 * el dato se queda esperando a un humano aunque el TEXTO esté ahí, legible. Este módulo cubre
 * ese hueco con JUICIO (la mitad fuzzy que A4.1 declara abierta), pero con la misma disciplina:
 * el LLM no tiene la última palabra — su respuesta se VALIDA y lo que no pasa la validación se
 * DESCARTA (null) y se declara en `abierto`.
 *
 * QUÉ ES Y QUÉ NO ES:
 *  · Es un REFLEJO STATELESS: no guarda nada, no escribe en el libro, no toca el store de nadie.
 *    Su única salida es una PROPUESTA (la respuesta) y un EVENTO de encadenado.
 *  · Llama al LLM por HTTP (API OpenAI-compatible de DeepSeek). La clave se lee del `.env` vivo
 *    (`/opt/enki/data/.env`, variable DEEPSEEK_API_KEY_GLOBAL) en onLoad y NUNCA se loguea, ni
 *    se devuelve, ni viaja en el manifest.
 *  · NO es blueprint_driven: el juicio vive en una llamada HTTP con prompt FIJO y validación
 *    determinista, no en un blueprint del ai-gateway. Híbrido = contrato determinista por fuera,
 *    juicio por dentro; la puerta de salida sigue siendo determinista (validación + umbral).
 *  · CERO invención: si el LLM falla, tarda, o no hay clave → 502 JUICIO_NO_DISPONIBLE con
 *    `abierto.juicio` (degradación honesta). El hueco sigue siendo un hueco, pero se declara.
 *
 * ENCADENADO (mismo contrato que usa hoy extraccion-dato):
 *  · propuesta:true  → `control-cuadre-documento.cuadra.request` (A5): que el documento se cuadre.
 *  · propuesta:false → `encolado-excepcion.encolar.request` (A8.1) con rol ENCOLADO_EXCEPCION:
 *    lo dudoso espera a un humano (el flujo continúa, no se bloquea).
 *
 * RPC extraer es CLASE PREGUNTA → por el bus, sin ui_handler. Publica
 * extractor-juicio.extraer.response y su par .failed.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los ÚNICOS campos que este extractor reconoce. Lo que el LLM devuelva fuera de esta lista
// no se descarta en silencio: se declara en `abierto.ignorados` (el contrato no cambia por
// lo que el modelo invente).
const CAMPOS = ['proveedor', 'nif', 'numero', 'fecha', 'base', 'iva_pct', 'iva_importe', 'total', 'moneda'];
const IMPORTES = new Set(['base', 'iva_pct', 'iva_importe', 'total']);

// Mínimo para que una factura/ticket se pueda asentar: quién (proveedor), con qué NIF fiscal,
// cuándo, y por cuánto. Si el llamante NO declara obligatorios se exige este mínimo — y se
// declara en `abierto` que el mínimo lo puso el módulo, no el llamante.
const OBLIGATORIOS_MINIMOS = ['proveedor', 'nif', 'fecha', 'total'];

// Variable del .env vivo. La clave NUNCA se declara en module.json ni se loguea.
const NOMBRE_CLAVE = 'DEEPSEEK_API_KEY_GLOBAL';
const ENV_POR_DEFECTO = '/opt/enki/data/.env';

const CONFIG_POR_DEFECTO = {
  url: 'https://api.deepseek.com/chat/completions',
  modelo: 'deepseek-chat',
  timeout_ms: 30000,
  // Recorte de seguridad del texto enviado: un documento gigante no debe convertirse en una
  // factura de tokens. Si se recorta, se declara (`abierto.texto_truncado`).
  max_texto: 20000
};

// Prompt ESTRICTO (español). Reglas en positivo y con el cerrojo anti-invención explícito.
const SISTEMA = [
  'Eres un extractor de datos de facturas y tickets para contabilidad en España.',
  'Devuelves SOLO un objeto JSON. No explicas, no saludas, no usas markdown.',
  '',
  'REGLAS OBLIGATORIAS:',
  '1. Copia los datos LITERALMENTE del TEXTO. Si un dato no aparece en el texto, su valor es null.',
  '   NUNCA inventes, completes ni deduzcas un dato que no esté escrito.',
  '2. Devuelve EXACTAMENTE estas nueve claves: proveedor, nif, numero, fecha, base, iva_pct,',
  '   iva_importe, total, moneda. Ninguna más.',
  '3. nif: el NIF/CIF del EMISOR, es decir de quien factura (el proveedor). NUNCA el del cliente',
  '   ni el del receptor.',
  '4. fecha: tal cual aparezca en el texto, en formato dd/mm/yyyy.',
  '5. base, iva_pct, iva_importe y total: string con coma decimal, tal cual aparezcan',
  '   (por ejemplo "63,60"). Sin símbolo de moneda y sin separador de miles si el texto no lo trae.',
  '6. moneda: código de tres letras (EUR, USD) SOLO si el texto lo declara; si no, null.',
  '7. proveedor: la razón social o nombre del emisor, sin dirección.',
  '8. numero: el número de factura tal cual aparece.',
  '9. Sin texto adicional: la respuesta empieza en { y termina en }.'
].join('\n');

class ExtractorJuicio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'extractor-juicio';
    this.version = 'reflejo-0.1.0';
    this._cfg = { ...CONFIG_POR_DEFECTO, env_path: ENV_POR_DEFECTO };
    // Clave del LLM: se carga en onLoad desde el .env vivo. Nunca se expone.
    this._apiKey = null;
  }

  async onLoad(context = {}) {
    await super.onLoad(context);
    const cfg = (context && context.moduleConfig) || {};
    this._cfg = {
      url: typeof cfg.url === 'string' && cfg.url ? cfg.url : CONFIG_POR_DEFECTO.url,
      modelo: typeof cfg.modelo === 'string' && cfg.modelo ? cfg.modelo : CONFIG_POR_DEFECTO.modelo,
      timeout_ms: Number.isFinite(Number(cfg.timeout_ms)) && Number(cfg.timeout_ms) > 0
        ? Number(cfg.timeout_ms) : CONFIG_POR_DEFECTO.timeout_ms,
      max_texto: Number.isFinite(Number(cfg.max_texto)) && Number(cfg.max_texto) > 0
        ? Number(cfg.max_texto) : CONFIG_POR_DEFECTO.max_texto,
      env_path: typeof cfg.env_path === 'string' && cfg.env_path ? cfg.env_path : ENV_POR_DEFECTO
    };
    this._apiKey = this._leerClave(this._cfg.env_path);
    // Se declara SI HAY clave, jamás cuál es.
    this.logger?.info('extractor-juicio.juicio.configurado', {
      module: this.name, version: this.version, modelo: this._cfg.modelo,
      url: this._cfg.url, timeout_ms: this._cfg.timeout_ms,
      clave: Boolean(this._apiKey), env_path: this._cfg.env_path
    });
    if (!this._apiKey) {
      // Sin clave el juicio NO se puede prestar: se avisa al arrancar, no cuando llega el documento.
      this.logger?.warn('extractor-juicio.clave.ausente', {
        module: this.name, variable: NOMBRE_CLAVE, env_path: this._cfg.env_path,
        efecto: 'toda peticion de juicio respondera 502 JUICIO_NO_DISPONIBLE'
      });
    }
  }

  // ── handler RPC (una línea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onExtraerRequest(e) {
    return this._atender(e, 'extraer', 'extractor-juicio.extraer.response', async (d) => {
      const res = await this._extraer(d);
      if (res.status !== 200) {
        this.eventBus?.publish('extractor-juicio.extraer.failed', res);
        return res;
      }
      // PROPONE, no asienta: la propuesta sigue la cadena por EVENTO (igual que A4.1).
      const pid = res.data.project_id;
      if (res.data.propuesta === true) {
        // El documento está completo: se SUBE a cuadre (A5) con la CLASE, que es lo que decide
        // a dónde va el hecho contable (factura/ticket asientan; albarán no).
        this.eventBus?.publish('control-cuadre-documento.cuadra.request', {
          project_id: pid,
          documento: res.data.documento,
          extraido: res.data.extraido,
          clase: res.data.clase,
          correlation_id: d.correlation_id
        });
      } else {
        // El juicio TAMPOCO cierra el documento: no se fuerza nada, lo dudoso espera (A8.1).
        // La clave es la del DOCUMENTO (no la del juicio) para que el custodio la tome por
        // duplicada si A4.1 ya encoló la misma excepción: una excepción por documento.
        this.eventBus?.publish('encolado-excepcion.encolar.request', {
          project_id: pid,
          rol: 'ENCOLADO_EXCEPCION',
          clave: res.data.clave_excepcion,
          motivo: 'el juicio (LLM) no completa los obligatorios del documento',
          origen: 'extractor-juicio',
          payload: res.data.extraido,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // extraer({project_id, texto, documento?, clase?, obligatorios?}) → { status, data }
  // ══════════════════════════════════════════════════════════════════════
  async _extraer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Sin TEXTO no hay nada que juzgar: un documento de menos de 8 caracteres no es un documento
    // (y pedirle al LLM que "lea" el vacío es la vía más corta a la invención).
    const texto = this._texto(input);
    if (texto.trim().length < 8) return this._invalid('texto');

    // Sin clave NO se llama al proveedor: se degrada y se dice por qué.
    if (!this._apiKey) {
      return this._noDisponible(
        `no hay ${NOMBRE_CLAVE} en ${this._cfg.env_path}: el juicio no esta disponible ` +
        '(no se inventa la extraccion)'
      );
    }
    if (typeof fetch !== 'function') {
      return this._noDisponible('este runtime no tiene fetch global: el juicio no esta disponible');
    }

    const t0 = Date.now();
    let respuesta;
    try {
      respuesta = await this._llamar(texto);
    } catch (err) {
      // Fallo/timeout del proveedor: NO se inventa una extraccion vacía que parezca éxito.
      return this._noDisponible(`el juicio no respondio: ${err.message}`, { ms: Date.now() - t0 });
    }

    // Respuesta que no es JSON (o no es un objeto) = el juicio no se pudo leer. 502, no 200 vacío.
    const crudo = this._jsonDe(respuesta.contenido);
    if (!crudo) {
      return this._noDisponible('la respuesta del juicio no es un objeto JSON parseable',
        { ms: Date.now() - t0 });
    }

    const { extraido, descartes, ignorados } = this._validar(crudo);
    const faltantes = CAMPOS.filter((c) => extraido[c] === null);
    const abierto = { juicio: null, campos: null, ignorados: null, obligatorios: null, texto_truncado: null, vacio: null };
    if (Object.keys(descartes).length > 0) abierto.campos = descartes;
    if (ignorados.length > 0) abierto.ignorados = ignorados;
    abierto.obligatorios = this._notaObligatorios(input.obligatorios);
    if (respuesta.truncado) {
      abierto.texto_truncado = `el texto se recorto a ${this._cfg.max_texto} caracteres ` +
        '(lo que no quepa no se ha leido: puede faltar un dato)';
    }
    if (faltantes.length === CAMPOS.length) {
      abierto.vacio = 'el juicio no reconocio ningun campo conocido en el texto (no se rellena a ojo)';
    }

    const obligatorios = this._obligatorios(input.obligatorios);
    // Una propuesta vacía NO es una propuesta: hace falta al menos un campo del juicio.
    const propuesta = obligatorios.every((c) => extraido[c] !== null)
      && CAMPOS.some((c) => extraido[c] !== null);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'extractor-juicio',
        extraido,
        // Quién juzgó: el motor y el modelo viajan en la respuesta (trazabilidad del dato).
        motor: 'deepseek',
        modelo: this._cfg.modelo,
        faltantes,
        propuesta,
        abierto,
        ms: Date.now() - t0,
        // Extras para poder encadenar sin volver a pedir el contexto (mismo idioma que A4.1).
        documento: this._refDocumento(input.documento),
        clase: input.clase != null ? String(input.clase) : null,
        clave_excepcion: this._clave(input, texto),
        asienta: false,
        determinista: false
      }
    };
  }

  // ── Llamada al LLM (HTTP, OpenAI-compatible) ──
  async _llamar(texto) {
    const recorte = this._recortar(texto);
    const cuerpo = {
      model: this._cfg.modelo,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SISTEMA },
        {
          role: 'user',
          content: 'TEXTO DEL DOCUMENTO (delimitado por las marcas):\n' +
            `<<<DOCUMENTO\n${recorte.texto}\nDOCUMENTO>>>\n\n` +
            'Devuelve SOLO el objeto JSON con las nueve claves pedidas. ' +
            'Lo que no aparezca en el texto va como null.'
        }
      ]
    };

    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this._cfg.timeout_ms) : null;
    let res;
    try {
      res = await fetch(this._cfg.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // La clave va en la cabecera y en ningún otro sitio: no se loguea, no se devuelve.
          Authorization: `Bearer ${this._apiKey}`
        },
        body: JSON.stringify(cuerpo),
        ...(ctrl ? { signal: ctrl.signal } : {})
      });
    } catch (err) {
      const abortado = err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
      throw new Error(abortado
        ? `timeout (${this._cfg.timeout_ms} ms)`
        : `fallo de red (${(err && err.message) || 'desconocido'})`);
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!res || res.ok !== true) {
      const status = res && res.status != null ? res.status : 'sin status';
      // Sin el cuerpo del proveedor en el mensaje: puede traer detalles que no son del dominio.
      throw new Error(`HTTP ${status} del proveedor de juicio`);
    }

    let sobre;
    try {
      sobre = await res.json();
    } catch (_) {
      throw new Error('la respuesta del proveedor no es JSON');
    }
    const contenido = sobre && sobre.choices && sobre.choices[0] && sobre.choices[0].message
      ? sobre.choices[0].message.content
      : null;
    if (typeof contenido !== 'string' || contenido.trim() === '') {
      throw new Error('la respuesta del proveedor no trae contenido');
    }
    return { contenido, truncado: recorte.truncado };
  }

  // El contenido del modelo se acepta como JSON aunque venga con cerca de markdown o con prosa
  // alrededor: lo que NO se acepta es que no haya objeto JSON dentro.
  _jsonDe(contenido) {
    if (typeof contenido !== 'string') return null;
    let s = contenido.trim();
    const cerca = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (cerca) s = cerca[1].trim();
    if (!s.startsWith('{')) {
      const a = s.indexOf('{');
      const b = s.lastIndexOf('}');
      if (a === -1 || b <= a) return null;
      s = s.slice(a, b + 1);
    }
    try {
      const obj = JSON.parse(s);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      return obj;
    } catch (_) {
      return null;
    }
  }

  // ── VALIDACIÓN (la puerta determinista del juicio) ──
  // Devuelve los campos que PASAN; lo que no pasa queda null y con su motivo en `descartes`.
  _validar(crudo) {
    const extraido = {};
    const descartes = {};
    const ignorados = [];

    for (const clave of Object.keys(crudo)) {
      if (!CAMPOS.includes(clave)) ignorados.push(clave);
    }

    for (const campo of CAMPOS) {
      const bruto = Object.prototype.hasOwnProperty.call(crudo, campo) ? crudo[campo] : null;
      const r = IMPORTES.has(campo) ? this._validarImporte(campo, bruto) : this._validarTexto(campo, bruto);
      if (r.ok) {
        extraido[campo] = r.valor;
      } else {
        extraido[campo] = null;
        // Un campo AUSENTE no es un descarte: no está en el texto y ya está (no se declara ruido).
        if (r.motivo) descartes[campo] = r.motivo;
      }
    }
    return { extraido, descartes, ignorados };
  }

  _validarTexto(campo, bruto) {
    if (bruto === null || bruto === undefined) return { ok: false, motivo: null };
    if (typeof bruto === 'object') {
      return { ok: false, motivo: 'descartado: tipo no escalar (objeto/array) donde se esperaba texto' };
    }
    // `numero` es el único campo de texto que puede llegar como número sin ser una rareza
    // (el modelo copia "2024/117" como string, pero a veces devuelve 117).
    if (typeof bruto !== 'string' && campo !== 'numero') {
      return { ok: false, motivo: `descartado: tipo ${typeof bruto} donde se esperaba texto` };
    }
    const s = String(bruto).replace(/\s+/g, ' ').trim();
    if (!s) return { ok: false, motivo: 'descartado: cadena vacia' };
    if (this._centinela(s)) {
      return { ok: false, motivo: `descartado: valor comodin ("${s.slice(0, 24)}") donde no habia dato` };
    }
    if (s.length > (campo === 'proveedor' ? 200 : 64)) {
      return { ok: false, motivo: 'descartado: longitud fuera de rango para el campo' };
    }
    if (campo === 'nif') return this._validarNif(s);
    if (campo === 'fecha') return this._validarFecha(s);
    if (campo === 'moneda') {
      const m = s.toUpperCase();
      if (!/^[A-Z]{3}$/.test(m)) {
        return { ok: false, motivo: `descartado: "${s.slice(0, 12)}" no es un codigo de moneda de 3 letras` };
      }
      return { ok: true, valor: m };
    }
    return { ok: true, valor: s };
  }

  _validarNif(s) {
    const nif = s.replace(/[\s.\-]/g, '').toUpperCase();
    if (!/^[0-9A-Z]{5,15}$/.test(nif)) {
      return { ok: false, motivo: 'descartado: el NIF no tiene forma de identificador fiscal' };
    }
    // Si tiene forma española se comprueba la letra/dígito de control: un NIF que no valida es
    // un NIF mal leído o inventado, y un NIF inventado envenena el maestro de terceros.
    const control = this._controlNifValido(nif);
    if (control === false) {
      return { ok: false, motivo: 'descartado: NIF espanol con control invalido (dato mal leido o inventado)' };
    }
    return { ok: true, valor: nif };
  }

  // true = control válido, false = control inválido, null = forma no española (no se juzga).
  _controlNifValido(nif) {
    const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE';
    const dni = nif.match(/^(\d{8}|[XYZ]\d{7})([A-Z])$/);
    if (dni) {
      const num = dni[1].replace(/^X/, '0').replace(/^Y/, '1').replace(/^Z/, '2');
      return LETRAS[Number(num) % 23] === dni[2];
    }
    const cif = nif.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/);
    if (cif) {
      const digitos = cif[2];
      let suma = 0;
      for (let i = 0; i < 7; i++) {
        const d = Number(digitos[i]);
        if (i % 2 === 1) {
          suma += d;
        } else {
          const doble = d * 2;
          suma += Math.floor(doble / 10) + (doble % 10);
        }
      }
      const digito = (10 - (suma % 10)) % 10;
      const letra = 'JABCDEFGHI'[digito];
      return cif[3] === String(digito) || cif[3] === letra;
    }
    return null;
  }

  _validarFecha(s) {
    let y; let m; let d;
    const es = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (es) {
      d = Number(es[1]); m = Number(es[2]); y = Number(es[3]);
      if (y < 100) y += 2000;
    } else {
      const iso = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
      if (!iso) {
        return { ok: false, motivo: `descartado: fecha "${s.slice(0, 16)}" sin forma dd/mm/yyyy` };
      }
      y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]);
    }
    if (!(y >= 1900 && y <= 2100)) {
      return { ok: false, motivo: `descartado: fecha con año ${y} fuera del rango plausible (1900-2100)` };
    }
    if (!(m >= 1 && m <= 12)) return { ok: false, motivo: `descartado: fecha con mes ${m} inexistente` };
    const bisiesto = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const dias = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!(d >= 1 && d <= dias[m - 1])) {
      return { ok: false, motivo: `descartado: fecha con dia ${d} inexistente en el mes ${m} de ${y}` };
    }
    // Se devuelve TAL CUAL aparezca (regla del prompt): validar no es normalizar.
    return { ok: true, valor: s };
  }

  _validarImporte(campo, bruto) {
    if (bruto === null || bruto === undefined) return { ok: false, motivo: null };
    let numero; let valor;
    if (typeof bruto === 'number') {
      if (!Number.isFinite(bruto)) return { ok: false, motivo: 'descartado: numero no finito' };
      numero = bruto;
      valor = this._aTextoEs(bruto);
    } else if (typeof bruto === 'string') {
      const s = bruto.trim();
      if (!s) return { ok: false, motivo: 'descartado: cadena vacia' };
      numero = this._numeroEs(s);
      if (numero === null) {
        return { ok: false, motivo: `descartado: "${s.slice(0, 24)}" no es un importe parseable` };
      }
      valor = s;
    } else {
      return { ok: false, motivo: `descartado: tipo ${typeof bruto} donde se esperaba un importe` };
    }
    if (campo === 'iva_pct') {
      if (!(numero >= 0 && numero <= 100)) {
        return { ok: false, motivo: `descartado: iva_pct ${numero} fuera del rango 0-100` };
      }
    } else if (Math.abs(numero) > 1e12) {
      return { ok: false, motivo: 'descartado: importe fuera de rango' };
    }
    return { ok: true, valor };
  }

  // Parser ES tolerante (mismo idioma que control-cuadre-documento): '69,96' → 69.96,
  // '1.234,56' → 1234.56, '1.234' → 1234 (miles), '1234.56' → 1234.56. Sin número → null.
  _numeroEs(v) {
    let s = String(v).trim().replace(/[€$£]/g, '').replace(/\s/g, '').replace(/EUR|USD|GBP/gi, '');
    if (!s || !/^-?[\d.,]+$/.test(s)) return null;
    if (s.includes(',')) {
      if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d{1,4})?$/.test(s)) return null;
      const n = Number(s.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    if (!/^-?\d+(\.\d{1,4})?$/.test(s)) return null;
    const partes = s.split('.');
    if (partes.length === 2 && partes[1].length === 3) {
      const n = Number(partes.join(''));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // Número JSON → string con coma decimal (el formato que habla el resto de la cadena).
  _aTextoEs(n) {
    const redondeado = Math.round(n * 1e6) / 1e6;
    return String(redondeado).replace('.', ',');
  }

  _centinela(s) {
    return /^(null|undefined|none|n\/?a|nan|desconocid[oa]|sin datos|no consta|s\/d|n\.d\.|-+|—+|\?+)$/i
      .test(String(s).trim());
  }

  // ── Contexto del documento ──
  _texto(input = {}) {
    const cand = input.texto != null ? input.texto : (input.contenido != null ? input.contenido : null);
    if (typeof cand === 'string') return cand;
    const doc = input.documento && typeof input.documento === 'object' ? input.documento : null;
    if (doc) {
      const t = doc.texto != null ? doc.texto : (doc.contenido != null ? doc.contenido : null);
      if (typeof t === 'string') return t;
    }
    return '';
  }

  _recortar(texto) {
    const t = String(texto);
    if (t.length <= this._cfg.max_texto) return { texto: t, truncado: false };
    return { texto: t.slice(0, this._cfg.max_texto), truncado: true };
  }

  // El referente del documento (id/ruta/tipo) para la respuesta y la clave: no el contenido entero.
  _refDocumento(doc) {
    const d = doc && typeof doc === 'object' ? doc : {};
    return {
      id: d.id != null ? String(d.id) : null,
      ruta: d.ruta != null ? String(d.ruta) : (d.path != null ? String(d.path) : null),
      tipo: d.tipo != null ? String(d.tipo) : null
    };
  }

  // Clave de la excepción: la del DOCUMENTO, para que el custodio de la cola deduplique contra
  // la que ya pudo encolar A4.1 (una excepción por documento, no una por motor que lo vio).
  // Se usa el MISMO orden de preferencia que extraccion-dato (id → ruta → path): si las dos
  // mitades eligen claves distintas del mismo documento, la deduplicación por clave no sirve.
  _clave(input = {}, texto = '') {
    if (input.clave != null) return String(input.clave);
    const d = input.documento && typeof input.documento === 'object' ? input.documento : {};
    const ref = d.clave != null ? d.clave : (d.id != null ? d.id : (d.ruta != null ? d.ruta : d.path));
    if (ref != null && ref !== '') return `doc:${ref}`;
    // Sin referente: huella del TEXTO (estable y sin filtrar el contenido a la clave).
    const h = crypto.createHash('sha1').update(String(texto)).digest('hex').slice(0, 12);
    return `doc:h:${h}`;
  }

  _obligatorios(decl) {
    if (!Array.isArray(decl) || decl.length === 0) return OBLIGATORIOS_MINIMOS.slice();
    const conocidos = decl.map(String).filter((c) => CAMPOS.includes(c));
    return conocidos.length > 0 ? conocidos : OBLIGATORIOS_MINIMOS.slice();
  }

  _notaObligatorios(decl) {
    if (!Array.isArray(decl) || decl.length === 0) {
      return `no se declararon obligatorios: se exige el minimo para poder asentar ` +
        `(${OBLIGATORIOS_MINIMOS.join(', ')})`;
    }
    const raros = decl.map(String).filter((c) => !CAMPOS.includes(c));
    if (raros.length > 0) {
      return `obligatorios ignorados por no ser campos extraibles: ${raros.join(', ')}`;
    }
    return null;
  }

  _noDisponible(motivo, extra = {}) {
    // Degradación honesta: no hay juicio, y se DICE. El llamante puede encolar el hueco.
    return this._errorResponse(502, 'JUICIO_NO_DISPONIBLE', motivo,
      { abierto: { juicio: motivo }, ...extra });
  }

  _leerClave(ruta) {
    // La clave vive en el .env VIVO (nunca en el manifest, nunca en un log).
    try {
      const crudo = fs.readFileSync(path.resolve(String(ruta)), 'utf-8');
      for (const linea of crudo.split(/\r?\n/)) {
        const m = linea.match(/^\s*(?:export\s+)?DEEPSEEK_API_KEY_GLOBAL\s*=\s*(.+?)\s*$/);
        if (m && m[1]) {
          const v = m[1].replace(/^["']|["']$/g, '').trim();
          if (v) return v;
        }
      }
    } catch (_) {
      // Sin .env legible: se devuelve null y onLoad lo declara. No se cae el módulo.
    }
    return null;
  }

  // ── Tools ──
  toolExtraer(params) { return this._extraer(params); }
}

module.exports = ExtractorJuicio;
