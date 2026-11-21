'use strict';

/**
 * sesion — D2 · CaidaYReautenticacion + H1 · AparatoAusente · CUSTODIO (borde).
 *
 * Este fichero es el UNICO sitio del puente que escribe `sesion.json` y
 * `ausente.json`. La logica de dominio esta en `caida.js` y `ausente.js` (puros);
 * aqui solo hay IO, correlacion de eventos, los dos candados de escritura y la
 * auditoria previa a cada escritura. `degradado.js` (H3) se re-exporta porque es
 * un reflejo puro, no un almacen: no tiene fichero ni candado.
 *
 * Por que las dos memorias viven en el mismo modulo: son las dos caras del mismo
 * hecho ("la sesion no esta"). D2 dice que pasa con el TRABAJO cuando la sesion
 * se cae; H1 dice como se AVISA cuando el aparato no esta. Comparten cuenta,
 * aparato y proyecto, y separarlas obligaria a que quien pierde la sesion
 * hablase con dos custodios para una sola incidencia.
 *
 * Reglas de esta capa (el mismo patron que el padron y el ritmo):
 *   - **Single-writer** por almacen: una cola de promesas por fichero. Dos caidas
 *     simultaneas no pueden leer el mismo estado y pisarse.
 *   - **Escritura atomica**: temporal + rename en el mismo directorio.
 *   - **Nada se persiste sin auditar**: `caida.auditar()` / `ausente.auditar()`
 *     corren antes de cada escritura (P1 sello, V1 secretos, estados declarados,
 *     reautenticacion por persona, aviso con acuse real).
 *   - **Un fallo se publica como `.failed`**, nunca como response con ok:false.
 *   - **Un almacen ilegible NO se sobrescribe**: se devuelve `sin_sesion` /
 *     `sin_avisos` y se espera. Reescribir la memoria de sesiones o la lista de
 *     avisos es perder lo unico que se sabe de ellas.
 */

const path = require('path');
const fsp = require('fs/promises');

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const caida = require('./caida');
const ausente = require('./ausente');
const degradado = require('./degradado');

const TOPICS = Object.freeze({
  CAIDA_REGISTRAR: 'instagram.sesion.caida.registrar',
  REAUTENTICAR: 'instagram.sesion.reautenticar',
  REVISION_RESOLVER: 'instagram.sesion.revision.resolver',
  CONSULTAR: 'instagram.sesion.consultar',
  LISTAR: 'instagram.sesion.listar',
  AVISO_AVISAR: 'instagram.aviso.ausente.avisar',
  AVISO_ACUSAR: 'instagram.aviso.ausente.acusar',
  AVISO_LISTAR: 'instagram.aviso.ausente.listar',
  AVISO_RESUMEN: 'instagram.aviso.ausente.resumen'
});

const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');
const FICHERO_SESION = 'sesion.json';
const FICHERO_AVISOS = 'ausente.json';

class SesionDeCuentas extends ModuloHibridoReflejo {
  /**
   * @param {{directorio?:string, fichero_sesion?:string, fichero_avisos?:string}} [opts]
   */
  constructor(opts = {}) {
    super();
    this.name = 'sesion-cuentas';
    this.version = '0.1.0';

    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;
    this._rutaSesion = path.join(this._directorio, opts.fichero_sesion || FICHERO_SESION);
    this._rutaAvisos = path.join(this._directorio, opts.fichero_avisos || FICHERO_AVISOS);

    this._sesion = caida.estado_vacio();
    this._avisos = ausente.estado_vacio();
    this._cargado = false;
    this._ilegibleSesion = null;
    this._ilegibleAvisos = null;

    // Dos candados, uno por almacen: una caida no espera al acuse de un aviso.
    this._cerrojoSesion = Promise.resolve();
    this._cerrojoAvisos = Promise.resolve();

    this._lecturas = 0;
    this._escrituras = 0;
  }

  // ---- ciclo de vida -------------------------------------------------------

  async onLoad(context) {
    await super.onLoad(context);
    await this.cargar();
    this.logger?.info('sesion-cuentas.loaded', {
      module: this.name,
      sesion: this._rutaSesion,
      avisos: this._rutaAvisos,
      cuentas: this._sesion.cuentas.length,
      avisos_registrados: this._avisos.avisos.length
    });
  }

  async onUnload() {
    await this._cerrojoSesion;
    await this._cerrojoAvisos;
    return super.onUnload();
  }

  async _leerFichero(ruta, es_estado, vacio, etiqueta) {
    try {
      const crudo = await fsp.readFile(ruta, 'utf8');
      const datos = JSON.parse(crudo);
      if (!es_estado(datos)) return { estado: vacio(), ilegible: 'esquema_desconocido' };
      return { estado: datos, ilegible: null };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { estado: vacio(), ilegible: null };
      const motivo = err && err.code === 'EACCES' ? `${etiqueta}_sin_permiso` : `${etiqueta}_ilegible`;
      return { estado: vacio(), ilegible: motivo };
    }
  }

  /** Carga los dos almacenes. Un fichero que no existe arranca vacio; uno roto NO se toca. */
  async cargar() {
    const s = await this._leerFichero(this._rutaSesion, caida.es_estado, caida.estado_vacio, 'sesion');
    this._sesion = s.estado;
    this._ilegibleSesion = s.ilegible;

    const a = await this._leerFichero(this._rutaAvisos, ausente.es_estado, ausente.estado_vacio, 'avisos');
    this._avisos = a.estado;
    this._ilegibleAvisos = a.ilegible;

    this._cargado = true;
    return {
      ok: this._ilegibleSesion === null && this._ilegibleAvisos === null,
      sesion: this._ilegibleSesion,
      avisos: this._ilegibleAvisos
    };
  }

  async recargar() {
    return this.cargar();
  }

  // ---- escritura atomica ---------------------------------------------------

  async _escribir(ruta, estado) {
    await fsp.mkdir(this._directorio, { recursive: true });
    const temporal = `${ruta}.${process.pid}.tmp`;
    await fsp.writeFile(temporal, `${JSON.stringify(estado, null, 2)}\n`, 'utf8');
    await fsp.rename(temporal, ruta);
    this._escrituras += 1;
    return ruta;
  }

  /**
   * Aplica una mutacion pura bajo su candado, auditando antes de escribir.
   * `nombre` decide el motivo de fallo (`sin_sesion` / `sin_avisos`) y la ruta.
   */
  _mutar(nombre, mutacion) {
    const esSesion = nombre === 'sesion';
    const cerrojo = esSesion ? '_cerrojoSesion' : '_cerrojoAvisos';
    const ilegible = esSesion ? '_ilegibleSesion' : '_ilegibleAvisos';
    const ruta = esSesion ? this._rutaSesion : this._rutaAvisos;
    const campo = esSesion ? '_sesion' : '_avisos';
    const auditor = esSesion ? caida.auditar : ausente.auditar;
    const motivoSin = esSesion ? 'sin_sesion' : 'sin_avisos';

    const siguiente = this[cerrojo].then(async () => {
      if (!this._cargado) await this.cargar();
      if (this[ilegible]) {
        return { ok: false, motivo: motivoSin, detalle: this[ilegible], ruta };
      }
      const r = mutacion(this[campo]);
      if (!r || r.ok !== true) return r || { ok: false, motivo: 'entrada_invalida' };
      if (!r.estado) return r; // una respuesta sin estado es una lectura: no se escribe

      const auditoria = auditor(r.estado);
      if (!auditoria.ok) {
        return {
          ok: false,
          motivo: 'almacen_no_auditado',
          problemas: auditoria.problemas,
          guardado: false
        };
      }

      try {
        await this._escribir(ruta, r.estado);
      } catch (err) {
        return {
          ok: false,
          motivo: err && err.code === 'ENOSPC' ? 'disco_lleno' : 'no_se_pudo_guardar',
          detalle: err && err.message,
          guardado: false
        };
      }

      this[campo] = r.estado;
      return r;
    });

    this[cerrojo] = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  _leer(nombre, lectura) {
    const esSesion = nombre === 'sesion';
    const cerrojo = esSesion ? '_cerrojoSesion' : '_cerrojoAvisos';
    const ilegible = esSesion ? '_ilegibleSesion' : '_ilegibleAvisos';
    const ruta = esSesion ? this._rutaSesion : this._rutaAvisos;
    const campo = esSesion ? '_sesion' : '_avisos';
    const motivoSin = esSesion ? 'sin_sesion' : 'sin_avisos';

    const siguiente = this[cerrojo].then(async () => {
      if (!this._cargado) await this.cargar();
      if (this[ilegible]) return { ok: false, motivo: motivoSin, detalle: this[ilegible], ruta };
      this._lecturas += 1;
      return lectura(this[campo]);
    });

    this[cerrojo] = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  // ---- D2: caida y reautenticacion ----------------------------------------

  registrar_caida(entrada) {
    return this._mutar('sesion', (estado) => caida.registrar_caida(estado, entrada));
  }

  reautenticar(entrada) {
    return this._mutar('sesion', (estado) => caida.reanudar(estado, entrada));
  }

  resolver_revision(entrada) {
    return this._mutar('sesion', (estado) => caida.resolver_revision(estado, entrada));
  }

  consultar_sesion(consulta) {
    return this._leer('sesion', (estado) => caida.consultar(estado, consulta));
  }

  listar_sesiones(filtro) {
    return this._leer('sesion', (estado) => caida.listar(estado, filtro));
  }

  // ---- H1: aviso de aparato ausente ---------------------------------------

  avisar(entrada) {
    return this._mutar('avisos', (estado) => ausente.avisar(estado, entrada));
  }

  acusar(entrada) {
    return this._mutar('avisos', (estado) => ausente.acusar(estado, entrada));
  }

  avisos_pendientes(filtro) {
    return this._leer('avisos', (estado) => ausente.pendientes(estado, filtro));
  }

  resumen_avisos(filtro) {
    return this._leer('avisos', (estado) => ausente.resumen(estado, filtro));
  }

  consultar_aviso(consulta) {
    return this._leer('avisos', (estado) => ausente.consultar(estado, consulta));
  }

  /** Fotografias en memoria, para auditorias y pruebas. */
  foto() {
    return {
      sesion: JSON.parse(JSON.stringify(this._sesion)),
      avisos: JSON.parse(JSON.stringify(this._avisos))
    };
  }

  // ---- handlers del bus ----------------------------------------------------

  onCaidaRegistrarRequest(e) {
    return this._rpc(TOPICS.CAIDA_REGISTRAR, e, (d) => this.registrar_caida(d));
  }

  onReautenticarRequest(e) {
    return this._rpc(TOPICS.REAUTENTICAR, e, (d) => this.reautenticar(d));
  }

  onRevisionResolverRequest(e) {
    return this._rpc(TOPICS.REVISION_RESOLVER, e, (d) => this.resolver_revision(d));
  }

  onConsultarRequest(e) {
    return this._rpc(TOPICS.CONSULTAR, e, (d) => this.consultar_sesion(d));
  }

  onListarRequest(e) {
    return this._rpc(TOPICS.LISTAR, e, (d) => this.listar_sesiones(d));
  }

  onAvisoAvisarRequest(e) {
    return this._rpc(TOPICS.AVISO_AVISAR, e, (d) => this.avisar(d));
  }

  onAvisoAcusarRequest(e) {
    return this._rpc(TOPICS.AVISO_ACUSAR, e, (d) => this.acusar(d));
  }

  onAvisoListarRequest(e) {
    return this._rpc(TOPICS.AVISO_LISTAR, e, (d) => this.avisos_pendientes(d));
  }

  onAvisoResumenRequest(e) {
    return this._rpc(TOPICS.AVISO_RESUMEN, e, (d) => this.resumen_avisos(d));
  }

  /**
   * Atiende un RPC con su PAR DE FALLO. `_atender` de la base solo publica la
   * response; el contrato del puente exige que un rechazo salga por `.failed`
   * con su motivo.
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
      // La response no publica el almacen entero: solo lo que se pidio.
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
    const campos = [
      'rutas', 'familias', 'problemas', 'detalle', 'que_hace_falta', 'cuenta',
      'asiento', 'trabajo', 'aviso', 'aviso_id', 'guardado', 'quien', 'estado_trabajo'
    ];
    for (const campo of campos) {
      if (r && r[campo] !== undefined) fallo[campo] = r[campo];
    }
    this.eventBus?.publish(`${topic}.failed`, fallo);
    return fallo;
  }
}

/** Factory: la forma comoda para tests y para el loader. */
function crear(opts = {}) {
  return new SesionDeCuentas(opts);
}

module.exports = {
  TOPICS,
  SesionDeCuentas,
  crear,
  // La logica pura se re-exporta para que un consumidor no tenga que saber en
  // que fichero vive: `sesion/index.js#caida` es el nombre del plano.
  caida,
  ausente,
  degradado
};

module.exports.CaidaYReautenticacion = caida.CaidaYReautenticacion;
module.exports.AparatoAusente = ausente.AparatoAusente;
module.exports.ModoDegradado = degradado.ModoDegradado;
