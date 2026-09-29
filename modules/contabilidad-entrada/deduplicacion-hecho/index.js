/**
 * contabilidad-entrada/deduplicacion-hecho — REFLEJO STATELESS (A7, hoja del plan).
 *
 * Aplica la CLAVE NATURAL del hecho/documento (M3, `clave-natural`) → no duplica.
 * Es la cara de entrada del cerrojo anti-bucle: un hecho ya visto no se vuelve a tratar.
 *
 * Invariantes:
 *  - Sin clave natural no hay veredicto: `es_nuevo:null` con `motivo` — no se ASUME nuevo
 *    (asumir "nuevo" es como duplicar) ni se asume duplicado. La clave la da M3.
 *  - Es PURO y sin estado: pregunta la clave por EVENTO y compara con la clave que le dan.
 *    Quien RECUERDA los hechos ya vistos es el custode del diario, no este reflejo.
 *  - Determinista: mismo hecho + misma clave registrada → mismo veredicto, siempre.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A7 del plan-construccion y diseno-oop.md (CLASE DeduplicacionHecho).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class DeduplicacionHecho extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'deduplicacion-hecho';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onEsNuevoRequest(e) {
    return this._atender(e, 'es_nuevo', 'deduplicacion-hecho.es_nuevo.response', async (d) => {
      const res = await this._es_nuevo(d);
      if (res.status !== 200) this.eventBus?.publish('deduplicacion-hecho.es_nuevo.failed', res);
      return res;
    });
  }

  // ── Fire-and-forget del flujo: un hecho normalizado se comprueba contra lo visto ──
  onHechoNormalizado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return this._es_nuevo({
      project_id: d.project_id,
      hecho: d.hecho,
      clave: d.clave_natural,
      claves_vistas: d.claves_vistas,
      correlation_id: d.correlation_id
    });
  }

  // ── proyeccion determinista: es_nuevo(h) → bool | null ──
  async _es_nuevo(input = {}) {
    const hecho = input.hecho || input.h;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // 1) Clave natural: la declarada en la peticion o, por EVENTO, la de M3. NO se inventa.
    let clave = input.clave != null && String(input.clave).trim() !== '' ? String(input.clave).trim() : null;
    let clave_origen = 'declarada';
    let composicion = null;

    if (!clave) {
      const resp = await this._rpc('clave-natural.calcular.request',
        { project_id: pid, hecho, composicion: input.composicion }, { timeout_ms: 4000 });
      const data = resp && resp.data ? resp.data : null;
      if (data && data.clave) {
        clave = String(data.clave);
        clave_origen = 'clave-natural';
        composicion = data.composicion || null;
      }
    }

    if (!clave) {
      // Sin clave natural NO se afirma nada: ni nuevo ni duplicado.
      return {
        status: 200,
        data: {
          project_id: pid,
          es_nuevo: null,
          clave: null,
          clave_origen: null,
          motivo: 'sin clave natural no hay veredicto: no se asume nuevo (asumir nuevo es duplicar)',
          disponible: false
        }
      };
    }

    // 2) Claves ya vistas: SOLO las que el emisor declara como VISTAS. La clave
    // natural del propio hecho NO cuenta como vista: que el hecho traiga su clave no
    // prueba que ya se haya tratado (asumirlo seria no procesar nunca un hecho nuevo).
    const vistas = this._vistas(input.claves_vistas);
    const duplicado = vistas.includes(clave);

    return {
      status: 200,
      data: {
        project_id: pid,
        es_nuevo: !duplicado,
        clave,
        clave_origen,
        composicion,
        vistas_comparadas: vistas.length,
        motivo: duplicado
          ? 'la clave natural ya consta: un hecho = un asiento, no se reprocesa'
          : 'la clave natural no consta: el hecho es nuevo',
        disponible: true
      }
    };
  }

  // Universo de claves vistas que el emisor aporta (lista o mapa clave→valor).
  _vistas(claves) {
    const out = [];
    if (Array.isArray(claves)) {
      for (const c of claves) if (c !== undefined && c !== null && c !== '') out.push(String(c));
    } else if (claves && typeof claves === 'object') {
      for (const c of Object.keys(claves)) out.push(String(c));
    }
    return [...new Set(out)];
  }

  toolEsNuevo(params) { return this._es_nuevo(params); }
}

module.exports = DeduplicacionHecho;
