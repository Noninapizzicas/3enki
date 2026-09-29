/**
 * contabilidad-entrada/lote-admision — REFLEJO STATELESS (A9, hoja del plan).
 *
 * DESACOPLE DEL CUELLO: la admision de hechos no se serializa. Parte una entrada de N
 * hechos en LOTES de tamano declarable, cada uno con su `hecho_id` estable, para que se
 * admitan EN PARALELO.
 *
 * Invariantes:
 *  - DETERMINISTA: misma entrada + mismo tamano → EXACTAMENTE los mismos lotes, con los
 *    mismos ids y el mismo orden. No hay azar, ni reloj, ni estado.
 *  - El hecho_id es estable (sello de la posicion + la clave del hecho): reprocesar la
 *    misma entrada da los mismos ids.
 *  - No se pierde ni se inventa nada: la union de los lotes es exactamente la entrada.
 *  - Tamano no declarado o invalido → 1 (sin lote no hay desacople; se declara `tamano_declarado:false`).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A9 del plan-construccion y diseno-oop.md (CLASE LoteAdmision).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class LoteAdmision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'lote-admision';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onAdmitirRequest(e) {
    return this._atender(e, 'admitir', 'lote-admision.admitir.response', async (d) => {
      const res = this._admitir(d);
      if (res.status !== 200) this.eventBus?.publish('lote-admision.admitir.failed', res);
      return res;
    });
  }

  // ── Fire-and-forget del flujo: cada hecho normalizado entra como lote de uno ──
  onHechoNormalizado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return this._admitir({
      project_id: d.project_id,
      hechos: d.hecho ? [d.hecho] : [],
      tamano_lote: d.tamano_lote,
      correlation_id: d.correlation_id
    });
  }

  // ── proyeccion determinista: admitir(entrada) → Flujo<Lote> ──
  _admitir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La entrada: lista de hechos, o un hecho suelto.
    const hechos = Array.isArray(input.hechos)
      ? input.hechos
      : (input.hecho && typeof input.hecho === 'object' ? [input.hecho] : null);
    if (!hechos) return this._invalid('hechos');
    if (hechos.some(h => !h || typeof h !== 'object')) return this._invalid('hechos[i]');

    // Tamano DECLARABLE. Sin declarar o invalido → 1, y se declara en la salida.
    const tamano_declarado = Number.isInteger(input.tamano_lote) && input.tamano_lote > 0;
    const tamano = tamano_declarado ? input.tamano_lote : 1;

    const total_lotes = Math.ceil(hechos.length / tamano);
    const lotes = [];
    for (let i = 0; i < total_lotes; i++) {
      const rebanada = hechos.slice(i * tamano, (i + 1) * tamano);
      const items = rebanada.map((h, j) => {
        const pos = i * tamano + j;
        // hecho_id ESTABLE: sello de la posicion + la clave natural del hecho (si la trae).
        const clave = this._claveDe(h);
        return {
          pos,
          hecho_id: this._sello(`${pid}|${pos}|${clave || ''}`),
          clave,
          hecho: h,
          en_abierto: this._enAbierto(h)
        };
      });
      lotes.push({
        indice: i,
        lote_id: this._sello(`${pid}|lote|${i}|${tamano}`),
        tamano: items.length,
        items
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        total_hechos: hechos.length,
        tamano,
        tamano_declarado,
        total_lotes,
        lotes,
        // La union de los lotes ES la entrada: nada se pierde ni se inventa.
        cubre_entrada: lotes.reduce((n, l) => n + l.items.length, 0) === hechos.length
      }
    };
  }

  _claveDe(h) {
    if (h.clave_natural !== undefined && h.clave_natural !== null && h.clave_natural !== '') {
      return String(h.clave_natural);
    }
    return null;
  }

  // Campos que el hecho trae abiertos (null), si los declara. Nada se estima.
  _enAbierto(h) {
    if (!Array.isArray(h.abierto)) return [];
    return h.abierto.map(String);
  }

  // Sello estable y corto (determinista, sin reloj ni azar).
  _sello(semilla) {
    return crypto.createHash('sha1').update(semilla, 'utf8').digest('hex').slice(0, 16);
  }

  toolAdmitir(params) { return this._admitir(params); }
}

module.exports = LoteAdmision;
