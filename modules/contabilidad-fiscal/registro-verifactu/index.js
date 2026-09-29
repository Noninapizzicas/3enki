/**
 * contabilidad-fiscal/registro-verifactu — CUSTODIO CON PERSISTENCIA (D8, hoja del plan).
 *
 * HUELGA/CADENA **INALTERABLE** DE LA FACTURACION (RD 1007/2023). Cada registro de alta de
 * factura se ENCADENA al anterior: el registro lleva la HUELLA (hash) del registro ANTERIOR,
 * de modo que la cadena entera es verificable y NINGUN eslabon puede alterarse sin romperla.
 *
 * Es **LA INVARIANTE DEL ASIENTO APLICADA A VERIFACTU**: APPEND-ONLY. Un registro = un eslabon.
 * **NO se borra y NO se reescribe NUNCA.** Este modulo no expone ninguna operacion de borrado ni
 * de edicion: solo `encadenar` (apilar) y lectura. El eslabon previo es inmutable por construccion.
 *
 * El sistema **GENERA y REGISTRA**; **NO firma y NO presenta**. La firma es del asesor/flujo de
 * firma; la presentacion a la administracion es del asesor. Aqui solo se encadena: `firmado:false`
 * y `presentado:false` viajan declarados en cada eslabon.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): el ALGORITMO de huella es DECLARABLE (`algoritmo`,
 * default sha256, un algoritmo del estandar — no una constante legal de Verifactu) y los CAMPOS
 * que entran en la huella son DECLARABLES (`campos_huella`); no se cablea ningun formato, ni
 * version, ni serie de plazos, ni campo obligatorio de un esquema normativo concreto. El registro
 * de entrada llega TAL CUAL lo declare el emisor.
 *
 * UN SOLO ESCRITOR: el encadenador (rol ENCADENADOR_VERIFACTU). Cualquier otro rol es rechazado (403).
 *
 * Recibe el alta por DOS vias, ninguna es `require` cruzado:
 *   - RPC `registro-verifactu.encadenar.request`,
 *   - fire-and-forget `contabilidad.factura_emitida` (publicado por emision-factura-venta O1).
 *
 * Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja D8 del plan-construccion y diseno-oop.md (CLASE RegistroVerifactu).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la cadena: el encadenador.
const ROL_ESCRITOR = 'ENCADENADOR_VERIFACTU';

// Algoritmos de huella admitidos (del estandar de crypto). El algoritmo declarado debe estar aqui;
// no hay ninguna constante legal cableada (ni version de Verifactu, ni formato de la huella).
const ALGORITMOS = new Set(['sha256', 'sha384', 'sha512']);
const ALGORITMO_POR_DEFECTO = 'sha256';

class RegistroVerifactu extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'registro-verifactu';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, eslabones: [append-only], indice: Map<clave, pos> }
    this._cadenas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'registro-verifactu.json',
      dir: '/contabilidad/registro-verifactu',
      snapshot: (pid) => {
        const c = this._cadenas.get(pid);
        if (!c) return null;
        return { project_id: pid, esquema: c.esquema, eslabones: c.eslabones };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const eslabones = Array.isArray(data.eslabones) ? data.eslabones : [];
        const indice = new Map();
        eslabones.forEach((esl, i) => { if (esl && esl.clave != null) indice.set(String(esl.clave), i); });
        this._cadenas.set(pid, {
          esquema: data.esquema || 'contabilidad-registro-verifactu-v1',
          eslabones,
          indice
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la cadena del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onEncadenarRequest(e) {
    return this._atender(e, 'encadenar', 'registro-verifactu.encadenar.response', async (d) => {
      const res = this._encadenar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.huella_encadenada', {
          project_id: res.data.project_id,
          eslabon: res.data.eslabon.numero,
          clave: res.data.eslabon.clave,
          huella: res.data.eslabon.huella,
          huella_anterior: res.data.eslabon.huella_anterior,
          encadenada: res.data.encadenada,
          repetida: res.data.repetida,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('registro-verifactu.encadenar.failed', res);
      }
      return res;
    });
  }

  // ── Fire-and-forget del dominio: O1 publico contabilidad.factura_emitida ──
  onFacturaEmitida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._encadenar({
      project_id: d.project_id,
      rol: ROL_ESCRITOR,
      factura: d.factura || { serie: d.serie, numero: d.numero, clave: d.clave },
      clave: d.clave,
      correlation_id: d.correlation_id
    });
    if (res.status === 200) {
      this.eventBus?.publish('contabilidad.huella_encadenada', {
        project_id: res.data.project_id,
        eslabon: res.data.eslabon.numero,
        clave: res.data.eslabon.clave,
        huella: res.data.eslabon.huella,
        huella_anterior: res.data.eslabon.huella_anterior,
        encadenada: res.data.encadenada,
        repetida: res.data.repetida,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('registro-verifactu.encadenar.failed', res);
    }
    return res;
  }

  // ── proyeccion de escritura (UN escritor): apila un eslabon con la huella del ANTERIOR ──
  _encadenar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el encadenador apila eslabones.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el encadenador (ENCADENADOR_VERIFACTU) escribe en la cadena inalterable',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const registro = input.registro || input.factura;
    if (!registro || typeof registro !== 'object') return this._invalid('registro');

    const clave = input.clave != null ? String(input.clave)
      : (registro.clave != null ? String(registro.clave)
        : (registro.serie != null && registro.numero != null ? `${registro.serie}/${registro.numero}` : null));
    if (!clave) return this._invalid('clave');

    const c = this._obtenerOCrear(pid);

    // IDEMPOTENCIA: la misma clave no se apila dos veces. Devolver el eslabon existente NO
    // reescribe nada: la cadena queda intacta (un registro = un eslabon).
    const ya = c.indice.get(clave);
    if (ya !== undefined) {
      return {
        status: 200,
        data: { project_id: pid, eslabon: c.eslabones[ya], encadenada: false, repetida: true,
          motivo: 'la clave ya esta encadenada: no se reescribe ni se duplica el eslabon' }
      };
    }

    // El algoritmo de huella es DECLARABLE (del estandar). No se cablea ningun formato legal.
    const algoritmo = input.algoritmo != null ? String(input.algoritmo).toLowerCase() : ALGORITMO_POR_DEFECTO;
    if (!ALGORITMOS.has(algoritmo)) {
      return this._errorResponse(422, 'ALGORITMO_NO_DECLARABLE',
        'algoritmo de huella no admitido', { algoritmo, admitidos: [...ALGORITMOS] });
    }

    // Los campos que entran en la huella son DECLARABLES; sin declarar, TODO el contenido del
    // registro entra (nada se omite de la huella por una lista cableada).
    const campos = Array.isArray(input.campos_huella) ? input.campos_huella.map(String) : null;

    // LA INVARIANTE: huella del registro ANTERIOR. El primer eslabon arranca de la huella
    // origen DECLARADA (o null); nunca de una constante.
    const anterior = c.eslabones.length ? c.eslabones[c.eslabones.length - 1] : null;
    const huella_anterior = anterior ? anterior.huella
      : (input.huella_origen != null ? String(input.huella_origen) : null);

    const huella = this._huella(registro, huella_anterior, algoritmo, campos);

    const eslabon = {
      numero: c.eslabones.length + 1,
      clave,
      // El contenido entra TAL CUAL lo declara el emisor (no se completa ni se estima).
      contenido: registro,
      huella_anterior,
      huella,
      algoritmo,
      campos_huella: campos,
      // El sistema GENERA y REGISTRA; NO firma y NO presenta.
      firmado: false,
      presentado: false,
      generado_por: ROL_ESCRITOR,
      generado_en: new Date().toISOString(),
      inmutable: true,
      append_only: true
    };

    // APPEND-ONLY: se apila. NO se borra y NO se reescribe NUNCA ningun eslabon.
    c.eslabones.push(eslabon);
    c.indice.set(clave, c.eslabones.length - 1);
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        eslabon,
        encadenada: true,
        repetida: false,
        longitud_cadena: c.eslabones.length
      }
    };
  }

  // Huella = hash(algoritmo; huella_anterior + contenido canonico del registro).
  // El encadenamiento es POR HUELLA DEL ANTERIOR: sin ella, la cadena no es verificable.
  _huella(registro, huella_anterior, algoritmo, campos) {
    const contenido = campos
      ? campos.reduce((acc, k) => { acc[k] = registro?.[k] ?? null; return acc; }, {})
      : registro;
    const material = JSON.stringify({ huella_anterior, contenido: this._estable(contenido) });
    return crypto.createHash(algoritmo).update(material, 'utf-8').digest('hex');
  }

  // Serializacion estable (claves ordenadas) para que la misma entrada de la misma huella.
  _estable(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => this._estable(v));
    const out = {};
    for (const k of Object.keys(obj).sort()) out[k] = this._estable(obj[k]);
    return out;
  }

  _obtenerOCrear(pid) {
    let c = this._cadenas.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-registro-verifactu-v1', eslabones: [], indice: new Map() };
      this._cadenas.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Lectura directa para otras hojas (no muta): la cadena completa, inmutable.
  cadena(pid) {
    const c = pid ? this._cadenas.get(pid) : null;
    return c ? c.eslabones : [];
  }

  // ── Tools ──
  toolEncadenar(params) { return this._encadenar(params); }
}

module.exports = RegistroVerifactu;
