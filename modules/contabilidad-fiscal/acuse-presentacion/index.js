/**
 * contabilidad-fiscal/acuse-presentacion — PUENTE STATELESS (D13, hoja del plan).
 *
 * RECOGE Y LIGA el justificante/acuse que devuelve la ADMINISTRACION a su MODELO y a su ASIENTO.
 * Cierra el bucle hacia fuera, por evento.
 *
 * EL SISTEMA **NO PRESENTA**: la presentacion la hace el ASESOR en la sede de la administracion.
 * Aqui solo se ANOTA la respuesta que el asesor trae de vuelta: un acuse llega y este puente lo
 * LIGA a su modelo (D2/D3) y a su asiento (B2). Sin acuse no se inventa un justificante.
 *
 * LA LEY ENTRA COMO DATO (invariante 5): NO se cablea ningun formato de acuse, ni codigo de
 * administracion, ni codigo de justificante, ni plazo, ni ejercicio. El acuse entra TAL CUAL lo
 * devuelve la administracion (`datos`), y el `mapeo` (campo canonico → clave del acuse) es
 * DECLARABLE. Lo que no venga, queda `null` y se declara en `abierto` — jamas se estima.
 *
 * No custodia nada (el estado de la obligacion lo guarda estado-presentacion-fiscal D12, que este
 * puente NOTIFICA POR EVENTO). No muta el modelo ni el asiento: solo emite el enlace.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja D13 del plan-construccion y diseno-oop.md (CLASE AcusePresentacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos canonicos del acuse ligado. Su ORIGEN externo es declarable (mapeo).
const CAMPOS_ACUSE = ['justificante', 'fecha', 'administracion', 'modelo', 'ejercicio', 'periodo', 'resultado'];

class AcusePresentacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'acuse-presentacion';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onLigarRequest(e) {
    return this._atender(e, 'ligar', 'acuse-presentacion.ligar.response', async (d) => {
      const res = this._ligar(d);
      if (res.status === 200 && res.data.ligado) {
        // Exito → evento de dominio: el acuse quedo ligado a su modelo y a su asiento.
        this.eventBus?.publish('contabilidad.acuse_ligado', {
          project_id: res.data.project_id,
          acuse: res.data.acuse,
          modelo: res.data.acuse.modelo,
          asiento: res.data.asiento,
          justificante: res.data.acuse.justificante,
          // El sistema NO presento: el acuse lo trajo el asesor de la sede.
          presentado_por_sistema: false,
          correlation_id: d.correlation_id
        });
      } else if (res.status !== 200) {
        this.eventBus?.publish('acuse-presentacion.ligar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion: justificante de la administracion → enlace {acuse, modelo, asiento} ──
  _ligar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    // El acuse es lo que devuelve la administracion: se acepta TAL CUAL. Si falta, no se inventa.
    const datos = input.acuse || input.justificante_externo || null;
    if (!datos || typeof datos !== 'object') {
      return {
        status: 200,
        data: {
          project_id: pid,
          ligado: false,
          acuse: null,
          asiento: null,
          motivo: 'no hay acuse de la administracion: el sistema no presenta, solo anota lo que el asesor trae',
          presentado_por_sistema: false
        }
      };
    }

    const mapeo = (input.mapeo && typeof input.mapeo === 'object') ? input.mapeo : null;
    const acuse = this._aAcuse(datos, mapeo);

    // A QUE se liga: declarado (modelo / asiento) o derivado del propio acuse. Nunca inventado.
    const modelo_ref = input.modelo != null ? input.modelo
      : (acuse.modelo != null
        ? { modelo: acuse.modelo, ejercicio: acuse.ejercicio, periodo: acuse.periodo }
        : null);
    const asiento_ref = input.asiento != null ? input.asiento
      : (input.asiento_clave != null ? { clave: String(input.asiento_clave) } : null);

    // Sin justificante no hay acuse ligable: se declara, no se fabrica.
    if (acuse.justificante == null) {
      return {
        status: 200,
        data: {
          project_id: pid,
          ligado: false,
          acuse,
          asiento: null,
          motivo: 'el acuse no trae justificante: no se liga un justificante inventado',
          presentado_por_sistema: false
        }
      };
    }

    const enlace = {
      acuse,
      modelo: modelo_ref ? this._modeloRef(modelo_ref) : null,
      asiento: asiento_ref || null,
      // El puente NO muta: declara que ni el modelo ni el asiento se tocan.
      modelo_mutado: false,
      asiento_mutado: false,
      // El sistema NO presento: lo hizo el asesor. Se declara, no se asume.
      presentado_por_sistema: false,
      ligado_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        ligado: true,
        acuse: enlace.acuse,
        modelo: enlace.modelo,
        asiento: enlace.asiento,
        adaptador_declarado: Boolean(mapeo),
        abierto: acuse.abierto,
        presentado_por_sistema: false
      }
    };
  }

  // Traduce el justificante externo al acuse canonico con el mapeo DECLARADO.
  _aAcuse(datos, mapeo) {
    const value = {};
    const abierto = [];
    for (const campo of CAMPOS_ACUSE) {
      const clave = mapeo && mapeo[campo] != null ? String(mapeo[campo]) : campo;
      const raw = datos[clave];
      if (raw === undefined || raw === null || raw === '') {
        value[campo] = null;              // desconocido — NO se estima
        abierto.push(campo);
      } else {
        value[campo] = raw;
      }
    }
    // Los campos extra del acuse se conservan bajo `datos` (no se pierde nada).
    const conocidas = new Set(CAMPOS_ACUSE.map((c) => (mapeo && mapeo[c] != null ? String(mapeo[c]) : c)));
    const extra = {};
    for (const [k, v] of Object.entries(datos)) if (!conocidas.has(k)) extra[k] = v;
    value.datos = extra;
    value.abierto = abierto;
    return value;
  }

  _modeloRef(m) {
    return {
      modelo: m.modelo != null ? String(m.modelo) : null,
      ejercicio: m.ejercicio != null ? String(m.ejercicio) : null,
      periodo: m.periodo != null ? String(m.periodo) : null
    };
  }

  // ── Tools ──
  toolLigar(params) { return this._ligar(params); }
}

module.exports = AcusePresentacion;
