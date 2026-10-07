/**
 * nichos/perfil-cobro-entrega — CUSTODIO CON PERSISTENCIA (I1, hoja del plan).
 *
 * Guarda el CONTRATO DE PAGO Y ENTREGA declarable por pagador del nicho: las
 * plataformas de cobro aceptadas, el método/momento de entrega de la solución
 * al pagador y el resto de términos del contrato comercial. Es el STORE del
 * perfil de cobro/entrega POR PROYECTO que motor-cobro (E3) y
 * canal-distribucion (E4) consumen.
 *
 * CUSTODIO (patrón real, distinto del reflejo stateless): un solo escritor del
 * store — el CONSTRUCTOR declara el contrato al construir el nicho y el DUEÑO
 * puede declararlo/ajustarlo (guard de rol en _declarar). La lectura (_leer)
 * no muta. Persiste por proyecto con PosPersistencia (storage
 * /prisma/nichos/perfil-cobro-entrega.json), restaura en project.activated y
 * vuelca en onUnload. Emisor/par de fallo en errores.
 *
 * Ver hoja I1 del plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Roles que pueden ser único escritor del store: el CONSTRUCTOR (D1 al
// construir) y el DUEÑO (ajuste comercial). Ambos son el "single-writer".
const ROLES_ESCRITOR = new Set(['CONSTRUCTOR', 'DUEÑO']);

// Plataformas de cobro aceptadas por el contrato ([ABIERTO], declarables por
// evento). El motor las ejecuta de forma agnóstica al proveedor.
const PLATAFORMAS_COBRO = new Set(['efectivo', 'transferencia', 'paypal', 'stripe', 'suscripcion', 'cripto']);

// Formas de entrega de la solución al pagador.
const FORMAS_ENTREGA = new Set(['digital', 'fisico', 'híbrido', 'hibrido']);

// Shape base del contrato de pago/entrega declarable. El constructor/dueño
// declara todo o un subset; cada campo se valida y normaliza sobre este molde.
function perfilVacio() {
  return {
    esquema: 'nichos-perfil-cobro-entrega-v1',
    pagador: null,               // string — identidad del pagador del nicho
    contrato: null,              // { plataforma_cobro, forma_entrega, ... términos }
    updated_at: null,
    declarado_por: null
  };
}

// Normalizador de un número (entero/float) estrictamente positivo, o null.
function numPos(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

class PerfilCobroEntrega extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'perfil-cobro-entrega';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { pagador, contrato, ... } (un estado por proyecto)
    this._perfiles = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'perfil-cobro-entrega.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const p = this._perfiles.get(pid);
        return p ? { project_id: pid, perfil: p } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.perfil) this._perfiles.set(pid, data.perfil);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el perfil de cobro/entrega del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender) ──
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'nichos.perfil.leer.response', d => this._leer(d));
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'nichos.perfil.declarar.response', async (d) => {
      const res = await this._declarar(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.perfil.declarado', {
          project_id: res.data.project_id,
          perfil: res.data.perfil,
          declarado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.perfil.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyección de lectura (NO muta) ──
  _obtenerOCrear(pid) {
    let p = this._perfiles.get(pid);
    if (!p) {
      p = perfilVacio();
      p.pagador = pid; // por defecto el pagador es el proyecto; lo puede ajustar el contrato
      this._perfiles.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  _leer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const p = this._obtenerOCrear(pid);
    return { status: 200, data: { project_id: pid, perfil: p } };
  }

  // Alias semántico para E3/E4: devuelve el perfil de cobro/entrega del proyecto.
  perfilPagador(pid) {
    if (!pid) return null;
    const p = this._perfiles.get(pid);
    return p && p.contrato ? p : perfilVacio();
  }

  // ── proyección de escritura (el único escritor: CONSTRUCTOR | DUEÑO) ──
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el CONSTRUCTOR o el DUEÑO pueden declarar el contrato.
    if (!ROLES_ESCRITOR.has(input.rol)) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el CONSTRUCTOR o el DUEÑO pueden declarar el contrato de cobro/entrega', {
        roles_esperados: [...ROLES_ESCRITOR], rol_recibido: input.rol
      });
    }

    const contrato = input.contrato;
    if (!contrato || typeof contrato !== 'object') {
      return this._invalid('contrato');
    }

    const actual = this._obtenerOCrear(pid);
    const previo = this._perfiles.get(pid) || perfilVacio();

    // Merge conservador sobre el molde; valida y normaliza cada campo declarable.
    actual.pagador = (contrato.pagador && String(contrato.pagador).trim())
      ? String(contrato.pagador).trim()
      : (previo.pagador || pid);

    let plataforma = String(contrato.plataforma_cobro || '').toLowerCase();
    if (plataforma) {
      if (!PLATAFORMAS_COBRO.has(plataforma)) return this._invalid('contrato.plataforma_cobro');
    } else if (previo.contrato && previo.contrato.plataforma_cobro) {
      plataforma = previo.contrato.plataforma_cobro;
    }

    let formaEntrega = String(contrato.forma_entrega || '').toLowerCase();
    if (formaEntrega) {
      if (formaEntrega === 'híbrido') formaEntrega = 'hibrido';
      if (!FORMAS_ENTREGA.has(formaEntrega)) return this._invalid('contrato.forma_entrega');
    } else if (previo.contrato && previo.contrato.forma_entrega) {
      formaEntrega = previo.contrato.forma_entrega;
    }

    const precio = numPos(contrato.precio) ?? (previo.contrato && previo.contrato.precio);

    actual.contrato = {
      plataforma_cobro: plataforma,
      forma_entrega: formaEntrega,
      precio,
      periodicidad: (contrato.periodicidad && String(contrato.periodicidad).trim())
        ? String(contrato.periodicidad).trim()
        : (previo.contrato && previo.contrato.periodicidad) || null,
      canal_entrega: (contrato.canal_entrega && String(contrato.canal_entrega).trim())
        ? String(contrato.canal_entrega).trim()
        : (previo.contrato && previo.contrato.canal_entrega) || null,
      condiciones: Array.isArray(contrato.condiciones)
        ? contrato.condiciones.map(c => (c && String(c).trim()) ? String(c).trim() : null).filter(Boolean)
        : (previo.contrato && previo.contrato.condiciones) || []
    };

    actual.updated_at = new Date().toISOString();
    actual.declarado_por = input.rol;

    this._perfiles.set(pid, actual);
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, perfil: actual, declarado: true } };
  }

  // ── Tools ──
  toolLeer(params) { return this._leer(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = PerfilCobroEntrega;
