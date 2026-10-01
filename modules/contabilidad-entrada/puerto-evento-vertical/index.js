/**
 * contabilidad-entrada/puerto-evento-vertical — PUENTE (A1, hoja del plan).
 *
 * LA PUERTA. La vertical MANDA y contabilidad se ADAPTA: por aqui entra el HECHO CRUDO
 * ya emitido por una vertical de operacion (una venta, una entrega, un cobro real...).
 * Contabilidad NO produce esos hechos: los RECIBE. Es la cara de ENTRADA del dominio,
 * el punto donde la operacion observada se convierte en materia prima del libro.
 *
 *   · abrir   — la vertical DECLARA el canal por el que mandara hechos (y, si lo trae, su
 *               `contrato` de hecho minimo). Abre la puerta; no inventa contrato.
 *   · recibir — llega UN hecho crudo ya emitido. Se admite TAL CUAL (lo adapta el
 *               normalizador A2, no esta puerta) y se ANUNCIA el hecho de dominio
 *               `contabilidad.hecho_recibido` para que la cadena de entrada arranque.
 *
 * Frontera (A · dependencias): los hechos vienen de FUERA del repo (otra vertical). La
 * escucha de `contabilidad.hecho_recibido` NO se declara aqui: esta puerta la EMITE.
 *
 * Invariante: dato ausente = desconocido. Sin hecho no hay nada que recibir (no se fabrica);
 * el contrato que no venga queda declarado en `abierto`, nunca estimado.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A1 del plan-construccion y diseno-oop.md (CLASE PuertoEventoVertical).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuertoEventoVertical extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-evento-vertical';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC (una linea cada uno, delegan a _atender). CLASE ORDEN → ui_handler ──
  onAbrirRequest(e) {
    return this._atender(e, 'abrir', 'puerto-evento-vertical.abrir.response', async (d) => {
      const res = this._abrir(d);
      if (res.status !== 200) this.eventBus?.publish('puerto-evento-vertical.abrir.failed', res);
      return res;
    });
  }

  onRecibirRequest(e) {
    return this._atender(e, 'recibir', 'puerto-evento-vertical.recibir.response', async (d) => {
      const res = this._recibir(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE (admite el hecho en el dominio), anuncia el HECHO de dominio.
        this.eventBus?.publish('contabilidad.hecho_recibido', {
          project_id: res.data.project_id,
          hecho: res.data.hecho,
          origen: res.data.origen,
          vertical: res.data.vertical,
          recibido_en: res.data.recibido_en,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('puerto-evento-vertical.recibir.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // abrir: la vertical declara el canal (y su contrato de hecho minimo, si lo trae)
  // ══════════════════════════════════════════════════════════════════════
  _abrir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Quien manda: la VERTICAL de origen. Es DECLARADA: sin ella no se sabe quien entra.
    const vertical = input.vertical != null ? String(input.vertical).trim()
      : (input.origen != null ? String(input.origen).trim() : '');
    if (!vertical) return this._invalid('vertical');

    // El CONTRATO de hecho minimo (cuando lo declare la vertical). Ausente → se declara abierto.
    const contrato = (input.contrato && typeof input.contrato === 'object') ? input.contrato : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'puerto-evento-vertical',
        vertical,
        gate_abierta: true,
        contrato,
        // La puerta NO inventa el contrato: si no viene, lo declara (lo fija contrato-hecho-minimo A15).
        contrato_declarado: Boolean(contrato),
        abierto: {
          contrato: contrato ? null
            : 'la vertical no declaro su contrato de hecho minimo: la puerta lo deja abierto (no lo estima)'
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // recibir: llega UN hecho crudo ya emitido → se admite y se anuncia el hecho de dominio
  // ══════════════════════════════════════════════════════════════════════
  _recibir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El HECHO crudo: viene DECLARADO. Sin el NO se fabrica nada (dato ausente = desconocido).
    const hecho = input.hecho !== undefined ? input.hecho
      : (input.evento !== undefined ? input.evento : undefined);
    if (hecho === undefined || hecho === null) return this._invalid('hecho');

    // Quien lo manda (vertical de origen) y el tipo de hecho: declarados, no adivinados.
    const vertical = input.vertical != null ? String(input.vertical).trim()
      : (input.origen != null ? String(input.origen).trim() : null);
    const tipo = input.tipo != null ? String(input.tipo).trim()
      : (hecho && typeof hecho === 'object' && hecho.tipo != null ? String(hecho.tipo) : null);
    const recibido_en = input.recibido_en != null ? String(input.recibido_en) : new Date().toISOString();

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo_puerto: 'puerto-evento-vertical',
        // El hecho entra CRUDO: la puerta lo admite, NO lo normaliza (eso es A2 normalizador-hecho).
        hecho,
        vertical,
        tipo_hecho: tipo,
        origen: vertical,
        recibido_en,
        recibido: true,
        // La vertical manda y contabilidad se adapta: la puerta no reescribe el hecho.
        adaptado: false,
        abierto: {
          vertical: vertical ? null : 'el hecho no declara su vertical de origen (se recibe igual: la puerta no inventa el emisor)'
        }
      }
    };
  }

  // ── Tools ──
  toolAbrir(params) { return this._abrir(params); }
  toolRecibir(params) { return this._recibir(params); }
}

module.exports = PuertoEventoVertical;
