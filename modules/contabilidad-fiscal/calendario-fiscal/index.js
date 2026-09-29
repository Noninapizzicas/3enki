/**
 * contabilidad-fiscal/calendario-fiscal — CUSTODIO CON PERSISTENCIA (D6, hoja del plan).
 *
 * Parcela de PLAZOS DECLARABLES por ejercicio: que obligacion vence cuando. Desde aqui
 * se dispara el AVISO PROACTIVO de vencimiento (lo consume motor-avisos). NO presenta
 * nada: el sistema AVISA; el ASESOR presenta y firma.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): este modulo NO cablea NINGUNA fecha, NINGUN
 * plazo, NINGUNA periodicidad ni NINGUN festivo. Los plazos son `ParametroDeclarable`
 * (los declara el negocio/asesor, por ejercicio) porque CAMBIAN: prorrogas, festivos,
 * domiciliacion. Tampoco se cablea la VENTANA de aviso (`ventana_dias`): es declarable.
 * Sin ventana declarada NO se dispara aviso proactivo (no se inventa un umbral).
 *
 * Invariante 7: sin plazos declarados para un ejercicio, `proximos` devuelve lista vacia
 * con `declarado:false` y el motivo — NUNCA una lista de fechas de memoria.
 *
 * UN SOLO ESCRITOR: el declarante de plazos (rol DECLARANTE_PLAZOS_FISCALES). Cualquier
 * otro rol es rechazado (403) y no espera ni hace cola. Re-declarar APPENDEA al historial
 * (invariante 3): el plazo vigente queda con su fecha y su autor.
 *
 * Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en
 * onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja D6 del plan-construccion y diseno-oop.md (CLASE CalendarioFiscal).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela: el declarante de plazos (dueño o asesor).
const ROL_ESCRITOR = 'DECLARANTE_PLAZOS_FISCALES';

class CalendarioFiscal extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'calendario-fiscal';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, por_ejercicio: Map<ejercicio, {plazos:[], ventana_dias, ...}>, historial: [] }
    this._calendarios = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'calendario-fiscal.json',
      dir: '/contabilidad/calendario-fiscal',
      snapshot: (pid) => {
        const c = this._calendarios.get(pid);
        if (!c) return null;
        return {
          project_id: pid,
          esquema: c.esquema,
          calendarios: [...c.por_ejercicio.entries()].map(([ejercicio, cal]) => ({ ejercicio, ...cal })),
          historial: c.historial
        };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const por_ejercicio = new Map();
        for (const cal of (data.calendarios || [])) {
          if (!cal || cal.ejercicio == null) continue;
          const { ejercicio, ...resto } = cal;
          por_ejercicio.set(String(ejercicio), resto);
        }
        this._calendarios.set(pid, {
          esquema: data.esquema || 'contabilidad-calendario-fiscal-v1',
          por_ejercicio,
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

  // ── handlers RPC (una linea, delegan a _atender) ──
  onProximosRequest(e) {
    return this._atender(e, 'proximos', 'calendario-fiscal.proximos.response', async (d) => {
      const res = this._proximos(d);
      if (res.status !== 200) {
        this.eventBus?.publish('calendario-fiscal.proximos.failed', res);
        return res;
      }
      // Aviso proactivo: si hay vencimientos dentro de la ventana DECLARADA, se publican.
      for (const vencimiento of res.data.dentro_de_ventana) {
        this.eventBus?.publish('contabilidad.vencimiento_fiscal', {
          project_id: res.data.project_id,
          ejercicio: res.data.ejercicio,
          vencimiento,
          hoy: res.data.hoy,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'calendario-fiscal.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status !== 200) this.eventBus?.publish('calendario-fiscal.declarar.failed', res);
      return res;
    });
  }

  // ── proyeccion de lectura (NO muta): que vence y cuando, segun los plazos DECLARADOS ──
  _proximos(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ejercicio = input.ejercicio != null ? String(input.ejercicio) : null;
    const hoy = input.hoy != null ? String(input.hoy) : null;   // fecha de referencia DECLARADA

    const c = this._calendarios.get(pid);
    const cal = (c && ejercicio != null) ? (c.por_ejercicio.get(ejercicio) || null) : null;

    // Sin plazos declarados: NO se inventan fechas de memoria (invariante 7).
    if (!cal) {
      return {
        status: 200,
        data: {
          project_id: pid,
          ejercicio,
          hoy,
          declarado: false,
          ventana_dias: null,
          total: 0,
          proximos: [],
          dentro_de_ventana: [],
          motivo: 'no hay plazos declarados para este ejercicio (la ley entra como dato, no se cablea)'
        }
      };
    }

    const plazos = Array.isArray(cal.plazos) ? cal.plazos : [];
    const ventana = Number.isFinite(Number(cal.ventana_dias)) ? Number(cal.ventana_dias) : null;

    // Orden determinista por fecha declarada; el resto de campos se copian tal cual.
    const ordenados = [...plazos].sort((a, b) => this._cf(a.fecha, b.fecha));

    // La ventana es DATO declarable: sin ventana declarada NO se marca ningun aviso.
    const dentro = ventana === null ? [] : ordenados.filter(p => {
      const d = this._diasHasta(hoy, p.fecha);
      return d !== null && d >= 0 && d <= ventana;
    });

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio,
        hoy,
        declarado: true,
        ventana_dias: ventana,
        total: ordenados.length,
        proximos: ordenados,
        dentro_de_ventana: dentro,
        // Se declara que no hay umbral declarado: sin el, no hay aviso proactivo.
        aviso_proactivo: ventana !== null,
        motivo: ventana === null ? 'sin ventana_dias declarada no se dispara aviso proactivo' : null
      }
    };
  }

  // ── proyeccion de escritura (UN escritor): el declarante fija los plazos del ejercicio ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el declarante de plazos declara el calendario.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el declarante de plazos (DECLARANTE_PLAZOS_FISCALES) declara el calendario fiscal',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    // El ejercicio es DATO obligatorio (los plazos son por anualidad).
    if (input.ejercicio === undefined || input.ejercicio === null || String(input.ejercicio).trim() === '') {
      return this._invalid('ejercicio');
    }
    const ejercicio = String(input.ejercicio).trim();

    // Los plazos llegan DECLARADOS y se guardan tal cual (con su modelo, fecha y nota).
    // NO se valida contra ninguna tabla legal: no existe.
    const plazos = Array.isArray(input.plazos)
      ? input.plazos.filter(p => p && typeof p === 'object' && p.fecha != null).map(p => {
          const out = {};
          for (const [k, v] of Object.entries(p)) out[k] = v;
          out.fecha = String(p.fecha);
          return out;
        })
      : [];

    // La ventana de aviso es declarable; sin declarar queda null (no se inventa umbral).
    const ventana_dias = Number.isFinite(Number(input.ventana_dias)) ? Number(input.ventana_dias) : null;

    const ahora = new Date().toISOString();
    const c = this._obtenerOCrear(pid);
    const vigente = c.por_ejercicio.get(ejercicio) || null;

    const cal = {
      plazos,
      ventana_dias,
      declarado_por: ROL_ESCRITOR,
      declarado_en: ahora,
      vigente_desde: vigente && vigente.declarado_en ? vigente.declarado_en : ahora
    };
    c.por_ejercicio.set(ejercicio, cal);

    // Re-declarar no borra: se APPENDEA al historial (invariante 3).
    c.historial.push({
      ejercicio,
      plazos: plazos.length,
      ventana_dias,
      por: ROL_ESCRITOR,
      en: ahora
    });
    c.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio,
        calendario: cal,
        declarado: true,
        total_plazos: plazos.length,
        ventana_declarada: ventana_dias !== null
      }
    };
  }

  // Diferencia en dias entre la fecha de referencia y la fecha del plazo (datos declarados).
  _diasHasta(hoy, fecha) {
    if (!hoy || !fecha) return null;
    const a = Date.parse(`${hoy}T00:00:00Z`);
    const b = Date.parse(`${String(fecha)}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  // Comparacion determinista por fecha declarada en texto.
  _cf(a, b) {
    return String(a).localeCompare(String(b));
  }

  _obtenerOCrear(pid) {
    let c = this._calendarios.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-calendario-fiscal-v1', por_ejercicio: new Map(), historial: [] };
      this._calendarios.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Lectura directa para otras hojas del proceso (no muta): plazos vigentes de un ejercicio.
  plazosDe(pid, ejercicio) {
    const c = pid ? this._calendarios.get(pid) : null;
    if (!c || ejercicio == null) return [];
    const cal = c.por_ejercicio.get(String(ejercicio));
    return cal && Array.isArray(cal.plazos) ? cal.plazos : [];
  }

  // ── Tools ──
  toolProximos(params) { return this._proximos(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = CalendarioFiscal;
