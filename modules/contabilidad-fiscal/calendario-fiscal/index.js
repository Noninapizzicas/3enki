/**
 * contabilidad-fiscal/calendario-fiscal — CUSTODIO CON PERSISTENCIA (D6, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * LA LEY ENTRA COMO DATO. Parcela de PLAZOS DECLARABLES.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Los plazos/obligaciones fiscales (modelo, periodo, fecha limite, periodicidad, importe) se
 * DECLARAN; NUNCA se cablean. Ni una fecha, ni un modelo, ni una periodicidad vive en el
 * codigo: el calendario de un negocio concreto es DATO del negocio, no una constante nuestra.
 *
 *   · declarar  — ESCRIBE un plazo declarable (ORDEN) → anuncia el HECHO y dispara el aviso
 *                 proactivo subiendo motor-avisos.producir.request (K2).
 *   · proximos  — PREGUNTA (por el bus): los plazos declarados que caen en la ventana pedida.
 *
 * UN SOLO ESCRITOR de la parcela (este custodio). APPEND-ONLY: nada se borra; re-declarar el
 * mismo plazo (misma clave) APILA su estado. Persiste por proyecto con PosPersistencia,
 * restaura en project.activated y vuelca en onUnload.
 *
 * Invariante (honestidad): sin FECHA LIMITE declarada no se inventa el plazo (dato ausente =
 * desconocido). El `modelo` es DATO declarable, no una lista cableada: puede venir cualquiera.
 *
 * R3 (honestidad de la escucha): el plan declara escucha de `contabilidad.perfil_administrativo_declarado`
 * (perfil-administrativo D11), pero ese modulo AUN NO EXISTE en el repo → NO se declara.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + single-writer + append-only.
 * Ver hoja D6 del plan-construccion y diseno-oop.md (CLASE CalendarioFiscal).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class CalendarioFiscal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'calendario-fiscal';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, plazos: Map<clave, Plazo>, historial:[append-only] }
    this._calendarios = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'calendario-fiscal.json',
      dir: '/contabilidad/calendario-fiscal',
      snapshot: (pid) => {
        const c = this._calendarios.get(pid);
        if (!c) return null;
        return { project_id: pid, esquema: c.esquema, plazos: [...c.plazos.values()], historial: c.historial };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const plazos = new Map();
        for (const p of (data.plazos || [])) if (p && p.clave != null) plazos.set(String(p.clave), p);
        this._calendarios.set(pid, {
          esquema: data.esquema || 'contabilidad-calendario-fiscal-v1',
          plazos,
          historial: Array.isArray(data.historial) ? data.historial : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el calendario del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC: declarar (ORDEN → ui_handler panel) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'calendario-fiscal.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: un plazo quedo declarado (la ley entro como dato).
        this.eventBus?.publish('contabilidad.plazo_declarado', {
          project_id: res.data.project_id,
          clave: res.data.plazo.clave,
          modelo: res.data.plazo.modelo,
          periodo: res.data.plazo.periodo,
          fecha_limite: res.data.plazo.fecha_limite,
          periodicidad: res.data.plazo.periodicidad,
          estado: res.data.plazo.estado,
          correlation_id: d.correlation_id
        });
        // AVISO PROACTIVO: sube (best-effort por EVENTO) la produccion del aviso a K2.
        this.eventBus?.publish('motor-avisos.producir.request', {
          project_id: res.data.project_id,
          tipo: 'plazo',
          titulo: `plazo fiscal: ${res.data.plazo.modelo || 'modelo'} ${res.data.plazo.periodo || ''}`.trim(),
          detalle: `vence ${res.data.plazo.fecha_limite}${res.data.plazo.periodicidad ? ' (' + res.data.plazo.periodicidad + ')' : ''}`,
          severidad: 'info',
          origen: 'calendario-fiscal',
          ref: res.data.plazo.clave,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('calendario-fiscal.declarar.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC: proximos (PREGUNTA → sin ui_handler; su cara es el bus) ──
  onProximosRequest(e) {
    return this._atender(e, 'proximos', 'calendario-fiscal.proximos.response', (d) => {
      const res = this._proximos(d);
      // PREGUNTA: no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('calendario-fiscal.proximos.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _declarar(input) → Plazo (UNICO ESCRITOR del calendario)
  // ══════════════════════════════════════════════════════════════════════
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El MODELO y la FECHA LIMITE son DATO. Sin fecha limite NO se inventa el plazo.
    const fecha_limite = this._fecha(input.fecha_limite != null ? input.fecha_limite : input.vence);
    if (!fecha_limite) return this._invalid('fecha_limite');

    const cal = this._obtenerOCrear(pid);
    const modelo = input.modelo != null ? String(input.modelo) : null;
    const periodo = input.periodo != null ? String(input.periodo) : null;
    const periodicidad = input.periodicidad != null ? String(input.periodicidad) : null;
    const clave = input.clave != null ? String(input.clave)
      : this._clave(modelo, periodo, fecha_limite);
    const ahora = new Date().toISOString();

    const existente = cal.plazos.get(clave) || null;
    const plazo = existente || {
      clave,
      modelo: null,
      periodo: null,
      periodicidad: null,
      fecha_limite: null,
      importe: null,
      historial: []
    };
    if (modelo != null) plazo.modelo = modelo;
    if (periodo != null) plazo.periodo = periodo;
    if (periodicidad != null) plazo.periodicidad = periodicidad;
    plazo.fecha_limite = fecha_limite;
    if (input.importe != null) {
      const n = Number(input.importe);
      plazo.importe = Number.isFinite(n) ? n : null;
    }
    // El estado es DECLARADO (no cableado); por defecto 'declarado' (un hecho, no una opinion).
    plazo.estado = input.estado != null ? String(input.estado) : (existente ? existente.estado : 'declarado');
    plazo.declarado_en = ahora;
    // No se pisa en silencio: re-declarar el mismo plazo APILA su estado.
    plazo.historial = Array.isArray(plazo.historial) ? plazo.historial : [];
    plazo.historial.push({ fecha_limite: plazo.fecha_limite, estado: plazo.estado, importe: plazo.importe, en: ahora });

    cal.plazos.set(clave, plazo);
    cal.historial.push({ clave, accion: existente ? 'redeclarado' : 'declarado', en: ahora });
    cal.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'calendario-fiscal',
        plazo,
        declarado: true,
        total: cal.plazos.size,
        append_only: true,
        abierto: {
          modelo: plazo.modelo ? null : 'el plazo no declaro modelo (se anota el hueco, no se cablea)',
          importe: plazo.importe != null ? null : 'el plazo no declaro importe (dato ausente = desconocido)'
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // _proximos(input) → plazos en la ventana (PREGUNTA, no muta)
  // ══════════════════════════════════════════════════════════════════════
  _proximos(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const cal = this._calendarios.get(pid);
    const todos = cal ? [...cal.plazos.values()] : [];

    const desde = this._fecha(input.desde) || null;
    const hasta = this._fecha(input.hasta) || null;
    const modelo = input.modelo != null ? String(input.modelo) : null;

    let plazos = todos;
    if (modelo) plazos = plazos.filter((p) => p.modelo === modelo);
    plazos = plazos.filter((p) => {
      if (desde && p.fecha_limite < desde) return false;
      if (hasta && p.fecha_limite > hasta) return false;
      return true;
    });
    plazos = plazos.slice().sort((a, b) => (a.fecha_limite < b.fecha_limite ? -1 : a.fecha_limite > b.fecha_limite ? 1 : 0));

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'calendario-fiscal',
        ventana: { desde, hasta },
        plazos,
        total: plazos.length,
        total_calendario: todos.length,
        // Sin plazos declarados NO se inventa el calendario: se declara el hueco.
        abierto: todos.length ? null : { calendario: 'no hay plazos declarados todavia (la ley entra como dato)' }
      }
    };
  }

  // Normaliza una fecha a 'YYYY-MM-DD'. Invalida → null (no se inventa una fecha).
  _fecha(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  _clave(modelo, periodo, fecha) {
    return `${modelo || 'modelo'}|${periodo || 'periodo'}|${fecha}`;
  }

  _obtenerOCrear(pid) {
    let c = this._calendarios.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-calendario-fiscal-v1', plazos: new Map(), historial: [] };
      this._calendarios.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Lectura directa (mismo proceso) — no muta.
  plazosDe(pid) {
    const c = pid ? this._calendarios.get(pid) : null;
    return c ? [...c.plazos.values()] : [];
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
  toolProximos(params) { return this._proximos(params); }
}

module.exports = CalendarioFiscal;
