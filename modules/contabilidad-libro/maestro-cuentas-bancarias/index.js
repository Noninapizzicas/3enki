/**
 * contabilidad-libro/maestro-cuentas-bancarias — CUSTODIO CON PERSISTENCIA (E11, hoja del plan).
 *
 * Parcela DECLARABLE de las CUENTAS BANCARIAS del negocio y su MONEDA. **Un negocio → N
 * cuentas.** Sin este maestro, "el banco" es un numero falso: no hay contra que conciliar,
 * ni de donde derivar el saldo de tesoreria, ni que cuenta es la que cobra/paga.
 *
 * EL SISTEMA NO LAS INVENTA: las cuentas las DECLARA el dueno/asesor. Este modulo jamas
 * fabrica una cuenta ni asume una moneda: la moneda de cada cuenta es un ParametroDeclarable
 * (si no viene, queda `null` = desconocida, no se estima).
 *
 * UN SOLO ESCRITOR: solo el camino de declaracion (rol DECLARACION_CUENTA) asienta cuentas;
 * cualquier otro rol es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - `listar` NO muta: lectura determinista del maestro (orden estable por id de cuenta).
 *  - `declarar` es UPSERT declarativo: una cuenta con el mismo id se ACTUALIZA (el dueno
 *    corrige), y se guarda el historial de cambios; nunca se borra en silencio.
 *  - Nada cableado: ninguna lista de bancos, ningun pais, ningun IBAN de ejemplo, ninguna
 *    moneda por defecto. Todo entra como dato declarado.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja E11 del plan-construccion y diseno-oop.md (CLASE MaestroCuentasBancarias).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor: la declaracion de cuentas la hace el dueno/asesor.
const ROL_ESCRITOR = 'DECLARACION_CUENTA';

class MaestroCuentasBancarias extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'maestro-cuentas-bancarias';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, cuentas: Map<id_cuenta, Cuenta>, orden: [id, ...] }
    this._maestros = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'maestro-cuentas-bancarias.json',
      dir: '/contabilidad/maestro-cuentas-bancarias',
      snapshot: (pid) => {
        const m = this._maestros.get(pid);
        if (!m) return null;
        return { project_id: pid, esquema: m.esquema, cuentas: [...m.cuentas.values()], orden: m.orden };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const cuentas = new Map();
        const orden = [];
        for (const c of (data.cuentas || [])) {
          if (!c || c.id_cuenta == null) continue;
          cuentas.set(String(c.id_cuenta), c);
          orden.push(String(c.id_cuenta));
        }
        this._maestros.set(pid, {
          esquema: data.esquema || 'contabilidad-maestro-cuentas-bancarias-v1',
          cuentas,
          orden: Array.isArray(data.orden) ? data.orden.map(String) : orden
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el maestro de cuentas bancarias del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'maestro-cuentas-bancarias.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: una cuenta bancaria quedo declarada/actualizada.
        this.eventBus?.publish('contabilidad.cuenta_bancaria_declarada', {
          project_id: res.data.project_id,
          cuenta: res.data.cuenta,
          id_cuenta: res.data.cuenta.id_cuenta,
          moneda: res.data.cuenta.moneda,
          actualizada: res.data.actualizada,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('maestro-cuentas-bancarias.declarar.failed', res);
      }
      return res;
    });
  }

  onListarRequest(e) {
    return this._atender(e, 'listar', 'maestro-cuentas-bancarias.listar.response', async (d) => {
      const res = this._listar(d);
      if (res.status !== 200) this.eventBus?.publish('maestro-cuentas-bancarias.listar.failed', res);
      return res;
    });
  }

  // ── proyeccion de lectura (NO muta): listar() → Set<IdCuenta> (+ detalle) ──
  _listar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const maestro = this._obtenerOCrear(pid);
    // Orden estable declarado (orden de alta) — determinista.
    const cuentas = maestro.orden
      .map(id => maestro.cuentas.get(id))
      .filter(Boolean)
      .map(c => ({
        id_cuenta: c.id_cuenta,
        moneda: c.moneda,                            // ParametroDeclarable; null = desconocida
        banco: c.banco != null ? c.banco : null,
        alias: c.alias != null ? c.alias : null,
        cuenta_contable: c.cuenta_contable != null ? c.cuenta_contable : null,
        activa: c.activa !== false
      }));

    return {
      status: 200,
      data: {
        project_id: pid,
        total: cuentas.length,
        ids: cuentas.map(c => c.id_cuenta),
        cuentas
      }
    };
  }

  // ── proyeccion de escritura (UN escritor): declarar/actualizar una cuenta ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el dueno/asesor declara cuentas.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el dueno/asesor (DECLARACION_CUENTA) declara cuentas bancarias',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const c = input.cuenta || input.c;
    if (!c || typeof c !== 'object') return this._invalid('cuenta');

    const id_cuenta = c.id_cuenta != null ? String(c.id_cuenta).trim()
      : (c.iban != null ? String(c.iban).trim() : '');
    if (!id_cuenta) return this._invalid('cuenta.id_cuenta');

    const maestro = this._obtenerOCrear(pid);
    const existente = maestro.cuentas.get(id_cuenta) || null;
    const ahora = new Date().toISOString();

    const cuenta = existente || {
      id_cuenta,
      creada_en: ahora,
      historial: []
    };

    // Campos declarables. Ausente/vacio = desconocido (null) — jamas se estima.
    cuenta.moneda = c.moneda != null && String(c.moneda).trim() !== '' ? String(c.moneda).trim().toUpperCase() : null;
    cuenta.banco = c.banco != null && String(c.banco).trim() !== '' ? String(c.banco).trim() : null;
    cuenta.alias = c.alias != null && String(c.alias).trim() !== '' ? String(c.alias).trim() : null;
    cuenta.cuenta_contable = c.cuenta_contable != null && String(c.cuenta_contable).trim() !== ''
      ? String(c.cuenta_contable).trim() : null;
    cuenta.activa = c.activa !== false;
    cuenta.actualizada_en = ahora;

    cuenta.historial = Array.isArray(cuenta.historial) ? cuenta.historial : [];
    cuenta.historial.push({
      moneda: cuenta.moneda,
      banco: cuenta.banco,
      activa: cuenta.activa,
      en: ahora,
      por: ROL_ESCRITOR
    });

    maestro.cuentas.set(id_cuenta, cuenta);
    if (!maestro.orden.includes(id_cuenta)) maestro.orden.push(id_cuenta);
    maestro.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        cuenta,
        actualizada: Boolean(existente),
        total_cuentas: maestro.cuentas.size
      }
    };
  }

  _obtenerOCrear(pid) {
    let m = this._maestros.get(pid);
    if (!m) {
      m = { esquema: 'contabilidad-maestro-cuentas-bancarias-v1', cuentas: new Map(), orden: [] };
      this._maestros.set(pid, m);
      this._persist.marcarDirty(pid);
    }
    return m;
  }

  // Lectura directa del maestro (mismo proceso) — no muta. Lo consumen E4/E5 por via de evento.
  cuentasDe(pid) {
    const m = pid ? this._maestros.get(pid) : null;
    return m ? m.orden.map(id => m.cuentas.get(id)).filter(Boolean) : [];
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolListar(params) { return this._listar(params); }
}

module.exports = MaestroCuentasBancarias;
