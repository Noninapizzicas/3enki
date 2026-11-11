/**
 * pantalla-tv — LA PANTALLA DE CALLE, GENÉRICA.
 *
 * Una pantalla que NO sabe de pizzas. Recibe PIEZAS ya hechas y las coloca. Lo
 * específico de cada proyecto vive en su cableado (storage/pantalla-tv/cableado.json);
 * lo específico de cada dato vive en su bloque (fuentes/*.js).
 *
 *   BLOQUE = dueño de una fuente y de una forma  (carta, servicio, marca, porciones, promos)
 *   PIEZA  = átomo neutro que cruza la frontera  (lo único que la pantalla entiende)
 *   ZONA   = geometría A..F                       (no sabe qué hay dentro)
 *
 * Este módulo es el TIMBRE, no el fabricante: escucha lo que ya emite el sistema y
 * vuelve a montar la pantalla. No barre ficheros ni adivina por fecha de
 * modificación — si el dato cambia, alguien lo dice por el bus.
 *
 * LEER   tarifas (qué carta está en servicio) → carta → marca → contenido → servicio
 *        → porciones → promos, todo por fs reflejo y con el project_id del evento.
 * PENSAR construir.js (PURO): cableado + datos → piezas. No toca disco.
 * GUARDAR /www/<destino>/index.html + bloques.json (sellado con huella y versión).
 * EMITIR  pantalla-tv.publicada
 *
 * Regla de honestidad: si la carta en servicio está en BORRADOR, no se publica
 * nada y la pantalla se queda con la última buena. Precios viejos, nunca.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const ResolutorProyecto = require('../_shared/resolutor-proyecto');
const { construir, hoyEn } = require('./construir');
const { proyectarCartaPublica, normalizarTelefono } = require('../pizzepos/carta-digital/proyeccion');

const REBOTE_MS = 4000;              // una edición de carta emite N eventos; se hornea una vez
const PLANTILLA = path.join(__dirname, 'render', 'pantalla.html');
const DESTINO_POR_DEFECTO = '/www/escaparate';

class PantallaTvReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'pantalla-tv';
    this.version = '0.1.0';
    this._temporizadores = new Map();   // project_id → timeout del rebote
    this._plantilla = null;
    this._resolutor = null;
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._resolutor = new ResolutorProyecto({ eventBus: this.eventBus, logger: this.logger, metrics: this.metrics });
  }

  // ── el timbre: lo que ya dice el sistema ────────────────────────────────
  onCartaCambiada(e) { this._programar(e, 'carta'); }
  onContenidoCambiado(e) { this._programar(e, 'contenido'); }
  onMarcaCambiada(e) { this._programar(e, 'marca'); }
  onServicioCambiado(e) {
    // `servicio.cambiado` viaja con SLUG (no con UUID): se resuelve por su dueño
    // (project-manager) antes de programar. Sin respuesta se cae al slug, y el
    // bus admite las dos llaves.
    const d = (e && e.data) || e || {};
    const llave = d.project_id || d.project_slug;
    if (!llave) return;
    if (d.project_id) return this._programar(e, 'servicio');
    if (!this._resolutor) return this._programar({ project_id: llave }, 'servicio');
    this._resolutor.idDe(llave)
      .then(id => this._programar({ project_id: id || llave }, 'servicio'))
      .catch(() => this._programar({ project_id: llave }, 'servicio'));
  }
  onPorcionesCambiadas(e) { this._programar(e, 'porciones'); }
  onPromosCambiadas(e) { this._programar(e, 'promos'); }
  onRepublicada(e) { this._programar(e, 'cartadigital.publicado'); }

  // ── la puerta manual (verificar, forzar, recuperar tras un reinicio) ────
  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'pantalla-tv.construir.response', d => this._construir(d, 'peticion'));
  }

  _programar(evento, motivo) {
    const d = (evento && evento.data) || evento || {};
    const project_id = d.project_id;
    if (!project_id) return;
    const previo = this._temporizadores.get(project_id);
    if (previo) clearTimeout(previo);
    const t = setTimeout(() => {
      this._temporizadores.delete(project_id);
      this._construir({ project_id }, motivo).catch(err => {
        this.logger?.warn('pantalla-tv.fallida', { project_id, motivo, error: err.message });
      });
    }, REBOTE_MS);
    if (t.unref) t.unref();
    this._temporizadores.set(project_id, t);
  }

  // ── LEER ────────────────────────────────────────────────────────────────
  async _leer(project_id, ruta) { return this._leerJson(project_id, ruta); }

  /** Huellas de las imágenes locales (best-effort): identidad del fichero, no del nombre. */
  async _huellas(project_id, urls) {
    const huellas = {};
    const locales = [...new Set((urls || [])
      .filter(u => u && !/^(https?:)?\/\//i.test(u) && !String(u).startsWith('data:'))
      .map(u => String(u).split('/').pop().split('?')[0]))].slice(0, 24);
    const crypto = require('crypto');
    for (const base of locales) {
      const r = await this._rpc('fs.read.request', { project_id, path: `pizzepos/contenido/imagenes/${base}`, encoding: 'base64' }, { timeout_ms: 4000 });
      if (r && r.content) huellas[base] = crypto.createHash('sha256').update(r.content).digest('hex').slice(0, 16);
    }
    return huellas;
  }

  // ── el trabajo ──────────────────────────────────────────────────────────
  async _construir(input, motivo) {
    const project_id = input.project_id;
    if (!project_id) return this._invalid('project_id');

    const cableado = await this._leer(project_id, 'pantalla-tv/cableado.json');
    if (!cableado) {
      // Un proyecto sin cableado NO tiene pantalla: no es un error, es una decisión.
      return { status: 404, code: 'SIN_CABLEADO', data: { project_id, cableado: 'pantalla-tv/cableado.json' } };
    }

    const tarifas = (await this._leer(project_id, 'pizzepos/tarifas.json')) || {};
    const carta_id = tarifas.general;
    if (!carta_id) return this._errorResponse(409, 'SIN_CARTA_EN_SERVICIO', 'tarifas.json no dice qué carta está en servicio', { project_id });

    const carta = await this._leer(project_id, `pizzepos/cartas/${carta_id}.json`);
    if (!carta) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `no existe la carta en servicio ${carta_id}`, { project_id, carta_id });
    if (carta.meta && carta.meta.estado && carta.meta.estado !== 'en_servicio') {
      return this._errorResponse(409, 'CARTA_NO_EN_SERVICIO', `la carta ${carta_id} está en "${carta.meta.estado}": no se publica`, { project_id, carta_id, estado: carta.meta.estado });
    }

    const [marca, contenidoRaw, servicio, porciones, promos] = await Promise.all([
      this._leer(project_id, 'pizzepos/marca.json'),
      this._leer(project_id, 'pizzepos/contenido.json'),
      this._leer(project_id, 'pizzepos/servicio/config.json'),
      this._leer(project_id, 'pizzepos/porciones.json'),
      this._leer(project_id, 'pizzepos/promos.json')
    ]);

    const contenido = (contenidoRaw && contenidoRaw.productos) || contenidoRaw || {};
    const telefono = (marca && marca.negocio && marca.negocio.local && marca.negocio.local.telefono) || null;

    const urlsImagen = Object.values(contenido).map(v => (v && (v.imagen || (Array.isArray(v.imagenes) && v.imagenes[0]))) || null).filter(Boolean);
    const huellas = await this._huellas(project_id, urlsImagen);

    let resultado;
    try {
      resultado = construir({
        cableado, proyectar: proyectarCartaPublica, hoy: hoyEn(servicio && servicio.zona_horaria),
        datos: {
          project_id, carta_id, carta, tarifas, marca,
          contenido, servicio: servicio || {},
          porciones: porciones || null, promos: promos || null,
          huellas,
          whatsapp_url: telefono ? `https://wa.me/${normalizarTelefono(telefono)}` : null
        }
      });
    } catch (err) {
      this.logger?.warn('pantalla-tv.no-construye', { project_id, motivo, error: err.message });
      this.metrics?.increment?.('pantalla-tv.no-construye', { motivo: String(motivo || '') });
      return this._errorResponse(409, 'NO_CONSTRUYE', err.message, { project_id, motivo });
    }

    // ── GUARDAR ──────────────────────────────────────────────────────────
    const destino = cableado.destino || DESTINO_POR_DEFECTO;
    if (!this._plantilla) this._plantilla = fs.readFileSync(PLANTILLA, 'utf-8');
    const html = this._plantilla;
    const json = JSON.stringify(resultado.salida, null, 2);

    const w1 = await this._rpc('fs.write.request', { project_id, path: `${destino}/bloques.json`, content: json, encoding: 'utf-8', atomic: true });
    const w2 = await this._rpc('fs.write.request', { project_id, path: `${destino}/index.html`, content: html, encoding: 'utf-8', atomic: true });
    for (const [nombre, w] of [['bloques.json', w1], ['index.html', w2]]) {
      if (!w || (w.status && w.status >= 400)) {
        return this._errorResponse(502, 'UPSTREAM_WRITE_FAILED', `no se pudo escribir ${nombre}`, { project_id, destino });
      }
    }

    // ── EMITIR ───────────────────────────────────────────────────────────
    const resumen = {
      project_id, destino, motivo,
      carta: resultado.salida.sello.carta,
      huella: resultado.salida.sello.huella,
      piezas: resultado.salida.piezas.length,
      faltan: resultado.informe.filter(i => i.estado === 'sin fuente').map(i => i.bloque)
    };
    this.eventBus.publish('pantalla-tv.publicada', { ...resumen, timestamp: new Date().toISOString() });
    this.metrics?.increment?.('pantalla-tv.publicada', { motivo: String(motivo || '') });
    this.logger?.info('pantalla-tv.publicada', resumen);
    return { status: 200, data: { ...resumen, informe: resultado.informe } };
  }
}

module.exports = PantallaTvReflejo;
