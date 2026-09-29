/**
 * contabilidad-libro/catalogo-cuentas — CUSTODIO CON PERSISTENCIA (B1, hoja del plan).
 *
 * Parcela del PLAN CONTABLE declarable/importable del asesor: el conjunto de Cuentas
 * contra el que se resuelve la contrapartida y se valida el libro. UN SOLO ESCRITOR:
 * el escritor del plan (el camino de import = puerto-plan-contable, B6) asienta con su
 * rol; cualquier otro rol es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - Un solo escritor por parcela; el segundo es rechazado.
 *  - La ley entra como DATO: no se cablea ninguna codificacion ni jerarquia legal.
 *  - No se sobrescribe: anadir un codigo ya presente se rechaza (409); el catalogo no
 *    se reescribe en silencio.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja B1 del plan-construccion y diseno-oop.md (CLASE CatalogoCuentas).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de esta parcela: el camino de import del plan (B6).
const ROL_ESCRITOR = 'PUERTO_PLAN_CONTABLE';

class CatalogoCuentas extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'catalogo-cuentas';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, cuentas: Map<codigo, Cuenta> }
    this._catalogos = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'catalogo-cuentas.json',
      dir: '/contabilidad/catalogo-cuentas',
      snapshot: (pid) => {
        const c = this._catalogos.get(pid);
        if (!c) return null;
        return {
          project_id: pid,
          esquema: c.esquema,
          cuentas: [...c.cuentas.values()]
        };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const cuentas = new Map();
        for (const c of (data.cuentas || [])) if (c && c.codigo != null) cuentas.set(String(c.codigo), c);
        this._catalogos.set(pid, { esquema: data.esquema || 'contabilidad-catalogo-cuentas-v1', cuentas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el plan del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onAnadirRequest(e) {
    return this._atender(e, 'anadir', 'catalogo-cuentas.anadir.response', d => this._anadir(d));
  }

  onBuscarRequest(e) {
    return this._atender(e, 'buscar', 'catalogo-cuentas.buscar.response', d => this._buscar(d));
  }

  // ── proyeccion de escritura (UN escritor) ──
  _anadir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el rol del camino de import del plan puede asentar.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor del plan (PUERTO_PLAN_CONTABLE) puede anadir cuentas',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const cuenta = input.cuenta;
    if (!cuenta || typeof cuenta !== 'object') return this._invalid('cuenta');
    const codigo = cuenta.codigo != null ? String(cuenta.codigo).trim() : '';
    if (!codigo) return this._invalid('cuenta.codigo');

    const cat = this._obtenerOCrear(pid);
    if (cat.cuentas.has(codigo)) {
      // No se sobrescribe el plan en silencio.
      return this._errorResponse(409, 'ALREADY_EXISTS',
        'la cuenta ya existe en el plan; el catalogo no se sobrescribe',
        { codigo });
    }

    const asiento = {
      codigo,
      nombre: cuenta.nombre != null ? String(cuenta.nombre) : null,   // ausente → desconocido
      tipo: cuenta.tipo != null ? String(cuenta.tipo) : null,
      naturaleza: cuenta.naturaleza != null ? String(cuenta.naturaleza) : null,
      padre: cuenta.padre != null ? String(cuenta.padre) : null,
      anadida_en: new Date().toISOString()
    };
    cat.cuentas.set(codigo, asiento);
    cat.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, cuenta: asiento, anadida: true } };
  }

  // ── proyeccion de lectura (NO muta) ──
  _buscar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cat = this._obtenerOCrear(pid);
    const codigo = input.codigo != null ? String(input.codigo) : null;

    if (!codigo) {
      return { status: 200, data: { project_id: pid, total: cat.cuentas.size, cuentas: [...cat.cuentas.values()] } };
    }
    const cuenta = cat.cuentas.get(codigo) || null;   // sin match → null (no se inventa)
    return { status: 200, data: { project_id: pid, codigo, encontrada: Boolean(cuenta), cuenta } };
  }

  _obtenerOCrear(pid) {
    let c = this._catalogos.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-catalogo-cuentas-v1', cuentas: new Map() };
      this._catalogos.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Lectura directa para otras hojas (mismo proceso) — no muta.
  planDe(pid) {
    const c = pid ? this._catalogos.get(pid) : null;
    return c ? [...c.cuentas.values()] : [];
  }

  // ── Tools ──
  toolAnadir(params) { return this._anadir(params); }
  toolBuscar(params) { return this._buscar(params); }
}

module.exports = CatalogoCuentas;
