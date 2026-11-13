'use strict';

/**
 * cuentas — B1 · PadronDeCuentas y E1 · FichaDeCuenta · CUSTODIOS.
 *
 * Esta pieza es el borde con el mundo: lee y escribe
 * `storage/instagram-bridge/{padron.json,fichas.json}` (el padron es global: el
 * indice de duenos es comun a todos los proyectos, porque una cuenta pertenece a
 * un proyecto y hay que poder preguntarlo desde cualquiera; las fichas NO: cada
 * una es de un proyecto). La logica de dominio esta en `padron.js` y `ficha.js`,
 * que son puros; aqui solo hay IO, correlacion de eventos y el candado de
 * escritura. La ficha vive en `ficha.js` con su propio candado, porque es otro
 * almacen y otra pieza del plano: este fichero solo la hospeda en el mismo modulo.
 *
 * Contrato real (module.json):
 *   instagram.cuenta.padron.alta.request      -> .response | .failed
 *   instagram.cuenta.padron.baja.request      -> .response | .failed
 *   instagram.cuenta.padron.traspaso.request  -> .response | .failed
 *   instagram.cuenta.padron.consultar.request -> .response | .failed
 *   instagram.cuenta.padron.listar.request    -> .response | .failed
 *   instagram.ficha.leer.request              -> .response | .failed
 *   instagram.ficha.declarar.request          -> .response | .failed
 *   instagram.ficha.actualizar.request        -> .response | .failed
 *   instagram.ficha.admitir.request           -> .response | .failed
 *
 * Reglas de esta capa:
 *   - **Single-writer.** Las mutaciones pasan por una cola de promesas: dos altas
 *     simultaneas no pueden leer el mismo estado y pisarse. (Para dos instancias
 *     del cerebro en maquinas distintas esta `contabilidad-libro/single-writer`,
 *     que no es de este bloque.)
 *   - **Escritura atomica.** Se escribe a un temporal y se renombra: un corte a
 *     mitad de escritura no deja un padron truncado, deja el anterior.
 *   - **Nada se persiste sin auditar.** Antes de cada escritura se corre
 *     `padron.auditar()`: sello en cada asiento (P1) y cero secretos (V1). Si el
 *     almacen no pasa, no se escribe y se devuelve el fallo con sus rutas.
 *   - **Un fallo se publica como `.failed`**, no como una response con ok:false:
 *     el plano exige el par en todo contrato RPC.
 *   - **Padron ilegible no se repara a ciegas.** Si el fichero no se puede leer
 *     o no es del esquema, el custodio NO lo sobrescribe: devuelve `sin_padron` y
 *     espera. Reescribir un padron corrupto es perder el unico mapa de duenos.
 */

const path = require('path');
const fsp = require('fs/promises');

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const padron = require('./padron');
const ficha = require('./ficha');
const alta = require('./alta');
const baja = require('./baja');

const TOPICS = Object.freeze({
  ALTA: 'instagram.cuenta.padron.alta',
  BAJA: 'instagram.cuenta.padron.baja',
  TRASPASO: 'instagram.cuenta.padron.traspaso',
  CONSULTAR: 'instagram.cuenta.padron.consultar',
  LISTAR: 'instagram.cuenta.padron.listar',
  // B2 · la ceremonia de alta (bloque 15). Es un BORDE: no inscribe ni declara
  // nada por su cuenta, se lo pide a B1/E1/A4.4/Q3/A4.3 y espera el testigo.
  ALTA_INICIAR: 'instagram.cuenta.alta.iniciar',
  ALTA_SESION: 'instagram.cuenta.alta.sesion',
  ALTA_CONTINUAR: 'instagram.cuenta.alta.continuar',
  ALTA_CONSULTAR: 'instagram.cuenta.alta.consultar',
  ALTA_ABORTAR: 'instagram.cuenta.alta.abortar',
  // B4 · la baja y el traspaso (bloque 15). La pluma sigue siendo la del padron.
  CUENTA_BAJA: 'instagram.cuenta.baja.ordenar',
  CUENTA_TRASPASO: 'instagram.cuenta.traspaso.ordenar'
});

// Directorio del almacen. `ENKI_INSTAGRAM_STORAGE` existe para poder apuntar a
// otro sitio en pruebas o en una instalacion distinta; por defecto, el storage
// del repo (`<repo>/storage/instagram-bridge`).
const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');
const FICHERO = 'padron.json';

class PadronDeCuentas extends ModuloHibridoReflejo {
  /**
   * @param {{directorio?:string, fichero?:string, reloj?:()=>string}} [opts]
   *   `reloj` solo lo usa la factory `crear()` para no depender de Date.now en
   *   pruebas; el momento de negocio SIEMPRE lo trae el payload (P1).
   */
  constructor(opts = {}) {
    super();
    this.name = 'padron-cuentas';
    this.version = '0.3.0';

    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;
    this._fichero = opts.fichero || FICHERO;
    this._ruta = path.join(this._directorio, this._fichero);

    // E1 comparte carpeta y modulo con B1, pero tiene SU almacen y SU candado: el
    // padron dice de quien es la cuenta; la ficha dice como habla.
    this.fichas = ficha.crear({
      directorio: this._directorio,
      fichero: opts.fichero_fichas || ficha.FICHERO
    });

    // B2 y B4 viven en este modulo porque comparten el padron (una pluma), pero
    // son piezas propias: la ceremonia y la retirada no reimplementan B1.
    this.altas = alta.crear({ padron: this, fichas: this.fichas });
    this.bajas = baja.crear({ padron: this, fichas: this.fichas });

    this._estado = padron.estado_vacio();
    this._cargado = false;
    this._ilegible = null;      // motivo si el padron existe pero no se puede usar
    this._cola = Promise.resolve(); // candado de single-writer
    this._lecturas = 0;
    this._escrituras = 0;
  }

  // ---- ciclo de vida -------------------------------------------------------

  async onLoad(context) {
    await super.onLoad(context);
    await this.cargar();
    await this.fichas.onLoad(context);
    this.logger?.info('padron-cuentas.loaded', {
      module: this.name,
      ruta: this._ruta,
      asientos: this._estado.asientos.length,
      fichas: this.fichas.foto().fichas.length,
      revision: this._estado.revision
    });
  }

  async onUnload() {
    await this._cola; // no dejar una escritura a medias
    await this.fichas.onUnload();
    return super.onUnload();
  }

  /**
   * Carga el padron. Si no existe, arranca vacio (y se escribira en la primera
   * mutacion). Si existe y no sirve, deja `_ilegible` y NO lo toca.
   */
  async cargar() {
    try {
      const crudo = await fsp.readFile(this._ruta, 'utf8');
      const datos = JSON.parse(crudo);
      if (!padron.es_estado(datos)) {
        this._ilegible = 'esquema_desconocido';
        this._estado = padron.estado_vacio();
      } else {
        this._estado = datos;
        this._ilegible = null;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        this._estado = padron.estado_vacio();
        this._ilegible = null;
      } else {
        this._ilegible = err && err.code === 'EACCES' ? 'padron_sin_permiso' : 'padron_ilegible';
        this._estado = padron.estado_vacio();
      }
    }
    this._cargado = true;
    return { ok: this._ilegible === null, motivo: this._ilegible, estado: this._estado };
  }

  /** Lee del disco y sustituye el estado en memoria (para releer tras un cambio externo). */
  async recargar() {
    return this.cargar();
  }

  // ---- escritura -----------------------------------------------------------

  /**
   * Escritura atomica: temporal + rename en el mismo directorio.
   * Si falla, el fichero anterior sigue entero.
   */
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
   * @param {(estado:object) => object} mutacion recibe el estado actual y devuelve
   *   `{ok, estado?, motivo?, faltan?, invalidos?, ...}` (la forma de padron.js).
   */
  _mutar(mutacion) {
    const siguiente = this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: 'sin_padron', detalle: this._ilegible, ruta: this._ruta };
      }
      const r = mutacion(this._estado);
      if (!r || r.ok !== true) return r || { ok: false, motivo: 'entrada_invalida' };

      // Nada se persiste sin auditar: sello en cada asiento (P1), cero secretos (V1).
      const auditoria = padron.auditar(r.estado);
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
    // El candado no se rompe porque una mutacion falle.
    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  _leer(lectura) {
    const siguiente = this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: 'sin_padron', detalle: this._ilegible, ruta: this._ruta };
      }
      this._lecturas += 1;
      return lectura(this._estado);
    });
    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  // ---- operaciones de dominio (las usa tambien B2/B4 en el bloque 15) ------

  alta(entrada) {
    return this._mutar((estado) => padron.alta(estado, entrada));
  }

  baja(entrada) {
    return this._mutar((estado) => padron.baja(estado, entrada));
  }

  traspaso(entrada) {
    return this._mutar((estado) => padron.traspaso(estado, entrada));
  }

  consultar(consulta) {
    return this._leer((estado) => padron.consultar(estado, consulta));
  }

  listar(filtro) {
    return this._leer((estado) => padron.listar(estado, filtro));
  }

  vigente_de(consulta) {
    return this._leer((estado) => {
      const r = padron.consultar(estado, consulta);
      if (!r.ok || !r.asiento) return { ok: true, asiento: null };
      if (r.asiento.estado !== 'vigente') return { ok: true, asiento: null, archivada: true };
      return { ok: true, asiento: r.asiento };
    });
  }

  /** El estado en memoria (copia), para auditorias y pruebas. */
  foto() {
    return JSON.parse(JSON.stringify(this._estado));
  }

  // ---- handlers del bus ----------------------------------------------------

  onAltaRequest(e) {
    return this._rpc(TOPICS.ALTA, e, (d) => this.alta(d));
  }

  onBajaRequest(e) {
    return this._rpc(TOPICS.BAJA, e, (d) => this.baja(d));
  }

  onTraspasoRequest(e) {
    return this._rpc(TOPICS.TRASPASO, e, (d) => this.traspaso(d));
  }

  onConsultarRequest(e) {
    return this._rpc(TOPICS.CONSULTAR, e, (d) => this.consultar(d));
  }

  onListarRequest(e) {
    return this._rpc(TOPICS.LISTAR, e, (d) => this.listar(d));
  }

  // ---- B2 · AltaDeCuenta (la ceremonia de siete pasos) ---------------------

  onAltaIniciarRequest(e) {
    return this._rpc(TOPICS.ALTA_INICIAR, e, (d) => this.altas.iniciar(d));
  }

  onAltaSesionRequest(e) {
    // La sesion la abre una persona: `quien` debe ser `dueno`. B2 lo comprueba.
    return this._rpc(TOPICS.ALTA_SESION, e, (d) => this.altas.abrir_sesion(d.clave || d, d));
  }

  onAltaContinuarRequest(e) {
    return this._rpc(TOPICS.ALTA_CONTINUAR, e, (d) => this.altas.continuar(d.clave || d, d));
  }

  onAltaConsultarRequest(e) {
    return this._rpc(TOPICS.ALTA_CONSULTAR, e, (d) => {
      const sel = d.clave || (d.proyecto && d.cuenta ? { proyecto: d.proyecto, cuenta: d.cuenta } : null);
      return this.altas.estado(sel);
    });
  }

  onAltaAbortarRequest(e) {
    return this._rpc(TOPICS.ALTA_ABORTAR, e, (d) => this.altas.abortar(d.clave || d, d.motivo));
  }

  // ---- B4 · BajaYTraspaso (archiva; el traspaso conserva la historia) ------

  onCuentaBajaRequest(e) {
    return this._rpc(TOPICS.CUENTA_BAJA, e, (d) => this.bajas.dar_de_baja(d));
  }

  onCuentaTraspasoRequest(e) {
    return this._rpc(TOPICS.CUENTA_TRASPASO, e, (d) => this.bajas.traspasar(d));
  }

  /** Las cuentas que esperan a una persona (sin bloquear a los demas proyectos). */
  altas_esperando_persona() {
    return this.altas.esperando_persona();
  }

  // ---- E1 · la ficha (mismo modulo, otro almacen y otro candado) -----------

  onFichaLeerRequest(e) {
    return this.fichas.onLeerRequest(e);
  }

  onFichaDeclararRequest(e) {
    return this.fichas.onDeclararRequest(e);
  }

  onFichaActualizarRequest(e) {
    return this.fichas.onActualizarRequest(e);
  }

  onFichaAdmitirRequest(e) {
    return this.fichas.onAdmitirRequest(e);
  }

  /**
   * Atiende un RPC con su PAR DE FALLO. `_atender` de la base solo publica la
   * response; el contrato del puente exige que un rechazo salga por `.failed`
   * con su motivo, para que nadie pueda leer un fallo como un exito.
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
      // La response lleva el asiento, nunca el padron entero: publicar el almacen
      // completo en cada alta seria filtrar los duenos de todos los proyectos.
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
    for (const campo of ['rutas', 'familias', 'problemas', 'detalle', 'pista', 'asiento', 'cuenta',
      'alta', 'paso_faltante', 'paso_actual', 'pasos_hechos', 'continuable', 'donde_esta',
      'falta', 'faltas', 'pendiente', 'se_pierde', 'proyecto_actual', 'cuenta_sigue_sirviendo',
      'sello_intacto', 'alta_intacta', 'historia_conservada', 'veredicto', 'evidencia_id']) {
      if (r && r[campo] !== undefined) fallo[campo] = r[campo];
    }
    this.eventBus?.publish(`${topic}.failed`, fallo);
    return fallo;
  }
}

/** Factory: la forma comoda para tests y para el loader. */
function crear(opts = {}) {
  return new PadronDeCuentas(opts);
}

module.exports = {
  TOPICS,
  PadronDeCuentas,
  crear,
  // La logica pura se re-exporta para que un consumidor no tenga que saber en
  // que fichero vive: `cuentas/index.js#padron` es el nombre del plano.
  padron,
  // E1 vive en el mismo modulo (bloque 10): `cuentas/index.js#ficha`.
  ficha,
  // B2 y B4 viven aqui (bloque 15) porque comparten el padron, no porque sean
  // el padron: la ceremonia y la retirada se piden, no se reimplementan.
  alta,
  baja
};

// Vista "clase" del plano (cuentas/index.js#padron).
module.exports.Padron = Object.freeze({
  alta: padron.alta,
  baja: padron.baja,
  traspaso: padron.traspaso,
  consultar: padron.consultar,
  listar: padron.listar,
  auditar: padron.auditar
});

// Vistas "clase" del plano para el bloque 15 (cuentas/{alta,baja}.js).
module.exports.AltaDeCuenta = alta.AltaDeCuenta;
module.exports.BajaYTraspaso = baja.BajaYTraspaso;
