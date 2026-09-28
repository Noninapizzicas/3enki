/**
 * contabilidad/panel-proceso-contable — REFLEJO STATELESS (P1 + P4, hoja del plan).
 *
 * EL LATIDO DEL PROCESO DE ADMISION: que ENTRA, que SE PROCESA, que ESTA EN
 * COLA y que FALLA. Es el "display" del proceso de entrada, no del asiento. La
 * agregacion es DETERMINISTA: misma foto de las fuentes → mismo panel (un test
 * lo afirma). Ademas expone la TASA que PRUEBA la promesa "sin una persona
 * digitando" (P4): proporcion de lo que entra sin intervencion frente a lo que
 * cae a cola. La tasa NO se recalcula aqui: P4 es VISTA de la metrica unica de
 * cobertura (A12, completitud-cobertura) — el panel la LEE.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated —
 * no guarda estado; cada latido entra objeto, sale objeto. Las tres fuentes se
 * leen POR EVENTO (RPC request/response del bus: cola-revision A8.1,
 * historial-proceso-contable P2, completitud-cobertura A12), NUNCA por require
 * cruzado. Contrato TOLERANTE: si una fuente no responde, el panel la marca
 * `no_disponible` y NUNCA fabrica sus cifras — nada de basura por relleno.
 * Pasa ademas a traves de `single-writer`/`frontera-planos` por EVENTO cuando la
 * foto viene del historial ya anotado.
 *
 * Emisor/par de fallo: exito publica contabilidad.panel_latido; error su par
 * determinista. NO REUTILIZA: no existe panel de proceso contable; es el
 * "display" de la entrada.
 *
 * Ver hojas P1/P4 del diseno-oop y bloque `panel-proceso-contable` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Las DOS colas de excepciones por naturaleza (A8.1).
const COLAS = ['ASESOR', 'DUENO'];

// Tipo de entrada del historial (P2) que cuenta como EXCEPCION resuelta.
const TIPO_EXCEPCION_RESUELTA = 'EXCEPCION_RESUELTA';
const TIPO_HECHO_ADMITIDO = 'HECHO_ADMITIDO';

class PanelProcesoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'panel-proceso-contable';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir. Solo la foto en vuelo del latido.
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onLatidoRequest(e) {
    return this._atender(e, 'latido', 'contabilidad.panel.latido.response', async (d) => {
      const res = await this._latido(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.panel_latido', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.panel.latido.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras ──
  // Las tres fuentes se LEEN por EVENTO. null = fuente no disponible (TOLERANTE).
  async _leerFuentes(pid, correlation_id) {
    const [colaA, colaD, historial, cobertura] = await Promise.all([
      this._rpc('contabilidad.excepcion.siguiente.request', { project_id: pid, cola: 'ASESOR', correlation_id }, { timeout_ms: 4000 }),
      this._rpc('contabilidad.excepcion.siguiente.request', { project_id: pid, cola: 'DUENO', correlation_id }, { timeout_ms: 4000 }),
      this._rpc('contabilidad.historial.consultar.request', { project_id: pid, correlation_id }, { timeout_ms: 4000 }),
      this._rpc('contabilidad.cobertura.calcular.request', { project_id: pid, correlation_id }, { timeout_ms: 4000 })
    ]);
    return { colaA, colaD, historial, cobertura };
  }

  // latido() -> Panel {queEntra, queSeProcesa, queEstaEnCola, queFalla} — determinista.
  async _latido(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const f = await this._leerFuentes(pid, input && input.correlation_id);

    // Fuentes no disponibles: se declaran, NO se rellenan.
    const no_disponibles = [];
    if (!f.colaA || f.colaA.status !== 200) no_disponibles.push('cola-revision');
    if (!f.historial || f.historial.status !== 200) no_disponibles.push('historial-proceso-contable');
    if (!f.cobertura || f.cobertura.status !== 200) no_disponibles.push('completitud-cobertura');

    const colas = this._colas(f.colaA, f.colaD);
    const hist = this._historial(f.historial);
    const cob = this._cobertura(f.cobertura);

    const panel = {
      project_id: pid,
      // que ENTRA: los hechos admitidos y el total del historial del proceso.
      queEntra: { hechos_admitidos: hist.admitidos, total_anotado: hist.total },
      // que SE PROCESA: lo que salio de la cola por via propia (sin intervencion).
      queSeProcesa: { excepciones_resueltas: hist.resueltas, tasa_cobertura: cob.tasa },
      // que ESTA EN COLA: cabeza pendiente por cola (nunca se bloquea: espera).
      queEstaEnCola: {
        ASESOR: colas.ASESOR.pendiente,
        DUENO: colas.DUENO.pendiente,
        total_pendiente: (colas.ASESOR.pendiente ? 1 : 0) + (colas.DUENO.pendiente ? 1 : 0),
        nunca_bloquea: true
      },
      // que FALLA: los huecos de cobertura (lo esperado que no llego).
      queFalla: { huecos: cob.huecos, senal_cobertura: cob.senal },
      tasa_cobertura: this._tasaCobertura({ cobertura: cob, colas }),
      fuentes: { colas, historial: hist, cobertura: cob },
      fuentes_no_disponibles: no_disponibles,
      determinista: true,
      display_del_proceso: true
    };

    return { status: 200, data: panel };
  }

  _colas(colaA, colaD) {
    const leer = (resp) => {
      const d = (resp && resp.status === 200 && resp.data) || null;
      if (!d) return { pendiente: null, vacia: null, disponible: false };
      return {
        pendiente: d.vacia === false,
        vacia: d.vacia === true,
        excepcion: d.excepcion || null,
        disponible: true
      };
    };
    return { ASESOR: leer(colaA), DUENO: leer(colaD), colas: COLAS };
  }

  _historial(resp) {
    const d = (resp && resp.status === 200 && resp.data) || null;
    if (!d) return { total: null, admitidos: null, resueltas: null, disponible: false };
    const entradas = Array.isArray(d.entradas) ? d.entradas : [];
    return {
      total: Number.isFinite(d.total) ? d.total : entradas.length,
      admitidos: entradas.filter((x) => x && x.tipo === TIPO_HECHO_ADMITIDO).length,
      resueltas: entradas.filter((x) => x && x.tipo === TIPO_EXCEPCION_RESUELTA).length,
      disponible: true
    };
  }

  _cobertura(resp) {
    const d = (resp && resp.status === 200 && resp.data) || null;
    if (!d) return { esperados: null, recibidos: null, huecos: null, tasa: null, senal: null, disponible: false };
    return {
      esperados: d.esperados,
      recibidos: d.recibidos,
      huecos: d.huecos,
      tasa: d.tasa,
      senal: d.senal,
      sin_actividad: d.sin_actividad === true,
      disponible: true
    };
  }

  // tasaCobertura() -> Tasa (P4, vista de la metrica unica A12 — NO se recalcula).
  _tasaCobertura(input) {
    const cob = (input && input.cobertura) || {};
    const colas = (input && input.colas) || {};
    const hayCola = cob.disponible !== false && cob.tasa !== null && cob.tasa !== undefined;
    const pendientes = ((colas.ASESOR && colas.ASESOR.pendiente) ? 1 : 0)
      + ((colas.DUENO && colas.DUENO.pendiente) ? 1 : 0);

    // Sin cobertura disponible NO se finge la tasa: se declara.
    const tasa = hayCola
      ? (cob.sin_actividad ? 0 : this._round(cob.tasa, 4))
      : null;

    return {
      tasa,
      fuente: 'completitud-cobertura',
      es_vista_de_metrica_unica: true,
      recalcula: false,
      esperados: cob.esperados !== undefined ? cob.esperados : null,
      recibidos: cob.recibidos !== undefined ? cob.recibidos : null,
      colas_ocupadas: pendientes,
      sin_actividad: cob.sin_actividad === true,
      promesa: 'sin una persona digitando',
      disponible: hayCola,
      nota: hayCola ? 'P4 es VISTA de la metrica unica A12; no la recalcula' : 'cobertura no disponible: la tasa NO se estima'
    };
  }

  // ── Tools ──
  toolLatido(params) { return this._latido(params); }
  toolTasaCobertura(params) { return this._tasaCobertura(params); }
}

module.exports = PanelProcesoContable;
