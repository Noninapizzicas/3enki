/**
 * contabilidad/traza-asiento — CUSTODIO APPEND-ONLY (B4, hoja del plan).
 *
 * REGISTRO INMUTABLE de QUIEN y CUANDO creo cada asiento. Solo crece; nunca se
 * reescribe ni se borra. Es requisito de auditoria y de Verifactu: el asiento
 * original NUNCA se borra, y la traza es la prueba de que existio y de cuando.
 *
 * CUSTODIO append-only (patron real): store en memoria (entradas por clave
 * natural, con el asiento original CONGELADO: la primera entrada manda);
 * PosPersistencia (storage /contabilidad/traza-asiento/*.json); restaura en
 * project.activated; flush en onUnload. GUARD de un solo escritor: el escritor
 * autorizado de la traza es ESCRIBOR_DIARIO — cualquier otro rol (en particular
 * un intento de REESCRIBIR o BORRAR) se rechaza con ERROR_DOS_ESCRITORES y con
 * ERROR_TRAZA_INMUTABLE. Fire-and-forget: contabilidad.asiento_asentado (el
 * diario B2 publica cada asiento) → se anota la traza SIN que nadie la pida.
 *
 * Emisor/par de fallo: exito publica contabilidad.traza_anotada; error su par
 * determinista. Lo consume asiento-ajuste (B5) para verificar que el original
 * sigue en la traza.
 * NO REUTILIZA: la traza del asiento no existe en el inventario.
 *
 * Ver hoja B4 del diseno-oop y bloque `traza-asiento` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol UNICO autorizado a anotar la traza (el escritor del diario).
const ROL_ESCRITOR_TRAZA = 'ESCRITOR_DIARIO';

// Codigos simbolicos deterministas del cerrojo (clase B4).
const CODE_DOS_ESCRITORES = 'ERROR_DOS_ESCRITORES';
const CODE_TRAZA_INMUTABLE = 'ERROR_TRAZA_INMUTABLE';

class TrazaAsiento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'traza-asiento';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, entradas: {}, secuencia: [] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'traza-asiento.json',
      dir: '/contabilidad/traza-asiento',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.entradas) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la traza del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onAnotarRequest(e) {
    return this._atender(e, 'anotar', 'contabilidad.traza.anotar.response', async (d) => {
      const res = this._anotar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.traza_anotada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.traza.anotar.failed', res);
      }
      return res;
    });
  }

  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'contabilidad.traza.consultar.response', async (d) => {
      const res = this._consultar(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.traza.consultar.failed', res);
      return res;
    });
  }

  // Fire-and-forget: escritor-diario (B2) asento un asiento → se anota la traza.
  // La traza NO se pide: se deja constancia en el momento en que el hecho ocurre.
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = this._anotar({
      project_id: d.project_id,
      rol: ROL_ESCRITOR_TRAZA,
      quien: d.asentado_por || ROL_ESCRITOR_TRAZA,
      cuando: d.asentado_en || new Date().toISOString(),
      clave_natural: d.clave_natural || (d.asiento && d.asiento.clave_natural) || null,
      asiento: d.asiento || null,
      correlation_id: d.correlation_id
    });
    if (res.status === 200) {
      this.eventBus?.publish('contabilidad.traza_anotada', {
        ...res.data,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('contabilidad.traza_anotada.failed', res);
    }
    return res;
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-traza-asiento-v1', entradas: {}, secuencia: [], escritor: ROL_ESCRITOR_TRAZA };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // GUARD de un solo escritor: solo ESCRITOR_DIARIO anota. Un segundo escritor
  // (o un intento de reescritura) → ERROR_DOS_ESCRITORES.
  _verificarEscritorUnico(rol) {
    if (String(rol || '').toUpperCase() !== ROL_ESCRITOR_TRAZA) {
      return this._errorResponse(409, CODE_DOS_ESCRITORES,
        'la traza tiene UN escritor: solo el ESCRITOR_DIARIO anota', {
          escritor_vigente: ROL_ESCRITOR_TRAZA,
          rol_intentado: String(rol || '').toUpperCase() || null,
          simbolico: CODE_DOS_ESCRITORES
        });
    }
    return null;
  }

  // anotar(quien, cuando, que) — APPEND-ONLY. Reanotar la MISMA clave NO reescribe:
  // la primera entrada manda (inmutabilidad).
  _anotar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const guard = this._verificarEscritorUnico(input && input.rol);
    if (guard) return guard;

    const clave = (input && input.clave_natural) || (input.asiento && input.asiento.clave_natural) || null;
    if (!clave) return this._invalid('clave_natural');

    const d = this._obtenerOCrear(pid);

    // INMUTABLE: si la clave ya tiene entrada, NO se reescribe ni se borra.
    // Reanotar es idempotente (append-only): devuelve la entrada original congelada.
    if (d.entradas[clave]) {
      return {
        status: 200,
        data: {
          project_id: pid,
          entrada: d.entradas[clave],
          clave_natural: clave,
          reusada: true,
          inmutable: true,
          nota: 'la entrada original se conserva: la traza solo crece, nunca se reescribe'
        }
      };
    }

    const entrada = {
      clave_natural: clave,
      quien: String((input && input.quien) || ROL_ESCRITOR_TRAZA),
      cuando: (input && input.cuando) || new Date().toISOString(),
      que: {
        asiento_id: (input.asiento && input.asiento.id) || (input.que && input.que.asiento_id) || null,
        tipo: (input.asiento && input.asiento.tipo) || (input.que && input.que.tipo) || null,
        debe: (input.asiento && input.asiento.debe) !== undefined ? input.asiento.debe : null,
        haber: (input.asiento && input.asiento.haber) !== undefined ? input.asiento.haber : null,
        apuntes: (input.asiento && input.asiento.apuntes) || null
      },
      secuencia: d.secuencia.length + 1,
      borrable: false,
      reescribible: false,
      anotada_en: new Date().toISOString()
    };
    d.entradas[clave] = entrada;
    d.secuencia.push({ clave_natural: clave, cuando: entrada.cuando, quien: entrada.quien });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        entrada,
        clave_natural: clave,
        reusada: false,
        inmutable: true,
        n_entradas: d.secuencia.length
      }
    };
  }

  // consultar(claveNatural) -> EntradaTraza (o la secuencia completa si no hay clave).
  _consultar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);

    const clave = input && input.clave_natural;
    if (!clave) {
      return {
        status: 200,
        data: { project_id: pid, entradas: Object.values(d.entradas), n: d.secuencia.length, append_only: true }
      };
    }
    const entrada = d.entradas[clave] || null;
    if (!entrada) {
      return {
        status: 200,
        data: { project_id: pid, clave_natural: clave, hallada: false, entrada: null }
      };
    }
    return { status: 200, data: { project_id: pid, clave_natural: clave, hallada: true, entrada } };
  }

  // borrar/reescribir → SIEMPRE rechazado: la traza es inmutable (auditoria).
  // Se expone como tool para que el intento quede cerrado de forma determinista.
  _rechazarMutacion(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    return this._errorResponse(409, CODE_TRAZA_INMUTABLE,
      'la traza es APPEND-ONLY: no se reescribe ni se borra', {
        simbolico: CODE_TRAZA_INMUTABLE,
        operacion_intentada: (input && input.operacion) || null,
        nota: 'el asiento original NUNCA se borra; la correccion SUMA (B5)'
      });
  }

  // ── Tools ──
  toolAnotar(params) { return this._anotar(params); }
  toolConsultar(params) { return this._consultar(params); }
  toolRechazarMutacion(params) { return this._rechazarMutacion(params); }
}

module.exports = TrazaAsiento;
