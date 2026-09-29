/**
 * contabilidad-fiscal/modelo-303 — REFLEJO STATELESS (D2, hoja del plan).
 *
 * CONSTRUYE el modelo 303 (autoliquidacion periodica del regimen de IVA/IGIC/IPSI) DESDE
 * la liquidacion (D1). Determinista: misma liquidacion + misma estructura declarada →
 * mismo modelo. NO liquida (eso es D1) y NO recalcula asientos.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): la ESTRUCTURA del modelo (que casillas tiene y
 * como se llaman) es DECLARABLE (`estructura`, `ParametroDeclarable`). Este modulo NO
 * cablea numeros de casilla, ni tipos, ni plazos, ni el ejercicio: solo RELLENA la
 * estructura que el negocio/asesor declara con los importes del libro.
 *   - Con `estructura` declarada → `casillas:[{casilla, valor}]` rellenadas por `campo`.
 *   - Sin `estructura` declarada → `casillas:null`, `estructura_declarada:false`, y se
 *     entrega el BORRADOR con los datos del libro para que el asesor decida el encaje.
 *     Jamas se inventan casillas ni denominaciones legales.
 *
 * El sistema PREPARA el modelo; el ASESOR presenta y firma. Aqui NO se presenta ni firma.
 *
 * La liquidacion llega por DOS vias, ninguna es un `require` cruzado:
 *   - declarada en la peticion (`liquidacion`),
 *   - pedida a liquidacion-iva POR EVENTO (RPC `liquidacion-iva.calcular.request`).
 * Si no hay ninguna, NO se construye un modelo con importes inventados: se declara.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja D2 del plan-construccion y diseno-oop.md (CLASE Modelo303).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class Modelo303 extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'modelo-303';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'modelo-303.construir.response', async (d) => {
      const res = await this._construir(d);
      if (res.status !== 200) this.eventBus?.publish('modelo-303.construir.failed', res);
      return res;
    });
  }

  // ── CONSTRUIR: liquidacion + estructura declarada → modelo (rellena, no inventa) ──
  async _construir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const liq = await this._liquidacion(pid, input);

    // Sin liquidacion NO se construye un modelo con importes inventados (invariante 7).
    if (!liq.liquidacion) {
      return {
        status: 200,
        data: {
          project_id: pid,
          ejercicio: input.ejercicio != null ? input.ejercicio : null,
          periodo: input.periodo != null ? String(input.periodo) : null,
          modelo: null,
          construido: false,
          motivo: 'no hay liquidacion disponible: el modelo no se construye con importes inventados'
        }
      };
    }

    const liquidacion = liq.liquidacion;
    const estructura = this._estructura(input.estructura);
    const formato = input.formato != null ? input.formato : null;   // declarable ([ABIERTO])

    // Con estructura declarada: se rellena casilla a casilla desde los campos del libro.
    const casillas = estructura ? estructura.map(c => ({
      casilla: c.casilla,
      etiqueta: c.etiqueta != null ? c.etiqueta : null,
      valor: this._valorDe(liquidacion, c.campo),
      campo: c.campo
    })) : null;

    const modelo = {
      modelo: '303',
      ejercicio: input.ejercicio != null ? input.ejercicio : null,
      periodo: input.periodo != null ? String(input.periodo) : null,
      regimen: liquidacion.regimen != null ? liquidacion.regimen : null,
      territorio: liquidacion.territorio != null ? liquidacion.territorio : null,
      formato,
      estructura_declarada: Boolean(estructura),
      casillas,
      // El borrador con los datos del libro SIEMPRE viaja: el asesor decide el encaje.
      datos: {
        total_devengado: liquidacion.total_devengado,
        total_soportado: liquidacion.total_soportado,
        cuota: liquidacion.cuota,
        signo: liquidacion.signo
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
        periodo: modelo.periodo,
        modelo,
        construido: true,
        origen_liquidacion: liq.origen
      }
    };
  }

  // La liquidacion: declarada en la peticion o pedida a D1 POR EVENTO. Nunca inventada.
  async _liquidacion(pid, input = {}) {
    if (input.liquidacion && typeof input.liquidacion === 'object') {
      return { liquidacion: input.liquidacion, origen: 'declarada_en_peticion' };
    }
    const r = await this._rpc('liquidacion-iva.calcular.request', {
      project_id: pid,
      ejercicio: input.ejercicio ?? null,
      periodo: input.periodo ?? null,
      regimen: input.regimen ?? null,
      territorio: input.territorio ?? null,
      tipos: input.tipos ?? null
    }, { timeout_ms: 5000 });
    if (r && r.status === 200 && r.data) {
      return { liquidacion: r.data, origen: 'liquidacion-iva' };
    }
    return { liquidacion: null, origen: null };
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

  // Rellena un campo del modelo desde la liquidacion; campo ausente → null (desconocido).
  _valorDe(liquidacion, campo) {
    if (campo === 'total_devengado') return liquidacion.total_devengado ?? null;
    if (campo === 'total_soportado') return liquidacion.total_soportado ?? null;
    if (campo === 'cuota') return liquidacion.cuota ?? null;
    if (campo === 'signo') return liquidacion.signo ?? null;
    if (campo.startsWith('devengado.') || campo.startsWith('soportado.')) {
      const [lado, tipo] = campo.split('.');
      const lista = (liquidacion.detalle && Array.isArray(liquidacion.detalle[lado])) ? liquidacion.detalle[lado] : [];
      const hit = lista.find(x => String(x.tipo) === String(tipo));
      return hit ? hit.cuota : null;   // tipo no presente → null, no cero
    }
    return null;
  }

  // ── Tools ──
  toolConstruir(params) { return this._construir(params); }
}

module.exports = Modelo303;
