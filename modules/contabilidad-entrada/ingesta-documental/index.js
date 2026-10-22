/**
 * contabilidad-entrada/ingesta-documental — REFLEJO STATELESS (C · canales → puerto digital).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE: alguien tiene que RECOGER el papel.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * La vertical de entrada documental (ticket · albarán · factura) arranca en
 * `puerto-documento-digital.recibir` (A5): a partir de ahí todo es cadena por EVENTO
 * (lector → clasificador → extracción → normalizador → escritor). Pero el puerto NO
 * cablea ningún canal — a propósito ("cero fuentes hardcodeadas"). Este módulo es ese
 * cableado, y SOLO eso: CANALES → puerto. No lee, no clasifica, no interpreta, no
 * escribe dominio. Su única responsabilidad es convertir "hay un fichero aquí" en
 * "hay un documento recibido".
 *
 * Por qué como módulo y no como script del sitio: los dos canales reales (carpeta del
 * storage del proyecto y Telegram push) llegan por caminos distintos — uno se consulta
 * (barrer), el otro empuja (photo/document received) — y ambos tienen que producir la
 * MISMA entrega al puerto. Un solo sitio donde se decide "esto es entregable y esto no"
 * evita que cada canal invente su forma.
 *
 * INVARIANTES (honestidad, la regla de toda la vertical):
 *   · Sin vínculo declarado bot→proyecto NO se adivina el proyecto: se IGNORA y se
 *     loguea con `abierto.proyecto`. Entregar un documento al libro de un negocio que
 *     no es el suyo es peor que no entregarlo.
 *   · Idempotencia: el set de sha256 ya entregados vive EN MEMORIA (sin persistencia).
 *     Es una cortesía de este módulo, no la verdad: quien decide de verdad si un hecho
 *     está duplicado es `deduplicacion-hecho` (más abajo en la vertical). Por eso el
 *     set se pierde al reiniciar y eso es aceptable — el sha256 viaja en el documento
 *     para que el deduplicador serio lo pueda usar.
 *   · Lo que no se puede leer o no es un formato soportado NO se entrega: se devuelve
 *     en `ignorados` con MOTIVO. Nada se cae en silencio.
 *
 * Forma: REFLEJO → STATELESS (sin PosPersistencia, sin blueprint). Las dos ops son
 * ORDEN (barrer mueve documentos, entregar entrega) → SÍ llevan ui_handler declarado.
 * Ver sección 'C · ingesta-documental' de docs/entrada-documental-contrato.md.
 */

'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fsp = require('fs').promises;

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Mismo conjunto que `lector-documento`: si el lector no sabe abrirlo, entregarlo solo
// llenaría la cola de excepciones con un 415 seguro.
const MIME_POR_EXT = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff'
};
const EXTS_SOPORTADAS = Object.keys(MIME_POR_EXT);

// Carpeta por defecto: el buzón del proyecto, relativa a su storage.
const CARPETA_DEFAULT = 'inbox/';

// Normaliza la carpeta a una ruta relativa terminada en '/' (fs.list espera un directorio).
function normalizarCarpeta(carpeta) {
  let s = String(carpeta == null ? '' : carpeta).trim();
  if (!s) s = CARPETA_DEFAULT;
  s = s.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!s.endsWith('/')) s += '/';
  return s;
}

// Extensión en minúsculas con punto, o null si el nombre no tiene una.
function extensionDe(nombre) {
  const m = /(\.[A-Za-z0-9]+)\s*$/.exec(String(nombre == null ? '' : nombre).trim());
  return m ? m[1].toLowerCase() : null;
}

// Nombre de fichero seguro para componer una ruta del storage (sin traversal ni vacíos).
function nombreSeguro(nombre, porDefecto) {
  const base = path.basename(String(nombre == null ? '' : nombre).trim());
  const limpio = base.replace(/[^\w.\-]+/g, '_');
  return limpio || porDefecto;
}

class IngestaDocumental extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ingesta-documental';
    this.version = 'reflejo-0.1.0';

    // Config: defaults aquí; el manifest y el sitio pueden pisarlos en onLoad.
    this.config = {
      carpeta_default: CARPETA_DEFAULT,
      // Declaración explícita de qué bot es de qué negocio. Sin entrada aquí, un
      // mensaje de Telegram NO se puede atribuir a ningún proyecto (no se adivina).
      vinculos: {},
      timeout_get_file_ms: 30000,
      tmp_dir: os.tmpdir()
    };

    // Idempotencia EN MEMORIA (sin persistencia): sha256 ya entregados por este proceso.
    // El deduplicador real de la vertical es `deduplicacion-hecho`.
    this._entregados = new Set();
  }

  async onLoad(context) {
    await super.onLoad(context);
    const deManifest = context?.moduleConfig && typeof context.moduleConfig === 'object' ? context.moduleConfig : {};
    const delSitio = context?.config?.[this.name] && typeof context.config[this.name] === 'object'
      ? context.config[this.name]
      : {};
    this.config = {
      ...this.config,
      ...deManifest,
      ...delSitio,
      // Los vínculos se MEZCLAN: el sitio añade bots sin borrar los del manifest.
      vinculos: {
        ...(this.config.vinculos || {}),
        ...(deManifest.vinculos || {}),
        ...(delSitio.vinculos || {})
      }
    };
    this.logger?.info(`${this.name}.vinculos`, {
      module: this.name,
      bots_vinculados: Object.keys(this.config.vinculos || {}).length
    });
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC (ORDEN → ui_handler). Una línea, delegan a _atender ──
  onBarrerRequest(e) {
    return this._atender(e, 'barrer', 'ingesta-documental.barrer.response', (d) => {
      return this._barrer(d).then((res) => {
        if (res.status !== 200) this.eventBus?.publish('ingesta-documental.barrer.failed', res);
        return res;
      });
    });
  }

  onEntregarRequest(e) {
    return this._atender(e, 'entregar', 'ingesta-documental.entregar.response', (d) => {
      return this._entregar(d).then((res) => {
        if (res.status !== 200) this.eventBus?.publish('ingesta-documental.entregar.failed', res);
        return res;
      });
    });
  }

  onBarrerEmailRequest(e) {
    return this._atender(e, 'barrer_email', 'ingesta-documental.barrer_email.response', (d) => {
      return this._barrerEmail(d).then((res) => {
        if (res.status !== 200) this.eventBus?.publish('ingesta-documental.barrer_email.failed', res);
        return res;
      });
    });
  }

  // ── handlers de dominio (fire-and-forget): el canal Telegram EMPUJA un fichero ──
  onTelegramPhotoReceived(e) {
    return this._desdeTelegram(e, 'photo');
  }

  onTelegramDocumentReceived(e) {
    return this._desdeTelegram(e, 'document');
  }


  // ══════════════════════════════════════════════════════════════════════
  // RESOLUCIÓN DEL PROYECTO — el módulo NO se "monta" por proyecto.
  // Ley del sistema, en este orden (dato declarado = desconocido, no se adivina):
  //   1. el proyecto que INVOCA (el panel del proyecto pasa el suyo);
  //   2. el CANAL ya trae su dueño: vínculo bot→proyecto del telegram-bridge
  //      (su registro real, no una copia de config que se queda vieja);
  //   3. vínculo cuenta-de-correo→proyecto (una cuenta es de un negocio);
  //   4. si el core tiene UN SOLO proyecto activo, ese; si hay varios → AMBIGUO
  //      y se declara (jamás se reparte el papel a un proyecto al azar).
  // ══════════════════════════════════════════════════════════════════════
  async _resolverProyecto(input = {}) {
    const directo = input.project_id || this.project_id;
    if (directo) return { project_id: String(directo), origen: 'invocacion', ambiguo: 0 };

    if (input.botName) {
      const declarado = (this.config.vinculos || {})[input.botName];
      if (declarado) return { project_id: String(declarado), origen: 'config_bot', ambiguo: 0 };
      const lista = await this._rpc('telegram.bridge.listar.request', {}, { timeout_ms: this._timeoutProyecto() });
      const vinculos = (lista && ((lista.data && lista.data.vinculos) || lista.vinculos)) || [];
      const v = vinculos.find((x) => x && x.botName === input.botName && x.project_id);
      if (v) return { project_id: String(v.project_id), origen: 'telegram_bridge', ambiguo: 0 };
    }

    if (input.cuentaEmail) {
      const declarado = (this.config.vinculos_email || {})[input.cuentaEmail];
      if (declarado) return { project_id: String(declarado), origen: 'config_email', ambiguo: 0 };
    }

    const pl = await this._rpc('project.list.request', {}, { timeout_ms: this._timeoutProyecto() });
    const activos = (pl && ((pl.data && pl.data.active_project_ids) || pl.active_project_ids)) || [];
    if (activos.length === 1) return { project_id: String(activos[0]), origen: 'unico_activo', ambiguo: 0 };
    return { project_id: null, origen: null, ambiguo: activos.length };
  }

  // Los providers contestan ENVUELTOS ({data:{...}}); los módulos de la vertical, planos.
  // Este helper acepta las dos formas sin adivinar: si hay `data`, es la carga útil.
  _datos(x) {
    if (!x || typeof x !== 'object') return {};
    return x.data !== undefined && x.data !== null ? x.data : x;
  }

  _timeoutProyecto() {
    const n = Number(this.config.timeout_proyecto_ms);
    return Number.isFinite(n) && n > 0 ? n : 8000;
  }

  // Error homogéneo: no se pudo resolver el proyecto y NO se inventa.
  _proyectoNoResuelto(res, canal) {
    return this._errorResponse(400, 'PROYECTO_NO_RESUELTO',
      res.ambiguo > 1
        ? `hay ${res.ambiguo} proyectos activos: el canal '${canal}' necesita saber a cual pertenece (pasalo en project_id o declara el vinculo)`
        : `no se pudo resolver el proyecto del canal '${canal}' (sin project_id, sin vinculo de canal y sin proyecto unico activo)`,
      {
        canal,
        abierto: { proyecto: res.ambiguo > 1 ? 'varios proyectos activos: ambiguo' : 'sin vinculo de canal' }
      });
  }

  // ══════════════════════════════════════════════════════════════════════
  // op `barrer` — barre una carpeta del storage y entrega lo NUEVO
  // ══════════════════════════════════════════════════════════════════════
  async _barrer(input = {}) {
    const resProy = await this._resolverProyecto(input);
    if (!resProy.project_id) return this._proyectoNoResuelto(resProy, 'carpeta');
    const pid = resProy.project_id;

    const carpeta = normalizarCarpeta(input.carpeta || this.config.carpeta_default);
    const listado = await this._rpc('fs.list.request', { project_id: pid, path: carpeta });

    // Sin respuesta del bus: NO se sabe si la carpeta existe → se declara, no se inventa.
    if (!listado) {
      return this._errorResponse(502, 'FS_NO_DISPONIBLE',
        'el bus no respondio a fs.list: no se puede saber si la carpeta existe', {
          carpeta,
          abierto: { carpeta: 'sin respuesta de fs.list' }
        });
    }
    // Error del fs (RESOURCE_NOT_FOUND si no existe la carpeta).
    if (listado.error) {
      const codigo = listado.error.code || 'UNKNOWN_ERROR';
      const status = codigo === 'RESOURCE_NOT_FOUND' ? 404 : 502;
      return this._errorResponse(status, codigo,
        listado.error.message || `no se pudo listar la carpeta '${carpeta}'`, {
          carpeta,
          abierto: { carpeta: status === 404 ? 'la carpeta no existe en el storage del proyecto' : null }
        });
    }

    const ficheros = Array.isArray(listado.files) ? listado.files
      : (Array.isArray(listado.items) ? listado.items : []);

    const entregados = [];
    const ignorados = [];

    for (const f of ficheros) {
      const ruta = f && (f.path || (f.name ? `${carpeta}${f.name}` : null));
      if (!ruta) { ignorados.push({ path: null, motivo: 'entrada_sin_ruta' }); continue; }

      // Los subdirectorios no se recorren: barrer es UN nivel (el buzón), no un árbol.
      if (f.type && f.type !== 'file') { ignorados.push({ path: ruta, motivo: 'no_es_fichero' }); continue; }

      const ext = extensionDe(f.extension || f.name || ruta);
      if (!ext || !EXTS_SOPORTADAS.includes(ext)) {
        ignorados.push({ path: ruta, motivo: 'extension_no_soportada' });
        continue;
      }

      const bytes = await this._leerBytes(pid, ruta);
      if (!bytes || bytes.length === 0) {
        ignorados.push({ path: ruta, motivo: 'lectura_vacia' });
        continue;
      }

      const sha256 = this._sha256(bytes);
      if (this._entregados.has(sha256)) {
        ignorados.push({ path: ruta, motivo: 'duplicado_sha256' });
        continue;
      }

      const entregado = this._entregarAlPuerto({
        project_id: pid,
        fuente: 'carpeta',
        documento: {
          path: ruta,
          nombre: nombreSeguro(f.name, path.basename(ruta)),
          mime: MIME_POR_EXT[ext],
          sha256
        }
      });
      if (entregado) entregados.push({ path: ruta, sha256 });
      else ignorados.push({ path: ruta, motivo: 'publicacion_fallida' });
    }

    return this._salida(pid, { carpeta, entregados, ignorados });
  }

  // ══════════════════════════════════════════════════════════════════════
  // op `entregar` — entrega UN documento concreto que ya está en el storage
  // ══════════════════════════════════════════════════════════════════════
  async _entregar(input = {}) {
    const resProy = await this._resolverProyecto(input);
    if (!resProy.project_id) return this._proyectoNoResuelto(resProy, 'entregar');
    const pid = resProy.project_id;

    const ruta = typeof input.path === 'string' ? input.path.trim() : '';
    if (!ruta) return this._invalid('path');

    const ext = extensionDe(ruta);
    if (!ext || !EXTS_SOPORTADAS.includes(ext)) {
      return this._errorResponse(415, 'FORMATO_NO_SOPORTADO',
        `extension '${ext || '(sin extension)'}' no soportada por la entrada documental`, {
          path: ruta,
          soportadas: EXTS_SOPORTADAS
        });
    }

    const bytes = await this._leerBytes(pid, ruta);
    if (!bytes || bytes.length === 0) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        'el documento no se pudo leer del storage del proyecto (no existe o esta vacio)', {
          path: ruta,
          abierto: { documento: 'sin bytes: no se entrega lo que no se puede leer' }
        });
    }

    const sha256 = this._sha256(bytes);
    if (this._entregados.has(sha256)) {
      // Idempotente: el mismo documento ya se entregó en este proceso.
      return this._salida(pid, {
        fuente: String(input.fuente || 'carpeta'),
        entregados: [],
        ignorados: [{ path: ruta, motivo: 'duplicado_sha256' }]
      });
    }

    const ok = this._entregarAlPuerto({
      project_id: pid,
      fuente: String(input.fuente || 'carpeta'),
      documento: {
        path: ruta,
        nombre: nombreSeguro(input.nombre, path.basename(ruta)),
        mime: input.mime ? String(input.mime) : MIME_POR_EXT[ext],
        sha256
      }
    });
    if (!ok) {
      return this._errorResponse(502, 'PUBLICACION_FALLIDA',
        'no se pudo publicar la entrega en el bus', { path: ruta });
    }

    return this._salida(pid, {
      fuente: String(input.fuente || 'carpeta'),
      entregados: [{ path: ruta, sha256 }],
      ignorados: []
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // op `barrer_email` — canal GMAIL: busca correos con adjuntos y entrega cada
  // adjunto soportado. NO procesa el correo (ni cuerpo ni remitente como hecho):
  // el documento es el ADJUNTO; el email solo es el transporte.
  // ══════════════════════════════════════════════════════════════════════
  async _barrerEmail(input = {}) {
    const cuenta = input.cuenta != null ? String(input.cuenta)
      : (this.config.cuenta_email != null ? String(this.config.cuenta_email) : null);

    // El proyecto se resuelve por el canal (cuenta de correo → proyecto) o por el panel.
    const resProy = await this._resolverProyecto({ ...input, cuentaEmail: cuenta });
    if (!resProy.project_id) return this._proyectoNoResuelto(resProy, 'gmail');
    const pid = resProy.project_id;
    const query = input.query != null ? String(input.query)
      : (this.config.query_email || 'has:attachment -in:trash');
    const maxResults = Number(input.maxResults || this.config.max_email || 20);

    const busqueda = await this._rpc('local.gmail.search.request',
      { account: cuenta, query, maxResults },
      { timeout_ms: Number(this.config.timeout_gmail_ms) || 60000 });

    if (!busqueda) {
      return this._errorResponse(502, 'GMAIL_NO_DISPONIBLE',
        'el bus no respondio a la busqueda en Gmail (servicio local.gmail ausente o colgado)', {
          cuenta, query,
          abierto: { gmail: 'sin respuesta del servicio local.gmail (no se puede saber si hay correos)' }
        });
    }
    if (busqueda.error) {
      const msg = busqueda.error.message || busqueda.error;
      const esAuth = /invalid_grant|invalid_request|unauthorized|401|token/i.test(String(msg));
      return this._errorResponse(esAuth ? 401 : 502,
        esAuth ? 'GMAIL_NO_AUTORIZADO' : 'GMAIL_ERROR',
        esAuth
          ? `Gmail no autorizado para la cuenta '${cuenta || 'default'}': ${msg}. Hay que rehacer el OAuth (refresh token caducado o revocado).`
          : `Gmail fallo al buscar: ${msg}`, {
          cuenta, query,
          abierto: { gmail: esAuth ? 'credenciales caducadas: reautorizar (scripts/gmail-oauth-setup.js)' : msg }
        });
    }

    // La respuesta del provider viene ENVUELTA: {data:{messages:[...]}} (medido en producción).
    // Leer `busqueda.messages` a pelo devolvía 0 correos y el barrido "funcionaba" en vacío.
    const datosBusqueda = this._datos(busqueda);
    const mensajes = Array.isArray(datosBusqueda.messages) ? datosBusqueda.messages : [];
    const entregados = [];
    const ignorados = [];

    for (const m of mensajes) {
      const messageId = m && m.id;
      if (!messageId) { ignorados.push({ path: null, motivo: 'mensaje_sin_id' }); continue; }

      const crudo = await this._rpc('local.gmail.read.request',
        { account: cuenta, messageId, format: 'full' },
        { timeout_ms: Number(this.config.timeout_gmail_ms) || 60000 });
      if (!crudo || crudo.error) {
        ignorados.push({ path: messageId, motivo: 'correo_ilegible' });
        continue;
      }
      const correo = this._datos(crudo);

      const adjuntos = Array.isArray(correo.attachments) ? correo.attachments : [];
      for (const att of adjuntos) {
        const nombre = att && att.filename ? String(att.filename) : '';
        const mime = att && att.mimeType ? String(att.mimeType) : '';
        const ext = extensionDe(nombre) || extensionDe(mime);
        // Solo se ingiere lo que la cadena sabe leer; el resto se declara.
        if (!ext || !EXTS_SOPORTADAS.includes(ext)) {
          ignorados.push({ path: nombre || null, motivo: 'adjunto_no_soportado' });
          continue;
        }
        if (!att.id) { ignorados.push({ path: nombre || null, motivo: 'adjunto_sin_id' }); continue; }

        const crudoDescarga = await this._rpc('local.gmail.attachments.download.request',
          { account: cuenta, messageId, attachmentId: att.id },
          { timeout_ms: Number(this.config.timeout_gmail_ms) || 60000 });
        const descarga = crudoDescarga ? this._datos(crudoDescarga) : null;
        const content = descarga && !crudoDescarga.error ? descarga.content : null;
        if (!content) { ignorados.push({ path: nombre || null, motivo: 'adjunto_sin_contenido' }); continue; }

        let bytes;
        try { bytes = Buffer.from(String(content), 'base64'); } catch (_) { bytes = null; }
        if (!bytes || bytes.length === 0) {
          ignorados.push({ path: nombre || null, motivo: 'adjunto_vacio' });
          continue;
        }

        const sha256 = this._sha256(bytes);
        if (this._entregados.has(sha256)) {
          ignorados.push({ path: nombre || null, motivo: 'duplicado_sha256' });
          continue;
        }

        // El ADJUNTO se guarda en el buzón del proyecto (multi-tenant): el canal no
        // entrega rutas del host ni depende de que Gmail siga accesible.
        const ruta = `inbox/email-${messageId}-${nombreSeguro(nombre, `adjunto${ext}`)}`;
        const escrito = await this._rpc('fs.write.request',
          { project_id: pid, path: ruta, content: bytes.toString('base64'), encoding: 'base64' },
          { timeout_ms: 30000 });
        if (!escrito || escrito.error) {
          ignorados.push({ path: nombre || null, motivo: 'no_se_pudo_guardar' });
          continue;
        }

        const ok = this._entregarAlPuerto({
          project_id: pid,
          fuente: 'gmail',
          documento: {
            path: ruta,
            nombre: nombreSeguro(nombre, path.basename(ruta)),
            mime: mime || MIME_POR_EXT[ext],
            sha256,
            mensaje_id: messageId,
            remitente: correo.from || null,
            asunto: correo.subject || null
          }
        });
        if (ok) entregados.push({ path: ruta, sha256 });
        else ignorados.push({ path: ruta, motivo: 'publicacion_fallida' });
      }
    }

    return this._salida(pid, { fuente: 'gmail', cuenta, query, entregados, ignorados });
  }

  // ══════════════════════════════════════════════════════════════════════
  // canal Telegram (fire-and-forget) — descarga al host, sube al storage, entrega
  // ══════════════════════════════════════════════════════════════════════
  async _desdeTelegram(event, clase) {
    const d = (event && (event.data || event)) || {};
    try {
      const botName = d.botName != null ? String(d.botName) : '';
      if (!botName || !d.fileId) {
        this.logger?.warn(`${this.name}.telegram.incompleto`, {
          module: this.name, clase, tiene_bot: !!botName, tiene_file: !!d.fileId
        });
        return null;
      }

      // El proyecto lo trae el CANAL: el telegram-bridge ya tiene el vínculo bot→proyecto
      // (registro real). No hay que declararlo dos veces ni "montar" nada aquí.
      const resProy = await this._resolverProyecto({ botName });
      const pid = resProy.project_id;
      if (!pid) {
        this.logger?.warn(`${this.name}.telegram.sin_proyecto`, {
          module: this.name,
          clase,
          botName,
          messageId: d.messageId,
          origen: resProy.origen,
          ambiguo: resProy.ambiguo,
          abierto: { proyecto: resProy.ambiguo > 1
            ? 'varios proyectos activos y el bot no esta vinculado'
            : 'bot sin vinculo en telegram-bridge: no se adivina el proyecto' }
        });
        return null;
      }

      // Extensión: el documento la trae en el nombre; la foto es siempre JPEG.
      // Sin extensión deducible NO se inventa un tipo: se ignora y se declara.
      const ext = clase === 'document'
        ? (extensionDe(d.fileName) || extensionDe(d.mimeType))
        : '.jpg';
      if (!ext) {
        this.logger?.warn(`${this.name}.telegram.sin_extension`, {
          module: this.name, clase, botName,
          fileName: d.fileName || null, mimeType: d.mimeType || null,
          abierto: { documento: 'ni fileName ni mimeType dan una extension: no se adivina el formato' }
        });
        return null;
      }
      if (!EXTS_SOPORTADAS.includes(ext)) {
        this.logger?.warn(`${this.name}.telegram.formato_no_soportado`, {
          module: this.name, clase, botName, fileName: d.fileName || null, ext
        });
        return null;
      }
      const mime = d.mimeType ? String(d.mimeType) : MIME_POR_EXT[ext];

      // El servicio descarga en el HOST (ruta absoluta en tmp), no en el storage del
      // proyecto: después hay que subir los bytes con fs.write.
      const tmpDir = this.config.tmp_dir || os.tmpdir();
      const etiqueta = nombreSeguro(`${d.messageId || 'msg'}-${d.fileId}`, 'telegram');
      const destinoTmp = path.join(tmpDir, `enki-ingesta-${etiqueta}${ext}`);

      const descarga = await this._rpc('telegram.get_file.request', {
        botName,
        fileId: d.fileId,
        download: true,
        destPath: destinoTmp
      }, { timeout_ms: Number(this.config.timeout_get_file_ms) || 30000 });

      const cuerpo = (descarga && descarga.data) || descarga || {};
      const localPath = cuerpo.localPath || null;
      const statusDescarga = descarga && descarga.status != null ? descarga.status : null;
      if ((statusDescarga != null && statusDescarga >= 400) || !localPath) {
        this.logger?.error(`${this.name}.telegram.descarga_fallida`, {
          module: this.name, clase, botName, fileId: d.fileId,
          status: statusDescarga, error: (descarga && descarga.error) || null,
          abierto: { documento: 'telegram no entrego el fichero en el host' }
        });
        await this._borrarTmp(destinoTmp);
        return null;
      }

      let bytes;
      try {
        bytes = await fsp.readFile(localPath);
      } catch (err) {
        this.logger?.error(`${this.name}.telegram.lectura_tmp_fallida`, {
          module: this.name, clase, botName, localPath, error: err.message
        });
        await this._borrarTmp(destinoTmp);
        return null;
      } finally {
        // El tmp es del host: se limpia SIEMPRE, exista o no la entrega.
        await this._borrarTmp(localPath);
      }

      if (!bytes || bytes.length === 0) {
        this.logger?.warn(`${this.name}.telegram.vacio`, { module: this.name, clase, botName, fileId: d.fileId });
        return null;
      }

      const sha256 = this._sha256(bytes);
      if (this._entregados.has(sha256)) {
        this.logger?.info(`${this.name}.telegram.duplicado`, { module: this.name, clase, botName, sha256 });
        return null;
      }

      // Se sube al storage del proyecto para que el resto de la vertical (lector) pueda
      // leerlo por el bus con la misma ruta relativa que un fichero de la carpeta.
      const rutaStorage = `inbox/${nombreSeguro(`${d.messageId || 'msg'}-${d.fileId}`, 'telegram')}${ext}`;
      const subida = await this._rpc('fs.write.request', {
        project_id: pid,
        path: rutaStorage,
        content: bytes.toString('base64'),
        encoding: 'base64'
      });
      const errorSubida = subida && (subida.error || (subida.status != null && subida.status >= 400));
      if (!subida || errorSubida) {
        this.logger?.error(`${this.name}.telegram.subida_fallida`, {
          module: this.name, clase, botName, path: rutaStorage,
          error: (subida && subida.error) || null,
          abierto: { documento: 'no se pudo dejar el fichero en el storage del proyecto' }
        });
        return null;
      }

      const ok = this._entregarAlPuerto({
        project_id: pid,
        fuente: 'telegram',
        documento: {
          path: rutaStorage,
          nombre: nombreSeguro(d.fileName, path.basename(rutaStorage)),
          mime,
          sha256
        }
      });
      if (!ok) {
        this.logger?.error(`${this.name}.telegram.entrega_fallida`, {
          module: this.name, clase, botName, path: rutaStorage
        });
        return null;
      }

      this.logger?.info(`${this.name}.telegram.entregado`, {
        module: this.name, clase, botName, path: rutaStorage, sha256, messageId: d.messageId || null
      });
      return { path: rutaStorage, sha256 };
    } catch (err) {
      // Fire-and-forget: el canal NUNCA tumba al módulo.
      this.logger?.error(`${this.name}.telegram.error`, {
        module: this.name, clase, error: err.message,
        abierto: { documento: 'fallo inesperado procesando el mensaje de Telegram' }
      });
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // Entregas al puerto digital — ÚNICO punto que publica hacia el puerto
  // ══════════════════════════════════════════════════════════════════════
  _entregarAlPuerto({ project_id, fuente, documento }) {
    const payload = {
      request_id: crypto.randomUUID(),
      project_id,
      fuente,
      documento
    };
    try {
      this.eventBus.publish('puerto-documento-digital.recibir.request', payload);
    } catch (err) {
      this.logger?.error(`${this.name}.entrega.error`, { module: this.name, error: err.message, path: documento.path });
      return false;
    }
    // Solo cuenta como entregado si la publicación no falló: el set de idempotencia
    // refleja lo que SALIÓ al bus, no lo que se intentó.
    this._entregados.add(documento.sha256);
    return true;
  }

  // Lee un fichero del storage del proyecto por el bus, en base64 → Buffer.
  async _leerBytes(project_id, ruta) {
    const resp = await this._rpc('fs.read.request', { project_id, path: ruta, encoding: 'base64' });
    if (!resp || resp.error || typeof resp.content !== 'string') return null;
    // fs.read devuelve base64 para binarios y utf-8 para texto: se respeta lo que diga.
    const esBase64 = resp.encoding === 'base64' || resp.type === 'binary';
    return esBase64 ? Buffer.from(resp.content, 'base64') : Buffer.from(resp.content, 'utf-8');
  }

  async _borrarTmp(ruta) {
    if (!ruta) return;
    try { await fsp.unlink(ruta); } catch (_) { /* best-effort: el tmp se limpia aparte */ }
  }

  _sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
  }

  _salida(project_id, extra = {}) {
    const data = {
      project_id,
      tipo: 'ingesta-documental',
      entregados: extra.entregados || [],
      ignorados: extra.ignorados || [],
      abierto: { proyecto: null, carpeta: null, documento: null }
    };
    if (extra.carpeta != null) data.carpeta = extra.carpeta;
    if (extra.fuente != null) data.fuente = extra.fuente;
    return { status: 200, data };
  }

  // ── Tools ──
  toolBarrer(params) { return this._barrer(params); }
  toolEntregar(params) { return this._entregar(params); }
}

module.exports = IngestaDocumental;
