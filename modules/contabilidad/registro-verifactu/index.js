/**
 * contabilidad/registro-verifactu — CUSTODIO APPEND-ONLY ENCADENADO (D8, hoja del plan).
 *
 * REGISTRO INTERNO Y NO ALTERABLE DE LA FACTURACION. La invariante del asiento
 * (que no se borra) aplicada a Verifactu (RD 1007/2023):
 *   - cada registro lleva la HUELLA (hash) del registro ANTERIOR → cadena;
 *   - los registros NO SE BORRAN ni se REESCRIBEN: solo crece (append-only);
 *   - verificarCadena() recalcula la cadena entera y declara ERROR_CADENA_ROTA
 *     si un solo eslabon no cuadra: la prueba de que nada se toco.
 *
 * Tres cosas distintas, NUNCA una: la EMISION de la factura (O1,
 * emision-factura-venta), el FORMATO estructurado (D9, factura-electronica) y
 * este REGISTRO (D8). Aqui no se emite ni se formatea: se ANOTA la huella.
 *
 * CUSTODIO (patron real): store en memoria (secuencia append-only de registros +
 * ultimo eslabon de la cadena); PosPersistencia (storage
 * /contabilidad/registro-verifactu/*.json); restaura en project.activated; flush
 * en onUnload. GUARD de un solo escritor: el escritor autorizado de la parcela es
 * EMISION_FACTURA (el emisor O1) — cualquier otro rol se rechaza con
 * ERROR_DOS_ESCRITORES; un intento de BORRAR o REESCRIBIR se rechaza con
 * ERROR_REGISTRO_INMUTABLE.
 *
 * Fire-and-forget: contabilidad.factura_emitida (O1 publica cada factura) → se
 * anota su huella SIN que nadie la pida (la factura NACE registrada).
 *
 * Emisor/par de fallo: exito publica contabilidad.registro_verifactu_anotado;
 * error su par determinista.
 * NO REUTILIZA: Verifactu no existe en el inventario (0 modulos); es requisito
 * legal de la factura emitida.
 *
 * Ver hoja D8 del diseno-oop y bloque `registro-verifactu` de la espina enki-plan.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol UNICO autorizado a anotar la parcela (el emisor de la factura, O1).
const ROL_ESCRITOR_REGISTRO = 'EMISION_FACTURA';

// Codigos simbolicos deterministas de los cerrojos (clase D8).
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';
const CODE_REGISTRO_INMUTABLE = 'ERROR_REGISTRO_INMUTABLE';
const CODE_CADENA_ROTA = 'ERROR_CADENA_ROTA';

// Eslabon GENESIS de la cadena (no hay registro anterior).
const HUELLA_GENESIS = 'GENESIS';

class RegistroVerifactu extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'registro-verifactu';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, registros: [], por_clave: {},
    //   ultimo_hash, escritor }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'registro-verifactu.json',
      dir: '/contabilidad/registro-verifactu',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && Array.isArray(data.registros)) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la cadena de registros del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onAnotarRequest(e) {
    return this._atender(e, 'anotar', 'contabilidad.registro.anotar.response', async (d) => {
      const res = this._anotarEntrada(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.registro_verifactu_anotado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.registro.anotar.failed', res);
      }
      return res;
    });
  }

  onVerificarRequest(e) {
    return this._atender(e, 'verificar', 'contabilidad.registro.verificar.response', async (d) => {
      const res = this._verificarCadenaEntrada(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.registro.verificar.failed', res);
      return res;
    });
  }

  // Fire-and-forget: el emisor (O1) emitio una factura → se ANOTA su huella.
  // La factura NACE registrada: no se pide, se deja constancia.
  onFacturaEmitida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._anotar({
      project_id: d.project_id,
      rol: ROL_ESCRITOR_REGISTRO,
      factura: d.factura_emitida || d.factura || d,
      correlation_id: d.correlation_id
    });
    if (res.status === 200) {
      this.eventBus?.publish('contabilidad.registro_verifactu_anotado', {
        ...res.data,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('contabilidad.registro.anotar.failed', res);
    }
    return res;
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = {
        esquema: 'contabilidad-registro-verifactu-v1',
        registros: [],
        por_clave: {},
        ultimo_hash: HUELLA_GENESIS,
        escritor: ROL_ESCRITOR_REGISTRO
      };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor (D8): solo EMISION_FACTURA anota.
  _verificarEscritorUnico(rol) {
    if (String(rol || '').toUpperCase() !== ROL_ESCRITOR_REGISTRO) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'el registro Verifactu tiene UN escritor: solo EMISION_FACTURA anota', {
          escritor_vigente: ROL_ESCRITOR_REGISTRO,
          rol_intentado: String(rol || '').toUpperCase() || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  _claveDe(factura) {
    if (!factura || typeof factura !== 'object') return null;
    return factura.id_factura || factura.clave_natural || factura.numero
      ? String(factura.id_factura || factura.clave_natural || factura.numero)
      : null;
  }

  // Contenido de la huella: los campos del registro FACTURACION (los datos
  // fiscales de la factura + el eslabon anterior). Determinista.
  _contenidoRegistro(factura, huellaAnterior) {
    return JSON.stringify({
      anterior: huellaAnterior,
      id_factura: (factura && (factura.id_factura || factura.numero)) || null,
      serie: (factura && factura.serie) || null,
      numero: (factura && factura.numero) || null,
      fecha_emision: (factura && (factura.fecha_emision || factura.fecha)) || null,
      nif: (factura && factura.nif) || null,
      total: (factura && (factura.total !== undefined ? factura.total
        : (factura.desglose && factura.desglose.total))) || null,
      clave_natural: (factura && factura.clave_natural) || null
    });
  }

  // encadenar(factura) -> Huella: hash del contenido + la huella ANTERIOR.
  _encadenar(factura, huellaAnterior) {
    const contenido = this._contenidoRegistro(factura, huellaAnterior);
    return crypto.createHash('sha256').update(contenido).digest('hex');
  }

  async _anotarEntrada(input) {
    return this._anotar(input);
  }

  // anotar(factura, huella) — APPEND-ONLY: solo crece; nunca borra ni reescribe.
  // Reanotar la MISMA factura es idempotente: devuelve el registro original.
  _anotar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const factura = (input && (input.factura || input.registro)) || null;
    if (!factura || typeof factura !== 'object') return this._invalid('factura');

    const clave = this._claveDe(factura);
    if (!clave) return this._invalid('factura.id_factura');

    const d = this._obtenerOCrear(pid);

    // APPEND-ONLY + idempotente: si la factura ya consta, NO se reescribe.
    if (d.por_clave[clave]) {
      return {
        status: 200,
        data: {
          project_id: pid,
          registro: d.por_clave[clave],
          reusado: true,
          append_only: true,
          nota: 'la factura ya consta en el registro: el registro NO se reescribe, solo crece'
        }
      };
    }

    // HUELLA ENCADENADA: el hash incorpora la huella del registro ANTERIOR.
    const huellaAnterior = d.ultimo_hash || HUELLA_GENESIS;
    const huella = this._encadenar(factura, huellaAnterior);

    const registro = {
      secuencia: d.registros.length + 1,
      id_factura: clave,
      tipo: 'ALTA',
      huella,
      huella_anterior: huellaAnterior,
      encadenado: true,
      factura: {
        id_factura: (factura.id_factura) || null,
        serie: (factura.serie) || null,
        numero: (factura.numero) || null,
        fecha_emision: (factura.fecha_emision || factura.fecha) || null,
        nif: (factura.nif) || null,
        total: (factura.total !== undefined ? factura.total
          : (factura.desglose && factura.desglose.total)) !== undefined
          ? (factura.total !== undefined ? factura.total : (factura.desglose && factura.desglose.total))
          : null
      },
      anotado_por: ROL_ESCRITOR_REGISTRO,
      anotado_en: new Date().toISOString(),
      borrable: false,
      reescribible: false
    };

    d.registros.push(registro);
    d.por_clave[clave] = registro;
    d.ultimo_hash = huella;
    d.updated_at = registro.anotado_en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        registro,
        huella,
        huella_anterior: huellaAnterior,
        encadenado: true,
        reusado: false,
        append_only: true,
        n_registros: d.registros.length
      }
    };
  }

  // verificarCadena() -> ok | ERROR_CADENA_ROTA: recalcula la cadena entera.
  _verificarCadena(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);

    let anterior = HUELLA_GENESIS;
    for (let i = 0; i < d.registros.length; i++) {
      const r = d.registros[i];
      const esperada = this._encadenar(r.factura, anterior);
      if (r.huella_anterior !== anterior || r.huella !== esperada) {
        return {
          status: 409,
          error: {
            code: CODE_CADENA_ROTA,
            message: `la cadena se rompe en el registro ${r.secuencia}: la huella no cuadra`,
            details: {
              secuencia: r.secuencia,
              id_factura: r.id_factura,
              huella_esperada_anterior: anterior,
              huella_anterior_registrada: r.huella_anterior,
              huella_esperada: esperada,
              huella_registrada: r.huella,
              simbolico: CODE_CADENA_ROTA,
              ok: false
            }
          }
        };
      }
      anterior = r.huella;
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        ok: true,
        cadena_integra: true,
        n_registros: d.registros.length,
        ultimo_hash: anterior,
        append_only: true,
        determinista: true,
        nota: 'la cadena entera recalcula e cuadra: nada se toco'
      }
    };
  }

  async _verificarCadenaEntrada(input) {
    return this._verificarCadena(input);
  }

  // listar() -> secuencia completa de registros (solo lectura).
  _listar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);
    return {
      status: 200,
      data: {
        project_id: pid,
        registros: d.registros,
        n_registros: d.registros.length,
        ultimo_hash: d.ultimo_hash,
        append_only: true
      }
    };
  }

  // borrar/reescribir → SIEMPRE rechazado: el registro es inmutable (Verifactu).
  _rechazarMutacion(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    return this._errorResponse(409, CODE_REGISTRO_INMUTABLE,
      'el registro Verifactu es APPEND-ONLY: no se reescribe ni se borra', {
        simbolico: CODE_REGISTRO_INMUTABLE,
        operacion_intentada: (input && input.operacion) || null,
        nota: 'la invariante del asiento aplicada a Verifactu (RD 1007/2023): cada registro lleva la huella del anterior'
      });
  }

  // ── Tools ──
  toolAnotar(params) { return this._anotar(params); }
  toolEncadenar(params) {
    const pid = params && params.project_id;
    const d = pid ? this._obtenerOCrear(pid) : null;
    const anterior = (d && d.ultimo_hash) || HUELLA_GENESIS;
    return Promise.resolve({
      status: 200,
      data: { huella: this._encadenar(params && (params.factura || params), anterior), huella_anterior: anterior }
    });
  }
  toolVerificarCadena(params) { return this._verificarCadena(params); }
  toolListar(params) { return this._listar(params); }
  toolRechazarMutacion(params) { return this._rechazarMutacion(params); }
}

module.exports = RegistroVerifactu;
