/**
 * contabilidad-fiscal/acceso-nomina — CUSTODIO CON PERSISTENCIA (G7, hoja del plan).
 *
 * Gobernanza de QUIÉN VE QUÉ nómina: cada uno ve la suya. UN escritor.
 * Complementa I4 (eje persona). La parcela se DECLARA por empleado; el módulo no
 * inventa una política por defecto, la aplica (y sin política declarada responde abierto).
 *
 * Invariantes:
 *  - El DEFAULT es `propio`: cada empleado ve su nómina; ver la de otro exige declararlo.
 *  - Dato ausente = desconocido: sin regla declarada, `autorizado:null` (no true) — un acceso
 *    que no consta NO se concede por silencio.
 *  - No se borra: re-declarar APPENDEA al historial de la regla; el vigente queda con su fecha.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + UN escritor.
 * Ver hoja G7 del plan-construccion y diseno-oop.md (CLASE AccesoNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class AccesoNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'acceso-nomina';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, reglas: Map<empleado_id, Regla> }
    this._accesos = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'acceso-nomina.json',
      dir: '/contabilidad/acceso-nomina',
      snapshot: (pid) => {
        const a = this._accesos.get(pid);
        if (!a) return null;
        return { project_id: pid, esquema: a.esquema, reglas: [...a.reglas.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const reglas = new Map();
        for (const r of (data.reglas || [])) {
          if (r && r.empleado_id != null) reglas.set(String(r.empleado_id), r);
        }
        this._accesos.set(pid, { esquema: data.esquema || 'contabilidad-acceso-nomina-v1', reglas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura las reglas de acceso del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC: autorizar (PREGUNTA → sin ui_handler; su cara es el bus) ──
  onAutorizarRequest(e) {
    return this._atender(e, 'autorizar', 'acceso-nomina.autorizar.response', async (d) => {
      const res = this._autorizar(d);
      // PREGUNTA: no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('acceso-nomina.autorizar.failed', res);
      return res;
    });
  }

  // ── handler RPC: declarar (ORDEN → ui_handler panel) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'acceso-nomina.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: quedo declarada la regla de acceso de una nómina.
        this.eventBus?.publish('contabilidad.acceso_nomina_declarado', {
          project_id: res.data.project_id,
          empleado_id: res.data.regla.empleado_id,
          regla: res.data.regla,
          declarado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('acceso-nomina.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion PREGUNTA: autorizar(quien, sobre quien) ──
  _autorizar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const empleado_id = input.empleado_id != null ? String(input.empleado_id).trim() : '';
    if (!empleado_id) return this._invalid('empleado_id');

    const solicitante = input.solicitante != null ? String(input.solicitante).trim()
      : (input.rol != null ? String(input.rol).trim() : '');

    const acceso = this._accesos.get(pid);
    const regla = acceso ? (acceso.reglas.get(empleado_id) || null) : null;

    // DEFAULT declarado del dominio: cada uno ve la suya.
    if (!regla) {
      const propio = solicitante !== '' && solicitante === empleado_id;
      return {
        status: 200,
        data: {
          project_id: pid,
          empleado_id,
          solicitante: solicitante || null,
          autorizado: propio ? true : null,
          motivo: propio ? 've su propia nomina (default propio)' : 'sin regla declarada: el acceso no consta',
          regla_declarada: false,
          abierto: propio ? null : { regla: 'no se declaro regla de acceso para este empleado' }
        }
      };
    }

    const quien_puede_ver = Array.isArray(regla.quien_puede_ver) ? regla.quien_puede_ver : [];
    const autorizado = quien_puede_ver.includes(solicitante);
    return {
      status: 200,
      data: {
        project_id: pid,
        empleado_id,
        solicitante: solicitante || null,
        autorizado,
        motivo: autorizado ? 'está declarado en quien_puede_ver' : 'no está declarado en quien_puede_ver',
        regla_declarada: true,
        regla,
        abierto: null
      }
    };
  }

  // ── proyeccion ORDEN (UN escritor): declarar la regla de acceso de un empleado ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const empleado_id = input.empleado_id != null ? String(input.empleado_id).trim() : '';
    if (!empleado_id) return this._invalid('empleado_id');

    // Quien puede ver esta nómina: lista declarada (el propio empleado siempre puede).
    const quien_puede_ver = Array.isArray(input.quien_puede_ver)
      ? input.quien_puede_ver.map((x) => String(x)).filter(Boolean)
      : [];
    if (!quien_puede_ver.includes(empleado_id)) quien_puede_ver.push(empleado_id);

    const acceso = this._obtenerOCrear(pid);
    const existente = acceso.reglas.get(empleado_id) || null;
    const ahora = new Date().toISOString();

    const regla = existente || {
      empleado_id,
      quien_puede_ver: [],
      declarado_en: null,
      historial: []
    };
    regla.quien_puede_ver = quien_puede_ver;
    regla.declarado_en = ahora;
    regla.historial = Array.isArray(regla.historial) ? regla.historial : [];
    // No se borra: re-declarar apila el estado anterior en el historial.
    regla.historial.push({ quien_puede_ver: [...quien_puede_ver], en: ahora });

    acceso.reglas.set(empleado_id, regla);
    acceso.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        regla,
        declarado: true,
        abierto: null
      }
    };
  }

  _obtenerOCrear(pid) {
    let a = this._accesos.get(pid);
    if (!a) {
      a = { esquema: 'contabilidad-acceso-nomina-v1', reglas: new Map() };
      this._accesos.set(pid, a);
      this._persist.marcarDirty(pid);
    }
    return a;
  }

  // ── Tools ──
  toolAutorizar(params) { return this._autorizar(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = AccesoNomina;
