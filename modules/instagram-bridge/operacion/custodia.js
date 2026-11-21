'use strict';

/**
 * custodia — el borde de IO que comparten los custodios de `operacion/`.
 *
 * M1 (retratos) y N1 (bandeja) son custodios: guardan estado por proyecto, con
 * un solo escritor, y nada se persiste sin auditar. Ese borde es identico en
 * los dos y no deberia existir dos veces: si un dia se arregla el rename en un
 * sitio y no en el otro, el almacen que se corrompe es el que nadie mira.
 *
 * LO QUE GARANTIZA, Y COMO:
 *   - **Single-writer.** Todas las mutaciones y las lecturas pasan por la misma
 *     cola de promesas: dos `entrar` simultaneos no se pisan. El candado es de
 *     proceso, que es el ambito real de este modulo (un almacen por proceso).
 *   - **Escritura atomica.** Se escribe `<fichero>.<pid>.tmp` y se hace
 *     `rename`. Un corte a mitad deja el temporal, nunca un JSON truncado en
 *     el sitio bueno.
 *   - **Nada se persiste sin auditar.** El llamante pasa su `auditar`; si el
 *     estado resultante tiene problemas, NO se escribe y se devuelven los
 *     problemas. Es mas util un rechazo con la lista que un fichero con una
 *     fila que nadie entiende.
 *   - **Un almacen ilegible NO se sobrescribe.** Si el fichero existe y no se
 *     puede leer o no es de este esquema, se marca `ilegible` y toda mutacion
 *     devuelve `sin_<almacen>` con el detalle. Perder el estado por "empezar
 *     de cero" es la forma mas rapida de borrar la prueba.
 *
 * NO SABE DE DOMINIO. No conoce retratos, ni esperas, ni mensajes: solo
 * `{esquema, almacen, revision, actualizado, <clave>: []}` y una mutacion.
 * La logica de cada custodio vive en su fichero.
 */

const path = require('path');
const fsp = require('fs/promises');

const { es_objeto, clonar } = require('../core/formas');

const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');

class CustodiaJSON {
  /**
   * @param {{directorio?:string, fichero:string, esquema:string,
   *          almacen:string, clave:string, reloj?:() => string}} opts
   */
  constructor(opts = {}) {
    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;
    this._fichero = opts.fichero;
    this._ruta = path.join(this._directorio, this._fichero);
    this._esquema = opts.esquema;
    this._almacen = opts.almacen;
    this._clave = opts.clave;
    this._reloj = opts.reloj || (() => new Date().toISOString());

    this._estado = this._vacio();
    this._cargado = false;
    this._ilegible = null;
    this._cola = Promise.resolve();
    this._escrituras = 0;
    this._lecturas = 0;
  }

  _vacio() {
    const e = { esquema: this._esquema, almacen: this._almacen, revision: 0, actualizado: null };
    e[this._clave] = [];
    return e;
  }

  _es_estado(x) {
    return es_objeto(x) && x.esquema === this._esquema && Array.isArray(x[this._clave]);
  }

  get ruta() { return this._ruta; }
  get revision() { return Number(this._estado.revision) || 0; }
  get ilegible() { return this._ilegible; }
  get escrituras() { return this._escrituras; }
  get lecturas() { return this._lecturas; }

  total() {
    return this._estado[this._clave].length;
  }

  /** Estado actual. Copia: quien lo lea no puede mutar el almacen por accidente. */
  estado() {
    return clonar(this._estado);
  }

  async cargar() {
    try {
      const crudo = await fsp.readFile(this._ruta, 'utf8');
      const datos = JSON.parse(crudo);
      if (!this._es_estado(datos)) {
        this._ilegible = 'esquema_desconocido';
        this._estado = this._vacio();
      } else {
        this._estado = datos;
        this._ilegible = null;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        this._estado = this._vacio();
        this._ilegible = null;
      } else {
        this._ilegible = err && err.code === 'EACCES' ? `${this._almacen}_sin_permiso` : `${this._almacen}_ilegible`;
        this._estado = this._vacio();
      }
    }
    this._cargado = true;
    return { ok: this._ilegible === null, motivo: this._ilegible, ruta: this._ruta, total: this.total() };
  }

  async recargar() {
    return this.cargar();
  }

  async _escribir(estado) {
    await fsp.mkdir(this._directorio, { recursive: true });
    const temporal = `${this._ruta}.${process.pid}.tmp`;
    await fsp.writeFile(temporal, `${JSON.stringify(estado, null, 2)}\n`, 'utf8');
    await fsp.rename(temporal, this._ruta);
    this._escrituras += 1;
  }

  /**
   * Aplica una mutacion y persiste. `mutacion(estadoCopia)` devuelve
   * `{ok:true, estado, ...}` (el estado NUEVO) o un rechazo con motivo.
   * `auditar(estado)` devuelve `{ok:boolean, problemas:[]}`.
   */
  _mutar(mutacion, auditar) {
    const siguiente = this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: `sin_${this._almacen}`, detalle: this._ilegible, ruta: this._ruta, guardado: false };
      }

      const copia = clonar(this._estado);
      const r = mutacion(copia);
      if (!r || r.ok !== true) return r || { ok: false, motivo: 'entrada_invalida', guardado: false };
      // La mutacion puede devolver el estado nuevo o mutar la copia en sitio.
      // Lo que NO puede es devolver un estado que no sea del almacen.
      const nuevo = this._es_estado(r.estado) ? r.estado : copia;
      if (!this._es_estado(nuevo)) {
        return { ok: false, motivo: 'mutacion_no_devuelve_estado', guardado: false };
      }

      // Reintento idempotente: el asiento ya estaba y no hay nada que escribir.
      if (r.sin_escritura === true) {
        return this._salida(r, { revision: this._estado.revision, guardado: true, escrito: false });
      }

      if (typeof auditar === 'function') {
        const auditoria = auditar(nuevo);
        if (!auditoria || auditoria.ok !== true) {
          return {
            ok: false,
            motivo: 'almacen_no_auditado',
            problemas: (auditoria && auditoria.problemas) || [],
            guardado: false
          };
        }
      }

      const estado = Object.assign({}, nuevo, {
        esquema: this._esquema,
        almacen: this._almacen,
        revision: Number(this._estado.revision) + 1,
        actualizado: this._reloj()
      });

      try {
        await this._escribir(estado);
      } catch (err) {
        return {
          ok: false,
          motivo: err && err.code === 'ENOSPC' ? 'disco_lleno' : 'no_se_pudo_guardar',
          detalle: err && err.message,
          guardado: false
        };
      }

      this._estado = estado;
      return this._salida(r, { revision: estado.revision, guardado: true });
    });

    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  /**
   * Prepara la respuesta de una mutacion. `estado` es un campo de DOMINIO en
   * varios sitios (la bandeja devuelve `estado: 'contestado'`), asi que solo se
   * quita cuando es el estado interno del almacen, no cuando es un texto.
   */
  _salida(r, extra) {
    const salida = Object.assign({}, r);
    if (this._es_estado(salida.estado)) delete salida.estado;
    delete salida.sin_escritura;
    return Object.assign(salida, extra);
  }

  /** Lectura consistente: espera a la escritura en curso antes de mirar. */
  _consultar(lectura) {
    const siguiente = this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) {
        return { ok: false, motivo: `sin_${this._almacen}`, detalle: this._ilegible, ruta: this._ruta };
      }
      this._lecturas += 1;
      return lectura(clonar(this._estado));
    });
    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  /** Espera a que termine lo que este en vuelo (parada limpia). */
  drenar() {
    return this._cola;
  }
}

module.exports = { CustodiaJSON, DIR_POR_DEFECTO };
