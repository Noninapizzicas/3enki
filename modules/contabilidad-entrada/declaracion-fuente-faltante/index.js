/**
 * contabilidad-entrada/declaracion-fuente-faltante — PUENTE (A15, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * DETECTA que una vertical NO publica un hecho necesario **y lo DECLARA**. NO la obliga
 * a producirlo: no inventa los datos que faltan ni fabrica el hecho ausente.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * CIRCULO:
 *   señal (fuente que se sabe esperada pero no llego, o hecho observado sin su fuente)
 *      → declaracion-fuente-faltante.declarar  (DECLARA — no rellena)
 *      → aviso (motor-avisos.producir)  para que el negocio lo vea
 *   y ademas el hecho `contabilidad.fuente_faltante_declarada` (lo lee motor-avisos).
 *
 * Honestidad (invariante 13): SIN señal NO se inventa una declaracion. Si nada declara
 * que falte una fuente, se devuelve ABIERTO (nada que declarar) — una fuente "faltante"
 * inventada seria una acusacion falsa a la vertical.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia. RPC declarar = ORDEN → ui_handler.
 * Ver hoja A15 del plan-construccion y diseno-oop.md (CLASE DeclaracionFuenteFaltante).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class DeclaracionFuenteFaltante extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'declaracion-fuente-faltante';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'declaracion-fuente-faltante.declarar.response', (d) => {
      const res = this._declarar(d);
      if (res.status === 200 && res.data && res.data.declarada) {
        // R2 · si DECLARA (escribe una declaracion), anuncia el HECHO.
        this.eventBus?.publish('contabilidad.fuente_faltante_declarada', {
          project_id: res.data.project_id,
          vertical: res.data.declaracion.vertical,
          fuente: res.data.declaracion.fuente,
          motivo: res.data.declaracion.motivo,
          declaracion_id: res.data.declaracion.declaracion_id,
          correlation_id: d.correlation_id
        });
        // SUBE la señal al motor de avisos (best-effort por EVENTO; no se cablea la entrega).
        this.eventBus?.publish('motor-avisos.producir.request', {
          project_id: res.data.project_id,
          tipo: 'fuente',
          severidad: 'warn',
          titulo: `Fuente faltante: ${res.data.declaracion.fuente}`,
          detalle: res.data.declaracion.motivo,
          origen: 'declaracion-fuente-faltante',
          ref: res.data.declaracion.declaracion_id,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        this.eventBus?.publish('declaracion-fuente-faltante.declarar.failed', res);
      }
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): un hecho llego sin su fuente declarada ──
  // NO rellena el hueco: si el hecho DECLARA que su fuente falta, se declara.
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    const h = d.hecho && typeof d.hecho === 'object' ? d.hecho : null;
    if (!h) return;
    const fuente = h.fuente_faltante != null ? h.fuente_faltante
      : (h.fuente == null && h.fuente_esperada != null ? h.fuente_esperada : null);
    if (!fuente) return; // el hecho no declara fuente faltante → no se inventa la acusacion
    try {
      const res = this._declarar({
        project_id: d.project_id || this.project_id,
        vertical: h.vertical || d.vertical || d.origen,
        fuente,
        motivo: h.motivo || 'el hecho llego sin su fuente declarada',
        ref: h.clave != null ? String(h.clave) : (h.id != null ? String(h.id) : null),
        correlation_id: d.correlation_id
      });
      if (res.status === 200 && res.data && res.data.declarada) {
        this.eventBus?.publish('contabilidad.fuente_faltante_declarada', {
          project_id: res.data.project_id,
          vertical: res.data.declaracion.vertical,
          fuente: res.data.declaracion.fuente,
          motivo: res.data.declaracion.motivo,
          declaracion_id: res.data.declaracion.declaracion_id,
          correlation_id: d.correlation_id
        });
      }
    } catch (err) {
      this.logger?.error(`${this.name}.hecho_recibido.error`, { error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // _declarar(input) → { status, data }  ·  DECLARA la fuente faltante (no la crea)
  // ══════════════════════════════════════════════════════════════════════
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const fuente = input.fuente != null ? String(input.fuente).trim()
      : (input.fuente_esperada != null ? String(input.fuente_esperada).trim() : null);
    if (!fuente) {
      // Sin fuente señalada NO se inventa la declaracion.
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'declaracion-fuente-faltante',
          declarada: false,
          declaracion: null,
          abierto: { fuente: 'no se señaló qué fuente falta: no se inventa una declaracion (nada que declarar)' }
        }
      };
    }

    const declaracion = {
      declaracion_id: `ff_${pid}_${Date.now().toString(36)}`,
      vertical: input.vertical != null ? String(input.vertical) : (this.project_id || null),
      fuente,
      // POR QUE se declara: el motivo declarado; si no lo hay, se declara el hueco.
      motivo: input.motivo != null ? String(input.motivo) : null,
      ref: input.ref != null ? String(input.ref) : null,
      // NO se obliga a la vertical: la declaracion es informativa, no un requerimiento.
      obliga: false,
      declarada_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'declaracion-fuente-faltante',
        declaracion,
        declarada: true,
        // La fuente NO se crea aqui: solo se declara su ausencia.
        creada_fuente: false,
        abierto: { motivo: declaracion.motivo ? null : 'la declaracion no declaro motivo (se anota el hueco, no se inventa)' }
      }
    };
  }

  // ── Tools ──
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = DeclaracionFuenteFaltante;
