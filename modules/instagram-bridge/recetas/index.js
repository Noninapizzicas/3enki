'use strict';

/**
 * recetas — A4.4 · CatalogoDeRecetas · CUSTODIO (single-writer de su almacen).
 *
 * Esta pieza es el borde con el mundo: lee y escribe
 * `storage/instagram-bridge/catalogo-recetas.json`, el almacen GLOBAL del saber
 * hacer (P3: las recetas son comunes a todos los proyectos; el estado de cada
 * proyecto no entra aqui jamas). Toda la logica de dominio esta en `catalogo.js`,
 * que es puro; aqui solo hay IO, correlacion de eventos y el candado de escritura.
 *
 * Contrato real (module.json):
 *   instagram.receta.proponer.request           -> .response | .failed
 *   instagram.receta.publicar.request           -> .response | .failed   (RPC 12)
 *   instagram.receta.vigente.request            -> .response | .failed
 *   instagram.receta.antecesoras.request        -> .response | .failed
 *   instagram.receta.marcar_no_vigente.request  -> .response | .failed
 *   instagram.receta.restaurar.request          -> .response | .failed
 *
 * Reglas de esta capa (las mismas que el padron, porque es el mismo oficio):
 *   - **Single-writer.** Las mutaciones pasan por una cola de promesas: dos
 *     nacimientos simultaneos no pueden asignar el mismo numero de version.
 *   - **Escritura atomica.** Temporal + rename en el mismo directorio: un corte a
 *     mitad deja el catalogo anterior entero, no uno truncado.
 *   - **Nada se persiste sin auditar.** Antes de cada escritura se corre
 *     `catalogo.auditar()`: sello en cada entrada (P1), cero secretos (V1), forma
 *     valida de cada receta (A4.1) y UNA sola vigente por clave.
 *   - **Un fallo se publica como `.failed`**, no como una response con ok:false.
 *   - **Catalogo ilegible no se repara a ciegas.** Si el fichero no se puede leer
 *     o no es del esquema, el custodio NO lo sobrescribe: devuelve `sin_catalogo`.
 *     Reescribir un catalogo corrupto es perder el saber hacer de todos.
 */

const path = require('path');
const fsp = require('fs/promises');

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const catalogo = require('./catalogo');
const cambios = require('./cambios');

const TOPICS = Object.freeze({
  PROPONER: 'instagram.receta.proponer',
  PUBLICAR: 'instagram.receta.publicar',
  VIGENTE: 'instagram.receta.vigente',
  ANTECESORAS: 'instagram.receta.antecesoras',
  MARCAR_NO_VIGENTE: 'instagram.receta.marcar_no_vigente',
  RESTAURAR: 'instagram.receta.restaurar',
  // F3: la memoria de cambios de la interfaz. Vive en este modulo porque es el
  // mismo oficio (custodiar el saber hacer comun) y comparte directorio de
  // almacenes; el fichero y el candado son SUYOS (cambios.js).
  CAMBIO_REGISTRAR: 'instagram.cambio.registrar',
  CAMBIO_LISTAR: 'instagram.cambio.listar',
  CAMBIO_BUSCAR: 'instagram.cambio.buscar'
});

// `ENKI_INSTAGRAM_STORAGE` permite apuntar a otro sitio en pruebas o en una
// instalacion distinta; por defecto, el storage del repo.
const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');
const FICHERO = 'catalogo-recetas.json';

class CatalogoDeRecetas extends ModuloHibridoReflejo {
  /**
   * @param {{directorio?:string, fichero?:string}} [opts]
   */
  constructor(opts = {}) {
    super();
    this.name = 'catalogo-recetas';
    this.version = '0.1.0';

    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;
    this._fichero = opts.fichero || FICHERO;
    this._ruta = path.join(this._directorio, this._fichero);

    this._estado = catalogo.estado_vacio();
    this._cambios = new cambios.CustodioDeCambios({
      directorio: this._directorio,
      fichero: opts.fichero_cambios
    });
    this._cargado = false;
    this._ilegible = null;
    this._cola = Promise.resolve(); // candado de single-writer
    this._lecturas = 0;
    this._escrituras = 0;
  }

  // ---- ciclo de vida -------------------------------------------------------

  async onLoad(context) {
    await super.onLoad(context);
    await this.cargar();
    // La memoria de cambios es otro almacen: si esta rota, el catalogo sigue
    // sirviendo recetas (su custodio devolvera `sin_cambios` hasta que se mire).
    await this._cambios.cargar();
    this.logger?.info('catalogo-recetas.loaded', {
      module: this.name,
      ruta: this._ruta,
      recetas: this._estado.recetas.length,
      claves: new Set(this._estado.recetas.map((r) => r.clave)).size,
      revision: this._estado.revision,
      cambios_de_interfaz: this._cambios.foto().cambios.length
    });
  }

  async onUnload() {
    await this._cola; // no dejar una escritura a medias
    await this._cambios.cerrar();
    return super.onUnload();
  }

  /** Carga el catalogo. Si no existe, arranca vacio; si existe y no sirve, no lo toca. */
  async cargar() {
    try {
      const crudo = await fsp.readFile(this._ruta, 'utf8');
      const datos = JSON.parse(crudo);
      if (!catalogo.es_estado(datos)) {
        this._ilegible = 'esquema_desconocido';
        this._estado = catalogo.estado_vacio();
      } else {
        this._estado = datos;
        this._ilegible = null;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        this._estado = catalogo.estado_vacio();
        this._ilegible = null;
      } else {
        this._ilegible = err && err.code === 'EACCES' ? 'catalogo_sin_permiso' : 'catalogo_ilegible';
        this._estado = catalogo.estado_vacio();
      }
    }
    this._cargado = true;
    return { ok: this._ilegible === null, motivo: this._ilegible, estado: this._estado };
  }

  async recargar() {
    return this.cargar();
  }

  // ---- escritura -----------------------------------------------------------

  /** Escritura atomica: temporal + rename en el mismo directorio. */
  async _escribir(estado) {
    await fsp.mkdir(this._directorio, { recursive: true });
    const temporal = `${this._ruta}.${process.pid}.tmp`;
    const contenido = `${JSON.stringify(estado, null, 2)}\n`;
    await fsp.writeFile(temporal, contenido, 'utf8');
    await fsp.rename(temporal, this._ruta);
    this._escrituras += 1;
  }

  /**
   * Aplica una mutacion pura bajo el candado de escritura.
   *
   * @param {(estado:object) => object} mutacion devuelve la forma de catalogo.js
   */
  _mutar(mutacion) {
    const siguiente = this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: 'sin_catalogo', detalle: this._ilegible, ruta: this._ruta };
      }
      const r = mutacion(this._estado);
      if (!r || r.ok !== true) return r || { ok: false, motivo: 'entrada_invalida' };

      // Nada se persiste sin auditar: P1, V1, P3, forma (A4.1) y una vigente por clave.
      const auditoria = catalogo.auditar(r.estado);
      if (!auditoria.ok) {
        return {
          ok: false,
          motivo: 'almacen_no_auditado',
          problemas: auditoria.problemas,
          guardado: false
        };
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
    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  _leer(lectura) {
    const siguiente = this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: 'sin_catalogo', detalle: this._ilegible, ruta: this._ruta };
      }
      this._lecturas += 1;
      return lectura(this._estado);
    });
    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  // ---- operaciones de dominio ---------------------------------------------

  proponer(entrada) {
    return this._mutar((estado) => catalogo.proponer(estado, entrada));
  }

  publicar(entrada) {
    return this._mutar((estado) => catalogo.publicar(estado, entrada));
  }

  marcar_no_vigente(entrada) {
    return this._mutar((estado) => catalogo.marcar_no_vigente(estado, entrada));
  }

  restaurar(entrada) {
    return this._mutar((estado) => catalogo.restaurar(estado, entrada));
  }

  vigente(consulta) {
    return this._leer((estado) => catalogo.vigente(estado, consulta));
  }

  antecesoras(consulta) {
    return this._leer((estado) => catalogo.antecesoras(estado, consulta));
  }

  versiones(consulta) {
    return this._leer((estado) => catalogo.versiones(estado, consulta));
  }

  listar(filtro) {
    return this._leer((estado) => catalogo.listar(estado, filtro));
  }

  /** El estado en memoria (copia), para auditorias y pruebas. */
  foto() {
    return JSON.parse(JSON.stringify(this._estado));
  }

  // ---- handlers del bus ----------------------------------------------------

  onProponerRequest(e) {
    return this._rpc(TOPICS.PROPONER, e, (d) => this.proponer(d));
  }

  onPublicarRequest(e) {
    return this._rpc(TOPICS.PUBLICAR, e, (d) => this.publicar(d));
  }

  onVigenteRequest(e) {
    return this._rpc(TOPICS.VIGENTE, e, (d) => this.vigente(d));
  }

  onAntecesorasRequest(e) {
    return this._rpc(TOPICS.ANTECESORAS, e, (d) => this.antecesoras(d));
  }

  onMarcarNoVigenteRequest(e) {
    return this._rpc(TOPICS.MARCAR_NO_VIGENTE, e, (d) => this.marcar_no_vigente(d));
  }

  onRestaurarRequest(e) {
    return this._rpc(TOPICS.RESTAURAR, e, (d) => this.restaurar(d));
  }

  // ---- F3 · la memoria de cambios de la interfaz ---------------------------

  onCambioRegistrarRequest(e) {
    return this._rpc(TOPICS.CAMBIO_REGISTRAR, e, (d) => this._cambios.registrar(d));
  }

  onCambioListarRequest(e) {
    return this._rpc(TOPICS.CAMBIO_LISTAR, e, (d) => this._cambios.listar(d));
  }

  onCambioBuscarRequest(e) {
    return this._rpc(TOPICS.CAMBIO_BUSCAR, e, (d) => this._cambios.buscar(d));
  }

  /**
   * Atiende un RPC con su PAR DE FALLO. Un rechazo sale por `.failed` con su
   * motivo: nadie puede leer un fallo como un exito.
   */
  async _rpc(topic, event, fn) {
    const d = (event && event.data) || event || {};
    const request_id = d.request_id;
    let r;
    try {
      r = await fn(d);
    } catch (err) {
      this.logger?.error(`${this.name}.rpc.error`, { topic, error: err && err.message });
      r = { ok: false, motivo: 'error_interno', detalle: err && err.message };
    }

    if (r && r.ok === true) {
      const { ok, estado, ...datos } = r;
      const payload = Object.assign({ request_id, ok: true }, datos);
      this.eventBus?.publish(`${topic}.response`, payload);
      return payload;
    }

    const fallo = {
      request_id,
      ok: false,
      motivo: (r && r.motivo) || 'entrada_invalida',
      faltan: (r && r.faltan) || [],
      invalidos: (r && r.invalidos) || []
    };
    for (const campo of ['defectos', 'rutas', 'familias', 'problemas', 'detalle', 'pista', 'clave', 'version', 'receta', 'estado_receta', 'estado_recibido']) {
      if (r && r[campo] !== undefined) fallo[campo] = r[campo];
    }
    this.eventBus?.publish(`${topic}.failed`, fallo);
    return fallo;
  }
}

/** Factory: la forma comoda para tests y para el loader. */
function crear(opts = {}) {
  return new CatalogoDeRecetas(opts);
}

module.exports = {
  TOPICS,
  CatalogoDeRecetas,
  crear,
  catalogo,
  cambios
};

// Vista "clase" del plano (recetas/index.js#catalogo).
module.exports.Catalogo = Object.freeze({
  proponer: catalogo.proponer,
  publicar: catalogo.publicar,
  marcar_no_vigente: catalogo.marcar_no_vigente,
  restaurar: catalogo.restaurar,
  vigente: catalogo.vigente,
  antecesoras: catalogo.antecesoras,
  listar: catalogo.listar,
  auditar: catalogo.auditar
});
