/**
 * nichos/perfil-supervision — CUSTODIO CON PERSISTENCIA (H2, hoja del plan).
 *
 * Guarda el PERFIL DE SUPERVISIÓN por proyecto: cadencia de pulso y límites
 * declarables de la supervisión del nicho. Lo consumen el canal de supervisión
 * (G1) y el monitor/pulso para decidir cuándo y cómo avisar al dueño.
 *
 * CUSTODIO (patrón real, distinto del reflejo stateless): un solo escritor del
 * store — el DUEÑO declara la cadencia/límites (guard de rol). La lectura
 * (_leer) no muta. Persiste por proyecto con PosPersistencia (storage
 * /prisma/nichos/perfil-supervision.json), restaura en project.activated y
 * vuelca en onUnload. Emisor/par de fallo en errores.
 *
 * Ver hoja H2 del plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol único escritor — el DUEÑO. El canal y el monitor son solo lectores.
const ROL_DUENYO = 'DUEÑO';

// Cadencias de pulso de supervision declarables ([ABIERTO]).
const CADENCIAS = new Set(['diaria', 'semanal', 'quincenal', 'tiempo_real']);

// Shape base del perfil de supervision declarable.
function perfilVacio() {
  return {
    esquema: 'nichos-perfil-supervision-v1',
    cadencia_pulso: null,         // diaria|semanal|quincenal|tiempo_real
    limites: null,                 // { max_alertas_dia, techo_perdida_eur }
    updated_at: null,
    declarado_por: null
  };
}

// Normalizador de un número entero positivo (o null si no trae valor).
function numPos(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

class PerfilSupervision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'perfil-supervision';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> objeto de perfil de supervision
    this._perfiles = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'perfil-supervision.json',
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

  // Restaura el perfil de supervision del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender) ──
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'nichos.supervision.leer.response', d => this._leer(d));
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'nichos.supervision.declarar.response', async (d) => {
      const res = await this._declarar(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.supervision.declarado', {
          project_id: res.data.project_id,
          perfil: res.data.perfil,
          declarado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.supervision.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyección de lectura (NO muta) ──
  _obtenerOCrear(pid) {
    let p = this._perfiles.get(pid);
    if (!p) {
      p = perfilVacio();
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

  // Alias semántico para G1 (canal-supervision): devuelve el perfil de supervision.
  leerPerfil(pid) {
    if (!pid) return null;
    return this._perfiles.get(pid) || perfilVacio();
  }

  // ── proyección de escritura (el único escritor: DUEÑO) ──
  _declarar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el DUEÑO puede declarar el perfil de supervision.
    if (input.rol !== ROL_DUENYO) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el DUEÑO puede declarar el perfil de supervisión', {
        rol_esperado: ROL_DUENYO, rol_recibido: input.rol
      });
    }

    const perfil = input.perfil;
    if (!perfil || typeof perfil !== 'object') {
      return this._invalid('perfil');
    }

    const actual = this._obtenerOCrear(pid);
    const previo = this._perfiles.get(pid) || perfilVacio();

    // Merge conservador sobre el molde; valida y normaliza cada campo declarable.
    if (perfil.cadencia_pulso != null && perfil.cadencia_pulso !== '') {
      const cad = String(perfil.cadencia_pulso).toLowerCase();
      if (!CADENCIAS.has(cad)) return this._invalid('perfil.cadencia_pulso');
      actual.cadencia_pulso = cad;
    } else if (previo.cadencia_pulso != null) {
      actual.cadencia_pulso = previo.cadencia_pulso;
    }

    if (perfil.limites && typeof perfil.limites === 'object') {
      const max_alertas_dia = numPos(perfil.limites.max_alertas_dia);
      const techo_perdida_eur = numPos(perfil.limites.techo_perdida_eur);
      if (max_alertas_dia == null && techo_perdida_eur == null) {
        return this._invalid('perfil.limites');
      }
      actual.limites = {
        max_alertas_dia: max_alertas_dia ?? (previo.limites && previo.limites.max_alertas_dia) ?? null,
        techo_perdida_eur: techo_perdida_eur ?? (previo.limites && previo.limites.techo_perdida_eur) ?? null
      };
    } else if (previo.limites) {
      actual.limites = previo.limites;
    }

    actual.updated_at = new Date().toISOString();
    actual.declarado_por = ROL_DUENYO;

    this._perfiles.set(pid, actual);
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, perfil: actual, declarado: true } };
  }

  // ── Tools ──
  toolLeer(params) { return this._leer(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = PerfilSupervision;
