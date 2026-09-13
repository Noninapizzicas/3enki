/**
 * importacion — CONVERSOR del taller 3D (pieza 5). Frontera de formato de la moneda real.
 *
 * Importa modelos externos multi-formato (STL/3MF/GCODE) y lee sus metadatos vía un
 * lector por formato. El puerto LectorArchivo es ABIERTO: LectorSTL/Lector3MF/LectorGCODE
 * se inyectan en despliegue (para el .3mf se puede reutilizar adaptador-slicing.leer_3mf).
 *
 * Distingue el GCODE ya preparado de un STL/3MF fuente (plan 6.5):
 *   - GCODE preparado -> va a la cúpula (cupula-gcode) como ArchivoPreparado ya listo
 *   - STL/3MF fuente   -> va al catálogo (catalogo) como ficha de modelo
 *
 * Es CONVERSOR stateless: sin store, sin project.activated, sin PosPersistencia.
 * Registra en catalogo por RPC catalogo.registrar / catalogo.actualizar (depende de catalogo).
 *
 * CERO juicio: no decide qué pieza imprimir (eso vive en el dueño); solo normaliza la
 * entrada del formato al sistema y la entrega. La aprobación sigue siendo decisión humana.
 *
 * v0.1.0: FASE 4 TANDA 2.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const FORMATOS = Object.freeze(['STL', '3MF', 'GCODE']);
const EXT_POR_FORMATO = Object.freeze({ STL: ['.stl'], '3MF': ['.3mf', '.3MF'], GCODE: ['.gcode', '.g', '.gco'] });
const FUENTE_POR_EXT = Object.freeze({
  '.stl': 'ARCHIVO', '.3mf': 'ARCHIVO', '.3MF': 'ARCHIVO',
  '.gcode': 'REPOSITORIO', '.g': 'REPOSITORIO', '.gco': 'REPOSITORIO'
});

function extDe(archivo) {
  if (!archivo || typeof archivo !== 'string') return '';
  const u = archivo.toLowerCase();
  for (const ext of ['.stl', '.3mf', '.gcode', '.gco', '.g']) if (u.endsWith(ext)) return ext;
  const m = u.match(/\.(\w{2,4})$/);
  return m ? `.${m[1].toLowerCase()}` : '';
}

function formatoDe(archivo) {
  const ext = extDe(archivo);
  if (ext === '.stl') return 'STL';
  if (ext === '.3mf') return '3MF';
  if (ext === '.gcode' || ext === '.g' || ext === '.gco') return 'GCODE';
  return 'DESCONOCIDO';
}

class ImportacionReflejo extends ModuloHibridoReflejo {
  constructor(opts) {
    super();
    this.name = 'importacion';
    this.version = 'reflejo-0.1.0';
    // Puerto LectorArchivo ABIERTO: { 'STL'|'3MF'|'GCODE': async ({ archivo }) => metadatos }
    this._lectores = new Map();
    if (opts?.lectores) {
      for (const [f, fn] of Object.entries(opts.lectores)) {
        if (FORMATOS.includes(f) && typeof fn === 'function') this._lectores.set(f, fn);
      }
    }
  }

  // Puerto inyectable: registrarLector('STL', async ({ archivo }) => ({ ... }))
  registrarLector(formato, fn) {
    if (FORMATOS.includes(formato) && typeof fn === 'function') this._lectores.set(formato, fn);
  }

  onImportarRequest(e)      { return this._atender(e, 'importar', 'importacion.importar.response', d => this._importar(d)); }
  onLeerMetadatosRequest(e) { return this._atender(e, 'leer_metadatos', 'importacion.leer_metadatos.response', d => this._leerMetadatos(d)); }

  // ── PROYECCIONES (dominio) ──

  // _importar: entrada de los 3 formatos. Lee metadatos → distingue GCODE (cúpula) de
  // STL/3MF (catálogo). Emite par de fallo al no poder importar. NO decide qué imprimir.
  async _importar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const archivo = input.archivo || input.ruta;
    if (!archivo) return this._invalid('archivo');
    const formato = input.formato ? String(input.formato).toUpperCase() : formatoDe(archivo);
    if (formato === 'DESCONOCIDO' || !FORMATOS.includes(formato)) {
      this._failed(input, 'formato_no_soportado', `formato no soportado: ${archivo}`);
      return this._errorResponse(422, 'FORMATO_NO_SOPORTADO', `no se reconoce formato del archivo: ${archivo}`, { archivo });
    }

    const metadatos = await this._leerMetadatos({ project_id: input.project_id, archivo, formato });
    if (metadatos.status !== 200) return metadatos;

    const meta = metadatos.data.metadatos;
    const base = {
      project_id: input.project_id,
      nombre: meta.nombre || 'desconocido',
      origenUrl: meta.origenUrl || null,
      fuente: meta.fuente || 'ARCHIVO'
    };

    try {
      if (formato === 'GCODE') {
        // GCODE preparado → cúpula directo (ArchivoPreparado ya listo), NO duplica catálogo.
        const cupula = await this._rpc('cupula-gcode.registrar.request', {
          project_id: input.project_id,
          modelo_id: input.modelo_id || null,
          formato, archivo, perfil: meta.perfil || 'desconocido',
          gramos_est: meta.gramos_est ?? null, tiempo_est: meta.tiempo_est ?? null,
          listo: true,
          correlation_id: input.correlation_id
        }, { timeout_ms: 12000 });
        if (!cupula || cupula.status >= 400) {
          this._failed(input, 'cupula_registro_fallo', cupula?.error?.message || 'cupula-gcode no respondió');
          return this._errorResponse(502, 'CUPULA_FALLO', cupula?.error?.message || 'no se pudo registrar en cupula-gcode');
        }
        return { status: 201, data: { destino: 'cupula', archivo, formato, archivo_id: cupula.data.archivo_id } };
      }

      // STL/3MF fuente → catálogo por RPC (depende de catalogo). Reconcilia en catalogo.
      const registro = await this._rpc('catalogo.registrar.request', {
        project_id: input.project_id,
        nombre: meta.nombre || 'desconocido',
        uso: input.uso ? String(input.uso) : (meta.uso || null),
        filamento_sug: meta.material && meta.material !== 'desconocido' ? meta.material : (input.filamento_sug || 'PETG'),
        fuente: meta.fuente || (input.fuente || 'ARCHIVO'),
        origenUrl: meta.origenUrl || input.origenUrl || null,
        [`archivo_${formato.toLowerCase()}`]: archivo,
        correlation_id: input.correlation_id
      }, { timeout_ms: 12000 });
      if (!registro || registro.status >= 400) {
        this._failed(input, 'catalogo_registro_fallo', registro?.error?.message || 'catalogo no respondió');
        return this._errorResponse(502, 'CATALOGO_FALLO', registro?.error?.message || 'no se pudo registrar en catalogo');
      }
      return { status: 201, data: { destino: 'catalogo', archivo, formato, modelo: registro.data.modelo, reconciliado: registro.data.reconciliado } };
    } catch (err) {
      this._failed(input, 'rpc_fallo', err.message);
      return this._errorResponse(500, 'RPC_FALLO', err.message);
    }
  }

  // _leerMetadatos: nombre/unidades/material sug/formatos por lector del formato (puerto
  // ABIERTO). Huecos → 'desconocido'/null (nunca se inventan). Para .3mf, si no hay lector
  // propio, delega en adaptador-slicing.leer_3mf.
  async _leerMetadatos(input) {
    if (!input.archivo) return this._invalid('archivo');
    const formato = input.formato ? String(input.formato).toUpperCase() : formatoDe(input.archivo);
    if (formato !== 'DESCONOCIDO' && !FORMATOS.includes(formato)) {
      return this._errorResponse(422, 'FORMATO_NO_SOPORTADO', `formato no soportado: ${input.archivo}`, { archivo: input.archivo });
    }

    let meta = null;
    const lector = this._lectores.get(formato);
    if (lector) {
      try { meta = await lector({ archivo: input.archivo }); }
      catch (_) { meta = null; }
    } else if (formato === '3MF') {
      // Reuso de adaptador-slicing.leer_3mf como lector del .3mf (reutilizado, no pieza).
      const resp = await this._rpc('adaptador-slicing.leer_3mf.request',
        { project_id: input.project_id, archivo: input.archivo }, { timeout_ms: 12000 });
      if (resp && resp.status === 200 && resp.data && resp.data.metadatos) meta = resp.data.metadatos;
    }

    const m = meta && typeof meta === 'object' ? meta : {};
    const nombre = m.nombre && m.nombre !== 'desconocido' ? String(m.nombre) : (this._nombreDe(input.archivo));
    const metadatos = {
      nombre,
      unidades: m.unidades || m.unidad || null,                 // p.ej. 'mm'
      material: m.material && m.material !== 'desconocido' ? String(m.material) : null,
      autor: m.autor || null,
      licencia: m.licencia || null,
      dimensiones: m.dimensiones || m.medidas || null,
      origenUrl: m.origenUrl || null,
      fuente: m.fuente || 'ARCHIVO',
      perfil: m.perfil || null,
      gramos_est: m.gramos_est ?? null,
      tiempo_est: m.tiempo_est ?? null,
      formatos: [formato === 'DESCONOCIDO' ? undefined : formato].filter(Boolean)
    };
    return { status: 200, data: { archivo: input.archivo, formato, metadatos } };
  }

  // helpers internos (lógica de negocio DENTRO del módulo)
  _nombreDe(archivo) {
    const base = String(archivo).split('/').pop();
    const ext = extDe(base);
    const nombre = ext ? base.slice(0, -ext.length) : base;
    return nombre.trim() ? nombre : 'desconocido';
  }

  _failed(input, motivo, mensaje) {
    const ev = {
      project_id: input.project_id, archivo: input.archivo || input.ruta,
      formato: (input.formato || '').toUpperCase() || undefined, motivo, error: mensaje || undefined,
      correlation_id: input.correlation_id, timestamp: new Date().toISOString()
    };
    Object.keys(ev).forEach(k => ev[k] === undefined && delete ev[k]);
    this._publicar('importacion.importar.failed', ev);
  }

  _publicar(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = ImportacionReflejo;
