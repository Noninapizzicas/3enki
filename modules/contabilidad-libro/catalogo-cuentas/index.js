/**
 * contabilidad-libro/catalogo-cuentas — CUSTODIO CON PERSISTENCIA (B1, hoja del plan).
 *
 * Plan contable declarable/importable del asesor. UN escritor.
 *
 * ⚠️ ESTE ES EL MÓDULO CUYO `anadir` ESCRIBÍA SIN ANUNCIAR (una de las causas de la cadena
 * cortada en el intento anterior). R2: `anadir` ESCRIBE → DEBE anunciar el HECHO. Aquí SÍ se
 * publica `contabilidad.plan_cuentas_declarado` al añadir una cuenta; sin ese hecho, quien
 * depende del plan (contrapartida-asistida) nunca se enteraba de que el plan cambió.
 *
 * Invariantes:
 *  - `anadir` es ESCRITURA → anuncia `contabilidad.plan_cuentas_declarado` (el plan cambió).
 *  - `buscar` es PREGUNTA → no anuncia hecho.
 *  - El código es la identidad declarada de la cuenta: sin código NO se añade.
 *  - No se duplica ni se pisa en silencio: re-añadir una cuenta APPENDEA al historial de la cuenta.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + UN escritor.
 * Ver hoja B1 del plan-construccion y diseno-oop.md (CLASE CatalogoCuentas).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

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
        return { project_id: pid, esquema: c.esquema, cuentas: [...c.cuentas.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const cuentas = new Map();
        for (const cu of (data.cuentas || [])) {
          if (cu && cu.codigo != null) cuentas.set(String(cu.codigo), cu);
        }
        this._catalogos.set(pid, { esquema: data.esquema || 'contabilidad-catalogo-cuentas-v1', cuentas });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el plan contable del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC: anadir (ORDEN → ui_handler panel) ──
  onAnadirRequest(e) {
    return this._atender(e, 'anadir', 'catalogo-cuentas.anadir.response', async (d) => {
      const res = this._anadir(d);
      if (res.status === 200) {
        // R2 · SI ESCRIBE, ANUNCIA EL HECHO — la causa de la cadena cortada se corrige aquí.
        this.eventBus?.publish('contabilidad.plan_cuentas_declarado', {
          project_id: res.data.project_id,
          codigo: res.data.cuenta.codigo,
          cuenta: res.data.cuenta,
          anadida: true,
          total: res.data.total,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('catalogo-cuentas.anadir.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC: buscar (PREGUNTA → sin ui_handler; su cara es el bus) ──
  onBuscarRequest(e) {
    return this._atender(e, 'buscar', 'catalogo-cuentas.buscar.response', async (d) => {
      const res = this._buscar(d);
      // PREGUNTA: no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('catalogo-cuentas.buscar.failed', res);
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor) ──
  _anadir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const codigo = input.codigo != null ? String(input.codigo).trim() : '';
    if (!codigo) return this._invalid('codigo');

    const cat = this._obtenerOCrear(pid);
    const existente = cat.cuentas.get(codigo) || null;
    const ahora = new Date().toISOString();

    const cuenta = existente || {
      codigo,
      nombre: null,
      tipo: null,
      naturaleza: null,     // deudora | acreedora (declarable) — ausente = desconocido
      padre: null,
      declarado_en: null,
      historial: []
    };
    if (input.nombre != null) cuenta.nombre = String(input.nombre);
    if (input.tipo != null) cuenta.tipo = String(input.tipo);
    if (input.naturaleza != null) cuenta.naturaleza = String(input.naturaleza);
    if (input.padre != null) cuenta.padre = String(input.padre);
    cuenta.declarado_en = ahora;
    cuenta.historial = Array.isArray(cuenta.historial) ? cuenta.historial : [];
    // No se pisa en silencio: re-anadir una cuenta apila su estado.
    cuenta.historial.push({
      nombre: cuenta.nombre,
      tipo: cuenta.tipo,
      naturaleza: cuenta.naturaleza,
      padre: cuenta.padre,
      en: ahora
    });

    cat.cuentas.set(codigo, cuenta);
    cat.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        cuenta,
        anadida: true,
        total: cat.cuentas.size,
        abierto: {
          nombre: cuenta.nombre ? null : 'la cuenta no declaró nombre (se anota el hueco, no se inventa)',
          naturaleza: cuenta.naturaleza ? null : 'la cuenta no declaró naturaleza (deudora/acreedora)'
        }
      }
    };
  }

  // ── proyeccion PREGUNTA (NO muta): buscar cuentas del plan ──
  _buscar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cat = this._catalogos.get(pid);
    const todas = cat ? [...cat.cuentas.values()] : [];

    const codigo = input.codigo != null ? String(input.codigo).trim() : '';
    const prefijo = input.prefijo != null ? String(input.prefijo).trim() : '';
    const texto = input.texto != null ? String(input.texto).toLowerCase().trim() : '';
    const tipo = input.tipo != null ? String(input.tipo).trim() : '';

    let encontradas = todas;
    if (codigo) encontradas = encontradas.filter((c) => c.codigo === codigo);
    if (prefijo) encontradas = encontradas.filter((c) => c.codigo.startsWith(prefijo));
    if (tipo) encontradas = encontradas.filter((c) => c.tipo === tipo);
    if (texto) encontradas = encontradas.filter((c) => String(c.nombre || '').toLowerCase().includes(texto));

    return {
      status: 200,
      data: {
        project_id: pid,
        encontradas,
        total: encontradas.length,
        total_plan: todas.length,
        // Sin plan declarado NO se inventa: se declara el hueco.
        abierto: todas.length ? null : { plan: 'el plan contable no está declarado todavía' }
      }
    };
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

  // Lectura directa del plan (mismo proceso) — no muta.
  cuentasDe(pid) {
    const c = pid ? this._catalogos.get(pid) : null;
    return c ? [...c.cuentas.values()] : [];
  }

  // ── Tools ──
  toolAnadir(params) { return this._anadir(params); }
  toolBuscar(params) { return this._buscar(params); }
}

module.exports = CatalogoCuentas;
