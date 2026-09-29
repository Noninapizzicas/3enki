/**
 * contabilidad-fiscal/modelo-390 — REFLEJO STATELESS (D3, hoja del plan).
 *
 * CONSTRUYE el resumen ANUAL (modelo 390) desde las LIQUIDACIONES del ejercicio (D1),
 * una por periodo declarado. Determinista: mismas liquidaciones + misma estructura
 * declarada → mismo resumen anual. NO liquida y NO recalcula asientos.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): la ESTRUCTURA del resumen anual (casillas y
 * su denominacion) es DECLARABLE (`estructura`, ParametroDeclarable); el FORMATO tambien
 * (`formato`, [ABIERTO]); y los PERIODOS del ejercicio son `ParametroDeclarable` — este
 * modulo NO cablea cuantos periodos tiene un ejercicio (mensual/trimestral es dato del
 * negocio), ni numeros de casilla, ni plazos, ni ejercicios concretos.
 *   - Con `estructura` declarada → `casillas:[{casilla, valor}]` rellenadas por `campo`.
 *   - Sin estructura declarada → `casillas:null`, `estructura_declarada:false`, con el
 *     ANUALIZADO (acumulado por concepto) para que el asesor decida el encaje. Jamas se
 *     inventan casillas ni denominaciones legales.
 *
 * La suma anual es determinista: se acumulan los conceptos del libro de cada liquidacion.
 * Los importes SON los de las liquidaciones; el sistema no estima ninguno.
 *
 * El sistema PREPARA el modelo; el ASESOR presenta y firma. Aqui NO se presenta ni firma.
 *
 * Las liquidaciones llegan por DOS vias, ninguna es un `require` cruzado:
 *   - declaradas en la peticion (`liquidaciones`),
 *   - pedidas a liquidacion-iva POR EVENTO (RPC `liquidacion-iva.calcular.request`, una
 *     por cada periodo DECLARADO en `periodos`).
 * Sin ninguna, NO se construye un resumen con importes inventados: se declara.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja D3 del plan-construccion y diseno-oop.md (CLASE Modelo390).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class Modelo390 extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'modelo-390';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'modelo-390.construir.response', async (d) => {
      const res = await this._construir(d);
      if (res.status !== 200) this.eventBus?.publish('modelo-390.construir.failed', res);
      return res;
    });
  }

  // ── CONSTRUIR: liquidaciones del ejercicio + estructura declarada → resumen anual ──
  async _construir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { liquidaciones, origen, periodos_pedidos } = await this._liquidaciones(pid, input);

    // Sin liquidaciones NO se construye un anual con importes inventados (invariante 7).
    if (!liquidaciones || liquidaciones.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          ejercicio: input.ejercicio != null ? input.ejercicio : null,
          modelo: null,
          construido: false,
          motivo: 'no hay liquidaciones del ejercicio: el resumen anual no se construye con importes inventados'
        }
      };
    }

    // ANUALIZADO determinista: se acumulan los conceptos del libro de cada liquidacion.
    const anual = {
      total_devengado: this._round(liquidaciones.reduce((s, l) => s + this._num(l.total_devengado, 0), 0), 2),
      total_soportado: this._round(liquidaciones.reduce((s, l) => s + this._num(l.total_soportado, 0), 0), 2)
    };
    anual.cuota = this._round(anual.total_devengado - anual.total_soportado, 2);

    // Detalle anual por lado y tipo DECLARADO (los tipos siguen siendo dato).
    const porTipo = { devengado: {}, soportado: {} };
    for (const l of liquidaciones) {
      const det = l.detalle || {};
      for (const lado of ['devengado', 'soportado']) {
        for (const it of (Array.isArray(det[lado]) ? det[lado] : [])) {
          const k = it.tipo != null ? String(it.tipo) : 'SIN_TIPO_DECLARADO';
          porTipo[lado][k] = this._round((porTipo[lado][k] || 0) + this._num(it.cuota, 0), 2);
        }
      }
    }

    const estructura = this._estructura(input.estructura);
    const formato = input.formato != null ? input.formato : null;   // declarable ([ABIERTO])

    const casillas = estructura ? estructura.map(c => ({
      casilla: c.casilla,
      etiqueta: c.etiqueta != null ? c.etiqueta : null,
      valor: this._valorDe(anual, porTipo, c.campo),
      campo: c.campo
    })) : null;

    const modelo = {
      modelo: '390',
      ejercicio: input.ejercicio != null ? input.ejercicio : null,
      regimen: liquidaciones[0] && liquidaciones[0].regimen != null ? liquidaciones[0].regimen : null,
      territorio: liquidaciones[0] && liquidaciones[0].territorio != null ? liquidaciones[0].territorio : null,
      formato,
      periodos_incluidos: liquidaciones.map(l => (l.periodo != null ? String(l.periodo) : null)),
      num_liquidaciones: liquidaciones.length,
      estructura_declarada: Boolean(estructura),
      casillas,
      // El anualizado por concepto SIEMPRE viaja: el asesor decide el encaje.
      datos: {
        total_devengado: anual.total_devengado,
        total_soportado: anual.total_soportado,
        cuota: anual.cuota,
        signo: anual.cuota > 0 ? 'A_INGRESAR' : (anual.cuota < 0 ? 'A_COMPENSAR_O_DEVOLVER' : 'NULA'),
        por_tipo: porTipo
      },
      // El sistema NO presenta ni firma: lo declara aqui, no lo asume.
      presentado: false,
      firmado: false,
      preparado_para_asesor: true
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        ejercicio: modelo.ejercicio,
        modelo,
        construido: true,
        origen_liquidaciones: origen,
        periodos_pedidos
      }
    };
  }

  // Las liquidaciones: declaradas en la peticion o pedidas a D1 POR EVENTO (una por periodo
  // DECLARADO). Sin periodos declarados no se inventan periodos: se devuelve vacio.
  async _liquidaciones(pid, input = {}) {
    if (Array.isArray(input.liquidaciones) && input.liquidaciones.length) {
      return { liquidaciones: input.liquidaciones, origen: 'declaradas_en_peticion', periodos_pedidos: null };
    }
    const periodos = Array.isArray(input.periodos) && input.periodos.length ? input.periodos : null;
    if (!periodos) {
      return { liquidaciones: [], origen: null, periodos_pedidos: null };
    }
    const out = [];
    for (const p of periodos) {
      const r = await this._rpc('liquidacion-iva.calcular.request', {
        project_id: pid,
        ejercicio: input.ejercicio ?? null,
        periodo: p,
        regimen: input.regimen ?? null,
        territorio: input.territorio ?? null,
        tipos: input.tipos ?? null
      }, { timeout_ms: 5000 });
      if (r && r.status === 200 && r.data) {
        out.push({ periodo: p, ...r.data });
      }
    }
    return { liquidaciones: out, origen: 'liquidacion-iva', periodos_pedidos: periodos };
  }

  // La estructura es DECLARABLE: array de {casilla, campo, etiqueta?}. Sin declarar → null.
  _estructura(raw) {
    if (!Array.isArray(raw)) return null;
    const est = raw
      .filter(c => c && c.casilla != null && c.campo != null)
      .map(c => ({
        casilla: String(c.casilla),
        campo: String(c.campo),
        etiqueta: c.etiqueta != null ? String(c.etiqueta) : null
      }));
    return est.length ? est : null;
  }

  // Rellena un campo del resumen desde el anualizado; campo ausente → null (desconocido).
  _valorDe(anual, porTipo, campo) {
    if (campo === 'total_devengado') return anual.total_devengado;
    if (campo === 'total_soportado') return anual.total_soportado;
    if (campo === 'cuota') return anual.cuota;
    if (campo.startsWith('devengado.') || campo.startsWith('soportado.')) {
      const [lado, tipo] = campo.split('.');
      const v = porTipo[lado] ? porTipo[lado][tipo] : undefined;
      return v !== undefined ? v : null;   // tipo no presente → null, no cero
    }
    return null;
  }

  _num(v, def) {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  // ── Tools ──
  toolConstruir(params) { return this._construir(params); }
}

module.exports = Modelo390;
