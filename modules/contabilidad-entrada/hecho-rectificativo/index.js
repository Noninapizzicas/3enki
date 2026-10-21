/**
 * contabilidad-entrada/hecho-rectificativo — PUENTE (A13, hoja del plan).
 *
 * Conecta el hecho POSTERIOR que corrige/anula uno ANTERIOR por CLAVE NATURAL.
 *   NO borra: AÑADE.
 * Este es el principio que hace auditable el sistema: el pasado no se reescribe. Un hecho
 * rectificativo NO edita el original — lo APUNTA (por su clave natural) y se declara como
 * la correccion. El original queda donde estaba; el nuevo hecho se apila.
 *
 * Frontera: este puente EMPAREJA (une el hecho posterior con el anterior por clave natural)
 * y ANUNCIA `contabilidad.hecho_rectificado`. Quien ESCRIBE el libro es B2 (escritor-diario,
 * que ESCUCHA este hecho y asienta lo que traiga). El puente NO toca el libro.
 *
 * Invariante: sin clave natural NO hay emparejamiento (no se adivina contra que corrige);
 * el original ausente se declara en `abierto`, nunca se inventa su estado.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated. ORDEN → ui_handler.
 * Ver hoja A13 del plan-construccion y diseno-oop.md (CLASE HechoRectificativo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Acciones declarables de un hecho rectificativo (no son criterios cableados: el hecho las declara).
const ACCIONES = new Set(['CORRIGE', 'ANULA']);

class HechoRectificativo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'hecho-rectificativo';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onEmparejarRequest(e) {
    return this._atender(e, 'emparejar', 'hecho-rectificativo.emparejar.response', async (d) => {
      const res = this._emparejar(d);
      if (res.status === 200) {
        // R2 · el hecho rectificativo ENTRA al dominio → anuncia el HECHO. B2 lo escucha y asienta.
        this.eventBus?.publish('contabilidad.hecho_rectificado', {
          project_id: res.data.project_id,
          rectificativo: res.data.rectificativo,
          clave: res.data.clave,
          accion: res.data.accion,
          asiento: res.data.rectificativo.asiento,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('hecho-rectificativo.emparejar.failed', res);
      }
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): un hecho recibido puede declararse rectificativo ──
  async onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return;
    const hecho = d.hecho || {};
    // Solo se empareja si el hecho SE DECLARA rectificativo (no todo hecho lo es).
    const esRect = d.es_rectificativo === true || hecho.es_rectificativo === true
      || hecho.tipo === 'rectificativo' || hecho.corrige != null;
    if (!esRect) return;
    this._emparejar({ project_id: d.project_id, hecho, clave: hecho.clave_natural, accion: hecho.accion, correlation_id: d.correlation_id });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _emparejar(input) → { status, data }  ·  une posterior con anterior por clave natural
  // ══════════════════════════════════════════════════════════════════════
  _emparejar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = input.hecho !== undefined ? input.hecho : input.rectificativo;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    // La CLAVE NATURAL: la identidad del hecho anterior al que este se refiere. DECLARADA.
    const clave = input.clave != null ? String(input.clave)
      : (hecho.clave_natural != null ? String(hecho.clave_natural)
        : (hecho.clave != null ? String(hecho.clave) : null));

    // Sube (best-effort) al calculador canonico de clave natural para que la confirme. No se espera.
    if (this.eventBus?.publish) {
      this.eventBus.publish('clave-natural.calcular.request', {
        project_id: pid,
        hecho,
        clave,
        correlation_id: input.correlation_id
      });
    }

    // Sin clave natural NO se empareja: no se adivina contra que corrige.
    if (!clave) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'hecho-rectificativo',
          emparejado: false,
          clave: null,
          accion: null,
          rectificativo: { hecho, corrige: null, borra_original: false },
          abierto: { clave: 'el hecho no declara su clave natural: no se empareja (no se adivina contra que corrige)' }
        }
      };
    }

    const accionRaw = input.accion != null ? String(input.accion).toUpperCase().trim()
      : (hecho.accion != null ? String(hecho.accion).toUpperCase().trim() : 'CORRIGE');
    const accion = ACCIONES.has(accionRaw) ? accionRaw : null;

    const rectificativo = {
      hecho,
      clave,
      // El hecho ANTERIOR: apuntado, jamas editado.
      corrige: clave,
      accion,
      asiento: hecho.asiento && typeof hecho.asiento === 'object' ? hecho.asiento : null,
      // NO borra: AÑADE. El original permanece.
      borra_original: false,
      emparejado_en: input.en != null ? String(input.en) : new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'hecho-rectificativo',
        emparejado: true,
        clave,
        accion,
        rectificativo,
        // Quien escribe el libro (B2) reacciona al hecho y asienta lo que traiga.
        escritor: 'escritor-diario',
        abierto: {
          accion: accion ? null : 'la accion del rectificativo no es declarable (CORRIGE|ANULA): queda abierta',
          original: 'el estado del hecho original no se consulta aqui: se apunta y NO se borra'
        }
      }
    };
  }

  // ── Tools ──
  toolEmparejar(params) { return this._emparejar(params); }
}

module.exports = HechoRectificativo;
