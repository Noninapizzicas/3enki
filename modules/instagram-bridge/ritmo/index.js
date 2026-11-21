'use strict';

/**
 * ritmo — G3 · ColaDeTrabajos + G5 · MemoriaDeTolerancia · CUSTODIO (borde).
 *
 * Este fichero es el UNICO sitio del puente que escribe `cola.json` y
 * `tolerancia.json`. Toda la logica de dominio esta en `cola.js` y
 * `tolerancia.js` (puros); aqui solo hay IO, correlacion de eventos, los dos
 * candados de escritura y la sintesis de G6 cuando alguien pregunta por el bus.
 *
 * Por que las dos memorias viven en el mismo modulo: son las dos caras del
 * mismo limite. El techo dice cuanto cabe; la tolerancia dice cuanto se ha
 * aguantado. G6 necesita LAS DOS a la vez para emitir un veredicto, y separarlas
 * en dos modulos obligaria a G6 a hablar con dos custodios para una sola
 * decision. Una cuenta, una memoria de ritmo.
 *
 * Reglas de esta capa (las mismas que el padron, porque es el mismo patron):
 *   - **Single-writer** por almacen: cola de promesas. Dos tomas simultaneas no
 *     pueden leer el mismo estado y entregar el mismo trabajo dos veces.
 *   - **Escritura atomica**: temporal + rename en el mismo directorio.
 *   - **Nada se persiste sin auditar**: `cola.auditar()` / `tolerancia.auditar()`
 *     corren antes de cada escritura (P1 sello, V1 secretos, P3 clase) y ademas
 *     `cola.auditar()` comprueba la regla de la pieza: como mucho un trabajo en
 *     curso por cuenta.
 *   - **Un fallo se publica como `.failed`**, nunca como response con ok:false.
 *   - **Almacen ilegible no se repara a ciegas**: se devuelve `sin_cola` /
 *     `sin_tolerancia` y no se sobrescribe. Reescribir la memoria de una cuenta
 *     es perder lo unico que se sabe de ella.
 *
 * El estado es POR CUENTA (cola y tolerancia se consultan y se sirven por
 * cuenta): el limite lo impone la plataforma a la cuenta, no al proyecto. El
 * fichero guarda varias cuentas y cada lectura se filtra por ambito (P2).
 */

const path = require('path');
const fsp = require('fs/promises');

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const ritmo = require('../core/ritmo');
const prioridad = require('../core/prioridad');
const cola = require('./cola');
const tolerancia = require('./tolerancia');
const castigo = require('./castigo');
const regulador = require('./regulador');

const TOPICS = Object.freeze({
  ENCOLAR: 'instagram.ritmo.trabajo.encolar',
  TOMAR: 'instagram.ritmo.trabajo.tomar',
  CERRAR: 'instagram.ritmo.trabajo.cerrar',
  DEVOLVER: 'instagram.ritmo.trabajo.devolver',
  LISTAR: 'instagram.ritmo.cola.listar',
  TOLERANCIA_CONSULTAR: 'instagram.ritmo.tolerancia.consultar',
  TOLERANCIA_ANOTAR: 'instagram.ritmo.tolerancia.anotar',
  CASTIGO_JUZGAR: 'instagram.ritmo.castigo.juzgar',
  PASO_DECIDIR: 'instagram.ritmo.paso.decidir'
});

const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');
const FICHERO_COLA = 'cola.json';
const FICHERO_TOLERANCIA = 'tolerancia.json';

class Ritmo extends ModuloHibridoReflejo {
  /**
   * @param {{directorio?:string, fichero_cola?:string, fichero_tolerancia?:string,
   *          clasificador?:(senal:*) => (object|null)}} [opts]
   *   `clasificador` es el unico enchufe fuzzy de la pieza (G2). No viaja por el
   *   bus —una funcion no es un payload— y es OPCIONAL: sin el, G2 funciona con
   *   reglas y la duda se resuelve como dudosa.
   */
  constructor(opts = {}) {
    super();
    this.name = 'ritmo';
    this.version = '0.1.0';

    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;
    this._rutaCola = path.join(this._directorio, opts.fichero_cola || FICHERO_COLA);
    this._rutaTolerancia = path.join(this._directorio, opts.fichero_tolerancia || FICHERO_TOLERANCIA);
    this._clasificador = typeof opts.clasificador === 'function' ? opts.clasificador : null;

    this._cola = cola.estado_vacio();
    this._tolerancia = tolerancia.estado_vacio();
    this._cargado = false;
    this._ilegibleCola = null;
    this._ilegibleTolerancia = null;

    // Dos candados, uno por almacen: cerrar un trabajo no espera a que se anote
    // una tolerancia, pero dos escrituras del MISMO fichero no se cruzan nunca.
    this._cerrojoCola = Promise.resolve();
    this._cerrojoTolerancia = Promise.resolve();

    this._lecturas = 0;
    this._escrituras = 0;
  }

  // ---- ciclo de vida -------------------------------------------------------

  async onLoad(context) {
    await super.onLoad(context);
    await this.cargar();
    this.logger?.info('ritmo.loaded', {
      module: this.name,
      cola: this._rutaCola,
      tolerancia: this._rutaTolerancia,
      trabajos: this._cola.trabajos.length,
      asientos: this._tolerancia.asientos.length
    });
  }

  async onUnload() {
    await this._cerrojoCola;
    await this._cerrojoTolerancia;
    return super.onUnload();
  }

  /**
   * Lee un almacen. No existe → vacio (se escribira en la primera mutacion).
   * Existe y no sirve → se nombra el motivo y NO se toca el fichero.
   */
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
    const c = await this._leerFichero(this._rutaCola, cola.es_estado, cola.estado_vacio, 'cola');
    this._cola = c.estado;
    this._ilegibleCola = c.ilegible;

    const t = await this._leerFichero(this._rutaTolerancia, tolerancia.es_estado, tolerancia.estado_vacio, 'tolerancia');
    this._tolerancia = t.estado;
    this._ilegibleTolerancia = t.ilegible;

    this._cargado = true;
    return {
      ok: this._ilegibleCola === null && this._ilegibleTolerancia === null,
      cola: this._ilegibleCola,
      tolerancia: this._ilegibleTolerancia
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

  /** Aplica una mutacion pura de la cola bajo su candado. */
  _mutarCola(mutacion) {
    const siguiente = this._cerrojoCola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegibleCola) return { ok: false, motivo: 'sin_cola', detalle: this._ilegibleCola, ruta: this._rutaCola };
      const r = mutacion(this._cola);
      if (!r || r.ok !== true) return r || { ok: false, motivo: 'entrada_invalida' };
      // Una respuesta sin estado es una lectura (p.ej. `sin_trabajo`): no se
      // escribe nada. Guardar `undefined` dejaria el fichero sin cola.
      if (!r.estado) return r;
      try {
        await this._escribir(this._rutaCola, r.estado);
      } catch (err) {
        return {
          ok: false,
          motivo: err && err.code === 'ENOSPC' ? 'disco_lleno' : 'no_se_pudo_guardar',
          detalle: err && err.message,
          guardado: false
        };
      }
      this._cola = r.estado;
      return r;
    });
    this._cerrojoCola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  _leerCola(lectura) {
    const siguiente = this._cerrojoCola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegibleCola) return { ok: false, motivo: 'sin_cola', detalle: this._ilegibleCola, ruta: this._rutaCola };
      this._lecturas += 1;
      return lectura(this._cola);
    });
    this._cerrojoCola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  _mutarTolerancia(mutacion) {
    const siguiente = this._cerrojoTolerancia.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegibleTolerancia) {
        return { ok: false, motivo: 'sin_tolerancia', detalle: this._ilegibleTolerancia, ruta: this._rutaTolerancia };
      }
      const r = mutacion(this._tolerancia);
      if (!r || r.ok !== true) return r || { ok: false, motivo: 'entrada_invalida' };
      if (!r.estado) return r;
      try {
        await this._escribir(this._rutaTolerancia, r.estado);
      } catch (err) {
        return {
          ok: false,
          motivo: err && err.code === 'ENOSPC' ? 'disco_lleno' : 'no_se_pudo_guardar',
          detalle: err && err.message,
          guardado: false
        };
      }
      this._tolerancia = r.estado;
      return r;
    });
    this._cerrojoTolerancia = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  _leerTolerancia(lectura) {
    const siguiente = this._cerrojoTolerancia.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegibleTolerancia) {
        return { ok: false, motivo: 'sin_tolerancia', detalle: this._ilegibleTolerancia, ruta: this._rutaTolerancia };
      }
      this._lecturas += 1;
      return lectura(this._tolerancia);
    });
    this._cerrojoTolerancia = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  // ---- operaciones de dominio ---------------------------------------------

  encolar(entrada) {
    return this._mutarCola((estado) => cola.enconlar(estado, entrada));
  }

  tomar(pedido) {
    return this._mutarCola((estado) => cola.tomar_siguiente(estado, pedido));
  }

  cerrar(entrada) {
    return this._mutarCola((estado) => cola.cerrar(estado, entrada));
  }

  devolver(entrada) {
    return this._mutarCola((estado) => cola.devolver(estado, entrada));
  }

  listarTrabajos(filtro) {
    return this._leerCola((estado) => cola.listar(estado, filtro));
  }

  toleranciaDe(consulta) {
    return this._leerTolerancia((estado) => tolerancia.tolerancia_de(estado, consulta));
  }

  listarTolerancia(filtro) {
    return this._leerTolerancia((estado) => tolerancia.listar(estado, filtro));
  }

  anotarTolerancia(entrada) {
    return this._mutarTolerancia((estado) => tolerancia.anotar(estado, entrada));
  }

  anotarTolerado(entrada) {
    return this._mutarTolerancia((estado) => tolerancia.anotar_tolerado(estado, entrada));
  }

  anotarCastigo(entrada) {
    return this._mutarTolerancia((estado) => tolerancia.anotar_castigo(estado, entrada));
  }

  /**
   * G2 sobre una senal ya observada. Sin LLM funciona igual (reglas).
   *
   * Acepta la senal entera (`{senal:{...}}`) o los campos sueltos
   * (`{texto, indicios, mirada, hasta}`): el bus no siempre trae el sobre.
   * El clasificador NO se acepta por payload (una funcion no viaja): el que
   * tenga el modulo, inyectado en el constructor.
   */
  juzgarCastigo(datos = {}) {
    const d = datos || {};
    const senal = d.senal !== undefined
      ? d.senal
      : { texto: d.texto, indicios: d.indicios, mirada: d.mirada, hasta: d.hasta, momento: d.momento_senal };
    return castigo.juzgar(senal, { momento: d.momento, clasificador: this._clasificador });
  }

  /**
   * G6 · La sintesis, con los cinco inputs leidos de los dos almacenes.
   *
   * La cuenta manda: la tolerancia (G5) da el margen, la cola (G3) dice si esta
   * ocupada y quien adelanta (G4), y G2 entra por `castigo` o por `senal`.
   *
   * @param {{cuenta:string, proyecto?:string, accion?:string, trabajo?:object,
   *          momento:string, gastado?:number, techo?:number, techo_hasta?:string,
   *          castigo?:object, senal?:*, ultima_accion_en?:string,
   *          espera_hasta?:string}} pedido
   */
  async decidirPaso(pedido = {}) {
    const p = pedido || {};
    if (!p.cuenta) {
      return { ok: false, motivo: 'entrada_invalida', faltan: ['cuenta'] };
    }

    const t = await this.toleranciaDe({ cuenta: p.cuenta, proyecto: p.proyecto });
    if (!t.ok) return t;

    const lista = await this.listarTrabajos({ cuenta: p.cuenta });
    if (!lista.ok) return lista;

    const enCurso = lista.trabajos.find((x) => x.estado === 'en_curso') || null;
    const pendientes = lista.trabajos.filter((x) => x.estado === 'pendiente');
    const propuesto = p.trabajo || (p.accion ? { id: 'propuesto', accion: p.accion, quien: 'dueno', secuencia: Number.MAX_SAFE_INTEGER, estado: 'nuevo' } : null);
    const adelanta = propuesto ? prioridad.adelanta_a(propuesto, pendientes) : null;

    const castigoJuicio = p.senal !== undefined
      ? castigo.juzgar(p.senal, { momento: p.momento, clasificador: this._clasificador })
      : null;

    const veredicto = regulador.decidir({
      momento: p.momento,
      accion: p.accion || (propuesto && propuesto.accion),
      trabajo: propuesto,
      conservaduria: t.conservaduria,
      gastado: p.gastado,
      techo: p.techo,
      techo_hasta: p.techo_hasta,
      castigo: p.castigo || (castigoJuicio && castigoJuicio.ok ? castigoJuicio : undefined),
      cola: {
        en_curso: enCurso ? enCurso.id : null,
        adelanta: adelanta ? adelanta.id : null,
        hasta: p.turno_hasta
      },
      ultima_accion_en: p.ultima_accion_en,
      espera_hasta: p.espera_hasta
    });

    return Object.assign(veredicto, {
      cuenta: p.cuenta,
      tolerancia: { conservaduria: t.conservaduria, origen: t.origen, perfil: t.perfil.nombre },
      gastado_declarado: p.gastado !== undefined && p.gastado !== null
    });
  }

  /** El estado en memoria (copia), para auditorias y pruebas. */
  foto() {
    return {
      cola: JSON.parse(JSON.stringify(this._cola)),
      tolerancia: JSON.parse(JSON.stringify(this._tolerancia)),
      ilegible: { cola: this._ilegibleCola, tolerancia: this._ilegibleTolerancia },
      lecturas: this._lecturas,
      escrituras: this._escrituras
    };
  }

  // ---- handlers del bus ----------------------------------------------------

  onEncolarRequest(e) { return this._rpc(TOPICS.ENCOLAR, e, (d) => this.encolar(d)); }
  onTomarRequest(e) { return this._rpc(TOPICS.TOMAR, e, (d) => this.tomar(d)); }
  onCerrarRequest(e) { return this._rpc(TOPICS.CERRAR, e, (d) => this.cerrar(d)); }
  onDevolverRequest(e) { return this._rpc(TOPICS.DEVOLVER, e, (d) => this.devolver(d)); }
  onListarColaRequest(e) { return this._rpc(TOPICS.LISTAR, e, (d) => this.listarTrabajos(d)); }
  onToleranciaConsultarRequest(e) { return this._rpc(TOPICS.TOLERANCIA_CONSULTAR, e, (d) => this.toleranciaDe(d)); }
  onToleranciaAnotarRequest(e) { return this._rpc(TOPICS.TOLERANCIA_ANOTAR, e, (d) => this.anotarTolerancia(d)); }
  onCastigoJuzgarRequest(e) { return this._rpc(TOPICS.CASTIGO_JUZGAR, e, (d) => this.juzgarCastigo(d)); }
  onPasoDecidirRequest(e) { return this._rpc(TOPICS.PASO_DECIDIR, e, (d) => this.decidirPaso(d)); }

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
    for (const campo of ['detalle', 'problemas', 'guardado', 'rutas', 'familias', 'acciones', 'tipos', 'desenlaces', 'rango', 'id', 'cuenta', 'en_curso', 'accion_en_curso', 'desde', 'pista', 'decision', 'razon', 'hasta', 'fin_declarado']) {
      if (r && r[campo] !== undefined) fallo[campo] = r[campo];
    }
    this.eventBus?.publish(`${topic}.failed`, fallo);
    return fallo;
  }
}

/** Factory: la forma comoda para tests y para el loader. */
function crear(opts = {}) {
  return new Ritmo(opts);
}

module.exports = {
  TOPICS,
  Ritmo,
  crear,
  // Las piezas puras se re-exportan: un consumidor no tiene que saber en que
  // fichero vive cada una para usar el regulador entero.
  cola,
  tolerancia,
  castigo,
  regulador,
  ritmo,
  prioridad
};
