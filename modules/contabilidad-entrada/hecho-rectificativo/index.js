/**
 * contabilidad-entrada/hecho-rectificativo — PUENTE STATELESS (A13, hoja del plan).
 *
 * Conecta el hecho POSTERIOR que corrige/anula uno anterior POR CLAVE NATURAL.
 * Invariante 3: **el original NO se borra; la correccion SUMA** (append-only).
 * Este puente no muta el asiento original: emite la RECTIFICACION (un enlace
 * Hecho↔Hecho) que el libro apilara. Uno de los cuatro planos de correccion, ligados
 * por mapa canonico (conflicto 3 resuelto) — TRES actos, no uno.
 *
 * La clave natural la da clave-natural (M3) POR EVENTO; nunca se cablea una forma.
 * Si no se puede determinar el objetivo (la clave a la que rectifica), NO se inventa
 * el enlace: se declara `emparejado:false` con su motivo. Un puente no impone; no pisa
 * lo manual.
 *
 * Invariantes:
 *  - `borra_original:false` SIEMPRE: la correccion se anade, jamas sustituye.
 *  - Sin objetivo determinable no hay enlace inventado (declarado, no fabricado).
 *  - `tipo` RECTIFICA vs ANULA se DERIVA del hecho (o se declara); no se asume.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A13 del plan-construccion y diseno-oop.md (CLASE HechoRectificativo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tipos de rectificacion (declarables): corrige o anula. Derivado, nunca cableado el valor.
const TIPOS = new Set(['RECTIFICA', 'ANULA']);

class HechoRectificativo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'hecho-rectificativo';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onEmparejarRequest(e) {
    return this._atender(e, 'emparejar', 'hecho-rectificativo.emparejar.response', async (d) => {
      const res = await this._emparejar(d);
      if (res.status === 200 && res.data.emparejado) {
        // Exito → evento de dominio: la rectificacion quedo emparejada (append-only).
        this.eventBus?.publish('contabilidad.hecho_rectificado', {
          project_id: res.data.project_id,
          enlace: res.data.enlace,
          rectificativo_clave: res.data.enlace.rectificativo_clave,
          original_clave: res.data.enlace.original_clave,
          tipo: res.data.enlace.tipo,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        this.eventBus?.publish('hecho-rectificativo.emparejar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion: emparejar(rect) → Enlace<Hecho, Hecho> ──
  async _emparejar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    const rect = input.rectificativo || input.rectificado || input.rect;
    if (!rect || typeof rect !== 'object') return this._invalid('rectificativo');

    // Clave natural del hecho rectificativo (declarada o calculada por M3, POR EVENTO).
    let clave_rect = rect.clave_natural != null ? String(rect.clave_natural) : null;
    let origen_clave = clave_rect ? 'declarada' : null;
    if (!clave_rect) {
      const r = await this._rpc('clave-natural.calcular.request',
        { project_id: pid, hecho: rect }, { timeout_ms: 4000 });
      const cd = r && r.data ? r.data : null;
      if (cd && cd.clave != null) { clave_rect = String(cd.clave); origen_clave = 'clave-natural'; }
    }

    // A QUE rectifica: declarado (rectifica_a / original.clave_natural) o calculado del original.
    const original = input.original && typeof input.original === 'object' ? input.original : null;
    let objetivo = input.rectifica_a != null ? String(input.rectifica_a)
      : (rect.rectifica_a != null ? String(rect.rectifica_a)
        : (original && original.clave_natural != null ? String(original.clave_natural) : null));
    if (!objetivo && original) {
      const r = await this._rpc('clave-natural.calcular.request',
        { project_id: pid, hecho: original }, { timeout_ms: 4000 });
      const cd = r && r.data ? r.data : null;
      if (cd && cd.clave != null) objetivo = String(cd.clave);
    }

    // Sin objetivo determinable: NO se inventa el enlace (se declara).
    if (!objetivo) {
      return {
        status: 200,
        data: {
          project_id: pid,
          emparejado: false,
          enlace: null,
          motivo: 'no se pudo determinar el hecho original (clave natural no declarada ni disponible)'
        }
      };
    }

    // Tipo DERIVADO del hecho (o declarado); default honesto = RECTIFICA.
    const tipo = this._tipo(input.tipo != null ? input.tipo : rect.tipo_rectificacion);

    // EL ENLACE: append-only. El original NO se borra; la correccion SUMA.
    const enlace = {
      original_clave: objetivo,
      rectificativo_clave: clave_rect,
      tipo,
      borra_original: false,
      anade: true,
      append_only: true,
      motivo: input.motivo != null ? String(input.motivo) : (rect.motivo != null ? String(rect.motivo) : null),
      original: original ? { clave_natural: objetivo } : null,
      rectificativo: { clave_natural: clave_rect },
      emparejado_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        emparejado: true,
        enlace,
        origen_clave,
        // El puente NO muta: declara que el original queda intacto.
        original_mutado: false
      }
    };
  }

  _tipo(raw) {
    const t = raw != null ? String(raw).toUpperCase() : 'RECTIFICA';
    return TIPOS.has(t) ? t : 'RECTIFICA';
  }

  // ── Tools ──
  toolEmparejar(params) { return this._emparejar(params); }
}

module.exports = HechoRectificativo;
