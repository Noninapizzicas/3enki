/**
 * contabilidad-libro/asiento-ajuste — PUENTE (B5, hoja del plan).
 *
 * El CAMINO por el que la correccion del ASESOR entra al libro SIN BORRAR. Traza intacta:
 * un ajuste NO edita el asiento equivocado — AÑADE el asiento de correccion y deja el
 * original donde estaba (la correccion es un hecho nuevo, no una reescritura del pasado).
 *
 * Frontera: este puente DA FORMA al ajuste (valida que trae su asiento y su motivo) y
 * ANUNCIA el hecho `contabilidad.ajuste_entrado`. Quien ESCRIBE el libro es B2
 * (escritor-diario) y quien apila la traza es B4 (traza-asiento): ellos ESCUCHAN este
 * hecho. El puente NO toca el libro (respeta el single-writer): no sube un
 * `asentar.request` directo — eso duplicaria el asiento, porque B2 ya reacciona al hecho.
 *
 * Invariante: sin asiento no hay ajuste (no se fabrica el apunte); el motivo ausente se
 * declara en `abierto`, nunca se estima.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated. ORDEN → ui_handler.
 * Ver hoja B5 del plan-construccion y diseno-oop.md (CLASE AsientoAjuste).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AsientoAjuste extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'asiento-ajuste';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onEntrarRequest(e) {
    return this._atender(e, 'entrar', 'asiento-ajuste.entrar.response', async (d) => {
      const res = this._entrar(d);
      if (res.status === 200) {
        // R2 · si el ajuste ENTRA al dominio, anuncia el HECHO. B2 y B4 lo escuchan.
        this.eventBus?.publish('contabilidad.ajuste_entrado', {
          project_id: res.data.project_id,
          ajuste: res.data.ajuste,
          asiento: res.data.asiento,
          por: res.data.por,
          referencia: res.data.referencia,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('asiento-ajuste.entrar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _entrar(input) → { status, data }  ·  da forma al ajuste del asesor (no lo asienta)
  // ══════════════════════════════════════════════════════════════════════
  _entrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El asiento de correccion: DECLARADO por el asesor. Sin el NO se inventa el apunte.
    const asiento = input.asiento !== undefined ? input.asiento
      : (input.ajuste && input.ajuste.asiento ? input.ajuste.asiento : undefined);
    if (!asiento || typeof asiento !== 'object') return this._invalid('asiento');

    // La referencia al asiento corregido: el original NO se toca; se apunta a el.
    const referencia = input.referencia != null ? String(input.referencia)
      : (input.corrige != null ? String(input.corrige) : null);

    const por = input.por != null ? String(input.por).trim() : null;

    const ajuste = {
      asiento,
      // La correccion NO borra: se declara que es un ajuste (se AÑADE al libro).
      corrige: referencia,
      motivo: input.motivo != null ? String(input.motivo) : null,
      por,
      es_ajuste: true,
      // El original permanece: traza intacta.
      borra_original: false,
      en: input.en != null ? String(input.en) : new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'asiento-ajuste',
        ajuste,
        asiento,
        referencia,
        por,
        // Quien escribe el libro (B2) y quien apila la traza (B4) reaccionan al hecho.
        escritores: ['escritor-diario', 'traza-asiento'],
        abierto: {
          motivo: ajuste.motivo ? null : 'el ajuste no declaro motivo (se anota el hueco, no se inventa)',
          por: por ? null : 'el ajuste no declaro quien lo hace',
          referencia: referencia ? null : 'el ajuste no declara a que asiento corrige (el original igual queda intacto)'
        }
      }
    };
  }

  // ── Tools ──
  toolEntrar(params) { return this._entrar(params); }
}

module.exports = AsientoAjuste;
