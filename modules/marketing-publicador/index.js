'use strict';

/**
 * marketing-publicador — EL PANEL DE PUBLICACION POR PROYECTO (bloque 20a).
 *
 * Un panel por proyecto, en su area de marketing: /a/<proyecto>/publicador/.
 * Lista TODO el material de la carpeta del proyecto SIN filtro de formato ni de
 * tamano, deja escribir el texto, elegir destino (historia / publicacion / reels)
 * y manda la orden al aparato por el bus.
 *
 * Piezas, en el orden en que se usan:
 *
 *   1. GET  /material/:proyecto    -> recorre <public>/<proyecto>/media/ en
 *      PROFUNDIDAD y devuelve {nombre, url, bytes, tipo, mime, modificado} de
 *      CADA fichero. No hay lista blanca de extensiones y no hay tope de
 *      tamano: el limite lo pone el aparato, no este modulo. Un .zip se lista
 *      como 'otro' y el panel lo pinta con su nombre.
 *
 *   2. POST /publicar              -> {proyecto, fichero, texto, destino}.
 *      Construye la orden, la emite al bus y devuelve su id. El id es lo que
 *      permite despues preguntar por el estado; sin el, la respuesta del
 *      aparato no se puede emparejar con la orden.
 *
 *   3. GET  /estado/:proyecto/:id  -> {estado, motivo, momento, detalle}.
 *      'enviado' (nadie ha contestado aun) -> 'recibido' (el aparato contesto
 *      algo que NO afirma que se publico) -> 'publicado' | 'fallo'.
 *      El motivo viaja TAL CUAL lo dijo el aparato: 'servicio_no_activo',
 *      'ancla_no_encontrada', 'campo_vacio'... No se traduce a 'error' porque
 *      'servicio_no_activo' y 'ancla_no_encontrada' se arreglan de forma
 *      distinta y un generico no deja arreglar ninguno.
 *
 * La orden que se emite (contrato con el aparato, crate instagram-bridge):
 *
 *   topic:   core/<coreId>/events/bridge/orden/publicar
 *   payload: {"id","accion":"publicar","red":"instagram","destino","texto",
 *             "media":{"url"},"archivo","simulacion":false}
 *
 * Va EN CRUDO, no dentro de un sobre del bus: `Orden::desde_payload` del crate
 * lee el payload como la orden misma y un sobre le haria contestar
 * `campo_ausente` (le falta 'accion' en la raiz). Es un contrato del aparato,
 * no un descuido.
 *
 * `simulacion:false` es OBLIGATORIA: ausente se lee como simulacion y el
 * aparato no mueve un dedo (se probo en el bloque 19d).
 *
 * Y de vuelta: el aparato contesta en core/<coreId>/events/bridge/resultado
 * con el resultado EN CRUDO ({id, accion, red, ok, motivo, detalle, gestos}),
 * sin sobre. El bus de JS tira ese mensaje al validar el sobre
 * (EventEnvelope.validate exige event_id/event_type/timestamp/source), asi que
 * este modulo escucha por DOS puertas: la suscripcion `bridge/resultado` del
 * manifest (por si algun dia viene envuelto) y el topic MQTT crudo. Las dos
 * entran en el mismo normalizador, y aplicar dos veces el mismo resultado no
 * cambia nada.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');

// ── El contrato de destinos (catalogo CERRADO, espejo del aparato) ──────────
const DESTINOS = ['historia', 'publicacion', 'reels'];

// ── El contrato del bus ────────────────────────────────────────────────────
const EVENTO_ORDEN = 'bridge/orden/publicar';
const EVENTO_RESULTADO = 'bridge/resultado';
const ACCION = 'publicar';
const RED = 'instagram';

// ── Los estados que el panel sabe ensenar ──────────────────────────────────
const ESTADOS = ['enviado', 'recibido', 'publicado', 'fallo'];

// Cuantos estados se guardan en memoria. No es un tope de trabajo: es el anillo
// de lo que se puede consultar. Se tira lo mas viejo, nunca lo publicado.
const MAX_ESTADOS = 500;

// El motivo cuando el aparato contesta sin motivo. Se nombra: un fallo sin
// motivo no se puede arreglar.
const SIN_MOTIVO = 'el aparato no dijo el motivo';

// Extension -> [tipo, mime]. Es SOLO para pintar (miniatura / icono / nombre).
// NO es una lista blanca: lo que no este aqui se lista igual, como 'otro'.
const TIPOS = {
  '.jpg': ['imagen', 'image/jpeg'],
  '.jpeg': ['imagen', 'image/jpeg'],
  '.png': ['imagen', 'image/png'],
  '.gif': ['imagen', 'image/gif'],
  '.webp': ['imagen', 'image/webp'],
  '.avif': ['imagen', 'image/avif'],
  '.bmp': ['imagen', 'image/bmp'],
  '.heic': ['imagen', 'image/heic'],
  '.svg': ['imagen', 'image/svg+xml'],
  '.mp4': ['video', 'video/mp4'],
  '.mov': ['video', 'video/quicktime'],
  '.webm': ['video', 'video/webm'],
  '.mkv': ['video', 'video/x-matroska'],
  '.avi': ['video', 'video/x-msvideo'],
  '.m4v': ['video', 'video/x-m4v'],
  '.mp3': ['audio', 'audio/mpeg'],
  '.wav': ['audio', 'audio/wav'],
  '.m4a': ['audio', 'audio/mp4'],
  '.ogg': ['audio', 'audio/ogg'],
  '.pdf': ['pdf', 'application/pdf'],
  '.txt': ['texto', 'text/plain; charset=utf-8']
};

// Los ficheros del panel, en el orden en que se copian al proyecto.
const PANEL_FICHEROS = ['index.html', 'app.js', 'estilo.css'];

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/;

class MarketingPublicadorModule extends BaseModule {
  constructor() {
    super();
    this.name = 'marketing-publicador';
    this.version = '0.1.0';

    // id de publicacion -> {id, proyecto, destino, fichero, estado, motivo, momento, detalle}
    this.estados = new Map();
    this._ordenDeLlegada = [];   // ids en el orden en que entraron (para el anillo)

    this.coreId = 'core-a';
    this.publicRoot = null;      // <public>/<proyecto>  (por defecto /opt/enki/public/a)
    this.publicNs = 'a';         // prefijo publico (config.web.public_ns)

    // El publicador del bus. En produccion es el bus (mqtt); en los tests se
    // inyecta uno falso para no tocar la red. Una sola puerta para los dos.
    this.publicador = null;

    this._onMqttMessage = null;
    this._mqttSuscrito = false;
    this._ultimaFirma = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context = {}) {
    this.logger = context.logger || null;
    this.metrics = context.metrics || null;
    this.eventBus = context.eventBus || null;

    const config = context.moduleConfig || context.config?.['marketing-publicador'] || {};
    this.coreId = context.coreId || context.core?.id || context.config?.core?.id || 'core-a';
    this.publicNs = config.public_ns || context.config?.web?.public_ns || 'a';
    this.publicRoot = path.resolve(
      config.public_root
      || process.env.ENKI_PUBLIC_ROOT
      || path.join('/opt/enki/public', this.publicNs)
    );

    // El publicador inyectado (tests, o un multi-core que quiera hablarle a su
    // propio core). Si no hay, se usa el bus.
    if (context.publicador && typeof context.publicador.publicar === 'function') {
      this.publicador = context.publicador;
    }
    this._escucharResultadoCrudo();

    // El panel vive en el repo (panel/) y se COPIA a la carpeta publica de cada
    // proyecto que ya exista. Idempotente: solo escribe lo que cambio, y si no
    // puede escribir no se lleva nada por delante (avisa).
    const instalados = await this._instalarPanelEnTodos();

    this.logger?.info?.('marketing-publicador.loaded', {
      module: this.name,
      version: this.version,
      core_id: this.coreId,
      public_root: this.publicRoot,
      paneles_instalados: instalados.length
    });
  }

  async onUnload() {
    this._dejarDeEscucharResultadoCrudo();
    this.estados.clear();
    this._ordenDeLlegada = [];
    await super.onUnload();
  }

  // ==========================================
  // 1 · GET /material/:proyecto
  // ==========================================

  async handleMaterial(req = {}) {
    try {
      const proyecto = this._proyectoDe(req);
      const malo = this._validarProyecto(proyecto);
      if (malo) return malo;

      const raiz = this._raizDe(proyecto);
      const existe = await this._esDirectorio(raiz);
      if (!existe) {
        return {
          status: 404,
          data: {
            error: {
              code: 'RESOURCE_NOT_FOUND',
              message: `el proyecto '${proyecto}' no tiene carpeta de material (${raiz})`
            },
            proyecto,
            raiz
          }
        };
      }

      const { material, total, bytes_total } = await this._listarMaterial(proyecto, raiz);
      this.metrics?.increment?.('marketing-publicador.material.served', { proyecto });

      return {
        status: 200,
        data: { proyecto, raiz, total, bytes_total, material }
      };
    } catch (err) {
      return this._httpDesdeError('marketing-publicador.material.failed', err, 'material');
    }
  }

  /**
   * Recorre la carpeta de material EN PROFUNDIDAD y devuelve CADA fichero.
   *
   * Sin lista blanca y sin tope: el unico limite es el del aparato. `tipo` es
   * una etiqueta para pintar, no un filtro — un .zip sale como 'otro' y el
   * panel lo ensena con su nombre.
   *
   * Los enlaces simbolicos no se siguen: un symlink dentro del material podria
   * sacar la lista del proyecto (y de ahi, /etc). Se ignoran en silencio porque
   * un material real no los necesita.
   */
  async _listarMaterial(proyecto, raiz) {
    const material = [];

    const recorrer = async (dir, rel) => {
      let entradas;
      try {
        entradas = await fsp.readdir(dir, { withFileTypes: true });
      } catch (err) {
        if (err.code === 'ENOENT' || err.code === 'EACCES') return;
        throw err;
      }
      for (const entrada of entradas) {
        const relHijo = rel ? `${rel}/${entrada.name}` : entrada.name;
        if (entrada.isDirectory()) {
          await recorrer(path.join(dir, entrada.name), relHijo);
          continue;
        }
        if (!entrada.isFile()) continue;
        const st = await fsp.stat(path.join(dir, entrada.name)).catch(() => null);
        if (!st) continue;
        const { tipo, mime } = this._tipoDe(entrada.name);
        material.push({
          nombre: relHijo,
          url: this._urlPublica(proyecto, relHijo),
          bytes: st.size,
          tipo,
          mime,
          modificado: new Date(st.mtimeMs).toISOString()
        });
      }
    };

    await recorrer(raiz, '');

    // Lo ultimo primero: el material recien generado es el que se va a publicar.
    material.sort((a, b) => (b.modificado.localeCompare(a.modificado)) || a.nombre.localeCompare(b.nombre));

    return {
      material,
      total: material.length,
      bytes_total: material.reduce((suma, f) => suma + f.bytes, 0)
    };
  }

  // ==========================================
  // 2 · POST /publicar
  // ==========================================

  async handlePublicar(req = {}) {
    try {
      const cuerpo = req.body || {};
      const proyecto = this._proyectoDe(req) || cuerpo.proyecto;
      const malo = this._validarProyecto(proyecto);
      if (malo) return malo;

      const destino = String(cuerpo.destino || '').trim();
      if (!DESTINOS.includes(destino)) {
        return this._errorHttp(
          400,
          'INVALID_INPUT',
          `destino '${destino || '(vacio)'}' no esta en el catalogo (${DESTINOS.join(', ')})`,
          { field: 'destino', destinos: DESTINOS }
        );
      }

      const fichero = String(cuerpo.fichero || '').trim();
      if (!fichero) {
        return this._errorHttp(400, 'INVALID_INPUT', 'falta el fichero a publicar', { field: 'fichero' });
      }

      // El fichero tiene que estar DENTRO de la carpeta de material del proyecto.
      let ruta;
      try {
        ruta = this._rutaDentroDelMaterial(proyecto, fichero);
      } catch (err) {
        return this._errorHttp(403, 'PERMISSION_DENIED', err.message, { field: 'fichero', fichero });
      }
      const st = await fsp.stat(ruta).catch(() => null);
      if (!st || !st.isFile()) {
        return this._errorHttp(404, 'RESOURCE_NOT_FOUND', `'${fichero}' no esta en el material de '${proyecto}'`, {
          field: 'fichero',
          fichero
        });
      }

      const id = this._nuevoId();
      // El texto va TAL CUAL. Vacio se manda vacio: el contrato del aparato
      // exige texto en 'publicar' y contestara 'campo_vacio'. Es su regla, no
      // una nuestra, y el panel la ensena con ese nombre en vez de inventarse
      // un minimo de caracteres.
      const orden = this._construirOrden({
        id,
        proyecto,
        fichero,
        texto: typeof cuerpo.texto === 'string' ? cuerpo.texto : '',
        destino
      });

      this._guardarEstado({
        id,
        proyecto,
        destino,
        fichero,
        estado: 'enviado',
        motivo: null,
        momento: new Date().toISOString(),
        detalle: null
      });

      try {
        await this._emitirOrden(orden);
      } catch (err) {
        const motivo = `no_se_pudo_emitir: ${err.message}`;
        this._guardarEstado({ ...this.estados.get(id), estado: 'fallo', motivo, momento: new Date().toISOString() });
        this.metrics?.increment?.('marketing-publicador.orden.failed', { proyecto });
        return {
          status: 502,
          data: {
            error: { code: 'UPSTREAM_UNAVAILABLE', message: motivo },
            id,
            estado: 'fallo',
            motivo
          }
        };
      }

      this.metrics?.increment?.('marketing-publicador.orden.emitida', { proyecto, destino });
      this.logger?.info?.('marketing-publicador.orden.emitida', {
        id, proyecto, destino, fichero, bytes: st.size
      });

      return {
        status: 200,
        data: {
          id,
          estado: 'enviado',
          destino,
          fichero,
          // La orden entera, tal como salio al bus: se puede auditar sin abrir logs.
          orden
        }
      };
    } catch (err) {
      return this._httpDesdeError('marketing-publicador.publicar.failed', err, 'publicar');
    }
  }

  /**
   * La orden, con el contrato del aparato (crate instagram-bridge).
   *
   * `id` y `simulacion:false` no son adornos: sin `id` la respuesta no se puede
   * emparejar con su orden; sin `simulacion:false` el aparato lo lee como
   * simulacion y no toca nada.
   *
   * `archivo` es la ruta RELATIVA dentro de media/ (el aparato la resuelve en su
   * copia); `media.url` es la direccion publica, que es lo que el aparato
   * descarga si no tiene el fichero.
   */
  _construirOrden({ id, proyecto, fichero, texto, destino }) {
    return {
      id,
      accion: ACCION,
      red: RED,
      destino,
      texto: texto === undefined || texto === null ? '' : String(texto),
      media: { url: this._urlPublica(proyecto, fichero) },
      archivo: fichero,
      proyecto,
      simulacion: false
    };
  }

  /**
   * Emite la orden al bus. EN CRUDO (ver la cabecera): el aparato lee el payload
   * como la orden, no como sobre del bus.
   */
  async _emitirOrden(orden) {
    if (this.publicador && typeof this.publicador.publicar === 'function') {
      return this.publicador.publicar(EVENTO_ORDEN, orden);
    }

    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || typeof mqtt.publish !== 'function') {
      const err = new Error('no hay bus mqtt: la orden no tiene por donde salir');
      err._code = 'UPSTREAM_UNAVAILABLE';
      throw err;
    }

    const topic = `core/${this.coreId}/events/${EVENTO_ORDEN}`;
    return mqtt.publish(topic, JSON.stringify(orden), { qos: 1 });
  }

  // ==========================================
  // 3 · GET /estado/:proyecto/:id
  // ==========================================

  async handleEstado(req = {}) {
    try {
      const proyecto = this._proyectoDe(req);
      const malo = this._validarProyecto(proyecto);
      if (malo) return malo;

      const id = String((req.params && req.params.id) || req.query?.id || '').trim();
      if (!id) return this._errorHttp(400, 'INVALID_INPUT', 'falta el id de la publicacion', { field: 'id' });

      const entrada = this.estados.get(id);
      if (!entrada) {
        return this._errorHttp(404, 'RESOURCE_NOT_FOUND', `no hay ninguna publicacion con id '${id}'`, { id });
      }
      // Una entrada de OTRO proyecto no existe para este: el panel de un
      // proyecto no asoma a lo que se publico desde otro.
      if (entrada.proyecto && entrada.proyecto !== proyecto) {
        return this._errorHttp(404, 'RESOURCE_NOT_FOUND', `no hay ninguna publicacion con id '${id}' en '${proyecto}'`, { id });
      }

      return {
        status: 200,
        data: {
          id: entrada.id,
          proyecto: entrada.proyecto,
          destino: entrada.destino,
          fichero: entrada.fichero,
          estado: entrada.estado,
          motivo: entrada.motivo,
          detalle: entrada.detalle,
          momento: entrada.momento,
          // Los estados posibles, para que el panel no los tenga que adivinar.
          estados: ESTADOS
        }
      };
    } catch (err) {
      return this._httpDesdeError('marketing-publicador.estado.failed', err, 'estado');
    }
  }

  // ==========================================
  // La vuelta: el resultado del aparato
  // ==========================================

  /**
   * Puerta 1: la suscripcion del manifest (si el resultado vieniera envuelto).
   */
  async onResultado(event) {
    const datos = event?.data || event?.payload || event || {};
    return this._aplicarResultado(datos);
  }

  /**
   * El resultado, en cualquiera de las dos formas (crudo o dentro de un sobre),
   * a un estado del panel.
   *
   * Reglas que no se negocian:
   *   - un `ok:true` con `simulacion:true` NO es una publicacion (nada salio del
   *     aparato): se lee como fallo, con el motivo que traiga;
   *   - el `motivo` viaja TAL CUAL. Traducirlo a 'error generico' borra la unica
   *     informacion que arregla el fallo;
   *   - un `publicado` no se degrada: publicar es irreversible, y un resultado
   *     posterior (un reintento ciego, un eco) no lo desmiente.
   */
  _mapearResultado(resultado, ahora = new Date().toISOString()) {
    if (!resultado || typeof resultado !== 'object') {
      return { estado: 'recibido', motivo: 'resultado_sin_cuerpo', detalle: null, momento: ahora };
    }

    const momento = resultado.momento || resultado.timestamp || ahora;
    const detalle = typeof resultado.detalle === 'string' ? resultado.detalle : null;

    // Un acuse no es una publicacion: el aparato dice que la tiene, nada mas.
    if (resultado.acuse === true || resultado.estado === 'recibido') {
      return { estado: 'recibido', motivo: resultado.motivo || null, detalle, momento };
    }

    if (resultado.ok === true) {
      if (resultado.simulacion === true) {
        // Contradiccion: dice que si pero nadie pidio ejecucion real. Manda lo
        // segundo, porque afirmar una publicacion que no ocurrio es el error caro.
        return { estado: 'fallo', motivo: resultado.motivo || 'simulacion', detalle, momento };
      }
      return { estado: 'publicado', motivo: null, detalle, momento };
    }

    if (resultado.ok === false) {
      return { estado: 'fallo', motivo: resultado.motivo || SIN_MOTIVO, detalle, momento };
    }

    // Sin `ok` no se puede afirmar nada ni negarlo: el aparato contesto, pero no
    // dijo si publico. Se queda en 'recibido' con el hueco nombrado.
    return { estado: 'recibido', motivo: resultado.motivo || 'resultado_sin_ok', detalle, momento };
  }

  _aplicarResultado(resultado) {
    const id = String(resultado?.id || resultado?.orden_id || '').trim();
    if (!id) {
      this.logger?.warn?.('marketing-publicador.resultado.sin_id', {
        motivo: resultado?.motivo || null
      });
      return null;
    }

    // El mismo resultado puede llegar por las dos puertas (crudo y sobre): se
    // aplica una vez.
    const firma = `${id}:${resultado.ok}:${resultado.motivo || ''}:${resultado.detalle || ''}`;
    if (firma === this._ultimaFirma) return this.estados.get(id) || null;
    this._ultimaFirma = firma;

    const previo = this.estados.get(id) || null;
    const mapeado = this._mapearResultado(resultado);

    if (previo && previo.estado === 'publicado' && mapeado.estado !== 'publicado') {
      this.logger?.warn?.('marketing-publicador.resultado.no_degrada_publicado', {
        id, estado_nuevo: mapeado.estado, motivo: mapeado.motivo
      });
      return previo;
    }

    const entrada = {
      id,
      proyecto: previo?.proyecto || resultado.proyecto || null,
      destino: previo?.destino || resultado.destino || null,
      fichero: previo?.fichero || resultado.archivo || null,
      estado: mapeado.estado,
      motivo: mapeado.motivo,
      detalle: mapeado.detalle,
      momento: mapeado.momento
    };
    this._guardarEstado(entrada);

    this.metrics?.increment?.('marketing-publicador.resultado', { estado: mapeado.estado });
    this.logger?.info?.('marketing-publicador.resultado', {
      id,
      estado: mapeado.estado,
      motivo: mapeado.motivo
    });

    return entrada;
  }

  _guardarEstado(entrada) {
    if (!entrada || !entrada.id) return null;
    if (!this.estados.has(entrada.id)) this._ordenDeLlegada.push(entrada.id);
    this.estados.set(entrada.id, { ...entrada });

    // Anillo: se tira lo mas viejo, pero NUNCA un 'publicado' (es el unico que
    // no se puede reconstruir: la publicacion ya ocurrio).
    while (this.estados.size > MAX_ESTADOS) {
      const viejo = this._ordenDeLlegada.find((id) => this.estados.get(id)?.estado !== 'publicado');
      if (!viejo) break;
      this.estados.delete(viejo);
      this._ordenDeLlegada = this._ordenDeLlegada.filter((id) => id !== viejo);
    }
    return this.estados.get(entrada.id);
  }

  /**
   * Puerta 2: el topic crudo del aparato.
   *
   * El bus de JS tira el resultado crudo al validar el sobre, asi que sin esta
   * puerta el panel se quedaria en 'enviado' para siempre. Se aceptan las dos
   * formas (cruda y envuelta) y manda el normalizador.
   */
  _escucharResultadoCrudo() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || typeof mqtt.on !== 'function') {
      this.logger?.warn?.('marketing-publicador.mqtt.sin_cliente', {
        nota: 'sin cliente mqtt: solo se enterara por la suscripcion del manifest'
      });
      return;
    }

    this._onMqttMessage = (topic, mensaje) => {
      try {
        if (!String(topic).endsWith(`/${EVENTO_RESULTADO}`)) return;
        const crudo = typeof mensaje === 'string'
          ? mensaje
          : (Buffer.isBuffer(mensaje) ? mensaje.toString('utf8') : null);
        let objeto = null;
        if (crudo !== null) {
          try { objeto = JSON.parse(crudo); } catch { return; }
        } else if (mensaje && typeof mensaje === 'object') {
          objeto = mensaje;
        }
        if (!objeto || typeof objeto !== 'object') return;
        // Sobre del bus -> su data; resultado crudo -> tal cual.
        const resultado = (objeto.data && typeof objeto.data === 'object' && !objeto.ok) ? objeto.data : objeto;
        this._aplicarResultado(resultado);
      } catch (err) {
        this.logger?.warn?.('marketing-publicador.resultado.ilegible', { error: err.message, topic });
      }
    };

    mqtt.on('message', this._onMqttMessage);
    if (typeof mqtt.subscribe === 'function') {
      mqtt.subscribe(`core/${this.coreId}/events/${EVENTO_RESULTADO}`)
        .then(() => { this._mqttSuscrito = true; })
        .catch((err) => this.logger?.warn?.('marketing-publicador.mqtt.subscribe_failed', { error: err.message }));
    }
  }

  _dejarDeEscucharResultadoCrudo() {
    const mqtt = this.eventBus?.mqtt;
    if (this._onMqttMessage && mqtt && typeof mqtt.removeListener === 'function') {
      mqtt.removeListener('message', this._onMqttMessage);
    }
    this._onMqttMessage = null;
    this._mqttSuscrito = false;
  }

  // ==========================================
  // El panel (HTML+CSS+JS a pelo, sin CDN)
  // ==========================================

  /**
   * GET /panel  y  GET /panel/
   *
   * El panel se sirve tambien desde aqui para poder trabajar sin esperar al
   * deploy. La direccion BUENA es /a/<proyecto>/publicador/ (el proyecto sale de
   * la ruta); servido desde el modulo la ruta no lleva proyecto y el panel lo
   * dice en vez de adivinar cual es.
   */
  async handlePanel(req = {}) {
    try {
      const proyecto = this._proyectoDe(req);
      return { status: 200, _html: await this._htmlPanel(proyecto) };
    } catch (err) {
      return this._httpDesdeError('marketing-publicador.panel.failed', err, 'panel');
    }
  }

  async handlePanelAsset(req = {}) {
    try {
      const fichero = String((req.params && req.params.fichero) || '').trim();
      if (!PANEL_FICHEROS.includes(fichero) || fichero === 'index.html') {
        return this._errorHttp(404, 'RESOURCE_NOT_FOUND', `'${fichero}' no es un fichero del panel`, { fichero });
      }
      const contenido = await fsp.readFile(path.join(__dirname, 'panel', fichero));
      return {
        status: 200,
        body: contenido,
        headers: {
          'Content-Type': fichero.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-cache'
        }
      };
    } catch (err) {
      return this._httpDesdeError('marketing-publicador.panel.asset.failed', err, 'panel_asset');
    }
  }

  /**
   * POST /panel/instalar/:proyecto
   *
   * Copia el panel a /<public>/<proyecto>/publicador/. Lo mismo que hace onLoad
   * para los proyectos que ya existen, pero a mano (un proyecto recien creado
   * no tiene por que esperar a un reinicio).
   */
  async handleInstalarPanel(req = {}) {
    try {
      const proyecto = this._proyectoDe(req);
      const malo = this._validarProyecto(proyecto);
      if (malo) return malo;
      const resultado = await this._instalarPanel(proyecto);
      if (!resultado.instalado) {
        return {
          status: 404,
          data: {
            error: { code: 'RESOURCE_NOT_FOUND', message: resultado.motivo },
            proyecto
          }
        };
      }
      return {
        status: 200,
        data: {
          proyecto,
          instalado: true,
          escritos: resultado.escritos,
          url: `/${this.publicNs}/${proyecto}/publicador/`
        }
      };
    } catch (err) {
      return this._httpDesdeError('marketing-publicador.panel.instalar.failed', err, 'instalar');
    }
  }

  async _instalarPanelEnTodos() {
    const instalados = [];
    let entradas;
    try {
      entradas = await fsp.readdir(this.publicRoot, { withFileTypes: true });
    } catch (err) {
      this.logger?.warn?.('marketing-publicador.panel.sin_raiz_publica', {
        raiz: this.publicRoot,
        error: err.message
      });
      return instalados;
    }
    for (const entrada of entradas) {
      if (!SLUG_RE.test(entrada.name)) continue;
      const r = await this._instalarPanel(entrada.name).catch(() => null);
      if (r?.instalado) instalados.push(entrada.name);
    }
    return instalados;
  }

  /**
   * Copia panel/index.html + app.js + estilo.css a <public>/<proyecto>/publicador/.
   * Idempotente: solo escribe lo que cambio (un deploy no reescribe el mundo).
   * Si el proyecto no tiene carpeta publica, NO se inventa: se dice por que no.
   */
  async _instalarPanel(proyecto) {
    const raizProyecto = path.join(this.publicRoot, proyecto);
    if (!(await this._esDirectorio(raizProyecto))) {
      return { instalado: false, motivo: `'${proyecto}' no tiene carpeta publica en ${this.publicRoot}` };
    }

    const destino = path.join(raizProyecto, 'publicador');
    await fsp.mkdir(destino, { recursive: true });
    // La carpeta de material, si aun no existe: el panel abre con la rejilla
    // vacia y su sitio dicho, en vez de con un 404 que parece un fallo.
    await fsp.mkdir(path.join(raizProyecto, 'media'), { recursive: true });

    const escritos = [];
    for (const fichero of PANEL_FICHEROS) {
      const origen = path.join(__dirname, 'panel', fichero);
      const contenido = await fsp.readFile(origen);
      const objetivo = path.join(destino, fichero);
      const actual = await fsp.readFile(objetivo).catch(() => null);
      if (actual && actual.equals(contenido)) continue;
      await fsp.writeFile(objetivo, contenido);
      escritos.push(fichero);
    }
    if (escritos.length > 0) {
      this.logger?.info?.('marketing-publicador.panel.instalado', { proyecto, escritos, destino });
    }
    return { instalado: true, escritos, destino };
  }

  async _htmlPanel(proyecto) {
    const html = await fsp.readFile(path.join(__dirname, 'panel', 'index.html'), 'utf8');
    // El panel se sirve desde el modulo sin proyecto en la ruta: se le dice cual
    // es SOLO si el llamante lo trae explicito. Si no, el propio panel avisa de
    // que hay que abrirlo desde /a/<proyecto>/publicador/.
    if (!proyecto) return html;
    return html.replace('__PROYECTO__', proyecto);
  }

  // ==========================================
  // Helpers
  // ==========================================

  /**
   * El shape que el gateway HTTP entiende: { status, data }.
   *
   * `_errorResponse` de BaseModule devuelve { status, error } (util para el
   * LLM), y el gateway solo manda `result.data` al cliente: con ese shape el
   * panel recibiria un 400 con el cuerpo vacio y sin mensaje que ensenar. Aqui
   * el error viaja DENTRO de data, que es lo que el navegador puede leer.
   */
  _errorHttp(status, code, message, extra = {}) {
    return { status, data: { error: { code, message }, ...extra } };
  }

  _httpDesdeError(logEvent, err, kind) {
    const { status, error } = this._handleHandlerError(logEvent, err, kind);
    return { status, data: { error } };
  }

  _proyectoDe(req = {}) {
    return String(
      (req.params && req.params.proyecto)
      || req.query?.proyecto
      || req.body?.proyecto
      || ''
    ).trim();
  }

  _validarProyecto(proyecto) {
    if (!proyecto) {
      return this._errorHttp(400, 'INVALID_INPUT', 'falta el proyecto (va en la ruta)', { field: 'proyecto' });
    }
    if (!SLUG_RE.test(proyecto)) {
      return this._errorHttp(400, 'INVALID_INPUT', `'${proyecto}' no es un nombre de proyecto valido`, {
        field: 'proyecto'
      });
    }
    return null;
  }

  _raizDe(proyecto) {
    return path.join(this.publicRoot || path.join('/opt/enki/public', this.publicNs), proyecto, 'media');
  }

  /** La direccion publica del fichero (namespace publico de Caddy: /a/<p>/media/...). */
  _urlPublica(proyecto, relativo) {
    const partes = String(relativo).split('/').map(encodeURIComponent).join('/');
    return `/${this.publicNs}/${encodeURIComponent(proyecto)}/media/${partes}`;
  }

  /**
   * Resuelve un nombre del material a una ruta REAL dentro de la carpeta.
   * `../../etc/passwd` no es material de nadie: se rechaza nombrando el intento.
   */
  _rutaDentroDelMaterial(proyecto, nombre) {
    const base = path.resolve(this._raizDe(proyecto));
    const candidata = path.resolve(base, nombre);
    if (candidata !== base && !candidata.startsWith(base + path.sep)) {
      throw new Error(`'${nombre}' se sale de la carpeta de material del proyecto`);
    }
    return candidata;
  }

  _tipoDe(nombre) {
    const ext = path.extname(nombre).toLowerCase();
    const [tipo, mime] = TIPOS[ext] || ['otro', 'application/octet-stream'];
    return { tipo, mime, ext };
  }

  _nuevoId() {
    return `pub-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  }

  async _esDirectorio(ruta) {
    try {
      const st = await fsp.stat(ruta);
      return st.isDirectory();
    } catch {
      return false;
    }
  }
}

module.exports = MarketingPublicadorModule;
// Catalogo y constantes, para quien tenga que hablarle al modulo sin adivinarlos.
module.exports.DESTINOS = DESTINOS;
module.exports.ESTADOS = ESTADOS;
module.exports.EVENTO_ORDEN = EVENTO_ORDEN;
module.exports.EVENTO_RESULTADO = EVENTO_RESULTADO;
