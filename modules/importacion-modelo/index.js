/**
 * importacion-modelo — PUENTE del proyecto 3D (taller personal de impresion 3D).
 *
 * Importa modelos 3D desde repositorios externos (Printables, MakerWorld,
 * Cults3D, Thingiverse) o desde un diseno propio del dueno. El dueno elige o
 * busca en todos a la vez (delega la busqueda a busqueda-repositorios por el
 * puerto 'buscar(query) -> [resultados]'). La importacion descarga el modelo y
 * lo registra en el catalogo (catalogo-modelos).
 *
 * Es PUENTE: sin store, escucha y delega. No persiste estado (sin
 * PosPersistencia, sin project.activated). El input puede ser .3mf o .stl; el
 * slicer necesita .3mf, asi que si el origen es .stl se avisa que falta el
 * .3mf (no se inventa, invariante 5).
 *
 * Flujo A del plan: dueno busca -> busqueda-repositorios.buscar -> dueno elige
 * -> importacion-modelo.importar -> adaptador-slicing.leer_3mf ->
 * catalogo-modelos.registrar -> catalogo.modelo_registrado.
 *
 * Proyecciones:
 *   _importar(url)  — descarga (puerto 9), lee el .3mf, registra en el catalogo.
 *   _buscar(query)  — delega la busqueda a busqueda-repositorios (puerto 7.1).
 *
 * Par de fallo: importacion.importar.failed (todo flujo cierra su circulo).
 * Ver plan-construccion.md seccion 6.7.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class ImportacionModeloReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'importacion-modelo';
    this.version = 'reflejo-0.1.0';
    this._descargador = null;   // puerto inyectado: { descargar(url) -> Promise<{archivo, formato}> }
  }

  // El puente thin del PC (o un adaptador HTTP) cablea el descargador concreto.
  registrarDescargador(descargador) {
    if (descargador && typeof descargador.descargar === 'function') this._descargador = descargador;
  }

  onImportarRequest(e) {
    return this._atender(e, 'importar', 'importacion.importar.response', d => this._importar(d));
  }

  // 7.1 — delega la busqueda a busqueda-repositorios (el dueno busca en todos a la vez).
  async _buscar(input) {
    const query = (input && input.query) || null;
    const pid = (input && input.project_id) || null;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'query requerido (no vacio)' } };
    }

    const resp = await this._rpc('busqueda.buscar.request', {
      project_id: pid, query: query.trim(), correlation_id: input.correlation_id
    });

    if (!resp || resp.status !== 200) {
      return { status: 502, data: { error: 'BUSQUEDA_FALLO', message: 'busqueda-repositorios no respondio' } };
    }

    return { status: 200, data: { resultados: resp.data.resultados || [], total: (resp.data.resultados || []).length } };
  }

  // 7.2 — importa un modelo: descarga, lee el .3mf y lo registra en el catalogo.
  async _importar(input) {
    const url = (input && input.url) || null;
    const pid = (input && input.project_id) || null;
    const nombre = (input && input.nombre) || null;
    const origen = (input && input.origen) || 'desconocido';
    const categoria = (input && input.categoria) || 'sin_categoria';

    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      this._publicarEvento('importacion.importar.failed', {
        project_id: pid, motivo: 'url_requerida'
      });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'url requerida (no vacia)' } };
    }
    if (!pid) {
      this._publicarEvento('importacion.importar.failed', {
        project_id: pid, url: url.trim(), motivo: 'project_id_requerido'
      });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };
    }

    // 1) Descargar el modelo (puerto 9). Si no hay descargador cableado, falla.
    let archivo = null;
    let formato = null;
    if (this._descargador) {
      try {
        const res = await this._descargador.descargar(url.trim());
        archivo = (res && res.archivo) || null;
        formato = (res && res.formato) || null;
      } catch (err) {
        this._publicarEvento('importacion.importar.failed', {
          project_id: pid, url: url.trim(), origen, motivo: 'descarga_fallida', error: err.message
        });
        return { status: 502, data: { error: 'DESCARGA_FALLIDA', message: err.message } };
      }
    } else {
      this._publicarEvento('importacion.importar.failed', {
        project_id: pid, url: url.trim(), origen, motivo: 'descargador_no_configurado'
      });
      return { status: 503, data: { error: 'DESCARGADOR_NO_CONFIGURADO', message: 'no hay descargador cableado (puente thin del PC del dueno)' } };
    }

    if (!archivo || typeof archivo !== 'string' || archivo.trim().length === 0) {
      this._publicarEvento('importacion.importar.failed', {
        project_id: pid, url: url.trim(), origen, motivo: 'archivo_vacio'
      });
      return { status: 502, data: { error: 'ARCHIVO_VACIO', message: 'la descarga no devolvio archivo' } };
    }

    // 2) El slicer necesita .3mf. Si el origen es .stl, avisamos que falta el .3mf
    //    (no se inventa, invariante 5). El .3mf se lee via adaptador-slicing.leer_3mf.
    const formatoReal = (formato || this._detectarFormato(archivo)).toLowerCase();
    if (formatoReal === 'stl') {
      this._publicarEvento('importacion.importar.failed', {
        project_id: pid, url: url.trim(), origen, archivo: archivo.trim(), motivo: 'falta_3mf'
      });
      return { status: 422, data: { error: 'FALTA_3MF', message: 'el slicer necesita .3mf; el origen es .stl' } };
    }

    // 3) Leer metadatos del .3mf (conversor 10.2) via adaptador-slicing.
    let metadatos = null;
    const leerResp = await this._rpc('adaptador-slicing.leer_3mf.request', {
      project_id: pid, archivo: archivo.trim(), correlation_id: input.correlation_id
    });
    if (leerResp && leerResp.status === 200) metadatos = leerResp.data.metadatos || null;

    // 4) Registrar en el catalogo (catalogo-modelos.registrar).
    const regResp = await this._rpc('catalogo.registrar.request', {
      project_id: pid,
      nombre: nombre || (metadatos && metadatos.nombre) || 'desconocido',
      categoria,
      archivo3mf: archivo.trim(),
      origen,
      metadatos,
      correlation_id: input.correlation_id
    });

    if (!regResp || regResp.status !== 201) {
      this._publicarEvento('importacion.importar.failed', {
        project_id: pid, url: url.trim(), origen, archivo: archivo.trim(),
        motivo: 'registro_fallido', error: (regResp && regResp.data && regResp.data.message) || 'catalogo no respondio'
      });
      return { status: 502, data: { error: 'REGISTRO_FALLIDO', message: 'no se pudo registrar el modelo en el catalogo' } };
    }

    const modelo = regResp.data.modelo;
    this._publicarEvento('importacion.importada', {
      project_id: pid, modelo_id: modelo.id, nombre: modelo.nombre,
      origen, archivo3mf: modelo.archivo3mf, correlation_id: input.correlation_id, timestamp: nowISO()
    });

    return { status: 201, data: { modelo, importada: true } };
  }

  // Detecta el formato por extension del archivo descargado (.3mf / .stl).
  _detectarFormato(archivo) {
    const ext = (archivo || '').split('.').pop().toLowerCase();
    if (ext === 'stl') return 'stl';
    if (ext === '3mf') return '3mf';
    return 'desconocido';
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, { ...data, timestamp: nowISO() });
  }
}

module.exports = ImportacionModeloReflejo;
