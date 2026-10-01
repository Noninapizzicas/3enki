/**
 * contabilidad-analitica/consolidacion — REFLEJO STATELESS (I3, hoja del plan).
 *
 * ESTADOS DEL CONJUNTO con criterio DECLARADO. Grupo COMPLETO (multi-sociedad).
 * La consolidacion es AL CIERRE.
 *
 * No calcula los estados de cada sociedad por su cuenta: SUBE por EVENTO a quien le toca —
 * `mayor-balanza.saldos.request` (B6, los saldos), `balance-situacion.calcular.request`
 * (C1) y `cuenta-resultados.calcular.request` (C2) (los estados por sociedad),
 * `eliminacion-intercompany.eliminar.request` (I1, las eliminaciones intragrupo) y
 * `cola-declaraciones-criterio.fijar.request` (K9, el criterio declarado de consolidacion).
 * Esta hoja AGREGA, ELIMINA y declara el criterio aplicado; no inventa un estado donde
 * falta una sociedad.
 *
 * Honestidad (invariante 13): sin criterio declarado NO se consolida a ojo (cada criterio
 * — integracion global, proporcional... — da una cifra distinta): se declara en `abierto`.
 * Una sociedad sin estado recibido queda declarada como faltante; el agregado se declara
 * PARCIAL (no se presenta como completo).
 *
 * ESCUCHA (R3): el plan declara la escucha de `contabilidad.ejercicio_cerrado` (la
 * consolidacion va AL CIERRE). Su emisor (`cierre-ejercicio`, C4) aun NO existe: no se
 * declara (nadie lo emite todavia); se declarara cuando su emisor exista.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA (estados) → sin ui_handler.
 * Ver hoja I3 del plan-construccion y diseno-oop.md (CLASE Consolidacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class Consolidacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'consolidacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onEstadosRequest(e) {
    return this._atender(e, 'estados', 'consolidacion.estados.response', async (d) => {
      const res = await this._estados(d);
      // Reflejo: agrega; no escribe → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('consolidacion.estados.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // estados(sociedades) → estados del grupo con criterio declarado
  // ══════════════════════════════════════════════════════════════════════
  async _estados(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El criterio es DECLARADO (nunca cableado): sin criterio no se consolida a ojo.
    const criterio = input.criterio != null ? String(input.criterio).trim()
      : (input.criterio_consolidacion != null ? String(input.criterio_consolidacion).trim() : '');
    if (!criterio) {
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'consolidacion',
          consolidado: false,
          criterio: null,
          sociedades: [],
          abierto: { criterio: 'no se declaro el criterio de consolidacion (integracion global/proporcional...): no se consolida a ojo' }
        }
      };
    }

    const sociedades = Array.isArray(input.sociedades) ? input.sociedades
      : (Array.isArray(input.entidades) ? input.entidades : null);
    if (!sociedades) return this._invalid('sociedades');

    // Estados por sociedad: declarados o subidos por EVENTO (best-effort) a balance/resultado.
    const estados = [];
    const faltantes = [];
    for (const soc of sociedades) {
      const id = soc && (soc.sociedad_id != null ? soc.sociedad_id : soc.id);
      const estado = await this._estadoDe(input, soc);
      if (estado) {
        const pct = this._num(soc && (soc.participacion_pct != null ? soc.participacion_pct : soc.pct)) ;
        const peso = criterio === 'proporcional' ? (pct != null ? pct / 100 : null) : 1;
        estados.push({
          sociedad: id != null ? String(id) : null,
          participacion_pct: pct,
          peso_aplicado: peso,
          activo: this._pond(estado.activo, peso),
          pasivo: this._pond(estado.pasivo, peso),
          patrimonio: this._pond(estado.patrimonio, peso),
          ingreso: this._pond(estado.ingreso, peso),
          gasto: this._pond(estado.gasto, peso),
          resultado: this._pond(estado.resultado, peso)
        });
        if (criterio === 'proporcional' && peso == null) faltantes.push({ sociedad: String(id), motivo: 'sin participacion_pct declarada: no se puede ponderar (proporcional)' });
      } else {
        faltantes.push({ sociedad: id != null ? String(id) : null, motivo: 'no se recibio el estado de esta sociedad' });
      }
    }

    const suma = (k) => this._round(estados.reduce((t, e) => t + (this._num(e[k]) || 0), 0), 2);
    let activo = suma('activo'), pasivo = suma('pasivo'), patrimonio = suma('patrimonio');
    const ingreso = suma('ingreso'), gasto = suma('gasto'), resultado = suma('resultado');

    // Eliminaciones intercompany (I1) por EVENTO (best-effort): lo intragrupo NO se cuenta dos veces.
    const elim = await this._eliminacionesDe(input);
    activo = this._round(activo - (this._num(elim.activo) || 0), 2);
    pasivo = this._round(pasivo - (this._num(elim.pasivo) || 0), 2);
    patrimonio = this._round(patrimonio - (this._num(elim.patrimonio) || 0), 2);

    const parcial = faltantes.length > 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'consolidacion',
        consolidado: true,
        criterio,
        criterio_fuente: input.criterio != null ? 'declarado' : 'cola-declaraciones-criterio',
        sociedades: estados,
        total_sociedades: sociedades.length,
        activo,
        pasivo,
        patrimonio,
        ingreso,
        gasto,
        resultado: this._round(resultado, 2),
        eliminaciones: elim,
        // El agregado NO se presenta como completo si falta alguna sociedad.
        parcial,
        completo: !parcial,
        determinista: true,
        abierto: {
          faltantes: faltantes.length ? faltantes : null,
          eliminaciones: elim.fuente ? null : 'no se recibieron eliminaciones intercompany (I1): el agregado puede contar lo intragrupo dos veces'
        }
      }
    };
  }

  async _estadoDe(input, soc) {
    if (soc && soc.estado && typeof soc.estado === 'object') return soc.estado;
    const pid = input.project_id || this.project_id;
    const sid = soc && (soc.sociedad_id != null ? soc.sociedad_id : soc.id);
    const bal = await this._rpc('balance-situacion.calcular.request', { project_id: pid, sociedad_id: sid, ejercicio: input.ejercicio }, { timeout_ms: 800 });
    const res = await this._rpc('cuenta-resultados.calcular.request', { project_id: pid, sociedad_id: sid, ejercicio: input.ejercicio }, { timeout_ms: 800 });
    const b = bal && (bal.data || bal);
    const r = res && (res.data || res);
    if (!b && !r) return null;
    return {
      activo: this._num(b && b.activo) || 0,
      pasivo: this._num(b && b.pasivo) || 0,
      patrimonio: this._num(b && b.patrimonio_total != null ? b.patrimonio_total : (b && b.patrimonio)) || 0,
      ingreso: this._num(r && r.ingreso) || 0,
      gasto: this._num(r && r.gasto) || 0,
      resultado: this._num(r && (r.resultado != null ? r.resultado : (b && b.resultado))) || 0
    };
  }

  async _eliminacionesDe(input) {
    if (input.eliminaciones && typeof input.eliminaciones === 'object') {
      return { ...input.eliminaciones, fuente: 'declarado' };
    }
    const resp = await this._rpc('eliminacion-intercompany.eliminar.request', {
      project_id: input.project_id || this.project_id, sociedades: input.sociedades, ejercicio: input.ejercicio
    }, { timeout_ms: 800 });
    const d = resp && (resp.data || resp);
    if (d && typeof d === 'object' && (d.activo != null || d.pasivo != null || d.patrimonio != null)) {
      return { activo: d.activo, pasivo: d.pasivo, patrimonio: d.patrimonio, fuente: 'eliminacion-intercompany' };
    }
    return { activo: null, pasivo: null, patrimonio: null, fuente: null };
  }

  _pond(v, peso) {
    if (v == null || peso == null) return null;
    return this._round((this._num(v) || 0) * peso, 2);
  }

  _num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolEstados(params) { return this._estados(params); }
}

module.exports = Consolidacion;
