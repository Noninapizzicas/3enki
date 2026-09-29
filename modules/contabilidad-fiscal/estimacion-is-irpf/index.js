/**
 * contabilidad-fiscal/estimacion-is-irpf — REFLEJO STATELESS (D5, hoja del plan).
 *
 * ESTIMA la cuota del Impuesto sobre Sociedades (IS) o del IRPF segun el REGIMEN
 * DECLARADO por el negocio, partiendo del RESULTADO contable del ejercicio (C2,
 * cuenta-resultados). NO determina la base fiscal por su cuenta ni recalcula asientos.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): aqui NO se cablea NINGUNA escala, NINGUN tramo,
 * NINGUN tipo y NINGUN modulo de estimacion objetiva. Todo eso llega DECLARADO
 * (`base`, `escalas`, `tramos`, `ajustes` — ParametroDeclarable por negocio y ejercicio).
 *
 *   - Sin `base` declarada → NO se estima: `estimado:false`, `motivo` declarado,
 *     `cuota:null` (invariante 7: nada se estima sin base declarada).
 *   - Con `base` y `tramos` declarados → se aplica la escala declarada de forma
 *     determinista (por tramos), SIN conocer la ley: los limites y los tipos son datos.
 *   - Con `base` y `tipo` unico declarado → tramo unico.
 *   - Con `base` declarada y SIN escala/tipo → se entrega la base imponible declarada y
 *     `cuota:null` (el sistema no inventa el tipo).
 *
 * El resultado contable llega por DOS vias, ninguna es un `require` cruzado:
 *   - declarado en la peticion (`resultado`),
 *   - pedido a cuenta-resultados POR EVENTO (RPC `cuenta-resultados.calcular.request`).
 *
 * El sistema PREPARA la estimacion; el ASESOR presenta y firma. Aqui NO se presenta ni firma.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja D5 del plan-construccion y diseno-oop.md (CLASE EstimacionIsIrpf).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class EstimacionIsIrpf extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estimacion-is-irpf';
    this.version = 'reflejo-0.1.0';
    // espejo en memoria del resultado contable publicado por el diario: pid -> acumulado
    this._espejo = new Map();
    // ultima base/escala DECLARADA por proyecto (dato; no se inventa ninguna)
    this._declarado = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── fire-and-forget: asiento registrado → se refleja la muestra (no estima nada) ──
  onAsientoRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    const asiento = d.asiento;
    if (!pid || !asiento || typeof asiento !== 'object') return null;
    // Sin base declarada no hay estimacion: aqui solo se refleja la muestra del libro.
    const m = this._espejoDe(pid);
    const clave = asiento.clave_natural != null ? String(asiento.clave_natural)
      : (asiento.numero != null ? String(asiento.numero) : null);
    if (clave) m.set(clave, asiento);
    return null;
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onEstimarRequest(e) {
    return this._atender(e, 'estimar', 'estimacion-is-irpf.estimar.response', async (d) => {
      const res = await this._estimar(d);
      if (res.status !== 200) this.eventBus?.publish('estimacion-is-irpf.estimar.failed', res);
      return res;
    });
  }

  // ── ESTIMAR: resultado contable + base/escala DECLARADAS → estimacion (nada sin base) ──
  async _estimar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const res = await this._resultado(pid, input);
    const regimen = input.regimen != null ? String(input.regimen) : null;   // declarable (IS | IRPF)
    const base = this._base(input.base);

    // Sin BASE declarada NO se estima (invariante 7): se declara y se devuelve cuota null.
    if (!base || base.imponible === null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          ejercicio: input.ejercicio != null ? input.ejercicio : null,
          regimen,
          origen_resultado: res.origen,
          resultado_contable: res.resultado,
          base_declarada: null,
          estimado: false,
          cuota: null,
          motivo: 'no hay base imponible declarada: nada se estima sin base (invariante 7)'
        }
      };
    }

    const escala = this._escala(input.escalas, input.tramos, input.tipo);
    const ajustes = this._ajustes(input.ajustes);
    const base_ajustada = this._round(base.imponible + ajustes, 2);

    // Con escala/tramos DECLARADOS: se aplican por tramos (determinista; la ley es el dato).
    const cuota = escala ? this._aplicarEscala(base_ajustada, escala) : null;

    const estimacion = {
      regimen,
      base: {
        imponible: base.imponible,
        ajustes_declarados: ajustes,
        imponible_ajustada: base_ajustada
      },
      escala: escala ? { tramos: escala, origen: 'declarada' } : null,
      cuota,                                    // null si no hay escala/tipo declarado
      tipo_efectivo: (cuota !== null && base_ajustada !== 0) ? this._round(cuota / base_ajustada, 6) : null,
      // El sistema NO presenta ni firma la estimacion: lo declara aqui.
      presentada: false,
      firmada: false,
      preparada_para_asesor: true
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: input.ejercicio != null ? input.ejercicio : null,
        regimen,
        origen_resultado: res.origen,
        resultado_contable: res.resultado,
        base_declarada: base,
        estimado: true,
        cuota,
        estimacion,
        motivo: escala ? null : 'hay base declarada pero no escala/tipo declarado: el sistema no inventa el tipo'
      }
    };
  }

  // El resultado: declarado en la peticion o pedido a cuenta-resultados POR EVENTO.
  async _resultado(pid, input = {}) {
    if (input.resultado !== undefined && input.resultado !== null) {
      const n = Number(input.resultado);
      return { resultado: Number.isFinite(n) ? n : null, origen: 'declarado_en_peticion' };
    }
    const r = await this._rpc('cuenta-resultados.calcular.request',
      { project_id: pid, ejercicio: input.ejercicio ?? null }, { timeout_ms: 5000 });
    if (r && r.status === 200 && r.data && r.data.resultado !== undefined) {
      return { resultado: Number(r.data.resultado), origen: 'cuenta-resultados' };
    }
    return { resultado: null, origen: null };
  }

  // La base imponible es DECLARADA. Sin base declarada → null (no se deriva del resultado).
  _base(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const n = Number(raw.imponible);
    if (!Number.isFinite(n)) return null;
    return { imponible: n, origen: 'declarada' };
  }

  // Los ajustes extracontables son DECLARADOS. Sin declarar → 0 (neutro, no un ajuste inventado).
  _ajustes(raw) {
    if (Array.isArray(raw)) {
      return this._round(raw.reduce((s, a) => {
        const n = Number(a && a.importe);
        return s + (Number.isFinite(n) ? n : 0);
      }, 0), 2);
    }
    const n = Number(raw);
    return Number.isFinite(n) ? this._round(n, 2) : 0;
  }

  // La escala/tramos es DECLARABLE: [ {hasta, tipo} ] o un tipo unico declarado.
  // Sin escala ni tipo → null (jamas se cablea una escala legal).
  _escala(escalas, tramos, tipo) {
    const raw = Array.isArray(escalas) ? escalas : (Array.isArray(tramos) ? tramos : null);
    if (raw) {
      const esc = raw
        .filter(t => t && t.tipo != null)
        .map(t => ({
          hasta: t.hasta != null && t.hasta !== '' ? Number(t.hasta) : null,   // null = tramo final abierto
          tipo: Number(t.tipo)
        }))
        .filter(t => Number.isFinite(t.tipo));
      if (esc.length) {
        // Orden determinista por limite superior; el abierto (null) va al final.
        return esc.sort((a, b) => {
          if (a.hasta === null) return 1;
          if (b.hasta === null) return -1;
          return a.hasta - b.hasta;
        });
      }
    }
    if (tipo !== undefined && tipo !== null && tipo !== '') {
      const t = Number(tipo);
      if (Number.isFinite(t)) return [{ hasta: null, tipo: t }];
    }
    return null;
  }

  // Aplica la escala DECLARADA por tramos, de forma determinista.
  _aplicarEscala(base, escala) {
    let restante = base;
    let anterior = 0;
    let cuota = 0;
    for (const tramo of escala) {
      if (restante <= 0) break;
      const limite = tramo.hasta === null ? Infinity : tramo.hasta;
      const ancho = limite - anterior;
      const gravado = Math.min(restante, ancho);
      cuota += gravado * tramo.tipo;
      restante -= gravado;
      anterior = limite;
    }
    return this._round(cuota, 2);
  }

  _espejoDe(pid) {
    let m = this._espejo.get(pid);
    if (!m) { m = new Map(); this._espejo.set(pid, m); }
    return m;
  }

  // ── Tools ──
  toolEstimar(params) { return this._estimar(params); }
}

module.exports = EstimacionIsIrpf;
