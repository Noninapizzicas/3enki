/**
 * contabilidad/acceso-nomina — CUSTODIO (G7, hoja del plan).
 *
 * Aisla la nomina como DATO PERSONAL: cada uno ve la suya. Gobierna el store de
 * PERMISOS (quien puede ver la nomina de quien) — un solo escritor, el DUENO.
 * Este es el eje de aislamiento DENTRO del negocio (persona↔persona), DISTINTO
 * del aislamiento ENTRE negocios (I4, aislamiento-negocio); la dependencia con
 * I4 es por EVENTO, nunca por require cruzado. Dos personas con permisos
 * cruzados se gobiernan aqui; dos negocios con parcelas cruzadas, en I4.
 *
 * CUSTODIO (patron real): un unico escritor del store de permisos — _autorizar
 * valida rol DUENO en guard; _puedeVer es proyeccion PURA de lectura (no muta).
 * Persiste por proyecto con PosPersistencia (storage
 * /contabilidad/acceso-nomina/*.json), restaura en project.activated y vuelca
 * en onUnload. Emisor/par de fallo: exito publica
 * contabilidad.acceso_nomina_autorizado; error su par determinista. NO
 * REUTILIZA: el aislamiento de la nomina como dato personal no existe en el
 * inventario.
 *
 * Ver hoja G7 del diseno-oop y bloque `acceso-nomina` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor del store de permisos (un solo escritor).
const ROL_ESCRITOR = 'DUENO';

class AccesoNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'acceso-nomina';
    this.version = 'reflejo-0.1.0';
    // store en memoria:
    // project_id -> { esquema, permisos: { <empleado>: { empleado, negocio, visores:[...] } }, autorizaciones: [] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'acceso-nomina.json',
      dir: '/contabilidad/acceso-nomina',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.permisos) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los permisos de nomina del proyecto activado (dato personal).
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onAutorizarRequest(e) {
    return this._atender(e, 'autorizar', 'contabilidad.nomina.autorizar.response', async (d) => {
      const res = this._autorizar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.acceso_nomina_autorizado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.nomina.autorizar.failed', res);
      }
      return res;
    });
  }

  onPuede_verRequest(e) {
    return this._atender(e, 'puede_ver', 'contabilidad.nomina.puede_ver.response', async (d) => {
      const res = this._puedeVer(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.nomina.puede_ver.failed', res);
      return res;
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-acceso-nomina-v1', permisos: {}, autorizaciones: [] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // autorizar(rol, empleado, visor, negocio?) — un solo escritor (DUENO).
  // El dato personal de la nomina: se autoriza a QUIEN puede VER la de QUIEN.
  _autorizar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUENO autoriza accesos a la nomina', {
        rol_esperado: ROL_ESCRITOR, rol_recibido: rol
      });
    }

    const empleado = input && (input.empleado || input.id_empleado);
    if (!empleado) return this._invalid('empleado');
    const visor = input && (input.visor || input.id_visor);
    if (!visor) return this._invalid('visor');

    const d = this._obtenerOCrear(pid);
    const p = d.permisos[empleado] || {
      empleado,
      // Eje de aislamiento DENTRO del negocio (persona↔persona, ≠ I4 entre negocios).
      negocio: (input && input.negocio) || null,
      visores: [],
      declarado_en: new Date().toISOString()
    };
    if (input && input.negocio && !p.negocio) p.negocio = input.negocio;

    // Cada uno se ve a si mismo; el DUENO puede autorizar a otros visores.
    if (String(visor) !== String(empleado) && !p.visores.includes(String(visor))) {
      p.visores.push(String(visor));
    }
    p.actualizado_en = new Date().toISOString();
    d.permisos[empleado] = p;
    d.autorizaciones.push({
      empleado: String(empleado), visor: String(visor), autorizado_por: rol,
      autorizado_en: new Date().toISOString()
    });
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, empleado: String(empleado), visor: String(visor), permiso: p, autorizado_por: rol }
    };
  }

  // puedeVer(visor, empleado) -> Bool — proyeccion PURA (no muta).
  // Cada uno ve la suya; los visores autorizados ven la del empleado.
  _puedeVer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const empleado = input && (input.empleado || input.id_empleado);
    if (!empleado) return this._invalid('empleado');
    const visor = input && (input.visor || input.id_visor);
    if (!visor) return this._invalid('visor');

    const d = this._obtenerOCrear(pid);
    const negocioVisor = input && input.negocio_visor;
    const p = d.permisos[empleado];

    // Regla 1: cada uno ve la SUYA (dato personal, sin necesidad de permiso).
    let puede = String(visor) === String(empleado);
    let motivo = puede ? 'PROPIA' : null;

    // Regla 2: un visor autorizado ve la del empleado (mismo negocio — eje persona↔persona).
    if (!puede && p && Array.isArray(p.visores) && p.visores.includes(String(visor))) {
      const mismoNegocio = !negocioVisor || !p.negocio || String(negocioVisor) === String(p.negocio);
      if (mismoNegocio) {
        puede = true;
        motivo = 'AUTORIZADO';
      } else {
        // Fuera del negocio no se ve la nomina de nadie (aislamiento, ≠ consolidacion I4).
        motivo = 'OTRO_NEGOCIO';
      }
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        empleado: String(empleado),
        visor: String(visor),
        puede_ver: puede,
        motivo: motivo || 'SIN_PERMISO',
        regla: 'cada uno ve la suya'
      }
    };
  }

  // ── Tools ──
  toolAutorizar(params) { return this._autorizar(params); }
  toolPuedeVer(params) { return this._puedeVer(params); }
}

module.exports = AccesoNomina;
