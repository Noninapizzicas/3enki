/**
 * nichos/vista-portafolio — CUSTODIO CON PERSISTENCIA (K1, hoja del plan).
 *
 * Cruza la SALUD de TODOS los nichos/módulos en una VISTA AGREGADA de
 * portafolio para el jefe: cuantos nichos estan en cada estado de salud del
 * pipeline, cuantos GENERA/SANGRA/NEUTRO, y el total en caja. Es el dashboard
 * que responde 'como va todo' sin mirar nicho a nicho.
 *
 * HIBRIDO CUSTODIO (patrón real de perfil-supervision):
 *   _agregarSalud   — REFLEJO: cruza una salud (F3) recibida contra el store y
 *                     regenera la VistaPortafolio (pura).
 *   _guardarVista   — CUSTODIO: persiste la vista agregada en el store.
 *   _leer           — lectura (no muta): DashboardJefe.
 * Escucha nichos.salud.actualizada (F3) y re-agrega/guarda cada vez.
 * PosPersistencia per-proyecto (/prisma/nichos/vista-portafolio.json).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Shape base de la vista agregada de portafolio.
function vistaVacia() {
  return {
    esquema: 'nichos-vista-portafolio-v1',
    total_nichos: 0,
    en_caja: 0,
    salud: {
      GENERA: 0,
      SANGRA: 0,
      NEUTRO: 0
    },
    por_estado: {},
    actualizada_en: null
  };
}

class VistaPortafolio extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'vista-portafolio';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> VistaPortafolio
    this._vistas = new Map();
    // estado auxiliar para re-agregar: project_id -> Map<nicho, salud>
    this._salud = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'vista-portafolio.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const v = this._vistas.get(pid);
        return v ? { project_id: pid, vista: v } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.vista) this._vistas.set(pid, data.vista);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la vista del portafolio del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers ──
  onLeerRequest(e) {
    return this._atender(e, 'leer', 'nichos.vista.leer.response', (d) => this._leer(d));
  }

  onGuardarRequest(e) {
    return this._atender(e, 'guardar', 'nichos.vista.guardar.response', async (d) => {
      const res = await this._guardarVista(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.vista_portafolio', this._payloadVista(res));
      } else {
        this.eventBus?.publish('nichos.vista.guardar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: cuadro-salud-financiera emite salud de un nicho → re-agrega y guarda.
  async onSaludActualizada(e) {
    const d = (e && e.data) || e || {};
    const res = await this._guardarVista({ project_id: d.project_id, nicho: d.nicho, salud_extra: d.salud || d.estado_salud || d.tipo_salud });
    if (res.status === 200) {
      this.eventBus?.publish('nichos.vista_portafolio', this._payloadVista(res));
    }
    return res;
  }

  _payloadVista(res) {
    return { project_id: res.data.project_id, vista: res.data.vista, totales: res.data.vista.total_nichos };
  }

  // ── REFLEJO (pura): cruza la salud de un nicho y regenera la vista agregada ──
  _agregarSalud(pid, v, nicho, salud) {
    if (!nicho) return v;
    const s = salud || 'NEUTRO';
    const val = ['GENERA', 'SANGRA', 'NEUTRO'].includes(s) ? s : 'NEUTRO';
    // Reemplaza/agrega la salud declarada de ese nicho (un nicho solo tiene una salud vigente).
    v.salud[val] = (v.salud[val] || 0) + 1;
    if (val === 'GENERA') v.en_caja += 1;
    v.por_estado[nicho] = val;
    return v;
  }

  _vistaDesdeSalud(pid) {
    const v = vistaVacia();
    v.actualizada_en = new Date().toISOString();
    const saludMap = this._salud.get(pid) || new Map();
    saludMap.forEach((s, nicho) => this._agregarSalud(pid, v, nicho, s));
    v.total_nichos = saludMap.size;
    return v;
  }

  // ── CUSTODIO: persiste la vista del portafolio ──
  _guardarVista(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    if (input.salud_extra) {
      const saludMap = this._salud.get(pid) || new Map();
      saludMap.set(input.nicho, input.salud_extra);
      this._salud.set(pid, saludMap);
    }
    const vista = this._vistaDesdeSalud(pid);
    this._vistas.set(pid, vista);
    this._persist.marcarDirty(pid);
    return { status: 200, data: { project_id: pid, vista, totales: vista.total_nichos } };
  }

  // ── lectura (no muta): DashboardJefe ──
  _leer(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const v = this._vistas.get(pid) || this._vistaDesdeSalud(pid);
    if (!this._vistas.has(pid)) this._vistas.set(pid, v); // cache
    return { status: 200, data: { project_id: pid, vista: v, dashboard_jefe: true } };
  }

  // ── Tools ──
  toolLeer(params) { return this._leer(params); }
  toolGuardarVista(params) { return this._guardarVista(params); }
}

module.exports = VistaPortafolio;
